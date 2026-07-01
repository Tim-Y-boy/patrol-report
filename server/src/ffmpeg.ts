/**
 * FFmpeg 视频转码模块
 * - 检测 H.265/HEVC 视频
 * - 转码为浏览器兼容的 H.264
 * - 磁盘缓存（LRU 淘汰 + TTL 过期）
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, mkdir, rm, stat, readdir, utimes } from 'fs/promises';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

// ---------- 缓存配置 ----------
const CACHE_DIR = path.join(process.cwd(), 'cache', 'video');
const MAX_CACHE_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000;  // 7 天

// ---------- FFmpeg 路径缓存 ----------
let ffmpegPath: string | null = null;
let ffprobePath: string | null = null;
let ffmpegAvailable: boolean | null = null; // null = 未检测

/**
 * 查找 FFmpeg 和 ffprobe
 * Windows 常见路径：PATH / scoop / winget / 手动安装
 */
async function findFfmpeg(): Promise<{ ffmpeg: string; ffprobe: string }> {
  if (ffmpegPath && ffprobePath) return { ffmpeg: ffmpegPath, ffprobe: ffprobePath };

  const isWin = process.platform === 'win32';
  const exeSuffix = isWin ? '.exe' : '';

  const possibleDirs = [
    '', // 系统 PATH
    path.join(os.homedir(), 'scoop', 'apps', 'ffmpeg', 'current', 'bin'),
    'C:\\ffmpeg\\bin',
    '/usr/local/bin',
    '/usr/bin',
  ];

  for (const dir of possibleDirs) {
    const ffmpeg = path.join(dir, `ffmpeg${exeSuffix}`);
    const ffprobe = path.join(dir, `ffprobe${exeSuffix}`);
    try {
      const { stdout } = await execFileAsync(ffmpeg, ['-version'], { timeout: 5000 });
      console.log('[ffmpeg] 已找到:', ffmpeg);
      console.log('[ffmpeg] 版本:', stdout.split('\n')[0]?.trim());
      ffmpegPath = ffmpeg;
      ffprobePath = ffprobe;
      ffmpegAvailable = true;
      return { ffmpeg, ffprobe };
    } catch {
      // 继续尝试下一个路径
    }
  }

  ffmpegAvailable = false;
  throw new Error(
    'FFmpeg 未安装。Windows: winget install ffmpeg  或  scoop install ffmpeg\n' +
    'macOS: brew install ffmpeg   Linux: apt install ffmpeg'
  );
}

/**
 * 检查 FFmpeg 是否可用（不抛异常）
 */
export async function isFfmpegAvailable(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    await findFfmpeg();
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取视频编码格式（用于判断浏览器能否直接播放）
 * 返回小写 codec 名称，如 "h264"、"hevc"、"vp9"、"av1"
 * 探测失败返回 null
 */
export async function getVideoCodec(filePath: string): Promise<string | null> {
  const { ffprobe } = await findFfmpeg();
  try {
    const { stdout } = await execFileAsync(ffprobe, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name',
      '-of', 'csv=p=0',
      filePath,
    ], { timeout: 10000 });
    const codec = stdout.trim().toLowerCase();
    return codec || null; // 空字符串视为探测失败
  } catch {
    return null;
  }
}

/**
 * H.265 → H.264 转码
 * ultrafast preset: 优先速度，文件会比原文件略大但转码极快
 * -an: 去掉音轨（监控视频通常无有用音频，节省体积）
 * +faststart: moov atom 前置，浏览器可边下边播
 */
export async function transcodeToH264(inputPath: string, outputPath: string): Promise<void> {
  const { ffmpeg } = await findFfmpeg();
  const startTime = Date.now();

  await execFileAsync(ffmpeg, [
    '-y',                       // 覆盖已有输出文件
    '-i', inputPath,
    '-c:v', 'libx264',          // H.264 编码
    '-preset', 'ultrafast',     // 最快编码速度
    '-crf', '26',               // 质量：28=较小, 23=默认, 18=近无损
    '-an',                      // 去掉音频
    '-movflags', '+faststart',  // Web 优化
    outputPath,
  ], { timeout: 120000 });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[ffmpeg] 转码完成，耗时 ${elapsed}s`);
}

// ---------- 缩略图 ----------

/**
 * 从视频文件抽取帧作为 JPEG 缩略图，保存到缓存目录
 * 使用 ffprobe 获取时长，跳到 20% 位置取帧（避免开头黑屏）
 * 静默失败（缩略图不是关键路径）
 */
async function generateThumbnail(videoPath: string, fileToken: string): Promise<void> {
  await ensureCacheDir();
  const thumbPath = path.join(CACHE_DIR, `${fileToken}.jpg`);
  try {
    await stat(thumbPath);
    return; // 已存在
  } catch {}

  const { ffmpeg, ffprobe } = await findFfmpeg();

  // 获取视频时长（秒），用于计算非开头的截图位置
  let seekSec = 3; // 默认第 3 秒
  try {
    const { stdout } = await execFileAsync(ffprobe, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      videoPath,
    ], { timeout: 5000 });
    const dur = parseFloat(stdout.trim());
    if (dur > 0) {
      seekSec = Math.max(1, Math.round(dur * 0.2)); // 20% 位置，至少 1 秒
    }
  } catch {
    // ffprobe 失败用默认值
  }

  try {
    const startTime = Date.now();
    await execFileAsync(ffmpeg, [
      '-y',
      '-ss', String(seekSec),  // ⚠️ -ss 在 -i 前面：关键帧快速定位，避免解码黑帧
      '-i', videoPath,
      '-vframes', '1',         // 只取 1 帧
      '-q:v', '5',             // JPEG 质量（1-31，越小越好）
      thumbPath,
    ], { timeout: 15000 });
    console.log(`[ffmpeg] 缩略图 ${fileToken.slice(0, 10)}... seek=${seekSec}s (${Date.now() - startTime}ms)`);
  } catch (err: any) {
    // 缩略图失败不影响视频播放
    console.warn(`[ffmpeg] 缩略图失败 ${fileToken.slice(0, 10)}...: ${err.message?.slice(0, 80)}`);
  }
}

/**
 * 读取已缓存的缩略图
 */
export async function getCachedThumbnail(fileToken: string): Promise<Buffer | null> {
  await ensureCacheDir();
  try {
    return await readFile(path.join(CACHE_DIR, `${fileToken}.jpg`));
  } catch {
    return null;
  }
}

/**
 * 从内存中的视频 Buffer 生成缩略图（用于内存缓存命中时补生成）
 * 写入临时文件 → 抽取帧 → 清理临时文件
 */
export async function ensureThumbnailFromBuffer(fileToken: string, data: Buffer): Promise<void> {
  await ensureCacheDir();
  const thumbPath = path.join(CACHE_DIR, `${fileToken}.jpg`);
  try { await stat(thumbPath); return; } catch {}

  const tmpVideo = path.join(CACHE_DIR, `_tmp_${fileToken}.mp4`);
  try {
    await writeFile(tmpVideo, data);
    await generateThumbnail(tmpVideo, fileToken);
  } finally {
    await rm(tmpVideo, { force: true }).catch(() => {});
  }
}

// ---------- 磁盘缓存管理 ----------

let cacheDirReady = false;

async function ensureCacheDir(): Promise<void> {
  if (cacheDirReady) return;
  await mkdir(CACHE_DIR, { recursive: true });
  cacheDirReady = true;
}

/**
 * 启动时清理过期缓存
 */
export async function cleanExpiredCache(): Promise<void> {
  try {
    await ensureCacheDir();
    const files = await readdir(CACHE_DIR);
    const now = Date.now();
    let deleted = 0;

    for (const f of files) {
      try {
        const s = await stat(path.join(CACHE_DIR, f));
        if (now - s.mtimeMs > MAX_CACHE_AGE) {
          await rm(path.join(CACHE_DIR, f), { force: true });
          deleted++;
        }
      } catch { /* 文件可能已被删除 */ }
    }

    if (deleted > 0) {
      console.log(`[ffmpeg] 启动清理: 删除 ${deleted} 个过期缓存文件`);
    }
  } catch {
    // 缓存目录可能还不存在，忽略
  }
}

/**
 * 获取缓存目录总大小
 */
async function getCacheTotalSize(): Promise<number> {
  try {
    const files = await readdir(CACHE_DIR);
    let total = 0;
    for (const f of files) {
      try {
        const s = await stat(path.join(CACHE_DIR, f));
        total += s.size;
      } catch { /* 忽略 */ }
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * LRU 淘汰：删除最旧文件直到腾出 neededBytes 空间
 */
async function evictCache(neededBytes: number): Promise<void> {
  try {
    const files = await readdir(CACHE_DIR);
    if (files.length === 0) return;

    const stats = await Promise.all(
      files.map(async (f) => {
        try {
          const s = await stat(path.join(CACHE_DIR, f));
          return { name: f, mtime: s.mtimeMs, size: s.size };
        } catch {
          return null;
        }
      })
    );

    const valid = stats.filter(Boolean) as Array<{ name: string; mtime: number; size: number }>;
    valid.sort((a, b) => a.mtime - b.mtime); // 最旧排最前

    let freed = 0;
    for (const f of valid) {
      if (freed >= neededBytes) break;
      await rm(path.join(CACHE_DIR, f.name), { force: true });
      freed += f.size;
      console.log(`[ffmpeg] 淘汰缓存: ${f.name} (${(f.size / 1048576).toFixed(1)} MB)`);
    }
  } catch { /* 忽略清理错误 */ }
}

/**
 * 尝试读取转码缓存
 */
export async function getCachedVideo(fileToken: string): Promise<Buffer | null> {
  await ensureCacheDir();
  const cachePath = path.join(CACHE_DIR, `${fileToken}.mp4`);
  try {
    const s = await stat(cachePath);
    if (Date.now() - s.mtimeMs > MAX_CACHE_AGE) {
      await rm(cachePath, { force: true });
      return null;
    }
    // 更新 mtime（标记为最近使用，防止被 LRU 淘汰）
    const now = new Date();
    await utimes(cachePath, now, now).catch(() => {});
    return await readFile(cachePath);
  } catch {
    return null;
  }
}

/**
 * 保存转码结果到磁盘缓存
 */
export async function cacheVideo(fileToken: string, data: Buffer): Promise<void> {
  await ensureCacheDir();

  // 检查总大小，必要时淘汰
  const totalSize = await getCacheTotalSize();
  if (totalSize + data.length > MAX_CACHE_SIZE) {
    const needed = totalSize + data.length - MAX_CACHE_SIZE;
    await evictCache(needed);
  }

  const cachePath = path.join(CACHE_DIR, `${fileToken}.mp4`);
  await writeFile(cachePath, data);
}

/**
 * 处理视频：检测编码 → 非 H.264 则转码 H.264 → 缓存
 * 如果 FFmpeg 不可用，返回原始数据
 * 如果已是 H.264，直接返回（浏览器兼容）
 */
export async function maybeTranscodeVideo(
  fileToken: string,
  data: Buffer,
  contentType: string,
): Promise<{ data: Buffer; contentType: string }> {
  // 非视频不处理
  if (!contentType.startsWith('video/')) {
    return { data, contentType };
  }

  // FFmpeg 不可用则跳过
  if (!(await isFfmpegAvailable())) {
    console.warn('[ffmpeg] FFmpeg 不可用，视频直接返回（浏览器可能无法播放）');
    return { data, contentType };
  }

  // 检查磁盘缓存
  const cached = await getCachedVideo(fileToken);
  if (cached) {
    console.log(`[ffmpeg] 命中转码缓存 token=${fileToken.slice(0, 10)}... (${(cached.length / 1048576).toFixed(1)} MB)`);
    return { data: cached, contentType: 'video/mp4' };
  }

  // 写入临时文件供 ffprobe/ffmpeg 使用
  const tmpDir = path.join(os.tmpdir(), 'patrol-ffmpeg');
  await mkdir(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, `source_${fileToken.slice(0, 16)}.mp4`);

  try {
    await writeFile(tmpPath, data);

    // 检测编码：不是 H.264 就转码（浏览器只支持 H.264）
    const codec = await getVideoCodec(tmpPath);
    if (codec === 'h264') {
      console.log(`[ffmpeg] H.264 视频，浏览器兼容，跳过转码 token=${fileToken.slice(0, 10)}...`);
      // 从临时文件抽取缩略图（await 因为 tmpPath 即将被清理）
      await generateThumbnail(tmpPath, fileToken);
      return { data, contentType };
    }

    // H.265 / VP9 / AV1 / 未知编码 → 统一转 H.264
    const srcSizeMB = (data.length / 1048576).toFixed(1);
    const reason = codec ? `编码=${codec}` : '编码探测失败';
    console.log(`[ffmpeg] ${reason}，开始转码 token=${fileToken.slice(0, 10)}... 源=${srcSizeMB} MB`);

    const outPath = path.join(tmpDir, `out_${fileToken.slice(0, 16)}.mp4`);
    await transcodeToH264(tmpPath, outPath);

    const transcoded = await readFile(outPath);
    const ratio = ((1 - transcoded.length / data.length) * 100).toFixed(0);
    console.log(`[ffmpeg] 转码完成 token=${fileToken.slice(0, 10)}... ${srcSizeMB} MB → ${(transcoded.length / 1048576).toFixed(1)} MB (${ratio}%)`);

    // 持久化缓存
    await cacheVideo(fileToken, transcoded);

    // 从持久化缓存文件异步生成缩略图（fire-and-forget，文件已落盘不会丢失）
    const cachedPath = path.join(CACHE_DIR, `${fileToken}.mp4`);
    generateThumbnail(cachedPath, fileToken).catch(() => {});

    return { data: transcoded, contentType: 'video/mp4' };
  } finally {
    // 清理临时文件
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

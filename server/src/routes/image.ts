import { Router, Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, readdir, rm, mkdir } from 'fs/promises';
import path from 'path';
import os from 'os';
import axios from 'axios';
import http from 'http';
import https from 'https';
import { config } from '../config.js';
import { getTenantToken } from '../feishu/client.js';
import { maybeTranscodeVideo, cleanExpiredCache, getCachedThumbnail, ensureThumbnailFromBuffer } from '../ffmpeg.js';

const execFileAsync = promisify(execFile);

const router = Router();

// 可见的错误占位图（灰色带 ⚠ 图标），下载失败时返回，触发前端 @error → 重试按钮
const ERROR_PLACEHOLDER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAACXBIWXMAAAsTAAALEwEAmpwYAAABiklEQVR4nO3aMUoDQRSG4W9FRRBCwMZKLCwstPIIHsCj2FpYegLPYOMNbGxsbLyCla2NhZWFhYUgCP5PMgObZXdnd2bezD7wfTDFl5nZ2QQIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgBBX0VQAQA8AAAAASUVORK5CYII=',
  'base64'
);

const imageCache = new Map<string, { data: Buffer; contentType: string }>();
const FAILED = new Map<string, number>();
const FAILED_TTL = 120000;
const MAX_CACHE = 300;

let running = 0;
const MAX_RUNNING = 8;
const hiPend: Array<() => void> = []; // 高优先级：浏览器请求（用户正在看的）
const loPend: Array<() => void> = []; // 低优先级：预加载（后台静默）
function next() {
  // 优先从高优队列取，低优队列只在无高优时放行
  const nextFn = hiPend.shift() || loPend.shift();
  if (nextFn && running < MAX_RUNNING) { running++; setTimeout(nextFn, 100); }
}
function lock(priority: 'high' | 'low' = 'high'): Promise<void> {
  return new Promise(r => {
    if (running < MAX_RUNNING) { running++; r(); }
    else { (priority === 'low' ? loPend : hiPend).push(r); }
  });
}
function unlock() { running--; next(); }

// ---------- REST API 下载（含 extra 参数，支持高级权限多维表格）----------

const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 60000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 60000,
});

/**
 * 使用 REST API 下载（利用飞书返回的带 extra 鉴权的 URL）
 * 适用于开启了高级权限的多维表格
 */
async function downloadViaRestApi(downloadUrl: string, fileToken: string): Promise<{ data: Buffer; contentType: string }> {
  const token = await getTenantToken();
  const shortToken = fileToken.slice(0, 10);
  console.log(`[image] REST API 下载 token=${shortToken}... (含 extra 参数)`);

  const res = await axios({
    method: 'GET',
    url: downloadUrl,
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'arraybuffer',
    timeout: 60000,
    httpAgent,
    httpsAgent,
  });

  const data = Buffer.from(res.data);
  const contentType = String(res.headers['content-type'] || 'application/octet-stream');
  console.log(`[image] REST API 下载成功 token=${shortToken}... size=${data.length} type=${contentType}`);
  return { data, contentType };
}

/**
 * 尝试使用 lark-cli 下载（以用户身份，绕过应用权限限制）
 */
async function downloadViaLarkCli(fileToken: string, recordId: string): Promise<{ data: Buffer; contentType: string }> {
  // 动态查找 lark-cli 路径：先查环境变量，再尝试常见路径
  const possiblePaths = [
    process.env.LARK_CLI_PATH,
    path.join(os.homedir(), '.workbuddy/binaries/node/cli-connector-packages/node_modules/@larksuite/cli/scripts/run.js'),
  ].filter(Boolean) as string[];

  let cliScript: string | null = null;
  for (const p of possiblePaths) {
    try { await readFile(p); cliScript = p; break; } catch {}
  }
  if (!cliScript) {
    throw new Error('lark-cli 未找到，请设置环境变量 LARK_CLI_PATH 指向 @larksuite/cli/scripts/run.js');
  }

  const dirName = `fsimg_${Date.now()}`;
  const tmpDir = os.tmpdir();
  const outDir = path.join(tmpDir, dirName);
  await mkdir(outDir, { recursive: true });

  const nodeExe = process.execPath;
  const shortToken = fileToken.slice(0, 10);
  console.log(`[image] lark-cli 开始下载 token=${shortToken}... record=${recordId}`);
  try {
    const { stdout, stderr } = await execFileAsync(nodeExe, [
      cliScript,
      'base', '+record-download-attachment',
      '--base-token', config.feishu.baseToken,
      '--table-id', config.tables.inspection,
      '--record-id', recordId,
      '--file-token', fileToken,
      '--output', `./${dirName}/`,
      '--as', 'user',
    ], { timeout: 120000, windowsHide: true, cwd: tmpDir });

    if (stderr) console.log(`[image] lark-cli stderr token=${shortToken}...:`, stderr.slice(0, 300));

    const allFiles = await readdir(outDir);
    const realFiles = allFiles.filter(f => !f.startsWith('.') && !f.endsWith('.tmp'));
    const targetFile = realFiles.length > 0 ? realFiles[0] : allFiles[0];
    if (!targetFile) throw new Error('lark-cli 执行完成但输出目录为空');

    const data = await readFile(path.join(outDir, targetFile));
    const ct = detectContentType(data, path.extname(targetFile));
    console.log(`[image] lark-cli 下载成功 token=${shortToken}... file=${targetFile} realSize=${data.length} type=${ct}`);
    return { data, contentType: ct };
  } catch (err: any) {
    const msg = err.stderr?.slice(0, 500) || err.message?.slice(0, 500) || String(err);
    console.error(`[image] lark-cli 下载失败 token=${shortToken}... record=${recordId}: ${msg}`);
    throw err;
  } finally {
    rm(outDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** 根据 magic bytes 检测真实文件类型 */
function detectContentType(data: Buffer, ext: string): string {
  if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) return 'image/jpeg';
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) return 'image/png';
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return 'image/gif';
  if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46) return 'image/webp';
  if (data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70) return 'video/mp4';
  if (ext === '.mp4' || ext === '.mov' || ext === '.webm') return 'video/mp4';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
}

/**
 * 下载附件：优先使用带 extra 参数的 REST API URL，不可用时回退到 lark-cli
 */
async function downloadAttachment(fileToken: string, recordId: string, downloadUrl?: string): Promise<{ data: Buffer; contentType: string }> {
  // 1. 优先使用飞书返回的预签名 URL（含 extra 鉴权，支持高级权限表格）
  if (downloadUrl) {
    try {
      return await downloadViaRestApi(downloadUrl, fileToken);
    } catch (err: any) {
      const feishuCode = err.response?.data ? (() => {
        try { return JSON.parse(Buffer.isBuffer(err.response.data) ? err.response.data.toString('utf-8') : '').code; } catch { return undefined; }
      })() : undefined;
      console.warn(`[image] REST API 失败 (code=${feishuCode}, status=${err.response?.status}), 回退到 lark-cli...`);
    }
  }

  // 2. 回退：lark-cli（用户身份）
  return await downloadViaLarkCli(fileToken, recordId);
}

/**
 * 预加载图片/视频到内存缓存（后台调用，不阻塞响应）
 * 已在缓存中或正在下载中的会跳过，失败静默处理
 */
export async function preloadImage(fileToken: string, recordId: string, downloadUrl?: string): Promise<void> {
  // 已在缓存中，跳过
  if (imageCache.has(fileToken)) return;
  // 无有效下载方式，跳过
  if (!downloadUrl && !recordId) return;

  const shortToken = fileToken.slice(0, 10);
  try {
    await lock('low'); // 低优先级：不跟用户正在看的图片抢槽位
    // 双重检查：拿到锁后可能已被其他请求下载完成
    if (imageCache.has(fileToken)) return;

    const { data, contentType } = await downloadAttachment(fileToken, recordId, downloadUrl);

    if (imageCache.size >= MAX_CACHE) {
      const k = imageCache.keys().next().value;
      if (k) imageCache.delete(k);
    }
    imageCache.set(fileToken, { data, contentType });
    console.log(`[image] 预加载完成 token=${shortToken}... size=${data.length} type=${contentType}`);
  } catch (err: any) {
    console.warn(`[image] 预加载失败 token=${shortToken}...: ${err.message?.slice(0, 100)}`);
  } finally {
    unlock();
  }
}

function sendFileResponse(res: Response, data: Buffer, contentType: string, asDownload = false) {
  const disposition = asDownload ? 'attachment' : 'inline';
  const range = res.req.headers.range;

  if (range && !asDownload) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : data.length - 1;
    const chunkSize = end - start + 1;

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${data.length}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', chunkSize);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=1800');
    res.setHeader('Content-Disposition', disposition);
    res.send(data.subarray(start, end + 1));
  } else {
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', data.length);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=1800');
    res.setHeader('Content-Disposition', disposition);
    res.send(data);
  }
}

// 缩略图路由（必须在 /:fileToken 之前，否则 "thumb" 会被当成 fileToken）
router.get('/thumb/:fileToken', async (req: Request, res: Response) => {
  try {
    const data = await getCachedThumbnail(req.params.fileToken);
    if (data) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(data);
    }
    // 缩略图尚未生成：禁止浏览器缓存 204，以便下次重新请求
    res.setHeader('Cache-Control', 'no-cache, max-age=0');
    res.status(204).end();
  } catch {
    res.setHeader('Cache-Control', 'no-cache, max-age=0');
    res.status(204).end();
  }
});

router.get('/:fileToken', async (req: Request, res: Response) => {
  const { fileToken } = req.params;
  const recordId = req.query.record_id as string;
  const downloadUrl = req.query.url as string | undefined;
  const isRetry = req.query.retry === '1';
  const asDownload = req.query.download === '1';

  // 重试时清除缓存，强制重新下载+转码
  if (isRetry) {
    imageCache.delete(fileToken);
    FAILED.delete(fileToken);
    console.log(`[image] 重试模式：清除缓存 token=${fileToken.slice(0, 10)}...`);
  }

  const cached = imageCache.get(fileToken);
  if (cached) {
    // 内存缓存命中时，如果视频还没缩略图，异步补生成（不影响本次响应）
    if (!asDownload && cached.contentType.startsWith('video/')) {
      ensureThumbnailFromBuffer(fileToken, cached.data).catch(() => {});
    }
    return sendFileResponse(res, cached.data, cached.contentType, asDownload);
  }

  const ts = FAILED.get(fileToken);
  if (ts && Date.now() - ts < FAILED_TTL && !isRetry) {
    console.log(`[image] 返回失败缓存 token=${fileToken.slice(0, 10)}... (${Math.round((FAILED_TTL - (Date.now() - ts)) / 1000)}s 后可重试)`);
    res.status(502);
    res.setHeader('Content-Type', 'image/png');
    return res.send(ERROR_PLACEHOLDER);
  }

  if (!recordId) {
    console.warn(`[image] 缺少 record_id token=${fileToken.slice(0, 10)}...`);
    res.status(400);
    res.setHeader('Content-Type', 'image/png');
    return res.send(ERROR_PLACEHOLDER);
  }

  try {
    await lock();
    if (isRetry) FAILED.delete(fileToken);

    const { data: rawData, contentType: rawContentType } = await downloadAttachment(fileToken, recordId, downloadUrl);

    // 视频播放时检测 H.265 → H.264 转码（下载走原始文件，不转码）
    let data = rawData;
    let contentType = rawContentType;
    if (!asDownload && rawContentType.startsWith('video/')) {
      try {
        const result = await maybeTranscodeVideo(fileToken, rawData, rawContentType);
        data = result.data;
        contentType = result.contentType;
      } catch (err: any) {
        console.warn(`[image] 转码失败，返回原始视频: ${err.message?.slice(0, 100)}`);
        // 转码失败时返回原始数据，浏览器可能无法播放但下载按钮仍然可用
      }
    }

    if (imageCache.size >= MAX_CACHE) {
      const k = imageCache.keys().next().value;
      if (k) imageCache.delete(k);
    }
    imageCache.set(fileToken, { data, contentType });

    const isVideoType = contentType.startsWith('video/');
    console.log(`[image] 响应 token=${fileToken.slice(0, 10)}... type=${contentType} size=${data.length} download=${asDownload} video=${isVideoType} range=${req.headers.range || 'none'}`);
    sendFileResponse(res, data, contentType, asDownload);
  } catch (err: any) {
    const msg = err.stderr?.slice(0, 300) || err.message?.slice(0, 300);
    console.error(`[image] 下载失败 token=${fileToken.slice(0, 10)}... record=${recordId}: ${msg}`);
    FAILED.set(fileToken, Date.now());
    res.status(502);
    res.setHeader('Content-Type', 'image/png');
    res.send(ERROR_PLACEHOLDER);
  } finally {
    unlock();
  }
});

export default router;

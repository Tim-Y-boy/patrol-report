import { Router, Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, readdir, rm, mkdir } from 'fs/promises';
import path from 'path';
import os from 'os';
import { config } from '../config.js';

const execFileAsync = promisify(execFile);

const router = Router();

// 可见的错误占位图（灰色带 ⚠ 图标，1KB），确保浏览器 img @error 事件触发时用户能看到反馈
// 但通常不会用到——下载失败时我们直接返回 502 状态码，触发前端 @error
const ERROR_PLACEHOLDER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAACXBIWXMAAAsTAAALEwEAmpwYAAABiklEQVR4nO3aMUoDQRSG4W9FRRBCwMZKLCwstPIIHsCj2FpYegLPYOMNbGxsbLyCla2NhZWFhYUgCP5PMgObZXdnd2bezD7wfTDFl5nZ2QQIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgiAIgBBX0VQAQA8AAAAASUVORK5CYII=',
  'base64'
);

const imageCache = new Map<string, { data: Buffer; contentType: string }>();
const FAILED = new Map<string, number>();
const FAILED_TTL = 120000; // 失败缓存 2 分钟
const MAX_CACHE = 300;

let running = 0;
const MAX_RUNNING = 4;
const pend: Array<() => void> = [];
function next() {
  if (pend.length && running < MAX_RUNNING) { running++; setTimeout(pend.shift()!, 600); }
}
function lock(): Promise<void> {
  return new Promise(r => { if (running < MAX_RUNNING) { running++; r(); } else { pend.push(r); } });
}
function unlock() { running--; next(); }

/**
 * 通过 lark-cli 下载飞书附件（--as user 以用户身份下载，绕过应用权限限制）
 */
async function downloadViaLarkCli(fileToken: string, recordId: string): Promise<{ data: Buffer; contentType: string }> {
  const dirName = `fsimg_${Date.now()}`;
  const tmpDir = os.tmpdir();
  const outDir = path.join(tmpDir, dirName);
  await mkdir(outDir, { recursive: true });

  const nodeExe = process.execPath;
  const cliScript = 'C:/Users/zhaiyikang/.workbuddy/binaries/node/cli-connector-packages/node_modules/@larksuite/cli/scripts/run.js';

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

    // 过滤掉 .tmp 临时文件和隐藏文件，只取真正的附件文件
    const allFiles = await readdir(outDir);
    const realFiles = allFiles.filter(f => !f.startsWith('.') && !f.endsWith('.tmp'));
    const targetFile = realFiles.length > 0 ? realFiles[0] : allFiles[0];
    if (!targetFile) throw new Error('lark-cli 执行完成但输出目录为空');

    const data = await readFile(path.join(outDir, targetFile));
    const ext = path.extname(targetFile).toLowerCase();

    // 根据文件签名（magic bytes）检测真实类型，比扩展名可靠
    let ct = 'application/octet-stream';
    if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) ct = 'image/jpeg';
    else if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) ct = 'image/png';
    else if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) ct = 'image/gif';
    else if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46) ct = 'image/webp';
    else if (data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70) ct = 'video/mp4'; // ftyp box
    else if (ext === '.mp4' || ext === '.mov' || ext === '.webm') ct = 'video/mp4';
    else if (ext === '.jpg' || ext === '.jpeg') ct = 'image/jpeg';
    else if (ext === '.png') ct = 'image/png';
    else if (ext === '.gif') ct = 'image/gif';

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

/**
 * 尝试多种方式下载附件
 */
async function downloadAttachment(fileToken: string, recordId: string): Promise<{ data: Buffer; contentType: string }> {
  // 飞书附件是用户上传的，应用 tenant token 永远没权限 (99991672)
  // 直接走 lark-cli user 身份，跳过 REST API 的无效尝试
  return await downloadViaLarkCli(fileToken, recordId);
}

/**
 * 发送文件响应，自动处理 Range 请求（视频播放需要）
 */
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

router.get('/:fileToken', async (req: Request, res: Response) => {
  const { fileToken } = req.params;
  const recordId = req.query.record_id as string;
  const isRetry = req.query.retry === '1';
  const asDownload = req.query.download === '1';

  const cached = imageCache.get(fileToken);
  if (cached) {
    return sendFileResponse(res, cached.data, cached.contentType, asDownload);
  }

  // 用户点击重试时，绕过 FAILED 缓存
  const ts = FAILED.get(fileToken);
  if (ts && Date.now() - ts < FAILED_TTL && !isRetry) {
    // 返回 502 让浏览器 img @error 触发，前端即可显示重试按钮
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
    // 如果是重试请求，清除失败缓存
    if (isRetry) FAILED.delete(fileToken);

    const { data, contentType } = await downloadAttachment(fileToken, recordId);

    if (imageCache.size >= MAX_CACHE) {
      const k = imageCache.keys().next().value;
      if (k) imageCache.delete(k);
    }
    imageCache.set(fileToken, { data, contentType });

    sendFileResponse(res, data, contentType, asDownload);
  } catch (err: any) {
    const msg = err.stderr?.slice(0, 300) || err.message?.slice(0, 300);
    console.error(`[image] 下载失败 token=${fileToken.slice(0, 10)}... record=${recordId}: ${msg}`);
    FAILED.set(fileToken, Date.now());
    // 返回 502 触发前端 @error → 显示重试按钮
    res.status(502);
    res.setHeader('Content-Type', 'image/png');
    res.send(ERROR_PLACEHOLDER);
  } finally {
    unlock();
  }
});

export default router;

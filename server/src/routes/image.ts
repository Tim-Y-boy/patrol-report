import { Router, Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, readdir, rm, mkdir } from 'fs/promises';
import path from 'path';
import os from 'os';
import { config } from '../config.js';
import { downloadFile } from '../feishu/client.js';

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
 * 下载附件：优先飞书 REST API（应用身份），失败 99991672 则降级 lark-cli（用户身份）
 */
async function downloadAttachment(fileToken: string, recordId: string): Promise<{ data: Buffer; contentType: string }> {
  // 1. 先尝试应用身份 API（已修复的连接稳定性）
  try {
    console.log(`[image] REST API 开始下载 token=${fileToken.slice(0, 10)}... record=${recordId}`);
    const result = await downloadFile(fileToken);
    console.log(`[image] REST API 下载成功 token=${fileToken.slice(0, 10)}... size=${result.data.length}`);
    return result;
  } catch (err: any) {
    const code = err.response?.data?.code;
    const msg = err.response?.data ? JSON.stringify(err.response.data).slice(0, 200) : err.message;
    console.warn(`[image] REST API 下载失败 token=${fileToken.slice(0, 10)}... code=${code} msg=${msg}`);

    // 99991672 = 应用无权限访问用户上传的附件，需要降级到 lark-cli
    if (code === 99991672) {
      console.log(`[image] 降级到 lark-cli token=${fileToken.slice(0, 10)}...`);
      return await downloadViaLarkCli(fileToken, recordId);
    }
    throw err;
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

router.get('/:fileToken', async (req: Request, res: Response) => {
  const { fileToken } = req.params;
  const recordId = req.query.record_id as string;
  const isRetry = req.query.retry === '1';
  const asDownload = req.query.download === '1';

  const cached = imageCache.get(fileToken);
  if (cached) {
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
    res.status(502);
    res.setHeader('Content-Type', 'image/png');
    res.send(ERROR_PLACEHOLDER);
  } finally {
    unlock();
  }
});

export default router;

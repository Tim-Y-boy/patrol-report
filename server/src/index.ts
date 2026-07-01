import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import inspectionRouter from './routes/inspection.js';
import pointsRouter from './routes/points.js';
import unitsRouter from './routes/units.js';
import imageRouter from './routes/image.js';
import { cleanExpiredCache, isFfmpegAvailable } from './ffmpeg.js';

const app = express();

// 中间件
app.use(cors());
app.use(express.json());

// API 路由
app.use('/api/inspection', inspectionRouter);
app.use('/api/points', pointsRouter);
app.use('/api/units', unitsRouter);
app.use('/api/image', imageRouter);

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// 启动时清理过期视频缓存 + 检查 FFmpeg
(async () => {
  await cleanExpiredCache().catch(() => {});
  const ffAvailable = await isFfmpegAvailable().catch(() => false);
  if (ffAvailable) {
    console.log('🎬 FFmpeg 可用，H.265 视频将自动转码为 H.264');
  } else {
    console.log('⚠️  FFmpeg 未安装，视频无法在浏览器中播放（可下载后用本地播放器观看）');
    console.log('   安装: winget install ffmpeg  或  scoop install ffmpeg');
  }
})();

// 启动服务
app.listen(config.port, () => {
  console.log(`🚀 巡检报表后端服务已启动: http://localhost:${config.port}`);
  console.log(`📊 API: http://localhost:${config.port}/api/inspection`);
  console.log(`📍 API: http://localhost:${config.port}/api/points`);
  console.log(`🏢 API: http://localhost:${config.port}/api/units`);
});

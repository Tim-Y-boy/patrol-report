import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import inspectionRouter from './routes/inspection.js';
import pointsRouter from './routes/points.js';
import unitsRouter from './routes/units.js';
import imageRouter from './routes/image.js';

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

// 启动服务
app.listen(config.port, () => {
  console.log(`🚀 巡检报表后端服务已启动: http://localhost:${config.port}`);
  console.log(`📊 API: http://localhost:${config.port}/api/inspection`);
  console.log(`📍 API: http://localhost:${config.port}/api/points`);
  console.log(`🏢 API: http://localhost:${config.port}/api/units`);
});

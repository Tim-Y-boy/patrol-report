# 摄像头智能巡检报表

基于飞书多维表格数据的智能巡检看板，实时展示告警事件、AI 分析结果和处理进度。

## 架构

```
前端 (Vue 3 + Vite) ←→ Node.js 后端 (Express) ←→ 飞书 OpenAPI
                                                  ↓
                                          飞书多维表格 (持久层)
```

- **飞书多维表格即持久层**：无需额外数据库，后端实时调用飞书 API 读取数据
- **前后端分离**：Vite dev server 代理 API 请求到后端

## 项目结构

```
patrol-report/
├── client/          # Vue 3 前端
│   ├── src/
│   │   ├── views/        # Dashboard / AlarmDetail / PointHistory
│   │   ├── components/   # KpiCard / AlarmCard / TrendChart
│   │   ├── api/          # Axios 封装
│   │   └── router/       # 路由配置
│   └── public/data/      # Mock 数据 (后端不可用时的降级方案)
├── server/          # Express 后端
│   └── src/
│       ├── routes/       # inspection / points / units / image
│       └── feishu/       # 飞书 API 客户端
└── .env             # 环境变量配置
```

## 开发启动

### 1. 配置飞书应用

编辑 `server/.env`：

```env
FEISHU_APP_ID=你的飞书应用App ID
FEISHU_APP_SECRET=你的飞书应用App Secret
```

### 2. 启动后端

```bash
cd server
npm install
npm run dev
```

### 3. 启动前端

```bash
cd client
npm install
npm run dev
```

打开 http://localhost:5173

## Mock 模式

如果不配置飞书 App，前端会自动降级读取 `client/public/data/` 目录下的静态 JSON 数据。

## 生产部署

```bash
# 构建前端
cd client && npm run build

# 部署 dist/ 到 Nginx
# 配置 Nginx 反向代理 /api 到后端服务
```

## 页面功能

| 页面 | 路由 | 功能 |
|------|------|------|
| 实时告警看板 | `/` | KPI 卡片、最新告警列表、点位分布图、类型分布图、趋势图 |
| 告警详情 | `/alarm/:id` | 大图查看、AI 识别结论、基本信息、同点位历史 |
| 点位历史 | `/point/:name` | 点位配置、告警趋势、类型分布、历史记录表 |

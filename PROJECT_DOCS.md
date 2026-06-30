# 📹 摄像头智能巡检报表 — 项目文档

> 版本: 1.0.0 | 更新日期: 2026-06-25

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术架构](#2-技术架构)
3. [项目结构](#3-项目结构)
4. [技术栈详情](#4-技术栈详情)
5. [数据流设计](#5-数据流设计)
6. [前端模块详解](#6-前端模块详解)
7. [后端模块详解](#7-后端模块详解)
8. [API 接口文档](#8-api-接口文档)
9. [配置说明](#9-配置说明)
10. [开发指南](#10-开发指南)
11. [部署指南](#11-部署指南)
12. [常见问题](#12-常见问题)

---

## 1. 项目概述

**摄像头智能巡检报表**是一个基于飞书多维表格数据的智能巡检看板系统，用于实时展示摄像头巡检告警事件、AI 分析结果和处理进度。

### 核心功能

| 模块 | 说明 |
|------|------|
| **实时告警看板** | KPI 指标卡片、最新告警列表、点位分布图、告警类型分布图、告警日趋势图 |
| **告警详情页** | 大图查看（含多图切换）、AI 识别结论、基本信息卡片、同点位历史时间线 |
| **点位历史页** | 点位配置信息、告警趋势图、监控类型分布、历史告警记录表格（含筛选） |

### 业务背景

- 摄像头定时抓拍巡检点位画面
- AI 自动识别画面中的违规行为（如未戴安全帽、区域入侵等）
- 识别结果写入飞书多维表格
- 本系统实时拉取飞书数据，提供可视化看板供管理人员查看和复核

---

## 2. 技术架构

```
┌────────────────────────────────────────────────┐
│                    浏览器                       │
│          Vue 3 SPA (Element Plus UI)            │
│          ECharts 图表 · Pinia 状态管理           │
└────────────────────┬───────────────────────────┘
                     │ HTTP / Axios
                     ▼
┌────────────────────────────────────────────────┐
│           Vite Dev Server (端口 5173)           │
│              代理 /api → 后端                    │
└────────────────────┬───────────────────────────┘
                     │ Proxy
                     ▼
┌────────────────────────────────────────────────┐
│        Node.js Express Server (端口 3001)       │
│    路由: inspection / points / units / image    │
│    飞书客户端: token管理 · API调用 · 文件下载    │
└────────────────────┬───────────────────────────┘
                     │ HTTPS
                     ▼
┌────────────────────────────────────────────────┐
│              飞书 OpenAPI                       │
│    多维表格 (Bitable) · 文件下载 (Drive)         │
└────────────────────┬───────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────┐
│          飞书多维表格 (持久层/数据库)             │
│  巡检记录表 · 工单表 · 周报表 · 规则表            │
│  点位配置表 · 单位表                              │
└────────────────────────────────────────────────┘
```

### 架构特点

- **飞书多维表格即数据库**：无需额外 MySQL/PostgreSQL，飞书 Bitable 作为唯一的持久化存储
- **前后端分离**：Vite dev server 开发时通过代理转发 API 请求，生产环境由 Nginx 反向代理
- **Mock 降级**：后端不可用时，前端自动降级读取 `public/data/` 目录下的静态 JSON 数据

---

## 3. 项目结构

```
patrol-report/
├── README.md                    # 项目简介
├── PROJECT_DOCS.md              # 本文档（详细项目文档）
│
├── client/                      # Vue 3 前端项目
│   ├── index.html               # HTML 入口
│   ├── package.json             # 前端依赖配置
│   ├── vite.config.ts           # Vite 构建配置（含 API 代理）
│   ├── tsconfig.json            # TypeScript 项目引用
│   ├── tsconfig.app.json        # 前端 TS 配置
│   ├── tsconfig.node.json       # Vite 配置文件 TS 配置
│   ├── .env                     # 环境变量（VITE_API_BASE）
│   │
│   ├── public/
│   │   ├── favicon.svg
│   │   ├── icons.svg
│   │   └── data/                # Mock 降级数据
│   │       ├── inspection.json  #   巡检记录 mock
│   │       ├── points.json      #   点位配置 mock
│   │       └── units.json       #   巡检单位 mock
│   │
│   └── src/
│       ├── main.ts              # 应用入口（挂载 Vue/Pinia/ElementPlus/Router）
│       ├── App.vue              # 根组件（头部导航 + 路由视图）
│       ├── style.css            # 全局样式 + 通用 CSS 类
│       │
│       ├── api/
│       │   └── index.ts         # Axios 实例封装（baseURL/拦截器）
│       │
│       ├── router/
│       │   └── index.ts         # Vue Router 路由配置（3个路由）
│       │
│       ├── views/
│       │   ├── Dashboard.vue    # 实时告警看板页（KPI+图表+告警列表）
│       │   ├── AlarmDetail.vue  # 告警详情页（大图+信息+同点位历史）
│       │   └── PointHistory.vue # 点位历史页（配置+趋势+记录表）
│       │
│       └── components/
│           ├── KpiCard.vue      # KPI 指标卡片组件
│           ├── AlarmCard.vue    # 告警列表项组件
│           └── TrendChart.vue   # ECharts 图表通用组件（柱/线/饼）
│
├── server/                      # Express 后端项目
│   ├── package.json             # 后端依赖配置
│   ├── tsconfig.json            # TypeScript 配置
│   ├── .env                     # 飞书应用配置
│   │
│   └── src/
│       ├── index.ts             # Express 服务入口（中间件+路由挂载）
│       ├── config.ts            # 配置管理（环境变量读取）
│       │
│       ├── feishu/
│       │   └── client.ts        # 飞书 OpenAPI 客户端
│       │                        #   - tenant_access_token 获取与缓存
│       │                        #   - Bitable 记录查询
│       │                        #   - 文件/图片下载
│       │                        #   - 字段列表获取
│       │
│       └── routes/
│           ├── inspection.ts    # 巡检记录路由
│           ├── points.ts        # 巡检点位路由
│           ├── units.ts         # 巡检单位路由
│           └── image.ts         # 图片代理路由（30分钟缓存）
│
└── .gitignore
```

---

## 4. 技术栈详情

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue | ^3.5.13 | 渐进式 UI 框架（Composition API） |
| TypeScript | ~5.7.3 | 类型安全 |
| Vite | ^6.2.5 | 开发服务器 + 构建工具 |
| Pinia | ^3.0.2 | 轻量级状态管理 |
| Vue Router | ^4.5.1 | 客户端路由 |
| Element Plus | ^2.10.2 | UI 组件库（骨架屏/按钮/选择器） |
| ECharts | ^5.6.0 | 数据可视化图表（柱状图/折线图/饼图） |
| Axios | ^1.7.9 | HTTP 请求库 |

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | — | JavaScript 运行时 |
| Express | ^4.21.0 | Web 服务框架 |
| TypeScript | ^5.5.0 | 类型安全 |
| tsx | ^4.19.0 | TypeScript 开发运行时（watch 模式） |
| Axios | ^1.7.0 | 飞书 API HTTP 调用 |
| cors | ^2.8.5 | 跨域资源共享 |
| dotenv | ^16.4.0 | 环境变量加载 |

---

## 5. 数据流设计

### 5.1 整体数据流

```
飞书多维表格 (数据源)
    │
    │ 飞书 OpenAPI (HTTPS)
    ▼
Express 后端 (飞书客户端)
    │
    │ JSON API (/api/*)
    ▼
Vue 前端 (Axios)
    │
    │ 响应式数据绑定
    ▼
UI 组件 (ECharts / Element Plus)
```

### 5.2 飞书 API 调用流程

```
1. 首次请求 → 获取 tenant_access_token (缓存 1 小时，提前 1 分钟刷新)
2. 携带 token → 调用 Bitable API 获取记录列表
3. 返回 raw items → 转换为前端友好的扁平格式
4. 图片请求 → 单独通过 /api/image/:token 代理下载
```

### 5.3 Mock 降级策略

```
前端请求 /api/inspection
    ├── 后端可用 → 返回真实飞书数据
    └── 后端不可用 → catch 异常 → fetch('/data/inspection.json') 静态 JSON
```

---

## 6. 前端模块详解

### 6.1 入口文件 [`src/main.ts`](client/src/main.ts)

```
createApp(App)
  → use(createPinia())     # 状态管理
  → use(router)            # 路由
  → use(ElementPlus)       # UI 组件库
  → mount('#app')
```

### 6.2 路由 [`src/router/index.ts`](client/src/router/index.ts)

| 路径 | 组件 | 名称 | 说明 |
|------|------|------|------|
| `/` | Dashboard.vue | dashboard | 实时告警看板 |
| `/alarm/:id` | AlarmDetail.vue | alarm-detail | 告警详情（prop: id） |
| `/point/:name` | PointHistory.vue | point-history | 点位历史（prop: name） |

路由模式: `createWebHistory` (HTML5 History 模式)

### 6.3 API 封装 [`src/api/index.ts`](client/src/api/index.ts)

- `baseURL`: 来自环境变量 `VITE_API_BASE`（默认 `/api`）
- `timeout`: 15 秒
- 响应拦截器：自动解包 `res.data`

### 6.4 Dashboard 页面 [`src/views/Dashboard.vue`](client/src/views/Dashboard.vue)

**数据获取**: `onMounted` → `fetchData()` → `api.get('/inspection')` → `records.value`

**计算属性**:
- `kpiData`: 今日告警数 / 违规总数 / 违规率 / 待复核数
- `pointDistribution`: 按点位聚合告警数量
- `monitorDistribution`: 按监控要点聚合
- `dailyTrend`: 按日期聚合告警数量

**UI 布局**:
```
┌─────────────────────────────────────────┐
│  KPI 卡片 x4 (今日告警|违规总数|违规率|待复核) │
├───────────────────┬─────────────────────┤
│  最新告警列表 (20)  │  点位告警分布 (柱状图) │
│                   │  监控告警类型 (饼图)   │
├───────────────────┴─────────────────────┤
│         告警趋势 (按日折线图)             │
└─────────────────────────────────────────┘
```

### 6.5 AlarmDetail 页面 [`src/views/AlarmDetail.vue`](client/src/views/AlarmDetail.vue)

- 加载全量记录 → 根据 `props.id` 匹配当前记录
- 左侧：大图展示 + 缩略图多图切换
- 右侧：告警信息卡片 + AI 识别结论
- 底部：同点位历史告警时间线

### 6.6 PointHistory 页面 [`src/views/PointHistory.vue`](client/src/views/PointHistory.vue)

- 并行请求 `/api/inspection` + `/api/points`
- 点位配置网格（4 列）
- 告警日趋势 + 监控类型分布
- 历史告警表格（支持按 AI 判定结果筛选）

### 6.7 可复用组件

| 组件 | Props | 说明 |
|------|-------|------|
| **KpiCard** | `title, value, unit, icon, color` | KPI 指标卡片，hover 微动效 |
| **AlarmCard** | `record` (含 id, 照片, 点位, 监控要点, AI判定结果, 时间) | 告警列表项，带缩略图 |
| **TrendChart** | `type(bar/line/pie), data, labels?, height?, barColor?, lineColor?` | ECharts 通用图表，响应式 resize |

### 6.8 全局样式 [`src/style.css`](client/src/style.css)

- CSS Reset + 字体栈（苹方/微软雅黑）
- 自定义滚动条样式
- 通用类：`.page-card` / `.card-title` / `.tag-danger` / `.tag-warning` / `.tag-success` / `.tag-info`

---

## 7. 后端模块详解

### 7.1 入口 [`src/index.ts`](server/src/index.ts)

```
Express App
  → cors()                         # 跨域
  → express.json()                 # JSON 解析
  → /api/inspection → inspectionRouter
  → /api/points     → pointsRouter
  → /api/units      → unitsRouter
  → /api/image      → imageRouter
  → /api/health     → 健康检查
  → listen(config.port)            # 端口默认 3001
```

### 7.2 配置 [`src/config.ts`](server/src/config.ts)

从 `server/.env` 加载环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `FEISHU_APP_ID` | `''` | 飞书应用 App ID |
| `FEISHU_APP_SECRET` | `''` | 飞书应用 App Secret |
| `FEISHU_BASE_TOKEN` | （预设值） | 多维表格 Base Token |
| `FEISHU_TABLE_INSPECTION` | `tbld8GxGG5XELZDj` | 巡检记录表 ID |
| `FEISHU_TABLE_WORKORDER` | `tbl1XYd4yvjj72GG` | 工单表 ID |
| `FEISHU_TABLE_WEEKLY` | `tblzuruQ5xOg66Yc` | 周报表 ID |
| `FEISHU_TABLE_RULES` | `tbl1b4jJwPIatlUW` | 规则表 ID |
| `FEISHU_TABLE_POINTS` | `tblXRCwHOKmINje8` | 点位配置表 ID |
| `FEISHU_TABLE_UNITS` | `tblcwvhIkysBvCm4` | 巡检单位表 ID |
| `SERVER_PORT` | `3001` | 服务监听端口 |

### 7.3 飞书客户端 [`src/feishu/client.ts`](server/src/feishu/client.ts)

**核心函数**:

| 函数 | 说明 |
|------|------|
| `getTenantToken()` | 获取 tenant_access_token（缓存，提前 60s 刷新） |
| `feishuRequest(method, path, data, params)` | 通用飞书 API 请求封装 |
| `getBitableRecords(tableId, params)` | 查询多维表格记录列表 |
| `getBitableRecordsWithFields(tableId, params)` | 查询记录并扁平化 fields |
| `downloadFile(fileToken)` | 下载飞书文件（返回 Buffer + Content-Type） |
| `getFieldList(tableId)` | 获取表格字段列表 |

**Token 缓存策略**:
```
cachedToken = { token: 'xxx', expireAt: 1730000000 }
   下次请求时:
   if (Date.now() < expireAt - 60000) → 使用缓存
   else → 请求新 token → 更新缓存
```

### 7.4 路由详情

#### inspection.ts — 巡检记录
| 端点 | 说明 |
|------|------|
| `GET /api/inspection` | 获取巡检记录列表，支持 `?page`/`?pageSize`/`?filter` |
| `GET /api/inspection/:recordId` | 获取单条记录详情 |

返回数据格式化：中文字段名映射为前端友好的扁平结构，照片 file_token 转换为代理 URL。

#### points.ts — 巡检点位
| 端点 | 说明 |
|------|------|
| `GET /api/points` | 获取所有点位配置（pageSize=100） |

#### units.ts — 巡检单位
| 端点 | 说明 |
|------|------|
| `GET /api/units` | 获取所有巡检单位（pageSize=100） |

#### image.ts — 图片代理
| 端点 | 说明 |
|------|------|
| `GET /api/image/:fileToken` | 代理飞书图片下载，响应头 `Cache-Control: max-age=1800` |

---

## 8. API 接口文档

### 通用响应格式

```json
{
  "ok": true,
  "data": { ... },
  "error": "错误信息（仅 ok=false 时）"
}
```

### GET /api/inspection

获取巡检记录列表。

**请求参数**:
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | number | 1 | 页码 |
| pageSize | number | 20 | 每页条数 |
| filter | string | — | 筛选条件（飞书格式） |

**响应示例**:
```json
{
  "ok": true,
  "data": {
    "records": [
      {
        "id": "recxxx",
        "记录编号": "JC-2024-001",
        "创建时间": "2024-01-15 10:30:00",
        "创建人": "张三",
        "点位": "厂区大门-东侧",
        "监控要点": "安全帽佩戴检测",
        "AI识别结论": "画面中1人未佩戴安全帽...",
        "AI判定结果": "违规",
        "复核员判定结果": "",
        "复核人员": "",
        "照片": [
          {
            "file_token": "boxcnyyy",
            "name": "snapshot.jpg",
            "url": "/api/image/boxcnyyy"
          }
        ]
      }
    ],
    "total": 150,
    "hasMore": true
  }
}
```

### GET /api/inspection/:recordId

获取单条巡检记录详情。

### GET /api/points

获取所有点位配置。

**响应示例**:
```json
{
  "ok": true,
  "data": {
    "records": [
      {
        "id": "recxxx",
        "巡检点位": "厂区大门-东侧",
        "编码": "CAM-001",
        "录制类型": ["定时抓拍"],
        "检测集": ["安全帽检测", "区域入侵"],
        "频率": 30,
        "工作时长": ["08:00-18:00"],
        "状态": ["有效"],
        "监控事项": "检测进出人员安全帽佩戴情况"
      }
    ],
    "total": 25
  }
}
```

### GET /api/units

获取所有巡检单位。

### GET /api/image/:fileToken

代理飞书图片下载，30 分钟浏览器缓存。

### GET /api/health

健康检查。

```json
{ "ok": true, "time": "2024-01-15T10:30:00.000Z" }
```

---

## 9. 配置说明

### 9.1 飞书应用配置 (`server/.env`)

```
FEISHU_APP_ID=your_app_id_here          # ← 必填，替换为实际值
FEISHU_APP_SECRET=your_app_secret_here  # ← 必填，替换为实际值
FEISHU_BASE_TOKEN=MAFdbUXYTaZbBjs8DPZct04Sn2e
FEISHU_TABLE_INSPECTION=tbld8GxGG5XELZDj
FEISHU_TABLE_POINTS=tblXRCwHOKmINje8
FEISHU_TABLE_UNITS=tblcwvhIkysBvCm4
FEISHU_TABLE_WORKORDER=tbl1XYd4yvjj72GG
FEISHU_TABLE_WEEKLY=tblzuruQ5xOg66Yc
FEISHU_TABLE_RULES=tbl1b4jJwPIatlUW
SERVER_PORT=3001
```

**飞书应用需要的权限**:
- `bitable:app` — 多维表格访问
- `drive:drive` — 文件/图片下载

### 9.2 前端环境变量 (`client/.env`)

```
VITE_API_BASE=/api    # API 基础路径
```

### 9.3 Vite 代理配置 (`client/vite.config.ts`)

开发环境下，`/api` 开头的请求自动代理到 `http://localhost:3001`。

---

## 10. 开发指南

### 10.1 环境要求

- Node.js >= 20.x
- npm >= 10.x（推荐使用 pnpm）

### 10.2 启动开发环境

```bash
# 1. 克隆项目后安装依赖（使用国内镜像加速）
cd patrol-report

# 安装后端依赖
cd server
npm install --registry=https://registry.npmmirror.com

# 安装前端依赖
cd ../client
npm install --registry=https://registry.npmmirror.com

# 2. 配置飞书应用（可选，不配置则使用 Mock 模式）
# 编辑 server/.env，填入 FEISHU_APP_ID 和 FEISHU_APP_SECRET

# 3. 启动后端（终端 1）
cd server
npm run dev          # tsx watch src/index.ts → localhost:3001

# 4. 启动前端（终端 2）
cd client
npm run dev          # vite → localhost:5173
```

打开浏览器访问 `http://localhost:5173`

### 10.3 可用脚本

**后端**:
| 命令 | 说明 |
|------|------|
| `npm run dev` | tsx watch 热重载开发 |
| `npm run build` | TypeScript 编译 → dist/ |
| `npm start` | 生产启动 |

**前端**:
| 命令 | 说明 |
|------|------|
| `npm run dev` | Vite 开发服务器 |
| `npm run build` | TypeScript 检查 + Vite 生产构建 |
| `npm run preview` | 预览生产构建 |

### 10.4 Mock 模式

不配置飞书 App 时，后端 API 会返回飞书错误，前端自动降级读取 `client/public/data/` 下的静态 JSON：

- `inspection.json` — 模拟巡检记录
- `points.json` — 模拟点位配置
- `units.json` — 模拟单位数据

Mock 数据路径硬编码在 `Dashboard.vue`、`AlarmDetail.vue`、`PointHistory.vue` 的 `loadMockData()` 方法中。

---

## 11. 部署指南

### 生产构建

```bash
# 1. 构建前端
cd client
npm run build          # 输出到 client/dist/

# 2. 构建后端
cd ../server
npm run build          # 输出到 server/dist/
```

### Nginx 部署示例

```nginx
server {
    listen 80;
    server_name patrol.example.com;

    # 前端静态文件
    root /var/www/patrol-report/client/dist;
    index index.html;

    # SPA 路由 fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 静态资源缓存
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 后端进程管理 (PM2)

```bash
npm install -g pm2
pm2 start server/dist/index.js --name patrol-server
pm2 save
pm2 startup
```

---

## 12. 常见问题

### Q: 前端页面打开后一直加载中/报错？
A: 检查后端是否启动（`http://localhost:3001/api/health`），如果后端未配置飞书 App 也可以启动，前端会自动降级到 Mock 数据。

### Q: 飞书 API 返回 403/401？
A: 检查 `server/.env` 中 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET` 是否正确，飞书应用是否已发布并获取了 `bitable:app` 和 `drive:drive` 权限。

### Q: 图片无法显示？
A: 飞书图片通过后端代理下载（`/api/image/:fileToken`），需要飞书应用的 `drive:drive` 权限。确保后端可以访问 `https://open.feishu.cn/open-apis/drive/v1/medias/{fileToken}/download`。

### Q: 如何修改 mock 数据？
A: 编辑 `client/public/data/` 目录下的 JSON 文件。字段格式参考飞书多维表格的字段名（中文）。

### Q: 构建时 ECharts 包体积过大？
A: ECharts 全量引入约 1MB (gzipped ~340KB)。如需优化可在 `TrendChart.vue` 中按需引入：
```ts
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
```

---

## 附录：已修复问题记录

| 日期 | 问题 | 修复方案 |
|------|------|----------|
| 2026-06-25 | `client/package.json` 缺少 pinia/element-plus/vue-router/axios/echarts 依赖 | 添加依赖到 package.json |
| 2026-06-25 | `App.vue` 中 `<router-link exact>` 在 Vue Router 4 中无效 | 移除 `exact` 属性 |
| 2026-06-25 | `HelloWorld.vue` 脚手架文件未使用且引用不存在的 assets | 删除文件 |
| 2026-06-25 | TypeScript 版本不兼容 `erasableSyntaxOnly` 选项 | 降级 TS 到 5.7.3，移除 `erasableSyntaxOnly` |
| 2026-06-25 | `feishu/client.ts` 中 `AxiosHeaders` 类型不匹配 `string` | 用 `String()` 包裹 |
| 2026-06-25 | 部分依赖版本过高可能不可用 | 调整为已验证存在的稳定版本 |

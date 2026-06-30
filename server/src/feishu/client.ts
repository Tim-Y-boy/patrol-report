import axios, { AxiosError } from 'axios';
import http from 'http';
import https from 'https';
import { config } from '../config.js';

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

// ---------- HTTP Agent 配置 ----------
// 使用 keep-alive 复用连接，避免频繁 TCP 握手导致的 ECONNRESET
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

// ---------- 重试配置 ----------
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE_MS = 1000;

/** 判断是否为可重试的网络错误 */
function isRetryableError(err: AxiosError): boolean {
  if (!err.code) return false;
  // ECONNRESET / ETIMEDOUT / ECONNREFUSED / ENOTFOUND / EPIPE 都可重试
  const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EPIPE', 'ERR_BAD_RESPONSE'];
  return retryableCodes.includes(err.code);
}

/** 带指数退避的重试包装 */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (attempt >= MAX_RETRIES) break;
      if (!isRetryableError(err as AxiosError)) break;
      const delay = RETRY_DELAY_BASE_MS * Math.pow(2, attempt);
      console.warn(`[feishu] ${label} 第 ${attempt + 1} 次失败 (${err.code || err.message}), ${delay}ms 后重试...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}

// ---------- Token ----------

interface TenantToken {
  token: string;
  expireAt: number;
}

let cachedToken: TenantToken | null = null;

/**
 * 获取 tenant_access_token (带缓存)
 */
async function getTenantToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expireAt - 60000) {
    return cachedToken.token;
  }

  try {
    const res = await axios.post(
      `${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`,
      {
        app_id: config.feishu.appId,
        app_secret: config.feishu.appSecret,
      },
      {
        timeout: 15000,
        httpAgent,
        httpsAgent,
      },
    );

    const { tenant_access_token, expire } = res.data;
    cachedToken = {
      token: tenant_access_token,
      expireAt: Date.now() + expire * 1000,
    };

    return tenant_access_token as string;
  } catch (err: any) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('飞书 Token 获取失败:', detail);
    throw err;
  }
}

/**
 * 通用飞书 API 请求
 */
async function feishuRequest(method: 'GET' | 'POST', path: string, data?: any, params?: any) {
  const token = await getTenantToken();
  const res = await axios({
    method,
    url: `${FEISHU_API_BASE}${path}`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data,
    params,
    timeout: 30000,           // 30s 超时
    httpAgent,
    httpsAgent,
  });
  return res.data;
}

/**
 * 获取多维表格记录列表
 */
export async function getBitableRecords(
  tableId: string,
  params?: { pageSize?: number; pageToken?: string; filter?: string; sort?: any[] }
) {
  const query: any = {
    page_size: params?.pageSize || 100,
  };
  if (params?.pageToken) query.page_token = params.pageToken;
  if (params?.filter) query.filter = params.filter;

  try {
    const result = await withRetry(
      () =>
        feishuRequest(
          'GET',
          `/bitable/v1/apps/${config.feishu.baseToken}/tables/${tableId}/records`,
          undefined,
          query,
        ),
      `Bitable 查询 (table=${tableId})`,
    );
    return result;
  } catch (err: any) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error(`飞书 Bitable 查询失败 (table=${tableId}):`, detail);
    throw err;
  }
}

/**
 * 获取单条记录
 */
export async function getBitableRecord(tableId: string, recordId: string) {
  try {
    return await withRetry(
      () =>
        feishuRequest(
          'GET',
          `/bitable/v1/apps/${config.feishu.baseToken}/tables/${tableId}/records/${recordId}`,
        ),
      `单记录查询 (table=${tableId})`,
    );
  } catch (err: any) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error(`飞书单记录查询失败 (table=${tableId} record=${recordId}):`, detail);
    throw err;
  }
}
export async function getBitableRecordsWithFields(tableId: string, params?: { pageSize?: number; pageToken?: string; filter?: string }) {
  const res = await getBitableRecords(tableId, params);
  if (!res.data) return res;

  const items = res.data.items || [];
  const records = items.map((item: any) => ({
    ...item.fields,
    record_id: item.record_id,
  }));

  return {
    ...res,
    data: {
      ...res.data,
      records,
      items: undefined, // 用 records 替代
    },
  };
}

/**
 * 下载飞书文件 (图片/附件)
 */
export async function downloadFile(fileToken: string): Promise<{ data: Buffer; contentType: string }> {
  const token = await getTenantToken();
  try {
    const res = await withRetry(
      () =>
        axios({
          method: 'GET',
          url: `${FEISHU_API_BASE}/drive/v1/files/${fileToken}/download`,
          headers: {
            Authorization: `Bearer ${token}`,
          },
          responseType: 'arraybuffer',
          timeout: 120000,          // 文件下载 120s 超时
          httpAgent,
          httpsAgent,
        }),
      `文件下载 (token=${fileToken.slice(0, 10)}...)`,
    );

    return {
      data: Buffer.from(res.data),
      contentType: String(res.headers['content-type'] || 'image/png'),
    };
  } catch (err: any) {
    const detail = err.response?.data
      ? (Buffer.isBuffer(err.response.data) ? err.response.data.toString('utf-8').slice(0, 200) : JSON.stringify(err.response.data).slice(0, 200))
      : err.message;
    console.error(`飞书文件下载失败 (token=${fileToken.slice(0, 10)}...):`, detail);
    throw err;
  }
}

/**
 * 获取字段列表
 */
export async function getFieldList(tableId: string) {
  return withRetry(
    () =>
      feishuRequest(
        'GET',
        `/bitable/v1/apps/${config.feishu.baseToken}/tables/${tableId}/fields`,
      ),
    `字段列表查询 (table=${tableId})`,
  );
}

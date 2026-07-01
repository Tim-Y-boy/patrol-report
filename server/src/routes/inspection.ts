import { Router, Request, Response } from 'express';
import { getBitableRecords, getBitableRecord, getFieldList } from '../feishu/client.js';
import { config } from '../config.js';

const router = Router();

// ---------- 全量数据缓存（避免并发请求重复扫描飞书 API） ----------
interface CacheEntry {
  promise: Promise<any>;   // 正在进行的请求 Promise（用于去重）
  result: any;             // 完成后替换为结果
  time: number;            // 缓存时间戳
}
const dataCache = new Map<string, CacheEntry>();
const DATA_CACHE_TTL = 30 * 1000; // 全量数据缓存 30 秒

// 缓存字段选项 ID → 显示文本映射
let optionMapCache: Map<string, Map<string, string>> | null = null;
let optionMapCacheTime = 0;
const OPTION_CACHE_TTL = 10 * 60 * 1000;

async function getOptionMap(): Promise<Map<string, Map<string, string>>> {
  if (optionMapCache && Date.now() - optionMapCacheTime < OPTION_CACHE_TTL) {
    return optionMapCache;
  }
  const result = new Map<string, Map<string, string>>();

  try {
    // 1. 本级表字段选项（select/multiSelect 等） — REST API 有 id+name
    const insFieldList = await getFieldList(config.tables.inspection);
    if (insFieldList.data?.items) {
      for (const f of insFieldList.data.items) {
        if (Array.isArray(f.property?.options)) {
          const map = new Map<string, string>();
          for (const o of f.property.options) map.set(String(o.id), String(o.name || o.text));
          result.set(f.field_name, map);
        }
      }
    }

    // 2. 监控要点 的 lookup 来源：巡检规则.场景(fldrf2VjvD)
    const ruleFieldList = await getFieldList(config.tables.rules);
    if (ruleFieldList.data?.items) {
      for (const f of ruleFieldList.data.items) {
        if (f.field_id === 'fldrf2VjvD' && Array.isArray(f.property?.options)) {
          const map = new Map<string, string>();
          for (const o of f.property.options) map.set(String(o.id), String(o.name || o.text));
          result.set('监控要点', map);
          break;
        }
      }
    }

    optionMapCache = result;
    optionMapCacheTime = Date.now();
    console.log('[inspection] 选项映射已加载:', [...result.entries()].map(([k, v]) => `${k}(${v.size}项)`).join(', '));
  } catch (err: any) {
    console.warn('[inspection] 选项映射构建失败:', err.message);
  }
  return optionMapCache || result;
}

// 安全获取用户名字符串（兼容数组和单对象）
function safeUserNames(val: any): string {
  if (!val) return '';
  if (Array.isArray(val)) return val.map((u: any) => u?.name || '').filter(Boolean).join(',');
  if (typeof val === 'object' && val.name) return val.name;
  return String(val);
}

// 将飞书时间戳（毫秒）转为可读字符串
function fmtTime(v: any): string {
  if (!v) return '';
  // 飞书日期字段可能是数字时间戳
  const ts = typeof v === 'number' ? v : Number(v);
  if (!ts || ts < 0) return String(v);
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(v);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// 提取纯文本值（兼容数组、option对象、文本对象、普通字符串/数字）
// optionMap: 字段名 → (optionId → 显示文本)，用于将裸 option ID 转为可读文本
function safeText(val: any, fieldName?: string, optionMap?: Map<string, Map<string, string>>): string {
  if (!val) return '';
  if (typeof val === 'string') {
    // 纯字符串可能是 select/multiSelect 返回的 option ID（如 "optJ8uEvV3"）
    if (optionMap && fieldName && /^opt[a-zA-Z0-9]+$/.test(val)) {
      const fieldOptions = optionMap.get(fieldName);
      if (fieldOptions) {
        const resolved = fieldOptions.get(val);
        if (resolved) return resolved;
      }
    }
    return val;
  }
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) return val.map((x: any) => safeText(x, fieldName, optionMap)).filter(Boolean).join(', ');
  if (typeof val === 'object') {
    // 飞书用户对象: {users: [{name, ...}]} (lookup 引用了用户字段)
    if (Array.isArray(val.users)) return val.users.map((u: any) => u?.name || u?.id || '').filter(Boolean).join(', ');
    // 文本对象
    if (typeof val.text === 'string' && val.text.length > 0) return val.text;
    if (typeof val.name === 'string' && val.name.length > 0) {
      // name 可能是 option id，尝试从 optionMap 解析
      if (fieldName && /^opt[a-zA-Z0-9]+$/.test(val.name)) {
        if (optionMap) {
          const fieldOptions = optionMap.get(fieldName);
          if (fieldOptions) {
            const resolved = fieldOptions.get(val.name);
            if (resolved) return resolved;
          }
        }
        console.warn(`[safeText] 字段 "${fieldName}" name 为 option id:`, JSON.stringify(val));
      }
      return val.name;
    }
    if (typeof val.id === 'string') {
      if (optionMap && fieldName && /^opt[a-zA-Z0-9]+$/.test(val.id)) {
        const fieldOptions = optionMap.get(fieldName);
        if (fieldOptions) {
          const resolved = fieldOptions.get(val.id);
          if (resolved) return resolved;
        }
      }
      return val.id;
    }
    return '';
  }
  return String(val);
}

// 将 raw records 转为前端友好格式
function formatRecords(records: any[], optionMap: Map<string, Map<string, string>>) {
  return records.map((r: any) => ({
    id: r.record_id,
    记录编号: safeText(r['记录编号'], '记录编号', optionMap),
    创建时间: fmtTime(r['创建时间']),
    创建人: safeUserNames(r['创建人']),
    巡检点位: safeText(r['巡检点位'], '巡检点位', optionMap),
    监控要点: safeText(r['监控要点'], '监控要点', optionMap),
    AI识别结论: safeText(r['AI 识别结论'], 'AI 识别结论', optionMap),
    巡检单位: r['巡检单位'] || [],
    点位: safeText(r['点位'], '点位', optionMap),
    巡检规则: r['巡检规则'] || [],
    复核人员: safeText(r['复核人员'], '复核人员', optionMap),
    AI判定结果: safeText(r['AI 判定结果'], 'AI 判定结果', optionMap),
    复核员判定结果: safeText(r['复核员判定结果'], '复核员判定结果', optionMap),
    周常汇总: r['周常汇总'] || [],
    照片: (r['照片'] as any[])?.map((p: any) => ({
      file_token: p.file_token,
      name: p.name,
      size: p.size,
      record_id: r.record_id,
      url: p.url || '',
    })) || [],
  }));
}

/**
 * GET /api/inspection
 * 获取巡检记录列表
 * 支持分页: ?page=1&pageSize=20
 * 不传分页参数时，自动分页拉取全量数据
 * 支持筛选: ?filter={"condition":...}
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const optionMap = await getOptionMap();

    const reqPage = parseInt(req.query.page as string) || 0;
    const reqPageSize = parseInt(req.query.pageSize as string) || 0;
    const filter = req.query.filter as string | undefined;

    // 带分页参数的请求不走缓存（用户主动翻页/筛选，每次独立请求）
    if (reqPage > 0 && reqPageSize > 0) {
      const result = await getBitableRecords(config.tables.inspection, {
        pageSize: reqPageSize,
        filter,
      });

      if (result.code !== 0) {
        return res.status(500).json({ ok: false, error: result.msg });
      }

      const records = (result.data?.items || []).map((item: any) => ({
        ...item.fields,
        record_id: item.record_id,
      }));

      const formatted = formatRecords(records, optionMap);

      return res.json({
        ok: true,
        data: {
          records: formatted,
          total: result.data?.total || formatted.length,
          hasMore: result.data?.has_more || false,
        },
      });
    }

    // ----- 全量拉取：使用缓存 + 请求去重 -----
    const cacheKey = `full_${filter || 'none'}`;

    // 1. 已缓存的完成结果，直接返回
    const cached = dataCache.get(cacheKey);
    if (cached && cached.result && Date.now() - cached.time < DATA_CACHE_TTL) {
      console.log(`[inspection] 命中缓存 (${Math.round((Date.now() - cached.time) / 1000)}s 前)`);
      return res.json(cached.result);
    }

    // 2. 已有进行中的请求，等同一个 Promise（去重）
    if (cached && cached.promise) {
      console.log(`[inspection] 复用进行中的请求，等待完成...`);
      try {
        const result = await cached.promise;
        return res.json(result);
      } catch (err: any) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    // 3. 首次请求：发起全量扫描
    console.log(`[inspection] 开始全量拉取 (filter=${filter || 'none'})`);

    const fetchPromise = (async () => {
      const FETCH_PAGE_SIZE = 30;
      const allItems: any[] = [];
      let total = 0;
      let hasMore = false;
      let pageToken: string | undefined;
      let pageCount = 0;

      do {
        pageCount++;
        const result = await getBitableRecords(config.tables.inspection, {
          pageSize: FETCH_PAGE_SIZE,
          pageToken,
          filter,
        });

        if (result.code !== 0) {
          throw new Error(result.msg || `飞书 API 返回错误 code=${result.code}`);
        }

        const items = result.data?.items || [];
        allItems.push(...items);
        total = result.data?.total || 0;
        hasMore = result.data?.has_more || false;
        pageToken = result.data?.page_token;

        console.log(`[inspection] 第 ${pageCount} 页拉取完成 (${items.length} 条, 累计 ${allItems.length}/${total})`);
      } while (hasMore && pageToken);

      const records = allItems.map((item: any) => ({
        ...item.fields,
        record_id: item.record_id,
      }));

      // 打印首条记录用于排查
      if (records.length > 0) {
        console.log('[inspection] 首条记录 raw fields keys:', Object.keys(records[0]).filter(k => !k.startsWith('_')).slice(0, 20));
        console.log('[inspection] 首条记录 监控要点 raw:', JSON.stringify(records[0]['监控要点']));
        console.log('[inspection] 首条记录 复核人员 raw:', JSON.stringify(records[0]['复核人员']));
        console.log('[inspection] 首条记录 巡检点位 raw:', JSON.stringify(records[0]['巡检点位']));
      }

      const formatted = formatRecords(records, optionMap);

      return {
        ok: true,
        data: {
          records: formatted,
          total: total || formatted.length,
          hasMore,
        },
      };
    })();

    // 存入 cache（先存 promise，完成后替换为 result）
    dataCache.set(cacheKey, { promise: fetchPromise, result: null, time: Date.now() });

    try {
      const result = await fetchPromise;
      // 完成后替换缓存为 result
      dataCache.set(cacheKey, { promise: null as any, result, time: Date.now() });
      return res.json(result);
    } catch (err: any) {
      dataCache.delete(cacheKey); // 失败了清除缓存，下次重试
      console.error('巡检记录查询失败:', err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  } catch (err: any) {
    console.error('巡检记录查询失败:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/inspection/:recordId
 * 获取单条巡检记录详情
 */
router.get('/:recordId', async (req: Request, res: Response) => {
  try {
    const { recordId } = req.params;
    const optionMap = await getOptionMap();

    const result = await getBitableRecord(config.tables.inspection, recordId);

    if (result.code !== 0) {
      return res.status(result.code === 91403 ? 404 : 500).json({ ok: false, error: result.msg });
    }

    const rec = result.data?.record;
    if (!rec) {
      return res.status(404).json({ ok: false, error: '记录不存在' });
    }

    // 复用 formatRecords
    const rawRecord = { ...rec.fields, record_id: rec.record_id };
    const [record] = formatRecords([rawRecord], optionMap);

    return res.json({ ok: true, data: record });
  } catch (err: any) {
    console.error('巡检记录详情查询失败:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;

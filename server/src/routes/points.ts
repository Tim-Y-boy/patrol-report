import { Router, Request, Response } from 'express';
import { getBitableRecords } from '../feishu/client.js';
import { config } from '../config.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await getBitableRecords(config.tables.points, { pageSize: 100 });

    if (result.code !== 0) {
      return res.status(500).json({ ok: false, error: result.msg });
    }

    const items = result.data?.items || [];
    const records = items.map((item: any) => ({
      id: item.record_id,
      ...item.fields,
    }));

    return res.json({
      ok: true,
      data: { records, total: records.length },
    });
  } catch (err: any) {
    console.error('巡检点位查询失败:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;

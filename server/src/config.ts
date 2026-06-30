import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  feishu: {
    appId: process.env.FEISHU_APP_ID || '',
    appSecret: process.env.FEISHU_APP_SECRET || '',
    baseToken: process.env.FEISHU_BASE_TOKEN || '',
  },
  tables: {
    inspection: process.env.FEISHU_TABLE_INSPECTION || 'tbld8GxGG5XELZDj',
    workorder: process.env.FEISHU_TABLE_WORKORDER || 'tbl1XYd4yvjj72GG',
    weekly: process.env.FEISHU_TABLE_WEEKLY || 'tblzuruQ5xOg66Yc',
    rules: process.env.FEISHU_TABLE_RULES || 'tbl1b4jJwPIatlUW',
    points: process.env.FEISHU_TABLE_POINTS || 'tblXRCwHOKmINje8',
    units: process.env.FEISHU_TABLE_UNITS || 'tblcwvhIkysBvCm4',
  },
  port: parseInt(process.env.SERVER_PORT || '3001', 10),
};

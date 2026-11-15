import fs from 'fs';
import path from 'path';
import mysql, { Pool, PoolConnection } from 'mysql2/promise';

export interface MysqlConfigFile {
  host: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  enabled?: boolean;
}

const MYSQL_CONFIG_PATH = path.resolve(process.cwd(), 'mysql-config.json');

declare global {
  var _mahasanghMysqlPool: Pool | undefined;
  var _mahasanghMysqlSchemaPromise: Promise<void> | undefined;
}

export function loadMysqlConfig(): MysqlConfigFile | null {
  let fileCfg: Partial<MysqlConfigFile> = {};
  try {
    if (fs.existsSync(MYSQL_CONFIG_PATH)) {
      fileCfg = JSON.parse(fs.readFileSync(MYSQL_CONFIG_PATH, 'utf-8'));
    }
  } catch (err) {
    console.warn('Could not read mysql-config.json:', err);
  }

  const host = String(fileCfg.host || process.env.MYSQL_HOST || '').trim();
  const database = String(fileCfg.database || process.env.MYSQL_DATABASE || '').trim();
  const user = String(fileCfg.user || process.env.MYSQL_USER || '').trim();
  const password = String(fileCfg.password || process.env.MYSQL_PASSWORD || '');
  const portRaw = Number(fileCfg.port || process.env.MYSQL_PORT || 3306);
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 3306;

  if (!host || !database || !user) {
    return null;
  }

  if (fileCfg.enabled === false) {
    return null;
  }

  return { host, port, database, user, password, enabled: true };
}

export function isMysqlConfigured(): boolean {
  return Boolean(loadMysqlConfig());
}

export function isMysqlActive(): boolean {
  const backend = String(process.env.DB_BACKEND || '').trim().toLowerCase();
  if (backend === 'firebase') return false;
  if (backend === 'mysql') return isMysqlConfigured();
  // Auto-enable MySQL if mysql-config.json or MYSQL_* env vars are explicitly configured
  return isMysqlConfigured();
}

export function getMysqlPool(): Pool {
  if (global._mahasanghMysqlPool) {
    return global._mahasanghMysqlPool;
  }

  const cfg = loadMysqlConfig();
  if (!cfg) {
    throw new Error('MySQL configuration is missing (MYSQL_HOST / mysql-config.json).');
  }

  global._mahasanghMysqlPool = mysql.createPool({
    host: cfg.host,
    port: cfg.port || 3306,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 15000,
  });

  return global._mahasanghMysqlPool;
}

export async function ensureMysqlSchema(): Promise<void> {
  if (!isMysqlConfigured()) return;
  if (global._mahasanghMysqlSchemaPromise) {
    return global._mahasanghMysqlSchemaPromise;
  }

  global._mahasanghMysqlSchemaPromise = (async () => {
    const schemaPath = path.resolve(process.cwd(), 'database', 'schema.sql');
    if (!fs.existsSync(schemaPath)) return;
    const rawSql = fs.readFileSync(schemaPath, 'utf-8');
    const withoutComments = rawSql.replace(/^\s*--.*$/gm, '');
    const statements = withoutComments
      .split(/;\s*(?:\r?\n|$)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const pool = getMysqlPool();
    for (const stmt of statements) {
      try {
        await pool.query(stmt);
      } catch (err) {
        if (/^SET\s+time_zone/i.test(stmt)) {
          console.warn('Skipping SET time_zone on MySQL host:', err);
          continue;
        }
        throw err;
      }
    }
  })().catch((err) => {
    global._mahasanghMysqlSchemaPromise = undefined;
    throw err;
  });

  return global._mahasanghMysqlSchemaPromise;
}

export async function withMysqlTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const res = await fn(conn);
    await conn.commit();
    return res;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {}
    throw err;
  } finally {
    conn.release();
  }
}

import fs from 'fs';
import path from 'path';
import mysql, { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import {
  MYSQL_SCHEMA_MANIFEST,
  MysqlSchemaAuditReport,
  MysqlTableAuditSummary,
  buildAlterAddColumnSql,
  buildAlterAddIndexSql,
  buildCreateTableSql,
  computeSchemaDiff,
  getTotalManifestColumnsCount,
  isRecoverableMysqlSchemaError,
} from './mysqlSchemaManifest';

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
  var _mahasanghLastSchemaReport: MysqlSchemaAuditReport | undefined;
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
  if (backend === 'mock') return false;
  if (backend === 'mysql') return isMysqlConfigured();
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

async function readInformationSchemaState(pool: Pool): Promise<{
  existingTables: Set<string>;
  existingColumnsByTable: Map<string, Set<string>>;
  existingIndexesByTable: Map<string, Set<string>>;
}> {
  const existingTables = new Set<string>();
  const existingColumnsByTable = new Map<string, Set<string>>();
  const existingIndexesByTable = new Map<string, Set<string>>();

  const [tableRows] = await pool.query<RowDataPacket[]>(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
  );
  for (const r of tableRows) {
    const t = String(r.TABLE_NAME || r.table_name || '').toLowerCase();
    if (t) existingTables.add(t);
  }

  const [colRows] = await pool.query<RowDataPacket[]>(
    'SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()'
  );
  for (const r of colRows) {
    const t = String(r.TABLE_NAME || r.table_name || '').toLowerCase();
    const c = String(r.COLUMN_NAME || r.column_name || '').toLowerCase();
    if (!t || !c) continue;
    if (!existingColumnsByTable.has(t)) existingColumnsByTable.set(t, new Set());
    existingColumnsByTable.get(t)!.add(c);
  }

  const [idxRows] = await pool.query<RowDataPacket[]>(
    'SELECT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()'
  );
  for (const r of idxRows) {
    const t = String(r.TABLE_NAME || r.table_name || '').toLowerCase();
    const idx = String(r.INDEX_NAME || r.index_name || '').toLowerCase();
    if (!t || !idx) continue;
    if (!existingIndexesByTable.has(t)) existingIndexesByTable.set(t, new Set());
    existingIndexesByTable.get(t)!.add(idx);
  }

  return { existingTables, existingColumnsByTable, existingIndexesByTable };
}

async function ensureDefaultSeedRows(pool: Pool): Promise<void> {
  try {
    await pool.query(
      `INSERT IGNORE INTO \`system_settings\` (setting_key, setting_json, updated_at)
       VALUES
         ('member_counter', '{"totalApproved":1728,"lastMemberNumber":1728,"lastUpdated":""}', ''),
         ('admin_auth', '{"email":"padmakarshinde043@gmail.com","password":"Padmakar@2027","updatedAt":""}', '')`
    );
    await pool.query(
      `INSERT IGNORE INTO \`site_stats\` (stat_key, total_count, today_count, last_date, last_updated)
       VALUES ('visits', 5155, 0, '', '')`
    );
  } catch (err) {
    console.warn('Default seed row notice:', err);
  }
}

export function buildMockSchemaAuditPreview(): MysqlSchemaAuditReport {
  return {
    status: 'mock_preview',
    activeBackend: 'mock',
    checkedAt: new Date().toISOString(),
    tablesChecked: MYSQL_SCHEMA_MANIFEST.length,
    totalExpectedColumns: getTotalManifestColumnsCount(),
    createdTables: [],
    addedColumns: [],
    addedIndexes: [],
    errors: [],
    tables: MYSQL_SCHEMA_MANIFEST.map((spec) => ({
      table: spec.table,
      marathiLabel: spec.marathiLabel,
      status: 'ok',
      expectedColumns: spec.columns.length,
      existingColumnsBefore: spec.columns.length,
      existingColumnsAfter: spec.columns.length,
      addedColumns: [],
      addedIndexes: [],
      missingColumnsRemaining: [],
    })),
  };
}

export async function runMysqlSchemaAuditAndHeal(repair = true): Promise<MysqlSchemaAuditReport> {
  if (!isMysqlConfigured()) {
    return buildMockSchemaAuditPreview();
  }

  const pool = getMysqlPool();
  const checkedAt = new Date().toISOString();
  const createdTables: string[] = [];
  const addedColumns: Array<{ table: string; column: string }> = [];
  const addedIndexes: Array<{ table: string; index: string }> = [];
  const errors: string[] = [];

  try {
    await pool.query('SET NAMES utf8mb4');
  } catch {}

  const beforeState = await readInformationSchemaState(pool);
  const diff = computeSchemaDiff(beforeState);

  if (repair) {
    // 1. Create any completely missing tables
    for (const spec of diff.tablesToCreate) {
      try {
        await pool.query(buildCreateTableSql(spec));
        createdTables.push(spec.table);
      } catch (err: any) {
        errors.push(`Table ${spec.table} create failed: ${err?.message || String(err)}`);
      }
    }

    // 2. Add any missing columns to pre-existing tables
    for (const item of diff.columnsToAdd) {
      try {
        await pool.query(buildAlterAddColumnSql(item.table, item.column));
        addedColumns.push({ table: item.table, column: item.column.name });
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (!/Duplicate column name/i.test(msg)) {
          errors.push(`Column ${item.table}.${item.column.name} add failed: ${msg}`);
        }
      }
    }

    // 3. Add any missing indexes (non-fatal if legacy data has duplicates on unique index)
    for (const item of diff.indexesToAdd) {
      try {
        await pool.query(buildAlterAddIndexSql(item.table, item.index));
        addedIndexes.push({ table: item.table, index: item.index.name });
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (!/Duplicate key name/i.test(msg)) {
          console.warn(`Index ${item.table}.${item.index.name} notice:`, msg);
        }
      }
    }

    await ensureDefaultSeedRows(pool);
  }

  const afterState = repair ? await readInformationSchemaState(pool) : beforeState;
  const tables: MysqlTableAuditSummary[] = MYSQL_SCHEMA_MANIFEST.map((spec) => {
    const key = spec.table.toLowerCase();
    const beforeCols = beforeState.existingColumnsByTable.get(key) || new Set<string>();
    const afterCols = afterState.existingColumnsByTable.get(key) || new Set<string>();
    const wasCreated = createdTables.includes(spec.table);
    const colsAddedForTable = addedColumns.filter((c) => c.table === spec.table).map((c) => c.column);
    const idxsAddedForTable = addedIndexes.filter((i) => i.table === spec.table).map((i) => i.index);
    const missingRemaining = spec.columns
      .map((c) => c.name)
      .filter((colName) => !afterCols.has(colName.toLowerCase()));
    const tableErrors = errors.filter((e) => e.includes(` ${spec.table}.`) || e.includes(`Table ${spec.table} `));

    let status: MysqlTableAuditSummary['status'] = 'ok';
    if (tableErrors.length > 0 || missingRemaining.length > 0) {
      status = 'error';
    } else if (wasCreated) {
      status = 'created_table';
    } else if (colsAddedForTable.length > 0 || idxsAddedForTable.length > 0) {
      status = 'repaired_columns';
    }

    return {
      table: spec.table,
      marathiLabel: spec.marathiLabel,
      status,
      expectedColumns: spec.columns.length,
      existingColumnsBefore: beforeCols.size,
      existingColumnsAfter: afterCols.size,
      addedColumns: colsAddedForTable,
      addedIndexes: idxsAddedForTable,
      missingColumnsRemaining: missingRemaining,
      ...(tableErrors.length > 0 ? { errorMessage: tableErrors.join('; ') } : {}),
    };
  });

  const report: MysqlSchemaAuditReport = {
    status:
      errors.length > 0 || tables.some((t) => t.missingColumnsRemaining.length > 0)
        ? 'partial_error'
        : createdTables.length > 0 || addedColumns.length > 0 || addedIndexes.length > 0
          ? 'repaired'
          : 'healthy',
    activeBackend: 'mysql',
    checkedAt,
    tablesChecked: MYSQL_SCHEMA_MANIFEST.length,
    totalExpectedColumns: getTotalManifestColumnsCount(),
    createdTables,
    addedColumns,
    addedIndexes,
    errors,
    tables,
  };

  global._mahasanghLastSchemaReport = report;
  if (createdTables.length > 0 || addedColumns.length > 0) {
    console.info(
      `[MySQL Schema Auto-Heal] Created tables: [${createdTables.join(', ')}], Added columns: [${addedColumns
        .map((c) => `${c.table}.${c.column}`)
        .join(', ')}]`
    );
  }
  return report;
}

export function getLastSchemaAuditReport(): MysqlSchemaAuditReport | null {
  return global._mahasanghLastSchemaReport || null;
}

export async function ensureMysqlSchema(force = false): Promise<void> {
  if (!isMysqlConfigured()) return;
  if (!force && global._mahasanghMysqlSchemaPromise) {
    return global._mahasanghMysqlSchemaPromise;
  }

  global._mahasanghMysqlSchemaPromise = runMysqlSchemaAuditAndHeal(true)
    .then(() => undefined)
    .catch((err) => {
      global._mahasanghMysqlSchemaPromise = undefined;
      throw err;
    });

  return global._mahasanghMysqlSchemaPromise;
}

export async function withMysqlSchemaRetry<T>(fn: () => Promise<T>): Promise<T> {
  await ensureMysqlSchema();
  try {
    return await fn();
  } catch (err: any) {
    if (isRecoverableMysqlSchemaError(err)) {
      console.warn('[MySQL Schema Self-Heal] Detected missing table/column at runtime, repairing & retrying:', err?.message || err);
      await ensureMysqlSchema(true);
      return await fn();
    }
    throw err;
  }
}

export async function withMysqlTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  return withMysqlSchemaRetry(async () => {
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
  });
}

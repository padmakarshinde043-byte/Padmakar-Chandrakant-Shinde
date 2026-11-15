import fs from 'fs';
import path from 'path';
import { Firestore, collection, doc, getDoc, getDocs } from 'firebase/firestore';
import {
  MigrationDataset,
  MigrationCounts,
  generateFullSqlDump,
  getMigrationCounts,
} from './sqlFormatter';
import {
  mysqlUpsertApplication,
  mysqlSaveNews,
  mysqlSaveLatestBanner,
  mysqlSaveGovOrder,
  mysqlSaveContact,
  mysqlSaveSubAdmin,
  mysqlSaveLeaders,
  mysqlSaveOfficial,
  mysqlSetDistrictPassword,
  mysqlSetPresidentPassword,
} from './mysqlRepository';
import { ensureMysqlSchema, getMysqlPool } from './mysqlPool';

const RTDB_BASE_URL = 'https://rk2026-207ee-default-rtdb.firebaseio.com';

async function fetchRtdbJson<T>(nodePath: string): Promise<T | null> {
  const res = await fetch(`${RTDB_BASE_URL}/${nodePath}.json`);
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function collectFullFirebaseDataset(db: Firestore): Promise<{
  dataset: MigrationDataset;
  counts: MigrationCounts;
  warnings: string[];
}> {
  const warnings: string[] = [];

  const readCollection = async (name: string): Promise<Record<string, any>[]> => {
    try {
      const snap = await getDocs(collection(db, name));
      const rows: Record<string, any>[] = [];
      snap.forEach((d) => rows.push({ ...d.data(), id: d.id }));
      return rows;
    } catch (err: any) {
      warnings.push(`Firestore "${name}" read warning: ${err?.message || String(err)}`);
      return [];
    }
  };

  const readDoc = async (colName: string, docId: string): Promise<Record<string, any> | null> => {
    try {
      const snap = await getDoc(doc(db, colName, docId));
      return snap.exists() ? (snap.data() as Record<string, any>) : null;
    } catch (err: any) {
      warnings.push(`Firestore "${colName}/${docId}" read warning: ${err?.message || String(err)}`);
      return null;
    }
  };

  const [
    applications,
    news,
    rawBanners,
    govOrders,
    contacts,
    subAdmins,
    adminAuth,
    memberCounter,
    siteStats,
    firestoreLeadership,
  ] = await Promise.all([
    readCollection('applications'),
    readCollection('news'),
    readCollection('latest_banners'),
    readCollection('gov_orders'),
    readCollection('contacts'),
    readCollection('sub_admins'),
    readDoc('settings', 'admin_auth'),
    readDoc('settings', 'member_counter'),
    readDoc('site_stats', 'visits'),
    readCollection('leadership'),
  ]);

  const latestBanners = rawBanners.filter((b) => b.id !== 'banner-1' && b.id !== 'banner-2');

  // Second Firebase (RTDB: rk2026-207ee)
  let officials: Record<string, any>[] = [];
  let rtdbLeaders: Record<string, any>[] = [];
  let appointedPosts: Record<string, any>[] = [];
  let districtPasswords: Record<string, string> = {};
  let presidentPassword: string | null = null;
  let leadershipVersion: string | number | null = null;

  try {
    const [offObj, leadersArr, postsArr, distPwdObj, presPwd, leadVer] = await Promise.all([
      fetchRtdbJson<Record<string, any>>('officials').catch(() => null),
      fetchRtdbJson<Record<string, any>[]>('dynamic_leaders').catch(() => null),
      fetchRtdbJson<Record<string, any>[]>('custom_appointed_posts_v2').catch(() => null),
      fetchRtdbJson<Record<string, string>>('district_passwords').catch(() => null),
      fetchRtdbJson<string>('president_password').catch(() => null),
      fetchRtdbJson<string | number>('leadership_version').catch(() => null),
    ]);

    if (offObj && typeof offObj === 'object') {
      officials = Object.keys(offObj).map((k) => ({ ...offObj[k], id: k }));
    }
    if (Array.isArray(leadersArr) && leadersArr.length > 0) {
      rtdbLeaders = leadersArr;
    }
    if (Array.isArray(postsArr)) {
      appointedPosts = postsArr;
    }
    if (distPwdObj && typeof distPwdObj === 'object') {
      districtPasswords = distPwdObj;
    }
    if (typeof presPwd === 'string' && presPwd.trim()) {
      presidentPassword = presPwd.trim();
    }
    if (leadVer !== null && leadVer !== undefined) {
      leadershipVersion = leadVer;
    }
  } catch (err: any) {
    warnings.push(`RTDB read warning: ${err?.message || String(err)}`);
  }

  // Prefer RTDB dynamic_leaders (authoritative) if present, else Firestore leadership
  const leaders =
    rtdbLeaders.length > 0
      ? rtdbLeaders
      : firestoreLeadership.sort((a, b) => (a.orderIndex ?? 999) - (b.orderIndex ?? 999));

  const dataset: MigrationDataset = {
    applications,
    news,
    latestBanners,
    govOrders,
    contacts,
    subAdmins,
    adminAuth,
    memberCounter,
    siteStats,
    leaders,
    officials,
    appointedPosts,
    districtPasswords,
    presidentPassword,
    leadershipVersion,
  };

  return {
    dataset,
    counts: getMigrationCounts(dataset),
    warnings,
  };
}

export async function exportFullFirebaseSqlDump(db: Firestore): Promise<{
  sql: string;
  counts: MigrationCounts;
  warnings: string[];
}> {
  const schemaPath = path.resolve(process.cwd(), 'database', 'schema.sql');
  const schemaSql = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf-8') : '';
  const { dataset, counts, warnings } = await collectFullFirebaseDataset(db);
  const sql = generateFullSqlDump(schemaSql, dataset);
  return { sql, counts, warnings };
}

async function runInBatches<T>(items: T[], batchSize: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    await Promise.all(chunk.map((item, idx) => fn(item, i + idx)));
  }
}

export async function syncFirebaseDatasetIntoMysql(dataset: MigrationDataset): Promise<MigrationCounts> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();

  await runInBatches(dataset.applications, 15, async (app) => {
    await mysqlUpsertApplication(app);
  });
  await runInBatches(dataset.news, 15, async (n) => {
    await mysqlSaveNews(n as any);
  });
  await runInBatches(dataset.latestBanners, 15, async (b) => {
    await mysqlSaveLatestBanner(b as any);
  });
  await runInBatches(dataset.govOrders, 15, async (g) => {
    await mysqlSaveGovOrder(g as any);
  });
  await runInBatches(dataset.contacts, 15, async (c) => {
    await mysqlSaveContact(c);
  });
  await runInBatches(dataset.subAdmins, 15, async (a) => {
    await mysqlSaveSubAdmin(a);
  });

  if (dataset.adminAuth) {
    await pool.execute(
      `INSERT INTO \`system_settings\` (setting_key, setting_json, updated_at)
       VALUES ('admin_auth', ?, ?)
       ON DUPLICATE KEY UPDATE setting_json = VALUES(setting_json), updated_at = VALUES(updated_at)`,
      [JSON.stringify(dataset.adminAuth), String(dataset.adminAuth.updatedAt || new Date().toISOString())]
    );
  }
  if (dataset.memberCounter) {
    await pool.execute(
      `INSERT INTO \`system_settings\` (setting_key, setting_json, updated_at)
       VALUES ('member_counter', ?, ?)
       ON DUPLICATE KEY UPDATE setting_json = VALUES(setting_json), updated_at = VALUES(updated_at)`,
      [JSON.stringify(dataset.memberCounter), String(dataset.memberCounter.lastUpdated || new Date().toISOString())]
    );
  }
  if (dataset.siteStats) {
    await pool.execute(
      `INSERT INTO \`site_stats\` (stat_key, total_count, today_count, last_date, last_updated)
       VALUES ('visits', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         total_count = GREATEST(total_count, VALUES(total_count)),
         today_count = VALUES(today_count),
         last_date = VALUES(last_date),
         last_updated = VALUES(last_updated)`,
      [
        Math.max(Number(dataset.siteStats.total || 5155), 5155),
        Math.max(Number(dataset.siteStats.today || 0), 0),
        String(dataset.siteStats.lastDate || ''),
        String(dataset.siteStats.lastUpdated || new Date().toISOString()),
      ]
    );
  }

  if (dataset.leaders.length > 0) {
    await mysqlSaveLeaders(dataset.leaders as any);
  }
  await runInBatches(dataset.officials, 15, async (off) => {
    await mysqlSaveOfficial(off as any);
  });
  await runInBatches(dataset.appointedPosts, 15, async (p, i) => {
    await pool.execute(
      `INSERT INTO \`appointed_posts\` (id, sort_order, title, level, extra_json)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order), title = VALUES(title), level = VALUES(level), extra_json = VALUES(extra_json)`,
      [
        String(p.id || `post_${i}`),
        i,
        String(p.title || p.name || ''),
        String(p.level || p.category || 'district'),
        JSON.stringify(p),
      ]
    );
  });
  for (const [dist, pwd] of Object.entries(dataset.districtPasswords || {})) {
    await mysqlSetDistrictPassword(dist, pwd);
  }
  if (dataset.presidentPassword) {
    await mysqlSetPresidentPassword(dataset.presidentPassword);
  }

  await pool.execute(
    `INSERT INTO \`system_settings\` (setting_key, setting_json, updated_at)
     VALUES ('initial_firebase_migration_done', ?, ?)
     ON DUPLICATE KEY UPDATE setting_json = VALUES(setting_json), updated_at = VALUES(updated_at)`,
    [JSON.stringify({ done: true, counts: getMigrationCounts(dataset) }), new Date().toISOString()]
  );

  return getMigrationCounts(dataset);
}

let bootMigrationCompleted = false;
let bootMigrationPromise: Promise<void> | null = null;

/**
 * Automatically ensures MySQL schema exists and imports all data from BOTH Firebase accounts
 * on the very first boot when MySQL is empty, so non-technical admins never need phpMyAdmin/curl.
 */
export function triggerInitialFirebaseMigrationOnBoot(
  dbOrGetter: Firestore | null | (() => Firestore | null)
): void {
  if (bootMigrationCompleted || bootMigrationPromise) return;

  bootMigrationPromise = (async () => {
    try {
      await ensureMysqlSchema();
      const pool = getMysqlPool();
      const [flagRows] = await pool.query<any[]>(
        "SELECT `setting_key` FROM `system_settings` WHERE `setting_key` = 'initial_firebase_migration_done' LIMIT 1"
      );
      if (flagRows && flagRows.length > 0) {
        bootMigrationCompleted = true;
        return;
      }

      const [appCountRows] = await pool.query<any[]>(
        'SELECT COUNT(*) AS cnt FROM `applications`'
      );
      const existingAppsCount = Number(appCountRows?.[0]?.cnt || 0);
      if (existingAppsCount > 0) {
        // Data already imported manually (e.g., via phpMyAdmin); mark done so we never overwrite
        await pool.execute(
          `INSERT IGNORE INTO \`system_settings\` (setting_key, setting_json, updated_at)
           VALUES ('initial_firebase_migration_done', ?, ?)`,
          [JSON.stringify({ done: true, source: 'existing_rows', existingAppsCount }), new Date().toISOString()]
        );
        bootMigrationCompleted = true;
        return;
      }

      const db = typeof dbOrGetter === 'function' ? dbOrGetter() : dbOrGetter;
      if (!db) {
        console.warn('Auto-migration skipped: Firestore unavailable.');
        return;
      }

      console.log('⏳ HostKarle MySQL is empty — automatically migrating data from BOTH Firebase accounts...');
      const { dataset, warnings } = await collectFullFirebaseDataset(db);
      const counts = await syncFirebaseDatasetIntoMysql(dataset);
      console.log('✓ Auto-migration to HostKarle MySQL complete:', JSON.stringify(counts), warnings);
      bootMigrationCompleted = true;
    } catch (err) {
      console.error('Auto-migration error (will retry on next request/boot):', err);
    } finally {
      bootMigrationPromise = null;
    }
  })();
}

export async function waitForInitialMysqlMigrationIfRunning(): Promise<void> {
  if (bootMigrationCompleted) return;
  if (bootMigrationPromise) {
    await bootMigrationPromise;
  }
}


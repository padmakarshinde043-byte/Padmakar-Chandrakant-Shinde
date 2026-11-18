import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
type Firestore = any;
import { ensureMysqlSchema, getMysqlPool, isMysqlActive } from './mysqlPool';
import {
  mysqlListApplications,
  mysqlListNews,
  mysqlListLatestBanners,
  mysqlListGovOrders,
  mysqlListContacts,
  mysqlListSubAdmins,
  mysqlListLeaders,
  mysqlListOfficials,
  mysqlListAppointedPosts,
  mysqlListDistrictPasswords,
  mysqlGetPresidentPassword,
  mysqlGetLeadershipVersion,
  mysqlListSystemSettingsMap,
  mysqlGetSiteStatsRaw,
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
  mysqlSaveSystemSetting,
} from './mysqlRepository';
import {
  MigrationCounts,
  MigrationDataset,
  generateFullSqlDump,
  getMigrationCounts,
} from './sqlFormatter';

const BACKUPS_DIR = path.resolve(process.cwd(), 'backups');
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const MAX_ASSET_FILE_BYTES = 5 * 1024 * 1024; // 5MB per public file

export interface PublicAssetBackupEntry {
  relativePath: string;
  sizeBytes: number;
  contentBase64: string;
}

export interface FullWebsiteBackupBundle {
  format: 'mahasangh-full-backup-v1';
  createdAt: string;
  createdBy: string;
  sourceBackend: 'mysql' | 'mock' | 'firebase';
  appVersion: string;
  database: MigrationDataset;
  extraSystemSettings: Record<string, any>;
  websiteAssets: {
    publicFiles: PublicAssetBackupEntry[];
    publicFileCount: number;
  };
  sqlDump?: string;
  checksumSha256: string;
}

export interface BackupSnapshotSummary {
  fileName: string;
  createdAt: string;
  createdBy: string;
  sourceBackend: 'mysql' | 'mock' | 'firebase';
  sizeBytes: number;
  publicFileCount: number;
  counts: MigrationCounts;
}

function ensureBackupsDir(): void {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

export function sanitizeSnapshotFileName(raw: string): string {
  const base = path.basename(String(raw || '').trim());
  if (!base || !/^[a-zA-Z0-9._-]+$/.test(base) || !base.endsWith('.mhsbak.gz')) {
    throw new Error('अवैध बॅकअप फाइलचे नाव (Invalid snapshot filename).');
  }
  return base;
}

export function computeBackupChecksum(payload: {
  database: MigrationDataset;
  extraSystemSettings: Record<string, any>;
  websiteAssets: { publicFiles: PublicAssetBackupEntry[]; publicFileCount: number };
}): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

function collectPublicWebsiteAssets(): PublicAssetBackupEntry[] {
  if (!fs.existsSync(PUBLIC_DIR)) return [];
  const entries: PublicAssetBackupEntry[] = [];

  const walk = (dirPath: string) => {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      const rel = path.relative(PUBLIC_DIR, fullPath).replace(/\\/g, '/');
      if (!rel || rel === 'assets/aistudio' || rel.startsWith('assets/aistudio/')) {
        continue;
      }
      if (item.isDirectory()) {
        walk(fullPath);
      } else if (item.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size <= MAX_ASSET_FILE_BYTES) {
            const buf = fs.readFileSync(fullPath);
            entries.push({
              relativePath: rel,
              sizeBytes: stat.size,
              contentBase64: buf.toString('base64'),
            });
          }
        } catch (err) {
          console.warn(`Could not read public asset ${rel}:`, err);
        }
      }
    }
  };

  walk(PUBLIC_DIR);
  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return entries;
}

function restorePublicWebsiteAssets(files: PublicAssetBackupEntry[]): number {
  if (!Array.isArray(files) || files.length === 0) return 0;
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }
  let restoredCount = 0;
  for (const entry of files) {
    const rel = String(entry?.relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!rel || rel.includes('..') || rel.startsWith('assets/aistudio')) {
      continue;
    }
    const targetPath = path.resolve(PUBLIC_DIR, rel);
    if (!targetPath.startsWith(PUBLIC_DIR + path.sep)) {
      continue;
    }
    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, Buffer.from(String(entry.contentBase64 || ''), 'base64'));
      restoredCount++;
    } catch (err) {
      console.warn(`Could not restore public asset ${rel}:`, err);
    }
  }
  return restoredCount;
}

async function readAppPackageVersion(): Promise<string> {
  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return String(pkg.version || '1.0.0');
    }
  } catch {}
  return '1.0.0';
}

export async function collectActiveWebsiteAndDatabaseBackup(params: {
  createdBy: string;
  firestoreDb: Firestore | null;
}): Promise<{ bundle: FullWebsiteBackupBundle; counts: MigrationCounts; warnings: string[] }> {
  const warnings: string[] = [];
  const mysqlMode = isMysqlActive();
  let dataset: MigrationDataset;
  let extraSystemSettings: Record<string, any> = {};

  if (mysqlMode) {
    const [
      applications,
      news,
      latestBanners,
      govOrders,
      contacts,
      subAdmins,
      leaders,
      officials,
      appointedPosts,
      districtPasswords,
      presidentPassword,
      leadershipVersion,
      settingsMap,
      siteStats,
    ] = await Promise.all([
      mysqlListApplications(),
      mysqlListNews(),
      mysqlListLatestBanners(),
      mysqlListGovOrders(),
      mysqlListContacts(),
      mysqlListSubAdmins(),
      mysqlListLeaders(),
      mysqlListOfficials(),
      mysqlListAppointedPosts(),
      mysqlListDistrictPasswords(),
      mysqlGetPresidentPassword(),
      mysqlGetLeadershipVersion(),
      mysqlListSystemSettingsMap(),
      mysqlGetSiteStatsRaw(),
    ]);

    extraSystemSettings = settingsMap || {};
    dataset = {
      applications,
      news,
      latestBanners,
      govOrders,
      contacts,
      subAdmins,
      adminAuth: settingsMap.admin_auth || null,
      memberCounter: settingsMap.member_counter || null,
      siteStats: siteStats || null,
      leaders,
      officials,
      appointedPosts,
      districtPasswords,
      presidentPassword,
      leadershipVersion,
    };
  } else {
    dataset = {
      applications: [],
      news: [],
      latestBanners: [],
      govOrders: [],
      contacts: [],
      subAdmins: [],
      leaders: [],
      officials: [],
      appointedPosts: [],
      districtPasswords: {},
      adminAuth: null,
      memberCounter: null,
      siteStats: null,
      presidentPassword: null,
      leadershipVersion: null,
    };
  }

  const publicFiles = collectPublicWebsiteAssets();
  const websiteAssets = {
    publicFiles,
    publicFileCount: publicFiles.length,
  };

  let sqlDump = '';
  try {
    const schemaPath = path.resolve(process.cwd(), 'database', 'schema.sql');
    const schemaSql = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf-8') : '';
    sqlDump = generateFullSqlDump(schemaSql, dataset);
  } catch (err: any) {
    warnings.push(`SQL dump generation notice: ${err?.message || String(err)}`);
  }

  const checksumSha256 = computeBackupChecksum({
    database: dataset,
    extraSystemSettings,
    websiteAssets,
  });

  const bundle: FullWebsiteBackupBundle = {
    format: 'mahasangh-full-backup-v1',
    createdAt: new Date().toISOString(),
    createdBy: params.createdBy || 'super_admin',
    sourceBackend: mysqlMode ? 'mysql' : 'mock',
    appVersion: await readAppPackageVersion(),
    database: dataset,
    extraSystemSettings,
    websiteAssets,
    sqlDump,
    checksumSha256,
  };

  return {
    bundle,
    counts: getMigrationCounts(dataset),
    warnings,
  };
}

export async function createAndSaveBackupSnapshot(params: {
  createdBy: string;
  firestoreDb: Firestore | null;
  prefix?: string;
}): Promise<{
  snapshot: BackupSnapshotSummary;
  gzipBuffer: Buffer;
  warnings: string[];
}> {
  ensureBackupsDir();
  const { bundle, counts, warnings } = await collectActiveWebsiteAndDatabaseBackup(params);
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '_')
    .slice(0, 15);
  const prefix = (params.prefix || 'mahasangh_backup').replace(/[^a-zA-Z0-9_-]/g, '');
  const fileName = `${prefix}_${stamp}.mhsbak.gz`;

  const jsonBuffer = Buffer.from(JSON.stringify(bundle), 'utf-8');
  const gzipBuffer = zlib.gzipSync(jsonBuffer, { level: 6 });

  const filePath = path.join(BACKUPS_DIR, fileName);
  fs.writeFileSync(filePath, gzipBuffer);

  const summary: BackupSnapshotSummary = {
    fileName,
    createdAt: bundle.createdAt,
    createdBy: bundle.createdBy,
    sourceBackend: bundle.sourceBackend,
    sizeBytes: gzipBuffer.length,
    publicFileCount: bundle.websiteAssets.publicFileCount,
    counts,
  };
  fs.writeFileSync(`${filePath}.meta.json`, JSON.stringify(summary, null, 2), 'utf-8');

  return { snapshot: summary, gzipBuffer, warnings };
}

export function listBackupSnapshots(): BackupSnapshotSummary[] {
  ensureBackupsDir();
  const files = fs.readdirSync(BACKUPS_DIR);
  const summaries: BackupSnapshotSummary[] = [];

  for (const f of files) {
    if (!f.endsWith('.mhsbak.gz.meta.json')) continue;
    try {
      const parsed = JSON.parse(
        fs.readFileSync(path.join(BACKUPS_DIR, f), 'utf-8')
      ) as BackupSnapshotSummary;
      const archivePath = path.join(BACKUPS_DIR, parsed.fileName);
      if (parsed.fileName && fs.existsSync(archivePath)) {
        summaries.push(parsed);
      }
    } catch {}
  }

  summaries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return summaries;
}

export function readBackupSnapshotBuffer(rawFileName: string): {
  fileName: string;
  buffer: Buffer;
} {
  ensureBackupsDir();
  const fileName = sanitizeSnapshotFileName(rawFileName);
  const fullPath = path.join(BACKUPS_DIR, fileName);
  if (!fs.existsSync(fullPath)) {
    throw new Error('निवडलेली बॅकअप फाइल सर्व्हरवर सापडली नाही.');
  }
  return { fileName, buffer: fs.readFileSync(fullPath) };
}

export function deleteBackupSnapshot(rawFileName: string): void {
  ensureBackupsDir();
  const fileName = sanitizeSnapshotFileName(rawFileName);
  const fullPath = path.join(BACKUPS_DIR, fileName);
  const metaPath = `${fullPath}.meta.json`;
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
}

export function parseAndValidateBackupPayload(input: Buffer | string): FullWebsiteBackupBundle {
  let rawText: string;
  if (Buffer.isBuffer(input)) {
    const isGzip = input.length >= 2 && input[0] === 0x1f && input[1] === 0x8b;
    const rawBuf = isGzip ? zlib.gunzipSync(input) : input;
    rawText = rawBuf.toString('utf-8');
  } else {
    const trimmed = String(input || '').trim();
    if (trimmed.startsWith('{')) {
      rawText = trimmed;
    } else {
      const decoded = Buffer.from(trimmed, 'base64');
      const isGzip = decoded.length >= 2 && decoded[0] === 0x1f && decoded[1] === 0x8b;
      const rawBuf = isGzip ? zlib.gunzipSync(decoded) : decoded;
      rawText = rawBuf.toString('utf-8');
    }
  }

  const parsed = JSON.parse(rawText) as FullWebsiteBackupBundle;
  if (!parsed || parsed.format !== 'mahasangh-full-backup-v1' || !parsed.database) {
    throw new Error('अवैध बॅकअप फाइल स्वरूप. कृपया फक्त अधिकृत .mhsbak.gz बॅकअप फाइल निवडा.');
  }

  const expectedChecksum = computeBackupChecksum({
    database: parsed.database,
    extraSystemSettings: parsed.extraSystemSettings || {},
    websiteAssets: parsed.websiteAssets || { publicFiles: [], publicFileCount: 0 },
  });

  if (parsed.checksumSha256 && parsed.checksumSha256 !== expectedChecksum) {
    throw new Error('बॅकअप फाइल खराब (Corrupted) किंवा बदललेली आहे — Checksum जुळत नाही.');
  }

  return parsed;
}

async function restoreCollectionInFirestore(
  _db: any,
  _collectionName: string,
  _items: Record<string, any>[],
  _preserveDocIds: string[] = []
): Promise<void> {
  // Firestore is removed; operations execute against MySQL
  return;
}

export async function restoreWebsiteAndDatabaseBackup(params: {
  bundle: FullWebsiteBackupBundle;
  firestoreDb: Firestore | null;
  createdBy: string;
}): Promise<{
  counts: MigrationCounts;
  restoredPublicFiles: number;
  safetySnapshotFileName: string;
  warnings: string[];
}> {
  const warnings: string[] = [];

  // 1. Always take an automatic safety snapshot before restoring
  let safetySnapshotFileName = '';
  try {
    const safety = await createAndSaveBackupSnapshot({
      createdBy: params.createdBy || 'auto_pre_restore',
      firestoreDb: params.firestoreDb,
      prefix: 'pre_restore_safety',
    });
    safetySnapshotFileName = safety.snapshot.fileName;
  } catch (err: any) {
    warnings.push(`Pre-restore safety snapshot warning: ${err?.message || String(err)}`);
  }

  const ds = params.bundle.database;
  const extraSettings = params.bundle.extraSystemSettings || {};

  // 2. Restore Website Public Assets
  const restoredPublicFiles = restorePublicWebsiteAssets(
    params.bundle.websiteAssets?.publicFiles || []
  );

  // 3. Restore Database into Active Backend
  if (isMysqlActive()) {
    await ensureMysqlSchema();
    const pool = getMysqlPool();

    // Clear transactional tables cleanly so restore reflects exact point-in-time
    await pool.execute('DELETE FROM `applications`');
    await pool.execute('DELETE FROM `news`');
    await pool.execute('DELETE FROM `latest_banners`');
    await pool.execute('DELETE FROM `gov_orders`');
    await pool.execute('DELETE FROM `contacts`');
    await pool.execute('DELETE FROM `sub_admins`');
    await pool.execute('DELETE FROM `officials`');
    await pool.execute('DELETE FROM `appointed_posts`');
    await pool.execute('DELETE FROM `district_passwords`');

    for (let i = 0; i < (ds.applications || []).length; i += 15) {
      await Promise.all(ds.applications.slice(i, i + 15).map((a) => mysqlUpsertApplication(a)));
    }
    for (let i = 0; i < (ds.news || []).length; i += 15) {
      await Promise.all(ds.news.slice(i, i + 15).map((n) => mysqlSaveNews(n as any)));
    }
    for (let i = 0; i < (ds.latestBanners || []).length; i += 15) {
      await Promise.all(ds.latestBanners.slice(i, i + 15).map((b) => mysqlSaveLatestBanner(b as any)));
    }
    for (let i = 0; i < (ds.govOrders || []).length; i += 15) {
      await Promise.all(ds.govOrders.slice(i, i + 15).map((g) => mysqlSaveGovOrder(g as any)));
    }
    for (let i = 0; i < (ds.contacts || []).length; i += 15) {
      await Promise.all(ds.contacts.slice(i, i + 15).map((c) => mysqlSaveContact(c)));
    }
    for (let i = 0; i < (ds.subAdmins || []).length; i += 15) {
      await Promise.all(ds.subAdmins.slice(i, i + 15).map((sa) => mysqlSaveSubAdmin(sa)));
    }

    if (Array.isArray(ds.leaders)) {
      await mysqlSaveLeaders(ds.leaders as any);
    }

    for (let i = 0; i < (ds.officials || []).length; i += 15) {
      await Promise.all(ds.officials.slice(i, i + 15).map((o) => mysqlSaveOfficial(o as any)));
    }

    for (let i = 0; i < (ds.appointedPosts || []).length; i++) {
      const p = ds.appointedPosts[i];
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
    }

    for (const [dist, pwd] of Object.entries(ds.districtPasswords || {})) {
      await mysqlSetDistrictPassword(dist, String(pwd));
    }

    if (ds.presidentPassword) {
      await mysqlSetPresidentPassword(String(ds.presidentPassword));
    }

    // System settings map + admin_auth + member_counter
    for (const [key, val] of Object.entries(extraSettings)) {
      await mysqlSaveSystemSetting(key, val);
    }
    if (ds.adminAuth) {
      await mysqlSaveSystemSetting('admin_auth', ds.adminAuth);
    }
    if (ds.memberCounter) {
      await mysqlSaveSystemSetting('member_counter', ds.memberCounter);
    }

    if (ds.siteStats) {
      await pool.execute(
        `INSERT INTO \`site_stats\` (stat_key, total_count, today_count, last_date, last_updated)
         VALUES ('visits', ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           total_count = VALUES(total_count),
           today_count = VALUES(today_count),
           last_date = VALUES(last_date),
           last_updated = VALUES(last_updated)`,
        [
          Number(ds.siteStats.total || 5155),
          Number(ds.siteStats.today || 0),
          String(ds.siteStats.lastDate || ''),
          String(ds.siteStats.lastUpdated || new Date().toISOString()),
        ]
      );
    }
  } else {
    throw new Error('डेटाबेस रिस्टोअर करण्यासाठी MySQL डेटाबेस उपलब्ध असणे आवश्यक आहे.');
  }

  return {
    counts: getMigrationCounts(ds),
    restoredPublicFiles,
    safetySnapshotFileName,
    warnings,
  };
}

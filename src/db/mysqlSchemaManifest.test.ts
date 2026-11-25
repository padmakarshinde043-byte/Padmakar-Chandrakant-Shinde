import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MYSQL_SCHEMA_MANIFEST,
  buildAlterAddColumnSql,
  buildAlterAddIndexSql,
  buildCreateTableSql,
  computeSchemaDiff,
  getTotalManifestColumnsCount,
  isRecoverableMysqlSchemaError,
} from './mysqlSchemaManifest';

test('MYSQL_SCHEMA_MANIFEST defines all 14 core tables and every column used in mysqlRepository.ts', () => {
  const tableNames = MYSQL_SCHEMA_MANIFEST.map((t) => t.table);
  assert.deepEqual(tableNames, [
    'applications',
    'news',
    'latest_banners',
    'gov_orders',
    'contacts',
    'sub_admins',
    'system_settings',
    'site_stats',
    'leaders',
    'officials',
    'appointed_posts',
    'district_passwords',
    'leadership_meta',
    'website_feedback',
  ]);
  assert.ok(getTotalManifestColumnsCount() >= 130);

  // Verify every table & column referenced by INSERT/UPDATE in mysqlRepository.ts is present in the manifest
  const repoSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/db/mysqlRepository.ts'), 'utf-8');
  const mapByTable = new Map(
    MYSQL_SCHEMA_MANIFEST.map((spec) => [spec.table, new Set(spec.columns.map((c) => c.name))])
  );

  // Inspect INSERT INTO `table` (col1, col2, ...) statements across mysqlRepository.ts
  const insertMatches = repoSrc.matchAll(/INSERT(?:\s+IGNORE)?\s+INTO\s+`([a-z0-9_]+)`\s*\(([\s\S]*?)\)\s*VALUES/gi);
  for (const m of insertMatches) {
    const tbl = m[1];
    const cols = m[2]
      .split(',')
      .map((s) => s.replace(/`/g, '').trim())
      .filter(Boolean);
    const specCols = mapByTable.get(tbl);
    assert.ok(specCols, `Table ${tbl} used in INSERT must exist in MYSQL_SCHEMA_MANIFEST`);
    for (const c of cols) {
      assert.ok(specCols.has(c), `Column ${tbl}.${c} used in INSERT must exist in MYSQL_SCHEMA_MANIFEST`);
    }
  }
});

test('computeSchemaDiff identifies missing tables, missing columns on existing tables, and generates valid DDL', () => {
  const existingTables = new Set(['applications', 'appointed_posts', 'contacts']);
  const existingColumnsByTable = new Map<string, Set<string>>([
    ['applications', new Set(['id', 'full_name', 'phone', 'status'])],
    ['appointed_posts', new Set(['id', 'sort_order', 'title', 'level'])],
    ['contacts', new Set(['id', 'name', 'phone', 'message', 'created_at'])],
  ]);
  const existingIndexesByTable = new Map<string, Set<string>>();

  const diff = computeSchemaDiff({
    existingTables,
    existingColumnsByTable,
    existingIndexesByTable,
  });

  // 11 missing tables should be queued for CREATE TABLE IF NOT EXISTS
  assert.equal(diff.tablesToCreate.length, 11);
  const createSql = buildCreateTableSql(diff.tablesToCreate[0]);
  assert.match(createSql, /^CREATE TABLE IF NOT EXISTS `/);
  assert.match(createSql, /CHARSET=utf8mb4/);

  // Critical legacy missing columns must be detected cleanly
  const missingPairs = new Set(diff.columnsToAdd.map((x) => `${x.table}.${x.column.name}`));
  assert.ok(missingPairs.has('appointed_posts.updated_at'));
  assert.ok(missingPairs.has('appointed_posts.extra_json'));
  assert.ok(missingPairs.has('contacts.photo'));
  assert.ok(missingPairs.has('applications.welcome_email_sent'));
  assert.ok(missingPairs.has('applications.razorpay_payment_id'));
  assert.ok(missingPairs.has('applications.updated_at'));

  const alterColSql = buildAlterAddColumnSql('appointed_posts', {
    name: 'updated_at',
    definition: "VARCHAR(64) NOT NULL DEFAULT ''",
  });
  assert.equal(
    alterColSql,
    "ALTER TABLE `appointed_posts` ADD COLUMN `updated_at` VARCHAR(64) NOT NULL DEFAULT ''"
  );

  const alterIdxSql = buildAlterAddIndexSql('applications', {
    name: 'idx_apps_phone',
    definition: 'INDEX `idx_apps_phone` (`phone`)',
  });
  assert.equal(alterIdxSql, 'ALTER TABLE `applications` ADD INDEX `idx_apps_phone` (`phone`)');
});

test('isRecoverableMysqlSchemaError detects ER_BAD_FIELD_ERROR, ER_NO_SUCH_TABLE, and textual unknown column errors', () => {
  assert.equal(
    isRecoverableMysqlSchemaError({ code: 'ER_BAD_FIELD_ERROR', errno: 1054, message: "Unknown column 'updated_at' in 'INSERT INTO'" }),
    true
  );
  assert.equal(
    isRecoverableMysqlSchemaError({ code: 'ER_NO_SUCH_TABLE', errno: 1146, message: "Table 'mahasangh.appointed_posts' doesn't exist" }),
    true
  );
  assert.equal(
    isRecoverableMysqlSchemaError({ code: 'ER_ACCESS_DENIED_ERROR', errno: 1045, message: 'Access denied' }),
    false
  );
});

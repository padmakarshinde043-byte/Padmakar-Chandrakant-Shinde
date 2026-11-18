import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  escapeSqlValue,
  buildUpsertSql,
  getMigrationCounts,
  generateFullSqlDump,
  MigrationDataset,
} from './sqlFormatter';

test('escapeSqlValue handles null, undefined, booleans, numbers, quotes and Marathi UTF-8', () => {
  assert.equal(escapeSqlValue(null), 'NULL');
  assert.equal(escapeSqlValue(undefined), 'NULL');
  assert.equal(escapeSqlValue(true), '1');
  assert.equal(escapeSqlValue(false), '0');
  assert.equal(escapeSqlValue(42), '42');
  assert.equal(escapeSqlValue(Number.NaN), '0');
  assert.equal(escapeSqlValue("श्री. रवींद्र 'काका'\nपुणे"), "'श्री. रवींद्र \\'काका\\'\\nपुणे'");
  assert.equal(escapeSqlValue('C:\\path\\"test"'), "'C:\\\\path\\\\\\\"test\\\"'");
});

test('buildUpsertSql generates ON DUPLICATE KEY UPDATE skipping primary keys', () => {
  const sql = buildUpsertSql(
    'district_passwords',
    ['district', 'password', 'updated_at'],
    ['पुणे', 'Pune@123', '2026-01-01T00:00:00Z'],
    ['district']
  );
  assert.match(sql, /^INSERT INTO `district_passwords`/);
  assert.match(sql, /ON DUPLICATE KEY UPDATE `password` = VALUES\(`password`\), `updated_at` = VALUES\(`updated_at`\);$/);
  assert.ok(!sql.includes('`district` = VALUES(`district`)'));
});

test('getMigrationCounts and generateFullSqlDump include all 13 tables across both Firebase DBs', () => {
  const sampleData: MigrationDataset = {
    applications: [
      {
        id: 'app-1',
        applicationNumber: 'MHS-2026-001',
        memberNumber: 'PUNE/0001729',
        salutation: 'श्री.',
        fullName: 'टेस्ट केंद्रप्रमुख',
        phone: '9876543210',
        email: 'test@example.com',
        district: 'पुणे',
        status: 'approved',
        paymentConfirmed: true,
        isOfficial: true,
        officialPost: 'जिल्हाध्यक्ष',
      },
    ],
    news: [{ id: 'news-1', title: 'अधिवेशन बातमी', date: '2026-05-01', featured: true }],
    latestBanners: [{ id: 'ban-1', title: 'बॅनर', imageUrl: 'https://example.com/a.jpg', date: '2026-05-01' }],
    govOrders: [{ id: 'gr-1', title: 'शासन निर्णय', date: '2026-05-01', type: 'शासन निर्णय' }],
    contacts: [{ id: 'con-1', name: 'सदस्य', phone: '9876543210', message: 'नमस्कार', photo: 'https://example.com/p.jpg' }],
    subAdmins: [{ id: 'adm-1', email: 'sub@mahasangh.in', permissions: { approveMembers: true } }],
    adminAuth: { email: 'padmakarshinde043@gmail.com', password: 'secret' },
    memberCounter: { totalApproved: 1729, lastMemberNumber: 1729 },
    siteStats: { total: 5200, today: 14, lastDate: '2026-05-01' },
    leaders: [{ id: 'lead-1', name: 'रवींद्र कदम', role: 'अध्यक्ष', isKey: true }],
    officials: [{ id: 'off-1', firstName: 'अशोक', lastName: 'पाटील', district: 'पुणे', mobile: '9999999999' }],
    appointedPosts: [{ id: 'post-1', title: 'जिल्हाध्यक्ष', level: 'district' }],
    districtPasswords: { पुणे: 'Pune@2026' },
    presidentPassword: 'RK@TestPassword',
    leadershipVersion: 1777777777,
  };

  const counts = getMigrationCounts(sampleData);
  assert.equal(counts.applications, 1);
  assert.equal(counts.officials, 1);
  assert.equal(counts.leaders, 1);
  assert.equal(counts.districtPasswords, 1);
  assert.equal(counts.settingsDocs, 3);

  const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'database', 'schema.sql'), 'utf-8');
  const dump = generateFullSqlDump(schemaSql, sampleData, '2026-05-01T00:00:00Z');

  assert.ok(dump.includes('CREATE TABLE IF NOT EXISTS `applications`'));
  assert.ok(dump.includes("INSERT INTO `applications`"));
  assert.ok(dump.includes("INSERT INTO `news`"));
  assert.ok(dump.includes("INSERT INTO `latest_banners`"));
  assert.ok(dump.includes("INSERT INTO `gov_orders`"));
  assert.ok(dump.includes("INSERT INTO `contacts` (`id`, `name`, `phone`, `email`, `district`, `subject`, `message`, `photo`, `created_at`)"));
  assert.ok(dump.includes("https://example.com/p.jpg"));
  assert.ok(dump.includes("INSERT INTO `sub_admins`"));
  assert.ok(dump.includes("INSERT INTO `system_settings`"));
  assert.ok(dump.includes("INSERT INTO `site_stats`"));
  assert.ok(dump.includes("INSERT INTO `leaders`"));
  assert.ok(dump.includes("INSERT INTO `officials`"));
  assert.ok(dump.includes("INSERT INTO `appointed_posts`"));
  assert.ok(dump.includes("INSERT INTO `district_passwords`"));
  assert.ok(dump.includes("INSERT INTO `leadership_meta`"));
  assert.ok(dump.includes('टेस्ट केंद्रप्रमुख'));
});

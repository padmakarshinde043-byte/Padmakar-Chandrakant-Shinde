import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'zlib';
import {
  sanitizeSnapshotFileName,
  computeBackupChecksum,
  parseAndValidateBackupPayload,
  FullWebsiteBackupBundle,
} from './backupRestoreService';
import { MigrationDataset } from './sqlFormatter';

const EMPTY_DATASET: MigrationDataset = {
  applications: [{ id: 'app_1', fullName: 'Test Member', status: 'approved' }],
  news: [],
  latestBanners: [],
  govOrders: [],
  contacts: [],
  subAdmins: [],
  adminAuth: null,
  memberCounter: { currentCount: 2073 },
  siteStats: { total: 5155, today: 12 },
  leaders: [{ id: 'guide_1', name: 'मार्गदर्शक १', category: 'मार्गदर्शक' }],
  officials: [],
  appointedPosts: [],
  districtPasswords: {},
  presidentPassword: null,
  leadershipVersion: 12345,
};

function makeValidBundle(): FullWebsiteBackupBundle {
  const extraSystemSettings = { welcome_note: 'ok' };
  const websiteAssets = {
    publicFiles: [
      {
        relativePath: 'logo.txt',
        sizeBytes: 4,
        contentBase64: Buffer.from('test').toString('base64'),
      },
    ],
    publicFileCount: 1,
  };
  const checksumSha256 = computeBackupChecksum({
    database: EMPTY_DATASET,
    extraSystemSettings,
    websiteAssets,
  });

  return {
    format: 'mahasangh-full-backup-v1',
    createdAt: '2026-11-17T10:00:00.000Z',
    createdBy: 'super_admin',
    sourceBackend: 'mysql',
    appVersion: '1.0.0',
    database: EMPTY_DATASET,
    extraSystemSettings,
    websiteAssets,
    sqlDump: '-- test sql',
    checksumSha256,
  };
}

test('sanitizeSnapshotFileName accepts valid .mhsbak.gz names and strips paths', () => {
  assert.equal(
    sanitizeSnapshotFileName('mahasangh_backup_20261117_100000.mhsbak.gz'),
    'mahasangh_backup_20261117_100000.mhsbak.gz'
  );
  assert.equal(
    sanitizeSnapshotFileName('../weird/folder/snap-1.mhsbak.gz'),
    'snap-1.mhsbak.gz'
  );
});

test('sanitizeSnapshotFileName rejects invalid extensions and unsafe names', () => {
  assert.throws(() => sanitizeSnapshotFileName('backup.sql'));
  assert.throws(() => sanitizeSnapshotFileName('bad name.mhsbak.gz'));
  assert.throws(() => sanitizeSnapshotFileName(''));
});

test('parseAndValidateBackupPayload validates gzipped and base64-encoded bundles', () => {
  const bundle = makeValidBundle();
  const gzBuf = zlib.gzipSync(Buffer.from(JSON.stringify(bundle), 'utf-8'));

  const parsedFromGz = parseAndValidateBackupPayload(gzBuf);
  assert.equal(parsedFromGz.database.leaders.length, 1);
  assert.equal(parsedFromGz.websiteAssets.publicFileCount, 1);

  const parsedFromBase64 = parseAndValidateBackupPayload(gzBuf.toString('base64'));
  assert.equal(parsedFromBase64.checksumSha256, bundle.checksumSha256);

  const parsedFromJson = parseAndValidateBackupPayload(JSON.stringify(bundle));
  assert.equal(parsedFromJson.sourceBackend, 'mysql');
});

test('parseAndValidateBackupPayload rejects tampered checksums and invalid formats', () => {
  const tampered = makeValidBundle();
  tampered.database.leaders[0].name = 'Tampered Name';
  const tamperedGz = zlib.gzipSync(Buffer.from(JSON.stringify(tampered), 'utf-8'));

  assert.throws(() => parseAndValidateBackupPayload(tamperedGz), /Checksum/);

  const wrongFormat = { format: 'other-format', database: {} };
  assert.throws(() => parseAndValidateBackupPayload(JSON.stringify(wrongFormat)), /अवैध बॅकअप/);
});

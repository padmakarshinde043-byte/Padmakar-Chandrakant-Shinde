import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAiStudioPreviewHostname,
  evaluatePreviewReadAllowance,
  MAX_PREVIEW_READS_PER_DAY,
  PREVIEW_HEAVY_SCAN_COOLDOWN_MS,
} from './previewFirebaseGuard';

test('isAiStudioPreviewHostname allows only AI Studio preview & local dev hosts, never production mahasangh.in', () => {
  assert.equal(
    isAiStudioPreviewHostname('ais-dev-nc2iggmo2ig5ssyspjnpti-537594702177.asia-southeast1.run.app'),
    true
  );
  assert.equal(
    isAiStudioPreviewHostname('ais-pre-nc2iggmo2ig5ssyspjnpti-537594702177.asia-southeast1.run.app'),
    true
  );
  assert.equal(isAiStudioPreviewHostname('localhost'), true);
  assert.equal(isAiStudioPreviewHostname('127.0.0.1'), true);

  assert.equal(isAiStudioPreviewHostname('mahasangh.in'), false);
  assert.equal(isAiStudioPreviewHostname('www.mahasangh.in'), false);
  assert.equal(isAiStudioPreviewHostname('greetings.mahasangh.in'), false);
  assert.equal(isAiStudioPreviewHostname(''), false);
});

test('evaluatePreviewReadAllowance enforces 15-minute cooldown on heavy scans and daily read cap', () => {
  const now = 1_700_000_000_000;
  const today = new Date(now).toISOString().slice(0, 10);

  // Fresh budget -> heavy scan allowed
  const ok = evaluatePreviewReadAllowance({
    state: { date: today, reads: 0, lastHeavyScanByKey: {} },
    scanKey: 'approved_members',
    isHeavyScan: true,
    nowMs: now,
  });
  assert.equal(ok.allowed, true);

  // 2 minutes later -> heavy scan blocked by 15m cooldown
  const cooldownBlocked = evaluatePreviewReadAllowance({
    state: {
      date: today,
      reads: 1800,
      lastHeavyScanByKey: { approved_members: now - 2 * 60 * 1000 },
    },
    scanKey: 'approved_members',
    isHeavyScan: true,
    nowMs: now,
  });
  assert.equal(cooldownBlocked.allowed, false);
  assert.equal(cooldownBlocked.reason, 'cooldown_active');

  // After cooldown expires -> allowed if under daily cap
  const afterCooldown = evaluatePreviewReadAllowance({
    state: {
      date: today,
      reads: 1800,
      lastHeavyScanByKey: {
        approved_members: now - PREVIEW_HEAVY_SCAN_COOLDOWN_MS - 1000,
      },
    },
    scanKey: 'approved_members',
    isHeavyScan: true,
    nowMs: now,
  });
  assert.equal(afterCooldown.allowed, true);

  // Over daily budget -> blocked even for light reads
  const budgetBlocked = evaluatePreviewReadAllowance({
    state: {
      date: today,
      reads: MAX_PREVIEW_READS_PER_DAY,
      lastHeavyScanByKey: {},
    },
    isHeavyScan: false,
    nowMs: now,
  });
  assert.equal(budgetBlocked.allowed, false);
  assert.equal(budgetBlocked.reason, 'daily_budget_reached');
});

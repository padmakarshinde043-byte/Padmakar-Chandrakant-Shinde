import test from 'node:test';
import assert from 'node:assert/strict';
import { computeNextVisitorStats } from './visitorCounter';

test('resets today counter to 1 at 12:00 AM IST when date changes', () => {
  const res = computeNextVisitorStats({
    currentTotal: 5200,
    currentToday: 48,
    lastDate: '2026-11-15',
    todayDateStr: '2026-11-16',
    incrementVisit: true,
  });
  assert.deepEqual(res, { today: 1, total: 5201, shouldPersist: true });
});

test('auto-heals manual zero reset on same day even on repeat browser read', () => {
  const res = computeNextVisitorStats({
    currentTotal: 5200,
    currentToday: 0,
    lastDate: '2026-11-16',
    todayDateStr: '2026-11-16',
    incrementVisit: false,
  });
  assert.deepEqual(res, { today: 1, total: 5200, shouldPersist: true });
});

test('does not increment on same-browser refresh when today is already >= 1', () => {
  const res = computeNextVisitorStats({
    currentTotal: 5200,
    currentToday: 7,
    lastDate: '2026-11-16',
    todayDateStr: '2026-11-16',
    incrementVisit: false,
  });
  assert.deepEqual(res, { today: 7, total: 5200, shouldPersist: false });
});

test('increments today and total for another browser on same IST day', () => {
  const res = computeNextVisitorStats({
    currentTotal: 5200,
    currentToday: 7,
    lastDate: '2026-11-16',
    todayDateStr: '2026-11-16',
    incrementVisit: true,
  });
  assert.deepEqual(res, { today: 8, total: 5201, shouldPersist: true });
});

test('rolls over at exact 12:00 AM IST boundary (18:29:59Z -> 18:30:00Z)', () => {
  const toIstDateStr = (d: Date) =>
    new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const beforeMidnight = toIstDateStr(new Date('2026-11-18T18:29:59.000Z')); // 23:59:59 IST on Nov 18
  const atMidnight = toIstDateStr(new Date('2026-11-18T18:30:00.000Z')); // 00:00:00 IST on Nov 19

  assert.equal(beforeMidnight, '2026-11-18');
  assert.equal(atMidnight, '2026-11-19');

  const res = computeNextVisitorStats({
    currentTotal: 6542,
    currentToday: 87,
    lastDate: beforeMidnight,
    todayDateStr: atMidnight,
    incrementVisit: true,
  });
  assert.deepEqual(res, { today: 1, total: 6543, shouldPersist: true });
});

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

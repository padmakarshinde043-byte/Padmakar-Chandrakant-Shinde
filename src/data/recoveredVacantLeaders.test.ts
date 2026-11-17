import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECOVERED_VACANT_LEADERS,
  filterValidDynamicLeaders,
  findMissingVacantLeaders,
  mergeMissingVacantLeaders,
} from './recoveredVacantLeaders';
import type { Leader } from './mahasanghData';

test('RECOVERED_VACANT_LEADERS contains exact 36 vacant posts (15 state + 9 women + 12 divisional)', () => {
  assert.equal(RECOVERED_VACANT_LEADERS.length, 36);
  const state = RECOVERED_VACANT_LEADERS.filter((l) => l.category === 'राज्य कार्यकारिणी');
  const women = RECOVERED_VACANT_LEADERS.filter((l) => l.category === 'महिला आघाडी राज्य कार्यकारिणी');
  const div = RECOVERED_VACANT_LEADERS.filter((l) => l.category === 'विभागीय समन्वयक');
  assert.equal(state.length, 15);
  assert.equal(women.length, 9);
  assert.equal(div.length, 12);
});

test('filterValidDynamicLeaders preserves vacant state, women, and divisional posts with placeholder names', () => {
  const mixed: Leader[] = [
    { id: 'se-0', name: 'श्री राजेंद्र खैरनार', role: 'संस्थापक राज्याध्यक्ष', region: 'महाराष्ट्र', education: '', phone: '9860704098', category: 'राज्य कार्यकारिणी' },
    ...RECOVERED_VACANT_LEADERS,
    { id: 'empty-broken', name: '', role: '', region: '', education: '', phone: '' },
  ];
  const kept = filterValidDynamicLeaders(mixed);
  assert.equal(kept.length, 37);
  assert.ok(kept.some((l) => l.id === 'ldr-1794423021513'));
  assert.ok(kept.some((l) => l.id === 'dc-3'));
  assert.ok(!kept.some((l) => l.id === 'empty-broken'));
});

test('mergeMissingVacantLeaders restores missing vacant posts without overwriting existing filled leaders', () => {
  const existing: Leader[] = [
    { id: 'se-0', name: 'श्री राजेंद्र खैरनार', role: 'संस्थापक राज्याध्यक्ष', region: 'महाराष्ट्र', education: '', phone: '9860704098', photo: 'https://example.com/p.jpg', category: 'राज्य कार्यकारिणी' },
    { id: 'ldr-1794913872216', name: 'श्री मदन नारायण हत्ते', role: 'जिल्हा सरचिटणीस', region: 'बीड', education: '', phone: '-', photo: 'https://example.com/b.jpg', category: 'जिल्हा सरचिटणीस' },
    // Simulate admin already filled one of the vacant slots:
    { id: 'ldr-1794339858236', name: 'श्री. अ ब क', role: 'राज्य कार्याध्यक्ष', region: 'महाराष्ट्र', education: '', phone: '9999999999', photo: 'https://example.com/k.jpg', category: 'राज्य कार्यकारिणी' },
  ];

  const missingBefore = findMissingVacantLeaders(existing);
  assert.equal(missingBefore.length, 35);

  const { merged, addedCount } = mergeMissingVacantLeaders(existing);
  assert.equal(addedCount, 35);
  assert.equal(merged.length, 38);

  // Already-filled slot must keep its filled name & photo untouched
  const filledSlot = merged.find((l) => l.id === 'ldr-1794339858236');
  assert.equal(filledSlot?.name, 'श्री. अ ब क');
  assert.equal(filledSlot?.photo, 'https://example.com/k.jpg');

  // Re-running merge is idempotent
  const second = mergeMissingVacantLeaders(merged);
  assert.equal(second.addedCount, 0);
  assert.equal(second.merged.length, 38);
});

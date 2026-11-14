import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMemberNumberSeq,
  extractHighestMemberSeq,
  computeNextSafeSeq,
  normalizeMemberNumberKey,
  buildSequentialMemberNumber,
} from './memberNumberAllocator';

test('parseMemberNumberSeq extracts full 4+ digit sequence numbers accurately', () => {
  assert.equal(parseMemberNumberSeq('MS/2026/BEED/1137'), 1137);
  assert.equal(parseMemberNumberSeq('MS/2026/JALN/1177'), 1177);
  assert.equal(parseMemberNumberSeq('MS/2026/NASH/0072'), 72);
  assert.equal(parseMemberNumberSeq('MS/2026/PUNE/10005'), 10005);
  assert.equal(parseMemberNumberSeq(''), 0);
  assert.equal(parseMemberNumberSeq(undefined), 0);
});

test('extractHighestMemberSeq ignores gaps from deleted members and returns highest existing number', () => {
  const apps = [
    { memberNumber: 'MS/2026/NASH/0001' },
    { memberNumber: 'MS/2026/BEED/1137' },
    { memberNumber: 'MS/2026/JALN/1177' },
    { memberNumber: '' },
    { memberNumber: undefined },
  ];
  assert.equal(extractHighestMemberSeq(apps), 1177);
  assert.equal(extractHighestMemberSeq([]), 0);
});

test('computeNextSafeSeq always stays ahead of central counter, existing records, and baseline', () => {
  // Normal counter progression
  assert.equal(computeNextSafeSeq({ counterSeq: 1177, highestExistingSeq: 1177 }), 1178);

  // Stale counter behind highest existing record (prevents collision after deleted members or fallback lag)
  assert.equal(computeNextSafeSeq({ counterSeq: 1130, highestExistingSeq: 1177 }), 1178);

  // Empty/uninitialized counter falls back to baseline 71 -> 72
  assert.equal(computeNextSafeSeq({ counterSeq: 0, highestExistingSeq: 0 }), 72);

  // Supports > 9999 without wraparound
  assert.equal(computeNextSafeSeq({ counterSeq: 9999, highestExistingSeq: 9999 }), 10000);
});

test('normalizeMemberNumberKey and buildSequentialMemberNumber produce canonical formats', () => {
  assert.equal(normalizeMemberNumberKey(' ms/2026/beed/1137 '), 'MS/2026/BEED/1137');
  const year = new Date().getFullYear();
  assert.equal(buildSequentialMemberNumber('बीड', 1178), `MS/${year}/BEED/1178`);
  assert.equal(buildSequentialMemberNumber('जालना', 1179), `MS/${year}/JALN/1179`);
});

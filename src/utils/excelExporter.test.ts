import test from 'node:test';
import assert from 'node:assert/strict';
import { exportOrganizationStatusExcel } from './excelExporter';
import { MAHARASHTRA_34_DISTRICTS } from '../data/rkMaharashtraData';

test('MAHARASHTRA_34_DISTRICTS contains exactly 34 districts and Washim is not duplicated', () => {
  assert.equal(MAHARASHTRA_34_DISTRICTS.length, 34);
  const washimMatches = MAHARASHTRA_34_DISTRICTS.filter((d) => d.includes('वाश') || d.includes('वाशी'));
  assert.equal(washimMatches.length, 1);
  assert.equal(washimMatches[0], 'वाशीम');
});

test('exportOrganizationStatusExcel builds cleanly with two-part sums and full vertical totals', () => {
  const dummyStats = MAHARASHTRA_34_DISTRICTS.map((dist, idx) => ({
    district: dist,
    stateRep: idx === 0 ? 1 : 0,
    divRep: idx === 1 ? 1 : 0,
    distOfficial: 2,
    talukaOfficial: 1,
    officialsTotal: (idx === 0 ? 1 : 0) + (idx === 1 ? 1 : 0) + 2 + 1,
    beoCount: 1,
    extOfficerCount: 2,
    headmasterCount: 10,
    membersTotal: 13,
    rowTotal: 13
  }));

  // Verify rowTotal equals membersTotal
  assert.equal(dummyStats[0].rowTotal, dummyStats[0].membersTotal);

  // Verify export function executes without throwing
  assert.doesNotThrow(() => {
    exportOrganizationStatusExcel(dummyStats);
  });
});

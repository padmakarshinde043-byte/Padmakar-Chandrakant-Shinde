import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildUnifiedMembersExcelData,
  exportOrganizationStatusExcel,
  exportRegisteredMembersExcel,
  exportUnifiedMembersExcel,
  UNIFIED_MEMBERS_EXCEL_HEADERS,
} from './excelExporter';
import {
  deriveGenderFromSalutation,
  formatMemberDisplayName,
  isMissingSalutationOrGender,
  normalizeSalutation,
  resolveMemberGender,
} from './memberGender';
import { MAHARASHTRA_34_DISTRICTS } from '../data/rkMaharashtraData';
import type { MembershipApplication } from '../data/mahasanghData';

after(() => {
  const dateSlug = new Date().toISOString().split('T')[0];
  for (const f of [
    'संघटना_सद्यस्थिती_अहवाल.xlsx',
    `महाराष्ट्र_राज्य_अधिकृत_सदस्य_यादी_${dateSlug}.xlsx`,
    `अधिकृत_नोंदणीकृत_सदस्य_यादी_${dateSlug}.xlsx`,
  ]) {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch {}
  }
});

function makeApp(overrides: Partial<MembershipApplication>): MembershipApplication {
  return {
    id: 'app-1',
    applicationNumber: 'MS-2026-1001',
    memberNumber: 'MS/2026/NASH/0010',
    salutation: 'श्री',
    fullName: 'राजेश पाटील',
    phone: '9876543210',
    email: 'rajesh@mahasangh.in',
    address: 'नाशिक',
    district: 'नाशिक',
    taluka: 'निफाड',
    centerName: 'केंद्र पिंपळगाव',
    education: 'M.A.',
    professional: 'केंद्रप्रमुख',
    status: 'approved',
    createdAt: '2026-04-10T10:00:00.000Z',
    ...overrides,
  };
}

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
    extOfficerCount: 2,
    headmasterCount: 10,
    membersTotal: 12,
    rowTotal: 12,
  }));

  assert.equal(dummyStats[0].rowTotal, dummyStats[0].membersTotal);
  assert.doesNotThrow(() => {
    exportOrganizationStatusExcel(dummyStats);
  });
});

test('deriveGenderFromSalutation and resolveMemberGender map श्री -> पुरुष and सौ/श्रीमती/कुमारी -> स्त्री', () => {
  assert.equal(deriveGenderFromSalutation('श्री'), 'पुरुष');
  assert.equal(deriveGenderFromSalutation('श्री.'), 'पुरुष');
  assert.equal(deriveGenderFromSalutation('सौ'), 'स्त्री');
  assert.equal(deriveGenderFromSalutation('सौ.'), 'स्त्री');
  assert.equal(deriveGenderFromSalutation('श्रीमती'), 'स्त्री');
  assert.equal(deriveGenderFromSalutation('श्रीमती.'), 'स्त्री');
  assert.equal(deriveGenderFromSalutation('कुमारी'), 'स्त्री');
  assert.equal(deriveGenderFromSalutation('कु.'), 'स्त्री');
  assert.equal(deriveGenderFromSalutation('डॉ'), '');
  assert.equal(deriveGenderFromSalutation(''), '');

  assert.equal(normalizeSalutation('श्री.'), 'श्री');
  assert.equal(normalizeSalutation('सौ.'), 'सौ');
  assert.equal(normalizeSalutation('कु.'), 'कुमारी');
  assert.equal(normalizeSalutation(''), '');

  assert.equal(resolveMemberGender({ salutation: 'डॉ', fullName: 'प्रिया देशमुख', gender: 'स्त्री' }), 'स्त्री');
  assert.equal(resolveMemberGender({ salutation: 'डॉ', fullName: 'अशोक कुलकर्णी', gender: 'पुरुष' }), 'पुरुष');
  assert.equal(resolveMemberGender({ salutation: 'डॉ', fullName: 'अशोक कुलकर्णी' }), '');

  assert.equal(resolveMemberGender({ salutation: '', fullName: 'सौ. सुनिता जाधव' }), 'स्त्री');
  assert.equal(resolveMemberGender({ salutation: '', fullName: 'श्री. महेश शिंदे' }), 'पुरुष');

  assert.equal(resolveMemberGender({ salutation: 'सौ', fullName: 'सुनिता जाधव', gender: 'पुरुष' }), 'स्त्री');
  assert.equal(resolveMemberGender({ salutation: 'श्री', fullName: 'महेश शिंदे', gender: 'स्त्री' }), 'पुरुष');
});

test('formatMemberDisplayName prevents duplicate salutation prefixes and detects missing salutations', () => {
  assert.equal(formatMemberDisplayName('श्री', 'राजेश पाटील'), 'श्री राजेश पाटील');
  assert.equal(formatMemberDisplayName('श्री.', 'श्री. राजेश पाटील'), 'श्री राजेश पाटील');
  assert.equal(formatMemberDisplayName('सौ', 'सौ. अनिता देशमुख'), 'सौ अनिता देशमुख');
  assert.equal(formatMemberDisplayName('', 'प्रकाश कदम'), 'प्रकाश कदम');

  assert.equal(isMissingSalutationOrGender({ salutation: '', fullName: 'प्रकाश कदम' }), true);
  assert.equal(isMissingSalutationOrGender({ salutation: 'डॉ', fullName: 'प्रकाश कदम' }), true);
  assert.equal(isMissingSalutationOrGender({ salutation: 'डॉ', fullName: 'प्रकाश कदम', gender: 'पुरुष' }), false);
  assert.equal(isMissingSalutationOrGender({ salutation: 'श्री', fullName: 'प्रकाश कदम' }), false);
  assert.equal(isMissingSalutationOrGender({ salutation: 'कुमारी', fullName: 'प्रिया कदम' }), false);
});

test('Unified Excel builder produces identical 14-column headers, gender column, and counts for Admin & State President', () => {
  const members: MembershipApplication[] = [
    makeApp({ id: '1', salutation: 'श्री', fullName: 'राजेश पाटील', createdAt: '2026-04-15T10:00:00.000Z' }),
    makeApp({ id: '2', salutation: 'सौ.', fullName: 'सुनिता देशमुख', createdAt: '2026-04-14T10:00:00.000Z' }),
    makeApp({ id: '3', salutation: 'श्रीमती', fullName: 'आशा कुलकर्णी', createdAt: '2026-04-13T10:00:00.000Z' }),
    makeApp({ id: '4', salutation: 'कुमारी', fullName: 'प्रिया जाधव', createdAt: '2026-04-12T10:00:00.000Z' }),
    makeApp({ id: '5', salutation: '', fullName: 'सुटलेला सदस्य', createdAt: '2026-04-11T10:00:00.000Z' }),
  ];

  const adminBuilt = buildUnifiedMembersExcelData(members, { filterLabel: 'मंजूर' });
  const presidentBuilt = buildUnifiedMembersExcelData([...members].reverse(), { filterLabel: 'मंजूर' });

  assert.deepEqual(adminBuilt.headerRow, [...UNIFIED_MEMBERS_EXCEL_HEADERS]);
  assert.deepEqual(adminBuilt.headerRow, presidentBuilt.headerRow);
  assert.deepEqual(adminBuilt.rows, presidentBuilt.rows);
  assert.equal(adminBuilt.headerRow[5], 'लिंग');
  assert.equal(adminBuilt.stats.maleCount, 1);
  assert.equal(adminBuilt.stats.femaleCount, 3);
  assert.equal(adminBuilt.stats.unspecifiedCount, 1);

  assert.equal(adminBuilt.rows[0][5], 'पुरुष');
  assert.equal(adminBuilt.rows[1][5], 'स्त्री');
  assert.equal(adminBuilt.rows[2][5], 'स्त्री');
  assert.equal(adminBuilt.rows[3][5], 'स्त्री');
  assert.equal(adminBuilt.rows[4][5], '-');

  const updatedMembers = members.map((m) =>
    m.id === '5' ? { ...m, salutation: 'सौ', gender: 'स्त्री' as const } : m
  );
  const afterEdit = buildUnifiedMembersExcelData(updatedMembers, { filterLabel: 'मंजूर' });
  assert.equal(afterEdit.rows[4][3], 'सौ');
  assert.equal(afterEdit.rows[4][4], 'सौ सुटलेला सदस्य');
  assert.equal(afterEdit.rows[4][5], 'स्त्री');
  assert.equal(afterEdit.stats.femaleCount, 4);
  assert.equal(afterEdit.stats.unspecifiedCount, 0);

  assert.doesNotThrow(() => exportUnifiedMembersExcel(updatedMembers));
  assert.doesNotThrow(() => exportRegisteredMembersExcel(updatedMembers));
});

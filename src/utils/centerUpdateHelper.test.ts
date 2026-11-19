import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MISSING_TALUKA_SENTINEL,
  buildCenterUpdateShareMessage,
  buildCenterUpdateShareUrl,
  filterMissingCenterMembers,
  getDistrictsWithMissingCenters,
  getMembersForDistrictAndTaluka,
  getTalukasForDistrict,
  isMissingCenterName,
} from './centerUpdateHelper';

test('isMissingCenterName accurately identifies empty and placeholder center names', () => {
  assert.equal(isMissingCenterName(''), true);
  assert.equal(isMissingCenterName('   '), true);
  assert.equal(isMissingCenterName(null), true);
  assert.equal(isMissingCenterName(undefined), true);
  assert.equal(isMissingCenterName('-'), true);
  assert.equal(isMissingCenterName('--'), true);
  assert.equal(isMissingCenterName('NA'), true);
  assert.equal(isMissingCenterName('नाही'), true);
  assert.equal(isMissingCenterName('केंद्र - पिंपळगाव बसवंत'), false);
});

test('filterMissingCenterMembers keeps ONLY active members without centerName and cascades District -> Taluka -> Member', () => {
  const sampleApps = [
    {
      id: 'm1',
      salutation: 'श्री',
      fullName: 'राजेश पाटील',
      district: 'नाशिक',
      taluka: 'निफाड',
      centerName: '',
      professional: 'केंद्रप्रमुख',
      status: 'approved' as const,
      memberNumber: 'MS/2026/NASH/0005',
    },
    {
      id: 'm2',
      salutation: 'सौ',
      fullName: 'सुनिता देशमुख',
      district: 'नाशिक',
      taluka: 'निफाड',
      centerName: 'केंद्र - ओझर', // already filled -> MUST NOT appear
      professional: 'शिक्षण विस्तार अधिकारी',
      status: 'approved' as const,
      memberNumber: 'MS/2026/NASH/0006',
    },
    {
      id: 'm3',
      salutation: 'श्री',
      fullName: 'महेश जाधव',
      district: 'नाशिक',
      taluka: '', // missing both taluka & centerName -> grouped under sentinel
      centerName: '-',
      professional: 'शिक्षण विस्तार अधिकारी जेष्ठ',
      status: 'approved' as const,
      memberNumber: 'MS/2026/NASH/0007',
    },
    {
      id: 'm4',
      salutation: 'श्री',
      fullName: 'नाकारलेला अर्जदार',
      district: 'पुणे',
      taluka: 'बारामती',
      centerName: '',
      professional: 'केंद्रप्रमुख',
      status: 'rejected' as const, // rejected -> MUST NOT appear
    },
    {
      id: 'm5',
      salutation: 'श्रीमती',
      fullName: 'आशा कुलकर्णी',
      district: 'पुणे',
      taluka: 'हवेली',
      centerName: '',
      professional: 'शिक्षण विस्तार अधिकारी पंचायत',
      status: 'approved' as const,
      memberNumber: 'MS/2026/PUNE/0011',
    },
  ];

  const missing = filterMissingCenterMembers(sampleApps);
  assert.equal(missing.length, 3);
  assert.deepEqual(
    missing.map((m) => m.id).sort(),
    ['m1', 'm3', 'm5']
  );
  // Legacy cadres normalized cleanly
  assert.equal(missing.find((m) => m.id === 'm3')?.professional, 'शिक्षण विस्तार अधिकारी');
  assert.equal(missing.find((m) => m.id === 'm5')?.professional, 'शिक्षण विस्तार अधिकारी');

  // District options
  const districts = getDistrictsWithMissingCenters(missing);
  assert.equal(districts.length, 2);
  assert.equal(districts.find((d) => d.district === 'नाशिक')?.count, 2);
  assert.equal(districts.find((d) => d.district === 'पुणे')?.count, 1);

  // Taluka options for Nashik (includes निफाड and sentinel for m3)
  const nashikTalukas = getTalukasForDistrict(missing, 'नाशिक');
  assert.equal(nashikTalukas.length, 2);
  assert.equal(nashikTalukas[0].value, 'निफाड');
  assert.equal(nashikTalukas[1].value, MISSING_TALUKA_SENTINEL);

  // Member list for Nashik -> Niphad
  const niphadMembers = getMembersForDistrictAndTaluka(missing, 'नाशिक', 'निफाड');
  assert.equal(niphadMembers.length, 1);
  assert.equal(niphadMembers[0].id, 'm1');

  // Member list for Nashik -> missing taluka sentinel
  const legacyNashikMembers = getMembersForDistrictAndTaluka(
    missing,
    'नाशिक',
    MISSING_TALUKA_SENTINEL
  );
  assert.equal(legacyNashikMembers.length, 1);
  assert.equal(legacyNashikMembers[0].id, 'm3');
});

test('buildCenterUpdateShareUrl and message include standalone /center-update link', () => {
  const url = buildCenterUpdateShareUrl('https://mahasangh.in/');
  assert.equal(url, 'https://mahasangh.in/center-update');

  const msg = buildCenterUpdateShareMessage('https://mahasangh.in');
  assert.ok(msg.includes('https://mahasangh.in/center-update'));
  assert.ok(msg.includes('कार्यरत केंद्राचे नाव'));
});

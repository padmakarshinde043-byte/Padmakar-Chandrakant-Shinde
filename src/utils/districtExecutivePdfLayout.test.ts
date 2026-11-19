import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTENT_WIDTH_MM,
  LANDSCAPE_CONTENT_WIDTH_MM,
  DISTRICT_EXECUTIVE_PDF_COLUMNS,
  ORGANIZATION_STATUS_PDF_COLUMNS,
  DISTRICT_PRESIDENTS_PDF_COLUMNS,
  TALUKA_PRESIDENTS_PDF_COLUMNS,
  REGISTERED_MEMBERS_PDF_COLUMNS,
  STATEWIDE_REGISTRY_PDF_COLUMNS,
  SAFE_TARGET_PDF_BYTES,
  TARGET_MAX_PDF_BYTES,
  SAFE_TARGET_MULTI_PDF_BYTES,
  TARGET_MAX_MULTI_PDF_BYTES,
  buildDistrictExecutivePdfRows,
  buildOrganizationStatusPdfRows,
  buildDistrictPresidentsPdfRows,
  buildTalukaPresidentsPdfRows,
  buildRegisteredMembersPdfRows,
  buildStatewideRegistryPdfRows,
  computeVerticalCenteredBaselines,
  getAdaptivePdfQualityLadder,
  paginateMeasuredDistrictRows,
  wrapTextToLines,
} from './districtExecutivePdfLayout';
import type { OfficialMember } from '../data/rkMaharashtraData';
import type { MembershipApplication } from '../data/mahasanghData';

test('All 6 office PDF column sets sum cleanly to A4 content width and enforce Vertical-Center + Horizontal-Left', () => {
  const portraitSets = [
    DISTRICT_EXECUTIVE_PDF_COLUMNS,
    DISTRICT_PRESIDENTS_PDF_COLUMNS,
    TALUKA_PRESIDENTS_PDF_COLUMNS,
    REGISTERED_MEMBERS_PDF_COLUMNS,
    STATEWIDE_REGISTRY_PDF_COLUMNS,
  ];

  for (const cols of portraitSets) {
    const sum = cols.reduce((acc, c) => acc + c.widthMm, 0);
    assert.equal(sum, CONTENT_WIDTH_MM);
    for (const c of cols) {
      assert.equal(c.hAlign, 'left');
      assert.equal(c.vAlign, 'middle');
    }
  }

  // Organization Status Matrix uses A4 Landscape (277 mm)
  assert.equal(ORGANIZATION_STATUS_PDF_COLUMNS.length, 11);
  const landscapeSum = ORGANIZATION_STATUS_PDF_COLUMNS.reduce((acc, c) => acc + c.widthMm, 0);
  assert.equal(landscapeSum, LANDSCAPE_CONTENT_WIDTH_MM);
  for (const c of ORGANIZATION_STATUS_PDF_COLUMNS) {
    assert.equal(c.hAlign, 'left');
    assert.equal(c.vAlign, 'middle');
  }
});

test('buildDistrictExecutivePdfRows produces 1:1 parity with Excel including workingPlace & normalized cadre', () => {
  const sample: OfficialMember[] = [
    {
      id: '1',
      salutation: 'श्री.',
      firstName: 'राजेश',
      middleName: 'पांडुरंग',
      lastName: 'पाटील',
      appointedPost: 'जिल्हाध्यक्ष',
      district: 'नाशिक',
      taluka: 'निफाड',
      currentCadre: 'शिक्षण विस्तार अधिकारी जेष्ठ',
      workingPlace: 'पिंपळगाव बसवंत',
      mobile: '९८६०७०४०९८',
      updatedAt: '2026-05-10T10:00:00Z',
    },
    {
      id: '2',
      salutation: 'सौ.',
      firstName: 'सुनीता',
      middleName: '',
      lastName: 'कुलकर्णी',
      appointedPost: 'जिल्हा महिला प्रतिनिधी',
      district: 'नाशिक',
      taluka: '',
      currentCadre: 'केंद्रप्रमुख',
      workingPlace: '',
      mobile: '9822001122',
      updatedAt: '2026-05-10T10:00:00Z',
    },
  ];

  const rows = buildDistrictExecutivePdfRows(sample);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].cells, [
    '1',
    'श्री. राजेश पांडुरंग पाटील',
    'शिक्षण विस्तार अधिकारी - पिंपळगाव बसवंत',
    'जिल्हाध्यक्ष',
    '9860704098',
    'निफाड',
  ]);
  assert.deepEqual(rows[1].cells, [
    '2',
    'सौ. सुनीता कुलकर्णी',
    'केंद्रप्रमुख',
    'जिल्हा महिला प्रतिनिधी',
    '9822001122',
    '-',
  ]);
});

test('buildOrganizationStatusPdfRows computes accurate district rows and summary totals row', () => {
  const { rows, totalOfficials, totalMembers } = buildOrganizationStatusPdfRows([
    {
      district: 'नाशिक',
      stateRep: 1,
      divRep: 2,
      distOfficial: 5,
      talukaOfficial: 4,
      extOfficerCount: 10,
      headmasterCount: 30,
    },
    {
      district: 'पुणे',
      stateRep: 0,
      divRep: 1,
      distOfficial: 4,
      talukaOfficial: 3,
      extOfficerCount: 5,
      headmasterCount: 15,
    },
  ]);

  assert.equal(rows.length, 3); // 2 districts + 1 summary row
  assert.equal(totalOfficials, 20);
  assert.equal(totalMembers, 60);
  assert.equal(rows[2].isSummary, true);
  assert.equal(rows[2].cells[1], 'एकूण बेरीज (राज्य)');
  assert.equal(rows[2].cells[6], '20');
  assert.equal(rows[2].cells[9], '60');
  assert.equal(rows[2].cells[10], '60');
});

test('District Presidents, Taluka Presidents, Registered Members, and Statewide Registry builders format all columns cleanly', () => {
  const distPres = buildDistrictPresidentsPdfRows([
    {
      district: 'नाशिक',
      name: 'श्री. अ. ब. क.',
      cadre: 'शिक्षण विस्तार अधिकारी जेष्ठ - ओझर',
      post: 'जिल्हाध्यक्ष',
      mobile: '9876543210',
    },
  ]);
  assert.equal(distPres[0].cells.length, 6);
  assert.equal(distPres[0].cells[3], 'शिक्षण विस्तार अधिकारी - ओझर');

  const talukaPres = buildTalukaPresidentsPdfRows([
    {
      district: 'नाशिक',
      taluka: 'निफाड',
      name: 'श्री. म. न.',
      cadre: 'केंद्रप्रमुख - लासलगाव',
      post: 'तालुका अध्यक्ष',
      mobile: '9822001100',
    },
  ]);
  assert.equal(talukaPres[0].cells.length, 6);
  assert.equal(talukaPres[0].cells[1], 'नाशिक (निफाड)');

  const memberApps: MembershipApplication[] = [
    {
      id: 'app1',
      applicationNumber: 'APP-1',
      memberNumber: 'MS/2026/NASH/0001',
      salutation: 'सौ',
      fullName: 'मीना जोशी',
      professional: 'शिक्षण विस्तार अधिकारी कनिष्ठ',
      district: 'नाशिक',
      taluka: 'निफाड',
      centerName: 'पिंपळगाव बसवंत',
      phone: '9800000001',
      email: 'a@b.com',
      education: 'M.A.',
      address: 'नाशिक',
      status: 'approved',
      createdAt: '2026-05-01T00:00:00Z',
    },
  ];
  const regResult = buildRegisteredMembersPdfRows(memberApps);
  assert.equal(regResult.rows.length, 1);
  assert.equal(regResult.femaleCount, 1);
  assert.equal(regResult.rows[0].cells.length, 8);
  assert.equal(regResult.rows[0].cells[3], 'स्त्री');
  assert.equal(regResult.rows[0].cells[4], 'शिक्षण विस्तार अधिकारी');
  assert.equal(regResult.rows[0].cells[6], 'पिंपळगाव बसवंत');

  const regOfficials = buildStatewideRegistryPdfRows([
    {
      id: 'o1',
      salutation: 'श्री.',
      firstName: 'संजय',
      lastName: 'मोरे',
      appointedPost: 'जिल्हाध्यक्ष',
      district: 'पुणे',
      taluka: 'हवेली',
      currentCadre: 'केंद्रप्रमुख',
      workingPlace: 'उरुळी कांचन',
      mobile: '9822112233',
      updatedAt: '2026-05-01T00:00:00Z',
    },
  ]);
  assert.equal(regOfficials[0].cells.length, 8);
  assert.equal(regOfficials[0].cells[6], 'उरुळी कांचन');
});

test('wrapTextToLines wraps at word boundaries and computeVerticalCenteredBaselines centers cleanly', () => {
  const monoMeasure = (s: string) => s.length * 10;
  const lines = wrapTextToLines('शिक्षण विस्तार अधिकारी - पिंपळगाव बसवंत', 160, monoMeasure);
  assert.ok(lines.length >= 2);
  for (const line of lines) {
    assert.ok(monoMeasure(line) <= 160);
  }

  const single = computeVerticalCenteredBaselines({
    cellTop: 100,
    cellHeight: 40,
    lineCount: 1,
    lineHeight: 16,
    ascent: 12,
    descent: 4,
  });
  assert.deepEqual(single, [124]);
});

test('paginateMeasuredDistrictRows shows letterhead ONLY on Page 1 and reserves signature cleanly on Final Page', () => {
  const rowHeights = Array.from({ length: 35 }, () => 9);
  const pages = paginateMeasuredDistrictRows({
    rowHeightsMm: rowHeights,
    firstPageTableMaxMm: 180,
    continuationPageTableMaxMm: 245,
    signatureReserveMm: 37,
  });

  assert.ok(pages.length >= 2);
  assert.equal(pages[0].showLetterhead, true);
  assert.equal(pages[pages.length - 1].showSignature, true);
  for (let i = 1; i < pages.length; i++) {
    assert.equal(pages[i].showLetterhead, false);
  }
  const flattened = pages.flatMap((p) => p.rowIndices);
  assert.deepEqual(
    flattened,
    Array.from({ length: 35 }, (_, i) => i)
  );
});

test('getAdaptivePdfQualityLadder adapts smoothly for both <=500KB and <=1MB high-page-count budgets', () => {
  assert.ok(SAFE_TARGET_PDF_BYTES < TARGET_MAX_PDF_BYTES);
  assert.ok(SAFE_TARGET_MULTI_PDF_BYTES < TARGET_MAX_MULTI_PDF_BYTES);

  const ladderShort500k = getAdaptivePdfQualityLadder(1, TARGET_MAX_PDF_BYTES);
  const ladderLong1Mb = getAdaptivePdfQualityLadder(25, TARGET_MAX_MULTI_PDF_BYTES);

  assert.ok(ladderShort500k[0].dpi >= 200);
  assert.ok(ladderLong1Mb[0].dpi < ladderShort500k[0].dpi);
  for (let i = 1; i < ladderLong1Mb.length; i++) {
    assert.ok(ladderLong1Mb[i].dpi < ladderLong1Mb[i - 1].dpi);
    assert.ok(ladderLong1Mb[i].textJpegQuality < ladderLong1Mb[i - 1].textJpegQuality);
  }
});

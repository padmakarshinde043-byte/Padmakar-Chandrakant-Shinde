import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTENT_WIDTH_MM,
  DISTRICT_EXECUTIVE_PDF_COLUMNS,
  SAFE_TARGET_PDF_BYTES,
  TARGET_MAX_PDF_BYTES,
  buildDistrictExecutivePdfRows,
  computeVerticalCenteredBaselines,
  getAdaptivePdfQualityLadder,
  paginateMeasuredDistrictRows,
  wrapTextToLines,
} from './districtExecutivePdfLayout';
import type { OfficialMember } from '../data/rkMaharashtraData';

test('DISTRICT_EXECUTIVE_PDF_COLUMNS matches all 6 Excel columns with strict Vertical-Center & Horizontal-Left alignment', () => {
  assert.equal(DISTRICT_EXECUTIVE_PDF_COLUMNS.length, 6);
  assert.deepEqual(
    DISTRICT_EXECUTIVE_PDF_COLUMNS.map((c) => c.header),
    [
      'अ.क्र.',
      'पदाधिकाऱ्याचे संपूर्ण नाव',
      'सध्याचे पद व कार्यक्षेत्र',
      'संघटनेतील बहाल पद',
      'मोबाईल नंबर',
      'तालुका',
    ]
  );

  const totalWidth = DISTRICT_EXECUTIVE_PDF_COLUMNS.reduce((sum, c) => sum + c.widthMm, 0);
  assert.equal(totalWidth, CONTENT_WIDTH_MM);

  for (const col of DISTRICT_EXECUTIVE_PDF_COLUMNS) {
    assert.equal(col.hAlign, 'left');
    assert.equal(col.vAlign, 'middle');
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

test('wrapTextToLines wraps at word boundaries and breaks only overly long tokens', () => {
  const monoMeasure = (s: string) => s.length * 10;
  const lines = wrapTextToLines('शिक्षण विस्तार अधिकारी - पिंपळगाव बसवंत', 160, monoMeasure);
  assert.ok(lines.length >= 2);
  for (const line of lines) {
    assert.ok(monoMeasure(line) <= 160);
  }
});

test('computeVerticalCenteredBaselines centers single and multi-line text symmetrically inside cell', () => {
  const single = computeVerticalCenteredBaselines({
    cellTop: 100,
    cellHeight: 40,
    lineCount: 1,
    lineHeight: 16,
    ascent: 12,
    descent: 4,
  });
  // blockHeight = 16 -> top gap = (40 - 16)/2 = 12 -> baseline = 100 + 12 + 12 = 124
  assert.equal(single.length, 1);
  assert.equal(single[0], 124);

  const twoLines = computeVerticalCenteredBaselines({
    cellTop: 0,
    cellHeight: 50,
    lineCount: 2,
    lineHeight: 16,
    ascent: 12,
    descent: 4,
  });
  // blockHeight = 16 + 12 + 4 = 32 -> top gap = 9 -> baselines = [21, 37]
  assert.deepEqual(twoLines, [21, 37]);
});

test('paginateMeasuredDistrictRows shows letterhead ONLY on Page 1 and reserves signature cleanly on Final Page', () => {
  // 35 rows of 9mm each -> requires multiple pages
  const rowHeights = Array.from({ length: 35 }, () => 9);
  const pages = paginateMeasuredDistrictRows({
    rowHeightsMm: rowHeights,
    firstPageTableMaxMm: 180,
    continuationPageTableMaxMm: 245,
    signatureReserveMm: 37,
  });

  assert.ok(pages.length >= 2);
  assert.equal(pages[0].showLetterhead, true);
  for (let i = 1; i < pages.length; i++) {
    assert.equal(pages[i].showLetterhead, false);
  }
  for (let i = 0; i < pages.length - 1; i++) {
    assert.equal(pages[i].showSignature, false);
  }
  assert.equal(pages[pages.length - 1].showSignature, true);

  // Every row index appears exactly once in ascending order
  const flattened = pages.flatMap((p) => p.rowIndices);
  assert.equal(flattened.length, 35);
  assert.deepEqual(
    flattened,
    Array.from({ length: 35 }, (_, i) => i)
  );

  // Final page has rows + signature room without overflow
  const lastPage = pages[pages.length - 1];
  assert.ok(lastPage.rowIndices.length > 0);
  const lastRowsHeight = lastPage.rowIndices.length * 9;
  assert.ok(lastRowsHeight + 37 <= 245);
});

test('paginateMeasuredDistrictRows spills trailing rows onto Page 2 when Page 1 rows fill height leaving no room for signature', () => {
  // 19 rows * 9mm = 171mm on a 180mm page1 -> fits rows, but 171 + 37 = 208 > 180
  const rowHeights = Array.from({ length: 19 }, () => 9);
  const pages = paginateMeasuredDistrictRows({
    rowHeightsMm: rowHeights,
    firstPageTableMaxMm: 180,
    continuationPageTableMaxMm: 245,
    signatureReserveMm: 37,
  });

  assert.equal(pages.length, 2);
  assert.equal(pages[0].showLetterhead, true);
  assert.equal(pages[0].showSignature, false);
  assert.equal(pages[1].showLetterhead, false);
  assert.equal(pages[1].showSignature, true);
  assert.ok(pages[1].rowIndices.length >= 2);
});

test('getAdaptivePdfQualityLadder provides monotonically compact profiles under 500 KB budget', () => {
  assert.ok(SAFE_TARGET_PDF_BYTES < TARGET_MAX_PDF_BYTES);
  const ladder1 = getAdaptivePdfQualityLadder(1);
  const ladder5 = getAdaptivePdfQualityLadder(5);
  assert.ok(ladder1.length >= 5);
  assert.ok(ladder5[0].dpi < ladder1[0].dpi);
  for (let i = 1; i < ladder1.length; i++) {
    assert.ok(ladder1[i].dpi < ladder1[i - 1].dpi);
    assert.ok(ladder1[i].textJpegQuality < ladder1[i - 1].textJpegQuality);
  }
});

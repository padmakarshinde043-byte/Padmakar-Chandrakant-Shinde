import test from 'node:test';
import assert from 'node:assert/strict';
import {
  packMeasuredRowsIntoPages,
  buildTableRowHtml,
  buildSingleTablePageHtml,
  buildSingleAppointmentLetterHtml,
  REPORT_FONT_FAMILY,
} from './pdfReportLayout';

test('packMeasuredRowsIntoPages packs rows densely without leaving blank half-pages or overflowing', () => {
  const rowHeights = Array.from({ length: 45 }, () => 34);
  const pages = packMeasuredRowsIntoPages({
    rowHeights,
    firstPageAvailableHeight: 820, // ~24 rows fit
    continuationPageAvailableHeight: 960, // ~28 rows fit
    trailingReserveHeight: 110, // signature reserve on last page
  });

  assert.equal(pages.length, 2);
  assert.equal(pages[0].length, 24);
  assert.equal(pages[1].length, 21);

  const page1Height = pages[0].reduce((s, i) => s + rowHeights[i], 0);
  const page2Height = pages[1].reduce((s, i) => s + rowHeights[i], 0);
  assert.ok(page1Height <= 820);
  assert.ok(page2Height + 110 <= 960);
});

test('packMeasuredRowsIntoPages spills rows cleanly when last page lacks space for trailing signature/summary', () => {
  const rowHeights = Array.from({ length: 28 }, () => 34); // total = 952
  const pages = packMeasuredRowsIntoPages({
    rowHeights,
    firstPageAvailableHeight: 960, // all 28 fit alone (952 <= 960), but +120 signature = 1072 > 960!
    continuationPageAvailableHeight: 960,
    trailingReserveHeight: 120,
  });

  assert.equal(pages.length, 2);
  const p1Height = pages[0].reduce((s, i) => s + rowHeights[i], 0);
  const p2Height = pages[1].reduce((s, i) => s + rowHeights[i], 0);
  assert.ok(p1Height <= 960);
  assert.ok(p2Height + 120 <= 960);
  assert.equal(pages[0].length + pages[1].length, 28);
});

test('buildTableRowHtml uses uniform Devanagari font, generous bottom padding, and no stars or gradients', () => {
  const cols = [
    { header: 'अनु.', width: '44px', align: 'center' as const },
    { header: 'जिल्हा', width: '115px', align: 'left' as const },
    { header: 'नाव', flex: 1, align: 'left' as const },
  ];

  const rowHtml = buildTableRowHtml(
    [
      { text: '1', bold: true },
      { text: 'पुणे', bold: true },
      { text: 'श्री. अनिल <टेस्ट> कुलकर्णी' },
    ],
    cols,
    { rowIndex: 1 }
  );

  assert.ok(rowHtml.includes(REPORT_FONT_FAMILY));
  assert.ok(!rowHtml.includes('monospace'));
  assert.ok(!rowHtml.includes('⭐'));
  assert.ok(!rowHtml.includes('linear-gradient'));
  assert.ok(rowHtml.includes('padding: 5.5px 7px 8.5px 7px'));
  assert.ok(rowHtml.includes('line-height: 1.45'));
  assert.ok(rowHtml.includes('पुणे'));
  assert.ok(rowHtml.includes('&lt;टेस्ट&gt;'));
});

test('buildSingleTablePageHtml and buildSingleAppointmentLetterHtml contain zero gradients, zero stars, and zero promotional footers', () => {
  const cols = [
    { header: 'अनु.', width: '44px', align: 'center' as const },
    { header: 'जिल्हा', flex: 1, align: 'left' as const },
  ];

  const pageHtml = buildSingleTablePageHtml({
    orgTitle: 'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
    reportTitle: 'सर्व जिल्हाध्यक्ष यादी',
    leftMeta: 'एकूण नोंदी: 34',
    rightMeta: 'दिनांक: 13/11/2026',
    pageNumber: 1,
    totalPages: 2,
    columns: cols,
    pageRowsHtml: [buildTableRowHtml([{ text: '1' }, { text: 'पुणे' }], cols)],
  });

  assert.ok(!pageHtml.includes('⭐'));
  assert.ok(!pageHtml.includes('linear-gradient'));
  assert.ok(!pageHtml.includes('अधिकृत अहवाल प्रत'));
  assert.ok(!pageHtml.includes('पाटणे'));
  assert.ok(pageHtml.includes('पृष्ठ: 1 / 2'));

  const letterHtml = buildSingleAppointmentLetterHtml({
    member: {
      id: '101',
      salutation: 'श्री.',
      firstName: 'राजेंद्र',
      middleName: 'शिवाजी',
      lastName: 'पाटील',
      district: 'पुणे',
      taluka: 'बारामती',
      currentCadre: 'केंद्रप्रमुख',
      workingPlace: 'केंद्र बारामती',
      appointedPost: 'जिल्हाध्यक्ष',
      mobile: '9876543210',
      updatedAt: '2026-11-13T00:00:00.000Z',
    },
    serialPadded: '01',
    todayStr: '13/11/2026',
    hedingUrl: '/heding.jpg',
    signUrl: '/sign.jpg',
  });

  assert.ok(!letterHtml.includes('⭐'));
  assert.ok(!letterHtml.includes('linear-gradient'));
  assert.ok(!letterHtml.includes('monospace'));
  assert.ok(letterHtml.includes('MS/2026/01'));
  assert.ok(letterHtml.includes('पुणे'));
});

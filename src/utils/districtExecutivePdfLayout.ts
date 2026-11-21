import { OfficialMember } from '../data/rkMaharashtraData';
import {
  MembershipApplication,
  normalizeCadreInText,
  normalizeOfficialCadre,
} from '../data/mahasanghData';
import { toEnglishDigits } from './formatters';
import {
  formatMemberDisplayName,
  resolveEffectiveSalutation,
  resolveMemberGender,
} from './memberGender';
import { sortMembersForUnifiedExcel } from './excelExporter';

/**
 * Pure geometry, column specifications, Devanagari-safe wrapping,
 * A4 Portrait/Landscape pagination, and <= 500 KB / <= 1 MB adaptive byte-budget planner
 * shared by ALL 6 Official Office PDFs in State President Login (राज्याध्यक्ष लॉगिन).
 */

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const PAGE_MARGIN_X_MM = 10;
export const PAGE_MARGIN_TOP_MM = 8.5;
export const PAGE_MARGIN_BOTTOM_MM = 10;
export const CONTENT_WIDTH_MM = A4_WIDTH_MM - PAGE_MARGIN_X_MM * 2; // 190 mm exact (Portrait)
export const LANDSCAPE_CONTENT_WIDTH_MM = A4_HEIGHT_MM - PAGE_MARGIN_X_MM * 2; // 277 mm exact (Landscape)
export const FOOTER_AREA_MM = 6.5;

/** Strictly enforced target PDF size caps */
export const TARGET_MAX_PDF_BYTES = 500 * 1024; // 500 KB for District Executive
export const SAFE_TARGET_PDF_BYTES = 492 * 1024;
export const TARGET_MAX_MULTI_PDF_BYTES = 1024 * 1024; // 1 MB for other 5 multi-page reports
export const SAFE_TARGET_MULTI_PDF_BYTES = 990 * 1024;

export const DISTRICT_PDF_FONT_FAMILY =
  "'Noto Sans Devanagari', 'Kohinoor Devanagari', 'Nirmala UI', sans-serif";

export interface OfficePdfColumnSpec {
  key: string;
  header: string;
  widthMm: number;
  /** Strictly horizontal-left across ALL columns per user specification. */
  hAlign: 'left';
  /** Strictly vertical-center across ALL columns per user specification. */
  vAlign: 'middle';
  boldBody?: boolean;
}

export type DistrictPdfColumnSpec = OfficePdfColumnSpec;

export interface OfficePdfRowData {
  cells: string[];
  isSummary?: boolean;
}

export type DistrictPdfRowData = OfficePdfRowData;

/**
 * 1. District Executive Committee PDF Columns (A4 Portrait, 190 mm exact)
 * Clean 5 official print columns (Mobile Number omitted on letterhead PDFs for privacy).
 * Total width = 12 + 55 + 53 + 43 + 27 = 190.0 mm
 */
export const DISTRICT_EXECUTIVE_PDF_COLUMNS: readonly OfficePdfColumnSpec[] = [
  { key: 'serial', header: 'अ.क्र.', widthMm: 12, hAlign: 'left', vAlign: 'middle', boldBody: true },
  { key: 'fullName', header: 'पदाधिकाऱ्याचे संपूर्ण नाव', widthMm: 55, hAlign: 'left', vAlign: 'middle', boldBody: true },
  { key: 'cadreAndCenter', header: 'सध्याचे पद व कार्यक्षेत्र', widthMm: 53, hAlign: 'left', vAlign: 'middle', boldBody: false },
  { key: 'appointedPost', header: 'संघटनेतील बहाल पद', widthMm: 43, hAlign: 'left', vAlign: 'middle', boldBody: true },
  { key: 'taluka', header: 'तालुका', widthMm: 27, hAlign: 'left', vAlign: 'middle', boldBody: false },
] as const;

/**
 * 2. Organization Status Matrix PDF Columns (A4 Landscape, 277 mm exact)
 * Exact 11 columns matching `exportOrganizationStatusExcel` 1:1.
 * Total width = 13 + 42 + 23 + 25 + 25 + 25 + 25 + 29 + 22 + 24 + 24 = 277.0 mm
 */
export const ORGANIZATION_STATUS_PDF_COLUMNS: readonly OfficePdfColumnSpec[] = [
  { key: 'serial', header: 'अ.क्र.', widthMm: 13, hAlign: 'left', vAlign: 'middle', boldBody: true },
  { key: 'district', header: 'जिल्ह्याचे नाव', widthMm: 42, hAlign: 'left', vAlign: 'middle', boldBody: true },
  { key: 'stateRep', header: 'राज्य प्रतिनिधी', widthMm: 23, hAlign: 'left', vAlign: 'middle' },
  { key: 'divRep', header: 'विभागीय प्रतिनिधी', widthMm: 25, hAlign: 'left', vAlign: 'middle' },
  { key: 'distOff', header: 'जिल्हा पदाधिकारी', widthMm: 25, hAlign: 'left', vAlign: 'middle' },
  { key: 'talukaOff', header: 'तालुका पदाधिकारी', widthMm: 25, hAlign: 'left', vAlign: 'middle' },
  { key: 'offTot', header: 'एकूण पदाधिकारी', widthMm: 25, hAlign: 'left', vAlign: 'middle', boldBody: true },
  { key: 'extOfficer', header: 'शिक्षण विस्तार अधिकारी', widthMm: 29, hAlign: 'left', vAlign: 'middle' },
  { key: 'headmaster', header: 'केंद्रप्रमुख', widthMm: 22, hAlign: 'left', vAlign: 'middle' },
  { key: 'memTot', header: 'एकूण सदस्य', widthMm: 24, hAlign: 'left', vAlign: 'middle', boldBody: true },
  { key: 'grandTot', header: 'एकूण बेरीज', widthMm: 24, hAlign: 'left', vAlign: 'middle', boldBody: true },
] as const;

/**
 * 3. All District Presidents PDF Columns (A4 Portrait, 190 mm exact)
 * Clean 5 official print columns (Mobile Number omitted on letterhead PDFs).
 * Total width = 12 + 33 + 56 + 53 + 36 = 190.0 mm
 */
export const DISTRICT_PRESIDENTS_PDF_COLUMNS: readonly OfficePdfColumnSpec[] = [
  { key: 'serial', header: 'अ.क्र.', widthMm: 12, hAlign: 'left', vAlign: 'middle', boldBody: true },
  { key: 'district', header: 'जिल्हा', widthMm: 33, hAlign: 'left', vAlign: 'middle', boldBody: true },
  { key: 'name', header: 'पदाधिकाऱ्याचे संपूर्ण नाव', widthMm: 56, hAlign: 'left', vAlign: 'middle', boldBody: true },
  { key: 'cadre', header: 'सध्याचे पद व कार्यक्षेत्र', widthMm: 53, hAlign: 'left', vAlign: 'middle' },
  { key: 'post', header: 'संघटनेतील पद', widthMm: 36, hAlign: 'left', vAlign: 'middle', boldBody: true },
] as const;

/**
 * 4. All Taluka Presidents PDF Columns (A4 Portrait, 190 mm exact)
 * Clean 5 official print columns (Mobile Number omitted on letterhead PDFs).
 * Total width = 12 + 40 + 54 + 50 + 34 = 190.0 mm
 */
export const TALUKA_PRESIDENTS_PDF_COLUMNS: readonly OfficePdfColumnSpec[] = [
  { key: 'serial', header: 'अ.क्र.', widthMm: 12, hAlign: 'left', vAlign: 'middle', boldBody: true },
  { key: 'districtTaluka', header: 'जिल्हा व तालुका', widthMm: 40, hAlign: 'left', vAlign: 'middle', boldBody: true },
  { key: 'name', header: 'पदाधिकाऱ्याचे संपूर्ण नाव', widthMm: 54, hAlign: 'left', vAlign: 'middle', boldBody: true },
  { key: 'cadre', header: 'सध्याचे पद व कार्यक्षेत्र', widthMm: 50, hAlign: 'left', vAlign: 'middle' },
  { key: 'post', header: 'संघटनेतील पद', widthMm: 34, hAlign: 'left', vAlign: 'middle', boldBody: true },
] as const;

/**
 * 5. Approved Registered Members PDF Columns (A4 Portrait, 190 mm exact)
 * Clean 7 columns with member number, name, gender, cadre, district/taluka, working center (Mobile omitted on PDF).
 * Total width = 11 + 28 + 44 + 14 + 28 + 33 + 32 = 190.0 mm
 */
export const REGISTERED_MEMBERS_PDF_COLUMNS: readonly OfficePdfColumnSpec[] = [
  { key: 'serial', header: 'अ.क्र.', widthMm: 11, hAlign: 'left', vAlign: 'middle', boldBody: true },
  { key: 'memberNo', header: 'सदस्य क्र.', widthMm: 28, hAlign: 'left', vAlign: 'middle', boldBody: true },
  { key: 'fullName', header: 'संपूर्ण नाव', widthMm: 44, hAlign: 'left', vAlign: 'middle', boldBody: true },
  { key: 'gender', header: 'लिंग', widthMm: 14, hAlign: 'left', vAlign: 'middle' },
  { key: 'cadre', header: 'पद / संवर्ग', widthMm: 28, hAlign: 'left', vAlign: 'middle' },
  { key: 'districtTaluka', header: 'जिल्हा व तालुका', widthMm: 33, hAlign: 'left', vAlign: 'middle' },
  { key: 'centerName', header: 'कार्यरत केंद्र', widthMm: 32, hAlign: 'left', vAlign: 'middle' },
] as const;

/**
 * 6. Statewide Appointments Registry PDF Columns (A4 Portrait, 190 mm exact)
 * Clean 7 official print columns (Mobile Number omitted on letterhead PDFs).
 * Total width = 11 + 42 + 25 + 23 + 33 + 26 + 30 = 190.0 mm
 */
export const STATEWIDE_REGISTRY_PDF_COLUMNS: readonly OfficePdfColumnSpec[] = [
  { key: 'serial', header: 'अ.क्र.', widthMm: 11, hAlign: 'left', vAlign: 'middle', boldBody: true },
  { key: 'fullName', header: 'संपूर्ण नाव', widthMm: 42, hAlign: 'left', vAlign: 'middle', boldBody: true },
  { key: 'district', header: 'जिल्हा', widthMm: 25, hAlign: 'left', vAlign: 'middle', boldBody: true },
  { key: 'taluka', header: 'तालुका', widthMm: 23, hAlign: 'left', vAlign: 'middle' },
  { key: 'appointedPost', header: 'बहाल पद', widthMm: 33, hAlign: 'left', vAlign: 'middle', boldBody: true },
  { key: 'cadre', header: 'सध्याचे पद', widthMm: 26, hAlign: 'left', vAlign: 'middle' },
  { key: 'workingPlace', header: 'कार्यरत केंद्र', widthMm: 30, hAlign: 'left', vAlign: 'middle' },
] as const;

/**
 * Row Builder 1: District Executive Committee
 */
export function buildDistrictExecutivePdfRows(officials: OfficialMember[]): OfficePdfRowData[] {
  return (officials || []).map((m, idx) => {
    const fullName =
      [m.salutation, m.firstName, m.middleName, m.lastName]
        .map((part) => (part || '').trim())
        .filter(Boolean)
        .join(' ') || '-';

    const cadreAndCenter =
      [normalizeOfficialCadre(m.currentCadre, ''), (m.workingPlace || '').trim()]
        .filter(Boolean)
        .join(' - ') || '-';

    return {
      cells: [
        toEnglishDigits(idx + 1),
        fullName,
        cadreAndCenter,
        (m.appointedPost || '').trim() || '-',
        (m.taluka || '').trim() || '-',
      ],
    };
  });
}

/**
 * Row Builder 2: 34 Districts Organization Status Matrix (includes bold totals summary row)
 */
export function buildOrganizationStatusPdfRows(stats: Array<any>): {
  rows: OfficePdfRowData[];
  totalOfficials: number;
  totalMembers: number;
} {
  let tStateRep = 0;
  let tDivRep = 0;
  let tDistOff = 0;
  let tTalukaOff = 0;
  let tOffTot = 0;
  let tExt = 0;
  let tHm = 0;
  let tMemTot = 0;
  let tGrandTot = 0;

  const rows: OfficePdfRowData[] = (stats || []).map((st, idx) => {
    const stateRep = Number(st.stateRep || 0);
    const divRep = Number(st.divRep || 0);
    const distOff = Number(st.distOfficial || 0);
    const talukaOff = Number(st.talukaOfficial || 0);
    const offTot = st.officialsTotal ?? stateRep + divRep + distOff + talukaOff;

    const ext = Number(st.extOfficerCount || 0);
    const hm = Number(st.headmasterCount ?? st.members ?? 0);
    const memTot = st.membersTotal ?? ext + hm;
    const rowTot = st.rowTotal !== undefined ? Number(st.rowTotal) : memTot;

    tStateRep += stateRep;
    tDivRep += divRep;
    tDistOff += distOff;
    tTalukaOff += talukaOff;
    tOffTot += offTot;
    tExt += ext;
    tHm += hm;
    tMemTot += memTot;
    tGrandTot += rowTot;

    return {
      cells: [
        toEnglishDigits(idx + 1),
        String(st.district || '-'),
        toEnglishDigits(stateRep),
        toEnglishDigits(divRep),
        toEnglishDigits(distOff),
        toEnglishDigits(talukaOff),
        toEnglishDigits(offTot),
        toEnglishDigits(ext),
        toEnglishDigits(hm),
        toEnglishDigits(memTot),
        toEnglishDigits(rowTot),
      ],
    };
  });

  rows.push({
    isSummary: true,
    cells: [
      '',
      'एकूण बेरीज (राज्य)',
      toEnglishDigits(tStateRep),
      toEnglishDigits(tDivRep),
      toEnglishDigits(tDistOff),
      toEnglishDigits(tTalukaOff),
      toEnglishDigits(tOffTot),
      toEnglishDigits(tExt),
      toEnglishDigits(tHm),
      toEnglishDigits(tMemTot),
      toEnglishDigits(tGrandTot),
    ],
  });

  return { rows, totalOfficials: tOffTot, totalMembers: tMemTot };
}

/**
 * Row Builder 3: All District Presidents
 */
export function buildDistrictPresidentsPdfRows(
  list: Array<{ district: string; name: string; cadre: string; post: string; mobile?: string }>
): OfficePdfRowData[] {
  return (list || []).map((item, idx) => ({
    cells: [
      toEnglishDigits(idx + 1),
      (item.district || '').trim() || '-',
      (item.name || '').trim() || '-',
      normalizeCadreInText(item.cadre, '-'),
      (item.post || '').trim() || '-',
    ],
  }));
}

/**
 * Row Builder 4: All Taluka Presidents
 */
export function buildTalukaPresidentsPdfRows(
  list: Array<{
    district: string;
    taluka?: string;
    name: string;
    cadre: string;
    post: string;
    mobile?: string;
  }>
): OfficePdfRowData[] {
  return (list || []).map((item, idx) => ({
    cells: [
      toEnglishDigits(idx + 1),
      `${(item.district || '').trim()}${item.taluka ? ` (${item.taluka.trim()})` : ''}` || '-',
      (item.name || '').trim() || '-',
      normalizeCadreInText(item.cadre, '-'),
      (item.post || '').trim() || '-',
    ],
  }));
}

/**
 * Row Builder 5: Approved Registered Members (Unified order, gender & working center)
 */
export function buildRegisteredMembersPdfRows(list: MembershipApplication[]): {
  rows: OfficePdfRowData[];
  maleCount: number;
  femaleCount: number;
} {
  const sorted = sortMembersForUnifiedExcel(list);
  let maleCount = 0;
  let femaleCount = 0;

  const rows: OfficePdfRowData[] = sorted.map((m, idx) => {
    const salutation = resolveEffectiveSalutation(m);
    const gender = resolveMemberGender(m);
    if (gender === 'पुरुष') maleCount += 1;
    else if (gender === 'स्त्री') femaleCount += 1;

    const fullName = formatMemberDisplayName(salutation, m.fullName) || '-';
    const districtTaluka =
      [m.district, m.taluka ? `ता. ${m.taluka}` : ''].filter(Boolean).join(', ') || '-';

    return {
      cells: [
        toEnglishDigits(idx + 1),
        toEnglishDigits((m.memberNumber || m.applicationNumber || '').trim() || '-'),
        fullName,
        gender || '-',
        normalizeOfficialCadre(m.professional, '-'),
        districtTaluka,
        (m.centerName || '').trim() || '-',
      ],
    };
  });

  return { rows, maleCount, femaleCount };
}

/**
 * Row Builder 6: Statewide Appointments Master Registry
 */
export function buildStatewideRegistryPdfRows(officials: OfficialMember[]): OfficePdfRowData[] {
  return (officials || []).map((m, idx) => {
    const fullName =
      [m.salutation, m.firstName, m.middleName, m.lastName]
        .map((part) => (part || '').trim())
        .filter(Boolean)
        .join(' ') || '-';

    return {
      cells: [
        toEnglishDigits(idx + 1),
        fullName,
        (m.district || '').trim() || '-',
        (m.taluka || '').trim() || '-',
        (m.appointedPost || '').trim() || '-',
        normalizeOfficialCadre(m.currentCadre, '-'),
        (m.workingPlace || '').trim() || '-',
      ],
    };
  });
}

/**
 * Word-boundary text wrapper for Canvas 2D Devanagari rendering.
 * Never breaks inside a Marathi word unless a single unbroken token exceeds maxWidthPx.
 */
export function wrapTextToLines(
  text: string,
  maxWidthPx: number,
  measureWidth: (sample: string) => number
): string[] {
  const cleaned = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return ['-'];
  if (maxWidthPx <= 0 || measureWidth(cleaned) <= maxWidthPx) {
    return [cleaned];
  }

  const words = cleaned.split(' ');
  const lines: string[] = [];
  let current = '';

  const pushOversizedWord = (word: string) => {
    const chars = Array.from(word);
    let chunk = '';
    for (const ch of chars) {
      const candidate = chunk + ch;
      if (chunk && measureWidth(candidate) > maxWidthPx) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk = candidate;
      }
    }
    if (chunk) {
      current = chunk;
    }
  };

  for (const word of words) {
    if (!current) {
      if (measureWidth(word) <= maxWidthPx) {
        current = word;
      } else {
        pushOversizedWord(word);
      }
      continue;
    }

    const candidate = `${current} ${word}`;
    if (measureWidth(candidate) <= maxWidthPx) {
      current = candidate;
    } else {
      lines.push(current);
      current = '';
      if (measureWidth(word) <= maxWidthPx) {
        current = word;
      } else {
        pushOversizedWord(word);
      }
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : ['-'];
}

/**
 * Computes exact alphabetic Y baselines for `lineCount` lines so the entire text block
 * sits mathematically VERTICAL-CENTERED inside `[cellTop, cellTop + cellHeight]`,
 * accounting for Devanagari ascenders (ि, ी, े, ं) and descenders (ु, ू, ृ, ्).
 */
export function computeVerticalCenteredBaselines(params: {
  cellTop: number;
  cellHeight: number;
  lineCount: number;
  lineHeight: number;
  ascent: number;
  descent: number;
}): number[] {
  const { cellTop, cellHeight, lineCount, lineHeight, ascent, descent } = params;
  const count = Math.max(1, lineCount);
  const blockHeight = (count - 1) * lineHeight + ascent + descent;
  const blockTop = cellTop + (cellHeight - blockHeight) / 2;
  const baselines: number[] = [];
  for (let i = 0; i < count; i++) {
    baselines.push(blockTop + ascent + i * lineHeight);
  }
  return baselines;
}

export interface PaginatedDistrictPagePlan {
  pageNumber: number;
  rowIndices: number[];
  showLetterhead: boolean;
  showSignature: boolean;
}

/**
 * Pure height-based A4 page packer for all 6 office PDFs:
 * - Page 1 uses `firstPageTableMaxMm` (below full-color letterhead + title + meta + table header)
 * - Page 2+ uses `continuationPageTableMaxMm` (below compact header + repeated table header)
 * - Reserves `signatureReserveMm` on the final page so the State President signature block
 *   never clips and never floats completely alone on an empty page.
 */
export function paginateMeasuredDistrictRows(params: {
  rowHeightsMm: number[];
  firstPageTableMaxMm: number;
  continuationPageTableMaxMm: number;
  signatureReserveMm: number;
}): PaginatedDistrictPagePlan[] {
  const {
    rowHeightsMm,
    firstPageTableMaxMm,
    continuationPageTableMaxMm,
    signatureReserveMm,
  } = params;

  if (rowHeightsMm.length === 0) {
    return [
      {
        pageNumber: 1,
        rowIndices: [],
        showLetterhead: true,
        showSignature: true,
      },
    ];
  }

  const rawPages: number[][] = [];
  let cursor = 0;

  while (cursor < rowHeightsMm.length) {
    const isFirst = rawPages.length === 0;
    const cap = isFirst ? firstPageTableMaxMm : continuationPageTableMaxMm;
    const pageRows: number[] = [];
    let used = 0;

    while (cursor < rowHeightsMm.length) {
      const h = Math.max(6, rowHeightsMm[cursor] || 8);
      if (pageRows.length > 0 && used + h > cap) {
        break;
      }
      pageRows.push(cursor);
      used += h;
      cursor++;
    }

    rawPages.push(pageRows);
  }

  const lastIdx = rawPages.length - 1;
  const lastCap = lastIdx === 0 ? firstPageTableMaxMm : continuationPageTableMaxMm;
  const sumHeights = (indices: number[]) =>
    indices.reduce((acc, idx) => acc + Math.max(6, rowHeightsMm[idx] || 8), 0);

  if (sumHeights(rawPages[lastIdx]) + signatureReserveMm > lastCap) {
    const spill: number[] = [];
    let remainingHeight = sumHeights(rawPages[lastIdx]);

    while (
      rawPages[lastIdx].length > 2 &&
      remainingHeight + signatureReserveMm > lastCap
    ) {
      const moved = rawPages[lastIdx].pop()!;
      spill.unshift(moved);
      remainingHeight -= Math.max(6, rowHeightsMm[moved] || 8);
    }

    if (spill.length > 0) {
      rawPages.push(spill);
    } else if (rawPages[lastIdx].length > 1) {
      const moved = rawPages[lastIdx].pop()!;
      rawPages.push([moved]);
    } else {
      rawPages.push([]);
    }
  }

  return rawPages.map((rowIndices, idx) => ({
    pageNumber: idx + 1,
    rowIndices,
    showLetterhead: idx === 0,
    showSignature: idx === rawPages.length - 1,
  }));
}

export interface AdaptivePdfQualityProfile {
  label: string;
  dpi: number;
  textJpegQuality: number;
  letterheadMaxWidthPx: number;
  letterheadQuality: number;
  signMaxWidthPx: number;
  signQuality: number;
}

/**
 * Page-count & byte-budget-aware quality ladder for automatic <= 500 KB / <= 1 MB control.
 * Computes the per-page byte budget so even 20–40 page statewide reports start at the
 * right crisp DPI immediately and reliably land below the configured target byte cap.
 * Native PDF vector borders remain infinite-DPI across every profile.
 */
export function getAdaptivePdfQualityLadder(
  pageCount: number,
  targetMaxBytes: number = TARGET_MAX_PDF_BYTES
): AdaptivePdfQualityProfile[] {
  const allProfiles: AdaptivePdfQualityProfile[] = [
    {
      label: 'ultra-print',
      dpi: 215,
      textJpegQuality: 0.84,
      letterheadMaxWidthPx: 1480,
      letterheadQuality: 0.78,
      signMaxWidthPx: 440,
      signQuality: 0.84,
    },
    {
      label: 'high-print',
      dpi: 185,
      textJpegQuality: 0.78,
      letterheadMaxWidthPx: 1320,
      letterheadQuality: 0.72,
      signMaxWidthPx: 400,
      signQuality: 0.8,
    },
    {
      label: 'balanced-print',
      dpi: 160,
      textJpegQuality: 0.72,
      letterheadMaxWidthPx: 1180,
      letterheadQuality: 0.66,
      signMaxWidthPx: 360,
      signQuality: 0.76,
    },
    {
      label: 'compact-print',
      dpi: 140,
      textJpegQuality: 0.64,
      letterheadMaxWidthPx: 1040,
      letterheadQuality: 0.6,
      signMaxWidthPx: 320,
      signQuality: 0.72,
    },
    {
      label: 'tight-multi',
      dpi: 122,
      textJpegQuality: 0.56,
      letterheadMaxWidthPx: 920,
      letterheadQuality: 0.54,
      signMaxWidthPx: 290,
      signQuality: 0.68,
    },
    {
      label: 'dense-multi',
      dpi: 108,
      textJpegQuality: 0.49,
      letterheadMaxWidthPx: 820,
      letterheadQuality: 0.48,
      signMaxWidthPx: 260,
      signQuality: 0.62,
    },
    {
      label: 'high-volume',
      dpi: 95,
      textJpegQuality: 0.43,
      letterheadMaxWidthPx: 740,
      letterheadQuality: 0.44,
      signMaxWidthPx: 240,
      signQuality: 0.58,
    },
    {
      label: 'ultra-volume',
      dpi: 84,
      textJpegQuality: 0.38,
      letterheadMaxWidthPx: 660,
      letterheadQuality: 0.4,
      signMaxWidthPx: 220,
      signQuality: 0.54,
    },
    {
      label: 'max-volume',
      dpi: 74,
      textJpegQuality: 0.34,
      letterheadMaxWidthPx: 600,
      letterheadQuality: 0.36,
      signMaxWidthPx: 200,
      signQuality: 0.5,
    },
  ];

  const safePages = Math.max(1, pageCount);
  const usableBytes = Math.max(80 * 1024, targetMaxBytes - 75 * 1024);
  const budgetKbPerPage = usableBytes / safePages / 1024;

  if (budgetKbPerPage >= 150) return allProfiles;
  if (budgetKbPerPage >= 100) return allProfiles.slice(1);
  if (budgetKbPerPage >= 70) return allProfiles.slice(2);
  if (budgetKbPerPage >= 48) return allProfiles.slice(3);
  if (budgetKbPerPage >= 34) return allProfiles.slice(4);
  if (budgetKbPerPage >= 24) return allProfiles.slice(5);
  return allProfiles.slice(6);
}

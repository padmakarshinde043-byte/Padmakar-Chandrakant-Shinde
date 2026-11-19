import { OfficialMember } from '../data/rkMaharashtraData';
import { normalizeOfficialCadre } from '../data/mahasanghData';
import { toEnglishDigits } from './formatters';

/**
 * Pure geometry, 6-column specification, Devanagari-safe wrapping,
 * A4 pagination, and <= 500 KB adaptive byte-budget planner for the
 * Official District Executive Committee PDF (राज्याध्यक्ष लॉगिन).
 */

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const PAGE_MARGIN_X_MM = 10;
export const PAGE_MARGIN_TOP_MM = 8.5;
export const PAGE_MARGIN_BOTTOM_MM = 10;
export const CONTENT_WIDTH_MM = A4_WIDTH_MM - PAGE_MARGIN_X_MM * 2; // 190 mm exact
export const FOOTER_AREA_MM = 6.5;

/** Strictly enforced target PDF size cap (500 KB = 512,000 bytes). */
export const TARGET_MAX_PDF_BYTES = 500 * 1024;
/** Safety headroom below 500 KB to account for PDF object header overhead. */
export const SAFE_TARGET_PDF_BYTES = 492 * 1024;

export const DISTRICT_PDF_FONT_FAMILY =
  "'Noto Sans Devanagari', 'Kohinoor Devanagari', 'Nirmala UI', sans-serif";

export interface DistrictPdfColumnSpec {
  key: 'serial' | 'fullName' | 'cadreAndCenter' | 'appointedPost' | 'mobile' | 'taluka';
  header: string;
  widthMm: number;
  /** Strictly horizontal-left across ALL columns per user specification. */
  hAlign: 'left';
  /** Strictly vertical-center across ALL columns per user specification. */
  vAlign: 'middle';
  boldBody?: boolean;
}

/**
 * Exact 6-column layout matching `exportDistrictExecutiveExcel` 1:1.
 * Total width = 12 + 47 + 45 + 38 + 25 + 23 = 190.0 mm (full A4 printable width).
 */
export const DISTRICT_EXECUTIVE_PDF_COLUMNS: readonly DistrictPdfColumnSpec[] = [
  {
    key: 'serial',
    header: 'अ.क्र.',
    widthMm: 12,
    hAlign: 'left',
    vAlign: 'middle',
    boldBody: true,
  },
  {
    key: 'fullName',
    header: 'पदाधिकाऱ्याचे संपूर्ण नाव',
    widthMm: 47,
    hAlign: 'left',
    vAlign: 'middle',
    boldBody: true,
  },
  {
    key: 'cadreAndCenter',
    header: 'सध्याचे पद व कार्यक्षेत्र',
    widthMm: 45,
    hAlign: 'left',
    vAlign: 'middle',
    boldBody: false,
  },
  {
    key: 'appointedPost',
    header: 'संघटनेतील बहाल पद',
    widthMm: 38,
    hAlign: 'left',
    vAlign: 'middle',
    boldBody: true,
  },
  {
    key: 'mobile',
    header: 'मोबाईल नंबर',
    widthMm: 25,
    hAlign: 'left',
    vAlign: 'middle',
    boldBody: false,
  },
  {
    key: 'taluka',
    header: 'तालुका',
    widthMm: 23,
    hAlign: 'left',
    vAlign: 'middle',
    boldBody: false,
  },
] as const;

export interface DistrictPdfRowData {
  cells: [string, string, string, string, string, string];
}

/**
 * Formats officials into the exact 6-column values matching the Excel export:
 * [अ.क्र., संपूर्ण नाव, संवर्ग - कार्यरत केंद्र, बहाल पद, मोबाईल, तालुका]
 */
export function buildDistrictExecutivePdfRows(officials: OfficialMember[]): DistrictPdfRowData[] {
  return (officials || []).map((m, idx) => {
    const fullName = [m.salutation, m.firstName, m.middleName, m.lastName]
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
        toEnglishDigits((m.mobile || '').trim() || '-'),
        (m.taluka || '').trim() || '-',
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
 * Pure height-based A4 page packer for the District Executive PDF:
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

  // Verify signature fits cleanly below the last row on the final page
  const lastIdx = rawPages.length - 1;
  const lastCap = lastIdx === 0 ? firstPageTableMaxMm : continuationPageTableMaxMm;
  const sumHeights = (indices: number[]) =>
    indices.reduce((acc, idx) => acc + Math.max(6, rowHeightsMm[idx] || 8), 0);

  if (sumHeights(rawPages[lastIdx]) + signatureReserveMm > lastCap) {
    const spill: number[] = [];
    let remainingHeight = sumHeights(rawPages[lastIdx]);

    // Move trailing rows (leaving at least 2 rows on previous page when possible)
    // so the final page has rows + signature together (no lonely floating signature)
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
      // Only 1 very tall row on the last page — give signature its own clean continuation page
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
 * Ordered quality ladder for the automatic <= 500 KB byte-budget optimizer.
 * Starts crisp for the given page count and smoothly tunes compression only if needed.
 * Native PDF vector borders remain infinite-DPI across every profile.
 */
export function getAdaptivePdfQualityLadder(pageCount: number): AdaptivePdfQualityProfile[] {
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
      textJpegQuality: 0.66,
      letterheadMaxWidthPx: 1050,
      letterheadQuality: 0.6,
      signMaxWidthPx: 320,
      signQuality: 0.72,
    },
    {
      label: 'tight-multi',
      dpi: 122,
      textJpegQuality: 0.6,
      letterheadMaxWidthPx: 940,
      letterheadQuality: 0.55,
      signMaxWidthPx: 290,
      signQuality: 0.68,
    },
    {
      label: 'dense-multi',
      dpi: 108,
      textJpegQuality: 0.55,
      letterheadMaxWidthPx: 840,
      letterheadQuality: 0.5,
      signMaxWidthPx: 260,
      signQuality: 0.64,
    },
    {
      label: 'ultra-compact',
      dpi: 96,
      textJpegQuality: 0.5,
      letterheadMaxWidthPx: 760,
      letterheadQuality: 0.46,
      signMaxWidthPx: 240,
      signQuality: 0.6,
    },
  ];

  if (pageCount <= 2) return allProfiles;
  if (pageCount <= 4) return allProfiles.slice(1);
  if (pageCount <= 6) return allProfiles.slice(2);
  return allProfiles.slice(3);
}

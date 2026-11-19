/**
 * Unified Modern Hybrid Vector + Native-Shaped Devanagari A4 PDF Engine
 * for ALL 6 Official Office Reports in State President Login (राज्याध्यक्ष लॉगिन)
 *
 * Shared Guarantees across ALL 6 PDFs:
 * 1. Full-color official letterhead (/heding.jpg) on Page 1 ONLY.
 * 2. Compact institutional continuation header + page numbering + repeated table header on Page 2+.
 * 3. Strictly Vertical-Center + Horizontal-Left alignment in EVERY header & data cell.
 * 4. Larger, crisp, print-optimized Devanagari typography (Noto Sans Devanagari).
 * 5. Infinite-DPI native PDF vector table borders drawn on top of clean text bands.
 * 6. Official State President signature (/sign.jpg) with name & designation at the end of the final page.
 * 7. Automatic adaptive byte-budget controller:
 *    - District Executive PDF: <= 500 KB
 *    - All other 5 multi-page PDFs: <= 1 MB (even across 10–30+ pages)
 */

import { OfficialMember } from '../data/rkMaharashtraData';
import { MembershipApplication } from '../data/mahasanghData';
import { resolveImageUrlForPdf } from '../utils/cloudinary';
import { toEnglishDigits } from '../utils/formatters';
import {
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  PAGE_MARGIN_X_MM,
  PAGE_MARGIN_TOP_MM,
  PAGE_MARGIN_BOTTOM_MM,
  FOOTER_AREA_MM,
  DISTRICT_PDF_FONT_FAMILY,
  DISTRICT_EXECUTIVE_PDF_COLUMNS,
  ORGANIZATION_STATUS_PDF_COLUMNS,
  DISTRICT_PRESIDENTS_PDF_COLUMNS,
  TALUKA_PRESIDENTS_PDF_COLUMNS,
  REGISTERED_MEMBERS_PDF_COLUMNS,
  STATEWIDE_REGISTRY_PDF_COLUMNS,
  SAFE_TARGET_PDF_BYTES,
  SAFE_TARGET_MULTI_PDF_BYTES,
  TARGET_MAX_PDF_BYTES,
  TARGET_MAX_MULTI_PDF_BYTES,
  OfficePdfColumnSpec,
  OfficePdfRowData,
  AdaptivePdfQualityProfile,
  buildDistrictExecutivePdfRows,
  buildOrganizationStatusPdfRows,
  buildDistrictPresidentsPdfRows,
  buildTalukaPresidentsPdfRows,
  buildRegisteredMembersPdfRows,
  buildStatewideRegistryPdfRows,
  wrapTextToLines,
  computeVerticalCenteredBaselines,
  paginateMeasuredDistrictRows,
  getAdaptivePdfQualityLadder,
} from '../utils/districtExecutivePdfLayout';

export interface DistrictExecutivePdfResult {
  fileName: string;
  pageCount: number;
  sizeBytes: number;
  sizeKb: number;
}

export type OfficeHybridPdfResult = DistrictExecutivePdfResult;

const MM_PER_INCH = 25.4;

function mmToPx(mm: number, dpi: number): number {
  return (mm / MM_PER_INCH) * dpi;
}

function getTodayFormattedDate(): string {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const y = today.getFullYear();
  return `${d}/${m}/${y}`;
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

async function ensureDevanagariFontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !(document as any).fonts) return;
  try {
    await Promise.allSettled([
      (document as any).fonts.load(`400 14px 'Noto Sans Devanagari'`),
      (document as any).fonts.load(`600 14px 'Noto Sans Devanagari'`),
      (document as any).fonts.load(`700 14px 'Noto Sans Devanagari'`),
      (document as any).fonts.load(`800 16px 'Noto Sans Devanagari'`),
      (document as any).fonts.ready,
    ]);
  } catch {
    // Fallback to loaded system Devanagari fonts
  }
}

interface OptimizedImageAsset {
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  aspectRatio: number;
}

async function encodeOptimizedJpegAsset(
  img: HTMLImageElement,
  maxWidthPx: number,
  quality: number,
  cleanWhiteBackground = false
): Promise<OptimizedImageAsset> {
  const nw = img.naturalWidth || img.width || 1;
  const nh = img.naturalHeight || img.height || 1;
  const targetW = Math.min(nw, Math.max(120, Math.round(maxWidthPx)));
  const targetH = Math.max(20, Math.round((nh / nw) * targetW));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      dataUrl: '',
      naturalWidth: targetW,
      naturalHeight: targetH,
      aspectRatio: nw / nh,
    };
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetW, targetH);

  if (cleanWhiteBackground) {
    try {
      const imgData = ctx.getImageData(0, 0, targetW, targetH);
      const px = imgData.data;
      for (let i = 0; i < px.length; i += 4) {
        const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        if (lum >= 228) {
          px[i] = 255;
          px[i + 1] = 255;
          px[i + 2] = 255;
        } else if (lum < 190) {
          px[i] = Math.max(8, Math.round(px[i] * 0.78));
          px[i + 1] = Math.max(22, Math.round(px[i + 1] * 0.82));
          px[i + 2] = Math.min(210, Math.round(px[i + 2] * 0.98));
        }
      }
      ctx.putImageData(imgData, 0, 0);
    } catch {
      // Ignore pixel cleanup if blocked
    }
  }

  return {
    dataUrl: canvas.toDataURL('image/jpeg', quality),
    naturalWidth: targetW,
    naturalHeight: targetH,
    aspectRatio: nw / nh,
  };
}

interface MeasuredRowLayout {
  wrappedCells: string[][];
  heightMm: number;
  isSummary?: boolean;
}

interface MeasuredTableGeometry {
  headerWrapped: string[][];
  headerHeightMm: number;
  rows: MeasuredRowLayout[];
  bodyFontPt: number;
  headerFontPt: number;
  bodyLineHeightMm: number;
  headerLineHeightMm: number;
  cellPadXMm: number;
  cellPadYMm: number;
}

function measureTableGeometry(params: {
  columns: readonly OfficePdfColumnSpec[];
  rawRows: OfficePdfRowData[];
  bodyFontPt: number;
  headerFontPt: number;
  bodyLineHeightMm: number;
  headerLineHeightMm: number;
  cellPadXMm: number;
  cellPadYMm: number;
  minRowHeightMm: number;
  minHeaderHeightMm: number;
}): MeasuredTableGeometry {
  const {
    columns,
    rawRows,
    bodyFontPt,
    headerFontPt,
    bodyLineHeightMm,
    headerLineHeightMm,
    cellPadXMm,
    cellPadYMm,
    minRowHeightMm,
    minHeaderHeightMm,
  } = params;

  const measureDpi = 192;
  const canvas = document.createElement('canvas');
  canvas.width = 40;
  canvas.height = 40;
  const ctx = canvas.getContext('2d');
  const ptToPx = (pt: number) => (pt / 72) * measureDpi;

  const measureWithFont = (fontSpec: string) => {
    return (sample: string): number => {
      if (!ctx) return sample.length * ptToPx(bodyFontPt) * 0.55;
      ctx.font = fontSpec;
      return ctx.measureText(sample).width;
    };
  };

  const headerMeasure = measureWithFont(
    `700 ${ptToPx(headerFontPt)}px ${DISTRICT_PDF_FONT_FAMILY}`
  );
  const boldMeasure = measureWithFont(
    `700 ${ptToPx(bodyFontPt)}px ${DISTRICT_PDF_FONT_FAMILY}`
  );
  const regularMeasure = measureWithFont(
    `500 ${ptToPx(bodyFontPt)}px ${DISTRICT_PDF_FONT_FAMILY}`
  );

  const headerWrapped: string[][] = columns.map((col) => {
    const innerWidthPx = mmToPx(col.widthMm - cellPadXMm * 2, measureDpi);
    return wrapTextToLines(col.header, innerWidthPx, headerMeasure);
  });

  const maxHeaderLines = Math.max(1, ...headerWrapped.map((lines) => lines.length));
  const headerHeightMm = Math.max(
    minHeaderHeightMm,
    maxHeaderLines * headerLineHeightMm + cellPadYMm * 2 + 0.6
  );

  const rows: MeasuredRowLayout[] = rawRows.map((row) => {
    const wrappedCells = columns.map((col, colIdx) => {
      const innerWidthPx = mmToPx(col.widthMm - cellPadXMm * 2, measureDpi);
      const measurer = row.isSummary || col.boldBody ? boldMeasure : regularMeasure;
      return wrapTextToLines(row.cells[colIdx] ?? '-', innerWidthPx, measurer);
    });

    const maxLines = Math.max(1, ...wrappedCells.map((lines) => lines.length));
    const heightMm = Math.max(
      minRowHeightMm,
      maxLines * bodyLineHeightMm + cellPadYMm * 2 + 0.5
    );

    return { wrappedCells, heightMm, isSummary: row.isSummary };
  });

  return {
    headerWrapped,
    headerHeightMm,
    rows,
    bodyFontPt,
    headerFontPt,
    bodyLineHeightMm,
    headerLineHeightMm,
    cellPadXMm,
    cellPadYMm,
  };
}

function getFontVerticalMetricsPx(
  ctx: CanvasRenderingContext2D,
  fontPx: number
): { ascent: number; descent: number } {
  const m = ctx.measureText('केंद्रप्रमुख पुणे श्री');
  const ascent =
    typeof m.actualBoundingBoxAscent === 'number' && m.actualBoundingBoxAscent > 0
      ? m.actualBoundingBoxAscent
      : fontPx * 0.78;
  const descent =
    typeof m.actualBoundingBoxDescent === 'number' && m.actualBoundingBoxDescent > 0
      ? m.actualBoundingBoxDescent
      : fontPx * 0.28;
  return { ascent, descent };
}

function renderCanvasBand(
  widthMm: number,
  heightMm: number,
  dpi: number,
  jpegQuality: number,
  draw: (ctx: CanvasRenderingContext2D, scalePxPerMm: number) => void
): string {
  const pxPerMm = dpi / MM_PER_INCH;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(4, Math.ceil(widthMm * pxPerMm));
  canvas.height = Math.max(4, Math.ceil(heightMm * pxPerMm));
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'alphabetic';
  draw(ctx, pxPerMm);

  return canvas.toDataURL('image/jpeg', jpegQuality);
}

export interface OfficeHybridTablePdfOptions {
  orientation: 'portrait' | 'landscape';
  reportTitle: string;
  leftMeta: string;
  fileName: string;
  columns: readonly OfficePdfColumnSpec[];
  rows: OfficePdfRowData[];
  targetMaxBytes: number;
  safeTargetBytes: number;
  sizeLimitLabel: string;
  bodyFontPt?: number;
  headerFontPt?: number;
  bodyLineHeightMm?: number;
  headerLineHeightMm?: number;
  cellPadXMm?: number;
  cellPadYMm?: number;
  minRowHeightMm?: number;
  minHeaderHeightMm?: number;
  onProgress?: (status: string) => void;
}

async function buildOfficeHybridJsPdfDocument(params: {
  orientation: 'portrait' | 'landscape';
  pageWidthMm: number;
  pageHeightMm: number;
  contentWidthMm: number;
  reportTitle: string;
  leftMeta: string;
  todayStr: string;
  columns: readonly OfficePdfColumnSpec[];
  geometry: MeasuredTableGeometry;
  pages: ReturnType<typeof paginateMeasuredDistrictRows>;
  letterheadImg: HTMLImageElement | null;
  signImg: HTMLImageElement | null;
  letterheadDrawWidthMm: number;
  letterheadHeightMm: number;
  profile: AdaptivePdfQualityProfile;
  onPageProgress?: (pageIdx: number, totalPages: number) => void;
}) {
  const {
    orientation,
    pageWidthMm,
    pageHeightMm,
    contentWidthMm,
    reportTitle,
    leftMeta,
    todayStr,
    columns,
    geometry,
    pages,
    letterheadImg,
    signImg,
    letterheadDrawWidthMm,
    letterheadHeightMm,
    profile,
    onPageProgress,
  } = params;

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const [letterheadAsset, signAsset] = await Promise.all([
    letterheadImg
      ? encodeOptimizedJpegAsset(
          letterheadImg,
          profile.letterheadMaxWidthPx,
          profile.letterheadQuality,
          false
        )
      : Promise.resolve(null),
    signImg
      ? encodeOptimizedJpegAsset(
          signImg,
          profile.signMaxWidthPx,
          profile.signQuality,
          true
        )
      : Promise.resolve(null),
  ]);

  const totalPages = pages.length;
  const dpi = profile.dpi;
  const q = profile.textJpegQuality;
  const ptToPx = (pt: number) => (pt / 72) * dpi;

  for (let pIdx = 0; pIdx < totalPages; pIdx++) {
    if (onPageProgress) {
      onPageProgress(pIdx, totalPages);
    }

    const plan = pages[pIdx];
    if (pIdx > 0) {
      pdf.addPage('a4', orientation);
    }

    let cursorY = PAGE_MARGIN_TOP_MM;

    // 1. HEADER AREA (Page 1: Full-Color Official Letterhead | Page 2+: Compact Institutional Header)
    if (plan.showLetterhead && letterheadAsset?.dataUrl) {
      const lhX = PAGE_MARGIN_X_MM + (contentWidthMm - letterheadDrawWidthMm) / 2;
      pdf.addImage(
        letterheadAsset.dataUrl,
        'JPEG',
        lhX,
        cursorY,
        letterheadDrawWidthMm,
        letterheadHeightMm,
        'letterhead_heding',
        'FAST'
      );
      cursorY += letterheadHeightMm + 1.4;

      pdf.setDrawColor(15, 23, 42);
      pdf.setLineWidth(0.45);
      pdf.line(PAGE_MARGIN_X_MM, cursorY, PAGE_MARGIN_X_MM + contentWidthMm, cursorY);
      cursorY += 2.0;

      const titleBandHeightMm = 15.2;
      const titleBandImg = renderCanvasBand(
        contentWidthMm,
        titleBandHeightMm,
        dpi,
        q,
        (ctx, s) => {
          const titleFontPx = ptToPx(12.2);
          ctx.font = `800 ${titleFontPx}px ${DISTRICT_PDF_FONT_FAMILY}`;
          ctx.fillStyle = '#0f172a';
          ctx.textAlign = 'left';
          const titleMetrics = getFontVerticalMetricsPx(ctx, titleFontPx);
          const titleY = computeVerticalCenteredBaselines({
            cellTop: 0,
            cellHeight: 7.2 * s,
            lineCount: 1,
            lineHeight: 7.2 * s,
            ascent: titleMetrics.ascent,
            descent: titleMetrics.descent,
          })[0];
          ctx.fillText(reportTitle, 0.5 * s, titleY);

          const metaTopPx = 7.8 * s;
          const metaHeightPx = 7.0 * s;
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(0, metaTopPx, contentWidthMm * s, metaHeightPx);

          const metaFontPx = ptToPx(9.2);
          ctx.font = `700 ${metaFontPx}px ${DISTRICT_PDF_FONT_FAMILY}`;
          ctx.fillStyle = '#0f172a';
          const metaMetrics = getFontVerticalMetricsPx(ctx, metaFontPx);
          const metaY = computeVerticalCenteredBaselines({
            cellTop: metaTopPx,
            cellHeight: metaHeightPx,
            lineCount: 1,
            lineHeight: metaHeightPx,
            ascent: metaMetrics.ascent,
            descent: metaMetrics.descent,
          })[0];

          ctx.textAlign = 'left';
          ctx.fillText(leftMeta, 2.4 * s, metaY);

          ctx.textAlign = 'right';
          const pageMeta =
            totalPages > 1
              ? `दिनांक: ${todayStr}   |   पृष्ठ: ${toEnglishDigits(plan.pageNumber)} / ${toEnglishDigits(totalPages)}`
              : `दिनांक: ${todayStr}`;
          ctx.fillText(pageMeta, (contentWidthMm - 2.4) * s, metaY);
        }
      );

      if (titleBandImg) {
        pdf.addImage(
          titleBandImg,
          'JPEG',
          PAGE_MARGIN_X_MM,
          cursorY,
          contentWidthMm,
          titleBandHeightMm,
          undefined,
          'FAST'
        );
      }

      pdf.setDrawColor(148, 163, 184);
      pdf.setLineWidth(0.25);
      pdf.rect(PAGE_MARGIN_X_MM, cursorY + 7.8, contentWidthMm, 7.0, 'S');

      cursorY += titleBandHeightMm + 2.2;
    } else {
      const contHeaderHeightMm = 14.0;
      const contHeaderImg = renderCanvasBand(
        contentWidthMm,
        contHeaderHeightMm,
        dpi,
        q,
        (ctx, s) => {
          const orgFontPx = ptToPx(8.6);
          ctx.font = `600 ${orgFontPx}px ${DISTRICT_PDF_FONT_FAMILY}`;
          ctx.fillStyle = '#475569';
          ctx.textAlign = 'left';
          const orgMetrics = getFontVerticalMetricsPx(ctx, orgFontPx);
          const orgY = computeVerticalCenteredBaselines({
            cellTop: 0.4 * s,
            cellHeight: 5.4 * s,
            lineCount: 1,
            lineHeight: 5.4 * s,
            ascent: orgMetrics.ascent,
            descent: orgMetrics.descent,
          })[0];
          ctx.fillText('महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ', 0.5 * s, orgY);

          const subTitleFontPx = ptToPx(10.8);
          ctx.font = `800 ${subTitleFontPx}px ${DISTRICT_PDF_FONT_FAMILY}`;
          ctx.fillStyle = '#0f172a';
          const subMetrics = getFontVerticalMetricsPx(ctx, subTitleFontPx);
          const subY = computeVerticalCenteredBaselines({
            cellTop: 5.8 * s,
            cellHeight: 6.6 * s,
            lineCount: 1,
            lineHeight: 6.6 * s,
            ascent: subMetrics.ascent,
            descent: subMetrics.descent,
          })[0];
          ctx.fillText(reportTitle, 0.5 * s, subY);

          const metaFontPx = ptToPx(8.8);
          ctx.font = `700 ${metaFontPx}px ${DISTRICT_PDF_FONT_FAMILY}`;
          ctx.fillStyle = '#334155';
          ctx.textAlign = 'right';
          const metaMetrics = getFontVerticalMetricsPx(ctx, metaFontPx);
          const metaY = computeVerticalCenteredBaselines({
            cellTop: 5.8 * s,
            cellHeight: 6.6 * s,
            lineCount: 1,
            lineHeight: 6.6 * s,
            ascent: metaMetrics.ascent,
            descent: metaMetrics.descent,
          })[0];
          ctx.fillText(
            `दिनांक: ${todayStr}   |   पृष्ठ: ${toEnglishDigits(plan.pageNumber)} / ${toEnglishDigits(totalPages)}`,
            (contentWidthMm - 0.5) * s,
            metaY
          );
        }
      );

      if (contHeaderImg) {
        pdf.addImage(
          contHeaderImg,
          'JPEG',
          PAGE_MARGIN_X_MM,
          cursorY,
          contentWidthMm,
          contHeaderHeightMm,
          undefined,
          'FAST'
        );
      }

      pdf.setDrawColor(15, 23, 42);
      pdf.setLineWidth(0.4);
      pdf.line(
        PAGE_MARGIN_X_MM,
        cursorY + contHeaderHeightMm - 0.6,
        PAGE_MARGIN_X_MM + contentWidthMm,
        cursorY + contHeaderHeightMm - 0.6
      );

      cursorY += contHeaderHeightMm + 2.2;
    }

    // 2. TABLE BAND (Canvas 2D Crisp Devanagari Text + Native PDF Vector Grid)
    if (plan.rowIndices.length > 0) {
      const pageRows = plan.rowIndices.map((idx) => geometry.rows[idx]);
      const tableHeightMm =
        geometry.headerHeightMm +
        pageRows.reduce((sum, r) => sum + r.heightMm, 0);

      const tableStartY = cursorY;

      const tableCanvasImg = renderCanvasBand(
        contentWidthMm,
        tableHeightMm,
        dpi,
        q,
        (ctx, s) => {
          const headerFontPx = ptToPx(geometry.headerFontPt);
          const bodyFontPx = ptToPx(geometry.bodyFontPt);
          const padXPx = geometry.cellPadXMm * s;

          // Header background
          ctx.fillStyle = '#eef2f6';
          ctx.fillRect(0, 0, contentWidthMm * s, geometry.headerHeightMm * s);

          ctx.font = `700 ${headerFontPx}px ${DISTRICT_PDF_FONT_FAMILY}`;
          ctx.fillStyle = '#0f172a';
          ctx.textAlign = 'left'; // Strictly Horizontal Left
          const hMetrics = getFontVerticalMetricsPx(ctx, headerFontPx);
          const hLinePx = geometry.headerLineHeightMm * s;

          let colLeftMm = 0;
          columns.forEach((col, colIdx) => {
            const lines = geometry.headerWrapped[colIdx];
            const baselines = computeVerticalCenteredBaselines({
              cellTop: 0,
              cellHeight: geometry.headerHeightMm * s,
              lineCount: lines.length,
              lineHeight: hLinePx,
              ascent: hMetrics.ascent,
              descent: hMetrics.descent,
            });

            const textX = colLeftMm * s + padXPx;
            lines.forEach((line, lineIdx) => {
              ctx.fillText(line, textX, baselines[lineIdx]);
            });
            colLeftMm += col.widthMm;
          });

          // Data rows
          let rowTopMm = geometry.headerHeightMm;
          const bLinePx = geometry.bodyLineHeightMm * s;

          pageRows.forEach((rowLayout, localRowIdx) => {
            const rowHeightPx = rowLayout.heightMm * s;
            const rowTopPx = rowTopMm * s;

            ctx.fillStyle = rowLayout.isSummary
              ? '#e2e8f0'
              : localRowIdx % 2 === 1
                ? '#f8fafc'
                : '#ffffff';
            ctx.fillRect(0, rowTopPx, contentWidthMm * s, rowHeightPx);

            let cellLeftMm = 0;
            columns.forEach((col, colIdx) => {
              const weight = rowLayout.isSummary || col.boldBody ? '700' : '500';
              ctx.font = `${weight} ${bodyFontPx}px ${DISTRICT_PDF_FONT_FAMILY}`;
              ctx.fillStyle = '#0f172a';
              ctx.textAlign = 'left'; // Strictly Horizontal Left

              const bMetrics = getFontVerticalMetricsPx(ctx, bodyFontPx);
              const lines = rowLayout.wrappedCells[colIdx];
              const baselines = computeVerticalCenteredBaselines({
                cellTop: rowTopPx,
                cellHeight: rowHeightPx,
                lineCount: lines.length,
                lineHeight: bLinePx,
                ascent: bMetrics.ascent,
                descent: bMetrics.descent,
              });

              const textX = cellLeftMm * s + padXPx;
              lines.forEach((line, lineIdx) => {
                ctx.fillText(line, textX, baselines[lineIdx]);
              });

              cellLeftMm += col.widthMm;
            });

            rowTopMm += rowLayout.heightMm;
          });
        }
      );

      if (tableCanvasImg) {
        pdf.addImage(
          tableCanvasImg,
          'JPEG',
          PAGE_MARGIN_X_MM,
          tableStartY,
          contentWidthMm,
          tableHeightMm,
          undefined,
          'FAST'
        );
      }

      // Native PDF Vector Borders Drawn ON TOP (Infinite Laser Print DPI)
      let vx = PAGE_MARGIN_X_MM;
      for (let c = 0; c < columns.length - 1; c++) {
        vx += columns[c].widthMm;
        pdf.setDrawColor(100, 116, 139);
        pdf.setLineWidth(0.24);
        pdf.line(vx, tableStartY, vx, tableStartY + geometry.headerHeightMm);
        pdf.setDrawColor(203, 213, 225);
        pdf.setLineWidth(0.2);
        pdf.line(
          vx,
          tableStartY + geometry.headerHeightMm,
          vx,
          tableStartY + tableHeightMm
        );
      }

      pdf.setDrawColor(15, 23, 42);
      pdf.setLineWidth(0.38);
      pdf.line(
        PAGE_MARGIN_X_MM,
        tableStartY + geometry.headerHeightMm,
        PAGE_MARGIN_X_MM + contentWidthMm,
        tableStartY + geometry.headerHeightMm
      );

      let hy = tableStartY + geometry.headerHeightMm;
      for (let r = 0; r < pageRows.length - 1; r++) {
        hy += pageRows[r].heightMm;
        const nextIsSummary = Boolean(pageRows[r + 1]?.isSummary);
        pdf.setDrawColor(nextIsSummary ? 15 : 203, nextIsSummary ? 23 : 213, nextIsSummary ? 42 : 225);
        pdf.setLineWidth(nextIsSummary ? 0.36 : 0.2);
        pdf.line(PAGE_MARGIN_X_MM, hy, PAGE_MARGIN_X_MM + contentWidthMm, hy);
      }

      pdf.setDrawColor(15, 23, 42);
      pdf.setLineWidth(0.45);
      pdf.rect(PAGE_MARGIN_X_MM, tableStartY, contentWidthMm, tableHeightMm, 'S');

      cursorY = tableStartY + tableHeightMm;
    }

    // 3. FINAL PAGE STATE PRESIDENT SIGNATURE BLOCK
    if (plan.showSignature) {
      const signBlockWidthMm = 78;
      const signBlockX = PAGE_MARGIN_X_MM + contentWidthMm - signBlockWidthMm;
      let signCursorY = cursorY + 6.0;

      if (signAsset?.dataUrl) {
        const signH = 13.5;
        const signW = Math.min(46, signH * signAsset.aspectRatio);
        const signX = signBlockX + (signBlockWidthMm - signW) / 2;
        pdf.addImage(
          signAsset.dataUrl,
          'JPEG',
          signX,
          signCursorY,
          signW,
          signH,
          'president_sign',
          'FAST'
        );
        signCursorY += signH + 1.0;
      } else {
        signCursorY += 12.0;
      }

      const signTextHeightMm = 15.0;
      const signTextImg = renderCanvasBand(
        signBlockWidthMm,
        signTextHeightMm,
        dpi,
        q,
        (ctx, s) => {
          const cx = (signBlockWidthMm / 2) * s;
          ctx.textAlign = 'center';

          const nameFontPx = ptToPx(10.2);
          ctx.font = `700 ${nameFontPx}px ${DISTRICT_PDF_FONT_FAMILY}`;
          ctx.fillStyle = '#0f172a';
          const m1 = getFontVerticalMetricsPx(ctx, nameFontPx);
          const y1 = computeVerticalCenteredBaselines({
            cellTop: 0,
            cellHeight: 5.2 * s,
            lineCount: 1,
            lineHeight: 5.2 * s,
            ascent: m1.ascent,
            descent: m1.descent,
          })[0];
          ctx.fillText('( श्री. राजेंद्र शिवाजी खैरनार )', cx, y1);

          const roleFontPx = ptToPx(9.0);
          ctx.font = `700 ${roleFontPx}px ${DISTRICT_PDF_FONT_FAMILY}`;
          ctx.fillStyle = '#334155';
          const m2 = getFontVerticalMetricsPx(ctx, roleFontPx);
          const y2 = computeVerticalCenteredBaselines({
            cellTop: 5.2 * s,
            cellHeight: 4.8 * s,
            lineCount: 1,
            lineHeight: 4.8 * s,
            ascent: m2.ascent,
            descent: m2.descent,
          })[0];
          ctx.fillText('संस्थापक राज्याध्यक्ष', cx, y2);

          const orgFontPx = ptToPx(8.2);
          ctx.font = `600 ${orgFontPx}px ${DISTRICT_PDF_FONT_FAMILY}`;
          ctx.fillStyle = '#475569';
          const m3 = getFontVerticalMetricsPx(ctx, orgFontPx);
          const y3 = computeVerticalCenteredBaselines({
            cellTop: 10.0 * s,
            cellHeight: 4.6 * s,
            lineCount: 1,
            lineHeight: 4.6 * s,
            ascent: m3.ascent,
            descent: m3.descent,
          })[0];
          ctx.fillText('महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ', cx, y3);
        }
      );

      if (signTextImg) {
        pdf.addImage(
          signTextImg,
          'JPEG',
          signBlockX,
          signCursorY,
          signBlockWidthMm,
          signTextHeightMm,
          undefined,
          'FAST'
        );
      }
    }

    // 4. CLEAN OFFICE PAGE FOOTER
    const footerLineY = pageHeightMm - PAGE_MARGIN_BOTTOM_MM - 3.6;
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.2);
    pdf.line(
      PAGE_MARGIN_X_MM,
      footerLineY,
      PAGE_MARGIN_X_MM + contentWidthMm,
      footerLineY
    );

    const footerDpi = Math.min(dpi, 145);
    const footerBandH = 4.6;
    const footerImg = renderCanvasBand(
      contentWidthMm,
      footerBandH,
      footerDpi,
      Math.min(q, 0.7),
      (ctx, s) => {
        const fFontPx = (7.6 / 72) * footerDpi;
        ctx.font = `500 ${fFontPx}px ${DISTRICT_PDF_FONT_FAMILY}`;
        ctx.fillStyle = '#64748b';
        const fm = getFontVerticalMetricsPx(ctx, fFontPx);
        const fy = computeVerticalCenteredBaselines({
          cellTop: 0,
          cellHeight: footerBandH * s,
          lineCount: 1,
          lineHeight: footerBandH * s,
          ascent: fm.ascent,
          descent: fm.descent,
        })[0];

        ctx.textAlign = 'left';
        ctx.fillText(
          'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ — अधिकृत कार्यालयीन प्रत',
          0.3 * s,
          fy
        );

        ctx.textAlign = 'right';
        ctx.fillText(
          `पृष्ठ ${toEnglishDigits(plan.pageNumber)} / ${toEnglishDigits(totalPages)}`,
          (contentWidthMm - 0.3) * s,
          fy
        );
      }
    );

    if (footerImg) {
      pdf.addImage(
        footerImg,
        'JPEG',
        PAGE_MARGIN_X_MM,
        footerLineY + 0.6,
        contentWidthMm,
        footerBandH,
        undefined,
        'FAST'
      );
    }

    // Preserve explicit reference to pageWidthMm for orientation completeness
    void pageWidthMm;
  }

  return pdf;
}

/**
 * Core Unified Office Hybrid PDF Generator used by ALL 6 reports.
 */
export async function generateOfficeHybridTablePdf(
  options: OfficeHybridTablePdfOptions
): Promise<OfficeHybridPdfResult | null> {
  const {
    orientation,
    reportTitle,
    leftMeta,
    fileName,
    columns,
    rows,
    targetMaxBytes,
    safeTargetBytes,
    sizeLimitLabel,
    bodyFontPt = 9.8,
    headerFontPt = 9.6,
    bodyLineHeightMm = 4.9,
    headerLineHeightMm = 4.7,
    cellPadXMm = 2.0,
    cellPadYMm = 2.1,
    minRowHeightMm = 8.8,
    minHeaderHeightMm = 9.8,
    onProgress,
  } = options;

  if (!rows || rows.length === 0) {
    return null;
  }

  if (onProgress) {
    onProgress('अधिकृत लेटरपॅड, फॉन्ट व स्वाक्षरी लोड होत आहे...');
  }

  const [hedingDataUrl, signDataUrl] = await Promise.all([
    resolveImageUrlForPdf('/heding.jpg'),
    resolveImageUrlForPdf('/sign.jpg'),
    ensureDevanagariFontsReady(),
  ]);

  const [letterheadImg, signImg] = await Promise.all([
    hedingDataUrl ? loadHtmlImage(hedingDataUrl).catch(() => null) : Promise.resolve(null),
    signDataUrl ? loadHtmlImage(signDataUrl).catch(() => null) : Promise.resolve(null),
  ]);

  const pageWidthMm = orientation === 'landscape' ? A4_HEIGHT_MM : A4_WIDTH_MM;
  const pageHeightMm = orientation === 'landscape' ? A4_WIDTH_MM : A4_HEIGHT_MM;
  const contentWidthMm = pageWidthMm - PAGE_MARGIN_X_MM * 2;

  // Preserve exact natural letterhead aspect ratio cleanly on both Portrait & Landscape
  let letterheadDrawWidthMm = contentWidthMm;
  let letterheadHeightMm = orientation === 'landscape' ? 32 : 37;
  if (letterheadImg && letterheadImg.naturalWidth > 0 && letterheadImg.naturalHeight > 0) {
    const aspect = letterheadImg.naturalWidth / letterheadImg.naturalHeight;
    if (orientation === 'landscape') {
      // Keep letterhead crisp & centered without eating excessive vertical height on landscape A4
      letterheadHeightMm = 31;
      letterheadDrawWidthMm = Math.min(contentWidthMm, letterheadHeightMm * aspect);
    } else {
      letterheadDrawWidthMm = contentWidthMm;
      letterheadHeightMm = Math.min(41, Math.max(28, contentWidthMm / aspect));
    }
  }

  const geometry = measureTableGeometry({
    columns,
    rawRows: rows,
    bodyFontPt,
    headerFontPt,
    bodyLineHeightMm,
    headerLineHeightMm,
    cellPadXMm,
    cellPadYMm,
    minRowHeightMm,
    minHeaderHeightMm,
  });

  const usableBottomY = pageHeightMm - PAGE_MARGIN_BOTTOM_MM - FOOTER_AREA_MM;
  const page1TableStartY =
    PAGE_MARGIN_TOP_MM +
    (letterheadImg ? letterheadHeightMm + 1.4 + 2.0 + 15.2 + 2.2 : 14.0 + 2.2);
  const contTableStartY = PAGE_MARGIN_TOP_MM + 14.0 + 2.2;

  const firstPageTableMaxMm = Math.max(
    55,
    usableBottomY - page1TableStartY - geometry.headerHeightMm - 1.5
  );
  const continuationPageTableMaxMm = Math.max(
    85,
    usableBottomY - contTableStartY - geometry.headerHeightMm - 1.5
  );
  const signatureReserveMm = 37;

  const pages = paginateMeasuredDistrictRows({
    rowHeightsMm: geometry.rows.map((r) => r.heightMm),
    firstPageTableMaxMm,
    continuationPageTableMaxMm,
    signatureReserveMm,
  });

  const todayStr = getTodayFormattedDate();
  const ladder = getAdaptivePdfQualityLadder(pages.length, targetMaxBytes);

  let finalPdf: Awaited<ReturnType<typeof buildOfficeHybridJsPdfDocument>> | null = null;
  let finalBytes = 0;

  let stepIdx = 0;
  while (stepIdx < ladder.length) {
    const profile = ladder[stepIdx];
    const pdf = await buildOfficeHybridJsPdfDocument({
      orientation,
      pageWidthMm,
      pageHeightMm,
      contentWidthMm,
      reportTitle,
      leftMeta,
      todayStr,
      columns,
      geometry,
      pages,
      letterheadImg,
      signImg,
      letterheadDrawWidthMm,
      letterheadHeightMm,
      profile,
      onPageProgress: (pageIdx, totalPages) => {
        if (!onProgress) return;
        if (stepIdx === 0) {
          onProgress(
            totalPages > 1
              ? `पान ${toEnglishDigits(pageIdx + 1)} / ${toEnglishDigits(totalPages)} तयार होत आहे...`
              : 'अधिकृत A4 PDF तयार होत आहे...'
          );
        } else {
          onProgress(
            `${sizeLimitLabel} आकार अनुकूलन सुरू आहे (पान ${toEnglishDigits(pageIdx + 1)} / ${toEnglishDigits(totalPages)})...`
          );
        }
      },
    });

    const buf = pdf.output('arraybuffer');
    finalPdf = pdf;
    finalBytes = buf.byteLength;

    if (finalBytes <= safeTargetBytes) {
      break;
    }

    // Smart proportional jump if significantly over budget to avoid slow multi-pass retries
    const ratio = finalBytes / safeTargetBytes;
    const jump = ratio > 1.75 ? 2 : 1;
    const nextIdx = Math.min(ladder.length - 1, stepIdx + jump);
    if (nextIdx === stepIdx) break;
    stepIdx = nextIdx;
  }

  if (!finalPdf) {
    return null;
  }

  if (onProgress) {
    onProgress('PDF फाईल डाऊनलोड होत आहे...');
  }

  finalPdf.save(fileName);

  return {
    fileName,
    pageCount: pages.length,
    sizeBytes: finalBytes,
    sizeKb: Math.max(1, Math.round(finalBytes / 1024)),
  };
}

/**
 * 1. District Executive Committee Official A4 PDF (<= 500 KB, Larger 9.8pt Font)
 */
export async function generateDistrictExecutiveOfficePdf(
  district: string,
  list: OfficialMember[],
  onProgress?: (status: string) => void
): Promise<OfficeHybridPdfResult | null> {
  if (!list || list.length === 0) return null;
  const rows = buildDistrictExecutivePdfRows(list);
  const cleanDistrict = district.replace(/\s+/g, '_');

  return generateOfficeHybridTablePdf({
    orientation: 'portrait',
    reportTitle: `अधिकृत जिल्हा कार्यकारिणी यादी — ${district}`,
    leftMeta: `जिल्हा: ${district}   |   एकूण पदाधिकारी: ${toEnglishDigits(list.length)}`,
    fileName: `अधिकृत_जिल्हा_कार्यकारिणी_${cleanDistrict}.pdf`,
    columns: DISTRICT_EXECUTIVE_PDF_COLUMNS,
    rows,
    targetMaxBytes: TARGET_MAX_PDF_BYTES,
    safeTargetBytes: SAFE_TARGET_PDF_BYTES,
    sizeLimitLabel: '५०० KB',
    bodyFontPt: 9.8,
    headerFontPt: 9.6,
    bodyLineHeightMm: 4.9,
    headerLineHeightMm: 4.7,
    cellPadXMm: 2.0,
    cellPadYMm: 2.1,
    minRowHeightMm: 8.8,
    minHeaderHeightMm: 10.0,
    onProgress,
  });
}

/**
 * 2. Organization Status Matrix (34 Districts) Official A4 Landscape PDF (<= 1 MB)
 */
export async function generateOrganizationStatusOfficePdf(
  stats: Array<any>,
  onProgress?: (status: string) => void
): Promise<OfficeHybridPdfResult | null> {
  if (!stats || stats.length === 0) return null;
  const { rows, totalOfficials, totalMembers } = buildOrganizationStatusPdfRows(stats);

  return generateOfficeHybridTablePdf({
    orientation: 'landscape',
    reportTitle: 'संघटना सद्यस्थिती अहवाल (३४ जिल्हे)',
    leftMeta: `एकूण जिल्हे: ${toEnglishDigits(stats.length)}   |   एकूण पदाधिकारी: ${toEnglishDigits(totalOfficials)}   |   एकूण सदस्य: ${toEnglishDigits(totalMembers)}`,
    fileName: `संघटना_सद्यस्थिती_अहवाल_३४_जिल्हे.pdf`,
    columns: ORGANIZATION_STATUS_PDF_COLUMNS,
    rows,
    targetMaxBytes: TARGET_MAX_MULTI_PDF_BYTES,
    safeTargetBytes: SAFE_TARGET_MULTI_PDF_BYTES,
    sizeLimitLabel: '१ MB',
    bodyFontPt: 9.0,
    headerFontPt: 8.6,
    bodyLineHeightMm: 4.5,
    headerLineHeightMm: 4.3,
    cellPadXMm: 1.8,
    cellPadYMm: 1.8,
    minRowHeightMm: 7.8,
    minHeaderHeightMm: 10.2,
    onProgress,
  });
}

/**
 * 3. All District Presidents Official A4 Portrait PDF (<= 1 MB, Larger 9.8pt Font)
 */
export async function generateDistrictPresidentsOfficePdf(
  list: Array<{ district: string; name: string; cadre: string; post: string; mobile: string }>,
  onProgress?: (status: string) => void
): Promise<OfficeHybridPdfResult | null> {
  if (!list || list.length === 0) return null;
  const rows = buildDistrictPresidentsPdfRows(list);

  return generateOfficeHybridTablePdf({
    orientation: 'portrait',
    reportTitle: 'महाराष्ट्र राज्य सर्व जिल्हाध्यक्ष अधिकृत यादी',
    leftMeta: `एकूण जिल्हाध्यक्ष: ${toEnglishDigits(list.length)}`,
    fileName: `महाराष्ट्र_राज्य_सर्व_जिल्हाध्यक्ष_यादी.pdf`,
    columns: DISTRICT_PRESIDENTS_PDF_COLUMNS,
    rows,
    targetMaxBytes: TARGET_MAX_MULTI_PDF_BYTES,
    safeTargetBytes: SAFE_TARGET_MULTI_PDF_BYTES,
    sizeLimitLabel: '१ MB',
    bodyFontPt: 9.8,
    headerFontPt: 9.6,
    bodyLineHeightMm: 4.9,
    headerLineHeightMm: 4.7,
    cellPadXMm: 2.0,
    cellPadYMm: 2.1,
    minRowHeightMm: 8.8,
    minHeaderHeightMm: 10.0,
    onProgress,
  });
}

/**
 * 4. All Taluka Presidents Official A4 Portrait PDF (<= 1 MB, Larger 9.8pt Font)
 */
export async function generateTalukaPresidentsOfficePdf(
  list: Array<{
    district: string;
    taluka?: string;
    name: string;
    cadre: string;
    post: string;
    mobile: string;
  }>,
  onProgress?: (status: string) => void
): Promise<OfficeHybridPdfResult | null> {
  if (!list || list.length === 0) return null;
  const rows = buildTalukaPresidentsPdfRows(list);

  return generateOfficeHybridTablePdf({
    orientation: 'portrait',
    reportTitle: 'महाराष्ट्र राज्य सर्व तालुका अध्यक्ष अधिकृत यादी',
    leftMeta: `एकूण तालुका अध्यक्ष: ${toEnglishDigits(list.length)}`,
    fileName: `महाराष्ट्र_राज्य_सर्व_तालुका_अध्यक्ष_यादी.pdf`,
    columns: TALUKA_PRESIDENTS_PDF_COLUMNS,
    rows,
    targetMaxBytes: TARGET_MAX_MULTI_PDF_BYTES,
    safeTargetBytes: SAFE_TARGET_MULTI_PDF_BYTES,
    sizeLimitLabel: '१ MB',
    bodyFontPt: 9.8,
    headerFontPt: 9.6,
    bodyLineHeightMm: 4.9,
    headerLineHeightMm: 4.7,
    cellPadXMm: 2.0,
    cellPadYMm: 2.1,
    minRowHeightMm: 8.8,
    minHeaderHeightMm: 10.0,
    onProgress,
  });
}

/**
 * 5. Approved Registered Members Official A4 Portrait PDF (<= 1 MB, Handles Large Multi-Page Lists)
 */
export async function generateRegisteredMembersOfficePdf(
  list: MembershipApplication[],
  onProgress?: (status: string) => void
): Promise<OfficeHybridPdfResult | null> {
  if (!list || list.length === 0) return null;
  const { rows, maleCount, femaleCount } = buildRegisteredMembersPdfRows(list);

  return generateOfficeHybridTablePdf({
    orientation: 'portrait',
    reportTitle: 'अधिकृत नोंदणीकृत आजीवन सदस्य यादी',
    leftMeta: `एकूण सदस्य: ${toEnglishDigits(list.length)}   |   पुरुष: ${toEnglishDigits(maleCount)}   |   स्त्री: ${toEnglishDigits(femaleCount)}`,
    fileName: `अधिकृत_नोंदणीकृत_सदस्य_यादी_${new Date().toISOString().split('T')[0]}.pdf`,
    columns: REGISTERED_MEMBERS_PDF_COLUMNS,
    rows,
    targetMaxBytes: TARGET_MAX_MULTI_PDF_BYTES,
    safeTargetBytes: SAFE_TARGET_MULTI_PDF_BYTES,
    sizeLimitLabel: '१ MB',
    bodyFontPt: 9.0,
    headerFontPt: 8.8,
    bodyLineHeightMm: 4.5,
    headerLineHeightMm: 4.4,
    cellPadXMm: 1.6,
    cellPadYMm: 1.85,
    minRowHeightMm: 8.2,
    minHeaderHeightMm: 9.6,
    onProgress,
  });
}

/**
 * 6. Statewide Appointments Master Registry Official A4 Portrait PDF (<= 1 MB)
 */
export async function generateStatewideRegistryOfficePdf(
  officials: OfficialMember[],
  onProgress?: (status: string) => void
): Promise<OfficeHybridPdfResult | null> {
  if (!officials || officials.length === 0) return null;
  const rows = buildStatewideRegistryPdfRows(officials);

  return generateOfficeHybridTablePdf({
    orientation: 'portrait',
    reportTitle: 'राज्यस्तरीय नियुक्त्या व अधिकृत नोंदवही',
    leftMeta: `एकूण नोंदणीकृत पदाधिकारी: ${toEnglishDigits(officials.length)}`,
    fileName: `राज्यस्तरीय_नियुक्ती_नोंदवही.pdf`,
    columns: STATEWIDE_REGISTRY_PDF_COLUMNS,
    rows,
    targetMaxBytes: TARGET_MAX_MULTI_PDF_BYTES,
    safeTargetBytes: SAFE_TARGET_MULTI_PDF_BYTES,
    sizeLimitLabel: '१ MB',
    bodyFontPt: 9.0,
    headerFontPt: 8.8,
    bodyLineHeightMm: 4.5,
    headerLineHeightMm: 4.4,
    cellPadXMm: 1.6,
    cellPadYMm: 1.85,
    minRowHeightMm: 8.2,
    minHeaderHeightMm: 9.6,
    onProgress,
  });
}

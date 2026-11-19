/**
 * Modern Hybrid Vector + Native-Shaped Devanagari A4 PDF Engine
 * for Official District Executive Committee Lists (राज्याध्यक्ष लॉगिन)
 *
 * Architecture:
 * 1. Native PDF Vector Chrome (jsPDF primitives):
 *    - Infinite-DPI razor-sharp outer borders, horizontal row dividers, vertical column separators,
 *      header bottom rule, metadata box border, and page footer hairline.
 * 2. Direct Native Image Embedding:
 *    - Full-color official letterhead (/heding.jpg) embedded natively ONLY on Page 1.
 *    - Clean blue-ink State President signature (/sign.jpg) embedded natively ONLY on Final Page.
 * 3. Browser-Shaped Devanagari Text Layer (Canvas 2D + Noto Sans Devanagari):
 *    - 100% accurate HarfBuzz/DirectWrite/CoreText Marathi conjuncts & vowel marks (जोडाक्षरे/वेलांटी/उकार).
 *    - Strictly Vertical-Center + Horizontal-Left alignment in EVERY header & data cell.
 * 4. Automatic <= 500 KB Adaptive Byte-Budget Optimizer:
 *    - Measures exact generated PDF bytes (`arraybuffer.byteLength`) and auto-tunes encoding
 *      so every district PDF (1 page or multi-page) lands cleanly <= 500 KB while staying print-sharp.
 */

import { OfficialMember } from '../data/rkMaharashtraData';
import { resolveImageUrlForPdf } from '../utils/cloudinary';
import { toEnglishDigits } from '../utils/formatters';
import {
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  PAGE_MARGIN_X_MM,
  PAGE_MARGIN_TOP_MM,
  PAGE_MARGIN_BOTTOM_MM,
  CONTENT_WIDTH_MM,
  FOOTER_AREA_MM,
  DISTRICT_PDF_FONT_FAMILY,
  DISTRICT_EXECUTIVE_PDF_COLUMNS,
  SAFE_TARGET_PDF_BYTES,
  AdaptivePdfQualityProfile,
  buildDistrictExecutivePdfRows,
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
  aspectRatio: number; // width / height
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

  // For signature: remove light scanner gray tint so it blends invisibly onto pure white A4 paper
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
          // Slightly deepen blue ink for crisp print contrast
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

function measureTableGeometry(
  rawRows: ReturnType<typeof buildDistrictExecutivePdfRows>
): MeasuredTableGeometry {
  const measureDpi = 192;
  const canvas = document.createElement('canvas');
  canvas.width = 40;
  canvas.height = 40;
  const ctx = canvas.getContext('2d');

  const bodyFontPt = 8.4;
  const headerFontPt = 8.5;
  const bodyLineHeightMm = 4.25;
  const headerLineHeightMm = 4.25;
  const cellPadXMm = 2.0;
  const cellPadYMm = 1.95;

  const ptToPx = (pt: number) => (pt / 72) * measureDpi;

  const measureWithFont = (fontSpec: string) => {
    return (sample: string): number => {
      if (!ctx) return sample.length * ptToPx(bodyFontPt) * 0.55;
      ctx.font = fontSpec;
      return ctx.measureText(sample).width;
    };
  };

  const headerFontSpec = `700 ${ptToPx(headerFontPt)}px ${DISTRICT_PDF_FONT_FAMILY}`;
  const headerMeasure = measureWithFont(headerFontSpec);

  const headerWrapped: string[][] = DISTRICT_EXECUTIVE_PDF_COLUMNS.map((col) => {
    const innerWidthPx = mmToPx(col.widthMm - cellPadXMm * 2, measureDpi);
    return wrapTextToLines(col.header, innerWidthPx, headerMeasure);
  });

  const maxHeaderLines = Math.max(1, ...headerWrapped.map((lines) => lines.length));
  const headerHeightMm = Math.max(
    8.8,
    maxHeaderLines * headerLineHeightMm + cellPadYMm * 2 + 0.6
  );

  const boldBodyFontSpec = `700 ${ptToPx(bodyFontPt)}px ${DISTRICT_PDF_FONT_FAMILY}`;
  const regularBodyFontSpec = `500 ${ptToPx(bodyFontPt)}px ${DISTRICT_PDF_FONT_FAMILY}`;
  const boldMeasure = measureWithFont(boldBodyFontSpec);
  const regularMeasure = measureWithFont(regularBodyFontSpec);

  const rows: MeasuredRowLayout[] = rawRows.map((row) => {
    const wrappedCells = DISTRICT_EXECUTIVE_PDF_COLUMNS.map((col, colIdx) => {
      const innerWidthPx = mmToPx(col.widthMm - cellPadXMm * 2, measureDpi);
      const measurer = col.boldBody ? boldMeasure : regularMeasure;
      return wrapTextToLines(row.cells[colIdx], innerWidthPx, measurer);
    });

    const maxLines = Math.max(1, ...wrappedCells.map((lines) => lines.length));
    const heightMm = Math.max(
      7.6,
      maxLines * bodyLineHeightMm + cellPadYMm * 2 + 0.4
    );

    return { wrappedCells, heightMm };
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

/**
 * Measures reliable Devanagari ascent/descent metrics in pixels for true visual vertical centering.
 */
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

/**
 * Renders a crisp band of Devanagari text onto a pure-white/tinted Canvas 2D and returns a JPEG data URL.
 */
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

/**
 * Builds the complete jsPDF document for a given adaptive quality profile.
 */
async function buildDistrictExecutiveJsPdfDocument(params: {
  district: string;
  totalOfficials: number;
  todayStr: string;
  geometry: MeasuredTableGeometry;
  pages: ReturnType<typeof paginateMeasuredDistrictRows>;
  letterheadImg: HTMLImageElement | null;
  signImg: HTMLImageElement | null;
  letterheadHeightMm: number;
  profile: AdaptivePdfQualityProfile;
  onPageProgress?: (pageIdx: number, totalPages: number) => void;
}) {
  const {
    district,
    totalOfficials,
    todayStr,
    geometry,
    pages,
    letterheadImg,
    signImg,
    letterheadHeightMm,
    profile,
    onPageProgress,
  } = params;

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  // Pre-encode letterhead & signature ONCE at the current quality profile
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
      pdf.addPage('a4', 'portrait');
    }

    let cursorY = PAGE_MARGIN_TOP_MM;

    // -----------------------------------------------------------------------
    // 1. HEADER AREA (Page 1: Full-Color Letterhead | Page 2+: Compact Title)
    // -----------------------------------------------------------------------
    if (plan.showLetterhead && letterheadAsset?.dataUrl) {
      pdf.addImage(
        letterheadAsset.dataUrl,
        'JPEG',
        PAGE_MARGIN_X_MM,
        cursorY,
        CONTENT_WIDTH_MM,
        letterheadHeightMm,
        'letterhead_heding',
        'FAST'
      );
      cursorY += letterheadHeightMm + 1.4;

      // Crisp native vector rule beneath letterhead
      pdf.setDrawColor(15, 23, 42);
      pdf.setLineWidth(0.45);
      pdf.line(PAGE_MARGIN_X_MM, cursorY, PAGE_MARGIN_X_MM + CONTENT_WIDTH_MM, cursorY);
      cursorY += 2.2;

      // Report Title + Metadata Band (Canvas 2D crisp Devanagari + Vector frame)
      const titleBandHeightMm = 14.5;
      const titleBandImg = renderCanvasBand(
        CONTENT_WIDTH_MM,
        titleBandHeightMm,
        dpi,
        q,
        (ctx, s) => {
          // Row 1: Report Title (Vertical Center + Horizontal Left)
          const titleFontPx = ptToPx(11.5);
          ctx.font = `800 ${titleFontPx}px ${DISTRICT_PDF_FONT_FAMILY}`;
          ctx.fillStyle = '#0f172a';
          ctx.textAlign = 'left';
          const titleMetrics = getFontVerticalMetricsPx(ctx, titleFontPx);
          const titleY = computeVerticalCenteredBaselines({
            cellTop: 0,
            cellHeight: 6.8 * s,
            lineCount: 1,
            lineHeight: 6.8 * s,
            ascent: titleMetrics.ascent,
            descent: titleMetrics.descent,
          })[0];
          ctx.fillText(`अधिकृत जिल्हा कार्यकारिणी यादी — ${district}`, 0.5 * s, titleY);

          // Row 2: Clean Light-Gray Office Metadata Strip
          const metaTopPx = 7.4 * s;
          const metaHeightPx = 6.8 * s;
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(0, metaTopPx, CONTENT_WIDTH_MM * s, metaHeightPx);

          const metaFontPx = ptToPx(8.6);
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
          ctx.fillText(
            `जिल्हा: ${district}   |   एकूण पदाधिकारी: ${toEnglishDigits(totalOfficials)}`,
            2.4 * s,
            metaY
          );

          ctx.textAlign = 'right';
          const pageMeta =
            totalPages > 1
              ? `दिनांक: ${todayStr}   |   पृष्ठ: ${toEnglishDigits(plan.pageNumber)} / ${toEnglishDigits(totalPages)}`
              : `दिनांक: ${todayStr}`;
          ctx.fillText(pageMeta, (CONTENT_WIDTH_MM - 2.4) * s, metaY);
        }
      );

      if (titleBandImg) {
        pdf.addImage(
          titleBandImg,
          'JPEG',
          PAGE_MARGIN_X_MM,
          cursorY,
          CONTENT_WIDTH_MM,
          titleBandHeightMm,
          undefined,
          'FAST'
        );
      }

      // Native PDF Vector border around metadata strip
      pdf.setDrawColor(148, 163, 184);
      pdf.setLineWidth(0.25);
      pdf.rect(PAGE_MARGIN_X_MM, cursorY + 7.4, CONTENT_WIDTH_MM, 6.8, 'S');

      cursorY += titleBandHeightMm + 2.2;
    } else {
      // Continuation Pages (Page 2+): Compact Institutional Header (NO repeated letterhead)
      const contHeaderHeightMm = 13.5;
      const contHeaderImg = renderCanvasBand(
        CONTENT_WIDTH_MM,
        contHeaderHeightMm,
        dpi,
        q,
        (ctx, s) => {
          const orgFontPx = ptToPx(8.2);
          ctx.font = `600 ${orgFontPx}px ${DISTRICT_PDF_FONT_FAMILY}`;
          ctx.fillStyle = '#475569';
          ctx.textAlign = 'left';
          const orgMetrics = getFontVerticalMetricsPx(ctx, orgFontPx);
          const orgY = computeVerticalCenteredBaselines({
            cellTop: 0.4 * s,
            cellHeight: 5.2 * s,
            lineCount: 1,
            lineHeight: 5.2 * s,
            ascent: orgMetrics.ascent,
            descent: orgMetrics.descent,
          })[0];
          ctx.fillText('महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ', 0.5 * s, orgY);

          const subTitleFontPx = ptToPx(10.2);
          ctx.font = `800 ${subTitleFontPx}px ${DISTRICT_PDF_FONT_FAMILY}`;
          ctx.fillStyle = '#0f172a';
          const subMetrics = getFontVerticalMetricsPx(ctx, subTitleFontPx);
          const subY = computeVerticalCenteredBaselines({
            cellTop: 5.6 * s,
            cellHeight: 6.4 * s,
            lineCount: 1,
            lineHeight: 6.4 * s,
            ascent: subMetrics.ascent,
            descent: subMetrics.descent,
          })[0];
          ctx.fillText(`अधिकृत जिल्हा कार्यकारिणी यादी — ${district}`, 0.5 * s, subY);

          // Right side date & page indicator
          const metaFontPx = ptToPx(8.3);
          ctx.font = `700 ${metaFontPx}px ${DISTRICT_PDF_FONT_FAMILY}`;
          ctx.fillStyle = '#334155';
          ctx.textAlign = 'right';
          const metaMetrics = getFontVerticalMetricsPx(ctx, metaFontPx);
          const metaY = computeVerticalCenteredBaselines({
            cellTop: 5.6 * s,
            cellHeight: 6.4 * s,
            lineCount: 1,
            lineHeight: 6.4 * s,
            ascent: metaMetrics.ascent,
            descent: metaMetrics.descent,
          })[0];
          ctx.fillText(
            `दिनांक: ${todayStr}   |   पृष्ठ: ${toEnglishDigits(plan.pageNumber)} / ${toEnglishDigits(totalPages)}`,
            (CONTENT_WIDTH_MM - 0.5) * s,
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
          CONTENT_WIDTH_MM,
          contHeaderHeightMm,
          undefined,
          'FAST'
        );
      }

      // Native PDF vector divider rule
      pdf.setDrawColor(15, 23, 42);
      pdf.setLineWidth(0.4);
      pdf.line(
        PAGE_MARGIN_X_MM,
        cursorY + contHeaderHeightMm - 0.6,
        PAGE_MARGIN_X_MM + CONTENT_WIDTH_MM,
        cursorY + contHeaderHeightMm - 0.6
      );

      cursorY += contHeaderHeightMm + 2.2;
    }

    // -----------------------------------------------------------------------
    // 2. TABLE BAND (Canvas 2D Crisp Devanagari Text + Native PDF Vector Grid)
    // -----------------------------------------------------------------------
    if (plan.rowIndices.length > 0) {
      const pageRows = plan.rowIndices.map((idx) => geometry.rows[idx]);
      const tableHeightMm =
        geometry.headerHeightMm +
        pageRows.reduce((sum, r) => sum + r.heightMm, 0);

      const tableStartY = cursorY;

      // Render table backgrounds + ALL Devanagari text (strictly Vertical Center + Horizontal Left)
      const tableCanvasImg = renderCanvasBand(
        CONTENT_WIDTH_MM,
        tableHeightMm,
        dpi,
        q,
        (ctx, s) => {
          const headerFontPx = ptToPx(geometry.headerFontPt);
          const bodyFontPx = ptToPx(geometry.bodyFontPt);
          const padXPx = geometry.cellPadXMm * s;

          // --- Table Header Background & Text ---
          ctx.fillStyle = '#eef2f6';
          ctx.fillRect(0, 0, CONTENT_WIDTH_MM * s, geometry.headerHeightMm * s);

          ctx.font = `700 ${headerFontPx}px ${DISTRICT_PDF_FONT_FAMILY}`;
          ctx.fillStyle = '#0f172a';
          ctx.textAlign = 'left';
          const hMetrics = getFontVerticalMetricsPx(ctx, headerFontPx);
          const hLinePx = geometry.headerLineHeightMm * s;

          let colLeftMm = 0;
          DISTRICT_EXECUTIVE_PDF_COLUMNS.forEach((col, colIdx) => {
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

          // --- Table Data Rows ---
          let rowTopMm = geometry.headerHeightMm;
          const bLinePx = geometry.bodyLineHeightMm * s;

          pageRows.forEach((rowLayout, localRowIdx) => {
            const rowHeightPx = rowLayout.heightMm * s;
            const rowTopPx = rowTopMm * s;

            // Subtle office alternating row tint
            ctx.fillStyle = localRowIdx % 2 === 1 ? '#f8fafc' : '#ffffff';
            ctx.fillRect(0, rowTopPx, CONTENT_WIDTH_MM * s, rowHeightPx);

            let cellLeftMm = 0;
            DISTRICT_EXECUTIVE_PDF_COLUMNS.forEach((col, colIdx) => {
              const weight = col.boldBody ? '700' : '500';
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
          CONTENT_WIDTH_MM,
          tableHeightMm,
          undefined,
          'FAST'
        );
      }

      // --- Native PDF Vector Borders Drawn ON TOP (Infinite Laser Print DPI) ---
      // Vertical column dividers
      let vx = PAGE_MARGIN_X_MM;
      for (let c = 0; c < DISTRICT_EXECUTIVE_PDF_COLUMNS.length - 1; c++) {
        vx += DISTRICT_EXECUTIVE_PDF_COLUMNS[c].widthMm;
        // Header vertical divider (slightly darker)
        pdf.setDrawColor(100, 116, 139);
        pdf.setLineWidth(0.24);
        pdf.line(vx, tableStartY, vx, tableStartY + geometry.headerHeightMm);
        // Body vertical divider
        pdf.setDrawColor(203, 213, 225);
        pdf.setLineWidth(0.2);
        pdf.line(
          vx,
          tableStartY + geometry.headerHeightMm,
          vx,
          tableStartY + tableHeightMm
        );
      }

      // Header bottom bold rule
      pdf.setDrawColor(15, 23, 42);
      pdf.setLineWidth(0.38);
      pdf.line(
        PAGE_MARGIN_X_MM,
        tableStartY + geometry.headerHeightMm,
        PAGE_MARGIN_X_MM + CONTENT_WIDTH_MM,
        tableStartY + geometry.headerHeightMm
      );

      // Horizontal body row dividers
      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.2);
      let hy = tableStartY + geometry.headerHeightMm;
      for (let r = 0; r < pageRows.length - 1; r++) {
        hy += pageRows[r].heightMm;
        pdf.line(PAGE_MARGIN_X_MM, hy, PAGE_MARGIN_X_MM + CONTENT_WIDTH_MM, hy);
      }

      // Crisp Dark Outer Table Frame
      pdf.setDrawColor(15, 23, 42);
      pdf.setLineWidth(0.45);
      pdf.rect(PAGE_MARGIN_X_MM, tableStartY, CONTENT_WIDTH_MM, tableHeightMm, 'S');

      cursorY = tableStartY + tableHeightMm;
    }

    // -----------------------------------------------------------------------
    // 3. FINAL PAGE STATE PRESIDENT SIGNATURE BLOCK (With Full Name & Title)
    // -----------------------------------------------------------------------
    if (plan.showSignature) {
      const signBlockWidthMm = 76;
      const signBlockX = PAGE_MARGIN_X_MM + CONTENT_WIDTH_MM - signBlockWidthMm;
      let signCursorY = cursorY + 6.5;

      // Native blue-ink signature image (centered inside right-aligned signature block)
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

      // Signature Name & Designation (Canvas 2D crisp Marathi text)
      const signTextHeightMm = 14.5;
      const signTextImg = renderCanvasBand(
        signBlockWidthMm,
        signTextHeightMm,
        dpi,
        q,
        (ctx, s) => {
          const cx = (signBlockWidthMm / 2) * s;
          ctx.textAlign = 'center';

          const nameFontPx = ptToPx(9.8);
          ctx.font = `700 ${nameFontPx}px ${DISTRICT_PDF_FONT_FAMILY}`;
          ctx.fillStyle = '#0f172a';
          const m1 = getFontVerticalMetricsPx(ctx, nameFontPx);
          const y1 = computeVerticalCenteredBaselines({
            cellTop: 0,
            cellHeight: 5.0 * s,
            lineCount: 1,
            lineHeight: 5.0 * s,
            ascent: m1.ascent,
            descent: m1.descent,
          })[0];
          ctx.fillText('( श्री. राजेंद्र शिवाजी खैरनार )', cx, y1);

          const roleFontPx = ptToPx(8.6);
          ctx.font = `700 ${roleFontPx}px ${DISTRICT_PDF_FONT_FAMILY}`;
          ctx.fillStyle = '#334155';
          const m2 = getFontVerticalMetricsPx(ctx, roleFontPx);
          const y2 = computeVerticalCenteredBaselines({
            cellTop: 5.0 * s,
            cellHeight: 4.5 * s,
            lineCount: 1,
            lineHeight: 4.5 * s,
            ascent: m2.ascent,
            descent: m2.descent,
          })[0];
          ctx.fillText('संस्थापक राज्याध्यक्ष', cx, y2);

          const orgFontPx = ptToPx(7.8);
          ctx.font = `600 ${orgFontPx}px ${DISTRICT_PDF_FONT_FAMILY}`;
          ctx.fillStyle = '#475569';
          const m3 = getFontVerticalMetricsPx(ctx, orgFontPx);
          const y3 = computeVerticalCenteredBaselines({
            cellTop: 9.5 * s,
            cellHeight: 4.5 * s,
            lineCount: 1,
            lineHeight: 4.5 * s,
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

    // -----------------------------------------------------------------------
    // 4. CLEAN OFFICE PAGE FOOTER (Every Page)
    // -----------------------------------------------------------------------
    const footerLineY = A4_HEIGHT_MM - PAGE_MARGIN_BOTTOM_MM - 3.6;
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.2);
    pdf.line(
      PAGE_MARGIN_X_MM,
      footerLineY,
      PAGE_MARGIN_X_MM + CONTENT_WIDTH_MM,
      footerLineY
    );

    const footerBandH = 4.6;
    const footerImg = renderCanvasBand(
      CONTENT_WIDTH_MM,
      footerBandH,
      Math.min(dpi, 155),
      Math.min(q, 0.72),
      (ctx, s) => {
        const fFontPx = (7.4 / 72) * Math.min(dpi, 155);
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
          (CONTENT_WIDTH_MM - 0.3) * s,
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
        CONTENT_WIDTH_MM,
        footerBandH,
        undefined,
        'FAST'
      );
    }
  }

  return pdf;
}

/**
 * Generates and downloads the Official Office-Grade District Executive Committee A4 PDF.
 * - Page 1: Official full-color letterhead (/heding.jpg) + title + meta + 6-column table
 * - Page 2+: Compact institutional header + repeated column headers + remaining rows
 * - Final page: State President signature (/sign.jpg) with name & designation
 * - Strict Vertical-Center + Horizontal-Left alignment across ALL table cells
 * - Automatically stays <= 500 KB via adaptive byte-budget optimization
 */
export async function generateDistrictExecutiveOfficePdf(
  district: string,
  list: OfficialMember[],
  onProgress?: (status: string) => void
): Promise<DistrictExecutivePdfResult | null> {
  if (!list || list.length === 0) {
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

  // Compute exact letterhead height on A4 width (capped cleanly so Page 1 holds ample rows)
  let letterheadHeightMm = 36;
  if (letterheadImg && letterheadImg.naturalWidth > 0 && letterheadImg.naturalHeight > 0) {
    const aspect = letterheadImg.naturalWidth / letterheadImg.naturalHeight;
    letterheadHeightMm = Math.min(41, Math.max(28, CONTENT_WIDTH_MM / aspect));
  }

  const rawRows = buildDistrictExecutivePdfRows(list);
  const geometry = measureTableGeometry(rawRows);

  // Compute exact vertical space budgets (in mm)
  const usableBottomY = A4_HEIGHT_MM - PAGE_MARGIN_BOTTOM_MM - FOOTER_AREA_MM;
  const page1TableStartY =
    PAGE_MARGIN_TOP_MM +
    (letterheadImg ? letterheadHeightMm + 1.4 + 2.2 + 14.5 + 2.2 : 13.5 + 2.2);
  const contTableStartY = PAGE_MARGIN_TOP_MM + 13.5 + 2.2;

  const firstPageTableMaxMm = Math.max(
    70,
    usableBottomY - page1TableStartY - geometry.headerHeightMm - 1.5
  );
  const continuationPageTableMaxMm = Math.max(
    110,
    usableBottomY - contTableStartY - geometry.headerHeightMm - 1.5
  );
  const signatureReserveMm = 37; // 6.5mm gap + 13.5mm sign + 1mm + 14.5mm text + 1.5mm buffer

  const pages = paginateMeasuredDistrictRows({
    rowHeightsMm: geometry.rows.map((r) => r.heightMm),
    firstPageTableMaxMm,
    continuationPageTableMaxMm,
    signatureReserveMm,
  });

  const todayStr = getTodayFormattedDate();
  const ladder = getAdaptivePdfQualityLadder(pages.length);

  let finalPdf: Awaited<ReturnType<typeof buildDistrictExecutiveJsPdfDocument>> | null = null;
  let finalBytes = 0;

  for (let stepIdx = 0; stepIdx < ladder.length; stepIdx++) {
    const profile = ladder[stepIdx];
    const pdf = await buildDistrictExecutiveJsPdfDocument({
      district,
      totalOfficials: list.length,
      todayStr,
      geometry,
      pages,
      letterheadImg,
      signImg,
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
            `५०० KB आकार अनुकूलन सुरू आहे (पान ${toEnglishDigits(pageIdx + 1)} / ${toEnglishDigits(totalPages)})...`
          );
        }
      },
    });

    const buf = pdf.output('arraybuffer');
    finalPdf = pdf;
    finalBytes = buf.byteLength;

    if (finalBytes <= SAFE_TARGET_PDF_BYTES) {
      break;
    }
  }

  if (!finalPdf) {
    return null;
  }

  const cleanDistrict = district.replace(/\s+/g, '_');
  const fileName = `अधिकृत_जिल्हा_कार्यकारिणी_${cleanDistrict}.pdf`;

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

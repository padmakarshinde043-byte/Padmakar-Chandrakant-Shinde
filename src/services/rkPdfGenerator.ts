/**
 * Premium High-Definition (1-2 MB, 300 DPI Equivalent) PDF Generation Engine
 * 
 * Key Architecture & Fixes:
 * 1. ZERO-STRIKETHROUGH FLEX TABLE:
 *    Replaced HTML <table> with Flexbox rows (display: flex; align-items: stretch).
 *    This completely eliminates the notorious html2canvas `border-collapse` bug where row borders
 *    sliced through multi-line Devanagari text. Row borders are drawn on the row container,
 *    guaranteed to stay strictly BELOW all cell content.
 * 2. PERFECT HORIZONTAL & VERTICAL CENTERING:
 *    Cells use `display: flex; align-items: center; justify-content: center; text-align: center;`
 *    ensuring text never sticks to bottom border lines.
 * 3. ADAPTIVE PAGE DISTRIBUTION (NO VACANT HALF-PAGES):
 *    - Up to 16 members: 1 complete page with letterhead and signature.
 *    - 17 to 34 members (e.g. Gadchiroli 24 members): Page 1 takes 18 rows (filling ~85% of A4),
 *      and Page 2 takes the remaining 6 rows + signature block with zero cutoff.
 * 4. ULTRA-CRISP HIGH DEFINITION (1-2 MB):
 *    Scale 1.80, JPEG Quality 0.90-0.92 provides crisp, laser-sharp typography as requested.
 * 5. SCROLL-INDEPENDENT CAPTURE:
 *    Explicit scrollX: 0, scrollY: 0, x: 0, y: 0 ensures header banner and signatures are never cut off.
 * 6. ZERO ADDITIONAL FIREBASE CALLS & REAL-TIME PROGRESS:
 *    Uses in-memory loaded data only. Reports live page-by-page progress callback.
 */

import type { jsPDF as JsPdfType } from 'jspdf';
import QRCode from 'qrcode';
import { OfficialMember, formatAppointedPostWithTaluka } from '../data/rkMaharashtraData';
import { ensureMontserratFontLoaded } from '../utils/imageOptimize';

async function loadPdfEngines() {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  return { jsPDF, html2canvas };
}
import {
  MembershipApplication,
  formatSequentialMemberNumber,
  normalizeOfficialCadre,
  normalizeCadreInText,
} from '../data/mahasanghData';
import { toEnglishDigits, formatDateWithEnglishDigits } from '../utils/formatters';
import { resolveImageUrlForPdf } from '../utils/cloudinary';
import type { OfficialIdCardData } from '../utils/officialIdCardMatcher';
import {
  A4_PX_WIDTH,
  A4_PX_HEIGHT,
  A4_MM_WIDTH,
  A4_MM_HEIGHT,
  REPORT_FONT_FAMILY,
  ReportColumn,
  buildReportPageHeaderHtml,
  buildTableHeaderHtml,
  buildTableRowHtml,
  buildSignatureBlockHtml,
  buildSingleTablePageHtml,
  buildSingleAppointmentLetterHtml,
  packMeasuredRowsIntoPages,
} from '../utils/pdfReportLayout';
import {
  generateDistrictExecutiveOfficePdf,
  generateOrganizationStatusOfficePdf,
  generateDistrictPresidentsOfficePdf,
  generateTalukaPresidentsOfficePdf,
  generateRegisteredMembersOfficePdf,
  generateStatewideRegistryOfficePdf,
  DistrictExecutivePdfResult,
  OfficeHybridPdfResult,
} from './districtExecutivePdfEngine';

export {
  generateOrganizationStatusOfficePdf,
  generateDistrictPresidentsOfficePdf,
  generateTalukaPresidentsOfficePdf,
  generateRegisteredMembersOfficePdf,
  generateStatewideRegistryOfficePdf,
};
export type { DistrictExecutivePdfResult, OfficeHybridPdfResult };

let cachedHedingBase64: string | null = null;
let cachedSignBase64: string | null = null;
let cachedLogoBase64: string | null = null;

export async function getHedingDataUrl(): Promise<string> {
  if (cachedHedingBase64) return cachedHedingBase64;
  const resolved = await resolveImageUrlForPdf('/heding.jpg');
  if (resolved) cachedHedingBase64 = resolved;
  return resolved;
}

export async function getSignDataUrl(): Promise<string> {
  if (cachedSignBase64) return cachedSignBase64;
  const resolved = await resolveImageUrlForPdf('/sign.jpg');
  if (resolved) cachedSignBase64 = resolved;
  return resolved;
}

export async function getLogoDataUrl(): Promise<string> {
  if (cachedLogoBase64) return cachedLogoBase64;
  const resolved = await resolveImageUrlForPdf('/logo.png');
  if (resolved) cachedLogoBase64 = resolved;
  return resolved;
}

const cachedQrByValue = new Map<string, string>();
export async function getQrCodeDataUrl(targetUrl = 'https://mahasangh.in'): Promise<string> {
  const existing = cachedQrByValue.get(targetUrl);
  if (existing) return existing;
  try {
    const dataUrl = await QRCode.toDataURL(targetUrl, {
      width: 600,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
    cachedQrByValue.set(targetUrl, dataUrl);
    return dataUrl;
  } catch (err) {
    console.warn('Local QR generation error:', err);
    return '';
  }
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

function applyUnsharpSharpen(canvas: HTMLCanvasElement, amount = 0.28): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  if (width < 4 || height < 4) return;

  const srcData = ctx.getImageData(0, 0, width, height);
  const dstData = ctx.createImageData(width, height);
  const s = srcData.data;
  const d = dstData.data;

  // Copy boundary & alpha first
  d.set(s);

  const centerWeight = 1 + 4 * amount;
  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = (rowOffset + x) * 4;
      if (s[idx + 3] < 20) continue; // preserve clean outer alpha edge

      const top = idx - width * 4;
      const bot = idx + width * 4;
      const left = idx - 4;
      const right = idx + 4;

      for (let c = 0; c < 3; c++) {
        const val =
          s[idx + c] * centerWeight -
          (s[top + c] + s[bot + c] + s[left + c] + s[right + c]) * amount;
        d[idx + c] = val < 0 ? 0 : val > 255 ? 255 : Math.round(val);
      }
    }
  }
  ctx.putImageData(dstData, 0, 0);
}

let cachedSharpLogoDataUrl: string | null = null;
/**
 * Crops the slight white outer margin of /logo.png into a crisp circular emblem,
 * performs multi-step high-quality downscaling + gentle edge sharpening so small
 * Marathi letters inside the emblem print razor-sharp with zero blur.
 */
export async function getSharpLogoDataUrl(targetSize = 560): Promise<string> {
  if (cachedSharpLogoDataUrl) return cachedSharpLogoDataUrl;
  try {
    const rawUrl = await getLogoDataUrl();
    const img = await loadHtmlImage(rawUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return rawUrl;

    // /logo.png has ~2.2% outer white padding around the circular gold emblem
    const cropRatio = 0.022;
    const sx = w * cropRatio;
    const sy = h * cropRatio;
    const sw = w * (1 - cropRatio * 2);
    const sh = h * (1 - cropRatio * 2);

    // Multi-step high-quality downscaling avoids single-pass browser blur
    const midSize = Math.max(targetSize, Math.round(Math.min(sw, sh) * 0.6));
    const midCanvas = document.createElement('canvas');
    midCanvas.width = midSize;
    midCanvas.height = midSize;
    const midCtx = midCanvas.getContext('2d');
    if (midCtx) {
      midCtx.imageSmoothingEnabled = true;
      midCtx.imageSmoothingQuality = 'high';
      midCtx.drawImage(img, sx, sy, sw, sh, 0, 0, midSize, midSize);
    }

    const outCanvas = document.createElement('canvas');
    outCanvas.width = targetSize;
    outCanvas.height = targetSize;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return rawUrl;

    outCtx.fillStyle = '#ffffff';
    outCtx.fillRect(0, 0, targetSize, targetSize);
    outCtx.save();
    outCtx.beginPath();
    outCtx.arc(targetSize / 2, targetSize / 2, targetSize / 2, 0, Math.PI * 2);
    outCtx.clip();
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    outCtx.drawImage(midCanvas, 0, 0, midSize, midSize, 0, 0, targetSize, targetSize);
    outCtx.restore();

    applyUnsharpSharpen(outCanvas, 0.3);
    cachedSharpLogoDataUrl = outCanvas.toDataURL('image/png');
    return cachedSharpLogoDataUrl;
  } catch {
    return getLogoDataUrl();
  }
}

let cachedTransparentSignDataUrl: string | null = null;
/**
 * Converts /sign.jpg (blue ink on white background) into a crisp, transparent-background
 * PNG so html2canvas never renders an opaque white box over the footer swoosh.
 */
async function getTransparentSignDataUrl(): Promise<string> {
  if (cachedTransparentSignDataUrl) return cachedTransparentSignDataUrl;
  try {
    const rawUrl = await getSignDataUrl();
    const img = await loadHtmlImage(rawUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return rawUrl;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return rawUrl;

    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const px = imageData.data;

    for (let i = 0; i < px.length; i += 4) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      if (lum >= 232) {
        px[i + 3] = 0;
      } else if (lum > 175) {
        const t = (232 - lum) / (232 - 175);
        px[i + 3] = Math.round(t * 255);
        // Deepen ink color slightly for crisp print
        px[i] = Math.max(8, Math.round(r * 0.72));
        px[i + 1] = Math.max(24, Math.round(g * 0.76));
        px[i + 2] = Math.min(200, Math.round(b * 0.96));
      } else {
        px[i] = Math.max(6, Math.round(r * 0.7));
        px[i + 1] = Math.max(20, Math.round(g * 0.74));
        px[i + 2] = Math.min(200, Math.round(b * 0.98));
        px[i + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    cachedTransparentSignDataUrl = canvas.toDataURL('image/png');
    return cachedTransparentSignDataUrl;
  } catch {
    return getSignDataUrl();
  }
}

let cachedIdCardWaveBgDataUrl: string | null = null;
/**
 * Draws the Official Straight Gold-and-Navy Header/Footer layout natively onto Canvas 2D
 * at 3424x2160 (1016 DPI CR80) into a lossless PNG Data URL, guaranteeing zero
 * SVG-to-canvas security taint or gradient artifacts on any browser/WebView.
 */
async function getIdCardWaveBackgroundDataUrl(width = 3424, height = 2160): Promise<string> {
  if (cachedIdCardWaveBgDataUrl) return cachedIdCardWaveBgDataUrl;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const sx = width / 640;
    const sy = height / 404;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Top Navy Header strictly above straight gold line
    const topBlueGrad = ctx.createLinearGradient(0, 0, width, 95 * sy);
    topBlueGrad.addColorStop(0, '#041434');
    topBlueGrad.addColorStop(0.45, '#0c347a');
    topBlueGrad.addColorStop(0.75, '#1449a3');
    topBlueGrad.addColorStop(1, '#05183d');
    ctx.fillStyle = topBlueGrad;
    ctx.fillRect(0, 0, width, 95 * sy);

    const glowCx = 0.62 * width;
    const glowCy = 0.42 * 95 * sy;
    const glowR = 0.48 * width;
    const topBlueGlow = ctx.createRadialGradient(glowCx, glowCy, 0, glowCx, glowCy, glowR);
    topBlueGlow.addColorStop(0, 'rgba(34, 98, 204, 0.45)');
    topBlueGlow.addColorStop(1, 'rgba(4, 20, 52, 0)');
    ctx.fillStyle = topBlueGlow;
    ctx.fillRect(0, 0, width, 95 * sy);

    // Straight Top Metallic Gold Divider Line with subtle shadow
    ctx.save();
    ctx.shadowColor = 'rgba(9, 30, 66, 0.22)';
    ctx.shadowBlur = 4 * sx;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1.8 * sy;
    const topGoldGrad = ctx.createLinearGradient(0, 0, width, 0);
    topGoldGrad.addColorStop(0, '#a16207');
    topGoldGrad.addColorStop(0.18, '#f5c842');
    topGoldGrad.addColorStop(0.48, '#fef08a');
    topGoldGrad.addColorStop(0.75, '#eab308');
    topGoldGrad.addColorStop(1, '#92400e');
    ctx.fillStyle = topGoldGrad;
    ctx.fillRect(0, 95 * sy, width, 7 * sy);
    ctx.restore();

    ctx.fillStyle = 'rgba(254, 249, 195, 0.7)';
    ctx.fillRect(0, 95.4 * sy, width, 1 * sy);
    ctx.fillStyle = 'rgba(133, 77, 14, 0.85)';
    ctx.fillRect(0, 101.2 * sy, width, 0.8 * sy);

    // Bottom Straight Metallic Gold Line & Navy Blue Footer Band
    const bottomGoldGrad = ctx.createLinearGradient(0, 0, width, 0);
    bottomGoldGrad.addColorStop(0, '#92400e');
    bottomGoldGrad.addColorStop(0.28, '#f5c842');
    bottomGoldGrad.addColorStop(0.55, '#fef08a');
    bottomGoldGrad.addColorStop(0.82, '#eab308');
    bottomGoldGrad.addColorStop(1, '#a16207');
    ctx.fillStyle = bottomGoldGrad;
    ctx.fillRect(0, 368 * sy, width, 6 * sy);

    ctx.fillStyle = 'rgba(254, 249, 195, 0.65)';
    ctx.fillRect(0, 368.3 * sy, width, 0.9 * sy);

    const bottomBlueGrad = ctx.createLinearGradient(0, 0, width, 0);
    bottomBlueGrad.addColorStop(0, '#041434');
    bottomBlueGrad.addColorStop(0.5, '#124294');
    bottomBlueGrad.addColorStop(1, '#041434');
    ctx.fillStyle = bottomBlueGrad;
    ctx.fillRect(0, 374 * sy, width, 30 * sy);

    cachedIdCardWaveBgDataUrl = canvas.toDataURL('image/png');
    return cachedIdCardWaveBgDataUrl;
  } catch {
    return '';
  }
}

let cachedOfficialIdCardWaveBgDataUrl: string | null = null;
/**
 * Draws the Official (पदाधिकारी) Straight Gold-and-Saffron-Orange Header/Footer layout
 * onto Canvas 2D at 3424x2160 (CR80). Preserves exact geometry of the Membership ID Card
 * with a dignified warm saffron-orange palette and subtle ivory-saffron body tint.
 */
async function getOfficialIdCardWaveBackgroundDataUrl(width = 3424, height = 2160): Promise<string> {
  if (cachedOfficialIdCardWaveBgDataUrl) return cachedOfficialIdCardWaveBgDataUrl;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const sx = width / 640;
    const sy = height / 404;

    // Subtle soft ice-blue card body tint (distinct from crisp white Membership ID Card and warm saffron)
    const bodyGrad = ctx.createLinearGradient(0, 102 * sy, 0, 368 * sy);
    bodyGrad.addColorStop(0, '#f8fbff');
    bodyGrad.addColorStop(0.55, '#f0f6fc');
    bodyGrad.addColorStop(1, '#e2edf8');
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(0, 0, width, height);

    // Top Soft Professional Sky Blue (आकाशी) Header strictly above straight gold line
    const topSkyGrad = ctx.createLinearGradient(0, 0, width, 95 * sy);
    topSkyGrad.addColorStop(0, '#0369a1');
    topSkyGrad.addColorStop(0.35, '#0284c7');
    topSkyGrad.addColorStop(0.7, '#0ea5e9');
    topSkyGrad.addColorStop(1, '#0369a1');
    ctx.fillStyle = topSkyGrad;
    ctx.fillRect(0, 0, width, 95 * sy);

    const glowCx = 0.62 * width;
    const glowCy = 0.42 * 95 * sy;
    const glowR = 0.48 * width;
    const topSkyGlow = ctx.createRadialGradient(glowCx, glowCy, 0, glowCx, glowCy, glowR);
    topSkyGlow.addColorStop(0, 'rgba(125, 211, 252, 0.45)');
    topSkyGlow.addColorStop(1, 'rgba(3, 105, 161, 0)');
    ctx.fillStyle = topSkyGlow;
    ctx.fillRect(0, 0, width, 95 * sy);

    // Straight Top Metallic Gold Divider Line with subtle shadow
    ctx.save();
    ctx.shadowColor = 'rgba(2, 132, 199, 0.25)';
    ctx.shadowBlur = 4 * sx;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1.8 * sy;
    const topGoldGrad = ctx.createLinearGradient(0, 0, width, 0);
    topGoldGrad.addColorStop(0, '#a16207');
    topGoldGrad.addColorStop(0.18, '#f5c842');
    topGoldGrad.addColorStop(0.48, '#fef08a');
    topGoldGrad.addColorStop(0.75, '#eab308');
    topGoldGrad.addColorStop(1, '#92400e');
    ctx.fillStyle = topGoldGrad;
    ctx.fillRect(0, 95 * sy, width, 7 * sy);
    ctx.restore();

    ctx.fillStyle = 'rgba(254, 249, 195, 0.72)';
    ctx.fillRect(0, 95.4 * sy, width, 1 * sy);
    ctx.fillStyle = 'rgba(133, 77, 14, 0.85)';
    ctx.fillRect(0, 101.2 * sy, width, 0.8 * sy);

    // Bottom Straight Metallic Gold Line & Soft Sky Blue Footer Band
    const bottomGoldGrad = ctx.createLinearGradient(0, 0, width, 0);
    bottomGoldGrad.addColorStop(0, '#92400e');
    bottomGoldGrad.addColorStop(0.28, '#f5c842');
    bottomGoldGrad.addColorStop(0.55, '#fef08a');
    bottomGoldGrad.addColorStop(0.82, '#eab308');
    bottomGoldGrad.addColorStop(1, '#a16207');
    ctx.fillStyle = bottomGoldGrad;
    ctx.fillRect(0, 368 * sy, width, 6 * sy);

    ctx.fillStyle = 'rgba(254, 249, 195, 0.65)';
    ctx.fillRect(0, 368.3 * sy, width, 0.9 * sy);

    const bottomSkyGrad = ctx.createLinearGradient(0, 0, width, 0);
    bottomSkyGrad.addColorStop(0, '#0369a1');
    bottomSkyGrad.addColorStop(0.5, '#0284c7');
    bottomSkyGrad.addColorStop(1, '#0369a1');
    ctx.fillStyle = bottomSkyGrad;
    ctx.fillRect(0, 374 * sy, width, 30 * sy);

    cachedOfficialIdCardWaveBgDataUrl = canvas.toDataURL('image/png');
    return cachedOfficialIdCardWaveBgDataUrl;
  } catch {
    return '';
  }
}

/**
 * Ensures every <img> inside an off-screen print container has an inline data:image/*
 * src before invoking html2canvas so canvas.toDataURL() can never fail with SecurityError.
 */
async function ensureAllImagesInlineDataUrls(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map(async (img) => {
      const src = (img.getAttribute('src') || '').trim();
      if (!src) {
        img.remove();
        return;
      }
      if (src.startsWith('data:image/')) {
        return;
      }
      const inlined = await resolveImageUrlForPdf(src);
      if (inlined && inlined.startsWith('data:image/')) {
        img.setAttribute('src', inlined);
      } else {
        img.remove();
      }
    })
  );
}

/**
 * Pre-crops member passport photo to exact cover aspect (object-position: top center)
 * because html2canvas does not reliably respect CSS object-fit: cover.
 */
async function cropPhotoToCoverDataUrl(
  photoUrl: string,
  targetW = 468,
  targetH = 576
): Promise<string> {
  if (!photoUrl) return '';
  try {
    const safeSrc = photoUrl.startsWith('data:image/')
      ? photoUrl
      : await resolveImageUrlForPdf(photoUrl);
    if (!safeSrc) return '';

    const img = await loadHtmlImage(safeSrc);
    const sw = img.naturalWidth || img.width;
    const sh = img.naturalHeight || img.height;
    if (!sw || !sh) return safeSrc.startsWith('data:image/') ? safeSrc : '';

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return safeSrc.startsWith('data:image/') ? safeSrc : '';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);

    const scale = Math.max(targetW / sw, targetH / sh);
    const drawW = sw * scale;
    const drawH = sh * scale;
    const dx = (targetW - drawW) / 2;
    const dy = 0; // object-position: top center

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, dx, dy, drawW, drawH);

    if (sw < targetW) {
      applyUnsharpSharpen(canvas, 0.16);
    }
    return canvas.toDataURL('image/png');
  } catch {
    return photoUrl.startsWith('data:image/') ? photoUrl : '';
  }
}

function escapeCardHtml(value: string | number | undefined | null): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Preload immediately on script load
if (typeof window !== 'undefined') {
  getHedingDataUrl().catch(() => {});
  getSignDataUrl().catch(() => {});
  getLogoDataUrl().catch(() => {});
  getQrCodeDataUrl().catch(() => {});
}

function getTodayFormattedDate(): string {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const y = today.getFullYear();
  return `${d}/${m}/${y}`;
}

function getDisplayPost(m: OfficialMember): string {
  return formatAppointedPostWithTaluka(m.appointedPost, m.taluka);
}

function getWorkingPlaceDisplay(m: OfficialMember): { cadre: string; details: string } {
  const cadre = normalizeOfficialCadre(m.currentCadre, 'केंद्रप्रमुख');
  const wPlace = m.workingPlace || '';
  return { cadre, details: wPlace };
}

const DEFAULT_ORG_TITLE = 'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ';

async function waitForFontsAndImages(root: HTMLElement): Promise<void> {
  ensureMontserratFontLoaded();
  if (typeof document !== 'undefined' && (document as any).fonts) {
    try {
      await Promise.allSettled([
        (document as any).fonts.load('900 24px Montserrat'),
        (document as any).fonts.load('800 24px Montserrat'),
        (document as any).fonts.ready,
      ]);
    } catch {
      // Ignore font readiness fallback
    }
  }
  const imgs = Array.from(root.querySelectorAll('img'));
  if (imgs.length > 0) {
    await Promise.all(
      imgs.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        if (typeof img.decode === 'function') {
          return img.decode().catch(() => undefined);
        }
        return new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
      })
    );
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Unified, ultra-fast A4 Paginated Report Renderer:
 * - Single-pass synchronous DOM height measurement packs every A4 page cleanly (~95% fill)
 * - Strictly single font ('Noto Sans Devanagari', tabular-nums) & crisp B&W print table styling
 * - Zero bottom-touching Devanagari vowel signs (ु/ू/ृ in "पुणे" etc.)
 * - Zero gradients, zero star emojis, zero promotional footers
 */
async function renderStandardPaginatedTablePdf(params: {
  orgTitle?: string;
  reportTitle: string;
  leftMeta: string;
  rightMeta: string;
  columns: ReportColumn[];
  rowsCells: Array<Array<{ text: string; bold?: boolean }>>;
  fileName: string;
  letterheadUrl?: string;
  signUrl?: string;
  summaryCells?: Array<{ text: string; bold?: boolean }>;
  dense?: boolean;
  onProgress?: (status: string) => void;
}): Promise<void> {
  const {
    orgTitle = DEFAULT_ORG_TITLE,
    reportTitle,
    leftMeta,
    rightMeta,
    columns,
    rowsCells,
    fileName,
    letterheadUrl,
    signUrl,
    summaryCells,
    dense = false,
    onProgress,
  } = params;

  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';
  wrapper.style.width = `${A4_PX_WIDTH}px`;
  wrapper.style.background = '#ffffff';
  wrapper.style.zIndex = '999999';
  document.body.appendChild(wrapper);

  try {
    const allRowsHtml = rowsCells.map((cells, idx) =>
      buildTableRowHtml(cells, columns, { rowIndex: idx, dense })
    );
    const summaryRowHtml = summaryCells
      ? buildTableRowHtml(summaryCells, columns, { dense, isSummary: true })
      : '';
    const signatureHtml = signUrl ? buildSignatureBlockHtml(signUrl) : '';

    // 1. Single-pass synchronous height measurement for exact A4 packing
    const theadHtml = buildTableHeaderHtml(columns, dense);
    const firstHeaderHtml = buildReportPageHeaderHtml({
      orgTitle,
      reportTitle,
      leftMeta,
      rightMeta,
      pageNumber: 1,
      totalPages: 2,
      letterheadUrl,
    });
    const contHeaderHtml = buildReportPageHeaderHtml({
      orgTitle,
      reportTitle,
      leftMeta,
      rightMeta,
      pageNumber: 2,
      totalPages: 2,
    });

    wrapper.innerHTML = `
      <div style="width: ${A4_PX_WIDTH}px; padding: 22px 26px; box-sizing: border-box; font-family: ${REPORT_FONT_FAMILY};">
        <div data-m="firstHead">${firstHeaderHtml}${theadHtml}</div>
        <div data-m="contHead">${contHeaderHtml}${theadHtml}</div>
        <div data-m="rows" style="width: 100%; border: 1.5px solid #0f172a; border-bottom: none; box-sizing: border-box;">
          ${allRowsHtml.join('')}
        </div>
        <div data-m="trailing" style="width: 100%; box-sizing: border-box;">
          ${summaryRowHtml ? `<div style="border: 1.5px solid #0f172a; border-top: none;">${summaryRowHtml}</div>` : ''}
          ${signatureHtml}
        </div>
      </div>
    `;

    await waitForFontsAndImages(wrapper);

    const firstHeadH = wrapper.querySelector('[data-m="firstHead"]')?.getBoundingClientRect().height || 130;
    const contHeadH = wrapper.querySelector('[data-m="contHead"]')?.getBoundingClientRect().height || 110;
    const trailingH = wrapper.querySelector('[data-m="trailing"]')?.getBoundingClientRect().height || 0;
    const rowElements = Array.from(wrapper.querySelectorAll('[data-m="rows"] .pdf-measure-row'));
    const rowHeights = rowElements.map((el) => Math.ceil(el.getBoundingClientRect().height));

    // Inner A4 height after top+bottom 22px padding = 1123 - 44 = 1079px; subtract 6px for outer border safety
    const USABLE_PAGE_HEIGHT = A4_PX_HEIGHT - 50;
    const pagesIndices = packMeasuredRowsIntoPages({
      rowHeights,
      firstPageAvailableHeight: Math.max(120, USABLE_PAGE_HEIGHT - Math.ceil(firstHeadH)),
      continuationPageAvailableHeight: Math.max(120, USABLE_PAGE_HEIGHT - Math.ceil(contHeadH)),
      trailingReserveHeight: trailingH > 0 ? Math.ceil(trailingH) + 8 : 0,
    });

    const { jsPDF, html2canvas } = await loadPdfEngines();
    const totalPages = pagesIndices.length;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

    for (let pIdx = 0; pIdx < totalPages; pIdx++) {
      if (onProgress) {
        onProgress(
          totalPages > 1
            ? `पान ${toEnglishDigits(pIdx + 1)} / ${toEnglishDigits(totalPages)} तयार होत आहे...`
            : 'PDF तयार होत आहे...'
        );
      }

      const isLast = pIdx === totalPages - 1;
      const pageRowsHtml = pagesIndices[pIdx].map((rIdx) => allRowsHtml[rIdx]);

      wrapper.innerHTML = buildSingleTablePageHtml({
        orgTitle,
        reportTitle,
        leftMeta,
        rightMeta,
        pageNumber: pIdx + 1,
        totalPages,
        columns,
        pageRowsHtml,
        letterheadUrl: pIdx === 0 ? letterheadUrl : undefined,
        summaryRowHtml: isLast ? summaryRowHtml : '',
        signatureHtml: isLast ? signatureHtml : '',
        dense,
      });

      await ensureAllImagesInlineDataUrls(wrapper);
      await waitForFontsAndImages(wrapper);

      const pageEl = wrapper.firstElementChild as HTMLElement;
      const canvas = await html2canvas(pageEl, {
        scale: 1.5,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        width: A4_PX_WIDTH,
        height: A4_PX_HEIGHT,
        windowWidth: A4_PX_WIDTH,
        windowHeight: A4_PX_HEIGHT,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.86);
      if (pIdx > 0) pdf.addPage('a4', 'portrait');
      pdf.addImage(imgData, 'JPEG', 0, 0, A4_MM_WIDTH, A4_MM_HEIGHT, undefined, 'FAST');
    }

    if (onProgress) onProgress('PDF फाईल डाऊनलोड होत आहे...');
    pdf.save(fileName);
  } finally {
    document.body.removeChild(wrapper);
  }
}

/**
 * 1. Single Member Official A4 Appointment Letter PDF
 * Clean institutional A4 layout with uniform Devanagari typography (zero gradients, zero star emojis)
 */
export async function generateSingleLetterPdf(
  member: OfficialMember,
  serialNo: number
): Promise<void> {
  const serialPadded = String(serialNo).padStart(2, '0');
  const todayStr = getTodayFormattedDate();

  const [hedingUrl, signUrl] = await Promise.all([getHedingDataUrl(), getSignDataUrl()]);

  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';
  wrapper.style.width = `${A4_PX_WIDTH}px`;
  wrapper.style.height = `${A4_PX_HEIGHT}px`;
  wrapper.style.background = '#ffffff';
  wrapper.style.zIndex = '999999';
  wrapper.style.overflow = 'hidden';

  wrapper.innerHTML = buildSingleAppointmentLetterHtml({
    member,
    serialPadded,
    todayStr,
    hedingUrl,
    signUrl,
  });
  document.body.appendChild(wrapper);

  try {
    await ensureAllImagesInlineDataUrls(wrapper);
    await waitForFontsAndImages(wrapper);
    const { jsPDF, html2canvas } = await loadPdfEngines();

    const canvas = await html2canvas(wrapper.firstElementChild as HTMLElement, {
      scale: 1.75,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      width: A4_PX_WIDTH,
      height: A4_PX_HEIGHT,
      windowWidth: A4_PX_WIDTH,
      windowHeight: A4_PX_HEIGHT,
      logging: false,
    });

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.9);
    pdf.addImage(imgData, 'JPEG', 0, 0, A4_MM_WIDTH, A4_MM_HEIGHT, undefined, 'FAST');

    const cleanName = `${member.firstName}_${member.lastName}`.replace(/\s+/g, '_');
    pdf.save(`नियुक्ती_पत्र_क्र_${serialPadded}_${cleanName}.pdf`);
  } finally {
    document.body.removeChild(wrapper);
  }
}

/**
 * 2. District Executive Committee Official A4 Office PDF (<= 500 KB, Hybrid Vector + Native Devanagari)
 * - Page 1: Full-color official letterhead (/heding.jpg) + 6-column table
 * - Page 2+: Compact institutional continuation header + repeated column headers
 * - All cells strictly Vertical-Center + Horizontal-Left
 * - Final page: State President signature with name & designation
 */
export async function generateDistrictExecutivePdf(
  district: string,
  list: OfficialMember[],
  onProgress?: (status: string) => void
): Promise<DistrictExecutivePdfResult | null> {
  return generateDistrictExecutiveOfficePdf(district, list, onProgress);
}

/**
 * 3. Statewide Master Registry Serial PDF
 * Uniform B&W institutional A4 table with dynamic pagination
 */
export async function generateStatewideRegistryPdf(
  allMembers: OfficialMember[],
  onProgress?: (status: string) => void
): Promise<void> {
  if (!allMembers || allMembers.length === 0) {
    return;
  }

  const sorted = [...allMembers].sort((a, b) => {
    const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    if (timeA !== timeB && timeA > 0 && timeB > 0) return timeA - timeB;
    const numIdA = parseInt(a.id) || 0;
    const numIdB = parseInt(b.id) || 0;
    if (numIdA > 0 && numIdB > 0 && numIdA !== numIdB) return numIdA - numIdB;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  const columns: ReportColumn[] = [
    { header: 'अनु.', width: '44px', align: 'center' },
    { header: 'नियुक्ती क्र.', width: '96px', align: 'center' },
    { header: 'जिल्हा', width: '115px', align: 'left' },
    { header: 'पदाधिकाऱ्याचे संपूर्ण नाव', flex: 1.15, align: 'left' },
    { header: 'बहाल केलेले पद', flex: 1, align: 'left' },
  ];

  const rowsCells = sorted.map((m, idx) => {
    const serialNo = idx + 1;
    const outwardFormatted = String(serialNo).padStart(2, '0');
    const distName =
      m.district === 'अहमदनगर' || (m.district && m.district.toLowerCase() === 'ahmednagar')
        ? 'अहिल्यानगर'
        : m.district || '-';
    const fullName = `${m.salutation || ''} ${m.firstName || ''} ${m.middleName ? m.middleName + ' ' : ''}${m.lastName || ''}`.trim();
    const postName = formatAppointedPostWithTaluka(m.appointedPost, m.taluka);
    return [
      { text: String(serialNo), bold: true },
      { text: `MS/2026/${outwardFormatted}`, bold: true },
      { text: distName, bold: true },
      { text: fullName, bold: true },
      { text: postName },
    ];
  });

  await renderStandardPaginatedTablePdf({
    reportTitle: 'नियुक्ती क्रमांकानुसार पदाधिकारी यादी',
    leftMeta: `एकूण जारी नियुक्ती: ${toEnglishDigits(sorted.length)}`,
    rightMeta: `दिनांक: ${getTodayFormattedDate()}`,
    columns,
    rowsCells,
    fileName: 'नियुक्ती_क्रमांकानुसार_सर्व_माहिती.pdf',
    onProgress,
  });
}

/**
 * 4. Official Lifetime Membership ID Card (आजीवन सभासद आय-कार्ड PDF)
 * - Standard CR80 ID Card dimensions (85.6mm x 54mm)
 * - Rendered at 856x540px * 3 = 2568x1620px (762 DPI Print Quality) with lossless PNG embedding
 * - Curved Gold & Navy Blue Header/Footer Wave design matching approved preview
 * - Multi-step sharpened Circular Logo (/logo.png)
 * - Transparent crisp Blue Ink Signature (/sign.jpg)
 * - High-contrast 600x600 QR Code + Accurate Member Details
 */
async function buildMembershipIdCardPdfDocument(
  app: MembershipApplication,
  options: { forEmail?: boolean } = {}
): Promise<{ pdf: JsPdfType; downloadFileName: string; emailFileName: string }> {
  const { forEmail = false } = options;

  const [sharpLogoUrl, transparentSignUrl, qrUrl, waveBgUrl, safePhotoRawUrl] = await Promise.all([
    getSharpLogoDataUrl(720),
    getTransparentSignDataUrl(),
    getQrCodeDataUrl(),
    getIdCardWaveBackgroundDataUrl(3424, 2160),
    resolveImageUrlForPdf(app.photo),
  ]);

  const croppedPhotoUrl = safePhotoRawUrl
    ? await cropPhotoToCoverDataUrl(safePhotoRawUrl, 624, 768)
    : '';

  let memberNo = toEnglishDigits((app.memberNumber || '').trim());
  if (!memberNo) {
    const rawDigits = toEnglishDigits(app.applicationNumber || '').replace(/\D/g, '');
    const seq = parseInt(rawDigits.slice(-4) || '1', 10) || 1;
    memberNo = formatSequentialMemberNumber(app.district || 'नाशिक', seq);
  }

  const salutation = (app.salutation || '').trim();
  const rawFullName = (app.fullName || '').trim();
  const displayName = `${salutation ? salutation + ' ' : ''}${rawFullName}`.trim() || 'सदस्य';
  const cadre = normalizeOfficialCadre(app.professional, 'केंद्रप्रमुख / शिक्षण विस्तार अधिकारी');
  const district = (app.district || '').trim();
  const taluka = (app.taluka || '').trim();
  const areaText = `${district}${taluka ? ` (ता. ${taluka})` : ''}` || '-';
  const phoneText = toEnglishDigits((app.phone || '').trim()) || '-';

  // Dynamic font safeguards for extra-long names, area strings, or member numbers
  const nameFontPx = displayName.length > 34 ? 25.0 : displayName.length > 27 ? 27.5 : 30.4;
  const detailFontPx = areaText.length > 34 ? 17.8 : 19.7;
  const memberNoFontPx = memberNo.length > 21 ? 19.5 : memberNo.length > 18 ? 21.8 : 23.8;

  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';
  wrapper.style.width = '856px';
  wrapper.style.height = '540px';
  wrapper.style.background = '#ffffff';
  wrapper.style.zIndex = '999999';
  wrapper.style.overflow = 'hidden';

  const cardHtml = `
    <div style="width: 856px; height: 540px; position: relative; background: #ffffff; border-radius: 21px; border: 3.3px solid #0a2a5e; box-sizing: border-box; overflow: hidden; font-family: 'Noto Sans Devanagari', sans-serif; box-shadow: inset 0 0 0 2px rgba(255,255,255,0.85);">
      ${
        waveBgUrl
          ? `<img src="${waveBgUrl}" alt="" style="position: absolute; inset: 0; width: 100%; height: 100%; display: block; pointer-events: none;" />`
          : ''
      }

      <!-- 1. TOP-LEFT SHARP CIRCULAR LOGO (Inside straight top navy header) -->
      ${
        sharpLogoUrl
          ? `<div style="position: absolute; left: 2.8%; top: 1.4%; width: 114px; height: 114px; border-radius: 50%; border: 3.6px solid #eab308; background: #ffffff; overflow: hidden; box-sizing: border-box; box-shadow: 0 3px 8px rgba(0,0,0,0.45), 0 0 0 1.8px rgba(255,255,255,0.72);">
               <img src="${sharpLogoUrl}" alt="महासंघ लोगो" style="width: 100%; height: 100%; display: block;" />
             </div>`
          : ''
      }

      <!-- 2. HEADER 3 TITLE LINES (Centered inside straight navy header above straight gold line) -->
      <div style="position: absolute; left: 16.5%; right: 6%; top: 2.6%; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <div style="font-family: 'Noto Serif Devanagari', 'Noto Sans Devanagari', serif; font-weight: 800; font-size: 20px; color: #fde047; letter-spacing: 0.4px; line-height: 1.18; text-shadow: 0 1.3px 3.4px rgba(0,0,0,0.5);">
          महाराष्ट्र राज्य
        </div>
        <div style="font-family: 'Noto Serif Devanagari', 'Noto Sans Devanagari', serif; font-weight: 900; font-size: 33px; color: #ffffff; line-height: 1.22; letter-spacing: -0.2px; margin-top: 1.8px; text-shadow: 0 2.1px 5.1px rgba(0,0,0,0.65); white-space: nowrap;">
          केंद्रप्रमुख व अधिकारी महासंघ
        </div>
        <div style="font-family: 'Noto Sans Devanagari', sans-serif; font-weight: 700; font-size: 15px; color: #f1f5f9; line-height: 1.25; margin-top: 7.5px; letter-spacing: 0.2px;">
          नोंदणी क्र. श्रमिक संघ - महा/एनएसके/एन/2427
        </div>
      </div>

      <!-- 3. SUB-HEADER: 'आजीवन सदस्य' (Below straight top gold line) -->
      <div style="position: absolute; left: 27%; width: 41%; top: 27.6%; text-align: center;">
        <div style="font-family: 'Noto Serif Devanagari', 'Noto Sans Devanagari', serif; font-weight: 900; font-size: 28.6px; color: #1e293b; line-height: 1.25; white-space: nowrap;">
          आजीवन सदस्य
        </div>
      </div>

      <!-- 4. ENLARGED & BOLD MEMBER NUMBER (Distinct Geometric Font below straight top gold line) -->
      <div style="position: absolute; right: 1.6%; top: 26.8%; width: 31%; text-align: center; line-height: 1.18;">
        <div style="font-weight: 800; color: #1e293b; font-size: 21px;">
          सदस्य क्र:
        </div>
        <div style="font-family: 'Montserrat', 'Arial Black', 'Segoe UI', sans-serif; font-weight: 900; color: #091e42; font-size: ${memberNoFontPx}px; white-space: nowrap; letter-spacing: -0.2px; margin-top: 3px;">
          ${escapeCardHtml(memberNo)}
        </div>
      </div>

      <!-- 5. LEFT PASSPORT PHOTO WITH GOLDEN BORDER -->
      <div style="position: absolute; left: 3.6%; top: 31.2%; width: 154px; height: 189px; border-radius: 12px; border: 3.85px solid #d4af37; background: #f1f5f9; overflow: hidden; box-sizing: border-box; box-shadow: 0 3.4px 8.5px rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center;">
        ${
          croppedPhotoUrl
            ? `<img src="${croppedPhotoUrl}" alt="${escapeCardHtml(displayName)}" style="width: 100%; height: 100%; display: block;" />`
            : `<div style="text-align: center; color: #94a3b8; font-size: 15px; font-weight: 700;">फोटो</div>`
        }
      </div>

      <!-- 6. MIDDLE MEMBER DETAILS (Cleanly spaced between photo & QR) -->
      <div style="position: absolute; left: 24.2%; top: 38.0%; width: 51%; display: flex; flex-direction: column; justify-content: center;">
        <div style="font-family: 'Noto Serif Devanagari', 'Noto Sans Devanagari', serif; font-weight: 900; font-size: ${nameFontPx}px; color: #b91c1c; line-height: 1.22; margin-bottom: 13px; word-break: break-word;">
          ${escapeCardHtml(displayName)}
        </div>
        <div style="font-family: 'Noto Sans Devanagari', sans-serif; font-weight: 700; color: #0f172a; font-size: ${detailFontPx}px; line-height: 1.52; display: flex; flex-direction: column; gap: 7.3px;">
          <div>पद: ${escapeCardHtml(cadre)}</div>
          <div>कार्यक्षेत्र: ${escapeCardHtml(areaText)}</div>
          <div>
            मोबाईल: <span style="font-family: 'Courier New', ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 800; letter-spacing: 0.2px;">${escapeCardHtml(phoneText)}</span>
          </div>
        </div>
      </div>

      <!-- 7. RIGHT SCANNABLE QR CODE (Moved Lower for Clear Gap Below Member No & Above Signature) -->
      <div style="position: absolute; right: 4.2%; top: 43.2%; width: 140px; height: 140px; background: #ffffff; display: flex; align-items: center; justify-content: center; padding: 2px; box-sizing: border-box;">
        ${
          qrUrl
            ? `<img src="${qrUrl}" alt="mahasangh.in QR Code" style="width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; display: block;" />`
            : ''
        }
      </div>

      <!-- 8. BOTTOM-LEFT FOOTER TEXT (Cleanly above straight bottom gold line) -->
      <div style="position: absolute; left: 3.8%; bottom: 11.4%; line-height: 1.35;">
        <div style="font-weight: 800; color: #0b2559; font-size: 17.3px;">
          महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ
        </div>
        <div style="font-weight: 900; color: #991b1b; font-size: 18.2px;">
          आजीवन डिजिटल आय-कार्ड
        </div>
      </div>

      <!-- 9. BOTTOM-RIGHT TRANSPARENT BLUE INK SIGNATURE & DESIGNATION (Above straight gold line, clear of QR) -->
      <div style="position: absolute; right: 3.2%; bottom: 10.1%; min-width: 23%; text-align: center; display: flex; flex-direction: column; align-items: center;">
        ${
          transparentSignUrl
            ? `<img src="${transparentSignUrl}" alt="स्वाक्षरी" style="height: 42.5px; width: auto; max-width: 158px; object-fit: contain; display: block; margin: 0 auto -3px auto;" />`
            : ''
        }
        <div style="font-family: 'Noto Serif Devanagari', 'Noto Sans Devanagari', serif; font-weight: 900; color: #000000; font-size: 20.2px; line-height: 1.18; white-space: nowrap;">
          श्री. राजेंद्र खैरनार
        </div>
        <div style="font-weight: 700; color: #1e293b; font-size: 14.2px; line-height: 1.18; white-space: nowrap;">
          (संस्थापक राज्याध्यक्ष)
        </div>
      </div>
    </div>
  `;

  wrapper.innerHTML = cardHtml;
  document.body.appendChild(wrapper);

  try {
    await ensureAllImagesInlineDataUrls(wrapper);
    await waitForFontsAndImages(wrapper);

    const { jsPDF, html2canvas } = await loadPdfEngines();
    const cardEl = wrapper.firstElementChild as HTMLElement;
    const canvas = await html2canvas(cardEl, {
      scale: 2.2, // ~300 KB lightweight PDF for instant download
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      width: 856,
      height: 540,
      windowWidth: 856,
      windowHeight: 540,
      logging: false,
    });

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [85.6, 54],
      compress: true,
    });
    const jpegData = canvas.toDataURL('image/jpeg', 0.88);
    pdf.addImage(jpegData, 'JPEG', 0, 0, 85.6, 54, undefined, 'SLOW');
    const cleanName = (app.fullName || 'सदस्य').replace(/\s+/g, '_');
    const cleanMemberId = memberNo.replace(/[^a-zA-Z0-9_-]/g, '_');
    return {
      pdf,
      downloadFileName: `आय_कार्ड_${cleanName}.pdf`,
      emailFileName: `Mahasangh_ID_${cleanMemberId}.pdf`,
    };
  } finally {
    document.body.removeChild(wrapper);
  }
}

export async function generateMembershipIdCardPdf(app: MembershipApplication): Promise<void> {
  const { pdf, downloadFileName } = await buildMembershipIdCardPdfDocument(app, { forEmail: false });
  pdf.save(downloadFileName);
}

export async function generateMembershipIdCardPdfBase64(
  app: MembershipApplication
): Promise<{ base64: string; fileName: string }> {
  const { pdf, emailFileName } = await buildMembershipIdCardPdfDocument(app, { forEmail: true });
  const dataUri = pdf.output('datauristring');
  const commaIdx = dataUri.indexOf(',');
  const base64 = commaIdx >= 0 ? dataUri.slice(commaIdx + 1) : dataUri;
  return { base64, fileName: emailFileName };
}

export async function generateMembershipCertificatePdf(app: MembershipApplication): Promise<void> {
  return generateMembershipIdCardPdf(app);
}

/**
 * 4B. Official Office-Bearer ID Card (पदाधिकारी डिजिटल आय-कार्ड PDF)
 * - Identical CR80 dimensions (85.6mm x 54mm) & visual hierarchy as Membership ID Card
 * - Distinct light warm saffron-orange header/footer & subtle ivory-saffron body tint
 * - Shows appointed designation + jurisdiction (महाराष्ट्र राज्य / जिल्हा / तालुका) instead of आजीवन सदस्य
 * - Shows नियुक्ती क्र: instead of सदस्य क्र:
 * - Preserves Circular Logo, Passport Photo with golden border, QR Code, and Rajendra Khairnar signature
 */
async function buildOfficialIdCardPdfDocument(
  official: OfficialIdCardData
): Promise<{ pdf: JsPdfType; downloadFileName: string }> {
  const [sharpLogoUrl, transparentSignUrl, qrUrl, waveBgUrl, safePhotoRawUrl] = await Promise.all([
    getSharpLogoDataUrl(720),
    getTransparentSignDataUrl(),
    getQrCodeDataUrl(),
    getOfficialIdCardWaveBackgroundDataUrl(3424, 2160),
    resolveImageUrlForPdf(official.photo),
  ]);

  const croppedPhotoUrl = safePhotoRawUrl
    ? await cropPhotoToCoverDataUrl(safePhotoRawUrl, 624, 768)
    : '';

  const appointmentNo = toEnglishDigits((official.appointmentNumber || '').trim()) || 'MS/2026/01';
  const displayName = (official.displayName || '').trim() || 'पदाधिकारी';
  const designationTitle = (official.designationTitle || '').trim() || 'पदाधिकारी';
  const jurisdictionSubtitle = (official.jurisdictionSubtitle || '').trim() || 'महाराष्ट्र राज्य';
  const cadre = normalizeOfficialCadre(official.cadre, 'केंद्रप्रमुख / शिक्षण विस्तार अधिकारी');
  const areaText = (official.areaText || '').trim() || jurisdictionSubtitle;
  const phoneText = toEnglishDigits((official.phone || '').trim()) || '-';

  // Dynamic typography safeguards for extra-long Marathi designations, names, or order numbers
  const designationFontPx =
    designationTitle.length > 24 ? 20.5 : designationTitle.length > 18 ? 23.0 : 26.2;
  const jurisdictionFontPx =
    jurisdictionSubtitle.length > 28 ? 14.5 : jurisdictionSubtitle.length > 22 ? 15.8 : 17.2;
  const nameFontPx = displayName.length > 34 ? 24.5 : displayName.length > 27 ? 27.0 : 29.5;
  const detailFontPx = areaText.length > 34 ? 17.4 : 19.2;
  const orderNoFontPx = appointmentNo.length > 19 ? 19.5 : appointmentNo.length > 15 ? 21.8 : 23.8;

  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';
  wrapper.style.width = '856px';
  wrapper.style.height = '540px';
  wrapper.style.background = '#fffdf9';
  wrapper.style.zIndex = '999999';
  wrapper.style.overflow = 'hidden';

  const cardHtml = `
    <div style="width: 856px; height: 540px; position: relative; background: #fffdf9; border-radius: 21px; border: 3.3px solid #9a3412; box-sizing: border-box; overflow: hidden; font-family: 'Noto Sans Devanagari', sans-serif; box-shadow: inset 0 0 0 2px rgba(255,255,255,0.85);">
      ${
        waveBgUrl
          ? `<img src="${waveBgUrl}" alt="" style="position: absolute; inset: 0; width: 100%; height: 100%; display: block; pointer-events: none;" />`
          : ''
      }

      <!-- 1. TOP-LEFT SHARP CIRCULAR LOGO (Inside straight top saffron-orange header) -->
      ${
        sharpLogoUrl
          ? `<div style="position: absolute; left: 2.8%; top: 1.4%; width: 114px; height: 114px; border-radius: 50%; border: 3.6px solid #eab308; background: #ffffff; overflow: hidden; box-sizing: border-box; box-shadow: 0 3px 8px rgba(0,0,0,0.42), 0 0 0 1.8px rgba(255,255,255,0.75);">
               <img src="${sharpLogoUrl}" alt="महासंघ लोगो" style="width: 100%; height: 100%; display: block;" />
             </div>`
          : ''
      }

      <!-- 2. HEADER 3 TITLE LINES (Identical masthead inside saffron-orange header) -->
      <div style="position: absolute; left: 16.5%; right: 6%; top: 2.6%; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <div style="font-family: 'Noto Serif Devanagari', 'Noto Sans Devanagari', serif; font-weight: 800; font-size: 20px; color: #fef08a; letter-spacing: 0.4px; line-height: 1.18; text-shadow: 0 1.3px 3.4px rgba(0,0,0,0.45);">
          महाराष्ट्र राज्य
        </div>
        <div style="font-family: 'Noto Serif Devanagari', 'Noto Sans Devanagari', serif; font-weight: 900; font-size: 33px; color: #ffffff; line-height: 1.22; letter-spacing: -0.2px; margin-top: 1.8px; text-shadow: 0 2.1px 5.1px rgba(0,0,0,0.58); white-space: nowrap;">
          केंद्रप्रमुख व अधिकारी महासंघ
        </div>
        <div style="font-family: 'Noto Sans Devanagari', sans-serif; font-weight: 700; font-size: 15px; color: #ffedd5; line-height: 1.25; margin-top: 7.5px; letter-spacing: 0.2px;">
          नोंदणी क्र. श्रमिक संघ - महा/एनएसके/एन/2427
        </div>
      </div>

      <!-- 3. SUB-HEADER: DESIGNATION & JURISDICTION (Replaces 'आजीवन सदस्य') -->
      <div style="position: absolute; left: 23.5%; width: 45.5%; top: 26.2%; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <div style="font-family: 'Noto Serif Devanagari', 'Noto Sans Devanagari', serif; font-weight: 900; font-size: ${designationFontPx}px; color: #9a3412; line-height: 1.18; white-space: nowrap;">
          ${escapeCardHtml(designationTitle)}
        </div>
        <div style="font-family: 'Noto Sans Devanagari', sans-serif; font-weight: 800; font-size: ${jurisdictionFontPx}px; color: #334155; line-height: 1.22; margin-top: 2px; white-space: nowrap;">
          ${escapeCardHtml(jurisdictionSubtitle)}
        </div>
      </div>

      <!-- 4. APPOINTMENT ORDER NUMBER (Replaces 'सदस्य क्र:') -->
      <div style="position: absolute; right: 1.6%; top: 26.8%; width: 31%; text-align: center; line-height: 1.18;">
        <div style="font-weight: 800; color: #7c2d12; font-size: 20.5px;">
          नियुक्ती क्र:
        </div>
        <div style="font-family: 'Montserrat', 'Arial Black', 'Segoe UI', sans-serif; font-weight: 900; color: #7c2d12; font-size: ${orderNoFontPx}px; white-space: nowrap; letter-spacing: -0.2px; margin-top: 3px;">
          ${escapeCardHtml(appointmentNo)}
        </div>
      </div>

      <!-- 5. LEFT PASSPORT PHOTO WITH GOLDEN BORDER -->
      <div style="position: absolute; left: 3.6%; top: 31.2%; width: 154px; height: 189px; border-radius: 12px; border: 3.85px solid #d4af37; background: #fff7ed; overflow: hidden; box-sizing: border-box; box-shadow: 0 3.4px 8.5px rgba(124,45,18,0.22); display: flex; align-items: center; justify-content: center;">
        ${
          croppedPhotoUrl
            ? `<img src="${croppedPhotoUrl}" alt="${escapeCardHtml(displayName)}" style="width: 100%; height: 100%; display: block;" />`
            : `<div style="text-align: center; color: #9a3412; font-size: 15px; font-weight: 700;">फोटो</div>`
        }
      </div>

      <!-- 6. MIDDLE OFFICIAL DETAILS (Cleanly spaced between photo & QR) -->
      <div style="position: absolute; left: 24.2%; top: 40.4%; width: 51%; display: flex; flex-direction: column; justify-content: center;">
        <div style="font-family: 'Noto Serif Devanagari', 'Noto Sans Devanagari', serif; font-weight: 900; font-size: ${nameFontPx}px; color: #9a3412; line-height: 1.2; margin-bottom: 11px; word-break: break-word;">
          ${escapeCardHtml(displayName)}
        </div>
        <div style="font-family: 'Noto Sans Devanagari', sans-serif; font-weight: 700; color: #0f172a; font-size: ${detailFontPx}px; line-height: 1.48; display: flex; flex-direction: column; gap: 6.5px;">
          <div>संवर्ग: ${escapeCardHtml(cadre)}</div>
          <div>कार्यक्षेत्र: ${escapeCardHtml(areaText)}</div>
          <div>
            मोबाईल: <span style="font-family: 'Courier New', ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 800; letter-spacing: 0.2px;">${escapeCardHtml(phoneText)}</span>
          </div>
        </div>
      </div>

      <!-- 7. RIGHT SCANNABLE QR CODE -->
      <div style="position: absolute; right: 4.2%; top: 43.2%; width: 140px; height: 140px; background: #ffffff; border: 1.5px solid #fed7aa; border-radius: 6px; display: flex; align-items: center; justify-content: center; padding: 3px; box-sizing: border-box;">
        ${
          qrUrl
            ? `<img src="${qrUrl}" alt="mahasangh.in QR Code" style="width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; display: block;" />`
            : ''
        }
      </div>

      <!-- 8. BOTTOM-LEFT FOOTER TEXT (Above straight bottom gold line) -->
      <div style="position: absolute; left: 3.8%; bottom: 11.4%; line-height: 1.35;">
        <div style="font-weight: 800; color: #7c2d12; font-size: 17.3px;">
          महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ
        </div>
        <div style="font-weight: 900; color: #c2410c; font-size: 18.2px;">
          अधिकृत पदाधिकारी आय-कार्ड
        </div>
      </div>

      <!-- 9. BOTTOM-RIGHT TRANSPARENT BLUE INK SIGNATURE & DESIGNATION -->
      <div style="position: absolute; right: 3.2%; bottom: 10.1%; min-width: 23%; text-align: center; display: flex; flex-direction: column; align-items: center;">
        ${
          transparentSignUrl
            ? `<img src="${transparentSignUrl}" alt="स्वाक्षरी" style="height: 42.5px; width: auto; max-width: 158px; object-fit: contain; display: block; margin: 0 auto -3px auto;" />`
            : ''
        }
        <div style="font-family: 'Noto Serif Devanagari', 'Noto Sans Devanagari', serif; font-weight: 900; color: #000000; font-size: 20.2px; line-height: 1.18; white-space: nowrap;">
          श्री. राजेंद्र खैरनार
        </div>
        <div style="font-weight: 700; color: #1e293b; font-size: 14.2px; line-height: 1.18; white-space: nowrap;">
          (संस्थापक राज्याध्यक्ष)
        </div>
      </div>
    </div>
  `;

  wrapper.innerHTML = cardHtml;
  document.body.appendChild(wrapper);

  try {
    await ensureAllImagesInlineDataUrls(wrapper);
    await waitForFontsAndImages(wrapper);

    const { jsPDF, html2canvas } = await loadPdfEngines();
    const cardEl = wrapper.firstElementChild as HTMLElement;
    const canvas = await html2canvas(cardEl, {
      scale: 2.2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#fffdf9',
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      width: 856,
      height: 540,
      windowWidth: 856,
      windowHeight: 540,
      logging: false,
    });

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [85.6, 54],
      compress: true,
    });
    const jpegData = canvas.toDataURL('image/jpeg', 0.88);
    pdf.addImage(jpegData, 'JPEG', 0, 0, 85.6, 54, undefined, 'SLOW');
    const cleanName = (official.cleanNameForFile || official.displayName || 'पदाधिकारी').replace(/\s+/g, '_');
    return {
      pdf,
      downloadFileName: `पदाधिकारी_आय_कार्ड_${cleanName}.pdf`,
    };
  } finally {
    document.body.removeChild(wrapper);
  }
}

export async function generateOfficialIdCardPdf(official: OfficialIdCardData): Promise<void> {
  const { pdf, downloadFileName } = await buildOfficialIdCardPdfDocument(official);
  pdf.save(downloadFileName);
}

/**
 * 4B. Bulk District ID Cards Landscape PDF for Super Admin printing (नवीन आयकार्ड प्रिंट करा)
 */
export async function generateDistrictBatchIdCardsPdf(
  districtName: string,
  members: MembershipApplication[],
  onProgress?: (s: string) => void
): Promise<void> {
  const approved = members.filter(
    (m) =>
      m.status === 'approved' &&
      (!districtName || (m.district || '').trim().toLowerCase() === districtName.trim().toLowerCase())
  );
  if (approved.length === 0) {
    throw new Error(`'${districtName}' जिल्ह्यात एकही मंजूर सदस्य उपलब्ध नाही.`);
  }

  const { jsPDF, html2canvas } = await loadPdfEngines();
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [85.6, 54],
    compress: true,
  });

  for (let i = 0; i < approved.length; i++) {
    const app = approved[i];
    if (onProgress) {
      onProgress(`आय-कार्ड तयार करत आहे (${i + 1}/${approved.length}): ${app.fullName}`);
    }

    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-9999px';
    wrapper.style.top = '0';
    wrapper.style.width = '856px';
    wrapper.style.height = '540px';
    wrapper.style.zIndex = '999999';

    const memberNo = app.memberNumber || `MRK-${2026}-${1000 + i}`;
    const cadre = normalizeOfficialCadre(app.professional, 'केंद्रप्रमुख / शिक्षण विस्तार अधिकारी');
    const talukaStr = app.taluka ? `ता. ${app.taluka}` : '';
    const distStr = app.district ? `जि. ${app.district}` : '';
    const areaText = [talukaStr, distStr].filter(Boolean).join(', ');
    const phoneText = app.phone || '';

    const [sharpLogoUrl, qrUrl, rawPhotoUrl] = await Promise.all([
      getSharpLogoDataUrl(240),
      getQrCodeDataUrl(`https://mahasangh.in/member/${memberNo}`),
      resolveImageUrlForPdf(app.photo),
    ]);
    const croppedPhotoUrl = rawPhotoUrl ? await cropPhotoToCoverDataUrl(rawPhotoUrl, 284, 350) : '';

    wrapper.innerHTML = `
      <div style="width: 856px; height: 540px; background: #ffffff; position: relative; overflow: hidden; box-sizing: border-box; font-family: 'Yantramanav', 'Noto Sans Devanagari', sans-serif;">
        <div style="background: linear-gradient(135deg, #09243f, #1e3a8a); color: white; padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #d4af37;">
          <div style="display: flex; align-items: center; gap: 10px;">
            ${
              sharpLogoUrl
                ? `<div style="width: 44px; height: 44px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid #d4af37; overflow: hidden;">
                     <img src="${sharpLogoUrl}" style="width: 100%; height: 100%; object-fit: contain;" />
                   </div>`
                : ''
            }
            <div>
              <div style="font-size: 13.5px; font-weight: 800; letter-spacing: 0.3px;">महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ</div>
              <div style="font-size: 10px; font-weight: 700; color: #fde047;">अधिकृत ओळखपत्र (Digital ID Card) - 2026</div>
            </div>
          </div>
          <div style="text-align: right; font-size: 11px; font-weight: 800; background: rgba(255,255,255,0.15); padding: 4px 10px; border-radius: 20px; border: 1px solid #d4af37;">
            सदस्य क्र.: ${escapeCardHtml(memberNo)}
          </div>
        </div>
        <div style="padding: 22px 28px; display: flex; gap: 24px; align-items: center; position: relative; height: calc(540px - 72px);">
          <div style="width: 142px; height: 175px; border-radius: 10px; border: 3px solid #d4af37; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.15); background: #f8fafc; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
            ${
              croppedPhotoUrl
                ? `<img src="${croppedPhotoUrl}" style="width: 100%; height: 100%; object-fit: cover;" />`
                : `<span style="font-size: 13px; color: #94a3b8; font-weight: 700;">फोटो</span>`
            }
          </div>
          <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
            <div style="font-size: 22px; font-weight: 900; color: #0f2b48; line-height: 1.2;">
              ${escapeCardHtml(app.salutation || '')} ${escapeCardHtml(app.fullName)}
            </div>
            <div style="font-size: 14.5px; font-weight: 700; color: #334155; line-height: 1.4;">
              <div>पद: ${escapeCardHtml(cadre)}</div>
              <div>कार्यक्षेत्र: ${escapeCardHtml(areaText)}</div>
              <div>मोबाईल: ${escapeCardHtml(phoneText)}</div>
            </div>
          </div>
          <div style="width: 120px; height: 120px; background: white; border: 1px solid #cbd5e1; padding: 4px; display: flex; align-items: center; justify-content: center;">
            ${
              qrUrl
                ? `<img src="${qrUrl}" style="width: 100%; height: 100%; object-fit: contain;" />`
                : ''
            }
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(wrapper);
    try {
      await ensureAllImagesInlineDataUrls(wrapper);
      await waitForFontsAndImages(wrapper);
      const canvas = await html2canvas(wrapper.firstElementChild as HTMLElement, {
        scale: 3,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      if (i > 0) {
        pdf.addPage([85.6, 54], 'landscape');
      }
      pdf.addImage(imgData, 'JPEG', 0, 0, 85.6, 54, undefined, 'SLOW');
    } finally {
      document.body.removeChild(wrapper);
    }
  }

  const cleanDist = districtName.replace(/\s+/g, '_');
  pdf.save(`जिल्हा_${cleanDist}_सर्व_सदस्य_आयकार्ड.pdf`);
}


/**
 * 5. Organization Status Matrix A4 Black & White PDF (संघटना सद्यस्थिती अहवाल)
 * Clean monochrome table with zero gradients, zero star emojis, zero promotional footers
 */
export async function generateOrganizationStatusPdf(
  stats: Array<{
    district: string;
    stateRep: number;
    divRep: number;
    distOfficial: number;
    talukaOfficial: number;
    officialsTotal?: number;
    members: number;
    rowTotal?: number;
  }>,
  onProgress?: (s: string) => void
): Promise<void> {
  const totals = stats.reduce(
    (acc, cur) => {
      const offTot = cur.officialsTotal ?? (cur.stateRep + cur.divRep + cur.distOfficial + cur.talukaOfficial);
      const rowTot = cur.rowTotal ?? (offTot + cur.members);
      return {
        stateRep: acc.stateRep + cur.stateRep,
        divRep: acc.divRep + cur.divRep,
        distOfficial: acc.distOfficial + cur.distOfficial,
        talukaOfficial: acc.talukaOfficial + cur.talukaOfficial,
        officialsTotal: acc.officialsTotal + offTot,
        members: acc.members + cur.members,
        grandTotal: acc.grandTotal + rowTot,
      };
    },
    { stateRep: 0, divRep: 0, distOfficial: 0, talukaOfficial: 0, officialsTotal: 0, members: 0, grandTotal: 0 }
  );

  const columns: ReportColumn[] = [
    { header: 'अनु.', width: '34px', align: 'center' },
    { header: 'जिल्ह्याचे नाव', width: '156px', align: 'left' },
    { header: 'राज्य प्रतिनिधी', flex: 1, align: 'center' },
    { header: 'विभागीय प्रतिनिधी', flex: 1, align: 'center' },
    { header: 'जिल्हा पदाधिकारी', flex: 1, align: 'center' },
    { header: 'तालुका पदाधिकारी', flex: 1, align: 'center' },
    { header: 'एकूण पदाधिकारी', flex: 1.05, align: 'center' },
    { header: 'सदस्य (नोंदणी)', flex: 1, align: 'center' },
    { header: 'एकूण बेरीज', flex: 1.05, align: 'center' },
  ];

  const rowsCells = stats.map((st, idx) => {
    const offTot = st.officialsTotal ?? (st.stateRep + st.divRep + st.distOfficial + st.talukaOfficial);
    const rSum = st.rowTotal ?? (offTot + st.members);
    return [
      { text: String(idx + 1), bold: true },
      { text: st.district, bold: true },
      { text: toEnglishDigits(st.stateRep) },
      { text: toEnglishDigits(st.divRep) },
      { text: toEnglishDigits(st.distOfficial) },
      { text: toEnglishDigits(st.talukaOfficial) },
      { text: toEnglishDigits(offTot), bold: true },
      { text: toEnglishDigits(st.members) },
      { text: toEnglishDigits(rSum), bold: true },
    ];
  });

  const summaryCells = [
    { text: '-', bold: true },
    { text: 'सर्व बेरीज (एकूण)', bold: true },
    { text: toEnglishDigits(totals.stateRep), bold: true },
    { text: toEnglishDigits(totals.divRep), bold: true },
    { text: toEnglishDigits(totals.distOfficial), bold: true },
    { text: toEnglishDigits(totals.talukaOfficial), bold: true },
    { text: toEnglishDigits(totals.officialsTotal), bold: true },
    { text: toEnglishDigits(totals.members), bold: true },
    { text: toEnglishDigits(totals.grandTotal), bold: true },
  ];

  await renderStandardPaginatedTablePdf({
    reportTitle: `संघटना सद्यस्थिती अहवाल (${toEnglishDigits(stats.length)} जिल्हे)`,
    leftMeta: `एकूण पदाधिकारी व सभासद: ${toEnglishDigits(totals.grandTotal)}`,
    rightMeta: `दिनांक: ${getTodayFormattedDate()}`,
    columns,
    rowsCells,
    summaryCells,
    dense: true,
    fileName: 'संघटना_सद्यस्थिती_अहवाल_महाराष्ट्र.pdf',
    onProgress,
  });
}

/**
 * 6. District Presidents List PDF (जिल्हाध्यक्ष यादी)
 * Standard B&W institutional A4 report with dynamic multi-page overflow handling
 */
export async function generateDistrictPresidentsPdf(
  list: Array<{
    district: string;
    name: string;
    cadre: string;
    post: string;
    mobile?: string;
  }>,
  onProgress?: (s: string) => void
): Promise<void> {
  const columns: ReportColumn[] = [
    { header: 'अनु.', width: '42px', align: 'center' },
    { header: 'जिल्हा', width: '124px', align: 'left' },
    { header: 'पदाधिकाऱ्याचे नाव', flex: 1.25, align: 'left' },
    { header: 'सध्याचे पद व कार्यक्षेत्र', flex: 1.15, align: 'left' },
    { header: 'संघटनेतील पद', width: '126px', align: 'left' },
  ];

  const rowsCells = list.map((item, idx) => [
    { text: String(idx + 1), bold: true },
    { text: item.district, bold: true },
    { text: item.name, bold: true },
    { text: normalizeCadreInText(item.cadre, '-') },
    { text: item.post, bold: true },
  ]);

  await renderStandardPaginatedTablePdf({
    reportTitle: 'महाराष्ट्र राज्य सर्व जिल्हाध्यक्ष यादी',
    leftMeta: `एकूण जिल्हाध्यक्ष: ${toEnglishDigits(list.length)}`,
    rightMeta: `दिनांक: ${getTodayFormattedDate()}`,
    columns,
    rowsCells,
    fileName: 'सर्व_जिल्हाध्यक्ष_यादी.pdf',
    onProgress,
  });
}

/**
 * 7. Taluka Presidents List PDF (तालुका अध्यक्ष यादी)
 * Standard B&W institutional A4 report packed densely without blank bottom gaps
 */
export async function generateTalukaPresidentsPdf(
  list: Array<{
    district: string;
    taluka?: string;
    name: string;
    cadre: string;
    post: string;
    mobile?: string;
  }>,
  onProgress?: (s: string) => void
): Promise<void> {
  const columns: ReportColumn[] = [
    { header: 'अनु.', width: '42px', align: 'center' },
    { header: 'जिल्हा व तालुका', width: '146px', align: 'left' },
    { header: 'पदाधिकाऱ्याचे नाव', flex: 1.25, align: 'left' },
    { header: 'सध्याचे पद व कार्यक्षेत्र', flex: 1.15, align: 'left' },
    { header: 'संघटनेतील पद', width: '120px', align: 'left' },
  ];

  const rowsCells = list.map((item, idx) => [
    { text: String(idx + 1), bold: true },
    { text: `${item.district}${item.taluka ? ` (${item.taluka})` : ''}`, bold: true },
    { text: item.name, bold: true },
    { text: normalizeCadreInText(item.cadre, '-') },
    { text: item.post, bold: true },
  ]);

  await renderStandardPaginatedTablePdf({
    reportTitle: 'महाराष्ट्र राज्य तालुका अध्यक्ष यादी',
    leftMeta: `एकूण तालुका अध्यक्ष: ${toEnglishDigits(list.length)}`,
    rightMeta: `दिनांक: ${getTodayFormattedDate()}`,
    columns,
    rowsCells,
    fileName: 'सर्व_तालुका_अध्यक्ष_यादी.pdf',
    onProgress,
  });
}

/**
 * 8. Registered Approved Members List PDF (नोंदणीकृत सदस्य यादी)
 * Standard B&W institutional A4 report with proper multi-page pagination
 */
export async function generateRegisteredMembersPdf(
  list: MembershipApplication[],
  onProgress?: (s: string) => void
): Promise<void> {
  const columns: ReportColumn[] = [
    { header: 'अनु.', width: '42px', align: 'center' },
    { header: 'सदस्य क्रमांक', width: '136px', align: 'center' },
    { header: 'संपूर्ण नाव', flex: 1.3, align: 'left' },
    { header: 'सध्याचे पद / संवर्ग', flex: 1.05, align: 'left' },
    { header: 'केंद्र, तालुका व जिल्हा', width: '190px', align: 'left' },
  ];

  const rowsCells = list.map((m, idx) => {
    const place =
      [
        m.centerName ? `केंद्र: ${m.centerName}` : '',
        m.taluka ? `ता. ${m.taluka}` : '',
        m.district || '',
      ]
        .filter(Boolean)
        .join(', ') || '-';
    return [
      { text: String(idx + 1), bold: true },
      { text: m.memberNumber || '-', bold: true },
      { text: `${m.salutation || ''} ${m.fullName || ''}`.trim(), bold: true },
      { text: normalizeOfficialCadre(m.professional, '-') },
      { text: place },
    ];
  });

  await renderStandardPaginatedTablePdf({
    reportTitle: 'अधिकृत नोंदणीकृत आजीवन सदस्य यादी',
    leftMeta: `एकूण नोंदणीकृत सदस्य: ${toEnglishDigits(list.length)}`,
    rightMeta: `दिनांक: ${getTodayFormattedDate()}`,
    columns,
    rowsCells,
    fileName: 'नोंदणीकृत_सदस्य_यादी.pdf',
    onProgress,
  });
}


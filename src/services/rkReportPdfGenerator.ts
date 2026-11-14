import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { REPORT_PAGES_PART_1, ReportPageData } from './rkReportChaptersPart1';
import { REPORT_PAGES_PART_2 } from './rkReportChaptersPart2';

const DEVANAGARI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

function toMarathiDigits(num: number): string {
  return String(num)
    .split('')
    .map((ch) => DEVANAGARI_DIGITS[Number(ch)] ?? ch)
    .join('');
}

function buildA4PageMarkup(page: ReportPageData, pageNumber: number, totalPages: number): string {
  return `
    <div style="width: 794px; height: 1122px; background: #ffffff; color: #0f172a; font-family: 'Noto Sans Devanagari', Arial, sans-serif; padding: 26px 32px 22px 32px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;">
      <div>
        <!-- Top Running Header -->
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2.5px solid #df6b16; padding-bottom: 8px; margin-bottom: 12px;">
          <div>
            <div style="font-size: 10px; font-weight: 800; color: #df6b16; letter-spacing: 0.4px; text-transform: uppercase;">${page.chapter}</div>
            <div style="font-size: 11px; font-weight: 700; color: #193568;">महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ (mahasangh.in)</div>
          </div>
          <div style="background: #0b1e33; color: #fde047; font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 6px;">
            डेव्हलपर मास्टर मॅन्युअल
          </div>
        </div>

        <!-- Page Title Banner -->
        <div style="background: #f1f5f9; border-left: 5px solid #193568; border-radius: 6px; padding: 9px 13px; margin-bottom: 12px;">
          <h1 style="font-size: 16.5px; line-height: 1.35; font-weight: 900; color: #0b1e33; margin: 0 0 3px 0;">${page.title}</h1>
          ${
            page.subtitle
              ? `<p style="font-size: 11px; line-height: 1.45; color: #475569; margin: 0; font-weight: 600;">${page.subtitle}</p>`
              : ''
          }
        </div>

        <!-- Page Body Content -->
        <div style="font-size: 11.5px; line-height: 1.58; color: #1e293b;">
          ${page.bodyHtml}
        </div>
      </div>

      <!-- Bottom Running Footer -->
      <div style="border-top: 1px solid #cbd5e1; padding-top: 7px; display: flex; align-items: center; justify-content: space-between; font-size: 10px; color: #64748b;">
        <div>गोपनीय तांत्रिक दस्तऐवज • भविष्यातील प्रोजेक्टसाठी संपूर्ण मार्गदर्शक</div>
        <div style="font-weight: 800; color: #193568;">पान ${toMarathiDigits(pageNumber)} / ${toMarathiDigits(totalPages)}</div>
      </div>
    </div>
  `;
}

export async function generateDeveloperReportPdf(
  onProgress?: (currentPage: number, totalPages: number) => void
): Promise<void> {
  const allPages: ReportPageData[] = [...REPORT_PAGES_PART_1, ...REPORT_PAGES_PART_2];
  const totalPages = allPages.length;

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.width = '794px';
  container.style.height = '1122px';
  container.style.backgroundColor = '#ffffff';
  container.style.overflow = 'hidden';
  container.style.zIndex = '-1';
  document.body.appendChild(container);

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < totalPages; i++) {
      onProgress?.(i + 1, totalPages);
      container.innerHTML = buildA4PageMarkup(allPages[i], i + 1, totalPages);

      const pageElement = container.firstElementChild as HTMLElement;
      const canvas = await html2canvas(pageElement, {
        scale: 1.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: 794,
        height: 1122,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.86);
      if (i > 0) {
        pdf.addPage();
      }
      pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');

      // Yield briefly to keep UI responsive across 47 pages
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    pdf.save('Mahasangh_Technical_Developer_Report.pdf');
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}

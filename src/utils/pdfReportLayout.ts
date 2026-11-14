import { OfficialMember, formatAppointedPostWithTaluka } from '../data/rkMaharashtraData';
import { MembershipApplication } from '../data/mahasanghData';
import { toEnglishDigits } from './formatters';

export const A4_PX_WIDTH = 794;
export const A4_PX_HEIGHT = 1123;
export const A4_MM_WIDTH = 210;
export const A4_MM_HEIGHT = 297;

export const REPORT_FONT_FAMILY = "'Noto Sans Devanagari', sans-serif";

export interface ReportColumn {
  header: string;
  width?: string;
  flex?: number;
  align?: 'left' | 'center' | 'right';
}

export interface ReportTablePageConfig {
  reportTitle: string;
  orgTitle?: string;
  leftMeta: string;
  rightMeta: string;
  columns: ReportColumn[];
  rowsHtml: string[];
  /** Optional custom letterhead image URL printed only on Page 1 */
  letterheadUrl?: string;
  /** Optional signature block HTML rendered after table on the final page */
  signatureHtml?: string;
  /** Optional Grand Total / Summary row appended immediately after body rows on final page */
  summaryRowHtml?: string;
  /** Tighter cell padding for dense 36-row single-sheet matrix */
  dense?: boolean;
}

export function escapePdfHtml(value: string | number | undefined | null): string {
  const str = String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Pure cell renderer with uniform Devanagari font, crisp neutral borders,
 * and extra bottom padding (padding-bottom >= padding-top + 2px) so
 * Devanagari vowel signs (ु, ू, ृ, ्) in names like "पुणे" never touch bottom lines.
 */
export function buildCellHtml(
  content: string,
  col: ReportColumn,
  options: { isHeader?: boolean; isLastCol?: boolean; dense?: boolean; bold?: boolean } = {}
): string {
  const { isHeader = false, isLastCol = false, dense = false, bold = false } = options;
  const align = col.align || 'left';
  const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';

  const sizing = col.width
    ? `width: ${col.width}; flex-shrink: 0;`
    : `flex: ${col.flex ?? 1}; min-width: 0;`;

  const borderRight = isLastCol
    ? ''
    : `border-right: 1px solid ${isHeader ? '#475569' : '#cbd5e1'};`;

  const padding = dense
    ? isHeader
      ? '4.5px 4px 6.5px 4px'
      : '2.5px 4px 4.5px 4px'
    : isHeader
      ? '7px 7px 9px 7px'
      : '5.5px 7px 8.5px 7px';

  const fontSize = dense ? (isHeader ? '8pt' : '8.2pt') : isHeader ? '9.2pt' : '9pt';
  const lineHeight = dense ? '1.38' : '1.45';
  const fontWeight = isHeader ? '700' : bold ? '700' : '500';

  return `<div style="${sizing} ${borderRight} padding: ${padding}; display: flex; align-items: center; justify-content: ${justify}; text-align: ${align}; font-family: ${REPORT_FONT_FAMILY}; font-variant-numeric: tabular-nums; font-size: ${fontSize}; font-weight: ${fontWeight}; line-height: ${lineHeight}; color: #0f172a; box-sizing: border-box; white-space: normal; overflow-wrap: break-word; word-break: keep-all;">${content}</div>`;
}

export function buildTableRowHtml(
  cells: Array<{ text: string; bold?: boolean }>,
  columns: ReportColumn[],
  options: { rowIndex?: number; dense?: boolean; isSummary?: boolean } = {}
): string {
  const { rowIndex = 0, dense = false, isSummary = false } = options;
  const bg = isSummary ? '#e2e8f0' : rowIndex % 2 === 1 ? '#f8fafc' : '#ffffff';
  const borderStyle = isSummary
    ? 'border-top: 1.5px solid #0f172a;'
    : 'border-bottom: 1px solid #cbd5e1;';

  const cellsHtml = columns
    .map((col, idx) =>
      buildCellHtml(escapePdfHtml(cells[idx]?.text ?? ''), col, {
        isLastCol: idx === columns.length - 1,
        dense,
        bold: isSummary || Boolean(cells[idx]?.bold),
      })
    )
    .join('');

  return `<div class="pdf-measure-row" style="display: flex; align-items: stretch; background: ${bg}; ${borderStyle} box-sizing: border-box;">${cellsHtml}</div>`;
}

export function buildTableHeaderHtml(columns: ReportColumn[], dense = false): string {
  const cellsHtml = columns
    .map((col, idx) =>
      buildCellHtml(escapePdfHtml(col.header), col, {
        isHeader: true,
        isLastCol: idx === columns.length - 1,
        dense,
      })
    )
    .join('');

  return `<div style="display: flex; align-items: stretch; background: #e2e8f0; border-bottom: 1.5px solid #0f172a; box-sizing: border-box;">${cellsHtml}</div>`;
}

export function buildReportPageHeaderHtml(params: {
  orgTitle: string;
  reportTitle: string;
  leftMeta: string;
  rightMeta: string;
  pageNumber: number;
  totalPages: number;
  letterheadUrl?: string;
}): string {
  const { orgTitle, reportTitle, leftMeta, rightMeta, pageNumber, totalPages, letterheadUrl } = params;
  const isFirst = pageNumber === 1;
  const pageLabel = totalPages > 1 ? `पृष्ठ: ${toEnglishDigits(pageNumber)} / ${toEnglishDigits(totalPages)}` : '';

  const topBanner =
    isFirst && letterheadUrl
      ? `<div style="width: 100%; text-align: center; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1.5px solid #0f172a;">
           <img src="${letterheadUrl}" alt="लेटरपॅड" style="width: 100%; height: auto; max-height: 138px; object-fit: contain; display: block; margin: 0 auto;" />
         </div>`
      : `<div style="text-align: center; border-bottom: 1.5px solid #0f172a; padding-bottom: 6px; margin-bottom: 7px;">
           <div style="font-size: 9.5pt; font-weight: 700; color: #334155; line-height: 1.35;">${escapePdfHtml(orgTitle)}</div>
           <div style="font-size: 13.5pt; font-weight: 800; color: #0f172a; line-height: 1.35; margin-top: 2px;">${escapePdfHtml(reportTitle)}</div>
         </div>`;

  const subTitleRow =
    isFirst && letterheadUrl
      ? `<div style="text-align: center; font-size: 12pt; font-weight: 800; color: #0f172a; padding-bottom: 4px;">${escapePdfHtml(reportTitle)}</div>`
      : '';

  const metaItems = [
    `<span>${escapePdfHtml(leftMeta)}</span>`,
    `<span style="display: flex; gap: 14px; align-items: center;">${pageLabel ? `<span>${escapePdfHtml(pageLabel)}</span>` : ''}<span>${escapePdfHtml(rightMeta)}</span></span>`,
  ].join('');

  return `
    ${topBanner}
    ${subTitleRow}
    <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #94a3b8; padding: 5px 10px 6px 10px; margin-bottom: 8px; font-size: 9.2pt; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; line-height: 1.4;">
      ${metaItems}
    </div>
  `;
}

export function buildSignatureBlockHtml(signUrl: string): string {
  return `
    <div style="display: flex; justify-content: flex-end; margin-top: 14px;">
      <div style="text-align: center; min-width: 220px;">
        <img src="${signUrl}" alt="स्वाक्षरी" style="height: 44px; max-width: 165px; object-fit: contain; display: block; margin: 0 auto 2px auto;" />
        <div style="font-size: 10.5pt; font-weight: 700; color: #0f172a; line-height: 1.3;">( श्री. राजेंद्र शिवाजी खैरनार )</div>
        <div style="font-size: 9pt; font-weight: 600; color: #334155; line-height: 1.3;">संस्थापक राज्याध्यक्ष</div>
        <div style="font-size: 8.5pt; font-weight: 500; color: #475569; line-height: 1.3;">महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ</div>
      </div>
    </div>
  `;
}

/**
 * Pure height-based A4 page packer.
 * Distributes rows across pages using exact measured heights so NO page has blank overflow
 * or squished content, and ensures signature/summary blocks never orphan or clip.
 */
export function packMeasuredRowsIntoPages(params: {
  rowHeights: number[];
  firstPageAvailableHeight: number;
  continuationPageAvailableHeight: number;
  trailingReserveHeight?: number;
}): number[][] {
  const {
    rowHeights,
    firstPageAvailableHeight,
    continuationPageAvailableHeight,
    trailingReserveHeight = 0,
  } = params;

  if (rowHeights.length === 0) return [[]];

  const pages: number[][] = [];
  let cursor = 0;

  while (cursor < rowHeights.length) {
    const isFirstPage = pages.length === 0;
    const cap = isFirstPage ? firstPageAvailableHeight : continuationPageAvailableHeight;
    let used = 0;
    const pageIndices: number[] = [];

    while (cursor < rowHeights.length) {
      const h = Math.max(18, rowHeights[cursor] || 30);
      if (pageIndices.length > 0 && used + h > cap) {
        break;
      }
      pageIndices.push(cursor);
      used += h;
      cursor++;
    }

    pages.push(pageIndices);
  }

  // Ensure last page has room for signature/summary block without clipping
  if (trailingReserveHeight > 0 && pages.length > 0) {
    const lastIdx = pages.length - 1;
    const lastCap = lastIdx === 0 ? firstPageAvailableHeight : continuationPageAvailableHeight;
    const lastUsed = pages[lastIdx].reduce((sum, rIdx) => sum + Math.max(18, rowHeights[rIdx] || 30), 0);

    if (lastUsed + trailingReserveHeight > lastCap) {
      const spillPage: number[] = [];
      let currentLastUsed = lastUsed;

      // Move enough trailing rows to next page so neither page overflows and last page isn't lonely
      while (pages[lastIdx].length > 2 && currentLastUsed + trailingReserveHeight > lastCap) {
        const moved = pages[lastIdx].pop()!;
        spillPage.unshift(moved);
        currentLastUsed -= Math.max(18, rowHeights[moved] || 30);
      }

      if (spillPage.length > 0) {
        pages.push(spillPage);
      } else if (lastUsed + trailingReserveHeight > lastCap && pages[lastIdx].length > 1) {
        const moved = pages[lastIdx].pop()!;
        pages.push([moved]);
      }
    }
  }

  return pages;
}

export function buildSingleAppointmentLetterHtml(params: {
  member: OfficialMember;
  serialPadded: string;
  todayStr: string;
  hedingUrl: string;
  signUrl: string;
}): string {
  const { member, serialPadded, todayStr, hedingUrl, signUrl } = params;
  const fullName = `${member.salutation} ${member.firstName} ${member.middleName ? member.middleName + ' ' : ''}${member.lastName}`;
  const cadre = member.currentCadre || 'केंद्रप्रमुख';
  const wpDetails = member.workingPlace || '';
  const displayPost = formatAppointedPostWithTaluka(member.appointedPost, member.taluka);

  return `
    <div style="width: ${A4_PX_WIDTH}px; height: ${A4_PX_HEIGHT}px; padding: 24px 36px 26px 36px; background: #ffffff; color: #0f172a; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; font-family: ${REPORT_FONT_FAMILY}; font-variant-numeric: tabular-nums;">
      <div>
        <!-- स्वच्छ अधिकृत लेटरपॅड -->
        <div style="border-bottom: 1.5px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; text-align: center;">
          <img src="${hedingUrl}" alt="लेटरपॅड" style="width: 100%; height: auto; max-height: 162px; object-fit: contain; display: block; margin: 0 auto;" />
        </div>

        <!-- जावक क्र. व दिनांक -->
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10.5pt; font-weight: 700; padding-bottom: 6px; border-bottom: 1px solid #94a3b8; margin-bottom: 14px; color: #0f172a;">
          <div>नियुक्ती पत्र क्र.: <span>MS/2026/${escapePdfHtml(serialPadded)}</span></div>
          <div>दिनांक: <span>${escapePdfHtml(todayStr)}</span></div>
        </div>

        <!-- स्टँडर्ड शीर्षक -->
        <div style="text-align: center; margin-bottom: 14px;">
          <span style="display: inline-block; background: #0f172a; color: #ffffff; padding: 6px 28px 8px 28px; font-size: 13pt; font-weight: 700; border-radius: 4px; line-height: 1.35;">
            ॥ अधिकृत नियुक्ती पत्र ॥
          </span>
        </div>

        <!-- प्रति -->
        <div style="background: #f8fafc; border-left: 3px solid #0f172a; padding: 10px 14px; margin-bottom: 12px; font-size: 11pt; line-height: 1.55;">
          <div style="font-weight: 600; color: #475569;">प्रति,</div>
          <div style="font-size: 14pt; font-weight: 800; color: #0f172a; margin-top: 2px;">मा. ${escapePdfHtml(fullName)}</div>
          <div style="font-size: 10pt; color: #334155; margin-top: 2px;">(${escapePdfHtml(cadre)}${wpDetails ? ', ' + escapePdfHtml(wpDetails) : ''}, जिल्हा - ${escapePdfHtml(member.district)})</div>
        </div>

        <!-- विषय -->
        <div style="font-size: 11.5pt; font-weight: 700; color: #0f172a; margin-bottom: 10px;">
          विषय: महासंघाच्या जिल्हा कार्यकारिणीवर नियुक्तीबाबत...
        </div>

        <!-- मुख्य मजकूर -->
        <div style="font-size: 11pt; font-weight: 400; line-height: 1.72; text-align: justify; color: #0f172a;">
          <p style="font-weight: 700; margin: 0 0 6px 0;">सस्नेह नमस्कार,</p>
          <p style="margin: 0 0 8px 0; text-indent: 24px;">
            महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ हा राज्यातील शिक्षण क्षेत्राच्या रुपांतरणासाठी झटणाऱ्या केंद्रप्रमुख व विस्तार अधिकारी संघटनांच्या हक्कासाठी, व्यावसायिक स्वाभिमानासाठी आणि गुणवत्तापूर्ण शिक्षणासाठी कटिबद्ध असलेली अग्रगण्य संघटना आहे. महासंघाच्या सर्व सदस्यांच्या उत्स्फूर्त प्रतिसादानुसार आणि जिल्हा सभेत निवड प्रक्रियेत लोकशाहीच्या मूल्यांचा आदर करत सर्वानुमते हा निर्णय घेण्यात आला आहे.
          </p>
          <p style="margin: 0 0 8px 0; text-indent: 24px;">
            आपला प्रदीर्घ आणि निष्कलंक सेवाप्रवास, शाळा-शिक्षणाविषयी असलेली तळमळ, उत्कृष्ट प्रशासकीय समन्वय आणि संघटनकौशल्यावरील आपली अढळ निष्ठा आम्ही अत्यंत जवळून अनुभवली आहे. सहकाऱ्यांच्या अडीअडचणीत धावून जाण्याची आपली वृत्ती आणि नेतृत्वगुणांची सार्थ दखल घेत, सर्व सदस्यांच्या बहुमताने व राज्य कार्यकारिणीच्या निर्णयानुसार आपणास—
          </p>
        </div>

        <!-- अधिकृत पद चौकट (स्टार इमोजी व ग्रेडियंट शिवाय) -->
        <div style="padding: 12px 16px; text-align: center; margin: 12px 0; border: 1.5px solid #0f172a; background: #f8fafc; border-radius: 4px;">
          <div style="font-size: 11pt; color: #334155; font-weight: 600;">
            महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाच्या <strong style="color: #0f172a;">${escapePdfHtml(member.district)}</strong> जिल्हा कार्यकारिणीवर
          </div>
          <div style="font-size: 17pt; font-weight: 800; color: #0f172a; margin: 6px 0; line-height: 1.35;">
            « ${escapePdfHtml(displayPost)} »
          </div>
          <div style="font-size: 10.5pt; color: #334155; font-weight: 600;">
            या सन्मानाच्या व जबाबदारीच्या पदावर अधिकृत नियुक्ती करण्यात येत आहे.
          </div>
        </div>

        <!-- समारोप -->
        <div style="font-size: 11pt; font-weight: 400; line-height: 1.72; text-align: justify; color: #0f172a;">
          <p style="margin: 0; text-indent: 24px;">
            हे पद केवळ सन्मानाचे प्रतीक नसून महासंघाच्या पवित्र विचारांचे धोरण आहे. केंद्रप्रमुख व विस्तार अधिकारी संवर्गाचे न्याय्य प्रश्न सोडवणे, आत्मसन्मान जपणे आणि सर्व सहकाऱ्यांच्या पाठीशी खंबीरपणे उभे राहणे हीच आपली मुख्य जबाबदारी आहे. सर्व सदस्यांनी आपल्यावर दाखवलेला हा विश्वास आणि आपल्या दूरदर्शी नेतृत्वाखाली संघटनेची पताका निश्चितच अभिमानाने गगनभरारी घेईल, हा ठाम विश्वास आहे. या नियुक्तीबद्दल आपले मनःपूर्वक अभिनंदन व भावी वाटचालीस हार्दिक शुभेच्छा!
          </p>
        </div>
      </div>

      <!-- स्वाक्षरी -->
      <div style="display: flex; justify-content: flex-end; align-items: flex-end; padding-top: 10px; border-top: 1px solid #cbd5e1; margin-top: 8px;">
        <div style="text-align: center; min-width: 240px;">
          <img src="${signUrl}" alt="स्वाक्षरी" style="height: 48px; max-width: 175px; object-fit: contain; display: block; margin: 0 auto 2px auto;" />
          <div style="font-size: 11.5pt; font-weight: 700; color: #0f172a; line-height: 1.3;">( श्री. राजेंद्र शिवाजी खैरनार )</div>
          <div style="font-size: 9.5pt; font-weight: 600; color: #334155; line-height: 1.3;">
            संस्थापक राज्याध्यक्ष<br />महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ
          </div>
        </div>
      </div>
    </div>
  `;
}

export function buildSingleTablePageHtml(params: {
  orgTitle: string;
  reportTitle: string;
  leftMeta: string;
  rightMeta: string;
  pageNumber: number;
  totalPages: number;
  columns: ReportColumn[];
  pageRowsHtml: string[];
  letterheadUrl?: string;
  summaryRowHtml?: string;
  signatureHtml?: string;
  dense?: boolean;
}): string {
  const {
    orgTitle,
    reportTitle,
    leftMeta,
    rightMeta,
    pageNumber,
    totalPages,
    columns,
    pageRowsHtml,
    letterheadUrl,
    summaryRowHtml = '',
    signatureHtml = '',
    dense = false,
  } = params;

  const headerBlock = buildReportPageHeaderHtml({
    orgTitle,
    reportTitle,
    leftMeta,
    rightMeta,
    pageNumber,
    totalPages,
    letterheadUrl,
  });

  const thead = buildTableHeaderHtml(columns, dense);

  const normalizedRows =
    !summaryRowHtml && pageRowsHtml.length > 0
      ? pageRowsHtml.map((rowHtml, idx) =>
          idx === pageRowsHtml.length - 1
            ? rowHtml.replace('border-bottom: 1px solid #cbd5e1;', '')
            : rowHtml
        )
      : pageRowsHtml;

  return `
    <div style="width: ${A4_PX_WIDTH}px; height: ${A4_PX_HEIGHT}px; padding: 22px 26px 22px 26px; background: #ffffff; color: #0f172a; box-sizing: border-box; font-family: ${REPORT_FONT_FAMILY}; font-variant-numeric: tabular-nums; display: flex; flex-direction: column; justify-content: flex-start;">
      ${headerBlock}
      <div style="width: 100%; border: 1.5px solid #0f172a; background: #ffffff; box-sizing: border-box;">
        ${thead}
        ${normalizedRows.join('')}
        ${summaryRowHtml}
      </div>
      ${signatureHtml}
    </div>
  `;
}

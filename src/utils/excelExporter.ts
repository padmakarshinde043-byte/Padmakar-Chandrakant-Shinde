import XLSX from 'xlsx-js-style';
import { OfficialMember } from '../data/rkMaharashtraData';
import { MembershipApplication } from '../data/mahasanghData';
import { toEnglishDigits } from './formatters';

const THIN_BORDER = {
  top: { style: 'thin', color: { rgb: 'D0D5DD' } },
  bottom: { style: 'thin', color: { rgb: 'D0D5DD' } },
  left: { style: 'thin', color: { rgb: 'D0D5DD' } },
  right: { style: 'thin', color: { rgb: 'D0D5DD' } }
};

const DOUBLE_BOTTOM_BORDER = {
  top: { style: 'thin', color: { rgb: '0F172A' } },
  bottom: { style: 'double', color: { rgb: '0F172A' } },
  left: { style: 'thin', color: { rgb: '0F172A' } },
  right: { style: 'thin', color: { rgb: '0F172A' } }
};

/**
 * 1. District Executive Committee Excel Export
 */
export function exportDistrictExecutiveExcel(districtName: string, officials: OfficialMember[]) {
  const titleRow = [`महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ - अधिकृत कार्यकारिणी यादी`];
  const subRow = [`जिल्हा: ${districtName} | एकूण पदाधिकारी: ${officials.length} | दिनांक: ${new Date().toLocaleDateString('en-IN')}`];
  const headerRow = ['अ.क्र.', 'पदाधिकाऱ्याचे संपूर्ण नाव', 'सध्याचे पद व कार्यक्षेत्र', 'संघटनेतील बहाल पद', 'मोबाईल नंबर', 'तालुका'];

  const data: (string | number)[][] = [titleRow, subRow, [], headerRow];

  officials.forEach((m, idx) => {
    const fullName = `${m.salutation || ''} ${m.firstName} ${m.middleName || ''} ${m.lastName}`.trim();
    data.push([
      idx + 1,
      fullName,
      m.currentCadre || '-',
      m.appointedPost || '-',
      toEnglishDigits(m.mobile || '-'),
      m.taluka || '-'
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 7 },   // अ.क्र.
    { wch: 26 },  // नाव
    { wch: 24 },  // सध्याचे पद
    { wch: 22 },  // बहाल पद
    { wch: 15 },  // मोबाईल
    { wch: 16 }   // तालुका
  ];

  ws['!rows'] = [
    { hpt: 26 },
    { hpt: 18 },
    { hpt: 6 },
    { hpt: 32 }
  ];

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }
  ];

  // Title styling
  for (let c = 0; c <= 5; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[ref]) ws[ref] = { t: 's', v: '' };
    ws[ref].s = {
      font: { name: 'Calibri', sz: 13, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '193568' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    };
  }

  // Header styling
  for (let c = 0; c <= 5; c++) {
    const ref = XLSX.utils.encode_cell({ r: 3, c });
    if (ws[ref]) {
      ws[ref].s = {
        font: { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '193568' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: THIN_BORDER
      };
    }
  }

  // Data rows styling
  for (let r = 4; r < data.length; r++) {
    const isZebra = r % 2 === 1;
    const bg = isZebra ? 'F8FAFC' : 'FFFFFF';
    ws['!rows'].push({ hpt: 22 });

    for (let c = 0; c <= 5; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) continue;
      const isCenter = c === 0 || c === 4;
      ws[ref].s = {
        font: { name: 'Calibri', sz: 10, color: { rgb: '1E293B' }, bold: c === 1 || c === 3 },
        fill: { fgColor: { rgb: bg } },
        alignment: { horizontal: isCenter ? 'center' : 'left', vertical: 'center' },
        border: THIN_BORDER
      };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'जिल्हा कार्यकारिणी');
  XLSX.writeFile(wb, `जिल्हा_${districtName}_कार्यकारिणी_यादी.xlsx`);
}

/**
 * 2. All District Presidents Excel Export
 */
export function exportDistrictPresidentsExcel(list: Array<{ district: string; name: string; cadre: string; post: string; mobile: string }>) {
  const titleRow = ['महाराष्ट्र राज्य सर्व जिल्हाध्यक्ष अधिकृत यादी'];
  const subRow = [`एकूण जिल्हाध्यक्ष: ${list.length} | दिनांक: ${new Date().toLocaleDateString('en-IN')}`];
  const headerRow = ['अ.क्र.', 'जिल्हा', 'पदाधिकाऱ्याचे संपूर्ण नाव', 'सध्याचे पद व कार्यक्षेत्र', 'संघटनेतील पद', 'मोबाईल नंबर'];

  const data: (string | number)[][] = [titleRow, subRow, [], headerRow];

  list.forEach((item, idx) => {
    data.push([
      idx + 1,
      item.district,
      item.name,
      item.cadre,
      item.post,
      toEnglishDigits(item.mobile)
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 7 },
    { wch: 18 },
    { wch: 26 },
    { wch: 24 },
    { wch: 18 },
    { wch: 15 }
  ];

  ws['!rows'] = [{ hpt: 26 }, { hpt: 18 }, { hpt: 6 }, { hpt: 32 }];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }
  ];

  for (let c = 0; c <= 5; c++) {
    const r0 = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[r0]) ws[r0] = { t: 's', v: '' };
    ws[r0].s = {
      font: { name: 'Calibri', sz: 13, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '193568' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    };

    const r3 = XLSX.utils.encode_cell({ r: 3, c });
    if (ws[r3]) {
      ws[r3].s = {
        font: { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '193568' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: THIN_BORDER
      };
    }
  }

  for (let r = 4; r < data.length; r++) {
    const isZebra = r % 2 === 1;
    const bg = isZebra ? 'F8FAFC' : 'FFFFFF';
    ws['!rows'].push({ hpt: 22 });

    for (let c = 0; c <= 5; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) continue;
      const isCenter = c === 0 || c === 5;
      ws[ref].s = {
        font: { name: 'Calibri', sz: 10, color: { rgb: '1E293B' }, bold: c === 1 || c === 2 },
        fill: { fgColor: { rgb: bg } },
        alignment: { horizontal: isCenter ? 'center' : 'left', vertical: 'center' },
        border: THIN_BORDER
      };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'जिल्हाध्यक्ष यादी');
  XLSX.writeFile(wb, `महाराष्ट्र_राज्य_सर्व_जिल्हाध्यक्ष_यादी.xlsx`);
}

/**
 * 3. All Taluka Presidents Excel Export
 */
export function exportTalukaPresidentsExcel(list: Array<{ district: string; taluka?: string; name: string; cadre: string; post: string; mobile: string }>) {
  const titleRow = ['महाराष्ट्र राज्य सर्व तालुका अध्यक्ष अधिकृत यादी'];
  const subRow = [`एकूण तालुका अध्यक्ष: ${list.length} | दिनांक: ${new Date().toLocaleDateString('en-IN')}`];
  const headerRow = ['अ.क्र.', 'जिल्हा व तालुका', 'पदाधिकाऱ्याचे संपूर्ण नाव', 'सध्याचे पद व कार्यक्षेत्र', 'संघटनेतील पद', 'मोबाईल नंबर'];

  const data: (string | number)[][] = [titleRow, subRow, [], headerRow];

  list.forEach((item, idx) => {
    data.push([
      idx + 1,
      `${item.district}${item.taluka ? ` (${item.taluka})` : ''}`,
      item.name,
      item.cadre,
      item.post,
      toEnglishDigits(item.mobile)
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 7 },
    { wch: 22 },
    { wch: 26 },
    { wch: 24 },
    { wch: 18 },
    { wch: 15 }
  ];

  ws['!rows'] = [{ hpt: 26 }, { hpt: 18 }, { hpt: 6 }, { hpt: 32 }];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }
  ];

  for (let c = 0; c <= 5; c++) {
    const r0 = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[r0]) ws[r0] = { t: 's', v: '' };
    ws[r0].s = {
      font: { name: 'Calibri', sz: 13, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '193568' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    };

    const r3 = XLSX.utils.encode_cell({ r: 3, c });
    if (ws[r3]) {
      ws[r3].s = {
        font: { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '193568' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: THIN_BORDER
      };
    }
  }

  for (let r = 4; r < data.length; r++) {
    const isZebra = r % 2 === 1;
    const bg = isZebra ? 'F8FAFC' : 'FFFFFF';
    ws['!rows'].push({ hpt: 22 });

    for (let c = 0; c <= 5; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) continue;
      const isCenter = c === 0 || c === 5;
      ws[ref].s = {
        font: { name: 'Calibri', sz: 10, color: { rgb: '1E293B' }, bold: c === 1 || c === 2 },
        fill: { fgColor: { rgb: bg } },
        alignment: { horizontal: isCenter ? 'center' : 'left', vertical: 'center' },
        border: THIN_BORDER
      };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'तालुका अध्यक्ष यादी');
  XLSX.writeFile(wb, `महाराष्ट्र_राज्य_सर्व_तालुका_अध्यक्ष_यादी.xlsx`);
}

/**
 * 4. Registered Members Directory Excel Export
 */
export function exportRegisteredMembersExcel(list: MembershipApplication[]) {
  const titleRow = ['महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ - नोंदणीकृत सदस्य यादी'];
  const subRow = [`एकूण नोंदणीकृत सदस्य: ${list.length} | दिनांक: ${new Date().toLocaleDateString('en-IN')}`];
  const headerRow = ['अ.क्र.', 'सदस्य क्रमांक', 'संपूर्ण नाव', 'सध्याचे पद / संवर्ग', 'तालुका व जिल्हा', 'मोबाईल नंबर'];

  const data: (string | number)[][] = [titleRow, subRow, [], headerRow];

  list.forEach((m, idx) => {
    const place = m.taluka ? `${m.taluka}, ${m.district}` : m.district || '-';
    const fullName = `${m.salutation || ''} ${m.fullName || ''}`.trim();
    data.push([
      idx + 1,
      m.memberNumber || '-',
      fullName,
      m.professional || '-',
      place,
      toEnglishDigits(m.phone || '-')
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 7 },
    { wch: 16 },
    { wch: 26 },
    { wch: 24 },
    { wch: 22 },
    { wch: 15 }
  ];

  ws['!rows'] = [{ hpt: 26 }, { hpt: 18 }, { hpt: 6 }, { hpt: 32 }];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }
  ];

  for (let c = 0; c <= 5; c++) {
    const r0 = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[r0]) ws[r0] = { t: 's', v: '' };
    ws[r0].s = {
      font: { name: 'Calibri', sz: 13, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '193568' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    };

    const r3 = XLSX.utils.encode_cell({ r: 3, c });
    if (ws[r3]) {
      ws[r3].s = {
        font: { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '193568' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: THIN_BORDER
      };
    }
  }

  for (let r = 4; r < data.length; r++) {
    const isZebra = r % 2 === 1;
    const bg = isZebra ? 'F8FAFC' : 'FFFFFF';
    ws['!rows'].push({ hpt: 22 });

    for (let c = 0; c <= 5; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) continue;
      const isCenter = c === 0 || c === 1 || c === 5;
      ws[ref].s = {
        font: { name: 'Calibri', sz: 10, color: { rgb: '1E293B' }, bold: c === 1 || c === 2 },
        fill: { fgColor: { rgb: bg } },
        alignment: { horizontal: isCenter ? 'center' : 'left', vertical: 'center' },
        border: THIN_BORDER
      };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'नोंदणीकृत सदस्य');
  XLSX.writeFile(wb, `अधिकृत_नोंदणीकृत_सदस्य_यादी.xlsx`);
}

/**
 * 5. Statewide Appointments Master Registry Excel Export
 */
export function exportStatewideRegistryExcel(officials: OfficialMember[]) {
  const titleRow = ['महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ - राज्यस्तरीय नियुक्त्या व नोंदवही'];
  const subRow = [`एकूण नोंदणी: ${officials.length} | दिनांक: ${new Date().toLocaleDateString('en-IN')}`];
  const headerRow = ['अ.क्र.', 'नाव', 'जिल्हा', 'तालुका', 'बहाल पद', 'सध्याचे पद', 'मोबाईल'];

  const data: (string | number)[][] = [titleRow, subRow, [], headerRow];

  officials.forEach((m, idx) => {
    const fullName = `${m.salutation || ''} ${m.firstName} ${m.middleName || ''} ${m.lastName}`.trim();
    data.push([
      idx + 1,
      fullName,
      m.district || '-',
      m.taluka || '-',
      m.appointedPost || '-',
      m.currentCadre || '-',
      toEnglishDigits(m.mobile || '-')
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 7 },
    { wch: 26 },
    { wch: 18 },
    { wch: 16 },
    { wch: 22 },
    { wch: 22 },
    { wch: 15 }
  ];

  ws['!rows'] = [{ hpt: 26 }, { hpt: 18 }, { hpt: 6 }, { hpt: 32 }];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }
  ];

  for (let c = 0; c <= 6; c++) {
    const r0 = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[r0]) ws[r0] = { t: 's', v: '' };
    ws[r0].s = {
      font: { name: 'Calibri', sz: 13, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '193568' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    };

    const r3 = XLSX.utils.encode_cell({ r: 3, c });
    if (ws[r3]) {
      ws[r3].s = {
        font: { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '193568' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: THIN_BORDER
      };
    }
  }

  for (let r = 4; r < data.length; r++) {
    const isZebra = r % 2 === 1;
    const bg = isZebra ? 'F8FAFC' : 'FFFFFF';
    ws['!rows'].push({ hpt: 22 });

    for (let c = 0; c <= 6; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) continue;
      const isCenter = c === 0 || c === 6;
      ws[ref].s = {
        font: { name: 'Calibri', sz: 10, color: { rgb: '1E293B' }, bold: c === 1 || c === 4 },
        fill: { fgColor: { rgb: bg } },
        alignment: { horizontal: isCenter ? 'center' : 'left', vertical: 'center' },
        border: THIN_BORDER
      };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'राज्यस्तरीय नोंदवही');
  XLSX.writeFile(wb, `राज्यस्तरीय_नियुक्ती_नोंदवही.xlsx`);
}

/**
 * 6. 34 Districts Organizational Status Matrix Excel Export (A4 Landscape, Centered Numbers, Left Names)
 * - Row horizontal sum in 2 distinct parts:
 *     Part A: राज्य प्रतिनिधी + विभागीय प्रतिनिधी + जिल्हा पदाधिकारी + तालुका पदाधिकारी = एकूण पदाधिकारी
 *     Part B: गटशिक्षणाधिकारी + शिक्षण विस्तार अधिकारी + केंद्रप्रमुख = एकूण सदस्य
 *     Grand Total: एकूण पदाधिकारी + एकूण सदस्य = एकूण बेरीज
 * - Column vertical sums for ALL columns at the bottom (उभी बेरीज)
 * - Numbers centered horizontally & vertically; District names left-aligned
 * - Compact A4 landscape layout with wrapped headers
 */
export function exportOrganizationStatusExcel(stats: Array<any>) {
  const titleRow = ['महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ - संघटना सद्यस्थिती अहवाल (३४ जिल्हे)'];
  const subtitleRow = [`दिनांक: ${new Date().toLocaleDateString('en-IN')} | अधिकृत संघटनात्मक आकडेवारी (A4 लँडस्केप मांडणी)`];
  const blankRow: string[] = [];
  const headerRow = [
    'अ.क्र.',
    'जिल्ह्याचे नाव',
    'राज्य प्रतिनिधी',
    'विभागीय प्रतिनिधी',
    'जिल्हा पदाधिकारी',
    'तालुका पदाधिकारी',
    'एकूण पदाधिकारी',
    'गटशिक्षणाधिकारी',
    'शिक्षण विस्तार अधिकारी',
    'केंद्रप्रमुख',
    'एकूण सदस्य',
    'एकूण बेरीज'
  ];

  const data: (string | number)[][] = [
    titleRow,
    subtitleRow,
    blankRow,
    headerRow
  ];

  let tStateRep = 0;
  let tDivRep = 0;
  let tDistOff = 0;
  let tTalukaOff = 0;
  let tOffTot = 0;
  let tBeo = 0;
  let tExt = 0;
  let tHm = 0;
  let tMemTot = 0;
  let tGrandTot = 0;

  stats.forEach((st, idx) => {
    // 1. Part A (पदाधिकारी बेरीज): राज्य + विभागीय + जिल्हा + तालुका पदाधिकारी एकत्र
    const stateRep = Number(st.stateRep || 0);
    const divRep = Number(st.divRep || 0);
    const distOff = Number(st.distOfficial || 0);
    const talukaOff = Number(st.talukaOfficial || 0);
    const offTot = st.officialsTotal ?? (stateRep + divRep + distOff + talukaOff);

    // 2. Part B (सदस्य बेरीज): गटशिक्षणाधिकारी + शिक्षण विस्तार अधिकारी + केंद्रप्रमुख एकत्र
    const beo = Number(st.beoCount || 0);
    const ext = Number(st.extOfficerCount || 0);
    const hm = Number(st.headmasterCount ?? st.members ?? 0);
    const memTot = st.membersTotal ?? (beo + ext + hm);

    // 3. अंतिम बेरीज: सदस्य संख्ये एवढीच (पदाधिकारी आधीच सदस्य असल्याने वेगळी/दुबार बेरीज नको)
    const rowTot = st.rowTotal !== undefined ? Number(st.rowTotal) : memTot;

    // उभी बेरीज Accumulators
    tStateRep += stateRep;
    tDivRep += divRep;
    tDistOff += distOff;
    tTalukaOff += talukaOff;
    tOffTot += offTot;
    tBeo += beo;
    tExt += ext;
    tHm += hm;
    tMemTot += memTot;
    tGrandTot += rowTot;

    data.push([
      idx + 1,
      st.district,
      stateRep,
      divRep,
      distOff,
      talukaOff,
      offTot,
      beo,
      ext,
      hm,
      memTot,
      rowTot
    ]);
  });

  // Vertical Grand Total Row (सर्व रकान्यांची उभी बेरीज)
  const totalRow = [
    '',
    'सर्व बेरीज (Grand Total)',
    tStateRep,
    tDivRep,
    tDistOff,
    tTalukaOff,
    tOffTot,
    tBeo,
    tExt,
    tHm,
    tMemTot,
    tGrandTot
  ];
  data.push(totalRow);

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Compact professional column widths tailored for A4 Landscape printing
  ws['!cols'] = [
    { wch: 7 },   // 0: अ.क्र.
    { wch: 18 },  // 1: जिल्ह्याचे नाव
    { wch: 12 },  // 2: राज्य प्रतिनिधी
    { wch: 12 },  // 3: विभागीय प्रतिनिधी
    { wch: 13 },  // 4: जिल्हा पदाधिकारी
    { wch: 13 },  // 5: तालुका पदाधिकारी
    { wch: 14 },  // 6: एकूण पदाधिकारी (Part A)
    { wch: 13 },  // 7: गटशिक्षणाधिकारी
    { wch: 15 },  // 8: शिक्षण विस्तार अधिकारी
    { wch: 12 },  // 9: केंद्रप्रमुख
    { wch: 13 },  // 10: एकूण सदस्य (Part B)
    { wch: 14 }   // 11: एकूण बेरीज (Grand Total)
  ];

  // Row heights
  ws['!rows'] = [
    { hpt: 28 }, // Row 0: Title
    { hpt: 18 }, // Row 1: Subtitle
    { hpt: 8 },  // Row 2: Blank spacer
    { hpt: 38 }, // Row 3: Header with wrapText
  ];
  for (let i = 0; i < stats.length; i++) {
    ws['!rows'].push({ hpt: 22 }); // Data rows
  }
  ws['!rows'].push({ hpt: 26 }); // Grand Total row

  // Merges: Title banner across 12 cols, Subtitle across 12 cols, Total label across Col 0 & 1
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 11 } },
    { s: { r: data.length - 1, c: 0 }, e: { r: data.length - 1, c: 1 } }
  ];

  // A4 Landscape Print Configuration
  ws['!pageSetup'] = { orientation: 'landscape', paperSize: 9 };
  ws['!margins'] = { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 };

  // Styling Title Row (0)
  for (let c = 0; c <= 11; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[ref]) ws[ref] = { t: 's', v: '' };
    ws[ref].s = {
      font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '193568' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    };
  }

  // Styling Subtitle Row (1)
  for (let c = 0; c <= 11; c++) {
    const ref = XLSX.utils.encode_cell({ r: 1, c });
    if (!ws[ref]) ws[ref] = { t: 's', v: '' };
    ws[ref].s = {
      font: { name: 'Calibri', sz: 10, italic: true, color: { rgb: '475569' } },
      fill: { fgColor: { rgb: 'F1F5F9' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    };
  }

  // Styling Column Headers (Row 3, index 3)
  for (let c = 0; c <= 11; c++) {
    const ref = XLSX.utils.encode_cell({ r: 3, c });
    if (ws[ref]) {
      let bg = '193568'; // Institutional Navy
      if (c === 6) bg = '1E40AF'; // एकूण पदाधिकारी (distinct blue)
      else if (c === 10) bg = 'C2410C'; // एकूण सदस्य (distinct amber/orange)
      else if (c === 11) bg = '7C2D12'; // एकूण बेरीज (deep rust)

      ws[ref].s = {
        font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: bg } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: THIN_BORDER
      };
    }
  }

  // Styling Data Rows (Rows 4 to 4 + stats.length - 1)
  const startRow = 4;
  for (let i = 0; i < stats.length; i++) {
    const r = startRow + i;
    const isZebra = i % 2 === 1;
    const defaultBg = isZebra ? 'F8FAFC' : 'FFFFFF';

    for (let c = 0; c <= 11; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) continue;

      const isNameCol = c === 1;
      let cellBg = defaultBg;
      let cellFont = { name: 'Calibri', sz: 10, color: { rgb: '1E293B' }, bold: false };

      if (c === 1) {
        // नावे लेफ्ट ओरिएंटेशन (Left-aligned district name)
        cellFont = { name: 'Calibri', sz: 10, color: { rgb: '0F172A' }, bold: true };
      } else if (c === 6) {
        // एकूण पदाधिकारी (Part A summary highlight)
        cellBg = isZebra ? 'E0E7FF' : 'EFF6FF';
        cellFont = { name: 'Calibri', sz: 10, color: { rgb: '1E40AF' }, bold: true };
      } else if (c === 10) {
        // एकूण सदस्य (Part B summary highlight)
        cellBg = isZebra ? 'FFEDD5' : 'FFF7ED';
        cellFont = { name: 'Calibri', sz: 10, color: { rgb: 'C2410C' }, bold: true };
      } else if (c === 11) {
        // एकूण बेरीज (Grand Total highlight)
        cellBg = isZebra ? 'FEF08A' : 'FEF9C3';
        cellFont = { name: 'Calibri', sz: 10.5, color: { rgb: '0F172A' }, bold: true };
      }

      ws[ref].s = {
        font: cellFont,
        fill: { fgColor: { rgb: cellBg } },
        alignment: {
          horizontal: isNameCol ? 'left' : 'center', // अंक आडवे मध्यभागी, नावे लेफ्ट
          vertical: 'center'                          // अंक व नावे उभे मध्यभागी
        },
        border: THIN_BORDER
      };
    }
  }

  // Styling Bottom Grand Total Row (सर्व रकान्यांची उभी बेरीज)
  const lastR = startRow + stats.length;
  for (let c = 0; c <= 11; c++) {
    const ref = XLSX.utils.encode_cell({ r: lastR, c });
    if (!ws[ref]) continue;

    let cellBg = '0F172A'; // Dark slate
    let fontColor = 'FFFFFF';
    let fontSize = 10;

    if (c === 6) {
      cellBg = '1E3A8A';
      fontColor = '93C5FD';
      fontSize = 11;
    } else if (c === 10) {
      cellBg = '7C2D12';
      fontColor = 'FDBA74';
      fontSize = 11;
    } else if (c === 11) {
      cellBg = '0F172A';
      fontColor = 'FEF08A';
      fontSize = 11.5;
    }

    ws[ref].s = {
      font: { name: 'Calibri', sz: fontSize, bold: true, color: { rgb: fontColor } },
      fill: { fgColor: { rgb: cellBg } },
      alignment: {
        horizontal: c <= 1 ? 'left' : 'center', // Label left-aligned, all vertical sums centered
        vertical: 'center'
      },
      border: DOUBLE_BOTTOM_BORDER
    };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'संघटना सद्यस्थिती');
  XLSX.writeFile(wb, `संघटना_सद्यस्थिती_अहवाल.xlsx`);
}

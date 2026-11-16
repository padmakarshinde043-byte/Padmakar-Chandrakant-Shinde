import * as XLSX from 'xlsx';
import { OfficialMember } from '../data/rkMaharashtraData';
import { MembershipApplication } from '../data/mahasanghData';
import { toEnglishDigits } from './formatters';

export function exportDistrictExecutiveExcel(districtName: string, officials: OfficialMember[]) {
  const data: (string | number)[][] = [
    ['महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ - अधिकृत कार्यकारिणी यादी'],
    [`जिल्हा: ${districtName} | एकूण पदाधिकारी: ${officials.length} | दिनांक: ${new Date().toLocaleDateString('en-IN')}`],
    [],
    ['अ.क्र.', 'पदाधिकाऱ्याचे संपूर्ण नाव', 'सध्याचे पद व कार्यक्षेत्र', 'संघटनेतील बहाल पद', 'मोबाईल नंबर', 'तालुका']
  ];

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
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'जिल्हा कार्यकारिणी');
  XLSX.writeFile(wb, `जिल्हा_${districtName}_कार्यकारिणी_यादी.xlsx`);
}

export function exportDistrictPresidentsExcel(list: Array<{ district: string; name: string; cadre: string; post: string; mobile: string }>) {
  const data: (string | number)[][] = [
    ['महाराष्ट्र राज्य सर्व जिल्हाध्यक्ष अधिकृत यादी'],
    [`एकूण जिल्हाध्यक्ष: ${list.length} | दिनांक: ${new Date().toLocaleDateString('en-IN')}`],
    [],
    ['अ.क्र.', 'जिल्हा', 'पदाधिकाऱ्याचे संपूर्ण नाव', 'सध्याचे पद व कार्यक्षेत्र', 'संघटनेतील पद', 'मोबाईल नंबर']
  ];

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
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'जिल्हाध्यक्ष यादी');
  XLSX.writeFile(wb, `महाराष्ट्र_राज्य_सर्व_जिल्हाध्यक्ष_यादी.xlsx`);
}

export function exportTalukaPresidentsExcel(list: Array<{ district: string; taluka?: string; name: string; cadre: string; post: string; mobile: string }>) {
  const data: (string | number)[][] = [
    ['महाराष्ट्र राज्य सर्व तालुका अध्यक्ष अधिकृत यादी'],
    [`एकूण तालुका अध्यक्ष: ${list.length} | दिनांक: ${new Date().toLocaleDateString('en-IN')}`],
    [],
    ['अ.क्र.', 'जिल्हा व तालुका', 'पदाधिकाऱ्याचे संपूर्ण नाव', 'सध्याचे पद व कार्यक्षेत्र', 'संघटनेतील पद', 'मोबाईल नंबर']
  ];

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
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'तालुका अध्यक्ष यादी');
  XLSX.writeFile(wb, `महाराष्ट्र_राज्य_सर्व_तालुका_अध्यक्ष_यादी.xlsx`);
}

export function exportRegisteredMembersExcel(list: MembershipApplication[]) {
  const data: (string | number)[][] = [
    ['महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ - नोंदणीकृत सदस्य यादी'],
    [`एकूण नोंदणीकृत सदस्य: ${list.length} | दिनांक: ${new Date().toLocaleDateString('en-IN')}`],
    [],
    ['अ.क्र.', 'सदस्य क्रमांक', 'संपूर्ण नाव', 'सध्याचे पद / संवर्ग', 'तालुका व जिल्हा', 'मोबाईल नंबर']
  ];

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
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'नोंदणीकृत सदस्य');
  XLSX.writeFile(wb, `अधिकृत_नोंदणीकृत_सदस्य_यादी.xlsx`);
}

export function exportStatewideRegistryExcel(officials: OfficialMember[]) {
  const data: (string | number)[][] = [
    ['महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ - राज्यस्तरीय नियुक्त्या व नोंदवही'],
    [`एकूण नोंदणी: ${officials.length} | दिनांक: ${new Date().toLocaleDateString('en-IN')}`],
    [],
    ['अ.क्र.', 'नाव', 'जिल्हा', 'तालुका', 'बहाल पद', 'सध्याचे पद', 'मोबाईल']
  ];

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
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'राज्यस्तरीय नोंदवही');
  XLSX.writeFile(wb, `राज्यस्तरीय_नियुक्ती_नोंदवही.xlsx`);
}

export function exportOrganizationStatusExcel(stats: Array<any>) {
  const data: (string | number)[][] = [
    ['महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ - संघटना सद्यस्थिती अहवाल'],
    [`दिनांक: ${new Date().toLocaleDateString('en-IN')}`],
    [],
    [
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
    ]
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
    const offTot = st.officialsTotal ?? (st.stateRep + st.divRep + st.distOfficial + st.talukaOfficial);
    const beo = st.beoCount ?? 0;
    const ext = st.extOfficerCount ?? 0;
    const hm = st.headmasterCount ?? st.members ?? 0;
    const memTot = st.membersTotal ?? (beo + ext + hm);
    const rowTot = st.rowTotal ?? (offTot + memTot);

    tStateRep += st.stateRep;
    tDivRep += st.divRep;
    tDistOff += st.distOfficial;
    tTalukaOff += st.talukaOfficial;
    tOffTot += offTot;
    tBeo += beo;
    tExt += ext;
    tHm += hm;
    tMemTot += memTot;
    tGrandTot += rowTot;

    data.push([
      idx + 1,
      st.district,
      st.stateRep,
      st.divRep,
      st.distOfficial,
      st.talukaOfficial,
      offTot,
      beo,
      ext,
      hm,
      memTot,
      rowTot
    ]);
  });

  data.push([
    '',
    'एकूण (Grand Total)',
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
  ]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'संघटकीय सद्यस्थिती');
  XLSX.writeFile(wb, `संघटना_सद्यस्थिती_अहवाल.xlsx`);
}


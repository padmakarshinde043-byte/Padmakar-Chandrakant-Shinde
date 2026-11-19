import { MembershipApplication, normalizeOfficialCadre } from '../data/mahasanghData';
import { formatMemberDisplayName } from './memberGender';

export const MISSING_TALUKA_SENTINEL = '__MISSING_TALUKA__';

export interface MissingCenterMember {
  id: string;
  memberNumber: string;
  applicationNumber: string;
  salutation: string;
  fullName: string;
  district: string;
  taluka: string;
  professional: string;
  status: 'pending' | 'approved' | 'rejected';
}

/**
 * Returns true if a member's working center name is missing or effectively blank.
 */
export function isMissingCenterName(value?: string | null): boolean {
  const cleaned = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return true;
  const lower = cleaned.toLowerCase();
  return (
    cleaned === '-' ||
    cleaned === '--' ||
    cleaned === '—' ||
    cleaned === 'नाही' ||
    lower === 'na' ||
    lower === 'n/a' ||
    lower === 'nil' ||
    lower === 'none'
  );
}

/**
 * Normalizes a taluka string (treating '-', '--', 'नाही' as empty).
 */
export function normalizeTalukaValue(value?: string | null): string {
  const cleaned = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || cleaned === '-' || cleaned === '--' || cleaned === '—') {
    return '';
  }
  return cleaned;
}

/**
 * Filters a list of applications to ONLY active (non-rejected) members
 * whose working center name (`centerName`) is missing.
 */
export function filterMissingCenterMembers(
  apps: Array<Partial<MembershipApplication> & Record<string, any>>
): MissingCenterMember[] {
  const items: MissingCenterMember[] = [];

  for (const app of apps || []) {
    if (!app || !app.id) continue;
    const status = String(app.status || 'pending').toLowerCase();
    if (status === 'rejected') continue;

    const rawCenter = app.centerName ?? app.center_name ?? '';
    if (!isMissingCenterName(rawCenter)) continue;

    const district = String(app.district || app.officialDistrict || app.official_district || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!district) continue;

    const taluka = normalizeTalukaValue(app.taluka || app.officialTaluka || app.official_taluka || '');

    items.push({
      id: String(app.id),
      memberNumber: String(app.memberNumber || app.member_number || '').trim(),
      applicationNumber: String(app.applicationNumber || app.application_number || '').trim(),
      salutation: String(app.salutation || '').trim(),
      fullName: String(app.fullName || app.full_name || '').trim(),
      district,
      taluka,
      professional: normalizeOfficialCadre(String(app.professional || ''), 'केंद्रप्रमुख'),
      status: status === 'approved' ? 'approved' : 'pending',
    });
  }

  items.sort((a, b) => {
    const distCmp = a.district.localeCompare(b.district, 'mr');
    if (distCmp !== 0) return distCmp;
    const talCmp = a.taluka.localeCompare(b.taluka, 'mr');
    if (talCmp !== 0) return talCmp;
    const nameA = formatMemberDisplayName(a.salutation, a.fullName);
    const nameB = formatMemberDisplayName(b.salutation, b.fullName);
    return nameA.localeCompare(nameB, 'mr');
  });

  return items;
}

export function getDistrictsWithMissingCenters(
  members: MissingCenterMember[]
): Array<{ district: string; count: number }> {
  const counts = new Map<string, number>();
  for (const m of members) {
    if (!m.district) continue;
    counts.set(m.district, (counts.get(m.district) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([district, count]) => ({ district, count }))
    .sort((a, b) => a.district.localeCompare(b.district, 'mr'));
}

export function getTalukasForDistrict(
  members: MissingCenterMember[],
  district: string
): Array<{ value: string; label: string; count: number }> {
  if (!district) return [];
  const counts = new Map<string, number>();
  for (const m of members) {
    if (m.district !== district) continue;
    const key = m.taluka ? m.taluka : MISSING_TALUKA_SENTINEL;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      label: value === MISSING_TALUKA_SENTINEL ? 'तालुका नोंद नाही (जुनी नोंद)' : value,
      count,
    }))
    .sort((a, b) => {
      if (a.value === MISSING_TALUKA_SENTINEL) return 1;
      if (b.value === MISSING_TALUKA_SENTINEL) return -1;
      return a.label.localeCompare(b.label, 'mr');
    });
}

export function getMembersForDistrictAndTaluka(
  members: MissingCenterMember[],
  district: string,
  talukaValue: string
): MissingCenterMember[] {
  if (!district || !talukaValue) return [];
  return members.filter((m) => {
    if (m.district !== district) return false;
    if (talukaValue === MISSING_TALUKA_SENTINEL) {
      return !m.taluka;
    }
    return m.taluka === talukaValue;
  });
}

export function buildCenterUpdateShareUrl(origin?: string): string {
  const base =
    origin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://mahasangh.in');
  return `${base.replace(/\/+$/, '')}/center-update`;
}

export function buildCenterUpdateShareMessage(origin?: string): string {
  const url = buildCenterUpdateShareUrl(origin);
  return [
    'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
    '',
    'महत्त्वाची सूचना (One-Time केंद्र अद्ययावत लिंक):',
    'ज्या सदस्यांच्या सदस्यत्व नोंदणीमध्ये अद्याप "कार्यरत केंद्राचे नाव" नोंदवलेले नाही, कृपया त्यांनी खालील लिंकवर जाऊन आपला जिल्हा, तालुका व नाव निवडून आपल्या कार्यरत केंद्राचे नाव सबमिट करावे.',
    '',
    `अद्ययावत लिंक: ${url}`,
    '',
    '(टीप: ज्यांचे केंद्राचे नाव अद्याप भरलेले नाही, फक्त त्यांचीच नावे या लिंकमध्ये दिसतील व एकदा सबमिट केल्यावर माहिती आपल्या अधिकृत नोंदीत आपोआप जोडली जाईल.)',
  ].join('\n');
}

const DISTRICT_ALIAS_MAP: Record<string, string> = {
  'अहमदनगर': 'अहिल्यानगर',
  'औरंगाबाद': 'छत्रपती संभाजीनगर',
  'संभाजीनगर': 'छत्रपती संभाजीनगर',
  'उस्मानाबाद': 'धाराशिव',
  'वाशिम': 'वाशीम',
};

export function normalizeDistrictKey(district?: string | null): string {
  const cleaned = String(district || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return DISTRICT_ALIAS_MAP[cleaned] || cleaned;
}

export function normalizePersonNameKey(fullName?: string | null): string {
  return String(fullName || '')
    .replace(/^(श्रीमान|श्रीमती|श्रीम|कुमारी|सुश्री|सौ|श्री|कु|डॉ|मा\.?\s*श्री|मा\.?\s*सौ|Mr|Mrs|Ms|Miss|Smt|Shri|Shree|Sau|Kumari|Dr)\.?\s+/i, '')
    .replace(/[\.\,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeLast10Digits(phone?: string | null): string {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

/**
 * Matches an OfficialMember row with a MembershipApplication row
 * by normalized 10-digit mobile number OR canonical district + normalized full name.
 */
export function doesOfficialMatchMember(
  official: {
    mobile?: string | null;
    district?: string | null;
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
  },
  member: {
    phone?: string | null;
    district?: string | null;
    fullName?: string | null;
  }
): boolean {
  const offPhone = normalizeLast10Digits(official.mobile);
  const memPhone = normalizeLast10Digits(member.phone);
  if (offPhone && memPhone && offPhone === memPhone) {
    return true;
  }

  const offDist = normalizeDistrictKey(official.district);
  const memDist = normalizeDistrictKey(member.district);
  if (!offDist || !memDist || offDist !== memDist) {
    return false;
  }

  const offCombined = [official.firstName, official.middleName, official.lastName]
    .filter(Boolean)
    .join(' ');
  const offName = normalizePersonNameKey(offCombined);
  const memName = normalizePersonNameKey(member.fullName);
  return Boolean(offName && memName && offName === memName);
}

/**
 * Resolves the freshest workingPlace / center name for an OfficialMember by checking
 * whether the matched member record has a newer or missing-fill centerName.
 */
export function resolveOfficialWorkingPlaceFromMember(
  official: { workingPlace?: string | null; updatedAt?: string | null },
  member: { centerName?: string | null; updatedAt?: string | null }
): string {
  const offPlace = String(official.workingPlace || '').trim();
  const memCenter = String(member.centerName || '').trim();
  if (isMissingCenterName(memCenter)) {
    return offPlace;
  }
  if (isMissingCenterName(offPlace)) {
    return memCenter;
  }
  const offTs = official.updatedAt ? new Date(official.updatedAt).getTime() : 0;
  const memTs = member.updatedAt ? new Date(member.updatedAt).getTime() : 0;
  if (Number.isFinite(memTs) && memTs > 0 && (!Number.isFinite(offTs) || memTs > offTs)) {
    return memCenter;
  }
  return offPlace;
}

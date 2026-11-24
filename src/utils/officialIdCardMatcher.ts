import {
  Leader,
  MembershipApplication,
  MAHARASHTRA_DISTRICTS,
  normalizeOfficialCadre,
  isValidLeaderRecord,
} from '../data/mahasanghData';
import {
  OfficialMember,
  PostLevelType,
  getPostLevel,
  isTalukaLevelPost,
} from '../data/rkMaharashtraData';
import { toEnglishDigits } from './formatters';

export type OfficialSourceType =
  | 'state_leader'
  | 'women_leader'
  | 'divisional_leader'
  | 'advisory_leader'
  | 'district_leader'
  | 'district_executive';

export interface OfficialIdCardData {
  /** Primary display name including salutation (e.g. "श्री. सुरेश बागुल") */
  displayName: string;
  /** Clean full name without salutation for filenames */
  cleanNameForFile: string;
  /** Official designation title (e.g. "जिल्हाध्यक्ष", "राज्य प्रवक्ता", "विभाग प्रतिनिधी", "तालुका अध्यक्ष") */
  designationTitle: string;
  /** Jurisdiction line displayed immediately below designation (e.g. "महाराष्ट्र राज्य", "जिल्हा नाशिक", "ता. मालेगाव, जि. नाशिक") */
  jurisdictionSubtitle: string;
  /** Appointment Order Number (e.g. "MS/2026/12", "MS/2026/ST-01", "MS/2026/DP-05") */
  appointmentNumber: string;
  /** Service cadre (e.g. "केंद्रप्रमुख", "शिक्षण विस्तार अधिकारी") */
  cadre: string;
  /** Working area line shown in card middle details */
  areaText: string;
  /** 10-digit English mobile number */
  phone: string;
  /** Best available passport photo (official photo preferred, falls back to approved member photo) */
  photo: string;
  /** Organizational hierarchy level */
  level: PostLevelType;
  /** Source list where the highest-priority post was matched */
  source: OfficialSourceType;
  /** Normalized district name if applicable */
  district: string;
  /** Taluka name if applicable */
  taluka: string;
}

const STATE_LEADER_CATEGORIES = new Set(['राज्य कार्यकारिणी', 'state', '']);
const WOMEN_LEADER_CATEGORIES = new Set(['महिला आघाडी राज्य कार्यकारिणी']);
const DIVISIONAL_LEADER_CATEGORIES = new Set(['विभागीय समन्वयक', 'विभागीय कार्यकारिणी', 'division']);
const ADVISORY_LEADER_CATEGORIES = new Set([
  'राज्य सल्लागार मंडळ',
  'सल्लागार',
  'कायदेविषयक सल्लागार',
  'मार्गदर्शक',
  'advisory',
]);
const DISTRICT_LEADER_CATEGORIES = new Set(['जिल्हा अध्यक्ष', 'जिल्हा सरचिटणीस', 'district']);

/**
 * Extracts normalized 10-digit Indian mobile number using English digits.
 */
export function normalizeMobile10(raw?: string | null): string {
  const digits = toEnglishDigits(String(raw || '')).replace(/\D/g, '');
  if (digits.length < 10) return '';
  return digits.slice(-10);
}

/**
 * Normalizes Maharashtra district names consistently (Ahmednagar -> अहिल्यानगर,
 * Aurangabad -> छत्रपती संभाजीनगर, Osmanabad -> धाराशिव, removes redundant "जिल्हा" prefix).
 */
export function normalizeDistrictLabel(raw?: string | null): string {
  const clean = String(raw || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^जिल्हा\s*[-:–—]?\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';

  const phonetic = clean.replace(/ू/g, 'ु').replace(/ी/g, 'ि').toLowerCase();

  if (
    phonetic.includes('संभाजिनगर') ||
    phonetic.includes('औरंगाबाद') ||
    phonetic.includes('sambhajinagar') ||
    phonetic.includes('aurangabad')
  ) {
    return 'छत्रपती संभाजीनगर';
  }
  if (
    phonetic.includes('धाराशिव') ||
    phonetic.includes('उस्मानाबाद') ||
    phonetic.includes('dharashiv') ||
    phonetic.includes('osmanabad')
  ) {
    return 'धाराशिव';
  }
  if (
    phonetic.includes('अहिल्यानगर') ||
    phonetic.includes('अहमदनगर') ||
    phonetic.includes('ahilyanagar') ||
    phonetic.includes('ahmednagar')
  ) {
    return 'अहिल्यानगर';
  }
  if (phonetic.includes('वाशिम') || phonetic.includes('washim')) {
    return 'वाशीम';
  }
  if (
    phonetic.includes('बुलढाणा') ||
    phonetic.includes('बुलडाणा') ||
    phonetic.includes('buldhana') ||
    phonetic.includes('buldana')
  ) {
    return 'बुलढाणा';
  }

  const matched = MAHARASHTRA_DISTRICTS.find((d) => {
    const dp = d.replace(/ू/g, 'ु').replace(/ी/g, 'ि').toLowerCase();
    return phonetic === dp || phonetic.includes(dp);
  });

  return matched || clean;
}

/**
 * Computes deterministic sequential appointment order numbers ("MS/2026/01", "MS/2026/02", ...)
 * using the exact same sorting order as `generateStatewideRegistryPdf` in rkPdfGenerator.ts,
 * while honoring an explicit `orderNumber` if already stored on the record.
 */
export function buildOfficialOrderNumberMap(allOfficials: OfficialMember[]): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(allOfficials) || allOfficials.length === 0) return map;

  const sorted = [...allOfficials].sort((a, b) => {
    const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    if (timeA !== timeB && timeA > 0 && timeB > 0) return timeA - timeB;
    const numIdA = parseInt(a.id, 10) || 0;
    const numIdB = parseInt(b.id, 10) || 0;
    if (numIdA > 0 && numIdB > 0 && numIdA !== numIdB) return numIdA - numIdB;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  sorted.forEach((official, index) => {
    const explicitOrder = toEnglishDigits((official.orderNumber || '').trim());
    const serialPadded = String(index + 1).padStart(2, '0');
    const resolvedOrder = explicitOrder || `MS/2026/${serialPadded}`;
    if (official.id) {
      map.set(String(official.id), resolvedOrder);
    }
    const mobile10 = normalizeMobile10(official.mobile);
    if (mobile10 && !map.has(`mobile:${mobile10}`)) {
      map.set(`mobile:${mobile10}`, resolvedOrder);
    }
  });

  return map;
}

interface LeaderClassification {
  source: OfficialSourceType;
  level: PostLevelType;
  priority: number; // Lower number = higher organizational seniority
  prefix: 'ST' | 'DV' | 'DP';
}

function classifyLeader(leader: Leader): LeaderClassification {
  const cat = (leader.category || '').trim();
  const role = (leader.role || '').trim();

  if (WOMEN_LEADER_CATEGORIES.has(cat)) {
    return { source: 'women_leader', level: 'mahila', priority: 1, prefix: 'ST' };
  }
  if (DIVISIONAL_LEADER_CATEGORIES.has(cat) || role.includes('विभाग')) {
    return { source: 'divisional_leader', level: 'division', priority: 3, prefix: 'DV' };
  }
  if (DISTRICT_LEADER_CATEGORIES.has(cat) || role.includes('जिल्हा')) {
    return { source: 'district_leader', level: 'district', priority: 4, prefix: 'DP' };
  }
  if (ADVISORY_LEADER_CATEGORIES.has(cat)) {
    return { source: 'advisory_leader', level: 'state', priority: 2, prefix: 'ST' };
  }
  if (STATE_LEADER_CATEGORIES.has(cat)) {
    return { source: 'state_leader', level: 'state', priority: 1, prefix: 'ST' };
  }
  return { source: 'state_leader', level: 'state', priority: 2, prefix: 'ST' };
}

function getOfficialPriority(level: PostLevelType, postName: string): number {
  const p = (postName || '').trim();
  if (level === 'state' || level === 'mahila') return 1;
  if (level === 'division') return 3;
  if (level === 'district') {
    if (p.includes('जिल्हाध्यक्ष') || p.includes('जिल्हा अध्यक्ष') || p.includes('जिल्हा सरचिटणीस')) {
      return 4;
    }
    return 5;
  }
  return 6; // taluka
}

function cleanDesignationTitle(rawPost?: string): string {
  const cleaned = String(rawPost || '')
    .replace(/\s*\([^)]*तालुका[^)]*\)\s*/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'पदाधिकारी';
}

function buildJurisdictionSubtitle(params: {
  level: PostLevelType;
  district: string;
  taluka: string;
  isTalukaPost: boolean;
}): string {
  const { level, district, taluka, isTalukaPost } = params;

  // State, Women's State Wing, and Divisional officials all display "महाराष्ट्र राज्य"
  if (level === 'state' || level === 'mahila' || level === 'division') {
    return 'महाराष्ट्र राज्य';
  }

  // Taluka-level officials display taluka (with district) when applicable
  if (isTalukaPost && taluka) {
    return district ? `ता. ${taluka}, जि. ${district}` : `तालुका ${taluka}`;
  }

  // District-level officials display district name
  if (district) {
    return `जिल्हा ${district}`;
  }

  return 'महाराष्ट्र राज्य';
}

function buildAreaText(params: {
  level: PostLevelType;
  district: string;
  taluka: string;
  leaderRegion?: string;
  member?: MembershipApplication | null;
}): string {
  const { level, district, taluka, leaderRegion, member } = params;
  const memberDist = normalizeDistrictLabel(member?.district);
  const memberTaluka = (member?.taluka || '').trim();

  if (level === 'state' || level === 'mahila' || level === 'division') {
    const cleanRegion = (leaderRegion || '').trim();
    if (memberDist) {
      return `${memberDist}${memberTaluka ? ` (ता. ${memberTaluka})` : ''}`;
    }
    if (cleanRegion && cleanRegion !== '-' && cleanRegion !== 'महाराष्ट्र राज्य') {
      return cleanRegion;
    }
    if (district) {
      return district;
    }
    return 'महाराष्ट्र राज्य';
  }

  const finalDistrict = district || memberDist;
  const finalTaluka = taluka || memberTaluka;
  if (finalDistrict) {
    return `${finalDistrict}${finalTaluka ? ` (ता. ${finalTaluka})` : ''}`;
  }
  return finalTaluka || 'महाराष्ट्र राज्य';
}

function formatOfficialFullName(official: OfficialMember): { displayName: string; cleanName: string } {
  const parts = [official.firstName, official.middleName, official.lastName]
    .map((s) => (s || '').trim())
    .filter(Boolean);
  const cleanName = parts.join(' ').trim();
  const salutation = (official.salutation || '').trim();
  const displayName = `${salutation ? `${salutation} ` : ''}${cleanName}`.trim() || 'पदाधिकारी';
  return { displayName, cleanName: cleanName || displayName };
}

function formatMemberFullName(member: MembershipApplication): { displayName: string; cleanName: string } {
  const cleanName = (member.fullName || '').trim();
  const salutation = (member.salutation || '').trim();
  const displayName = `${salutation ? `${salutation} ` : ''}${cleanName}`.trim() || 'पदाधिकारी';
  return { displayName, cleanName: cleanName || displayName };
}

function stripSalutationForFile(name: string): string {
  return name
    .replace(/^(?:श्री\.?|श्रीमती\.?|सौ\.?|डॉ\.?|प्रा\.?|कु\.?)\s+/u, '')
    .trim();
}

/**
 * Matches a queried 10-digit mobile number (or approved member's phone) against ALL 3
 * official leadership directories:
 *   1. राज्य पदाधिकारी (`leaders`: राज्य कार्यकारिणी, महिला आघाडी राज्य कार्यकारिणी, विभागीय, सल्लागार)
 *   2. जिल्हा पदाधिकारी (`leaders`: जिल्हा अध्यक्ष, जिल्हा सरचिटणीस)
 *   3. जिल्हा कार्यकारिणी (`officials`: जिल्हा व तालुका कार्यकारिणी / नियुक्ती नोंदवही)
 *
 * Returns `null` if the person is NOT an official in any of the 3 directories.
 */
export function resolveOfficialIdCardForQuery(params: {
  queryPhone?: string | null;
  member?: MembershipApplication | null;
  allLeaders: Leader[];
  allOfficials: OfficialMember[];
}): OfficialIdCardData | null {
  const { queryPhone, member, allLeaders, allOfficials } = params;

  const targetPhone = normalizeMobile10(member?.phone) || normalizeMobile10(queryPhone);
  if (!targetPhone) return null;

  const validLeaders = (allLeaders || []).filter((l) => isValidLeaderRecord(l));
  const validOfficials = Array.isArray(allOfficials) ? allOfficials : [];
  const orderMap = buildOfficialOrderNumberMap(validOfficials);

  // Build deterministic category-scoped serial numbers for leaders without an `officials` appointment record
  const leaderCategorySerials = new Map<Leader, string>();
  const prefixCounters: Record<'ST' | 'DV' | 'DP', number> = { ST: 0, DV: 0, DP: 0 };
  for (const leader of validLeaders) {
    const info = classifyLeader(leader);
    prefixCounters[info.prefix] += 1;
    const seq = String(prefixCounters[info.prefix]).padStart(2, '0');
    leaderCategorySerials.set(leader, `MS/2026/${info.prefix}-${seq}`);
  }

  // Find all matching entries in `leaders` and `officials`
  const matchedLeaders = validLeaders.filter((l) => normalizeMobile10(l.phone) === targetPhone);
  const matchedOfficials = validOfficials.filter((o) => normalizeMobile10(o.mobile) === targetPhone);

  if (matchedLeaders.length === 0 && matchedOfficials.length === 0) {
    return null;
  }

  interface Candidate {
    priority: number;
    data: OfficialIdCardData;
  }

  const candidates: Candidate[] = [];

  // Prefer the best matching official record for cross-referencing orderNumber, cadre, and photo
  const primaryOfficialRecord = matchedOfficials.length > 0 ? matchedOfficials[0] : null;
  const crossOfficialOrderNo = primaryOfficialRecord
    ? orderMap.get(String(primaryOfficialRecord.id)) ||
      orderMap.get(`mobile:${targetPhone}`) ||
      ''
    : '';

  const fallbackPhoto =
    (primaryOfficialRecord?.photo || '').trim() ||
    (matchedLeaders.find((l) => (l.photo || '').trim())?.photo || '').trim() ||
    (member?.photo || '').trim();

  const fallbackCadre = normalizeOfficialCadre(
    primaryOfficialRecord?.currentCadre || member?.professional || '',
    'केंद्रप्रमुख / शिक्षण विस्तार अधिकारी'
  );

  // 1. Evaluate `leaders` matches (राज्य पदाधिकारी & जिल्हा पदाधिकारी)
  for (const leader of matchedLeaders) {
    const cls = classifyLeader(leader);
    const designationTitle = cleanDesignationTitle(leader.role);
    const district =
      cls.level === 'district'
        ? normalizeDistrictLabel(leader.region || primaryOfficialRecord?.district || member?.district)
        : normalizeDistrictLabel(primaryOfficialRecord?.district || member?.district);
    const taluka = (primaryOfficialRecord?.taluka || member?.taluka || '').trim();

    const jurisdictionSubtitle = buildJurisdictionSubtitle({
      level: cls.level,
      district,
      taluka,
      isTalukaPost: false,
    });

    const appointmentNumber =
      crossOfficialOrderNo || leaderCategorySerials.get(leader) || 'MS/2026/ST-01';

    const displayName = (leader.name || '').trim() || (member ? formatMemberFullName(member).displayName : 'पदाधिकारी');
    const cleanNameForFile = stripSalutationForFile(displayName) || displayName;
    const photo = (leader.photo || '').trim() || fallbackPhoto;
    const areaText = buildAreaText({
      level: cls.level,
      district,
      taluka,
      leaderRegion: leader.region,
      member,
    });

    candidates.push({
      priority: cls.priority,
      data: {
        displayName,
        cleanNameForFile,
        designationTitle,
        jurisdictionSubtitle,
        appointmentNumber,
        cadre: fallbackCadre,
        areaText,
        phone: targetPhone,
        photo,
        level: cls.level,
        source: cls.source,
        district,
        taluka: cls.level === 'taluka' ? taluka : '',
      },
    });
  }

  // 2. Evaluate `officials` matches (जिल्हा कार्यकारिणी / नियुक्ती नोंदवही)
  for (const official of matchedOfficials) {
    const rawPost = (official.appointedPost || '').trim();
    const level = getPostLevel(rawPost);
    const isTaluka = isTalukaLevelPost(rawPost);
    const designationTitle = cleanDesignationTitle(rawPost);
    const district = normalizeDistrictLabel(official.district || member?.district);
    const taluka = isTaluka ? (official.taluka || member?.taluka || '').trim() : '';

    const jurisdictionSubtitle = buildJurisdictionSubtitle({
      level,
      district,
      taluka,
      isTalukaPost: isTaluka,
    });

    const appointmentNumber =
      orderMap.get(String(official.id)) ||
      toEnglishDigits((official.orderNumber || '').trim()) ||
      'MS/2026/01';

    const { displayName, cleanName } = formatOfficialFullName(official);
    const photo = (official.photo || '').trim() || fallbackPhoto;
    const cadre = normalizeOfficialCadre(
      official.currentCadre || member?.professional || '',
      'केंद्रप्रमुख / शिक्षण विस्तार अधिकारी'
    );
    const areaText = buildAreaText({
      level,
      district,
      taluka: (official.taluka || member?.taluka || '').trim(),
      member,
    });

    candidates.push({
      priority: getOfficialPriority(level, rawPost),
      data: {
        displayName,
        cleanNameForFile: cleanName,
        designationTitle,
        jurisdictionSubtitle,
        appointmentNumber,
        cadre,
        areaText,
        phone: targetPhone,
        photo,
        level,
        source: 'district_executive',
        district,
        taluka,
      },
    });
  }

  // Pick highest seniority candidate (lowest priority number)
  candidates.sort((a, b) => a.priority - b.priority);
  return candidates[0]?.data || null;
}

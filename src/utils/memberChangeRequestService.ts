import crypto from 'crypto';
import { RowDataPacket } from 'mysql2/promise';
import { ensureMysqlSchema, getMysqlPool, isMysqlActive } from '../db/mysqlPool';
import { mysqlGetApplicationById, mysqlUpdateApplication } from '../db/mysqlRepository';
import { toEnglishDigits } from './formatters';
import { normalizePhone10 } from './applicationCleanup';
import { deriveGenderFromSalutation } from './memberGender';

export interface MemberChangeFields {
  salutation?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  district?: string;
  taluka?: string;
  centerName?: string;
  address?: string;
  photo?: string;
}

export interface MemberChangeRequestRecord {
  id: string;
  applicationId: string;
  memberNumber: string;
  applicantName: string;
  applicantPhone: string;
  applicantDistrict: string;
  currentSnapshot: MemberChangeFields;
  proposedChanges: MemberChangeFields;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string;
  reviewNote: string;
  createdAt: string;
  reviewedAt: string;
}

export interface MemberChangeEligibility {
  eligible: boolean;
  hasPending: boolean;
  pendingRequestId?: string;
  pendingCreatedAt?: string;
  cooldownDaysRemaining: number;
  lastApprovedAt?: string;
  lastRejectedAt?: string;
  lastRejectedNote?: string;
}

const COOLDOWN_DAYS = 30;
const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
const MAX_PHOTO_DATA_URL_LENGTH = 550_000; // ~400KB image in base64
const ALLOWED_SALUTATIONS = new Set(['श्री', 'श्री.', 'सौ', 'सौ.', 'श्रीमती', 'श्रीमती.', 'कु', 'कु.', 'डॉ', 'डॉ.', 'ॲड', 'ॲड.']);

const memoryRequests: MemberChangeRequestRecord[] = [];

function createServiceError(code: string, message: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

function safeParseJson<T>(raw: unknown, fallback: T): T {
  if (!raw) return fallback;
  if (typeof raw === 'object') return raw as T;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function mapRequestRow(row: RowDataPacket): MemberChangeRequestRecord {
  return {
    id: String(row.id || ''),
    applicationId: String(row.application_id || ''),
    memberNumber: String(row.member_number || ''),
    applicantName: String(row.applicant_name || ''),
    applicantPhone: String(row.applicant_phone || ''),
    applicantDistrict: String(row.applicant_district || ''),
    currentSnapshot: safeParseJson<MemberChangeFields>(row.current_snapshot_json, {}),
    proposedChanges: safeParseJson<MemberChangeFields>(row.proposed_changes_json, {}),
    reason: String(row.reason || ''),
    status: (row.status === 'approved' || row.status === 'rejected' ? row.status : 'pending') as
      | 'pending'
      | 'approved'
      | 'rejected',
    reviewedBy: String(row.reviewed_by || ''),
    reviewNote: String(row.review_note || ''),
    createdAt: String(row.created_at || ''),
    reviewedAt: String(row.reviewed_at || ''),
  };
}

function isValidSafePhotoValue(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (trimmed.length > MAX_PHOTO_DATA_URL_LENGTH) return false;
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(trimmed)) {
    return true;
  }
  if (/^\/uploads\/[a-zA-Z0-9/_-]+\.(jpg|jpeg|png|webp)$/i.test(trimmed)) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' && parsed.hostname === 'res.cloudinary.com') {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function cleanStr(v: unknown, maxLen: number): string {
  return String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, maxLen);
}

function cleanAddress(v: unknown, maxLen: number): string {
  return String(v ?? '').trim().slice(0, maxLen);
}

function splitFullNameParts(fullName: string): { firstName: string; middleName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', middleName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], middleName: '', lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], middleName: '', lastName: parts[1] };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

function computeEligibilityFromRecords(records: MemberChangeRequestRecord[]): MemberChangeEligibility {
  const sorted = [...records].sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );

  const pending = sorted.find((r) => r.status === 'pending');
  if (pending) {
    return {
      eligible: false,
      hasPending: true,
      pendingRequestId: pending.id,
      pendingCreatedAt: pending.createdAt,
      cooldownDaysRemaining: 0,
    };
  }

  const latestApproved = sorted
    .filter((r) => r.status === 'approved')
    .sort((a, b) =>
      String(b.reviewedAt || b.createdAt || '').localeCompare(String(a.reviewedAt || a.createdAt || ''))
    )[0];

  if (latestApproved) {
    const refTime = new Date(latestApproved.reviewedAt || latestApproved.createdAt).getTime();
    if (Number.isFinite(refTime)) {
      const elapsed = Date.now() - refTime;
      if (elapsed < COOLDOWN_MS) {
        const remainingDays = Math.max(1, Math.ceil((COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000)));
        return {
          eligible: false,
          hasPending: false,
          cooldownDaysRemaining: remainingDays,
          lastApprovedAt: latestApproved.reviewedAt || latestApproved.createdAt,
        };
      }
    }
  }

  const latestRejected = sorted.find((r) => r.status === 'rejected');
  return {
    eligible: true,
    hasPending: false,
    cooldownDaysRemaining: 0,
    lastApprovedAt: latestApproved?.reviewedAt || latestApproved?.createdAt,
    lastRejectedAt: latestRejected?.reviewedAt || latestRejected?.createdAt,
    lastRejectedNote: latestRejected?.reviewNote || '',
  };
}

async function listRequestsForApplication(applicationId: string): Promise<MemberChangeRequestRecord[]> {
  const cleanId = String(applicationId || '').trim();
  if (!cleanId) return [];

  if (isMysqlActive()) {
    await ensureMysqlSchema();
    const pool = getMysqlPool();
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `member_change_requests` WHERE `application_id` = ? ORDER BY `created_at` DESC LIMIT 25',
      [cleanId]
    );
    return rows.map(mapRequestRow);
  }

  return memoryRequests.filter((r) => r.applicationId === cleanId);
}

export async function getMemberChangeEligibility(params: {
  applicationId: string;
  memberNumber?: string;
  phone?: string;
}): Promise<MemberChangeEligibility> {
  const appId = String(params.applicationId || '').trim();
  if (!appId) {
    throw createServiceError('BAD_REQUEST', 'सदस्य ओळख क्रमांक आवश्यक आहे.');
  }

  if (isMysqlActive()) {
    const existing = await mysqlGetApplicationById(appId);
    if (!existing || existing.status !== 'approved') {
      throw createServiceError('NOT_FOUND', 'मंजूर सदस्य नोंद आढळली नाही.');
    }
    const providedPhone10 = normalizePhone10(params.phone);
    const storedPhone10 = normalizePhone10(existing.phone);
    const providedMem = toEnglishDigits(String(params.memberNumber || '').trim()).toUpperCase();
    const storedMem = toEnglishDigits(String(existing.memberNumber || '').trim()).toUpperCase();

    const matchesPhone = Boolean(providedPhone10 && storedPhone10 && providedPhone10 === storedPhone10);
    const matchesMem = Boolean(providedMem && storedMem && providedMem === storedMem);
    if (!matchesPhone && !matchesMem) {
      throw createServiceError('FORBIDDEN', 'सदस्य ओळख पडताळणी जुळली नाही.');
    }
  }

  const records = await listRequestsForApplication(appId);
  return computeEligibilityFromRecords(records);
}

export async function submitMemberChangeRequest(input: {
  applicationId: string;
  verifyPhone?: string;
  verifyMemberNumber?: string;
  currentSnapshotFallback?: MemberChangeFields & { memberNumber?: string };
  proposed: MemberChangeFields;
  reason: string;
}): Promise<MemberChangeRequestRecord> {
  const applicationId = String(input.applicationId || '').trim();
  if (!applicationId) {
    throw createServiceError('BAD_REQUEST', 'सदस्य ओळख (Application ID) आवश्यक आहे.');
  }

  const reason = cleanAddress(input.reason, 500);
  if (reason.length < 10) {
    throw createServiceError('BAD_REQUEST', 'कृपया माहिती बदलण्याचे स्पष्ट कारण (किमान १० अक्षरे) लिहा.');
  }

  let currentSnapshot: MemberChangeFields;
  let memberNumber = '';
  let applicantName = '';
  let applicantPhone = '';
  let applicantDistrict = '';

  if (isMysqlActive()) {
    const existing = await mysqlGetApplicationById(applicationId);
    if (!existing) {
      throw createServiceError('NOT_FOUND', 'सदस्य नोंद आढळली नाही.');
    }
    if (existing.status !== 'approved') {
      throw createServiceError('INVALID_STATUS', 'ही सुविधा फक्त मंजूर आजीवन सदस्यांसाठीच उपलब्ध आहे.');
    }

    const providedPhone10 = normalizePhone10(input.verifyPhone);
    const storedPhone10 = normalizePhone10(existing.phone);
    const providedMem = toEnglishDigits(String(input.verifyMemberNumber || '').trim()).toUpperCase();
    const storedMem = toEnglishDigits(String(existing.memberNumber || '').trim()).toUpperCase();

    const matchesPhone = Boolean(providedPhone10 && storedPhone10 && providedPhone10 === storedPhone10);
    const matchesMem = Boolean(providedMem && storedMem && providedMem === storedMem);
    if (!matchesPhone && !matchesMem) {
      throw createServiceError('FORBIDDEN', 'सदस्य पडताळणी अयशस्वी झाली. कृपया पुन्हा अर्जाची स्थिती तपासा.');
    }

    memberNumber = String(existing.memberNumber || '');
    applicantName = `${existing.salutation ? `${existing.salutation} ` : ''}${existing.fullName || ''}`.trim();
    applicantPhone = String(existing.phone || '');
    applicantDistrict = String(existing.district || '');

    currentSnapshot = {
      salutation: String(existing.salutation || ''),
      fullName: String(existing.fullName || ''),
      phone: String(existing.phone || ''),
      email: String(existing.email || ''),
      district: String(existing.district || ''),
      taluka: String(existing.taluka || ''),
      centerName: String(existing.centerName || ''),
      address: String(existing.address || ''),
      photo: String(existing.photo || ''),
    };
  } else {
    const fb = input.currentSnapshotFallback || {};
    memberNumber = cleanStr(input.verifyMemberNumber || fb.memberNumber, 64);
    applicantName = `${fb.salutation ? `${fb.salutation} ` : ''}${fb.fullName || ''}`.trim() || 'सदस्य';
    applicantPhone = cleanStr(input.verifyPhone || fb.phone, 32);
    applicantDistrict = cleanStr(fb.district, 128);
    currentSnapshot = {
      salutation: cleanStr(fb.salutation, 32),
      fullName: cleanStr(fb.fullName, 200),
      phone: cleanStr(fb.phone, 32),
      email: cleanStr(fb.email, 200),
      district: cleanStr(fb.district, 128),
      taluka: cleanStr(fb.taluka, 128),
      centerName: cleanStr(fb.centerName, 200),
      address: cleanAddress(fb.address, 500),
      photo: typeof fb.photo === 'string' && isValidSafePhotoValue(fb.photo) ? fb.photo.trim() : '',
    };
  }

  // Enforce one pending request & 30-day cooldown after last approval
  const existingReqs = await listRequestsForApplication(applicationId);
  const eligibility = computeEligibilityFromRecords(existingReqs);
  if (eligibility.hasPending) {
    throw createServiceError(
      'ALREADY_PENDING',
      'आपली एक माहिती बदल विनंती आधीच अ‍ॅडमिन मंजुरीसाठी प्रलंबित आहे. कृपया ती निकाली निघेपर्यंत प्रतीक्षा करा.'
    );
  }
  if (!eligibility.eligible && eligibility.cooldownDaysRemaining > 0) {
    throw createServiceError(
      'COOLDOWN_ACTIVE',
      `आपली मागील दुरुस्ती नुकतीच मंजूर झाली आहे. पुढील बदल विनंती ${eligibility.cooldownDaysRemaining} दिवसांनंतर करता येईल.`
    );
  }

  const raw = input.proposed || {};
  const proposedChanges: MemberChangeFields = {};

  if (raw.salutation !== undefined) {
    const cleanSal = cleanStr(raw.salutation, 24);
    if (cleanSal && cleanSal !== (currentSnapshot.salutation || '')) {
      if (!ALLOWED_SALUTATIONS.has(cleanSal)) {
        throw createServiceError('BAD_REQUEST', 'कृपया योग्य अभिवादन (श्री/सौ/श्रीमती/डॉ) निवडा.');
      }
      proposedChanges.salutation = cleanSal;
    }
  }

  if (raw.fullName !== undefined) {
    const cleanName = cleanStr(raw.fullName, 180);
    if (cleanName && cleanName !== (currentSnapshot.fullName || '')) {
      if (cleanName.length < 3) {
        throw createServiceError('BAD_REQUEST', 'पूर्ण नाव किमान ३ अक्षरांचे असणे आवश्यक आहे.');
      }
      proposedChanges.fullName = cleanName;
    }
  }

  if (raw.phone !== undefined) {
    const cleanPhone10 = normalizePhone10(raw.phone);
    const oldPhone10 = normalizePhone10(currentSnapshot.phone);
    if (String(raw.phone || '').trim() && cleanPhone10 !== oldPhone10) {
      if (cleanPhone10.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone10)) {
        throw createServiceError('BAD_REQUEST', 'कृपया वैध १० अंकी मोबाईल क्रमांक प्रविष्ट करा.');
      }
      proposedChanges.phone = cleanPhone10;
    }
  }

  if (raw.email !== undefined) {
    const cleanEmail = cleanStr(raw.email, 180).toLowerCase();
    const oldEmail = String(currentSnapshot.email || '').trim().toLowerCase();
    if (cleanEmail !== oldEmail) {
      if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
        throw createServiceError('BAD_REQUEST', 'कृपया वैध ई-मेल पत्ता प्रविष्ट करा.');
      }
      proposedChanges.email = cleanEmail;
    }
  }

  if (raw.district !== undefined) {
    const cleanDist = cleanStr(raw.district, 120);
    if (cleanDist && cleanDist !== (currentSnapshot.district || '')) {
      proposedChanges.district = cleanDist;
    }
  }

  if (raw.taluka !== undefined) {
    const cleanTal = cleanStr(raw.taluka, 120);
    if (cleanTal !== (currentSnapshot.taluka || '')) {
      proposedChanges.taluka = cleanTal;
    }
  }

  if (raw.centerName !== undefined) {
    const cleanCenter = cleanStr(raw.centerName, 180);
    if (cleanCenter !== (currentSnapshot.centerName || '')) {
      proposedChanges.centerName = cleanCenter;
    }
  }

  if (raw.address !== undefined) {
    const cleanAddr = cleanAddress(raw.address, 500);
    if (cleanAddr !== String(currentSnapshot.address || '').trim()) {
      proposedChanges.address = cleanAddr;
    }
  }

  if (raw.photo !== undefined) {
    const cleanPhoto = String(raw.photo || '').trim();
    if (cleanPhoto && cleanPhoto !== String(currentSnapshot.photo || '').trim()) {
      if (!isValidSafePhotoValue(cleanPhoto)) {
        throw createServiceError(
          'BAD_REQUEST',
          'फोटो फॉरमॅट अवैध किंवा आकार मर्यादेपेक्षा जास्त आहे. कृपया क्रॉप केलेला JPG/PNG पासपोर्ट फोटो अपलोड करा.'
        );
      }
      proposedChanges.photo = cleanPhoto;
    }
  }

  if (Object.keys(proposedChanges).length === 0) {
    throw createServiceError(
      'NO_CHANGES',
      'कृपया किमान एक माहिती किंवा नवीन फोटो बदला; कोणताही बदल आढळला नाही.'
    );
  }

  const nowIso = new Date().toISOString();
  const record: MemberChangeRequestRecord = {
    id: `mcr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    applicationId,
    memberNumber,
    applicantName,
    applicantPhone,
    applicantDistrict,
    currentSnapshot,
    proposedChanges,
    reason,
    status: 'pending',
    reviewedBy: '',
    reviewNote: '',
    createdAt: nowIso,
    reviewedAt: '',
  };

  if (isMysqlActive()) {
    await ensureMysqlSchema();
    const pool = getMysqlPool();
    await pool.query(
      `INSERT INTO \`member_change_requests\` (
        \`id\`, \`application_id\`, \`member_number\`, \`applicant_name\`, \`applicant_phone\`,
        \`applicant_district\`, \`current_snapshot_json\`, \`proposed_changes_json\`, \`reason\`,
        \`status\`, \`reviewed_by\`, \`review_note\`, \`created_at\`, \`reviewed_at\`
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '', '', ?, '')`,
      [
        record.id,
        record.applicationId,
        record.memberNumber,
        record.applicantName,
        record.applicantPhone,
        record.applicantDistrict,
        JSON.stringify(record.currentSnapshot),
        JSON.stringify(record.proposedChanges),
        record.reason,
        record.createdAt,
      ]
    );
  } else {
    memoryRequests.unshift(record);
  }

  return record;
}

export async function listAllMemberChangeRequests(): Promise<{
  requests: MemberChangeRequestRecord[];
  counts: { total: number; pending: number; approved: number; rejected: number };
}> {
  let requests: MemberChangeRequestRecord[];

  if (isMysqlActive()) {
    await ensureMysqlSchema();
    const pool = getMysqlPool();
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `member_change_requests` ORDER BY `created_at` DESC LIMIT 500'
    );
    requests = rows.map(mapRequestRow);
  } else {
    requests = [...memoryRequests].sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
  }

  let pending = 0;
  let approved = 0;
  let rejected = 0;
  for (const r of requests) {
    if (r.status === 'pending') pending++;
    else if (r.status === 'approved') approved++;
    else if (r.status === 'rejected') rejected++;
  }

  return {
    requests,
    counts: {
      total: requests.length,
      pending,
      approved,
      rejected,
    },
  };
}

async function getMemberChangeRequestById(id: string): Promise<MemberChangeRequestRecord | null> {
  const cleanId = String(id || '').trim();
  if (!cleanId) return null;

  if (isMysqlActive()) {
    await ensureMysqlSchema();
    const pool = getMysqlPool();
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `member_change_requests` WHERE `id` = ? LIMIT 1',
      [cleanId]
    );
    return rows.length ? mapRequestRow(rows[0]) : null;
  }

  return memoryRequests.find((r) => r.id === cleanId) || null;
}

export async function approveMemberChangeRequest(params: {
  id: string;
  reviewedBy: string;
  reviewNote?: string;
  isSuperAdmin: boolean;
}): Promise<{
  request: MemberChangeRequestRecord;
  updatedMember: Record<string, any> | null;
  syncedOfficialsCount: number;
  syncedLeadersCount: number;
}> {
  const reqRecord = await getMemberChangeRequestById(params.id);
  if (!reqRecord) {
    throw createServiceError('NOT_FOUND', 'ही माहिती बदल विनंती आढळली नाही.');
  }
  if (reqRecord.status !== 'pending') {
    throw createServiceError('ALREADY_PROCESSED', 'ही विनंती यापूर्वीच निकाली काढण्यात आली आहे.');
  }

  const nowIso = new Date().toISOString();
  const cleanReviewer = cleanStr(params.reviewedBy || 'admin', 190);
  const cleanNote = cleanAddress(params.reviewNote || '', 300);
  const proposed = reqRecord.proposedChanges || {};

  let updatedMember: Record<string, any> | null = null;
  let syncedOfficialsCount = 0;
  let syncedLeadersCount = 0;

  if (isMysqlActive()) {
    await ensureMysqlSchema();
    const pool = getMysqlPool();
    const existingApp = await mysqlGetApplicationById(reqRecord.applicationId);
    if (!existingApp) {
      throw createServiceError('NOT_FOUND', 'या विनंतीशी संबंधित सदस्य नोंद डेटाबेसमध्ये आढळली नाही.');
    }

    // Prevent accidental duplicate phone conflict with another approved member
    if (proposed.phone) {
      const targetPhone10 = normalizePhone10(proposed.phone);
      const oldPhone10 = normalizePhone10(existingApp.phone);
      if (targetPhone10 && targetPhone10 !== oldPhone10) {
        const [dupRows] = await pool.query<RowDataPacket[]>(
          `SELECT \`id\`, \`full_name\`, \`member_number\` FROM \`applications\`
           WHERE \`status\` = 'approved' AND \`id\` <> ? AND \`phone\` = ? LIMIT 1`,
          [existingApp.id, targetPhone10]
        );
        if (dupRows.length > 0) {
          throw createServiceError(
            'PHONE_CONFLICT',
            `मोबाईल क्रमांक ${targetPhone10} हा आधीच दुसऱ्या मंजूर सदस्याच्या (${String(dupRows[0].full_name || '')}) नावावर नोंदवलेला आहे.`
          );
        }
      }
    }

    const appPatch: Record<string, any> = {};
    if (proposed.salutation !== undefined) {
      appPatch.salutation = proposed.salutation;
      appPatch.gender = deriveGenderFromSalutation(proposed.salutation);
    }
    if (proposed.fullName !== undefined) appPatch.fullName = proposed.fullName;
    if (proposed.phone !== undefined) appPatch.phone = proposed.phone;
    if (proposed.email !== undefined) appPatch.email = proposed.email;
    if (proposed.district !== undefined) appPatch.district = proposed.district;
    if (proposed.taluka !== undefined) appPatch.taluka = proposed.taluka;
    if (proposed.centerName !== undefined) appPatch.centerName = proposed.centerName;
    if (proposed.address !== undefined) appPatch.address = proposed.address;
    if (proposed.photo !== undefined) appPatch.photo = proposed.photo;

    updatedMember = await mysqlUpdateApplication(existingApp.id, appPatch);

    // Propagate updated member profile to matching `officials` rows (District/Taluka office bearers)
    try {
      const oldPhone10 = normalizePhone10(existingApp.phone);
      const oldFullNameNorm = String(existingApp.fullName || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const oldDistrictNorm = String(existingApp.district || '').trim().toLowerCase();

      const [officialRows] = await pool.query<RowDataPacket[]>(
        'SELECT * FROM `officials` WHERE `mobile` <> "" OR `district` = ?',
        [existingApp.district || '']
      );

      for (const off of officialRows) {
        const offPhone10 = normalizePhone10(String(off.mobile || ''));
        const offCombinedName = [off.first_name, off.middle_name, off.last_name]
          .map((s) => String(s || '').trim())
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        const offDist = String(off.district || '').trim().toLowerCase();

        const phoneMatch = Boolean(oldPhone10 && offPhone10 && oldPhone10 === offPhone10);
        const nameDistMatch = Boolean(
          oldFullNameNorm &&
            offCombinedName &&
            oldDistrictNorm &&
            offDist === oldDistrictNorm &&
            offCombinedName === oldFullNameNorm
        );

        if (!phoneMatch && !nameDistMatch) continue;

        const nextSal = proposed.salutation !== undefined ? proposed.salutation : String(off.salutation || 'श्री.');
        const nameParts =
          proposed.fullName !== undefined
            ? splitFullNameParts(proposed.fullName)
            : {
                firstName: String(off.first_name || ''),
                middleName: String(off.middle_name || ''),
                lastName: String(off.last_name || ''),
              };
        const nextDist = proposed.district !== undefined ? proposed.district : String(off.district || '');
        const nextTal = proposed.taluka !== undefined ? proposed.taluka : String(off.taluka || '');
        const nextWork = proposed.centerName !== undefined ? proposed.centerName : String(off.working_place || '');
        const nextMobile = proposed.phone !== undefined ? proposed.phone : String(off.mobile || '');
        const nextPhoto = proposed.photo !== undefined ? proposed.photo : String(off.photo || '');

        await pool.query(
          `UPDATE \`officials\`
           SET \`salutation\` = ?, \`first_name\` = ?, \`middle_name\` = ?, \`last_name\` = ?,
               \`district\` = ?, \`taluka\` = ?, \`working_place\` = ?, \`mobile\` = ?,
               \`photo\` = ?, \`updated_at\` = ?
           WHERE \`id\` = ?`,
          [
            nextSal,
            nameParts.firstName,
            nameParts.middleName,
            nameParts.lastName,
            nextDist,
            nextTal,
            nextWork,
            nextMobile,
            nextPhoto,
            nowIso,
            String(off.id),
          ]
        );
        syncedOfficialsCount++;
      }
    } catch (err) {
      console.warn('[MemberChangeRequest] Officials sync notice:', err);
    }

    // Strictly ONLY Super Admin approvals propagate into the live `leaders` table
    // (preserving the Sub-Admin leadership sandbox restriction).
    if (params.isSuperAdmin) {
      try {
        const oldPhone10 = normalizePhone10(existingApp.phone);
        if (oldPhone10.length === 10) {
          const [leaderRows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM `leaders` WHERE `phone` <> ""'
          );
          for (const ldr of leaderRows) {
            const ldrPhone10 = normalizePhone10(String(ldr.phone || ''));
            if (ldrPhone10 !== oldPhone10) continue;

            const nextLeaderName =
              proposed.fullName !== undefined || proposed.salutation !== undefined
                ? `${proposed.salutation ?? existingApp.salutation ?? ''} ${proposed.fullName ?? existingApp.fullName ?? ''}`.trim()
                : String(ldr.name || '');
            const nextLeaderPhone = proposed.phone !== undefined ? proposed.phone : String(ldr.phone || '');
            const nextLeaderEmail = proposed.email !== undefined ? proposed.email : String(ldr.email || '');
            const nextLeaderPhoto = proposed.photo !== undefined ? proposed.photo : String(ldr.photo || '');

            await pool.query(
              `UPDATE \`leaders\`
               SET \`name\` = ?, \`phone\` = ?, \`email\` = ?, \`photo\` = ?, \`updated_at\` = ?
               WHERE \`id\` = ?`,
              [
                nextLeaderName,
                nextLeaderPhone,
                nextLeaderEmail,
                nextLeaderPhoto,
                nowIso,
                String(ldr.id),
              ]
            );
            syncedLeadersCount++;
          }
        }
      } catch (err) {
        console.warn('[MemberChangeRequest] Leaders sync notice:', err);
      }
    }

    await pool.query(
      `UPDATE \`member_change_requests\`
       SET \`status\` = 'approved', \`reviewed_by\` = ?, \`review_note\` = ?, \`reviewed_at\` = ?
       WHERE \`id\` = ?`,
      [cleanReviewer, cleanNote, nowIso, reqRecord.id]
    );
  } else {
    const idx = memoryRequests.findIndex((r) => r.id === reqRecord.id);
    if (idx >= 0) {
      memoryRequests[idx] = {
        ...memoryRequests[idx],
        status: 'approved',
        reviewedBy: cleanReviewer,
        reviewNote: cleanNote,
        reviewedAt: nowIso,
      };
    }
    updatedMember = {
      id: reqRecord.applicationId,
      ...reqRecord.currentSnapshot,
      ...proposed,
      ...(proposed.salutation ? { gender: deriveGenderFromSalutation(proposed.salutation) } : {}),
      updatedAt: nowIso,
    };
  }

  const updatedReq: MemberChangeRequestRecord = {
    ...reqRecord,
    status: 'approved',
    reviewedBy: cleanReviewer,
    reviewNote: cleanNote,
    reviewedAt: nowIso,
  };

  return {
    request: updatedReq,
    updatedMember,
    syncedOfficialsCount,
    syncedLeadersCount,
  };
}

export async function rejectMemberChangeRequest(params: {
  id: string;
  reviewedBy: string;
  reviewNote?: string;
}): Promise<MemberChangeRequestRecord> {
  const reqRecord = await getMemberChangeRequestById(params.id);
  if (!reqRecord) {
    throw createServiceError('NOT_FOUND', 'ही माहिती बदल विनंती आढळली नाही.');
  }
  if (reqRecord.status !== 'pending') {
    throw createServiceError('ALREADY_PROCESSED', 'ही विनंती यापूर्वीच निकाली काढण्यात आली आहे.');
  }

  const nowIso = new Date().toISOString();
  const cleanReviewer = cleanStr(params.reviewedBy || 'admin', 190);
  const cleanNote = cleanAddress(params.reviewNote || '', 300);

  if (isMysqlActive()) {
    await ensureMysqlSchema();
    const pool = getMysqlPool();
    await pool.query(
      `UPDATE \`member_change_requests\`
       SET \`status\` = 'rejected', \`reviewed_by\` = ?, \`review_note\` = ?, \`reviewed_at\` = ?
       WHERE \`id\` = ?`,
      [cleanReviewer, cleanNote, nowIso, reqRecord.id]
    );
  } else {
    const idx = memoryRequests.findIndex((r) => r.id === reqRecord.id);
    if (idx >= 0) {
      memoryRequests[idx] = {
        ...memoryRequests[idx],
        status: 'rejected',
        reviewedBy: cleanReviewer,
        reviewNote: cleanNote,
        reviewedAt: nowIso,
      };
    }
  }

  return {
    ...reqRecord,
    status: 'rejected',
    reviewedBy: cleanReviewer,
    reviewNote: cleanNote,
    reviewedAt: nowIso,
  };
}

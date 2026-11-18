import { RowDataPacket, PoolConnection } from 'mysql2/promise';
import { ensureMysqlSchema, getMysqlPool, withMysqlTransaction } from './mysqlPool';
import {
  MembershipApplication,
  NewsItem,
  LatestBannerItem,
  GovOrder,
  Leader,
  formatSequentialMemberNumber,
} from '../data/mahasanghData';
import { OfficialMember, AppointedPostItem, DEFAULT_APPOINTED_POSTS, SUPER_ADMIN_PASSWORD, DEFAULT_DISTRICT_PASSWORD } from '../data/rkMaharashtraData';
import { hashPassword, verifyPassword } from '../utils/serverAuth';
import {
  DEFAULT_COUNTER_BASELINE,
  parseMemberNumberSeq,
  computeNextSafeSeq,
  buildSequentialMemberNumber,
} from '../utils/memberNumberAllocator';
import {
  normalizePhone10,
  normalizeEmail,
  isSyntheticMahasanghEmail,
  pickBestActiveApplication,
  pickActiveDuplicateMatch,
  classifyGhostApplicationsToPurge,
} from '../utils/applicationCleanup';
import { toEnglishDigits } from '../utils/formatters';
import { computeNextVisitorStats } from '../utils/visitorCounter';

function getTodayISTString(): string {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  } catch {
    const d = new Date();
    const istTime = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
    return istTime.toISOString().split('T')[0];
  }
}

function mapAppRow(row: RowDataPacket): MembershipApplication & Record<string, any> {
  let extra: Record<string, any> = {};
  if (row.extra_json) {
    try {
      extra = JSON.parse(String(row.extra_json));
    } catch {}
  }

  return {
    ...extra,
    id: String(row.id),
    applicationNumber: String(row.application_number || extra.applicationNumber || ''),
    memberNumber: row.member_number ? String(row.member_number) : extra.memberNumber || '',
    salutation: String(row.salutation || extra.salutation || ''),
    fullName: String(row.full_name || extra.fullName || ''),
    phone: String(row.phone || extra.phone || ''),
    email: String(row.email || extra.email || ''),
    address: String(row.address || extra.address || ''),
    district: String(row.district || extra.district || ''),
    taluka: String(row.taluka || extra.taluka || ''),
    centerName: String(row.center_name || extra.centerName || ''),
    familyMembers: String(row.family_members || extra.familyMembers || ''),
    hobby: String(row.hobby || extra.hobby || ''),
    education: String(row.education || extra.education || ''),
    professionalQualification: String(row.professional_qualification || extra.professionalQualification || ''),
    professional: String(row.professional || extra.professional || ''),
    status: (row.status as 'pending' | 'approved' | 'rejected') || 'pending',
    rejectReason: row.reject_reason ? String(row.reject_reason) : extra.rejectReason || undefined,
    photo: row.photo !== null && row.photo !== undefined ? String(row.photo) : String(extra.photo || ''),
    paymentRef: row.payment_ref ? String(row.payment_ref) : extra.paymentRef || undefined,
    paymentConfirmed: Boolean(row.payment_confirmed),
    razorpayPaymentId: row.razorpay_payment_id ? String(row.razorpay_payment_id) : undefined,
    razorpayOrderId: row.razorpay_order_id ? String(row.razorpay_order_id) : undefined,
    isOfficial: Boolean(row.is_official),
    officialPost: row.official_post ? String(row.official_post) : '',
    officialDistrict: row.official_district ? String(row.official_district) : '',
    officialTaluka: row.official_taluka ? String(row.official_taluka) : '',
    approvedBy: row.approved_by ? String(row.approved_by) : undefined,
    idCardEmailSent: Boolean(row.id_card_email_sent),
    welcomeEmailSent: Boolean(row.welcome_email_sent),
    createdAt: String(row.created_at || extra.createdAt || ''),
    approvedAt: row.approved_at ? String(row.approved_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

// =========================================================================
// 1. Applications & Atomic Sequential Member Number Allocation
// =========================================================================

export async function mysqlListApplications(onlyApproved = false): Promise<MembershipApplication[]> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const sql = onlyApproved
    ? "SELECT * FROM `applications` WHERE `status` = 'approved'"
    : 'SELECT * FROM `applications`';
  const [rows] = await pool.query<RowDataPacket[]>(sql);
  const list = rows.map(mapAppRow);
  list.sort(
    (a, b) =>
      new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime()
  );
  return list;
}

export async function mysqlListApprovedDirectory(): Promise<MembershipApplication[]> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT \`id\`, \`application_number\`, \`member_number\`, \`salutation\`, \`full_name\`,
            \`phone\`, \`district\`, \`taluka\`, \`center_name\`, \`professional\`,
            \`is_official\`, \`official_post\`, \`official_district\`, \`official_taluka\`,
            \`status\`, \`approved_at\`, \`created_at\`
     FROM \`applications\`
     WHERE \`status\` = 'approved'
        OR \`member_number\` != ''
        OR \`approved_at\` != ''`
  );
  const list: MembershipApplication[] = rows.map((row) => ({
    id: String(row.id),
    applicationNumber: String(row.application_number || ''),
    memberNumber: row.member_number ? String(row.member_number) : '',
    salutation: String(row.salutation || ''),
    fullName: String(row.full_name || ''),
    phone: String(row.phone || ''),
    email: '',
    address: '',
    district: String(row.district || ''),
    taluka: String(row.taluka || ''),
    centerName: String(row.center_name || ''),
    education: '',
    professional: String(row.professional || ''),
    status: (row.status as 'pending' | 'approved' | 'rejected') || 'approved',
    isOfficial: Boolean(row.is_official),
    officialPost: row.official_post ? String(row.official_post) : '',
    officialDistrict: row.official_district ? String(row.official_district) : '',
    officialTaluka: row.official_taluka ? String(row.official_taluka) : '',
    approvedAt: row.approved_at ? String(row.approved_at) : undefined,
    createdAt: String(row.created_at || ''),
  }));
  list.sort(
    (a, b) =>
      new Date(b.approvedAt || b.createdAt || '').getTime() -
      new Date(a.approvedAt || a.createdAt || '').getTime()
  );
  return list;
}

export async function mysqlCountApprovedMembers(): Promise<number> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
     FROM \`applications\`
     WHERE \`status\` = 'approved'
        OR \`member_number\` != ''
        OR \`approved_at\` != ''`
  );
  return Number(rows[0]?.cnt || 0);
}

export async function mysqlGetApplicationById(id: string): Promise<(MembershipApplication & Record<string, any>) | null> {
  if (!id) return null;
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM `applications` WHERE `id` = ? LIMIT 1',
    [String(id).trim()]
  );
  return rows.length ? mapAppRow(rows[0]) : null;
}

export async function mysqlUpsertApplication(app: Record<string, any>): Promise<void> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const nowIso = new Date().toISOString();
  const id = String(app.id || app.applicationNumber || `app_${Date.now()}`);

  await pool.execute(
    `INSERT INTO \`applications\` (
      id, application_number, member_number, salutation, full_name, phone, email, address,
      district, taluka, center_name, family_members, hobby, education, professional_qualification,
      professional, status, reject_reason, photo, payment_ref, payment_confirmed,
      razorpay_payment_id, razorpay_order_id, is_official, official_post, official_district,
      official_taluka, approved_by, id_card_email_sent, id_card_email_sent_at,
      welcome_email_sent, welcome_email_sent_at, created_at, approved_at, rejected_at, updated_at, extra_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      application_number = VALUES(application_number),
      member_number = VALUES(member_number),
      salutation = VALUES(salutation),
      full_name = VALUES(full_name),
      phone = VALUES(phone),
      email = VALUES(email),
      address = VALUES(address),
      district = VALUES(district),
      taluka = VALUES(taluka),
      center_name = VALUES(center_name),
      family_members = VALUES(family_members),
      hobby = VALUES(hobby),
      education = VALUES(education),
      professional_qualification = VALUES(professional_qualification),
      professional = VALUES(professional),
      status = VALUES(status),
      reject_reason = VALUES(reject_reason),
      photo = VALUES(photo),
      payment_ref = VALUES(payment_ref),
      payment_confirmed = VALUES(payment_confirmed),
      razorpay_payment_id = VALUES(razorpay_payment_id),
      razorpay_order_id = VALUES(razorpay_order_id),
      is_official = VALUES(is_official),
      official_post = VALUES(official_post),
      official_district = VALUES(official_district),
      official_taluka = VALUES(official_taluka),
      approved_by = VALUES(approved_by),
      id_card_email_sent = GREATEST(id_card_email_sent, VALUES(id_card_email_sent)),
      id_card_email_sent_at = IF(VALUES(id_card_email_sent) = 1 AND id_card_email_sent_at = '', VALUES(id_card_email_sent_at), id_card_email_sent_at),
      welcome_email_sent = GREATEST(welcome_email_sent, VALUES(welcome_email_sent)),
      welcome_email_sent_at = IF(VALUES(welcome_email_sent) = 1 AND welcome_email_sent_at = '', VALUES(welcome_email_sent_at), welcome_email_sent_at),
      approved_at = VALUES(approved_at),
      rejected_at = VALUES(rejected_at),
      updated_at = VALUES(updated_at),
      extra_json = VALUES(extra_json)`,
    [
      id,
      String(app.applicationNumber || ''),
      String(app.memberNumber || ''),
      String(app.salutation || ''),
      String(app.fullName || ''),
      String(app.phone || ''),
      String(app.email || ''),
      String(app.address || ''),
      String(app.district || ''),
      String(app.taluka || ''),
      String(app.centerName || ''),
      String(app.familyMembers || ''),
      String(app.hobby || ''),
      String(app.education || ''),
      String(app.professionalQualification || ''),
      String(app.professional || ''),
      app.status === 'approved' || app.status === 'rejected' ? app.status : 'pending',
      String(app.rejectReason || ''),
      String(app.photo || ''),
      String(app.paymentRef || ''),
      app.paymentConfirmed ? 1 : 0,
      String(app.razorpayPaymentId || ''),
      String(app.razorpayOrderId || ''),
      app.isOfficial ? 1 : 0,
      app.isOfficial ? String(app.officialPost || '') : '',
      app.isOfficial ? String(app.officialDistrict || '') : '',
      app.isOfficial ? String(app.officialTaluka || '') : '',
      String(app.approvedBy || ''),
      app.idCardEmailSent ? 1 : 0,
      String(app.idCardEmailSentAt || ''),
      app.welcomeEmailSent ? 1 : 0,
      String(app.welcomeEmailSentAt || ''),
      String(app.createdAt || nowIso),
      String(app.approvedAt || ''),
      String(app.rejectedAt || ''),
      String(app.updatedAt || nowIso),
      JSON.stringify({ ...app, id }),
    ]
  );
}

export async function mysqlUpdateApplication(
  id: string,
  updates: Record<string, any>
): Promise<MembershipApplication & Record<string, any>> {
  const targetId = String(id || updates?.id || '').trim();
  if (!targetId) {
    throw new Error('सदस्य ओळख (Application ID) उपलब्ध नाही.');
  }

  const existing = await mysqlGetApplicationById(targetId);
  const nowIso = new Date().toISOString();

  const resolvedPhoto =
    updates.photo !== undefined ? String(updates.photo || '') : String(existing?.photo || '');

  const merged: Record<string, any> = {
    ...(existing || {}),
    ...updates,
    id: targetId,
    photo: resolvedPhoto,
    createdAt: existing?.createdAt || updates.createdAt || nowIso,
    idCardEmailSent: Boolean(existing?.idCardEmailSent || updates.idCardEmailSent),
    welcomeEmailSent: Boolean(existing?.welcomeEmailSent || updates.welcomeEmailSent),
    updatedAt: nowIso,
  };

  await mysqlUpsertApplication(merged);
  const fresh = await mysqlGetApplicationById(targetId);
  return fresh || (merged as MembershipApplication & Record<string, any>);
}

export async function mysqlTrackApplication(identifier: string): Promise<{
  app: MembershipApplication | null;
  verifiedFromServer: boolean;
}> {
  const queryTerm = toEnglishDigits(String(identifier || '').trim());
  if (!queryTerm) return { app: null, verifiedFromServer: true };

  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const upperTerm = queryTerm.toUpperCase();
  const digitsOnly = queryTerm.replace(/\D/g, '');
  const phone10 = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : queryTerm;

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM \`applications\`
     WHERE \`id\` = ?
        OR UPPER(\`member_number\`) = ?
        OR UPPER(\`application_number\`) = ?
        OR \`phone\` = ?
        OR \`phone\` = ?
     LIMIT 10`,
    [queryTerm, upperTerm, upperTerm, queryTerm, phone10]
  );

  if (!rows.length) return { app: null, verifiedFromServer: true };
  const mapped = rows.map(mapAppRow);
  return { app: pickBestActiveApplication(mapped), verifiedFromServer: true };
}

export async function mysqlFindExistingApplication(params: {
  phone?: string;
  email?: string;
}): Promise<{
  match: { app: MembershipApplication; matchedBy: 'phone' | 'email' } | null;
  verifiedFromServer: boolean;
}> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const cleanPhone = normalizePhone10(params.phone);
  const rawPhone = toEnglishDigits(String(params.phone || '').trim());
  const cleanEmail = normalizeEmail(params.email);

  const clauses: string[] = [];
  const values: unknown[] = [];

  if (cleanPhone.length === 10) {
    clauses.push('`phone` = ?');
    values.push(cleanPhone);
    if (rawPhone && rawPhone !== cleanPhone) {
      clauses.push('`phone` = ?');
      values.push(rawPhone);
    }
  }

  if (cleanEmail && !isSyntheticMahasanghEmail(cleanEmail)) {
    clauses.push('LOWER(`email`) = ?');
    values.push(cleanEmail);
  }

  if (clauses.length === 0) {
    return { match: null, verifiedFromServer: true };
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM \`applications\` WHERE ${clauses.join(' OR ')} LIMIT 25`,
    values
  );

  const mapped = rows.map(mapAppRow);
  const match = pickActiveDuplicateMatch(mapped, {
    phone: cleanPhone,
    email: cleanEmail,
  });

  return { match, verifiedFromServer: true };
}

export async function mysqlFindApplicationForPayment(criteria: {
  applicationId?: string;
  orderId?: string;
  phone?: string;
  email?: string;
  source: 'razorpay_checkout' | 'razorpay_webhook';
}): Promise<(MembershipApplication & Record<string, any>) | null> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();

  if (criteria.applicationId) {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `applications` WHERE `id` = ? LIMIT 1',
      [String(criteria.applicationId).trim()]
    );
    if (rows.length) return mapAppRow(rows[0]);
  }

  if (criteria.orderId) {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM `applications` WHERE `razorpay_order_id` = ? LIMIT 1',
      [String(criteria.orderId).trim()]
    );
    if (rows.length) return mapAppRow(rows[0]);
  }

  if (criteria.source === 'razorpay_webhook') {
    return null;
  }

  if (criteria.phone) {
    const digits10 = String(criteria.phone).replace(/\D/g, '').slice(-10);
    if (digits10.length === 10) {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT * FROM `applications` WHERE `phone` = ? LIMIT 10',
        [digits10]
      );
      const list = rows.map(mapAppRow);
      const best =
        list.find((d) => d.status === 'pending') ||
        list.find((d) => d.status === 'approved' && !d.paymentConfirmed) ||
        list.find((d) => d.status === 'approved');
      if (best) return best;
    }
  }

  if (criteria.email) {
    const cleanEmail = String(criteria.email).trim().toLowerCase();
    if (cleanEmail && !cleanEmail.endsWith('@mahasangh.in')) {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT * FROM `applications` WHERE LOWER(`email`) = ? LIMIT 10',
        [cleanEmail]
      );
      const list = rows.map(mapAppRow);
      const best =
        list.find((d) => d.status === 'pending') ||
        list.find((d) => d.status === 'approved' && !d.paymentConfirmed) ||
        list.find((d) => d.status === 'approved');
      if (best) return best;
    }
  }

  return null;
}

async function getMemberCounterWithConn(conn: PoolConnection): Promise<{
  totalApproved: number;
  lastMemberNumber: number;
  lastUpdated: string;
}> {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT `setting_json` FROM `system_settings` WHERE `setting_key` = 'member_counter' FOR UPDATE"
  );
  if (rows.length) {
    try {
      const parsed = JSON.parse(String(rows[0].setting_json));
      return {
        totalApproved: Number(parsed.totalApproved || 0),
        lastMemberNumber: Number(parsed.lastMemberNumber || 0),
        lastUpdated: String(parsed.lastUpdated || ''),
      };
    } catch {}
  }
  return { totalApproved: 0, lastMemberNumber: 0, lastUpdated: '' };
}

async function getTrueHighestApprovedSeqInMysql(conn: PoolConnection): Promise<number> {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT `member_number` FROM `applications` WHERE `status` = 'approved' AND `member_number` <> ''"
  );
  let highest = DEFAULT_COUNTER_BASELINE;
  for (const r of rows) {
    const seq = parseMemberNumberSeq(String(r.member_number || ''));
    if (seq > highest) highest = seq;
  }
  return highest;
}

export async function mysqlApproveApplicationAtomic(params: {
  appId: string;
  district?: string;
  extraUpdates?: Partial<MembershipApplication>;
}): Promise<{
  memberNumber: string;
  seqNumber: number;
  alreadyApproved: boolean;
  application: MembershipApplication & Record<string, any>;
}> {
  return withMysqlTransaction(async (conn) => {
    const [appRows] = await conn.query<RowDataPacket[]>(
      'SELECT * FROM `applications` WHERE `id` = ? FOR UPDATE',
      [params.appId]
    );
    const existingApp = appRows.length ? mapAppRow(appRows[0]) : ({ id: params.appId } as Record<string, any>);
    const nowIso = new Date().toISOString();
    const extraUpdates = params.extraUpdates || {};

    const existingMemberNo = String(existingApp.memberNumber || '').trim();
    if (existingApp.status === 'approved' && existingMemberNo !== '') {
      const merged: MembershipApplication & Record<string, any> = {
        ...(existingApp as MembershipApplication),
        ...extraUpdates,
        id: params.appId,
        status: 'approved',
        memberNumber: existingMemberNo,
        approvedAt: existingApp.approvedAt || nowIso,
        updatedAt: nowIso,
      };
      if (Object.keys(extraUpdates).length > 0) {
        await conn.execute(
          `UPDATE \`applications\` SET
            photo = ?, payment_confirmed = ?, payment_ref = ?, razorpay_payment_id = ?, razorpay_order_id = ?,
            approved_by = ?, updated_at = ?, extra_json = ?
           WHERE id = ?`,
          [
            String(merged.photo || ''),
            merged.paymentConfirmed ? 1 : 0,
            String(merged.paymentRef || ''),
            String(merged.razorpayPaymentId || ''),
            String(merged.razorpayOrderId || ''),
            String(merged.approvedBy || ''),
            nowIso,
            JSON.stringify(merged),
            params.appId,
          ]
        );
      }
      return {
        memberNumber: existingMemberNo,
        seqNumber: parseMemberNumberSeq(existingMemberNo),
        alreadyApproved: true,
        application: merged,
      };
    }

    const counter = await getMemberCounterWithConn(conn);
    const trueHighest = await getTrueHighestApprovedSeqInMysql(conn);
    const candidateCounter = Math.max(counter.lastMemberNumber, counter.totalApproved);
    const currentCounter =
      candidateCounter > trueHighest + 5 ? trueHighest : Math.max(candidateCounter, trueHighest);

    let nextSeq = computeNextSafeSeq({
      counterSeq: currentCounter,
      highestExistingSeq: trueHighest,
      minBaseline: DEFAULT_COUNTER_BASELINE,
    });
    const effectiveDistrict = existingApp.district || params.district || 'MAHA';
    let memberNumber = buildSequentialMemberNumber(effectiveDistrict, nextSeq);

    // Ensure no accidental manual collision
    for (let i = 0; i < 15; i++) {
      const [collRows] = await conn.query<RowDataPacket[]>(
        'SELECT `id` FROM `applications` WHERE `member_number` = ? AND `id` <> ? LIMIT 1',
        [memberNumber, params.appId]
      );
      if (collRows.length === 0) break;
      nextSeq++;
      memberNumber = buildSequentialMemberNumber(effectiveDistrict, nextSeq);
    }

    const counterPayload = {
      totalApproved: nextSeq,
      lastMemberNumber: nextSeq,
      lastUpdated: nowIso,
    };
    await conn.execute(
      `INSERT INTO \`system_settings\` (setting_key, setting_json, updated_at)
       VALUES ('member_counter', ?, ?)
       ON DUPLICATE KEY UPDATE setting_json = VALUES(setting_json), updated_at = VALUES(updated_at)`,
      [JSON.stringify(counterPayload), nowIso]
    );

    const approvalPayload: MembershipApplication & Record<string, any> = {
      ...(existingApp as MembershipApplication),
      ...extraUpdates,
      id: params.appId,
      status: 'approved',
      memberNumber,
      approvedAt: existingApp.approvedAt || nowIso,
      updatedAt: nowIso,
    };

    if (appRows.length > 0) {
      await conn.execute(
        `UPDATE \`applications\` SET
          status = 'approved',
          member_number = ?,
          payment_confirmed = ?,
          payment_ref = ?,
          razorpay_payment_id = ?,
          razorpay_order_id = ?,
          approved_by = ?,
          approved_at = ?,
          updated_at = ?,
          extra_json = ?
         WHERE id = ?`,
        [
          memberNumber,
          approvalPayload.paymentConfirmed ? 1 : 0,
          String(approvalPayload.paymentRef || ''),
          String(approvalPayload.razorpayPaymentId || ''),
          String(approvalPayload.razorpayOrderId || ''),
          String(approvalPayload.approvedBy || ''),
          String(approvalPayload.approvedAt || nowIso),
          nowIso,
          JSON.stringify(approvalPayload),
          params.appId,
        ]
      );
    } else {
      await conn.execute(
        `INSERT INTO \`applications\` (
          id, application_number, member_number, full_name, phone, email, district,
          status, payment_ref, payment_confirmed, razorpay_payment_id, razorpay_order_id,
          approved_by, created_at, approved_at, updated_at, extra_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          params.appId,
          String(approvalPayload.applicationNumber || ''),
          memberNumber,
          String(approvalPayload.fullName || ''),
          String(approvalPayload.phone || ''),
          String(approvalPayload.email || ''),
          String(effectiveDistrict),
          String(approvalPayload.paymentRef || ''),
          approvalPayload.paymentConfirmed ? 1 : 0,
          String(approvalPayload.razorpayPaymentId || ''),
          String(approvalPayload.razorpayOrderId || ''),
          String(approvalPayload.approvedBy || ''),
          String(approvalPayload.createdAt || nowIso),
          String(approvalPayload.approvedAt || nowIso),
          nowIso,
          JSON.stringify(approvalPayload),
        ]
      );
    }

    return {
      memberNumber,
      seqNumber: nextSeq,
      alreadyApproved: false,
      application: approvalPayload,
    };
  });
}

export async function mysqlGetMemberCounter(): Promise<{
  totalApproved: number;
  lastMemberNumber: number;
  lastUpdated: string;
}> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT `setting_json` FROM `system_settings` WHERE `setting_key` = 'member_counter' LIMIT 1"
  );
  if (rows.length) {
    try {
      const parsed = JSON.parse(String(rows[0].setting_json));
      return {
        totalApproved: Number(parsed.totalApproved || DEFAULT_COUNTER_BASELINE),
        lastMemberNumber: Number(parsed.lastMemberNumber || DEFAULT_COUNTER_BASELINE),
        lastUpdated: String(parsed.lastUpdated || ''),
      };
    } catch {}
  }
  return {
    totalApproved: DEFAULT_COUNTER_BASELINE,
    lastMemberNumber: DEFAULT_COUNTER_BASELINE,
    lastUpdated: new Date().toISOString(),
  };
}

export async function mysqlAllocateNextMemberNumber(
  district?: string
): Promise<{ memberNumber: string; seqNumber: number }> {
  return withMysqlTransaction(async (conn) => {
    const counter = await getMemberCounterWithConn(conn);
    const trueHighest = await getTrueHighestApprovedSeqInMysql(conn);
    const candidateCounter = Math.max(counter.lastMemberNumber, counter.totalApproved);
    const currentCounter =
      candidateCounter > trueHighest + 5 ? trueHighest : Math.max(candidateCounter, trueHighest);

    let nextSeq = computeNextSafeSeq({
      counterSeq: currentCounter,
      highestExistingSeq: trueHighest,
      minBaseline: DEFAULT_COUNTER_BASELINE,
    });
    let candidate = buildSequentialMemberNumber(district, nextSeq);

    for (let i = 0; i < 15; i++) {
      const [collRows] = await conn.query<RowDataPacket[]>(
        'SELECT `id` FROM `applications` WHERE `member_number` = ? LIMIT 1',
        [candidate]
      );
      if (collRows.length === 0) break;
      nextSeq++;
      candidate = buildSequentialMemberNumber(district, nextSeq);
    }

    const nowIso = new Date().toISOString();
    await conn.execute(
      `INSERT INTO \`system_settings\` (setting_key, setting_json, updated_at)
       VALUES ('member_counter', ?, ?)
       ON DUPLICATE KEY UPDATE setting_json = VALUES(setting_json), updated_at = VALUES(updated_at)`,
      [JSON.stringify({ totalApproved: nextSeq, lastMemberNumber: nextSeq, lastUpdated: nowIso }), nowIso]
    );

    return { memberNumber: candidate, seqNumber: nextSeq };
  });
}

export async function mysqlSyncMemberCounter(highestKnownCount: number): Promise<void> {
  if (!highestKnownCount || highestKnownCount <= 0) return;
  await withMysqlTransaction(async (conn) => {
    const counter = await getMemberCounterWithConn(conn);
    const current = Math.max(counter.lastMemberNumber, counter.totalApproved);
    if (highestKnownCount > current) {
      const nowIso = new Date().toISOString();
      await conn.execute(
        `INSERT INTO \`system_settings\` (setting_key, setting_json, updated_at)
         VALUES ('member_counter', ?, ?)
         ON DUPLICATE KEY UPDATE setting_json = VALUES(setting_json), updated_at = VALUES(updated_at)`,
        [
          JSON.stringify({ totalApproved: highestKnownCount, lastMemberNumber: highestKnownCount, lastUpdated: nowIso }),
          nowIso,
        ]
      );
    }
  });
}

export async function mysqlRejectApplication(appId: string, reason = ''): Promise<void> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const nowIso = new Date().toISOString();
  await pool.execute(
    "UPDATE `applications` SET `status` = 'rejected', `reject_reason` = ?, `rejected_at` = ?, `updated_at` = ? WHERE `id` = ?",
    [reason, nowIso, nowIso, appId]
  );
}

export async function mysqlDeleteApplication(
  appId: string,
  targetMeta?: { phone?: string; email?: string; applicationNumber?: string }
): Promise<{ deletedDocIds: string[]; removedAllForPhone: boolean }> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();

  const [existingRows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM `applications` WHERE `id` = ? LIMIT 1',
    [appId]
  );
  const existing = existingRows.length ? mapAppRow(existingRows[0]) : null;
  const cleanPhone = normalizePhone10(targetMeta?.phone || existing?.phone);
  const cleanEmail = normalizeEmail(targetMeta?.email || existing?.email);

  const idsToDelete = new Set<string>([appId]);
  let otherApprovedForSamePhone = false;

  if (cleanPhone.length === 10) {
    const [phoneRows] = await pool.query<RowDataPacket[]>(
      'SELECT `id`, `status` FROM `applications` WHERE `phone` = ?',
      [cleanPhone]
    );
    for (const r of phoneRows) {
      if (String(r.id) === appId) continue;
      if (String(r.status).toLowerCase() === 'approved') {
        otherApprovedForSamePhone = true;
      } else {
        idsToDelete.add(String(r.id));
      }
    }
  }

  if (cleanEmail && !isSyntheticMahasanghEmail(cleanEmail)) {
    const [emailRows] = await pool.query<RowDataPacket[]>(
      'SELECT `id`, `status` FROM `applications` WHERE LOWER(`email`) = ?',
      [cleanEmail]
    );
    for (const r of emailRows) {
      if (String(r.id) === appId) continue;
      if (String(r.status).toLowerCase() !== 'approved') {
        idsToDelete.add(String(r.id));
      }
    }
  }

  const deletedDocIds = Array.from(idsToDelete).filter(Boolean);
  if (deletedDocIds.length > 0) {
    const placeholders = deletedDocIds.map(() => '?').join(', ');
    await pool.execute(`DELETE FROM \`applications\` WHERE \`id\` IN (${placeholders})`, deletedDocIds);
  }

  return { deletedDocIds, removedAllForPhone: !otherApprovedForSamePhone };
}

export async function mysqlResequenceApproved(): Promise<{ count: number; message: string }> {
  const list = await mysqlListApplications(true);
  if (!list.length) {
    return { count: 0, message: 'कोणतेही अर्ज सापडले नाहीत.' };
  }

  list.sort((a, b) => {
    const da = new Date(a.approvedAt || a.createdAt || '').getTime() || 0;
    const db = new Date(b.approvedAt || b.createdAt || '').getTime() || 0;
    return da - db;
  });

  const pool = getMysqlPool();
  const nowIso = new Date().toISOString();
  let count = 0;

  for (let i = 0; i < list.length; i++) {
    const app = list[i];
    const newMemberNumber = formatSequentialMemberNumber(app.district || 'MAHA', i + 1);
    if (app.memberNumber !== newMemberNumber) {
      await pool.execute(
        'UPDATE `applications` SET `member_number` = ?, `updated_at` = ? WHERE `id` = ?',
        [newMemberNumber, nowIso, app.id]
      );
      count++;
    }
  }

  await pool.execute(
    `INSERT INTO \`system_settings\` (setting_key, setting_json, updated_at)
     VALUES ('member_counter', ?, ?)
     ON DUPLICATE KEY UPDATE setting_json = VALUES(setting_json), updated_at = VALUES(updated_at)`,
    [JSON.stringify({ totalApproved: list.length, lastMemberNumber: list.length, lastUpdated: nowIso }), nowIso]
  );

  return {
    count,
    message: `यशस्वी! ${list.length} मंजूर सदस्यांचे क्रमांक क्रमाने (1 ते ${list.length}) सलग लावले गेले.`,
  };
}

export async function mysqlResetMemberCounter(): Promise<{ highestSeq: number; message: string }> {
  const highest = await withMysqlTransaction((conn) => getTrueHighestApprovedSeqInMysql(conn));
  const pool = getMysqlPool();
  const nowIso = new Date().toISOString();
  await pool.execute(
    `INSERT INTO \`system_settings\` (setting_key, setting_json, updated_at)
     VALUES ('member_counter', ?, ?)
     ON DUPLICATE KEY UPDATE setting_json = VALUES(setting_json), updated_at = VALUES(updated_at)`,
    [JSON.stringify({ totalApproved: highest, lastMemberNumber: highest, lastUpdated: nowIso }), nowIso]
  );
  return {
    highestSeq: highest,
    message: `यशस्वी! सदस्य क्रमांक काउंटर दुरुस्त करून सर्व्हरवरील शेवटच्या खऱ्या क्रमांकावर (${highest}) सेट करण्यात आला आहे.`,
  };
}

export async function mysqlPurgeGhostApplications(): Promise<{
  totalDeleted: number;
  rejectedOrDeletedCount: number;
  corruptCount: number;
  duplicateGhostCount: number;
  remainingCount: number;
  message: string;
}> {
  const all = await mysqlListApplications(false);
  const allDocs = all.map((a) => ({ ...a, docId: a.id }));
  const classification = classifyGhostApplicationsToPurge(allDocs);
  const ids = classification.toDelete.map((d) => d.docId);

  const pool = getMysqlPool();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const placeholders = chunk.map(() => '?').join(', ');
    await pool.execute(`DELETE FROM \`applications\` WHERE \`id\` IN (${placeholders})`, chunk);
  }

  const totalDeleted = ids.length;
  const remainingCount = classification.keptIds.size;
  const message =
    totalDeleted > 0
      ? `✓ स्वच्छता पूर्ण! सिस्टममधून एकूण ${totalDeleted} जुने/नाकारलेले/दुबार घोस्ट अर्ज कायमचे काढून टाकले गेले (नाकारलेले/डिलीट: ${classification.rejectedOrDeletedCount}, दुबार प्रलंबित: ${classification.duplicateGhostCount}, अपूर्ण: ${classification.corruptCount}).`
      : '✓ सिस्टममध्ये कोणतेही नाकारलेले, अपूर्ण किंवा दुबार घोस्ट रेकॉर्ड शिल्लक नाहीत.';

  return {
    totalDeleted,
    rejectedOrDeletedCount: classification.rejectedOrDeletedCount,
    corruptCount: classification.corruptCount,
    duplicateGhostCount: classification.duplicateGhostCount,
    remainingCount,
    message,
  };
}

export async function mysqlMarkEmailSent(appId: string, field: 'idCardEmailSent' | 'welcomeEmailSent'): Promise<void> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const nowIso = new Date().toISOString();
  if (field === 'idCardEmailSent') {
    await pool.execute(
      'UPDATE `applications` SET `id_card_email_sent` = 1, `id_card_email_sent_at` = ?, `updated_at` = ? WHERE `id` = ?',
      [nowIso, nowIso, appId]
    );
  } else {
    await pool.execute(
      'UPDATE `applications` SET `welcome_email_sent` = 1, `welcome_email_sent_at` = ?, `updated_at` = ? WHERE `id` = ?',
      [nowIso, nowIso, appId]
    );
  }
}

// =========================================================================
// 2. News, Latest Banners, Gov Orders, Contacts
// =========================================================================

export async function mysqlListNews(): Promise<NewsItem[]> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM `news`');
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title || ''),
    date: String(r.publish_date || ''),
    publishDate: String(r.publish_date || ''),
    category: String(r.category || ''),
    image: r.image_url ? String(r.image_url) : undefined,
    imageUrl: r.image_url ? String(r.image_url) : undefined,
    summary: String(r.summary || ''),
    content: String(r.content || ''),
    featured: Boolean(r.featured),
    createdAt: String(r.created_at || ''),
  }));
}

export async function mysqlSaveNews(news: NewsItem): Promise<void> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  await pool.execute(
    `INSERT INTO \`news\` (id, title, publish_date, category, image_url, summary, content, featured, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title), publish_date = VALUES(publish_date), category = VALUES(category),
       image_url = VALUES(image_url), summary = VALUES(summary), content = VALUES(content),
       featured = VALUES(featured), created_at = VALUES(created_at)`,
    [
      String(news.id),
      String(news.title || ''),
      String(news.date || news.publishDate || ''),
      String(news.category || ''),
      String(news.image || news.imageUrl || ''),
      String(news.summary || ''),
      String(news.content || ''),
      news.featured ? 1 : 0,
      String(news.createdAt || new Date().toISOString()),
    ]
  );
}

export async function mysqlDeleteNews(newsId: string): Promise<void> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  await pool.execute('DELETE FROM `news` WHERE `id` = ?', [newsId]);
}

let latestBannersColumnsChecked = false;

async function ensureLatestBannersVideoColumns(): Promise<void> {
  if (latestBannersColumnsChecked) return;
  const pool = getMysqlPool();
  try {
    const [colsVideo] = await pool.query<RowDataPacket[]>("SHOW COLUMNS FROM `latest_banners` LIKE 'video_url'");
    if (!colsVideo || colsVideo.length === 0) {
      await pool.query('ALTER TABLE `latest_banners` ADD COLUMN `video_url` TEXT NULL AFTER `image_url`');
    }
    const [colsMedia] = await pool.query<RowDataPacket[]>("SHOW COLUMNS FROM `latest_banners` LIKE 'media_type'");
    if (!colsMedia || colsMedia.length === 0) {
      await pool.query("ALTER TABLE `latest_banners` ADD COLUMN `media_type` VARCHAR(32) NOT NULL DEFAULT 'image' AFTER `video_url`");
    }
    latestBannersColumnsChecked = true;
  } catch (err) {
    console.warn('ensureLatestBannersVideoColumns notice:', err);
  }
}

export async function mysqlListLatestBanners(): Promise<LatestBannerItem[]> {
  await ensureMysqlSchema();
  await ensureLatestBannersVideoColumns();
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM `latest_banners` WHERE `id` NOT IN ('banner-1', 'banner-2')"
  );
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title || ''),
    ...(r.summary ? { summary: String(r.summary) } : {}),
    imageUrl: String(r.image_url || ''),
    ...(r.video_url ? { videoUrl: String(r.video_url) } : {}),
    ...(r.media_type ? { mediaType: r.media_type as 'image' | 'video' } : {}),
    date: String(r.banner_date || ''),
    createdAt: String(r.created_at || ''),
  }));
}

export async function mysqlSaveLatestBanner(banner: LatestBannerItem): Promise<void> {
  await ensureMysqlSchema();
  await ensureLatestBannersVideoColumns();
  const pool = getMysqlPool();
  await pool.execute(
    `INSERT INTO \`latest_banners\` (id, title, summary, image_url, video_url, media_type, banner_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title), summary = VALUES(summary), image_url = VALUES(image_url),
       video_url = VALUES(video_url), media_type = VALUES(media_type),
       banner_date = VALUES(banner_date), created_at = VALUES(created_at)`,
    [
      String(banner.id),
      String(banner.title || ''),
      banner.summary ? String(banner.summary) : '',
      String(banner.imageUrl || ''),
      banner.videoUrl ? String(banner.videoUrl) : '',
      banner.mediaType || 'image',
      String(banner.date || ''),
      String(banner.createdAt || new Date().toISOString()),
    ]
  );
}

export async function mysqlDeleteLatestBanner(bannerId: string): Promise<void> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  await pool.execute('DELETE FROM `latest_banners` WHERE `id` = ?', [bannerId]);
}

export async function mysqlListGovOrders(): Promise<GovOrder[]> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM `gov_orders`');
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title || ''),
    date: String(r.order_date || ''),
    type: (r.order_type as GovOrder['type']) || 'शासन निर्णय',
    ...(r.file_url ? { fileUrl: String(r.file_url) } : {}),
    ...(r.drive_url ? { driveUrl: String(r.drive_url) } : {}),
    ...(r.summary ? { summary: String(r.summary) } : {}),
    createdAt: String(r.created_at || ''),
  }));
}

export async function mysqlSaveGovOrder(order: GovOrder): Promise<void> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  await pool.execute(
    `INSERT INTO \`gov_orders\` (id, title, order_date, order_type, file_url, drive_url, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title), order_date = VALUES(order_date), order_type = VALUES(order_type),
       file_url = VALUES(file_url), drive_url = VALUES(drive_url), summary = VALUES(summary)`,
    [
      String(order.id),
      String(order.title || ''),
      String(order.date || ''),
      String(order.type || 'शासन निर्णय'),
      String(order.fileUrl || ''),
      String(order.driveUrl || ''),
      String(order.summary || ''),
      String(order.createdAt || new Date().toISOString()),
    ]
  );
}

export async function mysqlDeleteGovOrder(id: string): Promise<void> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  await pool.execute('DELETE FROM `gov_orders` WHERE `id` = ?', [id]);
}

let contactsPhotoColumnChecked = false;

async function ensureContactsPhotoColumn(): Promise<void> {
  if (contactsPhotoColumnChecked) return;
  const pool = getMysqlPool();
  try {
    const [cols] = await pool.query<RowDataPacket[]>("SHOW COLUMNS FROM `contacts` LIKE 'photo'");
    if (!cols || cols.length === 0) {
      await pool.query('ALTER TABLE `contacts` ADD COLUMN `photo` LONGTEXT NULL AFTER `message`');
    }
    contactsPhotoColumnChecked = true;
  } catch (err) {
    console.warn('ensureContactsPhotoColumn notice:', err);
  }
}

export async function mysqlListContacts(): Promise<Record<string, any>[]> {
  await ensureMysqlSchema();
  await ensureContactsPhotoColumn();
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM `contacts` ORDER BY `created_at` DESC');
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name || ''),
    phone: String(r.phone || ''),
    email: r.email ? String(r.email) : undefined,
    district: r.district ? String(r.district) : undefined,
    subject: r.subject ? String(r.subject) : undefined,
    message: String(r.message || ''),
    photo: r.photo ? String(r.photo) : undefined,
    createdAt: String(r.created_at || ''),
  }));
}

export async function mysqlSaveContact(contact: Record<string, any>): Promise<void> {
  await ensureMysqlSchema();
  await ensureContactsPhotoColumn();
  const pool = getMysqlPool();
  await pool.execute(
    `INSERT INTO \`contacts\` (id, name, phone, email, district, subject, message, photo, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE message = VALUES(message), photo = VALUES(photo)`,
    [
      String(contact.id),
      String(contact.name || ''),
      String(contact.phone || ''),
      String(contact.email || ''),
      String(contact.district || ''),
      String(contact.subject || ''),
      String(contact.message || ''),
      String(contact.photo || ''),
      String(contact.createdAt || new Date().toISOString()),
    ]
  );
}

export async function mysqlDeleteContact(id: string): Promise<void> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  await pool.execute('DELETE FROM `contacts` WHERE `id` = ?', [id]);
}

// =========================================================================
// 3. Sub-Admins & Admin Credentials
// =========================================================================

export async function mysqlListSubAdmins(): Promise<Record<string, any>[]> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM `sub_admins`');
  return rows.map((r) => {
    let permissions = {};
    try {
      permissions = JSON.parse(String(r.permissions_json || '{}'));
    } catch {}
    return {
      id: String(r.id),
      email: String(r.email || ''),
      name: String(r.name || ''),
      password: String(r.password || ''),
      isFirstLogin: Boolean(r.is_first_login),
      isSuperAdmin: Boolean(r.is_super_admin),
      permissions,
      createdAt: String(r.created_at || ''),
      lastLoginAt: r.last_login_at ? String(r.last_login_at) : undefined,
    };
  });
}

export async function mysqlSaveSubAdmin(admin: Record<string, any>): Promise<void> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();

  const rawIncomingPwd = typeof admin.password === 'string' ? admin.password.trim() : '';
  const isFirstLogin = Boolean(admin.isFirstLogin);
  let resolvedPasswordToStore = '';

  if (rawIncomingPwd) {
    resolvedPasswordToStore = hashPassword(rawIncomingPwd);
  } else if (!isFirstLogin) {
    // Preserve existing stored password when updating sub-admin metadata/permissions from sanitized UI state
    const [existingRows] = await pool.query<RowDataPacket[]>(
      'SELECT `password` FROM `sub_admins` WHERE `id` = ? LIMIT 1',
      [String(admin.id)]
    );
    if (existingRows.length && existingRows[0].password) {
      resolvedPasswordToStore = String(existingRows[0].password);
    }
  }

  await pool.execute(
    `INSERT INTO \`sub_admins\` (id, email, name, password, is_first_login, is_super_admin, permissions_json, created_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       email = VALUES(email), name = VALUES(name), password = VALUES(password),
       is_first_login = VALUES(is_first_login), is_super_admin = VALUES(is_super_admin),
       permissions_json = VALUES(permissions_json), last_login_at = VALUES(last_login_at)`,
    [
      String(admin.id),
      String(admin.email || '').trim().toLowerCase(),
      String(admin.name || ''),
      resolvedPasswordToStore,
      isFirstLogin ? 1 : 0,
      admin.isSuperAdmin ? 1 : 0,
      JSON.stringify(admin.permissions || {}),
      String(admin.createdAt || new Date().toISOString()),
      String(admin.lastLoginAt || ''),
    ]
  );
}

export async function mysqlUpdateSubAdminPassword(email: string, newPassword: string): Promise<Record<string, any> | null> {
  await ensureMysqlSchema();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const list = await mysqlListSubAdmins();
  const target = list.find((a) => String(a.email || '').toLowerCase() === cleanEmail);
  if (!target) return null;

  const hashed = hashPassword(String(newPassword || '').trim());
  const nowIso = new Date().toISOString();
  const pool = getMysqlPool();
  await pool.execute(
    'UPDATE `sub_admins` SET `password` = ?, `is_first_login` = 0, `last_login_at` = ? WHERE `id` = ?',
    [hashed, nowIso, target.id]
  );
  return {
    ...target,
    password: '',
    hasPassword: true,
    isFirstLogin: false,
    lastLoginAt: nowIso,
  };
}

export async function mysqlTouchSubAdminLastLogin(id: string): Promise<void> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  await pool.execute('UPDATE `sub_admins` SET `last_login_at` = ? WHERE `id` = ?', [
    new Date().toISOString(),
    id,
  ]);
}

export async function mysqlDeleteSubAdmin(adminId: string): Promise<void> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  await pool.execute('DELETE FROM `sub_admins` WHERE `id` = ?', [adminId]);
}

export async function mysqlGetAdminAuth(): Promise<{ email: string; password: string }> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT `setting_json` FROM `system_settings` WHERE `setting_key` = 'admin_auth' LIMIT 1"
  );
  if (rows.length) {
    try {
      const parsed = JSON.parse(String(rows[0].setting_json));
      return {
        email: String(parsed.email || 'padmakarshinde043@gmail.com'),
        password: String(parsed.password || 'Padmakar@2027'),
      };
    } catch {}
  }
  return { email: 'padmakarshinde043@gmail.com', password: 'Padmakar@2027' };
}

export async function mysqlUpdateAdminAuth(password: string, email?: string): Promise<void> {
  const current = await mysqlGetAdminAuth();
  const cleanPwd = password.trim();
  const next = {
    email: email?.trim() || current.email,
    password: cleanPwd ? hashPassword(cleanPwd) : current.password,
    updatedAt: new Date().toISOString(),
  };
  const pool = getMysqlPool();
  await pool.execute(
    `INSERT INTO \`system_settings\` (setting_key, setting_json, updated_at)
     VALUES ('admin_auth', ?, ?)
     ON DUPLICATE KEY UPDATE setting_json = VALUES(setting_json), updated_at = VALUES(updated_at)`,
    [JSON.stringify(next), next.updatedAt]
  );
}

// =========================================================================
// 4. Daily Midnight-Reset Visitor Counter (IST)
// =========================================================================

export async function mysqlRecordOrReadVisit(incrementVisit: boolean): Promise<{ today: number; total: number }> {
  const todayDateStr = getTodayISTString();
  const nowIso = new Date().toISOString();

  return withMysqlTransaction(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT * FROM `site_stats` WHERE `stat_key` = 'visits' FOR UPDATE"
    );

    let dbTotal = 5155;
    let dbToday = 0;
    let dbDate = '';

    if (rows.length) {
      dbTotal = Math.max(Number(rows[0].total_count || 5155), 5155);
      dbToday = Math.max(Number(rows[0].today_count || 0), 0);
      dbDate = String(rows[0].last_date || '');
    }

    const next = computeNextVisitorStats({
      currentTotal: dbTotal,
      currentToday: dbToday,
      lastDate: dbDate,
      todayDateStr,
      incrementVisit,
      minBaseline: 5155,
    });

    if (next.shouldPersist) {
      await conn.execute(
        `INSERT INTO \`site_stats\` (stat_key, total_count, today_count, last_date, last_updated)
         VALUES ('visits', ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           total_count = VALUES(total_count),
           today_count = VALUES(today_count),
           last_date = VALUES(last_date),
           last_updated = VALUES(last_updated)`,
        [next.total, next.today, todayDateStr, nowIso]
      );
    }

    return { total: next.total, today: next.today };
  });
}

// =========================================================================
// 5. Second Firebase Migration Tables (Leaders, Officials, Posts, Passwords)
// =========================================================================

export async function mysqlListLeaders(): Promise<Leader[]> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM `leaders` ORDER BY `order_index` ASC');
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name || ''),
    role: String(r.role || ''),
    region: String(r.region || ''),
    education: String(r.education || ''),
    phone: String(r.phone || ''),
    ...(r.email ? { email: String(r.email) } : {}),
    ...(r.photo ? { photo: String(r.photo) } : {}),
    isKey: Boolean(r.is_key),
    ...(r.category ? { category: r.category as Leader['category'] } : {}),
  }));
}

export async function mysqlSaveLeaders(leaders: Leader[]): Promise<number> {
  const version = Date.now();
  const nowIso = new Date().toISOString();
  const seenIds = new Set<string>();

  await withMysqlTransaction(async (conn) => {
    await conn.execute('DELETE FROM `leaders`');
    for (let i = 0; i < leaders.length; i++) {
      const l = leaders[i];
      let id = String(l.id || `leader_${i}`).trim() || `leader_${i}`;
      if (seenIds.has(id)) {
        id = `${id}_${i}`;
      }
      seenIds.add(id);
      await conn.execute(
        `INSERT INTO \`leaders\` (id, order_index, name, role, region, education, phone, email, photo, is_key, category, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           order_index = VALUES(order_index),
           name = VALUES(name),
           role = VALUES(role),
           region = VALUES(region),
           education = VALUES(education),
           phone = VALUES(phone),
           email = VALUES(email),
           photo = VALUES(photo),
           is_key = VALUES(is_key),
           category = VALUES(category),
           updated_at = VALUES(updated_at)`,
        [
          id,
          i,
          String(l.name || ''),
          String(l.role || ''),
          String(l.region || ''),
          String(l.education || ''),
          String(l.phone || ''),
          String(l.email || ''),
          String(l.photo || ''),
          l.isKey ? 1 : 0,
          String(l.category || ''),
          nowIso,
        ]
      );
    }
    await conn.execute(
      `INSERT INTO \`leadership_meta\` (meta_key, meta_value, updated_at)
       VALUES ('leadership_version', ?, ?)
       ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value), updated_at = VALUES(updated_at)`,
      [String(version), nowIso]
    );
  });

  return version;
}

export async function mysqlGetLeadershipVersion(): Promise<string> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT `meta_value` FROM `leadership_meta` WHERE `meta_key` = 'leadership_version' LIMIT 1"
  );
  return rows.length ? String(rows[0].meta_value || '') : '';
}

export async function mysqlListOfficials(): Promise<OfficialMember[]> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM `officials`');
  return rows.map((r) => ({
    id: String(r.id),
    salutation: String(r.salutation || 'श्री.'),
    firstName: String(r.first_name || ''),
    middleName: String(r.middle_name || ''),
    lastName: String(r.last_name || ''),
    appointedPost: String(r.appointed_post || ''),
    district: String(r.district || ''),
    taluka: String(r.taluka || ''),
    currentCadre: String(r.current_cadre || ''),
    workingPlace: String(r.working_place || ''),
    mobile: toEnglishDigits(String(r.mobile || '')),
    updatedAt: String(r.updated_at || ''),
    photo: String(r.photo || ''),
    appointedDate: String(r.appointed_date || ''),
    orderNumber: String(r.order_number || ''),
  }));
}

export async function mysqlSaveOfficial(member: OfficialMember): Promise<void> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const nowIso = new Date().toISOString();
  await pool.execute(
    `INSERT INTO \`officials\` (
      id, salutation, first_name, middle_name, last_name, appointed_post, district, taluka,
      current_cadre, working_place, mobile, photo, appointed_date, order_number, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      salutation = VALUES(salutation), first_name = VALUES(first_name), middle_name = VALUES(middle_name),
      last_name = VALUES(last_name), appointed_post = VALUES(appointed_post), district = VALUES(district),
      taluka = VALUES(taluka), current_cadre = VALUES(current_cadre), working_place = VALUES(working_place),
      mobile = VALUES(mobile), photo = VALUES(photo), appointed_date = VALUES(appointed_date),
      order_number = VALUES(order_number), updated_at = VALUES(updated_at)`,
    [
      String(member.id),
      String(member.salutation || 'श्री.'),
      String(member.firstName || ''),
      String(member.middleName || ''),
      String(member.lastName || ''),
      String(member.appointedPost || ''),
      String(member.district || ''),
      String(member.taluka || ''),
      String(member.currentCadre || ''),
      String(member.workingPlace || ''),
      toEnglishDigits(String(member.mobile || '')),
      String(member.photo || ''),
      String(member.appointedDate || ''),
      String(member.orderNumber || ''),
      nowIso,
    ]
  );
}

export async function mysqlDeleteOfficial(id: string): Promise<void> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  await pool.execute('DELETE FROM `officials` WHERE `id` = ?', [id]);
}

export async function mysqlListDistrictPasswords(): Promise<Record<string, string>> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>('SELECT `district`, `password` FROM `district_passwords`');
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[String(r.district)] = String(r.password || '');
  }
  return map;
}

export async function mysqlListDistrictPasswordStatuses(): Promise<Record<string, string>> {
  const raw = await mysqlListDistrictPasswords();
  const statusMap: Record<string, string> = {};
  for (const [dist, stored] of Object.entries(raw)) {
    const cleanStored = String(stored || '').trim();
    if (!cleanStored || verifyPassword(DEFAULT_DISTRICT_PASSWORD, cleanStored)) {
      statusMap[dist] = DEFAULT_DISTRICT_PASSWORD;
    } else {
      statusMap[dist] = '__CUSTOM__';
    }
  }
  return statusMap;
}

export async function mysqlSetDistrictPassword(district: string, password: string): Promise<void> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const nowIso = new Date().toISOString();
  const cleanPass = String(password || '').trim();
  const stored = hashPassword(cleanPass);
  await pool.execute(
    `INSERT INTO \`district_passwords\` (district, password, updated_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE password = VALUES(password), updated_at = VALUES(updated_at)`,
    [district, stored, nowIso]
  );
}

export async function mysqlListAppointedPosts(): Promise<AppointedPostItem[]> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM `appointed_posts` ORDER BY `sort_order` ASC');
  if (!rows.length) return DEFAULT_APPOINTED_POSTS;
  return rows.map((r) => {
    const rowLevel = String(r.level || '').trim() as AppointedPostItem['level'];
    if (r.extra_json) {
      try {
        const parsed = JSON.parse(String(r.extra_json)) as AppointedPostItem;
        if (parsed && parsed.name) {
          return {
            ...parsed,
            level: parsed.level || rowLevel || (parsed.isTaluka ? 'taluka' : 'district'),
          };
        }
      } catch {}
    }
    return {
      name: String(r.title || ''),
      isTaluka: String(r.level || '') === 'taluka',
      ...(rowLevel ? { level: rowLevel } : {}),
    };
  });
}

export async function mysqlSetAppointedPosts(posts: AppointedPostItem[]): Promise<void> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM `appointed_posts`');
    for (let i = 0; i < posts.length; i++) {
      const p = posts[i];
      const level = p.level || (p.isTaluka ? 'taluka' : 'district');
      const normalized: AppointedPostItem = {
        name: String(p.name || '').trim(),
        isTaluka: level === 'taluka' || Boolean(p.isTaluka),
        level,
      };
      await conn.execute(
        'INSERT INTO `appointed_posts` (id, sort_order, title, level, extra_json) VALUES (?, ?, ?, ?, ?)',
        [`post-${i}-${Date.now()}`, i + 1, normalized.name, level, JSON.stringify(normalized)]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function mysqlGetPresidentPassword(): Promise<string> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT `meta_value` FROM `leadership_meta` WHERE `meta_key` = 'president_password' LIMIT 1"
  );
  if (rows.length && String(rows[0].meta_value || '').trim()) {
    return String(rows[0].meta_value).trim();
  }
  return SUPER_ADMIN_PASSWORD;
}

export async function mysqlIsPresidentPasswordDefault(): Promise<boolean> {
  const stored = await mysqlGetPresidentPassword();
  return verifyPassword(SUPER_ADMIN_PASSWORD, stored);
}

export async function mysqlSetPresidentPassword(newPass: string): Promise<void> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const nowIso = new Date().toISOString();
  const stored = hashPassword(newPass.trim());
  await pool.execute(
    `INSERT INTO \`leadership_meta\` (meta_key, meta_value, updated_at)
     VALUES ('president_password', ?, ?)
     ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value), updated_at = VALUES(updated_at)`,
    [stored, nowIso]
  );
}

// =========================================================================
// 6. Generic System Settings & Raw Helpers (Backup/Restore + WhatsApp Config)
// =========================================================================

export async function mysqlGetSystemSetting<T = any>(key: string): Promise<T | null> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT `setting_json` FROM `system_settings` WHERE `setting_key` = ? LIMIT 1',
    [key]
  );
  if (!rows.length || !rows[0].setting_json) return null;
  try {
    return JSON.parse(String(rows[0].setting_json)) as T;
  } catch {
    return null;
  }
}

export async function mysqlSaveSystemSetting(key: string, value: any): Promise<void> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const nowIso = new Date().toISOString();
  await pool.execute(
    `INSERT INTO \`system_settings\` (setting_key, setting_json, updated_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_json = VALUES(setting_json), updated_at = VALUES(updated_at)`,
    [key, JSON.stringify(value ?? {}), nowIso]
  );
}

export async function mysqlListSystemSettingsMap(): Promise<Record<string, any>> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>('SELECT `setting_key`, `setting_json` FROM `system_settings`');
  const map: Record<string, any> = {};
  for (const r of rows) {
    try {
      map[String(r.setting_key)] = JSON.parse(String(r.setting_json || '{}'));
    } catch {
      map[String(r.setting_key)] = String(r.setting_json || '');
    }
  }
  return map;
}

export async function mysqlGetSiteStatsRaw(): Promise<Record<string, any> | null> {
  await ensureMysqlSchema();
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM `site_stats` WHERE `stat_key` = 'visits' LIMIT 1"
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    total: Number(r.total_count || 5155),
    today: Number(r.today_count || 0),
    lastDate: String(r.last_date || ''),
    lastUpdated: String(r.last_updated || ''),
  };
}

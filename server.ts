import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
  runTransaction,
  Firestore
} from 'firebase/firestore';
import { formatSequentialMemberNumber } from './src/data/mahasanghData';
import {
  DEFAULT_COUNTER_BASELINE,
  computeNextSafeSeq,
  buildSequentialMemberNumber,
} from './src/utils/memberNumberAllocator';
import { isMysqlActive, isMysqlConfigured } from './src/db/mysqlPool';
import {
  mysqlListApplications,
  mysqlListApprovedDirectory,
  mysqlCountApprovedMembers,
  mysqlGetApplicationById,
  mysqlUpsertApplication,
  mysqlTrackApplication,
  mysqlFindExistingApplication,
  mysqlFindApplicationForPayment,
  mysqlApproveApplicationAtomic,
  mysqlGetMemberCounter,
  mysqlAllocateNextMemberNumber,
  mysqlSyncMemberCounter,
  mysqlRejectApplication,
  mysqlDeleteApplication,
  mysqlResequenceApproved,
  mysqlResetMemberCounter,
  mysqlPurgeGhostApplications,
  mysqlMarkEmailSent,
  mysqlListNews,
  mysqlSaveNews,
  mysqlDeleteNews,
  mysqlListLatestBanners,
  mysqlSaveLatestBanner,
  mysqlDeleteLatestBanner,
  mysqlListGovOrders,
  mysqlSaveGovOrder,
  mysqlDeleteGovOrder,
  mysqlListContacts,
  mysqlSaveContact,
  mysqlDeleteContact,
  mysqlListSubAdmins,
  mysqlSaveSubAdmin,
  mysqlUpdateSubAdminPassword,
  mysqlTouchSubAdminLastLogin,
  mysqlDeleteSubAdmin,
  mysqlGetAdminAuth,
  mysqlUpdateAdminAuth,
  mysqlRecordOrReadVisit,
  mysqlListLeaders,
  mysqlSaveLeaders,
  mysqlGetLeadershipVersion,
  mysqlListOfficials,
  mysqlSaveOfficial,
  mysqlDeleteOfficial,
  mysqlListDistrictPasswords,
  mysqlListDistrictPasswordStatuses,
  mysqlSetDistrictPassword,
  mysqlListAppointedPosts,
  mysqlSetAppointedPosts,
  mysqlGetPresidentPassword,
  mysqlIsPresidentPasswordDefault,
  mysqlSetPresidentPassword,
} from './src/db/mysqlRepository';
import {
  SUPER_ADMIN_PASSWORD,
  MASTER_DEV_ADMIN_PASSWORD,
  DEFAULT_DISTRICT_PASSWORD,
} from './src/data/rkMaharashtraData';
import {
  hashPassword,
  verifyPassword,
  signSessionToken,
  extractRequestSession,
  setSessionCookie,
  clearSessionCookie,
  signPaymentProof,
  verifyPaymentProof,
  SessionPayload,
  SessionRole,
} from './src/utils/serverAuth';
import {
  collectFullFirebaseDataset,
  exportFullFirebaseSqlDump,
  syncFirebaseDatasetIntoMysql,
  triggerInitialFirebaseMigrationOnBoot,
  waitForInitialMysqlMigrationIfRunning,
} from './src/db/firebaseMigrationExporter';
import {
  collectActiveWebsiteAndDatabaseBackup,
  createAndSaveBackupSnapshot,
  listBackupSnapshots,
  readBackupSnapshotBuffer,
  deleteBackupSnapshot,
  parseAndValidateBackupPayload,
  restoreWebsiteAndDatabaseBackup,
} from './src/db/backupRestoreService';
import {
  loadWhatsAppConfig,
  saveWhatsAppConfig,
  sanitizeWhatsAppConfig,
  loadWhatsAppBroadcastLogs,
  normalizeIndianWhatsAppNumber,
  formatPresidentWhatsAppMessage,
  sendSingleWhatsAppMessage,
  runWhatsAppBroadcastCampaign,
} from './src/utils/whatsappService';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Config store for Razorpay credentials (ignored from git)
const CONFIG_FILE = path.resolve(process.cwd(), 'razorpay-config.json');

interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  enabled: boolean;
}

// =========================================================================
// Server-side Firebase Firestore Initialization
// =========================================================================
let serverDb: Firestore | null = null;

function getServerFirestore(allowWhenMysqlActive = false): Firestore | null {
  if (isMysqlActive() && !allowWhenMysqlActive) {
    return null;
  }
  if (serverDb) return serverDb;
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(cfgPath)) {
      return null;
    }
    const firebaseConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    const fbApp =
      getApps().find((a) => a.name === 'mahasangh-server') ||
      initializeApp(firebaseConfig, 'mahasangh-server');
    serverDb =
      firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
        ? getFirestore(fbApp, firebaseConfig.firestoreDatabaseId)
        : getFirestore(fbApp);
    return serverDb;
  } catch (err) {
    console.error('Failed to initialize server Firestore:', err);
    return null;
  }
}

function loadRazorpayConfig(): RazorpayConfig {
  let fileCfg: Partial<RazorpayConfig> = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      fileCfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (e) {
    console.warn('Could not load razorpay-config.json:', e);
  }

  const keyId = (fileCfg.keyId || process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (fileCfg.keySecret || process.env.RAZORPAY_KEY_SECRET || '').trim();
  const webhookSecret = (fileCfg.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  const enabled =
    typeof fileCfg.enabled === 'boolean'
      ? fileCfg.enabled
      : Boolean(keyId && keySecret);

  return { keyId, keySecret, webhookSecret, enabled };
}

function saveRazorpayConfig(config: RazorpayConfig): void {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving razorpay-config.json:', e);
  }
}

function getRazorpayInstance(): { instance: Razorpay | null; config: RazorpayConfig } {
  const config = loadRazorpayConfig();
  if (!config.keyId || !config.keySecret) {
    return { instance: null, config };
  }
  const instance = new Razorpay({
    key_id: config.keyId,
    key_secret: config.keySecret
  });
  return { instance, config };
}

// =========================================================================
// SMTP Email Configuration & Membership ID Card Delivery (Nodemailer)
// =========================================================================
const EMAIL_CONFIG_FILE = path.resolve(process.cwd(), 'email-config.json');

interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  enabled: boolean;
}

function loadEmailConfig(): EmailConfig {
  let fileCfg: Partial<EmailConfig> = {};
  try {
    if (fs.existsSync(EMAIL_CONFIG_FILE)) {
      fileCfg = JSON.parse(fs.readFileSync(EMAIL_CONFIG_FILE, 'utf-8'));
    }
  } catch (e) {
    console.warn('Could not load email-config.json:', e);
  }

  const host = String(fileCfg.host || process.env.SMTP_HOST || 'mail.mahasangh.in').trim();
  const portRaw = Number(fileCfg.port || process.env.SMTP_PORT || 465);
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 465;
  const user = String(fileCfg.user || process.env.SMTP_USER || '').trim();
  const pass = String(fileCfg.pass || process.env.SMTP_PASS || '').trim();
  const from = String(fileCfg.from || process.env.SMTP_FROM || user).trim();
  const enabled = Boolean(host && user && pass);

  return { host, port, user, pass, from, enabled };
}

interface ContactMailboxConfig {
  host: string;
  imapPort: number;
  smtpPort: number;
  user: string;
  pass: string;
}

function loadContactMailboxConfig(): ContactMailboxConfig {
  let fileCfg: Record<string, any> = {};
  try {
    if (fs.existsSync(EMAIL_CONFIG_FILE)) {
      fileCfg = JSON.parse(fs.readFileSync(EMAIL_CONFIG_FILE, 'utf-8'));
    }
  } catch (e) {
    console.warn('Could not load email-config.json for contact mailbox:', e);
  }

  const nested = (fileCfg.contactMailbox && typeof fileCfg.contactMailbox === 'object')
    ? fileCfg.contactMailbox
    : {};

  const rawHost = String(
    nested.host ||
      fileCfg.contactHost ||
      process.env.CONTACT_MAIL_HOST ||
      'mail.mahasangh.in'
  ).trim();
  const host =
    !rawHost || rawHost.toLowerCase() === 'mail.savezpschools.in'
      ? 'mail.mahasangh.in'
      : rawHost;
  const imapPortRaw = Number(
    nested.imapPort ||
      fileCfg.contactImapPort ||
      process.env.CONTACT_MAIL_IMAP_PORT ||
      993
  );
  const smtpPortRaw = Number(
    nested.smtpPort ||
      fileCfg.contactSmtpPort ||
      process.env.CONTACT_MAIL_SMTP_PORT ||
      465
  );
  const user = String(
    nested.user ||
      fileCfg.contactUser ||
      process.env.CONTACT_MAIL_USER ||
      'contact@mahasangh.in'
  ).trim();
  const pass = String(
    nested.pass ||
      fileCfg.contactPass ||
      process.env.CONTACT_MAIL_PASS ||
      'Nashik@2026'
  );

  return {
    host,
    imapPort: Number.isFinite(imapPortRaw) && imapPortRaw > 0 ? imapPortRaw : 993,
    smtpPort: Number.isFinite(smtpPortRaw) && smtpPortRaw > 0 ? smtpPortRaw : 465,
    user,
    pass,
  };
}

function getContactMailHostCandidates(primaryHost: string): string[] {
  const candidates = [primaryHost, 'mail.mahasangh.in', 'panel.hostkarle.in']
    .map((h) => String(h || '').trim())
    .filter(Boolean);
  return Array.from(new Set(candidates));
}

function createContactImapClient(cfg: ContactMailboxConfig, hostOverride?: string): ImapFlow {
  return new ImapFlow({
    host: hostOverride || cfg.host,
    port: cfg.imapPort,
    secure: cfg.imapPort === 993,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
    logger: false,
    connectionTimeout: 12000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

async function connectContactImapWithFallback(
  cfg: ContactMailboxConfig
): Promise<{ client: ImapFlow; activeHost: string }> {
  const hosts = getContactMailHostCandidates(cfg.host);
  let lastErr: any = null;
  for (const hostCandidate of hosts) {
    const client = createContactImapClient(cfg, hostCandidate);
    try {
      await client.connect();
      return { client, activeHost: hostCandidate };
    } catch (err: any) {
      lastErr = err;
      await client.logout().catch(() => {});
      const errCode = String(err?.code || '').toUpperCase();
      const errMsg = String(err?.message || '');
      const isDnsOrNetworkHostErr =
        errCode === 'ENOTFOUND' ||
        errCode === 'EAI_AGAIN' ||
        errCode === 'ECONNREFUSED' ||
        /ENOTFOUND|getaddrinfo/i.test(errMsg);
      if (!isDnsOrNetworkHostErr) {
        throw err;
      }
    }
  }
  throw lastErr || new Error('IMAP connection failed');
}

function isRealMemberEmail(email?: string): boolean {
  if (!email) return false;
  const clean = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return false;
  if (/^\d{10}@mahasangh\.in$/i.test(clean)) return false;
  return true;
}

function escapeEmailHtml(val?: string): string {
  return String(val || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildMembershipEmailHtml(params: {
  salutation?: string;
  fullName: string;
  memberNumber: string;
  applicationNumber?: string;
  district?: string;
  professional?: string;
  paymentId?: string;
  hasPdfAttachment: boolean;
  trackUrl: string;
}): string {
  const fullTitle = `${params.salutation ? params.salutation + ' ' : ''}${params.fullName}`.trim();
  return `
  <div style="font-family: 'Noto Sans Devanagari', Arial, sans-serif; max-width: 620px; margin: 0 auto; background: #f7f9fc; padding: 20px; color: #0f172a;">
    <div style="background: #ffffff; border: 2px solid #0b1e33; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,0.08);">
      <div style="background: linear-gradient(135deg, #0b1e33 0%, #1e3a8a 100%); padding: 20px; text-align: center; border-bottom: 3px solid #d4af37; color: #ffffff;">
        <div style="font-size: 12px; font-weight: 700; color: #fde047; letter-spacing: 0.5px;">महाराष्ट्र राज्य</div>
        <div style="font-size: 20px; font-weight: 900; margin: 4px 0;">केंद्रप्रमुख व अधिकारी महासंघ</div>
        <div style="font-size: 11px; color: #e2e8f0;">नोंदणी क्र. श्रमिक संघ – महा/एनएसके/एन/2427</div>
      </div>

      <div style="padding: 22px; line-height: 1.65; font-size: 14px;">
        <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: 800; color: #193568;">
          सप्रेम नमस्कार ${escapeEmailHtml(fullTitle)},
        </p>
        <p style="margin: 0 0 16px 0; color: #1e293b;">
          <strong>महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाचे आजीवन सदस्यत्व</strong> आपणास यशस्वीरीत्या मंजूर करण्यात आले आहे. महासंघ परिवारात आपले मनःपूर्वक स्वागत आणि अभिनंदन!
        </p>

        <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 10px; padding: 14px 16px; margin-bottom: 18px;">
          <div style="font-size: 12px; font-weight: 800; color: #166534; margin-bottom: 8px;">अधिकृत सदस्यत्व तपशील:</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 4px 0; color: #475569;"><strong>सदस्य क्रमांक (Member ID):</strong></td>
              <td style="padding: 4px 0; color: #0b1e33; font-weight: 900; font-family: monospace; font-size: 15px;">${escapeEmailHtml(params.memberNumber)}</td>
            </tr>
            ${params.applicationNumber ? `<tr><td style="padding: 4px 0; color: #475569;"><strong>अर्ज संदर्भ क्रमांक:</strong></td><td style="padding: 4px 0; color: #0f172a; font-family: monospace;">${escapeEmailHtml(params.applicationNumber)}</td></tr>` : ''}
            ${params.professional ? `<tr><td style="padding: 4px 0; color: #475569;"><strong>पद / संवर्ग:</strong></td><td style="padding: 4px 0; color: #0f172a;">${escapeEmailHtml(params.professional)}</td></tr>` : ''}
            ${params.district ? `<tr><td style="padding: 4px 0; color: #475569;"><strong>कार्यक्षेत्र (जिल्हा):</strong></td><td style="padding: 4px 0; color: #0f172a;">${escapeEmailHtml(params.district)}</td></tr>` : ''}
            ${params.paymentId ? `<tr><td style="padding: 4px 0; color: #475569;"><strong>पेमेंट आयडी (₹220):</strong></td><td style="padding: 4px 0; color: #0f172a; font-family: monospace;">${escapeEmailHtml(params.paymentId)}</td></tr>` : ''}
          </table>
        </div>

        ${
          params.hasPdfAttachment
            ? `<div style="background: #fff7ed; border-left: 4px solid #df6b16; padding: 12px 14px; border-radius: 6px; margin-bottom: 18px; font-size: 13px; color: #7c2d12;">
                📎 <strong>आपले अधिकृत आजीवन डिजिटल आय-कार्ड (PDF)</strong> या ई-मेल सोबत जोडलेले (Attached) आहे. आपण ते येथून थेट डाऊनलोड व प्रिंट करू शकता.
              </div>`
            : `<div style="background: #fff7ed; border-left: 4px solid #df6b16; padding: 12px 14px; border-radius: 6px; margin-bottom: 18px; font-size: 13px; color: #7c2d12;">
                तुमचे पेमेंट निश्चित झाले असून आपले अधिकृत डिजिटल आय-कार्ड तयार आहे. खालील बटनावर क्लिक करून आपले PDF आय-कार्ड एका क्लिकमध्ये डाऊनलोड करा:
              </div>`
        }

        <div style="text-align: center; margin: 20px 0;">
          <a href="${escapeEmailHtml(params.trackUrl)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: #df6b16; color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; padding: 12px 24px; border-radius: 8px;">
            आय-कार्ड डाऊनलोड पोर्टल उघडा →
          </a>
        </div>

        <p style="font-size: 12px; color: #64748b; margin: 16px 0 0 0;">
          टीप: आपण कधीही <a href="https://mahasangh.in" style="color: #193568; font-weight: 700;">mahasangh.in</a> वर जाऊन "सदस्यत्व नोंदणी → अर्जाची स्थिती तपासा" मधून आपला मोबाईल नंबर किंवा सदस्य क्रमांक टाकून आय-कार्ड मिळवू शकता.
        </p>
      </div>

      <div style="background: #f1f5f9; border-top: 1px solid #cbd5e1; padding: 14px 20px; text-align: center; font-size: 11.5px; color: #475569;">
        <strong>महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ</strong><br>
        कार्यालय: 131, पाटणे, ता. मालेगाव, जि. नाशिक — 423203<br>
        संपर्क: 9860704098 | पेमेंट मदत (ज्ञानेश्वर नंदनवार): 9423484305 / 8208494368
      </div>
    </div>
  </div>`;
}

async function sendMembershipEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  pdfBase64?: string;
  fileName?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const emailCfg = loadEmailConfig();
  if (!emailCfg.enabled) {
    return { sent: false, reason: 'SMTP not configured' };
  }
  if (!isRealMemberEmail(params.to)) {
    return { sent: false, reason: 'Recipient email is not valid' };
  }

  const transporter = nodemailer.createTransport({
    host: emailCfg.host,
    port: emailCfg.port,
    secure: emailCfg.port === 465,
    auth: {
      user: emailCfg.user,
      pass: emailCfg.pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  const attachments = params.pdfBase64
    ? [
        {
          filename: params.fileName || 'Mahasangh_ID_Card.pdf',
          content: Buffer.from(params.pdfBase64, 'base64'),
          contentType: 'application/pdf',
        },
      ]
    : undefined;

  const plainText =
    params.text ||
    params.html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  await transporter.sendMail({
    from: `"महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ" <${emailCfg.from}>`,
    replyTo: emailCfg.from,
    to: params.to.trim(),
    subject: params.subject,
    text: plainText,
    html: params.html,
    attachments,
  });

  return { sent: true };
}

// =========================================================================
// Atomic Member Number Allocation & Verified Application Approval
// =========================================================================
async function hasExistingMemberNumberOnServer(
  db: Firestore,
  candidateMemberNumber: string,
  excludeAppId?: string
): Promise<boolean> {
  try {
    const appsCol = collection(db, 'applications');
    const snap = await getDocs(
      query(appsCol, where('memberNumber', '==', candidateMemberNumber), limit(3))
    );
    if (snap.empty) return false;
    return snap.docs.some((d) => d.id !== excludeAppId);
  } catch {
    return false;
  }
}

async function findApplicationForPayment(
  db: Firestore,
  criteria: { applicationId?: string; orderId?: string; phone?: string; email?: string; source: 'razorpay_checkout' | 'razorpay_webhook' }
): Promise<{ id: string; data: Record<string, any> } | null> {
  if (criteria.applicationId) {
    const directRef = doc(db, 'applications', String(criteria.applicationId).trim());
    const directSnap = await getDoc(directRef);
    if (directSnap.exists()) {
      return { id: directSnap.id, data: directSnap.data() };
    }
  }

  if (criteria.orderId) {
    const appsCol = collection(db, 'applications');
    const orderSnap = await getDocs(query(appsCol, where('razorpayOrderId', '==', criteria.orderId), limit(1)));
    if (!orderSnap.empty) {
      const docMatch = orderSnap.docs[0];
      return { id: docMatch.id, data: docMatch.data() };
    }
  }

  // STRICT SECURITY FOR WEBHOOKS: Never fall back to phone or email matching without an explicit applicationId or orderId match.
  // This prevents test webhooks from Razorpay dashboard or generic payments from auto-approving pending applications.
  if (criteria.source === 'razorpay_webhook') {
    console.warn('Webhook received without valid applicationId or matching orderId; skipping unverified fallback lookup by phone/email.');
    return null;
  }

  const appsCol = collection(db, 'applications');

  if (criteria.phone) {
    const digits10 = String(criteria.phone).replace(/\D/g, '').slice(-10);
    if (digits10.length === 10) {
      const phoneSnap = await getDocs(query(appsCol, where('phone', '==', digits10), limit(10)));
      if (!phoneSnap.empty) {
        const docs = phoneSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
        return (
          docs.find((d) => d.data.status === 'pending') ||
          docs.find((d) => d.data.status === 'approved' && !d.data.paymentConfirmed) ||
          docs.find((d) => d.data.status === 'approved') ||
          null
        );
      }
    }
  }

  if (criteria.email) {
    const cleanEmail = String(criteria.email).trim().toLowerCase();
    if (cleanEmail && !cleanEmail.endsWith('@mahasangh.in')) {
      const emailSnap = await getDocs(query(appsCol, where('email', '==', cleanEmail), limit(10)));
      if (!emailSnap.empty) {
        const docs = emailSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
        return (
          docs.find((d) => d.data.status === 'pending') ||
          docs.find((d) => d.data.status === 'approved' && !d.data.paymentConfirmed) ||
          docs.find((d) => d.data.status === 'approved') ||
          null
        );
      }
    }
  }

  return null;
}

async function approveApplicationOnServer(params: {
  applicationId?: string;
  phone?: string;
  email?: string;
  paymentId: string;
  orderId?: string;
  source: 'razorpay_checkout' | 'razorpay_webhook';
}): Promise<Record<string, any> | null> {
  if (isMysqlActive()) {
    const foundMysql = await mysqlFindApplicationForPayment({
      applicationId: params.applicationId,
      orderId: params.orderId,
      phone: params.phone,
      email: params.email,
      source: params.source,
    });
    if (!foundMysql) {
      console.warn('Razorpay MySQL approval: matching application not found for', {
        applicationId: params.applicationId,
        phone: params.phone,
        email: params.email,
      });
      return null;
    }
    const txRes = await mysqlApproveApplicationAtomic({
      appId: foundMysql.id,
      district: foundMysql.district,
      extraUpdates: {
        paymentConfirmed: true,
        paymentRef: params.paymentId,
        razorpayPaymentId: params.paymentId,
        razorpayOrderId: params.orderId || foundMysql.razorpayOrderId || '',
        approvedBy: foundMysql.approvedBy || params.source,
      },
    });
    return {
      ...txRes.application,
      alreadyApproved: txRes.alreadyApproved,
    };
  }

  const db = getServerFirestore();
  if (!db) return null;

  const found = await findApplicationForPayment(db, {
    applicationId: params.applicationId,
    orderId: params.orderId,
    phone: params.phone,
    email: params.email,
    source: params.source
  });

  if (!found) {
    console.warn('Razorpay approval: matching application not found for', {
      applicationId: params.applicationId,
      phone: params.phone,
      email: params.email
    });
    return null;
  }

  const { id, data } = found;
  const appRef = doc(db, 'applications', id);
  const counterRef = doc(db, 'settings', 'member_counter');

  // Pre-scan past any manually-assigned future numbers before entering the atomic transaction
  let floorSeq = 0;
  try {
    const preCounterSnap = await getDoc(counterRef);
    const preCounterVal = preCounterSnap.exists()
      ? Math.max(
          Number(preCounterSnap.data().lastMemberNumber || 0),
          Number(preCounterSnap.data().totalApproved || 0)
        )
      : 0;
    let probeSeq = computeNextSafeSeq({
      counterSeq: preCounterVal,
      highestExistingSeq: floorSeq,
      minBaseline: DEFAULT_COUNTER_BASELINE,
    });
    for (let i = 0; i < 15; i++) {
      const candidate = buildSequentialMemberNumber(data.district, probeSeq);
      const exists = await hasExistingMemberNumberOnServer(db, candidate, id);
      if (!exists) break;
      floorSeq = Math.max(floorSeq, probeSeq);
      probeSeq++;
    }
  } catch {
    // Proceed into transaction with current floorSeq
  }

  // Single atomic transaction reading BOTH application + central counter together
  // Prevents race conditions when Razorpay verify-payment & webhook run simultaneously.
  const txResult = await runTransaction(db, async (tx) => {
    const [appSnap, counterSnap] = await Promise.all([
      tx.get(appRef),
      tx.get(counterRef),
    ]);

    const currentAppData = (appSnap.exists() ? appSnap.data() : data) as Record<string, any>;
    const nowIso = new Date().toISOString();

    const existingMemberNo = String(currentAppData.memberNumber || '').trim();
    if (currentAppData.status === 'approved' && existingMemberNo !== '') {
      if (currentAppData.paymentConfirmed === true) {
        return {
          ...currentAppData,
          id,
          alreadyApproved: true
        };
      }
      const confirmUpdates: Record<string, any> = {
        paymentConfirmed: true,
        paymentRef: currentAppData.paymentRef || params.paymentId,
        razorpayPaymentId: currentAppData.razorpayPaymentId || params.paymentId,
        razorpayOrderId: params.orderId || currentAppData.razorpayOrderId || '',
        updatedAt: nowIso,
      };
      tx.set(appRef, confirmUpdates, { merge: true });
      return {
        ...currentAppData,
        ...confirmUpdates,
        id,
        alreadyApproved: true
      };
    }

    let currentSeq = 0;
    if (counterSnap.exists()) {
      const cData = counterSnap.data();
      const rawLast = typeof cData.lastMemberNumber === 'number' ? cData.lastMemberNumber : 0;
      const rawTotal = typeof cData.totalApproved === 'number' ? cData.totalApproved : 0;
      currentSeq = Math.max(rawLast, rawTotal);
    }

    const nextSeq = computeNextSafeSeq({
      counterSeq: currentSeq,
      highestExistingSeq: floorSeq,
      minBaseline: DEFAULT_COUNTER_BASELINE,
    });
    const memberNumber = formatSequentialMemberNumber(currentAppData.district || 'MAHA', nextSeq);

    tx.set(
      counterRef,
      {
        totalApproved: nextSeq,
        lastMemberNumber: nextSeq,
        lastUpdated: nowIso,
      },
      { merge: true }
    );

    const updates: Record<string, any> = {
      status: 'approved',
      memberNumber,
      paymentConfirmed: true,
      paymentRef: params.paymentId,
      razorpayPaymentId: params.paymentId,
      razorpayOrderId: params.orderId || currentAppData.razorpayOrderId || '',
      approvedAt: currentAppData.approvedAt || nowIso,
      updatedAt: nowIso,
      approvedBy: currentAppData.approvedBy || params.source
    };

    tx.set(appRef, updates, { merge: true });

    return {
      ...currentAppData,
      ...updates,
      id
    };
  });

  return txResult;
}

// =========================================================================
// Security Middleware (Helmet, Strict CORS, Balanced Rate Limiting, Session Guards)
// =========================================================================
const DEFAULT_ADMIN_EMAIL = 'padmakarshinde043@gmail.com';
const MASTER_RECOVERY_KEY = 'RK@Mahasangh2026';
const RK_RTDB_BASE_URL = 'https://rk2026-207ee-default-rtdb.firebaseio.com';

const ALL_SUPER_ADMIN_PERMISSIONS: Record<string, boolean> = {
  approveMembers: true,
  editMembers: true,
  manageLeadership: true,
  manageNews: true,
  manageGovOrders: true,
  manageLatestBanners: true,
  viewIdCardPreview: true,
  manageContactMessages: true,
  manageAdmins: true,
  manageRazorpay: true,
  manageCloudinary: true,
};

const ALLOWED_EXACT_ORIGINS = new Set([
  'https://mahasangh.in',
  'https://www.mahasangh.in',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://aistudio.google.com',
]);

function isAllowedCorsOrigin(origin?: string): boolean {
  if (!origin) return true; // same-origin navigation, server-to-server webhooks, curl
  if (ALLOWED_EXACT_ORIGINS.has(origin)) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    if (
      hostname === 'mahasangh.in' ||
      hostname.endsWith('.mahasangh.in') ||
      hostname.endsWith('.run.app') ||
      hostname.endsWith('.googleusercontent.com') ||
      hostname.endsWith('.web.app') ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1'
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

app.use(
  helmet({
    xFrameOptions: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    hsts: process.env.NODE_ENV === 'production'
      ? { maxAge: 31536000, includeSubDomains: true }
      : false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://checkout.razorpay.com',
          'https://apis.google.com',
          'https://www.gstatic.com',
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        mediaSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: [
          "'self'",
          'https://api.razorpay.com',
          'https://lumberjack.razorpay.com',
          'https://checkout.razorpay.com',
          'https://api.cloudinary.com',
          'https://res.cloudinary.com',
          'https://*.firebaseio.com',
          'https://*.firebaseapp.com',
          'https://*.googleapis.com',
          'https://firestore.googleapis.com',
          'https://identitytoolkit.googleapis.com',
          'https://securetoken.googleapis.com',
          'wss:',
          'ws:',
        ],
        frameSrc: [
          "'self'",
          'https://api.razorpay.com',
          'https://checkout.razorpay.com',
          'https://drive.google.com',
          'https://*.firebaseapp.com',
        ],
        frameAncestors: [
          "'self'",
          'https://aistudio.google.com',
          'https://*.googleusercontent.com',
          'https://*.google.com',
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedCorsOrigin(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
  })
);

const rateLimitMessage = {
  status: 'error',
  message: 'अनेक विनंत्या आल्यामुळे तात्पुरते थांबवले आहे. कृपया काही मिनिटांनी पुन्हा प्रयत्न करा.',
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  message: rateLimitMessage,
});

const contactMailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  message: rateLimitMessage,
});

const appSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 35,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  message: rateLimitMessage,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  skip: (req) => req.path === '/razorpay/webhook' || req.path === '/health',
  message: rateLimitMessage,
});

app.use('/api/', apiLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/email', contactMailLimiter);
app.use('/api/mailbox/send', contactMailLimiter);

function requireRoles(
  allowedRoles: SessionRole[],
  requiredPerm?: string | string[]
): express.RequestHandler {
  return (req, res, next) => {
    const session = extractRequestSession(req);
    if (!session) {
      return res.status(401).json({
        status: 'error',
        message: 'प्रवेश नाकारला: कृपया आधी अधिकृत लॉगिन करा.',
      });
    }
    if (!allowedRoles.includes(session.role)) {
      return res.status(403).json({
        status: 'error',
        message: 'आपल्याला या कृतीसाठी आवश्यक अधिकार नाहीत.',
      });
    }
    if (session.role === 'sub_admin' && requiredPerm) {
      const permsToCheck = Array.isArray(requiredPerm) ? requiredPerm : [requiredPerm];
      const hasAny = permsToCheck.some((p) => Boolean(session.permissions?.[p]));
      if (!hasAny) {
        return res.status(403).json({
          status: 'error',
          message: 'आपल्या खात्याला या विभागाचे अधिकार दिलेले नाहीत.',
        });
      }
    }
    (req as express.Request & { authSession?: SessionPayload }).authSession = session;
    next();
  };
}

const requireSuperAdmin = requireRoles(['super_admin']);
const requireAdminOrSubAdmin = (perm?: string | string[]) =>
  requireRoles(['super_admin', 'sub_admin'], perm);
const requirePresidentOrSuperAdmin = requireRoles(['super_admin', 'state_president']);
const requireOfficialEditor = requireRoles(['super_admin', 'state_president', 'district_admin']);

function sanitizeSubAdminForResponse(admin: Record<string, any>) {
  const hasPassword = Boolean(admin.hasPassword || (admin.password && String(admin.password).trim()));
  return {
    ...admin,
    password: '',
    hasPassword,
  };
}

// Raw body parser for Razorpay Webhook signature verification
app.use('/api/razorpay/webhook', express.raw({ type: 'application/json' }));
app.use('/api/backup/restore', express.json({ limit: '60mb' }));
app.use(express.json({ limit: '10mb' }));

// Ensure first-boot automatic Firebase -> MySQL migration finishes before any MySQL reads/writes/webhooks
app.use(['/api/db', '/api/auth', '/api/razorpay', '/api/email'], async (req, _res, next) => {
  if (req.path === '/mode' && req.baseUrl === '/api/db') {
    return next();
  }
  try {
    if (isMysqlActive()) {
      await waitForInitialMysqlMigrationIfRunning();
    }
  } catch (err) {
    console.warn('Wait for initial migration notice:', err);
  }
  next();
});

// Health check endpoint (no secrets exposed)
app.get('/api/health', (_req, res) => {
  const config = loadRazorpayConfig();
  const emailConfig = loadEmailConfig();
  const mysqlActive = isMysqlActive();
  res.json({
    status: 'ok',
    razorpayConfigured: Boolean(config.keyId && config.keySecret && config.enabled),
    webhookSecretConfigured: Boolean(config.webhookSecret),
    firebaseConfigured: !mysqlActive && fs.existsSync(path.resolve(process.cwd(), 'firebase-applet-config.json')),
    mysqlConfigured: isMysqlConfigured(),
    activeBackend: mysqlActive ? 'mysql' : 'firebase',
    emailConfigured: emailConfig.enabled
  });
});

// Active DB mode endpoint (used once on client boot)
app.get('/api/db/mode', (_req, res) => {
  res.json({
    backend: isMysqlActive() ? 'mysql' : 'firebase',
    mysqlConfigured: isMysqlConfigured(),
  });
});

// =========================================================================
// Server-Side Authentication Routes (/api/auth/*)
// =========================================================================

async function getServerAdminCredsUnified(): Promise<{ email: string; password: string }> {
  if (isMysqlActive()) {
    return mysqlGetAdminAuth();
  }
  const db = getServerFirestore(true);
  if (db) {
    try {
      const snap = await getDoc(doc(db, 'settings', 'admin_auth'));
      if (snap.exists()) {
        const d = snap.data();
        return {
          email: String(d.email || DEFAULT_ADMIN_EMAIL),
          password: String(d.password || 'Padmakar@2027'),
        };
      }
    } catch {}
  }
  return { email: DEFAULT_ADMIN_EMAIL, password: 'Padmakar@2027' };
}

async function getServerSubAdminsUnified(): Promise<Record<string, any>[]> {
  if (isMysqlActive()) {
    return mysqlListSubAdmins();
  }
  const db = getServerFirestore(true);
  if (db) {
    const snap = await getDocs(collection(db, 'sub_admins'));
    const list: Record<string, any>[] = [];
    snap.forEach((d) => list.push(d.data() as Record<string, any>));
    return list;
  }
  return [];
}

async function getServerDistrictPasswordsUnified(): Promise<Record<string, string>> {
  if (isMysqlActive()) {
    return mysqlListDistrictPasswords();
  }
  try {
    const r = await fetch(`${RK_RTDB_BASE_URL}/district_passwords.json`);
    if (r.ok) {
      const data = await r.json();
      if (data && typeof data === 'object') return data;
    }
  } catch {}
  return {};
}

async function getServerPresidentPasswordUnified(): Promise<string> {
  if (isMysqlActive()) {
    return mysqlGetPresidentPassword();
  }
  try {
    const r = await fetch(`${RK_RTDB_BASE_URL}/president_password.json`);
    if (r.ok) {
      const data = await r.json();
      if (typeof data === 'string' && data.trim()) return data.trim();
    }
  } catch {}
  return SUPER_ADMIN_PASSWORD;
}

app.get('/api/auth/session', (req, res) => {
  const session = extractRequestSession(req);
  res.json({ authenticated: Boolean(session), session });
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res, req);
  res.json({ status: 'success' });
});

app.post('/api/auth/admin-login', async (req, res) => {
  try {
    const inputEmail = String(req.body?.email || '').trim().toLowerCase();
    const inputPass = String(req.body?.password || '').trim();

    if (!inputEmail) {
      return res.status(400).json({ status: 'error', message: 'कृपया ई-मेल प्रविष्ट करा.' });
    }

    const [creds, subAdmins] = await Promise.all([
      getServerAdminCredsUnified(),
      getServerSubAdminsUnified(),
    ]);

    const validSuperEmail = String(creds.email || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();

    if (inputEmail === validSuperEmail || inputEmail === DEFAULT_ADMIN_EMAIL.toLowerCase()) {
      if (!inputPass) {
        return res.status(400).json({ status: 'error', message: 'कृपया पासवर्ड प्रविष्ट करा.' });
      }
      const isPassValid =
        verifyPassword(inputPass, creds.password) ||
        verifyPassword(inputPass, MASTER_RECOVERY_KEY);

      if (!isPassValid) {
        return res.status(401).json({ status: 'error', message: 'चुकीचा पासवर्ड. कृपया पुन्हा प्रयत्न करा.' });
      }

      const token = signSessionToken({
        role: 'super_admin',
        email: validSuperEmail,
        name: 'मुख्य प्रशासक (Super Admin)',
        permissions: ALL_SUPER_ADMIN_PERMISSIONS,
      });
      setSessionCookie(res, token, req);

      return res.json({
        status: 'success',
        token,
        user: {
          id: 'super-admin',
          email: validSuperEmail,
          name: 'मुख्य प्रशासक (Super Admin)',
          isSuperAdmin: true,
          permissions: ALL_SUPER_ADMIN_PERMISSIONS,
          createdAt: '',
        },
        subAdmins: subAdmins.map(sanitizeSubAdminForResponse),
      });
    }

    const matchingSubAdmin = subAdmins.find(
      (a) => String(a.email || '').trim().toLowerCase() === inputEmail
    );
    if (!matchingSubAdmin) {
      return res.status(401).json({
        status: 'error',
        message: 'अवैध ई-मेल. कृपया अधिकृत ॲडमिन ई-मेल वापरा किंवा मुख्य प्रशासकाशी संपर्क साधा.',
      });
    }

    if (matchingSubAdmin.isFirstLogin || !matchingSubAdmin.password) {
      return res.json({
        status: 'first_login',
        email: matchingSubAdmin.email,
        name: matchingSubAdmin.name || '',
      });
    }

    if (!inputPass) {
      return res.status(400).json({ status: 'error', message: 'कृपया पासवर्ड प्रविष्ट करा.' });
    }

    if (!verifyPassword(inputPass, String(matchingSubAdmin.password || ''))) {
      return res.status(401).json({ status: 'error', message: 'चुकीचा पासवर्ड. कृपया पुन्हा प्रयत्न करा.' });
    }

    if (isMysqlActive()) {
      await mysqlTouchSubAdminLastLogin(String(matchingSubAdmin.id)).catch(() => {});
    }

    const token = signSessionToken({
      role: 'sub_admin',
      email: String(matchingSubAdmin.email).toLowerCase(),
      name: String(matchingSubAdmin.name || ''),
      permissions: (matchingSubAdmin.permissions || {}) as Record<string, boolean>,
    });
    setSessionCookie(res, token, req);

    return res.json({
      status: 'success',
      token,
      user: sanitizeSubAdminForResponse(matchingSubAdmin),
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: 'लॉगिन करताना त्रुटी आली: ' + (err?.message || 'Error') });
  }
});

app.post('/api/auth/sub-admin-first-login', async (req, res) => {
  try {
    const targetEmail = String(req.body?.email || '').trim().toLowerCase();
    const newPassword = String(req.body?.newPassword || '').trim();

    if (!targetEmail || !newPassword || newPassword.length < 4) {
      return res.status(400).json({ status: 'error', message: 'पासवर्ड किमान 4 अक्षरांचा असावा.' });
    }

    const subAdmins = await getServerSubAdminsUnified();
    const matching = subAdmins.find(
      (a) => String(a.email || '').trim().toLowerCase() === targetEmail
    );

    if (!matching || (!matching.isFirstLogin && Boolean(matching.password))) {
      return res.status(403).json({
        status: 'error',
        message: 'पहिल्या लॉगिनची परवानगी उपलब्ध नाही किंवा पासवर्ड आधीच सेट आहे.',
      });
    }

    let updatedUser: Record<string, any> | null = null;
    if (isMysqlActive()) {
      updatedUser = await mysqlUpdateSubAdminPassword(targetEmail, newPassword);
    } else {
      const db = getServerFirestore(true);
      if (db) {
        const updated = {
          ...matching,
          password: hashPassword(newPassword),
          isFirstLogin: false,
          lastLoginAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'sub_admins', String(matching.id)), updated);
        updatedUser = sanitizeSubAdminForResponse(updated);
      }
    }

    if (!updatedUser) {
      return res.status(404).json({ status: 'error', message: 'सब-ॲडमिन खाते सापडले नाही.' });
    }

    const token = signSessionToken({
      role: 'sub_admin',
      email: targetEmail,
      name: String(updatedUser.name || ''),
      permissions: (updatedUser.permissions || {}) as Record<string, boolean>,
    });
    setSessionCookie(res, token, req);

    res.json({
      status: 'success',
      token,
      user: updatedUser,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/auth/admin-change-password', requireAdminOrSubAdmin(), async (req, res) => {
  try {
    const session = (req as express.Request & { authSession?: SessionPayload }).authSession!;
    const currentPassword = String(req.body?.currentPassword || '').trim();
    const newPassword = String(req.body?.newPassword || '').trim();

    if (!currentPassword || !newPassword || newPassword.length < 4) {
      return res.status(400).json({ status: 'error', message: 'नवीन पासवर्ड किमान 4 अक्षरांचा असावा.' });
    }

    if (session.role === 'super_admin') {
      const creds = await getServerAdminCredsUnified();
      if (
        !verifyPassword(currentPassword, creds.password) &&
        !verifyPassword(currentPassword, MASTER_RECOVERY_KEY)
      ) {
        return res.status(401).json({ status: 'error', message: 'सध्याचा चालू पासवर्ड चुकीचा आहे.' });
      }

      if (isMysqlActive()) {
        await mysqlUpdateAdminAuth(newPassword);
      } else {
        const db = getServerFirestore(true);
        if (!db) return res.status(500).json({ status: 'error', message: 'Firestore unavailable' });
        await setDoc(
          doc(db, 'settings', 'admin_auth'),
          { email: creds.email, password: hashPassword(newPassword), updatedAt: new Date().toISOString() },
          { merge: true }
        );
      }
      return res.json({ status: 'success' });
    }

    // Sub-admin changing own password
    const subAdmins = await getServerSubAdminsUnified();
    const target = subAdmins.find(
      (a) => String(a.email || '').trim().toLowerCase() === String(session.email || '').toLowerCase()
    );
    if (!target || !verifyPassword(currentPassword, String(target.password || ''))) {
      return res.status(401).json({ status: 'error', message: 'सध्याचा चालू पासवर्ड चुकीचा आहे.' });
    }

    if (isMysqlActive()) {
      await mysqlUpdateSubAdminPassword(String(target.email), newPassword);
    } else {
      const db = getServerFirestore(true);
      if (!db) return res.status(500).json({ status: 'error', message: 'Firestore unavailable' });
      await setDoc(
        doc(db, 'sub_admins', String(target.id)),
        { ...target, password: hashPassword(newPassword), isFirstLogin: false, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    }
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/auth/district-login', async (req, res) => {
  try {
    const district = String(req.body?.district || '').trim();
    const input = String(req.body?.password || '').trim();
    if (!district || !input) {
      return res.status(400).json({ status: 'error', message: 'कृपया पासवर्ड प्रविष्ट करा.' });
    }

    const storedPresPass = await getServerPresidentPasswordUnified();
    if (
      verifyPassword(input, storedPresPass) ||
      verifyPassword(input, SUPER_ADMIN_PASSWORD) ||
      verifyPassword(input, MASTER_DEV_ADMIN_PASSWORD)
    ) {
      const token = signSessionToken({ role: 'state_president', district });
      setSessionCookie(res, token, req);
      return res.json({ status: 'success', role: 'state_president', isSuperAdmin: true, token });
    }

    const passMap = await getServerDistrictPasswordsUnified();
    const storedDistrictPass =
      passMap[district] ||
      (district === 'अहिल्यानगर' ? passMap['अहमदनगर'] : '') ||
      DEFAULT_DISTRICT_PASSWORD;

    const isStillDefault =
      !storedDistrictPass || verifyPassword(DEFAULT_DISTRICT_PASSWORD, storedDistrictPass);

    if (isStillDefault && input === DEFAULT_DISTRICT_PASSWORD) {
      return res.json({ status: 'require_initial_password', district });
    }

    if (verifyPassword(input, storedDistrictPass)) {
      const token = signSessionToken({ role: 'district_admin', district });
      setSessionCookie(res, token, req);
      return res.json({ status: 'success', role: 'district_admin', district, token });
    }

    return res.status(401).json({
      status: 'error',
      message: `चुकीचा पासवर्ड! आपण फक्त '${district}' जिल्ह्याचा पासवर्ड टाकूनच संपादन करू शकता.`,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/auth/district-set-initial-password', async (req, res) => {
  try {
    const district = String(req.body?.district || '').trim();
    const newPassword = String(req.body?.newPassword || '').trim();

    if (!district || !newPassword || newPassword.length < 4 || newPassword === DEFAULT_DISTRICT_PASSWORD) {
      return res.status(400).json({
        status: 'error',
        message: `कृपया किमान ४ अक्षरी सुरक्षित पासवर्ड तयार करा (डिफॉल्ट '${DEFAULT_DISTRICT_PASSWORD}' वगळता)!`,
      });
    }

    const passMap = await getServerDistrictPasswordsUnified();
    const storedDistrictPass =
      passMap[district] ||
      (district === 'अहिल्यानगर' ? passMap['अहमदनगर'] : '') ||
      DEFAULT_DISTRICT_PASSWORD;

    const isStillDefault =
      !storedDistrictPass || verifyPassword(DEFAULT_DISTRICT_PASSWORD, storedDistrictPass);

    if (!isStillDefault) {
      return res.status(403).json({
        status: 'error',
        message: 'या जिल्ह्याचा पासवर्ड आधीच सेट आहे. कृपया नवीन पासवर्डने लॉगिन करा.',
      });
    }

    if (isMysqlActive()) {
      await mysqlSetDistrictPassword(district, newPassword);
    } else {
      await fetch(`${RK_RTDB_BASE_URL}/district_passwords/${encodeURIComponent(district)}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hashPassword(newPassword)),
      });
    }

    const token = signSessionToken({ role: 'district_admin', district });
    setSessionCookie(res, token, req);
    res.json({ status: 'success', role: 'district_admin', district, token });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/auth/president-login', async (req, res) => {
  try {
    const input = String(req.body?.password || '').trim();
    if (!input) {
      return res.status(400).json({ status: 'error', message: 'कृपया पासवर्ड प्रविष्ट करा.' });
    }

    if (verifyPassword(input, MASTER_DEV_ADMIN_PASSWORD)) {
      const token = signSessionToken({ role: 'state_president' });
      setSessionCookie(res, token, req);
      return res.json({ status: 'success', isMasterKey: true, token });
    }

    const storedPresPass = await getServerPresidentPasswordUnified();
    const isStillDefault = !storedPresPass || verifyPassword(SUPER_ADMIN_PASSWORD, storedPresPass);

    if (isStillDefault && input === SUPER_ADMIN_PASSWORD) {
      return res.json({ status: 'require_initial_password' });
    }

    if (verifyPassword(input, storedPresPass)) {
      const token = signSessionToken({ role: 'state_president' });
      setSessionCookie(res, token, req);
      return res.json({ status: 'success', token });
    }

    return res.status(401).json({
      status: 'error',
      message: 'चुकीचा पासवर्ड! केवळ संस्थापक राज्याध्यक्षच हे लॉगिन करू शकतात.',
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/auth/president-set-initial-password', async (req, res) => {
  try {
    const newPassword = String(req.body?.newPassword || '').trim();
    if (!newPassword || newPassword.length < 4 || newPassword === SUPER_ADMIN_PASSWORD) {
      return res.status(400).json({
        status: 'error',
        message: 'कृपया सुरक्षित व नवीन पासवर्ड प्रविष्ट करा (RK2026 व्यतिरिक्त)!',
      });
    }

    const storedPresPass = await getServerPresidentPasswordUnified();
    const isStillDefault = !storedPresPass || verifyPassword(SUPER_ADMIN_PASSWORD, storedPresPass);
    if (!isStillDefault) {
      return res.status(403).json({
        status: 'error',
        message: 'राज्याध्यक्ष पासवर्ड आधीच सेट आहे.',
      });
    }

    if (isMysqlActive()) {
      await mysqlSetPresidentPassword(newPassword);
    } else {
      await fetch(`${RK_RTDB_BASE_URL}/president_password.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hashPassword(newPassword)),
      });
    }

    const token = signSessionToken({ role: 'state_president' });
    setSessionCookie(res, token, req);
    res.json({ status: 'success', token });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/auth/president-change-password', requirePresidentOrSuperAdmin, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '').trim();
    const newPassword = String(req.body?.newPassword || '').trim();

    if (!currentPassword || !newPassword || newPassword.length < 4) {
      return res.status(400).json({ status: 'error', message: 'कृपया किमान ४ अक्षरी नवीन पासवर्ड प्रविष्ट करा.' });
    }

    const storedPresPass = await getServerPresidentPasswordUnified();
    const isCurrentValid =
      verifyPassword(currentPassword, storedPresPass) ||
      verifyPassword(currentPassword, MASTER_DEV_ADMIN_PASSWORD);

    if (!isCurrentValid) {
      return res.status(401).json({ status: 'error', message: 'सध्याचा पासवर्ड चुकीचा आहे!' });
    }

    if (verifyPassword(newPassword, storedPresPass)) {
      return res.status(400).json({ status: 'error', message: 'कृपया नवीन व वेगळा पासवर्ड प्रविष्ट करा!' });
    }

    if (isMysqlActive()) {
      await mysqlSetPresidentPassword(newPassword);
    } else {
      await fetch(`${RK_RTDB_BASE_URL}/president_password.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hashPassword(newPassword)),
      });
    }

    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

// One-time AI Studio Dev download route for the 50-page Technical Manual PDF (disabled in production)
app.get('/api/offline-manual-50p', (_req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).send('Not found');
  }
  const pdfPath = path.resolve(
    process.cwd(),
    '.aistudio',
    'artifacts',
    'brain',
    'cd564686-4752-4089-b99f-1bd89d027f82',
    'Mahasangh_50_Page_Developer_Manual.pdf'
  );
  if (!fs.existsSync(pdfPath)) {
    return res.status(404).send('Manual PDF not found');
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="Mahasangh_50_Page_Technical_Manual_Marathi.pdf"'
  );
  res.setHeader('Cache-Control', 'no-store');
  return res.sendFile(pdfPath, { dotfiles: 'allow' });
});

// Send Membership Official PDF ID Card via SMTP
app.post('/api/email/send-id-card', async (req, res) => {
  try {
    const {
      applicationId,
      toEmail,
      fullName,
      salutation,
      memberNumber,
      applicationNumber,
      district,
      professional,
      pdfBase64,
      fileName
    } = req.body || {};

    if (!applicationId || typeof pdfBase64 !== 'string' || pdfBase64.length < 100) {
      return res.status(400).json({
        status: 'error',
        sent: false,
        message: 'अपूर्ण अर्ज किंवा PDF तपशील.'
      });
    }

    if (pdfBase64.length > 7 * 1024 * 1024) {
      return res.status(400).json({
        status: 'error',
        sent: false,
        message: 'PDF आकार मर्यादेपेक्षा जास्त आहे.'
      });
    }

    let appData: Record<string, any> | null = null;
    let firestoreAppRef: ReturnType<typeof doc> | null = null;

    if (isMysqlActive()) {
      const tracked = await mysqlTrackApplication(String(applicationId).trim());
      if (!tracked.app) {
        return res.status(404).json({ status: 'error', sent: false, message: 'अर्ज सापडला नाही.' });
      }
      appData = tracked.app;
    } else {
      const db = getServerFirestore();
      if (!db) {
        return res.status(500).json({ status: 'error', sent: false, message: 'Firestore अनुपलब्ध आहे.' });
      }
      firestoreAppRef = doc(db, 'applications', String(applicationId).trim());
      const appSnap = await getDoc(firestoreAppRef);
      if (!appSnap.exists()) {
        return res.status(404).json({ status: 'error', sent: false, message: 'अर्ज सापडला नाही.' });
      }
      appData = appSnap.data();
    }

    if (appData.status !== 'approved' || appData.paymentConfirmed !== true) {
      return res.status(403).json({
        status: 'error',
        sent: false,
        message: 'पेमेंट व सदस्यत्व मंजूर झाल्याशिवाय आय-कार्ड ई-मेल पाठवता येत नाही.'
      });
    }

    if (appData.idCardEmailSent === true) {
      return res.json({ status: 'ok', sent: true, alreadySent: true });
    }

    const recipientEmail = isRealMemberEmail(appData.email)
      ? String(appData.email).trim()
      : isRealMemberEmail(toEmail)
        ? String(toEmail).trim()
        : '';

    if (!recipientEmail) {
      return res.json({ status: 'skipped', sent: false, reason: 'वैध ई-मेल पत्ता उपलब्ध नाही.' });
    }

    const emailConfig = loadEmailConfig();
    if (!emailConfig.enabled) {
      return res.json({ status: 'skipped', sent: false, reason: 'SMTP कॉन्फिगर केलेले नाही.' });
    }

    const resolvedMemberNo = String(appData.memberNumber || memberNumber || '');
    const origin = req.get('host')?.includes('mahasangh.in')
      ? 'https://mahasangh.in'
      : `${req.protocol}://${req.get('host')}`;
    const trackUrl = `${origin}/?track=${encodeURIComponent(resolvedMemberNo || appData.phone || appData.applicationNumber || '')}`;

    const html = buildMembershipEmailHtml({
      salutation: appData.salutation || salutation,
      fullName: appData.fullName || fullName || 'सदस्य',
      memberNumber: resolvedMemberNo,
      applicationNumber: appData.applicationNumber || applicationNumber,
      district: appData.district || district,
      professional: appData.professional || professional,
      paymentId: appData.razorpayPaymentId || appData.paymentRef,
      hasPdfAttachment: true,
      trackUrl
    });

    const safeFileName =
      typeof fileName === 'string' && /^[a-zA-Z0-9._-]+\.pdf$/i.test(fileName)
        ? fileName
        : `Mahasangh_ID_${resolvedMemberNo.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Card'}.pdf`;

    const result = await sendMembershipEmail({
      to: recipientEmail,
      subject: `महासंघ आजीवन सदस्यत्व मंजूर व अधिकृत आय-कार्ड (${resolvedMemberNo})`,
      html,
      text: `सप्रेम नमस्कार ${appData.fullName || fullName || 'सदस्य'}, महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाचे आपले आजीवन सदस्यत्व (सदस्य क्र.: ${resolvedMemberNo}) मंजूर झाले आहे. आय-कार्ड PDF सोबत जोडलेले आहे किंवा येथून डाऊनलोड करा: ${trackUrl}`,
      pdfBase64,
      fileName: safeFileName
    });

    if (result.sent) {
      if (isMysqlActive()) {
        await mysqlMarkEmailSent(String(appData.id || applicationId).trim(), 'idCardEmailSent');
      } else if (firestoreAppRef) {
        await setDoc(
          firestoreAppRef,
          {
            idCardEmailSent: true,
            idCardEmailSentAt: new Date().toISOString()
          },
          { merge: true }
        );
      }
      console.log(`✓ Sent PDF ID Card email to ${recipientEmail} (${resolvedMemberNo})`);
      return res.json({ status: 'success', sent: true, to: recipientEmail });
    }

    return res.json({ status: 'skipped', sent: false, reason: result.reason });
  } catch (err: any) {
    console.error('Error sending ID card email:', err);
    res.status(500).json({
      status: 'error',
      sent: false,
      message: 'ई-मेल पाठवताना त्रुटी: ' + (err.message || 'SMTP Error')
    });
  }
});

// =========================================================================
// HostKarle MySQL API Routes (/api/db/*) & Migration Exporter (/api/migration/*)
// =========================================================================

app.get('/api/migration/counts', requireSuperAdmin, async (_req, res) => {
  try {
    const db = getServerFirestore(true);
    if (!db) return res.status(500).json({ status: 'error', message: 'Firestore unavailable' });
    const { counts, warnings } = await collectFullFirebaseDataset(db);
    res.json({ status: 'ok', counts, warnings, mysqlConfigured: isMysqlConfigured() });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.get('/api/migration/export-sql', requireSuperAdmin, async (_req, res) => {
  try {
    const db = getServerFirestore(true);
    if (!db) return res.status(500).json({ status: 'error', message: 'Firestore unavailable' });
    const { sql, counts } = await exportFullFirebaseSqlDump(db);
    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mahasangh_hostkarle_backup.sql"');
    res.setHeader('X-Migration-Counts', JSON.stringify(counts));
    res.send(sql);
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'SQL Export failed' });
  }
});

app.post('/api/migration/sync-to-mysql', requireSuperAdmin, async (_req, res) => {
  try {
    if (!isMysqlConfigured()) {
      return res.status(400).json({ status: 'error', message: 'MySQL is not configured yet.' });
    }
    const db = getServerFirestore(true);
    if (!db) return res.status(500).json({ status: 'error', message: 'Firestore unavailable' });
    const { dataset, warnings } = await collectFullFirebaseDataset(db);
    const syncedCounts = await syncFirebaseDatasetIntoMysql(dataset);
    res.json({ status: 'success', counts: syncedCounts, warnings });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'MySQL Sync failed' });
  }
});

// =========================================================================
// Super Admin 1-Click Full Website + Database Backup & Restore (/api/backup/*)
// =========================================================================

app.get('/api/backup/list', requireSuperAdmin, (_req, res) => {
  try {
    res.json({
      status: 'ok',
      activeBackend: isMysqlActive() ? 'mysql' : 'firebase',
      snapshots: listBackupSnapshots(),
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Could not list backups' });
  }
});

app.post('/api/backup/create', requireSuperAdmin, async (req, res) => {
  try {
    const session = (req as express.Request & { authSession?: SessionPayload }).authSession;
    const { snapshot, warnings } = await createAndSaveBackupSnapshot({
      createdBy: session?.email || 'super_admin',
      firestoreDb: getServerFirestore(true),
      prefix: 'mahasangh_backup',
    });
    res.json({ status: 'success', snapshot, warnings });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'बॅकअप तयार करताना त्रुटी आली.' });
  }
});

app.get('/api/backup/download/:fileName', requireSuperAdmin, (req, res) => {
  try {
    const { fileName, buffer } = readBackupSnapshotBuffer(req.params.fileName);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(404).json({ status: 'error', message: err?.message || 'Backup file not found' });
  }
});

app.get('/api/backup/download-active-sql', requireSuperAdmin, async (req, res) => {
  try {
    const session = (req as express.Request & { authSession?: SessionPayload }).authSession;
    const { bundle, counts } = await collectActiveWebsiteAndDatabaseBackup({
      createdBy: session?.email || 'super_admin',
      firestoreDb: getServerFirestore(true),
    });
    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="mahasangh_active_db_${new Date().toISOString().slice(0, 10)}.sql"`
    );
    res.setHeader('X-Migration-Counts', JSON.stringify(counts));
    res.send(bundle.sqlDump || '');
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'SQL Export failed' });
  }
});

app.post('/api/backup/restore', requireSuperAdmin, async (req, res) => {
  try {
    const session = (req as express.Request & { authSession?: SessionPayload }).authSession;
    const snapshotFileName = String(req.body?.snapshotFileName || '').trim();
    const fileBase64 = String(req.body?.fileBase64 || '').trim();

    if (!snapshotFileName && !fileBase64) {
      return res.status(400).json({
        status: 'error',
        message: 'कृपया रिस्टोअर करण्यासाठी सर्व्हर बॅकअप निवडा किंवा .mhsbak.gz फाइल अपलोड करा.',
      });
    }

    const rawInput = snapshotFileName
      ? readBackupSnapshotBuffer(snapshotFileName).buffer
      : fileBase64;
    const bundle = parseAndValidateBackupPayload(rawInput);

    const result = await restoreWebsiteAndDatabaseBackup({
      bundle,
      firestoreDb: getServerFirestore(true),
      createdBy: session?.email || 'super_admin',
    });

    res.json({
      status: 'success',
      restoredFrom: bundle.createdAt,
      sourceBackend: bundle.sourceBackend,
      ...result,
    });
  } catch (err: any) {
    res.status(400).json({
      status: 'error',
      message: err?.message || 'रिस्टोअर प्रक्रिया अयशस्वी झाली.',
    });
  }
});

app.delete('/api/backup/:fileName', requireSuperAdmin, (req, res) => {
  try {
    deleteBackupSnapshot(req.params.fileName);
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Delete failed' });
  }
});

// =========================================================================
// Super Admin WhatsApp API Configuration & Broadcast Routes (/api/whatsapp/*)
// =========================================================================

app.get('/api/whatsapp/config', requireSuperAdmin, async (_req, res) => {
  try {
    const cfg = await loadWhatsAppConfig(getServerFirestore(true));
    res.json({ status: 'ok', config: sanitizeWhatsAppConfig(cfg) });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error loading WhatsApp config' });
  }
});

app.post('/api/whatsapp/config', requireSuperAdmin, async (req, res) => {
  try {
    const saved = await saveWhatsAppConfig(req.body || {}, getServerFirestore(true));
    res.json({ status: 'success', config: sanitizeWhatsAppConfig(saved) });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'WhatsApp सेटिंग्ज सेव्ह करताना त्रुटी आली.' });
  }
});

app.get('/api/whatsapp/logs', requireSuperAdmin, async (_req, res) => {
  try {
    const logs = await loadWhatsAppBroadcastLogs(getServerFirestore(true));
    res.json({ status: 'ok', logs });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error loading logs' });
  }
});

app.post('/api/whatsapp/test', requireSuperAdmin, async (req, res) => {
  try {
    const cfg = await loadWhatsAppConfig(getServerFirestore(true));
    const phone91 = normalizeIndianWhatsAppNumber(req.body?.phone);
    if (!phone91) {
      return res.status(400).json({
        status: 'error',
        message: 'कृपया चाचणीसाठी वैध १० अंकी भारतीय मोबाईल नंबर प्रविष्ट करा.',
      });
    }
    const senderName = String(req.body?.senderName || cfg.defaultSenderName || '').trim();
    const senderTitle = String(req.body?.senderTitle || cfg.defaultSenderTitle || '').trim();
    const photoUrl = String(req.body?.photoUrl || cfg.defaultSenderPhoto || '').trim();
    const messageTemplate = String(req.body?.message || '').trim();
    if (!messageTemplate) {
      return res.status(400).json({ status: 'error', message: 'कृपया संदेशाचा मजकूर भरा.' });
    }

    const formattedText = formatPresidentWhatsAppMessage({
      messageTemplate,
      senderName,
      senderTitle,
      recipient: { name: 'चाचणी प्राप्तकर्ता (Test)', role: 'सदस्य', district: 'महाराष्ट्र' },
      includeSignatureHeader: req.body?.includeSignatureHeader !== false,
    });

    const originHint = `${req.protocol}://${req.get('host')}`;
    const result = await sendSingleWhatsAppMessage({
      config: cfg,
      phone91,
      formattedText,
      photoUrl,
      recipient: { name: 'Test Admin', role: 'Admin', district: 'Maharashtra' },
      senderName,
      senderTitle,
      originHint,
    });

    if (!result.ok) {
      return res.status(400).json({
        status: 'error',
        message: result.error || 'चाचणी संदेश पाठवता आला नाही.',
      });
    }

    res.json({
      status: 'success',
      phone: phone91,
      messageId: result.messageId || '',
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'WhatsApp चाचणी अयशस्वी' });
  }
});

app.post('/api/whatsapp/broadcast', requireSuperAdmin, async (req, res) => {
  try {
    const session = (req as express.Request & { authSession?: SessionPayload }).authSession;
    const cfg = await loadWhatsAppConfig(getServerFirestore(true));
    if (!cfg.enabled) {
      return res.status(400).json({
        status: 'error',
        message: 'प्रसारण सुरू करण्यापूर्वी कृपया WhatsApp API सेटिंग्जमध्ये "API सक्रिय ठेवा" पर्याय चालू करून जतन करा.',
      });
    }

    const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
    if (recipients.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'प्रसारणासाठी किमान एक वैध WhatsApp नंबर असलेला प्राप्तकर्ता निवडा.',
      });
    }

    const messageTemplate = String(req.body?.message || '').trim();
    if (!messageTemplate) {
      return res.status(400).json({ status: 'error', message: 'कृपया पाठवायचा संदेश लिहा.' });
    }

    const senderName = String(req.body?.senderName || cfg.defaultSenderName || '').trim();
    const senderTitle = String(req.body?.senderTitle || cfg.defaultSenderTitle || '').trim();
    const photoUrl = String(req.body?.photoUrl || cfg.defaultSenderPhoto || '').trim();
    const groups = Array.isArray(req.body?.groups) ? req.body.groups : [];
    const originHint = `${req.protocol}://${req.get('host')}`;

    const summary = await runWhatsAppBroadcastCampaign({
      config: cfg,
      recipients,
      messageTemplate,
      senderName,
      senderTitle,
      photoUrl,
      groups,
      sentBy: session?.email || 'super_admin',
      includeSignatureHeader: req.body?.includeSignatureHeader !== false,
      originHint,
      firestoreDb: getServerFirestore(true),
    });

    res.json({ status: 'success', ...summary });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'WhatsApp प्रसारण करताना त्रुटी आली.' });
  }
});

function sendFreshJson(req: express.Request, res: express.Response, payload: unknown): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const jsonStr = JSON.stringify(payload);
  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  if (jsonStr.length >= 1024 && /\bgzip\b/i.test(acceptEncoding)) {
    zlib.gzip(Buffer.from(jsonStr, 'utf-8'), (err, compressed) => {
      if (err) {
        res.type('application/json; charset=utf-8').send(jsonStr);
        return;
      }
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.type('application/json; charset=utf-8').send(compressed);
    });
    return;
  }
  res.type('application/json; charset=utf-8').send(jsonStr);
}

app.get('/api/db/applications/approved-directory', async (req, res) => {
  try {
    const list = await mysqlListApprovedDirectory();
    sendFreshJson(req, res, { items: list });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.get('/api/db/applications/approved-count', async (_req, res) => {
  try {
    const count = await mysqlCountApprovedMembers();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ count });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.get('/api/db/applications', async (req, res) => {
  try {
    const onlyApproved = req.query.status === 'approved';
    const isSummary = req.query.summary === '1' || req.query.summary === 'true';

    if (!(onlyApproved && isSummary)) {
      const session = extractRequestSession(req);
      if (!session || (session.role !== 'super_admin' && session.role !== 'sub_admin')) {
        return res.status(401).json({
          status: 'error',
          message: 'प्रवेश नाकारला: अर्जांची संपूर्ण यादी पाहण्यासाठी कृपया आधी ॲडमिन लॉगिन करा.',
        });
      }
      if (
        session.role === 'sub_admin' &&
        !session.permissions?.approveMembers &&
        !session.permissions?.editMembers
      ) {
        return res.status(403).json({
          status: 'error',
          message: 'आपल्या खात्याला सदस्य अर्ज पाहण्याचे अधिकार नाहीत.',
        });
      }
    }

    const list =
      onlyApproved && isSummary
        ? await mysqlListApprovedDirectory()
        : await mysqlListApplications(onlyApproved);
    sendFreshJson(req, res, { items: list });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/applications', appSubmitLimiter, async (req, res) => {
  try {
    const session = extractRequestSession(req);
    const isPrivilegedAdmin =
      session &&
      (session.role === 'super_admin' ||
        (session.role === 'sub_admin' &&
          (session.permissions?.approveMembers || session.permissions?.editMembers)));

    const payload = { ...(req.body || {}) };
    if (!isPrivilegedAdmin) {
      // Unauthenticated member submissions can NEVER self-approve or overwrite an approved record
      if (payload.id) {
        const existing = await mysqlGetApplicationById(String(payload.id));
        if (existing && (existing.status === 'approved' || existing.paymentConfirmed)) {
          return res.status(403).json({
            status: 'error',
            message: 'मंजूर अर्जात थेट बदल करता येत नाहीत.',
          });
        }
      }
      payload.status = 'pending';
      payload.paymentConfirmed = false;
      payload.memberNumber = '';
      payload.approvedAt = '';
      payload.approvedBy = '';
      payload.rejectReason = '';
      payload.idCardEmailSent = false;
      payload.welcomeEmailSent = false;
    }

    await mysqlUpsertApplication(payload);
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.get('/api/db/applications/track', async (req, res) => {
  try {
    const q = String(req.query.q || '');
    const result = await mysqlTrackApplication(q);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/applications/find-existing', async (req, res) => {
  try {
    const result = await mysqlFindExistingApplication(req.body || {});
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/applications/approve-atomic', async (req, res) => {
  try {
    const session = extractRequestSession(req);
    const isPrivilegedAdmin =
      session &&
      (session.role === 'super_admin' ||
        (session.role === 'sub_admin' && session.permissions?.approveMembers));

    const body = req.body || {};
    const paymentProofToken = String(body.paymentProofToken || '').trim();
    const expectedPaymentId = String(
      body.extraUpdates?.razorpayPaymentId || body.extraUpdates?.paymentRef || ''
    ).trim();

    if (
      !isPrivilegedAdmin &&
      !verifyPaymentProof(paymentProofToken, body.appId, expectedPaymentId)
    ) {
      return res.status(401).json({
        status: 'error',
        message: 'प्रवेश नाकारला: सदस्यत्व मंजुरीसाठी अधिकृत ॲडमिन लॉगिन किंवा वैध पेमेंट पडताळणी आवश्यक आहे.',
      });
    }

    const result = await mysqlApproveApplicationAtomic(body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/applications/:id/reject', requireAdminOrSubAdmin('approveMembers'), async (req, res) => {
  try {
    await mysqlRejectApplication(req.params.id, String(req.body?.reason || ''));
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.delete('/api/db/applications/:id', requireAdminOrSubAdmin(['approveMembers', 'editMembers']), async (req, res) => {
  try {
    const result = await mysqlDeleteApplication(req.params.id, req.body || {});
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/applications/resequence', requireAdminOrSubAdmin(['approveMembers', 'editMembers']), async (_req, res) => {
  try {
    res.json(await mysqlResequenceApproved());
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/applications/reset-counter', requireAdminOrSubAdmin(['approveMembers', 'editMembers']), async (_req, res) => {
  try {
    res.json(await mysqlResetMemberCounter());
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/applications/purge-ghosts', requireAdminOrSubAdmin(['approveMembers', 'editMembers']), async (_req, res) => {
  try {
    res.json(await mysqlPurgeGhostApplications());
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.get('/api/db/member-counter', async (_req, res) => {
  try {
    res.json(await mysqlGetMemberCounter());
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/member-counter/allocate', requireAdminOrSubAdmin(['approveMembers', 'editMembers']), async (req, res) => {
  try {
    res.json(await mysqlAllocateNextMemberNumber(req.body?.district));
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/member-counter/sync', requireAdminOrSubAdmin(['approveMembers', 'editMembers']), async (req, res) => {
  try {
    await mysqlSyncMemberCounter(Number(req.body?.highestKnownCount || 0));
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.get('/api/db/news', async (_req, res) => {
  try {
    res.json({ items: await mysqlListNews() });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/news', requireAdminOrSubAdmin('manageNews'), async (req, res) => {
  try {
    await mysqlSaveNews(req.body);
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.delete('/api/db/news/:id', requireAdminOrSubAdmin('manageNews'), async (req, res) => {
  try {
    await mysqlDeleteNews(req.params.id);
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.get('/api/db/latest-banners', async (_req, res) => {
  try {
    res.json({ items: await mysqlListLatestBanners() });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/latest-banners', requireAdminOrSubAdmin('manageLatestBanners'), async (req, res) => {
  try {
    await mysqlSaveLatestBanner(req.body);
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.delete('/api/db/latest-banners/:id', requireAdminOrSubAdmin('manageLatestBanners'), async (req, res) => {
  try {
    await mysqlDeleteLatestBanner(req.params.id);
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.get('/api/db/gov-orders', async (_req, res) => {
  try {
    res.json({ items: await mysqlListGovOrders() });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/gov-orders', requireAdminOrSubAdmin('manageGovOrders'), async (req, res) => {
  try {
    await mysqlSaveGovOrder(req.body);
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.delete('/api/db/gov-orders/:id', requireAdminOrSubAdmin('manageGovOrders'), async (req, res) => {
  try {
    await mysqlDeleteGovOrder(req.params.id);
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.get('/api/db/contacts', requireAdminOrSubAdmin('manageContactMessages'), async (_req, res) => {
  try {
    res.json({ items: await mysqlListContacts() });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/contacts', contactMailLimiter, async (req, res) => {
  try {
    await mysqlSaveContact(req.body);
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.delete('/api/db/contacts/:id', requireAdminOrSubAdmin('manageContactMessages'), async (req, res) => {
  try {
    await mysqlDeleteContact(req.params.id);
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.get('/api/db/sub-admins', requireAdminOrSubAdmin(['manageAdmins', 'approveMembers', 'editMembers', 'manageLeadership', 'manageNews', 'manageGovOrders', 'manageLatestBanners', 'viewIdCardPreview', 'manageContactMessages', 'manageRazorpay', 'manageCloudinary']), async (_req, res) => {
  try {
    const items = await mysqlListSubAdmins();
    res.json({ items: items.map(sanitizeSubAdminForResponse) });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/sub-admins', requireAdminOrSubAdmin('manageAdmins'), async (req, res) => {
  try {
    const session = (req as express.Request & { authSession?: SessionPayload }).authSession;
    const body = { ...(req.body || {}) };
    if (session?.role !== 'super_admin') {
      body.isSuperAdmin = false;
    }
    await mysqlSaveSubAdmin(body);
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.delete('/api/db/sub-admins/:id', requireAdminOrSubAdmin('manageAdmins'), async (req, res) => {
  try {
    await mysqlDeleteSubAdmin(req.params.id);
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.get('/api/db/admin-auth', requireSuperAdmin, async (_req, res) => {
  try {
    const auth = await mysqlGetAdminAuth();
    res.json({ email: auth.email, password: '', configured: true });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/admin-auth', requireSuperAdmin, async (req, res) => {
  try {
    await mysqlUpdateAdminAuth(String(req.body?.password || ''), req.body?.email);
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/site-stats/visit', async (req, res) => {
  try {
    const increment = Boolean(req.body?.increment);
    res.json(await mysqlRecordOrReadVisit(increment));
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.get('/api/db/rk/leaders', async (_req, res) => {
  try {
    const [items, version] = await Promise.all([mysqlListLeaders(), mysqlGetLeadershipVersion()]);
    res.json({ items, version });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/rk/leaders', requireAdminOrSubAdmin('manageLeadership'), async (req, res) => {
  try {
    const version = await mysqlSaveLeaders(Array.isArray(req.body?.leaders) ? req.body.leaders : []);
    res.json({ status: 'success', version });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.get('/api/db/rk/officials', async (req, res) => {
  try {
    sendFreshJson(req, res, { items: await mysqlListOfficials() });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/rk/officials', requireOfficialEditor, async (req, res) => {
  try {
    const session = (req as express.Request & { authSession?: SessionPayload }).authSession;
    const member = req.body || {};
    if (session?.role === 'district_admin' && session.district) {
      const targetDist = String(member.district || '').trim();
      const allowedAliases =
        session.district === 'अहिल्यानगर'
          ? ['अहिल्यानगर', 'अहमदनगर']
          : [session.district];
      if (!allowedAliases.includes(targetDist)) {
        return res.status(403).json({
          status: 'error',
          message: `आपण फक्त '${session.district}' जिल्ह्याची माहिती संपादित करू शकता.`,
        });
      }
    }
    await mysqlSaveOfficial(member);
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.delete('/api/db/rk/officials/:id', requireOfficialEditor, async (req, res) => {
  try {
    const session = (req as express.Request & { authSession?: SessionPayload }).authSession;
    if (session?.role === 'district_admin' && session.district) {
      const officials = await mysqlListOfficials();
      const target = officials.find((o) => String(o.id) === String(req.params.id));
      const allowedAliases =
        session.district === 'अहिल्यानगर'
          ? ['अहिल्यानगर', 'अहमदनगर']
          : [session.district];
      if (target && !allowedAliases.includes(String(target.district || '').trim())) {
        return res.status(403).json({
          status: 'error',
          message: `आपण फक्त '${session.district}' जिल्ह्यातील पदाधिकारी हटवू शकता.`,
        });
      }
    }
    await mysqlDeleteOfficial(req.params.id);
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.get('/api/db/rk/district-passwords', requirePresidentOrSuperAdmin, async (req, res) => {
  try {
    sendFreshJson(req, res, { map: await mysqlListDistrictPasswordStatuses() });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/rk/district-passwords', requireOfficialEditor, async (req, res) => {
  try {
    const session = (req as express.Request & { authSession?: SessionPayload }).authSession;
    const district = String(req.body?.district || '').trim();
    const password = String(req.body?.password || '').trim();
    if (!district || !password) {
      return res.status(400).json({ status: 'error', message: 'जिल्हा व पासवर्ड आवश्यक आहे.' });
    }
    if (session?.role === 'district_admin' && session.district !== district) {
      return res.status(403).json({
        status: 'error',
        message: 'आपण फक्त स्वतःच्या जिल्ह्याचाच पासवर्ड बदलू शकता.',
      });
    }
    await mysqlSetDistrictPassword(district, password);
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.get('/api/db/rk/appointed-posts', async (req, res) => {
  try {
    sendFreshJson(req, res, { items: await mysqlListAppointedPosts() });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/rk/appointed-posts', requirePresidentOrSuperAdmin, async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    await mysqlSetAppointedPosts(items);
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.get('/api/db/rk/president-password', requirePresidentOrSuperAdmin, async (req, res) => {
  try {
    const isDefault = await mysqlIsPresidentPasswordDefault();
    sendFreshJson(req, res, { isDefault, configured: true });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/rk/president-password', requirePresidentOrSuperAdmin, async (req, res) => {
  try {
    await mysqlSetPresidentPassword(String(req.body?.password || ''));
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

// =========================================================================
// Razorpay API Routes
// =========================================================================

// 1. Get Public Razorpay Config
app.get('/api/razorpay/public-config', (_req, res) => {
  const config = loadRazorpayConfig();
  res.json({
    keyId: config.keyId,
    enabled: config.enabled && Boolean(config.keyId && config.keySecret)
  });
});

// 2. Admin: Get Full Razorpay Config (masked)
app.get('/api/razorpay/admin-config', requireAdminOrSubAdmin('manageRazorpay'), (req, res) => {
  const config = loadRazorpayConfig();
  res.json({
    keyId: config.keyId,
    keySecret: config.keySecret ? '••••••••' + config.keySecret.slice(-4) : '',
    webhookSecret: config.webhookSecret ? '••••••••' + config.webhookSecret.slice(-4) : '',
    enabled: config.enabled,
    hasSecret: Boolean(config.keySecret),
    hasWebhookSecret: Boolean(config.webhookSecret),
    webhookUrl: `${req.protocol}://${req.get('host')}/api/razorpay/webhook`
  });
});

// 3. Admin: Update Razorpay Config
app.post('/api/razorpay/admin-config', requireAdminOrSubAdmin('manageRazorpay'), (req, res) => {
  const { keyId, keySecret, webhookSecret, enabled } = req.body;
  const current = loadRazorpayConfig();

  const updated: RazorpayConfig = {
    keyId: typeof keyId === 'string' && keyId.trim() ? keyId.trim() : current.keyId,
    keySecret:
      typeof keySecret === 'string' && keySecret.trim() && !keySecret.includes('••••')
        ? keySecret.trim()
        : current.keySecret,
    webhookSecret:
      typeof webhookSecret === 'string' && webhookSecret.trim() && !webhookSecret.includes('••••')
        ? webhookSecret.trim()
        : current.webhookSecret,
    enabled: typeof enabled === 'boolean' ? enabled : true
  };

  saveRazorpayConfig(updated);
  res.json({
    status: 'success',
    message: 'Razorpay सेटिंग्ज यशस्वीरीत्या सेव्ह करण्यात आल्या.',
    keyId: updated.keyId,
    enabled: updated.enabled && Boolean(updated.keyId && updated.keySecret)
  });
});

// 4. Create Razorpay Order
app.post('/api/razorpay/create-order', appSubmitLimiter, async (req, res) => {
  try {
    const { amount = 220, applicationId, fullName, phone, email, district } = req.body;
    const { instance, config } = getRazorpayInstance();

    if (!instance) {
      return res.status(400).json({
        status: 'error',
        message: 'Razorpay गेटवे अद्याप कॉन्फिगर केलेला नाही. कृपया ॲडमिन पॅनेलमध्ये Key ID व Key Secret प्रविष्ट करा.'
      });
    }

    const amountInPaise = Math.round(Number(amount) * 100);
    const receipt = `rcpt_${applicationId || Date.now()}`.substring(0, 40);

    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt,
      notes: {
        applicationId: String(applicationId || ''),
        fullName: String(fullName || ''),
        phone: String(phone || ''),
        email: String(email || ''),
        district: String(district || '')
      }
    };

    const order = await instance.orders.create(options);

    res.json({
      status: 'success',
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: config.keyId
    });
  } catch (err: any) {
    console.error('Error creating Razorpay order:', err);
    res.status(500).json({
      status: 'error',
      message: 'Razorpay ऑर्डर आयडी तयार करताना त्रुटी आली: ' + (err.message || 'Error')
    });
  }
});

// 5. Verify Razorpay Payment Signature & Approve Application in Firestore
app.post('/api/razorpay/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, applicationId } = req.body;
    const config = loadRazorpayConfig();

    if (!config.keySecret) {
      return res.status(400).json({
        status: 'error',
        verified: false,
        message: 'Razorpay Key Secret अनुपलब्ध आहे.'
      });
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        status: 'error',
        verified: false,
        message: 'पेमेंट तपशील अपूर्ण आहेत.'
      });
    }

    const text = `${razorpay_order_id}|${razorpay_payment_id}`;
    const generatedSignature = crypto
      .createHmac('sha256', config.keySecret)
      .update(text)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({
        status: 'error',
        verified: false,
        message: 'पेमेंट स्वाक्षरी अमान्य (Invalid Signature). फसवणूक रोखली.'
      });
    }

    // Approve application directly on server after cryptographic verification
    let approvedApplication: Record<string, any> | null = null;
    try {
      approvedApplication = await approveApplicationOnServer({
        applicationId,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        source: 'razorpay_checkout'
      });
    } catch (approveErr) {
      console.error('Server approval after verify-payment warning:', approveErr);
    }

    const paymentProofToken = signPaymentProof(
      String(approvedApplication?.id || applicationId || ''),
      String(razorpay_payment_id)
    );

    res.json({
      status: 'success',
      verified: true,
      message: 'पेमेंट यशस्वीरीत्या पडताळले गेले (Signature Verified).',
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      paymentProofToken,
      application: approvedApplication
    });
  } catch (err: any) {
    console.error('Error verifying Razorpay payment:', err);
    res.status(500).json({
      status: 'error',
      verified: false,
      message: 'पेमेंट पडताळणीमध्ये त्रुटी: ' + (err.message || 'Error')
    });
  }
});

// 6. Razorpay Webhook Listener (Automatic Approval on Confirmed Payment)
app.post('/api/razorpay/webhook', async (req, res) => {
  try {
    const config = loadRazorpayConfig();
    const webhookSecret = config.webhookSecret;
    const signature = req.headers['x-razorpay-signature'] as string | undefined;

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString('utf-8')
      : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body);

    if (webhookSecret) {
      if (!signature) {
        return res.status(400).json({ status: 'error', message: 'Missing x-razorpay-signature header' });
      }
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (expectedSignature !== signature) {
        console.warn('Razorpay Webhook signature mismatch!');
        return res.status(400).json({ status: 'error', message: 'अमान्य वेबहूक स्वाक्षरी' });
      }
    }

    const event = JSON.parse(rawBody);
    console.log('Razorpay Webhook Event Received:', event.event);

    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const payment = event.payload?.payment?.entity;
      if (payment && (payment.status === 'captured' || event.event === 'order.paid')) {
        const paymentId = payment.id;
        const orderId = payment.order_id;
        const amountPaise = Number(payment.amount || 0);
        const phone = payment.contact || payment.notes?.phone;
        const email = payment.email || payment.notes?.email;
        const applicationId = payment.notes?.applicationId;

        console.log(
          `✓ Webhook Payment Captured! Payment ID: ${paymentId}, Amount: ₹${amountPaise / 100}, Phone: ${phone}`
        );

        if (amountPaise >= 22000) {
          const updated = await approveApplicationOnServer({
            applicationId,
            phone,
            email,
            paymentId,
            orderId,
            source: 'razorpay_webhook'
          });
          if (updated) {
            console.log(`✓ Firestore application ${updated.id} approved via Webhook -> ${updated.memberNumber}`);

            // Send fallback approval + 1-click download link email when approved asynchronously by webhook
            if (
              !updated.alreadyApproved &&
              updated.approvedBy === 'razorpay_webhook' &&
              !updated.welcomeEmailSent &&
              !updated.idCardEmailSent
            ) {
              const targetEmail = isRealMemberEmail(updated.email)
                ? String(updated.email).trim()
                : isRealMemberEmail(email)
                  ? String(email).trim()
                  : '';

              if (targetEmail && loadEmailConfig().enabled) {
                try {
                  const origin = req.get('host')?.includes('mahasangh.in')
                    ? 'https://mahasangh.in'
                    : `${req.protocol}://${req.get('host')}`;
                  const trackUrl = `${origin}/?track=${encodeURIComponent(updated.memberNumber || updated.phone || updated.applicationNumber || '')}`;
                  const html = buildMembershipEmailHtml({
                    salutation: updated.salutation,
                    fullName: updated.fullName || 'सदस्य',
                    memberNumber: String(updated.memberNumber || ''),
                    applicationNumber: updated.applicationNumber,
                    district: updated.district,
                    professional: updated.professional,
                    paymentId,
                    hasPdfAttachment: false,
                    trackUrl
                  });

                  const emailRes = await sendMembershipEmail({
                    to: targetEmail,
                    subject: `महासंघ आजीवन सदस्यत्व मंजूर व आय-कार्ड लिंक (${updated.memberNumber})`,
                    text: `सप्रेम नमस्कार ${updated.fullName || 'सदस्य'}, महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाचे आपले आजीवन सदस्यत्व (सदस्य क्र.: ${updated.memberNumber}) मंजूर झाले आहे. आय-कार्ड डाऊनलोड लिंक: ${trackUrl}`,
                    html
                  });

                  if (emailRes.sent) {
                    if (isMysqlActive()) {
                      await mysqlMarkEmailSent(updated.id, 'welcomeEmailSent');
                    } else {
                      const db = getServerFirestore();
                      if (db) {
                        await setDoc(
                          doc(db, 'applications', updated.id),
                          {
                            welcomeEmailSent: true,
                            welcomeEmailSentAt: new Date().toISOString()
                          },
                          { merge: true }
                        );
                      }
                    }
                    console.log(`✓ Sent Webhook approval link email to ${targetEmail} (${updated.memberNumber})`);
                  }
                } catch (emailErr) {
                  console.warn('Webhook approval email warning:', emailErr);
                }
              }
            }
          }
        } else {
          console.warn(`Webhook payment ignored because amount (${amountPaise}) < 22000 paise.`);
        }
      }
    }

    res.json({ status: 'ok', received: true });
  } catch (err: any) {
    console.error('Razorpay Webhook Processing Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =========================================================================
// Unified Contact Mailbox API (IMAP + SMTP for contact@mahasangh.in)
// =========================================================================
app.get('/api/mailbox/messages', requireAdminOrSubAdmin('manageContactMessages'), async (req, res) => {
  const cfg = loadContactMailboxConfig();
  const folder = String(req.query.folder || 'INBOX').trim() || 'INBOX';
  const limitRaw = Number(req.query.limit || 40);
  const limitCount = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 80) : 40;

  if (!cfg.host || !cfg.user || !cfg.pass) {
    return res.json({
      status: 'error',
      account: cfg.user,
      host: cfg.host,
      imapPort: cfg.imapPort,
      smtpPort: cfg.smtpPort,
      items: [],
      message: 'ईमेल खाते तपशील उपलब्ध नाहीत.',
    });
  }

  let client: ImapFlow | null = null;
  let activeHost = cfg.host;
  try {
    const connected = await connectContactImapWithFallback(cfg);
    client = connected.client;
    activeHost = connected.activeHost;
    const lock = await client.getMailboxLock(folder);
    try {
      const mbox = client.mailbox;
      const totalExists = mbox && typeof mbox !== 'boolean' ? Number(mbox.exists || 0) : 0;
      if (totalExists === 0) {
        return res.json({
          status: 'success',
          account: cfg.user,
          host: activeHost,
          imapPort: cfg.imapPort,
          smtpPort: cfg.smtpPort,
          totalCount: 0,
          items: [],
        });
      }

      const startSeq = Math.max(1, totalExists - limitCount + 1);
      const range = `${startSeq}:*`;
      const parsedEmails: Array<{
        uid: number;
        messageId: string;
        folder: string;
        fromName: string;
        fromEmail: string;
        toEmail: string;
        subject: string;
        textBody: string;
        snippet: string;
        date: string;
        isRead: boolean;
        hasAttachments: boolean;
        attachmentNames: string[];
      }> = [];

      for await (const msg of client.fetch(range, {
        uid: true,
        flags: true,
        envelope: true,
        internalDate: true,
        source: true,
      })) {
        let fromName = '';
        let fromEmail = '';
        let toEmail = cfg.user;
        let subject = '(विषय नाही)';
        let messageId = '';
        let textBody = '';
        let attachmentNames: string[] = [];
        let dateIso = msg.internalDate ? new Date(msg.internalDate).toISOString() : new Date().toISOString();

        if (msg.source) {
          const parsed = await simpleParser(msg.source);
          const fromFirst = parsed.from?.value?.[0];
          fromName = String(fromFirst?.name || '').trim();
          fromEmail = String(fromFirst?.address || '').trim();
          const toObj = parsed.to;
          if (toObj && !Array.isArray(toObj) && toObj.value?.[0]?.address) {
            toEmail = String(toObj.value[0].address).trim();
          } else if (Array.isArray(toObj) && toObj[0]?.value?.[0]?.address) {
            toEmail = String(toObj[0].value[0].address).trim();
          }
          subject = String(parsed.subject || '(विषय नाही)').trim();
          messageId = String(parsed.messageId || '').trim();
          if (parsed.date) dateIso = parsed.date.toISOString();
          textBody = String(parsed.text || '').trim();
          const htmlBody = typeof parsed.html === 'string' ? parsed.html : '';
          if (!textBody && htmlBody) {
            textBody = htmlBody
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
          }
          if (Array.isArray(parsed.attachments)) {
            attachmentNames = parsed.attachments
              .map((a) => String(a.filename || '').trim())
              .filter(Boolean);
          }
        } else if (msg.envelope) {
          const fromFirst = msg.envelope.from?.[0];
          fromName = String(fromFirst?.name || '').trim();
          fromEmail = String(fromFirst?.address || '').trim();
          subject = String(msg.envelope.subject || '(विषय नाही)').trim();
          messageId = String(msg.envelope.messageId || '').trim();
          if (msg.envelope.date) dateIso = new Date(msg.envelope.date).toISOString();
        }

        parsedEmails.push({
          uid: msg.uid,
          messageId,
          folder,
          fromName: fromName || fromEmail || 'अज्ञात प्रेषक',
          fromEmail,
          toEmail,
          subject,
          textBody,
          snippet: textBody.slice(0, 220),
          date: dateIso,
          isRead: Boolean(msg.flags && msg.flags.has('\\Seen')),
          hasAttachments: attachmentNames.length > 0,
          attachmentNames,
        });
      }

      parsedEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.uid - a.uid);

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        status: 'success',
        account: cfg.user,
        host: activeHost,
        imapPort: cfg.imapPort,
        smtpPort: cfg.smtpPort,
        totalCount: totalExists,
        items: parsedEmails,
      });
    } finally {
      lock.release();
    }
  } catch (err: any) {
    console.warn('IMAP mailbox fetch error:', err?.message || err);
    res.json({
      status: 'error',
      account: cfg.user,
      host: activeHost,
      imapPort: cfg.imapPort,
      smtpPort: cfg.smtpPort,
      totalCount: 0,
      items: [],
      message: 'ईमेल सर्व्हरशी संपर्क साधताना अडचण आली: ' + (err?.message || 'IMAP Error'),
    });
  } finally {
    if (client) {
      await client.logout().catch(() => {});
    }
  }
});

app.post('/api/mailbox/send', requireAdminOrSubAdmin('manageContactMessages'), async (req, res) => {
  try {
    const cfg = loadContactMailboxConfig();
    const to = String(req.body?.to || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const text = String(req.body?.text || '').trim();
    const replyToMessageId = String(req.body?.replyToMessageId || '').trim();

    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return res.status(400).json({ status: 'error', message: 'कृपया वैध प्राप्तकर्ता ई-मेल पत्ता (To Email) प्रविष्ट करा.' });
    }
    if (!subject) {
      return res.status(400).json({ status: 'error', message: 'कृपया ई-मेलचा विषय (Subject) प्रविष्ट करा.' });
    }
    if (!text) {
      return res.status(400).json({ status: 'error', message: 'कृपया ई-मेलचा संदेश (Message) प्रविष्ट करा.' });
    }

    const htmlBody = `
      <div style="font-family: 'Noto Sans Devanagari', Arial, sans-serif; max-width: 620px; margin: 0 auto; background: #f8fafc; padding: 18px; color: #0f172a;">
        <div style="background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 10px; overflow: hidden;">
          <div style="background: #193568; color: #ffffff; padding: 14px 18px; border-bottom: 3px solid #efb24b;">
            <div style="font-size: 11px; color: #fde047; font-weight: 700;">महाराष्ट्र राज्य</div>
            <div style="font-size: 16px; font-weight: 800;">केंद्रप्रमुख व अधिकारी महासंघ</div>
          </div>
          <div style="padding: 18px; font-size: 14px; line-height: 1.7; white-space: pre-wrap; color: #1e293b;">${escapeEmailHtml(text)}</div>
          <div style="background: #f1f5f9; border-top: 1px solid #e2e8f0; padding: 12px 18px; font-size: 12px; color: #475569;">
            सादर,<br>
            <strong>महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ</strong><br>
            अधिकृत संपर्क ई-मेल: ${escapeEmailHtml(cfg.user)} | वेबसाईट: <a href="https://mahasangh.in" style="color: #193568;">mahasangh.in</a>
          </div>
        </div>
      </div>
    `;

    const mailOptions = {
      from: `"महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ" <${cfg.user}>`,
      replyTo: cfg.user,
      to,
      subject,
      text,
      html: htmlBody,
      ...(replyToMessageId
        ? {
            inReplyTo: replyToMessageId,
            references: replyToMessageId,
          }
        : {}),
    };

    let info: any = null;
    let lastSmtpErr: any = null;
    for (const hostCandidate of getContactMailHostCandidates(cfg.host)) {
      const transporter = nodemailer.createTransport({
        host: hostCandidate,
        port: cfg.smtpPort,
        secure: cfg.smtpPort === 465,
        auth: {
          user: cfg.user,
          pass: cfg.pass,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });
      try {
        info = await transporter.sendMail(mailOptions);
        break;
      } catch (smtpErr: any) {
        lastSmtpErr = smtpErr;
        const code = String(smtpErr?.code || '').toUpperCase();
        const msg = String(smtpErr?.message || '');
        if (!(code === 'ENOTFOUND' || code === 'EAI_AGAIN' || /ENOTFOUND|getaddrinfo/i.test(msg))) {
          throw smtpErr;
        }
      }
    }
    if (!info) {
      throw lastSmtpErr || new Error('SMTP send failed');
    }

    // Best-effort sync to IMAP Sent folder so Roundcube & mobile Gmail/Outlook stay in sync
    try {
      const streamTransporter = nodemailer.createTransport({
        streamTransport: true,
        buffer: true,
        newline: 'windows',
      });
      const built = await streamTransporter.sendMail(mailOptions);
      const rawBuffer = built.message as Buffer;
      if (Buffer.isBuffer(rawBuffer)) {
        const { client: imapClient } = await connectContactImapWithFallback(cfg);
        try {
          const mailboxes = await imapClient.list();
          const sentBox = mailboxes.find(
            (b) =>
              b.specialUse === '\\Sent' ||
              /^sent$/i.test(b.name) ||
              /^inbox\.sent$/i.test(b.path)
          );
          if (sentBox) {
            await imapClient.append(sentBox.path, rawBuffer, ['\\Seen']);
          }
        } finally {
          await imapClient.logout().catch(() => {});
        }
      }
    } catch (appendErr) {
      console.warn('Sent-folder IMAP sync skipped:', appendErr);
    }

    res.json({
      status: 'success',
      sent: true,
      from: cfg.user,
      to,
      messageId: info.messageId || '',
    });
  } catch (err: any) {
    console.error('SMTP mailbox send error:', err);
    res.status(500).json({
      status: 'error',
      sent: false,
      message: 'ई-मेल पाठवताना त्रुटी आली: ' + (err?.message || 'SMTP Error'),
    });
  }
});

app.post('/api/mailbox/mark-read', requireAdminOrSubAdmin('manageContactMessages'), async (req, res) => {
  const cfg = loadContactMailboxConfig();
  const uid = Number(req.body?.uid);
  const isRead = Boolean(req.body?.isRead);
  const folder = String(req.body?.folder || 'INBOX').trim() || 'INBOX';

  if (!Number.isFinite(uid) || uid <= 0) {
    return res.status(400).json({ status: 'error', message: 'Invalid email UID' });
  }

  let client: ImapFlow | null = null;
  try {
    const connected = await connectContactImapWithFallback(cfg);
    client = connected.client;
    const lock = await client.getMailboxLock(folder);
    try {
      if (isRead) {
        await client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });
      } else {
        await client.messageFlagsRemove({ uid }, ['\\Seen'], { uid: true });
      }
      res.json({ status: 'success', uid, isRead });
    } finally {
      lock.release();
    }
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'IMAP Error' });
  } finally {
    if (client) {
      await client.logout().catch(() => {});
    }
  }
});

app.delete('/api/mailbox/message/:uid', requireAdminOrSubAdmin('manageContactMessages'), async (req, res) => {
  const cfg = loadContactMailboxConfig();
  const uid = Number(req.params.uid);
  const folder = String(req.query.folder || 'INBOX').trim() || 'INBOX';

  if (!Number.isFinite(uid) || uid <= 0) {
    return res.status(400).json({ status: 'error', message: 'Invalid email UID' });
  }

  let client: ImapFlow | null = null;
  try {
    const connected = await connectContactImapWithFallback(cfg);
    client = connected.client;
    const lock = await client.getMailboxLock(folder);
    try {
      await client.messageDelete({ uid }, { uid: true });
      res.json({ status: 'success', uid });
    } finally {
      lock.release();
    }
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'IMAP Error' });
  } finally {
    if (client) {
      await client.logout().catch(() => {});
    }
  }
});

// =========================================================================
// Vite Dev Server / Static Production Mounting
// =========================================================================
async function startServer() {
  const hasDist = fs.existsSync(path.resolve(process.cwd(), 'dist', 'index.html'));
  let useViteDev = process.env.NODE_ENV !== 'production';

  if (useViteDev) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa'
      });
      app.use(vite.middlewares);
    } catch (viteErr) {
      if (hasDist) {
        console.warn('Vite not installed; serving built dist/ directory.');
        useViteDev = false;
      } else {
        throw viteErr;
      }
    }
  }

  if (!useViteDev) {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
      } else {
        next();
      }
    });
  }

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    if (isMysqlActive()) {
      triggerInitialFirebaseMigrationOnBoot(() => getServerFirestore(true));
    }
  });
}

startServer();

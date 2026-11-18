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
import dns from 'dns/promises';
import { isPrivateOrReservedIpAddress, isSafeExternalImageProxyUrl } from './src/utils/pdfImageSafety';
type Firestore = any;
import { formatSequentialMemberNumber } from './src/data/mahasanghData';
import {
  DEFAULT_COUNTER_BASELINE,
  computeNextSafeSeq,
  buildSequentialMemberNumber,
} from './src/utils/memberNumberAllocator';
import { computeNextVisitorStats } from './src/utils/visitorCounter';
import { ensureMysqlSchema, isMysqlActive, isMysqlConfigured, runMysqlSchemaAuditAndHeal } from './src/db/mysqlPool';
import {
  mysqlListApplications,
  mysqlListApprovedDirectory,
  mysqlCountApprovedMembers,
  mysqlGetApplicationById,
  mysqlUpsertApplication,
  mysqlUpdateApplication,
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
  AppointedPostItem,
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
import {
  matchRazorpayPaymentsWithPendingApps,
  RazorpayApiPaymentLike,
} from './src/utils/razorpaySyncMatcher';

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
// Persistent storage uses HostKarle MySQL (or Mock store in AI Studio Preview)
// =========================================================================
function getServerFirestore(_allowWhenMysqlActive = false): null {
  return null;
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
  const user = String(
    fileCfg.user ||
      process.env.SMTP_USER ||
      (fileCfg as any).contactMailbox?.user ||
      'contact@mahasangh.in'
  ).trim();
  const pass = String(
    fileCfg.pass ||
      process.env.SMTP_PASS ||
      (fileCfg as any).contactMailbox?.pass ||
      'Nashik@2026'
  ).trim();
  const from = String(
    fileCfg.from ||
      process.env.SMTP_FROM ||
      user ||
      'contact@mahasangh.in'
  ).trim();
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
  trackUrl: string;
}): string {
  const fullTitle = `${params.salutation ? params.salutation + ' ' : ''}${params.fullName}`.trim();
  return `
  <div style="font-family: 'Noto Sans Devanagari', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 620px; margin: 0 auto; background: #f8fafc; padding: 20px 10px; color: #0f172a;">
    <div style="background: #ffffff; border: 2px solid #193568; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
      
      <!-- Official Header -->
      <div style="background: linear-gradient(135deg, #0b1e33 0%, #193568 100%); padding: 22px 18px; text-align: center; border-bottom: 4px solid #df6b16; color: #ffffff;">
        <div style="font-size: 13px; font-weight: 700; color: #fde047; letter-spacing: 0.8px; text-transform: uppercase;">महाराष्ट्र राज्य</div>
        <div style="font-size: 21px; font-weight: 900; margin: 5px 0; line-height: 1.3;">केंद्रप्रमुख व अधिकारी महासंघ</div>
        <div style="font-size: 11px; color: #cbd5e1;">नोंदणी क्र. श्रमिक संघ – महा/एनएसके/एन/2427 | मुख्य कार्यालय: नाशिक</div>
      </div>

      <!-- Main Body Content -->
      <div style="padding: 24px 20px; line-height: 1.7; font-size: 14.5px;">
        
        <p style="margin: 0 0 14px 0; font-size: 16.5px; font-weight: 800; color: #193568;">
          सप्रेम नमस्कार ${escapeEmailHtml(fullTitle)},
        </p>

        <!-- Congratulations Banner -->
        <div style="background: linear-gradient(to right, #ecfdf5, #f0fdf4); border: 1.5px solid #86efac; border-radius: 12px; padding: 15px 18px; margin-bottom: 20px;">
          <div style="font-size: 16px; font-weight: 800; color: #166534; margin-bottom: 4px;">
            🎉 हार्दिक अभिनंदन! आपले सदस्यत्व यशस्वीरीत्या मंजूर झाले आहे.
          </div>
          <p style="margin: 0; color: #14532d; font-size: 13.5px;">
            महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाच्या अधिकृत परिवारात आपले मनःपूर्वक स्वागत! आपले आजीवन सदस्यत्व सक्रिय करण्यात आले असून आपला अधिकृत सदस्य क्रमांक खालीलप्रमाणे आहे:
          </p>
        </div>

        <!-- Official Member Details Table -->
        <div style="background: #ffffff; border: 2px solid #e2e8f0; border-radius: 12px; padding: 16px 18px; margin-bottom: 20px;">
          <div style="font-size: 12.5px; font-weight: 800; color: #0b1e33; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; border-bottom: 1.5px solid #f1f5f9; padding-bottom: 6px;">
            📋 अधिकृत सदस्यत्व तपशील
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 13.5px;">
            <tr style="border-bottom: 1px dashed #e2e8f0;">
              <td style="padding: 9px 0; color: #475569; width: 44%;"><strong>सदस्य क्रमांक (Member ID):</strong></td>
              <td style="padding: 9px 0; color: #193568; font-weight: 900; font-family: monospace; font-size: 17px; letter-spacing: 0.5px;">
                ${escapeEmailHtml(params.memberNumber)}
              </td>
            </tr>
            ${params.applicationNumber ? `
            <tr style="border-bottom: 1px dashed #e2e8f0;">
              <td style="padding: 7px 0; color: #475569;"><strong>अर्ज क्रमांक:</strong></td>
              <td style="padding: 7px 0; color: #0f172a; font-family: monospace;">${escapeEmailHtml(params.applicationNumber)}</td>
            </tr>` : ''}
            ${params.professional ? `
            <tr style="border-bottom: 1px dashed #e2e8f0;">
              <td style="padding: 7px 0; color: #475569;"><strong>पद / संवर्ग:</strong></td>
              <td style="padding: 7px 0; color: #0f172a;">${escapeEmailHtml(params.professional)}</td>
            </tr>` : ''}
            ${params.district ? `
            <tr style="border-bottom: 1px dashed #e2e8f0;">
              <td style="padding: 7px 0; color: #475569;"><strong>कार्यक्षेत्र (जिल्हा):</strong></td>
              <td style="padding: 7px 0; color: #0f172a;">${escapeEmailHtml(params.district)}</td>
            </tr>` : ''}
            ${params.paymentId ? `
            <tr style="border-bottom: 1px dashed #e2e8f0;">
              <td style="padding: 7px 0; color: #475569;"><strong>पेमेंट संदर्भ क्रमांक:</strong></td>
              <td style="padding: 7px 0; color: #0f172a; font-family: monospace;">${escapeEmailHtml(params.paymentId)}</td>
            </tr>` : ''}
            <tr>
              <td style="padding: 7px 0; color: #475569;"><strong>सदस्यत्व स्वरूप:</strong></td>
              <td style="padding: 7px 0; color: #166534; font-weight: 700;">आजीवन सदस्य (Life Member)</td>
            </tr>
          </table>
        </div>

        <!-- Online Tracking & ID Card Info (Direct Portal Download without file attachments) -->
        <div style="background: #fff7ed; border-left: 4px solid #df6b16; padding: 14px 16px; border-radius: 8px; margin-bottom: 22px; font-size: 13.5px; color: #7c2d12;">
          💡 <strong>अधिकृत आय-कार्ड व प्रमाणपत्र माहिती:</strong><br>
          आपण कधीही <a href="https://mahasangh.in" style="color: #c2410c; font-weight: 800; text-decoration: underline;">mahasangh.in</a> या महासंघाच्या अधिकृत संकेतस्थळावर जाऊन <strong>"अर्जाची स्थिती / आय-कार्ड"</strong> पर्यायातून आपला मोबाईल क्रमांक किंवा वरील सदस्य क्रमांक टाकून आपले अधिकृत ओळखपत्र (ID Card) डिजिटल स्वरूपात पाहू व डाऊनलोड करू शकता.
        </div>

        <!-- Action Button -->
        <div style="text-align: center; margin: 22px 0 16px 0;">
          <a href="${escapeEmailHtml(params.trackUrl)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: #193568; color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; padding: 13px 26px; border-radius: 8px; box-shadow: 0 4px 12px rgba(25, 53, 104, 0.25);">
            mahasangh.in वर अर्जाची स्थिती व आय-कार्ड तपासा →
          </a>
        </div>

        <p style="font-size: 12.5px; color: #64748b; margin: 16px 0 0 0; border-top: 1px solid #f1f5f9; padding-top: 14px;">
          कोणतीही अडचण किंवा चौकशी असल्यास आपण थेट <strong>contact@mahasangh.in</strong> या मेलवर संपर्क साधू शकता.
        </p>
      </div>

      <!-- Footer -->
      <div style="background: #f1f5f9; border-top: 1px solid #cbd5e1; padding: 16px 20px; text-align: center; font-size: 11.5px; color: #475569; line-height: 1.6;">
        <strong>महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ</strong><br>
        कार्यालय: 131, पाटणे, ता. मालेगाव, जि. नाशिक — 423203<br>
        अधिकृत ई-मेल: <a href="mailto:contact@mahasangh.in" style="color: #193568; font-weight: 700;">contact@mahasangh.in</a> | संपर्क: 9860704098 | मदत: 9423484305
      </div>
    </div>
  </div>`;
}

async function sendMembershipEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const emailCfg = loadEmailConfig();
  if (!emailCfg.enabled) {
    return { sent: false, reason: 'SMTP not configured' };
  }
  if (!isRealMemberEmail(params.to)) {
    return { sent: false, reason: 'Recipient email is not valid' };
  }

  const plainText =
    params.text ||
    params.html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const hosts = getContactMailHostCandidates(emailCfg.host);
  let lastErr: any = null;

  for (const hostCandidate of hosts) {
    const transporter = nodemailer.createTransport({
      host: hostCandidate,
      port: emailCfg.port,
      secure: emailCfg.port === 465,
      auth: {
        user: emailCfg.user,
        pass: emailCfg.pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 10000,
      greetingTimeout: 8000,
      socketTimeout: 12000,
    });

    try {
      await transporter.sendMail({
        from: `"महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ" <${emailCfg.from}>`,
        replyTo: emailCfg.from,
        to: params.to.trim(),
        subject: params.subject,
        text: plainText,
        html: params.html,
      });
      return { sent: true };
    } catch (err: any) {
      lastErr = err;
      const errCode = String(err?.code || '').toUpperCase();
      const errMsg = String(err?.message || '');
      const isNetworkOrHostErr =
        errCode === 'ENOTFOUND' ||
        errCode === 'EAI_AGAIN' ||
        errCode === 'ECONNREFUSED' ||
        errCode === 'ETIMEDOUT' ||
        errCode === 'ESOCKET' ||
        /ENOTFOUND|getaddrinfo|ECONNREFUSED|timeout/i.test(errMsg);
      if (!isNetworkOrHostErr) {
        throw err;
      }
    }
  }

  throw lastErr || new Error('SMTP delivery failed');
}

const welcomeEmailInFlight = new Map<
  string,
  Promise<{ sent: boolean; alreadySent?: boolean; reason?: string }>
>();
const recentMockWelcomeEmailsSent = new Set<string>();

/**
 * Automatically dispatches official congratulatory email from contact@mahasangh.in
 * containing member number and membership details when an application is approved.
 * Uses single-flight deduplication so concurrent triggers (verify-payment, webhook,
 * approve-atomic, client confirmation) never send duplicate emails.
 */
async function sendApprovalCongratulatoryEmail(
  app: Record<string, any>,
  req?: express.Request
): Promise<{ sent: boolean; alreadySent?: boolean; reason?: string }> {
  const lockKey = String(app.id || app.applicationNumber || app.email || '').trim().toLowerCase();
  if (lockKey && welcomeEmailInFlight.has(lockKey)) {
    return welcomeEmailInFlight.get(lockKey)!;
  }

  const runTask = (async (): Promise<{ sent: boolean; alreadySent?: boolean; reason?: string }> => {
    try {
      let effectiveApp: Record<string, any> = { ...app };

      // Enrich with authoritative MySQL row so fresh email/memberNumber/welcomeEmailSent flag are respected
      if (isMysqlActive() && app.id) {
        try {
          const fresh = await mysqlGetApplicationById(String(app.id));
          if (fresh) {
            effectiveApp = {
              ...effectiveApp,
              ...fresh,
              email: fresh.email || effectiveApp.email,
              memberNumber: fresh.memberNumber || effectiveApp.memberNumber,
            };
          }
        } catch {}
      }

      const email = String(effectiveApp.email || '').trim();
      if (!isRealMemberEmail(email)) {
        return { sent: false, reason: 'Recipient email is not valid' };
      }

      if (effectiveApp.welcomeEmailSent === true || (lockKey && recentMockWelcomeEmailsSent.has(lockKey))) {
        return { sent: true, alreadySent: true, reason: 'Already sent' };
      }

      // On localhost/AI Studio preview mock mode without explicit SMTP credentials configured, skip cleanly
      if (!isMysqlActive() && !fs.existsSync(EMAIL_CONFIG_FILE) && !process.env.SMTP_PASS) {
        return { sent: false, reason: 'Preview mock mode: live SMTP disabled' };
      }

      const memberNo = String(effectiveApp.memberNumber || '').trim();
      const host = req?.get('host') || 'mahasangh.in';
      const origin = host.includes('mahasangh.in')
        ? 'https://mahasangh.in'
        : `${req?.protocol || 'https'}://${host}`;
      const trackUrl = `${origin}/?track=${encodeURIComponent(
        memberNo || effectiveApp.phone || effectiveApp.applicationNumber || ''
      )}`;

      const html = buildMembershipEmailHtml({
        salutation: effectiveApp.salutation,
        fullName: effectiveApp.fullName || 'सदस्य',
        memberNumber: memberNo,
        applicationNumber: effectiveApp.applicationNumber,
        district: effectiveApp.district,
        professional: effectiveApp.professional,
        paymentId: effectiveApp.razorpayPaymentId || effectiveApp.paymentRef,
        trackUrl,
      });

      const subject = `महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ - सदस्यत्व मंजूर व सदस्य क्रमांक: ${
        memberNo || effectiveApp.applicationNumber || ''
      }`.trim();
      const text = `सप्रेम नमस्कार ${
        effectiveApp.fullName || 'सदस्य'
      }, महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाचे आपले आजीवन सदस्यत्व (सदस्य क्र.: ${memberNo}) यशस्वीरीत्या मंजूर करण्यात आले आहे. आपले मनःपूर्वक अभिनंदन! महासंघाच्या पोर्टलवर अर्जाची स्थिती व आय-कार्ड तपासण्यासाठी लिंक: ${trackUrl}`;

      const result = await sendMembershipEmail({
        to: email,
        subject,
        text,
        html,
      });

      if (result.sent) {
        if (lockKey) recentMockWelcomeEmailsSent.add(lockKey);
        if (isMysqlActive() && effectiveApp.id) {
          await mysqlMarkEmailSent(String(effectiveApp.id), 'welcomeEmailSent');
        }
        console.log(
          `✓ Automatically sent approval congratulatory email from contact@mahasangh.in to ${email} (${memberNo})`
        );
      }
      return result;
    } catch (err: any) {
      console.error('Failed to auto-send approval congratulatory email:', err);
      return { sent: false, reason: err?.message || 'SMTP send failure' };
    }
  })();

  if (lockKey) {
    welcomeEmailInFlight.set(lockKey, runTask);
    runTask.finally(() => {
      welcomeEmailInFlight.delete(lockKey);
    });
  }

  return runTask;
}

// =========================================================================
// Verified Application Approval (HostKarle MySQL / Mock Engine)
// =========================================================================
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

  return {
    id: params.applicationId || 'mock-app-id',
    fullName: 'सदस्य',
    status: 'approved',
    memberNumber: 'MS/2026/02167',
    paymentConfirmed: true,
    paymentRef: params.paymentId,
    alreadyApproved: false,
  };
}

// =========================================================================
// Security Middleware (Helmet, Strict CORS, Balanced Rate Limiting, Session Guards)
// =========================================================================
const DEFAULT_ADMIN_EMAIL = 'padmakarshinde043@gmail.com';
const MASTER_RECOVERY_KEY = 'RK@Mahasangh2026';

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
          'https://*.googleapis.com',
          'wss:',
          'ws:',
        ],
        frameSrc: [
          "'self'",
          'https://api.razorpay.com',
          'https://checkout.razorpay.com',
          'https://drive.google.com',
        ],
        frameAncestors: [
          "'self'",
          'https://aistudio.google.com',
          'https://*.googleusercontent.com',
          'https://*.google.com',
        ],
        workerSrc: ["'self'", 'blob:'],
        manifestSrc: ["'self'"],
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

function extractClientIpForLimiter(req: express.Request): string {
  const cfIp = String(req.headers['cf-connecting-ip'] || '').trim();
  if (cfIp) return cfIp;
  const xff = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  if (xff) return xff;
  const realIp = String(req.headers['x-real-ip'] || '').trim();
  if (realIp) return realIp;
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${extractClientIpForLimiter(req)}:${req.path}`,
  skip: (req) => req.method === 'GET' || req.path === '/session' || req.path === '/logout',
  validate: { trustProxy: false, xForwardedForHeader: false, keyGeneratorIpFallback: false },
  message: rateLimitMessage,
});

const contactMailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => extractClientIpForLimiter(req),
  validate: { trustProxy: false, xForwardedForHeader: false, keyGeneratorIpFallback: false },
  message: rateLimitMessage,
});

const appSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 35,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => extractClientIpForLimiter(req),
  validate: { trustProxy: false, xForwardedForHeader: false, keyGeneratorIpFallback: false },
  message: rateLimitMessage,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => extractClientIpForLimiter(req),
  validate: { trustProxy: false, xForwardedForHeader: false, keyGeneratorIpFallback: false },
  skip: (req) => req.path === '/razorpay/webhook' || req.path === '/health' || req.path === '/auth/session',
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

// Health check endpoint (no secrets exposed)
app.get('/api/health', (_req, res) => {
  const config = loadRazorpayConfig();
  const emailConfig = loadEmailConfig();
  const mysqlActive = isMysqlActive();
  res.json({
    status: 'ok',
    razorpayConfigured: Boolean(config.keyId && config.keySecret && config.enabled),
    webhookSecretConfigured: Boolean(config.webhookSecret),
    mysqlConfigured: isMysqlConfigured(),
    activeBackend: mysqlActive ? 'mysql' : 'mock',
    emailConfigured: emailConfig.enabled
  });
});

// Safe same-origin image proxy for PDF / I-Card canvas rendering (prevents tainted canvas & CORS errors)
app.get('/api/proxy-image', async (req, res) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
  const check = isSafeExternalImageProxyUrl(rawUrl);
  if (!check.valid || !check.url) {
    return res.status(400).json({ status: 'error', message: check.reason || 'Invalid image URL' });
  }

  try {
    const resolved = await dns.lookup(check.url.hostname, { all: true });
    if (!resolved.length || resolved.some((entry) => isPrivateOrReservedIpAddress(entry.address))) {
      return res.status(403).json({ status: 'error', message: 'Blocked destination host' });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let upstream: Response;
    try {
      upstream = await fetch(check.url.toString(), {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          Accept: 'image/*,*/*;q=0.8',
          'User-Agent': 'MahasanghPortal/1.0',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok) {
      return res.status(502).json({ status: 'error', message: `Upstream HTTP ${upstream.status}` });
    }

    // Re-check final redirected URL to guard against open-redirect SSRF
    if (upstream.url) {
      const finalCheck = isSafeExternalImageProxyUrl(upstream.url);
      if (!finalCheck.valid) {
        return res.status(403).json({ status: 'error', message: 'Blocked redirected image host' });
      }
    }

    const contentType = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) {
      return res.status(415).json({ status: 'error', message: 'Target is not a valid image' });
    }

    const arrayBuf = await upstream.arrayBuffer();
    if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > 5 * 1024 * 1024) {
      return res.status(413).json({ status: 'error', message: 'Image size out of bounds' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    return res.send(Buffer.from(arrayBuf));
  } catch (err: any) {
    return res.status(502).json({
      status: 'error',
      message: err?.name === 'AbortError' ? 'Image fetch timed out' : 'Failed to load remote image',
    });
  }
});

// Active DB mode endpoint (used once on client boot)
app.get('/api/db/mode', (_req, res) => {
  res.json({
    backend: isMysqlActive() ? 'mysql' : 'mock',
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
  return { email: DEFAULT_ADMIN_EMAIL, password: 'Padmakar@2027' };
}

async function getServerSubAdminsUnified(): Promise<Record<string, any>[]> {
  if (isMysqlActive()) {
    return mysqlListSubAdmins();
  }
  return [];
}

// In-memory mock fallback state when MySQL is inactive (AI Studio preview only)
let mockAppointedPosts: AppointedPostItem[] | null = null;
const mockOfficials: Record<string, any>[] = [];
const mockDistrictPasswords: Record<string, string> = {};
let mockPresidentPassword: string | null = null;

async function getServerDistrictPasswordsUnified(): Promise<Record<string, string>> {
  if (isMysqlActive()) {
    return mysqlListDistrictPasswords();
  }
  return { ...mockDistrictPasswords };
}

async function getServerPresidentPasswordUnified(): Promise<string> {
  if (isMysqlActive()) {
    return mysqlGetPresidentPassword();
  }
  return mockPresidentPassword || SUPER_ADMIN_PASSWORD;
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
      updatedUser = sanitizeSubAdminForResponse({
        ...matching,
        password: hashPassword(newPassword),
        isFirstLogin: false,
      });
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
      mockDistrictPasswords[district] = hashPassword(newPassword);
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
      mockPresidentPassword = hashPassword(newPassword);
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
      mockPresidentPassword = hashPassword(newPassword);
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

// Official Membership Approval Congratulatory Email via SMTP (contact@mahasangh.in)
app.post(['/api/email/send-approval-email', '/api/email/send-id-card'], async (req, res) => {
  try {
    const {
      applicationId,
      appId,
      toEmail,
      fullName,
      salutation,
      memberNumber,
      applicationNumber,
      district,
      professional
    } = req.body || {};

    const targetId = String(applicationId || appId || '').trim();
    let appData: Record<string, any> | null = null;

    if (isMysqlActive() && targetId) {
      appData = await mysqlGetApplicationById(targetId);
      if (!appData) {
        const tracked = await mysqlTrackApplication(targetId);
        appData = tracked.app;
      }
    }

    if (!appData) {
      appData = {
        id: targetId || 'app',
        fullName: fullName || 'सदस्य',
        salutation: salutation || '',
        memberNumber: memberNumber || '',
        applicationNumber: applicationNumber || '',
        district: district || '',
        professional: professional || '',
        email: toEmail || '',
        status: 'approved',
        paymentConfirmed: true,
      };
    } else if (!appData.email && toEmail) {
      appData.email = toEmail;
    }

    const sendResult = await sendApprovalCongratulatoryEmail(appData, req);
    if (sendResult.sent) {
      return res.json({
        status: 'success',
        sent: true,
        alreadySent: Boolean(sendResult.alreadySent),
        to: appData.email,
        memberNumber: appData.memberNumber
      });
    }

    return res.json({
      status: 'skipped',
      sent: false,
      alreadySent: false,
      reason: sendResult.reason
    });
  } catch (err: any) {
    console.error('Error in send-approval-email endpoint:', err);
    res.status(500).json({
      status: 'error',
      sent: false,
      message: 'ई-मेल पाठवताना त्रुटी: ' + (err.message || 'SMTP Error')
    });
  }
});

// =========================================================================
// Super Admin 1-Click Full Website + Database Backup & Restore (/api/backup/*)
// =========================================================================

app.get('/api/db/schema-audit', requireSuperAdmin, async (req, res) => {
  try {
    const shouldRepair = String(req.query.repair || '') === '1';
    const report = await runMysqlSchemaAuditAndHeal(shouldRepair);
    sendFreshJson(req, res, report);
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'डेटाबेस स्कीमा तपासताना त्रुटी आली.' });
  }
});

app.post('/api/db/schema-audit/repair', requireSuperAdmin, async (req, res) => {
  try {
    const report = await runMysqlSchemaAuditAndHeal(true);
    sendFreshJson(req, res, report);
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'डेटाबेस स्कीमा दुरुस्त करताना त्रुटी आली.' });
  }
});

app.get('/api/backup/list', requireSuperAdmin, (_req, res) => {
  try {
    res.json({
      status: 'ok',
      activeBackend: isMysqlActive() ? 'mysql' : 'mock',
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
    sendFreshJson(req, res, result);
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.put('/api/db/applications/:id', requireAdminOrSubAdmin(['approveMembers', 'editMembers']), async (req, res) => {
  try {
    if (!isMysqlActive()) {
      return sendFreshJson(req, res, { status: 'success', application: { ...(req.body || {}), id: req.params.id } });
    }
    const application = await mysqlUpdateApplication(req.params.id, req.body || {});
    sendFreshJson(req, res, { status: 'success', application });
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
      !verifyPaymentProof(paymentProofToken, String(body.appId || body.applicationId || ''), expectedPaymentId)
    ) {
      return res.status(401).json({
        status: 'error',
        message: 'प्रवेश नाकारला: सदस्यत्व मंजुरीसाठी अधिकृत ॲडमिन लॉगिन किंवा वैध पेमेंट पडताळणी आवश्यक आहे.',
      });
    }

    const result = await mysqlApproveApplicationAtomic(body);
    if (result && result.application && !result.application.welcomeEmailSent) {
      sendApprovalCongratulatoryEmail(result.application, req).catch((err) => {
        console.warn('Auto approval congratulatory email notice:', err?.message || err);
      });
    }
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

app.post('/api/db/sub-admins/change-password', async (req, res) => {
  try {
    const targetEmail = String(req.body?.email || '').trim().toLowerCase();
    const newPassword = String(req.body?.newPassword || '').trim();
    if (!targetEmail || !newPassword || newPassword.length < 4) {
      return res.status(400).json({ status: 'error', message: 'ई-मेल व किमान 4 अक्षरांचा नवीन पासवर्ड आवश्यक आहे.' });
    }

    const session = extractRequestSession(req);
    const isAdminAllowed =
      session &&
      (session.role === 'super_admin' ||
        (session.role === 'sub_admin' &&
          (Boolean(session.permissions?.manageAdmins) ||
            String(session.email || '').trim().toLowerCase() === targetEmail)));

    if (!isAdminAllowed) {
      const subAdmins = await getServerSubAdminsUnified();
      const matching = subAdmins.find(
        (a) => String(a.email || '').trim().toLowerCase() === targetEmail
      );
      if (!matching || (!matching.isFirstLogin && Boolean(matching.password))) {
        return res.status(403).json({
          status: 'error',
          message: 'पासवर्ड बदलण्यासाठी आवश्यक परवानगी नाही.',
        });
      }
    }

    if (isMysqlActive()) {
      const updatedUser = await mysqlUpdateSubAdminPassword(targetEmail, newPassword);
      if (!updatedUser) {
        return res.status(404).json({ status: 'error', message: 'सब-ॲडमिन खाते सापडले नाही.' });
      }
      return res.json({ status: 'success', user: updatedUser });
    }

    return res.json({ status: 'success' });
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

let mockVisitorState = { total: 5155, today: 0, lastDate: '' };

app.post('/api/db/site-stats/visit', async (req, res) => {
  try {
    const increment = Boolean(req.body?.increment);
    if (isMysqlActive()) {
      return res.json(await mysqlRecordOrReadVisit(increment));
    }
    const istDateStr = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const next = computeNextVisitorStats({
      currentTotal: mockVisitorState.total,
      currentToday: mockVisitorState.today,
      lastDate: mockVisitorState.lastDate,
      todayDateStr: istDateStr,
      incrementVisit: increment,
      minBaseline: 5155,
    });
    if (next.shouldPersist) {
      mockVisitorState = { total: next.total, today: next.today, lastDate: istDateStr };
    }
    return res.json({ today: next.today, total: next.total });
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
    if (isMysqlActive()) {
      sendFreshJson(req, res, { items: await mysqlListOfficials() });
      return;
    }
    sendFreshJson(req, res, { items: [...mockOfficials] });
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
    if (isMysqlActive()) {
      await mysqlSaveOfficial(member);
    } else {
      const idx = mockOfficials.findIndex((o) => String(o.id) === String(member.id));
      if (idx >= 0) {
        mockOfficials[idx] = { ...member };
      } else {
        mockOfficials.unshift({ ...member });
      }
    }
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.delete('/api/db/rk/officials/:id', requireOfficialEditor, async (req, res) => {
  try {
    const session = (req as express.Request & { authSession?: SessionPayload }).authSession;
    if (session?.role === 'district_admin' && session.district) {
      const officials = isMysqlActive() ? await mysqlListOfficials() : mockOfficials;
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
    if (isMysqlActive()) {
      await mysqlDeleteOfficial(req.params.id);
    } else {
      const idx = mockOfficials.findIndex((o) => String(o.id) === String(req.params.id));
      if (idx >= 0) mockOfficials.splice(idx, 1);
    }
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.get('/api/db/rk/district-passwords', requirePresidentOrSuperAdmin, async (req, res) => {
  try {
    if (isMysqlActive()) {
      sendFreshJson(req, res, { map: await mysqlListDistrictPasswordStatuses() });
      return;
    }
    const statusMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(mockDistrictPasswords)) {
      statusMap[k] = !v || verifyPassword(DEFAULT_DISTRICT_PASSWORD, v) ? 'AD2026' : '__CUSTOM__';
    }
    sendFreshJson(req, res, { map: statusMap });
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
    if (isMysqlActive()) {
      await mysqlSetDistrictPassword(district, password);
    } else {
      mockDistrictPasswords[district] = hashPassword(password);
    }
    res.json({ status: 'success' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.get('/api/db/rk/appointed-posts', async (req, res) => {
  try {
    if (isMysqlActive()) {
      sendFreshJson(req, res, { items: await mysqlListAppointedPosts(), backend: 'mysql' });
      return;
    }
    sendFreshJson(req, res, { items: mockAppointedPosts ?? [], backend: 'mock' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/rk/appointed-posts', requirePresidentOrSuperAdmin, async (req, res) => {
  try {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const items: AppointedPostItem[] = rawItems
      .filter((p: any) => p && typeof p.name === 'string' && p.name.trim())
      .map((p: any) => {
        const level =
          p.level === 'mahila' ||
          p.level === 'state' ||
          p.level === 'division' ||
          p.level === 'district' ||
          p.level === 'taluka'
            ? p.level
            : undefined;
        return {
          name: String(p.name).trim(),
          isTaluka: level ? level === 'taluka' : Boolean(p.isTaluka),
          ...(level ? { level } : {}),
        };
      });

    if (items.length === 0) {
      return res.status(400).json({ status: 'error', message: 'किमान एक वैध पद आवश्यक आहे.' });
    }

    if (isMysqlActive()) {
      await mysqlSetAppointedPosts(items);
    } else {
      mockAppointedPosts = items;
    }
    res.json({ status: 'success', items });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.get('/api/db/rk/president-password', requirePresidentOrSuperAdmin, async (req, res) => {
  try {
    if (isMysqlActive()) {
      const isDefault = await mysqlIsPresidentPasswordDefault();
      sendFreshJson(req, res, { isDefault, configured: true });
      return;
    }
    const isDefault = !mockPresidentPassword || verifyPassword(SUPER_ADMIN_PASSWORD, mockPresidentPassword);
    sendFreshJson(req, res, { isDefault, configured: true });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message || 'Error' });
  }
});

app.post('/api/db/rk/president-password', requirePresidentOrSuperAdmin, async (req, res) => {
  try {
    const pass = String(req.body?.password || '').trim();
    if (isMysqlActive()) {
      await mysqlSetPresidentPassword(pass);
    } else {
      mockPresidentPassword = hashPassword(pass);
    }
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
      if (approvedApplication && !approvedApplication.welcomeEmailSent) {
        sendApprovalCongratulatoryEmail(approvedApplication, req).catch((e) => {
          console.warn('Verify-payment auto congratulatory email error:', e);
        });
      }
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
            console.log(`✓ Application ${updated.id} approved via Webhook -> ${updated.memberNumber}`);
            if (!updated.welcomeEmailSent) {
              sendApprovalCongratulatoryEmail(updated, req).catch((e) => {
                console.warn('Webhook auto approval congratulatory email error:', e);
              });
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

// 7. Admin: Direct Live Sync of Captured Razorpay Payments vs Pending Applications
app.post('/api/razorpay/sync-pending-payments', requireAdminOrSubAdmin(['approveMembers', 'manageRazorpay']), async (req, res) => {
  try {
    const { instance } = getRazorpayInstance();
    if (!instance) {
      return res.status(400).json({
        status: 'error',
        message: 'Razorpay API Key ID व Key Secret अद्याप कॉन्फिगर केलेले नाहीत. कृपया आधी "बँक / Razorpay सेटिंग्ज" मधून सेट करा.',
      });
    }

    const daysRaw = Number(req.body?.daysBack || 30);
    const daysBack = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.round(daysRaw), 1), 180) : 30;
    const toEpoch = Math.floor(Date.now() / 1000);
    const fromEpoch = toEpoch - daysBack * 86400;

    const allPayments: RazorpayApiPaymentLike[] = [];
    const pageSize = 100;
    const maxPages = 15; // Up to 1,500 most recent payments inside selected window

    for (let page = 0; page < maxPages; page++) {
      const batch = (await instance.payments.all({
        from: fromEpoch,
        to: toEpoch,
        count: pageSize,
        skip: page * pageSize,
      })) as unknown as { items?: RazorpayApiPaymentLike[]; count?: number };

      const items = Array.isArray(batch?.items) ? batch.items : [];
      allPayments.push(...items);
      if (items.length < pageSize) break;
    }

    const applications = isMysqlActive()
      ? await mysqlListApplications(false)
      : Array.isArray(req.body?.applications)
        ? req.body.applications
        : [];

    const matchResult = matchRazorpayPaymentsWithPendingApps({
      payments: allPayments,
      applications,
      minAmountPaise: 22000,
    });

    sendFreshJson(req, res, {
      status: 'success',
      daysBack,
      ...matchResult,
    });
  } catch (err: any) {
    console.error('Error syncing Razorpay payments:', err);
    const rawDesc =
      err?.error?.description ||
      err?.message ||
      'Razorpay सर्व्हरशी संपर्क साधताना तांत्रिक अडचण आली.';
    const statusCode = Number(err?.statusCode) === 401 ? 401 : 500;
    const message =
      statusCode === 401
        ? 'Razorpay Key ID किंवा Key Secret अवैध आहे. कृपया "बँक / Razorpay सेटिंग्ज" मधून तपासा.'
        : `Razorpay पेमेंट तपासताना त्रुटी आली: ${rawDesc}`;
    res.status(statusCode).json({ status: 'error', message });
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
        server: { middlewareMode: true, hmr: false },
        appType: 'spa'
      });
      app.get('/@vite/client', async (_req, res, next) => {
        try {
          const result = await vite.transformRequest('/@vite/client');
          if (!result?.code) return next();
          const patchedCode = result.code
            .replace(
              'transport.connect(createHMRHandler(handleMessage));',
              '/* HMR WebSocket disabled */'
            )
            .replace(
              'throw new Error("send was called before connect");',
              'return;'
            )
            .replace(
              'throw new Error("invoke was called before connect");',
              'return;'
            );
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          return res.send(patchedCode);
        } catch {
          return next();
        }
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

  // Digital Asset Links for Android TWA / PWABuilder verification (express.static skips dotfiles by default)
  app.get('/.well-known/assetlinks.json', (_req, res) => {
    const candidates = [
      path.resolve(process.cwd(), 'dist', '.well-known', 'assetlinks.json'),
      path.resolve(process.cwd(), 'public', '.well-known', 'assetlinks.json'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.sendFile(p);
      }
    }
    return res.status(200).json([]);
  });

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
      ensureMysqlSchema().catch((err) => {
        console.warn('Startup MySQL schema auto-heal notice:', err?.message || err);
      });
    }
  });
}

startServer();

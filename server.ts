import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
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

function getServerFirestore(): Firestore | null {
  if (serverDb) return serverDb;
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(cfgPath)) {
      console.warn('firebase-applet-config.json not found on server.');
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
async function allocateNextMemberNumberOnServer(db: Firestore, district?: string): Promise<string> {
  const counterRef = doc(db, 'settings', 'member_counter');
  const nextSeq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    let currentSeq = 71;
    if (snap.exists()) {
      const data = snap.data();
      const raw =
        typeof data.lastMemberNumber === 'number'
          ? data.lastMemberNumber
          : typeof data.totalApproved === 'number'
            ? data.totalApproved
            : 71;
      currentSeq = raw > 0 ? raw : 71;
    }
    const allocated = currentSeq + 1;
    tx.set(
      counterRef,
      {
        totalApproved: allocated,
        lastMemberNumber: allocated,
        lastUpdated: new Date().toISOString()
      },
      { merge: true }
    );
    return allocated;
  });

  return formatSequentialMemberNumber(district || 'MAHA', nextSeq);
}

async function findApplicationForPayment(
  db: Firestore,
  criteria: { applicationId?: string; phone?: string; email?: string }
): Promise<{ id: string; data: Record<string, any> } | null> {
  if (criteria.applicationId) {
    const directRef = doc(db, 'applications', String(criteria.applicationId).trim());
    const directSnap = await getDoc(directRef);
    if (directSnap.exists()) {
      return { id: directSnap.id, data: directSnap.data() };
    }
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
          docs[0]
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
          docs[0]
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
  const db = getServerFirestore();
  if (!db) return null;

  const found = await findApplicationForPayment(db, {
    applicationId: params.applicationId,
    phone: params.phone,
    email: params.email
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
  const nowIso = new Date().toISOString();

  // Idempotent: if already approved & paymentConfirmed, return existing record
  if (data.status === 'approved' && data.paymentConfirmed === true && data.memberNumber) {
    return {
      ...data,
      id,
      alreadyApproved: true
    };
  }

  const memberNumber =
    data.status === 'approved' && data.memberNumber
      ? String(data.memberNumber)
      : await allocateNextMemberNumberOnServer(db, data.district);

  const updates: Record<string, any> = {
    status: 'approved',
    memberNumber,
    paymentConfirmed: true,
    paymentRef: params.paymentId,
    razorpayPaymentId: params.paymentId,
    razorpayOrderId: params.orderId || data.razorpayOrderId || '',
    approvedAt: data.approvedAt || nowIso,
    updatedAt: nowIso,
    approvedBy: data.approvedBy || params.source
  };

  await setDoc(doc(db, 'applications', id), updates, { merge: true });

  return {
    ...data,
    ...updates,
    id
  };
}

// =========================================================================
// Middleware
// =========================================================================
app.use(cors());

// Raw body parser for Razorpay Webhook signature verification
app.use('/api/razorpay/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));

// Health check endpoint (no secrets exposed)
app.get('/api/health', (_req, res) => {
  const config = loadRazorpayConfig();
  const emailConfig = loadEmailConfig();
  res.json({
    status: 'ok',
    razorpayConfigured: Boolean(config.keyId && config.keySecret && config.enabled),
    webhookSecretConfigured: Boolean(config.webhookSecret),
    firebaseConfigured: Boolean(getServerFirestore()),
    emailConfigured: emailConfig.enabled
  });
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

    const db = getServerFirestore();
    if (!db) {
      return res.status(500).json({ status: 'error', sent: false, message: 'Firestore अनुपलब्ध आहे.' });
    }

    const appRef = doc(db, 'applications', String(applicationId).trim());
    const appSnap = await getDoc(appRef);
    if (!appSnap.exists()) {
      return res.status(404).json({ status: 'error', sent: false, message: 'अर्ज सापडला नाही.' });
    }

    const appData = appSnap.data();
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
      await setDoc(
        appRef,
        {
          idCardEmailSent: true,
          idCardEmailSentAt: new Date().toISOString()
        },
        { merge: true }
      );
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
app.get('/api/razorpay/admin-config', (req, res) => {
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
app.post('/api/razorpay/admin-config', (req, res) => {
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
app.post('/api/razorpay/create-order', async (req, res) => {
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

    res.json({
      status: 'success',
      verified: true,
      message: 'पेमेंट यशस्वीरीत्या पडताळले गेले (Signature Verified).',
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
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
  });
}

startServer();

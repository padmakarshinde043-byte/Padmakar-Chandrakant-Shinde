import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import Razorpay from 'razorpay';
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
  res.json({
    status: 'ok',
    razorpayConfigured: Boolean(config.keyId && config.keySecret && config.enabled),
    webhookSecretConfigured: Boolean(config.webhookSecret),
    firebaseConfigured: Boolean(getServerFirestore())
  });
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

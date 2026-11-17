import fs from 'fs';
import path from 'path';
import { Firestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { isMysqlActive } from '../db/mysqlPool';
import { mysqlGetSystemSetting, mysqlSaveSystemSetting } from '../db/mysqlRepository';

const WHATSAPP_CONFIG_FILE = path.resolve(process.cwd(), 'whatsapp-config.json');
const WHATSAPP_LOGS_FILE = path.resolve(process.cwd(), 'whatsapp-logs.json');
const SETTING_KEY_CONFIG = 'whatsapp_api_config';
const SETTING_KEY_LOGS = 'whatsapp_broadcast_logs';

export type WhatsAppProviderType = 'meta_cloud' | 'custom_webhook';
export type MetaSendMode = 'image_or_text' | 'template';
export type CustomPayloadStyle = 'standard_json' | 'aisensy' | 'ultramsg' | 'wasender';

export interface WhatsAppApiConfig {
  enabled: boolean;
  provider: WhatsAppProviderType;
  // Meta WhatsApp Cloud API settings
  metaPhoneNumberId: string;
  metaAccessToken: string;
  metaApiVersion: string;
  metaSendMode: MetaSendMode;
  metaTemplateName: string;
  metaTemplateLanguage: string;
  // Custom / Indian WhatsApp API Gateway (WATI, AiSensy, Interakt, UltraMsg, WaSender, etc.)
  customWebhookUrl: string;
  customAuthHeaderName: string;
  customAuthHeaderValue: string;
  customPayloadStyle: CustomPayloadStyle;
  // State President Default Identity
  defaultSenderName: string;
  defaultSenderTitle: string;
  defaultSenderPhoto: string;
  delayMs: number;
  updatedAt?: string;
}

export interface SanitizedWhatsAppConfig extends Omit<WhatsAppApiConfig, 'metaAccessToken' | 'customAuthHeaderValue'> {
  hasMetaAccessToken: boolean;
  metaAccessTokenPreview: string;
  hasCustomAuthHeader: boolean;
  customAuthHeaderPreview: string;
}

export interface WhatsAppRecipientInput {
  phone: string;
  name?: string;
  role?: string;
  district?: string;
  group?: string;
}

export interface WhatsAppBroadcastResultItem {
  phone: string;
  name: string;
  group: string;
  status: 'sent' | 'failed';
  messageId?: string;
  error?: string;
}

export interface WhatsAppBroadcastCampaignLog {
  id: string;
  createdAt: string;
  sentBy: string;
  senderName: string;
  senderTitle: string;
  photoUrl: string;
  messagePreview: string;
  groups: string[];
  totalTargeted: number;
  sentCount: number;
  failedCount: number;
  provider: WhatsAppProviderType;
  failures: Array<{ phone: string; name: string; error: string }>;
}

export const DEFAULT_WHATSAPP_CONFIG: WhatsAppApiConfig = {
  enabled: false,
  provider: 'meta_cloud',
  metaPhoneNumberId: '',
  metaAccessToken: '',
  metaApiVersion: 'v21.0',
  metaSendMode: 'image_or_text',
  metaTemplateName: 'mahasangh_president_notice',
  metaTemplateLanguage: 'mr',
  customWebhookUrl: '',
  customAuthHeaderName: 'Authorization',
  customAuthHeaderValue: '',
  customPayloadStyle: 'standard_json',
  defaultSenderName: 'मा. श्री. राजेंद्र खैरनार',
  defaultSenderTitle: 'राज्याध्यक्ष, महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
  defaultSenderPhoto: '',
  delayMs: 300,
};

const MARATHI_DIGITS = '०१२३४५६७८९';

export function convertDevanagariDigits(val: string): string {
  return String(val || '').replace(/[०-९]/g, (d) => String(MARATHI_DIGITS.indexOf(d)));
}

/**
 * Normalizes any Indian mobile string into E.164 digits without `+` (i.e. `91XXXXXXXXXX`).
 * Rejects placeholders like `-`, `.` or invalid lengths.
 */
export function normalizeIndianWhatsAppNumber(raw?: string): string | null {
  const cleanDigits = convertDevanagariDigits(String(raw || '')).replace(/\D/g, '');
  if (!cleanDigits) return null;

  let tenDigit = '';
  if (cleanDigits.length === 10) {
    tenDigit = cleanDigits;
  } else if (cleanDigits.length === 11 && cleanDigits.startsWith('0')) {
    tenDigit = cleanDigits.slice(1);
  } else if (cleanDigits.length === 12 && cleanDigits.startsWith('91')) {
    tenDigit = cleanDigits.slice(2);
  } else if (cleanDigits.length === 13 && cleanDigits.startsWith('091')) {
    tenDigit = cleanDigits.slice(3);
  } else {
    return null;
  }

  if (!/^[6-9]\d{9}$/.test(tenDigit)) {
    return null;
  }
  return `91${tenDigit}`;
}

export function isPlaceholderTestNumber(normalized91: string): boolean {
  // Reject obvious dummy placeholder sequences like 9800000049 used in static seeds
  return /^9198000000\d{2}$/.test(normalized91) || /^91(\d)\1{9}$/.test(normalized91);
}

export function formatPresidentWhatsAppMessage(params: {
  messageTemplate: string;
  senderName: string;
  senderTitle: string;
  recipient?: { name?: string; role?: string; district?: string };
  includeSignatureHeader?: boolean;
}): string {
  const recipientName = String(params.recipient?.name || 'सन्माननीय पदाधिकारी/सदस्य').trim();
  const recipientRole = String(params.recipient?.role || 'सदस्य').trim();
  const recipientDistrict = String(params.recipient?.district || 'महाराष्ट्र').trim();

  const body = String(params.messageTemplate || '')
    .replace(/\{नाव\}|\{name\}/gi, recipientName)
    .replace(/\{पद\}|\{post\}|\{role\}/gi, recipientRole)
    .replace(/\{जिल्हा\}|\{district\}/gi, recipientDistrict)
    .trim();

  if (params.includeSignatureHeader === false) {
    return body;
  }

  const headerLine = params.senderName
    ? `*${params.senderName.trim()}*${params.senderTitle ? `\n_${params.senderTitle.trim()}_` : ''}`
    : '';

  const footerLine = `\n\n— *महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ* (mahasangh.in)`;
  return `${headerLine ? `${headerLine}\n\n` : ''}${body}${footerLine}`;
}

function maskSecretPreview(secret: string): string {
  const s = String(secret || '').trim();
  if (!s) return '';
  if (s.length <= 10) return '••••••••';
  return `${s.slice(0, 6)}••••••${s.slice(-4)}`;
}

export function sanitizeWhatsAppConfig(cfg: WhatsAppApiConfig): SanitizedWhatsAppConfig {
  const { metaAccessToken, customAuthHeaderValue, ...rest } = cfg;
  return {
    ...rest,
    hasMetaAccessToken: Boolean(String(metaAccessToken || '').trim()),
    metaAccessTokenPreview: maskSecretPreview(metaAccessToken),
    hasCustomAuthHeader: Boolean(String(customAuthHeaderValue || '').trim()),
    customAuthHeaderPreview: maskSecretPreview(customAuthHeaderValue),
  };
}

export async function loadWhatsAppConfig(firestoreDb?: Firestore | null): Promise<WhatsAppApiConfig> {
  let stored: Partial<WhatsAppApiConfig> = {};

  if (isMysqlActive()) {
    try {
      const fromDb = await mysqlGetSystemSetting<Partial<WhatsAppApiConfig>>(SETTING_KEY_CONFIG);
      if (fromDb && typeof fromDb === 'object') stored = fromDb;
    } catch {}
  } else if (firestoreDb) {
    try {
      const snap = await getDoc(doc(firestoreDb, 'settings', SETTING_KEY_CONFIG));
      if (snap.exists()) stored = snap.data() as Partial<WhatsAppApiConfig>;
    } catch {}
  }

  try {
    if (fs.existsSync(WHATSAPP_CONFIG_FILE)) {
      const fileData = JSON.parse(fs.readFileSync(WHATSAPP_CONFIG_FILE, 'utf-8'));
      stored = { ...fileData, ...stored };
    }
  } catch {}

  const merged: WhatsAppApiConfig = {
    ...DEFAULT_WHATSAPP_CONFIG,
    ...stored,
    metaPhoneNumberId: String(stored.metaPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim(),
    metaAccessToken: String(stored.metaAccessToken || process.env.WHATSAPP_ACCESS_TOKEN || '').trim(),
    customWebhookUrl: String(stored.customWebhookUrl || process.env.WHATSAPP_WEBHOOK_URL || '').trim(),
    delayMs: Number.isFinite(Number(stored.delayMs)) ? Math.max(100, Math.min(3000, Number(stored.delayMs))) : 300,
  };

  return merged;
}

export async function saveWhatsAppConfig(
  incoming: Partial<WhatsAppApiConfig>,
  firestoreDb?: Firestore | null
): Promise<WhatsAppApiConfig> {
  const current = await loadWhatsAppConfig(firestoreDb);

  const next: WhatsAppApiConfig = {
    ...current,
    ...incoming,
    // Keep existing secret tokens if incoming field is blank/omitted
    metaAccessToken:
      incoming.metaAccessToken !== undefined && String(incoming.metaAccessToken).trim() !== ''
        ? String(incoming.metaAccessToken).trim()
        : current.metaAccessToken,
    customAuthHeaderValue:
      incoming.customAuthHeaderValue !== undefined && String(incoming.customAuthHeaderValue).trim() !== ''
        ? String(incoming.customAuthHeaderValue).trim()
        : current.customAuthHeaderValue,
    updatedAt: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(WHATSAPP_CONFIG_FILE, JSON.stringify(next, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist whatsapp-config.json:', err);
  }

  if (isMysqlActive()) {
    await mysqlSaveSystemSetting(SETTING_KEY_CONFIG, next);
  } else if (firestoreDb) {
    await setDoc(doc(firestoreDb, 'settings', SETTING_KEY_CONFIG), next);
  }

  return next;
}

export async function loadWhatsAppBroadcastLogs(
  firestoreDb?: Firestore | null
): Promise<WhatsAppBroadcastCampaignLog[]> {
  if (isMysqlActive()) {
    try {
      const fromDb = await mysqlGetSystemSetting<{ items?: WhatsAppBroadcastCampaignLog[] }>(
        SETTING_KEY_LOGS
      );
      if (Array.isArray(fromDb?.items)) return fromDb.items;
    } catch {}
  } else if (firestoreDb) {
    try {
      const snap = await getDoc(doc(firestoreDb, 'settings', SETTING_KEY_LOGS));
      const data = snap.exists() ? (snap.data() as { items?: WhatsAppBroadcastCampaignLog[] }) : null;
      if (Array.isArray(data?.items)) return data.items;
    } catch {}
  }

  try {
    if (fs.existsSync(WHATSAPP_LOGS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(WHATSAPP_LOGS_FILE, 'utf-8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

async function appendWhatsAppBroadcastLog(
  log: WhatsAppBroadcastCampaignLog,
  firestoreDb?: Firestore | null
): Promise<void> {
  const existing = await loadWhatsAppBroadcastLogs(firestoreDb);
  const updated = [log, ...existing].slice(0, 30);

  try {
    fs.writeFileSync(WHATSAPP_LOGS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  } catch {}

  if (isMysqlActive()) {
    await mysqlSaveSystemSetting(SETTING_KEY_LOGS, { items: updated }).catch(() => {});
  } else if (firestoreDb) {
    await setDoc(doc(firestoreDb, 'settings', SETTING_KEY_LOGS), { items: updated }).catch(() => {});
  }
}

function resolvePublicPhotoUrl(rawUrl?: string, originHint?: string): string {
  const clean = String(rawUrl || '').trim();
  if (!clean) return '';
  if (clean.startsWith('https://')) return clean;
  if (clean.startsWith('/') && originHint && originHint.startsWith('https://')) {
    return `${originHint.replace(/\/+$/, '')}${clean}`;
  }
  return '';
}

export async function sendSingleWhatsAppMessage(params: {
  config: WhatsAppApiConfig;
  phone91: string;
  formattedText: string;
  photoUrl?: string;
  recipient?: { name?: string; role?: string; district?: string };
  senderName: string;
  senderTitle: string;
  originHint?: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const { config, phone91, formattedText, senderName, senderTitle } = params;
  const publicPhotoUrl = resolvePublicPhotoUrl(params.photoUrl, params.originHint);

  if (config.provider === 'meta_cloud') {
    if (!config.metaPhoneNumberId || !config.metaAccessToken) {
      return {
        ok: false,
        error: 'Meta WhatsApp Cloud API चे Phone Number ID आणि Access Token सेट केलेले नाहीत.',
      };
    }

    const version = config.metaApiVersion || 'v21.0';
    const endpoint = `https://graph.facebook.com/${version}/${config.metaPhoneNumberId}/messages`;

    let payload: Record<string, any>;

    if (config.metaSendMode === 'template') {
      const templateName = config.metaTemplateName.trim() || 'mahasangh_president_notice';
      const components: any[] = [];
      if (publicPhotoUrl) {
        components.push({
          type: 'header',
          parameters: [{ type: 'image', image: { link: publicPhotoUrl } }],
        });
      }
      components.push({
        type: 'body',
        parameters: [{ type: 'text', text: formattedText.slice(0, 1000) }],
      });

      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone91,
        type: 'template',
        template: {
          name: templateName,
          language: { code: config.metaTemplateLanguage.trim() || 'mr' },
          components,
        },
      };
    } else if (publicPhotoUrl) {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone91,
        type: 'image',
        image: {
          link: publicPhotoUrl,
          caption: formattedText.slice(0, 1024),
        },
      };
    } else {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone91,
        type: 'text',
        text: {
          preview_url: true,
          body: formattedText.slice(0, 4096),
        },
      };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.metaAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: json?.error?.message || `Meta API HTTP ${res.status}`,
      };
    }

    return {
      ok: true,
      messageId: json?.messages?.[0]?.id || '',
    };
  }

  // Custom / Indian WhatsApp API Gateway
  if (!config.customWebhookUrl) {
    return { ok: false, error: 'Custom WhatsApp API URL सेट केलेली नाही.' };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.customAuthHeaderName && config.customAuthHeaderValue) {
    headers[config.customAuthHeaderName.trim()] = config.customAuthHeaderValue.trim();
  }

  const mobile10 = phone91.slice(2);
  let customBody: Record<string, any>;

  if (config.customPayloadStyle === 'ultramsg') {
    customBody = {
      to: `+${phone91}`,
      ...(publicPhotoUrl
        ? { image: publicPhotoUrl, caption: formattedText }
        : { body: formattedText }),
    };
  } else if (config.customPayloadStyle === 'wasender') {
    customBody = {
      to: `+${phone91}`,
      text: formattedText,
      ...(publicPhotoUrl ? { imageUrl: publicPhotoUrl } : {}),
    };
  } else if (config.customPayloadStyle === 'aisensy') {
    customBody = {
      apiKey: config.customAuthHeaderValue,
      campaignName: config.metaTemplateName || 'mahasangh_broadcast',
      destination: `+${phone91}`,
      userName: params.recipient?.name || 'Member',
      templateParams: [senderName, formattedText],
      ...(publicPhotoUrl ? { media: { url: publicPhotoUrl, filename: 'president-photo.jpg' } } : {}),
    };
  } else {
    customBody = {
      phone: phone91,
      phonePlus: `+${phone91}`,
      mobile10,
      name: params.recipient?.name || '',
      role: params.recipient?.role || '',
      district: params.recipient?.district || '',
      senderName,
      senderTitle,
      photoUrl: publicPhotoUrl,
      imageUrl: publicPhotoUrl,
      message: formattedText,
      caption: formattedText,
    };
  }

  const res = await fetch(config.customWebhookUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(customBody),
  });
  const textBody = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      error: `Gateway HTTP ${res.status}: ${textBody.slice(0, 180)}`,
    };
  }
  let parsedId = '';
  try {
    const j = JSON.parse(textBody);
    parsedId = String(j?.id || j?.messageId || j?.messages?.[0]?.id || '');
  } catch {}

  return { ok: true, messageId: parsedId };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runWhatsAppBroadcastCampaign(params: {
  config: WhatsAppApiConfig;
  recipients: WhatsAppRecipientInput[];
  messageTemplate: string;
  senderName: string;
  senderTitle: string;
  photoUrl?: string;
  groups: string[];
  sentBy: string;
  includeSignatureHeader?: boolean;
  originHint?: string;
  firestoreDb?: Firestore | null;
}): Promise<{
  campaignId: string;
  totalTargeted: number;
  sentCount: number;
  failedCount: number;
  results: WhatsAppBroadcastResultItem[];
}> {
  const seenPhones = new Set<string>();
  const uniqueTargets: Array<WhatsAppRecipientInput & { phone91: string }> = [];

  for (const r of params.recipients || []) {
    const phone91 = normalizeIndianWhatsAppNumber(r.phone);
    if (!phone91 || seenPhones.has(phone91)) continue;
    seenPhones.add(phone91);
    uniqueTargets.push({ ...r, phone91 });
  }

  const results: WhatsAppBroadcastResultItem[] = [];
  let sentCount = 0;
  let failedCount = 0;

  for (let i = 0; i < uniqueTargets.length; i++) {
    const target = uniqueTargets[i];
    const text = formatPresidentWhatsAppMessage({
      messageTemplate: params.messageTemplate,
      senderName: params.senderName,
      senderTitle: params.senderTitle,
      recipient: target,
      includeSignatureHeader: params.includeSignatureHeader,
    });

    try {
      const sendRes = await sendSingleWhatsAppMessage({
        config: params.config,
        phone91: target.phone91,
        formattedText: text,
        photoUrl: params.photoUrl,
        recipient: target,
        senderName: params.senderName,
        senderTitle: params.senderTitle,
        originHint: params.originHint,
      });

      if (sendRes.ok) {
        sentCount++;
        results.push({
          phone: target.phone91,
          name: target.name || '',
          group: target.group || '',
          status: 'sent',
          messageId: sendRes.messageId,
        });
      } else {
        failedCount++;
        results.push({
          phone: target.phone91,
          name: target.name || '',
          group: target.group || '',
          status: 'failed',
          error: sendRes.error || 'Unknown API Error',
        });
      }
    } catch (err: any) {
      failedCount++;
      results.push({
        phone: target.phone91,
        name: target.name || '',
        group: target.group || '',
        status: 'failed',
        error: err?.message || 'Network failure',
      });
    }

    if (i < uniqueTargets.length - 1) {
      await sleep(Math.max(100, params.config.delayMs || 300));
    }
  }

  const campaignId = `wa_${Date.now()}`;
  const campaignLog: WhatsAppBroadcastCampaignLog = {
    id: campaignId,
    createdAt: new Date().toISOString(),
    sentBy: params.sentBy || 'super_admin',
    senderName: params.senderName,
    senderTitle: params.senderTitle,
    photoUrl: params.photoUrl || '',
    messagePreview: String(params.messageTemplate || '').slice(0, 140),
    groups: params.groups,
    totalTargeted: uniqueTargets.length,
    sentCount,
    failedCount,
    provider: params.config.provider,
    failures: results
      .filter((r) => r.status === 'failed')
      .slice(0, 40)
      .map((r) => ({ phone: r.phone, name: r.name, error: r.error || '' })),
  };

  await appendWhatsAppBroadcastLog(campaignLog, params.firestoreDb);

  return {
    campaignId,
    totalTargeted: uniqueTargets.length,
    sentCount,
    failedCount,
    results,
  };
}

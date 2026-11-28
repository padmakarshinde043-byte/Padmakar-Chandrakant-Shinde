import * as webpush from 'web-push';
import { isMysqlActive } from '../db/mysqlPool';
import { mysqlGetSystemSetting, mysqlSaveSystemSetting } from '../db/mysqlRepository';

export interface StoredPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PushBroadcastLogItem {
  id: string;
  title: string;
  body: string;
  url: string;
  sentBy: string;
  createdAt: string;
  totalTargeted: number;
  sentCount: number;
  failedCount: number;
  removedExpiredCount: number;
}

interface StoredVapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
  createdAt: string;
}

const SETTING_KEY_VAPID = 'web_push_vapid_keys_v1';
const SETTING_KEY_SUBSCRIPTIONS = 'web_push_subscriptions_v1';
const SETTING_KEY_LOGS = 'web_push_broadcast_logs_v1';
const MAX_SUBSCRIPTIONS = 50000;
const MAX_LOGS = 50;

let cachedVapidKeys: StoredVapidKeys | null = null;
let memorySubscriptions: StoredPushSubscription[] = [];
let memoryLogs: PushBroadcastLogItem[] = [];

const BASE64URL_KEY_REGEX = /^[A-Za-z0-9_-]{10,256}$/;
const SAFE_RELATIVE_PATH_REGEX = /^\/[a-zA-Z0-9/_-]*$/;

function isPrivateOrLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().trim().replace(/^\[|\]$/g, '');
  if (
    !h ||
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === '0.0.0.0' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.includes(':')
  ) {
    return true;
  }
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^0\./.test(h)) {
    return true;
  }
  const m172 = h.match(/^172\.(\d+)\./);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export function sanitizePushTargetUrl(rawUrl?: unknown): string {
  const s = String(rawUrl || '/').trim();
  if (!s || !s.startsWith('/') || s.startsWith('//')) return '/';
  if (!SAFE_RELATIVE_PATH_REGEX.test(s)) return '/';
  return s.slice(0, 120);
}

export function validatePushSubscriptionInput(
  raw: any
): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  if (!raw || typeof raw !== 'object') return null;
  const endpoint = String(raw.endpoint || '').trim();
  if (!endpoint || endpoint.length > 2048) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(endpoint);
  } catch {
    return null;
  }
  if (parsedUrl.protocol !== 'https:') return null;
  if (isPrivateOrLocalHostname(parsedUrl.hostname)) return null;

  const p256dh = String(raw.keys?.p256dh || '').trim();
  const auth = String(raw.keys?.auth || '').trim();
  if (!BASE64URL_KEY_REGEX.test(p256dh) || !BASE64URL_KEY_REGEX.test(auth)) {
    return null;
  }

  return {
    endpoint,
    keys: { p256dh, auth },
  };
}

export async function getOrCreateVapidKeys(): Promise<StoredVapidKeys> {
  const envPublic = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  const envPrivate = String(process.env.VAPID_PRIVATE_KEY || '').trim();
  const envSubject = String(process.env.VAPID_SUBJECT || 'mailto:mahasangh2026@gmail.com').trim();

  if (envPublic && envPrivate) {
    cachedVapidKeys = {
      publicKey: envPublic,
      privateKey: envPrivate,
      subject: envSubject || 'mailto:mahasangh2026@gmail.com',
      createdAt: new Date().toISOString(),
    };
    return cachedVapidKeys;
  }

  if (cachedVapidKeys) {
    return cachedVapidKeys;
  }

  if (isMysqlActive()) {
    try {
      const stored = await mysqlGetSystemSetting<StoredVapidKeys>(SETTING_KEY_VAPID);
      if (stored && stored.publicKey && stored.privateKey) {
        cachedVapidKeys = {
          publicKey: String(stored.publicKey),
          privateKey: String(stored.privateKey),
          subject: String(stored.subject || envSubject),
          createdAt: String(stored.createdAt || new Date().toISOString()),
        };
        return cachedVapidKeys;
      }
    } catch (err) {
      console.warn('[WebPush] Failed to read VAPID keys from MySQL:', err);
    }
  }

  const generated = webpush.generateVAPIDKeys();
  const fresh: StoredVapidKeys = {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    subject: envSubject || 'mailto:mahasangh2026@gmail.com',
    createdAt: new Date().toISOString(),
  };
  cachedVapidKeys = fresh;

  if (isMysqlActive()) {
    try {
      await mysqlSaveSystemSetting(SETTING_KEY_VAPID, fresh);
    } catch (err) {
      console.warn('[WebPush] Failed to persist generated VAPID keys to MySQL:', err);
    }
  }

  return fresh;
}

export async function getVapidPublicKey(): Promise<string> {
  const keys = await getOrCreateVapidKeys();
  return keys.publicKey;
}

export async function loadPushSubscriptions(): Promise<StoredPushSubscription[]> {
  if (isMysqlActive()) {
    try {
      const stored = await mysqlGetSystemSetting<StoredPushSubscription[]>(SETTING_KEY_SUBSCRIPTIONS);
      if (Array.isArray(stored)) {
        memorySubscriptions = stored.filter(
          (item) => item && typeof item.endpoint === 'string' && item.keys?.p256dh && item.keys?.auth
        );
        return memorySubscriptions;
      }
    } catch (err) {
      console.warn('[WebPush] Failed to read subscriptions from MySQL:', err);
    }
  }
  return memorySubscriptions;
}

async function savePushSubscriptions(list: StoredPushSubscription[]): Promise<void> {
  const trimmed = list.slice(-MAX_SUBSCRIPTIONS);
  memorySubscriptions = trimmed;
  if (isMysqlActive()) {
    try {
      await mysqlSaveSystemSetting(SETTING_KEY_SUBSCRIPTIONS, trimmed);
    } catch (err) {
      console.warn('[WebPush] Failed to save subscriptions to MySQL:', err);
    }
  }
}

export async function upsertPushSubscription(
  rawSub: any,
  userAgent?: string
): Promise<{ saved: boolean; totalSubscribers: number }> {
  const valid = validatePushSubscriptionInput(rawSub);
  if (!valid) {
    throw new Error('Invalid push subscription payload.');
  }

  const current = await loadPushSubscriptions();
  const nowIso = new Date().toISOString();
  const safeUa = String(userAgent || '').trim().slice(0, 220);

  const existingIdx = current.findIndex((s) => s.endpoint === valid.endpoint);
  if (existingIdx >= 0) {
    current[existingIdx] = {
      ...current[existingIdx],
      keys: valid.keys,
      userAgent: safeUa || current[existingIdx].userAgent,
      updatedAt: nowIso,
    };
  } else {
    current.push({
      endpoint: valid.endpoint,
      keys: valid.keys,
      userAgent: safeUa,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  await savePushSubscriptions(current);
  return { saved: true, totalSubscribers: current.length };
}

export async function removePushSubscription(endpoint: string): Promise<{ removed: boolean; totalSubscribers: number }> {
  const cleanEndpoint = String(endpoint || '').trim();
  if (!cleanEndpoint) {
    const current = await loadPushSubscriptions();
    return { removed: false, totalSubscribers: current.length };
  }
  const current = await loadPushSubscriptions();
  const next = current.filter((s) => s.endpoint !== cleanEndpoint);
  const removed = next.length !== current.length;
  if (removed) {
    await savePushSubscriptions(next);
  }
  return { removed, totalSubscribers: next.length };
}

export async function loadPushBroadcastLogs(): Promise<PushBroadcastLogItem[]> {
  if (isMysqlActive()) {
    try {
      const stored = await mysqlGetSystemSetting<PushBroadcastLogItem[]>(SETTING_KEY_LOGS);
      if (Array.isArray(stored)) {
        memoryLogs = stored;
        return memoryLogs;
      }
    } catch (err) {
      console.warn('[WebPush] Failed to read broadcast logs from MySQL:', err);
    }
  }
  return memoryLogs;
}

async function appendPushBroadcastLog(item: PushBroadcastLogItem): Promise<void> {
  const current = await loadPushBroadcastLogs();
  const next = [item, ...current].slice(0, MAX_LOGS);
  memoryLogs = next;
  if (isMysqlActive()) {
    try {
      await mysqlSaveSystemSetting(SETTING_KEY_LOGS, next);
    } catch (err) {
      console.warn('[WebPush] Failed to save broadcast log to MySQL:', err);
    }
  }
}

export interface PublicPushNotificationItem {
  id: string;
  title: string;
  body: string;
  url: string;
  createdAt: string;
}

export async function getPublicPushNotifications(): Promise<PublicPushNotificationItem[]> {
  const logs = await loadPushBroadcastLogs();
  return logs.map((item) => ({
    id: String(item.id || ''),
    title: String(item.title || ''),
    body: String(item.body || ''),
    url: sanitizePushTargetUrl(item.url),
    createdAt: String(item.createdAt || ''),
  }));
}

export async function getPushStats(): Promise<{
  subscriberCount: number;
  vapidConfigured: boolean;
  logs: PushBroadcastLogItem[];
}> {
  const [keys, subs, logs] = await Promise.all([
    getOrCreateVapidKeys(),
    loadPushSubscriptions(),
    loadPushBroadcastLogs(),
  ]);
  return {
    subscriberCount: subs.length,
    vapidConfigured: Boolean(keys.publicKey && keys.privateKey),
    logs,
  };
}

export async function sendPushBroadcast(params: {
  title: string;
  body: string;
  url?: string;
  sentBy: string;
}): Promise<PushBroadcastLogItem> {
  const title = String(params.title || '').trim().slice(0, 120);
  const body = String(params.body || '').trim().slice(0, 500);
  const url = sanitizePushTargetUrl(params.url);

  if (!title) {
    throw new Error('कृपया नोटिफिकेशनचे शीर्षक (Title) भरा.');
  }
  if (!body) {
    throw new Error('कृपया नोटिफिकेशनचा संदेश (Message) भरा.');
  }

  const keys = await getOrCreateVapidKeys();
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);

  const subscriptions = await loadPushSubscriptions();
  const payload = JSON.stringify({
    title,
    body,
    url,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    timestamp: Date.now(),
  });

  let sentCount = 0;
  let failedCount = 0;
  const expiredEndpoints = new Set<string>();

  const BATCH_SIZE = 20;
  for (let i = 0; i < subscriptions.length; i += BATCH_SIZE) {
    const batch = subscriptions.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.keys.p256dh,
                auth: sub.keys.auth,
              },
            },
            payload,
            { TTL: 60 * 60 * 24 }
          );
          sentCount++;
        } catch (err: any) {
          failedCount++;
          const statusCode = Number(err?.statusCode || 0);
          if (statusCode === 404 || statusCode === 410) {
            expiredEndpoints.add(sub.endpoint);
          }
        }
      })
    );
  }

  if (expiredEndpoints.size > 0) {
    const cleaned = subscriptions.filter((s) => !expiredEndpoints.has(s.endpoint));
    await savePushSubscriptions(cleaned);
  }

  const logEntry: PushBroadcastLogItem = {
    id: `push-${Date.now()}`,
    title,
    body,
    url,
    sentBy: String(params.sentBy || 'super_admin'),
    createdAt: new Date().toISOString(),
    totalTargeted: subscriptions.length,
    sentCount,
    failedCount,
    removedExpiredCount: expiredEndpoints.size,
  };

  await appendPushBroadcastLog(logEntry);
  return logEntry;
}

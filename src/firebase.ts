import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  getDocsFromServer,
  collection,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  onSnapshot,
  runTransaction,
  QuerySnapshot,
  DocumentData
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  MembershipApplication,
  NewsItem,
  GovOrder,
  LatestBannerItem,
  INITIAL_NEWS,
  INITIAL_APPLICATIONS,
  INITIAL_GOV_ORDERS,
  INITIAL_LATEST_BANNERS,
  formatSequentialMemberNumber,
} from './data/mahasanghData';
import {
  DEFAULT_COUNTER_BASELINE,
  parseMemberNumberSeq,
  extractHighestMemberSeq,
  computeNextSafeSeq,
  buildSequentialMemberNumber,
} from './utils/memberNumberAllocator';
import {
  normalizePhone10,
  normalizeEmail,
  isSyntheticMahasanghEmail,
  pickBestActiveApplication,
  pickActiveDuplicateMatch,
  shouldRemoveFromCacheOnDelete,
  classifyGhostApplicationsToPurge,
  DeleteTargetMeta,
} from './utils/applicationCleanup';
import {
  isSqlBackendActive,
  isFirebaseAllowedInCurrentEnvironment,
  isFirebaseAllowedSync,
  sqlApiRequest,
} from './api/sqlBridge';
import { computeNextVisitorStats } from './utils/visitorCounter';
import { stripHeavyApplicationFields } from './utils/directoryHelper';
import { toEnglishDigits } from './utils/formatters';
import { canUsePreviewRead, recordPreviewFirestoreReads } from './utils/previewFirebaseGuard';

let cachedPreviewApp: ReturnType<typeof initializeApp> | null = null;
let cachedPreviewDb: ReturnType<typeof getFirestore> | null = null;
let cachedPreviewAuth: ReturnType<typeof getAuth> | null = null;

/**
 * Lazy Firestore accessor: ONLY initializes Firebase SDK inside AI Studio Preview
 * when HostKarle MySQL is not active. On mahasangh.in production, Firebase SDK
 * is NEVER initialized or contacted.
 */
export function getPreviewDb() {
  if (!isFirebaseAllowedSync()) {
    return null;
  }
  if (cachedPreviewDb) return cachedPreviewDb;
  if (!cachedPreviewApp) {
    cachedPreviewApp = initializeApp(firebaseConfig);
  }
  cachedPreviewDb =
    firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
      ? getFirestore(cachedPreviewApp, firebaseConfig.firestoreDatabaseId)
      : getFirestore(cachedPreviewApp);
  return cachedPreviewDb;
}

export function getPreviewAuth() {
  if (!isFirebaseAllowedSync()) return null;
  if (cachedPreviewAuth) return cachedPreviewAuth;
  if (!cachedPreviewApp) {
    cachedPreviewApp = initializeApp(firebaseConfig);
  }
  cachedPreviewAuth = getAuth(cachedPreviewApp);
  return cachedPreviewAuth;
}

function requirePreviewDb() {
  const instance = getPreviewDb();
  if (!instance) {
    throw new Error('Firebase is disabled outside AI Studio Preview.');
  }
  return instance;
}

// Error Handling Definition
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const currentUser = cachedPreviewAuth?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const QUOTA_COOLDOWN_KEY = 'fb_quota_cooldown_until_v1';
const QUOTA_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown after resource-exhausted
let memoryQuotaCooldownUntil = 0;

export function isQuotaExceededError(error: unknown): boolean {
  if (!error) return false;
  const code = String((error as any)?.code || '').toLowerCase();
  const msg = String((error as any)?.message || error || '').toLowerCase();
  return (
    code === 'resource-exhausted' ||
    msg.includes('resource-exhausted') ||
    msg.includes('quota exceeded')
  );
}

export function isFirestoreQuotaInCooldown(): boolean {
  const now = Date.now();
  if (memoryQuotaCooldownUntil > now) return true;
  try {
    if (typeof sessionStorage !== 'undefined') {
      const stored = Number(sessionStorage.getItem(QUOTA_COOLDOWN_KEY) || 0);
      if (stored > now) {
        memoryQuotaCooldownUntil = stored;
        return true;
      }
    }
  } catch {}
  return false;
}

export function markFirestoreQuotaExceeded(error?: unknown): void {
  if (error && !isQuotaExceededError(error)) return;
  const until = Date.now() + QUOTA_COOLDOWN_MS;
  memoryQuotaCooldownUntil = until;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(QUOTA_COOLDOWN_KEY, String(until));
    }
  } catch {}
}

// Session-cached connection verification (Runs only once per session to save quota)
export async function testConnectionOncePerSession(): Promise<boolean> {
  if (await isSqlBackendActive()) {
    if (typeof window !== 'undefined') sessionStorage.setItem('fb_conn_ok', 'true');
    return true;
  }
  if (!(await isFirebaseAllowedInCurrentEnvironment())) {
    return false;
  }
  if (typeof window !== 'undefined' && sessionStorage.getItem('fb_conn_ok')) {
    return true;
  }
  if (isFirestoreQuotaInCooldown() || !canUsePreviewRead('conn_test', false)) {
    return false;
  }
  try {
    const previewDb = getPreviewDb();
    if (!previewDb) return false;
    const connPromise = getDocFromServer(doc(previewDb, 'test', 'connection'));
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firebase connection timeout')), 3500)
    );
    await Promise.race([connPromise, timeoutPromise]);
    recordPreviewFirestoreReads(1, 'conn_test', false);
    if (typeof window !== 'undefined') sessionStorage.setItem('fb_conn_ok', 'true');
    return true;
  } catch (error) {
    if (isQuotaExceededError(error)) {
      markFirestoreQuotaExceeded(error);
    }
    console.warn('Firebase connection notice (operating in graceful offline/cached mode):', error);
    if (typeof window !== 'undefined') sessionStorage.setItem('fb_conn_ok', 'true');
    return false;
  }
}

// CACHE-FIRST NEWS FETCHING:
// News is cached in localStorage for 60 minutes in Preview.
// Live mahasangh.in always uses HostKarle MySQL directly.
const NEWS_CACHE_KEY = 'mahasangh_news_cache_v2';
const NEWS_CACHE_TIME_KEY = 'mahasangh_news_cache_time_v2';
const CACHE_DURATION_MS = 60 * 60 * 1000; // 60 minutes

export async function fetchNewsCached(forceRefresh = false): Promise<NewsItem[]> {
  try {
    const cachedTime = localStorage.getItem(NEWS_CACHE_TIME_KEY);
    const cachedData = localStorage.getItem(NEWS_CACHE_KEY);

    if (!forceRefresh && cachedTime && cachedData) {
      const age = Date.now() - parseInt(cachedTime, 10);
      if (age < CACHE_DURATION_MS) {
        return sortNewsDescending(JSON.parse(cachedData));
      }
    }

    if (await isSqlBackendActive()) {
      const data = await sqlApiRequest<{ items: NewsItem[] }>('/api/db/news');
      const items = Array.isArray(data?.items) && data.items.length > 0 ? data.items : INITIAL_NEWS;
      const sortedSql = sortNewsDescending(items);
      safeStorageSet(NEWS_CACHE_KEY, JSON.stringify(sortedSql));
      safeStorageSet(NEWS_CACHE_TIME_KEY, Date.now().toString());
      return sortedSql;
    }

    if (
      !(await isFirebaseAllowedInCurrentEnvironment()) ||
      (!forceRefresh && isFirestoreQuotaInCooldown()) ||
      !canUsePreviewRead('news', false)
    ) {
      if (cachedData) return sortNewsDescending(JSON.parse(cachedData));
      return sortNewsDescending(INITIAL_NEWS);
    }

    const previewDb = getPreviewDb();
    if (!previewDb) {
      if (cachedData) return sortNewsDescending(JSON.parse(cachedData));
      return sortNewsDescending(INITIAL_NEWS);
    }

    // Cache expired or force refresh in AI Studio Preview: fetch from Firestore
    const newsCol = collection(previewDb, 'news');
    const newsSnap = await getDocs(newsCol);
    recordPreviewFirestoreReads(newsSnap.size || 1, 'news', false);

    if (newsSnap.empty) {
      // If collection empty in firestore, initialize with default news
      localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(INITIAL_NEWS));
      localStorage.setItem(NEWS_CACHE_TIME_KEY, Date.now().toString());
      return INITIAL_NEWS;
    }

    const loadedNews: NewsItem[] = [];
    newsSnap.forEach((d) => {
      const data = d.data() as any;
      loadedNews.push({
        id: d.id,
        ...data,
      });
    });

    const sorted = sortNewsDescending(loadedNews);

    safeStorageSet(NEWS_CACHE_KEY, JSON.stringify(sorted));
    safeStorageSet(NEWS_CACHE_TIME_KEY, Date.now().toString());
    return sorted;
  } catch (error) {
    if (isQuotaExceededError(error)) markFirestoreQuotaExceeded(error);
    console.warn('Using cached/default news due to network:', error);
    const cachedData = safeStorageGet(NEWS_CACHE_KEY);
    if (cachedData) {
      try {
        return sortNewsDescending(JSON.parse(cachedData));
      } catch {
        // fallback
      }
    }
    return sortNewsDescending(INITIAL_NEWS);
  }
}

const LATEST_BANNERS_CACHE_KEY = 'mahasangh_latest_banners_cache_v2';
const LATEST_BANNERS_CACHE_TIME_KEY = 'mahasangh_latest_banners_cache_time_v2';
const LEGACY_BANNERS_CACHE_KEY_V1 = 'mahasangh_latest_banners_cache_v1';
const LEGACY_BANNERS_CACHE_TIME_KEY_V1 = 'mahasangh_latest_banners_cache_time_v1';
const LATEST_BANNERS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes smart cache for Preview
const LEGACY_STUCK_BANNER_IDS = new Set(['banner-1', 'banner-2']);

function parseLatestBannerTime(item: Partial<LatestBannerItem> | null | undefined): number {
  if (!item) return 0;
  if (item.createdAt) {
    const t = new Date(item.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (item.date) {
    const clean = toEnglishDigits(String(item.date).trim());
    const dmy = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
      return new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10)).getTime();
    }
    const t = new Date(clean).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  return 0;
}

export function sortLatestBannersDescending(list: LatestBannerItem[]): LatestBannerItem[] {
  return [...list].sort((a, b) => parseLatestBannerTime(b) - parseLatestBannerTime(a));
}

function cleanLatestBannerPayload(banner: LatestBannerItem): LatestBannerItem {
  const payload: LatestBannerItem = {
    id: banner.id,
    title: banner.title.trim(),
    imageUrl: banner.imageUrl.trim(),
    date: banner.date,
    createdAt: banner.createdAt || new Date().toISOString(),
  };
  if (banner.summary && banner.summary.trim()) {
    payload.summary = banner.summary.trim();
  }
  return payload;
}

export function updateLatestBannersCache(list: LatestBannerItem[]): void {
  const sorted = sortLatestBannersDescending(
    list.filter((b) => !LEGACY_STUCK_BANNER_IDS.has(b.id))
  );
  safeStorageSet(LATEST_BANNERS_CACHE_KEY, JSON.stringify(sorted));
  safeStorageSet(LATEST_BANNERS_CACHE_TIME_KEY, Date.now().toString());
  try {
    localStorage.removeItem(LEGACY_BANNERS_CACHE_KEY_V1);
    localStorage.removeItem(LEGACY_BANNERS_CACHE_TIME_KEY_V1);
  } catch {}
}

export async function fetchLatestBannersCached(forceRefresh = false): Promise<LatestBannerItem[]> {
  try {
    try {
      localStorage.removeItem(LEGACY_BANNERS_CACHE_KEY_V1);
      localStorage.removeItem(LEGACY_BANNERS_CACHE_TIME_KEY_V1);
    } catch {}

    const cachedTime = localStorage.getItem(LATEST_BANNERS_CACHE_TIME_KEY);
    const cachedData = localStorage.getItem(LATEST_BANNERS_CACHE_KEY);

    if (!forceRefresh && cachedTime && cachedData) {
      const age = Date.now() - parseInt(cachedTime, 10);
      if (age < LATEST_BANNERS_CACHE_TTL_MS) {
        const parsed = JSON.parse(cachedData);
        if (Array.isArray(parsed)) {
          return sortLatestBannersDescending(parsed.filter((b) => !LEGACY_STUCK_BANNER_IDS.has(b?.id)));
        }
      }
    }

    if (await isSqlBackendActive()) {
      const data = await sqlApiRequest<{ items: LatestBannerItem[] }>('/api/db/latest-banners');
      const rawItems = Array.isArray(data?.items) ? data.items : [];
      const sortedSql = sortLatestBannersDescending(
        rawItems.filter((b) => !LEGACY_STUCK_BANNER_IDS.has(b?.id))
      );
      updateLatestBannersCache(sortedSql);
      return sortedSql;
    }

    if (
      !(await isFirebaseAllowedInCurrentEnvironment()) ||
      (!forceRefresh && isFirestoreQuotaInCooldown()) ||
      !canUsePreviewRead('latest_banners', false)
    ) {
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        if (Array.isArray(parsed)) {
          return sortLatestBannersDescending(parsed.filter((b) => !LEGACY_STUCK_BANNER_IDS.has(b?.id)));
        }
      }
      return [];
    }

    const previewDb = getPreviewDb();
    if (!previewDb) return [];

    const colRef = collection(previewDb, 'latest_banners');
    const snap = await getDocs(colRef);
    recordPreviewFirestoreReads(snap.size || 1, 'latest_banners', false);

    if (snap.empty) {
      updateLatestBannersCache([]);
      return [];
    }

    const list: LatestBannerItem[] = [];
    const legacyIdsToPurge: string[] = [];
    snap.forEach((d) => {
      if (LEGACY_STUCK_BANNER_IDS.has(d.id)) {
        legacyIdsToPurge.push(d.id);
        return;
      }
      const data = d.data() as any;
      list.push({
        id: d.id,
        ...data,
      });
    });

    if (legacyIdsToPurge.length > 0) {
      Promise.all(legacyIdsToPurge.map((id) => deleteDoc(doc(previewDb, 'latest_banners', id)))).catch(() => {});
    }

    const sorted = sortLatestBannersDescending(list);
    updateLatestBannersCache(sorted);
    return sorted;
  } catch (error) {
    if (isQuotaExceededError(error)) markFirestoreQuotaExceeded(error);
    console.warn('Using cached latest banners:', error);
    const cachedData = safeStorageGet(LATEST_BANNERS_CACHE_KEY);
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        if (Array.isArray(parsed)) {
          return sortLatestBannersDescending(parsed.filter((b) => !LEGACY_STUCK_BANNER_IDS.has(b?.id)));
        }
      } catch {}
    }
    return [];
  }
}

export async function saveLatestBannerToFirestore(banner: LatestBannerItem): Promise<void> {
  try {
    const cleanPayload = cleanLatestBannerPayload(banner);
    if (await isSqlBackendActive()) {
      await sqlApiRequest('/api/db/latest-banners', {
        method: 'POST',
        body: JSON.stringify(cleanPayload),
      });
    } else {
      if (!(await isFirebaseAllowedInCurrentEnvironment())) {
        throw new Error('Firebase is disabled outside AI Studio Preview.');
      }
      const previewDb = requirePreviewDb();
      const docRef = doc(previewDb, 'latest_banners', cleanPayload.id);
      await setDoc(docRef, cleanPayload);
    }
    try {
      const existingRaw = safeStorageGet(LATEST_BANNERS_CACHE_KEY);
      const existing: LatestBannerItem[] = existingRaw ? JSON.parse(existingRaw) : [];
      const next = [cleanPayload, ...existing.filter((b) => b.id !== cleanPayload.id)];
      updateLatestBannersCache(next);
    } catch {
      localStorage.removeItem(LATEST_BANNERS_CACHE_TIME_KEY);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `latest_banners/${banner.id}`);
  }
}

export async function deleteLatestBannerFromFirestore(bannerId: string): Promise<void> {
  try {
    if (await isSqlBackendActive()) {
      await sqlApiRequest(`/api/db/latest-banners/${encodeURIComponent(bannerId)}`, {
        method: 'DELETE',
      });
    } else {
      if (!(await isFirebaseAllowedInCurrentEnvironment())) {
        throw new Error('Firebase is disabled outside AI Studio Preview.');
      }
      const previewDb = requirePreviewDb();
      const docRef = doc(previewDb, 'latest_banners', bannerId);
      await deleteDoc(docRef);
    }
    try {
      const existingRaw = safeStorageGet(LATEST_BANNERS_CACHE_KEY);
      const existing: LatestBannerItem[] = existingRaw ? JSON.parse(existingRaw) : [];
      updateLatestBannersCache(existing.filter((b) => b.id !== bannerId));
    } catch {
      localStorage.removeItem(LATEST_BANNERS_CACHE_TIME_KEY);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `latest_banners/${bannerId}`);
  }
}

// Parse DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, or Marathi month date strings consistently into UTC day timestamp
export function parseNewsDateMs(rawValue: unknown): number {
  if (!rawValue) return 0;
  const eng = toEnglishDigits(String(rawValue).trim());
  if (!eng) return 0;

  // 1. YYYY-MM-DD
  const ymd = eng.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10) - 1;
    const d = parseInt(ymd[3], 10);
    return Date.UTC(y, m, d);
  }

  // 2. DD/MM/YYYY or DD-MM-YYYY (must run before new Date() which misparses DD/MM as MM/DD!)
  const dmy = eng.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10) - 1;
    const y = parseInt(dmy[3], 10);
    return Date.UTC(y, m, d);
  }

  // 3. Marathi month names (e.g. "01 नोव्हेंबर 2026")
  const marathiMonths: Record<string, number> = {
    'जानेवारी': 0, 'फेब्रुवारी': 1, 'मार्च': 2, 'एप्रिल': 3, 'मे': 4, 'जून': 5,
    'जुलै': 6, 'ऑगस्ट': 7, 'सप्टेंबर': 8, 'ऑक्टोबर': 9, 'नोव्हेंबर': 10, 'डिसेंबर': 11
  };
  for (const [mName, mIdx] of Object.entries(marathiMonths)) {
    if (String(rawValue).includes(mName)) {
      const dayMatch = eng.match(/\d{1,2}/);
      const yearMatch = eng.match(/\d{4}/);
      const d = dayMatch ? parseInt(dayMatch[0], 10) : 1;
      const y = yearMatch ? parseInt(yearMatch[0], 10) : 2026;
      return Date.UTC(y, mIdx, d);
    }
  }

  // 4. ISO timestamp or fallback
  const direct = new Date(eng);
  if (!isNaN(direct.getTime()) && direct.getTime() > 0) {
    return Date.UTC(direct.getUTCFullYear(), direct.getUTCMonth(), direct.getUTCDate());
  }

  return 0;
}

// Universal sorting: newest news by selected publish date at top, older news moving down
export function sortNewsDescending(list: NewsItem[]): NewsItem[] {
  const parseDateDay = (item: any): number => {
    if (!item) return 0;
    const fromPublish = parseNewsDateMs(item.publishDate);
    if (fromPublish > 0) return fromPublish;
    const fromDate = parseNewsDateMs(item.date);
    if (fromDate > 0) return fromDate;
    return 0;
  };

  const parseExactTimestamp = (item: any): number => {
    if (!item) return 0;
    if (item.createdAt) {
      if (typeof item.createdAt === 'object' && item.createdAt.seconds) {
        return item.createdAt.seconds * 1000;
      }
      const t = new Date(item.createdAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    const match = String(item.id || '').match(/\d{10,}/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (num > 0) return num;
    }
    return 0;
  };

  return [...list].sort((a, b) => {
    const dayA = parseDateDay(a) || parseExactTimestamp(a);
    const dayB = parseDateDay(b) || parseExactTimestamp(b);
    if (dayB !== dayA) return dayB - dayA;

    const exactA = parseExactTimestamp(a);
    const exactB = parseExactTimestamp(b);
    if (exactB !== exactA) return exactB - exactA;

    const idNumA = Number(String(a?.id || '').match(/\d{10,}/)?.[0] || 0);
    const idNumB = Number(String(b?.id || '').match(/\d{10,}/)?.[0] || 0);
    return idNumB - idNumA;
  });
}

// Single write when admin publishes news
export async function saveNewsToFirestore(news: NewsItem): Promise<void> {
  const path = `news/${news.id}`;
  const newsWithCreated = {
    ...news,
    createdAt: news.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    if (await isSqlBackendActive()) {
      await sqlApiRequest('/api/db/news', {
        method: 'POST',
        body: JSON.stringify(newsWithCreated),
      });
    } else {
      if (!(await isFirebaseAllowedInCurrentEnvironment())) {
        throw new Error('Firebase is disabled outside AI Studio Preview.');
      }
      await setDoc(doc(requirePreviewDb(), 'news', news.id), newsWithCreated);
    }
    // Immediately invalidate and update local cache with newest at top
    const currentCached = safeStorageGet(NEWS_CACHE_KEY);
    const list: NewsItem[] = currentCached ? JSON.parse(currentCached) : [];
    const updated = sortNewsDescending([newsWithCreated, ...list.filter((x) => x.id !== news.id)]);
    safeStorageSet(NEWS_CACHE_KEY, JSON.stringify(updated));
    safeStorageSet(NEWS_CACHE_TIME_KEY, Date.now().toString());
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mahasangh_news_updated', { detail: updated }));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

const GOV_ORDERS_CACHE_KEY = 'mahasangh_gov_orders_cache_v1';
const GOV_ORDERS_CACHE_TIME_KEY = 'mahasangh_gov_orders_cache_time_v1';

export async function fetchGovOrders(forceRefresh = false): Promise<GovOrder[]> {
    try {
        if (!forceRefresh) {
            const cachedTime = safeStorageGet(GOV_ORDERS_CACHE_TIME_KEY);
            const cachedData = safeStorageGet(GOV_ORDERS_CACHE_KEY);
            if (cachedTime && cachedData) {
                const age = Date.now() - parseInt(cachedTime, 10);
                if (age < CACHE_DURATION_MS) {
                    const parsed = JSON.parse(cachedData);
                    if (Array.isArray(parsed)) return parsed;
                }
            }
        }

        if (await isSqlBackendActive()) {
            const data = await sqlApiRequest<{ items: GovOrder[] }>('/api/db/gov-orders');
            const list = Array.isArray(data?.items) ? data.items : [];
            const sortedSql = list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            safeStorageSet(GOV_ORDERS_CACHE_KEY, JSON.stringify(sortedSql));
            safeStorageSet(GOV_ORDERS_CACHE_TIME_KEY, Date.now().toString());
            return sortedSql;
        }

        if (
            !(await isFirebaseAllowedInCurrentEnvironment()) ||
            (!forceRefresh && isFirestoreQuotaInCooldown()) ||
            !canUsePreviewRead('gov_orders', false)
        ) {
            const cachedData = safeStorageGet(GOV_ORDERS_CACHE_KEY);
            if (cachedData) {
                try { return JSON.parse(cachedData); } catch {}
            }
            return [];
        }

        const previewDb = getPreviewDb();
        if (!previewDb) return [];
        const snap = await getDocs(collection(previewDb, 'gov_orders'));
        recordPreviewFirestoreReads(snap.size || 1, 'gov_orders', false);
        if (snap.empty) {
            safeStorageSet(GOV_ORDERS_CACHE_KEY, JSON.stringify([]));
            safeStorageSet(GOV_ORDERS_CACHE_TIME_KEY, Date.now().toString());
            return [];
        }
        const list: GovOrder[] = [];
        snap.forEach((d) => {
            list.push(d.data() as GovOrder);
        });
        const sorted = list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        safeStorageSet(GOV_ORDERS_CACHE_KEY, JSON.stringify(sorted));
        safeStorageSet(GOV_ORDERS_CACHE_TIME_KEY, Date.now().toString());
        return sorted;
    } catch (error) {
        if (isQuotaExceededError(error)) markFirestoreQuotaExceeded(error);
        console.warn('Could not read gov_orders from firestore:', error);
        const cachedData = safeStorageGet(GOV_ORDERS_CACHE_KEY);
        if (cachedData) {
            try {
                return JSON.parse(cachedData);
            } catch {
                // fallback
            }
        }
        return [];
    }
}

export async function saveGovOrderToFirestore(govOrder: GovOrder): Promise<void> {
    if (await isSqlBackendActive()) {
        await sqlApiRequest('/api/db/gov-orders', {
            method: 'POST',
            body: JSON.stringify(govOrder),
        });
    } else {
        if (!(await isFirebaseAllowedInCurrentEnvironment())) {
            throw new Error('Firebase is disabled outside AI Studio Preview.');
        }
        await setDoc(doc(requirePreviewDb(), 'gov_orders', govOrder.id), govOrder);
    }
    try {
        const cached = safeStorageGet(GOV_ORDERS_CACHE_KEY);
        const list: GovOrder[] = cached ? JSON.parse(cached) : [];
        const updated = [govOrder, ...list.filter((g) => g.id !== govOrder.id)]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        safeStorageSet(GOV_ORDERS_CACHE_KEY, JSON.stringify(updated));
        safeStorageSet(GOV_ORDERS_CACHE_TIME_KEY, Date.now().toString());
    } catch {
        // ignore cache error
    }
}

export async function deleteGovOrderFromFirestore(id: string): Promise<void> {
    if (await isSqlBackendActive()) {
        await sqlApiRequest(`/api/db/gov-orders/${encodeURIComponent(id)}`, {
            method: 'DELETE',
        });
    } else {
        if (!(await isFirebaseAllowedInCurrentEnvironment())) {
            throw new Error('Firebase is disabled outside AI Studio Preview.');
        }
        await deleteDoc(doc(requirePreviewDb(), 'gov_orders', id));
    }
    try {
        const cached = safeStorageGet(GOV_ORDERS_CACHE_KEY);
        if (cached) {
            const list: GovOrder[] = JSON.parse(cached);
            safeStorageSet(GOV_ORDERS_CACHE_KEY, JSON.stringify(list.filter((g) => g.id !== id)));
            safeStorageSet(GOV_ORDERS_CACHE_TIME_KEY, Date.now().toString());
        }
    } catch {
        // ignore cache error
    }
}

// Delete news from Firestore and update local cache
export async function deleteNewsFromFirestore(newsId: string): Promise<void> {
  const path = `news/${newsId}`;
  console.log('Attempting to delete news item:', newsId);
  try {
    if (await isSqlBackendActive()) {
      await sqlApiRequest(`/api/db/news/${encodeURIComponent(newsId)}`, {
        method: 'DELETE',
      });
    } else {
      if (!(await isFirebaseAllowedInCurrentEnvironment())) {
        throw new Error('Firebase is disabled outside AI Studio Preview.');
      }
      await deleteDoc(doc(requirePreviewDb(), 'news', newsId));
    }
    console.log('Successfully deleted news item:', newsId);
    const currentCached = safeStorageGet(NEWS_CACHE_KEY);
    const list: NewsItem[] = currentCached ? JSON.parse(currentCached) : [];
    const updated = list.filter((x) => x.id !== newsId);
    safeStorageSet(NEWS_CACHE_KEY, JSON.stringify(updated));
    safeStorageSet(NEWS_CACHE_TIME_KEY, Date.now().toString());
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mahasangh_news_updated', { detail: updated }));
    }
  } catch (error) {
    console.error('Failed to delete news item:', newsId, error);
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Helper to clean objects of undefined values before saving to Firestore
export function cleanForFirestore<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = cleanForFirestore(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

// Single write when member registers
export async function saveApplicationToFirestore(app: MembershipApplication): Promise<void> {
  const path = `applications/${app.id}`;
  try {
    const cleaned = cleanForFirestore(app);
    if (await isSqlBackendActive()) {
      await sqlApiRequest('/api/db/applications', {
        method: 'POST',
        body: JSON.stringify(cleaned),
      });
      return;
    }
    if (!(await isFirebaseAllowedInCurrentEnvironment())) {
      throw new Error('Firebase is disabled outside AI Studio Preview.');
    }
    await setDoc(doc(requirePreviewDb(), 'applications', app.id), cleaned, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// Targeted single-document search for status tracking (Consumes minimal reads, NOT the entire collection!)
export async function trackSingleApplicationDetailed(
  identifier: string
): Promise<{ app: MembershipApplication | null; verifiedFromServer: boolean }> {
  const queryTerm = toEnglishDigits(identifier.trim());
  if (!queryTerm) return { app: null, verifiedFromServer: false };

  if (await isSqlBackendActive()) {
    try {
      return await sqlApiRequest<{ app: MembershipApplication | null; verifiedFromServer: boolean }>(
        `/api/db/applications/track?q=${encodeURIComponent(queryTerm)}`
      );
    } catch (error) {
      console.warn('SQL track query error:', error);
      return { app: null, verifiedFromServer: false };
    }
  }

  if (!(await isFirebaseAllowedInCurrentEnvironment()) || !canUsePreviewRead('track_single', false)) {
    return { app: null, verifiedFromServer: false };
  }
  const previewDb = getPreviewDb();
  if (!previewDb) return { app: null, verifiedFromServer: false };

  let verifiedFromServer = false;

  const getDocServerFirst = async (ref: ReturnType<typeof doc>) => {
    try {
      const snap = await getDoc(ref);
      recordPreviewFirestoreReads(1, 'track_single', false);
      verifiedFromServer = true;
      return snap;
    } catch {
      return getDoc(ref);
    }
  };

  const getDocsServerFirst = async (q: ReturnType<typeof query>) => {
    try {
      const snap = await getDocs(q);
      recordPreviewFirestoreReads(snap.size || 1, 'track_single', false);
      verifiedFromServer = true;
      return snap;
    } catch {
      return getDocs(q);
    }
  };

  const pickBestMatch = (docs: any[]): MembershipApplication | null => {
    if (!docs || docs.length === 0) return null;
    const mapped = docs.map((d) => ({
      ...(d.data() as MembershipApplication),
      id: d.id,
    }));
    return pickBestActiveApplication(mapped);
  };

  try {
    // 1. Try by document ID
    const docRef = doc(previewDb, 'applications', queryTerm);
    const docSnap = await getDocServerFirst(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data() as MembershipApplication;
      const active = pickBestActiveApplication([{ ...data, id: docSnap.id }]);
      if (active) return { app: active, verifiedFromServer };
    }

    const appsCol = collection(previewDb, 'applications');

    // 2. Try by memberNumber (exact or uppercase)
    const upperTerm = queryTerm.toUpperCase();
    const qMember = query(appsCol, where('memberNumber', '==', upperTerm), limit(5));
    const snapMember = await getDocsServerFirst(qMember);
    if (!snapMember.empty) {
      const best = pickBestMatch(snapMember.docs);
      if (best) return { app: best, verifiedFromServer };
    }
    if (upperTerm !== queryTerm) {
      const qMemberExact = query(appsCol, where('memberNumber', '==', queryTerm), limit(5));
      const snapMemberExact = await getDocsServerFirst(qMemberExact);
      if (!snapMemberExact.empty) {
        const best = pickBestMatch(snapMemberExact.docs);
        if (best) return { app: best, verifiedFromServer };
      }
    }

    // 3. Try by applicationNumber (exact or uppercase)
    const qApp = query(appsCol, where('applicationNumber', '==', upperTerm), limit(5));
    const snapApp = await getDocsServerFirst(qApp);
    if (!snapApp.empty) {
      const best = pickBestMatch(snapApp.docs);
      if (best) return { app: best, verifiedFromServer };
    }

    // 4. Try by phone (exact and normalized last-10 digits)
    const digitsOnly = queryTerm.replace(/\D/g, '');
    const phoneCandidates = Array.from(
      new Set([queryTerm, ...(digitsOnly.length >= 10 ? [digitsOnly.slice(-10)] : [])])
    );
    for (const candidate of phoneCandidates) {
      const qPhone = query(appsCol, where('phone', '==', candidate), limit(5));
      const snapPhone = await getDocsServerFirst(qPhone);
      if (!snapPhone.empty) {
        const best = pickBestMatch(snapPhone.docs);
        if (best) return { app: best, verifiedFromServer };
      }
    }

    return { app: null, verifiedFromServer };
  } catch (error) {
    console.warn('Track query error:', error);
    return { app: null, verifiedFromServer: false };
  }
}

export async function trackSingleApplicationInFirestore(
  identifier: string
): Promise<MembershipApplication | null> {
  const res = await trackSingleApplicationDetailed(identifier);
  return res.app;
}

// Check live Firestore server for existing active (approved/pending) application by phone or email.
// Never blocks on rejected/deleted docs or standalone Marathi fullName matches.
export async function findExistingApplicationInFirestore(params: {
  phone?: string;
  email?: string;
  fullName?: string;
}): Promise<{
  match: { app: MembershipApplication; matchedBy: 'phone' | 'email' } | null;
  verifiedFromServer: boolean;
}> {
  if (await isSqlBackendActive()) {
    try {
      return await sqlApiRequest<{
        match: { app: MembershipApplication; matchedBy: 'phone' | 'email' } | null;
        verifiedFromServer: boolean;
      }>('/api/db/applications/find-existing', {
        method: 'POST',
        body: JSON.stringify(params),
      });
    } catch (error) {
      console.warn('Duplicate check SQL query error:', error);
      return { match: null, verifiedFromServer: false };
    }
  }

  if (!(await isFirebaseAllowedInCurrentEnvironment()) || !canUsePreviewRead('find_existing', false)) {
    return { match: null, verifiedFromServer: false };
  }
  const previewDb = getPreviewDb();
  if (!previewDb) return { match: null, verifiedFromServer: false };

  let verifiedFromServer = false;

  const getDocsServerFirst = async (q: ReturnType<typeof query>) => {
    try {
      const snap = await getDocs(q);
      recordPreviewFirestoreReads(snap.size || 1, 'find_existing', false);
      verifiedFromServer = true;
      return snap;
    } catch {
      return getDocs(q);
    }
  };

  try {
    const appsCol = collection(previewDb, 'applications');
    const collectedDocs: MembershipApplication[] = [];
    const seenDocIds = new Set<string>();

    const collectSnap = (snap: any) => {
      if (!snap || snap.empty) return;
      snap.docs.forEach((d: any) => {
        if (seenDocIds.has(d.id)) return;
        seenDocIds.add(d.id);
        collectedDocs.push({
          ...(d.data() as MembershipApplication),
          id: d.id,
        });
      });
    };

    // 1. Check by 10-digit phone (and raw phone variant if any legacy doc exists)
    const cleanPhone = normalizePhone10(params.phone);
    if (cleanPhone.length === 10) {
      const snapPhone = await getDocsServerFirst(
        query(appsCol, where('phone', '==', cleanPhone), limit(10))
      );
      collectSnap(snapPhone);

      const rawTrimmedPhone = toEnglishDigits((params.phone || '').trim());
      if (rawTrimmedPhone && rawTrimmedPhone !== cleanPhone) {
        const snapRawPhone = await getDocsServerFirst(
          query(appsCol, where('phone', '==', rawTrimmedPhone), limit(5))
        );
        collectSnap(snapRawPhone);
      }
    }

    // 2. Check by user-provided email (skip synthetic @mahasangh.in fallback)
    const cleanEmail = normalizeEmail(params.email);
    if (cleanEmail && !isSyntheticMahasanghEmail(cleanEmail)) {
      const snapEmail = await getDocsServerFirst(
        query(appsCol, where('email', '==', cleanEmail), limit(10))
      );
      collectSnap(snapEmail);
    }

    const activeMatch = pickActiveDuplicateMatch(collectedDocs, {
      phone: cleanPhone,
      email: cleanEmail,
    });

    return {
      match: activeMatch,
      verifiedFromServer,
    };
  } catch (error) {
    console.warn('Duplicate check Firestore query error:', error);
    return {
      match: null,
      verifiedFromServer: false,
    };
  }
}

// Admin only: On-demand applications fetch with smart cache (60s in SQL, 60m in AI Studio Preview to guard quota)
const ADMIN_APPS_CACHE_KEY = 'mahasangh_admin_apps_cache_v2';
const ADMIN_APPS_TIME_KEY = 'mahasangh_admin_apps_time_v2';
let adminAppsMemoryCache: { list: MembershipApplication[]; timestamp: number } | null = null;

function stripHeavyPhotosForStorage(apps: MembershipApplication[]): MembershipApplication[] {
  return apps.map((item) => {
    if (item.photo && item.photo.length > 2000 && item.photo.startsWith('data:image')) {
      const { photo, ...rest } = item;
      return rest;
    }
    return item;
  });
}

export async function fetchApplicationsForAdmin(forceRefresh = false): Promise<MembershipApplication[]> {
  try {
    const sqlActive = await isSqlBackendActive();
    const cacheTtl = sqlActive ? 60000 : 60 * 60 * 1000;

    if (!forceRefresh) {
      if (adminAppsMemoryCache && Date.now() - adminAppsMemoryCache.timestamp < cacheTtl) {
        return adminAppsMemoryCache.list;
      }
      const cached = safeStorageGet(ADMIN_APPS_CACHE_KEY);
      const cachedTime = safeStorageGet(ADMIN_APPS_TIME_KEY);
      if (cached && cachedTime && Date.now() - Number(cachedTime) < cacheTtl) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        } catch {}
      }
    }

    if (sqlActive) {
      const data = await sqlApiRequest<{ items: MembershipApplication[] }>('/api/db/applications');
      const list = Array.isArray(data?.items) ? data.items : [];
      list.sort(
        (a, b) =>
          new Date(b.createdAt || '').getTime() -
          new Date(a.createdAt || '').getTime()
      );
      adminAppsMemoryCache = { list, timestamp: Date.now() };
      safeStorageSet(ADMIN_APPS_CACHE_KEY, JSON.stringify(stripHeavyPhotosForStorage(list)));
      safeStorageSet(ADMIN_APPS_TIME_KEY, Date.now().toString());
      return list;
    }

    // Outside AI Studio Preview OR over daily Preview quota / 15-min scan cooldown -> return cache cleanly
    if (
      !(await isFirebaseAllowedInCurrentEnvironment()) ||
      !canUsePreviewRead('admin_apps', true)
    ) {
      if (adminAppsMemoryCache) return adminAppsMemoryCache.list;
      const cached = safeStorageGet(ADMIN_APPS_CACHE_KEY);
      if (cached) {
        try { return JSON.parse(cached); } catch {}
      }
      return [];
    }

    const previewDb = getPreviewDb();
    if (!previewDb) return [];

    const appsCol = collection(previewDb, 'applications');
    const snap = await getDocs(appsCol);
    recordPreviewFirestoreReads(snap.size || 1, 'admin_apps', true);

    if (snap.empty) {
      adminAppsMemoryCache = { list: [], timestamp: Date.now() };
      safeStorageSet(ADMIN_APPS_CACHE_KEY, JSON.stringify([]));
      safeStorageSet(ADMIN_APPS_TIME_KEY, Date.now().toString());
      return [];
    }
    const list: MembershipApplication[] = [];
    snap.forEach((d) => {
      const data = d.data() as MembershipApplication;
      list.push({ ...data, id: d.id });
    });
    list.sort(
      (a, b) =>
        new Date(b.createdAt || '').getTime() -
        new Date(a.createdAt || '').getTime()
    );
    adminAppsMemoryCache = { list, timestamp: Date.now() };
    safeStorageSet(ADMIN_APPS_CACHE_KEY, JSON.stringify(stripHeavyPhotosForStorage(list)));
    safeStorageSet(ADMIN_APPS_TIME_KEY, Date.now().toString());
    return list;
  } catch (error) {
    console.warn('Admin fetch applications error:', error);
    if (adminAppsMemoryCache) return adminAppsMemoryCache.list;
    const cached = safeStorageGet(ADMIN_APPS_CACHE_KEY);
    if (cached) {
      try { return JSON.parse(cached); } catch {}
    }
    return [];
  }
}

// Admin only: Zero-snapshot poll helper (avoids costly Firestore onSnapshot reconnect scans)
export function subscribeToApplicationsForAdmin(
  onSuccess: (apps: MembershipApplication[]) => void,
  onError?: (error: unknown) => void
): () => void {
  let cancelled = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  isSqlBackendActive()
    .then((useSql) => {
      if (cancelled) return;
      if (useSql) {
        const pull = async () => {
          try {
            const list = await fetchApplicationsForAdmin(true);
            if (!cancelled) onSuccess(list);
          } catch (err) {
            if (!cancelled && onError) onError(err);
          }
        };
        pull();
        pollTimer = setInterval(pull, 30000);
        return;
      }

      fetchApplicationsForAdmin(false)
        .then((list) => {
          if (!cancelled) onSuccess(list);
        })
        .catch((err) => {
          if (!cancelled && onError) onError(err);
        });
    })
    .catch((err) => {
      if (!cancelled && onError) onError(err);
    });

  return () => {
    cancelled = true;
    if (pollTimer) clearInterval(pollTimer);
  };
}

// Admin only: Full Member Edit / Update (updates memberNumber & all profile fields permanently in Firestore/SQL + caches)
export async function updateMemberInFirestore(member: MembershipApplication): Promise<void> {
  const path = `applications/${member.id}`;
  try {
    const payload = cleanForFirestore({
      ...member,
      taluka: member.taluka || '',
      centerName: member.centerName || '',
      familyMembers: member.familyMembers || '',
      hobby: member.hobby || '',
      professionalQualification: member.professionalQualification || '',
      memberNumber: member.memberNumber || '',
      photo: member.photo || '',
      isOfficial: Boolean(member.isOfficial),
      officialPost: member.isOfficial ? (member.officialPost || '') : '',
      officialDistrict: member.isOfficial ? (member.officialDistrict || '') : '',
      officialTaluka: member.isOfficial ? (member.officialTaluka || '') : '',
      approvedAt: member.status === 'approved' ? (member.approvedAt || new Date().toISOString()) : (member.approvedAt || ''),
      updatedAt: new Date().toISOString(),
    });
    if (await isSqlBackendActive()) {
      await sqlApiRequest('/api/db/applications', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      syncSingleMemberInCaches(member);
      return;
    }
    if (!(await isFirebaseAllowedInCurrentEnvironment())) {
      throw new Error('Firebase is disabled outside AI Studio Preview.');
    }
    await setDoc(doc(requirePreviewDb(), 'applications', member.id), payload, { merge: true });
    syncSingleMemberInCaches(member);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// Admin only: Approve application (saves permanently with merge)
export async function approveApplicationInFirestore(
  appId: string,
  memberNumber: string
): Promise<void> {
  const path = `applications/${appId}`;
  try {
    if (await isSqlBackendActive()) {
      const existing = await sqlApiRequest<{ app: MembershipApplication | null }>(
        `/api/db/applications/track?q=${encodeURIComponent(appId)}`
      );
      const base = existing?.app || ({ id: appId } as Partial<MembershipApplication>);
      const sqlPayload = cleanForFirestore({
        ...base,
        id: appId,
        status: 'approved',
        memberNumber,
        approvedAt: base.approvedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await sqlApiRequest('/api/db/applications', {
        method: 'POST',
        body: JSON.stringify(sqlPayload),
      });
      return;
    }
    if (!(await isFirebaseAllowedInCurrentEnvironment())) {
      throw new Error('Firebase is disabled outside AI Studio Preview.');
    }
    const payload = cleanForFirestore({
      status: 'approved',
      memberNumber,
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(requirePreviewDb(), 'applications', appId), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// Admin only: Reject application (saves permanently with merge)
export async function rejectApplicationInFirestore(
  appId: string,
  reason?: string
): Promise<void> {
  const path = `applications/${appId}`;
  try {
    if (await isSqlBackendActive()) {
      await sqlApiRequest(`/api/db/applications/${encodeURIComponent(appId)}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason || '' }),
      });
      return;
    }
    if (!(await isFirebaseAllowedInCurrentEnvironment())) {
      throw new Error('Firebase is disabled outside AI Studio Preview.');
    }
    const payload = cleanForFirestore({
      status: 'rejected',
      rejectReason: reason || '',
      rejectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(requirePreviewDb(), 'applications', appId), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// Admin only: Delete application permanently (including mismatched IDs & non-approved ghosts) + all local caches
export async function deleteApplicationFromFirestore(
  appId: string,
  targetMeta?: Partial<DeleteTargetMeta>
): Promise<{ deletedDocIds: string[]; removedAllForPhone: boolean }> {
  const path = `applications/${appId}`;
  try {
    if (await isSqlBackendActive()) {
      const res = await sqlApiRequest<{ deletedDocIds: string[]; removedAllForPhone: boolean }>(
        `/api/db/applications/${encodeURIComponent(appId)}`,
        {
          method: 'DELETE',
          body: JSON.stringify(targetMeta || {}),
        }
      );
      removeMemberFromCaches(appId, targetMeta, {
        removeAllMatchingPhone: res?.removedAllForPhone ?? true,
      });
      return res;
    }
    if (!(await isFirebaseAllowedInCurrentEnvironment())) {
      throw new Error('Firebase is disabled outside AI Studio Preview.');
    }
    const previewDb = requirePreviewDb();
    const appsCol = collection(previewDb, 'applications');
    let resolvedMeta: DeleteTargetMeta = {
      id: appId,
      applicationNumber: targetMeta?.applicationNumber,
      phone: targetMeta?.phone,
      email: targetMeta?.email,
      status: targetMeta?.status,
    };

    // Fetch live document before deleting so we always have full contact/appNumber metadata
    try {
      const existingSnap = await getDoc(doc(previewDb, 'applications', appId));
      if (existingSnap && existingSnap.exists()) {
        const data = existingSnap.data() as MembershipApplication;
        resolvedMeta = {
          id: appId,
          applicationNumber: resolvedMeta.applicationNumber || data.applicationNumber,
          phone: resolvedMeta.phone || data.phone,
          email: resolvedMeta.email || data.email,
          status: resolvedMeta.status || data.status,
        };
      }
    } catch {
      // Proceed using targetMeta
    }

    const docIdsToDelete = new Set<string>([appId]);
    let otherApprovedForSamePhone = false;

    // 1. Catch any doc whose stored `.id` field matches appId even if Firestore doc key differed
    try {
      const idSnap = await getDocsFromServer(query(appsCol, where('id', '==', appId), limit(10)));
      idSnap.forEach((d) => docIdsToDelete.add(d.id));
    } catch {
      // Ignore query failure
    }

    // 2. Catch any ghost/duplicate docs sharing the same 10-digit phone
    const cleanPhone = normalizePhone10(resolvedMeta.phone);
    if (cleanPhone.length === 10) {
      try {
        const phoneSnap = await getDocsFromServer(
          query(appsCol, where('phone', '==', cleanPhone), limit(15))
        );
        phoneSnap.forEach((d) => {
          if (d.id === appId) {
            docIdsToDelete.add(d.id);
            return;
          }
          const data = d.data() as MembershipApplication;
          const st = String(data.status || '').toLowerCase();
          if (st === 'approved') {
            otherApprovedForSamePhone = true;
          } else {
            // Pending, rejected, deleted, or empty-status ghosts for this phone must be wiped
            docIdsToDelete.add(d.id);
          }
        });
      } catch {
        // Ignore query failure
      }
    }

    // 3. Catch any non-approved ghosts sharing the same real email
    const cleanEmail = normalizeEmail(resolvedMeta.email);
    if (cleanEmail && !isSyntheticMahasanghEmail(cleanEmail)) {
      try {
        const emailSnap = await getDocsFromServer(
          query(appsCol, where('email', '==', cleanEmail), limit(15))
        );
        emailSnap.forEach((d) => {
          if (d.id === appId) {
            docIdsToDelete.add(d.id);
            return;
          }
          const data = d.data() as MembershipApplication;
          const st = String(data.status || '').toLowerCase();
          if (st !== 'approved') {
            docIdsToDelete.add(d.id);
          }
        });
      } catch {
        // Ignore query failure
      }
    }

    // 4. Catch exact applicationNumber duplicates (only if not another unrelated approved record)
    const appNo = toEnglishDigits(String(resolvedMeta.applicationNumber || '')).trim().toUpperCase();
    if (appNo) {
      try {
        const appNoSnap = await getDocsFromServer(
          query(appsCol, where('applicationNumber', '==', appNo), limit(10))
        );
        appNoSnap.forEach((d) => {
          if (d.id === appId) {
            docIdsToDelete.add(d.id);
            return;
          }
          const data = d.data() as MembershipApplication;
          if (normalizePhone10(data.phone) === cleanPhone || String(data.status || '').toLowerCase() !== 'approved') {
            docIdsToDelete.add(d.id);
          }
        });
      } catch {
        // Ignore query failure
      }
    }

    const deletedDocIds = Array.from(docIdsToDelete).filter(Boolean);
    await Promise.all(deletedDocIds.map((docId) => deleteDoc(doc(previewDb, 'applications', docId))));

    const removeAllMatchingPhone = !otherApprovedForSamePhone;
    removeMemberFromCaches(appId, resolvedMeta, { removeAllMatchingPhone });

    return {
      deletedDocIds,
      removedAllForPhone: removeAllMatchingPhone,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
}

// ==========================================
// Central Member Counter & Smart Cache
// Saves 95%+ of Firestore reads by avoiding full-collection scans
// ==========================================

export interface MemberCounterData {
  totalApproved: number;
  lastMemberNumber: number;
  lastUpdated: string;
}

const MEMBER_COUNTER_CACHE_KEY = 'mhs_member_counter_cache_v2';
const APPROVED_MEMBERS_CACHE_KEY = 'mahasangh_approved_cache_v2';
const APPROVED_MEMBERS_CACHE_TIME_KEY = 'mahasangh_approved_cache_time_v2';
const APPROVED_CACHE_DURATION_MS = 60 * 60 * 1000; // 60 minutes smart cache in Preview

/**
 * Reads the central member counter from `settings/member_counter` (Consumes at most 1 read in Preview).
 * Never runs on production hosts (mahasangh.in).
 */
export async function getMemberCounter(): Promise<MemberCounterData> {
  if (await isSqlBackendActive()) {
    try {
      const res = await sqlApiRequest<MemberCounterData>('/api/db/member-counter');
      safeStorageSet(MEMBER_COUNTER_CACHE_KEY, JSON.stringify(res));
      return res;
    } catch (err) {
      console.warn('SQL counter read warning:', err);
    }
  }

  const readCachedCounter = (): MemberCounterData | null => {
    const cachedRaw = safeStorageGet(MEMBER_COUNTER_CACHE_KEY);
    if (cachedRaw) {
      try {
        return JSON.parse(cachedRaw);
      } catch {
        // fallback
      }
    }
    return null;
  };

  if (!(await isFirebaseAllowedInCurrentEnvironment())) {
    return readCachedCounter() || {
      totalApproved: DEFAULT_COUNTER_BASELINE,
      lastMemberNumber: DEFAULT_COUNTER_BASELINE,
      lastUpdated: new Date().toISOString(),
    };
  }

  const previewDb = getPreviewDb();
  if (previewDb && canUsePreviewRead('member_counter', false)) {
    const counterDocRef = doc(previewDb, 'settings', 'member_counter');
    try {
      const snap = await getDoc(counterDocRef);
      recordPreviewFirestoreReads(1, 'member_counter', false);
      if (snap.exists()) {
        const data = snap.data();
        const count = typeof data.lastMemberNumber === 'number'
          ? data.lastMemberNumber
          : (typeof data.totalApproved === 'number' ? data.totalApproved : 0);
        const res: MemberCounterData = {
          totalApproved: count,
          lastMemberNumber: count,
          lastUpdated: data.lastUpdated || new Date().toISOString()
        };
        safeStorageSet(MEMBER_COUNTER_CACHE_KEY, JSON.stringify(res));
        return res;
      }
    } catch (err) {
      console.warn('Central counter read warning:', err);
    }
  }

  const cached = readCachedCounter();
  if (cached) return cached;

  let baseline = 0;
  try {
    const appsRaw = safeStorageGet('mahasangh_applications') || safeStorageGet(APPROVED_MEMBERS_CACHE_KEY);
    if (appsRaw) {
      const apps = JSON.parse(appsRaw);
      baseline = extractHighestMemberSeq(apps);
    }
  } catch {
    // fallback
  }

  if (baseline <= 0) baseline = DEFAULT_COUNTER_BASELINE;

  const initData: MemberCounterData = {
    totalApproved: baseline,
    lastMemberNumber: baseline,
    lastUpdated: new Date().toISOString()
  };
  safeStorageSet(MEMBER_COUNTER_CACHE_KEY, JSON.stringify(initData));
  return initData;
}

let highestApprovedSeqMemoryCache: { value: number; timestamp: number } | null = null;

async function getTrueHighestApprovedSeqFromFirestore(): Promise<number> {
  if (highestApprovedSeqMemoryCache && Date.now() - highestApprovedSeqMemoryCache.timestamp < 15 * 60 * 1000) {
    return highestApprovedSeqMemoryCache.value;
  }
  if (
    isFirestoreQuotaInCooldown() ||
    !(await isFirebaseAllowedInCurrentEnvironment()) ||
    !canUsePreviewRead('highest_approved_seq', true)
  ) {
    return highestApprovedSeqMemoryCache?.value || DEFAULT_COUNTER_BASELINE;
  }
  const previewDb = getPreviewDb();
  if (!previewDb) {
    return highestApprovedSeqMemoryCache?.value || DEFAULT_COUNTER_BASELINE;
  }
  try {
    const appsCol = collection(previewDb, 'applications');
    const approvedQ = query(appsCol, where('status', '==', 'approved'));
    const snap = await getDocs(approvedQ);
    recordPreviewFirestoreReads(snap.size || 1, 'highest_approved_seq', true);
    let highest = DEFAULT_COUNTER_BASELINE;
    snap.forEach((d) => {
      const app = d.data() as MembershipApplication;
      if (app.memberNumber) {
        const seq = parseMemberNumberSeq(app.memberNumber);
        if (seq > highest) {
          highest = seq;
        }
      }
    });
    highestApprovedSeqMemoryCache = { value: highest, timestamp: Date.now() };
    return highest;
  } catch (err) {
    if (isQuotaExceededError(err)) markFirestoreQuotaExceeded(err);
    return highestApprovedSeqMemoryCache?.value || DEFAULT_COUNTER_BASELINE;
  }
}

function getKnownHighestSeqFromStorage(knownRecords?: Array<{ memberNumber?: string | null }>): number {
  let highest = extractHighestMemberSeq(knownRecords);
  try {
    const counterRaw = safeStorageGet(MEMBER_COUNTER_CACHE_KEY);
    if (counterRaw) {
      const c = JSON.parse(counterRaw);
      const val = typeof c?.lastMemberNumber === 'number' ? c.lastMemberNumber : (typeof c?.totalApproved === 'number' ? c.totalApproved : 0);
      if (val > highest) highest = val;
    }
  } catch {
    // Ignore cache parse issues
  }
  return highest;
}

async function hasExistingMemberNumberInFirestore(
  candidateMemberNumber: string,
  excludeAppId?: string
): Promise<boolean> {
  if (!(await isFirebaseAllowedInCurrentEnvironment()) || !canUsePreviewRead('member_num_check', false)) {
    return false;
  }
  const previewDb = getPreviewDb();
  if (!previewDb) return false;
  try {
    const appsCol = collection(previewDb, 'applications');
    const q = query(appsCol, where('memberNumber', '==', candidateMemberNumber), limit(3));
    const snap = await getDocs(q);
    recordPreviewFirestoreReads(snap.size || 1, 'member_num_check', false);
    if (snap.empty) return false;
    return snap.docs.some((d) => d.id !== excludeAppId);
  } catch {
    return false;
  }
}

/**
 * Atomically allocates the next unique sequential member number using a Firestore Transaction
 * on `settings/member_counter`, plus collision defense against existing `applications`.
 */
export async function allocateNextMemberNumber(
  district?: string,
  knownRecords?: Array<{ memberNumber?: string | null }>
): Promise<{ memberNumber: string; seqNumber: number }> {
  if (await isSqlBackendActive()) {
    const res = await sqlApiRequest<{ memberNumber: string; seqNumber: number }>(
      '/api/db/member-counter/allocate',
      {
        method: 'POST',
        body: JSON.stringify({ district }),
      }
    );
    safeStorageSet(
      MEMBER_COUNTER_CACHE_KEY,
      JSON.stringify({
        totalApproved: res.seqNumber,
        lastMemberNumber: res.seqNumber,
        lastUpdated: new Date().toISOString(),
      })
    );
    return res;
  }
  if (!(await isFirebaseAllowedInCurrentEnvironment())) {
    throw new Error('Firebase is disabled outside AI Studio Preview.');
  }
  const previewDb = requirePreviewDb();
  const counterDocRef = doc(previewDb, 'settings', 'member_counter');
  const trueHighest = await getTrueHighestApprovedSeqFromFirestore();
  let floorSeq = Math.max(getKnownHighestSeqFromStorage(knownRecords), trueHighest);

  for (let attempt = 0; attempt < 15; attempt++) {
    const allocatedSeq = await runTransaction(previewDb, async (tx) => {
      const snap = await tx.get(counterDocRef);
      let currentSeq = trueHighest;
      if (snap.exists()) {
        const data = snap.data();
        const rawLast = typeof data.lastMemberNumber === 'number' ? data.lastMemberNumber : 0;
        const rawTotal = typeof data.totalApproved === 'number' ? data.totalApproved : 0;
        const candidateCounter = Math.max(rawLast, rawTotal);
        currentSeq = candidateCounter > trueHighest + 5 ? trueHighest : Math.max(candidateCounter, trueHighest);
      }

      const nextSeq = computeNextSafeSeq({
        counterSeq: currentSeq,
        highestExistingSeq: floorSeq,
        minBaseline: DEFAULT_COUNTER_BASELINE,
      });

      const newCounterData: MemberCounterData = {
        totalApproved: nextSeq,
        lastMemberNumber: nextSeq,
        lastUpdated: new Date().toISOString()
      };
      tx.set(counterDocRef, newCounterData, { merge: true });
      return nextSeq;
    });

    const candidateNumber = buildSequentialMemberNumber(district, allocatedSeq);
    const hasCollision = await hasExistingMemberNumberInFirestore(candidateNumber);
    if (!hasCollision) {
      safeStorageSet(
        MEMBER_COUNTER_CACHE_KEY,
        JSON.stringify({
          totalApproved: allocatedSeq,
          lastMemberNumber: allocatedSeq,
          lastUpdated: new Date().toISOString(),
        })
      );
      return { memberNumber: candidateNumber, seqNumber: allocatedSeq };
    }

    // Existing member already owns this number; skip past it
    floorSeq = Math.max(floorSeq, allocatedSeq);
  }

  throw new Error('दुबार टाळण्यासाठी नवीन सदस्य क्रमांक तयार करता आला नाही. कृपया पुन्हा प्रयत्न करा.');
}

/**
 * Atomically approves an application AND allocates its memberNumber inside ONE Firestore Transaction.
 * - If the application is ALREADY approved with a memberNumber (e.g. via Webhook/Server/Another Admin),
 *   it preserves the existing memberNumber instead of allocating a duplicate!
 * - Prevents race conditions across simultaneous approvals or payments.
 */
export async function approveApplicationAtomicInFirestore(params: {
  appId: string;
  district?: string;
  extraUpdates?: Partial<MembershipApplication>;
  knownRecords?: Array<{ memberNumber?: string | null }>;
  paymentProofToken?: string;
}): Promise<{
  memberNumber: string;
  seqNumber: number;
  alreadyApproved: boolean;
  application: MembershipApplication;
}> {
  const { appId, district, extraUpdates = {}, knownRecords, paymentProofToken } = params;
  if (await isSqlBackendActive()) {
    const txResult = await sqlApiRequest<{
      memberNumber: string;
      seqNumber: number;
      alreadyApproved: boolean;
      application: MembershipApplication;
    }>('/api/db/applications/approve-atomic', {
      method: 'POST',
      body: JSON.stringify({ appId, district, extraUpdates, paymentProofToken }),
    });
    if (!txResult.alreadyApproved && txResult.seqNumber > 0) {
      safeStorageSet(
        MEMBER_COUNTER_CACHE_KEY,
        JSON.stringify({
          totalApproved: txResult.seqNumber,
          lastMemberNumber: txResult.seqNumber,
          lastUpdated: new Date().toISOString(),
        })
      );
    }
    return txResult;
  }
  if (!(await isFirebaseAllowedInCurrentEnvironment())) {
    throw new Error('Firebase is disabled outside AI Studio Preview.');
  }
  const previewDb = requirePreviewDb();
  const appRef = doc(previewDb, 'applications', appId);
  const counterDocRef = doc(previewDb, 'settings', 'member_counter');
  const trueHighest = await getTrueHighestApprovedSeqFromFirestore();
  let floorSeq = Math.max(getKnownHighestSeqFromStorage(knownRecords), trueHighest);

  // Pre-scan past any manually-assigned future numbers before locking inside transaction
  try {
    const preCounterSnap = await getDoc(counterDocRef);
    recordPreviewFirestoreReads(1, 'member_counter', false);
    const preCounterVal = preCounterSnap.exists()
      ? Math.max(
          Number(preCounterSnap.data().lastMemberNumber || 0),
          Number(preCounterSnap.data().totalApproved || 0),
          trueHighest
        )
      : trueHighest;
    let probeSeq = computeNextSafeSeq({
      counterSeq: preCounterVal,
      highestExistingSeq: floorSeq,
      minBaseline: DEFAULT_COUNTER_BASELINE,
    });
    for (let i = 0; i < 15; i++) {
      const probeCandidate = buildSequentialMemberNumber(district, probeSeq);
      const exists = await hasExistingMemberNumberInFirestore(probeCandidate, appId);
      if (!exists) break;
      floorSeq = Math.max(floorSeq, probeSeq);
      probeSeq++;
    }
  } catch {
    // Proceed into atomic transaction with current floorSeq
  }

  const txResult = await runTransaction(previewDb, async (tx) => {
    const [appSnap, counterSnap] = await Promise.all([
      tx.get(appRef),
      tx.get(counterDocRef),
    ]);

    const nowIso = new Date().toISOString();
    const existingData = (appSnap.exists() ? appSnap.data() : {}) as Partial<MembershipApplication>;

    // Idempotent guard: if already approved with a valid memberNumber, NEVER allocate a second one!
    const existingMemberNo = String(existingData.memberNumber || '').trim();
    if (existingData.status === 'approved' && existingMemberNo !== '') {
      const mergedExisting = cleanForFirestore({
        ...existingData,
        ...extraUpdates,
        status: 'approved',
        memberNumber: existingMemberNo,
        approvedAt: existingData.approvedAt || nowIso,
        updatedAt: nowIso,
      }) as MembershipApplication;

      if (Object.keys(extraUpdates).length > 0) {
        tx.set(appRef, mergedExisting, { merge: true });
      }

      return {
        memberNumber: existingMemberNo,
        seqNumber: parseMemberNumberSeq(existingMemberNo),
        alreadyApproved: true,
        application: { ...mergedExisting, id: appId },
      };
    }

    let currentCounter = trueHighest;
    if (counterSnap.exists()) {
      const cData = counterSnap.data();
      const rawLast = typeof cData.lastMemberNumber === 'number' ? cData.lastMemberNumber : 0;
      const rawTotal = typeof cData.totalApproved === 'number' ? cData.totalApproved : 0;
      const candidateCounter = Math.max(rawLast, rawTotal);
      currentCounter = candidateCounter > trueHighest + 5 ? trueHighest : Math.max(candidateCounter, trueHighest);
    }

    const nextSeq = computeNextSafeSeq({
      counterSeq: currentCounter,
      highestExistingSeq: floorSeq,
      minBaseline: DEFAULT_COUNTER_BASELINE,
    });
    const effectiveDistrict = existingData.district || district || 'MAHA';
    const newMemberNumber = buildSequentialMemberNumber(effectiveDistrict, nextSeq);

    tx.set(
      counterDocRef,
      {
        totalApproved: nextSeq,
        lastMemberNumber: nextSeq,
        lastUpdated: nowIso,
      },
      { merge: true }
    );

    const approvalPayload = cleanForFirestore({
      ...existingData,
      ...extraUpdates,
      status: 'approved',
      memberNumber: newMemberNumber,
      approvedAt: existingData.approvedAt || nowIso,
      updatedAt: nowIso,
    }) as MembershipApplication;

    tx.set(appRef, approvalPayload, { merge: true });

    return {
      memberNumber: newMemberNumber,
      seqNumber: nextSeq,
      alreadyApproved: false,
      application: { ...approvalPayload, id: appId },
    };
  });

  if (!txResult.alreadyApproved && txResult.seqNumber > 0) {
    safeStorageSet(
      MEMBER_COUNTER_CACHE_KEY,
      JSON.stringify({
        totalApproved: txResult.seqNumber,
        lastMemberNumber: txResult.seqNumber,
        lastUpdated: new Date().toISOString(),
      })
    );
  }

  return txResult;
}

/**
 * Atomically syncs the central counter forward so it never falls behind existing approved records.
 */
export async function syncMemberCounter(highestKnownCount: number): Promise<void> {
  if (!highestKnownCount || highestKnownCount <= 0) return;
  if (await isSqlBackendActive()) {
    try {
      await sqlApiRequest('/api/db/member-counter/sync', {
        method: 'POST',
        body: JSON.stringify({ highestKnownCount }),
      });
      safeStorageSet(
        MEMBER_COUNTER_CACHE_KEY,
        JSON.stringify({
          totalApproved: highestKnownCount,
          lastMemberNumber: highestKnownCount,
          lastUpdated: new Date().toISOString(),
        })
      );
    } catch (err) {
      console.warn('Sync SQL member counter error:', err);
    }
    return;
  }
  if (!(await isFirebaseAllowedInCurrentEnvironment())) return;
  const previewDb = getPreviewDb();
  if (!previewDb) return;
  const counterDocRef = doc(previewDb, 'settings', 'member_counter');
  try {
    const newVal = await runTransaction(previewDb, async (tx) => {
      const snap = await tx.get(counterDocRef);
      const current = snap.exists()
        ? Math.max(
            typeof snap.data().lastMemberNumber === 'number' ? snap.data().lastMemberNumber : 0,
            typeof snap.data().totalApproved === 'number' ? snap.data().totalApproved : 0
          )
        : 0;
      if (highestKnownCount > current) {
        const updated: MemberCounterData = {
          totalApproved: highestKnownCount,
          lastMemberNumber: highestKnownCount,
          lastUpdated: new Date().toISOString()
        };
        tx.set(counterDocRef, updated, { merge: true });
        return highestKnownCount;
      }
      return current;
    });
    safeStorageSet(
      MEMBER_COUNTER_CACHE_KEY,
      JSON.stringify({
        totalApproved: newVal,
        lastMemberNumber: newVal,
        lastUpdated: new Date().toISOString(),
      })
    );
  } catch (err) {
    console.warn('Sync member counter error:', err);
  }
}

const SQL_APPROVED_SOFT_TTL_MS = 15 * 1000; // 15s local cache in MySQL mode (unlimited fast queries)
let inFlightApprovedFetch: Promise<MembershipApplication[]> | null = null;
let inFlightForcedApprovedFetch: Promise<MembershipApplication[]> | null = null;

export function getCachedApprovedMembersSync(): MembershipApplication[] | null {
  try {
    const cachedData = safeStorageGet(APPROVED_MEMBERS_CACHE_KEY);
    if (!cachedData) return null;
    const parsed = JSON.parse(cachedData);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function broadcastApprovedMembersUpdate(list: MembershipApplication[]): void {
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('mahasangh_approved_updated', { detail: list }));
    } catch {}
  }
}

/**
 * SMART CACHE FOR APPROVED MEMBERS DIRECTORY:
 * Uses ultra-lightweight summary projection in HostKarle MySQL (~50KB gzipped)
 * with request deduplication so "यादी ताजी करा" finishes instantaneously.
 */
export async function fetchApprovedMembersCached(forceRefresh = false): Promise<MembershipApplication[]> {
  if (inFlightForcedApprovedFetch) {
    return inFlightForcedApprovedFetch;
  }
  if (!forceRefresh && inFlightApprovedFetch) {
    return inFlightApprovedFetch;
  }

  const runFetch = async (): Promise<MembershipApplication[]> => {
    try {
      const cachedTime = safeStorageGet(APPROVED_MEMBERS_CACHE_TIME_KEY);
      const cachedData = safeStorageGet(APPROVED_MEMBERS_CACHE_KEY);
      const sqlActive = await isSqlBackendActive();

      if (!forceRefresh && cachedTime && cachedData) {
        const age = Date.now() - parseInt(cachedTime, 10);
        const ttl = sqlActive ? SQL_APPROVED_SOFT_TTL_MS : APPROVED_CACHE_DURATION_MS;
        if (age < ttl) {
          const parsed = JSON.parse(cachedData);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        }
      }

      if (sqlActive) {
        const cacheBuster = forceRefresh ? `&_t=${Date.now()}` : '';
        const res = await sqlApiRequest<{ items: MembershipApplication[] }>(
          `/api/db/applications?status=approved&summary=1${cacheBuster}`,
          { cache: 'no-store' }
        );
        const list = (Array.isArray(res?.items) ? res.items : []).map(stripHeavyApplicationFields);
        list.sort(
          (a, b) =>
            new Date(b.approvedAt || b.createdAt || '').getTime() -
            new Date(a.approvedAt || a.createdAt || '').getTime()
        );
        safeStorageSet(APPROVED_MEMBERS_CACHE_KEY, JSON.stringify(list));
        safeStorageSet(APPROVED_MEMBERS_CACHE_TIME_KEY, Date.now().toString());
        broadcastApprovedMembersUpdate(list);
        return list;
      }

      if (!(await isFirebaseAllowedInCurrentEnvironment())) {
        if (cachedData) return JSON.parse(cachedData);
        return [];
      }

      if (isFirestoreQuotaInCooldown() || !canUsePreviewRead('approved_members', true)) {
        if (cachedData) return JSON.parse(cachedData);
        return [];
      }

      const previewDb = getPreviewDb();
      if (!previewDb) {
        if (cachedData) return JSON.parse(cachedData);
        return [];
      }

      // Query only approved records inside Preview (cooldown + daily cap enforced)
      const approvedQuery = query(collection(previewDb, 'applications'), where('status', '==', 'approved'));
      const snap = await getDocs(approvedQuery);
      recordPreviewFirestoreReads(snap.size || 1, 'approved_members', true);

      let list: MembershipApplication[] = [];
      if (snap && !snap.empty) {
        snap.forEach((d) => {
          const item = d.data() as MembershipApplication;
          list.push({
            ...item,
            id: d.id
          });
        });
      }

      // Sort descending by approval / creation date
      list.sort(
        (a, b) =>
          new Date(b.approvedAt || b.createdAt || '').getTime() -
          new Date(a.approvedAt || a.createdAt || '').getTime()
      );

      // Strip heavy base64 photos for local cache to save storage space
      const lightweightList = list.map(stripHeavyApplicationFields);

      safeStorageSet(APPROVED_MEMBERS_CACHE_KEY, JSON.stringify(lightweightList));
      safeStorageSet(APPROVED_MEMBERS_CACHE_TIME_KEY, Date.now().toString());
      broadcastApprovedMembersUpdate(lightweightList);

      return list;
    } catch (error) {
      if (isQuotaExceededError(error)) markFirestoreQuotaExceeded(error);
      console.warn('Using cached approved members due to network / quota:', error);
      const cachedData = safeStorageGet(APPROVED_MEMBERS_CACHE_KEY);
      if (cachedData) {
        try {
          return JSON.parse(cachedData);
        } catch {
          // fallback
        }
      }
      return [];
    }
  };

  const promise = runFetch().finally(() => {
    if (forceRefresh) {
      inFlightForcedApprovedFetch = null;
    } else {
      inFlightApprovedFetch = null;
    }
  });

  if (forceRefresh) {
    inFlightForcedApprovedFetch = promise;
  } else {
    inFlightApprovedFetch = promise;
  }

  return promise;
}

const REGISTERED_COUNT_CACHE_KEY = 'mhs_registered_members_count_v1';
let sessionRegisteredCountPromise: Promise<number> | null = null;

export function getCachedRegisteredMembersCountSync(): number | null {
  try {
    const raw = safeStorageGet(REGISTERED_COUNT_CACHE_KEY);
    if (raw !== null) {
      const n = Number(raw);
      if (!Number.isNaN(n) && n >= 0) return n;
    }
    const cachedList = getCachedApprovedMembersSync();
    if (Array.isArray(cachedList) && cachedList.length > 0) {
      return cachedList.length;
    }
  } catch {}
  return null;
}

/**
 * Fetches the total approved/registered members count ONCE per website visit (no continuous polling).
 */
export async function getRegisteredMembersCountOncePerSession(): Promise<number> {
  if (sessionRegisteredCountPromise) {
    return sessionRegisteredCountPromise;
  }

  sessionRegisteredCountPromise = (async () => {
    try {
      if (await isSqlBackendActive()) {
        const res = await sqlApiRequest<{ count: number }>('/api/db/applications/approved-count', {
          cache: 'no-store',
        });
        if (typeof res?.count === 'number' && res.count >= 0) {
          safeStorageSet(REGISTERED_COUNT_CACHE_KEY, String(res.count));
          return res.count;
        }
      }

      const list = await fetchApprovedMembersCached(false);
      if (Array.isArray(list)) {
        const count = list.length;
        safeStorageSet(REGISTERED_COUNT_CACHE_KEY, String(count));
        return count;
      }
    } catch (err) {
      console.warn('Registered members count once-per-visit fallback:', err);
    }

    return getCachedRegisteredMembersCountSync() ?? 0;
  })();

  return sessionRegisteredCountPromise;
}

/**
 * Optimistically appends a newly approved application to the local approved members cache
 * so the user immediately sees it without an extra network fetch.
 */
export function addApprovedMemberToCache(app: MembershipApplication): void {
  try {
    const raw = safeStorageGet(APPROVED_MEMBERS_CACHE_KEY);
    const current: MembershipApplication[] = raw ? JSON.parse(raw) : [];

    const appToCache = (app.photo && app.photo.length > 2000 && app.photo.startsWith('data:image'))
      ? { ...app, photo: undefined }
      : app;

    const updated = [appToCache, ...current.filter((x) => x.id !== app.id && x.memberNumber !== app.memberNumber)];
    safeStorageSet(APPROVED_MEMBERS_CACHE_KEY, JSON.stringify(updated));
    safeStorageSet(APPROVED_MEMBERS_CACHE_TIME_KEY, Date.now().toString());
  } catch (err) {
    console.warn('Cache append warning:', err);
  }
}

/**
 * Syncs an edited member across both approved cache and general applications cache.
 */
export function syncSingleMemberInCaches(app: MembershipApplication): void {
  try {
    const appToCache = (app.photo && app.photo.length > 2000 && app.photo.startsWith('data:image'))
      ? { ...app, photo: undefined }
      : app;

    // 1. Update mahasangh_approved_cache_v2
    const rawApproved = safeStorageGet(APPROVED_MEMBERS_CACHE_KEY);
    if (rawApproved) {
      const currentApproved: MembershipApplication[] = JSON.parse(rawApproved);
      const filteredApproved = currentApproved.filter((x) => x.id !== app.id);
      const nextApproved = app.status === 'approved' ? [appToCache, ...filteredApproved] : filteredApproved;
      safeStorageSet(APPROVED_MEMBERS_CACHE_KEY, JSON.stringify(nextApproved));
      safeStorageSet(APPROVED_MEMBERS_CACHE_TIME_KEY, Date.now().toString());
    }

    // 2. Update mahasangh_applications
    const rawApps = safeStorageGet('mahasangh_applications');
    if (rawApps) {
      const currentApps: MembershipApplication[] = JSON.parse(rawApps);
      const exists = currentApps.some((x) => x.id === app.id);
      const nextApps = exists
        ? currentApps.map((x) => (x.id === app.id ? appToCache : x))
        : [appToCache, ...currentApps];
      safeStorageSet('mahasangh_applications', JSON.stringify(nextApps));
    }
  } catch (err) {
    console.warn('syncSingleMemberInCaches warning:', err);
  }
}

/**
 * Removes a deleted member (and any matching non-approved duplicate/ghost entries)
 * from ALL local caches and invalidates cache timestamps immediately.
 */
export function removeMemberFromCaches(
  appId: string,
  targetMeta?: Partial<DeleteTargetMeta>,
  options?: { removeAllMatchingPhone?: boolean }
): void {
  const target: DeleteTargetMeta = {
    id: appId,
    applicationNumber: targetMeta?.applicationNumber,
    phone: targetMeta?.phone,
    email: targetMeta?.email,
    status: targetMeta?.status,
  };

  try {
    adminAppsMemoryCache = null;
    if (typeof localStorage === 'undefined') return;
    const arrayCacheKeys = [
      APPROVED_MEMBERS_CACHE_KEY,
      'mahasangh_applications',
      'mahasangh_applications_v1',
      'mahasangh_approved_cache_v1',
      ADMIN_APPS_CACHE_KEY,
    ];

    for (const key of arrayCacheKeys) {
      const raw = safeStorageGet(key);
      if (!raw) continue;
      try {
        const current = JSON.parse(raw);
        if (Array.isArray(current)) {
          const filtered = current.filter(
            (x: any) => !shouldRemoveFromCacheOnDelete(x, target, options)
          );
          safeStorageSet(key, JSON.stringify(filtered));
        }
      } catch {
        // ignore malformed cache
      }
    }

    localStorage.removeItem(ADMIN_APPS_TIME_KEY);
    localStorage.removeItem(APPROVED_MEMBERS_CACHE_TIME_KEY);
    localStorage.removeItem(MEMBER_COUNTER_CACHE_KEY);
  } catch (err) {
    console.warn('removeMemberFromCaches warning:', err);
  }
}

/**
 * Self-heals browser caches for a specific phone/email when live Firestore confirms
 * that no active application exists (e.g., member was deleted by Admin on another device).
 */
export function purgeStaleApplicationFromCachesByContact(params: {
  phone?: string;
  email?: string;
}): void {
  const cleanPhone = normalizePhone10(params.phone);
  const cleanEmail = normalizeEmail(params.email);
  if (cleanPhone.length !== 10 && (!cleanEmail || isSyntheticMahasanghEmail(cleanEmail))) return;

  removeMemberFromCaches(
    '',
    {
      id: '',
      phone: cleanPhone,
      email: cleanEmail,
    },
    { removeAllMatchingPhone: true }
  );
}

// ==========================================
// Zero-Quota Visitor Counter (Once per IST calendar day per browser, resets to 0 at 12:00 AM IST)
// ==========================================
export interface VisitorStats {
  today: number;
  total: number;
}

const VISITOR_LOCAL_KEY = 'mhs_real_visit_count_v6';
const VISITOR_DAILY_COUNTED_DATE_KEY = 'mhs_visit_counted_date_v6';
const MIN_VISITOR_BASELINE = 5155;

// Proactively clear legacy keys that carried old dummy/900 numbers
try {
  localStorage.removeItem('mhs_visitor_stats_v1');
  localStorage.removeItem('mhs_visitor_stats');
  localStorage.removeItem('mhs_site_visits');
  localStorage.removeItem('mhs_real_visit_count_v5');
  sessionStorage.removeItem('mhs_visit_recorded_session');
  sessionStorage.removeItem('mhs_visit_recorded_session_v5');
} catch {
  // ignore
}

export function getTodayISTString(): string {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  } catch {
    const d = new Date();
    const istTime = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
    return istTime.toISOString().split('T')[0];
  }
}

export function getMsUntilNextISTMidnight(): number {
  try {
    const now = new Date();
    const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const nextMidnight = new Date(istNow);
    nextMidnight.setHours(24, 0, 2, 0); // 12:00:02 AM IST
    const diff = nextMidnight.getTime() - istNow.getTime();
    return diff > 1000 ? diff : 60 * 1000;
  } catch {
    return 60 * 60 * 1000;
  }
}

let visitorSyncInFlight: Promise<VisitorStats> | null = null;
let visitorSyncDateStr = '';

export async function getVisitorCountsOncePerSession(): Promise<VisitorStats> {
  const todayDateStr = getTodayISTString();

  if (visitorSyncInFlight && visitorSyncDateStr === todayDateStr) {
    return visitorSyncInFlight;
  }

  visitorSyncDateStr = todayDateStr;
  visitorSyncInFlight = (async (): Promise<VisitorStats> => {
    let localStats: VisitorStats = { today: 0, total: MIN_VISITOR_BASELINE };
    let cachedDate = '';
    let cachedAtMs = 0;

    // 1. Read existing local stats from localStorage (resets today to 0 whenever IST date changes)
    try {
      const raw = localStorage.getItem(VISITOR_LOCAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.total === 'number' && parsed.total >= MIN_VISITOR_BASELINE) {
          cachedDate = typeof parsed.date === 'string' ? parsed.date : '';
          cachedAtMs = typeof parsed.updatedAtMs === 'number' ? parsed.updatedAtMs : 0;
          localStats = {
            total: parsed.total,
            today: cachedDate === todayDateStr && typeof parsed.today === 'number' ? Math.max(parsed.today, 0) : 0,
          };
        }
      }
    } catch {}

    let hasCountedToday = false;
    try {
      hasCountedToday =
        typeof localStorage !== 'undefined' &&
        localStorage.getItem(VISITOR_DAILY_COUNTED_DATE_KEY) === todayDateStr;
    } catch {}

    if (isFirestoreQuotaInCooldown()) {
      if (!hasCountedToday) {
        localStats = {
          today: localStats.today + 1,
          total: localStats.total + 1,
        };
        try {
          localStorage.setItem(VISITOR_DAILY_COUNTED_DATE_KEY, todayDateStr);
          localStorage.setItem(
            VISITOR_LOCAL_KEY,
            JSON.stringify({ ...localStats, date: todayDateStr, updatedAtMs: Date.now() })
          );
        } catch {}
      }
      return localStats;
    }

    // If this browser already counted today and local cache is fresh (< 2 min) with valid non-zero today count, return cached stats
    if (
      hasCountedToday &&
      cachedDate === todayDateStr &&
      localStats.today >= 1 &&
      Date.now() - cachedAtMs < 2 * 60 * 1000
    ) {
      return localStats;
    }

    try {
      if (await isSqlBackendActive()) {
        const res = await sqlApiRequest<VisitorStats>('/api/db/site-stats/visit', {
          method: 'POST',
          body: JSON.stringify({ increment: !hasCountedToday }),
        });
        if (!hasCountedToday) {
          try {
            localStorage.setItem(VISITOR_DAILY_COUNTED_DATE_KEY, todayDateStr);
          } catch {}
        }
        try {
          localStorage.setItem(
            VISITOR_LOCAL_KEY,
            JSON.stringify({
              ...res,
              date: todayDateStr,
              updatedAtMs: Date.now(),
            })
          );
        } catch {}
        return res;
      }

      // In non-SQL environments: NEVER touch Firebase outside AI Studio Preview,
      // and in AI Studio Preview use read-only getDoc at most once/hour (zero writes).
      if (!(await isFirebaseAllowedInCurrentEnvironment())) {
        if (!hasCountedToday) {
          localStats = {
            today: localStats.today + 1,
            total: localStats.total + 1,
          };
          try {
            localStorage.setItem(VISITOR_DAILY_COUNTED_DATE_KEY, todayDateStr);
            localStorage.setItem(
              VISITOR_LOCAL_KEY,
              JSON.stringify({ ...localStats, date: todayDateStr, updatedAtMs: Date.now() })
            );
          } catch {}
        }
        return localStats;
      }

      if (
        cachedDate === todayDateStr &&
        localStats.total >= MIN_VISITOR_BASELINE &&
        Date.now() - cachedAtMs < 60 * 60 * 1000
      ) {
        return localStats;
      }

      const previewDb = getPreviewDb();
      if (!previewDb || !canUsePreviewRead('visitor_stats', false)) {
        return { today: Math.max(localStats.today, 1), total: localStats.total };
      }

      const statsDocRef = doc(previewDb, 'site_stats', 'visits');
      const snap = await getDoc(statsDocRef);
      recordPreviewFirestoreReads(1, 'visitor_stats', false);

      if (snap.exists()) {
        const data = snap.data();
        const fsTotal = typeof data.total === 'number' ? data.total : 0;
        const fsDate = typeof data.lastDate === 'string' ? data.lastDate : '';
        const fsToday = typeof data.today === 'number' ? data.today : 0;

        const next = computeNextVisitorStats({
          currentTotal: fsTotal,
          currentToday: fsToday,
          lastDate: fsDate,
          todayDateStr,
          incrementVisit: false,
          minBaseline: MIN_VISITOR_BASELINE,
        });

        const liveStats: VisitorStats = {
          today: next.today,
          total: next.total,
        };
        try {
          localStorage.setItem(VISITOR_DAILY_COUNTED_DATE_KEY, todayDateStr);
          localStorage.setItem(
            VISITOR_LOCAL_KEY,
            JSON.stringify({
              ...liveStats,
              date: todayDateStr,
              updatedAtMs: Date.now(),
            })
          );
        } catch {}
        return liveStats;
      }
      return { today: Math.max(localStats.today, 1), total: localStats.total };
    } catch (err) {
      if (isQuotaExceededError(err)) markFirestoreQuotaExceeded(err);
      console.warn('Visitor counter sync notice:', err);
      if (!hasCountedToday) {
        localStats = {
          today: localStats.today + 1,
          total: localStats.total + 1,
        };
        try {
          localStorage.setItem(VISITOR_DAILY_COUNTED_DATE_KEY, todayDateStr);
        } catch {}
      }
      try {
        localStorage.setItem(
          VISITOR_LOCAL_KEY,
          JSON.stringify({
            ...localStats,
            date: todayDateStr,
            updatedAtMs: Date.now(),
          })
        );
      } catch {}
      return localStats;
    }
  })().finally(() => {
    visitorSyncInFlight = null;
  });

  return visitorSyncInFlight;
}

// ==========================================
// Contact Messages Management
// ==========================================
export interface ContactMessage {
  id: string;
  name: string;
  phone: string;
  email?: string;
  district?: string;
  subject?: string;
  message: string;
  photo?: string;
  createdAt: string;
  isRead?: boolean;
}

const CONTACTS_CACHE_KEY = 'mahasangh_contacts_cache_v1';

export async function saveContactToFirestore(contact: ContactMessage): Promise<void> {
  const cleanedContact = cleanForFirestore(contact) as ContactMessage;
  try {
    const raw = localStorage.getItem(CONTACTS_CACHE_KEY);
    const list: ContactMessage[] = raw ? JSON.parse(raw) : [];
    const updated = [cleanedContact, ...list.filter(c => c.id !== cleanedContact.id)];
    localStorage.setItem(CONTACTS_CACHE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error(e);
  }

  const path = `contacts/${cleanedContact.id}`;
  try {
    if (await isSqlBackendActive()) {
      await sqlApiRequest('/api/db/contacts', {
        method: 'POST',
        body: JSON.stringify(cleanedContact),
      });
      return;
    }
    if (!(await isFirebaseAllowedInCurrentEnvironment())) return;
    const previewDb = requirePreviewDb();
    await setDoc(doc(previewDb, 'contacts', cleanedContact.id), cleanedContact);
  } catch (error) {
    console.warn('Saved contact locally, remote sync error:', error);
  }
}

export async function fetchContactsForAdmin(): Promise<ContactMessage[]> {
  let list: ContactMessage[] = [];
  try {
    const raw = localStorage.getItem(CONTACTS_CACHE_KEY);
    if (raw) list = JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }

  try {
    if (await isSqlBackendActive()) {
      const res = await sqlApiRequest<{ items: ContactMessage[] }>('/api/db/contacts');
      const sqlList = Array.isArray(res?.items) ? res.items : [];
      sqlList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      localStorage.setItem(CONTACTS_CACHE_KEY, JSON.stringify(sqlList));
      return sqlList;
    }
    if (!(await isFirebaseAllowedInCurrentEnvironment()) || !canUsePreviewRead('contacts', false)) {
      return list;
    }
    const previewDb = getPreviewDb();
    if (!previewDb) return list;
    const snap = await getDocs(collection(previewDb, 'contacts'));
    recordPreviewFirestoreReads(snap.size || 1, 'contacts', false);
    if (!snap.empty) {
      const firestoreList: ContactMessage[] = [];
      snap.forEach((d) => firestoreList.push(d.data() as ContactMessage));
      firestoreList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      localStorage.setItem(CONTACTS_CACHE_KEY, JSON.stringify(firestoreList));
      return firestoreList;
    }
  } catch (err) {
    console.warn('Could not read contacts from backend, using local cache:', err);
  }

  return list;
}

export async function deleteContactMessageFromFirestore(id: string): Promise<void> {
  try {
    const raw = localStorage.getItem(CONTACTS_CACHE_KEY);
    if (raw) {
      const list: ContactMessage[] = JSON.parse(raw);
      const filtered = list.filter((c) => c.id !== id);
      localStorage.setItem(CONTACTS_CACHE_KEY, JSON.stringify(filtered));
    }
  } catch (e) {
    console.error(e);
  }

  try {
    if (await isSqlBackendActive()) {
      await sqlApiRequest(`/api/db/contacts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      return;
    }
    if (!(await isFirebaseAllowedInCurrentEnvironment())) return;
    const previewDb = requirePreviewDb();
    await deleteDoc(doc(previewDb, 'contacts', id));
  } catch (err) {
    console.warn('Deleted contact locally, remote delete error:', err);
  }
}

// ==========================================
// Admin Authentication & Dynamic Password Management
// ==========================================
const ADMIN_PWD_CACHE_KEY = 'mahasangh_admin_pwd_v2';
const ADMIN_EMAIL_CACHE_KEY = 'mahasangh_admin_email_v2';
export const DEFAULT_ADMIN_EMAIL = 'padmakarshinde043@gmail.com';
export const MASTER_RECOVERY_KEY = 'RK@Mahasangh2026';

export function safeStorageGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

export function safeStorageSet(key: string, val: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, val);
    }
  } catch (e) {
    console.warn(`safeStorageSet storage notice for key "${key}":`, e);
    // Attempt quota recovery by removing legacy keys
    try {
      localStorage.removeItem('mhs_visitor_stats_v1');
      localStorage.removeItem('mahasangh_news_cache_v1');
      localStorage.removeItem('mahasangh_applications_v1');
      localStorage.setItem(key, val);
    } catch {
      // Ignore fallback failure
    }
  }
}

/**
 * Safely caches applications to localStorage by stripping massive base64 photo strings
 * so localStorage never exceeds browser 5MB quota.
 */
export function safeCacheApplications(apps: MembershipApplication[]): void {
  try {
    if (typeof localStorage === 'undefined' || !Array.isArray(apps)) return;

    const lightweightApps = apps.map((app) => {
      if (app.photo && app.photo.length > 2000 && app.photo.startsWith('data:image')) {
        const { photo, ...rest } = app;
        return rest;
      }
      return app;
    });

    safeStorageSet('mahasangh_applications', JSON.stringify(lightweightApps));
  } catch (err) {
    console.warn('safeCacheApplications notice:', err);
  }
}

export async function getAdminCredentials(): Promise<{ email: string; password: string }> {
  try {
    if (await isSqlBackendActive()) {
      const res = await sqlApiRequest<{ email: string; password: string }>('/api/db/admin-auth');
      if (res?.password) {
        safeStorageSet(ADMIN_PWD_CACHE_KEY, res.password);
        safeStorageSet(ADMIN_EMAIL_CACHE_KEY, res.email || DEFAULT_ADMIN_EMAIL);
        return { email: res.email || DEFAULT_ADMIN_EMAIL, password: res.password };
      }
    }

    if (await isFirebaseAllowedInCurrentEnvironment()) {
      const previewDb = getPreviewDb();
      if (previewDb && canUsePreviewRead('admin_auth', false)) {
        const snap = await getDoc(doc(previewDb, 'settings', 'admin_auth'));
        recordPreviewFirestoreReads(1, 'admin_auth', false);

        if (snap && snap.exists()) {
          const data = snap.data();
          const pwd = data.password || 'Padmakar@2027';
          const em = data.email || DEFAULT_ADMIN_EMAIL;
          safeStorageSet(ADMIN_PWD_CACHE_KEY, pwd);
          safeStorageSet(ADMIN_EMAIL_CACHE_KEY, em);
          return { email: em, password: pwd };
        }
      }
    }
  } catch (err) {
    console.warn('Could not read admin_auth setting:', err);
  }

  // Fallback to local cache if offline
  const cachedPwd = safeStorageGet(ADMIN_PWD_CACHE_KEY);
  const cachedEmail = safeStorageGet(ADMIN_EMAIL_CACHE_KEY) || DEFAULT_ADMIN_EMAIL;

  if (cachedPwd) {
    return { email: cachedEmail, password: cachedPwd };
  }

  return { email: DEFAULT_ADMIN_EMAIL, password: 'Padmakar@2027' };
}

export async function updateAdminCredentials(newPassword: string, newEmail?: string): Promise<void> {
  const targetEmail = newEmail?.trim() || safeStorageGet(ADMIN_EMAIL_CACHE_KEY) || DEFAULT_ADMIN_EMAIL;
  const cleanPwd = newPassword.trim();

  if (await isSqlBackendActive()) {
    await sqlApiRequest('/api/db/admin-auth', {
      method: 'POST',
      body: JSON.stringify({ password: cleanPwd, email: targetEmail }),
    });
  } else {
    if (!(await isFirebaseAllowedInCurrentEnvironment())) {
      throw new Error('Firebase is disabled outside AI Studio Preview.');
    }
    const previewDb = requirePreviewDb();
    await setDoc(doc(previewDb, 'settings', 'admin_auth'), {
      email: targetEmail,
      password: cleanPwd,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }

  safeStorageSet(ADMIN_PWD_CACHE_KEY, cleanPwd);
  safeStorageSet(ADMIN_EMAIL_CACHE_KEY, targetEmail);
}

// ==========================================
// Multi-User Admin & RBAC Management (Manage Admins)
// ==========================================
export interface AdminPermissions {
  approveMembers: boolean;       // सदस्य पडताळणी व मंजुरी (Approve Members)
  editMembers?: boolean;         // सदस्य एडिट व डुप्लिकेट साफसफाई (Edit Members)
  manageLeadership: boolean;     // नेतृत्व व वेबसाईट माहिती बदलणे (Leadership Management)
  manageNews: boolean;           // बातम्या प्रसिद्ध करणे (News)
  manageGovOrders?: boolean;     // शासन निर्णय / GR अपलोड करणे (Gov Orders)
  manageLatestBanners?: boolean; // ताज्या घडामोडी बॅनर्स व फोटो जोडणे (Latest News Banners)
  viewIdCardPreview?: boolean;   // आय-कार्ड डिझाईन नमुना पाहणे (ID Card Preview)
  manageContactMessages?: boolean; // प्राप्त संदेश पाहणे व हाताळणे (Contact Inquiries)
  manageAdmins?: boolean;        // इतर ॲडमिन व्यवस्थापन (Manage Admins)
  manageRazorpay?: boolean;      // Razorpay पेमेंट व वेबहूक सेटिंग्ज (Razorpay & Webhook)
  manageCloudinary?: boolean;    // क्लाउड स्टोरेज सेटिंग्ज (Cloudinary)
}

export interface AdminUser {
  id: string;
  email: string;
  name?: string;
  password?: string;
  hasPassword?: boolean;
  isFirstLogin?: boolean;
  isSuperAdmin?: boolean;
  permissions: AdminPermissions;
  createdAt: string;
  lastLoginAt?: string;
}

const ADMIN_USERS_CACHE_KEY = 'mahasangh_sub_admins_v1';

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  try {
    if (await isSqlBackendActive()) {
      const res = await sqlApiRequest<{ items: AdminUser[] }>('/api/db/sub-admins');
      const list = Array.isArray(res?.items) ? res.items : [];
      safeStorageSet(ADMIN_USERS_CACHE_KEY, JSON.stringify(list));
      return list;
    }

    if (await isFirebaseAllowedInCurrentEnvironment()) {
      const previewDb = getPreviewDb();
      if (previewDb && canUsePreviewRead('sub_admins', false)) {
        const snap = await getDocs(collection(previewDb, 'sub_admins'));
        recordPreviewFirestoreReads(snap.size || 1, 'sub_admins', false);
        if (snap) {
          const list: AdminUser[] = [];
          snap.forEach((d) => list.push(d.data() as AdminUser));
          safeStorageSet(ADMIN_USERS_CACHE_KEY, JSON.stringify(list));
          return list;
        }
      }
    }
  } catch (err) {
    console.warn('Could not read sub_admins:', err);
  }

  // Fallback to local cache if remote fetch fails
  const cached = safeStorageGet(ADMIN_USERS_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      return [];
    }
  }
  return [];
}

export async function saveAdminUser(admin: AdminUser): Promise<void> {
  if (await isSqlBackendActive()) {
    await sqlApiRequest('/api/db/sub-admins', {
      method: 'POST',
      body: JSON.stringify(admin),
    });
  } else {
    if (!(await isFirebaseAllowedInCurrentEnvironment())) {
      throw new Error('Firebase is disabled outside AI Studio Preview.');
    }
    const previewDb = requirePreviewDb();
    await setDoc(doc(previewDb, 'sub_admins', admin.id), admin);
  }

  try {
    const existing = await fetchAdminUsers();
    const index = existing.findIndex((a) => a.id === admin.id || a.email.toLowerCase() === admin.email.toLowerCase());
    let updated: AdminUser[];
    if (index >= 0) {
      updated = [...existing];
      updated[index] = { ...updated[index], ...admin };
    } else {
      updated = [admin, ...existing];
    }
    safeStorageSet(ADMIN_USERS_CACHE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Local cache update notice:', e);
  }
}

export async function deleteAdminUser(adminId: string): Promise<void> {
  if (await isSqlBackendActive()) {
    await sqlApiRequest(`/api/db/sub-admins/${encodeURIComponent(adminId)}`, {
      method: 'DELETE',
    });
  } else {
    if (!(await isFirebaseAllowedInCurrentEnvironment())) {
      throw new Error('Firebase is disabled outside AI Studio Preview.');
    }
    const previewDb = requirePreviewDb();
    await deleteDoc(doc(previewDb, 'sub_admins', adminId));
  }
  try {
    const existing = await fetchAdminUsers();
    const updated = existing.filter((a) => a.id !== adminId);
    safeStorageSet(ADMIN_USERS_CACHE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Delete sub-admin local cache update:', e);
  }
}

export async function setAdminUserPassword(email: string, newPassword: string): Promise<boolean> {
  const cleanEmail = email.trim().toLowerCase();
  const existing = await fetchAdminUsers();
  const target = existing.find((a) => a.email.toLowerCase() === cleanEmail);

  if (!target) return false;

  const updatedAdmin: AdminUser = {
    ...target,
    password: newPassword.trim(),
    isFirstLogin: false,
    lastLoginAt: new Date().toISOString()
  };

  await saveAdminUser(updatedAdmin);
  return true;
}

export async function resetAdminUserToFirstLogin(adminId: string): Promise<boolean> {
  const existing = await fetchAdminUsers();
  const target = existing.find((a) => a.id === adminId);
  if (!target) return false;

  const updatedAdmin: AdminUser = {
    ...target,
    password: '',
    isFirstLogin: true,
  };

  await saveAdminUser(updatedAdmin);
  return true;
}

/**
 * Resequences all approved members in Firebase in chronological order of their submission/approval timestamp,
 * assigning continuous sequential numbers (1, 2, 3...) to fix gaps.
 */
export async function resequenceAllApprovedMembersInFirestore(): Promise<{ count: number; message: string }> {
  try {
    if (await isSqlBackendActive()) {
      const result = await sqlApiRequest<{ count: number; message: string }>(
        '/api/db/applications/resequence',
        { method: 'POST' }
      );
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(APPROVED_MEMBERS_CACHE_KEY);
        localStorage.removeItem('mahasangh_applications');
        localStorage.removeItem(MEMBER_COUNTER_CACHE_KEY);
        localStorage.removeItem('mahasangh_approved_cache_v1');
        localStorage.removeItem('mahasangh_applications_v1');
      }
      return result;
    }

    if (!(await isFirebaseAllowedInCurrentEnvironment())) {
      throw new Error('Firebase is disabled outside AI Studio Preview.');
    }
    if (!canUsePreviewRead('admin_bulk_resequence', true)) {
      return { count: 0, message: 'Preview दैनंदिन कोटा मर्यादेमुळे सध्या हा स्कॅन १५ मिनिटे थांबवला आहे.' };
    }
    const previewDb = requirePreviewDb();
    const appsCol = collection(previewDb, 'applications');
    const snap = await getDocs(appsCol);
    recordPreviewFirestoreReads(snap.size || 1, 'admin_bulk_resequence', true);
    if (snap.empty) {
      return { count: 0, message: 'कोणतेही अर्ज सापडले नाहीत.' };
    }

    const allApps: Array<MembershipApplication & { id: string }> = [];
    snap.forEach((d) => {
      const data = d.data() as MembershipApplication;
      allApps.push({ ...data, id: d.id });
    });

    // Filter only approved members
    const approved = allApps.filter((a) => a.status === 'approved');

    // Sort by createdAt or approvedAt ascending (oldest first)
    approved.sort((a, b) => {
      const dateA = new Date(a.approvedAt || a.createdAt || '').getTime() || 0;
      const dateB = new Date(b.approvedAt || b.createdAt || '').getTime() || 0;
      return dateA - dateB;
    });

    let count = 0;
    for (let i = 0; i < approved.length; i++) {
      const app = approved[i];
      const newSeq = i + 1;
      const district = app.district || 'MAHA';
      const newMemberNumber = formatSequentialMemberNumber(district, newSeq);

      if (app.memberNumber !== newMemberNumber) {
        const appRef = doc(previewDb, 'applications', app.id);
        await setDoc(appRef, { memberNumber: newMemberNumber, updatedAt: new Date().toISOString() }, { merge: true });
        count++;
      }
    }

    // Update central counter
    const counterDocRef = doc(previewDb, 'settings', 'member_counter');
    await setDoc(counterDocRef, {
      totalApproved: approved.length,
      lastMemberNumber: approved.length,
      lastUpdated: new Date().toISOString()
    }, { merge: true });

    // Clear local caches
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(APPROVED_MEMBERS_CACHE_KEY);
      localStorage.removeItem('mahasangh_applications');
      localStorage.removeItem(MEMBER_COUNTER_CACHE_KEY);
      localStorage.removeItem('mahasangh_approved_cache_v1');
      localStorage.removeItem('mahasangh_applications_v1');
    }

    return {
      count,
      message: `यशस्वी! ${approved.length} मंजूर सदस्यांचे क्रमांक क्रमाने (1 ते ${approved.length}) सलग लावले गेले.`
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'applications');
    throw error;
  }
}

/**
 * Resets the central member counter strictly to the highest actual member sequence number
 * found among approved members in the database.
 */
export async function resetMemberCounterToActualHighest(): Promise<{ highestSeq: number; message: string }> {
  try {
    if (await isSqlBackendActive()) {
      const result = await sqlApiRequest<{ highestSeq: number; message: string }>(
        '/api/db/applications/reset-counter',
        { method: 'POST' }
      );
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(MEMBER_COUNTER_CACHE_KEY);
        localStorage.removeItem(APPROVED_MEMBERS_CACHE_KEY);
        localStorage.removeItem('mahasangh_applications');
        localStorage.removeItem('mahasangh_approved_cache_v1');
        localStorage.removeItem('mahasangh_applications_v1');
      }
      return result;
    }

    if (!(await isFirebaseAllowedInCurrentEnvironment())) {
      throw new Error('Firebase is disabled outside AI Studio Preview.');
    }
    if (!canUsePreviewRead('admin_bulk_reset_counter', true)) {
      return {
        highestSeq: DEFAULT_COUNTER_BASELINE,
        message: 'Preview दैनंदिन कोटा मर्यादेमुळे सध्या हा स्कॅन १५ मिनिटे थांबवला आहे.',
      };
    }
    const previewDb = requirePreviewDb();
    const appsCol = collection(previewDb, 'applications');
    const snap = await getDocs(appsCol);
    recordPreviewFirestoreReads(snap.size || 1, 'admin_bulk_reset_counter', true);
    let highest = DEFAULT_COUNTER_BASELINE;

    snap.forEach((d) => {
      const app = d.data() as MembershipApplication;
      if (app.status === 'approved' && app.memberNumber) {
        const seq = parseMemberNumberSeq(app.memberNumber);
        if (seq > highest) {
          highest = seq;
        }
      }
    });

    const counterDocRef = doc(previewDb, 'settings', 'member_counter');
    await setDoc(counterDocRef, {
      totalApproved: highest,
      lastMemberNumber: highest,
      lastUpdated: new Date().toISOString()
    }, { merge: true });

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(MEMBER_COUNTER_CACHE_KEY);
      localStorage.removeItem(APPROVED_MEMBERS_CACHE_KEY);
      localStorage.removeItem('mahasangh_applications');
      localStorage.removeItem('mahasangh_approved_cache_v1');
      localStorage.removeItem('mahasangh_applications_v1');
    }

    return {
      highestSeq: highest,
      message: `यशस्वी! सदस्य क्रमांक काउंटर यशस्वीरित्या दुरुस्त करून Firebase वरील शेवटच्या खऱ्या क्रमांकावर (${highest}) सेट करण्यात आला आहे. आता पुढील नवीन अर्ज मंजूर केल्यावर क्रमांक यापुढून सुरू होईल.`
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'applications');
    throw error;
  }
}

/**
 * Purges ALL previously deleted/rejected/corrupt/duplicate-pending ghost records
 * from live database `applications` and clears every local cache across browsers.
 */
export async function purgeDeletedAndGhostApplicationsInFirestore(): Promise<{
  totalDeleted: number;
  rejectedOrDeletedCount: number;
  corruptCount: number;
  duplicateGhostCount: number;
  remainingCount: number;
  message: string;
}> {
  try {
    if (await isSqlBackendActive()) {
      const result = await sqlApiRequest<{
        totalDeleted: number;
        rejectedOrDeletedCount: number;
        corruptCount: number;
        duplicateGhostCount: number;
        remainingCount: number;
        message: string;
      }>('/api/db/applications/purge-ghosts', { method: 'POST' });

      adminAppsMemoryCache = null;
      if (typeof localStorage !== 'undefined') {
        const keysToClear = [
          APPROVED_MEMBERS_CACHE_KEY,
          APPROVED_MEMBERS_CACHE_TIME_KEY,
          'mahasangh_applications',
          'mahasangh_applications_v1',
          'mahasangh_approved_cache_v1',
          ADMIN_APPS_CACHE_KEY,
          ADMIN_APPS_TIME_KEY,
          MEMBER_COUNTER_CACHE_KEY,
        ];
        for (const k of keysToClear) {
          localStorage.removeItem(k);
        }
      }
      return result;
    }

    if (!(await isFirebaseAllowedInCurrentEnvironment())) {
      throw new Error('Firebase is disabled outside AI Studio Preview.');
    }
    if (!canUsePreviewRead('admin_bulk_purge', true)) {
      return {
        totalDeleted: 0,
        rejectedOrDeletedCount: 0,
        corruptCount: 0,
        duplicateGhostCount: 0,
        remainingCount: 0,
        message: 'Preview दैनंदिन कोटा मर्यादेमुळे सध्या हा स्कॅन १५ मिनिटे थांबवला आहे.',
      };
    }
    const previewDb = requirePreviewDb();
    const appsCol = collection(previewDb, 'applications');
    const snap = await getDocs(appsCol);
    recordPreviewFirestoreReads(snap.size || 1, 'admin_bulk_purge', true);

    const allDocs: Array<MembershipApplication & { docId: string }> = [];
    snap.forEach((d) => {
      const data = d.data() as MembershipApplication;
      allDocs.push({
        ...data,
        id: d.id,
        docId: d.id,
      });
    });

    const classification = classifyGhostApplicationsToPurge(allDocs);

    // Delete identified ghost/rejected/corrupt docs in chunks of 20
    const docIdsToDelete = classification.toDelete.map((item) => item.docId);
    for (let i = 0; i < docIdsToDelete.length; i += 20) {
      const chunk = docIdsToDelete.slice(i, i + 20);
      await Promise.all(chunk.map((docId) => deleteDoc(doc(previewDb, 'applications', docId))));
    }

    // Clear ALL application & counter caches so Admin and Member browsers start completely fresh
    adminAppsMemoryCache = null;
    if (typeof localStorage !== 'undefined') {
      const keysToClear = [
        APPROVED_MEMBERS_CACHE_KEY,
        APPROVED_MEMBERS_CACHE_TIME_KEY,
        'mahasangh_applications',
        'mahasangh_applications_v1',
        'mahasangh_approved_cache_v1',
        ADMIN_APPS_CACHE_KEY,
        ADMIN_APPS_TIME_KEY,
        MEMBER_COUNTER_CACHE_KEY,
      ];
      for (const k of keysToClear) {
        localStorage.removeItem(k);
      }
    }

    const totalDeleted = docIdsToDelete.length;
    const remainingCount = classification.keptIds.size;

    const message =
      totalDeleted > 0
        ? `✓ स्वच्छता पूर्ण! Firebase मधून एकूण ${totalDeleted} जुने/नाकारलेले/दुबार घोस्ट अर्ज कायमचे काढून टाकले गेले (नाकारलेले/डिलीट: ${classification.rejectedOrDeletedCount}, दुबार प्रलंबित: ${classification.duplicateGhostCount}, अपूर्ण: ${classification.corruptCount}). आता सर्व डिलीट झालेले सदस्य पुन्हा अर्ज भरू शकतात!`
        : '✓ Firebase मध्ये कोणतेही नाकारलेले, अपूर्ण किंवा दुबार घोस्ट रेकॉर्ड शिल्लक नाहीत; स्थानिक कॅश पूर्णपणे स्वच्छ केला आहे.';

    return {
      totalDeleted,
      rejectedOrDeletedCount: classification.rejectedOrDeletedCount,
      corruptCount: classification.corruptCount,
      duplicateGhostCount: classification.duplicateGhostCount,
      remainingCount,
      message,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'applications');
    throw error;
  }
}





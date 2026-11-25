/**
 * Mahasangh Core Data & API Service
 * 
 * - Production (mahasangh.in): 100% HostKarle MySQL (/api/db/*) via sqlBridge.
 * - AI Studio Preview / Localhost / Offline: 100% Zero-Quota Mock & LocalStorage engine.
 * - Firebase has been COMPLETELY REMOVED from the application.
 */

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
  pickActiveDuplicateMatch,
  classifyGhostApplicationsToPurge,
} from './utils/applicationCleanup';
import {
  isSqlBackendActive,
  sqlApiRequest,
  getAuthHeaders,
} from './api/sqlBridge';
import { computeNextVisitorStats } from './utils/visitorCounter';
import { toEnglishDigits } from './utils/formatters';
import {
  safeStorageSetItem,
  stripHeavyPhotosForCache,
} from './utils/officialsCache';

// Firebase stubs for complete backwards compatibility
export function getPreviewDb(): null {
  return null;
}

export function getPreviewAuth(): null {
  return null;
}

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
  authInfo: any;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  console.warn(`[Storage ${operationType}] at [${path}]:`, error);
}

export function isQuotaExceededError(_error: unknown): boolean {
  return false;
}

export function isFirestoreQuotaInCooldown(): boolean {
  return false;
}

export function markFirestoreQuotaExceeded(_error?: unknown): void {
  // No-op
}

export async function testConnectionOncePerSession(): Promise<boolean> {
  return true;
}

// -------------------------------------------------------------
// Storage Keys
// -------------------------------------------------------------
const NEWS_CACHE_KEY = 'mahasangh_news_cache_v2';
const BANNER_CACHE_KEY = 'mahasangh_latest_banners_v1';
const GOV_ORDERS_CACHE_KEY = 'mahasangh_gov_orders_cache_v1';
const APPLICATIONS_STORAGE_KEY = 'mahasangh_applications';
const ADMIN_APPS_CACHE_KEY = 'mahasangh_admin_applications_cache_v1';
const CONTACTS_STORAGE_KEY = 'mahasangh_contacts_v1';
const SUB_ADMINS_STORAGE_KEY = 'mahasangh_sub_admins_v1';
const ADMIN_PWD_CACHE_KEY = 'mahasangh_admin_password_cache';
const ADMIN_EMAIL_CACHE_KEY = 'mahasangh_admin_email_cache';
const MEMBER_COUNTER_CACHE_KEY = 'mahasangh_member_counter_cache';

export const DEFAULT_ADMIN_EMAIL = 'padmakarshinde043@gmail.com';
export const MASTER_RECOVERY_KEY = 'RK@Mahasangh2026';

// -------------------------------------------------------------
// Safe LocalStorage helpers
// -------------------------------------------------------------
export function safeStorageGet(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return null;
}

export function safeStorageSet(key: string, val: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      safeStorageSetItem(localStorage, key, val);
    }
  } catch {}
}

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

export function safeCacheApplications(apps: MembershipApplication[]): void {
  try {
    if (typeof localStorage === 'undefined' || !Array.isArray(apps)) return;
    // Remove legacy duplicate copy immediately to free ~1.5-2 MB of quota
    try {
      localStorage.removeItem(ADMIN_APPS_CACHE_KEY);
    } catch {}

    const lightweightApps = stripHeavyPhotosForCache(apps);
    const serialized = JSON.stringify(lightweightApps);
    const saved = safeStorageSetItem(localStorage, APPLICATIONS_STORAGE_KEY, serialized, [
      ADMIN_APPS_CACHE_KEY,
      'mahasangh_dynamic_leadership_v1',
      'rk2026_officials_cache_v1',
    ]);

    if (!saved && lightweightApps.length > 400) {
      // Full dataset stays in memoryAppsCache; keep a bounded fallback slice on disk if storage is tiny
      safeStorageSetItem(
        localStorage,
        APPLICATIONS_STORAGE_KEY,
        JSON.stringify(lightweightApps.slice(0, 400)),
        [ADMIN_APPS_CACHE_KEY, 'mahasangh_dynamic_leadership_v1', 'rk2026_officials_cache_v1']
      );
    }
  } catch (err) {
    console.warn('safeCacheApplications notice:', err);
  }
}

// -------------------------------------------------------------
// NEWS
// -------------------------------------------------------------
export function parseNewsDateMs(rawValue: unknown): number {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) return rawValue;
  if (typeof rawValue === 'string') {
    const parsed = Date.parse(rawValue);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

export function sortNewsDescending(list: NewsItem[]): NewsItem[] {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    const aTime = parseNewsDateMs(a.createdAt || a.date);
    const bTime = parseNewsDateMs(b.createdAt || b.date);
    return bTime - aTime;
  });
}

const SHORT_SESSION_TTL_MS = 3 * 60 * 1000; // 3 minutes client TTL for instant tab switching

let newsInFlight: Promise<NewsItem[]> | null = null;
let newsLastFetchedAt = 0;

export async function fetchNewsCached(forceRefresh = false): Promise<NewsItem[]> {
  if (!forceRefresh && newsLastFetchedAt > 0 && Date.now() - newsLastFetchedAt < SHORT_SESSION_TTL_MS) {
    const cached = safeStorageGet(NEWS_CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return sortNewsDescending(parsed);
      } catch {}
    }
  }
  if (!forceRefresh && newsInFlight) {
    return newsInFlight;
  }

  const runFetch = (async (): Promise<NewsItem[]> => {
    if (await isSqlBackendActive()) {
      try {
        const res = await sqlApiRequest<{ items: NewsItem[] }>(
          `/api/db/news${forceRefresh ? '?refresh=1' : ''}`
        );
        if (Array.isArray(res?.items)) {
          const sorted = sortNewsDescending(res.items);
          newsLastFetchedAt = Date.now();
          safeStorageSet(NEWS_CACHE_KEY, JSON.stringify(sorted));
          return sorted;
        }
      } catch (e) {
        console.warn('SQL news fetch failed, falling back to local:', e);
      }
    }

    newsLastFetchedAt = Date.now();
    const cached = safeStorageGet(NEWS_CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return sortNewsDescending(parsed);
        }
      } catch {}
    }
    return sortNewsDescending(INITIAL_NEWS);
  })().finally(() => {
    newsInFlight = null;
  });

  if (!forceRefresh) {
    newsInFlight = runFetch;
  }
  return runFetch;
}

export async function saveNewsToFirestore(news: NewsItem): Promise<void> {
  const item: NewsItem = {
    ...news,
    id: news.id || `news_${Date.now()}`,
    createdAt: news.createdAt || new Date().toISOString(),
  };

  if (await isSqlBackendActive()) {
    await sqlApiRequest('/api/db/news', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  const current = await fetchNewsCached(false);
  const updated = sortNewsDescending([item, ...current.filter((n) => n.id !== item.id)]);
  newsLastFetchedAt = Date.now();
  safeStorageSet(NEWS_CACHE_KEY, JSON.stringify(updated));
}

export async function deleteNewsFromFirestore(newsId: string): Promise<void> {
  if (await isSqlBackendActive()) {
    await sqlApiRequest(`/api/db/news/${encodeURIComponent(newsId)}`, {
      method: 'DELETE',
    });
  }

  const current = await fetchNewsCached(false);
  const updated = current.filter((n) => n.id !== newsId);
  newsLastFetchedAt = Date.now();
  safeStorageSet(NEWS_CACHE_KEY, JSON.stringify(updated));
}

// -------------------------------------------------------------
// LATEST BANNERS
// -------------------------------------------------------------
export function sortLatestBannersDescending(list: LatestBannerItem[]): LatestBannerItem[] {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    const aOrder = (a as any).orderIndex !== undefined ? (a as any).orderIndex : 999;
    const bOrder = (b as any).orderIndex !== undefined ? (b as any).orderIndex : 999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime();
  });
}

export function updateLatestBannersCache(list: LatestBannerItem[]): void {
  safeStorageSet(BANNER_CACHE_KEY, JSON.stringify(list));
}

let bannersInFlight: Promise<LatestBannerItem[]> | null = null;
let bannersLastFetchedAt = 0;

export async function fetchLatestBannersCached(forceRefresh = false): Promise<LatestBannerItem[]> {
  if (!forceRefresh && bannersLastFetchedAt > 0 && Date.now() - bannersLastFetchedAt < SHORT_SESSION_TTL_MS) {
    const cached = safeStorageGet(BANNER_CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return sortLatestBannersDescending(parsed);
      } catch {}
    }
  }
  if (!forceRefresh && bannersInFlight) {
    return bannersInFlight;
  }

  const runFetch = (async (): Promise<LatestBannerItem[]> => {
    if (await isSqlBackendActive()) {
      try {
        const res = await sqlApiRequest<{ items: LatestBannerItem[] }>(
          `/api/db/latest-banners${forceRefresh ? '?refresh=1' : ''}`
        );
        if (Array.isArray(res?.items)) {
          const sorted = sortLatestBannersDescending(res.items);
          bannersLastFetchedAt = Date.now();
          updateLatestBannersCache(sorted);
          return sorted;
        }
      } catch (e) {
        console.warn('SQL latest banners fetch failed, falling back to local:', e);
      }
    }

    bannersLastFetchedAt = Date.now();
    const cached = safeStorageGet(BANNER_CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return sortLatestBannersDescending(parsed);
        }
      } catch {}
    }
    return sortLatestBannersDescending(INITIAL_LATEST_BANNERS);
  })().finally(() => {
    bannersInFlight = null;
  });

  if (!forceRefresh) {
    bannersInFlight = runFetch;
  }
  return runFetch;
}

export async function saveLatestBannerToFirestore(banner: LatestBannerItem): Promise<void> {
  const item: LatestBannerItem = {
    ...banner,
    id: banner.id || `banner_${Date.now()}`,
    createdAt: banner.createdAt || new Date().toISOString(),
  };

  if (await isSqlBackendActive()) {
    await sqlApiRequest('/api/db/latest-banners', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  const current = await fetchLatestBannersCached(false);
  const updated = sortLatestBannersDescending([item, ...current.filter((b) => b.id !== item.id)]);
  bannersLastFetchedAt = Date.now();
  updateLatestBannersCache(updated);
}

export async function deleteLatestBannerFromFirestore(bannerId: string): Promise<void> {
  if (await isSqlBackendActive()) {
    await sqlApiRequest(`/api/db/latest-banners/${encodeURIComponent(bannerId)}`, {
      method: 'DELETE',
    });
  }

  const current = await fetchLatestBannersCached(false);
  const updated = current.filter((b) => b.id !== bannerId);
  bannersLastFetchedAt = Date.now();
  updateLatestBannersCache(updated);
}

// -------------------------------------------------------------
// GOV ORDERS (शासन निर्णय)
// -------------------------------------------------------------
let govOrdersInFlight: Promise<GovOrder[]> | null = null;
let govOrdersLastFetchedAt = 0;

export async function fetchGovOrders(forceRefresh = false): Promise<GovOrder[]> {
  if (!forceRefresh && govOrdersLastFetchedAt > 0 && Date.now() - govOrdersLastFetchedAt < SHORT_SESSION_TTL_MS) {
    const cached = safeStorageGet(GOV_ORDERS_CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
  }
  if (!forceRefresh && govOrdersInFlight) {
    return govOrdersInFlight;
  }

  const runFetch = (async (): Promise<GovOrder[]> => {
    if (await isSqlBackendActive()) {
      try {
        const res = await sqlApiRequest<{ items: GovOrder[] }>(
          `/api/db/gov-orders${forceRefresh ? '?refresh=1' : ''}`
        );
        if (Array.isArray(res?.items)) {
          govOrdersLastFetchedAt = Date.now();
          safeStorageSet(GOV_ORDERS_CACHE_KEY, JSON.stringify(res.items));
          return res.items;
        }
      } catch (e) {
        console.warn('SQL gov orders fetch failed, falling back to local:', e);
      }
    }

    govOrdersLastFetchedAt = Date.now();
    const cached = safeStorageGet(GOV_ORDERS_CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return INITIAL_GOV_ORDERS;
  })().finally(() => {
    govOrdersInFlight = null;
  });

  if (!forceRefresh) {
    govOrdersInFlight = runFetch;
  }
  return runFetch;
}

export async function saveGovOrderToFirestore(govOrder: GovOrder): Promise<void> {
  const item: GovOrder = {
    ...govOrder,
    id: govOrder.id || `gr_${Date.now()}`,
    createdAt: govOrder.createdAt || new Date().toISOString(),
  };

  if (await isSqlBackendActive()) {
    await sqlApiRequest('/api/db/gov-orders', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  const current = await fetchGovOrders(false);
  const updated = [item, ...current.filter((g) => g.id !== item.id)];
  govOrdersLastFetchedAt = Date.now();
  safeStorageSet(GOV_ORDERS_CACHE_KEY, JSON.stringify(updated));
}

export async function deleteGovOrderFromFirestore(id: string): Promise<void> {
  if (await isSqlBackendActive()) {
    await sqlApiRequest(`/api/db/gov-orders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  const current = await fetchGovOrders(false);
  const updated = current.filter((g) => g.id !== id);
  govOrdersLastFetchedAt = Date.now();
  safeStorageSet(GOV_ORDERS_CACHE_KEY, JSON.stringify(updated));
}

// -------------------------------------------------------------
// APPLICATIONS & MEMBERSHIP
// -------------------------------------------------------------
let memoryAppsCache: MembershipApplication[] | null = null;

function loadLocalApplications(): MembershipApplication[] {
  if (memoryAppsCache && memoryAppsCache.length > 0) return memoryAppsCache;
  const raw = safeStorageGet(APPLICATIONS_STORAGE_KEY) || safeStorageGet(ADMIN_APPS_CACHE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryAppsCache = parsed;
        return parsed;
      }
    } catch {}
  }
  memoryAppsCache = INITIAL_APPLICATIONS;
  return INITIAL_APPLICATIONS;
}

function persistLocalApplications(apps: MembershipApplication[]): void {
  memoryAppsCache = apps;
  safeCacheApplications(apps);
}

export async function fetchApplicationsForAdmin(forceRefresh = false): Promise<MembershipApplication[]> {
  if (await isSqlBackendActive()) {
    try {
      const qs = forceRefresh ? '?lite=1&refresh=1' : '?lite=1';
      const data = await sqlApiRequest<{ items: MembershipApplication[] }>(`/api/db/applications${qs}`);
      const list = Array.isArray(data?.items) ? data.items : [];
      list.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
      // Preserve any already-hydrated Base64 photos in memory for the current session
      const existingPhotoMap = new Map<string, string>();
      if (!forceRefresh && Array.isArray(memoryAppsCache)) {
        for (const item of memoryAppsCache) {
          if (item?.id && item?.photo) {
            existingPhotoMap.set(item.id, item.photo);
          }
        }
      }
      const hydratedList =
        existingPhotoMap.size > 0
          ? list.map((item) =>
              !item.photo && existingPhotoMap.has(item.id)
                ? { ...item, photo: existingPhotoMap.get(item.id)! }
                : item
            )
          : list;
      persistLocalApplications(hydratedList);
      return hydratedList;
    } catch (e) {
      console.warn('SQL fetch applications error:', e);
    }
  }

  return loadLocalApplications();
}

export async function fetchSingleApplicationForAdmin(id: string): Promise<MembershipApplication | null> {
  const cleanId = String(id || '').trim();
  if (!cleanId) return null;

  if (await isSqlBackendActive()) {
    try {
      const res = await sqlApiRequest<{ application?: MembershipApplication }>(
        `/api/db/applications/${encodeURIComponent(cleanId)}`
      );
      if (res?.application) {
        syncSingleMemberInCaches(res.application);
        return res.application;
      }
    } catch (e) {
      console.warn('SQL single application fetch notice:', e);
    }
  }

  const local = loadLocalApplications();
  return local.find((a) => a.id === cleanId) || null;
}

export async function fetchApplicationPhotosBatch(ids: string[]): Promise<Record<string, string>> {
  const cleanIds = Array.from(new Set((ids || []).map((v) => String(v || '').trim()).filter(Boolean))).slice(0, 60);
  if (cleanIds.length === 0) return {};

  if (await isSqlBackendActive()) {
    try {
      const res = await sqlApiRequest<{ photos?: Record<string, string> }>(
        '/api/db/applications/photos-batch',
        {
          method: 'POST',
          body: JSON.stringify({ ids: cleanIds }),
        }
      );
      const photos = res?.photos && typeof res.photos === 'object' ? res.photos : {};
      if (memoryAppsCache && Object.keys(photos).length > 0) {
        memoryAppsCache = memoryAppsCache.map((app) =>
          photos[app.id] && !app.photo ? { ...app, photo: photos[app.id], hasPhoto: true } : app
        );
      }
      return photos;
    } catch (e) {
      console.warn('SQL batch photo fetch notice:', e);
    }
  }

  const local = loadLocalApplications();
  const out: Record<string, string> = {};
  for (const app of local) {
    if (cleanIds.includes(app.id) && app.photo) {
      out[app.id] = app.photo;
    }
  }
  return out;
}

export async function fetchApprovedApplicationsWithPhotosByDistricts(
  districts: string[]
): Promise<MembershipApplication[]> {
  if (await isSqlBackendActive()) {
    const qs =
      districts && districts.length > 0
        ? `?withPhotos=1&districts=${encodeURIComponent(districts.join(','))}`
        : '?withPhotos=1&status=approved';
    const res = await sqlApiRequest<{ items?: MembershipApplication[] }>(`/api/db/applications${qs}`);
    if (Array.isArray(res?.items)) {
      return res.items;
    }
  }

  const local = loadLocalApplications();
  if (!districts || districts.length === 0) {
    return local.filter((a) => a.status === 'approved');
  }
  return local.filter((a) => a.status === 'approved' && districts.includes(a.district || ''));
}

export function subscribeToApplicationsForAdmin(
  callback: (apps: MembershipApplication[]) => void
): () => void {
  fetchApplicationsForAdmin().then(callback).catch(() => {});
  const listener = () => {
    callback(loadLocalApplications());
  };
  window.addEventListener('mahasangh_apps_updated', listener);
  return () => window.removeEventListener('mahasangh_apps_updated', listener);
}

export async function saveApplicationToFirestore(app: MembershipApplication): Promise<void> {
  const cleaned: MembershipApplication = {
    ...app,
    id: app.id || `app_${Date.now()}`,
    createdAt: app.createdAt || new Date().toISOString(),
  };

  if (await isSqlBackendActive()) {
    await sqlApiRequest('/api/db/applications', {
      method: 'POST',
      body: JSON.stringify(cleaned),
    });
    syncSingleMemberInCaches(cleaned);
    window.dispatchEvent(new Event('mahasangh_apps_updated'));
    return;
  }

  const current = loadLocalApplications();
  const updated = [cleaned, ...current.filter((a) => a.id !== cleaned.id)];
  persistLocalApplications(updated);
  window.dispatchEvent(new Event('mahasangh_apps_updated'));
}

export async function trackSingleApplicationDetailed(
  identifier: string
): Promise<{ app: MembershipApplication | null; verifiedFromServer: boolean }> {
  const term = toEnglishDigits(identifier.trim()).toLowerCase();
  if (!term) return { app: null, verifiedFromServer: false };

  if (await isSqlBackendActive()) {
    try {
      const res = await sqlApiRequest<{ app: MembershipApplication | null; verifiedFromServer: boolean }>(
        `/api/db/applications/track?q=${encodeURIComponent(term)}`
      );
      if (res?.app && memoryAppsCache && memoryAppsCache.length > 0) {
        syncSingleMemberInCaches(res.app);
      }
      return res;
    } catch (e) {
      console.warn('SQL track query error:', e);
    }
  }

  const apps = loadLocalApplications();
  const match = apps.find((a) => {
    const p = toEnglishDigits(a.phone || '').trim().toLowerCase();
    const m = toEnglishDigits(a.memberNumber || '').trim().toLowerCase();
    const appNo = toEnglishDigits(a.applicationNumber || '').trim().toLowerCase();
    const id = toEnglishDigits(a.id || '').trim().toLowerCase();
    return p === term || m === term || appNo === term || id === term;
  });

  return { app: match || null, verifiedFromServer: true };
}

export async function trackSingleApplicationInFirestore(
  identifier: string
): Promise<MembershipApplication | null> {
  const res = await trackSingleApplicationDetailed(identifier);
  return res.app;
}

export async function findExistingApplicationInFirestore(params: {
  phone?: string;
  email?: string;
  fullName?: string;
  [key: string]: any;
}): Promise<{
  match: { app: MembershipApplication; matchedBy: 'phone' | 'email' } | null;
  verifiedFromServer: boolean;
}> {
  if (await isSqlBackendActive()) {
    try {
      return await sqlApiRequest('/api/db/applications/find-existing', {
        method: 'POST',
        body: JSON.stringify(params),
      });
    } catch {}
  }

  const apps = loadLocalApplications();
  const cleanPhone = normalizePhone10(params.phone);
  const cleanEmail = normalizeEmail(params.email);

  if (cleanPhone) {
    const byPhone = apps.find((a) => normalizePhone10(a.phone) === cleanPhone);
    if (byPhone) return { match: { app: byPhone, matchedBy: 'phone' }, verifiedFromServer: true };
  }

  if (cleanEmail && !isSyntheticMahasanghEmail(cleanEmail)) {
    const byEmail = apps.find((a) => normalizeEmail(a.email) === cleanEmail);
    if (byEmail) return { match: { app: byEmail, matchedBy: 'email' }, verifiedFromServer: true };
  }

  return { match: null, verifiedFromServer: true };
}

export async function updateMemberInFirestore(member: MembershipApplication): Promise<void> {
  approvedMembersCache = null;
  approvedMembersLastFetchedAt = 0;
  registeredCountCache = null;

  if (await isSqlBackendActive()) {
    const res = await sqlApiRequest<{ status?: string; application?: MembershipApplication }>(
      `/api/db/applications/${encodeURIComponent(member.id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(member),
      }
    );
    const savedMember = res?.application ? res.application : member;
    syncSingleMemberInCaches(savedMember);
    window.dispatchEvent(new Event('mahasangh_apps_updated'));
    return;
  }

  const current = loadLocalApplications();
  const exists = current.some((a) => a.id === member.id);
  const updated = exists
    ? current.map((a) => (a.id === member.id ? { ...a, ...member } : a))
    : [member, ...current];
  persistLocalApplications(updated);
  window.dispatchEvent(new Event('mahasangh_apps_updated'));
}

export async function approveApplicationInFirestore(
  appId: string,
  memberNumber: string,
  paymentId?: string,
  approvedBy?: string
): Promise<void> {
  approvedMembersCache = null;
  approvedMembersLastFetchedAt = 0;
  registeredCountCache = null;
  if (await isSqlBackendActive()) {
    const res = await sqlApiRequest<{ application?: MembershipApplication }>(
      '/api/db/applications/approve-atomic',
      {
        method: 'POST',
        body: JSON.stringify({
          appId,
          applicationId: appId,
          approvedBy: approvedBy || 'Admin',
          extraUpdates: {
            memberNumber,
            ...(paymentId ? { paymentRef: paymentId, razorpayPaymentId: paymentId } : {}),
            paymentConfirmed: true,
          },
        }),
      }
    );
    if (res?.application) {
      syncSingleMemberInCaches(res.application);
      window.dispatchEvent(new Event('mahasangh_apps_updated'));
    }
    return;
  }

  const current = loadLocalApplications();
  const updated = current.map((a) =>
    a.id === appId
      ? {
          ...a,
          status: 'approved' as const,
          memberNumber,
          paymentConfirmed: true,
          razorpayPaymentId: paymentId || a.razorpayPaymentId,
          approvedBy: approvedBy || 'Admin',
          approvedAt: new Date().toISOString(),
        }
      : a
  );
  persistLocalApplications(updated);
  window.dispatchEvent(new Event('mahasangh_apps_updated'));
}

export async function rejectApplicationInFirestore(
  appId: string,
  rejectReason?: string,
  rejectedBy?: string
): Promise<void> {
  approvedMembersCache = null;
  approvedMembersLastFetchedAt = 0;
  registeredCountCache = null;
  const reason = rejectReason || '';
  const by = rejectedBy || 'Admin';
  if (await isSqlBackendActive()) {
    await sqlApiRequest(`/api/db/applications/${encodeURIComponent(appId)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejectedBy: by, rejectReason: reason }),
    });
    const current = loadLocalApplications();
    if (current.some((a) => a.id === appId)) {
      persistLocalApplications(
        current.map((a) =>
          a.id === appId
            ? {
                ...a,
                status: 'rejected' as const,
                rejectedBy: by,
                rejectReason: reason,
                rejectedAt: new Date().toISOString(),
              }
            : a
        )
      );
      window.dispatchEvent(new Event('mahasangh_apps_updated'));
    }
    return;
  }

  const current = loadLocalApplications();
  const updated = current.map((a) =>
    a.id === appId
      ? {
          ...a,
          status: 'rejected' as const,
          rejectedBy: by,
          rejectReason: reason,
          rejectedAt: new Date().toISOString(),
        }
      : a
  );
  persistLocalApplications(updated);
  window.dispatchEvent(new Event('mahasangh_apps_updated'));
}

export async function deleteApplicationFromFirestore(
  appId: string,
  _targetApp?: any
): Promise<{ success: boolean; deletedDocIds: string[]; removedAllForPhone?: boolean }> {
  approvedMembersLastFetchedAt = 0;
  registeredCountCache = null;
  if (await isSqlBackendActive()) {
    try {
      await sqlApiRequest(`/api/db/applications/${encodeURIComponent(appId)}`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.warn('SQL delete application failed:', e);
    }
  }

  const current = loadLocalApplications();
  const updated = current.filter((a) => a.id !== appId);
  persistLocalApplications(updated);
  window.dispatchEvent(new Event('mahasangh_apps_updated'));
  return { success: true, deletedDocIds: [appId], removedAllForPhone: false };
}

export interface MemberCounterData {
  totalApproved?: number;
  lastMemberNumber?: number;
  currentSeq?: number;
  highestFormatted?: string;
  lastUpdated?: string;
}

export async function getMemberCounter(): Promise<MemberCounterData> {
  if (await isSqlBackendActive()) {
    try {
      const res = await sqlApiRequest<{ counter: MemberCounterData }>('/api/db/member-counter');
      if (res?.counter) return res.counter;
    } catch {}
  }

  const apps = loadLocalApplications();
  const highest = extractHighestMemberSeq(apps);
  return {
    currentSeq: highest,
    highestFormatted: buildSequentialMemberNumber('MAHA', highest),
    lastMemberNumber: highest,
    totalApproved: apps.filter((a) => a.status === 'approved').length,
    lastUpdated: new Date().toISOString(),
  };
}

export async function allocateNextMemberNumber(district?: string): Promise<{ memberNumber: string; seq: number }> {
  const counter = await getMemberCounter();
  const curSeq = counter.currentSeq || counter.lastMemberNumber || DEFAULT_COUNTER_BASELINE;
  const nextSeq = curSeq + 1;
  const memberNo = buildSequentialMemberNumber(district || 'MAHA', nextSeq);
  return { memberNumber: memberNo, seq: nextSeq };
}

export async function approveApplicationAtomicInFirestore(params: {
  applicationId?: string;
  appId?: string;
  paymentId?: string;
  orderId?: string;
  approvedBy?: string;
  source?: string;
  district?: string;
  knownRecords?: any[];
  paymentProofToken?: string;
  extraUpdates?: Record<string, any>;
  [key: string]: any;
}): Promise<{
  success: boolean;
  memberNumber: string;
  application: MembershipApplication;
  message: string;
  alreadyApproved?: boolean;
}> {
  approvedMembersCache = null;
  approvedMembersLastFetchedAt = 0;
  registeredCountCache = null;
  const targetId = params.applicationId || params.appId || '';
  if (await isSqlBackendActive()) {
    const { knownRecords: _unusedKnownRecords, ...safeServerParams } = params;
    const res = await sqlApiRequest('/api/db/applications/approve-atomic', {
      method: 'POST',
      body: JSON.stringify({
        ...safeServerParams,
        appId: params.appId || targetId,
        applicationId: targetId,
      }),
    });
    if (res?.application) {
      syncSingleMemberInCaches(res.application);
      window.dispatchEvent(new Event('mahasangh_apps_updated'));
    }
    return res;
  }

  const apps = loadLocalApplications();
  const app = apps.find((a) => a.id === targetId);
  if (!app) {
    const fallbackApp: MembershipApplication = {
      id: targetId,
      applicationNumber: `APP-${Date.now()}`,
      salutation: 'श्री.',
      fullName: 'सदस्य',
      phone: '',
      email: '',
      address: '',
      district: 'महाराष्ट्र',
      education: '',
      professional: 'केंद्रप्रमुख',
      status: 'approved',
      memberNumber: buildSequentialMemberNumber('MAHA', DEFAULT_COUNTER_BASELINE + 1),
      createdAt: new Date().toISOString(),
    };
    return { success: false, memberNumber: '', application: fallbackApp, message: 'अर्ज सापडला नाही.' };
  }

  if (app.status === 'approved' && app.memberNumber) {
    return {
      success: true,
      memberNumber: app.memberNumber,
      application: app,
      message: 'हा अर्ज आधीच मंजूर झालेला आहे.',
      alreadyApproved: true,
    };
  }

  const { memberNumber } = await allocateNextMemberNumber(app.district);
  const approvedApp: MembershipApplication = {
    ...app,
    status: 'approved',
    memberNumber,
    paymentConfirmed: true,
    razorpayPaymentId: params.paymentId || app.razorpayPaymentId,
    razorpayOrderId: params.orderId || app.razorpayOrderId,
    approvedBy: params.approvedBy || 'Admin',
    approvedAt: new Date().toISOString(),
  };

  const updated = apps.map((a) => (a.id === targetId ? approvedApp : a));
  persistLocalApplications(updated);
  window.dispatchEvent(new Event('mahasangh_apps_updated'));

  return {
    success: true,
    memberNumber,
    application: approvedApp,
    message: `अर्ज यशस्वीरीत्या मंजूर! सदस्य क्रमांक: ${memberNumber}`,
  };
}

export async function syncMemberCounter(highestKnownCount: number): Promise<void> {
  if (await isSqlBackendActive()) {
    try {
      await sqlApiRequest('/api/db/member-counter/sync', {
        method: 'POST',
        body: JSON.stringify({ highestKnownCount }),
      });
    } catch {}
  }
}

const APPROVED_DIRECTORY_CACHE_KEY = 'mahasangh_approved_directory_cache_v2';
const REGISTERED_COUNT_CACHE_KEY = 'mahasangh_registered_count_cache_v1';

function compactApprovedForCache(apps: MembershipApplication[]): MembershipApplication[] {
  return apps.map((a) => ({
    id: a.id,
    applicationNumber: a.applicationNumber || '',
    salutation: a.salutation,
    fullName: a.fullName,
    phone: '',
    email: '',
    address: '',
    district: a.district,
    taluka: a.taluka,
    centerName: a.centerName,
    education: '',
    professional: a.professional,
    status: a.status || 'approved',
    memberNumber: a.memberNumber,
    approvedAt: a.approvedAt,
    createdAt: a.createdAt,
    isOfficial: a.isOfficial,
    officialPost: a.officialPost,
    officialTaluka: a.officialTaluka,
    officialDistrict: a.officialDistrict,
  }));
}

function persistCompactApprovedDirectory(items: MembershipApplication[]): void {
  try {
    if (typeof localStorage === 'undefined' || !Array.isArray(items)) return;
    const compact = compactApprovedForCache(items);
    safeStorageSetItem(localStorage, APPROVED_DIRECTORY_CACHE_KEY, JSON.stringify(compact), [
      ADMIN_APPS_CACHE_KEY,
      'mahasangh_approved_members_cache_v1',
      'mahasangh_dynamic_leadership_v1',
      'rk2026_officials_cache_v1',
    ]);
  } catch {}
}

export function getCachedApprovedMembersSync(): MembershipApplication[] | null {
  if (approvedMembersCache && approvedMembersCache.length > 0) {
    return approvedMembersCache;
  }
  const savedDir = safeStorageGet(APPROVED_DIRECTORY_CACHE_KEY);
  if (savedDir) {
    try {
      const parsed = JSON.parse(savedDir);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {}
  }
  const apps = loadLocalApplications();
  const approvedFromLocal = apps.filter((a) => a.status === 'approved');
  return approvedFromLocal.length > 0 ? approvedFromLocal : null;
}

let approvedMembersCache: MembershipApplication[] | null = null;
let approvedMembersInFlight: Promise<MembershipApplication[]> | null = null;
let approvedMembersLastFetchedAt = 0;

let registeredCountCache: number | null = null;
let registeredCountInFlight: Promise<number> | null = null;

export function hasLiveApprovedDirectoryLoaded(): boolean {
  return approvedMembersLastFetchedAt > 0;
}

export function invalidateApprovedMembersClientCache(): void {
  approvedMembersCache = null;
  approvedMembersLastFetchedAt = 0;
  registeredCountCache = null;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('mahasangh_approved_members_cache_v1');
      localStorage.removeItem(APPROVED_DIRECTORY_CACHE_KEY);
      localStorage.removeItem(REGISTERED_COUNT_CACHE_KEY);
    }
  } catch {}
}

export async function fetchApprovedMembersCached(forceRefresh = false): Promise<MembershipApplication[]> {
  if (
    !forceRefresh &&
    approvedMembersCache &&
    approvedMembersLastFetchedAt > 0 &&
    Date.now() - approvedMembersLastFetchedAt < SHORT_SESSION_TTL_MS
  ) {
    return approvedMembersCache;
  }
  if (!forceRefresh && approvedMembersInFlight) {
    return approvedMembersInFlight;
  }

  const runFetch = (async (): Promise<MembershipApplication[]> => {
    if (await isSqlBackendActive()) {
      try {
        const res = await sqlApiRequest<{ items: MembershipApplication[] }>(
          `/api/db/applications/approved-directory${forceRefresh ? '?refresh=1' : ''}`
        );
        if (Array.isArray(res?.items)) {
          approvedMembersCache = res.items;
          approvedMembersLastFetchedAt = Date.now();
          registeredCountCache = res.items.length;
          safeStorageSet(REGISTERED_COUNT_CACHE_KEY, String(res.items.length));
          persistCompactApprovedDirectory(res.items);
          return res.items;
        }
      } catch {}
    }

    const apps = await fetchApplicationsForAdmin(forceRefresh);
    const approved = apps.filter((a) => a.status === 'approved');
    approvedMembersCache = approved;
    approvedMembersLastFetchedAt = Date.now();
    registeredCountCache = approved.length;
    safeStorageSet(REGISTERED_COUNT_CACHE_KEY, String(approved.length));
    persistCompactApprovedDirectory(approved);
    return approved;
  })().finally(() => {
    approvedMembersInFlight = null;
  });

  if (!forceRefresh) {
    approvedMembersInFlight = runFetch;
  }
  return runFetch;
}

export function getCachedRegisteredMembersCountSync(): number | null {
  if (typeof registeredCountCache === 'number') return registeredCountCache;
  const cachedCount = safeStorageGet(REGISTERED_COUNT_CACHE_KEY);
  if (cachedCount !== null) {
    const parsed = Number(cachedCount);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  const savedDir = safeStorageGet(APPROVED_DIRECTORY_CACHE_KEY);
  if (savedDir) {
    try {
      const parsed = JSON.parse(savedDir);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.length;
    } catch {}
  }
  const apps = loadLocalApplications();
  const approvedCount = apps.filter((a) => a.status === 'approved').length;
  return approvedCount > 0 ? approvedCount : null;
}

export async function getRegisteredMembersCountOncePerSession(): Promise<number> {
  if (typeof registeredCountCache === 'number') {
    return registeredCountCache;
  }
  if (registeredCountInFlight) {
    return registeredCountInFlight;
  }

  registeredCountInFlight = (async (): Promise<number> => {
    if (await isSqlBackendActive()) {
      try {
        const res = await sqlApiRequest<{ count: number }>('/api/db/applications/approved-count');
        if (typeof res?.count === 'number' && res.count >= 0) {
          registeredCountCache = res.count;
          safeStorageSet(REGISTERED_COUNT_CACHE_KEY, String(res.count));
          return res.count;
        }
      } catch {}
    }

    const apps = loadLocalApplications();
    const count = apps.filter((a) => a.status === 'approved').length;
    registeredCountCache = count;
    return count;
  })().finally(() => {
    registeredCountInFlight = null;
  });

  return registeredCountInFlight;
}

export function addApprovedMemberToCache(app: MembershipApplication): void {
  const current = loadLocalApplications();
  const exists = current.some((a) => a.id === app.id);
  const updated = exists ? current.map((a) => (a.id === app.id ? app : a)) : [app, ...current];
  persistLocalApplications(updated);
  if (approvedMembersCache) {
    if (app.status === 'approved') {
      const inApproved = approvedMembersCache.some((a) => a.id === app.id);
      approvedMembersCache = inApproved
        ? approvedMembersCache.map((a) => (a.id === app.id ? app : a))
        : [app, ...approvedMembersCache];
    } else {
      approvedMembersCache = approvedMembersCache.filter((a) => a.id !== app.id);
    }
    approvedMembersLastFetchedAt = Date.now();
    registeredCountCache = approvedMembersCache.length;
    safeStorageSet(REGISTERED_COUNT_CACHE_KEY, String(approvedMembersCache.length));
    persistCompactApprovedDirectory(approvedMembersCache);
  } else {
    approvedMembersLastFetchedAt = 0;
    registeredCountCache = null;
  }
}

export function syncSingleMemberInCaches(app: MembershipApplication): void {
  addApprovedMemberToCache(app);
}

export function removeMemberFromCaches(identifier: string): void {
  const current = loadLocalApplications();
  const term = toEnglishDigits(identifier.trim()).toLowerCase();
  const updated = current.filter(
    (a) =>
      a.id !== identifier &&
      toEnglishDigits(a.phone || '').toLowerCase() !== term &&
      toEnglishDigits(a.memberNumber || '').toLowerCase() !== term
  );
  persistLocalApplications(updated);
  if (approvedMembersCache) {
    approvedMembersCache = approvedMembersCache.filter(
      (a) =>
        a.id !== identifier &&
        toEnglishDigits(a.phone || '').toLowerCase() !== term &&
        toEnglishDigits(a.memberNumber || '').toLowerCase() !== term
    );
    registeredCountCache = approvedMembersCache.length;
    safeStorageSet(REGISTERED_COUNT_CACHE_KEY, String(approvedMembersCache.length));
    persistCompactApprovedDirectory(approvedMembersCache);
  }
}

export function purgeStaleApplicationFromCachesByContact(params: {
  phone?: string;
  email?: string;
}): void {
  const p = normalizePhone10(params.phone);
  const em = normalizeEmail(params.email);
  const current = loadLocalApplications();
  const updated = current.filter((a) => {
    if (p && normalizePhone10(a.phone) === p) return false;
    if (em && normalizeEmail(a.email) === em) return false;
    return true;
  });
  persistLocalApplications(updated);
}

// -------------------------------------------------------------
// VISITOR STATS
// -------------------------------------------------------------
export interface VisitorStats {
  total: number;
  today: number;
  lastDate?: string;
  lastUpdated?: string;
}

const VISITOR_STORAGE_KEY = 'mhs_real_visit_count_v6';

export function getTodayISTString(now: Date = new Date()): string {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  return istDate.toISOString().slice(0, 10);
}

export function getMsUntilNextISTMidnight(now: Date = new Date()): number {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  const midnight = new Date(istDate);
  midnight.setUTCHours(24, 0, 0, 0);
  // Add a 500ms buffer past 00:00:00 IST so date rollover has definitely occurred
  return Math.max(1000, midnight.getTime() - istDate.getTime() + 500);
}

let visitorStatsInFlight: Promise<VisitorStats> | null = null;
let visitorStatsInFlightDate = '';

export async function getVisitorCountsOncePerSession(): Promise<VisitorStats> {
  const today = getTodayISTString();

  if (visitorStatsInFlight && visitorStatsInFlightDate === today) {
    return visitorStatsInFlight;
  }

  visitorStatsInFlightDate = today;
  visitorStatsInFlight = (async (): Promise<VisitorStats> => {
    let cachedTotal = 5155;
    let cachedToday = 0;
    let cachedDate = '';

    const rawStored = safeStorageGet(VISITOR_STORAGE_KEY);
    if (rawStored) {
      try {
        const p = JSON.parse(rawStored);
        if (p && typeof p.total === 'number' && Number.isFinite(p.total)) {
          cachedTotal = Math.max(p.total, 5155);
          cachedToday = typeof p.today === 'number' && Number.isFinite(p.today) ? Math.max(p.today, 0) : 0;
          cachedDate = typeof p.date === 'string' ? p.date : (typeof p.lastDate === 'string' ? p.lastDate : '');
        }
      } catch {}
    }

    // Remove legacy unused key if present
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('mahasangh_visitor_stats_v1');
      }
    } catch {}

    const shouldIncrementVisit = cachedDate !== today;

    if (await isSqlBackendActive()) {
      try {
        const res = await sqlApiRequest<{ today: number; total: number }>('/api/db/site-stats/visit', {
          method: 'POST',
          body: JSON.stringify({ increment: shouldIncrementVisit }),
        });
        if (res && typeof res.total === 'number' && typeof res.today === 'number') {
          const syncedStats: VisitorStats = {
            total: res.total,
            today: Math.max(res.today, 1),
            lastDate: today,
            lastUpdated: new Date().toISOString(),
          };
          safeStorageSet(
            VISITOR_STORAGE_KEY,
            JSON.stringify({
              total: syncedStats.total,
              today: syncedStats.today,
              date: today,
              lastUpdated: syncedStats.lastUpdated,
            })
          );
          return syncedStats;
        }
      } catch (err) {
        console.warn('SQL visitor stats fetch failed, falling back to local:', err);
      }
    }

    const next = computeNextVisitorStats({
      currentTotal: cachedTotal,
      currentToday: cachedToday,
      lastDate: cachedDate,
      todayDateStr: today,
      incrementVisit: shouldIncrementVisit,
      minBaseline: 5155,
    });

    const localStats: VisitorStats = {
      total: next.total,
      today: Math.max(next.today, 1),
      lastDate: today,
      lastUpdated: new Date().toISOString(),
    };

    safeStorageSet(
      VISITOR_STORAGE_KEY,
      JSON.stringify({
        total: localStats.total,
        today: localStats.today,
        date: today,
        lastUpdated: localStats.lastUpdated,
      })
    );

    return localStats;
  })().finally(() => {
    visitorStatsInFlight = null;
  });

  return visitorStatsInFlight;
}

// -------------------------------------------------------------
// CONTACT MESSAGES
// -------------------------------------------------------------
export interface ContactMessage {
  id: string;
  name: string;
  email?: string;
  phone: string;
  district?: string;
  subject?: string;
  message: string;
  photo?: string;
  createdAt: string;
  read?: boolean;
  isRead?: boolean;
}

export async function saveContactToFirestore(contact: ContactMessage): Promise<void> {
  const item: ContactMessage = {
    ...contact,
    id: contact.id || `contact_${Date.now()}`,
    createdAt: contact.createdAt || new Date().toISOString(),
  };

  if (await isSqlBackendActive()) {
    try {
      await sqlApiRequest('/api/db/contacts', {
        method: 'POST',
        body: JSON.stringify(item),
      });
      return;
    } catch {}
  }

  const raw = safeStorageGet(CONTACTS_STORAGE_KEY);
  const list: ContactMessage[] = raw ? JSON.parse(raw) : [];
  safeStorageSet(CONTACTS_STORAGE_KEY, JSON.stringify([item, ...list]));
}

export async function fetchContactsForAdmin(): Promise<ContactMessage[]> {
  if (await isSqlBackendActive()) {
    try {
      const res = await sqlApiRequest<{ items: ContactMessage[] }>('/api/db/contacts');
      if (Array.isArray(res?.items)) return res.items;
    } catch {}
  }

  const raw = safeStorageGet(CONTACTS_STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function updateContactReadStatusInFirestore(
  id: string,
  isRead: boolean
): Promise<void> {
  if (await isSqlBackendActive()) {
    await sqlApiRequest(`/api/db/contacts/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
      body: JSON.stringify({ isRead }),
    });
  }

  const raw = safeStorageGet(CONTACTS_STORAGE_KEY);
  if (raw) {
    try {
      const list: ContactMessage[] = JSON.parse(raw);
      safeStorageSet(
        CONTACTS_STORAGE_KEY,
        JSON.stringify(list.map((c) => (c.id === id ? { ...c, isRead, read: isRead } : c)))
      );
    } catch {}
  }
}

export async function markAllContactsReadInFirestore(): Promise<void> {
  if (await isSqlBackendActive()) {
    await sqlApiRequest('/api/db/contacts/mark-all-read', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  const raw = safeStorageGet(CONTACTS_STORAGE_KEY);
  if (raw) {
    try {
      const list: ContactMessage[] = JSON.parse(raw);
      safeStorageSet(
        CONTACTS_STORAGE_KEY,
        JSON.stringify(list.map((c) => ({ ...c, isRead: true, read: true })))
      );
    } catch {}
  }
}

export async function deleteContactMessageFromFirestore(id: string): Promise<void> {
  if (await isSqlBackendActive()) {
    try {
      await sqlApiRequest(`/api/db/contacts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      return;
    } catch {}
  }

  const raw = safeStorageGet(CONTACTS_STORAGE_KEY);
  if (raw) {
    const list: ContactMessage[] = JSON.parse(raw);
    safeStorageSet(CONTACTS_STORAGE_KEY, JSON.stringify(list.filter((c) => c.id !== id)));
  }
}

// -------------------------------------------------------------
// ADMIN CREDENTIALS & SUB-ADMINS
// -------------------------------------------------------------
export async function getAdminCredentials(): Promise<{ email: string; password: string }> {
  if (await isSqlBackendActive()) {
    try {
      const res = await sqlApiRequest<{ email: string; password: string }>('/api/db/admin-auth');
      if (res?.password) {
        safeStorageSet(ADMIN_PWD_CACHE_KEY, res.password);
        safeStorageSet(ADMIN_EMAIL_CACHE_KEY, res.email || DEFAULT_ADMIN_EMAIL);
        return { email: res.email || DEFAULT_ADMIN_EMAIL, password: res.password };
      }
    } catch {}
  }

  const pwd = safeStorageGet(ADMIN_PWD_CACHE_KEY) || 'Padmakar@2027';
  const em = safeStorageGet(ADMIN_EMAIL_CACHE_KEY) || DEFAULT_ADMIN_EMAIL;
  return { email: em, password: pwd };
}

export async function updateAdminCredentials(newPassword: string, newEmail?: string): Promise<void> {
  if (await isSqlBackendActive()) {
    await sqlApiRequest('/api/db/admin-auth', {
      method: 'POST',
      body: JSON.stringify({ password: newPassword, email: newEmail }),
    });
  }

  safeStorageSet(ADMIN_PWD_CACHE_KEY, newPassword);
  if (newEmail) safeStorageSet(ADMIN_EMAIL_CACHE_KEY, newEmail);
}

export interface AdminPermissions {
  approveMembers: boolean;
  editMembers: boolean;
  manageLeadership: boolean;
  manageNews: boolean;
  manageGovOrders: boolean;
  manageLatestBanners: boolean;
  viewIdCardPreview: boolean;
  manageContactMessages: boolean;
  manageAdmins: boolean;
  manageCloudinary: boolean;
  manageRazorpay?: boolean;
}

export interface AdminUser {
  id: string;
  name?: string;
  email: string;
  role?: string;
  password?: string;
  isFirstLogin?: boolean;
  isSuperAdmin?: boolean;
  hasPassword?: boolean;
  permissions: AdminPermissions;
  createdAt: string;
  lastLoginAt?: string;
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  if (await isSqlBackendActive()) {
    try {
      const res = await sqlApiRequest<{ items: AdminUser[] }>('/api/db/sub-admins');
      if (Array.isArray(res?.items)) return res.items;
    } catch {}
  }

  const raw = safeStorageGet(SUB_ADMINS_STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveAdminUser(admin: AdminUser): Promise<void> {
  if (await isSqlBackendActive()) {
    await sqlApiRequest('/api/db/sub-admins', {
      method: 'POST',
      body: JSON.stringify(admin),
    });
    return;
  }

  const list = await fetchAdminUsers();
  const updated = [admin, ...list.filter((a) => a.id !== admin.id)];
  safeStorageSet(SUB_ADMINS_STORAGE_KEY, JSON.stringify(updated));
}

export async function deleteAdminUser(adminId: string): Promise<void> {
  if (await isSqlBackendActive()) {
    await sqlApiRequest(`/api/db/sub-admins/${encodeURIComponent(adminId)}`, {
      method: 'DELETE',
    });
    return;
  }

  const list = await fetchAdminUsers();
  safeStorageSet(SUB_ADMINS_STORAGE_KEY, JSON.stringify(list.filter((a) => a.id !== adminId)));
}

export async function setAdminUserPassword(email: string, newPassword: string): Promise<boolean> {
  if (await isSqlBackendActive()) {
    try {
      await sqlApiRequest('/api/db/sub-admins/change-password', {
        method: 'POST',
        body: JSON.stringify({ email, newPassword }),
      });
      return true;
    } catch {}
  }

  const list = await fetchAdminUsers();
  const match = list.find((a) => a.email.toLowerCase() === email.toLowerCase());
  if (match) {
    match.password = newPassword;
    match.isFirstLogin = false;
    safeStorageSet(SUB_ADMINS_STORAGE_KEY, JSON.stringify(list));
    return true;
  }
  return false;
}

export async function resetAdminUserToFirstLogin(adminId: string): Promise<boolean> {
  const list = await fetchAdminUsers();
  const match = list.find((a) => a.id === adminId);
  if (match) {
    match.isFirstLogin = true;
    await saveAdminUser(match);
    return true;
  }
  return false;
}

export async function resequenceAllApprovedMembersInFirestore(): Promise<{ count: number; message: string }> {
  if (await isSqlBackendActive()) {
    return await sqlApiRequest('/api/db/applications/resequence', { method: 'POST' });
  }

  const apps = loadLocalApplications();
  const approved = apps.filter((a) => a.status === 'approved');
  approved.sort((a, b) => new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime());

  let seq = DEFAULT_COUNTER_BASELINE;
  const resequenced = approved.map((app) => {
    seq += 1;
    return { ...app, memberNumber: buildSequentialMemberNumber(app.district || 'MAHA', seq) };
  });

  const other = apps.filter((a) => a.status !== 'approved');
  persistLocalApplications([...resequenced, ...other]);
  return { count: resequenced.length, message: `सर्व ${resequenced.length} सदस्य क्रमांक यशस्वीरीत्या पुन्हा अनुक्रमित केले.` };
}

export async function resetMemberCounterToActualHighest(): Promise<{ highestSeq: number; message: string }> {
  if (await isSqlBackendActive()) {
    return await sqlApiRequest<{ highestSeq: number; message: string }>(
      '/api/db/applications/reset-counter',
      { method: 'POST' }
    );
  }

  const apps = loadLocalApplications();
  const highest = extractHighestMemberSeq(apps);
  return { highestSeq: highest, message: `सदस्य काऊंटर मूळ सर्वोच्च क्रमांकावर (${highest}) रिसेट केला.` };
}

export async function purgeDeletedAndGhostApplicationsInFirestore(): Promise<{
  purgedCount: number;
  message: string;
}> {
  approvedMembersCache = null;
  approvedMembersLastFetchedAt = 0;
  registeredCountCache = null;

  if (await isSqlBackendActive()) {
    const res = await sqlApiRequest<{ totalDeleted?: number; message?: string }>(
      '/api/db/applications/purge-ghosts',
      { method: 'POST' }
    );
    memoryAppsCache = null;
    window.dispatchEvent(new Event('mahasangh_apps_updated'));
    return {
      purgedCount: Number(res?.totalDeleted || 0),
      message: res?.message || 'डेटाबेस स्वच्छता पूर्ण झाली.',
    };
  }

  const current = loadLocalApplications();
  const docs = current.map((a) => ({ ...a, docId: a.id }));
  const classification = classifyGhostApplicationsToPurge(docs);
  const deleteIds = new Set(classification.toDelete.map((d) => d.docId));
  if (deleteIds.size > 0) {
    persistLocalApplications(current.filter((a) => !deleteIds.has(a.id)));
    window.dispatchEvent(new Event('mahasangh_apps_updated'));
  }
  return {
    purgedCount: deleteIds.size,
    message:
      deleteIds.size > 0
        ? `✓ स्वच्छता पूर्ण! एकूण ${deleteIds.size} नाकारलेले/दुबार/अपूर्ण अर्ज काढले गेले.`
        : 'सर्व अर्ज व्यवस्थित आहेत.',
  };
}

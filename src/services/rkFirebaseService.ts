/**
 * Mahasangh Leadership, Officials & Master Studio Posts Service
 *
 * - Production (mahasangh.in): HostKarle MySQL (/api/db/rk/*)
 * - AI Studio Preview / Localhost: In-Memory Mock + LocalStorage fallback
 * - Uses in-flight deduplication and short TTL caching for instant navigation
 */

import { OfficialMember, AppointedPostItem, DEFAULT_APPOINTED_POSTS, SUPER_ADMIN_PASSWORD } from '../data/rkMaharashtraData';
import { Leader, DEFAULT_AUTHORITATIVE_LEADERS } from '../data/mahasanghData';
import { toEnglishDigits } from '../utils/formatters';
import { isSqlBackendActive, sqlApiRequest, getAuthHeaders } from '../api/sqlBridge';

import {
  CACHE_KEY_OFFICIALS,
  CACHE_KEY_OFFICIALS_TIMESTAMP,
  CACHE_KEY_POSTS,
  LEGACY_CACHE_KEY_POSTS,
  CACHE_KEY_POSTS_TIMESTAMP,
  POSTS_BROADCAST_CHANNEL,
  CACHE_KEY_DIST_PASSWORDS,
  CACHE_KEY_DIST_PASSWORDS_TS,
  CACHE_KEY_PRESIDENT_PASS,
  getPostsFromStorageSync,
  stripHeavyPhotosForCache,
  safeStorageSetItem,
} from '../utils/officialsCache';

const CACHE_KEY_LEADERSHIP = 'mahasangh_dynamic_leadership_v1';
const CACHE_KEY_LEADERSHIP_VER = 'mahasangh_leadership_ver_v1';
const CACHE_KEY_LEADERSHIP_TS = 'mahasangh_leadership_ts_v1';
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes cache TTL

let officialsMemoryCache: OfficialMember[] | null = null;
let officialsInFlight: Promise<OfficialMember[]> | null = null;
let officialsLastFetchedAt = 0;
let postsInFlight: Promise<AppointedPostItem[]> | null = null;
let postsLastFetchedAt = 0;
let leadersMemoryCache: Leader[] | null = null;
let leadersInFlight: Promise<Leader[]> | null = null;
let leadersLastFetchedAt = 0;
const SHORT_RK_TTL_MS = 90 * 1000;

function safeRkStorageSet(key: string, val: string): void {
  const store = typeof localStorage !== 'undefined' ? localStorage : null;
  safeStorageSetItem(store, key, val);
}

function safeCacheOfficials(list: OfficialMember[]): void {
  officialsMemoryCache = list;
  const lightweight = stripHeavyPhotosForCache(list);
  safeRkStorageSet(CACHE_KEY_OFFICIALS, JSON.stringify(lightweight));
  safeRkStorageSet(CACHE_KEY_OFFICIALS_TIMESTAMP, String(officialsLastFetchedAt));
}

function safeCacheLeaders(list: Leader[], version?: string | number): void {
  leadersMemoryCache = list;
  const lightweight = stripHeavyPhotosForCache(list);
  safeRkStorageSet(CACHE_KEY_LEADERSHIP, JSON.stringify(lightweight));
  safeRkStorageSet(CACHE_KEY_LEADERSHIP_TS, String(leadersLastFetchedAt));
  if (version !== undefined && version !== null) {
    safeRkStorageSet(CACHE_KEY_LEADERSHIP_VER, String(version));
  }
}

/**
 * Fetch all officials from the HostKarle MySQL / Mock backend (/api/db/rk/officials).
 */
export async function fetchOfficials(forceRefresh = false): Promise<OfficialMember[]> {
  if (!forceRefresh && officialsLastFetchedAt > 0 && Date.now() - officialsLastFetchedAt < SHORT_RK_TTL_MS) {
    if (officialsMemoryCache) {
      return officialsMemoryCache;
    }
    try {
      const cached = localStorage.getItem(CACHE_KEY_OFFICIALS);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
  }
  if (!forceRefresh && officialsInFlight) {
    return officialsInFlight;
  }

  const runFetch = (async (): Promise<OfficialMember[]> => {
    try {
      const res = await fetch('/api/db/rk/officials', {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache'
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.items)) {
          const list: OfficialMember[] = data.items.map((item: any) => ({
            id: String(item.id),
            salutation: item.salutation || 'श्री.',
            firstName: item.firstName || item.first_name || '',
            middleName: item.middleName || item.middle_name || '',
            lastName: item.lastName || item.last_name || '',
            appointedPost: item.appointedPost || item.appointed_post || '',
            district: item.district || '',
            taluka: item.taluka || '',
            currentCadre: item.currentCadre || item.current_cadre || '',
            workingPlace: item.workingPlace || item.working_place || '',
            mobile: toEnglishDigits(item.mobile || ''),
            updatedAt: item.updatedAt || item.updated_at || new Date().toISOString(),
            photo: item.photo || '',
            appointedDate: item.appointedDate || item.appointed_date || '',
            orderNumber: item.orderNumber || item.order_number || ''
          }));

          officialsLastFetchedAt = Date.now();
          safeCacheOfficials(list);
          return list;
        }
      }
    } catch (error) {
      console.warn('Network error fetching officials from SQL, falling back to cache:', error);
    } finally {
      officialsInFlight = null;
    }

    if (officialsMemoryCache) {
      return officialsMemoryCache;
    }
    try {
      const cached = localStorage.getItem(CACHE_KEY_OFFICIALS);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  })();

  if (!forceRefresh) {
    officialsInFlight = runFetch;
  }
  return runFetch;
}

/**
 * Save / Update an official to the HostKarle MySQL database.
 */
export async function saveOfficialToRtdb(member: OfficialMember): Promise<void> {
  const memberPayload = {
    salutation: member.salutation,
    firstName: member.firstName,
    middleName: member.middleName || '',
    lastName: member.lastName,
    appointedPost: member.appointedPost,
    district: member.district,
    taluka: member.taluka || '',
    currentCadre: member.currentCadre,
    workingPlace: member.workingPlace,
    mobile: toEnglishDigits(member.mobile),
    updatedAt: new Date().toISOString(),
    photo: member.photo || '',
    appointedDate: member.appointedDate || '',
    orderNumber: member.orderNumber || ''
  };

  try {
    const res = await fetch('/api/db/rk/officials', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ ...member, ...memberPayload, id: member.id }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.message || res.statusText || 'Failed to save official');
    }
  } catch (err) {
    console.warn('Error saving official to SQL:', err);
    throw err;
  }

  // Update in-memory + safe local cache (never throws QuotaExceededError)
  officialsLastFetchedAt = Date.now();
  let baseList: OfficialMember[] = officialsMemoryCache ? [...officialsMemoryCache] : [];
  if (baseList.length === 0) {
    try {
      const cached = localStorage.getItem(CACHE_KEY_OFFICIALS);
      const parsed = cached ? JSON.parse(cached) : [];
      if (Array.isArray(parsed)) baseList = parsed;
    } catch {}
  }
  const updatedList = [member, ...baseList.filter((x) => x.id !== member.id)];
  safeCacheOfficials(updatedList);
}

/**
 * Delete an official from the HostKarle MySQL database.
 */
export async function deleteOfficialFromRtdb(id: string): Promise<void> {
  try {
    const res = await fetch(`/api/db/rk/officials/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.message || res.statusText || 'Failed to delete official');
    }
  } catch (err) {
    console.warn('Error deleting official from SQL:', err);
    throw err;
  }

  // Update in-memory + safe local cache
  officialsLastFetchedAt = Date.now();
  let baseList: OfficialMember[] = officialsMemoryCache ? [...officialsMemoryCache] : [];
  if (baseList.length === 0) {
    try {
      const cached = localStorage.getItem(CACHE_KEY_OFFICIALS);
      const parsed = cached ? JSON.parse(cached) : [];
      if (Array.isArray(parsed)) baseList = parsed;
    } catch {}
  }
  if (baseList.length > 0) {
    safeCacheOfficials(baseList.filter((x) => x.id !== id));
  }
}

/**
 * Fetch district passwords map from HostKarle MySQL.
 */
export async function fetchDistrictPasswords(forceRefresh = false): Promise<Record<string, string>> {
  try {
    const res = await fetch(`/api/db/rk/district-passwords?_t=${Date.now()}`, {
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        ...getAuthHeaders(),
      }
    });
    if (res.ok) {
      const sqlRes = await res.json();
      const result = sqlRes?.map || {};
      safeRkStorageSet(CACHE_KEY_DIST_PASSWORDS, JSON.stringify(result));
      safeRkStorageSet(CACHE_KEY_DIST_PASSWORDS_TS, String(Date.now()));
      return result;
    }
  } catch (error) {
    console.warn('Error fetching district passwords from SQL, falling back to cache:', error);
  }

  const cached = localStorage.getItem(CACHE_KEY_DIST_PASSWORDS);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {}
  }
  return {};
}

/**
 * Update district password in HostKarle MySQL.
 */
export async function updateDistrictPasswordInRtdb(district: string, newPass: string): Promise<void> {
  try {
    const res = await fetch('/api/db/rk/district-passwords', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ district, password: newPass }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.message || res.statusText || 'Failed to save district password');
    }
  } catch (err) {
    console.warn('Error saving district password to SQL:', err);
    throw err;
  }

  try {
    const cached = localStorage.getItem(CACHE_KEY_DIST_PASSWORDS);
    const map = cached ? JSON.parse(cached) : {};
    map[district] = newPass === 'AD2026' ? 'AD2026' : '__CUSTOM__';
    safeRkStorageSet(CACHE_KEY_DIST_PASSWORDS, JSON.stringify(map));
    safeRkStorageSet(CACHE_KEY_DIST_PASSWORDS_TS, String(Date.now()));
  } catch {}
}

let postsSaveQueue: Promise<void> = Promise.resolve();

export function broadcastPostsUpdated(posts: AppointedPostItem[]): void {
  postsLastFetchedAt = Date.now();
  try {
    if (typeof localStorage !== 'undefined') {
      const json = JSON.stringify(posts);
      safeRkStorageSet(CACHE_KEY_POSTS, json);
      safeRkStorageSet(LEGACY_CACHE_KEY_POSTS, json);
      safeRkStorageSet(CACHE_KEY_POSTS_TIMESTAMP, String(postsLastFetchedAt));
    }
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mahasangh_posts_updated', { detail: posts }));
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel(POSTS_BROADCAST_CHANNEL);
        bc.postMessage({ type: 'POSTS_UPDATED', posts, updatedAt: postsLastFetchedAt });
        bc.close();
      } catch {}
    }
  }
}

/**
 * Fetch dynamic appointed posts from HostKarle MySQL (or local cache / mock store).
 * Preserves the exact saved list and order without re-appending deleted defaults.
 */
export async function fetchAppointedPosts(forceRefresh = false): Promise<AppointedPostItem[]> {
  if (!forceRefresh && postsLastFetchedAt > 0 && Date.now() - postsLastFetchedAt < SHORT_RK_TTL_MS) {
    return getPostsFromStorageSync();
  }
  if (!forceRefresh && postsInFlight) {
    return postsInFlight;
  }
  const runFetch = (async (): Promise<AppointedPostItem[]> => {
    try {
      const res = await fetch('/api/db/rk/appointed-posts', {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache'
        }
      });
      if (res.ok) {
        const sqlRes = await res.json();
        const data = sqlRes?.items;
        if (Array.isArray(data) && data.length > 0) {
          const normalized: AppointedPostItem[] = data
            .filter((p: any) => p && typeof p.name === 'string' && p.name.trim())
            .map((p: any) => ({
              name: String(p.name).trim(),
              isTaluka: Boolean(p.isTaluka),
              ...(p.level ? { level: p.level } : {}),
            }));
          if (normalized.length > 0) {
            postsLastFetchedAt = Date.now();
            try {
              const json = JSON.stringify(normalized);
              safeRkStorageSet(CACHE_KEY_POSTS, json);
              safeRkStorageSet(LEGACY_CACHE_KEY_POSTS, json);
              safeRkStorageSet(CACHE_KEY_POSTS_TIMESTAMP, String(postsLastFetchedAt));
            } catch {}
            return normalized;
          }
        }
      }
    } catch (error) {
      console.warn('Error fetching custom posts from SQL, using cache/defaults:', error);
    } finally {
      postsInFlight = null;
    }

    return getPostsFromStorageSync();
  })();

  if (!forceRefresh) {
    postsInFlight = runFetch;
  }
  return runFetch;
}

/**
 * Save custom appointed posts atomically to HostKarle MySQL and broadcast immediately
 * across tabs and components via localStorage + CustomEvent + BroadcastChannel.
 */
export async function saveAppointedPostsToRtdb(posts: AppointedPostItem[]): Promise<void> {
  const normalized: AppointedPostItem[] = posts
    .filter((p) => p && typeof p.name === 'string' && p.name.trim().length > 0)
    .map((p) => ({
      name: String(p.name).trim(),
      isTaluka: p.level ? p.level === 'taluka' : Boolean(p.isTaluka),
      ...(p.level ? { level: p.level } : {}),
    }));

  const task = postsSaveQueue.then(async () => {
    // Update local caches & cross-tab listeners right away so same-device tabs sync instantly
    broadcastPostsUpdated(normalized);

    const res = await fetch('/api/db/rk/appointed-posts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ items: normalized }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.message || res.statusText || 'पदे सेव्ह करताना सर्व्हर त्रुटी आली.');
    }
    const resData = await res.json().catch(() => null);
    if (Array.isArray(resData?.items) && resData.items.length > 0) {
      broadcastPostsUpdated(resData.items);
    }
  });

  // Keep queue healthy even if one call throws
  postsSaveQueue = task.catch(() => {});
  return task;
}

/**
 * Fetch the current President password status from HostKarle MySQL.
 */
export async function fetchPresidentPasswordFromFirebase(): Promise<string> {
  try {
    const res = await fetch(`/api/db/rk/president-password?_t=${Date.now()}`, {
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        ...getAuthHeaders(),
      }
    });
    if (res.ok) {
      const sqlRes = await res.json();
      if (sqlRes?.isDefault) {
        return SUPER_ADMIN_PASSWORD;
      }
      if (typeof sqlRes?.password === 'string' && sqlRes.password.trim()) {
        return sqlRes.password.trim();
      }
      return '__CUSTOM__';
    }
  } catch (error) {
    console.warn('Error fetching president password from SQL, checking cache:', error);
  }

  return SUPER_ADMIN_PASSWORD;
}

/**
 * Update the President password in HostKarle MySQL.
 */
export async function updatePresidentPasswordInFirebase(newPass: string): Promise<void> {
  const cleanPass = newPass.trim();
  try {
    const res = await fetch('/api/db/rk/president-password', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ password: cleanPass }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.message || res.statusText || 'Failed to save president password');
    }
  } catch (err) {
    console.warn('Error saving president password to SQL:', err);
    throw err;
  }
}

/**
 * Fetch dynamic leadership members from HostKarle MySQL / local cache with in-flight deduplication.
 */
export async function fetchDynamicLeaders(forceRefresh = false): Promise<Leader[]> {
  if (!forceRefresh && leadersLastFetchedAt > 0 && Date.now() - leadersLastFetchedAt < CACHE_TTL_MS) {
    if (leadersMemoryCache && leadersMemoryCache.length > 0) {
      return leadersMemoryCache;
    }
    try {
      const cached = localStorage.getItem(CACHE_KEY_LEADERSHIP);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
  }

  if (!forceRefresh && leadersInFlight) {
    return leadersInFlight;
  }

  const runFetch = (async (): Promise<Leader[]> => {
    const useSql = await isSqlBackendActive();

    if (useSql) {
      try {
        const sqlRes = await sqlApiRequest<{ items: Leader[]; version?: string | number }>('/api/db/rk/leaders');
        if (Array.isArray(sqlRes?.items) && sqlRes.items.length > 0) {
          leadersLastFetchedAt = Date.now();
          safeCacheLeaders(sqlRes.items, sqlRes.version);
          return sqlRes.items;
        }
      } catch (err) {
        console.warn('SQL dynamic leaders fetch failed:', err);
      }
    }

    if (leadersMemoryCache && leadersMemoryCache.length > 0) {
      return leadersMemoryCache;
    }

    leadersLastFetchedAt = Date.now();
    try {
      const cached = localStorage.getItem(CACHE_KEY_LEADERSHIP);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}

    return DEFAULT_AUTHORITATIVE_LEADERS;
  })().finally(() => {
    leadersInFlight = null;
  });

  if (!forceRefresh) {
    leadersInFlight = runFetch;
  }
  return runFetch;
}

/**
 * Save dynamic leaders list to SQL or LocalStorage and update version.
 */
export async function saveDynamicLeadersToFirebase(leaders: Leader[]): Promise<void> {
  const seenIds = new Set<string>();
  const cleanLeaders: Leader[] = (Array.isArray(leaders) ? leaders : []).map((l, idx) => {
    let cid = String(l.id || `leader_${idx}`).trim() || `leader_${idx}`;
    if (seenIds.has(cid)) {
      cid = `${cid}_${idx}`;
    }
    seenIds.add(cid);
    const cleaned: Leader = {
      id: cid,
      name: String(l.name || ''),
      role: String(l.role || ''),
      region: String(l.region || ''),
      education: String(l.education || ''),
      phone: String(l.phone || ''),
      photo: String(l.photo || ''),
      isKey: Boolean(l.isKey),
      ...(l.email ? { email: String(l.email) } : {}),
      ...(l.category ? { category: l.category } : {}),
    };
    return cleaned;
  });

  if (await isSqlBackendActive()) {
    try {
      const res = await sqlApiRequest<{ status: string; version?: number }>('/api/db/rk/leaders', {
        method: 'POST',
        body: JSON.stringify({ leaders: cleanLeaders }),
      });
      const newVer = res?.version || Date.now();
      leadersLastFetchedAt = Date.now();
      safeCacheLeaders(cleanLeaders, newVer);
      window.dispatchEvent(new CustomEvent('mahasangh_leadership_updated', { detail: cleanLeaders }));
      return;
    } catch (err) {
      console.warn('SQL leaders save failed, using local storage:', err);
    }
  }

  const newVer = Date.now();
  leadersLastFetchedAt = Date.now();
  safeCacheLeaders(cleanLeaders, newVer);
  window.dispatchEvent(new CustomEvent('mahasangh_leadership_updated', { detail: cleanLeaders }));
}

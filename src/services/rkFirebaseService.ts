/**
 * Secondary Firebase Realtime Database Service for RK2026 (greetings.mahasangh.in)
 * Firebase project: rk2026-207ee
 * Realtime DB: https://rk2026-207ee-default-rtdb.firebaseio.com
 *
 * Designed with a cache-first & on-demand strategy:
 * - Only queries Firebase when the user views the appointments tab or explicitly requests a refresh/save
 * - Zero background listeners when browsing other pages of the website
 * - Fully protects Firebase quota while keeping data synchronized
 */

import { OfficialMember, AppointedPostItem, DEFAULT_APPOINTED_POSTS, SUPER_ADMIN_PASSWORD } from '../data/rkMaharashtraData';
import { Leader, DEFAULT_AUTHORITATIVE_LEADERS } from '../data/mahasanghData';
import { toEnglishDigits } from '../utils/formatters';
import { isSqlBackendActive, sqlApiRequest, getAuthHeaders } from '../api/sqlBridge';

import {
  CACHE_KEY_OFFICIALS,
  CACHE_KEY_OFFICIALS_TIMESTAMP,
  CACHE_KEY_POSTS,
  CACHE_KEY_POSTS_TIMESTAMP,
  CACHE_KEY_DIST_PASSWORDS,
  CACHE_KEY_DIST_PASSWORDS_TS,
  CACHE_KEY_PRESIDENT_PASS,
} from '../utils/officialsCache';

const CACHE_KEY_LEADERSHIP = 'mahasangh_dynamic_leadership_v1';
const CACHE_KEY_LEADERSHIP_VER = 'mahasangh_leadership_ver_v1';
const CACHE_KEY_LEADERSHIP_TS = 'mahasangh_leadership_ts_v1';
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes cache TTL

let officialsInFlight: Promise<OfficialMember[]> | null = null;
let postsInFlight: Promise<AppointedPostItem[]> | null = null;

/**
 * Fetch all officials from the HostKarle MySQL backend (/api/db/rk/officials).
 * Always pulls fresh SQL data so that newly added officials (e.g. 27 Beed district officials)
 * immediately appear in President Login, Status Matrix, and Excel exports.
 */
export async function fetchOfficials(forceRefresh = false): Promise<OfficialMember[]> {
  const runFetch = (async (): Promise<OfficialMember[]> => {
    try {
      const res = await fetch(`/api/db/rk/officials?_t=${Date.now()}`, {
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

          localStorage.setItem(CACHE_KEY_OFFICIALS, JSON.stringify(list));
          localStorage.setItem(CACHE_KEY_OFFICIALS_TIMESTAMP, String(Date.now()));
          return list;
        }
      }
    } catch (error) {
      console.warn('Network error fetching officials from SQL, falling back to cache:', error);
    } finally {
      officialsInFlight = null;
    }

    // Fallback to cache if network is offline/unavailable
    const cached = localStorage.getItem(CACHE_KEY_OFFICIALS);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }
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

  // Update local cache
  const cached = localStorage.getItem(CACHE_KEY_OFFICIALS);
  let list: OfficialMember[] = cached ? JSON.parse(cached) : [];
  list = [member, ...list.filter((x) => x.id !== member.id)];
  localStorage.setItem(CACHE_KEY_OFFICIALS, JSON.stringify(list));
  localStorage.setItem(CACHE_KEY_OFFICIALS_TIMESTAMP, String(Date.now()));
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

  // Update local cache
  const cached = localStorage.getItem(CACHE_KEY_OFFICIALS);
  if (cached) {
    try {
      const list: OfficialMember[] = JSON.parse(cached);
      const updated = list.filter((x) => x.id !== id);
      localStorage.setItem(CACHE_KEY_OFFICIALS, JSON.stringify(updated));
      localStorage.setItem(CACHE_KEY_OFFICIALS_TIMESTAMP, String(Date.now()));
    } catch {}
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
      localStorage.setItem(CACHE_KEY_DIST_PASSWORDS, JSON.stringify(result));
      localStorage.setItem(CACHE_KEY_DIST_PASSWORDS_TS, String(Date.now()));
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
    localStorage.setItem(CACHE_KEY_DIST_PASSWORDS, JSON.stringify(map));
    localStorage.setItem(CACHE_KEY_DIST_PASSWORDS_TS, String(Date.now()));
  } catch {}
}

/**
 * Fetch dynamic appointed posts from HostKarle MySQL.
 */
export async function fetchAppointedPosts(forceRefresh = false): Promise<AppointedPostItem[]> {
  const runFetch = (async (): Promise<AppointedPostItem[]> => {
    try {
      const res = await fetch(`/api/db/rk/appointed-posts?_t=${Date.now()}`, {
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
          let merged = data;
          if (data.length < DEFAULT_APPOINTED_POSTS.length) {
            const existingNames = new Set(data.map((p: any) => String(p.name || '').trim()));
            merged = [...data];
            for (const d of DEFAULT_APPOINTED_POSTS) {
              if (!existingNames.has(d.name.trim())) {
                merged.push(d);
              }
            }
          }
          localStorage.setItem(CACHE_KEY_POSTS, JSON.stringify(merged));
          localStorage.setItem(CACHE_KEY_POSTS_TIMESTAMP, String(Date.now()));
          return merged;
        }
      }
    } catch (error) {
      console.warn('Error fetching custom posts from SQL, using cache/defaults:', error);
    } finally {
      postsInFlight = null;
    }

    const cached = localStorage.getItem(CACHE_KEY_POSTS);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (parsed.length < DEFAULT_APPOINTED_POSTS.length) {
            const existingNames = new Set(parsed.map((p: any) => String(p.name || '').trim()));
            const merged = [...parsed];
            for (const d of DEFAULT_APPOINTED_POSTS) {
              if (!existingNames.has(d.name.trim())) {
                merged.push(d);
              }
            }
            return merged;
          }
          return parsed;
        }
      } catch {}
    }

    return DEFAULT_APPOINTED_POSTS;
  })();

  if (!forceRefresh) {
    postsInFlight = runFetch;
  }
  return runFetch;
}

/**
 * Save custom appointed posts to HostKarle MySQL.
 */
export async function saveAppointedPostsToRtdb(posts: AppointedPostItem[]): Promise<void> {
  try {
    const res = await fetch('/api/db/rk/appointed-posts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ items: posts }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.message || res.statusText || 'Failed to save posts');
    }
  } catch (err) {
    console.warn('Error saving appointed posts to SQL:', err);
    throw err;
  }
  localStorage.setItem(CACHE_KEY_POSTS, JSON.stringify(posts));
  localStorage.setItem('mahasangh_posts_v1', JSON.stringify(posts));
  localStorage.setItem(CACHE_KEY_POSTS_TIMESTAMP, String(Date.now()));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mahasangh_posts_updated', { detail: posts }));
  }
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
 * Fetch dynamic leadership members:
 * - Always ensures that live changes made in Firebase (RTDB & Firestore) are authoritative.
 * - Prioritizes fresh remote fetch so modified names, photos, and structure are shown accurately.
 * - Falls back to Firestore /leadership if RTDB is unavailable.
 * - Only uses DEFAULT_AUTHORITATIVE_LEADERS as initial offline seed.
 */
export async function fetchDynamicLeaders(forceRefresh = false): Promise<Leader[]> {
  const useSql = await isSqlBackendActive();

  // If not forcing refresh, check local cache first (30-min TTL + tiny version check)
  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(CACHE_KEY_LEADERSHIP);
      const cachedTs = localStorage.getItem(CACHE_KEY_LEADERSHIP_TS);
      const cachedVer = localStorage.getItem(CACHE_KEY_LEADERSHIP_VER);

      if (cached) {
        const parsed = JSON.parse(cached);
        const hasLegalAdvisors = Array.isArray(parsed) && parsed.some(
          (l: Leader) => l.name && (l.name.includes('काटनेश्वर') || l.name.includes('मानव'))
        );

        if (hasLegalAdvisors && parsed.length >= 50) {
          return parsed;
        }
      }
    } catch {}
  }

  if (useSql) {
    try {
      const sqlRes = await sqlApiRequest<{ items: Leader[]; version?: string | number }>('/api/db/rk/leaders');
      if (Array.isArray(sqlRes?.items) && sqlRes.items.length > 0) {
        localStorage.setItem(CACHE_KEY_LEADERSHIP, JSON.stringify(sqlRes.items));
        localStorage.setItem(CACHE_KEY_LEADERSHIP_TS, String(Date.now()));
        if (sqlRes.version !== undefined && sqlRes.version !== null) {
          localStorage.setItem(CACHE_KEY_LEADERSHIP_VER, String(sqlRes.version));
        }
        window.dispatchEvent(new Event('mahasangh_leadership_updated'));
        return sqlRes.items;
      }
    } catch (err) {
      console.warn('SQL dynamic leaders fetch failed:', err);
    }
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

  return DEFAULT_AUTHORITATIVE_LEADERS;
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
      localStorage.setItem(CACHE_KEY_LEADERSHIP, JSON.stringify(cleanLeaders));
      localStorage.setItem(CACHE_KEY_LEADERSHIP_VER, String(newVer));
      localStorage.setItem(CACHE_KEY_LEADERSHIP_TS, String(Date.now()));
      window.dispatchEvent(new CustomEvent('mahasangh_leadership_updated', { detail: cleanLeaders }));
      return;
    } catch (err) {
      console.warn('SQL leaders save failed, using local storage:', err);
    }
  }

  const newVer = Date.now();
  localStorage.setItem(CACHE_KEY_LEADERSHIP, JSON.stringify(cleanLeaders));
  localStorage.setItem(CACHE_KEY_LEADERSHIP_VER, String(newVer));
  localStorage.setItem(CACHE_KEY_LEADERSHIP_TS, String(Date.now()));
  window.dispatchEvent(new CustomEvent('mahasangh_leadership_updated', { detail: cleanLeaders }));
}

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
import { getPreviewDb } from '../firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { isSqlBackendActive, isFirebaseAllowedInCurrentEnvironment, sqlApiRequest } from '../api/sqlBridge';
import { canUsePreviewRead, recordPreviewFirestoreReads } from '../utils/previewFirebaseGuard';

import {
  CACHE_KEY_OFFICIALS,
  CACHE_KEY_OFFICIALS_TIMESTAMP,
  CACHE_KEY_POSTS,
  CACHE_KEY_POSTS_TIMESTAMP,
  CACHE_KEY_DIST_PASSWORDS,
  CACHE_KEY_DIST_PASSWORDS_TS,
  CACHE_KEY_PRESIDENT_PASS,
} from '../utils/officialsCache';

const RTDB_BASE_URL = 'https://rk2026-207ee-default-rtdb.firebaseio.com';
const CACHE_KEY_LEADERSHIP = 'mahasangh_dynamic_leadership_v1';
const CACHE_KEY_LEADERSHIP_VER = 'mahasangh_leadership_ver_v1';
const CACHE_KEY_LEADERSHIP_TS = 'mahasangh_leadership_ts_v1';
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes smart cache TTL to minimize Preview quota usage

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...member, ...memberPayload, id: member.id }),
    });
    if (!res.ok) {
      console.warn('Failed to save official to SQL:', res.statusText);
    }
  } catch (err) {
    console.warn('Error saving official to SQL:', err);
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
    });
    if (!res.ok) {
      console.warn('Failed to delete official from SQL:', res.statusText);
    }
  } catch (err) {
    console.warn('Error deleting official from SQL:', err);
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
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache'
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
    await fetch('/api/db/rk/district-passwords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ district, password: newPass }),
    });
  } catch (err) {
    console.warn('Error saving district password to SQL:', err);
  }

  try {
    const cached = localStorage.getItem(CACHE_KEY_DIST_PASSWORDS);
    const map = cached ? JSON.parse(cached) : {};
    map[district] = newPass;
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
          localStorage.setItem(CACHE_KEY_POSTS, JSON.stringify(data));
          localStorage.setItem(CACHE_KEY_POSTS_TIMESTAMP, String(Date.now()));
          return data;
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
        return JSON.parse(cached);
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
    await fetch('/api/db/rk/appointed-posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: posts }),
    });
  } catch (err) {
    console.warn('Error saving appointed posts to SQL:', err);
  }
  localStorage.setItem(CACHE_KEY_POSTS, JSON.stringify(posts));
  localStorage.setItem(CACHE_KEY_POSTS_TIMESTAMP, String(Date.now()));
}

/**
 * Fetch the current President password from HostKarle MySQL.
 * If not set yet, defaults to SUPER_ADMIN_PASSWORD ('RK2026').
 */
export async function fetchPresidentPasswordFromFirebase(): Promise<string> {
  try {
    const res = await fetch(`/api/db/rk/president-password?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache'
      }
    });
    if (res.ok) {
      const sqlRes = await res.json();
      if (typeof sqlRes?.password === 'string' && sqlRes.password.trim()) {
        localStorage.setItem(CACHE_KEY_PRESIDENT_PASS, sqlRes.password.trim());
        return sqlRes.password.trim();
      }
    }
  } catch (error) {
    console.warn('Error fetching president password from SQL, checking cache:', error);
  }

  const cached = localStorage.getItem(CACHE_KEY_PRESIDENT_PASS);
  if (cached && cached.trim()) {
    return cached.trim();
  }

  return SUPER_ADMIN_PASSWORD;
}

/**
 * Update the President password in HostKarle MySQL.
 */
export async function updatePresidentPasswordInFirebase(newPass: string): Promise<void> {
  const cleanPass = newPass.trim();
  try {
    await fetch('/api/db/rk/president-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: cleanPass }),
    });
  } catch (err) {
    console.warn('Error saving president password to SQL:', err);
  }

  localStorage.setItem(CACHE_KEY_PRESIDENT_PASS, cleanPass);
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
          // Within 30-min TTL: ZERO network bandwidth used!
          if (cachedTs && Date.now() - Number(cachedTs) < CACHE_TTL_MS) {
            return parsed;
          }

          if (!useSql && (await isFirebaseAllowedInCurrentEnvironment()) && canUsePreviewRead('rtdb_leaders_ver', false)) {
            // Beyond 60-min TTL in AI Studio Preview mode: check tiny 13-byte leadership_version.json
            try {
              const verRes = await fetch(`${RTDB_BASE_URL}/leadership_version.json`, { cache: 'no-store' });
              recordPreviewFirestoreReads(1, 'rtdb_leaders_ver', false);
              if (verRes.ok) {
                const remoteVer = await verRes.json();
                if (remoteVer && cachedVer && String(remoteVer) === String(cachedVer)) {
                  localStorage.setItem(CACHE_KEY_LEADERSHIP_TS, String(Date.now()));
                  return parsed;
                }
                if (remoteVer) {
                  localStorage.setItem(CACHE_KEY_LEADERSHIP_VER, String(remoteVer));
                }
              }
            } catch {
              return parsed;
            }
          }
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

  if (!(await isFirebaseAllowedInCurrentEnvironment()) || !canUsePreviewRead('rtdb_leaders', false)) {
    try {
      const cached = localStorage.getItem(CACHE_KEY_LEADERSHIP);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_AUTHORITATIVE_LEADERS;
  }

  // 1. Direct fetch from Firebase RTDB (AI Studio Preview only)
  try {
    const res = await fetch(`${RTDB_BASE_URL}/dynamic_leaders.json`, { cache: 'no-store' });
    recordPreviewFirestoreReads(1, 'rtdb_leaders', false);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        localStorage.setItem(CACHE_KEY_LEADERSHIP, JSON.stringify(data));
        localStorage.setItem(CACHE_KEY_LEADERSHIP_TS, String(Date.now()));
        window.dispatchEvent(new Event('mahasangh_leadership_updated'));
        return data;
      }
    }
  } catch (err) {
    console.warn('RTDB dynamic leaders fetch failed, trying Firestore:', err);
  }

  // 2. Fallback to Firestore `/leadership` collection (AI Studio Preview only)
  try {
    const previewDb = getPreviewDb();
    if (previewDb && canUsePreviewRead('leadership', true)) {
      const snap = await getDocs(collection(previewDb, 'leadership'));
      recordPreviewFirestoreReads(snap.size || 1, 'leadership', true);
      if (!snap.empty) {
        const firestoreLeaders: Leader[] = [];
        snap.forEach((d) => {
          firestoreLeaders.push(d.data() as Leader);
        });
        if (firestoreLeaders.length > 0) {
          firestoreLeaders.sort((a: any, b: any) => (a.orderIndex ?? 999) - (b.orderIndex ?? 999));
          localStorage.setItem(CACHE_KEY_LEADERSHIP, JSON.stringify(firestoreLeaders));
          return firestoreLeaders;
        }
      }
    }
  } catch (err) {
    console.warn('Firestore leadership fallback failed:', err);
  }

  // 3. Fallback to valid localStorage cache if present
  try {
    const cached = localStorage.getItem(CACHE_KEY_LEADERSHIP);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}

  // 4. Default to authoritative live seed (with legal advisors and photos)
  return DEFAULT_AUTHORITATIVE_LEADERS;
}

/**
 * Save dynamic leaders list to SQL or Firebase and update version.
 */
export async function saveDynamicLeadersToFirebase(leaders: Leader[]): Promise<void> {
  if (await isSqlBackendActive()) {
    const res = await sqlApiRequest<{ status: string; version?: number }>('/api/db/rk/leaders', {
      method: 'POST',
      body: JSON.stringify({ leaders }),
    });
    const newVer = res?.version || Date.now();
    localStorage.setItem(CACHE_KEY_LEADERSHIP, JSON.stringify(leaders));
    localStorage.setItem(CACHE_KEY_LEADERSHIP_VER, String(newVer));
    localStorage.setItem(CACHE_KEY_LEADERSHIP_TS, String(Date.now()));
    window.dispatchEvent(new Event('mahasangh_leadership_updated'));
    return;
  }

  if (!(await isFirebaseAllowedInCurrentEnvironment())) {
    throw new Error('Firebase is disabled outside AI Studio Preview.');
  }

  const newVer = Date.now();

  // Save leaders to RTDB
  const res = await fetch(`${RTDB_BASE_URL}/dynamic_leaders.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(leaders)
  });

  if (!res.ok) {
    throw new Error(`Failed to save leaders to Firebase: ${res.statusText}`);
  }

  // Update version in RTDB
  await fetch(`${RTDB_BASE_URL}/leadership_version.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newVer)
  }).catch(() => {});

  localStorage.setItem(CACHE_KEY_LEADERSHIP, JSON.stringify(leaders));
  localStorage.setItem(CACHE_KEY_LEADERSHIP_VER, String(newVer));
  localStorage.setItem(CACHE_KEY_LEADERSHIP_TS, String(newVer));
  window.dispatchEvent(new Event('mahasangh_leadership_updated'));

  // Dual-sync to Firestore `/leadership` collection in background (AI Studio Preview only)
  try {
    const previewDb = getPreviewDb();
    if (previewDb) {
      for (let i = 0; i < leaders.length; i++) {
        const l = leaders[i];
        const id = l.id || `leader_${i}`;
        setDoc(doc(previewDb, 'leadership', id), {
          ...l,
          orderIndex: i,
          updatedAt: new Date().toISOString()
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Firestore leadership sync warning:', err);
  }
}

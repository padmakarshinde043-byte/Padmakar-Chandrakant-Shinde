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
import { db } from '../firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';

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
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes smart cache TTL

let officialsInFlight: Promise<OfficialMember[]> | null = null;
let postsInFlight: Promise<AppointedPostItem[]> | null = null;

/**
 * Fetch all officials from the secondary Firebase RTDB.
 * Uses local cache first if fresh.
 */
export async function fetchOfficials(forceRefresh = false): Promise<OfficialMember[]> {
  if (!forceRefresh) {
    const cached = localStorage.getItem(CACHE_KEY_OFFICIALS);
    const timestamp = localStorage.getItem(CACHE_KEY_OFFICIALS_TIMESTAMP);
    if (cached && timestamp && Date.now() - Number(timestamp) < CACHE_TTL_MS) {
      return JSON.parse(cached);
    }
    if (officialsInFlight) {
      return officialsInFlight;
    }
  }

  const runFetch = (async (): Promise<OfficialMember[]> => {
    try {
      const res = await fetch(`${RTDB_BASE_URL}/officials.json`);
      if (!res.ok) {
        throw new Error(`Failed to fetch officials: ${res.statusText}`);
      }
      const data = await res.json();
      if (!data) return [];

      const list: OfficialMember[] = Object.keys(data).map((key) => {
        const item = data[key];
        return {
          id: key,
          salutation: item.salutation || 'श्री.',
          firstName: item.firstName || '',
          middleName: item.middleName || '',
          lastName: item.lastName || '',
          appointedPost: item.appointedPost || '',
          district: item.district || '',
          taluka: item.taluka || '',
          currentCadre: item.currentCadre || '',
          workingPlace: item.workingPlace || '',
          mobile: toEnglishDigits(item.mobile || ''),
          updatedAt: item.updatedAt || new Date().toISOString(),
          photo: item.photo || '',
          appointedDate: item.appointedDate || '',
          orderNumber: item.orderNumber || ''
        };
      });

      // Save to cache
      localStorage.setItem(CACHE_KEY_OFFICIALS, JSON.stringify(list));
      localStorage.setItem(CACHE_KEY_OFFICIALS_TIMESTAMP, String(Date.now()));

      return list;
    } catch (error) {
      console.error('Error in fetchOfficials:', error);
      // Fallback to cache even if stale
      const cached = localStorage.getItem(CACHE_KEY_OFFICIALS);
      if (cached) return JSON.parse(cached);
      return [];
    } finally {
      officialsInFlight = null;
    }
  })();

  if (!forceRefresh) {
    officialsInFlight = runFetch;
  }
  return runFetch;
}

/**
 * Save / Update an official to the secondary Firebase RTDB.
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

  const res = await fetch(`${RTDB_BASE_URL}/officials/${member.id}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(memberPayload)
  });

  if (!res.ok) {
    throw new Error(`Failed to save official: ${res.statusText}`);
  }

  // Update local cache
  const cached = localStorage.getItem(CACHE_KEY_OFFICIALS);
  let list: OfficialMember[] = cached ? JSON.parse(cached) : [];
  list = [member, ...list.filter((x) => x.id !== member.id)];
  localStorage.setItem(CACHE_KEY_OFFICIALS, JSON.stringify(list));
}

/**
 * Delete an official from the secondary Firebase RTDB.
 */
export async function deleteOfficialFromRtdb(id: string): Promise<void> {
  const res = await fetch(`${RTDB_BASE_URL}/officials/${id}.json`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    throw new Error(`Failed to delete official: ${res.statusText}`);
  }

  // Update local cache
  const cached = localStorage.getItem(CACHE_KEY_OFFICIALS);
  if (cached) {
    const list: OfficialMember[] = JSON.parse(cached);
    const updated = list.filter((x) => x.id !== id);
    localStorage.setItem(CACHE_KEY_OFFICIALS, JSON.stringify(updated));
  }
}

/**
 * Fetch district passwords map from RTDB.
 */
export async function fetchDistrictPasswords(forceRefresh = false): Promise<Record<string, string>> {
  try {
    if (!forceRefresh) {
      const cached = localStorage.getItem(CACHE_KEY_DIST_PASSWORDS);
      const ts = localStorage.getItem(CACHE_KEY_DIST_PASSWORDS_TS);
      if (cached && ts && Date.now() - Number(ts) < CACHE_TTL_MS) {
        return JSON.parse(cached);
      }
    }

    const res = await fetch(`${RTDB_BASE_URL}/district_passwords.json`);
    if (!res.ok) return {};
    const data = await res.json();
    const result = data || {};
    localStorage.setItem(CACHE_KEY_DIST_PASSWORDS, JSON.stringify(result));
    localStorage.setItem(CACHE_KEY_DIST_PASSWORDS_TS, String(Date.now()));
    return result;
  } catch (error) {
    console.error('Error in fetchDistrictPasswords:', error);
    const cached = localStorage.getItem(CACHE_KEY_DIST_PASSWORDS);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // fallback
      }
    }
    return {};
  }
}

/**
 * Update district password in RTDB.
 */
export async function updateDistrictPasswordInRtdb(district: string, newPass: string): Promise<void> {
  const res = await fetch(`${RTDB_BASE_URL}/district_passwords/${encodeURIComponent(district)}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newPass)
  });

  if (!res.ok) {
    throw new Error(`Failed to update password for ${district}: ${res.statusText}`);
  }

  try {
    const cached = localStorage.getItem(CACHE_KEY_DIST_PASSWORDS);
    const map = cached ? JSON.parse(cached) : {};
    map[district] = newPass;
    localStorage.setItem(CACHE_KEY_DIST_PASSWORDS, JSON.stringify(map));
    localStorage.setItem(CACHE_KEY_DIST_PASSWORDS_TS, String(Date.now()));
  } catch {
    // ignore cache update error
  }
}

/**
 * Fetch dynamic appointed posts from RTDB (30-minute cached).
 */
export async function fetchAppointedPosts(forceRefresh = false): Promise<AppointedPostItem[]> {
  if (!forceRefresh) {
    const cached = localStorage.getItem(CACHE_KEY_POSTS);
    const ts = localStorage.getItem(CACHE_KEY_POSTS_TIMESTAMP);
    if (cached && ts && Date.now() - Number(ts) < CACHE_TTL_MS) {
      return JSON.parse(cached);
    }
    if (postsInFlight) {
      return postsInFlight;
    }
  }

  const runFetch = (async (): Promise<AppointedPostItem[]> => {
    try {
      const res = await fetch(`${RTDB_BASE_URL}/custom_appointed_posts_v2.json`);
      if (!res.ok) return DEFAULT_APPOINTED_POSTS;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        localStorage.setItem(CACHE_KEY_POSTS, JSON.stringify(data));
        localStorage.setItem(CACHE_KEY_POSTS_TIMESTAMP, String(Date.now()));
        return data;
      }
    } catch (error) {
      console.warn('Error fetching custom posts, using defaults:', error);
    } finally {
      postsInFlight = null;
    }

    const cached = localStorage.getItem(CACHE_KEY_POSTS);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // fallback
      }
    }

    return DEFAULT_APPOINTED_POSTS;
  })();

  if (!forceRefresh) {
    postsInFlight = runFetch;
  }
  return runFetch;
}

/**
 * Fetch the current President password from Firebase.
 * If not set yet, defaults to SUPER_ADMIN_PASSWORD ('RK2026').
 * Uses cached password if available for instant response.
 */
export async function fetchPresidentPasswordFromFirebase(): Promise<string> {
  try {
    const cached = localStorage.getItem(CACHE_KEY_PRESIDENT_PASS);
    if (cached) {
      return cached;
    }

    const res = await fetch(`${RTDB_BASE_URL}/president_password.json`);
    if (res.ok) {
      const data = await res.json();
      if (typeof data === 'string' && data.trim()) {
        localStorage.setItem(CACHE_KEY_PRESIDENT_PASS, data.trim());
        return data.trim();
      }
    }
  } catch (error) {
    console.warn('Error fetching president password from Firebase:', error);
  }

  return SUPER_ADMIN_PASSWORD;
}

/**
 * Update the President password in Firebase.
 */
export async function updatePresidentPasswordInFirebase(newPass: string): Promise<void> {
  const cleanPass = newPass.trim();
  const res = await fetch(`${RTDB_BASE_URL}/president_password.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cleanPass)
  });

  if (!res.ok) {
    throw new Error(`Failed to update president password: ${res.statusText}`);
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
  // If not forcing refresh, check local cache first (30-min TTL + tiny ~13-byte version check)
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

          // Beyond 30-min TTL: check only tiny 13-byte leadership_version.json instead of downloading entire dynamic_leaders.json
          try {
            const verRes = await fetch(`${RTDB_BASE_URL}/leadership_version.json`, { cache: 'no-store' });
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
            // If version check fails offline, return cached safely
            return parsed;
          }
        }
      }
    } catch {}
  }

  // 1. Direct fetch from Firebase RTDB (only when cache missing, version changed, or forced refresh)
  try {
    const res = await fetch(`${RTDB_BASE_URL}/dynamic_leaders.json`, { cache: 'no-store' });
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

  // 2. Fallback to Firestore `/leadership` collection
  try {
    const snap = await getDocs(collection(db, 'leadership'));
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
 * Save dynamic leaders list to Firebase and update version.
 * Saves to RTDB and dual-syncs to Firestore collection /leadership.
 */
export async function saveDynamicLeadersToFirebase(leaders: Leader[]): Promise<void> {
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

  // Dual-sync to Firestore `/leadership` collection in background
  try {
    for (let i = 0; i < leaders.length; i++) {
      const l = leaders[i];
      const id = l.id || `leader_${i}`;
      setDoc(doc(db, 'leadership', id), {
        ...l,
        orderIndex: i,
        updatedAt: new Date().toISOString()
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('Firestore leadership sync warning:', err);
  }
}

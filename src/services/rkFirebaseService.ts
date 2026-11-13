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

const RTDB_BASE_URL = 'https://rk2026-207ee-default-rtdb.firebaseio.com';
const CACHE_KEY_OFFICIALS = 'rk2026_officials_cache_v1';
const CACHE_KEY_OFFICIALS_TIMESTAMP = 'rk2026_officials_ts_v1';
const CACHE_KEY_POSTS = 'rk2026_posts_cache_v1';
const CACHE_KEY_LEADERSHIP = 'mahasangh_dynamic_leadership_v1';
const CACHE_KEY_LEADERSHIP_VER = 'mahasangh_leadership_ver_v1';
const CACHE_KEY_PRESIDENT_PASS = 'rk2026_president_password_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL

/**
 * Fetch all officials from the secondary Firebase RTDB.
 * Uses local cache first if fresh.
 */
export async function fetchOfficials(forceRefresh = false): Promise<OfficialMember[]> {
  try {
    if (!forceRefresh) {
      const cached = localStorage.getItem(CACHE_KEY_OFFICIALS);
      const timestamp = localStorage.getItem(CACHE_KEY_OFFICIALS_TIMESTAMP);
      if (cached && timestamp && Date.now() - Number(timestamp) < CACHE_TTL_MS) {
        return JSON.parse(cached);
      }
    }

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
  }
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
export async function fetchDistrictPasswords(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${RTDB_BASE_URL}/district_passwords.json`);
    if (!res.ok) return {};
    const data = await res.json();
    return data || {};
  } catch (error) {
    console.error('Error in fetchDistrictPasswords:', error);
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
}

/**
 * Fetch dynamic appointed posts from RTDB.
 */
export async function fetchAppointedPosts(): Promise<AppointedPostItem[]> {
  try {
    const res = await fetch(`${RTDB_BASE_URL}/custom_appointed_posts_v2.json`);
    if (!res.ok) return DEFAULT_APPOINTED_POSTS;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      localStorage.setItem(CACHE_KEY_POSTS, JSON.stringify(data));
      return data;
    }
  } catch (error) {
    console.warn('Error fetching custom posts, using defaults:', error);
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
  // If not forcing refresh, check if local cache already has the updated 52 leaders with legal advisors
  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(CACHE_KEY_LEADERSHIP);
      if (cached) {
        const parsed = JSON.parse(cached);
        const hasLegalAdvisors = Array.isArray(parsed) && parsed.some(
          (l: Leader) => l.name && (l.name.includes('काटनेश्वर') || l.name.includes('मानव'))
        );
        if (hasLegalAdvisors && parsed.length >= 50) {
          // Cache is complete and has the user's modifications, return it
          // while quietly verifying remote version
          fetch(`${RTDB_BASE_URL}/dynamic_leaders.json`)
            .then((r) => r.json())
            .then((data) => {
              if (Array.isArray(data) && data.length > 0) {
                localStorage.setItem(CACHE_KEY_LEADERSHIP, JSON.stringify(data));
              }
            })
            .catch(() => {});
          return parsed;
        }
      }
    } catch {}
  }

  // 1. Direct fetch from Firebase RTDB (authoritative source)
  try {
    const res = await fetch(`${RTDB_BASE_URL}/dynamic_leaders.json`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        localStorage.setItem(CACHE_KEY_LEADERSHIP, JSON.stringify(data));
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

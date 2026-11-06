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
import { Leader } from '../data/mahasanghData';
import { toEnglishDigits } from '../utils/formatters';

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
 * Fetch dynamic leadership members with Zero-Quota Smart Caching:
 * - Reads from localStorage instantly (0 network egress, 0 lag).
 * - Checks tiny version endpoint (~10 bytes) to see if an update occurred.
 * - Only downloads full data if version changed.
 */
export async function fetchDynamicLeaders(forceRefresh = false): Promise<Leader[]> {
  try {
    const cached = localStorage.getItem(CACHE_KEY_LEADERSHIP);
    const localVer = localStorage.getItem(CACHE_KEY_LEADERSHIP_VER);

    if (!forceRefresh && cached) {
      // Check remote version in background without blocking UI
      fetch(`${RTDB_BASE_URL}/leadership_version.json`)
        .then((r) => r.json())
        .then((remoteVer) => {
          if (remoteVer && String(remoteVer) !== String(localVer)) {
            // Version changed on remote, fetch fresh
            fetch(`${RTDB_BASE_URL}/dynamic_leaders.json`)
              .then((r) => r.json())
              .then((data) => {
                if (Array.isArray(data) && data.length > 0) {
                  localStorage.setItem(CACHE_KEY_LEADERSHIP, JSON.stringify(data));
                  localStorage.setItem(CACHE_KEY_LEADERSHIP_VER, String(remoteVer));
                  window.dispatchEvent(new Event('mahasangh_leadership_updated'));
                }
              })
              .catch(() => {});
          }
        })
        .catch(() => {});

      return JSON.parse(cached);
    }

    // Direct fetch
    const res = await fetch(`${RTDB_BASE_URL}/dynamic_leaders.json`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        localStorage.setItem(CACHE_KEY_LEADERSHIP, JSON.stringify(data));
        return data;
      }
    }
  } catch (error) {
    console.warn('Error fetching dynamic leaders:', error);
  }

  const cached = localStorage.getItem(CACHE_KEY_LEADERSHIP);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // fallback
    }
  }

  return [];
}

/**
 * Save dynamic leaders list to Firebase and update version.
 */
export async function saveDynamicLeadersToFirebase(leaders: Leader[]): Promise<void> {
  const newVer = Date.now();

  // Save leaders
  const res = await fetch(`${RTDB_BASE_URL}/dynamic_leaders.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(leaders)
  });

  if (!res.ok) {
    throw new Error(`Failed to save leaders to Firebase: ${res.statusText}`);
  }

  // Update version
  await fetch(`${RTDB_BASE_URL}/leadership_version.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newVer)
  }).catch(() => {});

  localStorage.setItem(CACHE_KEY_LEADERSHIP, JSON.stringify(leaders));
  localStorage.setItem(CACHE_KEY_LEADERSHIP_VER, String(newVer));
  window.dispatchEvent(new Event('mahasangh_leadership_updated'));
}

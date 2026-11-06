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

import { OfficialMember, AppointedPostItem, DEFAULT_APPOINTED_POSTS } from '../data/rkMaharashtraData';
import { toEnglishDigits } from '../utils/formatters';

const RTDB_BASE_URL = 'https://rk2026-207ee-default-rtdb.firebaseio.com';
const CACHE_KEY_OFFICIALS = 'rk2026_officials_cache_v1';
const CACHE_KEY_OFFICIALS_TIMESTAMP = 'rk2026_officials_ts_v1';
const CACHE_KEY_POSTS = 'rk2026_posts_cache_v1';
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

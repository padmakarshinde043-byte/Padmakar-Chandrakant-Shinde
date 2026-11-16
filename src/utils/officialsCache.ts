import { OfficialMember, AppointedPostItem, DEFAULT_APPOINTED_POSTS } from '../data/rkMaharashtraData';

export const CACHE_KEY_OFFICIALS = 'rk2026_officials_cache_v1';
export const CACHE_KEY_OFFICIALS_TIMESTAMP = 'rk2026_officials_ts_v1';
export const CACHE_KEY_POSTS = 'rk2026_posts_cache_v1';
export const CACHE_KEY_POSTS_TIMESTAMP = 'rk2026_posts_ts_v1';
export const CACHE_KEY_DIST_PASSWORDS = 'rk2026_dist_passwords_cache_v1';
export const CACHE_KEY_DIST_PASSWORDS_TS = 'rk2026_dist_passwords_ts_v1';
export const CACHE_KEY_PRESIDENT_PASS = 'rk2026_president_password_cache';

export interface StorageLike {
  getItem: (key: string) => string | null;
}

export function readCachedJson<T>(
  storage: StorageLike | null | undefined,
  key: string,
  fallback: T,
  validator?: (val: unknown) => val is T
): T {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (validator && !validator(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function isOfficialArray(val: unknown): val is OfficialMember[] {
  return Array.isArray(val);
}

export function isPostArray(val: unknown): val is AppointedPostItem[] {
  return Array.isArray(val) && val.length > 0;
}

export function isPasswordRecord(val: unknown): val is Record<string, string> {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

export function getOfficialsFromStorageSync(storage?: StorageLike | null): OfficialMember[] {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  return readCachedJson<OfficialMember[]>(store, CACHE_KEY_OFFICIALS, [], isOfficialArray);
}

export function getPostsFromStorageSync(storage?: StorageLike | null): AppointedPostItem[] {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  return readCachedJson<AppointedPostItem[]>(store, CACHE_KEY_POSTS, DEFAULT_APPOINTED_POSTS, isPostArray);
}

export function getDistrictPasswordsFromStorageSync(storage?: StorageLike | null): Record<string, string> {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  return readCachedJson<Record<string, string>>(store, CACHE_KEY_DIST_PASSWORDS, {}, isPasswordRecord);
}

export function getPresidentPasswordFromStorageSync(
  defaultPassword: string,
  storage?: StorageLike | null
): string {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return defaultPassword;
  try {
    const raw = store.getItem(CACHE_KEY_PRESIDENT_PASS);
    return raw && raw.trim() ? raw.trim() : defaultPassword;
  } catch {
    return defaultPassword;
  }
}

export function matchesDistrictName(memberDistrict?: string, selectedDistrict?: string): boolean {
  if (!memberDistrict || !selectedDistrict) return false;
  const md = memberDistrict.trim().toLowerCase();
  const sd = selectedDistrict.trim().toLowerCase();
  if (md === sd) return true;

  // Ahilyanagar / Ahmednagar
  if (
    (sd === 'अहिल्यानगर' && (md === 'अहमदनगर' || md.includes('ahmed'))) ||
    (sd === 'अहमदनगर' && (md === 'अहिल्यानगर' || md.includes('ahmed')))
  ) {
    return true;
  }

  // Beed / बीड / Bid
  if (
    (sd === 'बीड' && (md === 'beed' || md === 'bid' || md === 'बीड')) ||
    (sd === 'beed' && (md === 'बीड' || md === 'bid'))
  ) {
    return true;
  }

  // Chhatrapati Sambhajinagar / Aurangabad
  if (
    (sd.includes('संभाजीनगर') && (md.includes('संभाजीनगर') || md.includes('औरंगाबाद') || md.includes('aurangabad'))) ||
    (sd.includes('औरंगाबाद') && (md.includes('संभाजीनगर') || md.includes('औरंगाबाद') || md.includes('aurangabad')))
  ) {
    return true;
  }

  // Dharashiv / Osmanabad
  if (
    (sd.includes('धाराशिव') && (md.includes('धाराशिव') || md.includes('उस्मानाबाद') || md.includes('osmanabad'))) ||
    (sd.includes('उस्मानाबाद') && (md.includes('धाराशिव') || md.includes('उस्मानाबाद') || md.includes('osmanabad')))
  ) {
    return true;
  }

  return false;
}

export function filterAndSortDistrictOfficials(
  officials: OfficialMember[],
  district: string,
  postsList: Array<{ name: string; isTaluka: boolean }>
): OfficialMember[] {
  const list = officials.filter((m) => m && matchesDistrictName(m.district, district));
  const rankList =
    postsList && postsList.length > 0
      ? postsList.map((p) => p.name)
      : DEFAULT_APPOINTED_POSTS.map((p) => p.name);

  const getLevelPriority = (postName: string) => {
    if (!postName) return 3;
    const p = postName.trim();
    if (p.includes('राज्य')) return 1;
    if (p.includes('विभाग') || p.includes('विभागीय')) return 2;
    if (p.includes('तालुका')) return 4;
    return 3; // district
  };

  const getRank = (postName: string) => {
    if (!postName) return 999;
    const cleanPost = postName.trim();
    const exactIdx = rankList.findIndex((p) => p === cleanPost);
    if (exactIdx !== -1) return exactIdx;
    const partialIdx = rankList.findIndex((p) => cleanPost.includes(p) || p.includes(cleanPost));
    if (partialIdx !== -1) return partialIdx;
    return 999;
  };

  return [...list].sort((a, b) => {
    const levelA = getLevelPriority(a.appointedPost);
    const levelB = getLevelPriority(b.appointedPost);
    if (levelA !== levelB) return levelA - levelB;

    const rankA = getRank(a.appointedPost);
    const rankB = getRank(b.appointedPost);
    if (rankA !== rankB) return rankA - rankB;

    // If same post / level, newest added / updated first (newest timestamp / id first)
    const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    if (timeA !== timeB && timeA > 0 && timeB > 0) return timeB - timeA;

    const idA = parseInt(a.id) || 0;
    const idB = parseInt(b.id) || 0;
    if (idA !== idB) return idB - idA;

    const nameA = `${a.firstName} ${a.lastName}`;
    const nameB = `${b.firstName} ${b.lastName}`;
    return nameA.localeCompare(nameB, 'mr');
  });
}

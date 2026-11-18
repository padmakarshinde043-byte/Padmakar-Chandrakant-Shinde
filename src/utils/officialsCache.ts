import {
  OfficialMember,
  AppointedPostItem,
  DEFAULT_APPOINTED_POSTS,
  PostLevelType,
  getPostLevel,
} from '../data/rkMaharashtraData';

export const CACHE_KEY_OFFICIALS = 'rk2026_officials_cache_v1';
export const CACHE_KEY_OFFICIALS_TIMESTAMP = 'rk2026_officials_ts_v1';
export const CACHE_KEY_POSTS = 'rk2026_posts_cache_v1';
export const LEGACY_CACHE_KEY_POSTS = 'mahasangh_posts_v1';
export const CACHE_KEY_POSTS_TIMESTAMP = 'rk2026_posts_ts_v1';
export const POSTS_BROADCAST_CHANNEL = 'mahasangh_posts_channel';
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
  return (
    Array.isArray(val) &&
    val.length > 0 &&
    val.every((item) => Boolean(item) && typeof item === 'object' && typeof (item as any).name === 'string' && (item as any).name.trim().length > 0)
  );
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
  const primary = readCachedJson<AppointedPostItem[] | null>(store, CACHE_KEY_POSTS, null, isPostArray);
  if (primary && primary.length > 0) {
    return primary;
  }
  const legacy = readCachedJson<AppointedPostItem[] | null>(store, LEGACY_CACHE_KEY_POSTS, null, isPostArray);
  if (legacy && legacy.length > 0) {
    return legacy;
  }
  return DEFAULT_APPOINTED_POSTS;
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
  const cleanStr = (s: string) => s.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();
  const toPhonetic = (s: string) => cleanStr(s).replace(/ू/g, 'ु').replace(/ी/g, 'ि');
  const md = cleanStr(memberDistrict);
  const sd = cleanStr(selectedDistrict);
  const mp = toPhonetic(memberDistrict);
  const sp = toPhonetic(selectedDistrict);
  if (md === sd || mp === sp) return true;

  // Ahilyanagar / Ahmednagar
  if (
    (sd === 'अहिल्यानगर' && (md.includes('अहमदनगर') || md.includes('अहिल्यानगर') || md.includes('ahmed'))) ||
    (sd === 'अहमदनगर' && (md.includes('अहिल्यानगर') || md.includes('अहमदनगर') || md.includes('ahmed')))
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
    (sp.includes('संभाजिनगर') && (mp.includes('संभाजिनगर') || mp.includes('औरंगाबाद') || mp.includes('aurangabad'))) ||
    (sp.includes('औरंगाबाद') && (mp.includes('संभाजिनगर') || mp.includes('औरंगाबाद') || mp.includes('aurangabad')))
  ) {
    return true;
  }

  // Dharashiv / Osmanabad (handles धाराशिव, धाराशीव, उस्मानाबाद)
  if (
    (sp.includes('धाराशिव') && (mp.includes('धाराशिव') || mp.includes('उस्मानाबाद') || mp.includes('osmanabad'))) ||
    (sp.includes('उस्मानाबाद') && (mp.includes('धाराशिव') || mp.includes('उस्मानाबाद') || mp.includes('osmanabad')))
  ) {
    return true;
  }

  // Sindhudurg (handles सिंधुदुर्ग & सिंधुदूर्ग)
  if (sp.includes('सिंधुदुर्ग') && (mp.includes('सिंधुदुर्ग') || mp.includes('sindhudurg'))) {
    return true;
  }

  // Washim / वाशीम / वाशिम
  if (
    (sp === 'वाशिम' && (mp === 'वाशिम' || mp === 'washim')) ||
    (sp === 'washim' && mp === 'वाशिम')
  ) {
    return true;
  }

  return false;
}

export function filterAndSortDistrictOfficials(
  officials: OfficialMember[],
  district: string,
  postsList: Array<{ name: string; isTaluka: boolean; level?: PostLevelType }>
): OfficialMember[] {
  const list = officials.filter((m) => m && matchesDistrictName(m.district, district));
  const activePosts = postsList && postsList.length > 0 ? postsList : DEFAULT_APPOINTED_POSTS;
  const rankList = activePosts.map((p) => (p.name || '').trim());

  const getLevelPriority = (postName: string) => {
    if (!postName) return 3;
    const clean = postName.trim();
    const matched = activePosts.find((p) => (p.name || '').trim() === clean);
    const lvl = getPostLevel(clean, matched?.level, matched?.isTaluka);
    if (lvl === 'state') return 1;
    if (lvl === 'division') return 2;
    if (lvl === 'taluka') return 4;
    return 3; // district / mahila
  };

  const getRank = (postName: string) => {
    if (!postName) return 999;
    const cleanPost = postName.trim();
    const exactIdx = rankList.findIndex((p) => p === cleanPost);
    if (exactIdx !== -1) return exactIdx;
    const partialIdx = rankList.findIndex((p) => p && (cleanPost.includes(p) || p.includes(cleanPost)));
    if (partialIdx !== -1) return partialIdx;
    return 999;
  };

  return [...list].sort((a, b) => {
    const rankA = getRank(a.appointedPost);
    const rankB = getRank(b.appointedPost);
    if (rankA !== 999 && rankB !== 999 && rankA !== rankB) {
      return rankA - rankB;
    }

    const levelA = getLevelPriority(a.appointedPost);
    const levelB = getLevelPriority(b.appointedPost);
    if (levelA !== levelB) return levelA - levelB;
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

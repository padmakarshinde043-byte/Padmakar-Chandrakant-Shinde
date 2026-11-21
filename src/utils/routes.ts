/**
 * Clean client-side URL routing map & History API helpers.
 * Keeps browser address bar, Back/Forward navigation, document <title>,
 * and canonical link synchronized with every public and standalone page.
 */

const BASE_TITLE = 'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ';
const CANONICAL_ORIGIN = 'https://mahasangh.in';

export interface RouteMeta {
  tabId: string;
  path: string;
  title: string;
  aliases?: string[];
}

export const APP_ROUTES: RouteMeta[] = [
  {
    tabId: 'home',
    path: '/',
    title: BASE_TITLE,
    aliases: ['/home', '/index.html'],
  },
  {
    tabId: 'about',
    path: '/about',
    title: `आमच्याबद्दल — ${BASE_TITLE}`,
    aliases: ['/objectives'],
  },
  {
    tabId: 'leadership',
    path: '/leadership',
    title: `राज्य नेतृत्व — ${BASE_TITLE}`,
    aliases: ['/state-leadership'],
  },
  {
    tabId: 'district_leadership',
    path: '/district-leadership',
    title: `जिल्हा नेतृत्व — ${BASE_TITLE}`,
    aliases: ['/district_leadership'],
  },
  {
    tabId: 'appointments',
    path: '/appointments',
    title: `जिल्हा पदाधिकारी — ${BASE_TITLE}`,
    aliases: ['/office-bearers'],
  },
  {
    tabId: 'advisory',
    path: '/advisory',
    title: `राज्य सल्लागार मंडळ — ${BASE_TITLE}`,
    aliases: ['/advisory-board'],
  },
  {
    tabId: 'news',
    path: '/news',
    title: `बातम्या — ${BASE_TITLE}`,
  },
  {
    tabId: 'circulars',
    path: '/circulars',
    title: `शासन निर्णय व परिपत्रके — ${BASE_TITLE}`,
    aliases: ['/gov-orders'],
  },
  {
    tabId: 'membership',
    path: '/membership',
    title: `सदस्यत्व नोंदणी — ${BASE_TITLE}`,
  },
  {
    tabId: 'contact',
    path: '/contact',
    title: `संपर्क — ${BASE_TITLE}`,
  },
  {
    tabId: 'privacy',
    path: '/privacy-policy',
    title: `Privacy & Disclaimer Policy — ${BASE_TITLE}`,
    aliases: ['/privacy', '/disclaimer'],
  },
  {
    tabId: 'admin',
    path: '/admin',
    title: `Admin Panel — ${BASE_TITLE}`,
  },
  {
    tabId: 'center_update',
    path: '/center-update',
    title: `केंद्र अद्ययावत करा — ${BASE_TITLE}`,
    aliases: ['/kendra-update', '/center_update'],
  },
];

const ROUTE_BY_TAB = new Map<string, RouteMeta>();
const TAB_BY_PATH = new Map<string, string>();

for (const route of APP_ROUTES) {
  ROUTE_BY_TAB.set(route.tabId, route);
  TAB_BY_PATH.set(route.path, route.tabId);
  if (route.aliases) {
    for (const alias of route.aliases) {
      TAB_BY_PATH.set(alias, route.tabId);
    }
  }
}

export function normalizeTabId(tabId: string): string {
  if (tabId === 'objectives') return 'about';
  return ROUTE_BY_TAB.has(tabId) ? tabId : 'home';
}

function normalizePath(rawPath: string): string {
  const cleaned = (rawPath || '/').split('?')[0].split('#')[0].trim().toLowerCase();
  if (!cleaned || cleaned === '/') return '/';
  const withLeadingSlash = cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
  return withLeadingSlash.replace(/\/+$/, '') || '/';
}

export function resolveTabFromLocation(
  pathname?: string,
  hash?: string
): string {
  if (typeof window === 'undefined' && pathname === undefined && hash === undefined) {
    return 'home';
  }
  const rawPath = pathname !== undefined ? pathname : window.location.pathname;
  const rawHash = hash !== undefined ? hash : window.location.hash;

  // 1. Check hash route first if present (supports legacy #admin, #/admin, #center-update, 404.html fallback)
  if (rawHash && rawHash.length > 1) {
    const hashSlug = rawHash.replace(/^#\/?/, '').trim();
    if (hashSlug) {
      const normalizedHashPath = normalizePath(hashSlug);
      const fromHash = TAB_BY_PATH.get(normalizedHashPath);
      if (fromHash) return fromHash;
    }
  }

  // 2. Check clean pathname (e.g., /membership, /circulars, /district-leadership)
  const normalized = normalizePath(rawPath);
  const fromPath = TAB_BY_PATH.get(normalized);
  if (fromPath) return fromPath;

  return 'home';
}

const RELOAD_EXEMPT_TABS = new Set<string>(['admin', 'center_update']);

export function isPageReloadNavigation(): boolean {
  if (typeof window === 'undefined' || typeof performance === 'undefined') {
    return false;
  }
  try {
    if (typeof performance.getEntriesByType === 'function') {
      const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (entries && entries.length > 0) {
        return entries[0].type === 'reload';
      }
    }
    const legacyNav = (performance as unknown as { navigation?: { type?: number } }).navigation;
    if (legacyNav && typeof legacyNav.type === 'number') {
      return legacyNav.type === 1;
    }
  } catch {
    // Ignore unsupported navigation timing APIs
  }
  return false;
}

export function resolveInitialTabOnLoad(): string {
  const resolved = resolveTabFromLocation();
  if (isPageReloadNavigation() && !RELOAD_EXEMPT_TABS.has(resolved)) {
    return 'home';
  }
  return resolved;
}

export function getPathForTab(tabId: string): string {
  const normalized = normalizeTabId(tabId);
  return ROUTE_BY_TAB.get(normalized)?.path || '/';
}

export function getDocumentTitleForTab(tabId: string): string {
  const normalized = normalizeTabId(tabId);
  return ROUTE_BY_TAB.get(normalized)?.title || BASE_TITLE;
}

export function syncBrowserUrlForTab(
  tabId: string,
  mode: 'push' | 'replace' = 'push'
): void {
  if (typeof window === 'undefined' || !window.history) return;
  try {
    const normalizedTab = normalizeTabId(tabId);
    const targetPath = getPathForTab(normalizedTab);
    const currentPath = normalizePath(window.location.pathname);
    const hasHash = Boolean(window.location.hash);

    if (currentPath === targetPath && !hasHash) {
      return;
    }

    const nextUrl = mode === 'replace' ? `${targetPath}${window.location.search || ''}` : targetPath;
    if (mode === 'replace') {
      window.history.replaceState({ tab: normalizedTab }, '', nextUrl);
    } else {
      window.history.pushState({ tab: normalizedTab }, '', nextUrl);
    }
  } catch {
    // Ignore history API restrictions in sandboxed contexts
  }
}

export function syncDocumentMetaForTab(tabId: string): void {
  if (typeof document === 'undefined') return;
  const normalizedTab = normalizeTabId(tabId);
  document.title = getDocumentTitleForTab(normalizedTab);

  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (canonical) {
    const path = getPathForTab(normalizedTab);
    canonical.href = `${CANONICAL_ORIGIN}${path}`;
  }
}

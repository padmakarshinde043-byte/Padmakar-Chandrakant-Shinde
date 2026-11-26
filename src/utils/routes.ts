/**
 * Clean client-side URL routing map & History API helpers.
 * Keeps browser address bar, Back/Forward navigation, document <title>,
 * and canonical link synchronized with every public and standalone page.
 */

const BASE_TITLE = 'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ';
const HOME_TITLE = 'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ | Mahasangh';
const DEFAULT_DESCRIPTION =
  'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ (Mahasangh) अधिकृत पोर्टल — ऑनलाईन सदस्यत्व नोंदणी, डिजिटल आयकार्ड, शासन निर्णय, परिपत्रके व पदाधिकारी माहिती.';
const CANONICAL_ORIGIN = 'https://mahasangh.in';
const DEFAULT_OG_IMAGE = 'https://mahasangh.in/pwa-512x512.png';
const DEFAULT_OG_IMAGE_ALT = 'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ अधिकृत मानचिन्ह';

export interface RouteMeta {
  tabId: string;
  path: string;
  title: string;
  description?: string;
  ogType?: string;
  ogImage?: string;
  ogImageAlt?: string;
  noIndex?: boolean;
  aliases?: string[];
}

export const APP_ROUTES: RouteMeta[] = [
  {
    tabId: 'home',
    path: '/',
    title: HOME_TITLE,
    description: DEFAULT_DESCRIPTION,
    aliases: ['/home', '/index.html'],
  },
  {
    tabId: 'founder_profile',
    path: '/rajendra-khairnar',
    title: `श्री. राजेंद्र शिवाजी खैरनार (Rajendra Khairnar) — राज्याध्यक्ष | ${BASE_TITLE}`,
    description:
      'श्री. राजेंद्र शिवाजी खैरनार (Rajendra Shivaji Khairnar) — संस्थापक राज्याध्यक्ष, महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ (State President, Maharashtra Rajya Kendrapramukh Va Adhikari Mahasangh). अधिकृत परिचय, छायाचित्र, शैक्षणिक पात्रता व संपर्क माहिती.',
    ogType: 'profile',
    ogImage: 'https://mahasangh.in/president.jpg',
    ogImageAlt:
      'श्री. राजेंद्र शिवाजी खैरनार (Rajendra Khairnar) — राज्याध्यक्ष, महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
    aliases: ['/president', '/founder', '/rajyadhyaksha'],
  },
  {
    tabId: 'about',
    path: '/about',
    title: `आमच्याबद्दल — ${BASE_TITLE}`,
    description:
      'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाची स्थापना, ध्येय, उद्दिष्टे, प्रमुख मागण्या आणि राज्यातील 34 जिल्ह्यांतील कार्यप्रणालीची सविस्तर माहिती.',
    aliases: ['/objectives'],
  },
  {
    tabId: 'leadership',
    path: '/leadership',
    title: `राज्य नेतृत्व — ${BASE_TITLE}`,
    description:
      'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाच्या राज्य कार्यकारिणीतील पदाधिकाऱ्यांची अधिकृत यादी.',
    aliases: ['/state-leadership'],
  },
  {
    tabId: 'women_leadership',
    path: '/women-leadership',
    title: `महिला आघाडी — ${BASE_TITLE}`,
    description:
      'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाच्या महिला आघाडी राज्य कार्यकारिणीतील पदाधिकाऱ्यांची अधिकृत यादी.',
    aliases: ['/mahila-aghadi', '/women-wing'],
  },
  {
    tabId: 'division_leadership',
    path: '/division-leadership',
    title: `विभाग नेतृत्व — ${BASE_TITLE}`,
    description:
      'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाच्या विभागीय कार्यकारिणी व विभागीय समन्वयकांची अधिकृत यादी.',
    aliases: ['/divisional-leadership', '/vibhag-netrutva'],
  },
  {
    tabId: 'district_leadership',
    path: '/district-leadership',
    title: `जिल्हा नेतृत्व — ${BASE_TITLE}`,
    description:
      'महाराष्ट्रातील सर्व 34 जिल्ह्यांतील महासंघ जिल्हाध्यक्ष व जिल्हा सरचिटणीस यांची अधिकृत संपर्क निर्देशिका.',
    aliases: ['/district_leadership'],
  },
  {
    tabId: 'appointments',
    path: '/appointments',
    title: `जिल्हा पदाधिकारी — ${BASE_TITLE}`,
    description:
      'जिल्हा व तालुका कार्यकारिणी पदाधिकारी यादी आणि महासंघाची अधिकृत स्वाक्षरीयुक्त नियुक्ती पत्रे प्रणाली.',
    aliases: ['/office-bearers'],
  },
  {
    tabId: 'advisory',
    path: '/advisory',
    title: `राज्य सल्लागार मंडळ — ${BASE_TITLE}`,
    description:
      'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाचे राज्य सल्लागार मंडळ आणि कायदेविषयक सल्लागार यांची अधिकृत माहिती.',
    aliases: ['/advisory-board'],
  },
  {
    tabId: 'news',
    path: '/news',
    title: `बातम्या — ${BASE_TITLE}`,
    description:
      'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाच्या ताज्या घडामोडी, बैठका, उपक्रम व अधिकृत बातम्या वाचा.',
  },
  {
    tabId: 'circulars',
    path: '/circulars',
    title: `शासन निर्णय व परिपत्रके — ${BASE_TITLE}`,
    description:
      'शालेय शिक्षण विभाग व प्राथमिक शिक्षण संचालनालयाचे अद्ययावत शासन निर्णय (GR), परिपत्रके आणि महासंघाची निवेदने PDF स्वरूपात डाऊनलोड करा.',
    aliases: ['/gov-orders'],
  },
  {
    tabId: 'membership',
    path: '/membership',
    title: `सदस्यत्व नोंदणी — ${BASE_TITLE}`,
    description:
      'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ ऑनलाईन सदस्यत्व नोंदणी, अर्जाची स्थिती तपासणी, अधिकृत सभासद यादी व डिजिटल ओळखपत्र (PDF).',
  },
  {
    tabId: 'contact',
    path: '/contact',
    title: `संपर्क — ${BASE_TITLE}`,
    description:
      'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ मुख्य कार्यालय पत्ता, अधिकृत फोन क्रमांक, ई-मेल व थेट संपर्क फॉर्म.',
  },
  {
    tabId: 'privacy',
    path: '/privacy-policy',
    title: `Privacy & Disclaimer Policy — ${BASE_TITLE}`,
    description:
      'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ वेबसाईट व अ‍ॅपचे गोपनीयता धोरण, माहिती स्त्रोत आणि अस्वीकरण (Privacy & Disclaimer Policy).',
    aliases: ['/privacy', '/disclaimer'],
  },
  {
    tabId: 'admin',
    path: '/admin',
    title: `Admin Panel — ${BASE_TITLE}`,
    noIndex: true,
  },
  {
    tabId: 'center_update',
    path: '/center-update',
    title: `केंद्र अद्ययावत करा — ${BASE_TITLE}`,
    noIndex: true,
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

const RELOAD_EXEMPT_TABS = new Set<string>(['admin', 'center_update', 'founder_profile']);

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
  const route = ROUTE_BY_TAB.get(normalizedTab);
  const title = route?.title || HOME_TITLE;
  const description = route?.description || DEFAULT_DESCRIPTION;
  const path = route?.path || '/';
  const canonicalUrl = `${CANONICAL_ORIGIN}${path}`;

  document.title = title;

  const setMeta = (selector: string, content: string) => {
    const el = document.querySelector<HTMLMetaElement>(selector);
    if (el) el.content = content;
  };

  const ogType = route?.ogType || 'website';
  const ogImage = route?.ogImage || DEFAULT_OG_IMAGE;
  const ogImageAlt = route?.ogImageAlt || DEFAULT_OG_IMAGE_ALT;

  setMeta('meta[name="title"]', title);
  setMeta('meta[name="description"]', description);
  setMeta('meta[property="og:type"]', ogType);
  setMeta('meta[property="og:title"]', title);
  setMeta('meta[property="og:description"]', description);
  setMeta('meta[property="og:url"]', canonicalUrl);
  setMeta('meta[property="og:image"]', ogImage);
  setMeta('meta[property="og:image:alt"]', ogImageAlt);
  setMeta('meta[name="twitter:title"]', title);
  setMeta('meta[name="twitter:description"]', description);
  setMeta('meta[name="twitter:image"]', ogImage);
  setMeta(
    'meta[name="robots"]',
    route?.noIndex
      ? 'noindex, nofollow'
      : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
  );

  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (canonical) {
    canonical.href = canonicalUrl;
  }
}

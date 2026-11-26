/**
 * Pure server-side HTML SEO metadata & Schema.org ProfilePage/Person injector.
 * Ensures search crawlers (Googlebot, Bingbot, WhatsApp, Facebook, X) receive exact
 * bilingual Marathi + English identity signals, high-res photo metadata, and JSON-LD
 * directly in the initial HTTP HTML response — especially for Founder State President
 * Shri Rajendra Shivaji Khairnar (/rajendra-khairnar).
 */

export const CANONICAL_ORIGIN = 'https://mahasangh.in';

export const FOUNDER_PROFILE_PATH = '/rajendra-khairnar';
export const FOUNDER_PROFILE_ALIASES = new Set<string>([
  '/rajendra-khairnar',
  '/president',
  '/founder',
  '/rajyadhyaksha',
]);

export const FOUNDER_SEO_META = {
  canonicalUrl: `${CANONICAL_ORIGIN}${FOUNDER_PROFILE_PATH}`,
  photoUrl: `${CANONICAL_ORIGIN}/president.jpg`,
  title:
    'श्री. राजेंद्र शिवाजी खैरनार (Rajendra Khairnar) — राज्याध्यक्ष | महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
  description:
    'श्री. राजेंद्र शिवाजी खैरनार (Rajendra Shivaji Khairnar) — संस्थापक राज्याध्यक्ष, महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ (State President, Maharashtra Rajya Kendrapramukh Va Adhikari Mahasangh). अधिकृत परिचय, छायाचित्र, शैक्षणिक पात्रता व संपर्क माहिती.',
  photoAlt:
    'श्री. राजेंद्र शिवाजी खैरनार (Rajendra Khairnar) — राज्याध्यक्ष, महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
};

interface RouteSeoOverride {
  canonicalPath: string;
  title: string;
  description: string;
  ogType?: string;
  ogImage?: string;
  ogImageAlt?: string;
}

const ROUTE_SEO_OVERRIDES: Record<string, RouteSeoOverride> = {
  '/about': {
    canonicalPath: '/about',
    title: 'आमच्याबद्दल — महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
    description:
      'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाची स्थापना, ध्येय, उद्दिष्टे, प्रमुख मागण्या आणि राज्यातील 34 जिल्ह्यांतील कार्यप्रणालीची सविस्तर माहिती.',
  },
  '/leadership': {
    canonicalPath: '/leadership',
    title: 'राज्य नेतृत्व — महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
    description:
      'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाचे संस्थापक राज्याध्यक्ष श्री. राजेंद्र शिवाजी खैरनार (Rajendra Khairnar) व राज्य कार्यकारिणीची अधिकृत यादी.',
  },
  '/women-leadership': {
    canonicalPath: '/women-leadership',
    title: 'महिला आघाडी — महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
    description:
      'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाची महिला आघाडी राज्य कार्यकारिणी व पदाधिकाऱ्यांची अधिकृत यादी.',
  },
  '/division-leadership': {
    canonicalPath: '/division-leadership',
    title: 'विभाग नेतृत्व — महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
    description:
      'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाची विभागीय कार्यकारिणी व विभागीय समन्वयकांची अधिकृत यादी.',
  },
  '/district-leadership': {
    canonicalPath: '/district-leadership',
    title: 'जिल्हा नेतृत्व — महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
    description:
      'महाराष्ट्रातील सर्व 34 जिल्ह्यांतील महासंघ जिल्हाध्यक्ष व जिल्हा सरचिटणीस यांची अधिकृत संपर्क निर्देशिका.',
  },
  '/appointments': {
    canonicalPath: '/appointments',
    title: 'जिल्हा पदाधिकारी — महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
    description:
      'जिल्हा व तालुका कार्यकारिणी पदाधिकारी यादी आणि महासंघाची अधिकृत स्वाक्षरीयुक्त नियुक्ती पत्रे प्रणाली.',
  },
  '/advisory': {
    canonicalPath: '/advisory',
    title: 'राज्य सल्लागार मंडळ — महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
    description:
      'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाचे राज्य सल्लागार मंडळ आणि कायदेविषयक सल्लागार यांची अधिकृत माहिती.',
  },
  '/news': {
    canonicalPath: '/news',
    title: 'बातम्या — महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
    description:
      'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाच्या ताज्या घडामोडी, बैठका, उपक्रम व अधिकृत बातम्या वाचा.',
  },
  '/circulars': {
    canonicalPath: '/circulars',
    title: 'शासन निर्णय व परिपत्रके — महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
    description:
      'शालेय शिक्षण विभाग व प्राथमिक शिक्षण संचालनालयाचे अद्ययावत शासन निर्णय (GR), परिपत्रके आणि महासंघाची निवेदने PDF स्वरूपात डाऊनलोड करा.',
  },
  '/membership': {
    canonicalPath: '/membership',
    title: 'सदस्यत्व नोंदणी — महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
    description:
      'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ ऑनलाईन सदस्यत्व नोंदणी, अर्जाची स्थिती तपासणी, अधिकृत सभासद यादी व डिजिटल ओळखपत्र (PDF).',
  },
  '/contact': {
    canonicalPath: '/contact',
    title: 'संपर्क — महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
    description:
      'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ मुख्य कार्यालय पत्ता, अधिकृत फोन क्रमांक, ई-मेल व थेट संपर्क फॉर्म.',
  },
  '/privacy-policy': {
    canonicalPath: '/privacy-policy',
    title: 'Privacy & Disclaimer Policy — महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
    description:
      'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ वेबसाईटचे गोपनीयता धोरण, माहिती स्त्रोत आणि अस्वीकरण (Privacy & Disclaimer Policy).',
  },
};

function normalizePathname(rawPathname: string): string {
  const cleaned = String(rawPathname || '/')
    .split('?')[0]
    .split('#')[0]
    .trim()
    .toLowerCase();
  if (!cleaned || cleaned === '/') return '/';
  const withSlash = cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
  return withSlash.replace(/\/+$/, '') || '/';
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildFounderProfileJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': `${FOUNDER_SEO_META.canonicalUrl}#profilepage`,
    url: FOUNDER_SEO_META.canonicalUrl,
    name: FOUNDER_SEO_META.title,
    description: FOUNDER_SEO_META.description,
    inLanguage: ['mr-IN', 'en-IN'],
    isPartOf: {
      '@id': `${CANONICAL_ORIGIN}/#website`,
    },
    primaryImageOfPage: {
      '@type': 'ImageObject',
      '@id': `${CANONICAL_ORIGIN}/#rajendra-khairnar-photo`,
      url: FOUNDER_SEO_META.photoUrl,
      contentUrl: FOUNDER_SEO_META.photoUrl,
      caption: FOUNDER_SEO_META.photoAlt,
    },
    mainEntity: {
      '@type': 'Person',
      '@id': `${CANONICAL_ORIGIN}/#rajendra-khairnar`,
      name: 'श्री. राजेंद्र शिवाजी खैरनार',
      alternateName: [
        'श्री राजेंद्र खैरनार',
        'राजेंद्र खैरनार',
        'राजेंद्र शिवाजी खैरनार',
        'राज्याध्यक्ष राजेंद्र खैरनार',
        'Rajendra Khairnar',
        'Rajendra Shivaji Khairnar',
        'Shri Rajendra Khairnar',
        'Rajendra Khairnar State President',
      ],
      jobTitle: 'राज्याध्यक्ष — महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ',
      description:
        'श्री. राजेंद्र शिवाजी खैरनार (Rajendra Shivaji Khairnar) — संस्थापक राज्याध्यक्ष, महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ (State President, Maharashtra Rajya Kendrapramukh Va Adhikari Mahasangh).',
      image: {
        '@type': 'ImageObject',
        '@id': `${CANONICAL_ORIGIN}/#rajendra-khairnar-photo`,
        url: FOUNDER_SEO_META.photoUrl,
        contentUrl: FOUNDER_SEO_META.photoUrl,
        caption: FOUNDER_SEO_META.photoAlt,
      },
      url: FOUNDER_SEO_META.canonicalUrl,
      telephone: '+91-9860704098',
      email: 'mahasangh2026@gmail.com',
      worksFor: {
        '@id': `${CANONICAL_ORIGIN}/#organization`,
      },
      affiliation: {
        '@id': `${CANONICAL_ORIGIN}/#organization`,
      },
      address: {
        '@type': 'PostalAddress',
        streetAddress: '131, पाटणे, ता. मालेगाव',
        addressLocality: 'नाशिक',
        addressRegion: 'महाराष्ट्र',
        postalCode: '423203',
        addressCountry: 'IN',
      },
      nationality: 'Indian',
    },
  };
}

function buildFounderPreHydrationMain(): string {
  return `<main class="mhs-seo-sr">
        <article itemscope itemtype="https://schema.org/Person">
          <figure>
            <img src="/president.jpg" alt="${escapeHtmlAttr(FOUNDER_SEO_META.photoAlt)}" itemprop="image" />
            <figcaption>श्री. राजेंद्र शिवाजी खैरनार (Rajendra Khairnar) — राज्याध्यक्ष, महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ</figcaption>
          </figure>
          <h1 itemprop="name">श्री. राजेंद्र शिवाजी खैरनार (Rajendra Khairnar)</h1>
          <p itemprop="jobTitle">राज्याध्यक्ष (संस्थापक राज्याध्यक्ष) — महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ</p>
          <p>State President — Maharashtra Rajya Kendrapramukh Va Adhikari Mahasangh (Registration No. श्रमिक संघ – महा/एनएसके/एन/2427)</p>
          <p>शैक्षणिक पात्रता: B.Sc., D.Ed., B.Ed., M.Ed., NET, SET, Ph.D. (Appear)</p>
          <p>
            श्री. राजेंद्र शिवाजी खैरनार (Shri Rajendra Shivaji Khairnar) हे महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाचे संस्थापक राज्याध्यक्ष आहेत. महाराष्ट्रातील 34 जिल्हे व 350+ तालुक्यांतील केंद्रप्रमुख आणि शिक्षण विस्तार अधिकाऱ्यांच्या न्याय्य हक्कांसाठी, सन्मानासाठी आणि प्राथमिक शिक्षणाच्या गुणवत्तेसाठी ते राज्यस्तरीय नेतृत्व करत आहेत.
          </p>
          <p>अधिकृत संपर्क: +91-9860704098 | कार्यालय: 131, पाटणे, ता. मालेगाव, जि. नाशिक, महाराष्ट्र — 423203</p>
          <nav aria-label="महासंघ प्रमुख दुवे">
            <ul>
              <li><a href="/">मुख्य पान — महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ</a></li>
              <li><a href="/leadership">राज्य नेतृत्व व राज्य कार्यकारिणी</a></li>
              <li><a href="/district-leadership">जिल्हा नेतृत्व</a></li>
              <li><a href="/membership">ऑनलाईन सदस्यत्व नोंदणी</a></li>
            </ul>
          </nav>
        </article>
      </main>`;
}

function replaceMetaTag(html: string, pattern: RegExp, replacement: string): string {
  if (pattern.test(html)) {
    return html.replace(pattern, replacement);
  }
  return html;
}

export function applyRouteSeoToHtml(html: string, rawPathname: string): string {
  const pathname = normalizePathname(rawPathname);

  if (FOUNDER_PROFILE_ALIASES.has(pathname)) {
    const safeTitle = escapeHtmlAttr(FOUNDER_SEO_META.title);
    const safeDesc = escapeHtmlAttr(FOUNDER_SEO_META.description);
    const safeAlt = escapeHtmlAttr(FOUNDER_SEO_META.photoAlt);
    const safeUrl = escapeHtmlAttr(FOUNDER_SEO_META.canonicalUrl);
    const safePhoto = escapeHtmlAttr(FOUNDER_SEO_META.photoUrl);

    let out = html;
    out = replaceMetaTag(out, /<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
    out = replaceMetaTag(
      out,
      /<meta\s+name="title"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="title" content="${safeTitle}" />`
    );
    out = replaceMetaTag(
      out,
      /<meta\s+name="description"[\s\S]*?content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${safeDesc}" />`
    );
    out = replaceMetaTag(
      out,
      /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
      `<link rel="canonical" href="${safeUrl}" />`
    );
    out = replaceMetaTag(
      out,
      /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:type" content="profile" />`
    );
    out = replaceMetaTag(
      out,
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:url" content="${safeUrl}" />`
    );
    out = replaceMetaTag(
      out,
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:title" content="${safeTitle}" />`
    );
    out = replaceMetaTag(
      out,
      /<meta\s+property="og:description"[\s\S]*?content="[^"]*"\s*\/?>/i,
      `<meta property="og:description" content="${safeDesc}" />`
    );
    out = replaceMetaTag(
      out,
      /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:image" content="${safePhoto}" />`
    );
    out = replaceMetaTag(
      out,
      /<meta\s+property="og:image:alt"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:image:alt" content="${safeAlt}" />`
    );
    out = replaceMetaTag(
      out,
      /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:title" content="${safeTitle}" />`
    );
    out = replaceMetaTag(
      out,
      /<meta\s+name="twitter:description"[\s\S]*?content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:description" content="${safeDesc}" />`
    );
    out = replaceMetaTag(
      out,
      /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:image" content="${safePhoto}" />`
    );

    const profileJsonLdScript = `<script type="application/ld+json" id="mhs-profile-ldjson">${JSON.stringify(
      buildFounderProfileJsonLd()
    )}</script>`;
    if (!out.includes('id="mhs-profile-ldjson"')) {
      out = out.replace(/<\/head>/i, `    ${profileJsonLdScript}\n  </head>`);
    }

    out = replaceMetaTag(
      out,
      /<main\s+class="mhs-seo-sr">[\s\S]*?<\/main>/i,
      buildFounderPreHydrationMain()
    );

    return out;
  }

  const routeOverride = ROUTE_SEO_OVERRIDES[pathname];
  if (!routeOverride) {
    return html;
  }

  const canonicalUrl = `${CANONICAL_ORIGIN}${routeOverride.canonicalPath}`;
  const safeTitle = escapeHtmlAttr(routeOverride.title);
  const safeDesc = escapeHtmlAttr(routeOverride.description);
  const safeUrl = escapeHtmlAttr(canonicalUrl);

  let out = html;
  out = replaceMetaTag(out, /<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  out = replaceMetaTag(
    out,
    /<meta\s+name="title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="title" content="${safeTitle}" />`
  );
  out = replaceMetaTag(
    out,
    /<meta\s+name="description"[\s\S]*?content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${safeDesc}" />`
  );
  out = replaceMetaTag(
    out,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${safeUrl}" />`
  );
  out = replaceMetaTag(
    out,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${safeUrl}" />`
  );
  out = replaceMetaTag(
    out,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${safeTitle}" />`
  );
  out = replaceMetaTag(
    out,
    /<meta\s+property="og:description"[\s\S]*?content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${safeDesc}" />`
  );
  out = replaceMetaTag(
    out,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${safeTitle}" />`
  );
  out = replaceMetaTag(
    out,
    /<meta\s+name="twitter:description"[\s\S]*?content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${safeDesc}" />`
  );

  return out;
}

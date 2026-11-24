import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyRouteSeoToHtml,
  buildFounderProfileJsonLd,
  FOUNDER_SEO_META,
} from './seoProfileHtml';

const INDEX_HTML_PATH = path.resolve(process.cwd(), 'index.html');

test('index.html does not contain PWA manifest link or mobile-web-app-capable meta tags', () => {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  assert.equal(
    /<link[^>]+rel=["']manifest["']/i.test(html),
    false,
    'index.html must not link a web app manifest'
  );
  assert.equal(
    /mobile-web-app-capable/i.test(html),
    false,
    'index.html must not contain mobile-web-app-capable'
  );
  assert.equal(
    /apple-mobile-web-app-capable/i.test(html),
    false,
    'index.html must not contain apple-mobile-web-app-capable'
  );
});

test('index.html root JSON-LD includes full Person entity for Shri Rajendra Khairnar with photo & bilingual names', () => {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  assert.ok(match, 'Root JSON-LD block must exist in index.html');
  const parsed = JSON.parse(match[1]);
  const graph = Array.isArray(parsed['@graph']) ? parsed['@graph'] : [];
  const person = graph.find(
    (node: Record<string, unknown>) =>
      node['@type'] === 'Person' && node['@id'] === 'https://mahasangh.in/#rajendra-khairnar'
  );
  assert.ok(person, 'Root @graph must define Person node #rajendra-khairnar');
  assert.equal(person.name, 'श्री. राजेंद्र शिवाजी खैरनार');
  assert.ok(Array.isArray(person.alternateName));
  assert.ok(person.alternateName.includes('श्री राजेंद्र खैरनार'));
  assert.ok(person.alternateName.includes('Rajendra Khairnar'));
  assert.ok(person.alternateName.includes('Rajendra Shivaji Khairnar'));
  assert.equal(person.image?.url, 'https://mahasangh.in/president.jpg');
  assert.equal(person.url, 'https://mahasangh.in/rajendra-khairnar');
  assert.equal(person.worksFor?.['@id'], 'https://mahasangh.in/#organization');
});

test('applyRouteSeoToHtml injects bilingual ProfilePage + Person metadata and president.jpg for /rajendra-khairnar and aliases', () => {
  const baseHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8');

  for (const route of ['/rajendra-khairnar', '/rajendra-khairnar/', '/president', '/founder', '/rajyadhyaksha']) {
    const result = applyRouteSeoToHtml(baseHtml, route);
    assert.ok(
      result.includes('<title>श्री. राजेंद्र शिवाजी खैरनार (Rajendra Khairnar)'),
      `Title missing bilingual founder name for ${route}`
    );
    assert.ok(
      result.includes('महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ'),
      `Organization name missing for ${route}`
    );
    assert.ok(
      result.includes('<meta property="og:type" content="profile" />'),
      `og:type=profile missing for ${route}`
    );
    assert.ok(
      result.includes(`<meta property="og:image" content="${FOUNDER_SEO_META.photoUrl}" />`),
      `og:image president.jpg missing for ${route}`
    );
    assert.ok(
      result.includes(`<meta name="twitter:image" content="${FOUNDER_SEO_META.photoUrl}" />`),
      `twitter:image president.jpg missing for ${route}`
    );
    assert.ok(
      result.includes(`<link rel="canonical" href="${FOUNDER_SEO_META.canonicalUrl}" />`),
      `canonical /rajendra-khairnar missing for ${route}`
    );

    const profileScript = result.match(
      /<script type="application\/ld\+json" id="mhs-profile-ldjson">([\s\S]*?)<\/script>/i
    );
    assert.ok(profileScript, `ProfilePage JSON-LD missing for ${route}`);
    const parsed = JSON.parse(profileScript[1]);
    assert.equal(parsed['@type'], 'ProfilePage');
    assert.equal(parsed.mainEntity['@type'], 'Person');
    assert.equal(parsed.mainEntity.image.url, 'https://mahasangh.in/president.jpg');
    assert.ok(parsed.mainEntity.alternateName.includes('Rajendra Khairnar'));
    assert.ok(parsed.mainEntity.alternateName.includes('श्री राजेंद्र खैरनार'));
    assert.ok(String(parsed.mainEntity.jobTitle).includes('राज्याध्यक्ष'));
  }
});

test('buildFounderProfileJsonLd contains required Google ProfilePage & Person schema fields', () => {
  const schema = buildFounderProfileJsonLd();
  assert.equal(schema['@type'], 'ProfilePage');
  const entity = schema.mainEntity as Record<string, any>;
  assert.equal(entity['@type'], 'Person');
  assert.equal(entity.image.url, 'https://mahasangh.in/president.jpg');
  assert.equal(entity.worksFor['@id'], 'https://mahasangh.in/#organization');
});

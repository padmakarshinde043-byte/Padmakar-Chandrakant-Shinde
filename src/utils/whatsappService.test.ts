import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertDevanagariDigits,
  normalizeIndianWhatsAppNumber,
  isPlaceholderTestNumber,
  formatPresidentWhatsAppMessage,
  sanitizeWhatsAppConfig,
  DEFAULT_WHATSAPP_CONFIG,
} from './whatsappService';

test('convertDevanagariDigits converts Marathi digits to ASCII digits', () => {
  assert.equal(convertDevanagariDigits('९८२३४५६७८९'), '9823456789');
  assert.equal(convertDevanagariDigits('+९१ ९८२३०-१२३४५'), '+91 98230-12345');
});

test('normalizeIndianWhatsAppNumber handles valid 10/11/12/13 digit formats and Marathi digits', () => {
  assert.equal(normalizeIndianWhatsAppNumber('9823456789'), '919823456789');
  assert.equal(normalizeIndianWhatsAppNumber('09823456789'), '919823456789');
  assert.equal(normalizeIndianWhatsAppNumber('+91 98234-56789'), '919823456789');
  assert.equal(normalizeIndianWhatsAppNumber('091 9823456789'), '919823456789');
  assert.equal(normalizeIndianWhatsAppNumber('९८२३४५६७८९'), '919823456789');
});

test('normalizeIndianWhatsAppNumber rejects invalid lengths and non-mobile prefixes', () => {
  assert.equal(normalizeIndianWhatsAppNumber(''), null);
  assert.equal(normalizeIndianWhatsAppNumber('12345'), null);
  assert.equal(normalizeIndianWhatsAppNumber('5123456789'), null);
  assert.equal(normalizeIndianWhatsAppNumber('02024567890'), null);
  assert.equal(normalizeIndianWhatsAppNumber('91982345678900'), null);
});

test('isPlaceholderTestNumber detects dummy seed numbers', () => {
  assert.equal(isPlaceholderTestNumber('919800000049'), true);
  assert.equal(isPlaceholderTestNumber('919999999999'), true);
  assert.equal(isPlaceholderTestNumber('919823456789'), false);
});

test('formatPresidentWhatsAppMessage interpolates recipient tags and adds signature header/footer', () => {
  const formatted = formatPresidentWhatsAppMessage({
    messageTemplate: 'सन्माननीय {नाव} ({पद}, {जिल्हा}), महत्त्वाची बैठक उद्या सकाळी ११ वाजता आहे.',
    senderName: 'मा. श्री. राजेंद्र खैरनार',
    senderTitle: 'राज्याध्यक्ष',
    recipient: {
      name: 'श्री. अनिल पाटील',
      role: 'जिल्हाध्यक्ष',
      district: 'नाशिक',
    },
    includeSignatureHeader: true,
  });

  assert.match(formatted, /^\*मा\. श्री\. राजेंद्र खैरनार\*\n_राज्याध्यक्ष_/);
  assert.match(formatted, /सन्माननीय श्री\. अनिल पाटील \(जिल्हाध्यक्ष, नाशिक\), महत्त्वाची बैठक उद्या सकाळी ११ वाजता आहे\./);
  assert.match(formatted, /महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ/);
});

test('formatPresidentWhatsAppMessage omits header/footer when includeSignatureHeader is false', () => {
  const plain = formatPresidentWhatsAppMessage({
    messageTemplate: 'नमस्कार {name}, {district}',
    senderName: 'राज्याध्यक्ष',
    senderTitle: 'Title',
    recipient: { name: 'राहुल', district: 'पुणे' },
    includeSignatureHeader: false,
  });
  assert.equal(plain, 'नमस्कार राहुल, पुणे');
});

test('sanitizeWhatsAppConfig masks secret tokens and preserves non-secret fields', () => {
  const sanitized = sanitizeWhatsAppConfig({
    ...DEFAULT_WHATSAPP_CONFIG,
    enabled: true,
    metaPhoneNumberId: '1234567890',
    metaAccessToken: 'EAAGm0PX4ZCpsBAFakeSecretToken9876',
    customAuthHeaderValue: 'shortkey',
  });

  assert.equal('metaAccessToken' in sanitized, false);
  assert.equal('customAuthHeaderValue' in sanitized, false);
  assert.equal(sanitized.hasMetaAccessToken, true);
  assert.equal(sanitized.metaAccessTokenPreview, 'EAAGm0••••••9876');
  assert.equal(sanitized.hasCustomAuthHeader, true);
  assert.equal(sanitized.customAuthHeaderPreview, '••••••••');
  assert.equal(sanitized.metaPhoneNumberId, '1234567890');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  isHashedPassword,
  signSessionToken,
  verifySessionToken,
  parseCookieHeader,
  signPaymentProof,
  verifyPaymentProof,
} from './serverAuth';

test('hashPassword and verifyPassword support scrypt hashing and legacy plaintext verification', () => {
  const plain = 'Mahasangh@2026!';
  const hashed = hashPassword(plain);

  assert.equal(isHashedPassword(hashed), true);
  assert.notEqual(hashed, plain);
  assert.equal(hashPassword(hashed), hashed, 'already hashed passwords should not be double-hashed');

  assert.equal(verifyPassword(plain, hashed), true);
  assert.equal(verifyPassword('WrongPass', hashed), false);
  assert.equal(verifyPassword('', hashed), false);
  assert.equal(verifyPassword(plain, ''), false);

  // Backward compatibility for legacy unhashed records before first rotation
  assert.equal(isHashedPassword('LegacyPass123'), false);
  assert.equal(verifyPassword('LegacyPass123', 'LegacyPass123'), true);
  assert.equal(verifyPassword('LegacyPass124', 'LegacyPass123'), false);
});

test('signSessionToken and verifySessionToken validate signatures, roles, and expiration', () => {
  const token = signSessionToken({
    role: 'sub_admin',
    email: 'user@mahasangh.in',
    name: 'Test Admin',
    permissions: { viewMessages: true },
  });

  const decoded = verifySessionToken(token);
  assert.ok(decoded);
  assert.equal(decoded?.role, 'sub_admin');
  assert.equal(decoded?.email, 'user@mahasangh.in');
  assert.equal(decoded?.permissions?.viewMessages, true);

  // Tampering with payload or signature fails verification
  const [body, sig] = token.split('.');
  const tamperedBody = Buffer.from(
    JSON.stringify({ role: 'super_admin', email: 'hacker@example.com', exp: Date.now() + 60_000 }),
    'utf-8'
  )
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  assert.equal(verifySessionToken(`${tamperedBody}.${sig}`), null);
  assert.equal(verifySessionToken(`${body}.invalid_sig`), null);
  assert.equal(verifySessionToken('malformed'), null);

  // Expired tokens fail verification
  const expiredToken = signSessionToken({ role: 'district_admin', district: 'पुणे' }, -1000);
  assert.equal(verifySessionToken(expiredToken), null);
});

test('parseCookieHeader parses cookies safely', () => {
  const cookies = parseCookieHeader('foo=bar; ms_session=abc%2E123; empty=; theme=light');
  assert.equal(cookies.foo, 'bar');
  assert.equal(cookies.ms_session, 'abc.123');
  assert.equal(cookies.theme, 'light');
  assert.deepEqual(parseCookieHeader(undefined), {});
});

test('signPaymentProof and verifyPaymentProof bind applicationId and paymentId securely', () => {
  const proof = signPaymentProof('app_123', 'pay_xyz');
  assert.equal(verifyPaymentProof(proof, 'app_123', 'pay_xyz'), true);
  assert.equal(verifyPaymentProof(proof, 'app_999', 'pay_xyz'), false);
  assert.equal(verifyPaymentProof(proof, 'app_123', 'pay_wrong'), false);
  assert.equal(verifyPaymentProof(`${proof}x`, 'app_123', 'pay_xyz'), false);
  assert.equal(verifyPaymentProof('', 'app_123', 'pay_xyz'), false);
});

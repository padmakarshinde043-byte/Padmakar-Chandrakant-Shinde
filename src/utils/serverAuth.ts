import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type express from 'express';

const HASH_PREFIX = 'scrypt$';
export const SESSION_COOKIE_NAME = 'ms_session';
const SESSION_SECRET_FILE = path.resolve(process.cwd(), '.session-secret');

let cachedSessionSecret: string | null = null;

export function getSessionSecret(): string {
  if (cachedSessionSecret) return cachedSessionSecret;

  const envSecret = String(process.env.SESSION_SECRET || '').trim();
  if (envSecret.length >= 16) {
    cachedSessionSecret = envSecret;
    return cachedSessionSecret;
  }

  try {
    if (fs.existsSync(SESSION_SECRET_FILE)) {
      const fromFile = fs.readFileSync(SESSION_SECRET_FILE, 'utf-8').trim();
      if (fromFile.length >= 32) {
        cachedSessionSecret = fromFile;
        return cachedSessionSecret;
      }
    }
  } catch (err) {
    console.warn('Could not read .session-secret:', err);
  }

  const generated = crypto.randomBytes(48).toString('hex');
  try {
    fs.writeFileSync(SESSION_SECRET_FILE, generated, { encoding: 'utf-8', mode: 0o600 });
  } catch (err) {
    console.warn('Could not persist .session-secret:', err);
  }
  cachedSessionSecret = generated;
  return cachedSessionSecret;
}

export function isHashedPassword(value?: string | null): boolean {
  return typeof value === 'string' && value.startsWith(HASH_PREFIX);
}

export function hashPassword(plain: string): string {
  const clean = String(plain || '');
  if (!clean) return '';
  if (isHashedPassword(clean)) return clean;

  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(clean, salt, 64).toString('hex');
  return `${HASH_PREFIX}${salt}$${derived}`;
}

function timingSafeCompareStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) {
    // Perform a dummy constant-time compare to avoid early-return timing leaks
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyPassword(input: string, stored?: string | null): boolean {
  const cleanInput = String(input || '');
  const cleanStored = String(stored || '');
  if (!cleanInput || !cleanStored) return false;

  if (isHashedPassword(cleanStored)) {
    const parts = cleanStored.split('$');
    if (parts.length !== 3) return false;
    const [, saltHex, hashHex] = parts;
    if (!saltHex || !hashHex) return false;
    try {
      const derived = crypto.scryptSync(cleanInput, saltHex, 64);
      const expected = Buffer.from(hashHex, 'hex');
      if (derived.length !== expected.length) return false;
      return crypto.timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }

  // Backward-compatible constant-time check for legacy plaintext values prior to first write
  return timingSafeCompareStrings(cleanInput, cleanStored);
}

export type SessionRole = 'super_admin' | 'sub_admin' | 'state_president' | 'district_admin';

export interface SessionPayload {
  role: SessionRole;
  email?: string;
  name?: string;
  district?: string;
  permissions?: Record<string, boolean>;
  exp: number;
}

function toBase64Url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64Url(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf-8');
}

export function signSessionToken(
  payload: Omit<SessionPayload, 'exp'>,
  ttlMs = 12 * 60 * 60 * 1000
): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + ttlMs,
  };
  const body = toBase64Url(JSON.stringify(fullPayload));
  const sig = toBase64Url(
    crypto.createHmac('sha256', getSessionSecret()).update(body).digest()
  );
  return `${body}.${sig}`;
}

export function verifySessionToken(token?: string | null): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  const expectedSig = toBase64Url(
    crypto.createHmac('sha256', getSessionSecret()).update(body).digest()
  );
  if (!timingSafeCompareStrings(sig, expectedSig)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(body)) as SessionPayload;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.exp || typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) {
      return null;
    }
    if (!parsed.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

export function extractRequestSession(req: express.Request): SessionPayload | null {
  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    const verified = verifySessionToken(bearer);
    if (verified) return verified;
  }

  const cookies = parseCookieHeader(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME];
  if (cookieToken) {
    return verifySessionToken(cookieToken);
  }
  return null;
}

export function setSessionCookie(
  res: express.Response,
  token: string,
  req: express.Request,
  maxAgeSeconds = 12 * 60 * 60
): void {
  const isHttps =
    req.secure ||
    String(req.headers['x-forwarded-proto'] || '').toLowerCase().includes('https');
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSeconds}`,
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
    ...(isHttps ? ['Secure'] : []),
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function clearSessionCookie(res: express.Response, req: express.Request): void {
  const isHttps =
    req.secure ||
    String(req.headers['x-forwarded-proto'] || '').toLowerCase().includes('https');
  const attrs = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
    ...(isHttps ? ['Secure'] : []),
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function signPaymentProof(applicationId: string, paymentId: string): string {
  const cleanAppId = String(applicationId || '').trim();
  const cleanPaymentId = String(paymentId || '').trim();
  const exp = Date.now() + 15 * 60 * 1000;
  const payload = toBase64Url(JSON.stringify({ appId: cleanAppId, paymentId: cleanPaymentId, exp }));
  const sig = toBase64Url(
    crypto.createHmac('sha256', getSessionSecret()).update(`pay:${payload}`).digest()
  );
  return `${payload}.${sig}`;
}

export function verifyPaymentProof(
  token?: string | null,
  expectedAppId?: string,
  expectedPaymentId?: string
): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.trim().split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  if (!payload || !sig) return false;

  const expectedSig = toBase64Url(
    crypto.createHmac('sha256', getSessionSecret()).update(`pay:${payload}`).digest()
  );
  if (!timingSafeCompareStrings(sig, expectedSig)) return false;

  try {
    const parsed = JSON.parse(fromBase64Url(payload)) as {
      appId?: string;
      paymentId?: string;
      exp?: number;
    };
    if (!parsed.exp || parsed.exp <= Date.now()) return false;
    if (expectedAppId && parsed.appId && parsed.appId !== String(expectedAppId).trim()) {
      return false;
    }
    if (expectedPaymentId && parsed.paymentId && parsed.paymentId !== String(expectedPaymentId).trim()) {
      return false;
    }
    return Boolean(parsed.paymentId);
  } catch {
    return false;
  }
}

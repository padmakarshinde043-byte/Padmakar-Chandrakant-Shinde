/**
 * Transparent SQL / Preview Bridge
 * - Production hosts (mahasangh.in): ALL reads/writes route 100% to HostKarle MySQL (/api/db/*).
 * - AI Studio Preview / localhost (when MySQL is not configured): uses local Mock & LocalStorage engine.
 */

export type ActiveBackendMode = 'mysql' | 'mock';

export function isAiStudioPreviewHostname(hostname: string): boolean {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
    return true;
  }
  if (/^ais-(dev|pre)-[a-z0-9-]+\..*run\.app$/i.test(host)) {
    return true;
  }
  if (host.endsWith('.aistudio.google.com') || host === 'aistudio.google.com') {
    return true;
  }
  return false;
}

let resolvedMode: ActiveBackendMode | null = null;
let modeCheckPromise: Promise<ActiveBackendMode> | null = null;

export function isAiStudioPreviewEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return isAiStudioPreviewHostname(window.location.hostname);
}

export async function getActiveBackendMode(): Promise<ActiveBackendMode> {
  const isPreview = isAiStudioPreviewEnvironment();
  if (!isPreview) {
    resolvedMode = 'mysql';
    return 'mysql';
  }
  if (resolvedMode) {
    return resolvedMode;
  }
  if (modeCheckPromise) return modeCheckPromise;

  modeCheckPromise = (async (): Promise<ActiveBackendMode> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), isPreview ? 2500 : 7000);
      const res = await fetch('/api/db/mode', {
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data && data.backend === 'mysql') {
          resolvedMode = 'mysql';
          return 'mysql';
        }
      }
    } catch {
      if (!isPreview) {
        resolvedMode = 'mysql';
        return 'mysql';
      }
    }

    if (!isPreview) {
      resolvedMode = 'mysql';
      return 'mysql';
    }

    resolvedMode = 'mock';
    return 'mock';
  })().finally(() => {
    modeCheckPromise = null;
  });

  return modeCheckPromise;
}

export async function isSqlBackendActive(): Promise<boolean> {
  return (await getActiveBackendMode()) === 'mysql';
}

/** Firebase is 100% disabled across all environments */
export async function isFirebaseAllowedInCurrentEnvironment(): Promise<boolean> {
  return false;
}

/** Firebase is 100% disabled synchronously */
export function isFirebaseAllowedSync(): boolean {
  return false;
}

const AUTH_TOKEN_KEY = 'mahasangh_auth_token_v1';
const ADMIN_AUTH_TOKEN_KEY = 'mahasangh_admin_auth_token_v1';

export function getPersistentAdminAuthToken(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(ADMIN_AUTH_TOKEN_KEY) || '';
    }
  } catch {}
  return '';
}

export function restorePersistentAdminAuthTokenToSession(): string {
  const adminToken = getPersistentAdminAuthToken();
  if (adminToken) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(AUTH_TOKEN_KEY, adminToken);
      }
    } catch {}
  }
  return adminToken;
}

export function getAuthSessionToken(): string {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const sessionToken = sessionStorage.getItem(AUTH_TOKEN_KEY);
      if (sessionToken) return sessionToken;
    }
  } catch {}
  return getPersistentAdminAuthToken();
}

export function setAuthSessionToken(
  token?: string | null,
  options?: { persistAdmin?: boolean }
): void {
  const trimmed = token ? token.trim() : '';
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (trimmed) {
        sessionStorage.setItem(AUTH_TOKEN_KEY, trimmed);
      } else {
        sessionStorage.removeItem(AUTH_TOKEN_KEY);
      }
    }
  } catch {}
  if (options?.persistAdmin) {
    try {
      if (typeof localStorage !== 'undefined') {
        if (trimmed) {
          localStorage.setItem(ADMIN_AUTH_TOKEN_KEY, trimmed);
        } else {
          localStorage.removeItem(ADMIN_AUTH_TOKEN_KEY);
        }
      }
    } catch {}
  }
}

export function clearAuthSessionToken(options?: { clearPersistentAdmin?: boolean }): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {}
  if (options?.clearPersistentAdmin) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(ADMIN_AUTH_TOKEN_KEY);
      }
    } catch {}
  }
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function sqlApiRequest<T = any>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const controller = typeof AbortController !== 'undefined' && !options?.signal ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 25000) : null;

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      credentials: 'include',
      cache: options?.cache ?? 'no-store',
      signal: options?.signal || controller?.signal,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...(options?.headers || {}),
      },
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('सर्व्हरचा प्रतिसाद वेळ मर्यादेत आला नाही (Timeout). कृपया इंटरनेट तपासून पुन्हा प्रयत्न करा.');
    }
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (!res.ok) {
    let errMsg =
      res.status === 413
        ? 'पाठवलेल्या डेटाचा आकार सर्व्हरच्या मर्यादेपेक्षा मोठा आहे (413 Payload Too Large).'
        : `सर्व्हर त्रुटी (${res.status})`;
    try {
      const errBody = await res.json();
      if (errBody?.message) errMsg = errBody.message;
    } catch {}
    throw new Error(errMsg);
  }

  return (await res.json()) as T;
}

export async function authApiRequest<T = any>(
  url: string,
  body?: unknown,
  method: 'GET' | 'POST' = 'POST'
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  let data: any = {};
  try {
    data = await res.json();
  } catch {}
  return { ok: res.ok, status: res.status, data: data as T };
}


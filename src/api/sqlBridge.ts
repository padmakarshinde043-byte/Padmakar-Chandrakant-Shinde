import { isAiStudioPreviewHostname } from '../utils/previewFirebaseGuard';

/**
 * Transparent SQL / Preview Bridge
 * - On live production hosts (mahasangh.in), ALL reads/writes route 100% to HostKarle MySQL (/api/db/*).
 *   Firebase is COMPLETELY DISABLED on production domains even during transient network delays.
 * - Only inside AI Studio Preview / localhost (when MySQL is not configured) is read-safe,
 *   quota-capped Firebase Preview mode permitted.
 */

export type ActiveBackendMode = 'mysql' | 'mock';

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

export function getAuthSessionToken(): string {
  try {
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(AUTH_TOKEN_KEY) || '';
    }
  } catch {}
  return '';
}

export function setAuthSessionToken(token?: string | null): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (token && token.trim()) {
        sessionStorage.setItem(AUTH_TOKEN_KEY, token.trim());
      } else {
        sessionStorage.removeItem(AUTH_TOKEN_KEY);
      }
    }
  } catch {}
}

export function clearAuthSessionToken(): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {}
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function sqlApiRequest<T = any>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    cache: options?.cache ?? 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    let errMsg = `SQL API error (${res.status})`;
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


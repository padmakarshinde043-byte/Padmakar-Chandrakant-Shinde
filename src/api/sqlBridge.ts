import { isAiStudioPreviewHostname } from '../utils/previewFirebaseGuard';

/**
 * Transparent SQL / Preview Bridge
 * - On live production hosts (mahasangh.in), ALL reads/writes route 100% to HostKarle MySQL (/api/db/*).
 *   Firebase is COMPLETELY DISABLED on production domains even during transient network delays.
 * - Only inside AI Studio Preview / localhost (when MySQL is not configured) is read-safe,
 *   quota-capped Firebase Preview mode permitted.
 */

export type ActiveBackendMode = 'mysql' | 'firebase';

let resolvedMode: ActiveBackendMode | null = 'mysql';
let modeCheckPromise: Promise<ActiveBackendMode> | null = null;

export function isAiStudioPreviewEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return isAiStudioPreviewHostname(window.location.hostname);
}

export async function getActiveBackendMode(): Promise<ActiveBackendMode> {
  if (resolvedMode && resolvedMode === 'mysql') {
    // Verify async in background or return mysql
    return resolvedMode;
  }
  if (modeCheckPromise) return modeCheckPromise;

  const isPreview = isAiStudioPreviewEnvironment();

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

    resolvedMode = 'firebase';
    return 'firebase';
  })().finally(() => {
    modeCheckPromise = null;
  });

  return modeCheckPromise;
}

export async function isSqlBackendActive(): Promise<boolean> {
  return (await getActiveBackendMode()) === 'mysql';
}

export async function isFirebaseAllowedInCurrentEnvironment(): Promise<boolean> {
  if (!isAiStudioPreviewEnvironment()) return false;
  return !(await isSqlBackendActive());
}

export function isFirebaseAllowedSync(): boolean {
  return resolvedMode === 'firebase';
}

export async function sqlApiRequest<T = any>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    cache: options?.cache ?? 'no-store',
    headers: {
      'Content-Type': 'application/json',
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

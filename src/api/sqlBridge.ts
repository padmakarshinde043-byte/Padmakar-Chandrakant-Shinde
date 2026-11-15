/**
 * Transparent SQL / Firebase Runtime Bridge
 * Checks /api/db/mode once per session. When HostKarle MySQL is configured and active,
 * all reads/writes route cleanly to /api/db/* (ZERO Firebase quota/billing).
 * Until MySQL is configured, it defaults cleanly to 'firebase' so the site never breaks.
 */

export type ActiveBackendMode = 'mysql' | 'firebase';

let resolvedMode: ActiveBackendMode | null = null;
let modeCheckPromise: Promise<ActiveBackendMode> | null = null;

export async function getActiveBackendMode(): Promise<ActiveBackendMode> {
  if (resolvedMode) return resolvedMode;
  if (modeCheckPromise) return modeCheckPromise;

  modeCheckPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
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
      // Fallback safely to firebase if API route isn't reachable (e.g., pure static preview)
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

export async function sqlApiRequest<T = any>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...options,
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

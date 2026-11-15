export const PREVIEW_HEAVY_SCAN_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes cooldown for 1800-doc scans in AI Studio Preview
export const MAX_PREVIEW_READS_PER_DAY = 3500; // Hard cap (< 7% of Firebase 50k/day free Spark quota -> guaranteed ₹0 bill)
export const PREVIEW_BUDGET_STORAGE_KEY = 'mhs_preview_fb_budget_v1';

export interface PreviewFirebaseBudgetState {
  date: string;
  reads: number;
  lastHeavyScanByKey: Record<string, number>;
}

/**
 * Firebase fallback is ONLY allowed inside AI Studio Preview or local dev hosts.
 * Production domains (like mahasangh.in) NEVER touch Firebase under any circumstance.
 */
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

export function getTodayUtcDateStr(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function readPreviewBudgetState(nowMs: number = Date.now()): PreviewFirebaseBudgetState {
  const today = getTodayUtcDateStr(nowMs);
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(PREVIEW_BUDGET_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PreviewFirebaseBudgetState>;
        if (parsed && parsed.date === today) {
          return {
            date: today,
            reads: typeof parsed.reads === 'number' && parsed.reads >= 0 ? parsed.reads : 0,
            lastHeavyScanByKey:
              parsed.lastHeavyScanByKey && typeof parsed.lastHeavyScanByKey === 'object'
                ? parsed.lastHeavyScanByKey
                : {},
          };
        }
      }
    }
  } catch {}
  return { date: today, reads: 0, lastHeavyScanByKey: {} };
}

function writePreviewBudgetState(state: PreviewFirebaseBudgetState): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PREVIEW_BUDGET_STORAGE_KEY, JSON.stringify(state));
    }
  } catch {}
}

export function evaluatePreviewReadAllowance(params: {
  state: PreviewFirebaseBudgetState;
  scanKey?: string;
  isHeavyScan?: boolean;
  nowMs?: number;
  cooldownMs?: number;
  maxDailyReads?: number;
}): { allowed: boolean; reason?: 'daily_budget_reached' | 'cooldown_active' } {
  const nowMs = params.nowMs ?? Date.now();
  const maxDailyReads = params.maxDailyReads ?? MAX_PREVIEW_READS_PER_DAY;
  const cooldownMs = params.cooldownMs ?? PREVIEW_HEAVY_SCAN_COOLDOWN_MS;

  if (params.state.reads >= maxDailyReads) {
    return { allowed: false, reason: 'daily_budget_reached' };
  }

  if (params.isHeavyScan && params.scanKey) {
    const lastTs = Number(params.state.lastHeavyScanByKey?.[params.scanKey] || 0);
    if (lastTs > 0 && nowMs - lastTs < cooldownMs) {
      return { allowed: false, reason: 'cooldown_active' };
    }
  }

  return { allowed: true };
}

export function canUsePreviewRead(scanKey?: string, isHeavyScan = false): boolean {
  const state = readPreviewBudgetState();
  return evaluatePreviewReadAllowance({ state, scanKey, isHeavyScan }).allowed;
}

export function recordPreviewFirestoreReads(
  docCount: number,
  scanKey?: string,
  isHeavyScan = false
): void {
  const nowMs = Date.now();
  const state = readPreviewBudgetState(nowMs);
  const safeCount = Number.isFinite(docCount) && docCount > 0 ? Math.round(docCount) : 1;
  state.reads += safeCount;
  if (isHeavyScan && scanKey) {
    state.lastHeavyScanByKey = {
      ...state.lastHeavyScanByKey,
      [scanKey]: nowMs,
    };
  }
  writePreviewBudgetState(state);
}

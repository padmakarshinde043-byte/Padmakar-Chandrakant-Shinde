import { sqlApiRequest } from '../api/sqlBridge';
import {
  FEEDBACK_STORAGE_KEY,
  WebsiteFeedbackRecord,
  FeedbackAggregateSummary,
  computeFeedbackSummary,
  validateAndNormalizeFeedbackInput,
} from '../utils/feedbackAnalytics';

const LOCAL_FEEDBACK_CACHE_KEY = 'mahasangh_website_feedback_records_v1';

/**
 * Optional external webhook / Google Apps Script endpoint.
 * Set this URL if you also want to mirror submissions to Google Sheets / Google Forms.
 */
export const EXTERNAL_FEEDBACK_WEBHOOK_URL = '';

export function hasUserCompletedOrDismissedFeedback(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return Boolean(localStorage.getItem(FEEDBACK_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function markFeedbackPopupHandled(reason: 'submitted' | 'dismissed'): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(
        FEEDBACK_STORAGE_KEY,
        JSON.stringify({ status: reason, at: new Date().toISOString() })
      );
    }
  } catch {
    // Ignore storage restrictions in private browsing
  }
}

function readLocalFeedbackRecords(): WebsiteFeedbackRecord[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LOCAL_FEEDBACK_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalFeedbackRecords(records: WebsiteFeedbackRecord[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_FEEDBACK_CACHE_KEY, JSON.stringify(records.slice(0, 300)));
    }
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Clean submission handler that persists feedback to the website API (/api/db/feedback -> MySQL),
 * mirrors locally for instant Admin visibility in preview mode, and optionally forwards to an
 * external Google Sheet / Google Form endpoint if configured above.
 */
export async function submitWebsiteFeedbackToEndpoint(payload: {
  designRating: number;
  navigationRating: number;
  speedRating: number;
  mobileRating: number;
  overallRating: number;
  suggestion: string;
  pagePath?: string;
  deviceType?: 'mobile' | 'desktop' | 'unknown';
}): Promise<WebsiteFeedbackRecord> {
  const validated = validateAndNormalizeFeedbackInput(payload);
  if (!validated.valid || !validated.record) {
    throw new Error(validated.error || 'कृपया किमान एका मुद्द्यासाठी रेटिंग द्या.');
  }

  const record = validated.record;

  // 1. Persist to primary backend API (MySQL in production, server memory in preview)
  let savedOnServer = false;
  try {
    const res = await fetch('/api/db/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (res.ok) {
      savedOnServer = true;
    }
  } catch {
    // Fallback to local cache below
  }

  // 2. Keep local copy when running offline / preview fallback
  if (!savedOnServer) {
    const existing = readLocalFeedbackRecords();
    writeLocalFeedbackRecords([record, ...existing.filter((x) => x.id !== record.id)]);
  }

  // 3. Optional Google Sheet / Google Form Webhook hook (if user configures URL later)
  if (EXTERNAL_FEEDBACK_WEBHOOK_URL) {
    fetch(EXTERNAL_FEEDBACK_WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    }).catch(() => {});
  }

  return record;
}

export async function fetchWebsiteFeedbackForAdmin(): Promise<{
  items: WebsiteFeedbackRecord[];
  summary: FeedbackAggregateSummary;
}> {
  try {
    const res = await sqlApiRequest<{
      items: WebsiteFeedbackRecord[];
      summary?: FeedbackAggregateSummary;
    }>('/api/db/feedback');

    if (Array.isArray(res?.items)) {
      const localItems = readLocalFeedbackRecords();
      const seenIds = new Set(res.items.map((item) => item.id));
      const merged = [
        ...res.items,
        ...localItems.filter((item) => !seenIds.has(item.id)),
      ].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

      return {
        items: merged,
        summary: computeFeedbackSummary(merged),
      };
    }
  } catch {
    // Fallback to local records if server is unreachable
  }

  const localItems = readLocalFeedbackRecords();
  return {
    items: localItems,
    summary: computeFeedbackSummary(localItems),
  };
}

export async function deleteWebsiteFeedbackForAdmin(id: string): Promise<void> {
  try {
    await sqlApiRequest(`/api/db/feedback/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch {
    // Also purge local cache
  }

  const localItems = readLocalFeedbackRecords();
  writeLocalFeedbackRecords(localItems.filter((item) => item.id !== id));
}

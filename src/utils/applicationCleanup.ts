import { toEnglishDigits } from './formatters';

export interface MinimalApplicationRecord {
  id: string;
  docId?: string;
  applicationNumber?: string;
  memberNumber?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  status?: string;
  paymentConfirmed?: boolean;
  createdAt?: string;
  approvedAt?: string;
  updatedAt?: string;
}

export function normalizePhone10(phone?: string | null): string {
  if (!phone) return '';
  const digits = toEnglishDigits(String(phone)).replace(/\D/g, '');
  if (digits.length < 10) return digits;
  return digits.slice(-10);
}

export function normalizeEmail(email?: string | null): string {
  if (!email) return '';
  return String(email).trim().toLowerCase();
}

export function isSyntheticMahasanghEmail(email?: string | null): boolean {
  const clean = normalizeEmail(email);
  return !clean || clean.endsWith('@mahasangh.in');
}

/**
 * Only 'approved' and 'pending' applications are active and should block duplicate form submissions.
 * Rejected, deleted, or unknown/corrupt records MUST NEVER block a member from re-applying.
 */
export function isBlockingApplicationStatus(status?: string | null): boolean {
  const norm = String(status || '').trim().toLowerCase();
  return norm === 'approved' || norm === 'pending';
}

export function resolveAuthoritativeId(record: Partial<MinimalApplicationRecord>, firestoreDocId?: string): string {
  const docId = String(firestoreDocId || record.docId || '').trim();
  if (docId) return docId;
  return String(record.id || '').trim();
}

export function pickBestActiveApplication<T extends MinimalApplicationRecord>(
  records: T[]
): T | null {
  if (!Array.isArray(records) || records.length === 0) return null;
  const active = records.filter((r) => isBlockingApplicationStatus(r.status));
  if (active.length === 0) return null;

  const approved = active.find((r) => String(r.status || '').toLowerCase() === 'approved');
  if (approved) return approved;

  // Prefer most recently created/updated pending application
  const sortedPending = [...active].sort((a, b) => {
    const tA = new Date(a.updatedAt || a.createdAt || '').getTime() || 0;
    const tB = new Date(b.updatedAt || b.createdAt || '').getTime() || 0;
    return tB - tA;
  });
  return sortedPending[0] || null;
}

export function pickActiveDuplicateMatch<T extends MinimalApplicationRecord>(
  records: T[],
  params: { phone?: string; email?: string }
): { app: T; matchedBy: 'phone' | 'email' } | null {
  const cleanPhone = normalizePhone10(params.phone);
  if (cleanPhone.length === 10) {
    const phoneMatches = records.filter(
      (r) => isBlockingApplicationStatus(r.status) && normalizePhone10(r.phone) === cleanPhone
    );
    const bestPhone = pickBestActiveApplication(phoneMatches);
    if (bestPhone) {
      return { app: bestPhone, matchedBy: 'phone' };
    }
  }

  const cleanEmail = normalizeEmail(params.email);
  if (cleanEmail && !isSyntheticMahasanghEmail(cleanEmail)) {
    const emailMatches = records.filter(
      (r) =>
        isBlockingApplicationStatus(r.status) &&
        !isSyntheticMahasanghEmail(r.email) &&
        normalizeEmail(r.email) === cleanEmail
    );
    const bestEmail = pickBestActiveApplication(emailMatches);
    if (bestEmail) {
      return { app: bestEmail, matchedBy: 'email' };
    }
  }

  return null;
}

export interface DeleteTargetMeta {
  id: string;
  applicationNumber?: string;
  phone?: string;
  email?: string;
  status?: string;
}

/**
 * Determines whether a cached/state application item should be removed when `target` is deleted.
 * Always removes exact ID / applicationNumber matches, AND removes any non-approved ghost/duplicate
 * entries sharing the same phone or real email so re-applying is never blocked by stale cache.
 */
export function shouldRemoveFromCacheOnDelete(
  item: Partial<MinimalApplicationRecord> | null | undefined,
  target: DeleteTargetMeta,
  options?: { removeAllMatchingPhone?: boolean }
): boolean {
  if (!item) return false;
  const itemId = String(item.id || '').trim();
  const itemDocId = String(item.docId || '').trim();
  const targetId = String(target.id || '').trim();

  if (targetId && (itemId === targetId || itemDocId === targetId)) {
    return true;
  }

  const targetAppNo = toEnglishDigits(String(target.applicationNumber || '')).trim().toUpperCase();
  const itemAppNo = toEnglishDigits(String(item.applicationNumber || '')).trim().toUpperCase();
  if (targetAppNo && itemAppNo && targetAppNo === itemAppNo) {
    return true;
  }

  const targetPhone = normalizePhone10(target.phone);
  const itemPhone = normalizePhone10(item.phone);
  const samePhone = targetPhone.length === 10 && itemPhone === targetPhone;

  const targetEmail = normalizeEmail(target.email);
  const itemEmail = normalizeEmail(item.email);
  const sameRealEmail =
    Boolean(targetEmail) &&
    !isSyntheticMahasanghEmail(targetEmail) &&
    itemEmail === targetEmail;

  if (samePhone || sameRealEmail) {
    if (options?.removeAllMatchingPhone) return true;
    // Remove all non-approved (pending/rejected/deleted) copies sharing the contact
    if (String(item.status || '').toLowerCase() !== 'approved') {
      return true;
    }
  }

  return false;
}

export interface PurgeClassificationResult<T extends MinimalApplicationRecord> {
  toDelete: Array<{ docId: string; reason: 'rejected_or_deleted' | 'corrupt_or_empty' | 'duplicate_pending_ghost'; record: T }>;
  rejectedOrDeletedCount: number;
  corruptCount: number;
  duplicateGhostCount: number;
  keptIds: Set<string>;
}

/**
 * Identifies leftover/ghost/rejected/corrupt records in Firestore `applications`
 * that should be permanently purged while preserving all valid approved members
 * and at most 1 latest valid unpaid pending application per phone (when not already approved).
 */
export function classifyGhostApplicationsToPurge<T extends MinimalApplicationRecord>(
  records: T[]
): PurgeClassificationResult<T> {
  const toDelete: PurgeClassificationResult<T>['toDelete'] = [];
  const keptIds = new Set<string>();
  const deleteIds = new Set<string>();

  let rejectedOrDeletedCount = 0;
  let corruptCount = 0;
  let duplicateGhostCount = 0;

  const approvedPhones = new Set<string>();
  const pendingByPhone = new Map<string, T[]>();

  for (const rec of records) {
    const docId = resolveAuthoritativeId(rec, rec.docId);
    const status = String(rec.status || '').trim().toLowerCase();
    const cleanPhone = normalizePhone10(rec.phone);
    const cleanName = String(rec.fullName || '').trim();

    if (status === 'rejected' || status === 'deleted' || (status !== 'approved' && status !== 'pending')) {
      deleteIds.add(docId);
      toDelete.push({ docId, reason: 'rejected_or_deleted', record: rec });
      rejectedOrDeletedCount++;
      continue;
    }

    if (!cleanName || cleanPhone.length < 10) {
      deleteIds.add(docId);
      toDelete.push({ docId, reason: 'corrupt_or_empty', record: rec });
      corruptCount++;
      continue;
    }

    if (status === 'approved') {
      approvedPhones.add(cleanPhone);
      keptIds.add(docId);
    } else if (status === 'pending') {
      const existing = pendingByPhone.get(cleanPhone) || [];
      existing.push(rec);
      pendingByPhone.set(cleanPhone, existing);
    }
  }

  for (const [phone, pendingList] of pendingByPhone.entries()) {
    if (approvedPhones.has(phone)) {
      // Member is already approved -> all extra pending docs for this phone are leftover ghosts
      for (const rec of pendingList) {
        const docId = resolveAuthoritativeId(rec, rec.docId);
        if (!deleteIds.has(docId)) {
          deleteIds.add(docId);
          toDelete.push({ docId, reason: 'duplicate_pending_ghost', record: rec });
          duplicateGhostCount++;
        }
      }
      continue;
    }

    // Multiple pending docs for same phone: keep only the newest one, mark older ones as ghosts
    const sorted = [...pendingList].sort((a, b) => {
      const tA = new Date(a.updatedAt || a.createdAt || '').getTime() || 0;
      const tB = new Date(b.updatedAt || b.createdAt || '').getTime() || 0;
      return tB - tA;
    });

    const [newest, ...olderGhosts] = sorted;
    if (newest) {
      keptIds.add(resolveAuthoritativeId(newest, newest.docId));
    }
    for (const ghost of olderGhosts) {
      const docId = resolveAuthoritativeId(ghost, ghost.docId);
      if (!deleteIds.has(docId)) {
        deleteIds.add(docId);
        toDelete.push({ docId, reason: 'duplicate_pending_ghost', record: ghost });
        duplicateGhostCount++;
      }
    }
  }

  return {
    toDelete,
    rejectedOrDeletedCount,
    corruptCount,
    duplicateGhostCount,
    keptIds,
  };
}

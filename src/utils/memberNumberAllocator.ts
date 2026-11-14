import { formatSequentialMemberNumber } from '../data/mahasanghData';

export const DEFAULT_COUNTER_BASELINE = 71;

/**
 * Safely parses the trailing sequence number from any memberNumber string.
 * Supports 4, 5, or more digits (e.g., "MS/2026/BEED/1177" -> 1177, "MS/2026/NASH/10025" -> 10025).
 * Avoids the old `.slice(-4)` bug that truncated numbers >= 10000.
 */
export function parseMemberNumberSeq(memberNumber?: string | null): number {
  if (!memberNumber) return 0;
  const normalized = String(memberNumber).trim();
  if (!normalized) return 0;

  // Prefer the trailing digits after the last slash (standard MS/YYYY/DIST/NNNN format)
  const slashMatch = normalized.match(/\/(\d+)$/);
  if (slashMatch) {
    const val = parseInt(slashMatch[1], 10);
    return Number.isFinite(val) && val > 0 ? val : 0;
  }

  // Fallback: last contiguous numeric group
  const trailingMatch = normalized.match(/(\d+)$/);
  if (trailingMatch) {
    const val = parseInt(trailingMatch[1], 10);
    return Number.isFinite(val) && val > 0 ? val : 0;
  }

  return 0;
}

/**
 * Finds the highest existing sequential number across a collection of member records.
 */
export function extractHighestMemberSeq(
  records: Array<{ memberNumber?: string | null }> | null | undefined
): number {
  if (!Array.isArray(records) || records.length === 0) return 0;
  let maxSeq = 0;
  for (const rec of records) {
    const seq = parseMemberNumberSeq(rec?.memberNumber);
    if (seq > maxSeq) maxSeq = seq;
  }
  return maxSeq;
}

/**
 * Computes the next strictly-increasing sequence number that is guaranteed to be
 * above the central counter, above any known existing record, and above the baseline.
 */
export function computeNextSafeSeq(params: {
  counterSeq?: number | null;
  highestExistingSeq?: number | null;
  minBaseline?: number;
}): number {
  const baseline = params.minBaseline ?? DEFAULT_COUNTER_BASELINE;
  const cSeq = typeof params.counterSeq === 'number' && Number.isFinite(params.counterSeq) && params.counterSeq > 0
    ? Math.floor(params.counterSeq)
    : 0;
  const hSeq =
    typeof params.highestExistingSeq === 'number' &&
    Number.isFinite(params.highestExistingSeq) &&
    params.highestExistingSeq > 0
      ? Math.floor(params.highestExistingSeq)
      : 0;

  const currentFloor = Math.max(cSeq, hSeq, baseline);
  return currentFloor + 1;
}

/**
 * Normalizes a member number for case/whitespace-insensitive equality checks.
 */
export function normalizeMemberNumberKey(memberNumber?: string | null): string {
  return String(memberNumber || '').trim().toUpperCase();
}

/**
 * Builds the next candidate member number for a district and sequence index.
 */
export function buildSequentialMemberNumber(district: string | undefined, seq: number): string {
  return formatSequentialMemberNumber(district || 'MAHA', seq);
}

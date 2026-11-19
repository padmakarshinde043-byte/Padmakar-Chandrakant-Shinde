/**
 * Member Salutation Normalization & Automatic Gender Derivation Helpers
 * - श्री / श्री. -> पुरुष
 * - सौ / सौ. / श्रीमती / कुमारी / कु. -> स्त्री
 */
import type { MembershipApplication } from '../data/mahasanghData';

export type MemberGender = 'पुरुष' | 'स्त्री' | '';

export const STANDARD_SALUTATIONS = ['श्री', 'सौ', 'श्रीमती', 'कुमारी', 'डॉ'] as const;

const MALE_SALUTATION_TOKENS = new Set([
  'श्री',
  'श्रीमान',
  'मा.श्री',
  'mr',
  'shri',
  'shree',
]);

const FEMALE_SALUTATION_TOKENS = new Set([
  'सौ',
  'श्रीमती',
  'श्रीम',
  'कुमारी',
  'कु',
  'सुश्री',
  'सौभाग्यवती',
  'मा.सौ',
  'मा.श्रीमती',
  'mrs',
  'ms',
  'miss',
  'smt',
  'sau',
  'kumari',
  'kum',
]);

function cleanToken(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/[\.\s,]+$/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/**
 * Normalizes dotted/legacy salutation strings to standard clean Marathi tokens
 * (e.g. "श्री." -> "श्री", "सौ." -> "सौ", "कु." -> "कुमारी", "डॉ." -> "डॉ").
 * Preserves empty string "" when salutation is missing so admins can detect and edit it.
 */
export function normalizeSalutation(raw?: string | null): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const token = cleanToken(trimmed);
  if (token === 'श्री' || token === 'श्रीमान' || token === 'mr' || token === 'shri' || token === 'shree') {
    return 'श्री';
  }
  if (token === 'सौ' || token === 'सौभाग्यवती' || token === 'sau') {
    return 'सौ';
  }
  if (token === 'श्रीमती' || token === 'श्रीम' || token === 'smt' || token === 'mrs') {
    return 'श्रीमती';
  }
  if (token === 'कुमारी' || token === 'कु' || token === 'सुश्री' || token === 'kumari' || token === 'kum' || token === 'ms' || token === 'miss') {
    return 'कुमारी';
  }
  if (token === 'डॉ' || token === 'डॉक्टर' || token === 'dr') {
    return 'डॉ';
  }
  return trimmed.replace(/\.+$/g, '');
}

/**
 * Derives gender directly from a salutation string.
 * - श्री -> पुरुष
 * - सौ / श्रीमती / कुमारी / कु -> स्त्री
 * - डॉ or empty -> ''
 */
export function deriveGenderFromSalutation(salutation?: string | null): MemberGender {
  const token = cleanToken(String(salutation || ''));
  if (!token) return '';
  if (MALE_SALUTATION_TOKENS.has(token)) return 'पुरुष';
  if (FEMALE_SALUTATION_TOKENS.has(token)) return 'स्त्री';
  return '';
}

/**
 * Extracts a leading salutation token embedded inside fullName (for legacy rows where salutation column was empty).
 */
export function extractSalutationFromFullName(fullName?: string | null): string {
  const raw = String(fullName || '').trim();
  if (!raw) return '';
  const match = raw.match(/^(श्रीमान|श्रीमती|श्रीम|कुमारी|सुश्री|सौ|श्री|कु|डॉ|Mr|Mrs|Ms|Miss|Smt|Shri|Shree|Sau|Kumari|Dr)\.?(?:\s+|$)/i);
  if (!match) return '';
  return normalizeSalutation(match[1]);
}

/**
 * Resolves a member's gender consistently for both Admin Panel and State President exports:
 * 1. Explicit salutation (`श्री` -> `पुरुष`; `सौ`, `श्रीमती`, `कुमारी` -> `स्त्री`) always takes top priority
 *    so editing a member's salutation in Member Edit immediately reflects in Excel exports.
 * 2. Explicit stored `gender` field (`पुरुष` / `स्त्री`) — used for `डॉ` or manually set entries.
 * 3. Fallback: leading salutation prefix inside `fullName` when salutation column was left blank.
 */
export function resolveMemberGender(
  member: Pick<MembershipApplication, 'salutation' | 'fullName' | 'gender'>
): MemberGender {
  const fromSalutation = deriveGenderFromSalutation(member.salutation);
  if (fromSalutation) return fromSalutation;

  const stored = String(member.gender || '').trim();
  if (stored === 'पुरुष' || stored === 'Male' || stored === 'male') return 'पुरुष';
  if (stored === 'स्त्री' || stored === 'Female' || stored === 'female') return 'स्त्री';

  const embeddedSalutation = extractSalutationFromFullName(member.fullName);
  if (embeddedSalutation) {
    return deriveGenderFromSalutation(embeddedSalutation);
  }

  return '';
}

/**
 * Resolves the effective salutation for display (prefers explicit salutation; falls back to embedded prefix in fullName).
 */
export function resolveEffectiveSalutation(
  member: Pick<MembershipApplication, 'salutation' | 'fullName'>
): string {
  const normalized = normalizeSalutation(member.salutation);
  if (normalized) return normalized;
  return extractSalutationFromFullName(member.fullName);
}

/**
 * Formats full name cleanly with salutation without duplicating prefix (e.g. avoids "श्री श्री राजेश पाटील").
 */
export function formatMemberDisplayName(salutation?: string | null, fullName?: string | null): string {
  const rawName = String(fullName || '').trim();
  const normSal = normalizeSalutation(salutation);
  if (!normSal) return rawName || '-';
  if (!rawName) return normSal;

  const embedded = extractSalutationFromFullName(rawName);
  if (embedded) {
    // Strip the leading salutation from fullName and prepend the authoritative salutation
    const stripped = rawName
      .replace(/^(श्रीमान|श्रीमती|श्रीम|कुमारी|सुश्री|सौ|श्री|कु|डॉ|Mr|Mrs|Ms|Miss|Smt|Shri|Shree|Sau|Kumari|Dr)\.?\s+/i, '')
      .trim();
    return stripped ? `${normSal} ${stripped}` : normSal;
  }

  return `${normSal} ${rawName}`.trim();
}

/**
 * Returns true if the member's salutation is missing or gender cannot yet be determined
 * (used by Admin Panel Member Edit quick filter so admin can fix missing श्री/सौ/श्रीमती/कुमारी in seconds).
 */
export function isMissingSalutationOrGender(
  member: Pick<MembershipApplication, 'salutation' | 'fullName' | 'gender'>
): boolean {
  const hasSal = Boolean(normalizeSalutation(member.salutation));
  const hasGender = Boolean(resolveMemberGender(member));
  return !hasSal || !hasGender;
}

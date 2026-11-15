import { MembershipApplication, formatSequentialMemberNumber } from '../data/mahasanghData';
import { parseMemberNumberSeq } from './memberNumberAllocator';

export interface RegisteredMemberItem {
  id: string;
  srNo: number;
  memberNumber: string;
  fullName: string;
  taluka: string;
  centerName?: string;
  district: string;
  designation?: string;
  phone?: string;
  approvedAt?: string;
}

export type DirectorySortOrder = 'asc' | 'desc';

export function isApprovedMemberRecord(app: Partial<MembershipApplication> | null | undefined): boolean {
  if (!app) return false;
  const isApprovedStatus =
    app.status === 'approved' ||
    (typeof app.status === 'string' && app.status.toLowerCase() === 'approved');
  const hasMemberNumber = Boolean(app.memberNumber && app.memberNumber.trim() !== '');
  const hasApprovedAt = Boolean(app.approvedAt && String(app.approvedAt).trim() !== '');
  return isApprovedStatus || hasMemberNumber || hasApprovedAt;
}

export function stripHeavyApplicationFields(app: MembershipApplication): MembershipApplication {
  if (!app) return app;
  const { photo, ...rest } = app as MembershipApplication & { extra_json?: unknown };
  if ('extra_json' in rest) {
    delete (rest as Record<string, unknown>).extra_json;
  }
  if (photo && !photo.startsWith('data:image') && photo.length <= 500) {
    return { ...rest, photo };
  }
  return rest;
}

export function buildRegisteredMemberItems(
  activeApplications: MembershipApplication[],
  sortOrder: DirectorySortOrder = 'asc'
): RegisteredMemberItem[] {
  const approvedOnly = activeApplications.filter(isApprovedMemberRecord);

  // Sort ascending by sequential member number (fixes .slice(-4) bugs on short numbers like MS/2026/42),
  // then fallback cleanly to approval / creation timestamp.
  approvedOnly.sort((a, b) => {
    const seqA = parseMemberNumberSeq(a.memberNumber);
    const seqB = parseMemberNumberSeq(b.memberNumber);
    if (seqA > 0 && seqB > 0 && seqA !== seqB) {
      return seqA - seqB;
    }
    if (seqA > 0 && seqB === 0) return -1;
    if (seqB > 0 && seqA === 0) return 1;

    const dateA = new Date(a.approvedAt || a.createdAt || '').getTime() || 0;
    const dateB = new Date(b.approvedAt || b.createdAt || '').getTime() || 0;
    return dateA - dateB;
  });

  const ascendingItems: RegisteredMemberItem[] = approvedOnly.map((app, index) => {
    const srNo = index + 1;
    const memberNumber =
      app.memberNumber && app.memberNumber.trim() !== ''
        ? app.memberNumber.trim()
        : formatSequentialMemberNumber(app.district || 'MAHA', srNo);

    const designation =
      app.isOfficial && app.officialPost
        ? app.officialPost.replace(/[⭐*★]/g, '').trim()
        : (app.professional || 'केंद्रप्रमुख').replace(/[⭐*★]/g, '').trim();

    const talukaName = app.taluka || app.officialTaluka || '-';

    return {
      id: app.id || `app-${srNo}`,
      srNo,
      memberNumber,
      fullName: `${app.salutation ? app.salutation + ' ' : ''}${app.fullName || ''}`.trim(),
      taluka: talukaName,
      centerName: app.centerName,
      district: app.district || app.officialDistrict || '-',
      designation,
      phone: app.phone,
      approvedAt: app.approvedAt || app.createdAt,
    };
  });

  if (sortOrder === 'desc') {
    return [...ascendingItems].reverse();
  }
  return ascendingItems;
}

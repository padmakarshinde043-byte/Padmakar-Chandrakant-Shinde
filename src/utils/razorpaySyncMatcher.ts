import { MembershipApplication } from '../data/mahasanghData';
import {
  normalizePhone10,
  normalizeEmail,
  isSyntheticMahasanghEmail,
} from './applicationCleanup';

export interface RazorpayApiPaymentLike {
  id: string;
  order_id?: string | null;
  status?: string;
  captured?: boolean;
  amount?: number | string;
  amount_refunded?: number | string;
  contact?: string | number | null;
  email?: string | null;
  method?: string | null;
  created_at?: number;
  notes?: Record<string, any> | any[] | null;
}

export type RazorpayMatchBy = 'order_id' | 'application_id' | 'phone' | 'email';

export interface RazorpaySyncMatch {
  app: MembershipApplication;
  paymentId: string;
  orderId: string;
  amountRupees: number;
  paidAtIso: string;
  method: string;
  contact: string;
  email: string;
  matchBy: RazorpayMatchBy;
}

export interface MatchRazorpayPaymentsResult {
  matches: RazorpaySyncMatch[];
  scannedPaymentsCount: number;
  capturedPaymentsCount: number;
  pendingCheckedCount: number;
  skippedAlreadyUsedCount: number;
}

function getNotesObj(notes: RazorpayApiPaymentLike['notes']): Record<string, string> {
  if (!notes || Array.isArray(notes) || typeof notes !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(notes)) {
    if (v !== undefined && v !== null) {
      out[k] = String(v).trim();
    }
  }
  return out;
}

/**
 * Matches captured Razorpay payments (>= minAmountPaise) against pending membership applications.
 * Prevents double-matching already approved payment IDs, failed/refunded payments, or synthetic emails.
 */
export function matchRazorpayPaymentsWithPendingApps(params: {
  payments: RazorpayApiPaymentLike[];
  applications: MembershipApplication[];
  minAmountPaise?: number;
}): MatchRazorpayPaymentsResult {
  const minAmountPaise = params.minAmountPaise ?? 22000;
  const allApps = Array.isArray(params.applications) ? params.applications : [];
  const allPayments = Array.isArray(params.payments) ? params.payments : [];

  const usedPaymentIds = new Set<string>();
  for (const app of allApps) {
    if (app.status === 'approved') {
      const p1 = String(app.razorpayPaymentId || '').trim();
      const p2 = String(app.paymentRef || '').trim();
      if (p1) usedPaymentIds.add(p1);
      if (p2) usedPaymentIds.add(p2);
    }
  }

  let capturedPaymentsCount = 0;
  let skippedAlreadyUsedCount = 0;
  const eligiblePayments: RazorpayApiPaymentLike[] = [];

  for (const p of allPayments) {
    if (!p || !p.id) continue;
    const isCaptured = String(p.status || '').toLowerCase() === 'captured' || p.captured === true;
    if (!isCaptured) continue;

    const grossPaise = Number(p.amount || 0);
    const refundedPaise = Number(p.amount_refunded || 0);
    const netPaise = grossPaise - refundedPaise;
    if (!Number.isFinite(netPaise) || netPaise < minAmountPaise) continue;

    capturedPaymentsCount++;
    if (usedPaymentIds.has(String(p.id).trim())) {
      skippedAlreadyUsedCount++;
      continue;
    }
    eligiblePayments.push(p);
  }

  // Prefer newest payments first
  eligiblePayments.sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));

  // Only inspect pending applications, newest first so active registration wins over old abandoned draft
  const pendingApps = allApps
    .filter((a) => a && a.status === 'pending')
    .sort((a, b) => {
      const da = new Date(b.createdAt || '').getTime() || 0;
      const db = new Date(a.createdAt || '').getTime() || 0;
      return da - db;
    });

  const claimedAppIds = new Set<string>();
  const claimedPaymentIds = new Set<string>();
  const matches: RazorpaySyncMatch[] = [];

  const recordMatch = (app: MembershipApplication, payment: RazorpayApiPaymentLike, matchBy: RazorpayMatchBy) => {
    const paymentId = String(payment.id).trim();
    claimedAppIds.add(app.id);
    claimedPaymentIds.add(paymentId);

    const grossPaise = Number(payment.amount || 0);
    const createdSec = Number(payment.created_at || 0);
    const notes = getNotesObj(payment.notes);

    matches.push({
      app,
      paymentId,
      orderId: String(payment.order_id || app.razorpayOrderId || ''),
      amountRupees: Number((grossPaise / 100).toFixed(2)),
      paidAtIso: createdSec > 0 ? new Date(createdSec * 1000).toISOString() : '',
      method: String(payment.method || '').toUpperCase(),
      contact: String(payment.contact || notes.phone || ''),
      email: String(payment.email || notes.email || ''),
      matchBy,
    });
  };

  // Pass 1: Highest-confidence match (exact order_id or notes.applicationId)
  for (const payment of eligiblePayments) {
    if (claimedPaymentIds.has(String(payment.id).trim())) continue;
    const notes = getNotesObj(payment.notes);
    const payOrderId = String(payment.order_id || '').trim();
    const noteAppId = String(notes.applicationId || '').trim();

    if (payOrderId) {
      const byOrder = pendingApps.find(
        (a) => !claimedAppIds.has(a.id) && String(a.razorpayOrderId || '').trim() === payOrderId
      );
      if (byOrder) {
        recordMatch(byOrder, payment, 'order_id');
        continue;
      }
    }

    if (noteAppId) {
      const byAppId = pendingApps.find(
        (a) => !claimedAppIds.has(a.id) && String(a.id).trim() === noteAppId
      );
      if (byAppId) {
        recordMatch(byAppId, payment, 'application_id');
      }
    }
  }

  // Pass 2: 10-digit normalized phone match
  for (const payment of eligiblePayments) {
    if (claimedPaymentIds.has(String(payment.id).trim())) continue;
    const notes = getNotesObj(payment.notes);
    const payPhone = normalizePhone10(String(payment.contact || notes.phone || ''));
    const altNotePhone = normalizePhone10(notes.phone);
    if (payPhone.length !== 10 && altNotePhone.length !== 10) continue;

    const byPhone = pendingApps.find((a) => {
      if (claimedAppIds.has(a.id)) return false;
      const appPhone = normalizePhone10(a.phone);
      if (appPhone.length !== 10) return false;
      return appPhone === payPhone || (altNotePhone.length === 10 && appPhone === altNotePhone);
    });
    if (byPhone) {
      recordMatch(byPhone, payment, 'phone');
    }
  }

  // Pass 3: Non-synthetic real email match
  for (const payment of eligiblePayments) {
    if (claimedPaymentIds.has(String(payment.id).trim())) continue;
    const notes = getNotesObj(payment.notes);
    const payEmail = normalizeEmail(String(payment.email || ''));
    const noteEmail = normalizeEmail(notes.email);

    const candidates = [payEmail, noteEmail].filter((em) => em && !isSyntheticMahasanghEmail(em));
    if (candidates.length === 0) continue;

    const byEmail = pendingApps.find((a) => {
      if (claimedAppIds.has(a.id)) return false;
      const appEmail = normalizeEmail(a.email);
      if (!appEmail || isSyntheticMahasanghEmail(appEmail)) return false;
      return candidates.includes(appEmail);
    });
    if (byEmail) {
      recordMatch(byEmail, payment, 'email');
    }
  }

  return {
    matches,
    scannedPaymentsCount: allPayments.length,
    capturedPaymentsCount,
    pendingCheckedCount: pendingApps.length,
    skippedAlreadyUsedCount,
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRazorpayPaymentsWithPendingApps } from './razorpaySyncMatcher';
import { MembershipApplication } from '../data/mahasanghData';

function makeApp(overrides: Partial<MembershipApplication> = {}): MembershipApplication {
  return {
    id: 'app-1',
    applicationNumber: 'APP-2026-001',
    salutation: 'श्री.',
    fullName: 'टेस्ट सदस्य',
    phone: '9876543210',
    email: 'member@example.com',
    address: 'पुणे',
    district: 'पुणे',
    education: 'MA',
    professional: 'केंद्रप्रमुख',
    status: 'pending',
    createdAt: '2026-11-18T10:00:00.000Z',
    ...overrides,
  };
}

test('matches captured >=220 payments by order_id, application_id, phone, and email in priority order', () => {
  const apps: MembershipApplication[] = [
    makeApp({ id: 'app-order', phone: '9000000001', email: 'a@test.com', razorpayOrderId: 'order_exact_1' }),
    makeApp({ id: 'app-note', phone: '9000000002', email: 'b@test.com' }),
    makeApp({ id: 'app-phone', phone: '9822001122', email: '9822001122@mahasangh.in' }),
    makeApp({ id: 'app-email', phone: '9000000004', email: 'RealUser@Gmail.com' }),
    makeApp({ id: 'app-approved', status: 'approved', phone: '9999999999', razorpayPaymentId: 'pay_already_used' }),
  ];

  const payments = [
    { id: 'pay_failed', status: 'failed', amount: 22000, contact: '+919822001122' },
    { id: 'pay_refunded', status: 'captured', amount: 22000, amount_refunded: 22000, contact: '+919822001122' },
    { id: 'pay_small', status: 'captured', amount: 10000, contact: '+919822001122' },
    { id: 'pay_already_used', status: 'captured', amount: 22000, contact: '+919999999999' },
    { id: 'pay_1', order_id: 'order_exact_1', status: 'captured', amount: 22000, contact: '+919000000001', method: 'upi', created_at: 1760000100 },
    { id: 'pay_2', order_id: 'order_2', status: 'captured', amount: 22000, notes: { applicationId: 'app-note' }, method: 'card', created_at: 1760000200 },
    { id: 'pay_3', order_id: 'order_3', status: 'captured', amount: 22000, contact: '+91 9822001122', email: 'void@razorpay.com', created_at: 1760000300 },
    { id: 'pay_4', order_id: 'order_4', status: 'captured', amount: 22000, contact: '+917777777777', email: 'realuser@gmail.com', created_at: 1760000400 },
  ];

  const res = matchRazorpayPaymentsWithPendingApps({ payments, applications: apps });
  assert.equal(res.scannedPaymentsCount, 8);
  assert.equal(res.capturedPaymentsCount, 5);
  assert.equal(res.skippedAlreadyUsedCount, 1);
  assert.equal(res.pendingCheckedCount, 4);
  assert.equal(res.matches.length, 4);

  const byId = Object.fromEntries(res.matches.map((m) => [m.app.id, m]));
  assert.equal(byId['app-order'].matchBy, 'order_id');
  assert.equal(byId['app-order'].paymentId, 'pay_1');
  assert.equal(byId['app-note'].matchBy, 'application_id');
  assert.equal(byId['app-note'].paymentId, 'pay_2');
  assert.equal(byId['app-phone'].matchBy, 'phone');
  assert.equal(byId['app-phone'].paymentId, 'pay_3');
  assert.equal(byId['app-email'].matchBy, 'email');
  assert.equal(byId['app-email'].paymentId, 'pay_4');
  assert.equal(byId['app-email'].amountRupees, 220);
});

test('never matches synthetic mahasangh.in emails or claims the same payment twice', () => {
  const apps: MembershipApplication[] = [
    makeApp({ id: 'old-dup', phone: '9811111111', email: '9811111111@mahasangh.in', createdAt: '2026-11-01T00:00:00Z' }),
    makeApp({ id: 'new-dup', phone: '9811111111', email: '9811111111@mahasangh.in', createdAt: '2026-11-10T00:00:00Z' }),
    makeApp({ id: 'other', phone: '9833333333', email: '9811111111@mahasangh.in', createdAt: '2026-11-11T00:00:00Z' }),
  ];

  const payments = [
    { id: 'pay_single', status: 'captured', amount: 22000, contact: '9811111111', email: '9811111111@mahasangh.in', created_at: 1760000500 },
  ];

  const res = matchRazorpayPaymentsWithPendingApps({ payments, applications: apps });
  assert.equal(res.matches.length, 1);
  // Newest pending app wins when duplicates exist
  assert.equal(res.matches[0].app.id, 'new-dup');
});

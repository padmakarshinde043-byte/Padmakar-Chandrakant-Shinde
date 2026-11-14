import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhone10,
  isBlockingApplicationStatus,
  pickActiveDuplicateMatch,
  shouldRemoveFromCacheOnDelete,
  classifyGhostApplicationsToPurge,
} from './applicationCleanup';

test('normalizePhone10 strips country codes, Marathi digits, and spaces cleanly', () => {
  assert.equal(normalizePhone10('+91 98765 43210'), '9876543210');
  assert.equal(normalizePhone10('९८७६५४३२१०'), '9876543210');
  assert.equal(normalizePhone10('09876543210'), '9876543210');
  assert.equal(normalizePhone10(''), '');
});

test('isBlockingApplicationStatus only blocks approved and pending, never rejected or deleted', () => {
  assert.equal(isBlockingApplicationStatus('approved'), true);
  assert.equal(isBlockingApplicationStatus('pending'), true);
  assert.equal(isBlockingApplicationStatus('rejected'), false);
  assert.equal(isBlockingApplicationStatus('deleted'), false);
  assert.equal(isBlockingApplicationStatus(''), false);
  assert.equal(isBlockingApplicationStatus(undefined), false);
});

test('pickActiveDuplicateMatch ignores rejected/deleted records and never collides on fullName alone', () => {
  const docs = [
    {
      id: 'rej-1',
      fullName: 'अमोल राजेश पाटील',
      phone: '9876543210',
      email: 'amol@gmail.com',
      status: 'rejected',
    },
    {
      id: 'other-same-name',
      fullName: 'अमोल राजेश पाटील',
      phone: '9999988888',
      email: 'other@gmail.com',
      status: 'approved',
    },
  ];

  // Re-applying with previously rejected phone & email (even though someone else shares same Marathi name) MUST be allowed
  const result = pickActiveDuplicateMatch(docs, {
    phone: '9876543210',
    email: 'amol@gmail.com',
  });
  assert.equal(result, null);

  // Active pending match by phone still blocks
  const activeDocs = [
    ...docs,
    {
      id: 'pend-1',
      fullName: 'अमोल राजेश पाटील',
      phone: '9876543210',
      email: 'amol@gmail.com',
      status: 'pending',
    },
  ];
  const pendingMatch = pickActiveDuplicateMatch(activeDocs, {
    phone: '9876543210',
    email: 'different@gmail.com',
  });
  assert.equal(pendingMatch?.app.id, 'pend-1');
  assert.equal(pendingMatch?.matchedBy, 'phone');

  // Synthetic @mahasangh.in email never causes false email duplicate
  const syntheticMatch = pickActiveDuplicateMatch(
    [
      {
        id: 'app-syn',
        fullName: 'टेस्ट सदस्य',
        phone: '1111122222',
        email: '1111122222@mahasangh.in',
        status: 'approved',
      },
    ],
    {
      phone: '3333344444',
      email: '1111122222@mahasangh.in',
    }
  );
  assert.equal(syntheticMatch, null);
});

test('shouldRemoveFromCacheOnDelete removes matching id, applicationNumber, and non-approved contact ghosts while keeping separate approved records safe', () => {
  const target = {
    id: 'pend-2',
    applicationNumber: 'MS-2026-4455',
    phone: '9876543210',
    email: 'user@gmail.com',
    status: 'pending',
  };

  assert.equal(shouldRemoveFromCacheOnDelete({ id: 'pend-2' }, target), true);
  assert.equal(shouldRemoveFromCacheOnDelete({ id: 'other', docId: 'pend-2' }, target), true);
  assert.equal(
    shouldRemoveFromCacheOnDelete({ id: 'old', applicationNumber: 'ms-2026-4455' }, target),
    true
  );
  // Another pending ghost for same phone is also removed
  assert.equal(
    shouldRemoveFromCacheOnDelete({ id: 'pend-old', phone: '9876543210', status: 'pending' }, target),
    true
  );
  // A distinct approved record with same phone stays safe unless removeAllMatchingPhone is explicitly true
  assert.equal(
    shouldRemoveFromCacheOnDelete({ id: 'app-valid', phone: '9876543210', status: 'approved' }, target),
    false
  );
  assert.equal(
    shouldRemoveFromCacheOnDelete(
      { id: 'app-valid', phone: '9876543210', status: 'approved' },
      target,
      { removeAllMatchingPhone: true }
    ),
    true
  );
});

test('classifyGhostApplicationsToPurge deletes rejected, deleted, corrupt, and duplicate pending ghost records cleanly', () => {
  const records = [
    { id: 'doc-approved', fullName: 'श्री अ ब क', phone: '9000000001', status: 'approved', createdAt: '2026-01-01T10:00:00Z' },
    { id: 'doc-pending-ghost-for-approved', fullName: 'श्री अ ब क', phone: '9000000001', status: 'pending', createdAt: '2026-01-01T09:00:00Z' },
    { id: 'doc-rejected', fullName: 'श्री ड इ फ', phone: '9000000002', status: 'rejected', createdAt: '2026-01-02T10:00:00Z' },
    { id: 'doc-deleted', fullName: 'श्री ग ह ज', phone: '9000000003', status: 'deleted', createdAt: '2026-01-03T10:00:00Z' },
    { id: 'doc-corrupt', fullName: '', phone: '123', status: 'pending', createdAt: '2026-01-04T10:00:00Z' },
    { id: 'doc-pend-old', fullName: 'श्री क ख ग', phone: '9000000004', status: 'pending', createdAt: '2026-01-05T08:00:00Z' },
    { id: 'doc-pend-new', fullName: 'श्री क ख ग', phone: '9000000004', status: 'pending', createdAt: '2026-01-05T12:00:00Z' },
  ];

  const result = classifyGhostApplicationsToPurge(records);
  const deletedIds = new Set(result.toDelete.map((d) => d.docId));

  assert.equal(result.rejectedOrDeletedCount, 2);
  assert.equal(result.corruptCount, 1);
  assert.equal(result.duplicateGhostCount, 2);
  assert.deepEqual([...deletedIds].sort(), [
    'doc-corrupt',
    'doc-deleted',
    'doc-pend-old',
    'doc-pending-ghost-for-approved',
    'doc-rejected',
  ]);
  assert.equal(result.keptIds.has('doc-approved'), true);
  assert.equal(result.keptIds.has('doc-pend-new'), true);
  assert.equal(result.keptIds.size, 2);
});

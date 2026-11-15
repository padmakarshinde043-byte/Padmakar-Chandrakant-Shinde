import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRegisteredMemberItems,
  stripHeavyApplicationFields,
} from './directoryHelper';
import { MembershipApplication } from '../data/mahasanghData';

function makeApp(overrides: Partial<MembershipApplication>): MembershipApplication {
  return {
    id: 'app-1',
    applicationNumber: 'APP-1',
    salutation: 'श्री.',
    fullName: 'टेस्ट सदस्य',
    phone: '9999999999',
    email: 'test@example.com',
    address: '',
    district: 'नाशिक',
    taluka: 'मालेगाव',
    education: '',
    professional: 'केंद्रप्रमुख',
    status: 'approved',
    createdAt: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

test('buildRegisteredMemberItems orders short and long member numbers accurately', () => {
  const apps: MembershipApplication[] = [
    makeApp({ id: 'a3', fullName: 'सदस्य ३', memberNumber: 'MS/2026/1793' }),
    makeApp({ id: 'a1', fullName: 'सदस्य १', memberNumber: 'MS/2026/42' }),
    makeApp({ id: 'a2', fullName: 'सदस्य २', memberNumber: 'MS/2026/150' }),
    makeApp({ id: 'p1', fullName: 'प्रलंबित', status: 'pending', memberNumber: '' }),
  ];

  const asc = buildRegisteredMemberItems(apps, 'asc');
  assert.equal(asc.length, 3);
  assert.deepEqual(
    asc.map((x) => [x.srNo, x.memberNumber]),
    [
      [1, 'MS/2026/42'],
      [2, 'MS/2026/150'],
      [3, 'MS/2026/1793'],
    ]
  );

  const desc = buildRegisteredMemberItems(apps, 'desc');
  assert.deepEqual(
    desc.map((x) => [x.srNo, x.memberNumber]),
    [
      [3, 'MS/2026/1793'],
      [2, 'MS/2026/150'],
      [1, 'MS/2026/42'],
    ]
  );
});

test('stripHeavyApplicationFields removes base64 photo while preserving HTTPS URLs and directory fields', () => {
  const withBase64 = makeApp({
    id: 'b1',
    fullName: 'बेस६४',
    photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...',
  });
  const strippedBase64 = stripHeavyApplicationFields(withBase64);
  assert.equal(strippedBase64.photo, undefined);
  assert.equal(strippedBase64.fullName, 'बेस६४');

  const withUrl = makeApp({
    id: 'u1',
    photo: 'https://cdn.example.com/member.jpg',
  });
  const keptUrl = stripHeavyApplicationFields(withUrl);
  assert.equal(keptUrl.photo, 'https://cdn.example.com/member.jpg');
});

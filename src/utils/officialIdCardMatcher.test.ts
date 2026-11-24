import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOfficialOrderNumberMap,
  normalizeDistrictLabel,
  normalizeMobile10,
  resolveOfficialIdCardForQuery,
} from './officialIdCardMatcher';
import type { Leader, MembershipApplication } from '../data/mahasanghData';
import type { OfficialMember } from '../data/rkMaharashtraData';

const SAMPLE_LEADERS: Leader[] = [
  {
    id: 'st-1',
    name: 'श्री. अनिल पाटील',
    role: 'राज्य प्रवक्ता',
    region: 'पुणे — पुणे विभाग',
    education: 'एम.ए., बी.एड.',
    phone: '9800000001',
    category: 'राज्य कार्यकारिणी',
    photo: 'https://example.com/state-photo.jpg',
  },
  {
    id: 'wm-1',
    name: 'श्रीमती. सुनीता जाधव',
    role: 'महिला आघाडी प्रदेशाध्यक्ष',
    region: 'नाशिक',
    education: 'एम.ए., बी.एड.',
    phone: '9800000004',
    category: 'महिला आघाडी राज्य कार्यकारिणी',
  },
  {
    id: 'dv-1',
    name: 'श्री. महेश कुलकर्णी',
    role: 'विभाग प्रतिनिधी',
    region: 'पुणे विभाग',
    education: 'एम.ए., बी.एड.',
    phone: '9800000011',
    category: 'विभागीय समन्वयक',
  },
  {
    id: 'dp-1',
    name: 'श्री. सुरेश बागुल',
    role: 'जिल्हाध्यक्ष',
    region: 'नाशिक',
    education: 'एम.ए., बी.एड.',
    phone: '9800000032',
    category: 'जिल्हा अध्यक्ष',
  },
  {
    id: 'dp-2',
    name: 'श्री. अरुण घोडके',
    role: 'जिल्हा अध्यक्ष',
    region: 'अहमदनगर',
    education: 'बी.ए., बी.एड.',
    phone: '9800000036',
    category: 'जिल्हा अध्यक्ष',
  },
];

const SAMPLE_OFFICIALS: OfficialMember[] = [
  {
    id: '101',
    salutation: 'श्री.',
    firstName: 'प्रवीण',
    lastName: 'देशमुख',
    appointedPost: 'तालुका अध्यक्ष',
    district: 'नाशिक',
    taluka: 'मालेगाव',
    currentCadre: 'केंद्रप्रमुख',
    workingPlace: 'मालेगाव',
    mobile: '9811111111',
    updatedAt: '2026-01-10T10:00:00.000Z',
  },
  {
    id: '102',
    salutation: 'श्री.',
    firstName: 'सुरेश',
    lastName: 'बागुल',
    appointedPost: 'जिल्हाध्यक्ष',
    district: 'नाशिक',
    taluka: 'निफाड',
    currentCadre: 'शिक्षण विस्तार अधिकारी',
    workingPlace: 'नाशिक',
    mobile: '9800000032',
    updatedAt: '2026-01-12T10:00:00.000Z',
    photo: 'https://example.com/official-suresh.jpg',
  },
  {
    id: '103',
    salutation: 'श्री.',
    firstName: 'रमेश',
    lastName: 'पाटील',
    appointedPost: 'विभाग प्रतिनिधी',
    district: 'पुणे',
    taluka: 'हवेली',
    currentCadre: 'केंद्रप्रमुख',
    workingPlace: 'पुणे',
    mobile: '9822222222',
    updatedAt: '2026-01-15T10:00:00.000Z',
    orderNumber: 'MS/2026/77',
  },
];

const REGULAR_MEMBER: MembershipApplication = {
  id: 'mem-1',
  applicationNumber: 'APP-001',
  salutation: 'श्री.',
  fullName: 'सामान्य सदस्य',
  phone: '9999999999',
  email: 'regular@example.com',
  address: 'नाशिक',
  district: 'नाशिक',
  taluka: 'सिन्नर',
  education: 'बी.ए.',
  professional: 'केंद्रप्रमुख',
  status: 'approved',
  memberNumber: 'MS/2026/NASH/0009',
  createdAt: '2026-02-01T00:00:00.000Z',
  photo: 'https://example.com/member-photo.jpg',
};

test('normalizeMobile10 handles Devanagari digits and +91 prefixes', () => {
  assert.equal(normalizeMobile10('+91 98000-00001'), '9800000001');
  assert.equal(normalizeMobile10('९८०००००००१'), '9800000001');
  assert.equal(normalizeMobile10('12345'), '');
});

test('normalizeDistrictLabel normalizes legacy district names', () => {
  assert.equal(normalizeDistrictLabel('अहमदनगर'), 'अहिल्यानगर');
  assert.equal(normalizeDistrictLabel('औरंगाबाद (छत्रपती संभाजीनगर)'), 'छत्रपती संभाजीनगर');
  assert.equal(normalizeDistrictLabel('जिल्हा नाशिक'), 'नाशिक');
});

test('regular non-official member returns null (Official ID Card must not be shown)', () => {
  const result = resolveOfficialIdCardForQuery({
    member: REGULAR_MEMBER,
    allLeaders: SAMPLE_LEADERS,
    allOfficials: SAMPLE_OFFICIALS,
  });
  assert.equal(result, null);
});

test('state official displays designation + महाराष्ट्र राज्य and deterministic ST appointment number', () => {
  const result = resolveOfficialIdCardForQuery({
    queryPhone: '9800000001',
    allLeaders: SAMPLE_LEADERS,
    allOfficials: SAMPLE_OFFICIALS,
  });
  assert.ok(result);
  assert.equal(result.designationTitle, 'राज्य प्रवक्ता');
  assert.equal(result.jurisdictionSubtitle, 'महाराष्ट्र राज्य');
  assert.equal(result.appointmentNumber, 'MS/2026/ST-01');
  assert.equal(result.photo, 'https://example.com/state-photo.jpg');
});

test('divisional official from leaders or officials displays महाराष्ट्र राज्य', () => {
  const fromLeader = resolveOfficialIdCardForQuery({
    queryPhone: '9800000011',
    allLeaders: SAMPLE_LEADERS,
    allOfficials: SAMPLE_OFFICIALS,
  });
  assert.ok(fromLeader);
  assert.equal(fromLeader.designationTitle, 'विभाग प्रतिनिधी');
  assert.equal(fromLeader.jurisdictionSubtitle, 'महाराष्ट्र राज्य');
  assert.equal(fromLeader.appointmentNumber, 'MS/2026/DV-01');

  const fromOfficial = resolveOfficialIdCardForQuery({
    queryPhone: '9822222222',
    allLeaders: SAMPLE_LEADERS,
    allOfficials: SAMPLE_OFFICIALS,
  });
  assert.ok(fromOfficial);
  assert.equal(fromOfficial.designationTitle, 'विभाग प्रतिनिधी');
  assert.equal(fromOfficial.jurisdictionSubtitle, 'महाराष्ट्र राज्य');
  assert.equal(fromOfficial.appointmentNumber, 'MS/2026/77');
});

test('district official displays district name (never taluka) and cross-matches officials orderNumber', () => {
  const result = resolveOfficialIdCardForQuery({
    queryPhone: '9800000032',
    allLeaders: SAMPLE_LEADERS,
    allOfficials: SAMPLE_OFFICIALS,
  });
  assert.ok(result);
  assert.equal(result.designationTitle, 'जिल्हाध्यक्ष');
  assert.equal(result.jurisdictionSubtitle, 'जिल्हा नाशिक');
  // Cross-matched from SAMPLE_OFFICIALS (index 1 => MS/2026/02)
  assert.equal(result.appointmentNumber, 'MS/2026/02');
  assert.equal(result.cadre, 'शिक्षण विस्तार अधिकारी');
  assert.equal(result.photo, 'https://example.com/official-suresh.jpg');
});

test('district leader without officials entry normalizes district name and gets DP appointment number', () => {
  const result = resolveOfficialIdCardForQuery({
    queryPhone: '9800000036',
    allLeaders: SAMPLE_LEADERS,
    allOfficials: SAMPLE_OFFICIALS,
  });
  assert.ok(result);
  assert.equal(result.designationTitle, 'जिल्हा अध्यक्ष');
  assert.equal(result.jurisdictionSubtitle, 'जिल्हा अहिल्यानगर');
  assert.equal(result.appointmentNumber, 'MS/2026/DP-02');
});

test('taluka official displays taluka + district and matches sequential MS/2026/01 appointment number', () => {
  const result = resolveOfficialIdCardForQuery({
    queryPhone: '9811111111',
    allLeaders: SAMPLE_LEADERS,
    allOfficials: SAMPLE_OFFICIALS,
  });
  assert.ok(result);
  assert.equal(result.designationTitle, 'तालुका अध्यक्ष');
  assert.equal(result.jurisdictionSubtitle, 'ता. मालेगाव, जि. नाशिक');
  assert.equal(result.appointmentNumber, 'MS/2026/01');
  assert.equal(result.cadre, 'केंद्रप्रमुख');
});

test('multi-role official picks higher seniority (State > Taluka) while preserving real appointment number & photo fallback', () => {
  const dualMember: MembershipApplication = {
    ...REGULAR_MEMBER,
    phone: '9800000004',
    photo: 'https://example.com/sunita-member-photo.jpg',
    professional: 'शिक्षण विस्तार अधिकारी',
  };
  const extraOfficials: OfficialMember[] = [
    ...SAMPLE_OFFICIALS,
    {
      id: '104',
      salutation: 'श्रीमती.',
      firstName: 'सुनीता',
      lastName: 'जाधव',
      appointedPost: 'तालुका अध्यक्ष',
      district: 'नाशिक',
      taluka: 'दिंडोरी',
      currentCadre: 'केंद्रप्रमुख',
      workingPlace: 'दिंडोरी',
      mobile: '9800000004',
      updatedAt: '2026-01-20T10:00:00.000Z',
    },
  ];
  const orderMap = buildOfficialOrderNumberMap(extraOfficials);
  assert.equal(orderMap.get('104'), 'MS/2026/04');

  const result = resolveOfficialIdCardForQuery({
    member: dualMember,
    allLeaders: SAMPLE_LEADERS,
    allOfficials: extraOfficials,
  });
  assert.ok(result);
  assert.equal(result.designationTitle, 'महिला आघाडी प्रदेशाध्यक्ष');
  assert.equal(result.jurisdictionSubtitle, 'महाराष्ट्र राज्य');
  assert.equal(result.appointmentNumber, 'MS/2026/04');
  assert.equal(result.photo, 'https://example.com/sunita-member-photo.jpg');
});

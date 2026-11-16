import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CACHE_KEY_OFFICIALS,
  CACHE_KEY_POSTS,
  CACHE_KEY_DIST_PASSWORDS,
  CACHE_KEY_PRESIDENT_PASS,
  getOfficialsFromStorageSync,
  getPostsFromStorageSync,
  getDistrictPasswordsFromStorageSync,
  getPresidentPasswordFromStorageSync,
  filterAndSortDistrictOfficials,
  matchesDistrictName,
} from './officialsCache';
import { OfficialMember, DEFAULT_APPOINTED_POSTS } from '../data/rkMaharashtraData';

function createMemoryStorage(initial: Record<string, string>) {
  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(initial, key) ? initial[key] : null;
    },
  };
}

test('getOfficialsFromStorageSync returns parsed cached officials immediately and handles corrupt JSON safely', () => {
  const sample: OfficialMember[] = [
    {
      id: '1',
      salutation: 'श्री.',
      firstName: 'राजेश',
      lastName: 'पाटील',
      appointedPost: 'जिल्हाध्यक्ष',
      district: 'पुणे',
      taluka: '',
      currentCadre: 'केंद्रप्रमुख',
      workingPlace: 'पुणे',
      mobile: '9876543210',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  const validStore = createMemoryStorage({
    [CACHE_KEY_OFFICIALS]: JSON.stringify(sample),
  });
  assert.equal(getOfficialsFromStorageSync(validStore).length, 1);
  assert.equal(getOfficialsFromStorageSync(validStore)[0].firstName, 'राजेश');

  const corruptStore = createMemoryStorage({
    [CACHE_KEY_OFFICIALS]: '{broken-json',
  });
  assert.deepEqual(getOfficialsFromStorageSync(corruptStore), []);
});

test('getPostsFromStorageSync falls back to DEFAULT_APPOINTED_POSTS when empty or invalid', () => {
  const emptyStore = createMemoryStorage({});
  assert.deepEqual(getPostsFromStorageSync(emptyStore), DEFAULT_APPOINTED_POSTS);

  const customPosts = [{ name: 'जिल्हाध्यक्ष', isTaluka: false }];
  const validStore = createMemoryStorage({
    [CACHE_KEY_POSTS]: JSON.stringify(customPosts),
  });
  assert.deepEqual(getPostsFromStorageSync(validStore), customPosts);
});

test('getDistrictPasswordsFromStorageSync and getPresidentPasswordFromStorageSync hydrate safely', () => {
  const store = createMemoryStorage({
    [CACHE_KEY_DIST_PASSWORDS]: JSON.stringify({ पुणे: 'PASS1' }),
    [CACHE_KEY_PRESIDENT_PASS]: 'CUSTOM_ADMIN',
  });
  assert.deepEqual(getDistrictPasswordsFromStorageSync(store), { पुणे: 'PASS1' });
  assert.equal(getPresidentPasswordFromStorageSync('RK2026', store), 'CUSTOM_ADMIN');
  assert.equal(getPresidentPasswordFromStorageSync('RK2026', createMemoryStorage({})), 'RK2026');
});

test('filterAndSortDistrictOfficials handles Ahilyanagar/Ahmadnagar alias and post hierarchy sorting', () => {
  const officials: OfficialMember[] = [
    {
      id: '2',
      salutation: 'श्री.',
      firstName: 'अशोक',
      lastName: 'शिंदे',
      appointedPost: 'तालुका अध्यक्ष',
      district: 'अहमदनगर',
      taluka: 'राहुरी',
      currentCadre: 'केंद्रप्रमुख',
      workingPlace: 'राहुरी',
      mobile: '9000000002',
      updatedAt: '2026-01-01',
    },
    {
      id: '1',
      salutation: 'श्री.',
      firstName: 'विजय',
      lastName: 'देशमुख',
      appointedPost: 'जिल्हाध्यक्ष',
      district: 'अहिल्यानगर',
      taluka: '',
      currentCadre: 'केंद्रप्रमुख',
      workingPlace: 'नगर',
      mobile: '9000000001',
      updatedAt: '2026-01-01',
    },
  ];
  const sorted = filterAndSortDistrictOfficials(officials, 'अहिल्यानगर', DEFAULT_APPOINTED_POSTS);
  assert.equal(sorted.length, 2);
  assert.equal(sorted[0].appointedPost, 'जिल्हाध्यक्ष');
  assert.equal(sorted[1].appointedPost, 'तालुका अध्यक्ष');
});

test('matchesDistrictName correctly matches Beed and other aliases in all variations', () => {
  assert.equal(matchesDistrictName('बीड', 'बीड'), true);
  assert.equal(matchesDistrictName('beed', 'बीड'), true);
  assert.equal(matchesDistrictName('Beed', 'बीड'), true);
  assert.equal(matchesDistrictName('bid', 'बीड'), true);
  assert.equal(matchesDistrictName('बीड', 'beed'), true);
  assert.equal(matchesDistrictName('  बीड  ', 'बीड'), true);

  // Other district aliases
  assert.equal(matchesDistrictName('अहमदनगर', 'अहिल्यानगर'), true);
  assert.equal(matchesDistrictName('अहिल्यानगर', 'अहमदनगर'), true);
  assert.equal(matchesDistrictName('औरंगाबाद', 'छत्रपती संभाजीनगर'), true);
  assert.equal(matchesDistrictName('छत्रपती संभाजीनगर', 'औरंगाबाद'), true);
  assert.equal(matchesDistrictName('उस्मानाबाद', 'धाराशिव'), true);
  assert.equal(matchesDistrictName('धाराशिव', 'उस्मानाबाद'), true);

  // Washim aliases
  assert.equal(matchesDistrictName('वाशीम', 'वाशीम'), true);
  assert.equal(matchesDistrictName('वाशिम', 'वाशीम'), true);
  assert.equal(matchesDistrictName('वाशीम', 'वाशिम'), true);
  assert.equal(matchesDistrictName('washim', 'वाशीम'), true);
  assert.equal(matchesDistrictName('Washim', 'वाशीम'), true);

  // Mismatches
  assert.equal(matchesDistrictName('पुणे', 'बीड'), false);
  assert.equal(matchesDistrictName('लातूर', 'बीड'), false);
  assert.equal(matchesDistrictName('वाशीम', 'अकोला'), false);
});

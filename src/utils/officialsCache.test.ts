import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CACHE_KEY_OFFICIALS,
  CACHE_KEY_POSTS,
  LEGACY_CACHE_KEY_POSTS,
  CACHE_KEY_DIST_PASSWORDS,
  CACHE_KEY_PRESIDENT_PASS,
  getOfficialsFromStorageSync,
  getPostsFromStorageSync,
  getDistrictPasswordsFromStorageSync,
  getPresidentPasswordFromStorageSync,
  filterAndSortDistrictOfficials,
  matchesDistrictName,
  stripHeavyPhotosForCache,
  safeStorageSetItem,
} from './officialsCache';
import { OfficialMember, AppointedPostItem, DEFAULT_APPOINTED_POSTS } from '../data/rkMaharashtraData';

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

test('getPostsFromStorageSync falls back to DEFAULT_APPOINTED_POSTS when empty or invalid and preserves custom order without re-adding deleted defaults', () => {
  const emptyStore = createMemoryStorage({});
  assert.deepEqual(getPostsFromStorageSync(emptyStore), DEFAULT_APPOINTED_POSTS);

  const customPosts: AppointedPostItem[] = [
    { name: 'नवीन विशेष पद', isTaluka: false, level: 'state' },
    { name: 'जिल्हाध्यक्ष', isTaluka: false, level: 'district' },
  ];
  const validStore = createMemoryStorage({
    [CACHE_KEY_POSTS]: JSON.stringify(customPosts),
  });
  assert.deepEqual(getPostsFromStorageSync(validStore), customPosts);

  const legacyStore = createMemoryStorage({
    [LEGACY_CACHE_KEY_POSTS]: JSON.stringify(customPosts),
  });
  assert.deepEqual(getPostsFromStorageSync(legacyStore), customPosts);
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

test('stripHeavyPhotosForCache strips base64 data URLs > 2000 chars while preserving HTTPS URLs and metadata', () => {
  const largeBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(2500);
  const httpsUrl = 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg';
  const shortData = 'data:image/png;base64,SHORT';

  const result = stripHeavyPhotosForCache([
    { id: '1', name: 'A', photo: largeBase64 },
    { id: '2', name: 'B', photo: httpsUrl },
    { id: '3', name: 'C', photo: shortData },
    { id: '4', name: 'D' },
  ]);

  assert.equal(result[0].photo, '');
  assert.equal(result[0].name, 'A');
  assert.equal(result[1].photo, httpsUrl);
  assert.equal(result[2].photo, shortData);
  assert.equal(result[3].photo, undefined);
});

test('safeStorageSetItem catches QuotaExceededError, evicts heavy keys, retries cleanly, and never throws', () => {
  const data: Record<string, string> = {
    mahasangh_dynamic_leadership_v1: 'heavy-data',
    rk2026_officials_cache_v1: 'old-officials',
  };
  let quotaFull = true;
  const evicted: string[] = [];

  const mockQuotaStore = {
    getItem(k: string) {
      return data[k] ?? null;
    },
    setItem(k: string, v: string) {
      if (quotaFull) {
        const err = new Error("Failed to execute 'setItem' on 'Storage': Setting the value exceeded the quota.");
        err.name = 'QuotaExceededError';
        throw err;
      }
      data[k] = v;
    },
    removeItem(k: string) {
      evicted.push(k);
      delete data[k];
      quotaFull = false;
    },
  };

  // Should succeed on retry after evicting heavy keys
  const ok = safeStorageSetItem(mockQuotaStore, CACHE_KEY_OFFICIALS, '[{"id":"1"}]');
  assert.equal(ok, true);
  assert.ok(evicted.includes('mahasangh_dynamic_leadership_v1'));
  assert.equal(data[CACHE_KEY_OFFICIALS], '[{"id":"1"}]');

  // If storage remains permanently full, returns false without throwing
  const alwaysFullStore = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {},
  };
  assert.equal(safeStorageSetItem(alwaysFullStore, CACHE_KEY_OFFICIALS, 'x'), false);
});

test('safeStorageSetItem handles QuotaExceededError cleanly for mahasangh_applications and evicts duplicate admin cache', () => {
  const storeData: Record<string, string> = {
    mahasangh_admin_applications_cache_v1: 'stale-duplicate-copy',
    rk2026_officials_cache_v1: 'stale-officials',
  };
  let failFirstWrite = true;
  const storageMock = {
    getItem(k: string) {
      return storeData[k] ?? null;
    },
    setItem(k: string, v: string) {
      if (failFirstWrite) {
        failFirstWrite = false;
        const err = new Error("Setting the value of 'mahasangh_applications' exceeded the quota.");
        err.name = 'QuotaExceededError';
        throw err;
      }
      storeData[k] = v;
    },
    removeItem(k: string) {
      delete storeData[k];
    },
  };

  const ok = safeStorageSetItem(
    storageMock,
    'mahasangh_applications',
    JSON.stringify([{ id: 'm1', fullName: 'टेस्ट', photo: 'https://res.cloudinary.com/demo/a.jpg' }]),
    ['mahasangh_admin_applications_cache_v1', 'rk2026_officials_cache_v1']
  );

  assert.equal(ok, true);
  assert.equal(storeData.mahasangh_admin_applications_cache_v1, undefined);
  assert.ok(storeData.mahasangh_applications.includes('https://res.cloudinary.com/demo/a.jpg'));
});

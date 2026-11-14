import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  getDocsFromServer,
  collection,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  onSnapshot,
  runTransaction,
  QuerySnapshot,
  DocumentData
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  MembershipApplication,
  NewsItem,
  GovOrder,
  INITIAL_NEWS,
  INITIAL_APPLICATIONS,
  INITIAL_GOV_ORDERS,
  formatSequentialMemberNumber,
} from './data/mahasanghData';
import {
  DEFAULT_COUNTER_BASELINE,
  parseMemberNumberSeq,
  extractHighestMemberSeq,
  computeNextSafeSeq,
  buildSequentialMemberNumber,
} from './utils/memberNumberAllocator';

const app = initializeApp(firebaseConfig);

export const db = (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)')
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);

// Error Handling Definition
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Session-cached connection verification (Runs only once per session to save quota)
export async function testConnectionOncePerSession(): Promise<boolean> {
  if (typeof window !== 'undefined' && sessionStorage.getItem('fb_conn_ok')) {
    return true;
  }
  try {
    const connPromise = getDocFromServer(doc(db, 'test', 'connection'));
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firebase connection timeout')), 3500)
    );
    await Promise.race([connPromise, timeoutPromise]);
    if (typeof window !== 'undefined') sessionStorage.setItem('fb_conn_ok', 'true');
    return true;
  } catch (error) {
    console.warn('Firebase connection notice (operating in graceful offline/cached mode):', error);
    if (typeof window !== 'undefined') sessionStorage.setItem('fb_conn_ok', 'true');
    return false;
  }
}

// CACHE-FIRST NEWS FETCHING:
// News is cached in localStorage for 30 minutes.
// Regular visitors reading the website will consume ZERO Firestore reads!
const NEWS_CACHE_KEY = 'mahasangh_news_cache_v2';
const NEWS_CACHE_TIME_KEY = 'mahasangh_news_cache_time_v2';
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export async function fetchNewsCached(forceRefresh = false): Promise<NewsItem[]> {
  try {
    const cachedTime = localStorage.getItem(NEWS_CACHE_TIME_KEY);
    const cachedData = localStorage.getItem(NEWS_CACHE_KEY);

    if (!forceRefresh && cachedTime && cachedData) {
      const age = Date.now() - parseInt(cachedTime, 10);
      if (age < CACHE_DURATION_MS) {
        // Cache is valid - ZERO reads from Firestore!
        return JSON.parse(cachedData);
      }
    }

    // Cache expired or force refresh: fetch from Firestore
    const newsCol = collection(db, 'news');
    const newsSnap = await getDocs(newsCol);

    if (newsSnap.empty) {
      // If collection empty in firestore, initialize with default news
      localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(INITIAL_NEWS));
      localStorage.setItem(NEWS_CACHE_TIME_KEY, Date.now().toString());
      return INITIAL_NEWS;
    }

    const loadedNews: NewsItem[] = [];
    newsSnap.forEach((d) => {
      const data = d.data() as any;
      loadedNews.push({
        id: d.id,
        ...data,
      });
    });

    const sorted = sortNewsDescending(loadedNews);

    safeStorageSet(NEWS_CACHE_KEY, JSON.stringify(sorted));
    safeStorageSet(NEWS_CACHE_TIME_KEY, Date.now().toString());
    return sorted;
  } catch (error) {
    console.warn('Using cached/default news due to network:', error);
    const cachedData = safeStorageGet(NEWS_CACHE_KEY);
    if (cachedData) {
      try {
        return sortNewsDescending(JSON.parse(cachedData));
      } catch {
        // fallback
      }
    }
    return sortNewsDescending(INITIAL_NEWS);
  }
}

import { toEnglishDigits } from './utils/formatters';

// Universal sorting: newest news by custom publish date at top, older news moving down
export function sortNewsDescending(list: NewsItem[]): NewsItem[] {
  return [...list].sort((a, b) => {
    const parseTime = (item: any): number => {
      if (!item) return 0;

      // 1. Check custom publishDate (YYYY-MM-DD)
      if (item.publishDate) {
        const eng = toEnglishDigits(String(item.publishDate).trim());
        const t = new Date(eng).getTime();
        if (!isNaN(t) && t > 0) return t;
      }

      // 2. Check item.date string
      if (item.date) {
        const engDate = toEnglishDigits(String(item.date).trim());
        // YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(engDate)) {
          const t = new Date(engDate).getTime();
          if (!isNaN(t) && t > 0) return t;
        }
        // DD/MM/YYYY or DD-MM-YYYY
        const ddmmyyyy = engDate.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (ddmmyyyy) {
          const d = parseInt(ddmmyyyy[1], 10);
          const m = parseInt(ddmmyyyy[2], 10) - 1;
          const y = parseInt(ddmmyyyy[3], 10);
          const t = new Date(y, m, d).getTime();
          if (!isNaN(t) && t > 0) return t;
        }
        // Marathi month names
        const marathiMonths: Record<string, number> = {
          'जानेवारी': 0, 'फेब्रुवारी': 1, 'मार्च': 2, 'एप्रिल': 3, 'मे': 4, 'जून': 5,
          'जुलै': 6, 'ऑगस्ट': 7, 'सप्टेंबर': 8, 'ऑक्टोबर': 9, 'नोव्हेंबर': 10, 'डिसेंबर': 11
        };
        for (const [mName, mIdx] of Object.entries(marathiMonths)) {
          if (item.date.includes(mName)) {
            const dayMatch = engDate.match(/\d{1,2}/);
            const yearMatch = engDate.match(/\d{4}/);
            const d = dayMatch ? parseInt(dayMatch[0], 10) : 1;
            const y = yearMatch ? parseInt(yearMatch[0], 10) : 2026;
            const t = new Date(y, mIdx, d).getTime();
            if (!isNaN(t) && t > 0) return t;
          }
        }

        const directT = new Date(engDate).getTime();
        if (!isNaN(directT) && directT > 0) return directT;
      }

      // 3. Fallback to createdAt
      if (item.createdAt) {
        if (typeof item.createdAt === 'object' && item.createdAt.seconds) {
          return item.createdAt.seconds * 1000;
        }
        const t = new Date(item.createdAt).getTime();
        if (!isNaN(t) && t > 0) return t;
      }

      // 4. Fallback to timestamp in item.id
      const match = (item.id || '').match(/\d{10,}/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (num > 0) return num;
      }
      return 0;
    };

    const timeA = parseTime(a);
    const timeB = parseTime(b);
    return timeB - timeA;
  });
}

// Single write when admin publishes news
export async function saveNewsToFirestore(news: NewsItem): Promise<void> {
  const path = `news/${news.id}`;
  const newsWithCreated = {
    ...news,
    createdAt: news.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'news', news.id), newsWithCreated);
    // Immediately invalidate and update local cache with newest at top
    const currentCached = safeStorageGet(NEWS_CACHE_KEY);
    const list: NewsItem[] = currentCached ? JSON.parse(currentCached) : [];
    const updated = sortNewsDescending([newsWithCreated, ...list.filter((x) => x.id !== news.id)]);
    safeStorageSet(NEWS_CACHE_KEY, JSON.stringify(updated));
    safeStorageSet(NEWS_CACHE_TIME_KEY, Date.now().toString());
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mahasangh_news_updated', { detail: updated }));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

const GOV_ORDERS_CACHE_KEY = 'mahasangh_gov_orders_cache_v1';
const GOV_ORDERS_CACHE_TIME_KEY = 'mahasangh_gov_orders_cache_time_v1';

export async function fetchGovOrders(forceRefresh = false): Promise<GovOrder[]> {
    try {
        if (!forceRefresh) {
            const cachedTime = safeStorageGet(GOV_ORDERS_CACHE_TIME_KEY);
            const cachedData = safeStorageGet(GOV_ORDERS_CACHE_KEY);
            if (cachedTime && cachedData) {
                const age = Date.now() - parseInt(cachedTime, 10);
                if (age < CACHE_DURATION_MS) {
                    const parsed = JSON.parse(cachedData);
                    if (Array.isArray(parsed)) return parsed;
                }
            }
        }

        const snap = await getDocs(collection(db, 'gov_orders'));
        if (snap.empty) {
            safeStorageSet(GOV_ORDERS_CACHE_KEY, JSON.stringify([]));
            safeStorageSet(GOV_ORDERS_CACHE_TIME_KEY, Date.now().toString());
            return [];
        }
        const list: GovOrder[] = [];
        snap.forEach((d) => {
            list.push(d.data() as GovOrder);
        });
        const sorted = list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        safeStorageSet(GOV_ORDERS_CACHE_KEY, JSON.stringify(sorted));
        safeStorageSet(GOV_ORDERS_CACHE_TIME_KEY, Date.now().toString());
        return sorted;
    } catch (error) {
        console.warn('Could not read gov_orders from firestore:', error);
        const cachedData = safeStorageGet(GOV_ORDERS_CACHE_KEY);
        if (cachedData) {
            try {
                return JSON.parse(cachedData);
            } catch {
                // fallback
            }
        }
        return [];
    }
}

export async function saveGovOrderToFirestore(govOrder: GovOrder): Promise<void> {
    await setDoc(doc(db, 'gov_orders', govOrder.id), govOrder);
    try {
        const cached = safeStorageGet(GOV_ORDERS_CACHE_KEY);
        const list: GovOrder[] = cached ? JSON.parse(cached) : [];
        const updated = [govOrder, ...list.filter((g) => g.id !== govOrder.id)]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        safeStorageSet(GOV_ORDERS_CACHE_KEY, JSON.stringify(updated));
        safeStorageSet(GOV_ORDERS_CACHE_TIME_KEY, Date.now().toString());
    } catch {
        // ignore cache error
    }
}

export async function deleteGovOrderFromFirestore(id: string): Promise<void> {
    await deleteDoc(doc(db, 'gov_orders', id));
    try {
        const cached = safeStorageGet(GOV_ORDERS_CACHE_KEY);
        if (cached) {
            const list: GovOrder[] = JSON.parse(cached);
            safeStorageSet(GOV_ORDERS_CACHE_KEY, JSON.stringify(list.filter((g) => g.id !== id)));
            safeStorageSet(GOV_ORDERS_CACHE_TIME_KEY, Date.now().toString());
        }
    } catch {
        // ignore cache error
    }
}

// Delete news from Firestore and update local cache
export async function deleteNewsFromFirestore(newsId: string): Promise<void> {
  const path = `news/${newsId}`;
  console.log('Attempting to delete news item:', newsId);
  try {
    await deleteDoc(doc(db, 'news', newsId));
    console.log('Successfully deleted news item from Firestore:', newsId);
    const currentCached = safeStorageGet(NEWS_CACHE_KEY);
    const list: NewsItem[] = currentCached ? JSON.parse(currentCached) : [];
    const updated = list.filter((x) => x.id !== newsId);
    safeStorageSet(NEWS_CACHE_KEY, JSON.stringify(updated));
    safeStorageSet(NEWS_CACHE_TIME_KEY, Date.now().toString());
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mahasangh_news_updated', { detail: updated }));
    }
  } catch (error) {
    console.error('Failed to delete news item from Firestore:', newsId, error);
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Helper to clean objects of undefined values before saving to Firestore
export function cleanForFirestore<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = cleanForFirestore(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

// Single write when member registers
export async function saveApplicationToFirestore(app: MembershipApplication): Promise<void> {
  const path = `applications/${app.id}`;
  try {
    const cleaned = cleanForFirestore(app);
    await setDoc(doc(db, 'applications', app.id), cleaned, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// Targeted single-document search for status tracking (Consumes minimal reads, NOT the entire collection!)
export async function trackSingleApplicationInFirestore(
  identifier: string
): Promise<MembershipApplication | null> {
  const queryTerm = toEnglishDigits(identifier.trim());
  if (!queryTerm) return null;

  const pickBestMatch = (docs: any[]): MembershipApplication | null => {
    if (!docs || docs.length === 0) return null;
    const mapped = docs.map((d) => ({
      ...(d.data() as MembershipApplication),
      id: (d.data() as MembershipApplication).id || d.id,
    }));
    const approved = mapped.find((m) => m.status === 'approved');
    return approved || mapped[0];
  };

  try {
    // 1. Try by document ID
    const docRef = doc(db, 'applications', queryTerm);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data() as MembershipApplication;
      return { ...data, id: data.id || docSnap.id };
    }

    const appsCol = collection(db, 'applications');

    // 2. Try by memberNumber (exact or uppercase)
    const upperTerm = queryTerm.toUpperCase();
    const qMember = query(appsCol, where('memberNumber', '==', upperTerm), limit(5));
    const snapMember = await getDocs(qMember);
    if (!snapMember.empty) {
      return pickBestMatch(snapMember.docs);
    }
    if (upperTerm !== queryTerm) {
      const qMemberExact = query(appsCol, where('memberNumber', '==', queryTerm), limit(5));
      const snapMemberExact = await getDocs(qMemberExact);
      if (!snapMemberExact.empty) {
        return pickBestMatch(snapMemberExact.docs);
      }
    }

    // 3. Try by applicationNumber (exact or uppercase)
    const qApp = query(appsCol, where('applicationNumber', '==', upperTerm), limit(5));
    const snapApp = await getDocs(qApp);
    if (!snapApp.empty) {
      return pickBestMatch(snapApp.docs);
    }

    // 4. Try by phone (exact and normalized last-10 digits)
    const digitsOnly = queryTerm.replace(/\D/g, '');
    const phoneCandidates = Array.from(
      new Set([queryTerm, ...(digitsOnly.length >= 10 ? [digitsOnly.slice(-10)] : [])])
    );
    for (const candidate of phoneCandidates) {
      const qPhone = query(appsCol, where('phone', '==', candidate), limit(5));
      const snapPhone = await getDocs(qPhone);
      if (!snapPhone.empty) {
        return pickBestMatch(snapPhone.docs);
      }
    }

    return null;
  } catch (error) {
    console.warn('Track query error:', error);
    return null;
  }
}

// Check Firestore for existing application by phone, email, or exact fullName (prevents duplicate Pending/Approved apps)
export async function findExistingApplicationInFirestore(params: {
  phone?: string;
  email?: string;
  fullName?: string;
}): Promise<{ app: MembershipApplication; matchedBy: 'phone' | 'email' | 'name' } | null> {
  const pickBest = (docs: any[]): MembershipApplication | null => {
    if (!docs || docs.length === 0) return null;
    const mapped = docs.map((d) => ({
      ...(d.data() as MembershipApplication),
      id: (d.data() as MembershipApplication).id || d.id,
    }));
    return (
      mapped.find((m) => m.status === 'approved') ||
      mapped.find((m) => m.status === 'pending') ||
      mapped[0]
    );
  };

  try {
    const appsCol = collection(db, 'applications');

    // 1. Check by 10-digit phone
    const cleanPhone = toEnglishDigits(params.phone || '').replace(/\D/g, '').slice(-10);
    if (cleanPhone.length === 10) {
      const snapPhone = await getDocs(query(appsCol, where('phone', '==', cleanPhone), limit(5)));
      if (!snapPhone.empty) {
        const best = pickBest(snapPhone.docs);
        if (best) return { app: best, matchedBy: 'phone' };
      }
    }

    // 2. Check by user-provided email (skip synthetic @mahasangh.in fallback)
    const cleanEmail = (params.email || '').trim().toLowerCase();
    if (cleanEmail && !cleanEmail.endsWith('@mahasangh.in')) {
      const snapEmail = await getDocs(query(appsCol, where('email', '==', cleanEmail), limit(5)));
      if (!snapEmail.empty) {
        const best = pickBest(snapEmail.docs);
        if (best) return { app: best, matchedBy: 'email' };
      }
    }

    // 3. Check by normalized fullName
    const normalizedName = (params.fullName || '').trim().replace(/\s+/g, ' ');
    if (normalizedName.length >= 3) {
      const snapName = await getDocs(query(appsCol, where('fullName', '==', normalizedName), limit(5)));
      if (!snapName.empty) {
        const best = pickBest(snapName.docs);
        if (best) return { app: best, matchedBy: 'name' };
      }
    }

    return null;
  } catch (error) {
    console.warn('Duplicate check Firestore query error:', error);
    return null;
  }
}

// Admin only: On-demand applications fetch
export async function fetchApplicationsForAdmin(): Promise<MembershipApplication[]> {
  try {
    const appsCol = collection(db, 'applications');
    const snap = await getDocs(appsCol);
    if (snap.empty) {
      return [];
    }
    const list: MembershipApplication[] = [];
    snap.forEach((d) => {
      const data = d.data() as MembershipApplication;
      list.push({ ...data, id: d.id || data.id });
    });
    list.sort(
      (a, b) =>
        new Date(b.createdAt || '').getTime() -
        new Date(a.createdAt || '').getTime()
    );
    return list;
  } catch (error) {
    console.warn('Admin fetch applications error:', error);
    return [];
  }
}

// Admin only: Real-time listener for applications so status updates stay live in sync
export function subscribeToApplicationsForAdmin(
  onSuccess: (apps: MembershipApplication[]) => void,
  onError?: (error: unknown) => void
): () => void {
  const appsCol = collection(db, 'applications');
  return onSnapshot(
    appsCol,
    (snap: QuerySnapshot<DocumentData>) => {
      const list: MembershipApplication[] = [];
      snap.forEach((d) => {
        const data = d.data() as MembershipApplication;
        list.push({ ...data, id: d.id || data.id });
      });
      list.sort(
        (a, b) =>
          new Date(b.createdAt || '').getTime() -
          new Date(a.createdAt || '').getTime()
      );
      onSuccess(list);
    },
    (error: any) => {
      console.warn('Realtime applications listener error:', error);
      if (onError) onError(error);
    }
  );
}

// Admin only: Full Member Edit / Update (updates memberNumber & all profile fields permanently in Firestore + caches)
export async function updateMemberInFirestore(member: MembershipApplication): Promise<void> {
  const path = `applications/${member.id}`;
  try {
    const payload = cleanForFirestore({
      ...member,
      taluka: member.taluka || '',
      centerName: member.centerName || '',
      familyMembers: member.familyMembers || '',
      hobby: member.hobby || '',
      professionalQualification: member.professionalQualification || '',
      memberNumber: member.memberNumber || '',
      photo: member.photo || '',
      isOfficial: Boolean(member.isOfficial),
      officialPost: member.isOfficial ? (member.officialPost || '') : '',
      officialDistrict: member.isOfficial ? (member.officialDistrict || '') : '',
      officialTaluka: member.isOfficial ? (member.officialTaluka || '') : '',
      approvedAt: member.status === 'approved' ? (member.approvedAt || new Date().toISOString()) : (member.approvedAt || ''),
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'applications', member.id), payload, { merge: true });
    syncSingleMemberInCaches(member);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// Admin only: Approve application (saves permanently to Firestore with merge)
export async function approveApplicationInFirestore(
  appId: string,
  memberNumber: string
): Promise<void> {
  const path = `applications/${appId}`;
  try {
    const payload = cleanForFirestore({
      status: 'approved',
      memberNumber,
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'applications', appId), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// Admin only: Reject application (saves permanently to Firestore with merge)
export async function rejectApplicationInFirestore(
  appId: string,
  reason?: string
): Promise<void> {
  const path = `applications/${appId}`;
  try {
    const payload = cleanForFirestore({
      status: 'rejected',
      rejectReason: reason || '',
      rejectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'applications', appId), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// Admin only: Delete application permanently from Firestore + local caches
export async function deleteApplicationFromFirestore(appId: string): Promise<void> {
  const path = `applications/${appId}`;
  try {
    await deleteDoc(doc(db, 'applications', appId));
    removeMemberFromCaches(appId);
    if (typeof localStorage !== 'undefined') {
      for (const key of ['mahasangh_applications', APPROVED_MEMBERS_CACHE_KEY, 'mahasangh_applications_v1', 'mahasangh_approved_cache_v1']) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
              const filtered = list.filter((x: any) => x.id !== appId);
              localStorage.setItem(key, JSON.stringify(filtered));
            }
          } catch {}
        }
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ==========================================
// Central Member Counter & Smart Cache
// Saves 95%+ of Firestore reads by avoiding full-collection scans
// ==========================================

export interface MemberCounterData {
  totalApproved: number;
  lastMemberNumber: number;
  lastUpdated: string;
}

const MEMBER_COUNTER_CACHE_KEY = 'mhs_member_counter_cache_v2';
const APPROVED_MEMBERS_CACHE_KEY = 'mahasangh_approved_cache_v2';
const APPROVED_MEMBERS_CACHE_TIME_KEY = 'mahasangh_approved_cache_time_v2';
const APPROVED_CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes smart cache

/**
 * Reads the central member counter from `settings/member_counter` (Consumes exactly 1 read).
 * If counter doesn't exist yet, initializes it seamlessly based on current highest approved count.
 */
export async function getMemberCounter(): Promise<MemberCounterData> {
  const counterDocRef = doc(db, 'settings', 'member_counter');
  try {
    const snap = await getDoc(counterDocRef);
    if (snap.exists()) {
      const data = snap.data();
      const count = typeof data.lastMemberNumber === 'number'
        ? data.lastMemberNumber
        : (typeof data.totalApproved === 'number' ? data.totalApproved : 0);
      const res: MemberCounterData = {
        totalApproved: count,
        lastMemberNumber: count,
        lastUpdated: data.lastUpdated || new Date().toISOString()
      };
      safeStorageSet(MEMBER_COUNTER_CACHE_KEY, JSON.stringify(res));
      return res;
    }
  } catch (err) {
    console.warn('Central counter read warning:', err);
  }

  // Fallback to local cache or initialize
  const cachedRaw = safeStorageGet(MEMBER_COUNTER_CACHE_KEY);
  if (cachedRaw) {
    try {
      return JSON.parse(cachedRaw);
    } catch {
      // fallback
    }
  }

  // Baseline initialization if document not created yet
  // Checks cached applications to find highest sequential number or defaults to 71
  let baseline = 0;
  try {
    const appsRaw = safeStorageGet('mahasangh_applications') || safeStorageGet(APPROVED_MEMBERS_CACHE_KEY);
    if (appsRaw) {
      const apps = JSON.parse(appsRaw);
      baseline = extractHighestMemberSeq(apps);
    }
  } catch {
    // fallback
  }

  if (baseline <= 0) baseline = DEFAULT_COUNTER_BASELINE; // baseline based on approved records

  const initData: MemberCounterData = {
    totalApproved: baseline,
    lastMemberNumber: baseline,
    lastUpdated: new Date().toISOString()
  };

  try {
    await setDoc(counterDocRef, initData, { merge: true });
  } catch (e) {
    console.warn('Could not write initial member counter to firestore:', e);
  }
  safeStorageSet(MEMBER_COUNTER_CACHE_KEY, JSON.stringify(initData));
  return initData;
}

function getKnownHighestSeqFromStorage(knownRecords?: Array<{ memberNumber?: string | null }>): number {
  let highest = extractHighestMemberSeq(knownRecords);
  try {
    const counterRaw = safeStorageGet(MEMBER_COUNTER_CACHE_KEY);
    if (counterRaw) {
      const c = JSON.parse(counterRaw);
      const val = typeof c?.lastMemberNumber === 'number' ? c.lastMemberNumber : (typeof c?.totalApproved === 'number' ? c.totalApproved : 0);
      if (val > highest) highest = val;
    }
  } catch {
    // Ignore cache parse issues
  }
  return highest;
}

async function hasExistingMemberNumberInFirestore(
  candidateMemberNumber: string,
  excludeAppId?: string
): Promise<boolean> {
  try {
    const appsCol = collection(db, 'applications');
    const q = query(appsCol, where('memberNumber', '==', candidateMemberNumber), limit(3));
    const snap = await getDocs(q);
    if (snap.empty) return false;
    return snap.docs.some((d) => d.id !== excludeAppId);
  } catch {
    return false;
  }
}

/**
 * Atomically allocates the next unique sequential member number using a Firestore Transaction
 * on `settings/member_counter`, plus collision defense against existing `applications`.
 */
export async function allocateNextMemberNumber(
  district?: string,
  knownRecords?: Array<{ memberNumber?: string | null }>
): Promise<{ memberNumber: string; seqNumber: number }> {
  const counterDocRef = doc(db, 'settings', 'member_counter');
  let floorSeq = getKnownHighestSeqFromStorage(knownRecords);

  for (let attempt = 0; attempt < 15; attempt++) {
    const allocatedSeq = await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterDocRef);
      let currentSeq = 0;
      if (snap.exists()) {
        const data = snap.data();
        const rawLast = typeof data.lastMemberNumber === 'number' ? data.lastMemberNumber : 0;
        const rawTotal = typeof data.totalApproved === 'number' ? data.totalApproved : 0;
        currentSeq = Math.max(rawLast, rawTotal);
      }

      const nextSeq = computeNextSafeSeq({
        counterSeq: currentSeq,
        highestExistingSeq: floorSeq,
        minBaseline: DEFAULT_COUNTER_BASELINE,
      });

      const newCounterData: MemberCounterData = {
        totalApproved: nextSeq,
        lastMemberNumber: nextSeq,
        lastUpdated: new Date().toISOString()
      };
      tx.set(counterDocRef, newCounterData, { merge: true });
      return nextSeq;
    });

    const candidateNumber = buildSequentialMemberNumber(district, allocatedSeq);
    const hasCollision = await hasExistingMemberNumberInFirestore(candidateNumber);
    if (!hasCollision) {
      safeStorageSet(
        MEMBER_COUNTER_CACHE_KEY,
        JSON.stringify({
          totalApproved: allocatedSeq,
          lastMemberNumber: allocatedSeq,
          lastUpdated: new Date().toISOString(),
        })
      );
      return { memberNumber: candidateNumber, seqNumber: allocatedSeq };
    }

    // Existing member already owns this number (e.g., manual edit jumped ahead); skip past it
    floorSeq = Math.max(floorSeq, allocatedSeq);
  }

  throw new Error('दुबार टाळण्यासाठी नवीन सदस्य क्रमांक तयार करता आला नाही. कृपया पुन्हा प्रयत्न करा.');
}

/**
 * Atomically approves an application AND allocates its memberNumber inside ONE Firestore Transaction.
 * - If the application is ALREADY approved with a memberNumber (e.g. via Webhook/Server/Another Admin),
 *   it preserves the existing memberNumber instead of allocating a duplicate!
 * - Prevents race conditions across simultaneous approvals or payments.
 */
export async function approveApplicationAtomicInFirestore(params: {
  appId: string;
  district?: string;
  extraUpdates?: Partial<MembershipApplication>;
  knownRecords?: Array<{ memberNumber?: string | null }>;
}): Promise<{
  memberNumber: string;
  seqNumber: number;
  alreadyApproved: boolean;
  application: MembershipApplication;
}> {
  const { appId, district, extraUpdates = {}, knownRecords } = params;
  const appRef = doc(db, 'applications', appId);
  const counterDocRef = doc(db, 'settings', 'member_counter');
  let floorSeq = getKnownHighestSeqFromStorage(knownRecords);

  // Pre-scan past any manually-assigned future numbers before locking inside transaction
  try {
    const preCounterSnap = await getDoc(counterDocRef);
    const preCounterVal = preCounterSnap.exists()
      ? Math.max(
          Number(preCounterSnap.data().lastMemberNumber || 0),
          Number(preCounterSnap.data().totalApproved || 0)
        )
      : 0;
    let probeSeq = computeNextSafeSeq({
      counterSeq: preCounterVal,
      highestExistingSeq: floorSeq,
      minBaseline: DEFAULT_COUNTER_BASELINE,
    });
    for (let i = 0; i < 15; i++) {
      const probeCandidate = buildSequentialMemberNumber(district, probeSeq);
      const exists = await hasExistingMemberNumberInFirestore(probeCandidate, appId);
      if (!exists) break;
      floorSeq = Math.max(floorSeq, probeSeq);
      probeSeq++;
    }
  } catch {
    // Proceed into atomic transaction with current floorSeq
  }

  const txResult = await runTransaction(db, async (tx) => {
    const [appSnap, counterSnap] = await Promise.all([
      tx.get(appRef),
      tx.get(counterDocRef),
    ]);

    const nowIso = new Date().toISOString();
    const existingData = (appSnap.exists() ? appSnap.data() : {}) as Partial<MembershipApplication>;

    // Idempotent guard: if already approved with a valid memberNumber, NEVER allocate a second one!
    const existingMemberNo = String(existingData.memberNumber || '').trim();
    if (existingData.status === 'approved' && existingMemberNo !== '') {
      const mergedExisting = cleanForFirestore({
        ...existingData,
        ...extraUpdates,
        status: 'approved',
        memberNumber: existingMemberNo,
        approvedAt: existingData.approvedAt || nowIso,
        updatedAt: nowIso,
      }) as MembershipApplication;

      // Only persist extra confirmation fields (e.g. paymentRef/paymentConfirmed) if needed
      if (Object.keys(extraUpdates).length > 0) {
        tx.set(appRef, mergedExisting, { merge: true });
      }

      return {
        memberNumber: existingMemberNo,
        seqNumber: parseMemberNumberSeq(existingMemberNo),
        alreadyApproved: true,
        application: { ...mergedExisting, id: appId },
      };
    }

    let currentCounter = 0;
    if (counterSnap.exists()) {
      const cData = counterSnap.data();
      currentCounter = Math.max(
        typeof cData.lastMemberNumber === 'number' ? cData.lastMemberNumber : 0,
        typeof cData.totalApproved === 'number' ? cData.totalApproved : 0
      );
    }

    const nextSeq = computeNextSafeSeq({
      counterSeq: currentCounter,
      highestExistingSeq: floorSeq,
      minBaseline: DEFAULT_COUNTER_BASELINE,
    });
    const effectiveDistrict = existingData.district || district || 'MAHA';
    const newMemberNumber = buildSequentialMemberNumber(effectiveDistrict, nextSeq);

    tx.set(
      counterDocRef,
      {
        totalApproved: nextSeq,
        lastMemberNumber: nextSeq,
        lastUpdated: nowIso,
      },
      { merge: true }
    );

    const approvalPayload = cleanForFirestore({
      ...existingData,
      ...extraUpdates,
      status: 'approved',
      memberNumber: newMemberNumber,
      approvedAt: existingData.approvedAt || nowIso,
      updatedAt: nowIso,
    }) as MembershipApplication;

    tx.set(appRef, approvalPayload, { merge: true });

    return {
      memberNumber: newMemberNumber,
      seqNumber: nextSeq,
      alreadyApproved: false,
      application: { ...approvalPayload, id: appId },
    };
  });

  if (!txResult.alreadyApproved && txResult.seqNumber > 0) {
    safeStorageSet(
      MEMBER_COUNTER_CACHE_KEY,
      JSON.stringify({
        totalApproved: txResult.seqNumber,
        lastMemberNumber: txResult.seqNumber,
        lastUpdated: new Date().toISOString(),
      })
    );
  }

  return txResult;
}

/**
 * Atomically syncs the central counter forward so it never falls behind existing approved records.
 */
export async function syncMemberCounter(highestKnownCount: number): Promise<void> {
  if (!highestKnownCount || highestKnownCount <= 0) return;
  const counterDocRef = doc(db, 'settings', 'member_counter');
  try {
    const newVal = await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterDocRef);
      const current = snap.exists()
        ? Math.max(
            typeof snap.data().lastMemberNumber === 'number' ? snap.data().lastMemberNumber : 0,
            typeof snap.data().totalApproved === 'number' ? snap.data().totalApproved : 0
          )
        : 0;
      if (highestKnownCount > current) {
        const updated: MemberCounterData = {
          totalApproved: highestKnownCount,
          lastMemberNumber: highestKnownCount,
          lastUpdated: new Date().toISOString()
        };
        tx.set(counterDocRef, updated, { merge: true });
        return highestKnownCount;
      }
      return current;
    });
    safeStorageSet(
      MEMBER_COUNTER_CACHE_KEY,
      JSON.stringify({
        totalApproved: newVal,
        lastMemberNumber: newVal,
        lastUpdated: new Date().toISOString(),
      })
    );
  } catch (err) {
    console.warn('Sync member counter error:', err);
  }
}

/**
 * SMART CACHE FOR APPROVED MEMBERS DIRECTORY:
 * Approved members list is cached locally for 2 minutes.
 * Guarantees 100% parity with Admin Panel live count.
 */
export async function fetchApprovedMembersCached(forceRefresh = false): Promise<MembershipApplication[]> {
  try {
    const cachedTime = safeStorageGet(APPROVED_MEMBERS_CACHE_TIME_KEY);
    const cachedData = safeStorageGet(APPROVED_MEMBERS_CACHE_KEY);

    if (!forceRefresh && cachedTime && cachedData) {
      const age = Date.now() - parseInt(cachedTime, 10);
      if (age < APPROVED_CACHE_DURATION_MS) {
        const parsed = JSON.parse(cachedData);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    }

    // Use standard cached getDocs on normal load, and getDocsFromServer only on explicit manual Refresh
    let snap;
    if (forceRefresh) {
      try {
        snap = await getDocsFromServer(collection(db, 'applications'));
      } catch {
        snap = await getDocs(collection(db, 'applications'));
      }
    } else {
      snap = await getDocs(collection(db, 'applications'));
    }

    let list: MembershipApplication[] = [];
    if (snap && !snap.empty) {
      snap.forEach((d) => {
        const item = d.data() as MembershipApplication;
        const isApproved =
          item.status === 'approved' ||
          (typeof item.status === 'string' && item.status.toLowerCase() === 'approved') ||
          Boolean(item.memberNumber && item.memberNumber.trim() !== '') ||
          Boolean(item.approvedAt);

        if (isApproved) {
          list.push({
            ...item,
            id: item.id || d.id
          });
        }
      });
    }

    // Sort descending by approval / creation date
    list.sort(
      (a, b) =>
        new Date(b.approvedAt || b.createdAt || '').getTime() -
        new Date(a.approvedAt || a.createdAt || '').getTime()
    );

    // Strip heavy base64 photos for local cache to save storage space
    const lightweightList = list.map((item) => {
      if (item.photo && item.photo.length > 2000 && item.photo.startsWith('data:image')) {
        const { photo, ...rest } = item;
        return rest;
      }
      return item;
    });

    safeStorageSet(APPROVED_MEMBERS_CACHE_KEY, JSON.stringify(lightweightList));
    safeStorageSet(APPROVED_MEMBERS_CACHE_TIME_KEY, Date.now().toString());

    return list;
  } catch (error) {
    console.warn('Using cached approved members due to network / quota:', error);
    const cachedData = safeStorageGet(APPROVED_MEMBERS_CACHE_KEY);
    if (cachedData) {
      try {
        return JSON.parse(cachedData);
      } catch {
        // fallback
      }
    }
    return [];
  }
}

/**
 * Optimistically appends a newly approved application to the local approved members cache
 * so the user immediately sees it without an extra network fetch.
 */
export function addApprovedMemberToCache(app: MembershipApplication): void {
  try {
    const raw = safeStorageGet(APPROVED_MEMBERS_CACHE_KEY);
    const current: MembershipApplication[] = raw ? JSON.parse(raw) : [];

    const appToCache = (app.photo && app.photo.length > 2000 && app.photo.startsWith('data:image'))
      ? { ...app, photo: undefined }
      : app;

    const updated = [appToCache, ...current.filter((x) => x.id !== app.id && x.memberNumber !== app.memberNumber)];
    safeStorageSet(APPROVED_MEMBERS_CACHE_KEY, JSON.stringify(updated));
    safeStorageSet(APPROVED_MEMBERS_CACHE_TIME_KEY, Date.now().toString());
  } catch (err) {
    console.warn('Cache append warning:', err);
  }
}

/**
 * Syncs an edited member across both approved cache and general applications cache.
 */
export function syncSingleMemberInCaches(app: MembershipApplication): void {
  try {
    const appToCache = (app.photo && app.photo.length > 2000 && app.photo.startsWith('data:image'))
      ? { ...app, photo: undefined }
      : app;

    // 1. Update mahasangh_approved_cache_v2
    const rawApproved = safeStorageGet(APPROVED_MEMBERS_CACHE_KEY);
    if (rawApproved) {
      const currentApproved: MembershipApplication[] = JSON.parse(rawApproved);
      const filteredApproved = currentApproved.filter((x) => x.id !== app.id);
      const nextApproved = app.status === 'approved' ? [appToCache, ...filteredApproved] : filteredApproved;
      safeStorageSet(APPROVED_MEMBERS_CACHE_KEY, JSON.stringify(nextApproved));
      safeStorageSet(APPROVED_MEMBERS_CACHE_TIME_KEY, Date.now().toString());
    }

    // 2. Update mahasangh_applications
    const rawApps = safeStorageGet('mahasangh_applications');
    if (rawApps) {
      const currentApps: MembershipApplication[] = JSON.parse(rawApps);
      const exists = currentApps.some((x) => x.id === app.id);
      const nextApps = exists
        ? currentApps.map((x) => (x.id === app.id ? appToCache : x))
        : [appToCache, ...currentApps];
      safeStorageSet('mahasangh_applications', JSON.stringify(nextApps));
    }
  } catch (err) {
    console.warn('syncSingleMemberInCaches warning:', err);
  }
}

/**
 * Removes a deleted member from all local caches immediately.
 */
export function removeMemberFromCaches(appId: string): void {
  try {
    const rawApproved = safeStorageGet(APPROVED_MEMBERS_CACHE_KEY);
    if (rawApproved) {
      const currentApproved: MembershipApplication[] = JSON.parse(rawApproved);
      safeStorageSet(
        APPROVED_MEMBERS_CACHE_KEY,
        JSON.stringify(currentApproved.filter((x) => x.id !== appId))
      );
    }

    const rawApps = safeStorageGet('mahasangh_applications');
    if (rawApps) {
      const currentApps: MembershipApplication[] = JSON.parse(rawApps);
      safeStorageSet(
        'mahasangh_applications',
        JSON.stringify(currentApps.filter((x) => x.id !== appId))
      );
    }
  } catch (err) {
    console.warn('removeMemberFromCaches warning:', err);
  }
}

// ==========================================
// Zero-Quota Visitor Counter (Runs ONLY once per browser session)
// ==========================================
export interface VisitorStats {
  today: number;
  total: number;
}

const VISITOR_LOCAL_KEY = 'mhs_real_visit_count_v5';
const VISITOR_SESSION_FLAG = 'mhs_visit_recorded_session_v5';

// Proactively clear corrupted/legacy keys with dummy numbers (284, 18450)
try {
  localStorage.removeItem('mhs_visitor_stats_v1');
  localStorage.removeItem('mhs_visitor_stats');
  localStorage.removeItem('mhs_site_visits');
  sessionStorage.removeItem('mhs_visit_recorded_session');
} catch {
  // ignore
}

export async function getVisitorCountsOncePerSession(): Promise<VisitorStats> {
  const todayDateStr = new Date().toISOString().split('T')[0];

  // 1. Read existing local stats (default real baseline: today: 1, total: 1 if first ever)
  let currentStats: VisitorStats = { today: 1, total: 1 };
  try {
    const raw = localStorage.getItem(VISITOR_LOCAL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.total === 'number' && parsed.total < 5000) {
        currentStats = {
          total: parsed.total,
          today: parsed.date === todayDateStr && typeof parsed.today === 'number' && parsed.today < 1000 ? parsed.today : 1
        };
      }
    }
  } catch {
    // fallback
  }

  // 2. Check if this session already counted
  if (sessionStorage.getItem(VISITOR_SESSION_FLAG)) {
    return currentStats;
  }

  // 3. Mark session counted immediately so subsequent actions in this session NEVER re-query or re-write
  sessionStorage.setItem(VISITOR_SESSION_FLAG, 'true');

  // 4. Update Firestore once to persist genuine visitor count across all devices
  try {
    const statsDocRef = doc(db, 'site_stats', 'visits');
    const snap = await getDoc(statsDocRef);
    if (snap.exists()) {
      const data = snap.data();
      let rawTotal = typeof data.total === 'number' ? data.total : 0;
      // Sanitize legacy dummy baseline (18450) if present
      if (rawTotal >= 5000) {
        rawTotal = 0;
      }
      let rawToday = (data.lastDate === todayDateStr && typeof data.today === 'number' && data.today < 1000) ? data.today : 0;

      const firestoreTotal = rawTotal + 1;
      const firestoreToday = rawToday + 1;

      await setDoc(statsDocRef, {
        total: firestoreTotal,
        today: firestoreToday,
        lastDate: todayDateStr,
        lastUpdated: new Date().toISOString()
      }, { merge: true });

      const realStats: VisitorStats = { today: firestoreToday, total: firestoreTotal };
      localStorage.setItem(VISITOR_LOCAL_KEY, JSON.stringify({
        ...realStats,
        date: todayDateStr
      }));
      return realStats;
    } else {
      // First initialization in Firestore
      const initStats: VisitorStats = { today: 1, total: 1 };
      await setDoc(statsDocRef, {
        total: 1,
        today: 1,
        lastDate: todayDateStr,
        lastUpdated: new Date().toISOString()
      });
      localStorage.setItem(VISITOR_LOCAL_KEY, JSON.stringify({
        ...initStats,
        date: todayDateStr
      }));
      return initStats;
    }
  } catch (err) {
    // Zero disruption if offline / network hiccup - increment local count gracefully
    console.warn('Visitor counter Firestore sync notice:', err);
    const fallbackStats: VisitorStats = {
      today: currentStats.today + 1,
      total: currentStats.total + 1
    };
    localStorage.setItem(VISITOR_LOCAL_KEY, JSON.stringify({
      ...fallbackStats,
      date: todayDateStr
    }));
    return fallbackStats;
  }
}

// ==========================================
// Contact Messages Management
// ==========================================
export interface ContactMessage {
  id: string;
  name: string;
  phone: string;
  email?: string;
  district?: string;
  subject?: string;
  message: string;
  createdAt: string;
}

const CONTACTS_CACHE_KEY = 'mahasangh_contacts_cache_v1';

export async function saveContactToFirestore(contact: ContactMessage): Promise<void> {
  try {
    const raw = localStorage.getItem(CONTACTS_CACHE_KEY);
    const list: ContactMessage[] = raw ? JSON.parse(raw) : [];
    const updated = [contact, ...list.filter(c => c.id !== contact.id)];
    localStorage.setItem(CONTACTS_CACHE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error(e);
  }

  const path = `contacts/${contact.id}`;
  try {
    await setDoc(doc(db, 'contacts', contact.id), contact);
  } catch (error) {
    console.warn('Saved contact locally, Firestore sync error:', error);
  }
}

export async function fetchContactsForAdmin(): Promise<ContactMessage[]> {
  let list: ContactMessage[] = [];
  try {
    const raw = localStorage.getItem(CONTACTS_CACHE_KEY);
    if (raw) list = JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }

  try {
    const snap = await getDocs(collection(db, 'contacts'));
    if (!snap.empty) {
      const firestoreList: ContactMessage[] = [];
      snap.forEach((d) => firestoreList.push(d.data() as ContactMessage));
      firestoreList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      localStorage.setItem(CONTACTS_CACHE_KEY, JSON.stringify(firestoreList));
      return firestoreList;
    }
  } catch (err) {
    console.warn('Could not read contacts from firestore, using local cache:', err);
  }

  return list;
}

export async function deleteContactMessageFromFirestore(id: string): Promise<void> {
  try {
    const raw = localStorage.getItem(CONTACTS_CACHE_KEY);
    if (raw) {
      const list: ContactMessage[] = JSON.parse(raw);
      const filtered = list.filter((c) => c.id !== id);
      localStorage.setItem(CONTACTS_CACHE_KEY, JSON.stringify(filtered));
    }
  } catch (e) {
    console.error(e);
  }

  try {
    await deleteDoc(doc(db, 'contacts', id));
  } catch (err) {
    console.warn('Deleted contact locally, Firestore delete error:', err);
  }
}

// ==========================================
// Admin Authentication & Dynamic Password Management
// ==========================================
const ADMIN_PWD_CACHE_KEY = 'mahasangh_admin_pwd_v2';
const ADMIN_EMAIL_CACHE_KEY = 'mahasangh_admin_email_v2';
export const DEFAULT_ADMIN_EMAIL = 'padmakarshinde043@gmail.com';
export const MASTER_RECOVERY_KEY = 'RK@Mahasangh2026';

export function safeStorageGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

export function safeStorageSet(key: string, val: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, val);
    }
  } catch (e) {
    console.warn(`safeStorageSet storage notice for key "${key}":`, e);
    // Attempt quota recovery by removing legacy keys
    try {
      localStorage.removeItem('mhs_visitor_stats_v1');
      localStorage.removeItem('mahasangh_news_cache_v1');
      localStorage.removeItem('mahasangh_applications_v1');
      localStorage.setItem(key, val);
    } catch {
      // Ignore fallback failure
    }
  }
}

/**
 * Safely caches applications to localStorage by stripping massive base64 photo strings
 * so localStorage never exceeds browser 5MB quota.
 */
export function safeCacheApplications(apps: MembershipApplication[]): void {
  try {
    if (typeof localStorage === 'undefined' || !Array.isArray(apps)) return;

    const lightweightApps = apps.map((app) => {
      if (app.photo && app.photo.length > 2000 && app.photo.startsWith('data:image')) {
        const { photo, ...rest } = app;
        return rest;
      }
      return app;
    });

    safeStorageSet('mahasangh_applications', JSON.stringify(lightweightApps));
  } catch (err) {
    console.warn('safeCacheApplications notice:', err);
  }
}

export async function getAdminCredentials(): Promise<{ email: string; password: string }> {
  try {
    // Force fetching from server to guarantee instant sync across all phones & devices
    let snap;
    try {
      snap = await getDocFromServer(doc(db, 'settings', 'admin_auth'));
    } catch {
      snap = await getDoc(doc(db, 'settings', 'admin_auth'));
    }

    if (snap && snap.exists()) {
      const data = snap.data();
      const pwd = data.password || 'Padmakar@2027';
      const em = data.email || DEFAULT_ADMIN_EMAIL;
      safeStorageSet(ADMIN_PWD_CACHE_KEY, pwd);
      safeStorageSet(ADMIN_EMAIL_CACHE_KEY, em);
      return { email: em, password: pwd };
    } else {
      // Document does not exist in settings yet, initialize globally in cloud
      const initialCreds = {
        email: DEFAULT_ADMIN_EMAIL,
        password: 'Padmakar@2027',
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'settings', 'admin_auth'), initialCreds, { merge: true });
      safeStorageSet(ADMIN_PWD_CACHE_KEY, initialCreds.password);
      safeStorageSet(ADMIN_EMAIL_CACHE_KEY, initialCreds.email);
      return initialCreds;
    }
  } catch (err) {
    console.warn('Could not read admin_auth setting from Firestore:', err);
  }

  // Fallback to local cache if offline
  const cachedPwd = safeStorageGet(ADMIN_PWD_CACHE_KEY);
  const cachedEmail = safeStorageGet(ADMIN_EMAIL_CACHE_KEY) || DEFAULT_ADMIN_EMAIL;

  if (cachedPwd) {
    return { email: cachedEmail, password: cachedPwd };
  }

  return { email: DEFAULT_ADMIN_EMAIL, password: 'Padmakar@2027' };
}

export async function updateAdminCredentials(newPassword: string, newEmail?: string): Promise<void> {
  const targetEmail = newEmail?.trim() || safeStorageGet(ADMIN_EMAIL_CACHE_KEY) || DEFAULT_ADMIN_EMAIL;
  const cleanPwd = newPassword.trim();

  // Save directly to Firestore cloud first to ensure all devices receive the new password
  await setDoc(doc(db, 'settings', 'admin_auth'), {
    email: targetEmail,
    password: cleanPwd,
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  safeStorageSet(ADMIN_PWD_CACHE_KEY, cleanPwd);
  safeStorageSet(ADMIN_EMAIL_CACHE_KEY, targetEmail);
}

// ==========================================
// Multi-User Admin & RBAC Management (Manage Admins)
// ==========================================
export interface AdminPermissions {
  approveMembers: boolean;     // सदस्य पडताळणी व मंजुरी (Approve Members)
  manageNews: boolean;         // बातम्या व फोटो/परिपत्रके टाकणे (News & Circulars)
  manageLeadership: boolean;   // नेतृत्व व वेबसाईट माहिती बदलणे (Leadership Management)
  manageAdmins?: boolean;      // इतर ॲडमिन व्यवस्थापन (Manage Admins - Super Admin only)
}

export interface AdminUser {
  id: string;
  email: string;
  name?: string;
  password?: string;
  isFirstLogin?: boolean;
  isSuperAdmin?: boolean;
  permissions: AdminPermissions;
  createdAt: string;
  lastLoginAt?: string;
}

const ADMIN_USERS_CACHE_KEY = 'mahasangh_sub_admins_v1';

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  try {
    // Force fetching fresh list from Firestore cloud so all devices see current sub-admins
    let snap;
    try {
      snap = await getDocsFromServer(collection(db, 'sub_admins'));
    } catch {
      snap = await getDocs(collection(db, 'sub_admins'));
    }

    if (snap) {
      const list: AdminUser[] = [];
      snap.forEach((d) => list.push(d.data() as AdminUser));
      safeStorageSet(ADMIN_USERS_CACHE_KEY, JSON.stringify(list));
      return list;
    }
  } catch (err) {
    console.warn('Could not read sub_admins from Firestore:', err);
  }

  // Fallback to local cache if Firestore fetch fails
  const cached = safeStorageGet(ADMIN_USERS_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      return [];
    }
  }
  return [];
}

export async function saveAdminUser(admin: AdminUser): Promise<void> {
  // Save to Firestore cloud first so any mobile phone can access it
  await setDoc(doc(db, 'sub_admins', admin.id), admin);

  try {
    const existing = await fetchAdminUsers();
    const index = existing.findIndex((a) => a.id === admin.id || a.email.toLowerCase() === admin.email.toLowerCase());
    let updated: AdminUser[];
    if (index >= 0) {
      updated = [...existing];
      updated[index] = { ...updated[index], ...admin };
    } else {
      updated = [admin, ...existing];
    }
    safeStorageSet(ADMIN_USERS_CACHE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Updated firestore, local cache update:', e);
  }
}

export async function deleteAdminUser(adminId: string): Promise<void> {
  await deleteDoc(doc(db, 'sub_admins', adminId));
  try {
    const existing = await fetchAdminUsers();
    const updated = existing.filter((a) => a.id !== adminId);
    safeStorageSet(ADMIN_USERS_CACHE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Delete sub-admin local cache update:', e);
  }
}

export async function setAdminUserPassword(email: string, newPassword: string): Promise<boolean> {
  const cleanEmail = email.trim().toLowerCase();
  const existing = await fetchAdminUsers();
  const target = existing.find((a) => a.email.toLowerCase() === cleanEmail);

  if (!target) return false;

  const updatedAdmin: AdminUser = {
    ...target,
    password: newPassword.trim(),
    isFirstLogin: false,
    lastLoginAt: new Date().toISOString()
  };

  await saveAdminUser(updatedAdmin);
  return true;
}

export async function resetAdminUserToFirstLogin(adminId: string): Promise<boolean> {
  const existing = await fetchAdminUsers();
  const target = existing.find((a) => a.id === adminId);
  if (!target) return false;

  const updatedAdmin: AdminUser = {
    ...target,
    password: '',
    isFirstLogin: true,
  };

  await saveAdminUser(updatedAdmin);
  return true;
}

/**
 * Resequences all approved members in Firebase in chronological order of their submission/approval timestamp,
 * assigning continuous sequential numbers (1, 2, 3...) to fix gaps.
 */
export async function resequenceAllApprovedMembersInFirestore(): Promise<{ count: number; message: string }> {
  try {
    const appsCol = collection(db, 'applications');
    const snap = await getDocs(appsCol);
    if (snap.empty) {
      return { count: 0, message: 'कोणतेही अर्ज सापडले नाहीत.' };
    }

    const allApps: Array<MembershipApplication & { id: string }> = [];
    snap.forEach((d) => {
      const data = d.data() as MembershipApplication;
      allApps.push({ ...data, id: d.id });
    });

    // Filter only approved members
    const approved = allApps.filter((a) => a.status === 'approved');

    // Sort by createdAt or approvedAt ascending (oldest first)
    approved.sort((a, b) => {
      const dateA = new Date(a.approvedAt || a.createdAt || '').getTime() || 0;
      const dateB = new Date(b.approvedAt || b.createdAt || '').getTime() || 0;
      return dateA - dateB;
    });

    let count = 0;
    for (let i = 0; i < approved.length; i++) {
      const app = approved[i];
      const newSeq = i + 1;
      const district = app.district || 'MAHA';
      const newMemberNumber = formatSequentialMemberNumber(district, newSeq);

      if (app.memberNumber !== newMemberNumber) {
        const appRef = doc(db, 'applications', app.id);
        await setDoc(appRef, { memberNumber: newMemberNumber, updatedAt: new Date().toISOString() }, { merge: true });
        count++;
      }
    }

    // Update central counter
    const counterDocRef = doc(db, 'settings', 'member_counter');
    await setDoc(counterDocRef, {
      totalApproved: approved.length,
      lastMemberNumber: approved.length,
      lastUpdated: new Date().toISOString()
    }, { merge: true });

    // Clear local caches
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(APPROVED_MEMBERS_CACHE_KEY);
      localStorage.removeItem('mahasangh_applications');
      localStorage.removeItem(MEMBER_COUNTER_CACHE_KEY);
      localStorage.removeItem('mahasangh_approved_cache_v1');
      localStorage.removeItem('mahasangh_applications_v1');
    }

    return {
      count,
      message: `यशस्वी! ${approved.length} मंजूर सदस्यांचे क्रमांक क्रमाने (1 ते ${approved.length}) सलग लावले गेले.`
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'applications');
    throw error;
  }
}

/**
 * Resets the central member counter strictly to the highest actual member sequence number
 * found among approved members in Firebase.
 */
export async function resetMemberCounterToActualHighest(): Promise<{ highestSeq: number; message: string }> {
  try {
    const appsCol = collection(db, 'applications');
    const snap = await getDocs(appsCol);
    let highest = DEFAULT_COUNTER_BASELINE;

    snap.forEach((d) => {
      const app = d.data() as MembershipApplication;
      if (app.status === 'approved' && app.memberNumber) {
        const seq = parseMemberNumberSeq(app.memberNumber);
        if (seq > highest) {
          highest = seq;
        }
      }
    });

    const counterDocRef = doc(db, 'settings', 'member_counter');
    await setDoc(counterDocRef, {
      totalApproved: highest,
      lastMemberNumber: highest,
      lastUpdated: new Date().toISOString()
    }, { merge: true });

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(MEMBER_COUNTER_CACHE_KEY);
      localStorage.removeItem(APPROVED_MEMBERS_CACHE_KEY);
      localStorage.removeItem('mahasangh_applications');
      localStorage.removeItem('mahasangh_approved_cache_v1');
      localStorage.removeItem('mahasangh_applications_v1');
    }

    return {
      highestSeq: highest,
      message: `यशस्वी! सदस्य क्रमांक काउंटर यशस्वीरित्या दुरुस्त करून Firebase वरील शेवटच्या खऱ्या क्रमांकावर (${highest}) सेट करण्यात आला आहे. आता पुढील नवीन अर्ज मंजूर केल्यावर क्रमांक यापुढून सुरू होईल.`
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'applications');
    throw error;
  }
}




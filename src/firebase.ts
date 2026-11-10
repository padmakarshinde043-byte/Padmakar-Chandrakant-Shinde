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
  limit
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  MembershipApplication,
  NewsItem,
  GovOrder,
  INITIAL_NEWS,
  INITIAL_APPLICATIONS,
  INITIAL_GOV_ORDERS,
} from './data/mahasanghData';

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
  if (sessionStorage.getItem('fb_conn_ok')) {
    return true;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    sessionStorage.setItem('fb_conn_ok', 'true');
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline.');
      return false;
    }
    sessionStorage.setItem('fb_conn_ok', 'true');
    return true;
  }
}

// CACHE-FIRST NEWS FETCHING:
// News is cached in localStorage for 30 minutes.
// Regular visitors reading the website will consume ZERO Firestore reads!
const NEWS_CACHE_KEY = 'mahasangh_news_cache_v2';
const NEWS_CACHE_TIME_KEY = 'mahasangh_news_cache_time_v2';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

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

export async function fetchGovOrders(): Promise<GovOrder[]> {
    try {
        const snap = await getDocs(collection(db, 'gov_orders'));
        if (snap.empty) {
            return [];
        }
        const list: GovOrder[] = [];
        snap.forEach((d) => {
            list.push(d.data() as GovOrder);
        });
        return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch (error) {
        console.warn('Could not read gov_orders from firestore:', error);
        return [];
    }
}

export async function saveGovOrderToFirestore(govOrder: GovOrder): Promise<void> {
    await setDoc(doc(db, 'gov_orders', govOrder.id), govOrder);
}

export async function deleteGovOrderFromFirestore(id: string): Promise<void> {
    await deleteDoc(doc(db, 'gov_orders', id));
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

// Targeted single-document search for status tracking (Consumes 1 read at most, NOT the entire collection!)
export async function trackSingleApplicationInFirestore(
  identifier: string
): Promise<MembershipApplication | null> {
  const queryTerm = identifier.trim();
  if (!queryTerm) return null;

  try {
    // 1. Try by document ID
    const docRef = doc(db, 'applications', queryTerm);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as MembershipApplication;
    }

    // 2. Try by applicationNumber with limit(1)
    const appsCol = collection(db, 'applications');
    const qApp = query(appsCol, where('applicationNumber', '==', queryTerm), limit(1));
    const snapApp = await getDocs(qApp);
    if (!snapApp.empty) {
      return snapApp.docs[0].data() as MembershipApplication;
    }

    // 3. Try by phone with limit(1)
    const qPhone = query(appsCol, where('phone', '==', queryTerm), limit(1));
    const snapPhone = await getDocs(qPhone);
    if (!snapPhone.empty) {
      return snapPhone.docs[0].data() as MembershipApplication;
    }

    return null;
  } catch (error) {
    console.warn('Track query error:', error);
    return null;
  }
}

// Admin only: On-demand applications fetch (Only called when admin logs in or clicks refresh)
export async function fetchApplicationsForAdmin(): Promise<MembershipApplication[]> {
  try {
    const appsCol = collection(db, 'applications');
    const snap = await getDocs(appsCol);
    if (snap.empty) {
      return INITIAL_APPLICATIONS;
    }
    const list: MembershipApplication[] = [];
    snap.forEach((d) => {
      list.push(d.data() as MembershipApplication);
    });
    list.sort(
      (a, b) =>
        new Date(b.createdAt || '').getTime() -
        new Date(a.createdAt || '').getTime()
    );
    return list;
  } catch (error) {
    console.warn('Admin fetch applications error:', error);
    return INITIAL_APPLICATIONS;
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

// Admin only: Delete application permanently from Firestore
export async function deleteApplicationFromFirestore(appId: string): Promise<void> {
  const path = `applications/${appId}`;
  try {
    await deleteDoc(doc(db, 'applications', appId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
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

function safeStorageGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, val: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, val);
    }
  } catch {
    // Ignore storage quota or disabled errors
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


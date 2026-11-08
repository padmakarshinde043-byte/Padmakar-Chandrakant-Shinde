import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
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
  INITIAL_NEWS,
  INITIAL_APPLICATIONS
} from './data/mahasanghData';

const app = initializeApp(firebaseConfig);

export const db = (firebaseConfig.firestoreDatabaseId && !firebaseConfig.firestoreDatabaseId.startsWith('ai-studio-') && firebaseConfig.firestoreDatabaseId !== '(default)')
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
      loadedNews.push(d.data() as NewsItem);
    });

    localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(loadedNews));
    localStorage.setItem(NEWS_CACHE_TIME_KEY, Date.now().toString());
    return loadedNews;
  } catch (error) {
    console.warn('Using cached/default news due to network:', error);
    const cachedData = localStorage.getItem(NEWS_CACHE_KEY);
    if (cachedData) return JSON.parse(cachedData);
    return INITIAL_NEWS;
  }
}

// Single write when admin publishes news
export async function saveNewsToFirestore(news: NewsItem): Promise<void> {
  const path = `news/${news.id}`;
  try {
    await setDoc(doc(db, 'news', news.id), {
      ...news,
      createdAt: new Date().toISOString(),
    });
    // Immediately invalidate and update local cache
    const currentCached = localStorage.getItem(NEWS_CACHE_KEY);
    const list: NewsItem[] = currentCached ? JSON.parse(currentCached) : [];
    const updated = [news, ...list.filter((x) => x.id !== news.id)];
    localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(updated));
    localStorage.setItem(NEWS_CACHE_TIME_KEY, Date.now().toString());
    window.dispatchEvent(new CustomEvent('mahasangh_news_updated', { detail: updated }));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// Delete news from Firestore and update local cache
export async function deleteNewsFromFirestore(newsId: string): Promise<void> {
  const path = `news/${newsId}`;
  try {
    await deleteDoc(doc(db, 'news', newsId));
    const currentCached = localStorage.getItem(NEWS_CACHE_KEY);
    const list: NewsItem[] = currentCached ? JSON.parse(currentCached) : [];
    const updated = list.filter((x) => x.id !== newsId);
    localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(updated));
    localStorage.setItem(NEWS_CACHE_TIME_KEY, Date.now().toString());
    window.dispatchEvent(new CustomEvent('mahasangh_news_updated', { detail: updated }));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Single write when member registers
export async function saveApplicationToFirestore(app: MembershipApplication): Promise<void> {
  const path = `applications/${app.id}`;
  try {
    await setDoc(doc(db, 'applications', app.id), app);
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

// Admin only: Approve application (1 write)
export async function approveApplicationInFirestore(
  appId: string,
  memberNumber: string
): Promise<void> {
  const path = `applications/${appId}`;
  try {
    await updateDoc(doc(db, 'applications', appId), {
      status: 'approved',
      memberNumber,
      approvedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
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

export async function getAdminCredentials(): Promise<{ email: string; password: string }> {
  const cachedPwd = localStorage.getItem(ADMIN_PWD_CACHE_KEY);
  const cachedEmail = localStorage.getItem(ADMIN_EMAIL_CACHE_KEY) || DEFAULT_ADMIN_EMAIL;

  if (cachedPwd) {
    return { email: cachedEmail, password: cachedPwd };
  }

  try {
    const snap = await getDoc(doc(db, 'settings', 'admin_auth'));
    if (snap.exists()) {
      const data = snap.data();
      const pwd = data.password || '1234';
      const em = data.email || DEFAULT_ADMIN_EMAIL;
      localStorage.setItem(ADMIN_PWD_CACHE_KEY, pwd);
      localStorage.setItem(ADMIN_EMAIL_CACHE_KEY, em);
      return { email: em, password: pwd };
    }
  } catch (err) {
    console.warn('Could not read admin_auth setting:', err);
  }

  return { email: DEFAULT_ADMIN_EMAIL, password: '1234' };
}

export async function updateAdminCredentials(newPassword: string, newEmail?: string): Promise<void> {
  const targetEmail = newEmail?.trim() || localStorage.getItem(ADMIN_EMAIL_CACHE_KEY) || DEFAULT_ADMIN_EMAIL;
  const cleanPwd = newPassword.trim();

  localStorage.setItem(ADMIN_PWD_CACHE_KEY, cleanPwd);
  localStorage.setItem(ADMIN_EMAIL_CACHE_KEY, targetEmail);

  try {
    await setDoc(doc(db, 'settings', 'admin_auth'), {
      email: targetEmail,
      password: cleanPwd,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (err) {
    console.warn('Saved admin credentials locally, firestore sync failed:', err);
  }
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
    const snap = await getDocs(collection(db, 'sub_admins'));
    if (!snap.empty) {
      const list: AdminUser[] = [];
      snap.forEach((d) => list.push(d.data() as AdminUser));
      localStorage.setItem(ADMIN_USERS_CACHE_KEY, JSON.stringify(list));
      return list;
    }
  } catch (err) {
    console.warn('Could not read sub_admins from firestore, using local cache:', err);
  }

  const cached = localStorage.getItem(ADMIN_USERS_CACHE_KEY);
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
  // Update local cache immediately
  const existing = await fetchAdminUsers();
  const index = existing.findIndex((a) => a.id === admin.id || a.email.toLowerCase() === admin.email.toLowerCase());
  let updated: AdminUser[];
  if (index >= 0) {
    updated = [...existing];
    updated[index] = { ...updated[index], ...admin };
  } else {
    updated = [admin, ...existing];
  }
  localStorage.setItem(ADMIN_USERS_CACHE_KEY, JSON.stringify(updated));

  try {
    await setDoc(doc(db, 'sub_admins', admin.id), admin);
  } catch (err) {
    console.warn('Saved sub-admin locally, firestore sync failed:', err);
  }
}

export async function deleteAdminUser(adminId: string): Promise<void> {
  const existing = await fetchAdminUsers();
  const updated = existing.filter((a) => a.id !== adminId);
  localStorage.setItem(ADMIN_USERS_CACHE_KEY, JSON.stringify(updated));

  try {
    await deleteDoc(doc(db, 'sub_admins', adminId));
  } catch (err) {
    console.warn('Deleted sub-admin locally, firestore delete failed:', err);
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


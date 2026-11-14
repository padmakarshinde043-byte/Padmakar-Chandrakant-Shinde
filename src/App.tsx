import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { HomeTab } from './components/HomeTab';

const loadAboutTab = () => import('./components/AboutTab');
const loadLeadershipTab = () => import('./components/LeadershipTab');
const loadNewsTab = () => import('./components/NewsTab');
const loadMembershipTab = () => import('./components/MembershipTab');
const loadContactTab = () => import('./components/ContactTab');
const loadAdminTab = () => import('./components/AdminTab');
const loadAppointmentsTab = () => import('./components/AppointmentsTab');

const AboutTab = lazy(() => loadAboutTab().then((m) => ({ default: m.AboutTab })));
const LeadershipTab = lazy(() => loadLeadershipTab().then((m) => ({ default: m.LeadershipTab })));
const NewsTab = lazy(() => loadNewsTab().then((m) => ({ default: m.NewsTab })));
const MembershipTab = lazy(() => loadMembershipTab().then((m) => ({ default: m.MembershipTab })));
const ContactTab = lazy(() => loadContactTab().then((m) => ({ default: m.ContactTab })));
const AdminTab = lazy(() => loadAdminTab().then((m) => ({ default: m.AdminTab })));
const AppointmentsTab = lazy(() => loadAppointmentsTab().then((m) => ({ default: m.AppointmentsTab })));

const prefetchTabChunk = (tabId: string) => {
  switch (tabId) {
    case 'about':
    case 'objectives':
      loadAboutTab();
      break;
    case 'leadership':
      loadLeadershipTab();
      break;
    case 'appointments':
      loadAppointmentsTab();
      break;
    case 'news':
      loadNewsTab();
      break;
    case 'membership':
      loadMembershipTab();
      break;
    case 'contact':
      loadContactTab();
      break;
    case 'admin':
      loadAdminTab();
      break;
    default:
      break;
  }
};

const TabLoadingFallback: React.FC = () => (
  <div className="min-h-[52vh] flex flex-col items-center justify-center py-16 px-4 bg-[#fbf8f2] text-[#0b1e36]">
    <div className="w-9 h-9 rounded-full border-[3px] border-amber-500/30 border-t-[#df6b16] animate-spin mb-3" />
    <p className="text-sm font-bold text-[#0b1e36]/80">विभाग उघडत आहे...</p>
  </div>
);
import {
  INITIAL_NEWS,
  INITIAL_APPLICATIONS,
  INITIAL_GOV_ORDERS,
  NewsItem,
  MembershipApplication,
  GovOrder,
} from './data/mahasanghData';
import {
  testConnectionOncePerSession,
  fetchNewsCached,
  fetchGovOrders,
  saveNewsToFirestore,
  saveApplicationToFirestore,
  trackSingleApplicationDetailed,
  purgeStaleApplicationFromCachesByContact,
  fetchApplicationsForAdmin,
  fetchApprovedMembersCached,
  safeCacheApplications,
  safeStorageGet,
  approveApplicationInFirestore,
  rejectApplicationInFirestore,
  deleteApplicationFromFirestore,
  updateMemberInFirestore,
  saveContactToFirestore,
  deleteNewsFromFirestore,
  sortNewsDescending,
} from './firebase';
import {
  shouldRemoveFromCacheOnDelete,
  normalizePhone10,
} from './utils/applicationCleanup';
import { fetchDynamicLeaders, fetchOfficials, fetchAppointedPosts } from './services/rkFirebaseService';

function isPathAdminRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
  const hash = window.location.hash.toLowerCase();
  return path === '/admin' || hash === '#admin' || hash === '#/admin';
}

export function App() {
  const [currentTab, setCurrentTab] = useState<string>(() => (isPathAdminRoute() ? 'admin' : 'home'));
  const [visitedTabs, setVisitedTabs] = useState<Record<string, boolean>>(() => ({
    [isPathAdminRoute() ? 'admin' : 'home']: true,
  }));
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [isRefreshingNews, setIsRefreshingNews] = useState(false);
  const [isLoadingAdminApps, setIsLoadingAdminApps] = useState(false);

  // Track visited tabs so only active/visited tabs mount on mobile (eliminates heavy startup DOM & network burst)
  useEffect(() => {
    const normalized = currentTab === 'objectives' ? 'about' : currentTab;
    setVisitedTabs((prev) => (prev[normalized] ? prev : { ...prev, [normalized]: true }));
  }, [currentTab]);

  // Applications state (Starts from local storage, defaults to empty array)
  const [applications, setApplications] = useState<MembershipApplication[]>(() => {
    try {
      const saved = safeStorageGet('mahasangh_applications');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  const [govOrders, setGovOrders] = useState<GovOrder[]>([]);

  // News state (Starts from local storage or cached data, always newest first)
  const [newsList, setNewsList] = useState<NewsItem[]>(() => {
    try {
      const saved = localStorage.getItem('mahasangh_news_cache_v2');
      if (saved) return sortNewsDescending(JSON.parse(saved));
    } catch (e) {
      console.error(e);
    }
    return sortNewsDescending(INITIAL_NEWS);
  });

  // Listen to browser URL changes (e.g. /admin or #admin)
  useEffect(() => {
    const handleLocationChange = () => {
      if (isPathAdminRoute()) {
        setCurrentTab('admin');
      } else if (currentTab === 'admin') {
        setCurrentTab('home');
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [currentTab]);

  // Global Right Click & Copy (Ctrl+C / Selection) Protection across website
  useEffect(() => {
    const isEditableElement = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (target.isContentEditable) return true;
      return Boolean(target.closest('input, textarea, select, [contenteditable="true"], .allow-copy'));
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (isEditableElement(e.target)) return;
      e.preventDefault();
      return false;
    };

    const handleCopyOrCutOrSelect = (e: Event) => {
      if (isEditableElement(e.target)) return;
      e.preventDefault();
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableElement(e.target)) return;
      const key = (e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'a', 'u', 's', 'p'].includes(key)) {
        e.preventDefault();
        return false;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c'].includes(key)) {
        e.preventDefault();
        return false;
      }
    };

    document.addEventListener('contextmenu', handleContextMenu, { capture: true });
    document.addEventListener('copy', handleCopyOrCutOrSelect, { capture: true });
    document.addEventListener('cut', handleCopyOrCutOrSelect, { capture: true });
    document.addEventListener('selectstart', handleCopyOrCutOrSelect, { capture: true });
    document.addEventListener('dragstart', handleCopyOrCutOrSelect, { capture: true });
    document.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, { capture: true } as any);
      document.removeEventListener('copy', handleCopyOrCutOrSelect, { capture: true } as any);
      document.removeEventListener('cut', handleCopyOrCutOrSelect, { capture: true } as any);
      document.removeEventListener('selectstart', handleCopyOrCutOrSelect, { capture: true } as any);
      document.removeEventListener('dragstart', handleCopyOrCutOrSelect, { capture: true } as any);
      document.removeEventListener('keydown', handleKeyDown, { capture: true } as any);
    };
  }, []);

  // On initial mount: load cached news & circulars immediately without blocking UI, then idle-prefetch directories
  useEffect(() => {
    // 1. Session-level connection check runs asynchronously without blocking data or paint
    testConnectionOncePerSession().catch(() => {});

    // 2. Load news & gov orders in parallel (0 Firestore reads if valid cache exists)
    Promise.allSettled([fetchNewsCached(false), fetchGovOrders()])
      .then(([newsRes, govRes]) => {
        if (newsRes.status === 'fulfilled') setNewsList(newsRes.value);
        if (govRes.status === 'fulfilled') setGovOrders(govRes.value);
      })
      .catch((err) => {
        console.warn('Data init error:', err);
      });

    // 3. Defer secondary leadership/officials prefetch until browser is idle after first paint
    const runIdlePrefetch = () => {
      fetchDynamicLeaders(false).catch((err) => {
        console.warn('Dynamic leaders prefetch warning:', err);
      });
      fetchOfficials(false).catch(() => {});
      fetchAppointedPosts(false).catch(() => {});
    };

    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    let idleId: number | undefined;
    let timerId: number | undefined;
    if (typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback(runIdlePrefetch, { timeout: 2500 });
    } else {
      timerId = window.setTimeout(runIdlePrefetch, 1500);
    }

    // Instant local synchronization when admin publishes news or circulars
    const handleNewsSync = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && Array.isArray(customEvent.detail)) {
        setNewsList(customEvent.detail);
      }
    };
    window.addEventListener('mahasangh_news_updated', handleNewsSync);
    return () => {
      window.removeEventListener('mahasangh_news_updated', handleNewsSync);
      if (idleId !== undefined && typeof win.cancelIdleCallback === 'function') {
        win.cancelIdleCallback(idleId);
      }
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  // Applications loading:
  // - Admin Panel fetches once right after successful login (inside AdminTab) + via manual Refresh button (zero background polling/reads).
  // - Public Membership tab uses Smart Cache of approved members (0 Firestore reads if cached).
  useEffect(() => {
    if (currentTab === 'membership') {
      fetchApprovedMembersCached(false)
        .then((approved) => {
          if (Array.isArray(approved)) {
            setApplications(approved);
          }
        })
        .catch((err) => console.warn('Public approved members cache load notice:', err));
    }
  }, [currentTab]);

  // Exit Admin to Main Public Website
  const handleExitAdmin = () => {
    setCurrentTab('home');
    if (window.location.pathname.toLowerCase() === '/admin') {
      window.history.pushState(null, '', '/');
    } else if (window.location.hash.toLowerCase().includes('admin')) {
      window.history.pushState(null, '', window.location.pathname);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Manual News Refresh (Only reads Firestore when explicitly requested)
  const handleRefreshNews = async () => {
    setIsRefreshingNews(true);
    try {
      const freshNews = await fetchNewsCached(true);
      setNewsList(freshNews);
    } catch (err) {
      console.warn('Failed to refresh news:', err);
    } finally {
      setIsRefreshingNews(false);
    }
  };

  // Add application (optionally skip Firestore write if already written atomically)
  const handleAddApplication = async (
    newApp: MembershipApplication,
    options?: { skipFirestore?: boolean }
  ) => {
    setApplications((prev) => {
      const updated = [newApp, ...prev.filter((a) => a.id !== newApp.id)];
      safeCacheApplications(updated);
      return updated;
    });

    if (options?.skipFirestore) return;

    try {
      await saveApplicationToFirestore(newApp);
    } catch (err) {
      console.warn('Saved application locally, Firestore sync error:', err);
    }
  };

  // Self-heal stale local caches & React state when Firestore confirms a record was deleted
  const handlePurgeLocalContact = (params: { phone?: string; email?: string; queryTerm?: string }) => {
    purgeStaleApplicationFromCachesByContact({ phone: params.phone, email: params.email });
    setApplications((prev) => {
      const q = (params.queryTerm || '').trim().toLowerCase();
      const qDigits = q.replace(/\D/g, '');
      const filtered = prev.filter((a) => {
        if (params.phone || params.email) {
          if (
            shouldRemoveFromCacheOnDelete(
              a,
              { id: '', phone: params.phone, email: params.email },
              { removeAllMatchingPhone: true }
            )
          ) {
            return false;
          }
        }
        if (q) {
          const sameAppNo = a.applicationNumber && a.applicationNumber.toLowerCase() === q;
          const sameMemberNo = a.memberNumber && a.memberNumber.toLowerCase() === q;
          const samePhone = qDigits.length >= 10 && normalizePhone10(a.phone) === qDigits.slice(-10);
          if (sameAppNo || sameMemberNo || samePhone) {
            return false;
          }
        }
        return true;
      });
      safeCacheApplications(filtered);
      return filtered;
    });
  };

  // Single-document tracking (At most a few targeted reads)
  const handleTrackRemote = async (queryTerm: string): Promise<MembershipApplication | null> => {
    try {
      const { app: found, verifiedFromServer } = await trackSingleApplicationDetailed(queryTerm);
      if (found) {
        // Update or insert found app locally so edited details / photos reflect immediately
        setApplications((prev) => {
          const exists = prev.some((a) => a.id === found.id);
          const updated = exists
            ? prev.map((a) => (a.id === found.id ? found : a))
            : [found, ...prev];
          safeCacheApplications(updated);
          return updated;
        });
      } else if (verifiedFromServer) {
        // Firestore confirmed this exact identifier does not exist (deleted) -> clean stale local copies
        const digits = queryTerm.replace(/\D/g, '');
        handlePurgeLocalContact({
          phone: digits.length >= 10 ? digits.slice(-10) : undefined,
          queryTerm,
        });
      }
      return found;
    } catch (err) {
      console.warn('Remote tracking error:', err);
      return null;
    }
  };

  // Admin: Fetch applications on demand (pass forceRefresh=true for manual Refresh / after cleanup)
  const handleFetchAdminApplications = async (forceRefresh = false) => {
    setIsLoadingAdminApps(true);
    try {
      const list = await fetchApplicationsForAdmin(forceRefresh);
      setApplications(list);
      safeCacheApplications(list);
    } catch (err) {
      console.warn('Fetch admin applications error:', err);
    } finally {
      setIsLoadingAdminApps(false);
    }
  };

  // Admin: Approve application (syncs state & localStorage; skips Firestore write if already committed atomically)
  const handleApproveApplication = async (
    id: string,
    memberNumber: string,
    options?: { skipFirestore?: boolean }
  ) => {
    setApplications((prev) => {
      const updated = prev.map((app) =>
        app.id === id
          ? {
              ...app,
              status: 'approved' as const,
              memberNumber,
              paymentConfirmed: true,
              approvedAt: app.approvedAt || new Date().toISOString(),
            }
          : app
      );
      safeCacheApplications(updated);
      return updated;
    });

    if (options?.skipFirestore) return;

    try {
      await approveApplicationInFirestore(id, memberNumber);
    } catch (err) {
      console.warn('Approved locally, Firestore sync error:', err);
    }
  };

  // Admin: Reject application (Single write, syncs state & localStorage & Firestore)
  const handleRejectApplication = async (id: string, reason: string) => {
    setApplications((prev) => {
      const updated = prev.map((app) =>
        app.id === id
          ? {
              ...app,
              status: 'rejected' as const,
              rejectReason: reason,
              rejectedAt: new Date().toISOString(),
            }
          : app
      );
      safeCacheApplications(updated);
      return updated;
    });

    try {
      await rejectApplicationInFirestore(id, reason);
    } catch (err) {
      console.warn('Rejected locally, Firestore sync error:', err);
    }
  };

  // Admin: Delete application permanently (deletes Firestore doc + duplicates/ghosts, then purges state & all caches)
  const handleDeleteApplication = async (id: string) => {
    const targetApp = applications.find((app) => app.id === id);
    const res = await deleteApplicationFromFirestore(id, targetApp);

    setApplications((prev) => {
      const targetMeta = {
        id,
        applicationNumber: targetApp?.applicationNumber,
        phone: targetApp?.phone,
        email: targetApp?.email,
        status: targetApp?.status,
      };
      const updated = prev.filter(
        (app) =>
          !res.deletedDocIds.includes(app.id) &&
          !shouldRemoveFromCacheOnDelete(app, targetMeta, {
            removeAllMatchingPhone: res.removedAllForPhone,
          })
      );
      safeCacheApplications(updated);
      return updated;
    });
  };

  // Admin: Full Member Edit / Update (memberNumber & all fields, syncs state, cache & Firestore)
  const handleUpdateMember = async (updatedMember: MembershipApplication) => {
    setApplications((prev) => {
      const exists = prev.some((app) => app.id === updatedMember.id);
      const updated = exists
        ? prev.map((app) => (app.id === updatedMember.id ? updatedMember : app))
        : [updatedMember, ...prev];
      safeCacheApplications(updated);
      return updated;
    });

    await updateMemberInFirestore(updatedMember);
  };

  // Admin: Add news (Single write, sorted newest first)
  const handleAddNews = async (newNews: NewsItem) => {
    const itemWithTime = {
      ...newNews,
      createdAt: newNews.createdAt || new Date().toISOString(),
    };
    setNewsList((prev) => sortNewsDescending([itemWithTime, ...prev.filter((x) => x.id !== newNews.id)]));

    try {
      await saveNewsToFirestore(itemWithTime);
    } catch (err) {
      console.warn('Saved news locally, Firestore sync error:', err);
    }
  };

  // Admin: Update existing news / circular
  const handleUpdateNews = async (updatedNews: NewsItem) => {
    setNewsList((prev) =>
      sortNewsDescending(prev.map((item) => (item.id === updatedNews.id ? updatedNews : item)))
    );

    try {
      await saveNewsToFirestore(updatedNews);
    } catch (err) {
      console.warn('Updated news locally, Firestore sync error:', err);
    }
  };

  // Admin: Delete news / circular
  const handleDeleteNews = async (newsId: string) => {
    setNewsList((prev) => prev.filter((item) => item.id !== newsId));

    try {
      await deleteNewsFromFirestore(newsId);
    } catch (err) {
      console.warn('Deleted news locally, Firestore sync error:', err);
    }
  };

  // Public: Send contact message (Single write, 0 reads)
  const handleSaveContact = async (contact: {
    id: string;
    name: string;
    phone: string;
    email?: string;
    district?: string;
    subject?: string;
    message: string;
    createdAt: string;
  }) => {
    try {
      await saveContactToFirestore(contact);
    } catch (err) {
      console.warn('Saved contact locally / log:', err);
    }
  };

  const handleSelectNews = (news: NewsItem) => {
    setSelectedNews(news);
    setCurrentTab('news');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // =========================================================================
  // Standalone Administration View (mahasangh.in/admin or #admin)
  // Fully isolated from public navigation
  // =========================================================================
  if (currentTab === 'admin') {
    return (
      <Suspense fallback={<TabLoadingFallback />}>
        <AdminTab
          applications={applications}
          onApproveApplication={handleApproveApplication}
          onRejectApplication={handleRejectApplication}
          onDeleteApplication={handleDeleteApplication}
          onUpdateMember={handleUpdateMember}
          onAddNews={handleAddNews}
          onUpdateNews={handleUpdateNews}
          onDeleteNews={handleDeleteNews}
          govOrders={govOrders}
          setGovOrders={setGovOrders}
          newsList={newsList}
          onFetchApplications={handleFetchAdminApplications}
          isLoadingApps={isLoadingAdminApps}
          onExitAdmin={handleExitAdmin}
        />
      </Suspense>
    );
  }

  // =========================================================================
  // Public Website View (Header without Admin link, Footer without Admin link)
  // =========================================================================
  return (
    <div className="min-h-screen flex flex-col bg-[#fbf8f2] text-[#102a43]">
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onPrefetchTab={prefetchTabChunk}
      />

      <main className="flex-1">
        {(visitedTabs.home || currentTab === 'home') && (
          <div className={currentTab === 'home' ? 'block mhs-tab-enter' : 'hidden'}>
            <HomeTab
              setCurrentTab={setCurrentTab}
              onSelectNews={handleSelectNews}
              newsList={newsList}
            />
          </div>
        )}

        <Suspense fallback={<TabLoadingFallback />}>
          {(visitedTabs.about || currentTab === 'about' || currentTab === 'objectives') && (
            <div className={currentTab === 'about' || currentTab === 'objectives' ? 'block mhs-tab-enter' : 'hidden'}>
              <AboutTab setCurrentTab={setCurrentTab} />
            </div>
          )}
          {(visitedTabs.leadership || currentTab === 'leadership') && (
            <div className={currentTab === 'leadership' ? 'block mhs-tab-enter' : 'hidden'}>
              <LeadershipTab setCurrentTab={setCurrentTab} />
            </div>
          )}
          {(visitedTabs.appointments || currentTab === 'appointments') && (
            <div className={currentTab === 'appointments' ? 'block mhs-tab-enter' : 'hidden'}>
              <AppointmentsTab />
            </div>
          )}
          {(visitedTabs.news || currentTab === 'news') && (
            <div className={currentTab === 'news' ? 'block mhs-tab-enter' : 'hidden'}>
              <NewsTab
                newsList={newsList}
                govOrders={govOrders}
                selectedNews={selectedNews}
                setSelectedNews={setSelectedNews}
                onRefreshNews={handleRefreshNews}
                isRefreshing={isRefreshingNews}
              />
            </div>
          )}
          {(visitedTabs.membership || currentTab === 'membership') && (
            <div className={currentTab === 'membership' ? 'block mhs-tab-enter' : 'hidden'}>
              <MembershipTab
                applications={applications}
                onAddApplication={handleAddApplication}
                onTrackRemote={handleTrackRemote}
                onPurgeLocalContact={handlePurgeLocalContact}
              />
            </div>
          )}
          {(visitedTabs.contact || currentTab === 'contact') && (
            <div className={currentTab === 'contact' ? 'block mhs-tab-enter' : 'hidden'}>
              <ContactTab onSaveContact={handleSaveContact} />
            </div>
          )}
        </Suspense>
      </main>

      <Footer setCurrentTab={setCurrentTab} />
    </div>
  );
}

export default App;

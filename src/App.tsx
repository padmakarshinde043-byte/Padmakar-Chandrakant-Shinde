import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { HomeTab } from './components/HomeTab';
import { AboutTab } from './components/AboutTab';
import { ObjectivesTab } from './components/ObjectivesTab';
import { LeadershipTab } from './components/LeadershipTab';
import { NewsTab } from './components/NewsTab';
import { MembershipTab } from './components/MembershipTab';
import { ContactTab } from './components/ContactTab';
import { AdminTab } from './components/AdminTab';
import { AppointmentsTab } from './components/AppointmentsTab';
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
  trackSingleApplicationInFirestore,
  fetchApplicationsForAdmin,
  approveApplicationInFirestore,
  rejectApplicationInFirestore,
  deleteApplicationFromFirestore,
  saveContactToFirestore,
  deleteNewsFromFirestore,
  sortNewsDescending,
} from './firebase';

function isPathAdminRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
  const hash = window.location.hash.toLowerCase();
  return path === '/admin' || hash === '#admin' || hash === '#/admin';
}

export function App() {
  const [currentTab, setCurrentTab] = useState<string>(() => (isPathAdminRoute() ? 'admin' : 'home'));
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [isRefreshingNews, setIsRefreshingNews] = useState(false);
  const [isLoadingAdminApps, setIsLoadingAdminApps] = useState(false);

  // Applications state (Starts from local storage to prevent unnecessary reads)
  const [applications, setApplications] = useState<MembershipApplication[]>(() => {
    try {
      const saved = localStorage.getItem('mahasangh_applications');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return INITIAL_APPLICATIONS;
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

  // Global Right Click Protection across entire website (As requested)
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };
    document.addEventListener('contextmenu', handleContextMenu, { capture: true });
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, { capture: true } as any);
    };
  }, []);

  // On initial mount: test connection once per session & load cached news (0 reads if cached!)
  useEffect(() => {
    const initApp = async () => {
      // 1. Session-level connection test (max 1 read per user session)
      await testConnectionOncePerSession();

      // 2. Load news with 30-minute cache (0 reads if valid cache exists)
      try {
        const news = await fetchNewsCached(false);
        setNewsList(news);
        const govOrders = await fetchGovOrders();
        setGovOrders(govOrders);
      } catch (err) {
        console.warn('Data init error:', err);
      }
    };

    initApp();

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
    };
  }, []);

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

  // Add application (Single write, 0 reads)
  const handleAddApplication = async (newApp: MembershipApplication) => {
    setApplications((prev) => [newApp, ...prev]);
    localStorage.setItem(
      'mahasangh_applications',
      JSON.stringify([newApp, ...applications])
    );

    try {
      await saveApplicationToFirestore(newApp);
    } catch (err) {
      console.warn('Saved application locally, Firestore sync error:', err);
    }
  };

  // Single-document tracking (At most 1 read)
  const handleTrackRemote = async (queryTerm: string): Promise<MembershipApplication | null> => {
    try {
      const found = await trackSingleApplicationInFirestore(queryTerm);
      if (found) {
        // Cache found app locally
        setApplications((prev) => {
          if (prev.some((a) => a.id === found.id)) return prev;
          return [found, ...prev];
        });
      }
      return found;
    } catch (err) {
      console.warn('Remote tracking error:', err);
      return null;
    }
  };

  // Admin: Fetch applications on demand (Only reads when admin logs in or clicks refresh)
  const handleFetchAdminApplications = async () => {
    setIsLoadingAdminApps(true);
    try {
      const list = await fetchApplicationsForAdmin();
      setApplications(list);
      localStorage.setItem('mahasangh_applications', JSON.stringify(list));
    } catch (err) {
      console.warn('Fetch admin applications error:', err);
    } finally {
      setIsLoadingAdminApps(false);
    }
  };

  // Admin: Approve application (Single write)
  const handleApproveApplication = async (id: string, memberNumber: string) => {
    setApplications((prev) =>
      prev.map((app) =>
        app.id === id
          ? {
              ...app,
              status: 'approved',
              memberNumber,
              approvedAt: new Date().toISOString(),
            }
          : app
      )
    );

    try {
      await approveApplicationInFirestore(id, memberNumber);
    } catch (err) {
      console.warn('Approved locally, Firestore sync error:', err);
    }
  };

  // Admin: Reject application (Single write)
  const handleRejectApplication = async (id: string, reason: string) => {
    setApplications((prev) =>
      prev.map((app) =>
        app.id === id
          ? {
              ...app,
              status: 'rejected',
              rejectReason: reason,
              rejectedAt: new Date().toISOString(),
            }
          : app
      )
    );

    try {
      await rejectApplicationInFirestore(id, reason);
    } catch (err) {
      console.warn('Rejected locally, Firestore sync error:', err);
    }
  };

  // Admin: Delete application permanently
  const handleDeleteApplication = async (id: string) => {
    setApplications((prev) => prev.filter((app) => app.id !== id));

    try {
      await deleteApplicationFromFirestore(id);
    } catch (err) {
      console.warn('Deleted locally, Firestore sync error:', err);
    }
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
      <AdminTab
        applications={applications}
        onApproveApplication={handleApproveApplication}
        onRejectApplication={handleRejectApplication}
        onDeleteApplication={handleDeleteApplication}
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
    );
  }

  // =========================================================================
  // Public Website View (Header without Admin link, Footer without Admin link)
  // =========================================================================
  return (
    <div className="min-h-screen flex flex-col bg-[#fbf8f2] text-[#102a43]">
      <Header currentTab={currentTab} setCurrentTab={setCurrentTab} />

      <main className="flex-1">
        {currentTab === 'home' && (
          <HomeTab
            setCurrentTab={setCurrentTab}
            onSelectNews={handleSelectNews}
            newsList={newsList}
          />
        )}
        {currentTab === 'about' && <AboutTab setCurrentTab={setCurrentTab} />}
        {currentTab === 'objectives' && (
          <ObjectivesTab setCurrentTab={setCurrentTab} />
        )}
        {currentTab === 'leadership' && (
          <LeadershipTab setCurrentTab={setCurrentTab} />
        )}
        {currentTab === 'appointments' && <AppointmentsTab />}
        {currentTab === 'news' && (
          <NewsTab
            newsList={newsList}
            govOrders={govOrders}
            selectedNews={selectedNews}
            setSelectedNews={setSelectedNews}
            onRefreshNews={handleRefreshNews}
            isRefreshing={isRefreshingNews}
          />
        )}
        {currentTab === 'membership' && (
          <MembershipTab
            applications={applications}
            onAddApplication={handleAddApplication}
            onTrackRemote={handleTrackRemote}
          />
        )}
        {currentTab === 'contact' && <ContactTab onSaveContact={handleSaveContact} />}
      </main>

      <Footer setCurrentTab={setCurrentTab} />
    </div>
  );
}

export default App;

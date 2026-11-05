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
import {
  INITIAL_NEWS,
  INITIAL_APPLICATIONS,
  NewsItem,
  MembershipApplication,
} from './data/mahasanghData';

export function App() {
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);

  // Initialize applications from localStorage or defaults
  const [applications, setApplications] = useState<MembershipApplication[]>(() => {
    try {
      const saved = localStorage.getItem('mahasangh_applications');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return INITIAL_APPLICATIONS;
  });

  // Initialize news from localStorage or defaults
  const [newsList, setNewsList] = useState<NewsItem[]>(() => {
    try {
      const saved = localStorage.getItem('mahasangh_news');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return INITIAL_NEWS;
  });

  // Save applications to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('mahasangh_applications', JSON.stringify(applications));
    } catch (e) {
      console.error(e);
    }
  }, [applications]);

  // Save news to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('mahasangh_news', JSON.stringify(newsList));
    } catch (e) {
      console.error(e);
    }
  }, [newsList]);

  const handleAddApplication = (newApp: MembershipApplication) => {
    setApplications((prev) => [newApp, ...prev]);
  };

  const handleApproveApplication = (id: string, memberNumber: string) => {
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
  };

  const handleAddNews = (newNews: NewsItem) => {
    setNewsList((prev) => [newNews, ...prev]);
  };

  const handleSelectNews = (news: NewsItem) => {
    setSelectedNews(news);
    setCurrentTab('news');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fbf8f2] text-[#102a43]">
      <Header currentTab={currentTab} setCurrentTab={setCurrentTab} />

      <main className="flex-1">
        {currentTab === 'home' && (
          <HomeTab
            setCurrentTab={setCurrentTab}
            onSelectNews={handleSelectNews}
          />
        )}
        {currentTab === 'about' && <AboutTab setCurrentTab={setCurrentTab} />}
        {currentTab === 'objectives' && (
          <ObjectivesTab setCurrentTab={setCurrentTab} />
        )}
        {currentTab === 'leadership' && (
          <LeadershipTab setCurrentTab={setCurrentTab} />
        )}
        {currentTab === 'news' && (
          <NewsTab
            newsList={newsList}
            selectedNews={selectedNews}
            setSelectedNews={setSelectedNews}
          />
        )}
        {currentTab === 'membership' && (
          <MembershipTab
            applications={applications}
            onAddApplication={handleAddApplication}
          />
        )}
        {currentTab === 'contact' && <ContactTab />}
        {currentTab === 'admin' && (
          <AdminTab
            applications={applications}
            onApproveApplication={handleApproveApplication}
            onAddNews={handleAddNews}
          />
        )}
      </main>

      <Footer setCurrentTab={setCurrentTab} />
    </div>
  );
}

export default App;

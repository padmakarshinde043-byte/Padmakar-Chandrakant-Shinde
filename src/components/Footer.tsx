import React, { useState, useEffect } from 'react';
import { Eye, Users, Lock } from 'lucide-react';
import { ORG_DETAILS } from '../data/mahasanghData';
import { getVisitorCountsOncePerSession, getTodayISTString, getMsUntilNextISTMidnight, VisitorStats } from '../firebase';

interface FooterProps {
  setCurrentTab?: (tab: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ setCurrentTab }) => {
  const [visitorStats, setVisitorStats] = useState<VisitorStats>(() => {
    try {
      localStorage.removeItem('mhs_visitor_stats_v1');
      localStorage.removeItem('mhs_visitor_stats');
      localStorage.removeItem('mhs_real_visit_count_v5');
      const todayStr = getTodayISTString();
      const raw = localStorage.getItem('mhs_real_visit_count_v6');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.total === 'number') {
          return {
            today: parsed.date === todayStr && typeof parsed.today === 'number' ? Math.max(parsed.today, 1) : 1,
            total: parsed.total
          };
        }
      }
    } catch {
      // fallback
    }
    return { today: 1, total: 5155 };
  });

  useEffect(() => {
    let isMounted = true;
    let activeDateStr = getTodayISTString();
    let midnightTimer: number | undefined;

    const syncStats = () => {
      activeDateStr = getTodayISTString();
      getVisitorCountsOncePerSession()
        .then((stats) => {
          if (isMounted) {
            setVisitorStats(stats);
          }
        })
        .catch((err) => {
          console.warn('Visitor counter init error:', err);
        });
    };

    const scheduleMidnightReset = () => {
      if (midnightTimer) window.clearTimeout(midnightTimer);
      midnightTimer = window.setTimeout(() => {
        if (!isMounted) return;
        const newDateStr = getTodayISTString();
        if (newDateStr !== activeDateStr) {
          activeDateStr = newDateStr;
          setVisitorStats((prev) => ({ ...prev, today: 1 }));
          if (document.visibilityState === 'visible') {
            syncStats();
          }
        }
        scheduleMidnightReset();
      }, getMsUntilNextISTMidnight());
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const currentStr = getTodayISTString();
        if (currentStr !== activeDateStr) {
          setVisitorStats((prev) => ({ ...prev, today: 1 }));
          syncStats();
          scheduleMidnightReset();
        }
      }
    };

    syncStats();
    scheduleMidnightReset();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      if (midnightTimer) window.clearTimeout(midnightTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <footer className="bg-gradient-to-r from-[#132b52] via-[#193568] to-[#132b52] text-slate-200 py-6 text-sm border-t-2 border-amber-500/80">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Sole Authorized Copyright Line */}
        <div className="text-center md:text-left text-slate-200 text-sm sm:text-base font-medium">
          © 2026 {ORG_DETAILS.name}. सर्व हक्क राखीव.
        </div>

        {/* Technical Assistance & Web Creation Credit */}
        <div className="text-center text-slate-300 text-xs sm:text-sm font-medium">
          तांत्रिक सहाय्य व वेब निर्मिती: <span className="text-amber-300 font-semibold">श्री. पदमाकर चंद्रकांत शिंदे</span>, केंद्रप्रमुख माजलगाव बीड
        </div>

        {/* Minimal High-Efficiency Zero-Quota Visitor Counter */}
        <div className="flex items-center gap-2 bg-[#0e2140]/90 px-4 py-2 rounded-xl border border-white/15 text-xs sm:text-sm shadow-inner">
          <div className="flex items-center gap-1.5 text-amber-400 font-bold">
            <Eye className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>आजच्या भेटी:</span>
            <span className="font-mono text-white bg-white/10 px-1.5 py-0.5 rounded font-bold">
              {visitorStats.today.toLocaleString('en-IN')}
            </span>
          </div>

          <span className="text-slate-600 font-black">|</span>

          <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
            <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>एकूण भेटी:</span>
            <span className="font-mono text-white bg-white/10 px-1.5 py-0.5 rounded font-bold">
              {visitorStats.total.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

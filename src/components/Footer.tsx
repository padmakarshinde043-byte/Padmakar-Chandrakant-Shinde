import React, { useState, useEffect } from 'react';
import { Eye, Users, Lock } from 'lucide-react';
import { ORG_DETAILS } from '../data/mahasanghData';
import { getVisitorCountsOncePerSession, VisitorStats } from '../firebase';

interface FooterProps {
  setCurrentTab?: (tab: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ setCurrentTab }) => {
  const [visitorStats, setVisitorStats] = useState<VisitorStats>(() => {
    try {
      localStorage.removeItem('mhs_visitor_stats_v1');
      localStorage.removeItem('mhs_visitor_stats');
      const raw = localStorage.getItem('mhs_real_visit_count_v5');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.total === 'number' && parsed.total < 5000) {
          return {
            today: typeof parsed.today === 'number' ? parsed.today : 1,
            total: parsed.total
          };
        }
      }
    } catch {
      // fallback
    }
    return { today: 1, total: 1 };
  });

  useEffect(() => {
    let isMounted = true;
    // Fetches ONLY once per user session, zero continuous background polling (Firebase quota safe)
    getVisitorCountsOncePerSession().then((stats) => {
      if (isMounted) {
        setVisitorStats(stats);
      }
    }).catch((err) => {
      console.warn('Visitor counter init error:', err);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <footer className="bg-[#0b1e36] text-slate-300 py-6 text-sm border-t-2 border-amber-500/80">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Sole Authorized Copyright Line */}
        <div className="text-center md:text-left text-slate-300 text-sm sm:text-base font-medium">
          © 2026 {ORG_DETAILS.name}. सर्व हक्क राखीव.
        </div>

        {/* Minimal High-Efficiency Zero-Quota Visitor Counter */}
        <div className="flex items-center gap-2 bg-[#081526] px-4 py-2 rounded-xl border border-slate-700/80 text-xs sm:text-sm shadow-inner">
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

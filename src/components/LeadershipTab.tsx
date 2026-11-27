import React, { useState, useEffect } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import {
  Leader,
  DEFAULT_AUTHORITATIVE_LEADERS
} from '../data/mahasanghData';
import { fetchDynamicLeaders } from '../services/rkFirebaseService';

export type LeadershipSectionMode = 'state' | 'women' | 'division';

interface LeadershipTabProps {
  mode?: LeadershipSectionMode;
  setCurrentTab: (tab: string) => void;
}

const DYNAMIC_LEADERSHIP_STORAGE_KEY = 'mahasangh_dynamic_leadership_v1';

const SECTION_META: Record<
  LeadershipSectionMode,
  {
    eyebrow: string;
    pageTitle: string;
    subtitle: string;
    sectionTitle: string;
    borderClass: string;
    badgeClass: string;
    emptyText: string;
  }
> = {
  state: {
    eyebrow: 'राज्य नेतृत्व व कार्यकारिणी',
    pageTitle: 'राज्य नेतृत्व',
    subtitle: 'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाची राज्य कार्यकारिणी',
    sectionTitle: 'राज्य कार्यकारिणी',
    borderClass: 'border-amber-600',
    badgeClass: 'bg-slate-100',
    emptyText: 'राज्य कार्यकारिणीचे पदाधिकारी लवकरच जोडले जातील. (आपण ॲडमिन पॅनलमधून नवीन पदाधिकारी जोडू शकता)',
  },
  women: {
    eyebrow: 'महिला आघाडी राज्य नेतृत्व',
    pageTitle: 'महिला आघाडी',
    subtitle: 'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाची महिला आघाडी राज्य कार्यकारिणी',
    sectionTitle: 'महिला आघाडी राज्य कार्यकारिणी',
    borderClass: 'border-rose-500',
    badgeClass: 'bg-rose-50',
    emptyText: 'महिला आघाडी राज्य कार्यकारिणीचे पदाधिकारी लवकरच जोडले जातील. (आपण ॲडमिन पॅनलमधून नवीन पदाधिकारी जोडू शकता)',
  },
  division: {
    eyebrow: 'विभागीय नेतृत्व व समन्वय',
    pageTitle: 'विभाग नेतृत्व',
    subtitle: 'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाची विभागीय कार्यकारिणी व समन्वयक',
    sectionTitle: 'विभागीय कार्यकारिणी',
    borderClass: 'border-blue-600',
    badgeClass: 'bg-blue-50',
    emptyText: 'विभागीय कार्यकारिणीचे पदाधिकारी लवकरच जोडले जातील. (आपण ॲडमिन पॅनलमधून नवीन पदाधिकारी जोडू शकता)',
  },
};

export const LeadershipTab: React.FC<LeadershipTabProps> = ({ mode = 'state', setCurrentTab }) => {
  const [allLeaders, setAllLeaders] = useState<Leader[]>(() => {
    try {
      const stored = localStorage.getItem(DYNAMIC_LEADERSHIP_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return DEFAULT_AUTHORITATIVE_LEADERS;
  });

  const loadLeaders = async (force = false) => {
    try {
      const remoteLeaders = await fetchDynamicLeaders(force);
      if (remoteLeaders && remoteLeaders.length > 0) {
        setAllLeaders(remoteLeaders);
        localStorage.setItem(DYNAMIC_LEADERSHIP_STORAGE_KEY, JSON.stringify(remoteLeaders));
      }
    } catch (e) {
      console.warn('Error loading leaders from Firebase:', e);
    }
  };

  useEffect(() => {
    loadLeaders(false);

    const onUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      if (Array.isArray(detail) && detail.length > 0) {
        setAllLeaders(detail);
        try {
          localStorage.setItem(DYNAMIC_LEADERSHIP_STORAGE_KEY, JSON.stringify(detail));
        } catch {}
      } else {
        loadLeaders(true);
      }
    };
    window.addEventListener('mahasangh_leadership_updated', onUpdated);
    return () => window.removeEventListener('mahasangh_leadership_updated', onUpdated);
  }, []);

  const sectionLeaders =
    mode === 'women'
      ? allLeaders.filter((l) => l.category === 'महिला आघाडी राज्य कार्यकारिणी')
      : mode === 'division'
        ? allLeaders.filter(
            (l) =>
              l.category === 'विभागीय समन्वयक' ||
              l.category === 'विभागीय कार्यकारिणी' ||
              l.category === 'division'
          )
        : allLeaders.filter(
            (l) => l.category === 'राज्य कार्यकारिणी' || l.category === 'state' || !l.category
          );

  const meta = SECTION_META[mode];

  const renderLeaderCard = (leader: Leader) => (
    <div
      key={(leader.id || leader.name) + (leader.region || '')}
      className="bg-white rounded-xl border border-slate-200/90 shadow-sm hover:shadow-md hover:border-amber-400 transition-all flex flex-col items-center p-3.5 text-center group overflow-hidden"
    >
      <div className="w-full aspect-[4/4.2] bg-slate-100 flex items-center justify-center mb-3 rounded-lg overflow-hidden border border-slate-200/80 group-hover:border-amber-200 transition-all relative shrink-0">
        {leader.photo ? (
          <img
            src={leader.photo}
            alt={leader.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-100/70">
            <ImageIcon className="w-8 h-8 opacity-40" />
            <span className="text-[10px] font-bold mt-1 text-slate-400">फोटो नाही</span>
          </div>
        )}
      </div>

      <div className="flex-1 w-full space-y-1 flex flex-col justify-center">
        <h5 className="font-serifDevanagari text-base sm:text-lg font-bold text-[#0b1e36] leading-snug group-hover:text-amber-800 transition-colors">
          {leader.name}
        </h5>
        <p className="text-sm sm:text-base font-bold text-amber-800 tracking-wide">
          {leader.role}
        </p>
        <p className="text-sm sm:text-base font-semibold text-slate-600">
          {leader.region}
        </p>
      </div>
    </div>
  );

  return (
    <div className="bg-slate-50 pt-1.5 pb-6 text-slate-800 mhs-tab-enter">
      {/* Page Header */}
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 mb-2.5">
        <div className="border-b border-[#102a43]/30 pb-2 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="font-serifDevanagari text-xl sm:text-2xl font-extrabold text-[#0b1e36]">
              {meta.pageTitle}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => {
              setCurrentTab('district_leadership');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="self-start sm:self-auto px-4 py-2 rounded-xl bg-[#0b1e36] hover:bg-[#132f52] text-amber-300 font-bold text-xs sm:text-sm border border-amber-500/40 shadow-sm transition-colors cursor-pointer"
          >
            जिल्हा पदाधिकारी पहा →
          </button>
        </div>
      </div>

      <div className="max-w-[1240px] mx-auto px-4 sm:px-6">
        <section className={`bg-white p-5 sm:p-6 rounded-2xl border-l-8 ${meta.borderClass} shadow-sm`}>
          <div className="mb-6 flex items-center justify-between">
            <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
              {meta.sectionTitle}
            </h3>
            <span className={`text-xs sm:text-sm text-slate-500 font-medium ${meta.badgeClass} px-3 py-1 rounded-full`}>
              एकूण: <strong className="font-mono text-[#0b1e36]">{sectionLeaders.length}</strong>
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {sectionLeaders.length > 0 ? (
              sectionLeaders.map((leader) => renderLeaderCard(leader))
            ) : (
              <div className="col-span-full py-8 text-center text-sm sm:text-base text-slate-400">
                {meta.emptyText}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

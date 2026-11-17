import React, { useState, useEffect } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import {
  Leader,
  DEFAULT_AUTHORITATIVE_LEADERS
} from '../data/mahasanghData';
import { fetchDynamicLeaders } from '../services/rkFirebaseService';

interface LeadershipTabProps {
  setCurrentTab: (tab: string) => void;
}

const DYNAMIC_LEADERSHIP_STORAGE_KEY = 'mahasangh_dynamic_leadership_v1';

export const LeadershipTab: React.FC<LeadershipTabProps> = ({ setCurrentTab }) => {
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

    const onUpdated = () => loadLeaders(false);
    window.addEventListener('mahasangh_leadership_updated', onUpdated);
    return () => window.removeEventListener('mahasangh_leadership_updated', onUpdated);
  }, []);

  const stateExecutive = allLeaders.filter((l) => l.category === 'राज्य कार्यकारिणी' || l.category === 'state' || !l.category);
  const womenExecutive = allLeaders.filter((l) => l.category === 'महिला आघाडी राज्य कार्यकारिणी');
  const divisional = allLeaders.filter((l) => l.category === 'विभागीय समन्वयक' || l.category === 'विभागीय कार्यकारिणी' || l.category === 'division');

  const renderLeaderCard = (leader: Leader) => (
    <div
      key={(leader.id || leader.name) + leader.region}
      className="bg-white rounded-xl border border-slate-200/90 shadow-sm hover:shadow-md hover:border-amber-400 transition-all flex flex-col items-center p-3.5 text-center group overflow-hidden"
    >
      <div className="w-full aspect-[4/4.2] bg-slate-100 flex items-center justify-center mb-3 rounded-lg overflow-hidden border border-slate-200/80 group-hover:border-amber-200 transition-all relative shrink-0">
        {leader.photo ? (
          <img
            src={leader.photo}
            alt={leader.name}
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
    <div className="bg-slate-50 py-10 md:py-14 text-slate-800">
      {/* Page Header */}
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 mb-8">
        <div className="border-b-2 border-[#102a43] pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <span className="text-xs sm:text-sm uppercase tracking-widest font-bold text-amber-700">
              राज्य नेतृत्व व कार्यकारिणी
            </span>
            <h1 className="font-serifDevanagari text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#0b1e36] mt-1">
              राज्य पदाधिकारी
            </h1>
            <p className="text-sm sm:text-base text-slate-600 mt-1.5">
              महासंघाची राज्य कार्यकारिणी, महिला आघाडी राज्य कार्यकारिणी व विभागीय कार्यकारिणी
            </p>
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

      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 space-y-10">
        {/* Section 1: राज्य कार्यकारिणी */}
        <section className="bg-white p-5 sm:p-6 rounded-2xl border-l-8 border-amber-600 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
              राज्य कार्यकारिणी
            </h3>
            <span className="text-xs sm:text-sm text-slate-500 font-medium bg-slate-100 px-3 py-1 rounded-full">
              एकूण: <strong className="font-mono text-[#0b1e36]">{stateExecutive.length}</strong>
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {stateExecutive.map((leader) => renderLeaderCard(leader))}
          </div>
        </section>

        {/* Section 2: महिला आघाडी राज्य कार्यकारिणी */}
        <section className="bg-white p-5 sm:p-6 rounded-2xl border-l-8 border-rose-500 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
              महिला आघाडी राज्य कार्यकारिणी
            </h3>
            <span className="text-xs sm:text-sm text-slate-500 font-medium bg-rose-50 px-3 py-1 rounded-full">
              एकूण: <strong className="font-mono text-[#0b1e36]">{womenExecutive.length}</strong>
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {womenExecutive.length > 0 ? (
              womenExecutive.map((leader) => renderLeaderCard(leader))
            ) : (
              <div className="col-span-full py-8 text-center text-sm sm:text-base text-slate-400">
                महिला आघाडी राज्य कार्यकारिणीचे पदाधिकारी लवकरच जोडले जातील. (आपण ॲडमिन पॅनलमधून नवीन पदाधिकारी जोडू शकता)
              </div>
            )}
          </div>
        </section>

        {/* Section 3: विभागीय कार्यकारिणी */}
        <section className="bg-white p-5 sm:p-6 rounded-2xl border-l-8 border-blue-600 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
              विभागीय कार्यकारिणी
            </h3>
            <span className="text-xs sm:text-sm text-slate-500 font-medium bg-blue-50 px-3 py-1 rounded-full">
              एकूण: <strong className="font-mono text-[#0b1e36]">{divisional.length}</strong>
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {divisional.map((leader) => renderLeaderCard(leader))}
          </div>
        </section>
      </div>
    </div>
  );
};


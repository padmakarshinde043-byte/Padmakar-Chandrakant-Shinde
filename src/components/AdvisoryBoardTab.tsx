import React, { useState, useEffect } from 'react';
import { Scale, Compass, Image as ImageIcon } from 'lucide-react';
import {
  Leader,
  DEFAULT_AUTHORITATIVE_LEADERS,
  DEFAULT_MARGDARSHAK_SEED,
  isValidLeaderRecord,
  isLegalAdvisorLeader,
  isMargdarshakLeader,
} from '../data/mahasanghData';
import { fetchDynamicLeaders } from '../services/rkFirebaseService';

const DYNAMIC_LEADERSHIP_STORAGE_KEY = 'mahasangh_dynamic_leadership_v1';

export const AdvisoryBoardTab: React.FC = () => {
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
      console.warn('Error loading advisory board leaders:', e);
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

  const legalAdvisors = allLeaders.filter(
    (l) => isLegalAdvisorLeader(l) && isValidLeaderRecord(l)
  );

  const dbMargdarshak = allLeaders.filter((l) => isMargdarshakLeader(l));
  const margdarshakList = dbMargdarshak.length > 0 ? dbMargdarshak : DEFAULT_MARGDARSHAK_SEED;

  const renderPersonCard = (leader: Leader) => (
    <div
      key={(leader.id || leader.name) + (leader.region || '')}
      className="bg-white rounded-xl border border-slate-200 hover:border-amber-400 shadow-2xs hover:shadow-md transition-all flex flex-col items-center p-3.5 text-center group overflow-hidden"
    >
      <div className="w-full h-48 sm:h-60 lg:h-64 bg-slate-100 flex items-center justify-center mb-3 rounded-lg overflow-hidden border border-slate-200 group-hover:border-amber-200 transition-colors relative shrink-0">
        {leader.photo ? (
          <img
            src={leader.photo}
            alt={leader.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-gradient-to-b from-slate-50 to-slate-100">
            <ImageIcon className="w-9 h-9 opacity-45" />
            <span className="text-xs font-semibold mt-1.5 text-slate-500">फोटो उपलब्ध नाही</span>
          </div>
        )}
      </div>

      <div className="flex-1 w-full space-y-1 flex flex-col justify-center">
        <h3 className="font-serifDevanagari text-base sm:text-lg font-bold text-[#0b1e36] leading-snug group-hover:text-amber-800 transition-colors">
          {leader.name}
        </h3>
        <p className="text-sm sm:text-base font-bold text-amber-800 tracking-wide">
          {leader.role}
        </p>
        {leader.region && leader.region !== '.' && (
          <p className="text-sm font-medium text-slate-600">
            {leader.region}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-slate-50 pt-1.5 pb-6 text-slate-800">
      {/* Page Header */}
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 mb-2.5">
        <div className="border-b border-[#102a43]/30 pb-2">
          <h1 className="font-serifDevanagari text-xl sm:text-2xl font-extrabold text-[#0b1e36]">
            राज्य सल्लागार मंडळ
          </h1>
        </div>
      </div>

      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 space-y-10">
        {/* १. वरचा विभाग: कायदेविषयक सल्लागार */}
        <section className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs">
          <div className="pb-4 mb-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#0b1e36] text-amber-400 flex items-center justify-center shrink-0">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
                  कायदेविषयक सल्लागार
                </h2>
                <p className="text-sm text-slate-600">
                  महासंघाचे न्यायालयीन व सेवाविषयक कायदेशीर सल्लागार
                </p>
              </div>
            </div>
            <span className="text-sm font-semibold text-slate-600 tabular-nums">
              एकूण: {legalAdvisors.length}
            </span>
          </div>

          {legalAdvisors.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {legalAdvisors.map((leader) => renderPersonCard(leader))}
            </div>
          ) : (
            <div className="py-10 text-center text-slate-500 text-sm sm:text-base bg-slate-50 rounded-xl border border-dashed border-slate-200">
              कायदेविषयक सल्लागार माहिती अद्ययावत केली जात आहे.
            </div>
          )}
        </section>

        {/* 2. खालचा विभाग: राज्य सल्लागार */}
        <section className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs">
          <div className="pb-4 mb-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
                  राज्य सल्लागार
                </h2>
                <p className="text-sm text-slate-600">
                  महासंघाचे सन्माननीय राज्य सल्लागार
                </p>
              </div>
            </div>
            <span className="text-sm font-semibold text-slate-600 tabular-nums">
              एकूण: {margdarshakList.length}
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {margdarshakList.map((leader) => renderPersonCard(leader))}
          </div>
        </section>
      </div>
    </div>
  );
};

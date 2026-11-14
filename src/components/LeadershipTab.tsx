import React, { useState, useEffect } from 'react';
import { Search, ShieldCheck, Image as ImageIcon } from 'lucide-react';
import {
  ORG_DETAILS,
  Leader,
  DEFAULT_AUTHORITATIVE_LEADERS
} from '../data/mahasanghData';
import { fetchDynamicLeaders } from '../services/rkFirebaseService';

interface LeadershipTabProps {
  setCurrentTab: (tab: string) => void;
}

const DYNAMIC_LEADERSHIP_STORAGE_KEY = 'mahasangh_dynamic_leadership_v1';

export const LeadershipTab: React.FC<LeadershipTabProps> = ({ setCurrentTab }) => {
  const [districtSearch, setDistrictSearch] = useState('');
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadLeaders = async (force = false) => {
    setIsRefreshing(true);
    try {
      // Fetch authoritative live data directly from Firebase (RTDB & Firestore)
      const remoteLeaders = await fetchDynamicLeaders(force);
      if (remoteLeaders && remoteLeaders.length > 0) {
        setAllLeaders(remoteLeaders);
        localStorage.setItem(DYNAMIC_LEADERSHIP_STORAGE_KEY, JSON.stringify(remoteLeaders));
      }
    } catch (e) {
      console.warn('Error loading leaders from Firebase:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // Background live fetch ensures any fresh modifications are updated seamlessly with zero flicker
    loadLeaders(false);

    const onUpdated = () => loadLeaders(false);
    window.addEventListener('mahasangh_leadership_updated', onUpdated);
    return () => window.removeEventListener('mahasangh_leadership_updated', onUpdated);
  }, []);

  const stateExecutive = allLeaders.filter((l) => l.category === 'राज्य कार्यकारिणी' || l.category === 'state' || !l.category);
  const womenExecutive = allLeaders.filter((l) => l.category === 'महिला आघाडी राज्य कार्यकारिणी');
  const divisional = allLeaders.filter((l) => l.category === 'विभागीय समन्वयक' || l.category === 'विभागीय कार्यकारिणी' || l.category === 'division');
  const districtPresidents = allLeaders.filter((l) => l.category === 'जिल्हा अध्यक्ष' || l.category === 'district');
  const advisory = allLeaders.filter((l) => l.category === 'सल्लागार' || l.category === 'advisory');

  const filteredDistricts = districtPresidents.filter((item) => {
    if (!item) return false;
    const term = (districtSearch || '').trim().toLowerCase();
    if (!term) return true;
    const region = (item.region || '').toLowerCase();
    const name = (item.name || '').toLowerCase();
    return region.includes(term) || name.includes(term);
  });

  // Executive Leader Capsule: Well-balanced card, perfectly proportioned photo without top/bottom empty gaps
  const renderLeaderCard = (leader: Leader, _categoryBadge?: string) => (
    <div
      key={(leader.id || leader.name) + leader.region}
      className="bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-amber-400 transition-all flex flex-col items-center p-3.5 text-center group overflow-hidden"
    >
      {/* Leader Photo Container - Proportioned height for full headshot visibility on Desktop & Mobile */}
      <div className="w-full h-48 sm:h-60 lg:h-68 bg-slate-100 flex items-center justify-center mb-3 rounded-lg overflow-hidden border border-slate-200/80 group-hover:border-amber-200 transition-all relative shrink-0">
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

      {/* Leader Details - Well-Balanced Typography */}
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
    <div className="bg-slate-50 py-10 md:py-16 text-slate-800">
      {/* Page Header */}
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 mb-10">
        <div className="border-b-2 border-[#102a43] pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <span className="text-xs sm:text-sm uppercase tracking-widest font-bold text-amber-700">
              नेतृत्व व पदाधिकारी सूची
            </span>
            <h1 className="font-serifDevanagari text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#0b1e36] mt-1">
              महासंघाची राज्य, विभागीय व जिल्हा कार्यकारिणी
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 space-y-12">
        {/* Section 1: Founder State President Hero Spotlight */}
        <section className="bg-gradient-to-r from-[#0b1e36] via-[#102a4c] to-[#0b1e36] text-white rounded-2xl p-5 sm:p-6 shadow-lg border-t-4 border-amber-500">
          <div className="flex flex-col md:flex-row items-center gap-5 sm:gap-7">
            <div className="relative shrink-0 text-center">
              <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-full ring-4 ring-amber-500 overflow-hidden bg-white mx-auto shadow-md">
                <img
                  src="/president.jpg"
                  alt={ORG_DETAILS.founderPresident.name}
                  className="w-full h-full object-cover object-center"
                />
              </div>
              <span className="inline-block mt-2 text-[10px] bg-amber-500 text-[#0b1e36] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
                सर्वोच्च नेतृत्व
              </span>
            </div>

            <div className="space-y-2 text-center md:text-left flex-1">
              <div className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-amber-300 font-semibold bg-white/10 px-3 py-1 rounded-md">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                {ORG_DETAILS.founderPresident.role}
              </div>
              <h2 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-white">
                {ORG_DETAILS.founderPresident.name}
              </h2>
              <p className="text-sm sm:text-base text-amber-300 font-mono">
                {ORG_DETAILS.founderPresident.education}
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: राज्य कार्यकारिणी */}
        <section className="bg-white p-6 rounded-2xl border-l-8 border-amber-600 shadow-sm">
          <div className="mb-8 flex items-center justify-between">
            <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
              राज्य कार्यकारिणी
            </h3>
            <span className="text-xs sm:text-sm text-slate-500 font-medium bg-slate-100 px-3 py-1 rounded-full">
              एकूण: <strong className="font-mono text-[#0b1e36]">{stateExecutive.length}</strong>
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {stateExecutive.map((leader) => renderLeaderCard(leader, 'राज्य कार्यकारिणी'))}
          </div>
        </section>

        {/* Section 2.5: महिला आघाडी राज्य कार्यकारिणी */}
        <section className="bg-white p-6 rounded-2xl border-l-8 border-rose-500 shadow-sm">
          <div className="mb-8 flex items-center justify-between">
            <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
              महिला आघाडी राज्य कार्यकारिणी
            </h3>
            <span className="text-xs sm:text-sm text-slate-500 font-medium bg-rose-50 px-3 py-1 rounded-full">
              एकूण: <strong className="font-mono text-[#0b1e36]">{womenExecutive.length}</strong>
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {womenExecutive.length > 0 ? (
              womenExecutive.map((leader) => renderLeaderCard(leader, 'महिला आघाडी राज्य कार्यकारिणी'))
            ) : (
              <div className="col-span-full py-8 text-center text-sm sm:text-base text-slate-400">
                महिला आघाडी राज्य कार्यकारिणीचे पदाधिकारी लवकरच जोडले जातील. (आपण ॲडमिन पॅनलमधून नवीन पदाधिकारी जोडू शकता)
              </div>
            )}
          </div>
        </section>

        {/* Section 3: Divisional Executive */}
        <section className="bg-white p-6 rounded-2xl border-l-8 border-blue-600 shadow-sm">
          <div className="mb-8">
            <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
              विभागीय कार्यकारिणी
            </h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {divisional.map((leader) => renderLeaderCard(leader, 'विभागीय कार्यकारिणी'))}
          </div>
        </section>

        {/* Section 4: District Presidents */}
        <section className="bg-white p-6 rounded-2xl border-l-8 border-emerald-600 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
                जिल्हा अध्यक्ष
              </h3>
            </div>

            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="जिल्हा शोधा..."
                value={districtSearch}
                onChange={(e) => setDistrictSearch(e.target.value)}
                className="w-full text-sm pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 bg-slate-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
            {filteredDistricts.length > 0 ? (
              filteredDistricts.map((leader) => renderLeaderCard(leader, 'जिल्हा अध्यक्ष'))
            ) : (
              <div className="col-span-full py-8 text-center text-sm sm:text-base text-slate-500">
                कोणताही जिल्हा आढळला नाही.
              </div>
            )}
          </div>
        </section>

        {/* Section 5: Advisory Board */}
        <section className="bg-white p-6 rounded-2xl border-l-8 border-purple-600 shadow-sm">
          <div className="mb-8">
            <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
              सल्लागार मंडळ
            </h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {advisory.map((leader) => renderLeaderCard(leader))}
          </div>
        </section>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Phone, Search, ShieldCheck, UserCheck, Image as ImageIcon } from 'lucide-react';
import {
  ORG_DETAILS,
  STATE_EXECUTIVE,
  DIVISIONAL_COORDINATORS,
  DISTRICT_PRESIDENTS,
  ADVISORY_BOARD,
  Leader
} from '../data/mahasanghData';
import { fetchDynamicLeaders } from '../services/rkFirebaseService';

interface LeadershipTabProps {
  setCurrentTab: (tab: string) => void;
}

const DYNAMIC_LEADERSHIP_STORAGE_KEY = 'mahasangh_dynamic_leadership_v1';

export const LeadershipTab: React.FC<LeadershipTabProps> = ({ setCurrentTab }) => {
  const [districtSearch, setDistrictSearch] = useState('');
  const [allLeaders, setAllLeaders] = useState<Leader[]>([]);

  // Load dynamic leaders with Smart Zero-Quota Cache
  useEffect(() => {
    const loadLeaders = async () => {
      // 1. Instant render from local browser cache (0ms, 0 bytes Firebase quota)
      try {
        const stored = localStorage.getItem(DYNAMIC_LEADERSHIP_STORAGE_KEY);
        if (stored) {
          setAllLeaders(JSON.parse(stored));
        } else {
          const initialCombined: Leader[] = [
            ...STATE_EXECUTIVE.map((l, i) => ({ ...l, id: `se-${i}`, category: 'राज्य कार्यकारिणी' as const })),
            ...DIVISIONAL_COORDINATORS.map((l, i) => ({ ...l, id: `dc-${i}`, category: 'विभागीय समन्वयक' as const })),
            ...DISTRICT_PRESIDENTS.map((l, i) => ({ ...l, id: `dp-${i}`, category: 'जिल्हा अध्यक्ष' as const })),
            ...ADVISORY_BOARD.map((l, i) => ({ ...l, id: `ab-${i}`, category: 'सल्लागार' as const })),
          ];
          setAllLeaders(initialCombined);
          localStorage.setItem(DYNAMIC_LEADERSHIP_STORAGE_KEY, JSON.stringify(initialCombined));
        }
      } catch (e) {
        console.warn(e);
      }

      // 2. Background check for remote updates (only fetches if version changed)
      try {
        const remoteLeaders = await fetchDynamicLeaders();
        if (remoteLeaders && remoteLeaders.length > 0) {
          setAllLeaders(remoteLeaders);
        }
      } catch (e) {
        // Safe offline/cached fallback
      }
    };

    loadLeaders();
    window.addEventListener('mahasangh_leadership_updated', loadLeaders);
    return () => window.removeEventListener('mahasangh_leadership_updated', loadLeaders);
  }, []);

  const stateExecutive = allLeaders.filter((l) => l.category === 'राज्य कार्यकारिणी' || l.category === 'state' || !l.category);
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

  // Executive Leader Capsule: Full-height photo on left, 3 bold rows on right: Name, Role, District/Region
  const renderLeaderCard = (leader: Leader, _categoryBadge?: string) => (
    <div
      key={(leader.id || leader.name) + leader.region}
      className="bg-white rounded-xl border border-slate-200 shadow-xs hover:border-amber-500 hover:shadow-md transition-all flex items-stretch overflow-hidden group min-h-[92px]"
    >
      {/* Left Column: Full-height Leader Photo */}
      <div className="w-24 sm:w-28 shrink-0 bg-slate-100 flex items-center justify-center relative overflow-hidden border-r border-slate-200/80">
        {leader.photo ? (
          <img
            src={leader.photo}
            alt={leader.name}
            className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400 p-2">
            <ImageIcon className="w-6 h-6 mb-0.5 opacity-60" />
            <span className="text-[9px] font-bold text-slate-400">फोटो</span>
          </div>
        )}
      </div>

      {/* Right Column: Exactly 3 bold rows - Name, Role, District/Region */}
      <div className="flex-1 p-3 sm:p-3.5 flex flex-col justify-center min-w-0 space-y-1">
        {/* Row 1: Name */}
        <div className="font-serifDevanagari text-xs sm:text-sm font-bold text-[#0b1e36] truncate leading-tight group-hover:text-amber-800 transition-colors">
          {leader.name}
        </div>

        {/* Row 2: Post / Role */}
        <div className="text-[11px] sm:text-xs font-bold text-amber-800 truncate leading-tight">
          {leader.role}
        </div>

        {/* Row 3: District or Division */}
        <div className="text-[11px] sm:text-xs font-bold text-slate-700 truncate leading-tight">
          {leader.region}
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-slate-50 py-10 md:py-16 text-slate-800">
      {/* Page Header */}
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 mb-10">
        <div className="border-b border-slate-200 pb-6">
          <span className="text-xs uppercase tracking-widest font-bold text-amber-700">
            नेतृत्व व पदाधिकारी सूची
          </span>
          <h1 className="font-serifDevanagari text-3xl sm:text-4xl font-extrabold text-[#0b1e36] mt-1">
            महासंघाची राज्य, विभागीय व जिल्हा कार्यकारिणी
          </h1>
          <p className="text-sm sm:text-base text-slate-600 mt-2 max-w-3xl leading-relaxed">
            अनुभवी, समर्पित आणि ध्येयवादी नेतृत्वाच्या मार्गदर्शनाखाली संपूर्ण महाराष्ट्रात अखंडपणे सुरू असलेले संघटन कार्य.
          </p>
        </div>
      </div>

      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 space-y-12">
        {/* Section 1: Founder State President Hero Spotlight */}
        <section className="bg-gradient-to-r from-[#0b1e36] via-[#102a4c] to-[#0b1e36] text-white rounded-2xl p-6 sm:p-8 shadow-lg border-t-4 border-amber-500">
          <div className="flex flex-col md:flex-row items-center gap-6 sm:gap-8">
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
              <div className="inline-flex items-center gap-1.5 text-xs text-amber-300 font-semibold bg-white/10 px-3 py-1 rounded-md">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                {ORG_DETAILS.founderPresident.role}
              </div>
              <h2 className="font-serifDevanagari text-xl sm:text-2xl md:text-3xl font-bold text-white">
                {ORG_DETAILS.founderPresident.name}
              </h2>
              <p className="text-xs sm:text-sm text-amber-300 font-mono">
                {ORG_DETAILS.founderPresident.education}
              </p>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl italic">
                "{ORG_DETAILS.founderPresident.message}"
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs">
                <a
                  href={`tel:${ORG_DETAILS.founderPresident.phone}`}
                  className="bg-amber-500 hover:bg-amber-600 text-[#0b1e36] font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-xs"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>थेट संपर्क: {ORG_DETAILS.founderPresident.phone}</span>
                </a>
                <span className="text-slate-300">
                  कार्यालय: मालेगाव (जि. नाशिक)
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: राज्य कार्यकारिणी */}
        <section>
          <div className="mb-4 pb-2 border-b border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-xs uppercase tracking-widest font-bold text-amber-700">
                राज्यस्तरीय मंडळ
              </span>
              <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
                राज्य कार्यकारिणी
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-medium hidden sm:inline-block">
              एकूण: <strong className="font-mono text-[#0b1e36]">{stateExecutive.length}</strong> प्रमुख पदाधिकारी
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stateExecutive.map((leader) => renderLeaderCard(leader, 'राज्य कार्यकारिणी'))}
          </div>
        </section>

        {/* Section 3: Divisional Executive */}
        <section>
          <div className="mb-4 pb-2 border-b border-slate-200">
            <span className="text-xs uppercase tracking-widest font-bold text-amber-700">
              विभागीय समन्वय
            </span>
            <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
              विभागीय कार्यकारिणी
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {divisional.map((leader) => renderLeaderCard(leader, 'विभागीय कार्यकारिणी'))}
          </div>
        </section>

        {/* Section 4: District Presidents with Live Search */}
        <section className="bg-white p-5 sm:p-7 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-3 border-b border-slate-200">
            <div>
              <span className="text-xs uppercase tracking-widest font-bold text-amber-700">
                जिल्हास्तरीय नेतृत्व
              </span>
              <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
                महाराष्ट्रातील सर्व 34 जिल्ह्यांचे अध्यक्ष
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                आपल्या जिल्ह्याच्या अध्यक्षांशी थेट संपर्क साधून महासंघाशी जोडले जा.
              </p>
            </div>

            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="जिल्हा किंवा नाव शोधा..."
                value={districtSearch}
                onChange={(e) => setDistrictSearch(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 bg-slate-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredDistricts.length > 0 ? (
              filteredDistricts.map((leader) => renderLeaderCard(leader, 'जिल्हा अध्यक्ष'))
            ) : (
              <div className="col-span-full py-8 text-center text-xs text-slate-500">
                '{districtSearch}' या शोधानुसार कोणताही जिल्हा किंवा अध्यक्ष आढळला नाही.
              </div>
            )}
          </div>
        </section>

        {/* Section 5: Advisory Board */}
        <section>
          <div className="mb-4 pb-2 border-b border-slate-200">
            <span className="text-xs uppercase tracking-widest font-bold text-amber-700">
              मार्गदर्शन
            </span>
            <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
              सल्लागार मंडळ
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {advisory.map((leader) => renderLeaderCard(leader))}
          </div>
        </section>
      </div>
    </div>
  );
};

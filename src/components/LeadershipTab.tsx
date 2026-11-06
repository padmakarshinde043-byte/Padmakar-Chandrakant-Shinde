import React, { useState } from 'react';
import { Phone, Search, Filter, ShieldCheck, UserCheck, Star } from 'lucide-react';
import {
  ORG_DETAILS,
  STATE_EXECUTIVE,
  DIVISIONAL_COORDINATORS,
  DISTRICT_PRESIDENTS,
  ADVISORY_BOARD,
  Leader
} from '../data/mahasanghData';

interface LeadershipTabProps {
  setCurrentTab: (tab: string) => void;
}

export const LeadershipTab: React.FC<LeadershipTabProps> = ({ setCurrentTab }) => {
  const [districtSearch, setDistrictSearch] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('all');

  const filteredDistricts = DISTRICT_PRESIDENTS.filter((item) => {
    const matchesSearch =
      item.region.toLowerCase().includes(districtSearch.toLowerCase()) ||
      item.name.toLowerCase().includes(districtSearch.toLowerCase());
    return matchesSearch;
  });

  const renderLeaderCard = (leader: Leader, badgeColor = 'bg-[#fff0df] text-[#df6b16]') => (
    <div
      key={leader.name + leader.region}
      className="bg-white p-5 rounded-lg border border-[#e7ded1] shadow-xs hover:border-[#df6b16] transition-all flex flex-col justify-between"
    >
      <div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${badgeColor}`}>
            {leader.role}
          </span>
          {leader.isKey && <Star className="w-4 h-4 text-[#efb24b] fill-[#efb24b]" />}
        </div>
        <h4 className="font-serifDevanagari text-lg font-bold text-[#09243f] mb-1">
          {leader.name}
        </h4>
        <div className="text-xs font-semibold text-[#df6b16] mb-1">
          {leader.region}
        </div>
        <div className="text-[11px] text-[#607184] mb-3">
          {leader.education}
        </div>
      </div>
      <div className="pt-3 border-t border-[#f0e9de] flex items-center justify-between text-xs">
        <a
          href={`tel:${leader.phone}`}
          className="text-[#09243f] hover:text-[#df6b16] font-semibold flex items-center gap-1"
        >
          <Phone className="w-3.5 h-3.5 text-[#df6b16]" />
          {leader.phone}
        </a>
      </div>
    </div>
  );

  return (
    <div className="bg-[#fbf8f2] py-10 md:py-16">
      {/* Page Header */}
      <div className="max-w-[1160px] mx-auto px-4 mb-12">
        <div className="border-b border-[#e7ded1] pb-6">
          <p className="text-xs uppercase tracking-widest font-bold text-[#df6b16] mb-1">
            नेतृत्व व पदाधिकारी
          </p>
          <h1 className="font-serifDevanagari text-3xl sm:text-4xl font-bold text-[#09243f]">
            महासंघाची राज्य, विभागीय व जिल्हा कार्यकारिणी
          </h1>
          <p className="text-base text-[#607184] mt-2 max-w-3xl">
            अनुभवी, समर्पित आणि ध्येयवादी नेतृत्वाच्या मार्गदर्शनाखाली संपूर्ण महाराष्ट्रात अखंडपणे सुरू असलेले संघटन कार्य.
          </p>
        </div>
      </div>

      <div className="max-w-[1160px] mx-auto px-4 space-y-16">
        {/* Section 1: Founder State President Hero Card */}
        <section className="bg-gradient-to-r from-[#09243f] via-[#0c2e4e] to-[#09243f] text-white rounded-xl p-6 sm:p-10 shadow-lg border-t-4 border-[#efb24b]">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="relative shrink-0 text-center">
              <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full border-4 border-[#efb24b] overflow-hidden bg-white mx-auto shadow-md">
                <img
                  src="/heding.jpg"
                  alt={ORG_DETAILS.founderPresident.name}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover object-left"
                />
              </div>
              <span className="inline-block mt-3 text-xs bg-[#efb24b] text-[#09243f] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                सर्वोच्च नेतृत्व
              </span>
            </div>

            <div className="space-y-3 text-center md:text-left flex-1">
              <div className="inline-flex items-center gap-1 text-xs text-[#f8d39b] font-semibold bg-[#102a43] px-3 py-1 rounded-full">
                <ShieldCheck className="w-3.5 h-3.5 text-[#efb24b]" />
                {ORG_DETAILS.founderPresident.role}
              </div>
              <h2 className="font-serifDevanagari text-2xl sm:text-3xl font-bold text-white">
                {ORG_DETAILS.founderPresident.name}
              </h2>
              <p className="text-xs sm:text-sm text-[#f8c47b] font-medium">
                {ORG_DETAILS.founderPresident.education}
              </p>
              <p className="text-xs sm:text-sm text-[#dbe8f1] leading-relaxed max-w-2xl italic">
                "{ORG_DETAILS.founderPresident.message}"
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs">
                <a
                  href={`tel:${ORG_DETAILS.founderPresident.phone}`}
                  className="bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold px-4 py-2 rounded flex items-center gap-2 transition-colors shadow-xs"
                >
                  <Phone className="w-3.5 h-3.5" />
                  थेट संपर्क: {ORG_DETAILS.founderPresident.phone}
                </a>
                <span className="text-slate-300">
                  कार्यालय: मालेगाव (नाशिक)
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: State Executive Committee (राज्य कार्यकारिणी) */}
        <section>
          <div className="mb-6 pb-2 border-b border-[#e7ded1] flex items-center justify-between">
            <div>
              <span className="text-xs uppercase tracking-widest font-bold text-[#df6b16]">
                राज्यस्तरीय मंडळ
              </span>
              <h3 className="font-serifDevanagari text-2xl font-bold text-[#09243f]">
                राज्य कार्यकारिणी (State Executive Committee)
              </h3>
            </div>
            <span className="text-xs text-[#607184] font-medium hidden sm:inline-block">
              एकूण {STATE_EXECUTIVE.length} प्रमुख पदाधिकारी
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STATE_EXECUTIVE.map((leader) => renderLeaderCard(leader, 'bg-[#09243f] text-white'))}
          </div>
        </section>

        {/* Section 3: Divisional Coordinators (विभागीय समन्वयक) */}
        <section>
          <div className="mb-6 pb-2 border-b border-[#e7ded1]">
            <span className="text-xs uppercase tracking-widest font-bold text-[#df6b16]">
              विभागीय समन्वय
            </span>
            <h3 className="font-serifDevanagari text-2xl font-bold text-[#09243f]">
              विभागीय समन्वयक (Divisional Coordinators)
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {DIVISIONAL_COORDINATORS.map((leader) =>
              renderLeaderCard(leader, 'bg-[#fff0df] text-[#df6b16]')
            )}
          </div>
        </section>

        {/* Section 4: District Presidents with Live Search & Filter (महाराष्ट्रातील 34 जिल्ह्यांचे अध्यक्ष) */}
        <section className="bg-white p-6 sm:p-8 rounded-xl border border-[#e7ded1] shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-4 border-b border-[#e7ded1]">
            <div>
              <span className="text-xs uppercase tracking-widest font-bold text-[#df6b16]">
                जिल्हास्तरीय नेतृत्व
              </span>
              <h3 className="font-serifDevanagari text-2xl font-bold text-[#09243f]">
                महाराष्ट्रातील 34 जिल्ह्यांचे अध्यक्ष
              </h3>
              <p className="text-xs text-[#607184] mt-1">
                आपल्या जिल्ह्याच्या अध्यक्षांशी थेट संपर्क साधून महासंघाशी जोडले जा.
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="जिल्हा किंवा नाव शोधा..."
                value={districtSearch}
                onChange={(e) => setDistrictSearch(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16] bg-[#fbf8f2]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredDistricts.length > 0 ? (
              filteredDistricts.map((leader) =>
                renderLeaderCard(leader, 'bg-slate-100 text-[#09243f]')
              )
            ) : (
              <div className="col-span-full py-8 text-center text-sm text-[#607184]">
                '{districtSearch}' या शोधानुसार कोणताही जिल्हा किंवा अध्यक्ष आढळला नाही.
              </div>
            )}
          </div>
        </section>

        {/* Section 5: Advisory Board (सल्लागार मंडळ) */}
        <section>
          <div className="mb-6 pb-2 border-b border-[#e7ded1]">
            <span className="text-xs uppercase tracking-widest font-bold text-[#df6b16]">
              मार्गदर्शन
            </span>
            <h3 className="font-serifDevanagari text-2xl font-bold text-[#09243f]">
              सल्लागार मंडळ (Advisory Board)
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ADVISORY_BOARD.map((leader) =>
              renderLeaderCard(leader, 'bg-amber-100 text-amber-900')
            )}
          </div>
        </section>

        {/* Section 6: Note & Membership Prompt */}
        <div className="bg-[#f0e9de] p-6 rounded-lg border border-[#e7ded1] text-xs text-[#607184] leading-relaxed flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <strong className="text-[#09243f] block text-sm mb-1 font-serifDevanagari">
              नोंद व अधिकृत माहिती:
            </strong>
            <p>
              वरील सर्व नियुक्त्या व संपर्क क्रमांक महासंघाच्या अधिकृत अभिलेखावर आधारित आहेत. कोणत्याही शंकेसाठी अथवा नवीन पदाधिकाऱ्यांच्या समावेशासाठी मुख्य कार्यालयाशी संपर्क साधा: {ORG_DETAILS.email}
            </p>
          </div>
          <button
            onClick={() => {
              setCurrentTab('membership');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="shrink-0 bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold px-5 py-2.5 rounded text-xs transition-colors shadow-xs flex items-center gap-1.5"
          >
            <UserCheck className="w-4 h-4" />
            सदस्यत्व अर्ज करा
          </button>
        </div>
      </div>
    </div>
  );
};

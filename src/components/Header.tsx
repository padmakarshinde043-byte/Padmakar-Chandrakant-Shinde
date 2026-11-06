import React, { useRef, useEffect } from 'react';
import { Phone, ShieldCheck, Sparkles } from 'lucide-react';
import { ORG_DETAILS } from '../data/mahasanghData';

interface HeaderProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, setCurrentTab }) => {
  const scrollNavRef = useRef<HTMLDivElement | null>(null);

  const navItems = [
    { id: 'home', label: 'मुख्यपृष्ठ' },
    { id: 'about', label: 'आमच्याबद्दल' },
    { id: 'objectives', label: 'उद्दिष्टे' },
    { id: 'leadership', label: 'नेतृत्व' },
    { id: 'appointments', label: 'पदाधिकारी व नियुक्ती पत्रे', shortLabel: 'पदाधिकारी व नियुक्ती' },
    { id: 'news', label: 'बातम्या' },
    { id: 'membership', label: 'सदस्यत्व' },
    { id: 'contact', label: 'संपर्क' },
  ];

  const handleNavClick = (id: string) => {
    setCurrentTab(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Keep active mobile pill in view when tab changes
  useEffect(() => {
    if (scrollNavRef.current) {
      const activeEl = scrollNavRef.current.querySelector<HTMLButtonElement>('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [currentTab]);

  return (
    <header className="sticky top-0 z-50 bg-[#fbf8f2]/95 backdrop-blur border-b border-[#e7ded1] shadow-xs">
      {/* Top Info Banner Bar */}
      <div className="bg-[#09243f] text-[#dbe8f1] text-[10px] sm:text-[11px] md:text-xs tracking-wider py-1.5 px-3 sm:px-4">
        <div className="max-w-[1160px] mx-auto flex flex-wrap justify-between items-center gap-1.5 sm:gap-2">
          <span className="font-medium flex items-center gap-1.5 truncate">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#efb24b] shrink-0"></span>
            {ORG_DETAILS.tagline}
          </span>
          <div className="flex items-center gap-3 sm:gap-4 text-[10px] md:text-[11px] shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1 text-[#f8d39b]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#efb24b]" />
              नोंदणी क्र: {ORG_DETAILS.registrationNo}
            </span>
            <span className="flex items-center gap-1 text-slate-300">
              <Phone className="w-3 h-3 text-[#efb24b]" />
              मो. {ORG_DETAILS.phonePrimary}
            </span>
          </div>
        </div>
      </div>

      {/* Main Header Row */}
      <div className="max-w-[1160px] mx-auto px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-4">
        {/* Brand Logo & Name */}
        <button
          onClick={() => handleNavClick('home')}
          className="flex items-center gap-2.5 sm:gap-3 text-left group focus:outline-none shrink-0"
          aria-label="महासंघ मुख्यपृष्ठ"
        >
          <img
            src="/heding.jpg"
            alt="चिन्ह"
            width="52"
            height="52"
            decoding="async"
            className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 object-cover object-left rounded-full border-2 border-[#efb24b] shadow-xs group-hover:scale-105 transition-transform"
          />
          <div className="flex flex-col leading-tight">
            <strong className="font-serifDevanagari text-[11px] sm:text-xs md:text-sm text-[#df6b16] font-bold tracking-wide">
              महाराष्ट्र राज्य
            </strong>
            <b className="text-[#09243f] text-xs sm:text-base md:text-lg font-extrabold font-serifDevanagari">
              केंद्रप्रमुख व अधिकारी महासंघ
            </b>
            <small className="hidden md:block text-[#607184] text-[10px] font-medium mt-0.5">
              {ORG_DETAILS.subTagline}
            </small>
          </div>
        </button>

        {/* Desktop Side-by-Side Nav (lg:flex) */}
        <nav className="hidden lg:flex items-center gap-1 shrink-0" aria-label="मुख्य नेव्हिगेशन">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`text-xs xl:text-[13px] font-semibold px-2.5 xl:px-3 py-1.5 rounded-lg transition-all ${
                currentTab === item.id
                  ? 'text-[#df6b16] bg-[#fff0df] font-bold shadow-xs'
                  : 'text-[#102a43] hover:text-[#df6b16] hover:bg-[#fff0df]/60'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Smart Side-by-Side Horizontal Nav Strip on Mobile & Tablets (lg:hidden) */}
      {/* Replaces the hamburger menu with an elegant, non-cluttered one-line scrollable bar */}
      <div className="lg:hidden border-t border-[#e7ded1] bg-gradient-to-r from-[#fbf8f2] via-white to-[#fbf8f2] relative">
        <div
          ref={scrollNavRef}
          className="no-scrollbar overflow-x-auto scroll-smooth flex items-center gap-1.5 px-3 py-2"
          role="navigation"
          aria-label="मोबाईल नेव्हिगेशन"
        >
          {navItems.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                data-active={isActive ? 'true' : 'false'}
                onClick={() => handleNavClick(item.id)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 flex items-center gap-1 ${
                  isActive
                    ? 'bg-[#df6b16] text-white shadow-xs border border-[#df6b16]'
                    : 'bg-white/95 text-[#09243f] hover:text-[#df6b16] hover:bg-amber-50/60 border border-slate-200'
                }`}
              >
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0"></span>}
                {item.shortLabel || item.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};


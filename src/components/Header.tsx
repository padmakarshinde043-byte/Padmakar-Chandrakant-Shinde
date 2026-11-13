import React, { useRef, useEffect } from 'react';
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
    { id: 'leadership', label: 'राज्य व जिल्हा नेतृत्व' },
    { id: 'appointments', label: 'पदाधिकारी' },
    { id: 'news', label: 'बातम्या आणि परिपत्रके' },
    { id: 'membership', label: 'सदस्यत्व नोंदणी' },
    { id: 'contact', label: 'संपर्क' },
  ];

  const handleNavClick = (id: string) => {
    setCurrentTab(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Keep active mobile item in view when tab changes
  useEffect(() => {
    if (scrollNavRef.current) {
      const activeEl = scrollNavRef.current.querySelector<HTMLButtonElement>('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [currentTab]);

  return (
    <header className="sticky top-0 z-50 bg-white/98 backdrop-blur-md border-b border-slate-200/90 shadow-sm">
      {/* 1. Main Header Strip (सब मेनूच्या वरील मुख्य पट्टी) */}
      <div className="max-w-[1240px] mx-auto px-2 sm:px-6 py-2 sm:py-3 flex items-center justify-between gap-1.5 sm:gap-4">
        {/* Left: Official Organization Emblem Logo */}
        <button
          onClick={() => handleNavClick('home')}
          className="flex items-center group focus:outline-none shrink-0"
          aria-label="महासंघ मुख्यपृष्ठ"
        >
          <div className="relative">
            <img
              src="/logo.png"
              alt="महासंघ अधिकृत मानचिन्ह"
              width="72"
              height="72"
              decoding="async"
              className="w-12 h-12 min-[380px]:w-14 min-[380px]:h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 object-contain rounded-full ring-2 ring-amber-500 shadow-md group-hover:scale-105 transition-transform bg-white"
            />
            <span
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 sm:w-3.5 sm:h-3.5 bg-emerald-600 border-2 border-white rounded-full"
              title="अधिकृत नोंदणीकृत"
            />
          </div>
        </button>

        {/* Center: 3 ओळी (पहिली ओळ: महाराष्ट्र राज्य, दुसरी ओळ: केंद्रप्रमुख व अधिकारी महासंघ मोठ्या आकारात, तिसरी ओळ: नोंदणी क्रमांक) */}
        <button
          onClick={() => handleNavClick('home')}
          className="flex-1 flex flex-col items-center justify-center text-center px-1 focus:outline-none group"
        >
          {/* पहिली ओळ: महाराष्ट्र राज्य (सध्या आहे त्या आकारात) */}
          <span className="text-xs min-[360px]:text-sm sm:text-base md:text-lg font-bold text-amber-700 tracking-wide leading-tight">
            महाराष्ट्र राज्य
          </span>

          {/* दुसरी ओळ: केंद्रप्रमुख व अधिकारी महासंघ (मोठ्या आकारात) */}
          <h1 className="font-serifDevanagari font-black text-base min-[360px]:text-lg min-[400px]:text-xl sm:text-2xl md:text-3xl lg:text-[32px] text-[#0b1e36] group-hover:text-amber-800 transition-colors tracking-tight leading-tight my-0.5 drop-shadow-xs">
            केंद्रप्रमुख व अधिकारी महासंघ
          </h1>

          {/* तिसरी ओळ: नोंदणी क्रमांक (आहे त्या आकारात) */}
          <span className="text-[10px] min-[360px]:text-[11px] sm:text-xs text-slate-500 font-semibold tracking-wide leading-tight">
            नोंदणी क्र. {ORG_DETAILS.registrationNo}
          </span>
        </button>

        {/* Right Optical Balancer (Enables perfect center alignment) */}
        <div className="w-12 min-[380px]:w-14 sm:w-16 md:w-20 shrink-0 pointer-events-none" aria-hidden="true" />
      </div>

      {/* 2. Submenu Bar (सब मेनू पट्टी - आकर्षक, ठळक अक्षरे व सुंदर रंगसंगती) */}
      <div className="bg-[#0b1e36] border-y border-amber-500/60 shadow-inner">
        <div className="max-w-[1240px] mx-auto px-2 sm:px-6">
          {/* Desktop Nav Items */}
          <nav className="hidden lg:flex items-center gap-1.5 xl:gap-2.5 py-2" aria-label="मुख्य नेव्हिगेशन">
            {navItems.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`text-sm xl:text-[15px] px-3.5 xl:px-4 py-2 rounded-lg transition-all ${
                    isActive
                      ? 'bg-amber-500 text-[#0b1e36] font-extrabold shadow-sm'
                      : 'text-slate-100 hover:text-white hover:bg-white/10 font-bold'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Mobile Submenu Scrolling Ribbon: Calm, elegant, theme-harmonized tabs with larger readable font */}
          <div className="lg:hidden py-2.5">
            <div
              ref={scrollNavRef}
              className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth px-1"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {navItems.map((item) => {
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    data-active={isActive ? 'true' : 'false'}
                    onClick={() => handleNavClick(item.id)}
                    className={`shrink-0 text-sm sm:text-base px-3.5 py-2 rounded-lg transition-all whitespace-nowrap active:scale-98 ${
                      isActive
                        ? 'bg-amber-500 text-[#0b1e36] font-black shadow-sm'
                        : 'text-slate-100 hover:text-white bg-white/10 hover:bg-white/15 border border-white/15 font-bold'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

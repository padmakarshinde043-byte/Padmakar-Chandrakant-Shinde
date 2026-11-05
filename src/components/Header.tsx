import React, { useState } from 'react';
import { Menu, X, Phone, ShieldCheck, UserCheck } from 'lucide-react';
import { ORG_DETAILS } from '../data/mahasanghData';

interface HeaderProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, setCurrentTab }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'home', label: 'मुख्यपृष्ठ' },
    { id: 'about', label: 'आमच्याबद्दल' },
    { id: 'objectives', label: 'उद्दिष्टे' },
    { id: 'leadership', label: 'नेतृत्व' },
    { id: 'news', label: 'बातम्या' },
    { id: 'membership', label: 'सदस्यत्व' },
    { id: 'admin', label: 'प्रशासन' },
  ];

  const handleNavClick = (id: string) => {
    setCurrentTab(id);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header className="sticky top-0 z-50 bg-[#fbf8f2]/95 backdrop-blur border-b border-[#e7ded1] shadow-sm">
      {/* Top Banner Bar */}
      <div className="bg-[#09243f] text-[#dbe8f1] text-[11px] md:text-xs tracking-wider py-1.5 px-4">
        <div className="max-w-[1160px] mx-auto flex flex-wrap justify-between items-center gap-2">
          <span className="font-medium flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#efb24b]"></span>
            {ORG_DETAILS.tagline}
          </span>
          <div className="flex items-center gap-4 text-[10px] md:text-[11px]">
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

      {/* Main Header */}
      <div className="max-w-[1160px] mx-auto px-4 py-3 flex items-center justify-between gap-4 min-h-[78px]">
        {/* Brand */}
        <button
          onClick={() => handleNavClick('home')}
          className="flex items-center gap-3 text-left group focus:outline-none"
          aria-label="महासंघ मुख्यपृष्ठ"
        >
          <img
            src="/heding.jpg"
            alt="महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ चिन्ह"
            className="w-12 h-12 md:w-14 md:h-14 object-cover object-left rounded-full border-2 border-[#efb24b] shadow-sm group-hover:scale-105 transition-transform"
          />
          <div className="flex flex-col leading-tight">
            <strong className="font-serifDevanagari text-xs md:text-sm text-[#df6b16] font-bold tracking-wide">
              महाराष्ट्र राज्य
            </strong>
            <b className="text-[#09243f] text-sm md:text-lg font-extrabold font-serifDevanagari">
              केंद्रप्रमुख व अधिकारी महासंघ
            </b>
            <small className="hidden md:block text-[#607184] text-[10px] font-medium mt-0.5">
              {ORG_DETAILS.subTagline}
            </small>
          </div>
        </button>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-1" aria-label="मुख्य नेव्हिगेशन">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`text-[13px] font-semibold px-3 py-2 rounded-md transition-colors ${
                currentTab === item.id
                  ? 'text-[#df6b16] bg-[#fff0df] font-bold shadow-xs'
                  : 'text-[#102a43] hover:text-[#df6b16] hover:bg-[#fff0df]/60'
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            onClick={() => handleNavClick('contact')}
            className={`ml-2 text-xs md:text-sm font-bold px-4 py-2 rounded-md transition-all shadow-sm ${
              currentTab === 'contact'
                ? 'bg-[#b85309] text-white'
                : 'bg-[#df6b16] hover:bg-[#c85c0e] text-white hover:shadow'
            }`}
          >
            संपर्क करा
          </button>
        </nav>

        {/* Mobile Menu Button */}
        <div className="flex lg:hidden items-center gap-2">
          <button
            onClick={() => handleNavClick('membership')}
            className="text-xs bg-[#df6b16] text-white font-bold px-2.5 py-1.5 rounded flex items-center gap-1 shadow-xs"
          >
            <UserCheck className="w-3.5 h-3.5" />
            सदस्यत्व
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 border border-[#e7ded1] rounded-md text-[#09243f] hover:bg-[#fff0df] focus:outline-none"
            aria-label="मेनू उघडा किंवा बंद करा"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Nav */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-[#e7ded1] bg-[#fbf8f2] px-4 py-3 shadow-lg flex flex-col gap-1.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`w-full text-left text-sm font-semibold px-3 py-2.5 rounded-md transition-colors ${
                currentTab === item.id
                  ? 'text-[#df6b16] bg-[#fff0df] font-bold'
                  : 'text-[#102a43] hover:bg-[#fff0df]'
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            onClick={() => handleNavClick('contact')}
            className={`w-full text-center text-sm font-bold px-4 py-2.5 mt-2 rounded-md ${
              currentTab === 'contact'
                ? 'bg-[#b85309] text-white'
                : 'bg-[#df6b16] text-white'
            }`}
          >
            संपर्क करा
          </button>
        </div>
      )}
    </header>
  );
};

import React from 'react';
import { MapPin, Phone, Mail, ShieldCheck, ArrowRight } from 'lucide-react';
import { ORG_DETAILS } from '../data/mahasanghData';

interface FooterProps {
  setCurrentTab: (tab: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ setCurrentTab }) => {
  const navigate = (tab: string) => {
    setCurrentTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="bg-[#09243f] text-[#d8e2e7] pt-12 pb-6 text-sm border-t-4 border-[#df6b16]">
      <div className="max-w-[1160px] mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pb-10 border-b border-[#29435a]">
          {/* Col 1: Brand & Registration */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <img
                src="/heding.jpg"
                alt="महासंघ चिन्ह"
                className="w-12 h-12 object-cover object-left rounded-full border-2 border-[#efb24b]"
              />
              <div>
                <strong className="block text-white font-serifDevanagari text-base font-bold">
                  महाराष्ट्र राज्य
                </strong>
                <span className="text-white text-sm font-semibold font-serifDevanagari">
                  केंद्रप्रमुख व अधिकारी महासंघ
                </span>
              </div>
            </div>
            <p className="text-xs text-[#a7bac4] leading-relaxed">
              {ORG_DETAILS.tagline}
            </p>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#102a43] rounded text-xs text-[#f8d39b] border border-[#23425f]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#efb24b]" />
              <span>{ORG_DETAILS.registrationNo}</span>
            </div>
          </div>

          {/* Col 2: Quick Links */}
          <div>
            <h4 className="text-white font-serifDevanagari font-bold text-base mb-3 pb-1 border-b border-[#29435a]/60 inline-block">
              द्रुत दुवे (Quick Links)
            </h4>
            <ul className="space-y-1.5 text-xs text-[#a7bac4]">
              {[
                { id: 'home', label: 'मुख्यपृष्ठ' },
                { id: 'about', label: 'आमच्याबद्दल (About Us)' },
                { id: 'objectives', label: 'उद्दिष्टे व मागण्या' },
                { id: 'leadership', label: 'राज्य व जिल्हा नेतृत्व' },
                { id: 'news', label: 'ताज्या घडामोडी व परिपत्रके' },
                { id: 'membership', label: 'नवीन सदस्यत्व अर्ज' },
                { id: 'contact', label: 'जिल्हानिहाय संपर्क' },
                { id: 'admin', label: 'प्रशासन कक्ष (Admin)' },
              ].map((link) => (
                <li key={link.id}>
                  <button
                    onClick={() => navigate(link.id)}
                    className="hover:text-[#efb24b] transition-colors flex items-center gap-1.5"
                  >
                    <ArrowRight className="w-3 h-3 text-[#df6b16]" />
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Contact & Office */}
          <div>
            <h4 className="text-white font-serifDevanagari font-bold text-base mb-3 pb-1 border-b border-[#29435a]/60 inline-block">
              मुख्य कार्यालय संपर्क
            </h4>
            <div className="space-y-2.5 text-xs text-[#a7bac4]">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#efb24b] shrink-0 mt-0.5" />
                <span>{ORG_DETAILS.officeAddress}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#efb24b] shrink-0" />
                <a href={`tel:${ORG_DETAILS.phonePrimary}`} className="hover:text-white">
                  मो. {ORG_DETAILS.phonePrimary}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#efb24b] shrink-0" />
                <a href={`mailto:${ORG_DETAILS.email}`} className="hover:text-white">
                  {ORG_DETAILS.email}
                </a>
              </div>
              <div className="text-[11px] text-[#849ba8] pt-1">
                वेळ: {ORG_DETAILS.officeHours}
              </div>
            </div>
          </div>

          {/* Col 4: Membership Fee & QR / PhonePe */}
          <div>
            <h4 className="text-white font-serifDevanagari font-bold text-base mb-3 pb-1 border-b border-[#29435a]/60 inline-block">
              सदस्यत्व शुल्क नोंदणी
            </h4>
            <div className="bg-[#0e2c4c] p-3 rounded-lg border border-[#23425f] text-xs space-y-2">
              <p className="font-semibold text-white">
                एकवेळ आजीवन शुल्क: <span className="text-[#f8d39b]">₹५००</span>
              </p>
              <p className="text-[#a7bac4]">
                फोन पे (PhonePe) नंबर: <br />
                <strong className="text-white text-sm tracking-wide">
                  {ORG_DETAILS.phonePhonePe}
                </strong>
              </p>
              <button
                onClick={() => navigate('membership')}
                className="w-full mt-1 bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold py-1.5 px-3 rounded text-xs transition-colors shadow-xs"
              >
                आता अर्ज करा →
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Copyright */}
        <div className="pt-5 flex flex-col sm:flex-row justify-between items-center text-xs text-[#849ba8] gap-2">
          <span>
            © २०२६ {ORG_DETAILS.name}. सर्व हक्क राखीव.
          </span>
          <span className="text-[11px]">
            नोंदणीकृत श्रमिक संघटना (Reg. Under Trade Unions Act)
          </span>
        </div>
      </div>
    </footer>
  );
};

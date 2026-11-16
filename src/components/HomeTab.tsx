import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight, ShieldCheck, Users, School, Award, ChevronRight,
  FileText, Phone, CheckCircle2, BookOpen, Scale, Sparkles, AlertCircle,
  X
} from 'lucide-react';
import { ORG_DETAILS, CORE_PRINCIPLES, INITIAL_NEWS, NewsItem, LatestBannerItem } from '../data/mahasanghData';
import { toEnglishDigits } from '../utils/formatters';
import { AnimatedCounter } from '../utils/animations';
import { sortNewsDescending } from '../firebase';

interface HomeTabProps {
  setCurrentTab: (tab: string) => void;
  onSelectNews: (news: NewsItem) => void;
  newsList?: NewsItem[];
  latestBanners?: LatestBannerItem[];
}

export const HomeTab: React.FC<HomeTabProps> = ({ setCurrentTab, onSelectNews, newsList, latestBanners }) => {
  const [fullScreenPhoto, setFullScreenPhoto] = useState<string | null>(null);

  // Close full-screen photo modal on Escape key and manage body overflow
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullScreenPhoto(null);
      }
    };
    if (fullScreenPhoto) {
      window.addEventListener('keydown', handleKeyDown);
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [fullScreenPhoto]);

  const list = newsList && newsList.length > 0 ? newsList : INITIAL_NEWS;
  const recentNews = list.slice(0, 6);

  return (
    <div className="bg-slate-50 text-slate-800">
      {/* Hero Section: Compact, Executive Asymmetric Portal */}
      <section className="relative bg-gradient-to-b from-[#152f59] via-[#193568] to-[#132b52] text-white py-8 sm:py-12 px-4 sm:px-6 overflow-hidden border-b border-slate-700/80">
        {/* Subtle architectural background texture */}
        <div
          className="absolute inset-0 opacity-10 bg-cover bg-center pointer-events-none mix-blend-overlay"
          style={{ backgroundImage: `url('/heding.jpg')` }}
        />
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative max-w-[1240px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          {/* Left Column: Authoritative Mission Statement & Core CTAs */}
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-white/10 backdrop-blur-xs rounded-full border border-amber-400/30 text-amber-300 text-xs sm:text-sm font-semibold">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>शासन नोंदणीकृत श्रमिक संघटना · नोंदणी क्र. {ORG_DETAILS.registrationNo}</span>
            </div>

            <h1 className="font-serifDevanagari text-2xl sm:text-3xl md:text-4xl font-extrabold leading-[1.25] tracking-tight text-slate-100">
              प्राथमिक शिक्षणाची धुरा सांभाळणाऱ्या <br className="hidden sm:block" />
              <span className="text-amber-400 font-bold not-italic leading-normal">केंद्रप्रमुख व अधिकाऱ्यांचे</span> महासंघटन.
            </h1>

            <p className="text-base sm:text-lg text-slate-200 leading-relaxed max-w-2xl font-normal">
              महाराष्ट्रभरातील केंद्रप्रमुख, विस्तार अधिकारी व शिक्षण प्रशासकीय संवर्गाच्या सन्मानासाठी, हक्कांसाठी आणि गुणवत्तापूर्ण प्राथमिक शिक्षणासाठी कार्यरत असलेले सर्वोच्च व्यासपीठ.
            </p>

            {/* Quick Action CTAs */}
            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                onClick={() => {
                  setCurrentTab('membership');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="bg-amber-500 hover:bg-amber-600 text-[#0b1e36] font-bold px-5 py-2.5 rounded-lg text-sm sm:text-base flex items-center gap-2 shadow-md transition-all active:scale-98"
              >
                <span>सदस्यत्व अर्ज करा</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setCurrentTab('appointments');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="bg-white/10 hover:bg-white/20 text-white font-semibold px-4 py-2.5 rounded-lg text-sm sm:text-base border border-white/20 transition-all flex items-center gap-2"
              >
                <Award className="w-4 h-4 text-amber-400" />
                <span>पदाधिकारी</span>
              </button>

              <button
                onClick={() => {
                  setCurrentTab('news');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="text-slate-300 hover:text-white font-semibold px-3 py-2.5 text-sm sm:text-base transition-colors"
              >
                बातम्या आणि परिपत्रके →
              </button>
            </div>

            {/* Key Organization Stats Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-700/60">
              <div>
                <strong className="block text-xl sm:text-2xl font-black font-mono text-amber-400">
                  <AnimatedCounter target={34} />
                </strong>
                <span className="text-xs sm:text-sm text-slate-300 font-medium">जिल्हा शाखा</span>
              </div>
              <div>
                <strong className="block text-xl sm:text-2xl font-black font-mono text-amber-400">
                  <AnimatedCounter target={350} suffix="+" />
                </strong>
                <span className="text-xs sm:text-sm text-slate-300 font-medium">तालुका कार्यकारिणी</span>
              </div>
              <div>
                <strong className="block text-xl sm:text-2xl font-black font-mono text-amber-400">
                  <AnimatedCounter target={5000} />
                </strong>
                <span className="text-xs sm:text-sm text-slate-300 font-medium">सदस्य उद्दिष्ट</span>
              </div>
              <div>
                <strong className="block text-xl sm:text-2xl font-black font-mono text-emerald-400">
                  <AnimatedCounter target={100} suffix="%" />
                </strong>
                <span className="text-xs sm:text-sm text-slate-300 font-medium">कायदेशीर संरक्षण</span>
              </div>
            </div>
          </div>

          {/* Right Column: Founder State President Feature Card */}
          <div className="lg:col-span-5">
            <div className="bg-[#10254a]/90 rounded-xl border border-amber-400/45 p-5 sm:p-6 shadow-xl relative backdrop-blur-md">
              <div className="absolute top-3 right-3 bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                संस्थापक नेतृत्व
              </div>

              <div className="flex items-center gap-3.5 mb-3">
                <img
                  src="/president.jpg"
                  alt={ORG_DETAILS.founderPresident.name}
                  loading="eager"
                  decoding="async"
                  {...({ fetchpriority: 'high' } as React.ImgHTMLAttributes<HTMLImageElement>)}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover object-center ring-2 ring-amber-500 shadow-md shrink-0 bg-white"
                />
                <div>
                  <span className="text-xs sm:text-sm font-bold text-amber-400 tracking-wide block">
                    {ORG_DETAILS.founderPresident.role}
                  </span>
                  <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-white leading-tight mt-0.5">
                    {ORG_DETAILS.founderPresident.name}
                  </h3>
                  <p className="text-sm text-slate-300 mt-0.5 font-mono">
                    {ORG_DETAILS.founderPresident.education}
                  </p>
                </div>
              </div>

              <blockquote className="text-sm sm:text-base text-slate-200 leading-relaxed italic border-l-2 border-amber-500 pl-3 mb-4">
                "{ORG_DETAILS.founderPresident.message}"
              </blockquote>

              <div className="pt-3 border-t border-white/15 flex flex-wrap items-center justify-between gap-2 text-sm">
                <a
                  href={`tel:${ORG_DETAILS.founderPresident.phone}`}
                  className="bg-amber-500 hover:bg-amber-600 text-[#0b1e36] font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>थेट संपर्क: {ORG_DETAILS.founderPresident.phone}</span>
                </a>
                <span className="text-slate-300 font-medium">
                  कार्यालय: मालेगाव (नाशिक)
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 1.5: ताज्या घडामोडी (Latest Updates Banner Carousel) */}
      <LatestUpdatesCarousel banners={latestBanners || []} setFullScreenPhoto={setFullScreenPhoto} />

      {/* Section 2: Four Core Interactive Portal Hubs */}
      <section className="py-8 sm:py-10 max-w-[1240px] mx-auto px-4 sm:px-6">
        <div className="mb-5 flex flex-col md:flex-row md:items-end justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <span className="text-xs sm:text-sm uppercase tracking-widest font-bold text-amber-700">
              महासंघ डिजिटल सेवा केंद्र
            </span>
            <h2 className="font-serifDevanagari text-xl sm:text-2xl font-extrabold text-[#0b1e36] mt-0.5">
              प्रमुख सेवा व व्यासपीठ दालन
            </h2>
          </div>
          <p className="text-base text-slate-600 max-w-md leading-relaxed">
            राज्यातील सर्व केंद्रप्रमुख व विस्तार अधिकाऱ्यांसाठी उपलब्ध असलेल्या ऑनलाईन सुविधा व अधिकृत अभिलेख.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Hub 1: Membership Registration */}
          <div
            onClick={() => {
              setCurrentTab('membership');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="mhs-card-interactive mhs-stagger-1 group bg-white p-4 sm:p-5 rounded-xl border border-slate-200 hover:border-amber-500 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-800 flex items-center justify-center mb-3 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#0b1e36] group-hover:text-amber-800 transition-colors">
                डिजिटल सदस्यत्व नोंदणी
              </h3>
              <p className="text-base text-slate-600 mt-2 leading-relaxed">
                आजीवन (₹100) व वार्षिक (₹120) सदस्यत्व. ऑनलाईन अर्ज भरून पडताळणीनंतर अधिकृत ओळखपत्र व प्रमाणपत्र डाऊनलोड करा.
              </p>
            </div>
            <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-sm sm:text-base font-bold text-amber-700 group-hover:text-amber-800">
              <span>ऑनलाईन अर्ज करा</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Hub 2: Official Appointments & Letters */}
          <div
            onClick={() => {
              setCurrentTab('appointments');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="mhs-card-interactive mhs-stagger-2 group bg-white p-4 sm:p-5 rounded-xl border border-slate-200 hover:border-blue-600 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-800 flex items-center justify-center mb-3 group-hover:bg-[#0b1e36] group-hover:text-white transition-colors">
                <Award className="w-5 h-5" />
              </div>
              <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#0b1e36] group-hover:text-blue-900 transition-colors">
                पदाधिकारी
              </h3>
              <p className="text-base text-slate-600 mt-2 leading-relaxed">
                महाराष्ट्रातील 34 जिल्ह्यांचे कार्यकारिणी संपादन, A4 रंगीत स्वाक्षरीयुक्त नियुक्ती पत्रे, WhatsApp प्रेषण व राज्य नोंदवही.
              </p>
            </div>
            <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-sm sm:text-base font-bold text-blue-700 group-hover:text-blue-900">
              <span>नियुक्ती पत्रे पहा</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Hub 3: Government Decisions & Circulars */}
          <div
            onClick={() => {
              setCurrentTab('news');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="mhs-card-interactive mhs-stagger-3 group bg-white p-4 sm:p-5 rounded-xl border border-slate-200 hover:border-emerald-600 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center mb-3 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#0b1e36] group-hover:text-emerald-900 transition-colors">
                शासन निर्णय व परिपत्रके
              </h3>
              <p className="text-base text-slate-600 mt-2 leading-relaxed">
                प्राथमिक शिक्षण विभाग, केंद्रप्रमुख पदोन्नती, सेवाज्येष्ठता, वेतन व महासंघाचे अधिकृत निवेदन संग्रह.
              </p>
            </div>
            <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-sm sm:text-base font-bold text-emerald-700 group-hover:text-emerald-900">
              <span>परिपत्रके वाचा</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Hub 4: State Leadership Directory */}
          <div
            onClick={() => {
              setCurrentTab('leadership');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="mhs-card-interactive mhs-stagger-4 group bg-white p-4 sm:p-5 rounded-xl border border-slate-200 hover:border-purple-600 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-800 flex items-center justify-center mb-3 group-hover:bg-purple-700 group-hover:text-white transition-colors">
                <School className="w-5 h-5" />
              </div>
              <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#0b1e36] group-hover:text-purple-900 transition-colors">
                राज्य व जिल्हा नेतृत्व
              </h3>
              <p className="text-base text-slate-600 mt-2 leading-relaxed">
                राज्य कार्यकारिणी, 6 महसूल विभाग समन्वयक आणि सर्व 34 जिल्हाध्यक्षांचे संपर्क क्रमांक व माहिती.
              </p>
            </div>
            <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-sm sm:text-base font-bold text-purple-700 group-hover:text-purple-900">
              <span>कार्यकारिणी पहा</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Core Mandate & Educational Quality */}
      <section className="bg-white py-8 sm:py-12 border-y border-slate-200">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
            <div className="lg:col-span-5 space-y-3">
              <span className="text-xs sm:text-sm uppercase tracking-widest font-bold text-amber-700">
                आमचे ध्येय व कार्यप्रणाली
              </span>
              <h2 className="font-serifDevanagari text-xl sm:text-2xl font-extrabold text-[#0b1e36] leading-tight">
                शिक्षणाच्या मुळाशी काम करणाऱ्या अधिकाऱ्यांचा सशक्त आवाज.
              </h2>
              <p className="text-base text-slate-700 leading-relaxed font-normal">
                केंद्रप्रमुख हा प्राथमिक शाळा आणि प्रशासन यांच्यातील सर्वात महत्त्वाचा दुवा आहे. शैक्षणिक गुणवत्ता वाढवणे आणि त्याचवेळी अधिकाऱ्यांच्या न्याय्य हक्कांसाठी शासन दरबारी पाठपुरावा करणे हे महासंघाचे मुख्य कर्तव्य आहे.
              </p>
              <div className="pt-1">
                <button
                  onClick={() => {
                    setCurrentTab('about');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="bg-[#0b1e36] hover:bg-[#132f52] text-white font-bold text-sm sm:text-base px-4 py-2.5 rounded-lg inline-flex items-center gap-2 transition-colors"
                >
                  <span>आमच्याबद्दल सविस्तर वाचा</span>
                  <ArrowRight className="w-4 h-4 text-amber-400" />
                </button>
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-900 flex items-center justify-center font-bold mb-2 text-sm">
                  01
                </div>
                <h4 className="font-serifDevanagari font-bold text-lg sm:text-xl text-[#0b1e36]">
                  वेतन व सेवाशर्ती सुधारणा
                </h4>
                <p className="text-base text-slate-600 mt-1.5 leading-relaxed">
                  वेतनश्रेणीतील विसंगती दूर करणे, पदोन्नतीचे मार्ग मोकळे करणे आणि कामाचा योग्य मोबदला मिळवून देण्यासाठी शासनस्तरावर निरंतर पाठपुरावा.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-900 flex items-center justify-center font-bold mb-2 text-sm">
                  02
                </div>
                <h4 className="font-serifDevanagari font-bold text-lg sm:text-xl text-[#0b1e36]">
                  शैक्षणिक गुणवत्ता सक्षमीकरण
                </h4>
                <p className="text-base text-slate-600 mt-1.5 leading-relaxed">
                  नवीन शैक्षणिक धोरण व डिजिटल प्रशासनासाठी केंद्रप्रमुखांना आधुनिक प्रशिक्षण, कार्यशाळा व मार्गदर्शन उपलब्ध करणे.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-900 flex items-center justify-center font-bold mb-2 text-sm">
                  03
                </div>
                <h4 className="font-serifDevanagari font-bold text-lg sm:text-xl text-[#0b1e36]">
                  कायदेशीर व प्रशासकीय संरक्षण
                </h4>
                <p className="text-base text-slate-600 mt-1.5 leading-relaxed">
                  कामाच्या ठिकाणी स्वाभिमान, अनपेक्षित कारवायांविरुद्ध कायदेविषयक सल्ला आणि संघटनात्मक संरक्षणाची भक्कम हमी.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-900 flex items-center justify-center font-bold mb-2 text-sm">
                  04
                </div>
                <h4 className="font-serifDevanagari font-bold text-lg sm:text-xl text-[#0b1e36]">
                  पारदर्शक व डिजिटल महासंघ
                </h4>
                <p className="text-base text-slate-600 mt-1.5 leading-relaxed">
                  संपूर्ण 34 जिल्ह्यांत डिजिटल ओळखपत्रे, ऑनलाईन नियुक्ती पत्रे व थेट संपर्क प्रणालीद्वारे संपूर्ण पारदर्शक कारभार.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Full-Screen Original Size Photo Lightbox Modal — Rendered via Portal directly in document.body */}
      {fullScreenPhoto && typeof document !== 'undefined' && createPortal(
        <div
          className="mhs-modal-enter fixed inset-0 z-[130] bg-black/95 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 select-none"
          onClick={() => setFullScreenPhoto(null)}
        >
          {/* Top-Right CLOSE Button (उजव्या वरच्या कोपर्यात CLOSE बटन) */}
          <button
            type="button"
            onClick={() => setFullScreenPhoto(null)}
            className="fixed top-3 right-3 sm:top-5 sm:right-5 z-[140] flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-full font-bold text-xs sm:text-sm shadow-2xl transition-all cursor-pointer border border-white/30"
            title="CLOSE"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>CLOSE</span>
          </button>

          {/* Original full size photo display without any text, names or icons */}
          <div
            className="w-full h-full flex items-center justify-center overflow-auto p-1 sm:p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setFullScreenPhoto(null);
              }
            }}
          >
            <img
              src={fullScreenPhoto}
              alt="Full Size View"
              className="max-w-[96vw] max-h-[92vh] w-auto h-auto object-contain rounded-lg shadow-2xl mx-auto"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

function LatestUpdatesCarousel({ banners, setFullScreenPhoto }: { banners: LatestBannerItem[]; setFullScreenPhoto: (url: string) => void }) {
  const activeBanners = useMemo(() => {
    const parseTime = (item: LatestBannerItem): number => {
      if (item.createdAt) {
        const t = new Date(item.createdAt).getTime();
        if (!isNaN(t) && t > 0) return t;
      }
      if (item.date) {
        const eng = toEnglishDigits(String(item.date).trim());
        const dmy = eng.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (dmy) {
          return new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10)).getTime();
        }
        const t = new Date(eng).getTime();
        if (!isNaN(t) && t > 0) return t;
      }
      return 0;
    };
    return [...banners].sort((a, b) => parseTime(b) - parseTime(a));
  }, [banners]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const newestBannerId = activeBanners[0]?.id;

  useEffect(() => {
    setCurrentIndex(0);
  }, [newestBannerId]);

  // Touch swipe state
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isLeftSwipe) {
      nextBanner();
    } else if (isRightSwipe) {
      prevBanner();
    }
  };

  const nextBanner = () => {
    setCurrentIndex((prev) => (prev + 1) % activeBanners.length);
  };

  const prevBanner = () => {
    setCurrentIndex((prev) => (prev - 1 + activeBanners.length) % activeBanners.length);
  };

  if (activeBanners.length === 0) return null;

  const safeIndex = currentIndex < activeBanners.length ? currentIndex : 0;
  const current = activeBanners[safeIndex];
  const imgUrl = current.imageUrl;
  const hasSummary = Boolean(current.summary && current.summary.trim() && current.summary.trim() !== current.title?.trim());

  return (
    <section className="py-6 sm:py-8 max-w-[1240px] mx-auto px-4 sm:px-6">
      <div className="mb-4 pb-2 border-b border-slate-200 flex items-center justify-between">
        <div>
          <span className="text-xs sm:text-sm uppercase tracking-widest font-bold text-amber-700">
            अधिकृत प्रसिद्धी व बॅनर्स
          </span>
          <h2 className="font-serifDevanagari text-xl sm:text-2xl font-extrabold text-[#0b1e36] mt-0.5">
            ताज्या घडामोडी
          </h2>
        </div>
        {activeBanners.length > 1 && (
          <span className="text-xs sm:text-sm font-mono font-bold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-md">
            {safeIndex + 1} / {activeBanners.length}
          </span>
        )}
      </div>

      <div
        className="w-full bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-md overflow-hidden select-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* वरचा भाग: दिनांक व शीर्षक (फोटोच्या वर - फोटोवर नाही) */}
        <div className="px-4 sm:px-6 py-3 sm:py-3.5 bg-slate-50 border-b border-slate-200 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs sm:text-sm font-bold text-amber-800">
              ताज्या घडामोडी · {toEnglishDigits(current.date)}
            </span>
          </div>
          {current.title && (
            <h3 className="font-serifDevanagari text-[#0b1e36] text-base sm:text-xl font-bold leading-snug">
              {toEnglishDigits(current.title)}
            </h3>
          )}
        </div>

        {/* मधला भाग: छायाचित्र किंवा इनलाईन शॉर्ट व्हिडिओ (Zero external player, plays inline) */}
        <div className="relative w-full bg-slate-950/5 flex items-center justify-center">
          {current.mediaType === 'video' || current.videoUrl ? (
            <div className="w-full flex items-center justify-center p-2 bg-black/90">
              <video
                src={current.videoUrl || current.imageUrl}
                controls
                playsInline
                preload="metadata"
                poster={current.imageUrl && current.imageUrl !== current.videoUrl ? current.imageUrl : undefined}
                className="w-full h-auto max-h-[75vh] object-contain mx-auto block rounded"
              >
                आपला ब्राऊझर या व्हिडिओला सपोर्ट करत नाही.
              </video>
            </div>
          ) : (
            <div
              onClick={() => imgUrl && setFullScreenPhoto(imgUrl)}
              className="w-full flex items-center justify-center cursor-pointer p-2"
            >
              <img
                src={imgUrl}
                alt={current.title || 'ताज्या घडामोडी'}
                className="w-full h-auto max-h-[75vh] object-contain mx-auto block"
                loading="eager"
              />
            </div>
          )}

          {/* ठळक डावे व उजवे बाण (फक्त बाजूला, मजकूर नसलेले) */}
          {activeBanners.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); prevBanner(); }}
                className="absolute left-1.5 sm:left-3 top-1/2 -translate-y-1/2 bg-[#0b1e36]/75 hover:bg-[#0b1e36] text-white w-8 h-11 sm:w-10 sm:h-12 rounded-lg flex items-center justify-center shadow-lg transition-transform hover:scale-105 cursor-pointer border border-white/30 z-10 font-bold text-xl"
                aria-label="मागील फोटो"
                title="मागील फोटो"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); nextBanner(); }}
                className="absolute right-1.5 sm:right-3 top-1/2 -translate-y-1/2 bg-[#0b1e36]/75 hover:bg-[#0b1e36] text-white w-8 h-11 sm:w-10 sm:h-12 rounded-lg flex items-center justify-center shadow-lg transition-transform hover:scale-105 cursor-pointer border border-white/30 z-10 font-bold text-xl"
                aria-label="पुढील फोटो"
                title="पुढील फोटो"
              >
                ›
              </button>
            </>
          )}
        </div>

        {/* खालचा भाग: सारांश व स्लाईड बटणे (फोटोच्या खाली) */}
        {(hasSummary || activeBanners.length > 1) && (
          <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 space-y-2.5">
            {hasSummary && (
              <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
                {toEnglishDigits(current.summary)}
              </p>
            )}

            {activeBanners.length > 1 && (
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={prevBanner}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-xs sm:text-sm font-bold text-[#0b1e36] cursor-pointer transition-colors"
                >
                  ‹ मागील
                </button>

                <div className="flex items-center gap-1.5 flex-wrap justify-center max-w-[60%]">
                  {activeBanners.slice(0, 12).map((_, idx: number) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      className={`h-2 rounded-full transition-all cursor-pointer ${idx === safeIndex ? 'bg-[#0b1e36] w-5' : 'bg-slate-300 hover:bg-slate-400 w-2'}`}
                      aria-label={`Slide ${idx + 1}`}
                    />
                  ))}
                  {activeBanners.length > 12 && (
                    <span className="text-xs font-mono text-slate-500 ml-1">
                      ({safeIndex + 1}/{activeBanners.length})
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={nextBanner}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-xs sm:text-sm font-bold text-[#0b1e36] cursor-pointer transition-colors"
                >
                  पुढील ›
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}



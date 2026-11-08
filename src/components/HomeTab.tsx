import React from 'react';
import {
  ArrowRight, ShieldCheck, Users, School, Award, ChevronRight,
  FileText, Phone, CheckCircle2, BookOpen, Scale, Sparkles, AlertCircle
} from 'lucide-react';
import { ORG_DETAILS, CORE_PRINCIPLES, INITIAL_NEWS, NewsItem } from '../data/mahasanghData';
import { toEnglishDigits } from '../utils/formatters';

interface HomeTabProps {
  setCurrentTab: (tab: string) => void;
  onSelectNews: (news: NewsItem) => void;
  newsList?: NewsItem[];
}

export const HomeTab: React.FC<HomeTabProps> = ({ setCurrentTab, onSelectNews, newsList }) => {
  const recentNews = (newsList && newsList.length > 0 ? newsList : INITIAL_NEWS).slice(0, 3);

  return (
    <div className="bg-slate-50 text-slate-800">
      {/* Hero Section: Modern Executive Asymmetric Portal */}
      <section className="relative bg-gradient-to-b from-[#0b1e36] via-[#0d2545] to-[#0b1e36] text-white py-12 md:py-20 px-4 sm:px-6 overflow-hidden border-b border-slate-800">
        {/* Subtle architectural background texture */}
        <div
          className="absolute inset-0 opacity-10 bg-cover bg-center pointer-events-none mix-blend-overlay"
          style={{ backgroundImage: `url('/heding.jpg')` }}
        />
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative max-w-[1240px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Authoritative Mission Statement & Core CTAs */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-xs rounded-full border border-amber-400/30 text-amber-300 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>शासन नोंदणीकृत श्रमिक संघटना · नोंदणी क्र. {ORG_DETAILS.registrationNo}</span>
            </div>

            <h1 className="font-serifDevanagari text-3xl sm:text-4xl md:text-5xl font-extrabold leading-[1.2] tracking-tight text-slate-100">
              प्राथमिक शिक्षणाची धुरा सांभाळणाऱ्या <br className="hidden sm:block" />
              <span className="text-amber-400 font-bold not-italic leading-[47px]">केंद्रप्रमुख व अधिकाऱ्यांचे</span> महासंघटन.
            </h1>

            <p className="text-sm sm:text-base md:text-lg text-slate-300 leading-relaxed max-w-2xl font-normal">
              महाराष्ट्रभरातील केंद्रप्रमुख, विस्तार अधिकारी व शिक्षण प्रशासकीय संवर्गाच्या सन्मानासाठी, हक्कांसाठी आणि गुणवत्तापूर्ण प्राथमिक शिक्षणासाठी कार्यरत असलेले सर्वोच्च व्यासपीठ.
            </p>

            {/* Quick Action CTAs */}
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={() => {
                  setCurrentTab('membership');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="bg-amber-500 hover:bg-amber-600 text-[#0b1e36] font-bold px-6 py-3 rounded-lg text-sm sm:text-base flex items-center gap-2 shadow-lg hover:shadow-amber-500/20 transition-all active:scale-98"
              >
                <span>सदस्यत्व अर्ज करा</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setCurrentTab('appointments');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="bg-white/10 hover:bg-white/20 text-white font-semibold px-5 py-3 rounded-lg text-sm sm:text-base border border-white/20 transition-all flex items-center gap-2"
              >
                <Award className="w-4 h-4 text-amber-400" />
                <span>पदाधिकारी</span>
              </button>

              <button
                onClick={() => {
                  setCurrentTab('news');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="text-slate-300 hover:text-white font-medium px-4 py-3 text-sm transition-colors"
              >
                बातम्या आणि परिपत्रके →
              </button>
            </div>

            {/* Key Organization Stats Strip (English numerals 0-9) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-slate-700/60">
              <div>
                <strong className="block text-xl sm:text-2xl font-black font-mono text-amber-400">34</strong>
                <span className="text-xs text-slate-400">जिल्हा शाखा</span>
              </div>
              <div>
                <strong className="block text-xl sm:text-2xl font-black font-mono text-amber-400">350+</strong>
                <span className="text-xs text-slate-400">तालुका कार्यकारिणी</span>
              </div>
              <div>
                <strong className="block text-xl sm:text-2xl font-black font-mono text-amber-400">5000</strong>
                <span className="text-xs text-slate-400">सदस्य उद्दिष्ट</span>
              </div>
              <div>
                <strong className="block text-xl sm:text-2xl font-black font-mono text-emerald-400">100%</strong>
                <span className="text-xs text-slate-400">कायदेशीर संरक्षण</span>
              </div>
            </div>
          </div>

          {/* Right Column: Founder State President Executive Feature Card */}
          <div className="lg:col-span-5">
            <div className="bg-slate-900/90 rounded-2xl border-2 border-amber-500/40 p-6 sm:p-7 shadow-2xl relative backdrop-blur-md">
              <div className="absolute top-4 right-4 bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                संस्थापक नेतृत्व
              </div>

              <div className="flex items-center gap-4 mb-4">
                <img
                  src="/president.jpg"
                  alt={ORG_DETAILS.founderPresident.name}
                  className="w-20 h-20 sm:w-22 sm:h-22 rounded-full object-cover object-center ring-4 ring-amber-500 shadow-md shrink-0 bg-white"
                />
                <div>
                  <span className="text-xs font-semibold text-amber-400 tracking-wide block">
                    {ORG_DETAILS.founderPresident.role}
                  </span>
                  <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-white leading-tight mt-0.5">
                    {ORG_DETAILS.founderPresident.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 font-mono">
                    {ORG_DETAILS.founderPresident.education}
                  </p>
                </div>
              </div>

              <blockquote className="text-xs sm:text-sm text-slate-300 leading-relaxed italic border-l-2 border-amber-500 pl-3 mb-5">
                "{ORG_DETAILS.founderPresident.message}"
              </blockquote>

              <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                <a
                  href={`tel:${ORG_DETAILS.founderPresident.phone}`}
                  className="bg-amber-500 hover:bg-amber-600 text-[#0b1e36] font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>थेट संपर्क: {ORG_DETAILS.founderPresident.phone}</span>
                </a>
                <span className="text-slate-400">
                  कार्यालय: मालेगाव (नाशिक)
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Four Core Interactive Portal Hubs (Distinctive Layout) */}
      <section className="py-12 sm:py-16 max-w-[1240px] mx-auto px-4 sm:px-6">
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <span className="text-xs uppercase tracking-widest font-bold text-amber-700">
              महासंघ डिजिटल सेवा केंद्र
            </span>
            <h2 className="font-serifDevanagari text-2xl sm:text-3xl font-extrabold text-[#0b1e36] mt-1">
              प्रमुख सेवा व व्यासपीठ दालन
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md">
            राज्यातील सर्व केंद्रप्रमुख व विस्तार अधिकाऱ्यांसाठी उपलब्ध असलेल्या ऑनलाईन सुविधा व अधिकृत अभिलेख.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Hub 1: Membership Registration */}
          <div
            onClick={() => {
              setCurrentTab('membership');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="group bg-white p-6 rounded-xl border border-slate-200 hover:border-amber-500 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center mb-4 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="font-serifDevanagari text-lg font-bold text-[#0b1e36] group-hover:text-amber-800 transition-colors">
                डिजिटल सदस्यत्व नोंदणी
              </h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                आजीवन (₹100) व वार्षिक (₹120) सदस्यत्व. ऑनलाईन अर्ज भरून पडताळणीनंतर अधिकृत ओळखपत्र व प्रमाणपत्र डाऊनलोड करा.
              </p>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-amber-700 group-hover:text-amber-800">
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
            className="group bg-white p-6 rounded-xl border border-slate-200 hover:border-blue-600 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-800 flex items-center justify-center mb-4 group-hover:bg-[#0b1e36] group-hover:text-white transition-colors">
                <Award className="w-6 h-6" />
              </div>
              <h3 className="font-serifDevanagari text-lg font-bold text-[#0b1e36] group-hover:text-blue-900 transition-colors">
                पदाधिकारी
              </h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                महाराष्ट्रातील 34 जिल्ह्यांचे कार्यकारिणी संपादन, A4 रंगीत स्वाक्षरीयुक्त नियुक्ती पत्रे, WhatsApp प्रेषण व राज्य नोंदवही.
              </p>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue-700 group-hover:text-blue-900">
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
            className="group bg-white p-6 rounded-xl border border-slate-200 hover:border-emerald-600 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="font-serifDevanagari text-lg font-bold text-[#0b1e36] group-hover:text-emerald-900 transition-colors">
                शासन निर्णय व परिपत्रके
              </h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                प्राथमिक शिक्षण विभाग, केंद्रप्रमुख पदोन्नती, सेवाज्येष्ठता, वेतन व महासंघाचे अधिकृत निवेदन संग्रह.
              </p>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-emerald-700 group-hover:text-emerald-900">
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
            className="group bg-white p-6 rounded-xl border border-slate-200 hover:border-purple-600 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-800 flex items-center justify-center mb-4 group-hover:bg-purple-700 group-hover:text-white transition-colors">
                <School className="w-6 h-6" />
              </div>
              <h3 className="font-serifDevanagari text-lg font-bold text-[#0b1e36] group-hover:text-purple-900 transition-colors">
                राज्य व जिल्हा नेतृत्व
              </h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                राज्य कार्यकारिणी, 6 महसूल विभाग समन्वयक आणि सर्व 34 जिल्हाध्यक्षांचे संपर्क क्रमांक व माहिती.
              </p>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-purple-700 group-hover:text-purple-900">
              <span>कार्यकारिणी पहा</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Core Mandate & Educational Quality (Distinctive Architecture) */}
      <section className="bg-white py-14 sm:py-20 border-y border-slate-200">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            <div className="lg:col-span-5 space-y-4">
              <span className="text-xs uppercase tracking-widest font-bold text-amber-700">
                आमचे ध्येय व कार्यप्रणाली
              </span>
              <h2 className="font-serifDevanagari text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#0b1e36] leading-tight">
                शिक्षणाच्या मुळाशी काम करणाऱ्या अधिकाऱ्यांचा सशक्त आवाज.
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                केंद्रप्रमुख हा प्राथमिक शाळा आणि प्रशासन यांच्यातील सर्वात महत्त्वाचा दुवा आहे. शैक्षणिक गुणवत्ता वाढवणे आणि त्याचवेळी अधिकाऱ्यांच्या न्याय्य हक्कांसाठी शासन दरबारी पाठपुरावा करणे हे महासंघाचे मुख्य कर्तव्य आहे.
              </p>
              <div className="pt-2">
                <button
                  onClick={() => {
                    setCurrentTab('about');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="bg-[#0b1e36] hover:bg-[#132f52] text-white font-bold text-xs sm:text-sm px-5 py-2.5 rounded-lg inline-flex items-center gap-2 transition-colors"
                >
                  <span>आमच्याबद्दल सविस्तर वाचा</span>
                  <ArrowRight className="w-4 h-4 text-amber-400" />
                </button>
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-900 flex items-center justify-center font-bold mb-3">
                  01
                </div>
                <h4 className="font-serifDevanagari font-bold text-base text-[#0b1e36]">
                  वेतन व सेवाशर्ती सुधारणा
                </h4>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  वेतनश्रेणीतील विसंगती दूर करणे, पदोन्नतीचे मार्ग मोकळे करणे आणि कामाचा योग्य मोबदला मिळवून देण्यासाठी शासनस्तरावर निरंतर पाठपुरावा.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-900 flex items-center justify-center font-bold mb-3">
                  02
                </div>
                <h4 className="font-serifDevanagari font-bold text-base text-[#0b1e36]">
                  शैक्षणिक गुणवत्ता सक्षमीकरण
                </h4>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  नवीन शैक्षणिक धोरण व डिजिटल प्रशासनासाठी केंद्रप्रमुखांना आधुनिक प्रशिक्षण, कार्यशाळा व मार्गदर्शन उपलब्ध करणे.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-900 flex items-center justify-center font-bold mb-3">
                  03
                </div>
                <h4 className="font-serifDevanagari font-bold text-base text-[#0b1e36]">
                  कायदेशीर व प्रशासकीय संरक्षण
                </h4>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  कामाच्या ठिकाणी स्वाभिमान, अनपेक्षित कारवायांविरुद्ध कायदेविषयक सल्ला आणि संघटनात्मक संरक्षणाची भक्कम हमी.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-900 flex items-center justify-center font-bold mb-3">
                  04
                </div>
                <h4 className="font-serifDevanagari font-bold text-base text-[#0b1e36]">
                  पारदर्शक व डिजिटल महासंघ
                </h4>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  संपूर्ण 34 जिल्ह्यांत डिजिटल ओळखपत्रे, ऑनलाईन नियुक्ती पत्रे व थेट संपर्क प्रणालीद्वारे संपूर्ण पारदर्शक कारभार.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Latest News & Circulars Gazette */}
      <section className="py-14 max-w-[1240px] mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between gap-4 mb-8 pb-3 border-b border-slate-200">
          <div>
            <span className="text-xs uppercase tracking-widest font-bold text-amber-700">
              अधिकृत प्रसिद्धी
            </span>
            <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
              ताज्या घडामोडी व परिपत्रके
            </h3>
          </div>
          <button
            onClick={() => {
              setCurrentTab('news');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="text-xs sm:text-sm font-bold text-amber-800 hover:text-amber-900 flex items-center gap-1"
          >
            <span>सर्व बातम्या पहा</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {recentNews.map((news, index) => {
            const imgUrl = news.imageUrl || news.image;
            const isPhotoOnly = !news.content || news.content.trim() === '';
            return (
              <article
                key={news.id ? `${news.id}-${index}` : `recent-news-${index}`}
                onClick={() => onSelectNews(news)}
                className="bg-white rounded-xl border border-slate-200 hover:border-amber-500 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between overflow-hidden group"
              >
                <div>
                  {imgUrl && (
                    <div className="w-full h-40 bg-slate-900/5 relative overflow-hidden border-b border-slate-100">
                      <img
                        src={imgUrl}
                        alt={news.title}
                        className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>
                  )}

                  <div className="p-5">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 mb-2.5">
                      <span className="font-semibold text-amber-700">{news.category}</span>
                      <span className="font-mono">{toEnglishDigits(news.date)}</span>
                    </div>
                    <h4 className="font-serifDevanagari text-base font-bold text-[#0b1e36] line-clamp-2 hover:text-amber-800 transition-colors">
                      {toEnglishDigits(news.title)}
                    </h4>
                    {news.summary && (
                      <p className="text-xs text-slate-600 mt-2 line-clamp-3 leading-relaxed">
                        {toEnglishDigits(news.summary)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-amber-800">
                  <span>{isPhotoOnly ? '📷 फोटो पहा' : 'सविस्तर वाचा'}</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
};

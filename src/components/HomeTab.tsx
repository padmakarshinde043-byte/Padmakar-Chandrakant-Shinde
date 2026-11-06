import React from 'react';
import { ArrowRight, ExternalLink, ShieldCheck, Users, School, Award, ChevronRight } from 'lucide-react';
import { ORG_DETAILS, CORE_PRINCIPLES, INITIAL_NEWS, NewsItem } from '../data/mahasanghData';
import { toEnglishDigits } from '../utils/formatters';

interface HomeTabProps {
  setCurrentTab: (tab: string) => void;
  onSelectNews: (news: NewsItem) => void;
}

export const HomeTab: React.FC<HomeTabProps> = ({ setCurrentTab, onSelectNews }) => {
  return (
    <div>
      {/* Hero Section */}
      <section className="relative min-h-[580px] flex items-center bg-[#072038] text-white overflow-hidden">
        {/* Background image with authentic gradient overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-40 mix-blend-luminosity"
          style={{ backgroundImage: `url('/heding.jpg')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#072038]/95 via-[#09243f]/85 to-[#0c2f4a]/70" />

        <div className="relative max-w-[1160px] mx-auto px-4 py-20 w-full z-10">
          <div className="max-w-2xl">
            <p className="uppercase tracking-[0.14em] text-xs font-bold text-[#f8d39b] mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#efb24b]"></span>
              महाराष्ट्रातील शैक्षणिक नेतृत्वाचा विश्वासू आवाज
            </p>
            <h1 className="font-serifDevanagari text-3xl sm:text-4xl md:text-5xl lg:text-[52px] leading-[1.2] font-bold mb-5 tracking-tight">
              शिक्षणाच्या गुणवत्तेसाठी <br />
              <em className="text-[#f8c47b] not-italic">एकजूट, सजग आणि समर्पित.</em>
            </h1>
            <p className="text-base sm:text-lg text-[#e5edf1] leading-relaxed mb-8 max-w-xl">
              केंद्रप्रमुख आणि विस्तार अधिकाऱ्यांच्या हक्कांसाठी, सन्मानासाठी आणि सक्षम शैक्षणिक व्यवस्थेसाठी महासंघाची वाटचाल.
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  setCurrentTab('about');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold px-6 py-3 rounded text-sm sm:text-base inline-flex items-center gap-2 transition-all shadow-md hover:gap-3"
              >
                महासंघ जाणून घ्या <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setCurrentTab('membership');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="bg-white hover:bg-slate-100 text-[#09243f] font-bold px-6 py-3 rounded text-sm sm:text-base transition-colors shadow-md"
              >
                सदस्यत्व अर्ज करा
              </button>
              <button
                onClick={() => {
                  setCurrentTab('news');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="border border-white/60 hover:bg-white/10 text-white font-semibold px-5 py-3 rounded text-sm sm:text-base transition-colors"
              >
                ताज्या बातम्या
              </button>
            </div>
          </div>
        </div>

        {/* Founder President Note Banner at bottom right */}
        <div className="relative md:absolute md:right-8 md:bottom-0 bg-white text-[#09243f] p-5 sm:px-7 sm:py-5 border-t-4 border-[#df6b16] shadow-xl md:max-w-md w-full md:w-auto z-20">
          <span className="block text-xs font-semibold text-[#607184] uppercase tracking-wider mb-1">
            {ORG_DETAILS.founderPresident.role}
          </span>
          <strong className="block font-serifDevanagari text-lg sm:text-xl font-bold text-[#09243f]">
            {ORG_DETAILS.founderPresident.name}
          </strong>
          <small className="block text-xs text-[#607184] mt-1 font-medium">
            {ORG_DETAILS.founderPresident.education}
          </small>
        </div>
      </section>

      {/* Intro Section / आमची भूमिका */}
      <section className="py-16 md:py-24 bg-[#fbf8f2]">
        <div className="max-w-[1160px] mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-start">
            <div className="lg:col-span-5">
              <p className="text-xs uppercase tracking-widest font-bold text-[#df6b16] mb-2">
                आमची भूमिका
              </p>
              <h2 className="font-serifDevanagari text-2xl sm:text-3xl md:text-4xl font-bold text-[#102a43] leading-tight mb-4">
                जबाबदारीची जाणीव,<br />
                <span className="text-[#df6b16]">बदलाची दिशा.</span>
              </h2>
              <div className="w-16 h-1 bg-[#df6b16] rounded-full mb-4"></div>
            </div>
            <div className="lg:col-span-7 space-y-4 text-base sm:text-lg text-[#536477] leading-relaxed">
              <p>
                महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ ही राज्यभरातील शैक्षणिक अधिकाऱ्यांना एकत्र आणणारी, त्यांच्या प्रश्नांना व्यासपीठ देणारी आणि शैक्षणिक गुणवत्तेसाठी सातत्याने कार्य करणारी नोंदणीकृत श्रमिक संघटना आहे.
              </p>
              <p className="text-sm sm:text-base">
                राज्यातील जिल्हा परिषद शाळा, प्राथमिक शिक्षण विभाग आणि विस्तार व्यवस्थापनाचा कणा म्हणून काम करणाऱ्या केंद्रप्रमुखांच्या न्याय्य हक्कांसाठी आणि प्रशासकीय अडचणींवर प्रभावी तोडगा काढण्यासाठी महासंघ कटिबद्ध आहे.
              </p>
              <div className="pt-2">
                <button
                  onClick={() => {
                    setCurrentTab('about');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="font-bold text-[#df6b16] hover:text-[#b85309] text-sm sm:text-base inline-flex items-center gap-2 group"
                >
                  आमच्याबद्दल अधिक वाचा{' '}
                  <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Statistical Strengths */}
      <section className="bg-[#09243f] text-white py-10 border-y border-[#17366d]">
        <div className="max-w-[1160px] mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="p-3">
              <div className="text-3xl sm:text-4xl font-bold font-serif text-[#efb24b] mb-1">
                34
              </div>
              <div className="text-xs sm:text-sm text-[#dbe8f1] font-medium flex items-center justify-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#efb24b]" />
                कार्यकारी जिल्हे
              </div>
            </div>
            <div className="p-3">
              <div className="text-3xl sm:text-4xl font-bold font-serif text-[#efb24b] mb-1">
                350+
              </div>
              <div className="text-xs sm:text-sm text-[#dbe8f1] font-medium flex items-center justify-center gap-1">
                <School className="w-3.5 h-3.5 text-[#efb24b]" />
                तालुका समन्वय
              </div>
            </div>
            <div className="p-3">
              <div className="text-3xl sm:text-4xl font-bold font-serif text-[#efb24b] mb-1">
                50,000+
              </div>
              <div className="text-xs sm:text-sm text-[#dbe8f1] font-medium flex items-center justify-center gap-1">
                <Users className="w-3.5 h-3.5 text-[#efb24b]" />
                अधिकारी व सहकारी
              </div>
            </div>
            <div className="p-3">
              <div className="text-3xl sm:text-4xl font-bold font-serif text-[#efb24b] mb-1">
                100%
              </div>
              <div className="text-xs sm:text-sm text-[#dbe8f1] font-medium flex items-center justify-center gap-1">
                <Award className="w-3.5 h-3.5 text-[#efb24b]" />
                समर्पण व सेवाभाव
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Appointment Portal Banner */}
      <section className="bg-gradient-to-r from-[#700f13] via-[#851216] to-[#09243f] text-white py-6 border-b border-[#d4af37]">
        <div className="max-w-[1160px] mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center shrink-0">
              <Award className="w-6 h-6 text-[#efb24b]" />
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-widest text-[#f8d39b] font-bold block">
                अधिकृत डिजिटल पोर्टल
              </span>
              <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-white">
                जिल्हा पदाधिकारी यादी व अधिकृत नियुक्ती पत्रे
              </h3>
              <p className="text-xs text-[#dbe8f1] mt-0.5">
                सर्व 36 जिल्ह्यांमधील पदाधिकाऱ्यांची यादी, थेट A4 नियुक्ती पत्र डाऊनलोड व WhatsApp प्रेषण.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setCurrentTab('appointments');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="shrink-0 bg-[#efb24b] hover:bg-[#df6b16] text-[#09243f] hover:text-white font-bold text-xs sm:text-sm px-5 py-2.5 rounded-lg transition-all shadow-md flex items-center gap-2"
          >
            नियुक्ती पत्र पोर्टल उघडा <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Core Principles Section / कामाची चार सूत्रे */}
      <section className="py-16 md:py-20 bg-[#f0e9de]">
        <div className="max-w-[1160px] mx-auto px-4">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <div>
              <p className="text-xs uppercase tracking-widest font-bold text-[#df6b16] mb-1">
                आमची मूल्ये
              </p>
              <h2 className="font-serifDevanagari text-2xl sm:text-3xl font-bold text-[#102a43]">
                कामाची चार सूत्रे
              </h2>
            </div>
            <p className="text-sm text-[#607184] max-w-sm">
              प्रत्येक उपक्रम आणि निर्णयाच्या केंद्रस्थानी असलेली महासंघाची स्पष्ट मूल्ये.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CORE_PRINCIPLES.map((principle) => (
              <article
                key={principle.num}
                className="bg-[#fbf8f2] p-6 rounded border border-[#e7ded1] shadow-xs hover:shadow-md transition-shadow relative overflow-hidden group"
              >
                <div className="absolute top-0 right-0 w-16 h-16 bg-[#fff0df] rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-125" />
                <span className="relative text-sm font-bold text-[#df6b16] tracking-wider block mb-4">
                  {principle.num}
                </span>
                <h3 className="font-serifDevanagari text-xl font-bold text-[#102a43] mb-2">
                  {principle.title}
                </h3>
                <p className="text-xs sm:text-sm text-[#607184] leading-relaxed">
                  {principle.desc}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Latest Updates / ताज्या घडामोडी */}
      <section className="py-16 md:py-20 bg-[#fbf8f2]">
        <div className="max-w-[1160px] mx-auto px-4">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-xs uppercase tracking-widest font-bold text-[#df6b16] mb-1">
                ताज्या घडामोडी
              </p>
              <h2 className="font-serifDevanagari text-2xl sm:text-3xl font-bold text-[#102a43]">
                महासंघातील नवीनतम वृत्त
              </h2>
            </div>
            <button
              onClick={() => {
                setCurrentTab('news');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="text-xs sm:text-sm font-bold text-[#df6b16] hover:text-[#b85309] flex items-center gap-1 group"
            >
              सर्व बातम्या <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Feature News 1: Letter Pad */}
            {INITIAL_NEWS[0] && (
              <article
                onClick={() => onSelectNews(INITIAL_NEWS[0])}
                className="lg:col-span-7 bg-[#09243f] text-white p-6 sm:p-8 rounded-lg border border-[#17366d] shadow-sm hover:shadow-md cursor-pointer transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-[#df6b16] mb-4">
                    <span>{toEnglishDigits(INITIAL_NEWS[0].date)}</span>
                    <span className="text-[#b9c9d3]">· {INITIAL_NEWS[0].category}</span>
                  </div>
                  <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-white mb-3 hover:text-[#f8d39b] transition-colors">
                    {INITIAL_NEWS[0].title}
                  </h3>
                  <p className="text-sm text-[#c8d7e1] leading-relaxed mb-6">
                    {INITIAL_NEWS[0].summary}
                  </p>
                  {INITIAL_NEWS[0].image && (
                    <div className="bg-[#0e2c4c] p-2 rounded border border-[#23425f] mb-4 max-h-48 overflow-hidden">
                      <img
                        src={INITIAL_NEWS[0].image}
                        alt="लेटर पॅड"
                        loading="lazy"
                        decoding="async"
                        className="w-full h-40 object-cover rounded"
                      />
                    </div>
                  )}
                </div>
                <div className="text-sm font-bold text-[#f8d39b] inline-flex items-center gap-1 pt-2">
                  सविस्तर वाचा <ArrowRight className="w-4 h-4" />
                </div>
              </article>
            )}

            {/* Side News Cards */}
            <div className="lg:col-span-5 space-y-4 flex flex-col">
              {INITIAL_NEWS.slice(1, 3).map((item) => (
                <article
                  key={item.id}
                  onClick={() => onSelectNews(item)}
                  className="bg-white p-5 sm:p-6 rounded-lg border border-[#e7ded1] shadow-xs hover:shadow-md cursor-pointer transition-all flex-1 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold text-[#df6b16] mb-2">
                      <span>{toEnglishDigits(item.date)}</span>
                      <span className="text-[#607184]">· {item.category}</span>
                    </div>
                    <h3 className="font-serifDevanagari text-lg font-bold text-[#102a43] mb-2 hover:text-[#df6b16] transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#607184] leading-relaxed line-clamp-3">
                      {item.summary}
                    </p>
                  </div>
                  <div className="text-xs font-bold text-[#df6b16] inline-flex items-center gap-1 mt-4">
                    सविस्तर बातमी →
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Contact Strip Banner */}
      <section className="bg-[#df6b16] text-white py-12 md:py-14">
        <div className="max-w-[1160px] mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <p className="uppercase text-xs font-bold tracking-widest text-[#ffe7c9] mb-1">
              आपला सहभाग महत्त्वाचा आहे
            </p>
            <h2 className="font-serifDevanagari text-2xl sm:text-3xl font-bold">
              महासंघाशी जोडले जा — आजच सभासद व्हा!
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                setCurrentTab('membership');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="bg-white hover:bg-slate-50 text-[#09243f] font-bold px-6 py-3 rounded text-sm transition-colors shadow-md inline-flex items-center gap-2"
            >
              सदस्यत्व अर्ज <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setCurrentTab('contact');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="border-2 border-white text-white hover:bg-white/10 font-bold px-5 py-3 rounded text-sm transition-colors"
            >
              संपर्क माहिती
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

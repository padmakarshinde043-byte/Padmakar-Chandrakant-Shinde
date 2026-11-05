import React from 'react';
import { Target, CheckCircle2, Clock, Scale, GraduationCap, Users, Megaphone, FileText, Award, ArrowRight } from 'lucide-react';
import { CORE_DEMANDS, ACTION_PLAN, MEMBER_BENEFITS } from '../data/mahasanghData';

interface ObjectivesTabProps {
  setCurrentTab: (tab: string) => void;
}

export const ObjectivesTab: React.FC<ObjectivesTabProps> = ({ setCurrentTab }) => {
  const getBenefitIcon = (iconName: string) => {
    switch (iconName) {
      case 'Scale':
        return <Scale className="w-6 h-6 text-[#df6b16]" />;
      case 'GraduationCap':
        return <GraduationCap className="w-6 h-6 text-[#df6b16]" />;
      case 'Users':
        return <Users className="w-6 h-6 text-[#df6b16]" />;
      case 'Megaphone':
        return <Megaphone className="w-6 h-6 text-[#df6b16]" />;
      case 'FileText':
        return <FileText className="w-6 h-6 text-[#df6b16]" />;
      case 'Award':
        return <Award className="w-6 h-6 text-[#df6b16]" />;
      default:
        return <Target className="w-6 h-6 text-[#df6b16]" />;
    }
  };

  return (
    <div className="bg-[#fbf8f2] py-10 md:py-16">
      {/* Page Header */}
      <div className="max-w-[1160px] mx-auto px-4 mb-12">
        <div className="border-b border-[#e7ded1] pb-6">
          <p className="text-xs uppercase tracking-widest font-bold text-[#df6b16] mb-1">
            ध्येय व उद्दिष्टे
          </p>
          <h1 className="font-serifDevanagari text-3xl sm:text-4xl font-bold text-[#09243f]">
            महासंघाची उद्दिष्टे, प्रलंबित मागण्या व कृती आराखडा
          </h1>
          <p className="text-base text-[#607184] mt-2 max-w-3xl">
            केंद्रप्रमुख व विस्तार अधिकारी संवर्गाच्या न्याय्य मागण्यांची शासन दरबारी तडजोड न करता पूर्तता करणे आणि शैक्षणिक प्रशासनाला सक्षम करणे.
          </p>
        </div>
      </div>

      <div className="max-w-[1160px] mx-auto px-4 space-y-16">
        {/* Section 1: Major Demands & Issues */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <Target className="w-6 h-6 text-[#df6b16]" />
            <h2 className="font-serifDevanagari text-2xl font-bold text-[#09243f]">
              प्रमुख प्रलंबित मागण्या व शासन संवाद
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {CORE_DEMANDS.map((demand, idx) => (
              <div
                key={idx}
                className="bg-white p-6 rounded-xl border border-[#e7ded1] shadow-xs hover:border-[#df6b16] transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#fff0df] text-[#df6b16]">
                      मागणी #{idx + 1}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      <Clock className="w-3 h-3" />
                      {demand.status}
                    </span>
                  </div>
                  <h3 className="font-serifDevanagari text-xl font-bold text-[#09243f] mb-2">
                    {demand.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#536477] leading-relaxed">
                    {demand.desc}
                  </p>
                </div>
                <div className="pt-4 mt-4 border-t border-[#f0e9de] flex items-center gap-2 text-xs text-[#607184]">
                  <CheckCircle2 className="w-4 h-4 text-[#df6b16] shrink-0" />
                  <span>शासनास अधिकृत निवेदन व पाठपुरावा सुरू आहे.</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 2: 3-Stage Action Plan (कृती आराखडा) */}
        <section className="bg-white p-6 sm:p-10 rounded-xl border border-[#e7ded1] shadow-xs">
          <div className="max-w-2xl mb-8">
            <span className="text-xs uppercase tracking-widest font-bold text-[#df6b16]">
              नियोजनबद्ध कार्यपद्धती
            </span>
            <h2 className="font-serifDevanagari text-2xl sm:text-3xl font-bold text-[#09243f] mt-1">
              महासंघाचा त्रिसूत्री कृती आराखडा
            </h2>
            <p className="text-xs sm:text-sm text-[#607184] mt-1">
              ध्येयपूर्तीसाठी महासंघाने टप्प्याटप्प्याने रणनीती निश्चित केली आहे.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {ACTION_PLAN.map((plan) => (
              <div
                key={plan.step}
                className="bg-[#fbf8f2] p-6 rounded-lg border border-[#e7ded1] relative overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="w-10 h-10 rounded-full bg-[#09243f] text-[#efb24b] font-serifDevanagari font-bold text-lg flex items-center justify-center mb-4">
                    {plan.step}
                  </div>
                  <h3 className="font-serifDevanagari text-lg font-bold text-[#09243f] mb-2">
                    {plan.phase}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#607184] leading-relaxed mb-4">
                    {plan.desc}
                  </p>
                </div>
                <div className="pt-4 border-t border-[#e7ded1]/80 space-y-1.5">
                  {plan.badges.map((b, bi) => (
                    <span
                      key={bi}
                      className="block text-[11px] font-semibold bg-white text-[#09243f] px-2.5 py-1 rounded border border-[#e7ded1]"
                    >
                      • {b}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Member Benefits & Facilities */}
        <section>
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs uppercase tracking-widest font-bold text-[#df6b16]">
              सदस्यांसाठी सुविधा
            </span>
            <h2 className="font-serifDevanagari text-2xl sm:text-3xl font-bold text-[#09243f] mt-1">
              महासंघाच्या सदस्यत्वाचे थेट फायदे
            </h2>
            <p className="text-xs sm:text-sm text-[#607184] mt-1">
              केवळ संघटन नव्हे, तर प्रत्येक सदस्याच्या पाठीशी संकटकाळी आणि प्रगतीच्या वाटेवर खंबीर साथ.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {MEMBER_BENEFITS.map((item, idx) => (
              <div
                key={idx}
                className="bg-white p-6 rounded-lg border border-[#e7ded1] shadow-xs hover:border-[#df6b16] transition-all"
              >
                <div className="w-12 h-12 rounded-lg bg-[#fff0df] flex items-center justify-center mb-4">
                  {getBenefitIcon(item.icon)}
                </div>
                <h3 className="font-serifDevanagari text-lg font-bold text-[#09243f] mb-2">
                  {item.title}
                </h3>
                <p className="text-xs sm:text-sm text-[#607184] leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 4: Future Vision */}
        <section className="bg-[#09243f] text-white p-8 sm:p-10 rounded-xl">
          <div className="max-w-3xl space-y-4">
            <span className="text-xs uppercase tracking-widest font-bold text-[#efb24b]">
              भविष्यातील दिशा
            </span>
            <h2 className="font-serifDevanagari text-2xl sm:text-3xl font-bold">
              आधुनिक तंत्रज्ञान व राष्ट्रीय समन्वयाकडे वाटचाल
            </h2>
            <p className="text-sm sm:text-base text-[#dbe8f1] leading-relaxed">
              महासंघ केवळ एका राज्यापुरता मर्यादित न राहता राष्ट्रीय स्तरावरील शिक्षण संघटनांशी समन्वय साधेल. सर्व सभासदांसाठी डिजिटल प्लॅटफॉर्म, ऑनलाइन सेवा व शैक्षणिक संशोधन केंद्राची निर्मिती करण्याचे उद्दिष्ट निश्चित करण्यात आले आहे.
            </p>
            <div className="pt-2">
              <button
                onClick={() => {
                  setCurrentTab('membership');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold px-6 py-3 rounded text-sm transition-colors shadow-md inline-flex items-center gap-2"
              >
                आजच महासंघाचे सदस्य व्हा <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

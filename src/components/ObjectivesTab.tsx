import React from 'react';
import { Target, CheckCircle2, Clock, Scale, GraduationCap, Users, Megaphone, FileText, Award, ArrowRight, ShieldCheck } from 'lucide-react';
import { CORE_DEMANDS, ACTION_PLAN, MEMBER_BENEFITS } from '../data/mahasanghData';
import { toEnglishDigits } from '../utils/formatters';

interface ObjectivesTabProps {
  setCurrentTab: (tab: string) => void;
}

export const ObjectivesTab: React.FC<ObjectivesTabProps> = ({ setCurrentTab }) => {
  const getBenefitIcon = (iconName: string) => {
    switch (iconName) {
      case 'Scale':
        return <Scale className="w-5 h-5 text-amber-700" />;
      case 'GraduationCap':
        return <GraduationCap className="w-5 h-5 text-amber-700" />;
      case 'Users':
        return <Users className="w-5 h-5 text-amber-700" />;
      case 'Megaphone':
        return <Megaphone className="w-5 h-5 text-amber-700" />;
      case 'FileText':
        return <FileText className="w-5 h-5 text-amber-700" />;
      case 'Award':
        return <Award className="w-5 h-5 text-amber-700" />;
      default:
        return <Target className="w-5 h-5 text-amber-700" />;
    }
  };

  return (
    <div className="bg-slate-50 py-6 sm:py-10 text-slate-800">
      {/* Page Header */}
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 mb-6">
        <div className="border-b border-slate-200 pb-4">
          <span className="text-xs uppercase tracking-widest font-bold text-amber-700">
            ध्येय व कृती आराखडा
          </span>
          <h1 className="font-serifDevanagari text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#0b1e36] mt-1">
            महासंघाची उद्दिष्टे, प्रलंबित मागण्या व कृती आराखडा
          </h1>
          <p className="text-sm sm:text-base text-slate-700 mt-2 max-w-3xl leading-relaxed">
            केंद्रप्रमुख व विस्तार अधिकारी संवर्गाच्या न्याय्य मागण्यांची शासन दरबारी तडजोड न करता पूर्तता करणे आणि प्राथमिक शैक्षणिक प्रशासनाला अधिक सक्षम बनवणे.
          </p>
        </div>
      </div>

      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 space-y-8">
        {/* Section 1: Major Demands Tracking Cards */}
        <section>
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-700" />
              <h2 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
                प्रमुख प्रलंबित मागण्या व शासन पाठपुरावा
              </h2>
            </div>
            <span className="text-xs text-slate-600 font-medium">
              एकूण: <strong className="font-mono text-[#0b1e36]">{CORE_DEMANDS.length}</strong> प्रमुख मागण्या
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CORE_DEMANDS.map((demand, idx) => (
              <div
                key={idx}
                className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs hover:border-amber-500 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-mono font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200">
                      मागणी #{idx + 1}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      {demand.status}
                    </span>
                  </div>

                  <h3 className="font-serifDevanagari text-base sm:text-lg font-bold text-[#0b1e36] leading-snug">
                    {demand.title}
                  </h3>

                  <p className="text-sm text-slate-700 mt-2 leading-relaxed">
                    {demand.desc}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <span>संवर्ग: केंद्रप्रमुख व विस्तार अधिकारी</span>
                  <span className="text-amber-700 font-semibold">सतत पाठपुरावा सुरू</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 2: Action Plan (कृती आराखडा) */}
        <section className="bg-white p-5 sm:p-7 rounded-2xl border border-slate-200 shadow-xs">
          <div className="mb-5 pb-3 border-b border-slate-100">
            <span className="text-xs uppercase tracking-widest font-bold text-amber-700">
              टप्प्याटप्प्याने वाटचाल
            </span>
            <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
              महासंघाचा वार्षिक कृती आराखडा
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ACTION_PLAN.map((plan, idx) => (
              <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-mono font-bold text-amber-800 block mb-1">
                    टप्पा #{plan.step}
                  </span>
                  <h4 className="font-serifDevanagari text-base font-bold text-[#0b1e36] mb-2">
                    {plan.phase}
                  </h4>
                  <p className="text-sm text-slate-700 leading-relaxed mb-3">
                    {plan.desc}
                  </p>
                </div>

                <div className="pt-2.5 border-t border-slate-200 flex flex-wrap gap-1">
                  {plan.badges.map((b, bIdx) => (
                    <span key={bIdx} className="text-xs bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded font-medium">
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Member Benefits (सदस्यत्वाचे फायदे) */}
        <section>
          <div className="mb-5 pb-3 border-b border-slate-200">
            <span className="text-xs uppercase tracking-widest font-bold text-amber-700">
              सभासदांना लाभ
            </span>
            <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
              महासंघ सदस्यांना मिळणारे हक्क व संरक्षण
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MEMBER_BENEFITS.map((benefit, idx) => (
              <div
                key={idx}
                className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs hover:border-amber-500 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center mb-2.5">
                  {getBenefitIcon(benefit.icon)}
                </div>
                <h4 className="font-serifDevanagari text-base font-bold text-[#0b1e36] mb-1.5">
                  {benefit.title}
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {benefit.desc}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

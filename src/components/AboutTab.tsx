import React from 'react';
import {
  ShieldCheck,
  Award,
  BookOpen,
  Building2,
  MapPin,
  Phone,
  Mail,
  ArrowRight,
  UserCheck,
  CheckCircle,
  Target,
  Clock,
  Scale,
  GraduationCap,
  Users,
  Megaphone,
  FileText
} from 'lucide-react';
import {
  ORG_DETAILS,
  CORE_PRINCIPLES,
  CORE_DEMANDS,
  ACTION_PLAN,
  MEMBER_BENEFITS
} from '../data/mahasanghData';
import { toEnglishDigits } from '../utils/formatters';

interface AboutTabProps {
  setCurrentTab: (tab: string) => void;
}

export const AboutTab: React.FC<AboutTabProps> = ({ setCurrentTab }) => {
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
          <span className="text-xs sm:text-sm uppercase tracking-widest font-bold text-amber-700">
            अधिकृत ओळख, ध्येय व वैधानिक स्वरूप
          </span>
          <h1 className="font-serifDevanagari text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#0b1e36] mt-1">
            आमच्याबद्दल — महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ
          </h1>
          <p className="text-base text-slate-700 mt-2 max-w-3xl leading-relaxed">
            {ORG_DETAILS.tagline} — राज्यातील प्राथमिक शिक्षण विभागातील केंद्रप्रमुख आणि विस्तार अधिकाऱ्यांना सक्षम, संघटित आणि सन्मानित करणारे अधिकृत राज्यस्तरीय व्यासपीठ.
          </p>
        </div>
      </div>

      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 space-y-8 sm:space-y-10">
        {/* ========================================================= */}
        {/* भाग १: आमच्याबद्दल (संघटना परिचय, अध्यक्ष संदेश व तत्त्वे) */}
        {/* ========================================================= */}

        {/* Section 1: Legal Registration & Mandate Card */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 shadow-xs">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-7 space-y-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-md text-xs sm:text-sm font-bold">
                <ShieldCheck className="w-4 h-4 text-amber-700" />
                <span>नोंदणीकृत श्रमिक संघ · नोंदणी क्रमांक: {ORG_DETAILS.registrationNo}</span>
              </div>

              <h2 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36] leading-tight">
                शिक्षणाच्या मुळाशी काम करणाऱ्या अधिकाऱ्यांचा कायदेशीर व अधिकृत आवाज
              </h2>

              <p className="text-base text-slate-700 leading-relaxed">
                महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ ही राज्यातील सर्व प्राथमिक शिक्षण विभागांतर्गत कार्यरत असलेल्या केंद्रप्रमुख, वरिष्ठ केंद्रप्रमुख आणि विस्तार अधिकाऱ्यांची एकजूट घडवून आणण्यासाठी स्थापन झालेली अधिकृत व शासन नोंदणीकृत श्रमिक संघटना आहे.
              </p>

              <p className="text-base text-slate-700 leading-relaxed">
                गुणवत्तापूर्ण शिक्षण, न्याय्य हक्कांचे संरक्षण, पारदर्शक प्रशासन आणि सदस्यांच्या व्यावसायिक स्वाभिमानाचे जतन करणे हे महासंघाचे प्रमुख उद्दिष्ट आहे. शिक्षण क्षेत्रातील धोरणनिर्मितीत केंद्रप्रमुखांचा अनुभव व सहभाग अत्यंत महत्त्वाचा मानला जावा यासाठी महासंघ सतत प्रयत्नशील आहे.
              </p>
            </div>

            <div className="lg:col-span-5 bg-[#0b1e36] text-white p-5 sm:p-7 rounded-xl border border-slate-700 space-y-3 shadow-md">
              <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-amber-300 pb-2 border-b border-slate-700">
                महासंघाची मुख्य वैधानिक ध्येये
              </h3>
              <ul className="space-y-3 text-base text-slate-200">
                <li className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-amber-400 shrink-0 mt-1" />
                  <span>केंद्रप्रमुख व विस्तार अधिकाऱ्यांचे प्रलंबित सेवाविषयक प्रश्न सोडवणे.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-amber-400 shrink-0 mt-1" />
                  <span>वेतन विसंगती दूर करून योग्य वेतनश्रेणी व पदोन्नती साध्य करणे.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-amber-400 shrink-0 mt-1" />
                  <span>डिजिटल व तंत्रस्नेही प्रशासनासाठी प्रशिक्षण कार्यशाळा आयोजित करणे.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-amber-400 shrink-0 mt-1" />
                  <span>लोकशाही मूल्यांचा आदर करत एकसंध व पारदर्शक संघटना चालवणे.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 2: Founder President Message & Authentic Vision */}
        <section className="bg-gradient-to-r from-[#0b1e36] via-[#102a4c] to-[#0b1e36] text-white rounded-2xl p-5 sm:p-8 shadow-lg border-t-4 border-amber-500">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <div className="md:col-span-4 text-center md:text-left space-y-3">
              <div className="inline-block p-1 rounded-full border-4 border-amber-500 bg-white shadow-md">
                <img
                  src="/president.jpg"
                  alt={ORG_DETAILS.founderPresident.name}
                  className="w-32 h-32 sm:w-36 sm:h-36 object-cover object-center rounded-full"
                />
              </div>
              <div>
                <span className="text-amber-400 text-xs sm:text-sm font-semibold uppercase tracking-wider block">
                  {ORG_DETAILS.founderPresident.role}
                </span>
                <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-white mt-0.5">
                  {ORG_DETAILS.founderPresident.name}
                </h3>
                <p className="text-sm text-slate-300 font-mono mt-0.5">
                  {ORG_DETAILS.founderPresident.education}
                </p>
              </div>
            </div>

            <div className="md:col-span-8 space-y-3">
              <span className="text-xs sm:text-sm uppercase tracking-widest font-bold text-amber-400">
                अध्यक्षीय विचार व संदेश
              </span>
              <h2 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-white leading-snug">
                "संघटन हीच आपली शक्ती आणि शैक्षणिक गुणवत्ता हीच आपली ओळख."
              </h2>
              <p className="text-base text-slate-200 leading-relaxed">
                महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाची स्थापना ही केवळ एका संवर्गाचे प्रश्न मांडण्यासाठी नसून संपूर्ण प्राथमिक शिक्षण व्यवस्थेचा कणा असलेल्या अधिकाऱ्यांना त्यांचे योग्य स्थान, सन्मान आणि स्वाभिमान मिळवून देण्यासाठी झालेली आहे.
              </p>
              <p className="text-base text-slate-200 leading-relaxed">
                राज्यातील 34 जिल्ह्यांतील प्रत्येक केंद्रप्रमुख आणि विस्तार अधिकाऱ्याने या महासंघाशी जोडले जावे, आपली एकजूट शासन दरबारी दाखवून द्यावी आणि आपल्या न्याय्य हक्कांसाठी एकसंध राहावे, हेच माझे मनःपूर्वक आवाहन आहे.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Cadres We Represent */}
        <section className="bg-white p-5 sm:p-7 rounded-2xl border border-slate-200 shadow-xs">
          <div className="mb-5 pb-3 border-b border-slate-100">
            <span className="text-xs sm:text-sm uppercase tracking-widest font-bold text-amber-700">
              संवर्ग व कार्यक्षेत्र
            </span>
            <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
              महासंघ कोणत्या अधिकाऱ्यांचे प्रतिनिधित्व करतो?
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200">
              <h4 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#0b1e36] mb-2">
                1. केंद्रप्रमुख
              </h4>
              <p className="text-base text-slate-700 leading-relaxed">
                प्राथमिक शिक्षण क्षेत्रातील प्रत्यक्ष शाळांचे नियंत्रण, अध्यापन गुणवत्ता, विद्यार्थी मूल्यमापन आणि प्रशासकीय समन्वय साधणारे मुख्य अधिकारी.
              </p>
            </div>

            <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200">
              <h4 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#0b1e36] mb-2">
                2. विस्तार अधिकारी
              </h4>
              <p className="text-base text-slate-700 leading-relaxed">
                तालुका व पंचायत समिती स्तरावरील शैक्षणिक योजनांची अंमलबजावणी, शाळा तपासणी आणि प्रशासकीय नियंत्रण सांभाळणारे वर्ग-3 अधिकारी.
              </p>
            </div>

            <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200">
              <h4 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#0b1e36] mb-2">
                3. शिक्षण प्रशासकीय संवर्ग
              </h4>
              <p className="text-base text-slate-700 leading-relaxed">
                शिक्षण विभागातील पर्यवेक्षकीय यंत्रणा सक्षम करण्यासाठी कार्यरत सर्व ज्येष्ठ व अनुभवी अधिकारी.
              </p>
            </div>
          </div>
        </section>

        {/* Section 4: 4 Core Organizational Principles */}
        <section>
          <div className="mb-5 pb-3 border-b border-slate-200">
            <span className="text-xs sm:text-sm uppercase tracking-widest font-bold text-amber-700">
              कार्यपद्धती
            </span>
            <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
              महासंघाची 4 मूलभूत तत्त्वे
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CORE_PRINCIPLES.map((principle, index) => (
              <div
                key={index}
                className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs hover:border-amber-500 transition-all"
              >
                <span className="text-xs sm:text-sm font-mono font-bold text-amber-700 block mb-1">
                  तत्त्व #{index + 1}
                </span>
                <h4 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#0b1e36] mb-2">
                  {principle.title}
                </h4>
                <p className="text-base text-slate-700 leading-relaxed">
                  {principle.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ========================================================= */}
        {/* भाग २: उद्दिष्टे, प्रलंबित मागण्या व कार्य (कृती आराखडा)    */}
        {/* ========================================================= */}
        <div className="pt-6 border-t-2 border-amber-500/60">
          <div className="mb-6">
            <span className="text-xs sm:text-sm uppercase tracking-widest font-bold text-amber-700">
              ध्येय, उद्दिष्टे व कार्यप्रणाली
            </span>
            <h2 className="font-serifDevanagari text-xl sm:text-2xl font-extrabold text-[#0b1e36] mt-1">
              महासंघाची उद्दिष्टे, प्रलंबित मागण्या व कृती आराखडा
            </h2>
            <p className="text-base text-slate-700 mt-2 max-w-3xl leading-relaxed">
              केंद्रप्रमुख व विस्तार अधिकारी संवर्गाच्या न्याय्य मागण्यांची शासन दरबारी तडजोड न करता पूर्तता करणे आणि प्राथमिक शैक्षणिक प्रशासनाला अधिक सक्षम बनवणे.
            </p>
          </div>
        </div>

        {/* Section 5: Major Demands Tracking Cards */}
        <section>
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-700" />
              <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36]">
                प्रमुख प्रलंबित मागण्या व शासन पाठपुरावा
              </h3>
            </div>
            <span className="text-xs sm:text-sm text-slate-600 font-medium">
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
                    <span className="text-xs sm:text-sm font-mono font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200">
                      मागणी #{idx + 1}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      {demand.status}
                    </span>
                  </div>

                  <h4 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#0b1e36] leading-snug">
                    {demand.title}
                  </h4>

                  <p className="text-base text-slate-700 mt-2 leading-relaxed">
                    {demand.desc}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs sm:text-sm text-slate-600">
                  <span>संवर्ग: केंद्रप्रमुख व विस्तार अधिकारी</span>
                  <span className="text-amber-700 font-semibold">सतत पाठपुरावा सुरू</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 6: Action Plan (वार्षिक कृती आराखडा) */}
        <section className="bg-white p-5 sm:p-7 rounded-2xl border border-slate-200 shadow-xs">
          <div className="mb-5 pb-3 border-b border-slate-100">
            <span className="text-xs sm:text-sm uppercase tracking-widest font-bold text-amber-700">
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
                  <span className="text-xs sm:text-sm font-mono font-bold text-amber-800 block mb-1">
                    टप्पा #{plan.step}
                  </span>
                  <h4 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#0b1e36] mb-2">
                    {plan.phase}
                  </h4>
                  <p className="text-base text-slate-700 leading-relaxed mb-3">
                    {plan.desc}
                  </p>
                </div>

                <div className="pt-2.5 border-t border-slate-200 flex flex-wrap gap-1.5">
                  {plan.badges.map((b, bIdx) => (
                    <span key={bIdx} className="text-xs sm:text-sm bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded font-medium">
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 7: Member Benefits (सदस्यत्वाचे फायदे व संरक्षण) */}
        <section>
          <div className="mb-5 pb-3 border-b border-slate-200">
            <span className="text-xs sm:text-sm uppercase tracking-widest font-bold text-amber-700">
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
                <h4 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#0b1e36] mb-1.5">
                  {benefit.title}
                </h4>
                <p className="text-base text-slate-700 leading-relaxed">
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

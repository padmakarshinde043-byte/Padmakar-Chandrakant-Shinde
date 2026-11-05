import React from 'react';
import { ShieldCheck, Award, BookOpen, Building2, MapPin, Phone, Mail, ArrowRight, UserCheck } from 'lucide-react';
import { ORG_DETAILS, CORE_PRINCIPLES, MAHARASHTRA_DISTRICTS } from '../data/mahasanghData';

interface AboutTabProps {
  setCurrentTab: (tab: string) => void;
}

export const AboutTab: React.FC<AboutTabProps> = ({ setCurrentTab }) => {
  return (
    <div className="bg-[#fbf8f2] py-10 md:py-16">
      {/* Page Header */}
      <div className="max-w-[1160px] mx-auto px-4 mb-12">
        <div className="border-b border-[#e7ded1] pb-6">
          <p className="text-xs uppercase tracking-widest font-bold text-[#df6b16] mb-1">
            आमच्याबद्दल
          </p>
          <h1 className="font-serifDevanagari text-3xl sm:text-4xl font-bold text-[#09243f]">
            महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ
          </h1>
          <p className="text-base text-[#607184] mt-2 max-w-3xl">
            {ORG_DETAILS.tagline} — राज्यातील प्राथमिक शिक्षण विभागातील केंद्रप्रमुख आणि विस्तार अधिकाऱ्यांना सक्षम, संघटित आणि सन्मानित करणारे अधिकृत राज्यस्तरीय व्यासपीठ.
          </p>
        </div>
      </div>

      <div className="max-w-[1160px] mx-auto px-4 space-y-16">
        {/* Section 1: Vision & Mission Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-white p-6 sm:p-10 rounded-xl border border-[#e7ded1] shadow-xs">
          <div className="lg:col-span-7 space-y-4">
            <span className="inline-block bg-[#fff0df] text-[#df6b16] font-bold text-xs px-3 py-1 rounded-full">
              स्थापना व ध्येय
            </span>
            <h2 className="font-serifDevanagari text-2xl sm:text-3xl font-bold text-[#09243f]">
              शिक्षणाच्या मुळाशी काम करणाऱ्या अधिकाऱ्यांचा सशक्त आवाज
            </h2>
            <p className="text-sm sm:text-base text-[#536477] leading-relaxed">
              महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ ही राज्यातील सर्व प्राथमिक शिक्षण विभागांतर्गत कार्यरत असलेल्या केंद्रप्रमुख, वरिष्ठ केंद्रप्रमुख आणि विस्तार अधिकाऱ्यांची एकजूट घडवून आणण्यासाठी स्थापन झालेली अधिकृत व नोंदणीकृत श्रमिक संघटना आहे.
            </p>
            <p className="text-sm sm:text-base text-[#536477] leading-relaxed">
              गुणवत्तापूर्ण शिक्षण, न्याय्य हक्कांचे संरक्षण, पारदर्शक प्रशासन आणि सदस्यांच्या व्यावसायिक स्वाभिमानाचे जतन करणे हे महासंघाचे प्रमुख उद्दिष्ट आहे. शिक्षण क्षेत्रातील धोरणनिर्मितीत केंद्रप्रमुखांचा अनुभव व सहभाग अत्यंत महत्त्वाचा मानला जावा यासाठी महासंघ सतत प्रयत्नशील आहे.
            </p>
          </div>
          <div className="lg:col-span-5 bg-[#09243f] text-white p-6 sm:p-8 rounded-lg border border-[#17366d] space-y-4">
            <h3 className="font-serifDevanagari text-xl font-bold text-[#f8d39b] pb-2 border-b border-[#29435a]">
              महासंघाची मुख्य ध्येयधोरणे
            </h3>
            <ul className="space-y-3 text-xs sm:text-sm text-[#dbe8f1]">
              <li className="flex items-start gap-2">
                <span className="text-[#efb24b] font-bold">✓</span>
                <span>केंद्रप्रमुख व विस्तार अधिकाऱ्यांचे प्रलंबित सेवाविषयक प्रश्न सोडवणे.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#efb24b] font-bold">✓</span>
                <span>वेतन विसंगती दूर करून योग्य वेतनश्रेणी व पदोन्नती साध्य करणे.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#efb24b] font-bold">✓</span>
                <span>डिजिटल व तंत्रस्नेही प्रशासनासाठी प्रशिक्षण कार्यशाळा आयोजित करणे.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#efb24b] font-bold">✓</span>
                <span>लोकशाही मूल्यांचा आदर करत एकसंध व पारदर्शक संघटना चालवणे.</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Section 2: Founder President Profile & Message */}
        <section className="bg-gradient-to-br from-[#09243f] to-[#0c2f4a] text-white rounded-xl p-6 sm:p-10 shadow-lg border-t-4 border-[#df6b16]">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-4 text-center md:text-left space-y-3">
              <div className="inline-block p-1 rounded-full border-4 border-[#efb24b] bg-white shadow-md">
                <img
                  src="/heding.jpg"
                  alt={ORG_DETAILS.founderPresident.name}
                  className="w-32 h-32 sm:w-40 sm:h-40 object-cover object-left rounded-full"
                />
              </div>
              <div>
                <span className="block text-xs uppercase tracking-widest text-[#f8d39b] font-bold">
                  {ORG_DETAILS.founderPresident.role}
                </span>
                <h3 className="font-serifDevanagari text-2xl font-bold text-white mt-1">
                  {ORG_DETAILS.founderPresident.name}
                </h3>
                <p className="text-xs text-[#a7bac4] mt-1 font-medium">
                  {ORG_DETAILS.founderPresident.education}
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 text-xs bg-[#102a43] px-3 py-1.5 rounded-full border border-[#23425f] text-[#f8d39b]">
                  <Phone className="w-3 h-3 text-[#efb24b]" />
                  मो. {ORG_DETAILS.founderPresident.phone}
                </div>
              </div>
            </div>

            <div className="md:col-span-8 bg-[#071a2e]/70 p-6 sm:p-8 rounded-lg border border-[#23425f] relative">
              <span className="text-4xl text-[#df6b16] font-serif leading-none select-none absolute top-3 left-4 opacity-50">
                “
              </span>
              <div className="relative z-10 space-y-3 pl-4">
                <h4 className="text-sm font-bold uppercase tracking-wider text-[#efb24b]">
                  अध्यक्षांचे मनोगत व संदेश
                </h4>
                <p className="text-sm sm:text-base text-[#e5edf1] leading-relaxed italic">
                  "{ORG_DETAILS.founderPresident.message}"
                </p>
                <p className="text-xs sm:text-sm text-[#b0c2cb] leading-relaxed">
                  "सर्व सहकाऱ्यांचा त्याग, समर्पण आणि निस्वार्थ सेवेमुळे ही संघटना अल्पावधीत संपूर्ण महाराष्ट्रात विश्वासाचे नाव बनली आहे. आपण सर्वांनी एकत्र येऊन आपला अधिकार व आत्मसन्मान मिळवला पाहिजे."
                </p>
                <div className="pt-2 text-right">
                  <span className="text-xs font-bold text-[#f8c47b]">
                    — {ORG_DETAILS.founderPresident.name}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: The 4 Pillars */}
        <section>
          <div className="text-center max-w-xl mx-auto mb-10">
            <span className="text-xs uppercase tracking-widest font-bold text-[#df6b16]">
              मूल्ये व कार्यपद्धती
            </span>
            <h2 className="font-serifDevanagari text-2xl sm:text-3xl font-bold text-[#09243f] mt-1">
              महासंघाचे चार भक्कम स्तंभ
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {CORE_PRINCIPLES.map((item) => (
              <div
                key={item.num}
                className="bg-white p-6 rounded-lg border border-[#e7ded1] shadow-xs hover:border-[#df6b16] transition-all"
              >
                <div className="w-10 h-10 rounded-md bg-[#fff0df] text-[#df6b16] font-bold flex items-center justify-center mb-4 text-sm font-mono">
                  {item.num}
                </div>
                <h3 className="font-serifDevanagari text-xl font-bold text-[#09243f] mb-2">
                  {item.title}
                </h3>
                <p className="text-xs sm:text-sm text-[#607184] leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 4: Legal & Registration Information Table */}
        <section className="bg-white rounded-xl border border-[#e7ded1] p-6 sm:p-8 shadow-xs">
          <div className="flex items-center gap-2 mb-6 pb-3 border-b border-[#e7ded1]">
            <ShieldCheck className="w-6 h-6 text-[#df6b16]" />
            <h2 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#09243f]">
              नोंदणी व कायदेशीर अधिकृत माहिती
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="p-3 bg-[#fbf8f2] rounded border border-[#e7ded1]/80">
              <span className="text-xs font-semibold text-[#607184] block mb-1">
                संघटनेचे अधिकृत नाव
              </span>
              <strong className="text-[#09243f] font-serifDevanagari text-base">
                {ORG_DETAILS.name}
              </strong>
            </div>

            <div className="p-3 bg-[#fbf8f2] rounded border border-[#e7ded1]/80">
              <span className="text-xs font-semibold text-[#607184] block mb-1">
                नोंदणी क्रमांक व स्वरूप
              </span>
              <strong className="text-[#df6b16] text-base">
                {ORG_DETAILS.registrationNo}
              </strong>
            </div>

            <div className="p-3 bg-[#fbf8f2] rounded border border-[#e7ded1]/80">
              <span className="text-xs font-semibold text-[#607184] block mb-1">
                मुख्यालय व नोंदणीकृत कार्यालय
              </span>
              <span className="text-[#102a43] font-medium flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[#df6b16] shrink-0" />
                {ORG_DETAILS.officeAddress}
              </span>
            </div>

            <div className="p-3 bg-[#fbf8f2] rounded border border-[#e7ded1]/80">
              <span className="text-xs font-semibold text-[#607184] block mb-1">
                संपर्क दूरध्वनी व ई-मेल
              </span>
              <div className="text-[#102a43] font-medium space-y-1">
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-[#df6b16]" />
                  {ORG_DETAILS.phonePrimary} / {ORG_DETAILS.phonePhonePe}
                </div>
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[#df6b16]" />
                  {ORG_DETAILS.email}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: Geographical Scope (34 Districts) */}
        <section className="bg-[#f0e9de] p-6 sm:p-8 rounded-xl border border-[#e7ded1]">
          <div className="max-w-2xl mb-6">
            <span className="text-xs uppercase tracking-widest font-bold text-[#df6b16]">
              कार्यक्षेत्र व विस्तार
            </span>
            <h2 className="font-serifDevanagari text-2xl font-bold text-[#09243f] mt-1">
              महाराष्ट्रातील ३४ जिल्ह्यांमध्ये सक्रिय जाळे
            </h2>
            <p className="text-xs sm:text-sm text-[#607184] mt-1">
              प्रत्येक जिल्हा व तालुक्यात महासंघाचे पदाधिकारी व प्रतिनिधी सदस्यांच्या मदतीसाठी सज्ज आहेत.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {MAHARASHTRA_DISTRICTS.map((dist) => (
              <span
                key={dist}
                className="bg-white text-[#102a43] text-xs font-semibold px-3 py-1.5 rounded-md border border-[#e7ded1] shadow-xs hover:border-[#df6b16] hover:text-[#df6b16] transition-colors"
              >
                {dist}
              </span>
            ))}
          </div>
        </section>

        {/* Section 6: Join CTA */}
        <div className="bg-[#df6b16] text-white p-8 rounded-xl text-center space-y-4 shadow-md">
          <h3 className="font-serifDevanagari text-2xl sm:text-3xl font-bold">
            आपणही या चळवळीत सहभागी व्हा!
          </h3>
          <p className="max-w-xl mx-auto text-sm sm:text-base text-white/90">
            महाराष्ट्र राज्यातील प्रत्येक केंद्रप्रमुख आणि विस्तार अधिकाऱ्याने आपल्या हक्कासाठी व शैक्षणिक सन्मानासाठी महासंघाशी जोडले पाहिजे.
          </p>
          <div className="pt-2 flex justify-center gap-4 flex-wrap">
            <button
              onClick={() => {
                setCurrentTab('membership');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="bg-white text-[#09243f] hover:bg-slate-50 font-bold px-6 py-3 rounded text-sm transition-colors shadow flex items-center gap-2"
            >
              <UserCheck className="w-4 h-4 text-[#df6b16]" />
              सदस्यत्व अर्ज भरा
            </button>
            <button
              onClick={() => {
                setCurrentTab('leadership');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="border-2 border-white text-white hover:bg-white/10 font-bold px-5 py-3 rounded text-sm transition-colors flex items-center gap-1.5"
            >
              नेतृत्व पहा <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { ShieldCheck, Lock, Copyright, Mail, ExternalLink, AlertCircle } from 'lucide-react';

export const PrivacyPolicyTab: React.FC = () => {
  return (
    <div className="max-w-[1040px] mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8 animate-fadeIn">
      {/* Title Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-800 shrink-0">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <span className="text-xs uppercase tracking-widest font-bold text-amber-700">
              अधिकृत धोरण व कायदेशीर माहिती
            </span>
            <h1 className="font-serifDevanagari text-2xl sm:text-3xl font-extrabold text-[#0b1e36]">
              Privacy & Copyright Policy
            </h1>
          </div>
        </div>
        <p className="text-xs sm:text-sm text-slate-500 font-medium pt-2 border-t border-slate-100">
          शेवटचे अद्यतन: 19 नोव्हेंबर 2026
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6 text-slate-700 text-sm sm:text-base leading-relaxed">
        <p className="font-medium">
          महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ (<a href="https://mahasangh.in" className="text-amber-700 underline font-semibold">https://mahasangh.in</a>) या अधिकृत पोर्टल आणि मोबाईल ॲपवर आपले स्वागत आहे. आपल्या वैयक्तिक माहितीच्या सुरक्षिततेचा आणि डिजिटल साहित्याच्या अधिकारांचा आम्ही पूर्ण आदर करतो.
        </p>

        {/* Part 1: Privacy Policy */}
        <div className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2.5 text-[#0b1e36]">
            <Lock className="w-5 h-5 text-amber-700 shrink-0" />
            <h2 className="font-serifDevanagari text-lg sm:text-xl font-bold">
              भाग 1: गोपनीयता धोरण (Privacy Policy)
            </h2>
          </div>

          <div className="space-y-3 pl-2 sm:pl-4">
            <div className="space-y-1">
              <h3 className="font-bold text-[#0b1e36] text-sm sm:text-base">1. आम्ही कोणती माहिती संकलित करतो?</h3>
              <p className="text-slate-600">
                महासंघाचे अधिकृत सदस्यत्व नोंदणी (Membership Registration) करताना आम्ही सदस्यांचे नाव, पदनाम, शाळा किंवा कार्यालय, जिल्हा, तालुका, मोबाईल क्रमांक आणि ईमेल आयडी ही माहिती संकलित करतो.
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="font-bold text-[#0b1e36] text-sm sm:text-base">2. माहितीचा वापर कशासाठी केला जातो?</h3>
              <ul className="list-disc list-inside space-y-1 text-slate-600 pl-2">
                <li>सदस्यांची अधिकृत नोंदणी पूर्ण करण्यासाठी आणि डिजिटल ओळखपत्र (ID Card) तयार करण्यासाठी.</li>
                <li>शासन निर्णय (GR), महत्त्वाचे परिपत्रके, बैठका आणि महासंघाच्या बातम्या सदस्यांपर्यंत पोहोचवण्यासाठी.</li>
                <li>संघटनत्मक कामकाज आणि प्रशासकीय संवादासाठी.</li>
              </ul>
            </div>

            <div className="space-y-1">
              <h3 className="font-bold text-[#0b1e36] text-sm sm:text-base">3. माहितीची सुरक्षा आणि गोपनीयता</h3>
              <p className="text-slate-600">
                सदस्यांची वैयक्तिक माहिती पूर्णपणे सुरक्षित ठेवली जाते. आम्ही कोणत्याही बाह्य संस्थेला, जाहिरातदारांना किंवा त्रयस्थ पक्षाला (Third Party) सदस्यांचा डेटा विकत नाही किंवा शेअर करत नाही.
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="font-bold text-[#0b1e36] text-sm sm:text-base">4. माहिती अद्ययावत करणे किंवा हटवणे</h3>
              <p className="text-slate-600">
                जर तुम्हाला तुमच्या प्रोफाईलमधील माहितीमध्ये बदल करायचा असेल किंवा तुमची नोंदणी रद्द करून डेटा काढून टाकायचा असेल, तर तुम्ही आमच्या अधिकृत ईमेलवर संपर्क साधू शकता.
              </p>
            </div>
          </div>
        </div>

        {/* Part 2: Copyright Policy */}
        <div className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2.5 text-[#0b1e36]">
            <Copyright className="w-5 h-5 text-amber-700 shrink-0" />
            <h2 className="font-serifDevanagari text-lg sm:text-xl font-bold">
              भाग 2: कॉपीराइट धोरण (Copyright Policy)
            </h2>
          </div>

          <p className="text-slate-600">
            या संकेतस्थळावरील सर्व मजकूर, लोगो, परिपत्रके, छायाचित्रे आणि डिजिटल साहित्य हे 'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ' यांच्या मालकीचे असून ते कॉपीराइट कायद्यानुसार संरक्षित आहे.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
              <span className="font-bold text-[#0b1e36] block text-xs uppercase tracking-wider text-amber-800">● वापराची मर्यादा</span>
              <p className="text-xs sm:text-sm text-slate-600">
                या संकेतस्थळावरील माहिती केवळ केंद्रप्रमुख, अधिकारी, शिक्षक आणि शैक्षणिक संदर्भासाठी माहितीच्या उद्देशाने वापरता येईल.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
              <span className="font-bold text-[#0b1e36] block text-xs uppercase tracking-wider text-amber-800">● पुनर्वापर मनाई</span>
              <p className="text-xs sm:text-sm text-slate-600">
                महासंघाच्या पूर्वपरवानगीशिवाय या संकेतस्थळावरील कोणताही मजकूर, लोगो किंवा डेटा व्यावसायिक कारणांसाठी कॉपी करणे, विकृत करणे अथवा पुनरुत्पादित करण्यास सक्त मनाई आहे.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
              <span className="font-bold text-[#0b1e36] block text-xs uppercase tracking-wider text-amber-800">● अधिकृतता</span>
              <p className="text-xs sm:text-sm text-slate-600">
                संकेतस्थळावर प्रसिद्ध करण्यात आलेली परिपत्रके व सूचना संबंधित शासकीय विभागाच्या मूळ आदेशांशी सुसंगत असतील; कोणत्याही कायदेशीर बाबींसाठी मूळ शासकीय राजपत्राचा/परिपत्रकाचा आधार घ्यावा.
              </p>
            </div>
          </div>
        </div>

        {/* Part 3: Non-Government Disclaimer & Official Sources (Google Play Compliance) */}
        <div className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2.5 text-[#0b1e36]">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0" />
            <h2 className="font-serifDevanagari text-lg sm:text-xl font-bold">
              भाग 3: अस्वीकरण व शासकीय माहितीचे स्त्रोत (Disclaimer &amp; Sources of Government Information)
            </h2>
          </div>

          <div className="bg-amber-50/70 border border-amber-300 rounded-xl p-4 sm:p-5 space-y-3 text-slate-800 text-xs sm:text-sm leading-relaxed">
            <p>
              <strong>शासकीय संलग्नता नसल्याचे स्पष्ट अस्वीकरण:</strong> हे ॲप व संकेतस्थळ (<strong>mahasangh.in</strong>) कोणत्याही सरकारी संस्थेचे, मंत्रालयाचे, शिक्षण विभागाचे किंवा महाराष्ट्र शासनाचे अधिकृत ॲप नाही आणि आम्ही कोणत्याही सरकारी संस्थेचे प्रतिनिधित्व करत नाही. हे केवळ <strong>महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ</strong> (श्रमिक संघ नोंदणी क्र. महा/एनएसके/एन/2427) या नोंदणीकृत कर्मचारी संघटनेचे सदस्यांच्या माहिती, संवाद आणि संदर्भासाठी तयार केलेले स्वतंत्र व्यासपीठ आहे.
            </p>
            <p className="text-slate-700">
              <strong>Non-Government Affiliation Disclaimer (English):</strong> This application and website do <strong>NOT</strong> represent any government entity and are not affiliated with, authorized by, or endorsed by the Government of Maharashtra or any government department. This is an independent platform of the registered employees&apos; association &ldquo;Maharashtra State Federation of Centre Heads and Officers&rdquo; (Trade Union Reg. No. Maha/NSK/N/2427).
            </p>
            <div className="pt-2 border-t border-amber-200 space-y-1.5">
              <div className="font-bold text-[#0b1e36]">
                शासकीय परिपत्रके व GR माहितीचे अधिकृत मूळ स्त्रोत (Official Public Sources of Government Information):
              </div>
              <ul className="space-y-1.5 pl-1">
                <li>
                  <a
                    href="https://gr.maharashtra.gov.in"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[#193568] hover:text-amber-800 underline font-bold"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span>https://gr.maharashtra.gov.in — महाराष्ट्र शासन निर्णय (GR) व शालेय शिक्षण विभाग परिपत्रके अधिकृत पोर्टल</span>
                  </a>
                </li>
                <li>
                  <a
                    href="https://maharashtra.gov.in"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[#193568] hover:text-amber-800 underline font-bold"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span>https://maharashtra.gov.in — महाराष्ट्र शासन अधिकृत संकेतस्थळ (Government of Maharashtra)</span>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.sci.gov.in"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[#193568] hover:text-amber-800 underline font-bold"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span>https://www.sci.gov.in — सर्वोच्च न्यायालय (Supreme Court of India)</span>
                  </a>
                </li>
                <li>
                  <a
                    href="https://judgments.ecourts.gov.in"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[#193568] hover:text-amber-800 underline font-bold"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span>https://judgments.ecourts.gov.in — ई-कोर्ट्स उच्च न्यायालय निर्णय पोर्टल (High Court of Bombay &amp; High Courts, eCourts)</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Part 4: Contact Us */}
        <div className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2.5 text-[#0b1e36]">
            <Mail className="w-5 h-5 text-amber-700 shrink-0" />
            <h2 className="font-serifDevanagari text-lg sm:text-xl font-bold">
              भाग 4: संपर्क साधा (Contact Us)
            </h2>
          </div>

          <p className="text-slate-600">
            गोपनीयता किंवा कॉपीराइट धोरणाबाबत काही प्रश्न असल्यास खालील पत्त्यावर संपर्क साधावा:
          </p>

          <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 sm:p-5 text-slate-800 space-y-2 text-xs sm:text-sm font-semibold">
            <div className="flex items-center gap-2">
              <span className="text-amber-800 font-bold">संस्था:</span>
              <span>महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-amber-800 font-bold">नोंदणी क्र.:</span>
              <span>श्रमिक संघ - महा/एनएसके/एन/2427</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-amber-800 font-bold">कार्यालय:</span>
              <span>मालेगाव, जि. नाशिक (महाराष्ट्र)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-amber-800 font-bold">ईमेल:</span>
              <a href="mailto:Contact@mahasangh.in" className="text-amber-700 underline font-bold">Contact@mahasangh.in</a>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-amber-800 font-bold">वेबसाइट:</span>
              <a href="https://mahasangh.in" className="text-amber-700 underline font-bold">https://mahasangh.in</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

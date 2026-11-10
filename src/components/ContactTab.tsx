import React, { useState } from 'react';
import { MapPin, Phone, Mail, Clock, ShieldCheck, Send, CheckCircle2, MessageCircle, Globe } from 'lucide-react';
import { ORG_DETAILS, MAHARASHTRA_DISTRICTS } from '../data/mahasanghData';

interface ContactTabProps {
  onSaveContact?: (contact: {
    id: string;
    name: string;
    phone: string;
    email?: string;
    district?: string;
    subject?: string;
    message: string;
    createdAt: string;
  }) => void;
}

export const ContactTab: React.FC<ContactTabProps> = ({ onSaveContact }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [district, setDistrict] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim() || !phone.trim() || !message.trim()) {
      setFormError('कृपया नाव, मोबाईल नंबर आणि आपला संदेश आवश्यक भरा.');
      return;
    }

    if (onSaveContact) {
      onSaveContact({
        id: `contact-${Date.now()}`,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        district: district || undefined,
        subject: subject.trim() || undefined,
        message: message.trim(),
        createdAt: new Date().toISOString()
      });
    }

    setSubmitted(true);
    setName('');
    setPhone('');
    setEmail('');
    setDistrict('');
    setSubject('');
    setMessage('');
  };

  return (
    <div className="bg-slate-50 py-6 sm:py-10 text-slate-800">
      {/* Page Header */}
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 mb-6">
        <div className="border-b border-slate-200 pb-4">
          <span className="text-xs uppercase tracking-widest font-bold text-amber-700">
            थेट संवाद व मार्गदर्शन
          </span>
          <h1 className="font-serifDevanagari text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#0b1e36] mt-1">
            महासंघ संपर्क व तक्रार निवारण दालन
          </h1>
          <p className="text-sm sm:text-base text-slate-700 mt-2 max-w-2xl leading-relaxed">
            राज्यातील प्राथमिक शिक्षण विभागातील केंद्रप्रमुख व अधिकाऱ्यांच्या अडीअडचणी व मार्गदर्शनासाठी मुख्य कार्यालयाशी थेट संपर्क साधा.
          </p>
        </div>
      </div>

      <div className="max-w-[1240px] mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Official Administrative Headquarters Information */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-[#0b1e36] text-white p-5 sm:p-7 rounded-2xl border border-slate-800 shadow-lg space-y-4">
              <span className="text-xs uppercase tracking-widest font-bold text-amber-400">
                मध्यवर्ती प्रशासकीय कार्यालय
              </span>
              <h2 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-white leading-tight">
                महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ
              </h2>

              <div className="space-y-4 text-xs sm:text-sm text-slate-300 pt-2 border-t border-slate-700">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block text-sm mb-0.5">मुख्य कार्यालय पत्ता:</strong>
                    <span>{ORG_DETAILS.officeAddress}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="w-full min-w-0">
                    <strong className="text-white block text-sm mb-2 font-bold tracking-wide">
                      Grievance Redressal Committee :
                    </strong>
                    {/* तीन सदस्यांची एकाखाली एक रचना (मोबाईलवर सुटसुटीत, डेस्कटॉपवर ३ कॉलम) */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {/* 1. श्री. राजेंद्र खैरनार */}
                      <div className="p-2.5 rounded-xl bg-slate-800/95 border border-slate-700 hover:border-amber-400/60 transition-colors flex flex-col justify-between text-center shadow-xs">
                        <div>
                          <span className="text-white text-xs font-bold block" title="श्री. राजेंद्र खैरनार">
                            श्री. राजेंद्र खैरनार
                          </span>
                          <span className="text-[11px] text-amber-400 font-semibold block mt-0.5">
                            संस्थापक राज्याध्यक्ष
                          </span>
                        </div>
                        <a
                          href="tel:9860704098"
                          className="mt-2 inline-flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-amber-500/15 text-amber-300 hover:bg-amber-500 hover:text-[#0b1e36] font-mono text-xs font-bold transition-all"
                          title="कॉल करा"
                        >
                          <Phone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>9860704098</span>
                        </a>
                      </div>

                      {/* 2. श्री. निलेश पाटील */}
                      <div className="p-2.5 rounded-xl bg-slate-800/95 border border-slate-700 hover:border-amber-400/60 transition-colors flex flex-col justify-between text-center shadow-xs">
                        <div>
                          <span className="text-white text-xs font-bold block" title="श्री. निलेश पाटील">
                            श्री. निलेश पाटील
                          </span>
                          <span className="text-[11px] text-amber-400 font-semibold block mt-0.5">
                            राज्य पदाधिकारी
                          </span>
                        </div>
                        <a
                          href="tel:9421385165"
                          className="mt-2 inline-flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-amber-500/15 text-amber-300 hover:bg-amber-500 hover:text-[#0b1e36] font-mono text-xs font-bold transition-all"
                          title="कॉल करा"
                        >
                          <Phone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>9421385165</span>
                        </a>
                      </div>

                      {/* 3. श्री. नितीन शिंदे */}
                      <div className="p-2.5 rounded-xl bg-slate-800/95 border border-slate-700 hover:border-amber-400/60 transition-colors flex flex-col justify-between text-center shadow-xs">
                        <div>
                          <span className="text-white text-xs font-bold block" title="श्री. नितीन शिंदे">
                            श्री. नितीन शिंदे
                          </span>
                          <span className="text-[11px] text-amber-400 font-semibold block mt-0.5">
                            राज्य पदाधिकारी
                          </span>
                        </div>
                        <a
                          href="tel:9763099698"
                          className="mt-2 inline-flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-amber-500/15 text-amber-300 hover:bg-amber-500 hover:text-[#0b1e36] font-mono text-xs font-bold transition-all"
                          title="कॉल करा"
                        >
                          <Phone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>9763099698</span>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block text-sm mb-0.5">अधिकृत ई-मेल:</strong>
                    <a href={`mailto:${ORG_DETAILS.email}`} className="text-slate-200 hover:underline font-mono">
                      {ORG_DETAILS.email}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block text-sm mb-0.5">कार्यालयीन वेळ:</strong>
                    <span>सोमवार ते शनिवार (सकाळी 10:00 ते सायंकाळी 06:00)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick District Leadership Info */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <h3 className="font-serifDevanagari text-base font-bold text-[#0b1e36] mb-1.5">
                जिल्हास्तरीय संपर्क हवा आहे का?
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed mb-3">
                महाराष्ट्रातील सर्व 34 जिल्ह्यांचे अध्यक्ष व प्रतिनिधींचे अधिकृत संपर्क क्रमांक 'नेतृत्व' या टॅबवर उपलब्ध आहेत.
              </p>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>व्हॉट्सॲप समन्वय: {ORG_DETAILS.phonePrimary}</span>
              </div>
            </div>
          </div>

          {/* Right Column: Direct Message / Suggestion Form */}
          <div className="lg:col-span-7 bg-white p-5 sm:p-7 rounded-2xl border border-slate-200 shadow-xs">
            <h2 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36] mb-1.5">
              आपला संदेश किंवा प्रश्न पाठवा
            </h2>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              महासंघाच्या कामकाजाबाबत सूचना, सेवाविषयक अडचण किंवा विचारणा असल्यास खालील फॉर्म भरा. मुख्य कार्यालयाकडून लवकरच संपर्क केला जाईल.
            </p>

            {submitted ? (
              <div className="p-5 bg-emerald-50 border border-emerald-300 rounded-xl text-center space-y-3">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                <h3 className="font-serifDevanagari text-lg font-bold text-emerald-900">
                  आपला संदेश यशस्वीपणे पाठवण्यात आला आहे!
                </h3>
                <p className="text-sm text-emerald-800 leading-relaxed max-w-md mx-auto">
                  आपल्या संदेशाची नोंद घेण्यात आली असून महासंघ कार्यालयाकडून लवकरच आपल्याशी संपर्क साधला जाईल. धन्यवाद!
                </p>
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-lg mt-2 hover:bg-emerald-800 transition-colors"
                >
                  आणखी एक संदेश पाठवा
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                {formError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg font-medium text-xs">
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      आपले पूर्ण नाव <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="उदा. श्री. संतोष पाटील"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 text-xs sm:text-sm"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      मोबाईल नंबर <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      maxLength={10}
                      placeholder="10 अंकी मोबाईल"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 font-mono text-xs sm:text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      ई-मेल पत्ता (पर्यायी)
                    </label>
                    <input
                      type="email"
                      placeholder="example@gmail.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 font-mono text-xs sm:text-sm"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      आपला जिल्हा
                    </label>
                    <select
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 font-medium text-slate-700 text-xs sm:text-sm"
                    >
                      <option value="">जिल्हा निवडा (ऐच्छिक)</option>
                      {MAHARASHTRA_DISTRICTS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    विषय
                  </label>
                  <input
                    type="text"
                    placeholder="उदा. सदस्यत्व, पदोन्नती, किंवा तक्रार"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 text-xs sm:text-sm"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    आपला संदेश किंवा अडचण <span className="text-rose-600">*</span>
                  </label>
                  <textarea
                    required
                    rows={4}
                    placeholder="आपला सविस्तर संदेश येथे टाईप करा..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 resize-none text-xs sm:text-sm"
                  />
                </div>

                <button
                  type="submit"
                  className="bg-[#0b1e36] hover:bg-[#132f52] text-amber-300 font-bold px-6 py-2.5 rounded-lg text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md active:scale-98"
                >
                  <Send className="w-4 h-4 text-amber-400" />
                  <span>संदेश पाठवा</span>
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Website Information Manager (संकेतस्थळ माहिती व्यवस्थापक - संपर्क फॉर्म नंतर व फुटर च्या वर) */}
        <div className="mt-8 pt-6 border-t border-slate-200">
          <div className="bg-gradient-to-br from-[#07182c] via-[#0b1e36] to-[#0f2a4a] text-white rounded-2xl p-5 sm:p-7 border border-slate-800 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Left Column: Context & Official Notice */}
              <div className="lg:col-span-7 space-y-2.5">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/20 border border-amber-400/40 rounded-full text-amber-300 text-xs font-semibold">
                  <Globe className="w-3.5 h-3.5 text-amber-400" />
                  <span>Website Information Manager · संकेतस्थळ कक्ष</span>
                </div>

                <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-white tracking-tight">
                  संकेतस्थळ माहिती व्यवस्थापक
                </h3>

                <p className="text-sm text-slate-300 leading-relaxed font-normal">
                  संकेतस्थळावरील सामग्री, दुवे किंवा माहिती अद्ययावत किंवा अचूकतेबाबत काही सूचना अथवा तक्रारी असल्यास खालील तपशीलावर संपर्क साधावा.
                </p>
              </div>

              {/* Right Column: Manager Details Official Card */}
              <div className="lg:col-span-5">
                <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl p-4 sm:p-5 space-y-3 shadow-inner">
                  <div className="space-y-2 text-xs sm:text-sm">
                    <div className="flex items-start gap-2">
                      <span className="text-slate-400 font-semibold min-w-[70px]">नाव :</span>
                      <div>
                        <strong className="text-white font-bold text-sm sm:text-base block">
                          श्री. पदमाकर चंद्रकांत शिंदे
                        </strong>
                        <span className="text-amber-300 font-semibold text-xs sm:text-sm block mt-0.5 font-sans">
                          (केंद्रप्रमुख माजलगाव जिल्हा बीड)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-baseline gap-2">
                      <span className="text-slate-400 font-semibold min-w-[70px]">पद :</span>
                      <span className="text-amber-300 font-bold">संकेतस्थळ माहिती व्यवस्थापक</span>
                    </div>

                    <div className="flex items-baseline gap-2">
                      <span className="text-slate-400 font-semibold min-w-[70px]">विभाग :</span>
                      <span className="text-slate-200 font-medium">माहिती तंत्रज्ञान विभाग</span>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-white/10 flex items-center gap-2">
                    <span className="text-slate-400 text-xs sm:text-sm font-semibold">संपर्क क्रमांक :</span>
                    <a
                      href="tel:7219123699"
                      className="text-amber-300 hover:text-white font-mono font-bold text-sm sm:text-base tracking-wide"
                    >
                      7219123699
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

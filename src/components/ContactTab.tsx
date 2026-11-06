import React, { useState } from 'react';
import { MapPin, Phone, Mail, Clock, ShieldCheck, Send, CheckCircle2, MessageCircle } from 'lucide-react';
import { ORG_DETAILS, MAHARASHTRA_DISTRICTS, DISTRICT_PRESIDENTS } from '../data/mahasanghData';

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !message) {
      alert('कृपया आवश्यक माहिती भरा.');
      return;
    }
    if (onSaveContact) {
      onSaveContact({
        id: `contact-${Date.now()}`,
        name,
        phone,
        email: email || undefined,
        district: district || undefined,
        subject: subject || undefined,
        message,
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
    <div className="bg-[#fbf8f2] py-10 md:py-16">
      {/* Page Header */}
      <div className="max-w-[1160px] mx-auto px-4 mb-12">
        <div className="border-b border-[#e7ded1] pb-6">
          <p className="text-xs uppercase tracking-widest font-bold text-[#df6b16] mb-1">
            संपर्क माहिती
          </p>
          <h1 className="font-serifDevanagari text-3xl sm:text-4xl font-bold text-[#09243f]">
            महासंघाशी थेट संपर्क साधा
          </h1>
          <p className="text-base text-[#607184] mt-2 max-w-2xl">
            आपले प्रश्न, सूचना किंवा सदस्यत्वासाठी मुख्य कार्यालय अथवा आपल्या जिल्हा अध्यक्षांशी संपर्क साधा.
          </p>
        </div>
      </div>

      <div className="max-w-[1160px] mx-auto px-4 space-y-12">
        {/* Contact Info & Message Form Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Office Details */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-[#09243f] text-white p-6 sm:p-8 rounded-xl shadow-md border-t-4 border-[#df6b16] space-y-6">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-[#f8d39b]">
                  मुख्यालय
                </span>
                <h3 className="font-serifDevanagari text-2xl font-bold text-white mt-1">
                  कार्यालयाचा पत्ता
                </h3>
              </div>

              <div className="space-y-4 text-xs sm:text-sm text-[#dbe8f1]">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-[#efb24b] shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-white mb-0.5 font-serifDevanagari">
                      पत्ता:
                    </strong>
                    <p className="leading-relaxed">{ORG_DETAILS.officeAddress}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-[#efb24b] shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-white mb-0.5 font-serifDevanagari">
                      फोन / WhatsApp:
                    </strong>
                    <a
                      href={`tel:${ORG_DETAILS.phonePrimary}`}
                      className="hover:text-[#f8d39b] font-mono text-sm block"
                    >
                      {ORG_DETAILS.phonePrimary}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-[#efb24b] shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-white mb-0.5 font-serifDevanagari">
                      ई-मेल:
                    </strong>
                    <a
                      href={`mailto:${ORG_DETAILS.email}`}
                      className="hover:text-[#f8d39b] font-mono text-xs block"
                    >
                      {ORG_DETAILS.email}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-[#efb24b] shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-white mb-0.5 font-serifDevanagari">
                      कार्यालयीन वेळ:
                    </strong>
                    <p>{ORG_DETAILS.officeHours}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 pt-2 border-t border-[#29435a]">
                  <ShieldCheck className="w-5 h-5 text-[#efb24b] shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-white mb-0.5 font-serifDevanagari">
                      अधिकृत नोंदणी:
                    </strong>
                    <p className="text-[#f8d39b]">{ORG_DETAILS.registrationNo}</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <a
                  href={`tel:${ORG_DETAILS.phonePrimary}`}
                  className="bg-[#df6b16] hover:bg-[#c85c0e] text-white text-xs font-bold py-2.5 px-4 rounded text-center transition-colors shadow-sm"
                >
                  आत्ता फोन करा
                </a>
                <a
                  href={`https://wa.me/91${ORG_DETAILS.phonePrimary}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#25D366] hover:bg-[#1eb956] text-white text-xs font-bold py-2.5 px-4 rounded text-center transition-colors shadow-sm flex items-center justify-center gap-1.5"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp वर संपर्क
                </a>
              </div>
            </div>
          </div>

          {/* Right Column: Contact Message Form */}
          <div className="lg:col-span-7 bg-white p-6 sm:p-8 rounded-xl border border-[#e7ded1] shadow-xs">
            <h3 className="font-serifDevanagari text-2xl font-bold text-[#09243f] mb-2">
              आपला संदेश पाठवा
            </h3>
            <p className="text-xs text-[#607184] mb-6">
              आपला संदेश, प्रश्न अथवा मागणी खालील फॉर्मद्वारे नोंदवा. आमचे प्रतिनिधी लवकरच आपल्याशी संपर्क करतील.
            </p>

            {submitted ? (
              <div className="p-6 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-center space-y-3">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                <h4 className="font-serifDevanagari font-bold text-lg">
                  आपला संदेश यशस्वीपणे प्राप्त झाला आहे!
                </h4>
                <p className="text-xs text-emerald-700">
                  महासंघाच्या कार्यालयातून लवकरच आपल्या दिलेल्या फोन किंवा ई-मेलवर संपर्क साधला जाईल.
                </p>
                <button
                  onClick={() => setSubmitted(false)}
                  className="mt-2 text-xs font-bold bg-emerald-700 text-white px-4 py-2 rounded hover:bg-emerald-800"
                >
                  दुसरा संदेश पाठवा
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-[#102a43] block mb-1">
                      नाव <span className="text-[#df6b16]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="आपले संपूर्ण नाव"
                      className="w-full p-2.5 border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-[#102a43] block mb-1">
                      फोन नंबर <span className="text-[#df6b16]">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="10 अंकी मोबाईल नंबर"
                      className="w-full p-2.5 border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-[#102a43] block mb-1">
                      ई-मेल पत्ता
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="उदा. name@example.com"
                      className="w-full p-2.5 border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-[#102a43] block mb-1">
                      आपला जिल्हा
                    </label>
                    <select
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                    >
                      <option value="">आपला जिल्हा निवडा</option>
                      {MAHARASHTRA_DISTRICTS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-[#102a43] block mb-1">
                    विषय
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="उदा. सदस्यत्व माहिती / वेतन विसंगती / तक्रार निवारण"
                    className="w-full p-2.5 border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                  />
                </div>

                <div>
                  <label className="font-bold text-[#102a43] block mb-1">
                    संदेश <span className="text-[#df6b16]">*</span>
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="आपला सविस्तर संदेश येथे लिहा..."
                    className="w-full p-2.5 border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                  />
                </div>

                <button
                  type="submit"
                  className="bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold px-6 py-3 rounded-lg text-xs sm:text-sm transition-colors shadow-sm flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  संदेश पाठवा
                </button>
              </form>
            )}
          </div>
        </div>

        {/* District-wise Direct Contact Directory */}
        <div className="bg-white p-6 sm:p-8 rounded-xl border border-[#e7ded1] shadow-xs">
          <div className="mb-6 pb-2 border-b border-[#e7ded1]">
            <h3 className="font-serifDevanagari text-2xl font-bold text-[#09243f]">
              जिल्हानिहाय थेट संपर्क निर्देशिका (34 जिल्हे)
            </h3>
            <p className="text-xs text-[#607184] mt-1">
              आपल्या जिल्ह्यातील महासंघ अध्यक्षांशी थेट संपर्क साधा.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
            {DISTRICT_PRESIDENTS.map((item) => (
              <div
                key={item.region}
                className="p-3 rounded-lg border border-slate-200 bg-[#fbf8f2] hover:border-[#df6b16] transition-colors"
              >
                <strong className="block text-[#09243f] font-serifDevanagari text-sm">
                  {item.region}
                </strong>
                <span className="block text-[#607184] text-[11px] mt-0.5">
                  {item.name}
                </span>
                <a
                  href={`tel:${item.phone}`}
                  className="mt-2 inline-flex items-center gap-1 font-semibold text-[#df6b16] hover:underline"
                >
                  <Phone className="w-3 h-3" />
                  {item.phone}
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

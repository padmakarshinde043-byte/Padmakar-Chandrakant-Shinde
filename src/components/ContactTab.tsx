import React, { useState, useRef } from 'react';
import { MapPin, Phone, Send, CheckCircle2, Globe, Paperclip, X, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { ORG_DETAILS, MAHARASHTRA_DISTRICTS } from '../data/mahasanghData';
import { uploadCompressedPhotoToCloudinaryOrFallback } from '../utils/cloudinary';

const MAX_CONTACT_PHOTO_BYTES = 3 * 1024 * 1024; // 3 MB strict raw limit

interface ContactTabProps {
  onSaveContact?: (contact: {
    id: string;
    name: string;
    phone: string;
    email?: string;
    district?: string;
    subject?: string;
    message: string;
    photo?: string;
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
  const [photo, setPhoto] = useState('');
  const [photoName, setPhotoName] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState('');
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoError('कृपया फक्त फोटो फाईल (JPG, PNG, WEBP) निवडा.');
      if (photoInputRef.current) photoInputRef.current.value = '';
      return;
    }

    if (file.size > MAX_CONTACT_PHOTO_BYTES) {
      setPhotoError('कृपया 3 MB पेक्षा कमी आकाराचा फोटो जोडा');
      setPhoto('');
      setPhotoName('');
      if (photoInputRef.current) photoInputRef.current.value = '';
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const res = await uploadCompressedPhotoToCloudinaryOrFallback(file, 1000, 1000, 0.8);
      setPhoto(res.urlOrBase64);
      setPhotoName(`${file.name} (${res.sizeKb} KB)`);
    } catch (err: any) {
      setPhotoError(err?.message || 'फोटो जोडताना अडचण आली. कृपया दुसरा फोटो निवडा.');
      if (photoInputRef.current) photoInputRef.current.value = '';
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleClearPhoto = () => {
    setPhoto('');
    setPhotoName('');
    setPhotoError('');
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (
      !name.trim() ||
      !phone.trim() ||
      !email.trim() ||
      !district.trim() ||
      !subject.trim() ||
      !message.trim()
    ) {
      setFormError('कृपया नाव, मोबाईल नंबर, ई-मेल पत्ता, जिल्हा, विषय आणि आपला संदेश हे सर्व आवश्यक तपशील भरा.');
      return;
    }

    if (isUploadingPhoto) {
      setFormError('कृपया फोटो अपलोड पूर्ण होईपर्यंत थोडा वेळ थांबा.');
      return;
    }

    if (onSaveContact) {
      onSaveContact({
        id: `contact-${Date.now()}`,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        district: district.trim(),
        subject: subject.trim(),
        message: message.trim(),
        photo: photo || undefined,
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
    setPhoto('');
    setPhotoName('');
    setPhotoError('');
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  return (
    <div className="bg-slate-50 py-6 sm:py-10 text-slate-800">
      {/* Page Header */}
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 mb-6">
        <div className="border-b border-slate-200 pb-4">
          <span className="text-xs sm:text-sm uppercase tracking-widest font-bold text-amber-700">
            थेट संवाद व मार्गदर्शन
          </span>
          <h1 className="font-serifDevanagari text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#0b1e36] mt-1">
            महासंघ संपर्क व तक्रार निवारण दालन
          </h1>
          <p className="text-base text-slate-700 mt-2 max-w-2xl leading-relaxed">
            राज्यातील प्राथमिक शिक्षण विभागातील केंद्रप्रमुख व अधिकाऱ्यांच्या अडीअडचणी व मार्गदर्शनासाठी मुख्य कार्यालयाशी थेट संपर्क साधा.
          </p>
        </div>
      </div>

      <div className="max-w-[1240px] mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Official Administrative Headquarters Information */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-gradient-to-br from-[#152f59] via-[#193568] to-[#122b54] text-white p-5 sm:p-7 rounded-2xl border border-slate-700/80 shadow-lg space-y-4">
              <span className="text-xs sm:text-sm uppercase tracking-widest font-bold text-amber-400">
                मध्यवर्ती प्रशासकीय कार्यालय
              </span>
              <h2 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-white leading-tight">
                महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ
              </h2>

              <div className="space-y-4 text-sm sm:text-base text-slate-300 pt-2 border-t border-slate-700">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block text-sm sm:text-base mb-0.5">मुख्य कार्यालय पत्ता:</strong>
                    <span>{ORG_DETAILS.officeAddress}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <Phone className="w-5 h-5 text-amber-400 shrink-0" />
                    <strong className="text-amber-300 text-[15px] sm:text-lg font-black leading-snug">
                      तक्रार निवारण समिती:
                    </strong>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {ORG_DETAILS.directContacts.map((contact, idx) => (
                      <div
                        key={idx}
                        className="px-3.5 py-3 rounded-xl bg-[#10254a]/85 border border-white/15 hover:border-amber-400 transition-colors flex items-center justify-between gap-3 shadow-sm"
                      >
                        <div className="min-w-0">
                          <span className="text-white text-sm sm:text-base font-bold block leading-snug font-serifDevanagari">
                            {contact.name}
                          </span>
                          <span className="text-xs sm:text-sm text-amber-400 font-semibold block mt-0.5">
                            {contact.designation}
                          </span>
                        </div>
                        <a
                          href={`tel:${contact.phone}`}
                          className="shrink-0 inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-[#0d1f3d]/85 hover:bg-[#0d1f3d] text-amber-300 font-mono text-xs sm:text-sm font-bold border border-white/15 whitespace-nowrap transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>{contact.phone}</span>
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Direct Message / Suggestion Form */}
          <div className="lg:col-span-7 bg-white p-5 sm:p-7 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36] mb-1.5">
              आपला संदेश किंवा प्रश्न पाठवा
            </h2>
            <p className="text-base text-slate-600 mb-5 leading-relaxed">
              महासंघाच्या कामकाजाबाबत सूचना, सेवाविषयक अडचण किंवा विचारणा असल्यास खालील फॉर्म भरा. मुख्य कार्यालयाकडून लवकरच संपर्क केला जाईल.
            </p>

            {submitted ? (
              <div className="p-5 bg-emerald-50 border border-emerald-300 rounded-xl text-center space-y-3">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-emerald-900">
                  आपला संदेश यशस्वीपणे पाठवण्यात आला आहे!
                </h3>
                <p className="text-base text-emerald-800 leading-relaxed max-w-md mx-auto">
                  आपल्या संदेशाची नोंद घेण्यात आली असून महासंघ कार्यालयाकडून लवकरच आपल्याशी संपर्क साधला जाईल. धन्यवाद!
                </p>
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="bg-emerald-700 text-white font-bold text-sm px-4 py-2 rounded-lg mt-2 hover:bg-emerald-800 transition-colors"
                >
                  आणखी एक संदेश पाठवा
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 text-sm sm:text-base">
                {formError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg font-medium text-sm">
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
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 text-sm sm:text-base"
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
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 font-mono text-sm sm:text-base"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      ई-मेल पत्ता <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="example@gmail.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 font-mono text-sm sm:text-base"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      आपला जिल्हा <span className="text-rose-600">*</span>
                    </label>
                    <select
                      required
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 font-medium text-slate-700 text-sm sm:text-base"
                    >
                      <option value="">जिल्हा निवडा *</option>
                      {MAHARASHTRA_DISTRICTS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    विषय <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="उदा. सदस्यत्व, पदोन्नती, किंवा तक्रार"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 text-sm sm:text-base"
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
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 resize-none text-sm sm:text-base"
                  />
                </div>

                {/* Photo Attachment (Max 3 MB) */}
                <div>
                  <label className="font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <Paperclip className="w-4 h-4 text-amber-700" />
                    <span>फोटो जोडा (ऐच्छिक, कमाल 3 MB)</span>
                  </label>
                  <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoChange}
                        disabled={isUploadingPhoto}
                        className="w-full text-xs sm:text-sm text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs sm:file:text-sm file:font-bold file:bg-[#193568] file:text-amber-300 hover:file:bg-[#122b54] cursor-pointer"
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      निवेदन, कागदपत्र किंवा संबंधित फोटो (3 MB पेक्षा कमी आकाराचा) येथे जोडू शकता.
                    </p>

                    {isUploadingPhoto && (
                      <div className="flex items-center gap-2 text-xs font-bold text-[#193568] bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
                        <span>फोटो तयार होत आहे...</span>
                      </div>
                    )}

                    {photoError && (
                      <div className="p-2.5 bg-rose-50 border border-rose-300 text-rose-800 rounded-lg font-bold text-xs sm:text-sm">
                        {photoError}
                      </div>
                    )}

                    {photo && !isUploadingPhoto && (
                      <div className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-lg border border-emerald-300">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={photo}
                            alt="जोडलेला फोटो"
                            className="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1 text-xs font-bold text-emerald-700">
                              <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                              <span>फोटो जोडला गेला</span>
                            </div>
                            <p className="text-xs text-slate-500 truncate">{photoName || 'फोटो संलग्न'}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleClearPhoto}
                          className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg border border-rose-200 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>काढा</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isUploadingPhoto}
                  className="bg-[#193568] hover:bg-[#122b54] disabled:opacity-60 text-amber-300 font-bold px-6 py-2.5 rounded-lg text-sm sm:text-base flex items-center justify-center gap-2 transition-all shadow-md active:scale-98 cursor-pointer"
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
          <div className="bg-gradient-to-br from-[#152f59] via-[#193568] to-[#1c3b70] text-white rounded-2xl p-5 sm:p-7 border border-slate-700/80 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Left Column: Context & Official Notice */}
              <div className="lg:col-span-7 space-y-2.5">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/20 border border-amber-400/40 rounded-full text-amber-300 text-xs sm:text-sm font-semibold">
                  <Globe className="w-3.5 h-3.5 text-amber-400" />
                  <span>Website Information Manager · संकेतस्थळ कक्ष</span>
                </div>

                <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-white tracking-tight">
                  संकेतस्थळ माहिती व्यवस्थापक
                </h3>

                <p className="text-base text-slate-300 leading-relaxed font-normal">
                  संकेतस्थळावरील सामग्री, दुवे किंवा माहिती अद्ययावत किंवा अचूकतेबाबत काही सूचना अथवा तक्रारी असल्यास खालील तपशीलावर संपर्क साधावा.
                </p>
              </div>

              {/* Right Column: Manager Details Official Card */}
              <div className="lg:col-span-5">
                <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl p-4 sm:p-5 space-y-3 shadow-inner">
                  <div className="space-y-2 text-sm sm:text-base">
                    <div className="flex items-start gap-2">
                      <span className="text-slate-400 font-semibold min-w-[70px]">नाव :</span>
                      <div>
                        <strong className="text-white font-bold text-base sm:text-lg block">
                          श्री. पदमाकर चंद्रकांत शिंदे
                        </strong>
                        <span className="text-amber-300 font-semibold text-sm block mt-0.5 font-sans">
                          केंद्रप्रमुख माजलगाव बीड
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

                  <div className="pt-2.5 border-t border-white/10 flex items-center gap-2 flex-wrap">
                    <span className="text-slate-400 text-sm sm:text-base font-semibold">संपर्क ईमेल :</span>
                    <a
                      href="mailto:contact@mahasangh.in"
                      className="text-amber-300 hover:text-white font-mono font-bold text-base sm:text-lg tracking-wide break-all"
                    >
                      contact@mahasangh.in
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

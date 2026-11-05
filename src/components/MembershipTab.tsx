import React, { useState } from 'react';
import { UserCheck, ShieldCheck, CheckCircle2, AlertCircle, Phone, Printer, Download, Search } from 'lucide-react';
import { ORG_DETAILS, MAHARASHTRA_DISTRICTS, MembershipApplication } from '../data/mahasanghData';

interface MembershipTabProps {
  onAddApplication: (app: MembershipApplication) => void;
  applications: MembershipApplication[];
}

export const MembershipTab: React.FC<MembershipTabProps> = ({ onAddApplication, applications }) => {
  const [salutation, setSalutation] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [district, setDistrict] = useState('');
  const [familyMembers, setFamilyMembers] = useState('');
  const [hobby, setHobby] = useState('');
  const [education, setEducation] = useState('');
  const [professional, setProfessional] = useState('');
  const [aadhaarFile, setAadhaarFile] = useState<string>('');
  const [passportFile, setPassportFile] = useState<string>('');
  const [paymentScreenshot, setPaymentScreenshot] = useState<string>('');
  const [paymentRef, setPaymentRef] = useState<string>('');

  const [submittedApp, setSubmittedApp] = useState<MembershipApplication | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<MembershipApplication | null | 'not_found'>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!salutation || !fullName || !phone || !email || !address || !education) {
      alert('कृपया सर्व आवश्यक (*) माहिती भरा.');
      return;
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const newApp: MembershipApplication = {
      id: `app-${Date.now()}`,
      applicationNumber: `MS-2026-${randomSuffix}`,
      salutation,
      fullName,
      phone,
      email,
      address,
      district: district || 'नाशिक',
      familyMembers,
      hobby,
      education,
      professional,
      status: 'pending',
      createdAt: new Date().toISOString(),
      paymentRef: paymentRef || `UPI-${ORG_DETAILS.phonePhonePe}`
    };

    onAddApplication(newApp);
    setSubmittedApp(newApp);

    // reset form
    setFullName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setDistrict('');
    setFamilyMembers('');
    setHobby('');
    setEducation('');
    setProfessional('');
    setPaymentRef('');
    setAadhaarFile('');
    setPassportFile('');
    setPaymentScreenshot('');
  };

  const handleTrackStatus = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;

    const found = applications.find(
      (a) =>
        a.applicationNumber.toLowerCase() === query ||
        a.phone.includes(query) ||
        (a.memberNumber && a.memberNumber.toLowerCase() === query)
    );

    if (found) {
      setSearchResult(found);
    } else {
      setSearchResult('not_found');
    }
  };

  return (
    <div className="bg-[#f7f9fc] py-10 md:py-16">
      <div className="max-w-[1000px] mx-auto px-4">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-[#193568] to-[#2a4d8f] text-white rounded-2xl p-6 sm:p-10 mb-8 shadow-md">
          <div className="flex items-center gap-2 text-xs font-bold text-[#f8d39b] mb-2 uppercase tracking-wider">
            <UserCheck className="w-4 h-4 text-[#efb24b]" />
            महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ
          </div>
          <h1 className="font-serifDevanagari text-2xl sm:text-3xl md:text-4xl font-bold mb-3">
            नवीन सदस्यत्व नोंदणी अर्ज
          </h1>
          <p className="text-xs sm:text-sm text-slate-200 leading-relaxed max-w-2xl">
            संघटनेशी जोडण्यासाठी खालील माहिती अचूकपणे भरा. अर्जाची माहिती तपासल्यानंतर सदस्यत्व मंजुरी व अधिकृत ओळखपत्र / प्रमाणपत्र प्रदान केले जाईल.
          </p>
        </div>

        {/* Status Tracker Box */}
        <div className="bg-white p-5 rounded-xl border border-[#dbe3ef] mb-8 shadow-xs">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-serifDevanagari font-bold text-base text-[#193568]">
                अर्जाची स्थिती तपासा (Track Status)
              </h3>
              <p className="text-xs text-[#63708a]">
                आपला अर्ज क्रमांक किंवा मोबाईल नंबर टाकून मंजुरी तपासा.
              </p>
            </div>
            <form onSubmit={handleTrackStatus} className="flex gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="उदा. MS-2026-1001 किंवा फोन"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-xs border border-slate-300 rounded px-3 py-2 w-full sm:w-60 focus:outline-none focus:border-[#df6b16]"
              />
              <button
                type="submit"
                className="bg-[#193568] hover:bg-[#11254a] text-white text-xs font-bold px-4 py-2 rounded shrink-0 flex items-center gap-1"
              >
                <Search className="w-3.5 h-3.5" />
                तपासा
              </button>
            </form>
          </div>

          {searchResult && searchResult !== 'not_found' && (
            <div className="mt-4 p-4 bg-[#f0f7ff] border border-blue-200 rounded-lg text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#193568] text-sm">
                  {searchResult.salutation} {searchResult.fullName} ({searchResult.district})
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                    searchResult.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}
                >
                  {searchResult.status === 'approved' ? 'मंजूर (Approved)' : 'प्रलंबित (Pending)'}
                </span>
              </div>
              <div className="text-slate-600 flex flex-wrap gap-4">
                <span>अर्ज क्र: <strong>{searchResult.applicationNumber}</strong></span>
                <span>मोबाईल: {searchResult.phone}</span>
                {searchResult.memberNumber && (
                  <span className="text-[#df6b16] font-bold">
                    सदस्य क्रमांक: {searchResult.memberNumber}
                  </span>
                )}
              </div>
            </div>
          )}

          {searchResult === 'not_found' && (
            <div className="mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded">
              कोणताही अर्ज आढळला नाही. कृपया अचूक अर्ज क्रमांक किंवा १० अंकी मोबाईल नंबर टाका.
            </div>
          )}
        </div>

        {/* Success Confirmation Modal/Banner */}
        {submittedApp && (
          <div className="bg-[#ecfdf3] border-2 border-[#a7e5bd] text-[#14532d] rounded-xl p-6 mb-8 shadow-sm">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-serifDevanagari text-lg font-bold">
                  आपला सदस्यत्व अर्ज यशस्वीपणे नोंदवला गेला आहे!
                </h3>
                <p className="text-xs sm:text-sm">
                  आपला अर्ज क्रमांक: <strong className="text-base text-emerald-900 bg-white px-2 py-0.5 rounded border border-emerald-300">{submittedApp.applicationNumber}</strong>
                </p>
                <p className="text-xs text-emerald-800">
                  कृपया सदस्यत्व शुल्क ₹५०० चा पेमेंट स्क्रीनशॉट <strong>{ORG_DETAILS.phonePhonePe}</strong> या WhatsApp नंबरवर त्वरित पाठवा. पडताळणीनंतर आपल्या ई-मेल व मोबाईलवर अधिकृत सदस्य क्रमांक व प्रमाणपत्र पाठवले जाईल.
                </p>
                <div className="pt-2 flex gap-3">
                  <button
                    onClick={() => window.print()}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-4 py-2 rounded flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    अर्ज पावती प्रिंट करा
                  </button>
                  <button
                    onClick={() => setSubmittedApp(null)}
                    className="border border-emerald-600 text-emerald-900 text-xs font-semibold px-3 py-2 rounded hover:bg-emerald-100"
                  >
                    नवीन अर्ज भरा
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Application Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Personal Details */}
          <div className="bg-white rounded-xl border border-[#dbe3ef] p-6 shadow-xs space-y-4">
            <h2 className="font-serifDevanagari text-xl font-bold text-[#193568] pb-2 border-b border-[#dbe3ef]">
              १. वैयक्तिक माहिती (Personal Details)
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="font-bold text-[#172033] block mb-1">
                  पद / आदरार्थी (Salutation) <span className="text-[#df6b16]">*</span>
                </label>
                <select
                  value={salutation}
                  onChange={(e) => setSalutation(e.target.value)}
                  required
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                >
                  <option value="">निवडा</option>
                  <option value="श्री">श्री</option>
                  <option value="सौ">सौ</option>
                  <option value="श्रीमती">श्रीमती</option>
                  <option value="डॉ">डॉ</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-[#172033] block mb-1">
                  संपूर्ण नाव (प्रथम, मधले, आडनाव) <span className="text-[#df6b16]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="उदा. अमोल राजेश पाटील"
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                />
              </div>

              <div>
                <label className="font-bold text-[#172033] block mb-1">
                  WhatsApp मोबाईल नंबर <span className="text-[#df6b16]">*</span>
                </label>
                <input
                  type="tel"
                  required
                  pattern="[0-9]{10}"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="१० अंकी मोबाईल नंबर"
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                />
              </div>

              <div>
                <label className="font-bold text-[#172033] block mb-1">
                  ई-मेल पत्ता (Email) <span className="text-[#df6b16]">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="उदा. amol@example.com"
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                />
              </div>

              <div>
                <label className="font-bold text-[#172033] block mb-1">
                  जिल्हा निवडा <span className="text-[#df6b16]">*</span>
                </label>
                <select
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  required
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                >
                  <option value="">जिल्हा निवडा</option>
                  {MAHARASHTRA_DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-[#172033] block mb-1">
                  कुटुंबातील एकूण सदस्य
                </label>
                <input
                  type="number"
                  min="1"
                  value={familyMembers}
                  onChange={(e) => setFamilyMembers(e.target.value)}
                  placeholder="उदा. ४"
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-bold text-[#172033] block mb-1">
                  पूर्ण निवासी व कार्यालयीन पत्ता <span className="text-[#df6b16]">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="घर/फ्लॅट क्र., रस्ता, गाव/शहर, तालुका, जिल्हा व पिनकोड"
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-bold text-[#172033] block mb-1">
                  छंद / विशेष आवड
                </label>
                <input
                  type="text"
                  value={hobby}
                  onChange={(e) => setHobby(e.target.value)}
                  placeholder="उदा. वाचन, शैक्षणिक संशोधन, वृक्षारोपण, क्रीडा"
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Educational & Professional Qualifications */}
          <div className="bg-white rounded-xl border border-[#dbe3ef] p-6 shadow-xs space-y-4">
            <h2 className="font-serifDevanagari text-xl font-bold text-[#193568] pb-2 border-b border-[#dbe3ef]">
              २. शैक्षणिक व व्यावसायिक माहिती (Education & Profession)
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="font-bold text-[#172033] block mb-1">
                  शैक्षणिक पात्रता <span className="text-[#df6b16]">*</span>
                </label>
                <select
                  value={education}
                  onChange={(e) => setEducation(e.target.value)}
                  required
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                >
                  <option value="">निवडा</option>
                  <option value="बारावी (12th)">बारावी (12th)</option>
                  <option value="पदविका (Diploma)">पदविका (Diploma)</option>
                  <option value="पदवी (B.A. / B.Sc. / B.Com.)">पदवी (B.A. / B.Sc. / B.Com.)</option>
                  <option value="पदव्युत्तर पदवी (M.A. / M.Sc. / M.Com.)">पदव्युत्तर पदवी (M.A. / M.Sc. / M.Com.)</option>
                  <option value="एम.फिल. (M.Phil.)">एम.फिल. (M.Phil.)</option>
                  <option value="पीएच.डी. (Ph.D.)">पीएच.डी. (Ph.D.)</option>
                  <option value="इतर शिक्षण क्षेत्रातील पात्रता">इतर शिक्षण क्षेत्रातील पात्रता</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-[#172033] block mb-1">
                  व्यावसायिक पात्रता <span className="text-[#df6b16]">*</span>
                </label>
                <select
                  value={professional}
                  onChange={(e) => setProfessional(e.target.value)}
                  required
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                >
                  <option value="">निवडा</option>
                  <option value="डी.एड. (D.Ed.)">डी.एड. (D.Ed.)</option>
                  <option value="बी.एड. (B.Ed.)">बी.एड. (B.Ed.)</option>
                  <option value="एम.एड. (M.Ed.)">एम.एड. (M.Ed.)</option>
                  <option value="नेट / सेट (NET / SET)">नेट / सेट (NET / SET)</option>
                  <option value="डी.एस.एम. (DSM)">डी.एस.एम. (DSM)</option>
                  <option value="इतर व्यावसायिक पात्रता">इतर व्यावसायिक पात्रता</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Fee & Documents Verification */}
          <div className="bg-white rounded-xl border border-[#dbe3ef] p-6 shadow-xs space-y-4">
            <h2 className="font-serifDevanagari text-xl font-bold text-[#193568] pb-2 border-b border-[#dbe3ef]">
              ३. कागदपत्रे व सदस्यत्व शुल्क
            </h2>

            <div className="bg-[#fff7f0] border-l-4 border-[#df6b16] p-4 rounded-r-lg text-xs leading-relaxed text-[#102a43] space-y-1">
              <p className="font-bold text-sm text-[#09243f]">
                सदस्यत्व शुल्क: {ORG_DETAILS.membershipFee}
              </p>
              <p>
                फोन पे (PhonePe) नंबर: <strong className="text-base text-[#df6b16]">{ORG_DETAILS.phonePhonePe}</strong>
              </p>
              <p className="text-[#607184]">
                पेमेंट केल्यानंतर मिळालेला युटीआर / ट्रान्झॅक्शन आयडी खाली नमूद करा किंवा स्क्रीनशॉट वरील WhatsApp नंबरवर पाठवा.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
              <div>
                <label className="font-bold text-[#172033] block mb-1">
                  पेमेंट UTR / Transaction No. (वैकल्पिक)
                </label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="उदा. UPI-9527254652-XXXXXX"
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                />
              </div>

              <div>
                <label className="font-bold text-[#172033] block mb-1">
                  आधार कार्ड प्रत / क्रमांक <span className="text-[#df6b16]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={aadhaarFile}
                  onChange={(e) => setAadhaarFile(e.target.value)}
                  placeholder="आधार कार्ड क्रमांक किंवा अपलोड संदर्भ"
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                />
              </div>

              <div>
                <label className="font-bold text-[#172033] block mb-1">
                  पासपोर्ट फोटो (Photo Document)
                </label>
                <input
                  type="text"
                  value={passportFile}
                  onChange={(e) => setPassportFile(e.target.value)}
                  placeholder="फोटो फाईल नाव किंवा संदर्भ"
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                />
              </div>

              <div>
                <label className="font-bold text-[#172033] block mb-1">
                  शुल्क पावती / स्क्रीनशॉट संदर्भ
                </label>
                <input
                  type="text"
                  value={paymentScreenshot}
                  onChange={(e) => setPaymentScreenshot(e.target.value)}
                  placeholder="पेमेंट स्क्रीनशॉट दिनांक / WhatsApp पुष्टी"
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                />
              </div>
            </div>
          </div>

          {/* Submit Button Section */}
          <div className="bg-white rounded-xl border border-[#dbe3ef] p-6 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-[#63708a] max-w-md">
              फॉर्म सबमिट केल्यानंतर आपली माहिती पडताळली जाईल. सदस्यत्व मंजुरीनंतर आपल्या ई-मेल व व्हॉट्सॲपवर अधिकृत सदस्य क्रमांक व प्रमाणपत्र पाठवले जाईल.
            </div>
            <button
              type="submit"
              className="w-full sm:w-auto bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold px-8 py-3.5 rounded-lg text-sm transition-all shadow-md flex items-center justify-center gap-2"
            >
              <UserCheck className="w-4 h-4" />
              अर्ज सबमिट करा (Submit Application)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

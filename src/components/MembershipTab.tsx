import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  UserCheck, ShieldCheck, CheckCircle2, AlertCircle, Phone, Printer, Download, Search,
  Upload, Image as ImageIcon, Check, Sparkles, Award
} from 'lucide-react';
import {
  ORG_DETAILS,
  MAHARASHTRA_DISTRICTS,
  MembershipApplication
} from '../data/mahasanghData';
import { toEnglishDigits } from '../utils/formatters';
import { fetchOfficials } from '../services/rkFirebaseService';
import { OfficialMember, DISTRICT_TALUKAS_MAP } from '../data/rkMaharashtraData';
import { generateMembershipCertificatePdf } from '../services/rkPdfGenerator';

interface MembershipTabProps {
  onAddApplication: (app: MembershipApplication) => void;
  applications: MembershipApplication[];
  onTrackRemote?: (query: string) => Promise<MembershipApplication | null>;
}

export const MembershipTab: React.FC<MembershipTabProps> = ({
  onAddApplication,
  applications,
  onTrackRemote,
}) => {
  // Form fields
  const [salutation, setSalutation] = useState('श्री');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [district, setDistrict] = useState('');
  const [taluka, setTaluka] = useState('');
  const [familyMembers, setFamilyMembers] = useState('');
  const [hobby, setHobby] = useState('');
  const [education, setEducation] = useState('');
  const [professional, setProfessional] = useState('');
  
  // Passport photo (<200KB base64) with live preview
  const [photoDataUrl, setPhotoDataUrl] = useState<string>('');
  const [photoSizeKb, setPhotoSizeKb] = useState<number>(0);
  const [photoError, setPhotoError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Question: आपण सध्या संघटनेचे पदाधिकारी आहात काय?
  const [isOfficial, setIsOfficial] = useState<boolean>(false);
  const [officialDistrict, setOfficialDistrict] = useState<string>('');
  const [officialPost, setOfficialPost] = useState<string>('');
  const [officialTaluka, setOfficialTaluka] = useState<string>('');
  const [selectedOfficialId, setSelectedOfficialId] = useState<string>('');

  // Loaded officials from RTDB for auto-fill
  const [allOfficials, setAllOfficials] = useState<OfficialMember[]>([]);

  // Submission & Tracking
  const [submittedApp, setSubmittedApp] = useState<MembershipApplication | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<MembershipApplication | null | 'not_found'>(null);
  const [isDownloadingCert, setIsDownloadingCert] = useState<boolean>(false);
  const [formAlert, setFormAlert] = useState<string>('');
  const [declarationAccepted, setDeclarationAccepted] = useState<boolean>(false);

  // Load officials from RTDB for automatic matching
  useEffect(() => {
    fetchOfficials(false)
      .then((data) => setAllOfficials(data))
      .catch((err) => console.warn('Could not load officials for membership form:', err));
  }, []);

  // Officials belonging to selected officialDistrict
  const matchingDistrictOfficials = useMemo(() => {
    if (!officialDistrict) return [];
    return allOfficials.filter((o) => {
      if (o.district === officialDistrict) return true;
      if (
        (officialDistrict === 'अहिल्यानगर' && o.district === 'अहमदनगर') ||
        (officialDistrict === 'अहमदनगर' && o.district === 'अहिल्यानगर')
      ) {
        return true;
      }
      return false;
    });
  }, [allOfficials, officialDistrict]);

  // Standard Post options
  const OFFICIAL_POST_OPTIONS = [
    'जिल्हाध्यक्ष',
    'जिल्हा कार्याध्यक्ष',
    'जिल्हा सरचिटणीस',
    'जिल्हा उपाध्यक्ष',
    'जिल्हा सहचिटणीस',
    'जिल्हा प्रसिद्धीप्रमुख',
    'जिल्हा कोषाध्यक्ष',
    'जिल्हा सल्लागार',
    'जिल्हा संघटक',
    'तालुका अध्यक्ष',
    'तालुका सरचिटणीस',
    'तालुका उपाध्यक्ष',
    'तालुका प्रतिनिधी',
    'राज्य कार्यकारिणी सदस्य',
    'विभागीय समन्वयक'
  ];

  // Helper to detect any English alphabets in text inputs
  const hasEnglishLetters = (val: string): boolean => {
    return /[a-zA-Z]/.test(val || '');
  };

  // Handle Photo selection with client-side compression to ensure <200KB
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoError('कृपया वैध फोटो फाईल (JPG किंवा PNG) निवडा.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Compress via canvas to standard passport aspect (approx 400x500 max)
        const canvas = document.createElement('canvas');
        const maxDim = 600;
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);

        // Quality compression: target < 200KB
        let quality = 0.85;
        let compressed = canvas.toDataURL('image/jpeg', quality);
        let sizeKb = Math.round((compressed.length * 3) / 4 / 1024);

        while (sizeKb > 195 && quality > 0.3) {
          quality -= 0.1;
          compressed = canvas.toDataURL('image/jpeg', quality);
          sizeKb = Math.round((compressed.length * 3) / 4 / 1024);
        }

        if (sizeKb > 200) {
          setPhotoError(`फोटोचा आकार ${sizeKb}KB आहे. कृपया 200KB पेक्षा लहान फोटो वापरा.`);
          return;
        }

        setPhotoDataUrl(compressed);
        setPhotoSizeKb(sizeKb);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // When an official is selected from the dropdown, auto-fill details
  const handleSelectOfficialFromList = (officialId: string) => {
    setSelectedOfficialId(officialId);
    if (!officialId) return;

    const matched = matchingDistrictOfficials.find((m) => m.id === officialId);
    if (matched) {
      if (matched.salutation) setSalutation(matched.salutation.replace('.', ''));
      const combinedName = [matched.firstName, matched.middleName, matched.lastName].filter(Boolean).join(' ');
      setFullName(combinedName);
      if (matched.mobile) setPhone(matched.mobile);
      if (matched.currentCadre) setProfessional(matched.currentCadre);
      if (matched.appointedPost) setOfficialPost(matched.appointedPost);
      if (matched.taluka) {
        setOfficialTaluka(matched.taluka);
        setTaluka(matched.taluka);
      }
      if (matched.district) {
        setDistrict(matched.district);
        setOfficialDistrict(matched.district);
      }
      if (matched.workingPlace) {
        setAddress(matched.workingPlace);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormAlert('');

    if (!salutation || !fullName.trim() || !phone.trim() || !email.trim() || !address.trim() || !education.trim() || !district) {
      setFormAlert('कृपया सर्व आवश्यक (*) माहिती अचूकपणे भरा.');
      return;
    }

    // Strict Marathi-only validation: No English letters allowed in text fields
    const invalidFields: string[] = [];
    if (hasEnglishLetters(fullName)) invalidFields.push('संपूर्ण नाव');
    if (hasEnglishLetters(address)) invalidFields.push('पत्ता / कार्यक्षेत्र');
    if (hasEnglishLetters(taluka)) invalidFields.push('तालुका');
    if (hasEnglishLetters(hobby)) invalidFields.push('छंद');

    if (invalidFields.length > 0) {
      setFormAlert(
        `सर्व माहिती मराठीत भरा! इंग्रजी अक्षरे स्वीकारली जाणार नाहीत. कृपया खालील रकान्यातील माहिती मराठी भाषेत भरा: ${invalidFields.join(', ')}.`
      );
      window.scrollTo({ top: 380, behavior: 'smooth' });
      return;
    }

    if (!photoDataUrl) {
      setFormAlert('कृपया आपला पासपोर्ट आकाराचा फोटो (200KB पर्यंत) अपलोड करा.');
      return;
    }

    if (!declarationAccepted) {
      setFormAlert('कृपया अर्ज सादर करण्यापूर्वी खालील घोषणापत्राचा टिक बॉक्स निवडून संमती द्या.');
      return;
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const newApp: MembershipApplication = {
      id: `app-${Date.now()}`,
      applicationNumber: `MS-2026-${randomSuffix}`,
      salutation,
      fullName: fullName.trim(),
      phone: toEnglishDigits(phone.trim()),
      email: email.trim(),
      address: address.trim(),
      district: district,
      familyMembers: toEnglishDigits(familyMembers.trim()),
      hobby: hobby.trim(),
      education,
      professional,
      status: 'pending',
      createdAt: new Date().toISOString(),
      photo: photoDataUrl,
      isOfficial,
      officialPost: isOfficial ? officialPost : undefined,
      officialDistrict: isOfficial ? officialDistrict : undefined,
      officialTaluka: isOfficial ? officialTaluka : undefined,
      paymentConfirmed: false,
    };

    onAddApplication(newApp);
    setSubmittedApp(newApp);

    // Reset Form
    setFullName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setDistrict('');
    setTaluka('');
    setFamilyMembers('');
    setHobby('');
    setEducation('');
    setProfessional('');
    setPhotoDataUrl('');
    setPhotoSizeKb(0);
    setIsOfficial(false);
    setOfficialDistrict('');
    setOfficialPost('');
    setOfficialTaluka('');
    setSelectedOfficialId('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleTrackStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = toEnglishDigits(searchQuery.trim().toLowerCase());
    if (!query) return;

    // 1. Check local cache first
    const foundLocally = applications.find(
      (a) =>
        a.applicationNumber.toLowerCase() === query ||
        a.phone.replace(/\D/g, '').includes(query.replace(/\D/g, '')) ||
        (a.memberNumber && a.memberNumber.toLowerCase() === query)
    );

    if (foundLocally) {
      setSearchResult(foundLocally);
      return;
    }

    // 2. Query Firestore targeted
    if (onTrackRemote) {
      const foundRemote = await onTrackRemote(toEnglishDigits(searchQuery.trim()));
      if (foundRemote) {
        setSearchResult(foundRemote);
        return;
      }
    }

    setSearchResult('not_found');
  };

  // Direct High-Definition PDF Download for Approved Certificate
  const handleDownloadApprovedCertificate = async (app: MembershipApplication) => {
    setIsDownloadingCert(true);
    try {
      await generateMembershipCertificatePdf(app);
    } catch (err: any) {
      alert('प्रमाणपत्र डाऊनलोड करताना त्रुटी आली: ' + (err.message || 'Error'));
    } finally {
      setIsDownloadingCert(false);
    }
  };

  return (
    <div className="bg-[#f7f9fc] py-8 sm:py-12 md:py-16">
      <div className="max-w-[1000px] mx-auto px-4">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-[#193568] via-[#1f3f78] to-[#12284c] text-white rounded-2xl p-6 sm:p-10 mb-8 shadow-md border-t-4 border-[#efb24b]">
          <div className="flex items-center gap-2 text-xs font-bold text-[#f8d39b] mb-2 uppercase tracking-wider">
            <UserCheck className="w-4 h-4 text-[#efb24b]" />
            महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ
          </div>
          <h1 className="font-serifDevanagari text-2xl sm:text-3xl md:text-4xl font-bold mb-3">
            नवीन सदस्यत्व नोंदणी अर्ज
          </h1>
          <p className="text-xs sm:text-sm text-slate-200 leading-relaxed max-w-2xl">
            संघटनेशी जोडण्यासाठी खालील माहिती अचूकपणे भरा. अर्जाची पडताळणी झाल्यानंतर अधिकृत सदस्य क्रमांक व आकर्षक डिजिटल आजीवन सभासद प्रमाणपत्र थेट प्रदान केले जाईल.
          </p>
        </div>

        {/* Status Tracker Box */}
        <div className="bg-white p-5 rounded-xl border border-[#dbe3ef] mb-8 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-serifDevanagari font-bold text-base text-[#193568] flex items-center gap-1.5">
                <Search className="w-4 h-4 text-[#df6b16]" />
                अर्जाची स्थिती तपासा (Track Application Status)
              </h3>
              <p className="text-xs text-[#63708a] mt-0.5">
                आपला 10 अंकी मोबाईल नंबर किंवा अर्ज क्रमांक टाकून तात्काळ मंजुरी तपासा व प्रमाणपत्र मिळवा.
              </p>
            </div>
            <form onSubmit={handleTrackStatus} className="flex gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="उदा. 9876543210 किंवा MS-2026-XXXX"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-xs border border-slate-300 rounded px-3 py-2 w-full sm:w-64 focus:outline-none focus:border-[#df6b16]"
              />
              <button
                type="submit"
                className="bg-[#193568] hover:bg-[#11254a] text-white text-xs font-bold px-4 py-2 rounded shrink-0 flex items-center gap-1.5 transition-colors"
              >
                <Search className="w-3.5 h-3.5" />
                तपासा
              </button>
            </form>
          </div>

          {/* Search Result Card */}
          {searchResult && searchResult !== 'not_found' && (
            <div className={`mt-4 p-5 rounded-xl border ${
              searchResult.status === 'approved'
                ? 'bg-gradient-to-r from-[#f0fdf4] via-[#f7fee7] to-[#ecfdf5] border-emerald-300 shadow-sm'
                : 'bg-amber-50/70 border-amber-200'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-emerald-200/60">
                <div className="flex items-center gap-3">
                  {searchResult.photo ? (
                    <img
                      src={searchResult.photo}
                      alt={searchResult.fullName}
                      className="w-12 h-14 object-cover rounded border-2 border-emerald-600 shadow-xs shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-14 bg-slate-200 rounded border border-slate-300 flex items-center justify-center text-slate-400 shrink-0">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}
                  <div>
                    <span className="font-serifDevanagari font-bold text-[#193568] text-base sm:text-lg block">
                      {searchResult.salutation} {searchResult.fullName}
                    </span>
                    <span className="text-xs text-slate-600">
                      कार्यक्षेत्र / जिल्हा: <strong>{searchResult.district}</strong>
                      {searchResult.professional && ` | पद: ${searchResult.professional}`}
                    </span>
                  </div>
                </div>

                <span
                  className={`px-3 py-1 rounded-full font-bold text-xs uppercase self-start sm:self-auto ${
                    searchResult.status === 'approved'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}
                >
                  {searchResult.status === 'approved' ? '✓ मंजूर (Approved)' : 'प्रलंबित (Pending)'}
                </span>
              </div>

              {/* Approved View with Direct PDF Download */}
              {searchResult.status === 'approved' ? (
                <div className="mt-4 pt-1 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800 text-xs sm:text-sm font-bold">
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>अभिनंदन! आपले सदस्यत्व यशस्वीरित्या मंजूर करण्यात आले आहे.</span>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-emerald-200 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-slate-500 block text-[11px]">अधिकृत आजीवन सदस्य क्रमांक:</span>
                      <strong className="text-base text-[#193568] font-serif tracking-wider">
                        {searchResult.memberNumber || 'MS/2026/MAHA/0001'}
                      </strong>
                    </div>

                    {searchResult.isOfficial && searchResult.officialPost && (
                      <div>
                        <span className="text-slate-500 block text-[11px]">संघटनेतील पद:</span>
                        <strong className="text-xs text-[#df6b16] font-bold">
                          ⭐ {searchResult.officialPost} {searchResult.officialTaluka ? `(${searchResult.officialTaluka})` : ''}
                        </strong>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDownloadApprovedCertificate(searchResult)}
                      disabled={isDownloadingCert}
                      className="bg-gradient-to-r from-[#df6b16] to-[#b34f07] hover:from-[#c85c0e] hover:to-[#964004] text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50"
                    >
                      <Download className={`w-4 h-4 ${isDownloadingCert ? 'animate-spin' : ''}`} />
                      {isDownloadingCert ? 'PDF तयार होत आहे...' : 'प्रमाणपत्र डाऊनलोड करा (PDF)'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-xs text-slate-600">
                  आपला अर्ज प्राप्त झाला असून पडताळणीची प्रक्रिया सुरू आहे. कृपया आपल्या जिल्हाध्यक्षांकडे ₹500 शुल्क पाठवल्याची खात्री करा.
                </div>
              )}
            </div>
          )}

          {searchResult === 'not_found' && (
            <div className="mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              कोणताही अर्ज आढळला नाही. कृपया अचूक 10 अंकी मोबाईल नंबर किंवा अर्ज क्रमांक प्रविष्ट करा.
            </div>
          )}
        </div>

        {/* Success Banner After Submission */}
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
                <p className="text-xs text-emerald-800 leading-relaxed">
                  "महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ" या संघटनेसाठी आजीवन सदस्यत्व फी 100 रुपये व वार्षिक वर्गणी 120 रुपये खालील अधिकृत खात्यावर जमा करावी:<br />
                  <strong className="text-emerald-950 font-mono">KENDRAPRAMUKH V ADHIKARI MAHASNAGH | Ac. No. 60597730518 | IFSC: MAHB0002075</strong>
                </p>
                <div className="pt-2 flex gap-3">
                  <button
                    onClick={() => setSubmittedApp(null)}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-4 py-2 rounded flex items-center gap-1.5"
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
          {formAlert && (
            <div className="p-3 bg-rose-50 border border-rose-300 text-rose-800 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {formAlert}
            </div>
          )}

          {/* Section 1: Question - आपण सध्या संघटनेचे पदाधिकारी आहात काय? */}
          <div className="bg-white rounded-xl border border-[#dbe3ef] p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#dbe3ef]">
              <h2 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#193568] flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#df6b16]" />
                1. संघटना पदाधिकारी माहिती (Organizational Designation)
              </h2>
            </div>

            <div className="bg-[#f0f7ff] p-4 rounded-lg border border-blue-200 text-xs space-y-3">
              <label className="font-bold text-[#193568] block text-sm">
                आपण सध्या संघटनेचे पदाधिकारी आहात काय? <span className="text-[#df6b16]">*</span>
              </label>

              <div className="flex items-center gap-6 text-sm font-semibold text-slate-800">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="isOfficial"
                    checked={!isOfficial}
                    onChange={() => {
                      setIsOfficial(false);
                      setOfficialDistrict('');
                      setOfficialPost('');
                      setOfficialTaluka('');
                      setSelectedOfficialId('');
                    }}
                    className="w-4 h-4 text-[#df6b16] focus:ring-[#df6b16]"
                  />
                  नाही (केवळ सामान्य सदस्य)
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="isOfficial"
                    checked={isOfficial}
                    onChange={() => setIsOfficial(true)}
                    className="w-4 h-4 text-[#df6b16] focus:ring-[#df6b16]"
                  />
                  होय (होय, मी संघटनेचा पदाधिकारी आहे)
                </label>
              </div>

              {/* If YES: Show District -> Post -> Official Name auto-fill Dropdown */}
              {isOfficial && (
                <div className="pt-3 border-t border-blue-200 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-fadeIn">
                  {/* Dropdown 1: District */}
                  <div>
                    <label className="font-bold text-[#172033] block mb-1">
                      जिल्ह्याचे नाव निवडा <span className="text-[#df6b16]">*</span>
                    </label>
                    <select
                      value={officialDistrict}
                      onChange={(e) => {
                        setOfficialDistrict(e.target.value);
                        setSelectedOfficialId('');
                      }}
                      required={isOfficial}
                      className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16] text-xs font-medium"
                    >
                      <option value="">जिल्हा निवडा</option>
                      {MAHARASHTRA_DISTRICTS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Dropdown 2: Post */}
                  <div>
                    <label className="font-bold text-[#172033] block mb-1">
                      पदाधिकारी प्रकार / पद <span className="text-[#df6b16]">*</span>
                    </label>
                    <select
                      value={officialPost}
                      onChange={(e) => setOfficialPost(e.target.value)}
                      required={isOfficial}
                      className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16] text-xs font-medium"
                    >
                      <option value="">पद निवडा</option>
                      {OFFICIAL_POST_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Dropdown 3: If related to District, choose self name from officials */}
                  <div>
                    <label className="font-bold text-[#172033] block mb-1">
                      आपले स्वतःचे नाव निवडा (उपलब्ध असल्यास)
                    </label>
                    <select
                      value={selectedOfficialId}
                      onChange={(e) => handleSelectOfficialFromList(e.target.value)}
                      className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16] text-xs font-medium"
                    >
                      <option value="">-- यादीतून नाव निवडा --</option>
                      {matchingDistrictOfficials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.salutation} {m.firstName} {m.lastName} - {m.appointedPost} {m.taluka ? `(${m.taluka})` : ''}
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] text-slate-500 block mt-1">
                      जिल्हाध्यक्षांनी आपले नाव ॲड केलेले असल्यास निवडा, माहिती आपोआप भरेल.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Personal Details & Passport Photo Upload with Live Preview */}
          <div className="bg-white rounded-xl border border-[#dbe3ef] p-6 shadow-xs space-y-4">
            <h2 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#193568] pb-2 border-b border-[#dbe3ef]">
              2. वैयक्तिक माहिती व पासपोर्ट फोटो
            </h2>

            {/* Marathi Language Notice */}
            <div className="bg-[#fff8e6] border-l-4 border-[#df6b16] p-3 rounded-r-lg text-xs text-[#851216] font-semibold flex items-center gap-2">
              <span className="text-sm">✍️</span>
              <span>
                <strong>सूचना:</strong> सदस्यत्व फॉर्ममधील सर्व वैयक्तिक माहिती (नाव, पत्ता, तालुका, छंद) <strong>फक्त मराठी भाषेतच</strong> भरावी. इंग्रजी अक्षरात माहिती भरल्यास अर्ज सबमिट होणार नाही.
              </span>
            </div>

            {/* Passport Photo Upload & Live Preview Section */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5">
              <label className="font-bold text-[#193568] block mb-1 text-xs sm:text-sm">
                पासपोर्ट फोटो अपलोड करा (कमाल 200 KB) <span className="text-[#df6b16]">*</span>
              </label>
              <p className="text-[11px] text-slate-500 mb-3">
                आपला रंगीत पासपोर्ट फोटो अपलोड करा. तो तात्काळ उजव्या बाजूला दिसू लागेल. (JPG, JPEG, PNG फॉरमॅट)
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* File Upload Box */}
                <div className="flex-1 w-full">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[#193568]/30 hover:border-[#df6b16] bg-white rounded-xl p-5 text-center cursor-pointer transition-all hover:bg-amber-50/20"
                  >
                    <Upload className="w-8 h-8 text-[#df6b16] mx-auto mb-2" />
                    <p className="text-xs font-bold text-[#193568]">
                      फोटो निवडण्यासाठी येथे क्लिक करा
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      कमाल आकार: 200KB (स्वयंचलित ऑप्टिमाइझ केला जाईल)
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoSelect}
                      className="hidden"
                    />
                  </div>

                  {photoError && (
                    <p className="text-xs text-rose-600 mt-2 font-semibold">
                      ⚠️ {photoError}
                    </p>
                  )}
                  {photoSizeKb > 0 && !photoError && (
                    <p className="text-xs text-emerald-700 mt-2 font-semibold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      फोटो यशस्वीरित्या जोडला गेला (आकार: {photoSizeKb} KB)
                    </p>
                  )}
                </div>

                {/* Live Preview Box on the Right */}
                <div className="shrink-0 flex flex-col items-center">
                  <div className="w-32 h-40 bg-white border-2 border-[#d4af37] rounded-lg shadow-sm overflow-hidden flex items-center justify-center relative">
                    {photoDataUrl ? (
                      <img
                        src={photoDataUrl}
                        alt="Passport Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center p-2 text-slate-400">
                        <ImageIcon className="w-8 h-8 mx-auto mb-1 opacity-50" />
                        <span className="text-[10px] block leading-tight font-medium">
                          पासपोर्ट फोटो पूर्वावलोकन
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-slate-600 mt-1.5 uppercase tracking-wider">
                    फोटो पूर्वावलोकन (Preview)
                  </span>
                </div>
              </div>
            </div>

            {/* Personal Details Inputs with Strict Marathi Guidance */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
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
                  <option value="श्री">श्री</option>
                  <option value="सौ">सौ</option>
                  <option value="श्रीमती">श्रीमती</option>
                  <option value="डॉ">डॉ</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-[#172033] block mb-1">
                  संपूर्ण नाव (प्रथम, मधले, आडनाव) <span className="text-[#df6b16]">*</span>
                  <span className="text-[11px] font-bold text-[#df6b16] ml-1.5">(फक्त मराठीत)</span>
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="उदा. अमोल राजेश पाटील"
                  className={`w-full p-2.5 bg-white border rounded-lg focus:outline-none transition-colors ${
                    hasEnglishLetters(fullName)
                      ? 'border-rose-500 bg-rose-50/30 focus:border-rose-600'
                      : 'border-[#c8d2e2] focus:border-[#df6b16]'
                  }`}
                />
                {hasEnglishLetters(fullName) && (
                  <p className="text-[11px] text-rose-600 font-bold mt-1">
                    ⚠️ कृपया नाव फक्त मराठीत लिहा (इंग्रजी अक्षरे चालणार नाहीत).
                  </p>
                )}
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
                  placeholder="10 अंकी मोबाईल नंबर"
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
                  onChange={(e) => {
                    setDistrict(e.target.value);
                    setTaluka('');
                  }}
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
                  तालुका (उपलब्ध असल्यास)
                  <span className="text-[11px] font-bold text-[#df6b16] ml-1.5">(फक्त मराठीत)</span>
                </label>
                <input
                  type="text"
                  value={taluka}
                  onChange={(e) => setTaluka(e.target.value)}
                  placeholder="उदा. मालेगाव"
                  className={`w-full p-2.5 bg-white border rounded-lg focus:outline-none transition-colors ${
                    hasEnglishLetters(taluka)
                      ? 'border-rose-500 bg-rose-50/30 focus:border-rose-600'
                      : 'border-[#c8d2e2] focus:border-[#df6b16]'
                  }`}
                />
                {hasEnglishLetters(taluka) && (
                  <p className="text-[11px] text-rose-600 font-bold mt-1">
                    ⚠️ कृपया तालुका फक्त मराठीत लिहा.
                  </p>
                )}
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
                  placeholder="उदा. 4"
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                />
              </div>

              <div>
                <label className="font-bold text-[#172033] block mb-1">
                  छंद / विशेष आवड
                  <span className="text-[11px] font-bold text-[#df6b16] ml-1.5">(फक्त मराठीत)</span>
                </label>
                <input
                  type="text"
                  value={hobby}
                  onChange={(e) => setHobby(e.target.value)}
                  placeholder="उदा. वाचन, शैक्षणिक संशोधन, वृक्षारोपण, क्रीडा"
                  className={`w-full p-2.5 bg-white border rounded-lg focus:outline-none transition-colors ${
                    hasEnglishLetters(hobby)
                      ? 'border-rose-500 bg-rose-50/30 focus:border-rose-600'
                      : 'border-[#c8d2e2] focus:border-[#df6b16]'
                  }`}
                />
                {hasEnglishLetters(hobby) && (
                  <p className="text-[11px] text-rose-600 font-bold mt-1">
                    ⚠️ कृपया छंद फक्त मराठीत लिहा.
                  </p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="font-bold text-[#172033] block mb-1">
                  पूर्ण निवासी व कार्यालयीन पत्ता / कार्यक्षेत्र <span className="text-[#df6b16]">*</span>
                  <span className="text-[11px] font-bold text-[#df6b16] ml-1.5">(फक्त मराठीत)</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="घर/फ्लॅट क्र., शाळा/कार्यालय, गाव/शहर, तालुका, जिल्हा व पिनकोड"
                  className={`w-full p-2.5 bg-white border rounded-lg focus:outline-none transition-colors ${
                    hasEnglishLetters(address)
                      ? 'border-rose-500 bg-rose-50/30 focus:border-rose-600'
                      : 'border-[#c8d2e2] focus:border-[#df6b16]'
                  }`}
                />
                {hasEnglishLetters(address) && (
                  <p className="text-[11px] text-rose-600 font-bold mt-1">
                    ⚠️ कृपया पत्ता फक्त मराठीत लिहा (इंग्रजी अक्षरे चालणार नाहीत).
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Educational & Professional Qualifications */}
          <div className="bg-white rounded-xl border border-[#dbe3ef] p-6 shadow-xs space-y-4">
            <h2 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#193568] pb-2 border-b border-[#dbe3ef]">
              3. शैक्षणिक व व्यावसायिक माहिती (Education & Profession)
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
                  सध्याचे पद / संवर्ग (Current Cadre) <span className="text-[#df6b16]">*</span>
                </label>
                <select
                  value={professional}
                  onChange={(e) => setProfessional(e.target.value)}
                  required
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                >
                  <option value="">निवडा</option>
                  <option value="केंद्रप्रमुख">केंद्रप्रमुख</option>
                  <option value="विस्तार अधिकारी">विस्तार अधिकारी</option>
                  <option value="मुख्याध्यापक">मुख्याध्यापक</option>
                  <option value="शिक्षण विस्तार अधिकारी">शिक्षण विस्तार अधिकारी</option>
                  <option value="उपशिक्षक / पदवीधर शिक्षक">उपशिक्षक / पदवीधर शिक्षक</option>
                  <option value="इतर शिक्षण विभागातील अधिकारी">इतर शिक्षण विभागातील अधिकारी</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 4: Membership Fee & Bank Account Details */}
          <div className="bg-white rounded-xl border-2 border-[#df6b16]/40 p-6 shadow-xs space-y-4">
            <h2 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#193568] pb-2 border-b border-[#dbe3ef]">
              4. सदस्यत्व आणि वर्गणी फी तपशील
            </h2>

            <div className="bg-[#fff7f0] border-l-4 border-[#df6b16] p-4 sm:p-5 rounded-r-xl text-xs leading-relaxed text-[#102a43] space-y-3">
              <p className="font-bold text-sm text-[#09243f]">
                "महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ" या संघटनेसाठी आजीवन सदस्यत्व आणि वार्षिक वर्गणीचे नियम खालीलप्रमाणे आहेत:
              </p>

              <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs space-y-2">
                <div className="font-bold text-sm text-[#851216] flex items-center gap-1.5">
                  💰 सदस्यत्व आणि वर्गणी फी तपशील:
                </div>
                <ul className="space-y-1.5 text-xs text-slate-800 font-semibold pl-1">
                  <li>• <strong>आजीवन सदस्यत्व (Lifetime Membership):</strong> 100 रुपये (एकदाच भरायची फी).</li>
                  <li>• <strong>वार्षिक वर्गणी (Annual Subscription):</strong> 120 रुपये (दरवर्षी भरायची वर्गणी).</li>
                </ul>
              </div>

              {/* Official Bank Account Details */}
              <div className="bg-gradient-to-r from-[#0f172a] via-[#1e293b] to-[#0f172a] text-white p-4 sm:p-5 rounded-xl shadow-sm space-y-2 border border-slate-700">
                <div className="text-[11px] font-bold tracking-widest text-[#efb24b] uppercase">
                  अधिकृत बँक खाते तपशील (Bank Account Details)
                </div>
                <div className="font-mono text-base font-extrabold text-[#f8fafc]">
                  KENDRAPRAMUKH V ADHIKARI MAHASNAGH
                </div>
                <div className="pt-1 flex flex-wrap gap-x-8 gap-y-2 text-xs sm:text-sm text-slate-200 font-mono">
                  <div>
                    <span className="text-slate-400">Ac. No.:</span> <strong className="text-white text-base">60597730518</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">IFSC:</span> <strong className="text-amber-400 text-base">MAHB0002075</strong>
                  </div>
                </div>
                <div className="text-[11px] text-slate-300 pt-1 border-t border-slate-700">
                  बँक: बँक ऑफ महाराष्ट्र (Bank of Maharashtra)
                </div>
              </div>

              <p className="text-[11px] text-slate-600 italic">
                सदस्यत्व व वर्गणी शुल्क वरील अधिकृत बँक खात्यावर जमा करावे.
              </p>
            </div>
          </div>

          {/* Section 5: Mandatory Applicant Declaration */}
          <div className="bg-white rounded-xl border-2 border-blue-200 p-5 shadow-xs">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                required
                checked={declarationAccepted}
                onChange={(e) => setDeclarationAccepted(e.target.checked)}
                className="w-5 h-5 mt-0.5 text-[#df6b16] rounded border-slate-300 focus:ring-[#df6b16] shrink-0"
              />
              <div className="text-xs text-slate-800 leading-relaxed">
                <strong className="block text-sm text-[#09243f] font-serifDevanagari mb-1">
                  सदस्यत्व स्वयंघोषणापत्र (Declaration) <span className="text-rose-600">*</span>
                </strong>
                "मी याद्वारे घोषित करतो/करते की, मी शिक्षण विभागातील कार्यरत अधिकारी / केंद्रप्रमुख असून महासंघाच्या सदस्यत्वासाठी पात्र आहे. माझ्याद्वारे अर्जात भरलेली सर्व वैयक्तिक व कार्यालयीन माहिती पूर्णपणे सत्य आणि अचूक आहे. मी संघटनेचे नियम व उद्दिष्टे वाचली असून मला महासंघाच्या सर्व अटी व शर्ती पूर्णपणे मान्य आहेत."
              </div>
            </label>
          </div>

          {/* Submit Button Section */}
          {(() => {
            const hasAnyEnglish =
              hasEnglishLetters(fullName) ||
              hasEnglishLetters(address) ||
              hasEnglishLetters(taluka) ||
              hasEnglishLetters(hobby);

            return (
              <div className="bg-white rounded-xl border border-[#dbe3ef] p-6 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-[#63708a] max-w-md space-y-1.5">
                  {hasAnyEnglish && (
                    <div className="text-xs font-bold text-rose-700 bg-rose-50 p-2.5 rounded-lg border border-rose-200 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>अर्जात इंग्रजी अक्षरे आढळली आहेत. सर्व माहिती मराठीत भरा, त्याशिवाय अर्ज सबमिट होणार नाही.</span>
                    </div>
                  )}
                  <p>
                    घोषणापत्रावर टिक केल्यानंतर व सर्व माहिती मराठीत भरल्यानंतरच आपला अर्ज सादर होईल.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={!declarationAccepted || hasAnyEnglish}
                  className="w-full sm:w-auto bg-[#df6b16] hover:bg-[#c85c0e] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-8 py-3.5 rounded-lg text-sm transition-all shadow-md flex items-center justify-center gap-2 active:scale-95 shrink-0"
                >
                  <UserCheck className="w-4 h-4" />
                  अर्ज सबमिट करा (Submit Application)
                </button>
              </div>
            );
          })()}
        </form>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  UserCheck, ShieldCheck, CheckCircle2, AlertCircle, Phone, Printer, Download, Search,
  Upload, Image as ImageIcon, Check, Sparkles, Award, ExternalLink
} from 'lucide-react';
import {
  ORG_DETAILS,
  MAHARASHTRA_DISTRICTS,
  MembershipApplication,
  OFFICIAL_CADRES,
  TEACHER_PROFESSIONAL_QUALIFICATIONS,
  formatSequentialMemberNumber
} from '../data/mahasanghData';
import { toEnglishDigits } from '../utils/formatters';
import { fetchOfficials } from '../services/rkFirebaseService';
import { OfficialMember, DISTRICT_TALUKAS_MAP } from '../data/rkMaharashtraData';
import { generateMembershipCertificatePdf } from '../services/rkPdfGenerator';
import { RegisteredMembersDirectory } from './RegisteredMembersDirectory';
import { allocateNextMemberNumber, addApprovedMemberToCache } from '../firebase';
import { initiateRazorpayPayment, fetchRazorpayPublicConfig } from '../utils/razorpay';

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
  const [centerName, setCenterName] = useState('');
  const [familyMembers, setFamilyMembers] = useState('');
  const [hobby, setHobby] = useState('');
  const [education, setEducation] = useState('');
  const [professionalQualification, setProfessionalQualification] = useState('');
  const [professional, setProfessional] = useState('');
  const [customProfessional, setCustomProfessional] = useState('');
  
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
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [pendingApp, setPendingApp] = useState<MembershipApplication | null>(null);
  const submittedAppRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<MembershipApplication | null | 'not_found'>(null);
  const [isDownloadingCert, setIsDownloadingCert] = useState<boolean>(false);
  const [isTrackingStatus, setIsTrackingStatus] = useState<boolean>(false);
  const [formAlert, setFormAlert] = useState<string>('');
  const [declarationAccepted, setDeclarationAccepted] = useState<boolean>(false);
  const [isRazorpayLoading, setIsRazorpayLoading] = useState<boolean>(false);
  const [razorpayError, setRazorpayError] = useState<string>('');
  const [isCheckingPaymentStatus, setIsCheckingPaymentStatus] = useState<boolean>(false);
  const [paymentStatusNotice, setPaymentStatusNotice] = useState<string>('');

  const handleStartRazorpayCheckout = (app: MembershipApplication) => {
    setIsRazorpayLoading(true);
    setRazorpayError('');
    setPaymentStatusNotice('');

    initiateRazorpayPayment({
      amount: 220,
      applicationId: app.id,
      fullName: app.fullName,
      phone: app.phone,
      email: app.email,
      district: app.district,
      onSuccess: (paymentId, orderId, _signature, approvedFromServer) => {
        setIsRazorpayLoading(false);
        handleConfirmPaymentCompleted(app, {
          paymentId,
          orderId,
          approvedFromServer,
        });
      },
      onError: (err) => {
        setIsRazorpayLoading(false);
        setRazorpayError(err);
      },
      onDismiss: () => {
        setIsRazorpayLoading(false);
      }
    });
  };

  // Available talukas dynamically populated based on selected district
  const availableTalukas = useMemo(() => {
    if (!district) return [];
    const trimmed = district.trim();
    if (DISTRICT_TALUKAS_MAP[trimmed]) return DISTRICT_TALUKAS_MAP[trimmed];
    const alt1 = trimmed.replace('शी', 'शि');
    if (DISTRICT_TALUKAS_MAP[alt1]) return DISTRICT_TALUKAS_MAP[alt1];
    const alt2 = trimmed.replace('शि', 'शी');
    if (DISTRICT_TALUKAS_MAP[alt2]) return DISTRICT_TALUKAS_MAP[alt2];
    for (const [dKey, list] of Object.entries(DISTRICT_TALUKAS_MAP)) {
      if (dKey.includes(trimmed) || trimmed.includes(dKey)) return list;
    }
    return [];
  }, [district]);

  // Scroll to submission banner at bottom when submittedApp is set
  useEffect(() => {
    if (submittedApp && submittedAppRef.current) {
      submittedAppRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [submittedApp]);

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
        const maxDim = 500;
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

        // Quality compression: target < 180KB safely
        let quality = 0.82;
        let compressed = canvas.toDataURL('image/jpeg', quality);
        let sizeKb = Math.round((compressed.length * 3) / 4 / 1024);

        while (sizeKb > 180 && quality > 0.25) {
          quality -= 0.12;
          compressed = canvas.toDataURL('image/jpeg', quality);
          sizeKb = Math.round((compressed.length * 3) / 4 / 1024);
        }

        // If still > 180KB, downscale canvas size further so it NEVER fails for any smartphone photo
        if (sizeKb > 180) {
          const smallCanvas = document.createElement('canvas');
          const targetW = 320;
          const targetH = Math.round((height * 320) / width);
          smallCanvas.width = targetW;
          smallCanvas.height = targetH;
          const sCtx = smallCanvas.getContext('2d');
          if (sCtx) {
            sCtx.drawImage(canvas, 0, 0, targetW, targetH);
            compressed = smallCanvas.toDataURL('image/jpeg', 0.65);
            sizeKb = Math.round((compressed.length * 3) / 4 / 1024);
          }
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

    if (!salutation || !fullName.trim() || !phone.trim() || !address.trim() || !education.trim() || !professionalQualification.trim() || !professional.trim() || !district || !taluka || (taluka && !centerName.trim())) {
      setFormAlert('कृपया सर्व आवश्यक (*) माहिती (जिल्हा, तालुका व कार्यरत केंद्राच्या नावासह) अचूकपणे निवडा व भरा.');
      window.scrollTo({ top: 380, behavior: 'smooth' });
      return;
    }

    const cleanPhone = toEnglishDigits(phone.trim()).replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      setFormAlert('कृपया 10 अंकी वैध मोबाईल नंबर प्रविष्ट करा.');
      window.scrollTo({ top: 380, behavior: 'smooth' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase() || `${cleanPhone}@mahasangh.in`;

    // Check duplicate by phone number (last 10 digits comparison)
    const existingMatch = applications.find(
      (a) => a.phone && a.phone.replace(/\D/g, '').slice(-10) === cleanPhone
    );

    if (existingMatch) {
      if (existingMatch.status === 'approved') {
        setFormAlert(`हा मोबाईल नंबर (${cleanPhone}) आधीच नोंदणीकृत असून सदस्यत्व मंजूर आहे (सदस्य क्र. ${existingMatch.memberNumber || ''}). आपण वरील 'अर्जाची स्थिती तपासा' मधून आय-कार्ड डाऊनलोड करू शकता.`);
        window.scrollTo({ top: 380, behavior: 'smooth' });
        return;
      } else {
        // Pending application already exists - update it seamlessly and take user directly to payment!
        const updatedPending: MembershipApplication = {
          ...existingMatch,
          salutation,
          fullName: fullName.trim(),
          phone: cleanPhone,
          email: cleanEmail,
          address: address.trim(),
          district: district,
          taluka: taluka,
          centerName: centerName.trim(),
          familyMembers: toEnglishDigits(familyMembers.trim()),
          hobby: hobby.trim(),
          education,
          professionalQualification,
          professional,
          photo: photoDataUrl || existingMatch.photo,
          isOfficial,
          officialPost: isOfficial ? officialPost : undefined,
          officialDistrict: isOfficial ? officialDistrict : undefined,
          officialTaluka: isOfficial ? officialTaluka : undefined,
        };
        onAddApplication(updatedPending);
        setPendingApp(updatedPending);
        setShowPaymentModal(true);
        return;
      }
    }

    if (!photoDataUrl) {
      setFormAlert('कृपया आपला पासपोर्ट आकाराचा फोटो निवडा.');
      window.scrollTo({ top: 420, behavior: 'smooth' });
      return;
    }

    if (!declarationAccepted) {
      setFormAlert('कृपया खालील "सदस्यत्व स्वयंघोषणापत्र" या चौकटीवर (Checkbox) टिक करा.');
      return;
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const newApp: MembershipApplication = {
      id: `app-${Date.now()}`,
      applicationNumber: `MS-2026-${randomSuffix}`,
      salutation,
      fullName: fullName.trim(),
      phone: cleanPhone,
      email: cleanEmail,
      address: address.trim(),
      district: district,
      taluka: taluka,
      centerName: centerName.trim(),
      familyMembers: toEnglishDigits(familyMembers.trim()),
      hobby: hobby.trim(),
      education,
      professionalQualification,
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

    // Save application instantly to Firebase & local storage so user data is NEVER lost
    onAddApplication(newApp);
    setPendingApp(newApp);
    setShowPaymentModal(true);
  };

  const handleConfirmPaymentCompleted = async (
    targetApp: MembershipApplication,
    verifiedPayment: {
      paymentId: string;
      orderId?: string;
      approvedFromServer?: Partial<MembershipApplication> | null;
    }
  ) => {
    const appToApprove = targetApp;
    if (!appToApprove) return;

    const nowIso = new Date().toISOString();
    const serverApp = verifiedPayment.approvedFromServer;

    let finalApp: MembershipApplication;
    if (serverApp && serverApp.status === 'approved' && serverApp.memberNumber) {
      finalApp = {
        ...appToApprove,
        ...serverApp,
        status: 'approved',
        paymentConfirmed: true,
        paymentRef: serverApp.paymentRef || verifiedPayment.paymentId || appToApprove.paymentRef,
      };
    } else {
      // Server verified cryptographic signature; ensure Firestore reflects approval if server write didn't return doc
      let autoMemberNo = '';
      try {
        const counterResult = await allocateNextMemberNumber(appToApprove.district);
        autoMemberNo = counterResult.memberNumber;
      } catch {
        const approvedCount = applications.filter((a) => a.status === 'approved').length;
        autoMemberNo = formatSequentialMemberNumber(appToApprove.district, approvedCount + 1);
      }
      finalApp = {
        ...appToApprove,
        status: 'approved',
        memberNumber: autoMemberNo,
        approvedAt: nowIso,
        paymentConfirmed: true,
        paymentRef: verifiedPayment.paymentId,
        razorpayPaymentId: verifiedPayment.paymentId,
        razorpayOrderId: verifiedPayment.orderId || '',
      };
    }

    onAddApplication(finalApp);
    addApprovedMemberToCache(finalApp);
    setSubmittedApp(finalApp);
    setPendingApp(null);
    setShowPaymentModal(false);
    setPaymentStatusNotice('');

    // If searchResult was pending, update searchResult to approved so user immediately sees approved card
    if (searchResult && typeof searchResult !== 'string' && searchResult.id === appToApprove.id) {
      setSearchResult(finalApp);
    }

    // Reset Form
    setFullName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setDistrict('');
    setTaluka('');
    setCenterName('');
    setFamilyMembers('');
    setHobby('');
    setEducation('');
    setProfessionalQualification('');
    setProfessional('');
    setPhotoDataUrl('');
    setPhotoSizeKb(0);
    setIsOfficial(false);
    setOfficialDistrict('');
    setOfficialPost('');
    setOfficialTaluka('');
    setSelectedOfficialId('');
    setDeclarationAccepted(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleTrackStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawTrimmed = toEnglishDigits(searchQuery.trim());
    const query = rawTrimmed.toLowerCase();
    if (!query) return;

    const queryDigits = query.replace(/\D/g, '');
    setIsTrackingStatus(true);

    try {
      // 1. Always check Firestore targeted query first so admin-edited details & new memberNumber are live!
      if (onTrackRemote) {
        const foundRemote = await onTrackRemote(rawTrimmed);
        if (foundRemote) {
          setSearchResult(foundRemote);
          return;
        }
      }

      // 2. Fallback to local cache (handles partial name search or offline mode; prefer approved records)
      const localMatches = applications.filter((a) => {
        const appNoMatch = a.applicationNumber && a.applicationNumber.toLowerCase() === query;
        const memberNoMatch = a.memberNumber && a.memberNumber.toLowerCase() === query;
        const phoneClean = a.phone ? a.phone.replace(/\D/g, '') : '';
        const phoneMatch = queryDigits.length >= 6 && phoneClean.includes(queryDigits);
        const nameMatch = a.fullName && a.fullName.toLowerCase().includes(query);
        return appNoMatch || memberNoMatch || phoneMatch || nameMatch;
      });

      if (localMatches.length > 0) {
        const approvedLocal = localMatches.find((m) => m.status === 'approved') || localMatches[0];
        setSearchResult(approvedLocal);
        return;
      }

      setSearchResult('not_found');
    } finally {
      setIsTrackingStatus(false);
    }
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
    <div className="bg-[#f7f9fc] py-6 sm:py-10">
      <div className="max-w-[1000px] mx-auto px-4">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-[#193568] via-[#1f3f78] to-[#12284c] text-white rounded-2xl p-5 sm:p-8 mb-6 shadow-md border-t-4 border-[#efb24b]">
          <div className="flex items-center gap-2 text-xs font-bold text-[#f8d39b] mb-2 uppercase tracking-wider">
            <UserCheck className="w-4 h-4 text-[#efb24b]" />
            महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ
          </div>
          <h1 className="font-serifDevanagari text-2xl sm:text-3xl font-bold mb-2">
            सदस्यत्व नोंदणी व अधिकृत सभासद यादी
          </h1>
          <p className="text-xs sm:text-sm text-slate-200 leading-relaxed max-w-2xl">
            महासंघाची अधिकृत नोंदणीकृत सदस्य यादी खालील चौकटीत उपलब्ध आहे. यानंतर आपण आपल्या अर्जाची स्थिती तपासू शकता व नवीन सदस्यत्व नोंदणी करू शकता.
          </p>
        </div>

        {/* 1. अधिकृत नोंदणीकृत सदस्य यादी (सगळ्यात वर - Top-most Section as requested) */}
        <RegisteredMembersDirectory applications={applications} />

        {/* 2. अर्जाची स्थिती तपासा (त्यानंतर - Middle Section, exact same position, high-visibility design) */}
        <div className="bg-gradient-to-br from-[#fff9f2] via-white to-[#fffbeb] rounded-2xl border-2 border-[#df6b16] mb-8 shadow-lg overflow-hidden ring-4 ring-[#df6b16]/10">
          {/* Bold High-Contrast Saffron Header */}
          <div className="bg-gradient-to-r from-[#df6b16] via-[#d15c0c] to-[#b34904] px-5 py-3.5 sm:px-6 sm:py-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white text-[#df6b16] flex items-center justify-center shadow-md shrink-0">
                <Search className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="font-serifDevanagari font-extrabold text-lg sm:text-xl text-white leading-tight">
                  अर्जाची स्थिती तपासा व आय-कार्ड मिळवा
                </h3>
                <p className="text-xs text-amber-100 font-semibold mt-0.5">
                  Track Application Status & Download Official ID Card
                </p>
              </div>
            </div>
            <span className="self-start sm:self-auto bg-[#193568] text-amber-200 border border-amber-300/40 text-[11px] font-bold px-3 py-1 rounded-full shadow-xs shrink-0">
              ★ तात्काळ आय-कार्ड डाऊनलोड
            </span>
          </div>

          <div className="p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              <p className="text-xs sm:text-sm text-[#193568] font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#df6b16] shrink-0"></span>
                <span>
                  आपला <span className="text-[#df6b16] underline decoration-[#df6b16]/40">१० अंकी मोबाईल नंबर</span>, <span className="text-[#df6b16] underline decoration-[#df6b16]/40">सदस्य क्रमांक</span> किंवा <span className="text-[#df6b16] underline decoration-[#df6b16]/40">अर्ज क्रमांक</span> खालील बॉक्समध्ये टाका:
                </span>
              </p>

              <form onSubmit={handleTrackStatus} className="flex flex-col sm:flex-row gap-3 w-full">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[#df6b16] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="येथे मोबाईल नंबर (उदा. 9876543210) किंवा MS/2026/... टाका"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-sm font-semibold text-[#193568] bg-white border-2 border-[#df6b16]/60 focus:border-[#df6b16] focus:ring-2 focus:ring-[#df6b16]/20 rounded-xl pl-10 pr-4 py-3 focus:outline-none shadow-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isTrackingStatus}
                  className="bg-gradient-to-r from-[#193568] to-[#12284c] hover:from-[#12284c] hover:to-[#0a1833] disabled:opacity-70 text-white text-sm font-extrabold px-6 py-3 rounded-xl shrink-0 flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  <Search className="w-4 h-4 text-[#efb24b]" />
                  <span>{isTrackingStatus ? 'तपासत आहे...' : 'स्थिती तपासा'}</span>
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
                          {searchResult.officialPost} {searchResult.officialTaluka ? `(${searchResult.officialTaluka})` : ''}
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
                      {isDownloadingCert ? 'आय-कार्ड तयार होत आहे...' : 'आय-कार्ड डाऊनलोड करा (PDF ID Card)'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="text-xs text-amber-900 font-medium bg-amber-50 p-3 rounded-lg border border-amber-200">
                    आपला अर्ज सुरक्षित जतन आहे, परंतु <strong>₹220</strong> पेमेंटची खात्री अद्याप झालेली नाही. खालील बटनावरून पेमेंट पूर्ण करा; पेमेंट झाल्यावर त्वरित आपले अधिकृत आय-कार्ड तयार होईल.
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setPendingApp(searchResult as MembershipApplication);
                        setShowPaymentModal(true);
                        handleStartRazorpayCheckout(searchResult as MembershipApplication);
                      }}
                      disabled={isRazorpayLoading}
                      className="bg-[#193568] hover:bg-[#11254a] disabled:opacity-60 text-white text-xs font-bold px-4 py-2.5 rounded-lg flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
                    >
                      <span>💳</span> {isRazorpayLoading ? 'पेमेंट उघडत आहे...' : 'Razorpay ने ₹220 भरा (तात्काळ आय-कार्ड)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingApp(searchResult as MembershipApplication);
                        setShowPaymentModal(true);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      पेमेंट पर्याय / स्थिती तपासा
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {searchResult === 'not_found' && (
            <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              कोणताही अर्ज आढळला नाही. कृपया अचूक १० अंकी मोबाईल नंबर, सदस्य क्रमांक किंवा अर्ज क्रमांक प्रविष्ट करा.
            </div>
          )}
          </div>
        </div>



        {/* 3. नवीन नोंदणी अर्ज (Bottom Section as requested) */}
        <div className="bg-gradient-to-r from-[#193568] via-[#1f3f78] to-[#12284c] text-white p-4 sm:p-5 rounded-2xl shadow-xs mb-6 border-l-4 border-[#df6b16] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#df6b16] text-white flex items-center justify-center font-bold text-lg shadow-xs shrink-0">
              ✍️
            </div>
            <div>
              <h2 className="font-serifDevanagari text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <span>नवीन सदस्यत्व नोंदणी अर्ज</span>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 bg-[#df6b16] text-white rounded-md">
                  नोंदणी करा
                </span>
              </h2>
              <p className="text-xs text-amber-200 mt-0.5">
                महासंघाचे अधिकृत आजीवन सभासदत्व मिळवण्यासाठी खालील माहिती अचूक भरा.
              </p>
            </div>
          </div>
        </div>

        {/* Main Application Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {formAlert && (
            <div className="p-3 bg-rose-50 border border-rose-300 text-rose-800 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {formAlert}
            </div>
          )}

          {/* Section 1: Personal Details & Passport Photo Upload with Live Preview */}
          <div className="bg-white rounded-xl border border-[#dbe3ef] p-6 shadow-xs space-y-4">
            <h2 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#193568] pb-2 border-b border-[#dbe3ef]">
              1. वैयक्तिक माहिती व पासपोर्ट फोटो
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
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="उदा. अमोल राजेश पाटील"
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] focus:border-[#df6b16] rounded-lg focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="font-bold text-[#172033] block mb-1">
                  WhatsApp मोबाईल नंबर <span className="text-[#df6b16]">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => {
                    const clean = toEnglishDigits(e.target.value).replace(/\D/g, '').slice(0, 10);
                    setPhone(clean);
                  }}
                  placeholder="10 अंकी मोबाईल नंबर (उदा. 9822123456)"
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                />
              </div>

              <div>
                <label className="font-bold text-[#172033] block mb-1">
                  ई-मेल पत्ता (Email)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="उदा. amol@example.com (ऐच्छिक)"
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                />
              </div>

              <div>
                <label className="font-bold text-[#172033] block mb-1">
                  सध्या आपण कार्यरत असणारा जिल्हा निवडा <span className="text-[#df6b16]">*</span>
                </label>
                <select
                  value={district}
                  onChange={(e) => {
                    setDistrict(e.target.value);
                    setTaluka('');
                    setCenterName('');
                  }}
                  required
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                >
                  <option value="">-- सध्या आपण कार्यरत असणारा जिल्हा निवडा --</option>
                  {MAHARASHTRA_DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-[#172033] block mb-1">
                  सध्या आपण कार्यरत असलेला तालुका निवडा <span className="text-[#df6b16]">*</span>
                </label>
                <select
                  value={taluka}
                  onChange={(e) => setTaluka(e.target.value)}
                  required
                  disabled={!district}
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16] disabled:bg-slate-100 disabled:cursor-not-allowed font-medium text-[#172033]"
                >
                  <option value="">{district ? '-- सध्या आपण कार्यरत असलेला तालुका निवडा --' : '-- आधी जिल्हा निवडा --'}</option>
                  {availableTalukas.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* तालुका निवडल्यास कार्यरत केंद्राचे नाव प्रविष्ट करण्याचा बॉक्स */}
              {taluka && (
                <div className="sm:col-span-2 bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-blue-50/80 p-4 rounded-xl border-2 border-[#193568]/30 space-y-1.5 transition-all shadow-2xs">
                  <label className="font-bold text-[#193568] flex items-center gap-1.5 text-xs sm:text-sm">
                    <span className="text-base">🏫</span>
                    <span>कार्यरत केंद्राचे नाव लिहा <span className="text-[#df6b16]">*</span></span>
                  </label>
                  <input
                    type="text"
                    required
                    value={centerName}
                    onChange={(e) => setCenterName(e.target.value)}
                    placeholder="उदा. कें. शा. उंबर्डा बाजार / केंद्र - मालेगाव"
                    className="w-full p-2.5 bg-white border border-[#c8d2e2] focus:border-[#df6b16] rounded-lg focus:outline-none transition-colors text-xs font-bold text-[#193568] shadow-2xs"
                  />
                  <p className="text-[11px] text-slate-600 font-medium">
                    सूचना: आपण ज्या बीट / शिक्षण केंद्रामध्ये कार्यरत आहात त्या केंद्राचे नाव मराठीत टाईप करा.
                  </p>
                </div>
              )}

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
                </label>
                <input
                  type="text"
                  value={hobby}
                  onChange={(e) => setHobby(e.target.value)}
                  placeholder="उदा. वाचन, शैक्षणिक संशोधन, वृक्षारोपण, क्रीडा"
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] focus:border-[#df6b16] rounded-lg focus:outline-none transition-colors"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-bold text-[#172033] block mb-1">
                  पूर्ण निवासी व कार्यालयीन पत्ता / कार्यक्षेत्र <span className="text-[#df6b16]">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="घर/फ्लॅट क्र., शाळा/कार्यालय, गाव/शहर, तालुका, जिल्हा व पिनकोड"
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] focus:border-[#df6b16] rounded-lg focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Educational & Professional Qualifications */}
          <div className="bg-white rounded-xl border border-[#dbe3ef] p-6 shadow-xs space-y-4">
            <h2 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#193568] pb-2 border-b border-[#dbe3ef]">
              2. शैक्षणिक व व्यावसायिक माहिती
            </h2>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. शैक्षणिक पात्रता */}
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
                    <option value="">शैक्षणिक पात्रता निवडा</option>
                    <option value="बारावी (12th)">बारावी (12th)</option>
                    <option value="पदविका (Diploma)">पदविका (Diploma)</option>
                    <option value="पदवी (B.A. / B.Sc. / B.Com.)">पदवी (B.A. / B.Sc. / B.Com.)</option>
                    <option value="पदव्युत्तर पदवी (M.A. / M.Sc. / M.Com.)">पदव्युत्तर पदवी (M.A. / M.Sc. / M.Com.)</option>
                    <option value="एम.फिल. (M.Phil.)">एम.फिल. (M.Phil.)</option>
                    <option value="पीएच.डी. (Ph.D.)">पीएच.डी. (Ph.D.)</option>
                    <option value="इतर शिक्षण क्षेत्रातील पात्रता">इतर शिक्षण क्षेत्रातील पात्रता</option>
                  </select>
                </div>

                {/* 2. व्यावसायिक पात्रता (शैक्षणिक पात्रतेच्या खाली शिक्षक पदाला लागू असणाऱ्या सर्व पात्रता) */}
                <div>
                  <label className="font-bold text-[#172033] block mb-1">
                    व्यावसायिक पात्रता (शिक्षक संवर्ग) <span className="text-[#df6b16]">*</span>
                  </label>
                  <select
                    value={professionalQualification}
                    onChange={(e) => setProfessionalQualification(e.target.value)}
                    required
                    className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                  >
                    <option value="">व्यावसायिक पात्रता निवडा</option>
                    {TEACHER_PROFESSIONAL_QUALIFICATIONS.map((qual) => (
                      <option key={qual} value={qual}>
                        {qual}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 3. सध्याचे पद / संवर्ग */}
              <div className="space-y-3">
                <div>
                  <label className="font-bold text-[#172033] block mb-1">
                    सध्याचे पद / संवर्ग <span className="text-[#df6b16]">*</span>
                  </label>
                  <select
                    value={professional}
                    onChange={(e) => setProfessional(e.target.value)}
                    required
                    className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-lg focus:outline-none focus:border-[#df6b16]"
                  >
                    <option value="">सध्याचे पद / संवर्ग निवडा</option>
                    {OFFICIAL_CADRES.map((cadre) => (
                      <option key={cadre} value={cadre}>
                        {cadre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Membership Fee & Razorpay Payment Info */}
          <div className="bg-white rounded-xl border-2 border-[#df6b16]/40 p-6 shadow-xs space-y-4">
            <h2 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#193568] pb-2 border-b border-[#dbe3ef]">
              3. सदस्यत्व आणि वर्गणी फी तपशील (₹220)
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
                  <li>• <strong>आजीवन सदस्यत्व:</strong> 100 रुपये (एकदाच भरायची फी).</li>
                  <li>• <strong>वार्षिक वर्गणी:</strong> 120 रुपये (दरवर्षी भरायची वर्गणी).</li>
                  <li>• <strong>एकूण ऑनलाईन देय रक्कम:</strong> ₹220 (दोनशे वीस रुपये).</li>
                </ul>
              </div>

              {/* Razorpay Online Payment Box */}
              <div className="bg-gradient-to-r from-[#193568] via-[#1f3f78] to-[#12284c] text-white p-4 sm:p-5 rounded-xl shadow-xs space-y-2 border border-[#efb24b]/40">
                <div className="text-xs font-bold text-[#efb24b] uppercase tracking-wider flex items-center gap-1.5">
                  💳 ऑनलाईन Razorpay पेमेंट सुविधा
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">
                  खालील अर्ज सबमिट बटणावर क्लिक केल्यास मूळ वेबसाईट बंद न होता थेट सुरक्षित <strong>Razorpay Payment Popup Window</strong> उघडेल. त्यात आपण UPI, GPay, PhonePe किंवा Card द्वारे <strong>₹220</strong> शुल्क भरू शकता.
                </p>
              </div>

              {/* Payment Support Helpline Note & Important Member Instructions */}
              <div className="bg-[#fff3cd] border border-amber-300 rounded-xl p-3.5 sm:p-4 text-xs text-[#7c5503] font-medium space-y-3 shadow-2xs">
                <div className="flex items-center gap-2 font-bold text-[#664300]">
                  <Phone className="w-4 h-4 text-[#df6b16] shrink-0" />
                  <span>
                    <strong>टीप:</strong> पेमेंट संबंधी काही अडचण उद्भवल्यास संपर्क: <strong>ज्ञानेश्वर नंदनवार - 8208494368</strong>
                  </span>
                </div>

                <div className="bg-white/85 border border-amber-200 rounded-lg p-3 sm:p-3.5 space-y-2.5 text-slate-800 leading-relaxed">
                  <div className="flex items-start gap-2">
                    <span className="font-extrabold text-[#193568] shrink-0">१.</span>
                    <p>
                      सर्व सदस्यांना विनंती आहे की, आपले पेमेंट प्राप्त झाल्यानंतर आपले सदस्य आय-कार्ड जनरेट होण्यास <strong>५ मिनिटे</strong> वेळ लागू शकतो. ५ मिनिटांनंतर आपण वर दिलेल्या <strong>"अर्जाची स्थिती तपासा"</strong> मध्ये जाऊन आपले आय-कार्ड मिळवू शकता.
                    </p>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="font-extrabold text-[#193568] shrink-0">२.</span>
                    <p>
                      काही सदस्यांचा अर्ज जर पेमेंट पूर्ण न करता मंजूर झाला असेल आणि त्यांना आय-कार्ड मिळाले असेल, तर त्यांनी या थेट पेमेंट लिंकवर{' '}
                      <a
                        href="https://rzp.io/rzp/Us7q4y7"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-mono font-bold px-2.5 py-0.5 rounded-md text-[11px] shadow-2xs transition-colors align-middle break-all"
                      >
                        <span>https://rzp.io/rzp/Us7q4y7</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>{' '}
                      क्लिक करून आपले ₹220 पेमेंट पूर्ण करावे.
                    </p>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="font-extrabold text-[#193568] shrink-0">३.</span>
                    <p>
                      जर आपले पेमेंट यशस्वी होऊनही आणि <strong>१० मिनिटांनंतरही</strong> आपला अर्ज मंजूर झालेला नसेल, तर <strong>श्री. ज्ञानेश्वर नंदनवार सर</strong>, WhatsApp मोबाईल क्रमांक{' '}
                      <a
                        href="https://wa.me/919423484305"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono font-extrabold text-emerald-700 underline hover:text-emerald-900"
                      >
                        9423484305
                      </a>{' '}
                      यांना पेमेंटचा स्क्रीनशॉट शेअर करावा. पेमेंट Confirm करून आपले सदस्यत्व तत्काळ मंजूर करण्यात येईल.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Mandatory Applicant Declaration */}
          <div className={`rounded-xl border-2 p-5 shadow-xs transition-all ${
            declarationAccepted
              ? 'bg-emerald-50/40 border-emerald-400'
              : 'bg-white border-[#df6b16]/50'
          }`}>
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={declarationAccepted}
                onChange={(e) => {
                  setDeclarationAccepted(e.target.checked);
                  if (formAlert) setFormAlert('');
                }}
                className="w-5 h-5 mt-0.5 text-[#df6b16] rounded border-slate-300 focus:ring-[#df6b16] shrink-0 cursor-pointer"
              />
              <div className="text-xs text-slate-800 leading-relaxed">
                <strong className="block text-sm text-[#09243f] font-serifDevanagari mb-1">
                  सदस्यत्व स्वयंघोषणापत्र <span className="text-rose-600">*</span>
                </strong>
                "मी याद्वारे घोषित करतो/करते की, मी शिक्षण विभागातील कार्यरत अधिकारी / केंद्रप्रमुख असून महासंघाच्या सदस्यत्वासाठी पात्र आहे. माझ्याद्वारे अर्जात भरलेली सर्व वैयक्तिक व कार्यालयीन माहिती पूर्णपणे सत्य आणि अचूक आहे. मी संघटनेचे नियम व उद्दिष्टे वाचली असून मला महासंघाच्या सर्व अटी व शर्ती पूर्णपणे मान्य आहेत."
              </div>
            </label>
          </div>

          {/* Submit Button Section */}
          <div className="bg-white rounded-xl border border-[#dbe3ef] p-6 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-[#63708a] max-w-md space-y-1.5">
              {formAlert && (
                <div className="text-xs font-bold text-rose-700 bg-rose-50 p-2.5 rounded-lg border border-rose-200 flex items-center gap-1.5 animate-pulse">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formAlert}</span>
                </div>
              )}
              <p>
                माहिती भरून घोषणापत्रावर टिक करा. खालील बटनावर क्लिक करताच अर्ज सुरक्षित जतन होईल आणि थेट सुरक्षित Razorpay पेमेंट विंडो उघडेल.
              </p>
            </div>
            <button
              type="submit"
              className="w-full sm:w-auto bg-gradient-to-r from-[#df6b16] to-[#b34f07] hover:from-[#c85c0e] hover:to-[#964004] text-white font-bold px-8 py-3.5 rounded-lg text-sm transition-all shadow-md flex items-center justify-center gap-2 active:scale-95 shrink-0 cursor-pointer"
            >
              <UserCheck className="w-4 h-4" />
              अर्ज जतन करा व पेमेंटकडे जा (Proceed to Pay ₹220)
            </button>
          </div>
        </form>

        {/* Success Banner After Submission (Displayed at Bottom of Form) */}
        {submittedApp && (
          <div ref={submittedAppRef} className="mt-8 bg-gradient-to-r from-[#f0fdf4] via-[#f7fee7] to-[#ecfdf5] border-2 border-[#a7e5bd] text-[#14532d] rounded-2xl p-6 shadow-md transition-all">
            <div className="flex items-start gap-3.5">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-3 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/80 pb-2.5">
                  <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-emerald-950">
                    🎉 आपले सदस्यत्व मंजूर झाले आहे. आपण या महासंघाचे आता अधिकृत सदस्य आहात, अभिनंदन!
                  </h3>
                  <span className="px-3 py-1 rounded-full bg-emerald-600 text-white font-bold text-xs shadow-2xs">
                    ✓ मंजूर (Approved)
                  </span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-emerald-300 shadow-2xs space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-slate-500 block text-[11px]">अधिकृत आजीवन सदस्य क्रमांक (Member ID):</span>
                      <strong className="text-lg text-[#193568] font-serif tracking-wider font-extrabold">
                        {submittedApp.memberNumber || 'MS/2026/MAHA/0001'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">अर्ज संदर्भ क्रमांक (Ref No):</span>
                      <strong className="text-xs text-slate-800 font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {submittedApp.applicationNumber}
                      </strong>
                    </div>
                  </div>

                  <p className="text-xs text-emerald-900 font-medium pt-1">
                    महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाशी जोडल्याबद्दल आपले मनःपूर्वक अभिनंदन! आपले अधिकृत आय-कार्ड तयार झाले आहे.
                  </p>

                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleDownloadApprovedCertificate(submittedApp)}
                      disabled={isDownloadingCert}
                      className="bg-gradient-to-r from-[#df6b16] to-[#b34f07] hover:from-[#c85c0e] hover:to-[#964004] text-white font-bold text-xs px-5 py-2.5 rounded-lg flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      <Download className={`w-4 h-4 ${isDownloadingCert ? 'animate-spin' : ''}`} />
                      {isDownloadingCert ? 'आय-कार्ड तयार होत आहे...' : 'आय-कार्ड डाऊनलोड करा (PDF ID Card)'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSubmittedApp(null);
                        window.scrollTo({ top: 380, behavior: 'smooth' });
                      }}
                      className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
                    >
                      नवीन अर्ज भरा
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Razorpay Online Payment Modal Popup (Strict Verification Required) */}
        {showPaymentModal && pendingApp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-slate-900/80 backdrop-blur-xs animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[95vh] flex flex-col overflow-y-auto relative">
              {/* Modal Header (Sticky) */}
              <div className="sticky top-0 z-30 bg-gradient-to-r from-[#193568] via-[#1f3f78] to-[#12284c] text-white px-4 sm:px-6 py-4 flex items-center justify-between shrink-0 border-b border-[#efb24b]/40 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#df6b16] flex items-center justify-center text-white font-bold text-base shadow-xs shrink-0">
                    ₹
                  </div>
                  <div>
                    <h3 className="font-serifDevanagari font-bold text-base sm:text-lg leading-tight text-white">
                      सुरक्षित Razorpay ऑनलाईन पेमेंट — ₹220
                    </h3>
                    <p className="text-[11px] text-amber-200 font-medium mt-0.5">
                      अर्जदार: {pendingApp.salutation} {pendingApp.fullName} | संदर्भ क्र.: {pendingApp.applicationNumber}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowPaymentModal(false);
                    setPaymentStatusNotice('');
                  }}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-lg font-bold transition-colors shrink-0 cursor-pointer"
                  title="बंद करा"
                >
                  ✕
                </button>
              </div>

              {/* Primary Verified Razorpay Checkout Section */}
              <div className="p-5 sm:p-6 space-y-5">
                {razorpayError && (
                  <div className="p-3 bg-rose-50 border border-rose-300 text-rose-800 text-xs rounded-xl flex items-center justify-between gap-2 font-semibold">
                    <span>⚠️ {razorpayError}</span>
                    <button
                      type="button"
                      onClick={() => setRazorpayError('')}
                      className="text-slate-500 hover:text-slate-800 font-bold"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {paymentStatusNotice && (
                  <div className="p-3 bg-amber-50 border border-amber-300 text-amber-950 text-xs rounded-xl font-semibold leading-relaxed">
                    ⏳ {paymentStatusNotice}
                  </div>
                )}

                <div className="bg-gradient-to-br from-[#eef4ff] via-white to-[#f0fdf4] border-2 border-[#193568]/20 rounded-2xl p-5 text-center space-y-4 shadow-xs">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 text-[11px] font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>अर्ज जतन झाला आहे — आता सदस्यत्व सक्रिय करण्यासाठी पेमेंट पूर्ण करा</span>
                  </div>

                  <div>
                    <p className="text-sm sm:text-base font-extrabold text-[#09243f] font-serifDevanagari">
                      आजीवन सदस्यत्व ₹100 + वार्षिक वर्गणी ₹120 = एकूण ₹220
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      खालील निळ्या बटनावर क्लिक करून UPI (PhonePe / GPay / Paytm) किंवा Card द्वारे पेमेंट पूर्ण करा. पेमेंट पडताळणी होताच <strong>त्वरित</strong> आपले अधिकृत आय-कार्ड तयार होईल.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleStartRazorpayCheckout(pendingApp)}
                    disabled={isRazorpayLoading}
                    className="w-full sm:w-auto mx-auto px-7 py-3.5 bg-gradient-to-r from-[#193568] to-[#12284c] hover:from-[#11254a] hover:to-[#0a1833] text-white font-extrabold text-sm sm:text-base rounded-xl flex items-center justify-center gap-2.5 shadow-lg active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                  >
                    <span>💳</span>
                    <span>{isRazorpayLoading ? 'Razorpay पेमेंट खिडकी उघडत आहे...' : 'Razorpay ने सुरक्षित ₹220 भरा (तात्काळ आय-कार्ड)'}</span>
                  </button>

                  <p className="text-[11px] text-slate-500 font-medium">
                    🔒 Razorpay कडून पेमेंटची अचूक खात्री (Verify) झाल्याशिवाय सदस्यत्व मंजूर होणार नाही.
                  </p>
                </div>

                {/* Secondary Direct Payment Page + Live Webhook Status Checker */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs text-slate-700 leading-relaxed">
                      <strong className="text-[#09243f] block">जर पॉपअप खिडकी उघडत नसेल तर पर्यायी मार्ग:</strong>
                      पर्यायी पेमेंट लिंकद्वारे पेमेंट केल्यास Razorpay Webhook द्वारे २–५ मिनिटांत अर्ज आपोआप मंजूर होईल. त्यानंतर खालील <em>"पेमेंट स्थिती तपासा"</em> बटनावर क्लिक करा.
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <a
                        href={`https://rzp.io/rzp/Us7q4y7?name=${encodeURIComponent(pendingApp.fullName)}&email=${encodeURIComponent(pendingApp.email)}&phone=${encodeURIComponent(pendingApp.phone)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-2 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-400 font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors"
                      >
                        <span>पर्यायी Razorpay लिंक</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        type="button"
                        disabled={isCheckingPaymentStatus}
                        onClick={async () => {
                          if (!pendingApp) return;
                          setIsCheckingPaymentStatus(true);
                          setPaymentStatusNotice('');
                          try {
                            const remoteApp = onTrackRemote
                              ? await onTrackRemote(pendingApp.id) || await onTrackRemote(pendingApp.phone)
                              : null;
                            if (remoteApp && remoteApp.status === 'approved' && remoteApp.paymentConfirmed) {
                              await handleConfirmPaymentCompleted(pendingApp, {
                                paymentId: remoteApp.paymentRef || remoteApp.razorpayPaymentId || 'webhook_verified',
                                orderId: remoteApp.razorpayOrderId || '',
                                approvedFromServer: remoteApp,
                              });
                            } else {
                              setPaymentStatusNotice(
                                'Razorpay कडून अद्याप पेमेंट कन्फर्मेशन प्राप्त झालेले नाही (स्थिती: Pending). कृपया वरील निळ्या बटनावरून पेमेंट पूर्ण करा; किंवा पैसे कट झाले असल्यास २–५ मिनिटांनंतर पुन्हा तपासा.'
                              );
                            }
                          } finally {
                            setIsCheckingPaymentStatus(false);
                          }
                        }}
                        className="px-3.5 py-2 bg-[#df6b16] hover:bg-[#b34f07] disabled:opacity-60 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isCheckingPaymentStatus ? 'तपासत आहे...' : 'पेमेंट स्थिती तपासा'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Helpline Note */}
                <div className="text-[#856404] font-semibold flex items-center justify-between flex-wrap gap-2 text-xs bg-amber-50 px-3.5 py-2.5 rounded-xl border border-amber-200">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-[#df6b16] shrink-0" />
                    <span>पेमेंट कट होऊनही ५-१० मिनिटांत मंजूर न झाल्यास WhatsApp करा: <strong>ज्ञानेश्वर नंदनवार — 9423484305</strong> (अथवा कॉल: 8208494368)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPaymentModal(false);
                      setPaymentStatusNotice('');
                    }}
                    className="px-3 py-1 bg-white border border-amber-300 hover:bg-amber-100 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    बंद करा
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  UserCheck, ShieldCheck, CheckCircle2, AlertCircle, Phone, Download, Search,
  Upload, Image as ImageIcon, Check, ExternalLink, Mail, CreditCard
} from 'lucide-react';
import {
  ORG_DETAILS,
  MAHARASHTRA_DISTRICTS,
  MembershipApplication,
  OFFICIAL_CADRES,
  TEACHER_PROFESSIONAL_QUALIFICATIONS,
} from '../data/mahasanghData';
import { toEnglishDigits } from '../utils/formatters';
import { fetchOfficials } from '../services/rkFirebaseService';
import { OfficialMember, DISTRICT_TALUKAS_MAP } from '../data/rkMaharashtraData';
import {
  generateMembershipCertificatePdf,
  generateMembershipIdCardPdfBase64
} from '../services/rkPdfGenerator';
import { RegisteredMembersDirectory } from './RegisteredMembersDirectory';
import {
  approveApplicationAtomicInFirestore,
  addApprovedMemberToCache,
  findExistingApplicationInFirestore,
} from '../firebase';
import { initiateRazorpayPayment } from '../utils/razorpay';
import { uploadCompressedPhotoToCloudinaryOrFallback } from '../utils/cloudinary';

interface MembershipTabProps {
  onAddApplication: (
    app: MembershipApplication,
    options?: { skipFirestore?: boolean }
  ) => Promise<void> | void;
  applications: MembershipApplication[];
  onTrackRemote?: (query: string) => Promise<MembershipApplication | null>;
  initialTrackQuery?: string;
}

export const MembershipTab: React.FC<MembershipTabProps> = ({
  onAddApplication,
  applications,
  onTrackRemote,
  initialTrackQuery,
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
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);
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
  const [isSubmittingForm, setIsSubmittingForm] = useState<boolean>(false);
  const [existingPendingMatch, setExistingPendingMatch] = useState<{
    app: MembershipApplication;
    matchedBy: 'phone' | 'email' | 'name';
  } | null>(null);
  const [emailDeliveryStatus, setEmailDeliveryStatus] = useState<'idle' | 'sending' | 'sent' | 'skipped'>('idle');
  const [emailDeliveryAddress, setEmailDeliveryAddress] = useState<string>('');
  const directorySectionRef = useRef<HTMLDivElement | null>(null);
  const trackSectionRef = useRef<HTMLDivElement | null>(null);
  const formSectionRef = useRef<HTMLDivElement | null>(null);
  const [activeJumpTab, setActiveJumpTab] = useState<'directory' | 'track' | 'register'>('directory');
  const initialTrackRanRef = useRef<boolean>(false);

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

  // Auto-run lookup if landed via ?track=... link (e.g. from approval email)
  useEffect(() => {
    if (!initialTrackQuery || initialTrackRanRef.current) return;
    initialTrackRanRef.current = true;
    const clean = toEnglishDigits(initialTrackQuery.trim());
    if (!clean) return;
    setSearchQuery(clean);
    runTrackLookup(clean).then(() => {
      setTimeout(() => {
        trackSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTrackQuery]);

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

  // Handle Photo selection: compress (<30KB) and upload to Cloudinary with automatic Base64 fallback
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoError('कृपया वैध फोटो फाईल (JPG किंवा PNG) निवडा.');
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const result = await uploadCompressedPhotoToCloudinaryOrFallback(file, 360, 440, 0.72);
      setPhotoDataUrl(result.urlOrBase64);
      setPhotoSizeKb(result.sizeKb);
    } catch (err: any) {
      setPhotoError(err?.message || 'फोटो प्रोसेस करताना त्रुटी आली. कृपया पुन्हा प्रयत्न करा.');
    } finally {
      setIsUploadingPhoto(false);
    }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingForm) return;
    setFormAlert('');
    setExistingPendingMatch(null);

    if (!salutation || !fullName.trim() || !phone.trim() || !email.trim() || !address.trim() || !education.trim() || !professionalQualification.trim() || !professional.trim() || !district || !taluka || (taluka && !centerName.trim())) {
      setFormAlert('कृपया सर्व आवश्यक (*) माहिती (ई-मेल, जिल्हा, तालुका व कार्यरत केंद्राच्या नावासह) अचूकपणे निवडा व भरा.');
      window.scrollTo({ top: 380, behavior: 'smooth' });
      return;
    }

    const cleanPhone = toEnglishDigits(phone.trim()).replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      setFormAlert('कृपया 10 अंकी वैध मोबाईल नंबर प्रविष्ट करा.');
      window.scrollTo({ top: 380, behavior: 'smooth' });
      return;
    }

    const normalizedName = fullName.trim().replace(/\s+/g, ' ');
    const normalizedNameLower = normalizedName.toLowerCase();
    const userEnteredEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEnteredEmail) || /^\d{10}@mahasangh\.in$/i.test(userEnteredEmail)) {
      setFormAlert('कृपया वैध ई-मेल पत्ता (Email) प्रविष्ट करा — आपले अधिकृत आय-कार्ड ई-मेलवर पाठवले जाईल.');
      window.scrollTo({ top: 380, behavior: 'smooth' });
      return;
    }
    const cleanEmail = userEnteredEmail;

    setIsSubmittingForm(true);
    try {
      // 1. Check duplicate in local cache first (phone, email, or exact full name)
      let matchedApp: MembershipApplication | null = null;
      let matchedBy: 'phone' | 'email' | 'name' = 'phone';

      const localPhoneMatch = applications.find(
        (a) => a.phone && a.phone.replace(/\D/g, '').slice(-10) === cleanPhone
      );
      if (localPhoneMatch) {
        matchedApp = localPhoneMatch;
        matchedBy = 'phone';
      }

      if (!matchedApp && userEnteredEmail && !userEnteredEmail.endsWith('@mahasangh.in')) {
        const localEmailMatch = applications.find(
          (a) => a.email && a.email.trim().toLowerCase() === userEnteredEmail
        );
        if (localEmailMatch) {
          matchedApp = localEmailMatch;
          matchedBy = 'email';
        }
      }

      if (!matchedApp && normalizedNameLower.length >= 3) {
        const localNameMatch = applications.find(
          (a) =>
            a.fullName &&
            a.fullName.trim().replace(/\s+/g, ' ').toLowerCase() === normalizedNameLower
        );
        if (localNameMatch) {
          matchedApp = localNameMatch;
          matchedBy = 'name';
        }
      }

      // 2. Always verify against live Firestore (catches Pending applications not in public cache!)
      const remoteDuplicate = await findExistingApplicationInFirestore({
        phone: cleanPhone,
        email: userEnteredEmail,
        fullName: normalizedName,
      });
      if (remoteDuplicate) {
        // Prefer approved over pending, or live Firestore record if not found locally
        if (!matchedApp || remoteDuplicate.app.status === 'approved') {
          matchedApp = remoteDuplicate.app;
          matchedBy = remoteDuplicate.matchedBy;
        }
      }

      if (matchedApp) {
        const matchLabel =
          matchedBy === 'phone'
            ? `हा मोबाईल नंबर (${cleanPhone})`
            : matchedBy === 'email'
              ? `हा ई-मेल (${userEnteredEmail})`
              : `हे नाव (${normalizedName})`;

        if (matchedApp.status === 'approved') {
          setFormAlert(
            `${matchLabel} वापरून आपला फॉर्म यापूर्वीच भरलेला असून सदस्यत्व मंजूर आहे (सदस्य क्र.: ${matchedApp.memberNumber || ''}). नवीन फॉर्म भरण्याची आवश्यकता नाही — आपण वरील 'अर्जाची स्थिती तपासा' मधून आपले आय-कार्ड डाऊनलोड करू शकता.`
          );
          window.scrollTo({ top: 380, behavior: 'smooth' });
          return;
        } else {
          // Pending application already exists: block duplicate creation and let user pay for existing app
          setExistingPendingMatch({ app: matchedApp, matchedBy });
          setFormAlert(
            `${matchLabel} वापरून आपला फॉर्म यापूर्वीच भरलेला आहे (अर्ज संदर्भ क्र.: ${matchedApp.applicationNumber}, नाव: ${matchedApp.fullName}), परंतु ₹220 पेमेंट अद्याप पूर्ण झालेले नाही. कृपया नवीन फॉर्म न भरता या अर्जाचे पेमेंट पूर्ण करा.`
          );
          setPendingApp(matchedApp);
          setShowPaymentModal(true);
          return;
        }
      }

      if (isUploadingPhoto) {
        setFormAlert('फोटो अपलोड होत आहे, कृपया २ सेकंद थांबा आणि पुन्हा सबमिट करा.');
        window.scrollTo({ top: 420, behavior: 'smooth' });
        return;
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
        fullName: normalizedName,
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

      // Await Firestore save BEFORE opening Razorpay payment modal so record is guaranteed saved
      await onAddApplication(newApp);
      setPendingApp(newApp);
      setShowPaymentModal(true);
    } finally {
      setIsSubmittingForm(false);
    }
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
      // Server verified signature; run single atomic Firestore transaction (idempotent if Webhook already approved)
      const { status: _ignoredStatus, memberNumber: _ignoredNo, ...profileFields } = appToApprove;
      const atomicResult = await approveApplicationAtomicInFirestore({
        appId: appToApprove.id,
        district: appToApprove.district,
        knownRecords: applications,
        extraUpdates: {
          ...profileFields,
          paymentConfirmed: true,
          paymentRef: verifiedPayment.paymentId,
          razorpayPaymentId: verifiedPayment.paymentId,
          razorpayOrderId: verifiedPayment.orderId || '',
        },
      });
      finalApp = {
        ...appToApprove,
        ...atomicResult.application,
        status: 'approved',
        memberNumber: atomicResult.memberNumber,
        approvedAt: atomicResult.application.approvedAt || nowIso,
        paymentConfirmed: true,
        paymentRef: atomicResult.application.paymentRef || verifiedPayment.paymentId,
      };
    }

    await onAddApplication(finalApp, { skipFirestore: true });
    addApprovedMemberToCache(finalApp);
    setSubmittedApp(finalApp);
    setPendingApp(null);
    setShowPaymentModal(false);
    setPaymentStatusNotice('');

    // If searchResult was pending, update searchResult to approved so user immediately sees approved card
    if (searchResult && typeof searchResult !== 'string' && searchResult.id === appToApprove.id) {
      setSearchResult(finalApp);
    }

    // Automatically email the official CR80 PDF ID card to the member (non-blocking)
    const memberEmail = (finalApp.email || '').trim();
    const hasRealEmail =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memberEmail) && !/^\d{10}@mahasangh\.in$/i.test(memberEmail);

    if (hasRealEmail && !finalApp.idCardEmailSent) {
      setEmailDeliveryAddress(memberEmail);
      setEmailDeliveryStatus('sending');
      (async () => {
        try {
          const { base64, fileName } = await generateMembershipIdCardPdfBase64(finalApp);
          const resp = await fetch('/api/email/send-id-card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              applicationId: finalApp.id,
              toEmail: memberEmail,
              fullName: finalApp.fullName,
              salutation: finalApp.salutation,
              memberNumber: finalApp.memberNumber,
              applicationNumber: finalApp.applicationNumber,
              district: finalApp.district,
              professional: finalApp.professional,
              pdfBase64: base64,
              fileName,
            }),
          });
          const data = await resp.json().catch(() => ({}));
          if (resp.ok && (data.sent || data.alreadySent)) {
            setEmailDeliveryStatus('sent');
            setSubmittedApp((prev) =>
              prev && prev.id === finalApp.id ? { ...prev, idCardEmailSent: true } : prev
            );
          } else {
            setEmailDeliveryStatus('skipped');
          }
        } catch (emailErr) {
          console.warn('Auto ID Card email delivery notice:', emailErr);
          setEmailDeliveryStatus('skipped');
        }
      })();
    } else if (finalApp.idCardEmailSent && hasRealEmail) {
      setEmailDeliveryAddress(memberEmail);
      setEmailDeliveryStatus('sent');
    } else {
      setEmailDeliveryStatus('idle');
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

  const runTrackLookup = async (rawInput: string) => {
    const rawTrimmed = toEnglishDigits(rawInput.trim());
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

  const handleTrackStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    await runTrackLookup(searchQuery);
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
    <div className="bg-[#f5f7fa] py-6 sm:py-8">
      <div className="max-w-[1000px] mx-auto px-4">
        {/* Institutional Page Masthead & Standard Portal Navigation Tabs */}
        <div className="bg-white border border-slate-300 border-t-4 border-t-[#193568] rounded-md mb-6 overflow-hidden">
          <div className="px-5 py-5 sm:px-6 sm:py-6">
            <div className="text-xs sm:text-sm font-semibold text-slate-600 mb-1">
              {ORG_DETAILS.name} · आजीवन सभासद कक्ष
            </div>
            <h1 className="font-serifDevanagari text-2xl sm:text-3xl md:text-4xl font-bold text-[#193568] leading-snug">
              सदस्यत्व नोंदणी व अधिकृत सभासद यादी
            </h1>
            <p className="text-base text-slate-600 mt-2 leading-relaxed max-w-3xl">
              नोंदणीकृत सभासद यादी, अर्जाची स्थिती व आय-कार्ड डाऊनलोड आणि नवीन आजीवन सदस्यत्व अर्जाची अधिकृत सुविधा.
            </p>
          </div>

          {/* Standard Horizontal Portal Section Tabs */}
          <div className="border-t border-slate-200 bg-slate-50 px-2 sm:px-6 flex items-center gap-0.5 sm:gap-1 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => {
                setActiveJumpTab('directory');
                directorySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`px-2.5 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeJumpTab === 'directory'
                  ? 'border-[#193568] text-[#193568] bg-white'
                  : 'border-transparent text-slate-600 hover:text-[#193568]'
              }`}
            >
              १. सदस्य यादी
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveJumpTab('track');
                trackSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`px-2.5 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeJumpTab === 'track'
                  ? 'border-[#193568] text-[#193568] bg-white'
                  : 'border-transparent text-slate-600 hover:text-[#193568]'
              }`}
            >
              २. अर्जाची स्थिती
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveJumpTab('register');
                formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`px-2.5 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeJumpTab === 'register'
                  ? 'border-[#193568] text-[#193568] bg-white'
                  : 'border-transparent text-slate-600 hover:text-[#193568]'
              }`}
            >
              ३. नवीन सदस्यत्व अर्ज
            </button>
          </div>
        </div>

        {/* 1. अधिकृत नोंदणीकृत सदस्य यादी */}
        <div ref={directorySectionRef}>
          <RegisteredMembersDirectory applications={applications} />
        </div>

        {/* 2. अर्जाची स्थिती तपासा */}
        <div ref={trackSectionRef} className="bg-white rounded-md border border-slate-300 mb-8 overflow-hidden">
          <div className="bg-[#f8fafc] border-b border-slate-200 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Search className="w-5 h-5 text-[#193568] shrink-0" />
              <h3 className="font-serifDevanagari font-bold text-lg sm:text-xl text-[#193568] leading-tight">
                अर्जाची स्थिती तपासा व आय-कार्ड मिळवा
              </h3>
            </div>
            <span className="text-xs sm:text-sm font-medium text-slate-500">
              मोबाईल क्र. · सदस्य क्र. · अर्ज क्र.
            </span>
          </div>

          <div className="p-5 sm:p-6">
            <div className="flex flex-col gap-3">
              <p className="text-base text-slate-700 font-medium leading-relaxed">
                आपला १० अंकी मोबाईल नंबर, सदस्य क्रमांक किंवा अर्ज संदर्भ क्रमांक खालील रकान्यात प्रविष्ट करा:
              </p>

              <form onSubmit={handleTrackStatus} className="flex flex-col sm:flex-row gap-2.5 w-full">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="उदा. 9876543210 किंवा MS/2026/..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-sm sm:text-base text-slate-900 bg-white border border-slate-300 focus:border-[#193568] rounded-md pl-10 pr-4 py-2.5 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isTrackingStatus}
                  className="bg-[#193568] hover:bg-[#11254a] disabled:opacity-70 text-white text-sm sm:text-base font-semibold px-6 py-2.5 rounded-md shrink-0 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Search className="w-4 h-4" />
                  <span>{isTrackingStatus ? 'तपासत आहे...' : 'स्थिती तपासा'}</span>
                </button>
              </form>
            </div>

          {/* Search Result Card */}
          {searchResult && searchResult !== 'not_found' && (
            <div className={`mt-4 p-4 sm:p-5 rounded-md border ${
              searchResult.status === 'approved'
                ? 'bg-emerald-50/40 border-emerald-300'
                : 'bg-amber-50/50 border-amber-300'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  {searchResult.photo ? (
                    <img
                      src={searchResult.photo}
                      alt={searchResult.fullName}
                      className="w-12 h-14 object-cover rounded border border-slate-300 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-14 bg-slate-100 rounded border border-slate-300 flex items-center justify-center text-slate-400 shrink-0">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                  )}
                  <div>
                    <span className="font-serifDevanagari font-bold text-[#193568] text-lg sm:text-xl block">
                      {searchResult.salutation} {searchResult.fullName}
                    </span>
                    <span className="text-sm text-slate-600">
                      जिल्हा: <strong>{searchResult.district}</strong>
                      {searchResult.professional && ` · संवर्ग: ${searchResult.professional}`}
                    </span>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-1 rounded text-xs sm:text-sm font-semibold self-start sm:self-auto border ${
                    searchResult.status === 'approved'
                      ? 'bg-emerald-700 text-white border-emerald-800'
                      : 'bg-amber-100 text-amber-900 border-amber-300'
                  }`}
                >
                  {searchResult.status === 'approved' ? 'मंजूर (Approved)' : 'प्रलंबित (Pending)'}
                </span>
              </div>

              {/* Approved View with Direct PDF Download */}
              {searchResult.status === 'approved' ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800 text-sm sm:text-base font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>अभिनंदन, आपले आजीवन सदस्यत्व मंजूर करण्यात आले आहे.</span>
                  </div>

                  <div className="bg-white p-3.5 rounded-md border border-slate-300 text-sm text-slate-700 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-slate-500 block text-xs sm:text-sm">अधिकृत आजीवन सदस्य क्रमांक:</span>
                      <strong className="text-base sm:text-lg text-[#193568] font-mono tabular-nums">
                        {searchResult.memberNumber || 'MS/2026/MAHA/0001'}
                      </strong>
                    </div>

                    {searchResult.isOfficial && searchResult.officialPost && (
                      <div>
                        <span className="text-slate-500 block text-xs sm:text-sm">संघटनेतील पद:</span>
                        <strong className="text-sm sm:text-base text-slate-900 font-bold">
                          {searchResult.officialPost} {searchResult.officialTaluka ? `(${searchResult.officialTaluka})` : ''}
                        </strong>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDownloadApprovedCertificate(searchResult)}
                      disabled={isDownloadingCert}
                      className="bg-[#df6b16] hover:bg-[#c2590d] text-white font-semibold text-sm px-4 py-2.5 rounded-md flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <Download className={`w-4 h-4 ${isDownloadingCert ? 'animate-spin' : ''}`} />
                      {isDownloadingCert ? 'आय-कार्ड तयार होत आहे...' : 'अधिकृत आय-कार्ड डाऊनलोड (PDF)'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="text-sm sm:text-base text-amber-950 font-medium bg-amber-50 p-3 rounded-md border border-amber-200 leading-relaxed">
                    आपला अर्ज जतन आहे, परंतु <strong>₹220</strong> सदस्यत्व शुल्क अद्याप प्रलंबित आहे. पेमेंट पूर्ण करताच आपले अधिकृत आय-कार्ड उपलब्ध होईल.
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
                      className="bg-[#193568] hover:bg-[#11254a] disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>{isRazorpayLoading ? 'पेमेंट खिडकी उघडत आहे...' : 'Razorpay ने ₹220 भरा'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingApp(searchResult as MembershipApplication);
                        setShowPaymentModal(true);
                      }}
                      className="bg-white hover:bg-slate-50 text-[#193568] border border-slate-300 text-sm font-semibold px-4 py-2.5 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      <span>पेमेंट पर्याय व स्थिती तपासा</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {searchResult === 'not_found' && (
            <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium rounded-md flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>कोणताही अर्ज आढळला नाही. कृपया अचूक १० अंकी मोबाईल नंबर, सदस्य क्रमांक किंवा अर्ज क्रमांक तपासून पुन्हा प्रयत्न करा.</span>
            </div>
          )}
          </div>
        </div>

        {/* 3. नवीन सदस्यत्व नोंदणी अर्ज Header */}
        <div ref={formSectionRef} className="bg-white border border-slate-300 border-t-4 border-t-[#df6b16] rounded-md p-4 sm:p-5 mb-5">
          <h2 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#193568]">
            नवीन आजीवन सदस्यत्व नोंदणी अर्ज
          </h2>
          <p className="text-base text-slate-600 mt-1.5 leading-relaxed">
            महासंघाचे अधिकृत आजीवन सभासदत्व मिळवण्यासाठी खालील सर्व आवश्यक माहिती अचूक भरा.
          </p>
        </div>

        {/* Main Application Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {formAlert && (
            <div className="p-3.5 bg-rose-50 border border-rose-300 text-rose-800 text-sm rounded-md flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formAlert}</span>
            </div>
          )}

          {/* Section 1: Personal Details & Passport Photo Upload with Live Preview */}
          <div className="bg-white rounded-md border border-slate-300 p-5 sm:p-6 space-y-4">
            <h2 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#193568] pb-2.5 border-b border-slate-200">
              १. वैयक्तिक माहिती व पासपोर्ट फोटो
            </h2>

            {/* Marathi Language Notice */}
            <div className="bg-amber-50/70 border border-amber-300 px-3.5 py-2.5 rounded-md text-sm sm:text-base text-slate-800 leading-relaxed">
              <strong>सूचना:</strong> अर्जातील वैयक्तिक माहिती (नाव, पत्ता, केंद्राचे नाव व छंद) <strong>फक्त मराठी भाषेतच</strong> भरावी.
            </div>

            {/* Passport Photo Upload & Live Preview Section */}
            <div className="bg-slate-50 border border-slate-200 rounded-md p-4 sm:p-5">
              <label className="font-bold text-[#193568] block mb-1 text-sm sm:text-base">
                पासपोर्ट फोटो अपलोड करा <span className="text-[#df6b16]">*</span>
              </label>
              <p className="text-sm text-slate-600 mb-3 leading-relaxed">
                अधिकृत ओळखपत्रासाठी रंगीत पासपोर्ट फोटो (JPG / PNG) निवडा; निवडताच उजवीकडे पूर्वावलोकन दिसेल.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* File Upload Box */}
                <div className="flex-1 w-full">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border border-dashed border-slate-400 hover:border-[#193568] bg-white rounded-md p-5 text-center cursor-pointer transition-colors hover:bg-slate-50"
                  >
                    <Upload className="w-7 h-7 text-[#193568] mx-auto mb-1.5" />
                    <p className="text-sm sm:text-base font-semibold text-[#193568]">
                      फोटो फाईल निवडण्यासाठी येथे क्लिक करा
                    </p>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                      फोटो आकार स्वयंचलित ऑप्टिमाइझ करून सुरक्षित जतन केला जाईल
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoSelect}
                      className="hidden"
                    />
                  </div>

                  {isUploadingPhoto && (
                    <p className="text-sm text-[#193568] mt-2 font-semibold">
                      फोटो प्रक्रिया सुरू आहे...
                    </p>
                  )}
                  {photoError && (
                    <p className="text-sm text-rose-700 mt-2 font-semibold">
                      {photoError}
                    </p>
                  )}
                  {photoSizeKb > 0 && !photoError && !isUploadingPhoto && (
                    <p className="text-sm text-emerald-700 mt-2 font-semibold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      फोटो जोडला गेला (आकार: {photoSizeKb} KB)
                    </p>
                  )}
                </div>

                {/* Live Preview Box on the Right */}
                <div className="shrink-0 flex flex-col items-center">
                  <div className="w-32 h-40 bg-white border border-slate-300 rounded-md overflow-hidden flex items-center justify-center relative">
                    {photoDataUrl ? (
                      <img
                        src={photoDataUrl}
                        alt="Passport Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center p-2 text-slate-400">
                        <ImageIcon className="w-7 h-7 mx-auto mb-1 opacity-50" />
                        <span className="text-xs sm:text-sm block leading-tight font-medium">
                          पासपोर्ट फोटो पूर्वावलोकन
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-slate-600 mt-1.5">
                    फोटो पूर्वावलोकन
                  </span>
                </div>
              </div>
            </div>

            {/* Personal Details Inputs with Strict Marathi Guidance */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm sm:text-base pt-2">
              <div>
                <label className="font-bold text-[#172033] block mb-1">
                  पद / आदरार्थी (Salutation) <span className="text-[#df6b16]">*</span>
                </label>
                <select
                  value={salutation}
                  onChange={(e) => setSalutation(e.target.value)}
                  required
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-md focus:outline-none focus:border-[#193568]"
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
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] focus:border-[#193568] rounded-md focus:outline-none transition-colors"
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
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-md focus:outline-none focus:border-[#193568]"
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
                  placeholder="उदा. amol@gmail.com (आय-कार्ड ई-मेलवर मिळेल)"
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-md focus:outline-none focus:border-[#193568]"
                />
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  पेमेंट पूर्ण झाल्यावर आपले अधिकृत PDF आय-कार्ड थेट या ई-मेलवर पाठवले जाईल.
                </p>
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
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-md focus:outline-none focus:border-[#193568]"
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
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-md focus:outline-none focus:border-[#193568] disabled:bg-slate-100 disabled:cursor-not-allowed font-medium text-[#172033]"
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
                <div className="sm:col-span-2 bg-slate-50 p-4 rounded-md border border-slate-300 space-y-1.5">
                  <label className="font-bold text-[#193568] block text-sm sm:text-base">
                    कार्यरत केंद्राचे नाव लिहा <span className="text-[#df6b16]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={centerName}
                    onChange={(e) => setCenterName(e.target.value)}
                    placeholder="उदा. कें. शा. उंबर्डा बाजार / केंद्र - मालेगाव"
                    className="w-full p-2.5 bg-white border border-slate-300 focus:border-[#193568] rounded-md focus:outline-none text-sm sm:text-base font-semibold text-slate-900"
                  />
                  <p className="text-xs sm:text-sm text-slate-600">
                    आपण ज्या बीट / शिक्षण केंद्रामध्ये कार्यरत आहात त्या केंद्राचे नाव मराठीत प्रविष्ट करा.
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
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-md focus:outline-none focus:border-[#193568]"
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
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] focus:border-[#193568] rounded-md focus:outline-none transition-colors"
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
                  className="w-full p-2.5 bg-white border border-[#c8d2e2] focus:border-[#193568] rounded-md focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Educational & Professional Qualifications */}
          <div className="bg-white rounded-md border border-slate-300 p-5 sm:p-6 space-y-4">
            <h2 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#193568] pb-2.5 border-b border-slate-200">
              २. शैक्षणिक व व्यावसायिक माहिती
            </h2>

            <div className="space-y-4 text-sm sm:text-base">
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
                    className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-md focus:outline-none focus:border-[#193568]"
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
                    className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-md focus:outline-none focus:border-[#193568]"
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
                    className="w-full p-2.5 bg-white border border-[#c8d2e2] rounded-md focus:outline-none focus:border-[#193568]"
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

          {/* Section 3: Membership Fee & Consolidated Official Support Notice */}
          <div className="bg-white rounded-md border border-slate-300 p-5 sm:p-6 space-y-4">
            <h2 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#193568] pb-2.5 border-b border-slate-200">
              ३. सदस्यत्व शुल्क तपशील व पेमेंट सूचना
            </h2>

            {/* Official Fee Structure Table */}
            <div className="border border-slate-300 rounded-md overflow-hidden">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-slate-100 text-[#193568] border-b border-slate-300">
                  <tr>
                    <th className="py-2.5 px-4 font-bold">शुल्काचा तपशील</th>
                    <th className="py-2.5 px-4 font-bold text-right w-36">रक्कम (INR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800">
                  <tr>
                    <td className="py-2.5 px-4">आजीवन सदस्यत्व शुल्क (एकदाच देय)</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">₹ 100.00</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4">वार्षिक वर्गणी (प्रति वर्ष)</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">₹ 120.00</td>
                  </tr>
                  <tr className="bg-slate-50 font-bold text-[#193568]">
                    <td className="py-2.5 px-4">एकूण ऑनलाईन देय रक्कम</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-base">₹ 220.00</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-md px-4 py-3 text-sm sm:text-base text-slate-700 leading-relaxed flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#193568] shrink-0 mt-1" />
              <span>
                अर्ज सबमिट केल्यानंतर सुरक्षित <strong>Razorpay Payment Window</strong> उघडेल. त्याद्वारे UPI (PhonePe / GPay / Paytm) किंवा डेबिट/क्रेडिट कार्डने ₹220 शुल्क भरता येईल.
              </span>
            </div>

            {/* Single Consolidated Support & Instruction Notice (Nandanwar Sir cited ONLY ONCE) */}
            <div className="bg-amber-50/70 border border-amber-300 rounded-md p-4 text-sm sm:text-base text-slate-800 space-y-2 leading-relaxed">
              <div className="font-bold text-base sm:text-lg text-[#193568] flex items-center gap-1.5">
                <Phone className="w-4 h-4 text-[#df6b16] shrink-0" />
                <span>महत्त्वाची सूचना व पेमेंट साहाय्य</span>
              </div>
              <ol className="list-decimal pl-5 space-y-1.5 text-slate-700">
                <li>
                  पेमेंट पूर्ण झाल्यानंतर आपले अधिकृत PDF आय-कार्ड तयार होण्यास सुमारे <strong>५ मिनिटे</strong> लागू शकतात; त्यानंतर वरील <strong>"अर्जाची स्थिती तपासा"</strong> विभागातून आय-कार्ड डाऊनलोड करता येईल.
                </li>
                <li>
                  पेमेंट कट होऊनही १० मिनिटांनंतर अर्ज मंजूर न झाल्यास अथवा पेमेंट पूर्ण करण्यासंदर्भात काही तांत्रिक अडचण असल्यास{' '}
                  <strong>श्री. ज्ञानेश्वर नंदनवार सर</strong> (मोबाईल / WhatsApp:{' '}
                  <a
                    href="https://wa.me/919423484305"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono font-bold text-[#193568] underline hover:text-[#df6b16]"
                  >
                    9423484305
                  </a>{' '}
                  / <span className="font-mono font-bold text-[#193568]">8208494368</span>) यांना पेमेंटचा स्क्रीनशॉट शेअर करावा.
                </li>
              </ol>
            </div>
          </div>

          {/* Section 4: Mandatory Applicant Declaration */}
          <div className={`rounded-md border p-4 sm:p-5 transition-colors ${
            declarationAccepted
              ? 'bg-emerald-50/40 border-emerald-400'
              : 'bg-white border-slate-300'
          }`}>
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={declarationAccepted}
                onChange={(e) => {
                  setDeclarationAccepted(e.target.checked);
                  if (formAlert) setFormAlert('');
                }}
                className="w-4 h-4 mt-1 text-[#193568] rounded border-slate-400 focus:ring-[#193568] shrink-0 cursor-pointer"
              />
              <div className="text-sm sm:text-base text-slate-800 leading-relaxed">
                <strong className="block text-base sm:text-lg text-[#193568] font-serifDevanagari mb-1">
                  ४. सदस्यत्व स्वयंघोषणापत्र <span className="text-rose-600">*</span>
                </strong>
                "मी याद्वारे घोषित करतो/करते की, मी शिक्षण विभागातील कार्यरत अधिकारी / केंद्रप्रमुख असून महासंघाच्या सदस्यत्वासाठी पात्र आहे. माझ्याद्वारे अर्जात भरलेली सर्व वैयक्तिक व कार्यालयीन माहिती पूर्णपणे सत्य आणि अचूक आहे. मी संघटनेचे नियम व उद्दिष्टे वाचली असून मला महासंघाच्या सर्व अटी व शर्ती पूर्णपणे मान्य आहेत."
              </div>
            </label>
          </div>

          {/* Existing Pending Form Recovery Banner */}
          {existingPendingMatch && (
            <div className="bg-amber-50 border border-amber-400 rounded-md p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="text-sm sm:text-base text-slate-800 space-y-1">
                <div className="font-bold text-base sm:text-lg text-[#193568] flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-[#df6b16] shrink-0" />
                  <span>आपला अर्ज यापूर्वीच जतन आहे (नवीन फॉर्म भरण्याची आवश्यकता नाही)</span>
                </div>
                <p className="leading-relaxed">
                  अर्जदार: <strong>{existingPendingMatch.app.salutation} {existingPendingMatch.app.fullName}</strong> · संदर्भ क्र.:{' '}
                  <strong className="font-mono">{existingPendingMatch.app.applicationNumber}</strong> · मोबाईल: <strong>{existingPendingMatch.app.phone}</strong>. कृपया या अर्जाचे ₹220 पेमेंट पूर्ण करा.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingApp(existingPendingMatch.app);
                  setShowPaymentModal(true);
                }}
                className="w-full sm:w-auto bg-[#193568] hover:bg-[#11254a] text-white font-semibold px-5 py-2.5 rounded-md text-sm sm:text-base flex items-center justify-center gap-2 shrink-0 cursor-pointer"
              >
                <CreditCard className="w-4 h-4" />
                <span>या अर्जाचे पेमेंट पूर्ण करा (₹220)</span>
              </button>
            </div>
          )}

          {/* Submit Button Section */}
          <div className="bg-white rounded-md border border-slate-300 p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm sm:text-base text-slate-600 max-w-md space-y-1.5 leading-relaxed">
              {formAlert && (
                <div className="text-sm font-semibold text-rose-700 bg-rose-50 p-2.5 rounded-md border border-rose-200 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formAlert}</span>
                </div>
              )}
              <p>
                सर्व माहिती तपासून वरील घोषणापत्रावर टिक करा. अर्ज जतन केल्यानंतर सुरक्षित पेमेंट खिडकी उघडेल.
              </p>
            </div>
            <button
              type="submit"
              disabled={isSubmittingForm}
              className="w-full sm:w-auto bg-[#df6b16] hover:bg-[#c2590d] disabled:opacity-65 text-white font-semibold px-7 py-3 rounded-md text-base transition-colors flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              <UserCheck className="w-4 h-4" />
              <span>{isSubmittingForm ? 'अर्ज जतन होत आहे...' : 'अर्ज जतन करा व ₹220 पेमेंट करा'}</span>
            </button>
          </div>
        </form>

        {/* Success Banner After Submission */}
        {submittedApp && (
          <div ref={submittedAppRef} className="mt-8 bg-white border border-emerald-400 border-t-4 border-t-emerald-700 text-slate-800 rounded-md p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-7 h-7 text-emerald-700 shrink-0 mt-0.5" />
              <div className="space-y-3 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                  <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#193568]">
                    आपले आजीवन सदस्यत्व यशस्वीरित्या मंजूर झाले आहे
                  </h3>
                  <span className="px-2.5 py-1 rounded bg-emerald-700 text-white font-semibold text-xs sm:text-sm">
                    मंजूर (Approved)
                  </span>
                </div>

                <div className="bg-slate-50 p-4 rounded-md border border-slate-200 space-y-2.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-slate-500 block text-xs sm:text-sm">अधिकृत आजीवन सदस्य क्रमांक:</span>
                      <strong className="text-base sm:text-lg text-[#193568] font-mono tabular-nums font-bold">
                        {submittedApp.memberNumber || 'MS/2026/MAHA/0001'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-xs sm:text-sm">अर्ज संदर्भ क्रमांक:</span>
                      <strong className="text-sm sm:text-base text-slate-800 font-mono">
                        {submittedApp.applicationNumber}
                      </strong>
                    </div>
                  </div>

                  <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
                    {ORG_DETAILS.name} मध्ये आपले स्वागत आहे. आपले अधिकृत सदस्यत्व ओळखपत्र (ID Card) डाऊनलोडसाठी तयार आहे.
                  </p>

                  {emailDeliveryStatus === 'sending' && (
                    <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-md px-3 py-2 text-sm font-medium flex items-center gap-2">
                      <Mail className="w-4 h-4 text-blue-700 shrink-0" />
                      <span>आपले PDF आय-कार्ड <strong>{emailDeliveryAddress}</strong> या ई-मेलवर पाठवले जात आहे...</span>
                    </div>
                  )}

                  {emailDeliveryStatus === 'sent' && (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-md px-3 py-2 text-sm font-medium flex items-center gap-2">
                      <Mail className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>आपले अधिकृत PDF आय-कार्ड <strong>{emailDeliveryAddress}</strong> या ई-मेलवर पाठवले आहे (कृपया Inbox / Spam तपासा).</span>
                    </div>
                  )}

                  <div className="pt-1 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleDownloadApprovedCertificate(submittedApp)}
                      disabled={isDownloadingCert}
                      className="bg-[#df6b16] hover:bg-[#c2590d] text-white font-semibold text-sm px-5 py-2.5 rounded-md flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <Download className={`w-4 h-4 ${isDownloadingCert ? 'animate-spin' : ''}`} />
                      {isDownloadingCert ? 'आय-कार्ड तयार होत आहे...' : 'अधिकृत आय-कार्ड डाऊनलोड (PDF)'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSubmittedApp(null);
                        window.scrollTo({ top: 380, behavior: 'smooth' });
                      }}
                      className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-sm font-semibold px-4 py-2.5 rounded-md transition-colors cursor-pointer"
                    >
                      नवीन अर्ज भरा
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Razorpay Online Payment Modal Popup (Standard Institutional Checkout) */}
        {showPaymentModal && pendingApp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/75">
            <div className="bg-white rounded-md shadow-xl border border-slate-300 w-full max-w-xl max-h-[95vh] flex flex-col overflow-y-auto relative">
              {/* Modal Header */}
              <div className="sticky top-0 z-30 bg-[#193568] text-white px-5 py-4 flex items-center justify-between shrink-0 border-b-2 border-[#efb24b]">
                <div>
                  <h3 className="font-serifDevanagari font-bold text-lg sm:text-xl leading-tight text-white">
                    अधिकृत सदस्यत्व शुल्क पेमेंट — ₹220
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-200 mt-0.5">
                    {ORG_DETAILS.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowPaymentModal(false);
                    setPaymentStatusNotice('');
                  }}
                  className="px-2.5 py-1 rounded border border-white/25 hover:bg-white/10 text-white text-sm font-semibold transition-colors shrink-0 cursor-pointer"
                  title="बंद करा"
                  aria-label="पेमेंट खिडकी बंद करा"
                >
                  ✕
                </button>
              </div>

              {/* Checkout Summary & Payment Action */}
              <div className="p-5 sm:p-6 space-y-4">
                {razorpayError && (
                  <div className="p-3 bg-rose-50 border border-rose-300 text-rose-800 text-sm rounded-md flex items-center justify-between gap-2 font-medium">
                    <span>{razorpayError}</span>
                    <button
                      type="button"
                      onClick={() => setRazorpayError('')}
                      className="text-slate-600 hover:text-slate-900 font-bold"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {paymentStatusNotice && (
                  <div className="p-3 bg-amber-50 border border-amber-300 text-amber-950 text-sm rounded-md font-medium leading-relaxed">
                    {paymentStatusNotice}
                  </div>
                )}

                {existingPendingMatch && existingPendingMatch.app.id === pendingApp.id && (
                  <div className="p-3 bg-amber-50 border border-amber-300 text-amber-950 text-sm rounded-md font-medium leading-relaxed">
                    <strong>टीप:</strong> आपला अर्ज यापूर्वीच जतन केलेला आहे (संदर्भ क्र.: <span className="font-mono font-bold">{pendingApp.applicationNumber}</span>). नवीन फॉर्म न भरता या अर्जाचे ₹220 शुल्क पूर्ण करा.
                  </div>
                )}

                {/* Order Summary Table */}
                <div className="border border-slate-300 rounded-md overflow-hidden text-sm">
                  <div className="bg-slate-100 px-4 py-2 border-b border-slate-300 font-bold text-[#193568]">
                    अर्ज व देय रकमेचा तपशील
                  </div>
                  <div className="divide-y divide-slate-200 bg-white">
                    <div className="px-4 py-2 flex justify-between gap-2">
                      <span className="text-slate-600">अर्जदाराचे नाव</span>
                      <span className="font-bold text-slate-900 text-right">{pendingApp.salutation} {pendingApp.fullName}</span>
                    </div>
                    <div className="px-4 py-2 flex justify-between gap-2">
                      <span className="text-slate-600">अर्ज संदर्भ क्रमांक</span>
                      <span className="font-mono font-semibold text-slate-900">{pendingApp.applicationNumber}</span>
                    </div>
                    <div className="px-4 py-2 flex justify-between gap-2">
                      <span className="text-slate-600">शुल्क विवरण (आजीवन ₹100 + वार्षिक ₹120)</span>
                      <span className="font-mono tabular-nums font-bold text-[#193568] text-base">₹ 220.00</span>
                    </div>
                  </div>
                </div>

                {/* Primary Verified Payment Button */}
                <div className="bg-slate-50 border border-slate-200 rounded-md p-4 text-center space-y-3">
                  <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
                    UPI (PhonePe / GPay / Paytm) किंवा कार्डद्वारे पेमेंट पूर्ण करा. पेमेंट पडताळणी होताच आपले अधिकृत आय-कार्ड तात्काळ तयार होईल.
                  </p>

                  <button
                    type="button"
                    onClick={() => handleStartRazorpayCheckout(pendingApp)}
                    disabled={isRazorpayLoading}
                    className="w-full px-6 py-3 bg-[#193568] hover:bg-[#11254a] text-white font-semibold text-base rounded-md flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#efb24b]" />
                    <span>{isRazorpayLoading ? 'Razorpay पेमेंट खिडकी उघडत आहे...' : 'Razorpay द्वारे सुरक्षित ₹220 भरा'}</span>
                  </button>

                  <p className="text-xs sm:text-sm text-slate-500">
                    अधिकृत पेमेंट पडताळणीनंतरच सदस्यत्व क्रमांक व आय-कार्ड जारी केले जाते.
                  </p>
                </div>

                {/* Secondary Direct Payment Page + Live Webhook Status Checker */}
                <div className="bg-white border border-slate-200 rounded-md p-3.5 space-y-2.5">
                  <div className="text-sm text-slate-700 leading-relaxed">
                    <strong className="text-[#193568] block mb-0.5">पॉपअप खिडकी न उघडल्यास पर्यायी सुविधा:</strong>
                    पर्यायी लिंकवरून पेमेंट केल्यास २–५ मिनिटांत अर्ज आपोआप मंजूर होतो. त्यानंतर खालील <em>"पेमेंट स्थिती तपासा"</em> बटनावर क्लिक करा.
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`https://rzp.io/rzp/Us7q4y7?name=${encodeURIComponent(pendingApp.fullName)}&email=${encodeURIComponent(pendingApp.email)}&phone=${encodeURIComponent(pendingApp.phone)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 bg-white hover:bg-slate-50 text-[#193568] border border-slate-300 font-semibold text-sm rounded-md flex items-center gap-1.5 transition-colors"
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
                              'Razorpay कडून अद्याप पेमेंट कन्फर्मेशन प्राप्त झालेले नाही (स्थिती: Pending). कृपया वरील बटनावरून पेमेंट पूर्ण करा; किंवा रक्कम कट झाली असल्यास २–५ मिनिटांनंतर पुन्हा तपासा.'
                            );
                          }
                        } finally {
                          setIsCheckingPaymentStatus(false);
                        }
                      }}
                      className="px-3.5 py-2 bg-[#df6b16] hover:bg-[#c2590d] disabled:opacity-60 text-white font-semibold text-sm rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{isCheckingPaymentStatus ? 'तपासत आहे...' : 'पेमेंट स्थिती तपासा'}</span>
                    </button>
                  </div>
                </div>

                {/* Clean Modal Footer */}
                <div className="flex items-center justify-between flex-wrap gap-2 text-xs sm:text-sm text-slate-600 pt-2 border-t border-slate-200">
                  <span>तांत्रिक मदतीसाठी मुख्य पानावरील पेमेंट साहाय्य कक्षाशी संपर्क साधावा.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPaymentModal(false);
                      setPaymentStatusNotice('');
                    }}
                    className="px-3 py-1.5 bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded transition-colors cursor-pointer"
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

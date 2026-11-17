import React, { useState, useEffect, useRef } from 'react';
import {
  Lock, LogOut, Award, PlusCircle, Search,
  ShieldAlert, KeyRound, CheckCircle2, ArrowLeft, Eye, EyeOff,
  Users, Edit3, Trash2, Check, Upload, Image as ImageIcon, X, FileText, Download, List,
  UserPlus, Shield, MessageSquare, Mail, PhoneCall, RefreshCw,
  Cloud, AlertCircle, RotateCcw, Calendar,
  ArrowUp, ArrowDown, ChevronUp, ChevronDown, Menu, Play, Video,
  Send, Inbox, Reply, Smartphone, Globe, Paperclip, Database
} from 'lucide-react';
import {
  MembershipApplication,
  NewsItem,
  GovOrder,
  LatestBannerItem,
  INITIAL_GOV_ORDERS,
  ORG_DETAILS,
  Leader,
  DEFAULT_AUTHORITATIVE_LEADERS,
  DEFAULT_MARGDARSHAK_SEED,
  MAHARASHTRA_DISTRICTS,
  isValidLeaderRecord,
  isAdvisoryBoardLeader,
  isLegalAdvisorLeader,
  isMargdarshakLeader
} from '../data/mahasanghData';
import {
  filterValidDynamicLeaders,
  findMissingVacantLeaders,
  mergeMissingVacantLeaders,
} from '../data/recoveredVacantLeaders';
import { DEFAULT_DISTRICT_PASSWORD } from '../data/rkMaharashtraData';
import { formatDateWithEnglishDigits, toEnglishDigits, formatTimeOnly } from '../utils/formatters';
import {
  getAdminCredentials,
  updateAdminCredentials,
  DEFAULT_ADMIN_EMAIL,
  MASTER_RECOVERY_KEY,
  fetchAdminUsers,
  saveAdminUser,
  deleteAdminUser,
  setAdminUserPassword,
  resetAdminUserToFirstLogin,
  AdminUser,
  AdminPermissions,
  ContactMessage,
  fetchContactsForAdmin,
  deleteContactMessageFromFirestore,
  approveApplicationAtomicInFirestore,
  addApprovedMemberToCache,
  resequenceAllApprovedMembersInFirestore,
  resetMemberCounterToActualHighest,
  purgeDeletedAndGhostApplicationsInFirestore
} from '../firebase';
import { generateMembershipIdCardPdf, generateDistrictBatchIdCardsPdf } from '../services/rkPdfGenerator';
import { compressImageFile } from '../utils/imageCompressor';
import {
  saveDynamicLeadersToFirebase,
  fetchDynamicLeaders,
  updateDistrictPasswordInRtdb,
  fetchDistrictPasswords,
  saveAppointedPostsToRtdb,
  updatePresidentPasswordInFirebase
} from '../services/rkFirebaseService';
import {
  getCloudinaryConfig,
  saveCloudinaryConfig,
  uploadToCloudinary,
  uploadBannerPhotoToCloudinary,
  uploadBannerVideoToCloudinary,
  uploadDataUrlToCloudinary,
  CloudinaryConfig
} from '../utils/cloudinary';
import {
    saveGovOrderToFirestore,
    deleteGovOrderFromFirestore
} from '../firebase';
import { MemberEditManager } from './MemberEditManager';
import { MembershipIdCardPreview } from './MembershipIdCardPreview';
import { AdminBackupRestorePanel } from './AdminBackupRestorePanel';
import { AdminWhatsappBroadcastPanel } from './AdminWhatsappBroadcastPanel';
import {
  authApiRequest,
  setAuthSessionToken,
  clearAuthSessionToken,
  getAuthHeaders,
} from '../api/sqlBridge';

interface AdminTabProps {
  applications: MembershipApplication[];
  onApproveApplication: (
    id: string,
    memberNumber: string,
    options?: { skipFirestore?: boolean }
  ) => void;
  onRejectApplication: (id: string, reason: string) => void;
  onDeleteApplication: (id: string) => Promise<void> | void;
  onUpdateMember?: (member: MembershipApplication) => Promise<void> | void;
  onAddNews: (news: NewsItem) => void;
  onUpdateNews?: (news: NewsItem) => void;
  onDeleteNews?: (id: string) => void;
  govOrders: GovOrder[];
  setGovOrders: React.Dispatch<React.SetStateAction<GovOrder[]>>;
  newsList?: NewsItem[];
  latestBanners?: LatestBannerItem[];
  onAddLatestBanner?: (banner: LatestBannerItem) => Promise<void> | void;
  onDeleteLatestBanner?: (id: string) => Promise<void> | void;
  onRefreshLatestBanners?: () => Promise<void>;
  onFetchApplications?: (forceRefresh?: boolean) => Promise<void>;
  isLoadingApps?: boolean;
  onExitAdmin?: () => void;
}

const DYNAMIC_LEADERSHIP_STORAGE_KEY = 'mahasangh_dynamic_leadership_v1';

type AdminSubTabKey =
  | 'applications'
  | 'edit_members'
  | 'leadership'
  | 'district_leadership'
  | 'master_studio'
  | 'whatsapp_broadcast'
  | 'backup_restore'
  | 'add_news'
  | 'latest_banners'
  | 'print_id_cards'
  | 'id_card_preview'
  | 'gov_order'
  | 'manage_admins'
  | 'contact_messages'
  | 'password'
  | 'cloudinary';

type AdminPermissionKey = keyof AdminPermissions;

const ALL_ADMIN_PERMISSIONS_FALSE: AdminPermissions = {
  approveMembers: false,
  editMembers: false,
  manageLeadership: false,
  manageNews: false,
  manageGovOrders: false,
  manageLatestBanners: false,
  viewIdCardPreview: false,
  manageContactMessages: false,
  manageAdmins: false,
  manageCloudinary: false,
};

const ALL_ADMIN_PERMISSIONS_TRUE: AdminPermissions = {
  approveMembers: true,
  editMembers: true,
  manageLeadership: true,
  manageNews: true,
  manageGovOrders: true,
  manageLatestBanners: true,
  viewIdCardPreview: true,
  manageContactMessages: true,
  manageAdmins: true,
  manageCloudinary: true,
};

interface AdminPermissionOption {
  key: AdminPermissionKey;
  label: string;
  description: string;
  activeCardClass: string;
  checkboxClass: string;
  badgeClass: string;
}

const ADMIN_PERMISSION_OPTIONS: AdminPermissionOption[] = [
  {
    key: 'approveMembers',
    label: 'सदस्यत्व अर्ज व मंजुरी',
    description: 'अर्ज तपासणे, पेमेंट खात्री व सदस्य मंजुरी देणे',
    activeCardClass: 'bg-amber-50/80 border-amber-300 shadow-xs',
    checkboxClass: 'text-[#df6b16] focus:ring-[#df6b16]',
    badgeClass: 'bg-amber-100 text-amber-900',
  },
  {
    key: 'editMembers',
    label: 'सदस्य एडिट',
    description: 'मंजूर सदस्यांची माहिती एडिट व डुप्लिकेट साफ करणे',
    activeCardClass: 'bg-indigo-50/80 border-indigo-300 shadow-xs',
    checkboxClass: 'text-indigo-600 focus:ring-indigo-500',
    badgeClass: 'bg-indigo-100 text-indigo-900',
  },
  {
    key: 'manageLeadership',
    label: 'नेतृत्व व पदाधिकारी',
    description: 'कार्यकारिणी, विभागीय व जिल्हाध्यक्ष माहिती बदलणे',
    activeCardClass: 'bg-purple-50/80 border-purple-300 shadow-xs',
    checkboxClass: 'text-purple-600 focus:ring-purple-500',
    badgeClass: 'bg-purple-100 text-purple-900',
  },
  {
    key: 'manageNews',
    label: 'बातम्या',
    description: 'बातम्या, फोटो व कार्यक्रम वेबसाईटवर टाकणे',
    activeCardClass: 'bg-blue-50/80 border-blue-300 shadow-xs',
    checkboxClass: 'text-blue-600 focus:ring-blue-500',
    badgeClass: 'bg-blue-100 text-blue-900',
  },
  {
    key: 'manageGovOrders',
    label: 'शासन निर्णय (GR)',
    description: 'शासन निर्णय, न्यायालयीन आदेश व परिपत्रके टाकणे',
    activeCardClass: 'bg-teal-50/80 border-teal-300 shadow-xs',
    checkboxClass: 'text-teal-600 focus:ring-teal-500',
    badgeClass: 'bg-teal-100 text-teal-900',
  },
  {
    key: 'manageLatestBanners',
    label: 'ताज्या घडामोडी बॅनर्स',
    description: 'होमपेज ताज्या घडामोडी स्लायडर फोटो व बॅनर जोडणे',
    activeCardClass: 'bg-emerald-50/80 border-emerald-300 shadow-xs',
    checkboxClass: 'text-emerald-600 focus:ring-emerald-500',
    badgeClass: 'bg-emerald-100 text-emerald-900',
  },
  {
    key: 'viewIdCardPreview',
    label: 'आय-कार्ड डिझाईन नमुना',
    description: 'अधिकृत डिजिटल आय-कार्ड डिझाईन व नमुना PDF तपासणे',
    activeCardClass: 'bg-sky-50/80 border-sky-300 shadow-xs',
    checkboxClass: 'text-sky-600 focus:ring-sky-500',
    badgeClass: 'bg-sky-100 text-sky-900',
  },
  {
    key: 'manageContactMessages',
    label: 'प्राप्त संदेश',
    description: 'संपर्क फॉर्मद्वारे आलेले संदेश पाहणे व हटवणे',
    activeCardClass: 'bg-orange-50/80 border-orange-300 shadow-xs',
    checkboxClass: 'text-orange-600 focus:ring-orange-500',
    badgeClass: 'bg-orange-100 text-orange-900',
  },
  {
    key: 'manageAdmins',
    label: 'व्यवस्थापक (Admins)',
    description: 'नवीन सब-ॲडमिन जोडणे व अधिकार कमी-जास्त करणे',
    activeCardClass: 'bg-rose-50/80 border-rose-300 shadow-xs',
    checkboxClass: 'text-rose-600 focus:ring-rose-500',
    badgeClass: 'bg-rose-100 text-rose-900',
  },
  {
    key: 'manageCloudinary',
    label: 'क्लाउड स्टोरेज',
    description: 'फोटो व फाइल मीडिया स्टोरेज सेटिंग्ज',
    activeCardClass: 'bg-cyan-50/80 border-cyan-300 shadow-xs',
    checkboxClass: 'text-cyan-600 focus:ring-cyan-500',
    badgeClass: 'bg-cyan-100 text-cyan-900',
  },
];

const hasAnyAdminPermission = (perms: AdminPermissions): boolean =>
  ADMIN_PERMISSION_OPTIONS.some((opt) => Boolean(perms[opt.key]));

const normalizeAdminPermissions = (perms?: Partial<AdminPermissions>): AdminPermissions => ({
  approveMembers: Boolean(perms?.approveMembers),
  editMembers: Boolean(perms?.editMembers),
  manageLeadership: Boolean(perms?.manageLeadership),
  manageNews: Boolean(perms?.manageNews),
  manageGovOrders: Boolean(perms?.manageGovOrders),
  manageLatestBanners: Boolean(perms?.manageLatestBanners),
  viewIdCardPreview: Boolean(perms?.viewIdCardPreview),
  manageContactMessages: Boolean(perms?.manageContactMessages),
  manageAdmins: Boolean(perms?.manageAdmins),
  manageCloudinary: Boolean(perms?.manageCloudinary),
});

const getFirstAllowedAdminTab = (perms: AdminPermissions): AdminSubTabKey => {
  if (perms.approveMembers) return 'applications';
  if (perms.editMembers) return 'edit_members';
  if (perms.manageLeadership) return 'leadership';
  if (perms.manageNews) return 'add_news';
  if (perms.manageGovOrders) return 'gov_order';
  if (perms.manageLatestBanners) return 'latest_banners';
  if (perms.viewIdCardPreview) return 'id_card_preview';
  if (perms.manageContactMessages) return 'contact_messages';
  if (perms.manageAdmins) return 'manage_admins';
  if (perms.manageCloudinary) return 'cloudinary';
  return 'password';
};

export const AdminTab: React.FC<AdminTabProps> = ({
  applications,
  onApproveApplication,
  onRejectApplication,
  onDeleteApplication,
  onUpdateMember,
  onAddNews,
  onUpdateNews,
  onDeleteNews,
  govOrders,
  setGovOrders,
  newsList = [],
  latestBanners = [],
  onAddLatestBanner,
  onDeleteLatestBanner,
  onRefreshLatestBanners,
  onFetchApplications,
  isLoadingApps,
  onExitAdmin,
}) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Logged-in admin user information & RBAC permissions
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [adminUsersList, setAdminUsersList] = useState<AdminUser[]>([]);

  // First Login Password Creation State (when a sub-admin logs in for the first time)
  const [isFirstLoginMode, setIsFirstLoginMode] = useState(false);
  const [firstLoginEmail, setFirstLoginEmail] = useState('');
  const [firstLoginNewPassword, setFirstLoginNewPassword] = useState('');
  const [firstLoginConfirmPassword, setFirstLoginConfirmPassword] = useState('');
  const [firstLoginError, setFirstLoginError] = useState('');
  const [firstLoginSuccess, setFirstLoginSuccess] = useState('');

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isApprovingApp, setIsApprovingApp] = useState(false);

  // Active view inside Admin Dashboard + Mobile App Navigation Drawer
  const [activeAdminSubTab, setActiveAdminSubTab] = useState<AdminSubTabKey>('applications');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [appsVisibleCount, setAppsVisibleCount] = useState(50);

  // Unified in-app feedback banner & confirmation dialog (replaces native alert/confirm)
  const [adminFeedbackBanner, setAdminFeedbackBanner] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    isDanger?: boolean;
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [isConfirmExecuting, setIsConfirmExecuting] = useState(false);

  const showAdminFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setAdminFeedbackBanner({ text, type });
  };

  // Master Studio Post & Password Management state
  const [postsList, setPostsList] = useState<Array<{ name: string; isTaluka: boolean }>>(() => {
    try {
      const stored = localStorage.getItem('mahasangh_posts_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [
      { name: 'जिल्हाध्यक्ष', isTaluka: false },
      { name: 'जिल्हा कार्याध्यक्ष', isTaluka: false },
      { name: 'जिल्हा सरचिटणीस', isTaluka: false },
      { name: 'जिल्हा कोषाध्यक्ष', isTaluka: false },
      { name: 'तालुकाध्यक्ष', isTaluka: true },
      { name: 'तालुका सरचिटणीस', isTaluka: true }
    ];
  });
  const [districtPasswords, setDistrictPasswords] = useState<Record<string, string>>({});
  const [isLoadingDistrictPasswords, setIsLoadingDistrictPasswords] = useState<boolean>(false);
  const [selectedDistrictForReset, setSelectedDistrictForReset] = useState<string>('अहिल्यानगर');
  const [isResettingDistrictPassword, setIsResettingDistrictPassword] = useState<boolean>(false);
  const [isResettingPresidentPassword, setIsResettingPresidentPassword] = useState<boolean>(false);
  const [districtSearchFilter, setDistrictSearchFilter] = useState<string>('');
  const [customResetPassword, setCustomResetPassword] = useState<string>('');

  const loadAllDistrictPasswords = async (force = true) => {
    setIsLoadingDistrictPasswords(true);
    try {
      const data = await fetchDistrictPasswords(force);
      if (data && typeof data === 'object') {
        setDistrictPasswords(data);
      }
    } catch (err) {
      console.warn('Failed to load district passwords:', err);
    } finally {
      setIsLoadingDistrictPasswords(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn && currentUser?.isSuperAdmin && activeAdminSubTab === 'master_studio') {
      loadAllDistrictPasswords(true);
    }
  }, [isLoggedIn, currentUser?.isSuperAdmin, activeAdminSubTab]);

  useEffect(() => {
    const handleUpdate = () => {
      if (isLoggedIn && currentUser?.isSuperAdmin) {
        loadAllDistrictPasswords(false);
      }
    };
    window.addEventListener('mahasangh_district_passwords_updated', handleUpdate);
    return () => window.removeEventListener('mahasangh_district_passwords_updated', handleUpdate);
  }, [isLoggedIn, currentUser?.isSuperAdmin]);

  const handleResetDistrictToAD2026 = async (distName: string) => {
    if (!distName) return;
    setIsResettingDistrictPassword(true);
    try {
      await updateDistrictPasswordInRtdb(distName, DEFAULT_DISTRICT_PASSWORD);
      setDistrictPasswords((prev) => ({
        ...prev,
        [distName]: DEFAULT_DISTRICT_PASSWORD,
      }));
      window.dispatchEvent(new Event('mahasangh_district_passwords_updated'));
      showAdminFeedback(`'${distName}' जिल्ह्याचा पासवर्ड पूर्ववत '${DEFAULT_DISTRICT_PASSWORD}' वर रिसेट करण्यात आला आहे! संबंधित जिल्हाध्यक्ष आता '${DEFAULT_DISTRICT_PASSWORD}' ने लॉगिन करून स्वतःचा नवीन पासवर्ड तयार करू शकतात.`, 'success');
    } catch (err: any) {
      showAdminFeedback(`पासवर्ड रिसेट करताना त्रुटी आली: ${err?.message || ''}`, 'error');
    } finally {
      setIsResettingDistrictPassword(false);
    }
  };

  // Appointment Letter Studio states in Master Studio Part 3
  const [showLetterHeader, setShowLetterHeader] = useState(false);
  const [showOutward, setShowOutward] = useState(true);
  const [showTitle, setShowTitle] = useState(true);
  const [showRecipient, setShowRecipient] = useState(true);
  const [showSubject, setShowSubject] = useState(true);
  const [showBody, setShowBody] = useState(true);
  const [showCallout, setShowCallout] = useState(true);
  const [showPara3, setShowPara3] = useState(true);
  const [showSign1, setShowSign1] = useState(true);
  const [showSign2, setShowSign2] = useState(true);

  const [letterBgUrl, setLetterBgUrl] = useState('');
  const [letterCustomImgUrl, setLetterCustomImgUrl] = useState('');
  const [letterSign1Name, setLetterSign1Name] = useState('( श्री. विजय सावंत )');
  const [letterSign1Role, setLetterSign1Role] = useState('राज्य सरचिटणीस\nमहाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ');
  const [letterSign2Name, setLetterSign2Name] = useState('( श्री. राजेंद्र खैरनार )');
  const [letterSign2Role, setLetterSign2Role] = useState('संस्थापक राज्याध्यक्ष\nमहाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ');
  const [letterSignImg, setLetterSignImg] = useState('');
  const [letterFontSize, setLetterFontSize] = useState(15);
  const [letterLineHeight, setLetterLineHeight] = useState(1.6);
  const [letterTextColor, setLetterTextColor] = useState('#111111');
  const [letterSubjectText, setLetterSubjectText] = useState('महासंघाच्या जिल्हा कार्यकारिणीवर नियुक्तीबाबत...');
  const [letterPara1Text, setLetterPara1Text] = useState('महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ हा राज्यातील शिक्षण क्षेत्राच्या रुपांतरणासाठी झटणाऱ्या केंद्रप्रमुख व विस्तार अधिकारी संघटनांच्या हक्क-हक्कासाठी, व्यावसायिक स्वाभिमानासाठी आणि गुणवत्तापूर्ण शिक्षणासाठी कटिबद्ध असलेली अग्रगण्य संघटना आहे. महासंघाच्या गूगल फॉर्म द्वारे प्राप्त झालेल्या सर्व सदस्यांच्या उत्स्फूर्त प्रतिसादानुसार आणि जिल्हा सभेत निवड प्रक्रियेत लोकशाहीच्या मूल्यांचा आदर करत सर्वानुमते हा निर्णय घेण्यात आला आहे.');
  const [letterPara2Text, setLetterPara2Text] = useState('आपला प्रदीर्घ आणि निष्कलंक सेवाप्रवास, शाळा-शिक्षणाविषयी असलेली तल्लीनता, उत्कृष्ट प्रशासकीय समन्वय आणि संघटनकौशल्यावरील आपली अढळ निष्ठा आम्ही अत्यंत जवळून अनुभवली आहे. सहकाऱ्यांच्या अडीअडचणीत धावून जाण्याची आपली वृत्ती आणि नेतृत्वगुणांची सार्थ दखल घेत, सर्व सदस्यांच्या बहुमताने व राज्य कार्यकारिणीच्या निर्णयानुसार आपणास—');
  const [letterPara3Text, setLetterPara3Text] = useState('हे पद केवळ सन्मानाचे प्रतीक नसून महासंघाच्या पवित्र विचारांचे धोरण आहे. केंद्रप्रमुख व विस्तार अधिकारी संवर्गाचे न्याय प्रश्न सोडवणे, आत्मसन्मान जपणे आणि सर्व सहकाऱ्यांच्या पाठीशी खंबीरपणे उभे राहणे हीच आपली मुख्य जबाबदारी आहे. सर्व सदस्यांनी आपल्यावर दाखवलेला हा विश्वास आणि आपल्या दूरदर्शी नेतृत्वाखाली संघटनेची पताका निश्चितच अभिमानाने गगनभरारी घेईल, हा ठाम विश्वास आहे. या मानाच्या नियुक्तीबद्दल आपले मनःपूर्वक अभिनंदन व भावी वाटचालीस हार्दिक शुभेच्छा!');
  const letterStudioRef = useRef<HTMLDivElement | null>(null);
  const [isDownloadingLetterPdf, setIsDownloadingLetterPdf] = useState(false);

  // Batch print ID cards state
  const [batchPrintDistrict, setBatchPrintDistrict] = useState<string>('अहिल्यानगर');
  const [isGeneratingBatchPrint, setIsGeneratingBatchPrint] = useState(false);
  const [batchPrintProgressMsg, setBatchPrintProgressMsg] = useState('');

  const handleGenerateBatchPrintPdf = async () => {
    setIsGeneratingBatchPrint(true);
    setBatchPrintProgressMsg('आय-कार्ड पीडीएफ तयार करत आहे...');
    try {
      await generateDistrictBatchIdCardsPdf(
        batchPrintDistrict,
        applications,
        (msg) => setBatchPrintProgressMsg(msg)
      );
      showAdminFeedback(`'${batchPrintDistrict}' जिल्ह्यातील सर्व सदस्यांचे आय-कार्ड पीडीएफ यशस्वीरीत्या डाऊनलोड झाले!`, 'success');
    } catch (err: any) {
      showAdminFeedback('आय-कार्ड पीडीएफ करताना त्रुटी आली: ' + (err?.message || ''), 'error');
    } finally {
      setIsGeneratingBatchPrint(false);
      setBatchPrintProgressMsg('');
    }
  };

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { base64 } = await compressImageFile(file, 1200, 1600, 0.85);
      setLetterBgUrl(base64);
    } catch {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) setLetterBgUrl(ev.target.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCustomImgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) setLetterCustomImgUrl(ev.target.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSignImgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) setLetterSignImg(ev.target.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadLetterPdfAction = async () => {
    if (!letterStudioRef.current) return;
    setIsDownloadingLetterPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(letterStudioRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Mahasangh_Appointment_Letter_${Date.now()}.pdf`);
      showAdminFeedback('नमुना नियुक्ती पत्र PDF यशस्वीरीत्या डाऊनलोड झाले!', 'success');
    } catch (err: any) {
      showAdminFeedback('PDF डाऊनलोड करताना त्रुटी आली: ' + (err?.message || ''), 'error');
    } finally {
      setIsDownloadingLetterPdf(false);
    }
  };

  // Latest Banners form state
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null);
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerSummary, setBannerSummary] = useState('');
  const [bannerDate, setBannerDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [bannerImageUrl, setBannerImageUrl] = useState('');
  const [bannerMediaType, setBannerMediaType] = useState<'image' | 'video'>('image');
  const [bannerVideoUrl, setBannerVideoUrl] = useState('');
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [isUploadingBannerVideo, setIsUploadingBannerVideo] = useState(false);
  const [isSavingBanner, setIsSavingBanner] = useState(false);
  const [deletingBannerId, setDeletingBannerId] = useState<string | null>(null);
  const [isRefreshingBanners, setIsRefreshingBanners] = useState(false);
  const [bannerSuccessMsg, setBannerSuccessMsg] = useState('');
  const [bannerErrorMsg, setBannerErrorMsg] = useState('');

  const handleBannerImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingBanner(true);
    setBannerErrorMsg('');
    setBannerSuccessMsg('');
    try {
      const { url } = await uploadBannerPhotoToCloudinary(file, cloudinaryConfig);
      setBannerImageUrl(url);
    } catch (err: any) {
      setBannerErrorMsg(
        'फोटो अपलोड करताना त्रुटी आली: ' +
          (err?.message || 'कृपया इंटरनेट कनेक्शन किंवा स्टोरेज सेटिंग तपासा.')
      );
    } finally {
      setIsUploadingBanner(false);
      e.target.value = '';
    }
  };

  const handleBannerVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerErrorMsg('');
    setBannerSuccessMsg('');

    const MAX_VIDEO_BYTES = 3 * 1024 * 1024;
    if (file.size > MAX_VIDEO_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      setBannerErrorMsg(`व्हिडिओचा आकार ३ MB पेक्षा जास्त आहे (${sizeMb} MB). कृपया ३ MB किंवा त्यापेक्षा लहान आकाराचा शॉर्ट व्हिडिओ निवडा.`);
      e.target.value = '';
      return;
    }

    setIsUploadingBannerVideo(true);
    try {
      const { url } = await uploadBannerVideoToCloudinary(file, cloudinaryConfig);
      setBannerVideoUrl(url);
      setBannerMediaType('video');
      if (!bannerImageUrl) {
        setBannerImageUrl(url);
      }
      setBannerSuccessMsg('✓ शॉर्ट व्हिडिओ Cloudinary वर यशस्वीरीत्या अपलोड झाला!');
    } catch (err: any) {
      setBannerErrorMsg(err?.message || 'व्हिडिओ अपलोड करताना त्रुटी आली.');
    } finally {
      setIsUploadingBannerVideo(false);
      e.target.value = '';
    }
  };

  const handleStartEditBanner = (banner: LatestBannerItem) => {
    setBannerErrorMsg('');
    setBannerSuccessMsg('');
    setEditingBannerId(banner.id);
    setBannerTitle(banner.title || '');
    setBannerSummary(banner.summary || '');
    setBannerImageUrl(banner.imageUrl || '');
    setBannerVideoUrl(banner.videoUrl || '');
    setBannerMediaType(banner.mediaType || (banner.videoUrl ? 'video' : 'image'));
    setBannerDate(parseDateStringToYYYYMMDD(banner.date));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEditBanner = () => {
    setEditingBannerId(null);
    setBannerTitle('');
    setBannerSummary('');
    setBannerImageUrl('');
    setBannerVideoUrl('');
    setBannerMediaType('image');
    setBannerDate(new Date().toISOString().split('T')[0]);
  };

  const handleCreateLatestBannerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBannerErrorMsg('');
    setBannerSuccessMsg('');

    if (isUploadingBanner || isUploadingBannerVideo) {
      setBannerErrorMsg('मीडिया अपलोड होत आहे, कृपया काही सेकंद थांबा.');
      return;
    }

    if (!bannerTitle.trim()) {
      setBannerErrorMsg('कृपया ताज्या घडामोडीचे शीर्षक आवश्यक भरा.');
      return;
    }

    if (bannerMediaType === 'video' && !bannerVideoUrl.trim()) {
      setBannerErrorMsg('कृपया ३ MB मर्यादेतील शॉर्ट व्हिडिओ निवडा किंवा लिंक प्रविष्ट करा.');
      return;
    }

    if (bannerMediaType === 'image' && !bannerImageUrl.trim()) {
      setBannerErrorMsg('कृपया ताज्या घडामोडी छायाचित्र निवडा किंवा अपलोड करा.');
      return;
    }

    setIsSavingBanner(true);
    try {
      let finalImageUrl = bannerImageUrl.trim();
      if (finalImageUrl.startsWith('data:image/')) {
        finalImageUrl = await uploadDataUrlToCloudinary(finalImageUrl, `latest_banner_${Date.now()}`, cloudinaryConfig);
        setBannerImageUrl(finalImageUrl);
      }

      const existingBanner = editingBannerId
        ? latestBanners.find((b) => b.id === editingBannerId)
        : undefined;

      const isVideo = bannerMediaType === 'video';
      const newBanner: LatestBannerItem = {
        id: editingBannerId || `banner-${Date.now()}`,
        title: bannerTitle.trim(),
        ...(bannerSummary.trim() ? { summary: bannerSummary.trim() } : {}),
        imageUrl: isVideo ? (finalImageUrl || bannerVideoUrl.trim()) : finalImageUrl,
        ...(isVideo ? { videoUrl: bannerVideoUrl.trim(), mediaType: 'video' } : { mediaType: 'image' }),
        date: formatDateWithEnglishDigits(bannerDate),
        createdAt: existingBanner?.createdAt || new Date().toISOString(),
      };

      if (onAddLatestBanner) {
        await onAddLatestBanner(newBanner);
      }

      setBannerSuccessMsg(
        editingBannerId
          ? 'ताज्या घडामोडी बॅनरमधील बदल सेव्ह झाले असून मुख्य पानावर अद्ययावत झाले आहेत!'
          : isVideo
          ? 'शॉर्ट व्हिडिओ यशस्वीरीत्या सेव्ह झाला असून मुख्य पानावर प्रसिद्ध झाला आहे!'
          : 'ताज्या घडामोडी व फोटो यशस्वीरीत्या सेव्ह झाले असून मुख्य पानावर प्रसिद्ध झाले आहेत!'
      );
      setEditingBannerId(null);
      setBannerTitle('');
      setBannerSummary('');
      setBannerImageUrl('');
      setBannerVideoUrl('');
      setBannerMediaType('image');
      setBannerDate(new Date().toISOString().split('T')[0]);
    } catch (err: any) {
      setBannerErrorMsg(
        'माहिती सेव्ह करताना त्रुटी आली: ' + (err?.message || 'कृपया पुन्हा प्रयत्न करा.')
      );
    } finally {
      setIsSavingBanner(false);
    }
  };

  const handleDeleteBannerWithFeedback = (bannerId: string) => {
    setConfirmDialog({
      title: 'बॅनर हटवा',
      message: 'हा ताज्या घडामोडीचा बॅनर कायमचा डिलीट करायचा आहे का?',
      confirmLabel: 'होय, डिलीट करा',
      isDanger: true,
      onConfirm: async () => {
        setBannerErrorMsg('');
        setBannerSuccessMsg('');
        setDeletingBannerId(bannerId);
        try {
          if (onDeleteLatestBanner) {
            await onDeleteLatestBanner(bannerId);
          }
          if (editingBannerId === bannerId) {
            handleCancelEditBanner();
          }
          setBannerSuccessMsg('ताज्या घडामोडी बॅनर यशस्वीरीत्या हटवण्यात आला!');
        } catch (err: any) {
          setBannerErrorMsg('बॅनर डिलीट करताना त्रुटी आली: ' + (err?.message || 'Error'));
        } finally {
          setDeletingBannerId(null);
        }
      },
    });
  };

  const handleRefreshBannersClick = async () => {
    if (!onRefreshLatestBanners) return;
    setIsRefreshingBanners(true);
    setBannerErrorMsg('');
    try {
      await onRefreshLatestBanners();
    } catch (err: any) {
      setBannerErrorMsg('बॅनर्स ताजे करताना त्रुटी आली: ' + (err?.message || 'Error'));
    } finally {
      setIsRefreshingBanners(false);
    }
  };

  // Contact Inquiries & Official Email Mailbox (contact@mahasangh.in)
  interface MailboxEmailItem {
    uid: number;
    messageId: string;
    folder: string;
    fromName: string;
    fromEmail: string;
    toEmail: string;
    subject: string;
    textBody: string;
    snippet: string;
    date: string;
    isRead: boolean;
    hasAttachments: boolean;
    attachmentNames: string[];
  }
  const [contactMessages, setContactMessages] = useState<ContactMessage[]>([]);
  const [mailboxEmails, setMailboxEmails] = useState<MailboxEmailItem[]>([]);
  const [mailboxAccount, setMailboxAccount] = useState('contact@mahasangh.in');
  const [mailboxError, setMailboxError] = useState('');
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [contactDistrictFilter, setContactDistrictFilter] = useState('');
  const [mailboxSourceFilter, setMailboxSourceFilter] = useState<'all' | 'email' | 'contact_form'>('all');
  const [showMobileMailGuide, setShowMobileMailGuide] = useState(false);
  const [replyModal, setReplyModal] = useState<{
    open: boolean;
    to: string;
    recipientName: string;
    subject: string;
    body: string;
    replyToMessageId?: string;
    contextLabel?: string;
    isSending: boolean;
    error: string;
  } | null>(null);

  // Manage Admins tab state
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPermissions, setNewAdminPermissions] = useState<AdminPermissions>({
    ...ALL_ADMIN_PERMISSIONS_FALSE,
    approveMembers: true,
  });
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<AdminPermissions>({
    ...ALL_ADMIN_PERMISSIONS_FALSE,
  });
  const [isUpdatingAdminPerms, setIsUpdatingAdminPerms] = useState(false);
  const [adminActionMsg, setAdminActionMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isSubmittingAdmin, setIsSubmittingAdmin] = useState(false);

  // Change Password state inside Dashboard
  const [currentPassInput, setCurrentPassInput] = useState('');
  const [newPassInput, setNewPassInput] = useState('');
  const [confirmPassInput, setConfirmPassInput] = useState('');
  const [changePassStatus, setChangePassStatus] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Filter & Search for Applications
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Application Verification Modal (Point 4)
  const [selectedAppForVerification, setSelectedAppForVerification] = useState<MembershipApplication | null>(null);
  const [paymentConfirmedChecked, setPaymentConfirmedChecked] = useState<boolean>(false);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [showRejectInput, setShowRejectInput] = useState<boolean>(false);
  const [verificationErrorMsg, setVerificationErrorMsg] = useState<string>('');

  // Certificate Modal (Point 5)
  const [certModalApp, setCertModalApp] = useState<MembershipApplication | null>(null);

  // Razorpay Excel Auto-Approve state
  const [showRazorpayMatchModal, setShowRazorpayMatchModal] = useState<boolean>(false);
  const [razorpayMatchedList, setRazorpayMatchedList] = useState<Array<{ app: MembershipApplication; paymentId: string; orderId: string }>>([]);
  const [isBulkApprovingRazorpay, setIsBulkApprovingRazorpay] = useState<boolean>(false);

  // Resequencing & ghost cleanup state
  const [isResequencing, setIsResequencing] = useState(false);
  const handleResequence = () => {
    setConfirmDialog({
      title: 'सदस्य क्रमांक पुनर्रचना',
      message: 'तुम्हाला नक्की सर्व मंजूर सदस्यांचे क्रमांक मंजुरीच्या क्रमानुसार 1 पासून सलग रांगेत लावायचे आहेत का? यामुळे जुने गॅप निघून जातील.',
      confirmLabel: 'होय, क्रमाने लावा',
      onConfirm: async () => {
        setIsResequencing(true);
        try {
          const res = await resequenceAllApprovedMembersInFirestore();
          showAdminFeedback(res.message, 'success');
          if (onFetchApplications) await onFetchApplications(true);
        } catch (err) {
          showAdminFeedback('पुनर्रचना करताना त्रुटी आली: ' + (err instanceof Error ? err.message : String(err)), 'error');
        } finally {
          setIsResequencing(false);
        }
      },
    });
  };

  const [isResettingCounter, setIsResettingCounter] = useState(false);
  const [isPurgingGhosts, setIsPurgingGhosts] = useState(false);
  const [activeCircleAction, setActiveCircleAction] = useState<'resequence' | 'reset' | null>(null);
  const handleResetCounter = () => {
    setConfirmDialog({
      title: 'सदस्य काउंटर रिसेट करा',
      message: 'सदस्य क्रमांक काउंटर सर्व्हरवरील शेवटच्या खऱ्या क्रमांकावर रिसेट करायचा का? पुढचा नवीन अर्ज मंजूर केल्यावर क्रमांक तिथून पुढे चालू होईल.',
      confirmLabel: 'होय, रिसेट करा',
      onConfirm: async () => {
        setIsResettingCounter(true);
        try {
          const res = await resetMemberCounterToActualHighest();
          showAdminFeedback(res.message, 'success');
          if (onFetchApplications) await onFetchApplications(true);
        } catch (err) {
          showAdminFeedback('काउंटर रिसेट करताना त्रुटी आली: ' + (err instanceof Error ? err.message : String(err)), 'error');
        } finally {
          setIsResettingCounter(false);
        }
      },
    });
  };

  const handlePurgeDeletedGhosts = () => {
    setConfirmDialog({
      title: 'जुना व दुबार डाटा स्वच्छ करा',
      message: 'पूर्वी डिलीट / नाकारलेले (Rejected), अपूर्ण आणि दुबार प्रलंबित अर्जांचा डाटा सिस्टम व कॅशमधून कायमचा काढून टाकायचा का?',
      confirmLabel: 'होय, स्वच्छ करा',
      isDanger: true,
      onConfirm: async () => {
        setIsPurgingGhosts(true);
        try {
          const res = await purgeDeletedAndGhostApplicationsInFirestore();
          showAdminFeedback(res.message, 'success');
          if (onFetchApplications) await onFetchApplications(true);
        } catch (err) {
          showAdminFeedback('जुना डाटा स्वच्छ करताना त्रुटी आली: ' + (err instanceof Error ? err.message : String(err)), 'error');
        } finally {
          setIsPurgingGhosts(false);
        }
      },
    });
  };

  const handleDeleteWithFeedback = (app: MembershipApplication) => {
    setConfirmDialog({
      title: 'अर्ज कायमचा डिलीट करा',
      message: `${app.salutation ? app.salutation + ' ' : ''}${app.fullName} (${app.phone}) यांचा हा अर्ज सिस्टममधून कायमचा डिलीट करायचा का? डिलीट केल्यानंतर ते पुन्हा अर्ज भरू शकतील.`,
      confirmLabel: 'होय, डिलीट करा',
      isDanger: true,
      onConfirm: async () => {
        try {
          await onDeleteApplication(app.id);
          if (selectedAppForVerification?.id === app.id) {
            setSelectedAppForVerification(null);
          }
          showAdminFeedback(`${app.fullName} यांचा अर्ज यशस्वीरीत्या डिलीट झाला.`, 'success');
        } catch (err) {
          showAdminFeedback('अर्ज डिलीट करताना त्रुटी आली: ' + (err instanceof Error ? err.message : String(err)), 'error');
        }
      },
    });
  };

  // Cloudinary State (Firebase Quota Protection - 100% Free CDN Hosting)
  const [cloudinaryConfig, setCloudinaryConfig] = useState<CloudinaryConfig>(getCloudinaryConfig);
  const [cloudinaryCloudName, setCloudinaryCloudName] = useState(cloudinaryConfig.cloudName);
  const [cloudinaryPreset, setCloudinaryPreset] = useState(cloudinaryConfig.uploadPreset);
  const [cloudinaryEnabled, setCloudinaryEnabled] = useState(cloudinaryConfig.enabled);
  const [cloudinaryStatusMsg, setCloudinaryStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isTestingCloudinary, setIsTestingCloudinary] = useState(false);
  const [isUploadingNewsCloudinary, setIsUploadingNewsCloudinary] = useState(false);
  const [isUploadingLeaderCloudinary, setIsUploadingLeaderCloudinary] = useState(false);

  const handleSaveCloudinarySettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: CloudinaryConfig = {
      cloudName: cloudinaryCloudName.trim(),
      uploadPreset: cloudinaryPreset.trim(),
      enabled: cloudinaryEnabled && Boolean(cloudinaryCloudName.trim()) && Boolean(cloudinaryPreset.trim())
    };
    saveCloudinaryConfig(updated);
    setCloudinaryConfig(updated);
    setCloudinaryStatusMsg({
      text: updated.enabled
        ? '✓ सर्व्हर मिडिया स्टोरेज सेटिंग्ज यशस्वीरीत्या सेव्ह झाली! आता सर्व फोटो थेट क्लाउड सर्व्हरवर सेव्ह होतील.'
        : 'सर्व्हर मिडिया स्टोरेज सेटिंग्ज जतन करण्यात आली (सध्या पर्याय निष्क्रिय आहे).',
      type: 'success'
    });
  };

  const handleTestCloudinaryUpload = async () => {
    if (!cloudinaryCloudName.trim() || !cloudinaryPreset.trim()) {
      setCloudinaryStatusMsg({ text: 'कृपया आधी Cloud Name आणि Unsigned Upload Preset प्रविष्ट करा.', type: 'error' });
      return;
    }
    setIsTestingCloudinary(true);
    setCloudinaryStatusMsg(null);
    try {
      // Create a 10x10 tiny test pixel image blob
      const canvas = document.createElement('canvas');
      canvas.width = 10;
      canvas.height = 10;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#09243f';
        ctx.fillRect(0, 0, 10, 10);
      }
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('चाचणी इमेज तयार करता आली नाही.');
      const testFile = new File([blob], 'test_ping.png', { type: 'image/png' });

      const result = await uploadToCloudinary(testFile, {
        cloudName: cloudinaryCloudName.trim(),
        uploadPreset: cloudinaryPreset.trim(),
        enabled: true
      });

      setCloudinaryStatusMsg({
        text: `✓ सर्व्हर फोटो साठवणूक कनेक्शन यशस्वी झाले! चाचणी फोटो अपलोड झाला: ${result.url}`,
        type: 'success'
      });
    } catch (err: any) {
      setCloudinaryStatusMsg({
        text: 'फोटो सर्व्हर चाचणी अयशस्वी: ' + (err.message || 'कृपया नाव व Preset तपासा'),
        type: 'error'
      });
    } finally {
      setIsTestingCloudinary(false);
    }
  };

  // News Date Formatters
  const formatPublishDateToDisplay = (dateInputStr: string): string => {
    if (!dateInputStr) return formatDateWithEnglishDigits(new Date());
    const cleanStr = toEnglishDigits(dateInputStr.trim());
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
      const [y, m, d] = cleanStr.split('-');
      return `${d}/${m}/${y}`;
    }
    return cleanStr;
  };

  const parseDateStringToYYYYMMDD = (dateStr: string): string => {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    const cleanStr = toEnglishDigits(dateStr.trim());
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) return cleanStr;
    const ddmmyyyy = cleanStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (ddmmyyyy) {
      const d = String(ddmmyyyy[1]).padStart(2, '0');
      const m = String(ddmmyyyy[2]).padStart(2, '0');
      const y = ddmmyyyy[3];
      return `${y}-${m}-${d}`;
    }
    const t = new Date(cleanStr).getTime();
    if (!isNaN(t) && t > 0) {
      return new Date(t).toISOString().split('T')[0];
    }
    return new Date().toISOString().split('T')[0];
  };

  // News State & Management (Full News, Quick Photo Only, Edit, Live Preview)
  const [newsTitle, setNewsTitle] = useState('');
  const [newsDate, setNewsDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [newsCategory, setNewsCategory] = useState('अधिकृत घोषणा');
  const [newsSummary, setNewsSummary] = useState('');
  const [newsContent, setNewsContent] = useState('');
  const [newsImageUrl, setNewsImageUrl] = useState('');
  const [isCompressingNewsImg, setIsCompressingNewsImg] = useState(false);
  const [newsCreatedSuccess, setNewsCreatedSuccess] = useState(false);
  const [newsError, setNewsError] = useState('');

  // GovOrder State & Management (using props.govOrders)
  const [goTitle, setGoTitle] = useState('');
  const [goDate, setGoDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [goType, setGoType] = useState<'शासन निर्णय' | 'न्यायालयीन आदेश' | 'परिपत्रक'>('शासन निर्णय');
  const [goFileUrl, setGoFileUrl] = useState('');
  const [goDriveUrl, setGoDriveUrl] = useState('');
  const [goSummary, setGoSummary] = useState('');
  const [isUploadingGoFile, setIsUploadingGoFile] = useState(false);
  const [goCreatedSuccess, setGoCreatedSuccess] = useState(false);
  const [goError, setGoError] = useState('');

  // Editing existing news / GR / Photo
  const [editingNewsItem, setEditingNewsItem] = useState<NewsItem | null>(null);
  const [newsManageMode, setNewsManageMode] = useState<'form' | 'gov_order' | 'list'>('form');
  const [previewNewsItem, setPreviewNewsItem] = useState<NewsItem | null>(null);

  // News search query in admin
  const [newsSearchQuery, setNewsSearchQuery] = useState('');

  const handleNewsImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (cloudinaryConfig.enabled && cloudinaryConfig.cloudName && cloudinaryConfig.uploadPreset) {
      setIsUploadingNewsCloudinary(true);
      setNewsError('');
      try {
        const result = await uploadToCloudinary(file, cloudinaryConfig);
        setNewsImageUrl(result.url);
      } catch (err: any) {
        console.warn('Cloudinary upload error, falling back to local compression:', err);
        setIsCompressingNewsImg(true);
        try {
          const { base64 } = await compressImageFile(file, 800, 600, 0.7);
          setNewsImageUrl(base64);
          setNewsError('सर्व्हर अपलोड त्रुटी (' + (err.message || '') + '), म्हणून स्थानिक कॉम्प्रेस केलेली इमेज वापरली.');
        } catch {
          setNewsError('फोटो कॉम्प्रेस करताना अडचण आली.');
        } finally {
          setIsCompressingNewsImg(false);
        }
      } finally {
        setIsUploadingNewsCloudinary(false);
      }
    } else {
      setIsCompressingNewsImg(true);
      try {
        const { base64 } = await compressImageFile(file, 800, 600, 0.7);
        setNewsImageUrl(base64);
      } catch (err) {
        console.warn('News image compression failed:', err);
      } finally {
        setIsCompressingNewsImg(false);
      }
    }
  };

  const handleGoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (cloudinaryConfig.enabled && cloudinaryConfig.cloudName && cloudinaryConfig.uploadPreset) {
      setIsUploadingGoFile(true);
      setGoError('');
      try {
        const result = await uploadToCloudinary(file, cloudinaryConfig);
        setGoFileUrl(result.url);
      } catch (err: any) {
        setGoError('फाइल अपलोड अयशस्वी: ' + (err.message || ''));
      } finally {
        setIsUploadingGoFile(false);
      }
    } else {
      setGoError('कृपया Admin पॅनलमध्ये सर्व्हर मिडिया स्टोरेज सेटिंग्ज तपासा.');
    }
  };

  // ==========================================
  // Leadership Management State (राज्य पदाधिकारी व जिल्हा कार्यकारिणी)
  // ==========================================
  const [leaderCategory, setLeaderCategory] = useState<'राज्य कार्यकारिणी' | 'महिला आघाडी राज्य कार्यकारिणी' | 'विभागीय समन्वयक' | 'राज्य सल्लागार मंडळ'>('राज्य कार्यकारिणी');
  const [districtLeaderMode, setDistrictLeaderMode] = useState<'जिल्हा अध्यक्ष' | 'जिल्हा सरचिटणीस'>('जिल्हा अध्यक्ष');
  const [districtLeaderSearch, setDistrictLeaderSearch] = useState('');
  const [selectedDistrictLeaderId, setSelectedDistrictLeaderId] = useState<string | null>(null);
  const [contactPhotoModal, setContactPhotoModal] = useState<{ src: string; title: string } | null>(null);
  const [advisorySubTab, setAdvisorySubTab] = useState<'कायदेविषयक सल्लागार' | 'मार्गदर्शक'>('कायदेविषयक सल्लागार');
  const [dynamicLeaders, setDynamicLeaders] = useState<Leader[]>([]);
  const [editingLeaderId, setEditingLeaderId] = useState<string | null>(null);
  const [leaderName, setLeaderName] = useState('');
  const [leaderRole, setLeaderRole] = useState('');
  const [leaderRegion, setLeaderRegion] = useState('');
  const [leaderPhone, setLeaderPhone] = useState('');
  const [leaderEducation, setLeaderEducation] = useState('');
  const [leaderPhoto, setLeaderPhoto] = useState('');
  const [leaderPhotoSizeKb, setLeaderPhotoSizeKb] = useState(0);
  const [leaderPhotoUrl, setLeaderPhotoUrl] = useState('');
  const [leaderFormMsg, setLeaderFormMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isSavingLeader, setIsSavingLeader] = useState(false);
  const leaderPhotoInputRef = useRef<HTMLInputElement | null>(null);

  const normalizeDynamicLeadersList = (rawList: Leader[]): Leader[] => {
    const cleaned = filterValidDynamicLeaders(rawList)
      .map((l) => {
        if (l.category === 'सल्लागार' || l.category === 'advisory' || l.category === 'राज्य सल्लागार मंडळ') {
          return {
            ...l,
            category: isLegalAdvisorLeader(l) ? ('कायदेविषयक सल्लागार' as const) : ('मार्गदर्शक' as const)
          };
        }
        return l;
      });
    const hasMargdarshak = cleaned.some((l) => isMargdarshakLeader(l));
    return hasMargdarshak ? cleaned : [...cleaned, ...DEFAULT_MARGDARSHAK_SEED];
  };

  // Initialize Dynamic Leadership from Firebase / LocalStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DYNAMIC_LEADERSHIP_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length >= 50) {
          setDynamicLeaders(normalizeDynamicLeadersList(parsed));
        } else {
          setDynamicLeaders(normalizeDynamicLeadersList(DEFAULT_AUTHORITATIVE_LEADERS));
        }
      } else {
        setDynamicLeaders(normalizeDynamicLeadersList(DEFAULT_AUTHORITATIVE_LEADERS));
      }
    } catch (e) {
      console.warn('Could not read dynamic leaders:', e);
      setDynamicLeaders(normalizeDynamicLeadersList(DEFAULT_AUTHORITATIVE_LEADERS));
    }

    // Always sync authoritative remote leaders from Firebase (RTDB & Firestore)
    fetchDynamicLeaders(true).then((remote) => {
      if (remote && remote.length > 0) {
        const normalized = normalizeDynamicLeadersList(remote);
        setDynamicLeaders(normalized);
        localStorage.setItem(DYNAMIC_LEADERSHIP_STORAGE_KEY, JSON.stringify(normalized));
      }
    }).catch(() => {});
  }, []);

  // Save Dynamic Leadership to LocalStorage and active backend (MySQL / Firebase) sequentially
  const saveLeadersToStorage = async (updatedList: Leader[]): Promise<boolean> => {
    setDynamicLeaders(updatedList);
    try {
      localStorage.setItem(DYNAMIC_LEADERSHIP_STORAGE_KEY, JSON.stringify(updatedList));
    } catch (e) {
      console.warn('Could not write localStorage leaders cache:', e);
    }
    try {
      await saveDynamicLeadersToFirebase(updatedList);
      return true;
    } catch (err: any) {
      console.warn('Could not sync leaders to backend:', err);
      setLeaderFormMsg({
        text: err?.message || 'डेटा सर्व्हरवर सेव्ह करताना त्रुटी आली. कृपया पुन्हा लॉगिन करून प्रयत्न करा.',
        type: 'error',
      });
      return false;
    }
  };

  const activeLeaderSectionLabel =
    leaderCategory === 'राज्य सल्लागार मंडळ' ? advisorySubTab : leaderCategory;

  const missingVacantLeadersCount = findMissingVacantLeaders(dynamicLeaders).length;

  const handleRestoreMissingVacantLeaders = async () => {
    const { merged, addedCount } = mergeMissingVacantLeaders(dynamicLeaders);
    if (addedCount === 0) return;
    setIsSavingLeader(true);
    try {
      const ok = await saveLeadersToStorage(merged);
      if (ok) {
        setLeaderFormMsg({
          text: `✓ ${addedCount} रिकामी पदे (राज्य / महिला आघाडी / विभागीय कार्यकारिणी) यशस्वीरीत्या पुन्हा जोडली गेली आहेत!`,
          type: 'success',
        });
        setTimeout(() => setLeaderFormMsg(null), 5000);
      }
    } finally {
      setIsSavingLeader(false);
    }
  };

  // Filter state/advisory leaders by active category (and sub-tab for राज्य सल्लागार मंडळ)
  const categoryLeaders = dynamicLeaders.filter((l) => {
    if (!l) return false;
    if (leaderCategory === 'राज्य सल्लागार मंडळ') {
      if (!isValidLeaderRecord(l)) return false;
      if (!isAdvisoryBoardLeader(l)) return false;
      return advisorySubTab === 'कायदेविषयक सल्लागार'
        ? isLegalAdvisorLeader(l)
        : !isLegalAdvisorLeader(l);
    }
    if (leaderCategory === 'विभागीय समन्वयक') {
      return l.category === 'विभागीय समन्वयक' || l.category === 'विभागीय कार्यकारिणी' || l.category === 'division';
    }
    return (l.category || 'राज्य कार्यकारिणी') === leaderCategory;
  });

  // District leaders filtered by mode ('जिल्हा अध्यक्ष' | 'जिल्हा सरचिटणीस')
  const allDistrictModeLeaders = dynamicLeaders.filter((l) => {
    if (!l) return false;
    if (districtLeaderMode === 'जिल्हा अध्यक्ष') {
      return l.category === 'जिल्हा अध्यक्ष' || l.category === 'district';
    }
    return l.category === 'जिल्हा सरचिटणीस';
  });

  const filteredDistrictModeLeaders = allDistrictModeLeaders.filter((l) => {
    const q = districtLeaderSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (l.region || '').toLowerCase().includes(q) ||
      (l.name || '').toLowerCase().includes(q) ||
      (l.role || '').toLowerCase().includes(q)
    );
  });

  // Selected leader ID for prominent reordering
  const [selectedLeaderIdForReorder, setSelectedLeaderIdForReorder] = useState<string | null>(null);

  // Auto-select first leader when category changes or when current selection is lost
  useEffect(() => {
    if (categoryLeaders.length > 0) {
      if (!selectedLeaderIdForReorder || !categoryLeaders.some((l) => (l.id || l.name) === selectedLeaderIdForReorder)) {
        setSelectedLeaderIdForReorder(categoryLeaders[0].id || categoryLeaders[0].name);
      }
    } else {
      setSelectedLeaderIdForReorder(null);
    }
  }, [leaderCategory, advisorySubTab, categoryLeaders.length]);

  useEffect(() => {
    if (allDistrictModeLeaders.length > 0) {
      if (!selectedDistrictLeaderId || !allDistrictModeLeaders.some((l) => (l.id || l.name) === selectedDistrictLeaderId)) {
        setSelectedDistrictLeaderId(allDistrictModeLeaders[0].id || allDistrictModeLeaders[0].name);
      }
    } else {
      setSelectedDistrictLeaderId(null);
    }
  }, [districtLeaderMode, allDistrictModeLeaders.length]);

  // Safe category-specific Move Up
  const handleMoveLeaderUp = async (leaderId?: string) => {
    const targetId = leaderId || selectedLeaderIdForReorder;
    if (!targetId) return;

    const catIndex = categoryLeaders.findIndex((l) => (l.id || l.name) === targetId);
    if (catIndex <= 0) return; // Already at top of category

    const currentLeader = categoryLeaders[catIndex];
    const leaderAbove = categoryLeaders[catIndex - 1];

    // Swap positions inside dynamicLeaders
    const newLeaders = [...dynamicLeaders];
    const posCurrent = newLeaders.findIndex((l) => (l.id || l.name) === (currentLeader.id || currentLeader.name));
    const posAbove = newLeaders.findIndex((l) => (l.id || l.name) === (leaderAbove.id || leaderAbove.name));

    if (posCurrent !== -1 && posAbove !== -1) {
      const temp = newLeaders[posCurrent];
      newLeaders[posCurrent] = newLeaders[posAbove];
      newLeaders[posAbove] = temp;
      setSelectedLeaderIdForReorder(targetId);
      await saveLeadersToStorage(newLeaders);
    }
  };

  // Safe category-specific Move Down
  const handleMoveLeaderDown = async (leaderId?: string) => {
    const targetId = leaderId || selectedLeaderIdForReorder;
    if (!targetId) return;

    const catIndex = categoryLeaders.findIndex((l) => (l.id || l.name) === targetId);
    if (catIndex === -1 || catIndex >= categoryLeaders.length - 1) return; // Already at bottom of category

    const currentLeader = categoryLeaders[catIndex];
    const leaderBelow = categoryLeaders[catIndex + 1];

    // Swap positions inside dynamicLeaders
    const newLeaders = [...dynamicLeaders];
    const posCurrent = newLeaders.findIndex((l) => (l.id || l.name) === (currentLeader.id || currentLeader.name));
    const posBelow = newLeaders.findIndex((l) => (l.id || l.name) === (leaderBelow.id || leaderBelow.name));

    if (posCurrent !== -1 && posBelow !== -1) {
      const temp = newLeaders[posCurrent];
      newLeaders[posCurrent] = newLeaders[posBelow];
      newLeaders[posBelow] = temp;
      setSelectedLeaderIdForReorder(targetId);
      await saveLeadersToStorage(newLeaders);
    }
  };

  const selectedLeaderIndex = categoryLeaders.findIndex((l) => (l.id || l.name) === selectedLeaderIdForReorder);
  const selectedLeader = selectedLeaderIndex >= 0 ? categoryLeaders[selectedLeaderIndex] : null;

  // District-specific Move Up (preserves District Presidents / Secretaries relative order)
  const handleMoveDistrictLeaderUp = async (leaderId?: string) => {
    const targetId = leaderId || selectedDistrictLeaderId;
    if (!targetId) return;

    const modeIndex = allDistrictModeLeaders.findIndex((l) => (l.id || l.name) === targetId);
    if (modeIndex <= 0) return;

    const currentLeader = allDistrictModeLeaders[modeIndex];
    const leaderAbove = allDistrictModeLeaders[modeIndex - 1];

    const newLeaders = [...dynamicLeaders];
    const posCurrent = newLeaders.findIndex((l) => (l.id || l.name) === (currentLeader.id || currentLeader.name));
    const posAbove = newLeaders.findIndex((l) => (l.id || l.name) === (leaderAbove.id || leaderAbove.name));

    if (posCurrent !== -1 && posAbove !== -1) {
      const temp = newLeaders[posCurrent];
      newLeaders[posCurrent] = newLeaders[posAbove];
      newLeaders[posAbove] = temp;
      setSelectedDistrictLeaderId(targetId);
      await saveLeadersToStorage(newLeaders);
    }
  };

  // District-specific Move Down
  const handleMoveDistrictLeaderDown = async (leaderId?: string) => {
    const targetId = leaderId || selectedDistrictLeaderId;
    if (!targetId) return;

    const modeIndex = allDistrictModeLeaders.findIndex((l) => (l.id || l.name) === targetId);
    if (modeIndex === -1 || modeIndex >= allDistrictModeLeaders.length - 1) return;

    const currentLeader = allDistrictModeLeaders[modeIndex];
    const leaderBelow = allDistrictModeLeaders[modeIndex + 1];

    const newLeaders = [...dynamicLeaders];
    const posCurrent = newLeaders.findIndex((l) => (l.id || l.name) === (currentLeader.id || currentLeader.name));
    const posBelow = newLeaders.findIndex((l) => (l.id || l.name) === (leaderBelow.id || leaderBelow.name));

    if (posCurrent !== -1 && posBelow !== -1) {
      const temp = newLeaders[posCurrent];
      newLeaders[posCurrent] = newLeaders[posBelow];
      newLeaders[posBelow] = temp;
      setSelectedDistrictLeaderId(targetId);
      await saveLeadersToStorage(newLeaders);
    }
  };

  const selectedDistrictLeaderIndex = allDistrictModeLeaders.findIndex((l) => (l.id || l.name) === selectedDistrictLeaderId);
  const selectedDistrictLeader = selectedDistrictLeaderIndex >= 0 ? allDistrictModeLeaders[selectedDistrictLeaderIndex] : null;
  const districtLeaderFormRef = useRef<HTMLDivElement | null>(null);

  const normalizeDistrictAlias = (dist?: string): string => {
    const clean = (dist || '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/जिल्हा/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return '';
    const phonetic = clean.replace(/ू/g, 'ु').replace(/ी/g, 'ि').toLowerCase();
    if (phonetic.includes('संभाजिनगर') || phonetic.includes('औरंगाबाद')) return 'छत्रपती संभाजीनगर';
    if (phonetic.includes('धाराशिव') || phonetic.includes('उस्मानाबाद')) return 'धाराशिव';
    if (phonetic.includes('अहिल्यानगर') || phonetic.includes('अहमदनगर')) return 'अहिल्यानगर';
    if (phonetic.includes('सिंधुदुर्ग')) return 'सिंधुदुर्ग';
    if (phonetic.includes('वाशिम')) return 'वाशीम';
    if (phonetic.includes('बुलढाणा') || phonetic.includes('बुलडाणा')) return 'बुलढाणा';
    const canonical = MAHARASHTRA_DISTRICTS.find((d) => {
      const dp = d.replace(/ू/g, 'ु').replace(/ी/g, 'ि').toLowerCase();
      return phonetic === dp || phonetic.includes(dp);
    });
    return canonical || clean;
  };

  const isPlaceholderDistrictName = (name?: string): boolean => {
    const clean = (name || '').trim();
    return !clean || clean === '-' || clean === '.' || clean === '0';
  };

  // Hydrate sub-admin list from local cache on mount; live cloud credentials are verified on login
  useEffect(() => {
    try {
      const cached = localStorage.getItem('mahasangh_sub_admins_v1');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) setAdminUsersList(parsed);
      }
    } catch {
      // ignore cache parse errors
    }
  }, []);


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const inputEmail = email.trim().toLowerCase();
    const inputPass = password.trim();

    if (!inputEmail) {
      setLoginError('कृपया ई-मेल प्रविष्ट करा.');
      return;
    }

    try {
      setIsLoggingIn(true);
      const { ok, data } = await authApiRequest<{
        status: string;
        token?: string;
        user?: AdminUser;
        subAdmins?: AdminUser[];
        email?: string;
        message?: string;
      }>('/api/auth/admin-login', { email: inputEmail, password: inputPass });

      if (data?.status === 'first_login') {
        setIsFirstLoginMode(true);
        setFirstLoginEmail(data.email || inputEmail);
        setFirstLoginError('');
        setFirstLoginSuccess('');
        setFirstLoginNewPassword('');
        setFirstLoginConfirmPassword('');
        return;
      }

      if (!ok || data?.status !== 'success' || !data.user) {
        setLoginError(data?.message || 'चुकीचा ई-मेल किंवा पासवर्ड. कृपया पुन्हा प्रयत्न करा.');
        return;
      }

      if (data.token) {
        setAuthSessionToken(data.token);
      }

      const loggedUser = data.user;
      if (Array.isArray(data.subAdmins)) {
        setAdminUsersList(data.subAdmins);
      } else if (loggedUser.isSuperAdmin || loggedUser.permissions?.manageAdmins) {
        fetchAdminUsers().then(setAdminUsersList).catch(() => {});
      }

      setCurrentUser(loggedUser);
      setIsLoggedIn(true);
      setLoginError('');

      if (loggedUser.isSuperAdmin) {
        setActiveAdminSubTab('applications');
        if (onFetchApplications) {
          onFetchApplications();
        }
      } else {
        setActiveAdminSubTab(getFirstAllowedAdminTab(loggedUser.permissions));
        if ((loggedUser.permissions.approveMembers || loggedUser.permissions.editMembers) && onFetchApplications) {
          onFetchApplications();
        }
      }
    } catch (err: any) {
      setLoginError('लॉगिन करताना त्रुटी आली: ' + (err.message || 'Error'));
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle First Time Login Password Creation
  const handleFirstLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFirstLoginError('');
    setFirstLoginSuccess('');

    const newPwd = firstLoginNewPassword.trim();
    const confPwd = firstLoginConfirmPassword.trim();

    if (!newPwd || !confPwd) {
      setFirstLoginError('कृपया दोन्ही पासवर्ड रकाने भरा.');
      return;
    }

    if (newPwd.length < 4) {
      setFirstLoginError('पासवर्ड किमान 4 अक्षरांचा असावा.');
      return;
    }

    if (newPwd !== confPwd) {
      setFirstLoginError('दोन्ही पासवर्ड एकमेकांशी जुळत नाहीत.');
      return;
    }

    try {
      const { ok, data } = await authApiRequest<{
        status: string;
        token?: string;
        user?: AdminUser;
        message?: string;
      }>('/api/auth/sub-admin-first-login', {
        email: firstLoginEmail,
        newPassword: newPwd,
      });

      if (!ok || data?.status !== 'success' || !data.user) {
        setFirstLoginError(data?.message || 'पासवर्ड सेव्ह करताना त्रुटी आली.');
        return;
      }

      if (data.token) {
        setAuthSessionToken(data.token);
      }
      const user = data.user;
      setFirstLoginSuccess('आपला पासवर्ड यशस्वीपणे तयार झाला आहे! डॅशबोर्ड उघडत आहे...');
      setTimeout(() => {
        setIsFirstLoginMode(false);
        setCurrentUser(user);
        setIsLoggedIn(true);
        setActiveAdminSubTab(getFirstAllowedAdminTab(user.permissions));
        if ((user.permissions.approveMembers || user.permissions.editMembers) && onFetchApplications) {
          onFetchApplications();
        }
      }, 1000);
    } catch (err: any) {
      setFirstLoginError('पासवर्ड सेव्ह करताना त्रुटी: ' + (err.message || 'Error'));
    }
  };

  // Removed handleResetPasswordSubmit function.

  // Handle Change Password inside Logged-in Dashboard (Super Admin or Sub-Admin)
  const handleChangePasswordInside = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePassStatus(null);

    const curr = currentPassInput.trim();
    const newP = newPassInput.trim();
    const confP = confirmPassInput.trim();

    if (!curr || !newP || !confP) {
      setChangePassStatus({ text: 'कृपया सर्व रकाने भरा.', type: 'error' });
      return;
    }

    if (newP.length < 4) {
      setChangePassStatus({ text: 'नवीन पासवर्ड किमान 4 अक्षरांचा असावा.', type: 'error' });
      return;
    }

    if (newP !== confP) {
      setChangePassStatus({ text: 'नवीन पासवर्ड आणि पुष्टीकरण पासवर्ड जुळत नाहीत.', type: 'error' });
      return;
    }

    try {
      const { ok, data } = await authApiRequest<{ status: string; message?: string }>(
        '/api/auth/admin-change-password',
        { currentPassword: curr, newPassword: newP }
      );
      if (!ok || data?.status !== 'success') {
        setChangePassStatus({ text: data?.message || 'सध्याचा चालू पासवर्ड चुकीचा आहे.', type: 'error' });
        return;
      }

      setChangePassStatus({
        text: '✓ पासवर्ड यशस्वीपणे बदलण्यात आला आहे! हा पासवर्ड क्लाउडवर सेव्ह झाला असून आता सर्व मोबाईल व उपकरणांवरून लॉगिन करताना हाच पासवर्ड चालेल.',
        type: 'success'
      });
      setCurrentPassInput('');
      setNewPassInput('');
      setConfirmPassInput('');
    } catch (err: any) {
      setChangePassStatus({ text: 'पासवर्ड बदलताना त्रुटी: ' + err.message, type: 'error' });
    }
  };

  // Manage Admins: Add New Sub-Admin
  const handleAddAdminUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminActionMsg(null);

    const targetEmail = newAdminEmail.trim().toLowerCase();
    if (!targetEmail || !targetEmail.includes('@')) {
      setAdminActionMsg({ text: 'कृपया योग्य ई-मेल आयडी प्रविष्ट करा.', type: 'error' });
      return;
    }

    if (targetEmail === DEFAULT_ADMIN_EMAIL.toLowerCase() || adminUsersList.some((u) => u.email.toLowerCase() === targetEmail)) {
      setAdminActionMsg({ text: 'हा ई-मेल आधीच व्यवस्थापक म्हणून नोंदणीकृत आहे.', type: 'error' });
      return;
    }

    if (!hasAnyAdminPermission(newAdminPermissions)) {
      setAdminActionMsg({ text: 'कृपया या व्यवस्थापकासाठी किमान एक अधिकार निवडा.', type: 'error' });
      return;
    }

    try {
      setIsSubmittingAdmin(true);
      const newAdmin: AdminUser = {
        id: `admin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        email: targetEmail,
        name: newAdminName.trim() || undefined,
        isFirstLogin: true,
        permissions: normalizeAdminPermissions(newAdminPermissions),
        createdAt: new Date().toISOString(),
      };

      await saveAdminUser(newAdmin);
      const updated = await fetchAdminUsers();
      setAdminUsersList(updated);
      setNewAdminEmail('');
      setNewAdminName('');
      setNewAdminPermissions({
        ...ALL_ADMIN_PERMISSIONS_FALSE,
        approveMembers: true,
      });
      setAdminActionMsg({
        text: `व्यवस्थापक (${targetEmail}) यशस्वीपणे जोडला! ते पहिल्या लॉगिन वेळी स्वतःचा पासवर्ड तयार करू शकतील.`,
        type: 'success',
      });
    } catch (err: any) {
      setAdminActionMsg({ text: 'व्यवस्थापक जोडताना त्रुटी आली: ' + (err.message || 'Error'), type: 'error' });
    } finally {
      setIsSubmittingAdmin(false);
    }
  };

  // Manage Admins: Start Editing Existing Sub-Admin Permissions
  const handleStartEditPermissions = (subAdmin: AdminUser) => {
    setAdminActionMsg(null);
    setEditingAdminId(subAdmin.id);
    setEditingPermissions(normalizeAdminPermissions(subAdmin.permissions));
  };

  // Manage Admins: Save Updated Permissions for Existing Sub-Admin
  const handleSaveAdminPermissions = async (subAdmin: AdminUser) => {
    setAdminActionMsg(null);
    if (!hasAnyAdminPermission(editingPermissions)) {
      setAdminActionMsg({ text: 'कृपया या व्यवस्थापकासाठी किमान एक अधिकार निवडा.', type: 'error' });
      return;
    }

    try {
      setIsUpdatingAdminPerms(true);
      const updatedAdmin: AdminUser = {
        ...subAdmin,
        permissions: normalizeAdminPermissions(editingPermissions),
      };
      await saveAdminUser(updatedAdmin);
      const updatedList = await fetchAdminUsers();
      setAdminUsersList(updatedList);
      setEditingAdminId(null);
      setAdminActionMsg({
        text: `✓ ${subAdmin.email} यांचे अधिकार यशस्वीपणे अद्ययावत (Update) करण्यात आले!`,
        type: 'success',
      });
    } catch (err: any) {
      setAdminActionMsg({
        text: 'अधिकार अद्ययावत करताना त्रुटी आली: ' + (err.message || 'Error'),
        type: 'error',
      });
    } finally {
      setIsUpdatingAdminPerms(false);
    }
  };

  // Manage Admins: Delete Sub-Admin
  const handleDeleteAdmin = async (id: string, targetEmail: string) => {
    try {
      await deleteAdminUser(id);
      if (editingAdminId === id) {
        setEditingAdminId(null);
      }
      const updated = await fetchAdminUsers();
      setAdminUsersList(updated);
      setAdminActionMsg({ text: `${targetEmail} यांचे व्यवस्थापक अधिकार काढण्यात आले.`, type: 'success' });
    } catch (err: any) {
      setAdminActionMsg({ text: 'व्यवस्थापक हटवताना त्रुटी आली.', type: 'error' });
    }
  };

  // Manage Admins: Reset Sub-Admin Password (allow them to set new password from any mobile)
  const handleResetSubAdmin = async (id: string, targetEmail: string) => {
    try {
      await resetAdminUserToFirstLogin(id);
      const updated = await fetchAdminUsers();
      setAdminUsersList(updated);
      setAdminActionMsg({
        text: `✓ ${targetEmail} यांचा पासवर्ड यशस्वीरीत्या रिसेट करण्यात आला! ते आता कोणत्याही मोबाईलवरून लॉगिन करताना नवीन पासवर्ड तयार करू शकतील.`,
        type: 'success',
      });
    } catch (err: any) {
      setAdminActionMsg({ text: 'पासवर्ड रिसेट करताना त्रुटी आली: ' + (err.message || 'Error'), type: 'error' });
    }
  };

  // Fetch unified website contact messages + contact@mahasangh.in IMAP inbox
  const loadContactMessages = async () => {
    setIsLoadingContacts(true);
    setMailboxError('');
    try {
      const [contactsRes, mailboxRes] = await Promise.allSettled([
        fetchContactsForAdmin(),
        fetch(`/api/mailbox/messages?limit=40&_t=${Date.now()}`, {
          credentials: 'include',
          cache: 'no-store',
          headers: { ...getAuthHeaders() },
        }).then((r) => r.json()),
      ]);

      if (contactsRes.status === 'fulfilled' && Array.isArray(contactsRes.value)) {
        setContactMessages(contactsRes.value);
      }

      if (mailboxRes.status === 'fulfilled' && mailboxRes.value) {
        const mb = mailboxRes.value;
        if (mb.account) setMailboxAccount(mb.account);
        if (Array.isArray(mb.items)) {
          setMailboxEmails(mb.items);
        }
        if (mb.status === 'error' && mb.message) {
          setMailboxError(mb.message);
        }
      } else {
        setMailboxError('ईमेल सर्व्हरशी संपर्क साधता आला नाही.');
      }
    } catch (e: any) {
      console.warn('Failed to fetch unified inbox:', e);
      setMailboxError(e?.message || 'संदेश लोड करताना त्रुटी आली.');
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const handleDeleteContactMessage = async (id: string) => {
    try {
      await deleteContactMessageFromFirestore(id);
      setContactMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      console.warn('Delete contact message failed:', e);
    }
  };

  const handleToggleMailboxEmailRead = async (emailItem: MailboxEmailItem) => {
    const nextRead = !emailItem.isRead;
    setMailboxEmails((prev) =>
      prev.map((m) => (m.uid === emailItem.uid ? { ...m, isRead: nextRead } : m))
    );
    try {
      const res = await fetch('/api/mailbox/mark-read', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ uid: emailItem.uid, isRead: nextRead, folder: emailItem.folder || 'INBOX' }),
      });
      if (!res.ok) throw new Error('Mark read failed');
      showAdminFeedback(nextRead ? 'ईमेल वाचलेला म्हणून चिन्हांकित केला.' : 'ईमेल अनरीड केला.', 'success');
    } catch {
      setMailboxEmails((prev) =>
        prev.map((m) => (m.uid === emailItem.uid ? { ...m, isRead: !nextRead } : m))
      );
      showAdminFeedback('ईमेल स्थिती अपडेट करताना अडचण आली.', 'error');
    }
  };

  const handleDeleteMailboxEmail = async (emailItem: MailboxEmailItem) => {
    try {
      const res = await fetch(
        `/api/mailbox/message/${emailItem.uid}?folder=${encodeURIComponent(emailItem.folder || 'INBOX')}`,
        { method: 'DELETE', credentials: 'include', headers: { ...getAuthHeaders() } }
      );
      if (!res.ok) throw new Error('Delete failed');
      setMailboxEmails((prev) => prev.filter((m) => m.uid !== emailItem.uid));
      showAdminFeedback('ईमेल इनबॉक्समधून हटवण्यात आला.', 'success');
    } catch {
      showAdminFeedback('ईमेल हटवताना त्रुटी आली.', 'error');
    }
  };

  const handleOpenReplyModal = (opts: {
    to: string;
    recipientName?: string;
    subject?: string;
    replyToMessageId?: string;
    contextLabel?: string;
  }) => {
    const rawSubject = (opts.subject || '').trim();
    const formattedSubject = rawSubject
      ? /^re:/i.test(rawSubject)
        ? rawSubject
        : `Re: ${rawSubject}`
      : 'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ — संपर्क उत्तर';
    const greeting = opts.recipientName
      ? `सप्रेम नमस्कार ${opts.recipientName} जी,\n\n`
      : 'सप्रेम नमस्कार,\n\n';

    setReplyModal({
      open: true,
      to: opts.to || '',
      recipientName: opts.recipientName || '',
      subject: opts.to ? formattedSubject : '',
      body: greeting,
      replyToMessageId: opts.replyToMessageId || '',
      contextLabel: opts.contextLabel || '',
      isSending: false,
      error: '',
    });
  };

  const handleSendMailboxReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyModal || replyModal.isSending) return;
    const to = replyModal.to.trim();
    const subject = replyModal.subject.trim();
    const text = replyModal.body.trim();

    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setReplyModal((prev) => prev ? { ...prev, error: 'कृपया वैध ईमेल पत्ता (To Email) टाका.' } : prev);
      return;
    }
    if (!subject || !text) {
      setReplyModal((prev) => prev ? { ...prev, error: 'कृपया विषय आणि उत्तर मजकूर भरा.' } : prev);
      return;
    }

    setReplyModal((prev) => prev ? { ...prev, isSending: true, error: '' } : prev);
    try {
      const res = await fetch('/api/mailbox/send', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          to,
          subject,
          text,
          replyToMessageId: replyModal.replyToMessageId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.status === 'error') {
        throw new Error(data.message || 'ईमेल पाठवता आला नाही.');
      }
      setReplyModal(null);
      showAdminFeedback(`✓ '${to}' यांना ${mailboxAccount} वरून ईमेल यशस्वीपणे पाठवला!`, 'success');
    } catch (err: any) {
      setReplyModal((prev) =>
        prev ? { ...prev, isSending: false, error: err?.message || 'ईमेल पाठवताना त्रुटी आली.' } : prev
      );
    }
  };

  useEffect(() => {
    if (
      isLoggedIn &&
      (currentUser?.isSuperAdmin || currentUser?.permissions.manageContactMessages) &&
      (activeAdminSubTab === 'contact_messages' || (contactMessages.length === 0 && mailboxEmails.length === 0))
    ) {
      loadContactMessages();
    }
  }, [isLoggedIn, activeAdminSubTab, currentUser?.isSuperAdmin, currentUser?.permissions.manageContactMessages]);

  // Open Verification Modal for an Application (optionally straight into reject-reason view)
  const handleOpenVerification = (app: MembershipApplication, openReject = false) => {
    setSelectedAppForVerification(app);
    setPaymentConfirmedChecked(openReject ? true : (app.paymentConfirmed || false));
    setShowRejectInput(openReject);
    setRejectReason('');
    setVerificationErrorMsg('');
  };

  // Approve Application atomically inside single Firestore Transaction (zero duplicate numbers)
  const handleApproveVerified = async () => {
    if (!selectedAppForVerification || isApprovingApp) return;
    if (!paymentConfirmedChecked) {
      setVerificationErrorMsg('कृपया सदस्यत्व व वर्गणी फी बँक खात्यावर जमा झाल्याची खात्री करणारा टिक बॉक्स निवडा.');
      return;
    }
    setVerificationErrorMsg('');
    setIsApprovingApp(true);
    try {
      const atomicResult = await approveApplicationAtomicInFirestore({
        appId: selectedAppForVerification.id,
        district: selectedAppForVerification.district,
        knownRecords: applications,
        extraUpdates: {
          paymentConfirmed: true,
        },
      });

      const resolvedNumber = atomicResult.memberNumber;
      onApproveApplication(selectedAppForVerification.id, resolvedNumber, { skipFirestore: true });
      addApprovedMemberToCache({
        ...selectedAppForVerification,
        ...atomicResult.application,
        status: 'approved',
        memberNumber: resolvedNumber,
        approvedAt: atomicResult.application.approvedAt || new Date().toISOString(),
        paymentConfirmed: true
      });
      showAdminFeedback(
        `${selectedAppForVerification.fullName} यांचा अर्ज मंजूर झाला! क्रमांक: ${resolvedNumber}`,
        'success'
      );
      setSelectedAppForVerification(null);
    } catch (err: any) {
      setVerificationErrorMsg('मंजुरी देताना तांत्रिक त्रुटी आली: ' + (err?.message || 'कृपया इंटरनेट तपासून पुन्हा प्रयत्न करा.'));
    } finally {
      setIsApprovingApp(false);
    }
  };

  // Reject Application cleanly without native browser prompt/alert
  const handleRejectVerified = () => {
    if (!selectedAppForVerification) return;
    if (!showRejectInput) {
      setShowRejectInput(true);
      setVerificationErrorMsg('');
      return;
    }

    const rejectedName = selectedAppForVerification.fullName;
    onRejectApplication(selectedAppForVerification.id, rejectReason.trim() || 'प्रशासनाकडून नाकारले');
    setSelectedAppForVerification(null);
    showAdminFeedback(`${rejectedName} यांचा अर्ज नाकारण्यात आला.`, 'success');
  };

  // Handle Photo selection for Leader with client-side super-compression (15KB - 25KB)
  const handleLeaderPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setLeaderFormMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setLeaderFormMsg({ text: 'कृपया वैध फोटो फाईल (JPG किंवा PNG) निवडा.', type: 'error' });
      return;
    }

    if (cloudinaryConfig.enabled && cloudinaryConfig.cloudName && cloudinaryConfig.uploadPreset) {
      setIsUploadingLeaderCloudinary(true);
      try {
        const result = await uploadToCloudinary(file, cloudinaryConfig);
        setLeaderPhoto(result.url);
        setLeaderPhotoUrl(result.url);
        setLeaderPhotoSizeKb(0);
        setLeaderFormMsg({ text: '✓ फोटो थेट हाय-स्पीड मिडिया सर्व्हरवर सेव्ह झाला!', type: 'success' });
      } catch (err: any) {
        console.warn('Cloudinary leader upload error, falling back to local compression:', err);
        try {
          const { base64, sizeKb } = await compressImageFile(file, 240, 240, 0.72);
          setLeaderPhoto(base64);
          setLeaderPhotoSizeKb(sizeKb);
          setLeaderPhotoUrl('');
          setLeaderFormMsg({ text: 'सर्व्हर त्रुटी, स्थानिक कॉम्प्रेस केलेला फोटो वापरला (' + sizeKb + ' KB).', type: 'error' });
        } catch {
          setLeaderFormMsg({ text: 'फोटो अपलोड करताना अडचण आली.', type: 'error' });
        }
      } finally {
        setIsUploadingLeaderCloudinary(false);
      }
    } else {
      try {
        // Automatically compress down to ~20KB to protect Firebase quota 100%
        const { base64, sizeKb } = await compressImageFile(file, 240, 240, 0.72);
        setLeaderPhoto(base64);
        setLeaderPhotoSizeKb(sizeKb);
        setLeaderPhotoUrl('');
      } catch (err: any) {
        setLeaderFormMsg({ text: 'फोटो कॉम्प्रेस करताना अडचण आली: ' + (err.message || ''), type: 'error' });
      }
    }
  };

  // Add or Edit Leader in selected category (State Leadership OR District Leadership)
  const handleSaveLeader = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeaderFormMsg(null);

    const isDistrictTab = activeAdminSubTab === 'district_leadership';

    if (isDistrictTab && !leaderRegion.trim()) {
      setLeaderFormMsg({ text: 'कृपया जिल्हा निवडा.', type: 'error' });
      return;
    }

    if (isDistrictTab && (!leaderName.trim() || !leaderRole.trim())) {
      setLeaderFormMsg({ text: 'कृपया नाव आणि पद आवश्यकपणे भरा.', type: 'error' });
      return;
    }

    if (!isDistrictTab && !leaderRole.trim()) {
      setLeaderFormMsg({ text: 'कृपया पद (Role) आवश्यकपणे भरा.', type: 'error' });
      return;
    }

    const effectiveLeaderName = isDistrictTab ? leaderName.trim() : (leaderName.trim() || '-');

    const targetCategory: Leader['category'] = isDistrictTab
      ? districtLeaderMode
      : leaderCategory === 'राज्य सल्लागार मंडळ'
        ? advisorySubTab
        : leaderCategory;

    setIsSavingLeader(true);
    let savedOk = false;
    try {
      if (editingLeaderId) {
        // Update existing leader
        const updated = dynamicLeaders.map((l) => {
          if ((l.id || l.name) === editingLeaderId) {
            return {
              ...l,
              name: effectiveLeaderName,
              role: leaderRole.trim(),
              region: leaderRegion.trim() || 'महाराष्ट्र',
              phone: leaderPhone.trim() || '-',
              education: leaderEducation.trim() || '',
              photo: leaderPhoto,
              category: isDistrictTab ? l.category : targetCategory
            };
          }
          return l;
        });
        savedOk = await saveLeadersToStorage(updated);
        if (savedOk) {
          setLeaderFormMsg({ text: 'पदाधिकारी माहिती यशस्वीपणे अद्यतनित झाली!', type: 'success' });
        }
      } else if (isDistrictTab) {
        // If a placeholder slot exists for the same district and mode, fill it in place to preserve district row order
        const normTarget = normalizeDistrictAlias(leaderRegion);
        const placeholderIdx = dynamicLeaders.findIndex((l) => {
          const sameMode =
            districtLeaderMode === 'जिल्हा अध्यक्ष'
              ? l.category === 'जिल्हा अध्यक्ष' || l.category === 'district'
              : l.category === 'जिल्हा सरचिटणीस';
          return (
            sameMode &&
            normalizeDistrictAlias(l.region) === normTarget &&
            isPlaceholderDistrictName(l.name)
          );
        });

        if (placeholderIdx !== -1) {
          const updated = [...dynamicLeaders];
          updated[placeholderIdx] = {
            ...updated[placeholderIdx],
            name: effectiveLeaderName,
            role: leaderRole.trim(),
            region: leaderRegion.trim(),
            phone: leaderPhone.trim() || '-',
            education: leaderEducation.trim() || '',
            photo: leaderPhoto || updated[placeholderIdx].photo || '',
            category: districtLeaderMode
          };
          savedOk = await saveLeadersToStorage(updated);
        } else {
          const newLeader: Leader = {
            id: `ldr-${Date.now()}`,
            name: effectiveLeaderName,
            role: leaderRole.trim(),
            region: leaderRegion.trim(),
            phone: leaderPhone.trim() || '-',
            education: leaderEducation.trim() || '',
            photo: leaderPhoto,
            category: districtLeaderMode
          };
          savedOk = await saveLeadersToStorage([...dynamicLeaders, newLeader]);
        }
        if (savedOk) {
          setLeaderFormMsg({ text: `${districtLeaderMode} माहिती यशस्वीपणे जतन झाली!`, type: 'success' });
        }
      } else {
        // Add new state/advisory leader (vacant post allowed with '-' when name is empty)
        const newLeader: Leader = {
          id: `ldr-${Date.now()}`,
          name: effectiveLeaderName,
          role: leaderRole.trim(),
          region: leaderRegion.trim() || 'महाराष्ट्र',
          phone: leaderPhone.trim() || '-',
          education: leaderEducation.trim() || '',
          photo: leaderPhoto,
          category: targetCategory
        };
        savedOk = await saveLeadersToStorage([newLeader, ...dynamicLeaders]);
        if (savedOk) {
          setLeaderFormMsg({ text: 'नवीन पदाधिकारी यशस्वीपणे जोडले गेले!', type: 'success' });
        }
      }
    } finally {
      setIsSavingLeader(false);
    }

    if (!savedOk) return;

    // Reset Form only on successful save
    setEditingLeaderId(null);
    setLeaderName('');
    setLeaderRole(isDistrictTab ? districtLeaderMode : '');
    setLeaderRegion('');
    setLeaderPhone('');
    setLeaderEducation('');
    setLeaderPhoto('');
    setLeaderPhotoSizeKb(0);
    setLeaderPhotoUrl('');
    if (leaderPhotoInputRef.current) leaderPhotoInputRef.current.value = '';
    setTimeout(() => setLeaderFormMsg(null), 3500);
  };

  // Start Editing Leader
  const handleEditLeader = (leader: Leader) => {
    setEditingLeaderId(leader.id || leader.name);
    setLeaderName(isPlaceholderDistrictName(leader.name) ? '' : leader.name);
    setLeaderRole(leader.role || (activeAdminSubTab === 'district_leadership' ? districtLeaderMode : ''));
    setLeaderRegion(normalizeDistrictAlias(leader.region) || leader.region);
    setLeaderPhone(leader.phone === '-' ? '' : leader.phone);
    setLeaderEducation(leader.education || '');
    setLeaderPhoto(leader.photo || '');
    setLeaderPhotoSizeKb(0);
    setLeaderPhotoUrl(leader.photo && leader.photo.startsWith('http') ? leader.photo : '');
    if (activeAdminSubTab === 'district_leadership' && districtLeaderFormRef.current) {
      districtLeaderFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  };

  // Delete Leader
  const handleDeleteLeader = async (leaderId?: string, leaderName?: string) => {
    const filtered = dynamicLeaders.filter((l) => (l.id ? l.id !== leaderId : l.name !== leaderName));
    const ok = await saveLeadersToStorage(filtered);
    if (ok) {
      setLeaderFormMsg({ text: `'${leaderName || 'पदाधिकारी'}' यांना यादीतून वगळण्यात आले आहे.`, type: 'success' });
      setTimeout(() => setLeaderFormMsg(null), 3500);
    }
  };

  // Create or Update News / GR
  const handleCreateNews = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsTitle.trim() || !newsSummary.trim() || !newsContent.trim()) {
      setNewsError('कृपया बातमीचे शीर्षक, सारांश आणि सविस्तर मजकूर भरा.');
      return;
    }
    setNewsError('');

    const displayDate = formatPublishDateToDisplay(newsDate);
    const publishDateStr = newsDate || new Date().toISOString().split('T')[0];

    if (editingNewsItem) {
      const updatedPost: NewsItem = {
        ...editingNewsItem,
        title: toEnglishDigits(newsTitle.trim()),
        date: displayDate,
        publishDate: publishDateStr,
        category: newsCategory,
        summary: toEnglishDigits(newsSummary.trim()),
        content: toEnglishDigits(newsContent.trim()),
        image: newsImageUrl || undefined,
        imageUrl: newsImageUrl || undefined,
      };

      if (onUpdateNews) {
        onUpdateNews(updatedPost);
      } else {
        onAddNews(updatedPost);
      }

      setNewsCreatedSuccess(true);
      setEditingNewsItem(null);
      setNewsTitle('');
      setNewsSummary('');
      setNewsContent('');
      setNewsImageUrl('');
      setNewsDate(new Date().toISOString().split('T')[0]);
      setTimeout(() => setNewsCreatedSuccess(false), 4000);
      return;
    }

    const newPost: NewsItem = {
      id: `post-${Date.now()}`,
      title: toEnglishDigits(newsTitle.trim()),
      date: displayDate,
      publishDate: publishDateStr,
      category: newsCategory,
      summary: toEnglishDigits(newsSummary.trim()),
      content: toEnglishDigits(newsContent.trim()),
      image: newsImageUrl || undefined,
      imageUrl: newsImageUrl || undefined,
      featured: false,
      createdAt: new Date().toISOString(),
    };

    onAddNews(newPost);
    setNewsCreatedSuccess(true);
    setNewsTitle('');
    setNewsSummary('');
    setNewsContent('');
    setNewsImageUrl('');
    setNewsDate(new Date().toISOString().split('T')[0]);
    setTimeout(() => setNewsCreatedSuccess(false), 4000);
  };

  const handleCreateGovOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setGoError('');

    const newGovOrder: GovOrder = {
      id: `go-${Date.now()}`,
      title: toEnglishDigits(goTitle.trim()),
      date: goDate || new Date().toISOString().split('T')[0],
      type: goType,
      fileUrl: goFileUrl || undefined,
      driveUrl: goDriveUrl || undefined,
      summary: toEnglishDigits(goSummary.trim()),
      createdAt: new Date().toISOString(),
    };

    try {
        await saveGovOrderToFirestore(newGovOrder);
        setGovOrders(prev => [newGovOrder, ...prev]);
        setGoCreatedSuccess(true);
        setGoTitle('');
        setGoSummary('');
        setGoFileUrl('');
        setGoDriveUrl('');
        setGoDate(new Date().toISOString().split('T')[0]);
        setTimeout(() => setGoCreatedSuccess(false), 4000);
    } catch (err: any) {
        setGoError('शासन निर्णय सेव्ह करताना त्रुटी: ' + err.message);
    }
  };

  const handleDeleteGovOrder = (id: string) => {
    setConfirmDialog({
      title: 'शासन निर्णय हटवा',
      message: 'हा शासन निर्णय / परिपत्रक कायमचे हटवायचे आहे का?',
      confirmLabel: 'होय, हटवा',
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteGovOrderFromFirestore(id);
          setGovOrders(prev => prev.filter(go => go.id !== id));
          showAdminFeedback('शासन निर्णय यशस्वीरीत्या हटवला गेला.', 'success');
        } catch (err: any) {
          showAdminFeedback('हटवताना त्रुटी: ' + err.message, 'error');
        }
      },
    });
  };

  // Start Editing News
  const handleStartEditNews = (item: NewsItem) => {
    setEditingNewsItem(item);
    setNewsTitle(item.title || '');
    setNewsDate(parseDateStringToYYYYMMDD(item.publishDate || item.date || ''));
    setNewsCategory(item.category || 'अधिकृत घोषणा');
    setNewsSummary(item.summary || '');
    setNewsContent(item.content || '');
    setNewsImageUrl(item.imageUrl || item.image || '');
    setNewsManageMode('form');
    setNewsError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Cancel Editing
  const handleCancelEditNews = () => {
    setEditingNewsItem(null);
    setNewsTitle('');
    setNewsSummary('');
    setNewsContent('');
    setNewsImageUrl('');
    setNewsDate(new Date().toISOString().split('T')[0]);
    setNewsError('');
  };

  // Delete News with fallback for corrupt/missing titles
  const handleDeleteNewsItem = (item: NewsItem) => {
    const displayTitle = item.title || (item as any).headline || 'ही बातमी';
    setConfirmDialog({
      title: 'बातमी / परिपत्रक हटवा',
      message: `आपण खात्रीने '${displayTitle}' ही बातमी / परिपत्रक / फोटो हटवू इच्छिता?`,
      confirmLabel: 'होय, हटवा',
      isDanger: true,
      onConfirm: () => {
        if (onDeleteNews) {
          onDeleteNews(item.id);
        }
        showAdminFeedback('बातमी यशस्वीरीत्या हटवण्यात आली.', 'success');
      },
    });
  };

  // Live Preview Handlers
  const handleOpenLivePreview = () => {
    if (!newsTitle.trim()) {
      setNewsError('प्रिव्ह्यू पाहण्यासाठी किमान बातमीचे शीर्षक भरा.');
      return;
    }
    setNewsError('');
    setPreviewNewsItem({
      id: editingNewsItem ? editingNewsItem.id : 'preview-temp',
      title: newsTitle.trim(),
      category: newsCategory,
      date: formatPublishDateToDisplay(newsDate),
      publishDate: newsDate,
      summary: newsSummary.trim(),
      content: newsContent.trim(),
      image: newsImageUrl || undefined,
      imageUrl: newsImageUrl || undefined,
    });
  };

  const filteredApps = (applications || []).filter((app) => {
    if (!app) return false;
    const matchesFilter = filterStatus === 'all' || app.status === filterStatus;
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return matchesFilter;

    const matchesSearch =
      (app.fullName || '').toLowerCase().includes(q) ||
      (app.applicationNumber || '').toLowerCase().includes(q) ||
      (app.phone || '').includes(q) ||
      (app.district && app.district.toLowerCase().includes(q));
    return matchesFilter && matchesSearch;
  });

  const visibleFilteredApps = filteredApps.slice(0, appsVisibleCount);

  const totalCount = applications.length;
  const approvedCount = applications.filter((a) => a.status === 'approved').length;
  const pendingCount = applications.filter((a) => a.status === 'pending').length;
  const rejectedCount = applications.filter((a) => a.status === 'rejected').length;

  // Ordered Navigation Items tailored for Mobile Bottom Bar + Bottom Sheet Drawer + Desktop Sidebar
  const adminNavItems: Array<{
    key: AdminSubTabKey;
    label: string;
    shortLabel: string;
    icon: React.ReactNode;
    badge?: number;
    allowed: boolean;
  }> = [
    {
      key: 'applications',
      label: `सदस्यत्व अर्ज (${toEnglishDigits(totalCount)})`,
      shortLabel: 'अर्ज',
      icon: <Users className="w-4 h-4 shrink-0" />,
      badge: pendingCount > 0 ? pendingCount : undefined,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.approveMembers),
    },
    {
      key: 'edit_members',
      label: 'सदस्य एडिट व दुरुस्ती',
      shortLabel: 'एडिट',
      icon: <Edit3 className="w-4 h-4 shrink-0" />,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.editMembers),
    },
    {
      key: 'leadership',
      label: 'राज्य पदाधिकारी',
      shortLabel: 'राज्य पदे',
      icon: <Award className="w-4 h-4 shrink-0" />,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.manageLeadership),
    },
    {
      key: 'district_leadership',
      label: 'जिल्हा कार्यकारिणी',
      shortLabel: 'जिल्हा पदे',
      icon: <Users className="w-4 h-4 shrink-0 text-amber-600" />,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.manageLeadership),
    },
    {
      key: 'master_studio',
      label: 'Master Studio',
      shortLabel: 'Studio',
      icon: <Award className="w-4 h-4 shrink-0 text-amber-500" />,
      allowed: Boolean(currentUser?.isSuperAdmin),
    },
    {
      key: 'whatsapp_broadcast',
      label: 'व्हॉट्सॲप संदेश (API)',
      shortLabel: 'WhatsApp',
      icon: <Smartphone className="w-4 h-4 shrink-0 text-emerald-600" />,
      allowed: Boolean(currentUser?.isSuperAdmin),
    },
    {
      key: 'backup_restore',
      label: 'बॅकअप व रिस्टोअर',
      shortLabel: 'बॅकअप',
      icon: <Database className="w-4 h-4 shrink-0 text-[#193568]" />,
      allowed: Boolean(currentUser?.isSuperAdmin),
    },
    {
      key: 'add_news',
      label: 'बातम्या व परिपत्रके',
      shortLabel: 'बातम्या',
      icon: <FileText className="w-4 h-4 shrink-0" />,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.manageNews),
    },
    {
      key: 'gov_order',
      label: 'शासन निर्णय (GR)',
      shortLabel: 'GR',
      icon: <FileText className="w-4 h-4 shrink-0" />,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.manageGovOrders),
    },
    {
      key: 'latest_banners',
      label: 'ताज्या घडामोडी बॅनर्स',
      shortLabel: 'बॅनर्स',
      icon: <ImageIcon className="w-4 h-4 shrink-0" />,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.manageLatestBanners),
    },
    {
      key: 'print_id_cards',
      label: 'नवीन आयकार्ड प्रिंट करा',
      shortLabel: 'प्रिंट आयकार्ड',
      icon: <Award className="w-4 h-4 shrink-0 text-amber-600" />,
      allowed: Boolean(currentUser?.isSuperAdmin),
    },
    {
      key: 'id_card_preview',
      label: 'आय-कार्ड डिझाईन नमुना',
      shortLabel: 'आय-कार्ड',
      icon: <Award className="w-4 h-4 shrink-0" />,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.viewIdCardPreview),
    },
    {
      key: 'contact_messages',
      label: `प्राप्त संदेश (${toEnglishDigits(contactMessages.length + mailboxEmails.length)})`,
      shortLabel: 'संदेश',
      icon: <MessageSquare className="w-4 h-4 shrink-0" />,
      badge: contactMessages.length + mailboxEmails.length > 0 ? contactMessages.length + mailboxEmails.length : undefined,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.manageContactMessages),
    },
    {
      key: 'manage_admins',
      label: 'व्यवस्थापक (Admins)',
      shortLabel: 'ॲडमिन',
      icon: <Shield className="w-4 h-4 shrink-0" />,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.manageAdmins),
    },
    {
      key: 'cloudinary',
      label: 'क्लाउड स्टोरेज',
      shortLabel: 'स्टोरेज',
      icon: <Cloud className="w-4 h-4 shrink-0" />,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.manageCloudinary),
    },
    {
      key: 'password',
      label: 'पासवर्ड बदला',
      shortLabel: 'पासवर्ड',
      icon: <KeyRound className="w-4 h-4 shrink-0" />,
      allowed: true,
    },
  ];

  const permittedNavItems = adminNavItems.filter((item) => item.allowed);
  const mobileQuickNavItems = permittedNavItems.slice(0, 4);

  const handleSelectAdminTab = (tabKey: AdminSubTabKey) => {
    setActiveAdminSubTab(tabKey);
    setIsMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div
      className={`allow-copy admin-panel bg-[#fbf8f2] text-[#102a43] min-h-screen ${
        isLoggedIn ? 'pb-24 lg:pb-10' : 'pb-12'
      }`}
    >
      {/* Official Brand Sticky Header matching mahasangh.in */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-[#132b52] via-[#193568] to-[#0b1e36] text-white border-b-2 border-[#efb24b] shadow-md">
        <div className="max-w-[1280px] mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <img
              src="/logo.png"
              alt="महासंघ अधिकृत मानचिन्ह"
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-full ring-2 ring-[#efb24b] bg-white object-contain shrink-0"
            />
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-bold text-[#efb24b] tracking-wide truncate leading-tight">
                महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ
              </p>
              <h1 className="font-serifDevanagari text-sm sm:text-lg font-bold text-white truncate leading-tight">
                अधिकृत प्रशासन कक्ष (Admin Panel)
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onExitAdmin && (
              <button
                type="button"
                onClick={onExitAdmin}
                className="min-h-[40px] px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="मुख्य वेबसाईटवर परत जा"
              >
                <ArrowLeft className="w-4 h-4 text-[#efb24b]" />
                <span className="hidden sm:inline">मुख्य वेबसाईटवर जा</span>
                <span className="sm:hidden">वेबसाईट</span>
              </button>
            )}

            {isLoggedIn && (
              <button
                type="button"
                onClick={() => {
                  clearAuthSessionToken();
                  fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
                  setIsLoggedIn(false);
                  setCurrentUser(null);
                  setIsMobileMenuOpen(false);
                }}
                className="min-h-[40px] px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-[#df6b16] hover:bg-[#c85c0e] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                title="प्रशासन कक्षातून बाहेर पडा"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">बाहेर पडा (Logout)</span>
                <span className="sm:hidden">बाहेर</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1280px] mx-auto px-3 sm:px-6 pt-5 sm:pt-7">
        {!isLoggedIn ? (
          /* Official Brand Login Card */
          <div className="max-w-md mx-auto py-4 sm:py-8">
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-[#e7ded1] shadow-lg">
              {isFirstLoginMode ? (
                /* First Login Password Setup Mode for Sub-Admins */
                <div>
                  <div className="w-14 h-14 bg-[#fff5e8] border border-[#efb24b]/60 rounded-full flex items-center justify-center text-[#df6b16] mb-4 mx-auto">
                    <UserPlus className="w-7 h-7" />
                  </div>
                  <h2 className="font-serifDevanagari text-xl font-bold text-center text-[#0b1e36] mb-1">
                    नवीन पासवर्ड तयार करा
                  </h2>
                  <p className="text-xs text-center text-[#607184] mb-3">
                    आपले ॲडमिन पॅनलमध्ये स्वागत आहे! आपण प्रथमच लॉगिन करत आहात.
                  </p>
                  <div className="bg-[#fbf8f2] border border-[#e7ded1] p-3 rounded-xl text-center text-xs mb-4">
                    ई-मेल: <strong className="text-[#0b1e36] font-mono">{firstLoginEmail}</strong>
                  </div>

                  {firstLoginError && (
                    <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>{firstLoginError}</span>
                    </div>
                  )}

                  {firstLoginSuccess && (
                    <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                      <span>{firstLoginSuccess}</span>
                    </div>
                  )}

                  <form onSubmit={handleFirstLoginSubmit} className="space-y-4">
                    <div>
                      <label className="font-bold text-xs text-[#102a43] block mb-1.5">
                        नवीन पासवर्ड तयार करा <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="password"
                        required
                        value={firstLoginNewPassword}
                        onChange={(e) => setFirstLoginNewPassword(e.target.value)}
                        placeholder="किमान 4 अक्षरी गुप्त पासवर्ड"
                        className="w-full px-3.5 py-3 text-base sm:text-sm bg-[#fbf8f2] border border-[#e7ded1] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#df6b16]"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-xs text-[#102a43] block mb-1.5">
                        पासवर्ड पुन्हा प्रविष्ट करा (Confirm Password) <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="password"
                        required
                        value={firstLoginConfirmPassword}
                        onChange={(e) => setFirstLoginConfirmPassword(e.target.value)}
                        placeholder="तोच पासवर्ड पुन्हा टाका"
                        className="w-full px-3.5 py-3 text-base sm:text-sm bg-[#fbf8f2] border border-[#e7ded1] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#df6b16]"
                      />
                    </div>

                    <div className="flex gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsFirstLoginMode(false)}
                        className="flex-1 min-h-[46px] bg-slate-100 hover:bg-slate-200 text-[#102a43] font-bold py-2.5 rounded-xl text-sm cursor-pointer"
                      >
                        रद्द करा
                      </button>
                      <button
                        type="submit"
                        className="flex-1 min-h-[46px] bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold py-2.5 rounded-xl text-sm shadow-sm cursor-pointer"
                      >
                        पासवर्ड सेव्ह करा
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div>
                  <div className="w-16 h-16 rounded-full ring-2 ring-[#efb24b] bg-[#fbf8f2] p-1 mx-auto mb-4 shadow-sm flex items-center justify-center">
                    <img
                      src="/logo.png"
                      alt="महासंघ मानचिन्ह"
                      className="w-full h-full object-contain rounded-full"
                    />
                  </div>
                  <h2 className="font-serifDevanagari text-2xl font-bold text-center text-[#0b1e36] mb-1">
                    प्रशासन लॉगिन
                  </h2>
                  <p className="text-xs sm:text-sm text-center text-[#607184] mb-6">
                    केवळ अधिकृत व्यवस्थापकांसाठी राखीव पोर्टल
                  </p>

                  {loginError && (
                    <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm rounded-xl flex items-center gap-2.5">
                      <ShieldAlert className="w-5 h-5 shrink-0" />
                      <span>{loginError}</span>
                    </div>
                  )}

                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label className="font-bold text-xs sm:text-sm text-[#102a43] block mb-1.5">
                        ई-मेल (Admin Email)
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="आपला ॲडमिन ई-मेल प्रविष्ट करा"
                        className="w-full px-3.5 py-3 text-base sm:text-sm bg-[#fbf8f2] border border-[#e7ded1] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#df6b16]"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-xs sm:text-sm text-[#102a43] block mb-1.5">
                        पासवर्ड (Password)
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="पासवर्ड प्रविष्ट करा"
                          className="w-full px-3.5 py-3 pr-12 text-base sm:text-sm bg-[#fbf8f2] border border-[#e7ded1] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#df6b16]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label="पासवर्ड पहा किंवा लपवा"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-[#607184] hover:text-[#0b1e36] focus:outline-none cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoggingIn}
                      className="w-full min-h-[48px] bg-[#0b1e36] hover:bg-[#193568] text-white font-bold py-3.5 rounded-xl text-base transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-75 cursor-pointer"
                    >
                      {isLoggingIn ? (
                        <>
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          <span>लॉगिन पडताळणी होत आहे...</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4 text-[#efb24b]" />
                          <span>Login करा</span>
                        </>
                      )}
                    </button>
                  </form>

                  <div className="mt-6 pt-5 border-t border-[#e7ded1] text-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (!email.trim()) {
                          setLoginError('कृपया आधी आपला अधिकृत ई-मेल प्रविष्ट करा.');
                          return;
                        }
                        setIsFirstLoginMode(true);
                        setFirstLoginEmail(email.trim().toLowerCase());
                        setFirstLoginError('');
                        setFirstLoginSuccess('');
                      }}
                      className="min-h-[44px] px-3 text-sm text-[#df6b16] hover:text-[#0b1e36] font-bold flex items-center justify-center gap-2 mx-auto transition-colors cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4" />
                      नवीन ॲडमिन? पासवर्ड तयार करा
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Authenticated Admin Dashboard Workspace */
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Desktop Left Navy Sidebar */}
            <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-[#0b1e36] text-white rounded-2xl border border-[#efb24b]/40 p-3 shadow-lg sticky top-20 space-y-1">
              <div className="px-3 py-2.5 mb-2 border-b border-white/10">
                <div className="flex items-center gap-2 text-xs font-bold text-[#efb24b]">
                  <Shield className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    {currentUser?.isSuperAdmin ? 'मुख्य प्रशासक' : currentUser?.name || 'सह-व्यवस्थापक'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 font-mono truncate mt-0.5">
                  {currentUser?.email}
                </p>
              </div>

              <nav className="space-y-1" aria-label="प्रशासन विभाग">
                {permittedNavItems.map((item) => {
                  const isActive = activeAdminSubTab === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handleSelectAdminTab(item.key)}
                      className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-colors cursor-pointer text-left ${
                        isActive
                          ? 'bg-[#efb24b] text-[#0b1e36] shadow-sm'
                          : 'text-slate-100 hover:bg-white/10'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        {item.icon}
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.badge !== undefined && (
                        <span
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums shrink-0 ${
                            isActive
                              ? 'bg-[#0b1e36] text-[#efb24b]'
                              : 'bg-[#df6b16] text-white'
                          }`}
                        >
                          {toEnglishDigits(item.badge)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </aside>

            {/* Main Right Workspace Column */}
            <main className="flex-1 min-w-0 w-full space-y-5">
              {/* Mobile Active Section Strip + Quick Menu Trigger */}
              <div className="lg:hidden bg-white border border-[#e7ded1] rounded-2xl px-3.5 py-2.5 shadow-2xs flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#df6b16]">
                    {currentUser?.isSuperAdmin ? 'मुख्य प्रशासक' : currentUser?.name || 'सह-व्यवस्थापक'}
                  </p>
                  <p className="font-serifDevanagari font-bold text-sm text-[#0b1e36] truncate">
                    {permittedNavItems.find((i) => i.key === activeAdminSubTab)?.label || 'प्रशासन'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-[#0b1e36] text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Menu className="w-4 h-4 text-[#efb24b]" />
                  <span>मेनू</span>
                </button>
              </div>

              {/* Unified Non-Blocking Feedback Banner */}
              {adminFeedbackBanner && (
                <div
                  className={`p-3.5 rounded-xl border text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 shadow-2xs ${
                    adminFeedbackBanner.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {adminFeedbackBanner.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span>{adminFeedbackBanner.text}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAdminFeedbackBanner(null)}
                    className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-black/5 shrink-0 cursor-pointer"
                    aria-label="बंद करा"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

            {/* Sub-tab 1: Applications */}
            {activeAdminSubTab === 'applications' && (currentUser?.isSuperAdmin || currentUser?.permissions.approveMembers) && (
              <div className="bg-white p-4 sm:p-6 rounded-2xl border border-[#e7ded1] shadow-xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e7ded1] pb-4">
                  <div>
                    <h3 className="font-serifDevanagari text-lg font-bold text-[#0b1e36]">
                      सदस्यत्व अर्ज तपासणी व मंजुरी
                    </h3>
                    <p className="text-xs text-[#607184] mt-0.5">
                      येथे प्राप्त झालेले सर्व अर्ज तपासा, बँक पेमेंट पडताळा व अधिकृत सदस्य क्रमांक द्या.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {currentUser?.isSuperAdmin && (
                      <>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => {
                              if (activeCircleAction === 'resequence') {
                                handleResequence();
                                setActiveCircleAction(null);
                              } else {
                                setActiveCircleAction('resequence');
                              }
                            }}
                            disabled={isResequencing}
                            className="min-w-[40px] min-h-[40px] rounded-xl bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50 px-2.5"
                            title="सर्व क्रमांक क्रमाने लावा"
                          >
                            {isResequencing ? '...' : 'क्रमाने लावा'}
                          </button>
                          {activeCircleAction === 'resequence' && (
                            <div className="absolute left-0 sm:left-auto sm:right-0 top-11 z-30 bg-[#0b1e36] text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xl whitespace-nowrap flex items-center gap-2 border border-[#efb24b]">
                              <span>पुनर्रचना करायची? (पुन्हा टॅप करा)</span>
                              <button
                                type="button"
                                onClick={() => setActiveCircleAction(null)}
                                className="text-[#efb24b] hover:text-white font-bold px-1"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => {
                              if (activeCircleAction === 'reset') {
                                handleResetCounter();
                                setActiveCircleAction(null);
                              } else {
                                setActiveCircleAction('reset');
                              }
                            }}
                            disabled={isResettingCounter}
                            className="min-w-[40px] min-h-[40px] rounded-xl bg-[#193568] hover:bg-[#0b1e36] text-white flex items-center justify-center text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50 px-2.5"
                            title="काउंट शेवटच्या क्रमांकावर सेट करा"
                          >
                            {isResettingCounter ? '...' : 'काउंटर रिसेट'}
                          </button>
                          {activeCircleAction === 'reset' && (
                            <div className="absolute left-0 sm:left-auto sm:right-0 top-11 z-30 bg-[#0b1e36] text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xl whitespace-nowrap flex items-center gap-2 border border-[#efb24b]">
                              <span>शेवटच्या क्रमांकावर सेट करा? (पुन्हा टॅप करा)</span>
                              <button
                                type="button"
                                onClick={() => setActiveCircleAction(null)}
                                className="text-[#efb24b] hover:text-white font-bold px-1"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={handlePurgeDeletedGhosts}
                          disabled={isPurgingGhosts}
                          className="min-h-[40px] bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                          title="पूर्वी डिलीट/नाकारलेले व दुबार प्रलंबित रेकॉर्ड सिस्टममधून स्वच्छ करा"
                        >
                          <Trash2 className={`w-3.5 h-3.5 ${isPurgingGhosts ? 'animate-spin' : ''}`} />
                          <span>{isPurgingGhosts ? 'स्वच्छता सुरू...' : 'जुना डाटा स्वच्छ करा'}</span>
                        </button>
                      </>
                    )}

                    {onFetchApplications && (
                      <button
                        type="button"
                        onClick={() => onFetchApplications(true)}
                        disabled={isLoadingApps}
                        className="min-h-[40px] bg-[#fbf8f2] hover:bg-[#f2eadf] text-[#0b1e36] border border-[#e7ded1] text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-[#df6b16] ${isLoadingApps ? 'animate-spin' : ''}`} />
                        <span>{isLoadingApps ? 'लोड होत आहे...' : 'ताजे करा'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick Stats Grid inside Applications Sub-Tab */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                  <div className="bg-[#fbf8f2] p-3.5 rounded-xl border border-[#e7ded1]">
                    <span className="text-[#607184] text-xs font-bold block">एकूण अर्ज</span>
                    <span className="text-2xl font-black text-[#0b1e36] tabular-nums">{toEnglishDigits(totalCount)}</span>
                  </div>
                  <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200">
                    <span className="text-emerald-800 text-xs font-bold block">मंजूर अर्ज</span>
                    <span className="text-2xl font-black text-emerald-700 tabular-nums">{toEnglishDigits(approvedCount)}</span>
                  </div>
                  <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200">
                    <span className="text-amber-800 text-xs font-bold block">प्रलंबित अर्ज</span>
                    <span className="text-2xl font-black text-amber-700 tabular-nums">{toEnglishDigits(pendingCount)}</span>
                  </div>
                  <div className="bg-rose-50/70 p-3.5 rounded-xl border border-rose-200">
                    <span className="text-rose-800 text-xs font-bold block">नाकारलेले अर्ज</span>
                    <span className="text-2xl font-black text-rose-700 tabular-nums">{toEnglishDigits(rejectedCount)}</span>
                  </div>
                </div>

                {/* Filters & Search */}
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar bg-[#fbf8f2] p-1.5 rounded-xl border border-[#e7ded1] text-xs">
                    {(['all', 'pending', 'approved', 'rejected'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => {
                          setFilterStatus(st);
                          setAppsVisibleCount(50);
                        }}
                        className={`min-h-[38px] px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          filterStatus === st
                            ? 'bg-[#0b1e36] text-[#efb24b] shadow-xs'
                            : 'text-[#607184] hover:text-[#0b1e36]'
                        }`}
                      >
                        {st === 'all' && `सर्व (${toEnglishDigits(totalCount)})`}
                        {st === 'pending' && `प्रलंबित (${toEnglishDigits(pendingCount)})`}
                        {st === 'approved' && `मंजूर (${toEnglishDigits(approvedCount)})`}
                        {st === 'rejected' && `नाकारलेले (${toEnglishDigits(rejectedCount)})`}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
                    <div className="relative flex-1 sm:w-64">
                      <Search className="w-4 h-4 text-[#607184] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="नाव, अर्ज क्र., मोबाईल किंवा जिल्हा..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setAppsVisibleCount(50);
                        }}
                        className="w-full min-h-[44px] text-base sm:text-xs pl-9 pr-3 py-2 bg-[#fbf8f2] border border-[#e7ded1] rounded-xl focus:bg-white focus:outline-none focus:border-[#df6b16]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const XLSX = await import('xlsx');
                        const excelData = filteredApps.map((a, idx) => ({
                          'अनुक्रमांक': idx + 1,
                          'सदस्य क्रमांक': a.memberNumber || '-',
                          'अर्ज क्रमांक': a.applicationNumber || '-',
                          'पूर्ण नाव': a.fullName || '-',
                          'पद / संवर्ग': a.professional || '-',
                          'जिल्हा': a.district || '-',
                          'तालुका': a.taluka || '-',
                          'कार्यरत केंद्र': a.centerName || '-',
                          'मोबाईल नंबर': a.phone || '-',
                          'ई-मेल पत्ता': a.email || '-',
                          'अर्जाची स्थिती': a.status === 'approved' ? 'मंजूर' : a.status === 'rejected' ? 'नाकारले' : 'प्रलंबित',
                          'नोंदणी दिनांक': formatDateWithEnglishDigits(a.createdAt || '')
                        }));

                        const worksheet = XLSX.utils.json_to_sheet(excelData);
                        worksheet['!cols'] = [
                          { wch: 10 },
                          { wch: 22 },
                          { wch: 18 },
                          { wch: 32 },
                          { wch: 22 },
                          { wch: 16 },
                          { wch: 16 },
                          { wch: 22 },
                          { wch: 16 },
                          { wch: 26 },
                          { wch: 14 },
                          { wch: 16 },
                        ];

                        const workbook = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(workbook, worksheet, 'सदस्य माहिती');
                        const fileName = `mahasangh_members_${filterStatus}_${new Date().toISOString().split('T')[0]}.xlsx`;
                        XLSX.writeFile(workbook, fileName);
                      }}
                      className="min-h-[44px] bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs shrink-0 cursor-pointer"
                      title="सर्व सदस्य माहिती मूळ एक्सेल (.XLSX) फॉरमॅटमध्ये डाऊनलोड करा"
                    >
                      <Download className="w-4 h-4" />
                      <span>XLSX डाऊनलोड</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const fileInput = document.createElement('input');
                        fileInput.type = 'file';
                        fileInput.accept = '.xlsx, .xls, .csv';
                        fileInput.onchange = async (ev: any) => {
                          const file = ev.target.files?.[0];
                          if (!file) return;
                          try {
                            const XLSX = await import('xlsx');
                            const dataBuffer = await file.arrayBuffer();
                            const workbook = XLSX.read(dataBuffer);
                            const sheetName = workbook.SheetNames[0];
                            const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
                            
                            const pendingApps = applications.filter((a) => a.status === 'pending');
                            const matched: Array<{ app: MembershipApplication; paymentId: string; orderId: string }> = [];

                            rows.forEach((row) => {
                              const status = String(row['payment status'] || row['payment_status'] || row['status'] || '').trim().toLowerCase();
                              if (status && !status.includes('captur') && !status.includes('success') && !status.includes('paid')) {
                                return;
                              }
                              const rowEmail = String(row['email'] || '').trim().toLowerCase();
                              const rowPhoneRaw = String(row['phone'] || row['mobile'] || '').replace(/\D/g, '');
                              const rowPhone10 = rowPhoneRaw.slice(-10);
                              const paymentId = String(row['payment id'] || row['payment_id'] || row['razorpay_payment_id'] || '-');
                              const orderId = String(row['order_id'] || '-');

                              pendingApps.forEach((app) => {
                                const appEmail = (app.email || '').trim().toLowerCase();
                                const appPhone10 = (app.phone || '').replace(/\D/g, '').slice(-10);

                                const emailMatch = rowEmail && appEmail && rowEmail === appEmail;
                                const phoneMatch = rowPhone10 && appPhone10 && rowPhone10 === appPhone10;

                                if ((emailMatch || phoneMatch) && !matched.some((m) => m.app.id === app.id)) {
                                  matched.push({ app, paymentId, orderId });
                                }
                              });
                            });

                            setRazorpayMatchedList(matched);
                            setShowRazorpayMatchModal(true);
                            if (matched.length === 0) {
                              showAdminFeedback('एक्सेल फाईलमध्ये कोणत्याही प्रलंबित अर्जाशी जुळणारे सफल पेमेंट आढळले नाही.', 'error');
                            }
                          } catch (err: any) {
                            showAdminFeedback('एक्सेल वाचताना त्रुटी: ' + err.message, 'error');
                          }
                        };
                        fileInput.click();
                      }}
                      className="min-h-[44px] bg-[#0b1e36] hover:bg-[#193568] text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs shrink-0 cursor-pointer"
                      title="Razorpay पेमेंट रिपोर्ट (Excel) अपलोड करून प्रलंबित अर्ज स्वयंचलित मंजूर करा"
                    >
                      <Upload className="w-4 h-4 text-[#efb24b]" />
                      <span>Razorpay Excel ऑटो-मंजूर</span>
                    </button>
                  </div>
                </div>

                {/* Mobile App Card List (Visible on Mobile & Small Tablets) */}
                <div className="md:hidden space-y-3">
                  {filteredApps.length === 0 ? (
                    <div className="py-10 text-center text-sm text-[#607184] bg-[#fbf8f2] rounded-xl border border-dashed border-[#e7ded1]">
                      कोणताही अर्ज सापडला नाही.
                    </div>
                  ) : (
                    visibleFilteredApps.map((app) => (
                      <div
                        key={app.id}
                        className="bg-[#fbf8f2] border border-[#e7ded1] rounded-2xl p-3.5 space-y-3 shadow-2xs"
                      >
                        <div className="flex items-start gap-3">
                          {app.photo ? (
                            <img
                              src={app.photo}
                              alt={app.fullName}
                              onClick={() => handleOpenVerification(app)}
                              className="w-14 h-16 object-cover rounded-xl border border-[#e7ded1] shrink-0 cursor-pointer"
                            />
                          ) : (
                            <div
                              onClick={() => handleOpenVerification(app)}
                              className="w-14 h-16 bg-white rounded-xl border border-[#e7ded1] flex items-center justify-center text-[#607184] shrink-0 cursor-pointer"
                            >
                              <ImageIcon className="w-5 h-5" />
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenVerification(app)}
                                className="text-left font-serifDevanagari font-bold text-sm text-[#0b1e36] leading-snug hover:text-[#df6b16]"
                              >
                                {app.salutation ? `${app.salutation} ` : ''}
                                {app.fullName}
                              </button>
                              {app.status === 'approved' ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0">
                                  मंजूर
                                </span>
                              ) : app.status === 'rejected' ? (
                                <span className="inline-flex items-center bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0">
                                  नाकारले
                                </span>
                              ) : (
                                <span className="inline-flex items-center bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0">
                                  प्रलंबित
                                </span>
                              )}
                            </div>

                            <div className="text-xs text-[#607184] mt-1 space-y-0.5">
                              <p className="font-mono font-bold text-[#193568] text-[11px]">
                                {app.memberNumber || app.applicationNumber} • {formatDateWithEnglishDigits(app.createdAt)}
                              </p>
                              <p>
                                {app.professional || 'केंद्रप्रमुख'} • <strong className="text-[#102a43]">{app.district}</strong>
                              </p>
                              <p className="font-mono text-[#df6b16] font-bold">{app.phone}</p>
                            </div>
                          </div>
                        </div>

                        {/* Touch Action Bar (min 44px height) */}
                        <div className="pt-2 border-t border-[#e7ded1]">
                          {app.status === 'pending' ? (
                            <div className="grid grid-cols-3 gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenVerification(app)}
                                className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Check className="w-4 h-4" />
                                <span>मंजूर</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenVerification(app, true)}
                                className="min-h-[44px] bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <X className="w-4 h-4" />
                                <span>नाकारा</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteWithFeedback(app)}
                                className="min-h-[44px] bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span>डिलीट</span>
                              </button>
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 gap-2">
                              <button
                                type="button"
                                onClick={() => setCertModalApp(app)}
                                className="min-h-[44px] bg-[#0b1e36] hover:bg-[#193568] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-4 h-4 text-[#efb24b]" />
                                <span>आय-कार्ड</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => generateMembershipIdCardPdf(app)}
                                className="min-h-[44px] bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Download className="w-4 h-4" />
                                <span>PDF</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteWithFeedback(app)}
                                className="min-h-[44px] bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span>डिलीट</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Desktop Table (Hidden on Mobile) */}
                <div className="hidden md:block overflow-x-auto border border-[#e7ded1] rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#fbf8f2] border-b border-[#e7ded1] text-[#0b1e36] font-bold uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="py-3 px-4">फोटो</th>
                        <th className="py-3 px-4">अर्ज क्र. / तारीख</th>
                        <th className="py-3 px-4">अर्जदाराचे नाव (क्लिक करा)</th>
                        <th className="py-3 px-4">पद व जिल्हा</th>
                        <th className="py-3 px-4">मोबाईल</th>
                        <th className="py-3 px-4">स्थिती</th>
                        <th className="py-3 px-4 text-center">कृती (Action)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e7ded1]/70">
                      {filteredApps.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-[#607184]">
                            कोणताही अर्ज सापडला नाही.
                          </td>
                        </tr>
                      ) : (
                        visibleFilteredApps.map((app) => (
                          <tr key={app.id} className="hover:bg-[#fbf8f2] transition-colors">
                            <td className="py-3 px-4">
                              {app.photo ? (
                                <img
                                  src={app.photo}
                                  alt={app.fullName}
                                  className="w-9 h-11 object-cover rounded border border-[#e7ded1] cursor-pointer"
                                  onClick={() => handleOpenVerification(app)}
                                />
                              ) : (
                                <div
                                  onClick={() => handleOpenVerification(app)}
                                  className="w-9 h-11 bg-[#fbf8f2] rounded border border-[#e7ded1] flex items-center justify-center text-[#607184] cursor-pointer"
                                >
                                  <ImageIcon className="w-4 h-4" />
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-[#193568]">
                              {app.applicationNumber}
                              <span className="block font-sans font-normal text-xs text-[#607184] mt-0.5">
                                {formatDateWithEnglishDigits(app.createdAt)}
                              </span>
                              {app.createdAt && (
                                <span className="block font-sans font-semibold text-xs text-[#102a43] mt-0.5">
                                  {formatTimeOnly(app.createdAt)}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-bold text-[#0b1e36]">
                              <button
                                type="button"
                                onClick={() => handleOpenVerification(app)}
                                className="text-left hover:text-[#df6b16] hover:underline cursor-pointer"
                                title="तपशीलवार पडताळणी उघडा"
                              >
                                {app.fullName}
                                {app.isOfficial && (
                                  <span className="block text-[10px] text-[#df6b16] font-semibold">
                                    {app.officialPost}
                                  </span>
                                )}
                              </button>
                            </td>
                            <td className="py-3 px-4 text-[#102a43]">
                              {app.professional || 'केंद्रप्रमुख / अधिकारी'}
                              <span className="block text-[11px] text-[#607184] font-semibold">
                                {app.district}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono tabular-nums">
                              {app.phone}
                            </td>
                            <td className="py-3 px-4">
                              {app.status === 'approved' ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full text-[11px] font-bold">
                                  <Award className="w-3 h-3 text-emerald-600" />
                                  मंजूर
                                </span>
                              ) : app.status === 'rejected' ? (
                                <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-full text-[11px] font-bold">
                                  नाकारले
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full text-[11px] font-bold">
                                  प्रलंबित
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {app.status === 'pending' ? (
                                <div className="flex flex-col gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenVerification(app)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors shadow-xs cursor-pointer"
                                  >
                                    मंजूर करा
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenVerification(app, true)}
                                    className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors shadow-xs cursor-pointer"
                                  >
                                    नाकारा
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteWithFeedback(app)}
                                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors shadow-xs cursor-pointer"
                                  >
                                    डिलीट
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setCertModalApp(app)}
                                    className="bg-[#0b1e36] hover:bg-[#193568] text-white font-bold px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
                                    title="आय-कार्ड पहा"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-[#efb24b]" />
                                    आय-कार्ड पहा
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => generateMembershipIdCardPdf(app)}
                                    className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
                                    title="आय-कार्ड PDF डाऊनलोड करा"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    PDF
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteWithFeedback(app)}
                                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
                                    title="हा अर्ज कायमचा डिलीट करा"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Fast Load-More Pagination Bar */}
                {filteredApps.length > 0 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-[#607184]">
                    <span>
                      एकूण <strong className="text-[#0b1e36] tabular-nums">{toEnglishDigits(filteredApps.length)}</strong> पैकी{' '}
                      <strong className="text-[#0b1e36] tabular-nums">{toEnglishDigits(visibleFilteredApps.length)}</strong> नोंदी दाखवल्या आहेत
                    </span>
                    {visibleFilteredApps.length < filteredApps.length && (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => setAppsVisibleCount((prev) => prev + 50)}
                          className="flex-1 sm:flex-none min-h-[42px] px-4 py-2 bg-[#0b1e36] hover:bg-[#193568] text-white font-bold rounded-xl cursor-pointer"
                        >
                          आणखी ५० अर्ज पहा
                        </button>
                        <button
                          type="button"
                          onClick={() => setAppsVisibleCount(filteredApps.length)}
                          className="min-h-[42px] px-4 py-2 bg-[#fbf8f2] hover:bg-[#f0e9de] text-[#0b1e36] border border-[#e7ded1] font-bold rounded-xl cursor-pointer"
                        >
                          सर्व दाखवा
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Sub-tab 1B: Dedicated Member Edit & Duplicate Cleanup (सदस्य एडिट) */}
            {activeAdminSubTab === 'edit_members' && (currentUser?.isSuperAdmin || currentUser?.permissions.editMembers) && (
              <MemberEditManager
                applications={applications}
                onUpdateMember={async (updated) => {
                  if (onUpdateMember) {
                    await onUpdateMember(updated);
                  }
                }}
                onDeleteApplication={onDeleteApplication}
                onFetchApplications={onFetchApplications}
                isLoadingApps={isLoadingApps}
              />
            )}

            {/* Sub-tab 2: State Leadership Management (राज्य पदाधिकारी) */}
            {activeAdminSubTab === 'leadership' && (currentUser?.isSuperAdmin || currentUser?.permissions.manageLeadership) && (
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
                <div>
                  <h3 className="font-serifDevanagari text-lg font-bold text-[#17366d]">
                    राज्य पदाधिकारी संपादन (State Leadership Management)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    येथून आपण राज्य कार्यकारिणी, महिला आघाडी राज्य कार्यकारिणी, विभागीय समन्वयक आणि राज्य सल्लागार मंडळ (कायदेविषयक सल्लागार व मार्गदर्शक) यांचे फोटो, नाव आणि पद बदलू किंवा नव्याने जोडू शकता. जिल्हा पदाधिकाऱ्यांसाठी शेजारील &quot;जिल्हा कार्यकारिणी&quot; टॅब वापरा.
                  </p>
                </div>

                {/* Dropdown with 4 State Categories */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <label className="font-bold text-xs text-[#09243f] shrink-0">
                    श्रेणी निवडा:
                  </label>
                  <select
                    value={leaderCategory}
                    onChange={(e) => {
                      setLeaderCategory(e.target.value as any);
                      setEditingLeaderId(null);
                    }}
                    className="p-2.5 bg-white border border-[#c8d2e2] text-xs font-bold text-[#193568] rounded-lg focus:outline-none focus:border-[#df6b16] w-full sm:w-72"
                  >
                    <option value="राज्य कार्यकारिणी">1. राज्य कार्यकारिणी</option>
                    <option value="महिला आघाडी राज्य कार्यकारिणी">2. महिला आघाडी राज्य कार्यकारिणी</option>
                    <option value="विभागीय समन्वयक">3. विभागीय समन्वयक</option>
                    <option value="राज्य सल्लागार मंडळ">4. राज्य सल्लागार मंडळ (सल्लागार व मार्गदर्शक)</option>
                  </select>
                  <span className="text-xs text-slate-500 font-medium">
                    या विभागात एकूण: <strong>{categoryLeaders.length}</strong> पदाधिकारी
                  </span>
                </div>

                {missingVacantLeadersCount > 0 && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs text-amber-950">
                      <strong className="block text-sm font-bold text-[#17366d]">
                        मूळ रिकामी पदे पुन्हा जोडण्यासाठी उपलब्ध ({missingVacantLeadersCount} पदे)
                      </strong>
                      <span className="text-amber-900">
                        राज्य कार्यकारिणी, महिला आघाडी राज्य कार्यकारिणी व विभागीय कार्यकारिणीतील गहाळ झालेली रिकामी पदे एका क्लिकवर पुन्हा जोडा (कोणतेही विद्यमान नाव/फोटो बदलणार नाहीत).
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={isSavingLeader}
                      onClick={handleRestoreMissingVacantLeaders}
                      className="px-4 py-2.5 bg-[#17366d] hover:bg-[#10274e] text-white font-bold text-xs rounded-xl shadow-xs shrink-0 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-[#efb24b]" />
                      <span>रिकामी पदे पुन्हा जोडा ({missingVacantLeadersCount})</span>
                    </button>
                  </div>
                )}

                {leaderCategory === 'राज्य सल्लागार मंडळ' && (
                  <div className="bg-[#f8f9fc] p-3.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-[#17366d]">
                      राज्य सल्लागार मंडळ उप-विभाग निवडा:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAdvisorySubTab('कायदेविषयक सल्लागार');
                          setEditingLeaderId(null);
                        }}
                        className={`px-3.5 py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                          advisorySubTab === 'कायदेविषयक सल्लागार'
                            ? 'bg-[#193568] text-white border-[#193568]'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        १. कायदेविषयक सल्लागार
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAdvisorySubTab('मार्गदर्शक');
                          setEditingLeaderId(null);
                        }}
                        className={`px-3.5 py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                          advisorySubTab === 'मार्गदर्शक'
                            ? 'bg-[#df6b16] text-white border-[#df6b16]'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        २. मार्गदर्शक
                      </button>
                    </div>
                  </div>
                )}

                {/* Reordering Control Toolbar & Selection Panel */}
                <div className="bg-gradient-to-r from-amber-50/90 via-orange-50/80 to-amber-50/90 border-2 border-amber-300 rounded-2xl p-4 shadow-xs">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#df6b16] animate-pulse shrink-0"></span>
                        <h4 className="font-serifDevanagari font-bold text-sm text-[#193568]">
                          पदाधिकाऱ्यांचा क्रम ठरवा (नाव निवडून बाणाने वर-खाली करा)
                        </h4>
                      </div>
                      <p className="text-xs text-slate-700 mt-1">
                        {selectedLeader ? (
                          <span className="inline-flex items-center gap-1.5 flex-wrap">
                            <span>निवडलेले नाव:</span>
                            <span className="bg-white px-2.5 py-1 rounded-lg border border-amber-400 font-bold text-[#193568] shadow-2xs">
                              #{selectedLeaderIndex + 1} {isPlaceholderDistrictName(selectedLeader.name) ? 'नाव भरायचे आहे (पद रिक्त)' : selectedLeader.name} ({selectedLeader.role})
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-500">
                            खालील यादीतून ज्या पदाधिकाऱ्याचे स्थान बदलायचे आहे, त्या नावावर क्लिक करा.
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Prominent Large Arrow Buttons on the side */}
                    <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0">
                      <button
                        type="button"
                        disabled={!selectedLeader || selectedLeaderIndex <= 0}
                        onClick={() => handleMoveLeaderUp()}
                        className="flex-1 md:flex-none px-5 py-3 bg-[#17366d] hover:bg-[#12284c] text-white font-bold text-xs sm:text-sm rounded-xl shadow-sm disabled:opacity-35 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer border border-[#17366d]"
                        title="निवडलेले नाव वर सरकवा"
                      >
                        <ArrowUp className="w-4 h-4 text-[#efb24b]" />
                        <span>▲ वर हलवा</span>
                      </button>
                      <button
                        type="button"
                        disabled={!selectedLeader || selectedLeaderIndex === -1 || selectedLeaderIndex >= categoryLeaders.length - 1}
                        onClick={() => handleMoveLeaderDown()}
                        className="flex-1 md:flex-none px-5 py-3 bg-[#df6b16] hover:bg-[#b8540c] text-white font-bold text-xs sm:text-sm rounded-xl shadow-sm disabled:opacity-35 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer border border-[#df6b16]"
                        title="निवडलेले नाव खाली सरकवा"
                      >
                        <ArrowDown className="w-4 h-4 text-white" />
                        <span>▼ खाली हलवा</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Already Added Leaders List with Clear Click-to-Select & Row Arrows */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider">
                      विद्यमान पदाधिकारी ({activeLeaderSectionLabel}) — एकूण: {categoryLeaders.length}
                    </h4>
                    <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
                      💡 नावावर क्लिक करून निवडा किंवा बाजूच्या बाणांवर क्लिक करा
                    </span>
                  </div>

                  {categoryLeaders.length === 0 ? (
                    <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-500 text-xs">
                      या श्रेणीत अद्याप कोणतेही पदाधिकारी जोडलेले नाहीत. खालील फॉर्मद्वारे नवीन पदाधिकारी जोडा.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {categoryLeaders.map((ldr, index) => {
                        const isSelected = (ldr.id || ldr.name) === selectedLeaderIdForReorder;
                        const isVacantSlot = isPlaceholderDistrictName(ldr.name);
                        return (
                          <div
                            key={ldr.id || ldr.name}
                            onClick={() => setSelectedLeaderIdForReorder(ldr.id || ldr.name)}
                            className={`rounded-2xl p-3 border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                              isSelected
                                ? 'bg-amber-50/90 border-2 border-[#df6b16] shadow-md ring-2 ring-[#df6b16]/20'
                                : isVacantSlot
                                  ? 'bg-amber-50/35 border-amber-200/80 shadow-2xs hover:border-amber-400'
                                  : 'bg-white border-slate-200 shadow-2xs hover:border-amber-300 hover:bg-slate-50/70'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {/* Sequence Position Badge */}
                              <span
                                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold font-mono shrink-0 ${
                                  isSelected
                                    ? 'bg-[#df6b16] text-white shadow-2xs'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}
                                title={`स्थान: #${index + 1}`}
                              >
                                {index + 1}
                              </span>

                              {/* Photo */}
                              {ldr.photo ? (
                                <img
                                  src={ldr.photo}
                                  alt={ldr.name}
                                  className="w-11 h-11 rounded-full object-cover border-2 border-[#efb24b] shadow-2xs shrink-0"
                                />
                              ) : (
                                <div className="w-11 h-11 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-400 shrink-0">
                                  <ImageIcon className="w-5 h-5" />
                                </div>
                              )}

                              {/* Details */}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <h5 className={`font-serifDevanagari font-bold text-xs sm:text-sm truncate ${
                                    isVacantSlot
                                      ? 'text-amber-800 italic'
                                      : isSelected
                                        ? 'text-[#193568]'
                                        : 'text-slate-900'
                                  }`}>
                                    {isVacantSlot ? 'नाव भरायचे आहे (पद रिक्त)' : ldr.name}
                                  </h5>
                                  {isVacantSlot && (
                                    <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                                      रिक्त
                                    </span>
                                  )}
                                  {isSelected && (
                                    <span className="bg-[#df6b16] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                                      निवडलेले
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-[#df6b16] font-semibold block truncate">
                                  {ldr.role} {ldr.region ? `• ${ldr.region}` : ''}
                                </span>
                              </div>
                            </div>

                            {/* Controls: Comfortable Large Side Arrows + Actions */}
                            <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                              {/* Side Arrows for Direct Tap */}
                              <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200">
                                <button
                                  type="button"
                                  disabled={index === 0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveLeaderUp(ldr.id || ldr.name);
                                  }}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white hover:bg-[#17366d] hover:text-white text-slate-700 disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-slate-700 transition-colors shadow-2xs text-xs font-bold border border-slate-200 cursor-pointer"
                                  title="वर हलवा (Move Up)"
                                >
                                  <ChevronUp className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  disabled={index === categoryLeaders.length - 1}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveLeaderDown(ldr.id || ldr.name);
                                  }}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white hover:bg-[#df6b16] hover:text-white text-slate-700 disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-slate-700 transition-colors shadow-2xs text-xs font-bold border border-slate-200 cursor-pointer"
                                  title="खाली हलवा (Move Down)"
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </button>
                              </div>

                              {/* Edit & Delete */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditLeader(ldr);
                                }}
                                className="p-2 hover:bg-amber-100 text-amber-700 rounded-lg transition-colors cursor-pointer"
                                title="दुरुस्त करा (Edit)"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteLeader(ldr.id, ldr.name);
                                }}
                                className="p-2 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer"
                                title="वगळा (Delete)"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Form to Add / Edit Leader (Photo < 200KB) */}
                <div className="bg-[#fbfbfd] p-5 rounded-xl border border-slate-200">
                  <h4 className="font-serifDevanagari text-base font-bold text-[#17366d] mb-1">
                    {editingLeaderId ? 'पदाधिकारी माहिती दुरुस्त करा (Edit Leader)' : `नवीन पदाधिकारी जोडा (${activeLeaderSectionLabel})`}
                  </h4>
                  <p className="text-[11px] text-slate-500 mb-4">
                    नाव, पद, जिल्हा व 200KB आकारातील पासपोर्ट फोटो निवडून सेव्ह करा.
                  </p>

                  {leaderFormMsg && (
                    <div className={`p-3 mb-4 rounded-lg text-xs font-semibold ${
                      leaderFormMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' : 'bg-rose-50 text-rose-800 border border-rose-300'
                    }`}>
                      {leaderFormMsg.text}
                    </div>
                  )}

                  <form onSubmit={handleSaveLeader} className="space-y-4 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          पदाधिकाऱ्याचे नाव <span className="text-[10px] font-normal text-slate-500">(रिक्त पदासाठी मोकळे सोडा)</span>
                        </label>
                        <input
                          type="text"
                          value={leaderName}
                          onChange={(e) => setLeaderName(e.target.value)}
                          placeholder="उदा. श्री. रमेश देशमुख (किंवा रिकामे ठेवा)"
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          पद (Role) <span className="text-rose-600">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={leaderRole}
                          onChange={(e) => setLeaderRole(e.target.value)}
                          placeholder="उदा. जिल्हाध्यक्ष / उपाध्यक्ष"
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          जिल्हा / कार्यक्षेत्र
                        </label>
                        <input
                          type="text"
                          value={leaderRegion}
                          onChange={(e) => setLeaderRegion(e.target.value)}
                          placeholder="उदा. नाशिक / पुणे विभाग"
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          मोबाईल नंबर
                        </label>
                        <input
                          type="text"
                          value={leaderPhone}
                          onChange={(e) => setLeaderPhone(e.target.value)}
                          placeholder="10 अंकी मोबाईल"
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          शैक्षणिक पात्रता / संवर्ग
                        </label>
                        <input
                          type="text"
                          value={leaderEducation}
                          onChange={(e) => setLeaderEducation(e.target.value)}
                          placeholder="उदा. M.A., B.Ed., केंद्रप्रमुख"
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      {/* Photo Upload */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-bold text-slate-700 text-xs">
                            पासपोर्ट फोटो
                          </label>
                          {cloudinaryConfig.enabled && (
                            <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              क्लाउड स्टोरेज सक्रिय
                            </span>
                          )}
                        </div>

                        <div className="space-y-2">
                          <input
                            ref={leaderPhotoInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleLeaderPhotoSelect}
                            disabled={isUploadingLeaderCloudinary}
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg text-[11px]"
                          />
                          {isUploadingLeaderCloudinary && (
                            <div className="text-[11px] text-sky-700 font-bold flex items-center gap-1.5 p-2 bg-sky-50 rounded border border-sky-200">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-600" />
                              <span>फोटो अपलोड होत आहे...</span>
                            </div>
                          )}
                          {leaderPhoto && !isUploadingLeaderCloudinary && (
                            <div className="flex items-center gap-2 p-1.5 bg-slate-50 border border-slate-200 rounded">
                              <img src={leaderPhoto} alt="प्रीव्ह्यू" className="w-8 h-8 rounded object-cover" />
                              <span className="text-[10px] text-slate-600 truncate flex-1 font-mono">
                                {leaderPhoto.startsWith('http') ? 'फोटो यशस्वीरीत्या अपलोड झाला' : 'फोटो निवडला आहे'}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setLeaderPhoto('');
                                  setLeaderPhotoUrl('');
                                  setLeaderPhotoSizeKb(0);
                                }}
                                className="text-[10px] text-rose-600 font-bold"
                              >
                                काढा
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="mt-2">
                          <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                            किंवा थेट फोटो लिंक टाका (URL):
                          </label>
                          <input
                            type="url"
                            value={leaderPhotoUrl}
                            onChange={(e) => {
                              const val = e.target.value.trim();
                              setLeaderPhotoUrl(e.target.value);
                              if (val) {
                                setLeaderPhoto(val);
                                setLeaderPhotoSizeKb(0);
                              }
                            }}
                            placeholder="https://... (इमेज URL / डायरेक्ट सर्व्हर फोटो लिंक)"
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg text-[11px] focus:outline-none focus:border-[#df6b16]"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="submit"
                        disabled={isSavingLeader || isUploadingLeaderCloudinary}
                        className="bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold px-6 py-2.5 rounded-lg text-xs shadow-xs disabled:opacity-60 cursor-pointer flex items-center gap-1.5"
                      >
                        {isSavingLeader ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>सेव्ह होत आहे...</span>
                          </>
                        ) : (
                          <span>{editingLeaderId ? 'बदल सेव्ह करा' : 'पदाधिकारी जोडा'}</span>
                        )}
                      </button>
                      {editingLeaderId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLeaderId(null);
                            setLeaderName('');
                            setLeaderRole('');
                            setLeaderRegion('');
                            setLeaderPhone('');
                            setLeaderEducation('');
                            setLeaderPhoto('');
                          }}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-2.5 rounded-lg text-xs"
                        >
                          रद्द करा
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Sub-tab 2B: District Leadership Management (जिल्हा कार्यकारिणी - जिल्हा अध्यक्ष व जिल्हा सरचिटणीस) */}
            {activeAdminSubTab === 'district_leadership' && (currentUser?.isSuperAdmin || currentUser?.permissions.manageLeadership) && (
              <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-serifDevanagari text-lg font-bold text-[#17366d]">
                      जिल्हा कार्यकारिणी व्यवस्थापन (District Leadership)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      येथून सर्व ३४ जिल्ह्यांचे <strong>जिल्हा अध्यक्ष</strong> व <strong>जिल्हा सरचिटणीस</strong> यांचे नाव, पद, फोटो व क्रम थेट अद्यतनित करता येतात.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-bold">
                    <span className="bg-sky-50 text-sky-900 border border-sky-200 px-3 py-1.5 rounded-lg">
                      अध्यक्ष: {dynamicLeaders.filter((l) => l && (l.category === 'जिल्हा अध्यक्ष' || l.category === 'district') && !isPlaceholderDistrictName(l.name)).length}
                    </span>
                    <span className="bg-amber-50 text-amber-900 border border-amber-200 px-3 py-1.5 rounded-lg">
                      सरचिटणीस: {dynamicLeaders.filter((l) => l && l.category === 'जिल्हा सरचिटणीस' && !isPlaceholderDistrictName(l.name)).length}
                    </span>
                  </div>
                </div>

                {/* Mode Switcher + Search */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDistrictLeaderMode('जिल्हा अध्यक्ष');
                        setEditingLeaderId(null);
                        setLeaderName('');
                        setLeaderRole('जिल्हाध्यक्ष');
                        setLeaderRegion('');
                        setLeaderPhone('');
                        setLeaderEducation('');
                        setLeaderPhoto('');
                        setLeaderFormMsg(null);
                      }}
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        districtLeaderMode === 'जिल्हा अध्यक्ष'
                          ? 'bg-[#17366d] text-white border-[#17366d] shadow-sm'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      १. जिल्हा अध्यक्ष ({dynamicLeaders.filter((l) => l && (l.category === 'जिल्हा अध्यक्ष' || l.category === 'district')).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDistrictLeaderMode('जिल्हा सरचिटणीस');
                        setEditingLeaderId(null);
                        setLeaderName('');
                        setLeaderRole('जिल्हा सरचिटणीस');
                        setLeaderRegion('');
                        setLeaderPhone('');
                        setLeaderEducation('');
                        setLeaderPhoto('');
                        setLeaderFormMsg(null);
                      }}
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        districtLeaderMode === 'जिल्हा सरचिटणीस'
                          ? 'bg-[#df6b16] text-white border-[#df6b16] shadow-sm'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      २. जिल्हा सरचिटणीस ({dynamicLeaders.filter((l) => l && l.category === 'जिल्हा सरचिटणीस').length})
                    </button>
                  </div>

                  <div className="relative w-full md:w-72">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={districtLeaderSearch}
                      onChange={(e) => setDistrictLeaderSearch(e.target.value)}
                      placeholder="जिल्हा किंवा नाव शोधा..."
                      className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>
                </div>

                {/* Quick-Add Chips for Districts Without Named Entry */}
                {(() => {
                  const filledDistrictKeys = new Set(
                    allDistrictModeLeaders
                      .filter((l) => !isPlaceholderDistrictName(l.name))
                      .map((l) => normalizeDistrictAlias(l.region))
                  );
                  const missingDistricts = MAHARASHTRA_DISTRICTS.filter(
                    (d) => !filledDistrictKeys.has(normalizeDistrictAlias(d))
                  );
                  if (missingDistricts.length === 0) return null;
                  return (
                    <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#17366d]">
                          अद्याप {districtLeaderMode} नोंद नसलेले जिल्हे ({missingDistricts.length}) — थेट जोडण्यासाठी जिल्ह्यावर क्लिक करा:
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {missingDistricts.map((dist) => (
                          <button
                            key={dist}
                            type="button"
                            onClick={() => {
                              setEditingLeaderId(null);
                              setLeaderName('');
                              setLeaderRole(districtLeaderMode === 'जिल्हा अध्यक्ष' ? 'जिल्हाध्यक्ष' : 'जिल्हा सरचिटणीस');
                              setLeaderRegion(dist);
                              setLeaderPhone('');
                              setLeaderEducation('');
                              setLeaderPhoto('');
                              setLeaderPhotoUrl('');
                              setLeaderFormMsg(null);
                              if (districtLeaderFormRef.current) {
                                districtLeaderFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#17366d] hover:text-white text-[#17366d] border border-amber-300 text-[11px] font-bold transition-colors cursor-pointer"
                          >
                            + {dist}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Reordering Toolbar */}
                <div className="bg-gradient-to-r from-sky-50/90 via-amber-50/70 to-sky-50/90 border border-sky-200 rounded-2xl p-4 shadow-sm">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-serifDevanagari font-bold text-sm text-[#193568]">
                        जिल्ह्यांचा क्रम ठरवा ({districtLeaderMode})
                      </h4>
                      <p className="text-xs text-slate-700 mt-1">
                        {selectedDistrictLeader ? (
                          <span className="inline-flex items-center gap-1.5 flex-wrap">
                            <span>निवडलेला जिल्हा:</span>
                            <span className="bg-white px-2.5 py-1 rounded-lg border border-amber-400 font-bold text-[#193568]">
                              #{selectedDistrictLeaderIndex + 1} {selectedDistrictLeader.region} — {isPlaceholderDistrictName(selectedDistrictLeader.name) ? 'नाव भरायचे आहे' : selectedDistrictLeader.name}
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-500">यादीतून जिल्हा निवडून वर-खाली क्रम बदला.</span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0">
                      <button
                        type="button"
                        disabled={!selectedDistrictLeader || selectedDistrictLeaderIndex <= 0}
                        onClick={() => handleMoveDistrictLeaderUp()}
                        className="flex-1 md:flex-none px-4 py-2.5 bg-[#17366d] hover:bg-[#12284c] text-white font-bold text-xs rounded-xl shadow-sm disabled:opacity-35 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <ArrowUp className="w-4 h-4 text-[#efb24b]" />
                        <span>▲ वर हलवा</span>
                      </button>
                      <button
                        type="button"
                        disabled={!selectedDistrictLeader || selectedDistrictLeaderIndex === -1 || selectedDistrictLeaderIndex >= allDistrictModeLeaders.length - 1}
                        onClick={() => handleMoveDistrictLeaderDown()}
                        className="flex-1 md:flex-none px-4 py-2.5 bg-[#df6b16] hover:bg-[#b8540c] text-white font-bold text-xs rounded-xl shadow-sm disabled:opacity-35 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <ArrowDown className="w-4 h-4 text-white" />
                        <span>▼ खाली हलवा</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* District Leaders Cards Grid */}
                {filteredDistrictModeLeaders.length === 0 ? (
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-500 text-xs">
                    {districtLeaderSearch.trim()
                      ? `'${districtLeaderSearch}' साठी कोणताही पदाधिकारी सापडला नाही.`
                      : `अद्याप ${districtLeaderMode} जोडलेले नाहीत. वरील जिल्ह्यावर क्लिक करून किंवा खालील फॉर्ममधून जोडा.`}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {filteredDistrictModeLeaders.map((ldr, index) => {
                      const ldrKey = ldr.id || ldr.name;
                      const isSelected = ldrKey === selectedDistrictLeaderId;
                      const isBlank = isPlaceholderDistrictName(ldr.name);
                      const fullIndex = allDistrictModeLeaders.findIndex((x) => (x.id || x.name) === ldrKey);

                      return (
                        <div
                          key={`${ldrKey}-${index}`}
                          onClick={() => setSelectedDistrictLeaderId(ldrKey)}
                          className={`rounded-2xl p-3 border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                            isSelected
                              ? 'bg-amber-50/90 border-2 border-[#df6b16] shadow-md ring-2 ring-[#df6b16]/20'
                              : 'bg-white border-slate-200 shadow-sm hover:border-amber-300 hover:bg-slate-50/70'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span
                              className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold font-mono shrink-0 ${
                                isSelected
                                  ? 'bg-[#df6b16] text-white'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {fullIndex >= 0 ? fullIndex + 1 : index + 1}
                            </span>

                            {ldr.photo ? (
                              <img
                                src={ldr.photo}
                                alt={ldr.name}
                                className="w-11 h-11 rounded-full object-cover border-2 border-[#efb24b] shrink-0"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-400 shrink-0">
                                <ImageIcon className="w-5 h-5" />
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[11px] font-extrabold text-[#17366d] bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">
                                  {ldr.region || 'जिल्हा'}
                                </span>
                                {isBlank && (
                                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded">
                                    नाव भरायचे आहे
                                  </span>
                                )}
                              </div>
                              <h5 className="font-serifDevanagari font-bold text-xs sm:text-sm text-slate-900 truncate mt-1">
                                {isBlank ? 'पदाधिकारी नाव अद्यतनित करा' : ldr.name}
                              </h5>
                              <span className="text-[11px] text-[#df6b16] font-semibold block truncate">
                                {ldr.role || districtLeaderMode}
                                {ldr.phone && ldr.phone !== '-' ? ` • ${toEnglishDigits(ldr.phone)}` : ''}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200">
                              <button
                                type="button"
                                disabled={fullIndex <= 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveDistrictLeaderUp(ldrKey);
                                }}
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white hover:bg-[#17366d] hover:text-white text-slate-700 disabled:opacity-30 border border-slate-200 cursor-pointer"
                                title="वर हलवा"
                              >
                                <ChevronUp className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                disabled={fullIndex === -1 || fullIndex >= allDistrictModeLeaders.length - 1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveDistrictLeaderDown(ldrKey);
                                }}
                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white hover:bg-[#df6b16] hover:text-white text-slate-700 disabled:opacity-30 border border-slate-200 cursor-pointer"
                                title="खाली हलवा"
                              >
                                <ChevronDown className="w-4 h-4" />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditLeader(ldr);
                              }}
                              className="p-2 hover:bg-amber-100 text-amber-700 rounded-lg transition-colors cursor-pointer"
                              title="दुरुस्त करा (Edit)"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteLeader(ldr.id, ldr.name);
                              }}
                              className="p-2 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer"
                              title="वगळा (Delete)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Form to Add / Edit District Officer */}
                <div ref={districtLeaderFormRef} className="bg-[#fbfbfd] p-5 rounded-xl border border-slate-200">
                  <h4 className="font-serifDevanagari text-base font-bold text-[#17366d] mb-1">
                    {editingLeaderId
                      ? `माहिती दुरुस्त करा (${districtLeaderMode})`
                      : `नवीन ${districtLeaderMode} जोडा`}
                  </h4>
                  <p className="text-[11px] text-slate-500 mb-4">
                    जिल्हा निवडा, नाव व पासपोर्ट फोटो अपलोड करून सेव्ह करा. बदल लगेच &quot;जिल्हा पदाधिकारी&quot; पानावर दिसतील.
                  </p>

                  {leaderFormMsg && (
                    <div className={`p-3 mb-4 rounded-lg text-xs font-semibold ${
                      leaderFormMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' : 'bg-rose-50 text-rose-800 border border-rose-300'
                    }`}>
                      {leaderFormMsg.text}
                    </div>
                  )}

                  <form onSubmit={handleSaveLeader} className="space-y-4 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          जिल्हा निवडा <span className="text-rose-600">*</span>
                        </label>
                        <select
                          required
                          value={leaderRegion}
                          onChange={(e) => setLeaderRegion(e.target.value)}
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        >
                          <option value="">-- जिल्हा निवडा --</option>
                          {MAHARASHTRA_DISTRICTS.map((dist) => (
                            <option key={dist} value={dist}>{dist}</option>
                          ))}
                          {leaderRegion && !MAHARASHTRA_DISTRICTS.includes(leaderRegion) && (
                            <option value={leaderRegion}>{leaderRegion}</option>
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          पदाधिकाऱ्याचे नाव <span className="text-rose-600">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={leaderName}
                          onChange={(e) => setLeaderName(e.target.value)}
                          placeholder="उदा. श्री. अनंत नारायण सानप"
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          पद (Role) <span className="text-rose-600">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={leaderRole || (districtLeaderMode === 'जिल्हा अध्यक्ष' ? 'जिल्हाध्यक्ष' : 'जिल्हा सरचिटणीस')}
                          onChange={(e) => setLeaderRole(e.target.value)}
                          placeholder={districtLeaderMode === 'जिल्हा अध्यक्ष' ? 'जिल्हाध्यक्ष' : 'जिल्हा सरचिटणीस'}
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          मोबाईल नंबर
                        </label>
                        <input
                          type="text"
                          value={leaderPhone}
                          onChange={(e) => setLeaderPhone(e.target.value)}
                          placeholder="10 अंकी मोबाईल"
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          शैक्षणिक पात्रता / संवर्ग
                        </label>
                        <input
                          type="text"
                          value={leaderEducation}
                          onChange={(e) => setLeaderEducation(e.target.value)}
                          placeholder="उदा. M.A., B.Ed., केंद्रप्रमुख"
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-bold text-slate-700 text-xs">
                            पासपोर्ट फोटो
                          </label>
                          {cloudinaryConfig.enabled && (
                            <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              क्लाउड सक्रिय
                            </span>
                          )}
                        </div>
                        <div className="space-y-2">
                          <input
                            ref={leaderPhotoInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleLeaderPhotoSelect}
                            disabled={isUploadingLeaderCloudinary}
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg text-[11px]"
                          />
                          {isUploadingLeaderCloudinary && (
                            <div className="text-[11px] text-sky-700 font-bold flex items-center gap-1.5 p-2 bg-sky-50 rounded border border-sky-200">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-600" />
                              <span>फोटो अपलोड होत आहे...</span>
                            </div>
                          )}
                          {leaderPhoto && !isUploadingLeaderCloudinary && (
                            <div className="flex items-center gap-2 p-1.5 bg-slate-50 border border-slate-200 rounded">
                              <img src={leaderPhoto} alt="प्रीव्ह्यू" className="w-8 h-8 rounded object-cover" />
                              <span className="text-[10px] text-slate-600 truncate flex-1 font-mono">
                                फोटो निवडला आहे
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setLeaderPhoto('');
                                  setLeaderPhotoUrl('');
                                  setLeaderPhotoSizeKb(0);
                                }}
                                className="text-[10px] text-rose-600 font-bold cursor-pointer"
                              >
                                काढा
                              </button>
                            </div>
                          )}
                          <input
                            type="url"
                            value={leaderPhotoUrl}
                            onChange={(e) => {
                              const val = e.target.value.trim();
                              setLeaderPhotoUrl(e.target.value);
                              if (val) {
                                setLeaderPhoto(val);
                                setLeaderPhotoSizeKb(0);
                              }
                            }}
                            placeholder="किंवा फोटो लिंक (URL) टाका..."
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg text-[11px] focus:outline-none focus:border-[#df6b16]"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="submit"
                        disabled={isSavingLeader || isUploadingLeaderCloudinary}
                        className="bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold px-6 py-2.5 rounded-lg text-xs shadow-sm cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
                      >
                        {isSavingLeader ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>सेव्ह होत आहे...</span>
                          </>
                        ) : (
                          <span>{editingLeaderId ? 'बदल सेव्ह करा' : `${districtLeaderMode} सेव्ह करा`}</span>
                        )}
                      </button>
                      {editingLeaderId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLeaderId(null);
                            setLeaderName('');
                            setLeaderRole(districtLeaderMode === 'जिल्हा अध्यक्ष' ? 'जिल्हाध्यक्ष' : 'जिल्हा सरचिटणीस');
                            setLeaderRegion('');
                            setLeaderPhone('');
                            setLeaderEducation('');
                            setLeaderPhoto('');
                            setLeaderPhotoUrl('');
                          }}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-2.5 rounded-lg text-xs cursor-pointer"
                        >
                          रद्द करा
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Sub-tab: Master Studio (पदे व्यवस्थापन, जिल्हा पासवर्ड रिसेट) */}
            {activeAdminSubTab === 'master_studio' && currentUser?.isSuperAdmin && (
              <div className="space-y-6">
                <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-xs">
                  <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#17366d] flex items-center gap-2 mb-1">
                    <Award className="w-5 h-5 text-amber-500" />
                    महासंघ मास्टर स्टुडिओ (Master Studio)
                  </h3>
                  <p className="text-xs text-slate-500 mb-6">
                    येथून आपण बहाल करावयाची पदे, जिल्हा पासवर्ड रिसेट आणि नियुक्ती पत्र डिझाईन व्यवस्थापित करू शकता.
                  </p>

                  <div className="space-y-8">
                    {/* Part 1: Post Management */}
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <h4 className="font-serifDevanagari font-bold text-base text-[#17366d]">
                          1. बहाल करावयाची पदे व्यवस्थापन (Post Management)
                        </h4>
                        <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                          एकूण पदे: {postsList.length}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mb-4">
                        नियुक्ती पत्रासाठी व अर्जांसाठी उपलब्ध असणारी पदे जोडा, क्रम बदला किंवा वगळा. हे बदल थेट सर्व्हर डेटाबेसमध्ये सेव्ह होतात.
                      </p>
                      
                      <form onSubmit={async (e) => {
                        e.preventDefault();
                        const form = e.currentTarget;
                        const nameInput = (form.elements.namedItem('newPostName') as HTMLInputElement)?.value?.trim();
                        const levelInput = (form.elements.namedItem('newPostLevel') as HTMLSelectElement)?.value;
                        if (!nameInput) return;
                        const isTaluka = levelInput === 'taluka';
                        const updatedPosts = [...postsList, { name: nameInput, isTaluka }];
                        setPostsList(updatedPosts);
                        localStorage.setItem('mahasangh_posts_v1', JSON.stringify(updatedPosts));
                        window.dispatchEvent(new Event('mahasangh_posts_updated'));
                        try {
                          await saveAppointedPostsToRtdb(updatedPosts);
                        } catch (err) {
                          console.warn('Failed to sync posts to DB:', err);
                        }
                        showAdminFeedback(`पद '${nameInput}' यशस्वीरीत्या जोडले गेले व सेव्ह झाले!`, 'success');
                        form.reset();
                      }} className="flex flex-col sm:flex-row gap-3 items-end">
                        <div className="flex-1 w-full">
                          <label className="font-bold text-slate-700 text-xs block mb-1">नवीन पदाचे नाव:</label>
                          <input
                            type="text"
                            name="newPostName"
                            required
                            placeholder="उदा. जिल्हा सहसंघटक"
                            className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs"
                          />
                        </div>
                        <div className="w-full sm:w-48">
                          <label className="font-bold text-slate-700 text-xs block mb-1">पदाचा स्तर:</label>
                          <select name="newPostLevel" className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs">
                            <option value="district">जिल्हास्तर (District)</option>
                            <option value="taluka">तालुकास्तर (Taluka)</option>
                            <option value="state">राज्यस्तर (State)</option>
                            <option value="division">विभागस्तर (Division)</option>
                          </select>
                        </div>
                        <button type="submit" className="w-full sm:w-auto bg-[#df6b16] hover:bg-[#c2590d] text-white font-bold px-5 py-2.5 rounded-lg text-xs cursor-pointer">
                          पद जोडा
                        </button>
                      </form>

                      <div className="mt-4 space-y-2">
                        <h5 className="font-bold text-xs text-slate-700">विद्यमान पदे (कुल: {postsList.length}):</h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                          {postsList.map((p, idx) => (
                            <div key={p.name} className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-mono text-slate-400 font-bold">{idx + 1}.</span>
                                <span className="font-bold text-[#17366d] truncate">{p.name}</span>
                                <span className="text-[10px] bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200 shrink-0">
                                  {p.isTaluka ? 'तालुकास्तर' : 'मुख्य स्तर'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={async () => {
                                    const arr = [...postsList];
                                    const temp = arr[idx];
                                    arr[idx] = arr[idx - 1];
                                    arr[idx - 1] = temp;
                                    setPostsList(arr);
                                    localStorage.setItem('mahasangh_posts_v1', JSON.stringify(arr));
                                    window.dispatchEvent(new Event('mahasangh_posts_updated'));
                                    try {
                                      await saveAppointedPostsToRtdb(arr);
                                    } catch {}
                                  }}
                                  className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 disabled:opacity-30 cursor-pointer text-xs font-bold"
                                  title="वर सरकवा"
                                >
                                  ▲
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === postsList.length - 1}
                                  onClick={async () => {
                                    const arr = [...postsList];
                                    const temp = arr[idx];
                                    arr[idx] = arr[idx + 1];
                                    arr[idx + 1] = temp;
                                    setPostsList(arr);
                                    localStorage.setItem('mahasangh_posts_v1', JSON.stringify(arr));
                                    window.dispatchEvent(new Event('mahasangh_posts_updated'));
                                    try {
                                      await saveAppointedPostsToRtdb(arr);
                                    } catch {}
                                  }}
                                  className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 disabled:opacity-30 cursor-pointer text-xs font-bold"
                                  title="खाली सरकवा"
                                >
                                  ▼
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const arr = postsList.filter((_, i) => i !== idx);
                                    setPostsList(arr);
                                    localStorage.setItem('mahasangh_posts_v1', JSON.stringify(arr));
                                    window.dispatchEvent(new Event('mahasangh_posts_updated'));
                                    try {
                                      await saveAppointedPostsToRtdb(arr);
                                    } catch {}
                                    showAdminFeedback(`पद '${p.name}' वगळण्यात आले आहे.`, 'success');
                                  }}
                                  className="p-1.5 hover:bg-rose-50 text-rose-600 rounded cursor-pointer"
                                  title="वगळा"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Part 2: District Password Reset */}
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
                      <div>
                        <h4 className="font-serifDevanagari font-bold text-base text-[#17366d] flex items-center gap-2">
                          <KeyRound className="w-4 h-4 text-amber-600" />
                          2. जिल्हा पासवर्ड रिसेट (District Password Reset - Default AD2026)
                        </h4>
                        <p className="text-xs text-slate-600 mt-1">
                          जिल्ह्याचा पासवर्ड रिसेट केल्यास तो पूर्ववत <strong>'{DEFAULT_DISTRICT_PASSWORD}'</strong> होतो. त्यानंतर संबंधित जिल्हाध्यक्ष पहिल्यांदा <strong>'{DEFAULT_DISTRICT_PASSWORD}'</strong> टाकून लॉगिन करतील, तेव्हा त्यांना स्वतःचा नवीन पासवर्ड तयार करण्याचा स्क्रीन आपोआप उघडेल आणि त्यानंतर ते त्याच नवीन पासवर्डने लॉगिन करू शकतील.
                        </p>
                      </div>

                      {/* Quick Reset Box */}
                      <div className="p-4 bg-white border border-slate-300 rounded-xl space-y-3 shadow-2xs">
                        <div className="text-xs font-bold text-slate-800">
                          ⚡ तत्काळ जिल्हा पासवर्ड पूर्ववत 'AD2026' करा:
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                          <div className="sm:col-span-1">
                            <label className="font-bold text-slate-700 text-xs block mb-1">जिल्हा निवडा:</label>
                            <select
                              value={selectedDistrictForReset}
                              onChange={(e) => setSelectedDistrictForReset(e.target.value)}
                              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold"
                            >
                              {MAHARASHTRA_DISTRICTS.map((d) => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                          </div>
                          <div className="sm:col-span-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={isResettingDistrictPassword}
                              onClick={() => handleResetDistrictToAD2026(selectedDistrictForReset)}
                              className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                            >
                              <RotateCcw className={`w-3.5 h-3.5 ${isResettingDistrictPassword ? 'animate-spin' : ''}`} />
                              <span>
                                {isResettingDistrictPassword ? 'रिसेट होत आहे...' : `'${selectedDistrictForReset}' चा पासवर्ड पुन्हा AD2026 करा`}
                              </span>
                            </button>
                          </div>
                        </div>

                        {/* Optional Direct Manual Override */}
                        <form onSubmit={async (e) => {
                          e.preventDefault();
                          const dist = selectedDistrictForReset;
                          const pwd = customResetPassword.trim();
                          if (!dist || !pwd || pwd.length < 4) {
                            showAdminFeedback('कृपया किमान ४ अक्षरी पासवर्ड प्रविष्ट करा.', 'error');
                            return;
                          }
                          setIsResettingDistrictPassword(true);
                          try {
                            await updateDistrictPasswordInRtdb(dist, pwd);
                            setDistrictPasswords((prev) => ({ ...prev, [dist]: pwd }));
                            window.dispatchEvent(new Event('mahasangh_district_passwords_updated'));
                            showAdminFeedback(`'${dist}' जिल्ह्यासाठी नवीन पासवर्ड यशस्वीरीत्या सेव्ह झाला!`, 'success');
                            setCustomResetPassword('');
                          } catch (err: any) {
                            showAdminFeedback('त्रुटी: ' + err.message, 'error');
                          } finally {
                            setIsResettingDistrictPassword(false);
                          }
                        }} className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row gap-2 items-end">
                          <div className="flex-1 w-full">
                            <label className="text-[11px] text-slate-600 block mb-1">
                              किंवा थेट कोणताही नवीन पासवर्ड सेट करा (Optional Override):
                            </label>
                            <input
                              type="text"
                              value={customResetPassword}
                              onChange={(e) => setCustomResetPassword(e.target.value)}
                              placeholder={`'${selectedDistrictForReset}' साठी नवीन पासवर्ड (किमान ४ अक्षरे)`}
                              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={isResettingDistrictPassword || !customResetPassword.trim()}
                            className="bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white font-bold px-4 py-2 rounded-lg text-xs cursor-pointer"
                          >
                            थेट सेव्ह करा
                          </button>
                        </form>
                      </div>

                      {/* Complete 36 Districts Interactive Table & Status */}
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h5 className="font-bold text-xs text-slate-800">
                            📋 सर्व ३६ जिल्हे व पासवर्ड स्थिती:
                          </h5>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="🔍 जिल्हा शोधा..."
                              value={districtSearchFilter}
                              onChange={(e) => setDistrictSearchFilter(e.target.value)}
                              className="p-1.5 bg-white border border-slate-300 rounded-lg text-xs w-36 sm:w-48"
                            />
                            <button
                              type="button"
                              onClick={() => loadAllDistrictPasswords(true)}
                              disabled={isLoadingDistrictPasswords}
                              className="p-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-slate-700 text-xs flex items-center gap-1 cursor-pointer"
                              title="पासवर्ड स्थिती ताजी करा"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDistrictPasswords ? 'animate-spin' : ''}`} />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-80 overflow-y-auto pr-1">
                          {MAHARASHTRA_DISTRICTS
                            .filter((d) => !districtSearchFilter.trim() || d.includes(districtSearchFilter.trim()))
                            .map((dist) => {
                              const currentPass =
                                districtPasswords[dist] ||
                                (dist === 'अहिल्यानगर' ? districtPasswords['अहमदनगर'] : null) ||
                                DEFAULT_DISTRICT_PASSWORD;
                              const isDefault = currentPass === DEFAULT_DISTRICT_PASSWORD;

                              return (
                                <div
                                  key={dist}
                                  className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs hover:border-slate-300 transition-colors shadow-2xs"
                                >
                                  <div className="min-w-0 pr-2">
                                    <div className="font-bold text-slate-900 truncate">
                                      {dist}
                                    </div>
                                    <div className="mt-0.5">
                                      {isDefault ? (
                                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                          🟡 डिफॉल्ट (AD2026)
                                        </span>
                                      ) : (
                                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                          🟢 नवीन पासवर्ड सक्रिय
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={isResettingDistrictPassword}
                                    onClick={() => handleResetDistrictToAD2026(dist)}
                                    className="shrink-0 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                                    title="पासवर्ड पुन्हा AD2026 करा"
                                  >
                                    <RotateCcw className="w-3 h-3 text-rose-600" />
                                    <span>AD2026 करा</span>
                                  </button>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </div>

                    {/* Part 3: State President Password Reset (राज्याध्यक्ष पासवर्ड रिसेट - Default RK2026) */}
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
                      <div>
                        <h4 className="font-serifDevanagari font-bold text-base text-[#17366d] flex items-center gap-2">
                          <Award className="w-4 h-4 text-amber-600" />
                          राज्याध्यक्ष पासवर्ड रिसेट (State President Password Reset - Default RK2026)
                        </h4>
                        <p className="text-xs text-slate-600 mt-1">
                          संस्थापक राज्याध्यक्षांचा पासवर्ड रिसेट केल्यास तो पुन्हा <strong>'RK2026'</strong> होईल. त्यानंतर राज्याध्यक्ष 'RK2026' टाकून लॉगिन करतील तेव्हा त्यांना नवीन पासवर्ड सेट करण्याचा स्क्रीन मिळेल.
                        </p>
                      </div>

                      <div className="p-4 bg-white border border-slate-300 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
                        <div>
                          <span className="text-xs font-bold text-slate-800">
                            ⚡ राज्याध्यक्ष पासवर्ड पूर्ववत 'RK2026' करा:
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={isResettingPresidentPassword}
                          onClick={async () => {
                            setIsResettingPresidentPassword(true);
                            try {
                              await updatePresidentPasswordInFirebase('RK2026');
                              showAdminFeedback('राज्याध्यक्ष पासवर्ड यशस्वीपणे "RK2026" करण्यात आला आहे!', 'success');
                            } catch (err: any) {
                              showAdminFeedback('त्रुटी: ' + (err.message || 'रिसेट करता आला नाही'), 'error');
                            } finally {
                              setIsResettingPresidentPassword(false);
                            }
                          }}
                          className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors shrink-0"
                        >
                          <RotateCcw className={`w-3.5 h-3.5 ${isResettingPresidentPassword ? 'animate-spin' : ''}`} />
                          <span>{isResettingPresidentPassword ? 'रिसेट होत आहे...' : 'राज्याध्यक्ष पासवर्ड RK2026 करा'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Part 4: Letter Studio (Appointment Letter Design & Customization Studio) */}
                    <div className="bg-white p-5 sm:p-6 rounded-xl border border-amber-300 shadow-sm space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                        <div>
                          <h4 className="font-serifDevanagari font-bold text-base sm:text-lg text-[#17366d] flex items-center gap-2">
                            <Award className="w-5 h-5 text-amber-600" />
                            3. नियुक्ती पत्र डिझाईन व कस्टमायझेशन (Appointment Letter Studio)
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            येथून आपण नियुक्ती पत्राचे घटक, पार्श्वभूमी, स्वाक्षऱ्या, मजकूर आणि फॉन्ट आकार थेट कस्टमाइझ करू शकता.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleDownloadLetterPdfAction}
                          disabled={isDownloadingLetterPdf}
                          className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                        >
                          <Download className="w-4 h-4" />
                          <span>{isDownloadingLetterPdf ? 'PDF तयार होत आहे...' : 'नमुना पत्र PDF डाऊनलोड'}</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        {/* Left: Controls & Customization Form */}
                        <div className="space-y-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200 max-h-[75vh] overflow-y-auto">
                          {/* 1. Element Visibility */}
                          <div className="space-y-2">
                            <h5 className="font-bold text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                              <Eye className="w-3.5 h-3.5 text-[#17366d]" />
                              <span>घटक दाखवा / लपवा (Element Visibility)</span>
                            </h5>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="flex items-center gap-1.5 p-2 bg-white rounded border border-slate-200 cursor-pointer font-medium text-slate-700">
                                <input type="checkbox" checked={showLetterHeader} onChange={(e) => setShowLetterHeader(e.target.checked)} className="rounded text-[#df6b16]" />
                                <span>हेडर बॅनर (Header)</span>
                              </label>
                              <label className="flex items-center gap-1.5 p-2 bg-white rounded border border-slate-200 cursor-pointer font-medium text-slate-700">
                                <input type="checkbox" checked={showOutward} onChange={(e) => setShowOutward(e.target.checked)} className="rounded text-[#df6b16]" />
                                <span>पत्र क्रमांक व दिनांक</span>
                              </label>
                              <label className="flex items-center gap-1.5 p-2 bg-white rounded border border-slate-200 cursor-pointer font-medium text-slate-700">
                                <input type="checkbox" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} className="rounded text-[#df6b16]" />
                                <span>पत्र शीर्षक (Title)</span>
                              </label>
                              <label className="flex items-center gap-1.5 p-2 bg-white rounded border border-slate-200 cursor-pointer font-medium text-slate-700">
                                <input type="checkbox" checked={showRecipient} onChange={(e) => setShowRecipient(e.target.checked)} className="rounded text-[#df6b16]" />
                                <span>प्रति / व्यक्ती माहिती</span>
                              </label>
                              <label className="flex items-center gap-1.5 p-2 bg-white rounded border border-slate-200 cursor-pointer font-medium text-slate-700">
                                <input type="checkbox" checked={showSubject} onChange={(e) => setShowSubject(e.target.checked)} className="rounded text-[#df6b16]" />
                                <span>विषय पट्टी (Subject)</span>
                              </label>
                              <label className="flex items-center gap-1.5 p-2 bg-white rounded border border-slate-200 cursor-pointer font-medium text-slate-700">
                                <input type="checkbox" checked={showBody} onChange={(e) => setShowBody(e.target.checked)} className="rounded text-[#df6b16]" />
                                <span>मुख्य परिच्छेद (१ व २)</span>
                              </label>
                              <label className="flex items-center gap-1.5 p-2 bg-white rounded border border-slate-200 cursor-pointer font-medium text-slate-700">
                                <input type="checkbox" checked={showCallout} onChange={(e) => setShowCallout(e.target.checked)} className="rounded text-[#df6b16]" />
                                <span>पद सन्मान बॅनर</span>
                              </label>
                              <label className="flex items-center gap-1.5 p-2 bg-white rounded border border-slate-200 cursor-pointer font-medium text-slate-700">
                                <input type="checkbox" checked={showPara3} onChange={(e) => setShowPara3(e.target.checked)} className="rounded text-[#df6b16]" />
                                <span>परिच्छेद ३ (शुभेच्छा)</span>
                              </label>
                              <label className="flex items-center gap-1.5 p-2 bg-white rounded border border-slate-200 cursor-pointer font-medium text-slate-700">
                                <input type="checkbox" checked={showSign1} onChange={(e) => setShowSign1(e.target.checked)} className="rounded text-[#df6b16]" />
                                <span>स्वाक्षरी १ (सरचिटणीस)</span>
                              </label>
                              <label className="flex items-center gap-1.5 p-2 bg-white rounded border border-slate-200 cursor-pointer font-medium text-slate-700">
                                <input type="checkbox" checked={showSign2} onChange={(e) => setShowSign2(e.target.checked)} className="rounded text-[#df6b16]" />
                                <span>स्वाक्षरी २ (राज्याध्यक्ष)</span>
                              </label>
                            </div>
                          </div>

                          {/* 2. Background & Custom Images */}
                          <div className="space-y-2 pt-2 border-t border-slate-200">
                            <h5 className="font-bold text-slate-800 flex items-center gap-1.5">
                              <ImageIcon className="w-3.5 h-3.5 text-[#17366d]" />
                              <span>पार्श्वभूमी व लोगो (Background & Images)</span>
                            </h5>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="text-[11px] font-bold text-slate-600 block mb-1">A4 पार्श्वभूमी इमेज:</label>
                                <input type="file" accept="image/*" onChange={handleBgUpload} className="w-full p-1.5 bg-white border border-slate-300 rounded text-[11px]" />
                              </div>
                              <div>
                                <label className="text-[11px] font-bold text-slate-600 block mb-1">इतर सानुकूल इमेज:</label>
                                <input type="file" accept="image/*" onChange={handleCustomImgUpload} className="w-full p-1.5 bg-white border border-slate-300 rounded text-[11px]" />
                              </div>
                            </div>
                          </div>

                          {/* 3. Signature Customization */}
                          <div className="space-y-2 pt-2 border-t border-slate-200">
                            <h5 className="font-bold text-slate-800">✍️ स्वाक्षरी व पदनाम संपादन</h5>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="text-[11px] font-bold text-slate-600 block mb-1">स्वाक्षरी १ नाव:</label>
                                <input type="text" value={letterSign1Name} onChange={(e) => setLetterSign1Name(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded text-xs" />
                              </div>
                              <div>
                                <label className="text-[11px] font-bold text-slate-600 block mb-1">स्वाक्षरी २ नाव:</label>
                                <input type="text" value={letterSign2Name} onChange={(e) => setLetterSign2Name(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded text-xs" />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="text-[11px] font-bold text-slate-600 block mb-1">स्वाक्षरी १ पद:</label>
                                <textarea rows={2} value={letterSign1Role} onChange={(e) => setLetterSign1Role(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded text-xs" />
                              </div>
                              <div>
                                <label className="text-[11px] font-bold text-slate-600 block mb-1">स्वाक्षरी २ पद:</label>
                                <textarea rows={2} value={letterSign2Role} onChange={(e) => setLetterSign2Role(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded text-xs" />
                              </div>
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">राज्याध्यक्ष स्वाक्षरी शिक्का (PNG):</label>
                              <input type="file" accept="image/*" onChange={handleSignImgUpload} className="w-full p-1.5 bg-white border border-slate-300 rounded text-[11px]" />
                            </div>
                          </div>

                          {/* 4. Typography & Spacing */}
                          <div className="space-y-2 pt-2 border-t border-slate-200">
                            <h5 className="font-bold text-slate-800">🔤 फॉन्ट आकार व अंतर</h5>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-[10px] font-bold text-slate-600 block">फॉन्ट साईज ({letterFontSize}px)</label>
                                <input type="range" min="12" max="20" value={letterFontSize} onChange={(e) => setLetterFontSize(Number(e.target.value))} className="w-full accent-[#df6b16]" />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-slate-600 block">लाईन हाईट ({letterLineHeight})</label>
                                <input type="range" min="1.3" max="2.0" step="0.05" value={letterLineHeight} onChange={(e) => setLetterLineHeight(Number(e.target.value))} className="w-full accent-[#df6b16]" />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-slate-600 block">मजकूर रंग</label>
                                <input type="color" value={letterTextColor} onChange={(e) => setLetterTextColor(e.target.value)} className="w-full h-7 rounded border border-slate-300 cursor-pointer p-0.5 bg-white" />
                              </div>
                            </div>
                          </div>

                          {/* 5. Letter Text Editing */}
                          <div className="space-y-2 pt-2 border-t border-slate-200">
                            <h5 className="font-bold text-slate-800">📝 पत्र मजकूर संपादन</h5>
                            <div>
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">विषय ओळ:</label>
                              <input type="text" value={letterSubjectText} onChange={(e) => setLetterSubjectText(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded text-xs font-bold" />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">परिच्छेद १:</label>
                              <textarea rows={3} value={letterPara1Text} onChange={(e) => setLetterPara1Text(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded text-xs" />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">परिच्छेद २:</label>
                              <textarea rows={3} value={letterPara2Text} onChange={(e) => setLetterPara2Text(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded text-xs" />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">परिच्छेद ३ (शुभेच्छा):</label>
                              <textarea rows={3} value={letterPara3Text} onChange={(e) => setLetterPara3Text(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded text-xs" />
                            </div>
                          </div>
                        </div>

                        {/* Right: Live A4 Preview Canvas */}
                        <div className="bg-slate-200 p-3 rounded-xl flex flex-col items-center overflow-x-auto">
                          <div className="text-[11px] font-bold text-slate-600 mb-2">
                            👁️ लाईव्ह नियुक्ती पत्र प्रिव्ह्यू (A4 Canvas Preview)
                          </div>
                          
                          <div
                            ref={letterStudioRef}
                            className="bg-white text-slate-900 shadow-xl relative flex flex-col justify-between"
                            style={{
                              width: '560px',
                              minWidth: '560px',
                              height: '792px',
                              minHeight: '792px',
                              padding: '24px',
                              backgroundImage: letterBgUrl ? `url(${letterBgUrl})` : 'none',
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              boxSizing: 'border-box'
                            }}
                          >
                            <div className="border-2 border-[#851216] outline-1 outline-[#d4af37] outline-offset-[-4px] p-4 h-full flex flex-col justify-between relative bg-white/90 backdrop-blur-3xs">
                              {/* Top Header */}
                              {showLetterHeader && (
                                <div className="text-center border-b-2 border-[#d4af37] pb-2 mb-2">
                                  <div className="text-[10px] font-bold text-slate-600">Reg. No. MH/0000555/2026</div>
                                  <div className="text-base font-extrabold text-[#1e3a8a]">महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ</div>
                                  <div className="text-[9px] font-bold text-amber-900 bg-amber-50 inline-block px-3 py-0.5 rounded-full border border-amber-300 my-0.5">
                                    शिक्षणासाठी समर्पित... अधिकाऱ्यांच्या हितासाठी...!
                                  </div>
                                </div>
                              )}

                              {/* Outward & Date */}
                              {showOutward && (
                                <div className="flex justify-between items-center text-xs font-bold text-slate-800 border-b border-dashed border-red-800 pb-1 mb-2">
                                  <span>जावक क्र.: एमआरके / नियुक्ती / २०२६ / ०१</span>
                                  <span>दिनांक: {formatDateWithEnglishDigits(new Date())}</span>
                                </div>
                              )}

                              {/* Title */}
                              {showTitle && (
                                <div className="text-center my-1">
                                  <span className="inline-block bg-[#851216] text-white text-xs font-bold px-6 py-1 rounded-full border border-[#d4af37] shadow-xs">
                                    अधिकृत नियुक्ती पत्र
                                  </span>
                                </div>
                              )}

                              {/* Recipient */}
                              {showRecipient && (
                                <div className="text-xs font-bold text-slate-900 leading-snug my-1">
                                  <div>प्रति,</div>
                                  <div className="text-sm font-extrabold text-[#1e3a8a] pl-3">श्री. संतोष रमेश पाटील</div>
                                  <div className="text-[11px] text-slate-700 pl-3">पद: जिल्हाध्यक्ष (अहिल्यानगर)</div>
                                </div>
                              )}

                              {/* Subject */}
                              {showSubject && (
                                <div className="text-xs font-bold text-slate-900 my-1 bg-amber-50/80 p-1.5 rounded border border-amber-200">
                                  <span>विषय: </span>
                                  <span className="underline">{letterSubjectText}</span>
                                </div>
                              )}

                              {/* Body Paragraphs */}
                              {showBody && (
                                <div
                                  className="space-y-2 text-justify my-1 flex-1"
                                  style={{
                                    fontSize: `${letterFontSize * 0.75}px`,
                                    lineHeight: letterLineHeight,
                                    color: letterTextColor
                                  }}
                                >
                                  <p>{letterPara1Text}</p>
                                  <p>{letterPara2Text}</p>
                                </div>
                              )}

                              {/* Appointment Callout */}
                              {showCallout && (
                                <div className="text-center my-2 py-1 bg-gradient-to-r from-amber-50 via-amber-100 to-amber-50 border-y-2 border-[#d4af37]">
                                  <span className="text-[11px] font-bold text-slate-700 block">महासंघाच्या मान्यतेने बहाल केलेले अधिकृत पद:</span>
                                  <span className="font-serifDevanagari text-base font-extrabold text-[#851216]">
                                    जिल्हाध्यक्ष (अहिल्यानगर जिल्हा)
                                  </span>
                                </div>
                              )}

                              {/* Para 3 */}
                              {showPara3 && (
                                <div
                                  className="text-justify my-1"
                                  style={{
                                    fontSize: `${letterFontSize * 0.75}px`,
                                    lineHeight: letterLineHeight,
                                    color: letterTextColor
                                  }}
                                >
                                  <p>{letterPara3Text}</p>
                                </div>
                              )}

                              {/* Custom Inserted Image */}
                              {letterCustomImgUrl && (
                                <div className="my-1 text-center">
                                  <img src={letterCustomImgUrl} alt="Custom" className="max-h-24 mx-auto object-contain rounded" />
                                </div>
                              )}

                              {/* Signatures */}
                              <div className="flex justify-between items-end pt-2 border-t border-slate-300 mt-auto text-[11px]">
                                {showSign1 && (
                                  <div className="text-center">
                                    <div className="font-bold text-slate-900">{letterSign1Name}</div>
                                    <div className="text-[10px] text-slate-600 whitespace-pre-line">{letterSign1Role}</div>
                                  </div>
                                )}
                                {letterSignImg && (
                                  <div className="text-center">
                                    <img src={letterSignImg} alt="Sign" className="max-h-12 object-contain mx-auto" />
                                  </div>
                                )}
                                {showSign2 && (
                                  <div className="text-center">
                                    <div className="font-bold text-slate-900">{letterSign2Name}</div>
                                    <div className="text-[10px] text-slate-600 whitespace-pre-line">{letterSign2Role}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-tab 3: News / Circular Management */}
            {activeAdminSubTab === 'add_news' && (currentUser?.isSuperAdmin || currentUser?.permissions.manageNews) && (
              <div className="space-y-6">
                {/* Mode Selector Tabs */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-2 items-center justify-between">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNewsManageMode('form');
                        setNewsError('');
                      }}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                        newsManageMode === 'form'
                          ? 'bg-[#17366d] text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>{editingNewsItem ? '✏️ बातमी संपादन करा' : '📰 सविस्तर बातमी / शासन निर्णय'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setNewsManageMode('list');
                        setNewsError('');
                      }}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                        newsManageMode === 'list'
                          ? 'bg-slate-800 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      <List className="w-4 h-4" />
                      <span>📋 सर्व बातम्या ({newsList.length})</span>
                    </button>
                  </div>

                  {editingNewsItem && newsManageMode !== 'form' && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNewsItem(null);
                        setNewsTitle('');
                        setNewsSummary('');
                        setNewsContent('');
                        setNewsImageUrl('');
                      }}
                      className="text-xs text-rose-600 font-semibold hover:underline"
                    >
                      संपादन रद्द करा
                    </button>
                  )}
                </div>

                {newsCreatedSuccess && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 shadow-xs">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span className="font-semibold">
                      {editingNewsItem
                        ? 'बातमीमधील बदल यशस्वीपणे सेव्ह झाले असून वेबसाईटवर अद्ययावत झाले आहेत!'
                        : 'बातमी / परिपत्रक / फोटो यशस्वीपणे वेबसाईटवर प्रसिद्ध करण्यात आला आहे!'}
                    </span>
                  </div>
                )}

                {newsError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{newsError}</span>
                  </div>
                )}

                {/* MODE 1: Full News & GR Form */}
                {newsManageMode === 'form' && (
                  <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-xs max-w-3xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-5 border-b border-slate-100 gap-2">
                      <div>
                        <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#17366d] flex items-center gap-2">
                          <PlusCircle className="w-5 h-5 text-[#df6b16]" />
                          {editingNewsItem ? 'बातमी / परिपत्रक संपादित करा (Edit News/GR)' : 'नवीन बातमी किंवा अधिकृत परिपत्रक प्रसिद्ध करा'}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                          बातमीचा तपशील, संबंधित छायाचित्र व मजकूर भरा. हे मुख्य वेबसाईटवर लगेच प्रसिद्ध होईल.
                        </p>
                      </div>

                      {editingNewsItem && (
                        <button
                          type="button"
                          onClick={handleCancelEditNews}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 transition-colors self-start"
                        >
                          ✕ संपादन रद्द करा
                        </button>
                      )}
                    </div>

                    {editingNewsItem && (
                      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center justify-between">
                        <div>
                          <strong>संपादित करत आहात:</strong> {editingNewsItem.title}
                          <span className="ml-2 text-[11px] text-amber-700">({editingNewsItem.date})</span>
                        </div>
                      </div>
                    )}

                    <form onSubmit={handleCreateNews} className="space-y-4 text-xs">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          बातमी / परिपत्रकाचे शीर्षक <span className="text-rose-600">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="उदा. केंद्रप्रमुख पदोन्नती बाबत राज्यस्तरीय बैठक संपन्न..."
                          value={newsTitle}
                          onChange={(e) => setNewsTitle(e.target.value)}
                          className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16] text-sm"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="font-bold text-slate-700 block mb-1 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-[#df6b16]" />
                            <span>प्रसिद्धी दिनांक (Publication Date)</span> <span className="text-rose-600">*</span>
                          </label>
                          <input
                            type="date"
                            required
                            value={newsDate}
                            onChange={(e) => setNewsDate(e.target.value)}
                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16] text-xs font-bold bg-white"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-slate-700 block mb-1">
                            श्रेणी (Category) <span className="text-rose-600">*</span>
                          </label>
                          <select
                            value={newsCategory}
                            onChange={(e) => setNewsCategory(e.target.value)}
                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                          >
                            <option value="अधिकृत घोषणा">अधिकृत घोषणा</option>
                            <option value="अधिकृत वृत्त">अधिकृत वृत्त</option>
                            <option value="संघटना वृत्त">संघटना वृत्त</option>
                            <option value="अभिनंदन">अभिनंदन</option>
                            <option value="शासन निर्णय (GR)">शासन निर्णय (GR)</option>
                            <option value="बैठक अहवाल">बैठक अहवाल</option>
                            <option value="जिल्हा वृत्त">जिल्हा वृत्त</option>
                            <option value="अधिकृत छायाचित्र / परिपत्रक">अधिकृत छायाचित्र / परिपत्रक</option>
                          </select>
                        </div>

                        <div>
                          <label className="font-bold text-slate-700 block mb-1">
                            फोटो अपलोड (Direct Server Upload)
                          </label>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#09243f] hover:bg-[#17366d] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors">
                                <Upload className="w-3.5 h-3.5 text-[#df6b16]" />
                                <span>
                                  {isUploadingNewsCloudinary
                                    ? 'सर्व्हरवर फोटो अपलोड होत आहे...'
                                    : isCompressingNewsImg
                                    ? 'प्रक्रिया सुरू आहे...'
                                    : 'फोटो निवडा (Upload Photo)'}
                                </span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleNewsImageUpload}
                                  className="hidden"
                                  disabled={isCompressingNewsImg || isUploadingNewsCloudinary}
                                />
                              </label>

                              {newsImageUrl && (
                                <button
                                  type="button"
                                  onClick={() => setNewsImageUrl('')}
                                  className="text-xs text-rose-600 hover:underline font-semibold"
                                >
                                  फोटो हटवा
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Photo Thumbnail Preview */}
                      {newsImageUrl && (
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
                          <img
                            src={newsImageUrl}
                            alt="News Preview"
                            className="w-16 h-16 object-cover rounded-lg border border-slate-300 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              फोटो यशस्वीरीत्या जोडला गेला आहे
                            </span>
                            <p className="text-[10px] text-slate-500 truncate mt-0.5 font-mono">
                              {newsImageUrl}
                            </p>
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          थोडक्यात सारांश <span className="text-rose-600">*</span>
                        </label>
                        <textarea
                          required
                          rows={2}
                          placeholder="बातमीचा 2-3 ओळींत महत्त्वाचा सारांश..."
                          value={newsSummary}
                          onChange={(e) => setNewsSummary(e.target.value)}
                          className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          सविस्तर मजकूर <span className="text-rose-600">*</span>
                        </label>
                        <textarea
                          required
                          rows={6}
                          placeholder="बातमीची संपूर्ण माहिती किंवा परिपत्रकाचा संपूर्ण तपशील..."
                          value={newsContent}
                          onChange={(e) => setNewsContent(e.target.value)}
                          className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pt-2">
                        <button
                          type="button"
                          onClick={handleOpenLivePreview}
                          className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-5 rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-xs"
                        >
                          <Eye className="w-4 h-4 text-emerald-400" />
                          <span>प्रिव्ह्यू पहा (Live Preview)</span>
                        </button>

                        <button
                          type="submit"
                          className="bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold py-2.5 px-6 rounded-lg text-xs transition-colors shadow-xs flex items-center gap-1.5"
                        >
                          <Check className="w-4 h-4" />
                          <span>{editingNewsItem ? 'बदल सेव्ह करा (Update)' : 'वेबसाईटवर प्रसिद्ध करा (Publish)'}</span>
                        </button>

                        {editingNewsItem && (
                          <button
                            type="button"
                            onClick={handleCancelEditNews}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-2.5 px-4 rounded-lg text-xs"
                          >
                            रद्द करा
                          </button>
                        )}
                      </div>
                    </form>
                  </div>
                )}

                {/* MODE 2: Published News & GR List with Edit & Delete */}
                {newsManageMode === 'list' && (
                  <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-100 gap-3">
                      <div>
                        <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#17366d] flex items-center gap-2">
                          <FileText className="w-5 h-5 text-[#df6b16]" />
                          सर्व प्रसिद्ध बातम्या, शासन निर्णय व फोटो ({newsList.length})
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          वेबसाईटवर प्रसिद्ध असलेल्या सर्व नोंदी पाहण्यासाठी, संपादित करण्यासाठी किंवा हटवण्यासाठी ही यादी वापरा.
                        </p>
                      </div>

                      {/* Search */}
                      <div className="relative w-full sm:w-64">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="शीर्षक किंवा श्रेणी शोधा..."
                          value={newsSearchQuery}
                          onChange={(e) => setNewsSearchQuery(e.target.value)}
                          className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>
                    </div>

                    {newsList.length === 0 ? (
                      <div className="text-center py-12 text-slate-500 text-xs">
                        वेबसाईटवर अद्याप कोणतीही बातमी उपलब्ध नाही.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {newsList
                          .filter((item) => {
                            if (!newsSearchQuery.trim()) return true;
                            const q = newsSearchQuery.toLowerCase();
                            return (
                              item.title.toLowerCase().includes(q) ||
                              item.category.toLowerCase().includes(q) ||
                              (item.summary && item.summary.toLowerCase().includes(q))
                            );
                          })
                          .map((item) => {
                            const img = item.imageUrl || item.image;
                            const isPhotoOnly = !item.content || item.content.trim() === '';
                            return (
                              <div
                                key={item.id}
                                className="bg-slate-50/70 hover:bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between transition-all"
                              >
                                <div className="flex gap-3">
                                  {img ? (
                                    <img
                                      src={img}
                                      alt={item.title}
                                      className="w-16 h-16 object-cover rounded-lg border border-slate-200 shrink-0"
                                    />
                                  ) : (
                                    <div className="w-16 h-16 rounded-lg bg-slate-200 flex items-center justify-center shrink-0 text-slate-400">
                                      <FileText className="w-6 h-6" />
                                    </div>
                                  )}

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                                        {item.category}
                                      </span>
                                      <span className="text-[10px] text-slate-500">
                                        {item.date}
                                      </span>
                                      {isPhotoOnly && (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                          📷 केवळ फोटो
                                        </span>
                                      )}
                                    </div>

                                    <h4 className="font-bold text-slate-900 text-xs line-clamp-2">
                                      {item.title}
                                    </h4>

                                    {item.summary && (
                                      <p className="text-[11px] text-slate-600 line-clamp-2 mt-1">
                                        {item.summary}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-slate-200 text-xs">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewNewsItem(item)}
                                    className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded border border-slate-300 flex items-center gap-1 transition-colors"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-blue-600" />
                                    <span>प्रिव्ह्यू</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleStartEditNews(item)}
                                    className="px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-800 font-semibold rounded border border-amber-300 flex items-center gap-1 transition-colors"
                                  >
                                    <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                                    <span>संपादित करा</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteNewsItem(item)}
                                    className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-700 font-semibold rounded border border-rose-300 flex items-center gap-1 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                    <span>हटवा</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}

                {/* Live Preview Modal */}
                {previewNewsItem && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
                    <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
                      {/* Header */}
                      <div className="sticky top-0 bg-white/95 backdrop-blur-md px-5 py-3 border-b border-slate-200 flex items-center justify-between z-10">
                        <div className="flex items-center gap-2">
                          <Eye className="w-4 h-4 text-[#df6b16]" />
                          <span className="font-bold text-xs sm:text-sm text-[#09243f]">
                            थेट प्रिव्ह्यू (Live Preview) — मुख्य वेबसाईटवर असे दिसेल
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreviewNewsItem(null)}
                          className="p-1 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-800"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Content Preview */}
                      <div className="p-5 sm:p-6 space-y-4">
                        {/* Big Photo Prominently on Top */}
                        {(previewNewsItem.imageUrl || previewNewsItem.image) && (
                          <div className="bg-slate-900 rounded-xl overflow-hidden shadow-md">
                            <img
                              src={previewNewsItem.imageUrl || previewNewsItem.image}
                              alt={previewNewsItem.title}
                              className="w-full max-h-96 object-contain mx-auto"
                            />
                            <div className="p-2 bg-slate-900/90 text-center">
                              <span className="text-[11px] text-slate-300">
                                📷 मुख्य वेबसाईटवर फोटो असा वर दिसेल
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#e8eef7] text-[#17366d]">
                            {previewNewsItem.category}
                          </span>
                          <span className="text-xs text-slate-500">
                            दिनांक: {previewNewsItem.date}
                          </span>
                        </div>

                        <h2 className="font-serifDevanagari text-lg sm:text-2xl font-bold text-[#09243f] leading-snug">
                          {previewNewsItem.title}
                        </h2>

                        {previewNewsItem.summary && (
                          <div className="p-3 bg-amber-50/70 border-l-4 border-[#df6b16] rounded-r-lg text-xs sm:text-sm text-slate-700 italic">
                            {previewNewsItem.summary}
                          </div>
                        )}

                        {previewNewsItem.content ? (
                          <div className="text-xs sm:text-sm text-slate-800 leading-relaxed space-y-2 whitespace-pre-line border-t border-slate-100 pt-3">
                            {previewNewsItem.content}
                          </div>
                        ) : (
                          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-600">
                            💡 ही केवळ फोटो पोस्ट आहे. वेबसाईटवर युझरला <strong>'📷 फोटो पहा'</strong> हे बटण दिसेल व त्यावर क्लिक केल्यावर हा फोटो संपूर्ण मोठा दिसेल.
                          </div>
                        )}
                      </div>

                      {/* Modal Footer */}
                      <div className="sticky bottom-0 bg-slate-50 px-5 py-3 border-t border-slate-200 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setPreviewNewsItem(null)}
                          className="bg-[#17366d] hover:bg-[#09243f] text-white font-bold px-5 py-2 rounded-lg text-xs transition-colors"
                        >
                          प्रिव्ह्यू बंद करा
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sub-tab: Latest Banners Management (ताज्या घडामोडी बॅनर्स) */}
            {activeAdminSubTab === 'latest_banners' && (currentUser?.isSuperAdmin || currentUser?.permissions.manageLatestBanners) && (
              <div className="space-y-6">
                <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-xs max-w-3xl">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#17366d] flex items-center gap-2">
                      <ImageIcon className="w-5 h-5 text-[#df6b16]" />
                      {editingBannerId ? 'ताज्या घडामोडी बॅनर संपादन करा (Edit)' : 'ताज्या घडामोडी नवीन बॅनर्स / फोटो जोडा'}
                    </h3>
                    {editingBannerId && (
                      <button
                        type="button"
                        onClick={handleCancelEditBanner}
                        className="text-xs font-bold text-rose-600 hover:bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200"
                      >
                        संपादन रद्द करा
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mb-5">
                    येथे जोडलेला फोटो व बातमी मुख्य पानावरील 'ताज्या घडामोडी' विभागात सर्वात समोर दिसते.
                  </p>

                  {bannerSuccessMsg && (
                    <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 shadow-xs">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <span className="font-semibold">{bannerSuccessMsg}</span>
                    </div>
                  )}

                  {bannerErrorMsg && (
                    <div className="mb-4 p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl">
                      {bannerErrorMsg}
                    </div>
                  )}

                  <form onSubmit={handleCreateLatestBannerSubmit} className="space-y-4 text-xs sm:text-sm">
                    {/* Media Type Switcher: Photo vs Short Video */}
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        माध्यम प्रकार (Media Type) निवडा:
                      </label>
                      <div className="flex gap-2 p-1 bg-slate-100 rounded-lg max-w-sm">
                        <button
                          type="button"
                          onClick={() => setBannerMediaType('image')}
                          className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            bannerMediaType === 'image'
                              ? 'bg-white text-[#17366d] shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>📸 छायाचित्र (Photo)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setBannerMediaType('video')}
                          className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            bannerMediaType === 'video'
                              ? 'bg-white text-rose-700 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Video className="w-3.5 h-3.5 text-rose-600" />
                          <span>🎥 शॉर्ट व्हिडिओ (Max 3 MB)</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        बॅनर / बातमी शीर्षक (Title) <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="उदा. वर्धा जिल्हा कार्यकारिणीची घोषणा व सत्कार समारंभ"
                        value={bannerTitle}
                        onChange={(e) => setBannerTitle(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#17366d]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">दिनांक (Date)</label>
                        <input
                          type="date"
                          value={bannerDate}
                          onChange={(e) => setBannerDate(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#17366d]"
                        />
                      </div>

                      {bannerMediaType === 'image' ? (
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">
                            छायाचित्र (Upload / URL) <span className="text-rose-600">*</span>
                          </label>
                          <div className="flex gap-2 items-center">
                            <input
                              type="text"
                              required
                              placeholder="https://... किंवा फाइल निवडा"
                              value={bannerImageUrl}
                              onChange={(e) => setBannerImageUrl(e.target.value)}
                              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#17366d]"
                            />
                            <label className={`shrink-0 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors ${isUploadingBanner ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}>
                              <Upload className="w-4 h-4" />
                              <span>{isUploadingBanner ? 'अपलोड होत आहे...' : 'फाइल निवडा'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                disabled={isUploadingBanner}
                                className="hidden"
                                onChange={handleBannerImageUpload}
                              />
                            </label>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="font-bold text-slate-700 block">
                              शॉर्ट व्हिडिओ <span className="text-rose-600">*</span>
                            </label>
                            <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                              मर्यादा: कमाल ३ MB
                            </span>
                          </div>
                          <div className="flex gap-2 items-center">
                            <input
                              type="text"
                              required
                              placeholder="https://... किंवा फाइल निवडा"
                              value={bannerVideoUrl}
                              onChange={(e) => {
                                setBannerVideoUrl(e.target.value);
                                if (!bannerImageUrl) setBannerImageUrl(e.target.value);
                              }}
                              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#17366d] font-mono text-xs"
                            />
                            <label className={`shrink-0 bg-rose-700 hover:bg-rose-800 text-white px-3.5 py-2.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors ${isUploadingBannerVideo ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}>
                              <Upload className="w-4 h-4" />
                              <span>{isUploadingBannerVideo ? 'व्हिडिओ अपलोड...' : 'व्हिडिओ निवडा (Max 3MB)'}</span>
                              <input
                                type="file"
                                accept="video/mp4,video/webm,video/*"
                                disabled={isUploadingBannerVideo}
                                className="hidden"
                                onChange={handleBannerVideoUpload}
                              />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    {bannerMediaType === 'image' && bannerImageUrl && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-4">
                        <img src={bannerImageUrl} alt="Preview" className="w-20 h-16 object-contain rounded bg-white border border-slate-300" />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs text-emerald-700 font-bold block">
                            ✓ छायाचित्र यशस्वीरीत्या जोडले गेले आहे.
                          </span>
                        </div>
                      </div>
                    )}

                    {bannerMediaType === 'video' && bannerVideoUrl && (
                      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4" />
                            ✓ शॉर्ट व्हिडिओ यशस्वीरीत्या जोडला गेला आहे (Cloudinary CDN)
                          </span>
                          <span className="text-[11px] text-slate-400">
                            मुख्य पानावर इनलाईन प्ले होईल
                          </span>
                        </div>
                        <video
                          src={bannerVideoUrl}
                          controls
                          playsInline
                          preload="metadata"
                          className="w-full max-h-56 rounded bg-black object-contain mx-auto"
                        />
                      </div>
                    )}

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">थोडक्यात सारांश (Summary / Description)</label>
                      <textarea
                        rows={3}
                        placeholder="ताज्या घडामोडीबाबत थोडक्यात माहिती किंवा बातमीचा सारांश..."
                        value={bannerSummary}
                        onChange={(e) => setBannerSummary(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#17366d]"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="submit"
                        disabled={isUploadingBanner || isUploadingBannerVideo || isSavingBanner}
                        className="bg-[#17366d] hover:bg-[#09243f] disabled:opacity-60 text-white font-bold px-6 py-3 rounded-xl shadow-md transition-colors flex items-center gap-2 cursor-pointer"
                      >
                        <PlusCircle className="w-4 h-4 text-amber-400" />
                        <span>
                          {isSavingBanner
                            ? 'सेव्ह होत आहे...'
                            : editingBannerId
                            ? 'बदल सेव्ह करा'
                            : bannerMediaType === 'video'
                            ? 'शॉर्ट व्हिडिओ प्रसिद्ध करा'
                            : 'ताज्या घडामोडी बॅनर प्रसिद्ध करा'}
                        </span>
                      </button>
                      {editingBannerId && (
                        <button
                          type="button"
                          onClick={handleCancelEditBanner}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-3 rounded-xl text-xs transition-colors"
                        >
                          रद्द करा
                        </button>
                      )}
                    </div>
                  </form>
                </div>

                {/* Existing Banners List */}
                <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <h4 className="font-serifDevanagari text-base font-bold text-[#17366d]">
                      प्रसिद्ध केलेले सर्व ताज्या घडामोडी बॅनर्स ({latestBanners.length})
                    </h4>
                    {onRefreshLatestBanners && (
                      <button
                        type="button"
                        onClick={handleRefreshBannersClick}
                        disabled={isRefreshingBanners}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingBanners ? 'animate-spin' : ''}`} />
                        <span>{isRefreshingBanners ? 'ताजे होत आहे...' : 'ताजे करा'}</span>
                      </button>
                    )}
                  </div>

                  {latestBanners.length === 0 ? (
                    <div className="text-slate-500 text-xs p-6 bg-slate-50 rounded-xl text-center">
                      सध्या कोणतेही ताज्या घडामोडी बॅनर्स नाहीत. वर दिलेल्या फॉर्ममधून नवीन फोटो व बातमी जोडा.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {latestBanners.map((banner) => (
                        <div key={banner.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3.5 min-w-0">
                            {banner.mediaType === 'video' || banner.videoUrl ? (
                              <div className="w-16 h-12 bg-slate-900 rounded flex flex-col items-center justify-center text-rose-400 shrink-0 border border-slate-700">
                                <Video className="w-5 h-5 text-rose-400" />
                                <span className="text-[9px] font-bold text-white mt-0.5">व्हिडिओ</span>
                              </div>
                            ) : banner.imageUrl ? (
                              <img src={banner.imageUrl} alt="" className="w-16 h-12 object-contain rounded bg-white border border-slate-200 shrink-0" />
                            ) : (
                              <div className="w-16 h-12 bg-slate-200 rounded flex items-center justify-center text-slate-400 shrink-0">
                                <ImageIcon className="w-5 h-5" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                                  दिनांक: {banner.date}
                                </span>
                                {(banner.mediaType === 'video' || banner.videoUrl) && (
                                  <span className="text-[10px] font-bold text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded">
                                    🎥 ३ MB व्हिडिओ
                                  </span>
                                )}
                              </div>
                              <h5 className="font-bold text-slate-900 text-sm truncate mt-0.5">{banner.title}</h5>
                              {banner.summary && <p className="text-xs text-slate-600 truncate mt-0.5">{banner.summary}</p>}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleStartEditBanner(banner)}
                              className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors cursor-pointer"
                              title="बॅनर संपादन करा"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={deletingBannerId === banner.id}
                              onClick={() => handleDeleteBannerWithFeedback(banner.id)}
                              className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                              title="बॅनर डिलीट करा"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sub-tab: Print ID Cards Batch (नवीन आयकार्ड प्रिंट करा - Super Admin Only) */}
            {activeAdminSubTab === 'print_id_cards' && currentUser?.isSuperAdmin && (
              <div className="space-y-6 max-w-3xl mx-auto">
                <div className="bg-white p-6 sm:p-8 rounded-2xl border border-amber-300 shadow-md space-y-5">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                    <div>
                      <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#17366d] flex items-center gap-2">
                        <Award className="w-5 h-5 text-amber-600" />
                        नवीन आयकार्ड प्रिंट करा (District Batch Print — Super Admin)
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        येथून कोणत्याही जिल्ह्याची निवड करून त्या संपूर्ण जिल्ह्यातील सर्व मंजूर सदस्यांचे नवीन आय-कार्ड्स एकाच मेगा PDF मध्ये लँडस्केप (Landscape) मांडणीत फुल साईज व उच्च प्रिंट क्वालिटीमध्ये डाऊनलोड करू शकता.
                      </p>
                    </div>
                  </div>

                  <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                    <div>
                      <label className="font-bold text-slate-700 text-xs block mb-1.5">जिल्हा निवडा (Select District):</label>
                      <select
                        value={batchPrintDistrict}
                        onChange={(e) => setBatchPrintDistrict(e.target.value)}
                        className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm font-bold text-[#0b1e33]"
                      >
                        {MAHARASHTRA_DISTRICTS.map((d) => {
                          const count = applications.filter((m) => m.status === 'approved' && m.district === d).length;
                          return (
                            <option key={d} value={d}>
                              {d} ({count} मंजूर सदस्य)
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div>
                        <strong>निवडलेला जिल्हा:</strong> {batchPrintDistrict} <br />
                        <span className="text-slate-600">
                          मंजूर सदस्य संख्या:{' '}
                          <span className="font-bold text-[#0b1e33]">
                            {applications.filter((m) => m.status === 'approved' && m.district === batchPrintDistrict).length}
                          </span>
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={isGeneratingBatchPrint}
                        onClick={handleGenerateBatchPrintPdf}
                        className="bg-[#df6b16] hover:bg-[#c2590d] disabled:opacity-50 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-md transition-colors flex items-center gap-2 cursor-pointer shrink-0"
                      >
                        <Download className="w-4 h-4" />
                        <span>
                          {isGeneratingBatchPrint ? batchPrintProgressMsg || 'PDF तयार होत आहे...' : `📥 ${batchPrintDistrict} सर्व आय-कार्ड्स डाऊनलोड करा`}
                        </span>
                      </button>
                    </div>

                    {isGeneratingBatchPrint && (
                      <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-900 flex items-center gap-2 animate-pulse">
                        <RefreshCw className="w-4 h-4 animate-spin text-sky-600 shrink-0" />
                        <span>{batchPrintProgressMsg || 'कृपया प्रतीक्षा करा, सर्व सदस्यांचे हाई-डिफ़िंक्शन आय-कार्ड्स एकत्र केले जात आहेत...'}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Sub-tab: ID Card Sample Preview (आय-कार्ड डिझाईन नमुना) */}
            {activeAdminSubTab === 'id_card_preview' && (currentUser?.isSuperAdmin || currentUser?.permissions.viewIdCardPreview) && (
              <div className="space-y-6 max-w-3xl mx-auto">
                <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-md space-y-4">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                    <div>
                      <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#17366d] flex items-center gap-2">
                        <Award className="w-5 h-5 text-[#df6b16]" />
                        नवीन आय-कार्ड डिझाईन नमुना व प्रिंट क्वालिटी तपासणी
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        सदस्य नोंदणी आणि 'अर्जाची स्थिती पहा' मधून सर्व नवीन व मागील सदस्यांसाठी हेच अधिकृत सरळ गोल्डन-निळे, शार्प व प्रिंट-रेडी (1016 DPI Ultra-HD, 2–3 MB) नवीन आय-कार्ड डिझाईन सक्रिय करण्यात आले आहे.
                      </p>
                    </div>
                  </div>

                  {/* Sample ID Card Render — Exact 640x404 CR80 Official Straight Gold-Blue Replica with Sharp Logo */}
                  <div className="flex justify-center py-4">
                    <MembershipIdCardPreview
                      app={{
                        salutation: 'श्री',
                        fullName: 'राजेंद्र शिवाजी खैरनार',
                        professional: 'केंद्रप्रमुख',
                        district: 'नाशिक',
                        taluka: 'मालेगाव',
                        phone: '9860704098',
                        memberNumber: 'MS/2026/NASH/0001',
                        photo: '/president.jpg',
                      }}
                    />
                  </div>

                  {/* Live Print Test Action Bar */}
                  <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-xs text-emerald-950 font-medium">
                      ✓ हे नवीन डिझाईन आता संपूर्ण वेबसाईटवर (नवीन नोंदणी, ई-मेल आणि अर्जाची स्थिती पहा) सक्रिय आहे. कलर प्रिंटची स्पष्टता तपासण्यासाठी खालील बटनावरून नमुना PDF डाऊनलोड करा:
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          generateMembershipIdCardPdf({
                            id: 'sample-preview',
                            applicationNumber: 'APP-2026-0001',
                            salutation: 'श्री',
                            fullName: 'राजेंद्र शिवाजी खैरनार',
                            phone: '9860704098',
                            email: 'president@mahasangh.in',
                            address: 'मालेगाव, नाशिक',
                            district: 'नाशिक',
                            taluka: 'मालेगाव',
                            centerName: 'मालेगाव',
                            familyMembers: '4',
                            hobby: 'वाचन',
                            education: 'M.A., B.Ed.',
                            professionalQualification: 'M.Ed.',
                            professional: 'केंद्रप्रमुख',
                            photo: '/president.jpg',
                            createdAt: new Date().toISOString(),
                            status: 'approved',
                            memberNumber: 'MS/2026/NASH/0001',
                          })
                        }
                        className="bg-[#0b1e33] hover:bg-[#1e3a8a] text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>नमुना प्रिंट-रेडी PDF डाऊनलोड करा</span>
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* Sub-tab 3.5: Gov Orders */}
            {activeAdminSubTab === 'gov_order' && (currentUser?.isSuperAdmin || currentUser?.permissions.manageGovOrders) && (
              <div className="space-y-6">
              <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-xs max-w-3xl">
                <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#17366d] mb-5">
                  शासन निर्णय अपलोड (Upload Gov Order)
                </h3>
                {goCreatedSuccess && (
                  <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 shadow-xs">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span className="font-semibold">शासन निर्णय यशस्वीपणे प्रसिद्ध करण्यात आला आहे!</span>
                  </div>
                )}
                {goError && (
                  <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{goError}</span>
                  </div>
                )}
                <form onSubmit={handleCreateGovOrder} className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">शीर्षक</label>
                    <input type="text" value={goTitle} onChange={e => setGoTitle(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#10b981]" />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">प्रकार</label>
                    <select value={goType} onChange={e => setGoType(e.target.value as any)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#10b981]">
                       <option value="शासन निर्णय">शासन निर्णय</option>
                       <option value="न्यायालयीन आदेश">न्यायालयीन आदेश</option>
                       <option value="परिपत्रक">परिपत्रक</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">प्रसिद्धी दिनांक</label>
                    <input type="date" value={goDate} onChange={e => setGoDate(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#10b981]" />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">फाइल निवडा (Upload File - Image Only)</label>
                    <input type="file" onChange={handleGoFileUpload} className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#10b981]" />
                    {goFileUrl && <div className="text-emerald-700 font-bold mt-2">✓ फाइल सज्ज आहे!</div>}
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Google Drive लिंक (PDF साठी)</label>
                    <input type="url" value={goDriveUrl} onChange={e => setGoDriveUrl(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#10b981]" placeholder="https://drive.google.com/..." />
                  </div>
                  <button type="submit" disabled={isUploadingGoFile} className="bg-[#10b981] text-white font-bold py-2.5 px-6 rounded-lg text-xs disabled:opacity-50">
                    {isUploadingGoFile ? 'अपलोड होत आहे...' : 'प्रसिद्ध करा'}
                  </button>
                </form>
              </div>

              <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-xs">
                <h3 className="font-serifDevanagari text-lg font-bold text-[#17366d] mb-4">
                  शासन निर्णय सूची
                </h3>
                <div className="space-y-3">
                  {govOrders.map(go => (
                      <div key={go.id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                          <div>
                              <div className="font-bold text-[#17366d]">{go.title}</div>
                              <div className="text-xs text-slate-500">{go.type} · {go.date}</div>
                          </div>
                          <button onClick={() => handleDeleteGovOrder(go.id)} className="p-2 text-rose-600 hover:bg-rose-50 rounded">
                              <Trash2 className="w-4 h-4" />
                          </button>
                      </div>
                  ))}
                </div>
              </div>
              </div>
            )}

            {/* Sub-tab: Manage Admins (Role-Based Access Control) */}
            {activeAdminSubTab === 'manage_admins' && (currentUser?.isSuperAdmin || currentUser?.permissions.manageAdmins) && (
              <div className="space-y-6">
                <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-100 gap-2">
                    <div>
                      <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#17366d] flex items-center gap-2">
                        <Shield className="w-5 h-5 text-[#df6b16]" />
                        व्यवस्थापक प्रशासन (Manage Admins & Roles)
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        ॲडमिन पॅनेलमधील सर्व सब-मेनू व सुविधांचे अधिकार आवश्यकतेनुसार वेगवेगळ्या व्यक्तींना द्या किंवा नंतर कमी-जास्त करा.
                      </p>
                    </div>
                  </div>

                  {adminActionMsg && (
                    <div
                      className={`mb-5 p-3 rounded-lg text-xs flex items-center gap-2 ${
                        adminActionMsg.type === 'success'
                          ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                          : 'bg-rose-50 border border-rose-200 text-rose-700'
                      }`}
                    >
                      {adminActionMsg.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <span>{adminActionMsg.text}</span>
                    </div>
                  )}

                  {/* Add Admin Form */}
                  <form onSubmit={handleAddAdminUser} className="space-y-4 max-w-5xl bg-slate-50/70 p-5 rounded-xl border border-slate-200 text-xs">
                    <h4 className="font-bold text-[#09243f] text-sm flex items-center gap-1.5 border-b border-slate-200 pb-2">
                      <UserPlus className="w-4 h-4 text-[#df6b16]" />
                      नवीन व्यवस्थापक जोडा (Add New Sub-Admin)
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          व्यवस्थापक ई-मेल आयडी (User Email ID) <span className="text-rose-600">*</span>
                        </label>
                        <input
                          type="email"
                          required
                          value={newAdminEmail}
                          onChange={(e) => setNewAdminEmail(e.target.value)}
                          placeholder="उदा. admin.nashik@gmail.com"
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          नाव किंवा पद (Name / Designation)
                        </label>
                        <input
                          type="text"
                          value={newAdminName}
                          onChange={(e) => setNewAdminName(e.target.value)}
                          placeholder="उदा. श्री. सुरेश शिंदे (जिल्हाध्यक्ष)"
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>
                    </div>

                    {/* Permissions Checkboxes - All Admin Sub-Menus & Facilities */}
                    <div className="pt-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                        <label className="font-bold text-slate-800 block">
                          या ॲडमिनला द्यावयाचे अधिकार निवडा (सर्व {toEnglishDigits(ADMIN_PERMISSION_OPTIONS.length)} सुविधा): <span className="text-rose-600">*</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setNewAdminPermissions({ ...ALL_ADMIN_PERMISSIONS_TRUE })}
                            className="text-[11px] font-bold text-[#17366d] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded transition-colors"
                          >
                            सर्व निवडा
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewAdminPermissions({ ...ALL_ADMIN_PERMISSIONS_FALSE })}
                            className="text-[11px] font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded transition-colors"
                          >
                            सर्व काढा
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {ADMIN_PERMISSION_OPTIONS.map((opt) => {
                          const isChecked = Boolean(newAdminPermissions[opt.key]);
                          return (
                            <label
                              key={opt.key}
                              className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-2.5 ${
                                isChecked
                                  ? opt.activeCardClass
                                  : 'bg-white border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) =>
                                  setNewAdminPermissions({
                                    ...newAdminPermissions,
                                    [opt.key]: e.target.checked,
                                  })
                                }
                                className={`mt-0.5 w-4 h-4 rounded border-slate-300 ${opt.checkboxClass}`}
                              />
                              <div>
                                <strong className="text-slate-800 block text-xs">
                                  {opt.label}
                                </strong>
                                <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">
                                  {opt.description}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-[#fff9f2] border border-[#f5d5b7] p-3 rounded-lg text-[11px] text-[#703b11] leading-relaxed">
                      💡 <strong>पासवर्ड सुविधा:</strong> नवीन ॲडमिनसाठी आपल्याला पासवर्ड सेट करण्याची आवश्यकता नाही. ते स्वतः पहिल्या लॉगिन वेळी आपला गुप्त पासवर्ड तयार करतील.
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmittingAdmin}
                      className="bg-[#df6b16] hover:bg-[#c85c0e] disabled:opacity-50 text-white font-bold py-2.5 px-6 rounded-lg text-xs shadow-xs transition-colors flex items-center gap-1.5"
                    >
                      <UserPlus className="w-4 h-4" />
                      {isSubmittingAdmin ? 'जोडत आहे...' : 'नवीन व्यवस्थापक जोडा (Add Admin)'}
                    </button>
                  </form>
                </div>

                {/* Sub-Admins List Table */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
                  <h4 className="font-serifDevanagari text-base font-bold text-[#17366d] mb-4 pb-2 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <span>सक्रिय व्यवस्थापक व अधिकार यादी ({toEnglishDigits(adminUsersList.length)})</span>
                    <span className="text-[11px] font-sans font-normal text-slate-500">
                      मुख्य प्रशासक: {DEFAULT_ADMIN_EMAIL} (सर्व अधिकार)
                    </span>
                  </h4>

                  {adminUsersList.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      सध्या कोणताही अतिरिक्त व्यवस्थापक जोडलेला नाही. वर दिलेल्या फॉर्मद्वारे आपण नवीन ॲडमिन जोडू शकता.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                        <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-3 w-12 text-center">अ.क्र.</th>
                            <th className="p-3">व्यवस्थापक ई-मेल व नाव</th>
                            <th className="p-3">दिलेले अधिकार (Permissions)</th>
                            <th className="p-3">स्थिती</th>
                            <th className="p-3 text-center">कृती (अधिकार बदला / हटवा)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {adminUsersList.map((subAdmin, index) => {
                            const isEditing = editingAdminId === subAdmin.id;
                            const activeBadges = ADMIN_PERMISSION_OPTIONS.filter((opt) =>
                              Boolean(subAdmin.permissions?.[opt.key])
                            );
                            return (
                              <React.Fragment key={subAdmin.id}>
                                <tr className={`transition-colors ${isEditing ? 'bg-blue-50/70' : 'hover:bg-slate-50'}`}>
                                  <td className="p-3 text-center font-mono font-bold text-slate-500">
                                    {toEnglishDigits(index + 1)}
                                  </td>
                                  <td className="p-3">
                                    <div className="font-bold text-[#09243f] font-mono">
                                      {subAdmin.email}
                                    </div>
                                    {subAdmin.name && (
                                      <div className="text-slate-500 text-[11px]">
                                        {subAdmin.name}
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-3">
                                    <div className="flex flex-wrap gap-1.5">
                                      {activeBadges.length > 0 ? (
                                        activeBadges.map((opt) => (
                                          <span
                                            key={opt.key}
                                            className={`${opt.badgeClass} px-2 py-0.5 rounded text-[10px] font-bold`}
                                          >
                                            {opt.label}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-slate-400 text-[10px]">कोणतेही अधिकार नाहीत</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-3">
                                    {subAdmin.isFirstLogin || (!subAdmin.hasPassword && !subAdmin.password) ? (
                                      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-bold">
                                        पहिले लॉगिन प्रलंबित
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-bold">
                                        <Check className="w-3 h-3 text-emerald-600" />
                                        पासवर्ड सक्रिय
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 text-center whitespace-nowrap">
                                    {isEditing ? (
                                      <button
                                        type="button"
                                        onClick={() => setEditingAdminId(null)}
                                        className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-2.5 py-1 rounded text-[11px] font-bold inline-flex items-center gap-1 transition-colors"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                        बंद करा
                                      </button>
                                    ) : (
                                      <div className="inline-flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => handleStartEditPermissions(subAdmin)}
                                          className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2.5 py-1 rounded text-[11px] font-bold transition-colors inline-flex items-center gap-1"
                                          title="दिलेले अधिकार कमी-जास्त करा (Edit Permissions)"
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                          <span>अधिकार बदला</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleResetSubAdmin(subAdmin.id, subAdmin.email)}
                                          className="text-amber-600 hover:text-amber-800 hover:bg-amber-50 p-1.5 rounded transition-colors inline-flex items-center"
                                          title="पासवर्ड रिसेट करा (पुन्हा नवीन पासवर्ड सेट करू द्या)"
                                        >
                                          <RotateCcw className="w-4 h-4" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteAdmin(subAdmin.id, subAdmin.email)}
                                          className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 p-1.5 rounded transition-colors inline-flex items-center"
                                          title="व्यवस्थापक अधिकार काढून टाका"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                                {isEditing && (
                                  <tr className="bg-blue-50/50 border-b border-blue-200">
                                    <td colSpan={5} className="p-4">
                                      <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-xs space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                                          <div>
                                            <h5 className="font-bold text-[#17366d] text-xs sm:text-sm">
                                              {subAdmin.email} यांचे अधिकार कमी-जास्त करा (Edit Permissions)
                                            </h5>
                                            <p className="text-[11px] text-slate-500">
                                              खालील यादीतून हवे ते अधिकार निवडा किंवा काढा आणि 'अधिकार सेव्ह करा' वर क्लिक करा.
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => setEditingPermissions({ ...ALL_ADMIN_PERMISSIONS_TRUE })}
                                              className="text-[11px] font-bold text-[#17366d] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded transition-colors"
                                            >
                                              सर्व निवडा
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setEditingPermissions({ ...ALL_ADMIN_PERMISSIONS_FALSE })}
                                              className="text-[11px] font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded transition-colors"
                                            >
                                              सर्व काढा
                                            </button>
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                          {ADMIN_PERMISSION_OPTIONS.map((opt) => {
                                            const isChecked = Boolean(editingPermissions[opt.key]);
                                            return (
                                              <label
                                                key={opt.key}
                                                className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-start gap-2 ${
                                                  isChecked
                                                    ? opt.activeCardClass
                                                    : 'bg-white border-slate-200 hover:bg-slate-50'
                                                }`}
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={isChecked}
                                                  onChange={(e) =>
                                                    setEditingPermissions({
                                                      ...editingPermissions,
                                                      [opt.key]: e.target.checked,
                                                    })
                                                  }
                                                  className={`mt-0.5 w-4 h-4 rounded border-slate-300 ${opt.checkboxClass}`}
                                                />
                                                <div>
                                                  <strong className="text-slate-800 block text-xs">
                                                    {opt.label}
                                                  </strong>
                                                  <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">
                                                    {opt.description}
                                                  </span>
                                                </div>
                                              </label>
                                            );
                                          })}
                                        </div>

                                        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                                          <button
                                            type="button"
                                            onClick={() => setEditingAdminId(null)}
                                            className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
                                          >
                                            रद्द करा
                                          </button>
                                          <button
                                            type="button"
                                            disabled={isUpdatingAdminPerms}
                                            onClick={() => handleSaveAdminPermissions(subAdmin)}
                                            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors"
                                          >
                                            <Check className="w-4 h-4" />
                                            <span>{isUpdatingAdminPerms ? 'सेव्ह होत आहे...' : 'अधिकार सेव्ह करा'}</span>
                                          </button>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sub-tab 4: Change Password Management */}
            {activeAdminSubTab === 'password' && (
              <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-xs max-w-md">
                <h3 className="font-serifDevanagari text-lg font-bold text-[#17366d] mb-2 pb-2 border-b border-slate-100 flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-[#df6b16]" />
                  ॲडमिन पासवर्ड बदला (Change Password)
                </h3>
                <p className="text-xs text-slate-500 mb-5">
                  येथून आपण आपला ॲडमिन पासवर्ड कधीही बदलू शकता.
                </p>

                {changePassStatus && (
                  <div
                    className={`mb-4 p-3 rounded-lg text-xs flex items-center gap-2 ${
                      changePassStatus.type === 'success'
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border border-rose-200 text-rose-700'
                    }`}
                  >
                    {changePassStatus.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span>{changePassStatus.text}</span>
                  </div>
                )}

                <form onSubmit={handleChangePasswordInside} className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      सध्याचा चालू पासवर्ड (Current Password)
                    </label>
                    <input
                      type="password"
                      required
                      value={currentPassInput}
                      onChange={(e) => setCurrentPassInput(e.target.value)}
                      placeholder="सध्याचा पासवर्ड प्रविष्ट करा"
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      नवीन पासवर्ड (New Password)
                    </label>
                    <input
                      type="password"
                      required
                      value={newPassInput}
                      onChange={(e) => setNewPassInput(e.target.value)}
                      placeholder="किमान 4 अक्षरी नवीन पासवर्ड"
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      नवीन पासवर्ड पुन्हा प्रविष्ट करा (Confirm New Password)
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmPassInput}
                      onChange={(e) => setConfirmPassInput(e.target.value)}
                      placeholder="नवीन पासवर्ड पुन्हा टाका"
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold py-2.5 rounded-lg text-sm transition-colors shadow-sm"
                  >
                    नवीन पासवर्ड सुरक्षित सेव्ह करा
                  </button>
                </form>
              </div>
            )}

            {/* Sub-tab 5: Unified Mailbox (contact@mahasangh.in Emails + Website Contact Form Inquiries) */}
            {activeAdminSubTab === 'contact_messages' && (currentUser?.isSuperAdmin || currentUser?.permissions.manageContactMessages) && (
              <div className="space-y-4">
                {/* Header & Actions Bar */}
                <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#17366d] flex items-center gap-2">
                      <Inbox className="w-5 h-5 text-[#df6b16] shrink-0" />
                      <span>एकत्रित प्राप्त संदेश व ईमेल बॉक्स ({mailboxAccount})</span>
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      <strong>{mailboxAccount}</strong> वर येणारे सर्व थेट ईमेल तसेच वेबसाईटवरील संपर्क फॉर्मवरून आलेले संदेश येथे एकत्र दिसतात व येथूनच उत्तर पाठवता येते.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleOpenReplyModal({
                          to: '',
                          recipientName: '',
                          subject: '',
                          contextLabel: 'नवीन ईमेल संदेश',
                        })
                      }
                      className="bg-[#193568] hover:bg-[#11254a] text-white text-xs font-bold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5 text-[#efb24b]" />
                      <span>नवीन ईमेल पाठवा</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowMobileMailGuide((v) => !v)}
                      className={`text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 border transition-colors cursor-pointer ${
                        showMobileMailGuide
                          ? 'bg-amber-50 border-amber-400 text-amber-900'
                          : 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-700'
                      }`}
                    >
                      <Smartphone className="w-3.5 h-3.5 text-[#df6b16]" />
                      <span>मोबाईल सेटअप माहिती</span>
                    </button>

                    <button
                      type="button"
                      onClick={loadContactMessages}
                      disabled={isLoadingContacts}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="ईमेल व संपर्क संदेश रिफ्रेश करा"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingContacts ? 'animate-spin text-[#df6b16]' : ''}`} />
                      <span>रिफ्रेश करा</span>
                    </button>

                    <span className="bg-amber-100 text-[#9a460b] font-bold text-xs px-3 py-1.5 rounded-lg border border-amber-300 font-mono">
                      एकूण: {toEnglishDigits(contactMessages.length + mailboxEmails.length)}
                    </span>
                  </div>
                </div>

                {/* Collapsible Mobile Mail Setup Guide (No credentials exposed) */}
                {showMobileMailGuide && (
                  <div className="bg-[#f8fafc] border border-slate-300 rounded-xl p-4 sm:p-5 text-xs space-y-3">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <h4 className="font-serifDevanagari text-sm sm:text-base font-bold text-[#193568] flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-[#df6b16]" />
                        मोबाईलवर (Gmail / Outlook अ‍ॅप) {mailboxAccount} जोडण्याची माहिती
                      </h4>
                      <button
                        type="button"
                        onClick={() => setShowMobileMailGuide(false)}
                        className="text-slate-500 hover:text-slate-800 p-1 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-700">
                      <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                        <div className="font-bold text-[#193568]">Incoming Server (IMAP)</div>
                        <div>Server / Host: <code className="font-mono font-bold text-slate-900">mail.mahasangh.in</code></div>
                        <div>Port & Security: <code className="font-mono font-bold text-slate-900">993 (SSL/TLS)</code></div>
                        <div>Username: <code className="font-mono font-bold text-slate-900">{mailboxAccount}</code></div>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                        <div className="font-bold text-[#193568]">Outgoing Server (SMTP)</div>
                        <div>Server / Host: <code className="font-mono font-bold text-slate-900">mail.mahasangh.in</code></div>
                        <div>Port & Security: <code className="font-mono font-bold text-slate-900">465 (SSL/TLS)</code></div>
                        <div>Webmail: <code className="font-mono text-slate-800">panel.hostkarle.in/roundcube</code></div>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Gmail अ‍ॅपमध्ये: प्रोफाइल फोटो → Add another account → Other → {mailboxAccount} → Personal (IMAP) निवडून वरील IMAP व SMTP सर्व्हर तपशील आणि आपला मेल पासवर्ड प्रविष्ट करा.
                    </p>
                  </div>
                )}

                {mailboxError && (
                  <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl p-3 text-xs font-medium flex items-center justify-between gap-2">
                    <span>ईमेल सर्व्हर सूचना: {mailboxError} (संपर्क फॉर्मवरील संदेश खाली उपलब्ध आहेत)</span>
                    <button
                      type="button"
                      onClick={loadContactMessages}
                      className="text-xs font-bold underline shrink-0 cursor-pointer"
                    >
                      पुन्हा प्रयत्न करा
                    </button>
                  </div>
                )}

                {/* Source Filter Tabs + Search & District Filter */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
                    <button
                      type="button"
                      onClick={() => setMailboxSourceFilter('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                        mailboxSourceFilter === 'all'
                          ? 'bg-[#193568] text-white border-[#193568]'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      सर्व एकत्र ({toEnglishDigits(contactMessages.length + mailboxEmails.length)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setMailboxSourceFilter('email')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                        mailboxSourceFilter === 'email'
                          ? 'bg-[#df6b16] text-white border-[#df6b16]'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>ईमेल इनबॉक्स ({toEnglishDigits(mailboxEmails.length)})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMailboxSourceFilter('contact_form')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                        mailboxSourceFilter === 'contact_form'
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>वेबसाईट संपर्क फॉर्म ({toEnglishDigits(contactMessages.length)})</span>
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                      <input
                        type="text"
                        value={contactSearchQuery}
                        onChange={(e) => setContactSearchQuery(e.target.value)}
                        placeholder="नाव, ईमेल, मोबाईल, विषय किंवा संदेशात शोधा..."
                        className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                      />
                    </div>

                    <select
                      value={contactDistrictFilter}
                      onChange={(e) => setContactDistrictFilter(e.target.value)}
                      className="p-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16] bg-white min-w-[160px]"
                    >
                      <option value="">सर्व 34 जिल्हे (संपर्क फॉर्म)</option>
                      {MAHARASHTRA_DISTRICTS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Unified Chronological List (Emails + Contact Form Inquiries) */}
                {(() => {
                  type UnifiedInboxEntry =
                    | { kind: 'email'; sortTime: number; emailItem: MailboxEmailItem }
                    | { kind: 'contact_form'; sortTime: number; contactItem: ContactMessage };

                  const q = contactSearchQuery.trim().toLowerCase();

                  const emailEntries: UnifiedInboxEntry[] =
                    mailboxSourceFilter === 'contact_form' || contactDistrictFilter
                      ? []
                      : mailboxEmails
                          .filter((em) => {
                            if (!q) return true;
                            return (
                              (em.fromName || '').toLowerCase().includes(q) ||
                              (em.fromEmail || '').toLowerCase().includes(q) ||
                              (em.subject || '').toLowerCase().includes(q) ||
                              (em.textBody || '').toLowerCase().includes(q)
                            );
                          })
                          .map((em) => ({
                            kind: 'email' as const,
                            sortTime: new Date(em.date || 0).getTime() || 0,
                            emailItem: em,
                          }));

                  const contactEntries: UnifiedInboxEntry[] =
                    mailboxSourceFilter === 'email'
                      ? []
                      : contactMessages
                          .filter((m) => {
                            const matchesSearch =
                              !q ||
                              (m.name || '').toLowerCase().includes(q) ||
                              (m.email || '').toLowerCase().includes(q) ||
                              (m.phone || '').includes(contactSearchQuery) ||
                              (m.subject || '').toLowerCase().includes(q) ||
                              (m.message || '').toLowerCase().includes(q);
                            const matchesDist = !contactDistrictFilter || m.district === contactDistrictFilter;
                            return matchesSearch && matchesDist;
                          })
                          .map((m) => ({
                            kind: 'contact_form' as const,
                            sortTime: new Date(m.createdAt || 0).getTime() || 0,
                            contactItem: m,
                          }));

                  const unified = [...emailEntries, ...contactEntries].sort(
                    (a, b) => b.sortTime - a.sortTime
                  );

                  if (isLoadingContacts && unified.length === 0) {
                    return (
                      <div className="bg-white p-10 text-center rounded-xl border border-slate-200 text-slate-500 text-sm flex flex-col items-center gap-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-[#df6b16]" />
                        <span>ईमेल व संपर्क संदेश लोड होत आहेत...</span>
                      </div>
                    );
                  }

                  if (unified.length === 0) {
                    return (
                      <div className="bg-white p-12 text-center rounded-xl border border-dashed border-slate-300 text-slate-400 space-y-2">
                        <Inbox className="w-12 h-12 mx-auto text-slate-300" />
                        <p className="text-sm font-semibold text-slate-600">कोणतेही संदेश किंवा ईमेल आढळले नाहीत.</p>
                        <p className="text-xs text-slate-400">
                          {mailboxAccount} वर आलेले ईमेल व वेबसाईट संपर्क फॉर्मवरील संदेश येथे एकत्र दिसतील.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 gap-4">
                      {unified.map((entry) => {
                        if (entry.kind === 'email') {
                          const em = entry.emailItem;
                          return (
                            <div
                              key={`email-${em.folder}-${em.uid}`}
                              className={`bg-white rounded-xl border p-5 shadow-xs transition-all space-y-3 ${
                                em.isRead ? 'border-slate-200 hover:border-slate-300' : 'border-amber-300 bg-amber-50/15 hover:border-amber-400'
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                                <div className="flex items-start gap-2.5 min-w-0">
                                  <div className="w-9 h-9 rounded-full bg-[#193568] text-[#efb24b] font-bold flex items-center justify-center shrink-0">
                                    <Mail className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h4 className="font-bold text-sm text-[#09243f] leading-snug">
                                        {em.fromName}
                                      </h4>
                                      <span className="bg-blue-50 text-[#193568] font-bold px-2 py-0.5 rounded text-[10px] border border-blue-200">
                                        ईमेल ({mailboxAccount})
                                      </span>
                                      {em.isRead ? (
                                        <span className="bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px] border border-emerald-200">
                                          वाचलेला
                                        </span>
                                      ) : (
                                        <span className="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded text-[10px] border border-amber-300">
                                          नवीन ईमेल
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                      {em.fromEmail && <span className="font-mono text-slate-700">{em.fromEmail}</span>}
                                      <span>· दिनांक: {formatDateWithEnglishDigits(em.date)}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleMailboxEmailRead(em)}
                                    className={`text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors border cursor-pointer ${
                                      em.isRead
                                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                                        : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                                    }`}
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>{em.isRead ? 'अनरीड करा' : 'वाचले करा'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMailboxEmail(em)}
                                    className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors border border-rose-200 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>हटवा</span>
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-1.5 text-xs">
                                <p className="font-bold text-[#17366d]">
                                  विषय: <span className="font-semibold text-slate-800">{em.subject}</span>
                                </p>
                                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-slate-800 leading-relaxed whitespace-pre-wrap font-normal max-h-60 overflow-y-auto">
                                  {em.textBody || em.snippet || '(मजकूर उपलब्ध नाही)'}
                                </div>
                                {em.hasAttachments && em.attachmentNames.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 pt-1">
                                    <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                                    <span>सोबत फायली: {em.attachmentNames.join(', ')}</span>
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                                {em.fromEmail && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenReplyModal({
                                        to: em.fromEmail,
                                        recipientName: em.fromName,
                                        subject: em.subject,
                                        replyToMessageId: em.messageId,
                                        contextLabel: `ईमेलला उत्तर (${em.fromEmail})`,
                                      })
                                    }
                                    className="inline-flex items-center gap-1.5 bg-[#193568] hover:bg-[#11254a] text-white font-bold px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <Reply className="w-3.5 h-3.5 text-[#efb24b]" />
                                    <span>उत्तर पाठवा ({mailboxAccount} वरून)</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        }

                        const msg = entry.contactItem;
                        const cleanPhone = (msg.phone || '').replace(/\D/g, '');
                        return (
                          <div
                            key={`contact-${msg.id}`}
                            className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-amber-400 transition-all space-y-3"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                              <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-full bg-amber-500/10 text-amber-800 font-bold flex items-center justify-center shrink-0 border border-amber-300">
                                  {msg.name?.charAt(0) || '👤'}
                                </div>
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h4 className="font-bold text-sm text-[#09243f] leading-snug">
                                      {msg.name}
                                    </h4>
                                    <span className="bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px] border border-emerald-200">
                                      वेबसाईट संपर्क फॉर्म
                                    </span>
                                    {msg.isRead ? (
                                      <span className="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded text-[10px] border border-slate-200">
                                        वाचलेला
                                      </span>
                                    ) : (
                                      <span className="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded text-[10px] border border-amber-300">
                                        नवीन संदेश
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                    {msg.district && (
                                      <span className="bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded text-[10px] border border-slate-200">
                                        {msg.district}
                                      </span>
                                    )}
                                    <span>
                                      दिनांक: {formatDateWithEnglishDigits(msg.createdAt)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-auto">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextRead = !msg.isRead;
                                    setContactMessages((prev) =>
                                      prev.map((m) => (m.id === msg.id ? { ...m, isRead: nextRead } : m))
                                    );
                                    showAdminFeedback(nextRead ? 'संदेश वाचलेला म्हणून चिन्हांकित केला.' : 'संदेश अनरीड केला.', 'success');
                                  }}
                                  className={`text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors border cursor-pointer ${
                                    msg.isRead
                                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                                      : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                                  }`}
                                  title="वाचले / न वाचले म्हणून चिन्हांकित करा"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>{msg.isRead ? 'अनरीड करा' : 'वाचले करा'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteContactMessage(msg.id)}
                                  className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors border border-rose-200 cursor-pointer"
                                  title="हा संदेश काढून टाका"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>हटवा</span>
                                </button>
                              </div>
                            </div>

                            {/* Subject & Message Content */}
                            <div className="space-y-1.5 text-xs">
                              {msg.subject && (
                                <p className="font-bold text-[#17366d]">
                                  विषय: <span className="font-semibold text-slate-800">{msg.subject}</span>
                                </p>
                              )}
                              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-slate-800 leading-relaxed whitespace-pre-wrap font-normal">
                                {msg.message}
                              </div>

                              {msg.photo && (
                                <div className="mt-2 p-2.5 bg-amber-50/60 border border-amber-200 rounded-lg flex flex-wrap items-center gap-3">
                                  <img
                                    src={msg.photo}
                                    alt={`${msg.name} संलग्न फोटो`}
                                    onClick={() =>
                                      setContactPhotoModal({
                                        src: msg.photo || '',
                                        title: `${msg.name} — संलग्न फोटो`,
                                      })
                                    }
                                    className="w-16 h-16 rounded-lg object-cover border border-amber-300 bg-white cursor-pointer hover:opacity-90 transition-opacity shrink-0"
                                  />
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#17366d]">
                                      <Paperclip className="w-3.5 h-3.5 text-[#df6b16]" />
                                      <span>संलग्न फोटो (Attachment)</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setContactPhotoModal({
                                            src: msg.photo || '',
                                            title: `${msg.name} — संलग्न फोटो`,
                                          })
                                        }
                                        className="inline-flex items-center gap-1 bg-white hover:bg-slate-100 text-[#17366d] border border-slate-300 px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer"
                                      >
                                        <Eye className="w-3 h-3" />
                                        <span>पूर्ण फोटो पहा</span>
                                      </button>
                                      <a
                                        href={msg.photo}
                                        download={`contact-photo-${msg.id}.jpg`}
                                        className="inline-flex items-center gap-1 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 px-2.5 py-1 rounded text-[11px] font-bold"
                                      >
                                        <Download className="w-3 h-3" />
                                        <span>डाऊनलोड करा</span>
                                      </a>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Action Links: Reply via contact@mahasangh.in, Phone Call & WhatsApp */}
                            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                              {msg.email && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleOpenReplyModal({
                                      to: msg.email || '',
                                      recipientName: msg.name,
                                      subject: msg.subject || 'आपल्या संपर्क संदेशाचे उत्तर',
                                      contextLabel: `संपर्क फॉर्म संदेशास उत्तर (${msg.email})`,
                                    })
                                  }
                                  className="inline-flex items-center gap-1.5 bg-[#193568] hover:bg-[#11254a] text-white font-bold px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Reply className="w-3.5 h-3.5 text-[#efb24b]" />
                                  <span>ईमेलने उत्तर पाठवा ({msg.email})</span>
                                </button>
                              )}

                              <a
                                href={`tel:${cleanPhone}`}
                                className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold px-3 py-1.5 rounded-lg border border-blue-200 transition-colors"
                              >
                                <PhoneCall className="w-3.5 h-3.5" />
                                <span>कॉल करा ({msg.phone})</span>
                              </a>

                              {cleanPhone && (
                                <a
                                  href={`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(`नमस्कार ${msg.name} जी, महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ कार्यालयाकडून आपल्या संदेशाबाबत संपर्क करत आहोत.`)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold px-3 py-1.5 rounded-lg border border-emerald-200 transition-colors"
                                >
                                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>WhatsApp संदेश पाठवा</span>
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Direct Reply / Compose Email Modal (Sends directly via contact@mahasangh.in) */}
                {replyModal?.open && (
                  <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl border border-slate-300 shadow-2xl max-w-lg w-full overflow-hidden text-xs">
                      <div className="bg-[#193568] text-white px-5 py-3.5 flex items-center justify-between border-b-2 border-[#efb24b]">
                        <div className="flex items-center gap-2 min-w-0">
                          <Send className="w-4 h-4 text-[#efb24b] shrink-0" />
                          <h4 className="font-serifDevanagari text-base font-bold truncate">
                            {replyModal.contextLabel || 'ईमेल उत्तर पाठवा'}
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReplyModal(null)}
                          className="text-slate-300 hover:text-white p-1 cursor-pointer"
                          aria-label="बंद करा"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <form onSubmit={handleSendMailboxReply} className="p-5 space-y-3.5">
                        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 flex items-center justify-between">
                          <span>प्रेषक (From):</span>
                          <strong className="font-mono text-[#193568]">{mailboxAccount}</strong>
                        </div>

                        {replyModal.error && (
                          <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg font-semibold">
                            {replyModal.error}
                          </div>
                        )}

                        <div>
                          <label className="font-bold text-slate-700 block mb-1">
                            प्राप्तकर्ता ईमेल (To) *
                          </label>
                          <input
                            type="email"
                            required
                            value={replyModal.to}
                            onChange={(e) =>
                              setReplyModal((prev) => prev ? { ...prev, to: e.target.value } : prev)
                            }
                            placeholder="recipient@example.com"
                            className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-[#193568]"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-slate-700 block mb-1">
                            विषय (Subject) *
                          </label>
                          <input
                            type="text"
                            required
                            value={replyModal.subject}
                            onChange={(e) =>
                              setReplyModal((prev) => prev ? { ...prev, subject: e.target.value } : prev)
                            }
                            placeholder="ईमेलचा विषय"
                            className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#193568]"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-slate-700 block mb-1">
                            उत्तर / संदेश (Message) *
                          </label>
                          <textarea
                            required
                            rows={6}
                            value={replyModal.body}
                            onChange={(e) =>
                              setReplyModal((prev) => prev ? { ...prev, body: e.target.value } : prev)
                            }
                            placeholder="येथे आपले सविस्तर उत्तर टाईप करा..."
                            className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#193568] leading-relaxed"
                          />
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                          <button
                            type="button"
                            onClick={() => setReplyModal(null)}
                            className="px-4 py-2 border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            रद्द करा
                          </button>
                          <button
                            type="submit"
                            disabled={replyModal.isSending}
                            className="px-5 py-2 bg-[#193568] hover:bg-[#11254a] text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                          >
                            {replyModal.isSending ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#efb24b]" />
                                <span>पाठवत आहे...</span>
                              </>
                            ) : (
                              <>
                                <Send className="w-3.5 h-3.5 text-[#efb24b]" />
                                <span>{mailboxAccount} वरून पाठवा</span>
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {/* Contact Photo Lightbox Modal */}
                {contactPhotoModal && (
                  <div
                    className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setContactPhotoModal(null)}
                  >
                    <div
                      className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="bg-[#193568] text-white px-5 py-3 flex items-center justify-between gap-2 border-b-2 border-[#efb24b]">
                        <div className="flex items-center gap-2 min-w-0">
                          <ImageIcon className="w-4 h-4 text-[#efb24b] shrink-0" />
                          <h4 className="font-serifDevanagari text-sm sm:text-base font-bold truncate">
                            {contactPhotoModal.title}
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => setContactPhotoModal(null)}
                          className="p-1 rounded-full hover:bg-white/15 text-slate-200 hover:text-white cursor-pointer"
                          aria-label="बंद करा"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="p-4 bg-slate-50 flex items-center justify-center">
                        <img
                          src={contactPhotoModal.src}
                          alt={contactPhotoModal.title}
                          className="max-h-[70vh] w-auto rounded-lg border border-slate-200 object-contain bg-white shadow-sm"
                        />
                      </div>
                      <div className="px-5 py-3 bg-white border-t border-slate-200 flex items-center justify-end gap-2">
                        <a
                          href={contactPhotoModal.src}
                          download="contact-attachment.jpg"
                          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>डाऊनलोड करा</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => setContactPhotoModal(null)}
                          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold cursor-pointer"
                        >
                          बंद करा
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Cloud Storage Config */}
            {activeAdminSubTab === 'cloudinary' && (currentUser?.isSuperAdmin || currentUser?.permissions.manageCloudinary) && (
              <div className="bg-white p-6 rounded-xl border border-slate-300 shadow-md space-y-4 max-w-lg mx-auto">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <h3 className="font-serifDevanagari text-base font-bold text-[#17366d]">
                      क्लाउड स्टोरेज व्यवस्थापन
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveAdminSubTab(currentUser?.isSuperAdmin ? 'applications' : getFirstAllowedAdminTab(currentUser?.permissions || ALL_ADMIN_PERMISSIONS_FALSE))}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    title="बंद करा"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Status Message */}
                {cloudinaryStatusMsg && (
                  <div
                    className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 ${
                      cloudinaryStatusMsg.type === 'success'
                        ? 'bg-emerald-50 border border-emerald-300 text-emerald-900'
                        : 'bg-rose-50 border border-rose-300 text-rose-900'
                    }`}
                  >
                    <span className="truncate">{cloudinaryStatusMsg.text}</span>
                    <button
                      type="button"
                      onClick={() => setCloudinaryStatusMsg(null)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <form onSubmit={handleSaveCloudinarySettings} className="space-y-3.5 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Cloud Name
                    </label>
                    <input
                      type="text"
                      required
                      value={cloudinaryCloudName}
                      onChange={(e) => setCloudinaryCloudName(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono focus:bg-white focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Unsigned Upload Preset
                    </label>
                    <input
                      type="text"
                      required
                      value={cloudinaryPreset}
                      onChange={(e) => setCloudinaryPreset(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono focus:bg-white focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="cldEnabled"
                      checked={cloudinaryEnabled}
                      onChange={(e) => setCloudinaryEnabled(e.target.checked)}
                      className="w-4 h-4 text-[#df6b16] rounded border-slate-300"
                    />
                    <label htmlFor="cldEnabled" className="font-medium text-slate-700 cursor-pointer">
                      क्लाउड अपलोड सक्रिय ठेवा
                    </label>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="submit"
                      className="flex-1 bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold py-2 rounded-lg transition-colors shadow-2xs"
                    >
                      जतन करा
                    </button>
                    <button
                      type="button"
                      onClick={handleTestCloudinaryUpload}
                      disabled={isTestingCloudinary}
                      className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isTestingCloudinary ? 'animate-spin' : ''}`} />
                      <span>{isTestingCloudinary ? 'चाचणी...' : 'चाचणी'}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Super Admin Only: WhatsApp API Setup & Broadcast Studio */}
            {activeAdminSubTab === 'whatsapp_broadcast' && currentUser?.isSuperAdmin && (
              <AdminWhatsappBroadcastPanel
                applications={applications}
                dynamicLeaders={dynamicLeaders}
                cloudinaryConfig={cloudinaryConfig}
              />
            )}

            {/* Super Admin Only: 1-Click Full Website & Database Backup / Restore */}
            {activeAdminSubTab === 'backup_restore' && currentUser?.isSuperAdmin && (
              <AdminBackupRestorePanel
                onRestoreCompleted={async () => {
                  try {
                    if (onFetchApplications) await onFetchApplications(true);
                    const freshLeaders = await fetchDynamicLeaders(true);
                    if (freshLeaders && freshLeaders.length > 0) {
                      const normalized = normalizeDynamicLeadersList(freshLeaders);
                      setDynamicLeaders(normalized);
                      localStorage.setItem(DYNAMIC_LEADERSHIP_STORAGE_KEY, JSON.stringify(normalized));
                    }
                  } catch (e) {
                    console.warn('Post-restore refresh warning:', e);
                  }
                }}
              />
            )}

            </main>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* Mobile App Fixed Bottom Navigation Bar (< 1024px)              */}
      {/* ============================================================== */}
      {isLoggedIn && (
        <nav
          aria-label="मोबाईल प्रशासन नेव्हिगेशन"
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 h-[58px] bg-[#0b1e36]/95 backdrop-blur-md border-t border-[#efb24b]/70 text-white shadow-[0_-4px_20px_rgba(11,30,54,0.28)]"
        >
          <div className="h-full max-w-lg mx-auto grid grid-flow-col auto-cols-fr items-stretch">
            {mobileQuickNavItems.map((item) => {
              const isActive = activeAdminSubTab === item.key && !isMobileMenuOpen;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleSelectAdminTab(item.key)}
                  className={`relative flex flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-bold transition-colors cursor-pointer ${
                    isActive
                      ? 'text-[#efb24b] bg-white/10'
                      : 'text-slate-200 hover:text-white'
                  }`}
                >
                  {isActive && (
                    <span className="absolute top-0 inset-x-3 h-0.5 bg-[#efb24b] rounded-b-full" />
                  )}
                  <span className="relative">
                    {item.icon}
                    {item.badge !== undefined && (
                      <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[#df6b16] text-white text-[9px] font-mono tabular-nums flex items-center justify-center">
                        {item.badge > 99 ? '99+' : toEnglishDigits(item.badge)}
                      </span>
                    )}
                  </span>
                  <span className="truncate max-w-full">{item.shortLabel}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className={`relative flex flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-bold transition-colors cursor-pointer ${
                isMobileMenuOpen || !mobileQuickNavItems.some((m) => m.key === activeAdminSubTab)
                  ? 'text-[#efb24b] bg-white/10'
                  : 'text-slate-200 hover:text-white'
              }`}
            >
              <Menu className="w-4 h-4" />
              <span>सर्व मेनू</span>
            </button>
          </div>
        </nav>
      )}

      {/* ============================================================== */}
      {/* Mobile Slide-Up Bottom Sheet Menu Drawer                       */}
      {/* ============================================================== */}
      {isLoggedIn && isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div
            className="w-full bg-[#fbf8f2] rounded-t-3xl border-t-2 border-[#efb24b] shadow-2xl max-h-[84vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Bottom Sheet Header */}
            <div className="bg-[#0b1e36] text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src="/logo.png"
                  alt="महासंघ मानचिन्ह"
                  className="w-10 h-10 rounded-full ring-2 ring-[#efb24b] bg-white object-contain shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#efb24b] truncate">
                    {currentUser?.isSuperAdmin ? 'मुख्य प्रशासक (Super Admin)' : currentUser?.name || 'सह-व्यवस्थापक'}
                  </p>
                  <p className="text-[11px] text-slate-300 font-mono truncate">
                    {currentUser?.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white shrink-0 cursor-pointer"
                aria-label="मेनू बंद करा"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Menu Grid */}
            <div className="p-4 overflow-y-auto space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#607184] px-1">
                प्रशासन विभाग निवडा
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {permittedNavItems.map((item) => {
                  const isActive = activeAdminSubTab === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handleSelectAdminTab(item.key)}
                      className={`min-h-[52px] px-4 py-3 rounded-2xl border text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-[#0b1e36] border-[#efb24b] text-white shadow-sm'
                          : 'bg-white border-[#e7ded1] text-[#0b1e36] hover:border-[#df6b16]'
                      }`}
                    >
                      <span className="flex items-center gap-3 min-w-0 font-bold text-sm">
                        <span className={isActive ? 'text-[#efb24b]' : 'text-[#df6b16]'}>
                          {item.icon}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.badge !== undefined && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-mono tabular-nums font-bold shrink-0 ${
                            isActive
                              ? 'bg-[#efb24b] text-[#0b1e36]'
                              : 'bg-[#df6b16] text-white'
                          }`}
                        >
                          {toEnglishDigits(item.badge)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="pt-3 mt-2 border-t border-[#e7ded1] grid grid-cols-2 gap-2.5">
                {onExitAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onExitAdmin();
                    }}
                    className="min-h-[48px] bg-white border border-[#e7ded1] text-[#0b1e36] font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4 text-[#df6b16]" />
                    <span>मुख्य वेबसाईट</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    clearAuthSessionToken();
                    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
                    setIsMobileMenuOpen(false);
                    setIsLoggedIn(false);
                    setCurrentUser(null);
                  }}
                  className="min-h-[48px] bg-rose-600 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>बाहेर पडा (Logout)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Reusable Confirmation Modal (Replaces window.confirm)          */}
      {/* ============================================================== */}
      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => !isConfirmExecuting && setConfirmDialog(null)}
        >
          <div
            className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-[#e7ded1] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#0b1e36] text-white px-5 py-4 flex items-center justify-between gap-2">
              <h3 className="font-serifDevanagari text-base font-bold text-white">
                {confirmDialog.title}
              </h3>
              <button
                type="button"
                disabled={isConfirmExecuting}
                onClick={() => setConfirmDialog(null)}
                className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-white cursor-pointer"
                aria-label="बंद करा"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <p className="text-sm text-[#102a43] leading-relaxed">
                {confirmDialog.message}
              </p>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isConfirmExecuting}
                  onClick={() => setConfirmDialog(null)}
                  className="flex-1 min-h-[46px] bg-slate-100 hover:bg-slate-200 text-[#102a43] font-bold rounded-xl text-sm cursor-pointer"
                >
                  रद्द करा
                </button>
                <button
                  type="button"
                  disabled={isConfirmExecuting}
                  onClick={async () => {
                    try {
                      setIsConfirmExecuting(true);
                      await confirmDialog.onConfirm();
                      setConfirmDialog(null);
                    } finally {
                      setIsConfirmExecuting(false);
                    }
                  }}
                  className={`flex-1 min-h-[46px] text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 ${
                    confirmDialog.isDanger
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-[#0b1e36] hover:bg-[#193568]'
                  }`}
                >
                  {isConfirmExecuting ? 'प्रक्रिया सुरू...' : confirmDialog.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Verification Modal with Bottom-Sheet Support on Mobile         */}
      {/* ============================================================== */}
      {selectedAppForVerification && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setSelectedAppForVerification(null)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl max-w-xl w-full shadow-2xl relative border border-[#e7ded1] max-h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky Modal Header */}
            <div className="bg-[#0b1e36] text-white px-5 py-4 flex items-center justify-between gap-2 shrink-0">
              <div>
                <span className="text-[11px] font-bold uppercase text-[#efb24b] block">
                  अर्ज पडताळणी कक्ष
                </span>
                <h3 className="font-serifDevanagari text-base sm:text-lg font-bold text-white">
                  सदस्यत्व अर्जदार सविस्तर माहिती
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAppForVerification(null)}
                className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer shrink-0"
                aria-label="बंद करा"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
              {/* Photo & Core Name Row */}
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 bg-[#fbf8f2] p-4 rounded-2xl border border-[#e7ded1]">
                <div className="flex flex-col items-center gap-2">
                  <div className="shrink-0 w-24 h-32 bg-white border-2 border-[#efb24b] rounded-xl overflow-hidden flex items-center justify-center shadow-xs">
                    {selectedAppForVerification.photo ? (
                      <img
                        src={selectedAppForVerification.photo}
                        alt={selectedAppForVerification.fullName}
                        className="w-full h-full object-cover pointer-events-auto select-auto"
                        crossOrigin="anonymous"
                        style={{ pointerEvents: 'auto', userSelect: 'auto', WebkitUserSelect: 'auto' }}
                      />
                    ) : (
                      <div className="text-center text-[#607184] p-2">
                        <ImageIcon className="w-8 h-8 mx-auto opacity-50" />
                        <span className="text-[9px]">फोटो नाही</span>
                      </div>
                    )}
                  </div>
                  {selectedAppForVerification.photo && (
                    <a
                      href={selectedAppForVerification.photo}
                      download={`member_photo_${selectedAppForVerification.applicationNumber || 'photo'}.jpg`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-1 bg-[#193568] hover:bg-[#11254a] text-white font-bold text-[10px] px-2 py-1.5 rounded-lg transition-colors shadow-2xs cursor-pointer"
                      title="फोटो राईट क्लिक किंवा डाऊनलोड करा"
                    >
                      <Download className="w-3 h-3" />
                      <span>फोटो डाऊनलोड करा</span>
                    </a>
                  )}
                </div>

                <div className="space-y-1 min-w-0 flex-1">
                  <h4 className="font-serifDevanagari text-base font-bold text-[#0b1e36]">
                    {selectedAppForVerification.salutation} {selectedAppForVerification.fullName}
                  </h4>
                  <p className="text-[#607184]">
                    अर्ज क्र.: <strong className="font-mono text-[#0b1e36]">{selectedAppForVerification.applicationNumber}</strong>
                  </p>
                  <p className="text-[#607184]">
                    दिनांक: {formatDateWithEnglishDigits(selectedAppForVerification.createdAt)}
                  </p>
                  <p className="text-[#607184]">
                    मोबाईल: <strong className="font-mono text-[#df6b16]">{selectedAppForVerification.phone}</strong>
                  </p>
                  <p className="text-[#607184] truncate">
                    ई-मेल: {selectedAppForVerification.email}
                  </p>
                </div>
              </div>

              {/* Geographical & Organizational Details */}
              <div className="grid grid-cols-2 gap-3 bg-white p-3.5 border border-[#e7ded1] rounded-2xl">
                <div>
                  <span className="text-[#607184] block text-[10px]">जिल्हा:</span>
                  <strong className="text-[#0b1e36]">{selectedAppForVerification.district}</strong>
                </div>
                <div>
                  <span className="text-[#607184] block text-[10px]">सध्याचे पद / संवर्ग:</span>
                  <strong className="text-[#0b1e36]">{selectedAppForVerification.professional || 'केंद्रप्रमुख'}</strong>
                </div>
                <div>
                  <span className="text-[#607184] block text-[10px]">शैक्षणिक पात्रता:</span>
                  <span>{selectedAppForVerification.education || '-'}</span>
                </div>
                <div>
                  <span className="text-[#607184] block text-[10px]">व्यावसायिक पात्रता:</span>
                  <span className="font-semibold text-[#102a43]">{selectedAppForVerification.professionalQualification || '-'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-[#607184] block text-[10px]">कुटुंब सदस्य / छंद:</span>
                  <span>{selectedAppForVerification.familyMembers || '-'} / {selectedAppForVerification.hobby || '-'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-[#607184] block text-[10px]">पत्ता / कार्यक्षेत्र:</span>
                  <span>{selectedAppForVerification.address}</span>
                </div>
              </div>

              {/* If Official Member */}
              {selectedAppForVerification.isOfficial && (
                <div className="bg-amber-50/70 border border-amber-300 p-3 rounded-xl text-amber-950">
                  <span className="font-bold block text-xs mb-0.5">संघटनात्मक अधिकृत पदाधिकारी:</span>
                  <p>
                    पद: <strong>{selectedAppForVerification.officialPost}</strong>
                    {selectedAppForVerification.officialDistrict && ` | जिल्हा: ${selectedAppForVerification.officialDistrict}`}
                    {selectedAppForVerification.officialTaluka && ` | तालुका: ${selectedAppForVerification.officialTaluka}`}
                  </p>
                </div>
              )}

              {verificationErrorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-semibold flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{verificationErrorMsg}</span>
                </div>
              )}

              {/* Action Section */}
              {selectedAppForVerification.status === 'pending' ? (
                <div className="space-y-3">
                  <div className="bg-[#fff7f0] border border-[#df6b16] p-3.5 rounded-2xl">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={paymentConfirmedChecked}
                        onChange={(e) => {
                          setPaymentConfirmedChecked(e.target.checked);
                          setVerificationErrorMsg('');
                        }}
                        className="mt-0.5 w-5 h-5 text-[#df6b16] rounded border-[#e7ded1] focus:ring-[#df6b16] shrink-0"
                      />
                      <div>
                        <strong className="text-xs text-[#0b1e36] block">
                          सदस्यत्व फी बँक खात्यावर जमा झाल्याची खात्री केली आहे <span className="text-rose-600">*</span>
                        </strong>
                        <span className="text-[11px] text-[#607184]">
                          आजीवन सदस्यत्व (₹100) किंवा वार्षिक वर्गणी (₹120) महासंघाच्या खात्यावर जमा झाल्याची पडताळणी झाली आहे.
                        </span>
                      </div>
                    </label>
                  </div>

                  {showRejectInput && (
                    <div className="bg-rose-50/70 border border-rose-200 p-3.5 rounded-2xl space-y-2">
                      <label className="font-bold text-xs text-rose-900 block">
                        अर्ज नाकारण्याचे कारण प्रविष्ट करा:
                      </label>
                      <textarea
                        rows={2}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="उदा. पेमेंट तपशील अपूर्ण किंवा चुकीचा फोटो..."
                        className="w-full px-3 py-2.5 text-base sm:text-xs bg-white border border-rose-300 rounded-xl focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                    <button
                      type="button"
                      disabled={!paymentConfirmedChecked || isApprovingApp}
                      onClick={handleApproveVerified}
                      className="min-h-[46px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-sm text-xs cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isApprovingApp ? 'मंजूर होत आहे...' : 'मंजूर करा'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isApprovingApp}
                      onClick={handleRejectVerified}
                      className="min-h-[46px] bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                      <span>{showRejectInput ? 'नाकारणे निश्चित करा' : 'नाकारा'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedAppForVerification(null)}
                      className="min-h-[46px] bg-slate-100 hover:bg-slate-200 text-[#0b1e36] font-bold px-4 py-2.5 rounded-xl text-xs cursor-pointer"
                    >
                      बंद करा
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 pt-1">
                  {selectedAppForVerification.status === 'approved' ? (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-2xl text-xs space-y-1">
                      <div className="font-bold flex items-center gap-2 text-sm text-emerald-800">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <span>निर्णय अंतिम: हा अर्ज मंजूर झाला आहे!</span>
                      </div>
                      <p className="text-[#102a43]">
                        सदस्य क्रमांक:{' '}
                        <strong className="font-mono text-emerald-900 bg-white px-2 py-0.5 rounded border border-emerald-200">
                          {selectedAppForVerification.memberNumber || 'MS-2026-MEMBER'}
                        </strong>
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-rose-50 border border-rose-200 text-rose-950 rounded-2xl text-xs space-y-1">
                      <div className="font-bold flex items-center gap-2 text-sm text-rose-800">
                        <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
                        <span>निर्णय अंतिम: हा अर्ज नाकारण्यात आला आहे.</span>
                      </div>
                      <p className="text-[#607184]">या अर्जावर प्रशासनाकडून अंतिम निर्णय झालेला आहे.</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleDeleteWithFeedback(selectedAppForVerification)}
                      className="min-h-[46px] bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>अर्ज कायमचा डिलीट करा</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedAppForVerification(null)}
                      className="min-h-[46px] bg-[#0b1e36] hover:bg-[#193568] text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-xs cursor-pointer"
                    >
                      बंद करा
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Official Lifetime Membership ID Card Modal Preview             */}
      {/* ============================================================== */}
      {certModalApp && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setCertModalApp(null)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl max-w-xl w-full shadow-2xl relative border border-[#e7ded1] max-h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#0b1e36] text-white px-5 py-3.5 flex items-center justify-between gap-2 shrink-0">
              <h3 className="font-serifDevanagari text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-[#efb24b]" />
                <span>अधिकृत आजीवन सदस्य आय-कार्ड</span>
              </h3>
              <button
                type="button"
                onClick={() => setCertModalApp(null)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer shrink-0"
                aria-label="बंद करा"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
              <div className="flex justify-center">
                <MembershipIdCardPreview app={certModalApp} photoFallbackUrl="" />
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => generateMembershipIdCardPdf(certModalApp)}
                  className="min-h-[46px] bg-[#0b1e36] hover:bg-[#193568] text-white text-xs sm:text-sm font-bold px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  <Download className="w-4 h-4 text-[#efb24b]" />
                  <span>आय-कार्ड PDF डाऊनलोड करा</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCertModalApp(null)}
                  className="min-h-[46px] bg-slate-200 hover:bg-slate-300 text-[#0b1e36] text-xs sm:text-sm font-bold px-5 py-2.5 rounded-xl cursor-pointer"
                >
                  बंद करा
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Razorpay Excel Auto-Approve Match Modal                          */}
      {/* ============================================================== */}
      {showRazorpayMatchModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          onClick={() => setShowRazorpayMatchModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl relative border border-[#e7ded1] max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#0b1e36] text-white px-5 py-3.5 flex items-center justify-between gap-2 shrink-0">
              <h3 className="font-serifDevanagari text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>Razorpay पेमेंट जुळणी व स्वयंचलित मंजुरी ({razorpayMatchedList.length} अर्ज सापडले)</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowRazorpayMatchModal(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
              <p className="text-xs text-[#607184] leading-relaxed">
                खालील प्रलंबित अर्जांचे मोबाईल नंबर किंवा ई-मेल Razorpay पेमेंट रिपोर्टशी यशस्वीरीत्या जुळले आहेत. आपण एका क्लिकवर हे सर्व अर्ज मंजूर करू शकता:
              </p>

              {razorpayMatchedList.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">
                  कोणतेही जुळणारे प्रलंबित अर्ज नाहीत.
                </div>
              ) : (
                <div className="border border-[#e7ded1] rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#fbf8f2] text-[#0b1e36] font-bold border-b border-[#e7ded1] sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3">अ.क्र.</th>
                        <th className="py-2.5 px-3">नाव</th>
                        <th className="py-2.5 px-3">मोबाईल</th>
                        <th className="py-2.5 px-3">जिल्हा</th>
                        <th className="py-2.5 px-3">Razorpay पेमेंट आयडी</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e7ded1]">
                      {razorpayMatchedList.map((item, idx) => (
                        <tr key={item.app.id} className="hover:bg-amber-50/40">
                          <td className="py-2 px-3 font-mono">{idx + 1}</td>
                          <td className="py-2 px-3 font-bold text-[#0b1e36]">{item.app.fullName}</td>
                          <td className="py-2 px-3 font-mono">{toEnglishDigits(item.app.phone)}</td>
                          <td className="py-2 px-3">{item.app.district}</td>
                          <td className="py-2 px-3 font-mono text-emerald-700 font-semibold">{item.paymentId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-col sm:flex-row justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={razorpayMatchedList.length === 0 || isBulkApprovingRazorpay}
                  onClick={async () => {
                    setIsBulkApprovingRazorpay(true);
                    let successCount = 0;
                    try {
                      for (const item of razorpayMatchedList) {
                        try {
                          const atomicResult = await approveApplicationAtomicInFirestore({
                            appId: item.app.id,
                            district: item.app.district,
                            knownRecords: applications,
                            extraUpdates: {
                              paymentConfirmed: true
                            }
                          });
                          const resolvedNum = atomicResult.memberNumber;
                          onApproveApplication(item.app.id, resolvedNum, { skipFirestore: true });
                          addApprovedMemberToCache({
                            ...item.app,
                            ...atomicResult.application,
                            status: 'approved',
                            memberNumber: resolvedNum,
                            approvedAt: atomicResult.application.approvedAt || new Date().toISOString(),
                            paymentConfirmed: true
                          });
                          successCount++;
                        } catch (e) {
                          console.error('Error auto-approving app:', item.app.id, e);
                        }
                      }
                      showAdminFeedback(`यशस्वी! एकूण ${successCount} प्रलंबित अर्ज स्वयंचलितपणे मंजूर करण्यात आले व सदस्य क्रमांक दिले गेले.`, 'success');
                      setShowRazorpayMatchModal(false);
                      if (onFetchApplications) await onFetchApplications(true);
                    } catch (err: any) {
                      showAdminFeedback('त्रुटी: ' + err.message, 'error');
                    } finally {
                      setIsBulkApprovingRazorpay(false);
                    }
                  }}
                  className="min-h-[46px] bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-6 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className={`w-4 h-4 text-emerald-200 ${isBulkApprovingRazorpay ? 'animate-spin' : ''}`} />
                  <span>{isBulkApprovingRazorpay ? 'मंजूर करत आहे...' : `सर्व (${razorpayMatchedList.length}) अर्ज मंजूर करा`}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowRazorpayMatchModal(false)}
                  className="min-h-[46px] bg-slate-200 hover:bg-slate-300 text-[#0b1e36] font-bold px-5 py-2.5 rounded-xl text-xs cursor-pointer"
                >
                  रद्द करा
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


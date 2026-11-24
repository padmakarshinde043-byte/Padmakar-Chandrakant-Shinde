import React, { useState, useEffect, useRef } from 'react';
import {
  Lock, LogOut, Award, PlusCircle, Search,
  ShieldAlert, KeyRound, CheckCircle2, ArrowLeft, Eye, EyeOff,
  Users, Edit3, Trash2, Check, Upload, Image as ImageIcon, X, FileText, Download, List,
  UserPlus, Shield, MessageSquare, Mail, PhoneCall, RefreshCw,
  Cloud, AlertCircle, RotateCcw, Calendar,
  ArrowUp, ArrowDown, ChevronUp, ChevronDown, Menu, Play, Video,
  Send, Inbox, Reply, Smartphone, Globe, Paperclip, Database, Wrench, Link2, Copy
} from 'lucide-react';
import JSZip from 'jszip';
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
  isMargdarshakLeader,
  normalizeOfficialCadre
} from '../data/mahasanghData';
import {
  filterValidDynamicLeaders,
  findMissingVacantLeaders,
  mergeMissingVacantLeaders,
} from '../data/recoveredVacantLeaders';
import { AppointedPostItem, PostLevelType, DEFAULT_DISTRICT_PASSWORD, getPostLevel, getPostLevelLabel } from '../data/rkMaharashtraData';
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
  purgeDeletedAndGhostApplicationsInFirestore,
  fetchApplicationPhotosBatch,
  fetchSingleApplicationForAdmin,
  fetchApprovedApplicationsWithPhotosByDistricts
} from '../firebase';
import { generateMembershipIdCardPdf, generateDistrictBatchIdCardsPdf } from '../services/rkPdfGenerator';
import { exportUnifiedMembersExcel } from '../utils/excelExporter';
import { compressImageFile } from '../utils/imageCompressor';
import {
  saveDynamicLeadersToFirebase,
  fetchDynamicLeaders,
  updateDistrictPasswordInRtdb,
  fetchDistrictPasswords,
  fetchAppointedPosts,
  saveAppointedPostsToRtdb,
  updatePresidentPasswordInFirebase
} from '../services/rkFirebaseService';
import { safeStorageSetItem } from '../utils/officialsCache';
import {
  CACHE_KEY_POSTS,
  LEGACY_CACHE_KEY_POSTS,
  POSTS_BROADCAST_CHANNEL,
  getPostsFromStorageSync,
} from '../utils/officialsCache';
import {
  getCloudinaryConfig,
  saveCloudinaryConfig,
  uploadToCloudinary,
  uploadBannerPhotoToCloudinary,
  uploadBannerVideoToCloudinary,
  uploadDataUrlToCloudinary,
  uploadNewsPhotoToServerDisk,
  uploadGrFileToServerDisk,
  resolveImageUrlForPdf,
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
  sqlApiRequest,
  setAuthSessionToken,
  clearAuthSessionToken,
  getAuthHeaders,
  getPersistentAdminAuthToken,
  restorePersistentAdminAuthTokenToSession,
} from '../api/sqlBridge';
import type { RazorpayMatchBy } from '../utils/razorpaySyncMatcher';
import {
  isMissingCenterName,
  buildCenterUpdateShareUrl,
  buildCenterUpdateShareMessage,
} from '../utils/centerUpdateHelper';

const PERSISTED_ADMIN_USER_KEY = 'mahasangh_admin_persisted_user_v1';

function readPersistedAdminUser(): AdminUser | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    if (!getPersistentAdminAuthToken()) return null;
    const raw = localStorage.getItem(PERSISTED_ADMIN_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminUser;
    if (!parsed || typeof parsed !== 'object' || !parsed.email || !parsed.permissions) {
      return null;
    }
    return {
      id: String(parsed.id || (parsed.isSuperAdmin ? 'super-admin' : '')),
      email: String(parsed.email),
      name: String(parsed.name || ''),
      isSuperAdmin: Boolean(parsed.isSuperAdmin),
      permissions: parsed.permissions,
      createdAt: String(parsed.createdAt || ''),
    };
  } catch {
    return null;
  }
}

function savePersistedAdminUser(user: AdminUser): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const safeUser: AdminUser = {
      id: String(user.id || (user.isSuperAdmin ? 'super-admin' : '')),
      email: String(user.email || ''),
      name: String(user.name || ''),
      isSuperAdmin: Boolean(user.isSuperAdmin),
      permissions: user.permissions,
      createdAt: String(user.createdAt || ''),
    };
    localStorage.setItem(PERSISTED_ADMIN_USER_KEY, JSON.stringify(safeUser));
  } catch {
    // ignore storage quota errors
  }
}

function clearPersistedAdminUser(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(PERSISTED_ADMIN_USER_KEY);
    }
  } catch {}
}

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
  | 'passport_photo'
  | 'id_card_preview'
  | 'gov_order'
  | 'manage_admins'
  | 'contact_messages'
  | 'maintenance'
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
    label: 'Applications & Approval',
    description: 'Review applications, verify payments, and approve members',
    activeCardClass: 'bg-amber-50/80 border-amber-300 shadow-xs',
    checkboxClass: 'text-[#df6b16] focus:ring-[#df6b16]',
    badgeClass: 'bg-amber-100 text-amber-900',
  },
  {
    key: 'editMembers',
    label: 'Edit Members',
    description: 'Edit approved member details and clean duplicates',
    activeCardClass: 'bg-indigo-50/80 border-indigo-300 shadow-xs',
    checkboxClass: 'text-indigo-600 focus:ring-indigo-500',
    badgeClass: 'bg-indigo-100 text-indigo-900',
  },
  {
    key: 'manageLeadership',
    label: 'Leadership',
    description: 'Manage state, divisional, and district leaders',
    activeCardClass: 'bg-purple-50/80 border-purple-300 shadow-xs',
    checkboxClass: 'text-purple-600 focus:ring-purple-500',
    badgeClass: 'bg-purple-100 text-purple-900',
  },
  {
    key: 'manageNews',
    label: 'News',
    description: 'Publish news, photos, and events on the website',
    activeCardClass: 'bg-blue-50/80 border-blue-300 shadow-xs',
    checkboxClass: 'text-blue-600 focus:ring-blue-500',
    badgeClass: 'bg-blue-100 text-blue-900',
  },
  {
    key: 'manageGovOrders',
    label: 'GR & Orders',
    description: 'Upload GRs, court orders, and circulars',
    activeCardClass: 'bg-teal-50/80 border-teal-300 shadow-xs',
    checkboxClass: 'text-teal-600 focus:ring-teal-500',
    badgeClass: 'bg-teal-100 text-teal-900',
  },
  {
    key: 'manageLatestBanners',
    label: 'Latest Banners',
    description: 'Manage homepage slider photos and short videos',
    activeCardClass: 'bg-emerald-50/80 border-emerald-300 shadow-xs',
    checkboxClass: 'text-emerald-600 focus:ring-emerald-500',
    badgeClass: 'bg-emerald-100 text-emerald-900',
  },
  {
    key: 'viewIdCardPreview',
    label: 'ID Card Design',
    description: 'Preview digital ID card template and sample PDF',
    activeCardClass: 'bg-sky-50/80 border-sky-300 shadow-xs',
    checkboxClass: 'text-sky-600 focus:ring-sky-500',
    badgeClass: 'bg-sky-100 text-sky-900',
  },
  {
    key: 'manageContactMessages',
    label: 'Messages & Mail',
    description: 'Read, reply to, and manage inquiries and mailbox',
    activeCardClass: 'bg-orange-50/80 border-orange-300 shadow-xs',
    checkboxClass: 'text-orange-600 focus:ring-orange-500',
    badgeClass: 'bg-orange-100 text-orange-900',
  },
  {
    key: 'manageAdmins',
    label: 'Sub-Admins',
    description: 'Add sub-admins and manage their permissions',
    activeCardClass: 'bg-rose-50/80 border-rose-300 shadow-xs',
    checkboxClass: 'text-rose-600 focus:ring-rose-500',
    badgeClass: 'bg-rose-100 text-rose-900',
  },
  {
    key: 'manageCloudinary',
    label: 'Cloud Storage',
    description: 'Configure photo and media storage settings',
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
  const initialPersistedAdminRef = useRef<AdminUser | null | undefined>(undefined);
  if (initialPersistedAdminRef.current === undefined) {
    const restored = readPersistedAdminUser();
    if (restored) {
      restorePersistentAdminAuthTokenToSession();
    }
    initialPersistedAdminRef.current = restored;
  }
  const initialPersistedAdmin = initialPersistedAdminRef.current;

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => Boolean(initialPersistedAdmin));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Logged-in admin user information & RBAC permissions
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(() => initialPersistedAdmin);
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
  const [activeAdminSubTab, setActiveAdminSubTab] = useState<AdminSubTabKey>(() => {
    if (!initialPersistedAdmin) return 'applications';
    return initialPersistedAdmin.isSuperAdmin
      ? 'applications'
      : getFirstAllowedAdminTab(initialPersistedAdmin.permissions);
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [appsVisibleCount, setAppsVisibleCount] = useState(50);
  const [copiedCenterUpdateMode, setCopiedCenterUpdateMode] = useState<'url' | 'message' | null>(null);

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
  const [postsList, setPostsList] = useState<AppointedPostItem[]>(() => getPostsFromStorageSync());
  const [isLoadingPosts, setIsLoadingPosts] = useState<boolean>(false);
  const [isSavingPosts, setIsSavingPosts] = useState<boolean>(false);
  const [hasUnsavedPostChanges, setHasUnsavedPostChanges] = useState<boolean>(false);
  const [editingPostIndex, setEditingPostIndex] = useState<number | null>(null);
  const [editingPostName, setEditingPostName] = useState<string>('');
  const [editingPostLevel, setEditingPostLevel] = useState<string>('district');

  const [districtPasswords, setDistrictPasswords] = useState<Record<string, string>>({});
  const [isLoadingDistrictPasswords, setIsLoadingDistrictPasswords] = useState<boolean>(false);
  const [selectedDistrictForReset, setSelectedDistrictForReset] = useState<string>('अहिल्यानगर');
  const [isResettingDistrictPassword, setIsResettingDistrictPassword] = useState<boolean>(false);
  const [isResettingPresidentPassword, setIsResettingPresidentPassword] = useState<boolean>(false);
  const [districtSearchFilter, setDistrictSearchFilter] = useState<string>('');
  const [customResetPassword, setCustomResetPassword] = useState<string>('');

  const loadAllAppointedPosts = async (force = true) => {
    setIsLoadingPosts(true);
    try {
      const data = await fetchAppointedPosts(force);
      if (Array.isArray(data) && data.length > 0) {
        setPostsList(data);
        setHasUnsavedPostChanges(false);
        const json = JSON.stringify(data);
        safeStorageSetItem(typeof localStorage !== 'undefined' ? localStorage : null, LEGACY_CACHE_KEY_POSTS, json);
        safeStorageSetItem(typeof localStorage !== 'undefined' ? localStorage : null, CACHE_KEY_POSTS, json);
      }
    } catch (err) {
      console.warn('Failed to load appointed posts:', err);
    } finally {
      setIsLoadingPosts(false);
    }
  };

  const handleSaveAllPostsChanges = async () => {
    let listToSave = [...postsList];
    if (editingPostIndex !== null && editingPostName.trim()) {
      const lvl = (editingPostLevel || 'district') as PostLevelType;
      listToSave[editingPostIndex] = {
        name: editingPostName.trim(),
        isTaluka: lvl === 'taluka',
        level: lvl,
      };
      setPostsList(listToSave);
      setEditingPostIndex(null);
    }

    if (listToSave.length === 0) {
      showAdminFeedback('Keep at least one post in the list.', 'error');
      return;
    }

    setIsSavingPosts(true);
    try {
      await saveAppointedPostsToRtdb(listToSave);
      setHasUnsavedPostChanges(false);
      showAdminFeedback('Posts saved and updated in the District Portal dropdown.', 'success');
    } catch (err: any) {
      showAdminFeedback(`Failed to save posts: ${err?.message || 'Server error'}`, 'error');
    } finally {
      setIsSavingPosts(false);
    }
  };

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
      loadAllAppointedPosts(true);
    }
  }, [isLoggedIn, currentUser?.isSuperAdmin, activeAdminSubTab]);

  useEffect(() => {
    const handleUpdate = () => {
      if (isLoggedIn && currentUser?.isSuperAdmin) {
        loadAllDistrictPasswords(false);
      }
    };
    const handlePostsSync = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (Array.isArray(customEvent.detail) && customEvent.detail.length > 0) {
        setPostsList(customEvent.detail);
      }
    };
    const handleStoragePostsSync = (e: StorageEvent) => {
      if (e.key === CACHE_KEY_POSTS || e.key === LEGACY_CACHE_KEY_POSTS) {
        setPostsList(getPostsFromStorageSync());
      }
    };
    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel(POSTS_BROADCAST_CHANNEL);
        bc.onmessage = (ev) => {
          if (ev?.data?.type === 'POSTS_UPDATED' && Array.isArray(ev.data.posts) && ev.data.posts.length > 0) {
            setPostsList(ev.data.posts);
          }
        };
      } catch {}
    }
    window.addEventListener('mahasangh_district_passwords_updated', handleUpdate);
    window.addEventListener('mahasangh_posts_updated', handlePostsSync);
    window.addEventListener('storage', handleStoragePostsSync);
    return () => {
      window.removeEventListener('mahasangh_district_passwords_updated', handleUpdate);
      window.removeEventListener('mahasangh_posts_updated', handlePostsSync);
      window.removeEventListener('storage', handleStoragePostsSync);
      if (bc) bc.close();
    };
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
      showAdminFeedback(`Password for '${distName}' reset to '${DEFAULT_DISTRICT_PASSWORD}'.`, 'success');
    } catch (err: any) {
      showAdminFeedback(`Failed to reset password: ${err?.message || ''}`, 'error');
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
    setBatchPrintProgressMsg('Loading district members and photos...');
    try {
      const fullDistrictApps = await fetchApprovedApplicationsWithPhotosByDistricts([batchPrintDistrict]);
      await generateDistrictBatchIdCardsPdf(
        batchPrintDistrict,
        fullDistrictApps,
        (msg) => setBatchPrintProgressMsg(msg)
      );
      showAdminFeedback(`ID Cards PDF downloaded for '${batchPrintDistrict}'.`, 'success');
    } catch (err: any) {
      showAdminFeedback('Failed to generate ID Cards PDF: ' + (err?.message || ''), 'error');
    } finally {
      setIsGeneratingBatchPrint(false);
      setBatchPrintProgressMsg('');
    }
  };

  // Passport photos ZIP download state & handler
  const [passportPhotoDistricts, setPassportPhotoDistricts] = useState<string[]>(MAHARASHTRA_DISTRICTS);
  const [isGeneratingPassportZip, setIsGeneratingPassportZip] = useState(false);
  const [passportZipProgressMsg, setPassportZipProgressMsg] = useState('');

  const handleDownloadPassportPhotosZip = async () => {
    if (passportPhotoDistricts.length === 0) {
      showAdminFeedback('Please select at least one district.', 'error');
      return;
    }

    setIsGeneratingPassportZip(true);
    setPassportZipProgressMsg('Loading photos from selected districts...');

    try {
      const approvedWithPhotos = await fetchApprovedApplicationsWithPhotosByDistricts(passportPhotoDistricts);
      const validPhotosList = approvedWithPhotos.filter(
        (m) => m.status === 'approved' && Boolean(m.photo && m.photo.trim())
      );

      if (validPhotosList.length === 0) {
        showAdminFeedback('No approved members with photos found in the selected districts.', 'error');
        setIsGeneratingPassportZip(false);
        setPassportZipProgressMsg('');
        return;
      }

      setPassportZipProgressMsg('Creating ZIP archive...');
      const zip = new JSZip();
      const folder = zip.folder('mahasangh_passport_photos');
      if (!folder) throw new Error('ZIP folder creation failed');

      let processedCount = 0;

      for (const member of validPhotosList) {
        processedCount++;
        setPassportZipProgressMsg(
          `Processing photo (${toEnglishDigits(String(processedCount))}/${toEnglishDigits(String(validPhotosList.length))}): ${member.fullName}`
        );

        try {
          const rawPhoto = member.photo;
          if (!rawPhoto) continue;

          const safeDataUrl = await resolveImageUrlForPdf(rawPhoto);
          if (!safeDataUrl || !safeDataUrl.startsWith('data:image/')) continue;

          const img = new Image();
          const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
            img.onload = () => resolve(img);
            img.onerror = (err) => reject(err);
            img.src = safeDataUrl;
          });

          const timeoutPromise = new Promise<HTMLImageElement>((_, reject) =>
            setTimeout(() => reject(new Error('Image load timeout')), 8000)
          );

          const loadedImg = await Promise.race([loadPromise, timeoutPromise]).catch(() => null);
          if (!loadedImg || !loadedImg.naturalWidth) continue;

          const canvas = document.createElement('canvas');
          canvas.width = loadedImg.naturalWidth || 400;
          canvas.height = loadedImg.naturalHeight || 500;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(loadedImg, 0, 0);

          const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
          const base64Data = jpegDataUrl.split(',')[1];
          if (!base64Data) continue;

          const safeName = (member.fullName || 'Member').replace(/[^\w\u0900-\u097F]/g, '_');
          const safeDist = (member.district || 'District').replace(/[^\w\u0900-\u097F]/g, '_');
          const safeNum = (member.memberNumber || member.applicationNumber || '000').replace(/[^a-zA-Z0-9_-]/g, '_');
          const fileName = `${safeName}_${safeDist}_${safeNum}.jpg`;

          folder.file(fileName, base64Data, { base64: true });
        } catch (imgErr) {
          console.warn('Could not process member photo for ZIP:', member.fullName, imgErr);
        }
      }

      setPassportZipProgressMsg('Compressing ZIP file...');
      const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
        setPassportZipProgressMsg(`Creating ZIP file: ${toEnglishDigits(Math.round(metadata.percent).toString())}%`);
      });

      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Mahasangh_Passport_Photos_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setPassportZipProgressMsg('ZIP download started.');
      setTimeout(() => setPassportZipProgressMsg(''), 4000);
    } catch (err: any) {
      showAdminFeedback('Failed to create ZIP file: ' + (err?.message || 'Error'), 'error');
    } finally {
      setIsGeneratingPassportZip(false);
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
      showAdminFeedback('Sample appointment letter PDF downloaded.', 'success');
    } catch (err: any) {
      showAdminFeedback('Failed to download PDF: ' + (err?.message || ''), 'error');
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
        'Photo upload failed: ' +
          (err?.message || 'Check your internet connection or storage settings.')
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
      setBannerErrorMsg(`Video exceeds 3 MB limit (${sizeMb} MB). Please choose a smaller video.`);
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
      setBannerSuccessMsg('Short video uploaded successfully.');
    } catch (err: any) {
      setBannerErrorMsg(err?.message || 'Video upload failed.');
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
      setBannerErrorMsg('Media is still uploading. Please wait.');
      return;
    }

    if (!bannerTitle.trim()) {
      setBannerErrorMsg('Please enter a banner title.');
      return;
    }

    if (bannerMediaType === 'video' && !bannerVideoUrl.trim()) {
      setBannerErrorMsg('Please upload a short video (max 3 MB) or enter a video URL.');
      return;
    }

    if (bannerMediaType === 'image' && !bannerImageUrl.trim()) {
      setBannerErrorMsg('Please upload a banner image or enter an image URL.');
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
          ? 'Banner updated on the homepage.'
          : isVideo
          ? 'Short video banner published on the homepage.'
          : 'Banner published on the homepage.'
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
        'Failed to save banner: ' + (err?.message || 'Please try again.')
      );
    } finally {
      setIsSavingBanner(false);
    }
  };

  const handleDeleteBannerWithFeedback = (bannerId: string) => {
    setConfirmDialog({
      title: 'Delete Banner',
      message: 'Permanently delete this homepage banner?',
      confirmLabel: 'Delete',
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
          setBannerSuccessMsg('Banner deleted.');
        } catch (err: any) {
          setBannerErrorMsg('Failed to delete banner: ' + (err?.message || 'Error'));
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
      setBannerErrorMsg('Failed to refresh banners: ' + (err?.message || 'Error'));
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

  // Razorpay Direct Live Sync & Excel Auto-Approve state
  type RazorpayMatchedRow = {
    app: MembershipApplication;
    paymentId: string;
    orderId: string;
    amountRupees?: number;
    paidAtIso?: string;
    method?: string;
    matchBy?: RazorpayMatchBy | 'excel';
    selected?: boolean;
  };
  const [showRazorpayMatchModal, setShowRazorpayMatchModal] = useState<boolean>(false);
  const [razorpayMatchedList, setRazorpayMatchedList] = useState<RazorpayMatchedRow[]>([]);
  const [isBulkApprovingRazorpay, setIsBulkApprovingRazorpay] = useState<boolean>(false);
  const [isSyncingRazorpay, setIsSyncingRazorpay] = useState<boolean>(false);
  const [razorpaySyncDays, setRazorpaySyncDays] = useState<number>(30);
  const [approvingSingleRazorpayId, setApprovingSingleRazorpayId] = useState<string | null>(null);
  const [razorpaySyncMeta, setRazorpaySyncMeta] = useState<{
    source: 'live' | 'excel';
    scannedPaymentsCount?: number;
    capturedPaymentsCount?: number;
    pendingCheckedCount?: number;
    daysBack?: number;
  } | null>(null);

  const handleSyncRazorpayLivePayments = async (daysOverride?: number) => {
    const targetDays = daysOverride ?? razorpaySyncDays;
    setIsSyncingRazorpay(true);
    try {
      const res = await sqlApiRequest<{
        status: string;
        daysBack: number;
        scannedPaymentsCount: number;
        capturedPaymentsCount: number;
        pendingCheckedCount: number;
        matches: Array<{
          app: MembershipApplication;
          paymentId: string;
          orderId: string;
          amountRupees: number;
          paidAtIso: string;
          method: string;
          matchBy: RazorpayMatchBy;
        }>;
      }>('/api/razorpay/sync-pending-payments', {
        method: 'POST',
        body: JSON.stringify({
          daysBack: targetDays,
          applications: applications.map((a) => ({
            id: a.id,
            applicationNumber: a.applicationNumber,
            salutation: a.salutation,
            fullName: a.fullName,
            phone: a.phone,
            email: a.email,
            district: a.district,
            taluka: a.taluka,
            professional: normalizeOfficialCadre(a.professional),
            status: a.status,
            razorpayOrderId: a.razorpayOrderId,
            razorpayPaymentId: a.razorpayPaymentId,
            paymentRef: a.paymentRef,
            createdAt: a.createdAt,
          })),
        }),
      });

      const list: RazorpayMatchedRow[] = (res.matches || []).map((m) => ({
        app: m.app,
        paymentId: m.paymentId,
        orderId: m.orderId,
        amountRupees: m.amountRupees,
        paidAtIso: m.paidAtIso,
        method: m.method,
        matchBy: m.matchBy,
        selected: true,
      }));

      setRazorpaySyncDays(targetDays);
      setRazorpayMatchedList(list);
      setRazorpaySyncMeta({
        source: 'live',
        scannedPaymentsCount: res.scannedPaymentsCount,
        capturedPaymentsCount: res.capturedPaymentsCount,
        pendingCheckedCount: res.pendingCheckedCount,
        daysBack: res.daysBack,
      });
      setShowRazorpayMatchModal(true);

      if (list.length === 0) {
        showAdminFeedback(
          `Checked ${res.capturedPaymentsCount} captured payments from the last ${targetDays} days. No new unmatched pending payments found.`,
          'success'
        );
      }
    } catch (err: any) {
      showAdminFeedback(err?.message || 'Failed to sync payments from Razorpay.', 'error');
    } finally {
      setIsSyncingRazorpay(false);
    }
  };

  const approveSingleRazorpayMatchedItem = async (item: RazorpayMatchedRow) => {
    const cleanPayId = item.paymentId && item.paymentId !== '-' ? item.paymentId : '';
    const cleanOrderId = item.orderId && item.orderId !== '-' ? item.orderId : '';
    const atomicResult = await approveApplicationAtomicInFirestore({
      appId: item.app.id,
      district: item.app.district,
      paymentId: cleanPayId || undefined,
      orderId: cleanOrderId || undefined,
      approvedBy: currentUser?.email || 'Admin',
      source: 'razorpay_direct_sync',
      extraUpdates: {
        paymentConfirmed: true,
        ...(cleanPayId ? { paymentRef: cleanPayId, razorpayPaymentId: cleanPayId } : {}),
        ...(cleanOrderId ? { razorpayOrderId: cleanOrderId } : {}),
      },
    });
    const resolvedNum = atomicResult.memberNumber;
    onApproveApplication(item.app.id, resolvedNum, { skipFirestore: true });
    addApprovedMemberToCache({
      ...item.app,
      ...atomicResult.application,
      status: 'approved',
      memberNumber: resolvedNum,
      approvedAt: atomicResult.application.approvedAt || new Date().toISOString(),
      paymentConfirmed: true,
      ...(cleanPayId ? { paymentRef: cleanPayId, razorpayPaymentId: cleanPayId } : {}),
      ...(cleanOrderId ? { razorpayOrderId: cleanOrderId } : {}),
    });
    return resolvedNum;
  };

  // Resequencing & ghost cleanup state
  const [isResequencing, setIsResequencing] = useState(false);
  const handleResequence = () => {
    setConfirmDialog({
      title: 'Resequence Member Numbers',
      message: 'Renumber all approved members sequentially starting from 1 by approval order? This removes any number gaps.',
      confirmLabel: 'Resequence',
      onConfirm: async () => {
        setIsResequencing(true);
        try {
          const res = await resequenceAllApprovedMembersInFirestore();
          showAdminFeedback(res.message, 'success');
          if (onFetchApplications) await onFetchApplications(true);
        } catch (err) {
          showAdminFeedback('Resequence failed: ' + (err instanceof Error ? err.message : String(err)), 'error');
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
      title: 'Reset Member Counter',
      message: 'Reset the member number counter to the highest existing number on the server?',
      confirmLabel: 'Reset',
      onConfirm: async () => {
        setIsResettingCounter(true);
        try {
          const res = await resetMemberCounterToActualHighest();
          showAdminFeedback(res.message, 'success');
          if (onFetchApplications) await onFetchApplications(true);
        } catch (err) {
          showAdminFeedback('Counter reset failed: ' + (err instanceof Error ? err.message : String(err)), 'error');
        } finally {
          setIsResettingCounter(false);
        }
      },
    });
  };

  const handlePurgeDeletedGhosts = () => {
    setConfirmDialog({
      title: 'Clean Rejected & Duplicate Data',
      message: 'Permanently remove rejected, deleted, incomplete, and duplicate pending records from the database and cache?',
      confirmLabel: 'Clean Now',
      isDanger: true,
      onConfirm: async () => {
        setIsPurgingGhosts(true);
        try {
          const res = await purgeDeletedAndGhostApplicationsInFirestore();
          showAdminFeedback(res.message, 'success');
          if (onFetchApplications) await onFetchApplications(true);
        } catch (err) {
          showAdminFeedback('Cleanup failed: ' + (err instanceof Error ? err.message : String(err)), 'error');
        } finally {
          setIsPurgingGhosts(false);
        }
      },
    });
  };

  const handleDeleteWithFeedback = (app: MembershipApplication) => {
    setConfirmDialog({
      title: 'Delete Application',
      message: `Permanently delete the application for ${app.salutation ? app.salutation + ' ' : ''}${app.fullName} (${app.phone})? They will be able to apply again.`,
      confirmLabel: 'Delete',
      isDanger: true,
      onConfirm: async () => {
        try {
          await onDeleteApplication(app.id);
          if (selectedAppForVerification?.id === app.id) {
            setSelectedAppForVerification(null);
          }
          showAdminFeedback(`Application for ${app.fullName} deleted.`, 'success');
        } catch (err) {
          showAdminFeedback('Failed to delete application: ' + (err instanceof Error ? err.message : String(err)), 'error');
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
        ? 'Cloud storage settings saved. Photos will now upload directly to cloud storage.'
        : 'Cloud storage settings saved (currently disabled).',
      type: 'success'
    });
  };

  const handleTestCloudinaryUpload = async () => {
    if (!cloudinaryCloudName.trim() || !cloudinaryPreset.trim()) {
      setCloudinaryStatusMsg({ text: 'Please enter Cloud Name and Unsigned Upload Preset first.', type: 'error' });
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
      if (!blob) throw new Error('Could not create test image.');
      const testFile = new File([blob], 'test_ping.png', { type: 'image/png' });

      const result = await uploadToCloudinary(testFile, {
        cloudName: cloudinaryCloudName.trim(),
        uploadPreset: cloudinaryPreset.trim(),
        enabled: true
      });

      setCloudinaryStatusMsg({
        text: `Connection successful. Test upload URL: ${result.url}`,
        type: 'success'
      });
    } catch (err: any) {
      setCloudinaryStatusMsg({
        text: 'Connection test failed: ' + (err.message || 'Check Cloud Name and Preset'),
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

    setIsUploadingNewsCloudinary(true);
    setNewsError('');
    try {
      const result = await uploadNewsPhotoToServerDisk(file, cloudinaryConfig);
      setNewsImageUrl(result.url);
    } catch (err: any) {
      console.warn('News photo server upload error, falling back to inline compression:', err);
      setIsCompressingNewsImg(true);
      try {
        const { base64 } = await compressImageFile(file, 900, 680, 0.72);
        setNewsImageUrl(base64);
      } catch {
        setNewsError('फोटो प्रोसेस करता आला नाही: ' + (err?.message || ''));
      } finally {
        setIsCompressingNewsImg(false);
      }
    } finally {
      setIsUploadingNewsCloudinary(false);
      e.target.value = '';
    }
  };

  const handleGoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingGoFile(true);
    setGoError('');
    try {
      const result = await uploadGrFileToServerDisk(file, cloudinaryConfig);
      setGoFileUrl(result.url);
    } catch (err: any) {
      setGoError('File upload failed: ' + (err?.message || ''));
    } finally {
      setIsUploadingGoFile(false);
      e.target.value = '';
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
        safeStorageSetItem(typeof localStorage !== 'undefined' ? localStorage : null, DYNAMIC_LEADERSHIP_STORAGE_KEY, JSON.stringify(normalized));
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
        text: err?.message || 'Failed to save to server. Please log in again and retry.',
        type: 'error',
      });
      return false;
    }
  };

  const activeLeaderSectionLabel =
    leaderCategory === 'राज्य सल्लागार मंडळ'
      ? advisorySubTab === 'कायदेविषयक सल्लागार'
        ? 'Legal Advisors'
        : 'Mentors'
      : leaderCategory === 'राज्य कार्यकारिणी'
      ? 'State Executive'
      : leaderCategory === 'महिला आघाडी राज्य कार्यकारिणी'
      ? 'Women Wing'
      : 'Divisional Coordinators';

  const missingVacantLeadersCount = findMissingVacantLeaders(dynamicLeaders).length;

  const handleRestoreMissingVacantLeaders = async () => {
    const { merged, addedCount } = mergeMissingVacantLeaders(dynamicLeaders);
    if (addedCount === 0) return;
    setIsSavingLeader(true);
    try {
      const ok = await saveLeadersToStorage(merged);
      if (ok) {
        setLeaderFormMsg({
          text: `Restored ${addedCount} vacant posts.`,
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

  // Unified Admin Logout: only clears persistent Admin session when user explicitly clicks Logout
  const handleAdminLogout = () => {
    clearPersistedAdminUser();
    clearAuthSessionToken({ clearPersistentAdmin: true });
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    setIsLoggedIn(false);
    setCurrentUser(null);
    setIsMobileMenuOpen(false);
  };

  // Hydrate sub-admin list from local cache & verify/restore persistent Admin session on mount
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

    let cancelled = false;
    const hadInitialPersisted = Boolean(initialPersistedAdminRef.current);
    restorePersistentAdminAuthTokenToSession();

    (async () => {
      try {
        const { ok, data } = await authApiRequest<{
          authenticated?: boolean;
          token?: string;
          user?: AdminUser;
          session?: {
            role?: string;
            email?: string;
            name?: string;
            permissions?: AdminPermissions;
          } | null;
        }>('/api/auth/session', undefined, 'GET');

        if (cancelled || !ok) return;

        const role = data?.session?.role;
        if (data?.authenticated && (role === 'super_admin' || role === 'sub_admin')) {
          if (data.token) {
            setAuthSessionToken(data.token, { persistAdmin: true });
          }

          const restoredUser: AdminUser = data.user || {
            id: role === 'super_admin' ? 'super-admin' : String(data.session?.email || ''),
            email: String(data.session?.email || ''),
            name: String(data.session?.name || (role === 'super_admin' ? 'मुख्य प्रशासक (Super Admin)' : '')),
            isSuperAdmin: role === 'super_admin',
            permissions: (data.session?.permissions || {}) as AdminPermissions,
            createdAt: '',
          };

          savePersistedAdminUser(restoredUser);
          setCurrentUser(restoredUser);
          setIsLoggedIn(true);

          if (!hadInitialPersisted) {
            setActiveAdminSubTab(
              restoredUser.isSuperAdmin
                ? 'applications'
                : getFirstAllowedAdminTab(restoredUser.permissions)
            );
          }

          if (restoredUser.isSuperAdmin || restoredUser.permissions?.manageAdmins) {
            fetchAdminUsers()
              .then((list) => {
                if (!cancelled) setAdminUsersList(list);
              })
              .catch(() => {});
          }

          if (
            (restoredUser.isSuperAdmin ||
              restoredUser.permissions?.approveMembers ||
              restoredUser.permissions?.editMembers) &&
            onFetchApplications
          ) {
            onFetchApplications();
          }
        } else if (data?.authenticated === false && hadInitialPersisted) {
          // Server explicitly confirmed the saved token is no longer valid
          clearPersistedAdminUser();
          clearAuthSessionToken({ clearPersistentAdmin: true });
          setIsLoggedIn(false);
          setCurrentUser(null);
        }
      } catch {
        // Keep persisted login intact during temporary offline/network glitches
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const inputEmail = email.trim().toLowerCase();
    const inputPass = password.trim();

    if (!inputEmail) {
      setLoginError('Please enter your email.');
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
        setLoginError(data?.message || 'Invalid email or password.');
        return;
      }

      if (data.token) {
        setAuthSessionToken(data.token, { persistAdmin: true });
      }

      const loggedUser = data.user;
      savePersistedAdminUser(loggedUser);
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
      setLoginError('Login failed: ' + (err.message || 'Error'));
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
      setFirstLoginError('Please fill in both password fields.');
      return;
    }

    if (newPwd.length < 4) {
      setFirstLoginError('Password must be at least 4 characters.');
      return;
    }

    if (newPwd !== confPwd) {
      setFirstLoginError('Passwords do not match.');
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
        setFirstLoginError(data?.message || 'Failed to save password.');
        return;
      }

      if (data.token) {
        setAuthSessionToken(data.token, { persistAdmin: true });
      }
      const user = data.user;
      savePersistedAdminUser(user);
      setFirstLoginSuccess('Password set. Opening dashboard...');
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
      setFirstLoginError('Failed to save password: ' + (err.message || 'Error'));
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
      setChangePassStatus({ text: 'Please fill in all fields.', type: 'error' });
      return;
    }

    if (newP.length < 4) {
      setChangePassStatus({ text: 'New password must be at least 4 characters.', type: 'error' });
      return;
    }

    if (newP !== confP) {
      setChangePassStatus({ text: 'New password and confirmation do not match.', type: 'error' });
      return;
    }

    try {
      const { ok, data } = await authApiRequest<{ status: string; message?: string }>(
        '/api/auth/admin-change-password',
        { currentPassword: curr, newPassword: newP }
      );
      if (!ok || data?.status !== 'success') {
        setChangePassStatus({ text: data?.message || 'Current password is incorrect.', type: 'error' });
        return;
      }

      setChangePassStatus({
        text: 'Password updated successfully across all devices.',
        type: 'success'
      });
      setCurrentPassInput('');
      setNewPassInput('');
      setConfirmPassInput('');
    } catch (err: any) {
      setChangePassStatus({ text: 'Failed to update password: ' + err.message, type: 'error' });
    }
  };

  // Manage Admins: Add New Sub-Admin
  const handleAddAdminUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminActionMsg(null);

    const targetEmail = newAdminEmail.trim().toLowerCase();
    if (!targetEmail || !targetEmail.includes('@')) {
      setAdminActionMsg({ text: 'Please enter a valid email address.', type: 'error' });
      return;
    }

    if (targetEmail === DEFAULT_ADMIN_EMAIL.toLowerCase() || adminUsersList.some((u) => u.email.toLowerCase() === targetEmail)) {
      setAdminActionMsg({ text: 'This email is already registered as an admin.', type: 'error' });
      return;
    }

    if (!hasAnyAdminPermission(newAdminPermissions)) {
      setAdminActionMsg({ text: 'Select at least one permission.', type: 'error' });
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
        text: `Sub-Admin (${targetEmail}) added. They can set their password on first login.`,
        type: 'success',
      });
    } catch (err: any) {
      setAdminActionMsg({ text: 'Failed to add Sub-Admin: ' + (err.message || 'Error'), type: 'error' });
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
      setAdminActionMsg({ text: 'Select at least one permission.', type: 'error' });
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
        text: `Permissions updated for ${subAdmin.email}.`,
        type: 'success',
      });
    } catch (err: any) {
      setAdminActionMsg({
        text: 'Failed to update permissions: ' + (err.message || 'Error'),
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
      setAdminActionMsg({ text: `Removed admin access for ${targetEmail}.`, type: 'success' });
    } catch (err: any) {
      setAdminActionMsg({ text: 'Failed to remove Sub-Admin.', type: 'error' });
    }
  };

  // Manage Admins: Reset Sub-Admin Password (allow them to set new password from any mobile)
  const handleResetSubAdmin = async (id: string, targetEmail: string) => {
    try {
      await resetAdminUserToFirstLogin(id);
      const updated = await fetchAdminUsers();
      setAdminUsersList(updated);
      setAdminActionMsg({
        text: `Password reset for ${targetEmail}. They can set a new password on next login.`,
        type: 'success',
      });
    } catch (err: any) {
      setAdminActionMsg({ text: 'Failed to reset password: ' + (err.message || 'Error'), type: 'error' });
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
        setMailboxError('Could not connect to the mail server.');
      }
    } catch (e: any) {
      console.warn('Failed to fetch unified inbox:', e);
      setMailboxError(e?.message || 'Failed to load messages.');
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
      showAdminFeedback(nextRead ? 'Marked as read.' : 'Marked as unread.', 'success');
    } catch {
      setMailboxEmails((prev) =>
        prev.map((m) => (m.uid === emailItem.uid ? { ...m, isRead: !nextRead } : m))
      );
      showAdminFeedback('Failed to update email status.', 'error');
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
      showAdminFeedback('Email deleted from inbox.', 'success');
    } catch {
      showAdminFeedback('Failed to delete email.', 'error');
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
      : 'Mahasangh — Reply';
    const greeting = opts.recipientName
      ? `Dear ${opts.recipientName},\n\n`
      : 'Hello,\n\n';

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
      setReplyModal((prev) => prev ? { ...prev, error: 'Please enter a valid recipient email.' } : prev);
      return;
    }
    if (!subject || !text) {
      setReplyModal((prev) => prev ? { ...prev, error: 'Please enter both subject and message.' } : prev);
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
        throw new Error(data.message || 'Failed to send email.');
      }
      setReplyModal(null);
      showAdminFeedback(`Email sent to '${to}' from ${mailboxAccount}.`, 'success');
    } catch (err: any) {
      setReplyModal((prev) =>
        prev ? { ...prev, isSending: false, error: err?.message || 'Failed to send email.' } : prev
      );
    }
  };

  const hasAutoLoadedMailboxRef = useRef(false);
  useEffect(() => {
    if (!isLoggedIn) {
      hasAutoLoadedMailboxRef.current = false;
      return;
    }
    if (
      (currentUser?.isSuperAdmin || currentUser?.permissions.manageContactMessages) &&
      (activeAdminSubTab === 'contact_messages' || !hasAutoLoadedMailboxRef.current)
    ) {
      hasAutoLoadedMailboxRef.current = true;
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
      setVerificationErrorMsg('Please confirm that the membership fee payment has been received.');
      return;
    }
    setVerificationErrorMsg('');
    setIsApprovingApp(true);
    try {
      const atomicResult = await approveApplicationAtomicInFirestore({
        appId: selectedAppForVerification.id,
        district: selectedAppForVerification.district,
        approvedBy: currentUser?.email || 'Admin',
        source: 'admin_manual_verification',
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
        `Approved ${selectedAppForVerification.fullName}. Member No: ${resolvedNumber}`,
        'success'
      );
      setSelectedAppForVerification(null);
    } catch (err: any) {
      setVerificationErrorMsg('Approval failed: ' + (err?.message || 'Please check your connection and retry.'));
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
    onRejectApplication(selectedAppForVerification.id, rejectReason.trim() || 'Rejected by Admin');
    setSelectedAppForVerification(null);
    showAdminFeedback(`Application for ${rejectedName} rejected.`, 'success');
  };

  // Handle Photo selection for Leader with client-side super-compression (15KB - 25KB)
  const handleLeaderPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setLeaderFormMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setLeaderFormMsg({ text: 'Please select a valid image file (JPG or PNG).', type: 'error' });
      return;
    }

    setIsUploadingLeaderCloudinary(true);
    try {
      // Compress leader passport photo (~18-28KB WebP/JPEG) and store directly in SQL (zero Cloudinary quota)
      const { base64, sizeKb } = await compressImageFile(file, 320, 380, 0.78);
      setLeaderPhoto(base64);
      setLeaderPhotoSizeKb(sizeKb);
      setLeaderPhotoUrl('');
      setLeaderFormMsg({
        text: `Photo compressed (${sizeKb} KB) & ready to save in SQL database.`,
        type: 'success',
      });
    } catch (err: any) {
      setLeaderFormMsg({ text: 'Failed to compress photo: ' + (err?.message || ''), type: 'error' });
    } finally {
      setIsUploadingLeaderCloudinary(false);
      e.target.value = '';
    }
  };

  // Add or Edit Leader in selected category (State Leadership OR District Leadership)
  const handleSaveLeader = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeaderFormMsg(null);

    const isDistrictTab = activeAdminSubTab === 'district_leadership';

    if (isDistrictTab && !leaderRegion.trim()) {
      setLeaderFormMsg({ text: 'Please select a district.', type: 'error' });
      return;
    }

    if (isDistrictTab && (!leaderName.trim() || !leaderRole.trim())) {
      setLeaderFormMsg({ text: 'Please enter both name and designation.', type: 'error' });
      return;
    }

    if (!isDistrictTab && !leaderRole.trim()) {
      setLeaderFormMsg({ text: 'Please enter the designation.', type: 'error' });
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
          setLeaderFormMsg({ text: 'Leader updated successfully.', type: 'success' });
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
          setLeaderFormMsg({ text: 'District leader saved successfully.', type: 'success' });
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
          setLeaderFormMsg({ text: 'New leader added successfully.', type: 'success' });
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
      setLeaderFormMsg({ text: `'${leaderName || 'Leader'}' removed from list.`, type: 'success' });
      setTimeout(() => setLeaderFormMsg(null), 3500);
    }
  };

  // Create or Update News / GR
  const handleCreateNews = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsTitle.trim() || !newsSummary.trim() || !newsContent.trim()) {
      setNewsError('Please enter title, summary, and full content.');
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
        setGoError('Failed to save GR: ' + err.message);
    }
  };

  const handleDeleteGovOrder = (id: string) => {
    setConfirmDialog({
      title: 'Delete GR / Order',
      message: 'Permanently delete this GR / Circular / Order?',
      confirmLabel: 'Delete',
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteGovOrderFromFirestore(id);
          setGovOrders(prev => prev.filter(go => go.id !== id));
          showAdminFeedback('GR / Order deleted.', 'success');
        } catch (err: any) {
          showAdminFeedback('Delete failed: ' + err.message, 'error');
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
    const displayTitle = item.title || (item as any).headline || 'this post';
    setConfirmDialog({
      title: 'Delete News',
      message: `Permanently delete '${displayTitle}'?`,
      confirmLabel: 'Delete',
      isDanger: true,
      onConfirm: () => {
        if (onDeleteNews) {
          onDeleteNews(item.id);
        }
        showAdminFeedback('News post deleted.', 'success');
      },
    });
  };

  // Live Preview Handlers
  const handleOpenLivePreview = () => {
    if (!newsTitle.trim()) {
      setNewsError('Enter at least a title to preview.');
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

  const requestedPhotoIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (activeAdminSubTab !== 'applications' || !isLoggedIn) return;
    const missingPhotoIds = visibleFilteredApps
      .filter((app) => !app.photo && app.hasPhoto && !requestedPhotoIdsRef.current.has(app.id))
      .map((app) => app.id);
    if (missingPhotoIds.length === 0) return;
    missingPhotoIds.forEach((id) => requestedPhotoIdsRef.current.add(id));
    fetchApplicationPhotosBatch(missingPhotoIds)
      .then((photos) => {
        if (photos && Object.keys(photos).length > 0) {
          window.dispatchEvent(new CustomEvent('mahasangh_app_photos_hydrated', { detail: photos }));
        }
      })
      .catch(() => {});
  }, [visibleFilteredApps, activeAdminSubTab, isLoggedIn]);

  const totalCount = applications.length;
  const approvedCount = applications.filter((a) => a.status === 'approved').length;
  const pendingCount = applications.filter((a) => a.status === 'pending').length;
  const rejectedCount = applications.filter((a) => a.status === 'rejected').length;
  const missingCenterCount = applications.filter(
    (a) => a.status !== 'rejected' && isMissingCenterName(a.centerName)
  ).length;

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
      label: `Applications (${toEnglishDigits(totalCount)})`,
      shortLabel: 'Apps',
      icon: <Users className="w-4 h-4 shrink-0" />,
      badge: pendingCount > 0 ? pendingCount : undefined,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.approveMembers),
    },
    {
      key: 'edit_members',
      label: 'Edit Members',
      shortLabel: 'Edit',
      icon: <Edit3 className="w-4 h-4 shrink-0" />,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.editMembers),
    },
    {
      key: 'leadership',
      label: 'State Leaders',
      shortLabel: 'State',
      icon: <Award className="w-4 h-4 shrink-0" />,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.manageLeadership),
    },
    {
      key: 'district_leadership',
      label: 'District Leaders',
      shortLabel: 'District',
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
      label: 'WhatsApp',
      shortLabel: 'WhatsApp',
      icon: <Smartphone className="w-4 h-4 shrink-0 text-emerald-600" />,
      allowed: Boolean(currentUser?.isSuperAdmin),
    },
    {
      key: 'backup_restore',
      label: 'Backup & Restore',
      shortLabel: 'Backup',
      icon: <Database className="w-4 h-4 shrink-0 text-[#193568]" />,
      allowed: Boolean(currentUser?.isSuperAdmin),
    },
    {
      key: 'add_news',
      label: 'News',
      shortLabel: 'News',
      icon: <FileText className="w-4 h-4 shrink-0" />,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.manageNews),
    },
    {
      key: 'gov_order',
      label: 'GR & Orders',
      shortLabel: 'GR',
      icon: <FileText className="w-4 h-4 shrink-0" />,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.manageGovOrders),
    },
    {
      key: 'latest_banners',
      label: 'Banners',
      shortLabel: 'Banners',
      icon: <ImageIcon className="w-4 h-4 shrink-0" />,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.manageLatestBanners),
    },
    {
      key: 'print_id_cards',
      label: 'Print ID Cards',
      shortLabel: 'Print ID',
      icon: <Award className="w-4 h-4 shrink-0 text-amber-600" />,
      allowed: Boolean(currentUser?.isSuperAdmin),
    },
    {
      key: 'passport_photo',
      label: 'Photo ZIP',
      shortLabel: 'Photos',
      icon: <ImageIcon className="w-4 h-4 shrink-0 text-amber-500" />,
      allowed: Boolean(currentUser?.isSuperAdmin),
    },
    {
      key: 'id_card_preview',
      label: 'ID Card Design',
      shortLabel: 'ID Card',
      icon: <Award className="w-4 h-4 shrink-0" />,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.viewIdCardPreview),
    },
    {
      key: 'contact_messages',
      label: `Messages (${toEnglishDigits(contactMessages.length + mailboxEmails.length)})`,
      shortLabel: 'Inbox',
      icon: <MessageSquare className="w-4 h-4 shrink-0" />,
      badge: contactMessages.length + mailboxEmails.length > 0 ? contactMessages.length + mailboxEmails.length : undefined,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.manageContactMessages),
    },
    {
      key: 'manage_admins',
      label: 'Sub-Admins',
      shortLabel: 'Admins',
      icon: <Shield className="w-4 h-4 shrink-0" />,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.manageAdmins),
    },
    {
      key: 'cloudinary',
      label: 'Cloud Storage',
      shortLabel: 'Storage',
      icon: <Cloud className="w-4 h-4 shrink-0" />,
      allowed: Boolean(currentUser?.isSuperAdmin || currentUser?.permissions.manageCloudinary),
    },
    {
      key: 'maintenance',
      label: 'Maintenance',
      shortLabel: 'Maintain',
      icon: <Wrench className="w-4 h-4 shrink-0 text-amber-700" />,
      allowed: Boolean(currentUser?.isSuperAdmin),
    },
    {
      key: 'password',
      label: 'Password',
      shortLabel: 'Password',
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
              alt="Mahasangh Official Logo"
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-full ring-2 ring-[#efb24b] bg-white object-contain shrink-0"
            />
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-bold text-[#efb24b] tracking-wide truncate leading-tight">
                Maharashtra State Federation
              </p>
              <h1 className="text-sm sm:text-lg font-bold text-white truncate leading-tight">
                Admin Panel
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onExitAdmin && (
              <button
                type="button"
                onClick={onExitAdmin}
                className="min-h-[40px] px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Back to Website"
              >
                <ArrowLeft className="w-4 h-4 text-[#efb24b]" />
                <span className="hidden sm:inline">Website</span>
                <span className="sm:hidden">Site</span>
              </button>
            )}

            {isLoggedIn && (
              <button
                type="button"
                onClick={handleAdminLogout}
                className="min-h-[40px] px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-[#df6b16] hover:bg-[#c85c0e] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                title="Sign out of Admin Panel"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
                <span className="sm:hidden">Exit</span>
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
                  <h2 className="text-xl font-bold text-center text-[#0b1e36] mb-1">
                    Set Password
                  </h2>
                  <p className="text-xs text-center text-[#607184] mb-3">
                    Welcome to the Admin Panel. Create your password for first-time login.
                  </p>
                  <div className="bg-[#fbf8f2] border border-[#e7ded1] p-3 rounded-xl text-center text-xs mb-4">
                    Email: <strong className="text-[#0b1e36] font-mono">{firstLoginEmail}</strong>
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
                        New Password <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="password"
                        required
                        value={firstLoginNewPassword}
                        onChange={(e) => setFirstLoginNewPassword(e.target.value)}
                        placeholder="Minimum 4 characters"
                        className="w-full px-3.5 py-3 text-base sm:text-sm bg-[#fbf8f2] border border-[#e7ded1] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#df6b16]"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-xs text-[#102a43] block mb-1.5">
                        Confirm Password <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="password"
                        required
                        value={firstLoginConfirmPassword}
                        onChange={(e) => setFirstLoginConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        className="w-full px-3.5 py-3 text-base sm:text-sm bg-[#fbf8f2] border border-[#e7ded1] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#df6b16]"
                      />
                    </div>

                    <div className="flex gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsFirstLoginMode(false)}
                        className="flex-1 min-h-[46px] bg-slate-100 hover:bg-slate-200 text-[#102a43] font-bold py-2.5 rounded-xl text-sm cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 min-h-[46px] bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold py-2.5 rounded-xl text-sm shadow-sm cursor-pointer"
                      >
                        Save Password
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div>
                  <div className="w-16 h-16 rounded-full ring-2 ring-[#efb24b] bg-[#fbf8f2] p-1 mx-auto mb-4 shadow-sm flex items-center justify-center">
                    <img
                      src="/logo.png"
                      alt="Mahasangh Logo"
                      className="w-full h-full object-contain rounded-full"
                    />
                  </div>
                  <h2 className="text-2xl font-bold text-center text-[#0b1e36] mb-1">
                    Admin Login
                  </h2>
                  <p className="text-xs sm:text-sm text-center text-[#607184] mb-6">
                    Authorized Administrators Only
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
                        Email
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter admin email"
                        className="w-full px-3.5 py-3 text-base sm:text-sm bg-[#fbf8f2] border border-[#e7ded1] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#df6b16]"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-xs sm:text-sm text-[#102a43] block mb-1.5">
                        Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter password"
                          className="w-full px-3.5 py-3 pr-12 text-base sm:text-sm bg-[#fbf8f2] border border-[#e7ded1] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#df6b16]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label="Toggle password visibility"
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
                          <span>Signing in...</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4 text-[#efb24b]" />
                          <span>Sign In</span>
                        </>
                      )}
                    </button>
                  </form>

                  <div className="mt-6 pt-5 border-t border-[#e7ded1] text-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (!email.trim()) {
                          setLoginError('Please enter your authorized email first.');
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
                      New Sub-Admin? Set Password
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
                    {currentUser?.isSuperAdmin ? 'Super Admin' : currentUser?.name || 'Sub-Admin'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 font-mono truncate mt-0.5">
                  {currentUser?.email}
                </p>
              </div>

              <nav className="space-y-1" aria-label="Admin Navigation">
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
                    {currentUser?.isSuperAdmin ? 'Super Admin' : currentUser?.name || 'Sub-Admin'}
                  </p>
                  <p className="font-bold text-sm text-[#0b1e36] truncate">
                    {permittedNavItems.find((i) => i.key === activeAdminSubTab)?.label || 'Admin'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-[#0b1e36] text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Menu className="w-4 h-4 text-[#efb24b]" />
                  <span>Menu</span>
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
                    aria-label="Close"
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
                    <h3 className="text-lg font-bold text-[#0b1e36]">
                      Membership Applications
                    </h3>
                    <p className="text-xs text-[#607184] mt-0.5">
                      Review applications, verify payments, and issue member numbers.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {onFetchApplications && (
                      <button
                        type="button"
                        onClick={() => onFetchApplications(true)}
                        disabled={isLoadingApps}
                        className="min-h-[40px] bg-[#fbf8f2] hover:bg-[#f2eadf] text-[#0b1e36] border border-[#e7ded1] text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-[#df6b16] ${isLoadingApps ? 'animate-spin' : ''}`} />
                        <span>{isLoadingApps ? 'Loading...' : 'Refresh'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick Stats Grid inside Applications Sub-Tab */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                  <div className="bg-[#fbf8f2] p-3.5 rounded-xl border border-[#e7ded1]">
                    <span className="text-[#607184] text-xs font-bold block">Total</span>
                    <span className="text-2xl font-black text-[#0b1e36] tabular-nums">{toEnglishDigits(totalCount)}</span>
                  </div>
                  <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200">
                    <span className="text-emerald-800 text-xs font-bold block">Approved</span>
                    <span className="text-2xl font-black text-emerald-700 tabular-nums">{toEnglishDigits(approvedCount)}</span>
                  </div>
                  <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200">
                    <span className="text-amber-800 text-xs font-bold block">Pending</span>
                    <span className="text-2xl font-black text-amber-700 tabular-nums">{toEnglishDigits(pendingCount)}</span>
                  </div>
                  <div className="bg-rose-50/70 p-3.5 rounded-xl border border-rose-200">
                    <span className="text-rose-800 text-xs font-bold block">Rejected</span>
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
                        {st === 'all' && `All (${toEnglishDigits(totalCount)})`}
                        {st === 'pending' && `Pending (${toEnglishDigits(pendingCount)})`}
                        {st === 'approved' && `Approved (${toEnglishDigits(approvedCount)})`}
                        {st === 'rejected' && `Rejected (${toEnglishDigits(rejectedCount)})`}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
                    <div className="relative flex-1 sm:w-64">
                      <Search className="w-4 h-4 text-[#607184] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Name, App No., mobile, or district..."
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
                      onClick={() => {
                        const filterLabelMap: Record<string, string> = {
                          all: 'सर्व',
                          approved: 'मंजूर',
                          pending: 'प्रलंबित',
                          rejected: 'नाकारले',
                        };
                        const dateSlug = new Date().toISOString().split('T')[0];
                        exportUnifiedMembersExcel(filteredApps, {
                          title:
                            filterStatus === 'approved'
                              ? 'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ - अधिकृत नोंदणीकृत सदस्य यादी'
                              : 'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ - अधिकृत सदस्य यादी',
                          sheetName: 'नोंदणीकृत सदस्य',
                          filterLabel: filterLabelMap[filterStatus] || 'सर्व',
                          fileName:
                            filterStatus === 'approved'
                              ? `अधिकृत_नोंदणीकृत_सदस्य_यादी_${dateSlug}.xlsx`
                              : `अधिकृत_सदस्य_यादी_${filterStatus}_${dateSlug}.xlsx`,
                        });
                        showAdminFeedback(
                          `Excel list (${toEnglishDigits(filteredApps.length)} members) downloaded.`,
                          'success'
                        );
                      }}
                      className="min-h-[44px] bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs shrink-0 cursor-pointer"
                      title="Download member list as Excel (.xlsx)"
                    >
                      <Download className="w-4 h-4" />
                      <span>Export XLSX</span>
                    </button>
                    <button
                      type="button"
                      disabled={isSyncingRazorpay}
                      onClick={() => handleSyncRazorpayLivePayments()}
                      className="min-h-[44px] bg-[#df6b16] hover:bg-[#c55b0d] disabled:opacity-60 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs shrink-0 cursor-pointer"
                      title="Sync and match pending applications directly from Razorpay"
                    >
                      <RefreshCw className={`w-4 h-4 ${isSyncingRazorpay ? 'animate-spin' : ''}`} />
                      <span>{isSyncingRazorpay ? 'Syncing...' : 'Razorpay Sync'}</span>
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
                            const matched: RazorpayMatchedRow[] = [];

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
                                  matched.push({ app, paymentId, orderId, matchBy: 'excel', selected: true });
                                }
                              });
                            });

                            setRazorpayMatchedList(matched);
                            setRazorpaySyncMeta({ source: 'excel' });
                            setShowRazorpayMatchModal(true);
                            if (matched.length === 0) {
                              showAdminFeedback('No matching captured payments found for pending applications.', 'error');
                            }
                          } catch (err: any) {
                            showAdminFeedback('Failed to read Excel file: ' + err.message, 'error');
                          }
                        };
                        fileInput.click();
                      }}
                      className="min-h-[44px] bg-[#0b1e36] hover:bg-[#193568] text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs shrink-0 cursor-pointer"
                      title="Upload Razorpay Excel report to auto-approve matching pending applications"
                    >
                      <Upload className="w-4 h-4 text-[#efb24b]" />
                      <span>Excel Auto-Approve</span>
                    </button>
                  </div>
                </div>

                {/* Mobile App Card List (Visible on Mobile & Small Tablets) */}
                <div className="md:hidden space-y-3">
                  {filteredApps.length === 0 ? (
                    <div className="py-10 text-center text-sm text-[#607184] bg-[#fbf8f2] rounded-xl border border-dashed border-[#e7ded1]">
                      No applications found.
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
                                  Approved
                                </span>
                              ) : app.status === 'rejected' ? (
                                <span className="inline-flex items-center bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0">
                                  Rejected
                                </span>
                              ) : (
                                <span className="inline-flex items-center bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0">
                                  Pending
                                </span>
                              )}
                            </div>

                            <div className="text-xs text-[#607184] mt-1 space-y-0.5">
                              <p className="font-mono font-bold text-[#193568] text-[11px]">
                                {app.memberNumber || app.applicationNumber} • {formatDateWithEnglishDigits(app.createdAt)}
                              </p>
                              <p>
                                {normalizeOfficialCadre(app.professional, 'केंद्रप्रमुख')} • <strong className="text-[#102a43]">{app.district}</strong>
                                {app.taluka ? ` · Tal. ${app.taluka}` : ''}
                              </p>
                              {app.centerName && (
                                <p className="text-[11px] text-[#102a43] font-medium">
                                  Center: {app.centerName}
                                </p>
                              )}
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
                                <span>Approve</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenVerification(app, true)}
                                className="min-h-[44px] bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <X className="w-4 h-4" />
                                <span>Reject</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteWithFeedback(app)}
                                className="min-h-[44px] bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span>Delete</span>
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
                                <span>ID Card</span>
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
                                <span>Delete</span>
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
                        <th className="py-3 px-4">Photo</th>
                        <th className="py-3 px-4">App No. / Date</th>
                        <th className="py-3 px-4">Applicant</th>
                        <th className="py-3 px-4">Cadre & District</th>
                        <th className="py-3 px-4">Mobile</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e7ded1]/70">
                      {filteredApps.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-[#607184]">
                            No applications found.
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
                                title="Open verification details"
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
                              {normalizeOfficialCadre(app.professional, 'केंद्रप्रमुख')}
                              <span className="block text-[11px] text-[#607184] font-semibold">
                                {app.district}{app.taluka ? ` (Tal. ${app.taluka})` : ''}
                              </span>
                              {app.centerName && (
                                <span className="block text-[11px] text-[#102a43] font-medium mt-0.5">
                                  Center: {app.centerName}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono tabular-nums">
                              {app.phone}
                            </td>
                            <td className="py-3 px-4">
                              {app.status === 'approved' ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full text-[11px] font-bold">
                                  <Award className="w-3 h-3 text-emerald-600" />
                                  Approved
                                </span>
                              ) : app.status === 'rejected' ? (
                                <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-full text-[11px] font-bold">
                                  Rejected
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full text-[11px] font-bold">
                                  Pending
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
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenVerification(app, true)}
                                    className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors shadow-xs cursor-pointer"
                                  >
                                    Reject
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteWithFeedback(app)}
                                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors shadow-xs cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setCertModalApp(app)}
                                    className="bg-[#0b1e36] hover:bg-[#193568] text-white font-bold px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
                                    title="View ID Card"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-[#efb24b]" />
                                    ID Card
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => generateMembershipIdCardPdf(app)}
                                    className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
                                    title="Download ID Card PDF"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    PDF
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteWithFeedback(app)}
                                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
                                    title="Delete application"
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
                      Showing <strong className="text-[#0b1e36] tabular-nums">{toEnglishDigits(visibleFilteredApps.length)}</strong> of{' '}
                      <strong className="text-[#0b1e36] tabular-nums">{toEnglishDigits(filteredApps.length)}</strong> applications
                    </span>
                    {visibleFilteredApps.length < filteredApps.length && (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => setAppsVisibleCount((prev) => prev + 50)}
                          className="flex-1 sm:flex-none min-h-[42px] px-4 py-2 bg-[#0b1e36] hover:bg-[#193568] text-white font-bold rounded-xl cursor-pointer"
                        >
                          Load 50 More
                        </button>
                        <button
                          type="button"
                          onClick={() => setAppsVisibleCount(filteredApps.length)}
                          className="min-h-[42px] px-4 py-2 bg-[#fbf8f2] hover:bg-[#f0e9de] text-[#0b1e36] border border-[#e7ded1] font-bold rounded-xl cursor-pointer"
                        >
                          Show All
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
                  <h3 className="text-lg font-bold text-[#17366d]">
                    State Leaders
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Manage State Executive, Women Wing, Divisional Coordinators, and Advisory Board members.
                  </p>
                </div>

                {/* Dropdown with 4 State Categories */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <label className="font-bold text-xs text-[#09243f] shrink-0">
                    Category:
                  </label>
                  <select
                    value={leaderCategory}
                    onChange={(e) => {
                      setLeaderCategory(e.target.value as any);
                      setEditingLeaderId(null);
                    }}
                    className="p-2.5 bg-white border border-[#c8d2e2] text-xs font-bold text-[#193568] rounded-lg focus:outline-none focus:border-[#df6b16] w-full sm:w-72"
                  >
                    <option value="राज्य कार्यकारिणी">1. State Executive</option>
                    <option value="महिला आघाडी राज्य कार्यकारिणी">2. Women Wing</option>
                    <option value="विभागीय समन्वयक">3. Divisional Coordinators</option>
                    <option value="राज्य सल्लागार मंडळ">4. Advisory Board</option>
                  </select>
                  <span className="text-xs text-slate-500 font-medium">
                    Total: <strong>{categoryLeaders.length}</strong> leaders
                  </span>
                </div>

                {missingVacantLeadersCount > 0 && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs text-amber-950">
                      <strong className="block text-sm font-bold text-[#17366d]">
                        Vacant Posts Available ({missingVacantLeadersCount})
                      </strong>
                      <span className="text-amber-900">
                        Restore missing default vacant slots without affecting existing leaders.
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={isSavingLeader}
                      onClick={handleRestoreMissingVacantLeaders}
                      className="px-4 py-2.5 bg-[#17366d] hover:bg-[#10274e] text-white font-bold text-xs rounded-xl shadow-xs shrink-0 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-[#efb24b]" />
                      <span>Restore Vacant Posts ({missingVacantLeadersCount})</span>
                    </button>
                  </div>
                )}

                {leaderCategory === 'राज्य सल्लागार मंडळ' && (
                  <div className="bg-[#f8f9fc] p-3.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-[#17366d]">
                      Advisory Sub-Section:
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
                        1. Legal Advisors
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
                        2. Mentors
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
                        <h4 className="font-bold text-sm text-[#193568]">
                          Reorder Leaders
                        </h4>
                      </div>
                      <p className="text-xs text-slate-700 mt-1">
                        {selectedLeader ? (
                          <span className="inline-flex items-center gap-1.5 flex-wrap">
                            <span>Selected:</span>
                            <span className="bg-white px-2.5 py-1 rounded-lg border border-amber-400 font-bold text-[#193568] shadow-2xs">
                              #{selectedLeaderIndex + 1} {isPlaceholderDistrictName(selectedLeader.name) ? 'Vacant Post' : selectedLeader.name} ({selectedLeader.role})
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-500">
                            Select a leader below to move them up or down.
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
                        title="Move selected leader up"
                      >
                        <ArrowUp className="w-4 h-4 text-[#efb24b]" />
                        <span>Move Up</span>
                      </button>
                      <button
                        type="button"
                        disabled={!selectedLeader || selectedLeaderIndex === -1 || selectedLeaderIndex >= categoryLeaders.length - 1}
                        onClick={() => handleMoveLeaderDown()}
                        className="flex-1 md:flex-none px-5 py-3 bg-[#df6b16] hover:bg-[#b8540c] text-white font-bold text-xs sm:text-sm rounded-xl shadow-sm disabled:opacity-35 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer border border-[#df6b16]"
                        title="Move selected leader down"
                      >
                        <ArrowDown className="w-4 h-4 text-white" />
                        <span>Move Down</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Already Added Leaders List with Clear Click-to-Select & Row Arrows */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider">
                      Current Leaders ({activeLeaderSectionLabel}) — {categoryLeaders.length}
                    </h4>
                    <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
                      Click a row to select or use the arrow buttons
                    </span>
                  </div>

                  {categoryLeaders.length === 0 ? (
                    <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-500 text-xs">
                      No leaders added in this category yet. Use the form below to add one.
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
                                title={`Position #${index + 1}`}
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
                                  <h5 className={`font-bold text-xs sm:text-sm truncate ${
                                    isVacantSlot
                                      ? 'text-amber-800 italic'
                                      : isSelected
                                        ? 'text-[#193568]'
                                        : 'text-slate-900'
                                  }`}>
                                    {isVacantSlot ? 'Vacant Post' : ldr.name}
                                  </h5>
                                  {isVacantSlot && (
                                    <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                                      Vacant
                                    </span>
                                  )}
                                  {isSelected && (
                                    <span className="bg-[#df6b16] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                                      Selected
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
                                  title="Move Up"
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
                                  title="Move Down"
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
                                title="Edit"
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
                                title="Delete"
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
                  <h4 className="text-base font-bold text-[#17366d] mb-1">
                    {editingLeaderId ? 'Edit Leader' : `Add Leader (${activeLeaderSectionLabel})`}
                  </h4>
                  <p className="text-[11px] text-slate-500 mb-4">
                    Enter name, designation, region, and photo (max 200 KB).
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
                          Full Name <span className="text-[10px] font-normal text-slate-500">(blank for vacant)</span>
                        </label>
                        <input
                          type="text"
                          value={leaderName}
                          onChange={(e) => setLeaderName(e.target.value)}
                          placeholder="Full name (or leave blank)"
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          Designation <span className="text-rose-600">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={leaderRole}
                          onChange={(e) => setLeaderRole(e.target.value)}
                          placeholder="e.g. Vice President"
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          District / Region
                        </label>
                        <input
                          type="text"
                          value={leaderRegion}
                          onChange={(e) => setLeaderRegion(e.target.value)}
                          placeholder="e.g. Nashik / Pune Division"
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          Mobile
                        </label>
                        <input
                          type="text"
                          value={leaderPhone}
                          onChange={(e) => setLeaderPhone(e.target.value)}
                          placeholder="10-digit mobile"
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          Qualification / Cadre
                        </label>
                        <input
                          type="text"
                          value={leaderEducation}
                          onChange={(e) => setLeaderEducation(e.target.value)}
                          placeholder="e.g. M.A., B.Ed."
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      {/* Photo Upload */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-bold text-slate-700 text-xs">
                            Photo
                          </label>
                          {cloudinaryConfig.enabled && (
                            <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Cloud Active
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
                              <span>Uploading photo...</span>
                            </div>
                          )}
                          {leaderPhoto && !isUploadingLeaderCloudinary && (
                            <div className="flex items-center gap-2 p-1.5 bg-slate-50 border border-slate-200 rounded">
                              <img src={leaderPhoto} alt="Preview" className="w-8 h-8 rounded object-cover" />
                              <span className="text-[10px] text-slate-600 truncate flex-1 font-mono">
                                {leaderPhoto.startsWith('http') ? 'Photo uploaded' : 'Photo selected'}
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
                                Remove
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="mt-2">
                          <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                            Or Image URL:
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
                            placeholder="https://..."
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
                            <span>Saving...</span>
                          </>
                        ) : (
                          <span>{editingLeaderId ? 'Save Changes' : 'Add Leader'}</span>
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
                          Cancel
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
                    <h3 className="text-lg font-bold text-[#17366d]">
                      District Leaders
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Manage <strong>District Presidents</strong> and <strong>District Secretaries</strong> across all 34 districts.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-bold">
                    <span className="bg-sky-50 text-sky-900 border border-sky-200 px-3 py-1.5 rounded-lg">
                      Presidents: {dynamicLeaders.filter((l) => l && (l.category === 'जिल्हा अध्यक्ष' || l.category === 'district') && !isPlaceholderDistrictName(l.name)).length}
                    </span>
                    <span className="bg-amber-50 text-amber-900 border border-amber-200 px-3 py-1.5 rounded-lg">
                      Secretaries: {dynamicLeaders.filter((l) => l && l.category === 'जिल्हा सरचिटणीस' && !isPlaceholderDistrictName(l.name)).length}
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
                      1. District Presidents ({dynamicLeaders.filter((l) => l && (l.category === 'जिल्हा अध्यक्ष' || l.category === 'district')).length})
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
                      2. District Secretaries ({dynamicLeaders.filter((l) => l && l.category === 'जिल्हा सरचिटणीस').length})
                    </button>
                  </div>

                  <div className="relative w-full md:w-72">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={districtLeaderSearch}
                      onChange={(e) => setDistrictLeaderSearch(e.target.value)}
                      placeholder="Search district or name..."
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
                  const modeLabelEn = districtLeaderMode === 'जिल्हा अध्यक्ष' ? 'District President' : 'District Secretary';
                  return (
                    <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#17366d]">
                          Districts without {modeLabelEn} ({missingDistricts.length}) — click to add:
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
                      <h4 className="font-bold text-sm text-[#193568]">
                        Reorder Districts ({districtLeaderMode === 'जिल्हा अध्यक्ष' ? 'Presidents' : 'Secretaries'})
                      </h4>
                      <p className="text-xs text-slate-700 mt-1">
                        {selectedDistrictLeader ? (
                          <span className="inline-flex items-center gap-1.5 flex-wrap">
                            <span>Selected:</span>
                            <span className="bg-white px-2.5 py-1 rounded-lg border border-amber-400 font-bold text-[#193568]">
                              #{selectedDistrictLeaderIndex + 1} {selectedDistrictLeader.region} — {isPlaceholderDistrictName(selectedDistrictLeader.name) ? 'Vacant' : selectedDistrictLeader.name}
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-500">Select a district to move up or down.</span>
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
                        <span>Move Up</span>
                      </button>
                      <button
                        type="button"
                        disabled={!selectedDistrictLeader || selectedDistrictLeaderIndex === -1 || selectedDistrictLeaderIndex >= allDistrictModeLeaders.length - 1}
                        onClick={() => handleMoveDistrictLeaderDown()}
                        className="flex-1 md:flex-none px-4 py-2.5 bg-[#df6b16] hover:bg-[#b8540c] text-white font-bold text-xs rounded-xl shadow-sm disabled:opacity-35 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <ArrowDown className="w-4 h-4 text-white" />
                        <span>Move Down</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* District Leaders Cards Grid */}
                {filteredDistrictModeLeaders.length === 0 ? (
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-500 text-xs">
                    {districtLeaderSearch.trim()
                      ? `No leader found for '${districtLeaderSearch}'.`
                      : 'No district leaders added yet. Click a district above or use the form below.'}
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
                                  {ldr.region || 'District'}
                                </span>
                                {isBlank && (
                                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded">
                                    Vacant
                                  </span>
                                )}
                              </div>
                              <h5 className="font-bold text-xs sm:text-sm text-slate-900 truncate mt-1">
                                {isBlank ? 'Update Leader Name' : ldr.name}
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
                                title="Move Up"
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
                                title="Move Down"
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
                              title="Edit"
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
                              title="Delete"
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
                  <h4 className="text-base font-bold text-[#17366d] mb-1">
                    {editingLeaderId
                      ? `Edit ${districtLeaderMode === 'जिल्हा अध्यक्ष' ? 'District President' : 'District Secretary'}`
                      : `Add ${districtLeaderMode === 'जिल्हा अध्यक्ष' ? 'District President' : 'District Secretary'}`}
                  </h4>
                  <p className="text-[11px] text-slate-500 mb-4">
                    Select district, enter details, and upload photo. Changes update live on the District Portal.
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
                          District <span className="text-rose-600">*</span>
                        </label>
                        <select
                          required
                          value={leaderRegion}
                          onChange={(e) => setLeaderRegion(e.target.value)}
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        >
                          <option value="">-- Select District --</option>
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
                          Full Name <span className="text-rose-600">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={leaderName}
                          onChange={(e) => setLeaderName(e.target.value)}
                          placeholder="Full name"
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          Designation <span className="text-rose-600">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={leaderRole || (districtLeaderMode === 'जिल्हा अध्यक्ष' ? 'जिल्हाध्यक्ष' : 'जिल्हा सरचिटणीस')}
                          onChange={(e) => setLeaderRole(e.target.value)}
                          placeholder={districtLeaderMode === 'जिल्हा अध्यक्ष' ? 'District President' : 'District Secretary'}
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          Mobile
                        </label>
                        <input
                          type="text"
                          value={leaderPhone}
                          onChange={(e) => setLeaderPhone(e.target.value)}
                          placeholder="10-digit mobile"
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          Qualification / Cadre
                        </label>
                        <input
                          type="text"
                          value={leaderEducation}
                          onChange={(e) => setLeaderEducation(e.target.value)}
                          placeholder="e.g. M.A., B.Ed."
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-bold text-slate-700 text-xs">
                            Photo
                          </label>
                          {cloudinaryConfig.enabled && (
                            <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              Cloud Active
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
                              <span>Uploading photo...</span>
                            </div>
                          )}
                          {leaderPhoto && !isUploadingLeaderCloudinary && (
                            <div className="flex items-center gap-2 p-1.5 bg-slate-50 border border-slate-200 rounded">
                              <img src={leaderPhoto} alt="Preview" className="w-8 h-8 rounded object-cover" />
                              <span className="text-[10px] text-slate-600 truncate flex-1 font-mono">
                                Photo selected
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
                                Remove
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
                            placeholder="Or image URL..."
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
                            <span>Saving...</span>
                          </>
                        ) : (
                          <span>{editingLeaderId ? 'Save Changes' : 'Save Leader'}</span>
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
                          Cancel
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
                  <h3 className="text-lg sm:text-xl font-bold text-[#17366d] flex items-center gap-2 mb-1">
                    <Award className="w-5 h-5 text-amber-500" />
                    Master Studio
                  </h3>
                  <p className="text-xs text-slate-500 mb-6">
                    Manage official posts, portal passwords, and appointment letter templates.
                  </p>

                  <div className="space-y-8">
                    {/* Part 1: Post Management */}
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-base text-[#17366d]">
                            1. Post Management
                          </h4>
                          <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                            Total: {postsList.length}
                          </span>
                          {hasUnsavedPostChanges && (
                            <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              Unsaved changes
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleSaveAllPostsChanges}
                            disabled={isSavingPosts}
                            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer shadow-xs ${
                              hasUnsavedPostChanges
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-300'
                                : 'bg-[#17366d] hover:bg-[#0f2752] text-white'
                            } disabled:opacity-60`}
                            title="Save changes to database and sync with District Portal"
                          >
                            {isSavingPosts ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-4 h-4" />
                                Save Changes
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 mb-4">
                        Add, edit, reorder, or remove official posts. Click <strong>Save Changes</strong> to publish updates to the District Portal.
                      </p>
                      
                      <form onSubmit={(e) => {
                        e.preventDefault();
                        const form = e.currentTarget;
                        const nameInput = (form.elements.namedItem('newPostName') as HTMLInputElement)?.value?.trim();
                        const levelInput = ((form.elements.namedItem('newPostLevel') as HTMLSelectElement)?.value || 'district') as PostLevelType;
                        if (!nameInput) return;
                        const isTaluka = levelInput === 'taluka';
                        const updatedPosts: AppointedPostItem[] = [
                          ...postsList,
                          { name: nameInput, isTaluka, level: levelInput },
                        ];
                        setPostsList(updatedPosts);
                        setHasUnsavedPostChanges(true);
                        showAdminFeedback(`Added '${nameInput}'. Click Save Changes to apply.`, 'success');
                        form.reset();
                      }} className="flex flex-col sm:flex-row gap-3 items-end">
                        <div className="flex-1 w-full">
                          <label className="font-bold text-slate-700 text-xs block mb-1">Post Name:</label>
                          <input
                            type="text"
                            name="newPostName"
                            required
                            placeholder="Enter post title"
                            className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs"
                          />
                        </div>
                        <div className="w-full sm:w-48">
                          <label className="font-bold text-slate-700 text-xs block mb-1">Level:</label>
                          <select name="newPostLevel" className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800">
                            <option value="district">District</option>
                            <option value="taluka">Taluka</option>
                            <option value="state">State</option>
                            <option value="division">Division</option>
                            <option value="mahila">Women Wing</option>
                          </select>
                        </div>
                        <button type="submit" className="w-full sm:w-auto bg-[#df6b16] hover:bg-[#c2590d] text-white font-bold px-5 py-2.5 rounded-lg text-xs cursor-pointer flex items-center justify-center gap-1.5 shrink-0">
                          <PlusCircle className="w-4 h-4" />
                          Add Post
                        </button>
                      </form>

                      <div className="mt-5 space-y-2">
                        <div className="flex items-center justify-between">
                          <h5 className="font-bold text-xs text-slate-700">Posts ({postsList.length}):</h5>
                          {isLoadingPosts && <span className="text-[11px] text-blue-600 font-semibold flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Loading...</span>}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
                          {postsList.map((p, idx) => {
                            const isEditing = editingPostIndex === idx;

                            if (isEditing) {
                              return (
                                <div key={idx} className="p-3 bg-amber-50/90 border-2 border-amber-400 rounded-xl space-y-2 text-xs col-span-1 sm:col-span-2 shadow-sm">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-amber-900">Edit Post #{idx + 1}:</span>
                                  </div>
                                  <div className="flex flex-col sm:flex-row gap-2 items-center">
                                    <input
                                      type="text"
                                      value={editingPostName}
                                      onChange={(e) => setEditingPostName(e.target.value)}
                                      className="flex-1 w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                                      placeholder="Post name"
                                      autoFocus
                                    />
                                    <select
                                      value={editingPostLevel}
                                      onChange={(e) => setEditingPostLevel(e.target.value)}
                                      className="w-full sm:w-44 p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800"
                                    >
                                      <option value="district">District</option>
                                      <option value="taluka">Taluka</option>
                                      <option value="state">State</option>
                                      <option value="division">Division</option>
                                      <option value="mahila">Women Wing</option>
                                    </select>
                                    <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (!editingPostName.trim()) return;
                                          const lvl = (editingPostLevel || 'district') as PostLevelType;
                                          const arr = [...postsList];
                                          arr[idx] = {
                                            name: editingPostName.trim(),
                                            isTaluka: lvl === 'taluka',
                                            level: lvl,
                                          };
                                          setPostsList(arr);
                                          setEditingPostIndex(null);
                                          setHasUnsavedPostChanges(true);
                                          showAdminFeedback(`Updated '${editingPostName.trim()}'. Click Save Changes to persist.`, 'success');
                                        }}
                                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                                        title="Apply change"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                        Apply
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingPostIndex(null)}
                                        className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                                        title="Cancel"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div key={p.name + '_' + idx} className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs hover:border-slate-300 transition-colors">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-mono text-slate-400 font-bold">{idx + 1}.</span>
                                  <span className="font-bold text-[#17366d] truncate" title={p.name}>{p.name}</span>
                                  <span className="text-[10px] bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200 shrink-0 font-semibold">
                                    {getPostLevelLabel(p.name, p.level, p.isTaluka)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    aria-label={`Edit ${p.name}`}
                                    onClick={() => {
                                      setEditingPostIndex(idx);
                                      setEditingPostName(p.name);
                                      setEditingPostLevel(getPostLevel(p.name, p.level, p.isTaluka));
                                    }}
                                    className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md cursor-pointer transition-colors"
                                    title="Edit Name / Level"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Move ${p.name} up`}
                                    disabled={idx === 0}
                                    onClick={() => {
                                      const arr = [...postsList];
                                      const temp = arr[idx];
                                      arr[idx] = arr[idx - 1];
                                      arr[idx - 1] = temp;
                                      setPostsList(arr);
                                      setHasUnsavedPostChanges(true);
                                    }}
                                    className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-md text-slate-700 disabled:opacity-30 cursor-pointer text-xs font-bold transition-colors"
                                    title="Move Up"
                                  >
                                    ▲
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Move ${p.name} down`}
                                    disabled={idx === postsList.length - 1}
                                    onClick={() => {
                                      const arr = [...postsList];
                                      const temp = arr[idx];
                                      arr[idx] = arr[idx + 1];
                                      arr[idx + 1] = temp;
                                      setPostsList(arr);
                                      setHasUnsavedPostChanges(true);
                                    }}
                                    className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-md text-slate-700 disabled:opacity-30 cursor-pointer text-xs font-bold transition-colors"
                                    title="Move Down"
                                  >
                                    ▼
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Delete ${p.name}`}
                                    onClick={() => {
                                      if (postsList.length <= 1) {
                                        showAdminFeedback('At least one post is required.', 'error');
                                        return;
                                      }
                                      const arr = postsList.filter((_, i) => i !== idx);
                                      setPostsList(arr);
                                      setHasUnsavedPostChanges(true);
                                      showAdminFeedback(`Removed '${p.name}'. Click Save Changes to persist.`, 'success');
                                    }}
                                    className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-md cursor-pointer transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Part 2: District Password Reset */}
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
                      <div>
                        <h4 className="font-bold text-base text-[#17366d] flex items-center gap-2">
                          <KeyRound className="w-4 h-4 text-amber-600" />
                          2. District Password Reset (Default: AD2026)
                        </h4>
                        <p className="text-xs text-slate-600 mt-1">
                          Resetting restores the default password <strong>'{DEFAULT_DISTRICT_PASSWORD}'</strong>. On next login, the District President sets a new password.
                        </p>
                      </div>

                      {/* Quick Reset Box */}
                      <div className="p-4 bg-white border border-slate-300 rounded-xl space-y-3 shadow-2xs">
                        <div className="text-xs font-bold text-slate-800">
                          Quick Reset to AD2026:
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                          <div className="sm:col-span-1">
                            <label className="font-bold text-slate-700 text-xs block mb-1">District:</label>
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
                                {isResettingDistrictPassword ? 'Resetting...' : `Reset '${selectedDistrictForReset}' to AD2026`}
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
                            showAdminFeedback('Password must be at least 4 characters.', 'error');
                            return;
                          }
                          setIsResettingDistrictPassword(true);
                          try {
                            await updateDistrictPasswordInRtdb(dist, pwd);
                            setDistrictPasswords((prev) => ({ ...prev, [dist]: pwd }));
                            window.dispatchEvent(new Event('mahasangh_district_passwords_updated'));
                            showAdminFeedback(`New password saved for '${dist}'.`, 'success');
                            setCustomResetPassword('');
                          } catch (err: any) {
                            showAdminFeedback('Error: ' + err.message, 'error');
                          } finally {
                            setIsResettingDistrictPassword(false);
                          }
                        }} className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row gap-2 items-end">
                          <div className="flex-1 w-full">
                            <label className="text-[11px] text-slate-600 block mb-1">
                              Or set a custom password (Optional):
                            </label>
                            <input
                              type="text"
                              value={customResetPassword}
                              onChange={(e) => setCustomResetPassword(e.target.value)}
                              placeholder={`Custom password for '${selectedDistrictForReset}' (min 4 chars)`}
                              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={isResettingDistrictPassword || !customResetPassword.trim()}
                            className="bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white font-bold px-4 py-2 rounded-lg text-xs cursor-pointer"
                          >
                            Save Password
                          </button>
                        </form>
                      </div>

                      {/* Complete 36 Districts Interactive Table & Status */}
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h5 className="font-bold text-xs text-slate-800">
                            All 36 Districts — Password Status:
                          </h5>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Search district..."
                              value={districtSearchFilter}
                              onChange={(e) => setDistrictSearchFilter(e.target.value)}
                              className="p-1.5 bg-white border border-slate-300 rounded-lg text-xs w-36 sm:w-48"
                            />
                            <button
                              type="button"
                              onClick={() => loadAllDistrictPasswords(true)}
                              disabled={isLoadingDistrictPasswords}
                              className="p-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-slate-700 text-xs flex items-center gap-1 cursor-pointer"
                              title="Refresh status"
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
                                          Default (AD2026)
                                        </span>
                                      ) : (
                                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                          Custom Active
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={isResettingDistrictPassword}
                                    onClick={() => handleResetDistrictToAD2026(dist)}
                                    className="shrink-0 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                                    title="Reset password to AD2026"
                                  >
                                    <RotateCcw className="w-3 h-3 text-rose-600" />
                                    <span>Reset</span>
                                  </button>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </div>

                    {/* Part 3: State President Password Reset */}
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
                      <div>
                        <h4 className="font-bold text-base text-[#17366d] flex items-center gap-2">
                          <Award className="w-4 h-4 text-amber-600" />
                          State President Password Reset (Default: RK2026)
                        </h4>
                        <p className="text-xs text-slate-600 mt-1">
                          Resets the State President login password back to <strong>'RK2026'</strong>.
                        </p>
                      </div>

                      <div className="p-4 bg-white border border-slate-300 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
                        <div>
                          <span className="text-xs font-bold text-slate-800">
                            Reset State President password to 'RK2026':
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={isResettingPresidentPassword}
                          onClick={async () => {
                            setIsResettingPresidentPassword(true);
                            try {
                              await updatePresidentPasswordInFirebase('RK2026');
                              showAdminFeedback('State President password reset to "RK2026".', 'success');
                            } catch (err: any) {
                              showAdminFeedback('Error: ' + (err.message || 'Reset failed'), 'error');
                            } finally {
                              setIsResettingPresidentPassword(false);
                            }
                          }}
                          className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors shrink-0"
                        >
                          <RotateCcw className={`w-3.5 h-3.5 ${isResettingPresidentPassword ? 'animate-spin' : ''}`} />
                          <span>{isResettingPresidentPassword ? 'Resetting...' : 'Reset to RK2026'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Part 4: Letter Studio (Appointment Letter Design & Customization Studio) */}
                    <div className="bg-white p-5 sm:p-6 rounded-xl border border-amber-300 shadow-sm space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                        <div>
                          <h4 className="font-bold text-base sm:text-lg text-[#17366d] flex items-center gap-2">
                            <Award className="w-5 h-5 text-amber-600" />
                            3. Appointment Letter Studio
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Customize letter elements, background, signatures, text, and font size.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleDownloadLetterPdfAction}
                          disabled={isDownloadingLetterPdf}
                          className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                        >
                          <Download className="w-4 h-4" />
                          <span>{isDownloadingLetterPdf ? 'Generating PDF...' : 'Download Sample PDF'}</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        {/* Left: Controls & Customization Form */}
                        <div className="space-y-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200 max-h-[75vh] overflow-y-auto">
                          {/* 1. Element Visibility */}
                          <div className="space-y-2">
                            <h5 className="font-bold text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                              <Eye className="w-3.5 h-3.5 text-[#17366d]" />
                              <span>Element Visibility</span>
                            </h5>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="flex items-center gap-1.5 p-2 bg-white rounded border border-slate-200 cursor-pointer font-medium text-slate-700">
                                <input type="checkbox" checked={showLetterHeader} onChange={(e) => setShowLetterHeader(e.target.checked)} className="rounded text-[#df6b16]" />
                                <span>Header Banner</span>
                              </label>
                              <label className="flex items-center gap-1.5 p-2 bg-white rounded border border-slate-200 cursor-pointer font-medium text-slate-700">
                                <input type="checkbox" checked={showOutward} onChange={(e) => setShowOutward(e.target.checked)} className="rounded text-[#df6b16]" />
                                <span>Outward No. & Date</span>
                              </label>
                              <label className="flex items-center gap-1.5 p-2 bg-white rounded border border-slate-200 cursor-pointer font-medium text-slate-700">
                                <input type="checkbox" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} className="rounded text-[#df6b16]" />
                                <span>Letter Title</span>
                              </label>
                              <label className="flex items-center gap-1.5 p-2 bg-white rounded border border-slate-200 cursor-pointer font-medium text-slate-700">
                                <input type="checkbox" checked={showRecipient} onChange={(e) => setShowRecipient(e.target.checked)} className="rounded text-[#df6b16]" />
                                <span>Recipient Block</span>
                              </label>
                              <label className="flex items-center gap-1.5 p-2 bg-white rounded border border-slate-200 cursor-pointer font-medium text-slate-700">
                                <input type="checkbox" checked={showSubject} onChange={(e) => setShowSubject(e.target.checked)} className="rounded text-[#df6b16]" />
                                <span>Subject Line</span>
                              </label>
                              <label className="flex items-center gap-1.5 p-2 bg-white rounded border border-slate-200 cursor-pointer font-medium text-slate-700">
                                <input type="checkbox" checked={showBody} onChange={(e) => setShowBody(e.target.checked)} className="rounded text-[#df6b16]" />
                                <span>Main Body (1 & 2)</span>
                              </label>
                              <label className="flex items-center gap-1.5 p-2 bg-white rounded border border-slate-200 cursor-pointer font-medium text-slate-700">
                                <input type="checkbox" checked={showCallout} onChange={(e) => setShowCallout(e.target.checked)} className="rounded text-[#df6b16]" />
                                <span>Post Callout Banner</span>
                              </label>
                              <label className="flex items-center gap-1.5 p-2 bg-white rounded border border-slate-200 cursor-pointer font-medium text-slate-700">
                                <input type="checkbox" checked={showPara3} onChange={(e) => setShowPara3(e.target.checked)} className="rounded text-[#df6b16]" />
                                <span>Closing Paragraph</span>
                              </label>
                              <label className="flex items-center gap-1.5 p-2 bg-white rounded border border-slate-200 cursor-pointer font-medium text-slate-700">
                                <input type="checkbox" checked={showSign1} onChange={(e) => setShowSign1(e.target.checked)} className="rounded text-[#df6b16]" />
                                <span>Signature 1 (Secretary)</span>
                              </label>
                              <label className="flex items-center gap-1.5 p-2 bg-white rounded border border-slate-200 cursor-pointer font-medium text-slate-700">
                                <input type="checkbox" checked={showSign2} onChange={(e) => setShowSign2(e.target.checked)} className="rounded text-[#df6b16]" />
                                <span>Signature 2 (President)</span>
                              </label>
                            </div>
                          </div>

                          {/* 2. Background & Custom Images */}
                          <div className="space-y-2 pt-2 border-t border-slate-200">
                            <h5 className="font-bold text-slate-800 flex items-center gap-1.5">
                              <ImageIcon className="w-3.5 h-3.5 text-[#17366d]" />
                              <span>Background & Images</span>
                            </h5>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="text-[11px] font-bold text-slate-600 block mb-1">A4 Background:</label>
                                <input type="file" accept="image/*" onChange={handleBgUpload} className="w-full p-1.5 bg-white border border-slate-300 rounded text-[11px]" />
                              </div>
                              <div>
                                <label className="text-[11px] font-bold text-slate-600 block mb-1">Custom Image:</label>
                                <input type="file" accept="image/*" onChange={handleCustomImgUpload} className="w-full p-1.5 bg-white border border-slate-300 rounded text-[11px]" />
                              </div>
                            </div>
                          </div>

                          {/* 3. Signature Customization */}
                          <div className="space-y-2 pt-2 border-t border-slate-200">
                            <h5 className="font-bold text-slate-800">Signatures & Designations</h5>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="text-[11px] font-bold text-slate-600 block mb-1">Signature 1 Name:</label>
                                <input type="text" value={letterSign1Name} onChange={(e) => setLetterSign1Name(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded text-xs" />
                              </div>
                              <div>
                                <label className="text-[11px] font-bold text-slate-600 block mb-1">Signature 2 Name:</label>
                                <input type="text" value={letterSign2Name} onChange={(e) => setLetterSign2Name(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded text-xs" />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="text-[11px] font-bold text-slate-600 block mb-1">Signature 1 Role:</label>
                                <textarea rows={2} value={letterSign1Role} onChange={(e) => setLetterSign1Role(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded text-xs" />
                              </div>
                              <div>
                                <label className="text-[11px] font-bold text-slate-600 block mb-1">Signature 2 Role:</label>
                                <textarea rows={2} value={letterSign2Role} onChange={(e) => setLetterSign2Role(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded text-xs" />
                              </div>
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">President Signature Stamp (PNG):</label>
                              <input type="file" accept="image/*" onChange={handleSignImgUpload} className="w-full p-1.5 bg-white border border-slate-300 rounded text-[11px]" />
                            </div>
                          </div>

                          {/* 4. Typography & Spacing */}
                          <div className="space-y-2 pt-2 border-t border-slate-200">
                            <h5 className="font-bold text-slate-800">Typography & Spacing</h5>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-[10px] font-bold text-slate-600 block">Font Size ({letterFontSize}px)</label>
                                <input type="range" min="12" max="20" value={letterFontSize} onChange={(e) => setLetterFontSize(Number(e.target.value))} className="w-full accent-[#df6b16]" />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-slate-600 block">Line Height ({letterLineHeight})</label>
                                <input type="range" min="1.3" max="2.0" step="0.05" value={letterLineHeight} onChange={(e) => setLetterLineHeight(Number(e.target.value))} className="w-full accent-[#df6b16]" />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-slate-600 block">Text Color</label>
                                <input type="color" value={letterTextColor} onChange={(e) => setLetterTextColor(e.target.value)} className="w-full h-7 rounded border border-slate-300 cursor-pointer p-0.5 bg-white" />
                              </div>
                            </div>
                          </div>

                          {/* 5. Letter Text Editing */}
                          <div className="space-y-2 pt-2 border-t border-slate-200">
                            <h5 className="font-bold text-slate-800">Letter Content</h5>
                            <div>
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">Subject:</label>
                              <input type="text" value={letterSubjectText} onChange={(e) => setLetterSubjectText(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded text-xs font-bold" />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">Paragraph 1:</label>
                              <textarea rows={3} value={letterPara1Text} onChange={(e) => setLetterPara1Text(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded text-xs" />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">Paragraph 2:</label>
                              <textarea rows={3} value={letterPara2Text} onChange={(e) => setLetterPara2Text(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded text-xs" />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">Paragraph 3 (Closing):</label>
                              <textarea rows={3} value={letterPara3Text} onChange={(e) => setLetterPara3Text(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded text-xs" />
                            </div>
                          </div>
                        </div>

                        {/* Right: Live A4 Preview Canvas */}
                        <div className="bg-slate-200 p-3 rounded-xl flex flex-col items-center overflow-x-auto">
                          <div className="text-[11px] font-bold text-slate-600 mb-2">
                            Live A4 Preview
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
                      <span>{editingNewsItem ? 'Edit News' : 'Add News / GR'}</span>
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
                      <span>All News ({newsList.length})</span>
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
                      Cancel Edit
                    </button>
                  )}
                </div>

                {newsCreatedSuccess && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 shadow-xs">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span className="font-semibold">
                      {editingNewsItem
                        ? 'Changes saved and updated on the website.'
                        : 'Published successfully on the website.'}
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
                        <h3 className="text-lg sm:text-xl font-bold text-[#17366d] flex items-center gap-2">
                          <PlusCircle className="w-5 h-5 text-[#df6b16]" />
                          {editingNewsItem ? 'Edit News / Circular' : 'Publish News / Circular'}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Add headline, image, and content to publish directly to the website.
                        </p>
                      </div>

                      {editingNewsItem && (
                        <button
                          type="button"
                          onClick={handleCancelEditNews}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 transition-colors self-start"
                        >
                          Cancel Edit
                        </button>
                      )}
                    </div>

                    {editingNewsItem && (
                      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center justify-between">
                        <div>
                          <strong>Editing:</strong> {editingNewsItem.title}
                          <span className="ml-2 text-[11px] text-amber-700">({editingNewsItem.date})</span>
                        </div>
                      </div>
                    )}

                    <form onSubmit={handleCreateNews} className="space-y-4 text-xs">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          Title <span className="text-rose-600">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Enter news or circular title"
                          value={newsTitle}
                          onChange={(e) => setNewsTitle(e.target.value)}
                          className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16] text-sm"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="font-bold text-slate-700 block mb-1 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-[#df6b16]" />
                            <span>Publish Date</span> <span className="text-rose-600">*</span>
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
                            Category <span className="text-rose-600">*</span>
                          </label>
                          <select
                            value={newsCategory}
                            onChange={(e) => setNewsCategory(e.target.value)}
                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                          >
                            <option value="अधिकृत घोषणा">Official Announcement</option>
                            <option value="अधिकृत वृत्त">Official News</option>
                            <option value="संघटना वृत्त">Union News</option>
                            <option value="अभिनंदन">Congratulations</option>
                            <option value="शासन निर्णय (GR)">Gov Resolution (GR)</option>
                            <option value="बैठक अहवाल">Meeting Report</option>
                            <option value="जिल्हा वृत्त">District News</option>
                            <option value="अधिकृत छायाचित्र / परिपत्रक">Photo / Circular</option>
                          </select>
                        </div>

                        <div>
                          <label className="font-bold text-slate-700 block mb-1">
                            Photo Upload
                          </label>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#09243f] hover:bg-[#17366d] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors">
                                <Upload className="w-3.5 h-3.5 text-[#df6b16]" />
                                <span>
                                  {isUploadingNewsCloudinary
                                    ? 'Uploading...'
                                    : isCompressingNewsImg
                                    ? 'Processing...'
                                    : 'Upload Photo'}
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
                                  Remove
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
                              Photo attached
                            </span>
                            <p className="text-[10px] text-slate-500 truncate mt-0.5 font-mono">
                              {newsImageUrl}
                            </p>
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          Summary <span className="text-rose-600">*</span>
                        </label>
                        <textarea
                          required
                          rows={2}
                          placeholder="Short 2-3 line summary"
                          value={newsSummary}
                          onChange={(e) => setNewsSummary(e.target.value)}
                          className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          Content <span className="text-rose-600">*</span>
                        </label>
                        <textarea
                          required
                          rows={6}
                          placeholder="Full article or circular details"
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
                          <span>Live Preview</span>
                        </button>

                        <button
                          type="submit"
                          className="bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold py-2.5 px-6 rounded-lg text-xs transition-colors shadow-xs flex items-center gap-1.5"
                        >
                          <Check className="w-4 h-4" />
                          <span>{editingNewsItem ? 'Update' : 'Publish'}</span>
                        </button>

                        {editingNewsItem && (
                          <button
                            type="button"
                            onClick={handleCancelEditNews}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-2.5 px-4 rounded-lg text-xs"
                          >
                            Cancel
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
                        <h3 className="text-lg sm:text-xl font-bold text-[#17366d] flex items-center gap-2">
                          <FileText className="w-5 h-5 text-[#df6b16]" />
                          Published News & Circulars ({newsList.length})
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          View, edit, or delete published entries.
                        </p>
                      </div>

                      {/* Search */}
                      <div className="relative w-full sm:w-64">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search title or category..."
                          value={newsSearchQuery}
                          onChange={(e) => setNewsSearchQuery(e.target.value)}
                          className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>
                    </div>

                    {newsList.length === 0 ? (
                      <div className="text-center py-12 text-slate-500 text-xs">
                        No news published yet.
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
                                          Photo Only
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
                                    <span>Preview</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleStartEditNews(item)}
                                    className="px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-800 font-semibold rounded border border-amber-300 flex items-center gap-1 transition-colors"
                                  >
                                    <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                                    <span>Edit</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteNewsItem(item)}
                                    className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-700 font-semibold rounded border border-rose-300 flex items-center gap-1 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                    <span>Delete</span>
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
                            Live Preview
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
                                Website Header Image Preview
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#e8eef7] text-[#17366d]">
                            {previewNewsItem.category}
                          </span>
                          <span className="text-xs text-slate-500">
                            Date: {previewNewsItem.date}
                          </span>
                        </div>

                        <h2 className="text-lg sm:text-2xl font-bold text-[#09243f] leading-snug">
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
                            Photo-only post. Visitors can click to view the full-size image.
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
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sub-tab: Latest Banners Management */}
            {activeAdminSubTab === 'latest_banners' && (currentUser?.isSuperAdmin || currentUser?.permissions.manageLatestBanners) && (
              <div className="space-y-6">
                <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-xs max-w-3xl">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <h3 className="text-lg sm:text-xl font-bold text-[#17366d] flex items-center gap-2">
                      <ImageIcon className="w-5 h-5 text-[#df6b16]" />
                      {editingBannerId ? 'Edit Banner' : 'Add Banner / Highlight'}
                    </h3>
                    {editingBannerId && (
                      <button
                        type="button"
                        onClick={handleCancelEditBanner}
                        className="text-xs font-bold text-rose-600 hover:bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mb-5">
                    Featured banners and short videos appear at the top of the home page.
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
                        Media Type
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
                          <span>Photo</span>
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
                          <span>Short Video (Max 3 MB)</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        Title <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Enter banner title"
                        value={bannerTitle}
                        onChange={(e) => setBannerTitle(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#17366d]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Date</label>
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
                            Image (Upload / URL) <span className="text-rose-600">*</span>
                          </label>
                          <div className="flex gap-2 items-center">
                            <input
                              type="text"
                              required
                              placeholder="https://... or upload file"
                              value={bannerImageUrl}
                              onChange={(e) => setBannerImageUrl(e.target.value)}
                              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#17366d]"
                            />
                            <label className={`shrink-0 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors ${isUploadingBanner ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}>
                              <Upload className="w-4 h-4" />
                              <span>{isUploadingBanner ? 'Uploading...' : 'Upload'}</span>
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
                              Short Video <span className="text-rose-600">*</span>
                            </label>
                            <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                              Max 3 MB
                            </span>
                          </div>
                          <div className="flex gap-2 items-center">
                            <input
                              type="text"
                              required
                              placeholder="https://... or upload video"
                              value={bannerVideoUrl}
                              onChange={(e) => {
                                setBannerVideoUrl(e.target.value);
                                if (!bannerImageUrl) setBannerImageUrl(e.target.value);
                              }}
                              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#17366d] font-mono text-xs"
                            />
                            <label className={`shrink-0 bg-rose-700 hover:bg-rose-800 text-white px-3.5 py-2.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors ${isUploadingBannerVideo ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}>
                              <Upload className="w-4 h-4" />
                              <span>{isUploadingBannerVideo ? 'Uploading...' : 'Upload Video'}</span>
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
                            Image attached
                          </span>
                        </div>
                      </div>
                    )}

                    {bannerMediaType === 'video' && bannerVideoUrl && (
                      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4" />
                            Video uploaded (Cloudinary CDN)
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Plays inline on home page
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
                      <label className="font-bold text-slate-700 block mb-1">Summary</label>
                      <textarea
                        rows={3}
                        placeholder="Short banner description..."
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
                            ? 'Saving...'
                            : editingBannerId
                            ? 'Save Changes'
                            : bannerMediaType === 'video'
                            ? 'Publish Video'
                            : 'Publish Banner'}
                        </span>
                      </button>
                      {editingBannerId && (
                        <button
                          type="button"
                          onClick={handleCancelEditBanner}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-3 rounded-xl text-xs transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>
                </div>

                {/* Existing Banners List */}
                <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <h4 className="text-base font-bold text-[#17366d]">
                      Published Banners ({latestBanners.length})
                    </h4>
                    {onRefreshLatestBanners && (
                      <button
                        type="button"
                        onClick={handleRefreshBannersClick}
                        disabled={isRefreshingBanners}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingBanners ? 'animate-spin' : ''}`} />
                        <span>{isRefreshingBanners ? 'Refreshing...' : 'Refresh'}</span>
                      </button>
                    )}
                  </div>

                  {latestBanners.length === 0 ? (
                    <div className="text-slate-500 text-xs p-6 bg-slate-50 rounded-xl text-center">
                      No banners published yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {latestBanners.map((banner) => (
                        <div key={banner.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3.5 min-w-0">
                            {banner.mediaType === 'video' || banner.videoUrl ? (
                              <div className="w-16 h-12 bg-slate-900 rounded flex flex-col items-center justify-center text-rose-400 shrink-0 border border-slate-700">
                                <Video className="w-5 h-5 text-rose-400" />
                                <span className="text-[9px] font-bold text-white mt-0.5">Video</span>
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
                                  Date: {banner.date}
                                </span>
                                {(banner.mediaType === 'video' || banner.videoUrl) && (
                                  <span className="text-[10px] font-bold text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded">
                                    Video
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
                              title="Edit Banner"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={deletingBannerId === banner.id}
                              onClick={() => handleDeleteBannerWithFeedback(banner.id)}
                              className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                              title="Delete Banner"
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

            {/* Sub-tab: Print ID Cards Batch (Super Admin Only) */}
            {activeAdminSubTab === 'print_id_cards' && currentUser?.isSuperAdmin && (
              <div className="space-y-6 max-w-3xl mx-auto">
                <div className="bg-white p-6 sm:p-8 rounded-2xl border border-amber-300 shadow-md space-y-5">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                    <div>
                      <h3 className="text-lg sm:text-xl font-bold text-[#17366d] flex items-center gap-2">
                        <Award className="w-5 h-5 text-amber-600" />
                        Batch Print ID Cards
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Select a district to download high-resolution print-ready ID cards for all approved members in one PDF.
                      </p>
                    </div>
                  </div>

                  <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                    <div>
                      <label className="font-bold text-slate-700 text-xs block mb-1.5">Select District</label>
                      <select
                        value={batchPrintDistrict}
                        onChange={(e) => setBatchPrintDistrict(e.target.value)}
                        className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm font-bold text-[#0b1e33]"
                      >
                        {MAHARASHTRA_DISTRICTS.map((d) => {
                          const count = applications.filter((m) => m.status === 'approved' && m.district === d).length;
                          return (
                            <option key={d} value={d}>
                              {d} ({count} Approved)
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div>
                        <strong>District:</strong> {batchPrintDistrict} <br />
                        <span className="text-slate-600">
                          Approved Members:{' '}
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
                          {isGeneratingBatchPrint ? batchPrintProgressMsg || 'Generating PDF...' : `Download ${batchPrintDistrict} PDF`}
                        </span>
                      </button>
                    </div>

                    {isGeneratingBatchPrint && (
                      <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-900 flex items-center gap-2 animate-pulse">
                        <RefreshCw className="w-4 h-4 animate-spin text-sky-600 shrink-0" />
                        <span>{batchPrintProgressMsg || 'Generating high-resolution ID cards...'}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Sub-tab: Passport Photos ZIP Download (Super Admin Only) */}
            {activeAdminSubTab === 'passport_photo' && currentUser?.isSuperAdmin && (
              <div className="space-y-6 max-w-4xl mx-auto">
                <div className="bg-white p-6 sm:p-8 rounded-2xl border border-amber-300 shadow-md space-y-5">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                    <div>
                      <h3 className="text-lg sm:text-xl font-bold text-[#17366d] flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-amber-600" />
                        <span>Passport Photo ZIP Export</span>
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-600 mt-1">
                        Select districts to download approved member photos in <strong className="text-amber-700">.jpg</strong> format inside a ZIP file.
                      </p>
                    </div>
                  </div>

                  {/* Select All / Deselect All Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="text-xs sm:text-sm font-bold text-slate-700">
                      Selected Districts: <span className="text-[#17366d] font-mono">{passportPhotoDistricts.length}</span> / {MAHARASHTRA_DISTRICTS.length}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPassportPhotoDistricts([...MAHARASHTRA_DISTRICTS])}
                        className="px-3 py-1.5 bg-[#17366d] hover:bg-[#11254a] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setPassportPhotoDistricts([])}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  {/* Districts Checkbox Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[360px] overflow-y-auto p-2 bg-slate-50/50 rounded-xl border border-slate-200">
                    {MAHARASHTRA_DISTRICTS.map((dist) => {
                      const isChecked = passportPhotoDistricts.includes(dist);
                      const photoCount = applications.filter(
                        (m) => m.status === 'approved' && m.photo && m.district === dist
                      ).length;

                      return (
                        <label
                          key={dist}
                          className={`flex items-center justify-between p-2.5 rounded-lg border text-xs sm:text-sm cursor-pointer transition-all ${
                            isChecked
                              ? 'bg-amber-50/70 border-amber-400 font-bold text-[#0b1e33]'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setPassportPhotoDistricts((prev) => [...prev, dist]);
                                } else {
                                  setPassportPhotoDistricts((prev) => prev.filter((d) => d !== dist));
                                }
                              }}
                              className="rounded text-[#17366d] focus:ring-[#17366d] cursor-pointer"
                            />
                            <span className="truncate">{dist}</span>
                          </div>
                          <span className="font-mono text-[11px] text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                            {toEnglishDigits(String(photoCount))}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {/* Summary & Download Action */}
                  <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <strong className="text-amber-900 text-sm sm:text-base block">ZIP Export Summary</strong>
                        <span className="text-xs sm:text-sm text-slate-700">
                          Approved members with photos:{' '}
                          <strong className="font-mono text-[#17366d] text-base">
                            {toEnglishDigits(
                              String(
                                applications.filter(
                                  (m) =>
                                    m.status === 'approved' &&
                                    m.photo &&
                                    passportPhotoDistricts.includes(m.district || '')
                                ).length
                              )
                            )}
                          </strong>
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={handleDownloadPassportPhotosZip}
                        disabled={isGeneratingPassportZip || passportPhotoDistricts.length === 0}
                        className="bg-[#df6b16] hover:bg-[#c2590d] disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl text-sm sm:text-base flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer shrink-0"
                      >
                        <Download className={`w-5 h-5 ${isGeneratingPassportZip ? 'animate-spin' : ''}`} />
                        <span>{isGeneratingPassportZip ? 'Creating ZIP...' : 'Download Photo ZIP (.jpg)'}</span>
                      </button>
                    </div>

                    {passportZipProgressMsg && (
                      <div className="p-3 bg-white border border-amber-300 rounded-lg text-xs sm:text-sm font-bold text-[#17366d] animate-pulse">
                        {passportZipProgressMsg}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Sub-tab: ID Card Sample Preview */}
            {activeAdminSubTab === 'id_card_preview' && (currentUser?.isSuperAdmin || currentUser?.permissions.viewIdCardPreview) && (
              <div className="space-y-6 max-w-3xl mx-auto">
                <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-md space-y-4">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                    <div>
                      <h3 className="text-lg sm:text-xl font-bold text-[#17366d] flex items-center gap-2">
                        <Award className="w-5 h-5 text-[#df6b16]" />
                        ID Card Design & Print Quality Preview
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Official active CR80 print-ready membership ID card template (1016 DPI).
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
                      Active across registration, email, and status portal. Download a sample PDF to verify print clarity.
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
                        <span>Download Sample PDF</span>
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
                <h3 className="text-lg sm:text-xl font-bold text-[#17366d] mb-5">
                  Upload GR / Order
                </h3>
                {goCreatedSuccess && (
                  <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2 shadow-xs">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span className="font-semibold">GR / Order published successfully.</span>
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
                    <label className="font-bold text-slate-700 block mb-1">Title</label>
                    <input type="text" value={goTitle} onChange={e => setGoTitle(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#10b981]" />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Type</label>
                    <select value={goType} onChange={e => setGoType(e.target.value as any)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#10b981]">
                       <option value="शासन निर्णय">Government Resolution (GR)</option>
                       <option value="न्यायालयीन आदेश">Court Order</option>
                       <option value="परिपत्रक">Circular</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Publish Date</label>
                    <input type="date" value={goDate} onChange={e => setGoDate(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#10b981]" />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Upload File (Image Only)</label>
                    <input type="file" onChange={handleGoFileUpload} className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#10b981]" />
                    {goFileUrl && <div className="text-emerald-700 font-bold mt-2">File ready</div>}
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Google Drive Link (PDF)</label>
                    <input type="url" value={goDriveUrl} onChange={e => setGoDriveUrl(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#10b981]" placeholder="https://drive.google.com/..." />
                  </div>
                  <button type="submit" disabled={isUploadingGoFile} className="bg-[#10b981] text-white font-bold py-2.5 px-6 rounded-lg text-xs disabled:opacity-50">
                    {isUploadingGoFile ? 'Uploading...' : 'Publish'}
                  </button>
                </form>
              </div>

              <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-xs">
                <h3 className="text-lg font-bold text-[#17366d] mb-4">
                  Published GR & Orders
                </h3>
                <div className="space-y-3">
                  {govOrders.map(go => (
                      <div key={go.id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                          <div>
                              <div className="font-bold text-[#17366d]">{go.title}</div>
                              <div className="text-xs text-slate-500">{go.type} · {go.date}</div>
                          </div>
                          <button onClick={() => handleDeleteGovOrder(go.id)} className="p-2 text-rose-600 hover:bg-rose-50 rounded" title="Delete">
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
                      <h3 className="text-lg sm:text-xl font-bold text-[#17366d] flex items-center gap-2">
                        <Shield className="w-5 h-5 text-[#df6b16]" />
                        Sub-Admins & Permissions
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Assign or update module access permissions for sub-administrators.
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
                      Add Sub-Admin
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          Email ID <span className="text-rose-600">*</span>
                        </label>
                        <input
                          type="email"
                          required
                          value={newAdminEmail}
                          onChange={(e) => setNewAdminEmail(e.target.value)}
                          placeholder="e.g. admin.nashik@gmail.com"
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          Name / Role
                        </label>
                        <input
                          type="text"
                          value={newAdminName}
                          onChange={(e) => setNewAdminName(e.target.value)}
                          placeholder="e.g. Suresh Shinde (District President)"
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                        />
                      </div>
                    </div>

                    {/* Permissions Checkboxes - All Admin Sub-Menus & Facilities */}
                    <div className="pt-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                        <label className="font-bold text-slate-800 block">
                          Permissions ({toEnglishDigits(ADMIN_PERMISSION_OPTIONS.length)} modules): <span className="text-rose-600">*</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setNewAdminPermissions({ ...ALL_ADMIN_PERMISSIONS_TRUE })}
                            className="text-[11px] font-bold text-[#17366d] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded transition-colors"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewAdminPermissions({ ...ALL_ADMIN_PERMISSIONS_FALSE })}
                            className="text-[11px] font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded transition-colors"
                          >
                            Clear All
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
                      <strong>Note:</strong> No initial password required. Sub-admins create their own password on first login.
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmittingAdmin}
                      className="bg-[#df6b16] hover:bg-[#c85c0e] disabled:opacity-50 text-white font-bold py-2.5 px-6 rounded-lg text-xs shadow-xs transition-colors flex items-center gap-1.5"
                    >
                      <UserPlus className="w-4 h-4" />
                      {isSubmittingAdmin ? 'Adding...' : 'Add Sub-Admin'}
                    </button>
                  </form>
                </div>

                {/* Sub-Admins List Table */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
                  <h4 className="text-base font-bold text-[#17366d] mb-4 pb-2 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <span>Active Sub-Admins ({toEnglishDigits(adminUsersList.length)})</span>
                    <span className="text-[11px] font-sans font-normal text-slate-500">
                      Super Admin: {DEFAULT_ADMIN_EMAIL} (Full Access)
                    </span>
                  </h4>

                  {adminUsersList.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      No sub-admins added yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                        <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-3 w-12 text-center">#</th>
                            <th className="p-3">Email & Name</th>
                            <th className="p-3">Permissions</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-center">Actions</th>
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
                                        <span className="text-slate-400 text-[10px]">No permissions</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-3">
                                    {subAdmin.isFirstLogin || (!subAdmin.hasPassword && !subAdmin.password) ? (
                                      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-bold">
                                        Pending Setup
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-bold">
                                        <Check className="w-3 h-3 text-emerald-600" />
                                        Active
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
                                        Close
                                      </button>
                                    ) : (
                                      <div className="inline-flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => handleStartEditPermissions(subAdmin)}
                                          className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2.5 py-1 rounded text-[11px] font-bold transition-colors inline-flex items-center gap-1"
                                          title="Edit Permissions"
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                          <span>Edit Access</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleResetSubAdmin(subAdmin.id, subAdmin.email)}
                                          className="text-amber-600 hover:text-amber-800 hover:bg-amber-50 p-1.5 rounded transition-colors inline-flex items-center"
                                          title="Reset Password"
                                        >
                                          <RotateCcw className="w-4 h-4" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteAdmin(subAdmin.id, subAdmin.email)}
                                          className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 p-1.5 rounded transition-colors inline-flex items-center"
                                          title="Remove Sub-Admin"
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
                                              Edit Permissions — {subAdmin.email}
                                            </h5>
                                            <p className="text-[11px] text-slate-500">
                                              Toggle allowed modules and click Save Permissions.
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => setEditingPermissions({ ...ALL_ADMIN_PERMISSIONS_TRUE })}
                                              className="text-[11px] font-bold text-[#17366d] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded transition-colors"
                                            >
                                              Select All
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setEditingPermissions({ ...ALL_ADMIN_PERMISSIONS_FALSE })}
                                              className="text-[11px] font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded transition-colors"
                                            >
                                              Clear All
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
                                            Cancel
                                          </button>
                                          <button
                                            type="button"
                                            disabled={isUpdatingAdminPerms}
                                            onClick={() => handleSaveAdminPermissions(subAdmin)}
                                            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors"
                                          >
                                            <Check className="w-4 h-4" />
                                            <span>{isUpdatingAdminPerms ? 'Saving...' : 'Save Permissions'}</span>
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
                <h3 className="text-lg font-bold text-[#17366d] mb-2 pb-2 border-b border-slate-100 flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-[#df6b16]" />
                  Change Password
                </h3>
                <p className="text-xs text-slate-500 mb-5">
                  Update your admin account password anytime.
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
                      Current Password
                    </label>
                    <input
                      type="password"
                      required
                      value={currentPassInput}
                      onChange={(e) => setCurrentPassInput(e.target.value)}
                      placeholder="Enter current password"
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      New Password
                    </label>
                    <input
                      type="password"
                      required
                      value={newPassInput}
                      onChange={(e) => setNewPassInput(e.target.value)}
                      placeholder="Min 4 characters"
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmPassInput}
                      onChange={(e) => setConfirmPassInput(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold py-2.5 rounded-lg text-sm transition-colors shadow-sm"
                  >
                    Save Password
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
                    <h3 className="text-lg sm:text-xl font-bold text-[#17366d] flex items-center gap-2">
                      <Inbox className="w-5 h-5 text-[#df6b16] shrink-0" />
                      <span>Messages & Mailbox ({mailboxAccount})</span>
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Direct emails to <strong>{mailboxAccount}</strong> and website contact inquiries in one inbox.
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
                          contextLabel: 'Compose Email',
                        })
                      }
                      className="bg-[#193568] hover:bg-[#11254a] text-white text-xs font-bold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5 text-[#efb24b]" />
                      <span>Compose</span>
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
                      <span>Mobile Setup</span>
                    </button>

                    <button
                      type="button"
                      onClick={loadContactMessages}
                      disabled={isLoadingContacts}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Refresh Inbox"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingContacts ? 'animate-spin text-[#df6b16]' : ''}`} />
                      <span>Refresh</span>
                    </button>

                    <span className="bg-amber-100 text-[#9a460b] font-bold text-xs px-3 py-1.5 rounded-lg border border-amber-300 font-mono">
                      Total: {toEnglishDigits(contactMessages.length + mailboxEmails.length)}
                    </span>
                  </div>
                </div>

                {/* Collapsible Mobile Mail Setup Guide (No credentials exposed) */}
                {showMobileMailGuide && (
                  <div className="bg-[#f8fafc] border border-slate-300 rounded-xl p-4 sm:p-5 text-xs space-y-3">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <h4 className="text-sm sm:text-base font-bold text-[#193568] flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-[#df6b16]" />
                        Mobile Mail Setup ({mailboxAccount})
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
                        <div>Host: <code className="font-mono font-bold text-slate-900">mail.mahasangh.in</code></div>
                        <div>Port & Security: <code className="font-mono font-bold text-slate-900">993 (SSL/TLS)</code></div>
                        <div>Username: <code className="font-mono font-bold text-slate-900">{mailboxAccount}</code></div>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                        <div className="font-bold text-[#193568]">Outgoing Server (SMTP)</div>
                        <div>Host: <code className="font-mono font-bold text-slate-900">mail.mahasangh.in</code></div>
                        <div>Port & Security: <code className="font-mono font-bold text-slate-900">465 (SSL/TLS)</code></div>
                        <div>Webmail: <code className="font-mono text-slate-800">panel.hostkarle.in/roundcube</code></div>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      In Gmail app: Profile icon → Add another account → Other → {mailboxAccount} → Personal (IMAP), then enter the IMAP/SMTP details above with your mail password.
                    </p>
                  </div>
                )}

                {mailboxError && (
                  <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl p-3 text-xs font-medium flex items-center justify-between gap-2">
                    <span>Mail server notice: {mailboxError} (Website contact messages are still shown below)</span>
                    <button
                      type="button"
                      onClick={loadContactMessages}
                      className="text-xs font-bold underline shrink-0 cursor-pointer"
                    >
                      Retry
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
                      All ({toEnglishDigits(contactMessages.length + mailboxEmails.length)})
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
                      <span>Emails ({toEnglishDigits(mailboxEmails.length)})</span>
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
                      <span>Contact Form ({toEnglishDigits(contactMessages.length)})</span>
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                      <input
                        type="text"
                        value={contactSearchQuery}
                        onChange={(e) => setContactSearchQuery(e.target.value)}
                        placeholder="Search name, email, phone, subject, or message..."
                        className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                      />
                    </div>

                    <select
                      value={contactDistrictFilter}
                      onChange={(e) => setContactDistrictFilter(e.target.value)}
                      className="p-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16] bg-white min-w-[160px]"
                    >
                      <option value="">All Districts</option>
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
                        <span>Loading messages...</span>
                      </div>
                    );
                  }

                  if (unified.length === 0) {
                    return (
                      <div className="bg-white p-12 text-center rounded-xl border border-dashed border-slate-300 text-slate-400 space-y-2">
                        <Inbox className="w-12 h-12 mx-auto text-slate-300" />
                        <p className="text-sm font-semibold text-slate-600">No messages found.</p>
                        <p className="text-xs text-slate-400">
                          Emails to {mailboxAccount} and website inquiries will appear here.
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
                                        Email ({mailboxAccount})
                                      </span>
                                      {em.isRead ? (
                                        <span className="bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px] border border-emerald-200">
                                          Read
                                        </span>
                                      ) : (
                                        <span className="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded text-[10px] border border-amber-300">
                                          Unread
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                      {em.fromEmail && <span className="font-mono text-slate-700">{em.fromEmail}</span>}
                                      <span>· {formatDateWithEnglishDigits(em.date)}</span>
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
                                    <span>{em.isRead ? 'Mark Unread' : 'Mark Read'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMailboxEmail(em)}
                                    className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors border border-rose-200 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-1.5 text-xs">
                                <p className="font-bold text-[#17366d]">
                                  Subject: <span className="font-semibold text-slate-800">{em.subject}</span>
                                </p>
                                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-slate-800 leading-relaxed whitespace-pre-wrap font-normal max-h-60 overflow-y-auto">
                                  {em.textBody || em.snippet || '(No content)'}
                                </div>
                                {em.hasAttachments && em.attachmentNames.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 pt-1">
                                    <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                                    <span>Attachments: {em.attachmentNames.join(', ')}</span>
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
                                        contextLabel: `Reply to ${em.fromEmail}`,
                                      })
                                    }
                                    className="inline-flex items-center gap-1.5 bg-[#193568] hover:bg-[#11254a] text-white font-bold px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <Reply className="w-3.5 h-3.5 text-[#efb24b]" />
                                    <span>Reply</span>
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
                                  {msg.name?.charAt(0) || 'U'}
                                </div>
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h4 className="font-bold text-sm text-[#09243f] leading-snug">
                                      {msg.name}
                                    </h4>
                                    <span className="bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px] border border-emerald-200">
                                      Contact Form
                                    </span>
                                    {msg.isRead ? (
                                      <span className="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded text-[10px] border border-slate-200">
                                        Read
                                      </span>
                                    ) : (
                                      <span className="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded text-[10px] border border-amber-300">
                                        New
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
                                      {formatDateWithEnglishDigits(msg.createdAt)}
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
                                    showAdminFeedback(nextRead ? 'Marked as read.' : 'Marked as unread.', 'success');
                                  }}
                                  className={`text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors border cursor-pointer ${
                                    msg.isRead
                                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                                      : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                                  }`}
                                  title="Toggle Read Status"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>{msg.isRead ? 'Mark Unread' : 'Mark Read'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteContactMessage(msg.id)}
                                  className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors border border-rose-200 cursor-pointer"
                                  title="Delete Message"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </div>

                            {/* Subject & Message Content */}
                            <div className="space-y-1.5 text-xs">
                              {msg.subject && (
                                <p className="font-bold text-[#17366d]">
                                  Subject: <span className="font-semibold text-slate-800">{msg.subject}</span>
                                </p>
                              )}
                              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-slate-800 leading-relaxed whitespace-pre-wrap font-normal">
                                {msg.message}
                              </div>

                              {msg.photo && (
                                <div className="mt-2 p-2.5 bg-amber-50/60 border border-amber-200 rounded-lg flex flex-wrap items-center gap-3">
                                  <img
                                    src={msg.photo}
                                    alt={`${msg.name} attachment`}
                                    onClick={() =>
                                      setContactPhotoModal({
                                        src: msg.photo || '',
                                        title: `${msg.name} — Attachment`,
                                      })
                                    }
                                    className="w-16 h-16 rounded-lg object-cover border border-amber-300 bg-white cursor-pointer hover:opacity-90 transition-opacity shrink-0"
                                  />
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#17366d]">
                                      <Paperclip className="w-3.5 h-3.5 text-[#df6b16]" />
                                      <span>Attachment</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setContactPhotoModal({
                                            src: msg.photo || '',
                                            title: `${msg.name} — Attachment`,
                                          })
                                        }
                                        className="inline-flex items-center gap-1 bg-white hover:bg-slate-100 text-[#17366d] border border-slate-300 px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer"
                                      >
                                        <Eye className="w-3 h-3" />
                                        <span>View</span>
                                      </button>
                                      <a
                                        href={msg.photo}
                                        download={`contact-photo-${msg.id}.jpg`}
                                        className="inline-flex items-center gap-1 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 px-2.5 py-1 rounded text-[11px] font-bold"
                                      >
                                        <Download className="w-3 h-3" />
                                        <span>Download</span>
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
                                      subject: msg.subject || 'Re: Your Inquiry',
                                      contextLabel: `Reply to ${msg.email}`,
                                    })
                                  }
                                  className="inline-flex items-center gap-1.5 bg-[#193568] hover:bg-[#11254a] text-white font-bold px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Reply className="w-3.5 h-3.5 text-[#efb24b]" />
                                  <span>Email Reply</span>
                                </button>
                              )}

                              <a
                                href={`tel:${cleanPhone}`}
                                className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold px-3 py-1.5 rounded-lg border border-blue-200 transition-colors"
                              >
                                <PhoneCall className="w-3.5 h-3.5" />
                                <span>Call ({msg.phone})</span>
                              </a>

                              {cleanPhone && (
                                <a
                                  href={`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(`नमस्कार ${msg.name} जी, महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ कार्यालयाकडून आपल्या संदेशाबाबत संपर्क करत आहोत.`)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold px-3 py-1.5 rounded-lg border border-emerald-200 transition-colors"
                                >
                                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>WhatsApp</span>
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
                          <h4 className="text-base font-bold truncate">
                            {replyModal.contextLabel || 'Send Email Reply'}
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReplyModal(null)}
                          className="text-slate-300 hover:text-white p-1 cursor-pointer"
                          aria-label="Close"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <form onSubmit={handleSendMailboxReply} className="p-5 space-y-3.5">
                        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 flex items-center justify-between">
                          <span>From:</span>
                          <strong className="font-mono text-[#193568]">{mailboxAccount}</strong>
                        </div>

                        {replyModal.error && (
                          <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg font-semibold">
                            {replyModal.error}
                          </div>
                        )}

                        <div>
                          <label className="font-bold text-slate-700 block mb-1">
                            To *
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
                            Subject *
                          </label>
                          <input
                            type="text"
                            required
                            value={replyModal.subject}
                            onChange={(e) =>
                              setReplyModal((prev) => prev ? { ...prev, subject: e.target.value } : prev)
                            }
                            placeholder="Email subject"
                            className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#193568]"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-slate-700 block mb-1">
                            Message *
                          </label>
                          <textarea
                            required
                            rows={6}
                            value={replyModal.body}
                            onChange={(e) =>
                              setReplyModal((prev) => prev ? { ...prev, body: e.target.value } : prev)
                            }
                            placeholder="Write your reply here..."
                            className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#193568] leading-relaxed"
                          />
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                          <button
                            type="button"
                            onClick={() => setReplyModal(null)}
                            className="px-4 py-2 border border-slate-300 rounded-lg font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={replyModal.isSending}
                            className="px-5 py-2 bg-[#193568] hover:bg-[#11254a] text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                          >
                            {replyModal.isSending ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#efb24b]" />
                                <span>Sending...</span>
                              </>
                            ) : (
                              <>
                                <Send className="w-3.5 h-3.5 text-[#efb24b]" />
                                <span>Send</span>
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
                          <h4 className="text-sm sm:text-base font-bold truncate">
                            {contactPhotoModal.title}
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => setContactPhotoModal(null)}
                          className="p-1 rounded-full hover:bg-white/15 text-slate-200 hover:text-white cursor-pointer"
                          aria-label="Close"
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
                          <span>Download</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => setContactPhotoModal(null)}
                          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold cursor-pointer"
                        >
                          Close
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
                    <h3 className="text-base font-bold text-[#17366d]">
                      Cloud Storage Settings
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveAdminSubTab(currentUser?.isSuperAdmin ? 'applications' : getFirstAllowedAdminTab(currentUser?.permissions || ALL_ADMIN_PERMISSIONS_FALSE))}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    title="Close"
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
                      Enable cloud uploads
                    </label>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="submit"
                      className="flex-1 bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold py-2 rounded-lg transition-colors shadow-2xs"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={handleTestCloudinaryUpload}
                      disabled={isTestingCloudinary}
                      className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isTestingCloudinary ? 'animate-spin' : ''}`} />
                      <span>{isTestingCloudinary ? 'Testing...' : 'Test'}</span>
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
                      safeStorageSetItem(typeof localStorage !== 'undefined' ? localStorage : null, DYNAMIC_LEADERSHIP_STORAGE_KEY, JSON.stringify(normalized));
                    }
                  } catch (e) {
                    console.warn('Post-restore refresh warning:', e);
                  }
                }}
              />
            )}

            {/* Super Admin Only: System & Member Number Maintenance Tools */}
            {activeAdminSubTab === 'maintenance' && currentUser?.isSuperAdmin && (
              <div className="bg-white p-4 sm:p-6 rounded-2xl border border-[#e7ded1] shadow-xs space-y-5">
                <div className="border-b border-[#e7ded1] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md mb-1.5">
                      <Wrench className="w-3.5 h-3.5" />
                      <span>Super Admin Utility</span>
                    </div>
                    <h3 className="text-lg font-bold text-[#0b1e36]">
                      Maintenance
                    </h3>
                    <p className="text-xs text-[#607184] mt-0.5">
                      Occasional database utilities for member numbering and record cleanup.
                    </p>
                  </div>
                </div>

                <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 sm:p-4 flex items-start gap-3 text-xs sm:text-sm text-amber-950">
                  <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong>Caution:</strong> These maintenance operations directly update member sequence numbers, counter values, or remove deleted/duplicate pending records. Use only when specifically required; every action requires confirmation before running.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Card 1: Resequence Member Numbers */}
                  <div className="p-4 sm:p-5 rounded-xl bg-[#fbf8f2] border border-[#e7ded1] flex flex-col justify-between gap-4">
                    <div className="space-y-1.5">
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-amber-100 text-amber-800">
                        <RotateCcw className="w-4 h-4" />
                      </span>
                      <h4 className="text-base font-bold text-[#0b1e36]">
                        Resequence Member Numbers
                      </h4>
                      <p className="text-xs text-[#607184] leading-relaxed">
                        Re-assigns sequential member numbers across all approved applications in chronological order and synchronizes the counter.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleResequence()}
                      disabled={isResequencing}
                      className="w-full min-h-[42px] rounded-xl bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center gap-2 text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50 px-3.5"
                      title="Resequence all member numbers"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 ${isResequencing ? 'animate-spin' : ''}`} />
                      <span>{isResequencing ? 'Resequencing...' : 'Resequence'}</span>
                    </button>
                  </div>

                  {/* Card 2: Reset Counter */}
                  <div className="p-4 sm:p-5 rounded-xl bg-[#fbf8f2] border border-[#e7ded1] flex flex-col justify-between gap-4">
                    <div className="space-y-1.5">
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#193568]/10 text-[#193568]">
                        <RefreshCw className="w-4 h-4" />
                      </span>
                      <h4 className="text-base font-bold text-[#0b1e36]">
                        Reset Member Counter
                      </h4>
                      <p className="text-xs text-[#607184] leading-relaxed">
                        Aligns the server member counter to the actual highest approved member number so the next approval continues cleanly.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleResetCounter()}
                      disabled={isResettingCounter}
                      className="w-full min-h-[42px] rounded-xl bg-[#193568] hover:bg-[#0b1e36] text-white flex items-center justify-center gap-2 text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50 px-3.5"
                      title="Reset counter to highest number"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isResettingCounter ? 'animate-spin' : ''}`} />
                      <span>{isResettingCounter ? 'Resetting...' : 'Reset Counter'}</span>
                    </button>
                  </div>

                  {/* Card 3: Clean Data / Clean Trash */}
                  <div className="p-4 sm:p-5 rounded-xl bg-[#fbf8f2] border border-[#e7ded1] flex flex-col justify-between gap-4">
                    <div className="space-y-1.5">
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-rose-100 text-rose-700">
                        <Trash2 className="w-4 h-4" />
                      </span>
                      <h4 className="text-base font-bold text-[#0b1e36]">
                        Clean Data / Clean Trash
                      </h4>
                      <p className="text-xs text-[#607184] leading-relaxed">
                        Permanently removes rejected, soft-deleted, and duplicate pending records while keeping all approved members untouched.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handlePurgeDeletedGhosts}
                      disabled={isPurgingGhosts}
                      className="w-full min-h-[42px] bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold px-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                      title="Clean rejected, deleted, and duplicate pending records"
                    >
                      <Trash2 className={`w-3.5 h-3.5 ${isPurgingGhosts ? 'animate-spin' : ''}`} />
                      <span>{isPurgingGhosts ? 'Cleaning...' : 'Clean Trash / Data'}</span>
                    </button>
                  </div>
                </div>

                {/* Shareable Standalone One-Time Center Update Link (Super Admin Only) */}
                <div className="bg-[#fbf8f2] border border-[#e7ded1] rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 allow-copy">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm font-bold text-[#0b1e36]">
                      <Link2 className="w-4 h-4 text-[#df6b16] shrink-0" />
                      <span>
                        One-Time Center Update Link (Pending:{' '}
                        <span className="font-mono tabular-nums text-[#df6b16]">
                          {toEnglishDigits(missingCenterCount)}
                        </span>
                        )
                      </span>
                    </div>
                    <p className="text-xs text-[#607184] leading-relaxed">
                      Share this standalone link with members missing their center name to auto-update their records once.
                    </p>
                    <div className="text-xs font-mono text-[#193568] font-semibold truncate select-all pt-0.5">
                      {buildCenterUpdateShareUrl()}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        const url = buildCenterUpdateShareUrl();
                        try {
                          await navigator.clipboard.writeText(url);
                        } catch {
                          const ta = document.createElement('textarea');
                          ta.value = url;
                          document.body.appendChild(ta);
                          ta.select();
                          document.execCommand('copy');
                          document.body.removeChild(ta);
                        }
                        setCopiedCenterUpdateMode('url');
                        setTimeout(() => setCopiedCenterUpdateMode(null), 2500);
                      }}
                      className="min-h-[40px] bg-[#193568] hover:bg-[#0b1e36] text-white text-xs font-bold px-3.5 py-2 rounded-lg inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                    >
                      {copiedCenterUpdateMode === 'url' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-300" />
                          <span>Link Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        const msg = buildCenterUpdateShareMessage();
                        try {
                          await navigator.clipboard.writeText(msg);
                        } catch {
                          const ta = document.createElement('textarea');
                          ta.value = msg;
                          document.body.appendChild(ta);
                          ta.select();
                          document.execCommand('copy');
                          document.body.removeChild(ta);
                        }
                        setCopiedCenterUpdateMode('message');
                        setTimeout(() => setCopiedCenterUpdateMode(null), 2500);
                      }}
                      className="min-h-[40px] bg-white hover:bg-slate-50 text-[#193568] border border-slate-300 text-xs font-bold px-3.5 py-2 rounded-lg inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                    >
                      {copiedCenterUpdateMode === 'message' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Message Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[#df6b16]" />
                          <span>Copy WhatsApp Text</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
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
          aria-label="Mobile Admin Navigation"
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
              <span>Menu</span>
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
                  alt="Federation Logo"
                  className="w-10 h-10 rounded-full ring-2 ring-[#efb24b] bg-white object-contain shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#efb24b] truncate">
                    {currentUser?.isSuperAdmin ? 'Super Admin' : currentUser?.name || 'Sub-Admin'}
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
                aria-label="Close Menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Menu Grid */}
            <div className="p-4 overflow-y-auto space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#607184] px-1">
                Admin Modules
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
                    <span>Website</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAdminLogout}
                  className="min-h-[48px] bg-rose-600 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
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
              <h3 className="text-base font-bold text-white">
                {confirmDialog.title}
              </h3>
              <button
                type="button"
                disabled={isConfirmExecuting}
                onClick={() => setConfirmDialog(null)}
                className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-white cursor-pointer"
                aria-label="Close"
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
                  Cancel
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
                  {isConfirmExecuting ? 'Processing...' : confirmDialog.confirmLabel}
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
                  Verification
                </span>
                <h3 className="text-base sm:text-lg font-bold text-white">
                  Application Details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAppForVerification(null)}
                className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer shrink-0"
                aria-label="Close"
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
                        <span className="text-[9px]">No Photo</span>
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
                      title="Download Photo"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download Photo</span>
                    </a>
                  )}
                </div>

                <div className="space-y-1 min-w-0 flex-1">
                  <h4 className="text-base font-bold text-[#0b1e36]">
                    {selectedAppForVerification.salutation} {selectedAppForVerification.fullName}
                  </h4>
                  <p className="text-[#607184]">
                    App No.: <strong className="font-mono text-[#0b1e36]">{selectedAppForVerification.applicationNumber}</strong>
                  </p>
                  <p className="text-[#607184]">
                    Date: {formatDateWithEnglishDigits(selectedAppForVerification.createdAt)}
                  </p>
                  <p className="text-[#607184]">
                    Mobile: <strong className="font-mono text-[#df6b16]">{selectedAppForVerification.phone}</strong>
                  </p>
                  <p className="text-[#607184] truncate">
                    Email: {selectedAppForVerification.email}
                  </p>
                </div>
              </div>

              {/* Geographical & Organizational Details */}
              <div className="grid grid-cols-2 gap-3 bg-white p-3.5 border border-[#e7ded1] rounded-2xl">
                <div>
                  <span className="text-[#607184] block text-[10px]">District / Taluka:</span>
                  <strong className="text-[#0b1e36]">
                    {selectedAppForVerification.district}
                    {selectedAppForVerification.taluka ? ` (${selectedAppForVerification.taluka})` : ''}
                  </strong>
                </div>
                <div>
                  <span className="text-[#607184] block text-[10px]">Designation / Cadre:</span>
                  <strong className="text-[#0b1e36]">{normalizeOfficialCadre(selectedAppForVerification.professional, 'केंद्रप्रमुख')}</strong>
                </div>
                <div className="col-span-2">
                  <span className="text-[#607184] block text-[10px]">Working Center:</span>
                  <strong className="text-[#0b1e36]">{selectedAppForVerification.centerName || '-'}</strong>
                </div>
                <div>
                  <span className="text-[#607184] block text-[10px]">Education:</span>
                  <span>{selectedAppForVerification.education || '-'}</span>
                </div>
                <div>
                  <span className="text-[#607184] block text-[10px]">Professional Qualification:</span>
                  <span className="font-semibold text-[#102a43]">{selectedAppForVerification.professionalQualification || '-'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-[#607184] block text-[10px]">Family Members / Hobby:</span>
                  <span>{selectedAppForVerification.familyMembers || '-'} / {selectedAppForVerification.hobby || '-'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-[#607184] block text-[10px]">Address:</span>
                  <span>{selectedAppForVerification.address}</span>
                </div>
              </div>

              {/* If Official Member */}
              {selectedAppForVerification.isOfficial && (
                <div className="bg-amber-50/70 border border-amber-300 p-3 rounded-xl text-amber-950">
                  <span className="font-bold block text-xs mb-0.5">Official Office Bearer:</span>
                  <p>
                    Post: <strong>{selectedAppForVerification.officialPost}</strong>
                    {selectedAppForVerification.officialDistrict && ` | District: ${selectedAppForVerification.officialDistrict}`}
                    {selectedAppForVerification.officialTaluka && ` | Taluka: ${selectedAppForVerification.officialTaluka}`}
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
                          Payment receipt verified <span className="text-rose-600">*</span>
                        </strong>
                        <span className="text-[11px] text-[#607184]">
                          Confirmed that total membership fee (₹225.20: lifetime ₹100 + annual ₹120 + gateway ₹5.20) was received.
                        </span>
                      </div>
                    </label>
                  </div>

                  {showRejectInput && (
                    <div className="bg-rose-50/70 border border-rose-200 p-3.5 rounded-2xl space-y-2">
                      <label className="font-bold text-xs text-rose-900 block">
                        Rejection Reason:
                      </label>
                      <textarea
                        rows={2}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="e.g. Payment incomplete or invalid photo..."
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
                      <span>{isApprovingApp ? 'Approving...' : 'Approve'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isApprovingApp}
                      onClick={handleRejectVerified}
                      className="min-h-[46px] bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                      <span>{showRejectInput ? 'Confirm Reject' : 'Reject'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedAppForVerification(null)}
                      className="min-h-[46px] bg-slate-100 hover:bg-slate-200 text-[#0b1e36] font-bold px-4 py-2.5 rounded-xl text-xs cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 pt-1">
                  {selectedAppForVerification.status === 'approved' ? (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-2xl text-xs space-y-1">
                      <div className="font-bold flex items-center gap-2 text-sm text-emerald-800">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <span>Application Approved</span>
                      </div>
                      <p className="text-[#102a43]">
                        Member ID:{' '}
                        <strong className="font-mono text-emerald-900 bg-white px-2 py-0.5 rounded border border-emerald-200">
                          {selectedAppForVerification.memberNumber || 'MS-2026-MEMBER'}
                        </strong>
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-rose-50 border border-rose-200 text-rose-950 rounded-2xl text-xs space-y-1">
                      <div className="font-bold flex items-center gap-2 text-sm text-rose-800">
                        <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
                        <span>Application Rejected</span>
                      </div>
                      <p className="text-[#607184]">Final decision has been recorded for this application.</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleDeleteWithFeedback(selectedAppForVerification)}
                      className="min-h-[46px] bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete Permanently</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedAppForVerification(null)}
                      className="min-h-[46px] bg-[#0b1e36] hover:bg-[#193568] text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-xs cursor-pointer"
                    >
                      Close
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
      {certModalApp && (() => {
        const activeCertApp = applications.find((a) => a.id === certModalApp.id) || certModalApp;
        return (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setCertModalApp(null)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl max-w-xl w-full shadow-2xl relative border border-[#e7ded1] max-h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#0b1e36] text-white px-5 py-3.5 flex items-center justify-between gap-2 shrink-0">
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-[#efb24b]" />
                <span>Membership ID Card</span>
              </h3>
              <button
                type="button"
                onClick={() => setCertModalApp(null)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
              <div className="flex justify-center">
                <MembershipIdCardPreview app={activeCertApp} photoFallbackUrl="" />
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => generateMembershipIdCardPdf(activeCertApp)}
                  className="min-h-[46px] bg-[#0b1e36] hover:bg-[#193568] text-white text-xs sm:text-sm font-bold px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  <Download className="w-4 h-4 text-[#efb24b]" />
                  <span>Download PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCertModalApp(null)}
                  className="min-h-[46px] bg-slate-200 hover:bg-slate-300 text-[#0b1e36] text-xs sm:text-sm font-bold px-5 py-2.5 rounded-xl cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ============================================================== */}
      {/* Razorpay Direct Sync & Excel Auto-Approve Match Modal          */}
      {/* ============================================================== */}
      {showRazorpayMatchModal && (() => {
        const selectedItems = razorpayMatchedList.filter((m) => m.selected !== false);
        const allSelected = razorpayMatchedList.length > 0 && selectedItems.length === razorpayMatchedList.length;
        const matchByLabel = (matchBy?: string) => {
          if (matchBy === 'order_id') return 'Order ID';
          if (matchBy === 'application_id') return 'App ID';
          if (matchBy === 'phone') return 'Mobile';
          if (matchBy === 'email') return 'Email';
          return 'Excel';
        };

        return (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          onClick={() => setShowRazorpayMatchModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl relative border border-[#e7ded1] max-h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#0b1e36] text-white px-5 py-3.5 flex items-center justify-between gap-2 shrink-0">
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>
                  {razorpaySyncMeta?.source === 'live'
                    ? `Razorpay Live Sync (${razorpayMatchedList.length} matched)`
                    : `Razorpay Excel Match (${razorpayMatchedList.length} matched)`}
                </span>
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#fbf8f2] border border-[#e7ded1] rounded-xl p-3">
                <div className="text-xs text-[#607184] leading-relaxed">
                  {razorpaySyncMeta?.source === 'live' ? (
                    <>
                      Checked <strong className="text-emerald-700">{razorpaySyncMeta.capturedPaymentsCount ?? 0}</strong> captured payments from the last{' '}
                      <strong className="text-[#0b1e36]">{razorpaySyncMeta.daysBack || razorpaySyncDays} days</strong> against{' '}
                      <strong className="text-[#0b1e36]">{razorpaySyncMeta.pendingCheckedCount ?? 0}</strong> pending applications.
                    </>
                  ) : (
                    <>
                      Pending applications below matched Razorpay payment records by phone or email.
                    </>
                  )}
                </div>

                {razorpaySyncMeta?.source === 'live' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={razorpaySyncDays}
                      onChange={(e) => {
                        const days = Number(e.target.value) || 30;
                        setRazorpaySyncDays(days);
                        handleSyncRazorpayLivePayments(days);
                      }}
                      disabled={isSyncingRazorpay || isBulkApprovingRazorpay}
                      className="text-xs font-bold bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-[#0b1e36]"
                    >
                      <option value={7}>Last 7 Days</option>
                      <option value={30}>Last 30 Days</option>
                      <option value={90}>Last 90 Days</option>
                    </select>
                    <button
                      type="button"
                      disabled={isSyncingRazorpay || isBulkApprovingRazorpay}
                      onClick={() => handleSyncRazorpayLivePayments(razorpaySyncDays)}
                      className="bg-white hover:bg-slate-100 border border-slate-300 text-[#0b1e36] font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-[#df6b16] ${isSyncingRazorpay ? 'animate-spin' : ''}`} />
                      <span>Re-check</span>
                    </button>
                  </div>
                )}
              </div>

              {razorpayMatchedList.length === 0 ? (
                <div className="p-6 text-center text-slate-600 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-1.5">
                  <div className="font-bold text-[#0b1e36]">No new captured payments matched pending applications.</div>
                  {razorpaySyncMeta?.source === 'live' && razorpaySyncDays < 90 && (
                    <div>Try switching the range above to "Last 90 Days".</div>
                  )}
                </div>
              ) : (
                <div className="border border-[#e7ded1] rounded-xl overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#fbf8f2] text-[#0b1e36] font-bold border-b border-[#e7ded1] sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-8">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setRazorpayMatchedList((prev) => prev.map((m) => ({ ...m, selected: checked })));
                            }}
                            className="w-4 h-4 accent-[#df6b16] cursor-pointer"
                            aria-label="Select All"
                          />
                        </th>
                        <th className="py-2.5 px-2">#</th>
                        <th className="py-2.5 px-3">Name & District</th>
                        <th className="py-2.5 px-3">Mobile</th>
                        <th className="py-2.5 px-3">Amount & Match</th>
                        <th className="py-2.5 px-3">Payment ID</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e7ded1]">
                      {razorpayMatchedList.map((item, idx) => (
                        <tr key={item.app.id} className="hover:bg-amber-50/40">
                          <td className="py-2 px-3">
                            <input
                              type="checkbox"
                              checked={item.selected !== false}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setRazorpayMatchedList((prev) =>
                                  prev.map((m) => (m.app.id === item.app.id ? { ...m, selected: checked } : m))
                                );
                              }}
                              className="w-4 h-4 accent-[#df6b16] cursor-pointer"
                            />
                          </td>
                          <td className="py-2 px-2 font-mono">{idx + 1}</td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-[#0b1e36]">{item.app.fullName}</div>
                            <div className="text-[11px] text-slate-500">{item.app.district}</div>
                          </td>
                          <td className="py-2 px-3 font-mono">{toEnglishDigits(item.app.phone)}</td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-emerald-700">₹{Number(item.amountRupees || 225.2).toFixed(2)}</div>
                            <div className="text-[11px] text-slate-500">
                              {matchByLabel(item.matchBy)}
                              {item.paidAtIso ? ` · ${formatDateWithEnglishDigits(item.paidAtIso)}` : ''}
                            </div>
                          </td>
                          <td className="py-2 px-3 font-mono text-emerald-800 font-semibold">{item.paymentId}</td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              disabled={isBulkApprovingRazorpay || approvingSingleRazorpayId === item.app.id}
                              onClick={async () => {
                                setApprovingSingleRazorpayId(item.app.id);
                                try {
                                  const memberNo = await approveSingleRazorpayMatchedItem(item);
                                  setRazorpayMatchedList((prev) => prev.filter((m) => m.app.id !== item.app.id));
                                  showAdminFeedback(`Approved ${item.app.fullName} (ID: ${memberNo}).`, 'success');
                                  if (onFetchApplications) await onFetchApplications(true);
                                } catch (err: any) {
                                  showAdminFeedback('Approval error: ' + (err?.message || 'Error'), 'error');
                                } finally {
                                  setApprovingSingleRazorpayId(null);
                                }
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-2.5 py-1.5 rounded-lg text-[11px] cursor-pointer whitespace-nowrap"
                            >
                              {approvingSingleRazorpayId === item.app.id ? 'Approving...' : 'Approve'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-col sm:flex-row justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={selectedItems.length === 0 || isBulkApprovingRazorpay || Boolean(approvingSingleRazorpayId)}
                  onClick={async () => {
                    setIsBulkApprovingRazorpay(true);
                    let successCount = 0;
                    const approvedIds = new Set<string>();
                    const failedErrors: string[] = [];
                    try {
                      for (const item of selectedItems) {
                        try {
                          await approveSingleRazorpayMatchedItem(item);
                          approvedIds.add(item.app.id);
                          successCount++;
                        } catch (e: any) {
                          console.error('Error auto-approving app:', item.app.id, e);
                          failedErrors.push(
                            `${item.app.fullName}: ${e?.message || 'Server error'}`
                          );
                        }
                      }
                      if (successCount === 0 && failedErrors.length > 0) {
                        showAdminFeedback(
                          `Approval failed: ${failedErrors[0]}`,
                          'error'
                        );
                      } else if (failedErrors.length > 0) {
                        showAdminFeedback(
                          `${successCount} approved; ${failedErrors.length} failed: ${failedErrors[0]}`,
                          'error'
                        );
                      } else {
                        showAdminFeedback(
                          `${successCount} pending applications approved and assigned Member IDs.`,
                          'success'
                        );
                      }
                      setRazorpayMatchedList((prev) => prev.filter((m) => !approvedIds.has(m.app.id)));
                      if (successCount > 0 && successCount === selectedItems.length) {
                        setShowRazorpayMatchModal(false);
                      }
                      if (successCount > 0 && onFetchApplications) await onFetchApplications(true);
                    } catch (err: any) {
                      showAdminFeedback('Error: ' + (err?.message || 'Error'), 'error');
                    } finally {
                      setIsBulkApprovingRazorpay(false);
                    }
                  }}
                  className="min-h-[46px] bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-6 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className={`w-4 h-4 text-emerald-200 ${isBulkApprovingRazorpay ? 'animate-spin' : ''}`} />
                  <span>
                    {isBulkApprovingRazorpay
                      ? 'Approving...'
                      : `Approve Selected (${selectedItems.length})`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowRazorpayMatchModal(false)}
                  className="min-h-[46px] bg-slate-200 hover:bg-slate-300 text-[#0b1e36] font-bold px-5 py-2.5 rounded-xl text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
};


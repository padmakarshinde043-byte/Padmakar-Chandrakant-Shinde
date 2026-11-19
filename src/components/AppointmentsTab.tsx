import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, ShieldCheck, Award, FileText, Share2,
  Lock, Unlock, Plus, Trash2, Edit3, RefreshCw, KeyRound, CheckCircle2,
  AlertCircle, ChevronRight, Phone, MapPin, Building, Calendar, Users, Download, X, Eye, EyeOff, ImageIcon
} from 'lucide-react';
import {
  uploadToCloudinary,
  getCloudinaryConfig,
  uploadCompressedPhotoToCloudinaryOrFallback,
  uploadDataUrlToCloudinary
} from '../utils/cloudinary';
import { compressImageFile } from '../utils/imageCompressor';
import {
  DISTRICT_TALUKAS_MAP, MAHARASHTRA_36_DISTRICTS, OfficialMember, AppointedPostItem,
  SUPER_ADMIN_PASSWORD, MASTER_DEV_ADMIN_PASSWORD, DEFAULT_DISTRICT_PASSWORD,
  DEFAULT_APPOINTED_POSTS, formatAppointedPostWithTaluka, isTalukaLevelPost, getPostLevelLabel, getPostLevel,
  getAppointmentCommitteeInfo
} from '../data/rkMaharashtraData';
import {
  fetchOfficials, saveOfficialToRtdb, deleteOfficialFromRtdb,
  fetchDistrictPasswords, updateDistrictPasswordInRtdb, fetchAppointedPosts,
  fetchPresidentPasswordFromFirebase, updatePresidentPasswordInFirebase
} from '../services/rkFirebaseService';
import { generateSingleLetterPdf, generateDistrictExecutivePdf } from '../services/rkPdfGenerator';
import {
  exportDistrictExecutiveExcel,
  exportDistrictPresidentsExcel,
  exportTalukaPresidentsExcel,
  exportRegisteredMembersExcel,
  exportStatewideRegistryExcel,
  exportOrganizationStatusExcel
} from '../utils/excelExporter';
import { toEnglishDigits, formatDateWithEnglishDigits } from '../utils/formatters';
import { ORG_DETAILS, MembershipApplication, OFFICIAL_CADRES, normalizeOfficialCadre } from '../data/mahasanghData';
import { fetchApprovedMembersCached } from '../firebase';
import {
  CACHE_KEY_POSTS,
  LEGACY_CACHE_KEY_POSTS,
  POSTS_BROADCAST_CHANNEL,
  getOfficialsFromStorageSync,
  getPostsFromStorageSync,
  getDistrictPasswordsFromStorageSync,
  getPresidentPasswordFromStorageSync,
  filterAndSortDistrictOfficials,
  matchesDistrictName,
} from '../utils/officialsCache';
import {
  authApiRequest,
  getAuthHeaders,
  isSqlBackendActive,
  setAuthSessionToken,
  clearAuthSessionToken,
} from '../api/sqlBridge';

const ModalPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
};

const ToastPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
};

const OFFICER_CAPSULE_TINTS = [
  {
    surface: 'bg-gradient-to-br from-sky-100/80 via-white/95 to-sky-50/90',
    border: 'border-sky-200/90',
    ring: 'ring-sky-100/80',
    divider: 'border-sky-200/70',
    serial: 'text-sky-800/80 bg-sky-100/80 border-sky-200/80',
    photoRing: 'ring-sky-200/80',
    orb: 'bg-sky-200/45',
  },
  {
    surface: 'bg-gradient-to-br from-cyan-100/70 via-white/95 to-sky-50/85',
    border: 'border-cyan-200/85',
    ring: 'ring-cyan-100/75',
    divider: 'border-cyan-200/70',
    serial: 'text-cyan-800/80 bg-cyan-100/75 border-cyan-200/80',
    photoRing: 'ring-cyan-200/80',
    orb: 'bg-cyan-200/40',
  },
  {
    surface: 'bg-gradient-to-br from-blue-100/70 via-white/95 to-sky-50/85',
    border: 'border-blue-200/85',
    ring: 'ring-blue-100/75',
    divider: 'border-blue-200/70',
    serial: 'text-blue-800/80 bg-blue-100/75 border-blue-200/80',
    photoRing: 'ring-blue-200/80',
    orb: 'bg-blue-200/40',
  },
  {
    surface: 'bg-gradient-to-br from-indigo-100/60 via-white/95 to-sky-50/90',
    border: 'border-indigo-200/80',
    ring: 'ring-indigo-100/70',
    divider: 'border-indigo-200/65',
    serial: 'text-indigo-800/80 bg-indigo-100/70 border-indigo-200/75',
    photoRing: 'ring-indigo-200/75',
    orb: 'bg-indigo-200/35',
  },
  {
    surface: 'bg-gradient-to-br from-teal-100/60 via-white/95 to-cyan-50/85',
    border: 'border-teal-200/80',
    ring: 'ring-teal-100/70',
    divider: 'border-teal-200/65',
    serial: 'text-teal-800/80 bg-teal-100/70 border-teal-200/75',
    photoRing: 'ring-teal-200/75',
    orb: 'bg-teal-200/35',
  },
  {
    surface: 'bg-gradient-to-br from-sky-100/75 via-white/95 to-amber-50/65',
    border: 'border-sky-200/85',
    ring: 'ring-amber-100/60',
    divider: 'border-sky-200/65',
    serial: 'text-sky-800/80 bg-sky-100/75 border-sky-200/80',
    photoRing: 'ring-sky-200/80',
    orb: 'bg-amber-100/50',
  },
] as const;

export const AppointmentsTab: React.FC = () => {
  // Hydrate synchronously from localStorage for instant 0ms tab render
  const [officials, setOfficials] = useState<OfficialMember[]>(() => getOfficialsFromStorageSync());
  const [isLoading, setIsLoading] = useState<boolean>(() => getOfficialsFromStorageSync().length === 0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');
  const [postsList, setPostsList] = useState<AppointedPostItem[]>(() =>
    getPostsFromStorageSync()
  );
  const [districtPasswords, setDistrictPasswords] = useState<Record<string, string>>(() =>
    getDistrictPasswordsFromStorageSync()
  );

  // Active sub-tab matching greetings.mahasangh.in
  const [activeSubTab, setActiveSubTab] = useState<'directory' | 'manage' | 'letters'>('directory');

  // Filters & Search
  const [currentDistrict, setCurrentDistrict] = useState<string>('बीड');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Authentication states
  const [isManageUnlocked, setIsManageUnlocked] = useState<boolean>(false);
  const [isLettersUnlocked, setIsLettersUnlocked] = useState<boolean>(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [lockedDistrictName, setLockedDistrictName] = useState<string | null>(null);

  // Interactive In-Page Login Modals (replaces window.prompt which is blocked on Android/iframes)
  const [showDistrictLoginModal, setShowDistrictLoginModal] = useState<boolean>(false);
  const [districtPasswordInput, setDistrictPasswordInput] = useState<string>('');
  const [districtLoginError, setDistrictLoginError] = useState<string>('');
  const [isSettingInitialPassword, setIsSettingInitialPassword] = useState<boolean>(false);
  const [newInitialPass1, setNewInitialPass1] = useState<string>('');
  const [newInitialPass2, setNewInitialPass2] = useState<string>('');

  const [showPresidentLoginModal, setShowPresidentLoginModal] = useState<boolean>(false);
  const [presidentPasswordInput, setPresidentPasswordInput] = useState<string>('');
  const [presidentLoginError, setPresidentLoginError] = useState<string>('');
  const [presidentSavedPassword, setPresidentSavedPassword] = useState<string>(() =>
    getPresidentPasswordFromStorageSync(SUPER_ADMIN_PASSWORD)
  );
  const [isSettingPresidentInitialPassword, setIsSettingPresidentInitialPassword] = useState<boolean>(false);
  const [newPresidentPass1, setNewPresidentPass1] = useState<string>('');
  const [newPresidentPass2, setNewPresidentPass2] = useState<string>('');
  const [showChangePresidentPasswordModal, setShowChangePresidentPasswordModal] = useState<boolean>(false);
  const [changeOldPass, setChangeOldPass] = useState<string>('');
  const [changeNewPass1, setChangeNewPass1] = useState<string>('');
  const [changeNewPass2, setChangeNewPass2] = useState<string>('');
  const [changePassError, setChangePassError] = useState<string>('');

  // Selected Member for A4 Appointment Letter Modal
  const [selectedOfficialForLetter, setSelectedOfficialForLetter] = useState<OfficialMember | null>(null);

  // PDF Generation loading states
  const [isGeneratingLetterPdf, setIsGeneratingLetterPdf] = useState<boolean>(false);
  const [isGeneratingDirPdf, setIsGeneratingDirPdf] = useState<boolean>(false);
  const [isGeneratingRegistryPdf, setIsGeneratingRegistryPdf] = useState<boolean>(false);
  const [pdfProgressStatus, setPdfProgressStatus] = useState<string>('');

  // Status Matrix & Registered Members Modal states (Points 8, 9, 10)
  const [showStatusMatrixModal, setShowStatusMatrixModal] = useState<boolean>(false);
  const [registeredApplications, setRegisteredApplications] = useState<MembershipApplication[]>([]);

  // Add / Edit Member Modal
  const [isMemberModalOpen, setIsMemberModalOpen] = useState<boolean>(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [formSalutation, setFormSalutation] = useState<string>('श्री.');
  const [formFirstName, setFormFirstName] = useState<string>('');
  const [formMiddleName, setFormMiddleName] = useState<string>('');
  const [formLastName, setFormLastName] = useState<string>('');
  const [formPost, setFormPost] = useState<string>('जिल्हाध्यक्ष');
  const [formDistrict, setFormDistrict] = useState<string>('बीड');
  const [formTaluka, setFormTaluka] = useState<string>('');
  const [formCadre, setFormCadre] = useState<string>('केंद्रप्रमुख');
  const [customCadreInput, setCustomCadreInput] = useState<string>('');
  const [formWorkingPlace, setFormWorkingPlace] = useState<string>('');
  const [formWorkingTaluka, setFormWorkingTaluka] = useState<string>('');
  const [formMobile, setFormMobile] = useState<string>('');
  const [formPhoto, setFormPhoto] = useState<string>('');
  const [formPhotoUrl, setFormPhotoUrl] = useState<string>('');
  const [isUploadingMemberPhoto, setIsUploadingMemberPhoto] = useState<boolean>(false);

  const handleMemberPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('कृपया वैध फोटो फाईल (JPG, PNG किंवा WEBP) निवडा.', 'error');
      return;
    }
    setIsUploadingMemberPhoto(true);
    try {
      const { urlOrBase64, storageType } = await uploadCompressedPhotoToCloudinaryOrFallback(file, 400, 500, 0.85);
      setFormPhoto(urlOrBase64);
      setFormPhotoUrl(urlOrBase64.startsWith('http') ? urlOrBase64 : '');
      if (storageType === 'cloudinary') {
        showToast('✓ फोटो थेट क्लाउडवर यशस्वीरीत्या अपलोड झाला!', 'success');
      } else {
        showToast('✓ फोटो यशस्वीरीत्या जोडला गेला!', 'success');
      }
    } catch (err: any) {
      showToast('फोटो अपलोड करताना अडचण आली: ' + (err?.message || ''), 'error');
    } finally {
      setIsUploadingMemberPhoto(false);
      e.target.value = '';
    }
  };

  // Change Password Modal
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState<boolean>(false);
  const [newPassword, setNewPassword] = useState<string>('');
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState<boolean>(false);

  // In-Page Interactive Delete Confirmation Modal (NO window.confirm!)
  const [memberToDelete, setMemberToDelete] = useState<OfficialMember | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // In-Page Toast Notifications & Inline Form Errors (NO window.alert!)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [formError, setFormError] = useState<string>('');

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  // Load Initial Data on Mount + Keep postsList synchronized across same-tab & cross-tab updates
  useEffect(() => {
    loadData(false);

    const handlePostsUpdated = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (Array.isArray(customEvent.detail) && customEvent.detail.length > 0) {
        setPostsList(customEvent.detail);
      } else {
        setPostsList(getPostsFromStorageSync());
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === CACHE_KEY_POSTS || e.key === LEGACY_CACHE_KEY_POSTS || e.key === null) {
        setPostsList(getPostsFromStorageSync());
      }
    };

    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      setPostsList(getPostsFromStorageSync());
      fetchAppointedPosts(true)
        .then((freshPosts) => {
          if (Array.isArray(freshPosts) && freshPosts.length > 0) {
            setPostsList(freshPosts);
          }
        })
        .catch(() => {});
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

    window.addEventListener('mahasangh_posts_updated', handlePostsUpdated);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      window.removeEventListener('mahasangh_posts_updated', handlePostsUpdated);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      if (bc) bc.close();
    };
  }, []);

  // Ensure postsList is freshly synced whenever District President opens Management view
  useEffect(() => {
    if (activeSubTab === 'manage') {
      setPostsList(getPostsFromStorageSync());
      fetchAppointedPosts(true)
        .then((freshPosts) => {
          if (Array.isArray(freshPosts) && freshPosts.length > 0) {
            setPostsList(freshPosts);
          }
        })
        .catch(() => {});
    }
  }, [activeSubTab]);

  // Lazy-load approved registered members ONLY when President Letters / Status Matrix is opened
  useEffect(() => {
    if ((activeSubTab === 'letters' || showStatusMatrixModal) && registeredApplications.length === 0) {
      fetchApprovedMembersCached(false)
        .then((appsData) => {
          if (Array.isArray(appsData)) {
            setRegisteredApplications(appsData);
          }
        })
        .catch(() => {});
    }
  }, [activeSubTab, showStatusMatrixModal, registeredApplications.length]);

  // Keep registeredApplications synchronized immediately when Admin Panel edits any member
  useEffect(() => {
    const handleAppsUpdated = () => {
      fetchApprovedMembersCached(true)
        .then((appsData) => {
          if (Array.isArray(appsData)) {
            setRegisteredApplications(appsData);
          }
        })
        .catch(() => {});
    };
    window.addEventListener('mahasangh_apps_updated', handleAppsUpdated);
    return () => window.removeEventListener('mahasangh_apps_updated', handleAppsUpdated);
  }, []);

  const loadData = async (force: boolean) => {
    setIsRefreshing(true);
    try {
      // 1. Primary public directory data (RTDB cached; unblocks UI immediately)
      const [officialsData, postsData] = await Promise.all([
        fetchOfficials(force),
        fetchAppointedPosts(force),
      ]);
      setOfficials(officialsData);
      if (postsData && postsData.length > 0) {
        setPostsList(postsData);
      }
      setIsLoading(false);
      setLastRefreshedAt(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));

      if (activeSubTab === 'letters' || showStatusMatrixModal) {
        fetchApprovedMembersCached(force)
          .then((appsData) => {
            if (Array.isArray(appsData)) setRegisteredApplications(appsData);
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error('Error loading RTDB data:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Available talukas for current district
  const availableTalukas = useMemo(() => {
    if (!currentDistrict) return [];
    return (
      DISTRICT_TALUKAS_MAP[currentDistrict] ||
      DISTRICT_TALUKAS_MAP[currentDistrict.replace('शी', 'शि')] ||
      DISTRICT_TALUKAS_MAP[currentDistrict.replace('शि', 'शी')] ||
      []
    );
  }, [currentDistrict]);

  const formAvailableTalukas = useMemo(() => {
    if (!formDistrict) return [];
    return (
      DISTRICT_TALUKAS_MAP[formDistrict] ||
      DISTRICT_TALUKAS_MAP[formDistrict.replace('शी', 'शि')] ||
      DISTRICT_TALUKAS_MAP[formDistrict.replace('शि', 'शी')] ||
      []
    );
  }, [formDistrict]);

  // Is selected post a taluka-level post? (State, Division, or District posts NEVER take a taluka)
  const isPostNeedsTaluka = useMemo(() => {
    const found = postsList.find((p) => p.name === formPost);
    if (found) return isTalukaLevelPost(found.name, found.isTaluka, found.level);
    return isTalukaLevelPost(formPost);
  }, [postsList, formPost]);

  // District Filtered & Rank-Sorted Officials List (Sorted by Dropdown Post Hierarchy)
  const districtOfficials = useMemo(() => {
    return filterAndSortDistrictOfficials(officials, currentDistrict, postsList);
  }, [officials, currentDistrict, postsList]);

  // Searched Officials
  const searchedOfficials = useMemo(() => {
    if (!searchQuery.trim()) return districtOfficials;
    const q = searchQuery.toLowerCase().trim();
    return districtOfficials.filter((m) => {
      const fullName = `${m.salutation} ${m.firstName} ${m.middleName || ''} ${m.lastName}`.toLowerCase();
      const post = (m.appointedPost || '').toLowerCase();
      const tal = (m.taluka || '').toLowerCase();
      const mob = (m.mobile || '').toLowerCase();
      const cadre = (m.currentCadre || '').toLowerCase();
      const wPlace = (m.workingPlace || '').toLowerCase();
      return (
        fullName.includes(q) ||
        post.includes(q) ||
        tal.includes(q) ||
        mob.includes(q) ||
        cadre.includes(q) ||
        wPlace.includes(q)
      );
    });
  }, [districtOfficials, searchQuery]);

  // Statewide Serial Map (Outward Number: MS/2026/01, MS/2026/02, ...)
  const statewideSerialMap = useMemo(() => {
    const map = new Map<string, number>();
    const sorted = [...officials].sort((a, b) => {
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      if (timeA !== timeB && timeA > 0 && timeB > 0) return timeA - timeB;
      const numA = parseInt(a.id) || 0;
      const numB = parseInt(b.id) || 0;
      if (numA > 0 && numB > 0 && numA !== numB) return numA - numB;
      return String(a.id).localeCompare(String(b.id));
    });
    sorted.forEach((m, idx) => {
      map.set(m.id, idx + 1);
    });
    return map;
  }, [officials]);

  // Handle Tab Click 1: Directory
  const handleTabClickDirectory = () => {
    setActiveSubTab('directory');
  };

  // Handle Tab Click 2: District Management (Prompts in-page modal if locked)
  const handleTabClickManage = () => {
    if (isSuperAdmin) {
      setActiveSubTab('manage');
      return;
    }
    if (isManageUnlocked) {
      if (lockedDistrictName) {
        setCurrentDistrict(lockedDistrictName);
      }
      setActiveSubTab('manage');
      return;
    }
    // Open in-page modal
    setDistrictPasswordInput('');
    setDistrictLoginError('');
    setIsSettingInitialPassword(false);
    setShowDistrictLoginModal(true);
  };

  // Handle Tab Click 3: State President Letters (Prompts in-page modal if locked)
  const handleTabClickLetters = () => {
    if (isLettersUnlocked || isSuperAdmin) {
      setActiveSubTab('letters');
      return;
    }
    // Open in-page modal
    setPresidentPasswordInput('');
    setPresidentLoginError('');
    setShowPresidentLoginModal(true);
  };

  // Submit District Login from in-page modal (verified server-side)
  const handleDistrictLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDistrictLoginError('');

    const input = districtPasswordInput.trim();
    if (!input) {
      setDistrictLoginError('कृपया पासवर्ड प्रविष्ट करा.');
      return;
    }

    try {
      const { ok, data } = await authApiRequest<{
        status: string;
        role?: string;
        isSuperAdmin?: boolean;
        token?: string;
        message?: string;
      }>('/api/auth/district-login', { district: currentDistrict, password: input });

      if (data?.status === 'require_initial_password') {
        setIsSettingInitialPassword(true);
        return;
      }

      if (!ok || data?.status !== 'success') {
        setDistrictLoginError(
          data?.message || `चुकीचा पासवर्ड! आपण फक्त '${currentDistrict}' जिल्ह्याचा पासवर्ड टाकूनच संपादन करू शकता.`
        );
        return;
      }

      if (data.token) {
        setAuthSessionToken(data.token);
      }

      if (data.isSuperAdmin || data.role === 'state_president') {
        setIsSuperAdmin(true);
        setIsManageUnlocked(true);
        setIsLettersUnlocked(true);
      } else {
        setIsManageUnlocked(true);
        setLockedDistrictName(currentDistrict);
      }
      setShowDistrictLoginModal(false);
      setActiveSubTab('manage');
    } catch (err: any) {
      setDistrictLoginError('लॉगिन करताना त्रुटी आली: ' + (err?.message || 'Error'));
    }
  };

  // Save Initial New Password for District
  const handleSaveInitialPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInitialPass1.trim() || newInitialPass1.trim().length < 4 || newInitialPass1.trim() === DEFAULT_DISTRICT_PASSWORD) {
      setDistrictLoginError(`कृपया किमान ४ अक्षरी सुरक्षित पासवर्ड तयार करा (डिफॉल्ट '${DEFAULT_DISTRICT_PASSWORD}' वगळता)!`);
      return;
    }
    if (newInitialPass1.trim() !== newInitialPass2.trim()) {
      setDistrictLoginError('दोन्ही पासवर्ड जुळले नाहीत!');
      return;
    }

    try {
      const newPass = newInitialPass1.trim();
      const { ok, data } = await authApiRequest<{
        status: string;
        token?: string;
        message?: string;
      }>('/api/auth/district-set-initial-password', {
        district: currentDistrict,
        newPassword: newPass,
      });

      if (!ok || data?.status !== 'success') {
        setDistrictLoginError(data?.message || 'पासवर्ड सेव्ह करताना त्रुटी आली.');
        return;
      }

      if (data.token) {
        setAuthSessionToken(data.token);
      }
      setDistrictPasswords((prev) => ({ ...prev, [currentDistrict]: '__CUSTOM__' }));
      window.dispatchEvent(new Event('mahasangh_district_passwords_updated'));
      setIsManageUnlocked(true);
      setLockedDistrictName(currentDistrict);
      setShowDistrictLoginModal(false);
      setIsSettingInitialPassword(false);
      setNewInitialPass1('');
      setNewInitialPass2('');
      setActiveSubTab('manage');
      showToast(`'${currentDistrict}' जिल्ह्यासाठी नवीन पासवर्ड यशस्वीरीत्या तयार झाला आहे! पुढील वेळी याच पासवर्डने लॉगिन करा.`, 'success');
    } catch (err: any) {
      setDistrictLoginError('त्रुटी: ' + err.message);
    }
  };

  // Submit President Master Login from in-page modal (verified server-side)
  const handlePresidentLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPresidentLoginError('');
    const input = presidentPasswordInput.trim();

    if (!input) {
      setPresidentLoginError('कृपया पासवर्ड प्रविष्ट करा.');
      return;
    }

    try {
      const { ok, data } = await authApiRequest<{
        status: string;
        isMasterKey?: boolean;
        token?: string;
        message?: string;
      }>('/api/auth/president-login', { password: input });

      if (data?.status === 'require_initial_password') {
        setIsSettingPresidentInitialPassword(true);
        return;
      }

      if (!ok || data?.status !== 'success') {
        setPresidentLoginError(
          data?.message || 'चुकीचा पासवर्ड! केवळ संस्थापक राज्याध्यक्षच हे लॉगिन करू शकतात.'
        );
        return;
      }

      if (data.token) {
        setAuthSessionToken(data.token);
      }

      setIsSuperAdmin(true);
      setIsManageUnlocked(true);
      setIsLettersUnlocked(true);
      setShowPresidentLoginModal(false);
      setActiveSubTab('letters');
      showToast(
        data.isMasterKey
          ? 'संस्थापक राज्याध्यक्ष म्हणून स्वागत आहे (मास्टर की)!'
          : 'संस्थापक राज्याध्यक्ष म्हणून स्वागत आहे!',
        'success'
      );
    } catch (err: any) {
      setPresidentLoginError('लॉगिन करताना त्रुटी आली: ' + (err?.message || 'Error'));
    }
  };

  // Save Initial New Password for State President
  const handleSavePresidentInitialPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPresidentLoginError('');

    if (!newPresidentPass1.trim() || newPresidentPass1.trim().length < 4 || newPresidentPass1.trim() === SUPER_ADMIN_PASSWORD) {
      setPresidentLoginError('कृपया सुरक्षित व नवीन पासवर्ड प्रविष्ट करा (RK2026 व्यतिरिक्त)!');
      return;
    }
    if (newPresidentPass1.trim() !== newPresidentPass2.trim()) {
      setPresidentLoginError('दोन्ही पासवर्ड जुळले नाहीत! कृपया तपासून पहा.');
      return;
    }

    try {
      const newPass = newPresidentPass1.trim();
      const { ok, data } = await authApiRequest<{
        status: string;
        token?: string;
        message?: string;
      }>('/api/auth/president-set-initial-password', { newPassword: newPass });

      if (!ok || data?.status !== 'success') {
        setPresidentLoginError(data?.message || 'पासवर्ड सेव्ह होऊ शकला नाही.');
        return;
      }

      if (data.token) {
        setAuthSessionToken(data.token);
      }
      setPresidentSavedPassword('__CUSTOM__');
      setIsSuperAdmin(true);
      setIsManageUnlocked(true);
      setIsLettersUnlocked(true);
      setShowPresidentLoginModal(false);
      setIsSettingPresidentInitialPassword(false);
      setActiveSubTab('letters');
      showToast('राज्याध्यक्ष नवीन पासवर्ड यशस्वीपणे सेव्ह झाला आहे! यापुढे हाच पासवर्ड वापरा.', 'success');
    } catch (err: any) {
      setPresidentLoginError('त्रुटी: ' + (err.message || 'पासवर्ड सेव्ह होऊ शकला नाही.'));
    }
  };

  // Change President Password from Inside Letters Tab
  const handleChangePresidentPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePassError('');

    if (!changeOldPass.trim()) {
      setChangePassError('कृपया सध्याचा पासवर्ड प्रविष्ट करा!');
      return;
    }
    if (!changeNewPass1.trim() || changeNewPass1.trim().length < 4) {
      setChangePassError('कृपया किमान ४ अक्षरी नवीन व वेगळा पासवर्ड प्रविष्ट करा!');
      return;
    }
    if (changeNewPass1.trim() !== changeNewPass2.trim()) {
      setChangePassError('दोन्ही नवीन पासवर्ड जुळले नाहीत!');
      return;
    }

    try {
      const { ok, data } = await authApiRequest<{ status: string; message?: string }>(
        '/api/auth/president-change-password',
        {
          currentPassword: changeOldPass.trim(),
          newPassword: changeNewPass1.trim(),
        }
      );
      if (!ok || data?.status !== 'success') {
        setChangePassError(data?.message || 'पासवर्ड बदलता आला नाही.');
        return;
      }

      setPresidentSavedPassword('__CUSTOM__');
      setShowChangePresidentPasswordModal(false);
      setChangeOldPass('');
      setChangeNewPass1('');
      setChangeNewPass2('');
      showToast('राज्याध्यक्ष पासवर्ड यशस्वीरीत्या बदलण्यात आला आहे!', 'success');
    } catch (err: any) {
      setChangePassError('त्रुटी: ' + (err.message || 'पासवर्ड बदलता आला नाही.'));
    }
  };

  // Logout from District / Super Admin Session
  const handleLogout = () => {
    clearAuthSessionToken();
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    setIsManageUnlocked(false);
    setIsLettersUnlocked(false);
    setIsSuperAdmin(false);
    setLockedDistrictName(null);
    setActiveSubTab('directory');
    showToast('यशस्वीपणे लॉगआउट केले.', 'success');
  };

  // Open Add Member Modal
  const handleOpenAddModal = () => {
    const activeDist = isSuperAdmin ? currentDistrict : (lockedDistrictName || currentDistrict);
    const latestLocalPosts = getPostsFromStorageSync();
    if (latestLocalPosts.length > 0) {
      setPostsList(latestLocalPosts);
    }
    const initialDefaultPost = latestLocalPosts[0]?.name || postsList[0]?.name || 'जिल्हाध्यक्ष';
    setFormError('');
    setEditingMemberId(null);
    setFormSalutation('श्री.');
    setFormFirstName('');
    setFormMiddleName('');
    setFormLastName('');
    setFormPost(initialDefaultPost);
    setFormDistrict(activeDist);
    setFormTaluka('');
    setFormCadre('केंद्रप्रमुख');
    setCustomCadreInput('');
    setFormWorkingPlace('');
    setFormWorkingTaluka('');
    setFormMobile('');
    setFormPhoto('');
    setFormPhotoUrl('');
    setIsMemberModalOpen(true);

    // Sync latest order/posts from server right as modal opens without blocking UI
    fetchAppointedPosts(true)
      .then((freshPosts) => {
        if (Array.isArray(freshPosts) && freshPosts.length > 0) {
          setPostsList(freshPosts);
          setFormPost((prev) => (prev === initialDefaultPost ? freshPosts[0].name : prev));
        }
      })
      .catch(() => {});
  };

  // Open Edit Member Modal
  const handleOpenEditModal = (m: OfficialMember) => {
    setFormError('');
    if (!isSuperAdmin && lockedDistrictName && m.district !== lockedDistrictName) {
      showToast(`अवैध कृती! आपणास केवळ '${lockedDistrictName}' जिल्ह्यातील पदाधिकारी संपादित करण्याचा अधिकार आहे!`, 'error');
      return;
    }
    const latestLocalPosts = getPostsFromStorageSync();
    if (latestLocalPosts.length > 0) {
      setPostsList(latestLocalPosts);
    }
    fetchAppointedPosts(true)
      .then((freshPosts) => {
        if (Array.isArray(freshPosts) && freshPosts.length > 0) {
          setPostsList(freshPosts);
        }
      })
      .catch(() => {});
    setEditingMemberId(m.id);
    setFormSalutation(m.salutation || 'श्री.');
    setFormFirstName(m.firstName || '');
    setFormMiddleName(m.middleName || '');
    setFormLastName(m.lastName || '');
    setFormPost(m.appointedPost || '');
    setFormDistrict(m.district);
    setFormTaluka(m.taluka || '');
    const normalizedCadre = normalizeOfficialCadre(m.currentCadre);
    if ((OFFICIAL_CADRES as readonly string[]).includes(normalizedCadre)) {
      setFormCadre(normalizedCadre);
      setCustomCadreInput('');
    } else {
      setFormCadre('केंद्रप्रमुख');
      setCustomCadreInput('');
    }
    setFormWorkingPlace(m.workingPlace || '');
    setFormWorkingTaluka(m.taluka || '');
    setFormMobile(m.mobile || '');
    setFormPhoto(m.photo || '');
    setFormPhotoUrl(m.photo && m.photo.startsWith('http') ? m.photo : '');
    setIsMemberModalOpen(true);
  };

  // Save Member to Firebase RTDB
  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!formFirstName.trim() || !formLastName.trim() || !formMobile.trim() || !formWorkingPlace.trim()) {
      setFormError('कृपया सर्व आवश्यक माहिती (नाव, आडनाव, पद, कार्यक्षेत्र, मोबाईल) भरा.');
      return;
    }

    if (isPostNeedsTaluka && !formTaluka.trim()) {
      setFormError('कृपया बहाल केलेल्या तालुक्याचे नाव निवडा.');
      return;
    }

    const finalCadre = normalizeOfficialCadre(formCadre, 'केंद्रप्रमुख');
    // CRITICAL: Only taluka-level posts have an appointed taluka! State, Division, and District posts MUST have an empty taluka!
    const finalTaluka = isPostNeedsTaluka ? formTaluka.trim() : '';

    const memberId = editingMemberId || String(Date.now());
    let finalPhoto = formPhoto.trim();
    if (finalPhoto.startsWith('data:image/')) {
      try {
        finalPhoto = await uploadDataUrlToCloudinary(finalPhoto, `official_${memberId}`);
      } catch (e) {
        console.warn('Could not upload data url to cloudinary:', e);
      }
    }

    const memberObj: OfficialMember = {
      id: memberId,
      salutation: formSalutation,
      firstName: formFirstName.trim(),
      middleName: formMiddleName.trim(),
      lastName: formLastName.trim(),
      appointedPost: formPost,
      district: formDistrict,
      taluka: finalTaluka,
      currentCadre: finalCadre,
      workingPlace: formWorkingPlace.trim(),
      mobile: toEnglishDigits(formMobile.trim()),
      photo: finalPhoto,
      updatedAt: new Date().toISOString()
    };

    try {
      await saveOfficialToRtdb(memberObj);
      setOfficials((prev) => {
        const filtered = prev.filter((x) => x.id !== memberId);
        return [memberObj, ...filtered];
      });
      setIsMemberModalOpen(false);
      showToast('पदाधिकारी माहिती यशस्वीपणे जतन करण्यात आली आहे!', 'success');
    } catch (err: any) {
      setFormError('डेटा सेव्ह करताना त्रुटी आली: ' + err.message);
    }
  };

  // Open Delete Confirmation Modal (NO window.confirm!)
  const handleDeleteMember = (m: OfficialMember) => {
    setMemberToDelete(m);
  };

  // Execute Confirmed Delete in RTDB
  const executeConfirmDelete = async () => {
    if (!memberToDelete) return;
    setIsDeleting(true);
    try {
      await deleteOfficialFromRtdb(memberToDelete.id);
      setOfficials((prev) => prev.filter((x) => x.id !== memberToDelete.id));
      showToast(`'${memberToDelete.salutation} ${memberToDelete.firstName} ${memberToDelete.lastName}' यांचे नाव यादीतून हटवले!`, 'success');
      setMemberToDelete(null);
    } catch (err: any) {
      showToast('हटवताना त्रुटी आली: ' + err.message, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Change District Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim() || newPassword.trim().length < 4) {
      showToast('पासवर्ड किमान 4 अक्षरी असावा.', 'error');
      return;
    }
    const targetDistrict = isSuperAdmin ? formDistrict : (lockedDistrictName || currentDistrict);
    try {
      await updateDistrictPasswordInRtdb(targetDistrict, newPassword.trim());
      setDistrictPasswords((prev) => ({ ...prev, [targetDistrict]: newPassword.trim() }));
      setPasswordChangeSuccess(true);
      showToast('पासवर्ड यशस्वीपणे बदलला!', 'success');
      setTimeout(() => {
        setPasswordChangeSuccess(false);
        setIsPasswordModalOpen(false);
        setNewPassword('');
      }, 1200);
    } catch (err: any) {
      showToast('पासवर्ड बदलताना त्रुटी आली: ' + err.message, 'error');
    }
  };

  // PDF Trigger 1: Single Member A4 Appointment Letter
  const handleDownloadSingleLetterPdf = async () => {
    if (!selectedOfficialForLetter) return;
    setIsGeneratingLetterPdf(true);
    try {
      const serialNo = statewideSerialMap.get(selectedOfficialForLetter.id) || 1;
      await generateSingleLetterPdf(selectedOfficialForLetter, serialNo);
      showToast('नियुक्ती पत्र PDF यशस्वीपणे डाऊनलोड झाले!', 'success');
    } catch (err: any) {
      showToast('PDF तयार करताना त्रुटी आली: ' + err.message, 'error');
    } finally {
      setIsGeneratingLetterPdf(false);
    }
  };

  // Fresh SQL Data Synchronizer for Exports & Matrix (Direct from HostKarle MySQL or synced local cache)
  const ensureFreshSqlData = async (): Promise<{
    freshOfficials: OfficialMember[];
    freshApps: MembershipApplication[];
  }> => {
    try {
      const sqlActive = await isSqlBackendActive();
      const authHeaders = getAuthHeaders();
      const noCacheHeaders: Record<string, string> = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      };

      const fetchFreshApprovedApps = async (): Promise<MembershipApplication[] | null> => {
        if (!sqlActive) {
          const localApproved = await fetchApprovedMembersCached(true);
          return Array.isArray(localApproved) ? localApproved : null;
        }
        // When State President / Admin is logged in, fetch full lite approved list (includes email, centerName, salutation, gender)
        if (authHeaders.Authorization) {
          const authRes = await fetch(
            `/api/db/applications?status=approved&lite=1&refresh=1&_t=${Date.now()}`,
            {
              cache: 'no-store',
              headers: { ...noCacheHeaders, ...authHeaders },
            }
          )
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
          if (Array.isArray(authRes?.items)) {
            return authRes.items;
          }
        }
        // Fallback to approved summary directory
        const summaryRes = await fetch(
          `/api/db/applications?status=approved&summary=1&refresh=1&_t=${Date.now()}`,
          {
            cache: 'no-store',
            headers: noCacheHeaders,
          }
        )
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        if (Array.isArray(summaryRes?.items)) {
          return summaryRes.items;
        }
        const fallback = await fetchApprovedMembersCached(true);
        return Array.isArray(fallback) ? fallback : null;
      };

      const [officialsRes, freshAppsResult] = await Promise.all([
        sqlActive
          ? fetch(`/api/db/rk/officials?_t=${Date.now()}`, {
              cache: 'no-store',
              headers: noCacheHeaders,
            })
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          : Promise.resolve(null),
        fetchFreshApprovedApps(),
      ]);

      let updatedOfficials = officials;
      if (Array.isArray(officialsRes?.items)) {
        updatedOfficials = officialsRes.items.map((item: any) => ({
          id: String(item.id),
          salutation: item.salutation || 'श्री.',
          firstName: item.firstName || item.first_name || '',
          middleName: item.middleName || item.middle_name || '',
          lastName: item.lastName || item.last_name || '',
          appointedPost: item.appointedPost || item.appointed_post || '',
          district: item.district || '',
          taluka: item.taluka || '',
          currentCadre: normalizeOfficialCadre(item.currentCadre || item.current_cadre || ''),
          workingPlace: item.workingPlace || item.working_place || '',
          mobile: toEnglishDigits(item.mobile || ''),
          updatedAt: item.updatedAt || item.updated_at || new Date().toISOString(),
          photo: item.photo || '',
          appointedDate: item.appointedDate || item.appointed_date || '',
          orderNumber: item.orderNumber || item.order_number || ''
        }));
        setOfficials(updatedOfficials);
      }

      let updatedApps = registeredApplications;
      if (Array.isArray(freshAppsResult)) {
        updatedApps = freshAppsResult;
        setRegisteredApplications(updatedApps);
      }

      return { freshOfficials: updatedOfficials, freshApps: updatedApps };
    } catch (err) {
      console.warn('Error fetching fresh SQL data before export:', err);
      return { freshOfficials: officials, freshApps: registeredApplications };
    }
  };

  // 36 Districts Organizational Status Matrix Computation
  const computeMatrixForData = (officialsList: OfficialMember[], appsList: MembershipApplication[]) => {
    return MAHARASHTRA_36_DISTRICTS.map((dist) => {
      const distOfficials = officialsList.filter((o) => {
        if (!o || !o.district) return false;
        return matchesDistrictName(o.district, dist);
      });

      let stateRep = 0;
      let divRep = 0;
      let distOfficial = 0;
      let talukaOfficial = 0;

      distOfficials.forEach((o) => {
        const p = (o.appointedPost || '').trim();
        if (p.includes('राज्य')) {
          stateRep++;
        } else if (p.includes('विभाग') || p.includes('विभागीय')) {
          divRep++;
        } else if (p.includes('तालुका') || isTalukaLevelPost(p)) {
          talukaOfficial++;
        } else {
          // District president (जिल्हाध्यक्ष), District Secretary, and other district posts
          distOfficial++;
        }
      });

      const distApprovedApps = appsList.filter((a) => {
        if (!a || a.status !== 'approved') return false;
        return matchesDistrictName(a.district, dist);
      });

      let extOfficerCount = 0;
      let headmasterCount = 0;

      distApprovedApps.forEach((a) => {
        const prof = normalizeOfficialCadre(a.professional);
        if (prof === 'शिक्षण विस्तार अधिकारी') {
          extOfficerCount++;
        } else {
          headmasterCount++;
        }
      });

      const membersTotal = extOfficerCount + headmasterCount;
      const officialsTotal = stateRep + divRep + distOfficial + talukaOfficial;
      // अंतिम बेरीज ही सदस्य संख्ये एवढीच असावी (पदाधिकारी आधीच सदस्य असल्याने दुबार बेरीज नको)
      const rowTotal = membersTotal;

      return {
        district: dist,
        stateRep,
        divRep,
        distOfficial,
        talukaOfficial,
        officialsTotal,
        extOfficerCount,
        headmasterCount,
        membersTotal,
        rowTotal
      };
    });
  };

  const districtMatrixStats = useMemo(() => {
    return computeMatrixForData(officials, registeredApplications);
  }, [officials, registeredApplications]);

  const matrixTotals = useMemo(() => {
    return districtMatrixStats.reduce(
      (acc, curr) => ({
        stateRep: acc.stateRep + curr.stateRep,
        divRep: acc.divRep + curr.divRep,
        distOfficial: acc.distOfficial + curr.distOfficial,
        talukaOfficial: acc.talukaOfficial + curr.talukaOfficial,
        officialsTotal: acc.officialsTotal + curr.officialsTotal,
        extOfficerCount: acc.extOfficerCount + curr.extOfficerCount,
        headmasterCount: acc.headmasterCount + curr.headmasterCount,
        membersTotal: acc.membersTotal + curr.membersTotal,
        grandTotal: acc.grandTotal + curr.rowTotal
      }),
      {
        stateRep: 0,
        divRep: 0,
        distOfficial: 0,
        talukaOfficial: 0,
        officialsTotal: 0,
        extOfficerCount: 0,
        headmasterCount: 0,
        membersTotal: 0,
        grandTotal: 0
      }
    );
  }, [districtMatrixStats]);

  // Excel Export 1: District Executive List (Pulls fresh SQL data)
  const handleDownloadDistrictExecutiveExcel = async () => {
    try {
      const { freshOfficials } = await ensureFreshSqlData();
      const currentList = filterAndSortDistrictOfficials(freshOfficials, currentDistrict, postsList);
      exportDistrictExecutiveExcel(currentDistrict, currentList);
      showToast(`'${currentDistrict}' जिल्हा कार्यकारिणी एक्सेल फाइल यशस्वीरीत्या डाऊनलोड झाली!`, 'success');
    } catch (err: any) {
      showToast('एक्सेल फाइल तयार करताना त्रुटी: ' + err.message, 'error');
    }
  };

  // Official A4 Print-Ready PDF Export: District Executive List (Pulls fresh SQL data, <= 500 KB)
  const handleDownloadDistrictExecutivePdf = async () => {
    if (isGeneratingDirPdf) return;
    setIsGeneratingDirPdf(true);
    setPdfProgressStatus('ताजी जिल्हा कार्यकारिणी माहिती लोड होत आहे...');
    try {
      const { freshOfficials } = await ensureFreshSqlData();
      const currentList = filterAndSortDistrictOfficials(freshOfficials, currentDistrict, postsList);
      if (currentList.length === 0) {
        showToast(`'${currentDistrict}' जिल्ह्यासाठी कोणताही पदाधिकारी नोंदवलेला नाही.`, 'error');
        return;
      }
      const result = await generateDistrictExecutivePdf(currentDistrict, currentList, (status) => {
        setPdfProgressStatus(status);
      });
      if (result) {
        showToast(
          `'${currentDistrict}' जिल्हा कार्यकारिणी PDF डाऊनलोड झाली! (${toEnglishDigits(result.pageCount)} पाने · ${toEnglishDigits(result.sizeKb)} KB)`,
          'success'
        );
      }
    } catch (err: any) {
      showToast('PDF तयार करताना त्रुटी: ' + (err?.message || 'कृपया पुन्हा प्रयत्न करा.'), 'error');
    } finally {
      setIsGeneratingDirPdf(false);
      setPdfProgressStatus('');
    }
  };

  // Excel Export 2: Statewide Master Registry (Pulls fresh SQL data)
  const handleDownloadStatewideRegistryExcel = async () => {
    try {
      const { freshOfficials } = await ensureFreshSqlData();
      exportStatewideRegistryExcel(freshOfficials);
      showToast('राज्यस्तरीय नियुक्त्या व नोंदवही एक्सेल फाइल यशस्वीपणे डाऊनलोड झाली!', 'success');
    } catch (err: any) {
      showToast('एक्सेल फाइल त्रुटी: ' + err.message, 'error');
    }
  };

  // Excel Export 3: Organization Status Matrix (Pulls fresh SQL data)
  const handleDownloadStatusMatrixExcel = async () => {
    try {
      const { freshOfficials, freshApps } = await ensureFreshSqlData();
      const freshStats = computeMatrixForData(freshOfficials, freshApps);
      exportOrganizationStatusExcel(freshStats);
      showToast('संघटकीय सद्यस्थिती अहवाल एक्सेल फाइल यशस्वीपणे डाऊनलोड झाली!', 'success');
    } catch (err: any) {
      showToast('एक्सेल फाइल त्रुटी: ' + err.message, 'error');
    }
  };

  // Excel Export 4: District Presidents List (Pulls fresh SQL data)
  const handleDownloadDistrictPresidentsExcel = async () => {
    try {
      const { freshOfficials } = await ensureFreshSqlData();
      const distPresidents = freshOfficials
        .filter((o) => (o.appointedPost || '').includes('जिल्हाध्यक्ष'))
        .map((m) => ({
          district: m.district,
          name: `${m.salutation} ${m.firstName} ${m.middleName ? m.middleName + ' ' : ''}${m.lastName}`.trim(),
          cadre: [normalizeOfficialCadre(m.currentCadre, 'केंद्रप्रमुख'), m.workingPlace].filter(Boolean).join(', '),
          post: m.appointedPost,
          mobile: m.mobile || '-'
        }));
      exportDistrictPresidentsExcel(distPresidents);
      showToast('सर्व जिल्हाध्यक्ष यादी एक्सेल फाइल यशस्वीपणे डाऊनलोड झाली!', 'success');
    } catch (err: any) {
      showToast('एक्सेल फाइल त्रुटी: ' + err.message, 'error');
    }
  };

  // Excel Export 5: Taluka Presidents List (Pulls fresh SQL data)
  const handleDownloadTalukaPresidentsExcel = async () => {
    try {
      const { freshOfficials } = await ensureFreshSqlData();
      const talukaPresidents = freshOfficials
        .filter((o) => (o.appointedPost || '').includes('तालुका अध्यक्ष'))
        .map((m) => ({
          district: m.district,
          taluka: m.taluka || '',
          name: `${m.salutation} ${m.firstName} ${m.middleName ? m.middleName + ' ' : ''}${m.lastName}`.trim(),
          cadre: [normalizeOfficialCadre(m.currentCadre, 'केंद्रप्रमुख'), m.workingPlace].filter(Boolean).join(', '),
          post: m.appointedPost,
          mobile: m.mobile || '-'
        }));
      exportTalukaPresidentsExcel(talukaPresidents);
      showToast('सर्व तालुका अध्यक्ष यादी एक्सेल फाइल यशस्वीपणे डाऊनलोड झाली!', 'success');
    } catch (err: any) {
      showToast('एक्सेल फाइल त्रुटी: ' + err.message, 'error');
    }
  };

  // Excel Export 6: Approved Registered Members List (Pulls fresh SQL data)
  const handleDownloadRegisteredMembersExcel = async () => {
    try {
      const { freshApps } = await ensureFreshSqlData();
      const approvedApps = freshApps.filter((a) => a.status === 'approved');
      exportRegisteredMembersExcel(approvedApps);
      showToast('नोंदणीकृत सदस्य यादी एक्सेल फाइल यशस्वीपणे डाऊनलोड झाली!', 'success');
    } catch (err: any) {
      showToast('एक्सेल फाइल त्रुटी: ' + err.message, 'error');
    }
  };

  // WhatsApp Share Helper
  const handleShareOnWhatsApp = (m: OfficialMember) => {
    const serial = statewideSerialMap.get(m.id) || 1;
    const serialPadded = String(serial).padStart(2, '0');
    const fullName = `${m.salutation} ${m.firstName} ${m.middleName ? m.middleName + ' ' : ''}${m.lastName}`;
    const place = isTalukaLevelPost(m.appointedPost) && m.taluka ? `${m.taluka}, जिल्हा - ${m.district}` : `जिल्हा - ${m.district}`;
    const committeeInfo = getAppointmentCommitteeInfo(m.appointedPost, m.taluka);

    const text = `*महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ*\n\n` +
      `॥ *अधिकृत नियुक्ती पत्र* ॥\n` +
      `नियुक्ती पत्र क्र.: MS/2026/${serialPadded}\n\n` +
      `हार्दिक अभिनंदन! 🎉\n` +
      `*${fullName}*\n` +
      `कार्यक्षेत्र: ${place}\n\n` +
      `आपली महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाच्या *${committeeInfo.subjectCommitteeText} आपली निवड*:\n` +
      `⭐ *« ${formatAppointedPostWithTaluka(m.appointedPost, m.taluka)} »* ⭐\n` +
      `या अत्यंत सन्मानाच्या व जबाबदारीच्या पदावर गौरवपूर्ण नियुक्ती करण्यात आली आहे.\n\n` +
      `आपणास मनःपूर्वक शुभेच्छा!\n` +
      `- संस्थापक राज्याध्यक्ष: श्री. राजेंद्र शिवाजी खैरनार`;

    const cleanMobile = (m.mobile || '').replace(/\D/g, '');
    const encoded = encodeURIComponent(text);
    const url = cleanMobile.length === 10
      ? `https://api.whatsapp.com/send?phone=91${cleanMobile}&text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;

    window.open(url, '_blank');
  };

  return (
    <div className="bg-[#f5f7fa] min-h-screen pt-3 pb-6 sm:pt-4 sm:pb-7 text-slate-900">
      <div className="max-w-[1100px] mx-auto px-3 sm:px-4">
        {/* Institutional Page Masthead, District Control & Standard Portal Tabs */}
        <div className="bg-white border border-slate-300 border-t-4 border-t-[#193568] rounded-md mb-4 overflow-hidden">
          <div className="px-4 py-3.5 sm:px-6 sm:py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="text-xs sm:text-sm font-semibold text-slate-600 mb-1">
                महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ · कार्यकारिणी कक्ष
              </div>
              <h1 className="font-serifDevanagari text-2xl sm:text-3xl md:text-4xl font-bold text-[#193568] leading-snug">
                जिल्हा व राज्य पदाधिकारी सूची
              </h1>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs sm:text-sm font-semibold text-slate-700 shrink-0">
                  कार्यकारी जिल्हा:
                </label>
                <select
                  value={currentDistrict}
                  onChange={(e) => {
                    if (lockedDistrictName && !isSuperAdmin) {
                      showToast(`सुरक्षा सूचना: आपण '${lockedDistrictName}' जिल्ह्यामध्ये लॉगिन आहात!`, 'error');
                      return;
                    }
                    setCurrentDistrict(e.target.value);
                  }}
                  disabled={!!lockedDistrictName && !isSuperAdmin}
                  className="flex-1 sm:flex-initial px-3 py-2 border border-slate-300 bg-white text-sm font-semibold text-[#193568] rounded-md focus:outline-none focus:border-[#193568] disabled:bg-slate-100 disabled:cursor-not-allowed cursor-pointer"
                >
                  {MAHARASHTRA_36_DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-2.5 text-xs sm:text-sm border-t sm:border-t-0 pt-2.5 sm:pt-0 border-slate-200">
                <span className="text-slate-600 font-medium tabular-nums">
                  एकूण पदाधिकारी:{' '}
                  <strong className="text-[#193568] font-mono font-bold text-base">
                    {toEnglishDigits(districtOfficials.length)}
                  </strong>
                </span>

                {(isManageUnlocked || isLettersUnlocked || isSuperAdmin) && (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs sm:text-sm font-semibold px-2.5 py-1.5 rounded-md cursor-pointer transition-colors"
                  >
                    लॉगआउट
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => loadData(true)}
                  disabled={isRefreshing}
                  className="bg-[#193568] hover:bg-[#11254a] disabled:opacity-60 text-white px-2.5 py-1.5 rounded-md flex items-center gap-1.5 text-xs sm:text-sm font-semibold cursor-pointer transition-colors"
                  title="रिफ्रेश करा"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">ताजे करा</span>
                </button>
              </div>
            </div>
          </div>

          {/* Standard Horizontal Portal Navigation Tabs */}
          <div className="border-t border-slate-200 bg-slate-50 px-2 sm:px-6 flex items-center gap-0.5 sm:gap-2 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={handleTabClickDirectory}
              className={`px-3 sm:px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeSubTab === 'directory'
                  ? 'border-[#193568] text-[#193568] bg-white'
                  : 'border-transparent text-slate-600 hover:text-[#193568]'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>पदाधिकारी सूची</span>
            </button>

            <button
              type="button"
              onClick={handleTabClickManage}
              className={`px-3 sm:px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeSubTab === 'manage'
                  ? 'border-[#193568] text-[#193568] bg-white'
                  : 'border-transparent text-slate-600 hover:text-[#193568]'
              }`}
            >
              <Building className="w-4 h-4 shrink-0" />
              <span>जिल्हाध्यक्ष</span>
              {!isManageUnlocked && !isSuperAdmin && (
                <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
            </button>

            <button
              type="button"
              onClick={handleTabClickLetters}
              className={`px-3 sm:px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeSubTab === 'letters'
                  ? 'border-[#193568] text-[#193568] bg-white'
                  : 'border-transparent text-slate-600 hover:text-[#193568]'
              }`}
            >
              <Award className="w-4 h-4 shrink-0" />
              <span>राज्याध्यक्ष</span>
              {!isLettersUnlocked && !isSuperAdmin && (
                <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* VIEW 1: पदाधिकारी सूची (सार्वजनिक यादी - ONLY NAMES, NO LETTERS, NO WA) */}
        {/* ========================================================================= */}
        {activeSubTab === 'directory' && (
          <div className="bg-white rounded-md border border-slate-300 overflow-hidden">
            {/* Institutional Header */}
            <div className="bg-[#193568] text-white px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-[#efb24b]">
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-[#efb24b] shrink-0" />
                <h2 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-white leading-snug">
                  जिल्हा कार्यकारणी सूची: {currentDistrict}
                </h2>
              </div>
              <div className="text-xs sm:text-sm text-slate-100 font-medium tabular-nums">
                एकूण पदाधिकारी:{' '}
                <strong className="text-[#efb24b] font-mono text-base font-bold">
                  {toEnglishDigits(districtOfficials.length)}
                </strong>
              </div>
            </div>

            {/* Search Filter Bar */}
            <div className="p-3.5 sm:p-4 bg-slate-50 border-b border-slate-200">
              <div className="relative w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="नाव, पद किंवा तालुका शोधा..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm sm:text-base focus:outline-none focus:border-[#193568] bg-white"
                />
              </div>
            </div>

            {/* Public List (Mobile Clean Rows + Desktop Registry Table) */}
            {isLoading ? (
              <div className="p-12 text-center text-slate-500 bg-white">
                <RefreshCw className="w-7 h-7 mx-auto animate-spin text-[#193568] mb-3" />
                <p className="text-base font-semibold">पदाधिकारी यादी लोड होत आहे...</p>
              </div>
            ) : searchedOfficials.length === 0 ? (
              <div className="p-12 text-center text-slate-500 bg-white">
                <Users className="w-9 h-9 mx-auto text-slate-300 mb-2" />
                <h4 className="font-semibold text-base text-slate-700">
                  या जिल्ह्यात अजून एकही पदाधिकारी नोंदवलेला नाही.
                </h4>
              </div>
            ) : (
              <div className="bg-gradient-to-b from-sky-50/75 via-slate-50/70 to-white p-3.5 sm:p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
                  {searchedOfficials.map((m, idx) => {
                    const displayPost = formatAppointedPostWithTaluka(m.appointedPost, m.taluka);
                    const cadre = normalizeOfficialCadre(m.currentCadre, 'केंद्रप्रमुख');
                    const details = m.workingPlace || '';
                    const tint = OFFICER_CAPSULE_TINTS[idx % OFFICER_CAPSULE_TINTS.length];
                    const fullName = `${m.salutation} ${m.firstName} ${m.middleName ? m.middleName + ' ' : ''}${m.lastName}`.trim();

                    return (
                      <article
                        key={m.id}
                        className={`relative overflow-hidden rounded-3xl ${tint.surface} border ${tint.border} ring-1 ring-inset ${tint.ring} backdrop-blur-md p-4 sm:p-5 shadow-[0_10px_28px_-10px_rgba(14,116,144,0.16),inset_0_1px_1px_rgba(255,255,255,0.95)] hover:shadow-[0_14px_34px_-10px_rgba(14,116,144,0.22),inset_0_1px_1px_rgba(255,255,255,1)] transition-all duration-200 hover:-translate-y-0.5`}
                      >
                        {/* Soft glassy specular highlight & gentle ambient sheen */}
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/85 via-white/35 to-transparent rounded-t-3xl"
                        />
                        <div
                          aria-hidden="true"
                          className={`pointer-events-none absolute -right-8 -top-8 w-28 h-28 rounded-full ${tint.orb} blur-xl`}
                        />

                        <div className="relative z-10 flex items-center gap-4 sm:gap-5">
                          {/* Enlarged Officer Portrait Frame */}
                          {m.photo ? (
                            <img
                              src={m.photo}
                              alt={fullName}
                              loading="lazy"
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"
                              className={`w-24 h-28 sm:w-28 sm:h-32 rounded-2xl object-cover object-top border-2 border-white ring-1 ${tint.photoRing} shadow-md shrink-0 bg-gradient-to-b from-sky-50 to-slate-100`}
                            />
                          ) : (
                            <div
                              className={`w-24 h-28 sm:w-28 sm:h-32 rounded-2xl bg-gradient-to-br from-sky-50 to-slate-100 border-2 border-white ring-1 ${tint.photoRing} flex flex-col items-center justify-center text-sky-400 shrink-0 shadow-sm`}
                            >
                              <ImageIcon className="w-8 h-8" />
                            </div>
                          )}

                          {/* Spacious Officer Information Column */}
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-lg sm:text-xl font-bold text-[#0b2545] leading-snug break-words">
                                {fullName}
                              </h3>
                              <span
                                className={`text-xs font-mono font-bold tabular-nums px-2 py-0.5 rounded-lg border shrink-0 ${tint.serial}`}
                              >
                                {toEnglishDigits(String(idx + 1).padStart(2, '0'))}
                              </span>
                            </div>

                            <div className="text-sm sm:text-base font-bold text-[#9a460b] leading-snug">
                              {displayPost}
                            </div>

                            <div className={`border-t ${tint.divider} pt-1.5 text-xs sm:text-sm text-slate-600 font-medium leading-relaxed`}>
                              <span>{cadre}</span>
                              {details && (
                                <>
                                  <span className="mx-1.5 text-slate-400" aria-hidden="true">·</span>
                                  <span>{details}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: जिल्हा पदाधिकारी व्यवस्थापन (DISTRICT MANAGEMENT) */}
        {/* ========================================================================= */}
        {activeSubTab === 'manage' && (
          <div className="bg-white rounded-md border border-slate-300 overflow-hidden">
            {/* Top Management Header Bar */}
            <div className="bg-[#193568] text-white px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[#efb24b]">
              <div>
                <h2 className="font-serifDevanagari font-bold text-xl sm:text-2xl text-white">
                  जिल्हाध्यक्ष कार्यकारिणी व्यवस्थापन: {currentDistrict}
                </h2>
                <p className="text-slate-200 text-xs sm:text-sm mt-0.5">
                  {isSuperAdmin
                    ? 'राज्याध्यक्ष अधिकार — सर्व ३४ जिल्हे संपादन योग्य'
                    : `फक्त '${currentDistrict}' जिल्हा संपादन अधिकार`}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenAddModal}
                  className="bg-[#df6b16] hover:bg-[#c2590d] text-white text-xs sm:text-sm font-semibold px-3.5 py-2 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  नवीन पदाधिकारी जोडा
                </button>

                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(true)}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/25 text-xs sm:text-sm font-semibold px-3 py-2 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  पासवर्ड बदला
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs sm:text-sm font-semibold px-3 py-2 rounded-md cursor-pointer transition-colors"
                >
                  लॉगआउट
                </button>
              </div>
            </div>

            {/* Management Rows (Mobile) / Table (Desktop) */}
            <div>
              {/* Mobile Rows */}
              <div className="divide-y divide-slate-200 sm:hidden bg-white">
                {districtOfficials.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-sm">
                    या जिल्ह्यात एकही पदाधिकारी नाही. 'नवीन पदाधिकारी जोडा' बटनावर क्लिक करा.
                  </div>
                ) : (
                  districtOfficials.map((m, idx) => {
                    const displayPost = formatAppointedPostWithTaluka(m.appointedPost, m.taluka);
                    const cadre = normalizeOfficialCadre(m.currentCadre, 'केंद्रप्रमुख');
                    const details = m.workingPlace || '';

                    return (
                      <div key={m.id} className="p-3.5 flex flex-col gap-2">
                        <div className="flex items-start gap-2.5">
                          <span className="text-sm font-mono font-bold text-slate-500 w-6 shrink-0 pt-0.5 tabular-nums">
                            {idx + 1}.
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-base font-bold text-[#193568] leading-snug">
                              {m.salutation} {m.firstName} {m.middleName ? m.middleName + ' ' : ''}{m.lastName}
                            </div>
                            <div className="mt-1">
                              <span className="inline-block bg-amber-50/70 text-[#9a460b] border border-amber-200 px-2 py-0.5 rounded text-xs sm:text-sm font-semibold">
                                {displayPost}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-sm text-slate-600 leading-relaxed pl-8 space-y-0.5">
                          <div><strong className="text-slate-800">सध्याचे पद:</strong> {cadre}{details ? ` (${details})` : ''}</div>
                          <div><strong className="text-slate-800">मोबाईल:</strong> <span className="font-mono tabular-nums">{m.mobile}</span></div>
                        </div>

                        <div className="pl-8 pt-1.5 flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(m)}
                            className="flex-1 bg-white hover:bg-slate-50 text-[#193568] border border-slate-300 text-xs sm:text-sm font-semibold py-1.5 px-2.5 rounded-md flex items-center justify-center gap-1 cursor-pointer transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> दुरुस्त करा
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMember(m)}
                            className="flex-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 text-xs sm:text-sm font-semibold py-1.5 px-2.5 rounded-md flex items-center justify-center gap-1 cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> वगळा
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Desktop Table */}
              <div className="hidden sm:block overflow-x-auto bg-white">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-slate-100 text-[#193568] font-bold border-b border-slate-300">
                    <tr>
                      <th className="py-2.5 px-4 w-20 text-center border-r border-slate-200">अनु. क्र.</th>
                      <th className="py-2.5 px-4 text-sm border-r border-slate-200">पदाधिकाऱ्याचे नाव व बहाल केलेले पद</th>
                      <th className="py-2.5 px-4 border-r border-slate-200">सध्याचे पद व कार्यक्षेत्र</th>
                      <th className="py-2.5 px-4 border-r border-slate-200">व्हॉट्सअ‍ॅप नंबर</th>
                      <th className="py-2.5 px-4 text-center w-36">कृती</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {districtOfficials.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          या जिल्ह्यात कोणतेही पदाधिकारी नोंदवलेले नाहीत. कृपया 'नवीन पदाधिकारी जोडा' वर क्लिक करा.
                        </td>
                      </tr>
                    ) : (
                      districtOfficials.map((m, idx) => {
                        const displayPost = formatAppointedPostWithTaluka(m.appointedPost, m.taluka);
                        return (
                          <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4 text-center font-semibold text-slate-600 font-mono tabular-nums border-r border-slate-200">
                              {idx + 1}
                            </td>
                            <td className="py-3 px-4 border-r border-slate-200">
                              <div className="flex flex-col items-start gap-1">
                                <span className="font-bold text-[#193568] text-sm sm:text-base leading-snug">
                                  {m.salutation} {m.firstName} {m.middleName ? m.middleName + ' ' : ''}{m.lastName}
                                </span>
                                <span className="inline-block bg-amber-50/70 text-[#9a460b] border border-amber-200 px-2 py-0.5 rounded text-xs sm:text-sm font-semibold">
                                  {displayPost}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-600 border-r border-slate-200">
                              <strong className="text-slate-800 block text-sm font-semibold">{normalizeOfficialCadre(m.currentCadre, 'केंद्रप्रमुख')}</strong>
                              <span className="text-xs sm:text-sm text-slate-500">{m.workingPlace}</span>
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-700 font-mono tabular-nums border-r border-slate-200">
                              {m.mobile}
                            </td>
                            <td className="py-3 px-4 text-center space-x-1.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(m)}
                                className="bg-white hover:bg-slate-100 text-[#193568] border border-slate-300 font-semibold px-2.5 py-1.5 rounded text-xs sm:text-sm inline-flex items-center gap-1 cursor-pointer transition-colors"
                                title="दुरुस्त करा"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>दुरुस्त</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteMember(m)}
                                className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-semibold px-2.5 py-1.5 rounded text-xs sm:text-sm inline-flex items-center gap-1 cursor-pointer transition-colors"
                                title="वगळा"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>वगळा</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 3: राज्याध्यक्ष लॉगिन (नियुक्ती पत्रे व WhatsApp - STATE PRESIDENT) */}
        {/* ========================================================================= */}
        {activeSubTab === 'letters' && (
          <div className="space-y-4">
            <div className="bg-white rounded-md border border-slate-300 overflow-hidden">
              {/* Institutional Header Band */}
              <div className="bg-[#193568] text-white px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-[#efb24b]">
                <div>
                  <h2 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-white">
                    अधिकृत नियुक्ती पत्र वितरण व प्रेषण
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-200 mt-0.5 tabular-nums">
                    जिल्हा: <strong className="text-white">{currentDistrict}</strong> · एकूण पदाधिकारी:{' '}
                    <strong className="text-[#efb24b] font-mono">{districtOfficials.length}</strong>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setChangePassError('');
                    setChangeOldPass('');
                    setChangeNewPass1('');
                    setChangeNewPass2('');
                    setShowChangePresidentPasswordModal(true);
                  }}
                  className="self-start sm:self-auto bg-white/10 hover:bg-white/20 text-white border border-white/25 text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="राज्याध्यक्ष पासवर्ड बदला"
                >
                  <KeyRound className="w-3.5 h-3.5 text-[#efb24b]" />
                  पासवर्ड बदला
                </button>
              </div>

              {/* Clean Institutional Report & Export Toolbar */}
              <div className="p-3.5 sm:p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowStatusMatrixModal(true);
                    ensureFreshSqlData();
                  }}
                  className="bg-[#193568] hover:bg-[#11254a] text-white text-xs sm:text-sm font-semibold px-3.5 py-2 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="महाराष्ट्रातील सर्व 34 जिल्ह्यांचा संघटनात्मक सद्यस्थिती तक्ता पहा व डाऊनलोड करा"
                >
                  <Eye className="w-3.5 h-3.5 text-[#efb24b]" />
                  संघटना सद्यस्थिती (34 जिल्हे)
                </button>

                <button
                  type="button"
                  onClick={handleDownloadDistrictExecutiveExcel}
                  disabled={districtOfficials.length === 0}
                  className="bg-[#df6b16] hover:bg-[#c2590d] text-white text-xs sm:text-sm font-semibold px-3.5 py-2 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                  title="या जिल्ह्याची अधिकृत कार्यकारिणी Excel (XLSX) फाइल डाऊनलोड करा"
                >
                  <FileText className="w-3.5 h-3.5" />
                  जिल्हा कार्यकारिणी (Excel)
                </button>

                <button
                  type="button"
                  onClick={handleDownloadDistrictExecutivePdf}
                  disabled={districtOfficials.length === 0 || isGeneratingDirPdf}
                  className="bg-[#0b1e36] hover:bg-[#193568] text-white text-xs sm:text-sm font-semibold px-3.5 py-2 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                  title="या जिल्ह्याची लेटरपॅड व स्वाक्षरीसह प्रिंट-योग्य अधिकृत A4 PDF (≤ 500 KB) डाऊनलोड करा"
                >
                  {isGeneratingDirPdf ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#efb24b]" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-[#efb24b]" />
                  )}
                  {isGeneratingDirPdf ? 'PDF तयार होत आहे...' : 'जिल्हा कार्यकारिणी (PDF)'}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadDistrictPresidentsExcel}
                  className="bg-white hover:bg-slate-100 text-[#193568] border border-slate-300 text-xs sm:text-sm font-semibold px-3 py-2 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="महाराष्ट्रातील सर्व जिल्हाध्यक्षांची अधिकृत एक्सेल फाइल"
                >
                  <Download className="w-3.5 h-3.5" />
                  सर्व जिल्हाध्यक्ष (Excel)
                </button>

                <button
                  type="button"
                  onClick={handleDownloadTalukaPresidentsExcel}
                  className="bg-white hover:bg-slate-100 text-[#193568] border border-slate-300 text-xs sm:text-sm font-semibold px-3 py-2 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="महाराष्ट्रातील सर्व तालुकाध्यक्षांची अधिकृत एक्सेल फाइल"
                >
                  <Download className="w-3.5 h-3.5" />
                  सर्व तालुका अध्यक्ष (Excel)
                </button>

                <button
                  type="button"
                  onClick={handleDownloadRegisteredMembersExcel}
                  className="bg-white hover:bg-slate-100 text-[#193568] border border-slate-300 text-xs sm:text-sm font-semibold px-3 py-2 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="वेबसाईटवर मंजूर झालेले सर्व अधिकृत सदस्य एक्सेल फाइल"
                >
                  <Download className="w-3.5 h-3.5" />
                  नोंदणीकृत सदस्य (Excel)
                </button>

                <button
                  type="button"
                  onClick={handleDownloadStatewideRegistryExcel}
                  disabled={officials.length === 0}
                  className="bg-white hover:bg-slate-100 text-[#193568] border border-slate-300 text-xs sm:text-sm font-semibold px-3 py-2 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                  title="राज्यस्तरीय नियुक्त्या व नोंदवही एक्सेल फाइल"
                >
                  <Download className="w-3.5 h-3.5" />
                  नियुक्ती नोंदवही (Excel)
                </button>
              </div>

              {/* PDF Render Progress Notice */}
              {(isGeneratingDirPdf || isGeneratingRegistryPdf) && (
                <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-sm font-semibold flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#df6b16] shrink-0" />
                  <span>{pdfProgressStatus || 'कृपया वाट पहा, PDF तयार होत आहे...'}</span>
                </div>
              )}

              {/* Members List with प्रमाणपत्र पहा & WhatsApp */}
              <div>
                {/* Mobile Clean Rows */}
                <div className="divide-y divide-slate-200 sm:hidden bg-white">
                  {districtOfficials.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-sm">
                      माहिती उपलब्ध नाही.
                    </div>
                  ) : (
                    districtOfficials.map((m, idx) => {
                      const displayPost = formatAppointedPostWithTaluka(m.appointedPost, m.taluka);

                      return (
                        <div key={m.id} className="p-3.5 flex flex-col gap-2">
                          <div className="flex items-start gap-2.5">
                            <span className="text-sm font-mono font-bold text-slate-500 w-6 shrink-0 pt-0.5 tabular-nums">
                              {idx + 1}.
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-base font-bold text-[#193568] leading-snug">
                                {m.salutation} {m.firstName} {m.middleName ? m.middleName + ' ' : ''}{m.lastName}
                              </div>
                              <div className="mt-1">
                                <span className="inline-block bg-amber-50/70 text-[#9a460b] border border-amber-200 px-2 py-0.5 rounded text-xs sm:text-sm font-semibold">
                                  {displayPost}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="pl-8 pt-1 flex flex-col gap-1.5">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedOfficialForLetter(m)}
                                className="flex-1 bg-[#193568] hover:bg-[#11254a] text-white text-xs sm:text-sm font-semibold py-2 px-3 rounded-md flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                प्रमाणपत्र पहा
                              </button>
                              <button
                                type="button"
                                onClick={() => handleShareOnWhatsApp(m)}
                                className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold py-2 px-3 rounded-md flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                                WhatsApp
                              </button>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(m)}
                                className="flex-1 bg-white hover:bg-slate-50 text-[#193568] border border-slate-300 text-xs sm:text-sm font-semibold py-1.5 px-2.5 rounded-md flex items-center justify-center gap-1 cursor-pointer transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" /> दुरुस्त करा
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteMember(m)}
                                className="flex-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 text-xs sm:text-sm font-semibold py-1.5 px-2.5 rounded-md flex items-center justify-center gap-1 cursor-pointer transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> वगळा
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto bg-white">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-slate-100 text-[#193568] font-bold border-b border-slate-300">
                      <tr>
                        <th className="py-2.5 px-4 w-20 text-center border-r border-slate-200">अनु. क्र.</th>
                        <th className="py-2.5 px-4 text-sm border-r border-slate-200">पदाधिकाऱ्याचे नाव</th>
                        <th className="py-2.5 px-4 border-r border-slate-200">बहाल केलेले पद</th>
                        <th className="py-2.5 px-4 text-center border-r border-slate-200">प्रमाणपत्र</th>
                        <th className="py-2.5 px-4 text-center border-r border-slate-200">व्हॉट्सअ‍ॅप</th>
                        <th className="py-2.5 px-4 text-center">कृती</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {districtOfficials.map((m, idx) => (
                        <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 text-center font-semibold text-slate-600 font-mono tabular-nums border-r border-slate-200">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4 font-bold text-[#193568] text-sm sm:text-base border-r border-slate-200">
                            {m.salutation} {m.firstName} {m.middleName ? m.middleName + ' ' : ''}{m.lastName}
                          </td>
                          <td className="py-3 px-4 border-r border-slate-200">
                            <span className="font-semibold text-[#9a460b]">
                              {formatAppointedPostWithTaluka(m.appointedPost, m.taluka)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center border-r border-slate-200">
                            <button
                              type="button"
                              onClick={() => setSelectedOfficialForLetter(m)}
                              className="bg-[#193568] hover:bg-[#11254a] text-white text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1 cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              प्रमाणपत्र पहा
                            </button>
                          </td>
                          <td className="py-3 px-4 text-center border-r border-slate-200">
                            <button
                              type="button"
                              onClick={() => handleShareOnWhatsApp(m)}
                              className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                              WhatsApp
                            </button>
                          </td>
                          <td className="py-3 px-4 text-center space-x-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(m)}
                              className="bg-white hover:bg-slate-100 text-[#193568] border border-slate-300 font-semibold p-1.5 rounded text-xs inline-flex items-center cursor-pointer transition-colors"
                              title="दुरुस्त करा"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMember(m)}
                              className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-semibold p-1.5 rounded text-xs inline-flex items-center cursor-pointer transition-colors"
                              title="वगळा"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* IN-PAGE MODAL 1: DISTRICT PRESIDENT LOGIN (जिल्हाध्यक्ष लॉगिन) */}
      {/* ========================================================================= */}
      {showDistrictLoginModal && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[9999] w-screen h-[100dvh] overflow-y-auto overscroll-contain bg-slate-900/65 backdrop-blur-sm flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-xl border border-slate-300 shadow-2xl max-w-sm w-full text-sm overflow-hidden max-h-[90dvh] flex flex-col">
            <div className="bg-[#193568] text-white px-5 py-3.5 flex items-center justify-between border-b-2 border-[#efb24b]">
              <div className="flex items-center gap-2">
                {!isSettingInitialPassword ? (
                  <Lock className="w-4 h-4 text-[#efb24b] shrink-0" />
                ) : (
                  <KeyRound className="w-4 h-4 text-[#efb24b] shrink-0" />
                )}
                <h3 className="font-serifDevanagari text-lg font-bold">
                  {!isSettingInitialPassword
                    ? `'${currentDistrict}' जिल्हाध्यक्ष लॉगिन`
                    : `नवीन पासवर्ड सेट करा (${currentDistrict})`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDistrictLoginModal(false)}
                className="text-slate-300 hover:text-white p-1 cursor-pointer"
                aria-label="बंद करा"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              {!isSettingInitialPassword ? (
                <div>
                  <p className="text-sm text-slate-600 mb-3.5">
                    जिल्ह्यातील पदाधिकारी व्यवस्थापनासाठी अधिकृत पासवर्ड प्रविष्ट करा.
                  </p>

                  <form onSubmit={handleDistrictLoginSubmit} className="space-y-3.5">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        पासवर्ड:
                      </label>
                      <input
                        type="password"
                        autoFocus
                        required
                        placeholder="गोपनीय पासवर्ड प्रविष्ट करा"
                        value={districtPasswordInput}
                        onChange={(e) => setDistrictPasswordInput(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-md text-sm sm:text-base focus:outline-none focus:border-[#193568]"
                      />
                    </div>

                    {districtLoginError && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-sm font-semibold">
                        {districtLoginError}
                      </div>
                    )}

                    <div className="pt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowDistrictLoginModal(false)}
                        className="flex-1 py-2.5 border border-slate-300 rounded-md font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        रद्द करा
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-2.5 bg-[#193568] hover:bg-[#11254a] text-white rounded-md font-semibold cursor-pointer"
                      >
                        लॉगिन करा
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-slate-600 mb-3.5">
                    हा पहिला लॉगिन आहे. कृपया आपल्या जिल्ह्यासाठी सुरक्षित पासवर्ड तयार करा.
                  </p>

                  <form onSubmit={handleSaveInitialPassword} className="space-y-3">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">नवीन पासवर्ड:</label>
                      <input
                        type="password"
                        required
                        placeholder="नवीन पासवर्ड टाका"
                        value={newInitialPass1}
                        onChange={(e) => setNewInitialPass1(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-[#193568]"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">पासवर्ड पुन्हा टाका:</label>
                      <input
                        type="password"
                        required
                        placeholder="Confirm Password"
                        value={newInitialPass2}
                        onChange={(e) => setNewInitialPass2(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-[#193568]"
                      />
                    </div>

                    {districtLoginError && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-xs font-semibold">
                        {districtLoginError}
                      </div>
                    )}

                    <div className="pt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsSettingInitialPassword(false)}
                        className="flex-1 py-2.5 border border-slate-300 rounded-md font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        मागे जा
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md font-semibold cursor-pointer"
                      >
                        जतन करा
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
          </div>
        </ModalPortal>
      )}

      {/* ========================================================================= */}
      {/* IN-PAGE MODAL 2: STATE PRESIDENT MASTER LOGIN (राज्याध्यक्ष लॉगिन) */}
      {/* ========================================================================= */}
      {showPresidentLoginModal && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[9999] w-screen h-[100dvh] overflow-y-auto overscroll-contain bg-slate-900/65 backdrop-blur-sm flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-xl border border-slate-300 shadow-2xl max-w-sm w-full text-sm overflow-hidden max-h-[90dvh] flex flex-col">
            <div className="bg-[#193568] text-white px-5 py-3.5 flex items-center justify-between border-b-2 border-[#efb24b]">
              <div className="flex items-center gap-2">
                {!isSettingPresidentInitialPassword ? (
                  <Award className="w-4 h-4 text-[#efb24b] shrink-0" />
                ) : (
                  <KeyRound className="w-4 h-4 text-[#efb24b] shrink-0" />
                )}
                <h3 className="font-serifDevanagari text-lg font-bold">
                  {!isSettingPresidentInitialPassword
                    ? 'राज्याध्यक्ष लॉगिन'
                    : 'राज्याध्यक्ष: नवीन पासवर्ड सेट करा'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPresidentLoginModal(false)}
                className="text-slate-300 hover:text-white p-1 cursor-pointer"
                aria-label="बंद करा"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              {!isSettingPresidentInitialPassword ? (
                <>
                  <p className="text-sm text-slate-600 mb-3.5">
                    संस्थापक राज्याध्यक्ष अधिकृत पासवर्ड प्रविष्ट करा:
                  </p>

                  <form onSubmit={handlePresidentLoginSubmit} className="space-y-3.5">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        पासवर्ड:
                      </label>
                      <input
                        type="password"
                        autoFocus
                        required
                        placeholder="गोपनीय पासवर्ड प्रविष्ट करा"
                        value={presidentPasswordInput}
                        onChange={(e) => setPresidentPasswordInput(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-md text-sm sm:text-base focus:outline-none focus:border-[#193568]"
                      />
                    </div>

                    {presidentLoginError && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-sm font-semibold">
                        {presidentLoginError}
                      </div>
                    )}

                    <div className="pt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowPresidentLoginModal(false)}
                        className="flex-1 py-2.5 border border-slate-300 rounded-md font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        रद्द करा
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-2.5 bg-[#193568] hover:bg-[#11254a] text-white rounded-md font-semibold cursor-pointer"
                      >
                        प्रवेश करा
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div>
                  <p className="text-sm text-slate-600 mb-3.5 leading-relaxed">
                    आपण प्रथमच लॉगिन करत आहात. सुरक्षिततेसाठी आपला स्वतःचा नवीन पासवर्ड तयार करा (हा पासवर्ड फायरबेसवर जतन होईल).
                  </p>

                  <form onSubmit={handleSavePresidentInitialPassword} className="space-y-3.5">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">नवीन पासवर्ड:</label>
                      <input
                        type="password"
                        required
                        autoFocus
                        placeholder="उदा. Rajendra@2026"
                        value={newPresidentPass1}
                        onChange={(e) => setNewPresidentPass1(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-[#193568]"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">नवीन पासवर्ड पुन्हा टाका:</label>
                      <input
                        type="password"
                        required
                        placeholder="Confirm Password"
                        value={newPresidentPass2}
                        onChange={(e) => setNewPresidentPass2(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-[#193568]"
                      />
                    </div>

                    {presidentLoginError && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-xs font-semibold">
                        {presidentLoginError}
                      </div>
                    )}

                    <div className="pt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsSettingPresidentInitialPassword(false)}
                        className="flex-1 py-2.5 border border-slate-300 rounded-md font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        मागे जा
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md font-semibold cursor-pointer"
                      >
                        जतन करा व प्रवेश करा
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
          </div>
        </ModalPortal>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CHANGE PRESIDENT PASSWORD (राज्याध्यक्ष पासवर्ड बदला) */}
      {/* ========================================================================= */}
      {showChangePresidentPasswordModal && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[9999] w-screen h-[100dvh] overflow-y-auto overscroll-contain bg-slate-900/65 backdrop-blur-sm flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-xl border border-slate-300 shadow-2xl max-w-sm w-full text-sm overflow-hidden max-h-[90dvh] flex flex-col">
            <div className="bg-[#193568] text-white px-5 py-3.5 flex items-center justify-between border-b-2 border-[#efb24b]">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#efb24b] shrink-0" />
                <h3 className="font-serifDevanagari text-lg font-bold">
                  राज्याध्यक्ष पासवर्ड बदला
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowChangePresidentPasswordModal(false)}
                className="text-slate-300 hover:text-white p-1 cursor-pointer"
                aria-label="बंद करा"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              <p className="text-sm text-slate-600 mb-3.5">
                नवीन पासवर्ड थेट फायरबेसवर सुरक्षित सेव्ह केला जाईल.
              </p>

              <form onSubmit={handleChangePresidentPassword} className="space-y-3.5">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    सध्याचा पासवर्ड:
                  </label>
                  <input
                    type="password"
                    required
                    autoFocus
                    placeholder="सध्याचा पासवर्ड टाका"
                    value={changeOldPass}
                    onChange={(e) => setChangeOldPass(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-[#193568]"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    नवीन पासवर्ड:
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="नवीन सुरक्षित पासवर्ड"
                    value={changeNewPass1}
                    onChange={(e) => setChangeNewPass1(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-[#193568]"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    नवीन पासवर्ड पुन्हा टाका:
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="नवीन पासवर्ड पुन्हा टाका"
                    value={changeNewPass2}
                    onChange={(e) => setChangeNewPass2(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-[#193568]"
                  />
                </div>

                {changePassError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-xs font-semibold">
                    {changePassError}
                  </div>
                )}

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowChangePresidentPasswordModal(false)}
                    className="flex-1 py-2.5 border border-slate-300 rounded-md font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    रद्द करा
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-[#193568] hover:bg-[#11254a] text-white rounded-md font-semibold cursor-pointer"
                  >
                    पासवर्ड अपडेट करा
                  </button>
                </div>
              </form>
            </div>
          </div>
          </div>
        </ModalPortal>
      )}

      {/* ========================================================================= */}
      {/* MODAL: A4 APPOINTMENT LETTER PREVIEW & HIGH-QUALITY PDF */}
      {/* ========================================================================= */}
      {selectedOfficialForLetter && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[9999] w-screen h-[100dvh] overflow-y-auto overscroll-contain bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-xl border border-slate-300 shadow-2xl max-w-4xl w-full max-h-[94dvh] flex flex-col overflow-hidden">
            {/* Modal Controls Bar */}
            <div className="p-3 sm:p-4 bg-[#193568] text-white flex flex-wrap items-center justify-between gap-3 shrink-0 border-b-2 border-[#efb24b]">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-[#efb24b]" />
                <h3 className="font-serifDevanagari text-base sm:text-lg font-bold">
                  अधिकृत नियुक्ती पत्र (A4 पूर्वदृश्य)
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadSingleLetterPdf}
                  disabled={isGeneratingLetterPdf}
                  className="bg-[#df6b16] hover:bg-[#c2590d] text-white text-xs font-semibold px-3.5 py-2 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <Download className={`w-3.5 h-3.5 ${isGeneratingLetterPdf ? 'animate-spin' : ''}`} />
                  {isGeneratingLetterPdf ? 'डाऊनलोड होत आहे...' : 'PDF डाऊनलोड'}
                </button>

                <button
                  type="button"
                  onClick={() => handleShareOnWhatsApp(selectedOfficialForLetter)}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-3 py-2 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  WhatsApp
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedOfficialForLetter(null)}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/25 text-xs font-semibold px-3 py-2 rounded-md cursor-pointer transition-colors"
                >
                  बंद करा
                </button>
              </div>
            </div>

            {/* Scrollable Letter Preview Area */}
            <div className="overflow-y-auto p-4 sm:p-8 bg-slate-100 flex justify-center">
              <div
                id="printableCertificate"
                className="bg-white text-slate-900 w-full max-w-[760px] p-6 sm:p-9 shadow-md border border-[#b8860b] relative font-sans leading-relaxed text-sm select-text"
                style={{ minHeight: '980px' }}
              >
                {/* Header Banner */}
                <div className="border-b-2 border-[#b8860b] pb-3 mb-4 text-center">
                  <img
                    src="/heding.jpg"
                    alt="महासंघ चिन्ह व लेटरपॅड"
                    className="w-full h-auto max-h-56 object-contain mx-auto mb-1"
                  />
                </div>

                {/* Outward No & Date Row */}
                <div className="flex justify-between items-center text-xs font-bold text-slate-800 border-b border-slate-300 pb-1.5 mb-3">
                  <div>
                    नियुक्ती पत्र क्र.: <span className="font-mono text-[#851216] text-sm">
                      MS/2026/{String(statewideSerialMap.get(selectedOfficialForLetter.id) || 1).padStart(2, '0')}
                    </span>
                  </div>
                  <div>
                    दिनांक: <span className="font-mono text-slate-900">
                      {formatDateWithEnglishDigits(new Date())}
                    </span>
                  </div>
                </div>

                {/* Official Title Header */}
                <div className="text-center my-3">
                  <span className="inline-block bg-[#851216] text-white text-base sm:text-lg font-bold font-serifDevanagari px-8 py-1 rounded border border-[#b8860b]">
                    ॥ अधिकृत नियुक्ती पत्र ॥
                  </span>
                </div>

                {/* Recipient Block */}
                <div className="bg-slate-50 border-l-4 border-[#193568] p-3 my-3 text-xs sm:text-sm">
                  <p className="font-bold text-slate-600">प्रति,</p>
                  <h2 className="font-serifDevanagari text-xl font-bold text-[#193568] mt-0.5">
                    मा. {selectedOfficialForLetter.salutation} {selectedOfficialForLetter.firstName}{' '}
                    {selectedOfficialForLetter.middleName ? selectedOfficialForLetter.middleName + ' ' : ''}
                    {selectedOfficialForLetter.lastName}
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    ({normalizeOfficialCadre(selectedOfficialForLetter.currentCadre, 'केंद्रप्रमुख')}
                    {selectedOfficialForLetter.workingPlace ? `, ${selectedOfficialForLetter.workingPlace}` : ''},
                    जिल्हा - {selectedOfficialForLetter.district})
                  </p>
                </div>

                {/* Subject */}
                <div className="font-bold text-xs sm:text-sm text-slate-900 mb-3">
                  {getAppointmentCommitteeInfo(selectedOfficialForLetter.appointedPost, selectedOfficialForLetter.taluka).subjectText}
                </div>

                {/* Body Paragraphs */}
                <div className="space-y-2.5 text-xs sm:text-[13px] text-justify text-slate-900 leading-relaxed">
                  <p className="font-bold text-slate-900">सस्नेह नमस्कार,</p>
                  <p className="indent-5">
                    महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ हा राज्यातील शिक्षण क्षेत्राच्या रुपांतरणासाठी झटणाऱ्या केंद्रप्रमुख व विस्तार अधिकारी संघटनांच्या हक्कासाठी, व्यावसायिक स्वाभिमानासाठी आणि गुणवत्तापूर्ण शिक्षणासाठी कटिबद्ध असलेली अग्रगण्य संघटना आहे. महासंघाच्या सर्व सदस्यांच्या उत्स्फूर्त प्रतिसादानुसार आणि जिल्हा सभेत निवड प्रक्रियेत लोकशाहीच्या मूल्यांचा आदर करत सर्वानुमते हा निर्णय घेण्यात आला आहे.
                  </p>
                  <p className="indent-5">
                    आपला प्रदीर्घ आणि निष्कलंक सेवाप्रवास, शाळा-शिक्षणाविषयी असलेली तळमळ, उत्कृष्ट प्रशासकीय समन्वय आणि संघटनकौशल्यावरील आपली अढळ निष्ठा आम्ही अत्यंत जवळून अनुभवली आहे. सहकाऱ्यांच्या अडीअडचणीत धावून जाण्याची आपली वृत्ती आणि नेतृत्वगुणांची सार्थ दखल घेत, सर्व सदस्यांच्या बहुमताने व राज्य कार्यकारिणीच्या निर्णयानुसार आपणास—
                  </p>
                </div>

                {/* Appointment Callout Box */}
                <div className="my-5 p-3.5 rounded-md border border-[#b8860b] bg-[#fffdf7] text-center">
                  <p className="text-xs sm:text-sm text-slate-700 font-semibold">
                    महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाच्या{' '}
                    <strong className="text-slate-950 text-base">
                      {getAppointmentCommitteeInfo(selectedOfficialForLetter.appointedPost, selectedOfficialForLetter.taluka).subjectCommitteeText}
                    </strong>{' '}
                    आपली निवड
                  </p>

                  <div className="my-2 inline-block font-serifDevanagari text-xl sm:text-2xl font-bold text-[#851216] tracking-wide">
                    « {formatAppointedPostWithTaluka(selectedOfficialForLetter.appointedPost, selectedOfficialForLetter.taluka)} »
                  </div>

                  <p className="text-xs sm:text-sm font-bold text-[#851216]">
                    या अत्यंत सन्मानाच्या व जबाबदारीच्या पदावर गौरवपूर्ण नियुक्ती करण्यात येत आहे.
                  </p>
                </div>

                {/* Concluding Blessing */}
                <div className="text-xs sm:text-[13px] text-justify text-slate-900 leading-relaxed mb-6">
                  <p className="indent-5">
                    हे पद केवळ सन्मानाचे प्रतीक नसून महासंघाच्या पवित्र विचारांचे धोरण आहे. केंद्रप्रमुख व विस्तार अधिकारी संवर्गाचे न्याय प्रश्न सोडवणे, आत्मसन्मान जपणे आणि सर्व सहकाऱ्यांच्या पाठीशी खंबीरपणे उभे राहणे हीच आपली मुख्य जबाबदारी आहे. सर्व सदस्यांनी आपल्यावर दाखवलेला हा विश्वास आणि आपल्या दूरदर्शी नेतृत्वाखाली संघटनेची पताका निश्चितच अभिमानाने गगनभरारी घेईल, हा ठाम विश्वास आहे. या मानाच्या नियुक्तीबद्दल आपले मनःपूर्वक अभिनंदन व भावी वाटचालीस हार्दिक शुभेच्छा!
                  </p>
                </div>

                {/* Dual Signature Row */}
                <div className="pt-6 border-t border-slate-200 grid grid-cols-2 gap-6 text-center text-xs">
                  <div className="flex flex-col justify-end items-center">
                    <div className="h-12"></div>
                    <strong className="font-bold text-slate-900 block font-serifDevanagari text-sm">
                      ( श्री. विजय सावंत )
                    </strong>
                    <span className="text-[11px] text-slate-600 font-medium">
                      राज्य सरचिटणीस<br />महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ
                    </span>
                  </div>

                  <div className="flex flex-col justify-end items-center">
                    <div className="h-12 flex items-center justify-center">
                      <img
                        src="/sign.jpg"
                        alt="राज्याध्यक्ष स्वाक्षरी"
                        className="h-12 object-contain"
                      />
                    </div>
                    <strong className="font-bold text-[#851216] block font-serifDevanagari text-sm">
                      ( श्री. राजेंद्र शिवाजी खैरनार )
                    </strong>
                    <span className="text-[11px] text-slate-600 font-medium">
                      संस्थापक राज्याध्यक्ष<br />महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </ModalPortal>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT OFFICIAL */}
      {/* ========================================================================= */}
      {isMemberModalOpen && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[9999] w-screen h-[100dvh] overflow-y-auto overscroll-contain bg-slate-900/65 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-xl border border-slate-300 shadow-2xl max-w-lg w-full text-sm max-h-[90dvh] flex flex-col overflow-hidden">
              <div className="bg-[#193568] text-white px-5 py-3.5 flex items-center justify-between border-b-2 border-[#efb24b] shrink-0">
                <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold">
                  {editingMemberId ? 'पदाधिकारी माहिती दुरुस्ती' : `नवीन पदाधिकारी नोंदणी (${formDistrict} जिल्हा)`}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsMemberModalOpen(false)}
                  className="text-slate-300 hover:text-white p-1 cursor-pointer"
                  aria-label="बंद करा"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveMember} className="p-5 space-y-3.5 overflow-y-auto flex-1 overscroll-contain">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-300 text-rose-700 rounded-md text-sm font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">आदरार्थी *</label>
                  <select
                    value={formSalutation}
                    onChange={(e) => setFormSalutation(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-md bg-white focus:outline-none focus:border-[#193568]"
                  >
                    <option value="श्री.">श्री.</option>
                    <option value="श्रीमती">श्रीमती</option>
                    <option value="सौ.">सौ.</option>
                    <option value="डॉ.">डॉ.</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="font-semibold text-slate-700 block mb-1">जिल्हा (लॉक):</label>
                  <input
                    type="text"
                    value={formDistrict}
                    readOnly
                    className="w-full p-2 border border-slate-300 rounded-md bg-slate-100 font-semibold text-slate-700 cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">प्रथम नाव *</label>
                  <input
                    type="text"
                    required
                    placeholder="उदा. विलास"
                    value={formFirstName}
                    onChange={(e) => setFormFirstName(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:border-[#193568]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">मधले नाव *</label>
                  <input
                    type="text"
                    required
                    placeholder="उदा. हनुमंतराव"
                    value={formMiddleName}
                    onChange={(e) => setFormMiddleName(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:border-[#193568]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">आडनाव *</label>
                  <input
                    type="text"
                    required
                    placeholder="उदा. यादव"
                    value={formLastName}
                    onChange={(e) => setFormLastName(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:border-[#193568]"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">सध्याचे संवर्ग पद *</label>
                <select
                  value={(OFFICIAL_CADRES as readonly string[]).includes(formCadre) ? formCadre : 'केंद्रप्रमुख'}
                  onChange={(e) => setFormCadre(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white font-medium focus:outline-none focus:border-[#193568]"
                >
                  {OFFICIAL_CADRES.map((cadre) => (
                    <option key={cadre} value={cadre}>
                      {cadre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">मूळ कार्यरत केंद्र / शाळा / बीट *</label>
                  <input
                    type="text"
                    required
                    placeholder="उदा. केंद्र - गंगापूर"
                    value={formWorkingPlace}
                    onChange={(e) => setFormWorkingPlace(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:border-[#193568]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">शाळा / नोकरीचा तालुका (ऐच्छिक)</label>
                  <select
                    value={formWorkingTaluka}
                    onChange={(e) => setFormWorkingTaluka(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-md bg-white focus:outline-none focus:border-[#193568]"
                  >
                    <option value="">-- शाळा / नोकरीचा तालुका --</option>
                    {formAvailableTalukas.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className={isPostNeedsTaluka ? '' : 'sm:col-span-2'}>
                  <label htmlFor="appointed-post-select" className="font-semibold text-slate-700 block mb-1">बहाल करण्यात येणारे पद *</label>
                  <select
                    id="appointed-post-select"
                    value={formPost}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormPost(val);
                      const matched = postsList.find((p) => p.name === val);
                      if (!isTalukaLevelPost(val, matched?.isTaluka, matched?.level)) {
                        setFormTaluka('');
                      }
                    }}
                    className="w-full p-2 border border-slate-300 rounded-md bg-white font-semibold focus:outline-none focus:border-[#193568]"
                  >
                    {postsList.map((p, idx) => (
                      <option key={`${p.name}_${idx}`} value={p.name}>
                        {p.name} ({getPostLevelLabel(p.name, p.level, p.isTaluka)})
                      </option>
                    ))}
                  </select>
                </div>

                {isPostNeedsTaluka && (
                  <div>
                    <label className="font-semibold block mb-1 text-[#9a460b]">बहाल केलेल्या पदाचा तालुका निवडा *</label>
                    <select
                      value={formTaluka}
                      onChange={(e) => setFormTaluka(e.target.value)}
                      required
                      className="w-full p-2 border border-amber-500 bg-amber-50/40 rounded-md font-semibold text-slate-800 focus:outline-none focus:border-[#193568]"
                    >
                      <option value="">-- बहाल पदाचा तालुका निवडा --</option>
                      {formAvailableTalukas.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">व्हॉट्सअ‍ॅप मोबाईल नंबर (10 अंक इंग्रजीत) *</label>
                <input
                  type="tel"
                  required
                  pattern="[0-9]{10}"
                  placeholder="10 अंकी मोबाईल नंबर"
                  value={formMobile}
                  onChange={(e) => setFormMobile(toEnglishDigits(e.target.value))}
                  className="w-full p-2 border border-slate-300 rounded-md font-semibold font-mono focus:outline-none focus:border-[#193568]"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">पासपोर्ट फोटो (फोटोज लावण्यासाठी)</label>
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleMemberPhotoSelect}
                    disabled={isUploadingMemberPhoto}
                    className="w-full p-2 border border-slate-300 rounded-md bg-white text-xs"
                  />
                  {isUploadingMemberPhoto && (
                    <div className="text-xs text-sky-700 font-bold flex items-center gap-1.5 p-2 bg-sky-50 rounded border border-sky-200">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-600" />
                      <span>फोटो क्लाउडवर अपलोड होत आहे...</span>
                    </div>
                  )}
                  {formPhoto && !isUploadingMemberPhoto && (
                    <div className="flex items-center gap-2.5 p-2 bg-slate-50 border border-slate-200 rounded-md">
                      <img src={formPhoto} alt="प्रीव्ह्यू" className="w-11 h-11 rounded-full object-cover border border-[#efb24b]" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold text-slate-800 block truncate">
                          फोटो यशस्वीरीत्या जोडला गेला
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setFormPhoto('');
                          setFormPhotoUrl('');
                        }}
                        className="text-xs text-rose-600 font-bold hover:underline cursor-pointer"
                      >
                        काढा
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsMemberModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-md font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  रद्द करा
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#193568] hover:bg-[#11254a] text-white rounded-md font-semibold cursor-pointer"
                >
                  सेव्ह करा
                </button>
              </div>
            </form>
          </div>
          </div>
        </ModalPortal>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CHANGE DISTRICT PASSWORD */}
      {/* ========================================================================= */}
      {isPasswordModalOpen && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[9999] w-screen h-[100dvh] overflow-y-auto overscroll-contain bg-slate-900/65 backdrop-blur-sm flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-xl border border-slate-300 shadow-2xl max-w-sm w-full text-sm overflow-hidden max-h-[90dvh] flex flex-col">
            <div className="bg-[#193568] text-white px-5 py-3.5 flex items-center justify-between border-b-2 border-[#efb24b]">
              <h3 className="font-serifDevanagari text-lg font-bold">
                पासवर्ड बदला ({isSuperAdmin ? formDistrict : (lockedDistrictName || currentDistrict)} जिल्हा)
              </h3>
              <button
                type="button"
                onClick={() => setIsPasswordModalOpen(false)}
                className="text-slate-300 hover:text-white p-1 cursor-pointer"
                aria-label="बंद करा"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="p-5 space-y-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">नवीन पासवर्ड टाका (किमान 4 अक्षरे):</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="नवीन गुप्त पासवर्ड"
                  className="w-full p-2.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-[#193568]"
                />
              </div>

              {passwordChangeSuccess && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-md font-semibold">
                  पासवर्ड यशस्वीपणे बदलला.
                </div>
              )}

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-md font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  बंद करा
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#193568] hover:bg-[#11254a] text-white rounded-md font-semibold cursor-pointer"
                >
                  अपडेट करा
                </button>
              </div>
            </form>
          </div>
          </div>
        </ModalPortal>
      )}

      {/* ========================================================================= */}
      {/* IN-PAGE CONFIRMATION MODAL: DELETE OFFICIAL */}
      {/* ========================================================================= */}
      {memberToDelete && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[9999] w-screen h-[100dvh] overflow-y-auto overscroll-contain bg-slate-900/65 backdrop-blur-sm flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-xl border border-slate-300 shadow-2xl max-w-sm w-full text-sm overflow-hidden max-h-[90dvh] flex flex-col">
            <div className="bg-[#193568] text-white px-5 py-3 flex items-center gap-2 border-b-2 border-[#efb24b]">
              <Trash2 className="w-4 h-4 text-rose-300 shrink-0" />
              <h3 className="font-serifDevanagari text-lg font-bold">
                पदाधिकारी वगळा?
              </h3>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-700 mb-4 leading-relaxed">
                तुम्हाला खात्री आहे का? <strong>{memberToDelete.salutation} {memberToDelete.firstName} {memberToDelete.lastName}</strong> यांचे नाव यादीतून कायमचे हटवायचे आहे?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMemberToDelete(null)}
                  className="flex-1 py-2 border border-slate-300 rounded-md font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  रद्द करा
                </button>
                <button
                  type="button"
                  onClick={executeConfirmDelete}
                  disabled={isDeleting}
                  className="flex-1 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-md font-semibold cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? 'हटवत आहे...' : 'होय, वगळा'}
                </button>
              </div>
            </div>
          </div>
          </div>
        </ModalPortal>
      )}

      {/* ========================================================================= */}
      {/* MODAL: संघटना सद्यस्थिती (34 जिल्हे मॅट्रिक्स तक्ता & A4 B&W PDF) */}
      {/* ========================================================================= */}
      {showStatusMatrixModal && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[9999] w-screen h-[100dvh] overflow-y-auto overscroll-contain bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-xl border border-slate-300 shadow-2xl max-w-4xl w-full text-sm relative max-h-[92dvh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="bg-[#193568] text-white px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[#efb24b] shrink-0">
              <div>
                <div className="text-xs sm:text-sm font-semibold text-slate-200">
                  महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ
                </div>
                <h3 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-white">
                  संघटना सद्यस्थिती अहवाल (३४ जिल्हे)
                </h3>
                <p className="text-slate-200 text-xs sm:text-sm mt-0.5">
                  सर्व ३४ जिल्ह्यांतील राज्य, विभागीय, जिल्हा, तालुका पदाधिकारी व नोंदणीकृत सभासदांची आकडेवारी
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadStatusMatrixExcel}
                  className="bg-[#df6b16] hover:bg-[#c2590d] text-white text-xs sm:text-sm font-semibold px-3.5 py-2 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="संघटन सद्यस्थिती एक्सेल (XLSX) फाइल डाऊनलोड करा"
                >
                  <Download className="w-3.5 h-3.5" />
                  Excel डाऊनलोड
                </button>
                <button
                  type="button"
                  onClick={() => setShowStatusMatrixModal(false)}
                  className="p-1.5 rounded text-slate-200 hover:text-white hover:bg-white/10 cursor-pointer"
                  aria-label="बंद करा"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Table View */}
            <div className="overflow-auto flex-1 m-4 border border-slate-300 rounded-md">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-slate-100 text-[#193568] text-xs font-bold sticky top-0 z-10 border-b border-slate-300">
                  <tr>
                    <th className="py-2.5 px-2 text-center border-r border-slate-200 w-10">अनु.</th>
                    <th className="py-2.5 px-3 border-r border-slate-200">जिल्ह्याचे नाव</th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-200">राज्य प्रतिनिधी</th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-200">विभागीय प्रतिनिधी</th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-200">जिल्हा पदाधिकारी</th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-200">तालुका पदाधिकारी</th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-200 font-bold text-[#193568]">एकूण पदाधिकारी</th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-200">शिक्षण विस्तार अधिकारी</th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-200">केंद्रप्रमुख</th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-200 font-bold text-[#df6b16]">एकूण सदस्य</th>
                    <th className="py-2.5 px-3 text-center font-bold text-[#9a460b]">एकूण बेरीज</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {districtMatrixStats.map((st, idx) => (
                    <tr key={st.district} className="hover:bg-slate-50">
                      <td className="py-2 px-2 text-center font-semibold text-slate-600 font-mono tabular-nums border-r border-slate-200">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-3 font-semibold text-[#193568] border-r border-slate-200">
                        {st.district}
                      </td>
                      <td className="py-2 px-2 text-center font-medium text-slate-700 font-mono tabular-nums border-r border-slate-200">
                        {toEnglishDigits(st.stateRep)}
                      </td>
                      <td className="py-2 px-2 text-center font-medium text-slate-700 font-mono tabular-nums border-r border-slate-200">
                        {toEnglishDigits(st.divRep)}
                      </td>
                      <td className="py-2 px-2 text-center font-medium text-slate-700 font-mono tabular-nums border-r border-slate-200">
                        {toEnglishDigits(st.distOfficial)}
                      </td>
                      <td className="py-2 px-2 text-center font-medium text-slate-700 font-mono tabular-nums border-r border-slate-200">
                        {toEnglishDigits(st.talukaOfficial)}
                      </td>
                      <td className="py-2 px-2 text-center font-bold text-[#193568] bg-slate-50 font-mono tabular-nums border-r border-slate-200">
                        {toEnglishDigits(st.officialsTotal)}
                      </td>
                      <td className="py-2 px-2 text-center font-medium text-slate-700 font-mono tabular-nums border-r border-slate-200">
                        {toEnglishDigits(st.extOfficerCount)}
                      </td>
                      <td className="py-2 px-2 text-center font-medium text-slate-700 font-mono tabular-nums border-r border-slate-200">
                        {toEnglishDigits(st.headmasterCount)}
                      </td>
                      <td className="py-2 px-2 text-center font-bold text-[#df6b16] bg-amber-50/40 font-mono tabular-nums border-r border-slate-200">
                        {toEnglishDigits(st.membersTotal)}
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-slate-900 bg-amber-50/60 font-mono tabular-nums">
                        {toEnglishDigits(st.rowTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#193568] text-white font-bold border-t-2 border-slate-400 sticky bottom-0 z-10">
                  <tr>
                    <td colSpan={2} className="py-3 px-3 text-center border-r border-slate-700 text-sm font-bold">
                      सर्व बेरीज (Grand Total)
                    </td>
                    <td className="py-3 px-2 text-center border-r border-slate-700 text-xs font-mono tabular-nums text-slate-100">
                      {toEnglishDigits(matrixTotals.stateRep)}
                    </td>
                    <td className="py-3 px-2 text-center border-r border-slate-700 text-xs font-mono tabular-nums text-slate-100">
                      {toEnglishDigits(matrixTotals.divRep)}
                    </td>
                    <td className="py-3 px-2 text-center border-r border-slate-700 text-xs font-mono tabular-nums text-slate-100">
                      {toEnglishDigits(matrixTotals.distOfficial)}
                    </td>
                    <td className="py-3 px-2 text-center border-r border-slate-700 text-xs font-mono tabular-nums text-slate-100">
                      {toEnglishDigits(matrixTotals.talukaOfficial)}
                    </td>
                    <td className="py-3 px-2 text-center border-r border-slate-700 text-xs font-bold font-mono tabular-nums text-[#efb24b] bg-[#11254a]">
                      {toEnglishDigits(matrixTotals.officialsTotal)}
                    </td>
                    <td className="py-3 px-2 text-center border-r border-slate-700 text-xs font-mono tabular-nums text-slate-100">
                      {toEnglishDigits(matrixTotals.extOfficerCount)}
                    </td>
                    <td className="py-3 px-2 text-center border-r border-slate-700 text-xs font-mono tabular-nums text-slate-100">
                      {toEnglishDigits(matrixTotals.headmasterCount)}
                    </td>
                    <td className="py-3 px-2 text-center border-r border-slate-700 text-xs font-bold font-mono tabular-nums text-amber-300 bg-[#11254a]">
                      {toEnglishDigits(matrixTotals.membersTotal)}
                    </td>
                    <td className="py-3 px-3 text-center text-sm font-bold font-mono tabular-nums text-white bg-[#0e1f3d]">
                      {toEnglishDigits(matrixTotals.grandTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs sm:text-sm text-slate-600 shrink-0">
              <span>* आकडेवारी रिअल-टाईम डेटाबेसमधून स्वयंचलित एकत्रित केली आहे.</span>
              <button
                type="button"
                onClick={() => setShowStatusMatrixModal(false)}
                className="bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-semibold px-4 py-1.5 rounded-md cursor-pointer"
              >
                बंद करा
              </button>
            </div>
          </div>
          </div>
        </ModalPortal>
      )}

      {/* ========================================================================= */}
      {/* IN-PAGE FLOATING TOAST NOTIFICATION */}
      {/* ========================================================================= */}
      {toast && (
        <ToastPortal>
          <div className="fixed bottom-5 right-5 z-[10000] max-w-sm bg-[#193568] text-white px-4 py-3 rounded-md shadow-xl flex items-center gap-3 border border-slate-700">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span className="text-sm font-semibold leading-relaxed">{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-auto text-slate-300 hover:text-white p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </ToastPortal>
      )}
    </div>
  );
};

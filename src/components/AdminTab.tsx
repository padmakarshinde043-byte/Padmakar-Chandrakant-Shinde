import React, { useState, useEffect, useRef } from 'react';
import {
  Lock, LogOut, Award, Printer, PlusCircle, Search,
  UserCheck, ShieldAlert, KeyRound, CheckCircle2, ArrowLeft, Eye, EyeOff,
  Users, Edit3, Trash2, Check, Upload, Image as ImageIcon, X, FileText, Download,
  UserPlus, Shield, CheckSquare, Square, MessageSquare, Mail, PhoneCall, RefreshCw,
  Cloud, CloudUpload, ExternalLink, AlertCircle, Settings
} from 'lucide-react';
import {
  MembershipApplication,
  NewsItem,
  ORG_DETAILS,
  Leader,
  STATE_EXECUTIVE,
  DIVISIONAL_COORDINATORS,
  DISTRICT_PRESIDENTS,
  ADVISORY_BOARD,
  formatSequentialMemberNumber,
  MAHARASHTRA_DISTRICTS
} from '../data/mahasanghData';
import { formatDateWithEnglishDigits, toEnglishDigits } from '../utils/formatters';
import {
  getAdminCredentials,
  updateAdminCredentials,
  DEFAULT_ADMIN_EMAIL,
  MASTER_RECOVERY_KEY,
  fetchAdminUsers,
  saveAdminUser,
  deleteAdminUser,
  setAdminUserPassword,
  AdminUser,
  AdminPermissions,
  ContactMessage,
  fetchContactsForAdmin,
  deleteContactMessageFromFirestore
} from '../firebase';
import { generateMembershipCertificatePdf } from '../services/rkPdfGenerator';
import { compressImageFile } from '../utils/imageCompressor';
import { saveDynamicLeadersToFirebase, fetchDynamicLeaders } from '../services/rkFirebaseService';
import {
  getCloudinaryConfig,
  saveCloudinaryConfig,
  uploadToCloudinary,
  CloudinaryConfig
} from '../utils/cloudinary';

interface AdminTabProps {
  applications: MembershipApplication[];
  onApproveApplication: (id: string, memberNumber: string) => void;
  onAddNews: (news: NewsItem) => void;
  onUpdateNews?: (news: NewsItem) => void;
  onDeleteNews?: (id: string) => void;
  newsList?: NewsItem[];
  onFetchApplications?: () => Promise<void>;
  isLoadingApps?: boolean;
  onExitAdmin?: () => void;
}

const DYNAMIC_LEADERSHIP_STORAGE_KEY = 'mahasangh_dynamic_leadership_v1';

export const AdminTab: React.FC<AdminTabProps> = ({
  applications,
  onApproveApplication,
  onAddNews,
  onUpdateNews,
  onDeleteNews,
  newsList = [],
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

  // Password Reset / Create New Password Mode on Login Screen (for Super Admin)
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMasterKey, setResetMasterKey] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  // Active view inside Admin Dashboard
  const [activeAdminSubTab, setActiveAdminSubTab] = useState<'applications' | 'leadership' | 'add_news' | 'manage_admins' | 'contact_messages' | 'password' | 'cloudinary'>('applications');

  // Contact Inquiries (प्राप्त संदेश / विचारणा)
  const [contactMessages, setContactMessages] = useState<ContactMessage[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [contactDistrictFilter, setContactDistrictFilter] = useState('');

  // Manage Admins tab state (Super Admin only)
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPermissions, setNewAdminPermissions] = useState<AdminPermissions>({
    approveMembers: true,
    manageNews: false,
    manageLeadership: false,
  });
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

  // Certificate Modal (Point 5)
  const [certModalApp, setCertModalApp] = useState<MembershipApplication | null>(null);

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
        ? '✓ Cloudinary सेटिंग्ज यशस्वीरीत्या सेव्ह झाली! आता सर्व फोटो मोफत Cloudinary CDN वर सेव्ह होतील.'
        : 'Cloudinary सेटिंग्ज जतन करण्यात आली (सध्या पर्याय निष्क्रिय आहे).',
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
        text: `✓ Cloudinary कनेक्शन यशस्वी झाले! चाचणी फोटो अपलोड झाला: ${result.url}`,
        type: 'success'
      });
    } catch (err: any) {
      setCloudinaryStatusMsg({
        text: 'Cloudinary चाचणी अयशस्वी: ' + (err.message || 'कृपया नाव व Preset तपासा'),
        type: 'error'
      });
    } finally {
      setIsTestingCloudinary(false);
    }
  };

  // News State & Management (Full News, Quick Photo Only, Edit, Live Preview)
  const [newsTitle, setNewsTitle] = useState('');
  const [newsCategory, setNewsCategory] = useState('अधिकृत घोषणा');
  const [newsSummary, setNewsSummary] = useState('');
  const [newsContent, setNewsContent] = useState('');
  const [newsImageUrl, setNewsImageUrl] = useState('');
  const [isCompressingNewsImg, setIsCompressingNewsImg] = useState(false);
  const [newsCreatedSuccess, setNewsCreatedSuccess] = useState(false);
  const [newsError, setNewsError] = useState('');

  // Editing existing news / GR / Photo
  const [editingNewsItem, setEditingNewsItem] = useState<NewsItem | null>(null);
  const [newsManageMode, setNewsManageMode] = useState<'form' | 'photo_only' | 'list'>('form');
  const [previewNewsItem, setPreviewNewsItem] = useState<NewsItem | null>(null);

  // Quick Photo Only state
  const [photoOnlyTitle, setPhotoOnlyTitle] = useState('');
  const [photoOnlyImageUrl, setPhotoOnlyImageUrl] = useState('');
  const [isUploadingPhotoOnly, setIsUploadingPhotoOnly] = useState(false);

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
          setNewsError('Cloudinary त्रुटी (' + (err.message || '') + '), म्हणून स्थानिक कॉम्प्रेस केलेली इमेज वापरली.');
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

  const handlePhotoOnlySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (cloudinaryConfig.enabled && cloudinaryConfig.cloudName && cloudinaryConfig.uploadPreset) {
      setIsUploadingPhotoOnly(true);
      setNewsError('');
      try {
        const result = await uploadToCloudinary(file, cloudinaryConfig);
        setPhotoOnlyImageUrl(result.url);
      } catch (err: any) {
        console.warn('Cloudinary upload error for photo-only:', err);
        try {
          const { base64 } = await compressImageFile(file, 1000, 750, 0.75);
          setPhotoOnlyImageUrl(base64);
          setNewsError('Cloudinary त्रुटी (' + (err.message || '') + '), स्थानिक इमेज निवडली.');
        } catch {
          setNewsError('फोटो कॉम्प्रेस करताना अडचण आली.');
        }
      } finally {
        setIsUploadingPhotoOnly(false);
      }
    } else {
      try {
        const { base64 } = await compressImageFile(file, 1000, 750, 0.75);
        setPhotoOnlyImageUrl(base64);
      } catch (err) {
        console.warn('Photo compression failed:', err);
      }
    }
  };

  // ==========================================
  // Leadership Management State (Point 7)
  // ==========================================
  const [leaderCategory, setLeaderCategory] = useState<'राज्य कार्यकारिणी' | 'विभागीय समन्वयक' | 'जिल्हा अध्यक्ष' | 'सल्लागार'>('राज्य कार्यकारिणी');
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
  const leaderPhotoInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize Dynamic Leadership from LocalStorage or Defaults and sync with Firebase
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DYNAMIC_LEADERSHIP_STORAGE_KEY);
      if (stored) {
        setDynamicLeaders(JSON.parse(stored));
      } else {
        const initialCombined: Leader[] = [
          ...STATE_EXECUTIVE.map((l, i) => ({ ...l, id: `se-${i}`, category: 'राज्य कार्यकारिणी' as const })),
          ...DIVISIONAL_COORDINATORS.map((l, i) => ({ ...l, id: `dc-${i}`, category: 'विभागीय समन्वयक' as const })),
          ...DISTRICT_PRESIDENTS.map((l, i) => ({ ...l, id: `dp-${i}`, category: 'जिल्हा अध्यक्ष' as const })),
          ...ADVISORY_BOARD.map((l, i) => ({ ...l, id: `ab-${i}`, category: 'सल्लागार' as const })),
        ];
        setDynamicLeaders(initialCombined);
        localStorage.setItem(DYNAMIC_LEADERSHIP_STORAGE_KEY, JSON.stringify(initialCombined));
      }
    } catch (e) {
      console.warn('Could not read dynamic leaders:', e);
    }

    // Sync remote leaders from Firebase in background
    fetchDynamicLeaders().then((remote) => {
      if (remote && remote.length > 0) {
        setDynamicLeaders(remote);
      }
    }).catch(() => {});
  }, []);

  // Save Dynamic Leadership to LocalStorage and Firebase (Zero Quota Impact with compressed images)
  const saveLeadersToStorage = (updatedList: Leader[]) => {
    setDynamicLeaders(updatedList);
    try {
      localStorage.setItem(DYNAMIC_LEADERSHIP_STORAGE_KEY, JSON.stringify(updatedList));
      // Dispatch custom storage event so other tabs sync live
      window.dispatchEvent(new Event('mahasangh_leadership_updated'));
      // Sync to Firebase Realtime Database
      saveDynamicLeadersToFirebase(updatedList).catch((err) => {
        console.warn('Could not sync leaders to Firebase:', err);
      });
    } catch (e) {
      console.warn('Could not save dynamic leaders:', e);
    }
  };

  // Filter leaders by active category
  const categoryLeaders = dynamicLeaders.filter((l) => (l.category || 'राज्य कार्यकारिणी') === leaderCategory);

  // Load admin credentials and sub-admin list on mount
  useEffect(() => {
    getAdminCredentials().catch(() => {});
    fetchAdminUsers().then(setAdminUsersList).catch(() => {});
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
      // Refresh admin list and super admin creds
      const [creds, subAdmins] = await Promise.all([
        getAdminCredentials(),
        fetchAdminUsers()
      ]);
      setAdminUsersList(subAdmins);

      const validSuperEmail = creds.email.toLowerCase();
      const validSuperPass = creds.password;

      // 1. Check if Super Admin
      if (inputEmail === validSuperEmail || inputEmail === DEFAULT_ADMIN_EMAIL.toLowerCase()) {
        if (!inputPass) {
          setLoginError('कृपया पासवर्ड प्रविष्ट करा.');
          return;
        }
        const isPassValid = inputPass === validSuperPass || inputPass === MASTER_RECOVERY_KEY;
        if (!isPassValid) {
          setLoginError('चुकीचा पासवर्ड. कृपया पुन्हा प्रयत्न करा.');
          return;
        }

        const superAdminUser: AdminUser = {
          id: 'super-admin',
          email: validSuperEmail,
          name: 'मुख्य प्रशासक (Super Admin)',
          isSuperAdmin: true,
          permissions: {
            approveMembers: true,
            manageNews: true,
            manageLeadership: true,
            manageAdmins: true,
          },
          createdAt: '',
        };

        setCurrentUser(superAdminUser);
        setIsLoggedIn(true);
        setActiveAdminSubTab('applications');
        setLoginError('');
        if (onFetchApplications) {
          onFetchApplications();
        }
        return;
      }

      // 2. Check if Sub-Admin
      const matchingSubAdmin = subAdmins.find((a) => a.email.toLowerCase() === inputEmail);
      if (matchingSubAdmin) {
        // If this is sub-admin's first login (or they don't have a password set yet)
        if (matchingSubAdmin.isFirstLogin || !matchingSubAdmin.password) {
          setIsFirstLoginMode(true);
          setFirstLoginEmail(matchingSubAdmin.email);
          setFirstLoginError('');
          setFirstLoginSuccess('');
          setFirstLoginNewPassword('');
          setFirstLoginConfirmPassword('');
          return;
        }

        // Sub-admin already has a password
        if (!inputPass) {
          setLoginError('कृपया पासवर्ड प्रविष्ट करा.');
          return;
        }

        if (inputPass !== matchingSubAdmin.password) {
          setLoginError('चुकीचा पासवर्ड. कृपया पुन्हा प्रयत्न करा.');
          return;
        }

        setCurrentUser(matchingSubAdmin);
        setIsLoggedIn(true);
        setLoginError('');

        // Select first available tab based on their permissions
        if (matchingSubAdmin.permissions.approveMembers) {
          setActiveAdminSubTab('applications');
        } else if (matchingSubAdmin.permissions.manageNews) {
          setActiveAdminSubTab('add_news');
        } else if (matchingSubAdmin.permissions.manageLeadership) {
          setActiveAdminSubTab('leadership');
        } else {
          setActiveAdminSubTab('password');
        }

        if (matchingSubAdmin.permissions.approveMembers && onFetchApplications) {
          onFetchApplications();
        }
        return;
      }

      setLoginError('अवैध ई-मेल. कृपया अधिकृत ॲडमिन ई-मेल वापरा किंवा मुख्य प्रशासकाशी संपर्क साधा.');
    } catch (err: any) {
      setLoginError('लॉगिन करताना त्रुटी आली: ' + (err.message || 'Error'));
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
      await setAdminUserPassword(firstLoginEmail, newPwd);
      const updatedList = await fetchAdminUsers();
      setAdminUsersList(updatedList);
      const user = updatedList.find((a) => a.email.toLowerCase() === firstLoginEmail.toLowerCase());

      setFirstLoginSuccess('आपला पासवर्ड यशस्वीपणे तयार झाला आहे! डॅशबोर्ड उघडत आहे...');
      setTimeout(() => {
        setIsFirstLoginMode(false);
        if (user) {
          setCurrentUser(user);
          setIsLoggedIn(true);
          if (user.permissions.approveMembers) {
            setActiveAdminSubTab('applications');
          } else if (user.permissions.manageNews) {
            setActiveAdminSubTab('add_news');
          } else if (user.permissions.manageLeadership) {
            setActiveAdminSubTab('leadership');
          } else {
            setActiveAdminSubTab('password');
          }
          if (user.permissions.approveMembers && onFetchApplications) {
            onFetchApplications();
          }
        }
      }, 1000);
    } catch (err: any) {
      setFirstLoginError('पासवर्ड सेव्ह करताना त्रुटी: ' + (err.message || 'Error'));
    }
  };

  // Handle Create / Reset Password from Login Screen (Super Admin)
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetSuccess('');

    const targetEmail = resetEmail.trim().toLowerCase();
    const masterKey = resetMasterKey.trim();
    const newPwd = resetNewPassword.trim();
    const confirmPwd = resetConfirmPassword.trim();

    if (!targetEmail || !masterKey || !newPwd || !confirmPwd) {
      setResetError('कृपया सर्व माहिती भरा.');
      return;
    }

    if (newPwd.length < 4) {
      setResetError('नवीन पासवर्ड किमान 4 अक्षरांचा असावा.');
      return;
    }

    if (newPwd !== confirmPwd) {
      setResetError('दोन्ही पासवर्ड एकमेकांशी जुळत नाहीत.');
      return;
    }

    try {
      const creds = await getAdminCredentials();
      const isEmailMatch = targetEmail === creds.email.toLowerCase() || targetEmail === DEFAULT_ADMIN_EMAIL.toLowerCase();
      const isAuthAuthorized = masterKey === MASTER_RECOVERY_KEY || masterKey === creds.password;

      if (!isEmailMatch) {
        setResetError('नोंदणीकृत अधिकृत ॲडमिन ई-मेल जुळत नाही.');
        return;
      }

      if (!isAuthAuthorized) {
        setResetError('मास्टर सिक्युरिटी की किंवा जुना पासवर्ड चुकीचा आहे.');
        return;
      }

      await updateAdminCredentials(newPwd, targetEmail);
      setResetSuccess('नवीन पासवर्ड यशस्वीपणे तयार करण्यात आला आहे! आता आपण लॉगिन करू शकता.');
      setTimeout(() => {
        setIsResetMode(false);
        setPassword(newPwd);
        setResetSuccess('');
      }, 1500);
    } catch (err: any) {
      setResetError('पासवर्ड सेव्ह करताना त्रुटी आली: ' + err.message);
    }
  };

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
      if (currentUser?.isSuperAdmin) {
        const creds = await getAdminCredentials();
        if (curr !== creds.password && curr !== MASTER_RECOVERY_KEY) {
          setChangePassStatus({ text: 'सध्याचा चालू पासवर्ड चुकीचा आहे.', type: 'error' });
          return;
        }
        await updateAdminCredentials(newP);
      } else if (currentUser) {
        if (curr !== currentUser.password) {
          setChangePassStatus({ text: 'सध्याचा चालू पासवर्ड चुकीचा आहे.', type: 'error' });
          return;
        }
        await setAdminUserPassword(currentUser.email, newP);
        setCurrentUser({ ...currentUser, password: newP });
      }

      setChangePassStatus({ text: 'पासवर्ड यशस्वीपणे बदलण्यात आला आहे!', type: 'success' });
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

    if (!newAdminPermissions.approveMembers && !newAdminPermissions.manageNews && !newAdminPermissions.manageLeadership) {
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
        permissions: { ...newAdminPermissions },
        createdAt: new Date().toISOString(),
      };

      await saveAdminUser(newAdmin);
      const updated = await fetchAdminUsers();
      setAdminUsersList(updated);
      setNewAdminEmail('');
      setNewAdminName('');
      setNewAdminPermissions({ approveMembers: true, manageNews: false, manageLeadership: false });
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

  // Manage Admins: Delete Sub-Admin
  const handleDeleteAdmin = async (id: string, targetEmail: string) => {
    try {
      await deleteAdminUser(id);
      const updated = await fetchAdminUsers();
      setAdminUsersList(updated);
      setAdminActionMsg({ text: `${targetEmail} यांचे व्यवस्थापक अधिकार काढण्यात आले.`, type: 'success' });
    } catch (err: any) {
      setAdminActionMsg({ text: 'व्यवस्थापक हटवताना त्रुटी आली.', type: 'error' });
    }
  };

  // Fetch contact messages
  const loadContactMessages = async () => {
    setIsLoadingContacts(true);
    try {
      const msgs = await fetchContactsForAdmin();
      setContactMessages(msgs);
    } catch (e) {
      console.warn('Failed to fetch contact messages:', e);
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

  useEffect(() => {
    if (isLoggedIn && (activeAdminSubTab === 'contact_messages' || contactMessages.length === 0)) {
      loadContactMessages();
    }
  }, [isLoggedIn, activeAdminSubTab]);

  // Open Verification Modal for an Application
  const handleOpenVerification = (app: MembershipApplication) => {
    setSelectedAppForVerification(app);
    setPaymentConfirmedChecked(app.paymentConfirmed || false);
    setShowRejectInput(false);
    setRejectReason('');
  };

  // Approve Application with Sequential Number Generation: MS/वर्ष/जिल्ह्याचे पहिले चार अक्षरे इंग्रजीमध्ये/0000
  const handleApproveVerified = () => {
    if (!selectedAppForVerification) return;
    if (!paymentConfirmedChecked) {
      alert('कृपया सदस्यत्व व वर्गणी फी बँक खात्यावर जमा झाल्याची खात्री करणारा टिक बॉक्स निवडा.');
      return;
    }

    // Determine continuous sequence number across all approved applications
    const currentApprovedCount = applications.filter((a) => a.status === 'approved').length;
    const nextSeqNumber = currentApprovedCount + 1;
    const newMemberNumber = formatSequentialMemberNumber(selectedAppForVerification.district, nextSeqNumber);

    onApproveApplication(selectedAppForVerification.id, newMemberNumber);
    setSelectedAppForVerification(null);
  };

  // Reject Application
  const handleRejectVerified = () => {
    if (!selectedAppForVerification) return;
    if (!paymentConfirmedChecked) {
      alert('कृपया पेमेंट खात्री किंवा तपासणी पूर्ण झाल्याचा टिक बॉक्स निवडा.');
      return;
    }

    // Mark as rejected in applications
    selectedAppForVerification.status = 'rejected';
    setSelectedAppForVerification(null);
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
        setLeaderFormMsg({ text: '✓ फोटो Cloudinary वर थेट सेव्ह झाला (0% Firebase कोटा खर्च)!', type: 'success' });
      } catch (err: any) {
        console.warn('Cloudinary leader upload error, falling back to local compression:', err);
        try {
          const { base64, sizeKb } = await compressImageFile(file, 240, 240, 0.72);
          setLeaderPhoto(base64);
          setLeaderPhotoSizeKb(sizeKb);
          setLeaderPhotoUrl('');
          setLeaderFormMsg({ text: 'Cloudinary त्रुटी, स्थानिक कॉम्प्रेस केलेला फोटो वापरला (' + sizeKb + ' KB).', type: 'error' });
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

  // Add or Edit Leader in selected category
  const handleSaveLeader = (e: React.FormEvent) => {
    e.preventDefault();
    setLeaderFormMsg(null);

    if (!leaderName.trim() || !leaderRole.trim()) {
      setLeaderFormMsg({ text: 'कृपया नाव आणि पद आवश्यकपणे भरा.', type: 'error' });
      return;
    }

    if (editingLeaderId) {
      // Update existing leader
      const updated = dynamicLeaders.map((l) => {
        if (l.id === editingLeaderId) {
          return {
            ...l,
            name: leaderName.trim(),
            role: leaderRole.trim(),
            region: leaderRegion.trim() || 'महाराष्ट्र',
            phone: leaderPhone.trim() || '-',
            education: leaderEducation.trim() || '',
            photo: leaderPhoto || l.photo,
            category: leaderCategory
          };
        }
        return l;
      });
      saveLeadersToStorage(updated);
      setLeaderFormMsg({ text: 'पदाधिकारी माहिती यशस्वीपणे अद्यतनित झाली!', type: 'success' });
    } else {
      // Add new leader
      const newLeader: Leader = {
        id: `ldr-${Date.now()}`,
        name: leaderName.trim(),
        role: leaderRole.trim(),
        region: leaderRegion.trim() || 'महाराष्ट्र',
        phone: leaderPhone.trim() || '-',
        education: leaderEducation.trim() || '',
        photo: leaderPhoto,
        category: leaderCategory
      };
      saveLeadersToStorage([newLeader, ...dynamicLeaders]);
      setLeaderFormMsg({ text: 'नवीन पदाधिकारी यशस्वीपणे जोडले गेले!', type: 'success' });
    }

    // Reset Form
    setEditingLeaderId(null);
    setLeaderName('');
    setLeaderRole('');
    setLeaderRegion('');
    setLeaderPhone('');
    setLeaderEducation('');
    setLeaderPhoto('');
    setLeaderPhotoSizeKb(0);
    setLeaderPhotoUrl('');
    if (leaderPhotoInputRef.current) leaderPhotoInputRef.current.value = '';
    setTimeout(() => setLeaderFormMsg(null), 3000);
  };

  // Start Editing Leader
  const handleEditLeader = (leader: Leader) => {
    setEditingLeaderId(leader.id || leader.name);
    setLeaderName(leader.name);
    setLeaderRole(leader.role);
    setLeaderRegion(leader.region);
    setLeaderPhone(leader.phone);
    setLeaderEducation(leader.education || '');
    setLeaderPhoto(leader.photo || '');
    setLeaderPhotoSizeKb(0);
    setLeaderPhotoUrl(leader.photo && leader.photo.startsWith('http') ? leader.photo : '');
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  // Delete Leader
  const handleDeleteLeader = (leaderId?: string, leaderName?: string) => {
    const filtered = dynamicLeaders.filter((l) => (l.id ? l.id !== leaderId : l.name !== leaderName));
    saveLeadersToStorage(filtered);
    setLeaderFormMsg({ text: `'${leaderName || 'पदाधिकारी'}' यांना यादीतून वगळण्यात आले आहे.`, type: 'success' });
    setTimeout(() => setLeaderFormMsg(null), 3000);
  };

  // Create or Update News / GR
  const handleCreateNews = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsTitle.trim() || !newsSummary.trim() || !newsContent.trim()) {
      setNewsError('कृपया बातमीचे शीर्षक, सारांश आणि सविस्तर मजकूर भरा.');
      return;
    }
    setNewsError('');

    const todayStr = formatDateWithEnglishDigits(new Date());

    if (editingNewsItem) {
      const updatedPost: NewsItem = {
        ...editingNewsItem,
        title: toEnglishDigits(newsTitle.trim()),
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
      setTimeout(() => setNewsCreatedSuccess(false), 4000);
      return;
    }

    const newPost: NewsItem = {
      id: `post-${Date.now()}`,
      title: toEnglishDigits(newsTitle.trim()),
      date: todayStr,
      category: newsCategory,
      summary: toEnglishDigits(newsSummary.trim()),
      content: toEnglishDigits(newsContent.trim()),
      image: newsImageUrl || undefined,
      imageUrl: newsImageUrl || undefined,
      featured: false
    };

    onAddNews(newPost);
    setNewsCreatedSuccess(true);
    setNewsTitle('');
    setNewsSummary('');
    setNewsContent('');
    setNewsImageUrl('');
    setTimeout(() => setNewsCreatedSuccess(false), 4000);
  };

  // Quick Photo Only Publish
  const handleCreatePhotoOnly = (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoOnlyTitle.trim() || !photoOnlyImageUrl) {
      setNewsError('कृपया फोटोचे शीर्षक प्रविष्ट करा आणि फोटो निवडा.');
      return;
    }
    setNewsError('');

    const todayStr = formatDateWithEnglishDigits(new Date());
    const photoPost: NewsItem = {
      id: `photo-${Date.now()}`,
      title: toEnglishDigits(photoOnlyTitle.trim()),
      date: todayStr,
      category: 'अधिकृत छायाचित्र / परिपत्रक',
      summary: 'अधिकृत छायाचित्र / परिपत्रक',
      content: '', // Empty content indicates photo-only mode
      image: photoOnlyImageUrl,
      imageUrl: photoOnlyImageUrl,
      featured: false
    };

    onAddNews(photoPost);
    setNewsCreatedSuccess(true);
    setPhotoOnlyTitle('');
    setPhotoOnlyImageUrl('');
    setTimeout(() => setNewsCreatedSuccess(false), 4000);
  };

  // Start Editing News
  const handleStartEditNews = (item: NewsItem) => {
    setEditingNewsItem(item);
    setNewsTitle(item.title || '');
    setNewsCategory(item.category || 'अधिकृत घोषणा');
    setNewsSummary(item.summary || '');
    setNewsContent(item.content || '');
    setNewsImageUrl(item.imageUrl || item.image || '');
    setNewsManageMode('form');
    setNewsError('');
    window.scrollTo({ top: 320, behavior: 'smooth' });
  };

  // Cancel Editing
  const handleCancelEditNews = () => {
    setEditingNewsItem(null);
    setNewsTitle('');
    setNewsSummary('');
    setNewsContent('');
    setNewsImageUrl('');
    setNewsError('');
  };

  // Delete News
  const handleDeleteNewsItem = (item: NewsItem) => {
    if (window.confirm(`आपण खात्रीने '${item.title}' ही बातमी / परिपत्रक हटवू इच्छिता?`)) {
      if (onDeleteNews) {
        onDeleteNews(item.id);
      }
    }
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
      date: formatDateWithEnglishDigits(new Date()),
      summary: newsSummary.trim(),
      content: newsContent.trim(),
      image: newsImageUrl || undefined,
      imageUrl: newsImageUrl || undefined,
    });
  };

  const handleOpenPhotoOnlyPreview = () => {
    if (!photoOnlyTitle.trim()) {
      setNewsError('प्रिव्ह्यू पाहण्यासाठी कृपया फोटोचे शीर्षक प्रविष्ट करा.');
      return;
    }
    setNewsError('');
    setPreviewNewsItem({
      id: 'preview-photo-temp',
      title: photoOnlyTitle.trim(),
      category: 'अधिकृत छायाचित्र / परिपत्रक',
      date: formatDateWithEnglishDigits(new Date()),
      summary: 'अधिकृत छायाचित्र / परिपत्रक',
      content: '',
      image: photoOnlyImageUrl || undefined,
      imageUrl: photoOnlyImageUrl || undefined,
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

  const totalCount = applications.length;
  const approvedCount = applications.filter((a) => a.status === 'approved').length;
  const pendingCount = applications.filter((a) => a.status === 'pending').length;
  const rejectedCount = applications.filter((a) => a.status === 'rejected').length;

  return (
    <div className="bg-[#f6f8fc] py-8 md:py-12 min-h-screen">
      <div className="max-w-[1100px] mx-auto px-4">
        {/* Top Navigation Bar */}
        <div className="border-b border-slate-300 pb-5 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onExitAdmin && (
              <button
                type="button"
                onClick={onExitAdmin}
                className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
                title="मुख्य वेबसाईटवर परत जा"
              >
                <ArrowLeft className="w-4 h-4 text-[#df6b16]" />
                <span className="hidden sm:inline">मुख्य वेबसाईटवर जा</span>
              </button>
            )}
            <div>
              <p className="text-[11px] uppercase tracking-widest font-bold text-[#df6b16]">
                स्वतंत्र प्रशासन कक्ष (mahasangh.in/admin)
              </p>
              <h1 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#17366d]">
                सदस्यत्व व वेबसाईट प्रशासन (Admin Dashboard)
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Clean Green Dot Indicator for Active Cloudinary CDN */}
            {cloudinaryConfig.enabled && (
              <div
                className="inline-flex items-center gap-2 bg-white/95 border border-slate-200/90 px-3 py-1.5 rounded-full text-xs shadow-2xs select-none"
                title={currentUser?.isSuperAdmin ? "क्लाउड स्टोरेज सक्रिय आहे (सेटिंग्जसाठी क्लिक करा)" : "क्लाउड स्टोरेज सक्रिय आहे"}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-xs shadow-emerald-400 shrink-0" />
                <span className="font-semibold text-emerald-800 text-[11px] sm:text-xs">क्लाउड स्टोरेज सक्रिय</span>
                {currentUser?.isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => setActiveAdminSubTab(activeAdminSubTab === 'cloudinary' ? 'applications' : 'cloudinary')}
                    className="text-slate-400 hover:text-[#df6b16] ml-0.5 p-0.5 rounded transition-colors"
                    title="क्लाउड स्टोरेज सेटिंग्ज (फक्त मुख्य प्रशासक)"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {isLoggedIn && (
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-bold text-[#17366d] flex items-center justify-end gap-1">
                    <Shield className="w-3.5 h-3.5 text-[#df6b16]" />
                    {currentUser?.isSuperAdmin ? 'मुख्य प्रशासक (Super Admin)' : (currentUser?.name || 'सह-व्यवस्थापक')}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {currentUser?.email}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsLoggedIn(false);
                    setCurrentUser(null);
                  }}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold px-4 py-2 rounded flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-600" />
                  बाहेर पडा (Logout)
                </button>
              </div>
            )}
          </div>
        </div>

        {!isLoggedIn ? (
          /* Login Card */
          <div className="max-w-md mx-auto bg-white p-6 sm:p-8 rounded-xl border border-slate-300 shadow-md">
            {isFirstLoginMode ? (
              /* First Login Password Setup Mode for Sub-Admins */
              <div>
                <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 mb-3 mx-auto">
                  <UserPlus className="w-6 h-6" />
                </div>
                <h2 className="font-serifDevanagari text-xl font-bold text-center text-[#17366d] mb-1">
                  नवीन पासवर्ड तयार करा
                </h2>
                <p className="text-xs text-center text-slate-500 mb-2">
                  आपले ॲडमिन पॅनलमध्ये स्वागत आहे! आपण प्रथमच लॉगिन करत आहात.
                </p>
                <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-center text-xs mb-4">
                  ई-मेल: <strong className="text-[#09243f] font-mono">{firstLoginEmail}</strong>
                </div>

                {firstLoginError && (
                  <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{firstLoginError}</span>
                  </div>
                )}

                {firstLoginSuccess && (
                  <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>{firstLoginSuccess}</span>
                  </div>
                )}

                <form onSubmit={handleFirstLoginSubmit} className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      नवीन पासवर्ड तयार करा <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      value={firstLoginNewPassword}
                      onChange={(e) => setFirstLoginNewPassword(e.target.value)}
                      placeholder="किमान 4 अक्षरी गुप्त पासवर्ड"
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      पासवर्ड पुन्हा प्रविष्ट करा (Confirm Password) <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      value={firstLoginConfirmPassword}
                      onChange={(e) => setFirstLoginConfirmPassword(e.target.value)}
                      placeholder="तोच पासवर्ड पुन्हा टाका"
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsFirstLoginMode(false)}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-lg text-xs"
                    >
                      रद्द करा
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold py-2.5 rounded-lg text-xs shadow-sm"
                    >
                      पासवर्ड सेव्ह करा
                    </button>
                  </div>
                </form>
              </div>
            ) : !isResetMode ? (
              <div>
                <div className="w-12 h-12 bg-[#fff0df] rounded-full flex items-center justify-center text-[#df6b16] mb-3 mx-auto">
                  <Lock className="w-6 h-6" />
                </div>
                <h2 className="font-serifDevanagari text-xl font-bold text-center text-[#17366d] mb-1">
                  प्रशासन लॉगिन (Admin Login)
                </h2>
                <p className="text-xs text-center text-slate-500 mb-5">
                  केवळ अधिकृत व्यवस्थापकांसाठी राखीव पोर्टल
                </p>

                {loginError && (
                  <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      ई-मेल (Admin Email)
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="आपला ॲडमिन ई-मेल प्रविष्ट करा"
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      पासवर्ड (Password)
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="पासवर्ड प्रविष्ट करा (नवीन असल्यास रिक्त ठेवा)"
                        className="w-full p-2.5 pr-10 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold py-2.5 rounded-lg text-sm transition-colors shadow-sm"
                  >
                    Login करा
                  </button>
                </form>

                <div className="mt-5 pt-4 border-t border-slate-200 space-y-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (!email.trim()) {
                        setLoginError('कृपया आधी वर आपला अधिकृत ई-मेल प्रविष्ट करा.');
                        return;
                      }
                      setIsFirstLoginMode(true);
                      setFirstLoginEmail(email.trim().toLowerCase());
                      setFirstLoginError('');
                      setFirstLoginSuccess('');
                    }}
                    className="text-xs text-amber-700 hover:text-amber-900 font-bold flex items-center justify-center gap-1.5 mx-auto transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-amber-600" />
                    नवीन ॲडमिन? पहिल्या लॉगिनसाठी येथे पासवर्ड तयार करा
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsResetMode(true);
                      setResetEmail(email || DEFAULT_ADMIN_EMAIL);
                      setResetError('');
                      setResetSuccess('');
                    }}
                    className="text-xs text-[#09243f] hover:text-[#df6b16] font-bold flex items-center justify-center gap-1.5 mx-auto transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-[#df6b16]" />
                    मुख्य प्रशासक पासवर्ड रीसेट (Reset Password)
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="font-serifDevanagari text-xl font-bold text-center text-[#17366d] mb-1">
                  नवीन पासवर्ड तयार करा
                </h2>
                <p className="text-xs text-center text-slate-500 mb-5">
                  अधिकृत ॲडमिन ई-मेल आणि चालू पासवर्ड अथवा सिक्युरिटी की प्रविष्ट करा
                </p>

                {resetError && (
                  <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{resetError}</span>
                  </div>
                )}

                {resetSuccess && (
                  <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>{resetSuccess}</span>
                  </div>
                )}

                <form onSubmit={handleResetPasswordSubmit} className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      नोंदणीकृत ॲडमिन ई-मेल
                    </label>
                    <input
                      type="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      चालू पासवर्ड किंवा सिक्युरिटी की
                    </label>
                    <input
                      type="password"
                      required
                      value={resetMasterKey}
                      onChange={(e) => setResetMasterKey(e.target.value)}
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      नवीन पासवर्ड
                    </label>
                    <input
                      type="password"
                      required
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      नवीन पासवर्ड पुन्हा टाका
                    </label>
                    <input
                      type="password"
                      required
                      value={resetConfirmPassword}
                      onChange={(e) => setResetConfirmPassword(e.target.value)}
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsResetMode(false)}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-lg text-xs"
                    >
                      रद्द करा
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold py-2.5 rounded-lg text-xs"
                    >
                      सेव्ह करा
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        ) : (
          /* Logged In Dashboard */
          <div className="space-y-6">
            {/* Stats Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500 block">एकूण अर्ज प्राप्त</span>
                <strong className="text-2xl font-serifDevanagari text-[#17366d]">
                  {toEnglishDigits(totalCount)}
                </strong>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500 block">मंजूर सदस्य</span>
                <strong className="text-2xl font-serifDevanagari text-emerald-600">
                  {toEnglishDigits(approvedCount)}
                </strong>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500 block">प्रलंबित अर्ज</span>
                <strong className="text-2xl font-serifDevanagari text-amber-600">
                  {toEnglishDigits(pendingCount)}
                </strong>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500 block">नाकारलेले</span>
                <strong className="text-2xl font-serifDevanagari text-rose-600">
                  {toEnglishDigits(rejectedCount)}
                </strong>
              </div>
            </div>

            {/* Sub-nav Tabs with RBAC Permissions */}
            <div className="flex flex-wrap border-b border-slate-300 gap-1">
              {(currentUser?.isSuperAdmin || currentUser?.permissions?.approveMembers) && (
                <button
                  type="button"
                  onClick={() => setActiveAdminSubTab('applications')}
                  className={`py-3 px-5 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                    activeAdminSubTab === 'applications'
                      ? 'border-[#df6b16] text-[#df6b16] bg-white rounded-t-lg shadow-xs'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  अर्ज पडताळणी व मंजुरी ({toEnglishDigits(applications.length)})
                </button>
              )}

              {(currentUser?.isSuperAdmin || currentUser?.permissions?.manageLeadership) && (
                <button
                  type="button"
                  onClick={() => setActiveAdminSubTab('leadership')}
                  className={`py-3 px-5 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                    activeAdminSubTab === 'leadership'
                      ? 'border-[#df6b16] text-[#df6b16] bg-white rounded-t-lg shadow-xs'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  नेतृत्व व्यवस्थापन (Leadership)
                </button>
              )}

              {(currentUser?.isSuperAdmin || currentUser?.permissions?.manageNews) && (
                <button
                  type="button"
                  onClick={() => setActiveAdminSubTab('add_news')}
                  className={`py-3 px-5 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                    activeAdminSubTab === 'add_news'
                      ? 'border-[#df6b16] text-[#df6b16] bg-white rounded-t-lg shadow-xs'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <PlusCircle className="w-4 h-4" />
                  बातम्या व परिपत्रके
                </button>
              )}

              {(currentUser?.isSuperAdmin || currentUser?.permissions?.manageAdmins) && (
                <button
                  type="button"
                  onClick={() => setActiveAdminSubTab('manage_admins')}
                  className={`py-3 px-5 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                    activeAdminSubTab === 'manage_admins'
                      ? 'border-[#df6b16] text-[#df6b16] bg-white rounded-t-lg shadow-xs'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Shield className="w-4 h-4 text-[#df6b16]" />
                  व्यवस्थापक प्रशासन (Manage Admins)
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveAdminSubTab('contact_messages')}
                className={`py-3 px-5 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                  activeAdminSubTab === 'contact_messages'
                    ? 'border-[#df6b16] text-[#df6b16] bg-white rounded-t-lg shadow-xs'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                प्राप्त संदेश / विचारणा ({toEnglishDigits(contactMessages.length)})
              </button>

              <button
                type="button"
                onClick={() => setActiveAdminSubTab('password')}
                className={`py-3 px-5 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                  activeAdminSubTab === 'password'
                    ? 'border-[#df6b16] text-[#df6b16] bg-white rounded-t-lg shadow-xs'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <KeyRound className="w-4 h-4" />
                पासवर्ड व्यवस्थापन
              </button>
            </div>

            {/* Sub-tab 1: Applications Management */}
            {activeAdminSubTab === 'applications' && (
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {(['all', 'pending', 'approved', 'rejected'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setFilterStatus(st)}
                        className={`px-3 py-1.5 rounded-full font-bold transition-colors ${
                          filterStatus === st
                            ? 'bg-[#17366d] text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {st === 'all' && `सर्व (${toEnglishDigits(totalCount)})`}
                        {st === 'pending' && `प्रलंबित (${toEnglishDigits(pendingCount)})`}
                        {st === 'approved' && `मंजूर (${toEnglishDigits(approvedCount)})`}
                        {st === 'rejected' && `नाकारलेले (${toEnglishDigits(rejectedCount)})`}
                      </button>
                    ))}
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="नाव, अर्ज क्र., फोन किंवा जिल्हा..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-500">
                  💡 <em>टीप: संपूर्ण माहिती व पासपोर्ट फोटो पाहण्यासाठी कोणत्याही अर्जदाराच्या नावावर क्लिक करा.</em>
                </p>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#f8fafc] text-slate-700 uppercase font-bold border-b border-slate-200">
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
                    <tbody className="divide-y divide-slate-100">
                      {filteredApps.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400">
                            कोणताही अर्ज सापडला नाही.
                          </td>
                        </tr>
                      ) : (
                        filteredApps.map((app) => (
                          <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4">
                              {app.photo ? (
                                <img
                                  src={app.photo}
                                  alt={app.fullName}
                                  className="w-9 h-11 object-cover rounded border border-slate-300 cursor-pointer"
                                  onClick={() => handleOpenVerification(app)}
                                />
                              ) : (
                                <div
                                  onClick={() => handleOpenVerification(app)}
                                  className="w-9 h-11 bg-slate-200 rounded border border-slate-300 flex items-center justify-center text-slate-400 cursor-pointer"
                                >
                                  <ImageIcon className="w-4 h-4" />
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-[#17366d]">
                              {app.applicationNumber}
                              <span className="block font-sans font-normal text-[11px] text-slate-500">
                                {formatDateWithEnglishDigits(app.createdAt)}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900">
                              <button
                                type="button"
                                onClick={() => handleOpenVerification(app)}
                                className="text-left hover:text-[#df6b16] hover:underline"
                                title="तपशीलवार पडताळणी उघडा"
                              >
                                {app.fullName}
                                {app.isOfficial && (
                                  <span className="block text-[10px] text-[#df6b16] font-semibold">
                                    ⭐ {app.officialPost}
                                  </span>
                                )}
                              </button>
                            </td>
                            <td className="py-3 px-4 text-slate-700">
                              {app.professional || 'केंद्रप्रमुख / अधिकारी'}
                              <span className="block text-[11px] text-slate-500 font-semibold">
                                {app.district}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono">
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
                                <button
                                  type="button"
                                  onClick={() => handleOpenVerification(app)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded text-xs transition-colors shadow-xs"
                                >
                                  पडताळणी करा
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setCertModalApp(app)}
                                  className="bg-[#17366d] hover:bg-[#0f244c] text-white font-bold px-3 py-1.5 rounded text-xs flex items-center gap-1 mx-auto transition-colors shadow-xs"
                                >
                                  <Printer className="w-3 h-3" />
                                  प्रमाणपत्र
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Sub-tab 2: Leadership Management (Point 7) */}
            {activeAdminSubTab === 'leadership' && (
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
                <div>
                  <h3 className="font-serifDevanagari text-lg font-bold text-[#17366d]">
                    महासंघ नेतृत्व व पदाधिकारी संपादन (Leadership Management)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    येथून आपण राज्य कार्यकारिणी, विभागीय समन्वयक, जिल्हा अध्यक्ष व सल्लागार यांचे फोटो, नाव आणि पद बदलू किंवा नव्याने जोडू शकता.
                  </p>
                </div>

                {/* Dropdown with 4 Categories (As Requested) */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <label className="font-bold text-xs text-[#09243f] shrink-0">
                    श्रेणी निवडा:
                  </label>
                  <select
                    value={leaderCategory}
                    onChange={(e) => setLeaderCategory(e.target.value as any)}
                    className="p-2.5 bg-white border border-[#c8d2e2] text-xs font-bold text-[#193568] rounded-lg focus:outline-none focus:border-[#df6b16] w-full sm:w-64"
                  >
                    <option value="राज्य कार्यकारिणी">1. राज्य कार्यकारिणी</option>
                    <option value="विभागीय समन्वयक">2. विभागीय समन्वयक</option>
                    <option value="जिल्हा अध्यक्ष">3. जिल्हा अध्यक्ष</option>
                    <option value="सल्लागार">4. सल्लागार</option>
                  </select>
                  <span className="text-xs text-slate-500 font-medium">
                    या श्रेणीत एकूण: <strong>{categoryLeaders.length}</strong> पदाधिकारी
                  </span>
                </div>

                {/* Already Added Leaders Capsule Cards */}
                <div>
                  <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider mb-3">
                    विद्यमान पदाधिकारी ({leaderCategory})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {categoryLeaders.map((ldr) => (
                      <div
                        key={ldr.id || ldr.name}
                        className="bg-white rounded-full p-2 pr-4 border border-[#e2e8f0] shadow-xs flex items-center justify-between gap-3 hover:border-[#df6b16] transition-all"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {ldr.photo ? (
                            <img
                              src={ldr.photo}
                              alt={ldr.name}
                              className="w-10 h-10 rounded-full object-cover border border-[#d4af37] shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-400 shrink-0">
                              <ImageIcon className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <h5 className="font-bold text-xs text-[#09243f] truncate">
                              {ldr.name}
                            </h5>
                            <span className="text-[11px] text-[#df6b16] font-semibold block truncate">
                              {ldr.role} {ldr.region ? `(${ldr.region})` : ''}
                            </span>
                          </div>
                        </div>

                        {/* Edit and Delete Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleEditLeader(ldr)}
                            className="p-1.5 hover:bg-amber-100 text-amber-700 rounded-full transition-colors"
                            title="दुरुस्त करा (Edit)"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLeader(ldr.id, ldr.name)}
                            className="p-1.5 hover:bg-rose-100 text-rose-600 rounded-full transition-colors"
                            title="वगळा (Delete)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Form to Add / Edit Leader (Photo < 200KB) */}
                <div className="bg-[#fbfbfd] p-5 rounded-xl border border-slate-200">
                  <h4 className="font-serifDevanagari text-base font-bold text-[#17366d] mb-1">
                    {editingLeaderId ? 'पदाधिकारी माहिती दुरुस्त करा (Edit Leader)' : `नवीन पदाधिकारी जोडा (${leaderCategory})`}
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
                          पदाधिकाऱ्याचे नाव <span className="text-rose-600">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={leaderName}
                          onChange={(e) => setLeaderName(e.target.value)}
                          placeholder="उदा. श्री. रमेश देशमुख"
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
                            placeholder="https://... (गुगल ड्राईव्ह, Cloudinary किंवा मोफत इमेज URL)"
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg text-[11px] focus:outline-none focus:border-[#df6b16]"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="submit"
                        className="bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold px-6 py-2.5 rounded-lg text-xs shadow-xs"
                      >
                        {editingLeaderId ? 'बदल सेव्ह करा' : 'पदाधिकारी जोडा'}
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

            {/* Sub-tab 3: News / Circular / Photo Management */}
            {activeAdminSubTab === 'add_news' && (
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
                        setNewsManageMode('photo_only');
                        setNewsError('');
                      }}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                        newsManageMode === 'photo_only'
                          ? 'bg-[#df6b16] text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      <ImageIcon className="w-4 h-4" />
                      <span>📷 केवळ फोटो अपलोड करा</span>
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
                      <FileText className="w-4 h-4" />
                      <span>📋 सर्व बातम्या व परिपत्रके ({newsList.length})</span>
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

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                            <option value="शासन निर्णय (GR)">शासन निर्णय (GR)</option>
                            <option value="बैठक अहवाल">बैठक अहवाल</option>
                            <option value="जिल्हा वृत्त">जिल्हा वृत्त</option>
                            <option value="अभिनंदन">अभिनंदन</option>
                            <option value="अधिकृत छायाचित्र / परिपत्रक">अधिकृत छायाचित्र / परिपत्रक</option>
                          </select>
                        </div>

                        <div>
                          <label className="font-bold text-slate-700 block mb-1">
                            फोटो अपलोड (Direct Cloudinary Upload)
                          </label>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#09243f] hover:bg-[#17366d] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors">
                                <Upload className="w-3.5 h-3.5 text-[#df6b16]" />
                                <span>
                                  {isUploadingNewsCloudinary
                                    ? 'Cloudinary वर अपलोड होत आहे...'
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

                            <p className="text-[11px] text-slate-500">
                              ☁️ निवडलेला फोटो थेट मोफत Cloudinary CDN वर सेव्ह होतो (Firebase चा ०% कोटा वापरला जातो).
                            </p>
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

                {/* MODE 2: Quick Photo-Only Upload ("केवळ फोटो अपलोड करा") */}
                {newsManageMode === 'photo_only' && (
                  <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-xs max-w-2xl">
                    <div className="pb-4 mb-5 border-b border-slate-100">
                      <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#17366d] flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-[#df6b16]" />
                        केवळ फोटो किंवा परिपत्रक अपलोड करा (Quick Photo Upload)
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        फक्त फोटोचे शीर्षक आणि फोटो निवडा. वेबसाईटवर बातमी ऐवजी <strong>'📷 फोटो पहा'</strong> असे बटण दिसेल.
                      </p>
                    </div>

                    <div className="mb-5 p-3.5 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-900 space-y-1">
                      <p className="font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-sky-600" />
                        थेट क्लाऊडनरी मोफत इमेज होस्टिंग (०% Firebase डेटा खर्च)
                      </p>
                      <p className="text-[11px] text-sky-800">
                        येथे अपलोड केलेला फोटो आपोआप Cloudinary वर जाईल आणि मुख्य वेबसाईटवर संबंधित विभागात 100% स्पष्ट दिसेल.
                      </p>
                    </div>

                    <form onSubmit={handleCreatePhotoOnly} className="space-y-4 text-xs">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          १. फोटोचे किंवा परिपत्रकाचे शीर्षक <span className="text-rose-600">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="उदा. राज्यस्तरीय शैक्षणिक परिषद २०२६ छायाचित्र / शासन निर्णय पत्र..."
                          value={photoOnlyTitle}
                          onChange={(e) => setPhotoOnlyTitle(e.target.value)}
                          className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16] text-sm"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          २. फोटो निवडा (Upload Photo to Cloudinary) <span className="text-rose-600">*</span>
                        </label>
                        <div className="space-y-3">
                          <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 bg-[#df6b16] hover:bg-[#c85c0e] text-white text-xs font-bold rounded-lg shadow-xs transition-colors">
                            <Upload className="w-4 h-4" />
                            <span>
                              {isUploadingPhotoOnly
                                ? 'Cloudinary वर अपलोड होत आहे...'
                                : 'मोबाईल किंवा संगणकावरून फोटो निवडा'}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handlePhotoOnlySelect}
                              className="hidden"
                              disabled={isUploadingPhotoOnly}
                            />
                          </label>

                          {photoOnlyImageUrl && (
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <img
                                  src={photoOnlyImageUrl}
                                  alt="Preview"
                                  className="w-16 h-16 object-cover rounded-lg border border-slate-300"
                                />
                                <div>
                                  <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> फोटो सज्ज आहे
                                  </span>
                                  <p className="text-[10px] text-slate-500 font-mono truncate max-w-xs">
                                    {photoOnlyImageUrl}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setPhotoOnlyImageUrl('')}
                                className="text-xs text-rose-600 hover:underline font-semibold"
                              >
                                फोटो बदला
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pt-3">
                        <button
                          type="button"
                          onClick={handleOpenPhotoOnlyPreview}
                          className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-5 rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-xs"
                        >
                          <Eye className="w-4 h-4 text-emerald-400" />
                          <span>प्रिव्ह्यू पहा (Live Preview)</span>
                        </button>

                        <button
                          type="submit"
                          disabled={!photoOnlyTitle.trim() || !photoOnlyImageUrl || isUploadingPhotoOnly}
                          className="bg-[#df6b16] hover:bg-[#c85c0e] disabled:opacity-50 text-white font-bold py-2.5 px-6 rounded-lg text-xs transition-colors shadow-xs flex items-center gap-1.5"
                        >
                          <Check className="w-4 h-4" />
                          <span>फोटो वेबसाईटवर प्रसिद्ध करा</span>
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* MODE 3: Published News & GR List with Edit & Delete */}
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

            {/* Sub-tab: Manage Admins (Role-Based Access Control) */}
            {activeAdminSubTab === 'manage_admins' && (
              <div className="space-y-6">
                <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-100 gap-2">
                    <div>
                      <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#17366d] flex items-center gap-2">
                        <Shield className="w-5 h-5 text-[#df6b16]" />
                        व्यवस्थापक प्रशासन (Manage Admins & Roles)
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        सदस्य मंजुरी, बातम्या टाकणे आणि नेतृत्व माहिती बदलण्याचे काम वेगवेगळ्या व्यक्तींना सोपवा.
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
                  <form onSubmit={handleAddAdminUser} className="space-y-4 max-w-2xl bg-slate-50/70 p-5 rounded-xl border border-slate-200 text-xs">
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

                    {/* Permissions Checkboxes */}
                    <div className="pt-2">
                      <label className="font-bold text-slate-800 block mb-2">
                        या ॲडमिनला द्यावयाचे अधिकार निवडा (Select Permissions): <span className="text-rose-600">*</span>
                      </label>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label
                          className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-2.5 ${
                            newAdminPermissions.approveMembers
                              ? 'bg-amber-50/80 border-amber-300 shadow-xs'
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={newAdminPermissions.approveMembers}
                            onChange={(e) =>
                              setNewAdminPermissions({
                                ...newAdminPermissions,
                                approveMembers: e.target.checked,
                              })
                            }
                            className="mt-0.5 w-4 h-4 text-[#df6b16] rounded border-slate-300 focus:ring-[#df6b16]"
                          />
                          <div>
                            <strong className="text-slate-800 block text-xs">
                              सदस्य पडताळणी व मंजुरी
                            </strong>
                            <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">
                              अर्ज तपासणे, फी खात्री व मंजुरी देणे
                            </span>
                          </div>
                        </label>

                        <label
                          className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-2.5 ${
                            newAdminPermissions.manageNews
                              ? 'bg-blue-50/80 border-blue-300 shadow-xs'
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={newAdminPermissions.manageNews}
                            onChange={(e) =>
                              setNewAdminPermissions({
                                ...newAdminPermissions,
                                manageNews: e.target.checked,
                              })
                            }
                            className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                          />
                          <div>
                            <strong className="text-slate-800 block text-xs">
                              बातम्या व परिपत्रके
                            </strong>
                            <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">
                              बातम्या, GR व फोटो वेबसाईटवर टाकणे
                            </span>
                          </div>
                        </label>

                        <label
                          className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-2.5 ${
                            newAdminPermissions.manageLeadership
                              ? 'bg-purple-50/80 border-purple-300 shadow-xs'
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={newAdminPermissions.manageLeadership}
                            onChange={(e) =>
                              setNewAdminPermissions({
                                ...newAdminPermissions,
                                manageLeadership: e.target.checked,
                              })
                            }
                            className="mt-0.5 w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
                          />
                          <div>
                            <strong className="text-slate-800 block text-xs">
                              नेतृत्व व्यवस्थापन
                            </strong>
                            <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">
                              कार्यकारिणी व जिल्हाध्यक्ष माहिती बदलणे
                            </span>
                          </div>
                        </label>
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
                  <h4 className="font-serifDevanagari text-base font-bold text-[#17366d] mb-4 pb-2 border-b border-slate-100 flex items-center justify-between">
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
                            <th className="p-3 text-center">कृती</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {adminUsersList.map((subAdmin, index) => (
                            <tr key={subAdmin.id} className="hover:bg-slate-50 transition-colors">
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
                                  {subAdmin.permissions.approveMembers && (
                                    <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded text-[10px] font-bold">
                                      सदस्य मंजुरी
                                    </span>
                                  )}
                                  {subAdmin.permissions.manageNews && (
                                    <span className="bg-blue-100 text-blue-900 px-2 py-0.5 rounded text-[10px] font-bold">
                                      बातम्या व परिपत्रके
                                    </span>
                                  )}
                                  {subAdmin.permissions.manageLeadership && (
                                    <span className="bg-purple-100 text-purple-900 px-2 py-0.5 rounded text-[10px] font-bold">
                                      नेतृत्व व्यवस्थापन
                                    </span>
                                  )}
                                  {!subAdmin.permissions.approveMembers &&
                                    !subAdmin.permissions.manageNews &&
                                    !subAdmin.permissions.manageLeadership && (
                                      <span className="text-slate-400 text-[10px]">कोणतेही अधिकार नाहीत</span>
                                    )}
                                </div>
                              </td>
                              <td className="p-3">
                                {subAdmin.isFirstLogin || !subAdmin.password ? (
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
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAdmin(subAdmin.id, subAdmin.email)}
                                  className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 p-1.5 rounded transition-colors"
                                  title="व्यवस्थापक अधिकार काढून टाका"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
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

            {/* Sub-tab 5: Contact Inquiries & Messages */}
            {activeAdminSubTab === 'contact_messages' && (
              <div className="space-y-4">
                {/* Header & Filter Bar */}
                <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#17366d] flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-[#df6b16]" />
                      प्राप्त संदेश व विचारणा (Contact Inquiries)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      वेबसाईटवरील संपर्क फॉर्मद्वारे प्राथमिक शिक्षण विभागातील केंद्रप्रमुख व अधिकाऱ्यांनी पाठवलेले प्रश्न व संदेश.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={loadContactMessages}
                      disabled={isLoadingContacts}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors"
                      title="नवीन संदेश रिफ्रेश करा"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingContacts ? 'animate-spin text-[#df6b16]' : ''}`} />
                      रिफ्रेश करा
                    </button>
                    <span className="bg-amber-100 text-[#df6b16] font-bold text-xs px-3 py-1.5 rounded-lg border border-amber-300 font-mono">
                      एकूण: {toEnglishDigits(contactMessages.length)}
                    </span>
                  </div>
                </div>

                {/* Search & Filter Toolbar */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="text"
                      value={contactSearchQuery}
                      onChange={(e) => setContactSearchQuery(e.target.value)}
                      placeholder="नाव, मोबाईल, विषय किंवा संदेशात शोधा..."
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <select
                    value={contactDistrictFilter}
                    onChange={(e) => setContactDistrictFilter(e.target.value)}
                    className="p-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16] bg-white min-w-[160px]"
                  >
                    <option value="">सर्व 34 जिल्हे</option>
                    {MAHARASHTRA_DISTRICTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Messages List */}
                {(() => {
                  const filtered = contactMessages.filter((m) => {
                    const matchesSearch =
                      !contactSearchQuery.trim() ||
                      (m.name || '').toLowerCase().includes(contactSearchQuery.toLowerCase()) ||
                      (m.phone || '').includes(contactSearchQuery) ||
                      (m.subject || '').toLowerCase().includes(contactSearchQuery.toLowerCase()) ||
                      (m.message || '').toLowerCase().includes(contactSearchQuery.toLowerCase());
                    const matchesDist = !contactDistrictFilter || m.district === contactDistrictFilter;
                    return matchesSearch && matchesDist;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="bg-white p-12 text-center rounded-xl border border-dashed border-slate-300 text-slate-400 space-y-2">
                        <MessageSquare className="w-12 h-12 mx-auto text-slate-300" />
                        <p className="text-sm font-semibold text-slate-600">कोणतेही संदेश आढळले नाहीत.</p>
                        <p className="text-xs text-slate-400">
                          वेबसाईटच्या संपर्क पानावरील फॉर्मवरून कोणी संदेश पाठवल्यास तो येथे तात्काळ दिसेल.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 gap-4">
                      {filtered.map((msg) => {
                        const cleanPhone = (msg.phone || '').replace(/\D/g, '');
                        return (
                          <div
                            key={msg.id}
                            className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-amber-400 transition-all space-y-3"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                              <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-full bg-amber-500/10 text-amber-800 font-bold flex items-center justify-center shrink-0 border border-amber-300">
                                  {msg.name?.charAt(0) || '👤'}
                                </div>
                                <div>
                                  <h4 className="font-bold text-sm text-[#09243f] leading-snug">
                                    {msg.name}
                                  </h4>
                                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                    {msg.district && (
                                      <span className="bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded text-[10px] border border-slate-200">
                                        📍 {msg.district}
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
                                  onClick={() => handleDeleteContactMessage(msg.id)}
                                  className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors border border-rose-200"
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
                            </div>

                            {/* Action Links: Phone Call, WhatsApp & Email */}
                            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
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

                              {msg.email && (
                                <a
                                  href={`mailto:${msg.email}`}
                                  className="inline-flex items-center gap-1.5 bg-slate-50 text-slate-700 hover:bg-slate-100 font-medium px-3 py-1.5 rounded-lg border border-slate-200 transition-colors"
                                >
                                  <Mail className="w-3.5 h-3.5" />
                                  <span>{msg.email}</span>
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Super Admin Only: Minimal Cloud Storage Config (Hidden from all other sub-admins) */}
            {activeAdminSubTab === 'cloudinary' && currentUser?.isSuperAdmin && (
              <div className="bg-white p-6 rounded-xl border border-slate-300 shadow-md space-y-4 max-w-lg mx-auto">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <h3 className="font-serifDevanagari text-base font-bold text-[#17366d]">
                      क्लाउड स्टोरेज व्यवस्थापन (फक्त मुख्य प्रशासक)
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveAdminSubTab('applications')}
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
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* Verification Modal with Details & Mandatory Payment Checkbox (Point 4) */}
      {/* ============================================================== */}
      {selectedAppForVerification && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl relative border-2 border-slate-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <span className="text-[11px] font-bold uppercase text-[#df6b16]">
                  अर्ज पडताळणी कक्ष (Verification)
                </span>
                <h3 className="font-serifDevanagari text-lg font-bold text-[#09243f]">
                  सदस्यत्व अर्जदार सविस्तर माहिती
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAppForVerification(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              {/* Photo & Core Name Row */}
              <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="shrink-0 w-24 h-28 bg-white border-2 border-[#d4af37] rounded-lg overflow-hidden flex items-center justify-center shadow-xs">
                  {selectedAppForVerification.photo ? (
                    <img
                      src={selectedAppForVerification.photo}
                      alt={selectedAppForVerification.fullName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center text-slate-400 p-2">
                      <ImageIcon className="w-8 h-8 mx-auto opacity-50" />
                      <span className="text-[9px]">फोटो नाही</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <h4 className="font-serifDevanagari text-base font-bold text-[#193568]">
                    {selectedAppForVerification.salutation} {selectedAppForVerification.fullName}
                  </h4>
                  <p className="text-slate-600">
                    अर्ज क्रमांक: <strong className="font-mono text-[#09243f]">{selectedAppForVerification.applicationNumber}</strong>
                  </p>
                  <p className="text-slate-600">
                    नोंदणी दिनांक: {formatDateWithEnglishDigits(selectedAppForVerification.createdAt)}
                  </p>
                  <p className="text-slate-600">
                    मोबाईल: <strong className="font-mono text-[#df6b16]">{selectedAppForVerification.phone}</strong>
                  </p>
                  <p className="text-slate-600">
                    ई-मेल: {selectedAppForVerification.email}
                  </p>
                </div>
              </div>

              {/* Geographical & Organizational Details */}
              <div className="grid grid-cols-2 gap-3 bg-white p-3 border border-slate-200 rounded-lg">
                <div>
                  <span className="text-slate-400 block text-[10px]">जिल्हा:</span>
                  <strong className="text-[#09243f]">{selectedAppForVerification.district}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">सध्याचे पद / संवर्ग:</span>
                  <strong className="text-[#09243f]">{selectedAppForVerification.professional || 'केंद्रप्रमुख'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">शैक्षणिक पात्रता:</span>
                  <span>{selectedAppForVerification.education || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">व्यावसायिक पात्रता:</span>
                  <span className="font-semibold text-slate-800">{selectedAppForVerification.professionalQualification || '-'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block text-[10px]">कुटुंब सदस्य / छंद:</span>
                  <span>{selectedAppForVerification.familyMembers || '-'} / {selectedAppForVerification.hobby || '-'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block text-[10px]">पत्ता / कार्यक्षेत्र:</span>
                  <span>{selectedAppForVerification.address}</span>
                </div>
              </div>

              {/* If Official Member */}
              {selectedAppForVerification.isOfficial && (
                <div className="bg-amber-50/60 border border-amber-300 p-3 rounded-lg text-amber-900">
                  <span className="font-bold block text-xs mb-0.5">⭐ संघटनेतील अधिकृत पदाधिकारी:</span>
                  <p>
                    पद: <strong>{selectedAppForVerification.officialPost}</strong>
                    {selectedAppForVerification.officialDistrict && ` | जिल्हा: ${selectedAppForVerification.officialDistrict}`}
                    {selectedAppForVerification.officialTaluka && ` | तालुका: ${selectedAppForVerification.officialTaluka}`}
                  </p>
                </div>
              )}

              {/* Mandatory Checkbox for Payment Verification */}
              <div className="bg-[#fff7f0] border-2 border-[#df6b16] p-4 rounded-xl">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={paymentConfirmedChecked}
                    onChange={(e) => setPaymentConfirmedChecked(e.target.checked)}
                    className="w-5 h-5 text-[#df6b16] rounded border-slate-300 focus:ring-[#df6b16]"
                  />
                  <div>
                    <strong className="text-xs text-[#09243f] block">
                      सदस्यत्व व वर्गणी फी बँक खात्यावर जमा झाल्याची खात्री केली आहे <span className="text-rose-600">*</span>
                    </strong>
                    <span className="text-[11px] text-slate-600">
                      आजीवन सदस्यत्व (₹100) किंवा वार्षिक वर्गणी (₹120) महासंघाच्या अधिकृत बँक ऑफ महाराष्ट्र खात्यावर जमा झाल्याची पडताळणी झाली आहे.
                    </span>
                  </div>
                </label>
              </div>

              {/* Action Buttons: Disabled unless Checkbox Checked */}
              <div className="pt-2 flex items-center justify-between gap-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!paymentConfirmedChecked}
                    onClick={handleApproveVerified}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-lg flex items-center gap-1.5 shadow-sm text-xs transition-all"
                  >
                    <Check className="w-4 h-4" />
                    मंजूर करा (Approve)
                  </button>
                  <button
                    type="button"
                    disabled={!paymentConfirmedChecked}
                    onClick={handleRejectVerified}
                    className="bg-rose-50 hover:bg-rose-100 border border-rose-300 disabled:opacity-40 disabled:cursor-not-allowed text-rose-700 font-bold px-4 py-2.5 rounded-lg flex items-center gap-1.5 text-xs transition-all"
                  >
                    <X className="w-4 h-4" />
                    नाकारा (Reject)
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedAppForVerification(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-lg text-xs"
                >
                  बंद करा
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Royal Certificate Print Modal - Strictly '॥ आजीवन सदस्य प्रमाणपत्र ॥', '⭐ आजीवन सदस्य ⭐', Stamp Removed */}
      {/* ============================================================== */}
      {certModalApp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 md:p-8 shadow-2xl relative border-4 border-[#d4af37] max-h-[90vh] overflow-y-auto">
            <div className="border-4 border-double border-[#d4af37] p-6 rounded-xl text-center space-y-4 bg-gradient-to-b from-[#fbf8f2] via-white to-[#fbf8f2]">
              {/* Header Banner Image */}
              <div className="flex items-center justify-center">
                <img
                  src="/heding.jpg"
                  alt="महासंघ हेडिंग"
                  className="max-h-20 w-auto object-contain mx-auto"
                />
              </div>

              <div>
                <span className="text-xs font-bold text-[#df6b16] tracking-widest block uppercase">
                  महाराष्ट्र राज्य
                </span>
                <h2 className="font-serifDevanagari text-2xl md:text-3xl font-extrabold text-[#09243f]">
                  केंद्रप्रमुख व अधिकारी महासंघ
                </h2>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  नोंदणी क्र. {ORG_DETAILS.registrationNo}
                </p>
              </div>

              {/* Title centered properly */}
              <div className="py-1 flex justify-center">
                <span className="inline-flex items-center justify-center bg-[#851216] text-[#ffdd80] px-8 py-2 rounded-full text-xs font-bold tracking-widest shadow-xs">
                  ॥ आजीवन सदस्य प्रमाणपत्र ॥
                </span>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-slate-600">प्रमाणित करण्यात येते की,</p>
                <h3 className="font-serifDevanagari text-xl md:text-2xl font-bold text-[#851216]">
                  {certModalApp.fullName}
                </h3>
                <p className="text-xs font-semibold text-slate-700">
                  {certModalApp.professional || 'केंद्रप्रमुख / अधिकारी'}
                  {certModalApp.isOfficial && certModalApp.officialPost && (
                    <span className="text-[#df6b16] block font-bold mt-0.5">
                      {certModalApp.officialPost} {certModalApp.officialTaluka ? `(${certModalApp.officialTaluka})` : ''}
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-600">
                  (जिल्हा: {certModalApp.district})
                </p>

                {/* Badge between stars */}
                <div className="py-1.5 flex justify-center">
                  <span className="inline-flex items-center gap-1.5 bg-[#fbf3e4] border border-[#d4af37] text-[#851216] font-bold text-xs px-5 py-1 rounded-full shadow-xs">
                    ⭐ आजीवन सदस्य ⭐
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-slate-700 pt-3 max-w-lg mx-auto leading-loose">
                  आपण महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाचे अधिकृत आजीवन सदस्यत्व स्वीकारले असून, संघटनेच्या संघटन, सन्मान, समर्पण व शैक्षणिक गुणवत्ता या चतुःसूत्रीशी कटिबद्ध राहून शिक्षण क्षेत्राच्या सर्वांगीण विकासासाठी कार्यरत राहाल, या विश्वासासह हे सन्मानपत्र प्रदान करण्यात येत आहे.
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl max-w-sm mx-auto text-xs space-y-1">
                <div className="font-bold text-[#09243f]">
                  सदस्य क्रमांक: <span className="text-base text-[#df6b16] font-serif font-bold">{certModalApp.memberNumber}</span>
                </div>
                <div className="text-slate-600 text-[11px]">
                  नोंदणी दिनांक: {formatDateWithEnglishDigits(certModalApp.createdAt)}
                </div>
              </div>

              {/* Signature Row: Stamp completely removed as requested! Left side has association info, Right side has Rajendra Khairnar signature */}
              <div className="pt-6 flex justify-between items-end border-t border-slate-200 px-6 text-xs text-slate-700">
                <div className="text-left text-[11px] text-slate-600 leading-tight">
                  <p className="font-bold text-[#09243f]">महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ</p>
                  <p className="mt-0.5">श्रमिक संघ / धर्मादाय आयुक्त नोंदणीकृत</p>
                  <p>नोंदणी क्र. {ORG_DETAILS.registrationNo}</p>
                </div>

                <div className="text-center">
                  <img
                    src="/sign.jpg"
                    alt="राजेंद्र खैरनार सही"
                    className="h-10 mx-auto object-contain mb-1"
                  />
                  <div className="font-bold text-sm text-[#09243f]">
                    {ORG_DETAILS.founderPresident.name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    संस्थापक राज्याध्यक्ष
                  </div>
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="pt-6 flex justify-center gap-3 no-print">
                <button
                  type="button"
                  onClick={() => generateMembershipCertificatePdf(certModalApp)}
                  className="bg-[#df6b16] hover:bg-[#c85c0e] text-white text-xs font-bold px-5 py-2.5 rounded-lg flex items-center gap-1.5 shadow"
                >
                  <Download className="w-4 h-4" />
                  PDF डाऊनलोड करा
                </button>
                <button
                  type="button"
                  onClick={() => setCertModalApp(null)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold px-5 py-2.5 rounded-lg"
                >
                  बंद करा
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

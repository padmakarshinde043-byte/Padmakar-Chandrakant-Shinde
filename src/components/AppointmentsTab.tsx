import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, ShieldCheck, Award, FileText, Share2,
  Lock, Unlock, Plus, Trash2, Edit3, RefreshCw, KeyRound, CheckCircle2,
  AlertCircle, ChevronRight, Phone, MapPin, Building, Calendar, Users, Download, X, Eye, EyeOff
} from 'lucide-react';
import {
  DISTRICT_TALUKAS_MAP, MAHARASHTRA_36_DISTRICTS, OfficialMember,
  SUPER_ADMIN_PASSWORD, MASTER_DEV_ADMIN_PASSWORD, DEFAULT_DISTRICT_PASSWORD,
  DEFAULT_APPOINTED_POSTS, formatAppointedPostWithTaluka, isTalukaLevelPost
} from '../data/rkMaharashtraData';
import {
  fetchOfficials, saveOfficialToRtdb, deleteOfficialFromRtdb,
  fetchDistrictPasswords, updateDistrictPasswordInRtdb, fetchAppointedPosts,
  fetchPresidentPasswordFromFirebase, updatePresidentPasswordInFirebase
} from '../services/rkFirebaseService';
import {
  generateSingleLetterPdf,
  generateDistrictExecutivePdf,
  generateStatewideRegistryPdf,
  generateOrganizationStatusPdf,
  generateDistrictPresidentsPdf,
  generateTalukaPresidentsPdf,
  generateRegisteredMembersPdf
} from '../services/rkPdfGenerator';
import { toEnglishDigits, formatDateWithEnglishDigits } from '../utils/formatters';
import { ORG_DETAILS, MembershipApplication } from '../data/mahasanghData';
import { fetchApprovedMembersCached } from '../firebase';
import {
  getOfficialsFromStorageSync,
  getPostsFromStorageSync,
  getDistrictPasswordsFromStorageSync,
  getPresidentPasswordFromStorageSync,
  filterAndSortDistrictOfficials,
} from '../utils/officialsCache';

export const AppointmentsTab: React.FC = () => {
  // Hydrate synchronously from localStorage for instant 0ms tab render
  const [officials, setOfficials] = useState<OfficialMember[]>(() => getOfficialsFromStorageSync());
  const [isLoading, setIsLoading] = useState<boolean>(() => getOfficialsFromStorageSync().length === 0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');
  const [postsList, setPostsList] = useState<Array<{ name: string; isTaluka: boolean }>>(() =>
    getPostsFromStorageSync()
  );
  const [districtPasswords, setDistrictPasswords] = useState<Record<string, string>>(() =>
    getDistrictPasswordsFromStorageSync()
  );

  // Active sub-tab matching greetings.mahasangh.in
  const [activeSubTab, setActiveSubTab] = useState<'directory' | 'manage' | 'letters'>('directory');

  // Filters & Search
  const [currentDistrict, setCurrentDistrict] = useState<string>('गडचिरोली');
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
  const [formDistrict, setFormDistrict] = useState<string>('गडचिरोली');
  const [formTaluka, setFormTaluka] = useState<string>('');
  const [formCadre, setFormCadre] = useState<string>('केंद्रप्रमुख');
  const [customCadreInput, setCustomCadreInput] = useState<string>('');
  const [formWorkingPlace, setFormWorkingPlace] = useState<string>('');
  const [formWorkingTaluka, setFormWorkingTaluka] = useState<string>('');
  const [formMobile, setFormMobile] = useState<string>('');

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

  // Load Initial Data on Mount (Cache-first, non-blocking: public list never waits on Firestore or passwords)
  useEffect(() => {
    loadData(false);
  }, []);

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

      // 2. Non-blocking background sync for admin passwords (and approved members only if letters tab active)
      fetchDistrictPasswords(force)
        .then((passwordsData) => setDistrictPasswords(passwordsData))
        .catch(() => {});
      fetchPresidentPasswordFromFirebase()
        .then((presPass) => {
          if (presPass) setPresidentSavedPassword(presPass);
        })
        .catch(() => {});

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
    if (formPost.includes('राज्य') || formPost.includes('विभाग') || formPost.includes('जिल्हा')) {
      return false;
    }
    const found = postsList.find((p) => p.name === formPost);
    if (found) return Boolean(found.isTaluka);
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

  // Submit District Login from in-page modal
  const handleDistrictLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDistrictLoginError('');

    const input = districtPasswordInput.trim();
    if (!input) {
      setDistrictLoginError('कृपया पासवर्ड प्रविष्ट करा.');
      return;
    }

    // 1. Super Admin master password bypass
    if (input === SUPER_ADMIN_PASSWORD || input === MASTER_DEV_ADMIN_PASSWORD) {
      setIsSuperAdmin(true);
      setIsManageUnlocked(true);
      setIsLettersUnlocked(true);
      setShowDistrictLoginModal(false);
      setActiveSubTab('manage');
      return;
    }

    // 2. District specific password
    const distPass =
      districtPasswords[currentDistrict] ||
      (currentDistrict === 'अहिल्यानगर' ? districtPasswords['अहमदनगर'] : null) ||
      DEFAULT_DISTRICT_PASSWORD;

    // Check if initial login with AD2026
    if (distPass === DEFAULT_DISTRICT_PASSWORD && input === DEFAULT_DISTRICT_PASSWORD) {
      setIsSettingInitialPassword(true);
      return;
    }

    // Check if matches custom saved password from Firebase RTDB
    if (input === distPass) {
      setIsManageUnlocked(true);
      setLockedDistrictName(currentDistrict);
      setShowDistrictLoginModal(false);
      setActiveSubTab('manage');
    } else {
      setDistrictLoginError(`चुकीचा पासवर्ड! आपण फक्त '${currentDistrict}' जिल्ह्याचा पासवर्ड टाकूनच संपादन करू शकता.`);
    }
  };

  // Save Initial New Password for District
  const handleSaveInitialPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInitialPass1.trim() || newInitialPass1.trim() === DEFAULT_DISTRICT_PASSWORD) {
      setDistrictLoginError('कृपया वैध नवीन पासवर्ड प्रविष्ट करा!');
      return;
    }
    if (newInitialPass1.trim() !== newInitialPass2.trim()) {
      setDistrictLoginError('दोन्ही पासवर्ड जुळले नाहीत!');
      return;
    }

    try {
      const newPass = newInitialPass1.trim();
      await updateDistrictPasswordInRtdb(currentDistrict, newPass);
      setDistrictPasswords((prev) => ({ ...prev, [currentDistrict]: newPass }));
      setIsManageUnlocked(true);
      setLockedDistrictName(currentDistrict);
      setShowDistrictLoginModal(false);
      setIsSettingInitialPassword(false);
      setActiveSubTab('manage');
      showToast(`'${currentDistrict}' जिल्ह्यासाठी नवीन पासवर्ड सेट झाला आहे!`, 'success');
    } catch (err: any) {
      setDistrictLoginError('त्रुटी: ' + err.message);
    }
  };

  // Submit President Master Login from in-page modal
  const handlePresidentLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPresidentLoginError('');
    const input = presidentPasswordInput.trim();

    if (!input) {
      setPresidentLoginError('कृपया पासवर्ड प्रविष्ट करा.');
      return;
    }

    // Emergency developer recovery bypass
    if (input === MASTER_DEV_ADMIN_PASSWORD) {
      setIsSuperAdmin(true);
      setIsManageUnlocked(true);
      setIsLettersUnlocked(true);
      setShowPresidentLoginModal(false);
      setActiveSubTab('letters');
      showToast('संस्थापक राज्याध्यक्ष म्हणून स्वागत आहे (मास्टर की)!', 'success');
      return;
    }

    const currentSaved = presidentSavedPassword || SUPER_ADMIN_PASSWORD;

    // Check if initial login with RK2026 default password
    if (currentSaved === SUPER_ADMIN_PASSWORD && input === SUPER_ADMIN_PASSWORD) {
      setIsSettingPresidentInitialPassword(true);
      return;
    }

    // Check if custom password matches saved password in Firebase
    if (input === currentSaved) {
      setIsSuperAdmin(true);
      setIsManageUnlocked(true);
      setIsLettersUnlocked(true);
      setShowPresidentLoginModal(false);
      setActiveSubTab('letters');
      showToast('संस्थापक राज्याध्यक्ष म्हणून स्वागत आहे!', 'success');
    } else {
      setPresidentLoginError('चुकीचा पासवर्ड! केवळ संस्थापक राज्याध्यक्षच हे लॉगिन करू शकतात.');
    }
  };

  // Save Initial New Password for State President to Firebase
  const handleSavePresidentInitialPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPresidentLoginError('');

    if (!newPresidentPass1.trim() || newPresidentPass1.trim() === SUPER_ADMIN_PASSWORD) {
      setPresidentLoginError('कृपया सुरक्षित व नवीन पासवर्ड प्रविष्ट करा (RK2026 व्यतिरिक्त)!');
      return;
    }
    if (newPresidentPass1.trim() !== newPresidentPass2.trim()) {
      setPresidentLoginError('दोन्ही पासवर्ड जुळले नाहीत! कृपया तपासून पहा.');
      return;
    }

    try {
      const newPass = newPresidentPass1.trim();
      await updatePresidentPasswordInFirebase(newPass);
      setPresidentSavedPassword(newPass);
      setIsSuperAdmin(true);
      setIsManageUnlocked(true);
      setIsLettersUnlocked(true);
      setShowPresidentLoginModal(false);
      setIsSettingPresidentInitialPassword(false);
      setActiveSubTab('letters');
      showToast('राज्याध्यक्ष नवीन पासवर्ड फायरबेसवर यशस्वीपणे सेव्ह झाला आहे! यापुढे हाच पासवर्ड वापरा.', 'success');
    } catch (err: any) {
      setPresidentLoginError('त्रुटी: ' + (err.message || 'पासवर्ड सेव्ह होऊ शकला नाही.'));
    }
  };

  // Change President Password from Inside Letters Tab
  const handleChangePresidentPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePassError('');

    const currentSaved = presidentSavedPassword || SUPER_ADMIN_PASSWORD;
    if (changeOldPass.trim() !== currentSaved && changeOldPass.trim() !== MASTER_DEV_ADMIN_PASSWORD) {
      setChangePassError('सध्याचा पासवर्ड चुकीचा आहे!');
      return;
    }
    if (!changeNewPass1.trim() || changeNewPass1.trim() === currentSaved) {
      setChangePassError('कृपया नवीन व वेगळा पासवर्ड प्रविष्ट करा!');
      return;
    }
    if (changeNewPass1.trim() !== changeNewPass2.trim()) {
      setChangePassError('दोन्ही नवीन पासवर्ड जुळले नाहीत!');
      return;
    }

    try {
      const newPass = changeNewPass1.trim();
      await updatePresidentPasswordInFirebase(newPass);
      setPresidentSavedPassword(newPass);
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
    setFormError('');
    setEditingMemberId(null);
    setFormSalutation('श्री.');
    setFormFirstName('');
    setFormMiddleName('');
    setFormLastName('');
    setFormPost(postsList[0]?.name || 'जिल्हाध्यक्ष');
    setFormDistrict(activeDist);
    setFormTaluka('');
    setFormCadre('केंद्रप्रमुख');
    setCustomCadreInput('');
    setFormWorkingPlace('');
    setFormWorkingTaluka('');
    setFormMobile('');
    setIsMemberModalOpen(true);
  };

  // Open Edit Member Modal
  const handleOpenEditModal = (m: OfficialMember) => {
    setFormError('');
    if (!isSuperAdmin && lockedDistrictName && m.district !== lockedDistrictName) {
      showToast(`अवैध कृती! आपणास केवळ '${lockedDistrictName}' जिल्ह्यातील पदाधिकारी संपादित करण्याचा अधिकार आहे!`, 'error');
      return;
    }
    setEditingMemberId(m.id);
    setFormSalutation(m.salutation || 'श्री.');
    setFormFirstName(m.firstName || '');
    setFormMiddleName(m.middleName || '');
    setFormLastName(m.lastName || '');
    setFormPost(m.appointedPost || '');
    setFormDistrict(m.district);
    setFormTaluka(m.taluka || '');
    if (['केंद्रप्रमुख', 'शिक्षण विस्तार अधिकारी', 'गटशिक्षणाधिकारी'].includes(m.currentCadre)) {
      setFormCadre(m.currentCadre);
      setCustomCadreInput('');
    } else {
      setFormCadre('केंद्रप्रमुख');
      setCustomCadreInput('');
    }
    setFormWorkingPlace(m.workingPlace || '');
    setFormWorkingTaluka(m.taluka || '');
    setFormMobile(m.mobile || '');
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

    const finalCadre = formCadre;
    // CRITICAL: Only taluka-level posts have an appointed taluka! State, Division, and District posts MUST have an empty taluka!
    const finalTaluka = isPostNeedsTaluka ? formTaluka.trim() : '';

    const memberId = editingMemberId || String(Date.now());
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

  // PDF Trigger 2: District Executive Letterhead Multi-Page PDF
  const handleDownloadDistrictExecutivePdf = async () => {
    setIsGeneratingDirPdf(true);
    setPdfProgressStatus('तयार होत आहे...');
    try {
      await generateDistrictExecutivePdf(currentDistrict, districtOfficials, (status) => {
        setPdfProgressStatus(status);
      });
      showToast(`'${currentDistrict}' कार्यकारिणी PDF यशस्वीपणे डाऊनलोड झाली!`, 'success');
    } catch (err: any) {
      showToast('जिल्हा कार्यकारिणी PDF तयार करताना त्रुटी: ' + err.message, 'error');
    } finally {
      setIsGeneratingDirPdf(false);
      setPdfProgressStatus('');
    }
  };

  // PDF Trigger 3: Statewide Master Registry Serial PDF
  const handleDownloadStatewideRegistryPdf = async () => {
    setIsGeneratingRegistryPdf(true);
    setPdfProgressStatus('तयार होत आहे...');
    try {
      await generateStatewideRegistryPdf(officials, (status) => {
        setPdfProgressStatus(status);
      });
      showToast('राज्य यादी PDF यशस्वीपणे डाऊनलोड झाली!', 'success');
    } catch (err: any) {
      showToast('राज्य यादी PDF तयार करताना त्रुटी: ' + err.message, 'error');
    } finally {
      setIsGeneratingRegistryPdf(false);
      setPdfProgressStatus('');
    }
  };

  // 36 Districts Organizational Status Matrix Calculation (Point 8)
  const districtMatrixStats = useMemo(() => {
    return MAHARASHTRA_36_DISTRICTS.map((dist) => {
      const distOfficials = officials.filter((o) => {
        if (!o || !o.district) return false;
        const d = o.district.trim();
        if (d === dist) return true;
        if (dist === 'अहिल्यानगर' && (d === 'अहमदनगर' || d.toLowerCase().includes('ahmed'))) return true;
        if (dist === 'अहमदनगर' && (d === 'अहिल्यानगर' || d.toLowerCase().includes('ahmed'))) return true;
        if (dist.includes('संभाजीनगर') && (d.includes('संभाजीनगर') || d.includes('औरंगाबाद'))) return true;
        if (dist.includes('धाराशिव') && (d.includes('धाराशिव') || d.includes('उस्मानाबाद'))) return true;
        return false;
      });

      let stateRep = 0;
      let divRep = 0;
      let distOfficial = 0;
      let talukaOfficial = 0;

      distOfficials.forEach((o) => {
        const p = (o.appointedPost || '').trim();
        const t = (o.taluka || '').trim();
        if (p.includes('राज्य')) {
          stateRep++;
        } else if (p.includes('विभागीय')) {
          divRep++;
        } else if (p.includes('तालुका') || Boolean(t)) {
          talukaOfficial++;
        } else {
          distOfficial++;
        }
      });

      const members = registeredApplications.filter((a) => {
        if (!a || a.status !== 'approved') return false;
        const d = (a.district || '').trim();
        if (d === dist) return true;
        if (dist === 'अहिल्यानगर' && (d === 'अहमदनगर' || d.toLowerCase().includes('ahmed'))) return true;
        if (dist.includes('संभाजीनगर') && (d.includes('संभाजीनगर') || d.includes('औरंगाबाद'))) return true;
        if (dist.includes('धाराशिव') && (d.includes('धाराशिव') || d.includes('उस्मानाबाद'))) return true;
        return false;
      }).length;

      const officialsTotal = stateRep + divRep + distOfficial + talukaOfficial;
      const rowTotal = officialsTotal + members;

      return {
        district: dist,
        stateRep,
        divRep,
        distOfficial,
        talukaOfficial,
        officialsTotal,
        members,
        rowTotal
      };
    });
  }, [officials, registeredApplications]);

  const matrixTotals = useMemo(() => {
    return districtMatrixStats.reduce(
      (acc, curr) => ({
        stateRep: acc.stateRep + curr.stateRep,
        divRep: acc.divRep + curr.divRep,
        distOfficial: acc.distOfficial + curr.distOfficial,
        talukaOfficial: acc.talukaOfficial + curr.talukaOfficial,
        officialsTotal: acc.officialsTotal + curr.officialsTotal,
        members: acc.members + curr.members,
        grandTotal: acc.grandTotal + curr.rowTotal
      }),
      { stateRep: 0, divRep: 0, distOfficial: 0, talukaOfficial: 0, officialsTotal: 0, members: 0, grandTotal: 0 }
    );
  }, [districtMatrixStats]);

  // PDF Trigger 4: Organization Status Black & White Matrix PDF (Point 8)
  const handleDownloadStatusMatrixPdf = async () => {
    setIsGeneratingRegistryPdf(true);
    setPdfProgressStatus('संघटना सद्यस्थिती अहवाल PDF तयार होत आहे...');
    try {
      await generateOrganizationStatusPdf(districtMatrixStats, (status) => setPdfProgressStatus(status));
      showToast('संघटना सद्यस्थिती A4 ब्लॅक & व्हाईट PDF यशस्वीपणे डाऊनलोड झाली!', 'success');
    } catch (err: any) {
      showToast('PDF त्रुटी: ' + err.message, 'error');
    } finally {
      setIsGeneratingRegistryPdf(false);
      setPdfProgressStatus('');
    }
  };

  // PDF Trigger 5: District Presidents List PDF (Point 9a)
  const handleDownloadDistrictPresidentsPdf = async () => {
    setIsGeneratingRegistryPdf(true);
    setPdfProgressStatus('सर्व जिल्हाध्यक्ष यादी तयार होत आहे...');
    try {
      const distPresidents = officials
        .filter((o) => (o.appointedPost || '').includes('जिल्हाध्यक्ष'))
        .map((m) => ({
          district: m.district,
          name: `${m.salutation} ${m.firstName} ${m.middleName ? m.middleName + ' ' : ''}${m.lastName}`.trim(),
          cadre: [m.currentCadre || 'केंद्रप्रमुख', m.workingPlace].filter(Boolean).join(', '),
          post: m.appointedPost,
          mobile: m.mobile || '-'
        }));
      await generateDistrictPresidentsPdf(distPresidents, (status) => setPdfProgressStatus(status));
      showToast('सर्व जिल्हाध्यक्ष यादी PDF यशस्वीपणे डाऊनलोड झाली!', 'success');
    } catch (err: any) {
      showToast('PDF त्रुटी: ' + err.message, 'error');
    } finally {
      setIsGeneratingRegistryPdf(false);
      setPdfProgressStatus('');
    }
  };

  // PDF Trigger 6: Taluka Presidents List PDF (Point 9b)
  const handleDownloadTalukaPresidentsPdf = async () => {
    setIsGeneratingRegistryPdf(true);
    setPdfProgressStatus('सर्व तालुका अध्यक्ष यादी तयार होत आहे...');
    try {
      const talukaPresidents = officials
        .filter((o) => (o.appointedPost || '').includes('तालुका अध्यक्ष'))
        .map((m) => ({
          district: m.district,
          taluka: m.taluka || '',
          name: `${m.salutation} ${m.firstName} ${m.middleName ? m.middleName + ' ' : ''}${m.lastName}`.trim(),
          cadre: [m.currentCadre || 'केंद्रप्रमुख', m.workingPlace].filter(Boolean).join(', '),
          post: m.appointedPost,
          mobile: m.mobile || '-'
        }));
      await generateTalukaPresidentsPdf(talukaPresidents, (status) => setPdfProgressStatus(status));
      showToast('सर्व तालुका अध्यक्ष यादी PDF यशस्वीपणे डाऊनलोड झाली!', 'success');
    } catch (err: any) {
      showToast('PDF त्रुटी: ' + err.message, 'error');
    } finally {
      setIsGeneratingRegistryPdf(false);
      setPdfProgressStatus('');
    }
  };

  // PDF Trigger 7: Approved Registered Members List PDF (Point 10)
  const handleDownloadRegisteredMembersPdf = async () => {
    setIsGeneratingRegistryPdf(true);
    setPdfProgressStatus('नोंदणीकृत सदस्य यादी तयार होत आहे...');
    try {
      const approvedApps = registeredApplications.filter((a) => a.status === 'approved');
      await generateRegisteredMembersPdf(approvedApps, (status) => setPdfProgressStatus(status));
      showToast('नोंदणीकृत सदस्य यादी PDF यशस्वीपणे डाऊनलोड झाली!', 'success');
    } catch (err: any) {
      showToast('PDF त्रुटी: ' + err.message, 'error');
    } finally {
      setIsGeneratingRegistryPdf(false);
      setPdfProgressStatus('');
    }
  };

  // WhatsApp Share Helper
  const handleShareOnWhatsApp = (m: OfficialMember) => {
    const serial = statewideSerialMap.get(m.id) || 1;
    const serialPadded = String(serial).padStart(2, '0');
    const fullName = `${m.salutation} ${m.firstName} ${m.middleName ? m.middleName + ' ' : ''}${m.lastName}`;
    const place = isTalukaLevelPost(m.appointedPost) && m.taluka ? `${m.taluka}, जिल्हा - ${m.district}` : `जिल्हा - ${m.district}`;

    const text = `*महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ*\n\n` +
      `॥ *अधिकृत नियुक्ती पत्र* ॥\n` +
      `नियुक्ती पत्र क्र.: MS/2026/${serialPadded}\n\n` +
      `हार्दिक अभिनंदन! 🎉\n` +
      `*${fullName}*\n` +
      `कार्यक्षेत्र: ${place}\n\n` +
      `आपली महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाच्या कार्यकारिणीवर:\n` +
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
    <div className="bg-[#f5f7fa] min-h-screen py-5 sm:py-7 text-slate-900">
      <div className="max-w-[1100px] mx-auto px-3 sm:px-4">
        {/* Institutional Page Masthead, District Control & Standard Portal Tabs */}
        <div className="bg-white border border-slate-300 border-t-4 border-t-[#193568] rounded-md mb-5 overflow-hidden">
          <div className="px-4 py-4 sm:px-6 sm:py-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-1">
                महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ · कार्यकारिणी कक्ष
              </div>
              <h1 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#193568] leading-snug">
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

              <div className="flex items-center justify-between sm:justify-end gap-2.5 text-xs border-t sm:border-t-0 pt-2.5 sm:pt-0 border-slate-200">
                <span className="text-slate-600 font-medium tabular-nums">
                  एकूण पदाधिकारी:{' '}
                  <strong className="text-[#193568] font-mono font-bold text-sm">
                    {toEnglishDigits(districtOfficials.length)}
                  </strong>
                </span>

                {(isManageUnlocked || isLettersUnlocked || isSuperAdmin) && (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold px-2.5 py-1.5 rounded-md cursor-pointer transition-colors"
                  >
                    लॉगआउट
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => loadData(true)}
                  disabled={isRefreshing}
                  className="bg-[#193568] hover:bg-[#11254a] disabled:opacity-60 text-white px-2.5 py-1.5 rounded-md flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors"
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
              className={`px-3 sm:px-4 py-3 text-xs sm:text-[13px] font-semibold border-b-2 whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeSubTab === 'directory'
                  ? 'border-[#193568] text-[#193568] bg-white'
                  : 'border-transparent text-slate-600 hover:text-[#193568]'
              }`}
            >
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>पदाधिकारी सूची</span>
            </button>

            <button
              type="button"
              onClick={handleTabClickManage}
              className={`px-3 sm:px-4 py-3 text-xs sm:text-[13px] font-semibold border-b-2 whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeSubTab === 'manage'
                  ? 'border-[#193568] text-[#193568] bg-white'
                  : 'border-transparent text-slate-600 hover:text-[#193568]'
              }`}
            >
              <Building className="w-3.5 h-3.5 shrink-0" />
              <span>जिल्हाध्यक्ष</span>
              {!isManageUnlocked && !isSuperAdmin && (
                <Lock className="w-3 h-3 text-slate-400 shrink-0" />
              )}
            </button>

            <button
              type="button"
              onClick={handleTabClickLetters}
              className={`px-3 sm:px-4 py-3 text-xs sm:text-[13px] font-semibold border-b-2 whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeSubTab === 'letters'
                  ? 'border-[#193568] text-[#193568] bg-white'
                  : 'border-transparent text-slate-600 hover:text-[#193568]'
              }`}
            >
              <Award className="w-3.5 h-3.5 shrink-0" />
              <span>राज्याध्यक्ष</span>
              {!isLettersUnlocked && !isSuperAdmin && (
                <Lock className="w-3 h-3 text-slate-400 shrink-0" />
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
                <h2 className="font-serifDevanagari text-base sm:text-lg font-bold text-white leading-snug">
                  जिल्हा कार्यकारणी सूची: {currentDistrict}
                </h2>
              </div>
              <div className="text-xs text-slate-100 font-medium tabular-nums">
                एकूण पदाधिकारी:{' '}
                <strong className="text-[#efb24b] font-mono text-sm font-bold">
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
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-xs sm:text-sm focus:outline-none focus:border-[#193568] bg-white"
                />
              </div>
            </div>

            {/* Public List (Mobile Clean Rows + Desktop Registry Table) */}
            {isLoading ? (
              <div className="p-12 text-center text-slate-500 bg-white">
                <RefreshCw className="w-7 h-7 mx-auto animate-spin text-[#193568] mb-3" />
                <p className="text-sm font-semibold">पदाधिकारी यादी लोड होत आहे...</p>
              </div>
            ) : searchedOfficials.length === 0 ? (
              <div className="p-12 text-center text-slate-500 bg-white">
                <Users className="w-9 h-9 mx-auto text-slate-300 mb-2" />
                <h4 className="font-semibold text-sm text-slate-700">
                  या जिल्ह्यात अजून एकही पदाधिकारी नोंदवलेला नाही.
                </h4>
              </div>
            ) : (
              <div>
                {/* Mobile Clean List View */}
                <div className="divide-y divide-slate-200 sm:hidden bg-white">
                  {searchedOfficials.map((m, idx) => {
                    const displayPost = formatAppointedPostWithTaluka(m.appointedPost, m.taluka);
                    const cadre = m.currentCadre || 'केंद्रप्रमुख';
                    const details = m.workingPlace || '';

                    return (
                      <div key={m.id} className="p-3.5 flex flex-col gap-1.5">
                        <div className="flex items-start gap-2.5">
                          <span className="text-xs font-mono font-bold text-slate-500 w-5 shrink-0 pt-0.5 tabular-nums">
                            {idx + 1}.
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-[#193568] leading-snug">
                              {m.salutation} {m.firstName} {m.middleName ? m.middleName + ' ' : ''}{m.lastName}
                            </div>
                            <div className="mt-1">
                              <span className="inline-block bg-amber-50/70 text-[#9a460b] border border-amber-200 px-2 py-0.5 rounded text-xs font-semibold">
                                {displayPost}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-xs text-slate-600 leading-relaxed pl-7">
                          <span className="text-slate-800 font-semibold">सध्याचे पद:</span> {cadre}
                          {details && <span className="text-slate-500"> · {details}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Registry Table View */}
                <div className="hidden sm:block overflow-x-auto bg-white">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-[#193568] font-bold border-b border-slate-300">
                      <tr>
                        <th className="py-2.5 px-4 w-16 text-center border-r border-slate-200">अनु. क्र.</th>
                        <th className="py-2.5 px-4 text-xs sm:text-sm border-r border-slate-200">पदाधिकाऱ्याचे नाव व बहाल केलेले पद</th>
                        <th className="py-2.5 px-4 text-xs sm:text-sm">सध्याचे पद व कार्यक्षेत्र</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {searchedOfficials.map((m, idx) => {
                        const displayPost = formatAppointedPostWithTaluka(m.appointedPost, m.taluka);
                        const cadre = m.currentCadre || 'केंद्रप्रमुख';
                        const details = m.workingPlace || '';

                        return (
                          <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4 text-center font-semibold text-slate-600 font-mono tabular-nums border-r border-slate-200">
                              {idx + 1}
                            </td>
                            <td className="py-3 px-4 border-r border-slate-200">
                              <div className="flex flex-col items-start gap-1">
                                <span className="font-bold text-[#193568] text-sm leading-snug">
                                  {m.salutation} {m.firstName} {m.middleName ? m.middleName + ' ' : ''}{m.lastName}
                                </span>
                                <span className="inline-block bg-amber-50/70 text-[#9a460b] border border-amber-200 px-2 py-0.5 rounded text-xs font-semibold">
                                  {displayPost}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-600">
                              <strong className="text-slate-800 block text-xs font-semibold">{cadre}</strong>
                              <span className="text-xs text-slate-500">{details}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
                <h2 className="font-serifDevanagari font-bold text-base sm:text-lg text-white">
                  जिल्हाध्यक्ष कार्यकारिणी व्यवस्थापन: {currentDistrict}
                </h2>
                <p className="text-slate-200 text-xs mt-0.5">
                  {isSuperAdmin
                    ? 'राज्याध्यक्ष अधिकार — सर्व ३४ जिल्हे संपादन योग्य'
                    : `फक्त '${currentDistrict}' जिल्हा संपादन अधिकार`}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenAddModal}
                  className="bg-[#df6b16] hover:bg-[#c2590d] text-white text-xs font-semibold px-3.5 py-2 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  नवीन पदाधिकारी जोडा
                </button>

                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(true)}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/25 text-xs font-semibold px-3 py-2 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  पासवर्ड बदला
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold px-3 py-2 rounded-md cursor-pointer transition-colors"
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
                  <div className="p-8 text-center text-slate-500 text-xs">
                    या जिल्ह्यात एकही पदाधिकारी नाही. 'नवीन पदाधिकारी जोडा' बटनावर क्लिक करा.
                  </div>
                ) : (
                  districtOfficials.map((m, idx) => {
                    const displayPost = formatAppointedPostWithTaluka(m.appointedPost, m.taluka);
                    const cadre = m.currentCadre || 'केंद्रप्रमुख';
                    const details = m.workingPlace || '';

                    return (
                      <div key={m.id} className="p-3.5 flex flex-col gap-2">
                        <div className="flex items-start gap-2.5">
                          <span className="text-xs font-mono font-bold text-slate-500 w-5 shrink-0 pt-0.5 tabular-nums">
                            {idx + 1}.
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-[#193568] leading-snug">
                              {m.salutation} {m.firstName} {m.middleName ? m.middleName + ' ' : ''}{m.lastName}
                            </div>
                            <div className="mt-1">
                              <span className="inline-block bg-amber-50/70 text-[#9a460b] border border-amber-200 px-2 py-0.5 rounded text-xs font-semibold">
                                {displayPost}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-xs text-slate-600 leading-relaxed pl-7 space-y-0.5">
                          <div><strong className="text-slate-800">सध्याचे पद:</strong> {cadre}{details ? ` (${details})` : ''}</div>
                          <div><strong className="text-slate-800">मोबाईल:</strong> <span className="font-mono tabular-nums">{m.mobile}</span></div>
                        </div>

                        <div className="pl-7 pt-1.5 flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(m)}
                            className="flex-1 bg-white hover:bg-slate-50 text-[#193568] border border-slate-300 text-xs font-semibold py-1.5 px-2.5 rounded-md flex items-center justify-center gap-1 cursor-pointer transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> दुरुस्त करा
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMember(m)}
                            className="flex-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 text-xs font-semibold py-1.5 px-2.5 rounded-md flex items-center justify-center gap-1 cursor-pointer transition-colors"
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
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-[#193568] font-bold border-b border-slate-300">
                    <tr>
                      <th className="py-2.5 px-4 w-16 text-center border-r border-slate-200">अनु. क्र.</th>
                      <th className="py-2.5 px-4 text-xs sm:text-sm border-r border-slate-200">पदाधिकाऱ्याचे नाव व बहाल केलेले पद</th>
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
                                <span className="font-bold text-[#193568] text-sm leading-snug">
                                  {m.salutation} {m.firstName} {m.middleName ? m.middleName + ' ' : ''}{m.lastName}
                                </span>
                                <span className="inline-block bg-amber-50/70 text-[#9a460b] border border-amber-200 px-2 py-0.5 rounded text-xs font-semibold">
                                  {displayPost}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-600 border-r border-slate-200">
                              <strong className="text-slate-800 block text-xs font-semibold">{m.currentCadre}</strong>
                              <span className="text-xs text-slate-500">{m.workingPlace}</span>
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-700 font-mono tabular-nums border-r border-slate-200">
                              {m.mobile}
                            </td>
                            <td className="py-3 px-4 text-center space-x-1.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(m)}
                                className="bg-white hover:bg-slate-100 text-[#193568] border border-slate-300 font-semibold px-2.5 py-1.5 rounded text-xs inline-flex items-center gap-1 cursor-pointer transition-colors"
                                title="दुरुस्त करा"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>दुरुस्त</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteMember(m)}
                                className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-semibold px-2.5 py-1.5 rounded text-xs inline-flex items-center gap-1 cursor-pointer transition-colors"
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
                  <h2 className="font-serifDevanagari text-base sm:text-lg font-bold text-white">
                    अधिकृत नियुक्ती पत्र वितरण व प्रेषण
                  </h2>
                  <p className="text-xs text-slate-200 mt-0.5 tabular-nums">
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
                  className="self-start sm:self-auto bg-white/10 hover:bg-white/20 text-white border border-white/25 text-xs font-semibold px-3 py-1.5 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors"
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
                  onClick={() => setShowStatusMatrixModal(true)}
                  className="bg-[#193568] hover:bg-[#11254a] text-white text-xs font-semibold px-3.5 py-2 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="महाराष्ट्रातील सर्व 34 जिल्ह्यांचा संघटनात्मक सद्यस्थिती तक्ता पहा व डाऊनलोड करा"
                >
                  <Eye className="w-3.5 h-3.5 text-[#efb24b]" />
                  संघटना सद्यस्थिती (34 जिल्हे)
                </button>

                <button
                  type="button"
                  onClick={handleDownloadDistrictExecutivePdf}
                  disabled={isGeneratingDirPdf || districtOfficials.length === 0}
                  className="bg-[#df6b16] hover:bg-[#c2590d] text-white text-xs font-semibold px-3.5 py-2 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                  title="या जिल्ह्याची लेटरपॅडवरील स्वाक्षरीयुक्त अधिकृत कार्यकारिणी PDF"
                >
                  <FileText className={`w-3.5 h-3.5 ${isGeneratingDirPdf ? 'animate-spin' : ''}`} />
                  जिल्हा कार्यकारिणी यादी
                </button>

                <button
                  type="button"
                  onClick={handleDownloadDistrictPresidentsPdf}
                  disabled={isGeneratingRegistryPdf}
                  className="bg-white hover:bg-slate-100 text-[#193568] border border-slate-300 text-xs font-semibold px-3 py-2 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                  title="महाराष्ट्रातील सर्व 34 जिल्हाध्यक्षांची अधिकृत यादी"
                >
                  <Download className="w-3.5 h-3.5" />
                  सर्व जिल्हाध्यक्ष यादी
                </button>

                <button
                  type="button"
                  onClick={handleDownloadTalukaPresidentsPdf}
                  disabled={isGeneratingRegistryPdf}
                  className="bg-white hover:bg-slate-100 text-[#193568] border border-slate-300 text-xs font-semibold px-3 py-2 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                  title="महाराष्ट्रातील सर्व तालुकाध्यक्षांची अधिकृत यादी"
                >
                  <Download className="w-3.5 h-3.5" />
                  सर्व तालुका अध्यक्ष यादी
                </button>

                <button
                  type="button"
                  onClick={handleDownloadRegisteredMembersPdf}
                  disabled={isGeneratingRegistryPdf}
                  className="bg-white hover:bg-slate-100 text-[#193568] border border-slate-300 text-xs font-semibold px-3 py-2 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                  title="वेबसाईटवर मंजूर झालेले सर्व अधिकृत सदस्य"
                >
                  <Download className="w-3.5 h-3.5" />
                  नोंदणीकृत सदस्य यादी
                </button>

                <button
                  type="button"
                  onClick={handleDownloadStatewideRegistryPdf}
                  disabled={isGeneratingRegistryPdf || officials.length === 0}
                  className="bg-white hover:bg-slate-100 text-[#193568] border border-slate-300 text-xs font-semibold px-3 py-2 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                  title="राज्यस्तरीय 1 ते शेवटपर्यंत नोंदवही PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                  नियुक्ती क्रमांकानुसार माहिती
                </button>
              </div>

              {/* PDF Render Progress Notice */}
              {(isGeneratingDirPdf || isGeneratingRegistryPdf) && (
                <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs font-semibold flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#df6b16] shrink-0" />
                  <span>{pdfProgressStatus || 'कृपया वाट पहा, PDF तयार होत आहे...'}</span>
                </div>
              )}

              {/* Members List with प्रमाणपत्र पहा & WhatsApp */}
              <div>
                {/* Mobile Clean Rows */}
                <div className="divide-y divide-slate-200 sm:hidden bg-white">
                  {districtOfficials.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      माहिती उपलब्ध नाही.
                    </div>
                  ) : (
                    districtOfficials.map((m, idx) => {
                      const displayPost = formatAppointedPostWithTaluka(m.appointedPost, m.taluka);

                      return (
                        <div key={m.id} className="p-3.5 flex flex-col gap-2">
                          <div className="flex items-start gap-2.5">
                            <span className="text-xs font-mono font-bold text-slate-500 w-5 shrink-0 pt-0.5 tabular-nums">
                              {idx + 1}.
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-bold text-[#193568] leading-snug">
                                {m.salutation} {m.firstName} {m.middleName ? m.middleName + ' ' : ''}{m.lastName}
                              </div>
                              <div className="mt-1">
                                <span className="inline-block bg-amber-50/70 text-[#9a460b] border border-amber-200 px-2 py-0.5 rounded text-xs font-semibold">
                                  {displayPost}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="pl-7 pt-1 flex flex-col gap-1.5">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedOfficialForLetter(m)}
                                className="flex-1 bg-[#193568] hover:bg-[#11254a] text-white text-xs font-semibold py-2 px-3 rounded-md flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                प्रमाणपत्र पहा
                              </button>
                              <button
                                type="button"
                                onClick={() => handleShareOnWhatsApp(m)}
                                className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold py-2 px-3 rounded-md flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                                WhatsApp
                              </button>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(m)}
                                className="flex-1 bg-white hover:bg-slate-50 text-[#193568] border border-slate-300 text-xs font-semibold py-1.5 px-2.5 rounded-md flex items-center justify-center gap-1 cursor-pointer transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" /> दुरुस्त करा
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteMember(m)}
                                className="flex-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 text-xs font-semibold py-1.5 px-2.5 rounded-md flex items-center justify-center gap-1 cursor-pointer transition-colors"
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
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-[#193568] font-bold border-b border-slate-300">
                      <tr>
                        <th className="py-2.5 px-4 w-16 text-center border-r border-slate-200">अनु. क्र.</th>
                        <th className="py-2.5 px-4 text-xs sm:text-sm border-r border-slate-200">पदाधिकाऱ्याचे नाव</th>
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
                          <td className="py-3 px-4 font-bold text-[#193568] text-sm border-r border-slate-200">
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
                              className="bg-[#193568] hover:bg-[#11254a] text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1 cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              प्रमाणपत्र पहा
                            </button>
                          </td>
                          <td className="py-3 px-4 text-center border-r border-slate-200">
                            <button
                              type="button"
                              onClick={() => handleShareOnWhatsApp(m)}
                              className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1 cursor-pointer"
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
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-md border border-slate-300 shadow-2xl max-w-sm w-full text-xs overflow-hidden">
            <div className="bg-[#193568] text-white px-5 py-3.5 flex items-center justify-between border-b-2 border-[#efb24b]">
              <div className="flex items-center gap-2">
                {!isSettingInitialPassword ? (
                  <Lock className="w-4 h-4 text-[#efb24b] shrink-0" />
                ) : (
                  <KeyRound className="w-4 h-4 text-[#efb24b] shrink-0" />
                )}
                <h3 className="font-serifDevanagari text-base font-bold">
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
                  <p className="text-xs text-slate-600 mb-3.5">
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
                  <p className="text-xs text-slate-600 mb-3.5">
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
      )}

      {/* ========================================================================= */}
      {/* IN-PAGE MODAL 2: STATE PRESIDENT MASTER LOGIN (राज्याध्यक्ष लॉगिन) */}
      {/* ========================================================================= */}
      {showPresidentLoginModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-md border border-slate-300 shadow-2xl max-w-sm w-full text-xs overflow-hidden">
            <div className="bg-[#193568] text-white px-5 py-3.5 flex items-center justify-between border-b-2 border-[#efb24b]">
              <div className="flex items-center gap-2">
                {!isSettingPresidentInitialPassword ? (
                  <Award className="w-4 h-4 text-[#efb24b] shrink-0" />
                ) : (
                  <KeyRound className="w-4 h-4 text-[#efb24b] shrink-0" />
                )}
                <h3 className="font-serifDevanagari text-base font-bold">
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
                  <p className="text-xs text-slate-600 mb-3.5">
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
                  <p className="text-xs text-slate-600 mb-3.5 leading-relaxed">
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
      )}

      {/* ========================================================================= */}
      {/* MODAL: CHANGE PRESIDENT PASSWORD (राज्याध्यक्ष पासवर्ड बदला) */}
      {/* ========================================================================= */}
      {showChangePresidentPasswordModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-md border border-slate-300 shadow-2xl max-w-sm w-full text-xs overflow-hidden">
            <div className="bg-[#193568] text-white px-5 py-3.5 flex items-center justify-between border-b-2 border-[#efb24b]">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#efb24b] shrink-0" />
                <h3 className="font-serifDevanagari text-base font-bold">
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
              <p className="text-xs text-slate-600 mb-3.5">
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
      )}

      {/* ========================================================================= */}
      {/* MODAL: A4 APPOINTMENT LETTER PREVIEW & HIGH-QUALITY PDF */}
      {/* ========================================================================= */}
      {selectedOfficialForLetter && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/75 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-md border border-slate-300 shadow-2xl max-w-4xl w-full max-h-[96vh] flex flex-col overflow-hidden">
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
                    ({selectedOfficialForLetter.currentCadre}
                    {selectedOfficialForLetter.workingPlace ? `, ${selectedOfficialForLetter.workingPlace}` : ''},
                    जिल्हा - {selectedOfficialForLetter.district})
                  </p>
                </div>

                {/* Subject */}
                <div className="font-bold text-xs sm:text-sm text-slate-900 mb-3">
                  विषय: महासंघाच्या जिल्हा कार्यकारिणीवर नियुक्तीबाबत...
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
                    <strong className="text-slate-950 text-base">{selectedOfficialForLetter.district}</strong>{' '}
                    जिल्हा कार्यकारिणीवर
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
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT OFFICIAL */}
      {/* ========================================================================= */}
      {isMemberModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-md border border-slate-300 shadow-2xl max-w-lg w-full text-xs max-h-[92vh] flex flex-col overflow-hidden">
            <div className="bg-[#193568] text-white px-5 py-3.5 flex items-center justify-between border-b-2 border-[#efb24b] shrink-0">
              <h3 className="font-serifDevanagari text-base sm:text-lg font-bold">
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

            <form onSubmit={handleSaveMember} className="p-5 space-y-3.5 overflow-y-auto">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-300 text-rose-700 rounded-md text-xs font-semibold flex items-center gap-2">
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
                  value={formCadre}
                  onChange={(e) => setFormCadre(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-md bg-white font-medium focus:outline-none focus:border-[#193568]"
                >
                  <option value="केंद्रप्रमुख">केंद्रप्रमुख</option>
                  <option value="शिक्षण विस्तार अधिकारी">शिक्षण विस्तार अधिकारी</option>
                  <option value="गटशिक्षणाधिकारी">गटशिक्षणाधिकारी</option>
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
                  <label className="font-semibold text-slate-700 block mb-1">बहाल करण्यात येणारे पद *</label>
                  <select
                    value={formPost}
                    onChange={(e) => {
                      setFormPost(e.target.value);
                      if (!isTalukaLevelPost(e.target.value)) {
                        setFormTaluka('');
                      }
                    }}
                    className="w-full p-2 border border-slate-300 rounded-md bg-white font-semibold focus:outline-none focus:border-[#193568]"
                  >
                    {postsList.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name} {p.isTaluka ? '(तालुका स्तर)' : '(जिल्हा स्तर)'}
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
      )}

      {/* ========================================================================= */}
      {/* MODAL: CHANGE DISTRICT PASSWORD */}
      {/* ========================================================================= */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-md border border-slate-300 shadow-2xl max-w-sm w-full text-xs overflow-hidden">
            <div className="bg-[#193568] text-white px-5 py-3.5 flex items-center justify-between border-b-2 border-[#efb24b]">
              <h3 className="font-serifDevanagari text-base font-bold">
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
      )}

      {/* ========================================================================= */}
      {/* IN-PAGE CONFIRMATION MODAL: DELETE OFFICIAL */}
      {/* ========================================================================= */}
      {memberToDelete && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-md border border-slate-300 shadow-2xl max-w-sm w-full text-xs overflow-hidden">
            <div className="bg-[#193568] text-white px-5 py-3 flex items-center gap-2 border-b-2 border-[#efb24b]">
              <Trash2 className="w-4 h-4 text-rose-300 shrink-0" />
              <h3 className="font-serifDevanagari text-base font-bold">
                पदाधिकारी वगळा?
              </h3>
            </div>
            <div className="p-5">
              <p className="text-xs text-slate-700 mb-4 leading-relaxed">
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
      )}

      {/* ========================================================================= */}
      {/* MODAL: संघटना सद्यस्थिती (34 जिल्हे मॅट्रिक्स तक्ता & A4 B&W PDF) */}
      {/* ========================================================================= */}
      {showStatusMatrixModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-md border border-slate-300 shadow-2xl max-w-4xl w-full text-xs relative max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="bg-[#193568] text-white px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[#efb24b] shrink-0">
              <div>
                <div className="text-[11px] font-semibold text-slate-200">
                  महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ
                </div>
                <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-white">
                  संघटना सद्यस्थिती अहवाल (३४ जिल्हे)
                </h3>
                <p className="text-slate-200 text-[11px] mt-0.5">
                  सर्व ३४ जिल्ह्यांतील राज्य, विभागीय, जिल्हा, तालुका पदाधिकारी व नोंदणीकृत सभासदांची आकडेवारी
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadStatusMatrixPdf}
                  disabled={isGeneratingRegistryPdf}
                  className="bg-[#df6b16] hover:bg-[#c2590d] text-white text-xs font-semibold px-3.5 py-2 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                  title="A4 साईज मध्ये ब्लॅक अँड व्हाईट अधिकृत PDF डाऊनलोड करा"
                >
                  <Download className="w-3.5 h-3.5" />
                  A4 PDF डाऊनलोड
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
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-[#193568] text-[11px] font-bold sticky top-0 z-10 border-b border-slate-300">
                  <tr>
                    <th className="py-2.5 px-3 text-center border-r border-slate-200 w-12">अनु.</th>
                    <th className="py-2.5 px-3 border-r border-slate-200">जिल्ह्याचे नाव</th>
                    <th className="py-2.5 px-3 text-center border-r border-slate-200">राज्य प्रतिनिधी</th>
                    <th className="py-2.5 px-3 text-center border-r border-slate-200">विभागीय प्रतिनिधी</th>
                    <th className="py-2.5 px-3 text-center border-r border-slate-200">जिल्हा पदाधिकारी</th>
                    <th className="py-2.5 px-3 text-center border-r border-slate-200">तालुका पदाधिकारी</th>
                    <th className="py-2.5 px-3 text-center border-r border-slate-200 font-bold text-[#193568]">एकूण पदाधिकारी</th>
                    <th className="py-2.5 px-3 text-center border-r border-slate-200">सदस्य (नोंदणी)</th>
                    <th className="py-2.5 px-3 text-center font-bold text-[#9a460b]">एकूण बेरीज</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {districtMatrixStats.map((st, idx) => (
                    <tr key={st.district} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-center font-semibold text-slate-600 font-mono tabular-nums border-r border-slate-200">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-3 font-semibold text-[#193568] border-r border-slate-200">
                        {st.district}
                      </td>
                      <td className="py-2 px-3 text-center font-medium text-slate-700 font-mono tabular-nums border-r border-slate-200">
                        {toEnglishDigits(st.stateRep)}
                      </td>
                      <td className="py-2 px-3 text-center font-medium text-slate-700 font-mono tabular-nums border-r border-slate-200">
                        {toEnglishDigits(st.divRep)}
                      </td>
                      <td className="py-2 px-3 text-center font-medium text-slate-700 font-mono tabular-nums border-r border-slate-200">
                        {toEnglishDigits(st.distOfficial)}
                      </td>
                      <td className="py-2 px-3 text-center font-medium text-slate-700 font-mono tabular-nums border-r border-slate-200">
                        {toEnglishDigits(st.talukaOfficial)}
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-[#193568] bg-slate-50 font-mono tabular-nums border-r border-slate-200">
                        {toEnglishDigits(st.officialsTotal)}
                      </td>
                      <td className="py-2 px-3 text-center font-semibold text-[#df6b16] font-mono tabular-nums border-r border-slate-200">
                        {toEnglishDigits(st.members)}
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-slate-900 bg-amber-50/60 font-mono tabular-nums">
                        {toEnglishDigits(st.rowTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#193568] text-white font-bold border-t-2 border-slate-400 sticky bottom-0 z-10">
                  <tr>
                    <td colSpan={2} className="py-3 px-3 text-center border-r border-slate-700 text-xs sm:text-sm font-bold">
                      सर्व बेरीज (Grand Total)
                    </td>
                    <td className="py-3 px-3 text-center border-r border-slate-700 text-xs sm:text-sm font-mono tabular-nums text-slate-100">
                      {toEnglishDigits(matrixTotals.stateRep)}
                    </td>
                    <td className="py-3 px-3 text-center border-r border-slate-700 text-xs sm:text-sm font-mono tabular-nums text-slate-100">
                      {toEnglishDigits(matrixTotals.divRep)}
                    </td>
                    <td className="py-3 px-3 text-center border-r border-slate-700 text-xs sm:text-sm font-mono tabular-nums text-slate-100">
                      {toEnglishDigits(matrixTotals.distOfficial)}
                    </td>
                    <td className="py-3 px-3 text-center border-r border-slate-700 text-xs sm:text-sm font-mono tabular-nums text-slate-100">
                      {toEnglishDigits(matrixTotals.talukaOfficial)}
                    </td>
                    <td className="py-3 px-3 text-center border-r border-slate-700 text-xs sm:text-sm font-bold font-mono tabular-nums text-[#efb24b] bg-[#11254a]">
                      {toEnglishDigits(matrixTotals.officialsTotal)}
                    </td>
                    <td className="py-3 px-3 text-center border-r border-slate-700 text-xs sm:text-sm font-bold font-mono tabular-nums text-amber-300">
                      {toEnglishDigits(matrixTotals.members)}
                    </td>
                    <td className="py-3 px-3 text-center text-xs sm:text-sm font-bold font-mono tabular-nums text-white bg-[#0e1f3d]">
                      {toEnglishDigits(matrixTotals.grandTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-[11px] text-slate-600 shrink-0">
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
      )}

      {/* ========================================================================= */}
      {/* IN-PAGE FLOATING TOAST NOTIFICATION */}
      {/* ========================================================================= */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-[100] max-w-sm bg-[#193568] text-white px-4 py-3 rounded-md shadow-xl flex items-center gap-3 border border-slate-700">
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span className="text-xs font-semibold leading-relaxed">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-auto text-slate-300 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Lock, LogOut, Award, Printer, PlusCircle, Search,
  UserCheck, ShieldAlert, KeyRound, CheckCircle2, ArrowLeft, Eye, EyeOff
} from 'lucide-react';
import { MembershipApplication, NewsItem, ORG_DETAILS } from '../data/mahasanghData';
import { formatDateWithEnglishDigits, toEnglishDigits } from '../utils/formatters';
import {
  getAdminCredentials,
  updateAdminCredentials,
  DEFAULT_ADMIN_EMAIL,
  MASTER_RECOVERY_KEY
} from '../firebase';

interface AdminTabProps {
  applications: MembershipApplication[];
  onApproveApplication: (id: string, memberNumber: string) => void;
  onAddNews: (news: NewsItem) => void;
  onFetchApplications?: () => Promise<void>;
  isLoadingApps?: boolean;
  onExitAdmin?: () => void;
}

export const AdminTab: React.FC<AdminTabProps> = ({
  applications,
  onApproveApplication,
  onAddNews,
  onFetchApplications,
  isLoadingApps,
  onExitAdmin,
}) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Password Reset / Create New Password Mode on Login Screen
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMasterKey, setResetMasterKey] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  // Active view inside Admin Dashboard
  const [activeAdminSubTab, setActiveAdminSubTab] = useState<'applications' | 'add_news' | 'password'>('applications');

  // Change Password state inside Dashboard
  const [currentPassInput, setCurrentPassInput] = useState('');
  const [newPassInput, setNewPassInput] = useState('');
  const [confirmPassInput, setConfirmPassInput] = useState('');
  const [changePassStatus, setChangePassStatus] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Filter & Search
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Certificate Modal
  const [certModalApp, setCertModalApp] = useState<MembershipApplication | null>(null);

  // New News form state
  const [newsTitle, setNewsTitle] = useState('');
  const [newsCategory, setNewsCategory] = useState('अधिकृत घोषणा');
  const [newsSummary, setNewsSummary] = useState('');
  const [newsContent, setNewsContent] = useState('');
  const [newsImageUrl, setNewsImageUrl] = useState('');
  const [newsCreatedSuccess, setNewsCreatedSuccess] = useState(false);

  // Load admin credentials on mount
  useEffect(() => {
    getAdminCredentials().catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const inputEmail = email.trim().toLowerCase();
    const inputPass = password.trim();

    if (!inputEmail || !inputPass) {
      setLoginError('कृपया ई-मेल आणि पासवर्ड प्रविष्ट करा.');
      return;
    }

    try {
      const creds = await getAdminCredentials();
      const validEmail = creds.email.toLowerCase();
      const validPass = creds.password;

      // Allow login via configured admin email or default admin email
      const isEmailValid = inputEmail === validEmail || inputEmail === DEFAULT_ADMIN_EMAIL.toLowerCase();

      // Check configured password or master recovery key
      const isPassValid = inputPass === validPass || inputPass === MASTER_RECOVERY_KEY;

      if (!isEmailValid) {
        setLoginError('अवैध ई-मेल. कृपया अधिकृत ॲडमिन ई-मेल वापरा.');
        return;
      }

      if (!isPassValid) {
        setLoginError('चुकीचा पासवर्ड. कृपया पुन्हा प्रयत्न करा.');
        return;
      }

      setIsLoggedIn(true);
      setLoginError('');
      if (onFetchApplications) {
        onFetchApplications();
      }
    } catch (err: any) {
      setLoginError('लॉगिन करताना त्रुटी आली: ' + (err.message || 'Error'));
    }
  };

  // Handle Create / Reset Password from Login Screen
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
      setResetError('नवीन पासवर्ड किमान ४ अक्षरांचा असावा.');
      return;
    }

    if (newPwd !== confirmPwd) {
      setResetError('दोन्ही पासवर्ड एकमेकांशी जुळत नाहीत.');
      return;
    }

    try {
      const creds = await getAdminCredentials();
      const isEmailMatch = targetEmail === creds.email.toLowerCase() || targetEmail === DEFAULT_ADMIN_EMAIL.toLowerCase();

      // Verify master recovery key or existing current password
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

  // Handle Change Password inside Logged-in Dashboard
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
      setChangePassStatus({ text: 'नवीन पासवर्ड किमान ४ अक्षरांचा असावा.', type: 'error' });
      return;
    }

    if (newP !== confP) {
      setChangePassStatus({ text: 'नवीन पासवर्ड आणि पुष्टीकरण पासवर्ड जुळत नाहीत.', type: 'error' });
      return;
    }

    try {
      const creds = await getAdminCredentials();
      if (curr !== creds.password && curr !== MASTER_RECOVERY_KEY) {
        setChangePassStatus({ text: 'सध्याचा चालू पासवर्ड चुकीचा आहे.', type: 'error' });
        return;
      }

      await updateAdminCredentials(newP);
      setChangePassStatus({ text: 'पासवर्ड यशस्वीपणे बदलण्यात आला आहे!', type: 'success' });
      setCurrentPassInput('');
      setNewPassInput('');
      setConfirmPassInput('');
    } catch (err: any) {
      setChangePassStatus({ text: 'पासवर्ड बदलताना त्रुटी: ' + err.message, type: 'error' });
    }
  };

  const handleApprove = (app: MembershipApplication) => {
    const randomHex = Math.random().toString(36).slice(2, 6).toUpperCase();
    const newMemberNumber = `MS-2026-${randomHex}`;
    onApproveApplication(app.id, newMemberNumber);
  };

  const handleCreateNews = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsTitle || !newsSummary || !newsContent) {
      alert('कृपया बातमीचे शीर्षक, सारांश आणि सविस्तर मजकूर भरा.');
      return;
    }

    const todayStr = formatDateWithEnglishDigits(new Date());

    const newPost: NewsItem = {
      id: `post-${Date.now()}`,
      title: toEnglishDigits(newsTitle),
      date: todayStr,
      category: newsCategory,
      summary: toEnglishDigits(newsSummary),
      content: toEnglishDigits(newsContent),
      image: newsImageUrl || undefined,
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

  const filteredApps = applications.filter((app) => {
    const matchesFilter = filterStatus === 'all' || app.status === filterStatus;
    const matchesSearch =
      app.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.applicationNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.phone.includes(searchQuery) ||
      (app.district && app.district.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const totalCount = applications.length;
  const approvedCount = applications.filter((a) => a.status === 'approved').length;
  const pendingCount = applications.filter((a) => a.status === 'pending').length;

  return (
    <div className="bg-[#f6f8fc] py-8 md:py-12 min-h-screen">
      <div className="max-w-[1100px] mx-auto px-4">
        {/* Standalone Admin Top Navigation Bar */}
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

          <div className="flex items-center gap-2">
            {onExitAdmin && (
              <button
                type="button"
                onClick={onExitAdmin}
                className="sm:hidden text-xs text-slate-600 underline font-semibold"
              >
                ← मुख्य वेबसाईट
              </button>
            )}
            {isLoggedIn && (
              <button
                type="button"
                onClick={() => setIsLoggedIn(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold px-4 py-2 rounded flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-600" />
                बाहेर पडा (Logout)
              </button>
            )}
          </div>
        </div>

        {!isLoggedIn ? (
          /* ============================================================== */
          /* Login or Create/Reset Password Card (NO PASSWORD HINTS DISPLAYED) */
          /* ============================================================== */
          <div className="max-w-md mx-auto bg-white p-6 sm:p-8 rounded-xl border border-slate-300 shadow-md">
            {!isResetMode ? (
              /* Regular Admin Login Form */
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
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="पासवर्ड प्रविष्ट करा"
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

                {/* Reset / Create Password link */}
                <div className="mt-5 pt-4 border-t border-slate-200 text-center">
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
                    नवीन पासवर्ड तयार करा / पासवर्ड बदला
                  </button>
                </div>
              </div>
            ) : (
              /* Create / Reset Password Form */
              <div>
                <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center text-amber-700 mb-3 mx-auto border border-amber-200">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h2 className="font-serifDevanagari text-xl font-bold text-center text-[#17366d] mb-1">
                  नवीन पासवर्ड तयार करा
                </h2>
                <p className="text-xs text-center text-slate-500 mb-5">
                  ॲडमिन खात्यासाठी नवीन पासवर्ड सेट करा
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

                <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      नोंदणीकृत ई-मेल
                    </label>
                    <input
                      type="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="padmakarshinde043@gmail.com"
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
                      placeholder="सध्याचा पासवर्ड किंवा सिक्युरिटी की प्रविष्ट करा"
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
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      placeholder="किमान ४ अक्षरी नवीन पासवर्ड"
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      नवीन पासवर्ड पुन्हा टाका (Confirm)
                    </label>
                    <input
                      type="password"
                      required
                      value={resetConfirmPassword}
                      onChange={(e) => setResetConfirmPassword(e.target.value)}
                      placeholder="नवीन पासवर्ड पुन्हा प्रविष्ट करा"
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsResetMode(false)}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-lg text-xs transition-colors"
                    >
                      रद्द करा
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold py-2.5 rounded-lg text-xs transition-colors shadow-xs"
                    >
                      नवीन पासवर्ड सेव्ह करा
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        ) : (
          /* ============================================================== */
          /* Logged In Dashboard with Manage Applications, News & Password */
          /* ============================================================== */
          <div className="space-y-6">
            {/* Stats Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500 block">एकूण अर्ज प्राप्त</span>
                <strong className="text-2xl font-serifDevanagari text-[#17366d]">
                  {toEnglishDigits(totalCount)}
                </strong>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500 block">मंजूर सदस्य (Approved)</span>
                <strong className="text-2xl font-serifDevanagari text-emerald-600">
                  {toEnglishDigits(approvedCount)}
                </strong>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500 block">प्रलंबित अर्ज (Pending)</span>
                <strong className="text-2xl font-serifDevanagari text-amber-600">
                  {toEnglishDigits(pendingCount)}
                </strong>
              </div>
            </div>

            {/* Sub-nav Tabs */}
            <div className="flex flex-wrap border-b border-slate-300 gap-1">
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
                अर्ज व्यवस्थापन ({toEnglishDigits(applications.length)})
              </button>
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
                नवीन बातमी / परिपत्रक जोडा
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
                पासवर्ड व्यवस्थापन (Change Password)
              </button>
            </div>

            {/* Sub-tab 1: Applications Management */}
            {activeAdminSubTab === 'applications' && (
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
                {/* Search & Filter Header */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {(['all', 'pending', 'approved'] as const).map((st) => (
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

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#f8fafc] text-slate-700 uppercase font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">अर्ज क्र. / तारीख</th>
                        <th className="py-3 px-4">अर्जदाराचे नाव</th>
                        <th className="py-3 px-4">पद व जिल्हा</th>
                        <th className="py-3 px-4">मोबाईल</th>
                        <th className="py-3 px-4">पेमेंट संदर्भ</th>
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
                          <tr key={app.id} className="hover:bg-slate-50/80">
                            <td className="py-3 px-4 font-mono font-bold text-[#17366d]">
                              {app.applicationNumber}
                              <span className="block font-sans font-normal text-[11px] text-slate-500">
                                {formatDateWithEnglishDigits(app.createdAt)}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900">
                              {app.fullName}
                            </td>
                            <td className="py-3 px-4 text-slate-700">
                              {app.professional || 'केंद्रप्रमुख / अधिकारी'}
                              <span className="block text-[11px] text-slate-500 font-semibold">
                                {app.district} {app.address ? `(${app.address})` : ''}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono">
                              {app.phone}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-600">
                              {app.paymentRef ? (
                                <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                                  {app.paymentRef}
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {app.status === 'approved' ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full text-[11px] font-bold">
                                  <Award className="w-3 h-3 text-emerald-600" />
                                  मंजूर
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
                                  onClick={() => handleApprove(app)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded transition-colors shadow-xs"
                                >
                                  मंजूर करा
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setCertModalApp(app)}
                                  className="bg-[#17366d] hover:bg-[#0f244c] text-white font-bold px-3 py-1.5 rounded flex items-center gap-1 mx-auto transition-colors shadow-xs"
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

            {/* Sub-tab 2: Add News / Circular */}
            {activeAdminSubTab === 'add_news' && (
              <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-xs max-w-2xl">
                <h3 className="font-serifDevanagari text-lg font-bold text-[#17366d] mb-4 pb-2 border-b border-slate-100">
                  नवीन बातमी किंवा अधिकृत परिपत्रक प्रसिद्ध करा
                </h3>

                {newsCreatedSuccess && (
                  <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>बातमी यशस्वीपणे वेबसाईटवर प्रसिद्ध करण्यात आली आहे!</span>
                  </div>
                )}

                <form onSubmit={handleCreateNews} className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      बातमी / परिपत्रकाचे शीर्षक
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="उदा. केंद्रप्रमुख पदोन्नती बाबत राज्यस्तरीय बैठक संपन्न..."
                      value={newsTitle}
                      onChange={(e) => setNewsTitle(e.target.value)}
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        श्रेणी (Category)
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
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        फोटो लिंक (Image URL - पर्यायी)
                      </label>
                      <input
                        type="url"
                        placeholder="https://example.com/photo.jpg"
                        value={newsImageUrl}
                        onChange={(e) => setNewsImageUrl(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      थोडक्यात सारांश (Summary)
                    </label>
                    <textarea
                      required
                      rows={2}
                      placeholder="बातमीचा २-३ ओळींत महत्त्वाचा सारांश..."
                      value={newsSummary}
                      onChange={(e) => setNewsSummary(e.target.value)}
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      सविस्तर मजकूर (Full Details)
                    </label>
                    <textarea
                      required
                      rows={5}
                      placeholder="बातमीची संपूर्ण माहिती किंवा परिपत्रकाचा संपूर्ण तपशील..."
                      value={newsContent}
                      onChange={(e) => setNewsContent(e.target.value)}
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <button
                    type="submit"
                    className="bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold py-2.5 px-6 rounded-lg text-sm transition-colors shadow-xs"
                  >
                    प्रसिद्ध करा (Publish News)
                  </button>
                </form>
              </div>
            )}

            {/* Sub-tab 3: Change Password Management */}
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
                      placeholder="किमान ४ अक्षरी नवीन पासवर्ड"
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
          </div>
        )}
      </div>

      {/* Member Certificate Print Modal */}
      {certModalApp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 md:p-8 shadow-2xl relative border-4 border-[#d4af37]">
            <div className="border-2 border-slate-800 p-6 rounded-xl text-center space-y-4 bg-gradient-to-b from-amber-50/40 via-white to-amber-50/20">
              <div className="flex items-center justify-center gap-2">
                <img
                  src="/heding.jpg"
                  alt="महासंघ चिन्ह"
                  className="w-16 h-16 object-cover object-left rounded-full border-2 border-[#d4af37]"
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

              <div className="py-2">
                <span className="inline-block bg-[#09243f] text-white px-6 py-1.5 rounded-full text-xs font-bold tracking-wider">
                  ॥ आजीवन सदस्यत्व सन्मानपत्र ॥
                </span>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-slate-600">प्रमाणित करण्यात येते की,</p>
                <h3 className="font-serifDevanagari text-xl md:text-2xl font-bold text-[#851216]">
                  {certModalApp.fullName}
                </h3>
                <p className="text-xs font-semibold text-slate-700">
                  {certModalApp.professional || 'केंद्रप्रमुख / अधिकारी'}
                </p>
                <p className="text-xs text-slate-600">
                  (जिल्हा: {certModalApp.district})
                </p>
                <p className="text-sm text-slate-700 pt-2 max-w-md mx-auto">
                  यांना महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाचे अधिकृत आजीवन सदस्यत्व सन्मानपूर्वक बहाल करण्यात येत आहे.
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl max-w-sm mx-auto text-xs space-y-1">
                <div className="font-bold text-[#09243f]">
                  सदस्य क्रमांक: <span className="text-base text-[#df6b16]">{certModalApp.memberNumber}</span>
                </div>
                <div className="text-slate-600 text-[11px]">
                  नोंदणी दिनांक: {formatDateWithEnglishDigits(certModalApp.createdAt)}
                </div>
              </div>

              {/* Signature Row */}
              <div className="pt-8 flex justify-between items-end border-t border-slate-200 px-6 text-xs text-slate-700">
                <div className="text-center">
                  <div className="font-bold text-sm text-[#09243f]">
                    {ORG_DETAILS.founderPresident.name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    संस्थापक राज्याध्यक्ष
                  </div>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full border border-dashed border-[#df6b16] flex items-center justify-center text-[10px] text-[#df6b16] font-bold mx-auto">
                    महासंघ शिक्का
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-sm text-[#09243f]">
                    श्री. विजय सावंत
                  </div>
                  <div className="text-[11px] text-slate-500">
                    राज्य सरचिटणीस
                  </div>
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="pt-6 flex justify-center gap-4 no-print">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="bg-[#17366d] hover:bg-[#0f244c] text-white text-xs font-bold px-5 py-2.5 rounded-lg flex items-center gap-1.5 shadow"
                >
                  <Printer className="w-4 h-4" />
                  प्रमाणपत्र प्रिंट करा
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

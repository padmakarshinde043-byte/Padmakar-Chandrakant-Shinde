import React, { useState } from 'react';
import { Lock, LogOut, CheckCircle2, Award, Printer, PlusCircle, Search, UserCheck, ShieldAlert } from 'lucide-react';
import { MembershipApplication, NewsItem, ORG_DETAILS } from '../data/mahasanghData';

interface AdminTabProps {
  applications: MembershipApplication[];
  onApproveApplication: (id: string, memberNumber: string) => void;
  onAddNews: (news: NewsItem) => void;
}

export const AdminTab: React.FC<AdminTabProps> = ({
  applications,
  onApproveApplication,
  onAddNews,
}) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('padmakarshinde043@gmail.com');
  const [password, setPassword] = useState('1234');
  const [loginError, setLoginError] = useState('');

  // Active view inside Admin
  const [activeAdminSubTab, setActiveAdminSubTab] = useState<'applications' | 'add_news'>('applications');

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

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim().toLowerCase() !== 'padmakarshinde043@gmail.com') {
      setLoginError('फक्त अधिकृत admin ई-मेल वापरा (padmakarshinde043@gmail.com).');
      return;
    }
    if (!password) {
      setLoginError('कृपया password टाका.');
      return;
    }
    setIsLoggedIn(true);
    setLoginError('');
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

    const todayStr = new Date().toLocaleDateString('mr-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    const newPost: NewsItem = {
      id: `post-${Date.now()}`,
      title: newsTitle,
      date: todayStr,
      category: newsCategory,
      summary: newsSummary,
      content: newsContent,
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
    <div className="bg-[#f6f8fc] py-10 md:py-16 min-h-[600px]">
      <div className="max-w-[1100px] mx-auto px-4">
        {/* Header */}
        <div className="border-b border-slate-300 pb-5 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest font-bold text-[#df6b16] mb-1">
              प्रशासन कक्ष
            </p>
            <h1 className="font-serifDevanagari text-2xl sm:text-3xl font-bold text-[#17366d]">
              सदस्यत्व व वेबसाईट प्रशासन (Admin Dashboard)
            </h1>
          </div>
          {isLoggedIn && (
            <button
              onClick={() => setIsLoggedIn(false)}
              className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold px-4 py-2 rounded flex items-center gap-1.5 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              बाहेर पडा (Logout)
            </button>
          )}
        </div>

        {!isLoggedIn ? (
          /* Login Card */
          <div className="max-w-md mx-auto bg-white p-6 sm:p-8 rounded-xl border border-slate-300 shadow-md">
            <div className="w-12 h-12 bg-[#fff0df] rounded-full flex items-center justify-center text-[#df6b16] mb-4 mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="font-serifDevanagari text-xl font-bold text-center text-[#17366d] mb-1">
              Admin Login
            </h2>
            <p className="text-xs text-center text-slate-500 mb-6">
              अधिकृत ई-मेल: <strong>padmakarshinde043@gmail.com</strong>
            </p>

            {loginError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded flex items-center gap-2">
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
                  className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password प्रविष्ट करा"
                  className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  (डिफॉल्ट पासवर्ड: 1234)
                </span>
              </div>

              <button
                type="submit"
                className="w-full bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold py-2.5 rounded-lg text-sm transition-colors shadow-sm"
              >
                Login करा
              </button>
            </form>
          </div>
        ) : (
          /* Logged In Dashboard */
          <div className="space-y-6">
            {/* Stats Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500 block">एकूण अर्ज प्राप्त</span>
                <strong className="text-2xl font-serifDevanagari text-[#17366d]">
                  {totalCount}
                </strong>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500 block">मंजूर सदस्य (Approved)</span>
                <strong className="text-2xl font-serifDevanagari text-emerald-600">
                  {approvedCount}
                </strong>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500 block">प्रलंबित अर्ज (Pending)</span>
                <strong className="text-2xl font-serifDevanagari text-amber-600">
                  {pendingCount}
                </strong>
              </div>
            </div>

            {/* Sub-nav Tabs */}
            <div className="flex border-b border-slate-300">
              <button
                onClick={() => setActiveAdminSubTab('applications')}
                className={`py-3 px-6 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                  activeAdminSubTab === 'applications'
                    ? 'border-[#df6b16] text-[#df6b16] bg-white rounded-t-lg'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserCheck className="w-4 h-4" />
                अर्ज व्यवस्थापन ({applications.length})
              </button>
              <button
                onClick={() => setActiveAdminSubTab('add_news')}
                className={`py-3 px-6 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                  activeAdminSubTab === 'add_news'
                    ? 'border-[#df6b16] text-[#df6b16] bg-white rounded-t-lg'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <PlusCircle className="w-4 h-4" />
                नवीन बातमी / परिपत्रक जोडा
              </button>
            </div>

            {/* Sub-tab 1: Applications Management */}
            {activeAdminSubTab === 'applications' && (
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
                {/* Search & Filter Header */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div className="flex gap-2 text-xs">
                    {(['all', 'pending', 'approved'] as const).map((st) => (
                      <button
                        key={st}
                        onClick={() => setFilterStatus(st)}
                        className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                          filterStatus === st
                            ? 'bg-[#17366d] text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {st === 'all' && `सर्व (${totalCount})`}
                        {st === 'pending' && `प्रलंबित (${pendingCount})`}
                        {st === 'approved' && `मंजूर (${approvedCount})`}
                      </button>
                    ))}
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="नाव, अर्ज क्र. किंवा फोन शोधा..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full text-xs pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>
                </div>

                {/* Applications List */}
                <div className="space-y-3">
                  {filteredApps.length > 0 ? (
                    filteredApps.map((app) => (
                      <article
                        key={app.id}
                        className="p-4 rounded-lg border border-slate-200 hover:border-slate-300 bg-[#fbfcfd] flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <strong className="text-sm font-serifDevanagari text-[#17366d]">
                              {app.salutation} {app.fullName}
                            </strong>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                app.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {app.status === 'approved' ? 'मंजूर' : 'प्रलंबित'}
                            </span>
                          </div>
                          <div className="text-slate-500 flex flex-wrap gap-3">
                            <span>अर्ज क्र: <strong>{app.applicationNumber}</strong></span>
                            <span>जिल्हा: {app.district}</span>
                            <span>मोबाईल: {app.phone}</span>
                            <span>ई-मेल: {app.email}</span>
                          </div>
                          <div className="text-slate-600">
                            पत्ता: {app.address} · शिक्षण: {app.education} · व्यावसायिक: {app.professional}
                          </div>
                          {app.memberNumber && (
                            <div className="text-[#df6b16] font-bold pt-1">
                              अधिकृत सदस्य क्रमांक: {app.memberNumber}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {app.status === 'pending' && (
                            <button
                              onClick={() => handleApprove(app)}
                              className="bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold px-3 py-1.5 rounded transition-colors"
                            >
                              मंजूर करा (Approve)
                            </button>
                          )}
                          {app.status === 'approved' && (
                            <button
                              onClick={() => setCertModalApp(app)}
                              className="bg-[#17366d] hover:bg-[#0f244c] text-white font-bold px-3 py-1.5 rounded flex items-center gap-1 transition-colors"
                            >
                              <Award className="w-3.5 h-3.5" />
                              प्रमाणपत्र पहा / डाउनलोड
                            </button>
                          )}
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="text-center py-8 text-slate-500 text-xs">
                      कोणताही अर्ज उपलब्ध नाही.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sub-tab 2: Add New News Post */}
            {activeAdminSubTab === 'add_news' && (
              <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-xs">
                <h3 className="font-serifDevanagari text-xl font-bold text-[#17366d] mb-1">
                  नवीन बातमी किंवा अधिकृत परिपत्रक प्रकाशित करा
                </h3>
                <p className="text-xs text-slate-500 mb-6">
                  येथे प्रकाशित केलेली बातमी तात्काळ 'बातम्या' विभागात सर्व सभासदांना दिसेल.
                </p>

                {newsCreatedSuccess && (
                  <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>बातमी यशस्वीपणे प्रकाशित झाली आहे!</span>
                  </div>
                )}

                <form onSubmit={handleCreateNews} className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      बातमीचे शीर्षक <span className="text-[#df6b16]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newsTitle}
                      onChange={(e) => setNewsTitle(e.target.value)}
                      placeholder="उदा. राज्यस्तरीय कार्यकारिणी बैठक संपन्न"
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        वर्गवारी (Category) <span className="text-[#df6b16]">*</span>
                      </label>
                      <select
                        value={newsCategory}
                        onChange={(e) => setNewsCategory(e.target.value)}
                        className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                      >
                        <option value="अधिकृत घोषणा">अधिकृत घोषणा</option>
                        <option value="संघटना घडामोडी">संघटना घडामोडी</option>
                        <option value="शासन निर्णय">शासन निर्णय</option>
                        <option value="शैक्षणिक गुणवत्ता">शैक्षणिक गुणवत्ता</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        फोटो URL (Image Path)
                      </label>
                      <input
                        type="text"
                        value={newsImageUrl}
                        onChange={(e) => setNewsImageUrl(e.target.value)}
                        placeholder="उदा. /images/1793460746726.png किंवा URL"
                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      थोडक्यात सारांश (Summary) <span className="text-[#df6b16]">*</span>
                    </label>
                    <textarea
                      required
                      rows={2}
                      value={newsSummary}
                      onChange={(e) => setNewsSummary(e.target.value)}
                      placeholder="बातमीचा संक्षिप्त परिच्छेद (२ ते ३ ओळी)"
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      सविस्तर बातमी मजकूर (Full Content) <span className="text-[#df6b16]">*</span>
                    </label>
                    <textarea
                      required
                      rows={6}
                      value={newsContent}
                      onChange={(e) => setNewsContent(e.target.value)}
                      placeholder="बातमीचा संपूर्ण तपशील येथे लिहा..."
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <button
                    type="submit"
                    className="bg-[#df6b16] hover:bg-[#c85c0e] text-white font-bold px-6 py-2.5 rounded-lg transition-colors shadow-sm"
                  >
                    बातमी प्रकाशित करा (Publish News)
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Official Membership Certificate Modal */}
      {certModalApp && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-8 shadow-2xl relative my-8 border-8 border-[#17366d]">
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-3">
                <img
                  src="/heding.jpg"
                  alt="महासंघ चिन्ह"
                  className="w-16 h-16 rounded-full border-2 border-[#efb24b]"
                />
              </div>

              <div>
                <strong className="block font-serifDevanagari text-sm text-[#df6b16] font-bold tracking-widest">
                  नोंदणीकृत श्रमिक संघ (क्र. महा/एनएसके/एन/२४२७)
                </strong>
                <h2 className="font-serifDevanagari text-2xl sm:text-3xl font-extrabold text-[#09243f] mt-1">
                  महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ
                </h2>
                <p className="text-xs text-slate-500">
                  {ORG_DETAILS.officeAddress}
                </p>
              </div>

              <div className="w-24 h-1 bg-[#efb24b] mx-auto rounded-full"></div>

              <div className="py-4 space-y-2">
                <span className="text-xs uppercase tracking-widest font-bold text-slate-600 block">
                  अधिकृत आजीवन सदस्यत्व प्रमाणपत्र
                </span>
                <p className="text-sm text-slate-700">
                  प्रमाणित करण्यात येते की,
                </p>
                <h3 className="font-serifDevanagari text-2xl font-bold text-[#17366d]">
                  {certModalApp.salutation} {certModalApp.fullName}
                </h3>
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
                  नोंदणी दिनांक: {new Date(certModalApp.createdAt).toLocaleDateString('mr-IN')}
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
                    श्री. विजय शिंदे
                  </div>
                  <div className="text-[11px] text-slate-500">
                    महासचिव
                  </div>
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="pt-6 flex justify-center gap-4 no-print">
                <button
                  onClick={() => window.print()}
                  className="bg-[#17366d] hover:bg-[#0f244c] text-white text-xs font-bold px-5 py-2.5 rounded-lg flex items-center gap-1.5 shadow"
                >
                  <Printer className="w-4 h-4" />
                  प्रमाणपत्र प्रिंट करा
                </button>
                <button
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

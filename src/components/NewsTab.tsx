import React, { useState, useMemo } from 'react';
import { Calendar, Tag, ArrowRight, X, Search, FileText, RefreshCw, ChevronRight, ShieldCheck, Megaphone, Image as ImageIcon, ExternalLink } from 'lucide-react';
import { NewsItem, GovOrder, INITIAL_GOV_ORDERS, INITIAL_NEWS } from '../data/mahasanghData';
import { toEnglishDigits } from '../utils/formatters';

interface NewsTabProps {
  newsList: NewsItem[];
  govOrders: GovOrder[];
  selectedNews: NewsItem | null;
  setSelectedNews: (news: NewsItem | null) => void;
  onRefreshNews?: () => Promise<void>;
  isRefreshing?: boolean;
}

export const NewsTab: React.FC<NewsTabProps> = ({
  newsList,
  govOrders,
  selectedNews,
  setSelectedNews,
  onRefreshNews,
  isRefreshing,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // पहिला विभाग (Section 1 Filters: सर्व, अधिकृत घोषणा, अधिकृत वृत्त, संघटना वृत्त, अभिनंदन, टॅगलाईन फोटो)
  const section1Categories = ['सर्व', 'अधिकृत घोषणा', 'अधिकृत वृत्त', 'संघटना घडामोडी', 'संघटना वृत्त', 'अभिनंदन', 'टॅगलाईन फोटो'];
  const [sec1Category, setSec1Category] = useState('सर्व');

  // Ensure newsList is never empty by falling back to INITIAL_NEWS
  const safeNewsList = useMemo(() => {
    return newsList && newsList.length > 0 ? newsList : INITIAL_NEWS;
  }, [newsList]);

  // पहिला विभाग: बातम्या, अधिकृत घोषणा व संघटना घडामोडी
  const section1Items = safeNewsList.filter((item) => {
    if (!item) return false;
    if (item.category === 'शासन निर्णय') return false; // belongs to Section 2

    const matchesCat = sec1Category === 'सर्व' || item.category === sec1Category;
    const term = (searchTerm || '').trim().toLowerCase();
    if (!term) return matchesCat;

    const title = (item.title || '').toLowerCase();
    const summary = (item.summary || '').toLowerCase();
    const content = (item.content || '').toLowerCase();
    return matchesCat && (title.includes(term) || summary.includes(term) || content.includes(term));
  });

  // दुसरा विभाग: अधिकृत शासन निर्णय व परिपत्रके (govOrders + newsList चे शासन निर्णय + defaults)
  const combinedGovOrders = useMemo(() => {
    const list: GovOrder[] = [...(govOrders && govOrders.length > 0 ? govOrders : INITIAL_GOV_ORDERS)];
    const existingTitles = new Set(list.map((g) => g.title.trim().toLowerCase()));

    // Incorporate any news items with category 'शासन निर्णय'
    safeNewsList.forEach((news) => {
      if (news && news.category === 'शासन निर्णय') {
        const cleanTitle = (news.title || '').trim().toLowerCase();
        if (!existingTitles.has(cleanTitle)) {
          list.push({
            id: news.id,
            title: news.title,
            date: news.publishDate || news.date || '2026-11-01',
            type: 'शासन निर्णय',
            summary: news.summary || news.content,
            fileUrl: news.imageUrl,
            createdAt: news.createdAt || new Date().toISOString(),
          });
          existingTitles.add(cleanTitle);
        }
      }
    });

    return list;
  }, [govOrders, safeNewsList]);

  const section2Items = combinedGovOrders
    .filter((item) => {
      if (!item) return false;
      const term = (searchTerm || '').trim().toLowerCase();
      if (!term) return true;
      const title = (item.title || '').toLowerCase();
      const summary = (item.summary || '').toLowerCase();
      return title.includes(term) || summary.includes(term);
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="bg-slate-50 py-6 sm:py-10 text-slate-800">
      {/* Page Header */}
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 mb-6">
        <div className="border-b border-slate-200 pb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <span className="text-xs uppercase tracking-widest font-bold text-amber-700">
              अधिकृत प्रसिद्धी दालन
            </span>
            <h1 className="font-serifDevanagari text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#0b1e36] mt-1">
              बातम्या आणि परिपत्रके
            </h1>
            <p className="text-sm sm:text-base text-slate-700 mt-2 max-w-2xl leading-relaxed">
              राज्यातील केंद्रप्रमुख व विस्तार अधिकाऱ्यांच्या कामकाजाशी संबंधित अधिकृत बातम्या, संघटना घडामोडी आणि महत्त्वाचे शासन निर्णय.
            </p>
          </div>

          {/* Search Box & Refresh Button */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="बातमी किंवा शब्द शोधा..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 shadow-2xs"
              />
            </div>
            {onRefreshNews && (
              <button
                onClick={onRefreshNews}
                disabled={isRefreshing}
                className="p-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 shadow-2xs"
                title="ताज्या बातम्या लोड करा"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-600' : ''}`} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content: Two Distinct Stacked Sections */}
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 space-y-8">
        {/* =========================================================================
            १. पहिला विभाग: महासंघ बातम्या, अधिकृत घोषणा व संघटना घडामोडी
        ========================================================================= */}
        <section className="bg-white p-5 sm:p-7 rounded-2xl border border-slate-200/90 shadow-xs">
          {/* Section 1 Header: Clear, Bold & Distinct */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold mb-1">
                <Megaphone className="w-3.5 h-3.5 text-amber-600" />
                <span>विभाग १</span>
              </div>
              <h2 className="font-serifDevanagari text-xl sm:text-2xl font-black text-[#0b1e36] tracking-tight">
                १. महासंघ बातम्या व संघटना घडामोडी
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                महासंघाच्या अधिकृत घोषणा, बैठका व राज्यस्तरीय संघटनात्मक घडामोडी.
              </p>
            </div>

            {/* Section 1 Filter Tabs: सर्व, अधिकृत घोषणा, संघटना घडामोडी */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-50 border border-slate-200 rounded-xl shadow-2xs shrink-0">
              {section1Categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSec1Category(cat)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                    sec1Category === cat
                      ? 'bg-[#0b1e36] text-amber-300 shadow-xs'
                      : 'text-slate-600 hover:text-[#0b1e36] hover:bg-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Section 1 Cards Grid */}
          <div className="mt-5">
            {section1Items.length === 0 ? (
              <div className="p-6 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs">
                या वर्गात सध्या कोणतीही बातमी उपलब्ध नाही.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {section1Items.map((news, index) => {
                  const imgUrl = news.imageUrl || news.image;
                  const isPhotoOnly = !news.content || news.content.trim() === '';
                  return (
                    <article
                      key={news.id ? `${news.id}-${index}` : `news-s1-${index}`}
                      onClick={() => setSelectedNews(news)}
                      className="bg-slate-50/60 hover:bg-white rounded-xl border border-slate-200 hover:border-amber-500 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between overflow-hidden group"
                    >
                      <div>
                        {imgUrl && (
                          <div className="w-full h-44 bg-slate-900/5 relative overflow-hidden border-b border-slate-200">
                            <img
                              src={imgUrl}
                              alt={news.title}
                              className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
                              loading="lazy"
                            />
                            <div className="absolute top-2.5 right-2.5 bg-black/75 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 shadow-sm">
                              <ImageIcon className="w-3 h-3 text-amber-400" />
                              <span>छायाचित्र</span>
                            </div>
                          </div>
                        )}

                        <div className="p-4 sm:p-5">
                          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                            <span className="font-bold text-amber-800 bg-amber-100/70 border border-amber-200 px-2 py-0.5 rounded">
                              {news.category}
                            </span>
                            <span className="font-mono text-slate-600">{toEnglishDigits(news.date)}</span>
                          </div>

                          <h3 className="font-serifDevanagari text-base font-bold text-[#0b1e36] group-hover:text-amber-800 transition-colors line-clamp-2 leading-snug">
                            {toEnglishDigits(news.title)}
                          </h3>

                          {news.summary && (
                            <p className="text-sm text-slate-700 mt-2 line-clamp-3 leading-relaxed">
                              {toEnglishDigits(news.summary)}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="px-4 py-2.5 bg-slate-100/70 group-hover:bg-amber-50/50 border-t border-slate-200/60 flex items-center justify-between text-xs font-bold text-amber-800 group-hover:text-amber-900 transition-colors">
                        <span>{isPhotoOnly ? '📷 फोटो पहा' : 'सविस्तर वाचा'}</span>
                        <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* =========================================================================
            २. दुसरा विभाग: अधिकृत शासन निर्णय व परिपत्रके
        ========================================================================= */}
        <section className="bg-white p-5 sm:p-7 rounded-2xl border border-slate-200/90 shadow-xs">
          {/* Section 2 Header: Clear, Bold & Distinct */}
          <div className="pb-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold mb-1">
                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                <span>विभाग २</span>
              </div>
              <h2 className="font-serifDevanagari text-xl sm:text-2xl font-black text-[#0b1e36] tracking-tight">
                २. अधिकृत शासन निर्णय व परिपत्रके
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                महाराष्ट्र शासन, शिक्षण आयुक्तालय व शालेय शिक्षण विभागाचे अधिकृत शासन निर्णय (GR) व परिपत्रके.
              </p>
            </div>

            <div className="text-xs font-bold px-3 py-1 rounded-lg bg-emerald-100/80 border border-emerald-200 text-emerald-900 self-start sm:self-auto font-mono">
              एकूण निर्णय: {section2Items.length}
            </div>
          </div>

          {/* Section 2 Cards Grid */}
          <div className="mt-5">
            {section2Items.length === 0 ? (
              <div className="p-6 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs">
                सध्या कोणतेही शासन निर्णय उपलब्ध नाहीत.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {section2Items.map((go, index) => {
                  return (
                    <article
                      key={go.id ? `${go.id}-${index}` : `go-s2-${index}`}
                      onClick={() => { const url = go.driveUrl || go.fileUrl; if (url) window.open(url, '_blank') }}
                      className="bg-gradient-to-b from-white to-emerald-50/30 rounded-xl border border-slate-200 hover:border-emerald-600 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between overflow-hidden group"
                    >
                      <div className="p-4 sm:p-5">
                          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                            <span className="font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded flex items-center gap-1">
                              <FileText className="w-3 h-3 text-emerald-700" />
                              {go.type}
                            </span>
                            <span className="font-mono text-slate-600">{toEnglishDigits(go.date)}</span>
                          </div>

                          <h3 className="font-serifDevanagari text-base font-bold text-[#0b1e36] group-hover:text-emerald-800 transition-colors line-clamp-2 leading-snug">
                            {toEnglishDigits(go.title)}
                          </h3>

                          {go.summary && (
                            <p className="text-sm text-slate-700 mt-2 line-clamp-3 leading-relaxed">
                              {toEnglishDigits(go.summary)}
                            </p>
                          )}
                      </div>

                      <div className="px-4 py-2.5 bg-emerald-50/70 group-hover:bg-emerald-100/70 border-t border-emerald-200/60 flex items-center justify-between text-xs font-bold text-emerald-800 group-hover:text-emerald-950 transition-colors">
                        <span>{go.driveUrl || go.fileUrl ? '📄 फाइल / लिंक पहा' : 'अद्याप फाइल उपलब्ध नाही'}</span>
                        <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Copyright Policy (कॉपीराइट धोरण - फुटरच्या अगदी वर लहान अक्षरात) */}
        <div className="mt-8 pt-4 border-t border-slate-200">
          <div className="bg-slate-100/80 border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
              <h4 className="font-serifDevanagari text-xs sm:text-sm font-bold text-[#0b1e36]">
                कॉपीराइट धोरण (Copyright Policy)
              </h4>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed font-medium mb-3">
              या संकेतस्थळावरील सर्व मजकूर, लोगो, परिपत्रके, छायाचित्रे आणि डिजिटल साहित्य हे 'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ' यांच्या मालकीचे असून ते कॉपीराइट कायद्यानुसार संरक्षित आहे.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-200 text-xs text-slate-700 leading-relaxed">
              <div className="bg-white/80 p-3 rounded-lg border border-slate-200/70 space-y-1">
                <span className="font-bold text-[#0b1e36] block">● वापराची मर्यादा:</span>
                <p>या संकेतस्थळावरील माहिती केवळ केंद्रप्रमुख, अधिकारी, शिक्षक आणि शैक्षणिक संदर्भासाठी माहितीच्या उद्देशाने वापरता येईल.</p>
              </div>

              <div className="bg-white/80 p-3 rounded-lg border border-slate-200/70 space-y-1">
                <span className="font-bold text-[#0b1e36] block">● परवानगीशिवाय पुनर्वापर मनाई:</span>
                <p>महासंघाच्या पूर्वपरवानगीशिवाय या संकेतस्थळावरील कोणताही मजकूर, लोगो किंवा डेटा व्यावसायिक कारणांसाठी कॉपी करणे, विकृत करणे अथवा पुनरुत्पादित करण्यास सक्त मनाई आहे.</p>
              </div>

              <div className="bg-white/80 p-3 rounded-lg border border-slate-200/70 space-y-1">
                <span className="font-bold text-[#0b1e36] block">● अधिकृतता:</span>
                <p>संकेतस्थळावर प्रसिद्ध करण्यात आलेली परिपत्रके व सूचना संबंधित शासकीय विभागाच्या मूळ आदेशांशी सुसंगत असतील; कोणत्याही कायदेशीर बाबींसाठी मूळ शासकीय राजपत्राचा/परिपत्रकाचा आधार घ्यावा.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Read News / View Photo Modal (सविस्तर बातमी व वर फोटो) */}
      {selectedNews && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-5 bg-[#0b1e36] text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                <span className="text-xs font-semibold text-amber-300">
                  {selectedNews.category} · {toEnglishDigits(selectedNews.date)}
                </span>
              </div>
              <button
                onClick={() => setSelectedNews(null)}
                className="text-slate-300 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {/* वर फोटो (Photo on Top) */}
              {(selectedNews.imageUrl || selectedNews.image) && (
                <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-900/5 shadow-xs">
                  <img
                    src={selectedNews.imageUrl || selectedNews.image}
                    alt={selectedNews.title}
                    className="w-full max-h-[440px] object-contain mx-auto bg-slate-950/5"
                    loading="lazy"
                  />
                  <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-700">
                    <span className="font-semibold text-slate-600 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-amber-600" />
                      <span>अधिकृत छायाचित्र / परिपत्रक</span>
                    </span>
                    <a
                      href={selectedNews.imageUrl || selectedNews.image}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-800 hover:text-amber-950 font-bold underline flex items-center gap-1 text-[11px]"
                    >
                      <span>मोठ्या आकारात पहा</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

              {/* खाली बातमी शीर्षक व मजकूर */}
              <h2 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-[#0b1e36] leading-snug">
                {toEnglishDigits(selectedNews.title)}
              </h2>

              {selectedNews.summary && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs font-semibold text-amber-900 leading-relaxed">
                  {toEnglishDigits(selectedNews.summary)}
                </div>
              )}

              {selectedNews.content && (
                <div className="text-sm text-slate-700 leading-relaxed space-y-3 whitespace-pre-line font-normal">
                  {toEnglishDigits(selectedNews.content)}
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500 font-mono">
                {selectedNews.id}
              </span>
              <button
                onClick={() => setSelectedNews(null)}
                className="bg-[#0b1e36] hover:bg-[#132f52] text-white text-xs font-bold px-5 py-2 rounded-lg"
              >
                बंद करा
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

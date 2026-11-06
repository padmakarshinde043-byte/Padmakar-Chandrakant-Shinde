import React, { useState } from 'react';
import { Calendar, Tag, ArrowRight, X, Search, FileText } from 'lucide-react';
import { NewsItem } from '../data/mahasanghData';
import { toEnglishDigits } from '../utils/formatters';

interface NewsTabProps {
  newsList: NewsItem[];
  selectedNews: NewsItem | null;
  setSelectedNews: (news: NewsItem | null) => void;
  onRefreshNews?: () => Promise<void>;
  isRefreshing?: boolean;
}

export const NewsTab: React.FC<NewsTabProps> = ({
  newsList,
  selectedNews,
  setSelectedNews,
  onRefreshNews,
  isRefreshing,
}) => {
  const [selectedCategory, setSelectedCategory] = useState('सर्व');
  const [searchTerm, setSearchTerm] = useState('');

  const categories = ['सर्व', 'अधिकृत घोषणा', 'संघटना घडामोडी', 'शासन निर्णय', 'शैक्षणिक गुणवत्ता'];

  const filteredNews = newsList.filter((item) => {
    const matchesCat = selectedCategory === 'सर्व' || item.category === selectedCategory;
    const matchesSearch =
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.content.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="bg-[#fbf8f2] py-10 md:py-16">
      {/* Page Header */}
      <div className="max-w-[1160px] mx-auto px-4 mb-10">
        <div className="border-b border-[#e7ded1] pb-6">
          <p className="text-xs uppercase tracking-widest font-bold text-[#df6b16] mb-1">
            बातम्या व घडामोडी
          </p>
          <h1 className="font-serifDevanagari text-3xl sm:text-4xl font-bold text-[#09243f]">
            संघटना व शैक्षणिक बातम्या
          </h1>
          <p className="text-base text-[#607184] mt-2 max-w-2xl">
            राज्यातील केंद्रप्रमुख व विस्तार अधिकाऱ्यांच्या कामकाजाशी संबंधित अधिकृत परिपत्रके, बैठका व ताज्या घडामोडी.
          </p>
        </div>

        {/* Filter and Search Bar */}
        <div className="mt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  selectedCategory === cat
                    ? 'bg-[#df6b16] text-white shadow-xs font-bold'
                    : 'bg-white text-[#607184] hover:bg-[#fff0df] border border-[#e7ded1]'
                }`}
              >
                {cat}
              </button>
            ))}
            {onRefreshNews && (
              <button
                onClick={onRefreshNews}
                disabled={isRefreshing}
                className="text-xs text-[#df6b16] hover:bg-[#fff0df] border border-[#df6b16]/30 px-3 py-1.5 rounded-full transition-colors font-medium flex items-center gap-1 disabled:opacity-50"
                title="ताज्या घडामोडी तपासा"
              >
                {isRefreshing ? 'तपासत आहे...' : '⟳ ताजे अपडेट्स'}
              </button>
            )}
          </div>

          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="बातम्या शोधा..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16] bg-white"
            />
          </div>
        </div>
      </div>

      {/* News Grid */}
      <div className="max-w-[1160px] mx-auto px-4">
        {filteredNews.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredNews.map((item) => (
              <article
                key={item.id}
                onClick={() => setSelectedNews(item)}
                className="bg-white rounded-xl border border-[#e7ded1] overflow-hidden shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  {item.image ? (
                    <div className="h-44 bg-slate-100 overflow-hidden relative">
                      <img
                        src={item.image}
                        alt={item.title}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <span className="absolute top-2.5 left-2.5 bg-[#09243f]/90 text-white text-[10px] font-bold px-2.5 py-1 rounded">
                        {item.category}
                      </span>
                    </div>
                  ) : (
                    <div className="h-3 bg-[#df6b16]"></div>
                  )}

                  <div className="p-5">
                    <div className="flex items-center gap-3 text-xs text-[#607184] mb-2 font-medium">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-[#df6b16]" />
                        {toEnglishDigits(item.date)}
                      </span>
                      {!item.image && (
                        <span className="flex items-center gap-1 text-[#df6b16] font-semibold">
                          <Tag className="w-3 h-3" />
                          {item.category}
                        </span>
                      )}
                    </div>

                    <h3 className="font-serifDevanagari text-lg font-bold text-[#09243f] mb-2 group-hover:text-[#df6b16] transition-colors leading-snug">
                      {item.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#536477] leading-relaxed line-clamp-3">
                      {item.summary}
                    </p>
                  </div>
                </div>

                <div className="px-5 pb-5 pt-2 border-t border-[#f0e9de] flex items-center justify-between text-xs font-bold text-[#df6b16]">
                  <span>सविस्तर वाचा</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="bg-white p-12 text-center rounded-xl border border-[#e7ded1] text-[#607184]">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-base font-semibold">कोणतीही बातमी आढळली नाही.</p>
            <p className="text-xs mt-1">कृपया शोध शब्द किंवा वर्गवारी बदलून पहा.</p>
          </div>
        )}
      </div>

      {/* News Detail Modal */}
      {selectedNews && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-[#e7ded1] relative my-8">
            <button
              onClick={() => setSelectedNews(null)}
              className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full z-10 transition-colors"
              aria-label="बंद करा"
            >
              <X className="w-5 h-5" />
            </button>

            {selectedNews.image && (
              <div className="w-full bg-[#072038] max-h-72 overflow-hidden flex items-center justify-center p-2">
                <img
                  src={selectedNews.image}
                  alt={selectedNews.title}
                  className="max-h-64 object-contain rounded"
                />
              </div>
            )}

            <div className="p-6 sm:p-8 space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="bg-[#fff0df] text-[#df6b16] font-bold px-2.5 py-1 rounded-full">
                  {selectedNews.category}
                </span>
                <span className="text-[#607184] flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-[#df6b16]" />
                  {toEnglishDigits(selectedNews.date)}
                </span>
              </div>

              <h2 className="font-serifDevanagari text-2xl sm:text-3xl font-bold text-[#09243f] leading-snug">
                {selectedNews.title}
              </h2>

              <div className="w-12 h-1 bg-[#df6b16] rounded-full"></div>

              <p className="text-sm sm:text-base font-medium text-[#102a43] leading-relaxed bg-[#fbf8f2] p-4 rounded-lg border border-[#e7ded1]">
                {selectedNews.summary}
              </p>

              <div className="text-sm text-[#536477] leading-relaxed whitespace-pre-line space-y-3 pt-2">
                {selectedNews.content}
              </div>

              <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-[#607184]">
                  महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ
                </span>
                <button
                  onClick={() => setSelectedNews(null)}
                  className="bg-[#09243f] text-white hover:bg-[#102a43] px-5 py-2 rounded text-xs font-bold transition-colors"
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

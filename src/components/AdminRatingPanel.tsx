import React, { useMemo, useState } from 'react';
import {
  Star,
  RefreshCw,
  Trash2,
  MessageSquareText,
  Smartphone,
  Monitor,
  Search,
} from 'lucide-react';
import {
  FEEDBACK_CRITERIA,
  FeedbackAggregateSummary,
  WebsiteFeedbackRecord,
} from '../utils/feedbackAnalytics';
import { formatDateWithEnglishDigits, formatTimeOnly, toEnglishDigits } from '../utils/formatters';

interface AdminRatingPanelProps {
  items: WebsiteFeedbackRecord[];
  summary: FeedbackAggregateSummary;
  isLoading: boolean;
  onRefresh: () => void;
  onDelete: (id: string) => Promise<void> | void;
}

const StarDisplay: React.FC<{ value: number; size?: 'sm' | 'md' }> = ({
  value,
  size = 'sm',
}) => {
  const filled = Math.round(value);
  const iconCls = size === 'md' ? 'w-5 h-5' : 'w-3.5 h-3.5';
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${iconCls} ${
            n <= filled ? 'fill-[#FBB03B] text-[#d98a0b]' : 'fill-transparent text-slate-300'
          }`}
        />
      ))}
    </span>
  );
};

export const AdminRatingPanel: React.FC<AdminRatingPanelProps> = ({
  items,
  summary,
  isLoading,
  onRefresh,
  onDelete,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'suggestions'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (filterMode === 'suggestions' && !item.suggestion?.trim()) {
        return false;
      }
      if (q) {
        const hay = `${item.suggestion || ''} ${item.pagePath || ''} ${item.deviceType || ''}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }, [items, filterMode, searchQuery]);

  const handleDeleteClick = async (id: string) => {
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-[#0F254B] flex items-center gap-2">
            <Star className="w-5 h-5 fill-[#FBB03B] text-[#d98a0b] shrink-0" />
            <span>वेबसाइट रेटिंग व अभिप्राय (Website Ratings & Feedback)</span>
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            वेबसाइट वापरकर्त्यांकडून प्राप्त झालेले संकलित स्टार रेटिंग व महत्त्वाच्या सूचना.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-1.5 bg-[#0F254B] hover:bg-[#193568] text-white text-xs sm:text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-60 cursor-pointer shrink-0 whitespace-nowrap"
        >
          <RefreshCw className={`w-4 h-4 text-[#FBB03B] ${isLoading ? 'animate-spin' : ''}`} />
          <span>रिफ्रेश करा</span>
        </button>
      </div>

      {/* Top KPI Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">एकूण सरासरी रेटिंग</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-black font-mono tabular-nums text-[#0F254B]">
                {summary.totalResponses > 0 ? summary.overallAverage.toFixed(2) : '0.00'}
              </span>
              <span className="text-sm font-semibold text-slate-400 font-mono">/ 5.0</span>
            </div>
            <div className="mt-1.5">
              <StarDisplay value={summary.overallAverage} size="md" />
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
            <Star className="w-6 h-6 fill-[#FBB03B] text-[#d98a0b]" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">एकूण प्राप्त अभिप्राय</p>
            <p className="mt-1 text-3xl font-black font-mono tabular-nums text-[#0F254B]">
              {toEnglishDigits(summary.totalResponses)}
            </p>
            <p className="mt-1 text-xs text-slate-500">सर्व ५ निकषांचे संकलित मत</p>
          </div>
          <div className="text-right space-y-0.5 text-xs font-mono tabular-nums text-slate-600">
            {[5, 4, 3, 2, 1].map((s) => (
              <div key={s} className="flex items-center justify-end gap-1.5">
                <span>{s}★</span>
                <span className="w-6 text-right font-bold text-[#0F254B]">
                  {summary.starDistribution[s as 1 | 2 | 3 | 4 | 5]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">लेखी सूचना / सुधारणा</p>
            <p className="mt-1 text-3xl font-black font-mono tabular-nums text-[#0F254B]">
              {toEnglishDigits(summary.withSuggestionsCount)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              एकूण अभिप्रायांपैकी{' '}
              <span className="font-mono font-bold text-[#0F254B]">
                {summary.totalResponses > 0
                  ? Math.round((summary.withSuggestionsCount / summary.totalResponses) * 100)
                  : 0}
                %
              </span>{' '}
              मध्ये लेखी सूचना
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-[#0F254B]">
            <MessageSquareText className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 5 Criteria Aggregated Breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
        <h4 className="text-sm sm:text-base font-bold text-[#0F254B] mb-3.5">
          निकषनिहाय संकलित रेटिंग (Criteria Breakdown)
        </h4>
        <div className="space-y-3">
          {summary.criteria.map((c, idx) => {
            const pct = Math.min(100, Math.max(0, (c.average / 5) * 100));
            return (
              <div key={c.key} className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
                  <span className="font-bold text-[#0F254B]">
                    {idx + 1}. {c.labelMr}{' '}
                    <span className="text-slate-400 font-normal">({c.labelEn})</span>
                  </span>
                  <div className="flex items-center gap-2.5 font-mono tabular-nums">
                    <StarDisplay value={c.average} />
                    <span className="font-extrabold text-[#0F254B] w-10 text-right">
                      {c.ratedCount > 0 ? c.average.toFixed(2) : '0.00'}
                    </span>
                    <span className="text-xs text-slate-500">({c.ratedCount} मते)</span>
                  </div>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#0F254B] to-[#FBB03B] transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Individual Feedback Table / List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                filterMode === 'all'
                  ? 'bg-white text-[#0F254B] shadow-xs'
                  : 'text-slate-600 hover:text-[#0F254B]'
              }`}
            >
              सर्व अभिप्राय ({toEnglishDigits(items.length)})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('suggestions')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                filterMode === 'suggestions'
                  ? 'bg-white text-[#0F254B] shadow-xs'
                  : 'text-slate-600 hover:text-[#0F254B]'
              }`}
            >
              केवळ लेखी सूचना ({toEnglishDigits(summary.withSuggestionsCount)})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="सूचना शोधा..."
              className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm rounded-lg border border-slate-300 focus:border-[#0F254B] focus:outline-none"
            />
          </div>
        </div>

        {isLoading && items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">अभिप्राय लोड होत आहेत...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-10 text-center space-y-1.5">
            <p className="text-sm font-bold text-[#0F254B]">अद्याप कोणतेही रेटिंग नोंदवलेले नाही.</p>
            <p className="text-xs text-slate-500">
              वेबसाइटवरील वापरकर्त्यांनी अभिप्राय नोंदवताच ते येथे संकलित स्वरूपात दिसतील.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-2.5 px-3 whitespace-nowrap">दिनांक / वेळ</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">सरासरी</th>
                  {FEEDBACK_CRITERIA.map((c) => (
                    <th key={c.key} className="py-2.5 px-2 text-center whitespace-nowrap">
                      {c.shortLabelMr}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 min-w-[220px]">सूचना / अभिप्राय</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">कृती</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors align-top">
                    <td className="py-3 px-3 whitespace-nowrap text-slate-600 font-mono tabular-nums text-xs">
                      <div className="font-semibold text-[#0F254B]">
                        {formatDateWithEnglishDigits(item.createdAt)}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <span>{formatTimeOnly(item.createdAt)}</span>
                        <span>·</span>
                        {item.deviceType === 'mobile' ? (
                          <Smartphone className="w-3 h-3 inline text-slate-400" />
                        ) : (
                          <Monitor className="w-3 h-3 inline text-slate-400" />
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-mono font-extrabold tabular-nums text-[#0F254B]">
                        {item.averageRating.toFixed(1)} / 5
                      </div>
                      <StarDisplay value={item.averageRating} />
                    </td>
                    <td className="py-3 px-2 text-center font-mono tabular-nums font-bold text-[#0F254B]">
                      {item.designRating > 0 ? `${item.designRating}★` : '—'}
                    </td>
                    <td className="py-3 px-2 text-center font-mono tabular-nums font-bold text-[#0F254B]">
                      {item.navigationRating > 0 ? `${item.navigationRating}★` : '—'}
                    </td>
                    <td className="py-3 px-2 text-center font-mono tabular-nums font-bold text-[#0F254B]">
                      {item.speedRating > 0 ? `${item.speedRating}★` : '—'}
                    </td>
                    <td className="py-3 px-2 text-center font-mono tabular-nums font-bold text-[#0F254B]">
                      {item.mobileRating > 0 ? `${item.mobileRating}★` : '—'}
                    </td>
                    <td className="py-3 px-2 text-center font-mono tabular-nums font-bold text-[#0F254B]">
                      {item.overallRating > 0 ? `${item.overallRating}★` : '—'}
                    </td>
                    <td className="py-3 px-3 text-slate-700 leading-relaxed">
                      {item.suggestion ? (
                        <p className="whitespace-pre-wrap break-words">{item.suggestion}</p>
                      ) : (
                        <span className="text-slate-400 italic text-xs">लेखी सूचना नाही</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleDeleteClick(item.id)}
                        disabled={deletingId === item.id}
                        aria-label="अभिप्राय हटवा"
                        title="अभिप्राय हटवा"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>हटवा</span>
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
  );
};

export default AdminRatingPanel;

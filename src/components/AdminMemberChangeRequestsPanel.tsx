import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  ArrowRight,
  Clock,
  Image as ImageIcon,
  AlertCircle,
} from 'lucide-react';
import { getAuthHeaders } from '../api/sqlBridge';
import { toEnglishDigits } from '../utils/formatters';

interface MemberChangeFields {
  salutation?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  district?: string;
  taluka?: string;
  centerName?: string;
  address?: string;
  photo?: string;
}

interface MemberChangeRequestItem {
  id: string;
  applicationId: string;
  memberNumber: string;
  applicantName: string;
  applicantPhone: string;
  applicantDistrict: string;
  currentSnapshot: MemberChangeFields;
  proposedChanges: MemberChangeFields;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string;
  reviewNote: string;
  createdAt: string;
  reviewedAt: string;
}

interface AdminMemberChangeRequestsPanelProps {
  isSuperAdmin: boolean;
  onPendingCountChange?: (count: number) => void;
  onMemberApproved?: () => Promise<void> | void;
}

const TEXT_FIELD_LABELS: Array<{ key: keyof MemberChangeFields; label: string }> = [
  { key: 'salutation', label: 'अभिवादन' },
  { key: 'fullName', label: 'पूर्ण नाव' },
  { key: 'phone', label: 'मोबाईल क्र.' },
  { key: 'email', label: 'ई-मेल' },
  { key: 'district', label: 'जिल्हा' },
  { key: 'taluka', label: 'तालुका' },
  { key: 'centerName', label: 'केंद्राचे नाव' },
  { key: 'address', label: 'पत्ता' },
];

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  try {
    return dt.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const AdminMemberChangeRequestsPanel: React.FC<AdminMemberChangeRequestsPanelProps> = ({
  isSuperAdmin,
  onPendingCountChange,
  onMemberApproved,
}) => {
  const [requests, setRequests] = useState<MemberChangeRequestItem[]>([]);
  const [counts, setCounts] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [feedbackBanner, setFeedbackBanner] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/member-change-requests', {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedbackBanner({ text: data?.message || 'बदल विनंत्या लोड करताना त्रुटी आली.', type: 'error' });
        return;
      }
      const list = Array.isArray(data.requests) ? data.requests : [];
      const nextCounts = data.counts || {
        total: list.length,
        pending: list.filter((r: any) => r.status === 'pending').length,
        approved: list.filter((r: any) => r.status === 'approved').length,
        rejected: list.filter((r: any) => r.status === 'rejected').length,
      };
      setRequests(list);
      setCounts(nextCounts);
      onPendingCountChange?.(Number(nextCounts.pending || 0));
    } catch {
      setFeedbackBanner({ text: 'सर्व्हरशी संपर्क होऊ शकला नाही.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [onPendingCountChange]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const filteredRequests = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return requests.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.applicantName.toLowerCase().includes(q) ||
        item.memberNumber.toLowerCase().includes(q) ||
        item.applicantPhone.toLowerCase().includes(q) ||
        item.applicantDistrict.toLowerCase().includes(q) ||
        item.reason.toLowerCase().includes(q)
      );
    });
  }, [requests, statusFilter, searchTerm]);

  const handleApprove = async (item: MemberChangeRequestItem) => {
    setBusyId(item.id);
    setFeedbackBanner(null);
    try {
      const res = await fetch(`/api/member-change-requests/${encodeURIComponent(item.id)}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ reviewNote: '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedbackBanner({ text: data?.message || 'विनंती मंजूर करताना त्रुटी आली.', type: 'error' });
        return;
      }

      const syncSummaryParts: string[] = ['सदस्य नोंद, सभासद यादी व आय-कार्ड अपडेट झाले'];
      if (Number(data.syncedOfficialsCount || 0) > 0) {
        syncSummaryParts.push(`जिल्हा पदाधिकारी नोंद (${toEnglishDigits(data.syncedOfficialsCount)}) सिंक`);
      }
      if (isSuperAdmin && Number(data.syncedLeadersCount || 0) > 0) {
        syncSummaryParts.push(`नेतृत्व नोंद (${toEnglishDigits(data.syncedLeadersCount)}) सिंक`);
      }

      setFeedbackBanner({
        text: `${item.applicantName} यांची बदल विनंती मंजूर झाली! (${syncSummaryParts.join(' · ')})`,
        type: 'success',
      });

      try {
        localStorage.removeItem('mahasangh_approved_members_cache_v1');
      } catch {}
      window.dispatchEvent(new CustomEvent('mahasangh_member_updated', { detail: data.updatedMember }));
      await loadRequests();
      if (onMemberApproved) {
        await onMemberApproved();
      }
    } catch {
      setFeedbackBanner({ text: 'सर्व्हर त्रुटी आली.', type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectSubmit = async (item: MemberChangeRequestItem) => {
    setBusyId(item.id);
    setFeedbackBanner(null);
    try {
      const res = await fetch(`/api/member-change-requests/${encodeURIComponent(item.id)}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ reviewNote: rejectNote.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedbackBanner({ text: data?.message || 'विनंती नाकारताना त्रुटी आली.', type: 'error' });
        return;
      }

      setRejectingId(null);
      setRejectNote('');
      setFeedbackBanner({
        text: `${item.applicantName} यांची बदल विनंती नाकारली गेली.`,
        type: 'success',
      });
      await loadRequests();
    } catch {
      setFeedbackBanner({ text: 'सर्व्हर त्रुटी आली.', type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h3 className="font-serifDevanagari text-lg sm:text-xl font-extrabold text-[#0b1e36]">
            सदस्य फोटो व माहिती बदल विनंत्या
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            गरजू सदस्यांनी पाठवलेल्या दुरुस्ती विनंत्या तपासा — मंजूर करताच सभासद यादी, स्थिती व आय-कार्डवर सर्वत्र बदल लागू होतात.
          </p>
        </div>

        <button
          type="button"
          onClick={loadRequests}
          disabled={isLoading}
          className="self-start sm:self-auto px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>रिफ्रेश करा</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedbackBanner && (
        <div
          className={`p-3 rounded-lg border text-xs sm:text-sm font-semibold flex items-start gap-2 ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedbackBanner.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{feedbackBanner.text}</span>
        </div>
      )}

      {/* Filter Bar & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start flex-wrap">
          {(
            [
              { key: 'pending', label: `प्रलंबित (${toEnglishDigits(counts.pending)})` },
              { key: 'approved', label: `मंजूर (${toEnglishDigits(counts.approved)})` },
              { key: 'rejected', label: `नाकारलेले (${toEnglishDigits(counts.rejected)})` },
              { key: 'all', label: `सर्व (${toEnglishDigits(counts.total)})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer tabular-nums ${
                statusFilter === tab.key
                  ? 'bg-white text-[#0b1e36] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="नाव, सदस्य क्र., मोबाईल किंवा जिल्हा..."
            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#193568]/25 focus:border-[#193568]"
          />
        </div>
      </div>

      {/* Request List */}
      {isLoading && requests.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-500 font-medium">
          विनंत्या लोड होत आहेत...
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="py-12 px-4 text-center border border-slate-200 rounded-lg bg-slate-50/50">
          <p className="text-sm font-bold text-slate-700">
            {statusFilter === 'pending'
              ? 'सध्या कोणतीही प्रलंबित माहिती बदल विनंती नाही.'
              : 'निवडलेल्या फिल्टरमध्ये कोणतीही विनंती आढळली नाही.'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            गरजू सदस्यांनी अर्जाची स्थिती विभागातून दुरुस्ती विनंती पाठवल्यावर त्या येथे दिसतील.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((item) => {
            const changedTextRows = TEXT_FIELD_LABELS.filter(
              ({ key }) => item.proposedChanges[key] !== undefined
            );
            const hasPhotoChange = Boolean(item.proposedChanges.photo);
            const isBusy = busyId === item.id;
            const isRejectBoxOpen = rejectingId === item.id;

            return (
              <div
                key={item.id}
                className="border border-slate-200 rounded-xl overflow-hidden bg-white"
              >
                {/* Request Top Metadata Row */}
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="text-sm sm:text-base font-extrabold text-[#0b1e36]">
                      {item.applicantName || 'सदस्य'}
                    </div>
                    <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                      <span className="font-mono font-bold text-[#193568]">
                        {item.memberNumber || item.applicationId}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>जिल्हा: {item.applicantDistrict || '—'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDateTime(item.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs font-bold self-start sm:self-auto">
                    {item.status === 'pending' && (
                      <span className="text-amber-700">प्रलंबित (Pending)</span>
                    )}
                    {item.status === 'approved' && (
                      <span className="text-emerald-700">मंजूर (Approved)</span>
                    )}
                    {item.status === 'rejected' && (
                      <span className="text-rose-700">नाकारलेले (Rejected)</span>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className="p-4 space-y-4">
                  {/* Mandatory Reason */}
                  <div className="bg-amber-50/60 border border-amber-200/80 rounded-lg px-3.5 py-2.5 text-xs sm:text-sm text-slate-800">
                    <span className="font-bold text-[#0b1e36]">बदलाचे कारण: </span>
                    <span>{item.reason}</span>
                  </div>

                  {/* Photo Side-by-Side Comparison */}
                  {hasPhotoChange && (
                    <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/50">
                      <div className="text-xs font-bold text-slate-700 mb-2.5">
                        पासपोर्ट फोटो तुलना (आधीचा → नवीन)
                      </div>
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="text-center space-y-1">
                          <div className="w-20 h-24 rounded-lg border border-slate-300 bg-white overflow-hidden flex items-center justify-center">
                            {item.currentSnapshot.photo ? (
                              <img
                                src={item.currentSnapshot.photo}
                                alt="जुना फोटो"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="w-5 h-5 text-slate-400" />
                            )}
                          </div>
                          <div className="text-[11px] font-semibold text-slate-500">जुना फोटो</div>
                        </div>

                        <ArrowRight className="w-5 h-5 text-[#193568] shrink-0" />

                        <div className="text-center space-y-1">
                          <div className="w-20 h-24 rounded-lg border-2 border-emerald-500 bg-white overflow-hidden flex items-center justify-center">
                            <img
                              src={item.proposedChanges.photo}
                              alt="नवीन फोटो"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="text-[11px] font-bold text-emerald-700">नवीन फोटो</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Text Fields Side-by-Side Diff Table */}
                  {changedTextRows.length > 0 && (
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left border-collapse text-xs sm:text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                            <th className="py-2 px-3 font-bold w-1/4">तपशील</th>
                            <th className="py-2 px-3 font-bold w-[37.5%]">सध्याची (जुनी) माहिती</th>
                            <th className="py-2 px-3 font-bold w-[37.5%] text-[#0b1e36]">नवीन (सुधारित) माहिती</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {changedTextRows.map(({ key, label }) => (
                            <tr key={key}>
                              <td className="py-2 px-3 font-semibold text-slate-700">{label}</td>
                              <td className="py-2 px-3 text-slate-500 line-through break-words">
                                {item.currentSnapshot[key] || '—'}
                              </td>
                              <td className="py-2 px-3 font-bold text-emerald-800 bg-emerald-50/40 break-words">
                                {item.proposedChanges[key] || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Audit Trail for Processed Requests */}
                  {item.status !== 'pending' && (
                    <div className="text-xs text-slate-600 pt-2 border-t border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
                      <span>
                        निर्णयकर्ता: <strong className="text-slate-800">{item.reviewedBy || '—'}</strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>दिनांक: {formatDateTime(item.reviewedAt)}</span>
                      {item.reviewNote && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>शेरा: {item.reviewNote}</span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Action Controls for Pending Requests */}
                  {item.status === 'pending' && (
                    <div className="pt-2 border-t border-slate-100 space-y-3">
                      {isRejectBoxOpen ? (
                        <div className="bg-rose-50/60 border border-rose-200 rounded-lg p-3 space-y-2.5">
                          <label className="block text-xs font-bold text-rose-900">
                            नाकारण्याचे कारण (पर्यायी — सदस्याला दिसेल):
                          </label>
                          <input
                            type="text"
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                            maxLength={250}
                            placeholder="उदा. कृपया स्पष्ट चेहरा असलेला पासपोर्ट फोटो अपलोड करा"
                            className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-rose-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-300"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleRejectSubmit(item)}
                              disabled={isBusy}
                              className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer"
                            >
                              {isBusy ? 'प्रक्रिया सुरू...' : 'नाकारा (Confirm Reject)'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingId(null);
                                setRejectNote('');
                              }}
                              disabled={isBusy}
                              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                            >
                              रद्द करा
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleApprove(item)}
                            disabled={isBusy}
                            className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs sm:text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>
                              {isBusy ? 'अद्ययावत होत आहे...' : 'मंजूर करा व सर्वत्र लागू करा'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setRejectingId(item.id);
                              setRejectNote('');
                            }}
                            disabled={isBusy}
                            className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 text-xs sm:text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <XCircle className="w-4 h-4 shrink-0" />
                            <span>नाकारा</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

import React, { useState, useMemo, useEffect } from 'react';
import { Search, Users, Filter, MapPin, RefreshCw } from 'lucide-react';
import { MembershipApplication, MAHARASHTRA_DISTRICTS, formatSequentialMemberNumber } from '../data/mahasanghData';
import { toEnglishDigits } from '../utils/formatters';
import { fetchApprovedMembersCached } from '../firebase';

export interface RegisteredMemberItem {
  id: string;
  srNo: number;
  memberNumber: string;
  fullName: string;
  taluka: string;
  centerName?: string;
  district: string;
  designation?: string;
  phone?: string;
  approvedAt?: string;
}

interface RegisteredMembersDirectoryProps {
  applications: MembershipApplication[];
  onRefreshFromFirebase?: () => Promise<void> | void;
}

export const RegisteredMembersDirectory: React.FC<RegisteredMembersDirectoryProps> = ({
  applications: propApplications,
  onRefreshFromFirebase
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [localLiveApps, setLocalLiveApps] = useState<MembershipApplication[] | null>(null);

  // Always sync with propApplications when provided by parent
  useEffect(() => {
    if (propApplications && propApplications.length > 0) {
      setLocalLiveApps(propApplications);
    }
  }, [propApplications]);

  // Initial mount: load approved members using Smart Cache (0 reads if valid cache exists)
  useEffect(() => {
    let isMounted = true;
    const loadFirebaseApps = async () => {
      try {
        const fresh = await fetchApprovedMembersCached(false);
        if (isMounted && fresh && fresh.length > 0) {
          setLocalLiveApps(fresh);
        }
      } catch (err) {
        console.warn('Smart Cache approved members fetch error:', err);
      }
    };

    loadFirebaseApps();
    return () => {
      isMounted = false;
    };
  }, []);

  // Manual Refresh handler to re-verify directly against Firestore server
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefreshFromFirebase) {
        await onRefreshFromFirebase();
      }
      const fresh = await fetchApprovedMembersCached(true);
      if (fresh && fresh.length > 0) {
        setLocalLiveApps(fresh);
      }
    } catch (err) {
      console.warn('Firebase refresh error:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const activeApplications = localLiveApps || propApplications || [];

  // Filter ONLY real approved applications from Firebase (खरे खुरे मंजूर केलेले अर्ज)
  const allRegisteredMembers: RegisteredMemberItem[] = useMemo(() => {
    const approvedOnly = activeApplications.filter((app) => {
      const isApprovedStatus = app.status === 'approved' || (typeof app.status === 'string' && app.status.toLowerCase() === 'approved');
      const hasMemberNumber = Boolean(app.memberNumber && app.memberNumber.trim() !== '');
      const hasApprovedAt = Boolean(app.approvedAt);
      return isApprovedStatus || hasMemberNumber || hasApprovedAt;
    });

    // Sort by approval date or creation date ascending (1st approved = #1, 2nd = #2, etc.)
    approvedOnly.sort((a, b) => {
      // If both have memberNumber with numeric suffix, sort by sequence
      const numA = parseInt((a.memberNumber || '').replace(/\D/g, '').slice(-4) || '0', 10);
      const numB = parseInt((b.memberNumber || '').replace(/\D/g, '').slice(-4) || '0', 10);
      if (numA && numB && numA !== numB) {
        return numA - numB;
      }
      const dateA = new Date(a.approvedAt || a.createdAt || '').getTime() || 0;
      const dateB = new Date(b.approvedAt || b.createdAt || '').getTime() || 0;
      return dateA - dateB;
    });

    return approvedOnly.map((app, index) => {
      const srNo = index + 1;
      const memberNumber =
        app.memberNumber && app.memberNumber.trim() !== ''
          ? app.memberNumber.trim()
          : formatSequentialMemberNumber(app.district || 'MAHA', srNo);

      // Clean designation without any star (*)
      const designation =
        app.isOfficial && app.officialPost
          ? app.officialPost.replace(/[⭐*★]/g, '').trim()
          : (app.professional || 'केंद्रप्रमुख').replace(/[⭐*★]/g, '').trim();

      const talukaName = app.taluka || app.officialTaluka || '-';

      return {
        id: app.id || `app-${srNo}`,
        srNo,
        memberNumber,
        fullName: `${app.salutation ? app.salutation + ' ' : ''}${app.fullName}`.trim(),
        taluka: talukaName,
        centerName: app.centerName,
        district: app.district || app.officialDistrict || '-',
        designation,
        phone: app.phone,
        approvedAt: app.approvedAt || app.createdAt
      };
    });
  }, [activeApplications]);

  // Client-side filtering (0 Firebase reads)
  const filteredMembers = useMemo(() => {
    let result = allRegisteredMembers;

    if (selectedDistrict) {
      result = result.filter((m) => m.district === selectedDistrict);
    }

    if (searchTerm.trim()) {
      const q = toEnglishDigits(searchTerm.trim().toLowerCase());
      const qDigits = q.replace(/\D/g, '');

      result = result.filter((m) => {
        const nameMatch = m.fullName.toLowerCase().includes(q);
        const talukaMatch = m.taluka.toLowerCase().includes(q);
        const centerMatch = m.centerName && m.centerName.toLowerCase().includes(q);
        const districtMatch = m.district.toLowerCase().includes(q);
        const memberNoMatch = m.memberNumber.toLowerCase().includes(q);
        const srNoMatch = qDigits && String(m.srNo) === qDigits;
        return nameMatch || talukaMatch || centerMatch || districtMatch || memberNoMatch || srNoMatch;
      });
    }

    return result;
  }, [allRegisteredMembers, selectedDistrict, searchTerm]);

  return (
    <div className="bg-white rounded-2xl border-2 border-[#193568]/20 shadow-sm overflow-hidden mb-8 transition-all">
      {/* Header Bar */}
      <div className="bg-gradient-to-r from-[#193568] via-[#1f3f78] to-[#12284c] text-white p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#efb24b]/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#df6b16] text-white flex items-center justify-center shadow-xs shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-serifDevanagari text-lg sm:text-xl font-bold text-white">
              नोंदणीकृत अधिकृत सदस्य यादी
            </h2>
          </div>
        </div>

        {/* Total Count Badge & Manual Live Refresh */}
        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <div className="bg-white/10 backdrop-blur-xs px-3.5 py-1.5 rounded-xl border border-white/20 text-xs font-semibold flex items-center gap-2">
            <span className="text-slate-200">एकूण मंजूर सदस्य:</span>
            <span className="bg-[#efb24b] text-[#102a43] font-bold font-mono px-2 py-0.5 rounded-md text-xs">
              {allRegisteredMembers.length}
            </span>
          </div>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            title="एडमिन पॅनेल मधील ताजी मंजूर आकडेवारी लोड करा"
            className="bg-[#df6b16] hover:bg-[#c85a0d] active:scale-95 transition-all text-white px-3 py-1.5 rounded-xl border border-orange-300/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'रिफ्रेश होत आहे...' : 'रिअल-टाईम रिफ्रेश'}</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar (100% In-Memory - 0 Extra Firebase Reads) */}
      <div className="p-3.5 sm:p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="सदस्य नाव, सदस्य क्र. किंवा तालुक्याने शोधा..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16] transition-colors"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* District Filter Dropdown */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative w-full sm:w-48">
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#df6b16] appearance-none cursor-pointer"
            >
              <option value="">सर्व जिल्हे ({allRegisteredMembers.length})</option>
              {MAHARASHTRA_DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Medium Size Scrollable Frame (~10 rows visible at a time) */}
      {/* Visible Vertical Scrollbar on Right Side, Smooth Touch-Scroll on Mobile */}
      <div
        tabIndex={0}
        aria-label="नोंदणीकृत सदस्य यादी स्क्रोल करा"
        className="max-h-[440px] overflow-y-scroll overflow-x-auto relative bg-white focus:outline-none focus:ring-1 focus:ring-[#df6b16]/30 touch-pan-y"
        style={{
          scrollbarGutter: 'stable',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <table className="w-full text-left border-collapse min-w-[620px]">
          {/* Sticky Header */}
          <thead className="sticky top-0 z-10 bg-[#193568] text-white shadow-xs">
            <tr className="border-b border-[#efb24b]/40 text-xs uppercase tracking-wider font-bold">
              <th scope="col" className="py-3 px-3 text-center w-16 bg-[#193568]">
                अनु. क्र.
              </th>
              <th scope="col" className="py-3 px-4 w-44 bg-[#193568]">
                सदस्य क्रमांक
              </th>
              <th scope="col" className="py-3 px-4 bg-[#193568]">
                सदस्य नाव
              </th>
              <th scope="col" className="py-3 px-3 w-32 bg-[#193568]">
                तालुका
              </th>
              <th scope="col" className="py-3 px-4 w-36 bg-[#193568]">
                जिल्हा
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
            {filteredMembers.length > 0 ? (
              filteredMembers.map((member, idx) => (
                <tr
                  key={member.id || member.memberNumber}
                  className={`transition-colors hover:bg-amber-50/60 ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'
                  }`}
                >
                  {/* Column 1: अनु. क्रमांक (1 पासून पुढे) */}
                  <td className="py-2.5 px-3 text-center font-bold text-slate-700">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-[#193568] font-mono text-xs border border-slate-200">
                      {member.srNo}
                    </span>
                  </td>

                  {/* Column 2: सदस्य क्रमांक */}
                  <td className="py-2.5 px-4 font-mono font-bold text-[#193568]">
                    <span className="bg-blue-50/80 text-[#193568] px-2.5 py-1 rounded-md border border-blue-200/70 inline-block tracking-tight text-[11px] sm:text-xs">
                      {member.memberNumber}
                    </span>
                  </td>

                  {/* Column 3: सदस्य नाव व पद (स्टार विरहित) */}
                  <td className="py-2.5 px-4 font-medium text-slate-900">
                    <div className="font-serifDevanagari font-bold text-[13px] text-slate-900 leading-tight">
                      {member.fullName}
                    </div>
                    {member.designation && (
                      <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
                        {member.designation}
                      </span>
                    )}
                  </td>

                  {/* Column 4: तालुका व केंद्र */}
                  <td className="py-2.5 px-3 text-slate-700">
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{member.taluka || '-'}</span>
                    </span>
                    {member.centerName && (
                      <span className="text-[10px] text-indigo-700 font-bold block mt-0.5">
                        केंद्राचे नाव: {member.centerName}
                      </span>
                    )}
                  </td>

                  {/* Column 5: जिल्हा */}
                  <td className="py-2.5 px-4 font-semibold text-slate-800">
                    <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-700">
                      {member.district || '-'}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-500 text-xs">
                  <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-bold text-slate-700 text-sm">
                    {searchTerm || selectedDistrict
                      ? 'शोध निकषांनुसार कोणताही सदस्य आढळला नाही'
                      : 'नोंदणीकृत सदस्य यादी तपासली जात आहे...'}
                  </p>
                  <p className="text-slate-500 mt-1 max-w-sm mx-auto">
                    {searchTerm || selectedDistrict
                      ? 'कृपया शोध शब्द किंवा जिल्हा फिल्टर बदलून पुन्हा प्रयत्न करा.'
                      : 'कृपया अर्जाची स्थिती तपासा किंवा काही वेळाने पुन्हा पहा.'}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Frame Footer with User Guidance */}
      <div className="bg-slate-100/80 px-4 py-2.5 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-600">
        <div className="flex items-center gap-1.5 font-medium text-[#193568]">
          <span className="text-base">👆</span>
          <span>
            <strong>उजव्या बाजूला उभा स्क्रोल बार</strong> वर क्लिक करून आणि <strong>मोबाईलवर बोटाने वर सरकवून</strong> संपूर्ण यादी पाहता येईल.
          </span>
        </div>
        <div className="font-semibold text-slate-500 shrink-0">
          दाखवले: <strong>{filteredMembers.length}</strong> / एकूण मंजूर: <strong>{allRegisteredMembers.length}</strong>
        </div>
      </div>
    </div>
  );
};

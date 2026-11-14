import React, { useState, useMemo, useEffect } from 'react';
import { Search, Users, Filter, MapPin, RefreshCw } from 'lucide-react';
import { MembershipApplication, MAHARASHTRA_DISTRICTS, formatSequentialMemberNumber } from '../data/mahasanghData';
import { DISTRICT_TALUKAS_MAP } from '../data/rkMaharashtraData';
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
  const [selectedTaluka, setSelectedTaluka] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [localLiveApps, setLocalLiveApps] = useState<MembershipApplication[] | null>(null);

  // Always sync with propApplications when provided by parent
  useEffect(() => {
    if (Array.isArray(propApplications)) {
      setLocalLiveApps(propApplications);
    }
  }, [propApplications]);

  // Initial mount: load approved members using Smart Cache (0 reads if valid cache exists)
  useEffect(() => {
    let isMounted = true;
    const loadFirebaseApps = async () => {
      try {
        const fresh = await fetchApprovedMembersCached(false);
        if (isMounted && Array.isArray(fresh)) {
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
      if (Array.isArray(fresh)) {
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

  // Available talukas dynamically populated based on selectedDistrict
  const availableTalukas = useMemo(() => {
    if (!selectedDistrict) return [];
    const trimmed = selectedDistrict.trim();
    let officialList: string[] = [];

    if (DISTRICT_TALUKAS_MAP[trimmed]) {
      officialList = DISTRICT_TALUKAS_MAP[trimmed];
    } else {
      const alt1 = trimmed.replace('शी', 'शि');
      const alt2 = trimmed.replace('शि', 'शी');
      if (DISTRICT_TALUKAS_MAP[alt1]) {
        officialList = DISTRICT_TALUKAS_MAP[alt1];
      } else if (DISTRICT_TALUKAS_MAP[alt2]) {
        officialList = DISTRICT_TALUKAS_MAP[alt2];
      } else {
        for (const [dKey, list] of Object.entries(DISTRICT_TALUKAS_MAP)) {
          if (dKey.includes(trimmed) || trimmed.includes(dKey)) {
            officialList = list;
            break;
          }
        }
      }
    }

    // Merge official talukas with any distinct talukas recorded for members in this district
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const t of officialList) {
      const clean = t.trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        merged.push(clean);
      }
    }
    for (const m of allRegisteredMembers) {
      if (m.district === selectedDistrict && m.taluka && m.taluka !== '-') {
        const clean = m.taluka.trim();
        if (clean && !seen.has(clean.toLowerCase())) {
          seen.add(clean.toLowerCase());
          merged.push(clean);
        }
      }
    }
    return merged;
  }, [selectedDistrict, allRegisteredMembers]);

  // Client-side filtering (0 Firebase reads)
  const filteredMembers = useMemo(() => {
    let result = allRegisteredMembers;

    if (selectedDistrict) {
      result = result.filter((m) => m.district === selectedDistrict);
    }

    if (selectedDistrict && selectedTaluka) {
      const targetTaluka = selectedTaluka.trim().toLowerCase();
      result = result.filter((m) => (m.taluka || '').trim().toLowerCase() === targetTaluka);
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
  }, [allRegisteredMembers, selectedDistrict, selectedTaluka, searchTerm]);

  return (
    <div className="bg-white rounded-md border border-slate-300 overflow-hidden mb-8">
      {/* Institutional Header Bar */}
      <div className="bg-[#193568] text-white px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b-2 border-[#efb24b]">
        <div className="flex items-center gap-2.5">
          <Users className="w-5 h-5 text-[#efb24b] shrink-0" />
          <div>
            <h2 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-white leading-snug">
              नोंदणीकृत अधिकृत सदस्य यादी
            </h2>
          </div>
        </div>

        {/* Total Count Metadata & Manual Refresh */}
        <div className="flex items-center gap-3 self-start md:self-auto text-xs sm:text-sm">
          <div className="text-slate-100 font-medium tabular-nums">
            एकूण मंजूर सदस्य:{' '}
            <strong className="text-[#efb24b] font-mono text-base font-bold">
              {allRegisteredMembers.length}
            </strong>
          </div>
          <span className="text-white/30" aria-hidden="true">|</span>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            title="ताजी मंजूर आकडेवारी लोड करा"
            className="bg-white/10 hover:bg-white/20 transition-colors text-white px-3 py-1.5 rounded border border-white/25 text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'अद्ययावत होत आहे...' : 'यादी ताजी करा'}</span>
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
            className="w-full text-sm pl-9 pr-8 py-2 bg-white border border-slate-300 rounded focus:outline-none focus:border-[#193568] transition-colors"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
              aria-label="शोध रिकामा करा"
            >
              ✕
            </button>
          )}
        </div>

        {/* District & Dependent Taluka Filter Dropdowns */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <div className="relative w-full sm:w-48">
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              aria-label="जिल्हा निवडा"
              value={selectedDistrict}
              onChange={(e) => {
                setSelectedDistrict(e.target.value);
                setSelectedTaluka('');
              }}
              className="w-full text-sm pl-8 pr-3 py-2 bg-white border border-slate-300 rounded focus:outline-none focus:border-[#193568] appearance-none cursor-pointer"
            >
              <option value="">सर्व जिल्हे ({allRegisteredMembers.length})</option>
              {MAHARASHTRA_DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="relative w-full sm:w-52">
            <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              aria-label="तालुका निवडा"
              value={selectedTaluka}
              disabled={!selectedDistrict}
              onChange={(e) => setSelectedTaluka(e.target.value)}
              className={`w-full text-sm pl-8 pr-3 py-2 border rounded focus:outline-none focus:border-[#193568] appearance-none transition-colors ${
                selectedDistrict
                  ? 'bg-white border-slate-300 text-slate-800 cursor-pointer'
                  : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <option value="">
                {selectedDistrict ? 'सर्व तालुके (संपूर्ण जिल्हा)' : 'तालुका (आधी जिल्हा निवडा)'}
              </option>
              {availableTalukas.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Visible Vertical & Horizontal Scrollbars, Smooth 2D Touch-Scroll on Mobile */}
      {filteredMembers.length > 0 ? (
        <div
          tabIndex={0}
          aria-label="नोंदणीकृत सदस्य यादी उभी व आडवी स्क्रोल करा"
          className="max-h-[440px] overflow-x-scroll overflow-y-scroll relative bg-white focus:outline-none focus:ring-1 focus:ring-[#193568]/30 touch-auto"
          style={{
            scrollbarGutter: 'stable',
            touchAction: 'pan-x pan-y',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          <table className="w-full text-left border-collapse min-w-[680px]">
            {/* Sticky Header */}
            <thead className="sticky top-0 z-10 bg-slate-100 text-[#193568] border-b border-slate-300">
              <tr className="text-sm font-bold">
                <th scope="col" className="py-2.5 px-3 text-center w-20 bg-slate-100 border-r border-slate-200">
                  अनु. क्र.
                </th>
                <th scope="col" className="py-2.5 px-4 w-48 bg-slate-100 border-r border-slate-200">
                  सदस्य क्रमांक
                </th>
                <th scope="col" className="py-2.5 px-4 bg-slate-100 border-r border-slate-200">
                  सदस्य नाव व पद
                </th>
                <th scope="col" className="py-2.5 px-3 w-40 bg-slate-100 border-r border-slate-200">
                  तालुका / केंद्र
                </th>
                <th scope="col" className="py-2.5 px-4 w-36 bg-slate-100">
                  जिल्हा
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm text-slate-800">
              {filteredMembers.map((member, idx) => (
                <tr
                  key={member.id || member.memberNumber}
                  className={`transition-colors hover:bg-slate-50 ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                  }`}
                >
                  {/* Column 1: अनु. क्रमांक */}
                  <td className="py-2.5 px-3 text-center font-mono tabular-nums font-semibold text-slate-600 border-r border-slate-100">
                    {member.srNo}
                  </td>

                  {/* Column 2: सदस्य क्रमांक */}
                  <td className="py-2.5 px-4 font-mono tabular-nums font-bold text-[#193568] border-r border-slate-100">
                    {member.memberNumber}
                  </td>

                  {/* Column 3: सदस्य नाव व पद */}
                  <td className="py-2.5 px-4 font-medium text-slate-900 border-r border-slate-100">
                    <div className="font-serifDevanagari font-bold text-sm sm:text-base text-slate-900 leading-tight">
                      {member.fullName}
                    </div>
                    {member.designation && (
                      <span className="text-xs sm:text-sm text-slate-500 font-medium block mt-0.5">
                        {member.designation}
                      </span>
                    )}
                  </td>

                  {/* Column 4: तालुका व केंद्र */}
                  <td className="py-2.5 px-3 text-slate-700 border-r border-slate-100">
                    <span className="font-semibold text-slate-800">
                      {member.taluka || '-'}
                    </span>
                    {member.centerName && (
                      <span className="text-xs sm:text-sm text-slate-600 block mt-0.5">
                        केंद्र: {member.centerName}
                      </span>
                    )}
                  </td>

                  {/* Column 5: जिल्हा */}
                  <td className="py-2.5 px-4 font-medium text-slate-800">
                    {member.district || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-12 px-4 text-center text-slate-500 text-sm bg-white">
          <Users className="w-7 h-7 text-slate-300 mx-auto mb-2" />
          <p className="font-bold text-slate-700 text-base">
            {searchTerm || selectedDistrict || selectedTaluka
              ? 'शोध निकषांनुसार कोणताही सदस्य आढळला नाही'
              : 'नोंदणीकृत सदस्य यादी तपासली जात आहे...'}
          </p>
          <p className="text-slate-500 mt-1 max-w-sm mx-auto">
            {searchTerm || selectedDistrict || selectedTaluka
              ? 'कृपया शोध शब्द, जिल्हा किंवा तालुका फिल्टर बदलून पुन्हा प्रयत्न करा.'
              : 'कृपया अर्जाची स्थिती तपासा किंवा काही वेळाने पुन्हा पहा.'}
          </p>
        </div>
      )}

      {/* Frame Footer with Clean Guidance */}
      <div className="bg-slate-50 px-4 py-2.5 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs sm:text-sm text-slate-600">
        <div className="font-medium text-slate-600">
          टीप: उभी व आडवी स्क्रोल बार वापरून (किंवा मोबाईलवर स्क्रीन डावी-उजवी सरकवून) संपूर्ण तपशील पाहता येईल.
        </div>
        <div className="font-semibold text-slate-700 tabular-nums shrink-0">
          दाखवले: <strong>{filteredMembers.length}</strong> / एकूण मंजूर: <strong>{allRegisteredMembers.length}</strong>
        </div>
      </div>
    </div>
  );
};

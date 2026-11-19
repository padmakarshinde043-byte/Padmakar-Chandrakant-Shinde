import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
  Send,
  Building2,
  Check,
} from 'lucide-react';
import { DISTRICT_TALUKAS_MAP } from '../data/rkMaharashtraData';
import { MembershipApplication } from '../data/mahasanghData';
import {
  MISSING_TALUKA_SENTINEL,
  MissingCenterMember,
  filterMissingCenterMembers,
  getDistrictsWithMissingCenters,
  getTalukasForDistrict,
  getMembersForDistrictAndTaluka,
} from '../utils/centerUpdateHelper';
import { formatMemberDisplayName } from '../utils/memberGender';
import { toEnglishDigits } from '../utils/formatters';
import {
  fetchApprovedMembersCached,
  invalidateApprovedMembersClientCache,
  safeStorageGet,
  safeCacheApplications,
} from '../firebase';
import { invalidateOfficialsClientCache } from '../services/rkFirebaseService';

interface CenterUpdatePageProps {
  onGoHome: () => void;
}

interface CompletedUpdateReceipt {
  memberName: string;
  memberNumber: string;
  district: string;
  taluka: string;
  centerName: string;
  professional: string;
}

function getKnownTalukasForDistrict(district: string): string[] {
  if (!district) return [];
  const trimmed = district.trim();
  if (DISTRICT_TALUKAS_MAP[trimmed]) return DISTRICT_TALUKAS_MAP[trimmed];
  const alt1 = trimmed.replace('शी', 'शि');
  if (DISTRICT_TALUKAS_MAP[alt1]) return DISTRICT_TALUKAS_MAP[alt1];
  const alt2 = trimmed.replace('शि', 'शी');
  if (DISTRICT_TALUKAS_MAP[alt2]) return DISTRICT_TALUKAS_MAP[alt2];
  for (const [key, list] of Object.entries(DISTRICT_TALUKAS_MAP)) {
    if (key.includes(trimmed) || trimmed.includes(key)) return list;
  }
  return [];
}

export const CenterUpdatePage: React.FC<CenterUpdatePageProps> = ({ onGoHome }) => {
  const [members, setMembers] = useState<MissingCenterMember[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');
  const [usingLocalMode, setUsingLocalMode] = useState<boolean>(false);

  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [selectedTaluka, setSelectedTaluka] = useState<string>('');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [manualTaluka, setManualTaluka] = useState<string>('');
  const [centerNameInput, setCenterNameInput] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>('');
  const [receipt, setReceipt] = useState<CompletedUpdateReceipt | null>(null);

  const loadMissingCenterMembers = async (bypassCache = false) => {
    setIsLoading(true);
    setLoadError('');
    try {
      const url = bypassCache
        ? '/api/db/applications/missing-center?refresh=1'
        : '/api/db/applications/missing-center';
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.mysqlActive !== false && Array.isArray(data?.items)) {
        setUsingLocalMode(false);
        setMembers(filterMissingCenterMembers(data.items));
        return;
      }

      // Local / preview fallback when MySQL is not active
      setUsingLocalMode(true);
      let localList: MembershipApplication[] = [];
      try {
        const saved = safeStorageGet('mahasangh_applications');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) localList = parsed;
        }
      } catch {
        // ignore parse errors
      }
      if (localList.length === 0) {
        try {
          const approved = await fetchApprovedMembersCached(bypassCache);
          if (Array.isArray(approved)) localList = approved;
        } catch {
          // ignore
        }
      }
      setMembers(filterMissingCenterMembers(localList));
    } catch (err: any) {
      setLoadError(
        err?.message || 'सदस्यांची यादी लोड करताना तांत्रिक अडचण आली. कृपया पुन्हा प्रयत्न करा.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMissingCenterMembers(true);
  }, []);

  const districtOptions = useMemo(() => getDistrictsWithMissingCenters(members), [members]);

  const talukaOptions = useMemo(
    () => getTalukasForDistrict(members, selectedDistrict),
    [members, selectedDistrict]
  );

  const memberOptions = useMemo(
    () => getMembersForDistrictAndTaluka(members, selectedDistrict, selectedTaluka),
    [members, selectedDistrict, selectedTaluka]
  );

  const selectedMember = useMemo(
    () => memberOptions.find((m) => m.id === selectedMemberId) || null,
    [memberOptions, selectedMemberId]
  );

  const knownTalukasForManualFill = useMemo(
    () => getKnownTalukasForDistrict(selectedDistrict),
    [selectedDistrict]
  );

  const handleDistrictChange = (val: string) => {
    setSelectedDistrict(val);
    setSelectedTaluka('');
    setSelectedMemberId('');
    setManualTaluka('');
    setSubmitError('');
  };

  const handleTalukaChange = (val: string) => {
    setSelectedTaluka(val);
    setSelectedMemberId('');
    setManualTaluka('');
    setSubmitError('');
  };

  const handleMemberChange = (val: string) => {
    setSelectedMemberId(val);
    setSubmitError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitError('');

    if (!selectedDistrict) {
      setSubmitError('कृपया आपला जिल्हा निवडा.');
      return;
    }
    if (!selectedTaluka) {
      setSubmitError('कृपया आपला तालुका निवडा.');
      return;
    }
    if (!selectedMember) {
      setSubmitError('कृपया यादीतून आपले नाव निवडा.');
      return;
    }

    const needsManualTaluka = selectedTaluka === MISSING_TALUKA_SENTINEL;
    const resolvedTaluka = needsManualTaluka ? manualTaluka.trim() : selectedMember.taluka;
    if (needsManualTaluka && !resolvedTaluka) {
      setSubmitError('कृपया आपला योग्य तालुका निवडा.');
      return;
    }

    const cleanCenter = centerNameInput.replace(/\s+/g, ' ').trim();
    if (cleanCenter.length < 2) {
      setSubmitError('कृपया कार्यरत केंद्राचे अचूक नाव प्रविष्ट करा (किमान २ अक्षरे).');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/db/applications/submit-center-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedMember.id,
          centerName: cleanCenter,
          taluka: needsManualTaluka ? resolvedTaluka : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.status === 'success') {
        syncLocalCacheAfterUpdate(selectedMember.id, cleanCenter, resolvedTaluka);
        finalizeReceipt(selectedMember, cleanCenter, resolvedTaluka);
        return;
      }

      if (data?.status === 'fallback_local' || usingLocalMode) {
        syncLocalCacheAfterUpdate(selectedMember.id, cleanCenter, resolvedTaluka);
        finalizeReceipt(selectedMember, cleanCenter, resolvedTaluka);
        return;
      }

      if (res.status === 409) {
        setSubmitError(
          data?.message ||
            'या सदस्याचे कार्यरत केंद्र आधीच नोंदवले गेले आहे (One-Time अपडेट पूर्ण झाले आहे).'
        );
        // Remove already-updated member from local list
        setMembers((prev) => prev.filter((m) => m.id !== selectedMember.id));
        setSelectedMemberId('');
        return;
      }

      setSubmitError(
        data?.message || 'माहिती सेव्ह करताना अडचण आली. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा.'
      );
    } catch (err: any) {
      setSubmitError(
        err?.message || 'इंटरनेट कनेक्शन तपासा आणि पुन्हा सबमिट करा.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const syncLocalCacheAfterUpdate = (id: string, centerName: string, taluka: string) => {
    invalidateApprovedMembersClientCache();
    invalidateOfficialsClientCache();
    try {
      const saved = safeStorageGet('mahasangh_applications');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const next = parsed.map((app: MembershipApplication) =>
            app.id === id
              ? {
                  ...app,
                  centerName,
                  taluka: app.taluka || taluka,
                }
              : app
          );
          safeCacheApplications(next);
          window.dispatchEvent(new CustomEvent('mahasangh_apps_updated', { detail: next }));
        }
      }
    } catch {
      // ignore local storage sync failure
    }
  };

  const finalizeReceipt = (
    member: MissingCenterMember,
    centerName: string,
    taluka: string
  ) => {
    const memberName = formatMemberDisplayName(member.salutation, member.fullName);
    setReceipt({
      memberName,
      memberNumber: member.memberNumber || member.applicationNumber || '-',
      district: member.district,
      taluka: taluka || '-',
      centerName,
      professional: member.professional || 'केंद्रप्रमुख',
    });

    // Immediately remove this member from the one-time dropdown list
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
    setSelectedMemberId('');
    setCenterNameInput('');
    setManualTaluka('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResetForAnotherMember = () => {
    setReceipt(null);
    setSubmitError('');
    setSelectedMemberId('');
    setCenterNameInput('');
    setManualTaluka('');
    // If no members left in current taluka/district, reset those dropdowns cleanly
    const stillInTaluka = getMembersForDistrictAndTaluka(members, selectedDistrict, selectedTaluka);
    if (stillInTaluka.length === 0) {
      setSelectedTaluka('');
      const stillInDist = getTalukasForDistrict(members, selectedDistrict);
      if (stillInDist.length === 0) {
        setSelectedDistrict('');
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fbf8f2] text-[#102a43]">
      {/* Clean Institutional Top Bar */}
      <header className="bg-[#193568] text-white border-b-2 border-[#efb24b]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/logo.png"
              alt="महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ"
              referrerPolicy="no-referrer"
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white p-0.5 object-contain shrink-0"
            />
            <span className="font-serifDevanagari font-bold text-base sm:text-lg leading-snug truncate">
              महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ
            </span>
          </div>

          <button
            type="button"
            onClick={onGoHome}
            className="text-xs sm:text-sm font-semibold text-amber-200 hover:text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer py-2 px-2.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>मुख्य वेबसाईट</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Editorial Heading Section */}
        <div className="mb-7 space-y-2.5">
          <p className="text-xs font-bold tracking-wide text-[#9a460b]">
            अधिकृत One-Time माहिती अद्ययावत सुविधा
          </p>
          <h1 className="font-serifDevanagari text-2xl sm:text-3xl font-bold text-[#0b1e36] leading-tight text-balance">
            कार्यरत केंद्राचे नाव अद्ययावत करा
          </h1>
          <p className="text-sm sm:text-[15px] text-slate-600 leading-relaxed">
            सुरुवातीच्या सदस्यत्व अर्जात ज्या सदस्यांचे <strong>कार्यरत केंद्र</strong> नोंदवायचे राहिले आहे, फक्त त्यांचीच नावे खालील यादीत दिसतील. आपला जिल्हा, तालुका व नाव निवडून केंद्राचे नाव सबमिट केल्यावर ते आपल्या अधिकृत नोंदीत आपोआप जोडले जाईल.
          </p>

          {!isLoading && !loadError && (
            <div className="pt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-slate-500 font-medium tabular-nums">
              <span>अद्ययावत बाकी सदस्य: <strong className="text-[#0b1e36]">{toEnglishDigits(members.length)}</strong></span>
              <span aria-hidden="true">·</span>
              <span>जिल्हे: <strong className="text-[#0b1e36]">{toEnglishDigits(districtOptions.length)}</strong></span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => loadMissingCenterMembers(true)}
                className="text-[#193568] hover:underline font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>यादी ताजी करा</span>
              </button>
            </div>
          )}
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="bg-white border border-[#e7ded1] rounded-xl p-10 text-center space-y-3">
            <div className="w-8 h-8 rounded-full border-[3px] border-amber-500/30 border-t-[#193568] animate-spin mx-auto" />
            <p className="text-sm font-semibold text-slate-700">
              केंद्राचे नाव बाकी असलेल्या सदस्यांची यादी लोड होत आहे...
            </p>
          </div>
        ) : loadError ? (
          /* Error State */
          <div className="bg-white border border-rose-200 rounded-xl p-6 sm:p-8 space-y-4">
            <div className="flex items-start gap-3 text-rose-800">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
              <div className="space-y-1">
                <h2 className="font-bold text-base">माहिती लोड करता आली नाही</h2>
                <p className="text-sm text-rose-700 leading-relaxed">{loadError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => loadMissingCenterMembers(true)}
              className="min-h-[44px] bg-[#193568] hover:bg-[#0b1e36] text-white font-semibold text-sm px-5 py-2.5 rounded-lg inline-flex items-center gap-2 cursor-pointer transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>पुन्हा प्रयत्न करा</span>
            </button>
          </div>
        ) : receipt ? (
          /* One-Time Completion Receipt */
          <section className="bg-white border border-[#e7ded1] rounded-xl p-6 sm:p-8 space-y-6">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-emerald-700" />
              </div>
              <div className="space-y-1">
                <h2 className="font-serifDevanagari text-xl sm:text-2xl font-bold text-emerald-900">
                  कार्यरत केंद्र यशस्वीरीत्या अद्ययावत झाले!
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  आपली माहिती आपल्या अधिकृत सदस्यत्व नोंदीमध्ये आपोआप जतन करण्यात आली आहे. ही One-Time प्रक्रिया पूर्ण झाल्यामुळे आपले नाव आता यादीतून वगळले गेले आहे.
                </p>
              </div>
            </div>

            <dl className="border-t border-b border-slate-200 divide-y divide-slate-100 text-sm">
              <div className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1">
                <dt className="text-slate-500">सदस्याचे नाव</dt>
                <dd className="font-bold text-[#0b1e36]">{receipt.memberName}</dd>
              </div>
              <div className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1">
                <dt className="text-slate-500">सदस्य क्रमांक</dt>
                <dd className="font-mono font-bold text-[#193568] tabular-nums">
                  {toEnglishDigits(receipt.memberNumber)}
                </dd>
              </div>
              <div className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1">
                <dt className="text-slate-500">पद / संवर्ग</dt>
                <dd className="font-semibold text-slate-800">{receipt.professional}</dd>
              </div>
              <div className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1">
                <dt className="text-slate-500">जिल्हा व तालुका</dt>
                <dd className="font-semibold text-slate-800">
                  {receipt.district}
                  {receipt.taluka && receipt.taluka !== '-' ? ` · ता. ${receipt.taluka}` : ''}
                </dd>
              </div>
              <div className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1">
                <dt className="text-slate-500">नोंदवलेले कार्यरत केंद्र</dt>
                <dd className="font-bold text-emerald-800">{receipt.centerName}</dd>
              </div>
            </dl>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
              {members.length > 0 && (
                <button
                  type="button"
                  onClick={handleResetForAnotherMember}
                  className="min-h-[46px] flex-1 bg-[#193568] hover:bg-[#0b1e36] text-white font-bold text-sm px-5 py-2.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  दुसऱ्या सदस्याचे केंद्र अपडेट करा
                </button>
              )}
              <button
                type="button"
                onClick={onGoHome}
                className="min-h-[46px] bg-white hover:bg-slate-50 text-[#193568] border border-slate-300 font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                मुख्य वेबसाईटवर जा
              </button>
            </div>
          </section>
        ) : members.length === 0 ? (
          /* All Members Already Updated State */
          <section className="bg-white border border-[#e7ded1] rounded-xl p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 text-emerald-700" />
            </div>
            <div className="space-y-1.5">
              <h2 className="font-serifDevanagari text-xl font-bold text-[#0b1e36]">
                सर्व सदस्यांची कार्यरत केंद्राची माहिती पूर्ण झाली आहे
              </h2>
              <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                सध्या कोणत्याही सदस्याचे कार्यरत केंद्र अद्ययावत करणे बाकी नाही. या सहकार्याबद्दल मनःपूर्वक धन्यवाद!
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={onGoHome}
                className="min-h-[44px] bg-[#193568] hover:bg-[#0b1e36] text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors cursor-pointer"
              >
                मुख्य वेबसाईटवर जा
              </button>
            </div>
          </section>
        ) : (
          /* Main 4-Step One-Time Update Form */
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-[#e7ded1] rounded-xl p-5 sm:p-8 space-y-6"
          >
            {submitError && (
              <div
                role="alert"
                className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Step 1: जिल्हा निवडा */}
            <div className="space-y-1.5">
              <label
                htmlFor="cu-district"
                className="block text-sm font-bold text-[#0b1e36]"
              >
                १. जिल्हा निवडा <span className="text-[#df6b16]">*</span>
              </label>
              <select
                id="cu-district"
                value={selectedDistrict}
                onChange={(e) => handleDistrictChange(e.target.value)}
                required
                className="w-full min-h-[46px] px-3.5 py-2.5 text-base sm:text-sm bg-white border border-slate-300 rounded-lg text-[#0b1e36] font-medium focus:outline-none focus:border-[#193568] focus:ring-2 focus:ring-[#193568]/15"
              >
                <option value="">-- जिल्हा निवडा --</option>
                {districtOptions.map((opt) => (
                  <option key={opt.district} value={opt.district}>
                    {opt.district} ({toEnglishDigits(opt.count)} शिल्लक)
                  </option>
                ))}
              </select>
            </div>

            {/* Step 2: तालुका निवडा */}
            <div className="space-y-1.5">
              <label
                htmlFor="cu-taluka"
                className="block text-sm font-bold text-[#0b1e36]"
              >
                २. तालुका निवडा <span className="text-[#df6b16]">*</span>
              </label>
              <select
                id="cu-taluka"
                value={selectedTaluka}
                onChange={(e) => handleTalukaChange(e.target.value)}
                disabled={!selectedDistrict}
                required
                className="w-full min-h-[46px] px-3.5 py-2.5 text-base sm:text-sm bg-white border border-slate-300 rounded-lg text-[#0b1e36] font-medium disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:border-[#193568] focus:ring-2 focus:ring-[#193568]/15"
              >
                <option value="">
                  {selectedDistrict ? '-- तालुका निवडा --' : '-- आधी जिल्हा निवडा --'}
                </option>
                {talukaOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} ({toEnglishDigits(opt.count)})
                  </option>
                ))}
              </select>
            </div>

            {/* Step 3: नाव निवडा */}
            <div className="space-y-1.5">
              <label
                htmlFor="cu-member"
                className="block text-sm font-bold text-[#0b1e36]"
              >
                ३. आपले नाव निवडा <span className="text-[#df6b16]">*</span>
              </label>
              <select
                id="cu-member"
                value={selectedMemberId}
                onChange={(e) => handleMemberChange(e.target.value)}
                disabled={!selectedTaluka}
                required
                className="w-full min-h-[46px] px-3.5 py-2.5 text-base sm:text-sm bg-white border border-slate-300 rounded-lg text-[#0b1e36] font-medium disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:border-[#193568] focus:ring-2 focus:ring-[#193568]/15"
              >
                <option value="">
                  {selectedTaluka ? '-- यादीतून आपले नाव निवडा --' : '-- आधी तालुका निवडा --'}
                </option>
                {memberOptions.map((m) => {
                  const displayName = formatMemberDisplayName(m.salutation, m.fullName);
                  const idSuffix = m.memberNumber
                    ? ` (${toEnglishDigits(m.memberNumber)})`
                    : '';
                  return (
                    <option key={m.id} value={m.id}>
                      {displayName}
                      {idSuffix}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Selected Member Clean Verification Summary */}
            {selectedMember && (
              <div className="bg-[#fbf8f2] border border-[#e7ded1] rounded-lg px-4 py-3.5 space-y-1">
                <div className="text-sm font-bold text-[#0b1e36]">
                  {formatMemberDisplayName(selectedMember.salutation, selectedMember.fullName)}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 tabular-nums">
                  {selectedMember.memberNumber && (
                    <>
                      <span className="font-mono font-semibold text-[#193568]">
                        {toEnglishDigits(selectedMember.memberNumber)}
                      </span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <span>{selectedMember.professional}</span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedMember.district}</span>
                  {selectedMember.taluka && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>ता. {selectedMember.taluka}</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* If an old record also missed taluka, allow picking real taluka before saving */}
            {selectedMember && selectedTaluka === MISSING_TALUKA_SENTINEL && (
              <div className="space-y-1.5">
                <label
                  htmlFor="cu-manual-taluka"
                  className="block text-sm font-bold text-[#0b1e36]"
                >
                  आपला योग्य तालुका निवडा <span className="text-[#df6b16]">*</span>
                </label>
                {knownTalukasForManualFill.length > 0 ? (
                  <select
                    id="cu-manual-taluka"
                    value={manualTaluka}
                    onChange={(e) => setManualTaluka(e.target.value)}
                    required
                    className="w-full min-h-[46px] px-3.5 py-2.5 text-base sm:text-sm bg-white border border-slate-300 rounded-lg text-[#0b1e36] font-medium focus:outline-none focus:border-[#193568] focus:ring-2 focus:ring-[#193568]/15"
                  >
                    <option value="">-- तालुका निवडा --</option>
                    {knownTalukasForManualFill.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="cu-manual-taluka"
                    type="text"
                    value={manualTaluka}
                    onChange={(e) => setManualTaluka(e.target.value)}
                    placeholder="आपल्या तालुक्याचे नाव लिहा"
                    required
                    className="w-full min-h-[46px] px-3.5 py-2.5 text-base sm:text-sm bg-white border border-slate-300 rounded-lg text-[#0b1e36] font-medium focus:outline-none focus:border-[#193568] focus:ring-2 focus:ring-[#193568]/15"
                  />
                )}
              </div>
            )}

            {/* Step 4: कार्यरत केंद्राचे नाव लिहा */}
            <div className="space-y-1.5">
              <label
                htmlFor="cu-center-name"
                className="block text-sm font-bold text-[#0b1e36]"
              >
                ४. कार्यरत केंद्राचे नाव लिहा <span className="text-[#df6b16]">*</span>
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="cu-center-name"
                  type="text"
                  value={centerNameInput}
                  onChange={(e) => setCenterNameInput(e.target.value)}
                  disabled={!selectedMember}
                  maxLength={160}
                  required
                  className="w-full min-h-[46px] pl-10 pr-3.5 py-2.5 text-base sm:text-sm bg-white border border-slate-300 rounded-lg text-[#0b1e36] font-medium disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:border-[#193568] focus:ring-2 focus:ring-[#193568]/15"
                />
              </div>
              <p className="text-xs text-slate-500">
                कृपया आपल्या कार्यरत केंद्राचे अचूक नाव मराठीत लिहा. सबमिट केल्यावर ही माहिती थेट आपल्या सदस्यत्व नोंदीत जोडली जाईल.
              </p>
            </div>

            {/* Submit Button */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="submit"
                disabled={isSubmitting || !selectedMember || !centerNameInput.trim()}
                className="w-full min-h-[48px] bg-[#df6b16] hover:bg-[#c55b0d] disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold text-sm sm:text-base px-6 py-3 rounded-lg inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                <span>
                  {isSubmitting ? 'माहिती जतन होत आहे...' : 'कार्यरत केंद्र सबमिट करा'}
                </span>
              </button>
            </div>
          </form>
        )}
      </main>

      {/* Quiet Institutional Footer */}
      <footer className="border-t border-[#e7ded1] py-5 px-4 text-center text-xs text-slate-500">
        महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ · नोंदणी क्र. महा/एनएसके/एन/2427
      </footer>
    </div>
  );
};

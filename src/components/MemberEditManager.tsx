import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Edit3,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X,
  Download,
  Image as ImageIcon,
  Upload,
  Wand2,
  ShieldAlert,
  Users,
  Check,
  Sparkles,
  Building2,
  Link2,
  Copy,
} from 'lucide-react';
import {
  MembershipApplication,
  MAHARASHTRA_DISTRICTS,
  OFFICIAL_CADRES,
  TEACHER_PROFESSIONAL_QUALIFICATIONS,
  formatSequentialMemberNumber,
  normalizeOfficialCadre,
} from '../data/mahasanghData';
import { DISTRICT_TALUKAS_MAP } from '../data/rkMaharashtraData';
import { formatDateWithEnglishDigits, toEnglishDigits, formatTimeOnly } from '../utils/formatters';
import { uploadCompressedPhotoToCloudinaryOrFallback } from '../utils/cloudinary';
import { generateMembershipIdCardPdf } from '../services/rkPdfGenerator';
import { syncMemberCounter, purgeDeletedAndGhostApplicationsInFirestore, fetchApplicationPhotosBatch, fetchSingleApplicationForAdmin } from '../firebase';
import { parseMemberNumberSeq } from '../utils/memberNumberAllocator';
import {
  deriveGenderFromSalutation,
  formatMemberDisplayName,
  isMissingSalutationOrGender,
  normalizeSalutation,
  resolveMemberGender,
} from '../utils/memberGender';
import {
  isMissingCenterName,
  buildCenterUpdateShareUrl,
  buildCenterUpdateShareMessage,
} from '../utils/centerUpdateHelper';

interface MemberEditManagerProps {
  applications: MembershipApplication[];
  onUpdateMember: (member: MembershipApplication) => Promise<void> | void;
  onDeleteApplication: (id: string) => Promise<void> | void;
  onFetchApplications?: (forceRefresh?: boolean) => Promise<void>;
  isLoadingApps?: boolean;
}

const OFFICIAL_POST_OPTIONS = [
  'जिल्हाध्यक्ष',
  'जिल्हा कार्याध्यक्ष',
  'जिल्हा सरचिटणीस',
  'जिल्हा उपाध्यक्ष',
  'जिल्हा सहचिटणीस',
  'जिल्हा प्रसिद्धीप्रमुख',
  'जिल्हा कोषाध्यक्ष',
  'जिल्हा सल्लागार',
  'जिल्हा संघटक',
  'तालुका अध्यक्ष',
  'तालुका सरचिटणीस',
  'तालुका उपाध्यक्ष',
  'तालुका प्रतिनिधी',
  'राज्य कार्यकारिणी सदस्य',
  'विभागीय समन्वयक',
];

export const MemberEditManager: React.FC<MemberEditManagerProps> = ({
  applications,
  onUpdateMember,
  onDeleteApplication,
  onFetchApplications,
  isLoadingApps,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<
    'all' | 'duplicates' | 'issue_0001' | 'missing_salutation' | 'missing_center' | 'approved'
  >('all');
  const [copiedShareMode, setCopiedShareMode] = useState<'url' | 'message' | null>(null);

  // Edit Modal State
  const [editingMember, setEditingMember] = useState<MembershipApplication | null>(null);
  const [seqInputForFormat, setSeqInputForFormat] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ text: string; type: 'success' | 'error'; member?: MembershipApplication } | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Safe Delete & Ghost Cleanup Modal State
  const [deletingMember, setDeletingMember] = useState<MembershipApplication | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPurgingGhosts, setIsPurgingGhosts] = useState(false);
  const [showPurgeConfirmModal, setShowPurgeConfirmModal] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);

  // Analyze duplicates & 0001 issues across all applications
  const duplicateAnalysis = useMemo(() => {
    const phoneCounts: Record<string, number> = {};
    const nameCounts: Record<string, number> = {};
    const memberNoCounts: Record<string, number> = {};

    applications.forEach((app) => {
      const cleanPhone = toEnglishDigits(app.phone || '').replace(/\D/g, '').slice(-10);
      if (cleanPhone.length === 10) {
        phoneCounts[cleanPhone] = (phoneCounts[cleanPhone] || 0) + 1;
      }

      const normName = (app.fullName || '').trim().replace(/\s+/g, ' ').toLowerCase();
      if (normName) {
        nameCounts[normName] = (nameCounts[normName] || 0) + 1;
      }

      const normMemberNo = toEnglishDigits(app.memberNumber || '').trim().toUpperCase();
      if (normMemberNo) {
        memberNoCounts[normMemberNo] = (memberNoCounts[normMemberNo] || 0) + 1;
      }
    });

    const isDuplicatePhone = (app: MembershipApplication) => {
      const cleanPhone = toEnglishDigits(app.phone || '').replace(/\D/g, '').slice(-10);
      return cleanPhone.length === 10 && (phoneCounts[cleanPhone] || 0) > 1;
    };

    const isDuplicateName = (app: MembershipApplication) => {
      const normName = (app.fullName || '').trim().replace(/\s+/g, ' ').toLowerCase();
      return Boolean(normName && (nameCounts[normName] || 0) > 1);
    };

    const isDuplicateMemberNo = (app: MembershipApplication) => {
      const normMemberNo = toEnglishDigits(app.memberNumber || '').trim().toUpperCase();
      return Boolean(normMemberNo && (memberNoCounts[normMemberNo] || 0) > 1);
    };

    const is0001Issue = (app: MembershipApplication) => {
      const memNo = toEnglishDigits(app.memberNumber || '').trim();
      if (app.status === 'approved' && !memNo) return true;
      if (memNo && (/\/0001$/i.test(memNo) || memNo === '0001')) return true;
      return isDuplicateMemberNo(app);
    };

    const duplicateCount = applications.filter(
      (a) => isDuplicatePhone(a) || isDuplicateName(a) || isDuplicateMemberNo(a)
    ).length;

    const issue0001Count = applications.filter((a) => is0001Issue(a)).length;
    const missingSalutationCount = applications.filter((a) => isMissingSalutationOrGender(a)).length;
    const missingCenterCount = applications.filter(
      (a) => a.status !== 'rejected' && isMissingCenterName(a.centerName)
    ).length;

    return {
      phoneCounts,
      nameCounts,
      memberNoCounts,
      isDuplicatePhone,
      isDuplicateName,
      isDuplicateMemberNo,
      is0001Issue,
      duplicateCount,
      issue0001Count,
      missingSalutationCount,
      missingCenterCount,
    };
  }, [applications]);

  // Filtered and searched list
  const filteredMembers = useMemo(() => {
    const q = toEnglishDigits(searchQuery.trim().toLowerCase());
    const qDigits = q.replace(/\D/g, '');

    let list = applications.filter((app) => {
      if (quickFilter === 'duplicates') {
        if (
          !duplicateAnalysis.isDuplicatePhone(app) &&
          !duplicateAnalysis.isDuplicateName(app) &&
          !duplicateAnalysis.isDuplicateMemberNo(app)
        ) {
          return false;
        }
      } else if (quickFilter === 'issue_0001') {
        if (!duplicateAnalysis.is0001Issue(app)) return false;
      } else if (quickFilter === 'missing_salutation') {
        if (!isMissingSalutationOrGender(app)) return false;
      } else if (quickFilter === 'missing_center') {
        if (app.status === 'rejected' || !isMissingCenterName(app.centerName)) return false;
      } else if (quickFilter === 'approved') {
        if (app.status !== 'approved') return false;
      }

      if (!q) return true;

      const nameMatch = (app.fullName || '').toLowerCase().includes(q);
      const phoneClean = toEnglishDigits(app.phone || '').replace(/\D/g, '');
      const phoneMatch = phoneClean.includes(q) || (qDigits.length >= 4 && phoneClean.includes(qDigits));
      const memberNoMatch = (app.memberNumber || '').toLowerCase().includes(q);
      const appNoMatch = (app.applicationNumber || '').toLowerCase().includes(q);
      const districtMatch = (app.district || '').toLowerCase().includes(q);
      const talukaMatch = (app.taluka || '').toLowerCase().includes(q);

      return nameMatch || phoneMatch || memberNoMatch || appNoMatch || districtMatch || talukaMatch;
    });

    // When viewing duplicates, group records by phone/name together so admin can compare side by side!
    if (quickFilter === 'duplicates') {
      list = [...list].sort((a, b) => {
        const keyA = `${(a.fullName || '').trim()}_${a.phone || ''}`;
        const keyB = `${(b.fullName || '').trim()}_${b.phone || ''}`;
        return keyA.localeCompare(keyB);
      });
    }

    return list;
  }, [applications, searchQuery, quickFilter, duplicateAnalysis]);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setVisibleCount(50);
  };

  const handleQuickFilterChange = (
    next: 'all' | 'duplicates' | 'issue_0001' | 'missing_salutation' | 'missing_center' | 'approved'
  ) => {
    setQuickFilter(next);
    setVisibleCount(50);
  };

  const visibleMembers = useMemo(
    () => filteredMembers.slice(0, visibleCount),
    [filteredMembers, visibleCount]
  );

  const requestedEditPhotoIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const missingPhotoIds = visibleMembers
      .filter((app) => !app.photo && app.hasPhoto && !requestedEditPhotoIdsRef.current.has(app.id))
      .map((app) => app.id);
    if (missingPhotoIds.length === 0) return;
    missingPhotoIds.forEach((id) => requestedEditPhotoIdsRef.current.add(id));
    fetchApplicationPhotosBatch(missingPhotoIds)
      .then((photos) => {
        if (photos && Object.keys(photos).length > 0) {
          window.dispatchEvent(new CustomEvent('mahasangh_app_photos_hydrated', { detail: photos }));
        }
      })
      .catch(() => {});
  }, [visibleMembers]);

  // Talukas available for the currently edited member's district
  const availableTalukasForEdit = useMemo(() => {
    if (!editingMember?.district) return [];
    const trimmed = editingMember.district.trim();
    if (DISTRICT_TALUKAS_MAP[trimmed]) return DISTRICT_TALUKAS_MAP[trimmed];
    const alt1 = trimmed.replace('शी', 'शि');
    if (DISTRICT_TALUKAS_MAP[alt1]) return DISTRICT_TALUKAS_MAP[alt1];
    const alt2 = trimmed.replace('शि', 'शी');
    if (DISTRICT_TALUKAS_MAP[alt2]) return DISTRICT_TALUKAS_MAP[alt2];
    for (const [dKey, list] of Object.entries(DISTRICT_TALUKAS_MAP)) {
      if (dKey.includes(trimmed) || trimmed.includes(dKey)) return list;
    }
    return [];
  }, [editingMember?.district]);

  // Real-time check if the memberNumber typed in the Edit modal collides with another member
  const memberNumberConflict = useMemo(() => {
    if (!editingMember || !editingMember.memberNumber) return null;
    const norm = toEnglishDigits(editingMember.memberNumber.trim()).toUpperCase();
    if (!norm) return null;
    return applications.find(
      (a) =>
        a.id !== editingMember.id &&
        toEnglishDigits((a.memberNumber || '').trim()).toUpperCase() === norm
    ) || null;
  }, [editingMember, applications]);

  const handleOpenEdit = async (member: MembershipApplication) => {
    setPhotoError('');
    let target = member;
    if (!member.photo && member.hasPhoto) {
      const full = await fetchSingleApplicationForAdmin(member.id);
      if (full) target = full;
    }
    const normalizedSal = normalizeSalutation(target.salutation);
    const resolvedGender = resolveMemberGender({
      ...target,
      salutation: normalizedSal,
    });
    setEditingMember({
      ...target,
      salutation: normalizedSal,
      gender: resolvedGender,
      professional: normalizeOfficialCadre(target.professional),
    });
    const parsedSeq = parseMemberNumberSeq(target.memberNumber);
    setSeqInputForFormat(parsedSeq > 0 ? String(parsedSeq) : '');
  };

  const handleFormatMemberNumberFromSeq = () => {
    if (!editingMember) return;
    const num = parseInt(toEnglishDigits(seqInputForFormat.trim()).replace(/\D/g, ''), 10);
    if (!num || num <= 0) return;
    const formatted = formatSequentialMemberNumber(editingMember.district || 'MAHA', num);
    setEditingMember({ ...editingMember, memberNumber: formatted });
  };

  const handleEditPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError('');
    const inputEl = e.target;
    const file = inputEl.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoError('कृपया वैध फोटो फाईल (JPG किंवा PNG) निवडा.');
      inputEl.value = '';
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const { urlOrBase64 } = await uploadCompressedPhotoToCloudinaryOrFallback(file, 360, 440, 0.75);
      setEditingMember((prev) => (prev ? { ...prev, photo: urlOrBase64 } : prev));
    } catch (err: any) {
      setPhotoError('फोटो प्रोसेस करताना त्रुटी: ' + (err.message || 'Error'));
    } finally {
      setIsUploadingPhoto(false);
      inputEl.value = '';
    }
  };

  const handleSaveEditedMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    if (!editingMember.fullName.trim()) {
      setStatusBanner({ text: 'कृपया सदस्याचे संपूर्ण नाव प्रविष्ट करा.', type: 'error' });
      return;
    }

    const cleanPhone = toEnglishDigits(editingMember.phone || '').replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      setStatusBanner({ text: 'कृपया 10 अंकी वैध मोबाईल नंबर प्रविष्ट करा.', type: 'error' });
      return;
    }

    const normalizedSal = normalizeSalutation(editingMember.salutation);
    const resolvedGender = resolveMemberGender({
      ...editingMember,
      salutation: normalizedSal,
    });
    const updatedRecord: MembershipApplication = {
      ...editingMember,
      salutation: normalizedSal,
      gender: resolvedGender,
      fullName: editingMember.fullName.trim(),
      phone: cleanPhone,
      email: (editingMember.email || `${cleanPhone}@mahasangh.in`).trim().toLowerCase(),
      memberNumber: toEnglishDigits((editingMember.memberNumber || '').trim()).toUpperCase(),
      applicationNumber: toEnglishDigits((editingMember.applicationNumber || '').trim()).toUpperCase(),
      address: (editingMember.address || '').trim(),
      centerName: (editingMember.centerName || '').trim(),
      familyMembers: toEnglishDigits((editingMember.familyMembers || '').trim()),
      hobby: (editingMember.hobby || '').trim(),
      education: (editingMember.education || '').trim(),
      professional: normalizeOfficialCadre(editingMember.professional),
      approvedAt:
        editingMember.status === 'approved'
          ? editingMember.approvedAt || new Date().toISOString()
          : editingMember.approvedAt,
    };

    try {
      setIsSaving(true);
      await onUpdateMember(updatedRecord);

      // Keep central counter in sync if a sequential number was assigned
      if (updatedRecord.memberNumber) {
        const seqNum = parseMemberNumberSeq(updatedRecord.memberNumber);
        if (seqNum > 0) {
          syncMemberCounter(seqNum).catch(() => {});
        }
      }

      setStatusBanner({
        text: `✓ ${updatedRecord.salutation} ${updatedRecord.fullName} यांची माहिती व सदस्य क्रमांक (${updatedRecord.memberNumber || '-'}) यशस्वीरीत्या अपडेट झाले! आता सदस्य 'अर्जाची स्थिती तपासा' मधून नवीन अचूक आय-कार्ड डाऊनलोड करू शकतात.`,
        type: 'success',
        member: updatedRecord,
      });
      setEditingMember(null);
    } catch (err: any) {
      setStatusBanner({
        text: 'माहिती सेव्ह करताना त्रुटी आली: ' + (err.message || 'Error'),
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingMember) return;
    try {
      setIsDeleting(true);
      await onDeleteApplication(deletingMember.id);
      setStatusBanner({
        text: `✓ ${deletingMember.salutation} ${deletingMember.fullName} (${deletingMember.memberNumber || deletingMember.applicationNumber}) ही नोंदणी कायमची डिलीट करण्यात आली आहे.`,
        type: 'success',
      });
      setDeletingMember(null);
    } catch (err: any) {
      setStatusBanner({
        text: 'नोंदणी डिलीट करताना त्रुटी आली: ' + (err.message || 'Error'),
        type: 'error',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePurgeGhostRecords = async () => {
    try {
      setIsPurgingGhosts(true);
      setShowPurgeConfirmModal(false);
      const res = await purgeDeletedAndGhostApplicationsInFirestore();
      setStatusBanner({
        text: res.message,
        type: 'success',
      });
      if (onFetchApplications) {
        await onFetchApplications(true);
      }
    } catch (err: any) {
      setStatusBanner({
        text: 'डाटा स्वच्छ करताना त्रुटी आली: ' + (err?.message || 'Error'),
        type: 'error',
      });
    } finally {
      setIsPurgingGhosts(false);
    }
  };

  return (
    <div className="bg-white p-4 sm:p-6 rounded-2xl border border-[#e7ded1] shadow-xs space-y-5">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <p className="text-[11px] font-bold text-[#df6b16] mb-0.5">
            दुरुस्ती व दुबार नोंदणी नियंत्रण कक्ष
          </p>
          <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#0b1e36]">
            सदस्य एडिट व दुबार नोंदणी दुरुस्ती
          </h3>
          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
            सदस्याचे नाव किंवा मोबाईल नंबर शोधून त्यांचा <strong>सदस्य क्रमांक</strong> व संपूर्ण माहिती अद्ययावत करा किंवा दुबार नोंदणी काढा.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setShowPurgeConfirmModal(true)}
            disabled={isPurgingGhosts}
            className="flex-1 sm:flex-none min-h-[44px] bg-rose-50 hover:bg-rose-100 active:scale-[0.98] text-rose-800 border border-rose-200 text-xs font-bold px-3.5 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-60"
            title="पूर्वी डिलीट/नाकारलेले व दुबार प्रलंबित घोस्ट रेकॉर्ड सिस्टममधून कायमचे काढून टाका"
          >
            <Trash2 className={`w-4 h-4 ${isPurgingGhosts ? 'animate-spin' : ''}`} />
            <span className="whitespace-nowrap">{isPurgingGhosts ? 'स्वच्छता सुरू...' : 'जुने डिलीट स्वच्छ करा'}</span>
          </button>

          {onFetchApplications && (
            <button
              type="button"
              onClick={() => onFetchApplications(true)}
              disabled={isLoadingApps}
              className="flex-1 sm:flex-none min-h-[44px] bg-[#0b1e36] hover:bg-[#193568] active:scale-[0.98] text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 text-amber-400 ${isLoadingApps ? 'animate-spin' : ''}`} />
              <span className="whitespace-nowrap">{isLoadingApps ? 'लोड होत आहे...' : 'यादी ताजी करा'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Shareable Standalone One-Time Center Update Link Box */}
      <div className="bg-[#fbf8f2] border border-[#e7ded1] rounded-xl p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 allow-copy">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold text-[#0b1e36]">
            <Link2 className="w-4 h-4 text-[#df6b16] shrink-0" />
            <span>
              केंद्राचे नाव अद्ययावत करण्यासाठी स्वतंत्र One-Time लिंक (बाकी सदस्य:{' '}
              <span className="font-mono tabular-nums text-[#df6b16]">
                {toEnglishDigits(duplicateAnalysis.missingCenterCount)}
              </span>
              )
            </span>
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            ही लिंक सदस्यांना शेअर केल्यावर ज्यांचे कार्यरत केंद्र अद्याप भरलेले नाही, फक्त त्यांचीच नावे दिसतील व सबमिट केल्यावर माहिती त्यांच्या नोंदीत आपोआप जोडली जाईल.
          </p>
          <div className="text-[11px] font-mono text-[#193568] font-semibold truncate select-all">
            {buildCenterUpdateShareUrl()}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={async () => {
              const url = buildCenterUpdateShareUrl();
              try {
                await navigator.clipboard.writeText(url);
              } catch {
                const ta = document.createElement('textarea');
                ta.value = url;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
              }
              setCopiedShareMode('url');
              setTimeout(() => setCopiedShareMode(null), 2500);
            }}
            className="min-h-[40px] bg-[#193568] hover:bg-[#0b1e36] text-white text-xs font-bold px-3.5 py-2 rounded-lg inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
          >
            {copiedShareMode === 'url' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-300" />
                <span>लिंक कॉपी झाली</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>लिंक कॉपी करा</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={async () => {
              const msg = buildCenterUpdateShareMessage();
              try {
                await navigator.clipboard.writeText(msg);
              } catch {
                const ta = document.createElement('textarea');
                ta.value = msg;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
              }
              setCopiedShareMode('message');
              setTimeout(() => setCopiedShareMode(null), 2500);
            }}
            className="min-h-[40px] bg-white hover:bg-slate-50 text-[#193568] border border-slate-300 text-xs font-bold px-3.5 py-2 rounded-lg inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
          >
            {copiedShareMode === 'message' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>संदेश कॉपी झाला</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-[#df6b16]" />
                <span>WhatsApp संदेश कॉपी</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {statusBanner && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-3 border ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <div className="flex items-start gap-2">
            {statusBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <span>{statusBanner.text}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {statusBanner.member && statusBanner.member.status === 'approved' && (
              <button
                type="button"
                onClick={() => generateMembershipIdCardPdf(statusBanner.member!)}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1.5 rounded-lg text-[11px] flex items-center gap-1 shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                नवीन आय-कार्ड PDF पहा
              </button>
            )}
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-slate-500 hover:text-slate-800 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Search & Smart Duplicate/0001 Filters */}
      <div className="bg-[#fbf8f2] p-3.5 sm:p-4 rounded-xl border border-[#e7ded1] space-y-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="सदस्याचे नाव, 10 अंकी मोबाईल नंबर, सदस्य क्र. किंवा अर्ज क्र. शोधा..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full min-h-[44px] text-base sm:text-sm pl-10 pr-10 py-2 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#df6b16] font-medium"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700"
              title="शोध पुसा"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Quick Filter Buttons (Single-line horizontally scrollable on mobile) */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5 text-xs">
          <button
            type="button"
            onClick={() => handleQuickFilterChange('all')}
            className={`min-h-[40px] px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums ${
              quickFilter === 'all'
                ? 'bg-[#0b1e36] text-white shadow-xs'
                : 'bg-white text-slate-700 border border-[#e7ded1] hover:bg-slate-50'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>सर्व नोंदी ({applications.length})</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickFilterChange('duplicates')}
            className={`min-h-[40px] px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums ${
              quickFilter === 'duplicates'
                ? 'bg-[#df6b16] text-white shadow-xs'
                : 'bg-white text-amber-900 border border-amber-200 hover:bg-amber-50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>दुबार नोंदी ({duplicateAnalysis.duplicateCount})</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickFilterChange('issue_0001')}
            className={`min-h-[40px] px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums ${
              quickFilter === 'issue_0001'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'bg-white text-rose-800 border border-rose-200 hover:bg-rose-50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>0001 / त्रुटी ({duplicateAnalysis.issue0001Count})</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickFilterChange('missing_salutation')}
            className={`min-h-[40px] px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums ${
              quickFilter === 'missing_salutation'
                ? 'bg-indigo-700 text-white shadow-xs'
                : 'bg-white text-indigo-800 border border-indigo-200 hover:bg-indigo-50'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>आदरार्थी सुटलेले ({duplicateAnalysis.missingSalutationCount})</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickFilterChange('missing_center')}
            className={`min-h-[40px] px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums ${
              quickFilter === 'missing_center'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-white text-teal-800 border border-teal-200 hover:bg-teal-50'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>केंद्र सुटलेले ({duplicateAnalysis.missingCenterCount})</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickFilterChange('approved')}
            className={`min-h-[40px] px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums ${
              quickFilter === 'approved'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>मंजूर ({applications.filter((a) => a.status === 'approved').length})</span>
          </button>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 px-1 tabular-nums">
        <span>
          दाखवले: <strong className="text-[#0b1e36] font-mono">{visibleMembers.length}</strong> / एकूण सापडलेले:{' '}
          <strong className="text-[#0b1e36] font-mono">{filteredMembers.length}</strong>
        </span>
        {quickFilter === 'duplicates' && (
          <span className="text-amber-800 font-semibold">
            सारखा मोबाईल किंवा नाव असलेले सदस्य येथे एकत्र दिसतात.
          </span>
        )}
      </div>

      {/* MOBILE APP CARD LIST (Shown on < md viewports) */}
      <div className="md:hidden space-y-3">
        {visibleMembers.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-xs bg-[#fbf8f2] rounded-xl border border-[#e7ded1]">
            शोधलेल्या माहितीनुसार कोणताही सदस्य आढळला नाही.
          </div>
        ) : (
          visibleMembers.map((app) => {
            const dupPhone = duplicateAnalysis.isDuplicatePhone(app);
            const dupName = duplicateAnalysis.isDuplicateName(app);
            const dupMemNo = duplicateAnalysis.isDuplicateMemberNo(app);
            const is0001 = Boolean(app.memberNumber && /\/0001$/i.test(app.memberNumber.trim()));
            const statusLabel =
              app.status === 'approved' ? 'मंजूर' : app.status === 'rejected' ? 'नाकारले' : 'प्रलंबित';
            const statusTextColor =
              app.status === 'approved'
                ? 'text-emerald-700'
                : app.status === 'rejected'
                ? 'text-rose-700'
                : 'text-amber-700';

            return (
              <div
                key={app.id}
                className={`rounded-2xl border p-3.5 space-y-3 transition-colors ${
                  dupPhone || dupMemNo
                    ? 'bg-amber-50/40 border-amber-300'
                    : 'bg-white border-[#e7ded1]'
                }`}
              >
                <div className="flex items-start gap-3">
                  {app.photo ? (
                    <img
                      key={app.photo}
                      src={app.photo}
                      alt={app.fullName}
                      loading="lazy"
                      className="w-12 h-14 object-cover rounded-lg border border-slate-300 shrink-0 bg-slate-100"
                    />
                  ) : (
                    <div className="w-12 h-14 bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[11px] font-bold ${statusTextColor}`}>
                        ● {statusLabel}
                      </span>
                      <span className="font-mono text-[11px] font-bold text-[#0b1e36] tabular-nums truncate">
                        {app.memberNumber || app.applicationNumber}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-900 text-sm leading-snug mt-0.5 truncate">
                      {formatMemberDisplayName(app.salutation, app.fullName)}
                    </h4>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 mt-1 tabular-nums">
                      <span className="font-mono font-bold text-[#0b1e36]">{app.phone}</span>
                      <span aria-hidden="true">·</span>
                      <span>{app.district}</span>
                      {app.taluka && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{app.taluka}</span>
                        </>
                      )}
                      {(() => {
                        const g = resolveMemberGender(app);
                        return g ? (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              g === 'स्त्री'
                                ? 'bg-pink-50 text-pink-800 border border-pink-200'
                                : 'bg-blue-50 text-blue-800 border border-blue-200'
                            }`}
                          >
                            {g}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-indigo-700">
                            [आदरार्थी सुटलेले]
                          </span>
                        );
                      })()}
                    </div>
                    {(dupPhone || dupName || dupMemNo || is0001) && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5 text-[11px] font-bold text-rose-700">
                        {dupPhone && <span>[दुबार मोबाईल]</span>}
                        {dupName && !dupPhone && <span>[सारखे नाव]</span>}
                        {dupMemNo && <span>[दुबार सदस्य क्र.]</span>}
                        {is0001 && <span>[0001 क्रमांक]</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Touch-friendly 44px action buttons */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(app)}
                    className={`min-h-[44px] bg-[#0b1e36] hover:bg-[#193568] active:scale-[0.98] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer ${
                      app.status === 'approved' ? '' : 'col-span-2'
                    }`}
                  >
                    <Edit3 className="w-4 h-4 text-amber-400" />
                    <span>एडिट</span>
                  </button>

                  {app.status === 'approved' && (
                    <button
                      type="button"
                      onClick={() => generateMembershipIdCardPdf(app)}
                      className="min-h-[44px] bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>ID कार्ड</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setDeletingMember(app)}
                    className="min-h-[44px] bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>डिलीट</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* DESKTOP TABLE (Shown on >= md viewports) */}
      <div className="hidden md:block overflow-x-auto border border-[#e7ded1] rounded-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#fbf8f2] border-b border-[#e7ded1] text-[#0b1e36] font-bold text-[11px]">
            <tr>
              <th className="py-3 px-3">फोटो</th>
              <th className="py-3 px-3">सदस्य क्रमांक व अर्ज क्र.</th>
              <th className="py-3 px-3">संपूर्ण नाव व संवर्ग</th>
              <th className="py-3 px-3">मोबाईल व जिल्हा/तालुका</th>
              <th className="py-3 px-3">स्थिती व सूचना</th>
              <th className="py-3 px-3 text-center">दुरुस्ती / डिलीट</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleMembers.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-400">
                  शोधलेल्या माहितीनुसार कोणताही सदस्य आढळला नाही.
                </td>
              </tr>
            ) : (
              visibleMembers.map((app) => {
                const dupPhone = duplicateAnalysis.isDuplicatePhone(app);
                const dupName = duplicateAnalysis.isDuplicateName(app);
                const dupMemNo = duplicateAnalysis.isDuplicateMemberNo(app);
                const is0001 = Boolean(app.memberNumber && /\/0001$/i.test(app.memberNumber.trim()));

                return (
                  <tr
                    key={app.id}
                    className={`transition-colors ${
                      dupPhone || dupMemNo
                        ? 'bg-amber-50/35 hover:bg-amber-50/70'
                        : 'hover:bg-slate-50/90'
                    }`}
                  >
                    <td className="py-3 px-3">
                      {app.photo ? (
                        <img
                          key={app.photo}
                          src={app.photo}
                          alt={app.fullName}
                          loading="lazy"
                          className="w-10 h-12 object-cover rounded border border-slate-300 shadow-2xs"
                        />
                      ) : (
                        <div className="w-10 h-12 bg-slate-100 rounded border border-slate-300 flex items-center justify-center text-slate-400">
                          <ImageIcon className="w-4 h-4" />
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3 tabular-nums">
                      {app.memberNumber ? (
                        <span
                          className={`font-mono font-black text-xs px-2 py-0.5 rounded inline-block border ${
                            dupMemNo || is0001
                              ? 'bg-rose-50 text-rose-800 border-rose-300'
                              : 'bg-slate-100 text-[#0b1e36] border-slate-300'
                          }`}
                        >
                          {app.memberNumber}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">क्रमांक नाही</span>
                      )}
                      <span className="block font-mono text-[11px] text-slate-500 mt-1">
                        अर्ज: {app.applicationNumber}
                      </span>
                      <span className="block text-[11px] text-slate-600 mt-0.5">
                        {formatDateWithEnglishDigits(app.createdAt)}
                        {app.createdAt ? ` · ${formatTimeOnly(app.createdAt)}` : ''}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 text-xs sm:text-sm">
                        {formatMemberDisplayName(app.salutation, app.fullName)}
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span>{normalizeOfficialCadre(app.professional, 'केंद्रप्रमुख')}</span>
                        {(() => {
                          const g = resolveMemberGender(app);
                          return g ? (
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                g === 'स्त्री'
                                  ? 'bg-pink-50 text-pink-800 border border-pink-200'
                                  : 'bg-blue-50 text-blue-800 border border-blue-200'
                              }`}
                            >
                              {g}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-indigo-700">
                              · आदरार्थी सुटलेले
                            </span>
                          );
                        })()}
                        {app.isOfficial && app.officialPost && (
                          <span className="text-[#df6b16] font-bold">
                            · {app.officialPost}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3 tabular-nums">
                      <div className="font-mono font-bold text-[#0b1e36]">{app.phone}</div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        {app.district}
                        {app.taluka ? ` (ता. ${app.taluka})` : ''}
                      </div>
                      {app.centerName && (
                        <div className="text-[10px] text-slate-500 truncate max-w-[180px]">
                          केंद्र: {app.centerName}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3 space-y-1">
                      <div className="text-xs font-bold">
                        {app.status === 'approved' ? (
                          <span className="text-emerald-700">✓ मंजूर</span>
                        ) : app.status === 'rejected' ? (
                          <span className="text-rose-700">✕ नाकारले</span>
                        ) : (
                          <span className="text-amber-700">प्रलंबित</span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1 text-[10px] font-bold">
                        {dupPhone && <span className="text-amber-800">· दुबार मोबाईल</span>}
                        {dupName && !dupPhone && <span className="text-orange-800">· सारखे नाव</span>}
                        {dupMemNo && <span className="text-rose-800">· दुबार सदस्य क्र.</span>}
                        {is0001 && <span className="text-rose-700">· 0001 क्रमांक</span>}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(app)}
                          className="bg-[#0b1e36] hover:bg-[#193568] text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                          title="सदस्य क्रमांक व सर्व माहिती एडिट करा"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                          <span>एडिट</span>
                        </button>

                        {app.status === 'approved' && (
                          <button
                            type="button"
                            onClick={() => generateMembershipIdCardPdf(app)}
                            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                            title="अद्ययावत आय-कार्ड PDF डाऊनलोड करा"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>ID</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setDeletingMember(app)}
                          className="bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 font-bold px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                          title="दुबार / चुकीची नोंदणी डिलीट करा"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>डिलीट</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Load More Pagination Bar (keeps mobile fast) */}
      {filteredMembers.length > visibleMembers.length && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => prev + 50)}
            className="w-full sm:w-auto min-h-[44px] bg-[#fbf8f2] hover:bg-amber-50 border border-[#e7ded1] text-[#0b1e36] font-bold px-6 py-2.5 rounded-xl text-xs transition-colors cursor-pointer tabular-nums"
          >
            आणखी ५० नोंदी पहा ({visibleMembers.length} / {filteredMembers.length})
          </button>
          {filteredMembers.length - visibleMembers.length > 50 && (
            <button
              type="button"
              onClick={() => setVisibleCount(filteredMembers.length)}
              className="w-full sm:w-auto min-h-[44px] bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold px-5 py-2.5 rounded-xl text-xs transition-colors cursor-pointer tabular-nums"
            >
              सर्व {filteredMembers.length} नोंदी दाखवा
            </button>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* Full Member Edit Modal */}
      {/* ============================================================== */}
      {editingMember && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-3xl w-full shadow-2xl border border-[#e7ded1] max-h-[94vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#132b52] via-[#193568] to-[#0b1e36] text-white px-5 py-3.5 flex items-center justify-between shrink-0 border-b border-amber-500/60">
              <div>
                <span className="text-[11px] font-bold text-amber-300 block">
                  सदस्य संपूर्ण माहिती दुरुस्ती
                </span>
                <h4 className="font-serifDevanagari text-base sm:text-lg font-bold text-white">
                  {editingMember.salutation} {editingMember.fullName}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="min-w-[44px] min-h-[44px] rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveEditedMember} className="p-4 sm:p-5 overflow-y-auto space-y-5 text-sm sm:text-xs flex-1">
              {/* Highlighted Member Number & Status Block */}
              <div className="bg-indigo-50/70 border-2 border-indigo-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-indigo-950 text-sm">
                    १. अधिकृत सदस्य क्रमांक व स्थिती (Member Number & Status)
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">
                    ID: {editingMember.id}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-800 block mb-1">
                      अधिकृत सदस्य क्रमांक (Member Number)
                    </label>
                    <input
                      type="text"
                      value={editingMember.memberNumber || ''}
                      onChange={(e) =>
                        setEditingMember({
                          ...editingMember,
                          memberNumber: toEnglishDigits(e.target.value).toUpperCase(),
                        })
                      }
                      placeholder="उदा. MS/2026/NASH/0315"
                      className="w-full p-2.5 bg-white border-2 border-indigo-300 rounded-lg font-mono font-black text-sm text-[#17366d] focus:outline-none focus:border-[#df6b16]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-800 block mb-1">
                      फक्त क्रमांकावरून फॉरमॅट बनवा (मदत)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={seqInputForFormat}
                        onChange={(e) => setSeqInputForFormat(e.target.value)}
                        placeholder="उदा. 315"
                        className="w-28 p-2.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-xs focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={handleFormatMemberNumberFromSeq}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        क्रमांक तयार करा
                      </button>
                    </div>
                  </div>
                </div>

                {memberNumberConflict && (
                  <div className="p-2.5 bg-rose-50 border border-rose-300 rounded-lg text-rose-800 font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>
                      सावधान: हा सदस्य क्रमांक ({editingMember.memberNumber}) आधीच{' '}
                      <strong>
                        {memberNumberConflict.salutation} {memberNumberConflict.fullName}
                      </strong>{' '}
                      ({memberNumberConflict.phone}) यांना दिलेला आहे!
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">अर्ज स्थिती (Status)</label>
                    <select
                      value={editingMember.status}
                      onChange={(e) =>
                        setEditingMember({
                          ...editingMember,
                          status: e.target.value as 'pending' | 'approved' | 'rejected',
                        })
                      }
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-800"
                    >
                      <option value="approved">✓ मंजूर (Approved)</option>
                      <option value="pending">⏳ प्रलंबित (Pending)</option>
                      <option value="rejected">✕ नाकारले (Rejected)</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">अर्ज क्रमांक (App No.)</label>
                    <input
                      type="text"
                      value={editingMember.applicationNumber || ''}
                      onChange={(e) =>
                        setEditingMember({
                          ...editingMember,
                          applicationNumber: toEnglishDigits(e.target.value).toUpperCase(),
                        })
                      }
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-700"
                    />
                  </div>

                  <div className="flex items-end pb-1.5">
                    <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-lg border border-slate-300 w-full">
                      <input
                        type="checkbox"
                        checked={Boolean(editingMember.paymentConfirmed)}
                        onChange={(e) =>
                          setEditingMember({
                            ...editingMember,
                            paymentConfirmed: e.target.checked,
                          })
                        }
                        className="w-4 h-4 text-emerald-600 rounded"
                      />
                      <span className="font-bold text-slate-800">पेमेंट प्राप्त (₹220)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Photo Section */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center gap-4">
                <div className="w-20 h-24 rounded-lg border-2 border-[#d4af37] bg-white overflow-hidden flex items-center justify-center shrink-0">
                  {editingMember.photo ? (
                    <img
                      key={editingMember.photo}
                      src={editingMember.photo}
                      alt={editingMember.fullName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="w-7 h-7 text-slate-300" />
                  )}
                </div>
                <div className="flex-1 space-y-2 text-center sm:text-left">
                  <div className="font-bold text-slate-800">२. पासपोर्ट फोटो बदला / अपलोड करा</div>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <button
                      type="button"
                      disabled={isUploadingPhoto}
                      onClick={() => photoInputRef.current?.click()}
                      className="bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#df6b16]" />
                      {isUploadingPhoto ? 'अपलोड होत आहे...' : 'नवीन फोटो निवडा'}
                    </button>
                    {editingMember.photo && (
                      <button
                        type="button"
                        disabled={isUploadingPhoto}
                        onClick={() => {
                          setPhotoError('');
                          if (photoInputRef.current) photoInputRef.current.value = '';
                          setEditingMember((prev) => (prev ? { ...prev, photo: '' } : prev));
                        }}
                        className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-60"
                      >
                        फोटो काढा
                      </button>
                    )}
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleEditPhotoUpload}
                      className="hidden"
                    />
                  </div>
                  {photoError && <p className="text-rose-600 font-bold">{photoError}</p>}
                </div>
              </div>

              {/* Personal & Work Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">आदरार्थी (श्री / सौ / श्रीमती / कुमारी)</label>
                  <select
                    aria-label="आदरार्थी"
                    value={normalizeSalutation(editingMember.salutation)}
                    onChange={(e) => {
                      const nextSal = e.target.value;
                      const derived = deriveGenderFromSalutation(nextSal);
                      setEditingMember({
                        ...editingMember,
                        salutation: nextSal,
                        gender: derived || editingMember.gender || '',
                      });
                    }}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-bold"
                  >
                    <option value="">-- निवडा (सुटलेले) --</option>
                    <option value="श्री">श्री (पुरुष)</option>
                    <option value="सौ">सौ (स्त्री)</option>
                    <option value="श्रीमती">श्रीमती (स्त्री)</option>
                    <option value="कुमारी">कुमारी (स्त्री)</option>
                    <option value="डॉ">डॉ</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">लिंग (एक्सेल यादीसाठी)</label>
                  <select
                    aria-label="लिंग"
                    disabled={Boolean(deriveGenderFromSalutation(editingMember.salutation))}
                    value={resolveMemberGender(editingMember)}
                    onChange={(e) =>
                      setEditingMember({
                        ...editingMember,
                        gender: e.target.value as 'पुरुष' | 'स्त्री' | '',
                      })
                    }
                    className="w-full p-2.5 bg-white disabled:bg-slate-100 border border-slate-300 rounded-lg font-bold text-[#0b1e36]"
                  >
                    <option value="">-- आदरार्थीवरून स्वयंचलित --</option>
                    <option value="पुरुष">पुरुष</option>
                    <option value="स्त्री">स्त्री</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    संपूर्ण नाव <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editingMember.fullName || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, fullName: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    मोबाईल नंबर (10 अंकी) <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={editingMember.phone || ''}
                    onChange={(e) =>
                      setEditingMember({
                        ...editingMember,
                        phone: toEnglishDigits(e.target.value).replace(/\D/g, '').slice(0, 10),
                      })
                    }
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-mono font-bold"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">ई-मेल पत्ता</label>
                  <input
                    type="email"
                    value={editingMember.email || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, email: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">जिल्हा</label>
                  <select
                    value={editingMember.district || ''}
                    onChange={(e) =>
                      setEditingMember({
                        ...editingMember,
                        district: e.target.value,
                        taluka: '',
                      })
                    }
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-bold"
                  >
                    <option value="">-- जिल्हा निवडा --</option>
                    {MAHARASHTRA_DISTRICTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                    {editingMember.district && !MAHARASHTRA_DISTRICTS.includes(editingMember.district) && (
                      <option value={editingMember.district}>{editingMember.district}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">तालुका</label>
                  {availableTalukasForEdit.length > 0 ? (
                    <select
                      value={editingMember.taluka || ''}
                      onChange={(e) => setEditingMember({ ...editingMember, taluka: e.target.value })}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="">-- तालुका निवडा --</option>
                      {availableTalukasForEdit.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                      {editingMember.taluka && !availableTalukasForEdit.includes(editingMember.taluka) && (
                        <option value={editingMember.taluka}>{editingMember.taluka}</option>
                      )}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={editingMember.taluka || ''}
                      onChange={(e) => setEditingMember({ ...editingMember, taluka: e.target.value })}
                      placeholder="तालुका लिहा"
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg"
                    />
                  )}
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">कार्यरत केंद्राचे नाव</label>
                  <input
                    type="text"
                    value={editingMember.centerName || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, centerName: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">पद / संवर्ग</label>
                  <select
                    value={(() => {
                      const norm = normalizeOfficialCadre(editingMember.professional);
                      return norm && (OFFICIAL_CADRES as readonly string[]).includes(norm) ? norm : '';
                    })()}
                    onChange={(e) => setEditingMember({ ...editingMember, professional: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-semibold"
                  >
                    <option value="">-- संवर्ग निवडा --</option>
                    {OFFICIAL_CADRES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">शैक्षणिक पात्रता</label>
                  <input
                    type="text"
                    value={editingMember.education || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, education: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">व्यावसायिक पात्रता</label>
                  <select
                    value={editingMember.professionalQualification || ''}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, professionalQualification: e.target.value })
                    }
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="">-- निवडा --</option>
                    {TEACHER_PROFESSIONAL_QUALIFICATIONS.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                    {editingMember.professionalQualification &&
                      !(TEACHER_PROFESSIONAL_QUALIFICATIONS as readonly string[]).includes(
                        editingMember.professionalQualification
                      ) && (
                        <option value={editingMember.professionalQualification}>
                          {editingMember.professionalQualification}
                        </option>
                      )}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">कुटुंबातील सदस्य</label>
                  <input
                    type="text"
                    value={editingMember.familyMembers || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, familyMembers: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">छंद / विशेष आवड</label>
                  <input
                    type="text"
                    value={editingMember.hobby || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, hobby: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="font-bold text-slate-700 block mb-1">पत्ता / कार्यक्षेत्र</label>
                  <textarea
                    rows={2}
                    value={editingMember.address || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, address: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Official Post Section */}
              <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-amber-950">
                  <input
                    type="checkbox"
                    checked={Boolean(editingMember.isOfficial)}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, isOfficial: e.target.checked })
                    }
                    className="w-4 h-4 text-[#df6b16] rounded"
                  />
                  <span>संघटनेचे अधिकृत पदाधिकारी आहेत काय?</span>
                </label>

                {editingMember.isOfficial && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">संघटनेतील पद</label>
                      <select
                        value={editingMember.officialPost || ''}
                        onChange={(e) =>
                          setEditingMember({ ...editingMember, officialPost: e.target.value })
                        }
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                      >
                        <option value="">-- पद निवडा --</option>
                        {OFFICIAL_POST_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                        {editingMember.officialPost &&
                          !OFFICIAL_POST_OPTIONS.includes(editingMember.officialPost) && (
                            <option value={editingMember.officialPost}>{editingMember.officialPost}</option>
                          )}
                      </select>
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">पदाधिकारी जिल्हा</label>
                      <input
                        type="text"
                        value={editingMember.officialDistrict || ''}
                        onChange={(e) =>
                          setEditingMember({ ...editingMember, officialDistrict: e.target.value })
                        }
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">पदाधिकारी तालुका</label>
                      <input
                        type="text"
                        value={editingMember.officialTaluka || ''}
                        onChange={(e) =>
                          setEditingMember({ ...editingMember, officialTaluka: e.target.value })
                        }
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Sticky Footer Action Buttons */}
              <div className="sticky bottom-0 bg-white/95 backdrop-blur-xs flex items-center justify-end gap-2.5 pt-3 pb-1 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="min-h-[44px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer text-xs"
                >
                  रद्द करा
                </button>
                <button
                  type="submit"
                  disabled={isSaving || isUploadingPhoto}
                  className="flex-1 sm:flex-none min-h-[44px] px-6 py-2.5 bg-[#df6b16] hover:bg-[#c85c0e] disabled:opacity-60 text-white font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 cursor-pointer text-xs"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {isUploadingPhoto ? 'फोटो अपलोड होत आहे...' : isSaving ? 'सेव्ह होत आहे...' : 'बदल सेव्ह करा'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Safe Delete Confirmation Modal */}
      {/* ============================================================== */}
      {deletingMember && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-serifDevanagari text-base font-bold text-rose-900">
                  सदस्य नोंदणी कायमची डिलीट करायची का?
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  डिलीट केल्यास ही नोंदणी डेटाबेसमधून कायमची काढली जाईल. कृपया तपशील तपासा:
                </p>
              </div>
            </div>

            <div className="bg-[#fbf8f2] border border-[#e7ded1] rounded-xl p-3.5 text-xs space-y-1.5">
              <div>
                <span className="text-slate-500">नाव:</span>{' '}
                <strong className="text-slate-900">
                  {deletingMember.salutation} {deletingMember.fullName}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">सदस्य क्रमांक:</span>{' '}
                <strong className="font-mono text-[#0b1e36]">
                  {deletingMember.memberNumber || 'नाही'}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">अर्ज क्रमांक:</span>{' '}
                <strong className="font-mono">{deletingMember.applicationNumber}</strong>
              </div>
              <div>
                <span className="text-slate-500">मोबाईल / जिल्हा:</span>{' '}
                <strong className="font-mono">{deletingMember.phone}</strong> ({deletingMember.district})
              </div>
              <div>
                <span className="text-slate-500">नोंदणी तारीख:</span>{' '}
                <span>{formatDateWithEnglishDigits(deletingMember.createdAt)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingMember(null)}
                disabled={isDeleting}
                className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                रद्द करा
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 sm:flex-none min-h-[44px] px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'डिलीट होत आहे...' : 'होय, कायमचा डिलीट करा'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* In-App Purge Deleted & Ghost Confirmation Modal */}
      {/* ============================================================== */}
      {showPurgeConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-serifDevanagari text-base font-bold text-[#0b1e36]">
                  जुने डिलीट व घोस्ट रेकॉर्ड स्वच्छ करायचे का?
                </h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  पूर्वी डिलीट / नाकारलेले (Rejected), अपूर्ण आणि दुबार प्रलंबित अर्ज डेटाबेसमधून कायमचे काढले जातील. मंजूर सदस्य पूर्णपणे सुरक्षित राहतील.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowPurgeConfirmModal(false)}
                className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                रद्द करा
              </button>
              <button
                type="button"
                onClick={handlePurgeGhostRecords}
                className="flex-1 sm:flex-none min-h-[44px] px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>होय, स्वच्छ करा</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

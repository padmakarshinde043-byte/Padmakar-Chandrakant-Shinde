import React, { useState, useMemo, useRef } from 'react';
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
} from 'lucide-react';
import {
  MembershipApplication,
  MAHARASHTRA_DISTRICTS,
  OFFICIAL_CADRES,
  TEACHER_PROFESSIONAL_QUALIFICATIONS,
  formatSequentialMemberNumber,
} from '../data/mahasanghData';
import { DISTRICT_TALUKAS_MAP } from '../data/rkMaharashtraData';
import { formatDateWithEnglishDigits, toEnglishDigits } from '../utils/formatters';
import { uploadCompressedPhotoToCloudinaryOrFallback } from '../utils/cloudinary';
import { generateMembershipIdCardPdf } from '../services/rkPdfGenerator';
import { syncMemberCounter } from '../firebase';

interface MemberEditManagerProps {
  applications: MembershipApplication[];
  onUpdateMember: (member: MembershipApplication) => Promise<void> | void;
  onDeleteApplication: (id: string) => Promise<void> | void;
  onFetchApplications?: () => Promise<void>;
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
  const [quickFilter, setQuickFilter] = useState<'all' | 'duplicates' | 'issue_0001' | 'approved'>('all');

  // Edit Modal State
  const [editingMember, setEditingMember] = useState<MembershipApplication | null>(null);
  const [seqInputForFormat, setSeqInputForFormat] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ text: string; type: 'success' | 'error'; member?: MembershipApplication } | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Safe Delete Modal State
  const [deletingMember, setDeletingMember] = useState<MembershipApplication | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleOpenEdit = (member: MembershipApplication) => {
    setPhotoError('');
    setEditingMember({ ...member });
    const existingDigits = toEnglishDigits(member.memberNumber || '').replace(/\D/g, '').slice(-4);
    setSeqInputForFormat(existingDigits ? String(parseInt(existingDigits, 10)) : '');
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
    const file = e.target.files?.[0];
    if (!file || !editingMember) return;

    if (!file.type.startsWith('image/')) {
      setPhotoError('कृपया वैध फोटो फाईल (JPG किंवा PNG) निवडा.');
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const { urlOrBase64 } = await uploadCompressedPhotoToCloudinaryOrFallback(file, 360, 440, 0.75);
      setEditingMember({ ...editingMember, photo: urlOrBase64 });
    } catch (err: any) {
      setPhotoError('फोटो प्रोसेस करताना त्रुटी: ' + (err.message || 'Error'));
    } finally {
      setIsUploadingPhoto(false);
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

    const updatedRecord: MembershipApplication = {
      ...editingMember,
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
        const match = updatedRecord.memberNumber.match(/(\d{1,5})$/);
        if (match) {
          const seqNum = parseInt(match[1], 10);
          if (seqNum > 0) {
            syncMemberCounter(seqNum).catch(() => {});
          }
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

  return (
    <div className="bg-white p-4 sm:p-6 rounded-xl border-2 border-indigo-200 shadow-xs space-y-5">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-indigo-100 pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-800 border border-indigo-200 px-2.5 py-0.5 rounded-full text-[11px] font-bold mb-1.5">
            <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
            स्वतंत्र दुरुस्ती व दुबार नोंदणी नियंत्रण कक्ष
          </div>
          <h3 className="font-serifDevanagari text-lg sm:text-xl font-bold text-[#17366d]">
            सदस्य एडिट व दुबार नोंदणी दुरुस्ती (Member Edit)
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            येथून सदस्याचे नाव किंवा मोबाईल नंबर शोधून त्यांचा <strong>सदस्य क्रमांक</strong> व <strong>संपूर्ण माहिती</strong> काळजीपूर्वक एडिट करा किंवा दुबार झालेली नोंदणी डिलीट करा.
          </p>
        </div>
        {onFetchApplications && (
          <button
            type="button"
            onClick={onFetchApplications}
            disabled={isLoadingApps}
            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-colors self-start sm:self-auto shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingApps ? 'animate-spin' : ''}`} />
            <span>{isLoadingApps ? 'लोड होत आहे...' : 'यादी ताजी करा'}</span>
          </button>
        )}
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
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="सदस्याचे नाव, 10 अंकी मोबाईल नंबर, सदस्य क्र. (उदा. 0001) किंवा अर्ज क्र. टाका..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs sm:text-sm pl-10 pr-9 py-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-600 font-medium shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                title="शोध पुसा"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Quick Filter Buttons */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setQuickFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              quickFilter === 'all'
                ? 'bg-[#17366d] text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            सर्व नोंदी ({applications.length})
          </button>

          <button
            type="button"
            onClick={() => setQuickFilter('duplicates')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              quickFilter === 'duplicates'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            दुबार नोंदी ({duplicateAnalysis.duplicateCount})
          </button>

          <button
            type="button"
            onClick={() => setQuickFilter('issue_0001')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              quickFilter === 'issue_0001'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'bg-purple-50 text-purple-900 border border-purple-300 hover:bg-purple-100'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            0001 / त्रुटी क्रमांक ({duplicateAnalysis.issue0001Count})
          </button>

          <button
            type="button"
            onClick={() => setQuickFilter('approved')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              quickFilter === 'approved'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-white text-emerald-800 border border-emerald-300 hover:bg-emerald-50'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            मंजूर सदस्य ({applications.filter((a) => a.status === 'approved').length})
          </button>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between text-xs text-slate-600 px-1">
        <span>
          सापडलेल्या नोंदी: <strong className="text-[#17366d] font-mono">{filteredMembers.length}</strong>
        </span>
        {quickFilter === 'duplicates' && (
          <span className="text-amber-800 font-semibold">
            💡 सारखा मोबाईल नंबर किंवा सारखे नाव असलेले सदस्य येथे एकत्र दिसत आहेत.
          </span>
        )}
      </div>

      {/* Members Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-indigo-50/70 border-b border-indigo-200 text-indigo-950 font-bold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-3">फोटो</th>
              <th className="py-3 px-3">सदस्य क्रमांक व अर्ज क्र.</th>
              <th className="py-3 px-3">संपूर्ण नाव व संवर्ग</th>
              <th className="py-3 px-3">मोबाईल व जिल्हा/तालुका</th>
              <th className="py-3 px-3">स्थिती व इशाऱ्यांचे टॅग</th>
              <th className="py-3 px-3 text-center">दुरुस्ती / डिलीट</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredMembers.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-400">
                  शोधलेल्या माहितीनुसार कोणताही सदस्य आढळला नाही.
                </td>
              </tr>
            ) : (
              filteredMembers.map((app) => {
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
                          src={app.photo}
                          alt={app.fullName}
                          className="w-10 h-12 object-cover rounded border border-slate-300 shadow-2xs"
                        />
                      ) : (
                        <div className="w-10 h-12 bg-slate-100 rounded border border-slate-300 flex items-center justify-center text-slate-400">
                          <ImageIcon className="w-4 h-4" />
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      {app.memberNumber ? (
                        <span
                          className={`font-mono font-black text-xs px-2 py-0.5 rounded inline-block border ${
                            dupMemNo || is0001
                              ? 'bg-rose-50 text-rose-800 border-rose-300'
                              : 'bg-indigo-50 text-[#17366d] border-indigo-200'
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
                      <span className="block text-[10px] text-slate-400">
                        {formatDateWithEnglishDigits(app.createdAt)}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 text-xs sm:text-sm">
                        {app.salutation} {app.fullName}
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        {app.professional || 'केंद्रप्रमुख'}
                        {app.isOfficial && app.officialPost && (
                          <span className="ml-1.5 text-[#df6b16] font-bold">
                            • {app.officialPost}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-mono font-bold text-[#17366d]">{app.phone}</div>
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
                      <div>
                        {app.status === 'approved' ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            ✓ मंजूर
                          </span>
                        ) : app.status === 'rejected' ? (
                          <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            ✕ नाकारले
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            ⏳ प्रलंबित
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {dupPhone && (
                          <span className="bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            दुबार मोबाईल
                          </span>
                        )}
                        {dupName && !dupPhone && (
                          <span className="bg-orange-100 text-orange-900 border border-orange-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            सारखे नाव
                          </span>
                        )}
                        {dupMemNo && (
                          <span className="bg-rose-100 text-rose-900 border border-rose-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            दुबार सदस्य क्र.
                          </span>
                        )}
                        {is0001 && (
                          <span className="bg-purple-100 text-purple-900 border border-purple-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            0001 क्रमांक
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(app)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                          title="सदस्य क्रमांक व सर्व माहिती एडिट करा"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>एडिट करा</span>
                        </button>

                        {app.status === 'approved' && (
                          <button
                            type="button"
                            onClick={() => generateMembershipIdCardPdf(app)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                            title="अद्ययावत आय-कार्ड PDF डाऊनलोड करा"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>ID</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setDeletingMember(app)}
                          className="bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-300 font-bold px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors cursor-pointer"
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

      {/* ============================================================== */}
      {/* Full Member Edit Modal */}
      {/* ============================================================== */}
      {editingMember && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border-2 border-indigo-900/20 max-h-[94vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#17366d] via-[#1f4283] to-[#12284c] text-white px-5 py-4 flex items-center justify-between shrink-0">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-bold text-amber-300 block">
                  सदस्य संपूर्ण माहिती दुरुस्ती (Edit Member)
                </span>
                <h4 className="font-serifDevanagari text-lg font-bold text-white">
                  {editingMember.salutation} {editingMember.fullName}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveEditedMember} className="p-5 overflow-y-auto space-y-5 text-xs flex-1">
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
                        onClick={() => setEditingMember({ ...editingMember, photo: '' })}
                        className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold px-3 py-1.5 rounded-lg cursor-pointer"
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
                  <label className="font-bold text-slate-700 block mb-1">आदरार्थी</label>
                  <select
                    value={editingMember.salutation || 'श्री'}
                    onChange={(e) => setEditingMember({ ...editingMember, salutation: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="श्री">श्री</option>
                    <option value="सौ">सौ</option>
                    <option value="श्रीमती">श्रीमती</option>
                    <option value="डॉ">डॉ</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
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
                    value={editingMember.professional || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, professional: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-semibold"
                  >
                    {OFFICIAL_CADRES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    {editingMember.professional &&
                      !(OFFICIAL_CADRES as readonly string[]).includes(editingMember.professional) && (
                        <option value={editingMember.professional}>{editingMember.professional}</option>
                      )}
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
              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg cursor-pointer"
                >
                  रद्द करा
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-gradient-to-r from-[#17366d] to-[#12284c] hover:from-[#12284c] hover:to-[#0a1833] disabled:opacity-60 text-white font-bold rounded-lg shadow-md flex items-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>{isSaving ? 'सेव्ह होत आहे...' : 'बदल कायमचे सेव्ह करा'}</span>
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
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border-2 border-rose-300 space-y-4">
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

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs space-y-1.5">
              <div>
                <span className="text-slate-500">नाव:</span>{' '}
                <strong className="text-slate-900">
                  {deletingMember.salutation} {deletingMember.fullName}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">सदस्य क्रमांक:</span>{' '}
                <strong className="font-mono text-indigo-800">
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
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs cursor-pointer"
              >
                रद्द करा
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'डिलीट होत आहे...' : 'होय, कायमचा डिलीट करा'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

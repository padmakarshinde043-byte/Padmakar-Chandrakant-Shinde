import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Upload,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  Send,
  RotateCcw,
} from 'lucide-react';
import {
  MAHARASHTRA_DISTRICTS,
  MembershipApplication,
} from '../data/mahasanghData';
import { DISTRICT_TALUKAS_MAP } from '../data/rkMaharashtraData';
import { toEnglishDigits } from '../utils/formatters';
import { normalizePhone10 } from '../utils/applicationCleanup';
import { uploadCompressedPhotoToCloudinaryOrFallback } from '../utils/cloudinary';
import { PassportPhotoCropperModal } from './PassportPhotoCropperModal';

interface MemberChangeRequestModalProps {
  member: MembershipApplication;
  onClose: () => void;
  onSubmitted: () => void;
}

const SALUTATION_OPTIONS = ['श्री', 'सौ', 'श्रीमती', 'कु', 'डॉ', 'ॲड'];

export const MemberChangeRequestModal: React.FC<MemberChangeRequestModalProps> = ({
  member,
  onClose,
  onSubmitted,
}) => {
  const initialSalutation = (member.salutation || 'श्री').replace(/\.$/, '');
  const [salutation, setSalutation] = useState(
    SALUTATION_OPTIONS.includes(initialSalutation) ? initialSalutation : 'श्री'
  );
  const [fullName, setFullName] = useState(member.fullName || '');
  const [phone, setPhone] = useState(member.phone || '');
  const [email, setEmail] = useState(member.email || '');
  const [district, setDistrict] = useState(member.district || '');
  const [taluka, setTaluka] = useState(member.taluka || '');
  const [centerName, setCenterName] = useState(member.centerName || '');
  const [address, setAddress] = useState(member.address || '');
  const [photo, setPhoto] = useState(member.photo || '');
  const [reason, setReason] = useState('');

  const [rawCropSrc, setRawCropSrc] = useState('');
  const [showCropper, setShowCropper] = useState(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [photoNote, setPhotoNote] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const availableTalukas = useMemo(() => {
    if (!district) return [];
    const trimmed = district.trim();
    if (DISTRICT_TALUKAS_MAP[trimmed]) return DISTRICT_TALUKAS_MAP[trimmed];
    const alt1 = trimmed.replace('शी', 'शि');
    if (DISTRICT_TALUKAS_MAP[alt1]) return DISTRICT_TALUKAS_MAP[alt1];
    const alt2 = trimmed.replace('शि', 'शी');
    if (DISTRICT_TALUKAS_MAP[alt2]) return DISTRICT_TALUKAS_MAP[alt2];
    for (const [dKey, list] of Object.entries(DISTRICT_TALUKAS_MAP)) {
      if (dKey.includes(trimmed) || trimmed.includes(dKey)) return list;
    }
    return [];
  }, [district]);

  const changedFieldLabels = useMemo(() => {
    const labels: string[] = [];
    if (salutation.trim() !== (member.salutation || '').trim()) labels.push('अभिवादन');
    if (fullName.trim() !== (member.fullName || '').trim()) labels.push('पूर्ण नाव');
    if (normalizePhone10(phone) !== normalizePhone10(member.phone)) labels.push('मोबाईल क्र.');
    if (email.trim().toLowerCase() !== (member.email || '').trim().toLowerCase()) labels.push('ई-मेल');
    if (district.trim() !== (member.district || '').trim()) labels.push('जिल्हा');
    if (taluka.trim() !== (member.taluka || '').trim()) labels.push('तालुका');
    if (centerName.trim() !== (member.centerName || '').trim()) labels.push('केंद्राचे नाव');
    if (address.trim() !== (member.address || '').trim()) labels.push('पत्ता');
    if (photo.trim() && photo.trim() !== (member.photo || '').trim()) labels.push('पासपोर्ट फोटो');
    return labels;
  }, [salutation, fullName, phone, email, district, taluka, centerName, address, photo, member]);

  const handleSelectPhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('कृपया फक्त JPG, PNG किंवा WebP फोटो निवडा.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('फोटोची साईज 10 MB पेक्षा कमी असावी.');
      return;
    }
    setErrorMsg('');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRawCropSrc(reader.result);
        setShowCropper(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoCropped = async (croppedFile: File, previewDataUrl: string) => {
    setShowCropper(false);
    setRawCropSrc('');
    setIsProcessingPhoto(true);
    setErrorMsg('');
    try {
      const uploaded = await uploadCompressedPhotoToCloudinaryOrFallback(croppedFile, 180);
      const finalPhotoUrl = uploaded?.urlOrBase64 || previewDataUrl;
      setPhoto(finalPhotoUrl);
      setPhotoNote('नवीन पासपोर्ट फोटो तयार आहे.');
    } catch {
      setPhoto(previewDataUrl);
      setPhotoNote('नवीन पासपोर्ट फोटो तयार आहे.');
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleResetPhoto = () => {
    setPhoto(member.photo || '');
    setPhotoNote('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (changedFieldLabels.length === 0) {
      setErrorMsg('कृपया ज्या माहितीमध्ये किंवा फोटोमध्ये दुरुस्ती हवी आहे, ती किमान एक गोष्ट बदला.');
      return;
    }

    const cleanPhone10 = normalizePhone10(phone);
    if (cleanPhone10 !== normalizePhone10(member.phone)) {
      if (cleanPhone10.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone10)) {
        setErrorMsg('कृपया वैध १० अंकी मोबाईल क्रमांक प्रविष्ट करा.');
        return;
      }
    }

    const cleanReason = reason.trim();
    if (cleanReason.length < 10) {
      setErrorMsg('कृपया माहिती बदलण्याचे स्पष्ट कारण (किमान १० अक्षरे) लिहा.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/member-change-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: member.id,
          verifyPhone: member.phone,
          verifyMemberNumber: member.memberNumber,
          currentSnapshotFallback: {
            memberNumber: member.memberNumber,
            salutation: member.salutation,
            fullName: member.fullName,
            phone: member.phone,
            email: member.email,
            district: member.district,
            taluka: member.taluka,
            centerName: member.centerName,
            address: member.address,
            photo: member.photo,
          },
          proposed: {
            salutation: salutation.trim(),
            fullName: fullName.trim(),
            phone: toEnglishDigits(phone.trim()),
            email: email.trim(),
            district: district.trim(),
            taluka: taluka.trim(),
            centerName: centerName.trim(),
            address: address.trim(),
            photo: photo.trim(),
          },
          reason: cleanReason,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data?.message || 'विनंती पाठवताना अडचण आली. कृपया पुन्हा प्रयत्न करा.');
        return;
      }

      setSuccessMsg(
        'आपली माहिती दुरुस्ती विनंती अ‍ॅडमिन मंजुरीसाठी यशस्वीरित्या पाठवली गेली आहे. अ‍ॅडमिनने मंजूर केल्यानंतर सुधारित माहिती सभासद यादी व डिजिटल आय-कार्डवर आपोआप दिसेल.'
      );
      onSubmitted();
    } catch {
      setErrorMsg('सर्व्हरशी संपर्क होऊ शकला नाही. कृपया इंटरनेट तपासून पुन्हा प्रयत्न करा.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="सदस्य फोटो व माहिती दुरुस्ती विनंती"
      className="fixed inset-0 z-[100] bg-[#0b1e36]/60 backdrop-blur-[2px] flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto"
    >
      <div className="w-full max-w-2xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-[#0b1e36] text-white px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 shrink-0">
          <div>
            <h3 className="font-serifDevanagari text-base sm:text-lg font-extrabold leading-tight">
              सदस्य फोटो व माहिती दुरुस्ती विनंती
            </h3>
            <p className="text-xs text-slate-300 mt-0.5 tabular-nums">
              सदस्य क्र.: {member.memberNumber || '—'} · फक्त आवश्यक असलेलेच बदल करा
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="बंद करा"
            className="p-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {successMsg ? (
            <div className="py-6 px-3 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h4 className="font-serifDevanagari font-extrabold text-lg text-[#0b1e36]">
                  विनंती पाठवली गेली आहे
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed">{successMsg}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="bg-[#193568] hover:bg-[#11254a] text-white text-sm font-bold px-6 py-2.5 rounded-lg transition-colors cursor-pointer"
              >
                ठीक आहे, बंद करा
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 leading-relaxed">
                अ‍ॅडमिनने विनंती मंजूर केल्यानंतरच बदल लाईव्ह होतील. एकदा बदल मंजूर झाल्यानंतर पुढील{' '}
                <strong className="text-slate-800">३० दिवस</strong> नवीन विनंती पाठवता येणार नाही.
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm font-semibold flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Passport Photo Section */}
              <div className="border border-slate-200 rounded-lg p-3.5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="w-20 h-24 rounded-lg border border-slate-300 bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                  {photo ? (
                    <img
                      src={photo}
                      alt={fullName || 'सदस्य फोटो'}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-slate-400" />
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <div>
                    <div className="text-sm font-bold text-[#0b1e36]">पासपोर्ट फोटो बदलायचा असल्यास</div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      स्पष्ट चेहरा असलेला पासपोर्ट फोटो निवडा (क्रॉप करण्याची सुविधा आपोआप उघडेल).
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleSelectPhotoFile}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessingPhoto}
                      className="bg-white hover:bg-slate-50 text-[#193568] border border-slate-300 text-xs font-bold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isProcessingPhoto ? 'फोटो तयार होत आहे...' : 'नवीन फोटो निवडा'}</span>
                    </button>

                    {photo && photo !== (member.photo || '') && (
                      <button
                        type="button"
                        onClick={handleResetPhoto}
                        className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-2.5 py-2 rounded-lg flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>जुना फोटो ठेवा</span>
                      </button>
                    )}
                  </div>
                  {photoNote && (
                    <p className="text-xs font-semibold text-emerald-700">{photoNote}</p>
                  )}
                </div>
              </div>

              {/* Fields Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-3">
                  <label className="block text-xs font-bold text-slate-700 mb-1">अभिवादन</label>
                  <select
                    value={salutation}
                    onChange={(e) => setSalutation(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#193568]/30 focus:border-[#193568]"
                  >
                    {SALUTATION_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-9">
                  <label className="block text-xs font-bold text-slate-700 mb-1">पूर्ण नाव</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    maxLength={180}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#193568]/30 focus:border-[#193568]"
                  />
                </div>

                <div className="sm:col-span-6">
                  <label className="block text-xs font-bold text-slate-700 mb-1">मोबाईल क्रमांक (१० अंकी)</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(toEnglishDigits(e.target.value).replace(/[^\d]/g, '').slice(0, 10))}
                    maxLength={10}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#193568]/30 focus:border-[#193568]"
                  />
                </div>

                <div className="sm:col-span-6">
                  <label className="block text-xs font-bold text-slate-700 mb-1">ई-मेल पत्ता</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={180}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#193568]/30 focus:border-[#193568]"
                  />
                </div>

                <div className="sm:col-span-6">
                  <label className="block text-xs font-bold text-slate-700 mb-1">जिल्हा</label>
                  <select
                    value={district}
                    onChange={(e) => {
                      setDistrict(e.target.value);
                      setTaluka('');
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#193568]/30 focus:border-[#193568]"
                  >
                    <option value="">जिल्हा निवडा</option>
                    {MAHARASHTRA_DISTRICTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-6">
                  <label className="block text-xs font-bold text-slate-700 mb-1">तालुका</label>
                  {availableTalukas.length > 0 ? (
                    <select
                      value={taluka}
                      onChange={(e) => setTaluka(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#193568]/30 focus:border-[#193568]"
                    >
                      <option value="">तालुका निवडा</option>
                      {availableTalukas.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                      {taluka && !availableTalukas.includes(taluka) && (
                        <option value={taluka}>{taluka}</option>
                      )}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={taluka}
                      onChange={(e) => setTaluka(e.target.value)}
                      maxLength={120}
                      placeholder="तालुका प्रविष्ट करा"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#193568]/30 focus:border-[#193568]"
                    />
                  )}
                </div>

                <div className="sm:col-span-12">
                  <label className="block text-xs font-bold text-slate-700 mb-1">केंद्राचे नाव</label>
                  <input
                    type="text"
                    value={centerName}
                    onChange={(e) => setCenterName(e.target.value)}
                    maxLength={180}
                    placeholder="उदा. केंद्र - पिंपळगाव"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#193568]/30 focus:border-[#193568]"
                  />
                </div>

                <div className="sm:col-span-12">
                  <label className="block text-xs font-bold text-slate-700 mb-1">संपूर्ण पत्ता</label>
                  <textarea
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    maxLength={500}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#193568]/30 focus:border-[#193568]"
                  />
                </div>

                <div className="sm:col-span-12">
                  <label className="block text-xs font-bold text-[#0b1e36] mb-1">
                    माहिती / फोटो बदलण्याचे कारण <span className="text-rose-600">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={500}
                    required
                    placeholder="उदा. बदलीमुळे नवीन तालुका व केंद्र अद्ययावत करायचे आहे / पासपोर्ट फोटो अस्पष्ट आहे..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#193568]/30 focus:border-[#193568]"
                  />
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                    <span>किमान १० अक्षरांचे स्पष्ट कारण अनिवार्य आहे.</span>
                    <span className="tabular-nums">{reason.trim().length}/500</span>
                  </div>
                </div>
              </div>

              {/* Summary of detected changes */}
              <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                {changedFieldLabels.length > 0 ? (
                  <span>
                    <strong className="text-[#0b1e36]">बदललेले तपशील:</strong>{' '}
                    {changedFieldLabels.join(' · ')}
                  </span>
                ) : (
                  <span>अद्याप कोणत्याही माहितीमध्ये बदल केलेला नाही.</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  रद्द करा
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isProcessingPhoto || changedFieldLabels.length === 0}
                  className="bg-[#193568] hover:bg-[#11254a] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Send className="w-4 h-4 text-amber-300" />
                  <span>{isSubmitting ? 'विनंती पाठवत आहे...' : 'दुरुस्ती विनंती पाठवा'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {showCropper && rawCropSrc && (
        <PassportPhotoCropperModal
          imageSrc={rawCropSrc}
          language="mr"
          onCancel={() => {
            setShowCropper(false);
            setRawCropSrc('');
          }}
          onConfirm={handlePhotoCropped}
        />
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

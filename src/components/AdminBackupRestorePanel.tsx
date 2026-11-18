import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Upload,
  RotateCcw,
  Trash2,
  Database,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  HardDrive,
  ShieldCheck,
  FileCode2,
} from 'lucide-react';
import { getAuthHeaders } from '../api/sqlBridge';
import { toEnglishDigits, formatDateWithEnglishDigits } from '../utils/formatters';

interface BackupCounts {
  applications: number;
  news: number;
  latestBanners: number;
  govOrders: number;
  contacts: number;
  subAdmins: number;
  leaders: number;
  officials: number;
  appointedPosts: number;
  districtPasswords: number;
  settingsDocs: number;
}

interface BackupSnapshotSummary {
  fileName: string;
  createdAt: string;
  createdBy: string;
  sourceBackend: 'mysql' | 'mock' | 'firebase';
  sizeBytes: number;
  publicFileCount: number;
  counts: BackupCounts;
}

interface AdminBackupRestorePanelProps {
  onRestoreCompleted?: () => Promise<void> | void;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export const AdminBackupRestorePanel: React.FC<AdminBackupRestorePanelProps> = ({
  onRestoreCompleted,
}) => {
  const [snapshots, setSnapshots] = useState<BackupSnapshotSummary[]>([]);
  const [activeBackend, setActiveBackend] = useState<'mysql' | 'mock' | 'firebase'>('mysql');
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDownloadingSql, setIsDownloadingSql] = useState(false);

  const [pendingRestoreTarget, setPendingRestoreTarget] = useState<
    | { mode: 'snapshot'; fileName: string; label: string }
    | { mode: 'upload'; fileName: string; fileBase64: string; sizeBytes: number }
    | null
  >(null);
  const [pendingDeleteFile, setPendingDeleteFile] = useState<string | null>(null);

  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchSnapshotList = async () => {
    setIsLoadingList(true);
    try {
      const res = await fetch('/api/backup/list', {
        credentials: 'include',
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'बॅकअप यादी लोड होऊ शकली नाही.');
      setSnapshots(Array.isArray(json.snapshots) ? json.snapshots : []);
      if (json.activeBackend) setActiveBackend(json.activeBackend);
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.message || 'बॅकअप यादी वाचताना अडचण आली.',
      });
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    fetchSnapshotList();
  }, []);

  const triggerAuthenticatedDownload = async (url: string, downloadFileName: string) => {
    const res = await fetch(url, {
      credentials: 'include',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      let msg = 'डाऊनलोड अयशस्वी झाले.';
      try {
        const j = await res.json();
        if (j?.message) msg = j.message;
      } catch {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = downloadFileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  };

  const handleOneClickBackupAndDownload = async () => {
    setIsCreatingBackup(true);
    setStatusBanner(null);
    try {
      const res = await fetch('/api/backup/create', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok || !json?.snapshot?.fileName) {
        throw new Error(json?.message || 'संपूर्ण बॅकअप तयार होऊ शकला नाही.');
      }

      const snap = json.snapshot as BackupSnapshotSummary;
      await fetchSnapshotList();

      await triggerAuthenticatedDownload(
        `/api/backup/download/${encodeURIComponent(snap.fileName)}`,
        snap.fileName
      );

      setStatusBanner({
        type: 'success',
        text: `संपूर्ण वेबसाईट व डेटाबेस बॅकअप (${snap.fileName} — ${formatBytes(snap.sizeBytes)}) यशस्वीरीत्या तयार होऊन डाऊनलोड झाला आहे!`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.message || 'बॅकअप तयार करताना त्रुटी आली.',
      });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleDownloadActiveSql = async () => {
    setIsDownloadingSql(true);
    setStatusBanner(null);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await triggerAuthenticatedDownload(
        '/api/backup/download-active-sql',
        `mahasangh_active_db_${stamp}.sql`
      );
      setStatusBanner({
        type: 'success',
        text: 'सक्रिय डेटाबेसची संपूर्ण .SQL फाइल डाऊनलोड झाली आहे.',
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.message || 'SQL डाऊनलोड करताना अडचण आली.',
      });
    } finally {
      setIsDownloadingSql(false);
    }
  };

  const handleFileUploadSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatusBanner(null);

    const reader = new FileReader();
    reader.onload = () => {
      const arrBuf = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(arrBuf);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);
      setPendingRestoreTarget({
        mode: 'upload',
        fileName: file.name,
        fileBase64: base64,
        sizeBytes: file.size,
      });
    };
    reader.onerror = () => {
      setStatusBanner({
        type: 'error',
        text: 'निवडलेली बॅकअप फाइल वाचता आली नाही.',
      });
    };
    reader.readAsArrayBuffer(file);
  };

  const executeOneClickRestore = async () => {
    if (!pendingRestoreTarget) return;
    setIsRestoring(true);
    setStatusBanner(null);
    try {
      const payload =
        pendingRestoreTarget.mode === 'snapshot'
          ? { snapshotFileName: pendingRestoreTarget.fileName }
          : { fileBase64: pendingRestoreTarget.fileBase64 };

      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || 'रिस्टोअर प्रक्रिया अयशस्वी झाली.');
      }

      // Clear local stale caches so UI displays restored truth immediately
      [
        'mahasangh_dynamic_leadership_v1',
        'mahasangh_leadership_ver_v1',
        'mahasangh_leadership_ts_v1',
        'rk_officials_v1',
        'rk_officials_ts_v1',
        'rk_appointed_posts_v1',
        'rk_appointed_posts_ts_v1',
        'mahasangh_news_cache_v1',
        'mahasangh_banners_cache_v1',
        'mahasangh_gov_orders_cache_v1',
      ].forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch {}
      });

      setPendingRestoreTarget(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchSnapshotList();

      if (onRestoreCompleted) {
        await onRestoreCompleted();
      }
      window.dispatchEvent(new Event('mahasangh_leadership_updated'));

      const c = json.counts || {};
      setStatusBanner({
        type: 'success',
        text: `रिस्टोअर पूर्ण! अर्ज: ${toEnglishDigits(String(c.applications || 0))}, पदाधिकारी: ${toEnglishDigits(String(c.leaders || 0))}, नियुक्त अधिकारी: ${toEnglishDigits(String(c.officials || 0))}, बातम्या: ${toEnglishDigits(String(c.news || 0))}, फाइल्स: ${toEnglishDigits(String(json.restoredPublicFiles || 0))}. (सुरक्षा बॅकअप: ${json.safetySnapshotFileName || 'जतन'})`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.message || 'रिस्टोअर करताना त्रुटी आली.',
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDeleteSnapshot = async (fileName: string) => {
    try {
      const res = await fetch(`/api/backup/${encodeURIComponent(fileName)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.message || 'हटवता आले नाही.');
      }
      setPendingDeleteFile(null);
      await fetchSnapshotList();
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err?.message || 'फाइल हटवताना अडचण आली.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#df6b16] uppercase tracking-wider mb-1">
              <ShieldCheck className="w-4 h-4" />
              <span>सुपर ॲडमिन डेटा सुरक्षा केंद्र</span>
            </div>
            <h2 className="font-serifDevanagari text-xl sm:text-2xl font-extrabold text-[#193568]">
              १-क्लिक संपूर्ण वेबसाईट व डेटाबेस बॅकअप / रिस्टोअर
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              सर्व सदस्य अर्ज, पदाधिकारी, नियुक्त अधिकारी, बातम्या, शासन निर्णय, सेटिंग्ज आणि वेबसाईट फाइल्स एका क्लिकमध्ये सुरक्षित साठवा किंवा पुन्हा रिस्टोअर करा.
            </p>
          </div>
          <div className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 shrink-0">
            सक्रिय डेटाबेस: <span className="font-bold text-[#193568]">{activeBackend === 'mysql' ? 'HostKarle MySQL' : 'Firebase Cloud'}</span>
          </div>
        </div>

        {statusBanner && (
          <div
            className={`mt-4 p-3.5 rounded-lg text-xs sm:text-sm font-semibold flex items-start gap-2.5 border ${
              statusBanner.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : statusBanner.type === 'error'
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : 'bg-sky-50 border-sky-300 text-sky-900'
            }`}
          >
            {statusBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
            )}
            <span className="flex-1 leading-relaxed">{statusBanner.text}</span>
          </div>
        )}

        {/* Primary 1-Click Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
          {/* 1-Click Backup */}
          <div className="border border-slate-200 rounded-xl p-4 sm:p-5 bg-slate-50/70 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 font-bold text-sm sm:text-base text-[#193568]">
                <Database className="w-5 h-5 text-[#df6b16]" />
                <span>१. संपूर्ण बॅकअप घ्या (Full Backup)</span>
              </div>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                एका क्लिकमध्ये संपूर्ण डेटाबेस आणि वेबसाईट फाइल्स सर्व्हरवर सुरक्षित जतन होतात आणि{' '}
                <code className="font-mono text-[11px] bg-white px-1 py-0.5 rounded border border-slate-200">.mhsbak.gz</code>{' '}
                फाइल तुमच्या डिव्हाइसवर डाऊनलोड होते.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={handleOneClickBackupAndDownload}
                disabled={isCreatingBackup || isRestoring}
                className="flex-1 min-w-[210px] bg-[#193568] hover:bg-[#11254a] text-white font-bold text-xs sm:text-sm py-3 px-4 rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                {isCreatingBackup ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>बॅकअप तयार होत आहे...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 text-[#efb24b]" />
                    <span>१-क्लिक संपूर्ण बॅकअप घ्या</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadActiveSql}
                disabled={isDownloadingSql || isCreatingBackup}
                className="bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold text-xs py-3 px-3.5 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                title="phpMyAdmin साठी थेट SQL फाइल डाऊनलोड करा"
              >
                <FileCode2 className="w-4 h-4 text-slate-600" />
                <span>{isDownloadingSql ? 'SQL तयार होत आहे...' : '.SQL फाइल'}</span>
              </button>
            </div>
          </div>

          {/* 1-Click Restore from File */}
          <div className="border border-slate-200 rounded-xl p-4 sm:p-5 bg-slate-50/70 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 font-bold text-sm sm:text-base text-[#193568]">
                <RotateCcw className="w-5 h-5 text-emerald-700" />
                <span>२. बॅकअप फाइलवरून रिस्टोअर (Restore)</span>
              </div>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                तुमच्या फोन किंवा संगणकावर डाऊनलोड केलेली <code className="font-mono text-[11px] bg-white px-1 py-0.5 rounded border border-slate-200">.mhsbak.gz</code> बॅकअप फाइल निवडून सर्व डेटा पुन्हा पूर्ववत करा.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".gz,.mhsbak.gz,.json"
                onChange={handleFileUploadSelected}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isRestoring || isCreatingBackup}
                className="flex-1 min-w-[210px] bg-[#df6b16] hover:bg-[#c55a0d] text-white font-bold text-xs sm:text-sm py-3 px-4 rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>फाइल निवडून १-क्लिक रिस्टोअर करा</span>
              </button>
            </div>
          </div>
        </div>

        {/* Inline Restore Confirmation Dialog */}
        {pendingRestoreTarget && (
          <div className="mt-5 p-4 sm:p-5 rounded-xl bg-amber-50 border-2 border-amber-400 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs sm:text-sm text-amber-950">
                <p className="font-extrabold">रिस्टोअर निश्चित करा (Confirm Restore)</p>
                <p className="mt-1">
                  निवडलेला बॅकअप:{' '}
                  <strong className="font-mono">
                    {pendingRestoreTarget.mode === 'snapshot'
                      ? pendingRestoreTarget.label
                      : `${pendingRestoreTarget.fileName} (${formatBytes(pendingRestoreTarget.sizeBytes)})`}
                  </strong>
                </p>
                <p className="mt-1 text-amber-900">
                  टीप: रिस्टोअर सुरू करण्यापूर्वी सर्व्हर सद्यस्थितीचा एक स्वयंचलित <strong>सुरक्षा बॅकअप (Safety Snapshot)</strong> घेईल, जेणेकरून कोणताही डेटा कायमस्वरूपी जाणार नाही.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2.5 pl-7">
              <button
                type="button"
                onClick={executeOneClickRestore}
                disabled={isRestoring}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm px-5 py-2.5 rounded-lg flex items-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                {isRestoring ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>रिस्टोअर चालू आहे...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>होय, आत्ताच रिस्टोअर करा</span>
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={isRestoring}
                onClick={() => {
                  setPendingRestoreTarget(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs sm:text-sm px-4 py-2.5 rounded-lg cursor-pointer"
              >
                रद्द करा
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Saved Server Snapshots Table */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200 mb-4">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-[#193568]" />
            <h3 className="font-serifDevanagari font-bold text-base sm:text-lg text-[#193568]">
              सर्व्हरवर जतन असलेले बॅकअप्स ({toEnglishDigits(String(snapshots.length))})
            </h3>
          </div>
          <button
            type="button"
            onClick={fetchSnapshotList}
            disabled={isLoadingList}
            className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingList ? 'animate-spin' : ''}`} />
            <span>रिफ्रेश</span>
          </button>
        </div>

        {snapshots.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-xs sm:text-sm text-slate-500">
            अद्याप सर्व्हरवर एकही बॅकअप जतन केलेला नाही. वरील <strong>"१-क्लिक संपूर्ण बॅकअप घ्या"</strong> बटनावर क्लिक करून पहिला बॅकअप तयार करा.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <th className="py-2.5 px-3 font-bold">दिनांक व वेळ</th>
                  <th className="py-2.5 px-3 font-bold">बॅकअप फाइल</th>
                  <th className="py-2.5 px-3 font-bold">रेकॉर्ड तपशील</th>
                  <th className="py-2.5 px-3 font-bold text-right">आकार</th>
                  <th className="py-2.5 px-3 font-bold text-right">कृती (Actions)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {snapshots.map((snap) => {
                  const dateFormatted = formatDateWithEnglishDigits(snap.createdAt);
                  const timeStr = new Date(snap.createdAt).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <tr key={snap.fileName} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3 whitespace-nowrap tabular-nums">
                        <div className="font-bold text-slate-900">{dateFormatted}</div>
                        <div className="text-[11px] text-slate-500">{timeStr}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-mono text-[11px] font-semibold text-[#193568]">
                          {snap.fileName}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {snap.sourceBackend === 'mysql' ? 'MySQL' : snap.sourceBackend === 'mock' ? 'Preview' : 'Legacy Archive'} · {toEnglishDigits(String(snap.publicFileCount))} वेबसाईट फाइल्स
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-700 tabular-nums">
                        अर्ज: <strong>{toEnglishDigits(String(snap.counts?.applications || 0))}</strong> ·
                        पदाधिकारी: <strong>{toEnglishDigits(String(snap.counts?.leaders || 0))}</strong> ·
                        नियुक्त: <strong>{toEnglishDigits(String(snap.counts?.officials || 0))}</strong> ·
                        बातम्या: <strong>{toEnglishDigits(String(snap.counts?.news || 0))}</strong>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-slate-700 whitespace-nowrap tabular-nums">
                        {formatBytes(snap.sizeBytes)}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              triggerAuthenticatedDownload(
                                `/api/backup/download/${encodeURIComponent(snap.fileName)}`,
                                snap.fileName
                              ).catch((e) =>
                                setStatusBanner({ type: 'error', text: e?.message || 'डाऊनलोड त्रुटी' })
                              )
                            }
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md font-bold inline-flex items-center gap-1 cursor-pointer"
                            title="डाऊनलोड करा"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>डाऊनलोड</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setPendingRestoreTarget({
                                mode: 'snapshot',
                                fileName: snap.fileName,
                                label: `${snap.fileName} (${dateFormatted} ${timeStr})`,
                              })
                            }
                            disabled={isRestoring}
                            className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            title="हा बॅकअप रिस्टोअर करा"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>रिस्टोअर</span>
                          </button>

                          {pendingDeleteFile === snap.fileName ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteSnapshot(snap.fileName)}
                                className="px-2 py-1.5 bg-rose-600 text-white rounded-md font-bold text-[11px] cursor-pointer"
                              >
                                होय
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingDeleteFile(null)}
                                className="px-2 py-1.5 bg-slate-200 text-slate-700 rounded-md font-bold text-[11px] cursor-pointer"
                              >
                                नाही
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPendingDeleteFile(snap.fileName)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer"
                              title="हटवा"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

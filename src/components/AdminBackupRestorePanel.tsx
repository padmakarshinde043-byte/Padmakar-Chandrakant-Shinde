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
  Wrench,
} from 'lucide-react';
import { getAuthHeaders } from '../api/sqlBridge';
import { toEnglishDigits, formatDateWithEnglishDigits } from '../utils/formatters';

interface SchemaTableAuditRow {
  table: string;
  marathiLabel: string;
  status: 'ok' | 'created_table' | 'repaired_columns' | 'error';
  expectedColumns: number;
  existingColumnsBefore: number;
  existingColumnsAfter: number;
  addedColumns: string[];
  addedIndexes: string[];
  missingColumnsRemaining: string[];
  errorMessage?: string;
}

interface SchemaAuditReportState {
  status: 'healthy' | 'repaired' | 'partial_error' | 'mock_preview';
  activeBackend: 'mysql' | 'mock';
  checkedAt: string;
  tablesChecked: number;
  totalExpectedColumns: number;
  createdTables: string[];
  addedColumns: Array<{ table: string; column: string }>;
  addedIndexes: Array<{ table: string; index: string }>;
  errors: string[];
  tables: SchemaTableAuditRow[];
}

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
  const [schemaReport, setSchemaReport] = useState<SchemaAuditReportState | null>(null);
  const [isAuditingSchema, setIsAuditingSchema] = useState(false);

  const runSchemaAudit = async (repair: boolean) => {
    setIsAuditingSchema(true);
    try {
      const endpoint = repair ? '/api/db/schema-audit/repair' : '/api/db/schema-audit';
      const res = await fetch(endpoint, {
        method: repair ? 'POST' : 'GET',
        credentials: 'include',
        headers: {
          ...(repair ? { 'Content-Type': 'application/json' } : {}),
          ...getAuthHeaders(),
        },
        ...(repair ? { body: JSON.stringify({}) } : {}),
        cache: 'no-store',
      });
      const json = (await res.json()) as SchemaAuditReportState & { message?: string };
      if (!res.ok) {
        throw new Error(json?.message || 'Failed to check database schema.');
      }
      setSchemaReport(json);
      if (repair) {
        if (json.status === 'repaired') {
          setStatusBanner({
            type: 'success',
            text: `Schema repaired: ${toEnglishDigits(String(json.createdTables.length))} tables and ${toEnglishDigits(String(json.addedColumns.length))} missing columns created.`,
          });
        } else if (json.status === 'partial_error') {
          setStatusBanner({
            type: 'error',
            text: `Schema repair error: ${json.errors[0] || 'Schema Error'}`,
          });
        } else {
          setStatusBanner({
            type: 'success',
            text: `Schema check passed: All ${toEnglishDigits(String(json.tablesChecked))} tables and ${toEnglishDigits(String(json.totalExpectedColumns))} columns are healthy.`,
          });
        }
      }
    } catch (err: any) {
      if (repair) {
        setStatusBanner({
          type: 'error',
          text: err?.message || 'Database schema check failed.',
        });
      }
    } finally {
      setIsAuditingSchema(false);
    }
  };

  const fetchSnapshotList = async () => {
    setIsLoadingList(true);
    try {
      const res = await fetch('/api/backup/list', {
        credentials: 'include',
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to load backup list.');
      setSnapshots(Array.isArray(json.snapshots) ? json.snapshots : []);
      if (json.activeBackend) setActiveBackend(json.activeBackend);
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.message || 'Error loading backups.',
      });
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    fetchSnapshotList();
    runSchemaAudit(false);
  }, []);

  const triggerAuthenticatedDownload = async (url: string, downloadFileName: string) => {
    const res = await fetch(url, {
      credentials: 'include',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      let msg = 'Download failed.';
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
        throw new Error(json?.message || 'Backup creation failed.');
      }

      const snap = json.snapshot as BackupSnapshotSummary;
      await fetchSnapshotList();

      await triggerAuthenticatedDownload(
        `/api/backup/download/${encodeURIComponent(snap.fileName)}`,
        snap.fileName
      );

      setStatusBanner({
        type: 'success',
        text: `Full backup created & downloaded (${snap.fileName} — ${formatBytes(snap.sizeBytes)}).`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.message || 'Error creating backup.',
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
        text: 'Active database .SQL file downloaded.',
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.message || 'SQL download failed.',
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
        text: 'Failed to read selected backup file.',
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
        throw new Error(json?.message || 'Restore failed.');
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
        text: `Restore complete. Apps: ${toEnglishDigits(String(c.applications || 0))}, Leaders: ${toEnglishDigits(String(c.leaders || 0))}, Officials: ${toEnglishDigits(String(c.officials || 0))}, News: ${toEnglishDigits(String(c.news || 0))}, Files: ${toEnglishDigits(String(json.restoredPublicFiles || 0))}. (Safety snapshot: ${json.safetySnapshotFileName || 'Saved'})`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.message || 'Restore error.',
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
        throw new Error(j?.message || 'Delete failed.');
      }
      setPendingDeleteFile(null);
      await fetchSnapshotList();
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err?.message || 'Error deleting file.' });
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
              <span>Data Security</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#193568]">
              Backup &amp; Restore
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Create or restore full database and file backups in one click.
            </p>
          </div>
          <div className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 shrink-0">
            Database: <span className="font-bold text-[#193568]">{activeBackend === 'mysql' ? 'MySQL' : 'Local Mode'}</span>
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
                <span>1. Full Backup</span>
              </div>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Save database and website files to server and download{' '}
                <code className="font-mono text-[11px] bg-white px-1 py-0.5 rounded border border-slate-200">.mhsbak.gz</code>.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={handleOneClickBackupAndDownload}
                disabled={isCreatingBackup || isRestoring}
                className="flex-1 min-w-[200px] bg-[#193568] hover:bg-[#11254a] text-white font-bold text-xs sm:text-sm py-3 px-4 rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                {isCreatingBackup ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Creating Backup...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 text-[#efb24b]" />
                    <span>Create Full Backup</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadActiveSql}
                disabled={isDownloadingSql || isCreatingBackup}
                className="bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold text-xs py-3 px-3.5 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                title="Download SQL file for phpMyAdmin"
              >
                <FileCode2 className="w-4 h-4 text-slate-600" />
                <span>{isDownloadingSql ? 'Exporting...' : '.SQL File'}</span>
              </button>
            </div>
          </div>

          {/* 1-Click Restore from File */}
          <div className="border border-slate-200 rounded-xl p-4 sm:p-5 bg-slate-50/70 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 font-bold text-sm sm:text-base text-[#193568]">
                <RotateCcw className="w-5 h-5 text-emerald-700" />
                <span>2. Restore from File</span>
              </div>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Upload a saved <code className="font-mono text-[11px] bg-white px-1 py-0.5 rounded border border-slate-200">.mhsbak.gz</code> file to restore data.
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
                className="flex-1 min-w-[200px] bg-[#df6b16] hover:bg-[#c55a0d] text-white font-bold text-xs sm:text-sm py-3 px-4 rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Upload &amp; Restore</span>
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
                <p className="font-extrabold">Confirm Restore</p>
                <p className="mt-1">
                  Selected backup:{' '}
                  <strong className="font-mono">
                    {pendingRestoreTarget.mode === 'snapshot'
                      ? pendingRestoreTarget.label
                      : `${pendingRestoreTarget.fileName} (${formatBytes(pendingRestoreTarget.sizeBytes)})`}
                  </strong>
                </p>
                <p className="mt-1 text-amber-900">
                  Note: A <strong>Safety Snapshot</strong> is created automatically before restoring.
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
                    <span>Restoring...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm Restore</span>
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
                Cancel
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
            <h3 className="font-bold text-base sm:text-lg text-[#193568]">
              Server Backups ({toEnglishDigits(String(snapshots.length))})
            </h3>
          </div>
          <button
            type="button"
            onClick={fetchSnapshotList}
            disabled={isLoadingList}
            className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingList ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {snapshots.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-xs sm:text-sm text-slate-500">
            No backups saved yet. Click <strong>&ldquo;Create Full Backup&rdquo;</strong> above to create one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <th className="py-2.5 px-3 font-bold">Date &amp; Time</th>
                  <th className="py-2.5 px-3 font-bold">File</th>
                  <th className="py-2.5 px-3 font-bold">Records</th>
                  <th className="py-2.5 px-3 font-bold text-right">Size</th>
                  <th className="py-2.5 px-3 font-bold text-right">Actions</th>
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
                          {snap.sourceBackend === 'mysql' ? 'MySQL' : snap.sourceBackend === 'mock' ? 'Preview' : 'Legacy Archive'} · {toEnglishDigits(String(snap.publicFileCount))} files
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-700 tabular-nums">
                        Apps: <strong>{toEnglishDigits(String(snap.counts?.applications || 0))}</strong> ·
                        Leaders: <strong>{toEnglishDigits(String(snap.counts?.leaders || 0))}</strong> ·
                        Officials: <strong>{toEnglishDigits(String(snap.counts?.officials || 0))}</strong> ·
                        News: <strong>{toEnglishDigits(String(snap.counts?.news || 0))}</strong>
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
                                setStatusBanner({ type: 'error', text: e?.message || 'Download error' })
                              )
                            }
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md font-bold inline-flex items-center gap-1 cursor-pointer"
                            title="Download"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
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
                            title="Restore this backup"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Restore</span>
                          </button>

                          {pendingDeleteFile === snap.fileName ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteSnapshot(snap.fileName)}
                                className="px-2 py-1.5 bg-rose-600 text-white rounded-md font-bold text-[11px] cursor-pointer"
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingDeleteFile(null)}
                                className="px-2 py-1.5 bg-slate-200 text-slate-700 rounded-md font-bold text-[11px] cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPendingDeleteFile(snap.fileName)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer"
                              title="Delete"
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

      {/* MySQL 13-Table Schema Integrity & Auto-Repair Report */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-[#df6b16]" />
              <h3 className="font-bold text-base sm:text-lg text-[#193568]">
                Database Schema Check
              </h3>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Verify all database tables and auto-create missing columns.
            </p>
          </div>
          <button
            type="button"
            onClick={() => runSchemaAudit(true)}
            disabled={isAuditingSchema}
            className="bg-[#193568] hover:bg-[#11254a] disabled:opacity-60 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAuditingSchema ? 'animate-spin' : ''}`} />
            <span>{isAuditingSchema ? 'Checking...' : 'Check & Repair'}</span>
          </button>
        </div>

        {schemaReport ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 font-bold tabular-nums">
                Tables: {toEnglishDigits(String(schemaReport.tablesChecked))}
              </span>
              <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 font-bold tabular-nums">
                Columns: {toEnglishDigits(String(schemaReport.totalExpectedColumns))}
              </span>
              <span className="px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold tabular-nums">
                Added: {toEnglishDigits(String(schemaReport.addedColumns.length))}
              </span>
              {schemaReport.activeBackend === 'mock' && (
                <span className="px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                  Preview Mode (MySQL Inactive)
                </span>
              )}
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 border-b border-slate-200">
                    <th className="py-2 px-3 font-bold">Table</th>
                    <th className="py-2 px-3 font-bold text-center">Columns</th>
                    <th className="py-2 px-3 font-bold">Status</th>
                    <th className="py-2 px-3 font-bold">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {schemaReport.tables.map((t) => (
                    <tr key={t.table} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono font-semibold text-[#193568]">{t.table}</td>
                      <td className="py-2 px-3 text-center font-mono tabular-nums">
                        {toEnglishDigits(String(t.existingColumnsAfter))} / {toEnglishDigits(String(t.expectedColumns))}
                      </td>
                      <td className="py-2 px-3">
                        {t.status === 'ok' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> OK
                          </span>
                        ) : t.status === 'created_table' ? (
                          <span className="inline-flex items-center gap-1 text-sky-700 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Created
                          </span>
                        ) : t.status === 'repaired_columns' ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Repaired
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-bold">
                            <AlertCircle className="w-3.5 h-3.5" /> Error
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-600 font-mono text-[11px]">
                        {t.addedColumns.length > 0
                          ? `Added: ${t.addedColumns.join(', ')}`
                          : t.missingColumnsRemaining.length > 0
                            ? `Missing: ${t.missingColumnsRemaining.join(', ')}`
                            : t.errorMessage || 'All columns present'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-500 py-3">Loading schema report...</div>
        )}
      </div>
    </div>
  );
};

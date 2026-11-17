import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X, Share } from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../utils/usePWAInstall';

export const PWAInstallButton: React.FC<{ variant?: 'header' | 'footer' }> = ({
  variant = 'header',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Already running as installed standalone app — hide button cleanly
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop native one-tap install
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => {
          void install();
        }}
        className={
          variant === 'header'
            ? 'inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#0b1e36] to-[#13325b] hover:from-[#13325b] hover:to-[#194175] text-amber-300 border border-amber-400/60 px-2.5 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-extrabold shadow-sm transition-all cursor-pointer shrink-0'
            : 'inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0b1e36] px-3 py-1.5 text-xs font-extrabold shadow-sm transition-all cursor-pointer'
        }
        aria-label="महासंघ ॲप इन्स्टॉल करा"
        title="मोबाईलवर महासंघ ॲप इन्स्टॉल करा"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden min-[420px]:inline">ॲप इन्स्टॉल</span>
      </button>
    );
  }

  // iOS Safari fallback guide (WebKit does not support beforeinstallprompt)
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuideModal(true)}
          className={
            variant === 'header'
              ? 'inline-flex items-center gap-1.5 rounded-lg bg-slate-100 hover:bg-amber-50 text-[#0b1e36] border border-amber-500/50 px-2.5 py-1.5 text-[11px] sm:text-xs font-bold shadow-xs transition-all cursor-pointer shrink-0'
              : 'inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-amber-300 border border-amber-400/40 px-3 py-1.5 text-xs font-bold transition-all cursor-pointer'
          }
          aria-label="iPhone वर महासंघ ॲप इन्स्टॉल कसे करावे"
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden min-[420px]:inline">ॲप इन्स्टॉल</span>
        </button>

        {showGuideModal && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-pwa-title"
          >
            <div className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 p-6 shadow-2xl text-right">
              <div className="flex items-start justify-between gap-3 text-left">
                <div>
                  <h3 id="ios-pwa-title" className="text-base font-extrabold text-[#0b1e36]">
                    iPhone / iPad वर महासंघ ॲप इन्स्टॉल करा
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    एकदम साधी २ पायऱ्यांची पद्धत:
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                  aria-label="बंद करा"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <ol className="mt-4 space-y-2.5 text-sm text-slate-700 text-left bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <li className="flex items-start gap-2">
                  <span className="font-extrabold text-amber-600 shrink-0">१.</span>
                  <span>
                    खालील Safari पट्टीतील{' '}
                    <strong className="inline-flex items-center gap-1 text-[#0b1e36]">
                      Share <Share className="w-3.5 h-3.5 inline" />
                    </strong>{' '}
                    बटणावर टॅप करा.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-extrabold text-amber-600 shrink-0">२.</span>
                  <span>
                    खाली स्क्रोल करून <strong className="text-[#0b1e36]">"Add to Home Screen"</strong> निवडा व <strong className="text-[#0b1e36]">Add</strong> वर टॅप करा.
                  </span>
                </li>
              </ol>

              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="mt-4 w-full rounded-xl bg-[#0b1e36] hover:bg-[#13325b] py-2.5 text-sm font-bold text-white cursor-pointer transition-colors"
              >
                समजले, बंद करा
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-[90] flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg border border-amber-300/40"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>इंटरनेट संपर्क बंद आहे — ऑफलाईन मोड सुरू आहे.</span>
    </div>
  );
};

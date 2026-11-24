import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../utils/usePWAInstall';

export const PWAInstallButton: React.FC<{ variant?: 'header' | 'footer' }> = () => {
  // Browser "Install to Home Screen" / "Open in App" prompts are intentionally disabled
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

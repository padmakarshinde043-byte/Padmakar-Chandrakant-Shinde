import React, { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Check, X } from 'lucide-react';
import {
  isPushSupported,
  getPushPermissionState,
  getActivePushSubscription,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from '../utils/pushClient';

const DISMISS_KEY = 'mhs_push_prompt_dismissed_at_v1';
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const HeaderPushBellButton: React.FC = () => {
  const [supported, setSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const refreshState = async () => {
    if (!isPushSupported()) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const sub = await getActivePushSubscription();
    setIsSubscribed(Boolean(sub && Notification.permission === 'granted'));
  };

  useEffect(() => {
    refreshState();
    const handler = () => {
      refreshState();
    };
    window.addEventListener('mahasangh_push_status_changed', handler);
    return () => window.removeEventListener('mahasangh_push_status_changed', handler);
  }, []);

  if (!supported) {
    return (
      <div
        className="min-w-10 min-[380px]:min-w-12 sm:min-w-16 md:min-w-20 shrink-0"
        aria-hidden="true"
      />
    );
  }

  const showTempToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 3200);
  };

  const handleToggle = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      if (isSubscribed) {
        await unsubscribeFromPushNotifications();
        setIsSubscribed(false);
        showTempToast('नोटिफिकेशन बंद केले आहे.');
      } else {
        const res = await subscribeToPushNotifications();
        if (res.ok) {
          setIsSubscribed(true);
          showTempToast('नोटिफिकेशन सुरू झाले! ताज्या सूचना थेट मिळतील.');
        } else {
          showTempToast(res.reason || 'नोटिफिकेशन सुरू होऊ शकले नाही.');
        }
      }
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="relative flex items-center justify-end min-w-10 min-[380px]:min-w-12 sm:min-w-16 md:min-w-20 shrink-0">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isBusy}
        title={isSubscribed ? 'पुश नोटिफिकेशन सुरू आहे (बंद करण्यासाठी क्लिक करा)' : 'ताज्या बातम्या व GR साठी पुश नोटिफिकेशन सुरू करा'}
        aria-label={isSubscribed ? 'पुश नोटिफिकेशन सुरू आहे' : 'पुश नोटिफिकेशन सुरू करा'}
        className={`relative flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full border transition-all cursor-pointer disabled:opacity-50 ${
          isSubscribed
            ? 'bg-emerald-50 border-emerald-400 text-emerald-700 hover:bg-emerald-100 shadow-xs'
            : 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100 shadow-xs'
        }`}
      >
        {isSubscribed ? (
          <BellRing className="w-4 h-4 sm:w-5 sm:h-5" />
        ) : (
          <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
        )}
        <span
          className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
            isSubscribed ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
          }`}
        />
      </button>

      {toastMsg && (
        <div
          role="status"
          className="fixed top-20 right-3 sm:right-6 z-[95] max-w-xs rounded-xl bg-[#0b1e36] text-white text-xs font-bold px-3.5 py-2.5 shadow-xl border border-amber-400/50 flex items-center gap-2"
        >
          {isSubscribed ? (
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <BellOff className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
};

interface PushNotificationPromptProps {
  disabled?: boolean;
}

export const PushNotificationPrompt: React.FC<PushNotificationPromptProps> = ({ disabled = false }) => {
  const [visible, setVisible] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (disabled || !isPushSupported()) return;

    const perm = getPushPermissionState();
    if (perm === 'granted' || perm === 'denied') return;

    try {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || '0');
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) {
        return;
      }
    } catch {}

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      const existing = await getActivePushSubscription();
      if (!cancelled && !existing && getPushPermissionState() === 'default') {
        setVisible(true);
      }
    }, 3500);

    const onStatusChanged = (ev: Event) => {
      const subscribed = Boolean((ev as CustomEvent)?.detail?.subscribed);
      if (subscribed) setVisible(false);
    };
    window.addEventListener('mahasangh_push_status_changed', onStatusChanged);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('mahasangh_push_status_changed', onStatusChanged);
    };
  }, [disabled]);

  if (!visible || disabled) return null;

  const handleDismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  };

  const handleEnable = async () => {
    setIsSubscribing(true);
    setFeedback(null);
    const result = await subscribeToPushNotifications();
    setIsSubscribing(false);
    if (result.ok) {
      setVisible(false);
    } else {
      setFeedback(result.reason || 'परवानगी मिळाली नाही.');
      window.setTimeout(() => setVisible(false), 2800);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="पुश नोटिफिकेशन सुरू करा"
      className="fixed bottom-4 right-3 left-3 sm:left-auto sm:right-5 sm:w-[360px] z-[85] rounded-2xl bg-white border border-amber-300 shadow-2xl p-4 text-slate-800"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0b1e36] text-amber-400 flex items-center justify-center shrink-0">
          <BellRing className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-serifDevanagari text-sm font-extrabold text-[#0b1e36] leading-snug">
              ताज्या बातम्या व GR नोटिफिकेशन
            </h3>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="बंद करा"
              className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            महासंघाचे नवीन शासन निर्णय, परिपत्रके व महत्त्वाच्या सूचना थेट तुमच्या मोबाईलवर मिळवा.
          </p>
          {feedback && (
            <p className="text-[11px] font-bold text-rose-700 mt-1.5">{feedback}</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleEnable}
              disabled={isSubscribing}
              className="flex-1 bg-[#0b1e36] hover:bg-[#193568] text-amber-300 text-xs font-extrabold px-3 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSubscribing ? 'सुरू होत आहे...' : 'नोटिफिकेशन सुरू करा'}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              नंतर
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

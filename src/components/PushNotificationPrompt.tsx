import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Bell, BellRing, CheckCheck, Clock, ExternalLink, RefreshCw, X } from 'lucide-react';
import {
  isPushSupported,
  getPushPermissionState,
  subscribeToPushNotifications,
  syncPushSubscriptionIfGranted,
  fetchPublicPushNotifications,
  PublicPushNotification,
} from '../utils/pushClient';

const ONETIME_PERMISSION_ASKED_KEY = 'mhs_push_onetime_asked_v1';
const READ_NOTIFICATION_IDS_KEY = 'mhs_push_read_ids_v1';
const MAX_STORED_READ_IDS = 200;

function readStoredReadIds(): Set<string> {
  try {
    if (typeof localStorage === 'undefined') return new Set();
    const raw = localStorage.getItem(READ_NOTIFICATION_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string' && v.length > 0));
  } catch {
    return new Set();
  }
}

function saveStoredReadIds(ids: Set<string>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const arr = Array.from(ids).slice(-MAX_STORED_READ_IDS);
    localStorage.setItem(READ_NOTIFICATION_IDS_KEY, JSON.stringify(arr));
  } catch {
    // ignore storage quota issues
  }
}

function formatNotificationDateTime(iso: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  try {
    return dt.toLocaleString('mr-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dt.toLocaleString('en-IN');
  }
}

function getRouteLabel(url: string): string {
  switch (url) {
    case '/news':
      return 'बातम्या';
    case '/circulars':
      return 'शासन निर्णय व परिपत्रके';
    case '/membership':
      return 'सदस्यत्व नोंदणी';
    case '/district-leadership':
      return 'जिल्हा नेतृत्व';
    case '/appointments':
      return 'जिल्हा पदाधिकारी';
    case '/leadership':
      return 'राज्य नेतृत्व';
    case '/contact':
      return 'संपर्क';
    default:
      return 'मुख्यपृष्ठ';
  }
}

interface HeaderPushBellButtonProps {
  onNavigatePath?: (path: string) => void;
}

/**
 * Top-right Header Notification Center:
 * Displays all sent Mahasangh notifications with Read (उघडलेले) and Unread (न उघडलेले)
 * badges, unread count indicator on the bell, filter tabs, and tap-to-open navigation.
 */
export const HeaderPushBellButton: React.FC<HeaderPushBellButtonProps> = ({ onNavigatePath }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<PublicPushNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => readStoredReadIds());
  const [isLoading, setIsLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'unread' | 'read'>('all');
  const containerRef = useRef<HTMLDivElement | null>(null);

  const loadInbox = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsLoading(true);
    try {
      const list = await fetchPublicPushNotifications();
      setNotifications(list);
    } finally {
      if (showSpinner) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInbox(false);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadInbox(false);
      }
    }, 120_000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadInbox(false);
      }
    };
    const onRefreshEvent = () => {
      loadInbox(false);
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('mahasangh_push_inbox_refresh', onRefreshEvent);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('mahasangh_push_inbox_refresh', onRefreshEvent);
    };
  }, [loadInbox]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (ev: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const unreadCount = useMemo(
    () => notifications.reduce((acc, item) => (readIds.has(item.id) ? acc : acc + 1), 0),
    [notifications, readIds]
  );

  const readCount = notifications.length - unreadCount;

  const visibleNotifications = useMemo(() => {
    if (filterMode === 'unread') return notifications.filter((n) => !readIds.has(n.id));
    if (filterMode === 'read') return notifications.filter((n) => readIds.has(n.id));
    return notifications;
  }, [notifications, readIds, filterMode]);

  const markAsRead = useCallback((id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      saveStoredReadIds(next);
      return next;
    });
  }, []);

  const markAllAsRead = useCallback(() => {
    if (notifications.length === 0) return;
    setReadIds((prev) => {
      const next = new Set(prev);
      for (const n of notifications) {
        next.add(n.id);
      }
      saveStoredReadIds(next);
      return next;
    });
  }, [notifications]);

  const handleToggleOpen = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen) {
      loadInbox(notifications.length === 0);
    }
  };

  const handleNotificationClick = (item: PublicPushNotification) => {
    markAsRead(item.id);
    setIsOpen(false);
    if (onNavigatePath) {
      onNavigatePath(item.url || '/');
    } else if (item.url && item.url.startsWith('/')) {
      window.location.assign(item.url);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-end min-w-10 min-[380px]:min-w-12 sm:min-w-16 md:min-w-20 shrink-0"
    >
      <button
        type="button"
        onClick={handleToggleOpen}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title={
          unreadCount > 0
            ? `नोटिफिकेशन केंद्र (${unreadCount} न उघडलेले)`
            : 'सर्व नोटिफिकेशन पहा'
        }
        aria-label={
          unreadCount > 0
            ? `नोटिफिकेशन पहा — ${unreadCount} न उघडलेले`
            : 'सर्व नोटिफिकेशन पहा'
        }
        className={`relative flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full border transition-all cursor-pointer ${
          isOpen
            ? 'bg-[#0b1e36] border-[#0b1e36] text-amber-300 shadow-md'
            : unreadCount > 0
              ? 'bg-amber-50 border-amber-400 text-[#0b1e36] hover:bg-amber-100 shadow-xs'
              : 'bg-slate-50 border-slate-300 text-[#0b1e36] hover:bg-slate-100 shadow-xs'
        }`}
      >
        {unreadCount > 0 ? (
          <BellRing className="w-4 h-4 sm:w-5 sm:h-5" />
        ) : (
          <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
        )}

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-black leading-none flex items-center justify-center border-2 border-white shadow-sm">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="नोटिफिकेशन यादी"
          className="fixed sm:absolute top-[74px] sm:top-12 right-2 left-2 sm:left-auto sm:right-0 sm:w-[395px] z-[95] rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[78vh] sm:max-h-[540px]"
        >
          {/* Header */}
          <div className="bg-[#0b1e36] text-white px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="font-serifDevanagari text-sm font-extrabold leading-tight truncate">
                  महासंघ नोटिफिकेशन
                </h3>
                <p className="text-[11px] text-slate-300 leading-tight mt-0.5">
                  एकूण {notifications.length} • न उघडलेले {unreadCount}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => loadInbox(true)}
                disabled={isLoading}
                title="रिफ्रेश करा"
                aria-label="नोटिफिकेशन रिफ्रेश करा"
                className="p-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="बंद करा"
                aria-label="नोटिफिकेशन पॅनेल बंद करा"
                className="p-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter & Mark All Read Bar */}
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-[#0b1e36] text-amber-300'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                सर्व ({notifications.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('unread')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                  filterMode === 'unread'
                    ? 'bg-rose-600 text-white'
                    : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${filterMode === 'unread' ? 'bg-white' : 'bg-rose-600'}`} />
                न उघडलेले ({unreadCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('read')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  filterMode === 'read'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                उघडलेले ({readCount})
              </button>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-[11px] font-extrabold text-[#193568] hover:text-amber-700 flex items-center gap-1 cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                सर्व वाचले
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="overflow-y-auto divide-y divide-slate-100 bg-white flex-1">
            {isLoading && notifications.length === 0 ? (
              <div className="py-10 px-4 text-center text-xs font-semibold text-slate-500">
                नोटिफिकेशन लोड होत आहेत...
              </div>
            ) : visibleNotifications.length === 0 ? (
              <div className="py-10 px-5 text-center">
                <div className="w-11 h-11 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2.5">
                  <Bell className="w-5 h-5" />
                </div>
                <p className="text-sm font-bold text-slate-700">
                  {filterMode === 'unread'
                    ? 'सर्व नोटिफिकेशन उघडून वाचले आहेत.'
                    : filterMode === 'read'
                      ? 'अद्याप कोणतेही नोटिफिकेशन उघडलेले नाही.'
                      : 'सध्या कोणतेही नोटिफिकेशन उपलब्ध नाही.'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  महासंघाच्या ताज्या सूचना व शासन निर्णय येथे दिसतील.
                </p>
              </div>
            ) : (
              visibleNotifications.map((item) => {
                const isRead = readIds.has(item.id);
                const formattedTime = formatNotificationDateTime(item.createdAt);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNotificationClick(item)}
                    className={`w-full text-left px-3.5 py-3 transition-colors cursor-pointer relative flex items-start gap-2.5 ${
                      isRead
                        ? 'bg-white hover:bg-slate-50/90'
                        : 'bg-amber-50/75 hover:bg-amber-100/70'
                    }`}
                  >
                    {/* Left unread vertical bar */}
                    {!isRead && (
                      <span
                        className="absolute left-0 top-0 bottom-0 w-1 bg-[#df6b16]"
                        aria-hidden="true"
                      />
                    )}

                    {/* Status icon / dot */}
                    <div className="pt-1 shrink-0">
                      {isRead ? (
                        <span
                          title="उघडलेले (Read)"
                          className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center"
                        >
                          <CheckCheck className="w-3 h-3" />
                        </span>
                      ) : (
                        <span
                          title="न उघडलेले (Unread)"
                          className="w-5 h-5 rounded-full bg-rose-100 border border-rose-300 flex items-center justify-center"
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
                        </span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4
                          className={`text-xs sm:text-[13px] leading-snug break-words ${
                            isRead
                              ? 'font-bold text-slate-700'
                              : 'font-black text-[#0b1e36]'
                          }`}
                        >
                          {item.title}
                        </h4>
                        <span
                          className={`shrink-0 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md border ${
                            isRead
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-600 text-white border-rose-600'
                          }`}
                        >
                          {isRead ? 'उघडलेले' : 'Unread'}
                        </span>
                      </div>

                      {item.body && (
                        <p
                          className={`text-xs mt-1 leading-relaxed break-words ${
                            isRead ? 'text-slate-500' : 'text-slate-700 font-medium'
                          }`}
                        >
                          {item.body}
                        </p>
                      )}

                      <div className="mt-2 flex items-center justify-between gap-2 text-[10.5px] text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 shrink-0" />
                          {formattedTime || 'ताजी सूचना'}
                        </span>
                        <span className="inline-flex items-center gap-1 font-bold text-[#193568]">
                          {getRouteLabel(item.url)}
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface PushNotificationPromptProps {
  disabled?: boolean;
}

/**
 * One-Time Notification Permission Flow:
 * - If permission is already granted (e.g., via Android 13+ TWA app install permission),
 *   silently registers & syncs the push subscription in the background.
 * - Otherwise, asks for permission strictly ONCE on first app launch and records
 *   `mhs_push_onetime_asked_v1` so it never repeats.
 */
export const PushNotificationPrompt: React.FC<PushNotificationPromptProps> = ({ disabled = false }) => {
  const [visible, setVisible] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (disabled || !isPushSupported()) return;

    const perm = getPushPermissionState();

    // If already granted (e.g., on TWA install or previous grant), sync silently without UI
    if (perm === 'granted') {
      try {
        localStorage.setItem(ONETIME_PERMISSION_ASKED_KEY, '1');
      } catch {}
      syncPushSubscriptionIfGranted().catch(() => {});
      return;
    }

    // If explicitly blocked/denied, mark asked and never prompt
    if (perm === 'denied') {
      try {
        localStorage.setItem(ONETIME_PERMISSION_ASKED_KEY, '1');
      } catch {}
      return;
    }

    // Strictly one-time check: if already prompted once, never prompt again
    try {
      if (localStorage.getItem(ONETIME_PERMISSION_ASKED_KEY) === '1') {
        return;
      }
    } catch {}

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled && getPushPermissionState() === 'default') {
        setVisible(true);
      }
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [disabled]);

  if (!visible || disabled) return null;

  const markAskedOnce = () => {
    try {
      localStorage.setItem(ONETIME_PERMISSION_ASKED_KEY, '1');
    } catch {}
  };

  const handleDeclineOnce = () => {
    markAskedOnce();
    setVisible(false);
  };

  const handleAllowOnce = async () => {
    setIsSubscribing(true);
    setFeedback(null);
    markAskedOnce();
    const result = await subscribeToPushNotifications();
    setIsSubscribing(false);
    if (result.ok) {
      setVisible(false);
    } else {
      setFeedback(result.reason || 'परवानगी मिळाली नाही.');
      window.setTimeout(() => setVisible(false), 2600);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="नोटिफिकेशन एकवेळ परवानगी"
      className="fixed inset-0 z-[95] bg-[#0b1e36]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-3 sm:p-4"
    >
      <div className="w-full max-w-[380px] rounded-2xl bg-white border border-amber-300 shadow-2xl p-5 text-slate-800">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#0b1e36] text-amber-400 flex items-center justify-center shrink-0 shadow-sm">
            <BellRing className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-serifDevanagari text-base font-extrabold text-[#0b1e36] leading-snug">
                नोटिफिकेशन परवानगी (एकदाच)
              </h3>
              <button
                type="button"
                onClick={handleDeclineOnce}
                aria-label="बंद करा"
                className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs sm:text-[13px] text-slate-600 mt-1.5 leading-relaxed">
              महासंघाचे नवीन शासन निर्णय (GR), परिपत्रके व महत्त्वाच्या सूचना थेट मोबाईलवर मिळवण्यासाठी एकदाच परवानगी द्या.
            </p>
            {feedback && (
              <p className="text-xs font-bold text-rose-700 mt-2">{feedback}</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleAllowOnce}
            disabled={isSubscribing}
            className="flex-1 bg-[#0b1e36] hover:bg-[#193568] text-amber-300 text-xs sm:text-sm font-extrabold px-4 py-2.5 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            {isSubscribing ? 'परवानगी सुरू होत आहे...' : 'परवानगी द्या (Allow)'}
          </button>
          <button
            type="button"
            onClick={handleDeclineOnce}
            disabled={isSubscribing}
            className="px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            आता नको
          </button>
        </div>
      </div>
    </div>
  );
};

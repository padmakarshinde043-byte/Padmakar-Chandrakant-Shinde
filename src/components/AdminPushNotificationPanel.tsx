import React, { useEffect, useState } from 'react';
import { Bell, BellRing, Send, RefreshCw, CheckCircle2, AlertCircle, Smartphone, Clock, ExternalLink } from 'lucide-react';
import { getAuthHeaders } from '../api/sqlBridge';
import { toEnglishDigits, formatDateWithEnglishDigits } from '../utils/formatters';
import {
  isPushSupported,
  getActivePushSubscription,
  subscribeToPushNotifications,
} from '../utils/pushClient';

interface PushLogItem {
  id: string;
  title: string;
  body: string;
  url: string;
  sentBy: string;
  createdAt: string;
  totalTargeted: number;
  sentCount: number;
  failedCount: number;
  removedExpiredCount: number;
}

const TARGET_PAGE_OPTIONS = [
  { label: 'मुख्यपृष्ठ (Home)', value: '/' },
  { label: 'बातम्या (News)', value: '/news' },
  { label: 'शासन निर्णय व परिपत्रके (GR & Circulars)', value: '/circulars' },
  { label: 'सदस्यत्व नोंदणी व सभासद यादी (Membership)', value: '/membership' },
  { label: 'जिल्हा नेतृत्व (District Leadership)', value: '/district-leadership' },
  { label: 'जिल्हा पदाधिकारी व नियुक्ती पत्रे (Appointments)', value: '/appointments' },
  { label: 'राज्य नेतृत्व (State Leadership)', value: '/leadership' },
  { label: 'संपर्क (Contact)', value: '/contact' },
];

const QUICK_TEMPLATES = [
  {
    label: 'नवीन शासन निर्णय (GR)',
    title: 'नवीन शासन निर्णय (GR) प्रसिद्ध!',
    body: 'शिक्षण विभागाचा नवीन शासन निर्णय / परिपत्रक महासंघाच्या पोर्टलवर अपलोड करण्यात आले आहे. पाहण्यासाठी येथे क्लिक करा.',
    url: '/circulars',
  },
  {
    label: 'ताजी बातमी',
    title: 'महासंघाची ताजी बातमी व घडामोड',
    body: 'महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघाची नवीन महत्त्वाची बातमी प्रसिद्ध झाली आहे. सविस्तर वाचा.',
    url: '/news',
  },
  {
    label: 'सदस्यत्व आवाहन',
    title: 'आजीवन सदस्यत्व नोंदणी सुरू आहे',
    body: 'महासंघाचे आजीवन सभासद होण्यासाठी व आपले डिजिटल ओळखपत्र (ID Card) डाऊनलोड करण्यासाठी येथे क्लिक करा.',
    url: '/membership',
  },
];

export const AdminPushNotificationPanel: React.FC = () => {
  const [subscriberCount, setSubscriberCount] = useState<number>(0);
  const [logs, setLogs] = useState<PushLogItem[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(true);
  const [title, setTitle] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [targetUrl, setTargetUrl] = useState<string>('/news');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [thisDeviceSubscribed, setThisDeviceSubscribed] = useState<boolean>(false);

  const loadStats = async () => {
    setIsLoadingStats(true);
    try {
      const res = await fetch('/api/push/stats', {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSubscriberCount(Number(data.subscriberCount || 0));
        setLogs(Array.isArray(data.logs) ? data.logs : []);
      } else {
        setStatusMsg({ text: data?.message || 'पुश आकडेवारी लोड करताना त्रुटी आली.', type: 'error' });
      }
    } catch {
      setStatusMsg({ text: 'सर्व्हरशी संपर्क होऊ शकला नाही.', type: 'error' });
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    loadStats();
    if (isPushSupported()) {
      getActivePushSubscription().then((sub) => {
        setThisDeviceSubscribed(Boolean(sub && Notification.permission === 'granted'));
      });
    }
  }, []);

  const handleSubscribeThisDevice = async () => {
    const result = await subscribeToPushNotifications();
    if (result.ok) {
      setThisDeviceSubscribed(true);
      setStatusMsg({ text: 'तुमचा हा मोबाईल/ब्राउझर चाचणीसाठी पुश नोटिफिकेशनशी जोडला गेला आहे!', type: 'success' });
      loadStats();
    } else {
      setStatusMsg({ text: result.reason || 'नोटिफिकेशन सुरू करता आले नाही.', type: 'error' });
    }
  };

  const handleSendPush = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (!cleanTitle || !cleanBody) {
      setStatusMsg({ text: 'कृपया शीर्षक (Title) आणि संदेश (Message) दोन्ही भरा.', type: 'error' });
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          title: cleanTitle,
          body: cleanBody,
          url: targetUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusMsg({ text: data?.message || 'पुश नोटिफिकेशन पाठवताना त्रुटी आली.', type: 'error' });
        return;
      }

      const log: PushLogItem | undefined = data.log;
      setStatusMsg({
        text: log
          ? `पुश नोटिफिकेशन यशस्वीरित्या पाठवले! पोहोचले: ${toEnglishDigits(log.sentCount)} / ${toEnglishDigits(log.totalTargeted)}${log.removedExpiredCount > 0 ? ` (कालबाह्य काढले: ${toEnglishDigits(log.removedExpiredCount)})` : ''}`
          : 'पुश नोटिफिकेशन पाठवले गेले!',
        type: 'success',
      });
      setTitle('');
      setBody('');
      window.dispatchEvent(new CustomEvent('mahasangh_push_inbox_refresh'));
      await loadStats();
    } catch (err: any) {
      setStatusMsg({ text: err?.message || 'सर्व्हर त्रुटी.', type: 'error' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-white p-4 sm:p-6 rounded-2xl border border-[#e7ded1] shadow-xs space-y-6">
      {/* Header */}
      <div className="border-b border-[#e7ded1] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#193568] bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md mb-1.5">
            <BellRing className="w-3.5 h-3.5 text-[#df6b16]" />
            <span>Web &amp; TWA App Push Broadcast</span>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-[#0b1e36]">
            पुश नोटिफिकेशन कक्ष (Push Notifications)
          </h3>
          <p className="text-xs text-[#607184] mt-0.5">
            वेबसाईट व Play Store (in.mahasangh.twa) ॲपवरील सर्व नोंदणीकृत मोबाईलवर एका क्लिकवर मोफत नोटिफिकेशन पाठवा.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3.5 py-2 rounded-xl bg-[#0b1e36] text-white flex items-center gap-2 text-xs font-bold">
            <Smartphone className="w-4 h-4 text-[#efb24b]" />
            <span>सक्रिय डिव्हाइसेस:</span>
            <span className="font-mono text-sm text-[#efb24b] tabular-nums">
              {isLoadingStats ? '...' : toEnglishDigits(subscriberCount)}
            </span>
          </div>
          <button
            type="button"
            onClick={loadStats}
            disabled={isLoadingStats}
            className="min-h-[38px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0b1e36] text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStats ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Test subscription helper for admin's own device */}
      {isPushSupported() && !thisDeviceSubscribed && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-amber-950">
            <Bell className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>चाचणी टिप:</strong> नोटिफिकेशन तुमच्या स्वतःच्या मोबाईलवर/ब्राउझरवर तपासून पाहण्यासाठी प्रथम हे डिव्हाइस नोटिफिकेशनशी जोडून घ्या.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSubscribeThisDevice}
            className="shrink-0 bg-[#193568] hover:bg-[#0b1e36] text-white text-xs font-bold px-3.5 py-2 rounded-lg cursor-pointer"
          >
            माझे डिव्हाइस जोडा (Test)
          </button>
        </div>
      )}

      {/* Status Alert */}
      {statusMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs sm:text-sm font-semibold flex items-center gap-2.5 ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Compose Form + Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <form onSubmit={handleSendPush} className="lg:col-span-2 space-y-4 bg-[#fbf8f2] border border-[#e7ded1] rounded-2xl p-4 sm:p-5">
          {/* Quick Templates */}
          <div>
            <span className="block text-xs font-bold text-[#607184] mb-2">
              तयार नमुने (Quick Templates):
            </span>
            <div className="flex flex-wrap gap-2">
              {QUICK_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => {
                    setTitle(tpl.title);
                    setBody(tpl.body);
                    setTargetUrl(tpl.url);
                  }}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white border border-[#e7ded1] hover:border-amber-500 text-[#0b1e36] transition-colors cursor-pointer"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#0b1e36] mb-1.5">
              नोटिफिकेशन शीर्षक (Title) <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              maxLength={120}
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="उदा. नवीन शासन निर्णय (GR) प्रसिद्ध!"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-[#0b1e36] focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#0b1e36] mb-1.5">
              संदेश (Message) <span className="text-rose-600">*</span>
            </label>
            <textarea
              rows={3}
              maxLength={500}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="सभासदांना पाठवायचा थोडक्यात संदेश येथे लिहा..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-[#0b1e36] focus:outline-none focus:border-amber-500 resize-y"
            />
            <div className="text-[11px] text-slate-500 text-right mt-0.5 font-mono">
              {toEnglishDigits(body.length)} / 500
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#0b1e36] mb-1.5">
              क्लिक केल्यावर कोणते पान उघडावे (Target Page)
            </label>
            <select
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-[#0b1e36] focus:outline-none focus:border-amber-500"
            >
              {TARGET_PAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={isSending || subscriberCount === 0}
            className="w-full min-h-[46px] rounded-xl bg-[#0b1e36] hover:bg-[#193568] text-[#efb24b] font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            <Send className={`w-4 h-4 ${isSending ? 'animate-pulse' : ''}`} />
            <span>
              {isSending
                ? 'नोटिफिकेशन पाठवत आहे...'
                : subscriberCount === 0
                ? 'अद्याप कोणतेही डिव्हाइस नोंदणीकृत नाही'
                : `सर्व ${toEnglishDigits(subscriberCount)} डिव्हाइसेसवर पाठवा`}
            </span>
          </button>
        </form>

        {/* Live Android Notification Preview */}
        <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4 border border-slate-700">
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              मोबाईलवरील प्रिव्ह्यू (Live Preview)
            </p>
            <div className="bg-white text-slate-900 rounded-2xl p-3.5 shadow-lg space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5 font-bold text-[#0b1e36]">
                  <img
                    src="/pwa-192x192.png"
                    alt="Mahasangh"
                    className="w-4 h-4 rounded-full object-contain border border-amber-400"
                  />
                  केंद्रप्रमुख व अधिकारी महासंघ
                </span>
                <span>आत्ताच</span>
              </div>
              <p className="text-sm font-extrabold text-[#0b1e36] leading-snug break-words">
                {title.trim() || 'नोटिफिकेशनचे शीर्षक येथे दिसेल'}
              </p>
              <p className="text-xs text-slate-600 leading-relaxed break-words">
                {body.trim() || 'तुम्ही लिहिलेला संदेश मोबाईलच्या नोटिफिकेशन बारमध्ये असा दिसेल.'}
              </p>
            </div>
          </div>
          <div className="text-[11px] text-slate-300 leading-relaxed bg-white/10 rounded-xl p-3">
            <strong className="text-amber-300">लक्ष्य पान:</strong>{' '}
            <span className="font-mono">{targetUrl}</span>
          </div>
        </div>
      </div>

      {/* Broadcast History */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold text-[#0b1e36] flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#df6b16]" />
          <span>पाठवलेल्या नोटिफिकेशनचा इतिहास ({toEnglishDigits(logs.length)})</span>
        </h4>

        {logs.length === 0 ? (
          <div className="text-center py-8 bg-[#fbf8f2] rounded-xl border border-[#e7ded1] text-xs text-slate-500">
            अद्याप कोणतेही पुश नोटिफिकेशन पाठवलेले नाही.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#e7ded1]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#0b1e36] text-white">
                  <th className="p-3">दिनांक / वेळ</th>
                  <th className="p-3">शीर्षक व संदेश</th>
                  <th className="p-3">पान</th>
                  <th className="p-3 text-center">पोहोचले</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="p-3 whitespace-nowrap font-mono text-slate-600">
                      {formatDateWithEnglishDigits(log.createdAt)}
                    </td>
                    <td className="p-3 max-w-md">
                      <div className="font-bold text-[#0b1e36]">{log.title}</div>
                      <div className="text-slate-600 mt-0.5 line-clamp-2">{log.body}</div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                        <ExternalLink className="w-3 h-3" />
                        {log.url}
                      </span>
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold font-mono">
                        {toEnglishDigits(log.sentCount)} / {toEnglishDigits(log.totalTargeted)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export type PushPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    window.isSecureContext
  );
}

export function getPushPermissionState(): PushPermissionState {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission as PushPermissionState;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function getActivePushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeToPushNotifications(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (!isPushSupported()) {
    return { ok: false, reason: 'या ब्राउझरमध्ये पुश नोटिफिकेशन उपलब्ध नाही.' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        ok: false,
        reason:
          permission === 'denied'
            ? 'तुम्ही ब्राउझर सेटिंगमध्ये नोटिफिकेशन ब्लॉक केले आहे.'
            : 'नोटिफिकेशन परवानगी नाकारली गेली.',
      };
    }

    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const keyRes = await fetch('/api/push/public-key', { cache: 'no-store' });
      const keyData = await keyRes.json().catch(() => ({}));
      if (!keyRes.ok || !keyData?.publicKey) {
        return { ok: false, reason: 'सर्व्हरवरून नोटिफिकेशन की मिळू शकली नाही.' };
      }

      const appServerKey = urlBase64ToUint8Array(String(keyData.publicKey));
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey.buffer as ArrayBuffer,
      });
    }

    const subJson = subscription.toJSON();
    const saveRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: {
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        },
        userAgent: navigator.userAgent,
      }),
    });

    if (!saveRes.ok) {
      return { ok: false, reason: 'नोटिफिकेशन नोंदणी सेव्ह करताना अडचण आली.' };
    }

    try {
      localStorage.setItem('mhs_push_subscribed_v1', '1');
    } catch {}

    window.dispatchEvent(new CustomEvent('mahasangh_push_status_changed', { detail: { subscribed: true } }));
    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      reason: err?.message || 'नोटिफिकेशन सुरू करताना तांत्रिक अडचण आली.',
    };
  }
}

export interface PublicPushNotification {
  id: string;
  title: string;
  body: string;
  url: string;
  createdAt: string;
}

export async function fetchPublicPushNotifications(): Promise<PublicPushNotification[]> {
  try {
    const res = await fetch('/api/push/inbox', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    if (!Array.isArray(data?.notifications)) return [];
    return data.notifications
      .filter((item: any) => item && typeof item.id === 'string' && typeof item.title === 'string')
      .map((item: any) => ({
        id: String(item.id),
        title: String(item.title),
        body: String(item.body || ''),
        url: typeof item.url === 'string' && item.url.startsWith('/') ? item.url : '/',
        createdAt: String(item.createdAt || ''),
      }));
  } catch {
    return [];
  }
}

/**
 * If notification permission is already granted (e.g., via Android TWA install prompt
 * or previous one-time grant), silently register/sync the Web Push subscription with
 * the backend without prompting the user again.
 */
export async function syncPushSubscriptionIfGranted(): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const keyRes = await fetch('/api/push/public-key', { cache: 'no-store' });
      const keyData = await keyRes.json().catch(() => ({}));
      if (!keyRes.ok || !keyData?.publicKey) return false;

      const appServerKey = urlBase64ToUint8Array(String(keyData.publicKey));
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey.buffer as ArrayBuffer,
      });
    }

    const subJson = subscription.toJSON();
    const saveRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: {
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        },
        userAgent: navigator.userAgent,
      }),
    });

    if (saveRes.ok) {
      try {
        localStorage.setItem('mhs_push_subscribed_v1', '1');
      } catch {}
      window.dispatchEvent(new CustomEvent('mahasangh_push_status_changed', { detail: { subscribed: true } }));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const sub = await getActivePushSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      }).catch(() => {});
    }
    try {
      localStorage.removeItem('mhs_push_subscribed_v1');
    } catch {}
    window.dispatchEvent(new CustomEvent('mahasangh_push_status_changed', { detail: { subscribed: false } }));
    return true;
  } catch {
    return false;
  }
}

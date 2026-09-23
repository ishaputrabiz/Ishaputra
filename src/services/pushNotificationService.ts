/**
 * Push notification service — Firebase Cloud Messaging (web)
 *
 * Responsibilities:
 *  - Register the FCM service worker
 *  - Request browser permission
 *  - Get the FCM token
 *  - Save the token in Firestore at userTokens/{uid} so the backend can target it
 *  - Listen for foreground messages and surface a toast / in-app banner
 */
import { getMessaging, getToken, onMessage, isSupported, Messaging } from 'firebase/messaging';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import app, { auth, db, firebaseConfig } from '@/config/firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

let messagingInstance: Messaging | null = null;
let foregroundUnsub: (() => void) | null = null;

async function ensureMessaging(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;
  if (messagingInstance) return messagingInstance;
  try {
    const supported = await isSupported();
    if (!supported) {
      console.info('[push] FCM not supported in this browser');
      return null;
    }
    messagingInstance = getMessaging(app);
    return messagingInstance;
  } catch (err) {
    console.warn('[push] Failed to init messaging:', err);
    return null;
  }
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const search = new URLSearchParams({
      apiKey: firebaseConfig.apiKey || '',
      authDomain: firebaseConfig.authDomain || '',
      projectId: firebaseConfig.projectId || '',
      storageBucket: firebaseConfig.storageBucket || '',
      messagingSenderId: firebaseConfig.messagingSenderId || '',
      appId: firebaseConfig.appId || '',
    });
    const reg = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${search.toString()}`, {
      scope: '/',
    });
    // Wait until active
    if (reg.installing) {
      await new Promise<void>((resolve) => {
        const sw = reg.installing!;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'activated') resolve();
        });
      });
    }
    return reg;
  } catch (err) {
    console.warn('[push] SW register failed:', err);
    return null;
  }
}

/**
 * Request notification permission, get FCM token, save to Firestore.
 * Returns the token, or null if unavailable / denied.
 */
export async function requestPermissionAndRegisterToken(uid: string): Promise<string | null> {
  if (!uid) return null;
  if (typeof window === 'undefined' || !('Notification' in window)) return null;

  // Permission
  let permission = Notification.permission;
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission();
    } catch {
      return null;
    }
  }
  if (permission !== 'granted') return null;

  const messaging = await ensureMessaging();
  if (!messaging) return null;
  if (!VAPID_KEY) {
    console.warn('[push] Missing VITE_FIREBASE_VAPID_KEY');
    return null;
  }
  const swReg = await ensureServiceWorker();
  if (!swReg) return null;

  try {
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    if (!token) return null;

    // Save token doc — keyed by token so a user can have multiple devices
    await setDoc(
      doc(db, 'userTokens', token),
      {
        uid,
        token,
        platform: 'web',
        userAgent: navigator.userAgent,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    return token;
  } catch (err) {
    console.warn('[push] getToken failed:', err);
    return null;
  }
}

/**
 * Remove a saved token (call on sign-out).
 */
export async function unregisterToken(token: string): Promise<void> {
  if (!token) return;
  try {
    await deleteDoc(doc(db, 'userTokens', token));
  } catch (err) {
    console.warn('[push] unregisterToken failed:', err);
  }
}

/**
 * Subscribe to foreground messages. Returns an unsubscribe function.
 * Called once at app boot; surface notifications via toast/in-app UI.
 */
export async function subscribeForegroundMessages(
  handler: (payload: { title?: string; body?: string; data?: Record<string, string> }) => void
): Promise<() => void> {
  const messaging = await ensureMessaging();
  if (!messaging) return () => {};

  if (foregroundUnsub) foregroundUnsub();
  foregroundUnsub = onMessage(messaging, (payload) => {
    handler({
      title: payload.notification?.title || (payload.data?.title as string | undefined),
      body: payload.notification?.body || (payload.data?.body as string | undefined),
      data: payload.data as Record<string, string> | undefined,
    });
  });
  return foregroundUnsub;
}

/**
 * Send a web push notification scoped to an order via /api/notify-order.
 *
 * Fire-and-forget: never throws — push must never block the underlying
 * Firestore write. The endpoint authenticates with the current user's
 * Firebase ID token and authorises the call server-side, so this works
 * for customers, admins, and assigned delivery partners alike.
 */
export async function notifyOrder(input: {
  orderId: string;
  audience: 'customer' | 'admins' | 'delivery';
  title: string;
  body: string;
  url?: string;
  data?: Record<string, string>;
}): Promise<void> {
  try {
    if (typeof window === 'undefined') return;
    const current = auth.currentUser;
    if (!current) return;
    const idToken = await current.getIdToken().catch(() => '');
    if (!idToken) return;
    await fetch('/api/notify-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(input),
    });
  } catch (err) {
    console.warn('[push] notifyOrder failed:', err);
  }
}

export const PushNotifications = {
  requestPermissionAndRegisterToken,
  unregisterToken,
  subscribeForegroundMessages,
  notifyOrder,
};

export default PushNotifications;

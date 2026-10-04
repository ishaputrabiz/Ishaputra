import { FirebaseOptions, initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import type { Analytics } from "firebase/analytics";
import { getStorage } from "firebase/storage";

const getRequiredEnv = (key: keyof ImportMetaEnv) => {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(`[Firebase] Missing required env var: ${key}`);
  }
  return value;
};

export const firebaseConfig: FirebaseOptions = {
  apiKey: getRequiredEnv('VITE_FIREBASE_API_KEY'),
  authDomain: getRequiredEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getRequiredEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getRequiredEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getRequiredEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getRequiredEnv('VITE_FIREBASE_APP_ID'),
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);

/**
 * A second Auth instance for creating users without signing the admin out.
 * Created on first use only, so shoppers never load it.
 */
let secondaryAuthInstance: Auth | null = null;
export const getSecondaryAuth = (): Auth => {
  if (!secondaryAuthInstance) {
    const secondaryApp = initializeApp(firebaseConfig, 'secondary');
    secondaryAuthInstance = getAuth(secondaryApp);
  }
  return secondaryAuthInstance;
};
/**
 * `ignoreUndefinedProperties` makes Firestore skip `undefined` fields instead of
 * throwing "Unsupported field value: undefined".
 *
 * Forms build their payloads with `field: value || undefined` for optional
 * inputs, so any empty optional field aborted the whole write - leaving an
 * admin with "Failed to update product" and no clue which field was to blame.
 * Skipping them is the documented behaviour for exactly this pattern.
 *
 * Note this means `undefined` = "leave this field as it is" on an update; to
 * actually clear a stored field, write `null`.
 */
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
export const storage = getStorage(app);
/**
 * Google Analytics, loaded after the page is interactive (App.tsx calls
 * loadAnalytics() in an idle callback after window load). Same data, but the
 * ~150 kB tag no longer competes with the first render. `analytics` is null
 * until it has loaded.
 */
export let analytics: Analytics | null = null;
let analyticsPromise: Promise<Analytics | null> | null = null;
export const loadAnalytics = (): Promise<Analytics | null> => {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!analyticsPromise) {
    analyticsPromise = import('firebase/analytics')
      .then(async ({ getAnalytics, isSupported }) => {
        if (!(await isSupported())) return null;
        analytics = getAnalytics(app);
        return analytics;
      })
      .catch((error) => {
        console.warn('[Firebase] Analytics did not load', error);
        return null;
      });
  }
  return analyticsPromise;
};

export default app;

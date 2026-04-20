import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

const requiredKeys = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
];

const hasFirebaseConfig = requiredKeys.every((key) => Boolean(firebaseConfig[key]));

if (!hasFirebaseConfig) {
  console.warn('Firebase configuration is incomplete. Firebase services will be unavailable until REACT_APP_FIREBASE_* variables are set.');
}

// Initialize Firebase only when the required config is present
const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;

// Initialize Firebase services
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;

// Initialize Analytics only in supported browser environments with a measurement ID
if (
  app &&
  firebaseConfig.measurementId &&
  typeof window !== 'undefined' &&
  !window.location.hostname.includes('localhost')
) {
  getAnalytics(app);
}

export default app;

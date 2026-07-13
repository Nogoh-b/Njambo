/* ═══════════════ FILE: lib/firebase.ts ═══════════════
   Initialisation Firebase — single instance.
   Import uniquement depuis les hooks (useAuth, useLobby, useGameSync).
   Ne jamais importer côté composant render. */

import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { serverTimestamp } from "firebase/firestore";

export { serverTimestamp };

/* ── Config Firebase (variables d'environnement) ── */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/* ── Singletons (évite les réinitialisations en dev avec HMR) ── */
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const forceLongPolling = process.env.NEXT_PUBLIC_FIRESTORE_FORCE_LONG_POLLING === "1";
const db = forceLongPolling
  ? initializeFirestore(app, { experimentalForceLongPolling: true })
  : getFirestore(app);

export { app, auth, db };

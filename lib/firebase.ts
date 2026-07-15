/* ═══════════════ FILE: lib/firebase.ts ═══════════════
   Initialisation Firebase — single instance. Depuis la migration VPS, seul
   Firebase Auth (+ Messaging via `app`) est utilisé : les données vivent dans
   le backend VPS (Postgres). `db` n'est plus une instance Firestore mais un
   simple jeton passé aux fonctions du shim lib/firestoreClient.ts, qui
   l'ignorent — conservé pour garder les signatures d'appel du SDK. */

import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

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

/** Jeton opaque consommé par lib/firestoreClient.ts (API compatible SDK). */
const db = Object.freeze({ __backend: "njambo-vps" });

export { app, auth, db };

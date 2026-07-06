/* ═══════════════ FILE: lib/firebase.ts ═══════════════
   Initialisation Firebase — single instance.
   Import uniquement depuis les hooks (useAuth, useLobby, useGameSync).
   Ne jamais importer côté composant render. */

import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/* ── Config Firebase ── */
const firebaseConfig = {
  apiKey: "AIzaSyDcDtuRP3CKAW4agB8RjYyrI4QGEE_Rk7o",
  authDomain: "njambo.firebaseapp.com",
  projectId: "njambo",
  storageBucket: "njambo.firebasestorage.app",
  messagingSenderId: "686025763182",
  appId: "1:686025763182:web:7a63906b21006d6da3397f",
  measurementId: "G-Z93R6VRC6L",
};

/* ── Singletons (évite les réinitialisations en dev avec HMR) ── */
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };

/* ═══════════════ FILE: lib/firebase.ts ═══════════════
   Initialisation Firebase — single instance.
   Import uniquement depuis les hooks (useAuth, useLobby, useGameSync).
   Ne jamais importer côté composant render. */

import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
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

/* Cache offline persistant (IndexedDB, multi-onglets) : les écrans affichent
   instantanément les données de la dernière session puis se rafraîchissent
   depuis le serveur — supprime l'écran vide au boot.
   Le try/catch couvre le HMR dev : initializeFirestore lève si l'instance
   existe déjà avec d'autres options → on récupère l'instance en place. */
let db: Firestore;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ...(forceLongPolling ? { experimentalForceLongPolling: true } : {}),
  });
} catch {
  db = getFirestore(app);
}

export { app, auth, db };

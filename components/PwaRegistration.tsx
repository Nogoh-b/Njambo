"use client";

import { useEffect } from "react";
import { getToken, isSupported } from "firebase/messaging";
import { app, auth } from "@/lib/firebase";
import { backendCallable } from "@/lib/backendCallable";
import { getMessaging } from "firebase/messaging";

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    void navigator.serviceWorker.register("/sw.js").then(async (registration) => {
      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!vapidKey || Notification.permission !== "granted" || !auth.currentUser || auth.currentUser.isAnonymous || !(await isSupported())) return;
      const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration });
      if (!token) return;
      const call = backendCallable("registerPushToken");
      await call({ token, platform: "web", idempotencyKey: `push_${crypto.randomUUID()}` });
    }).catch(() => { /* L'installation PWA ne doit jamais bloquer le jeu. */ });
  }, []);
  return null;
}

"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    void navigator.serviceWorker.register("/sw.js").then(async (registration) => {
      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!vapidKey || Notification.permission !== "granted") return;
      const [{ getMessaging, getToken, isSupported }, { app, auth }, { backendCallable }] = await Promise.all([
        import("firebase/messaging"),
        import("@/lib/firebase"),
        import("@/lib/backendCallable"),
      ]);
      if (!auth.currentUser || auth.currentUser.isAnonymous || !(await isSupported())) return;
      const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration });
      if (!token) return;
      const call = backendCallable("registerPushToken");
      await call({ token, platform: "web", idempotencyKey: `push_${crypto.randomUUID()}` });
    }).catch(() => { /* L'installation PWA ne doit jamais bloquer le jeu. */ });
  }, []);
  return null;
}

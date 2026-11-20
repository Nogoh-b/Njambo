"use client";

/* Enregistrement du jeton push (FCM web) — partagé par l'enregistrement
   silencieux au démarrage (PwaRegistration) et l'interrupteur « Alertes
   d'événements » des Options. */

export type PushSupport = "ok" | "unsupported" | "denied" | "not_configured";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("Notification" in window)) return "unsupported";
  if (!process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) return "not_configured";
  if (Notification.permission === "denied") return "denied";
  return "ok";
}

/** Enregistre le jeton de cet appareil (la permission doit déjà être accordée). */
export async function registerPushToken(registration?: ServiceWorkerRegistration): Promise<boolean> {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey || Notification.permission !== "granted") return false;
  const [{ getMessaging, getToken, isSupported }, { app }, { auth }, { backendCallable }] = await Promise.all([
    import("firebase/messaging"),
    import("@/lib/firebase"),
    import("@/lib/authClient"),
    import("@/lib/backendCallable"),
  ]);
  if (!auth.currentUser || auth.currentUser.isAnonymous || !(await isSupported())) return false;
  const swRegistration = registration ?? await navigator.serviceWorker.register("/sw.js");
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: swRegistration });
  if (!token) return false;
  await backendCallable("registerPushToken")({ token, platform: "web" });
  return true;
}

/** Demande la permission si besoin, puis enregistre le jeton. */
export async function enablePush(): Promise<PushSupport | "granted"> {
  const support = pushSupport();
  if (support !== "ok") return support;
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  await registerPushToken();
  return "granted";
}

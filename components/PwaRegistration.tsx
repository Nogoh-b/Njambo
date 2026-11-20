"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    void navigator.serviceWorker.register("/sw.js").then(async (registration) => {
      // Jeton rafraîchi silencieusement si la permission est déjà accordée.
      const { registerPushToken } = await import("@/lib/pushRegistration");
      await registerPushToken(registration);
    }).catch(() => { /* L'installation PWA ne doit jamais bloquer le jeu. */ });
  }, []);
  return null;
}

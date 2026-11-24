"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { SplashScreen } from "@/components/scenes/SplashScreen";
import { loadAssets, prefetchAssets } from "@/lib/assets/AssetLoader";
import { menuManifest } from "@/lib/assets/manifests";
import { ensureRandomUUIDPolyfill } from "@/lib/cryptoUtils";

ensureRandomUUIDPolyfill();

const SPLASH_SESSION_KEY = "njambo-splash-seen";
const RELOAD_PRELOAD_CAP_MS = 2800;

export default function AppBootstrap() {
  const [Runtime, setRuntime] = useState<ComponentType | null>(null);
  const [runtimePromise, setRuntimePromise] = useState<Promise<typeof import("@/components/NjamboApp")> | null>(null);
  const [phase, setPhase] = useState<"checking" | "splash" | "app">("checking");
  const cancelledRef = useRef(false);
  const showSplashRef = useRef<boolean | null>(null);
  const runtimePromiseRef = useRef<Promise<typeof import("@/components/NjamboApp")> | null>(null);

  useEffect(() => {
    cancelledRef.current = false;
    if (showSplashRef.current === null) {
      try {
        showSplashRef.current = sessionStorage.getItem(SPLASH_SESSION_KEY) !== "1";
        if (showSplashRef.current) sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
      } catch {
        showSplashRef.current = true;
      }
    }

    const showSplash = showSplashRef.current;
    const runtime = import("@/components/NjamboApp");
    runtimePromiseRef.current = runtime;
    setRuntimePromise(runtime);

    if (!showSplash) {
      // Même en actualisation de session (sans splash), on décode les assets
      // critiques du Salon avant affichage (quasi instantané via le cache HTTP/SW).
      const manifest = menuManifest();
      const assetsReady = Promise.race([
        loadAssets(manifest.critical, { priority: "critical" }),
        new Promise((resolve) => window.setTimeout(resolve, RELOAD_PRELOAD_CAP_MS)),
      ]);
      void Promise.all([runtime, assetsReady]).then(([module]) => {
        if (cancelledRef.current) return;
        prefetchAssets(manifest.background);
        setRuntime(() => module.default);
        setPhase("app");
      });
    } else {
      setPhase("splash");
      void runtime.then((module) => {
        if (!cancelledRef.current) setRuntime(() => module.default);
      });
    }

    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const finishSplash = useCallback(() => {
    const runtime = runtimePromiseRef.current;
    if (!runtime) return;
    void runtime.then((module) => {
      if (cancelledRef.current) return;
      setRuntime(() => module.default);
      setPhase("app");
    });
  }, []);

  if (phase === "splash") {
    return <SplashScreen runtimePromise={runtimePromise} onComplete={finishSplash} />;
  }
  if (phase === "app" && Runtime) return <Runtime />;

  return <main className="nj-shell nj-shell-splash" aria-busy="true" aria-label="Chargement de Njambo" />;
}

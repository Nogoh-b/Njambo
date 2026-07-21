"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { SplashScreen } from "@/components/scenes/SplashScreen";

const SPLASH_SESSION_KEY = "njambo-splash-seen";

export default function AppBootstrap() {
  const [Runtime, setRuntime] = useState<ComponentType | null>(null);
  const [phase, setPhase] = useState<"checking" | "splash" | "app">("checking");
  const cancelledRef = useRef(false);
  const showSplashRef = useRef<boolean | null>(null);
  const runtimePromiseRef = useRef<Promise<typeof import("@/components/NjamboApp")> | null>(null);

  useEffect(() => {
    cancelledRef.current = false;
    if (showSplashRef.current === null) {
      showSplashRef.current = sessionStorage.getItem(SPLASH_SESSION_KEY) !== "1";
      if (showSplashRef.current) sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
    }

    const showSplash = showSplashRef.current;
    const runtime = import("@/components/NjamboApp");
    runtimePromiseRef.current = runtime;

    if (!showSplash) {
      void runtime.then((module) => {
        if (cancelledRef.current) return;
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

  if (phase === "splash") return <SplashScreen onComplete={finishSplash} />;
  if (phase === "app" && Runtime) return <Runtime />;

  return <main className="nj-shell nj-shell-splash" aria-busy="true" aria-label="Chargement de Njambo" />;
}

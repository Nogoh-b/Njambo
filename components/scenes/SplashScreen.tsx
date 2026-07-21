"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import type { MotionLevel } from "@/lib/motion";
import { deriveMotionLevel, preferenceMotionLevel } from "@/lib/motionPolicy";
import { normalizeStoredSettings } from "@/lib/settingsStorage";
import styles from "./SplashScreen.module.css";

type SplashMotionMode = MotionLevel | "reduced" | "off";

function readSplashMotionMode(): SplashMotionMode {
  try {
    const settings = normalizeStoredSettings(JSON.parse(localStorage.getItem("njambo-settings-v1") ?? "{}"));
    if (!settings.animationsOn) return "off";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "reduced";
    const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
    return preferenceMotionLevel(settings.motionQuality, {
      width: window.innerWidth,
      height: window.innerHeight,
      hardwareConcurrency: navigator.hardwareConcurrency || 8,
      deviceMemory: navigatorWithMemory.deviceMemory ?? null,
    });
  } catch {
    return deriveMotionLevel({
      width: window.innerWidth,
      height: window.innerHeight,
      hardwareConcurrency: navigator.hardwareConcurrency || 8,
      deviceMemory: null,
    });
  }
}

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const rootRef = useRef<HTMLElement>(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const [motionMode] = useState<SplashMotionMode>(readSplashMotionMode);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const complete = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      onCompleteRef.current();
    };

    if (motionMode === "off" || motionMode === "reduced" || motionMode === "lite") {
      const duration = motionMode === "lite" ? 220 : 140;
      const timer = window.setTimeout(complete, duration);
      return () => window.clearTimeout(timer);
    }

    if (!rootRef.current) return;
    const context = gsap.context(() => {
      gsap.timeline({ defaults: { ease: "power3.out" }, onComplete: complete })
        .from(`.${styles.mark}`, { scale: 0.78, opacity: 0, duration: 0.32 })
        .from(`.${styles.kicker}`, { y: 10, opacity: 0, duration: 0.22 }, "-=0.08")
        .from(`.${styles.title}`, { y: 16, opacity: 0, scale: 0.96, duration: 0.26 }, "-=0.06")
        .from(`.${styles.tagline}`, { y: 8, opacity: 0, duration: 0.2 }, "-=0.08")
        .from(`.${styles.bar}`, { scaleX: 0, opacity: 0, transformOrigin: "50% 50%", duration: 0.24 }, "-=0.06")
        .from(`.${styles.dots} > *`, { scale: 0, opacity: 0, stagger: 0.03, duration: 0.16 }, "-=0.08");
    }, rootRef);

    return () => {
      context.revert();
    };
  }, [motionMode]);

  return (
    <main
      ref={rootRef}
      className={`nj-shell nj-shell-splash ${styles.splash}`}
      data-motion-profile={motionMode}
      aria-label="Ouverture de Njambo"
      aria-live="polite"
    >
      <div className={`${styles.strip} ${styles.stripTop}`} aria-hidden="true" />
      <div className={styles.content}>
        <span className={styles.mark} aria-hidden="true" />
        <div className={styles.kicker}>LE JEU DU QUARTIER</div>
        <h1 className={styles.title}>NJAMBO</h1>
        <p className={styles.tagline}>Kamer table — cartes, bluff et mboko</p>
        <div className={styles.bar} aria-hidden="true" />
        <div className={styles.dots} aria-hidden="true">
          <span /><span /><span /><span />
        </div>
      </div>
      <div className={`${styles.strip} ${styles.stripBottom}`} aria-hidden="true" />
    </main>
  );
}

"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { gsap } from "gsap";
import { loadAssets, normalizeAssets, prefetchAssets } from "@/lib/assets/AssetLoader";
import { menuManifest } from "@/lib/assets/manifests";
import type { MotionLevel } from "@/lib/motion";
import { deriveMotionLevel, preferenceMotionLevel } from "@/lib/motionPolicy";
import { normalizeStoredSettings } from "@/lib/settingsStorage";
import styles from "./SplashScreen.module.css";

type SplashMotionMode = MotionLevel | "reduced" | "off";

interface SplashScreenProps {
  onComplete: () => void;
  /** Promesse du chunk NjamboApp lancé en parallèle par AppBootstrap. */
  runtimePromise?: Promise<unknown> | null;
}

const HERO_CARDS = [
  { rank: "7", suit: "♠", red: false, rot: -24, x: -72, y: 18, featured: false },
  { rank: "A", suit: "♥", red: true, rot: -12, x: -36, y: 6, featured: false },
  { rank: "3", suit: "♦", red: true, rot: 0, x: 0, y: -4, featured: true },
  { rank: "10", suit: "♣", red: false, rot: 12, x: 36, y: 6, featured: false },
  { rank: "K", suit: "♠", red: false, rot: 24, x: 72, y: 18, featured: false },
] as const;

const SPARKS = [
  { left: "10%", top: "24%", size: 4.5, delay: "0s", dur: "4.2s" },
  { left: "86%", top: "20%", size: 4, delay: "0.7s", dur: "4.8s" },
  { left: "78%", top: "72%", size: 4.5, delay: "1.2s", dur: "4.4s" },
  { left: "18%", top: "76%", size: 3.5, delay: "1.9s", dur: "5.0s" },
  { left: "92%", top: "48%", size: 3.5, delay: "0.4s", dur: "5.2s" },
  { left: "7%", top: "52%", size: 4, delay: "1.4s", dur: "4.6s" },
  { left: "30%", top: "14%", size: 3.5, delay: "2.1s", dur: "4.9s" },
  { left: "70%", top: "15%", size: 4, delay: "0.9s", dur: "4.3s" },
  { left: "26%", top: "64%", size: 3, delay: "1.6s", dur: "5.4s" },
  { left: "74%", top: "60%", size: 3.5, delay: "2.4s", dur: "4.7s" },
  { left: "48%", top: "11%", size: 3.5, delay: "1.1s", dur: "5.1s" },
  { left: "54%", top: "84%", size: 4, delay: "0.3s", dur: "4.5s" },
  { left: "39%", top: "30%", size: 3, delay: "2.7s", dur: "4.8s" },
  { left: "62%", top: "34%", size: 3, delay: "1.8s", dur: "4.4s" },
] as const;

const WATERMARKS = [
  { suit: "♠", left: "7%", top: "14%", rot: "-18deg", delay: "0s", dur: "11s" },
  { suit: "♥", left: "86%", top: "16%", rot: "16deg", delay: "1.8s", dur: "13s" },
  { suit: "♦", left: "9%", top: "78%", rot: "14deg", delay: "3.2s", dur: "12s" },
  { suit: "♣", left: "86%", top: "76%", rot: "-14deg", delay: "1.1s", dur: "14s" },
] as const;

const SUIT_PIPS = [
  { suit: "♠", tone: "gold", threshold: 20 },
  { suit: "♥", tone: "pink", threshold: 45 },
  { suit: "♦", tone: "teal", threshold: 70 },
  { suit: "♣", tone: "cobalt", threshold: 95 },
] as const;

const MAX_WAIT_MS = 5500;
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function readSplashMotionMode(): SplashMotionMode {
  if (typeof window === "undefined") return "full";
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

export function SplashScreen({ onComplete, runtimePromise }: SplashScreenProps) {
  const rootRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const medallionRef = useRef<HTMLDivElement>(null);
  const shockwaveRef = useRef<HTMLSpanElement>(null);
  const fanRef = useRef<HTMLDivElement>(null);
  const kickerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const taglineRef = useRef<HTMLParagraphElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const exitPlayedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const [motionMode] = useState<SplashMotionMode>(readSplashMotionMode);
  const reduced = motionMode === "off" || motionMode === "reduced" || motionMode === "lite";

  const manifest = useMemo(() => menuManifest(), []);
  const criticalAssets = useMemo(() => normalizeAssets(manifest.critical), [manifest]);
  const totalSteps = criticalAssets.length + (runtimePromise ? 1 : 0);

  const [loadedSteps, setLoadedSteps] = useState(0);
  const [readyToExit, setReadyToExit] = useState(false);
  const [displayPct, setDisplayPct] = useState(6);
  const startedAtRef = useRef<number>(0);

  const minDisplayMs =
    motionMode === "off"
      ? 140
      : motionMode === "reduced"
        ? 360
        : motionMode === "lite"
          ? 700
          : 1750;

  /* ── 1. Préchargement réel : assets critiques du salon + chunk NjamboApp ── */
  useEffect(() => {
    let cancelled = false;
    let finished = false;
    let minTimer: number | null = null;
    startedAtRef.current = performance.now();

    let assetsLoaded = 0;
    let runtimeLoaded = runtimePromise ? 0 : 1;
    const publish = () => {
      if (!cancelled) setLoadedSteps(assetsLoaded + runtimeLoaded);
    };

    const finish = () => {
      if (cancelled || finished) return;
      finished = true;
      window.clearTimeout(maxTimer);
      if (minTimer !== null) window.clearTimeout(minTimer);
      setLoadedSteps(totalSteps);
      prefetchAssets(manifest.background);
      setReadyToExit(true);
    };

    const maxTimer = window.setTimeout(finish, MAX_WAIT_MS);

    const assetsTask = loadAssets(criticalAssets, {
      priority: "critical",
      onProgress: ({ loaded }) => {
        assetsLoaded = loaded;
        publish();
      },
    });

    const runtimeTask = runtimePromise
      ? Promise.resolve(runtimePromise)
          .catch(() => null)
          .finally(() => {
            runtimeLoaded = 1;
            publish();
          })
      : Promise.resolve();

    void Promise.all([assetsTask, runtimeTask]).then(() => {
      if (cancelled || finished) return;
      const elapsed = performance.now() - startedAtRef.current;
      const remaining = Math.max(0, minDisplayMs - elapsed);
      if (remaining <= 16) finish();
      else minTimer = window.setTimeout(finish, remaining);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(maxTimer);
      if (minTimer !== null) window.clearTimeout(minTimer);
    };
  }, [criticalAssets, manifest.background, minDisplayMs, runtimePromise, totalSteps]);

  /* ── 2. Progression visuelle fluide (ne dépasse jamais le chargement réel) ── */
  const realRatio = totalSteps > 0 ? Math.min(1, loadedSteps / totalSteps) : 1;
  const realRatioRef = useRef(realRatio);
  realRatioRef.current = realRatio;

  useEffect(() => {
    if (readyToExit) {
      setDisplayPct(100);
      return;
    }
    let rafId = 0;
    const tick = () => {
      const elapsed = Math.max(0, performance.now() - (startedAtRef.current || performance.now()));
      const timeFrac = minDisplayMs > 0 ? Math.min(1, elapsed / minDisplayMs) : 1;
      const easedTime = 1 - Math.pow(1 - timeFrac, 1.4);
      const bounded = Math.min(realRatioRef.current, easedTime);
      const target = Math.min(98, Math.max(6, Math.round(bounded * 98)));
      setDisplayPct((current) => {
        if (target <= current) return current;
        const step = Math.max(1, Math.ceil((target - current) * 0.2));
        return Math.min(target, current + step);
      });
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [minDisplayMs, readyToExit]);

  /* ── 3. Chorégraphie d'entrée GSAP (GPU pur 60 fps, avant le 1er paint) ── */
  useIsomorphicLayoutEffect(() => {
    if (reduced || !rootRef.current) return;
    const ctx = gsap.context(() => {
      const cards = fanRef.current ? Array.from(fanRef.current.children) : [];
      const tl = gsap.timeline({ defaults: { force3D: true } });

      tl.fromTo(
        medallionRef.current,
        { scale: 0.45, opacity: 0, y: -22, rotation: -12 },
        { scale: 1, opacity: 1, y: 0, rotation: 0, duration: 0.56, ease: "back.out(1.65)" },
        0.04,
      )
        .fromTo(
          shockwaveRef.current,
          { scale: 0.35, opacity: 0.9 },
          { scale: 2.35, opacity: 0, duration: 0.78, ease: "power2.out" },
          0.16,
        );

      cards.forEach((card, idx) => {
        const spec = HERO_CARDS[idx];
        if (!spec) return;
        tl.fromTo(
          card,
          { x: 0, y: 38, rotation: 0, scale: 0.58, opacity: 0 },
          {
            x: spec.x,
            y: spec.y,
            rotation: spec.rot,
            scale: spec.featured ? 1.06 : 0.98,
            opacity: 1,
            duration: 0.54,
            ease: "back.out(1.45)",
          },
          0.22 + idx * 0.055,
        );
      });

      tl.fromTo(
        kickerRef.current,
        { y: 12, opacity: 0, scale: 0.92 },
        { y: 0, opacity: 1, scale: 1, duration: 0.34, ease: "power3.out" },
        0.48,
      )
        .fromTo(
          titleRef.current,
          { y: 20, opacity: 0, scale: 0.92 },
          { y: 0, opacity: 1, scale: 1, duration: 0.42, ease: "back.out(1.35)" },
          0.56,
        )
        .fromTo(
          taglineRef.current,
          { y: 10, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.32, ease: "power2.out" },
          0.7,
        )
        .fromTo(
          dockRef.current,
          { y: 16, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.36, ease: "power2.out" },
          0.76,
        );
    }, rootRef);

    return () => ctx.revert();
  }, [reduced]);

  /* ── 4. Sortie cinématique vers le Salon déjà 100 % décodé ── */
  useEffect(() => {
    if (!readyToExit || exitPlayedRef.current) return;
    exitPlayedRef.current = true;

    if (reduced || !rootRef.current) {
      const timer = window.setTimeout(() => onCompleteRef.current(), motionMode === "off" ? 40 : 180);
      return () => window.clearTimeout(timer);
    }

    let done = false;
    const completeOnce = () => {
      if (done) return;
      done = true;
      onCompleteRef.current();
    };

    const ctx = gsap.context(() => {
      const cards = fanRef.current ? Array.from(fanRef.current.children) : [];
      const tl = gsap.timeline({
        delay: 0.14,
        defaults: { force3D: true },
        onComplete: completeOnce,
      });

      tl.to(
        cards,
        {
          y: -14,
          scale: 1.08,
          opacity: 0,
          duration: 0.3,
          stagger: 0.02,
          ease: "power2.in",
        },
        0,
      )
        .to(
          contentRef.current,
          { scale: 1.05, y: -12, opacity: 0, duration: 0.34, ease: "power2.in" },
          0.04,
        )
        .to(
          rootRef.current,
          { opacity: 0, duration: 0.28, ease: "power2.out" },
          0.16,
        );
    }, rootRef);

    const guard = window.setTimeout(completeOnce, 720);
    return () => {
      window.clearTimeout(guard);
      ctx.revert();
    };
  }, [motionMode, readyToExit, reduced]);

  const statusText = readyToExit
    ? "Salon prêt !"
    : displayPct < 40
      ? "Mise en place du tapis…"
      : displayPct < 78
        ? "Préparation des cartes & icônes…"
        : "Ouverture du Salon Royal…";

  const ratio = Math.max(0.05, Math.min(1, displayPct / 100));

  return (
    <main
      ref={rootRef}
      className={`nj-shell nj-shell-splash ${styles.splash}${readyToExit ? ` ${styles.ready}` : ""}`}
      data-motion-profile={motionMode}
      aria-label="Ouverture de Njambo"
      aria-live="polite"
      aria-busy={!readyToExit}
    >
      {/* Décor Salon Royal (0 image réseau : rendu instantané dès la frame 1) */}
      <div className={styles.spotlight} aria-hidden="true" />
      <div className={styles.ndopPattern} aria-hidden="true" />
      <div className={styles.sunburst} aria-hidden="true" />

      <div className={styles.watermarks} aria-hidden="true">
        {WATERMARKS.map((mark, index) => (
          <span
            key={index}
            style={{
              left: mark.left,
              top: mark.top,
              "--wm-rot": mark.rot,
              animationDelay: mark.delay,
              animationDuration: mark.dur,
            } as CSSProperties}
          >
            {mark.suit}
          </span>
        ))}
      </div>

      {!reduced && (
        <div className={styles.sparks} aria-hidden="true">
          {SPARKS.map((spark, index) => (
            <span
              key={index}
              style={{
                left: spark.left,
                top: spark.top,
                width: `${spark.size}px`,
                height: `${spark.size}px`,
                animationDelay: spark.delay,
                animationDuration: spark.dur,
              }}
            />
          ))}
        </div>
      )}

      <div className={`${styles.strip} ${styles.stripTop}`} aria-hidden="true" />
      <div className={`${styles.strip} ${styles.stripBottom}`} aria-hidden="true" />

      {/* Scène centrale */}
      <div ref={contentRef} className={styles.content}>
        {/* Médaillon doré à double couronne rotative */}
        <div className={styles.emblemStage} aria-hidden="true">
          <span ref={shockwaveRef} className={styles.shockwave} />
          <div ref={medallionRef} className={styles.medallion}>
            <span className={styles.ringOuter} />
            <span className={styles.ringInner} />
            <span className={styles.medallionHalo} />
            <span className={styles.mark}>
              <span className={styles.markSheen} />
            </span>
          </div>
        </div>

        {/* Main royale des 5 cartes Njambo en éventail */}
        <div ref={fanRef} className={styles.cardFan} aria-hidden="true">
          {HERO_CARDS.map((card) => (
            <div
              key={`${card.rank}${card.suit}`}
              className={`${styles.card}${card.red ? ` ${styles.cardRed}` : ""}${card.featured ? ` ${styles.cardFeatured}` : ""}`}
              style={
                reduced
                  ? { transform: `translate(${card.x}px, ${card.y}px) rotate(${card.rot}deg)` }
                  : undefined
              }
            >
              {card.featured && <span className={styles.cardHolo} />}
              <span className={styles.cardCorner}>
                <span>{card.rank}</span>
                <span>{card.suit}</span>
              </span>
              <span className={styles.cardSuit}>{card.suit}</span>
              <span className={`${styles.cardCorner} ${styles.cardCornerBot}`}>
                <span>{card.rank}</span>
                <span>{card.suit}</span>
              </span>
            </div>
          ))}
        </div>

        {/* Identité */}
        <div ref={kickerRef} className={styles.kicker}>
          <span aria-hidden="true">✦</span>
          <span>LE JEU DU QUARTIER</span>
          <span aria-hidden="true">✦</span>
        </div>

        <h1 ref={titleRef} className={styles.title} data-text="NJAMBO">
          NJAMBO
        </h1>

        <p ref={taglineRef} className={styles.tagline}>
          Kamer table · Cartes, bluff &amp; mboko
        </p>

        {/* Dock de chargement réel */}
        <div ref={dockRef} className={styles.loadDock}>
          <div className={styles.loadMeta}>
            <span className={styles.loadLabel}>{statusText}</span>
            <strong className={styles.loadPct}>{displayPct} %</strong>
          </div>
          <div
            className={styles.bar}
            role="progressbar"
            aria-label={`Chargement du salon ${displayPct} %`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={displayPct}
          >
            <div className={styles.barFill} style={{ transform: `scaleX(${ratio})` }} />
            <span className={styles.barGlint} aria-hidden="true" />
          </div>
          <div className={styles.suitPips} aria-hidden="true">
            {SUIT_PIPS.map((pip) => {
              const lit = displayPct >= pip.threshold;
              return (
                <span
                  key={pip.suit}
                  className={`${styles.suitPip} ${styles[`pip_${pip.tone}`]}${lit ? ` ${styles.suitPipLit}` : ""}`}
                >
                  {pip.suit}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}

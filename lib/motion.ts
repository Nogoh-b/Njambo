"use client";

import { createContext, createElement, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import type { Variants } from "motion/react";
import { useSettings } from "@/contexts/SettingsContext";
import { GAME_CONFIG } from "@/config/gameConfig";
import {
  lowerMotionLevel,
  lowestMotionLevel,
  preferenceMotionLevel,
  shouldDegradeMotion,
  type MotionCapabilities,
  type MotionLevel,
} from "@/lib/motionPolicy";

/* ═══════════════ FILE: lib/motion.ts ═══════════════
   Fondation transversale du système d'animation (Framer Motion + GSAP + tsparticles).
   Toute animation doit passer par `useMotionEnabled()` pour respecter à la fois
   le toggle utilisateur `animationsOn` ET la préférence système `prefers-reduced-motion`. */

/** Vrai si les animations doivent jouer : toggle app activé ET pas de reduced-motion système. */
export type { MotionLevel } from "@/lib/motionPolicy";

export interface MotionProfile {
  enabled: boolean;
  level: MotionLevel;
  allowDecorativeLoop: boolean;
  allowParticles: boolean;
  allowFilterFx: boolean;
  allowEntranceCascade: boolean;
  allowLongCascade: boolean;
}

type MotionEnv = MotionCapabilities;

/** Env par défaut, utilisé au SSR ET au premier rendu client (hydration-safe).
    Donne le niveau "balanced" — la vraie mesure arrive après montage. */
const SSR_MOTION_ENV: MotionEnv = { width: 1280, height: 720, hardwareConcurrency: 8, deviceMemory: 8 };

function getMotionEnv(): MotionEnv {
  if (typeof window === "undefined") {
    return SSR_MOTION_ENV;
  }
  const nav = window.navigator as Navigator & { deviceMemory?: number };
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    hardwareConcurrency: nav.hardwareConcurrency || 8,
    deviceMemory: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
  };
}

const MotionProfileContext = createContext<MotionProfile | null>(null);

export function MotionProfileProvider({ children }: { children: ReactNode }) {
  const { animationsOn, motionQuality } = useSettings();
  const prefersReducedRaw = useReducedMotion();
  // HYDRATION : le premier rendu client doit produire le MÊME HTML que le SSR
  // (le niveau de motion finit dans des className et styles inline). Les
  // signaux dépendants de l'appareil — viewport, CPU/RAM, prefers-reduced-motion —
  // ne sont donc lus qu'APRÈS montage ; le profil réel s'applique au re-render.
  const [env, setEnv] = useState<MotionEnv>(SSR_MOTION_ENV);
  const [mounted, setMounted] = useState(false);
  const [runtimeLevel, setRuntimeLevel] = useState<MotionLevel | null>(null);

  useEffect(() => {
    setMounted(true);
    setEnv(getMotionEnv()); // première mesure réelle, post-hydratation

    const onResize = () => setEnv(getMotionEnv());
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const selectedLevel = useMemo<MotionLevel>(() => {
    return preferenceMotionLevel(motionQuality, env);
  }, [env, motionQuality]);

  useEffect(() => {
    if (motionQuality !== "auto") {
      setRuntimeLevel(null);
      return;
    }
    if (!mounted || !animationsOn) return;
    let animationFrame = 0;
    const startedAt = performance.now();
    let previous = startedAt;
    let total = 0;
    let slow = 0;
    const sample = (now: number) => {
      const delta = now - previous;
      previous = now;
      if (total > 0 && delta > 25) slow += 1;
      total += 1;
      if (now - startedAt >= 3_000) {
        if (shouldDegradeMotion(total, slow)) {
          setRuntimeLevel((current) => lowerMotionLevel(current ?? selectedLevel));
        }
        return;
      }
      animationFrame = requestAnimationFrame(sample);
    };
    animationFrame = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(animationFrame);
  }, [animationsOn, motionQuality, mounted, selectedLevel]);

  const prefersReduced = mounted ? prefersReducedRaw : false;

  const value = useMemo(() => {
    if (!animationsOn || prefersReduced) {
      return {
        enabled: false,
        level: "lite" as const,
        allowDecorativeLoop: false,
        allowParticles: false,
        allowFilterFx: false,
        allowEntranceCascade: false,
        allowLongCascade: false,
      };
    }

    const level = runtimeLevel ? lowestMotionLevel(runtimeLevel, selectedLevel) : selectedLevel;
    return {
      enabled: true,
      level,
      allowDecorativeLoop: level !== "lite",
      allowParticles: level === "full",
      allowFilterFx: level === "full",
      allowEntranceCascade: level !== "lite",
      allowLongCascade: level === "full",
    };
  }, [animationsOn, prefersReduced, runtimeLevel, selectedLevel]);

  return createElement(MotionProfileContext.Provider, { value }, children);
}

export function useMotionProfile(): MotionProfile {
  const value = useContext(MotionProfileContext);
  if (!value) throw new Error("useMotionProfile doit être utilisé sous MotionProfileProvider");
  return value;
}

export function useMotionEnabled(): boolean {
  return useMotionProfile().enabled;
}

function subscribePageActivity(onStoreChange: () => void): () => void {
  document.addEventListener("visibilitychange", onStoreChange);
  window.addEventListener("focus", onStoreChange);
  window.addEventListener("blur", onStoreChange);
  return () => {
    document.removeEventListener("visibilitychange", onStoreChange);
    window.removeEventListener("focus", onStoreChange);
    window.removeEventListener("blur", onStoreChange);
  };
}

function getPageActivitySnapshot(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

/** Suspend les boucles décoratives quand l'onglet est masqué ou la fenêtre inactive. */
export function usePageActive(): boolean {
  return useSyncExternalStore(subscribePageActivity, getPageActivitySnapshot, () => true);
}

interface EntranceAnimationOptions {
  duration?: number;
  step?: number;
  maxItems?: number;
}

export function getEntranceAnimationStyle(
  motion: Pick<MotionProfile, "enabled" | "level" | "allowEntranceCascade" | "allowLongCascade">,
  index: number,
  options: EntranceAnimationOptions = {},
): CSSProperties | undefined {
  if (!motion.enabled || !motion.allowEntranceCascade) return undefined;

  const baseDuration = options.duration ?? 0.3;
  const baseStep = options.step ?? 0.04;
  const duration = motion.level === "balanced" ? Math.min(baseDuration, 0.26) : baseDuration;
  const step = motion.level === "balanced" ? Math.min(baseStep, 0.03) : baseStep;
  const maxItems = options.maxItems ?? (motion.allowLongCascade ? 8 : 4);
  const cappedIndex = Math.min(index, maxItems);

  return {
    animation: `riseIn ${duration}s ${cappedIndex * step}s both`,
  };
}

/* GSAP est chargé dynamiquement côté client uniquement (jamais au SSR). */
type Gsap = typeof import("gsap")["gsap"];
let gsapPromise: Promise<Gsap> | null = null;
export function loadGsap(): Promise<Gsap> {
  gsapPromise ??= import("gsap").then((m) => m.gsap ?? m.default);
  return gsapPromise;
}

/**
 * Hook : joue une timeline GSAP au montage (et à chaque changement de `deps`),
 * gated par `enabled`. Le contexte GSAP est automatiquement nettoyé (revert)
 * au démontage — pas de fuite d'animation. Le callback reçoit l'instance gsap
 * et doit retourner la timeline (ou rien).
 *
 * @param enabled  résultat de useMotionEnabled() (ou une condition plus fine)
 * @param scopeRef élément racine servant de scope aux sélecteurs gsap
 * @param build    construit la timeline ; `gsap.context` scope les sélecteurs
 */
export function useGsapTimeline(
  enabled: boolean,
  scopeRef: React.RefObject<HTMLElement | null>,
  build: (gsap: Gsap) => void,
  deps: React.DependencyList = [],
): void {
  const buildRef = useRef(build);
  buildRef.current = build;

  useIsomorphicLayoutEffect(() => {
    if (!enabled || !scopeRef.current) return;
    let ctx: { revert: () => void } | null = null;
    let cancelled = false;
    loadGsap().then((gsap) => {
      if (cancelled || !scopeRef.current) return;
      ctx = gsap.context(() => buildRef.current(gsap), scopeRef.current);
    });
    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, [enabled, ...deps]);
}

/** useLayoutEffect côté client, useEffect côté serveur (évite le warning SSR). */
export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/* ═══════════════ Variants réutilisables (Framer Motion) ═══════════════ */

/** Transition de scène : fondu + légère montée (cohérent avec riseIn/sceneFadeIn). */
export const sceneVariants: Variants = {
  out: { opacity: 0 },
  in: {
    opacity: 1,
    transition: { duration: GAME_CONFIG.anim.navigation / 1000, ease: [0.22, 0.85, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    transition: { duration: GAME_CONFIG.anim.navigation / 1000, ease: [0.4, 0, 1, 1] },
  },
};

/** Feel du vol/atterrissage d'une carte (approxime cubic-bezier(.3,.75,.35,1) + overshoot). */
export const cardFlightTransition = {
  type: "spring" as const,
  stiffness: 520,
  damping: 34,
  mass: 0.9,
};

/** Pop d'atterrissage (remplace landPop). */
export const cardLandVariants: Variants = {
  init: { scale: 1.35, opacity: 0.85 },
  land: {
    scale: 1,
    opacity: 1,
    transition: { type: "spring", stiffness: 600, damping: 22 },
  },
};

"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import type { Variants } from "motion/react";
import { useGame } from "@/contexts/GameContext";

/* ═══════════════ FILE: lib/motion.ts ═══════════════
   Fondation transversale du système d'animation (Framer Motion + GSAP + tsparticles).
   Toute animation doit passer par `useMotionEnabled()` pour respecter à la fois
   le toggle utilisateur `animationsOn` ET la préférence système `prefers-reduced-motion`. */

/** Vrai si les animations doivent jouer : toggle app activé ET pas de reduced-motion système. */
export function useMotionEnabled(): boolean {
  const { animationsOn } = useGame();
  const prefersReduced = useReducedMotion();
  return animationsOn && !prefersReduced;
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
  out: { opacity: 0, y: 14, scale: 0.985 },
  in: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.32, ease: [0.22, 0.85, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.99,
    transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
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

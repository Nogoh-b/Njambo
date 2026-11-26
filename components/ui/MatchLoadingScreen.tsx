"use client";

/* eslint-disable @next/next/no-img-element */
/* Les balises <img> natives consomment directement les URLs WebP pré-décodées
   par AssetLoader (sans proxy /_next/image) et restent 100 % compatibles Capacitor. */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { POWER_CARDS_BY_ID } from "@/config/powerCards";
import { NKAP } from "@/data/mock";
import { loadAssets, normalizeAssets, prefetchAssets } from "@/lib/assets/AssetLoader";
import { tableAssetGroups, type TableManifestInput } from "@/lib/assets/manifests";
import { loadGsap, useMotionProfile } from "@/lib/motion";
import { markPerformance, measurePerformance, recordGateResult } from "@/lib/performanceMetrics";
import { NjamboIcon, NjamboMark, type NjamboIconName } from "@/components/ui/Art";
import type { BotDifficulty, GameMode, PowerCardId } from "@/types/game";
import styles from "./MatchLoadingScreen.module.css";
import { sysAsset } from "@/lib/assetPack";
import { playGameSound } from "@/lib/audio/audioCatalogStore";
import { SCENE_IMPORTS, loadPowerParticles } from "@/lib/scenePreload";

const MODE_META: Record<GameMode, { label: string; tone: "gold" | "teal" | "palm" | "pink"; icon: NjamboIconName; title: string }> = {
  bot: {
    label: "Solo IA",
    tone: "gold",
    icon: "bot",
    title: "Préparation de la table",
  },
  online: {
    label: "En ligne",
    tone: "teal",
    icon: "online",
    title: "Entrée dans le salon",
  },
  friends: {
    label: "Entre amis",
    tone: "palm",
    icon: "friends",
    title: "Installation de la table privée",
  },
  event: {
    label: "Événement du Ter",
    tone: "pink",
    icon: "trophy",
    title: "Ouverture de l'arène",
  },
};

const DIFFICULTY_LABEL: Record<BotDifficulty, string> = {
  easy: "Détente",
  normal: "Normal",
  hard: "Expert",
};

const MATCH_TIPS: Record<GameMode | "common", string[]> = {
  common: [
    "Seul le 5e pli (Ngata) remporte le pot : garde ta meilleure carte dans la couleur pour le coup final !",
    "Gagner le 5e et dernier pli avec un 3 double instantanément les gains (×2).",
    "Une main dont la somme vaut 21, moins de 21, ou 5 cartes de même couleur gagne dès la donne.",
    "Active tes cartes pouvoir pendant ton tour pour renverser le rythme de la table.",
  ],
  bot: [
    "Observe quelles couleurs les bots défaussent tôt : tu sauras exactement comment prendre la main au 4e pli.",
    "Pense à équiper jusqu'à 3 cartes pouvoir dans ta collection avant de défier l'IA.",
  ],
  online: [
    "Surveille ton chrono : chaque décision rapide met la pression sur toute la table.",
    "Une déconnexion ou actualisation te reconnecte directement à ta manche en cours.",
  ],
  friends: [
    "En table privée, la revanche s'enchaîne dès que tous les amis confirment qu'ils sont prêts.",
    "Envoie une réaction rapide depuis la table pour chambrer tes amis sur un beau pli.",
  ],
  event: [
    "Dans un événement du Ter, chaque victoire fait grimper ton score au classement final.",
    "Préserve tes vies : une défaite coûte un jeton mais tes récompenses d'étape restent acquises.",
  ],
};

const SPARK_POSITIONS = [
  { left: "8%", top: "22%", size: 4.5, delay: "0s" },
  { left: "90%", top: "18%", size: 4, delay: "0.6s" },
  { left: "82%", top: "74%", size: 4.5, delay: "1.3s" },
  { left: "14%", top: "78%", size: 3.5, delay: "2.0s" },
  { left: "94%", top: "48%", size: 3.5, delay: "0.3s" },
  { left: "6%", top: "52%", size: 4, delay: "1.0s" },
  { left: "32%", top: "14%", size: 3.5, delay: "1.7s" },
  { left: "68%", top: "16%", size: 4, delay: "2.4s" },
  { left: "26%", top: "64%", size: 3, delay: "0.9s" },
  { left: "74%", top: "58%", size: 3.5, delay: "1.9s" },
  { left: "50%", top: "12%", size: 3.5, delay: "2.7s" },
  { left: "54%", top: "82%", size: 4, delay: "1.4s" },
] as const;

/* 10 cartes qui jaillissent en éventail cinématique à l'ouverture des portes */
const BURST_CARDS: ReadonlyArray<{
  dx: number;
  dy: number;
  rot: number;
  face?: { rank: string; suit: string; red: boolean };
}> = [
  { dx: -52, dy: -36, rot: -118 },
  { dx: 52, dy: -34, rot: 122 },
  { dx: -58, dy: 4, rot: -84, face: { rank: "A", suit: "♥", red: true } },
  { dx: 58, dy: 6, rot: 88, face: { rank: "K", suit: "♠", red: false } },
  { dx: -44, dy: 42, rot: -136 },
  { dx: 44, dy: 40, rot: 140 },
  { dx: -24, dy: -46, rot: -52, face: { rank: "3", suit: "♦", red: true } },
  { dx: 24, dy: -46, rot: 56, face: { rank: "10", suit: "♣", red: false } },
  { dx: -30, dy: 46, rot: -64 },
  { dx: 30, dy: 46, rot: 68 },
];

/* 16 braises dorées projetées depuis l'entrebâillement des portes */
const BURST_EMBERS = Array.from({ length: 16 }, (_, idx) => {
  const angle = (idx / 16) * Math.PI * 2 + (idx % 2 === 0 ? 0.14 : -0.1);
  const radius = 34 + (idx % 4) * 12;
  return {
    dx: Math.round(Math.cos(angle) * radius),
    dy: Math.round(Math.sin(angle) * radius),
    size: 5 + (idx % 3) * 2.5,
  };
});

export interface MatchLoadingScreenProps {
  gameMode: GameMode;
  mise: number;
  playerCount: number;
  difficulty?: BotDifficulty;
  stageLabel?: string;
  equippedPowers: PowerCardId[];
  participants?: TableManifestInput["participants"];
  avatars?: TableManifestInput["avatars"];
  /** True lors d'une reprise automatique après actualisation. */
  resuming?: boolean;
  /** Durée maximum avant ouverture garantie de la table (ms). */
  maxWaitMs?: number;
  /** Durée minimale de la cérémonie de chargement (ms). */
  minDisplayMs?: number;
  /** Appelé ~1 s avant l'ouverture pour pré-monter la table derrière les portes (60 fps pur). */
  onPreMountTable?: () => void;
  /** Appelé dès que les portes ont dévoilé la table pour lancer la donne et le chrono. */
  onUnlockGame?: () => void;
  /** Appelé une fois la cinématique d'ouverture complètement terminée (démontage). */
  onReady: () => void;
  /** Si fourni, permet d'annuler avec confirmation quand Retour est pressé. */
  onCancel?: () => void;
  /** Intercepteur de bouton Retour exposé au SceneRouter. */
  onBackRequestRef?: { current: (() => "stay" | "handled") | null };
}

interface LoadState {
  decorLoaded: number;
  decorTotal: number;
  decorDone: boolean;
  powersLoaded: number;
  powersTotal: number;
  powersDone: boolean;
  catalogLoaded: number;
  catalogTotal: number;
  catalogDone: boolean;
  modulesLoaded: number;
  modulesTotal: number;
  modulesDone: boolean;
  ready: boolean;
}

/** Durée minimale garantie du chargement (ms) pour décoder toutes les ressources. */
export const DEFAULT_MATCH_LOADING_MIN_MS = 5000;
const DEFAULT_MATCH_LOADING_MAX_MS = 10000;
/** Durée de la cinématique d'ouverture en 3 actes (rassemblement → portes → « À table ! »). */
export const SCENE_OPENING_DURATION_MS = 2650;

const CHUNK_LOADERS: Array<() => Promise<unknown>> = [
  // Mêmes fonctions que NjamboApp, sinon Turbopack précharge un autre chunk (cf. lib/scenePreload.ts).
  SCENE_IMPORTS.TableScreen,
  SCENE_IMPORTS.ResultScreen,
  () => loadGsap(),
  loadPowerParticles,
];

export function MatchLoadingScreen({
  gameMode,
  mise,
  playerCount,
  difficulty = "normal",
  stageLabel,
  equippedPowers,
  participants,
  avatars,
  resuming = false,
  maxWaitMs,
  minDisplayMs,
  onPreMountTable,
  onUnlockGame,
  onReady,
  onCancel,
  onBackRequestRef,
}: MatchLoadingScreenProps) {
  const motionProfile = useMotionProfile();
  const reducedMotion = !motionProfile.enabled || motionProfile.reduced;

  const rootRef = useRef<HTMLDivElement>(null);
  const doorLeftRef = useRef<HTMLDivElement>(null);
  const doorRightRef = useRef<HTMLDivElement>(null);
  const doorPanelLeftRef = useRef<HTMLDivElement>(null);
  const doorPanelRightRef = useRef<HTMLDivElement>(null);
  const atmosphereRef = useRef<HTMLDivElement>(null);
  const ribbonTopRef = useRef<HTMLDivElement>(null);
  const ribbonBottomRef = useRef<HTMLDivElement>(null);
  const topBarRef = useRef<HTMLElement>(null);
  const bottomDockRef = useRef<HTMLElement>(null);
  const heroCenterRef = useRef<HTMLElement>(null);
  const fanRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const powersRef = useRef<HTMLDivElement>(null);
  const markDockRef = useRef<HTMLDivElement>(null);
  const haloOuterRef = useRef<HTMLDivElement>(null);
  const haloInnerRef = useRef<HTMLDivElement>(null);
  const shockwaveRef = useRef<HTMLDivElement>(null);
  const seamBeamRef = useRef<HTMLDivElement>(null);
  const seamHaloRef = useRef<HTMLDivElement>(null);
  const burstLayerRef = useRef<HTMLDivElement>(null);
  const saluteInnerRef = useRef<HTMLDivElement>(null);
  const filamentLeftRef = useRef<HTMLSpanElement>(null);
  const filamentRightRef = useRef<HTMLSpanElement>(null);

  const onPreMountRef = useRef(onPreMountTable);
  onPreMountRef.current = onPreMountTable;
  const onUnlockGameRef = useRef(onUnlockGame);
  onUnlockGameRef.current = onUnlockGame;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const preMountedRef = useRef(false);

  const groupsRef = useRef<ReturnType<typeof tableAssetGroups> | null>(null);
  if (!groupsRef.current) {
    groupsRef.current = tableAssetGroups({
      myPowers: equippedPowers,
      participants,
      avatars,
    });
  }

  const decorAssets = useMemo(() => normalizeAssets(groupsRef.current!.decorAndCards), []);
  const powerAssets = useMemo(() => normalizeAssets(groupsRef.current!.powersAndAudio), []);
  const backgroundAssets = useMemo(() => normalizeAssets(groupsRef.current!.background), []);

  const [loadState, setLoadState] = useState<LoadState>(() => ({
    decorLoaded: 0,
    decorTotal: decorAssets.length,
    decorDone: decorAssets.length === 0,
    powersLoaded: 0,
    powersTotal: powerAssets.length,
    powersDone: powerAssets.length === 0,
    catalogLoaded: 0,
    catalogTotal: backgroundAssets.length,
    catalogDone: backgroundAssets.length === 0,
    modulesLoaded: 0,
    modulesTotal: CHUNK_LOADERS.length,
    modulesDone: false,
    ready: false,
  }));

  const [displayPct, setDisplayPct] = useState(4);
  const [openingScene, setOpeningScene] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const startedAtRef = useRef<number>(0);

  const tipPool = useMemo(() => [...(MATCH_TIPS[gameMode] ?? []), ...MATCH_TIPS.common], [gameMode]);
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * tipPool.length));
  const tip = tipPool[tipIndex % tipPool.length];

  const effectiveMinMs = minDisplayMs ?? DEFAULT_MATCH_LOADING_MIN_MS;
  const effectiveMaxMs = Math.max(effectiveMinMs + 4000, maxWaitMs ?? DEFAULT_MATCH_LOADING_MAX_MS);

  /* Rotation douce d'une seconde astuce à mi-parcours pendant les 5 secondes. */
  useEffect(() => {
    if (effectiveMinMs < 3000 || tipPool.length < 2 || openingScene) return;
    const timer = window.setInterval(() => {
      setTipIndex((prev) => (prev + 1) % tipPool.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, [effectiveMinMs, openingScene, tipPool.length]);

  /* Interception du bouton Retour pendant le chargement d'une partie. */
  useEffect(() => {
    if (!onBackRequestRef) return;
    onBackRequestRef.current = () => {
      if (openingScene) return "stay";
      if (confirmCancel) {
        setConfirmCancel(false);
        return "stay";
      }
      if (onCancelRef.current) {
        setConfirmCancel(true);
        return "stay";
      }
      return "stay";
    };
    return () => {
      onBackRequestRef.current = null;
    };
  }, [confirmCancel, onBackRequestRef, openingScene]);

  /* Chargement réel : décors/cartes + pouvoirs/sons/cosmétiques + catalogue complet + modules JS. */
  useEffect(() => {
    let cancelled = false;
    let finished = false;
    const startedAt = performance.now();
    startedAtRef.current = startedAt;
    markPerformance("gate:table:start");
    playGameSound("match_loading");

    let revealStartTimer: number | null = null;
    let minHoldTimer: number | null = null;
    let preMountTimer: number | null = null;

    const triggerPreMount = () => {
      if (cancelled || preMountedRef.current) return;
      preMountedRef.current = true;
      onPreMountRef.current?.();
    };

    // Pré-monte TableScreen (en pause, derrière les portes opaques) ~1 s avant la fin
    // des 5 s : ainsi le rendu React & la peinture GPU de la table sont déjà terminés
    // AVANT le début de la cinématique d'ouverture → 60 FPS garanti !
    if (effectiveMinMs >= 1500) {
      preMountTimer = window.setTimeout(triggerPreMount, Math.max(800, effectiveMinMs - 1100));
    }

    const complete = (timedOut: boolean) => {
      if (cancelled || finished) return;
      finished = true;
      window.clearTimeout(maxTimer);
      if (minHoldTimer !== null) window.clearTimeout(minHoldTimer);
      if (preMountTimer !== null) window.clearTimeout(preMountTimer);
      triggerPreMount();

      markPerformance("gate:table:ready");
      measurePerformance("gate:table", "gate:table:start", "gate:table:ready");
      recordGateResult("table", {
        waitedMs: Math.round(performance.now() - startedAt),
        shown: true,
        timedOut,
      });
      setConfirmCancel(false);
      setLoadState((prev) => ({
        ...prev,
        decorLoaded: prev.decorTotal,
        decorDone: true,
        powersLoaded: prev.powersTotal,
        powersDone: true,
        catalogLoaded: prev.catalogTotal,
        catalogDone: true,
        modulesLoaded: prev.modulesTotal,
        modulesDone: true,
        ready: true,
      }));
      setDisplayPct(100);
      prefetchAssets(backgroundAssets);

      const holdAt100Ms = effectiveMinMs === 0 ? 0 : 180;
      revealStartTimer = window.setTimeout(() => {
        if (!cancelled) {
          playGameSound("match_ready");
          setOpeningScene(true);
        }
      }, holdAt100Ms);
    };

    const maxTimer = window.setTimeout(() => complete(true), effectiveMaxMs);

    const decorPromise = loadAssets(decorAssets, {
      priority: "critical",
      onProgress: ({ loaded, total }) => {
        if (cancelled) return;
        setLoadState((prev) => ({
          ...prev,
          decorLoaded: loaded,
          decorTotal: total,
          decorDone: loaded >= total,
        }));
      },
    }).then(() => {
      if (!cancelled) setLoadState((prev) => ({ ...prev, decorLoaded: prev.decorTotal, decorDone: true }));
    });

    const powersPromise = loadAssets(powerAssets, {
      priority: "critical",
      onProgress: ({ loaded, total }) => {
        if (cancelled) return;
        setLoadState((prev) => ({
          ...prev,
          powersLoaded: loaded,
          powersTotal: total,
          powersDone: loaded >= total,
        }));
      },
    }).then(() => {
      if (!cancelled) setLoadState((prev) => ({ ...prev, powersLoaded: prev.powersTotal, powersDone: true }));
    });

    let modulesDoneCount = 0;
    const modulesPromise = Promise.all(
      CHUNK_LOADERS.map((loader) =>
        Promise.resolve()
          .then(loader)
          .catch(() => null)
          .finally(() => {
            modulesDoneCount += 1;
            if (cancelled) return;
            setLoadState((prev) => ({
              ...prev,
              modulesLoaded: modulesDoneCount,
              modulesDone: modulesDoneCount >= prev.modulesTotal,
            }));
          }),
      ),
    );

    const catalogPromise = Promise.all([decorPromise, powersPromise]).then(() => {
      if (cancelled || backgroundAssets.length === 0) return;
      return loadAssets(backgroundAssets, {
        priority: "background",
        onProgress: ({ loaded, total }) => {
          if (cancelled) return;
          setLoadState((prev) => ({
            ...prev,
            catalogLoaded: loaded,
            catalogTotal: total,
            catalogDone: loaded >= total,
          }));
        },
      }).then(() => {
        if (!cancelled) setLoadState((prev) => ({ ...prev, catalogLoaded: prev.catalogTotal, catalogDone: true }));
      });
    });

    void Promise.all([decorPromise, powersPromise, modulesPromise, catalogPromise]).then(() => {
      if (cancelled || finished) return;
      // Dès que tout est décodé, pré-monter la table tranquillement derrière les portes
      triggerPreMount();
      const elapsed = performance.now() - startedAt;
      const remaining = Math.max(0, effectiveMinMs - elapsed);
      if (remaining <= 16) {
        complete(false);
      } else {
        minHoldTimer = window.setTimeout(() => complete(false), remaining);
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(maxTimer);
      if (minHoldTimer !== null) window.clearTimeout(minHoldTimer);
      if (preMountTimer !== null) window.clearTimeout(preMountTimer);
      if (revealStartTimer !== null) window.clearTimeout(revealStartTimer);
    };
  }, [backgroundAssets, decorAssets, effectiveMaxMs, effectiveMinMs, powerAssets]);

  /* ═══ CINÉMATIQUE D'OUVERTURE DE SCÈNE EN 3 ACTES (GSAP · GPU PUR 60 FPS) ═══
     Acte I   (0.00 → 0.68 s) : Rétraction du HUD, rassemblement des 5 cartes au
                                centre, onde d'or et apparition des portes sculptées.
     Acte II  (0.68 → 1.98 s) : Faisceau vertical d'or, entrebâillement pesant des
                                deux portes acajou à sceau fendu, puis grand écartement
                                fluide accompagné d'une envolée de 10 cartes + 16 braises.
     Acte III (1.72 → 2.65 s) : Salut « À TABLE ! » + filaments dorés au-dessus de la
                                table vivante, feu vert à la donne (onUnlockGame), puis fondu. */
  useEffect(() => {
    if (!openingScene) return;
    let cancelled = false;
    let fallbackTimer: number | null = null;
    let gsapRevert: (() => void) | null = null;

    if (reducedMotion) {
      if (rootRef.current) {
        rootRef.current.style.transition = "opacity 360ms ease";
        rootRef.current.style.opacity = "0";
      }
      fallbackTimer = window.setTimeout(() => {
        if (!cancelled) {
          onUnlockGameRef.current?.();
          onReadyRef.current();
        }
      }, 380);
      return () => {
        cancelled = true;
        if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      };
    }

    void loadGsap()
      .then((gsap) => {
        if (cancelled || !rootRef.current) return;
        const ctx = gsap.context(() => {
          const tl = gsap.timeline({
            defaults: { force3D: true },
            onComplete: () => {
              if (!cancelled) onReadyRef.current();
            },
          });

          const fanCards = fanRef.current ? Array.from(fanRef.current.children) : [];
          const burstCards = burstLayerRef.current
            ? Array.from(burstLayerRef.current.querySelectorAll("[data-burst-card]"))
            : [];
          const burstEmbers = burstLayerRef.current
            ? Array.from(burstLayerRef.current.querySelectorAll("[data-burst-ember]"))
            : [];

          /* ── ACTE I : Rassemblement des cartes & verrouillage des portes royales ── */
          tl.to(topBarRef.current, { y: -42, opacity: 0, duration: 0.42, ease: "power2.in" }, 0)
            .to(bottomDockRef.current, { y: 54, opacity: 0, duration: 0.44, ease: "power2.in" }, 0)
            .to([ribbonTopRef.current, ribbonBottomRef.current], { opacity: 0, duration: 0.36, ease: "power2.in" }, 0.08)
            .to([headingRef.current, powersRef.current].filter(Boolean), { y: 18, opacity: 0, duration: 0.36, ease: "power2.in" }, 0.06)
            .to(
              fanCards,
              {
                x: 0,
                y: 8,
                rotation: 0,
                scale: 0.72,
                opacity: 0,
                duration: 0.48,
                stagger: 0.03,
                ease: "power3.in",
              },
              0.08,
            )
            .to(
              [haloOuterRef.current, haloInnerRef.current],
              { scale: 1.45, opacity: 0, duration: 0.52, ease: "power2.in" },
              0.18,
            )
            .to(
              markDockRef.current,
              { scale: 1.38, y: -64, opacity: 0, duration: 0.46, ease: "power2.in" },
              0.2,
            )
            .to(
              atmosphereRef.current,
              { opacity: 0, duration: 0.42, ease: "power2.out" },
              0.22,
            )
            .to(
              [doorPanelLeftRef.current, doorPanelRightRef.current],
              { opacity: 1, duration: 0.44, ease: "power2.out" },
              0.2,
            )
            .fromTo(
              shockwaveRef.current,
              { scale: 0.22, opacity: 0.95 },
              { scale: 2.8, opacity: 0, duration: 0.68, ease: "power2.out" },
              0.38,
            );

          /* ── ACTE II : Faisceau d'or, anticipation, grand écartement des portes & envolée ── */
          tl.to(
            seamBeamRef.current,
            { scaleY: 1, opacity: 1, duration: 0.3, ease: "power3.out" },
            0.58,
          )
            .to(
              seamHaloRef.current,
              { scaleX: 1, opacity: 0.88, duration: 0.32, ease: "power2.out" },
              0.6,
            )
            // Anticipation pesante : les portes s'entrebâillent légèrement avant de s'élancer
            .to(doorLeftRef.current, { xPercent: -4.2, duration: 0.24, ease: "power2.out" }, 0.68)
            .to(doorRightRef.current, { xPercent: 4.2, duration: 0.24, ease: "power2.out" }, 0.68)
            // Grande ouverture ample, fluide et majestueuse (1,08 s)
            .to(doorLeftRef.current, { xPercent: -104, duration: 1.08, ease: "power3.inOut" }, 0.92)
            .to(doorRightRef.current, { xPercent: 104, duration: 1.08, ease: "power3.inOut" }, 0.92)
            .to(
              seamBeamRef.current,
              { scaleX: 2.4, opacity: 0, duration: 0.56, ease: "power2.out" },
              0.96,
            )
            .to(
              seamHaloRef.current,
              { scaleX: 6.5, opacity: 0, duration: 0.84, ease: "power2.out" },
              0.94,
            );

          // Envolée des 10 cartes depuis le seuil lumineux vers tout l'écran
          burstCards.forEach((node, idx) => {
            const spec = BURST_CARDS[idx];
            if (!spec) return;
            const startAt = 0.92 + idx * 0.028;
            tl.fromTo(
              node,
              { x: 0, y: 0, scale: 0.34, rotation: spec.rot * 0.18, opacity: 0 },
              {
                x: `${spec.dx}vw`,
                y: `${spec.dy}vh`,
                scale: 1.08,
                rotation: spec.rot,
                opacity: 0.95,
                duration: 0.68,
                ease: "power3.out",
              },
              startAt,
            ).to(
              node,
              { opacity: 0, scale: 1.24, duration: 0.36, ease: "power2.in" },
              startAt + 0.52,
            );
          });

          // Projection des 16 braises dorées
          burstEmbers.forEach((node, idx) => {
            const spec = BURST_EMBERS[idx];
            if (!spec) return;
            const startAt = 0.88 + (idx % 6) * 0.024;
            tl.fromTo(
              node,
              { x: 0, y: 0, scale: 0.4, opacity: 0 },
              {
                x: `${spec.dx}vw`,
                y: `${spec.dy}vh`,
                scale: 1.25,
                opacity: 0.95,
                duration: 0.72,
                ease: "power2.out",
              },
              startAt,
            ).to(
              node,
              { opacity: 0, scale: 0.2, duration: 0.4, ease: "power2.in" },
              startAt + 0.5,
            );
          });

          /* ── ACTE III : Salut royal « À TABLE ! » au-dessus de la table vivante ── */
          tl.fromTo(
            saluteInnerRef.current,
            { scale: 0.84, y: 14, opacity: 0 },
            { scale: 1, y: 0, opacity: 1, duration: 0.44, ease: "back.out(1.4)" },
            1.66,
          )
            .to(
              [filamentLeftRef.current, filamentRightRef.current],
              { scaleX: 1, duration: 0.46, ease: "power3.out" },
              1.72,
            )
            .to(
              saluteInnerRef.current,
              { y: -14, scale: 1.04, opacity: 0, duration: 0.4, ease: "power2.in" },
              2.25,
            )
            // Feu vert à la table UNIQUEMENT une fois l'ouverture 100 % terminée
            // pour que toute l'animation de distribution des cartes soit visible.
            .call(() => {
              if (!cancelled) onUnlockGameRef.current?.();
            }, undefined, 2.65);
        }, rootRef);
        gsapRevert = () => ctx.revert();
      })
      .catch(() => {
        if (cancelled) return;
        onUnlockGameRef.current?.();
        fallbackTimer = window.setTimeout(() => {
          if (!cancelled) onReadyRef.current();
        }, 300);
      });

    return () => {
      cancelled = true;
      gsapRevert?.();
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
    };
  }, [openingScene, reducedMotion]);

  /* Progression cadencée sur les 5 s : ne dépasse jamais le chargement réel. */
  const totalCount = Math.max(
    1,
    loadState.decorTotal + loadState.powersTotal + loadState.catalogTotal + loadState.modulesTotal,
  );
  const loadedCount =
    loadState.decorLoaded + loadState.powersLoaded + loadState.catalogLoaded + loadState.modulesLoaded;
  const realRatio = loadedCount / totalCount;
  const realRatioRef = useRef(realRatio);
  realRatioRef.current = realRatio;

  useEffect(() => {
    if (loadState.ready) {
      setDisplayPct(100);
      return;
    }
    let rafId = 0;
    const tick = () => {
      const elapsed = Math.max(0, performance.now() - (startedAtRef.current || performance.now()));
      const timeLinear = effectiveMinMs > 0 ? Math.min(1, elapsed / effectiveMinMs) : 1;
      const timeEased = 1 - Math.pow(1 - timeLinear, 1.35);
      const bounded = Math.min(realRatioRef.current, timeEased);
      const target = Math.min(98, Math.max(4, Math.round(bounded * 98)));
      setDisplayPct((current) => {
        if (target <= current) return current;
        const delta = Math.max(1, Math.ceil((target - current) * 0.16));
        return Math.min(target, current + delta);
      });
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [effectiveMinMs, loadState.ready]);

  const decorVisualDone = loadState.ready || (loadState.decorDone && displayPct >= 34);
  const powersVisualDone = loadState.ready || (loadState.powersDone && loadState.catalogDone && displayPct >= 68);
  const modulesVisualDone = loadState.ready || (loadState.modulesDone && displayPct >= 92);

  const meta = MODE_META[gameMode];
  const powerThumbs = useMemo(
    () =>
      equippedPowers
        .slice(0, 3)
        .map((id) => POWER_CARDS_BY_ID[id])
        .filter((def): def is NonNullable<typeof def> => Boolean(def?.art)),
    [equippedPowers],
  );

  const stepLabel = loadState.ready
    ? "Table prête !"
    : !decorVisualDone
      ? "Déploiement du tapis & des cartes…"
      : !powersVisualDone
        ? "Chargement des cartes pouvoir & sons…"
        : !modulesVisualDone
          ? "Initialisation du moteur de table…"
          : resuming
            ? "Synchronisation de la manche…"
            : "Mélange final du paquet…";

  const headline = loadState.ready
    ? "Ouverture du salon…"
    : resuming
      ? "Reconnexion à la table"
      : meta.title;

  const subline =
    gameMode === "event" && stageLabel
      ? stageLabel
      : gameMode === "bot"
        ? `Table IA · Niveau ${DIFFICULTY_LABEL[difficulty]}`
        : gameMode === "friends"
          ? "Salon privé entre amis"
          : "Table multijoueur en direct";

  const saluteSubtitle = `${playerCount} joueurs · ${mise > 0 ? NKAP(mise) : gameMode === "event" ? "Tournoi" : "Amicale"}`;
  const ratio = Math.max(0.04, Math.min(1, displayPct / 100));

  return (
    <motion.div
      ref={rootRef}
      className={`${styles.root}${reducedMotion ? ` ${styles.reduced}` : ""}${openingScene ? ` ${styles.rootOpening}` : ""}`}
      data-loading-gate="table"
      data-match-loader="true"
      data-opening-scene={openingScene ? "true" : "false"}
      role="status"
      aria-live="polite"
      aria-busy={!loadState.ready}
      initial={motionProfile.enabled ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      {/* ═══ PORTES DOUBLES ROYALES ACAJOU & LAITON (GPU PUR) ═══ */}
      <div className={styles.doors} aria-hidden="true">
        <div ref={doorLeftRef} className={styles.doorLeft}>
          <div ref={doorPanelLeftRef} className={styles.doorPanel}>
            <div className={styles.doorCoffer}>
              <div className={styles.doorCofferInner} />
            </div>
            <span className={styles.doorTrim} />
            <div className={styles.sealHalfLeft}>
              <div className={styles.sealDisc}>
                <span className={styles.sealDiscRing} />
                <NjamboMark size={92} compact />
              </div>
            </div>
          </div>
        </div>

        <div ref={doorRightRef} className={styles.doorRight}>
          <div ref={doorPanelRightRef} className={styles.doorPanel}>
            <div className={styles.doorCoffer}>
              <div className={styles.doorCofferInner} />
            </div>
            <span className={styles.doorTrim} />
            <div className={styles.sealHalfRight}>
              <div className={styles.sealDisc}>
                <span className={styles.sealDiscRing} />
                <NjamboMark size={92} compact />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ EFFETS CINÉMATIQUES D'OUVERTURE (ONDE · FAISCEAU · ENVOLÉE) ═══ */}
      <div ref={shockwaveRef} className={styles.shockwave} aria-hidden="true" />
      <div ref={seamHaloRef} className={styles.seamHalo} aria-hidden="true" />
      <div ref={seamBeamRef} className={styles.seamBeam} aria-hidden="true" />

      <div ref={burstLayerRef} className={styles.burstLayer} aria-hidden="true">
        {BURST_CARDS.map((spec, idx) =>
          spec.face ? (
            <div
              key={`bc-${idx}`}
              data-burst-card="true"
              className={`${styles.burstCard} ${styles.burstCardFace} ${spec.face.red ? styles.suitRed : styles.suitDark}`}
            >
              <span className={styles.cardCorner}>
                <span>{spec.face.rank}</span>
                <span>{spec.face.suit}</span>
              </span>
              <span className={styles.cardPip}>{spec.face.suit}</span>
            </div>
          ) : (
            <span key={`bc-${idx}`} data-burst-card="true" className={styles.burstCard} />
          ),
        )}
        {BURST_EMBERS.map((ember, idx) => (
          <span
            key={`em-${idx}`}
            data-burst-ember="true"
            className={styles.burstEmber}
            style={{
              width: `${ember.size}px`,
              height: `${ember.size}px`,
              marginLeft: `${-ember.size / 2}px`,
              marginTop: `${-ember.size / 2}px`,
            }}
          />
        ))}
      </div>

      {/* ═══ ACTE III : SALUT CÉRÉMONIEL AU-DESSUS DE LA TABLE DÉVOILÉE ═══ */}
      <div className={styles.saluteOverlay} aria-hidden="true">
        <div ref={saluteInnerRef} className={styles.saluteInner}>
          <div className={styles.saluteMark}>
            <NjamboMark size={46} compact />
          </div>
          <div className={styles.saluteFilamentRow}>
            <span ref={filamentLeftRef} className={styles.saluteFilament} />
            <span className={styles.saluteKicker}>{meta.label}</span>
            <span ref={filamentRightRef} className={styles.saluteFilament} />
          </div>
          <h2 className={styles.saluteTitle}>À table !</h2>
          <p className={styles.saluteSub}>{saluteSubtitle}</p>
        </div>
      </div>

      {/* ═══ AMBIANCE LUMINEUSE PLEIN ÉCRAN (PENDANT LE CHARGEMENT) ═══ */}
      <div ref={atmosphereRef} className={styles.backdropAtmosphere} aria-hidden="true">
        {!reducedMotion && <div className={styles.sunburst} />}
        <div className={styles.spotlight} />
        <div className={styles.viewportFrame} />

        <div className={styles.watermarks}>
          <span className={styles.wm1}>♠</span>
          <span className={styles.wm2}>♥</span>
          <span className={styles.wm3}>♦</span>
          <span className={styles.wm4}>♣</span>
        </div>

        {!reducedMotion && (
          <div className={styles.sparks}>
            {SPARK_POSITIONS.map((spark, index) => (
              <span
                key={index}
                style={{
                  left: spark.left,
                  top: spark.top,
                  width: `${spark.size}px`,
                  height: `${spark.size}px`,
                  animationDelay: spark.delay,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div ref={ribbonTopRef} className={styles.ribbonTop} aria-hidden="true" />
      <div ref={ribbonBottomRef} className={styles.ribbonBottom} aria-hidden="true" />

      {/* ═══ MISE EN PAGE PLEIN ÉCRAN EN 3 BANDES ═══ */}
      <div className={styles.fullscreenLayout} aria-label="Chargement de la partie">
        <header ref={topBarRef} className={styles.topBar}>
          <div className={`${styles.modePill} ${styles[`mode_${meta.tone}`]}`}>
            <span className={styles.modeDot} aria-hidden="true" />
            <NjamboIcon name={meta.icon} tone={meta.tone} size={17} />
            <span>{resuming ? "Reprise en cours" : meta.label}</span>
          </div>

          <span className={styles.brandKicker}>NJAMBO · SALON ROYAL</span>

          <div className={styles.metaRow}>
            <span className={styles.metaChip}>
              <NjamboIcon name="users" tone="teal" size={15} />
              <span>{playerCount} joueurs</span>
            </span>

            <span className={styles.metaChip}>
              <img src={sysAsset("/assets/njambo/economy/nkap-64.webp")} alt="" className={styles.coinImg} draggable={false} />
              <span>{mise > 0 ? NKAP(mise) : gameMode === "event" ? "Tournoi" : "Amicale"}</span>
            </span>
          </div>
        </header>

        <section ref={heroCenterRef} className={styles.heroCenter}>
          <motion.div
            className={styles.stage}
            aria-hidden="true"
            initial={motionProfile.enabled ? { opacity: 0, scale: 0.86 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
          >
            <div ref={haloOuterRef} className={styles.haloOuter}>
              <span className={`${styles.haloGem} ${styles.gemN}`}>♠</span>
              <span className={`${styles.haloGem} ${styles.gemE}`}>♥</span>
              <span className={`${styles.haloGem} ${styles.gemS}`}>♦</span>
              <span className={`${styles.haloGem} ${styles.gemW}`}>♣</span>
            </div>
            <div ref={haloInnerRef} className={styles.haloInner} />

            <div ref={fanRef} className={styles.fan}>
              <span className={`${styles.fanCard} ${styles.fanL2}`} />
              <div className={`${styles.fanCard} ${styles.fanFace} ${styles.suitRed} ${styles.fanL1}`}>
                <span className={styles.cardCorner}><span>A</span><span>♥</span></span>
                <span className={styles.cardPip}>♥</span>
                <span className={styles.cardCornerBot}><span>A</span><span>♥</span></span>
              </div>
              <div className={styles.heroCard}>
                {!reducedMotion && <span className={styles.heroCardSheen} />}
                <span className={styles.cardCorner}><span>3</span><span>♦</span></span>
                <span className={styles.cardPip}>♦</span>
                <span className={styles.cardCornerBot}><span>3</span><span>♦</span></span>
              </div>
              <div className={`${styles.fanCard} ${styles.fanFace} ${styles.suitDark} ${styles.fanR1}`}>
                <span className={styles.cardCorner}><span>10</span><span>♠</span></span>
                <span className={styles.cardPip}>♠</span>
                <span className={styles.cardCornerBot}><span>10</span><span>♠</span></span>
              </div>
              <span className={`${styles.fanCard} ${styles.fanR2}`} />
            </div>

            <div ref={markDockRef} className={styles.markDock}>
              <NjamboMark size={40} compact />
            </div>
          </motion.div>

          <motion.div
            ref={headingRef}
            className={styles.heading}
            initial={motionProfile.enabled ? { opacity: 0, y: 12 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.36, delay: 0.08 }}
          >
            <h2 className={styles.title}>{headline}</h2>
            <p className={styles.subtitle}>{subline}</p>
          </motion.div>

          {powerThumbs.length > 0 && (
            <div ref={powersRef} className={styles.powerShowcase} aria-label="Cartes pouvoir équipées">
              {powerThumbs.map((card) => (
                <span key={card.id} className={styles.powerBadge}>
                  <img
                    src={card.art}
                    alt=""
                    className={styles.powerThumb}
                    draggable={false}
                  />
                  <span>{card.name}</span>
                </span>
              ))}
              {equippedPowers.length > 3 && (
                <span className={styles.powerExtra}>+{equippedPowers.length - 3}</span>
              )}
            </div>
          )}
        </section>

        <footer ref={bottomDockRef} className={styles.bottomDock}>
          <div className={styles.tipBanner}>
            <img
              src={sysAsset("/assets/njambo/ui/icons/sparkle-64.webp")}
              alt=""
              className={styles.tipIcon}
              draggable={false}
            />
            <AnimatePresence mode="wait">
              <motion.p
                key={tip}
                className={styles.tipText}
                initial={motionProfile.enabled ? { opacity: 0, y: 4 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={motionProfile.enabled ? { opacity: 0, y: -4 } : undefined}
                transition={{ duration: 0.24 }}
              >
                <span className={styles.tipLabel}>Astuce du Mboa</span>
                {tip}
              </motion.p>
            </AnimatePresence>
          </div>

          <div className={styles.progressWrap}>
            <div className={styles.progressHeader}>
              <span className={styles.stepLabel}>{stepLabel}</span>
              <span className={styles.percent}>{displayPct} %</span>
            </div>

            <div
              className={styles.track}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={displayPct}
              aria-label={`Chargement des ressources ${displayPct} %`}
            >
              <div className={styles.fill} style={{ transform: `scaleX(${ratio})` }} />
            </div>

            <div className={styles.footerMeta}>
              <div className={styles.stagesRow}>
                <span className={`${styles.stageBadge}${decorVisualDone ? ` ${styles.stageBadgeDone}` : ""}`}>
                  <span className={styles.stageDot} aria-hidden="true" />
                  <span>{decorVisualDone ? "✓ Décors" : "Décors"}</span>
                </span>
                <span className={`${styles.stageBadge}${powersVisualDone ? ` ${styles.stageBadgeDone}` : ""}`}>
                  <span className={styles.stageDot} aria-hidden="true" />
                  <span>{powersVisualDone ? "✓ Pouvoirs" : "Pouvoirs"}</span>
                </span>
                <span className={`${styles.stageBadge}${modulesVisualDone ? ` ${styles.stageBadgeDone}` : ""}`}>
                  <span className={styles.stageDot} aria-hidden="true" />
                  <span>{modulesVisualDone ? "✓ Table" : "Table"}</span>
                </span>
              </div>

              <span className={styles.resourceCount}>
                {loadedCount} / {totalCount} ressources chargées
              </span>
            </div>
          </div>
        </footer>
      </div>

      {/* Confirmation si le joueur appuie sur Retour pendant le lancement */}
      {confirmCancel && onCancel && !openingScene && (
        <div className={styles.cancelBackdrop} onClick={() => setConfirmCancel(false)}>
          <div
            className={styles.cancelBox}
            role="dialog"
            aria-modal="true"
            aria-label="Annuler le lancement de la partie"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Quitter la partie ?</h3>
            <p>La table est en train de se charger. Veux-tu vraiment annuler le lancement ?</p>
            <div className={styles.cancelActions}>
              <button
                data-nj-skin="none"
                type="button"
                className={styles.cancelStayBtn}
                onClick={() => setConfirmCancel(false)}
              >
                Continuer
              </button>
              <button
                data-nj-skin="none"
                type="button"
                className={styles.cancelQuitBtn}
                onClick={() => {
                  setConfirmCancel(false);
                  onCancel();
                }}
              >
                Quitter
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

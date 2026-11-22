"use client";

/* eslint-disable @next/next/no-img-element */
/* Les balises <img> natives consomment directement les URLs WebP pré-décodées
   par AssetLoader (sans proxy /_next/image) et restent 100 % compatibles Capacitor. */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { POWER_CARDS_BY_ID } from "@/config/powerCards";
import { NKAP } from "@/data/mock";
import { loadAssets, normalizeAssets, prefetchAssets } from "@/lib/assets/AssetLoader";
import { tableAssetGroups, type TableManifestInput } from "@/lib/assets/manifests";
import { loadGsap, useMotionProfile } from "@/lib/motion";
import { markPerformance, measurePerformance, recordGateResult } from "@/lib/performanceMetrics";
import { NjamboIcon, NjamboMark, type NjamboIconName } from "@/components/ui/Art";
import type { BotDifficulty, GameMode, PowerCardId } from "@/types/game";
import styles from "./MatchLoadingScreen.module.css";

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
  { left: "12%", top: "20%", size: 4, delay: "0s" },
  { left: "86%", top: "18%", size: 3.5, delay: "0.7s" },
  { left: "78%", top: "76%", size: 4, delay: "1.4s" },
  { left: "18%", top: "78%", size: 3, delay: "2.1s" },
  { left: "92%", top: "48%", size: 3, delay: "0.4s" },
  { left: "8%", top: "52%", size: 3.5, delay: "1.1s" },
  { left: "46%", top: "14%", size: 3, delay: "1.8s" },
  { left: "62%", top: "86%", size: 3.5, delay: "2.5s" },
] as const;

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
  /** Appelé une fois toutes les ressources et modules prêts. */
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
  modulesLoaded: number;
  modulesTotal: number;
  modulesDone: boolean;
  ready: boolean;
}

const CHUNK_LOADERS: Array<() => Promise<unknown>> = [
  () => import("@/components/scenes/TableScreen"),
  () => import("@/components/scenes/ResultScreen"),
  () => loadGsap(),
  () => import("@/components/power/PowerParticles"),
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
  onReady,
  onCancel,
  onBackRequestRef,
}: MatchLoadingScreenProps) {
  const motionProfile = useMotionProfile();
  const reducedMotion = !motionProfile.enabled || motionProfile.reduced || motionProfile.level === "lite";
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

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
    modulesLoaded: 0,
    modulesTotal: CHUNK_LOADERS.length,
    modulesDone: false,
    ready: false,
  }));

  const [displayPct, setDisplayPct] = useState(8);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const [tip] = useState(() => {
    const pool = [...(MATCH_TIPS[gameMode] ?? []), ...MATCH_TIPS.common];
    return pool[Math.floor(Math.random() * pool.length)];
  });

  const effectiveMinMs = useMemo(() => {
    if (minDisplayMs !== undefined) return minDisplayMs;
    if (!motionProfile.enabled) return 0;
    if (motionProfile.reduced || motionProfile.level === "lite") return 260;
    return gameMode === "bot" ? 900 : 680;
  }, [gameMode, minDisplayMs, motionProfile.enabled, motionProfile.level, motionProfile.reduced]);

  const effectiveMaxMs = maxWaitMs ?? (gameMode === "bot" ? 6000 : 3800);

  /* Interception du bouton Retour pendant le chargement d'une partie. */
  useEffect(() => {
    if (!onBackRequestRef) return;
    onBackRequestRef.current = () => {
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
  }, [confirmCancel, onBackRequestRef]);

  /* Chargement réel : décors/cartes + pouvoirs/sons/cosmétiques + modules JS. */
  useEffect(() => {
    let cancelled = false;
    let finished = false;
    const startedAt = performance.now();
    markPerformance("gate:table:start");

    let finishDelayTimer: number | null = null;
    let minHoldTimer: number | null = null;

    const complete = (timedOut: boolean) => {
      if (cancelled || finished) return;
      finished = true;
      window.clearTimeout(maxTimer);
      if (minHoldTimer !== null) window.clearTimeout(minHoldTimer);
      markPerformance("gate:table:ready");
      measurePerformance("gate:table", "gate:table:start", "gate:table:ready");
      recordGateResult("table", {
        waitedMs: Math.round(performance.now() - startedAt),
        shown: true,
        timedOut,
      });
      setLoadState((prev) => ({
        ...prev,
        decorLoaded: prev.decorTotal,
        decorDone: true,
        powersLoaded: prev.powersTotal,
        powersDone: true,
        modulesLoaded: prev.modulesTotal,
        modulesDone: true,
        ready: true,
      }));
      setDisplayPct(100);
      prefetchAssets(backgroundAssets);
      const revealPause = effectiveMinMs === 0 ? 0 : 150;
      finishDelayTimer = window.setTimeout(() => {
        if (!cancelled) onReadyRef.current();
      }, revealPause);
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

    void Promise.all([decorPromise, powersPromise, modulesPromise]).then(() => {
      if (cancelled || finished) return;
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
      if (finishDelayTimer !== null) window.clearTimeout(finishDelayTimer);
    };
  }, [backgroundAssets, decorAssets, effectiveMaxMs, effectiveMinMs, powerAssets]);

  /* Interpolation douce de la barre de progression pour une sensation fluide. */
  const totalCount = Math.max(1, loadState.decorTotal + loadState.powersTotal + loadState.modulesTotal);
  const loadedCount = loadState.decorLoaded + loadState.powersLoaded + loadState.modulesLoaded;
  const rawPct = loadState.ready ? 100 : Math.min(96, Math.max(10, Math.round((loadedCount / totalCount) * 96)));

  useEffect(() => {
    if (loadState.ready) {
      setDisplayPct(100);
      return;
    }
    let rafId = 0;
    const tick = () => {
      setDisplayPct((current) => {
        if (current >= rawPct) return current;
        const delta = Math.max(1, Math.ceil((rawPct - current) * 0.2));
        return Math.min(rawPct, current + delta);
      });
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [loadState.ready, rawPct]);

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
    : !loadState.decorDone
      ? "Déploiement du tapis & des cartes…"
      : !loadState.powersDone
        ? "Chargement des cartes pouvoir & sons…"
        : !loadState.modulesDone
          ? "Initialisation du moteur de table…"
          : resuming
            ? "Synchronisation de la manche…"
            : "Mélange final du paquet…";

  const headline = loadState.ready
    ? "Bonne partie !"
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

  const ratio = Math.max(0.04, Math.min(1, displayPct / 100));

  return (
    <motion.div
      className={`${styles.root}${reducedMotion ? ` ${styles.reduced}` : ""}`}
      data-loading-gate="table"
      data-match-loader="true"
      role="status"
      aria-live="polite"
      aria-busy={!loadState.ready}
      initial={motionProfile.enabled ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={motionProfile.enabled ? { opacity: 0, scale: 1.02 } : undefined}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <div className={styles.ribbonTop} aria-hidden="true" />
      <div className={styles.spotlight} aria-hidden="true" />

      <div className={styles.watermarks} aria-hidden="true">
        <span className={styles.wm1}>♠</span>
        <span className={styles.wm2}>♥</span>
        <span className={styles.wm3}>♦</span>
        <span className={styles.wm4}>♣</span>
      </div>

      {!reducedMotion && (
        <div className={styles.sparks} aria-hidden="true">
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

      <motion.section
        className={styles.card}
        aria-label="Chargement de la partie"
        initial={motionProfile.enabled ? { opacity: 0, y: 18, scale: 0.96 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 360, damping: 28 }}
      >
        <span className={styles.innerFrame} aria-hidden="true" />
        {!reducedMotion && <span className={styles.sheen} aria-hidden="true" />}
        <span className={`${styles.rivet} ${styles.rivetTL}`} aria-hidden="true" />
        <span className={`${styles.rivet} ${styles.rivetTR}`} aria-hidden="true" />
        <span className={`${styles.rivet} ${styles.rivetBL}`} aria-hidden="true" />
        <span className={`${styles.rivet} ${styles.rivetBR}`} aria-hidden="true" />

        {/* 1. Badge du mode */}
        <div className={`${styles.modePill} ${styles[`mode_${meta.tone}`]}`}>
          <span className={styles.modeDot} aria-hidden="true" />
          <NjamboIcon name={meta.icon} tone={meta.tone} size={16} />
          <span>{resuming ? "Reprise en cours" : meta.label}</span>
        </div>

        {/* 2. Éventail cérémoniel de 5 cartes + anneau boussole */}
        <div className={styles.stage} aria-hidden="true">
          <div className={styles.haloRing}>
            <span className={`${styles.haloGem} ${styles.gemN}`}>♠</span>
            <span className={`${styles.haloGem} ${styles.gemE}`}>♥</span>
            <span className={`${styles.haloGem} ${styles.gemS}`}>♦</span>
            <span className={`${styles.haloGem} ${styles.gemW}`}>♣</span>
          </div>

          <div className={styles.fan}>
            <span className={`${styles.backCard} ${styles.fanL2}`} />
            <span className={`${styles.backCard} ${styles.fanL1}`} />
            <div className={styles.heroCard}>
              <span className={styles.heroCorner}>
                <span>3</span>
                <span>♦</span>
              </span>
              <span className={styles.heroPip}>♦</span>
              <span className={styles.heroCornerBot}>
                <span>3</span>
                <span>♦</span>
              </span>
            </div>
            <span className={`${styles.backCard} ${styles.fanR1}`} />
            <span className={`${styles.backCard} ${styles.fanR2}`} />
          </div>

          <div className={styles.markDock}>
            <NjamboMark size={30} compact />
          </div>
        </div>

        {/* 3. Titre + infos clés de la partie */}
        <div className={styles.heading}>
          <h2 className={styles.title}>{headline}</h2>
          <p className={styles.subtitle}>{subline}</p>
        </div>

        <div className={styles.metaRow}>
          <span className={styles.metaChip}>
            <NjamboIcon name="users" tone="teal" size={14} />
            <span>{playerCount} joueurs</span>
          </span>

          <span className={styles.metaChip}>
            <img src="/assets/njambo/economy/nkap-64.webp" alt="" className={styles.coinImg} draggable={false} />
            <span>{mise > 0 ? NKAP(mise) : gameMode === "event" ? "Tournoi" : "Amicale"}</span>
          </span>

          {powerThumbs.length > 0 && (
            <span className={styles.powerChips} title="Tes cartes pouvoir équipées">
              {powerThumbs.map((card) => (
                <img
                  key={card.id}
                  src={card.art}
                  alt={card.name}
                  className={styles.powerThumb}
                  draggable={false}
                />
              ))}
              {equippedPowers.length > 3 && (
                <span className={styles.powerChipsCount}>+{equippedPowers.length - 3}</span>
              )}
            </span>
          )}
        </div>

        {/* 4. Barre de progression or liquide + étapes réelles */}
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

          <div className={styles.stagesRow}>
            <span className={`${styles.stageBadge}${loadState.decorDone ? ` ${styles.stageBadgeDone}` : ""}`}>
              <span className={styles.stageDot} aria-hidden="true" />
              <span>{loadState.decorDone ? "✓ Décors" : "Décors"}</span>
            </span>
            <span className={`${styles.stageBadge}${loadState.powersDone ? ` ${styles.stageBadgeDone}` : ""}`}>
              <span className={styles.stageDot} aria-hidden="true" />
              <span>{loadState.powersDone ? "✓ Pouvoirs" : "Pouvoirs"}</span>
            </span>
            <span className={`${styles.stageBadge}${loadState.modulesDone ? ` ${styles.stageBadgeDone}` : ""}`}>
              <span className={styles.stageDot} aria-hidden="true" />
              <span>{loadState.modulesDone ? "✓ Table" : "Table"}</span>
            </span>
          </div>

          <span className={styles.resourceCount}>
            {loadedCount} / {totalCount} ressources chargées
          </span>
        </div>

        {/* 5. Astuce du Mboa */}
        <div className={styles.tipBox}>
          <img
            src="/assets/njambo/ui/icons/sparkle-64.webp"
            alt=""
            className={styles.tipIcon}
            draggable={false}
          />
          <p className={styles.tipText}>
            <span className={styles.tipLabel}>Astuce du Mboa</span>
            {tip}
          </p>
        </div>
      </motion.section>

      <div className={styles.ribbonBottom} aria-hidden="true" />

      {/* Confirmation si le joueur appuie sur Retour pendant le lancement */}
      {confirmCancel && onCancel && (
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

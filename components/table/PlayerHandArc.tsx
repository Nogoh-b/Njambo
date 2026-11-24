"use client";

import { memo, useEffect, useId, useState, type CSSProperties } from "react";
import { DEFAULT_HAND_ARC_ASSET } from "@/lib/assets/manifests";
import styles from "./PlayerHandArc.module.css";

/* ═══════════════ PlayerHandArc — Arche circulaire cosmétique ═══════════════
   Affiche un vrai asset d'arche (par défaut : Soleil de Chefferie 2A, ou tout
   cosmétique « hand_arc » équipé par le joueur) dans un arc de cercle parfait
   (centre 260,282 · R=256 · viewBox 520×190), ancré au bord du siège
   (bottom, top, left, right — à échelle réduite pour les adversaires).
   S'agrandit et passe en surbrillance dorée animée dès que le tour lui revient. */

export const PLAYER_HAND_ARC_ASPECT = 520 / 190;

export type PlayerHandArcEdge = "bottom" | "top" | "left" | "right";
export type PlayerHandArcState = "idle" | "dealing" | "active" | "ngata";

interface PlayerHandArcProps {
  /** Bord de la table sur lequel l'arche s'appuie (défaut : bottom). */
  edge?: PlayerHandArcEdge;
  /** Largeur de base (px), verrouillée au ratio circulaire parfait. */
  width: number;
  /** Hauteur de base (px) depuis le bord de l'écran. */
  height: number;
  /** Vrai quand ce joueur est mis en surbrillance pour son tour. */
  active: boolean;
  /** Vrai pendant la distribution initiale des cartes. */
  dealing?: boolean;
  /** Vrai au 5e pli décisif (Ngata) : surbrillance or-rubis royale. */
  finalTrick?: boolean;
  /** Position verticale des sièges latéraux (ex. "50%" portrait, "46%" paysage). */
  sideTop?: string;
  /** Décalage supplémentaire du bord haut (sous la capsule d'état). */
  topPadPx?: number;
  /** URL de l'asset d'arche équipé (défaut : Soleil de Chefferie). */
  assetUrl?: string | null;
  /** Autorise les transitions et effets lumineux animés. */
  animated?: boolean;
  /** Vrai si les transitions globales de mouvement sont actives (hors mode off). */
  motionEnabled?: boolean;
}

const PERFECT_CIRCLE_ARC_PATH = "M 21.1 190 A 256 256 0 0 1 498.9 190";

export const PlayerHandArc = memo(function PlayerHandArc({
  edge = "bottom",
  width,
  height,
  active,
  dealing = false,
  finalTrick = false,
  sideTop = "46%",
  topPadPx = 22,
  assetUrl,
  animated = true,
  motionEnabled = true,
}: PlayerHandArcProps) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const resolvedSrc = assetUrl?.trim() || DEFAULT_HAND_ARC_ASSET;
  const [src, setSrc] = useState(resolvedSrc);

  useEffect(() => {
    setSrc(resolvedSrc);
  }, [resolvedSrc]);

  const isOpponent = edge !== "bottom";
  const isNgata = finalTrick && active;
  const state: PlayerHandArcState = isNgata
    ? "ngata"
    : active
      ? "active"
      : dealing
        ? "dealing"
        : "idle";

  const isHighlighted = state === "active" || state === "ngata";
  const animateLive = animated && motionEnabled && isHighlighted;

  const rimColor = isNgata ? "#ff688c" : "#ffe573";
  const sweepColor = isNgata ? "#ffd4df" : "#fffbe0";

  const edgePad =
    edge === "bottom"
      ? "env(safe-area-inset-bottom, 0px)"
      : edge === "top"
        ? `calc(${Math.round(topPadPx)}px + env(safe-area-inset-top, 0px))`
        : edge === "left"
          ? "env(safe-area-inset-left, 0px)"
          : "env(safe-area-inset-right, 0px)";

  const anchorStyle = (
    edge === "left" || edge === "right" ? { "--nj-side-y": sideTop } : undefined
  ) as CSSProperties | undefined;

  const rootStyle = {
    "--nj-arc-w": `${Math.round(width)}px`,
    "--nj-arc-h": `${Math.round(height)}px`,
    "--nj-edge-pad": edgePad,
  } as CSSProperties;

  return (
    <div
      className={`${styles.anchor} ${styles[`edge_${edge}`]}`}
      style={anchorStyle}
      aria-hidden="true"
    >
      <div
        className={styles.root}
        style={rootStyle}
        data-player-hand-arc="perfect-circle"
        data-arc-edge={edge}
        data-variant={isOpponent ? "opponent" : "self"}
        data-asset-url={src}
        data-state={state}
        data-animated={animateLive ? "true" : "false"}
        data-motion={motionEnabled ? "true" : "false"}
      >
        <span className={styles.halo} />

        <div className={styles.stage}>
          {/* eslint-disable-next-line @next/next/no-img-element -- asset cosmétique d'arche (SVG par défaut ou image équipée par le joueur) */}
          <img
            src={src}
            alt=""
            draggable={false}
            decoding="async"
            className={styles.asset}
            onError={() => {
              if (src !== DEFAULT_HAND_ARC_ASSET) setSrc(DEFAULT_HAND_ARC_ASSET);
            }}
          />

          {/* Surbrillance circulaire parfaite : s'illumine au tour du joueur quel que soit l'asset */}
          <svg
            viewBox="0 0 520 190"
            preserveAspectRatio="xMidYMax meet"
            className={styles.highlightSvg}
            focusable="false"
          >
            <defs>
              <linearGradient id={`njHiRim-${uid}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={rimColor} stopOpacity="0.18" />
                <stop offset="20%" stopColor={rimColor} stopOpacity="0.95" />
                <stop offset="50%" stopColor={sweepColor} stopOpacity="1" />
                <stop offset="80%" stopColor={rimColor} stopOpacity="0.95" />
                <stop offset="100%" stopColor={rimColor} stopOpacity="0.18" />
              </linearGradient>

              <radialGradient id={`njHiCrest-${uid}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={sweepColor} stopOpacity="0.95" />
                <stop offset="55%" stopColor={rimColor} stopOpacity="0.45" />
                <stop offset="100%" stopColor={rimColor} stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Onde circulaire qui se propage à l'ouverture du tour */}
            {isHighlighted && (
              <path
                key={state}
                d={PERFECT_CIRCLE_ARC_PATH}
                fill="none"
                stroke={sweepColor}
                strokeWidth="4"
                strokeLinecap="butt"
                className={styles.turnWave}
              />
            )}

            {/* Aura de surbrillance douce collée à l'arc de cercle (double trait SVG sans filter blur GPU) */}
            <path
              d={PERFECT_CIRCLE_ARC_PATH}
              fill="none"
              stroke={rimColor}
              strokeOpacity="0.24"
              strokeWidth="18"
              strokeLinecap="butt"
              className={styles.rimGlow}
            />
            <path
              d={PERFECT_CIRCLE_ARC_PATH}
              fill="none"
              stroke={`url(#njHiRim-${uid})`}
              strokeWidth="8"
              strokeLinecap="butt"
              className={styles.rimGlow}
            />

            {/* Trait lumineux net + reflet mobile qui parcourt la courbe */}
            <path
              d={PERFECT_CIRCLE_ARC_PATH}
              fill="none"
              stroke={sweepColor}
              strokeWidth="2.4"
              strokeLinecap="round"
              className={styles.rimSweep}
            />

            {/* Éclat doux autour du sommet de l'arc */}
            <circle
              cx="260"
              cy="26"
              r="22"
              fill={`url(#njHiCrest-${uid})`}
              className={styles.crestHalo}
            />
          </svg>
        </div>

        <span className={styles.safeSkirt} />
      </div>
    </div>
  );
});

"use client";

/* ═══════════════ PowerTargetPicker — choix de cible sur la table ═══════════════
   Remplace la fenêtre « Choisis une cible » pour toutes les cartes ciblées :
   la table s'assombrit, les joueurs visables restent dans la lumière (main et
   avatar), entourés d'un cadre de visée animé à la couleur de la carte.
   Toucher le cadre choisit le joueur. Les positions viennent du registre de
   zones (relues à chaque image : les mains s'avancent pendant le ciblage). */

import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { POWER_CARDS_BY_ID } from "@/config/powerCards";
import type { ZoneRegistry } from "@/components/table/zones/ZoneRegistry";
import type { Player, PowerCardId } from "@/types/game";
import styles from "./PowerTargetPicker.module.css";

const TONE_COLORS: Record<string, string> = { gold: "#f2bb45", teal: "#1de4be", pink: "#ff5b82", cobalt: "#6fa8ff" };
/** Marge autour de la main et de l'avatar (px). */
const PAD = 12;
/** Retour visuel du choix avant de lancer la suite. */
const LOCK_MS = 280;

interface Frame { ui: number; x: number; y: number; w: number; h: number }

interface PowerTargetPickerProps {
  cardId: PowerCardId;
  /** Joueurs en ordre UI (0 = moi). */
  players: Player[];
  registry: ZoneRegistry | null;
  allowSelf?: boolean;
  motion: boolean;
  onPick(uiIdx: number): void;
  onCancel(): void;
}

/** Cadre englobant la main et l'avatar d'un joueur, limité à l'écran. */
function frameOf(registry: ZoneRegistry, ui: number): Frame | null {
  const rects = [registry.hand(ui)?.getRect(), registry.timer(ui)?.getRect()].filter((rect): rect is DOMRect => !!rect && rect.width > 0);
  if (rects.length === 0) return null;
  const vw = window.innerWidth, vh = window.innerHeight;
  const left = Math.max(4, Math.min(...rects.map((rect) => rect.left)) - PAD);
  const top = Math.max(4, Math.min(...rects.map((rect) => rect.top)) - PAD);
  const right = Math.min(vw - 4, Math.max(...rects.map((rect) => rect.right)) + PAD);
  const bottom = Math.min(vh - 4, Math.max(...rects.map((rect) => rect.bottom)) + PAD);
  if (right - left < 20 || bottom - top < 20) return null;
  return { ui, x: Math.round(left), y: Math.round(top), w: Math.round(right - left), h: Math.round(bottom - top) };
}

export const PowerTargetPicker = memo(function PowerTargetPicker({ cardId, players, registry, allowSelf = false, motion, onPick, onCancel }: PowerTargetPickerProps) {
  const def = POWER_CARDS_BY_ID[cardId];
  const color = TONE_COLORS[def?.tone ?? "gold"] ?? TONE_COLORS.gold;
  const [frames, setFrames] = useState<Frame[]>([]);
  const [locked, setLocked] = useState<number | null>(null);
  const targets = players.map((_, ui) => ui).filter((ui) => ui !== 0 || allowSelf);
  const targetsKey = targets.join(",");
  const pickRef = useRef(onPick);
  const cancelRef = useRef(onCancel);
  useEffect(() => { pickRef.current = onPick; cancelRef.current = onCancel; }, [onPick, onCancel]);

  // Positions relues à chaque image (les mains s'avancent, la fenêtre peut changer de taille).
  useEffect(() => {
    if (!registry) return;
    let raf = 0;
    let last = "";
    const uis = targetsKey.split(",").map(Number);
    const tick = () => {
      const next = uis.map((ui) => frameOf(registry, ui)).filter((frame): frame is Frame => !!frame);
      const key = next.map((frame) => `${frame.ui}:${frame.x},${frame.y},${frame.w},${frame.h}`).join("|");
      if (key !== last) { last = key; setFrames(next); }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [registry, targetsKey]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") cancelRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pick = (ui: number) => {
    if (locked != null) return;
    if (!motion) { pickRef.current(ui); return; }
    setLocked(ui);
    setTimeout(() => pickRef.current(ui), LOCK_MS);
  };

  return (
    <div className={`${styles.root} ${motion ? "" : styles.still}`} style={{ "--target-color": color } as CSSProperties} data-power-target-picker>
      {/* Voile : la table s'assombrit, les joueurs visables restent dans la lumière. */}
      <svg className={styles.veil} aria-hidden="true">
        <defs>
          <mask id="nj-target-spotlight">
            <rect width="100%" height="100%" fill="#fff" />
            {frames.map((frame) => <rect key={frame.ui} x={frame.x} y={frame.y} width={frame.w} height={frame.h} rx={22} fill="#000" />)}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(2, 8, 6, 0.66)" mask="url(#nj-target-spotlight)" />
      </svg>

      {frames.map((frame) => {
        const player = players[frame.ui];
        const state = locked == null ? "" : locked === frame.ui ? styles.locked : styles.dropped;
        return (
          <button
            key={frame.ui}
            type="button"
            className={`${styles.frame} ${state}`}
            style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
            aria-label={`Viser ${player?.name ?? "ce joueur"}`}
            data-power-target={frame.ui}
            onClick={() => pick(frame.ui)}
          >
            <span className={styles.ring} aria-hidden="true" />
            <span className={styles.glow} aria-hidden="true" />
            <i className={`${styles.corner} ${styles.tl}`} aria-hidden="true" />
            <i className={`${styles.corner} ${styles.tr}`} aria-hidden="true" />
            <i className={`${styles.corner} ${styles.bl}`} aria-hidden="true" />
            <i className={`${styles.corner} ${styles.br}`} aria-hidden="true" />
            <span className={`${styles.tag} ${frame.y < 60 ? styles.tagBelow : ""}`}>
              <span className={styles.tagIcon} aria-hidden="true">◎</span>
              {frame.ui === 0 ? "Toi" : player?.name}
            </span>
          </button>
        );
      })}

      <div className={styles.hint} role="dialog" aria-label={`${def?.name ?? "Carte pouvoir"} : choisis une cible`}>
        <span className={styles.hintCard}>{def?.name}</span>
        <strong className={styles.hintText}>Touche le joueur à viser</strong>
        <button type="button" className={styles.cancel} onClick={() => cancelRef.current()}>Annuler</button>
      </div>
    </div>
  );
});

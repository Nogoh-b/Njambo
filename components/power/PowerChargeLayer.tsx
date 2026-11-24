"use client";

/* ═══════════════ PowerChargeLayer — « prochaine carte » chargée ═══════════════
   Un pouvoir qui renforce la prochaine carte d'un joueur (Éclair du Mfoundi…) se voit
   jusqu'à ce que la carte soit jouée :
   - chez moi : la main crépite, chaque carte porte sa valeur renforcée (« 7 → 9 ») ;
   - chez les autres : un badge « ⚡ +2 » sur l'avatar du joueur chargé ;
   - à la pose : la foudre frappe la carte sur le tapis, puis la charge disparaît.
   La charge vient de l'activation (le client ne reçoit pas les effets actifs du serveur) ;
   elle est consommée dès qu'une carte de ce joueur arrive sur son dépôt. */

import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import type { ZoneRegistry } from "@/components/table/zones/ZoneRegistry";
import type { GameState } from "@/types/game";
import styles from "./PowerChargeLayer.module.css";

const TONE_COLORS: Record<string, string> = { gold: "#f2bb45", teal: "#1de4be", pink: "#ff5b82", cobalt: "#6fa8ff" };
const STRIKE_MS = 900;

export interface PowerCharge {
  key: string;
  /** Joueur chargé (index UI, 0 = moi). */
  ui: number;
  valueBonus: number;
  tone?: string;
  /** Nombre de cartes sur son dépôt à la charge : une carte de plus = carte jouée. */
  depositLen: number;
}

interface Badge { key: string; x: number; y: number; rotate: number; text: string }
interface Frame { key: string; ui: number; x: number; y: number; w: number; h: number; kind: "hand" | "avatar"; text: string; color: string }
interface Strike { key: string; x: number; y: number; w: number; h: number; color: string }

export const PowerChargeLayer = memo(function PowerChargeLayer({ charges, registry, getPlayers, maxValue, motion, onConsumed }: {
  charges: PowerCharge[];
  registry: ZoneRegistry;
  getPlayers(): GameState["players"];
  maxValue: number;
  motion: boolean;
  onConsumed(key: string): void;
}) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [strikes, setStrikes] = useState<Strike[]>([]);
  const consumedRef = useRef(onConsumed);
  const getPlayersRef = useRef(getPlayers);
  useEffect(() => { consumedRef.current = onConsumed; getPlayersRef.current = getPlayers; }, [onConsumed, getPlayers]);

  useEffect(() => {
    if (charges.length === 0) return;
    let raf = 0;
    let last = "";
    const done = new Set<string>();
    const tick = () => {
      const players = getPlayersRef.current();
      const nextFrames: Frame[] = [];
      const nextBadges: Badge[] = [];
      for (const charge of charges) {
        if (done.has(charge.key)) continue;
        const color = TONE_COLORS[charge.tone ?? "teal"] ?? TONE_COLORS.teal;
        const deposit = players[charge.ui]?.deposit ?? [];
        // Carte jouée (ou nouvelle manche) : la charge est consommée ; la foudre frappe la carte posée.
        if (deposit.length !== charge.depositLen) {
          done.add(charge.key);
          const top = deposit.length > charge.depositLen ? registry.deposit(charge.ui)?.getTopCardRect() : null;
          if (top && motion) {
            const strike = { key: charge.key, x: top.left, y: top.top, w: top.width, h: top.height, color };
            setStrikes((current) => [...current, strike]);
            setTimeout(() => setStrikes((current) => current.filter((item) => item.key !== strike.key)), STRIKE_MS);
          }
          consumedRef.current(charge.key);
          continue;
        }
        if (charge.ui === 0) {
          const hand = registry.hand(0);
          const rect = hand?.getRect();
          if (rect) nextFrames.push({ key: charge.key, ui: 0, x: rect.left, y: rect.top, w: rect.width, h: rect.height, kind: "hand", text: `+${charge.valueBonus}`, color });
          (players[0]?.hand ?? []).forEach((card, index) => {
            const box = cardBox(registry, index);
            if (!box) return;
            const boosted = Math.min(maxValue, card.value + charge.valueBonus);
            nextBadges.push({ key: `${charge.key}-${card.id}`, x: box.x, y: box.y + box.height * 0.32, rotate: box.rotate, text: boosted > card.value ? `${card.value} → ${boosted}` : `${card.value} max` });
          });
        } else {
          const rect = registry.timer(charge.ui)?.getRect();
          if (rect) nextFrames.push({ key: charge.key, ui: charge.ui, x: rect.left, y: rect.top, w: rect.width, h: rect.height, kind: "avatar", text: `+${charge.valueBonus}`, color });
        }
      }
      const key = JSON.stringify([nextFrames.map((f) => [f.key, Math.round(f.x), Math.round(f.y), Math.round(f.w)]), nextBadges.map((b) => [b.key, Math.round(b.x), Math.round(b.y), Math.round(b.rotate), b.text])]);
      if (key !== last) { last = key; setFrames(nextFrames); setBadges(nextBadges); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [charges, registry, maxValue, motion]);

  if ((charges.length === 0 || frames.length === 0) && strikes.length === 0) return null;
  return (
    <div className={`${styles.root} ${motion ? "" : styles.still}`} aria-hidden="true" data-power-charge>
      {charges.length > 0 && frames.map((frame) => frame.kind === "hand" ? (
        <div key={frame.key} className={styles.hand} style={{ left: frame.x - 10, top: frame.y - 10, width: frame.w + 20, height: frame.h + 20, "--charge-color": frame.color } as CSSProperties}>
          <i className={styles.spark} style={{ left: "12%", animationDelay: "0ms" }} />
          <i className={styles.spark} style={{ left: "48%", animationDelay: "420ms" }} />
          <i className={styles.spark} style={{ left: "82%", animationDelay: "860ms" }} />
          <span className={styles.handTag}>⚡ Prochaine carte {frame.text}</span>
        </div>
      ) : (
        <span key={frame.key} className={styles.avatarTag} style={{ left: frame.x + frame.w / 2, top: frame.y + frame.h, "--charge-color": frame.color } as CSSProperties}>⚡ {frame.text}</span>
      ))}
      {charges.length > 0 && badges.map((badge) => (
        <span key={badge.key} className={styles.value} style={{ left: badge.x, top: badge.y, transform: `translate(-50%, -50%) rotate(${badge.rotate}deg)` }}>{badge.text}</span>
      ))}
      {strikes.map((strike) => (
        <div key={strike.key} className={styles.strike} style={{ left: strike.x, top: strike.y, width: strike.w, height: strike.h, "--charge-color": strike.color } as CSSProperties}>
          <svg className={styles.bolt} viewBox="0 0 40 200" preserveAspectRatio="none"><path d="M24 0 L10 86 L22 90 L8 200 L34 72 L22 68 L32 0 Z" /></svg>
          <span className={styles.flash} />
        </div>
      ))}
    </div>
  );
});

/** Carte telle qu'affichée dans ma main (soulevée, inclinée). */
function cardBox(registry: ZoneRegistry, index: number): { x: number; y: number; height: number; rotate: number } | null {
  const face = registry.hand(0)?.getElement?.()?.children[index]?.firstElementChild as HTMLElement | null | undefined;
  if (!face || face.offsetWidth === 0) return null;
  const box = face.getBoundingClientRect();
  const transform = getComputedStyle(face).transform;
  const matrix = new DOMMatrix(transform === "none" ? undefined : transform);
  return { x: box.left + box.width / 2, y: box.top + box.height / 2, height: face.offsetHeight, rotate: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI };
}

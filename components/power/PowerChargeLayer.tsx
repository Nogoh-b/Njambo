"use client";

/* ═══════════════ PowerChargeLayer — effets « jusqu'à la prochaine carte » ═══════════════
   Un pouvoir qui change la prochaine carte d'un joueur se voit jusqu'à ce que la carte soit jouée.
   - Renfort (Éclair du Mfoundi) : chez moi, la main crépite et chaque carte porte sa valeur renforcée
     (« 7 → 9 ») ; chez les autres, « ⚡ +2 » sous l'avatar ; à la pose, la foudre frappe la carte.
   - Changement de couleur (Pagne Changeant) : « 7♣ → 7♥ » sur les cartes hors tendance, « ⇄ ♥ » sous
     l'avatar, vague de pagne à la pose.
   - Carte imposée (Coupe-Circuit, Filet du Pêcheur) : chez la cible, ses autres cartes s'éteignent, seule
     la carte imposée reste allumée (« Imposée ») ; chez les autres, un badge sous son avatar ; étincelle
     à la pose. Simple affichage : le serveur impose déjà la carte.
   La charge vient de l'activation (le client ne reçoit pas les effets actifs du serveur) ;
   elle est consommée dès qu'une carte de ce joueur arrive sur son dépôt. */

import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import type { ZoneRegistry } from "@/components/table/zones/ZoneRegistry";
import { legalCards } from "@/engine/rules";
import type { Card, GameState } from "@/types/game";
import styles from "./PowerChargeLayer.module.css";

const TONE_COLORS: Record<string, string> = { gold: "#f2bb45", teal: "#1de4be", pink: "#ff5b82", cobalt: "#6fa8ff" };
const STRIKE_MS = 900;

export interface PowerCharge {
  key: string;
  /** Joueur concerné (index UI, 0 = moi). */
  ui: number;
  /** Renfort de valeur (Éclair). */
  valueBonus?: number;
  /** Couleur que prend la prochaine carte (Pagne Changeant). */
  suit?: string;
  /** Carte imposée : la plus faible ou la plus forte carte jouable (Coupe-Circuit, Filet). */
  force?: "weakest" | "strongest";
  /** Bandeau au-dessus de ma main, badge sous l'avatar d'un autre joueur. */
  handTag: string;
  avatarTag: string;
  /** Effet à la pose de la carte. */
  landing: "bolt" | "dye" | "spark";
  tone?: string;
  /** Nombre de cartes sur son dépôt à la charge : une carte de plus = carte jouée. */
  depositLen: number;
}

interface Badge { key: string; x: number; y: number; rotate: number; text: string }
/** Contour de la carte imposée. */
interface Veil { key: string; x: number; y: number; w: number; h: number; rotate: number; color: string }
interface Frame { key: string; ui: number; x: number; y: number; w: number; h: number; kind: "hand" | "avatar"; text: string; color: string; crackle: boolean }
interface Strike { key: string; x: number; y: number; w: number; h: number; color: string; landing: PowerCharge["landing"] }

/** Index de la carte imposée : même calcul que le serveur (plus faible / plus forte carte légale). */
function forcedIndex(hand: Card[], ledSuit: string | null, force: "weakest" | "strongest"): number | null {
  const legal = legalCards(hand, ledSuit);
  if (legal.length === 0) return null;
  const sorted = [...legal].sort((a, b) => hand[a].value - hand[b].value);
  return (force === "strongest" ? sorted[sorted.length - 1] : sorted[0]) ?? null;
}

export const PowerChargeLayer = memo(function PowerChargeLayer({ charges, registry, getPlayers, getLedSuit, maxValue, motion, onConsumed }: {
  charges: PowerCharge[];
  registry: ZoneRegistry;
  getPlayers(): GameState["players"];
  getLedSuit?(): string | null;
  maxValue: number;
  motion: boolean;
  onConsumed(key: string): void;
}) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [veils, setVeils] = useState<Veil[]>([]);
  const [strikes, setStrikes] = useState<Strike[]>([]);
  const consumedRef = useRef(onConsumed);
  const getPlayersRef = useRef(getPlayers);
  const getLedSuitRef = useRef(getLedSuit);
  useEffect(() => { consumedRef.current = onConsumed; getPlayersRef.current = getPlayers; getLedSuitRef.current = getLedSuit; }, [onConsumed, getPlayers, getLedSuit]);

  useEffect(() => {
    if (charges.length === 0) return;
    let raf = 0;
    let last = "";
    let lastDim = 0;
    const done = new Set<string>();
    const tick = () => {
      const players = getPlayersRef.current();
      const nextFrames: Frame[] = [];
      const nextBadges: Badge[] = [];
      const nextVeils: Veil[] = [];
      for (const charge of charges) {
        if (done.has(charge.key)) continue;
        const color = TONE_COLORS[charge.tone ?? "teal"] ?? TONE_COLORS.teal;
        const deposit = players[charge.ui]?.deposit ?? [];
        // Carte jouée (ou nouvelle manche) : la charge est consommée ; effet sur la carte posée.
        if (deposit.length !== charge.depositLen) {
          done.add(charge.key);
          const top = deposit.length > charge.depositLen ? registry.deposit(charge.ui)?.getTopCardRect() : null;
          if (top && motion) {
            const strike = { key: charge.key, x: top.left, y: top.top, w: top.width, h: top.height, color, landing: charge.landing };
            setStrikes((current) => [...current, strike]);
            setTimeout(() => setStrikes((current) => current.filter((item) => item.key !== strike.key)), STRIKE_MS);
          }
          // Contrainte levée : la main se rallume tout de suite.
          if (charge.force && charge.ui === 0) registry.hand(0)?.dimCards?.((players[0]?.hand ?? []).map((_, index) => index), 1);
          consumedRef.current(charge.key);
          continue;
        }
        if (charge.ui !== 0) {
          const rect = registry.timer(charge.ui)?.getRect();
          if (rect) nextFrames.push({ key: charge.key, ui: charge.ui, x: rect.left, y: rect.top, w: rect.width, h: rect.height, kind: "avatar", text: charge.avatarTag, color, crackle: !charge.force });
          continue;
        }
        const rect = registry.hand(0)?.getRect();
        if (rect) nextFrames.push({ key: charge.key, ui: 0, x: rect.left, y: rect.top, w: rect.width, h: rect.height, kind: "hand", text: charge.handTag, color, crackle: !charge.force });
        const hand = players[0]?.hand ?? [];
        const forced = charge.force ? forcedIndex(hand, getLedSuitRef.current?.() ?? null, charge.force) : null;
        // Carte imposée : la main éteint elle-même les autres cartes (l'empilement de l'éventail reste juste),
        // renouvelé tant que la contrainte dure.
        if (charge.force && forced != null && performance.now() - lastDim > 600) {
          lastDim = performance.now();
          registry.hand(0)?.dimCards?.([forced], 1200);
        }
        hand.forEach((card, index) => {
          const box = cardBox(registry, index);
          if (!box) return;
          const badgeAt = { x: box.x, y: box.y + box.height * 0.32, rotate: box.rotate };
          if (charge.force) {
            if (index !== forced) return;
            nextVeils.push({ key: `${charge.key}-${card.id}`, x: box.x, y: box.y, w: box.width, h: box.height, rotate: box.rotate, color });
            nextBadges.push({ key: `${charge.key}-${card.id}`, ...badgeAt, text: "Imposée" });
          } else if (charge.valueBonus) {
            const boosted = Math.min(maxValue, card.value + charge.valueBonus);
            nextBadges.push({ key: `${charge.key}-${card.id}`, ...badgeAt, text: boosted > card.value ? `${card.value} → ${boosted}` : `${card.value} max` });
          } else if (charge.suit && card.suit !== charge.suit) {
            // Changement de couleur : seules les cartes hors tendance changent.
            nextBadges.push({ key: `${charge.key}-${card.id}`, ...badgeAt, text: `${card.rank}${card.suit} → ${card.rank}${charge.suit}` });
          }
        });
      }
      const round = (n: number) => Math.round(n);
      const key = JSON.stringify([
        nextFrames.map((f) => [f.key, round(f.x), round(f.y), round(f.w)]),
        nextBadges.map((b) => [b.key, round(b.x), round(b.y), round(b.rotate), b.text]),
        nextVeils.map((v) => [v.key, round(v.x), round(v.y), round(v.rotate)]),
      ]);
      if (key !== last) { last = key; setFrames(nextFrames); setBadges(nextBadges); setVeils(nextVeils); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [charges, registry, maxValue, motion]);

  if ((charges.length === 0 || frames.length === 0) && strikes.length === 0) return null;
  const live = charges.length > 0;
  return (
    <div className={`${styles.root} ${motion ? "" : styles.still}`} aria-hidden="true" data-power-charge>
      {live && veils.map((veil) => (
        <span key={veil.key} className={styles.forced}
          style={{ left: veil.x, top: veil.y, width: veil.w, height: veil.h, transform: `translate(-50%, -50%) rotate(${veil.rotate}deg)`, "--charge-color": veil.color } as CSSProperties} />
      ))}
      {live && frames.map((frame) => frame.kind === "hand" ? (
        <div key={frame.key} className={`${styles.hand} ${frame.crackle ? "" : styles.handCut}`} style={{ left: frame.x - 10, top: frame.y - 10, width: frame.w + 20, height: frame.h + 20, "--charge-color": frame.color } as CSSProperties}>
          {frame.crackle && <>
            <i className={styles.spark} style={{ left: "12%", animationDelay: "0ms" }} />
            <i className={styles.spark} style={{ left: "48%", animationDelay: "420ms" }} />
            <i className={styles.spark} style={{ left: "82%", animationDelay: "860ms" }} />
          </>}
          <span className={styles.handTag}>{frame.text}</span>
        </div>
      ) : (
        <span key={frame.key} className={styles.avatarTag} style={{ left: `clamp(80px, ${frame.x + frame.w / 2}px, calc(100vw - 80px))`, top: frame.y + frame.h, "--charge-color": frame.color } as CSSProperties}>{frame.text}</span>
      ))}
      {live && badges.map((badge) => (
        <span key={badge.key} className={styles.value} style={{ left: badge.x, top: badge.y, transform: `translate(-50%, -50%) rotate(${badge.rotate}deg)` }}>{badge.text}</span>
      ))}
      {strikes.map((strike) => (
        <div key={strike.key} className={`${styles.strike} ${strike.landing === "dye" ? styles.dye : ""}`} style={{ left: strike.x, top: strike.y, width: strike.w, height: strike.h, "--charge-color": strike.color } as CSSProperties}>
          {strike.landing === "bolt" && <svg className={styles.bolt} viewBox="0 0 40 200" preserveAspectRatio="none"><path d="M24 0 L10 86 L22 90 L8 200 L34 72 L22 68 L32 0 Z" /></svg>}
          <span className={styles.flash} />
        </div>
      ))}
    </div>
  );
});

/** Carte telle qu'affichée dans ma main (soulevée, inclinée). */
function cardBox(registry: ZoneRegistry, index: number): { x: number; y: number; width: number; height: number; rotate: number } | null {
  const face = registry.hand(0)?.getElement?.()?.children[index]?.firstElementChild as HTMLElement | null | undefined;
  if (!face || face.offsetWidth === 0) return null;
  const box = face.getBoundingClientRect();
  const transform = getComputedStyle(face).transform;
  const matrix = new DOMMatrix(transform === "none" ? undefined : transform);
  return { x: box.left + box.width / 2, y: box.top + box.height / 2, width: face.offsetWidth, height: face.offsetHeight, rotate: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI };
}

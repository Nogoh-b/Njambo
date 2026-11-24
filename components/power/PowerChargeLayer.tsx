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
   - Carte scellée (Sceau d'Entrave) : chez la cible, la carte scellée s'éteint et porte « 🔒 Scellée » ;
     « 🔒 1 carte scellée » sous son avatar chez les autres.
   La charge vient de l'activation (le client ne reçoit pas les effets actifs du serveur) ;
   elle est consommée dès qu'une carte de ce joueur arrive sur son dépôt. */

import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import type { ZoneRegistry } from "@/components/table/zones/ZoneRegistry";
import { legalCards } from "@/engine/rules";
import { drawSealedRest, seg, sineInOut } from "@/components/power/choreo/sealArt";
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
  /** Carte scellée de MA main (Sceau d'Entrave), par son id : elle s'éteint, chaînes et cadenas posés dessus. */
  lockedCardId?: string;
  /** Place de la carte scellée dans la main d'un AUTRE joueur : chaînes et cadenas sur sa carte de dos, pour tous. */
  lockedIndex?: number;
  /** Bonus de pot « si tu gagnes la manche » (Bénédiction du Chef ×2, Pluie d'Étoiles +200) : badge près du pot pour tous
   *  jusqu'au dernier pli ; il éclate sur le pot si son joueur le rafle, s'éteint (« perdu ») sinon. */
  pot?: { factor?: number; amount?: number; owner: string };
  /** Protection jusqu'à la fin de la manche (Cauris Chanceux, Totem des Ancêtres) : badge sous l'avatar de son joueur,
   *  pour tous, jusqu'au dernier pli. */
  insured?: boolean;
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
/** Projecteur sur la carte imposée : centre et hauteur de la carte, ombre de la table et faisceau (0 → 1). */
interface Spot { x: number; y: number; h: number; dark: number; beam: number; color: string }
const SPOT_MS = 1500;
/** Contour de la carte imposée. */
interface Veil { key: string; x: number; y: number; w: number; h: number; rotate: number; color: string; sealed?: boolean }
interface Frame { key: string; ui: number; x: number; y: number; w: number; h: number; kind: "hand" | "avatar" | "glow" | "pot"; text: string; color: string; crackle: boolean }
interface Strike { key: string; x: number; y: number; w: number; h: number; color: string; landing: PowerCharge["landing"] | "potWin" | "potLost"; text?: string }
const NKAP = (value: number) => Math.round(value).toLocaleString("fr-FR");
/** Délai d'attente du pot réglé après le dernier pli (le nouveau montant peut arriver un peu après les mains vides). */
const POT_SETTLE_MS = 1600;

/** Index de la carte imposée : même calcul que le serveur (plus faible / plus forte carte légale). */
function forcedIndex(hand: Card[], ledSuit: string | null, force: "weakest" | "strongest"): number | null {
  const legal = legalCards(hand, ledSuit);
  if (legal.length === 0) return null;
  const sorted = [...legal].sort((a, b) => hand[a].value - hand[b].value);
  return (force === "strongest" ? sorted[sorted.length - 1] : sorted[0]) ?? null;
}

export const PowerChargeLayer = memo(function PowerChargeLayer({ charges, registry, getPlayers, getLedSuit, getPot, maxValue, motion, onConsumed }: {
  charges: PowerCharge[];
  registry: ZoneRegistry;
  getPlayers(): GameState["players"];
  getLedSuit?(): string | null;
  getPot?(): number;
  maxValue: number;
  motion: boolean;
  onConsumed(key: string): void;
}) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [veils, setVeils] = useState<Veil[]>([]);
  const [strikes, setStrikes] = useState<Strike[]>([]);
  const [spot, setSpot] = useState<Spot | null>(null);
  /* Début de chaque charge (projecteur de la carte imposée) ; carte déjà soulevée par le projecteur. */
  const startedRef = useRef(new Map<string, number>());
  const liftedRef = useRef(new Set<string>());
  const consumedRef = useRef(onConsumed);
  const getPlayersRef = useRef(getPlayers);
  const getLedSuitRef = useRef(getLedSuit);
  const getPotRef = useRef(getPot);
  /* Bonus de pot : montant du pot avant le dernier pli, et moment où les mains se sont vidées. */
  const potBeforeRef = useRef(new Map<string, number>());
  const potEndRef = useRef(new Map<string, number>());
  useEffect(() => { consumedRef.current = onConsumed; getPlayersRef.current = getPlayers; getLedSuitRef.current = getLedSuit; getPotRef.current = getPot; }, [onConsumed, getPlayers, getLedSuit, getPot]);

  useEffect(() => {
    if (charges.length === 0) return;
    let raf = 0;
    let last = "";
    let lastDim = 0;
    const done = new Set<string>();
    const started = startedRef.current;
    const lifted = liftedRef.current;
    const tick = () => {
      const players = getPlayersRef.current();
      const nextFrames: Frame[] = [];
      const nextBadges: Badge[] = [];
      const nextVeils: Veil[] = [];
      let nextSpot: Spot | null = null;
      for (const charge of charges) {
        if (done.has(charge.key)) continue;
        const color = TONE_COLORS[charge.tone ?? "teal"] ?? TONE_COLORS.teal;
        // Bonus de pot jusqu'à la fin de la manche : badge près du pot, montant visé ; au dernier pli, le pot dit l'issue.
        if (charge.pot) {
          const potRect = registry.pot()?.getRect();
          const potNow = getPotRef.current?.() ?? 0;
          const handsEmpty = players.length > 0 && players.every((player) => player.hand.length === 0);
          if (!handsEmpty) {
            potBeforeRef.current.set(charge.key, potNow);
            potEndRef.current.delete(charge.key);
            const target = charge.pot.amount ? potNow + charge.pot.amount : potNow * (charge.pot.factor ?? 1);
            const what = charge.pot.amount ? `+${NKAP(charge.pot.amount)}` : `×${charge.pot.factor}`;
            if (potRect) nextFrames.push({ key: charge.key, ui: charge.ui, x: potRect.left, y: potRect.top, w: potRect.width, h: potRect.height, kind: "pot", text: `⭐ ${what} pour ${charge.pot.owner} · ${NKAP(potNow)} → ${NKAP(target)}`, color, crackle: false });
            continue;
          }
          const before = potBeforeRef.current.get(charge.key) ?? potNow;
          const target = charge.pot.amount ? before + charge.pot.amount : before * (charge.pot.factor ?? 1);
          const endedAt = potEndRef.current.get(charge.key) ?? performance.now();
          potEndRef.current.set(charge.key, endedAt);
          const won = potNow >= target - 0.5;
          if (!won && performance.now() - endedAt < POT_SETTLE_MS) {
            if (potRect) nextFrames.push({ key: charge.key, ui: charge.ui, x: potRect.left, y: potRect.top, w: potRect.width, h: potRect.height, kind: "pot", text: `⭐ ${charge.pot.amount ? `+${NKAP(charge.pot.amount)}` : `×${charge.pot.factor}`} pour ${charge.pot.owner}`, color, crackle: false });
            continue;
          }
          done.add(charge.key);
          if (potRect && motion) {
            const strike: Strike = { key: charge.key, x: potRect.left, y: potRect.top, w: potRect.width, h: potRect.height, color, landing: won ? "potWin" : "potLost", text: won ? `${NKAP(before)} → ${NKAP(potNow)}` : "Bonus perdu" };
            setStrikes((current) => [...current, strike]);
            setTimeout(() => setStrikes((current) => current.filter((item) => item.key !== strike.key)), won ? 1800 : 1400);
          }
          consumedRef.current(charge.key);
          continue;
        }
        // Assurance : badge sous l'avatar jusqu'à la fin de la manche (le remboursement s'affiche au résultat).
        if (charge.insured) {
          if (players.length > 0 && players.every((player) => player.hand.length === 0)) {
            done.add(charge.key);
            consumedRef.current(charge.key);
            continue;
          }
          const rect = registry.timer(charge.ui)?.getRect();
          // Totem sous le badge Cauris s'ils sont tous les deux actifs sur ce joueur.
          const below = charge.key.endsWith("-totem") && charges.some((other) => other.insured && other.ui === charge.ui && !other.key.endsWith("-totem") && !done.has(other.key)) ? 22 : 0;
          if (rect) nextFrames.push({ key: charge.key, ui: charge.ui, x: rect.left, y: rect.top, w: rect.width, h: rect.height + below, kind: "avatar", text: charge.avatarTag, color, crackle: false });
          continue;
        }
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
          if ((charge.force || charge.lockedCardId) && charge.ui === 0) registry.hand(0)?.dimCards?.((players[0]?.hand ?? []).map((_, index) => index), 1);
          consumedRef.current(charge.key);
          continue;
        }
        if (charge.ui !== 0) {
          const rect = registry.timer(charge.ui)?.getRect();
          if (rect) nextFrames.push({ key: charge.key, ui: charge.ui, x: rect.left, y: rect.top, w: rect.width, h: rect.height, kind: "avatar", text: charge.avatarTag, color, crackle: !!charge.valueBonus || !!charge.suit });
          // Carte scellée chez un autre joueur : chaînes et cadenas restent sur sa carte de dos, tout le tour.
          if (charge.lockedIndex !== undefined) {
            const pose = registry.hand(charge.ui)?.poseOf?.(charge.lockedIndex);
            if (pose) nextVeils.push({ key: `${charge.key}-sealed`, x: pose.x, y: pose.y, w: pose.width, h: pose.width * 1.45, rotate: pose.rotate, color, sealed: true });
          }
          // Carte imposée chez un autre joueur : on ne sait pas laquelle (main de dos) ; sa main garde une lueur.
          if (charge.force) {
            const hand = registry.hand(charge.ui)?.getRect();
            if (hand) nextFrames.push({ key: `${charge.key}-glow`, ui: charge.ui, x: hand.left, y: hand.top, w: hand.width, h: hand.height, kind: "glow", text: "", color, crackle: false });
          }
          continue;
        }
        const rect = registry.hand(0)?.getRect();
        if (rect) nextFrames.push({ key: charge.key, ui: 0, x: rect.left, y: rect.top, w: rect.width, h: rect.height, kind: "hand", text: charge.handTag, color, crackle: !!charge.valueBonus || !!charge.suit });
        const hand = players[0]?.hand ?? [];
        // Carte scellée : elle seule s'éteint (les autres restent jouables), contour et « 🔒 Scellée ».
        if (charge.lockedCardId) {
          const locked = hand.findIndex((card) => card.id === charge.lockedCardId);
          if (locked >= 0) {
            if (performance.now() - lastDim > 600) {
              lastDim = performance.now();
              registry.hand(0)?.dimCards?.(hand.map((_, index) => index).filter((index) => index !== locked), 1200);
            }
            const box = cardBox(registry, locked);
            if (box) {
              nextVeils.push({ key: `${charge.key}-${charge.lockedCardId}`, x: box.x, y: box.y, w: box.width, h: box.height, rotate: box.rotate, color, sealed: true });
            }
          }
          continue;
        }
        const forced = charge.force ? forcedIndex(hand, getLedSuitRef.current?.() ?? null, charge.force) : null;
        // Carte imposée : la main éteint elle-même les autres cartes (l'empilement de l'éventail reste juste),
        // renouvelé tant que la contrainte dure.
        if (charge.force && forced != null && performance.now() - lastDim > 600) {
          lastDim = performance.now();
          registry.hand(0)?.dimCards?.([forced], 1200);
        }
        // Projecteur (version validée sur l'atelier) : au début, la table s'assombrit et un faisceau descend sur la carte
        // imposée, qui se lève et brille ; contour et « Imposée » arrivent à la fin du faisceau.
        const now = performance.now();
        if (!started.has(charge.key)) started.set(charge.key, now);
        const intro = charge.force && motion ? now - (started.get(charge.key) ?? now) : SPOT_MS;
        if (charge.force && forced != null && intro < SPOT_MS) {
          const box = cardBox(registry, forced);
          if (box) {
            if (!lifted.has(charge.key)) { lifted.add(charge.key); registry.hand(0)?.highlightCards({ cardIdx: forced, style: "recommend", durationMs: SPOT_MS }); }
            const out = 1 - seg(intro, 1100, SPOT_MS);
            nextSpot = { x: box.x, y: box.y, h: box.height, dark: sineInOut(seg(intro, 0, 450)) * out, beam: sineInOut(seg(intro, 200, 700)) * out, color };
          }
        }
        hand.forEach((card, index) => {
          const box = cardBox(registry, index);
          if (!box) return;
          const badgeAt = { x: box.x, y: box.y + box.height * 0.32, rotate: box.rotate };
          if (charge.force) {
            if (index !== forced || intro < 800) return;
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
        nextVeils.map((v) => [v.key, round(v.x), round(v.y), round(v.rotate), round(v.w)]),
        nextSpot ? [round(nextSpot.x), round(nextSpot.y), nextSpot.dark.toFixed(2), nextSpot.beam.toFixed(2)] : null,
      ]);
      if (key !== last) { last = key; setFrames(nextFrames); setBadges(nextBadges); setVeils(nextVeils); setSpot(nextSpot); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [charges, registry, maxValue, motion]);

  if ((charges.length === 0 || frames.length === 0) && strikes.length === 0) return null;
  const live = charges.length > 0;
  return (
    <div className={`${styles.root} ${motion ? "" : styles.still}`} aria-hidden="true" data-power-charge>
      {live && spot && <>
        <div className={styles.spotDark} style={{ opacity: spot.dark, background: `radial-gradient(circle at ${spot.x}px ${spot.y}px, transparent ${spot.h * 0.7}px, rgba(0, 0, 0, .62) ${spot.h * 2.4}px)` }} />
        <div className={styles.spotBeam} style={{ left: spot.x - spot.h * 0.65, width: spot.h * 1.3, height: spot.y + spot.h * 0.45, opacity: spot.beam, "--charge-color": spot.color } as CSSProperties} />
      </>}
      {live && veils.map((veil) => (
        <span key={veil.key} className={veil.sealed ? styles.sealed : styles.forced}
          style={{ left: veil.x, top: veil.y, width: veil.w, height: veil.h, transform: `translate(-50%, -50%) rotate(${veil.rotate}deg)`, "--charge-color": veil.color } as CSSProperties}>
          {veil.sealed && <SealedArt width={veil.w} height={veil.h} />}
        </span>
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
      ) : frame.kind === "glow" ? (
        <div key={frame.key} className={styles.handGlow} style={{ left: frame.x - 8, top: frame.y - 8, width: frame.w + 16, height: frame.h + 16, "--charge-color": frame.color } as CSSProperties} />
      ) : frame.kind === "pot" ? (
        <span key={frame.key} className={styles.potTag} style={{ left: `clamp(110px, ${frame.x + frame.w / 2}px, calc(100vw - 110px))`, top: frame.y + frame.h, "--charge-color": frame.color } as CSSProperties}>{frame.text}</span>
      ) : (
        <span key={frame.key} className={styles.avatarTag} style={{ left: `clamp(80px, ${frame.x + frame.w / 2}px, calc(100vw - 80px))`, top: frame.y + frame.h, "--charge-color": frame.color } as CSSProperties}>{frame.text}</span>
      ))}
      {live && badges.map((badge) => (
        <span key={badge.key} className={styles.value} style={{ left: badge.x, top: badge.y, transform: `translate(-50%, -50%) rotate(${badge.rotate}deg)` }}>{badge.text}</span>
      ))}
      {strikes.map((strike) => strike.landing === "potWin" || strike.landing === "potLost" ? (
        <div key={strike.key} className={`${styles.potEnd} ${strike.landing === "potWin" ? styles.potWin : styles.potLost}`} style={{ left: strike.x, top: strike.y, width: strike.w, height: strike.h, "--charge-color": strike.color } as CSSProperties}>
          {strike.landing === "potWin" && <span className={styles.potBurst} />}
          <span className={styles.potText}>{strike.text}</span>
        </div>
      ) : (
        <div key={strike.key} className={`${styles.strike} ${strike.landing === "dye" ? styles.dye : ""}`} style={{ left: strike.x, top: strike.y, width: strike.w, height: strike.h, "--charge-color": strike.color } as CSSProperties}>
          {strike.landing === "bolt" && <svg className={styles.bolt} viewBox="0 0 40 200" preserveAspectRatio="none"><path d="M24 0 L10 86 L22 90 L8 200 L34 72 L22 68 L32 0 Z" /></svg>}
          <span className={styles.flash} />
        </div>
      ))}
    </div>
  );
});

/** Carte scellée au repos : chaînes tendues vers les coins et cadenas fermé (dessin du Sceau d'Entrave). */
function SealedArt({ width, height }: { width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.round(width), h = Math.round(height);
  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    const dpr = window.devicePixelRatio || 1;
    const pad = 12;
    canvas.width = Math.round((w + pad * 2) * dpr);
    canvas.height = Math.round((h + pad * 2) * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w + pad * 2, h + pad * 2);
    g.translate(w / 2 + pad, h / 2 + pad);
    drawSealedRest(g, w, h);
  }, [w, h]);
  return <canvas ref={ref} className={styles.sealedArt} style={{ width: w + 24, height: h + 24 }} />;
}

/** Carte telle qu'affichée dans ma main (soulevée, inclinée). */
function cardBox(registry: ZoneRegistry, index: number): { x: number; y: number; width: number; height: number; rotate: number } | null {
  const face = registry.hand(0)?.getElement?.()?.children[index]?.firstElementChild as HTMLElement | null | undefined;
  if (!face || face.offsetWidth === 0) return null;
  const box = face.getBoundingClientRect();
  const transform = getComputedStyle(face).transform;
  const matrix = new DOMMatrix(transform === "none" ? undefined : transform);
  return { x: box.left + box.width / 2, y: box.top + box.height / 2, width: face.offsetWidth, height: face.offsetHeight, rotate: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI };
}

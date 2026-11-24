"use client";

/* Table de démonstration (admin) : reproduit les zones de la vraie table
   (mains, dépôts, avatars/minuteurs, pioche, pot) dans un cadre téléphone,
   les enregistre dans son propre registre de zones, et joue la chorégraphie
   avec EXACTEMENT le même lecteur que le jeu (playChoreography), ou un
   modèle de l'atelier seul (playMotif). */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties } from "react";
import { PlayCard } from "@/components/cards/PlayCard";
import { ZoneRegistry, ZoneRegistryProvider, useRegisterZone, type ZoneKey } from "@/components/table/zones/ZoneRegistry";
import { elementCenter, elementScale } from "@/components/table/zones/zonePose";
import { fanPose, pilePose, stackPose } from "@/engine/anim/v2/pose";
import { sameAnchor, type AnimMotif } from "@/engine/anim/motif";
import { fillCardPlaceholders, swapDelta, type ChoreoViewer, type Choreography } from "@/engine/power/choreography";
import type { AnimCue, PlayerRef, PowerFxTone } from "@/engine/power/types";
import type { Card } from "@/types/game";
import { ChoreoLayer, type ChoreoLayerHandle } from "./ChoreoLayer";
import { moveSourceUi, playChoreography, type ChoreoCards, type ChoreoContext } from "./playChoreography";
import { playMotif } from "./playMotif";
import { playAnimV2, type AnimV2Move } from "./playAnimV2";
import type { AnimV2 } from "@/engine/anim/v2/model";
import type { PoseZone } from "@/components/table/zones/zonePose";
import { playPowerSound } from "@/lib/powerSounds";

const card = (id: string, rank: string, value: number, suit: string): Card => ({ id, rank, value, suit, color: suit === "♥" || suit === "♦" ? "#c0392b" : "#1e1e1e" });
const MY_HAND = [card("h1", "3", 3, "♣"), card("h2", "9", 9, "♥"), card("h3", "K", 13, "♠"), card("h4", "5", 5, "♦"), card("h5", "Q", 12, "♥")];
const STOLEN = card("demo_out", "A", 14, "♠");
const GIVEN = card("demo_in", "4", 4, "♣");
const RANK_VALUES: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11 };
/** « 7♦ » → carte de démonstration (aperçu des modèles). */
const demoCard = (label: string, index: number): Card => {
  const suit = label.replace("*", "").slice(-1), rank = label.replace("*", "").slice(0, -1);
  return card(`motif_${index}_${label}`, rank, RANK_VALUES[rank] ?? (Number(rank) || 0), suit);
};
const PREVIEW_POOL = ["A♠", "7♦", "Q♣", "5♥", "10♠", "2♦"];

/** Trajets d'essai des modèles V2 : un même modèle les joue tous. */
export const DEMO_V2_ROUTES = {
  draw: "Piocher",
  play: "Jouer",
  take: "Récupérer",
  opponent: "Jouer · adversaire",
} as const;
export type DemoV2Route = keyof typeof DEMO_V2_ROUTES;

type FlyCardsCue = Extract<AnimCue, { cue: "flyCards" }>;
const DEMO_UI: Record<PlayerRef, number> = { self: 0, target: 1, each_target: 1, all_opponents: 1, all: 0 };

/** Mouvements V2 d'un cue « flyCards » sur la table de démonstration (bac à sable d'une carte animée en V2).
 *  `pending` : nombre de cartes de chaque main après les cues déjà joués (les mains de démonstration ne changent pas). */
export function demoV2MovesForCue(cue: FlyCardsCue, cards: Card[], pending: Map<number, number>): AnimV2Move[] {
  const uiOf = (zone: FlyCardsCue["from"]) => ("player" in zone && zone.player ? DEMO_UI[zone.player as PlayerRef] : 0);
  const fromUi = uiOf(cue.from), toUi = uiOf(cue.to);
  const count = (ui: number) => pending.get(ui) ?? MY_HAND.length;
  const list = cards.length ? cards : [null];
  if (cue.from.zone === "hand") pending.set(fromUi, count(fromUi) - list.length);
  const base = cue.to.zone === "hand" ? count(toUi) : 0;
  if (cue.to.zone === "hand") pending.set(toUi, count(toUi) + list.length);
  return list.map((item, k) => ({
    card: item,
    from: { zone: cue.from.zone as PoseZone, ui: fromUi, index: cue.from.zone === "hand" ? Math.min(MY_HAND.length - 1, 1 + k) : 0 },
    to: { zone: cue.to.zone as PoseZone, ui: toUi, index: cue.to.zone === "hand" ? base + k : 0, ...(cue.to.zone === "hand" ? { count: count(toUi) } : {}) },
  }));
}

function demoV2Move(route: DemoV2Route): AnimV2Move {
  const arrival = { zone: "hand" as const, ui: 0, index: MY_HAND.length, count: MY_HAND.length + 1 };
  switch (route) {
    case "draw": return { card: card("v2_draw", "7", 7, "♦"), from: { zone: "deck", index: 0 }, to: arrival };
    case "play": return { card: MY_HAND[2], from: { zone: "hand", ui: 0, index: 2 }, to: { zone: "deposit", ui: 0, index: 0 } };
    case "take": return { card: card("v2_take", "10", 10, "♠"), from: { zone: "deposit", ui: 0, index: 0 }, to: arrival };
    case "opponent": return { card: card("v2_opp", "8", 8, "♥"), from: { zone: "hand", ui: 1, index: 2 }, to: { zone: "deposit", ui: 1, index: 0 } };
  }
}

const SEATS = [
  { ui: 0, name: "Toi", emoji: "🎴", style: { left: "50%", bottom: "3%", transform: "translateX(-50%)" } },
  { ui: 1, name: "La cible", emoji: "🥁", style: { left: "50%", top: "3%", transform: "translateX(-50%)" } },
  { ui: 2, name: "Joueur 3", emoji: "🎺", style: { left: "3%", top: "38%" } },
  { ui: 3, name: "Joueur 4", emoji: "🐘", style: { right: "3%", top: "38%" } },
] as const;
const RESOLVE_REF: Record<PlayerRef, number[]> = { self: [0], target: [1], each_target: [1], all_opponents: [1, 2, 3], all: [0, 1, 2, 3] };

function DemoTimer({ ui, emoji, name }: { ui: number; emoji: string; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [frozen, setFrozen] = useState(false);
  const [delta, setDelta] = useState<{ key: number; seconds: number } | null>(null);
  const [aura, setAura] = useState<string | null>(null);
  const [rich, setRich] = useState(false);
  useRegisterZone(`timer:${ui}` as ZoneKey, {
    getRect: () => ref.current?.getBoundingClientRect() ?? null,
    getElement: () => ref.current,
    showFreeze: (ms: number) => { setFrozen(true); setTimeout(() => setFrozen(false), ms); },
    showDelta: (seconds: number) => { setDelta({ key: Date.now(), seconds }); setTimeout(() => setDelta(null), 1200); },
    showAura: (style) => setAura(style),
    pulseBalance: (ms: number) => { setRich(true); setTimeout(() => setRich(false), ms); },
  });
  return (
    <div ref={ref} style={{ position: "relative", display: "grid", placeItems: "center", width: 44, height: 44, borderRadius: "50%", background: "#132a22", border: `3px solid ${frozen ? "#9fe2ff" : "#f2bb45"}`, boxShadow: frozen ? "0 0 14px #9fe2ff" : "none", fontSize: 22 }} title={name}>
      {emoji}
      {aura && <span style={{ position: "absolute", top: -8, right: -8, fontSize: 14 }}>{({ shield: "🛡️", mask: "🎭", totem: "🗿", lucky: "🍀" } as Record<string, string>)[aura]}</span>}
      {delta && <span key={delta.key} style={{ position: "absolute", top: -18, fontWeight: 900, fontSize: 13, color: delta.seconds >= 0 ? "#5fe3a1" : "#ff5b82" }}>{delta.seconds >= 0 ? `+${delta.seconds}` : delta.seconds}s</span>}
      {rich && <span style={{ position: "absolute", bottom: -16, fontWeight: 900, fontSize: 11, color: "#ffe08a", textShadow: "0 0 8px #f2bb45", whiteSpace: "nowrap" }}>+ Nkap</span>}
    </div>
  );
}

const NONE: Set<number> = new Set();

function DemoHand({ ui, faceUp, hidden, round }: { ui: number; faceUp: boolean; hidden: Set<number>; round: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [hiddenIdx, setHiddenIdx] = useState<number[]>([]);
  const [collapsed, setCollapsed] = useState<{ idx: Set<number>; ms: number }>(() => ({ idx: new Set(), ms: 0 }));
  const [room, setRoom] = useState<{ count: number; ms: number }>({ count: 0, ms: 0 });
  const [dimKeep, setDimKeep] = useState<Set<number> | null>(null);
  const [tempHidden, setTempHidden] = useState<Set<number>>(() => new Set());
  useEffect(() => setHiddenIdx([...hidden]), [hidden]);
  const width = ui === 0 ? 40 : 22;
  const overlap = width * 0.35;
  const center = (MY_HAND.length - 1) / 2;
  useRegisterZone(`hand:${ui}` as ZoneKey, {
    getRect: () => ref.current?.getBoundingClientRect() ?? null,
    getElement: () => ref.current,
    getCardRect: (index: number) => cardRefs.current[index]?.getBoundingClientRect() ?? ref.current?.getBoundingClientRect() ?? null,
    highlightCards: () => undefined,
    setHiddenCard: (index) => setHiddenIdx(index === null ? [] : [index]),
    setHiddenCards: (indexes) => setHiddenIdx(indexes),
    beginSelection: () => () => undefined,
    cardCount: () => MY_HAND.length,
    getCardSlot: (index: number) => {
      const el = cardRefs.current[index];
      if (!el) return null;
      const box = el.getBoundingClientRect();
      const total = MY_HAND.length + room.count;
      return { x: box.left + box.width / 2, y: box.top + box.height / 2, width, rotate: (index - (total - 1) / 2) * 6 };
    },
    collapseCards: (indexes, ms) => setCollapsed((current) => ({ idx: new Set([...current.idx, ...indexes]), ms })),
    makeRoom: (count, ms) => setRoom({ count, ms }),
    dimCards: (keep, ms) => { setDimKeep(new Set(keep)); setTimeout(() => setDimKeep(null), ms); },
    hideCardsFor: (indexes, ms) => {
      setTempHidden((current) => new Set([...current, ...indexes]));
      setTimeout(() => setTempHidden((current) => new Set([...current].filter((index) => !indexes.includes(index)))), ms);
    },
    poseOf: (index: number, count?: number) => {
      const el = ref.current;
      if (!el) return null;
      const scale = elementScale(el);
      return fanPose({ center: elementCenter(el), axis: 0, cardWidth: width * scale, step: (width - overlap) * scale, rotStep: 6, face: faceUp ? 0 : 180 }, index, count ?? MY_HAND.length);
    },
  });
  // Fin d'une démonstration : la main reprend sa forme.
  useEffect(() => {
    setCollapsed({ idx: new Set(), ms: 0 });
    setRoom({ count: 0, ms: 0 });
    setDimKeep(null);
    setTempHidden(new Set());
  }, [round]);
  const slots = [...MY_HAND.map((item) => ({ item, spacer: false })), ...Array.from({ length: room.count }, () => ({ item: null, spacer: true }))];
  // Largeur fixe (main de départ) : l'éventail centré déborde autant des deux côtés, son centre ne bouge pas (poses V2).
  return (
    <div ref={ref} style={{ display: "flex", justifyContent: "center", width: width + (MY_HAND.length - 1) * (width - overlap) }}>
      {slots.map(({ item, spacer }, index) => {
        const isCollapsed = collapsed.idx.has(index);
        const style: CSSProperties = {
          marginLeft: isCollapsed ? (index === 0 ? -overlap : -width) : index ? -overlap : 0,
          transition: `margin-left ${isCollapsed ? collapsed.ms : 180}ms cubic-bezier(.22,1,.36,1)`,
          transform: `rotate(${(index - (spacer ? (slots.length - 1) / 2 : center)) * 6}deg)`,
          opacity: spacer || hiddenIdx.includes(index) || tempHidden.has(index) ? 0 : 1,
          filter: dimKeep && !dimKeep.has(index) ? "brightness(.45) saturate(.5)" : undefined,
        };
        return (
          <div
            key={item?.id ?? `room_${index}`}
            ref={(el) => {
              cardRefs.current[index] = el;
              if (spacer && el && !el.dataset.grown) {
                el.dataset.grown = "1";
                el.animate([{ marginLeft: `${-width}px` }, { marginLeft: `${-overlap}px` }], { duration: room.ms, easing: "cubic-bezier(.22,1,.36,1)" });
              }
            }}
            style={style}
          >
            <PlayCard card={faceUp && item ? item : undefined} hidden={!faceUp || !item} w={width} />
          </div>
        );
      })}
    </div>
  );
}

function DemoDeposit({ ui }: { ui: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useRegisterZone(`deposit:${ui}` as ZoneKey, {
    getRect: () => ref.current?.getBoundingClientRect() ?? null,
    getElement: () => ref.current,
    getTopCardRect: () => ref.current?.getBoundingClientRect() ?? null,
    getCardRect: () => ref.current?.getBoundingClientRect() ?? null,
    beginSelection: () => () => undefined,
    poseOf: (index: number) => {
      const el = ref.current;
      if (!el) return null;
      const scale = elementScale(el);
      return pilePose({ center: elementCenter(el), cardWidth: 30 * scale, scale }, index);
    },
  });
  return <div ref={ref} style={{ width: 30, height: 42, borderRadius: 6, border: "1.5px dashed rgba(242,187,69,.55)", background: "rgba(0,0,0,.2)" }} />;
}

function DemoCenter() {
  const deckRef = useRef<HTMLDivElement>(null);
  const potRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState<string | null>(null);
  useRegisterZone("deck", {
    getRect: () => deckRef.current?.getBoundingClientRect() ?? null,
    getElement: () => deckRef.current,
    pulse: () => undefined,
    poseOf: (index: number, count?: number) => {
      const el = deckRef.current;
      if (!el) return null;
      return stackPose({ center: elementCenter(el), rotate: 0, cardWidth: 40 * elementScale(el), depth: { x: 0, y: 0 }, layers: 1 }, index, count ?? index + 1);
    },
  });
  useRegisterZone("pot", {
    getRect: () => potRef.current?.getBoundingClientRect() ?? null,
    getElement: () => potRef.current,
    flash: (text?: string) => { setLabel(text ?? "✦"); setTimeout(() => setLabel(null), 1100); },
  });
  return (
    <div style={{ position: "absolute", left: "50%", top: "46%", transform: "translate(-50%, -50%)", display: "flex", gap: 22, alignItems: "center" }}>
      <div ref={deckRef}><PlayCard hidden w={40} /></div>
      <div ref={potRef} style={{ position: "relative", padding: "6px 10px", borderRadius: 999, background: "#2a1a08", border: "1.5px solid #f2bb45", color: "#ffe58a", fontWeight: 900, fontSize: 12 }}>
        Pot 600
        {label && <span style={{ position: "absolute", top: -18, left: "50%", transform: "translateX(-50%)", color: "#fff", textShadow: "0 0 8px #f2bb45" }}>{label}</span>}
      </div>
    </div>
  );
}

export interface ChoreoDemoHandle {
  /** Rejoue la chorégraphie (ou celle passée en paramètre). `cards` remplace
   *  les cartes de démonstration par les cartes calculées (bac à sable). */
  play(override?: Choreography | null, cards?: Partial<Record<string, Card[]>>, viewer?: ChoreoViewer, animV2?: string): Promise<void>;
  /** Joue un modèle de l'atelier seul (même brouillon non publié), puis remet la table en place. */
  playMotif(motif: AnimMotif): Promise<void>;
  /** Joue un modèle V2 sur un trajet d'essai, puis remet la table en place. */
  playAnimV2(model: AnimV2, route: DemoV2Route): Promise<void>;
  /** Joue des mouvements V2 précis (sans remettre la table en place entre deux appels : `reset` à la fin). */
  playAnimV2Moves(model: AnimV2, moves: AnimV2Move[], reset?: boolean): Promise<void>;
}

export const ChoreoDemoStage = forwardRef<ChoreoDemoHandle, { choreo: Choreography | null; tone?: PowerFxTone; width?: number }>(function ChoreoDemoStage({ choreo, tone = "gold", width = 340 }, ref) {
  const registry = useMemo(() => new ZoneRegistry(), []);
  const stageRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<ChoreoLayerHandle | null>(null);
  const [hidden, setHidden] = useState<Record<number, Set<number>>>({});
  const [round, setRound] = useState(0);
  const busy = useRef(false);

  const hide = useCallback((ui: number, indexes: number[]) => {
    setHidden((current) => ({ ...current, [ui]: new Set([...(current[ui] ?? []), ...indexes]) }));
  }, []);

  const contextFor = useCallback((layer: ChoreoLayerHandle, cardsOf: ChoreoContext["cardsOf"], viewer: ChoreoViewer = "activator"): ChoreoContext => {
    const ctx: ChoreoContext = {
      registry,
      layer,
      resolveRefUi: (playerRef) => RESOLVE_REF[playerRef],
      winnerUi: () => 1,
      cardsOf,
      // Hors lanceur, `cardsOf` ne donne que les cartes que ce joueur connaît (voir `play`) : les autres restent de dos.
      visibleCard: (_id, index, cards) => cards.snapshots[index] ?? null,
      viewer,
      handCardRect: (ui, index) => registry.hand(ui)?.getCardRect(index) ?? null,
      burst: (_preset, rect, burstTone) => {
        const host = layerRef.current?.container();
        if (!host || !rect) return;
        const ring = document.createElement("div");
        ring.setAttribute("data-choreo-fx", "burst");
        const size = Math.max(rect.width, rect.height, 30) * 1.4;
        Object.assign(ring.style, { position: "absolute", left: `${rect.left + rect.width / 2 - size / 2}px`, top: `${rect.top + rect.height / 2 - size / 2}px`, width: `${size}px`, height: `${size}px`, borderRadius: "50%", border: `3px solid ${({ gold: "#f2bb45", teal: "#1de4be", pink: "#ff5b82", cobalt: "#6fa8ff" })[burstTone]}` });
        host.appendChild(ring);
        void ring.animate([{ opacity: 0.9, transform: "scale(.4)" }, { opacity: 0, transform: "scale(1.3)" }], { duration: 650 }).finished.then(() => ring.remove(), () => ring.remove());
      },
      playSound: (sound, volume) => playPowerSound(sound, volume),
      impactShake: () => { void stageRef.current?.animate([0, -6, 6, -4, 4, 0].map((x) => ({ transform: `translateX(${x}px)` })), { duration: 380 }); },
      defaultTone: tone,
      viewport: () => stageRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight),
      motionEnabled: true,
      lite: false,
      onMoveStart: (track, cards) => {
        const ui = moveSourceUi(ctx, track);
        if (ui != null) hide(ui, cards.fromIndexes);
      },
    };
    return ctx;
  }, [hide, registry, tone]);

  const play = useCallback(async (override?: Choreography | null, cards?: Partial<Record<string, Card[]>>, viewer: ChoreoViewer = "activator", animV2?: string) => {
    const current = override ?? choreo;
    if (!current || busy.current || !layerRef.current) return;
    busy.current = true;
    const allCardsOf = (key: "resolved:outgoing" | "resolved:incoming" | "resolved:highlight"): ChoreoCards => cards?.[key]?.length
      ? { ids: cards[key]!.map((item) => item.id), snapshots: cards[key]!, fromIndexes: cards[key]!.map((_, index) => index + 1), toIndexes: cards[key]!.map((_, index) => index + 1) }
      : key === "resolved:outgoing"
      ? { ids: [STOLEN.id], snapshots: [STOLEN], fromIndexes: [2], toIndexes: [2] }
      : key === "resolved:incoming" ? { ids: [GIVEN.id], snapshots: [GIVEN], fromIndexes: [1], toIndexes: [1] }
        : { ids: [MY_HAND[1].id], snapshots: [MY_HAND[1]], fromIndexes: [1], toIndexes: [1] };
    // Ce que ce joueur connaît : tout pour le lanceur ; pour la cible d'un échange, ses propres cartes
    // (celles qui arrivent chez le lanceur) ; rien pour les autres.
    const cardsOf = (key: "resolved:outgoing" | "resolved:incoming" | "resolved:highlight"): ChoreoCards => {
      const all = allCardsOf(key);
      return viewer === "activator" || (viewer === "target" && key === "resolved:incoming") ? all : { ...all, snapshots: [] };
    };
    try {
      const ctx = contextFor(layerRef.current, cardsOf, viewer);
      const outgoing = viewer === "activator" ? allCardsOf("resolved:outgoing").snapshots : null;
      const incoming = viewer === "activator" ? allCardsOf("resolved:incoming").snapshots : null;
      const count = allCardsOf("resolved:outgoing").ids.length;
      ctx.verdict = swapDelta(outgoing, incoming);
      ctx.animV2 = animV2;
      await playChoreography(ctx, current, (text) => fillCardPlaceholders(text.replace("{activator}", viewer === "activator" ? "Toi" : "Le lanceur").replace("{target}", viewer === "target" ? "Toi" : "La cible"), outgoing, incoming, count));
    } finally {
      setTimeout(() => { setHidden({}); setRound((value) => value + 1); }, 400);
      busy.current = false;
    }
  }, [choreo, contextFor]);

  const playMotifAlone = useCallback(async (motif: AnimMotif) => {
    if (busy.current || !layerRef.current) return;
    busy.current = true;
    const layer = layerRef.current;
    // Cartes de l'aperçu : prises dans la main de démonstration, ou celles du modèle.
    const fromHand = motif.from.zone === "hand";
    const handUi = "player" in motif.from ? (motif.from.player === "winner" ? 1 : RESOLVE_REF[motif.from.player][0]) : 0;
    // « Chacun » (d'un côté ou de l'autre : distribution, ramassage du pli) : une série par joueur.
    const players = (anchor: AnimMotif["from"]) => ("player" in anchor ? (anchor.player === "all" ? 4 : anchor.player === "all_opponents" ? 3 : 1) : 1);
    const perSide = motif.count * Math.max(players(motif.from), players(motif.to));
    const count = Math.min(perSide, fromHand ? MY_HAND.length : 12);
    const pick = Math.max(0, Math.min(MY_HAND.length - count, motif.preview?.pick ?? MY_HAND.length - count));
    const labels = motif.preview?.cards ?? PREVIEW_POOL;
    const snapshots = fromHand
      ? MY_HAND.slice(pick, pick + count)
      : Array.from({ length: count }, (_, index) => demoCard(labels[index % labels.length], index));
    const fromIndexes = fromHand ? snapshots.map((_, index) => pick + index) : [];
    const cards: ChoreoCards = { ids: snapshots.map((item) => item.id), snapshots, fromIndexes, toIndexes: [] };
    const ctx = contextFor(layer, () => cards);
    const inPlace = sameAnchor(motif.from, motif.to);
    try {
      if (fromHand && !inPlace) hide(handUi, fromIndexes);
      await playMotif(ctx, { id: `apercu_${motif.id}`, motif, cards, mode: "move" });
      await new Promise((resolve) => setTimeout(resolve, 700));
    } finally {
      layer.clear();
      setHidden({});
      setRound((value) => value + 1);
      busy.current = false;
    }
  }, [contextFor, hide]);

  const playV2 = useCallback(async (model: AnimV2, route: DemoV2Route) => {
    if (busy.current || !layerRef.current) return;
    busy.current = true;
    const layer = layerRef.current;
    const ctx = contextFor(layer, () => ({ ids: [], snapshots: [], fromIndexes: [], toIndexes: [] }));
    try {
      await playAnimV2(ctx, { id: `apercu_${model.id}_${route}`, model, moves: [demoV2Move(route)] });
      await new Promise((resolve) => setTimeout(resolve, 700));
    } finally {
      layer.clear();
      setHidden({});
      setRound((value) => value + 1);
      busy.current = false;
    }
  }, [contextFor]);

  const playV2Moves = useCallback(async (model: AnimV2, moves: AnimV2Move[], reset = true) => {
    if (busy.current || !layerRef.current) return;
    busy.current = true;
    const layer = layerRef.current;
    const ctx = contextFor(layer, () => ({ ids: [], snapshots: [], fromIndexes: [], toIndexes: [] }));
    try {
      await playAnimV2(ctx, { id: `apercu_${model.id}_moves`, model, moves });
      if (reset) await new Promise((resolve) => setTimeout(resolve, 700));
    } finally {
      if (reset) {
        layer.clear();
        setHidden({});
        setRound((value) => value + 1);
      }
      busy.current = false;
    }
  }, [contextFor]);

  useImperativeHandle(ref, () => ({ play, playMotif: playMotifAlone, playAnimV2: playV2, playAnimV2Moves: playV2Moves }), [play, playMotifAlone, playV2, playV2Moves]);

  const felt: CSSProperties = { position: "relative", width, height: width * 1.75, borderRadius: 26, overflow: "hidden", background: "radial-gradient(ellipse at 50% 46%, #1f6b4f, #0c2a20 70%)", border: "8px solid #000", boxShadow: "0 20px 50px #0008" };
  return (
    <ZoneRegistryProvider registry={registry}>
      <div ref={stageRef} style={felt}>
        {SEATS.map((seat) => (
          <div key={seat.ui} style={{ position: "absolute", display: "grid", justifyItems: "center", gap: 6, ...seat.style }}>
            {seat.ui === 0 && <DemoDeposit ui={0} />}
            {seat.ui === 0 ? <DemoHand ui={0} faceUp hidden={hidden[0] ?? NONE} round={round} /> : <DemoTimer ui={seat.ui} emoji={seat.emoji} name={seat.name} />}
            {seat.ui === 0 ? <DemoTimer ui={0} emoji={seat.emoji} name={seat.name} /> : <DemoHand ui={seat.ui} faceUp={false} hidden={hidden[seat.ui] ?? NONE} round={round} />}
            {seat.ui !== 0 && <DemoDeposit ui={seat.ui} />}
          </div>
        ))}
        <DemoCenter />
      </div>
      <ChoreoLayer ref={layerRef} zIndex={90} />
    </ZoneRegistryProvider>
  );
});

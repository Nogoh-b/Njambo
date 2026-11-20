"use client";

/* Table de démonstration (admin) : reproduit les zones de la vraie table
   (mains, dépôts, avatars/minuteurs, pioche, pot) dans un cadre téléphone,
   les enregistre dans son propre registre de zones, et joue la chorégraphie
   avec EXACTEMENT le même lecteur que le jeu (playChoreography). */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties } from "react";
import { PlayCard } from "@/components/cards/PlayCard";
import { ZoneRegistry, ZoneRegistryProvider, useRegisterZone, type ZoneKey } from "@/components/table/zones/ZoneRegistry";
import type { Choreography } from "@/engine/power/choreography";
import type { PlayerRef, PowerFxTone } from "@/engine/power/types";
import type { Card } from "@/types/game";
import { ChoreoLayer, type ChoreoLayerHandle } from "./ChoreoLayer";
import { playChoreography, type ChoreoCards } from "./playChoreography";
import { playPowerSound } from "@/lib/powerSounds";

const card = (id: string, rank: string, value: number, suit: string): Card => ({ id, rank, value, suit, color: suit === "♥" || suit === "♦" ? "#c0392b" : "#1e1e1e" });
const MY_HAND = [card("h1", "3", 3, "♣"), card("h2", "9", 9, "♥"), card("h3", "K", 13, "♠"), card("h4", "5", 5, "♦"), card("h5", "Q", 12, "♥")];
const STOLEN = card("demo_out", "A", 14, "♠");
const GIVEN = card("demo_in", "4", 4, "♣");

const SEATS = [
  { ui: 0, name: "Toi", emoji: "🎴", style: { left: "50%", bottom: "3%", transform: "translateX(-50%)" } },
  { ui: 1, name: "La cible", emoji: "🥁", style: { left: "50%", top: "3%", transform: "translateX(-50%)" } },
  { ui: 2, name: "Joueur 3", emoji: "🎺", style: { left: "3%", top: "38%" } },
  { ui: 3, name: "Joueur 4", emoji: "🐘", style: { right: "3%", top: "38%" } },
] as const;

function DemoTimer({ ui, emoji, name }: { ui: number; emoji: string; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [frozen, setFrozen] = useState(false);
  const [delta, setDelta] = useState<{ key: number; seconds: number } | null>(null);
  const [aura, setAura] = useState<string | null>(null);
  useRegisterZone(`timer:${ui}` as ZoneKey, {
    getRect: () => ref.current?.getBoundingClientRect() ?? null,
    getElement: () => ref.current,
    showFreeze: (ms: number) => { setFrozen(true); setTimeout(() => setFrozen(false), ms); },
    showDelta: (seconds: number) => { setDelta({ key: Date.now(), seconds }); setTimeout(() => setDelta(null), 1200); },
    showAura: (style) => setAura(style),
  });
  return (
    <div ref={ref} style={{ position: "relative", display: "grid", placeItems: "center", width: 44, height: 44, borderRadius: "50%", background: "#132a22", border: `3px solid ${frozen ? "#9fe2ff" : "#f2bb45"}`, boxShadow: frozen ? "0 0 14px #9fe2ff" : "none", fontSize: 22 }} title={name}>
      {emoji}
      {aura && <span style={{ position: "absolute", top: -8, right: -8, fontSize: 14 }}>{({ shield: "🛡️", mask: "🎭", totem: "🗿", lucky: "🍀" } as Record<string, string>)[aura]}</span>}
      {delta && <span key={delta.key} style={{ position: "absolute", top: -18, fontWeight: 900, fontSize: 13, color: delta.seconds >= 0 ? "#5fe3a1" : "#ff5b82" }}>{delta.seconds >= 0 ? `+${delta.seconds}` : delta.seconds}s</span>}
    </div>
  );
}

function DemoHand({ ui, faceUp, hidden }: { ui: number; faceUp: boolean; hidden: Set<number> }) {
  const ref = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [hiddenIdx, setHiddenIdx] = useState<number[]>([]);
  useEffect(() => setHiddenIdx([...hidden]), [hidden]);
  const width = ui === 0 ? 40 : 22;
  useRegisterZone(`hand:${ui}` as ZoneKey, {
    getRect: () => ref.current?.getBoundingClientRect() ?? null,
    getElement: () => ref.current,
    getCardRect: (index: number) => cardRefs.current[index]?.getBoundingClientRect() ?? ref.current?.getBoundingClientRect() ?? null,
    highlightCards: () => undefined,
    setHiddenCard: (index) => setHiddenIdx(index === null ? [] : [index]),
    setHiddenCards: (indexes) => setHiddenIdx(indexes),
    beginSelection: () => () => undefined,
  });
  return (
    <div ref={ref} style={{ display: "flex", justifyContent: "center" }}>
      {MY_HAND.map((item, index) => (
        <div key={item.id} ref={(el) => { cardRefs.current[index] = el; }} style={{ marginLeft: index ? -width * 0.35 : 0, transform: `rotate(${(index - 2) * 6}deg)`, opacity: hiddenIdx.includes(index) ? 0 : 1 }}>
          <PlayCard card={faceUp ? item : undefined} hidden={!faceUp} w={width} />
        </div>
      ))}
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
  });
  return <div ref={ref} style={{ width: 30, height: 42, borderRadius: 6, border: "1.5px dashed rgba(242,187,69,.55)", background: "rgba(0,0,0,.2)" }} />;
}

function DemoCenter() {
  const deckRef = useRef<HTMLDivElement>(null);
  const potRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState<string | null>(null);
  useRegisterZone("deck", { getRect: () => deckRef.current?.getBoundingClientRect() ?? null, getElement: () => deckRef.current, pulse: () => undefined });
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

export interface ChoreoDemoHandle { play(): Promise<void> }

export const ChoreoDemoStage = forwardRef<ChoreoDemoHandle, { choreo: Choreography | null; tone?: PowerFxTone; width?: number }>(function ChoreoDemoStage({ choreo, tone = "gold", width = 340 }, ref) {
  const registry = useMemo(() => new ZoneRegistry(), []);
  const stageRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<ChoreoLayerHandle | null>(null);
  const [hidden, setHidden] = useState<Record<number, Set<number>>>({});
  const busy = useRef(false);

  const play = useCallback(async () => {
    if (!choreo || busy.current || !layerRef.current) return;
    busy.current = true;
    const resolveRefUi = (playerRef: PlayerRef): number[] => ({ self: [0], target: [1], each_target: [1], all_opponents: [1, 2, 3], all: [0, 1, 2, 3] })[playerRef];
    const cardsOf = (key: "resolved:outgoing" | "resolved:incoming" | "resolved:highlight"): ChoreoCards => key === "resolved:outgoing"
      ? { ids: [STOLEN.id], snapshots: [STOLEN], fromIndexes: [2], toIndexes: [2] }
      : key === "resolved:incoming" ? { ids: [GIVEN.id], snapshots: [GIVEN], fromIndexes: [1], toIndexes: [1] }
        : { ids: [MY_HAND[1].id], snapshots: [MY_HAND[1]], fromIndexes: [1], toIndexes: [1] };
    try {
      await playChoreography({
        registry,
        layer: layerRef.current,
        resolveRefUi,
        cardsOf,
        visibleCard: (_id, index, cards) => cards.snapshots[index] ?? null,
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
          const first = track.waypoints[0]?.at;
          if (first?.kind === "zone" && first.zone === "hand") {
            const ui = resolveRefUi(first.player)[0];
            setHidden((current) => ({ ...current, [ui]: new Set([...(current[ui] ?? []), ...cards.fromIndexes]) }));
          }
        },
      }, choreo, (text) => text.replace("{activator}", "Toi").replace("{target}", "La cible"));
    } finally {
      setTimeout(() => setHidden({}), 400);
      busy.current = false;
    }
  }, [choreo, registry, tone]);

  useImperativeHandle(ref, () => ({ play }), [play]);

  const felt: CSSProperties = { position: "relative", width, height: width * 1.75, borderRadius: 26, overflow: "hidden", background: "radial-gradient(ellipse at 50% 46%, #1f6b4f, #0c2a20 70%)", border: "8px solid #000", boxShadow: "0 20px 50px #0008" };
  return (
    <ZoneRegistryProvider registry={registry}>
      <div ref={stageRef} style={felt}>
        {SEATS.map((seat) => (
          <div key={seat.ui} style={{ position: "absolute", display: "grid", justifyItems: "center", gap: 6, ...seat.style }}>
            {seat.ui === 0 && <DemoDeposit ui={0} />}
            {seat.ui === 0 ? <DemoHand ui={0} faceUp hidden={hidden[0] ?? new Set()} /> : <DemoTimer ui={seat.ui} emoji={seat.emoji} name={seat.name} />}
            {seat.ui === 0 ? <DemoTimer ui={0} emoji={seat.emoji} name={seat.name} /> : <DemoHand ui={seat.ui} faceUp={false} hidden={hidden[seat.ui] ?? new Set()} />}
            {seat.ui !== 0 && <DemoDeposit ui={seat.ui} />}
          </div>
        ))}
        <DemoCenter />
      </div>
      <ChoreoLayer ref={layerRef} zIndex={90} />
    </ZoneRegistryProvider>
  );
});

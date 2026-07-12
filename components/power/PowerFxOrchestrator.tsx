"use client";

/* ═══════════════ PowerFxOrchestrator — séquenceur d'animations ═══════════════
   Interprète le volet ANIMATION (AnimCue[]) du script d'une carte pouvoir,
   étape par étape, en pilotant les zones de la table via leurs handles
   (registre de zones). C'est le pendant UI de engine/power/interpret.ts :
   ajouter une carte = écrire son script, AUCUNE modification ici.

   L'intro est commune et automatique : SFX + flash/particules (teinte de la
   carte) + overlay d'activation (BLOQUÉ / SANS EFFET gérés). Puis les cues
   du script sont rejoués depuis `activation.resolved` (source de vérité
   calculée par le moteur — identique pour tous les clients). */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { PowerCardView } from "@/components/power/PowerCardView";
import {
  PowerParticleLayer,
  type PowerParticleBurst,
} from "@/components/power/PowerParticleLayer";
import { POWER_MODULES } from "@/config/powers";
import { POWER_CARDS_BY_ID } from "@/config/powerCards";
import { T } from "@/config/theme";
import type { ZoneRegistry } from "@/components/table/zones/ZoneRegistry";
import type {
  AnimCue,
  PlayerRef,
  PowerFxIntensity,
  PowerFxPreset,
  PowerFxTone,
  ResolvedCardsRef,
} from "@/engine/power/types";
import type { Card, GameState, PowerCardActivation, PowerCardId } from "@/types/game";

const PowerParticles = dynamic(() => import("@/components/power/PowerParticles"), { ssr: false });

type PowerTone = PowerFxTone;
type ReactionTone = "gold" | "teal" | "pink";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const afterNextPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

export interface OrchestratorDeps {
  registry: ZoneRegistry;
  motionEnabled: boolean;
  liteMotion: boolean;
  balancedMotion: boolean;
  /** Durée d'affichage de l'overlay d'activation. */
  overlayMs: number;
  /** Durée d'un vol de carte (cfg.anim.dropFlight). */
  flightMs: number;
  /** uid d'activation ("local", "bot-N", uid Firebase) → index UI (0 = moi). */
  uiIndexFromUid(uid?: string): number | null;
  /** seat moteur (resolved.targetSeats) → index UI. */
  uiIndexFromSeat(seat: number): number;
  getPlayers(): GameState["players"];
  /** Son d'activation. */
  playSfx(): void;
  /** Secousse d'impact table. */
  impactShake(intensity?: number): void;
  showTableReaction(label: string, tone?: ReactionTone, detail?: string): void;
  /** Vol de carte générique (pipeline FlyingCard de TableScreen). */
  launchFlight(req: {
    card: Card | null;
    from: DOMRect;
    to: DOMRect;
    faceUp: boolean;
    angle?: number;
    fxPreset?: PowerFxPreset;
    fxTone?: PowerFxTone;
    onArrive?: () => void;
  }): Promise<void>;
  /** Gèle l'état React pendant toute une séquence de déplacements réels. */
  beginStateTransition(): void;
  /** Applique atomiquement le dernier état sync retenu. */
  commitStateTransition(): void;
  /** Libère le verrou, avec commit de sécurité si nécessaire. */
  endStateTransition(): void;
}

interface PowerOverlayState {
  key: string;
  cardId: PowerCardId;
  blocked?: boolean;
  noEffect?: boolean;
}

interface PowerFxState {
  key: string;
  tone: PowerTone;
}

export function usePowerFxOrchestrator(deps: OrchestratorDeps): {
  run(activation: PowerCardActivation): void;
  clearAuras(): void;
  fxActive: boolean;
  element: ReactNode;
} {
  const [powerFx, setPowerFx] = useState<PowerFxState | null>(null);
  const [overlay, setOverlay] = useState<PowerOverlayState | null>(null);
  const [bursts, setBursts] = useState<PowerParticleBurst[]>([]);
  const fxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const auraSeatsRef = useRef<Set<number>>(new Set());
  const burstTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => () => {
    burstTimersRef.current.forEach((timer) => clearTimeout(timer));
    burstTimersRef.current = [];
  }, []);

  const emitBurst = useCallback((
    preset: PowerFxPreset,
    rect: DOMRect | null,
    tone: PowerFxTone,
    intensity: PowerFxIntensity = "spectacular",
    durationMs = 900,
  ) => {
    const d = depsRef.current;
    if (!d.motionEnabled || !rect) return;
    const id = `power-burst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const burst: PowerParticleBurst = {
      id,
      preset,
      tone,
      intensity,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      radius: Math.max(42, Math.min(120, Math.max(rect.width, rect.height) * 0.85)),
      durationMs: d.liteMotion ? Math.min(durationMs, 650) : durationMs,
    };
    setBursts((current) => [...current, burst]);
    const timer = setTimeout(() => {
      setBursts((current) => current.filter((item) => item.id !== id));
    }, burst.durationMs + 120);
    burstTimersRef.current.push(timer);
  }, []);

  const showOverlay = useCallback((cardId: PowerCardId, blocked: boolean, noEffect: boolean) => {
    const d = depsRef.current;
    if (!d.motionEnabled) return;
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    setOverlay({ key: `${cardId}-${Date.now()}`, cardId, blocked, noEffect });
    overlayTimerRef.current = setTimeout(() => {
      setOverlay(null);
      overlayTimerRef.current = null;
    }, d.overlayMs);
  }, []);

  const triggerFx = useCallback((tone: PowerTone) => {
    const d = depsRef.current;
    if (!d.motionEnabled) return;
    setPowerFx({ key: `pfx-${Date.now()}`, tone });
    d.impactShake(6);
    if (fxTimerRef.current) clearTimeout(fxTimerRef.current);
    fxTimerRef.current = setTimeout(() => {
      setPowerFx(null);
      fxTimerRef.current = null;
    }, 1200);
  }, []);

  const clearAuras = useCallback(() => {
    const d = depsRef.current;
    auraSeatsRef.current.forEach((ui) => d.registry.timer(ui)?.showAura(null));
    auraSeatsRef.current.clear();
  }, []);

  const run = (activation: PowerCardActivation) => {
    const d = depsRef.current;
    const powerModule = POWER_MODULES[activation.cardId];
    const def = powerModule?.def ?? POWER_CARDS_BY_ID[activation.cardId];
    if (!def) return;

    const mine = d.uiIndexFromUid(activation.activatedByUid) === 0;
    const blocked = !!activation.blockedByCardId;
    const noEffect = mine && !activation.used && !blocked;

    /* ── Intro commune (toutes cartes) ── */
    d.playSfx();
    triggerFx((def.tone as PowerTone) ?? "gold");
    showOverlay(activation.cardId, blocked, noEffect);

    // Bloquée → l'aura de protection de la cible est consommée.
    if (blocked) {
      const targetUi = d.uiIndexFromUid(activation.targetUid);
      if (targetUi != null && auraSeatsRef.current.has(targetUi)) {
        d.registry.timer(targetUi)?.showAura(null);
        auraSeatsRef.current.delete(targetUi);
      }
      return;
    }
    if (!activation.used) return; // sans effet → pas de cues

    const hasStatefulFlight = powerModule.script.steps.some((step) =>
      (step.anim ?? []).some((cue) => cue.cue === "flyCards" && cue.mode === "move"),
    );
    // Les vols `move` sont fonctionnels : même le profil lite doit les jouer,
    // avec FlyingCard sans traînée/effets coûteux. Seul le toggle global ou la
    // préférence reduced-motion peut les désactiver entièrement.
    const transactional = d.motionEnabled && hasStatefulFlight;
    if (transactional) d.beginStateTransition();
    let scriptStarted = false;
    void (async () => {
      // La présentation de la carte est une phase distincte : aucun effet de
      // zone ne démarre tant que l'overlay d'activation n'a pas disparu.
      if (d.motionEnabled) {
        await sleep(d.overlayMs);
        await afterNextPaint();
      }
      scriptStarted = true;
      await playScript(activation, powerModule, mine, transactional);
    })().catch(() => {
      if (transactional && !scriptStarted) {
        d.commitStateTransition();
        d.endStateTransition();
      }
    });
  };

  async function playScript(
    activation: PowerCardActivation,
    powerModule: (typeof POWER_MODULES)[PowerCardId],
    mine: boolean,
    transactional: boolean,
  ) {
    const d = depsRef.current;
    const { script, def } = powerModule;
    const resolved = activation.resolved;
    const players = d.getPlayers();
    const playerCount = players.length;

    const activatorUi = d.uiIndexFromUid(activation.activatedByUid) ?? 0;
    const targetsUi: number[] = resolved
      ? resolved.targetSeats.map((seat) => d.uiIndexFromSeat(seat))
      : (() => {
          const t = d.uiIndexFromUid(activation.targetUid);
          return t != null ? [t] : [];
        })();

    const resolveRefUi = (ref: PlayerRef): number[] => {
      const all = Array.from({ length: playerCount }, (_, i) => i);
      switch (ref) {
        case "self":
          return [activatorUi];
        case "target":
          return targetsUi.slice(0, 1);
        case "each_target":
          return [...targetsUi];
        case "all_opponents":
          return all.filter((i) => i !== activatorUi);
        case "all":
          return all;
      }
    };

    const fillPlaceholders = (text: string): string =>
      text
        .replace("{target}", players[targetsUi[0]]?.name ?? "L'adversaire")
        .replace("{activator}", players[activatorUi]?.name ?? "Le joueur");

    const fxOf = (cue: AnimCue): {
      preset: PowerFxPreset;
      tone: PowerFxTone;
      intensity: PowerFxIntensity;
    } => {
      let preset: PowerFxPreset = "mystic";
      let tone = (def.tone as PowerFxTone) ?? "gold";
      if (cue.cue === "flyCards") preset = "wind";
      else if (cue.cue === "timerFx") preset = cue.kind === "freeze" ? "frost" : "time";
      else if (cue.cue === "potFlash") {
        preset = "goldRain";
        tone = "gold";
      } else if (cue.cue === "avatarAura") {
        preset = cue.style === "shield"
          ? "shield"
          : cue.style === "lucky"
            ? "goldRain"
            : cue.style === "mask"
              ? "revealMist"
              : "mystic";
      }
      else if (cue.cue === "revealOverlay") preset = "revealMist";
      else if (cue.cue === "highlightHandCard") {
        preset = cue.style === "locked" ? "lock" : cue.style === "boosted" ? "boost" : "mystic";
      }
      return {
        preset: cue.fx?.preset ?? preset,
        tone: cue.fx?.tone ?? tone,
        intensity: cue.fx?.intensity ?? "spectacular",
      };
    };

    /** Cartes d'un pointeur résolu — identités connues seulement si visibles. */
    const cardsOf = (cardsRef: ResolvedCardsRef): {
      ids: string[];
      snapshots: Card[];
      fromIndexes: number[];
      toIndexes: number[];
    } => {
      if (typeof cardsRef === "string" && cardsRef.startsWith("resolved:")) {
        const key = cardsRef.slice("resolved:".length);
        if (key === "highlight") {
          return {
            ids: resolved?.highlight ? [resolved.highlight.cardId] : [],
            snapshots: [],
            fromIndexes: resolved?.highlight ? [resolved.highlight.cardIdx] : [],
            toIndexes: resolved?.highlight ? [resolved.highlight.cardIdx] : [],
          };
        }
        const move = resolved?.moves?.find((m) => m.key === key);
        return {
          ids: move?.cardIds ?? [],
          snapshots: move?.cardSnapshots ?? [],
          fromIndexes: move?.fromCardIndexes ?? [],
          toIndexes: move?.toCardIndexes ?? [],
        };
      }
      return { ids: [], snapshots: [], fromIndexes: [], toIndexes: [] };
    };

    const zoneRect = (
      zone: { zone: string; player?: PlayerRef },
      cardId?: string,
      cardIndex?: number,
    ): DOMRect | null => {
      switch (zone.zone) {
        case "hand": {
          const ui = zone.player ? resolveRefUi(zone.player)[0] : activatorUi;
          const hand = d.registry.hand(ui);
          if (!hand) return null;
          if (cardIndex != null && cardIndex >= 0) return hand.getCardRect(cardIndex);
          if (cardId != null && ui === 0) {
            const idx = players[0]?.hand.findIndex((c) => c.id === cardId) ?? -1;
            if (idx >= 0) return hand.getCardRect(idx);
          }
          return hand.getRect();
        }
        case "deposit": {
          const ui = zone.player ? resolveRefUi(zone.player)[0] : activatorUi;
          return d.registry.deposit(ui)?.getRect() ?? null;
        }
        case "deck":
          return d.registry.deck()?.getRect() ?? null;
        case "reveal":
          return null;
        default:
          return null;
      }
    };

    const beats = script.beats ?? {};
    const movingCueCount = script.steps.reduce(
      (count, step) =>
        count + (step.anim ?? []).filter((cue) => cue.cue === "flyCards" && cue.mode === "move").length,
      0,
    );
    let movingCuesDone = 0;
    let transitionCommitted = !transactional;
    const hiddenHands = new Map<number, Set<number>>();
    const commitTransition = async () => {
      if (transitionCommitted) return;
      transitionCommitted = true;
      d.commitStateTransition();
      hiddenHands.forEach((_indexes, ui) => d.registry.hand(ui)?.setHiddenCards([]));
      hiddenHands.clear();
      await afterNextPaint();
    };
    try {
      if (beats.introMs) await sleep(beats.introMs);

      for (const step of script.steps) {
        for (const cue of step.anim ?? []) {
          switch (cue.cue) {
          case "flyCards": {
            // Cosmétique — uniquement avec animations actives.
            if (!d.motionEnabled) break;
            const fx = fxOf(cue);
            const { ids, snapshots, fromIndexes, toIndexes } = cardsOf(cue.cards);
            // Identité visible uniquement pour MA main (les autres volent cachées).
            const selfInvolved =
              (cue.from.zone === "hand" && resolveRefUi((cue.from as { player: PlayerRef }).player)[0] === 0) ||
              (cue.to.zone === "hand" && resolveRefUi((cue.to as { player: PlayerRef }).player)[0] === 0);
            const faceUp = !cue.hidden && selfInvolved && mine;

            // Toutes les sources restent cachées jusqu'au commit global de la
            // séquence, pas seulement jusqu'à la fin de leur propre vol.
            if (cue.mode === "move" && cue.from.zone === "hand") {
              const sourceUi = resolveRefUi((cue.from as { player: PlayerRef }).player)[0];
              const hidden = hiddenHands.get(sourceUi) ?? new Set<number>();
              ids.forEach((cardId, index) => {
                const idx = fromIndexes[index]
                  ?? players[sourceUi]?.hand.findIndex((candidate) => candidate.id === cardId)
                  ?? -1;
                if (idx >= 0) hidden.add(idx);
              });
              if (hidden.size > 0) {
                hiddenHands.set(sourceUi, hidden);
                d.registry.hand(sourceUi)?.setHiddenCards([...hidden]);
              }
            }

            d.registry.deck()?.pulse(d.flightMs);
            const flights = ids.flatMap((cardId, index) => {
              const from = zoneRect(cue.from, cardId, fromIndexes[index]);
              const to = zoneRect(cue.to, cardId, toIndexes[index]);
              if (!from || !to) return [];
              const card = selfInvolved
                ? snapshots[index]
                  ?? players[0]?.hand.find((candidate) => candidate.id === cardId)
                  ?? null
                : null;
              emitBurst(fx.preset, from, fx.tone, "standard", 720);
              return [d.launchFlight({
                card,
                from,
                to,
                faceUp,
                fxPreset: fx.preset,
                fxTone: fx.tone,
                onArrive: () => emitBurst(fx.preset, to, fx.tone, fx.intensity, 920),
              })];
            });
            await Promise.all(flights);

            if (cue.mode === "move") {
              movingCuesDone += 1;
              if (movingCuesDone >= movingCueCount) await commitTransition();
            }
            break;
          }

          case "revealOverlay": {
            // FONCTIONNEL : seul l'activateur voit la révélation.
            if (!mine) break;
            const fx = fxOf(cue);
            const targetUi = resolveRefUi(cue.player)[0];
            const target = players[targetUi];
            if (!target) break;
            // En ligne, la main de la cible est masquée dans `players` → main
            // révélée jointe à l'activation ; en local, main directement lisible.
            const cards = activation.revealedHand ?? target.hand;
            emitBurst(
              fx.preset,
              new DOMRect(0, 0, window.innerWidth, window.innerHeight),
              fx.tone,
              fx.intensity,
              1300,
            );
            void d.registry.reveal()?.open({
              title: def.name,
              playerName: target.name,
              cards,
              durationMs: cue.durationMs ?? 5000,
            });
            break;
          }

          case "highlightHandCard": {
            const ui = resolveRefUi(cue.player)[0];
            if (ui !== 0) break; // seule MA main est visible
            const fx = fxOf(cue);
            const { ids, toIndexes, fromIndexes } = cardsOf(cue.cards);
            const highlightIdx =
              typeof cue.cards === "string" && cue.cards === "resolved:highlight"
                ? resolved?.highlight?.cardIdx
                : undefined;
            if (ids.length === 0 && highlightIdx === undefined) break;
            d.registry.hand(0)?.highlightCards({
              cardIdx: highlightIdx,
              cardIds: ids.length ? ids : undefined,
              style: cue.style,
              durationMs: cue.durationMs ?? 2600,
            });
            const indexes = toIndexes.length > 0 ? toIndexes : fromIndexes;
            if (indexes.length > 0) {
              indexes.forEach((index) => emitBurst(
                fx.preset,
                d.registry.hand(0)?.getCardRect(index) ?? null,
                fx.tone,
                fx.intensity,
                1050,
              ));
            } else {
              emitBurst(fx.preset, d.registry.hand(0)?.getRect() ?? null, fx.tone, fx.intensity, 1050);
            }
            break;
          }

          case "timerFx": {
            const fx = fxOf(cue);
            for (const ui of resolveRefUi(cue.player)) {
              const timer = d.registry.timer(ui);
              if (!timer) continue;
              if (cue.kind === "freeze") timer.showFreeze(cue.durationMs ?? 10000);
              else timer.showDelta(cue.kind === "gain" ? (cue.seconds ?? 0) : -(cue.seconds ?? 0));
              emitBurst(fx.preset, timer.getRect(), fx.tone, fx.intensity, cue.kind === "freeze" ? 1250 : 900);
            }
            break;
          }

          case "deckPulse": {
            if (d.motionEnabled) d.registry.deck()?.pulse();
            const fx = fxOf(cue);
            emitBurst(fx.preset, d.registry.deck()?.getRect() ?? null, fx.tone, fx.intensity, 950);
            break;
          }

          case "potFlash": {
            if (d.motionEnabled) d.registry.pot()?.flash(cue.amountLabel);
            const fx = fxOf(cue);
            emitBurst(fx.preset, d.registry.pot()?.getRect() ?? null, fx.tone, fx.intensity, 1300);
            break;
          }

          case "avatarAura": {
            const fx = fxOf(cue);
            for (const ui of resolveRefUi(cue.player)) {
              const timer = d.registry.timer(ui);
              timer?.showAura(cue.style);
              emitBurst(fx.preset, timer?.getRect() ?? null, fx.tone, fx.intensity, 1500);
              auraSeatsRef.current.add(ui);
            }
            break;
          }

          case "toast":
            d.showTableReaction(fillPlaceholders(cue.text), cue.tone ?? "gold", undefined);
            break;
          }
          const afterMs = cue.afterMs
            ?? (cue.cue === "flyCards" && cue.to.zone === "deck" ? 180 : 0);
          if (afterMs > 0) await sleep(afterMs);
        }
        if (beats.stepGapMs) await sleep(beats.stepGapMs);
      }
      await commitTransition();
    } finally {
      hiddenHands.forEach((_indexes, ui) => d.registry.hand(ui)?.setHiddenCards([]));
      if (transactional) {
        if (!transitionCommitted) d.commitStateTransition();
        d.endStateTransition();
      }
    }
  }

  const element: ReactNode = (
    <>
      {deps.motionEnabled && bursts.length > 0 && (
        <PowerParticleLayer
          bursts={bursts}
          motionLevel={deps.liteMotion ? "lite" : deps.balancedMotion ? "balanced" : "full"}
        />
      )}
      {deps.motionEnabled && powerFx && (
        <div
          key={powerFx.key}
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 260,
            pointerEvents: "none",
            display: "grid",
            placeItems: "center",
            background: `radial-gradient(ellipse at 50% 50%, ${T[powerFx.tone]}22, transparent 60%)`,
            animation: "fadeIn .18s ease both",
          }}
        >
          {!deps.liteMotion && (
            <PowerParticles
              variant="power"
              tone={powerFx.tone}
              zIndex={261}
              intensity={deps.balancedMotion ? "balanced" : "full"}
            />
          )}
        </div>
      )}

      {deps.motionEnabled && overlay && POWER_CARDS_BY_ID[overlay.cardId] && (
        <div
          key={overlay.key}
          className="nj-power-activation-overlay"
          aria-hidden="true"
          style={{ animationDuration: `${deps.overlayMs}ms` }}
        >
          <div
            className="nj-power-activation-card"
            style={{ animationDuration: `${deps.overlayMs}ms` }}
          >
            <PowerCardView card={POWER_CARDS_BY_ID[overlay.cardId]} showMeta={false} />
          </div>
          <div className="nj-power-activation-copy">
            <strong>
              {overlay.blocked
                ? "BLOQUÉ"
                : overlay.noEffect
                  ? "SANS EFFET"
                  : POWER_CARDS_BY_ID[overlay.cardId].activationTitle}
            </strong>
            <span>
              {overlay.blocked
                ? "Protection activée"
                : overlay.noEffect
                  ? "Rien à améliorer — carte non consommée"
                  : POWER_CARDS_BY_ID[overlay.cardId].activationText}
            </span>
          </div>
        </div>
      )}
    </>
  );

  return { run, clearAuras, fxActive: !!powerFx || !!overlay, element };
}

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

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { launchStyle, screenLaunchTarget } from "@/components/power/powerLaunch";
import { PowerChargeLayer, type PowerCharge } from "@/components/power/PowerChargeLayer";
import { GAME_CONFIG } from "@/config/gameConfig";
import dynamic from "next/dynamic";
import { PowerCardView } from "@/components/power/PowerCardView";
import {
  PowerParticleLayer,
  type PowerParticleBurst,
} from "@/components/power/PowerParticleLayer";
import { getPowerModule } from "@/config/powers";
import { FUNCTIONAL_CUES, fillCardPlaceholders, swapDelta, type ChoreoViewer } from "@/engine/power/choreography";
import { playPowerSound } from "@/lib/powerSounds";
import { ChoreoLayer, type ChoreoLayerHandle } from "@/components/power/choreo/ChoreoLayer";
import { moveSourceUi, playChoreography, type ChoreoCards, type ChoreoContext } from "@/components/power/choreo/playChoreography";
import { playAnimV2, type AnimV2Move } from "@/components/power/choreo/playAnimV2";
import type { PoseZone } from "@/components/table/zones/zonePose";
import { getAnimV2 } from "@/engine/anim/v2/registry";
import type { PowerModule } from "@/engine/power/types";
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
  /** Couleur demandée du pli en cours (Pagne Changeant : la prochaine carte la prend). */
  getLedSuit?(): string | null;
  /** Montant actuel du pot (bonus « si tu gagnes la manche » : montant visé, issue de la manche). */
  getPot?(): number;
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
  /** D'où part la carte lancée : sa place dans MON éventail de pouvoirs (ui 0), sinon l'avatar du lanceur. */
  powerSlotRect?(cardId: PowerCardId, ui: number): DOMRect | null;
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
  /** Texte d'activation pour ce joueur (version « adversaires » quand ce n'est pas lui qui lance). */
  text?: string;
  /** Départ de la carte (emplacement dans l'éventail, ou avatar du lanceur) : variables CSS de lancement. */
  launch?: CSSProperties | null;
}

interface PowerFxState {
  key: string;
  tone: PowerTone;
}

export function usePowerFxOrchestrator(deps: OrchestratorDeps): {
  run(activation: PowerCardActivation): void;
  clearAuras(): void;
  fxActive: boolean;
  /** Joueurs (index UI, hors moi) dont une carte est scellée ou imposée : leur main reste avancée, bien visible. */
  heldSeats: number[];
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
  const choreoLayerRef = useRef<ChoreoLayerHandle | null>(null);
  /** « Prochaine carte » chargée (Éclair du Mfoundi…) : visible jusqu'à ce que le joueur pose une carte. */
  const [charges, setCharges] = useState<PowerCharge[]>([]);
  const dropCharge = useCallback((key: string) => setCharges((current) => current.filter((charge) => charge.key !== key)), []);

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

  const showOverlay = useCallback((cardId: PowerCardId, blocked: boolean, noEffect: boolean, text?: string, from?: DOMRect | null) => {
    const d = depsRef.current;
    if (!d.motionEnabled) return;
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    setOverlay({ key: `${cardId}-${Date.now()}`, cardId, blocked, noEffect, text, launch: launchStyle(from, screenLaunchTarget()) });
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
    const powerModule = getPowerModule(activation.cardId);
    // Carte inconnue de ce client (catalogue pas encore à jour) : pas d'animation.
    if (!powerModule) return;
    const def = powerModule.def;

    const mine = d.uiIndexFromUid(activation.activatedByUid) === 0;
    const blocked = !!activation.blockedByCardId;
    const noEffect = mine && !activation.used && !blocked;

    /* ── Intro commune (toutes cartes) ── */
    // Son d'activation réglé dans l'admin (fichier ou préréglage), sinon son par défaut.
    if (def.sound?.ref) playPowerSound(def.sound.ref, def.sound.volume ?? 1);
    else d.playSfx();
    triggerFx((def.tone as PowerTone) ?? "gold");
    const activatorUi = d.uiIndexFromUid(activation.activatedByUid);
    const targetUi = d.uiIndexFromUid(activation.targetUid);
    const othersText = !mine && def.activationTextOthers
      ? def.activationTextOthers
        .replace("{activator}", (activatorUi != null ? d.getPlayers()[activatorUi]?.name : undefined) ?? "Un joueur")
        .replace("{target}", targetUi === 0 ? "toi" : (targetUi != null ? d.getPlayers()[targetUi]?.name : undefined) ?? "un joueur")
      : undefined;
    showOverlay(activation.cardId, blocked, noEffect, othersText, activatorUi != null ? d.powerSlotRect?.(activation.cardId, activatorUi) : null);

    // Bloquée → l'aura de protection de la cible est consommée.
    if (blocked) {
      if (targetUi != null && auraSeatsRef.current.has(targetUi)) {
        d.registry.timer(targetUi)?.showAura(null);
        auraSeatsRef.current.delete(targetUi);
      }
      return;
    }
    if (!activation.used) return; // sans effet → pas de cues

    // Effets « jusqu'à la prochaine carte » (renfort, couleur, carte imposée) : visibles après l'annonce et la
    // mise en scène d'activation, jusqu'à ce que le joueur concerné pose une carte.
    const ops = powerModule.script.steps.flatMap((step) => step.ops ?? []);
    const pendingCharges: PowerCharge[] = [];
    const boost = ops.find((op) => op.op === "boostNextCard" && op.player === "self" && (op.valueBonus || op.suitOverride));
    if (boost && boost.op === "boostNextCard" && activatorUi != null) {
      const suit = boost.suitOverride ? d.getLedSuit?.() ?? undefined : undefined;
      pendingCharges.push({
        key: activation.playId,
        ui: activatorUi,
        valueBonus: boost.valueBonus,
        suit,
        handTag: boost.valueBonus ? `⚡ Prochaine carte +${boost.valueBonus}` : `⇄ Prochaine carte en ${suit ?? "couleur demandée"}`,
        avatarTag: boost.valueBonus ? `⚡ +${boost.valueBonus}` : `⇄ ${suit ?? "couleur"}`,
        landing: boost.valueBonus ? "bolt" : "dye",
        tone: def.tone,
        depositLen: d.getPlayers()[activatorUi]?.deposit.length ?? 0,
      });
    }
    const forcedPlay = ops.find((op) => op.op === "restrictNextPlay" && op.mode === "forceSelector" && op.player === "target");
    const forcedUi = d.uiIndexFromUid(activation.targetUid);
    if (forcedPlay && forcedPlay.op === "restrictNextPlay" && forcedUi != null && (forcedPlay.select.kind === "weakest" || forcedPlay.select.kind === "strongest")) {
      const force = forcedPlay.select.kind;
      const which = force === "weakest" ? "faible" : "forte";
      pendingCharges.push({
        key: `${activation.playId}-force`,
        ui: forcedUi,
        force,
        handTag: `⛓ ${def.name} : ta plus ${which} carte est imposée`,
        avatarTag: `⛓ Plus ${which} imposée`,
        landing: "spark",
        tone: def.tone,
        depositLen: d.getPlayers()[forcedUi]?.deposit.length ?? 0,
      });
    }
    // Carte scellée (Sceau d'Entrave) : la cible retrouve la carte par sa place dans SA main (identité non diffusée).
    const seal = ops.find((op) => op.op === "blockNextLegalCard" && op.player === "target");
    const sealedUi = activation.resolved?.highlight ? d.uiIndexFromSeat(activation.resolved.highlight.seat) : null;
    if (seal && sealedUi != null) {
      const sealedIdx = activation.resolved!.highlight!.cardIdx;
      pendingCharges.push({
        key: `${activation.playId}-seal`,
        ui: sealedUi,
        lockedCardId: sealedUi === 0 ? d.getPlayers()[0]?.hand[sealedIdx]?.id : undefined,
        // Chez les autres : la place de la carte (de dos) porte chaînes et cadenas, tout le tour.
        lockedIndex: sealedUi === 0 ? undefined : sealedIdx,
        handTag: `🔒 ${def.name} : une de tes cartes est scellée`,
        avatarTag: "🔒 1 carte scellée",
        landing: "spark",
        tone: def.tone,
        depositLen: d.getPlayers()[sealedUi]?.deposit.length ?? 0,
      });
    }
    // Secondes retirées pour le prochain tour (Sable du Temps : la cible ; Cri du Chef : tous les adversaires) :
    // « ⏳ −6 s » sous chaque avatar concerné jusqu'à sa carte, pour tous.
    const sand = ops.find((op) => op.op === "timerDelta" && (op.player === "target" || op.player === "all_opponents") && op.seconds < 0);
    if (sand && sand.op === "timerDelta" && activatorUi != null) {
      const lost = `−${Math.abs(sand.seconds)} s`;
      const losers = sand.player === "target"
        ? [d.uiIndexFromUid(activation.targetUid)].filter((ui): ui is number => ui != null)
        : d.getPlayers().map((_, ui) => ui).filter((ui) => ui !== activatorUi);
      for (const ui of losers) {
        pendingCharges.push({
          key: `${activation.playId}-${ui}-sand`,
          ui,
          handTag: `⏳ ${def.name} : ${lost} à ton prochain tour`,
          avatarTag: `⏳ ${lost}`,
          landing: "spark",
          tone: def.tone,
          depositLen: d.getPlayers()[ui]?.deposit.length ?? 0,
        });
      }
    }
    // Bonus de pot « si tu gagnes la manche » (Bénédiction du Chef, Pluie d'Étoiles) : badge près du pot jusqu'au dernier pli.
    const potOp = ops.find((op) => (op.op === "potMultiplier" || op.op === "potBonus") && op.when === "winRound");
    if (potOp && activatorUi != null) {
      pendingCharges.push({
        key: `${activation.playId}-pot`,
        ui: activatorUi,
        pot: {
          ...(potOp.op === "potMultiplier" ? { factor: potOp.factor } : {}),
          ...(potOp.op === "potBonus" ? { amount: potOp.amount } : {}),
          owner: activatorUi === 0 ? "toi" : d.getPlayers()[activatorUi]?.name ?? "le lanceur",
        },
        handTag: "",
        avatarTag: "",
        landing: "spark",
        tone: def.tone,
        depositLen: d.getPlayers()[activatorUi]?.deposit.length ?? 0,
      });
    }
    // Assurance (Cauris Chanceux) : badge sous l'avatar du lanceur, pour tous, jusqu'au dernier pli.
    const refundOp = ops.find((op) => op.op === "refundOnLoss");
    if (refundOp && activatorUi != null) {
      pendingCharges.push({
        key: `${activation.playId}-insured`,
        ui: activatorUi,
        insured: true,
        handTag: "",
        avatarTag: `🐚 Assuré · ${Math.round(refundOp.ratio * 100)} % si défaite`,
        landing: "spark",
        tone: def.tone,
        depositLen: d.getPlayers()[activatorUi]?.deposit.length ?? 0,
      });
    }
    // Protection (Totem des Ancêtres) : même badge, jusqu'au dernier pli.
    if (ops.some((op) => op.op === "preventDoublePenalty") && activatorUi != null) {
      pendingCharges.push({
        key: `${activation.playId}-totem`,
        ui: activatorUi,
        insured: true,
        handTag: "",
        avatarTag: "🗿 Protégé de la mise double",
        landing: "spark",
        tone: def.tone,
        depositLen: d.getPlayers()[activatorUi]?.deposit.length ?? 0,
      });
    }
    // Cauris et Totem sur le même joueur : deux badges distincts (un genre chacun).
    const kindOf = (charge: PowerCharge) => (charge.force ? "force" : charge.pot ? "pot" : charge.insured ? (charge.key.endsWith("-totem") ? "totem" : "insured") : charge.key.endsWith("-seal") ? "seal" : charge.key.endsWith("-sand") ? "sand" : "boost");
    const sameKind = (a: PowerCharge, b: PowerCharge) => a.ui === b.ui && kindOf(a) === kindOf(b);
    // Chaque charge prend le relais au bon moment : carte imposée dès la fin de l'annonce (son projecteur fait partie
    // de la mise en scène), carte scellée à la fin de l'animation du sceau (1,9 s), renfort après la sienne.
    const delayOf = (charge: PowerCharge) => (!d.motionEnabled ? 0 : d.overlayMs + (kindOf(charge) === "force" ? 100 : kindOf(charge) === "seal" || kindOf(charge) === "sand" || kindOf(charge) === "pot" || kindOf(charge) === "insured" || kindOf(charge) === "totem" ? 1800 : 1100));
    for (const charge of pendingCharges) {
      const timer = setTimeout(() => setCharges((current) => [...current.filter((item) => !sameKind(item, charge)), charge]), delayOf(charge));
      burstTimersRef.current.push(timer);
    }

    const hasStatefulFlight = powerModule.script.steps.some((step) => step.choreo
      ? step.choreo.tracks.some((track) => track.kind === "v2" || ((track.kind === "cardPath" || track.kind === "motif") && track.mode === "move"))
      : (step.anim ?? []).some((cue) => cue.cue === "flyCards" && cue.mode === "move"));
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
    powerModule: PowerModule,
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
    // Cartes de l'échange (repères {outgoing}/{incoming}/{delta}) : connues du lanceur seulement.
    const swapOutgoing = resolved?.moves?.find((move) => move.key === "outgoing")?.cardSnapshots ?? null;
    const swapIncoming = resolved?.moves?.find((move) => move.key === "incoming")?.cardSnapshots ?? null;
    const swapCount = resolved?.moves?.find((move) => move.key === "outgoing")?.cardIds.length;
    // Qui regarde : le lanceur, la cible (elle connaît ses propres cartes) ou un autre joueur.
    const viewer: ChoreoViewer = mine ? "activator" : targetsUi.includes(0) ? "target" : "bystander";

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

    /* Animation V2 (fiche de la carte, `animV2`) : les vols de cartes passent par le lecteur V2,
       les zones donnent les poses. Modèle inconnu de ce client = vols habituels. */
    const animV2 = def.animV2 ? getAnimV2(def.animV2) : null;
    /** Nombre de cartes de chaque main APRÈS les mouvements déjà joués (l'état réel n'arrive qu'au commit). */
    const pendingHandCount = new Map<number, number>();
    const handCountOf = (ui: number) => pendingHandCount.get(ui) ?? players[ui]?.hand.length ?? 0;
    const v2Context = (layer: ChoreoLayerHandle): ChoreoContext => ({
      registry: d.registry,
      layer,
      resolveRefUi,
      cardsOf: (ref) => cardsOf(ref),
      visibleCard: () => null,
      handCardRect: (ui, index) => d.registry.hand(ui)?.getCardRect(index) ?? null,
      burst: (preset, rect, tone, intensity, durationMs) => emitBurst(preset, rect, tone, intensity, durationMs),
      impactShake: (intensity) => d.impactShake(intensity),
      defaultTone: (def.tone as PowerFxTone) ?? "gold",
      motionEnabled: d.motionEnabled,
      lite: d.liteMotion,
    });
    /** Vol d'un cue « flyCards » en V2 : une carte par mouvement, toutes ensemble. */
    const flyV2 = (layer: ChoreoLayerHandle, cue: Extract<AnimCue, { cue: "flyCards" }>, faceUp: boolean): Promise<void> => {
      const { ids, snapshots, fromIndexes, toIndexes } = cardsOf(cue.cards);
      const uiOf = (zone: { zone: string; player?: PlayerRef }) => (zone.player ? resolveRefUi(zone.player)[0] : activatorUi);
      const fromUi = uiOf(cue.from as { zone: string; player?: PlayerRef });
      const toUi = uiOf(cue.to as { zone: string; player?: PlayerRef });
      const arrivals = ids.length;
      // Disposition d'arrivée d'une main : celle d'après le mouvement (cartes qui partent, puis cartes qui arrivent).
      if (cue.mode === "move" && cue.from.zone === "hand") pendingHandCount.set(fromUi, handCountOf(fromUi) - arrivals);
      const arrivalBase = cue.to.zone === "hand" ? handCountOf(toUi) : cue.to.zone === "deposit" ? players[toUi]?.deposit.length ?? 0 : 0;
      if (cue.mode === "move" && cue.to.zone === "hand") pendingHandCount.set(toUi, handCountOf(toUi) + arrivals);
      const finalCount = cue.to.zone === "hand" ? handCountOf(toUi) : undefined;
      const moves: AnimV2Move[] = ids.map((cardId, index) => {
        const fromIndex = cue.from.zone === "hand"
          ? fromIndexes[index] ?? Math.max(0, players[fromUi]?.hand.findIndex((candidate) => candidate.id === cardId) ?? 0)
          : cue.from.zone === "deposit" ? fromIndexes[index] ?? Math.max(0, (players[fromUi]?.deposit.length ?? 1) - 1) : 0;
        const toIndex = cue.to.zone === "hand" || cue.to.zone === "deposit" ? toIndexes[index] ?? arrivalBase + index : 0;
        // Identité montrée seulement si elle l'est en V1 (ma main, pouvoir que j'ai lancé) ; sinon de dos.
        const card = faceUp ? snapshots[index] ?? players[0]?.hand.find((candidate) => candidate.id === cardId) ?? null : null;
        return {
          card,
          from: { zone: cue.from.zone as PoseZone, ui: fromUi, index: fromIndex },
          to: { zone: cue.to.zone as PoseZone, ui: toUi, index: toIndex, count: finalCount },
        };
      });
      return playAnimV2(v2Context(layer), { id: `power_v2_${Date.now().toString(36)}`, model: animV2!, moves, release: "landing" });
    };

    const beats = script.beats ?? {};
    const movingCueCount = script.steps.reduce(
      (count, step) => count + (step.choreo
        ? step.choreo.tracks.filter((track) => track.kind === "v2" || ((track.kind === "cardPath" || track.kind === "motif") && track.mode === "move")).length
        : (step.anim ?? []).filter((cue) => cue.cue === "flyCards" && cue.mode === "move").length),
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
          // Étape chorégraphiée : seuls les cues FONCTIONNELS restent joués ici.
          if (step.choreo && !(FUNCTIONAL_CUES as readonly string[]).includes(cue.cue)) continue;
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

            if (animV2 && choreoLayerRef.current) {
              await flyV2(choreoLayerRef.current, cue, faceUp);
              if (cue.mode === "move") {
                movingCuesDone += 1;
                if (movingCuesDone >= movingCueCount) await commitTransition();
              }
              break;
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
            // Étape chorégraphiée : la surbrillance arrive quand la mise en scène l'amène (sans animations : tout de suite).
            const highlightDelay = step.choreo && d.motionEnabled ? cue.delayMs ?? 0 : 0;
            if (highlightDelay > 0) {
              setTimeout(() => d.registry.hand(0)?.highlightCards({
                cardIdx: highlightIdx,
                cardIds: ids.length ? ids : undefined,
                style: cue.style,
                durationMs: cue.durationMs ?? 2600,
              }), highlightDelay);
              break;
            }
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
        if (step.choreo && choreoLayerRef.current) {
          const layer = choreoLayerRef.current;
          /* Cartes d'une piste. Hors lanceur, seules les cartes qui quittent MA main (la cible d'un échange)
             sont connues : lues dans ma main encore affichée (l'état réel n'arrive qu'à la fin). */
          const asCards = (ref: "resolved:outgoing" | "resolved:incoming" | "resolved:highlight"): ChoreoCards => {
            const cards = cardsOf(ref);
            if (mine) return cards;
            const move = resolved?.moves?.find((candidate) => `resolved:${candidate.key}` === ref);
            const fromMyHand = move?.from.zone === "hand" && "player" in move.from && resolveRefUi(move.from.player as PlayerRef)[0] === 0;
            const myHand = players[0]?.hand ?? [];
            return { ...cards, snapshots: fromMyHand ? cards.fromIndexes.flatMap((index) => (myHand[index] ? [myHand[index]] : [])) : [] };
          };
          const choreoCtx: ChoreoContext = {
            registry: d.registry,
            layer,
            resolveRefUi,
            cardsOf: asCards,
            visibleCard: (cardId, index, cards) => {
              // Lanceur : cartes de l'échange. Autres : seulement les cartes qui quittent ma main (voir asCards).
              if (!mine) return cards.snapshots[index] ?? null;
              return cards.snapshots[index] ?? players[0]?.hand.find((candidate) => candidate.id === cardId) ?? null;
            },
            handCardRect: (ui, index) => d.registry.hand(ui)?.getCardRect(index) ?? null,
            burst: (preset, rect, tone, intensity, durationMs) => emitBurst(preset, rect, tone, intensity, durationMs),
            impactShake: (intensity) => d.impactShake(intensity),
            playSound: (sound, volume) => playPowerSound(sound, volume),
            defaultTone: (def.tone as PowerFxTone) ?? "gold",
            motionEnabled: d.motionEnabled,
            lite: d.liteMotion,
            onMoveStart: (track, cards) => {
              const sourceUi = moveSourceUi(choreoCtx, track);
              if (sourceUi == null) return;
              const hidden = hiddenHands.get(sourceUi) ?? new Set<number>();
              cards.ids.forEach((cardId, index) => {
                const idx = cards.fromIndexes[index]
                  ?? players[sourceUi]?.hand.findIndex((candidate) => candidate.id === cardId)
                  ?? -1;
                if (idx >= 0) hidden.add(idx);
              });
              if (hidden.size > 0) {
                hiddenHands.set(sourceUi, hidden);
                d.registry.hand(sourceUi)?.setHiddenCards([...hidden]);
              }
            },
            onMoveEnd: () => { movingCuesDone += 1; },
            viewer,
            animV2: def.animV2,
            verdict: mine ? swapDelta(swapOutgoing, swapIncoming) : null,
          };
          // {reason} : pourquoi la carte conseillée (lanceur seulement).
          const reason = mine ? resolved?.highlight?.reason ?? "" : "";
          // {suit} : couleur demandée du pli (Pagne Changeant).
          const ledSuit = d.getLedSuit?.() ?? "";
          await playChoreography(choreoCtx, step.choreo, (text) => fillCardPlaceholders(fillPlaceholders(text).replace("{reason}", reason).replace("{suit}", ledSuit), mine ? swapOutgoing : null, mine ? swapIncoming : null, swapCount));
          if (movingCuesDone >= movingCueCount) await commitTransition();
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
      <ChoreoLayer ref={choreoLayerRef} />
      <PowerChargeLayer charges={charges} registry={deps.registry} getPlayers={deps.getPlayers} getLedSuit={deps.getLedSuit} getPot={deps.getPot} maxValue={GAME_CONFIG.ranks.max} motion={deps.motionEnabled} onConsumed={dropCharge} />
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
            className={`nj-power-activation-card${overlay.launch ? " is-launch" : ""}`}
            style={{ ...overlay.launch, animationDuration: `${deps.overlayMs}ms` }}
          >
            <PowerCardView card={POWER_CARDS_BY_ID[overlay.cardId]} showMeta={false} />
          </div>
          <div
            className={`nj-power-activation-copy${overlay.launch ? " is-launch" : ""}`}
            style={overlay.launch ? { animationDuration: `${deps.overlayMs}ms` } : undefined}
          >
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
                  : overlay.text ?? POWER_CARDS_BY_ID[overlay.cardId].activationText}
            </span>
          </div>
        </div>
      )}
    </>
  );

  const heldSeats = charges.filter((charge) => charge.ui !== 0 && (charge.force || charge.lockedIndex !== undefined)).map((charge) => charge.ui);
  return { run, clearAuras, fxActive: !!powerFx || !!overlay, heldSeats, element };
}

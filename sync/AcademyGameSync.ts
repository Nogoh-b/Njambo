/* ═══════════════ sync/AcademyGameSync.ts ═══════════════
   Partie de l'Académie (décision D9) : même interface que LocalGameSync, la
   table l'affiche telle quelle. Toute la logique est dans
   engine/academy/table.ts ; ici seulement le rythme (réflexion des bots, pose,
   pause de fin de pli) et les événements pour le coach (A2).
   Ni chrono, ni mise, ni Énergie, ni appel serveur. */

import { POWER_CARDS_BY_ID } from "@/config/powerCards";
import { powerScriptOf } from "@/config/powers";
import { powerAnimationBudgetMs } from "@/engine/power/animBudget";
import type { PowerChoices } from "@/engine/power";
import { AcademyTable, type AcademyEvent, type RefusalReason, type RoundEnd } from "@/engine/academy/table";
import type { AcademyScene, CoachKey, SceneOutcome, YourExpectation } from "@/engine/academy/types";
import type {
  Card,
  GameConfig,
  GameState,
  GameSyncActions,
  PowerCardActivation,
  PowerCardId,
  Profile,
  Result,
  SyncStatus,
} from "@/types/game";

/** Ce que le calque du coach (A2) doit savoir de la scène. */
export type AcademySceneEvent =
  /** Réplique à dire : ouverture, ou réplique liée au coup qui vient de se poser (siège et nature du coup). */
  | { type: "coach"; key: CoachKey; seat?: number; source?: "play" | "power" }
  /** C'est au joueur : coup attendu, avec ses répliques ; `trick` = sièges qui ont déjà posé dans ce pli. */
  | { type: "awaitYou"; expect: YourExpectation; trick: number[] }
  /** Coup du joueur accepté. */
  | { type: "accepted" }
  /** Coup du joueur refusé : la carte touchée tremble, le coach dit pourquoi. */
  | { type: "refused"; reason: RefusalReason; coach: CoachKey; cardId?: string; message?: string }
  | { type: "trickEnd"; winnerIdx: number }
  | { type: "end"; outcome: SceneOutcome; roundEnd: RoundEnd | null; coach?: CoachKey };

interface AcademySyncOptions {
  scene: AcademyScene;
  cfg: GameConfig;
  profile: Pick<Profile, "name" | "emoji" | "balance">;
  onBanner: (text: string) => void;
  onSceneEvent?: (event: AcademySceneEvent) => void;
}

type Unsubscribe = () => void;

export class AcademyGameSync implements GameSyncActions {
  private opts: AcademySyncOptions;
  private table: AcademyTable;
  private handle: ReturnType<typeof setTimeout> | null = null;
  private bannerHandle: ReturnType<typeof setTimeout> | null = null;
  /** Fin de la pause qui suit une carte posée (atterrissage + lecture). */
  private afterPlayUntil = 0;
  /** Coup du joueur déjà annoncé au coach (une seule annonce par coup). */
  private announcedAction = -1;
  /** Le coach parle : la scène attend (aucun coup, ni bot ni joueur). */
  private held = false;
  /** Coup programmé arrivé pendant que le coach parlait : joué à la reprise. */
  private deferred: (() => void) | null = null;
  /** Répliques liées à un coup, dites une fois la carte posée. */
  private coachTimers: ReturnType<typeof setTimeout>[] = [];
  private ended = false;
  private motionEnabled = true;
  private destroyed = false;

  private stateListeners = new Set<(state: GameState) => void>();
  private playCardListeners = new Set<(play: { playerIdx: number; cardIdx: number; card: Card }) => void>();
  private trickEndListeners = new Set<(winnerIdx: number) => void>();
  private roundEndListeners = new Set<(result: Result) => void>();
  private timerListeners = new Set<(seconds: number) => void>();
  private syncStatusListeners = new Set<(status: SyncStatus) => void>();
  private powerActivatedListeners = new Set<(activation: PowerCardActivation) => void>();

  constructor(opts: AcademySyncOptions) {
    this.opts = opts;
    this.table = this.createTable();
  }

  private createTable() {
    const { scene, cfg, profile } = this.opts;
    return new AcademyTable(scene, cfg, { you: { name: profile.name, emoji: profile.emoji, balance: profile.balance } });
  }

  /* ═══════════════ Interface GameSyncActions ═══════════════ */

  /** Démarre la scène, mains déjà servies (pas de donne animée). */
  start() {
    this.clearHandle();
    this.clearCoachTimers();
    this.deferred = null;
    this.ended = false;
    this.announcedAction = -1;
    this.afterPlayUntil = 0;
    this.emitState();
    for (const key of this.opts.scene.coach?.intro ?? []) this.sceneEvent({ type: "coach", key });
    this.advance();
  }

  /** Rejouer : la scène repart de son état figé. La pause posée par le coach en fin de scène
   *  ne compte plus (au premier départ, elle est gardée : le titre du chapitre s'affiche). */
  nextRound() {
    this.held = false;
    this.table = this.createTable();
    this.start();
  }

  playCard = (cardIdx: number) => {
    if (this.handle || this.held || this.destroyed) return;
    const result = this.table.playYou(cardIdx);
    if (!result.ok) {
      const cardId = this.table.state().players[0]?.hand[cardIdx]?.id;
      this.refuse(result.reason, result.coach, result.message, cardId);
      return;
    }
    this.sceneEvent({ type: "accepted" });
    this.handleEvent(result.event);
    this.advance();
  };

  usePowerCard = (cardId: PowerCardId, targetIdx?: number, choices?: PowerChoices) => {
    if (this.handle || this.held || this.destroyed) return;
    const result = this.table.useYourPower(cardId, targetIdx, choices);
    if (!result.ok) {
      this.refuse(result.reason, result.coach, result.message);
      return;
    }
    this.sceneEvent({ type: "accepted" });
    this.handleEvent(result.event);
    this.advance();
  };

  setMotionEnabled = (enabled: boolean) => {
    this.motionEnabled = enabled;
  };

  /** Le coach parle (true) ou a fini (false) : la scène s'arrête puis reprend là où elle en était. */
  hold = (on: boolean) => {
    this.held = on;
    if (on || this.destroyed) return;
    const run = this.deferred;
    this.deferred = null;
    run?.();
    this.advance();
  };

  /* ═══════════════ Déroulé ═══════════════ */

  /** Enchaîne les coups automatiques jusqu'au prochain coup du joueur ou à la fin. */
  private advance() {
    if (this.destroyed || this.handle || this.held) return;
    const step = this.table.next();
    const wait = Math.max(0, this.afterPlayUntil - Date.now());
    if (step.kind === "end") {
      if (this.ended) return;
      this.ended = true;
      const coach = this.opts.scene.coach;
      const key = step.outcome === "success" ? coach?.success : step.outcome === "failure" ? coach?.failure : coach?.done;
      this.sceneEvent({ type: "end", outcome: step.outcome, roundEnd: this.table.roundEnd, coach: key });
      return;
    }
    if (step.kind === "closeTrick") {
      this.schedule(Math.max(this.opts.cfg.anim.trickPause, wait), () => {
        const { winnerIdx } = this.table.closeTrick();
        this.opts.onBanner("");
        this.emitState();
        this.sceneEvent({ type: "trickEnd", winnerIdx });
      });
      return;
    }
    if (step.kind === "auto") {
      const { replayBotThinkMin, replayBotThinkMax } = this.opts.cfg.anim;
      this.schedule(wait + (replayBotThinkMin + replayBotThinkMax) / 2, () => this.handleEvent(this.table.stepAuto()));
      return;
    }
    // Au joueur : le coach ne parle qu'une fois la carte posée ou le pouvoir joué.
    if (wait > 0) {
      this.schedule(wait, () => {});
      return;
    }
    if (this.announcedAction !== this.table.actionIndex) {
      this.announcedAction = this.table.actionIndex;
      this.timerListeners.forEach((cb) => cb(this.opts.cfg.turnSeconds));
      const trick = this.table.state().trickPlays.map((play) => play.playerIdx);
      this.sceneEvent({ type: "awaitYou", expect: step.expect, trick });
    }
  }

  private handleEvent(event: AcademyEvent) {
    const seat = event.type === "play" ? event.play.playerIdx : event.seat;
    if (event.type === "power") {
      // Mise en scène du pouvoir : la suite (carte du bot, parole du coach) attend qu'elle soit jouée.
      const script = powerScriptOf(event.activation.cardId);
      const pause = event.secret || !this.motionEnabled ? this.opts.cfg.anim.powerBeat : powerAnimationBudgetMs(script, this.opts.cfg.anim.powerMax);
      this.afterPlayUntil = Date.now() + pause;
    }
    if (event.type === "play") {
      const { dropFlight, landSettle, botAfterPlay } = this.opts.cfg.anim;
      this.afterPlayUntil = Date.now() + dropFlight + landSettle + botAfterPlay;
      this.playCardListeners.forEach((cb) => cb(event.play));
      const state = this.table.state();
      if (state.phase === "trickEnd" && state.dominantIdx !== null) {
        this.emitState();
        this.opts.onBanner(`${state.players[state.dominantIdx].name} domine le tour`);
        this.trickEndListeners.forEach((cb) => cb(state.dominantIdx!));
      } else {
        // Comme LocalGameSync : la carte atterrit avant que le tour passe au joueur suivant.
        this.emitState("trickEnd");
        this.schedule(this.afterPlayUntil - Date.now(), () => this.emitState());
      }
    } else {
      const def = POWER_CARDS_BY_ID[event.activation.cardId];
      if (def && event.activation.used && !event.activation.blockedByCardId) this.flashBanner(`${def.name} !`);
      if (!event.secret) this.powerActivatedListeners.forEach((cb) => cb(event.activation));
      this.emitState();
    }
    if (event.coach) {
      const key = event.coach;
      const source = event.type;
      this.coachTimers.push(setTimeout(() => {
        if (!this.destroyed) this.sceneEvent({ type: "coach", key, seat, source });
      }, Math.max(0, this.afterPlayUntil - Date.now())));
    }
  }

  private refuse(reason: RefusalReason, coach: CoachKey | undefined, message?: string, cardId?: string) {
    this.sceneEvent({ type: "refused", reason, coach: coach ?? `refus.${reason}`, cardId, message });
  }

  private clearCoachTimers() {
    this.coachTimers.forEach(clearTimeout);
    this.coachTimers = [];
  }

  private flashBanner(text: string) {
    if (this.bannerHandle) clearTimeout(this.bannerHandle);
    this.opts.onBanner(text);
    this.bannerHandle = setTimeout(() => {
      this.bannerHandle = null;
      if (!this.destroyed) this.opts.onBanner("");
    }, 2000);
  }

  private schedule(ms: number, run: () => void) {
    this.clearHandle();
    this.handle = setTimeout(() => {
      this.handle = null;
      if (this.destroyed) return;
      if (this.held) {
        this.deferred = run;
        return;
      }
      run();
      this.advance();
    }, Math.max(0, ms));
  }

  private clearHandle() {
    if (this.handle) clearTimeout(this.handle);
    this.handle = null;
  }

  private sceneEvent(event: AcademySceneEvent) {
    this.opts.onSceneEvent?.(event);
  }

  /** `phase` remplace la phase affichée (pause d'atterrissage, comme LocalGameSync). */
  private emitState(phase?: GameState["phase"]) {
    const state = this.table.state();
    if (phase) state.phase = phase;
    this.stateListeners.forEach((cb) => cb(state));
  }

  /* ═══════════════ Abonnements ═══════════════ */

  onStateUpdate = (cb: (state: GameState) => void): Unsubscribe => {
    this.stateListeners.add(cb);
    cb(this.table.state());
    return () => this.stateListeners.delete(cb);
  };

  onPlayCard = (cb: (play: { playerIdx: number; cardIdx: number; card: Card }) => void): Unsubscribe => {
    this.playCardListeners.add(cb);
    return () => this.playCardListeners.delete(cb);
  };

  onTrickEnd = (cb: (winnerIdx: number) => void): Unsubscribe => {
    this.trickEndListeners.add(cb);
    return () => this.trickEndListeners.delete(cb);
  };

  /** Une scène ne règle aucune mise : pas de fin de manche au sens du jeu. */
  onRoundEnd = (cb: (result: Result) => void): Unsubscribe => {
    this.roundEndListeners.add(cb);
    return () => this.roundEndListeners.delete(cb);
  };

  onTimerTick = (cb: (seconds: number) => void): Unsubscribe => {
    this.timerListeners.add(cb);
    return () => this.timerListeners.delete(cb);
  };

  onSyncStatus = (cb: (status: SyncStatus) => void): Unsubscribe => {
    this.syncStatusListeners.add(cb);
    cb({ state: "live", updatedAt: Date.now() });
    return () => this.syncStatusListeners.delete(cb);
  };

  onPowerActivated = (cb: (activation: PowerCardActivation) => void): Unsubscribe => {
    this.powerActivatedListeners.add(cb);
    return () => this.powerActivatedListeners.delete(cb);
  };

  destroy() {
    this.destroyed = true;
    this.clearHandle();
    this.clearCoachTimers();
    if (this.bannerHandle) clearTimeout(this.bannerHandle);
    this.stateListeners.clear();
    this.playCardListeners.clear();
    this.trickEndListeners.clear();
    this.roundEndListeners.clear();
    this.timerListeners.clear();
    this.syncStatusListeners.clear();
    this.powerActivatedListeners.clear();
  }
}

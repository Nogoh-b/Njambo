/* ═══════════════ Académie : directeur du coach ═══════════════
   Transforme les événements d'une scène (sync/AcademyGameSync.ts) en ce que
   le calque affiche, dans l'ordre « animation terminée → parole → action » :
   - une réplique met la scène en pause (hold) le temps d'être lue, ou jusqu'à
     « Suivant » ;
   - le coup du joueur n'est ouvert qu'après la dernière réplique, projecteur
     sur la carte, la carte Pouvoir ou la main attendue ;
   - un refus fait trembler la carte touchée et affiche la raison ;
   - en fin de scène : « Réessayer ce pli » (défi raté) ou « Continuer ».
   Store externe (useSyncExternalStore) ; aucun DOM. */

import type { CoachKey, SceneOutcome, YourExpectation } from "@/engine/academy/types";
import type { AcademySceneEvent } from "@/sync/AcademyGameSync";
import type { GameConfig } from "@/types/game";
import { coachText } from "./texts";

/** Repère d'une zone à l'écran : `hand`, `card:9♥`, `deposit:1`, `seat:2`, `power:eclair_mfoundi`. */
export type AcademyAnchor = string;

export interface CoachControls {
  cfg: GameConfig;
  /** Met la scène en pause pendant qu'une réplique est lue. */
  hold(on: boolean): void;
  /** Rejoue la scène depuis son état figé. */
  retry(): void;
  /** « Passer ». */
  skip(): void;
  /** Fin de scène, « Continuer ». */
  finish(outcome: SceneOutcome): void;
}

export interface CoachTitle {
  kicker: string;
  title: string;
}

export interface CoachView {
  active: boolean;
  /** Titre de chapitre affiché au centre, avant la première réplique. */
  title: CoachTitle | null;
  /** Réplique affichée ; `blocking` = la scène attend sa lecture (bouton « Suivant »). */
  line: { id: number; text: string; blocking: boolean } | null;
  /** Zones éclairées par le projecteur (le reste est assombri). */
  focus: AcademyAnchor[];
  veil: boolean;
  /** Fin de scène : boutons de sortie. */
  end: { outcome: SceneOutcome } | null;
  /** Carte touchée par erreur : elle tremble (nonce : un tremblement par refus). */
  shake: { cardId: string; nonce: number } | null;
}

type Beat =
  | { kind: "title"; title: CoachTitle }
  | { kind: "line"; key: CoachKey; focus: AcademyAnchor[] }
  | { kind: "act"; expect: YourExpectation; prompt: string | null }
  | { kind: "end"; outcome: SceneOutcome; key?: CoachKey };

const IDLE: CoachView = { active: false, title: null, line: null, focus: [], veil: false, end: null, shake: null };

/** Temps de lecture d'une réplique : environ 20 caractères par seconde, entre 2,6 et 6,5 s. */
export const readingMs = (text: string) => Math.max(2600, Math.min(6500, 1400 + text.length * 45));

/** Durée d'affichage d'un titre de chapitre. */
export const TITLE_MS = 2200;

/** Délai avant l'indice quand le joueur hésite (plan : 5 s). */
export const HINT_DELAY_MS = 5000;

/** Zones éclairées pendant le coup attendu. */
export function actionFocus(expect: YourExpectation): AcademyAnchor[] {
  if (expect.kind === "card") return [`card:${expect.card}`];
  if (expect.kind === "power") return [`power:${expect.power}`];
  return ["hand"];
}

export class CoachDirector {
  private view: CoachView = IDLE;
  private listeners = new Set<() => void>();
  private controls: CoachControls | null = null;
  private queue: Beat[] = [];
  private current: Beat | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lineId = 0;
  private shakeNonce = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.view;

  getServerSnapshot = () => IDLE;

  /** Une scène commence : le calque s'affiche, avec le titre du chapitre s'il y en a un. */
  start(controls: CoachControls, options: { title?: CoachTitle } = {}) {
    this.reset();
    this.controls = controls;
    this.set({ ...IDLE, active: true });
    if (options.title) {
      this.queue.push({ kind: "title", title: options.title });
      this.pump();
    }
  }

  /** La scène quitte l'écran. */
  stop() {
    this.reset();
    this.controls = null;
    this.set(IDLE);
  }

  dispatch(event: AcademySceneEvent) {
    if (!this.controls) return;
    switch (event.type) {
      case "coach": {
        const focus = event.seat === undefined ? [] : [event.source === "power" ? `seat:${event.seat}` : `deposit:${event.seat}`];
        this.queue.push({ kind: "line", key: event.key, focus });
        break;
      }
      case "awaitYou": {
        const before = event.expect.coach?.before ?? [];
        const focus = event.trick.map((seat) => `deposit:${seat}`);
        for (const key of before) this.queue.push({ kind: "line", key, focus });
        const prompt = before.length > 0 ? this.text(before[before.length - 1]) : null;
        this.queue.push({ kind: "act", expect: event.expect, prompt });
        break;
      }
      case "accepted":
        if (this.current?.kind === "act") this.finishBeat();
        return;
      case "refused":
        if (this.current?.kind !== "act") return;
        this.clearTimer();
        this.set({
          ...this.view,
          line: { id: ++this.lineId, text: this.text(event.coach), blocking: false },
          shake: event.cardId ? { cardId: event.cardId, nonce: ++this.shakeNonce } : this.view.shake,
        });
        return;
      case "trickEnd":
        return;
      case "end":
        this.queue.push({ kind: "end", outcome: event.outcome, key: event.coach });
        break;
    }
    this.pump();
  }

  /** « Suivant » : passe la réplique (ou le titre) en cours. */
  next = () => {
    if (this.current?.kind === "line" || this.current?.kind === "title") this.finishBeat();
  };

  /** « Réessayer ce pli ». */
  retry = () => {
    const controls = this.controls;
    if (!controls) return;
    this.reset();
    this.set({ ...IDLE, active: true });
    controls.retry();
  };

  /** « Continuer » en fin de scène. */
  finish = () => {
    if (this.current?.kind === "end") this.controls?.finish(this.current.outcome);
  };

  skip = () => {
    this.controls?.skip();
  };

  /* ═══════════════ Interne ═══════════════ */

  private text(key: CoachKey) {
    return this.controls ? coachText(key, this.controls.cfg) : key;
  }

  private pump() {
    if (this.current || !this.controls) return;
    const beat = this.queue.shift();
    if (!beat) {
      // Plus rien à dire : la scène reprend, le voile se lève.
      this.set({ ...this.view, line: null, focus: [], veil: false });
      this.controls.hold(false);
      return;
    }
    this.current = beat;
    if (beat.kind === "title") {
      this.controls.hold(true);
      this.set({ ...this.view, title: beat.title, line: null, focus: [], veil: true, end: null });
      this.timer = setTimeout(() => this.finishBeat(), TITLE_MS);
      return;
    }
    if (beat.kind === "line") {
      this.controls.hold(true);
      const text = this.text(beat.key);
      this.set({ ...this.view, line: { id: ++this.lineId, text, blocking: true }, focus: beat.focus, veil: true, end: null });
      this.timer = setTimeout(() => this.finishBeat(), readingMs(text));
      return;
    }
    if (beat.kind === "act") {
      this.set({
        ...this.view,
        line: beat.prompt ? { id: ++this.lineId, text: beat.prompt, blocking: false } : null,
        focus: actionFocus(beat.expect),
        veil: true,
      });
      this.controls.hold(false);
      const hint = beat.expect.coach?.hint;
      if (hint) {
        this.timer = setTimeout(() => {
          if (this.current === beat) this.set({ ...this.view, line: { id: ++this.lineId, text: this.text(hint), blocking: false } });
        }, HINT_DELAY_MS);
      }
      return;
    }
    this.controls.hold(true);
    this.set({
      ...this.view,
      line: beat.key ? { id: ++this.lineId, text: this.text(beat.key), blocking: false } : null,
      focus: [],
      veil: true,
      end: { outcome: beat.outcome },
    });
  }

  private finishBeat() {
    const beat = this.current;
    if (!beat || beat.kind === "end") return;
    this.clearTimer();
    this.current = null;
    if (beat.kind === "act") this.set({ ...this.view, line: null, focus: [] });
    if (beat.kind === "title") this.set({ ...this.view, title: null });
    this.pump();
  }

  private reset() {
    this.clearTimer();
    this.queue = [];
    this.current = null;
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private set(view: CoachView) {
    this.view = view;
    this.listeners.forEach((listener) => listener());
  }
}

/** Le coach de l'application : un seul calque, monté au niveau de l'application. */
export const coachDirector = new CoachDirector();

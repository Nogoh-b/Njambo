"use client";

/* ═══════════════ Registre des zones de la table ═══════════════
   Chaque zone (main, dépôt, timer/avatar, pioche, révélation) s'auto-
   enregistre ici avec un handle IMPÉRATIF exposant ses primitives
   d'animation. L'orchestrateur des pouvoirs (PowerFxOrchestrator) et les
   vols de cartes lisent les rects et déclenchent les effets via ces
   handles — TableScreen ne possède plus les états d'animation des zones. */

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import type { ZonePose } from "@/engine/anim/v2/pose";
import type { Card, DepositedCard } from "@/types/game";

export type ZoneKey =
  | `hand:${number}`
  | `deposit:${number}`
  | `timer:${number}`
  | "deck"
  | "reveal"
  | "pot";

export type HandHighlightStyle = "recommend" | "swapped" | "locked" | "boosted";

export interface HandHandle {
  /** Élément racine à l'écran (chorégraphies : animations propres à la zone). */
  getElement?(): HTMLElement | null;
  getRect(): DOMRect | null;
  getCardRect(cardIdx: number): DOMRect | null;
  /** Surligne des cartes (par index ou par id) pendant durationMs. */
  highlightCards(req: {
    cardIdx?: number;
    cardIds?: string[];
    style: HandHighlightStyle;
    durationMs: number;
  }): void;
  /** Cache visuellement une carte (pendant son vol). null = tout révéler. */
  setHiddenCard(cardIdx: number | null): void;
  setHiddenCards(cardIdxs: number[]): void;
  /** Mode sélection : les cartes matchées deviennent cliquables (clic générique).
   *  Retourne une fonction d'annulation. */
  beginSelection(
    filter: (card: Card, cardIdx: number) => boolean,
    onPick: (cardIdx: number) => void,
  ): () => void;
  /* ── Modèles d'animation (phase G) : facultatifs, une zone ancienne les ignore ── */
  /** Nombre de cartes affichées (places supplémentaires de `makeRoom` non comprises). */
  cardCount?(): number;
  /** Centre, largeur (sans rotation) et rotation à l'écran d'une carte ; au-delà de la dernière : place réservée par `makeRoom`. */
  getCardSlot?(cardIdx: number): { x: number; y: number; width: number; rotate: number } | null;
  /** Resserre l'éventail : les cartes parties ne prennent plus de place (jusqu'au prochain état). */
  collapseCards?(cardIdxs: number[], durationMs: number): void;
  /** Écarte l'éventail pour `count` cartes à venir ; `getCardRect(longueur + i)` donne alors leur place. */
  makeRoom?(count: number, durationMs: number): void;
  /** Assombrit toutes les cartes sauf celles-ci pendant durationMs. */
  dimCards?(keepIdxs: number[], durationMs: number): void;
  /** Cache des cartes pendant durationMs, puis les réaffiche (animation sur place). */
  hideCardsFor?(cardIdxs: number[], durationMs: number): void;
  /* ── Animation V2 : facultatif ── */
  /** Pose de la carte `cardIdx` quand la main en compte `count` (par défaut : le nombre actuel).
   *  `count` plus grand = disposition après une arrivée ; la pose est celle du prochain état. */
  poseOf?(cardIdx: number, count?: number): ZonePose | null;
}

export interface DepositHandle {
  /** Élément racine à l'écran (chorégraphies : animations propres à la zone). */
  getElement?(): HTMLElement | null;
  getRect(): DOMRect | null;
  getTopCardRect(): DOMRect | null;
  getCardRect(cardIdx: number): DOMRect | null;
  beginSelection(
    filter: (card: DepositedCard, cardIdx: number) => boolean,
    onPick: (cardIdx: number) => void,
  ): () => void;
  /** Modèles d'animation : cache des cartes du dépôt pendant durationMs (leur sprite les remplace). Facultatif. */
  hideCardsFor?(cardIdxs: number[], durationMs: number): void;
  /** Pose de la carte `cardIdx`. Au-delà de la dernière : carte à venir, à sa place exacte si `cardId` est donné
   *  (jeté calculé depuis la carte), sinon au centre, à plat. Facultatif. */
  poseOf?(cardIdx: number, count?: number, cardId?: string): ZonePose | null;
}

export interface DeckHandle {
  /** Élément racine à l'écran (chorégraphies : animations propres à la zone). */
  getElement?(): HTMLElement | null;
  getRect(): DOMRect | null;
  /** Pulse visuel de la pioche (échange en cours…). */
  pulse(durationMs?: number): void;
  /** Animation V2 : pose de la carte `cardIdx` sur `count` (la dernière est sur le dessus). Facultatif. */
  poseOf?(cardIdx: number, count?: number): ZonePose | null;
}

export interface PotHandle {
  /** Élément racine à l'écran (chorégraphies : animations propres à la zone). */
  getElement?(): HTMLElement | null;
  getRect(): DOMRect | null;
  /** Flash du pot avec un label (« +200 », « ×2 »…). */
  flash(label?: string): void;
}

export interface TimerHandle {
  /** Élément racine à l'écran (chorégraphies : animations propres à la zone). */
  getElement?(): HTMLElement | null;
  getRect(): DOMRect | null;
  /** Visuel « gelé » sur l'anneau pendant durationMs. */
  showFreeze(durationMs: number): void;
  /** « +8s » / « −3s » flottant sur l'avatar. */
  showDelta(seconds: number): void;
  /** Aura persistante (bouclier, masque, totem, chance). null = retirer. */
  showAura(style: "shield" | "mask" | "totem" | "lucky" | null): void;
  /** Modèles d'animation : le solde (Nkap) clignote pendant durationMs. Facultatif. */
  pulseBalance?(durationMs: number): void;
}

export interface RevealHandle {
  /** Élément racine à l'écran (chorégraphies : animations propres à la zone). */
  getElement?(): HTMLElement | null;
  /** Ouvre l'overlay de révélation. `pick` le rend cliquable : la promesse se
   *  résout avec la carte cliquée, ou null (fermeture/timeout). */
  open(req: {
    title: string;
    playerName: string;
    cards: Card[];
    durationMs?: number;
    pick?: { filter?: (card: Card) => boolean };
  }): Promise<Card | null>;
  getCardRect(cardId: string): DOMRect | null;
  getRect(): DOMRect | null;
  close(): void;
}

export interface ZoneHandleMap {
  deck: DeckHandle;
  pot: PotHandle;
  reveal: RevealHandle;
}

type AnyHandle = HandHandle | DepositHandle | DeckHandle | PotHandle | TimerHandle | RevealHandle;

export class ZoneRegistry {
  private handles = new Map<ZoneKey, AnyHandle>();

  register(key: ZoneKey, handle: AnyHandle): () => void {
    this.handles.set(key, handle);
    return () => {
      if (this.handles.get(key) === handle) this.handles.delete(key);
    };
  }

  hand(seatIdx: number): HandHandle | null {
    return (this.handles.get(`hand:${seatIdx}`) as HandHandle | undefined) ?? null;
  }

  deposit(seatIdx: number): DepositHandle | null {
    return (this.handles.get(`deposit:${seatIdx}`) as DepositHandle | undefined) ?? null;
  }

  timer(seatIdx: number): TimerHandle | null {
    return (this.handles.get(`timer:${seatIdx}`) as TimerHandle | undefined) ?? null;
  }

  deck(): DeckHandle | null {
    return (this.handles.get("deck") as DeckHandle | undefined) ?? null;
  }

  pot(): PotHandle | null {
    return (this.handles.get("pot") as PotHandle | undefined) ?? null;
  }

  reveal(): RevealHandle | null {
    return (this.handles.get("reveal") as RevealHandle | undefined) ?? null;
  }
}

const ZoneRegistryContext = createContext<ZoneRegistry | null>(null);

export function ZoneRegistryProvider({ registry, children }: { registry: ZoneRegistry; children: ReactNode }) {
  return <ZoneRegistryContext.Provider value={registry}>{children}</ZoneRegistryContext.Provider>;
}

export function useZoneRegistry(): ZoneRegistry | null {
  return useContext(ZoneRegistryContext);
}

/** Enregistre un handle de zone (no-op si hors provider ou sans zoneKey). */
export function useRegisterZone(key: ZoneKey | undefined, handle: AnyHandle) {
  const registry = useZoneRegistry();
  const handleRef = useRef(handle);
  handleRef.current = handle;

  useEffect(() => {
    if (!registry || !key) return;
    // Proxy stable : le handle réel peut changer à chaque rendu.
    const proxy = new Proxy({} as AnyHandle, {
      get(_t, prop) {
        return (handleRef.current as unknown as Record<PropertyKey, unknown>)[prop];
      },
    });
    return registry.register(key, proxy);
  }, [registry, key]);
}

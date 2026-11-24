"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { GAME_CONFIG } from "@/config/gameConfig";
import { MotionCard } from "@/components/cards/MotionCard";
import type { DealOrigin } from "@/components/cards/PlayCard";
import { useRegisterZone, type HandHighlightStyle, type ZoneKey } from "@/components/table/zones/ZoneRegistry";
import { elementCenter, elementScale } from "@/components/table/zones/zonePose";
import { fanPose, fanRestLift } from "@/engine/anim/v2/pose";
import type { PanInfo } from "motion/react";
import type { Card } from "@/types/game";
import styles from "./Fan.module.css";

/* ═══════════════ FILE: components/table/Fan.tsx ═══════════════
   Éventail générique : le siège fait pivoter l'éventail entier,
   donc le même composant sert pour le bas, la gauche, le haut, la droite.
   - Distribution réelle : mesure le vecteur exact (pioche centrale → chaque
     carte) dans le repère pivoté du siège pour un vol 100% GPU sans lag.
   - Clé React stable (`card.id`) : aucun démontage/remontage de la main
     quand une carte est jouée.
   - Glisser-déposer ou glisser vers le haut fluide sur mobile & desktop. */
interface FanProps {
  cards: Card[];
  w: number;
  faceUp: boolean;
  seatIdx: number;
  seatAngle?: number;
  playerCount: number;
  dealing: boolean;
  /** Rythme de la donne de la partie (défaut : celui du jeu). */
  dealPerCardMs?: number;
  dealFlightMs?: number;
  legal: number[] | null;
  onCardClick: (cardIdx: number) => void;
  /** Vrai si les animations sont activées (drag + hover). */
  motionOn?: boolean;
  /** Rect de la zone de dépôt cible (viewport) pour le hit-test du drag. */
  getDropRect?: () => DOMRect | null;
  /** Rect de la pioche centrale (viewport) pour faire partir la donne du paquet. */
  getDeckRect?: () => DOMRect | null;
  /** Notifie la table quand le joueur glisse une carte (illumine le dépôt cible). */
  onDragActive?: (active: boolean) => void;
  /** Vrai quand ce siège adverse est en surbrillance pour son tour (lueur + vague de réflexion). */
  activeTurn?: boolean;
  /** Vrai au 5e pli décisif (Ngata) : teinte or-rubis sur la lueur adverse. */
  finalTrick?: boolean;
}

/** Le point (viewport) est-il à l'intérieur du rect, avec une marge tolérante ? */
function pointInside(point: { x: number; y: number }, r: DOMRect, pad = 92): boolean {
  return (
    point.x >= r.left - pad &&
    point.x <= r.right + pad &&
    point.y >= r.top - pad &&
    point.y <= r.bottom + pad
  );
}

const HIGHLIGHT_CLASS: Record<HandHighlightStyle, string> = {
  recommend: "nj-recommended-card",
  swapped: "nj-swapped-card",
  locked: "nj-locked-card",
  boosted: "nj-boosted-card",
};

interface HandHighlight {
  style: HandHighlightStyle;
  cardIdx?: number;
  cardIds?: string[];
}

interface HandSelection {
  filter: (card: Card, cardIdx: number) => boolean;
  onPick: (cardIdx: number) => void;
}

export const Fan = memo(function Fan({
  cards,
  w,
  faceUp,
  seatIdx,
  seatAngle = 0,
  playerCount,
  dealing,
  dealPerCardMs = GAME_CONFIG.anim.dealPerCard,
  dealFlightMs = GAME_CONFIG.anim.dealFlight,
  legal,
  onCardClick,
  motionOn = true,
  getDropRect,
  getDeckRect,
  onDragActive,
  activeTurn = false,
  finalTrick = false,
}: FanProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState<HandHighlight | null>(null);
  const [hiddenIndexes, setHiddenIndexes] = useState<Set<number>>(() => new Set());
  const [selection, setSelection] = useState<HandSelection | null>(null);
  const [dealOrigins, setDealOrigins] = useState<DealOrigin[] | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionRef = useRef<HandSelection | null>(null);
  /* Modèles d'animation (phase G) : éventail qui se resserre / s'écarte, cartes assombries ou cachées un instant. */
  const [collapsed, setCollapsed] = useState<{ ids: Set<string>; ms: number }>(() => ({ ids: new Set(), ms: 0 }));
  const [room, setRoom] = useState<{ count: number; ms: number }>({ count: 0, ms: 0 });
  const [dimKeep, setDimKeep] = useState<Set<string> | null>(null);
  const [tempHidden, setTempHidden] = useState<Set<string>>(() => new Set());
  const motifTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const later = (ms: number, fn: () => void) => { motifTimers.current.push(setTimeout(fn, ms)); };
  const idsOf = (idxs: number[]) => idxs.map((i) => cardsRef.current[i]?.id).filter((id): id is string => !!id);
  useEffect(() => () => motifTimers.current.forEach(clearTimeout), []);
  // Le nouvel état de la main remplace immédiatement l'écartement / le resserrement /
  // le masquage provisoire (synchrone avant paint, y compris pour les IDs synthétiques
  // `hidden-<uid>-0..n` des adversaires qui se réindexent à 0).
  const handKey = cards.map((card) => card.id).join(",");
  useLayoutEffect(() => {
    setRoom((current) => (current.count ? { count: 0, ms: 0 } : current));
    setCollapsed((current) => (current.ids.size ? { ids: new Set(), ms: 0 } : current));
    setHiddenIndexes((current) => (current.size ? new Set() : current));
  }, [handKey]);

  const cardRect = useCallback((cardIdx: number): DOMRect | null => {
    const children = rootRef.current?.children;
    if (!children || children.length === 0) return rootRef.current?.getBoundingClientRect() ?? null;
    const clamped = Math.max(0, Math.min(children.length - 1, cardIdx));
    const el = children[clamped] as HTMLElement | undefined;
    return el?.getBoundingClientRect() ?? rootRef.current?.getBoundingClientRect() ?? null;
  }, []);

  useRegisterZone(`hand:${seatIdx}` as ZoneKey, {
    getRect: () => rootRef.current?.getBoundingClientRect() ?? null,
    getElement: () => rootRef.current,
    getCardRect: cardRect,
    highlightCards: ({ cardIdx, cardIds, style, durationMs }) => {
      setHighlight({ style, cardIdx, cardIds });
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => {
        setHighlight(null);
        highlightTimerRef.current = null;
      }, durationMs);
    },
    setHiddenCard: (cardIdx: number | null) =>
      setHiddenIndexes(cardIdx == null ? new Set() : new Set([cardIdx])),
    setHiddenCards: (cardIdxs: number[]) => setHiddenIndexes(new Set(cardIdxs)),
    beginSelection: (filter: HandSelection["filter"], onPick: HandSelection["onPick"]) => {
      const sel: HandSelection = { filter, onPick };
      selectionRef.current = sel;
      setSelection(sel);
      return () => {
        if (selectionRef.current === sel) {
          selectionRef.current = null;
          setSelection(null);
        }
      };
    },
    cardCount: () => cardsRef.current.length,
    getCardSlot: (cardIdx: number) => {
      const root = rootRef.current;
      const el = root?.children[cardIdx] as HTMLElement | undefined;
      if (!root || !el) return null;
      const box = el.getBoundingClientRect();
      const rootBox = root.getBoundingClientRect();
      // Échelle des ancêtres (sièges à 0°, 90°, 180° ou 270° : l'aire est conservée).
      const scale = Math.sqrt((rootBox.width * rootBox.height) / Math.max(1, root.offsetWidth * root.offsetHeight));
      const total = root.children.length;
      return { x: box.left + box.width / 2, y: box.top + box.height / 2, width: el.offsetWidth * scale, rotate: seatAngle + (cardIdx - (total - 1) / 2) * 8 };
    },
    collapseCards: (cardIdxs: number[], durationMs: number) => {
      const ids = idsOf(cardIdxs);
      setCollapsed((current) => ({ ids: new Set([...current.ids, ...ids]), ms: durationMs }));
      // Filet de sécurité si l'état de la main n'arrive jamais.
      later(6000, () => setCollapsed((current) => ({ ids: new Set([...current.ids].filter((id) => !ids.includes(id))), ms: current.ms })));
    },
    makeRoom: (count: number, durationMs: number) => {
      setRoom({ count, ms: durationMs });
      later(durationMs + 2500, () => setRoom((current) => (current.count === count ? { count: 0, ms: 0 } : current)));
    },
    dimCards: (keepIdxs: number[], durationMs: number) => {
      setDimKeep(new Set(idsOf(keepIdxs)));
      later(durationMs, () => setDimKeep(null));
    },
    hideCardsFor: (cardIdxs: number[], durationMs: number) => {
      const ids = idsOf(cardIdxs);
      setTempHidden((current) => new Set([...current, ...ids]));
      later(durationMs, () => setTempHidden((current) => new Set([...current].filter((id) => !ids.includes(id)))));
    },
    // Animation V2 : même calcul que le rendu ci-dessous (écart de w/2, rotation de 8° par carte, soulèvement).
    poseOf: (cardIdx: number, count?: number) => {
      const root = rootRef.current;
      if (!root) return null;
      const n = count ?? cardsRef.current.length;
      const scale = elementScale(root, seatAngle);
      // Disposition actuelle : une carte jouable est soulevée ; ailleurs, soulèvement au repos.
      const current = n === cardsRef.current.length;
      const lift = (index: number, total: number) =>
        (current && faceUp && legal?.includes(index) ? -w * 0.24 : fanRestLift(index, total)) * scale;
      return fanPose({ center: elementCenter(root), axis: seatAngle, cardWidth: w * scale, step: (w / 2) * scale, rotStep: 8, face: faceUp ? 0 : 180, lift }, cardIdx, n);
    },
  });

  /* Mesure exacte (avant le 1er paint de la donne) du vecteur pioche → chaque
     carte, converti dans le repère local du siège pivoté par `seatAngle`. */
  useLayoutEffect(() => {
    if (!dealing || cards.length === 0) {
      setDealOrigins(null);
      return;
    }
    const root = rootRef.current;
    const deckRect = getDeckRect?.() ?? null;
    if (!root || !deckRect) {
      setDealOrigins(null);
      return;
    }
    const deckCx = deckRect.left + deckRect.width / 2;
    const deckCy = deckRect.top + deckRect.height / 2;
    const rad = (seatAngle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const scale = Math.max(0.45, Math.min(1.05, deckRect.width / Math.max(24, w)));
    const rootRect = root.getBoundingClientRect();

    const origins: DealOrigin[] = cards.map((_, ci) => {
      const child = root.children[ci] as HTMLElement | undefined;
      const box = child?.getBoundingClientRect() ?? rootRect;
      const wx = deckCx - (box.left + box.width / 2);
      const wy = deckCy - (box.top + box.height / 2);
      return {
        dx: wx * cos + wy * sin,
        dy: -wx * sin + wy * cos,
        scale,
      };
    });
    setDealOrigins(origins);
  }, [dealing, cards.length, getDeckRect, seatAngle, w]);

  // Aligne immédiatement l'éventail sur les cartes restantes dès qu'une carte
  // quitte la main (pendant son vol), avant même le retrait du focus.
  const visibleCount = cards.reduce((acc, card) => acc + (collapsed.ids.has(card.id) ? 0 : 1), 0);
  const c = (Math.max(1, visibleCount) - 1) / 2;
  let visibleCursor = 0;
  const oppRootClass = !faceUp
    ? activeTurn
      ? finalTrick
        ? styles.oppFanNgata
        : styles.oppFanActive
      : styles.oppFanIdle
    : undefined;
  return (
    <div
      ref={rootRef}
      className={oppRootClass}
      role={faceUp ? "group" : undefined}
      aria-label={faceUp ? `Votre main, ${cards.length} cartes` : undefined}
      aria-hidden={faceUp ? undefined : true}
      data-opp-turn={!faceUp && activeTurn ? "true" : undefined}
      style={{ display: "flex", pointerEvents: faceUp ? "auto" : "none" }}
    >
      {cards.map((card, ci) => {
        const selectable = selection ? selection.filter(card, ci) : false;
        const playable = selection ? selectable : faceUp && legal?.includes(ci);
        const draggable = !selection && !!playable && motionOn && !dealing;
        const highlighted =
          highlight != null &&
          (highlight.cardIdx === ci || (highlight.cardIds?.includes(card.id) ?? false));
        const handleTap = selection
          ? selectable
            ? () => selection.onPick(ci)
            : undefined
          : playable
            ? () => onCardClick(ci)
            : undefined;
        const isCollapsed = collapsed.ids.has(card.id);
        const slotIdx = isCollapsed ? Math.min(visibleCursor, Math.max(0, visibleCount - 1)) : visibleCursor++;
        const oppCardClass = !faceUp
          ? activeTurn && !dealing
            ? [
                styles.oppCardActive,
                finalTrick ? styles.oppCardNgata : "",
                !motionOn ? styles.oppStatic : "",
              ].filter(Boolean).join(" ")
            : styles.oppCardIdle
          : undefined;
        const cardClassName = [
          highlighted ? HIGHLIGHT_CLASS[highlight.style] : "",
          oppCardClass ?? "",
        ].filter(Boolean).join(" ") || undefined;
        return (
          <MotionCard
            key={card.id}
            className={cardClassName}
            card={card}
            hidden={!faceUp}
            w={w}
            rot={(slotIdx - c) * 8}
            lift={playable ? -w * 0.24 : Math.pow(Math.abs(slotIdx - c), 1.5) * 4}
            dim={(faceUp && ((selection != null && !selectable) || (selection == null && legal != null && !playable))) || (dimKeep != null && !dimKeep.has(card.id))}
            glow={!!playable}
            onClick={handleTap}
            dealDelay={dealing ? (ci * playerCount + seatIdx) * dealPerCardMs : null}
            dealDuration={dealFlightMs}
            dealOrigin={dealing ? (dealOrigins?.[ci] ?? null) : null}
            style={{
              // Carte partie (modèle d'animation) : elle ne prend plus de place, l'éventail se resserre.
              marginLeft: isCollapsed ? (ci === 0 ? -(w * 0.5) : -w) : ci === 0 ? 0 : -(w * 0.5),
              visibility: hiddenIndexes.has(ci) || tempHidden.has(card.id) ? "hidden" : "visible",
              transition: dealing ? undefined : `margin-left ${isCollapsed ? collapsed.ms : 180}ms cubic-bezier(.22,1,.36,1)`,
              ...(!faceUp ? { "--opp-idx": ci } : {}),
            } as CSSProperties}
            anim={
              draggable
                ? {
                    drag: true,
                    dragSnapToOrigin: true,
                    dragElastic: 0.45,
                    whileHover: { y: -w * 0.16, scale: 1.05 },
                    whileTap: { scale: 1.04 },
                    whileDrag: { scale: 1.14, zIndex: 200 },
                    onDragStart: () => onDragActive?.(true),
                    onDragEnd: (_e: unknown, info: PanInfo) => {
                      onDragActive?.(false);
                      const r = getDropRect?.();
                      const swipedUp = info.offset.y < -62;
                      if (swipedUp || (r && pointInside(info.point, r))) {
                        onCardClick(ci);
                      }
                    },
                  }
                : playable
                  ? { whileTap: { scale: 1.04 } }
                  : undefined
            }
          />
        );
      })}
      {/* Places réservées aux cartes qui arrivent (modèle d'animation) : l'éventail s'écarte en douceur. */}
      {Array.from({ length: room.count }, (_, j) => (
        <div
          key={`room-${j}`}
          aria-hidden="true"
          ref={(el) => {
            if (!el || el.dataset.grown) return;
            el.dataset.grown = "1";
            el.animate([{ marginLeft: `${-w}px` }, { marginLeft: `${-w * 0.5}px` }], { duration: room.ms, easing: "cubic-bezier(.22,1,.36,1)" });
          }}
          style={{ flex: "0 0 auto", width: w, height: w * 1.45, marginLeft: -(w * 0.5), visibility: "hidden", pointerEvents: "none" }}
        />
      ))}
    </div>
  );
});

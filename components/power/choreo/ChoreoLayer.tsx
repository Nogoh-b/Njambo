"use client";

/* Calque des chorégraphies : couche fixe au-dessus de la table où naissent
   les cartes volantes (vrai rendu PlayCard, recto + verso pour les
   retournements 3D), textes et effets superposés. Piloté impérativement par
   playChoreography (Web Animations API, transform/opacity uniquement). */

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { PlayCard } from "@/components/cards/PlayCard";
import type { Card } from "@/types/game";

export interface ChoreoSprite {
  id: string;
  card: Card | null;
  width: number;
}

export interface ChoreoLayerHandle {
  /** Crée une carte volante et renvoie ses éléments (racine + pivot 3D) une fois montée. */
  spawnCard(sprite: ChoreoSprite): Promise<{ root: HTMLElement; flipper: HTMLElement } | null>;
  removeCard(id: string): void;
  /** Conteneur pour les éléments créés en DOM direct (textes, effets). */
  container(): HTMLElement | null;
  clear(): void;
}

const ghostCard = (id: string): Card => ({ id, rank: "?", value: 0, suit: "♠", color: "#1e1e1e" });

export const ChoreoLayer = forwardRef<ChoreoLayerHandle, { zIndex?: number }>(function ChoreoLayer({ zIndex = 70 }, ref) {
  const [sprites, setSprites] = useState<ChoreoSprite[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const waiters = useRef(new Map<string, (els: { root: HTMLElement; flipper: HTMLElement } | null) => void>());
  const elements = useRef(new Map<string, { root: HTMLElement; flipper: HTMLElement }>());

  const register = useCallback((id: string, root: HTMLDivElement | null) => {
    if (!root) { elements.current.delete(id); return; }
    const flipper = root.firstElementChild as HTMLElement | null;
    if (!flipper) return;
    const els = { root, flipper };
    elements.current.set(id, els);
    waiters.current.get(id)?.(els);
    waiters.current.delete(id);
  }, []);

  useImperativeHandle(ref, () => ({
    spawnCard: (sprite) => new Promise((resolve) => {
      const existing = elements.current.get(sprite.id);
      if (existing) { resolve(existing); return; }
      waiters.current.set(sprite.id, resolve);
      setSprites((current) => [...current.filter((item) => item.id !== sprite.id), sprite]);
      // Sécurité : jamais d'attente infinie si le rendu n'a pas lieu.
      setTimeout(() => { waiters.current.get(sprite.id)?.(null); waiters.current.delete(sprite.id); }, 1500);
    }),
    removeCard: (id) => setSprites((current) => current.filter((item) => item.id !== id)),
    container: () => rootRef.current,
    clear: () => {
      setSprites([]);
      rootRef.current?.querySelectorAll("[data-choreo-fx]").forEach((node) => node.remove());
    },
  }), []);

  return (
    <div ref={rootRef} aria-hidden="true" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex, perspective: 900 }}>
      {sprites.map((sprite) => (
        <div
          key={sprite.id}
          ref={(el) => register(sprite.id, el)}
          style={{ position: "absolute", left: 0, top: 0, width: sprite.width, height: sprite.width * 1.45, willChange: "transform, opacity", transformStyle: "preserve-3d" }}
        >
          <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d" }}>
            <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden" }}>
              <PlayCard card={sprite.card ?? ghostCard(sprite.id)} w={sprite.width} hidden={!sprite.card} />
            </div>
            <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
              <PlayCard hidden w={sprite.width} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});

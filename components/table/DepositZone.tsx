"use client";

import { memo, forwardRef, useRef, useState } from "react";
import { PlayCard } from "@/components/cards/PlayCard";
import { NjamboIcon } from "@/components/ui/Art";
import { useRegisterZone, type ZoneKey } from "@/components/table/zones/ZoneRegistry";
import type { DepositedCard } from "@/types/game";

/* ═══════════════ FILE: components/table/DepositZone.jsx ═══════════════
   Le dépôt du joueur, posé sur le feutre, face à son siège.
   Chaque carte garde l'angle avec lequel elle a été « jetée ».
   Expose un DepositHandle (registre de zones) : rects + mode sélection
   (clic générique des pouvoirs, ex. « récupère une carte du dépôt »). */
interface DepositZoneProps {
  deposit: DepositedCard[];
  w: number;
  active: boolean;
  isDominant: boolean;
  effects?: boolean;
  /** Siège (pour l'enregistrement de zone). */
  seatIdx?: number;
}

interface DepositSelection {
  filter: (card: DepositedCard, cardIdx: number) => boolean;
  onPick: (cardIdx: number) => void;
}

export const DepositZone = memo(forwardRef<HTMLDivElement, DepositZoneProps>(function DepositZone(
  { deposit, w, active, isDominant, effects = true, seatIdx },
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const topCardRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [selection, setSelection] = useState<DepositSelection | null>(null);
  const selectionRef = useRef<DepositSelection | null>(null);

  useRegisterZone(seatIdx !== undefined ? (`deposit:${seatIdx}` as ZoneKey) : undefined, {
    getRect: () => rootRef.current?.getBoundingClientRect() ?? null,
    getTopCardRect: () =>
      topCardRef.current?.getBoundingClientRect() ??
      rootRef.current?.getBoundingClientRect() ??
      null,
    getCardRect: (cardIdx: number) =>
      cardRefs.current[cardIdx]?.getBoundingClientRect() ??
      rootRef.current?.getBoundingClientRect() ??
      null,
    beginSelection: (filter: DepositSelection["filter"], onPick: DepositSelection["onPick"]) => {
      const sel: DepositSelection = { filter, onPick };
      selectionRef.current = sel;
      setSelection(sel);
      return () => {
        if (selectionRef.current === sel) {
          selectionRef.current = null;
          setSelection(null);
        }
      };
    },
  });

  const h = w * 1.45;
  return (
    <div
      ref={(el) => {
        rootRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      style={{
        position: "relative",
        width: w * 1.7,
        height: h * 1.15,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* marque du dépôt sur le feutre */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(0,0,0,.28), transparent 70%)",
        }}
      />
      {deposit.map((c, i) => {
        const top = i === deposit.length - 1;
        const selectable = selection ? selection.filter(c, i) : false;
        return (
          // Conteneur = positionnement figé (translate/rotate du « jeté »).
          <div
            key={c.id + i}
            ref={(el) => {
              cardRefs.current[i] = el;
              if (top) topCardRef.current = el;
            }}
            onClick={selectable ? () => selection?.onPick(i) : undefined}
            style={{
              position: "absolute",
              transform: `translate(${c.dx || 0}px, ${c.dy || 0}px) rotate(${c.dropRot || 0}deg)`,
              cursor: selectable ? "pointer" : undefined,
              opacity: selection && !selectable ? 0.5 : 1,
              pointerEvents: selection ? "auto" : undefined,
            }}
          >
            {/* Wrapper interne = pose (landPop) : n'écrase PAS le positionnement. */}
            <div
              className={effects && top ? "nj-deposit-card-landed" : undefined}
              style={{ animation: effects && top ? "landPop .28s both" : "none" }}
            >
              <PlayCard card={c} w={w} glow={(effects && top && active) || selectable} />
              {/* Badge de boost : rend visible l'effet d'une carte pouvoir
                 (valeur augmentée / couleur changée) sur la carte jouée. */}
              {effects && c.powerTag && (c.effectiveValue != null || c.effectiveSuit) && (
                <div className="nj-deposit-power-tag" aria-label="Carte boostée">
                  <NjamboIcon name="spark" tone="gold" size={10} />
                  <span>
                    {c.effectiveValue != null && c.effectiveValue !== c.value
                      ? c.effectiveValue
                      : (c.effectiveSuit ?? "")}
                  </span>
                </div>
              )}
              {top && isDominant && (
                <div
                  style={{
                    position: "absolute",
                    top: -18,
                    left: "50%",
                    transform: "translateX(-50%)",
                    fontSize: 17,
                    filter: "drop-shadow(0 1px 3px #000)",
                    animation: effects ? "crownPop .35s both" : "none",
                  }}
                >
                  <NjamboIcon name="crown" tone="gold" size={22} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}));

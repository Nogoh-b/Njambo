"use client";

import { memo, forwardRef, useRef, useState } from "react";
import { PlayCard } from "@/components/cards/PlayCard";
import { NjamboIcon } from "@/components/ui/Art";
import { useRegisterZone, type ZoneKey } from "@/components/table/zones/ZoneRegistry";
import type { DepositedCard } from "@/types/game";

/* ═══════════════ DepositZone — Emplacement gravé sur le feutre ═══════════════
   Le dépôt du joueur, posé sur le feutre, face à son siège.
   Expose un DepositHandle (registre de zones) : rects + mode sélection. */
interface DepositZoneProps {
  deposit: DepositedCard[];
  w: number;
  active: boolean;
  isDominant: boolean;
  /** Vrai quand le joueur glisse une carte jouable vers son dépôt. */
  dropReady?: boolean;
  effects?: boolean;
  /** Siège (pour l'enregistrement de zone). */
  seatIdx?: number;
}

interface DepositSelection {
  filter: (card: DepositedCard, cardIdx: number) => boolean;
  onPick: (cardIdx: number) => void;
}

export const DepositZone = memo(forwardRef<HTMLDivElement, DepositZoneProps>(function DepositZone(
  { deposit, w, active, isDominant, dropReady = false, effects = true, seatIdx },
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
        width: w * 1.55,
        height: h * 1.15,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "visible",
      }}
    >
      {/* Marque gravée dans le feutre + halo doré royal quand dominant ou cible de glisser-déposer */}
      <div
        style={{
          position: "absolute",
          inset: "6% 10%",
          borderRadius: 14,
          border: dropReady
            ? "2px dashed #6df9c8"
            : isDominant
              ? "2px solid rgba(255, 220, 96, 0.88)"
              : active
                ? "1px solid rgba(255, 224, 130, 0.34)"
                : "1px dashed rgba(255, 232, 168, 0.16)",
          background: dropReady
            ? "radial-gradient(ellipse, rgba(62, 228, 178, 0.28), rgba(16, 110, 86, 0.14) 64%, transparent 84%)"
            : isDominant
              ? "radial-gradient(ellipse, rgba(255, 212, 74, 0.36), rgba(242, 187, 69, 0.12) 62%, transparent 84%)"
              : "radial-gradient(ellipse, rgba(0, 0, 0, 0.22), transparent 72%)",
          boxShadow: dropReady
            ? "0 0 26px rgba(62, 228, 178, 0.52), inset 0 0 14px rgba(132, 255, 220, 0.28)"
            : isDominant
              ? "0 0 28px rgba(255, 207, 64, 0.56), inset 0 0 14px rgba(255, 230, 132, 0.24)"
              : "none",
          transition: "border-color 180ms ease, box-shadow 220ms ease, background 220ms ease",
          pointerEvents: "none",
        }}
      />

      {deposit.map((c, i) => {
        const top = i === deposit.length - 1;
        const selectable = selection ? selection.filter(c, i) : false;
        const dropRot = c.dropRot || 0;
        const showCrown = top && isDominant;
        const cardRadius = Math.max(8, w * 0.14);
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
              transform: `translate3d(${c.dx || 0}px, ${c.dy || 0}px, 0) rotate(${dropRot}deg)`,
              cursor: selectable ? "pointer" : undefined,
              opacity: selection && !selectable ? 0.5 : 1,
              pointerEvents: selection ? "auto" : undefined,
              zIndex: showCrown ? 6 : top ? 3 : 1,
            }}
          >
            {/* Wrapper interne = pose (landPop) : n'écrase PAS le positionnement. */}
            <div
              className={effects && top ? "nj-deposit-card-landed" : undefined}
              style={{
                position: "relative",
                borderRadius: cardRadius,
                boxShadow: showCrown
                  ? "0 0 0 2.5px #ffe168, 0 0 22px rgba(255, 207, 64, 0.78), 0 8px 18px rgba(0, 0, 0, 0.52)"
                  : top
                    ? "0 6px 14px rgba(0, 0, 0, 0.44)"
                    : undefined,
                animation: effects && top ? "landPop .24s cubic-bezier(.22,1.15,.36,1) both" : "none",
              }}
            >
              <PlayCard card={c} w={w} glow={(effects && top && (active || isDominant)) || selectable} />
              {/* Badge de boost : rend visible l'effet d'une carte pouvoir */}
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
              {/* Couronne royale bien visible et jamais coupée au-dessus de la carte dominante */}
              {showCrown && (
                <div
                  aria-label="Carte dominante du pli"
                  style={{
                    position: "absolute",
                    top: -22,
                    left: "50%",
                    zIndex: 25,
                    pointerEvents: "none",
                    transform: "translateX(-50%)",
                    animation: effects ? "crownPop .34s cubic-bezier(.2,1.35,.36,1) both" : "none",
                  }}
                >
                  <div
                    style={{
                      transform: `rotate(${-dropRot}deg)`,
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        placeItems: "center",
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background:
                          "radial-gradient(circle at 36% 26%, #663812 0%, #2c1406 66%, #140802 100%)",
                        border: "2.2px solid #ffe878",
                        boxShadow:
                          "0 4px 12px rgba(0, 0, 0, 0.8), 0 0 18px rgba(255, 212, 64, 0.92), 0 0 0 3px rgba(255, 216, 84, 0.24), inset 0 1px 0 rgba(255, 250, 216, 0.72)",
                        animation: effects ? "dominantCrownFloat 2.1s ease-in-out infinite" : "none",
                      }}
                    >
                      <svg
                        width="23"
                        height="23"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <defs>
                          <linearGradient id={`depCrownGold-${seatIdx ?? 0}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#fffbe0" />
                            <stop offset="44%" stopColor="#ffda54" />
                            <stop offset="100%" stopColor="#d98a10" />
                          </linearGradient>
                        </defs>
                        <path
                          d="M2.8 18L1.8 8.2L7.6 12.2L12 4.6L16.4 12.2L22.2 8.2L21.2 18C21.1 19.1 20.1 20 19 20H5C3.9 20 2.9 19.1 2.8 18Z"
                          fill={`url(#depCrownGold-${seatIdx ?? 0})`}
                          stroke="#fff8cc"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                        <rect x="4.6" y="16.8" width="14.8" height="2" rx="1" fill="#8f4f05" opacity="0.5" />
                        <circle cx="12" cy="3.9" r="1.6" fill="#fffbe0" />
                        <circle cx="2.1" cy="7.5" r="1.25" fill="#ffe680" />
                        <circle cx="21.9" cy="7.5" r="1.25" fill="#ffe680" />
                        <circle cx="12" cy="14" r="1.45" fill="#ff4772" stroke="#fff6cc" strokeWidth="0.7" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}));

"use client";

import { memo, forwardRef } from "react";
import { PlayCard } from "@/components/cards/PlayCard";
import { NjamboIcon } from "@/components/ui/Art";
import type { DepositedCard } from "@/types/game";

/* ═══════════════ FILE: components/table/DepositZone.jsx ═══════════════
   Le dépôt du joueur, posé sur le feutre, face à son siège.
   Chaque carte garde l'angle avec lequel elle a été « jetée ».
   Le sweeping/sweepCard est remplacé par un gold flash sur le feutre (géré par TableScreen). */
interface DepositZoneProps {
  deposit: DepositedCard[];
  w: number;
  active: boolean;
  isDominant: boolean;
  effects?: boolean;
}

export const DepositZone = memo(forwardRef<HTMLDivElement, DepositZoneProps>(function DepositZone(
  { deposit, w, active, isDominant, effects = true },
  ref,
) {
  const h = w * 1.45;
  return (
    <div
      ref={ref}
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
        return (
          // Conteneur = positionnement figé (translate/rotate du « jeté »).
          <div
            key={c.id + i}
            style={{
              position: "absolute",
              transform: `translate(${c.dx || 0}px, ${c.dy || 0}px) rotate(${c.dropRot || 0}deg)`,
            }}
          >
            {/* Wrapper interne = pose (landPop) : n'écrase PAS le positionnement. */}
            <div
              className={effects && top ? "nj-deposit-card-landed" : undefined}
              style={{ animation: effects && top ? "landPop .28s both" : "none" }}
            >
              <PlayCard card={c} w={w} glow={effects && top && active} />
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

"use client";

import { forwardRef } from "react";
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
}

export const DepositZone = forwardRef<HTMLDivElement, DepositZoneProps>(function DepositZone(
  { deposit, w, active, isDominant },
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
          <div
            key={c.id + i}
            style={{
              position: "absolute",
              transform: `translate(${c.dx || 0}px, ${c.dy || 0}px) rotate(${c.dropRot || 0}deg)`,
              animation: top ? "landPop .28s both" : "none",
            }}
          >
            <div>
              <PlayCard card={c} w={w} glow={top && active} />
              {top && isDominant && (
                <div
                  style={{
                    position: "absolute",
                    top: -18,
                    left: "50%",
                    transform: "translateX(-50%)",
                    fontSize: 17,
                    filter: "drop-shadow(0 1px 3px #000)",
                    animation: "crownPop .35s both",
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
});

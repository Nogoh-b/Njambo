"use client";

/* ═══════════════ PowerTargetModal — choix de cible générique ═══════════════
   Étape 1 du schéma d'activation : « on attend le choix du joueur sur qui ça
   s'applique ». Pilotée par le TargetSpec du script (extraction de la modale
   inline de TableScreen) — même UI pour toutes les cartes ciblées. */

import { memo } from "react";
import { Avatar } from "@/components/table/Avatar";
import { PowerCardView } from "@/components/power/PowerCardView";
import { displayFont } from "@/components/ui/Shell";
import { POWER_CARDS_BY_ID } from "@/config/powerCards";
import { T } from "@/config/theme";
import type { Player, PowerCardId } from "@/types/game";

interface PowerTargetModalProps {
  cardId: PowerCardId;
  /** Joueurs en ordre UI (0 = moi — exclu des cibles par défaut). */
  players: Player[];
  turnSeconds: number;
  allowSelf?: boolean;
  onPick: (uiIdx: number) => void;
  onCancel: () => void;
}

export const PowerTargetModal = memo(function PowerTargetModal({
  cardId,
  players,
  turnSeconds,
  allowSelf = false,
  onPick,
  onCancel,
}: PowerTargetModalProps) {
  const cardDef = POWER_CARDS_BY_ID[cardId];
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(3, 10, 8, 0.78)",
        backdropFilter: "blur(4px)",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "radial-gradient(ellipse 85% 42% at 50% 0%, rgba(255, 207, 64, 0.14), transparent 62%), linear-gradient(168deg, #1b2d26 0%, #0d1814 58%, #09110e 100%)",
          border: "1.5px solid rgba(255, 214, 96, 0.48)",
          borderRadius: 22,
          padding: 18,
          maxWidth: 320,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 24px 54px rgba(0, 0, 0, 0.68), 0 0 28px rgba(255, 207, 64, 0.16)",
        }}
      >
        {cardDef && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            <PowerCardView card={cardDef} compact showMeta={false} />
          </div>
        )}
        <div style={{ ...displayFont, fontWeight: 900, fontSize: 18, marginBottom: 2 }}>
          {cardDef?.name}
        </div>
        <div className="nj-subtle" style={{ fontSize: 13, marginBottom: 14 }}>Choisis une cible</div>
        <div style={{ display: "grid", gap: 8 }}>
          {players.map((p, i) => {
            if (i === 0 && !allowSelf) return null;
            return (
              <button data-nj-skin="dark"
                key={"tgt" + p.name}
                type="button"
                onClick={() => onPick(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: `1.5px solid ${T.pink}66`,
                  background: "rgba(216,60,104,.14)",
                  color: T.text,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                <Avatar p={p} active={false} seconds={0} turnSeconds={turnSeconds} size={34} />
                <span>{p.name}</span>
              </button>
            );
          })}
        </div>
        <button data-nj-skin="dark"
          type="button"
          onClick={onCancel}
          style={{
            marginTop: 14,
            padding: "8px 16px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,.2)",
            background: "transparent",
            color: T.muted,
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Annuler
        </button>
      </div>
    </div>
  );
});

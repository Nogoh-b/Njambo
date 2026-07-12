"use client";

/* ═══════════════ PowerTargetModal — choix de cible générique ═══════════════
   Étape 1 du schéma d'activation : « on attend le choix du joueur sur qui ça
   s'applique ». Pilotée par le TargetSpec du script (extraction de la modale
   inline de TableScreen) — même UI pour toutes les cartes ciblées. */

import { memo } from "react";
import { Avatar } from "@/components/table/Avatar";
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
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(5,5,12,.72)",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: `linear-gradient(160deg, ${T.night3}, ${T.night1})`,
          border: `1.5px solid ${T.gold}55`,
          borderRadius: 18,
          padding: 18,
          maxWidth: 320,
          width: "100%",
          textAlign: "center",
        }}
      >
        <div style={{ ...displayFont, fontWeight: 900, fontSize: 18, marginBottom: 2 }}>
          {POWER_CARDS_BY_ID[cardId]?.name}
        </div>
        <div className="nj-subtle" style={{ fontSize: 13, marginBottom: 14 }}>Choisis une cible</div>
        <div style={{ display: "grid", gap: 8 }}>
          {players.map((p, i) => {
            if (i === 0 && !allowSelf) return null;
            return (
              <button
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
        <button
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

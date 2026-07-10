"use client";

import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { POWER_CARDS_BY_ID, MAX_EQUIPPED_POWERS } from "@/config/powerCards";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";

/* ═══════════════ EquippedPowersBar — slots d'équipement pré-partie ═══════════════
   Affiche les 2 slots de cartes pouvoir équipées. Tape pour ouvrir la
   collection et modifier l'équipement. Réutilisé par les écrans de setup. */

export function EquippedPowersBar() {
  const { navigateTo, profile } = useGame();
  const equipped = profile.equippedPowers ?? [];
  const slots = Array.from({ length: MAX_EQUIPPED_POWERS }, (_, i) => equipped[i]);

  return (
    <button
      type="button"
      onClick={() => navigateTo("power_collection")}
      aria-label="Équiper des cartes pouvoir"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "10px 12px",
        borderRadius: 14,
        border: "1px solid rgba(255,248,232,.14)",
        background: "rgba(10,6,26,.35)",
        color: T.text,
        cursor: "pointer",
      }}
    >
      <span style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
        {slots.map((id, i) => {
          const def = id ? POWER_CARDS_BY_ID[id] : null;
          const tint = def
            ? def.tone === "gold" ? T.gold : def.tone === "teal" ? T.teal : def.tone === "pink" ? T.pink : T.cobalt
            : T.muted;
          return (
            <span
              key={i}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                border: `1.5px ${def ? "solid" : "dashed"} ${def ? tint : "rgba(255,248,232,.25)"}`,
                background: def ? `${tint}22` : "transparent",
                display: "grid",
                placeItems: "center",
              }}
            >
              {def
                ? <NjamboIcon name={def.icon as NjamboIconName} tone={def.tone} size={22} />
                : <NjamboIcon name="plus" tone="light" size={18} />}
            </span>
          );
        })}
      </span>
      <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <span style={{ display: "block", fontWeight: 900, fontSize: 13 }}>Cartes pouvoir</span>
        <span className="nj-subtle" style={{ fontSize: 12 }}>
          {equipped.length > 0
            ? `${equipped.length}/${MAX_EQUIPPED_POWERS} équipée${equipped.length > 1 ? "s" : ""}`
            : "Touche pour équiper"}
        </span>
      </span>
      <NjamboIcon name="play" tone="gold" size={16} />
    </button>
  );
}

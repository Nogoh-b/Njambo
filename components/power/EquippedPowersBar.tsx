"use client";

import { useGame } from "@/contexts/GameContext";
import { POWER_CARDS_BY_ID, MAX_EQUIPPED_POWERS } from "@/config/powerCards";
import { PowerCardView } from "@/components/power/PowerCardView";
import { NjamboIcon } from "@/components/ui/Art";
import styles from "./EquippedPowersBar.module.css";

/* ═══════════════ EquippedPowersBar — slots d'équipement pré-partie ═══════════════
   Affiche les 2 slots de cartes pouvoir équipées. Tape pour ouvrir la
   collection et modifier l'équipement. Réutilisé par les écrans de setup. */

export function EquippedPowersBar({ tone = "gold" }: { tone?: "gold" | "teal" | "pink" }) {
  const { navigateTo, profile } = useGame();
  const equipped = profile.equippedPowers ?? [];
  const slots = Array.from({ length: MAX_EQUIPPED_POWERS }, (_, i) => equipped[i]);

  return (
    <button
      data-nj-skin="none"
      type="button"
      onClick={() => navigateTo("power_collection")}
      aria-label="Choisir les cartes booster"
      className={`${styles.bar} ${styles[tone]}`}
    >
      <span className={styles.slots} aria-hidden="true">
        {slots.map((id, i) => {
          const def = id ? POWER_CARDS_BY_ID[id] : null;
          return (
            <span key={i} className={`${styles.slot}${def ? ` ${styles.slotFilled}` : ""}`}>
              {def
                ? <PowerCardView card={def} compact showMeta={false} surface="solar" />
                : <span className={styles.emptySlot}><NjamboIcon name="plus" tone={tone} size={18} /></span>}
            </span>
          );
        })}
      </span>
      <span className={styles.copy}>
        <small>Préparation</small>
        <strong>Cartes booster</strong>
        <span>
          {equipped.length > 0
            ? `${equipped.length}/${MAX_EQUIPPED_POWERS} équipée${equipped.length > 1 ? "s" : ""}`
            : "Choisir mes cartes"}
        </span>
      </span>
      <span className={styles.chevron} aria-hidden="true"><NjamboIcon name="play" tone={tone} size={16} /></span>
    </button>
  );
}

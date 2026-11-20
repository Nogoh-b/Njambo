"use client";

/* Profil → « Ma collection » : cosmétiques gagnés (dos de carte, cadres,
   badges, titres), équiper / retirer. Phase 5. */

import { useCallback, useEffect, useState } from "react";
import { COSMETIC_SLOT, type CosmeticDefinition, type CosmeticSlot, type PlayerCosmetics } from "@/domain";
import { backendCallable } from "@/lib/backendCallable";
import styles from "./CosmeticCollection.module.css";

const SLOTS: Array<{ slot: CosmeticSlot; label: string; empty: string }> = [
  { slot: "cardBack", label: "Dos de carte", empty: "Dos classique" },
  { slot: "avatarFrame", label: "Cadre", empty: "Sans cadre" },
  { slot: "badge", label: "Badge", empty: "Sans badge" },
  { slot: "title", label: "Titre", empty: "Sans titre" },
];
const RARITY_LABELS: Record<CosmeticDefinition["rarity"], string> = { commun: "Commun", rare: "Rare", epique: "Épique", legendaire: "Légendaire" };

export function CosmeticCollection() {
  const [owned, setOwned] = useState<CosmeticDefinition[] | null>(null);
  const [equipped, setEquipped] = useState<PlayerCosmetics>({});
  const [slot, setSlot] = useState<CosmeticSlot>("avatarFrame");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await backendCallable<Record<string, unknown>, { owned: CosmeticDefinition[]; equipped: PlayerCosmetics }>("getCosmeticCollection")({});
      setOwned(result.data.owned);
      setEquipped(result.data.equipped);
    } catch {
      setError("Collection indisponible pour le moment.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const equip = async (cosmeticId: string | null) => {
    setBusy(cosmeticId ?? "none");
    setError(null);
    try {
      const result = await backendCallable<Record<string, unknown>, { equipped: PlayerCosmetics }>("equipCosmetic")({ slot, cosmeticId });
      setEquipped(result.data.equipped);
    } catch {
      setError("Impossible d’équiper ce cosmétique.");
    } finally {
      setBusy(null);
    }
  };

  const items = (owned ?? []).filter((item) => COSMETIC_SLOT[item.type] === slot);
  const current = equipped[slot]?.id ?? null;
  const emptyLabel = SLOTS.find((entry) => entry.slot === slot)?.empty ?? "Aucun";

  return (
    <div className={styles.wrap}>
      <div className={styles.tabs} role="tablist">
        {SLOTS.map((entry) => {
          const count = (owned ?? []).filter((item) => COSMETIC_SLOT[item.type] === entry.slot).length;
          return (
            <button key={entry.slot} data-nj-skin="none" type="button" role="tab" aria-selected={slot === entry.slot} className={styles.tab} onClick={() => setSlot(entry.slot)}>
              {entry.label}{count > 0 && <span className={styles.count}>{count}</span>}
            </button>
          );
        })}
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {owned === null ? <p className={styles.hint}>Chargement de ta collection…</p> : (
        <div className={styles.grid}>
          <button data-nj-skin="none" type="button" aria-pressed={!current} className={styles.item} disabled={Boolean(busy)} onClick={() => void equip(null)}>
            <span className={styles.thumb} aria-hidden="true">∅</span>
            <strong>{emptyLabel}</strong>
          </button>
          {items.map((item) => (
            <button key={item.id} data-nj-skin="none" type="button" aria-pressed={current === item.id} className={`${styles.item} ${styles[`rarity_${item.rarity}`]}`} disabled={Boolean(busy)} onClick={() => void equip(item.id)}>
              {item.imageUrl
                // eslint-disable-next-line @next/next/no-img-element -- cosmétique uploadé depuis l'admin (URL du VPS)
                ? <img className={`${styles.thumb} ${item.type === "card_back" ? styles.thumbCard : ""}`} src={item.imageUrl} alt="" />
                : <span className={`${styles.thumb} ${styles.thumbTitle}`}>« {item.name} »</span>}
              <strong>{item.name}</strong>
              <small>{RARITY_LABELS[item.rarity]}{current === item.id ? " · équipé" : ""}</small>
            </button>
          ))}
        </div>
      )}
      {owned !== null && items.length === 0 && <p className={styles.hint}>Gagne des cosmétiques exclusifs dans les événements du Ter (grand prix, classement, parcours parfait).</p>}
    </div>
  );
}

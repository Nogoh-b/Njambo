"use client";

/* Profil → « Ma collection » : objets récupérés (packs, livres, pass énergie,
   tickets) + cosmétiques gagnés (dos de carte, cadres, badges, titres). */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  COSMETIC_SLOT,
  countStoredCollectionItems,
  type CosmeticDefinition,
  type CosmeticSlot,
  type PlayerCosmetics,
} from "@/domain";
import { useEconomy } from "@/contexts/EconomyContext";
import { useMotionProfile } from "@/lib/motion";
import { backendCallable } from "@/lib/backendCallable";
import { CollectionItems } from "./CollectionItems";
import styles from "./CosmeticCollection.module.css";

type CollectionSection = "items" | "cosmetics";

const SLOTS: Array<{ slot: CosmeticSlot; label: string; empty: string }> = [
  { slot: "cardBack", label: "Dos de carte", empty: "Dos classique" },
  { slot: "avatarFrame", label: "Cadre", empty: "Sans cadre" },
  { slot: "badge", label: "Badge", empty: "Sans badge" },
  { slot: "title", label: "Titre", empty: "Sans titre" },
  { slot: "animStyle", label: "Style", empty: "Style classique" },
];
const RARITY_LABELS: Record<CosmeticDefinition["rarity"], string> = { commun: "Commun", rare: "Rare", epique: "Épique", legendaire: "Légendaire" };

export function CosmeticCollection({ onClose }: { onClose?: () => void }) {
  const { inventory } = useEconomy();
  const motionProfile = useMotionProfile();
  const [section, setSection] = useState<CollectionSection>("items");
  const [owned, setOwned] = useState<CosmeticDefinition[] | null>(null);
  const [equipped, setEquipped] = useState<PlayerCosmetics>({});
  const [slot, setSlot] = useState<CosmeticSlot>("avatarFrame");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const storedCounts = useMemo(() => countStoredCollectionItems(inventory), [inventory]);
  const animateOn = motionProfile.allowEntranceCascade;

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
      <div className={styles.sectionSwitch} role="tablist" aria-label="Sections de ma collection">
        <button
          data-nj-skin="none"
          type="button"
          role="tab"
          aria-selected={section === "items"}
          className={styles.sectionBtn}
          onClick={() => setSection("items")}
        >
          <span>Mes objets</span>
          <span className={styles.count}>{storedCounts.total}</span>
        </button>
        <button
          data-nj-skin="none"
          type="button"
          role="tab"
          aria-selected={section === "cosmetics"}
          className={styles.sectionBtn}
          onClick={() => setSection("cosmetics")}
        >
          <span>Cosmétiques</span>
          {owned !== null && <span className={styles.count}>{owned.length}</span>}
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {section === "items" ? (
          <motion.div
            key="sec-items"
            className={styles.sectionBody}
            initial={animateOn ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={animateOn ? { opacity: 0, y: -6 } : undefined}
            transition={{ duration: 0.18 }}
          >
            <CollectionItems compact onNavigateAway={onClose} />
          </motion.div>
        ) : (
          <motion.div
            key="sec-cosmetics"
            className={styles.sectionBody}
            initial={animateOn ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={animateOn ? { opacity: 0, y: -6 } : undefined}
            transition={{ duration: 0.18 }}
          >
            <div className={styles.tabs} role="tablist">
              {SLOTS.map((entry) => {
                const count = (owned ?? []).filter((item) => COSMETIC_SLOT[item.type] === entry.slot).length;
                return (
                  <button key={entry.slot} data-nj-skin="none" type="button" role="tab" aria-selected={slot === entry.slot} className={styles.tab} onClick={() => setSlot(entry.slot)}>
                    <span>{entry.label}</span>
                    {count > 0 && <span className={styles.count}>{count}</span>}
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
                      : <span className={`${styles.thumb} ${styles.thumbTitle}`}>{item.type === "anim_style" ? "✦" : `« ${item.name} »`}</span>}
                    <strong>{item.name}</strong>
                    <small>{RARITY_LABELS[item.rarity]}{current === item.id ? " · équipé" : ""}</small>
                  </button>
                ))}
              </div>
            )}
            {owned !== null && items.length === 0 && <p className={styles.hint}>Gagne des cosmétiques exclusifs dans les événements du Ter (grand prix, classement, parcours parfait).</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

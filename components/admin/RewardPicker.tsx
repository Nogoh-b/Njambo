"use client";

/* Éditeur d'une liste de récompenses : le type choisi détermine les champs. */

import { useEffect, useState } from "react";
import { DEFAULT_BOOSTERS, type CosmeticDefinition, type Reward } from "@/domain";
import { loadCosmeticCatalog } from "./adminApi";
import { POWER_CARDS } from "@/config/powerCards";
import styles from "./AdminConsole.module.css";

const TYPE_LABELS: Record<Reward["type"], string> = {
  nkap: "Nkap",
  cauris: "Cauris",
  ticket: "Ticket",
  energy_pass: "Énergie illimitée",
  booster_book: "Livre (booster)",
  card: "Carte de pouvoir",
  cosmetic: "Cosmétique",
};

const COSMETIC_TYPE_LABELS: Record<string, string> = { card_back: "Dos de carte", avatar_frame: "Cadre", badge: "Badge", title: "Titre", anim_style: "Style d'animation", hand_arc: "Arche de main" };

function defaultReward(type: Reward["type"]): Reward {
  switch (type) {
    case "nkap": return { type, amount: 100 };
    case "cauris": return { type, amount: 5 };
    case "ticket": return { type, tier: "bronze", amount: 1 };
    case "energy_pass": return { type, durationMinutes: 60 };
    case "booster_book": return { type, boosterId: DEFAULT_BOOSTERS[0]?.id ?? "normal", amount: 1 };
    case "card": return { type, cardId: POWER_CARDS[0]?.id ?? "", rarity: "village" };
    case "cosmetic": return { type, cosmeticId: "", rarity: "commun" };
  }
}

export function rewardSummary(reward: Reward): string {
  switch (reward.type) {
    case "nkap": return `${reward.amount} Nkap`;
    case "cauris": return `${reward.amount} cauris`;
    case "ticket": return `${reward.amount} ticket ${reward.tier}`;
    case "energy_pass": return `Énergie ∞ ${reward.durationMinutes} min`;
    case "booster_book": return `${reward.amount} livre ${reward.boosterId}`;
    case "card": return `Carte ${reward.cardId}`;
    case "cosmetic": return `Cosmétique ${reward.name ?? reward.cosmeticId}`;
  }
}

const int = (value: string) => Math.max(0, Math.floor(Number(value) || 0));

export function RewardPicker({ value, onChange, errorFor, path, emptyLabel = "Aucune récompense" }: {
  value: Reward[];
  onChange: (next: Reward[]) => void;
  /** Message d'erreur pour un chemin de champ (validation du domaine). */
  errorFor: (path: string) => string | undefined;
  /** Chemin de la liste dans la fiche, ex. "stages.0.reward". */
  path: string;
  emptyLabel?: string;
}) {
  const update = (index: number, reward: Reward) => onChange(value.map((item, i) => (i === index ? reward : item)));
  const [cosmetics, setCosmetics] = useState<CosmeticDefinition[] | null>(null);
  const needsCatalog = value.some((reward) => reward.type === "cosmetic");
  useEffect(() => { if (needsCatalog && !cosmetics) void loadCosmeticCatalog().then(setCosmetics); }, [needsCatalog, cosmetics]);
  const listError = errorFor(path);

  return (
    <div className={styles.rewardList}>
      {value.length === 0 && <span className={styles.hint}>{emptyLabel}</span>}
      {value.map((reward, index) => {
        const base = `${path}.${index}`;
        const err = (key: string) => errorFor(`${base}.${key}`);
        return (
          <div key={index} className={styles.rewardRow}>
            <label className={styles.field}>
              <span>Type</span>
              <select value={reward.type} onChange={(event) => update(index, defaultReward(event.target.value as Reward["type"]))}>
                {Object.entries(TYPE_LABELS).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
              </select>
            </label>

            {"amount" in reward && (
              <label className={`${styles.field} ${err("amount") ? styles.invalid : ""}`}>
                <span>Quantité</span>
                <input type="number" min={1} value={reward.amount} onChange={(event) => update(index, { ...reward, amount: int(event.target.value) })} />
                {err("amount") && <span className={styles.fieldError}>{err("amount")}</span>}
              </label>
            )}
            {reward.type === "ticket" && (
              <label className={styles.field}>
                <span>Palier</span>
                <select value={reward.tier} onChange={(event) => update(index, { ...reward, tier: event.target.value as typeof reward.tier })}>
                  <option value="bronze">Bronze</option><option value="argent">Argent</option><option value="or">Or</option>
                </select>
              </label>
            )}
            {reward.type === "energy_pass" && (
              <label className={`${styles.field} ${err("durationMinutes") ? styles.invalid : ""}`}>
                <span>Durée (min)</span>
                <input type="number" min={1} value={reward.durationMinutes} onChange={(event) => update(index, { ...reward, durationMinutes: int(event.target.value) })} />
                {err("durationMinutes") && <span className={styles.fieldError}>{err("durationMinutes")}</span>}
              </label>
            )}
            {reward.type === "booster_book" && (
              <label className={styles.field}>
                <span>Livre</span>
                <select value={reward.boosterId} onChange={(event) => update(index, { ...reward, boosterId: event.target.value })}>
                  {DEFAULT_BOOSTERS.map((booster) => <option key={booster.id} value={booster.id}>{booster.title}</option>)}
                </select>
              </label>
            )}
            {reward.type === "cosmetic" && (
              <label className={`${styles.field} ${err("cosmeticId") ? styles.invalid : ""}`}>
                <span>Cosmétique</span>
                <select value={reward.cosmeticId} onChange={(event) => {
                  const picked = cosmetics?.find((item) => item.id === event.target.value);
                  update(index, picked
                    ? { type: "cosmetic", cosmeticId: picked.id, rarity: picked.rarity, name: picked.name, ...(picked.imageUrl ? { imageUrl: picked.imageUrl } : {}) }
                    : { type: "cosmetic", cosmeticId: "", rarity: "commun" });
                }}>
                  <option value="">{cosmetics === null ? "Chargement…" : cosmetics.length ? "Choisir…" : "Catalogue vide"}</option>
                  {(cosmetics ?? []).map((item) => <option key={item.id} value={item.id}>{COSMETIC_TYPE_LABELS[item.type]} · {item.name} ({item.rarity}){item.published ? "" : " — inactif"}</option>)}
                </select>
                {err("cosmeticId") && <span className={styles.fieldError}>{err("cosmeticId")}</span>}
              </label>
            )}
            {reward.type === "card" && (
              <>
                <label className={`${styles.field} ${err("cardId") ? styles.invalid : ""}`}>
                  <span>Carte</span>
                  <select value={reward.cardId} onChange={(event) => update(index, { ...reward, cardId: event.target.value })}>
                    {POWER_CARDS.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Rareté</span>
                  <select value={reward.rarity} onChange={(event) => update(index, { ...reward, rarity: event.target.value as typeof reward.rarity })}>
                    <option value="village">Village</option><option value="notable">Notable</option><option value="chef">Chef</option><option value="ancetre">Ancêtre</option>
                  </select>
                </label>
              </>
            )}
            <button type="button" className={`${styles.btn} ${styles.small} ${styles.danger}`} onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label="Retirer la récompense">✕</button>
          </div>
        );
      })}
      <div className={styles.row}>
        <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => onChange([...value, defaultReward("nkap")])}>+ Récompense</button>
        {listError && <span className={styles.fieldError}>{listError}</span>}
      </div>
    </div>
  );
}

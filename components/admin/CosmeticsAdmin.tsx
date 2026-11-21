"use client";

/* Section Cosmétiques : catalogue (dos de carte, cadres, badges, titres,
   styles d'animation), création / modification, activation. Les
   cosmétiques se gagnent via la récompense « Cosmétique » des événements
   (et des saisons). */

import { useCallback, useEffect, useMemo, useState } from "react";
import { COSMETIC_RARITIES, COSMETIC_TYPES, validateCosmetic, type CosmeticDefinition } from "@/domain";
import { adminApi, adminErrorText, loadCosmeticCatalog } from "./adminApi";
import { AnimStyleEditor } from "./anim/AnimStyleEditor";
import { ImageField } from "./ImageField";
import styles from "./AdminConsole.module.css";

const TYPE_LABELS: Record<CosmeticDefinition["type"], string> = { card_back: "Dos de carte", avatar_frame: "Cadre d’avatar", badge: "Badge", title: "Titre", anim_style: "Style d’animation" };
const RARITY_LABELS: Record<CosmeticDefinition["rarity"], string> = { commun: "Commun", rare: "Rare", epique: "Épique", legendaire: "Légendaire" };
const RARITY_COLORS: Record<CosmeticDefinition["rarity"], string> = { commun: "#c9b48f", rare: "#7ab8ff", epique: "#c18cff", legendaire: "#f2bb45" };
const EMPTY: CosmeticDefinition = { id: "", type: "avatar_frame", name: "", rarity: "rare", published: false };

export function CosmeticsAdmin() {
  const [items, setItems] = useState<CosmeticDefinition[] | null>(null);
  const [editing, setEditing] = useState<{ cosmetic: CosmeticDefinition; isNew: boolean } | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<CosmeticDefinition["type"] | "all">("all");

  const load = useCallback(async () => {
    try { setItems((await adminApi.cosmetics()).cosmetics); } catch (cause) { setNotice({ kind: "error", text: adminErrorText(cause) }); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const issues = useMemo(() => (editing ? validateCosmetic(editing.cosmetic) : []), [editing]);
  const err = (path: string) => issues.find((issue) => issue.path === path)?.message;
  const taken = new Set((items ?? []).map((item) => item.id));
  const idError = editing?.isNew && taken.has(editing.cosmetic.id) ? "Identifiant déjà utilisé." : err("id");

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setNotice(null);
    try {
      await adminApi.saveCosmetic(editing.cosmetic);
      setNotice({ kind: "ok", text: `« ${editing.cosmetic.name} » enregistré${editing.cosmetic.published ? " et actif" : " (inactif)"}.` });
      setEditing(null);
      void loadCosmeticCatalog(true);
      await load();
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorText(cause) });
    } finally {
      setBusy(false);
    }
  };
  const patch = (next: Partial<CosmeticDefinition>) => setEditing((current) => (current ? { ...current, cosmetic: { ...current.cosmetic, ...next } } : current));
  const visible = (items ?? []).filter((item) => filter === "all" || item.type === filter);

  return (
    <div>
      <div className={styles.pageHead}>
        <div><h1>Cosmétiques</h1><p>Récompenses exclusives : à attribuer via la récompense « Cosmétique » d’un événement. Un doublon est converti en cauris (10 / 25 / 60 / 150 selon la rareté).</p></div>
        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => setEditing({ cosmetic: { ...EMPTY }, isNew: true })}>+ Nouveau cosmétique</button>
      </div>
      {notice && <div className={`${styles.notice} ${styles[notice.kind]}`}>{notice.text}</div>}

      {editing && (
        <section className={styles.panel}>
          <h2>{editing.isNew ? "Nouveau cosmétique" : `Modifier « ${editing.cosmetic.name} »`}</h2>
          <div className={styles.grid3}>
            <label className={`${styles.field} ${idError ? styles.invalid : ""}`}><span>Identifiant</span>
              <input value={editing.cosmetic.id} disabled={!editing.isNew} onChange={(e) => patch({ id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
              {idError && <span className={styles.fieldError}>{idError}</span>}
            </label>
            <label className={styles.field}><span>Type</span>
              <select value={editing.cosmetic.type} disabled={!editing.isNew} onChange={(e) => {
                const type = e.target.value as CosmeticDefinition["type"];
                patch({ type, style: type === "anim_style" ? editing.cosmetic.style ?? { trail: "light", tone: "gold" } : undefined });
              }}>
                {COSMETIC_TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
              </select>
            </label>
            <label className={styles.field}><span>Rareté</span>
              <select value={editing.cosmetic.rarity} onChange={(e) => patch({ rarity: e.target.value as CosmeticDefinition["rarity"] })}>
                {COSMETIC_RARITIES.map((rarity) => <option key={rarity} value={rarity}>{RARITY_LABELS[rarity]}</option>)}
              </select>
            </label>
            <label className={`${styles.field} ${err("name") ? styles.invalid : ""}`}><span>Nom {editing.cosmetic.type === "title" ? "(texte affiché sous le pseudo)" : ""}</span>
              <input value={editing.cosmetic.name} maxLength={40} onChange={(e) => patch({ name: e.target.value })} />
              {err("name") && <span className={styles.fieldError}>{err("name")}</span>}
            </label>
            <label className={`${styles.field} ${styles.full}`}><span>Description (facultatif)</span>
              <input value={editing.cosmetic.description ?? ""} maxLength={160} onChange={(e) => patch({ description: e.target.value || undefined })} />
            </label>
          </div>
          {editing.cosmetic.type === "anim_style" && (
            <>
              <h3>Style</h3>
              <AnimStyleEditor style={editing.cosmetic.style ?? {}} errorFor={err} onChange={(style) => patch({ style })} />
            </>
          )}
          {editing.cosmetic.type !== "title" && (
            <>
              <h3>Image{editing.cosmetic.type === "anim_style" ? " (facultatif)" : ""}</h3>
              <ImageField kind="cosmetic" label={editing.cosmetic.type === "avatar_frame" ? "Cadre (PNG transparent, carré)" : editing.cosmetic.type === "card_back" ? "Dos de carte (portrait 5:7)" : editing.cosmetic.type === "anim_style" ? "Vignette de la collection (carré)" : "Badge (carré)"} value={editing.cosmetic.imageUrl} error={err("imageUrl")} onChange={(imageUrl) => patch({ imageUrl })} />
              <span className={styles.hint}>Astuce : envoyez un PNG à fond transparent pour les cadres et badges (il est converti en WebP en gardant la transparence).</span>
            </>
          )}
          <div className={styles.row} style={{ marginTop: 12 }}>
            <label className={styles.check}><input type="checkbox" checked={editing.cosmetic.published} onChange={(e) => patch({ published: e.target.checked })} />Actif (attribuable et visible dans le catalogue)</label>
            <span className={styles.spacer} />
            <button type="button" className={styles.btn} onClick={() => setEditing(null)}>Annuler</button>
            <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy || issues.length > 0 || Boolean(idError)} onClick={() => void save()}>Enregistrer</button>
          </div>
        </section>
      )}

      <div className={styles.filters}>
        {(["all", ...COSMETIC_TYPES] as const).map((key) => (
          <button key={key} type="button" className={styles.chip} aria-pressed={filter === key} onClick={() => setFilter(key)}>{key === "all" ? "Tous" : TYPE_LABELS[key]}</button>
        ))}
      </div>
      <section className={styles.panel}>
        {items === null ? <p className={styles.empty}>Chargement…</p> : visible.length === 0 ? <p className={styles.empty}>Aucun cosmétique.</p> : (
          <div className={styles.library} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", marginTop: 0 }}>
            {visible.map((item) => (
              <button key={item.id} type="button" onClick={() => setEditing({ cosmetic: item, isNew: false })} style={{ padding: 10, textAlign: "left", background: "#21180f", border: "1px solid #3a2b1b", color: "inherit" }}>
                {item.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={item.imageUrl} alt="" style={{ aspectRatio: item.type === "card_back" ? "5 / 7" : "1", objectFit: "contain", background: "#0c0906", borderRadius: 8 }} />
                  : <div style={{ display: "grid", placeItems: "center", aspectRatio: "1", background: "#0c0906", borderRadius: 8, fontWeight: 900, color: RARITY_COLORS[item.rarity], padding: 8, textAlign: "center" }}>« {item.name} »</div>}
                <strong style={{ display: "block", marginTop: 6 }}>{item.name}</strong>
                <span className={styles.hint}>{TYPE_LABELS[item.type]} · <span style={{ color: RARITY_COLORS[item.rarity] }}>{RARITY_LABELS[item.rarity]}</span>{item.published ? "" : " · inactif"}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

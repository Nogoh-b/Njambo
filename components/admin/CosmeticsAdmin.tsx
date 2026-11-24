"use client";

/* Section Cosmétiques : catalogue (dos de carte, arches de main, cadres,
   badges, titres, styles d'animation), création / modification, import en
   1 clic de la bibliothèque intégrée (11 dos + 11 arches) et sélection des
   visuels par défaut de la table. */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BUILTIN_CARD_BACKS,
  BUILTIN_HAND_ARCS,
  BUILTIN_TABLE_COSMETICS,
  type BuiltinTableCosmeticAsset,
} from "@/config/tableCosmeticAssets";
import {
  COSMETIC_RARITIES,
  COSMETIC_TYPES,
  isValidCosmeticImageUrl,
  validateCosmetic,
  type CosmeticDefinition,
  type DefaultCosmeticsConfig,
} from "@/domain";
import { DEFAULT_CARD_BACK_ASSET, DEFAULT_HAND_ARC_ASSET } from "@/lib/assets/manifests";
import { adminApi, adminErrorText, loadCosmeticCatalog } from "./adminApi";
import { AnimStyleEditor } from "./anim/AnimStyleEditor";
import { ImageField } from "./ImageField";
import styles from "./AdminConsole.module.css";

const TYPE_LABELS: Record<CosmeticDefinition["type"], string> = {
  card_back: "Dos de carte",
  hand_arc: "Arche de main",
  avatar_frame: "Cadre d’avatar",
  badge: "Badge",
  title: "Titre",
  anim_style: "Style d’animation",
};
const RARITY_LABELS: Record<CosmeticDefinition["rarity"], string> = { commun: "Commun", rare: "Rare", epique: "Épique", legendaire: "Légendaire" };
const RARITY_COLORS: Record<CosmeticDefinition["rarity"], string> = { commun: "#c9b48f", rare: "#7ab8ff", epique: "#c18cff", legendaire: "#f2bb45" };
const EMPTY: CosmeticDefinition = { id: "", type: "avatar_frame", name: "", rarity: "rare", published: false };

type DefaultSlotMode = "core" | "builtin" | "catalog" | "custom";

interface DefaultSlotDraft {
  mode: DefaultSlotMode;
  cosmeticId: string;
  imageUrl: string;
  name: string;
}

function slotDraftFrom(
  entry: DefaultCosmeticsConfig["cardBack"] | undefined,
  builtins: readonly BuiltinTableCosmeticAsset[],
): DefaultSlotDraft {
  if (!entry?.imageUrl) return { mode: "core", cosmeticId: "", imageUrl: "", name: "" };
  if (entry.cosmeticId) {
    return { mode: "catalog", cosmeticId: entry.cosmeticId, imageUrl: entry.imageUrl, name: entry.name ?? "" };
  }
  const matchedBuiltin = builtins.find((asset) => asset.imageUrl === entry.imageUrl);
  if (matchedBuiltin) {
    return matchedBuiltin.isCoreDefault
      ? { mode: "core", cosmeticId: "", imageUrl: "", name: "" }
      : { mode: "builtin", cosmeticId: matchedBuiltin.id, imageUrl: matchedBuiltin.imageUrl, name: matchedBuiltin.name };
  }
  return { mode: "custom", cosmeticId: "", imageUrl: entry.imageUrl, name: entry.name ?? "" };
}

function serializeDefaultSlot(draft: DefaultSlotDraft) {
  if (draft.mode === "core") return null;
  if (draft.mode === "catalog") {
    return draft.cosmeticId ? { cosmeticId: draft.cosmeticId } : null;
  }
  return draft.imageUrl.trim()
    ? { imageUrl: draft.imageUrl.trim(), ...(draft.name.trim() ? { name: draft.name.trim() } : {}) }
    : null;
}

function isSlotDraftValid(draft: DefaultSlotDraft): boolean {
  if (draft.mode === "core") return true;
  if (draft.mode === "catalog") return Boolean(draft.cosmeticId);
  return isValidCosmeticImageUrl(draft.imageUrl.trim());
}

function selectValueFor(draft: DefaultSlotDraft): string {
  if (draft.mode === "core") return "core";
  if (draft.mode === "builtin") return `bi:${draft.cosmeticId}`;
  if (draft.mode === "catalog") return `cat:${draft.cosmeticId}`;
  return "custom";
}

export function CosmeticsAdmin() {
  const [items, setItems] = useState<CosmeticDefinition[] | null>(null);
  const [savedDefaults, setSavedDefaults] = useState<DefaultCosmeticsConfig>({});
  const [cardBackDraft, setCardBackDraft] = useState<DefaultSlotDraft>(() => slotDraftFrom(undefined, BUILTIN_CARD_BACKS));
  const [handArcDraft, setHandArcDraft] = useState<DefaultSlotDraft>(() => slotDraftFrom(undefined, BUILTIN_HAND_ARCS));
  const [defaultsDirty, setDefaultsDirty] = useState(false);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [importingBuiltins, setImportingBuiltins] = useState(false);
  const [editing, setEditing] = useState<{ cosmetic: CosmeticDefinition; isNew: boolean } | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<CosmeticDefinition["type"] | "all">("all");

  const load = useCallback(async () => {
    try {
      const response = await adminApi.cosmetics();
      setItems(response.cosmetics);
      const nextDefaults = response.defaults ?? {};
      setSavedDefaults(nextDefaults);
      setCardBackDraft(slotDraftFrom(nextDefaults.cardBack, BUILTIN_CARD_BACKS));
      setHandArcDraft(slotDraftFrom(nextDefaults.handArc, BUILTIN_HAND_ARCS));
      setDefaultsDirty(false);
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorText(cause) });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const cardBackOptions = useMemo(
    () => (items ?? []).filter((item) => item.type === "card_back" && Boolean(item.imageUrl)),
    [items],
  );
  const handArcOptions = useMemo(
    () => (items ?? []).filter((item) => item.type === "hand_arc" && Boolean(item.imageUrl)),
    [items],
  );

  const missingBuiltins = useMemo(() => {
    if (!items) return [];
    const existingIds = new Set(items.map((item) => item.id));
    return BUILTIN_TABLE_COSMETICS.filter((asset) => !asset.isCoreDefault && !existingIds.has(asset.id));
  }, [items]);

  const importBuiltinsToCatalog = async () => {
    if (missingBuiltins.length === 0) return;
    setImportingBuiltins(true);
    setNotice(null);
    let created = 0;
    try {
      for (const asset of missingBuiltins) {
        await adminApi.saveCosmetic({
          id: asset.id,
          type: asset.type,
          name: asset.name,
          description: asset.description,
          imageUrl: asset.imageUrl,
          rarity: asset.rarity,
          published: true,
        });
        created += 1;
      }
      void loadCosmeticCatalog(true);
      await load();
      setNotice({ kind: "ok", text: `${created} visuels intégrés (dos de cartes & arches) ajoutés au catalogue et prêts à être attribués.` });
    } catch (cause) {
      setNotice({ kind: "error", text: `Import interrompu après ${created} élément(s) : ${adminErrorText(cause)}` });
      await load();
    } finally {
      setImportingBuiltins(false);
    }
  };

  const previewUrlFor = (
    draft: DefaultSlotDraft,
    options: CosmeticDefinition[],
    builtins: readonly BuiltinTableCosmeticAsset[],
    coreUrl: string,
  ) => {
    if (draft.mode === "core") return coreUrl;
    if (draft.mode === "builtin") {
      return builtins.find((asset) => asset.id === draft.cosmeticId)?.imageUrl ?? draft.imageUrl ?? coreUrl;
    }
    if (draft.mode === "catalog") {
      return options.find((item) => item.id === draft.cosmeticId)?.imageUrl ?? draft.imageUrl ?? coreUrl;
    }
    return isValidCosmeticImageUrl(draft.imageUrl.trim()) ? draft.imageUrl.trim() : coreUrl;
  };

  const cardBackPreviewUrl = previewUrlFor(cardBackDraft, cardBackOptions, BUILTIN_CARD_BACKS, DEFAULT_CARD_BACK_ASSET);
  const handArcPreviewUrl = previewUrlFor(handArcDraft, handArcOptions, BUILTIN_HAND_ARCS, DEFAULT_HAND_ARC_ASSET);
  const defaultsValid = isSlotDraftValid(cardBackDraft) && isSlotDraftValid(handArcDraft);

  const saveDefaults = async () => {
    setSavingDefaults(true);
    setNotice(null);
    try {
      const response = await adminApi.saveCosmeticDefaults({
        cardBack: serializeDefaultSlot(cardBackDraft),
        handArc: serializeDefaultSlot(handArcDraft),
      });
      setSavedDefaults(response.defaults);
      setCardBackDraft(slotDraftFrom(response.defaults.cardBack, BUILTIN_CARD_BACKS));
      setHandArcDraft(slotDraftFrom(response.defaults.handArc, BUILTIN_HAND_ARCS));
      setDefaultsDirty(false);
      setNotice({ kind: "ok", text: "Visuels par défaut de la table enregistrés (actifs en temps réel pour tous les joueurs)." });
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorText(cause) });
    } finally {
      setSavingDefaults(false);
    }
  };

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

  const editorBuiltinGallery =
    editing?.cosmetic.type === "card_back"
      ? BUILTIN_CARD_BACKS
      : editing?.cosmetic.type === "hand_arc"
        ? BUILTIN_HAND_ARCS
        : null;

  return (
    <div>
      <div className={styles.pageHead}>
        <div>
          <h1>Cosmétiques</h1>
          <p>Catalogue des visuels attribuables aux joueurs (dos de carte, arches de main, cadres, badges, titres, styles) et sélection des assets par défaut de la table.</p>
        </div>
        <div className={styles.row} style={{ gap: 8 }}>
          {missingBuiltins.length > 0 && (
            <button
              type="button"
              className={styles.btn}
              disabled={importingBuiltins}
              onClick={() => void importBuiltinsToCatalog()}
            >
              {importingBuiltins ? "Import en cours…" : `+ Importer ${missingBuiltins.length} visuels intégrés`}
            </button>
          )}
          <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => setEditing({ cosmetic: { ...EMPTY }, isNew: true })}>+ Nouveau cosmétique</button>
        </div>
      </div>
      {notice && <div className={`${styles.notice} ${styles[notice.kind]}`}>{notice.text}</div>}

      {/* Visuels par défaut configurables pour tous les joueurs sans cosmétique équipé */}
      <section className={styles.panel}>
        <h2>Visuels par défaut de la table</h2>
        <p className={styles.hint} style={{ marginTop: 0, marginBottom: 12 }}>
          Appliqués automatiquement à tous les joueurs (et bots) n’ayant pas équipé un autre dos de carte ou une autre arche de main.
        </p>
        <div className={styles.grid2}>
          {/* Dos de carte par défaut */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 10, background: "#1b140d", border: "1px solid #352719" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cardBackPreviewUrl}
                alt="Aperçu dos de carte par défaut"
                style={{ width: 58, height: 84, objectFit: "cover", borderRadius: 8, background: "#0c0906", border: "1px solid rgba(255,212,92,0.45)", flexShrink: 0 }}
              />
              <label className={styles.field} style={{ flex: 1 }}>
                <span>Dos de carte par défaut</span>
                <select
                  aria-label="Dos de carte par défaut"
                  value={selectValueFor(cardBackDraft)}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDefaultsDirty(true);
                    if (val === "core") setCardBackDraft({ mode: "core", cosmeticId: "", imageUrl: "", name: "" });
                    else if (val === "custom") setCardBackDraft({ mode: "custom", cosmeticId: "", imageUrl: savedDefaults.cardBack?.imageUrl ?? "", name: savedDefaults.cardBack?.name ?? "" });
                    else if (val.startsWith("bi:")) {
                      const id = val.slice(3);
                      const picked = BUILTIN_CARD_BACKS.find((asset) => asset.id === id);
                      if (picked) setCardBackDraft({ mode: "builtin", cosmeticId: picked.id, imageUrl: picked.imageUrl, name: picked.name });
                    } else if (val.startsWith("cat:")) {
                      const id = val.slice(4);
                      const picked = cardBackOptions.find((item) => item.id === id);
                      setCardBackDraft({ mode: "catalog", cosmeticId: id, imageUrl: picked?.imageUrl ?? "", name: picked?.name ?? "" });
                    }
                  }}
                >
                  <option value="core">Défaut intégré — Astrolabe Royal (1B)</option>
                  <optgroup label="Assets intégrés (10 styles)">
                    {BUILTIN_CARD_BACKS.filter((asset) => !asset.isCoreDefault).map((asset) => (
                      <option key={asset.id} value={`bi:${asset.id}`}>
                        {asset.name} ({asset.mood === "lumineux" ? "Lumineux" : "Sobre"})
                      </option>
                    ))}
                  </optgroup>
                  {cardBackOptions.length > 0 && (
                    <optgroup label="Catalogue cosmétiques">
                      {cardBackOptions.map((item) => (
                        <option key={item.id} value={`cat:${item.id}`}>
                          Catalogue — {item.name}{item.published ? "" : " (inactif)"}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <option value="custom">Asset personnalisé (upload direct)</option>
                </select>
              </label>
            </div>
            {cardBackDraft.mode === "custom" && (
              <>
                <ImageField
                  kind="cosmetic"
                  label="Image dos de carte (portrait 5:7, PNG/WebP)"
                  value={cardBackDraft.imageUrl}
                  error={cardBackDraft.imageUrl && !isValidCosmeticImageUrl(cardBackDraft.imageUrl.trim()) ? "URL ou chemin d'image invalide." : undefined}
                  onChange={(imageUrl) => {
                    setDefaultsDirty(true);
                    setCardBackDraft((cur) => ({ ...cur, imageUrl: imageUrl ?? "" }));
                  }}
                />
                <label className={styles.field}>
                  <span>Nom affiché (facultatif)</span>
                  <input
                    value={cardBackDraft.name}
                    maxLength={40}
                    placeholder="Ex. Dos Royal Saisonnier"
                    onChange={(e) => {
                      setDefaultsDirty(true);
                      setCardBackDraft((cur) => ({ ...cur, name: e.target.value }));
                    }}
                  />
                </label>
              </>
            )}
          </div>

          {/* Arche de main par défaut */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 10, background: "#1b140d", border: "1px solid #352719" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={handArcPreviewUrl}
                alt="Aperçu arche de main par défaut"
                style={{ width: 112, height: 48, objectFit: "contain", objectPosition: "bottom center", borderRadius: 8, background: "#09251c", border: "1px solid rgba(255,212,92,0.45)", padding: "4px 4px 0", flexShrink: 0 }}
              />
              <label className={styles.field} style={{ flex: 1 }}>
                <span>Arche de main par défaut</span>
                <select
                  aria-label="Arche de main par défaut"
                  value={selectValueFor(handArcDraft)}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDefaultsDirty(true);
                    if (val === "core") setHandArcDraft({ mode: "core", cosmeticId: "", imageUrl: "", name: "" });
                    else if (val === "custom") setHandArcDraft({ mode: "custom", cosmeticId: "", imageUrl: savedDefaults.handArc?.imageUrl ?? "", name: savedDefaults.handArc?.name ?? "" });
                    else if (val.startsWith("bi:")) {
                      const id = val.slice(3);
                      const picked = BUILTIN_HAND_ARCS.find((asset) => asset.id === id);
                      if (picked) setHandArcDraft({ mode: "builtin", cosmeticId: picked.id, imageUrl: picked.imageUrl, name: picked.name });
                    } else if (val.startsWith("cat:")) {
                      const id = val.slice(4);
                      const picked = handArcOptions.find((item) => item.id === id);
                      setHandArcDraft({ mode: "catalog", cosmeticId: id, imageUrl: picked?.imageUrl ?? "", name: picked?.name ?? "" });
                    }
                  }}
                >
                  <option value="core">Défaut intégré — Soleil de Chefferie (2A)</option>
                  <optgroup label="Assets intégrés (10 styles)">
                    {BUILTIN_HAND_ARCS.filter((asset) => !asset.isCoreDefault).map((asset) => (
                      <option key={asset.id} value={`bi:${asset.id}`}>
                        {asset.name} ({asset.mood === "lumineux" ? "Lumineux" : "Sobre"})
                      </option>
                    ))}
                  </optgroup>
                  {handArcOptions.length > 0 && (
                    <optgroup label="Catalogue cosmétiques">
                      {handArcOptions.map((item) => (
                        <option key={item.id} value={`cat:${item.id}`}>
                          Catalogue — {item.name}{item.published ? "" : " (inactif)"}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <option value="custom">Asset personnalisé (upload direct)</option>
                </select>
              </label>
            </div>
            {handArcDraft.mode === "custom" && (
              <>
                <ImageField
                  kind="cosmetic"
                  label="Image arche circulaire (PNG/WebP transparent, ratio 520×190)"
                  value={handArcDraft.imageUrl}
                  error={handArcDraft.imageUrl && !isValidCosmeticImageUrl(handArcDraft.imageUrl.trim()) ? "URL ou chemin d'image invalide." : undefined}
                  onChange={(imageUrl) => {
                    setDefaultsDirty(true);
                    setHandArcDraft((cur) => ({ ...cur, imageUrl: imageUrl ?? "" }));
                  }}
                />
                <label className={styles.field}>
                  <span>Nom affiché (facultatif)</span>
                  <input
                    value={handArcDraft.name}
                    maxLength={40}
                    placeholder="Ex. Arche Émeraude"
                    onChange={(e) => {
                      setDefaultsDirty(true);
                      setHandArcDraft((cur) => ({ ...cur, name: e.target.value }));
                    }}
                  />
                </label>
              </>
            )}
          </div>
        </div>
        <div className={styles.row} style={{ marginTop: 12 }}>
          <span className={styles.hint}>11 dos de cartes et 11 arches intégrés disponibles immédiatement — ou importe-les au catalogue pour les attribuer aux joueurs.</span>
          <span className={styles.spacer} />
          <button
            type="button"
            className={`${styles.btn} ${styles.primary}`}
            disabled={savingDefaults || !defaultsDirty || !defaultsValid}
            onClick={() => void saveDefaults()}
          >
            {savingDefaults ? "Enregistrement…" : "Enregistrer les valeurs par défaut"}
          </button>
        </div>
      </section>

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
              {editorBuiltinGallery && (
                <div style={{ marginBottom: 10 }}>
                  <span className={styles.hint} style={{ display: "block", marginBottom: 6 }}>
                    Ou choisis un asset intégré ({editorBuiltinGallery.length} disponibles) :
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {editorBuiltinGallery.map((asset) => {
                      const selected = editing.cosmetic.imageUrl === asset.imageUrl;
                      return (
                        <button
                          key={asset.id}
                          type="button"
                          title={`${asset.name} (${asset.mood})`}
                          onClick={() => patch({
                            imageUrl: asset.imageUrl,
                            ...(editing.isNew && !editing.cosmetic.id ? { id: asset.id } : {}),
                            ...(!editing.cosmetic.name ? { name: asset.name } : {}),
                            ...(!editing.cosmetic.description ? { description: asset.description } : {}),
                          })}
                          style={{
                            padding: 4,
                            borderRadius: 8,
                            border: selected ? "2px solid #ffcf40" : "1px solid #3a2b1b",
                            background: selected ? "#2a1d0f" : "#140e09",
                            cursor: "pointer",
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={asset.imageUrl}
                            alt={asset.name}
                            style={{
                              width: asset.type === "card_back" ? 36 : 74,
                              height: asset.type === "card_back" ? 52 : 30,
                              objectFit: "contain",
                              display: "block",
                              borderRadius: 4,
                            }}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <ImageField
                kind="cosmetic"
                label={
                  editing.cosmetic.type === "avatar_frame"
                    ? "Cadre (PNG transparent, carré)"
                    : editing.cosmetic.type === "card_back"
                      ? "Dos de carte (portrait 5:7)"
                      : editing.cosmetic.type === "anim_style"
                        ? "Vignette de la collection (carré)"
                        : editing.cosmetic.type === "hand_arc"
                          ? "Arche circulaire (PNG/WebP transparent, 520×190)"
                          : "Badge (carré)"
                }
                value={editing.cosmetic.imageUrl}
                error={err("imageUrl")}
                onChange={(imageUrl) => patch({ imageUrl })}
              />
              <span className={styles.hint}>Astuce : envoyez un PNG/WebP à fond transparent pour les cadres, badges et arches (converti en WebP en gardant la transparence).</span>
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
            {visible.map((item) => {
              const isDefault =
                (item.type === "card_back" && savedDefaults.cardBack?.cosmeticId === item.id) ||
                (item.type === "hand_arc" && savedDefaults.handArc?.cosmeticId === item.id);
              return (
                <button key={item.id} type="button" onClick={() => setEditing({ cosmetic: item, isNew: false })} style={{ padding: 10, textAlign: "left", background: "#21180f", border: isDefault ? "1px solid #f2bb45" : "1px solid #3a2b1b", color: "inherit" }}>
                  {item.imageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={item.imageUrl} alt="" style={{ aspectRatio: item.type === "card_back" ? "5 / 7" : item.type === "hand_arc" ? "520 / 190" : "1", objectFit: "contain", background: "#0c0906", borderRadius: 8 }} />
                    : <div style={{ display: "grid", placeItems: "center", aspectRatio: "1", background: "#0c0906", borderRadius: 8, fontWeight: 900, color: RARITY_COLORS[item.rarity], padding: 8, textAlign: "center" }}>« {item.name} »</div>}
                  <strong style={{ display: "block", marginTop: 6 }}>{item.name}</strong>
                  <span className={styles.hint}>
                    {TYPE_LABELS[item.type]} · <span style={{ color: RARITY_COLORS[item.rarity] }}>{RARITY_LABELS[item.rarity]}</span>
                    {isDefault ? " · ★ par défaut" : ""}
                    {item.published ? "" : " · inactif"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

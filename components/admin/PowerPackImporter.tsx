"use client";

/* Import de packs de cartes Pouvoir depuis l'admin : on crée le pack (nom,
   description, format), puis on dépose une image par carte intégrée, nommée
   comme la carte (« vent_nord.png »…). Chaque image est réduite à 1 080 px
   dans le navigateur, puis le serveur la décline en 720 / 256 / 128 px.
   Les images vivent sur le serveur d'uploads, jamais dans git. Une carte sans
   image garde son illustration d'origine. */

import { useRef, useState, type DragEvent } from "react";
import { BUILTIN_POWER_ART_IDS, getImportedPowerPacks, IMPORTED_POWER_PACK_LIMITS, type ImportedPowerPack } from "@/domain/assetPacks";
import { setImportedPacks, useAssetPacks } from "@/lib/assetPack";
import { adminApi, adminErrorText, uploadPowerPackArt } from "./adminApi";
import styles from "./AdminConsole.module.css";

const MAX_SIDE = 1080;
const CARD_IDS: readonly string[] = BUILTIN_POWER_ART_IDS;

/** Nom de fichier → id de carte (« Vent-Nord.PNG » → « vent_nord »), ou null. */
export function cardIdFromFileName(fileName: string): string | null {
  const base = fileName.replace(/\.[a-z0-9]+$/i, "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return CARD_IDS.includes(base) ? base : null;
}

const cardLabel = (id: string) => id.replace(/_/g, " ");

/** Réduit l'image à 1 080 px de large au plus (sous la limite d'envoi de 3 Mo). */
async function shrinkForUpload(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / bitmap.width);
  if (scale === 1 && file.size <= 2.5 * 1024 * 1024) { bitmap.close(); return file; }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
  const webp = await encode("image/webp");
  return webp && webp.type === "image/webp" ? webp : (await encode("image/jpeg")) ?? file;
}

function replacePack(updated: ImportedPowerPack) {
  const packs = getImportedPowerPacks();
  setImportedPacks(packs.some((pack) => pack.id === updated.id) ? packs.map((pack) => (pack.id === updated.id ? updated : pack)) : [...packs, updated]);
}

interface Progress { done: number; total: number; current?: string; errors: string[]; ignored: string[] }

function ImportedPackCard({ pack, active }: { pack: ImportedPowerPack; active: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(pack.name);
  const [description, setDescription] = useState(pack.description);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const busy = progress !== null && progress.done < progress.total;
  const filled = CARD_IDS.filter((id) => pack.art[id]).length;

  async function importFiles(files: File[]) {
    const jobs = files.map((file) => ({ file, card: cardIdFromFileName(file.name) }));
    const ignored = jobs.filter((job) => !job.card).map((job) => job.file.name);
    const valid = jobs.filter((job): job is { file: File; card: string } => job.card !== null);
    setMessage(null);
    const state: Progress = { done: 0, total: valid.length, errors: [], ignored };
    setProgress({ ...state });
    for (const job of valid) {
      setProgress({ ...state, current: job.card });
      try {
        const { pack: updated } = await uploadPowerPackArt(pack.id, job.card, await shrinkForUpload(job.file));
        replacePack(updated);
      } catch (error) {
        state.errors.push(`${job.file.name} : ${adminErrorText(error)}`);
      }
      state.done += 1;
      setProgress({ ...state });
    }
  }

  async function saveDetails() {
    try {
      const { pack: updated } = await adminApi.savePowerPack({ id: pack.id, name, description, portrait: pack.portrait });
      replacePack(updated);
      setEditing(false);
      setMessage({ kind: "ok", text: "Pack mis à jour." });
    } catch (error) {
      setMessage({ kind: "error", text: `Enregistrement impossible : ${adminErrorText(error)}` });
    }
  }

  async function remove() {
    try {
      await adminApi.deletePowerPack(pack.id);
      setImportedPacks(getImportedPowerPacks().filter((item) => item.id !== pack.id));
    } catch (error) {
      setConfirmDelete(false);
      setMessage({ kind: "error", text: `Suppression impossible : ${adminErrorText(error)}` });
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!busy) void importFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 10, background: "#1b140d", border: active ? "2px solid #f2bb45" : "1px solid #352719" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        {editing ? (
          <div style={{ display: "grid", gap: 6, flex: 1, minWidth: 220 }}>
            <input aria-label="Nom du pack" value={name} maxLength={IMPORTED_POWER_PACK_LIMITS.name} onChange={(e) => setName(e.target.value)} />
            <input aria-label="Description du pack" value={description} maxLength={IMPORTED_POWER_PACK_LIMITS.description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        ) : (
          <div>
            <strong>{pack.name}</strong>{active && <span style={{ color: "#f2bb45", marginLeft: 8 }}>● actif</span>}
            <div className={styles.hint}>{pack.description || "Sans description"} · {pack.portrait ? "portrait 2:3" : "carré"} · {filled}/{CARD_IDS.length} cartes</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {editing ? (
            <>
              <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => void saveDetails()}>Enregistrer</button>
              <button type="button" className={styles.btn} onClick={() => { setEditing(false); setName(pack.name); setDescription(pack.description); }}>Annuler</button>
            </>
          ) : (
            <button type="button" className={styles.btn} onClick={() => setEditing(true)}>Renommer</button>
          )}
          {confirmDelete ? (
            <>
              <button type="button" className={`${styles.btn} ${styles.danger}`} onClick={() => void remove()}>Confirmer la suppression</button>
              <button type="button" className={styles.btn} onClick={() => setConfirmDelete(false)}>Garder</button>
            </>
          ) : (
            <button type="button" className={styles.btn} disabled={active} title={active ? "Activez un autre pack avant de supprimer celui-ci." : undefined} onClick={() => setConfirmDelete(true)}>Supprimer</button>
          )}
        </div>
      </div>

      {message && <div className={`${styles.notice} ${styles[message.kind]}`}>{message.text}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))", gap: 6, background: "#0c0906", borderRadius: 8, padding: 6 }}>
        {CARD_IDS.map((id) => {
          const art = pack.art[id];
          return (
            <figure key={id} title={cardLabel(id)} style={{ margin: 0, display: "grid", gap: 2, opacity: art ? 1 : 0.45 }}>
              {art ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={art.small} alt={cardLabel(id)} loading="lazy" width={64} height={pack.portrait ? 96 : 64} style={{ width: "100%", height: "auto", borderRadius: 4 }} />
              ) : (
                <div style={{ aspectRatio: pack.portrait ? "2 / 3" : "1", borderRadius: 4, border: "1px dashed #4a3a28" }} />
              )}
              <figcaption style={{ fontSize: 10, lineHeight: 1.2, color: "#b9a68a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cardLabel(id)}</figcaption>
            </figure>
          );
        })}
      </div>

      <div
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{ border: `1px dashed ${dragging ? "#f2bb45" : "#4a3a28"}`, borderRadius: 8, padding: 12, display: "grid", gap: 8, background: dragging ? "#241a10" : "transparent" }}
      >
        <div className={styles.hint} style={{ margin: 0 }}>
          Glissez ici les images du pack, ou choisissez-les. Une image par carte, nommée comme la carte : <code>vent_nord.png</code>, <code>oeil_sorcier.webp</code>… Une nouvelle image remplace la précédente.
        </div>
        <div>
          <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? `Import… ${progress!.done}/${progress!.total}` : "Choisir les images"}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) void importFiles(files); }}
          />
        </div>
        {progress && (
          <div className={styles.hint} style={{ margin: 0 }} aria-live="polite">
            {busy ? `Envoi de ${cardLabel(progress.current ?? "")}… ${progress.done}/${progress.total}` : `${progress.done - progress.errors.length} image(s) importée(s).`}
            {progress.ignored.length > 0 && <div>Ignorées (nom de carte inconnu) : {progress.ignored.join(", ")}</div>}
            {progress.errors.length > 0 && <div style={{ color: "#ff8a7a" }}>Erreurs : {progress.errors.join(" · ")}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Création et import des packs de cartes Pouvoir (images hors git, sur le serveur d'uploads). */
export function PowerPackImporter() {
  const active = useAssetPacks().powers;
  const packs = getImportedPowerPacks();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [portrait, setPortrait] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function create() {
    setCreating(true);
    setMessage(null);
    try {
      const { pack } = await adminApi.savePowerPack({ name, description, portrait });
      replacePack(pack);
      setName(""); setDescription(""); setPortrait(false);
      setMessage({ kind: "ok", text: `« ${pack.name} » créé. Déposez maintenant ses images.` });
    } catch (error) {
      setMessage({ kind: "error", text: `Création impossible : ${adminErrorText(error)}` });
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className={styles.panel}>
      <h2>Importer un pack de cartes Pouvoir</h2>
      <p className={styles.hint} style={{ marginTop: 0, marginBottom: 12 }}>
        Les images sont stockées sur le serveur, pas dans le code : un pack importé est disponible tout de suite, sans redéploiement.
        Une fois ses images déposées, activez-le dans « Pack de cartes Pouvoir ». Une carte sans image garde son illustration d&apos;origine.
      </p>
      {message && <div className={`${styles.notice} ${styles[message.kind]}`}>{message.text}</div>}
      <div className={styles.grid3} style={{ alignItems: "end", marginBottom: 14 }}>
        <label className={styles.field}><span>Nom du pack</span><input value={name} maxLength={IMPORTED_POWER_PACK_LIMITS.name} placeholder="Ex. Masques du Ndé" onChange={(e) => setName(e.target.value)} /></label>
        <label className={styles.field}><span>Description</span><input value={description} maxLength={IMPORTED_POWER_PACK_LIMITS.description} placeholder="Matière, style, ambiance" onChange={(e) => setDescription(e.target.value)} /></label>
        <label className={styles.check}><input type="checkbox" checked={portrait} onChange={(e) => setPortrait(e.target.checked)} /> Format portrait (2:3, illustration pleine carte)</label>
      </div>
      <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={creating || name.trim().length < 2 || packs.length >= IMPORTED_POWER_PACK_LIMITS.packs} onClick={() => void create()}>
        {creating ? "Création…" : "Créer le pack"}
      </button>
      {packs.length > 0 && (
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {packs.map((pack) => <ImportedPackCard key={pack.id} pack={pack} active={pack.id === active} />)}
        </div>
      )}
    </section>
  );
}

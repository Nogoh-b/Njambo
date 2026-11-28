"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type FormEvent, type ReactNode } from "react";
import { assetPackUrl, assetPacksForScope, BUILTIN_POWER_ART_IDS, getImportedPowerPacks, IMPORTED_POWER_PACK_LIMITS, powerPackSmallUrl, type AssetPackId, type ImportedPowerPack } from "@/domain/assetPacks";
import { CODE_POWER_MODULES } from "@/config/powers";
import { useAssetPackSync } from "@/hooks/useAssetPackSync";
import { setAssetPacks, setImportedPacks } from "@/lib/assetPack";
import { generateSecureId } from "@/lib/cryptoUtils";
import { cardIdFromFileName, POWER_PACK_ARCHIVE_LIMIT, readPowerPackArchive, type PowerPackArchiveDetails, type PowerPackImage } from "@/lib/powerPackArchive";
import { adminApi, adminErrorText, uploadPowerPackArchive, uploadPowerPackArt } from "./adminApi";
import { adminHref, powerPackHref } from "./adminRoutes";
import { exportPowerPack, optimizePowerPackImage, powerPackOriginal, powerPackZip } from "./powerPackImages";
import styles from "./AdminConsole.module.css";
import packStyles from "./PowerPackAdmin.module.css";

export { cardIdFromFileName } from "@/lib/powerPackArchive";

type Pack = ReturnType<typeof assetPacksForScope>[number];
type Notice = { kind: "ok" | "error"; text: string };
const EMPTY_DETAILS: PowerPackArchiveDetails = { name: "", description: "", portrait: false };
const IMAGES = "image/png,image/jpeg,image/webp";

function cardName(id: string) {
  const definition = CODE_POWER_MODULES[id as keyof typeof CODE_POWER_MODULES];
  return definition?.def.name ?? id;
}

function replacePack(updated: ImportedPowerPack) {
  const packs = getImportedPowerPacks();
  const existing = packs.find((pack) => pack.id === updated.id);
  if (existing && existing.updatedAt > updated.updatedAt) return;
  setImportedPacks(existing ? packs.map((pack) => pack.id === updated.id ? updated : pack) : [...packs, updated]);
}

function errorNotice(error: unknown): Notice {
  return { kind: "error", text: adminErrorText(error) };
}

function PackNotice({ notice }: { notice: Notice | null }) {
  return notice && <div role={notice.kind === "error" ? "alert" : "status"} className={`${styles.notice} ${styles[notice.kind]}`}>{notice.text}</div>;
}

function DetailsFields({ value, onChange, lockFormat = false }: { value: PowerPackArchiveDetails; onChange: (value: PowerPackArchiveDetails) => void; lockFormat?: boolean }) {
  return (
    <div className={styles.grid2}>
      <label className={styles.field}><span>Nom du pack</span><input required minLength={2} maxLength={IMPORTED_POWER_PACK_LIMITS.name} value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} /></label>
      <label className={styles.field}><span>Description</span><input maxLength={IMPORTED_POWER_PACK_LIMITS.description} value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} /></label>
      {!lockFormat && <label className={styles.check}><input type="checkbox" checked={value.portrait} onChange={(event) => onChange({ ...value, portrait: event.target.checked })} /> Format portrait (2:3)</label>}
    </div>
  );
}

function PackHeader({ title, children }: { title: string; children?: ReactNode }) {
  return <div className={styles.pageHead}><div><h1>{title}</h1>{children}</div></div>;
}

function PackThumbnail({ pack, imported, card }: { pack: Pack; imported?: ImportedPowerPack; card: string }) {
  const source = imported ? imported.art[card]?.small : powerPackSmallUrl(powerPackOriginal(card), pack.id);
  return (
    <div className={packStyles.thumb} data-portrait={pack.portrait === true}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {source && <img src={source} alt="" loading="lazy" decoding="async" />}
    </div>
  );
}

function PackList({ active, packs }: { active: AssetPackId; packs: readonly ImportedPowerPack[] }) {
  const router = useRouter();
  const zipInput = useRef<HTMLInputElement>(null);
  const retry = useRef<{ signature: string; key: string; zip: Blob } | null>(null);
  const [details, setDetails] = useState(EMPTY_DETAILS);
  const [archive, setArchive] = useState<{ file: string; images: PowerPackImage[] } | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [mode, setMode] = useState<"create" | "import" | null>(null);
  const atLimit = packs.length >= IMPORTED_POWER_PACK_LIMITS.packs;

  async function chooseFile(file: File) {
    setMode("import");
    setBusy("Lecture du ZIP…");
    setArchive(null);
    retry.current = null;
    setNotice(null);
    try {
      if (file.size > POWER_PACK_ARCHIVE_LIMIT) throw new Error("Le ZIP dépasse la taille maximale autorisée.");
      const parsed = await readPowerPackArchive(new Uint8Array(await file.arrayBuffer()));
      const name = file.name.replace(/\.zip$/i, "").slice(0, IMPORTED_POWER_PACK_LIMITS.name);
      setDetails(parsed.details ?? { ...EMPTY_DETAILS, name });
      setArchive({ file: file.name, images: parsed.images });
    } catch (error) {
      setNotice(errorNotice(error));
    } finally {
      setBusy("");
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || atLimit || (mode === "import" && !archive)) return;
    setBusy(archive ? "Préparation du pack…" : "Création du pack…");
    setNotice(null);
    const value = { ...details, name: details.name.trim(), description: details.description.trim() };
    try {
      if (value.name.length < 2) throw new Error("Le nom du pack doit contenir au moins deux caractères.");
      if (archive) {
        const signature = JSON.stringify(value);
        if (retry.current?.signature !== signature) {
          const images: PowerPackImage[] = [];
          for (const { card, data } of archive.images) {
            setBusy(`Optimisation ${images.length + 1}/${archive.images.length} · ${cardName(card)}`);
            try {
              const isWebp = new TextDecoder().decode(data.subarray(8, 12)) === "WEBP";
              const blob = await optimizePowerPackImage(new Blob([Uint8Array.from(data)], { type: isWebp ? "image/webp" : "" }), value.portrait);
              images.push({ card, data: new Uint8Array(await blob.arrayBuffer()) });
            } catch (error) {
              throw new Error(`${cardName(card)} – ${adminErrorText(error)}`);
            }
          }
          retry.current = { signature, key: generateSecureId(), zip: powerPackZip(value, images) };
        }
        setBusy("Envoi du pack…");
      }
      const receipt = archive ? retry.current : null;
      const { pack } = receipt ? await uploadPowerPackArchive(receipt.zip, receipt.key) : await adminApi.savePowerPack(value);
      replacePack(pack);
      router.push(powerPackHref(pack.id));
    } catch (error) {
      setNotice(errorNotice(error));
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <PackHeader title="Packs de cartes Pouvoir"><p>Choisissez les illustrations utilisées dans le jeu.</p></PackHeader>
      <PackNotice notice={notice} />
      <section className={styles.panel}>
        <div className={styles.row}>
          <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={Boolean(busy) || atLimit} onClick={() => zipInput.current?.click()}>Importer un ZIP</button>
          <button type="button" className={styles.btn} disabled={Boolean(busy) || atLimit} onClick={() => { setMode("create"); setArchive(null); setDetails(EMPTY_DETAILS); setNotice(null); }}>Créer un pack</button>
          <input ref={zipInput} type="file" hidden accept=".zip,application/zip" onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void chooseFile(file);
          }} />
        </div>
        <p className={styles.hint}>Importez un ZIP exporté par Njambo ou un ZIP d’images PNG, JPEG ou WebP nommées d’après les cartes, par exemple <code>vent_nord.webp</code>.</p>
        {atLimit && <p className={styles.hint}>La limite de {IMPORTED_POWER_PACK_LIMITS.packs} packs importés est atteinte.</p>}
        {mode && (mode === "create" || archive) && (
          <form className={packStyles.form} onSubmit={(event) => void save(event)}>
            {archive && <strong>{archive.file} · {archive.images.length} illustration(s)</strong>}
            <DetailsFields value={details} onChange={setDetails} />
            <div className={styles.row}>
              <button type="submit" className={`${styles.btn} ${styles.primary}`} disabled={Boolean(busy) || atLimit}>{archive ? "Importer le pack" : "Enregistrer le pack"}</button>
              <button type="button" className={styles.btn} disabled={Boolean(busy)} onClick={() => { setMode(null); setArchive(null); }}>Annuler</button>
            </div>
          </form>
        )}
        {busy && <p role="status" className={styles.hint}>{busy}</p>}
      </section>
      <section className={styles.panel}>
        <h2>Packs disponibles</h2>
        <div className={packStyles.packGrid}>
          {assetPacksForScope("powers", packs).map((pack) => {
            const imported = packs.find((item) => item.id === pack.id);
            const previews = imported ? BUILTIN_POWER_ART_IDS.filter((card) => imported.art[card]).slice(0, 3) : BUILTIN_POWER_ART_IDS.slice(0, 3);
            const count = imported ? Object.keys(imported.art).length : BUILTIN_POWER_ART_IDS.length;
            return (
              <article key={pack.id} className={packStyles.packTile} data-active={active === pack.id}>
                <div className={packStyles.previewStrip}>{previews.map((card) => <PackThumbnail key={card} pack={pack} imported={imported} card={card} />)}</div>
                <div><strong>{pack.name}</strong>{active === pack.id && <span className={packStyles.active}> Actif</span>}</div>
                <div className={styles.hint}>{count}/{BUILTIN_POWER_ART_IDS.length} cartes · {pack.portrait ? "Portrait" : "Carré"}</div>
                <Link className={styles.btn} href={powerPackHref(pack.id)} aria-label={`Ouvrir le pack ${pack.name}`}>Ouvrir le pack</Link>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}

function PackDetail({ pack, imported, active, canDuplicate }: { pack: Pack; imported?: ImportedPowerPack; active: boolean; canDuplicate: boolean }) {
  const router = useRouter();
  const bulkInput = useRef<HTMLInputElement>(null);
  const copyAttempt = useRef<{ key: string; zip: Blob } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState("");
  const [details, setDetails] = useState<PowerPackArchiveDetails | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function run(label: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setNotice(null);
    try { await action(); } catch (error) { setNotice(errorNotice(error)); } finally { setBusy(""); }
  }

  async function bulkUpload(files: File[]) {
    const failures: string[] = [];
    const seen = new Set<string>();
    let done = 0;
    for (const file of files) {
      const card = cardIdFromFileName(file.name);
      if (!card || seen.has(card)) { failures.push(file.name); continue; }
      seen.add(card);
      setBusy(`Import de ${cardName(card)}…`);
      try {
        const { pack: updated } = await uploadPowerPackArt(pack.id, card, await optimizePowerPackImage(file, pack.portrait === true));
        replacePack(updated);
        done += 1;
      } catch (error) {
        failures.push(`${file.name} – ${adminErrorText(error)}`);
      }
    }
    setNotice({ kind: failures.length ? "error" : "ok", text: `${done} image(s) importée(s).${failures.length ? ` Fichiers non importés (${failures.join(" · ")}).` : ""}` });
  }

  function download(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `njambo-${pack.id}.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice({ kind: "ok", text: `ZIP exporté (${Math.ceil(blob.size / 1000)} Ko).` });
  }

  return (
    <>
      <Link className={packStyles.back} href={adminHref("packs")}>← Tous les packs</Link>
      <PackHeader title={pack.name}><p>{pack.description}</p></PackHeader>
      <PackNotice notice={notice} />
      <section className={styles.panel}>
        <div className={styles.row}>
          <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={active || Boolean(busy)} onClick={() => void run("Activation…", async () => {
            await adminApi.saveAssetPack(pack.id, "powers");
            setAssetPacks({ powers: pack.id });
            setNotice({ kind: "ok", text: "Pack activé pour tous les joueurs." });
          })}>{active ? "Pack actif" : "Activer le pack"}</button>
          <button type="button" className={styles.btn} disabled={Boolean(busy)} onClick={() => void run("Préparation du ZIP…", async () => download(await exportPowerPack(pack, imported)))}>Exporter le ZIP</button>
          {imported ? (
            <>
              <button type="button" className={styles.btn} disabled={Boolean(busy)} onClick={() => setDetails({ name: imported.name, description: imported.description, portrait: imported.portrait })}>Modifier le pack</button>
              <button type="button" className={styles.btn} disabled={Boolean(busy)} onClick={() => bulkInput.current?.click()}>Importer des images</button>
              <input ref={bulkInput} hidden type="file" accept={IMAGES} multiple onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                if (files.length) void run("Import des images…", () => bulkUpload(files));
              }} />
              <button type="button" className={`${styles.btn} ${styles.danger}`} disabled={active || Boolean(busy)} onClick={() => setConfirmDelete(true)}>Supprimer</button>
            </>
          ) : <button type="button" className={styles.btn} disabled={!canDuplicate || Boolean(busy)} onClick={() => void run("Création de la copie…", async () => {
            const name = `${pack.name.slice(0, IMPORTED_POWER_PACK_LIMITS.name - 8)} (copie)`;
            copyAttempt.current ??= { key: generateSecureId(), zip: await exportPowerPack(pack, undefined, name) };
            const { pack: copy } = await uploadPowerPackArchive(copyAttempt.current.zip, copyAttempt.current.key);
            replacePack(copy);
            router.push(powerPackHref(copy.id));
          })}>Dupliquer pour modifier</button>}
        </div>
        {busy && <p role="status" className={styles.hint}>{busy}</p>}
        {imported && <p className={`${styles.hint} ${packStyles.drop}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
          event.preventDefault();
          const files = Array.from(event.dataTransfer.files);
          if (files.length) void run("Import des images…", () => bulkUpload(files));
        }}>Glissez les images ici ou sélectionnez-les avec « Importer des images ». Nommez-les d’après les cartes (par exemple <code>vent_nord.webp</code>).</p>}
        {details && <form className={packStyles.form} onSubmit={(event) => {
          event.preventDefault();
          void run("Enregistrement…", async () => {
            const { pack: updated } = await adminApi.savePowerPack({ ...details, id: pack.id });
            replacePack(updated);
            setDetails(null);
            setNotice({ kind: "ok", text: "Pack mis à jour." });
          });
        }}>
          <DetailsFields value={details} onChange={setDetails} lockFormat={Boolean(imported && Object.keys(imported.art).length)} />
          <div className={styles.row}>
            <button type="submit" className={`${styles.btn} ${styles.primary}`} disabled={Boolean(busy)}>Enregistrer</button>
            <button type="button" className={styles.btn} onClick={() => setDetails(null)}>Annuler</button>
          </div>
        </form>}
        {confirmDelete && <div className={`${styles.row} ${packStyles.form}`}>
          <span>Supprimer le pack « {pack.name} » ?</span>
          <button type="button" className={`${styles.btn} ${styles.danger}`} disabled={active || Boolean(busy)} onClick={() => void run("Suppression…", async () => {
            await adminApi.deletePowerPack(pack.id);
            setImportedPacks(getImportedPowerPacks().filter((item) => item.id !== pack.id));
            router.replace(adminHref("packs"));
          })}>Confirmer</button>
          <button type="button" className={styles.btn} onClick={() => setConfirmDelete(false)}>Annuler</button>
        </div>}
      </section>
      <section className={styles.panel}>
        <h2>Illustrations</h2>
        <div className={packStyles.cardGrid}>
          {BUILTIN_POWER_ART_IDS.map((card) => (
            <Link key={card} className={packStyles.cardTile} href={powerPackHref(pack.id, card)}>
              <PackThumbnail pack={pack} imported={imported} card={card} />
              <strong>{cardName(card)}</strong>
              {imported && !imported.art[card] && <span className={styles.hint}>Image d’origine</span>}
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

function CardDetail({ pack, imported, card }: { pack: Pack; imported?: ImportedPowerPack; card: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const art = imported?.art[card];
  const image = imported ? art?.url ?? powerPackOriginal(card) : assetPackUrl(powerPackOriginal(card), pack.id, "powers");

  async function update(file: File) {
    setBusy(true);
    setNotice(null);
    try {
      const { pack: updated } = await uploadPowerPackArt(pack.id, card, await optimizePowerPackImage(file, pack.portrait === true));
      replacePack(updated);
      setNotice({ kind: "ok", text: "Illustration enregistrée." });
    } catch (error) {
      setNotice(errorNotice(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link className={packStyles.back} href={powerPackHref(pack.id)}>← {pack.name}</Link>
      <PackHeader title={cardName(card)} />
      <PackNotice notice={notice} />
      <section className={`${styles.panel} ${packStyles.editor}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={packStyles.art} src={image} alt={`Illustration de la carte ${cardName(card)}`} />
        <div>
          {imported ? (
            <>
              {!art && <p className={styles.hint}>Cette carte utilise l’illustration d’origine.</p>}
              <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy} onClick={() => input.current?.click()}>{busy ? "Enregistrement…" : art ? "Remplacer l’illustration" : "Ajouter une illustration"}</button>
              <input ref={input} type="file" accept={IMAGES} hidden onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void update(file);
              }} />
              <p className={styles.hint}>L’image est recadrée au format {pack.portrait ? "portrait 2:3" : "carré"} du pack.</p>
            </>
          ) : <p className={styles.hint}>Pour modifier cette illustration, dupliquez le pack depuis sa page.</p>}
        </div>
      </section>
    </>
  );
}

export function PowerPackAdmin({ packId, cardId }: { packId?: string; cardId?: string }) {
  const [sync, setSync] = useState<{ error?: unknown } | null>(null);
  const onReady = useCallback((error?: unknown) => setSync({ error }), []);
  const active = useAssetPackSync(onReady).powers;
  const imported = getImportedPowerPacks();
  if (!packId) return <>
    {sync?.error != null && <PackNotice notice={{ kind: "error", text: "Impossible de charger la liste des packs importés." }} />}
    <PackList active={active} packs={imported} />
  </>;
  const pack = assetPacksForScope("powers", imported).find((item) => item.id === packId);
  if (!pack) return <>
    <Link className={packStyles.back} href={adminHref("packs")}>← Tous les packs</Link>
    <PackHeader title={sync?.error != null ? "Chargement impossible" : sync ? "Pack introuvable" : "Chargement du pack…"} />
  </>;
  const custom = imported.find((item) => item.id === packId);
  if (cardId) return <CardDetail pack={pack} imported={custom} card={cardId} />;
  return <PackDetail pack={pack} imported={custom} active={active === pack.id} canDuplicate={imported.length < IMPORTED_POWER_PACK_LIMITS.packs} />;
}

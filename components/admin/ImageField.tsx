"use client";

/* Choix d'une image : upload (PNG/JPEG/WebP ≤ 2 Mo → WebP sur le VPS) ou
   sélection dans la bibliothèque des images déjà envoyées. */

import { useEffect, useRef, useState } from "react";
import { adminApi, adminErrorText, uploadImage, type AdminUpload } from "./adminApi";
import styles from "./AdminConsole.module.css";

export function ImageField({ value, onChange, kind, label = "Image", error }: {
  value: string | undefined;
  onChange: (url: string | undefined) => void;
  kind: "event" | "boss" | "cosmetic" | "season" | "power";
  label?: string;
  error?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [library, setLibrary] = useState<AdminUpload[] | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);

  useEffect(() => {
    if (!showLibrary || library) return;
    adminApi.uploads(kind).then((result) => setLibrary(result.uploads)).catch((cause) => setMessage(adminErrorText(cause)));
  }, [showLibrary, library, kind]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await uploadImage(file, kind);
      onChange(result.url);
      setLibrary(null);
      setMessage(`Image envoyée (${result.width}×${result.height}, ${Math.round(result.bytes / 1024)} Ko).`);
    } catch (cause) {
      setMessage(adminErrorText(cause));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className={styles.imageField}>
      {/* eslint-disable-next-line @next/next/no-img-element -- aperçu d'une URL arbitraire (upload VPS) */}
      {value ? <img className={styles.imagePreview} src={value} alt="" /> : <div className={styles.imagePreview} aria-hidden="true" />}
      <div className={styles.field}>
        <span>{label}</span>
        <div className={styles.row}>
          <button type="button" className={styles.btn} disabled={busy} onClick={() => input.current?.click()}>{busy ? "Envoi…" : "Envoyer une image"}</button>
          <button type="button" className={styles.btn} onClick={() => setShowLibrary((open) => !open)}>{showLibrary ? "Fermer la bibliothèque" : "Bibliothèque"}</button>
          {value && <button type="button" className={`${styles.btn} ${styles.danger}`} onClick={() => onChange(undefined)}>Retirer</button>}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void onFile(event.target.files?.[0])} />
        <input value={value ?? ""} placeholder="/assets/… ou https://…" onChange={(event) => onChange(event.target.value.trim() || undefined)} />
        <span className={styles.hint}>PNG, JPEG ou WebP, 2 Mo max — converti en WebP (1600 px max).</span>
        {error && <span className={styles.fieldError}>{error}</span>}
        {message && <span className={styles.hint}>{message}</span>}
        {showLibrary && (
          library === null ? <span className={styles.hint}>Chargement…</span>
            : library.length === 0 ? <span className={styles.hint}>Aucune image envoyée pour l’instant.</span>
              : (
                <div className={styles.library}>
                  {library.map((upload) => (
                    <button key={upload.id} type="button" aria-pressed={upload.url === value} onClick={() => onChange(upload.url)} title={upload.path}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={upload.url} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              )
        )}
      </div>
    </div>
  );
}

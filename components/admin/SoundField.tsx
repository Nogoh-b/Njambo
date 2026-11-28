"use client";

/* Choix d'un son : préréglage studio IA (public/assets/njambo/audio/powers) ou son uploadé
   (MP3 / OGG / WAV / M4A ≤ 5 Mo → MP3 normalisé, 5 s max), Studio visuel (couper, vitesse,
   pitch, fondus), glisser-déposer, bibliothèque, écoute et volume.
   Valeur : « preset:<nom> » ou URL. */

import { useEffect, useRef, useState } from "react";
import { POWER_SOUND_PRESETS, isPresetSound, playPowerSound, resolvePowerSoundUrl } from "@/lib/powerSounds";
import { adminApi, adminErrorText, uploadAudio, type AdminUpload } from "./adminApi";
import { AudioStudioModal, type AudioStudioApplyPayload } from "./AudioStudioModal";
import { AudioWaveformThumb } from "./AudioWaveformThumb";
import styles from "./AdminConsole.module.css";
import studioStyles from "./AudioStudio.module.css";

function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/") || /\.(wav|mp3|ogg|m4a|aac)$/i.test(file.name);
}

export function SoundField({ label, value, volume = 1, onChange, onVolume, error, allowNone = true }: {
  label: string;
  value: string | undefined;
  volume?: number;
  onChange: (ref: string | undefined) => void;
  onVolume?: (volume: number) => void;
  error?: string;
  allowNone?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [library, setLibrary] = useState<AdminUpload[] | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [studioSource, setStudioSource] = useState<File | string | null | undefined>(undefined);

  useEffect(() => {
    if (!showLibrary || library) return;
    adminApi.uploads("audio").then((result) => setLibrary(result.uploads)).catch((cause) => setMessage(adminErrorText(cause)));
  }, [showLibrary, library]);

  const onFile = async (file: File | undefined, opts?: { rawGain?: boolean; label?: string }) => {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await uploadAudio(file, "sfx", opts);
      onChange(result.url);
      setLibrary(null);
      setMessage(`Son envoyé${result.converted ? " et converti en MP3" : ""}${result.durationMs ? ` (${(result.durationMs / 1000).toFixed(1)} s)` : ""}.`);
      playPowerSound(result.url, volume);
    } catch (cause) {
      setMessage(adminErrorText(cause));
      throw cause;
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const handleStudioApply = async (payload: AudioStudioApplyPayload) => {
    await onFile(payload.file, { rawGain: payload.rawGain, label: payload.label });
    setStudioSource(undefined);
  };

  const presetValue = value && isPresetSound(value) ? value : "";
  const fileName = value && !isPresetSound(value) ? value.split("/").pop() : null;
  const resolvedUrl = resolvePowerSoundUrl(value);

  return (
    <div
      className={`${styles.field} ${error ? styles.invalid : ""} ${dragOver ? studioStyles.dropZoneActive : ""}`}
      style={dragOver ? { borderRadius: 10, padding: 8, border: "1.5px dashed #f2bb45" } : undefined}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = Array.from(e.dataTransfer.files).find(isAudioFile);
        if (file) setStudioSource(file);
      }}
      onPaste={(e) => {
        const file = Array.from(e.clipboardData.files).find(isAudioFile);
        if (file) {
          e.preventDefault();
          setStudioSource(file);
        }
      }}
    >
      <span>{label}</span>
      <div className={styles.row}>
        <select className={styles.inlineSelect} value={presetValue} onChange={(e) => onChange(e.target.value || (allowNone ? undefined : "preset:pouvoir"))}>
          {allowNone ? <option value="">{fileName ? `Fichier : ${fileName}` : "Son commun de lancement (Sons & Audio)"}</option> : fileName ? <option value="">{`Fichier : ${fileName}`}</option> : null}
          {Object.entries(POWER_SOUND_PRESETS).map(([key, preset]) => <option key={key} value={`preset:${key}`}>♪ {preset.label}</option>)}
        </select>
        <button type="button" className={`${styles.btn} ${styles.small}`} disabled={!value} onClick={() => playPowerSound(value, volume)}>▶ Écouter</button>
        <button type="button" className={`${styles.btn} ${styles.small} ${styles.primary}`} disabled={busy} onClick={() => setStudioSource(resolvedUrl)}>✂ Studio</button>
        <button type="button" className={`${styles.btn} ${styles.small}`} disabled={busy} onClick={() => input.current?.click()}>{busy ? "Envoi…" : "Envoyer"}</button>
        <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => setShowLibrary((open) => !open)}>{showLibrary ? "Fermer" : "Bibliothèque"}</button>
        {value && allowNone && <button type="button" className={`${styles.btn} ${styles.small} ${styles.danger}`} onClick={() => onChange(undefined)}>Retirer</button>}
      </div>
      <input ref={input} type="file" accept="audio/mpeg,audio/ogg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,.mp3,.ogg,.wav,.m4a" hidden onChange={(e) => void onFile(e.target.files?.[0]).catch(() => undefined)} />
      {resolvedUrl && (
        <div className={styles.row} style={{ marginTop: 2 }}>
          <AudioWaveformThumb url={resolvedUrl} onClick={() => setStudioSource(resolvedUrl)} />
        </div>
      )}
      {onVolume && (
        <label className={styles.hint}>Volume : {Math.round(volume * 100)} %
          <input type="range" min={0} max={100} value={Math.round(volume * 100)} onChange={(e) => onVolume(Number(e.target.value) / 100)} />
        </label>
      )}
      <span className={styles.hint}>Glisse un fichier ici (ou Ctrl+V) · MP3, OGG, WAV ou M4A, 5 Mo max — converti en MP3 (stéréo préservée), 5 s max.</span>
      {error && <span className={styles.fieldError}>{error}</span>}
      {message && <span className={styles.hint}>{message}</span>}
      {showLibrary && (library === null ? <span className={styles.hint}>Chargement…</span> : library.length === 0 ? <span className={styles.hint}>Aucun son envoyé pour l’instant.</span> : (
        <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
          {library.map((item) => (
            <div key={item.id} className={styles.row} style={{ padding: "4px 8px", borderRadius: 8, background: item.url === value ? "#f2bb4522" : "#0c0906" }}>
              <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => playPowerSound(item.url, volume)}>▶</button>
              <span className={styles.hint} style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.label ? `${item.label} · ` : ""}
                {item.path.split("/").pop()}
                {item.durationMs ? ` · ${(item.durationMs / 1000).toFixed(1)} s` : ""}
              </span>
              <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => setStudioSource(item.url)}>✂</button>
              <button type="button" className={`${styles.btn} ${styles.small} ${styles.primary}`} onClick={() => onChange(item.url)}>Choisir</button>
            </div>
          ))}
        </div>
      ))}
      {studioSource !== undefined && (
        <AudioStudioModal
          title={label}
          role="sfx"
          initialSource={studioSource}
          onApply={handleStudioApply}
          onClose={() => setStudioSource(undefined)}
        />
      )}
    </div>
  );
}

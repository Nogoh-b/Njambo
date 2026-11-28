"use client";

/* ═══════════════ Modale Export / Import Pack Audio (.zip) ═══════════════
   Permet d'exporter la configuration audio complète (37 emplacements + cartes
   pouvoir, avec tous les fichiers audio embarqués) dans une archive `.zip`,
   ou d'importer un `.zip` existant avec aperçu et barre de progression. */

import { useRef, useState } from "react";
import type { AudioCatalogConfig } from "@/domain/audioCatalog";
import {
  exportAudioPackZip,
  importAudioPackZip,
  inspectAudioPackZip,
  type AudioPackInspection,
  type AudioPackProgress,
  type ImportedPowerCardPatch,
} from "@/lib/audio/audioPack";
import { adminApi, adminErrorText, uploadAudio, type AdminPowerCardRow } from "./adminApi";
import styles from "./AdminConsole.module.css";
import studioStyles from "./AudioStudio.module.css";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

export interface AudioPackModalProps {
  initialTab: "export" | "import";
  draft: AudioCatalogConfig;
  onImported: (result: {
    nextCatalog: AudioCatalogConfig;
    powerCardPatches: ImportedPowerCardPatch[];
    publishPowerCards: boolean;
    uploadedCount: number;
    warnings: string[];
  }) => Promise<void>;
  onClose: () => void;
}

export function AudioPackModal({ initialTab, draft, onImported, onClose }: AudioPackModalProps) {
  const [tab, setTab] = useState<"export" | "import">(initialTab);

  // Options Export
  const [includeDefaults, setIncludeDefaults] = useState(false);
  const [includePowerCards, setIncludePowerCards] = useState(true);

  // Options Import
  const [inspection, setInspection] = useState<AudioPackInspection | null>(null);
  const [importMode, setImportMode] = useState<"replace" | "merge">("replace");
  const [importPowerCards, setImportPowerCards] = useState(true);
  const [publishPowerCards, setPublishPowerCards] = useState(true);

  // État commun
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<AudioPackProgress | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExport = async () => {
    setBusy(true);
    setNotice(null);
    setProgress({ phase: "collect", current: 0, total: 1, label: "Préparation de l'export…" });
    try {
      let powerCards: AdminPowerCardRow[] | undefined;
      if (includePowerCards) {
        try {
          const res = await adminApi.powerCards();
          powerCards = res.cards;
        } catch {
          // Si non amorcé ou inaccessible, on continue avec le catalogue global
          powerCards = undefined;
        }
      }

      const { zipBytes, fileCount, warnings } = await exportAudioPackZip({
        catalog: draft,
        powerCards,
        includeDefaults,
        includePowerCards: Boolean(includePowerCards && powerCards),
        onProgress: setProgress,
      });

      const copy = new Uint8Array(zipBytes.length);
      copy.set(zipBytes);
      const blob = new Blob([copy], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const dateStamp = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `njambo-audio-pack-${dateStamp}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);

      setNotice({
        kind: "ok",
        text: `Pack exporté (${formatBytes(zipBytes.length)}, ${fileCount} fichier(s) audio embarqué(s))${warnings.length > 0 ? ` — ${warnings.length} avertissement(s)` : ""}.`,
      });
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorText(cause) });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handlePickZip = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setNotice(null);
    setInspection(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const info = await inspectAudioPackZip(bytes);
      setInspection(info);
      setImportPowerCards(info.powerCardIds.length > 0);
    } catch (cause) {
      setNotice({ kind: "error", text: cause instanceof Error ? cause.message : "Archive ZIP invalide." });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!inspection) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await importAudioPackZip({
        inspection,
        currentCatalog: draft,
        mode: importMode,
        importPowerCards: importPowerCards && inspection.powerCardIds.length > 0,
        uploadAudio: (file, role, opts) => uploadAudio(file, role, opts),
        onProgress: setProgress,
      });

      setProgress({ phase: "apply", current: 1, total: 1, label: "Application de la configuration…" });
      await onImported({
        ...result,
        publishPowerCards,
      });
      onClose();
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorText(cause) });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className={studioStyles.backdrop} role="dialog" aria-modal="true" aria-label="Exporter ou importer un pack audio">
      <div className={studioStyles.modal} style={{ width: "min(620px, 100%)" }}>
        <div className={studioStyles.head}>
          <div>
            <h2>Pack audio complet (.zip)</h2>
            <p className={studioStyles.subtitle}>
              Sauvegarde, transfère ou restaure ta configuration audio avec tous les fichiers inclus.
            </p>
          </div>
          <button type="button" className={`${styles.btn} ${styles.small}`} disabled={busy} onClick={onClose}>
            ✕ Fermer
          </button>
        </div>

        <div className={styles.tabs} role="tablist" style={{ marginBottom: 4 }}>
          <button type="button" role="tab" className={styles.tab} aria-selected={tab === "export"} disabled={busy} onClick={() => setTab("export")}>
            ⬇ Exporter un pack
          </button>
          <button type="button" role="tab" className={styles.tab} aria-selected={tab === "import"} disabled={busy} onClick={() => setTab("import")}>
            ⬆ Importer un pack
          </button>
        </div>

        {notice && <div className={`${styles.notice} ${styles[notice.kind]}`} style={{ marginBottom: 0 }}>{notice.text}</div>}

        {tab === "export" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div className={studioStyles.controlCard}>
              <h3>Contenu de l&apos;archive</h3>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={includePowerCards}
                  disabled={busy}
                  onChange={(e) => setIncludePowerCards(e.target.checked)}
                />
                Inclure les sons des 21 cartes pouvoir (activation + pistes de chorégraphie)
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={includeDefaults}
                  disabled={busy}
                  onChange={(e) => setIncludeDefaults(e.target.checked)}
                />
                Inclure aussi les sons par défaut du jeu (pack 100 % autonome, plus lourd)
              </label>
              <p className={styles.hint} style={{ margin: 0 }}>
                Les fichiers audio partagés entre plusieurs emplacements sont automatiquement dédupliqués dans le ZIP.
              </p>
            </div>

            {progress && (
              <div style={{ display: "grid", gap: 6 }}>
                <div className={styles.hint}>
                  {progress.label} ({progress.current}/{progress.total})
                </div>
                <div className={studioStyles.progressTrack}>
                  <div className={studioStyles.progressFill} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}

            <div className={studioStyles.footer}>
              <span className={styles.hint}>Format : <code>njambo-audio-pack-AAAA-MM-JJ.zip</code></span>
              <div className={styles.row}>
                <button type="button" className={styles.btn} disabled={busy} onClick={onClose}>Fermer</button>
                <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy} onClick={() => void handleExport()}>
                  {busy ? "Création du ZIP…" : "⬇ Télécharger le pack (.zip)"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div
              className={studioStyles.dropZone}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = Array.from(e.dataTransfer.files).find((f) => f.name.toLowerCase().endsWith(".zip"));
                if (file) void handlePickZip(file);
              }}
            >
              <div>
                <strong>Choisis ou glisse une archive <code>.zip</code> NJAMBO</strong>
                <div className={styles.hint}>Chaque fichier audio est envoyé individuellement au serveur (aucune limite de taille globale).</div>
              </div>
              <button type="button" className={`${styles.btn} ${styles.small} ${styles.primary}`} disabled={busy} onClick={() => fileInputRef.current?.click()}>
                Parcourir…
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip"
                hidden
                onChange={(e) => {
                  void handlePickZip(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>

            {inspection && (
              <div className={studioStyles.controlCard}>
                <h3>Aperçu du pack détecté</h3>
                <div className={styles.kpis}>
                  <div className={styles.kpi}><span>Emplacements</span><strong>{inspection.slotIds.length}</strong></div>
                  <div className={styles.kpi}><span>Cartes pouvoir</span><strong>{inspection.powerCardIds.length}</strong></div>
                  <div className={styles.kpi}><span>Fichiers audio</span><strong>{inspection.audioFiles.length}</strong></div>
                  <div className={styles.kpi}><span>Poids audio</span><strong>{formatBytes(inspection.totalAudioBytes)}</strong></div>
                </div>
                <div className={styles.hint}>
                  Exporté le : {new Date(inspection.manifest.exportedAt).toLocaleString("fr-FR")}
                </div>

                <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
                  <label className={styles.check}>
                    <input type="radio" name="importMode" checked={importMode === "replace"} onChange={() => setImportMode("replace")} />
                    Remplacer toute la configuration actuelle (Sons &amp; Audio)
                  </label>
                  <label className={styles.check}>
                    <input type="radio" name="importMode" checked={importMode === "merge"} onChange={() => setImportMode("merge")} />
                    Fusionner (conserver mes autres réglages non présents dans ce ZIP)
                  </label>

                  {inspection.powerCardIds.length > 0 && (
                    <>
                      <label className={styles.check}>
                        <input type="checkbox" checked={importPowerCards} onChange={(e) => setImportPowerCards(e.target.checked)} />
                        Importer aussi les sons des {inspection.powerCardIds.length} carte(s) pouvoir
                      </label>
                      {importPowerCards && (
                        <label className={styles.check} style={{ marginLeft: 24 }}>
                          <input type="checkbox" checked={publishPowerCards} onChange={(e) => setPublishPowerCards(e.target.checked)} />
                          Publier automatiquement les cartes pouvoir modifiées
                        </label>
                      )}
                    </>
                  )}
                </div>

                {inspection.warnings.length > 0 && (
                  <div className={`${styles.notice} ${styles.error}`} style={{ marginBottom: 0 }}>
                    {inspection.warnings.map((w) => <div key={w}>⚠ {w}</div>)}
                  </div>
                )}
              </div>
            )}

            {progress && (
              <div style={{ display: "grid", gap: 6 }}>
                <div className={styles.hint}>
                  Envoi vers le serveur : <strong>{progress.label}</strong> ({progress.current}/{progress.total})
                </div>
                <div className={studioStyles.progressTrack}>
                  <div className={studioStyles.progressFill} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}

            <div className={studioStyles.footer}>
              <span className={styles.hint}>Après import, clique sur « Enregistrer &amp; publier » pour appliquer aux joueurs.</span>
              <div className={styles.row}>
                <button type="button" className={styles.btn} disabled={busy} onClick={onClose}>Annuler</button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.primary}`}
                  disabled={!inspection || busy}
                  onClick={() => void handleConfirmImport()}
                >
                  {busy ? "Import en cours…" : "⬆ Importer ce pack"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

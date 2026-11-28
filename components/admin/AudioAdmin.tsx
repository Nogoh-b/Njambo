"use client";

/* ═══════════════ Console admin — Sons & Audio du jeu ═══════════════
   Permet d'écouter, visualiser (forme d'onde), importer (glisser-déposer,
   Ctrl+V, sélecteur), éditer dans le Studio visuel (couper, accélérer/ralentir,
   pitch, fondus, gain, reverse), régler le volume, couper, réinitialiser et
   exporter/importer l'ensemble de la configuration + fichiers audio (.zip). */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AUDIO_CATEGORIES,
  GAME_SOUND_BY_ID,
  GAME_SOUND_SLOTS,
  normalizeAudioCatalogConfig,
  type AudioCatalogConfig,
  type AudioCategoryId,
  type AudioSlotOverride,
  type ChangelogAdminSection,
  type GameSoundId,
  type GameSoundSlot,
} from "@/domain";
import { listPowerModules } from "@/config/powers/registry";
import { useAudioCatalogSync } from "@/hooks/useAudioCatalogSync";
import { audioEngine } from "@/lib/audio/AudioEngine";
import { resolveGameSound, setAudioCatalogConfig } from "@/lib/audio/audioCatalogStore";
import { playPowerSound, POWER_SOUND_PRESETS, isPresetSound, resolvePowerSoundUrl } from "@/lib/powerSounds";
import type { ImportedPowerCardPatch } from "@/lib/audio/audioPack";
import { adminApi, adminErrorText, uploadAudio, type AdminPowerCardRow, type AdminUpload } from "./adminApi";
import { AudioStudioModal, type AudioStudioApplyPayload } from "./AudioStudioModal";
import { AudioWaveformThumb } from "./AudioWaveformThumb";
import { AudioPackModal } from "./AudioPackModal";
import styles from "./AdminConsole.module.css";
import studioStyles from "./AudioStudio.module.css";

function fileLabelOf(url: string | null): string {
  if (!url) return "Silencieux";
  const last = url.split("/").pop() ?? url;
  return decodeURIComponent(last);
}

function formatDuration(ms?: number | null): string {
  if (!ms || ms <= 0) return "";
  if (ms >= 60_000) {
    const mins = Math.floor(ms / 60_000);
    const secs = Math.round((ms % 60_000) / 1000);
    return `${mins} min ${secs.toString().padStart(2, "0")} s`;
  }
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${Math.round(bytes / 1024)} Ko`;
}

function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/") || /\.(wav|mp3|ogg|m4a|aac)$/i.test(file.name);
}

type StudioTarget =
  | { kind: "slot"; slot: GameSoundSlot; source: File | string | null }
  | { kind: "power"; cardId: string; cardName: string; source: File | string | null };

export function AudioAdmin({ onOpenSection }: { onOpenSection?(section: ChangelogAdminSection): void }) {
  const liveConfig = useAudioCatalogSync();
  const [draft, setDraft] = useState<AudioCatalogConfig>(() => normalizeAudioCatalogConfig(liveConfig));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [category, setCategory] = useState<AudioCategoryId | "all">("all");
  const [search, setSearch] = useState("");
  const [library, setLibrary] = useState<AdminUpload[] | null>(null);
  const [openLibSlot, setOpenLibSlot] = useState<GameSoundId | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<GameSoundId | null>(null);
  const [playingMusicId, setPlayingMusicId] = useState<GameSoundId | null>(null);

  // Interactions visuelles : sélection pour Ctrl+V, drag-over, Studio visuel, Pack ZIP
  const [selectedSlotId, setSelectedSlotId] = useState<GameSoundId | null>(null);
  const [dragOverSlotId, setDragOverSlotId] = useState<GameSoundId | null>(null);
  const [dragOverPowerId, setDragOverPowerId] = useState<string | null>(null);
  const [studioTarget, setStudioTarget] = useState<StudioTarget | null>(null);
  const [packModalTab, setPackModalTab] = useState<"export" | "import" | null>(null);
  const [livePowerCards, setLivePowerCards] = useState<AdminPowerCardRow[] | null>(null);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputsRef = useRef<Partial<Record<GameSoundId, HTMLInputElement | null>>>({});

  // Synchronise le brouillon avec la config serveur tant qu'aucune modification locale n'est en cours.
  useEffect(() => {
    if (!dirty) setDraft(normalizeAudioCatalogConfig(liveConfig));
  }, [liveConfig, dirty]);

  // Charge les cartes pouvoir live depuis le back (pour afficher leurs vrais sons configurés)
  useEffect(() => {
    let alive = true;
    adminApi.powerCards()
      .then((res) => { if (alive) setLivePowerCards(res.cards); })
      .catch(() => { /* repli silencieux sur listPowerModules() */ });
    return () => { alive = false; };
  }, []);

  // Charge la bibliothèque audio dès qu'on ouvre un sélecteur de bibliothèque.
  useEffect(() => {
    if (!openLibSlot || library !== null) return;
    adminApi.uploads("audio")
      .then((res) => setLibrary(res.uploads))
      .catch((cause) => setNotice({ kind: "error", text: adminErrorText(cause) }));
  }, [openLibSlot, library]);

  // Stoppe toute musique en écoute à la fermeture de la page.
  useEffect(() => () => {
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
  }, []);

  // Coller (Ctrl+V) un fichier audio directement sur l'emplacement sélectionné
  useEffect(() => {
    if (studioTarget || packModalTab) return;
    const onPaste = (event: ClipboardEvent) => {
      if (!selectedSlotId) return;
      const files = event.clipboardData?.files;
      if (!files || files.length === 0) return;
      const file = Array.from(files).find(isAudioFile);
      if (!file) return;
      event.preventDefault();
      const slot = GAME_SOUND_BY_ID[selectedSlotId];
      if (slot) setStudioTarget({ kind: "slot", slot, source: file });
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [selectedSlotId, studioTarget, packModalTab]);

  const stopPreviewMusic = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
      previewAudioRef.current = null;
    }
    setPlayingMusicId(null);
  };

  const previewSlot = (slot: GameSoundSlot) => {
    const resolved = resolveGameSound(slot.id, draft);
    if (!resolved.url) return;

    if (slot.kind === "music") {
      if (playingMusicId === slot.id) {
        stopPreviewMusic();
        return;
      }
      stopPreviewMusic();
      const el = new Audio(resolved.url);
      el.loop = true;
      el.volume = Math.max(0, Math.min(1, resolved.volume));
      previewAudioRef.current = el;
      setPlayingMusicId(slot.id);
      void el.play().catch(() => setPlayingMusicId(null));
      return;
    }

    // SFX : lecture immédiate via AudioEngine (même moteur que le jeu)
    audioEngine.setMuted("sfx", false);
    void audioEngine.playSfx({
      url: resolved.url,
      pool: resolved.pool,
      volume: resolved.volume,
      pitchJitter: 0,
      maxPolyphony: 4,
    });
  };

  const previewUrl = (url: string, isMusic: boolean) => {
    if (isMusic) {
      stopPreviewMusic();
      const el = new Audio(url);
      el.volume = 0.75;
      previewAudioRef.current = el;
      void el.play().catch(() => {});
      return;
    }
    audioEngine.setMuted("sfx", false);
    void audioEngine.playSfx({ url, volume: 0.95, maxPolyphony: 4 });
  };

  const patchSlot = (id: GameSoundId, patch: Partial<AudioSlotOverride> | null) => {
    setDraft((prev) => {
      const nextSlots = { ...prev.slots };
      if (patch === null) {
        delete nextSlots[id];
      } else {
        const current = nextSlots[id] ?? {};
        const merged: AudioSlotOverride = { ...current, ...patch };
        if (merged.enabled === true) delete merged.enabled;
        if (!merged.url) delete merged.url;
        if (merged.volume !== undefined && Math.abs(merged.volume - GAME_SOUND_BY_ID[id].defaultVolume) < 0.005) {
          delete merged.volume;
        }
        if (Object.keys(merged).length === 0) delete nextSlots[id];
        else nextSlots[id] = merged;
      }
      return { ...prev, slots: nextSlots };
    });
    setDirty(true);
    setNotice(null);
  };

  const handleUpload = async (
    slot: GameSoundSlot,
    file: File | undefined,
    opts?: { rawGain?: boolean; label?: string },
  ) => {
    if (!file) return;
    setUploadingSlot(slot.id);
    setNotice(null);
    try {
      const result = await uploadAudio(file, slot.kind, opts);
      patchSlot(slot.id, { url: result.url, enabled: true });
      setLibrary(null);
      setNotice({
        kind: "ok",
        text: `Fichier envoyé pour « ${slot.label} »${result.converted ? " (converti & normalisé en MP3)" : ""}${result.durationMs ? ` · ${formatDuration(result.durationMs)}` : ""}. Pense à cliquer sur « Enregistrer & publier ».`,
      });
      previewUrl(result.url, slot.kind === "music");
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorText(cause) });
      throw cause;
    } finally {
      setUploadingSlot(null);
      const input = fileInputsRef.current[slot.id];
      if (input) input.value = "";
    }
  };

  const handleStudioApply = async (payload: AudioStudioApplyPayload) => {
    if (!studioTarget) return;
    if (studioTarget.kind === "slot") {
      await handleUpload(studioTarget.slot, payload.file, {
        rawGain: payload.rawGain,
        label: payload.label,
      });
      setStudioTarget(null);
      return;
    }

    // Carte pouvoir : envoie le son, met à jour le brouillon et publie la carte
    const uploaded = await uploadAudio(payload.file, "sfx", {
      rawGain: payload.rawGain,
      label: payload.label,
    });
    const detail = await adminApi.powerCard(studioTarget.cardId);
    const working = detail.working;
    if (!working) throw new Error("Carte pouvoir introuvable en base (pense à migrer les cartes pouvoir dans Outils).");
    const nextDef = {
      ...working.def,
      sound: { ref: uploaded.url, ...(working.def.sound?.volume !== undefined ? { volume: working.def.sound.volume } : {}) },
    };
    await adminApi.savePowerCardDraft({ def: nextDef, script: working.script, dev: working.dev });
    await adminApi.publishPowerCard(studioTarget.cardId);
    const refreshed = await adminApi.powerCards().catch(() => null);
    if (refreshed) setLivePowerCards(refreshed.cards);
    setLibrary(null);
    setStudioTarget(null);
    setNotice({
      kind: "ok",
      text: `Son d'activation mis à jour et publié pour la carte « ${studioTarget.cardName} »${uploaded.durationMs ? ` · ${formatDuration(uploaded.durationMs)}` : ""}.`,
    });
    audioEngine.setMuted("sfx", false);
    void playPowerSound(uploaded.url, nextDef.sound.volume ?? 1);
  };

  const handlePackImported = async (result: {
    nextCatalog: AudioCatalogConfig;
    powerCardPatches: ImportedPowerCardPatch[];
    publishPowerCards: boolean;
    uploadedCount: number;
    warnings: string[];
  }) => {
    setDraft(normalizeAudioCatalogConfig(result.nextCatalog));
    setDirty(true);
    setLibrary(null);

    let updatedPowers = 0;
    const powerErrors: string[] = [];
    for (const patch of result.powerCardPatches) {
      try {
        const detail = await adminApi.powerCard(patch.cardId);
        const working = detail.working;
        if (!working) continue;
        const nextDef = patch.sound ? { ...working.def, sound: patch.sound } : working.def;
        let nextScript = working.script;
        if (patch.choreoSounds && patch.choreoSounds.length > 0) {
          const steps = (working.script.steps ?? []).map((step, idx) => {
            const matching = patch.choreoSounds!.filter((c) => c.stepIndex === idx);
            if (matching.length === 0 || !step.choreo) return step;
            const tracks = step.choreo.tracks.map((track) => {
              if (track.kind !== "sound") return track;
              const hit = matching.find((m) => m.trackId === track.id);
              if (!hit) return track;
              return { ...track, sound: hit.sound, ...(hit.volume !== undefined ? { volume: hit.volume } : {}) };
            });
            return { ...step, choreo: { ...step.choreo, tracks } };
          });
          nextScript = { ...working.script, steps };
        }
        await adminApi.savePowerCardDraft({ def: nextDef, script: nextScript, dev: working.dev });
        if (result.publishPowerCards) {
          await adminApi.publishPowerCard(patch.cardId);
        }
        updatedPowers += 1;
      } catch (cause) {
        powerErrors.push(`${patch.cardId} (${adminErrorText(cause)})`);
      }
    }

    if (updatedPowers > 0) {
      const refreshed = await adminApi.powerCards().catch(() => null);
      if (refreshed) setLivePowerCards(refreshed.cards);
    }

    const parts = [
      `Pack importé : ${result.uploadedCount} fichier(s) audio envoyé(s), brouillon Sons & Audio chargé`,
      updatedPowers > 0 ? `${updatedPowers} carte(s) pouvoir ${result.publishPowerCards ? "publiée(s)" : "en brouillon"}` : null,
      powerErrors.length > 0 ? `échec sur ${powerErrors.length} carte(s)` : null,
    ].filter(Boolean);
    setNotice({
      kind: powerErrors.length > 0 ? "error" : "ok",
      text: `${parts.join(" · ")}. Clique sur « Enregistrer & publier » pour appliquer les emplacements Sons & Audio.`,
    });
  };

  const saveAll = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const normalized = normalizeAudioCatalogConfig(draft);
      const res = await adminApi.saveAudioConfig(normalized);
      setAudioCatalogConfig(res.config);
      setDraft(normalizeAudioCatalogConfig(res.config));
      setDirty(false);
      setNotice({
        kind: "ok",
        text: "Catalogue audio publié ! Tous les joueurs reçoivent tes nouveaux sons en direct, sans redémarrage.",
      });
    } catch (cause) {
      setNotice({ kind: "error", text: `Enregistrement impossible : ${adminErrorText(cause)}` });
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    setDraft({ slots: {} });
    setDirty(true);
    setNotice({ kind: "ok", text: "Tous les emplacements ont été remis par défaut dans le brouillon. Clique sur « Enregistrer & publier » pour appliquer." });
  };

  const stats = useMemo(() => {
    let customized = 0;
    let muted = 0;
    for (const slot of GAME_SOUND_SLOTS) {
      const ov = draft.slots[slot.id];
      if (!ov) continue;
      if (ov.enabled === false) muted += 1;
      if (ov.url || ov.volume !== undefined || ov.enabled === false) customized += 1;
    }
    return { total: GAME_SOUND_SLOTS.length, customized, muted };
  }, [draft]);

  const needle = search.trim().toLowerCase();
  const visibleSlots = useMemo(() => {
    return GAME_SOUND_SLOTS.filter((slot) => {
      if (category !== "all" && slot.category !== category) return false;
      if (!needle) return true;
      return (
        slot.label.toLowerCase().includes(needle) ||
        slot.description.toLowerCase().includes(needle) ||
        slot.id.toLowerCase().includes(needle)
      );
    });
  }, [category, needle]);

  const groupedSlots = useMemo(() => {
    return AUDIO_CATEGORIES
      .map((cat) => ({ cat, slots: visibleSlots.filter((s) => s.category === cat.id) }))
      .filter((group) => group.slots.length > 0);
  }, [visibleSlots]);

  const powerCards = useMemo(() => {
    if (livePowerCards && livePowerCards.length > 0) return livePowerCards;
    return listPowerModules();
  }, [livePowerCards]);

  return (
    <div>
      <div className={styles.pageHead}>
        <div>
          <h1>Sons &amp; Audio du jeu</h1>
          <p>
            Glisse-dépose un <code>.wav</code>/<code>.mp3</code> sur n&apos;importe quel emplacement (ou clique puis <strong>Ctrl+V</strong>) pour l&apos;éditer visuellement dans le <strong>Studio</strong> (couper, accélérer/ralentir, pitch, fondus) et exporte ou importe ton pack complet en <code>.zip</code>.
          </p>
        </div>
        <div className={styles.row}>
          {playingMusicId && (
            <button type="button" className={`${styles.btn} ${styles.small}`} onClick={stopPreviewMusic}>
              ■ Stop musique
            </button>
          )}
          <button type="button" className={styles.btn} disabled={saving} onClick={() => setPackModalTab("export")}>
            ⬇ Exporter pack (.zip)
          </button>
          <button type="button" className={styles.btn} disabled={saving} onClick={() => setPackModalTab("import")}>
            ⬆ Importer pack (.zip)
          </button>
          {dirty && (
            <button
              type="button"
              className={styles.btn}
              disabled={saving}
              onClick={() => { setDraft(normalizeAudioCatalogConfig(liveConfig)); setDirty(false); setNotice(null); }}
            >
              Annuler
            </button>
          )}
          <button type="button" className={styles.btn} disabled={saving || stats.customized === 0} onClick={resetAll}>
            Tout par défaut
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.primary}`}
            disabled={saving || !dirty}
            onClick={() => void saveAll()}
          >
            {saving ? "Publication…" : dirty ? "Enregistrer & publier" : "À jour"}
          </button>
        </div>
      </div>

      {notice && <div className={`${styles.notice} ${styles[notice.kind]}`}>{notice.text}</div>}

      <section className={styles.panel}>
        <div className={styles.kpis}>
          <div className={styles.kpi}><span>Emplacements audio</span><strong>{stats.total}</strong></div>
          <div className={styles.kpi}><span>Personnalisés</span><strong>{stats.customized}</strong></div>
          <div className={styles.kpi}><span>Coupés</span><strong>{stats.muted}</strong></div>
          <div className={styles.kpi}><span>Cartes pouvoir</span><strong>{powerCards.length}</strong></div>
        </div>

        <div className={styles.row} style={{ marginTop: 14, flexWrap: "wrap", gap: 8 }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un moment (bouton, boutique, modal, deck, dépôt, chargement…)"
            style={{
              flex: "1 1 260px",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #3c2e1f",
              background: "#0c0906",
              color: "#fff8ea",
              font: "inherit",
            }}
          />
          {selectedSlotId && (
            <span className={studioStyles.badgeOk}>
              📋 Ctrl+V prêt sur : {GAME_SOUND_BY_ID[selectedSlotId]?.label}
            </span>
          )}
        </div>

        <div className={styles.tabs} role="tablist" style={{ marginTop: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={category === "all"}
            onClick={() => setCategory("all")}
          >
            Tous ({GAME_SOUND_SLOTS.length})
          </button>
          {AUDIO_CATEGORIES.map((cat) => {
            const count = GAME_SOUND_SLOTS.filter((s) => s.category === cat.id).length;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                className={styles.tab}
                aria-selected={category === cat.id}
                onClick={() => setCategory(cat.id)}
              >
                {cat.label} ({count})
              </button>
            );
          })}
        </div>
      </section>

      {groupedSlots.length === 0 ? (
        <section className={styles.panel}>
          <p className={styles.empty}>Aucun emplacement sonore ne correspond à « {search} ».</p>
        </section>
      ) : (
        groupedSlots.map(({ cat, slots }) => (
          <section key={cat.id} className={styles.panel}>
            <div className={styles.row} style={{ justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap" }}>
              <div>
                <h2 style={{ marginBottom: 4 }}>{cat.label}</h2>
                <p className={styles.hint} style={{ marginTop: 0, marginBottom: 12 }}>{cat.description}</p>
              </div>
              {cat.id === "powers" && onOpenSection && (
                <button type="button" className={`${styles.btn} ${styles.small} ${styles.primary}`} onClick={() => onOpenSection("powers")}>
                  Ouvrir Cartes de pouvoir →
                </button>
              )}
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {slots.map((slot) => {
                const resolved = resolveGameSound(slot.id, draft);
                const ov = draft.slots[slot.id];
                const isCustomUrl = Boolean(ov?.url);
                const isMuted = ov?.enabled === false;
                const isPlaying = playingMusicId === slot.id;
                const isBusy = uploadingSlot === slot.id;
                const libOpen = openLibSlot === slot.id;
                const isDragOver = dragOverSlotId === slot.id;
                const isSelected = selectedSlotId === slot.id;

                const cardClasses = [
                  studioStyles.slotCard,
                  resolved.customized ? studioStyles.slotCardCustomized : "",
                  isMuted ? studioStyles.slotCardMuted : "",
                  isSelected ? studioStyles.slotCardSelected : "",
                  isDragOver ? studioStyles.slotCardDragOver : "",
                ].filter(Boolean).join(" ");

                return (
                  <div
                    key={slot.id}
                    className={cardClasses}
                    onClick={() => setSelectedSlotId(slot.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverSlotId !== slot.id) setDragOverSlotId(slot.id);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        setDragOverSlotId((prev) => (prev === slot.id ? null : prev));
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverSlotId(null);
                      const file = Array.from(e.dataTransfer.files).find(isAudioFile);
                      if (file) {
                        setSelectedSlotId(slot.id);
                        setStudioTarget({ kind: "slot", slot, source: file });
                      }
                    }}
                  >
                    <div className={styles.row} style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                        <div className={styles.row} style={{ gap: 8, flexWrap: "wrap" }}>
                          <strong>{slot.label}</strong>
                          <code style={{ fontSize: 11, opacity: 0.65 }}>{slot.id}</code>
                          {isMuted ? (
                            <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 99, background: "#5b1e24", color: "#ffb8c0" }}>Coupé</span>
                          ) : isCustomUrl ? (
                            <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 99, background: "#3c2e10", color: "#ffd76a" }}>Personnalisé</span>
                          ) : (
                            <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 99, background: "#1e2a28", color: "#9ee6d9" }}>Défaut</span>
                          )}
                          {isDragOver && (
                            <span className={studioStyles.badgeOk}>⬇ Déposer pour éditer dans le Studio</span>
                          )}
                        </div>
                        <div className={styles.hint} style={{ marginTop: 3 }}>{slot.description}</div>
                        <div className={styles.hint} style={{ marginTop: 2, color: "#d7c29e" }}>
                          Fichier : <code>{fileLabelOf(resolved.url)}</code>
                          {resolved.pool && resolved.pool.length > 1 ? ` (+${resolved.pool.length - 1} variante${resolved.pool.length > 2 ? "s" : ""})` : ""}
                          {slot.kind === "music" ? " · Boucle stéréo (≤ 12 Mo, 4 min max)" : " · Effet court (≤ 5 Mo, 5 s max)"}
                        </div>
                      </div>

                      <div className={styles.row} style={{ gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.small}`}
                          disabled={!resolved.url}
                          onClick={(e) => { e.stopPropagation(); previewSlot(slot); }}
                        >
                          {isPlaying ? "■ Stop" : "▶ Écouter"}
                        </button>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.small} ${styles.primary}`}
                          disabled={isBusy}
                          onClick={(e) => {
                            e.stopPropagation();
                            setStudioTarget({ kind: "slot", slot, source: resolved.url });
                          }}
                        >
                          ✂ Studio
                        </button>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.small}`}
                          disabled={isBusy}
                          onClick={(e) => { e.stopPropagation(); fileInputsRef.current[slot.id]?.click(); }}
                          title="Envoi direct sans passer par le Studio"
                        >
                          {isBusy ? "Envoi…" : "Envoyer"}
                        </button>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.small}`}
                          onClick={(e) => { e.stopPropagation(); setOpenLibSlot(libOpen ? null : slot.id); }}
                        >
                          {libOpen ? "Fermer biblio" : "Bibliothèque"}
                        </button>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.small} ${isMuted ? styles.primary : ""}`}
                          onClick={(e) => { e.stopPropagation(); patchSlot(slot.id, { enabled: isMuted }); }}
                        >
                          {isMuted ? "Réactiver" : "Couper"}
                        </button>
                        {resolved.customized && (
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.small} ${styles.danger}`}
                            onClick={(e) => { e.stopPropagation(); patchSlot(slot.id, null); }}
                          >
                            ↺ Défaut
                          </button>
                        )}
                      </div>
                    </div>

                    <input
                      ref={(el) => { fileInputsRef.current[slot.id] = el; }}
                      type="file"
                      accept="audio/mpeg,audio/ogg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,.mp3,.ogg,.wav,.m4a"
                      hidden
                      onChange={(e) => void handleUpload(slot, e.target.files?.[0]).catch(() => undefined)}
                    />

                    <div className={styles.row} style={{ gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                      <div className={styles.row} style={{ gap: 10, alignItems: "center" }}>
                        <AudioWaveformThumb
                          url={resolved.url}
                          accent={isCustomUrl ? "#f2bb45" : "#7fd4c4"}
                          onClick={() => setStudioTarget({ kind: "slot", slot, source: resolved.url })}
                        />
                        <label className={styles.hint} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 220 }}>
                          <span>Volume : <strong>{Math.round(resolved.volume * 100)} %</strong></span>
                          <input
                            type="range"
                            min={0}
                            max={150}
                            step={5}
                            disabled={isMuted}
                            value={Math.round(resolved.volume * 100)}
                            onChange={(e) => patchSlot(slot.id, { volume: Number(e.target.value) / 100 })}
                            style={{ flex: 1, accentColor: "#f2bb45" }}
                          />
                        </label>
                      </div>
                      <span className={styles.hint}>
                        Glisse un fichier ici ou clique + Ctrl+V
                      </span>
                    </div>

                    {libOpen && (
                      <div style={{ display: "grid", gap: 4, padding: 8, borderRadius: 8, background: "#0c0906", border: "1px solid #2e2217" }}>
                        <div className={styles.row} style={{ justifyContent: "space-between" }}>
                          <span className={styles.hint}>Bibliothèque des sons envoyés sur le serveur</span>
                          <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => setLibrary(null)}>Actualiser</button>
                        </div>
                        {library === null ? (
                          <span className={styles.hint}>Chargement…</span>
                        ) : library.length === 0 ? (
                          <span className={styles.hint}>Aucun fichier envoyé pour l&apos;instant. Glisse un son ou clique sur « Studio ».</span>
                        ) : (
                          library.map((item) => {
                            const selected = resolved.url === item.url;
                            const isMusicUpload = item.audioRole === "music" || (item.durationMs ?? 0) > 6000;
                            return (
                              <div
                                key={item.id}
                                className={styles.row}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: 6,
                                  background: selected ? "#f2bb4522" : "#16100b",
                                  gap: 8,
                                }}
                              >
                                <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => previewUrl(item.url, isMusicUpload)}>▶</button>
                                <span className={styles.hint} style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {isMusicUpload ? "🎵 " : "♪ "}
                                  {item.label ? `${item.label} ` : ""}
                                  <code style={{ opacity: 0.65 }}>{fileLabelOf(item.path)}</code>
                                  {item.durationMs ? ` · ${formatDuration(item.durationMs)}` : ""}
                                  {item.bytes ? ` · ${formatBytes(item.bytes)}` : ""}
                                </span>
                                <button
                                  type="button"
                                  className={`${styles.btn} ${styles.small}`}
                                  onClick={() => setStudioTarget({ kind: "slot", slot, source: item.url })}
                                >
                                  ✂
                                </button>
                                <button
                                  type="button"
                                  className={`${styles.btn} ${styles.small} ${styles.primary}`}
                                  onClick={() => { patchSlot(slot.id, { url: item.url, enabled: true }); setOpenLibSlot(null); }}
                                >
                                  {selected ? "Choisi" : "Choisir"}
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      {/* Récapitulatif interactif dédié aux cartes pouvoir (drag & drop + Studio directs) */}
      {(category === "all" || category === "powers") && (
        <section className={styles.panel}>
          <div className={styles.row} style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <h2 style={{ marginBottom: 4 }}>Effets propres aux cartes de pouvoir (multi-sons)</h2>
              <p className={styles.hint} style={{ marginTop: 0 }}>
                Tu peux glisser-déposer un <code>.wav</code>/<code>.mp3</code> directement sur une ligne de carte ci-dessous ou cliquer sur <strong>✂ Studio</strong> pour éditer son son d&apos;activation. Les pistes multi-sons synchronisées se gèrent dans <em>Cartes de pouvoir → Chorégraphie</em>.
              </p>
            </div>
            {onOpenSection && (
              <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => onOpenSection("powers")}>
                Éditer les chorégraphies →
              </button>
            )}
          </div>

          <div className={styles.tableWrap} style={{ marginTop: 12 }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Carte pouvoir</th>
                  <th>Son d&apos;activation</th>
                  <th>Forme d&apos;onde</th>
                  <th>Chorégraphie</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {powerCards.map((entry) => {
                  const activationRef = entry.def.sound?.ref;
                  const resolvedUrl = activationRef
                    ? resolvePowerSoundUrl(activationRef)
                    : resolveGameSound("power_play", draft).url;
                  const activationLabel = !activationRef
                    ? "Commun (power_play)"
                    : isPresetSound(activationRef)
                      ? `Preset : ${POWER_SOUND_PRESETS[activationRef.slice(7)]?.label ?? activationRef}`
                      : fileLabelOf(activationRef);
                  const choreoSounds = (entry.script?.steps ?? []).flatMap((step) =>
                    (step.choreo?.tracks ?? []).filter((track) => track.kind === "sound"),
                  );
                  const isOver = dragOverPowerId === entry.def.id;
                  return (
                    <tr
                      key={entry.def.id}
                      style={isOver ? { background: "rgba(242, 187, 69, 0.14)" } : undefined}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverPowerId !== entry.def.id) setDragOverPowerId(entry.def.id);
                      }}
                      onDragLeave={() => setDragOverPowerId((prev) => (prev === entry.def.id ? null : prev))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverPowerId(null);
                        const file = Array.from(e.dataTransfer.files).find(isAudioFile);
                        if (file) {
                          setStudioTarget({ kind: "power", cardId: entry.def.id, cardName: entry.def.name, source: file });
                        }
                      }}
                    >
                      <td><strong>{entry.def.name}</strong> <code style={{ fontSize: 11, opacity: 0.6 }}>{entry.def.id}</code></td>
                      <td>{activationLabel}</td>
                      <td>
                        <AudioWaveformThumb
                          url={resolvedUrl}
                          accent={activationRef && !isPresetSound(activationRef) ? "#f2bb45" : "#7fd4c4"}
                          onClick={() => setStudioTarget({ kind: "power", cardId: entry.def.id, cardName: entry.def.name, source: resolvedUrl })}
                        />
                      </td>
                      <td>{choreoSounds.length === 0 ? <span className={styles.hint}>Aucune piste</span> : `${choreoSounds.length} piste(s)`}</td>
                      <td>
                        <div className={styles.row} style={{ gap: 6 }}>
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.small}`}
                            onClick={() => {
                              audioEngine.setMuted("sfx", false);
                              if (activationRef) void playPowerSound(activationRef, entry.def.sound?.volume ?? 1);
                              else previewSlot(GAME_SOUND_BY_ID.power_play);
                            }}
                          >
                            ▶
                          </button>
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.small} ${styles.primary}`}
                            onClick={() => setStudioTarget({ kind: "power", cardId: entry.def.id, cardName: entry.def.name, source: resolvedUrl })}
                          >
                            ✂ Studio
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {studioTarget && (
        <AudioStudioModal
          title={studioTarget.kind === "slot" ? studioTarget.slot.label : `Carte pouvoir · ${studioTarget.cardName}`}
          subtitle={
            studioTarget.kind === "slot"
              ? studioTarget.slot.description
              : "Son d'activation joué chez tous les joueurs au déclenchement de la carte"
          }
          role={studioTarget.kind === "slot" ? studioTarget.slot.kind : "sfx"}
          initialSource={studioTarget.source}
          onApply={handleStudioApply}
          onClose={() => setStudioTarget(null)}
        />
      )}

      {packModalTab && (
        <AudioPackModal
          initialTab={packModalTab}
          draft={draft}
          onImported={handlePackImported}
          onClose={() => setPackModalTab(null)}
        />
      )}
    </div>
  );
}

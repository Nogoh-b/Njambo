"use client";

/* ═══════════════ Console admin — Sons & Audio du jeu ═══════════════
   Permet d'écouter, remplacer, régler le volume, couper ou réinitialiser
   CHAQUE moment sonore du jeu (musiques, boutons, modales, boutique, tirages,
   chargement de partie, deck/cartes, résultats).

   Les cartes pouvoir conservent leur section dédiée (« Cartes de pouvoir »)
   pour leurs effets multi-sons ; seul le son commun de lancement (`power_play`)
   est réglé ici, avec un récapitulatif et un raccourci direct vers l'éditeur. */

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
import { playPowerSound, POWER_SOUND_PRESETS, isPresetSound } from "@/lib/powerSounds";
import { adminApi, adminErrorText, uploadAudio, type AdminUpload } from "./adminApi";
import styles from "./AdminConsole.module.css";

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
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputsRef = useRef<Partial<Record<GameSoundId, HTMLInputElement | null>>>({});

  // Synchronise le brouillon avec la config serveur tant qu'aucune modification locale n'est en cours.
  useEffect(() => {
    if (!dirty) setDraft(normalizeAudioCatalogConfig(liveConfig));
  }, [liveConfig, dirty]);

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

  const handleUpload = async (slot: GameSoundSlot, file: File | undefined) => {
    if (!file) return;
    setUploadingSlot(slot.id);
    setNotice(null);
    try {
      const result = await uploadAudio(file, slot.kind);
      patchSlot(slot.id, { url: result.url, enabled: true });
      setLibrary(null);
      setNotice({
        kind: "ok",
        text: `Fichier envoyé pour « ${slot.label} »${result.converted ? " (converti & normalisé en MP3)" : ""}${result.durationMs ? ` · ${formatDuration(result.durationMs)}` : ""}. Pense à cliquer sur « Enregistrer & publier ».`,
      });
      previewUrl(result.url, slot.kind === "music");
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorText(cause) });
    } finally {
      setUploadingSlot(null);
      const input = fileInputsRef.current[slot.id];
      if (input) input.value = "";
    }
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

  const powerCards = useMemo(() => listPowerModules(), []);

  return (
    <div>
      <div className={styles.pageHead}>
        <div>
          <h1>Sons &amp; Audio du jeu</h1>
          <p>
            Pilote chaque son de l&apos;application (musiques, boutons, modales, boutique, tirages, chargement, deck, dépôt et résultats).
            Les effets multi-sons propres à chaque carte pouvoir se gèrent dans <strong>Cartes de pouvoir</strong>.
          </p>
        </div>
        <div className={styles.row}>
          {playingMusicId && (
            <button type="button" className={`${styles.btn} ${styles.small}`} onClick={stopPreviewMusic}>
              ■ Stop musique
            </button>
          )}
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
        </div>

        <div className={styles.tabs} style={{ marginTop: 12, flexWrap: "wrap" }}>
          <button
            type="button"
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

                return (
                  <div
                    key={slot.id}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      background: isMuted ? "#140f0c" : "#1b140d",
                      border: resolved.customized ? "1px solid #f2bb4566" : "1px solid #352719",
                      opacity: isMuted ? 0.68 : 1,
                      display: "grid",
                      gap: 8,
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
                        </div>
                        <div className={styles.hint} style={{ marginTop: 3 }}>{slot.description}</div>
                        <div className={styles.hint} style={{ marginTop: 2, color: "#d7c29e" }}>
                          Fichier : <code>{fileLabelOf(resolved.url)}</code>
                          {resolved.pool && resolved.pool.length > 1 ? ` (+${resolved.pool.length - 1} variante${resolved.pool.length > 2 ? "s" : ""})` : ""}
                          {slot.kind === "music" ? " · Boucle stéréo (≤ 6 Mo, 4 min max)" : " · Effet court (≤ 500 Ko, 5 s max)"}
                        </div>
                      </div>

                      <div className={styles.row} style={{ gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.small}`}
                          disabled={!resolved.url}
                          onClick={() => previewSlot(slot)}
                        >
                          {isPlaying ? "■ Stop" : "▶ Écouter"}
                        </button>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.small} ${styles.primary}`}
                          disabled={isBusy}
                          onClick={() => fileInputsRef.current[slot.id]?.click()}
                        >
                          {isBusy ? "Envoi…" : "Envoyer un fichier"}
                        </button>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.small}`}
                          onClick={() => setOpenLibSlot(libOpen ? null : slot.id)}
                        >
                          {libOpen ? "Fermer biblio" : "Bibliothèque"}
                        </button>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.small} ${isMuted ? styles.primary : ""}`}
                          onClick={() => patchSlot(slot.id, { enabled: isMuted })}
                        >
                          {isMuted ? "Réactiver" : "Couper"}
                        </button>
                        {resolved.customized && (
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.small} ${styles.danger}`}
                            onClick={() => patchSlot(slot.id, null)}
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
                      onChange={(e) => void handleUpload(slot, e.target.files?.[0])}
                    />

                    <div className={styles.row} style={{ gap: 10, alignItems: "center" }}>
                      <label className={styles.hint} style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 1 280px" }}>
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

                    {libOpen && (
                      <div style={{ display: "grid", gap: 4, padding: 8, borderRadius: 8, background: "#0c0906", border: "1px solid #2e2217" }}>
                        <div className={styles.row} style={{ justifyContent: "space-between" }}>
                          <span className={styles.hint}>Bibliothèque des sons envoyés sur le serveur</span>
                          <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => setLibrary(null)}>Actualiser</button>
                        </div>
                        {library === null ? (
                          <span className={styles.hint}>Chargement…</span>
                        ) : library.length === 0 ? (
                          <span className={styles.hint}>Aucun fichier envoyé pour l&apos;instant. Clique sur « Envoyer un fichier » pour en ajouter un.</span>
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
                                  {fileLabelOf(item.path)}
                                  {item.durationMs ? ` · ${formatDuration(item.durationMs)}` : ""}
                                  {item.bytes ? ` · ${formatBytes(item.bytes)}` : ""}
                                </span>
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

      {/* Récapitulatif dédié aux cartes pouvoir : séparation claire avec leurs effets multi-sons */}
      {(category === "all" || category === "powers") && (
        <section className={styles.panel}>
          <div className={styles.row} style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <h2 style={{ marginBottom: 4 }}>Effets propres aux cartes de pouvoir (multi-sons)</h2>
              <p className={styles.hint} style={{ marginTop: 0 }}>
                Chaque carte pouvoir possède son propre son d&apos;activation (onglet <em>Identité</em>) et peut déclencher plusieurs sons synchronisés sur sa timeline (onglet <em>Chorégraphie → + Piste son</em>).
              </p>
            </div>
            {onOpenSection && (
              <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => onOpenSection("powers")}>
                Éditer les sons des cartes pouvoir →
              </button>
            )}
          </div>

          <div className={styles.tableWrap} style={{ marginTop: 12 }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Carte pouvoir</th>
                  <th>Son d&apos;activation</th>
                  <th>Pistes son (chorégraphie)</th>
                  <th>Écoute</th>
                </tr>
              </thead>
              <tbody>
                {powerCards.map((entry) => {
                  const activationRef = entry.def.sound?.ref;
                  const activationLabel = !activationRef
                    ? "Commun (power_play)"
                    : isPresetSound(activationRef)
                      ? `Preset : ${POWER_SOUND_PRESETS[activationRef.slice(7)]?.label ?? activationRef}`
                      : fileLabelOf(activationRef);
                  const choreoSounds = (entry.script?.steps ?? []).flatMap((step) =>
                    (step.choreo?.tracks ?? []).filter((track) => track.kind === "sound"),
                  );
                  return (
                    <tr key={entry.def.id}>
                      <td><strong>{entry.def.name}</strong> <code style={{ fontSize: 11, opacity: 0.6 }}>{entry.def.id}</code></td>
                      <td>{activationLabel}</td>
                      <td>{choreoSounds.length === 0 ? <span className={styles.hint}>Aucune piste</span> : `${choreoSounds.length} piste(s)`}</td>
                      <td>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.small}`}
                          onClick={() => {
                            if (activationRef) playPowerSound(activationRef, entry.def.sound?.volume ?? 1);
                            else previewSlot(GAME_SOUND_BY_ID.power_play);
                          }}
                        >
                          ▶
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

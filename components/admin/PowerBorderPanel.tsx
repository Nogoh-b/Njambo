"use client";

/* ═══════════════ Sélecteur admin : texte, ombrage, bordures & particules des cartes Pouvoir ═══════════════
   - Galerie temps réel des 7 mises en page de texte & ombrage (Actuel + 6 itérations)
     affichées directement sur les vraies cartes Pouvoir du jeu avec la bordure et le pack actifs.
   - Galerie des 11 bordures (Ndop classique + 10 itérations avec particules) et contrôles
     globaux des particules. Synchronisé instantanément partout via runtime_config/asset_pack. */

import { useMemo, useState } from "react";
import { CODE_POWER_MODULES } from "@/config/powers";
import { PowerCardView } from "@/components/power/PowerCardView";
import {
  POWER_BORDERS,
  POWER_BORDER_PARTICLE_LABELS,
  POWER_BORDER_PARTICLE_MODES,
  POWER_CARD_TEXT_LAYOUTS,
  type PowerBorderConfig,
  type PowerBorderId,
  type PowerBorderParticlesMode,
  type PowerCardTextLayout,
} from "@/domain/powerBorders";
import { setPowerBorderConfig, usePowerBorderConfig } from "@/lib/powerBorderStore";
import type { PowerCardDef, PowerRarity } from "@/types/game";
import { adminApi, adminErrorText } from "./adminApi";
import styles from "./AdminConsole.module.css";

const SAMPLE_CARD_IDS = [
  "pluie_etoiles",
  "eclair_mfoundi",
  "bouclier_village",
  "oeil_sorcier",
  "vent_nord",
  "masque_bluffeur",
  "cauris_chanceux",
] as const;

const PREVIEW_RARITIES: Array<{ id: PowerRarity; label: string }> = [
  { id: "common", label: "Commune" },
  { id: "rare", label: "Rare" },
  { id: "epic", label: "Épique" },
  { id: "legendary", label: "Légendaire" },
];

export function PowerBorderPanel() {
  const active = usePowerBorderConfig();
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [sampleCardId, setSampleCardId] = useState<(typeof SAMPLE_CARD_IDS)[number]>("pluie_etoiles");
  const [previewRarity, setPreviewRarity] = useState<PowerRarity>("epic");
  const [distinctCardsPerLayout, setDistinctCardsPerLayout] = useState(true);
  const [previewHoverOpen, setPreviewHoverOpen] = useState(false);
  const [previewCompactText, setPreviewCompactText] = useState(false);

  const previewCard = useMemo<PowerCardDef>(() => {
    const base = CODE_POWER_MODULES[sampleCardId]?.def ?? Object.values(CODE_POWER_MODULES)[0]!.def;
    return { ...base, rarity: previewRarity, border: undefined, borderParticles: undefined };
  }, [sampleCardId, previewRarity]);

  const distinctCards = useMemo<PowerCardDef[]>(() => {
    const fallback = Object.values(CODE_POWER_MODULES)[0]!.def;
    return SAMPLE_CARD_IDS.map((id) => {
      const base = CODE_POWER_MODULES[id]?.def ?? fallback;
      return { ...base, border: undefined, borderParticles: undefined };
    });
  }, []);

  async function saveConfig(next: PowerBorderConfig, label: string, key: string) {
    setSaving(key);
    setMessage(null);
    try {
      await adminApi.savePowerBorder(next);
      setPowerBorderConfig(next);
      setMessage({
        kind: "ok",
        text: `${label} — appliqué instantanément sur tous les écrans du jeu.`,
      });
    } catch (error) {
      setMessage({ kind: "error", text: `Enregistrement impossible : ${adminErrorText(error)}` });
    } finally {
      setSaving(null);
    }
  }

  const pickBorder = (border: PowerBorderId) => {
    const item = POWER_BORDERS.find((b) => b.id === border);
    void saveConfig({ ...active, border }, `Bordure « ${item?.name ?? border} » activée`, `border:${border}`);
  };

  const pickTextLayout = (textLayout: PowerCardTextLayout) => {
    const item = POWER_CARD_TEXT_LAYOUTS.find((l) => l.id === textLayout);
    void saveConfig(
      { ...active, textLayout },
      `Style de texte « ${item?.name ?? textLayout} » activé`,
      `text:${textLayout}`,
    );
  };

  const pickParticles = (particles: PowerBorderParticlesMode) => {
    void saveConfig(
      { ...active, particles },
      `Particules réglées sur « ${POWER_BORDER_PARTICLE_LABELS[particles]} »`,
      `particles:${particles}`,
    );
  };

  const particlesEnabled = active.particles !== "off";
  const lastActiveIntensity: Exclude<PowerBorderParticlesMode, "off"> =
    active.particles === "off" ? "normal" : active.particles;

  const toggleParticles = () => {
    const nextMode: PowerBorderParticlesMode = particlesEnabled ? "off" : lastActiveIntensity;
    void saveConfig(
      { ...active, particles: nextMode },
      nextMode === "off"
        ? "Particules désactivées sur toutes les cartes Pouvoir"
        : `Particules réactivées (${POWER_BORDER_PARTICLE_LABELS[nextMode]})`,
      `particles:${nextMode}`,
    );
  };

  const toggleOnPortrait = (onPortrait: boolean) => {
    void saveConfig(
      { ...active, onPortrait },
      onPortrait ? "Bordures et particules activées aussi sur les packs Portrait" : "Packs Portrait affichés sans bordure ajoutée",
      "onPortrait",
    );
  };

  return (
    <>
      {/* ═══════════ 1. TEXTE & OMBRAGE DES CARTES POUVOIR (7 ITÉRATIONS EN TEMPS RÉEL) ═══════════ */}
      <section className={styles.panel}>
        <div className={styles.row} style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>Texte &amp; ombrage des cartes Pouvoir</h2>
            <p className={styles.hint} style={{ marginTop: 0 }}>
              Compare en temps réel le rendu actuel et les 6 itérations allégées sur les vraies cartes du jeu (avec le pack d&apos;illustrations et la bordure actifs). Le style choisi s&apos;applique aussitôt dans <em>Ma Collection</em>, la <em>Boutique</em> et en partie.
            </p>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            borderRadius: 10,
            background: "#120d08",
            border: "1px solid #352719",
            marginBottom: 12,
          }}
        >
          <div className={styles.row} style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.small} ${distinctCardsPerLayout ? styles.primary : ""}`}
              onClick={() => setDistinctCardsPerLayout(true)}
            >
              7 cartes réelles du jeu
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.small} ${!distinctCardsPerLayout ? styles.primary : ""}`}
              onClick={() => setDistinctCardsPerLayout(false)}
            >
              Même carte sur les 7
            </button>
            {!distinctCardsPerLayout && (
              <select
                className={styles.inlineSelect}
                aria-label="Carte d'aperçu texte"
                value={sampleCardId}
                onChange={(e) => setSampleCardId(e.target.value as (typeof SAMPLE_CARD_IDS)[number])}
              >
                {SAMPLE_CARD_IDS.map((id) => (
                  <option key={id} value={id}>
                    {CODE_POWER_MODULES[id]?.def.name ?? id}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className={styles.row} style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.small} ${previewCompactText ? styles.primary : ""}`}
              onClick={() => setPreviewCompactText((prev) => !prev)}
            >
              {previewCompactText ? "Taille : Compacte" : "Taille : Normale"}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.small} ${previewHoverOpen ? styles.primary : ""}`}
              onClick={() => setPreviewHoverOpen((prev) => !prev)}
            >
              {previewHoverOpen ? "Tiroir Survol : Ouvert" : "Tiroir Survol : Repos"}
            </button>
          </div>
        </div>

        {message && <div className={`${styles.notice} ${styles[message.kind]}`}>{message.text}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(235px, 1fr))", gap: 14 }}>
          {POWER_CARD_TEXT_LAYOUTS.map((item, idx) => {
            const isActive = item.id === active.textLayout;
            const cardForTile = distinctCardsPerLayout
              ? (distinctCards[idx % distinctCards.length] ?? previewCard)
              : previewCard;

            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  padding: 12,
                  borderRadius: 12,
                  background: "#1b140d",
                  border: isActive ? "2px solid #f2bb45" : "1px solid #352719",
                }}
              >
                <div className={styles.row} style={{ justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                  <span
                    className={styles.hint}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: isActive ? "#f2bb45" : item.id === "classique" ? "#ff9e9e" : "#bda98d",
                    }}
                  >
                    {idx === 0 ? "0 · Actuel" : `Itération ${idx} · ${item.badge}`}
                  </span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: isActive ? "#f2bb45" : "#9bb5ac" }}>
                    {isActive ? "● actif" : item.coverage}
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    placeItems: "center",
                    minHeight: 280,
                    padding: "20px 14px",
                    borderRadius: 10,
                    background: "radial-gradient(ellipse 75% 60% at 50% 50%, rgba(255, 207, 64, 0.08), transparent 72%), #0b0806",
                  }}
                >
                  <PowerCardView
                    card={cardForTile}
                    borderOverride={active.border}
                    particlesOverride={active.particles}
                    onPortraitOverride={active.onPortrait}
                    textLayoutOverride={item.id}
                    showClassicOnPortrait={item.id === "classique"}
                    revealHoverDrawer={item.id === "survol" && previewHoverOpen}
                    compact={previewCompactText}
                  />
                </div>

                <div>
                  <strong>{item.name}</strong>
                  <div className={styles.hint} style={{ marginTop: 2 }}>{item.description}</div>
                  <div className={styles.hint} style={{ marginTop: 4, color: "#d4c3a7" }}>
                    Carte affichée : <strong>{cardForTile.name}</strong> · {item.coverage}
                  </div>
                </div>

                <button
                  type="button"
                  className={`${styles.btn} ${isActive ? "" : styles.primary}`}
                  disabled={isActive || saving !== null}
                  onClick={() => pickTextLayout(item.id)}
                  style={{ marginTop: "auto" }}
                >
                  {saving === `text:${item.id}` ? "Activation…" : isActive ? "Style actif" : "Utiliser ce style"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══════════ 2. BORDURES & PARTICULES DES CARTES POUVOIR ═══════════ */}
      <section className={styles.panel}>
        <div className={styles.row} style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>Bordures &amp; particules des cartes Pouvoir</h2>
            <p className={styles.hint} style={{ marginTop: 0 }}>
              Choisis la bordure globale et l&apos;intensité des particules pour toutes les cartes Pouvoir (modifiable aussi carte par carte dans <em>Cartes de pouvoir → Identité</em>).
            </p>
          </div>
        </div>

        {/* Contrôles d'aperçu & réglages particules */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            borderRadius: 10,
            background: "#120d08",
            border: "1px solid #352719",
            marginBottom: 12,
          }}
        >
          <div className={styles.row} style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.small} ${particlesEnabled ? styles.primary : styles.danger}`}
              disabled={saving !== null}
              onClick={toggleParticles}
            >
              {particlesEnabled ? "✦ Particules : Activées" : "○ Particules : Désactivées"}
            </button>
            <span className={styles.hint} style={{ marginLeft: 4 }}>Intensité :</span>
            {POWER_BORDER_PARTICLE_MODES.filter((mode) => mode !== "off").map((mode) => (
              <button
                key={mode}
                type="button"
                className={`${styles.btn} ${styles.small} ${active.particles === mode ? styles.primary : ""}`}
                disabled={saving !== null}
                style={!particlesEnabled ? { opacity: 0.55 } : undefined}
                onClick={() => pickParticles(mode)}
              >
                {POWER_BORDER_PARTICLE_LABELS[mode]}
              </button>
            ))}
          </div>

          <label className={styles.check} style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              checked={active.onPortrait}
              disabled={saving !== null}
              onChange={(e) => toggleOnPortrait(e.target.checked)}
            />
            Afficher aussi sur les packs Portrait
          </label>

          <div className={styles.row} style={{ gap: 6, flexWrap: "wrap" }}>
            <span className={styles.hint}>Aperçu :</span>
            <select
              className={styles.inlineSelect}
              aria-label="Carte d'aperçu"
              value={sampleCardId}
              onChange={(e) => setSampleCardId(e.target.value as (typeof SAMPLE_CARD_IDS)[number])}
            >
              {SAMPLE_CARD_IDS.map((id) => (
                <option key={id} value={id}>
                  {CODE_POWER_MODULES[id]?.def.name ?? id}
                </option>
              ))}
            </select>
            <select
              className={styles.inlineSelect}
              aria-label="Rareté d'aperçu"
              value={previewRarity}
              onChange={(e) => setPreviewRarity(e.target.value as PowerRarity)}
            >
              {PREVIEW_RARITIES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Grille des 11 styles de bordures en direct */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(235px, 1fr))", gap: 14 }}>
          {POWER_BORDERS.map((item) => {
            const isActive = item.id === active.border;
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  padding: 12,
                  borderRadius: 12,
                  background: "#1b140d",
                  border: isActive ? "2px solid #f2bb45" : "1px solid #352719",
                }}
              >
                <div className={styles.row} style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <span className={styles.hint} style={{ fontSize: 11, fontWeight: 700, color: isActive ? "#f2bb45" : "#bda98d" }}>
                    {item.badge}
                  </span>
                  {isActive && <span style={{ color: "#f2bb45", fontSize: 11, fontWeight: 700 }}>● actif</span>}
                </div>

                <div
                  style={{
                    display: "grid",
                    placeItems: "center",
                    padding: "22px 14px",
                    borderRadius: 10,
                    background: "radial-gradient(ellipse 75% 60% at 50% 50%, rgba(255, 207, 64, 0.08), transparent 72%), #0b0806",
                  }}
                >
                  <PowerCardView
                    card={previewCard}
                    borderOverride={item.id}
                    particlesOverride={active.particles}
                    onPortraitOverride={active.onPortrait}
                  />
                </div>

                <div>
                  <strong>{item.name}</strong>
                  <div className={styles.hint} style={{ marginTop: 2 }}>{item.description}</div>
                  <div className={styles.hint} style={{ marginTop: 4, color: "#d4c3a7" }}>
                    ✦ {item.particleSummary}
                  </div>
                </div>

                <button
                  type="button"
                  className={`${styles.btn} ${isActive ? "" : styles.primary}`}
                  disabled={isActive || saving !== null}
                  onClick={() => pickBorder(item.id)}
                  style={{ marginTop: "auto" }}
                >
                  {saving === `border:${item.id}` ? "Activation…" : isActive ? "Bordure active" : "Utiliser cette bordure"}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

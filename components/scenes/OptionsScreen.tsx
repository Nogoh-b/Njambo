"use client";

import { useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { useSettings, type MotionQualityPreference } from "@/contexts/SettingsContext";
import { NjamboIcon } from "@/components/ui/Art";
import { GameShell } from "@/components/ui/GameShell";
import { Toggle } from "@/components/ui/Toggle";
import { EventAlertsToggle } from "./EventAlertsToggle";
import styles from "./OptionsScreen.module.css";

const LANGUAGES = [
  { id: "Français", badge: "FR" },
  { id: "English", badge: "EN" },
  { id: "Duala", badge: "DLA" },
];

const QUALITY_OPTIONS: Array<{ id: MotionQualityPreference; label: string }> = [
  { id: "auto", label: "Auto" },
  { id: "performance", label: "Perf." },
  { id: "balanced", label: "Équilibré" },
  { id: "quality", label: "Qualité" },
];

export function OptionsScreen() {
  const { navigateTo, musicOn, setMusicOn, sfxOn, setSfxOn } = useGame();
  const { animationsOn, setAnimationsOn, motionQuality, setMotionQuality } = useSettings();
  const [language, setLanguage] = useState("Français");

  return (
    <GameShell dock={false} scroll={false} contentClassName={styles.optionsShell}>
      {/* ═══ TOP HUD ═══ */}
      <header className={styles.hud}>
        <button data-nj-skin="none" type="button" className="nj-sr-back" onClick={() => navigateTo("menu")}>
          <span className="nj-sr-back-arrow" aria-hidden="true">←</span>
          <span>Salon</span>
        </button>

        <div className={styles.hudCenter}>
          <span className={styles.hudKicker}>PRÉFÉRENCES DU SALON</span>
          <h1 className={styles.hudTitle}>Options</h1>
        </div>

        <span className={styles.versionBadge}>v1.0</span>
      </header>

      {/* ═══ GRILLE DE RÉGLAGES (bornée, 2 colonnes sur desktop) ═══ */}
      <div className={styles.boardBody}>
        <div className={styles.cardsGrid}>
          {/* AUDIO DE TABLE */}
          <section className={`${styles.card} ${styles.cardGold}`} aria-label="Audio de table">
            <div className={styles.cardHead}>
              <span className={styles.cardIcon}>
                <NjamboIcon name="sound" tone="gold" size={22} />
              </span>
              <div>
                <h2>Son &amp; alertes</h2>
                <p>Ambiance sonore, effets de jeu et notifications</p>
              </div>
            </div>
            <div className={styles.togglesStack}>
              <Toggle label="Musique" caption="Ambiance légère de table" on={musicOn} onChange={setMusicOn} />
              <Toggle label="Effets sonores" caption="Cartes, timer et victoires" on={sfxOn} onChange={setSfxOn} />
              <EventAlertsToggle />
            </div>
          </section>

          {/* ANIMATIONS & FLUIDITÉ */}
          <section className={`${styles.card} ${styles.cardPink}`} aria-label="Animations et fluidité">
            <div className={styles.cardHead}>
              <span className={styles.cardIcon}>
                <NjamboIcon name="spark" tone="pink" size={22} />
              </span>
              <div>
                <h2>Animations &amp; fluidité</h2>
                <p>Distribution, confettis et rythme visuel</p>
              </div>
            </div>

            <Toggle
              label="Animations"
              caption="Mouvements de cartes et effets"
              on={animationsOn}
              onChange={setAnimationsOn}
            />

            <div className={styles.pillRow4} role="radiogroup" aria-label="Qualité des animations">
              {QUALITY_OPTIONS.map((option) => {
                const active = motionQuality === option.id;
                return (
                  <button
                    key={option.id}
                    data-nj-skin="none"
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`${styles.choicePill} ${styles.choicePink}${active ? ` ${styles.choiceActive}` : ""}`}
                    onClick={() => setMotionQuality(option.id)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* LANGUE DU SALON */}
          <section className={`${styles.card} ${styles.cardTeal}`} aria-label="Langue">
            <div className={styles.cardHead}>
              <span className={styles.cardIcon}>
                <NjamboIcon name="language" tone="teal" size={22} />
              </span>
              <div>
                <h2>Langue du salon</h2>
                <p>Textes d&apos;interface et annonces</p>
              </div>
            </div>

            <div className={styles.pillRow3} role="radiogroup" aria-label="Choisir la langue">
              {LANGUAGES.map((l) => {
                const active = language === l.id;
                return (
                  <button
                    key={l.id}
                    data-nj-skin="none"
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`${styles.choicePill} ${styles.choiceTeal}${active ? ` ${styles.choiceActive}` : ""}`}
                    onClick={() => setLanguage(l.id)}
                  >
                    <span className={styles.langCode}>{l.badge}</span>
                    <span>{l.id}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* À PROPOS & RÈGLES */}
          <section className={`${styles.card} ${styles.cardCobalt}`} aria-label="À propos de Njambo">
            <div className={styles.cardHead}>
              <span className={styles.cardIcon}>
                <NjamboIcon name="cards" tone="gold" size={22} />
              </span>
              <div>
                <h2>Njambo · BiSoft</h2>
                <p>Le jeu de cartes royal du quartier</p>
              </div>
            </div>

            <div className={styles.aboutActions}>
              <button
                data-nj-skin="none"
                type="button"
                className={styles.rulesBtn}
                onClick={() => navigateTo("rules")}
              >
                <NjamboIcon name="cards" tone="gold" size={18} />
                <span>Ouvrir le guide des règles</span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </GameShell>
  );
}

"use client";

/* Maquettes de la page Options (A : liste compacte · B : tuiles · C : onglets).
   Toutes tiennent sur un seul écran mobile, sans défilement. */

import { useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { useSettings, type MotionQualityPreference } from "@/contexts/SettingsContext";
import { NjamboIcon, type NjamboIconName, type NjamboIconTone } from "@/components/ui/Art";
import { useEventAlerts } from "./EventAlertsToggle";
import styles from "./OptionsVariants.module.css";

const LANGUAGES = [
  { id: "Français", badge: "FR" },
  { id: "English", badge: "EN" },
  { id: "Duala", badge: "DLA" },
];

const QUALITY: Array<{ id: MotionQualityPreference; label: string; hint: string }> = [
  { id: "auto", label: "Auto", hint: "Qualité maximale, baisse toute seule si le téléphone rame" },
  { id: "performance", label: "Perf.", hint: "Le plus fluide : idéal vieux téléphones et batterie faible" },
  { id: "balanced", label: "Équilibré", hint: "Animations essentielles, sans effets lourds" },
  { id: "quality", label: "Qualité", hint: "Tous les effets, confettis et particules, toujours" },
];

function useOptionsModel() {
  const { navigateTo, musicOn, setMusicOn, sfxOn, setSfxOn } = useGame();
  const { animationsOn, setAnimationsOn, motionQuality, setMotionQuality } = useSettings();
  const alerts = useEventAlerts();
  const [language, setLanguage] = useState("Français");
  const qualityHint = QUALITY.find((q) => q.id === motionQuality)?.hint ?? "";
  return {
    navigateTo, musicOn, setMusicOn, sfxOn, setSfxOn, animationsOn, setAnimationsOn,
    motionQuality, setMotionQuality, alerts, language, setLanguage, qualityHint,
  };
}

function Switch({ on }: { on: boolean }) {
  return (
    <span className={`${styles.switch}${on ? ` ${styles.switchOn}` : ""}`} aria-hidden="true">
      <span className={styles.knob} />
    </span>
  );
}

function Segmented<T extends string>({
  items, value, onChange, tone, label,
}: { items: Array<{ id: T; label: string; badge?: string }>; value: T; onChange: (v: T) => void; tone: "pink" | "teal"; label: string }) {
  return (
    <div className={`${styles.segmented} ${styles[`seg_${tone}`]}`} role="radiogroup" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          data-nj-skin="none"
          type="button"
          role="radio"
          aria-checked={value === item.id}
          className={`${styles.segBtn}${value === item.id ? ` ${styles.segActive}` : ""}`}
          onClick={() => onChange(item.id)}
        >
          {item.badge && <small>{item.badge}</small>}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ═════════════ A · LISTE COMPACTE ═════════════ */

function Row({ icon, tone, label, caption, on, onToggle, disabled }: {
  icon: NjamboIconName; tone: NjamboIconTone; label: string; caption: string; on: boolean; onToggle: () => void; disabled?: boolean;
}) {
  return (
    <button data-nj-skin="none" type="button" role="switch" aria-checked={on} disabled={disabled} className={styles.row} onClick={onToggle}>
      <span className={`${styles.rowIcon} ${styles[`tone_${tone}`]}`}><NjamboIcon name={icon} tone={tone} size={20} /></span>
      <span className={styles.rowCopy}>
        <strong>{label}</strong>
        <small>{caption}</small>
      </span>
      <Switch on={on} />
    </button>
  );
}

export function OptionsListVariant() {
  const m = useOptionsModel();
  return (
    <div className={styles.listBoard}>
      <section className={styles.group} aria-label="Son et alertes">
        <h2 className={styles.groupTitle}>Son &amp; alertes</h2>
        <Row icon="music" tone="gold" label="Musique" caption="Ambiance légère de table" on={m.musicOn} onToggle={() => m.setMusicOn(!m.musicOn)} />
        <Row icon="sound" tone="gold" label="Effets sonores" caption="Cartes, timer et victoires" on={m.sfxOn} onToggle={() => m.setSfxOn(!m.sfxOn)} />
        <Row icon="notification" tone="gold" label="Alertes d’événements" caption={m.alerts.caption} on={m.alerts.on} disabled={m.alerts.guest} onToggle={() => m.alerts.setOn(!m.alerts.on)} />
      </section>

      <section className={styles.group} aria-label="Animations">
        <h2 className={styles.groupTitle}>Animations</h2>
        <Row icon="spark" tone="pink" label="Animations" caption="Mouvements de cartes et effets" on={m.animationsOn} onToggle={() => m.setAnimationsOn(!m.animationsOn)} />
        <div className={`${styles.groupBody}${m.animationsOn ? "" : ` ${styles.dimmed}`}`}>
          <Segmented items={QUALITY} value={m.motionQuality} onChange={m.setMotionQuality} tone="pink" label="Qualité des animations" />
          <p className={styles.hint}>{m.qualityHint}</p>
        </div>
      </section>

      <section className={styles.group} aria-label="Langue">
        <h2 className={styles.groupTitle}>Langue</h2>
        <div className={styles.groupBody}>
          <Segmented items={LANGUAGES.map((l) => ({ id: l.id, label: l.id, badge: l.badge }))} value={m.language} onChange={m.setLanguage} tone="teal" label="Choisir la langue" />
        </div>
      </section>

      <button data-nj-skin="none" type="button" className={styles.linkRow} onClick={() => m.navigateTo("rules")}>
        <span className={`${styles.rowIcon} ${styles.tone_gold}`}><NjamboIcon name="cards" tone="gold" size={20} /></span>
        <span className={styles.rowCopy}><strong>Guide des règles</strong><small>Njambo · BiSoft — le jeu de cartes royal du quartier</small></span>
        <span className={styles.chevron} aria-hidden="true">›</span>
      </button>
    </div>
  );
}

/* ═════════════ B · TUILES ═════════════ */

function Tile({ icon, tone, label, on, onToggle, disabled, note }: {
  icon: NjamboIconName; tone: NjamboIconTone; label: string; on: boolean; onToggle: () => void; disabled?: boolean; note?: string;
}) {
  return (
    <button
      data-nj-skin="none"
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      className={`${styles.tile} ${styles[`tile_${tone}`]}${on ? ` ${styles.tileOn}` : ""}`}
      onClick={onToggle}
      title={note}
    >
      <span className={styles.tileIcon}><NjamboIcon name={icon} tone={tone} size={30} /></span>
      <strong>{label}</strong>
      <span className={styles.tileState}>{disabled ? "Compte requis" : on ? "Activé" : "Coupé"}</span>
    </button>
  );
}

export function OptionsTilesVariant() {
  const m = useOptionsModel();
  const qualityIdx = Math.max(0, ["performance", "balanced", "quality"].indexOf(m.motionQuality));
  return (
    <div className={styles.tilesBoard}>
      <div className={styles.tileGrid}>
        <Tile icon="music" tone="gold" label="Musique" on={m.musicOn} onToggle={() => m.setMusicOn(!m.musicOn)} />
        <Tile icon="sound" tone="gold" label="Effets" on={m.sfxOn} onToggle={() => m.setSfxOn(!m.sfxOn)} />
        <Tile icon="notification" tone="teal" label="Alertes" on={m.alerts.on} disabled={m.alerts.guest} note={m.alerts.caption} onToggle={() => m.alerts.setOn(!m.alerts.on)} />
        <Tile icon="spark" tone="pink" label="Animations" on={m.animationsOn} onToggle={() => m.setAnimationsOn(!m.animationsOn)} />
      </div>

      <section className={`${styles.panel}${m.animationsOn ? "" : ` ${styles.dimmed}`}`} aria-label="Qualité visuelle">
        <div className={styles.panelHead}>
          <span>Qualité visuelle</span>
          <span className={styles.meter} aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <i key={i} className={i <= (m.motionQuality === "auto" ? 2 : qualityIdx) ? styles.meterOn : ""} style={{ height: 6 + i * 4 }} />
            ))}
          </span>
        </div>
        <Segmented items={QUALITY} value={m.motionQuality} onChange={m.setMotionQuality} tone="pink" label="Qualité des animations" />
        <p className={styles.hint}>{m.qualityHint}</p>
      </section>

      <section className={styles.panel} aria-label="Langue">
        <div className={styles.panelHead}><span>Langue du salon</span></div>
        <Segmented items={LANGUAGES.map((l) => ({ id: l.id, label: l.id, badge: l.badge }))} value={m.language} onChange={m.setLanguage} tone="teal" label="Choisir la langue" />
      </section>

      <button data-nj-skin="none" type="button" className={styles.rulesCta} onClick={() => m.navigateTo("rules")}>
        <NjamboIcon name="cards" tone="gold" size={18} />
        <span>Guide des règles</span>
      </button>
    </div>
  );
}

/* ═════════════ C · ONGLETS ═════════════ */

const TABS = [
  { id: "sound", label: "Son", icon: "sound" as const, tone: "gold" as const },
  { id: "visual", label: "Visuel", icon: "spark" as const, tone: "pink" as const },
  { id: "lang", label: "Langue", icon: "language" as const, tone: "teal" as const },
  { id: "about", label: "Infos", icon: "cards" as const, tone: "cobalt" as const },
];

export function OptionsTabsVariant() {
  const m = useOptionsModel();
  const [tab, setTab] = useState("sound");
  return (
    <div className={styles.tabsBoard}>
      <nav className={styles.tabBar} role="tablist" aria-label="Catégories de réglages">
        {TABS.map((t) => (
          <button
            key={t.id}
            data-nj-skin="none"
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`${styles.tabBtn} ${styles[`tabTone_${t.tone}`]}${tab === t.id ? ` ${styles.tabActive}` : ""}`}
            onClick={() => setTab(t.id)}
          >
            <NjamboIcon name={t.icon} tone={t.tone} size={22} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <section className={styles.tabPanel} role="tabpanel">
        {tab === "sound" && (
          <>
            <Row icon="music" tone="gold" label="Musique" caption="Ambiance légère de table" on={m.musicOn} onToggle={() => m.setMusicOn(!m.musicOn)} />
            <Row icon="sound" tone="gold" label="Effets sonores" caption="Cartes, timer et victoires" on={m.sfxOn} onToggle={() => m.setSfxOn(!m.sfxOn)} />
            <Row icon="notification" tone="gold" label="Alertes d’événements" caption={m.alerts.caption} on={m.alerts.on} disabled={m.alerts.guest} onToggle={() => m.alerts.setOn(!m.alerts.on)} />
          </>
        )}
        {tab === "visual" && (
          <>
            <Row icon="spark" tone="pink" label="Animations" caption="Mouvements de cartes et effets" on={m.animationsOn} onToggle={() => m.setAnimationsOn(!m.animationsOn)} />
            <div className={`${styles.qualityList}${m.animationsOn ? "" : ` ${styles.dimmed}`}`} role="radiogroup" aria-label="Qualité des animations">
              {QUALITY.map((q) => (
                <button
                  key={q.id}
                  data-nj-skin="none"
                  type="button"
                  role="radio"
                  aria-checked={m.motionQuality === q.id}
                  className={`${styles.qualityRow}${m.motionQuality === q.id ? ` ${styles.qualityActive}` : ""}`}
                  onClick={() => m.setMotionQuality(q.id)}
                >
                  <span className={styles.radio} aria-hidden="true" />
                  <span className={styles.rowCopy}><strong>{q.label === "Perf." ? "Performance" : q.label}</strong><small>{q.hint}</small></span>
                </button>
              ))}
            </div>
          </>
        )}
        {tab === "lang" && (
          <div className={styles.qualityList} role="radiogroup" aria-label="Choisir la langue">
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                data-nj-skin="none"
                type="button"
                role="radio"
                aria-checked={m.language === l.id}
                className={`${styles.qualityRow} ${styles.langRow}${m.language === l.id ? ` ${styles.qualityActive}` : ""}`}
                onClick={() => m.setLanguage(l.id)}
              >
                <span className={styles.radio} aria-hidden="true" />
                <span className={styles.rowCopy}><strong>{l.id}</strong><small>{l.badge}</small></span>
              </button>
            ))}
          </div>
        )}
        {tab === "about" && (
          <div className={styles.aboutPanel}>
            <strong>Njambo · BiSoft</strong>
            <small>Le jeu de cartes royal du quartier · v1.0</small>
            <button data-nj-skin="none" type="button" className={styles.rulesCta} onClick={() => m.navigateTo("rules")}>
              <NjamboIcon name="cards" tone="gold" size={18} />
              <span>Guide des règles</span>
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

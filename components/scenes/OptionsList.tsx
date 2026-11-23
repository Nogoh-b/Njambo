"use client";

/* Page Options : liste compacte façon réglages de téléphone.
   Tient sur un seul écran mobile, sans défilement. */

import { useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { useSettings, type MotionQualityPreference } from "@/contexts/SettingsContext";
import { NjamboIcon, type NjamboIconName, type NjamboIconTone } from "@/components/ui/Art";
import { useEventAlerts } from "./EventAlertsToggle";
import styles from "./OptionsList.module.css";

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

/* ═════════════ LISTE ═════════════ */

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

export function OptionsList() {
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

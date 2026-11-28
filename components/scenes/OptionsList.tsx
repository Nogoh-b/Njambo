"use client";

/* Page Options : liste compacte façon réglages de téléphone.
   Tient sur un seul écran mobile, sans défilement. */

import { useState } from "react";
import { useSfx } from "@gxe/react";
import { useGame } from "@/contexts/GameContext";
import { useSettings, type MotionQualityPreference } from "@/contexts/SettingsContext";
import { NjamboIcon, type NjamboIconName, type NjamboIconTone } from "@/components/ui/Art";
import { UI_CLICK_SOUND } from "@/lib/gxeSfx";
import { CoachLevelPicker } from "@/components/academy/CoachLevelPicker";
import { useEventAlerts } from "./EventAlertsToggle";
import styles from "./OptionsList.module.css";

const LANGUAGES = [
  { id: "Français", badge: "FR" },
  { id: "English", badge: "EN" },
  { id: "Duala", badge: "DLA" },
];

const QUALITY: Array<{ id: MotionQualityPreference; label: string; hint: string }> = [
  { id: "auto", label: "Auto", hint: "Fluide sur téléphone, qualité maximale sur ordinateur et tablette" },
  { id: "performance", label: "Perf.", hint: "Le plus fluide : idéal vieux téléphones et batterie faible" },
  { id: "balanced", label: "Équilibré", hint: "Animations essentielles, sans effets lourds" },
  { id: "quality", label: "Qualité", hint: "Tous les effets, confettis et particules, toujours" },
];

function useOptionsModel() {
  const {
    navigateTo, musicOn, setMusicOn, sfxOn, setSfxOn,
    musicVolume, setMusicVolume, sfxVolume, setSfxVolume,
  } = useGame();
  const { animationsOn, setAnimationsOn, motionQuality, setMotionQuality } = useSettings();
  const alerts = useEventAlerts();
  const [language, setLanguage] = useState("Français");
  const qualityHint = QUALITY.find((q) => q.id === motionQuality)?.hint ?? "";
  return {
    navigateTo, musicOn, setMusicOn, sfxOn, setSfxOn, musicVolume, setMusicVolume,
    sfxVolume, setSfxVolume, animationsOn, setAnimationsOn,
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

function VolumeSlider({
  label, value, disabled, onChange, onCommit,
}: { label: string; value: number; disabled?: boolean; onChange: (v: number) => void; onCommit?: () => void }) {
  const pct = Math.round(value * 100);
  return (
    <div className={`${styles.volumeRow}${disabled ? ` ${styles.dimmed}` : ""}`}>
      <span className={styles.volumeLabel}>{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={pct}
        disabled={disabled}
        aria-label={label}
        className={styles.volumeSlider}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
      />
      <span className={styles.volumePct}>{pct}%</span>
    </div>
  );
}

export function OptionsList() {
  const m = useOptionsModel();
  const sfx = useSfx();
  return (
    <div className={styles.listBoard}>
      <section className={styles.group} aria-label="Son et alertes">
        <h2 className={styles.groupTitle}>Son &amp; alertes</h2>
        <Row icon="music" tone="gold" label="Musique" caption="Ambiance Afro-Lounge Royal & table" on={m.musicOn} onToggle={() => m.setMusicOn(!m.musicOn)} />
        <VolumeSlider label="Volume musique" value={m.musicVolume} disabled={!m.musicOn} onChange={m.setMusicVolume} />
        <Row icon="sound" tone="gold" label="Effets sonores" caption="Cartes, pouvoirs, pièces et victoires" on={m.sfxOn} onToggle={() => { const next = !m.sfxOn; m.setSfxOn(next); if (next) setTimeout(() => sfx.play(UI_CLICK_SOUND), 40); }} />
        <VolumeSlider label="Volume effets" value={m.sfxVolume} disabled={!m.sfxOn} onChange={m.setSfxVolume} onCommit={() => sfx.play(UI_CLICK_SOUND)} />
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

      <section className={styles.group} aria-label="Coach de Tonton René">
        <h2 className={styles.groupTitle}>Coach de Tonton René</h2>
        <div className={styles.groupBody}>
          {/* Compact : la page tient sur un écran de téléphone, sans défilement. */}
          <CoachLevelPicker compact />
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

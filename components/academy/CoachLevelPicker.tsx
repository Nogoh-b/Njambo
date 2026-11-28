"use client";

/* Réglage du coach de Tonton René : Accompagné, Conseils ou Désactivé.
   Dans les Options et dans le bouton « ? » de la table, changeable en pleine partie. */

import { useSyncExternalStore } from "react";
import type { CoachLevel } from "@/engine/academy/liveCoach";
import { coachPrefs } from "@/lib/academy/coachPrefs";
import styles from "./CoachLevelPicker.module.css";

const LEVELS: Array<{ id: CoachLevel; label: string; hint: string }> = [
  { id: "guided", label: "Accompagné", hint: "Tonton René explique chaque tour et éclaire une bonne carte contre l'IA." },
  { id: "tips", label: "Conseils", hint: "Seulement les moments importants, et chaque conseil s'efface une fois acquis." },
  { id: "off", label: "Désactivé", hint: "Tonton René se tait pendant les parties." },
];

export function CoachLevelPicker({ compact = false }: { compact?: boolean }) {
  const prefs = useSyncExternalStore(coachPrefs.subscribe, coachPrefs.getSnapshot, coachPrefs.getServerSnapshot);
  const hint = LEVELS.find((level) => level.id === prefs.level)?.hint ?? "";
  return (
    <div className={styles.picker}>
      <div className={styles.segmented} role="radiogroup" aria-label="Coach de Tonton René">
        {LEVELS.map((level) => (
          <button
            key={level.id}
            type="button"
            data-nj-skin="none"
            role="radio"
            aria-checked={prefs.level === level.id}
            className={`${styles.option}${prefs.level === level.id ? ` ${styles.active}` : ""}`}
            onClick={() => coachPrefs.setLevel(level.id)}
          >
            {level.label}
          </button>
        ))}
      </div>
      {!compact && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}

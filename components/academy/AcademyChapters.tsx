"use client";

/* Hub de l'Académie (A6) : les chapitres, leur statut, Jouer ou Rejouer.
   Le chapitre 4 et le Dojo restent grisés « bientôt » tant qu'ils n'existent pas. */

import { useSyncExternalStore } from "react";
import { ACADEMY_CHAPTERS, chapterDone, type AcademyChapter } from "@/data/academy/course";
import { academyProgress } from "@/lib/academy/academyProgress";
import styles from "./AcademyChapters.module.css";

export function AcademyChapters({ onPlay }: { onPlay?: (chapter: AcademyChapter) => void }) {
  const progress = useSyncExternalStore(academyProgress.subscribe, academyProgress.getSnapshot, academyProgress.getServerSnapshot);
  const playable = ACADEMY_CHAPTERS.filter((chapter) => !chapter.soon);
  const done = playable.filter((chapter) => chapterDone(chapter, progress.steps)).length;

  return (
    <div className={styles.hub}>
      <div className={styles.progress} aria-label={`${done} chapitres validés sur ${playable.length}`}>
        <span>{done} / {playable.length} validés</span>
        <span className={styles.bar} aria-hidden="true">
          <span className={styles.fill} style={{ width: `${(done / playable.length) * 100}%` }} />
        </span>
      </div>

      <ol className={styles.list}>
        {ACADEMY_CHAPTERS.map((chapter) => {
          const validated = chapterDone(chapter, progress.steps);
          const status = chapter.soon ? "Bientôt" : validated ? "Validé" : "À faire";
          return (
            <li key={chapter.id} className={`${styles.row}${chapter.soon ? ` ${styles.soon}` : ""}`}>
              <div className={styles.copy}>
                <span className={styles.kicker}>{chapter.kicker}</span>
                <strong>{chapter.title}</strong>
                <small>{chapter.summary}</small>
              </div>
              <div className={styles.side}>
                <span className={`${styles.status} ${validated ? styles.statusDone : chapter.soon ? styles.statusSoon : styles.statusTodo}`}>{status}</span>
                {!chapter.soon && (
                  <button
                    type="button"
                    data-nj-skin="none"
                    className={`${styles.play}${validated ? ` ${styles.replay}` : ""}`}
                    onClick={() => onPlay?.(chapter)}
                    disabled={!onPlay}
                  >
                    {validated ? "Rejouer" : "Jouer"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
        <li className={`${styles.row} ${styles.soon}`}>
          <div className={styles.copy}>
            <span className={styles.kicker}>Dojo des Pouvoirs</span>
            <strong>Essaie chaque carte sur la table</strong>
            <small>Une situation prête pour chaque pouvoir</small>
          </div>
          <div className={styles.side}>
            <span className={`${styles.status} ${styles.statusSoon}`}>Bientôt</span>
          </div>
        </li>
      </ol>
    </div>
  );
}

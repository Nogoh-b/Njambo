"use client";

import { useGame } from "@/contexts/GameContext";
import { GameShell } from "@/components/ui/GameShell";
import { OptionsList } from "./OptionsList";
import styles from "./OptionsScreen.module.css";

export function OptionsScreen() {
  const { goBack, backLabelFor } = useGame();

  return (
    <GameShell dock={false} scroll={false} contentClassName={styles.optionsShell}>
      {/* ═══ TOP HUD ═══ */}
      <header className={styles.hud}>
        <button data-nj-skin="none" type="button" className="nj-sr-back" onClick={() => goBack("menu")}>
          <span className="nj-sr-back-arrow" aria-hidden="true">←</span>
          <span>{backLabelFor("menu")}</span>
        </button>

        <div className={styles.hudCenter}>
          <span className={styles.hudKicker}>PRÉFÉRENCES DU SALON</span>
          <h1 className={styles.hudTitle}>Options</h1>
        </div>

        <span className={styles.versionBadge}>v1.0</span>
      </header>

      {/* ═══ RÉGLAGES : liste compacte, un seul écran sans défilement ═══ */}
      <OptionsList />
    </GameShell>
  );
}

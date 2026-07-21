"use client";

import { useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { useEconomy } from "@/contexts/EconomyContext";
import { useAuth } from "@/hooks/useAuth";
import { NKAP, BOTS } from "@/data/mock";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { Btn } from "@/components/ui/Btn";
import {
  PreGameFooter,
  PreGameLayout,
  PreGameWorkspace,
} from "@/components/ui/PreGameLayout";
import { Surface } from "@/components/ui/Shell";
import { EquippedPowersBar } from "@/components/power/EquippedPowersBar";
import type { BotDifficulty } from "@/types/game";
import styles from "./PreGameScreens.module.css";

interface BotSetupScreenProps {
  onStart: (botCount: number, mise: number, difficulty: BotDifficulty) => void;
}

const DIFFICULTIES: { key: BotDifficulty; label: string }[] = [
  { key: "easy", label: "Facile" },
  { key: "normal", label: "Normal" },
  { key: "hard", label: "Difficile" },
];

export function BotSetupScreen({ onStart }: BotSetupScreenProps) {
  const { navigateTo, cfg } = useGame();
  const { user } = useAuth();
  const { economy } = useEconomy();
  const [botCount, setBotCount] = useState(2);
  const [mise, setMise] = useState(cfg.stakes[1]);
  const [difficulty, setDifficulty] = useState<BotDifficulty>("normal");
  const pot = mise * (botCount + 1);
  const training = !user || user.isAnonymous;
  const enoughEnergy = training || economy?.energy.unlimited || (economy?.energy.available ?? 0) >= 5;
  const enoughNkap = training || (economy?.nkap ?? 0) >= mise;

  const summary = (
    <div className={styles.railStack}>
      {training && (
        <div className={styles.notice} role="status">
          Entraînement invité : aucune énergie, aucune mise et aucun gain.
        </div>
      )}

      {!training && (
        <Surface className={`nj-panel-pad-sm ${styles.panel}`}>
          <h2 className={styles.sectionTitle}>Pouvoirs équipés</h2>
          <div className={styles.sectionHint}>Ta sélection sera disponible à la table.</div>
          <div style={{ marginTop: 12 }}>
            <EquippedPowersBar />
          </div>
        </Surface>
      )}

      <Surface className={`nj-panel-pad-sm ${styles.panel}`}>
        <div className={styles.potRow}>
          <span className={styles.summaryLabel}>
            <strong>Pot par manche</strong>
            <span>La caisse que tout le monde vise</span>
          </span>
          <span className={styles.potValue}>
            {training ? "Entraînement" : NKAP(pot)}
          </span>
        </div>
      </Surface>
    </div>
  );

  const footerStatus = (!enoughNkap || !enoughEnergy) ? (
    <div className={styles.stack} aria-live="polite">
      {!enoughNkap && <div className={styles.error}>Nkap insuffisants pour cette mise.</div>}
      {!enoughEnergy && <div className={styles.error}>Il faut 5 énergie pour cette manche.</div>}
    </div>
  ) : undefined;

  return (
    <PreGameLayout
      title="Contre l'IA"
      kicker="Solo rapide"
      subtitle="Règle la table puis lance une partie immédiate contre les adversaires du Mboa."
      icon="bot"
      tone="gold"
      onBack={() => navigateTo("menu")}
    >
      <PreGameWorkspace rail={summary} railLabel="Résumé de la partie">
        <div className={styles.controlGrid}>
          <Surface className={`nj-panel-pad-sm ${styles.panel} ${styles.widePanel}`}>
            <fieldset className={styles.choiceSet}>
              <legend className={styles.choiceLegend}>Nombre d&apos;adversaires</legend>
              <div className={styles.choiceGrid}>
                {[1, 2, 3].map((count) => (
                  <button
                    data-nj-skin={botCount === count ? "gold" : "ghost"}
                    type="button"
                    key={count}
                    className={styles.botChoice}
                    aria-label={`${count} adversaire${count > 1 ? "s" : ""}`}
                    aria-pressed={botCount === count}
                    onClick={() => setBotCount(count)}
                  >
                    <span className={styles.botAvatars} aria-hidden="true">
                      {Array.from({ length: count }, (_, index) => (
                        <span key={index}>
                          <AvatarIllustration seed={BOTS[index]?.emoji ?? `bot-${index}`} size={32} />
                        </span>
                      ))}
                    </span>
                    <span className="nj-player-count-value" aria-hidden="true">{count}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          </Surface>

          <Surface className={`nj-panel-pad-sm ${styles.panel}`}>
            <fieldset className={styles.choiceSet}>
              <legend className={styles.choiceLegend}>Difficulté</legend>
              <div className={styles.choiceGrid}>
                {DIFFICULTIES.map((entry) => (
                  <Btn
                    key={entry.key}
                    variant={difficulty === entry.key ? "gold" : "ghost"}
                    ariaPressed={difficulty === entry.key}
                    onClick={() => setDifficulty(entry.key)}
                    className={styles.choiceButton}
                  >
                    {entry.label}
                  </Btn>
                ))}
              </div>
            </fieldset>
          </Surface>

          {!training && (
            <Surface className={`nj-panel-pad-sm ${styles.panel}`}>
              <fieldset className={styles.choiceSet}>
                <legend className={styles.choiceLegend}>Mise par manche</legend>
                <div className={styles.choiceGrid}>
                  {cfg.stakes.map((stake) => (
                    <Btn
                      key={stake}
                      variant={mise === stake ? "gold" : "ghost"}
                      ariaPressed={mise === stake}
                      onClick={() => setMise(stake)}
                      className={styles.choiceButton}
                    >
                      {NKAP(stake)}
                    </Btn>
                  ))}
                </div>
              </fieldset>
            </Surface>
          )}
        </div>
      </PreGameWorkspace>

      <PreGameFooter status={footerStatus}>
        <div className={styles.actions}>
          <Btn variant="ghost" onClick={() => navigateTo("menu")}>
            ← Menu
          </Btn>
          <Btn
            variant="pink"
            onClick={() => onStart(botCount, training ? 0 : mise, difficulty)}
            disabled={!enoughNkap || !enoughEnergy}
            icon={<NjamboIcon name="play" tone="light" size={20} />}
          >
            À la table
          </Btn>
        </div>
      </PreGameFooter>
    </PreGameLayout>
  );
}

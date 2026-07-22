"use client";

import { useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { useEconomy } from "@/contexts/EconomyContext";
import { useAuth } from "@/hooks/useAuth";
import { BOTS } from "@/data/mock";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { Btn } from "@/components/ui/Btn";
import { ChoiceButtonGroup } from "@/components/ui/ChoiceButtonGroup";
import { NkapAmount } from "@/components/ui/NkapAmount";
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
        <Surface className={`nj-panel-pad-sm ${styles.panel} ${styles.panelTone} ${styles.panelTeal}`}>
          <h2 className={styles.sectionTitle}>Pouvoirs équipés</h2>
          <div className={styles.sectionHint}>Ta sélection sera disponible à la table.</div>
          <div style={{ marginTop: 12 }}>
            <EquippedPowersBar tone="teal" />
          </div>
        </Surface>
      )}

      <Surface className={`nj-panel-pad-sm ${styles.panel} ${styles.panelTone} ${styles.panelPink}`}>
        <div className={styles.potRow}>
          <span className={styles.summaryLabel}>
            <strong>Pot par manche</strong>
            <span>La caisse que tout le monde vise</span>
          </span>
          <span className={styles.potValue}>
            {training ? "Entraînement" : <NkapAmount value={pot} size="lg" />}
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
          <Surface className={`nj-panel-pad-sm ${styles.panel} ${styles.panelTone} ${styles.panelTeal} ${styles.widePanel}`}>
            <ChoiceButtonGroup
              legend="Nombre d'adversaires"
              tone="teal"
              value={botCount}
              onChange={setBotCount}
              buttonClassName={styles.botChoice}
              options={[1, 2, 3].map((count) => ({
                value: count,
                ariaLabel: `${count} adversaire${count > 1 ? "s" : ""}`,
                content: (
                  <>
                    <span className={styles.botAvatars} aria-hidden="true">
                      {Array.from({ length: count }, (_, index) => (
                        <span key={index}>
                          <AvatarIllustration seed={BOTS[index]?.emoji ?? `bot-${index}`} size={32} />
                        </span>
                      ))}
                    </span>
                    <span className="nj-player-count-value" aria-hidden="true">{count}</span>
                  </>
                ),
              }))}
            />
          </Surface>

          <Surface className={`nj-panel-pad-sm ${styles.panel} ${styles.panelTone} ${styles.panelGold}`}>
            <ChoiceButtonGroup
              legend="Difficulté"
              tone="gold"
              value={difficulty}
              onChange={setDifficulty}
              options={DIFFICULTIES.map((entry) => ({
                value: entry.key,
                content: entry.label,
              }))}
            />
          </Surface>

          {!training && (
            <Surface className={`nj-panel-pad-sm ${styles.panel} ${styles.panelTone} ${styles.panelPink}`}>
              <ChoiceButtonGroup
                legend="Mise par manche"
                tone="pink"
                value={mise}
                onChange={setMise}
                options={cfg.stakes.map((stake) => ({
                  value: stake,
                  content: <NkapAmount value={stake} size="sm" />,
                }))}
              />
            </Surface>
          )}
        </div>
      </PreGameWorkspace>

      <PreGameFooter status={footerStatus}>
        <div className={styles.actions}>
          <Btn tone="gold" fill="outline" motif="indigo-dots" motifSides="both" onClick={() => navigateTo("menu")}>
            ← Menu
          </Btn>
          <Btn
            tone="gold"
            fill="solid"
            motif="indigo-dots"
            motifSides="both"
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

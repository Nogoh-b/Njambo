"use client";

import { useAuth } from "@/hooks/useAuth";
import { GameHubLayout } from "@/components/ui/GameHubLayout";
import { PlayModeCard } from "@/components/play/PlayModeCard";
import { GAME_MODE_CATALOG } from "@/lib/gameModeCatalog";
import { t } from "@/lib/i18n";
import styles from "./PlayHubScreen.module.css";

export function PlayHubScreen() {
  const { user } = useAuth();
  const guest = !user || user.isAnonymous === true;

  return (
    <GameHubLayout
      tone="play"
      kicker={t("play.kicker")}
      title={t("play.title")}
      subtitle={t("play.subtitle")}
      active="play"
    >
      <section className={styles.modeGrid} aria-label="Modes de jeu">
        {GAME_MODE_CATALOG.map((mode, index) => (
          <PlayModeCard key={mode.scene} mode={mode} guest={guest} order={index} />
        ))}
      </section>
    </GameHubLayout>
  );
}

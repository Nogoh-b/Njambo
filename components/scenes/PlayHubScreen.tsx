"use client";

import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { GameHubLayout } from "@/components/ui/GameHubLayout";
import { GameModeCard } from "@/components/ui/GamePrimitives";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import type { SceneName } from "@/types/game";
import styles from "./GameHubs.module.css";

interface GameMode {
  scene: SceneName;
  title: string;
  eyebrow: string;
  description: string;
  icon: NjamboIconName;
  tone: "gold" | "teal" | "pink";
  art: string;
  primary?: boolean;
  chips: Array<{ label: string; icon: NjamboIconName }>;
}

const MODES: GameMode[] = [
  {
    scene: "online_setup",
    title: "Classé en ligne",
    eyebrow: "La grande table",
    description: "Affronte le Mboa, fais monter ton rang et impose ton nom dans le Ter.",
    icon: "online",
    tone: "teal",
    art: "/assets/njambo/menu/mode-online.webp",
    primary: true,
    chips: [
      { label: "10 énergie", icon: "spark" },
      { label: "Mise Nkap", icon: "coin" },
      { label: "Couronnes", icon: "crown" },
    ],
  },
  {
    scene: "bot_setup",
    title: "Contre l’IA",
    eyebrow: "Entraînement",
    description: "Choisis ta difficulté et perfectionne tes combinaisons à ton rythme.",
    icon: "bot",
    tone: "gold",
    art: "/assets/njambo/menu/mode-ai.webp",
    chips: [
      { label: "5 énergie", icon: "spark" },
      { label: "Mises 100–500", icon: "coin" },
      { label: "Gratuit en invité", icon: "profile" },
    ],
  },
  {
    scene: "friends_invite",
    title: "Entre amis",
    eyebrow: "Table privée",
    description: "Crée une invitation et retrouve tes proches autour de ta propre table.",
    icon: "friends",
    tone: "pink",
    art: "/assets/njambo/menu/mode-friends.webp",
    chips: [
      { label: "10 énergie", icon: "spark" },
      { label: "Sans mise", icon: "coin" },
      { label: "Non classé", icon: "crown" },
    ],
  },
];

export function PlayHubScreen() {
  const { navigateTo } = useGame();
  const { user } = useAuth();
  const guest = !user || user.isAnonymous;

  return (
    <GameHubLayout
      tone="play"
      kicker="Choisis ton terrain"
      title="Les tables du Mboa"
      subtitle="Une table pour chaque façon de jouer."
      active="play"
    >
      <section className={styles.modeGrid} aria-label="Modes de jeu">
        {MODES.map((mode) => {
          const locked = guest && mode.scene !== "bot_setup";
          return (
            <GameModeCard
              key={mode.scene}
              image={mode.art}
              imageClassName={styles.modeArt}
              shadeClassName={styles.modeShade}
              variant={mode.primary ? "primary" : "secondary"}
              locked={locked}
              priority={mode.primary}
              sizes={mode.primary ? "(min-width: 980px) 68vw, 100vw" : "(min-width: 980px) 32vw, (min-width: 480px) 50vw, 100vw"}
              className={`${styles.modeCard} ${mode.primary ? styles.modePrimary : styles.modeSecondary} ${styles[`modeTone_${mode.tone}`]}`}
            >
              <div className={styles.modeBody}>
                <span className={styles.eyebrow}>{mode.eyebrow}</span>
                <span className={styles.modeTitleRow}>
                  <span className={styles.modeIcon}><NjamboIcon name={mode.icon} tone={mode.tone} size={mode.primary ? 32 : 26} /></span>
                  <strong>{mode.title}</strong>
                </span>
                <p>{mode.description}</p>
                <span className={styles.chipRow} aria-label="Conditions de la table">
                  {mode.chips.map((chip) => (
                    <span className={styles.gameChip} key={chip.label}>
                      <NjamboIcon name={chip.icon} tone={mode.tone} size={15} />
                      {chip.label}
                    </span>
                  ))}
                </span>
                <button
                  className={styles.modeCta}
                  type="button"
                  onClick={() => navigateTo(locked ? "profile" : mode.scene)}
                  aria-label={`${locked ? "Créer un compte pour jouer à" : "Jouer à"} ${mode.title}`}
                >
                  <span>{locked ? "Créer un compte" : mode.primary ? "Trouver une table" : "Choisir cette table"}</span>
                  <NjamboIcon name={locked ? "profile" : "play"} tone={mode.tone} size={20} />
                </button>
              </div>
              {locked && (
                <div className={styles.lockVeil}>
                  <span className={styles.lockIcon}><NjamboIcon name="profile" tone="gold" size={24} /></span>
                  <span><strong>Compte permanent requis</strong><small>Ta progression et tes gains seront sauvegardés.</small></span>
                </div>
              )}
            </GameModeCard>
          );
        })}
      </section>
    </GameHubLayout>
  );
}

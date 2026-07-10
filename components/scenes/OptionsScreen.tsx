"use client";

import { useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { NjamboIcon } from "@/components/ui/Art";
import { BottomNav } from "@/components/ui/BottomNav";
import { Btn } from "@/components/ui/Btn";
import { Toggle } from "@/components/ui/Toggle";
import { Chip } from "@/components/ui/Chip";
import { ScreenHeader, Shell, Surface } from "@/components/ui/Shell";

const LANGUAGES = ["Français", "English", "Duala"];

export function OptionsScreen() {
  const { navigateTo, musicOn, setMusicOn, sfxOn, setSfxOn, animationsOn, setAnimationsOn } = useGame();
  const [language, setLanguage] = useState("Français");

  return (
    <Shell>
      <div className="nj-safe">
        <div className="nj-phone">
          <ScreenHeader title="Options" kicker="Réglages" icon="settings" tone="cobalt" onBack={() => navigateTo("menu")} backLabel="Retour" />

          <div className="nj-stack">
            <Surface>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <NjamboIcon name="sound" tone="gold" size={24} />
                <div style={{ fontWeight: 900 }}>Son</div>
              </div>
              <div className="nj-stack" style={{ gap: 10 }}>
                <Toggle label="Musique" caption="Ambiance légère de table" on={musicOn} onChange={setMusicOn} />
                <Toggle label="Effets sonores" caption="Cartes, timer, victoire" on={sfxOn} onChange={setSfxOn} />
              </div>
            </Surface>

            <Surface>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <NjamboIcon name="spark" tone="pink" size={24} />
                <div style={{ fontWeight: 900 }}>Interface</div>
              </div>
              <Toggle label="Animations" caption="Distribution, confettis et feedbacks" on={animationsOn} onChange={setAnimationsOn} />
            </Surface>

            <Surface>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <NjamboIcon name="language" tone="teal" size={24} />
                <div style={{ fontWeight: 900 }}>Langue</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                {LANGUAGES.map((l) => (
                  <Btn key={l} variant={language === l ? "gold" : "ghost"} onClick={() => setLanguage(l)} style={{ paddingInline: 8, fontSize: 12 }}>
                    {l}
                  </Btn>
                ))}
              </div>
              <div className="nj-subtle" style={{ marginTop: 10 }}>
                Les textes restent en français pour ce prototype, le sélecteur prépare l&apos;intégration multilingue.
              </div>
            </Surface>

            <Surface>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <NjamboIcon name="cards" tone="gold" size={24} />
                <div style={{ fontWeight: 900 }}>Jeu</div>
              </div>
              <Btn variant="ghost" onClick={() => navigateTo("rules")} style={{ width: "100%" }}>
                Règles du jeu — Comment jouer
              </Btn>
            </Surface>

            <Surface>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>À propos</div>
                  <p className="nj-subtle">
                    Njambo est un prototype de jeu de cartes camerounais, pensé pour mobile, tablette et web.
                  </p>
                </div>
                <Chip strong>v1.0.0</Chip>
              </div>
              <div style={{ color: T.gold, fontSize: 12, fontWeight: 900, marginTop: 12 }}>BiSoft</div>
            </Surface>
          </div>
          <BottomNav />
        </div>
      </div>
    </Shell>
  );
}

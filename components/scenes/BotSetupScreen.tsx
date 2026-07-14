"use client";

import { useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useEconomy } from "@/contexts/EconomyContext";
import { useAuth } from "@/hooks/useAuth";
import { NKAP, BOTS } from "@/data/mock";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { Btn } from "@/components/ui/Btn";
import { ScreenHeader, Shell, Surface, displayFont } from "@/components/ui/Shell";
import { EquippedPowersBar } from "@/components/power/EquippedPowersBar";
import type { BotDifficulty } from "@/types/game";

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

  return (
    <Shell>
      <div className="nj-safe">
        <div className="nj-phone">
          <ScreenHeader
            title="Contre l'IA"
            kicker="Solo rapide"
            icon="bot"
            tone="gold"
            onBack={() => navigateTo("menu")}
          />

          <div className="nj-stack" style={{ alignContent: "center", gap: 12 }}>
            <Surface className="nj-panel-pad-sm" style={{ overflow: "visible" }}>
              <div className="nj-subtle" style={{ fontSize: 12, marginBottom: 8 }}>Nombre d&apos;adversaires</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
                {[1, 2, 3].map((n) => (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setBotCount(n)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      height: 56,
                      width: 92,
                      padding: "0 10px",
                      borderRadius: 16,
                      border: `1.5px solid ${botCount === n ? T.gold : "var(--wood-edge)"}`,
                      background: botCount === n ? `${T.gold}22` : "linear-gradient(160deg, rgba(60,37,20,.5), rgba(10,8,6,.86))",
                      color: T.text,
                      fontWeight: 900,
                      fontSize: 16,
                      cursor: "pointer",
                      overflow: "hidden",
                    }}
                  >
                    <span style={{ display: "flex" }}>
                      {Array.from({ length: n }, (_, i) => (
                        <span key={i} style={{ marginLeft: i === 0 ? 0 : -12 }}>
                          <AvatarIllustration seed={BOTS[i]?.emoji ?? `bot-${i}`} size={32} />
                        </span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </Surface>

            {training && <div className="nj-liveops-notice">Entraînement invité : aucune énergie, aucune mise et aucun gain.</div>}

            <Surface className="nj-panel-pad-sm" style={{ overflow: "visible" }}>
              <div style={{ fontWeight: 900, marginBottom: 12 }}>Difficulté</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                {DIFFICULTIES.map((d) => (
                  <Btn
                    key={d.key}
                    variant={difficulty === d.key ? "gold" : "ghost"}
                    onClick={() => setDifficulty(d.key)}
                    style={{ width: "100%", paddingInline: 6, fontSize: 13 }}
                  >
                    {d.label}
                  </Btn>
                ))}
              </div>
            </Surface>

            {!training && <Surface className="nj-panel-pad-sm" style={{ overflow: "visible" }}>
              <div style={{ fontWeight: 900, marginBottom: 12 }}>Mise par manche</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                {cfg.stakes.map((m) => (
                  <Btn key={m} variant={mise === m ? "gold" : "ghost"} onClick={() => setMise(m)} style={{ width: "100%" }}>
                    {NKAP(m)}
                  </Btn>
                ))}
              </div>
            </Surface>}

            {!training && <Surface className="nj-panel-pad-sm" style={{ overflow: "visible" }}>
              <EquippedPowersBar />
            </Surface>}

            <Surface
              className="nj-panel-pad-sm"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
                overflow: "visible",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="nj-title-icon" style={{ width: 40, height: 40, borderRadius: 12 }}>
                  <NjamboIcon name="coin" tone="gold" size={22} />
                </span>
                <span>
                  <span style={{ display: "block", fontWeight: 900, fontSize: 14 }}>Pot par manche</span>
                  <span className="nj-subtle" style={{ fontSize: 12 }}>La caisse que tout le monde vise</span>
                </span>
              </span>
              <span style={{ ...displayFont, color: T.gold, fontWeight: 900, fontSize: "clamp(18px, 5vw, 24px)", whiteSpace: "nowrap" }}>
                {training ? "Entraînement" : NKAP(pot)}
              </span>
            </Surface>

          </div>

          <div className="nj-screen-footer" style={{ flexDirection: "column", gap: 8 }}>
            {!enoughNkap && <div style={{ color: T.bad, textAlign: "center", fontSize: 13 }}>Nkap insuffisants pour cette mise.</div>}
            {!enoughEnergy && <div style={{ color: T.bad, textAlign: "center", fontSize: 13 }}>Il faut 5 énergie pour cette manche.</div>}
            <div className="nj-action-row">
              <Btn variant="ghost" onClick={() => navigateTo("menu")}>
                ← Menu
              </Btn>
              <Btn
                variant="pink"
                onClick={() => onStart(botCount, training ? 0 : mise, difficulty)}
                disabled={!enoughNkap || !enoughEnergy}
                style={{ flex: 1 }}
                icon={<NjamboIcon name="play" tone="light" size={20} />}
              >
                À la table
              </Btn>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

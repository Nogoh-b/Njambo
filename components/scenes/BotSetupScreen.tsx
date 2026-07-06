"use client";

import { useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { BOTS, FCFA } from "@/data/mock";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { Btn } from "@/components/ui/Btn";
import { Chip } from "@/components/ui/Chip";
import { ScreenHeader, Shell, Surface, displayFont } from "@/components/ui/Shell";

interface BotSetupScreenProps {
  onStart: (botCount: number, mise: number) => void;
}

export function BotSetupScreen({ onStart }: BotSetupScreenProps) {
  const { profile, navigateTo, cfg } = useGame();
  const [botCount, setBotCount] = useState(2);
  const [mise, setMise] = useState(cfg.stakes[1]);
  const pot = mise * (botCount + 1);

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

          <div className="nj-stack">
            <Surface>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 900 }}>Adversaires</div>
                  <div className="nj-subtle">Choisis la pression autour de la table.</div>
                </div>
                <Chip strong>{botCount + 1} joueurs</Chip>
              </div>
              <div className="nj-grid-3">
                {[1, 2, 3].map((n) => (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setBotCount(n)}
                    className="nj-choice"
                    style={{
                      minHeight: 126,
                      borderRadius: 18,
                      border: `1.5px solid ${botCount === n ? T.gold : "rgba(255,248,232,.12)"}`,
                      background: botCount === n ? `${T.gold}18` : "rgba(255,248,232,.055)",
                      color: T.text,
                      cursor: "pointer",
                      display: "grid",
                      alignContent: "center",
                      justifyItems: "center",
                      gap: 10,
                      padding: 12,
                    }}
                  >
                    <span style={{ display: "flex", justifyContent: "center", marginLeft: n > 1 ? 8 : 0 }}>
                      {Array.from({ length: n }, (_, i) => (
                        <span key={BOTS[i]?.emoji ?? i} style={{ marginLeft: i === 0 ? 0 : -12 }}>
                          <AvatarIllustration seed={BOTS[i]?.emoji ?? `bot-${i}`} size={42} />
                        </span>
                      ))}
                    </span>
                    <span style={{ fontWeight: 900 }}>
                      {n} bot{n > 1 ? "s" : ""}
                    </span>
                  </button>
                ))}
              </div>
            </Surface>

            <Surface>
              <div style={{ fontWeight: 900, marginBottom: 12 }}>Mise par manche</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                {cfg.stakes.map((m) => (
                  <Btn key={m} variant={mise === m ? "gold" : "ghost"} onClick={() => setMise(m)} style={{ width: "100%" }}>
                    {FCFA(m)}
                  </Btn>
                ))}
              </div>
            </Surface>

            <Surface
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="nj-title-icon" style={{ width: 44, height: 44, borderRadius: 14 }}>
                  <NjamboIcon name="coin" tone="gold" size={26} />
                </span>
                <span>
                  <span style={{ display: "block", fontWeight: 900 }}>Pot par manche</span>
                  <span className="nj-subtle">La caisse que tout le monde vise</span>
                </span>
              </span>
              <span style={{ ...displayFont, color: T.gold, fontWeight: 900, fontSize: "clamp(20px, 6vw, 24px)", whiteSpace: "nowrap" }}>
                {FCFA(pot)}
              </span>
            </Surface>

            <div className="nj-action-row">
              <Btn variant="ghost" onClick={() => navigateTo("menu")}>
                ← Menu
              </Btn>
              <Btn
                variant="pink"
                onClick={() => onStart(botCount, mise)}
                disabled={profile.balance < mise}
                style={{ flex: 1 }}
                icon={<NjamboIcon name="play" tone="light" size={20} />}
              >
                À la table
              </Btn>
            </div>
            {profile.balance < mise && <div style={{ color: T.bad, textAlign: "center", fontSize: 13 }}>Solde insuffisant pour cette mise.</div>}
          </div>
        </div>
      </div>
    </Shell>
  );
}

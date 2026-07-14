"use client";

import { useState } from "react";
import { CEREMONIAL_STRIP } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { NKAP } from "@/data/mock";
import { Btn } from "@/components/ui/Btn";
import { Shell } from "@/components/ui/Shell";
import { displayFont } from "@/components/ui/Shell";

/* ═══════════════ SetupScreen — préparation de la table ═══════════════ */

interface SetupScreenProps {
  onStart: (botCount: number, mise: number) => void;
}

export function SetupScreen({ onStart }: SetupScreenProps) {
  const { profile, navigateTo, cfg } = useGame();
  const [botCount, setBotCount] = useState(2);
  const [mise, setMise] = useState(cfg.stakes[1]);

  const handleStart = () => {
    onStart(botCount, mise);
  };

  return (
    <Shell style={{ padding: "26px 20px" }}>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <h2 style={{ ...displayFont, fontSize: 32, color: cfg.stakes ? "#ffc53d" : undefined }}>
          Ouvre ta table
        </h2>
        <div style={{ height: 5, borderRadius: 3, background: CEREMONIAL_STRIP, margin: "10px 0" }} />

        <div style={{ margin: "20px 0 8px", fontWeight: 700 }}>Adversaires</div>
        <div style={{ display: "flex", gap: 10 }}>
          {[1, 2, 3].map((n) => (
            <Btn key={n} variant={botCount === n ? "gold" : "ghost"} onClick={() => setBotCount(n)}>
              {n} bot{n > 1 ? "s" : ""}
            </Btn>
          ))}
        </div>

        <div style={{ margin: "20px 0 8px", fontWeight: 700 }}>Mise par manche</div>
        <div style={{ display: "flex", gap: 10 }}>
          {cfg.stakes.map((m) => (
            <Btn key={m} variant={mise === m ? "gold" : "ghost"} onClick={() => setMise(m)}>
              {NKAP(m)}
            </Btn>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 30 }}>
          <Btn variant="ghost" onClick={() => navigateTo("menu")}>
            ← Menu
          </Btn>
          <Btn variant="pink" onClick={handleStart} disabled={profile.balance < mise}>
            À la table →
          </Btn>
        </div>
      </div>
    </Shell>
  );
}

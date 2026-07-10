"use client";

import { useEffect, useRef, useState } from "react";
import { T } from "@/config/theme";
import { FCFA } from "@/data/mock";
import { Btn } from "@/components/ui/Btn";
import { Chip } from "@/components/ui/Chip";
import { NjamboIcon, NjamboMark } from "@/components/ui/Art";
import { PlayCard } from "@/components/cards/PlayCard";
import { displayFont } from "@/components/ui/Shell";
import { SocialActions } from "@/components/social/SocialActions";
import { useAuth } from "@/hooks/useAuth";
import { useGame } from "@/contexts/GameContext";
import type { Result, RoomPlayer } from "@/types/game";

interface ResultScreenProps {
  result: Result;
  mise: number;
  onNext: () => void;
  onMenu: () => void;
  canNext: boolean;
  nextRequiresConsensus?: boolean;
  socialPlayers?: RoomPlayer[];
}

export function ResultScreen({ result, mise, onNext, onMenu, canNext, nextRequiresConsensus = false, socialPlayers = [] }: ResultScreenProps) {
  const { user } = useAuth();
  const { animationsOn, sfx } = useGame();
  const win = result.winner;
  const [nextRequested, setNextRequested] = useState(false);
  const pieces = useRef(
    Array.from({ length: 28 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 1.6,
      dur: 2.4 + Math.random() * 2,
      color: [T.gold, T.pink, T.teal, T.copper, T.cobalt][i % 5],
      size: 7 + Math.random() * 8,
      rot: Math.random() * 360,
      coin: i % 3 === 0,
    })),
  ).current;

  const totalGain = result.gain + (result.doubles ? mise * (result.playersCount - 1) : 0);

  useEffect(() => {
    sfx((sound) => {
      if (win.isYou) sound.win();
      else sound.lose();
    });
  }, [sfx, win.isYou]);

  const handleNext = () => {
    setNextRequested(true);
    onNext();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        overflow: "hidden",
        background: `radial-gradient(ellipse at 50% 30%, ${T.night3}f7, ${T.night1}fc)`,
        display: "grid",
        placeItems: "center",
        animation: animationsOn ? "fadeIn .35s both" : "none",
        padding: "24px 16px",
        color: T.text,
      }}
    >
      {animationsOn && <div className="nj-result-aura" aria-hidden="true" />}

      {animationsOn && pieces.map((p, i) => (
        <div
          key={i}
          className={`nj-result-particle${p.coin ? " nj-result-particle-coin" : ""}`}
          style={{
            position: "absolute",
            top: -20,
            left: p.left + "%",
            width: p.size,
            height: p.size * 0.55,
            background: p.color,
            borderRadius: 2,
            transform: `rotate(${p.rot}deg)`,
            animation: `confetti ${p.dur}s ${p.delay}s linear infinite`,
          }}
        />
      ))}

      <section
        className={`nj-surface nj-panel-pad${animationsOn ? " nj-result-panel" : ""}`}
        style={{
          width: "min(92vw, 430px)",
          maxHeight: "88svh",
          overflowY: "auto",
          textAlign: "center",
          animation: animationsOn ? "riseIn .45s .1s both" : "none",
        }}
      >
        <div style={{ display: "grid", placeItems: "center", marginBottom: 8 }}>
          <span style={{ position: "relative", display: "grid", placeItems: "center" }}>
            <NjamboMark size={110} compact />
            <span className="nj-title-icon" style={{ position: "absolute", right: -12, bottom: -8, width: 48, height: 48 }}>
              <NjamboIcon name={win.isYou ? "trophy" : "crown"} tone="gold" size={30} />
            </span>
          </span>
        </div>

        <div
          style={{
            ...displayFont,
            fontWeight: 900,
            color: T.gold,
            fontSize: "clamp(28px, 8vw, 42px)",
            lineHeight: 1,
          }}
        >
          {win.isYou ? "Tu gagnes !" : `${win.name} gagne`}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", margin: "14px 0" }}>
          {result.type === "instant" && result.reason === "flush" && <Chip strong>Même couleur - victoire direct</Chip>}
          {result.type === "instant" && result.reason === "under21" && <Chip strong>Donne sous 21 - {result.total} pts</Chip>}
          {result.type === "instant" && result.reason === "exact21" && <Chip strong>21 exact - gain x2</Chip>}
          {result.type === "lastTrick" && <Chip strong>Dernier tour dominé</Chip>}
          {result.type === "lastTrick" && result.doubles && <Chip strong>Dernière carte 3 - x2</Chip>}
        </div>

        {result.type === "instant" && (
          <div style={{ display: "flex", justifyContent: "center", margin: "12px 0 8px" }}>
            {win.hand.map((c, i) => (
              <div key={c.id} style={{ marginLeft: i === 0 ? 0 : -18, transform: `rotate(${(i - 2) * 7}deg)` }}>
                <PlayCard card={c} w={48} />
              </div>
            ))}
          </div>
        )}

        <div className={animationsOn ? "nj-result-gain" : undefined} style={{ ...displayFont, fontSize: "clamp(26px, 7vw, 36px)", fontWeight: 900, color: T.text, marginTop: 10 }}>
          + {FCFA(totalGain)}
        </div>
        <div className="nj-subtle">{result.doubles ? "pot + pénalités doublées" : "le pot rentre au ngata"}</div>

        {animationsOn && <div className="nj-result-nudge">Revanche ?</div>}

        {socialPlayers.filter((player) => player.uid !== user?.uid).length > 0 && (
          <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
            {socialPlayers.filter((player) => player.uid !== user?.uid).map((player) => (
              <div key={player.uid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 10px", borderRadius: 12, background: "linear-gradient(160deg, rgba(60,37,20,.5), rgba(10,8,6,.82))", border: "1px solid var(--wood-edge)" }}>
                <span style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.name}</span>
                <SocialActions player={player} compact />
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 24 }}>
          <Btn variant="pink" onClick={handleNext} disabled={!canNext || nextRequested} style={{ minWidth: 176 }}>
            Manche suivante →
          </Btn>
          <Btn variant="dark" onClick={onMenu}>
            Menu
          </Btn>
        </div>
        {nextRequested && nextRequiresConsensus && (
          <div className="nj-subtle" style={{ marginTop: 10 }}>
            Les autres joueurs doivent valider.
          </div>
        )}
      </section>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { T } from "@/config/theme";
import { useGsapTimeline, useMotionProfile } from "@/lib/motion";
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

/* Particules tsparticles chargées en lazy, client uniquement (jamais au SSR). */
const PowerParticles = dynamic(() => import("@/components/power/PowerParticles"), { ssr: false });

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
  const { sfx } = useGame();
  const motion = useMotionProfile();
  const win = result.winner;
  const [nextRequested, setNextRequested] = useState(false);

  const totalGain = result.gain + (result.doubles ? mise * (result.playersCount - 1) : 0);

  /* ----- Séquence de victoire scriptée (GSAP) : panneau qui monte, sceau
     qui apparaît, puis compteur du gain qui grimpe de 0 → total. ----- */
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const gainRef = useRef<HTMLDivElement>(null);

  useGsapTimeline(motion.enabled, rootRef, (gsap) => {
    const introDuration = motion.allowFilterFx ? 0.5 : 0.4;
    const markDuration = motion.allowFilterFx ? 0.6 : 0.48;
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    if (panelRef.current) {
      tl.fromTo(panelRef.current, { opacity: 0, y: 16, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: introDuration }, 0);
    }
    if (markRef.current) {
      tl.fromTo(markRef.current, { opacity: 0, scale: 0.72, rotate: -8 }, { opacity: 1, scale: 1, rotate: 0, duration: markDuration, ease: "back.out(2.1)" }, 0.1);
    }
    const gain = gainRef.current;
    if (gain) {
      const counter = { v: 0 };
      gsap.set(gain, { opacity: 0, scale: 0.78 });
      tl.to(gain, { opacity: 1, scale: 1, duration: introDuration, ease: "back.out(2)" }, 0.24)
        .to(counter, {
          v: totalGain,
          duration: motion.allowLongCascade ? 0.85 : 0.68,
          ease: "power2.out",
          onUpdate: () => { gain.textContent = `+ ${FCFA(Math.round(counter.v))}`; },
          onComplete: () => { gain.textContent = `+ ${FCFA(totalGain)}`; },
        }, 0.24);
    }
  }, [motion.enabled, totalGain]);

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
      ref={rootRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        overflow: "hidden",
        background: `radial-gradient(ellipse at 50% 30%, ${T.night3}f7, ${T.night1}fc)`,
        display: "grid",
        placeItems: "center",
        animation: motion.enabled ? "fadeIn .35s both" : "none",
        padding: "24px 16px",
        color: T.text,
      }}
    >
      {motion.enabled && motion.allowDecorativeLoop && <div className="nj-result-aura" aria-hidden="true" />}

      {/* Célébration : pluie de confettis tsparticles quand le joueur gagne. */}
      {motion.enabled && motion.allowParticles && win.isYou && <PowerParticles variant="confetti" zIndex={1} />}

      <section
        ref={panelRef}
        className={`nj-surface nj-panel-pad${motion.enabled ? " nj-result-panel" : ""}`}
        style={{
          width: "min(92vw, 430px)",
          maxHeight: "88svh",
          overflowY: "auto",
          textAlign: "center",
          // Entrée pilotée par GSAP (voir useGsapTimeline) ; opacité 0 au départ
          // pour éviter le flash avant que la timeline ne prenne la main.
          opacity: motion.enabled ? 0 : 1,
        }}
      >
        <div style={{ display: "grid", placeItems: "center", marginBottom: 8 }}>
          <span ref={markRef} style={{ position: "relative", display: "grid", placeItems: "center" }}>
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

        <div ref={gainRef} className={motion.enabled ? "nj-result-gain" : undefined} style={{ ...displayFont, fontSize: "clamp(26px, 7vw, 36px)", fontWeight: 900, color: T.text, marginTop: 10, opacity: motion.enabled ? 0 : 1 }}>
          + {FCFA(totalGain)}
        </div>
        <div className="nj-subtle">{result.doubles ? "pot + pénalités doublées" : "le pot rentre au ngata"}</div>

        {motion.enabled && motion.allowDecorativeLoop && <div className="nj-result-nudge">Revanche ?</div>}

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

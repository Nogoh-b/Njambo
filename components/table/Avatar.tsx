"use client";

import { memo, useEffect, useRef, useState } from "react";
import { T } from "@/config/theme";
import { NKAP } from "@/data/mock";
import { AvatarIllustration } from "@/components/ui/Art";
import { useRegisterZone, type ZoneKey } from "@/components/table/zones/ZoneRegistry";
import type { Player } from "@/types/game";

interface AvatarProps {
  p: Player;
  active: boolean;
  seconds: number;
  turnSeconds: number;
  size?: number;
  /** Siège (pour l'enregistrement du handle timer). */
  seatIdx?: number;
}

type AuraStyle = "shield" | "mask" | "totem" | "lucky";

const AURA_EMOJI: Record<AuraStyle, string> = {
  shield: "🛡️",
  mask: "🎭",
  totem: "🗿",
  lucky: "🍀",
};

export const Avatar = memo(function Avatar({ p, active, seconds, turnSeconds, size = 58, seatIdx }: AvatarProps) {
  const R = size / 2 - 5;
  const S = size;
  const C = 2 * Math.PI * R;
  const frac = active ? seconds / turnSeconds : 0;

  const [flash, setFlash] = useState<"gain" | "loss" | null>(null);
  const [floatDiff, setFloatDiff] = useState<number | null>(null);
  const prevBalance = useRef(p.balance);

  /* ── Effets pilotés par le handle timer (moteur des pouvoirs) ── */
  const rootRef = useRef<HTMLDivElement>(null);
  const [frozen, setFrozen] = useState(false);
  const [timerDelta, setTimerDelta] = useState<{ key: string; seconds: number } | null>(null);
  const [aura, setAura] = useState<AuraStyle | null>(null);
  const freezeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useRegisterZone(seatIdx !== undefined ? (`timer:${seatIdx}` as ZoneKey) : undefined, {
    getRect: () => rootRef.current?.getBoundingClientRect() ?? null,
    showFreeze: (durationMs: number) => {
      setFrozen(true);
      if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current);
      freezeTimerRef.current = setTimeout(() => setFrozen(false), durationMs);
    },
    showDelta: (deltaSeconds: number) => {
      setTimerDelta({ key: `delta-${Date.now()}`, seconds: deltaSeconds });
      if (deltaTimerRef.current) clearTimeout(deltaTimerRef.current);
      deltaTimerRef.current = setTimeout(() => setTimerDelta(null), 1600);
    },
    showAura: (style: AuraStyle | null) => setAura(style),
  });

  useEffect(() => {
    return () => {
      if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current);
      if (deltaTimerRef.current) clearTimeout(deltaTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (p.balance !== prevBalance.current) {
      const diff = p.balance - prevBalance.current;
      if (diff > 0) setFlash("gain");
      else if (diff < 0) setFlash("loss");
      prevBalance.current = p.balance;
      setFloatDiff(diff);
      const t = setTimeout(() => {
        setFlash(null);
        setFloatDiff(null);
      }, 800);
      return () => clearTimeout(t);
    }
  }, [p.balance]);

  return (
    <div ref={rootRef} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: size + 28 }}>
      <div style={{ position: "relative", width: S, height: S }}>
        <svg width={S} height={S} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
          <circle cx={S / 2} cy={S / 2} r={R} fill="none" stroke="rgba(255,248,232,.18)" strokeWidth="4" />
          {active && (
            <circle
              cx={S / 2}
              cy={S / 2}
              r={R}
              fill="none"
              stroke={frozen ? "#7fd6ff" : seconds <= 5 ? T.pink : T.gold}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - frac)}
              style={{ transition: "stroke-dashoffset 1s linear, stroke .3s" }}
            />
          )}
        </svg>
        <span style={{ position: "absolute", inset: 5 }}>
          <AvatarIllustration seed={p.emoji || p.name} size={S - 10} active={active} />
        </span>
        {/* Gel du timer (Sable du Temps) */}
        {frozen && (
          <span className="nj-timer-frozen" aria-label="Timer gelé">
            ❄️
          </span>
        )}
        {/* Aura persistante (bouclier, masque, totem, chance) */}
        {aura && (
          <>
            <span className={`nj-avatar-aura-field nj-avatar-aura-field-${aura}`} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className={`nj-avatar-aura nj-avatar-aura-${aura}`} aria-label={`Protection ${aura}`}>
              {AURA_EMOJI[aura]}
            </span>
          </>
        )}
        {/* Delta de temps flottant (+8s / −3s) */}
        {timerDelta && (
          <span
            key={timerDelta.key}
            className="float-up nj-timer-delta"
            style={{ color: timerDelta.seconds >= 0 ? T.good : T.bad }}
          >
            {timerDelta.seconds >= 0 ? `+${timerDelta.seconds}s` : `${timerDelta.seconds}s`}
          </span>
        )}
        {active && (
          <div
            style={{
              position: "absolute",
              bottom: -8,
              left: "50%",
              transform: "translateX(-50%)",
              minWidth: 34,
              textAlign: "center",
              background: frozen ? "#1c4a63" : seconds <= 5 ? T.pink : T.night1,
              color: T.chalk,
              border: `1px solid ${frozen ? "#7fd6ff" : seconds <= 5 ? T.pink : T.gold}55`,
              fontSize: 10,
              fontWeight: 900,
              borderRadius: 999,
              padding: "2px 7px",
            }}
          >
            {seconds}s
          </div>
        )}
      </div>
      <div
        style={{
          maxWidth: 96,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: 11,
          fontWeight: 850,
          textShadow: "0 2px 4px #000",
        }}
      >
        {p.name}
      </div>
      <div style={{ position: "relative" }}>
        <div
          style={{
            fontSize: 10,
            color: T.gold,
            fontWeight: 850,
            animation:
              flash === "gain"
                ? "balanceFlashGain 0.6s ease both"
                : flash === "loss"
                  ? "balanceFlashLoss 0.6s ease both"
                  : "none",
          }}
        >
          {NKAP(p.balance)}
        </div>
        {floatDiff != null && floatDiff !== 0 && (
          <div
            className="float-up"
            style={{
              position: "absolute",
              left: "50%",
              top: -4,
              transform: "translateX(-50%)",
              fontSize: 10,
              fontWeight: 900,
              whiteSpace: "nowrap",
              color: floatDiff > 0 ? T.good : T.bad,
            }}
          >
            {floatDiff > 0 ? "+" : ""}
            {NKAP(floatDiff)}
          </div>
        )}
      </div>
    </div>
  );
});

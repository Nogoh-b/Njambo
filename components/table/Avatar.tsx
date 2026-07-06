"use client";

import { useEffect, useRef, useState } from "react";
import { T } from "@/config/theme";
import { FCFA } from "@/data/mock";
import { AvatarIllustration } from "@/components/ui/Art";
import type { Player } from "@/types/game";

interface AvatarProps {
  p: Player;
  active: boolean;
  seconds: number;
  turnSeconds: number;
  size?: number;
}

export function Avatar({ p, active, seconds, turnSeconds, size = 58 }: AvatarProps) {
  const R = size / 2 - 5;
  const S = size;
  const C = 2 * Math.PI * R;
  const frac = active ? seconds / turnSeconds : 0;

  const [flash, setFlash] = useState<"gain" | "loss" | null>(null);
  const [floatDiff, setFloatDiff] = useState<number | null>(null);
  const prevBalance = useRef(p.balance);

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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: size + 28 }}>
      <div style={{ position: "relative", width: S, height: S }}>
        <svg width={S} height={S} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
          <circle cx={S / 2} cy={S / 2} r={R} fill="none" stroke="rgba(255,248,232,.18)" strokeWidth="4" />
          {active && (
            <circle
              cx={S / 2}
              cy={S / 2}
              r={R}
              fill="none"
              stroke={seconds <= 5 ? T.pink : T.gold}
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
        {active && (
          <div
            style={{
              position: "absolute",
              bottom: -8,
              left: "50%",
              transform: "translateX(-50%)",
              minWidth: 34,
              textAlign: "center",
              background: seconds <= 5 ? T.pink : T.night1,
              color: T.chalk,
              border: `1px solid ${seconds <= 5 ? T.pink : T.gold}55`,
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
          {FCFA(p.balance)}
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
            {FCFA(floatDiff)}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { GAME_CONFIG } from "@/config/gameConfig";
import { PlayCard } from "@/components/cards/PlayCard";
import type { Flight } from "@/types/game";

/* ═══════════════ FILE: components/table/FlyingCard.jsx ═══════════════
   Vol main → dépôt : trajectoire FLIP + arc vertical, bien lisible. */
interface FlyingCardProps {
  f: Flight;
}

export function FlyingCard({ f }: FlyingCardProps) {
  const [go, setGo] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  const dur = GAME_CONFIG.anim.dropFlight;
  const w = go ? f.w : Math.max(f.from.width * 0.7, 34);
  const h = w * 1.45;
  const rect = go ? f.to : f.from;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const startRot = f.angle > 180 ? f.angle - 360 : f.angle;

  return (
    <div
      style={{
        position: "fixed",
        left: cx - w / 2,
        top: cy - h / 2,
        width: w,
        height: h,
        zIndex: 300,
        pointerEvents: "none",
        transition: `left ${dur}ms cubic-bezier(.3,.75,.35,1), top ${dur}ms cubic-bezier(.3,.75,.35,1), width ${dur}ms, height ${dur}ms, transform ${dur}ms`,
        transform: go ? `rotate(${f.dropRot}deg)` : `rotate(${startRot - 12}deg) scale(1.1)`,
      }}
    >
      {/* l'arc : la carte s'élève puis retombe pendant le trajet */}
      <div
        style={{
          animation: `arcLift ${dur}ms ease-in-out both`,
          filter: "drop-shadow(0 16px 20px rgba(0,0,0,.55))",
        }}
      >
        {/* Les bots montent le dos pendant le vol, le joueur montre la face */}
        <PlayCard card={f.card} w={w} hidden={!f.isYou} />
      </div>
    </div>
  );
}

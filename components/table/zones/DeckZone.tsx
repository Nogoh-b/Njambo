"use client";

/* ═══════════════ DeckZone — pioche + pot + tendance ═══════════════
   Extraction du « pot-cluster » inline de TableScreen. Expose deux handles :
   - "deck" : rect de la pioche + pulse (échanges Vent du Nord/Marché de Nuit) ;
   - "pot"  : rect du pot + flash avec label (« +200 », « ×2 »…). */

import { memo, useRef, useState } from "react";
import { PlayCard } from "@/components/cards/PlayCard";
import { NjamboIcon } from "@/components/ui/Art";
import { Chip } from "@/components/ui/Chip";
import { displayFont } from "@/components/ui/Shell";
import { T } from "@/config/theme";
import { NKAP } from "@/data/mock";
import { useRegisterZone } from "./ZoneRegistry";

interface DeckZoneProps {
  deckW: number;
  pot: number;
  ledSuit: string | null;
  ledColor?: string;
  /** Pulse de distribution (roundIntro / dealing). */
  dealing: boolean;
  motionEnabled: boolean;
  premiumFxAllowed: boolean;
  liteMotion: boolean;
}

export const DeckZone = memo(function DeckZone({
  deckW,
  pot,
  ledSuit,
  ledColor,
  dealing,
  motionEnabled,
  premiumFxAllowed,
  liteMotion,
}: DeckZoneProps) {
  const deckRef = useRef<HTMLDivElement>(null);
  const potRef = useRef<HTMLDivElement>(null);
  const [pulsing, setPulsing] = useState(false);
  const [potFlash, setPotFlash] = useState<{ key: string; label?: string } | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useRegisterZone("deck", {
    getRect: () => deckRef.current?.getBoundingClientRect() ?? null,
    pulse: (durationMs = 900) => {
      setPulsing(true);
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
      pulseTimer.current = setTimeout(() => setPulsing(false), durationMs);
    },
  });

  useRegisterZone("pot", {
    getRect: () => potRef.current?.getBoundingClientRect() ?? null,
    flash: (label?: string) => {
      setPotFlash({ key: `pot-${Date.now()}`, label });
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setPotFlash(null), 1600);
    },
  });

  return (
    <div
      className={motionEnabled && !liteMotion && dealing ? "nj-pot-cluster nj-pot-cluster-ready" : "nj-pot-cluster"}
      style={{
        position: "absolute",
        top: "45%",
        left: "50%",
        transform: "translate(-50%,-50%)",
        display: "flex",
        alignItems: "center",
        gap: 14,
        zIndex: 5,
      }}
    >
      <div
        ref={deckRef}
        style={{
          position: "relative",
          animation:
            motionEnabled && ((premiumFxAllowed && dealing) || pulsing)
              ? "deckDeal .26s infinite"
              : "none",
        }}
      >
        <div style={{ position: "absolute", top: -3, left: 3, zIndex: -1 }}>
          <PlayCard hidden w={deckW} />
        </div>
        <PlayCard hidden w={deckW} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
        <div ref={potRef} style={{ position: "relative" }}>
          <Chip strong style={{ fontSize: 13 }}>
            <NjamboIcon name="coin" tone="gold" size={16} />
            <span style={{ ...displayFont, fontWeight: 900, color: T.gold }}>{NKAP(pot)}</span>
          </Chip>
          {potFlash && (
            <div key={potFlash.key} className="nj-pot-flash" aria-hidden="true">
              {potFlash.label ?? ""}
            </div>
          )}
        </div>
        <Chip style={{ fontSize: 15 }}>
          <span style={{ opacity: 0.6, fontSize: 10, letterSpacing: ".1em" }}>TENDANCE&nbsp;</span>
          <span style={{ color: ledColor === "#c1292e" ? T.bad : "#fff", fontWeight: 900 }}>
            {ledSuit ?? "—"}
          </span>
        </Chip>
      </div>
    </div>
  );
});

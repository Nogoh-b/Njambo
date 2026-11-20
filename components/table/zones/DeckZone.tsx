"use client";

/* ═══════════════ DeckZone — pioche 3D discrète + médaillon Pot ═══════════════
   Version épurée « Salon Royal » : libère le centre du tapis tout en exposant
   exactement les deux handles du ZoneRegistry :
   - "deck" : rect de la pioche + pulse (échanges Vent du Nord / Marché de Nuit) ;
   - "pot"  : rect du pot + flash avec label (« +200 », « ×2 »…). */

import { memo, useRef, useState } from "react";
import { PlayCard } from "@/components/cards/PlayCard";
import { NjamboIcon } from "@/components/ui/Art";
import { displayFont } from "@/components/ui/Shell";
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
  portrait?: boolean;
}

export const DeckZone = memo(function DeckZone({
  deckW,
  pot,
  dealing,
  motionEnabled,
  premiumFxAllowed,
  liteMotion,
  portrait = false,
}: DeckZoneProps) {
  const deckRef = useRef<HTMLDivElement>(null);
  const potRef = useRef<HTMLDivElement>(null);
  const [pulsing, setPulsing] = useState(false);
  const [potFlash, setPotFlash] = useState<{ key: string; label?: string } | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useRegisterZone("deck", {
    getRect: () => deckRef.current?.getBoundingClientRect() ?? null,
    getElement: () => deckRef.current,
    pulse: (durationMs = 900) => {
      setPulsing(true);
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
      pulseTimer.current = setTimeout(() => setPulsing(false), durationMs);
    },
  });

  useRegisterZone("pot", {
    getRect: () => potRef.current?.getBoundingClientRect() ?? null,
    getElement: () => potRef.current,
    flash: (label?: string) => {
      setPotFlash({ key: `pot-${Date.now()}`, label });
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setPotFlash(null), 1600);
    },
  });

  const visualDeckW = Math.round(deckW * (portrait ? 0.78 : 0.88));

  return (
    <div
      className={motionEnabled && !liteMotion && dealing ? "nj-pot-cluster nj-pot-cluster-ready" : "nj-pot-cluster"}
      style={{
        position: "absolute",
        top: portrait ? "45.5%" : "45%",
        left: "50%",
        transform: "translate(-50%,-50%)",
        display: "flex",
        alignItems: "center",
        gap: portrait ? 8 : 12,
        zIndex: 5,
        pointerEvents: "none",
      }}
    >
      {/* Pioche 3D empilée (3 épaisseurs subtiles — pulse pendant la donne) */}
      <div
        ref={deckRef}
        style={{
          position: "relative",
          transform: "rotate(-6deg)",
          animation:
            motionEnabled && (dealing || pulsing)
              ? "deckDeal .22s ease-in-out infinite"
              : "none",
          willChange: dealing || pulsing ? "transform" : undefined,
        }}
      >
        <div style={{ position: "absolute", top: -4, left: 4, zIndex: -2, opacity: 0.72 }}>
          <PlayCard hidden w={visualDeckW} />
        </div>
        <div style={{ position: "absolute", top: -2, left: 2, zIndex: -1, opacity: 0.88 }}>
          <PlayCard hidden w={visualDeckW} />
        </div>
        <div style={{ borderRadius: Math.max(8, visualDeckW * 0.14), boxShadow: "0 10px 18px rgba(0, 0, 0, 0.58)" }}>
          <PlayCard hidden w={visualDeckW} />
        </div>
      </div>

      {/* Médaillon Pot épuré posé sur le feutre (ancre des effets de pot) */}
      <div ref={potRef} style={{ position: "relative" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: portrait ? "4px 9px 4px 6px" : "5px 11px 5px 7px",
            borderRadius: 999,
            border: "1px solid rgba(255, 214, 96, 0.44)",
            background: "rgba(6, 20, 16, 0.76)",
            boxShadow: "inset 0 1px 0 rgba(255, 244, 200, 0.2), 0 6px 14px rgba(0, 0, 0, 0.42)",
          }}
        >
          <NjamboIcon name="coin" tone="gold" size={portrait ? 14 : 16} />
          <span
            style={{
              ...displayFont,
              fontWeight: 900,
              fontSize: portrait ? 11.5 : 13,
              color: "#ffe88a",
              letterSpacing: "0.02em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {NKAP(pot)}
          </span>
        </div>
        {potFlash && (
          <div key={potFlash.key} className="nj-pot-flash" aria-hidden="true">
            {potFlash.label ?? ""}
          </div>
        )}
      </div>
    </div>
  );
});

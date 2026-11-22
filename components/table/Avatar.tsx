"use client";

import { memo, useEffect, useRef, useState } from "react";
import { T } from "@/config/theme";
import { NKAP } from "@/data/mock";
import { POWER_CARDS_BY_ID } from "@/config/powerCards";
import { CATEGORY_MOTIF_PALETTE, PowerCardMotif } from "@/components/power/PowerCardMotif";
import { AvatarIllustration } from "@/components/ui/Art";
import { useRegisterZone, type ZoneKey } from "@/components/table/zones/ZoneRegistry";
import type { Player, PowerCardId } from "@/types/game";

export interface OpponentPowerSlot {
  /** Renseigné une fois la carte jouée / révélée devant la table. */
  revealedCardId?: PowerCardId;
  used?: boolean;
}

interface AvatarProps {
  p: Player;
  active: boolean;
  seconds: number;
  turnSeconds: number;
  size?: number;
  /** Siège (pour l'enregistrement du handle timer). */
  seatIdx?: number;
  /** Capsule horizontale compacte (idéale pour ton propre siège en portrait). */
  compactHorizontal?: boolean;
  /** Mode dev temps illimité (affiche ∞ sur le badge timer). */
  unlimitedTime?: boolean;
  /** Mini-cartes pouvoir discrètes des adversaires (dos Ndop ou révélée si jouée). */
  opponentPowers?: OpponentPowerSlot[];
}

type AuraStyle = "shield" | "mask" | "totem" | "lucky";

const AURA_EMOJI: Record<AuraStyle, string> = {
  shield: "🛡️",
  mask: "🎭",
  totem: "🗿",
  lucky: "🍀",
};

export const Avatar = memo(function Avatar({
  p,
  active,
  seconds,
  turnSeconds,
  size = 54,
  seatIdx,
  compactHorizontal = false,
  unlimitedTime = false,
  opponentPowers,
}: AvatarProps) {
  const S = compactHorizontal ? 44 : size;
  const R = S / 2 - 4;
  const C = 2 * Math.PI * R;
  const frac = active
    ? unlimitedTime
      ? 1
      : Math.max(0, Math.min(1, seconds / Math.max(1, turnSeconds)))
    : 0;

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
  const balancePulseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useRegisterZone(seatIdx !== undefined ? (`timer:${seatIdx}` as ZoneKey) : undefined, {
    getRect: () => rootRef.current?.getBoundingClientRect() ?? null,
    getElement: () => rootRef.current,
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
    // Modèles d'animation : même éclat que lors d'un gain réel.
    pulseBalance: (durationMs: number) => {
      setFlash("gain");
      if (balancePulseRef.current) clearTimeout(balancePulseRef.current);
      balancePulseRef.current = setTimeout(() => setFlash(null), durationMs);
    },
  });

  useEffect(() => {
    return () => {
      if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current);
      if (deltaTimerRef.current) clearTimeout(deltaTimerRef.current);
      if (balancePulseRef.current) clearTimeout(balancePulseRef.current);
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

  const urgent = active && !unlimitedTime && seconds <= 5 && !frozen;
  const ringStroke = frozen ? "#7fd6ff" : urgent ? "#ff4772" : "#ffcf40";
  const timerLabel = unlimitedTime ? "∞" : `${seconds}s`;

  const avatarOrb = (
    <div style={{ position: "relative", width: S, height: S, flex: "0 0 auto" }}>
      <svg width={S} height={S} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
        <circle
          cx={S / 2}
          cy={S / 2}
          r={R}
          fill="none"
          stroke={active ? "rgba(255, 224, 130, 0.28)" : "rgba(255, 240, 195, 0.16)"}
          strokeWidth={compactHorizontal ? "3.6" : "3.8"}
        />
        {active && (
          <circle
            cx={S / 2}
            cy={S / 2}
            r={R}
            fill="none"
            stroke={ringStroke}
            strokeWidth={compactHorizontal ? "3.8" : "4"}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - frac)}
            style={{
              transition: "stroke-dashoffset 1s linear, stroke .3s",
              filter: `drop-shadow(0 0 6px ${ringStroke})`,
            }}
          />
        )}
      </svg>
      <span style={{ position: "absolute", inset: compactHorizontal ? 4 : 5 }}>
        <AvatarIllustration seed={p.emoji || p.name} size={S - (compactHorizontal ? 8 : 10)} active={active} />
      </span>

      {/* Cosmétiques (phase 5) : cadre par-dessus l'avatar, badge en bas à droite. */}
      {p.cosmetics?.avatarFrame?.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- image uploadée depuis l'admin (URL du VPS)
        <img src={p.cosmetics.avatarFrame.imageUrl} alt="" aria-hidden="true" className="nj-avatar-frame" />
      )}
      {p.cosmetics?.badge?.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.cosmetics.badge.imageUrl} alt={p.cosmetics.badge.name} title={p.cosmetics.badge.name} className="nj-avatar-badge" />
      )}

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

      {active && !compactHorizontal && (
        <div
          title={unlimitedTime ? "Temps illimité" : `Temps restant : ${seconds}s`}
          style={{
            position: "absolute",
            bottom: -7,
            left: "50%",
            transform: "translateX(-50%)",
            minWidth: 32,
            textAlign: "center",
            background: frozen ? "#13415a" : urgent ? "#7d102b" : "#191108",
            color: "#fff9e6",
            border: `1.5px solid ${ringStroke}`,
            fontSize: 9.5,
            fontWeight: 950,
            borderRadius: 999,
            padding: "1px 6px",
            boxShadow: `0 2px 8px rgba(0, 0, 0, 0.55), 0 0 10px ${ringStroke}55`,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {timerLabel}
        </div>
      )}
    </div>
  );

  if (compactHorizontal) {
    return (
      <div
        ref={rootRef}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 10px 4px 4px",
          borderRadius: 999,
          border: `1.5px solid ${active ? ringStroke : "rgba(255, 214, 96, 0.34)"}`,
          background: active
            ? "linear-gradient(125deg, rgba(46, 30, 14, 0.94), rgba(9, 20, 16, 0.94))"
            : "rgba(8, 19, 16, 0.88)",
          backdropFilter: "blur(6px)",
          boxShadow: active
            ? `0 6px 18px rgba(0, 0, 0, 0.56), 0 0 18px ${ringStroke}48`
            : "0 6px 14px rgba(0, 0, 0, 0.44)",
          transition: "border-color 220ms ease, box-shadow 220ms ease",
        }}
      >
        {avatarOrb}
        <div style={{ display: "grid", gap: 2, lineHeight: 1.05, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                maxWidth: 72,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 11,
                fontWeight: 900,
                color: "#fffaf0",
              }}
            >
              {p.name}
            </span>
            {p.cosmetics?.title && <span className="nj-avatar-title" title={p.cosmetics.title.name}>{p.cosmetics.title.name}</span>}
            {active && (
              <span
                title={unlimitedTime ? "Temps illimité" : `Temps restant : ${seconds}s`}
                style={{
                  padding: "1px 6px",
                  borderRadius: 999,
                  background: frozen ? "#13415a" : urgent ? "#8a1230" : "rgba(255, 207, 64, 0.22)",
                  border: `1px solid ${ringStroke}`,
                  fontSize: 9.5,
                  fontWeight: 950,
                  color: urgent ? "#ffd0dc" : frozen ? "#b0ecff" : "#ffe880",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {timerLabel}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "#ffe27a",
              fontWeight: 850,
              fontVariantNumeric: "tabular-nums",
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
                top: -14,
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
  }

  return (
    <div
      ref={rootRef}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        minWidth: S + 24,
      }}
    >
      {avatarOrb}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "2px 8px",
          borderRadius: 999,
          border: `1px solid ${active ? "rgba(255, 214, 96, 0.56)" : "rgba(255, 240, 195, 0.16)"}`,
          background: "rgba(8, 18, 15, 0.84)",
          boxShadow: "0 4px 10px rgba(0, 0, 0, 0.44)",
        }}
      >
        <div
          style={{
            maxWidth: 82,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 10.5,
            fontWeight: 850,
            color: "#fffaf0",
            lineHeight: 1.15,
          }}
        >
          {p.name}
        </div>
        {p.cosmetics?.title && <span className="nj-avatar-title" style={{ maxWidth: 86, textAlign: "center" }} title={p.cosmetics.title.name}>{p.cosmetics.title.name}</span>}
        <div
          style={{
            fontSize: 9.5,
            color: "#ffe27a",
            fontWeight: 850,
            lineHeight: 1.1,
            fontVariantNumeric: "tabular-nums",
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
              top: -12,
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

      {/* Mini cartes Pouvoir discrètes des adversaires (dos Ndop ou révélée si déjà jouée) */}
      {opponentPowers && opponentPowers.length > 0 && (
        <div
          aria-label={`${p.name} : ${opponentPowers.filter((s) => !s.used).length} pouvoir(s) en réserve`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 1,
          }}
        >
          {opponentPowers.map((slot, idx) => {
            const def = slot.revealedCardId ? POWER_CARDS_BY_ID[slot.revealedCardId] : undefined;
            const pal = def ? CATEGORY_MOTIF_PALETTE[def.category] : null;
            const mid = (opponentPowers.length - 1) / 2;
            const rot = (idx - mid) * 8;
            return (
              <span
                key={idx}
                title={def ? `${def.name} (utilisée)` : "Carte pouvoir cachée"}
                style={{
                  position: "relative",
                  width: 15,
                  height: 21,
                  marginLeft: idx === 0 ? 0 : -3,
                  borderRadius: 3.5,
                  overflow: "hidden",
                  transform: `rotate(${rot}deg)`,
                  opacity: slot.used ? 0.56 : 0.94,
                  background: pal
                    ? `linear-gradient(170deg, ${pal.clothTop}, ${pal.clothBot})`
                    : "linear-gradient(165deg, #271a3a, #100918)",
                  border: pal ? "0" : "1px solid rgba(255, 214, 96, 0.45)",
                  boxShadow: pal
                    ? `0 2px 6px rgba(0, 0, 0, 0.55), 0 0 6px ${pal.glow}`
                    : "0 2px 6px rgba(0, 0, 0, 0.55)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {def ? (
                  <>
                    <PowerCardMotif
                      category={def.category}
                      rarity={def.rarity}
                      className="nj-opp-power-motif"
                    />
                    {slot.used && (
                      <span
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "rgba(5, 10, 9, 0.42)",
                          display: "grid",
                          placeItems: "center",
                          color: "#78ffdf",
                          fontSize: 9,
                          fontWeight: 950,
                        }}
                      >
                        ✓
                      </span>
                    )}
                  </>
                ) : (
                  <svg viewBox="0 0 24 34" width="100%" height="100%" aria-hidden="true">
                    <path
                      d="M3 6 L8 2 L12 6 L16 2 L21 6 M3 28 L8 32 L12 28 L16 32 L21 28"
                      fill="none"
                      stroke="#ffcf40"
                      strokeWidth="1.2"
                      opacity="0.72"
                    />
                    <polygon
                      points="12,9 18,17 12,25 6,17"
                      fill="rgba(255, 207, 64, 0.22)"
                      stroke="#ffe573"
                      strokeWidth="1.2"
                    />
                  </svg>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
});

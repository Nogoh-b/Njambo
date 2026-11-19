"use client";

import { memo, type CSSProperties } from "react";
import { motion } from "motion/react";
import { GAME_CONFIG } from "@/config/gameConfig";
import { T } from "@/config/theme";
import { PlayCard } from "@/components/cards/PlayCard";
import type { Flight } from "@/types/game";

/* ═══════════════ FILE: components/table/FlyingCard.tsx ═══════════════
   Vol main → dépôt 100% composité GPU (transform uniquement, zéro blur/reflow).
   - Joueur local : la carte quitte son emplacement face visible et glisse en arc
     fluide vers son dépôt.
   - Adversaires / bots (Solo & Multijoueur) : la carte quitte l'éventail face
     cachée puis se retourne en 3D (rotateY) en plein vol pour se révéler juste
     avant d'atterrir sur le dépôt. */
interface FlyingCardProps {
  f: Flight;
  effects?: boolean;
  /** Mode balanced: réduit les particules de pouvoir à 3. */
  balanced?: boolean;
}

export const FlyingCard = memo(function FlyingCard({ f, effects = true, balanced = false }: FlyingCardProps) {
  const dur = GAME_CONFIG.anim.dropFlight;
  const w = f.w;
  const h = w * 1.45;
  const radius = Math.max(8, w * 0.14);

  const fromCx = f.from.left + f.from.width / 2;
  const fromCy = f.from.top + f.from.height / 2;
  const toCx = f.to.left + f.to.width / 2;
  const toCy = f.to.top + f.to.height / 2;
  const dx = toCx - fromCx;
  const dy = toCy - fromCy;

  const startScale = Math.max(Math.max(f.from.width * 0.72, 34) / w, 0.42);
  const startRot = f.angle > 180 ? f.angle - 360 : f.angle;
  const arc = -Math.min(76, Math.max(28, Math.hypot(dx, dy) * 0.16));
  const fxColor = f.fxTone ? T[f.fxTone] : T.gold;

  // Flip 3D mi-parcours pour les coups adverses (sauf si faceUp forcé explicitement par un pouvoir).
  const flipMidFlight = f.faceUp === undefined && !f.isYou && f.card.rank !== "?";
  const showFaceDirectly = f.faceUp ?? f.isYou;

  const initial: Record<string, number> = effects
    ? { x: 0, y: 0, rotate: startRot - 8, scale: startScale * 1.05 }
    : { x: 0, y: 0, rotate: startRot, scale: startScale };

  const animate = effects
    ? {
        x: [0, dx * 0.52, dx],
        y: [0, dy * 0.44 + arc, dy],
        rotate: [startRot - 8, (startRot + f.dropRot) * 0.5, f.dropRot],
        scale: [startScale * 1.04, 1.08, 1],
      }
    : {
        x: [0, dx],
        y: [0, dy],
        rotate: [startRot, f.dropRot],
        scale: [startScale, 1],
      };

  return (
    <motion.div
      className={f.fxPreset ? `nj-flight-fx-${f.fxPreset}` : undefined}
      initial={initial}
      animate={animate}
      transition={{
        duration: dur / 1000,
        ease: [0.22, 0.88, 0.28, 1],
        times: effects ? [0, 0.46, 1] : [0, 1],
      }}
      style={{
        position: "fixed",
        left: fromCx - w / 2,
        top: fromCy - h / 2,
        width: w,
        height: h,
        zIndex: 300,
        pointerEvents: "none",
        willChange: "transform",
        perspective: flipMidFlight ? 600 : undefined,
        "--flight-dur": `${dur}ms`,
        "--flight-fx-color": fxColor,
      } as CSSProperties}
    >
      {(effects || f.fxPreset) && (
        <span className="nj-flying-card-trail" aria-hidden="true">
          {f.fxPreset && Array.from({ length: effects ? (balanced ? 3 : 6) : 3 }, (_, index) => (
            <i
              key={index}
              style={{
                "--trail-index": index,
                "--trail-left": `${10 + index * 9}%`,
                "--trail-top": `${16 + (index % 4) * 17}%`,
                "--trail-size": `${3 + index * 0.35}px`,
              } as CSSProperties}
            />
          ))}
        </span>
      )}

      {flipMidFlight ? (
        <motion.div
          className={f.fxPreset ? "nj-flying-card-fx" : undefined}
          initial={{ rotateY: 0 }}
          animate={{ rotateY: 180 }}
          transition={{
            duration: (dur * 0.62) / 1000,
            delay: (dur * 0.14) / 1000,
            ease: [0.25, 0.85, 0.35, 1],
          }}
          style={{
            position: "relative",
            width: w,
            height: h,
            transformStyle: "preserve-3d",
            borderRadius: radius,
            boxShadow: effects ? "0 14px 20px rgba(0,0,0,.52)" : undefined,
          }}
        >
          {/* Dos visible au départ de la main adverse */}
          <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden" }}>
            <PlayCard card={f.card} w={w} hidden />
          </div>
          {/* Face révélée en plein vol avant l'atterrissage sur le dépôt */}
          <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
            <PlayCard card={f.card} w={w} hidden={false} />
          </div>
        </motion.div>
      ) : (
        <div
          className={f.fxPreset ? "nj-flying-card-fx" : undefined}
          style={effects ? { borderRadius: radius, boxShadow: "0 14px 20px rgba(0,0,0,.52)" } : undefined}
        >
          <PlayCard card={f.card} w={w} hidden={!showFaceDirectly} />
        </div>
      )}
    </motion.div>
  );
});

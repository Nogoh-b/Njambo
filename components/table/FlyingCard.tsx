"use client";

import { memo, type CSSProperties } from "react";
import { motion } from "motion/react";
import { GAME_CONFIG } from "@/config/gameConfig";
import { T } from "@/config/theme";
import { PlayCard } from "@/components/cards/PlayCard";
import type { Flight } from "@/types/game";

/* ═══════════════ FILE: components/table/FlyingCard.tsx ═══════════════
   Vol main → dépôt piloté par Framer Motion. On garde l'architecture
   optimisée : élément de taille FIXE, on n'anime QUE `transform`
   (x/y/rotate/scale) + la traînée → tout reste sur le compositeur (GPU),
   aucun recalcul de layout par frame. Le cycle de vie du vol (création à
   partir des rects source/cible figés, retrait après `dropFlight`, timing
   de la sync) reste géré par TableScreen — ce composant ne fait qu'animer. */
interface FlyingCardProps {
  f: Flight;
  effects?: boolean;
  /** Mode balanced: reduit les particules a 3. */
  balanced?: boolean;
}

export const FlyingCard = memo(function FlyingCard({ f, effects = true, balanced = false }: FlyingCardProps) {
  const dur = GAME_CONFIG.anim.dropFlight;
  const w = f.w;
  const h = w * 1.45;

  // Centres source / cible (coordonnées écran figées à la création du vol)
  const fromCx = f.from.left + f.from.width / 2;
  const fromCy = f.from.top + f.from.height / 2;
  const toCx = f.to.left + f.to.width / 2;
  const toCy = f.to.top + f.to.height / 2;
  const dx = toCx - fromCx;
  const dy = toCy - fromCy;

  // La carte part à la taille de la source (souvent plus petite que le dépôt)
  const startScale = Math.max(Math.max(f.from.width * 0.7, 34) / w, 0.35);
  const startRot = f.angle > 180 ? f.angle - 360 : f.angle;
  // Hauteur de l'arc proportionnelle à la distance parcourue (borne raisonnable)
  const arc = -Math.min(90, Math.max(34, Math.hypot(dx, dy) * 0.18));
  const fxColor = f.fxTone ? T[f.fxTone] : T.gold;

  // Keyframes transform : arc en 3 temps (avec effets) ou trajet direct.
  const initial: Record<string, number> = effects
    ? { x: 0, y: 0, rotate: startRot - 12, scale: startScale * 1.08 }
    : { x: 0, y: 0, rotate: startRot, scale: startScale };

  const animate = effects
    ? {
        x: [0, dx * 0.5, dx],
        y: [0, dy * 0.5 + arc, dy],
        rotate: [startRot - 12, (startRot + f.dropRot) / 2, f.dropRot],
        scale: [startScale * 1.08, 1.05, 1],
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
        ease: [0.3, 0.75, 0.35, 1],
        times: effects ? [0, 0.5, 1] : [0, 1],
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
        "--flight-dur": `${dur}ms`,
        "--flight-fx-color": fxColor,
      } as CSSProperties}
    >
      {(effects || f.fxPreset) && (
        <span className="nj-flying-card-trail" aria-hidden="true">
          {f.fxPreset && Array.from({ length: effects ? (balanced ? 3 : 7) : 3 }, (_, index) => (
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
      {/* box-shadow peint une fois dans le bitmap composited -- pas de repaint GPU par frame. */}
      <div
        className={f.fxPreset ? "nj-flying-card-fx" : undefined}
        style={effects ? { borderRadius: Math.max(8, w * 0.14), boxShadow: "0 16px 20px rgba(0,0,0,.55)" } : undefined}
      >
        {/* Les bots montrent le dos pendant le vol, le joueur montre la face */}
        <PlayCard card={f.card} w={w} hidden={!(f.faceUp ?? f.isYou)} />
      </div>
    </motion.div>
  );
});

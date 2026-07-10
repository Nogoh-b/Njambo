"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { GAME_CONFIG } from "@/config/gameConfig";
import { PlayCard } from "@/components/cards/PlayCard";
import type { Flight } from "@/types/game";

/* ═══════════════ FILE: components/table/FlyingCard.tsx ═══════════════
   Vol main → dépôt. Fluide : élément de taille FIXE, on n'anime QUE
   `transform` (translate3d + rotate + scale) + `opacity` via la Web
   Animations API → tout reste sur le compositeur (GPU), aucun recalcul de
   layout par frame (contrairement à animer left/top/width/height). */
interface FlyingCardProps {
  f: Flight;
  effects?: boolean;
}

export function FlyingCard({ f, effects = true }: FlyingCardProps) {
  const ref = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const keyframes: Keyframe[] = effects
      ? [
          { transform: `translate3d(0,0,0) rotate(${startRot - 12}deg) scale(${startScale * 1.08})`, offset: 0 },
          {
            transform: `translate3d(${dx * 0.5}px, ${dy * 0.5 + arc}px, 0) rotate(${(startRot + f.dropRot) / 2}deg) scale(1.05)`,
            offset: 0.5,
          },
          { transform: `translate3d(${dx}px, ${dy}px, 0) rotate(${f.dropRot}deg) scale(1)`, offset: 1 },
        ]
      : [
          { transform: `translate3d(0,0,0) rotate(${startRot}deg) scale(${startScale})`, offset: 0 },
          { transform: `translate3d(${dx}px, ${dy}px, 0) rotate(${f.dropRot}deg) scale(1)`, offset: 1 },
        ];

    const anim = el.animate(keyframes, {
      duration: dur,
      easing: "cubic-bezier(.3,.75,.35,1)",
      fill: "forwards",
    });
    return () => anim.cancel();
    // f est stable pour la durée du vol (une nouvelle carte = un nouveau key)
  }, [dx, dy, startScale, startRot, f.dropRot, arc, dur, effects]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: fromCx - w / 2,
        top: fromCy - h / 2,
        width: w,
        height: h,
        zIndex: 300,
        pointerEvents: "none",
        willChange: "transform",
        // état initial avant le 1er frame de l'animation (évite un flash au centre final)
        transform: `rotate(${startRot}deg) scale(${startScale})`,
        "--flight-dur": `${dur}ms`,
      } as CSSProperties}
    >
      {effects && <span className="nj-flying-card-trail" aria-hidden="true" />}
      <div style={{ filter: "drop-shadow(0 16px 20px rgba(0,0,0,.55))" }}>
        {/* Les bots montrent le dos pendant le vol, le joueur montre la face */}
        <PlayCard card={f.card} w={w} hidden={!f.isYou} />
      </div>
    </div>
  );
}

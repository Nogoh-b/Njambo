"use client";

import { forwardRef, type CSSProperties } from "react";
import { motion, type MotionProps } from "motion/react";
import { PlayCard, type PlayCardProps } from "@/components/cards/PlayCard";

/* ═══════════════ FILE: components/cards/MotionCard.tsx ═══════════════
   Brique commune animée : un `motion.div` qui enveloppe le rendu visuel de
   PlayCard (inchangé). C'est la couche qui porte le layout (layoutId), le drag
   pour jouer, et les micro-animations (hover/tap). Les props visuelles vont à
   PlayCard ; les comportements motion passent par `anim`. */

interface MotionCardProps {
  /* Props visuelles transmises à PlayCard */
  card?: PlayCardProps["card"];
  hidden?: boolean;
  w?: number;
  rot?: number;
  lift?: number;
  dim?: boolean;
  glow?: boolean;
  onClick?: () => void;
  dealDelay?: number | null;
  /* Comportement Framer Motion (drag, layout, whileHover, transition, style…) */
  anim?: MotionProps;
  className?: string;
  style?: CSSProperties;
}

export const MotionCard = forwardRef<HTMLDivElement, MotionCardProps>(function MotionCard(
  { card, hidden, w, rot, lift, dim, glow, onClick, dealDelay, anim, className, style },
  ref,
) {
  const playCard = (
    <PlayCard
      card={card}
      hidden={hidden}
      w={w}
      rot={rot}
      lift={lift}
      dim={dim}
      glow={glow}
      onClick={onClick}
      dealDelay={dealDelay}
    />
  );

  // div natif si pas d'anim: evite l'overhead Framer Motion sur les
  // cartes adverses statiques (3 adversaires x 5 cartes = 15 motion.div).
  if (!anim) {
    return <div ref={ref} className={className} style={style}>{playCard}</div>;
  }

  return (
    <motion.div ref={ref} className={className} style={style} tabIndex={-1} {...anim}>
      {playCard}
    </motion.div>
  );
});

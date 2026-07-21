"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { MOTION_DURATION_MS, useMotionProfile } from "@/lib/motion";

interface HubRevealProps {
  children: ReactNode;
  className?: string;
  order?: number;
  axis?: "x" | "y";
  distance?: number;
  duration?: "navigation" | "panel";
}

/** Entrée légère des blocs de hub, réservée aux profils full/balanced. */
export function HubReveal({
  children,
  className,
  order = 0,
  axis = "y",
  distance = 12,
  duration = "panel",
}: HubRevealProps) {
  const profile = useMotionProfile();
  const enabled = profile.enabled && profile.allowEntranceCascade;
  const offset = axis === "x" ? { x: distance, y: 0 } : { x: 0, y: distance };
  const step = profile.allowLongCascade ? 0.055 : 0.035;

  return (
    <motion.div
      className={className}
      initial={enabled ? { opacity: 0, ...offset } : false}
      animate={enabled ? { opacity: 1, x: 0, y: 0 } : undefined}
      transition={enabled ? {
        duration: MOTION_DURATION_MS[duration] / 1_000,
        delay: Math.min(order, profile.allowLongCascade ? 6 : 3) * step,
        ease: [0.22, 0.85, 0.3, 1],
      } : undefined}
    >
      {children}
    </motion.div>
  );
}

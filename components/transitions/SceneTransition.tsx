"use client";

import type { ReactNode } from "react";

/* ═══════════════ SceneTransition ═══════════════
   Wrapper qui applique une animation d'entrée/sortie
   CSS (fade + léger scale) autour de chaque scène. */

export type TransitionStyle = "fade" | "slide";

interface SceneTransitionProps {
  children: ReactNode;
  active: boolean;
  style?: TransitionStyle;
}

export function SceneTransition({ children, active }: SceneTransitionProps) {
  /* Quand active = true, la scène est affichée.
     Le parent (SceneRouter) gère la séquence exit → swap → enter. */
  if (!active) return null;

  return (
    <div
      className="scene-enter-fade"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1,
      }}
    >
      {children}
    </div>
  );
}

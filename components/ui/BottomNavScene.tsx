"use client";

import type { ReactNode } from "react";
import { BottomNav, type BottomNavKey } from "@/components/ui/BottomNav";
import { Shell } from "@/components/ui/Shell";
import styles from "./BottomNavScene.module.css";

interface BottomNavSceneProps {
  children: ReactNode;
  active?: BottomNavKey;
  /** Limite le contenu et le dock à la largeur des anciennes scènes téléphone. */
  narrow?: boolean;
  className?: string;
  contentClassName?: string;
}

/**
 * Scène de base pour tous les écrans avec navigation principale.
 * Elle occupe exactement le viewport : seul le contenu défile, le dock reste
 * fixé au viewport et son espace est réservé jusque dans la safe area.
 */
export function BottomNavScene({
  children,
  active,
  narrow = false,
  className,
  contentClassName,
}: BottomNavSceneProps) {
  return (
    <Shell>
      <div className={`nj-safe nj-bottom-nav-scene ${styles.scene}${narrow ? ` nj-bottom-nav-scene--narrow ${styles.narrow}` : ""}${className ? ` ${className}` : ""}`}>
        <div className={`nj-bottom-nav-scene-scroll ${styles.scroll}${contentClassName ? ` ${contentClassName}` : ""}`}>
          {children}
        </div>
        <BottomNav active={active} />
      </div>
    </Shell>
  );
}

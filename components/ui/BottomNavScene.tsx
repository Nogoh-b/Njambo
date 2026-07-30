"use client";

import type { ReactNode } from "react";
import { BottomNav, type BottomNavKey } from "@/components/ui/BottomNav";
import { Shell } from "@/components/ui/Shell";
import { useGame } from "@/contexts/GameContext";
import { resolveSceneBottomNav } from "@/lib/homeArcadeMotion";
import styles from "./BottomNavScene.module.css";

interface BottomNavSceneProps {
  children: ReactNode;
  active?: BottomNavKey;
  /** Limite le contenu et le dock à la largeur des anciennes scènes téléphone. */
  narrow?: boolean;
  /**
   * Affiche le dock principal. À passer à `false` sur les sous-écrans ouverts
   * DEPUIS le dock : ils portent déjà leur propre retour, le dock y ferait
   * doublon et sa réserve de hauteur est la plus chère de l'écran.
   */
  dock?: boolean;
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
  dock = true,
  className,
  contentClassName,
}: BottomNavSceneProps) {
  const { scene } = useGame();
  const resolvedActive = active ?? resolveSceneBottomNav(scene);

  return (
    <Shell>
      <div className={`nj-safe nj-bottom-nav-scene ${styles.scene}${narrow ? ` nj-bottom-nav-scene--narrow ${styles.narrow}` : ""}${dock ? "" : ` ${styles.noDock}`}${className ? ` ${className}` : ""}`}>
        <div className={`nj-bottom-nav-scene-scroll ${styles.scroll}${contentClassName ? ` ${contentClassName}` : ""}`}>
          {children}
        </div>
        {dock && <BottomNav active={resolvedActive} />}
      </div>
    </Shell>
  );
}

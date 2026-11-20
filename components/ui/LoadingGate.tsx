"use client";

/* Porte de chargement : n'affiche ses enfants qu'une fois les assets
   indispensables prêts (images décodées, sons décodés).
   - Déjà en cache (préchargement d'approche) → affichage immédiat.
   - Chargement rapide (< 150 ms) → rien n'apparaît, pas de flash.
   - Sinon : écran de chargement (barre de progression + astuce).
   - Délai maximum (6 s par défaut) : on affiche quand même, les assets
     manquants arrivent ensuite.
   Une fois ouverte, la porte charge les assets secondaires en arrière-plan. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { areAssetsReady, loadAssets, prefetchAssets } from "@/lib/assets/AssetLoader";
import type { AssetManifest } from "@/lib/assets/manifests";
import { markPerformance, measurePerformance, recordGateResult } from "@/lib/performanceMetrics";
import styles from "./LoadingGate.module.css";

export const LOADING_TIPS = [
  "Équipe tes cartes de pouvoir depuis ta collection avant de lancer une partie.",
  "Change ton dos de carte dans tes cosmétiques : il habille toute ta table.",
  "Les livres rares et exceptionnels contiennent des pouvoirs plus puissants.",
  "Surveille le timer : certains pouvoirs le gèlent, d'autres le raccourcissent.",
  "Pendant un événement, chaque victoire te rapproche du classement final.",
  "Les défis du jour rapportent des récompenses en plus de tes gains de table.",
];

export interface LoadingGateProps {
  /** Nom de l'écran (mesures de performance). */
  name: string;
  /** Manifeste, calculé une seule fois au montage. */
  manifest: AssetManifest | (() => AssetManifest);
  children: ReactNode;
  maxWaitMs?: number;
  showAfterMs?: number;
  title?: string;
  /** Classe de fond (couleurs de l'écran). */
  className?: string;
}

type Phase = "pending" | "visible" | "ready";

export function LoadingGate({ name, manifest, children, maxWaitMs = 6000, showAfterMs = 150, title = "Préparation de la table", className }: LoadingGateProps) {
  const manifestRef = useRef<AssetManifest | null>(null);
  if (!manifestRef.current) manifestRef.current = typeof manifest === "function" ? manifest() : manifest;
  const [phase, setPhase] = useState<Phase>(() => (areAssetsReady(manifestRef.current!.critical) ? "ready" : "pending"));
  const [progress, setProgress] = useState({ loaded: 0, total: manifestRef.current.critical.length });
  const [tip] = useState(() => LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]);
  const initiallyReady = useRef(phase === "ready");

  useEffect(() => {
    const current = manifestRef.current!;
    if (initiallyReady.current) {
      recordGateResult(name, { waitedMs: 0, shown: false, timedOut: false });
      prefetchAssets(current.background);
      return;
    }
    let done = false;
    let shown = false;
    const started = performance.now();
    markPerformance(`gate:${name}:start`);
    const finish = (timedOut: boolean) => {
      if (done) return;
      done = true;
      window.clearTimeout(showTimer);
      window.clearTimeout(maxTimer);
      markPerformance(`gate:${name}:ready`);
      measurePerformance(`gate:${name}`, `gate:${name}:start`, `gate:${name}:ready`);
      recordGateResult(name, { waitedMs: Math.round(performance.now() - started), shown, timedOut });
      setPhase("ready");
      prefetchAssets(current.background);
    };
    const showTimer = window.setTimeout(() => { if (!done) { shown = true; setPhase("visible"); } }, showAfterMs);
    const maxTimer = window.setTimeout(() => finish(true), maxWaitMs);
    void loadAssets(current.critical, { priority: "critical", onProgress: (value) => { if (!done) setProgress(value); } }).then(() => finish(false));
    return () => { done = true; window.clearTimeout(showTimer); window.clearTimeout(maxTimer); };
  }, [name, maxWaitMs, showAfterMs]);

  if (phase === "ready") return <>{children}</>;
  const ratio = progress.total ? progress.loaded / progress.total : 1;
  return (
    <div className={`${styles.gate} ${className ?? ""}`} data-loading-gate={name} role="status" aria-live="polite" aria-busy="true">
      {phase === "visible" && (
        <div className={styles.panel}>
          <div className={styles.cards} aria-hidden="true"><span /><span /><span /></div>
          <strong className={styles.title}>{title}</strong>
          <div className={styles.bar} aria-label={`Chargement ${Math.round(ratio * 100)} %`}>
            <div className={styles.fill} style={{ transform: `scaleX(${Math.max(0.04, ratio)})` }} />
          </div>
          <small className={styles.count}>{progress.loaded} / {progress.total}</small>
          <p className={styles.tip}><b>Astuce</b> {tip}</p>
        </div>
      )}
    </div>
  );
}

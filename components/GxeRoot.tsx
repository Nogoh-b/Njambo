"use client";

import { FxLayer, GxeProvider, useGxeRuntime } from "@gxe/react";
import { useEffect, type ReactNode } from "react";

/**
 * Pont de diagnostic (développement uniquement) : `window.__gxe` donne accès
 * au runtime depuis la console. Indispensable ici, car le pane navigateur de
 * la machine de dev n'exécute pas `requestAnimationFrame` — sans lui, on ne
 * peut pas distinguer « le moteur n'écrit rien » de « aucune frame ne tourne ».
 */
function GxeDebugBridge() {
  const runtime = useGxeRuntime();
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (globalThis as Record<string, unknown>).__gxe = runtime;
  }, [runtime]);
  return null;
}

/**
 * Point de greffe du Game Experience Engine.
 *
 * `autoDiscover` équipe les contrôles natifs (boutons, onglets, switches…)
 * sans toucher à un seul composant : `Btn`, `TabBar`, `ModeCard` et les
 * autres publient dès lors `--gxe-press` / `--gxe-hover` / `--gxe-focus`,
 * que le CSS existant consomme s'il le souhaite.
 *
 * Pour exclure un élément : `data-gxe="off"`.
 *
 * `idle` fait respirer les contrôles au repos : ils publient `--gxe-idle`
 * (0→1→0). Trois garde-fous, sinon ce serait un gouffre : seuls les éléments
 * VISIBLES respirent, `prefers-reduced-motion` coupe tout, et l'onglet en
 * arrière-plan suspend la boucle. Le CSS doit faire CÉDER l'attente dès
 * qu'on survole ou qu'on appuie — une respiration qui lutte contre le doigt
 * donne un toucher mou.
 *
 * `FxLayer` monte le canvas de particules plein écran (hors du flux, sans
 * pointer-events) : il ne coûte rien tant qu'aucun effet n'est tiré, et
 * `useFx()` devient disponible partout sous ce point.
 *
 * z-index 60 : au-dessus du plateau et des cartes, sous les modales de
 * l'app (qui montent plus haut) — les effets ne masquent jamais une action.
 */
export function GxeRoot({ children }: { children: ReactNode }) {
  return (
    <GxeProvider delegate={{ autoDiscover: true, idle: { periodMs: 2300 } }}>
      <GxeDebugBridge />
      {children}
      <FxLayer zIndex={60} />
    </GxeProvider>
  );
}

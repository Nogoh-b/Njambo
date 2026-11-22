"use client";

/* Animation V2 d'une carte de pouvoir (V2-5, version simplifiée) : UN choix
   par carte. Le modèle choisi anime tous les vols de cartes (« flyCards ») des
   étapes sans chorégraphie ; une étape chorégraphiée garde sa mise en scène.
   Aperçu sur la table de démonstration, avec le lecteur du jeu. */

import { useRef, useState } from "react";
import { ChoreoDemoStage, DEMO_V2_ROUTES, type ChoreoDemoHandle, type DemoV2Route } from "@/components/power/choreo/ChoreoDemoStage";
import type { PowerModule } from "@/engine/power/types";
import { getAnimV2, isAnimV2Archived, listAnimsV2 } from "@/engine/anim/v2/registry";
import { useMotifCatalogRevision } from "@/hooks/useMotifCatalog";
import styles from "../AdminConsole.module.css";

export function AnimV2Choice({ card, error, onChange }: {
  card: Pick<PowerModule, "def" | "script">;
  error?: string;
  onChange(animV2: string | undefined): void;
}) {
  useMotifCatalogRevision(); // re-rendu à chaque publication (nouveaux modèles V2)
  const chosenId = card.def.animV2;
  const chosen = chosenId ? getAnimV2(chosenId) : null;
  const models = listAnimsV2();
  const options = chosen && !models.some((model) => model.id === chosen.id) ? [...models, chosen] : models;

  // Étapes concernées : celles qui font voler des cartes sans chorégraphie.
  const flying = card.script.steps.map((step, index) => ({
    index,
    flights: (step.anim ?? []).filter((cue) => cue.cue === "flyCards").length,
    choreo: Boolean(step.choreo),
  })).filter((step) => step.flights > 0);
  const animated = flying.filter((step) => !step.choreo);
  const keptChoreo = flying.filter((step) => step.choreo);

  const stage = useRef<ChoreoDemoHandle>(null);
  const [playing, setPlaying] = useState<DemoV2Route | null>(null);
  const play = async (route: DemoV2Route) => {
    if (!chosen) return;
    setPlaying(route);
    try { await stage.current?.playAnimV2(chosen, route); } finally { setPlaying(null); }
  };

  return (
    <section className={styles.panel} data-testid="power-anim-v2">
      <h2>Animation V2 <span className={styles.hint}>zones intelligentes, un seul choix pour la carte</span></h2>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 300px", minWidth: 0 }}>
          <label className={`${styles.field} ${error ? styles.invalid : ""}`}>
            <span>Vols de cartes</span>
            <select value={chosenId ?? ""} data-testid="power-anim-v2-select" onChange={(event) => onChange(event.target.value || undefined)}>
              <option value="">Vols habituels (V1)</option>
              {options.map((model) => <option key={model.id} value={model.id}>V2 · {model.name}{isAnimV2Archived(model.id) ? " (archivé)" : ""}</option>)}
            </select>
            {error && <span className={styles.fieldError}>{error}</span>}
          </label>
          {chosenId && !chosen && <div className={styles.fieldError}>Modèle V2 « {chosenId} » introuvable : les vols habituels s&apos;appliquent.</div>}
          <p className={styles.hint}>
            {flying.length === 0
              ? "Cette carte ne fait voler aucune carte : le choix n'a pas d'effet."
              : chosen
                ? `Les zones donnent la place, l'angle et la face ; « ${chosen.name} » règle le mouvement de ${animated.length ? `l'étape ${animated.map((step) => step.index + 1).join(", ")}` : "aucune étape"}.`
                : "Les vols suivent la mise en scène habituelle de chaque étape."}
          </p>
          {chosen && keptChoreo.length > 0 && (
            <p className={styles.hint} style={{ color: "var(--gold)" }}>
              Étape {keptChoreo.map((step) => step.index + 1).join(", ")} : une chorégraphie est définie, elle garde sa mise en scène.
            </p>
          )}
          {chosen && (
            <div className={styles.row} style={{ gap: 6 }}>
              {(Object.entries(DEMO_V2_ROUTES) as Array<[DemoV2Route, string]>).map(([route, label]) => (
                <button key={route} type="button" className={`${styles.btn} ${styles.small}`} disabled={playing !== null} data-testid={`power-anim-v2-route-${route}`} onClick={() => void play(route)}>
                  {playing === route ? "…" : `▶ ${label}`}
                </button>
              ))}
            </div>
          )}
        </div>
        {chosen && <ChoreoDemoStage ref={stage} choreo={null} width={220} />}
      </div>
    </section>
  );
}

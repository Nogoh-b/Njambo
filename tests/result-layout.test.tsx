import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResultActions, ResultLayout } from "../components/ui/ResultLayout";
import { resolveRankProgress } from "../lib/playerRank";

describe("contrat ResultLayout", () => {
  it("rend un dialogue nommé, focalisable et relié à son résumé", () => {
    const markup = renderToStaticMarkup(
      <ResultLayout
        titleId="result-title"
        descriptionId="result-summary"
        motionMode="balanced"
        scriptedMotion
        foregroundDecoration={<span data-testid="confetti-layer" />}
        main={(
          <>
            <h1 id="result-title">Tu gagnes !</h1>
            <p id="result-summary">Gain de ta manche</p>
          </>
        )}
      />,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-labelledby="result-title"');
    expect(markup).toContain('aria-describedby="result-summary"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('data-motion-level="balanced"');
    expect(markup).toContain('data-scripted-motion="true"');
    expect(markup).toContain('data-testid="confetti-layer"');
    expect(markup.indexOf('role="dialog"')).toBeLessThan(markup.indexOf('data-testid="confetti-layer"'));
  });

  it("sépare le contenu, le rail social et les actions annoncées", () => {
    const action = (label: string): ReactNode => <button type="button">{label}</button>;
    const markup = renderToStaticMarkup(
      <ResultLayout
        titleId="title"
        motionMode="off"
        main={(
          <ResultActions status="Demande envoyée.">
            {action("Revanche demandée")}
            {action("Menu")}
          </ResultActions>
        )}
        rail={<p>Amina</p>}
      />,
    );

    expect(markup).toContain('aria-label="Joueurs rencontrés"');
    expect(markup).toContain('aria-label="Actions de fin de manche"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup.indexOf("Revanche demandée")).toBeLessThan(markup.indexOf("Amina"));
  });
});

describe("progression de rang (Sceau du Chef)", () => {
  it("calcule le pourcentage et le palier suivant dans un rang intermédiaire", () => {
    const progress = resolveRankProgress(1_380);
    expect(progress.tier.id).toBe("chef_table");
    expect(progress.nextTier?.id).toBe("tambour");
    expect(progress.progressPct).toBe(40);
    expect(progress.crownsToNext).toBe(120);
  });

  it("plafonne à 100 % sans palier supérieur pour Ancêtre Njambo", () => {
    const progress = resolveRankProgress(2_350);
    expect(progress.tier.id).toBe("ancetre");
    expect(progress.nextTier).toBeNull();
    expect(progress.progressPct).toBe(100);
    expect(progress.crownsToNext).toBeNull();
  });
});

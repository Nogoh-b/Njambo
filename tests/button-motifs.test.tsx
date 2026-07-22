import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../components/ui/Art", () => ({
  NjamboIcon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

import { Btn } from "../components/ui/Btn";
import { ChoiceButtonGroup } from "../components/ui/ChoiceButtonGroup";
import { NkapAmount } from "../components/ui/NkapAmount";

describe("motifs textiles du bouton partagé", () => {
  it("compose couleur, remplissage, textile et placement latéral", () => {
    const markup = renderToStaticMarkup(
      <Btn
        tone="teal"
        fill="outline"
        motif="indigo-dots"
        motifSides="both"
      >
        Choisir
      </Btn>,
    );

    expect(markup).toContain("njb--teal");
    expect(markup).toContain("njb--outline");
    expect(markup).toContain("njb--motif-indigo-dots");
    expect(markup).toContain("njb--motif-both");
    expect(markup).toContain('class="njb__motif" aria-hidden="true"');
  });

  it("garde une sélection douce avec le Ndop uniquement sur les côtés", () => {
    const markup = renderToStaticMarkup(
      <Btn
        tone="gold"
        fill="soft"
        motif="indigo-dots"
        motifSides="both"
        ariaPressed
      >
        Normal
      </Btn>,
    );

    expect(markup).toContain("njb--soft");
    expect(markup).toContain("njb--motif-indigo-dots");
    expect(markup).toContain("njb--motif-both");
    expect(markup).toContain('aria-pressed="true"');
  });

  it("permet de choisir indépendamment le côté gauche ou droit", () => {
    const left = renderToStaticMarkup(<Btn tone="pink" motif="indigo-dots" motifSides="left">Gauche</Btn>);
    const right = renderToStaticMarkup(<Btn tone="pink" motif="indigo-dots" motifSides="right">Droite</Btn>);

    expect(left).toContain("njb--motif-left");
    expect(left).not.toContain("njb--motif-right");
    expect(right).toContain("njb--motif-right");
    expect(right).not.toContain("njb--motif-left");
  });
});

describe("groupe de choix partagé", () => {
  it("centralise l'état sélectionné tout en déléguant le design à Btn", () => {
    const markup = renderToStaticMarkup(
      <ChoiceButtonGroup
        legend="Difficulté"
        tone="gold"
        value="normal"
        onChange={() => undefined}
        options={[
          { value: "easy", content: "Facile" },
          { value: "normal", content: "Normal" },
          { value: "hard", content: "Difficile" },
        ]}
      />,
    );

    expect(markup).toContain("Difficulté");
    expect(markup).toContain("njb--gold");
    expect(markup).toContain("njb--motif-both");
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
  });
});

describe("montants Nkap illustrés", () => {
  it("remplace le suffixe visuel par l'icône monnaie tout en gardant un libellé accessible", () => {
    const markup = renderToStaticMarkup(<NkapAmount value={1250} />);

    expect(markup).toContain('data-icon="coin"');
    expect(markup).toContain("Nkap");
    expect(markup).toContain("1");
    expect(markup).toContain("250");
  });
});

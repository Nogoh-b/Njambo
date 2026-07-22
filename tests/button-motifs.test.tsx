import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../components/ui/Art", () => ({
  NjamboIcon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

import { Btn } from "../components/ui/Btn";
import { NkapAmount } from "../components/ui/NkapAmount";

describe("motifs textiles du bouton partagé", () => {
  it("compose couleur, remplissage, textile et placement latéral", () => {
    const markup = renderToStaticMarkup(
      <Btn
        tone="teal"
        fill="outline"
        motif="indigo-dots"
        motifPlacement="edges"
      >
        Choisir
      </Btn>,
    );

    expect(markup).toContain("njb--teal");
    expect(markup).toContain("njb--outline");
    expect(markup).toContain("njb--motif-indigo-dots");
    expect(markup).toContain("njb--motif-edges");
    expect(markup).toContain('class="njb__motif" aria-hidden="true"');
  });

  it("permet un textile complet sur une sélection", () => {
    const markup = renderToStaticMarkup(
      <Btn
        tone="gold"
        fill="solid"
        motif="sun-stripes"
        motifPlacement="full"
        ariaPressed
      >
        Normal
      </Btn>,
    );

    expect(markup).toContain("njb--motif-sun-stripes");
    expect(markup).toContain("njb--motif-full");
    expect(markup).toContain('aria-pressed="true"');
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

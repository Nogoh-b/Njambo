import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const shellCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("@/components/ui/GameShell", () => ({
  GameShell: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => {
    shellCalls.push(props);
    return <div data-testid="game-shell">{children}</div>;
  },
}));

vi.mock("@/components/ui/HubReveal", () => ({
  HubReveal: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock("@/components/ui/Art", () => ({
  NjamboIcon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

import {
  PreGameFooter,
  PreGameLayout,
  PreGameWorkspace,
} from "../components/ui/PreGameLayout";

describe("contrat PreGameLayout", () => {
  it("rend un titre relié à la région et garde Jouer actif", () => {
    shellCalls.length = 0;
    const markup = renderToStaticMarkup(
      <PreGameLayout title="Préparer la table" kicker="Test" icon="cards" onBack={() => undefined}>
        <p>Contenu</p>
      </PreGameLayout>,
    );

    const titleId = markup.match(/<h1 id="([^"]+)"/)?.[1];
    expect(titleId).toBeTruthy();
    expect(markup).toContain(`aria-labelledby="${titleId}"`);
    expect(markup).toContain('aria-label="Retour à Menu"');
    expect(shellCalls.at(-1)).toMatchObject({ active: "play" });
    expect(shellCalls.at(-1)?.compact).toBeUndefined();
  });

  it("conserve contenu, rail et actions comme zones distinctes", () => {
    const markup = renderToStaticMarkup(
      <PreGameLayout
        title="Préparer"
        icon="cards"
        onBack={() => undefined}
        backLabel="Quitter"
        backAriaLabel="Quitter la salle"
      >
        <PreGameWorkspace rail={<p>Rail</p>} railLabel="Résumé">
          <p>Principal</p>
        </PreGameWorkspace>
        <PreGameFooter><button type="button">Continuer</button></PreGameFooter>
      </PreGameLayout>,
    );

    expect(markup).toContain('aria-label="Résumé"');
    expect(markup).toContain('aria-label="Quitter la salle"');
    expect(markup).toContain('aria-label="Actions de préparation"');
    expect(markup.indexOf(">Principal<")).toBeLessThan(markup.indexOf(">Rail<"));
    expect(markup.indexOf(">Rail<")).toBeLessThan(markup.indexOf(">Continuer<"));
  });
});

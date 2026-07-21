import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/gameConfig", () => ({
  GAME_CONFIG: { anim: { dealFlight: 500 } },
}));

vi.mock("@/config/theme", () => ({
  CEREMONIAL_STRIP: "linear-gradient(#000, #111)",
  RAFFIA_WEAVE: () => "none",
  T: {
    chalk: "#fff8e8",
    cream: "#fff4df",
    gold: "#f2bb45",
    ink: "#1b1010",
    night1: "#090b1d",
    night3: "#171b38",
    pink: "#d83c68",
  },
}));

import { PlayCard } from "../components/cards/PlayCard";
import {
  TableLayout,
  TableLiveRegion,
  TableMenuButton,
  TablePowerTray,
  TableStatusBar,
  TableStatusMessage,
  TableSurface,
  TableTurnStatus,
} from "../components/ui/TableLayout";

describe("contrat TableLayout", () => {
  it("expose une table sémantique et ses zones prioritaires", () => {
    const markup = renderToStaticMarkup(
      <TableLayout motionMode="balanced">
        <TableSurface inset="5%"><span>Décor</span></TableSurface>
        <TableStatusBar><span>Tour 1/5</span></TableStatusBar>
        <TableStatusMessage urgent><span>Hors ligne</span></TableStatusMessage>
        <TableLiveRegion message="À toi. Donne la tendance" />
        <TableMenuButton label="Retour au menu">Menu</TableMenuButton>
        <TableTurnStatus bottomOffset={112} motionEnabled>À vous</TableTurnStatus>
        <TablePowerTray><button type="button">Pouvoir</button></TablePowerTray>
      </TableLayout>,
    );

    expect(markup).toContain('<main');
    expect(markup).toContain('aria-label="Table de jeu"');
    expect(markup).toContain('data-motion-level="balanced"');
    expect(markup).toContain('aria-label="État de la manche"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-live="assertive"');
    expect(markup).toContain('À toi. Donne la tendance');
    expect(markup).toContain('aria-label="Retour au menu"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-label="Cartes pouvoir"');
  });

  it("neutralise la table quand une scène supérieure la met en pause", () => {
    const markup = renderToStaticMarkup(
      <TableLayout motionMode="off" paused><span>Partie</span></TableLayout>,
    );

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('inert=""');
    expect(markup).toContain('data-motion-level="off"');
  });

  it("rend une carte jouable comme un vrai bouton nommé", () => {
    const markup = renderToStaticMarkup(
      <PlayCard
        card={{ id: "six-spades", rank: "6", value: 6, suit: "♠", color: "#111" }}
        onClick={() => undefined}
      />,
    );

    expect(markup).toContain('<button');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-label="Jouer 6 de pique"');
  });
});

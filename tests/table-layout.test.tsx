import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
import { PlayerHandArc } from "../components/table/PlayerHandArc";
import { BUILTIN_CARD_BACKS, BUILTIN_HAND_ARCS, BUILTIN_TABLE_COSMETICS } from "../config/tableCosmeticAssets";
import { COSMETIC_SLOT, readDefaultCosmetics, readPlayerCosmetics, validateCosmetic } from "../domain/cosmetics";
import { DEFAULT_CARD_BACK_ASSET, DEFAULT_HAND_ARC_ASSET } from "../lib/assets/manifests";
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

  it("ancre l'arche circulaire cosmétique en bas avec asset par défaut ou personnalisé", () => {
    const activeMarkup = renderToStaticMarkup(
      <PlayerHandArc width={380} height={139} active animated />,
    );
    const customMarkup = renderToStaticMarkup(
      <PlayerHandArc
        width={380}
        height={139}
        active
        finalTrick
        assetUrl="/assets/njambo/table/hand-arc-royal.webp"
        animated={false}
      />,
    );
    const dealingMarkup = renderToStaticMarkup(
      <PlayerHandArc width={340} height={124} active={false} dealing />,
    );
    const idleMarkup = renderToStaticMarkup(
      <PlayerHandArc width={340} height={124} active={false} />,
    );

    expect(activeMarkup).toContain('data-player-hand-arc="perfect-circle"');
    expect(activeMarkup).toContain(`src="${DEFAULT_HAND_ARC_ASSET}"`);
    expect(activeMarkup).toContain('data-state="active"');
    expect(activeMarkup).toContain('data-animated="true"');
    expect(activeMarkup).toContain('aria-hidden="true"');
    expect(activeMarkup).toContain('A 256 256');
    expect(activeMarkup).toContain('preserveAspectRatio="xMidYMax meet"');

    expect(customMarkup).toContain('src="/assets/njambo/table/hand-arc-royal.webp"');
    expect(customMarkup).toContain('data-state="ngata"');
    expect(customMarkup).toContain('data-animated="false"');
    expect(dealingMarkup).toContain('data-state="dealing"');
    expect(idleMarkup).toContain('data-state="idle"');

    // Arches réduites sur les 3 bords adverses (top, left, right)
    for (const edge of ["top", "left", "right"] as const) {
      const oppMarkup = renderToStaticMarkup(
        <PlayerHandArc edge={edge} width={190} height={69} active={edge === "left"} />,
      );
      expect(oppMarkup).toContain(`data-arc-edge="${edge}"`);
      expect(oppMarkup).toContain('data-variant="opponent"');
      expect(oppMarkup).toContain(`data-state="${edge === "left" ? "active" : "idle"}"`);
    }
  });

  it("enregistre le cosmétique hand_arc dans le domaine pour attribuer d'autres arches", () => {
    expect(COSMETIC_SLOT.hand_arc).toBe("handArc");
    const issues = validateCosmetic({
      id: "arc_chefferie_or",
      type: "hand_arc",
      name: "Arche Soleil Royal",
      imageUrl: "/assets/njambo/table/hand-arc-default.svg",
      rarity: "legendaire",
      published: true,
    });
    expect(issues).toEqual([]);

    const equipped = readPlayerCosmetics({
      handArc: {
        id: "arc_chefferie_or",
        name: "Arche Soleil Royal",
        rarity: "legendaire",
        imageUrl: "/assets/njambo/table/hand-arc-default.svg",
      },
    });
    expect(equipped.handArc?.imageUrl).toBe("/assets/njambo/table/hand-arc-default.svg");
  });

  it("applique le dos de carte 1B par défaut et lit les valeurs par défaut configurables en admin", () => {
    const hiddenCard = renderToStaticMarkup(<PlayCard hidden />);
    expect(hiddenCard).toContain("--nj-card-back");
    expect(hiddenCard).toContain(DEFAULT_CARD_BACK_ASSET);

    const parsed = readDefaultCosmetics({
      cardBack: {
        cosmeticId: "dos_royal_saison",
        name: "Dos Royal",
        imageUrl: "/uploads/cosmetic/dos-royal.webp",
      },
      handArc: {
        imageUrl: "https://cdn.njambo.example/uploads/cosmetic/arche-or.webp",
        name: "Arche Or",
      },
    });
    expect(parsed.cardBack).toEqual({
      cosmeticId: "dos_royal_saison",
      name: "Dos Royal",
      imageUrl: "/uploads/cosmetic/dos-royal.webp",
    });
    expect(parsed.handArc).toEqual({
      name: "Arche Or",
      imageUrl: "https://cdn.njambo.example/uploads/cosmetic/arche-or.webp",
    });

    // Rejette les URL invalides sans jamais planter
    expect(readDefaultCosmetics({ cardBack: { imageUrl: "javascript:alert(1)" }, handArc: null })).toEqual({});
  });

  it("fournit au moins 10 dos de cartes et 10 arches intégrés valides sur disque (lumineux + sobres)", () => {
    expect(BUILTIN_CARD_BACKS.length).toBeGreaterThanOrEqual(11);
    expect(BUILTIN_HAND_ARCS.length).toBeGreaterThanOrEqual(11);
    expect(BUILTIN_CARD_BACKS.some((a) => a.mood === "lumineux")).toBe(true);
    expect(BUILTIN_CARD_BACKS.some((a) => a.mood === "sobre")).toBe(true);
    expect(BUILTIN_HAND_ARCS.some((a) => a.mood === "lumineux")).toBe(true);
    expect(BUILTIN_HAND_ARCS.some((a) => a.mood === "sobre")).toBe(true);

    const ids = new Set<string>();
    for (const asset of BUILTIN_TABLE_COSMETICS) {
      expect(ids.has(asset.id)).toBe(false);
      ids.add(asset.id);

      const issues = validateCosmetic({
        id: asset.id,
        type: asset.type,
        name: asset.name,
        description: asset.description,
        imageUrl: asset.imageUrl,
        rarity: asset.rarity,
        published: true,
      });
      expect(issues, asset.id).toEqual([]);

      const diskPath = join(process.cwd(), "public", asset.imageUrl.replace(/^\//, ""));
      expect(existsSync(diskPath), diskPath).toBe(true);
      if (/\.(webp|png)$/.test(asset.imageUrl)) continue; // visuel raster (ex. dos « Cauri Soleil »)
      const svg = readFileSync(diskPath, "utf8");
      expect(svg).toContain("<svg");
      if (asset.type === "hand_arc") {
        expect(svg, asset.id).toContain("A 256 256");
      }
    }
  });
});

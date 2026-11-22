import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tableAssetGroups, tableManifest } from "../lib/assets/manifests";
import { MatchLoadingScreen } from "../components/ui/MatchLoadingScreen";

vi.mock("@/lib/motion", () => ({
  loadGsap: () => Promise.resolve({}),
  useMotionProfile: () => ({
    mode: "full",
    level: "full",
    enabled: true,
    reduced: false,
    allowNavigationMotion: true,
    allowDecorativeLoop: true,
    allowEntranceCascade: true,
  }),
}));

vi.mock("@/components/ui/Art", () => ({
  NjamboIcon: ({ name }: { name: string }) => <span data-icon={name} />,
  NjamboMark: ({ size }: { size?: number }) => <span data-mark={size} />,
}));

describe("MatchLoadingScreen & tableAssetGroups", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("collecte tous les décors, icônes HUD, pouvoirs équipés, cosmétiques et avatars de la table", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { documentElement: {} });
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: (name: string) => {
        if (name === "--nj-table-image") return 'url("/assets/njambo/table-desktop.webp")';
        if (name === "--nj-solar-app-bg") return 'url("/assets/njambo/friendly/backgrounds/card-table-desktop-v2.webp")';
        if (name === "--nj-card-back") return 'url("/assets/njambo/card-back.webp")';
        return "";
      },
    }));

    const groups = tableAssetGroups({
      myPowers: ["eclair_mfoundi"],
      participants: [{ avatarFrame: { imageUrl: "/frames/royal.webp" } }],
      avatars: ["https://assets.example/boss.webp"],
    });

    const decorUrls = groups.decorAndCards.map((ref) => ref.url);
    expect(decorUrls).toEqual(expect.arrayContaining([
      "/assets/njambo/table-desktop.webp",
      "/assets/njambo/card-back.webp",
      "/assets/njambo/ui/brand/njambo-mark-128.webp",
      "/assets/njambo/economy/nkap-64.webp",
      "/assets/njambo/ui/icons/cards-64.webp",
    ]));

    const powerUrls = groups.powersAndAudio.map((ref) => ref.url);
    expect(powerUrls).toEqual(expect.arrayContaining([
      "/frames/royal.webp",
      "https://assets.example/boss.webp",
    ]));

    const combined = tableManifest({ myPowers: ["eclair_mfoundi"] });
    expect(combined.critical.length).toBeGreaterThanOrEqual(decorUrls.length);
    expect(combined.background.length).toBeGreaterThan(0);
  });

  it("rend un écran de chargement cérémoniel complet au lancement d'une partie", () => {
    const markup = renderToStaticMarkup(
      <MatchLoadingScreen
        gameMode="bot"
        mise={250}
        playerCount={3}
        difficulty="hard"
        equippedPowers={["eclair_mfoundi", "bouclier_village"]}
        onReady={() => undefined}
      />,
    );

    expect(markup).toContain('data-match-loader="true"');
    expect(markup).toContain("Solo IA");
    expect(markup).toContain("Préparation de la table");
    expect(markup).toContain("3 joueurs");
    expect(markup).toContain("250");
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain("Astuce du Mboa");
    expect(markup).toContain("Décors");
    expect(markup).toContain("Pouvoirs");
  });
});

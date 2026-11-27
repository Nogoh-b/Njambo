import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  angleFromDeckToHand,
  humanHandJitter,
  naturalAimAngle,
  nearestRestAngle,
  nextClockwiseAngle,
  normalizeAngle,
  wristReachOffset,
} from "../components/table/zones/deckAim";
import { DeckZone } from "../components/table/zones/DeckZone";
import { GAME_CONFIG } from "../config/gameConfig";
import { BOTS } from "../data/mock";
import { dealDurationMs } from "../domain/gameplayConfig";
import { LocalGameSync } from "../sync/LocalGameSync";

vi.mock("@/config/devConfig", () => ({
  DEV: { unlimitedTime: false, unlimitedPowers: false, enabled: false },
}));

afterEach(() => {
  vi.useRealTimers();
});

describe("orientation naturelle de la pioche (deckAim)", () => {
  const center = { x: 200, y: 400 };

  it("calcule l'angle exact de la pioche vers chaque main autour du plateau", () => {
    expect(angleFromDeckToHand(center, { x: 200, y: 760 })).toBeCloseTo(0, 5); // bas (joueur local)
    expect(angleFromDeckToHand(center, { x: 20, y: 400 })).toBeCloseTo(90, 5); // gauche
    expect(angleFromDeckToHand(center, { x: 200, y: 40 })).toBeCloseTo(180, 5); // haut
    expect(angleFromDeckToHand(center, { x: 380, y: 400 })).toBeCloseTo(270, 5); // droite
  });

  it("oriente vers la position réelle d'une main décalée et utilise le repli si distance nulle", () => {
    const slightlyBelowLeft = angleFromDeckToHand(center, { x: 20, y: 430 });
    expect(slightlyBelowLeft).toBeGreaterThan(75);
    expect(slightlyBelowLeft).toBeLessThan(90);
    expect(angleFromDeckToHand(center, center, 270)).toBe(270);
    expect(normalizeAngle(-90)).toBe(270);
  });

  it("enchaîne les rotations dans le sens horaire à 3–4 joueurs et en va-et-vient naturel à 2 joueurs", () => {
    // 4 joueurs : balayage horaire continu
    let angle = 0;
    const fourPlayers = [0, 90, 180, 270, 0, 90].map((target) => {
      angle = nextClockwiseAngle(angle, target);
      return angle;
    });
    expect(fourPlayers).toEqual([0, 90, 180, 270, 360, 450]);

    // 3 joueurs : bas → gauche → droite → bas
    angle = 0;
    const threePlayers = [0, 90, 270, 0].map((target) => {
      angle = nextClockwiseAngle(angle, target);
      return angle;
    });
    expect(threePlayers).toEqual([0, 90, 270, 360]);

    // 2 joueurs : va-et-vient souple du poignet (0° ↔ 180°, sens alterné +1 / -1)
    let duelAngle = 0;
    const duelSteps = [0, 180, 0, 180, 0].map((target) => {
      const next = naturalAimAngle(duelAngle, target, { alternate: true });
      duelAngle = next.angle;
      return next;
    });
    expect(duelSteps).toEqual([
      { angle: 0, dir: 1 },
      { angle: 180, dir: 1 },
      { angle: 0, dir: -1 },
      { angle: 180, dir: 1 },
      { angle: 0, dir: -1 },
    ]);
  });

  it("ajoute une micro-variation organique bornée et une avancée du poignet vers la main", () => {
    for (let k = 0; k < 20; k++) {
      const j = humanHandJitter(k);
      expect(Math.abs(j)).toBeLessThanOrEqual(2.5);
    }
    expect(wristReachOffset(0, 6)).toEqual({ x: -0, y: 6 });
    expect(wristReachOffset(90, 6)).toEqual({ x: -6, y: 0 });
    expect(wristReachOffset(180, 6)).toEqual({ x: -0, y: -6 });
    expect(wristReachOffset(270, 6)).toEqual({ x: 6, y: -0 });
  });

  it("revient au repos (0°) par le chemin le plus court sans dérouler les tours accumulés", () => {
    expect(nearestRestAngle(1710, 0)).toBe(1800);
    expect(nearestRestAngle(1800, 0)).toBe(1800);
    expect(nearestRestAngle(1890, 0)).toBe(1800);
    expect(nearestRestAngle(90, 0)).toBe(0);
    expect(nearestRestAngle(270, 0)).toBe(360);
  });
});

describe("DeckZone — pioche centrée, mélange poussé (≥ 3 s) et rotation humaine", () => {
  it("centre la pioche au milieu du plateau et affiche les 14 cartes du mélange aronde + paquets", () => {
    expect(GAME_CONFIG.anim.dealShuffle).toBeGreaterThanOrEqual(3000);
    const html = renderToStaticMarkup(
      <DeckZone
        deckW={50}
        pot={500}
        ledSuit={null}
        stage="shuffling"
        shuffleDurationMs={3200}
        shufflePacketsMs={1200}
        centerTop="48%"
        motionEnabled
        premiumFxAllowed
        liteMotion={false}
      />,
    );

    expect(html).toContain('data-deck-zone="center"');
    expect(html).toContain('data-deck-stage="shuffling"');
    expect(html).toContain("top:48%");
    expect(html).toContain("--shuffle-dur:3200ms");
    expect(html.match(/nj-playcard/g)?.length).toBe(14);
  });

  it("allège le mélange en mode lite (8 cartes)", () => {
    const html = renderToStaticMarkup(
      <DeckZone
        deckW={50}
        pot={500}
        ledSuit={null}
        stage="shuffling"
        shuffleDurationMs={3200}
        motionEnabled
        premiumFxAllowed={false}
        liteMotion
      />,
    );

    expect(html).toContain('data-deck-stage="shuffling"');
    expect(html.match(/nj-playcard/g)?.length).toBe(8);
  });

  it("oriente la pioche avec avancée du poignet, roulis directionnel et glisse du pouce", () => {
    const html = renderToStaticMarkup(
      <DeckZone
        deckW={50}
        pot={500}
        ledSuit={null}
        stage="dealing"
        aimAngle={450}
        aimTransitionMs={360}
        turnDir={-1}
        wristOffset={{ x: -6, y: 0 }}
        turnSeq={2}
        launchSeq={3}
        centerTop="47%"
        motionEnabled
        premiumFxAllowed
        liteMotion={false}
        portrait
      />,
    );

    expect(html).toContain('data-deck-stage="dealing"');
    expect(html).toContain('data-deck-aim="90"');
    expect(html).toContain('data-deck-turn-ms="360"');
    expect(html).toContain("--turn-dur:360ms");
    expect(html).toContain("--turn-dir:-1");
    expect(html).toContain("translate3d(-6px, 0px, 0) rotate(450deg)");
    expect(html).toContain("top:47%");
    // 3 couches du paquet, sans carte fantôme : c'est la carte qui vole qui sort de la pioche
    expect(html.match(/nj-playcard/g)?.length).toBe(3);
  });
});

describe("rythme de mélange + rotation réglables avant la distribution (LocalGameSync)", () => {
  it("joue la fenêtre de mélange (≥ 3 s) puis les rotations + vols de cartes quand les animations sont activées", () => {
    vi.useFakeTimers();
    const cfg = structuredClone(GAME_CONFIG);
    cfg.instantWin.enabled = false;
    cfg.anim.dealShuffle = 3500;
    cfg.anim.dealRotate = 320;
    const banners: string[] = [];
    const phases: string[] = [];
    const timings: Array<{ shuffleMs?: number; rotateMs?: number }> = [];
    const sync = new LocalGameSync({
      cfg,
      profile: { name: "Toi", emoji: "you", balance: 5000, equippedPowers: [] },
      bots: BOTS,
      mise: 100,
      initialBotCount: 1,
      difficulty: "easy",
      onResult: vi.fn(),
      onBanner: (text) => banners.push(text),
      onUpdateBalance: vi.fn(),
    });
    sync.onStateUpdate((state) => {
      phases.push(state.phase);
      if (state.dealTiming) timings.push(state.dealTiming);
    });

    sync.start();
    expect(phases.at(-1)).toBe("dealing");
    expect(banners.at(-1)).toBe("Mélange des cartes…");
    expect(timings.at(-1)).toMatchObject({ shuffleMs: 3500, rotateMs: 320 });

    vi.advanceTimersByTime(3500 - 1);
    expect(banners.at(-1)).toBe("Mélange des cartes…");
    expect(phases.at(-1)).toBe("dealing");

    vi.advanceTimersByTime(1);
    expect(banners.at(-1)).toBe("Distribution…");
    expect(phases.at(-1)).toBe("dealing");

    const restMs = dealDurationMs(
      { perCardMs: cfg.anim.dealPerCard, flightMs: cfg.anim.dealFlight, shuffleMs: 0, rotateMs: 320 },
      2,
      cfg.cardsPerPlayer,
    ) + 180;
    vi.advanceTimersByTime(restMs - 1);
    expect(phases.at(-1)).toBe("dealing");
    vi.advanceTimersByTime(1);
    expect(phases.at(-1)).toBe("turns");
    sync.destroy();
  });

  it("saute mélange et rotation quand les animations sont désactivées", () => {
    vi.useFakeTimers();
    const cfg = structuredClone(GAME_CONFIG);
    cfg.instantWin.enabled = false;
    const banners: string[] = [];
    const phases: string[] = [];
    const sync = new LocalGameSync({
      cfg,
      profile: { name: "Toi", emoji: "you", balance: 5000, equippedPowers: [] },
      bots: BOTS,
      mise: 100,
      initialBotCount: 1,
      difficulty: "easy",
      onResult: vi.fn(),
      onBanner: (text) => banners.push(text),
      onUpdateBalance: vi.fn(),
    });
    sync.setMotionEnabled(false);
    sync.onStateUpdate((state) => phases.push(state.phase));

    sync.start();
    expect(banners.at(-1)).toBe("Distribution…");

    const dealOnlyMs = 2 * cfg.cardsPerPlayer * cfg.anim.dealPerCard + cfg.anim.dealFlight + 180;
    vi.advanceTimersByTime(dealOnlyMs);
    expect(phases.at(-1)).toBe("turns");
    sync.destroy();
  });
});

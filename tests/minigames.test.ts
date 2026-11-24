import { describe, expect, it } from "vitest";
import {
  CAURIS_TIERS,
  HILO_MAX_STEPS,
  HILO_MULTIPLIERS,
  HILO_RANK_MAX,
  HILO_RANK_MIN,
  MINI_GAMES,
  coinRainReward,
  dicePayout,
  freePlaysLeft,
  hiloGuessWins,
  hiloPayout,
  hiloRankFromRoll,
  memoryReward,
  playInstantGame,
  playsLeft,
  recordPlay,
  totalFreePlaysLeft,
  type MiniGameDailyState,
} from "../domain/minigames";

/** Générateur déterministe (mulberry32) pour des tirages reproductibles. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const key = (value: unknown) => JSON.stringify(value);

describe("mini-jeux : scripts cohérents avec le lot tiré", () => {
  it("ticket à gratter : exactement un symbole apparaît 3 fois, et c'est le lot", () => {
    const roll = seeded(1);
    for (let i = 0; i < 500; i++) {
      const { reward, script } = playInstantGame("scratch", roll);
      if (script.game !== "scratch") throw new Error("script");
      expect(script.cells).toHaveLength(6);
      const counts = new Map<number, number>();
      script.cells.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
      const triples = [...counts].filter(([, n]) => n >= 3);
      expect(triples).toEqual([[script.winning, 3]]);
      expect(key(script.symbols[script.winning])).toBe(key(reward));
    }
  });

  it("cauris : le lot correspond au nombre de cauris ouverts", () => {
    const roll = seeded(2);
    for (let i = 0; i < 300; i++) {
      const { reward, script } = playInstantGame("cauris", roll);
      if (script.game !== "cauris") throw new Error("script");
      const open = script.faces.filter(Boolean).length;
      const tier = CAURIS_TIERS.find((t) => t.counts.includes(open))!;
      expect(key(reward)).toBe(key(tier.reward));
    }
  });

  it("dés : somme et double payés selon le barème", () => {
    const roll = seeded(3);
    for (let i = 0; i < 300; i++) {
      const { reward, script } = playInstantGame("dice", roll);
      if (script.game !== "dice") throw new Error("script");
      const [a, b] = script.dice;
      expect(a).toBeGreaterThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(6);
      expect(reward).toEqual({ type: "nkap", amount: dicePayout(a + b) * (a === b ? 2 : 1) });
    }
  });

  it("carte / coffres : le lot est sous le choix du joueur, les autres sont différents", () => {
    const roll = seeded(4);
    for (const game of ["pick", "chests"] as const) {
      for (let choice = 0; choice < 3; choice++) {
        for (let i = 0; i < 100; i++) {
          const { reward, script } = playInstantGame(game, roll, choice);
          if (script.game !== game) throw new Error("script");
          expect(script.items).toHaveLength(3);
          expect(key(script.items[choice])).toBe(key(reward));
          script.items.forEach((item, idx) => {
            if (idx !== choice) expect(key(item)).not.toBe(key(reward));
          });
        }
      }
    }
  });
});

describe("mini-jeux : économie saine", () => {
  it("dés : en moyenne, une partie rapporte moins que ses 100 Nkap", () => {
    let total = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) total += dicePayout(a + b) * (a === b ? 2 : 1);
    expect(total / 36).toBeLessThan(100);
  });

  it("plus haut / plus bas : même un joueur parfait récupère moins que sa mise", () => {
    // Programmation dynamique exacte : meilleure stratégie (deviner + encaisser au bon moment).
    const ranks = Array.from({ length: HILO_RANK_MAX - HILO_RANK_MIN + 1 }, (_, i) => HILO_RANK_MIN + i);
    const memo = new Map<string, number>();
    const value = (k: number, v: number): number => {
      const id = `${k}:${v}`;
      if (memo.has(id)) return memo.get(id)!;
      let best = k >= 1 ? HILO_MULTIPLIERS[k] : -1;
      if (k < HILO_MAX_STEPS) {
        for (const guess of ["higher", "lower"] as const) {
          const ev = ranks.reduce((sum, w) => sum + (hiloGuessWins(v, w, guess) ? value(k + 1, w) : 0), 0) / ranks.length;
          best = Math.max(best, ev);
        }
      } else best = HILO_MULTIPLIERS[k];
      memo.set(id, best);
      return best;
    };
    const ev = ranks.reduce((sum, v) => sum + value(0, v), 0) / ranks.length;
    expect(ev).toBeLessThan(0.9);
    expect(hiloPayout(100, HILO_MAX_STEPS)).toBe(500);
  });

  it("plus haut / plus bas : cartes de 3 à 10, une égalité perd", () => {
    expect(hiloRankFromRoll(0)).toBe(3);
    expect(hiloRankFromRoll(0.9999)).toBe(10);
    expect(hiloGuessWins(5, 5, "higher")).toBe(false);
    expect(hiloGuessWins(5, 5, "lower")).toBe(false);
    expect(hiloGuessWins(5, 6, "higher")).toBe(true);
  });

  it("jeux d'adresse : gains plafonnés quoi que le téléphone envoie", () => {
    expect(memoryReward(999, 999_999)).toEqual({ type: "nkap", amount: 100 });
    expect(memoryReward(0, 0)).toEqual({ type: "nkap", amount: 10 });
    expect(coinRainReward(10_000)).toEqual({ type: "nkap", amount: 144 });
    expect(coinRainReward(-5)).toEqual({ type: "nkap", amount: 10 });
  });
});

describe("mini-jeux : parties gratuites et limites du jour", () => {
  it("compte les parties par jour et repart à zéro le lendemain", () => {
    let state: MiniGameDailyState | undefined;
    expect(freePlaysLeft(state, "memory", "2026-11-23")).toBe(3);
    state = recordPlay(state, "memory", "2026-11-23");
    state = recordPlay(state, "memory", "2026-11-23");
    expect(freePlaysLeft(state, "memory", "2026-11-23")).toBe(1);
    expect(playsLeft(state, "memory", "2026-11-23")).toBe(1);
    expect(freePlaysLeft(state, "memory", "2026-11-24")).toBe(3);
    const fresh = MINI_GAMES.reduce((sum, g) => sum + g.freePerDay, 0);
    expect(totalFreePlaysLeft(undefined, "2026-11-23")).toBe(fresh);
  });

  it("chaque jeu a un coût ou des parties gratuites, et une limite", () => {
    for (const game of MINI_GAMES) {
      expect(game.maxPerDay).toBeGreaterThanOrEqual(game.freePerDay);
      expect(game.cost.type !== "free" || game.freePerDay > 0).toBe(true);
    }
  });
});

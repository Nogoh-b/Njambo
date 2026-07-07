import type { PlayerStats } from "@/types/game";

export interface PlayerLevelProgress {
  level: number;
  xp: number;
  levelStartXp: number;
  nextLevelXp: number;
  xpToNext: number;
  progress: number;
  title: string;
}

const TITLES = [
  { min: 1, title: "Debutant" },
  { min: 4, title: "Joueur du quartier" },
  { min: 8, title: "Table chaude" },
  { min: 14, title: "Capitaine" },
  { min: 22, title: "Champion" },
  { min: 34, title: "Legende" },
];

function normalizeNumber(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

function xpForLevel(level: number) {
  const rank = Math.max(0, Math.floor(level) - 1);
  return Math.round(rank * rank * 180 + rank * 80);
}

function titleForLevel(level: number) {
  return TITLES.reduce((current, item) => (level >= item.min ? item.title : current), TITLES[0].title);
}

export function getPlayerXp(stats: Partial<PlayerStats> | undefined, balance: number) {
  const played = normalizeNumber(stats?.played);
  const won = normalizeNumber(stats?.won);
  const bestWin = normalizeNumber(stats?.bestWin);
  const balanceBonus = Math.max(0, normalizeNumber(balance) - 5000);

  return Math.floor((played * 60) + (won * 180) + (bestWin / 18) + (balanceBonus / 45));
}

export function getPlayerLevel(stats: Partial<PlayerStats> | undefined, balance: number): PlayerLevelProgress {
  const xp = getPlayerXp(stats, balance);
  let level = 1;

  while (level < 99 && xp >= xpForLevel(level + 1)) {
    level += 1;
  }

  const levelStartXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const levelSpan = Math.max(1, nextLevelXp - levelStartXp);
  const progress = Math.min(1, Math.max(0, (xp - levelStartXp) / levelSpan));

  return {
    level,
    xp,
    levelStartXp,
    nextLevelXp,
    xpToNext: Math.max(0, nextLevelXp - xp),
    progress,
    title: titleForLevel(level),
  };
}

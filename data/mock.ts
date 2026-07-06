import type { FriendEntry, LeaderEntry } from "@/types/game";

/* ═══════════════ FILE: data/mock.js ═══════════════ */
export const MOCK_LEADERBOARD: LeaderEntry[] = [
  { name: "Mado Bonamoussadi", pts: 12450, emoji: "mado-bona" },
  { name: "Nogoh", pts: 9800, emoji: "you-nogoh", you: true },
  { name: "Tonton Rene", pts: 8720, emoji: "tonton-rene" },
  { name: "Amina Akwa", pts: 7100, emoji: "amina-akwa" },
  { name: "Junior Mvog-Ada", pts: 5300, emoji: "junior-mvog" },
];

export const MOCK_FRIENDS: FriendEntry[] = [
  { name: "Amina Akwa", emoji: "amina-akwa", online: true },
  { name: "Tonton Rene", emoji: "tonton-rene", online: true },
  { name: "Mado Bonamoussadi", emoji: "mado-bona", online: false },
  { name: "Junior Mvog-Ada", emoji: "junior-mvog", online: false },
];

export const BOTS: { name: string; emoji: string }[] = [
  { name: "Tonton Rene", emoji: "tonton-rene" },
  { name: "Mado Biyem", emoji: "mado-biyem" },
  { name: "Junior Akwa", emoji: "junior-akwa" },
];

export const FCFA = (n: number): string => n.toLocaleString("fr-FR") + " F";

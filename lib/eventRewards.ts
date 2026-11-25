import type { Reward } from "@/domain";
import { sysAsset } from "@/lib/assetPack";

/* Visuels partagés des récompenses d'événement (détail + animation de
   conséquences). */

export const TICKET_ART: Record<"bronze" | "argent" | "or", string> = {
  get bronze() { return sysAsset("/assets/njambo/tickets/ticket-bronze-64.webp"); },
  get argent() { return sysAsset("/assets/njambo/tickets/ticket-argent-64.webp"); },
  get or() { return sysAsset("/assets/njambo/tickets/ticket-or-64.webp"); },
};

export function rewardVisual(reward: Reward): { src: string; label: string } {
  if (reward.type === "nkap") {
    return {
      src: sysAsset("/assets/njambo/economy/nkap-stack-64.webp"),
      label: `${reward.amount.toLocaleString("fr-FR")} Nkap`,
    };
  }
  if (reward.type === "cauris") {
    return {
      src: sysAsset("/assets/njambo/economy/cauris-pouch-64.webp"),
      label: `${reward.amount} cauris`,
    };
  }
  if (reward.type === "booster_book") {
    const bookId = ["normal", "rare", "exceptionnel"].includes(reward.boosterId)
      ? reward.boosterId
      : "normal";
    return {
      src: sysAsset(`/assets/njambo/books/book-${bookId}-128.webp`),
      label: `Livre ${reward.boosterId}`,
    };
  }
  if (reward.type === "ticket") {
    return {
      src: TICKET_ART[reward.tier] ?? TICKET_ART.bronze,
      label: `Ticket ${reward.tier}`,
    };
  }
  if (reward.type === "energy_pass") {
    return {
      src: sysAsset("/assets/njambo/economy/energy-flask-64.webp"),
      label: `Énergie ${reward.durationMinutes / 60}h`,
    };
  }
  if (reward.type === "cosmetic") {
    return {
      src: reward.imageUrl ?? sysAsset("/assets/njambo/books/card-back-128.webp"),
      label: reward.name ?? "Cosmétique exclusif",
    };
  }
  return {
    src: sysAsset("/assets/njambo/books/card-back-128.webp"),
    label: `Carte ${reward.rarity}`,
  };
}

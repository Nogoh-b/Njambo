import type { Reward } from "@/domain";

/* Visuels partagés des récompenses d'événement (détail + animation de
   conséquences). */

export const TICKET_ART: Record<"bronze" | "argent" | "or", string> = {
  bronze: "/assets/njambo/tickets/ticket-bronze-64.webp",
  argent: "/assets/njambo/tickets/ticket-argent-64.webp",
  or: "/assets/njambo/tickets/ticket-or-64.webp",
};

export function rewardVisual(reward: Reward): { src: string; label: string } {
  if (reward.type === "nkap") {
    return {
      src: "/assets/njambo/economy/nkap-stack-64.webp",
      label: `${reward.amount.toLocaleString("fr-FR")} Nkap`,
    };
  }
  if (reward.type === "cauris") {
    return {
      src: "/assets/njambo/economy/cauris-pouch-64.webp",
      label: `${reward.amount} cauris`,
    };
  }
  if (reward.type === "booster_book") {
    const bookId = ["normal", "rare", "exceptionnel"].includes(reward.boosterId)
      ? reward.boosterId
      : "normal";
    return {
      src: `/assets/njambo/books/book-${bookId}-128.webp`,
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
      src: "/assets/njambo/economy/energy-flask-64.webp",
      label: `Énergie ${reward.durationMinutes / 60}h`,
    };
  }
  return {
    src: "/assets/njambo/books/card-back-128.webp",
    label: `Carte ${reward.rarity}`,
  };
}

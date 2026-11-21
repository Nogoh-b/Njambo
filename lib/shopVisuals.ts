import {
  formatEnergyDuration,
  isStoredPackOffer,
  type BoosterDefinition,
  type OfferDefinition,
  type Reward,
  type TicketTier,
} from "@/domain";

export const BOOSTER_RARITY_LABELS: Record<string, string> = {
  village: "Village",
  notable: "Notable",
  chef: "Chef",
  ancetre: "Ancêtre",
};

export const OFFER_KIND_LABELS: Record<OfferDefinition["type"], string> = {
  cauris_pack: "Cauris",
  nkap_conversion: "Nkap",
  energy_pass: "Énergie",
  ticket: "Ticket Ter",
  element_pack: "Pack Royal",
};

export const TICKET_TIERS_META: Record<TicketTier, { label: string; shortLabel: string; description: string; art64: string; art256: string }> = {
  bronze: {
    label: "Ticket Bronze",
    shortLabel: "Bronze",
    description: "Donne accès à un événement du Ter compatible au palier Bronze (1 ticket = 1 parcours complet).",
    art64: "/assets/njambo/tickets/ticket-bronze-64.webp",
    art256: "/assets/njambo/tickets/ticket-bronze-256.webp",
  },
  argent: {
    label: "Ticket Argent",
    shortLabel: "Argent",
    description: "Donne accès à un événement du Ter compatible au palier Argent avec récompenses relevées.",
    art64: "/assets/njambo/tickets/ticket-argent-64.webp",
    art256: "/assets/njambo/tickets/ticket-argent-256.webp",
  },
  or: {
    label: "Ticket Or",
    shortLabel: "Or",
    description: "Donne accès aux grands tournois et événements prestigieux du Ter au palier Or.",
    art64: "/assets/njambo/tickets/ticket-or-64.webp",
    art256: "/assets/njambo/tickets/ticket-or-256.webp",
  },
};

export function boosterBookArt(boosterId: string, size: 64 | 128 | 256 = 256): string {
  const safeId = ["normal", "rare", "exceptionnel"].includes(boosterId) ? boosterId : "normal";
  return `/assets/njambo/books/book-${safeId}-${size}.webp`;
}

export function boosterBookTitle(boosterId: string, boosters?: BoosterDefinition[]): string {
  const found = boosters?.find((entry) => entry.id === boosterId);
  if (found) return found.title;
  if (boosterId === "exceptionnel") return "Livre Exceptionnel";
  if (boosterId === "rare") return "Livre Rare";
  if (boosterId === "normal") return "Livre Normal";
  return `Livre ${boosterId}`;
}

export function packArt(offerId: string, size: 64 | 128 | 256 = 256): string {
  if (offerId === "pack_quartier" || offerId === "pack_mboa" || offerId === "pack_chefferie") {
    return `/assets/njambo/economy/${offerId.replaceAll("_", "-")}-${size}.webp`;
  }
  return `/assets/njambo/economy/pack-mboa-${size}.webp`;
}

export function offerArt(offer: Pick<OfferDefinition, "id" | "type">, size: 64 | 128 | 256 = 256): string {
  if (offer.type === "cauris_pack") return `/assets/njambo/economy/cauris-pouch-${size}.webp`;
  if (offer.type === "nkap_conversion") return `/assets/njambo/economy/nkap-stack-${size}.webp`;
  if (offer.type === "energy_pass") return `/assets/njambo/economy/energy-flask-${size}.webp`;
  if (offer.type === "ticket") {
    const tier = offer.id.replace("ticket_", "") as TicketTier;
    const safeTier: TicketTier = tier === "argent" || tier === "or" ? tier : "bronze";
    return `/assets/njambo/tickets/ticket-${safeTier}-${size}.webp`;
  }
  if (offer.id.startsWith("booster_")) {
    const id = offer.id.replace("booster_", "").replace("_xaf", "");
    return boosterBookArt(id, size);
  }
  if (offer.id.startsWith("pack_")) {
    return packArt(offer.id, size);
  }
  return `/assets/njambo/books/card-back-${size}.webp`;
}

export function rewardLabel(reward: Reward): string {
  if (reward.type === "nkap") return `${reward.amount.toLocaleString("fr-FR")} Nkap`;
  if (reward.type === "cauris") return `${reward.amount.toLocaleString("fr-FR")} cauris`;
  if (reward.type === "ticket") {
    const tierLabel = TICKET_TIERS_META[reward.tier]?.shortLabel ?? reward.tier;
    return `${reward.amount} ticket${reward.amount > 1 ? "s" : ""} ${tierLabel}`;
  }
  if (reward.type === "energy_pass") return `Pass Énergie ${formatEnergyDuration(reward.durationMinutes)}`;
  if (reward.type === "booster_book") {
    const label = boosterBookTitle(reward.boosterId);
    return reward.amount > 1 ? `${reward.amount} × ${label}` : label;
  }
  if (reward.type === "cosmetic") return reward.name ?? "Cosmétique exclusif";
  return `Carte ${BOOSTER_RARITY_LABELS[reward.rarity] ?? reward.rarity}`;
}

export function rewardIconSrc(reward: Reward): string {
  if (reward.type === "nkap") return "/assets/njambo/economy/nkap-stack-64.webp";
  if (reward.type === "cauris") return "/assets/njambo/economy/cauris-pouch-64.webp";
  if (reward.type === "ticket") return TICKET_TIERS_META[reward.tier]?.art64 ?? TICKET_TIERS_META.bronze.art64;
  if (reward.type === "energy_pass") return "/assets/njambo/economy/energy-flask-64.webp";
  if (reward.type === "booster_book") return boosterBookArt(reward.boosterId, 128);
  if (reward.type === "cosmetic" && reward.imageUrl) return reward.imageUrl;
  return "/assets/njambo/books/card-back-128.webp";
}

export function rewardDeliveryNote(reward: Reward): string {
  if (reward.type === "nkap" || reward.type === "cauris") return "Crédité directement au portefeuille";
  if (reward.type === "ticket") return "Stocké dans Ma collection · utilisable sur un Ter compatible";
  if (reward.type === "energy_pass") return "Stocké dans Ma collection · à activer au moment voulu";
  if (reward.type === "booster_book") return "Stocké dans Ma collection · à ouvrir pour tirer 1 carte parmi 9";
  if (reward.type === "cosmetic") return "Ajouté dans Ma collection (Cosmétiques)";
  return "Ajouté à ta collection de Cartes Pouvoir";
}

export function offerDeliverySummary(offer: OfferDefinition): {
  storedInCollection: boolean;
  label: string;
} {
  if (isStoredPackOffer(offer)) {
    return {
      storedInCollection: true,
      label: "Stocké scellé dans Ma collection — clique dessus quand tu veux l’ouvrir.",
    };
  }
  if (offer.type === "energy_pass") {
    return {
      storedInCollection: true,
      label: "Stocké dans Ma collection — le chrono ne démarre que lorsque tu l’actives.",
    };
  }
  if (offer.type === "ticket") {
    return {
      storedInCollection: true,
      label: "Stocké dans Ma collection — utilisable pour entrer dans un événement du Ter.",
    };
  }
  if (offer.id.startsWith("booster_")) {
    return {
      storedInCollection: true,
      label: "Ajouté dans Ma collection — ouvre ce livre quand tu veux choisir 1 carte parmi 9.",
    };
  }
  return {
    storedInCollection: false,
    label: "Crédité immédiatement sur ton portefeuille dès validation.",
  };
}

export function priceLabel(price: OfferDefinition["prices"][number]): string {
  return `${price.amount.toLocaleString("fr-FR")} ${price.currency === "xaf" ? "XAF" : "cauris"}`;
}

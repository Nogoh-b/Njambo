export type TranslationKey = keyof typeof fr;

const fr = {
  "nav.home": "Accueil",
  "nav.play": "Jouer",
  "nav.events": "Événements",
  "nav.shop": "Boutique",
  "nav.social": "Social",
  "economy.energy": "Énergie",
  "economy.nkap": "Nkap",
  "economy.cauris": "Cauris",
  "economy.crowns": "Couronnes",
  "daily.claim": "Réclamer 100 Nkap",
  "daily.claimed": "Récompense du jour réclamée",
  "shop.title": "Boutique du Mboa",
  "shop.subtitle": "Prix, chances et garanties pilotés par le Ter",
  "shop.offers": "Offres",
  "shop.boosters": "Livres",
  "shop.dailyGrid": "Grille du jour",
  "shop.wheel": "Roulette",
  "shop.buy": "Acheter",
  "shop.choose": "Choisir",
  "shop.simulated": "Paiement simulé",
  "events.title": "Le Ter",
  "events.subtitle": "Entre dans un événement et avance table après table",
  "events.join": "Entrer",
  "events.pve": "Contre les gardiens",
  "events.pvp": "Contre les joueurs",
  "wallet.title": "Mon portefeuille",
  "wallet.history": "Journal des opérations",
  "play.title": "Choisis ta table",
  "play.guestNotice": "Le mode invité est un entraînement local : aucune ressource n’est dépensée ou gagnée.",
  "common.back": "Retour",
  "common.loading": "Chargement…",
  "common.unavailable": "Indisponible pour le moment",
  "admin.title": "Régie du Ter",
} as const;

export function t(key: TranslationKey): string {
  return fr[key];
}

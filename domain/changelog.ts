/* ═══════════════ Journal des nouveautés (scindé Admin / App) ═══════════════
   Source unique lue par la section « Nouveautés » de la Régie du Ter.
   Chaque entrée distingue clairement ce qui a été livré côté back-office
   admin (`side: "admin"`) et côté application joueur (`side: "app"`). */

export type ChangelogSide = "admin" | "app";
export type ChangelogStatus = "new" | "live" | "wip";

export type ChangelogAdminSection =
  | "dashboard"
  | "changelog"
  | "events"
  | "gameplay"
  | "seasons"
  | "cosmetics"
  | "powers"
  | "animations"
  | "assistant"
  | "notifications"
  | "players"
  | "audit"
  | "tools";

export interface ChangelogEntry {
  id: string;
  side: ChangelogSide;
  date: string;
  title: string;
  category: string;
  status: ChangelogStatus;
  summary: string;
  highlights: string[];
  adminSection?: ChangelogAdminSection;
}

export const CHANGELOG_ENTRIES: readonly ChangelogEntry[] = [
  /* ─── NOUVEAUTÉS CÔTÉ ADMIN (RÉGIE DU TER) ─── */
  {
    id: "admin-ai-assistant",
    side: "admin",
    date: "2026-11-21",
    title: "Assistant IA : animations et cartes de pouvoir",
    category: "Régie & Suivi",
    status: "new",
    summary: "Un assistant conversationnel qui explique, interroge, crée et met à jour les modèles d'animation et les cartes de pouvoir, et décrit leurs effets en jeu.",
    highlights: [
      "Choix de l'IA (DeepSeek, Claude, OpenAI, Gemini, GLM, MiMo, Meta, FreeLLM ou service compatible OpenAI), du modèle, de la réflexion et de la température ; clés côté serveur uniquement.",
      "Panneau ✦ dans les pages Animations et Cartes de pouvoir : l'assistant sait quel modèle ou quelle carte est ouvert, propose des questions toutes prêtes, lit tes modifications non enregistrées et recharge la page quand il écrit un brouillon.",
      "L'assistant lit la bibliothèque, les moments, les cartes, où un modèle sert en jeu et la référence tirée du code ; il écrit seulement des brouillons.",
      "Publier ou attribuer un moment : il le propose, l'admin confirme d'un clic. Historique des conversations par admin, avec leur page d'origine.",
    ],
    adminSection: "assistant",
  },
  {
    id: "admin-changelog-page",
    side: "admin",
    date: "2026-11-21",
    title: "Page Nouveautés scindée Admin / App",
    category: "Régie & Suivi",
    status: "new",
    summary: "Vue dédiée dans la console admin recensant toutes les évolutions réalisées côté back-office et côté application joueur.",
    highlights: [
      "Affichage scindé en deux colonnes (Côté Admin | Côté App) avec bascule de filtre et recherche instantanée.",
      "Filtres par statut (Nouveau, Livré, En cours) et compteurs synthétiques en haut de page.",
      "Liens directs vers chaque module de la Régie du Ter pour tester ou configurer immédiatement.",
    ],
    adminSection: "changelog",
  },
  {
    id: "admin-gameplay-rules",
    side: "admin",
    date: "2026-11-21",
    title: "Règles des parties pilotées en direct",
    category: "Gameplay",
    status: "new",
    summary: "Configuration temps réel des paramètres de table pour les modes IA, Amis et En ligne sans redéploiement.",
    highlights: [
      "Réglage de la durée d’un tour (5 à 120 s) et du plafond de cartes pouvoir équipables (0 à 8, 0 désactive les pouvoirs).",
      "Matrice du nombre de manches complètes par table selon le mode (IA, Amis, Online) et le nombre de joueurs (2, 3, 4).",
      "Sauvegarde idempotente côté serveur appliquée automatiquement aux nouvelles parties.",
    ],
    adminSection: "gameplay",
  },
  {
    id: "admin-animations-studio",
    side: "admin",
    date: "2026-11-21",
    title: "Atelier d’animations & moments du jeu",
    category: "Animations",
    status: "wip",
    summary: "Éditeur visuel de modèles d’animation réutilisables (trajectoires, courbes, pistes, réactions de table) versionnés et publiés.",
    highlights: [
      "Bibliothèque de 20 modèles prêts à l’emploi, édition des poignées A/B/courbure, courbes de Bézier et ligne de temps.",
      "Matrice de transitions « de → vers » et relecture sur la table de démonstration réelle.",
      "Attribution des modèles aux moments clés du jeu (donne, carte jouée, pli, pioche, défausse) avec validation serveur.",
    ],
    adminSection: "animations",
  },
  {
    id: "admin-power-cards-console",
    side: "admin",
    date: "2026-11-20",
    title: "Console complète des Cartes de Pouvoir",
    category: "Cartes Pouvoir",
    status: "live",
    summary: "Pilotage intégral du catalogue de cartes pouvoir : identité, briques d’effet, chorégraphies spatiales, sons et bac à sable.",
    highlights: [
      "Éditeur de scripts PowerScript par briques validées avec bornes de sécurité et révisions immuables.",
      "Éditeur de chorégraphies spatiales multi-pistes (repères, trajectoires, effets de zone) + upload de sons audio.",
      "Bac à sable jouable intégré, archivage sans perte pour les possesseurs et interrupteur d’urgence.",
    ],
    adminSection: "powers",
  },
  {
    id: "admin-seasons",
    side: "admin",
    date: "2026-11-20",
    title: "Gestion des Saisons & Passe Premium",
    category: "Saisons",
    status: "live",
    summary: "Création et pilotage des saisons avec paliers gratuits, paliers premium en XAF et statistiques de progression.",
    highlights: [
      "Configuration des paliers, seuils de points de saison, dates d’ouverture/clôture et récompenses par voie.",
      "Tarification du passe premium en XAF raccordée au tunnel de paiement simulé.",
      "Suivi des joueurs engagés et des paliers réclamés directement depuis l’onglet Saisons.",
    ],
    adminSection: "seasons",
  },
  {
    id: "admin-cosmetics",
    side: "admin",
    date: "2026-11-20",
    title: "Catalogue & upload des Cosmétiques",
    category: "Cosmétiques",
    status: "live",
    summary: "Administration des récompenses cosmétiques exclusives (dos de carte, cadres d’avatar, badges et titres).",
    highlights: [
      "Upload d’images optimisées en WebP stockées sur le VPS et réutilisables dans le sélecteur de récompenses.",
      "Gestion de la rareté (Commun à Légendaire) avec compensation automatique en cauris en cas de doublon.",
      "Publication instantanée vers l’inventaire et la collection des joueurs.",
    ],
    adminSection: "cosmetics",
  },
  {
    id: "admin-notifications",
    side: "admin",
    date: "2026-11-20",
    title: "Campagnes de notifications programmées",
    category: "Notifications",
    status: "live",
    summary: "Planification et suivi des alertes push liées aux événements du Ter selon l’audience ciblée.",
    highlights: [
      "Déclencheurs configurables : ouverture d’événement, rappel avant la fin ou date/heure précise.",
      "Ciblage par audience (tous les joueurs, parcours actif, non inscrits) et annulation à tout moment.",
      "Exécution automatique par tâche planifiée côté serveur avec historique d’envoi.",
    ],
    adminSection: "notifications",
  },
  {
    id: "admin-events-v2",
    side: "admin",
    date: "2026-11-20",
    title: "Éditeur d’événements du Ter v2 & aperçu mobile",
    category: "Événements",
    status: "live",
    summary: "Création, validation en direct, programmation et suivi statistique complet des tournois et défis du Ter.",
    highlights: [
      "Brouillons versionnés, publication immédiate ou programmée, duplication, archivage et upload d’illustrations WebP.",
      "Paramétrage des tables, boss, modificateurs (sans pouvoirs, mise doublée, chrono), rachat de vie, classement et défis amis.",
      "Aperçu mobile intégré en direct et entonnoir de statistiques par étape.",
    ],
    adminSection: "events",
  },
  {
    id: "admin-players-support",
    side: "admin",
    date: "2026-11-20",
    title: "Support Joueurs, Audit temps réel & Outils VPS",
    category: "Support & Audit",
    status: "live",
    summary: "Outils d’assistance opérationnelle, traçabilité des actions admin et migration de l’authentification sur Postgres.",
    highlights: [
      "Recherche de joueurs par nom, e-mail ou UID, consultation des soldes/tickets/parcours et geste commercial (crédit de tickets).",
      "Réparation ou clôture sécurisée d’un parcours d’événement bloqué (hors partie en cours), avec motif obligatoire.",
      "Journal `admin_audit` temps réel (100 dernières actions), migration des cartes, feature flags et auth maison Postgres.",
    ],
    adminSection: "players",
  },

  /* ─── NOUVEAUTÉS CÔTÉ APP (APPLICATION JOUEUR) ─── */
  {
    id: "app-collection-objects-deferred",
    side: "app",
    date: "2026-11-21",
    title: "Objets récupérés dans Ma collection & activation au clic",
    category: "Collection & Inventaire",
    status: "new",
    summary: "Tous les objets achetés ou gagnés (Packs, Livres, Pass Énergie, Tickets) sont conservés dans Ma collection et ne s’ouvrent ou ne s’activent qu’au clic.",
    highlights: [
      "Nouvel onglet « Mes objets » accessible depuis Ma collection (Profil) et l’écran Collection/Pouvoirs, avec filtres Packs, Livres, Énergie et Tickets.",
      "Packs scellés stockés sans ouverture immédiate : clic → aperçu → « Ouvrir le pack » avec révélation des lots (et conservation des livres/pass/tickets obtenus).",
      "Livres achetés en boutique stockés sans tirage forcé : ouverture au choix depuis Ma collection avec la grille 3×3 de tirage.",
      "Pass Énergie stockés sans lancement immédiat : activation à la demande au clic depuis Ma collection (+ empilement sur un pass déjà actif).",
      "Tickets Ter affichés avec les événements compatibles en direct pour entrer en un clic.",
    ],
  },
  {
    id: "app-shop-item-details",
    side: "app",
    date: "2026-11-21",
    title: "Fiche de détails au clic sur chaque élément de la Boutique",
    category: "Boutique",
    status: "new",
    summary: "Chaque carte de la boutique (offres, packs, livres, cartes révélées de la grille et lots de la roulette) ouvre une fiche détaillée complète au clic.",
    highlights: [
      "Description complète, contenu garanti avec icônes, lots aléatoires et probabilités détaillées sans quitter la boutique.",
      "Indication claire du mode de livraison (stocké dans Ma collection vs crédité au portefeuille) et du stock actuellement possédé.",
      "Bouton d’achat direct dans la fiche et raccourci « Ma collection » avec compteur d’objets en attente.",
    ],
  },
  {
    id: "app-auth-postgres-rematch",
    side: "app",
    date: "2026-11-20",
    title: "Authentification maison Postgres & Revanche rapide",
    category: "Compte & Parties",
    status: "live",
    summary: "Migration des comptes joueurs vers l’authentification Postgres et ajout du flux de revanche interactif en fin de partie.",
    highlights: [
      "Remplacement de Firebase Auth par l’authentification serveur Postgres pour les comptes permanents et les sessions.",
      "Composant `RematchView` sur l’écran de résultats permettant de proposer et valider une revanche entre joueurs.",
      "Prise en charge des séries de manches et des réglages de parties dynamiques (temps par tour, limite de pouvoirs).",
    ],
  },
  {
    id: "app-asset-loader",
    side: "app",
    date: "2026-11-20",
    title: "Chargeur d’assets prioritaire & préchargement d’approche",
    category: "Performance",
    status: "live",
    summary: "Chargement fluide des écrans riches (table, boutique, collection, événements) avec écran de chargement dédié.",
    highlights: [
      "Manifestes d’assets par écran séparant ressources critiques (bloquantes avec plafond de temps) et arrière-plan.",
      "Préchargement discret dès qu’on approche d’une table ou d’un écran riche (profil → collection, salon → boutique).",
      "Mise en cache des visuels et sons uploadés depuis le VPS pour éviter les rechargements.",
    ],
  },
  {
    id: "app-powers-choreo-sounds",
    side: "app",
    date: "2026-11-20",
    title: "Cartes Pouvoir dynamiques, chorégraphies & effets sonores",
    category: "Cartes Pouvoir",
    status: "live",
    summary: "Synchronisation temps réel du catalogue de pouvoirs avec animations spatiales sur la table et sons dédiés.",
    highlights: [
      "Lecture des chorégraphies multi-pistes et modèles d’animation directement sur la table de jeu.",
      "Effets sonores personnalisés par carte pouvoir et pistes sonores synchronisées avec les animations.",
      "Cartes archivées conservées et jouables par les joueurs qui les possèdent déjà.",
    ],
  },
  {
    id: "app-friend-challenges",
    side: "app",
    date: "2026-11-20",
    title: "Défis entre amis sur les événements",
    category: "Social & Duels",
    status: "live",
    summary: "Possibilité de défier un ami sur un événement du Ter et de comparer vos parcours pour remporter une récompense.",
    highlights: [
      "Création, acceptation et suivi des défis depuis la fiche d’événement et les écrans sociaux.",
      "Association automatique du prochain parcours d’événement aux duels acceptés.",
      "Règlement serveur et attribution automatique du lot au vainqueur.",
    ],
  },
  {
    id: "app-seasons-cosmetics",
    side: "app",
    date: "2026-11-20",
    title: "Écran Saison & Collection de Cosmétiques",
    category: "Progression",
    status: "live",
    summary: "Nouvelle progression saisonnière à paliers et personnalisation cosmétique visible sur le profil et à la table.",
    highlights: [
      "Écran Saison accessible depuis les événements avec piste gratuite, piste premium XAF et réclamation des paliers.",
      "Équipement des dos de carte, cadres d’avatar, badges et titres dans Ma collection.",
      "Affichage en direct des cosmétiques équipés sur les cartes face cachée, le profil et les classements.",
    ],
  },
  {
    id: "app-events-v2-player",
    side: "app",
    date: "2026-11-20",
    title: "Événements du Ter enrichis (classement, boss, rachat de vie)",
    category: "Événements",
    status: "live",
    summary: "Parcours d’événements plus riches avec classement en direct, modificateurs de table, boss et alertes push.",
    highlights: [
      "Comptes à rebours en direct, panneau de classement avec barème de points et distribution automatique par rang.",
      "Introduction visuelle des boss, règles spéciales de table, rachat de vie en cauris et bonus parcours parfait.",
      "Retour animé sur le parcours après chaque manche et liens profonds depuis les notifications push.",
    ],
  },
  {
    id: "app-salon-royal-ui",
    side: "app",
    date: "2026-11-19",
    title: "Refonte Salon Royal & Arène de règlement Nkap",
    category: "Interface & Design",
    status: "live",
    summary: "Nouvelle identité visuelle Salon Royal sur l’ensemble des écrans et mise en scène animée des gains en fin de manche.",
    highlights: [
      "Salon d’accueil, boutique arcade 3D, table fluide, couronnes en direct et village social harmonisés.",
      "Arène de règlement (`SettlementArena`) avec transferts visuels de Nkap et ajout d’amis depuis la table.",
      "Adaptation responsive desktop/mobile et respect des préférences de mouvement réduit.",
    ],
  },
] as const;

export function splitChangelogBySide(entries: readonly ChangelogEntry[] = CHANGELOG_ENTRIES): {
  admin: ChangelogEntry[];
  app: ChangelogEntry[];
} {
  const admin: ChangelogEntry[] = [];
  const app: ChangelogEntry[] = [];
  for (const entry of entries) {
    if (entry.side === "admin") admin.push(entry);
    else app.push(entry);
  }
  return { admin, app };
}

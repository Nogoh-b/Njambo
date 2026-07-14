# État d’implémentation Njambo

Date : 13 juillet 2026

## Livré dans le dépôt

- Domaine partagé : Nkap, cauris, énergie calculée, pass illimités, couronnes, raretés, garanties et progression du Ter.
- Catalogue initial : conversions, tickets, livres, grille quotidienne, roulette et packs d’éléments.
- Firebase Functions Gen 2 : profils/migration, portefeuille et ledger, achats idempotents, boosters, événements, paiements simulés, notifications et régie.
- Jeu authentifié autoritaire : mélange cryptographique, mains privées, validation des cartes, bots, règlement Nkap/couronnes et reconnexion.
- Tournoi PvP du Ter : file par version/étape, groupe atomique, progression individuelle, trois défaites et restitution automatique du ticket sans adversaire.
- Sécurité : règles deny-all terminales, mutations économiques serveur uniquement, App Check dans les callables, claim admin et consentement signé des joueurs d’un lobby.
- Client : navigation Accueil/Jouer/Événements/Boutique/Social, HUD, portefeuille, boutique, grille, boosters, événements et `/admin`.
- Auth : invité limité à l’IA, téléphone prioritaire, Google/email et liaison du compte invité sans changement d’UID.
- PWA : manifeste, service worker limité et préparation Web Push.

## Vérifications locales

- `npm run build` : OK.
- `npm run lint` : OK.
- `npx tsc --noEmit` : OK.
- `npm --prefix functions run build` : OK.
- `npm test` : 20 tests métier OK ; 10 tests de règles présents mais ignorés sans Emulator.

## Portes de production encore fermées

1. Installer Java 21+ puis exécuter `npm run test:rules`.
2. Authentifier Firebase CLI, confirmer l’édition de la base `(default)` et sauvegarder Firestore.
3. Finaliser le worker de timeout/forfait automatique (carte légale, deux tours manqués ou 60 secondes hors ligne).
4. Migrer et valider chaque carte pouvoir dans le moteur serveur ; elles restent volontairement désactivées en partie authentifiée jusque-là.
5. Valider la planche artistique avant de générer les masters PNG/WebP.
6. Tester les adaptateurs réels MTN/Orange/stores et Capacitor dans un chantier ultérieur ; la V1 demeure simulée.

## Ordre de déploiement obligatoire

1. Sauvegarde et inventaire de la base existante.
2. Fonctions Gen 2 et index.
3. Migration contrôlée des profils.
4. Tests Emulator complets.
5. Règles strictes.
6. Nouveau client avec feature flags activés progressivement.

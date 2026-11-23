# Mini-jeux — « Le coin des jeux »

Accès : tuile **Jeux** de l'accueil (badge = parties gratuites du jour) → écran `minigames`.

| Jeu | Type | Coût | Gratuit / jour | Limite / jour |
|---|---|---|---|---|
| Ticket à gratter | instantané | 1 ticket Bronze | 1 | 30 |
| Lancer de cauris | instantané | 3 cauris | 1 | 30 |
| Les dés du quartier | instantané | 100 Nkap | 1 | 40 |
| Plus haut ou plus bas | plusieurs étapes | mise 100 Nkap | 0 | 40 |
| Tire ta carte | instantané | 10 cauris | 0 | 20 |
| Coffres du marché | instantané | 5 cauris | 0 | 20 |
| Paires du marché | adresse | gratuit | 3 | 3 |
| Pluie de Nkap | adresse | gratuit | 1 | 1 |

La Roue des retrouvailles apparaît aussi dans la grille (elle ouvre l'onglet Roulette de la boutique).

## Où régler quoi

Tout est dans **`domain/minigames.ts`** (partagé serveur + appli) :

- `MINI_GAMES` : titre, coût, `freePerDay`, `maxPerDay` de chaque jeu ;
- `SCRATCH_REWARDS`, `PICK_REWARDS`, `CHEST_REWARDS` : tables de lots pondérées ;
- `CAURIS_TIERS`, `dicePayout`, `HILO_MULTIPLIERS` : barèmes ;
- `memoryReward`, `coinRainReward` : gains plafonnés des jeux d'adresse.

Après un changement de barème, lancer `npx vitest run tests/minigames.test.ts` : il vérifie
notamment que chaque jeu payant rapporte **en moyenne moins que son coût**
(dés ≈ 89 %, plus haut / plus bas ≤ 87 % même pour un joueur parfait).

## Sécurité

- Le **serveur tire tout** (`functions/src/minigameCommands.ts`) : coût, partie gratuite, lot.
  L'appli reçoit un « script » (symboles, dés, cauris, cartes…) qu'elle ne fait qu'animer.
- Plus haut / plus bas : la carte suivante est dérivée d'un HMAC (`NJAMBO_MINIGAME_SECRET`,
  à défaut `NJAMBO_GRID_SECRET`) ; elle n'est jamais stockée côté client.
- Jeux d'adresse : partie comptée dès le départ, durée minimale contrôlée par le serveur,
  gains plafonnés quel que soit le score envoyé.
- Chaque partie est inscrite au journal (`miniGame`), visible dans le Portefeuille.

## Tests

- `tests/minigames.test.ts` : cohérence des scripts, économie, compteurs du jour.
- `server/scripts/smoke-minigames.cjs` : 24 contrôles contre un vrai Postgres
  (`npm --prefix server run build && DATABASE_URL=… node server/scripts/smoke-minigames.cjs`,
  base **jetable**).

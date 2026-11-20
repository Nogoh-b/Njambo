# Plan — Cartes de pouvoir pilotées par l'admin & chargeur d'assets

> Document de **plan et de suivi**, mis à jour à chaque implémentation
> (cases cochées, statut, journal en bas de page).
>
> Branche : `ccr-d50eb567-ocrmnv`

## Suivi global

| Phase | Contenu | Statut |
| --- | --- | --- |
| A | Fondations : registre dynamique des cartes, validation des scripts, migration des 21 cartes | ⬜ À faire |
| B | Console admin des cartes : identité, cible, effet (briques), animation, économie, publication | ⬜ À faire |
| C | Sons des cartes : upload, bibliothèque, lecture en jeu | ⬜ À faire |
| D | Chargeur d'assets : manifeste, préchargement, écran de chargement | ⬜ À faire |
| E | Aperçu / bac à sable, sécurité en partie, tests de bout en bout | ⬜ À faire |

Légende : ⬜ à faire · 🟡 en cours · ✅ terminé · ⛔ bloqué

---

## Décisions validées

| Sujet | Décision |
| --- | --- |
| Définir l'effet d'une carte | **Éditeur de briques** : l'admin assemble les briques que le moteur connaît déjà (voir l'inventaire ci-dessous) et l'animation de chaque étape. Un effet vraiment inédit = une nouvelle brique ajoutée par un dev, puis réutilisable par l'admin. |
| Son | **Upload + bibliothèque** : fichier envoyé (≤ 500 Ko) ou son déjà envoyé, ou son de synthèse du jeu ; volume réglable, écoute dans l'admin. |
| 21 cartes actuelles | **Migrées en base et éditables**. Le code reste un filet de secours si la base est vide. |
| Chargeur | **Hybride** : préchargement discret en approche d'un écran ; écran de chargement (progression + astuces) seulement si l'indispensable n'est pas prêt, avec un délai maximum. |

### Point à confirmer
- « *Sur quelle langue ça va attaquer* » : compris comme **la cible** (soi,
  un adversaire choisi, tous les adversaires, au hasard). À corriger si tu
  pensais à autre chose (par exemple la langue des textes : voir « Langues » ci-dessous).

---

## Ce qui existe déjà (et rend le projet faisable)

Le comportement des cartes est **déjà déclaratif** (`config/powers/*.ts`) :
chaque carte = `def` (données boutique) + `script` (ciblage, conditions,
étapes `ops` + `anim`), interprété par un moteur générique
(`engine/power/`) utilisé à la fois en local et sur le serveur. Les
animations sont des **cues** génériques rejoués par chaque client
(`PowerFxOrchestrator`). Rendre les cartes éditables revient donc à :
**stocker ces mêmes données en base**, les **valider**, et **remplacer la
liste figée** du code par un registre chargé dynamiquement.

### Inventaire des briques disponibles (moteur actuel)

| Famille | Briques (`ops`) |
| --- | --- |
| Cartes | `moveCards` (prendre / donner / défausser / piocher, avec sélecteurs : plus faible, plus forte, par couleur, par valeur, haut de pioche, meilleure légale, **carte choisie par clic**), `exchangeCards`, `highlightCard` |
| Information | `revealHand` (durée) |
| Restrictions | `blockNextLegalCard`, `restrictNextPlay` |
| Temps | `timerFreeze`, `timerDelta` (± secondes) |
| Valeur | `boostNextCard` (bonus de valeur, couleur imposée) |
| Pot / économie | `potBonus`, `potMultiplier`, `refundOnLoss`, `preventDoublePenalty` |
| Défense | `grantShield` (bloque : ciblage, révélation, restriction, attaque du temps) |

| Animations (`anim`, cues) | `flyCards`, `revealOverlay`, `highlightHandCard`, `timerFx`, `deckPulse`, `potFlash`, `avatarAura` (bouclier, masque, totem, chance), `toast` + **préréglage d'effets** (`mystic`, `wind`, `frost`, `time`, `goldRain`, `shield`, `revealMist`, `lock`, `boost`) et intensité |

Ciblage : aucun, soi, **un adversaire** (choisi par le joueur ou au
hasard), **plusieurs / tous**. Conditions : pioche non vide, être en tête
du pli…

### Ce qui bloque aujourd'hui
- `PowerCardId` est une **union figée** dans `types/game.ts`, utilisée par
  ~20 fichiers (boutique, collection, table, profil, serveur…).
- Les visuels sont des fichiers du dépôt (`/assets/power-cards/*.webp`).
- Les sons sont **synthétisés** (GXE `playChime`) : il n'existe aucun lecteur
  de fichiers audio ni préchargement audio.
- Le préchargement actuel se limite à quelques chunks de scènes et une image
  (`lib/idlePreload.ts`) ; le service worker ne met pas en cache les images
  du VPS (`/uploads`, autre domaine).

---

## Phase A — Fondations

### Données
- `power_cards/{id}` : `{ def, script, sound?, published, archived?, revision, updatedAt }`
- `power_card_versions/{id}_v{rev}` : révisions publiées, **immuables**
- Index public `power_catalog/current` : `{ revision, cards: [...] }` (une
  seule lecture côté client, mis à jour à chaque publication)

### Tâches
- [ ] `PowerCardId` → `string` + type `PowerCardRecord` ; registre
      `getPowerCard(id)` / `listPowerCards()` alimenté par la base, repli sur
      `config/powers` si vide
- [ ] Adapter les ~20 fichiers qui lisent `POWER_CARDS` / `POWER_CARDS_BY_ID`
      (boutique, collection, table, profil, barres d'équipement, serveur)
- [ ] `domain/powerScript.ts` : `normalizePowerCard()` + `validatePowerCard()`
      (même principe que `validateEventVersion` : erreurs par chemin de champ),
      **bornes de sécurité** (durées, nombre de cartes déplacées, montants,
      multiplicateurs, nombre d'étapes) + tests
- [ ] Serveur : registre en mémoire rechargé à chaque publication (pas une
      lecture par coup joué) ; `usePowerCard`, `equipPowerCards`, boosters
      utilisent le registre
- [ ] **Instantané par partie** : les scripts des cartes équipées sont
      copiés dans l'état moteur du match au démarrage → modifier une carte
      n'affecte jamais une partie en cours
- [ ] Commande `seedPowerCards` : copie les 21 cartes du code en base
      (idempotente) ; outil « Outils » de l'admin
- [ ] Rareté : correspondance carte de pouvoir (commune → légendaire) ↔
      rareté des livres (village → ancêtre) documentée et centralisée

**Critère de fin** : le jeu fonctionne à l'identique avec les 21 cartes lues
en base ; base vide → repli sur le code.

---

## Phase B — Console admin des cartes

Section **Cartes de pouvoir** (liste filtrable par catégorie / rareté /
statut, dupliquer, archiver) et éditeur en onglets, avec validation en
direct comme pour les événements :

| Onglet | Contenu |
| --- | --- |
| **Identité** | Nom, description, titre et texte d'activation, catégorie (offensive, défense, score, **tactique**, perturbation, économie), **rareté**, icône et teinte, **visuel** (upload WebP) |
| **Cible** | Aucune / soi / un adversaire (choisi par le joueur ou au hasard) / plusieurs / tous ; conditions d'activation |
| **Effet** | Constructeur d'**étapes** : chaque étape = une brique choisie dans la liste + ses réglages (formulaire adapté), et éventuellement un **clic du joueur** (choisir une carte dans sa main, un dépôt, une main révélée) |
| **Animation** | Pour chaque étape : cues (vol de cartes, révélation, effet sur le minuteur, aura d'avatar, éclat du pot, message…), **préréglage d'effet** et intensité, durées |
| **Son** | Voir phase C |
| **Économie** | Prix en cauris / Nkap, présent en boutique, dans les livres (boosters), actif / test seulement |
| **Aperçu** | Voir phase E |

- [ ] Commandes admin : `listPowerCards`, `getPowerCard`, `savePowerCardDraft`,
      `publishPowerCard`, `duplicatePowerCard`, `archivePowerCard` (audit)
- [ ] Composants : `PowerScriptEditor` (étapes + briques), `AnimCueEditor`,
      `CardSelectorField`, `TargetField`, réutilisation de `ImageField`
- [ ] Rendu de la carte telle qu'elle apparaîtra (motif de catégorie, rareté, visuel)
- [ ] Archiver une carte : retirée de la boutique et des livres ; les joueurs
      qui la possèdent la gardent mais ne peuvent plus l'équiper (ou la
      gardent jouable : **à décider**)

**Critère de fin** : un admin crée une carte inédite (combinaison de
briques) sans toucher au code, et elle se joue en partie.

---

## Phase C — Sons des cartes

- [ ] Upload audio : `POST /admin/upload?kind=audio` — MP3 / OGG / M4A / WAV,
      ≤ 500 Ko, signature vérifiée, durée ≤ 5 s ; conversion en **OGG +
      MP3** et normalisation du volume si `ffmpeg` est présent sur le VPS
      (sinon fichier gardé tel quel) ; bibliothèque `admin_uploads` (kind
      `audio`)
- [ ] Champ son de la carte : fichier uploadé **ou** son de synthèse du jeu
      (préréglages GXE existants) ; volume 0-100 % ; bouton écouter
- [ ] Lecteur audio dans le runtime GXE : décodage WebAudio, cache des sons
      décodés, respect du réglage « Effets sonores », pas de lecture avant
      le premier geste (déverrouillage audio déjà géré par GXE)
- [ ] Lecture à l'activation, synchronisée avec le premier cue d'animation
- [ ] `docs/deploiement.md` : installer `ffmpeg` sur le VPS (facultatif)

**Critère de fin** : un son uploadé dans l'admin est joué chez tous les
joueurs quand la carte est activée, sans latence perceptible.

---

## Phase D — Chargeur d'assets

### Principe (hybride)
1. **Manifeste** : chaque écran déclare ses assets **indispensables**
   (bloquants) et **secondaires** (chargés après affichage).
2. **Préchargement discret** dès qu'on s'approche d'un écran (menu → choix
   du mode → table ; liste → détail d'événement ; profil → collection), une
   ressource à la fois, au repos du navigateur.
3. **Écran de chargement** (`LoadingGate`) seulement si l'indispensable
   n'est pas prêt à l'arrivée : barre de progression, astuce de jeu, fond
   aux couleurs de l'écran ; **délai maximum (≈ 6 s)** puis affichage quand
   même (les assets manquants arrivent ensuite).

### Ce qui est chargé à l'entrée de la table
Tapis et fond, dos de carte (y compris celui équipé), faces des cartes,
avatars et **cosmétiques de tous les participants** (cadres, badges),
**visuels + sons des cartes de pouvoir équipées par tous les joueurs**,
textures des effets (particules), polices.

### Tâches
- [ ] `lib/assets/AssetLoader.ts` : images (`decode()`), audio (fetch +
      décodage WebAudio), polices ; priorités, file d'attente, dédoublonnage,
      suivi de progression, nouvelle tentative, cache mémoire
- [ ] `lib/assets/manifests.ts` : manifestes par écran (table, boutique,
      collection, événements, détail d'événement, saison) ; manifeste de la
      table calculé à partir des participants et des pouvoirs équipés
- [ ] `components/ui/LoadingGate.tsx` : écran de chargement + astuces
- [ ] Intégration : entrée à la table (avant la donne), boutique,
      collection de pouvoirs, liste des événements
- [ ] Préchargement d'approche branché sur la navigation (`scenePreload`)
- [ ] Service worker : mise en cache des images et sons du VPS (`/uploads`,
      noms immuables) en plus de ceux du front
- [ ] Mesures : temps d'attente réel, taux d'affichage de l'écran de
      chargement (`performanceMetrics`)

**Critère de fin** : en 3G lente, la table s'ouvre avec tous ses visuels et
sons prêts (ou au pire après l'écran de chargement), sans image qui
apparaît en retard pendant la donne.

---

## Phase E — Aperçu, sécurité, tests

- [ ] **Bac à sable** dans l'admin : une mini-table locale (moteur local +
      bots) où l'on active la carte en cours d'édition, avec son animation et
      son son ; rejouer
- [ ] Interrupteur d'urgence : désactiver une carte instantanément
      (refusée à l'activation, retirée de la boutique)
- [ ] Tests du domaine : validation, bornes, normalisation, migration des 21
      cartes (scripts identiques)
- [ ] Test d'intégration Postgres : carte créée en admin → achetée →
      équipée → activée en vraie partie ; modification pendant une partie
      (instantané respecté) ; carte archivée
- [ ] Vérification visuelle (Playwright) de l'éditeur et du chargeur

---

## Langues

Les textes des cartes (nom, description, activation) sont aujourd'hui en
français. Si besoin, l'éditeur peut porter une version par langue
(français, anglais, duala) — **non prévu** dans ce plan, à décider.

---

## Journal

| Date | Phase | Changement |
| --- | --- | --- |
| 2026-11-20 | — | Plan créé ; décisions : éditeur de briques, son upload + bibliothèque, 21 cartes migrées et éditables, chargeur hybride. |

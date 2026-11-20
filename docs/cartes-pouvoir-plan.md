# Plan — Cartes de pouvoir pilotées par l'admin & chargeur d'assets

> Document de **plan et de suivi**, mis à jour à chaque implémentation
> (cases cochées, statut, journal en bas de page).
>
> Branche : `ccr-d50eb567-ocrmnv`

## Suivi global

| Phase | Contenu | Statut |
| --- | --- | --- |
| A | Fondations : registre dynamique des cartes, validation des scripts, migration des 21 cartes | ✅ Terminé |
| B | Console admin des cartes : identité, cible, effet (briques), économie, publication | ⬜ À faire |
| C | **Chorégraphies spatiales** : repères, trajectoires de cartes, animations propres à chaque élément, ligne de temps | ⬜ À faire |
| D | Sons des cartes : upload, bibliothèque, lecture en jeu (pistes de la ligne de temps) | ⬜ À faire |
| E | Chargeur d'assets : manifeste, préchargement, écran de chargement | ⬜ À faire |
| F | Bac à sable (aperçu jouable), sécurité en partie, tests de bout en bout | ⬜ À faire |

Légende : ⬜ à faire · 🟡 en cours · ✅ terminé · ⛔ bloqué

---

## Décisions validées

| Sujet | Décision |
| --- | --- |
| Définir l'effet d'une carte | **Éditeur de briques** : l'admin assemble les briques que le moteur connaît déjà (voir l'inventaire ci-dessous) et l'animation de chaque étape. Un effet vraiment inédit = une nouvelle brique ajoutée par un dev, puis réutilisable par l'admin. |
| Son | **Upload + bibliothèque** : fichier envoyé (≤ 500 Ko) ou son déjà envoyé, ou son de synthèse du jeu ; volume réglable, écoute dans l'admin. |
| 21 cartes actuelles | **Migrées en base et éditables**. Le code reste un filet de secours si la base est vide. |
| Chargeur | **Hybride** : préchargement discret en approche d'un écran ; écran de chargement (progression + astuces) seulement si l'indispensable n'est pas prêt, avec un délai maximum. |

| Cible | « Sur quelle langue ça va attaquer » = **la cible** (confirmé). |
| Animations | Aller au-delà des cues prédéfinis : **repères de déplacement** (main, centre de l'écran, dépôt, pioche, minuteur, pot…), **trajectoires** de cartes, et une **animation propre à chaque élément** (carte, main, dépôt, pioche, minuteur…), le tout sur une **ligne de temps** (phase C). |
| Carte archivée *(décidé)* | Retirée de la boutique et des livres ; les joueurs qui la possèdent la **gardent et peuvent encore la jouer** (rien de payé n'est perdu). L'**interrupteur d'urgence** (phase F) est distinct : il bloque l'activation pour tous. |
| Langues *(décidé)* | Textes en français pour l'instant ; le modèle prévoit un champ `translations` facultatif (anglais, duala) pour plus tard, non édité dans ce plan. |

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
- [x] `PowerCardId` → `string` + type `PowerCardRecord` ; registre
      `getPowerCard(id)` / `listPowerCards()` alimenté par la base, repli sur
      `config/powers` si vide
- [x] Adapter les ~20 fichiers qui lisent `POWER_CARDS` / `POWER_CARDS_BY_ID`
      (boutique, collection, table, profil, barres d'équipement, serveur)
- [x] `domain/powerScript.ts` : `normalizePowerCard()` + `validatePowerCard()`
      (même principe que `validateEventVersion` : erreurs par chemin de champ),
      **bornes de sécurité** (durées, nombre de cartes déplacées, montants,
      multiplicateurs, nombre d'étapes) + tests
- [x] Serveur : registre en mémoire rechargé à chaque publication (pas une
      lecture par coup joué) ; `usePowerCard`, `equipPowerCards`, boosters
      utilisent le registre
- [x] **Instantané par partie** : les scripts des cartes équipées sont
      copiés dans l'état moteur du match au démarrage → modifier une carte
      n'affecte jamais une partie en cours
- [x] Commande `seedPowerCards` : copie les 21 cartes du code en base
      (idempotente) ; outil « Outils » de l'admin
- [x] Rareté : correspondance carte de pouvoir (commune → légendaire) ↔
      rareté des livres (village → ancêtre) documentée et centralisée

**Critère de fin** : le jeu fonctionne à l'identique avec les 21 cartes lues
en base ; base vide → repli sur le code.

### Implémenté

| Élément | Où | Détail |
| --- | --- | --- |
| Identifiant libre | `types/game.ts` | `PowerCardId = string` ; `PowerCardDef` gagne `boosterTier`, `inShop`, `inBoosters`, `archived`, `disabled`, `translations` (facultatifs) |
| Registre dynamique | `config/powers/registry.ts` | Démarre avec les cartes du code (`CODE_POWER_MODULES`), remplacé par `setPowerCatalog(cartes, révision)` ; `getPowerModule`, `listPowerModules`, `powerScriptOf`, `powerRequiresTarget`, `boosterTierOf`, `isInBoosters`, abonnement aux changements. Catalogue vide → repli sur le code |
| Vue boutique | `config/powerCards.ts` | `POWER_CARDS` (proposées : ni test hors dev, ni archivées) et `POWER_CARDS_BY_ID` (toutes, archivées comprises) **mis à jour en place** : les ~20 fichiers existants n'ont pas changé |
| Validation | `engine/power/validate.ts` (+ `tests/power-card-validation.test.ts`) | Fiche (textes, catégorie, rareté, visuel, prix…) et script (ciblage, conditions, briques, sélecteurs, choix, animations) ; **bornes** : 6 étapes, 8 briques et 10 animations par étape, durées ≤ 15 s, minuteur ± 30 s, multiplicateur de pot ≤ 5, bonus ≤ 100 000, 3 cibles… ; un « choix » référencé doit avoir été demandé. Les 21 cartes du code passent |
| Données | `power_cards/{id}`, `power_card_versions/{id}_v{rev}`, `power_catalog/current` | Catalogue publié complet en un document (`revision`, `cards`) lisible par tous ; fiches et versions réservées aux admins (`authz.ts`, `firestore.rules`) |
| Serveur | `functions/src/powerCatalog.ts` | `ensurePowerCatalogFresh()` : relit la révision au plus toutes les 30 s ; appelée par `startMatch`, `usePowerCard`, `equipPowerCards`, livres, grille du jour |
| Partie figée | `matchCommands.ts`, `powerCommands.ts` | `startMatch` copie les scripts des cartes équipées dans l'état moteur (`powerScripts`) ; `usePowerCard` les utilise en priorité |
| Interrupteur d'urgence | `usePowerCard` | `def.disabled` → `POWER_CARD_DISABLED` |
| Livres | `economyCommands.ts` | L'ancienne table en dur est remplacée par `boosterCardPool(palier)` calculé depuis le catalogue ; les 21 cartes gardent **exactement** leurs paliers (Cauris Chanceux et Sceau d'Entrave restent hors livres) |
| Commandes admin | `functions/src/powerCardAdminCommands.ts` | `seedPowerCards` (idempotente, n'écrase rien), `listAdminPowerCards`, `setPowerCardStatus { archived, disabled }`, `rebuildPowerCatalog` |
| Client | `hooks/usePowerCatalog.ts`, `NjamboApp.tsx` | Écoute `power_catalog/current`, ignore les cartes invalides, re-rendu à chaque publication |
| Admin | Outils | Bouton « Migrer les cartes de pouvoir en base » |

**Limite connue** : l'*animation* d'une activation lit la carte dans le
catalogue courant du client. Si l'admin modifie l'animation d'une carte
pendant une partie, les joueurs voient la nouvelle animation, mais l'*effet*
reste celui du lancement. Cela sera traité par les chorégraphies (phase C).

Test `server/scripts/smoke-power-catalog.cjs` (Postgres jetable) — 18/18 :
repli sur le code, migration réservée aux admins et idempotente, catalogue
publié, registre serveur alimenté, 4 paliers de livres identiques à
l'ancienne table, scripts figés dans la partie malgré une modification,
archivage (hors livres, toujours équipable), interrupteur d'urgence,
refus d'une carte inconnue. Les 8 autres suites passent toujours
(20, 11, 13, 15, 16, 10, 14, 15).

**Pour la mise en production** : après déploiement, cliquer une fois sur
« Migrer les cartes de pouvoir en base » (Admin → Outils).

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
| **Animation** | Chorégraphie de chaque étape (phase C) : ligne de temps, repères, trajectoires, animations des éléments ; en phase B, édition des cues existants en attendant |
| **Son** | Voir phase C |
| **Économie** | Prix en cauris / Nkap, présent en boutique, dans les livres (boosters), actif / test seulement |
| **Aperçu** | Voir phase E |

- [ ] Commandes admin : `listPowerCards`, `getPowerCard`, `savePowerCardDraft`,
      `publishPowerCard`, `duplicatePowerCard`, `archivePowerCard` (audit)
- [ ] Composants : `PowerScriptEditor` (étapes + briques), `AnimCueEditor`,
      `CardSelectorField`, `TargetField`, réutilisation de `ImageField`
- [ ] Rendu de la carte telle qu'elle apparaîtra (motif de catégorie, rareté, visuel)
- [ ] Archiver une carte : retirée de la boutique et des livres ; les joueurs
      qui la possèdent la gardent et peuvent encore la jouer

**Critère de fin** : un admin crée une carte inédite (combinaison de
briques) sans toucher au code, et elle se joue en partie.

---

## Phase C — Chorégraphies spatiales

### Idée
Aujourd'hui une étape de carte joue des **cues** figés (« vol de cartes »,
« révélation »…). On ajoute, à côté, une **chorégraphie** : une ligne de
temps de **pistes** qui disent *quoi bouge, d'où, par où, vers où, quand,
et comment chaque élément réagit*. Les cues existants deviennent des
**modèles** de chorégraphie (rien n'est perdu, les 21 cartes continuent de
marcher).

### Repères (points d'ancrage)
Calculés à chaque lecture à partir des zones déjà enregistrées par la table
(`components/table/zones/ZoneRegistry.tsx`), donc justes sur mobile comme
sur ordinateur, en portrait comme en paysage :

| Repère | Exemples |
| --- | --- |
| Zones de joueur | `main:lanceur`, `main:cible`, `main:tous`, `dépôt:lanceur`, `dépôt:cible`, `minuteur:cible`, `avatar:lanceur` |
| Zones communes | `pioche`, `pot`, `révélation`, `centre de l'écran`, `centre de la table` |
| Bords | `hors-écran haut / bas / gauche / droite` |
| Précision | carte précise (« la carte choisie », « la plus forte »…), **décalage** (x, y en % de la zone), au-dessus / au-dessous |

### Pistes de la ligne de temps
| Piste | Réglages |
| --- | --- |
| **Trajectoire de carte** | Quelles cartes (celles calculées par le moteur : données, prises, choisies, piochées…), **points de passage** successifs (repère + décalage + pause), durée, courbe (linéaire, douce, rebond, élastique), arc, rotation, échelle, **retournement** (face visible / cachée / au milieu du trajet), traînée d'effet |
| **Animation d'élément** | Élément ciblé (une **carte**, une **main**, un **dépôt**, la **pioche**, le **minuteur**, un **avatar**, le **pot**, l'écran) + effet de sa bibliothèque propre (ci-dessous), départ, durée, intensité, couleur |
| **Effet d'écran** | Flash, tremblement, assombrissement, particules (préréglages existants : mystique, vent, givre, temps, pluie d'or…) |
| **Texte** | Message flottant ancré sur un repère (« VISION ! », « −3 s ») |
| **Son** | Son (phase D) déclenché à un instant donné |

Les pistes ont un **départ** et une **durée** (en ms) : elles peuvent
s'enchaîner ou se superposer. Une piste peut dépendre de la précédente
(« au moment où la carte arrive »).

### Bibliothèque d'animations propres à chaque élément
| Élément | Animations |
| --- | --- |
| Carte | soulever, pulser, briller, trembler, se retourner, se fendre, se dissoudre, s'enflammer, geler, rétrécir / grandir |
| Main | s'ouvrir en éventail, se resserrer, trembler, briller, se voiler (cachée), s'illuminer carte par carte |
| Dépôt | pulser, aspirer (les cartes rentrent), éjecter, s'illuminer, se verrouiller (sceau) |
| Pioche (distribution) | pulser, se mélanger, cracher une carte, trembler, briller |
| Minuteur | geler, accélérer (tourne vite), reculer, se fissurer, clignoter, changer de couleur, afficher ± secondes |
| Avatar | aura (bouclier, masque, totem, chance), secousse, halo de couleur, rebond |
| Pot | éclat, pluie de pièces, grossir, afficher un montant |

Chaque zone de la table expose une fonction générique
`play(effet, réglages)` en plus de ses fonctions actuelles ; un effet
inconnu d'une ancienne version du jeu est simplement ignoré.

### Tâches
- [ ] `engine/power/choreography.ts` : types (`Choreography`, pistes,
      repères, points de passage, effets par élément) + validation et bornes
      (durée totale ≤ 6 s, nombre de pistes, points de passage) + tests
- [ ] Conversion des cues existants en chorégraphies-modèles (les 21 cartes
      gardent exactement leur rendu)
- [ ] `ZoneRegistry` : résolution des repères (rect + décalage) ;
      `play(effet)` sur chaque zone (main, dépôt, pioche, minuteur/avatar,
      pot, révélation) et sur les cartes en vol
- [ ] Lecteur de chorégraphie (GSAP déjà chargé) : trajectoires à points
      de passage, courbes, retournement, synchronisation entre pistes ;
      repli instantané si « Animations » est désactivé dans les Options ou
      en mode performance
- [ ] Admin, onglet **Animation** : éditeur de **ligne de temps** (pistes
      en barres déplaçables), formulaire de chaque piste, choix des repères
      sur un **schéma de la table** cliquable, modèles de départ, bouton
      « Rejouer » dans l'aperçu
- [ ] Le moteur reste l'autorité : la chorégraphie ne fait qu'**animer** les
      cartes réellement déplacées par les briques (`resolved:*`) ; une
      trajectoire ne peut pas inventer un déplacement de carte

**Critère de fin** : un admin construit une animation où, par exemple, la
carte quitte la main de la cible, monte au centre de l'écran en se
retournant, s'y fend en deux, pendant que le minuteur de la cible gèle et
que la pioche tremble — sans écrire de code.

---

## Phase D — Sons des cartes

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
- [ ] Lecture à l'activation, ou à un instant précis via une **piste son** de la chorégraphie (phase C)
- [ ] `docs/deploiement.md` : installer `ffmpeg` sur le VPS (facultatif)

**Critère de fin** : un son uploadé dans l'admin est joué chez tous les
joueurs quand la carte est activée, sans latence perceptible.

---

## Phase E — Chargeur d'assets

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

## Phase F — Aperçu, sécurité, tests

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

---

## Journal

| Date | Phase | Changement |
| --- | --- | --- |
| 2026-11-20 | — | Plan créé ; décisions : éditeur de briques, son upload + bibliothèque, 21 cartes migrées et éditables, chargeur hybride. |
| 2026-11-20 | A | Registre dynamique, validation avec bornes (6 tests), migration idempotente des 21 cartes, catalogue publié, scripts figés par partie, archivage / interrupteur d'urgence, livres calculés depuis le catalogue ; intégration 18/18 et aucune régression. |
| 2026-11-20 | — | Ajout de la phase C « Chorégraphies spatiales » (repères, trajectoires, animations propres à chaque élément, ligne de temps) ; cible confirmée ; décisions : carte archivée toujours jouable par ses possesseurs, textes en français avec traductions prévues plus tard. |

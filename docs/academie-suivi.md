# Plan et suivi — Académie Njambo (prise en main)

> Fichier de **plan et de suivi**, mis à jour à **chaque avancée** : case
> cochée, statut de l'étape et une ligne dans le journal en bas de page.
>
> Point de départ : l'analyse « 3 profils, 3 cercles, 4 mécanismes » du
> 2026-11-27, relue contre le code. Les écarts trouvés sont listés plus bas
> et corrigés à l'étape A0.

## État

| Étape | Contenu | Statut |
| --- | --- | --- |
| A0 | Corriger les textes de règles qui contredisent le moteur | ✅ Terminé |
| A1 | Moteur de scènes : donne imposée, bots scriptés, sans chrono ni mise | ✅ Terminé |
| A2 | Coach : bulle, projecteur, refus doux, file « animation → parole → action » | ✅ Terminé |
| A3 | Chapitres 1 à 3 : les bases du Njambo | ✅ Terminé |
| A4 | Partie de fin d'Académie (vraie donne, bots faciles, aides) | ⬜ À faire |
| A5 | Porte d'entrée au premier lancement | ⬜ À faire |
| A6 | Hub Académie (remplace « Comment jouer ») + Mémo express | ⬜ À faire |
| A7 | Mesures + premier test avec de vrais novices | ⬜ À faire |
| A8 | Chapitre 4 : les 4 gestes des cartes Pouvoir | ⬜ À faire |
| A9 | Récompenses côté serveur | ⬜ À faire |
| A10 | Dojo des Pouvoirs (« Essayer sur la table ») | ⬜ À faire |
| A11 | Bulles « juste à temps » (table et hors table) | ⬜ À faire |
| A12 | Coach en direct : aide en temps réel pendant les vraies parties | ⬜ À faire |
| A13 | Parcours guidé hors table : équiper sa première carte Pouvoir | ⬜ À faire |

Légende : ⬜ à faire · 🟡 en cours · ✅ terminé · ⛔ bloqué

Ordre voulu : les bases (A0 → A4) sont testées par de vrais novices (A7)
**avant** de construire les pouvoirs, les récompenses et le Dojo. Le coach
en direct (A12) se construit juste après A4 : la partie de fin d'Académie
est sa première utilisation, et il sert ensuite dans toutes les parties.
Le parcours guidé du premier équipement (A13) vient après A8 et A9 : il
part de la carte offerte à la fin du chapitre 4.

**Deux formes d'aide, un seul calque de coach (A2) :**

| | Scènes de l'Académie (A3, A8) | Coach en direct (A4, A12) |
| --- | --- | --- |
| Partie | Situation figée, mains imposées | Vraie partie, vraie donne |
| Rythme | Le joueur attend le coach | Le coach suit le jeu, sans jamais le bloquer |
| But | Enseigner une notion | Rappeler la bonne notion au bon moment, puis s'effacer |

Le même calque sert aussi **hors de la table**, pour un seul parcours guidé
clic par clic : équiper sa première carte Pouvoir (A13).

---

## Objectifs mesurables

Cibles de départ, à ajuster après le premier test (A7).

| Mesure | Cible |
| --- | --- |
| Temps entre le choix d'entrée et la première carte posée | < 15 s |
| Premier pli gagné | < 60 s |
| Chapitres 1 à 3 | ≤ 3 min au total |
| Novices qui finissent les chapitres 1 à 3 | ≥ 70 % |
| Novices qui gagnent au moins un pli dans la partie de fin d'Académie | ≥ 80 % |
| Novices qui expliquent, sans aide, pourquoi les 4 premiers plis comptent | ≥ 4 sur 5 au test |

⚠️ La donne animée prend à elle seule **12,4 s à 3 joueurs** et 14,5 s à 4
avec les réglages par défaut (`dealDurationMs`, `domain/gameplayConfig.ts` :
mélange 5,7 s + 110 ms par carte + 320 ms de rotation entre deux cartes +
vol). Les scènes commencent donc **avec les mains déjà servies** (ou une
donne courte), sinon la cible des 15 s est impossible.

---

## Les 4 profils de joueurs

| Profil | Ce qu'il sait | Porte d'entrée | Parcours |
| --- | --- | --- | --- |
| Débutant complet | Rien | « Je découvre Njambo » | Chapitres 1 → 3, partie de fin, puis chapitre 4 |
| Habitué du Njambo papier | Règles de base, pas les pouvoirs ni l'économie | « Je connais le Njambo » | Chapitre 4 directement ; les chapitres 1 à 3 restent dans le hub |
| Joueur actif avec un doute ponctuel | Tout sauf une carte | Fiche de la carte → Dojo (A10), bouton `?` de la table | Une scène de 1 pli |
| Invité par un ami (lien de salle) | Variable | **Aucune** : il entre dans la salle | Mémo de 30 s dans la salle d'attente, bulles juste à temps |

Le 4e profil ne doit jamais être bloqué par l'accueil : une arrivée avec une
salle à restaurer (`restoredRoomId`, `contexts/GameContext.tsx`) saute la
porte d'entrée.

---

## Règles strictes

1. **Animation terminée → parole du coach → action du joueur.** Jamais de
   bulle pendant qu'une carte vole, qu'un pouvoir est mis en scène ou que la
   donne tourne.
2. **Bulle courte** : 2 lignes au plus, 15 à 25 mots. Elle se place dans la
   zone libre, jamais sur la carte à toucher ni sur le dépôt à regarder.
3. **Le pourquoi avant le quoi.** Chaque consigne vient avec sa raison en
   une phrase.
4. **Jamais punitif, jamais bloquant.** Une mauvaise carte tremble et le
   coach dit pourquoi ; un défi raté se rejoue en un geste.
5. **Toujours « Passer », toujours rejouable.**
6. **Aucun chiffre en dur.** Tout ce qui est réglable est lu dans la config
   de la partie (`cfg`) : secondes par tour, nombre de cartes équipables,
   coûts d'Énergie, victoires instantanées.
7. **Les scènes ne coûtent rien** : ni Énergie, ni mise, ni appel serveur.
   Seule la réclamation d'une récompense passe par le serveur (A9).
8. **Textes externalisés** dès le départ (une clé par réplique), en
   français d'abord ; l'anglais pourra suivre sans toucher au code.

---

## Ce qui existe déjà et sera réutilisé

| Élément | Où | Rôle dans l'Académie |
| --- | --- | --- |
| Guide en 5 cartes | `components/scenes/RulesScreen.tsx` | Devient le **Mémo express** du hub (A6), après corrections (A0) |
| Aide rapide de la table | `TableScreen.tsx:594`, clé `njambo:onboarding-seen:v1` | À fusionner avec le registre des bulles vues (A11), pas à dupliquer |
| Aperçu d'une carte Pouvoir sur la table | `previewPowerCard`, `TableScreen.tsx` | Étiquette cliquable quand un adversaire joue un pouvoir inconnu (A11) |
| Partie locale (invités) | `sync/LocalGameSync.ts`, choisie par `isLocalSync` (`TableScreen.tsx:521`) | Modèle du moteur de scènes (A1). Aujourd'hui la donne est toujours aléatoire (`shuffle(buildDeck(cfg))`) |
| Règles pures | `engine/rules.ts` (`legalCards`, `trickWinner`, `lastCardDoubles`, `checkInstantWin`) | Mêmes règles dans les scènes que dans le jeu |
| Bots faciles sans pouvoirs | `LocalGameSync.ts:223` | Partie de fin d'Académie (A4) |
| Coup automatique à la fin du chrono | `LocalGameSync.ts:724` (joue la carte légale la plus faible) | À expliquer la première fois que ça arrive (A11) |
| Tours sans limite contre l'IA | `unlimitedTurnsBot`, `domain/gameplayConfig.ts:20` | Même idée pour les scènes et la partie de fin |
| Bac à sable des pouvoirs | `engine/power/sandbox.ts` (`createSandboxTable`, `runSandboxActivation`, graine, noms « Tonton Rene », « Mado Biyem », « Ya Pauline ») | Base du Dojo (A10) et des scènes de pouvoirs (A8) |
| Choix de cible, choix de cartes | `components/power/PowerTargetPicker.tsx`, `PowerChoiceBar.tsx` | Gestes 2 et 3 du chapitre 4 |
| Registre des zones de la table | `components/table/zones/ZoneRegistry.tsx` (`hand:n`, `deposit:n`, `deck`, `pot`) | Position des cibles du projecteur et placement de la bulle (A2) |
| Récompense quotidienne | `claimDailyReward`, `functions/src/index.ts:137` | Modèle de la commande de récompense (A9) |
| Invité → compte en gardant l'identifiant | `contexts/AuthContext.tsx:30` | Les récompenses d'un invité suivent son compte (A9) |
| Familles côté joueur | `PowerCollectionScreen.tsx:62` : Attaque, Défense, Tactique, Bluff, Score, Nkap | Vocabulaire du chapitre 4 |
| Équiper une carte | `PowerCollectionScreen.tsx` : fiche de la carte et bouton « Équiper dans mon deck » (`toggleEquip`), emplacements du deck, glisser-déposer | Parcours guidé A13, sans nouvelle logique d'équipement (invité en local, compte via `equipPowerCards`) |
| Cartes équipées sur l'écran Jouer | `PlayArenaScreen.tsx` : éventail `powerHandDock`, qui ouvre la Collection | Dernière étape du parcours A13 |

### Ce que l'admin peut changer (et ce qu'il ne peut pas)

| Réglable dans l'admin (`runtime_config/gameplay`) | Fixé dans le code (`config/gameConfig.ts`) |
| --- | --- |
| `turnSeconds`, `maxEquippedPowers` (0 à 8), rythme de la donne, `unlimitedTurnsBot`, manches par mode (`matchesByMode`), coûts d'Énergie (`matchEnergyCosts`), cartes Pouvoir (désactivées, archivées, ajoutées) | Paquet 3 à 10, 5 cartes par joueur, `instantWin` (dont `flushDoubles: false`), `lastCardThreeDoubles` |

Conséquence : les scènes et les textes lisent `cfg` pour la colonne de
gauche. Pour la colonne de droite, un test vérifie que les textes restent
d'accord avec le code.

---

## Écarts entre les textes et le moteur (étape A0)

| Écart | Où | Correction |
| --- | --- | --- |
| La Couleur est affichée « doublée (×2) » alors que le moteur ne la double pas (`flushDoubles: false`) | `RulesScreen.tsx:157` et mémo de la table (`TableScreen.tsx`, « Victoires instantanées & Pouvoirs ») / `engine/rules.ts:19` | Les deux écrans lisent `getInstantWinRules(cfg)` ; D6 tranchée : pas de ×2 |
| « Équipe jusqu'à 3 cartes Pouvoir » écrit en dur | `RulesScreen.tsx:174` | Lire `cfg.maxEquippedPowers` ; masquer le paragraphe si 0 |
| Un pouvoir sert **une fois par partie**, pas une fois par manche : les pouvoirs utilisés sont gardés d'une manche à l'autre d'une série | `LocalGameSync.ts:239` et `:617` ; serveur : `usedPowers` « consommées dans ce match » | Écrire « une fois par partie » |
| « Garde un 3 pour le 5e tour » pousse le novice vers un pari perdant : le 3 ne gagne que si **tu lances** et que **personne ne peut suivre** | `RulesScreen.tsx:132` | Nuancer l'astuce |
| Le ×2 du 3 ne s'applique pas en Événement (barème propre) | `functions/src/matchCommands.ts:722` | Ne jamais promettre le ×2 « partout » ; bulle au premier Événement (A11) |
| Énergie « 5 en Solo IA, 10 en Classé » : ce sont les valeurs de repli du serveur, l'admin peut les changer | `matchCommands.ts:137` et `:410` | Lire le coût affiché par l'écran de lancement, jamais un chiffre écrit |

---

## Décisions

| # | Sujet | Recommandation | Statut |
| --- | --- | --- | --- |
| D1 | Premier lancement | Écran à **2 gros boutons** : « Je découvre Njambo » (droit sur la table) et « Je connais le Njambo » (chapitre 4), plus un lien discret « Passer ». Sauté si on arrive par un lien de salle. Tant que le chapitre 4 n'existe pas, le 2e bouton mène au hub | ✅ Validé le 2026-11-27 |
| D2 | Cartes Pouvoir | Chapitre 4 (les 4 gestes) d'abord, Dojo ensuite, **générique** : la situation est déduite du script de la carte | ✅ Validé le 2026-11-27 |
| D3 | Hors table | La table et les pouvoirs d'abord ; les bulles du Salon, de la Boutique et des Événements en dernier (A11) | ✅ Validé le 2026-11-27 |
| D4 | Guide | **Tonton René**, hors de la table (avatar + bulle). **Mado Biyem** et **Ya Pauline** sont les adversaires. Ton chaleureux, direct, jamais scolaire ; quelques expressions du Mboa, sans caricature ; textes relus par un locuteur | ✅ Validé le 2026-11-27 |
| D5 | Récompenses | Oui, modestes, données par le serveur une seule fois par compte. La carte offerte au chapitre 4 est une **commune** : Éclair du Mfoundi et Bouclier du Village sont **épiques** | ✅ Validé le 2026-11-27 ; montants à fixer en A9 (valeurs de départ proposées) |
| D6 | Couleur (5 cartes de même couleur) | Gagne immédiatement **sans doubler** : on garde `flushDoubles: false`, les textes suivent | ✅ Tranché le 2026-11-27 |
| D7 | Éclair du Mfoundi posé sur un 3 | Un 3 boosté gagne le pli avec sa valeur effective (`effectiveValue`, `rules.ts:40`) mais **ne double plus** : le ×2 ne vaut que pour un vrai 3. Règle unique `lastCardDoubles` (`engine/rules.ts`), lue par le jeu local et par le serveur (`matchCommands.ts`) ; un 3 dont seule la couleur change (Pagne Changeant) garde le ×2 | ✅ Tranché le 2026-11-27 (plus de ×2) |
| D8 | Partie de fin d'Académie | Gratuite pour tous (ni Énergie ni mise), jouée en local, même pour un compte connecté | ✅ Validé le 2026-11-27 |
| D9 | Branchement des scènes sur la table | Un moteur de partie dédié qui suit la même interface que `LocalGameSync` (la table l'affiche sans changement), plutôt qu'une option de plus dans `LocalGameSync` | ✅ Confirmé en A1 le 2026-11-27 : `AcademyGameSync` ; `TableScreen` aura seulement une entrée pour le recevoir (A3) |
| D10 | Coach en direct contre d'autres joueurs (En ligne, Amis, Classé) | **Règles seulement** (tendance, défausse, chrono, pouvoir subi), jamais de conseil de coup ni d'aide-mémoire des cartes tombées : ce serait un avantage sur l'adversaire | ✅ Validé le 2026-11-27 |
| D11 | Le coach choisit-il la carte à ta place ? | Seulement dans la partie de fin d'Académie et en Solo IA niveau « Accompagné », après 5 s d'hésitation. Ailleurs il explique la situation sans désigner la carte, pour garder sa valeur à **Main du Griot**, la carte Pouvoir qui le fait (« Suggère ta meilleure carte légale ») | ✅ Validé le 2026-11-27 |
| D12 | Niveau par défaut et retrait | « Accompagné » pour un nouveau joueur, « Conseils » après 5 parties gagnées (proposé, pas imposé), et chaque conseil se retire tout seul quand le joueur l'applique sans aide 3 fois de suite | ✅ Validé le 2026-11-27 |

---

## A0 — Corriger les textes de règles ✅

- [x] Source unique `getInstantWinRules(cfg)` (`lib/gamePresentation.ts`) :
      victoires à la donne et doublement, lus dans les règles du jeu
- [x] Couleur sans ×2 (D6) dans les deux écrans qui l'affichaient : guide
      « Comment jouer » (`RulesScreen.tsx`) **et** mémo de la table
      (`TableScreen.tsx`, qui disait aussi « 5 cartes de même couleur
      (×2) »). Seuils 21 et nombre de cartes lus dans `cfg`
- [x] « Jusqu'à {maxEquippedPowers} carte(s) Pouvoir », paragraphe masqué
      si 0
- [x] « Chacune ne sert qu'une fois par partie »
- [x] Astuce du 3 : « gagne le 4e tour avec une grosse carte pour lancer le
      dernier. Ton 3 ne gagne que si personne ne peut suivre sa couleur :
      c'est un pari ! »
- [x] Assistant IA de l'admin (`server/src/ai/reference.ts:59` et `:62`) :
      déjà d'accord avec le moteur, rien à changer
- [x] Test (`tests/game-presentation.test.ts`) : pour chaque victoire
      annoncée, une main qui la déclenche passe dans `checkInstantWin` et
      le moteur double exactement quand l'écran dit ×2 (Couleur doublée ou
      non) ; Couleur retirée et victoires coupées suivies
- [x] Vérifications : `tsc` sans erreur, `eslint` sans avertissement,
      suite complète au vert (454 tests passés, 11 ignorés) ; guide vérifié
      dans le navigateur, cartes 3 à 5, sans défilement à 375 × 812
- [ ] Mémo de la table pas vu à l'écran : il faut une partie, et le
      serveur local (:8081) ne répondait pas pendant la vérification

Piège trouvé au navigateur : le compilateur a supprimé l'espace après un
`</b>` quand le texte suivant, sur plusieurs lignes, contenait `&apos;`
(« Pouvoiravant », « 3ne »). Corrigé par un `{" "}` explicite ; aucun autre
cas du même motif dans `components/`.

## A1 — Moteur de scènes ✅

Une scène = une situation figée, rejouable à l'identique.

- [x] Type pur `AcademyScene` (`engine/academy/types.ts`, sans DOM ni
      réseau) :
  - joueurs (2 à 4), **donne complète** de la manche et **plis déjà
    joués** (dans l'ordre de pose) : les dépôts, le numéro du pli et le
    meneur s'en déduisent, et l'historique est rejoué avec les vraies
    règles (couleur suivie, vainqueur qui relance) ;
  - dessus de pioche imposé (`deckTop`), le reste du paquet suit ;
  - coups des bots : une carte précise ou une règle (`lowest`, `highest`,
    `smart` = gagne au plus juste, sinon la plus petite) ;
  - coups du joueur : carte imposée (**strict**), coup **libre** avec sa
    solution (défi), ou geste de pouvoir (bonne carte, bonne cible, bons
    choix) ;
  - répliques du coach (clés) : avant le coup, après, indice, erreurs par
    carte (`wrong`), ouverture et fin ;
  - pouvoirs équipés par siège ; but `winTrick`, `winRound` ou `watch`
    (rejeu à regarder).
- [x] Validation (`engine/academy/validate.ts`) : cartes uniques et du
      paquet, mains complètes, aucune victoire à la donne, pouvoirs équipés
      et dans la limite `maxEquippedPowers`, répliques existantes ; puis la
      scène est **jouée par le moteur** avec sa solution : coups dans
      l'ordre de la table, coups des bots légaux, carte imposée non
      remplacée par un pouvoir, solution gagnante, défi = dernier pli avec
      un vrai choix et au moins un piège
- [x] Moteur de partie Académie (D9) : `engine/academy/table.ts`, pur et
      synchrone, mêmes règles (`engine/rules.ts`) et même chemin de pouvoir
      que `LocalGameSync` (ciblage → validation → bouclier/masque →
      interprétation → application) ; **ni chrono, ni mise, ni Énergie, ni
      serveur**. Adaptateur `sync/AcademyGameSync.ts` (interface
      `GameSyncActions`) : rythme du jeu (réflexion des bots, atterrissage,
      pause de fin de pli, mise en scène des pouvoirs des bots) et
      événements pour le coach (`awaitYou`, `refused`, `coach`, `trickEnd`,
      `end`)
- [x] Rejouer une scène = repartir de son état figé (`nextRound()`)
- [x] Repli (`engine/academy/powers.ts`) : carte désactivée ou archivée →
      carte du même geste, **sans tirage au hasard**, qui fait encore gagner
      la scène (vérifié en la rejouant), sinon la scène est masquée (`null`)
- [x] Tests : 8 scènes (chapitres 1 à 4 et « Et si ? ») validées, gagnées
      avec leur solution, et mises en échec par une mauvaise carte
      (`tests/academy-scenes.test.ts`) ; erreurs d'écriture relevées
      (`tests/academy-validation.test.ts`) ; rythme, refus, pouvoir et
      rejeu de l'adaptateur (`tests/academy-sync.test.ts`)

D9 confirmée en lisant le code : la table (`TableScreen`) ne connaît que
l'interface `GameSyncActions`, et sait déjà démarrer en pleine manche
(reconnexion). Il lui faudra seulement une entrée pour recevoir
l'`AcademyGameSync` d'une scène au lieu de créer `LocalGameSync` (A3).
Les répliques en ligne : `refus.*` génériques quand la scène n'en prévoit
pas. Pas de `onRoundEnd` : une scène ne règle aucune mise.

Relevé au passage, sans effet aujourd'hui : dans `LocalGameSync.playCard`,
une restriction « verrou » (Sceau d'Entrave) sur le joueur serait traitée
comme une carte imposée (`resolveForcedPlay`). Aucun bot n'a cette carte,
donc le cas n'arrive pas ; l'Académie passe par `resolvePlay`.

## A2 — Coach ✅

- [x] Calque `components/academy/CoachLayer.tsx` : avatar de Tonton René,
      bulle, projecteur (voile sombre percé sur une ou plusieurs zones, avec
      un contour doré qui respire), bouton « Passer »
- [x] Calque monté une seule fois dans `NjamboApp`, pas dans `TableScreen` :
      il vise ses zones par des repères DOM (`data-academy-anchor` sur la
      main, les dépôts et les avatars, `data-academy-card` sur chaque carte
      du joueur, `data-power-slot` déjà présent sur les cartes Pouvoir), qu'il
      mesure à chaque image ; il servira tel quel hors table (A13)
- [x] File d'attente (`lib/academy/coachDirector.ts`) : la scène se met en
      **pause** pendant une réplique (`AcademyGameSync.hold`), qui se lit en
      2,6 à 6,5 s ou se passe avec « Suivant » ; les répliques liées à un
      coup arrivent quand la carte est posée ou la mise en scène du pouvoir
      jouée ; le coup du joueur n'est ouvert qu'après la dernière réplique,
      et un coup tenté pendant une réplique est ignoré
- [x] Placement de la bulle (`lib/academy/placement.ts`) : jamais sur la
      cible **ni sur la main** du joueur, toujours dans l'écran, sous
      l'en-tête de la table ; au-dessus ou au-dessous de la cible d'abord
- [x] Mode strict : toutes les cartes légales restent touchables, mais une
      autre carte que l'attendue **tremble** et le coach dit pourquoi
      (réplique de la scène, sinon refus générique `refus.*`) ; le voile est
      seulement visuel, c'est la scène qui refuse
- [x] Mode libre : toute la main est éclairée, indice au bout de 5 s ; défi
      raté → « Réessayer ce pli », réussite → « Rejouer » ou « Continuer »
- [x] Textes : valeurs de la partie insérées (`lib/academy/texts.ts` :
      `{turnSeconds}`, `{sumBelow}`, `{lastTrick}`, `{firstTricks}`…) ;
      le « 4 premiers plis / 5e » du chapitre 3 n'est plus écrit en dur.
      Reste la relecture du ton (brouillons)
- [x] Vérifié au navigateur, téléphone (375 × 812) et grand écran (556 ×
      630) : chapitre 1 de bout en bout (refus du 9♥, défausse de Mado,
      fin), chapitre 2 (indice, défi raté, « Réessayer ce pli »), « Passer »
- [x] Entrée d'essai en attendant le hub (A6) : lien `/?academie=<scène>`
      (`ch1-follow`, `ch2-lead`, `ch3-last-trick`, `ch3-what-if`,
      `ch4-…`), table ouverte sans écran de chargement ni mise ; `TableScreen`
      reçoit la scène par la prop `academyScene`

À reprendre en A8 : le voile est au-dessus de la table (z-index 420) ; les
fenêtres des pouvoirs (aperçu, choix de cible, choix de cartes) doivent
rester lisibles et touchables pendant le geste attendu.

## A3 — Chapitres 1 à 3 : les bases ✅

- [x] Parcours `BASICS_COURSE` (`data/academy/course.ts`) : chapitre 1 →
      chapitre 2 → chapitre 3 → « Et si ? » → défi ; « Continuer » mène à
      l'étape suivante **sur la même table** (pas de rechargement : la fin
      du chapitre 1 est exactement le début du chapitre 2), puis au menu
- [x] Titre de chapitre au centre (« Chapitre 1 — Suis la tendance »…),
      2,2 s ou un toucher, scène en pause pendant ce temps
- [x] « Et si ? » juste après le chapitre 3 (rejeu automatique)
- [x] Défi de fin du chapitre 3 : plis 3 à 5 **joués librement** avec
      10♦ 6♥ 3♣ contre des bots « smart » (nouvelle fin de manche libre du
      moteur, `scene.open`). Deux situations tirées au sort, trouvées par
      recherche puis figées, chacune avec sa suite gagnante et ses pièges
      (la validation joue les 6 ordres possibles) :
  - **le 3 passe** (au 2e pli, personne n'a suivi le Trèfle) : 6♥, 10♦ pour
    reprendre la main, puis 3♣ doublé ; commencer par le 10♦ perd ;
  - **le 3 ne passe pas** (Mado a suivi le Trèfle) : 6♥, 3♣, puis 10♦ au
    dernier pli ; garder le 3 pour la fin perd.
  Indice propre à chaque situation après 5 s ; raté → « Réessayer ce pli »
  (même situation)
- [x] Lien d'essai `/?academie=bases` (parcours entier)
- [x] Vérifié au navigateur (375 × 812) : parcours entier, titres,
      enchaînement sans coupure, « tu lanceras le 5e » calculé depuis la
      config, rejeu « Et si ? », défi joué jusqu'au bout avec l'indice, puis
      retour au menu

Au chapitre 3, les dépôts contiennent bien les 3 plis de l'historique ; la
ligne de résumé dit l'essentiel. La progression n'est pas encore gardée :
elle viendra avec le hub (A6) et les récompenses (A9).

Trois joueurs, dans cet ordre de jeu : toi, Mado Biyem, Ya Pauline. Les
mains sont servies dès le départ. Les répliques ci-dessous sont des
brouillons (ton à faire relire).

Les chapitres 1 et 2 forment une seule manche de 3 plis, avec ces mains :

| Joueur | Main |
| --- | --- |
| Toi | 9♥ 5♥ 4♥ 7♦ 6♣ (aucun Pique) |
| Mado Biyem | 8♠ 7♠ 10♦ 3♦ 9♣ (aucun Cœur) |
| Ya Pauline | 10♠ 5♠ 6♥ 3♥ 8♣ |

### Chapitre 1 — Suis la tendance (2 plis, mode strict)

| Pli | Table | Ce que tu fais | Coach |
| --- | --- | --- | --- |
| 1 | Mado lance 8♠, Ya joue 10♠ | Tu n'as pas de Pique : tu te défausses du **4♥** | « Mado lance du Pique ♠ : c'est la tendance. Tu n'en as pas, tu te défausses. » puis « Une défausse ne gagne jamais. Jette ta plus petite carte, garde les fortes. » |
| 1 (erreur) | — | Tu touches le 9♥ | « Doucement ! Ton 9♥ est précieux, et une défausse ne gagne pas. Jette plutôt ton 4♥. » |
| 2 | Ya a gagné, elle lance 6♥ | Tes cartes légales sont éclairées (9♥, 5♥) ; tu joues le **9♥** | « Tu as du Cœur ♥ : tu dois en jouer. La plus forte carte de la tendance gagne. » |
| 2 (erreur) | — | Tu touches le 5♥ | « Le 6♥ de Ya est plus fort. Ton 9♥, lui, gagne. » |
| 2 (suite) | Mado n'a pas de Cœur : elle se défausse du 3♦ | — | « Regarde : Mado se défausse. Elle n'a plus de Cœur, retiens-le ! » |
| Fin | Tu gagnes le pli | — | « Le pli est à toi ! Et qui gagne lance le pli suivant. » |

### Chapitre 2 — Prends la main (1 pli, mode libre)

Suite directe : tu lances le pli 3 avec 5♥ 7♦ 6♣.

| Ce que tu lances | Ce qui se passe | Résultat |
| --- | --- | --- |
| **5♥** | Mado n'a pas de Cœur, elle se défausse ; Ya doit suivre avec son 3♥ | Tu gagnes |
| 7♦ | Mado joue son 10♦ | Tu perds → « Réessayer ce pli » |
| 6♣ | Mado joue son 9♣ | Tu perds → « Réessayer ce pli » |

- Coach : « C'est toi qui lances : tu choisis la tendance. Choisis une
  couleur où elles sont faibles. »
- Si tu hésites plus de 5 s : « Mado n'a plus de Cœur. Lance ton 5♥ ! »
- Réussite : « Tu vois ? Même un 5 gagne quand c'est toi qui choisis la
  couleur. »

### Chapitre 3 — Le 5e tour et le 3 (2 plis + un « et si ? »)

Nouvelle manche, déjà au pli 4. Ta main : 10♦ 3♣. Une ligne résume les plis
1 à 3 : « Au 2e pli, Mado et Ya n'ont pas suivi le Trèfle : elles n'en ont
plus. » (Les dépôts de la table ne montrent peut-être pas tout
l'historique : à vérifier en écrivant la scène.)

| Moment | Table | Ce que tu fais | Coach |
| --- | --- | --- | --- |
| Pli 4 | Mado lance 8♦, Ya joue 9♦ | Tu joues le **10♦** | « Les 4 premiers plis ne paient rien : ils servent à prendre la main pour le dernier. » puis « Gagne ce pli : tu lanceras le 5e. » |
| Pli 5 | Tu lances | Tu lances le **3♣** | « Ton 3 est la plus petite carte du jeu… mais elles n'ont plus de Trèfle. Lance-le ! » |
| Fin | Mado et Ya se défaussent, ton 3♣ gagne | — | « Ngata avec un 3 ! Chaque perdant paie une mise de plus : tes gains sont doublés. » |
| Et si ? | Rejeu automatique de 8 s : Mado garde un 5♣ et bat ton 3 | Tu regardes | « Le 3 est un pari. Tente-le seulement quand personne ne peut suivre ta couleur. » |

Défi de fin de chapitre (mode libre) : pli 3 à 5 avec 10♦ 6♥ 3♣, mains
adverses tirées dans une petite liste de situations où une solution existe.
Raté → « Réessayer ce pli ».

### Victoires instantanées : pas de scène

Le joueur n'agit pas : on l'explique **quand ça arrive** (A11), sur l'écran
de résultat, avec la somme animée carte par carte
(« 3 + 4 + 4 + 5 + 5 = 21 → doublé ! »). Le Mémo express garde la fiche.

## A4 — Partie de fin d'Académie ⬜

C'est le passage le plus risqué : beaucoup de novices décrochent à leur
première vraie partie. C'est aussi la **première partie avec le coach en
direct** (A12), au niveau « Accompagné ».

- [ ] Vraie donne aléatoire, 3 joueurs, bots **faciles** (sans pouvoirs)
- [ ] Gratuite (D8) : ni Énergie ni mise
- [ ] Pas de chrono (comme `unlimitedTurnsBot`), ou un chrono large annoncé
- [ ] Aide si tu hésites plus de 5 s : la meilleure carte légale s'éclaire,
      comme le fait la carte Main du Griot
- [ ] Le coach ne parle qu'aux moments clés : 4e pli (« prends la main »),
      5e pli, victoire instantanée éventuelle
- [ ] À la fin : explication courte de ce qui change en vraie partie
      (« En vraie partie, tu as {turnSeconds} s par tour. Si le temps
      finit, ta plus petite carte part toute seule. »)

## A5 — Porte d'entrée ⬜

- [ ] Premier lancement détecté (aucune progression d'Académie locale ni
      sur le compte)
- [ ] Écran à 2 gros boutons + lien « Passer » (D1)
- [ ] « Je découvre » : chapitre 1 directement, sans écran de plus
- [ ] Arrivée par un lien de salle : écran sauté
- [ ] « Passer » ne revient jamais ; le hub reste accessible depuis le Salon
      et depuis le bouton `?` de la table

## A6 — Hub Académie ⬜

`RulesScreen.tsx` devient l'Académie :

- [ ] Chapitres avec statut (À faire / Validé), récompense, bouton Jouer /
      Rejouer
- [ ] Mémo express : les 5 fiches actuelles, corrigées en A0
- [ ] Accès au Dojo (grisé « bientôt » tant que A10 n'est pas fait)
- [ ] Progression stockée en local (`njambo:academy:v1`) et sur le compte
      quand le joueur est connecté

## A7 — Mesures et premier test ⬜

Le code n'a aujourd'hui aucun suivi d'usage : il faut le minimum.

- [ ] Événements : choix d'entrée, début et fin de chaque scène, mauvaise
      carte, « Réessayer », « Passer » (avec l'étape), récompense
      réclamée, résultat de la partie de fin, résultat de la première vraie
      partie, retour le lendemain
- [ ] Stockage : à décider (serveur Postgres ou Firebase) ; aucune donnée
      personnelle, seulement l'identifiant du joueur
- [ ] Test avec **5 personnes qui n'ont jamais joué au Njambo** et 3
      habitués : sans aide, on observe et on note chaque hésitation
- [ ] Critère de passage aux étapes suivantes : les objectifs mesurables
      sont atteints, ou les scènes sont corrigées et retestées

## A8 — Chapitre 4 : les 4 gestes des pouvoirs ⬜

On n'enseigne pas les 21 cartes : on enseigne **4 gestes**, et le joueur
saura jouer les 21. Chaque geste = une scène de 1 pli où le pouvoir sauve
une situation concrète.

| Geste | Cartes concernées | Scène |
| --- | --- | --- |
| 1. Effet direct (1 toucher) | Éclair du Mfoundi, Tambour d'Appel, Vent du Nord, Marché de Nuit, Main du Griot, Cri du Chef, Pagne Changeant | Mado lance 9♥, tu n'as que 8♥ : « Tu vas perdre… sauf avec l'Éclair du Mfoundi (+2). » Ton 8♥ compte 10 |
| 2. Pouvoir ciblé (toucher, puis choisir l'adversaire) | Coupe-Circuit, Filet du Pêcheur, Œil du Sorcier, Sable du Temps, Sceau d'Entrave | Ya a 10♠ et 4♠, toi 9♠ : Coupe-Circuit sur Ya, elle doit jouer son 4♠ |
| 3. Choix de cartes (choisir 1 à 3 cartes, valider) | Troc Ciblé, Pacte des Mains | Un 4♦ inutile ; Troc Ciblé l'échange contre le dessus de la pioche (imposé : 10♥) |
| 4. Défense et bon moment | Bouclier du Village, Masque du Bluffeur, Totem des Ancêtres, Cauris Chanceux, Feu de Camp, Pluie d'Étoiles, Bénédiction du Chef | Tu poses le Bouclier, Mado lance Coupe-Circuit sur toi : le Bouclier l'arrête |

Les 4 scènes sont écrites et testées depuis A1 (`CH4_DIRECT`,
`CH4_TARGETED`, `CH4_CHOICE`, `CH4_DEFENSE`). Le geste 4 tient sur **2
plis** : un pouvoir ne s'active qu'à son propre tour, donc tu lèves le
Bouclier à ton tour du pli 1, et Mado attaque en lançant le pli 2.

- [ ] Les 4 scènes, avec les mêmes écrans de choix que le jeu
      (`PowerTargetPicker`, `PowerChoiceBar`)
- [ ] Les deux règles qui surprennent :
  - [ ] **condition non remplie** : carte grisée avec sa raison (ex. Cri du
        Chef : « seulement si tu lances le pli ») ;
  - [ ] **carte gardée si elle n'a aucun effet, perdue si un Bouclier
        l'arrête** : à vérifier dans le moteur avant d'écrire la réplique.
- [ ] Composer un deck : « 1 Attaque + 1 Défense + 1 Tactique ou Score »,
      dans la limite de `cfg.maxEquippedPowers`
- [ ] Chapitre masqué si `maxEquippedPowers === 0`
- [ ] Fin : carte offerte (D5) puis « Viens l'équiper » → parcours guidé
      A13
- [ ] Si le joueur pose l'Éclair sur un 3 (Dojo) : réplique « il gagne
      comme un 5, mais ne double plus » (D7)

## A9 — Récompenses côté serveur ⬜

- [ ] Commande `claimAcademyReward({ chapterId })` sur le modèle de
      `claimDailyReward` : une seule fois par compte et par chapitre
      (écriture au journal avec un identifiant stable)
- [ ] Montants dans la config de l'économie (réglables dans l'admin).
      Valeurs de départ proposées, à valider :

| Chapitre | Récompense proposée |
| --- | --- |
| 1, 2, 3 | 100 Nkap chacun (une mise minimale) + badge de progression |
| Partie de fin | 20 Cauris |
| 4 | 1 carte commune (ex. Tambour d'Appel ou Vent du Nord) |

- [ ] Invité : crédité sur son identifiant anonyme, qui est gardé quand il
      crée son compte. Levier d'inscription : « Crée ton compte pour ne pas
      perdre ta progression » (un invité qui change d'appareil perd tout)
- [ ] Abus : un compte invité ne coûte rien à créer → montants modestes,
      rien d'échangeable

## A10 — Dojo des Pouvoirs ⬜

- [ ] Bouton « Essayer sur la table » sur chaque fiche (Collection, Boutique)
- [ ] Situation de 1 pli **générée à partir du script** de la carte (cible,
      conditions comme `isTrickLeader` ou `deckNotEmpty`) avec le bac à sable
      (`createSandboxTable`, `runSandboxActivation`), pour que les cartes
      ajoutées depuis l'admin aient leur essai sans écrire de scène
- [ ] Par geste : une cible prête (geste 2), une attaque du bot juste après
      (geste 4, défense), un pli qui termine la manche (cartes de fin de
      manche)
- [ ] Scène écrite à la main seulement en option, pour une carte qui le
      mérite
- [ ] Après l'essai : « Rejouer », « Équiper » ou « Acheter »

## A11 — Bulles « juste à temps » ⬜

Une seule fois chacune, sans voile sombre, toujours refermables.

- [ ] Registre des bulles vues (local + compte), qui reprend
      `njambo:onboarding-seen:v1`
- [ ] Table : première victoire instantanée (somme animée), premier coup
      joué par le chrono, premier ×2 subi, premier pouvoir adverse inconnu
      (étiquette → aperçu de la carte), première manche d'une série
- [ ] Hors table : première Boutique (Livres et offres), premier Événement
      (vies, étapes, pas de ×2 du 3), première Collection (équiper),
      Énergie à zéro
- [ ] Bouton `?` de la table : Mémo, et Dojo après la partie

## A12 — Coach en direct ⬜

Pendant une vraie partie, le coach regarde ce qui se passe **à chaque
tour** et dit en une phrase ce qui compte maintenant. Il ne fige jamais la
table et ne demande jamais de toucher la bulle.

### Ce qu'il dit, et quand

| Moment de la partie | Exemple de bulle | Accompagné | Conseils | En ligne (D10) |
| --- | --- | --- | --- | --- |
| C'est à toi, tu dois suivre | « Tendance ♥ : tu dois jouer du Cœur. » | ✅ | — | ✅ (premières fois) |
| Tu ne peux pas gagner le pli | « Tu ne peux pas gagner ce pli : joue ta plus petite carte. » | ✅ | ✅ | — |
| Tu peux gagner le pli | « Ton 9♥ bat la table pour l'instant. » | ✅ | — | — |
| Tu lances | « Tu lances : tu choisis la tendance. » | ✅ | — | ✅ (premières fois) |
| Pli 4 | « Pli 4 : gagne-le pour lancer le dernier. » | ✅ | ✅ | — |
| Pli 5 avec un 3, tu lances | « Personne n'a suivi le ♣ au pli 2 : ton 3♣ peut tenter le ×2. » | ✅ | ✅ | — |
| Fin d'un pli | « Ya gagne : son 10♠ est le plus fort de la tendance. » | ✅ | — | — |
| Pouvoir subi | « Coupe-Circuit de Mado : tu dois jouer ta plus petite carte. » | ✅ | ✅ | ✅ |
| Chrono bas (5 s) | « Plus que 5 s, sinon ta plus petite carte part seule. » | ✅ | ✅ | ✅ (premières fois) |
| Hésitation de 5 s (D11) | La carte conseillée s'éclaire, comme avec Main du Griot | ✅ (Solo IA) | — | — |

### Règles du coach en direct

- [ ] **Seulement ce que le joueur voit** : sa main, les cartes posées, les
      défausses tombées, le chrono. Jamais la main d'un adversaire, même en
      Solo IA où la partie locale la connaît. Le moteur du coach reçoit une
      « vue du joueur » construite sans ces mains : il ne peut pas tricher
      par erreur.
- [ ] **Une bulle par tour au plus**, posée seulement quand la table est au
      repos (file d'attente de A2), et qui disparaît seule.
- [ ] **Bulles plus courtes en ligne** (10 mots au plus) : le chrono ne
      s'arrête pas.
- [ ] **Solo IA, niveau « Accompagné »** : chrono allongé ou sans limite
      (comme `unlimitedTurnsBot`).
- [ ] **Le coach s'efface** : chaque conseil a un compteur ; appliqué sans
      aide 3 fois de suite, il ne revient plus (D12).
- [ ] Réglage à 3 niveaux (Accompagné, Conseils, Désactivé) dans les
      Options **et** dans le bouton `?` de la table, changeable en pleine
      partie.

### Technique

- [ ] Moteur pur `engine/academy/liveCoach.ts` : (vue du joueur avant, vue
      après, compteurs) → une bulle ou rien, avec sa priorité. Testé conseil
      par conseil.
- [ ] Les situations se calculent avec les règles du jeu (`legalCards`,
      `trickWinner`). La carte conseillée (D11) vient de `botChooseCard`
      (`engine/bot.ts`, niveau « hard » : mémoire des cartes tombées et
      cartes maîtresses), en lui passant seulement les cartes visibles.
- [ ] Affichage avec le calque de A2 ; carte conseillée avec le même effet
      que Main du Griot (`highlightHandCard`, style `recommend`).
- [ ] Branché sur l'état de la table (`TableScreen.tsx`), pour les parties
      locales **et** serveur : il ne touche pas à la synchro en ligne.
- [ ] Mesures (A7) : conseil affiché, conseil suivi ou non, niveau choisi.

## A13 — Parcours guidé : équiper sa première carte ⬜

Le seul geste hors table indispensable : une carte gagnée mais pas équipée
ne vient jamais à table. Le parcours part de la fin du chapitre 4 et guide
le joueur clic par clic, avec le calque de A2 (voile percé, bulle,
« Passer »), sur les vrais écrans du jeu.

| Écran | Zone éclairée | Ce que tu fais | Coach (brouillon) |
| --- | --- | --- | --- |
| Fin du chapitre 4 | La carte offerte et le bouton « Viens l'équiper » | Tu touches « Viens l'équiper » | « Cette carte est à toi. Mais une carte rangée ne sert à rien : il faut l'équiper. » |
| Collection | La carte offerte dans le classeur, amenée à l'écran par un défilement automatique | Tu la touches | « La voici. Touche-la pour lire ce qu'elle fait. » |
| Fiche de la carte | Le bouton « Équiper dans mon deck » | Tu le touches | « Seules les cartes de ton deck viennent à table. Équipe-la ! » |
| Collection, deck | Les emplacements du deck, où la carte vient de se ranger | Tu touches « Suivant » | « Ton deck tient {maxEquippedPowers} cartes. Tu peux aussi glisser une carte sur un emplacement. » |
| Jouer (Solo IA) | L'éventail des cartes équipées | Tu touches « Compris » | « Ta carte te suit dans chaque partie. Touche ici pour changer ton deck. » |

- [ ] Ancres `data-academy-anchor` sur la carte du classeur, le bouton
      « Équiper » des **deux** fiches (panneau sur grand écran, fenêtre sous
      900 px), les
      emplacements du deck et l'éventail de l'écran Jouer
- [ ] Seule la zone éclairée répond ; un toucher ailleurs ne fait rien
      (pas de tremblement hors table)
- [ ] Une seule fois par compte (registre des bulles vues, A11) ; rejouable
      depuis le hub (A6)
- [ ] « Passer » ou retour arrière : le parcours s'arrête, la carte reste
      dans la Collection, rien n'est perdu
- [ ] Deck déjà plein (joueur « Je connais le Njambo ») : la bulle annonce
      le remplacement (« Ton deck est plein : elle prend la place de la
      dernière. Tu pourras changer quand tu veux. »)
- [ ] Texte du bouton : « Équiper (remplace slot III) » est écrit en dur
      (`PowerCollectionScreen.tsx`, deux endroits) alors que le deck tient
      de 0 à 8 cartes : lire `ROMAN_SLOTS[powerLimit - 1]`, comme le
      message qui suit (règle stricte n° 6)
- [ ] Pas de parcours si `maxEquippedPowers === 0` (chapitre 4 masqué)
- [ ] Vérification à 375 × 812 et sur grand écran, invité et compte
- [ ] Mesures (A7) : parcours fini, abandonné (à quelle étape), carte
      toujours équipée à la partie suivante

---

## Risques

| Risque | Parade |
| --- | --- |
| La bulle parle pendant une animation | File d'attente du coach (A2), testée sur la donne et sur les pouvoirs les plus longs (`powerMax`) |
| Bulle sur la carte à toucher, en portrait | Placement calculé depuis le registre des zones ; vérification à 375 × 812 |
| Texte en désaccord avec les réglages de l'admin | Règle stricte n° 6 + test A0 |
| Carte d'une scène désactivée par l'admin | Repli A1 (carte du même geste, sinon scène masquée) |
| Le moteur de scènes dérive des vraies règles | Il appelle les mêmes fonctions (`engine/rules.ts`, moteur de pouvoirs) ; tests A1 |
| Récompenses récoltées en boucle avec des comptes invités | Montants modestes, rien d'échangeable (A9) |
| Un chantier trop gros avant d'avoir appris quoi que ce soit | Test avec de vrais novices (A7) avant A8 |
| Le coach en direct devient bavard ou agaçant | Une bulle par tour au plus, compteurs de retrait, niveau changeable en pleine partie (A12) |
| Le coach donne un avantage injuste en ligne | Règles seulement contre d'autres joueurs, vue du joueur sans les mains adverses (D10, A12) |
| Le coach se trompe de conseil | Moteur pur testé situation par situation ; conseil de coup limité au Solo IA |
| Le parcours guidé perd sa cible (carte hors écran, fiche fermée, retour arrière) | Défilement jusqu'à la carte, attente de l'ancre avant d'éclairer, « Passer » toujours visible ; un retour arrière arrête le parcours sans rien perdre (A13) |

## Journal

| Date | Étape | Avancée |
| --- | --- | --- |
| 2026-11-27 | — | Plan rédigé à partir de l'analyse « 3 profils, 3 cercles, 4 mécanismes », relue contre le code : 6 écarts entre textes et moteur listés (A0), donne animée de 12,4 s à 3 joueurs relevée, 4e profil (invité par un ami) ajouté. Décisions D1 à D5, D8, D9 proposées ; D6 (Couleur ×2) et D7 (Éclair sur un 3) ouvertes. |
| 2026-11-27 | A0 | D6 tranchée : la Couleur ne double pas. Source unique `getInstantWinRules(cfg)` pour le guide et le mémo de la table (qui promettait aussi le ×2), limite de cartes Pouvoir lue dans la config, « une fois par partie », astuce du 3 nuancée. 3 tests ; tsc, eslint et suite au vert (454). Guide vérifié au navigateur (espaces perdus après `</b>` corrigés). Mémo de la table non vu à l'écran (serveur local arrêté). |
| 2026-11-27 | A12 | Demande : une aide en temps réel aussi dans les vraies parties. Ajout de l'étape A12 « Coach en direct » (conseils par moment de jeu, 3 niveaux, retrait progressif, vue du joueur sans mains adverses) et des décisions D10 à D12, à valider. |
| 2026-11-27 | A12 | D10, D11 et D12 validées telles que proposées : règles seulement contre de vrais joueurs, carte conseillée seulement en Solo IA « Accompagné » après 5 s, niveau « Accompagné » au départ avec retrait progressif. |
| 2026-11-27 | — | D1 à D5 et D8 validées telles que proposées : porte d'entrée à 2 boutons, chapitre 4 puis Dojo générique, bulles hors table en dernier, Tonton René en guide, récompenses modestes côté serveur (montants à fixer en A9), partie de fin gratuite et locale. Restent : D7 ouverte, D9 à confirmer en A1. |
| 2026-11-27 | D7 | D7 tranchée : un 3 boosté (Éclair du Mfoundi) gagne avec sa valeur effective mais ne double plus. `lastCardDoubles` exige un vrai 3 non boosté et le serveur (`matchCommands.ts`) l'appelle au lieu de sa propre copie. Phrase ajoutée au guide (carte 3, vue au navigateur à 375×812 sans défilement), à la description de l'Éclair et à la référence de l'assistant IA. 5 tests unitaires et un 4e cas dans `smoke-double-penalty.cjs` (schéma Postgres temporaire, vert). tsc, eslint, suite au vert (459). Description de l'Éclair déjà en base : non écrasée par le seed, à reprendre dans l'éditeur admin. Reste : D9 à confirmer en A1. |
| 2026-11-27 | A13 | Demande : un tuto interactif aussi hors de la table. Ajout de l'étape A13, parcours guidé clic par clic pour équiper sa première carte (fin du chapitre 4 → Collection → fiche → « Équiper dans mon deck » → éventail de l'écran Jouer). A2 doit donc pouvoir viser des éléments hors table (calque au niveau de l'application, ancres). Relevé au passage : « remplace slot III » écrit en dur dans la Collection. |
| 2026-11-27 | A1 | A1 terminée, D9 confirmée. `engine/academy/` : type de scène (donne + historique rejoué avec les vraies règles), table pure qui suit le chemin de `LocalGameSync` pour les cartes et les pouvoirs, validation qui joue la solution (ordre de la table, piège du défi, carte imposée non remplacée), repli des pouvoirs par geste sans hasard. `sync/AcademyGameSync.ts` (interface `GameSyncActions`, rythme du jeu, événements du coach). 8 scènes écrites dans `data/academy/scenes.ts` (chapitres 1 à 4 et « Et si ? ») et leurs répliques brouillons dans `data/academy/fr.ts`. Geste 4 sur 2 plis (pouvoir seulement à son tour). 34 tests ; tsc, eslint, suite au vert (499). Rien n'est encore branché sur l'écran (A3). |
| 2026-11-27 | A2 | A2 terminée. Calque du coach monté dans l'application (projecteur, bulle de Tonton René, « Suivant », « Passer », fin avec « Réessayer ce pli » / « Rejouer » / « Continuer »), directeur qui met la scène en pause pendant qu'il parle, repères DOM sur la main, les cartes, les dépôts et les avatars, textes avec valeurs de la partie. `TableScreen` reçoit une scène (`academyScene`) ; lien d'essai `/?academie=<scène>` sans écran de chargement. Vu au navigateur sur téléphone et grand écran : chapitres 1 et 2 de bout en bout, refus qui fait trembler la carte, indice, défi raté et rejoué, « Passer ». Corrigé en route : la bulle mordait sur la main (mesure des cartes soulevées), « Passer » couvrait l'en-tête, « Réessayer » laissait la scène en pause. 13 tests de plus ; tsc, eslint, suite au vert (512). |
| 2026-11-28 | A3 | A3 terminée. Parcours des bases (`BASICS_COURSE`) enchaîné sur la même table, titres de chapitre, « Et si ? » après le chapitre 3, défi de fin joué librement sur 3 plis (fin de manche libre ajoutée au moteur, validation qui joue tous les ordres de cartes). Deux situations de défi trouvées par une recherche ponctuelle (le 3 passe / ne passe pas), figées dans `scenes.ts`. Lien `/?academie=bases`. Parcours entier vérifié au navigateur sur téléphone. 7 tests de plus ; tsc, eslint, suite au vert (519). |

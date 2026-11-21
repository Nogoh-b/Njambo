# Suivi — Atelier d'animations (phase G)

> Fichier de **suivi**, mis à jour à **chaque avancée** : case cochée,
> statut de l'étape et une ligne dans le journal en bas de page.
> Le contexte et les décisions sont dans
> [`cartes-pouvoir-plan.md`](cartes-pouvoir-plan.md) (phase G).
>
> Branche : `ccr-d50eb567-ocrmnv`

## État

| Étape | Contenu | Statut |
| --- | --- | --- |
| P | Prototype HTML de l'atelier | ✅ Terminé |
| G1 | Modèle de données des animations, validation, modèles par défaut | ✅ Terminé |
| G2 | Lecteur dans le jeu (piste « modèle » des chorégraphies) | ✅ Terminé |
| G3 | Atelier dans la console admin, publication versionnée | ✅ Terminé |
| G4 | Moments du jeu : donne, carte jouée, pli, pouvoir lancé | ✅ Terminé |
| G5 | Styles d'animation des joueurs (cosmétiques) | ✅ Terminé |

Légende : ⬜ à faire · 🟡 en cours · ✅ terminé · ⛔ bloqué

## Décisions (rappel)

| Sujet | Décision |
| --- | --- |
| Portée | **Tout le jeu** : la même bibliothèque anime les mouvements de base et les pouvoirs. On bascule par étapes, sans toucher à la synchro en ligne. |
| Atelier ↔ chorégraphies | **Modèles réutilisables** : on les dépose sur la ligne de temps d'une carte, avec des réglages surchargeables. Les chorégraphies existantes continuent de marcher. |
| Stockage | **Admin, versionnés et publiés**, comme les cartes de pouvoir |
| Styles des joueurs | **Prévus** : un cosmétique surcharge une liste blanche de réglages visuels, jamais la durée |

---

## P — Prototype ✅

- [x] `docs/prototypes/atelier-animations.html`, autonome, sur la vraie
      disposition portrait (tapis, dos de carte, 3 adversaires, pioche, pot,
      dépôts, avatar, bouton pouvoirs)
- [x] 19 modèles : les 7 trajets, puis carte, main, dépôt, espace central
      et distribution
- [x] Schéma : poignées A / B aimantées sur les zones, ◆ pour courber la
      trajectoire, points de vitesse, marque du retournement
- [x] Courbe de vitesse à deux poignées et préréglages
- [x] Pistes de propriétés : échelle, retournement, rotation, opacité, lueur,
      élévation
- [x] 10 réactions de la table, calées au départ ou à l'arrivée et
      déplaçables sur la ligne de temps
- [x] Matrice des 81 transitions « de → vers »
- [x] Lecture au ralenti, image par image, enchaînement, export JSON
- [x] Vérifié dans le navigateur : rendu, glisser-déposer, matrice,
      affichage mobile
- [x] Configuration `atelier` dans `.claude/launch.json` : serveur statique
      sur le port 5310, pour ouvrir le prototype dans le navigateur intégré

## G1 — Modèle ✅

- [x] Types `AnimMotif` (`engine/anim/motif.ts`) : départ / arrivée,
      nombre de cartes, décalage, durée, trajectoire, pistes, face,
      traînée, écrasement, réactions, données d'aperçu. Ajouts par
      rapport au prototype, pour pouvoir reproduire le vol actuel :
  - points de passage (repère « trajet » ou « écran », soulèvement borné
    en px) ;
  - rythme « sur tout le vol » ou « par segment » ;
  - courbe par point de piste ;
  - pistes avancées `sizeBlend` / `turnBlend` (passage de la taille et de
    la rotation de départ à celles d'arrivée) ;
  - fenêtre et courbe du retournement automatique.
- [x] Repères par **rôle** et non par siège : `self` (le joueur qui agit),
      `target`, `winner`, `all`, `all_opponents`. Zones : main, dépôt,
      avatar, minuteur, pioche, pot, centre, révélation, bords de l'écran.
      « Chacun » est possible d'un seul côté (distribution ou ramassage du
      pli).
- [x] Normalisation (`normalizeMotif`) et validation avec bornes, erreurs
      par chemin de champ (`validateMotif`) : vol de 0,08 à 3 s, 8 s au
      total, 4 points de passage, 8 points par piste, 8 réactions
- [x] Évaluation pure (`engine/anim/sample.ts`) : courbes de Bézier,
      pistes, trajectoire (bombé, segments droits ou lissés), état d'une
      carte à un instant donné, calendrier des vols et des réactions
- [x] Les 19 modèles du prototype comme modèles par défaut
      (`engine/anim/defaults.ts`), convertis en rôles. Le prototype « Jouer
      une carte » devient « Jouer une carte · avec impact » (`play`).
- [x] `play_classic`, « Jouer une carte · vol actuel », reproduit le vol de
      `FlyingCard` : même durée (`GAME_CONFIG.anim.dropFlight`), deux
      segments à la même courbe, sommet relevé de 16 % (28 à 76 px), taille
      du dépôt à mi-vol, retournement des cartes adverses de 14 % à 76 % du
      vol. Il servira de modèle par défaut pour la carte jouée en G4.
- [x] Tests (`tests/anim-motifs.test.ts`, 20 tests) :
  - les 20 modèles par défaut sont valides et survivent au stockage JSON ;
  - la couverture des familles ;
  - les erreurs par chemin : zones, trajectoire, pistes, réactions,
    aperçu, « chacun » des deux côtés, 8 s au total ;
  - les courbes et les pistes ;
  - départ, arrivée, écrasement, face automatique ;
  - le calendrier des vols et des réactions, et le total ;
  - `play_classic` comparé **image par image** au calcul de `FlyingCard`,
    sur 4 vols (toi, adversaire proche avec l'arc mini, adversaire en face,
    très long vol avec l'arc maxi). Position, rotation et face sont
    identiques ; la taille diffère d'au plus 1 % de l'écart de départ.
- [x] Vérifications : `tsc` sans erreur, `eslint` propre, suite complète
      au vert (173 tests passés, 11 ignorés : les règles Firestore, qui
      demandent l'émulateur)

**Critère de fin** ✅ : les 19 modèles et le vol actuel passent la
validation ; un modèle invalide est refusé avec le chemin de l'erreur.

**À savoir pour la suite** :
- le modèle ne connaît que des emplacements abstraits (centre, rotation,
  échelle, face). C'est le lecteur (G2) qui les calcule à partir des
  vraies zones de la table ;
- la petite animation de pose sur le dépôt (`landPop`) appartient au
  dépôt, pas au vol : elle reste telle quelle.

## G2 — Lecteur ✅

- [x] Registre des modèles (`engine/anim/registry.ts`) : modèles par
      défaut, catalogue publié à brancher en G3 (`setMotifCatalog`),
      `resolveMotif(id, surcharges)`
- [x] Piste `{ kind: "motif", motifId, cards, mode, overrides? }` dans
      `engine/power/choreography.ts`. Sa `durationMs` est celle du vol
      d'une carte.
  - Validation : le modèle doit être connu, il doit rester valide avec
    ses surcharges (les erreurs sont rattachées à `overrides.…`) et tenir
    dans les 8 s.
  - `choreographyDuration` tient compte du modèle.
- [x] Lecteur `components/power/choreo/playMotif.ts`, appelé par
      `playChoreography`. Un modèle inconnu est ignoré, comme un effet
      inconnu.
  - Chaque image est calculée par `sampleFlight` (requestAnimationFrame) ;
    la position des zones est relue à chaque image, avec une seule mise en
    page.
  - Rendu : pistes de propriétés, trajectoire, face, ombre et lueur
    (`drop-shadow` sur les faces, pour garder la perspective du
    retournement).
  - Le départ est figé au décollage. Une zone qui « avale » la carte
    (pioche, pot, avatar, hors-écran) la fait disparaître.
- [x] Traînées : lumineuse (reflets qui suivent la carte), étincelles
      (émises le long du trajet), flou de vitesse. Atterrissage écrasé.
      En mode léger : moins de particules, pas de reflets ni de flou.
- [x] Les 10 réactions : flash, onde, gerbe, surbrillance de zone,
      couronne (reste affichée), pulsation d'avatar, Nkap, pioche qui
      tremble, assombrir les autres cartes, secousse
- [x] Main (`HandHandle`, méthodes facultatives) :
  - `cardCount` et `getCardSlot` (centre, largeur, rotation exactes) ;
  - `collapseCards` : la carte partie ne prend plus de place ;
  - `makeRoom` : des places réservées s'ouvrent en douceur, et la carte
    vise la sienne ;
  - `dimCards` ;
  - `hideCardsFor` : animation sur place.

  C'est implémenté dans `Fan` et dans la main de démonstration. Les
  mouvements existants du jeu ne changent pas tant qu'ils n'utilisent pas
  de modèle.
- [x] Avatar : `pulseBalance` (même éclat qu'un gain réel)
- [x] Animations coupées : les pistes « modèle » en déplacement réel
      libèrent l'état comme les trajectoires (`moveSourceUi`, commun au
      jeu et à la démonstration). L'orchestrateur compte ces pistes dans
      ses vols réels.
- [x] Table de démonstration : la main gère les nouvelles méthodes, et
      `playMotif(modèle)` joue un modèle seul, même un brouillon (pour G3)
- [x] Éditeur de chorégraphie : bouton « + Modèle » et formulaire minimal
      (modèle, cartes, nature). Les surcharges viendront avec l'atelier
      (G3).
- [x] Banc d'essai `/admin/modeles` : joue chaque modèle et une
      chorégraphie qui en contient un
- [x] Tests (`tests/choreography.test.ts`, 3 de plus) :
  - un modèle connu est accepté, avec ou sans surcharges, et la durée
    totale est calculée ;
  - sont refusés : un modèle inconnu, une carte fantôme en déplacement
    réel, des surcharges invalides (chemin rattaché à `overrides.…`), un
    vol trop long ;
  - le débordement des 8 s (décalages et réactions compris) est
    détecté, sans erreur en double.
- [x] Vérifications :
  - `tsc` du front et du serveur sans erreur : le serveur valide les
    chorégraphies avec le même module ;
  - `eslint` : un seul avertissement, sur un effet de `Fan` qui existait
    déjà ;
  - suite complète au vert : 176 tests passés, 11 ignorés (règles
    Firestore).
- [x] Vérification dans le navigateur (banc d'essai, mesures image par
      image) : les 19 modèles et la chorégraphie se jouent sans erreur
      console.
  - Bon nombre de cartes : 8 pour la distribution, 3 au centre, 2 pour
    l'éjection.
  - Retournements justes : la pioche passe de 180° à 0°, la défausse de
    0° à 180°.
  - Réactions créées : flash, onde et couronne pour « Jouer », étincelles,
    gerbe et pulsation pour « Vers le joueur », traînée, flash et onde
    pour « Lancer une capacité ».
  - Les cartes avalées s'effacent et le calque est vide à la fin.
  - Main : elle s'ouvre de 3 places pour 3 arrivées (144 → 220 px) et se
    resserre au départ de 2 cartes (144 → 92 px). En mise en évidence,
    la carte est cachée sous son sprite et les autres sont assombries.
    Retour à l'état initial à chaque fois.
  - Capture : carte posée sur le dépôt avec sa couronne, éventail
    resserré.

**À savoir pour la suite** :
- **G3** : le serveur valide les chorégraphies avec le registre des
  modèles. Quand des modèles seront publiés depuis l'admin, il devra
  charger leur catalogue **avant** de valider une carte qui s'en sert. Il
  refuserait sinon un modèle qui existe pourtant (« Modèle d'animation
  inconnu »).
- **G4** : l'« espace central » n'est pas encore une zone de la vraie
  table. C'est un point de l'écran à 54 % de la hauteur, sous la pioche
  et le pot. Le lecteur relit les zones à chaque image : la vraie table
  sera vérifiée avec les moments du jeu.
- Dans le panneau du navigateur intégré, quand il est masqué, les images
  (requestAnimationFrame) ralentissent. Mesurer dans une boucle
  `requestAnimationFrame` plutôt qu'avec des minuteries.

## G3 — Atelier dans l'admin ✅

- [x] Serveur (`functions/src/animMotifAdminCommands.ts`,
      `animCatalog.ts`) : `listAdminAnimMotifs`, `saveAnimMotifDraft`,
      `publishAnimMotif`, `discardAnimMotifDraft`, `setAnimMotifArchived`
      (toutes auditées).
  - Données : `anim_motifs/{id}` (brouillon, modèle publié, statut),
    `anim_motif_versions/{id}_v{rev}` (révisions immuables) et
    `anim_catalog/current` (catalogue public avec `archivedIds`).
  - Accès : lecture publique du catalogue, fiches réservées aux admins
    (temps réel et `firestore.rules`).
  - Un modèle par défaut se modifie en publiant une fiche du même
    identifiant.
  - Aucun modèle n'est supprimé, on l'archive : il sort de la
    bibliothèque mais reste jouable.
- [x] Ordre de validation : le serveur charge le catalogue des modèles
      (`ensureMotifCatalogFresh`) avant de valider une carte de pouvoir
      (liste, lecture, brouillon, publication, reconstruction du
      catalogue)
- [x] Client (`hooks/useMotifCatalog.ts`) : écoute de
      `anim_catalog/current`. Les modèles invalides sont ignorés et les
      archivés transmis au registre. Le chargeur est monté dans le jeu
      (`NjamboApp`, avant les cartes) et dans la console admin.
- [x] Catalogue des cartes de pouvoir **revalidé quand les modèles
      arrivent** (`usePowerCatalog`) : une carte qui vise un modèle publié
      n'est plus écartée si les cartes arrivent avant les modèles
- [x] Section admin « Animations » (`components/admin/AnimationsAdmin.tsx`
      et `components/admin/anim/`) :
  - [x] bibliothèque par famille, avec statut (modèle du jeu, publié
        rév. N, brouillon, archivé, erreurs) et filtre des archivés
  - [x] table schématique rejouée image par image (`motifScene.ts`,
        fonctions pures, `sampleFlight`), vraies cartes `PlayCard` avec
        retournement 3D, effets (flash, onde, gerbe, couronne, pulsation,
        Nkap, pioche, surbrillance des dépôts, secousse)
  - [x] schéma avec les poignées A / B aimantées sur les zones, ◆ du bombé,
        ◆ de chaque point de passage, points de vitesse, ↻ du retournement
  - [x] courbe de vitesse (deux poignées et préréglages)
  - [x] pistes de propriétés (glisser, double-clic, clic droit), avec
        tête de lecture ; pistes avancées de passage de taille et de
        rotation
  - [x] réactions (moment, décalage, durée, lieu, « pour chaque carte »)
  - [x] ligne de temps : barres par carte, losanges des réactions
        déplaçables, tête de lecture qui se glisse
  - [x] lecture, pause, 0,1× à 1×, boucle ; horloge externe : seuls le
        canevas, la ligne de temps et les têtes de lecture se redessinent
  - [x] matrice des transitions : une case vide crée un modèle à partir
        du plus proche
  - [x] actions : enregistrer le brouillon, publier (bloqué tant qu'il
        reste des erreurs), dupliquer, abandonner le brouillon,
        archiver / désarchiver, revenir au modèle du jeu
  - [x] lecture sur la table de démonstration (vrai lecteur du jeu)
- [x] Tests de la scène (`tests/anim-scene.test.ts`, 6) :
  - rôles et zones ;
  - les 20 modèles rejoués du début à la fin ;
  - la distribution à quatre ;
  - défausse avalée, pioche posée dans une main qui s'écarte ;
  - instant des réactions.
- [x] Onglet Animation d'une carte : « + Modèle » avec **surcharges pour
      cette carte** (départ, arrivée, décalage entre cartes, traînée,
      atterrissage écrasé, « Retirer toutes les surcharges »). Le reste
      suit l'atelier, y compris ses publications futures. Les modèles
      archivés sont retirés de la liste, sauf celui déjà choisi.
- [x] Banc d'essai `/admin/modeles` : un mode « Atelier (aperçu local) »
      assemble les mêmes composants que la console (canevas, lecture,
      ligne de temps, inspecteur), sans serveur ni enregistrement. Il sert
      aux vérifications sans compte admin.
- [x] Vérification dans le navigateur, faite **sur le contenu de la page**
      (le panneau ne se redessinait plus : captures figées, fenêtre sans
      doute masquée).
  - L'atelier s'ouvre avec ses 8 sections, l'éditeur de courbe, 6 pistes,
    les poignées A / B et la ligne de temps.
  - « Distribution » : 8 trajectoires, 6 lignes plus « 2 autres », face
    automatique et piste de retournement grisée.
  - La durée passée à 2 s recalcule le total (2,77 s). Une arrivée sur la
    pioche donne une animation sur place, avec l'indication « tire B… ».
  - Une réaction ajoutée apparaît en losange sur la ligne de temps. Une
    carte d'aperçu invalide affiche l'erreur sous le champ, puis tout
    redevient valide.
  - La console admin et le jeu compilent ; aucune nouvelle erreur dans le
    journal du serveur de dev.
- [x] Vérifications : `tsc` du front et du serveur, `eslint` propre, suite
      complète au vert (182 tests passés, 11 ignorés)

- [x] **Correctif (404 `UNKNOWN_COMMAND`)** : la section « Animations »
      appelait des commandes inconnues du backend en cours d'exécution.
  - Cause : `scripts/dev.mjs` lance le backend depuis `server/dist` sans
    jamais le recompiler ni le relancer. Le backend démarré la veille
    ignorait donc les nouvelles commandes, pourtant présentes dans
    `server/dist` recompilé.
  - Correction : au démarrage, `npm run dev` compile le backend. Ensuite,
    `tsc --watch` le recompile et `node --watch` le relance à chaque
    modification.
  - `npm run dev` relancé et vérifié :
    - `listAdminAnimMotifs` répond « authentification requise » au lieu de
      `UNKNOWN_COMMAND` ;
    - `next dev`, `tsc --watch` et `node --watch` tournent.

**À vérifier de ton côté** (non fait ici) :
- la section « Animations » dans la console avec un compte admin, et une
  publication réelle (le chemin serveur est couvert par le test
  d'intégration) ;
- un coup d'œil visuel à l'atelier, que je n'ai pas pu capturer : le
  panneau ne se redessinait plus.
- [x] Test d'intégration Postgres (`server/scripts/smoke-anim-motifs.cjs`,
      14/14), lancé dans un **schéma temporaire** de la base de dev
      (`search_path`, isolement vérifié avant le test, schéma supprimé
      après). L'utilisateur de la base n'a pas le droit de créer une base.
  - Le test couvre :
    - l'accès réservé aux admins ;
    - les 20 modèles par défaut listés ;
    - le brouillon invalide enregistré mais refusé à la publication ;
    - la publication en révision 1, le registre et le catalogue public ;
    - « Jouer une carte · vol actuel » remplacé par la version publiée ;
    - l'abandon d'un brouillon ;
    - une carte de pouvoir publiée avec une piste « modèle » (et refusée
      si le modèle n'existe pas) ;
    - l'archivage.
  - Les tests d'intégration des cartes de pouvoir (catalogue, éditeur,
    cycle de vie) repassent sans échec.

## G4 — Moments du jeu ✅

**Principe de bascule** (décision « par étapes, sans toucher à la
synchro ») :
- un moment **sans modèle attribué garde l'animation actuelle du jeu** :
  rien ne change tant que l'admin n'a rien attribué ;
- chaque moment impose son départ, et parfois son arrivée, car ce sont les
  vraies cartes qui bougent ;
- chaque moment a une **durée maximale**, pour ne jamais retarder la
  partie.

- [x] Modèle des moments (`engine/anim/moments.ts`) : carte jouée,
      distribution, pli gagné, fin de pli (d'abord « pli ramassé », voir
      plus bas), pouvoir lancé.
  - Compatibilité modèle ↔ moment (`motifFitsMoment`) et validation de
    l'attribution (`validateMoments`).
  - Plafonds :
    - carte jouée : vol ≤ 0,9 s (il retarde l'affichage du coup suivant) ;
    - pli gagné + fin de pli : ≤ `trickPause` à eux deux (le pli suivant
      commence ensuite) ;
    - pouvoir lancé : ≤ 1,5 s.
  - Distribution : le rythme reste celui du jeu (`dealPerCard`,
    `dealFlight`, attendus aussi par le serveur) et le modèle en règle le
    style.
- [x] 2 modèles par défaut de plus : « Pli gagné · éclat » et « Fin de
      pli · tassement » (22 au total ; ce dernier remplace « Pli ramassé ·
      vers le gagnant »)
- [x] Registre : `momentMap()` et `getMomentMotif(moment)`. Une
      attribution vers un modèle absent ou incompatible est ignorée, et
      l'animation actuelle du jeu reprend.
- [x] Serveur : `setGameMoments` (admin, validée, auditée) stocke
      `anim_moments/current`. Le catalogue public porte `moments` et
      `listAdminAnimMotifs` les renvoie. Accès admin (temps réel et
      `firestore.rules`) ; chargeurs client et serveur à jour.
- [x] Lecteur : `release` (retirer la carte à l'atterrissage ou à la fin),
      `onLanded`, carte de dépôt cachée pendant son vol (par identité :
      une carte ramassée ne réapparaît pas), taille du sprite = la plus
      grande des deux cartes
- [x] Table (`TableScreen.tsx`), calque des moments au niveau des cartes
      en vol :
  - [x] **Carte jouée** : avec un modèle, le vol passe par le lecteur au
        lieu de `FlyingCard`. La coordination est conservée :
        `animatingRef`, `animationEndsAtRef` = durée du vol (bornée),
        carte de la main cachée, dépôt réel révélé 40 ms avant
        l'atterrissage, éclat à l'arrivée. La carte volante disparaît à
        l'atterrissage.
  - [x] **Distribution** : l'animation intégrée de la main est coupée,
        les sprites partent de la pioche dans l'ordre de la donne. Chaque
        vraie carte reste cachée jusqu'à l'arrivée de son sprite ; les
        cartes adverses restent de dos.
  - [x] **Pli gagné** (sur le dépôt du gagnant), puis **fin de pli**
        (sur place, la carte du dessus de chaque dépôt), dans la pause de
        fin de pli
  - [x] **Pouvoir lancé** : carte décorative depuis l'avatar du lanceur
  - [x] Fin de manche : le calque des moments est vidé
- [x] Table « moment → modèle » dans l'admin
      (`components/admin/anim/GameMomentsPanel.tsx`), bouton « ⚑ Moments
      du jeu » de la section Animations :
  - une ligne par moment : départ → arrivée imposés, modèle (seuls les
    modèles compatibles, publiés ou du jeu, sont proposés), durée et
    plafond, ▶ sur la table de démonstration (rythme du jeu appliqué) ;
  - erreurs par moment (mêmes règles que le serveur) et total « Pli
    gagné + Fin de pli » face à la pause de fin de pli ;
  - « Enregistrer l'attribution » (`setGameMoments`), « Tout remettre à
    l'animation actuelle » ;
  - **« Essayer dans une partie »** : ouvre le jeu avec
    `?apercuMoments=play:play,deal:deal…`. L'attribution vaut pour cet
    onglet seulement, rien n'est enregistré (`setMomentPreview` dans le
    registre, mêmes contrôles que le serveur) ;
  - même panneau en local sur le banc d'essai `/admin/modeles` (« ⚑
    Moments du jeu (aperçu local) »).
- [x] Publication protégée : un modèle attribué à un moment ne peut plus
      être publié dans une version qui ne lui convient plus (départ
      déplacé, vol trop long, pause de fin de pli dépassée).
  - Serveur : erreur `ANIM_MOTIF_MOMENT_CONFLICT`, avec le chemin du
    moment (`momentIssuesForMotif`).
  - Atelier : le bouton Publier est bloqué avec l'explication, et
    l'en-tête du modèle indique « Anime dans le jeu : … ».
- [ ] Pioche, défausse, gain du pot : **sans objet aujourd'hui**. Les
      règles n'ont ni pioche ni défausse pendant la partie, et le pot
      part directement à l'écran de résultat. À ajouter avec une règle
      qui les crée.
- [x] **« Pli ramassé » devient « Fin de pli », sur place** (décision du
      2026-11-21).
  - Constat : les règles ne ramassent pas le pli. Chaque dépôt garde ses
    cartes jusqu'à la fin de la manche (`LocalGameSync` ne vide les
    dépôts qu'à la donne). Avec « Pli ramassé · vers le gagnant », les
    cartes du dessus filaient vers l'avatar du gagnant, puis
    réapparaissaient sur leur pile environ 2,5 s plus tard.
  - Moment `trickCollect` (clé gardée) : libellé « Fin de pli », arrivée
    imposée = départ, « Dépôt de chacun ». Les cartes restent sur leur
    pile.
  - Validation des modèles : « chacun » des deux côtés est accepté
    **seulement sur place** (même repère des deux côtés).
  - Nouveau modèle par défaut **« Fin de pli · tassement »**
    (`trick_end_settle`) : la carte du dessus de chaque dépôt se
    soulève, puis se tasse sur sa pile, à tour de rôle. 0,42 s ; avec
    « Pli gagné · éclat », 0,74 s sur 0,78 s. Il remplace
    `trick_collect`, que la base de dev ne mentionnait nulle part
    (vérifié en lecture seule).
  - Table : la fin de pli libère ses sprites à la fin de l'animation
    (`release: "end"`), puis la vraie carte reprend sa place.
- [x] Tests et vérification
  - [x] `tests/anim-moments.test.ts` (16 tests) :
    - les modèles compatibles avec chaque moment, et l'attribution
      complète valide ;
    - départ et arrivée imposés ;
    - la durée qui compte (vol, ou animation entière avec une carte par
      joueur), et le rythme du jeu pour la distribution ;
    - les erreurs avec leur chemin, les plafonds, la pause de fin de pli ;
    - `momentIssuesForMotif` ;
    - l'aller-retour du paramètre d'URL, la lecture tolérante ;
    - le registre (moments ignorés, modèle publié attribuable) et
      l'aperçu (il remplace l'attribution, puis s'efface ; mêmes
      plafonds).
  - [x] `tests/anim-motifs.test.ts` remis à jour : 22 modèles par défaut
        (les 2 modèles de pli faisaient échouer 2 tests).
  - [x] Test d'intégration Postgres `smoke-anim-motifs.cjs` : **23/23**,
        dans un schéma temporaire, supprimé ensuite. 9 vérifications de
        plus :
    - accès admin ;
    - modèle incompatible refusé, et brouillon jamais publié refusé ;
    - attribution enregistrée, registre, catalogue public et liste admin ;
    - version trop longue pour « Carte jouée » refusée, l'ancienne reste
      en place ;
    - attribution vidée.
  - [x] `tsc` du front et du serveur, `eslint` propre, suite complète au
        vert (198 tests passés, 11 ignorés : les règles Firestore).
  - [x] Navigateur, banc d'essai : le panneau, les durées (0,56 s / 0,9 s ;
        fin de pli 0,74 s sur 0,78 s) et l'aperçu de « Pli ramassé »
        (4 cartes).
  - [x] Navigateur, **vraie partie** contre l'IA (entraînement gratuit,
        4 joueurs, une manche complète, les 5 moments attribués en aperçu) :
    - la distribution passe par le modèle (20 sprites, la main est
      visible ensuite) ;
    - chaque carte jouée passe par le modèle ;
    - fin de pli : « Pli gagné » puis « Pli ramassé » (4 cartes) ;
    - le calque est vide en fin de manche, l'écran de résultat
      s'affiche, aucune erreur console.
  - [x] **Corrigé pendant la vérification** :
    - la couronne d'un modèle (réaction qui reste affichée) s'empilait
      sur la vraie table : il restait 4 ♛ sur les dépôts après chaque pli.
      Le calque des moments n'est vidé qu'en fin de manche. Désormais, un
      modèle qui libère ses cartes (moments du jeu) efface aussi ses
      effets persistants à la fin (`playMotif`) ;
    - la table de démonstration n'animait qu'une carte quand « chacun »
      est au départ (pli ramassé). Elle en anime maintenant une par
      joueur, comme le jeu.
  - [x] **Fin de pli sur place**, vérifiée après la décision :
    - tests : « chacun » des deux côtés refusé sauf sur place ; la fin
      de pli n'accepte qu'un modèle sur place ; la scène de l'atelier
      anime 4 cartes qui finissent là où elles ont commencé ;
    - intégration Postgres 23/23 avec `trick_end_settle` ;
    - `tsc` front et serveur, `eslint`, suite complète au vert (205 tests
      passés, 11 ignorés) ;
    - banc d'essai : « Fin de pli », « Dépôt de chacun → Dépôt de
      chacun », 0,42 s, 0,74 s sur 0,78 s avec « Pli gagné », aucune
      erreur ;
    - **vraie partie** à 4, une manche complète. Après chaque pli, les
      cartes des dépôts ne sont cachées que le temps de l'animation sur
      place (0,3 à 0,45 s), contre environ 2,9 s avant. Elles restent sur
      leur pile. Les seules erreurs console viennent du rechargement à
      chaud de Next (fichiers modifiés), pas du jeu.
  - [x] **« Pouvoir lancé » en vraie partie** (duel contre l'IA, avec
        l'attribution `powerLaunch:launch_ability` en aperçu). En dev,
        `devEquippedPowers` équipe les 21 cartes sans toucher au compte, et
        une activation ne consomme rien.
    - Mon pouvoir (« Bouclier du Village ») : une carte part de mon
      avatar, avec la traînée, la pulsation de l'avatar et un flash. Elle
      file vers le centre (flash et onde), puis la couche se vide.
    - Pouvoir de l'IA : la carte part de l'avatar de l'adversaire (en
      haut) et rejoint le même centre.
    - Vu en passant, sans lien avec les moments : l'icône de « Sceau
      d'Entrave » (`config/powers/sceau_entrave.ts`) vaut `"shield"`, qui
      n'existe pas dans `components/ui/Art.tsx`. Résultat : requête 400
      vers `icons/undefined-64.webp` dans le tiroir des pouvoirs.

**Critère de fin** ✅ : chaque moment du jeu peut recevoir un modèle
depuis l'admin. Sans modèle attribué, l'animation actuelle du jeu reste.
Chaque moment est vérifié sur une vraie partie.

**À vérifier de ton côté** (non fait ici) : la section Animations →
« ⚑ Moments du jeu » avec un compte admin, et un enregistrement réel. Le
chemin serveur est couvert par le test d'intégration.

**Reporté** : pioche, défausse et gain du pot, à ajouter avec une règle
qui les crée (voir plus haut).

## G5 — Styles des joueurs ✅

**Décisions** (2026-11-21) :
- un **nouveau type de cosmétique, « Style d'animation »** (`anim_style`),
  avec son propre emplacement (`animStyle`). Un seul style équipé par
  joueur, sans conflit avec les autres cosmétiques ;
- le style s'applique **même sans modèle attribué** à « Carte jouée » :
  un joueur stylé prend alors « Jouer une carte · vol actuel », identique
  image par image à l'animation du jeu. Les autres joueurs gardent
  l'animation actuelle.

- [x] Liste blanche (`engine/anim/style.ts`) : traînée, densité de la
      traînée, teinte (traînée, lueur, réactions), lueur en vol (0 à 1),
      impact à l'arrivée (flash, onde, gerbe).
  - Tout autre réglage est refusé, avec son chemin
    (`style.durationMs`…).
  - `applyAnimStyle` ne touche jamais au temps ni au trajet. Un impact
    qui allongerait la durée qui compte pour le moment est raccourci, ou
    retiré s'il n'a pas la place.
  - Lecture tolérante (`readAnimStyle`) des copies équipées.
- [x] Champ sur la définition d'un cosmétique (`domain/cosmetics.ts`) :
      `style`, obligatoire et validé pour un style d'animation, refusé
      sur les autres types. L'image est facultative. Les réglages sont
      copiés dans l'équipement (`equippedCopy`), puis sur les participants
      d'une partie : tous les joueurs les voient.
- [x] Application aux mouvements du propriétaire (`TableScreen`,
      `getStyledMomentMotif`) : sa **carte jouée**, son **pli gagné**, son
      **pouvoir lancé**. La distribution et la fin de pli animent les
      cartes de tout le monde : elles restent neutres. Le style local
      vient de `useMyCosmetics` hors ligne, ou de la partie en ligne.
- [x] Admin, section Cosmétiques : type « Style d'animation », éditeur
      des réglages (`components/admin/anim/AnimStyleEditor.tsx`), aperçu
      « Carte jouée » et « Pouvoir lancé » sur la table de démonstration,
      **« Essayer dans une partie »** (`?apercuStyle=…`, cet onglet
      seulement). Le même éditeur est en local sur le banc d'essai
      `/admin/modeles`.
- [x] Collection du joueur : emplacement « Style » (« Style classique »
      quand rien n'est équipé). Récompenses : le type est proposé.
- [x] Tests (`tests/anim-style.test.ts`, 18 tests) :
  - la liste blanche, les valeurs refusées, la lecture tolérante,
    l'aller-retour de l'URL ;
  - l'application : jamais de changement de temps ni de trajet sur les
    22 modèles par défaut, animation jamais plus longue, modèle toujours
    valide ; impact raccourci ou retiré ;
  - les moments : le vol garde sa durée, l'impact se joue en entier
    après l'atterrissage ; repli sur le vol actuel ; distribution et fin
    de pli neutres ;
  - le cosmétique : validation, copie équipée, relecture tolérante.
- [x] Intégration Postgres `smoke-cosmetics.cjs` : **17/17** (6
      vérifications de plus). Un style qui touche à la durée est refusé ;
      des réglages sur un dos de carte aussi. Le style est enregistré sans
      image, gagné, équipé seulement dans son emplacement, puis copié sur
      le participant d'une partie.
- [x] `tsc` du front et du serveur, `eslint`, suite complète au vert
      (223 tests passés, 11 ignorés).
- [x] Vérification dans le navigateur, une fois le panneau du navigateur
      intégré affiché (masqué, il ne produisait plus aucune image).
  - **Table de démonstration** (style : étincelles, rose, gerbe) : une
    carte, 6 étincelles pendant le vol, une gerbe de 18 particules à
    l'arrivée, en rose ; la couche est vide ensuite.
  - **Vraie partie** (duel contre l'IA, entraînement gratuit,
    `?apercuStyle=trail:sparks,tone:pink,glow:0.6,impact:burst`, aucun
    modèle attribué) :
    - mes 5 cartes jouées passent par le vol actuel stylé : 5 cartes,
      90 particules de gerbe (5 × 18), 21 étincelles ;
    - les 111 effets sont roses, et 94 images de vol ont une lueur rose ;
    - les cartes de l'IA gardent l'animation actuelle : aucune carte de
      l'IA dans la couche des moments ;
    - manche finie, aucune erreur console.
  - **Corrigé** : dans l'éditeur, la case « Lueur en vol » prenait toute
    la largeur et le curseur passait à la ligne. Ils sont maintenant sur
    la même ligne.

**Critère de fin** ✅ : un style se crée dans l'admin, se gagne, s'équipe
et colore les mouvements de son propriétaire pour tous les joueurs, sans
changer le rythme de la partie.

- [x] **Outil de test : « Offrir un cosmétique »** dans la section Joueurs
      de l'admin (`adminGrantCosmetic`). Il permet de tester un style de
      bout en bout sans passer par un événement.
  - Motif obligatoire, consigné dans l'audit ; protégé contre le double
    clic.
  - Même un cosmétique inactif peut être offert.
  - S'il est déjà possédé, le cadeau est refusé : il n'est pas converti
    en cauris comme un doublon gagné.
  - La fiche joueur liste les cosmétiques possédés.
  - Intégration Postgres `smoke-player-admin.cjs` : **18/18** (8
    vérifications de plus). Le backend de `npm run dev` connaît la
    commande (une requête sans compte répond « authentification
    requise »).

**À vérifier de ton côté** (non fait ici, il faut un compte admin) :
1. créer un style dans Cosmétiques (type « Style d'animation ») ;
2. dans Joueurs, retrouver ton compte et lui offrir ce style ;
3. dans le jeu, Collection → Cosmétiques → Style : l'équiper, puis jouer
   contre l'IA.

**À savoir** : comme pour les autres cosmétiques, l'équipement garde
une copie. Si l'admin modifie un style déjà équipé, les joueurs ont la
nouvelle version en le rééquipant.

---

## Journal

| Date | Étape | Avancée |
| --- | --- | --- |
| 2026-11-21 | G5 | « Offrir un cosmétique » dans la section Joueurs de l'admin, pour tester un style de bout en bout : motif obligatoire et audité, même inactif, refusé s'il est déjà possédé. Intégration Postgres 18/18, 223 tests au vert. |
| 2026-11-21 | G5 | **G5 terminé, l'atelier d'animations est complet.** Vérifié dans le navigateur : table de démonstration, puis vraie partie avec un style en aperçu. Mes 5 cartes stylées (gerbe 5 × 18, étincelles, lueur, tout en rose), cartes de l'IA inchangées, aucune erreur. Corrigé : la case « Lueur en vol » de l'éditeur. |
| 2026-11-21 | G5 | Décisions : nouveau type de cosmétique « Style d'animation » ; style appliqué même sans modèle (vol actuel). Liste blanche et application sans changer le rythme, champ `style` des cosmétiques, carte jouée / pli gagné / pouvoir lancé du propriétaire, éditeur admin avec aperçu et essai en partie, emplacement « Style » de la collection. 18 tests, intégration Postgres 17/17, 223 tests au vert. Reste la vérification visuelle (panneau du navigateur masqué). |
| 2026-11-21 | G4 | **G4 terminé.** « Pouvoir lancé » vérifié en vraie partie : la carte part de l'avatar du lanceur (moi ou l'IA) et rejoint le centre, puis la couche se vide. Reste de ton côté : la section admin avec un compte admin. Vu en passant : icône `"shield"` absente pour « Sceau d'Entrave » (requête 400). |
| 2026-11-21 | G4 | Décision : « Pli ramassé » devient **« Fin de pli », sur place** (les dépôts gardent leurs cartes). Nouveau modèle par défaut « Fin de pli · tassement » (`trick_end_settle`, remplace `trick_collect`). « Chacun » des deux côtés accepté seulement sur place. Tests, intégration Postgres 23/23, 205 tests au vert. Vraie partie à 4 : plus de cartes qui disparaissent puis réapparaissent. |
| 2026-11-21 | G4 | Table « moment → modèle » dans l'admin (et en local sur le banc d'essai), « Essayer dans une partie » (aperçu par l'URL, cet onglet seulement), publication protégée quand un moment utilise le modèle. 16 tests de moments, 2 tests remis à jour (22 modèles), intégration Postgres 23/23, 198 tests au vert. Vraie partie à 4 vérifiée. Corrigé : couronnes empilées sur les dépôts, une seule carte en aperçu de « Pli ramassé ». **À trancher** : « Pli ramassé » alors que les dépôts gardent leurs cartes. |
| 2026-11-21 | G4 | Moments du jeu : modèle, plafonds et validation, 2 modèles de pli, commande serveur `setGameMoments`, catalogue avec `moments`. Table branchée (carte jouée, distribution, pli gagné / ramassé, pouvoir lancé), animation actuelle conservée sans modèle attribué. |
| 2026-11-21 | G3 | `npm run dev` relancé : le backend connaît les commandes de l'atelier (plus de 404). La recompilation et le redémarrage automatiques sont actifs. |
| 2026-11-21 | G3 | Correctif du 404 `UNKNOWN_COMMAND` : le backend de `npm run dev` tournait sur l'ancienne compilation. `scripts/dev.mjs` compile désormais le serveur au démarrage, puis le recompile et le relance automatiquement. À activer en relançant `npm run dev`. |
| 2026-11-21 | G3 | **G3 terminé.** Surcharges d'un modèle dans la chorégraphie d'une carte, atelier local sur le banc d'essai, vérification dans le navigateur par le contenu de la page (changement de modèle, durée, arrivée, réaction, erreur de validation). 182 tests passés, `tsc` front et serveur, `eslint`. À voir de ton côté : la section avec un compte admin et un coup d'œil visuel. |
| 2026-11-21 | G3 | Atelier dans la console (section « Animations ») : bibliothèque, table schématique au ralenti, schéma à poignées, courbes, pistes, réactions, ligne de temps, matrice, publication, table de démonstration. Catalogue des modèles côté client, cartes revalidées à leur arrivée. 6 tests de scène. |
| 2026-11-21 | G3 | Serveur des modèles : brouillon, publication versionnée, catalogue public `anim_catalog/current`, archivage, accès admin. Catalogue des modèles chargé avant de valider une carte. Test d'intégration 14/14 (schéma temporaire), cartes de pouvoir sans régression. |
| 2026-11-21 | G2 | **G2 terminé.** 3 tests de plus sur la piste « modèle » ; `tsc` du front et du serveur, suite complète au vert. Vérification dans le navigateur : les 19 modèles et la chorégraphie se jouent. Mesures de la main : s'ouvre de 3 places, se resserre, s'assombrit, puis revient. Capture de la couronne sur le dépôt. |
| 2026-11-21 | G2 | Lecteur des modèles écrit et branché : piste « modèle » des chorégraphies, registre, vols image par image, traînées, 10 réactions, main qui se resserre / s'écarte / s'assombrit, coupure des animations, table de démonstration, « + Modèle » dans l'éditeur, banc d'essai `/admin/modeles`. |
| 2026-11-21 | G1 | **G1 terminé.** 20 modèles par défaut (dont `play_classic`, le vol actuel). 20 tests, dont la comparaison image par image avec `FlyingCard` : position, rotation et face identiques, taille à moins de 1 %. `tsc`, `eslint` et la suite complète au vert. |
| 2026-11-21 | G1 | Modèle `AnimMotif` (rôles, points de passage, rythme par segment, courbes par point, pistes de fondu, face automatique), validation avec bornes et évaluation pure d'une carte à un instant donné. |
| 2026-11-21 | — | Fichier de suivi créé : chaque avancée y est cochée et journalisée. |
| 2026-11-21 | — | Décisions : tout le jeu, modèles réutilisables, publiés depuis l'admin, styles des joueurs prévus. |
| 2026-11-21 | P | Prototype de l'atelier (19 modèles, schéma à poignées, courbe de vitesse, pistes, réactions, matrice) vérifié dans le navigateur ; configuration `atelier` ajoutée. |

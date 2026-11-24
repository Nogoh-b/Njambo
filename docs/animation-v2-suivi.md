# Plan et suivi — Animation V2 (zones intelligentes)

> Fichier de **plan et de suivi**, mis à jour à **chaque avancée** : case
> cochée, statut de l'étape et une ligne dans le journal en bas de page.
> La V2 s'ajoute à l'atelier d'animations actuel (V1, phase G, voir
> [`atelier-animations-suivi.md`](atelier-animations-suivi.md)) **sans le
> remplacer**.
>
> Prototype de référence :
> [`prototypes/animation-v2-zones.html`](prototypes/animation-v2-zones.html)
>
> Branche : `ccr-d50eb567-ocrmnv`

## État

| Étape | Contenu | Statut |
| --- | --- | --- |
| P | Prototype HTML « zones intelligentes » | ✅ Terminé |
| V2-1 | Contrat des zones : chaque zone calcule la pose de ses cartes | ✅ Terminé |
| V2-2 | Modèle V2, validation, lecteur | ✅ Terminé |
| V2-3 | Bascule V1 / V2 sur les moments du jeu | ✅ Terminé |
| V2-4 | Atelier V2 dans la console admin, publication versionnée | ✅ Terminé |
| V2-5 | Cartes de pouvoir en V2, version simplifiée : un modèle V2 par carte | ✅ Terminé |

Légende : ⬜ à faire · 🟡 en cours · ✅ terminé · ⛔ bloqué

---

## Principe

La V2 sépare trois responsabilités, qui sont aujourd'hui toutes portées par
le modèle V1 (`AnimMotif`) :

| Qui | Décide de | Exemple |
| --- | --- | --- |
| **Le jeu** | quelle carte bouge, d'où vers où, combien de cartes, pour quel joueur | « la carte 3 de la main du joueur 2 va sur son dépôt » |
| **La zone** | la pose : centre, rotation, échelle, face visible, empilement ou éventail, réorganisation des autres cartes | la main ouvre une place et donne l'angle de la nouvelle carte |
| **L'animation V2** | le mouvement seulement : durée, courbure, rythme, effet de sortie, effet d'entrée, durée de la réorganisation | « 750 ms, courbure 25 %, arrivée douce, pulsation » |

Conséquence : **un même modèle V2 sert pour tous les trajets** (pioche →
main, main → dépôt, dépôt → main…) sans retouche. Un modèle V1 est lié à son
départ et à son arrivée.

Format exporté par le prototype (point de départ du type `AnimV2`) :

```json
{
  "schema": "njambo.anim.v2",
  "version": 1,
  "pose": "provided-by-zones",
  "motion": { "durationMs": 750, "curve": 0.25, "easing": "smooth" },
  "effects": { "onLeave": "glow", "onEnter": "pulse" },
  "handReflowMs": 600,
  "facePolicy": "game-visibility"
}
```

## Ce qui existe déjà et sera réutilisé

| Élément | Où | Rôle dans la V2 |
| --- | --- | --- |
| Poses de la main | `HandHandle.getCardSlot`, `makeRoom`, `collapseCards` (`components/table/zones/ZoneRegistry.tsx`, `Fan.tsx`) | pose d'une carte de la main, ouverture et resserrement de l'éventail |
| Registre des zones | `ZoneRegistry` (`hand:n`, `deposit:n`, `deck`, `pot`, `timer:n`, `reveal`) | lieu unique où le lecteur V2 demande les poses |
| Calculs | `engine/anim/sample.ts` (Bézier, courbes de rythme) | trajectoire et rythme du vol V2 |
| Moments du jeu | `engine/anim/moments.ts` (`play`, `deal`, `trickWin`, `trickCollect`, `powerLaunch`), `getMomentMotif` | point de bascule V1 / V2, avec les mêmes plafonds de durée |
| Calque des moments | `TableScreen.tsx` (phase G4) | même coordination : `animatingRef`, carte cachée pendant le vol, dépôt révélé avant l'atterrissage |
| Publication | `anim_motifs`, `anim_catalog/current` (phase G3) | même circuit brouillon → version publiée |

**Ne change pas** : la synchro en ligne, le serveur de jeu, les règles. La
V2 est un calque visuel, comme la V1.

## Décisions

| Sujet | Décision |
| --- | --- |
| Coexistence | La V1 et l'animation d'origine restent intactes. Chaque moment choisit : **origine**, **modèle V1** ou **modèle V2**. |
| Repli | Un modèle V2 absent, invalide ou trop long → animation d'origine du moment (même règle qu'en V1). |
| Plafonds | Ceux des moments s'appliquent à la V2 : carte jouée ≤ 0,9 s, pli gagné + fin de pli ≤ `trickPause`, pouvoir lancé ≤ 1,5 s ; la distribution garde le rythme du jeu. |
| Face visible | Décidée par la visibilité du jeu (`facePolicy: "game-visibility"`) : une carte adverse reste de dos, jamais par l'animation. |
| Cartes de l'aperçu | Les vraies cartes du jeu (3 à 10, quatre couleurs), pas A / J / Q / K / 2 comme dans le prototype. |

### Choix tranchés (2026-11-21 : recommandations validées)

| Sujet | Options | Retenu |
| --- | --- | --- |
| Portée de la V2 | (a) V2 volontairement simple, la V1 garde les animations spectaculaires ; (b) ajouter quelques options V2 | **(a) d'abord**, puis (b) avec au plus : décalage entre cartes (distribution), traînée (reprise des traînées V1) |
| Bascule globale | (a) choix par moment seulement ; (b) en plus, un interrupteur « tout en V2 » | **(a) + aperçu** `?apercuMoments=` ; un interrupteur global seulement si l'admin le demande |
| Styles des joueurs (G5) | (a) ignorés en V2 ; (b) appliqués à la liste blanche commune (traînée, impact, teinte) | **(b)** si la traînée est ajoutée, sinon (a) |

---

## V2-1 — Contrat des zones ✅

Chaque zone sait dire **où irait la carte n sur N** et **comment elle se
réorganise**. La main le sait déjà ; les autres zones ne donnent que des
rectangles.

- [x] Type commun `ZonePose { x, y, rotate, width, face: 0 | 180, z,
      sink? }` (`engine/anim/v2/pose.ts`), sans DOM. `width` (largeur de
      la carte à l'écran) remplace `scale` : c'est ce dont le lecteur a
      besoin pour dimensionner le sprite. Fonctions pures : `fanPose`
      (éventail), `pilePose` (dépôt), `stackPose` (pioche), `rectPose`
      (repli), `scaleFromBox` (échelle exacte d'un élément tourné, à tout
      angle)
- [x] Méthode facultative `poseOf(index, count?)` sur les poignées
      (`ZoneRegistry.tsx`) :
  - [x] main (`Fan`) : même calcul que le rendu (écart de w/2, 8° par
        carte, rotation du siège, soulèvement) ; `count` plus grand = place
        d'une carte qui arrive, dans la disposition du prochain état ;
  - [x] dépôt (`DepositZone`) : centre + « jeté » de la carte (`dx`, `dy`,
        `dropRot`) ; une carte pas encore posée vise le centre, à plat ;
  - [x] pioche (`DeckZone`) : paquet incliné de −6°, de dos, épaisseurs
        décalées (3 au plus) ;
  - [x] avatar, minuteur, pot : pose au centre avec `sink: true` (la carte
        y disparaît, même règle qu'en V1).
- [x] Réorganisation : `reflowZone(registre, zone, { leave, enter }, ms)`
      dans `components/table/zones/zonePose.ts` plutôt qu'une méthode par
      zone (la main utilise ses `collapseCards` / `makeRoom` ; les autres
      zones n'ont rien à faire)
- [x] Table de démonstration (`ChoreoDemoStage.tsx`) : `poseOf` pour la
      main, le dépôt et la pioche. Les mains gardent la largeur de 5 cartes
      : un éventail centré déborde autant des deux côtés, son centre ne
      bouge pas quand des cartes arrivent
- [x] Repli : `zonePoseOf(registre, zone, index, count?)` utilise
      `poseOf`, sinon le rectangle de la zone (centre, à plat) — jamais
      d'erreur
- [x] Pont de diagnostic (développement uniquement) : `window.__njZones` =
      registre des zones de la table (`TableScreen.tsx`), pour mesurer les
      poses dans le navigateur
- [x] Tests (`tests/anim-v2-pose.test.ts`, 15 tests) : rotation et échelle
      (y compris 90° et −30°), éventail de 1 à 5 cartes centré, place
      d'une carte qui arrive, siège tourné, soulèvement le long de l'axe de
      la carte, pile du dépôt, paquet de la pioche, repli et `sink`
- [x] Vérifications : `tsc` du front et du serveur sans erreur, `eslint`
      sans nouvel avertissement, suite complète au vert (266 tests passés,
      11 ignorés : règles Firestore)
- [x] Vérification dans le navigateur, vraie partie (Contre l'IA,
      4 joueurs) :
  - main, 4 sièges (0°, 90°, 180°, 270°) : centre et taille de chaque
    carte identiques au rendu, à **0,6 px** près au plus (arrondis des
    sièges latéraux) ;
  - main après une carte jouée : pose actuelle exacte (0 px) ; la pose
    prévue avant le coup (`poseOf(i, 4)`) est juste en position le long
    de l'éventail et en angle ;
  - dépôt : carte posée exacte ; pioche : centre exact.
  - Table de démonstration : éventail centré à 0,13 px près avec 3 places
    de plus ; disposition visuelle inchangée.

**Critère de fin** ✅ : pour chaque zone de la vraie table, on obtient une
pose de départ et d'arrivée cohérente avec ce qui est affiché.

**À savoir pour la suite (V2-2)** :
- Le soulèvement d'une carte **jouable** (−24 % de la largeur) dépend du
  coup suivant : une pose prévue pour un autre nombre de cartes prend le
  soulèvement au repos. Le lecteur doit donc **relire la pose d'arrivée à
  chaque image** (comme le lecteur V1), pas la figer au décollage.
- Le jeté d'une carte sur le dépôt (±9°, ±6 px) n'est connu qu'une fois la
  carte posée par le jeu : le vol vise le centre, à plat, puis le
  `landPop` du dépôt masque l'écart.
- Dans le panneau du navigateur masqué, les animations n'avancent presque
  pas (8 images en 3 s) : vérifier la mise en page sans animation, ou
  demander d'afficher le panneau.

## V2-2 — Modèle V2 et lecteur ✅

- [x] Type `AnimV2` (`engine/anim/v2/model.ts`) : `schema`
      (`njambo.anim.v2`), `version`, id, nom, description, `motion`
      (durée, courbure, rythme : fluide / arrivée douce / linéaire),
      `effects` (sortie, entrée : aucun / lueur / pulsation),
      `handReflowMs`, `facePolicy: "game-visibility"`
- [x] `normalizeAnimV2` (accepte un export du prototype tel quel, avec
      un identifiant et un nom en plus) et `validateAnimV2`, erreurs par
      chemin de champ ; bornes : vol 0,08 à 3 s, courbure −0,7 à +0,7,
      réorganisation 0,15 à 1,2 s
- [x] Calendrier `animV2Timeline` : effet de sortie au décollage,
      réorganisation à 14 % du vol, effet d'entrée à 82 %, durée totale
      (vol, réorganisation et effets compris)
- [x] Échantillonnage pur `sampleAnimV2(modèle, départ, arrivée, ms)`
      (`engine/anim/v2/sample.ts`) : Bézier cubique bombé selon la
      courbure (plafonnée à 245 px), rotation par le **plus court
      chemin** (un siège latéral à 270° ne fait pas un tour pour aller au
      dépôt), largeur interpolée, grossissement de 10 % à mi-vol,
      retournement seulement si la face change
- [x] Lecteur `components/power/choreo/playAnimV2.ts` :
  - [x] poses de départ figées au décollage, pose d'arrivée relue à
        chaque image jusqu'à l'atterrissage ;
  - [x] la carte de départ (main ou dépôt) s'efface, son sprite la
        remplace ; la main de départ se resserre et celle d'arrivée
        s'écarte (`reflowZone`) au moment prévu ;
  - [x] effets de sortie et d'entrée. **Ils ne transforment jamais la
        zone** : une main agrandie de 7 % décalait la place visée de
        3,6 px (mesuré). Lueur = filtre ; pulsation = éclat + onde
        dessinée sur le calque ;
  - [x] une carte qui arrive sur la pioche, un avatar ou le pot disparaît
        en se posant ;
  - [x] `release` (`keep` / `landing` / `end`) et `onLanded`, comme le
        lecteur V1 ;
  - [x] mode léger : pas d'effet de sortie.
- [x] 3 modèles par défaut (`engine/anim/v2/defaults.ts`) : « Fluide »
      (750 ms), « Rapide » (420 ms, sous le plafond de 0,9 s de la carte
      jouée), « Arc ample » (950 ms)
- [x] Banc d'essai `/admin/modeles` : section « Animation V2 · zones
      intelligentes », chaque modèle sur 4 trajets (Piocher, Jouer,
      Récupérer, Jouer · adversaire) et « Tout jouer (V2) ».
      `ChoreoDemoStage.playAnimV2(modèle, trajet)`
- [x] Tests (`tests/anim-v2-model.test.ts`, 13 tests) : modèles par
      défaut, export du prototype, valeurs par défaut, 10 erreurs par
      chemin, calendrier, départ et arrivée exacts sur 4 trajets × 3
      modèles, phases, retournement, grossissement, côté et plafond de la
      courbure, plus court chemin, modèle sans pose
- [x] Vérifications : `tsc` du front et du serveur sans erreur, `eslint`
      propre, suite complète au vert (279 tests passés, 11 ignorés)
- [x] Banc d'essai dans le navigateur (panneau affiché, ~64 images/s),
      12 vols mesurés image par image (3 modèles × 4 trajets) : écart de
      **0 px** au départ et à l'arrivée, angle et largeur d'arrivée exacts,
      retournements justes (pioche et main adverse 180° → 0°), onde
      présente avec la pulsation, la main s'écarte d'une place (6 places)
      pour la carte piochée ; aucune erreur console.

**Critère de fin** ✅ : sur le banc d'essai, un modèle V2 anime
correctement les trajets, et la main se réorganise pendant le vol.

**À savoir pour la suite (V2-3)** :
- Le lecteur prend une liste de mouvements qui décollent ensemble. La
  distribution (cartes en décalé) devra lancer plusieurs lectures
  décalées au rythme du jeu (`dealPerCard`), ou attendre l'option
  « décalage entre cartes ».
- Un effet de zone ne doit jamais toucher à la géométrie d'une zone dont
  on relit les poses.

## V2-3 — Bascule V1 / V2 sur les moments ✅

- [x] Référence V2 dans `MomentMap` : texte `v2:<identifiant>` plutôt
      qu'un objet `{ engine, id }` (écart au plan, voulu) : la forme
      stockée ne change pas (texte), l'ancien format (identifiant V1 seul)
      reste lu tel quel, et tout le code existant (serveur, console,
      assistant IA, aperçu) garde ses types. Pas de collision possible :
      un identifiant de modèle ne contient pas « : ».
      `isV2Ref`, `v2Ref`, `v2IdOf` (`engine/anim/moments.ts`)
- [x] Moments ouverts à la V2 : **Carte jouée** et **Distribution**
      (`ANIM_V2_MOMENTS`). « Pli gagné » et « Fin de pli » sont sur
      place, « Pouvoir lancé » n'a pas d'arrivée : refusés en V2, avec
      l'explication
- [x] `validateMoments` vérifie aussi les références V2 : moment
      compatible, modèle connu, plafond du vol (carte jouée ≤ 0,9 s).
      La distribution garde le rythme du jeu (`momentAnimV2` : vol
      `dealFlight`)
- [x] Registre des modèles V2 (`engine/anim/v2/registry.ts` : modèles par
      défaut, `setAnimV2Catalog` prêt pour V2-4)
- [x] Registre des moments : `getMomentAnimV2(moment)` ; `getMomentMotif`
      ne renvoie jamais un modèle V2 ; un moment en V2 ne prend pas le
      « vol actuel » d'un joueur stylé (`getStyledMomentMotif` → null).
      Catalogue publié et aperçu : une référence V2 invalide est écartée
      (animation d'origine)
- [x] Serveur : `setGameMoments` passe par le même `validateMoments` :
      références V2 acceptées, refusées sur un moment sur place ou si le
      modèle est inconnu ; `anim_moments/current` et le catalogue public
      les portent telles quelles
- [x] `TableScreen.tsx` :
  - [x] **Carte jouée** : un modèle V2 passe avant les modèles V1 et le
        style ; même coordination (`animatingRef`, fin du vol bornée à
        0,9 s, carte de la main cachée, dépôt réel révélé 40 ms avant
        l'atterrissage, éclat à l'arrivée) ; la carte vise la place
        suivante du dépôt ;
  - [x] **Distribution** : une carte toutes les `dealPerCard` ms dans
        l'ordre de la donne, vol `dealFlight`, de la pioche vers sa place
        (déjà dans la main, cachée jusqu'à l'atterrissage) ; cartes
        adverses de dos ; pas de réorganisation (`reflow: false`, option
        ajoutée au lecteur) ; animation intégrée de la main coupée ;
  - [x] contexte de lecture commun V1 / V2 (`momentContext`).
- [x] Aperçu sans enregistrer : `?apercuMoments=play:v2:v2_rapide,deal:v2:v2_fluide`
      (lecture tolérante gardée : un suffixe « :x » est ignoré)
- [x] Tests (`tests/anim-v2-moments.test.ts`, 15 tests) : préfixe,
      moments compatibles, modèle inconnu, plafonds, mélange V1 / V2,
      aperçu (lecture, entrées mal formées, aller-retour), registre
      (origine, V1 ↔ V2, joueur stylé, distribution au rythme du jeu,
      aperçu filtré, catalogue publié filtré, retour en V1 sans
      rechargement)
- [x] Test d'intégration serveur (`server/scripts/smoke-anim-motifs.cjs`,
      7 vérifications de plus, schéma Postgres temporaire supprimé
      ensuite) : 21/21
- [x] Vérifications : `tsc` du front, du serveur et des fonctions sans
      erreur, `eslint` propre, suite complète au vert (294 tests passés,
      11 ignorés)
- [x] Vraie partie (Contre l'IA, 4 joueurs, aperçu
      `play:v2:v2_rapide,deal:v2:v2_fluide`) :
  - distribution : **20 cartes volantes** (4 × 5) étalées sur 1,3 s
    (19 × 65 ms, rythme du jeu), 20 ondes d'arrivée, toutes les cartes
    visibles ensuite ;
  - carte jouée : 5 vols mesurés (moi et les IA, 4 sièges), dernière
    image à **0,1 px** au plus du dépôt, vol d'environ 450 ms (modèle de
    420 ms) ;
  - aucune erreur console liée (seulement des coupures réseau du
    navigateur, `ERR_NETWORK_CHANGED`).

**Critère de fin** ✅ : dans une vraie partie, « Carte jouée » et
« Distribution » passent en V2 par l'aperçu ; le retour à la V1 ou à
l'origine sans rechargement est vérifié par les tests et le test
d'intégration serveur (pas rejoué dans la partie).

**À savoir pour la suite** :
- **Réglage du navigateur** : dans le navigateur intégré, les animations
  du jeu sont coupées (`njambo-settings-v1.animationsOn = false`) : aucun
  moment ne s'anime, ni V1 ni V2. Activées le temps de l'essai, remises
  ensuite.
- **Panneau « Moments du jeu » (admin)** : il ne propose pas encore la
  V2, et une référence `v2:…` enregistrée (par l'assistant IA par
  exemple) y apparaît « introuvable ». À traiter en V2-4.
- Dans le navigateur intégré (développement, ~26 images/s), le jeu gèle
  ~0,5 s au moment d'un coup : la première image d'un vol peut arriver
  tard. Non comparé à la V1 dans les mêmes conditions.
- Pendant la distribution, la pulsation d'arrivée se joue à chaque carte
  (20 ondes) : à juger à l'œil ; un modèle « aucun effet d'entrée » l'évite.

## V2-4 — Atelier V2 dans l'admin ✅

- [x] Éditeur `components/admin/anim/AnimV2Editor.tsx`, repris du
      prototype : identité, durée, courbure, rythme, réorganisation de la
      main, effets de sortie et d'entrée, calendrier affiché, erreurs par
      champ, données enregistrées, **import d'un export JSON du
      prototype** (l'identifiant et le nom du modèle ouvert sont gardés ;
      JSON illisible signalé). La « carte choisie par clic » du prototype
      n'est pas reprise : sur la table de démonstration, les trajets
      d'essai fixent la carte
- [x] Aperçu sur la table de démonstration du jeu, lecteur du jeu, 4
      trajets (Piocher, Jouer, Récupérer, Jouer · adversaire)
- [x] Serveur `functions/src/animV2AdminCommands.ts` (même circuit que les
      modèles V1) : `listAdminAnimsV2`, `saveAnimV2Draft`,
      `publishAnimV2`, `discardAnimV2Draft`, `setAnimV2Archived` ;
      collections `anim_v2_models/{id}` et `anim_v2_versions/{id}_v{rev}`
      (admins seulement : `authz.ts`, `firestore.rules`) ; routes du
      serveur et fonctions Firebase déclarées ; messages d'erreur en
      français dans la console
- [x] Catalogue public : les modèles V2 publiés voyagent dans
      `anim_catalog/current` (`animsV2`, `archivedV2Ids`), une seule
      lecture pour les joueurs. Chargés **avant** l'attribution des
      moments, côté client (`useMotifCatalogLoader`) et serveur
      (`ensureMotifCatalogFresh`, `rebuildAnimCatalog`). Registre V2 :
      archivage (hors bibliothèque, toujours jouable)
- [x] Console, section Animations, bouton **« ◇ Animation V2 »** :
      bibliothèque (modèles du jeu, publiés, brouillons, archivés),
      nouveau, dupliquer, enregistrer, publier, abandonner, archiver,
      revenir au modèle du jeu ; « Anime dans le jeu : … » quand un moment
      l'utilise
- [x] Panneau « Moments du jeu » : pour « Carte jouée » et
      « Distribution », choix animation d'origine / modèles V1 / modèles
      V2 (groupes séparés) ; durée et plafond ; ▶ joue le vol V2 ;
      « Essayer dans une partie » porte les références V2. Les autres
      moments ne proposent pas la V2
- [x] Publication protégée : `momentIssuesForAnimV2` ; le bouton Publier
      est bloqué dans la console, et le serveur refuse
      (`ANIM_V2_MOMENT_CONFLICT`)
- [x] Banc d'essai `/admin/modeles` : « ◇ Atelier V2 (aperçu local) »,
      même éditeur sans enregistrement
- [x] Tests (`tests/anim-v2-catalog.test.ts`, 9 tests) : catalogue
      (complète, remplace, archivage), modèle publié attribuable, ordre
      de chargement, publication protégée (carte jouée, distribution
      libre, modèle non utilisé, autres moments non mis en cause)
- [x] Test d'intégration serveur (`smoke-anim-motifs.cjs`, 14
      vérifications V2 de plus, schéma temporaire supprimé) : **36/36** ;
      celui de l'assistant IA passe toujours
- [x] Vérifications : `tsc` du front, du serveur et des fonctions sans
      erreur, `eslint` propre, suite complète au vert (303 tests passés,
      11 ignorés)
- [x] Navigateur :
  - atelier local : curseurs → données, import du prototype, courbure
    hors bornes refusée (message à la française, corrigé pendant la
    vérification : « −0,7 à +0,7 »), aperçu « Récupérer » à 0 px au
    départ et à l'arrivée ;
  - moments : V2 proposée pour « Carte jouée » et « Distribution »
    seulement ; « Arc ample » (0,95 s) refusé pour la carte jouée et
    « Essayer dans une partie » bloqué ; « Rapide » accepté ; ▶ joue le
    vol V2 ; lien d'essai `play:v2:v2_rapide,deal:v2:v2_fluide` ;
  - vraie console (compte admin, serveur de dev) : l'onglet V2 liste les
    3 modèles du jeu, une modification est signalée. **Rien n'a été
    enregistré ni publié dans la base de dev** : l'écriture est couverte
    par le test d'intégration.

**Critère de fin** ✅ : l'admin crée, publie et attribue un modèle V2 sans
toucher au code (enregistrement et publication vérifiés par le test
d'intégration serveur ; interface vérifiée sans écrire en base).

**À savoir** :
- La recompilation du serveur (`npm --prefix server run build`) fait
  redémarrer le backend de dev : coupures WebSocket passagères dans la
  console du navigateur.
- « Fermer » la fenêtre de l'atelier V2 abandonne sans confirmation les
  modifications non enregistrées (comme l'atelier V1).

## V2-5 — Cartes de pouvoir, version simplifiée ✅

**Décision (2026-11-22)** : au lieu d'une piste V2 dans la ligne de temps
des chorégraphies, **un seul choix par carte**. Le modèle V2 choisi anime
tous les vols de cartes (cues `flyCards`) des étapes **sans chorégraphie** ;
une étape chorégraphiée garde sa mise en scène. La piste dans la ligne de
temps reste possible plus tard.

- [x] Fiche de la carte : `PowerCardDef.animV2` (identifiant du modèle,
      facultatif). Validation partagée : format seulement — le client peut
      recevoir la carte avant le catalogue des modèles V2, et un modèle
      inconnu donne les vols habituels au lieu d'écarter la carte. Le
      serveur vérifie l'existence à la publication (« Modèle V2 inconnu ou
      non publié »), après un rechargement forcé du catalogue des modèles
- [x] Jeu (`PowerFxOrchestrator`) : un cue `flyCards` d'une carte animée
      en V2 passe par `playAnimV2` (calque des chorégraphies) :
  - [x] mêmes règles que les vols V1 : carte de départ cachée jusqu'au
        commit, état réel retardé pendant les vols `move`, commit après le
        dernier vol ;
  - [x] identité montrée seulement comme en V1 (ma main, pouvoir que j'ai
        lancé, cue non caché) ; sinon de dos ;
  - [x] place d'arrivée dans une main : disposition d'après les
        mouvements (cartes parties, puis arrivées), suivie d'un cue à
        l'autre de la même activation ;
  - [x] modèle inconnu de ce client : vols habituels.
- [x] Admin, fiche d'une carte, onglet Animation : bloc « Animation V2 »
      (`AnimV2Choice.tsx`) : vols habituels ou un modèle V2, étapes
      concernées, étapes qui gardent leur chorégraphie, aperçu sur la
      table de démonstration. Seulement deux lignes ajoutées dans
      `PowerCardsAdmin.tsx` (qui avait déjà des modifications en cours)
- [x] Bac à sable de la carte : les vols passent en V2 comme en jeu, les
      autres cues gardent leur mise en scène, dans l'ordre du script
      (`demoV2MovesForCue`, `ChoreoDemoStage.playAnimV2Moves`)
- [x] Tests : validation du champ (`tests/power-card-validation.test.ts`) ;
      test d'intégration serveur : carte refusée avec un modèle V2 non
      publié, publiée avec un modèle publié (même archivé) — suite
      d'intégration entière au vert
- [x] Vérifications : `tsc` du front, du serveur et des fonctions sans
      erreur, `eslint` propre, suite complète au vert (313 tests passés,
      11 ignorés)
- [x] **Bac à sable** (console, compte admin reconnecté, rien enregistré) :
      Vent du Nord avec « Fluide » → le bloc indique « règle le mouvement
      de l'étape 1 » ; à l'activation, **2 vols V2** : main → pioche
      (retournement 0° → 180°), puis pioche → main (180° → 0°), ondes
      d'arrivée présentes.
- [x] **Vraie partie** (accord donné, 2026-11-22) : Vent du Nord publiée
      avec « Fluide » (révision 2), partie Contre l'IA à 4 joueurs,
      animations du jeu activées le temps de l'essai puis remises. À
      l'activation, après la présentation de la carte : **2 vols V2** —
      main → pioche, posée à 1 px du centre de la pioche, retournée
      (0° → 180°) ; puis pioche → main, face visible ; la main garde ses 5
      cartes et reprend sa forme. Ensuite republiée **sans modèle V2**
      (révision 3) : la carte est revenue à ses vols habituels.

**Critère de fin** ✅ : une carte de pouvoir utilise un modèle V2 et
l'échange s'anime avec la réorganisation de la main (bac à sable et vraie
partie).

**Limites connues** :
- Échange sur place (Vent du Nord : main → pioche puis pioche → main) :
  pendant le vol, l'éventail resserre la carte partie et ouvre une place
  en bout de main ; la nouvelle carte vise sa place finale, qui peut être
  au milieu. Au commit, la main prend sa forme définitive.
- Comme pour les animations V1, le modèle lu est celui du catalogue courant
  du client (pas figé au début de la partie).

---

## Points d'attention

- Pendant une manche normale, il n'y a **ni pioche ni défausse** : les
  trajets pioche → main et dépôt → main ne servent qu'à la distribution et
  aux pouvoirs. « Récupérer » ne correspond à aucune carte aujourd'hui.
- La réorganisation de la main pendant le vol ne doit pas entrer en conflit
  avec le rendu de `Fan` au prochain état du jeu : la pose finale doit être
  **exactement** celle que `Fan` affichera.
- Dans le panneau du navigateur intégré masqué, les images ralentissent :
  mesurer dans une boucle `requestAnimationFrame` (voir le suivi de la
  phase G).

## Journal

| Date | Étape | Avancée |
| --- | --- | --- |
| 2026-11-21 | P | Prototype « zones intelligentes » copié dans `docs/prototypes/animation-v2-zones.html`. Plan V2 rédigé (V2-1 à V2-5), à valider. |
| 2026-11-21 | V2-1 | Recommandations des choix validées. Poses des zones (`engine/anim/v2/pose.ts`, `zonePose.ts`), `poseOf` sur main, dépôt, pioche (table et démonstration), repli sur le rectangle, `reflowZone`, pont `window.__njZones`. 15 tests, suite au vert ; poses mesurées sur une vraie partie à 4 joueurs à 0,6 px près. |
| 2026-11-21 | V2-2 | Modèle `AnimV2` (normalisation, validation, calendrier), vol pur `sampleAnimV2`, lecteur `playAnimV2`, 3 modèles par défaut, section V2 du banc d'essai. Écart de 3,6 px à l'arrivée trouvé au banc (la pulsation agrandissait la main) : effets refaits sans toucher aux zones. 12 vols à 0 px ; 13 tests, suite au vert. |
| 2026-11-21 | V2-3 | Références `v2:<id>` dans l'attribution des moments (ancien format intact), validation client et serveur, `getMomentAnimV2`, branches V2 de « Carte jouée » et « Distribution » dans `TableScreen`. 15 tests, intégration serveur 21/21. Vraie partie : distribution en 20 vols au rythme du jeu, cartes jouées à 0,1 px du dépôt. |
| 2026-11-21 | V2-4 | Atelier V2 : commandes serveur (brouillon, publication versionnée, archivage), modèles V2 dans le catalogue public, éditeur (import du prototype), onglet « ◇ Animation V2 » de la console, choix origine / V1 / V2 dans « Moments du jeu », publication protégée. 9 tests, intégration serveur 36/36 ; interface vérifiée au banc et dans la console sans écrire en base. |
| 2026-11-22 | V2-5 | Version simplifiée choisie : un modèle V2 par carte (`def.animV2`). Vols `flyCards` en V2 dans le jeu et le bac à sable, choix dans l'onglet Animation de la carte, existence vérifiée à la publication. Tests et intégration serveur au vert ; essai visuel en attente (navigateur intégré sans droits admin). |
| 2026-11-22 | V2-5 | Bac à sable vérifié (admin reconnecté, rien enregistré) : Vent du Nord en « Fluide » fait ses 2 vols en V2 avec les bons retournements. Vraie partie en attente : elle demande de publier la carte en base de dev. |
| 2026-11-22 | V2-5 | Vraie partie (accord donné) : Vent du Nord publiée en « Fluide » (rév. 2), 2 vols V2 vérifiés en partie, puis republiée sans modèle V2 (rév. 3). Animations du navigateur remises comme avant. Étape terminée : V2-1 à V2-5 faites. |
| 2026-11-23 | V2-5+ | Piste V2 dans la ligne de temps des chorégraphies (kind `v2`) : vrai déplacement d'une zone à une autre par un modèle V2 (celui de la piste, sinon celui de la carte, sinon « Fluide »), présentation facultative (montée, retournement, pause au-dessus de la zone de départ), réorganisation des mains réglable. Lecteur V2 : points libres `fromPose` / `toPose`, `onSpawned`, `onFirstFrame`. Éditeur admin : piste « Modèle V2 ». Utilisée par Vent du Nord et Marché de Nuit ; vérifiée dans le bac à sable. |
| 2026-11-24 | V2-5+ | Piste V2 : présentation au centre de la table (`present.at: "tableCenter"`, cartes côte à côte), échange en place (`inPlace` : chaque carte prend la place de celle qu'elle remplace, les mains gardent leur nombre de cartes). Utilisée par Pacte des Mains ; vérifiée dans le bac à sable (atterrissage dans les places échangées). |

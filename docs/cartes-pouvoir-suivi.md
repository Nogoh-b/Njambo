# Cartes pouvoir — revue carte par carte

Chaque carte passe par la même fiche :

1. **Règle** : ce que fait la carte, qui elle vise, quand l'effet arrive, prix et rareté. Validée avant tout code.
2. **Logique serveur** : effet appliqué au bon moment, cas limites (aucun effet → pas consommée, contrée par Bouclier, fin de manche, temps illimité contre l'IA).
3. **Retour visuel** : animation V2, badge ou message — le joueur doit voir ce qui s'est passé.
4. **Tests** : test de la règle + scénario serveur.
5. **Essai en partie contre l'IA** (base de dev, avec accord).
6. **Commit**, case cochée ici.

## Avancement

Ordre par famille : la première carte d'une famille construit ce que les suivantes réutilisent.

### 1. Main et pioche
- [ ] Vent du Nord — **en cours** : publiée (rév. 4 en base de dev) et vérifiée en partie ; reste ton avis visuel et le commit
- [ ] Marché de Nuit
- [ ] Troc Ciblé
- [ ] Pacte des Mains
- [ ] Main du Griot

### 2. Valeur
- [ ] Éclair du Mfoundi
- [ ] Pagne Changeant

### 3. Restrictions
- [ ] Coupe-Circuit
- [ ] Filet du Pêcheur
- [ ] Sceau d'Entrave

### 4. Temps
- [ ] Sable du Temps
- [ ] Cri du Chef
- [ ] Tambour d'Appel

### 5. Pot
- [ ] Bénédiction du Chef
- [ ] Pluie d'Étoiles
- [ ] Cauris Chanceux
- [ ] Totem des Ancêtres

### 6. Défense et information
- [ ] Bouclier du Village
- [ ] Masque du Bluffeur
- [ ] Œil du Sorcier
- [ ] Feu de Camp (à classer à la relecture)

## Fiches

### Vent du Nord (`config/powers/vent_nord.ts`)

**Aujourd'hui** : commune, 25 cauris / 400 Nkap, sans cible. À ton tour seulement. Ta carte la plus basse en valeur (la première en cas d'égalité, sans tenir compte de la couleur) part au fond de la pioche ; la carte du dessus la remplace, à l'aveugle. Refusée si la pioche est vide. Toujours consommée, même si la carte reçue est plus faible.

**Constats** :
- C'est un pari : la carte reçue peut être pire. Ni la description ni le texte d'activation ne le disent.
- Elle peut jeter un 3 que le joueur gardait pour finir (dernière carte un 3 = doublement), ou une carte de la couleur demandée.
- Marché de Nuit (épique, 60 cauris / 1 000 Nkap) fait la même chose avec une carte garantie meilleure : la différence entre les deux n'est pas expliquée au joueur.
- Pas de modèle d'animation V2 attribué (révision 3 dans la base de dev).

**Règle gardée telle quelle** : le travail porte sur l'animation et la lisibilité visuelle.

**Ce qu'on voit aujourd'hui** (lu dans `PowerFxOrchestrator`) :
1. Tout le monde : carte en grand + « VENT LEVÉ / Ta plus faible carte change » pendant 1,5 s, y compris chez les adversaires (texte à la 2e personne, sans le nom du joueur).
2. Vol main → pioche (face visible pour moi, dos pour les autres), puis pioche → main, effet « vent ».
3. Surbrillance de la nouvelle carte 2,6 s, chez moi seulement.
4. Rien ne compare l'ancienne et la nouvelle carte : gain ou perte jamais montré. Les adversaires ne savent pas qui a fait quoi.
5. Pas de modèle V2.

**Prototype (code, non publié)** — `config/powers/vent_nord.ts`, chorégraphie de l'étape :
1. Annonce : « Ta plus faible carte part au vent… la pioche décide » ; les autres lisent « {activator} lève le vent » (nouveau champ `activationTextOthers`).
2. Départ (0,1 → 0,9 s) : souffle de vent sur la main, la carte part en tournoyant vers la pioche, qui pulse.
3. Tirage (1,15 → 2,8 s) : la carte sort de la pioche, se retourne au-dessus d'elle (×1,5, pause 0,65 s), puis rejoint la place libre.
4. Verdict (2,7 → 4,75 s) : « 3♥ → 8♦ +5 » au-dessus de la main du lanceur, vert / rose / or selon l'écart ; « X a échangé une carte » chez les autres.

Briques réutilisables ajoutées : texte de piste réservé au lanceur ou aux autres (`audience`), teinte « verdict » (`verdictTone`), repères `{outgoing}` `{incoming}` `{delta}`, carte toujours de dos pour qui ne la connaît pas, bac à sable « vu par le lanceur / un adversaire » avec l'annonce, bouton admin « Version du code ». Le modèle V2 n'est plus nécessaire : la chorégraphie pilote déjà les trajectoires.

## Journal

- 2026-11-23 — Fichier créé. Méthode et ordre par famille fixés. Fiche de Vent du Nord rédigée, en attente des choix de règle.
- 2026-11-23 — Règle de Vent du Nord gardée ; priorité à l'animation et à la lisibilité. Séquence actuelle relevée, découpage en 4 temps proposé.
- 2026-11-23 — Prototype des 4 temps écrit dans le code + briques réutilisables. Vérifié dans le bac à sable (sans enregistrer) : annonce, vols, carte retournée au-dessus de la pioche, « 3♥ → 8♦ +5 » en vert côté lanceur ; côté adversaire, annonce « Le lanceur lève le vent », cartes de dos, « … a échangé une carte ». Types, lint et 325 tests OK. Reste : avis visuel, publication de la carte, essai en partie.
- 2026-11-23 — Commun à toutes les cartes : lancement de la carte depuis son emplacement jusqu'à l'annonce. Chez le lanceur, depuis sa place dans l'éventail des pouvoirs (ou le bouton « Mon deck » replié) ; chez les autres, depuis l'avatar du lanceur. Le texte d'annonce n'apparaît qu'une fois la carte arrivée au centre. Bac à sable : emplacement ajouté sur la table de démonstration (petite carte en bas à droite, ou avatar en haut en vue adversaire). Vérifié dans le bac à sable : départ centré sur l'emplacement (à 6 px près), arrivée au centre vers 0,5 s, texte visible à 0,9 s. Pas encore vu en partie réelle.
- 2026-11-23 — Corrigé : une carte de dos restait immobile ~3,5 s au-dessus de la pioche. Cause : l'effet « crache » (`spit`) de la pioche fait jaillir une carte fantôme, et toutes les cartes de chorégraphie ne disparaissaient qu'à la fin de l'animation. Désormais, une carte fantôme, ou une carte qui entre dans la pioche ou le pot, s'efface à l'arrivée (0,22 s) ; Vent du Nord n'utilise plus `spit` (la vraie carte sort déjà de la pioche). Vérifié dans le bac à sable. Note : une partie lancée n'utilise pas ce prototype tant que la carte n'est pas publiée (base de dev : révision 3).
- 2026-11-23 — Vent du Nord publiée en révision 4 (base de dev) = version du code, champ pour champ. Comparaison « Version du code » rendue insensible à l'ordre des clés (Postgres/jsonb les réordonne). Essai en partie contre l'IA : lancement depuis « Mon deck », annonce « VENT LEVÉ — Ta plus faible carte part au vent… », 3♠ vers la pioche, 5♥ retourné au-dessus, « 3♠ → 5♥ +2 » en vert. Corrigé au passage (toutes les cartes, parties serveur) : la nouvelle main arrivait par le canal privé AVANT la réponse du serveur à l'activation, et s'affichait pendant l'annonce (la carte reçue était visible avant l'animation). `AuthoritativeGameSync` retient désormais cette main tant que mon pouvoir est en cours ; vérifié : la main garde le 3♠ jusqu'à la fin de l'animation (7,4 s).
- 2026-11-23 — Rangement dans la main (toutes les chorégraphies) : une carte qui part d'une main ou y arrive prend exactement la place de l'éventail (pose V2 : centre, largeur, inclinaison, soulèvement), même si elle vole en grand entre-temps ; l'échelle et la rotation d'un point posé sur la main sont relatives à cette place. Vérifié en partie : 8♠ tiré, posé à 297,576 / 78 px / 4° ; la vraie carte ensuite à 298,575 / 78 px (≈ 1 px d'écart). Avant : 62 px et droite.

# Njambo — Carte du projet & handoff design

> Document autoportant destiné à une IA de design. Il décrit **ce qu'est le produit**, **le
> système visuel existant** (couleurs, tokens, composants) et **l'inventaire complet des écrans
> avec leur contenu**. Toutes les valeurs sont extraites du code réel du dépôt.

---

## 1. Le produit en une page

**Njambo** est un jeu de cartes mobile-first (PWA Next.js) inspiré du jeu de rue camerounais.
Ton éditorial : « le jeu du quartier », argot camerounais assumé (Mboa, Nkap, Cauris, Ter,
mboko, ngata, 237). L'interface est **en français**, fuseau `Africa/Douala`.

- **Boucle principale** : on choisit un mode → on configure la mise → on joue une manche à la
  table → écran de résultat (arène de règlement) → manche suivante ou retour.
- **Modes** : Classé en ligne (PvP), Contre l'IA (entraînement, accessible en invité),
  Entre amis (table privée par code), Événements du Ter (PvE gardiens / PvP tournoi à étapes).
- **Cartes Pouvoir** : deck d'effets équipables (jusqu'à N cartes) jouables pendant la manche.
- **Économie à 4 devises** :
  | Devise | Rôle | Icône asset |
  |---|---|---|
  | **Nkap** | monnaie douce, mises et gains de table | `nkap-stack-*.webp` |
  | **Cauris** | monnaie premium, achats boutique | `cauris-pouch-*.webp` |
  | **Énergie** | jauge d'entrée en partie (recharge naturelle, pass illimité) | `energy-flask-*.webp` |
  | **Couronnes** | points de rang / classement | icône `crown` |
  Plus : **Tickets** (bronze / argent / or) pour entrer dans les événements, **Livres** (booster
  packs : normal / rare / exceptionnel), **Packs d'éléments** (quartier / mboa / chefferie).
- **7 rangs** : Braise du Quartier → Mboa → Tambour → Notable → Chef de table → Légende 237 →
  Ancêtre Njambo (assets `public/assets/njambo/ranks/rank-*.webp`).

### Stack technique
Next.js 16 (App Router) · React 19 · TypeScript · **CSS Modules + un `globals.css` de 5 300
lignes** · `motion/react` (Framer Motion) pour les transitions de scène · **GSAP** pour les
timelines scriptées (splash, résultat, cartes pouvoir) · `@tsparticles` pour les confettis.
Backend : Postgres + WebSocket sur VPS, Firebase pour Auth/FCM uniquement.

### Architecture front à connaître avant de toucher au design
- **Un seul routeur de scènes** : `components/NjamboApp.tsx` contient un `switch` sur `scene`.
  Il n'y a **pas de routes Next** — tout est une SPA cliente, chaque écran est un composant
  chargé en `dynamic()`. Une scène = une entrée du type `SceneName` (`types/game.ts`).
- **La table reste montée** pendant toute la session ; l'écran de résultat s'affiche en overlay
  plein écran par-dessus.
- **4 layouts partagés** encadrent presque tous les écrans (voir §3.6).

---

## 2. Arborescence utile

```
app/
  globals.css          ← 5 259 lignes : le gros du design system (boutons .njb, cartes, table…)
  ter-nocturne.css     ← LE fichier de tokens. Palette brute + alias sémantiques --nj-*
  mboa-solar.css       ← palette « solaire » vers laquelle pointent les alias
  layout-tokens.css    ← breakpoints, espacements responsives, budgets d'animation, tons boutons
  layout.tsx           ← fonts (Bricolage Grotesque + Manrope), providers
  page.tsx / admin/

components/
  NjamboApp.tsx        ← routeur de scènes
  scenes/              ← 28 écrans (voir §4)
  ui/                  ← layouts + primitives partagées (Btn, TabBar, Panel, Chip, Art…)
  table/               ← Avatar, Fan (éventail de main), DepositZone, zones/, ResultOverlay
  cards/               ← PlayCard, MotionCard
  power/               ← cartes Pouvoir : vue, tray, ciblage, particules, orchestrateur FX
  result/              ← SettlementArena (arène de règlement du résultat)
  play/ player/ social/ perf/ transitions/

lib/          i18n.ts, motion.ts, gameModeCatalog.ts, gamePresentation.ts, homeArcadeMotion.ts
config/       theme.ts  ← palette JS (objet `T`) + générateurs de motifs (ndop, raphia…)
public/assets/njambo/   ← icônes, fonds, économie, rangs, tickets, livres, événements, boutons
docs/         art-direction.md (brief des assets 2,5D), implementation-status.md
```

⚠️ **Deux sources de couleur coexistent** : les tokens CSS (`--nj-*`) et l'objet TypeScript
`T` dans `config/theme.ts` (utilisé en styles inline, surtout sur la table et le profil). Une
refonte doit traiter les deux — les couleurs de `theme.ts` sont **invisibles au grep CSS**.

---

## 3. Système visuel actuel

### 3.1 Thème « Mboa Solar » (thème par défaut)

Ambiance : **parchemin ivoire chaud, encre vert-forêt, accents drapeau camerounais**
(vert / rouge / jaune). C'est un thème **clair**.

`app/mboa-solar.css` — palette source :

| Token | Hex | Usage |
|---|---|---|
| `--nj-solar-surface-strong` | `#f7ead0` | surface la plus claire (cartes, panneaux) |
| `--nj-solar-surface` | `rgba(242,226,193,.96)` | surface standard |
| `--nj-solar-ivory` | `#ead8b3` | surface douce |
| `--nj-solar-sand` | `#d6b77d` | grain / bas de dégradé |
| `--nj-solar-ink` | `#24372f` | texte principal (vert très sombre) |
| `--nj-solar-muted` | `#59675d` | texte secondaire |
| `--nj-solar-green` | `#199b68` | accent primaire (action positive) |
| `--nj-solar-green-deep` | `#116345` | encre du vert |
| `--nj-solar-red` | `#e45145` | accent destructif |
| `--nj-solar-red-deep` | `#a92f2a` | encre du rouge |
| `--nj-solar-yellow` | `#f5c344` | accent or / valeur |
| `--nj-solar-yellow-deep` | `#a9680c` | encre de l'or |
| `--nj-solar-outline` | `#b88e54` | liseré laiton de tous les panneaux |
| `--nj-solar-card-edge` | `#765033` | bord de carte à jouer |
| `--nj-solar-felt` | `#59603a` | tapis de table (kaki) |
| `--nj-solar-shadow` | `0 14px 32px rgba(35,31,18,.26)` | ombre portée standard |

### 3.2 Palette « Ter Nocturne » (héritée, conservée)

`app/ter-nocturne.css` garde la palette nuit/bois d'origine. Elle **n'est plus le thème global**
mais reste utilisée pour les surfaces volontairement sombres : hero photo de l'accueil, tapis de
jeu, splash.

`#05060b` night-950 · `#090b16` night-900 · `#11172b` indigo-850 · `#1b2340` indigo-750 ·
`#140b07` ebony-950 · `#26140b` ebony-850 · `#3f2a1c` timber-700 · `#5c3e25` timber-600 ·
`#d0a35d` brass-500 · `#ead3a2` brass-300 · `#a96243` copper-500 · `#559b91` teal-500 ·
`#ad6972` pink-500 · `#687c99` cobalt-500 · `#fff4df` cream-100 · `#e8d8bd` cream-300

Sémantiques : `--nj-success #75bc91` · `--nj-danger #ce7580` · `--nj-warning #d2a259`

### 3.3 Tons d'accent (source unique des boutons, `layout-tokens.css`)

| Ton | Hex | Convention d'usage |
|---|---|---|
| `gold` | `#f2bb45` | valeur, Nkap, accueil, boutique |
| `teal` | `#10b7a6` | Jouer, en ligne, confirmation neutre |
| `pink` | `#d83c68` | **couleur d'appel principale** (Lancer la partie, Envoyer) |
| `cobalt` | `#3154d4` | action de soutien, réglages |
| `blue` | `#2436c9` | bleu royal (motifs bamiléké/ndop) |
| `orange` | `#e8631a` | conversions Nkap |
| `palm` | `#64c778` | social, amis |
| `red` | `#e45145` | **réservé au destructif** : Déconnexion, Quitter/Abandonner, Refuser |

> Règle documentée dans `components/ui/Btn.tsx` : sans elle, `red` dérive en second `pink`.

### 3.4 Palette JS `config/theme.ts` (objet `T`)

Utilisée en styles inline (table, profil, overlays). Elle diverge légèrement des tokens CSS.

`night1 #090917` · `night2 #10142d` · `night3 #1c1741` · `deep #05050c` ·
`felt1 #119684` · `felt2 #06534f` · `felt3 #042f32` · `rim #b85d3e` · `rim2 #3d1a1a` ·
`gold #f2bb45` · `raffia #d7a957` · `copper #c75b3a` · `pink #d83c68` · `teal #10b7a6` ·
`cobalt #3154d4` · `palm #64c778` · `cream #fff0d0` · `chalk #fff8e8` · `ink #1b1010` ·
`text #fff4df` · `muted #b8adcf` · `good #6ee59c` · `bad #ff7182`

Le même fichier exporte des **générateurs de motifs CSS** qui portent l'identité graphique :
`CEREMONIAL_STRIP` (bande cérémonielle 5 couleurs), `NDOP_LINES()` (grille textile ndop),
`RAFFIA_WEAVE()` (tressage raphia 45°), `MARKET_DOTS()` (pointillé de marché),
`CARD_BACK_PATTERN` (dos de carte), `TABLE_PATTERN`, `GLASS`.

### 3.5 Typographie, espacement, rayons, motion

- **Display** : Bricolage Grotesque (`--font-display`) — titres, marque, libellés de mode.
- **Texte** : Manrope (`--font-sans`) — tout le reste. `font-variant-numeric: tabular-nums`
  sur `body` (les compteurs de devise ne doivent pas sauter).
- Les deux sont auto-hébergées en woff2 (`app/fonts/`).

Espacement : `--nj-space-1..8` = 4 / 8 / 12 / 16 / 20 / 24 / 32 px.
Rayons : `--nj-radius-sm 10` · `md 16` · `lg 22` · `xl 28`.
Ombres : `--nj-shadow-low 0 10px 24px rgba(35,31,18,.16)` · `--nj-shadow-high 0 22px 52px rgba(35,31,18,.26)` ·
`--nj-glow-brass 0 0 28px rgba(245,195,68,.22)`.

Breakpoints : **mobile 320–599** (défaut) · **tablette ≥ 600** · **desktop ≥ 960**.
Gouttière : 16 → 24 → 28 px. Largeur max de layout : 1120 px. Cible tactile : **44 px**.
À ≥ 960 px un rail secondaire de 260–320 px apparaît (`--nj-layout-columns`).
Hauteur du dock : 64 px.

**Budgets d'animation** (aussi exportés en TS par `lib/motion.ts`) :
`press 105ms` · `interaction 180ms` · `navigation 250ms` · `panel 320ms` · `flip 620ms`.
Tout est réduit à `1ms` sous `prefers-reduced-motion`. Il existe en plus un **profil de motion
runtime** à 4 niveaux — `off` / `reduced` / `lite` / `full` — choisi automatiquement ou forcé
dans Options (Auto / Performance / Équilibré / Qualité). **Tout nouvel effet doit avoir une
version dégradée pour `lite`.**

### 3.6 Composants partagés (à réutiliser, pas à réinventer)

**Layouts** (`components/ui/`) :
| Layout | Écrans | Structure |
|---|---|---|
| `GameHubLayout` | Accueil, Jouer, Événements, Boutique, Social, Portefeuille | médaillon + kicker + titre + sous-titre, zone scrollable, rail secondaire ≥960px, dock bas. Pas de bouton retour (le dock fait office). |
| `PreGameLayout` | Bot setup, En ligne, Entre amis, Lobby | en-tête titre/sous-titre + `PreGameWorkspace` (liste bornée qui défile) + `PreGameFooter` (CTA fixes) |
| `TableLayout` | Table de jeu | `TableSurface`, `TableStatusBar`, `TableStatusMessage`, `TableTurnStatus`, `TablePowerTray`, `TableMenuButton`, `TableLiveRegion` |
| `ResultLayout` | Résultat | panneau centré + `ResultActions` (barre d'actions) |
| `Shell` / `ScreenHeader` / `Surface` | écrans secondaires (profil, options, historique, social…) | en-tête avec titre + kicker + icône + ton + bouton retour |

**Primitives** : `Btn` (tone × fill `solid|soft|outline|pattern` × size `sm|md|lg` × motif
`indigo-dots|sun-stripes|royal-bands`), `TabBar` (accessible, coloré par onglet), `Panel`,
`Chip`, `Toggle`, `ChoiceButtonGroup`, `ModeCard`, `NkapAmount`, `AuthGate` (mur de connexion),
`BottomNav`, `HubReveal` (révélation en cascade des blocs de hub).

**GamePrimitives** : `GameModeCard`, `GameCard`, `ResourcePill`, `RankBadge`, `TicketBadge`,
`StatusBanner` (neutral/success/info/warning/error), `RewardPreview`, `EmptyState`, `Skeleton`.

**Boutons `.njb`** (`globals.css` l. 726+) : classe unique, tons pilotés par variables
`--nj-btn-accent / --nj-btn-ink / --nj-btn-solid / --nj-btn-on-solid`, calibrées pour un
contraste ≥ 4,5:1. Motifs textiles générés en CSS pur, monochromes, teintés par l'accent,
posables à gauche / droite / des deux côtés. Tailles : sm 38px · md 44px · lg 54px.
Hover `translateY(-1px) brightness(1.06)` · active `translateY(1px) scale(.98)`.

### 3.7 Iconographie et assets

- **32 icônes « médaillon »** (`NjamboIcon`, images webp 2,5D) : bot, cards, check, coin, code,
  copy, crown, cut, empty, eye, friends, globe, history, home, hourglass, language, message,
  music, notification, online, play, plus, profile, search, settings, sound, spark, sparkle,
  star, trophy, users, wind. Tons de halo : gold / teal / pink / cobalt / palm / light.
- **7 icônes « friendly » SVG** pour la navigation : home, play, events, shop, social,
  notification, settings.
- **Direction artistique des assets** (`docs/art-direction.md`) : objets 2,5D peints — bois
  d'ébène sculpté, cuivre et laiton patinés, tissus camerounais géométriques, incrustations
  turquoise, lumière ambrée / bleu nuit. Silhouettes lisibles à **64 px**. Motifs abstraits,
  **aucun symbole religieux ou ethnique précis**, aucun symbole monétaire réel, aucun texte
  gravé dans l'image (le texte reste du HTML pour l'accessibilité et la traduction).
- Fonds d'écran déclinés portrait / paysage / desktop.

---

## 4. Inventaire des écrans

28 scènes, déclarées dans `SceneName` (`types/game.ts`) et câblées dans `NjamboApp.tsx:208+`.
Fichiers dans `components/scenes/`.

### 4.0 Amorçage

**`SplashScreen`** — ouverture plein écran, thème sombre. Bande cérémonielle en haut et en bas,
marque Njambo, kicker « LE JEU DU QUARTIER », titre **NJAMBO**, tagline « Kamer table — cartes,
bluff et mboko », barre de chargement + 4 points. Timeline GSAP en cascade (≈1,4 s), raccourcie
à 140–220 ms en motion réduite.

---

### 4.1 Hubs de premier niveau (dock bas à 5 entrées)

Dock : **Accueil** (gold) · **Jouer** (teal) · **Événements** (pink) · **Boutique** (gold) ·
**Social** (palm, avec badge de demandes en attente). Hauteur constante, indicateur coloré
qui glisse sur l'onglet actif.

#### `menu` — **Accueil** (`MenuScreen`)
L'écran le plus dense. De haut en bas :
1. **Pluie de cartes** décorative en fond (animée selon le profil de motion).
2. **Barre d'identité** : avatar illustré + médaille de niveau + marque de rang → ouvre le
   profil ; nom, libellé de rang, couronnes. À droite : cloche notifications (badge) et réglages.
3. **Ruban de ressources** (3 boutons → Portefeuille) : Énergie (teal, avec barre de
   progression), Nkap (gold), Cauris (pink). Affichent `—` en mode invité.
4. **Hero de jeu** plein cadre illustré : kicker « Le Ter est chaud » / « Partie en cours »,
   titre « À toi de jouer » / « La table t'attend », gros bouton **Jouer / Reprendre**
   (teal ou gold, motif indigo-dots), lien discret « Modes ».
5. **Accès rapides aux 3 modes** (cartes compactes, cadenassées en invité).
6. **Colonne activité** : carte **Événement du Ter** (visuel, pastille « En cours », compteur de
   tickets bronze, récompense finale, CTA « Voir le défi ») + carte **Rituel quotidien**
   (« Le cadeau du quartier », +100 Nkap, jauge de fidélité 7 jours, roulette).
7. Liens rapides : Classement (gold), Historique (teal), Règles (pink).

#### `play` — **Jouer** (`PlayHubScreen`)
Kicker « Choisis ton terrain » · Titre « Les tables du Mboa » · Sous-titre « Une table pour
chaque façon de jouer. » Grille de 3 `PlayModeCard` plein cadre illustrées, source unique
`lib/gameModeCatalog.ts` :

| Mode | Ton | Eyebrow | Description | Chips | Invité |
|---|---|---|---|---|---|
| **Classé en ligne** (principal) | teal | La grande table | Affronte le Mboa, fais monter ton rang et impose ton nom dans le Ter. | 10 énergie · Mise Nkap · Couronnes | ❌ |
| **Contre l'IA** | gold | Entraînement | Choisis ta difficulté et perfectionne tes combinaisons à ton rythme. | 5 énergie · Mises 100–500 · Invité accepté | ✅ |
| **Entre amis** | pink | Table privée | Crée une invitation et retrouve tes proches autour de ta propre table. | 10 énergie · Sans mise · Non classé | ❌ |

Les cartes verrouillées redirigent vers le profil (création de compte).

#### `events` — **Événements** (`EventsScreen`)
Kicker « Le Ter » · Titre « Les rendez-vous du Mboa » · Sous-titre « Entre avec ton ticket,
franchis les tables et repars avec les honneurs. » Liste de cartes événement avec visuel, titre,
dates (format `fr-FR`, fuseau Douala) et **badge d'état** : En cours (success) · Bientôt (info) ·
Terminé (warning) · Complet (warning) · Éliminé (error).

#### `event_detail` — **Détail d'un événement** (`EventDetailScreen`)
Titre et description de l'événement, ticket requis, récompenses, section **« Le parcours »**
(étapes successives du tournoi), CTA « Entrer ». États de repli : « Événement » (chargement) /
« Événement introuvable ». Modes `pve` (« Contre les gardiens ») et `pvp` (« Contre les joueurs »).

#### `EventMatchmakingOverlay` (overlay, pas une scène)
Plein écran pendant la recherche PvP : titre « Recherche d'adversaires », libellé de l'étape,
nombre de joueurs requis, thème coloré selon l'événement.

#### `shop` / `power_shop` — **Boutique** (`ShopScreen`)
Kicker « La boutique du quartier » · Titre « Équipe ton jeu » · Sous-titre « Livres, énergie et
objets du Ter — **les probabilités restent toujours visibles**. »
**4 onglets** : À la une (gold) · Livres (teal) · Grille du jour (pink) · Roulette (cobalt).
Dans « À la une », **6 catégories filtrantes** : Featured (gold) · Cauris (cobalt) · Nkap
(orange) · Énergie (teal) · Tickets (pink) · Packs (palm).
Contenu : cartes d'offre (titre, prix, CTA « Acheter » / « Choisir », mention « Paiement
simulé »), cartes de booster, **ouverture de livre** (« Ton livre est prêt — une seule carte
rejoindra ta collection. Choisis bien. »), et un **overlay de révélation de carte** :
« Nouvelle carte Pouvoir ! » / « Trésor de la grille ! » / « Carte déjà possédée ».
Rayons vides : « Ce rayon se prépare ».

#### `friends` — **Social** (`FriendsScreen`)
Titre « Le village social » · Sous-titre « Retrouve tes proches, réponds aux invitations et
rencontre de nouveaux joueurs. » **3 onglets** : Amis (palm) · Demandes (pink, badge du nombre
d'entrantes) · Joueurs (teal). Listes de cartes joueur avec avatar, nom, statut, actions.

#### `wallet` — **Portefeuille** (`WalletScreen`)
Hub secondaire. Bloc **énergie** : « Recharge naturelle » / « Ta réserve d'énergie » ou « Pass
illimité actif ». Bloc **« Journal sécurisé » / « Derniers mouvements »** avec filtres
Tout (gold) / Nkap (teal) / Cauris (cobalt) et un libellé humain par type d'opération : Bonus
quotidien, Achat dans la boutique, Ouverture d'un livre, Carte choisie, Carte de la grille du
jour, Gain de la roulette, Entrée / Sortie du Ter, Début de partie, Partie abandonnée, Résultat
de partie, Commande créée, Achat simulé confirmé, Remboursement, Solde transféré vers Njambo.
États vides : « Ton journal est encore vide » / « Historique réservé au compte permanent ».

---

### 4.2 Pré-partie (`PreGameLayout`)

#### `bot_setup` — **Contre l'IA** (`BotSetupScreen`)
Sous-titre « Règle la table puis lance une partie immédiate contre les adversaires du Mboa. »
Choix du **nombre de bots**, de la **mise**, de la **difficulté** (Facile / Normal / Difficile),
section **« Pouvoirs équipés »**. CTA de lancement en pied fixe.

#### `online_setup` — **En ligne** (`OnlineSetupScreen`)
Sous-titre « Configure ta mise, retrouve les joueurs disponibles ou rejoins une salle publique. »
Sélecteur de mise, liste **« Joueurs »** (disponibles), liste **« Salles disponibles »**,
section **« Pouvoirs équipés »**. Protégé par `AuthGate` (ton teal).

#### `friends_invite` — **Entre amis** (`FriendsSetupScreen`)
Sous-titre « Sélectionne tes invités ou partage un code pour ouvrir ta table. »
Bloc **« Configurer la table »**, liste **« Joueurs disponibles »**, partage de code.
Protégé par `AuthGate` (ton pink).

#### `lobby` — **Salle d'attente** (`LobbyScreen`)
Sous-titre « Partage le code, vérifie les présences puis lance la partie quand tout le monde est
prêt. » Bloc **« Code de la salle »** (copiable), liste **« Joueurs »** avec statut par siège :
*Hôte* / *Prêt* / *En attente…*. CTA de lancement réservé à l'hôte.

---

### 4.3 En partie

#### `table` — **La table** (`TableScreen` + `TableLayout`)
L'écran le plus complexe (~1 900 lignes). Surface ovale de tapis (thème sombre, `--nj-solar-felt`
/ `felt1-3`), motif raphia. Éléments :
- **`TableSurface`** : le tapis, avec un mode « cérémonie » pour les temps forts.
- **Sièges adverses** : avatar rond, anneau de timer, nom, solde, badge de rang, indicateurs
  d'effets de pouvoir (gel de timer, aura de protection, delta de temps flottant ±s).
- **`DeckZone`** : pioche + défausse au centre, **`DepositZone`** : zone de dépôt du pli.
- **`Fan`** : éventail de la main du joueur en bas, cartes `PlayCard` ; états visuels spéciaux —
  carte *boostée* (Éclair du Mfoundi, Pagne Changeant), *verrouillée/imposée* (Coupe-Circuit,
  Filet), *fraîchement échangée* (Vent du Nord, Marché de Nuit).
- **`TableStatusBar` / `TableStatusMessage`** : état de la manche et de la connexion (variante
  urgente).
- **`TableTurnStatus`** : indicateur de tour flottant au-dessus de l'éventail.
- **`TablePowerTray`** : barre des cartes Pouvoir équipées, avec ciblage (`PowerTargetModal`) et
  orchestration des FX (`PowerFxOrchestrator`, `PowerParticleLayer`).
- **`TableMenuButton`** : menu de partie (quitter → ton `red`).
- **`TableLiveRegion`** : annonces `aria-live` pour les lecteurs d'écran.
- Réactions de table flottantes (label + ton + détail), effets d'écran `win` / `lose`.

#### `result` — **Résultat** (`ResultScreen` + `ResultLayout`) — *overlay plein écran*
Séquence GSAP. De haut en bas :
1. **Marque Njambo** animée avec badge (trophée si victoire du joueur, couronne sinon).
2. **Titre** : « Tu gagnes ! » ou « *Nom* gagne ».
3. **Chips de condition de victoire** (raisons du gain).
4. Si victoire instantanée : **la main gagnante** en éventail (cartes 48px, rotation ±7°).
5. **`SettlementArena`** — l'arène de règlement : sièges des joueurs autour d'un pot central,
   pièces de tons variés dont la densité reflète le montant, animation de transfert vers le
   vainqueur, **bouton « ajouter en ami » directement sur chaque siège**. C'est l'arène qui
   porte le montant ; en repli (parties d'historique sans règlement) on affiche simplement
   `+ <montant> Nkap` et « Ton gain » / « Gain de *Nom* ».
6. Détail : « Pot et pénalités doublés » ou « Le pot revient au ngata ».
   Ligne optionnelle « Remboursement Cauris : + N ».
7. **`ResultActions`** : **↻ Manche suivante** (pink solid, motif royal-bands — couleur d'appel)
   et **⌂ Menu** (cobalt soft, motif indigo-dots). Libellés courts pour tenir sur une ligne
   jusqu'à 320 px, libellé complet dans `ariaLabel`.

---

### 4.4 Écrans secondaires (`Shell` + `ScreenHeader`)

Format commun : en-tête *icône + kicker + titre + bouton retour*, ton dédié.

| Scène | Titre | Kicker | Icône / ton | Contenu |
|---|---|---|---|---|
| `profile` | Mon profil | Identité joueur | profile / gold | Avatar éditable, nom, sélecteur d'emoji ; grille de stats : **Nkap, Cauris, Énergie (n/100 ou ∞), Couronnes, Parties, Victoires, Badge de rang**. Protégé par `AuthGate` (c'est aussi l'écran de création de compte). |
| `public_profile` | Profil joueur | Public | profile / gold | Fiche d'un autre joueur + actions sociales |
| `leaderboard` | Classement | Les forts du quartier | trophy / gold | Classement par couronnes |
| `history` | Historique | Dernières parties | history / pink | Liste des parties passées (rejouables vers `result`) |
| `players` | Joueurs | Découverte | search / teal | Annuaire ; sous-titre par ligne : « En ligne/Hors ligne · N parties » |
| `friend_requests` | Demandes | Amitié | friends / pink | Demandes entrantes, accepter (pink) / refuser (**red**) |
| `notifications` | Notifications | Activité | notification / pink | Liste titre + corps |
| `messages` | Messages | Discussions | message / teal | Conversations, aperçu du dernier message ou « Nouvelle conversation » |
| `chat` | *nom du contact* | Message privé | message / teal | Fil 1-to-1 + champ de saisie ; retour → Messages |
| `options` | Options | Réglages | settings / cobalt | Toggles **Musique** (« Ambiance légère de table »), **Effets sonores** (« Cartes, timer, victoire »), **Animations** (« Distribution, confettis et feedbacks ») + qualité de rendu **Auto / Performance / Équilibré / Qualité** |
| `rules` | Comment jouer | — | — | 6 cartes de règle : **But du jeu** (cards/gold), **La tendance** (spark/teal), **Dominer un tour** (crown/gold), **Victoires instantanées** (trophy/pink), **Le 3 du dernier tour** (coin/gold), **Rythme & mises** (settings/cobalt) |
| `power_collection` | Cartes Pouvoir | Ta collection | — | Collection des cartes pouvoir possédées, équipement du deck |
| `admin` | — | — | — | Régie interne (`app/admin/page.tsx`), hors périmètre design |
| `setup` | — | — | — | Écran legacy de mise, quasi mort |

---

## 5. Contraintes à respecter dans toute proposition de design

1. **Mobile-first strict.** Le design de référence est un portrait 320–599 px. Le desktop ajoute
   un rail latéral, il ne redéfinit pas la mise en page.
2. **Accessibilité non négociable.** Le texte est toujours du HTML (jamais gravé dans un asset),
   pour la traduction et les lecteurs d'écran. Cibles tactiles ≥ 44 px. Contrastes de boutons
   calibrés à 4,5:1 — les tons clairs (gold, teal, palm) prennent une encre sombre, les tons
   sombres (cobalt, blue) une encre crème, les intermédiaires (pink, red, orange) un plein
   assombri par `color-mix`.
3. **Sémantique des couleurs.** `pink` = appel principal, `red` = destructif uniquement,
   `gold` = valeur/monnaie, `teal` = jeu, `palm` = social, `pink` = événements.
4. **Chaque effet a une version dégradée.** 4 niveaux de motion (`off/reduced/lite/full`) ;
   `lite` doit conserver la *causalité* de l'animation (par ex. un fondu statique plutôt qu'un
   déplacement).
5. **Culturel.** Motifs géométriques abstraits inspirés du ndop / raphia / bamiléké. Pas de
   symbole traditionnel précis ou sacré, pas de caricature. Les motifs définitifs doivent être
   validés culturellement avant publication.
6. **Piège de spécificité connu.** Des sélecteurs comme `.homeScene` ou `.card.card` dans
   `globals.css` écrasent les classes de ton et d'état. Toute nouvelle classe de variante doit
   être vérifiée contre eux (ce piège a déjà causé deux bugs).
7. **Deux sources de vérité couleur** (§2) : `--nj-*` en CSS et `T` en TypeScript.
8. Aucun symbole monétaire réel ni marque de paiement dans les visuels (l'économie est fictive
   et les paiements sont simulés en V1).

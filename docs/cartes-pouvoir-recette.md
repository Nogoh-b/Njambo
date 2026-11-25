# Cartes pouvoir — liste de vérification en partie

Une fiche par carte : comment la déclencher, quoi regarder, puis ✅ ou ❌ avec une note.
Quand une carte est validée, coche-la aussi dans [cartes-pouvoir-suivi.md](cartes-pouvoir-suivi.md).

État de départ (25/11/2026) : les 21 cartes jouables sont publiées en base de dev et identiques au code
(Troc Ciblé est une carte de test, hors boutique).

## Préparation

- **Serveurs** : `npm run dev` lancé (Next sur :3000, backend sur :8081). Si une carte « ne fait rien », vérifier
  d'abord que le backend répond (http://localhost:8081 doit renvoyer 404, pas une erreur de connexion).
- **Mode dev** (`.env.local`) : `NEXT_PUBLIC_DEV_MODE=1`, `NEXT_PUBLIC_DEV_ALL_POWERS=1` (les 22 cartes équipées),
  `NEXT_PUBLIC_DEV_UNLIMITED_POWERS=1` (on peut rejouer une carte), `NEXT_PUBLIC_DEV_UNLIMITED_TIME=1`.
- **Animations activées** dans les réglages du jeu.
- **Vue du lanceur** : partie « Contre l'IA » à 3 joueurs. Connecté, les bots ne jouent pas de cartes pouvoir ; en
  entraînement local (invité), les bots Normal ou Difficile en jouent une par manche : pratique pour voir la vue de la
  cible, sans garantie de la carte jouée.
- **Vue des autres et de la cible** : partie « Entre amis » à 2 comptes (une fenêtre normale + une fenêtre privée
  connectée à un autre compte). Une partie à 3 humains permet de voir les trois points de vue.
- **Production** : la mise double, le bluff du Masque, l'activation secrète et la cible choisie par le jeu tournent sur
  le serveur ; il faut mettre à jour `njambo_server` sur le VPS avant de tester en ligne.

Pour chaque carte, les vues : **L** = lanceur, **C** = cible, **A** = autres joueurs.

---

## 1. Main et pioche

### Vent du Nord — ☐ ✅ ☐ ❌
Ta plus faible carte part sous la pioche, la carte du dessus la remplace. Se joue à ton tour, pioche non vide.
- [ ] L : la carte faible s'envole vers la pioche, la nouvelle arrive dans ta main et reste mise en évidence.
- [ ] A : annonce « X lève le vent », mouvement des cartes de dos.
- [ ] Pioche vide : la carte est refusée (ou « sans effet », non consommée).
Note :

### Marché de Nuit — ☐ ✅ ☐ ❌
Ta plus faible carte est remplacée par la première carte plus forte de la pioche.
- [ ] L : l'échange est visible et la nouvelle carte est vraiment plus forte.
- [ ] Aucune carte plus forte dans la pioche : « SANS EFFET », carte non consommée.
- [ ] A : annonce « X fait son marché ».
Note :

### Pacte des Mains — ☐ ✅ ☐ ❌
Tu choisis 1 à 3 cartes ; elles sont échangées contre autant de cartes au hasard de la main d'un adversaire.
- [ ] L : le choix de la cible met en évidence les mains visables, la sélection des cartes est fluide et ne cache pas la main.
- [ ] L et C : les cartes échangées traversent la table ; chacun retrouve les bonnes cartes dans sa main.
- [ ] A : annonce « X scelle un pacte avec Y », cartes de dos.
Note :

### Main du Griot — ☐ ✅ ☐ ❌
Te conseille ta meilleure carte légale pendant 6 secondes.
- [ ] L : lecture de la main, la carte conseillée porte « Conseil » et la raison.
- [ ] A : annonce « X consulte le griot », sans voir quelle carte (ni la raison).
Note :

## 2. Valeur

### Éclair du Mfoundi — ☐ ✅ ☐ ❌
Ta prochaine carte vaut +2 (max 10).
- [ ] L : la main crépite, chaque carte montre « 7 → 9 » jusqu'à ce que tu joues.
- [ ] A : badge « ⚡ +2 » sous ton avatar ; à la pose, la foudre frappe la carte.
- [ ] Le pli est bien gagné avec la valeur renforcée.
Note :

### Pagne Changeant — ☐ ✅ ☐ ❌
Ta prochaine carte hors couleur compte comme la couleur demandée. Seulement si une couleur est demandée et que tu ne l'as pas.
- [ ] Refusée si tu as la couleur demandée, ou si personne n'a encore joué.
- [ ] L : le pagne glisse sur la main, les cartes montrent « 7♣ → 7♥ ».
- [ ] A : badge « ⇄ ♥ » sous ton avatar, vague de pagne à la pose.
Note :

## 3. Restrictions

### Coupe-Circuit — ☐ ✅ ☐ ❌
La cible doit jouer sa carte légale la plus faible à son prochain tour.
- [ ] L et A : un arc électrique part de ton avatar et frappe la main de la cible ; badge sous son avatar.
- [ ] C : ses autres cartes s'éteignent, seule la carte imposée reste allumée (« Imposée »).
- [ ] C : la carte imposée est bien jouée, même si elle en choisit une autre.
Note :

### Filet du Pêcheur — ☐ ✅ ☐ ❌
La cible doit jouer sa carte légale la plus forte à son prochain tour.
- [ ] C : projecteur — la table s'assombrit, un faisceau descend sur la carte imposée, qui se lève et brille.
- [ ] A : badge sous l'avatar de la cible, sa main garde une lueur.
- [ ] C : la carte la plus forte est bien jouée.
Note :

### Sceau d'Entrave — ☐ ✅ ☐ ❌
Une carte légale de la cible est scellée (si elle a au moins deux choix).
- [ ] Tous : le sceau vole de ton avatar et frappe une carte ; chaînes et cadenas se referment dessus.
- [ ] Le cadenas reste visible tout le tour, pour tout le monde, même sur la carte de dos.
- [ ] C : la carte scellée ne peut pas être jouée (message clair si on essaie).
Note :

## 4. Temps

### Sable du Temps — ☐ ✅ ☐ ❌
La cible perd 6 secondes au début de son prochain tour.
- [ ] Tous : un sablier se retourne au-dessus de l'avatar de la cible, « −6 s ».
- [ ] C : à son tour suivant, son minuteur démarre bien 6 s plus bas.
Note :

### Cri du Chef — ☐ ✅ ☐ ❌
Si tu ouvres le pli (avant toute carte), tous tes adversaires perdent 3 secondes.
- [ ] Refusé si tu n'ouvres pas le pli.
- [ ] Tous : des ondes partent de ton avatar et frappent le minuteur de chaque adversaire, « −3 s ».
Note :

### Tambour d'Appel — ☐ ✅ ☐ ❌
+8 secondes à ton minuteur, tout de suite.
- [ ] Tous : un djembé bat trois coups près de ton avatar, le minuteur se recharge, « +8 s ».
- [ ] L : le minuteur a vraiment gagné 8 s.
Note :

## 5. Pot

### Bénédiction du Chef — ☐ ✅ ☐ ❌
Pot ×2 si tu gagnes la manche.
- [ ] Tous : un halo part de ton minuteur, vole jusqu'au pot et s'y pose ; « ×2 ».
- [ ] Tous : badge « ⭐ ×2 pour X · 750 → 1 500 » près du pot jusqu'au dernier pli.
- [ ] Tu gagnes la manche : éclat doré, le pot est bien doublé dans le résultat.
- [ ] Un autre gagne : « Bonus perdu », pot inchangé.
Note :

### Pluie d'Étoiles — ☐ ✅ ☐ ❌
+200 Nkap au pot si tu gagnes la manche.
- [ ] Tous : pluie d'or sur le pot, « +200 », badge « ⭐ +200 pour X ».
- [ ] Gagnée : +200 au pot ; perdue : « Bonus perdu ».
- [ ] Avec Bénédiction aussi : le bonus fixe s'ajoute d'abord, puis le ×2.
Note :

### Feu de Camp — ☐ ✅ ☐ ❌
+100 Nkap au pot si tu gagnes la manche.
- [ ] Tous : des bûches tombent, le feu prend devant le pot, étincelles, « +100 ».
- [ ] Tous : badge « 🔥 +100 pour X » ; issue comme Pluie d'Étoiles.
Note :

### Cauris Chanceux — ☐ ✅ ☐ ❌
50 % de ta mise remboursés si tu perds. Se joue avant le dernier pli.
- [ ] Refusé au dernier pli (« Trop tard… »).
- [ ] Tous : un cauris tombe sur ton avatar, bulle d'assurance, « Assuré » ; badge « 🐚 Assuré · 50 % si défaite ».
- [ ] Tu perds : « Remboursement Cauris : + X » à l'écran de résultat (aussi en ligne) et dans le portefeuille.
Note :

### Totem des Ancêtres — ☐ ✅ ☐ ❌
Si le dernier pli est gagné avec un 3, tu ne paies pas la mise double. Se joue avant le dernier pli.
- [ ] Sans Totem, un perdant paie une mise de plus quand le vainqueur gagne le dernier pli avec un 3 (« mise double − X »).
- [ ] Tous : un totem sort de terre à côté de ton avatar, pierres levées, « Protégé » ; badge « 🗿 Protégé de la mise double ».
- [ ] Avec Totem : « Totem des Ancêtres : mise double évitée » au résultat, solde intact.
- [ ] Refusé au dernier pli.
Note :

## 6. Défense et information

### Bouclier du Village — ☐ ✅ ☐ ❌
Bloque la prochaine carte qui te vise (Sceau, Filet, Coupe-Circuit, Sable, Œil, Pacte), jusqu'à la fin de la manche.
- [ ] Tous : un bouclier se dresse devant ton avatar puis s'ouvre en dôme ; badge « 🛡 Bouclier ».
- [ ] Attaque ciblée sur toi : la boule d'énergie s'écrase sur le dôme, qui se fissure et éclate ; « Bloqué par le Bouclier du Village de X ».
- [ ] Le Cri du Chef (qui vise tout le monde) n'est pas bloqué.
- [ ] Le bouclier tombe en fin de manche s'il n'a rien bloqué.
Note :

### Masque du Bluffeur — ☐ ✅ ☐ ❌
En secret : la prochaine lecture de ta main (Œil du Sorcier) montre une fausse main.
- [ ] L : le masque descend sur ton avatar, « Masqué » ; badge « 🎭 Masque (secret) ».
- [ ] A et futur attaquant : RIEN de visible à l'activation (ni annonce, ni badge).
- [ ] Œil du Sorcier sur toi : l'attaquant voit 5 cartes qui ne sont pas les tiennes, sans aucun signe de bluff.
- [ ] Toi et les autres : le masque réapparaît et rit ; « Ton Masque du Bluffeur a trompé X ».
- [ ] Avec Masque + Bouclier : c'est le Masque qui sert, le Bouclier reste.
Note :

### Œil du Sorcier — ☐ ✅ ☐ ❌
Tu vois la main d'un adversaire pendant 5 secondes.
- [ ] L : tu choisis la cible ; l'œil s'ouvre au-dessus de sa main et la balaie ; ses cartes viennent au centre une par une et se retournent ; « Main de X ».
- [ ] L : tu peux jouer pendant la révélation, sans perdre de temps.
- [ ] A : même œil, mêmes cartes mais de dos ; annonce « X lit la main de Y ».
- [ ] C : annonce « X lit ta main ».
Note :

---

## Bilan

| Famille | Validées | À reprendre |
|---|---|---|
| Main et pioche | | |
| Valeur | | |
| Restrictions | | |
| Temps | | |
| Pot | | |
| Défense et information | | |

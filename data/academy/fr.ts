/* Répliques de Tonton René pour l'Académie — BROUILLONS, ton à faire relire.
   Une clé par réplique, 2 lignes au plus. Les valeurs réglables sont
   insérées depuis la config de la partie (lib/academy/texts.ts) :
   {turnSeconds}, {sumBelow}, {lastTrick}… */

export const ACADEMY_TEXTS_FR = {
  /* Refus génériques, quand la scène ne prévoit pas de réplique (RefusalReason). */
  "refus.notNow": "Attends ton tour.",
  "refus.illegal": "Tu dois suivre la tendance : joue une carte de la couleur demandée.",
  "refus.locked": "Cette carte est bloquée par un pouvoir : choisis-en une autre.",
  "refus.wrongCard": "Pas cette carte : écoute bien le conseil.",
  "refus.powerFirst": "Touche d'abord ta carte Pouvoir.",
  "refus.unexpectedPower": "Pas de pouvoir pour l'instant : joue une carte.",
  "refus.wrongPower": "Pas celle-là : touche la carte Pouvoir indiquée.",
  "refus.wrongTarget": "Vise le bon adversaire.",
  "refus.wrongChoice": "Choisis les cartes indiquées.",
  "refus.powerRefused": "Ce pouvoir ne peut pas s'activer maintenant.",

  /* Chapitre 1 — Suis la tendance */
  "ch1.pli1.tendance": "Mado lance du Pique ♠ : c'est la tendance. Tu n'en as pas, tu te défausses.",
  "ch1.pli1.defausse": "Une défausse ne gagne jamais. Jette ta plus petite carte, garde les fortes.",
  "ch1.pli1.wrong9": "Doucement ! Ton 9♥ est précieux, et une défausse ne gagne pas. Jette plutôt ton 4♥.",
  "ch1.pli1.wrong": "Garde tes fortes cartes : jette ton 4♥, la plus petite.",
  "ch1.pli2.suis": "Tu as du Cœur ♥ : tu dois en jouer. La plus forte carte de la tendance gagne.",
  "ch1.pli2.wrong5": "Le 6♥ de Ya est plus fort. Ton 9♥, lui, gagne.",
  "ch1.pli2.madoDefausse": "Regarde : Mado se défausse. Elle n'a plus de Cœur, retiens-le !",
  "ch1.success": "Le pli est à toi ! Et qui gagne lance le pli suivant.",

  /* Chapitre 2 — Prends la main */
  "ch2.lance": "C'est toi qui lances : tu choisis la tendance. Choisis une couleur où elles sont faibles.",
  "ch2.hint": "Mado n'a plus de Cœur. Lance ton 5♥ !",
  "ch2.success": "Tu vois ? Même un 5 gagne quand c'est toi qui choisis la couleur.",
  "ch2.failure": "Raté : elles avaient plus fort dans cette couleur. Réessaie ce pli !",

  /* Chapitre 3 — Le 5e tour et le 3 */
  "ch3.recap": "Au 2e pli, Mado et Ya n'ont pas suivi le Trèfle : elles n'en ont plus.",
  "ch3.pli4.pourquoi": "Les {firstTricks} premiers plis ne paient rien : ils servent à prendre la main pour le dernier.",
  "ch3.pli4.gagne": "Gagne ce pli : tu lanceras le {lastTrick}e.",
  "ch3.pli5.trois": "Ton 3 est la plus petite carte du jeu… mais elles n'ont plus de Trèfle. Lance-le !",
  "ch3.success": "Ngata avec un 3 ! Chaque perdant paie une mise de plus : tes gains sont doublés.",
  "ch3.etSi.mado": "Et si Mado avait gardé un Trèfle ? Son 5♣ bat ton 3.",
  "ch3.etSi.lecon": "Le 3 est un pari. Tente-le seulement quand personne ne peut suivre ta couleur.",
  "ch3.defi.intro": "Défi : gagne le dernier pli. Regarde les dépôts : qui peut encore suivre le Trèfle ?",
  "ch3.defi.hintSafe": "Au 2e pli, personne n'a suivi le Trèfle : ton 3♣ passera. Reprends la main juste avant, avec ton 10♦.",
  "ch3.defi.hintUnsafe": "Mado a suivi le Trèfle au 1er pli : elle en a peut-être encore. Garde ton 10♦ pour la fin.",
  "ch3.defi.success": "Dernier pli gagné : le pot est à toi !",
  "ch3.defi.failure": "Le dernier pli t'a échappé. Regarde bien les dépôts, et réessaie !",

  /* Partie de fin d'Académie (A4) : coach en direct, puis bilan */
  "live.start": "Vraie donne, vraies adversaires. Si tu hésites, je t'éclaire une bonne carte.",
  "live.beforeLast": "Avant-dernier pli : gagne-le pour lancer le dernier.",
  "live.lastTrick": "Dernier pli : c'est lui qui rafle le pot !",
  "live.advice": "Tu hésites ? La carte éclairée est un bon choix.",
  "final.win": "Bravo, tu as gagné le dernier pli et le pot !",
  "final.winDouble": "Ngata avec un 3 : gagné, et doublé ! Tu as tout compris.",
  "final.lose": "Pas cette fois : le dernier pli t'a échappé. Rejoue, tu y es presque !",
  "final.instant.win.under21": "Victoire immédiate : tes {cardsPerPlayer} cartes font moins de {sumBelow}, tu gagnes sans jouer !",
  "final.instant.win.exact21": "Victoire immédiate et doublée : tes cartes font exactement {sumExact} !",
  "final.instant.win.flush": "Victoire immédiate : tes {cardsPerPlayer} cartes sont de la même couleur !",
  "final.instant.lose": "Une adversaire gagne dès la donne : ça arrive ! Rejoue pour une vraie partie.",
  "final.realGame": "En vraie partie, tu as {turnSeconds} s par tour. Si le temps finit, ta plus petite carte part toute seule.",

  /* Chapitre 4 — Les 4 gestes des pouvoirs */
  "ch4.direct.intro": "Mado lance 9♥ et tu n'as que 8♥ : tu vas perdre… sauf avec l'Éclair du Mfoundi. Touche-le !",
  "ch4.direct.wrong": "Sans éclair, ton 8♥ perd contre le 9♥. Touche d'abord l'Éclair du Mfoundi.",
  "ch4.direct.joue": "Ta main est chargée : ton 8♥ compte 10. Pose-le !",
  "ch4.direct.success": "Un pouvoir à effet direct : un toucher, et il agit.",
  "ch4.cible.intro": "Ya cache un 10♠ qui bat ton 9♠. Touche Coupe-Circuit, puis choisis Ya.",
  "ch4.cible.wrongTarget": "Pas elle : c'est Ya qui a le 10♠.",
  "ch4.cible.wrong": "Commence par Coupe-Circuit sur Ya, sinon son 10♠ gagne.",
  "ch4.cible.joue": "Ya devra jouer sa plus petite carte. Lance ton 9♠ !",
  "ch4.cible.yaForcee": "Ya est forcée : son 4♠ part à la place du 10♠.",
  "ch4.cible.success": "Un pouvoir ciblé : tu touches la carte, puis tu choisis ta cible.",
  "ch4.choix.intro": "Pas de Cœur en main, et ton 4♦ ne sert à rien. Troc Ciblé l'échange contre le dessus de la pioche.",
  "ch4.choix.wrongChoice": "Échange ton 4♦ : c'est ta carte inutile.",
  "ch4.choix.wrong": "Touche d'abord Troc Ciblé, puis choisis ton 4♦.",
  "ch4.choix.joue": "Un 10♥ ! Tu dois suivre le Cœur, et il bat le 9♥.",
  "ch4.choix.success": "Un pouvoir à choix : tu choisis tes cartes, puis tu valides.",
  "ch4.defense.intro": "Mado prépare une attaque. Lève le Bouclier du Village avant qu'elle frappe.",
  "ch4.defense.wrong": "Lève d'abord ton bouclier : Mado va t'attaquer.",
  "ch4.defense.lance": "Protégé ! Lance ton 5♦.",
  "ch4.defense.bloque": "Le Coupe-Circuit de Mado s'écrase sur ton bouclier : tu joues librement.",
  "ch4.defense.joue": "Sans bouclier, tu aurais dû jouer ton 4♠. Pose ton 9♠ !",
  "ch4.defense.success": "Une défense se pose avant l'attaque : tout l'art est dans le bon moment.",
} as const satisfies Record<string, string>;

export type AcademyTextKey = keyof typeof ACADEMY_TEXTS_FR;

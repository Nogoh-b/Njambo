# Cartes pouvoir — ajouter une carte

Une carte pouvoir = **un module déclaratif** dans ce dossier. Toute la logique
(moteur local + host Firestore) et toutes les animations sont GÉNÉRIQUES :
elles interprètent le `PowerScript` de la carte. Aucune modification de
`engine/`, des `sync/` ou de `TableScreen` n'est nécessaire.

## Les 3 étapes

1. **Ajouter le littéral** dans `PowerCardId` (`types/game.ts`).
2. **Créer `config/powers/<id>.ts`** exportant un `PowerModule` :
   - `def` : données boutique (nom, icône, rareté, coûts, textes d'activation…) ;
   - `script` : le comportement, en 5 volets (voir ci-dessous) ;
   - `dev: true` (optionnel) : carte de test, jamais en boutique.
3. **L'enregistrer** dans `index.ts` (`POWER_MODULES`). Le `satisfies
   Record<PowerCardId, PowerModule>` force l'exhaustivité : oublier l'une des
   3 étapes = erreur de compilation.

## Le schéma d'un script (engine/power/types.ts)

```ts
script: {
  id: "<id>",
  // 1. CIBLAGE : 1 joueur, plusieurs, tous les adversaires, au hasard, ou aucun
  target: { count: "one", chooser: "activator" },
  // Conditions d'activation déclaratives (deckNotEmpty, isTrickLeader…)
  conditions: [{ kind: "deckNotEmpty" }],
  steps: [
    {
      // Étape interactive : le joueur CLIQUE une carte (main, dépôt, révélation)
      choice: { id: "give", surface: "hand-self", onTimeout: "cancel" },
      // 2-5. VOLET MOTEUR : mouvements de cartes (vrai déplacement ou affichage),
      // blocages (restrictNextPlay), timers (freeze/delta), boosts virtuels,
      // pot, boucliers, économie de fin de manche.
      ops: [{ op: "moveCards", from: …, select: { kind: "chosen", choiceId: "give" }, to: …, swap: … }],
      // VOLET ANIMATION : cues rejoués par chaque client depuis activation.resolved
      // (flyCards, revealOverlay, highlightHandCard, timerFx, potFlash, avatarAura, toast…)
      anim: [{ cue: "flyCards", from: …, to: …, cards: "resolved:outgoing", mode: "move" }],
    },
  ],
}
```

- **Sélecteurs de cartes** : `weakest`, `strongest`, `bySuit`, `byValue`,
  `topOfDeck`, `bestLegal`, `chosen` (désignée par clic)…
- **`resolved:*`** : les cartes concrètes sont calculées UNE fois par le moteur
  (`interpretPowerScript`) et transportées dans l'activation — tous les clients
  animent la même chose sans recalculer.
- **FX mystiques** : chaque cue reçoit automatiquement un preset de particules
  adapté. Une carte peut le surcharger sans modifier l'orchestrateur avec
  `fx: { preset: "frost", tone: "cobalt", intensity: "spectacular" }`.
- **No-op** : si le script n'a aucun effet concret (ex. pioche défavorable),
  `resolved.impact === false` → la carte n'est **pas consommée**.
- **Interception** : un `grantShield` déclare les tags qu'il bloque
  (`targeted`, `reveal`, `restrict`, `timer_attack`) — dérivés automatiquement
  du script attaquant.

## Tester

`.env.local` : `NEXT_PUBLIC_DEV_MODE=1` + `NEXT_PUBLIC_DEV_ALL_POWERS=1`
équipent toutes les cartes (y compris `dev: true`) ;
`NEXT_PUBLIC_DEV_UNLIMITED_POWERS=1` permet de les rejouer en boucle.
Voir `troc_cible.ts` pour un exemple complet avec étape de clic.

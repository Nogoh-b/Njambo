# Direction artistique — économie Njambo

## Planche de validation (à générer avant les masters)

Format carré 2048 px, fond neutre chaud, grille lisible d'objets 2,5D peints. Univers cohérent : bois sombre sculpté, cuivre et laiton patinés, fibres et tissus camerounais géométriques, lumière mystique ambrée/bleu nuit. Aucun texte intégré aux objets, aucun symbole monétaire réel, aucune marque de paiement.

Objets à comparer sur la planche :

1. Cauri premium blanc nacré serti d'un anneau de cuivre.
2. Pièce Nkap en laiton patiné, motif de tambour abstrait.
3. Fiole/jauge d'énergie cyan et or.
4. Tickets Bronze, Argent et Or avec silhouettes distinctes.
5. Livres Normal, Rare et Exceptionnel, fermoirs de complexité croissante.
6. Roulette de fidélité en bois, laiton et tissu.
7. Sept médaillons de rang, de Braise du Quartier à Ancêtre Njambo.

Contraintes : silhouettes immédiatement distinctes à 64 px, reflets contenus, transparence propre, lisibilité sur fond sombre, pas d'iconographie religieuse ou ethnique caricaturale. Les motifs régionaux définitifs devront être validés culturellement avant publication.

## Masters après validation

Chaque objet validé sera livré en PNG transparent 1024 × 1024 puis WebP 256/128/64 px. Nommage : `public/assets/njambo/economy/<asset>-master.png` et variantes `<asset>-{size}.webp`.

Liste : `cauri`, `nkap`, `energy`, `ticket-bronze`, `ticket-argent`, `ticket-or`, `book-normal`, `book-rare`, `book-exceptionnel`, `pack-quartier`, `pack-mboa`, `pack-chefferie`, `loyalty-wheel`, puis les sept badges de rang.

## Système d'interface camerounais contemporain

Les icônes d'interface sont des médaillons 2,5D en bois d'ébène, cuivre, laiton et incrustations turquoise. Le symbole central reste universel et immédiatement lisible ; seuls le support, les matières et la lumière portent l'identité Njambo. Les motifs sont géométriques et abstraits, sans reproduction de symbole traditionnel précis ou sacré.

Les boutons utilisent cinq cadres raster 9-slice (`gold`, `teal`, `pink`, `dark`, `ghost`) et une plaque ronde pour les actions à icône seule. Le texte reste toujours du HTML afin de préserver l'accessibilité, la traduction et l'adaptation aux libellés longs.

- Planche de référence : `docs/njambo-ui-validation-board.png`.
- Masters et variantes : `public/assets/njambo/ui/`.
- Régénération : `npm run ui:generate-assets`.
- Validation technique : `npm run test:ui-assets`.

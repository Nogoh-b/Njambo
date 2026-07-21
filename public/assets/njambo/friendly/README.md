# Mboa Solaire — assets du prototype

Cette famille versionnée porte le prototype clair de l’accueil. Elle ne remplace pas les anciens assets avant validation des lots suivants.

## Palette

- Ivoire raphia : `#EAD8B3`
- Feutre olive : `#59603A`
- Vert Mboa : `#199B68`
- Rouge corail : `#E45145`
- Jaune soleil : `#F5C344`
- Encre : `#24372F`

## Exports

- `backgrounds/app-portrait.webp` : fond mobile, zone centrale calme.
- `backgrounds/app-desktop.webp` : fond paysage/desktop, zone centrale calme.
- `icons/*.svg` : glyphes fonctionnels sans médaillon sombre intégré.

## Prompts imagegen

Les deux fonds ont été créés avec le mode intégré `imagegen`, use case `stylized-concept`.

### Portrait

Fond d’application de jeu mobile africain premium, lumineux et accueillant. Toile ivoire et sable clair, géométrie textile et perles discrètes aux bords, centre calme pour l’interface. Palette 60 % ivoire, 20 % vert Mboa, 12 % jaune soleil, 8 % rouge corail. Aucun bois, décor nocturne, texte, logo, personnage, carte ou pièce.

### Desktop

Même direction en composition 16:9 : grande zone centrale ivoire peu détaillée, formes tissées et perles concentrées sur les extrémités et les coins. Lumière de jour chaleureuse, texture textile et papier mat, sans cadre fermé, bois, scène photographique, texte ni logo.

## Règles de production

- Les icônes fonctionnelles restent vectorielles et utilisent une silhouette lisible à 20 px.
- Les objets illustrés (énergie, Nkap, cauris, livres, tickets) restent en WebP 2,5D.
- Le bois est réservé aux objets prestigieux et à certains éléments de table, jamais au fond principal.
- La couleur ne doit jamais être le seul indicateur d’état.

## Table de cartes v2

- `backgrounds/card-table-portrait-v2.webp` : table mobile 9:16.
- `backgrounds/card-table-desktop-v2.webp` : table tablette/desktop 16:10.

Ces fonds ont été générés avec le mode intégré `imagegen`, use case
`stylized-concept`. Le brief impose un feutre olive silencieux sur 72 à 78 %
du centre, des enseignes de cartes et cauris embossés à faible contraste, puis
de la vannerie, des perles et des textiles uniquement sur le pourtour. Aucun
texte, logo, composant UI, personnage, main ou carte complète n’est intégré.

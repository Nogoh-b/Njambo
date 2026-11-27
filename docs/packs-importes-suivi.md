# Suivi — Import de packs de cartes Pouvoir depuis l'admin

> Fichier de **suivi**, mis à jour à **chaque avancée** : case cochée,
> statut de l'étape et une ligne dans le journal en bas de page.

**Pourquoi** : les images générées (`output/imagegen/`, environ 620 Mo de PNG)
bloquaient le push et alourdissaient le dépôt. Elles sont maintenant hors de
git ; les nouveaux packs s'importent depuis l'admin et vivent sur le serveur
d'uploads.

## État

| Étape | Contenu | Statut |
| --- | --- | --- |
| 1 | Images générées hors de git (`output/imagegen/` ignoré) | ✅ Terminé |
| 2 | Modèle des packs importés (`runtime_config/power_packs`) | ✅ Terminé |
| 3 | Serveur : commandes et import des images en 3 tailles | ✅ Terminé |
| 4 | Jeu : images des packs importés, repli sur l'illustration d'origine | ✅ Terminé |
| 5 | Admin : créer un pack, déposer les images, renommer, supprimer | 🟡 Code et tests faits, à voir avec un compte admin |
| 6 | Sortir aussi `public/assets/power-cards/packs/` de git (packs intégrés) | ⬜ Plus tard, à décider |

Légende : ⬜ à faire · 🟡 en cours · ✅ terminé · ⛔ bloqué

## Fonctionnement

- **Créer** : Admin → Cartes de pouvoir (ou Cosmétiques) → « Importer un pack de
  cartes Pouvoir » : nom, description, format (carré ou portrait 2:3). L'id est
  dérivé du nom : `import-<nom>`.
- **Déposer les images** : une image par carte intégrée, nommée comme la carte
  (`vent_nord.png`, `oeil_sorcier.webp`…), par glisser-déposer ou sélection
  multiple. Le navigateur la réduit à 1 080 px (sous la limite Nginx de 3 Mo),
  puis `POST /admin/power-pack-art` la décline en 720 / 256 / 128 px comme
  `scripts/build-power-art-packs.mjs` (recadrage, fond `#072c22`, budgets
  400 Ko / 80 Ko).
- **Stockage** : `UPLOAD_DIR/power-packs/<pack>/<carte>-<empreinte>[-256|-128].webp`,
  servi par `/uploads/` (cache immuable : chaque nouvelle image a un nouveau nom).
  Sauvegardé avec l'archive de `/www/njambo-uploads`.
- **Activer** : dans « Pack de cartes Pouvoir », comme les packs intégrés. Une
  carte sans image garde son illustration d'origine.
- **Format** : verrouillé dès la première image (elles sont recadrées pour lui).
- **Supprimer** : refusé tant que le pack est actif ; les fichiers restent sur le
  disque.

## Cases

- [x] `output/imagegen/` dans `.gitignore`, commit d'images retiré avant le push
- [x] `domain/assetPacks.ts` : packs importés, lecture validée, URL, vignettes, ids
- [x] `functions/src/powerPackCommands.ts` : `savePowerPack`, `deletePowerPack`, enregistrement des images
- [x] `saveAssetPack` accepte les packs importés (Pouvoir seulement)
- [x] `server/src/powerPackUploads.ts` : `POST /admin/power-pack-art`
- [x] Client : `useAssetPackSync` suit `runtime_config/power_packs`, cache local
- [x] Admin : `PowerPackImporter` (création, dépôt, progression, renommage, suppression)
- [x] Tests : `imported-power-packs` (6, dont le découpage sharp), `smoke-power-packs`, suite complète 437
- [ ] Essai avec un compte admin : créer un pack, importer les 21 images, l'activer en partie
- [ ] Production : redéployer le serveur (nouvelle route) ; `UPLOAD_DIR` accessible en écriture

## Journal

| Date | Étape | Avancée |
| --- | --- | --- |
| 2026-11-27 | 2–5 | Import de packs depuis l'admin écrit : modèle, commandes, route d'import (3 tailles), images dans le jeu, écran d'admin. 437 tests, `tsc` front et serveur, `eslint`, `smoke-power-packs` au vert. Pas encore essayé avec un compte admin. |
| 2026-11-27 | 1 | 279 images (622 Mo) retirées du push : commit d'images recréé sans elles, `output/imagegen/` ignoré, master poussé (`9f10477`). Ancien historique dans `backup/avant-retrait-images`. |

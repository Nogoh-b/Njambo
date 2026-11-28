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
| 7 | Compresser les packs intégrés et charger des vignettes dans le jeu | ✅ Terminé |
| 8 | Importer et exporter un ZIP, ouvrir un pack et éditer une illustration | ✅ Terminé |

Légende : ⬜ à faire · 🟡 en cours · ✅ terminé · ⛔ bloqué

## Fonctionnement

- Ouvrez « Packs de cartes » dans la régie (`/admin/packs-cartes`). Les pages « Cartes de pouvoir » et « Cosmétiques » y donnent aussi accès.
- Créez un pack vide ou importez le ZIP d’un pack Njambo. Un ZIP d’images PNG, JPEG ou WebP est également accepté si chaque fichier porte le nom d’une carte, par exemple `vent_nord.png`. L’import crée un nouveau pack.
- Ouvrez un pack pour l’activer, exporter son ZIP ou sélectionner une carte. Les packs importés permettent de remplacer une illustration et d’ajouter des images par glisser-déposer ou sélection multiple. Dupliquez un pack intégré pour modifier sa copie.
- L’archive contient le nom, la description, le format et une image par carte. À l’import, le serveur génère des WebP de 720, 256 et 128 px, plafonnés respectivement à 115, 28 et 12 Ko. L’envoi complet reste sous la limite Nginx de 3 Mo. Le jeu utilise les vignettes sur les galeries et les petits emplacements.
- Le serveur publie le pack importé une fois toutes ses illustrations validées et écrites. Les WebP sont stockés dans `UPLOAD_DIR/power-packs/` et servis par `/uploads/`. Le chemin inclut une empreinte pour le cache.
- Une carte sans illustration dans le pack actif utilise l’image d’origine. Le format du pack est verrouillé dès la première image. Pour supprimer un pack importé, activez d’abord un autre pack.

## Cases

- [x] `output/imagegen/` dans `.gitignore`, commit d'images retiré avant le push
- [x] `domain/assetPacks.ts` : packs importés, lecture validée, URL, vignettes, ids
- [x] `functions/src/powerPackCommands.ts` : `savePowerPack`, `deletePowerPack`, enregistrement des images
- [x] `saveAssetPack` accepte les packs importés (Pouvoir seulement)
- [x] `server/src/powerPackUploads.ts` : `POST /admin/power-pack-art`
- [x] Client : `useAssetPackSync` suit `runtime_config/power_packs`, cache local
- [x] Admin : `PowerPackImporter` (création, dépôt, progression, renommage, suppression)
- [x] Tests : `imported-power-packs` (6, dont le découpage sharp), `smoke-power-packs`, suite complète 437
- [x] ZIP réimportable, routes des rubriques et liens directs vers les illustrations
- [x] Vérification du poids des WebP et test HTTP de l’import et du remplacement ciblé
- [ ] Essai avec un compte admin : créer un pack, importer les 21 images, l'activer en partie
- [ ] Production : redéployer le serveur (nouvelle route) ; `UPLOAD_DIR` accessible en écriture

## Journal

| Date | Étape | Avancée |
| --- | --- | --- |
| 2026-11-28 | 7–8 | Budgets WebP diminués, vignettes utilisées dans le jeu, échange de packs en ZIP et édition d’une illustration depuis sa propre URL. |
| 2026-11-27 | 2–5 | Import de packs depuis l'admin écrit : modèle, commandes, route d'import (3 tailles), images dans le jeu, écran d'admin. 437 tests, `tsc` front et serveur, `eslint`, `smoke-power-packs` au vert. Pas encore essayé avec un compte admin. |
| 2026-11-27 | 1 | 279 images (622 Mo) retirées du push : commit d'images recréé sans elles, `output/imagegen/` ignoré, master poussé (`9f10477`). Ancien historique dans `backup/avant-retrait-images`. |

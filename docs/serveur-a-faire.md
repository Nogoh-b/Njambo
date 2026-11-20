# Serveur (VPS) — tout ce qui est à faire

> Liste **complète et ordonnée** des actions côté serveur pour mettre en
> production les deux chantiers :
> - **événements pilotés par l'admin** (`docs/evenements-plan.md`) ;
> - **cartes de pouvoir pilotées par l'admin + chargeur d'assets**
>   (`docs/cartes-pouvoir-plan.md`).
>
> Le VPS fait tourner le back avec **PM2** (process `njambo-server`, défini
> dans `ecosystem.config.js`), derrière **Nginx**, avec **PostgreSQL**.
> La procédure générale (installation, scripts) est dans
> `docs/deploiement.md` ; ce document liste ce qui **change** et coche ce
> qui doit être fait.

Hypothèses (à adapter si ton VPS diffère) : code dans `/opt/njambo`,
uploads dans `/opt/njambo-uploads`, secrets dans `/opt/njambo-secrets`,
domaine `njambo-back.bysoft-corp.com`, port interne `8081`.

---

## En bref (ordre à suivre)

| # | Action | Où | Une seule fois ? |
| --- | --- | --- | --- |
| 1 | Installer **ffmpeg** | VPS (`apt`) | oui |
| 2 | Créer / vérifier le dossier **`/opt/njambo-uploads`** | VPS | oui |
| 3 | Compléter **`server/.env`** | VPS | oui (puis à chaque nouvelle variable) |
| 4 | Mettre à jour **Nginx** (`/uploads/` : CORS + taille) | VPS | oui |
| 5 | Droit **Firebase Cloud Messaging** du compte de service | console Google Cloud | oui |
| 6 | Réglages **PM2** (rotation des logs, démarrage au boot) | VPS | oui |
| 7 | **Déployer le back** (`scripts/deploy-back.sh`) | VPS | à chaque mise à jour |
| 8 | Déployer le front (Vercel) — **après** le back | ta machine | à chaque mise à jour |
| 9 | Actions **dans l'admin** (droits, migration des cartes…) | navigateur | oui |
| 10 | **Vérifications** après déploiement | VPS + navigateur | à chaque mise à jour |
| 11 | **Sauvegardes** (base + uploads) | VPS (`cron`) | oui |

---

## 1. Installer ffmpeg

Utilisé par `POST /admin/upload-audio` pour convertir chaque son uploadé en
MP3 mono normalisé (volume homogène), coupé à 5 s. Sans ffmpeg, les sons sont
gardés tels quels : ça marche, mais les volumes et les formats ne sont pas
homogènes.

```bash
sudo apt update && sudo apt install -y ffmpeg
ffmpeg -version | head -1      # doit afficher une version
ffprobe -version | head -1     # installé avec ffmpeg, sert à mesurer la durée
```

Aucun redémarrage nécessaire : le serveur appelle `ffmpeg` à chaque upload.

- [ ] ffmpeg installé

## 2. Dossier des uploads

Images (événements, boss, cosmétiques, visuels des cartes de pouvoir) et sons
(cartes de pouvoir) envoyés depuis l'admin. Le serveur crée lui-même les
sous-dossiers (`event/`, `boss/`, `cosmetic/`, `season/`, `power/`, `audio/`).

```bash
sudo mkdir -p /opt/njambo-uploads
# Le dossier doit appartenir à l'utilisateur qui lance PM2 (pas root si PM2 tourne en utilisateur)
sudo chown -R "$USER":"$USER" /opt/njambo-uploads
ls -ld /opt/njambo-uploads
```

- [ ] Dossier créé, propriétaire = utilisateur PM2

## 3. `server/.env` — référence complète

Fichier `/opt/njambo/server/.env`, **hors git**, `chmod 600`. Il est lu par le
serveur au démarrage (`loadDotEnv` dans `server/src/index.ts`) : pas besoin
de le déclarer dans PM2. Les variables déjà présentes dans l'environnement
du process PM2 sont prioritaires sur le fichier.

```dotenv
# — Obligatoires —
DATABASE_URL=postgres://njambo:MOT_DE_PASSE_FORT@localhost:5432/njambo
GOOGLE_APPLICATION_CREDENTIALS=/opt/njambo-secrets/service-account.json
PORT=8081

# — Uploads admin (images + sons) —
UPLOAD_DIR=/opt/njambo-uploads
PUBLIC_BASE_URL=https://njambo-back.bysoft-corp.com

# — Grille du jour (boutique) : secret du tirage, longue chaîne aléatoire —
NJAMBO_GRID_SECRET=remplace-moi-par-openssl-rand-hex-32
```

| Variable | Rôle | Si absente |
| --- | --- | --- |
| `DATABASE_URL` | Base Postgres (le schéma est créé tout seul au démarrage) | le serveur bascule sur Firestore |
| `GOOGLE_APPLICATION_CREDENTIALS` | Compte de service Firebase : vérification des connexions joueurs, **notifications push** (campagnes, rappels d'événements, défis) | connexions refusées, pas de push |
| `PORT` | Port interne (Nginx y renvoie) | 8081 |
| `UPLOAD_DIR` | Dossier des fichiers uploadés | `server/uploads` (non servi par Nginx) |
| `PUBLIC_BASE_URL` | Préfixe des URL renvoyées après un upload | déduit de la requête (fragile derrière un proxy) |
| `NJAMBO_GRID_SECRET` | Rend la grille du jour imprévisible | secret par défaut, **prévisible** |
| `HOST`, `NODE_ENV` | Déjà fixés par `ecosystem.config.js` (`127.0.0.1`, `production`) | — |

**À ne JAMAIS mettre en production** (triches de développement) :
`POWERS_DEV_BYPASS=1` (pouvoirs illimités sans les posséder) et toute
variable `NEXT_PUBLIC_DEV_*`. Le script de déploiement **refuse de
déployer** s'il les trouve dans `server/.env`.

Générer le secret de la grille :

```bash
openssl rand -hex 32
```

> ⚠ `NJAMBO_GRID_SECRET` : le définir **une fois pour toutes**, idéalement
> la nuit. Le changer en cours de journée change la grille du jour des
> joueurs.

Après **toute** modification de `server/.env` :

```bash
pm2 restart njambo-server
```

`pm2 reload` suffit aussi : il redémarre le process, qui relit le fichier.

- [ ] `UPLOAD_DIR` et `PUBLIC_BASE_URL` présents
- [ ] `NJAMBO_GRID_SECRET` défini
- [ ] Aucune variable de triche (`POWERS_DEV_BYPASS`, `NEXT_PUBLIC_DEV_*`)
- [ ] `chmod 600 server/.env`

## 4. Nginx

Deux points dans `/etc/nginx/sites-available/njambo-back` (bloc complet dans
`docs/deploiement.md`) :

1. `client_max_body_size 3m;` au niveau du `server` : les uploads font
   jusqu'à 2 Mo pour une image et 500 Ko pour un son.
2. Dans `location /uploads/`, les en-têtes **CORS**. Sans eux, le front (sur
   Vercel, une autre origine) ne peut pas lire les sons uploadés en WebAudio,
   ni les précharger. Résultat : **cartes muettes à la table**.

```nginx
    location /uploads/ {
        alias /opt/njambo-uploads/;
        expires 365d;
        add_header Cache-Control "public, immutable";
        add_header X-Content-Type-Options nosniff;
        add_header Access-Control-Allow-Origin "*";
        add_header Cross-Origin-Resource-Policy cross-origin;
        try_files $uri =404;
    }
```

Appliquer :

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Vérifier (avec n'importe quel fichier déjà uploadé) :

```bash
curl -sI https://njambo-back.bysoft-corp.com/uploads/<dossier>/<fichier> | grep -iE "^HTTP|access-control|cache-control"
# Attendu : HTTP/... 200, access-control-allow-origin: *, cache-control: public, immutable
```

> Les mêmes en-têtes sont aussi envoyés par Express (`server/src/uploads.ts`)
> si Nginx laisse un jour passer `/uploads/` vers le Node.

- [ ] `client_max_body_size 3m`
- [ ] En-têtes CORS sur `/uploads/`
- [ ] `nginx -t` OK et rechargé

## 5. Firebase Cloud Messaging (notifications push)

Les notifications (campagnes de l'admin, ouverture et fin d'événement, défis
entre amis, énergie pleine) partent **du VPS** via le compte de service.

- [ ] Dans la console Google Cloud du projet Firebase → IAM : le compte de
      service de `service-account.json` a un rôle qui autorise l'envoi FCM
      (par ex. « Firebase Admin SDK Administrator Service Agent » ou
      « Firebase Cloud Messaging Admin »).
- [ ] Côté Vercel (rappel, ce n'est pas le VPS) : `NEXT_PUBLIC_FIREBASE_VAPID_KEY`
      défini, sinon les alertes restent visibles dans l'app uniquement.

Test : Admin → Notifications → campagne immédiate vers toi-même, puis
`pm2 logs njambo-server --lines 100 | grep -i -E "push|messaging|campaign"`.

## 6. PM2

### Règle n°1 : une seule instance

`ecosystem.config.js` lance **1 instance en mode `fork`**. **Ne pas** passer en
mode cluster (`instances: "max"` ou `-i`). Le serveur héberge **dans son
process** :
- les tâches planifiées (`server/src/jobs.ts`) :

  | Fréquence | Tâche |
  | --- | --- |
  | 0,5 s | coup automatique quand le minuteur de tour expire |
  | 1 min | publication programmée des événements |
  | 1 min | campagnes de notifications dues |
  | 2 min | règlement des défis entre amis |
  | 5 min | remboursement des files d'attente d'événement expirées |
  | 5 min | classements et récompenses par rang |
  | 15 min | rappel « énergie pleine » |

  À cela s'ajoute la surveillance des parties annulées, pour les rembourser ;
- le temps réel (WebSocket `/ws`) ;
- le cache du catalogue des cartes de pouvoir.

Avec 2 instances, chaque tâche tournerait deux fois : **notifications en
double**, et des récompenses ou des remboursements traités deux fois en cas
de course.

### Réglages à faire une fois

```bash
# Dossier des logs (le script de déploiement le crée aussi)
mkdir -p /opt/njambo/logs

# Rotation des logs : sinon logs/njambo-server.*.log grossit sans fin
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true

# Redémarrage automatique de PM2 au reboot du VPS
pm2 startup        # puis exécuter la commande sudo affichée
pm2 save           # mémorise la liste des process
```

### Commandes courantes

```bash
pm2 status                                  # état, redémarrages, mémoire
pm2 logs njambo-server                      # logs en direct
pm2 logs njambo-server --err --lines 200    # dernières erreurs
pm2 restart njambo-server                   # après modification de server/.env
pm2 reload ecosystem.config.js --env production --update-env   # ce que fait le script de déploiement
pm2 monit                                   # CPU / mémoire en direct
```

Le process redémarre tout seul au-delà de 768 Mo de mémoire
(`max_memory_restart`). Si `pm2 status` montre beaucoup de redémarrages,
regarder `pm2 logs njambo-server --err`.

- [ ] `pm2-logrotate` installé et réglé
- [ ] `pm2 startup` + `pm2 save` faits
- [ ] `pm2 status` : 1 seule instance `njambo-server`, `online`

## 7. Déployer le back

Le travail est sur la branche `ccr-d50eb567-ocrmnv`. Deux options :

- **recommandé** : fusionner la branche dans `master`, puis sur le VPS :
  ```bash
  cd /opt/njambo && ./scripts/deploy-back.sh
  ```
- ou déployer directement la branche (serveur de test) :
  ```bash
  cd /opt/njambo && ./scripts/deploy-back.sh ccr-d50eb567-ocrmnv
  ```

Le script :
1. **vérifie la machine** : il refuse si des triches de dev sont dans
   `server/.env`, et prévient si ffmpeg, `UPLOAD_DIR`, `PUBLIC_BASE_URL`,
   `NJAMBO_GRID_SECRET` ou le compte de service manquent ;
2. met le code à jour **en conservant ton `server/.env`**. Le dépôt contient
   aussi un `server/.env` de développement (avec `POWERS_DEV_BYPASS=1`) :
   sans cette protection, le `git reset --hard` écraserait celui du VPS ;
3. installe les dépendances et compile `functions/` et `server/`. Cela
   inclut `sharp` (conversion d'images en WebP) ;
4. recharge PM2 et vérifie `/healthz` ;
5. **revient tout seul au commit précédent** si le serveur ne répond pas.

Aucune migration de base à lancer : le schéma Postgres est créé ou complété
au démarrage, et les nouvelles données (catalogue des cartes, saisons,
cosmétiques…) sont des documents créés par l'admin.

- [ ] Back déployé, `✔ Back déployé (…)` affiché
- [ ] Puis front déployé (Vercel) — toujours **après** le back

## 8. Actions dans l'admin (après le premier déploiement)

1. Droits admin (sur le VPS), puis se déconnecter et se reconnecter :
   ```bash
   cd /opt/njambo/server && node scripts/set-admin.cjs ton.email@exemple.com
   ```
2. Admin → Outils → **« Migrer les cartes de pouvoir en base »** (une seule
   fois ; sans risque si relancé). Les 21 cartes apparaissent dans la
   section « Cartes de pouvoir ». Sans cette étape, le jeu utilise les
   cartes du code, et l'admin ne peut pas les modifier.
3. Si la base est neuve : Admin → Outils → « Installer les données de base »
   (offres, livres, événements par défaut).

- [ ] Compte admin OK
- [ ] Cartes migrées

## 9. Vérifications après déploiement

```bash
# Serveur vivant
curl -s https://njambo-back.bysoft-corp.com/healthz          # {"ok":true}
pm2 status                                                   # online, 1 instance

# Démarrage propre : backend Postgres + écoute
pm2 logs njambo-server --lines 50 --nostream | grep -E "backend Postgres|listening"

# Aucune tâche planifiée en erreur depuis le déploiement
pm2 logs njambo-server --err --lines 200 --nostream | grep -E "Impl failed|listener error" || echo "OK : aucune erreur de tâche"

# ffmpeg vu par le serveur (même utilisateur que PM2)
which ffmpeg ffprobe
```

Dans le navigateur (admin) :
- [ ] Upload d'une image (événement ou carte) → elle s'affiche.
- [ ] Upload d'un son dans une carte (champ Son → « Envoyer un son ») :
      la durée s'affiche, et le fichier dans `/opt/njambo-uploads/audio/` est
      un `.mp3` (preuve que ffmpeg a converti).
- [ ] `curl -sI …/uploads/audio/<fichier>.mp3` montre
      `access-control-allow-origin: *`.
- [ ] Une carte avec ce son, publiée puis jouée en partie : **le son se joue**.
- [ ] La recette complète est dans `docs/cartes-pouvoir-plan.md` (section
      « Recette ») et `docs/evenements-plan.md` (« Validation en
      production »).

## 10. Sauvegardes

La base **et** les uploads, ensemble : une carte ou un événement en base
pointe vers des fichiers de `/opt/njambo-uploads`.

```bash
sudo mkdir -p /opt/njambo-backups && sudo chown "$USER" /opt/njambo-backups
crontab -e
```

```cron
# 3 h 17 : base Postgres (format compressé), gardée 14 jours
17 3 * * * pg_dump "postgres://njambo:MOT_DE_PASSE_FORT@localhost:5432/njambo" -Fc -f /opt/njambo-backups/njambo-$(date +\%F).dump && find /opt/njambo-backups -name 'njambo-*.dump' -mtime +14 -delete
# 3 h 27 : images et sons uploadés, gardés 14 jours
27 3 * * * tar -czf /opt/njambo-backups/uploads-$(date +\%F).tar.gz -C /opt njambo-uploads && find /opt/njambo-backups -name 'uploads-*.tar.gz' -mtime +14 -delete
```

Copier régulièrement `/opt/njambo-backups` **hors du VPS** (rclone,
stockage objet…).

Restauration :

```bash
pg_restore --clean --if-exists -d "postgres://njambo:…@localhost:5432/njambo" /opt/njambo-backups/njambo-AAAA-MM-JJ.dump
tar -xzf /opt/njambo-backups/uploads-AAAA-MM-JJ.tar.gz -C /opt
pm2 restart njambo-server
```

- [ ] Cron de sauvegarde en place
- [ ] Copie hors du VPS

## 11. Point de vigilance : fichiers secrets suivis par git

À ce jour, le dépôt **suit** des fichiers qui devraient rester locaux :

| Fichier | Contenu | Risque |
| --- | --- | --- |
| `server/.env` | mot de passe Postgres, `POWERS_DEV_BYPASS=1` | écrasement du `.env` du VPS (désormais évité par le script) ; mot de passe visible dans l'historique |
| `server/service-account.json`, `server/njambo-firebase-adminsdk-*.json` | clés privées Firebase | accès admin complet au projet Firebase pour qui lit le dépôt |
| `.env.local` (front) | `NEXT_PUBLIC_DEV_MODE=1` et triches | lu par Next.js au **build Vercel** : triches actives en production si Vercel ne définit pas lui-même `NEXT_PUBLIC_DEV_MODE` |

Correction recommandée (à décider, voir la checklist de `docs/deploiement.md`) :
1. Sauvegarder ces fichiers hors du dépôt sur chaque machine. Retirer un
   fichier suivi **le supprime chez les autres au prochain `git pull`**.
2. `git rm --cached server/.env .env.local server/service-account.json server/njambo-firebase-adminsdk-*.json`
   et décommenter `.env*.local` et `.env` dans `.gitignore`.
3. **Renouveler** la clé Firebase et le mot de passe Postgres : ils restent
   dans l'historique git.
4. En attendant, sur Vercel : définir `NEXT_PUBLIC_DEV_MODE=0` en
   Production, pour neutraliser le `.env.local` du dépôt.

## 12. Dépannage

| Symptôme | Cause probable | Correction |
| --- | --- | --- |
| Cartes muettes à la table, mais le son marche dans l'admin | en-tête CORS absent sur `/uploads/` | § 4, puis `curl -sI` |
| Upload refusé `FILE_TOO_LARGE` alors que le fichier est petit | `client_max_body_size` Nginx | § 4 |
| Upload refusé `413` renvoyé par Nginx (page HTML) | idem | § 4 |
| Son uploadé gardé en `.wav` ou `.ogg` | ffmpeg absent pour l'utilisateur PM2 | § 1, `which ffmpeg` |
| Image uploadée en 404 | `UPLOAD_DIR` différent de l'`alias` Nginx | § 2–4 |
| URL d'upload en `http://127.0.0.1:8081/…` | `PUBLIC_BASE_URL` absent | § 3, puis `pm2 restart` |
| Notifications en double | plusieurs instances PM2 | § 6 (1 instance `fork`) |
| Aucun push reçu | droit FCM, ou VAPID absent côté Vercel | § 5 |
| Carte modifiée dans l'admin mais pas en jeu | les parties **en cours** gardent leur version ; les nouvelles parties la prennent (≤ 30 s) | normal |
| Déploiement refusé « triches de dev » | `POWERS_DEV_BYPASS` ou `NEXT_PUBLIC_DEV_*` dans `server/.env` | les retirer |
| Le déploiement revient au commit précédent | le serveur ne répond pas sur `/healthz` | `pm2 logs njambo-server --err` |

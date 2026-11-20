# Déploiement — Front (Vercel) & Back (VPS)

Le front et le back se déploient **indépendamment** :

| Partie | Code | Hébergement | Déclencheur |
| --- | --- | --- | --- |
| **Front** | racine (Next.js) | Vercel | push sur la branche de prod **ou** script ci-dessous |
| **Back** | `server/` + `functions/src/` + `domain/` + `engine/` + `config/` | VPS (Node + PM2 + PostgreSQL + Nginx) | script ci-dessous, exécuté **sur le VPS** |

> 📋 **Liste à cocher de tout ce qui est à faire sur le serveur** (ffmpeg,
> `.env`, Nginx, PM2, sauvegardes, vérifications) : **`docs/serveur-a-faire.md`**.

> **Ordre à respecter** : si une modification du front dépend d'une nouvelle
> commande / d'un changement d'API du back, **déployer le back d'abord**.
>
> Une modification de règle de jeu (`functions/src/`, `domain/`, `engine/`,
> `config/`) concerne **le back** (et souvent aussi le front, qui partage
> `domain/`, `engine/` et `config/`).

---

## 1. Front — Vercel

### Variables d'environnement (Vercel → Settings → Environment Variables)

| Variable | Valeur en production |
| --- | --- |
| `NEXT_PUBLIC_BACKEND_URL` | `https://njambo-back.bysoft-corp.com` (**jamais** `localhost`) |
| `NEXT_PUBLIC_FIREBASE_*` | valeurs du projet Firebase (voir `.env.example`) |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | clé Web Push |
| `NEXT_PUBLIC_NJ_TABLE_READABILITY_MS`, `NEXT_PUBLIC_NJ_POWER_OVERLAY_MS` | optionnel |

Les `NEXT_PUBLIC_*` sont figées **au build** : après les avoir modifiées,
il faut redéployer.

### Imports `@gxe/*`

`@gxe/react` est un **alias local** : `tsconfig.json` le redirige vers
`lib/gxe/react.tsx`, donc Vercel le résout sans dépendance externe. Si un autre
`@gxe/*` est importé un jour, il faudra l'aliaser de la même façon ou le déclarer
dans `package.json` ; le script ci-dessous le vérifie avant de déployer.

### Script : `scripts/deploy-front.sh` (à lancer depuis ta machine, à la racine du projet)

Lancer : `npm run deploy:front` (ou `npm run deploy:front -- --preview`).
Le contenu ci-dessous est une copie du fichier pour référence.

Prérequis : `npm i -g vercel` puis `vercel login` et `vercel link` (une fois).

```bash
#!/usr/bin/env bash
# Déploie le front Next.js sur Vercel (production).
# Usage : npm run deploy:front           → build local de vérification + déploiement prod
#         npm run deploy:front -- --preview → déploiement de prévisualisation
set -euo pipefail

TARGET="--prod"
[[ "${1:-}" == "--preview" ]] && TARGET=""

cd "$(git rev-parse --show-toplevel)"

echo "▶ Vérification de l'état git…"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "✖ Modifications non commitées. Commit ou stash avant de déployer." >&2
  exit 1
fi

echo "▶ Vérification des imports @gxe/*…"
# @gxe/react est un alias local (tsconfig.json → lib/gxe/react.tsx). Tout autre
# @gxe/* doit être soit aliasé dans tsconfig.json, soit déclaré dans package.json.
for pkg in $(grep -rhoE "from ['\"]@gxe/[a-z-]+" app components lib hooks contexts 2>/dev/null | sed -E "s/.*(@gxe\/[a-z-]+)/\1/" | sort -u); do
  if ! grep -q "\"$pkg\"" tsconfig.json package.json; then
    echo "✖ $pkg est importé mais ni aliasé (tsconfig.json) ni déclaré (package.json) :" >&2
    echo "  le build Vercel échouera." >&2
    exit 1
  fi
done

echo "▶ Installation des dépendances…"
npm ci

echo "▶ Lint + tests…"
npm run lint
npm test

echo "▶ Build local de vérification…"
npm run build

echo "▶ Déploiement Vercel ${TARGET:-(preview)}…"
vercel deploy $TARGET

echo "✔ Front déployé."
```

Alternative sans CLI : `git push` sur la branche de production connectée à
Vercel (onglet *Deployments* pour suivre le build).

---

## 2. Back — VPS

### Installation initiale (une seule fois)

```bash
# Node 20+, PM2, PostgreSQL, Nginx, Certbot
sudo apt update && sudo apt install -y postgresql nginx certbot python3-certbot-nginx git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm i -g pm2

# Base de données
sudo -u postgres psql -c "CREATE ROLE njambo LOGIN PASSWORD 'MOT_DE_PASSE_FORT';"
sudo -u postgres psql -c "CREATE DATABASE njambo OWNER njambo;"

# Code
sudo mkdir -p /opt/njambo && sudo chown "$USER" /opt/njambo

# Conversion des sons uploadés depuis l'admin (cartes de pouvoir) : MP3 normalisé, 5 s max.
# Recommandé : sans ffmpeg, les sons sont gardés tels quels (volumes et formats hétérogènes).
sudo apt install -y ffmpeg

# Images uploadées depuis l'admin (événements, boss, cosmétiques) — hors du dépôt
sudo mkdir -p /opt/njambo-uploads && sudo chown "$USER" /opt/njambo-uploads
git clone git@github.com:nogoh-b/njambo.git /opt/njambo
mkdir -p /opt/njambo/logs   # logs PM2 (voir ecosystem.config.js)

# Rotation des logs PM2 (sinon logs/*.log grossit sans fin)
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

Créer `/opt/njambo/server/.env` (**hors git**, `chmod 600`) :

```dotenv
DATABASE_URL=postgres://njambo:MOT_DE_PASSE_FORT@localhost:5432/njambo
GOOGLE_APPLICATION_CREDENTIALS=/opt/njambo-secrets/service-account.json
PORT=8081
# Upload admin (images + sons) : dossier de stockage + URL publique du back
UPLOAD_DIR=/opt/njambo-uploads
PUBLIC_BASE_URL=https://njambo-back.bysoft-corp.com
# Secret du tirage de la grille du jour (openssl rand -hex 32) — ne plus le changer ensuite
NJAMBO_GRID_SECRET=remplace-moi
```

Le fichier est lu par le serveur lui-même au démarrage : rien à déclarer
dans PM2. **Après chaque modification : `pm2 restart njambo-server`.**

**Interdit en production** : `POWERS_DEV_BYPASS=1` et toute variable
`NEXT_PUBLIC_DEV_*` (triches de développement). `deploy-back.sh` refuse de
déployer s'il les trouve (sauf `ALLOW_DEV_FLAGS=1`, pour un serveur de test).
Référence complète des variables : `docs/serveur-a-faire.md` § 3.

La clé de service Firebase va dans `/opt/njambo-secrets/` (hors du dépôt).
Le schéma Postgres est créé automatiquement au premier démarrage.

Nginx — `/etc/nginx/sites-available/njambo-back` :

```nginx
server {
    server_name njambo-back.bysoft-corp.com;

    # Upload admin : images 2 Mo, sons 500 Ko côté serveur, un peu de marge ici
    client_max_body_size 3m;

    # Images et sons uploadés : servis directement par Nginx (noms immuables)
    location /uploads/ {
        alias /opt/njambo-uploads/;
        expires 365d;
        add_header Cache-Control "public, immutable";
        add_header X-Content-Type-Options nosniff;
        # Sons et images lus en fetch CORS par le front (chargeur d'assets, WebAudio)
        add_header Access-Control-Allow-Origin "*";
        add_header Cross-Origin-Resource-Policy cross-origin;
        try_files $uri =404;
    }

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket temps réel
    location /ws {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/njambo-back /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d njambo-back.bysoft-corp.com
pm2 startup   # puis exécuter la commande affichée, pour relancer PM2 au reboot
```

### PM2 — une seule instance

`ecosystem.config.js` lance `njambo-server` en **1 instance, mode `fork`**.
**Ne jamais passer en cluster** (`-i max`, `instances > 1`). Les tâches
planifiées tournent **dans le process** (`server/src/jobs.ts`) :
- coup automatique au timeout ;
- publication programmée des événements ;
- campagnes de notifications ;
- défis entre amis ;
- classements ;
- remboursements ;
- rappel d'énergie.

Le temps réel (`/ws`) et le cache du catalogue des cartes y vivent aussi.
Avec 2 instances, tout serait exécuté deux fois (notifications en double,
récompenses ou remboursements traités deux fois en cas de course).

| Besoin | Commande |
| --- | --- |
| Après modification de `server/.env` | `pm2 restart njambo-server` |
| Après mise à jour du code | `./scripts/deploy-back.sh` (fait `pm2 reload` + `pm2 save`) |
| Voir les erreurs | `pm2 logs njambo-server --err --lines 200` |
| Mémoire / CPU | `pm2 monit` (redémarrage auto au-delà de 768 Mo) |
| Relance au reboot | `pm2 startup` (une fois) puis `pm2 save` |

### Donner les droits admin à un compte

La console `/admin` exige le custom claim Firebase `admin` :

```bash
cd /opt/njambo/server
node scripts/set-admin.cjs ton.email@exemple.com           # accorder
node scripts/set-admin.cjs ton.email@exemple.com --remove  # retirer
node scripts/set-admin.cjs --list                          # lister les admins
```

Le compte doit se déconnecter / reconnecter pour que le droit s'applique.

### Script : `scripts/deploy-back.sh` (à lancer **sur le VPS**)

Lancer sur le VPS : `cd /opt/njambo && ./scripts/deploy-back.sh` (ou `npm run deploy:back`).
Le contenu ci-dessous est une copie du fichier pour référence.

Le script :
1. **vérifie la machine** : il refuse si des triches de dev sont dans
   `server/.env`, et prévient si ffmpeg, `UPLOAD_DIR`, `PUBLIC_BASE_URL`,
   `NJAMBO_GRID_SECRET` ou le compte de service manquent ;
2. met à jour le code **en conservant le `server/.env` du VPS** (le fichier
   est aussi dans le dépôt avec des valeurs de dev : il est sauvegardé avant
   le `git reset --hard` puis remis, y compris en cas de retour arrière) ;
3. recompile ;
4. recharge PM2 et vérifie `/healthz` ;
5. revient automatiquement au commit précédent en cas d'échec.

Pour déployer une autre branche que `master` (serveur de test) :
`./scripts/deploy-back.sh nom-de-branche`.

```bash
#!/usr/bin/env bash
# Déploie le back (server/) sur le VPS.
# Usage : ./scripts/deploy-back.sh [branche]   (défaut : master)
set -euo pipefail

# Le script fait `git reset --hard` sur son propre dépôt : on s'exécute depuis
# une copie temporaire pour que bash ne lise pas un fichier modifié en cours.
if [[ -z "${DEPLOY_BACK_COPY:-}" && -f "$0" ]]; then
  tmp="$(mktemp)"
  cp "$0" "$tmp"
  DEPLOY_BACK_COPY=1 exec bash "$tmp" "$@"
fi

APP_DIR="${APP_DIR:-/opt/njambo}"
BRANCH="${1:-master}"
PORT="${PORT:-8081}"
HEALTH_URL="http://127.0.0.1:${PORT}/healthz"

cd "$APP_DIR"

if [[ ! -f server/.env ]]; then
  echo "✖ server/.env introuvable (DATABASE_URL, GOOGLE_APPLICATION_CREDENTIALS, PORT)." >&2
  exit 1
fi

# ── Vérifications préalables de la machine (voir docs/serveur-a-faire.md) ──
env_value() { grep -E "^\s*$1\s*=" server/.env | tail -1 | sed -E "s/^[^=]*=\s*//; s/^[\"']|[\"']\s*$//g" || true; }
warn() { echo "⚠ $*" >&2; }

echo "▶ Vérifications préalables…"
# Bloquant : triches de développement actives sur le serveur de production.
dev_mode="$(env_value NEXT_PUBLIC_DEV_MODE)"
if [[ "$(env_value POWERS_DEV_BYPASS)" == "1" || "$dev_mode" == "1" || "$dev_mode" == "true" ]]; then
  if [[ "${ALLOW_DEV_FLAGS:-}" != "1" ]]; then
    echo "✖ server/.env contient POWERS_DEV_BYPASS=1 ou NEXT_PUBLIC_DEV_MODE=1 (triches de dev)." >&2
    echo "  Retire-les, ou relance avec ALLOW_DEV_FLAGS=1 pour un serveur de test." >&2
    exit 1
  fi
  warn "Triches de dev actives (ALLOW_DEV_FLAGS=1)."
fi
[[ -n "$(env_value DATABASE_URL)" ]] || warn "DATABASE_URL absent : le serveur tournera sur Firestore, pas sur Postgres."
credentials="$(env_value GOOGLE_APPLICATION_CREDENTIALS)"
[[ -n "$credentials" && -r "$credentials" ]] || warn "GOOGLE_APPLICATION_CREDENTIALS absent ou illisible : vérification des comptes Firebase et notifications push impossibles."
upload_dir="$(env_value UPLOAD_DIR)"
if [[ -z "$upload_dir" ]]; then
  warn "UPLOAD_DIR absent : les uploads admin iront dans server/uploads (hors du dossier servi par Nginx)."
elif [[ ! -d "$upload_dir" || ! -w "$upload_dir" ]]; then
  warn "UPLOAD_DIR=$upload_dir n'existe pas ou n'est pas accessible en écriture pour $(whoami)."
fi
[[ -n "$(env_value PUBLIC_BASE_URL)" ]] || warn "PUBLIC_BASE_URL absent : les URL des fichiers uploadés seront déduites de la requête."
[[ -n "$(env_value NJAMBO_GRID_SECRET)" ]] || warn "NJAMBO_GRID_SECRET absent : la grille du jour utilise un secret par défaut (prévisible)."
command -v ffmpeg >/dev/null 2>&1 || warn "ffmpeg absent : les sons uploadés ne seront ni convertis ni normalisés (sudo apt install -y ffmpeg)."
mkdir -p logs

# server/.env est (encore) suivi par git dans le dépôt, avec des valeurs de
# développement : le `git reset --hard` l'écraserait. On garde TOUJOURS la
# version du VPS, sauvegardée ici et remise après chaque reset.
ENV_BACKUP="$(mktemp)"
cp server/.env "$ENV_BACKUP"
restore_env() {
  cp "$ENV_BACKUP" server/.env
  chmod 600 server/.env
}

PREVIOUS="$(git rev-parse HEAD)"
echo "▶ Commit actuel : ${PREVIOUS:0:7}"

echo "▶ Récupération de origin/${BRANCH}…"
git fetch origin "$BRANCH"
git checkout -q -f "$BRANCH"   # -f : server/.env local modifié (restauré juste après)
git reset --hard "origin/${BRANCH}"
restore_env
echo "▶ Nouveau commit : $(git rev-parse --short HEAD)"

build_and_reload() {
  echo "▶ Installation + build (functions/ + server/)…"
  npm run build:server
  echo "▶ Rechargement PM2…"
  if pm2 describe njambo-server >/dev/null 2>&1; then
    pm2 reload ecosystem.config.js --env production --update-env
  else
    pm2 start ecosystem.config.js --env production
  fi
  pm2 save
}

health_check() {
  echo "▶ Vérification ${HEALTH_URL}…"
  for _ in $(seq 1 15); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

if build_and_reload && health_check; then
  echo "✔ Back déployé ($(git rev-parse --short HEAD))."
else
  echo "✖ Échec du déploiement — retour à ${PREVIOUS:0:7}…" >&2
  git reset --hard "$PREVIOUS"
  restore_env
  build_and_reload
  health_check && echo "↩ Rollback OK." || echo "✖ Rollback échoué : voir pm2 logs njambo-server" >&2
  exit 1
fi
```

Pour déployer depuis ta machine sans ouvrir de session :

```bash
ssh utilisateur@ton-vps 'bash -s' -- master < scripts/deploy-back.sh
```

### Commandes utiles

```bash
pm2 status                       # état du process
pm2 logs njambo-server           # logs en direct (aussi dans /opt/njambo/logs/)
pm2 restart njambo-server        # après modification de server/.env
curl https://njambo-back.bysoft-corp.com/healthz   # doit répondre {"ok":true}
# Tâches planifiées en erreur ?
pm2 logs njambo-server --err --lines 200 --nostream | grep -E "Impl failed|listener error"
# En-têtes des fichiers uploadés (CORS indispensable pour les sons)
curl -sI https://njambo-back.bysoft-corp.com/uploads/<dossier>/<fichier> | grep -iE "^HTTP|access-control"
```

### Sauvegardes (base + uploads ensemble)

```bash
sudo mkdir -p /opt/njambo-backups && sudo chown "$USER" /opt/njambo-backups
```

```cron
# crontab -e — base à 3 h 17, uploads à 3 h 27, 14 jours gardés
17 3 * * * pg_dump "postgres://njambo:MOT_DE_PASSE_FORT@localhost:5432/njambo" -Fc -f /opt/njambo-backups/njambo-$(date +\%F).dump && find /opt/njambo-backups -name 'njambo-*.dump' -mtime +14 -delete
27 3 * * * tar -czf /opt/njambo-backups/uploads-$(date +\%F).tar.gz -C /opt njambo-uploads && find /opt/njambo-backups -name 'uploads-*.tar.gz' -mtime +14 -delete
```

Restauration et copie hors du VPS : `docs/serveur-a-faire.md` § 10.

---

## 3. Checklist avant mise en production

- [ ] Secrets **retirés du dépôt** (`server/.env`, `server/*service-account*.json`,
      `.env.local`) et clés Firebase / mot de passe Postgres **renouvelés**.
- [ ] `NEXT_PUBLIC_BACKEND_URL` de prod configurée sur Vercel.
- [ ] Rate limiting ajouté devant l'API (voir `docs/vps-migration.md`, points ouverts).
- [ ] Sauvegarde Postgres planifiée (`pg_dump` en cron).
- [ ] Sauvegarde de `/opt/njambo-uploads` (images et sons) avec la base.
- [ ] ffmpeg installé, en-têtes CORS Nginx sur `/uploads/`, `NJAMBO_GRID_SECRET` défini.
- [ ] PM2 : 1 seule instance, `pm2-logrotate`, `pm2 startup` + `pm2 save`.
- [ ] Après le 1er déploiement : Admin → Outils → « Migrer les cartes de pouvoir en base ».
- [ ] Toute la liste détaillée : `docs/serveur-a-faire.md`.

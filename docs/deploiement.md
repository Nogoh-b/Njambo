# Déploiement — Front (Vercel) & Back (VPS)

Le front et le back se déploient **indépendamment** :

| Partie | Code | Hébergement | Déclencheur |
| --- | --- | --- | --- |
| **Front** | racine (Next.js) | Vercel | push sur la branche de prod **ou** script ci-dessous |
| **Back** | `server/` + `functions/src/` + `domain/` + `engine/` + `config/` | VPS (Node + PM2 + PostgreSQL + Nginx) | script ci-dessous, exécuté **sur le VPS** |

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

### ⚠️ Dépendance `@gxe/*`

Le front importe `@gxe/...` (`components/GxeRoot.tsx`, `lib/gxeSfx.ts`, …),
qui provient d'un dépôt voisin `../gxe` lié localement et **non déclaré dans
`package.json`**. Tant que ce paquet n'est pas récupérable par Vercel
(publication npm, dépendance git, ou code copié dans ce dépôt), le build
Vercel échoue. Le script ci-dessous le détecte avant de déployer.

### Script : `scripts/deploy-front.sh` (à lancer depuis ta machine, à la racine du projet)

Lancer : `npm run deploy:front` (ou `npm run deploy:front -- --preview`).
Le contenu ci-dessous est une copie du fichier pour référence.

Prérequis : `npm i -g vercel` puis `vercel login` et `vercel link` (une fois).

```bash
#!/usr/bin/env bash
# Déploie le front Next.js sur Vercel (production).
# Usage : ./deploy-front.sh            → build local de vérification + déploiement prod
#         ./deploy-front.sh --preview  → déploiement de prévisualisation
set -euo pipefail

TARGET="--prod"
[[ "${1:-}" == "--preview" ]] && TARGET=""

cd "$(git rev-parse --show-toplevel)"

echo "▶ Vérification de l'état git…"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "✖ Modifications non commitées. Commit ou stash avant de déployer." >&2
  exit 1
fi

echo "▶ Vérification de la dépendance @gxe…"
if grep -rqE "from ['\"]@gxe/" app components lib 2>/dev/null \
   && ! grep -q '"@gxe/' package.json; then
  echo "✖ Le code importe @gxe/* mais package.json ne le déclare pas :" >&2
  echo "  le build Vercel échouera. Voir docs/deploiement.md." >&2
  exit 1
fi

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
git clone git@github.com:nogoh-b/njambo.git /opt/njambo
```

Créer `/opt/njambo/server/.env` (**hors git**, `chmod 600`) :

```dotenv
DATABASE_URL=postgres://njambo:MOT_DE_PASSE_FORT@localhost:5432/njambo
GOOGLE_APPLICATION_CREDENTIALS=/opt/njambo-secrets/service-account.json
PORT=8081
```

La clé de service Firebase va dans `/opt/njambo-secrets/` (hors du dépôt).
Le schéma Postgres est créé automatiquement au premier démarrage.

Nginx — `/etc/nginx/sites-available/njambo-back` :

```nginx
server {
    server_name njambo-back.bysoft-corp.com;

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

### Script : `scripts/deploy-back.sh` (à lancer **sur le VPS**)

Lancer sur le VPS : `cd /opt/njambo && ./scripts/deploy-back.sh` (ou `npm run deploy:back`).
Le contenu ci-dessous est une copie du fichier pour référence.

Met à jour le code, recompile, recharge PM2, vérifie `/healthz`, et revient
automatiquement au commit précédent en cas d'échec.

```bash
#!/usr/bin/env bash
# Déploie le back (server/) sur le VPS.
# Usage : ./deploy-back.sh [branche]   (défaut : master)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/njambo}"
BRANCH="${1:-master}"
PORT="${PORT:-8081}"
HEALTH_URL="http://127.0.0.1:${PORT}/healthz"

cd "$APP_DIR"

if [[ ! -f server/.env ]]; then
  echo "✖ server/.env introuvable (DATABASE_URL, GOOGLE_APPLICATION_CREDENTIALS, PORT)." >&2
  exit 1
fi

PREVIOUS="$(git rev-parse HEAD)"
echo "▶ Commit actuel : ${PREVIOUS:0:7}"

echo "▶ Récupération de origin/${BRANCH}…"
git fetch origin "$BRANCH"
git checkout -q "$BRANCH"
git reset --hard "origin/${BRANCH}"
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
curl https://njambo-back.bysoft-corp.com/healthz   # doit répondre {"ok":true}
```

---

## 3. Checklist avant mise en production

- [ ] Secrets **retirés du dépôt** (`server/.env`, `server/*service-account*.json`,
      `.env.local`) et clés Firebase / mot de passe Postgres **renouvelés**.
- [ ] Dépendance `@gxe/*` rendue récupérable par Vercel.
- [ ] `NEXT_PUBLIC_BACKEND_URL` de prod configurée sur Vercel.
- [ ] Rate limiting ajouté devant l'API (voir `docs/vps-migration.md`, points ouverts).
- [ ] Sauvegarde Postgres planifiée (`pg_dump` en cron).

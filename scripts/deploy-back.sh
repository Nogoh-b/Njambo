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
  echo "✖ server/.env introuvable (modèle : server/.env.example)." >&2
  exit 1
fi

# Secrets plus suivis par Git : ceux du VPS font foi. `git reset --hard` les
# supprimerait (commit qui les retire du suivi) ou les écraserait (retour à
# un ancien commit qui les suivait) : on les remet après chaque reset.
LOCAL_SECRETS=(server/.env server/service-account.json)
SECRETS_BACKUP="$(mktemp -d)"
trap 'rm -rf "$SECRETS_BACKUP"' EXIT
for file in "${LOCAL_SECRETS[@]}"; do
  if [[ -f "$file" ]]; then
    mkdir -p "$SECRETS_BACKUP/$(dirname "$file")"
    cp -p "$file" "$SECRETS_BACKUP/$file"
  fi
done
reset_to() {
  git reset --hard "$1"
  for file in "${LOCAL_SECRETS[@]}"; do
    if [[ -f "$SECRETS_BACKUP/$file" ]]; then mkdir -p "$(dirname "$file")" && cp -p "$SECRETS_BACKUP/$file" "$file"; fi
  done
}

PREVIOUS="$(git rev-parse HEAD)"
echo "▶ Commit actuel : ${PREVIOUS:0:7}"

echo "▶ Récupération de origin/${BRANCH}…"
git fetch origin "$BRANCH"
git checkout -q "$BRANCH"
reset_to "origin/${BRANCH}"
echo "▶ Nouveau commit : $(git rev-parse --short HEAD)"

build_and_reload() {
  echo "▶ Installation + build (functions/ + server/)…"
  npm run install:server
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
  reset_to "$PREVIOUS"
  build_and_reload
  health_check && echo "↩ Rollback OK." || echo "✖ Rollback échoué : voir pm2 logs njambo-server" >&2
  exit 1
fi

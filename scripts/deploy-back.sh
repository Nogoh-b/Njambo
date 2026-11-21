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

PREVIOUS="$(git rev-parse HEAD)"
echo "▶ Commit actuel : ${PREVIOUS:0:7}"

echo "▶ Récupération de origin/${BRANCH}…"
git fetch origin "$BRANCH"
git checkout -q "$BRANCH"
git reset --hard "origin/${BRANCH}"
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
  git reset --hard "$PREVIOUS"
  build_and_reload
  health_check && echo "↩ Rollback OK." || echo "✖ Rollback échoué : voir pm2 logs njambo-server" >&2
  exit 1
fi

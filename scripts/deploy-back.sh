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
if [[ "$(env_value POWERS_DEV_BYPASS)" == "1" || -n "$(env_value NEXT_PUBLIC_DEV_MODE)" ]]; then
  if [[ "${ALLOW_DEV_FLAGS:-}" != "1" ]]; then
    echo "✖ server/.env contient POWERS_DEV_BYPASS=1 ou NEXT_PUBLIC_DEV_MODE (triches de dev)." >&2
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

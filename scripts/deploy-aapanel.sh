#!/usr/bin/env bash
# Déploie back + front sur le VPS aaPanel (projets Node.js njambo_server et njambo_web).
# Usage (root, sur le VPS) : bash /www/wwwroot/njambo/scripts/deploy-aapanel.sh [branche]
# C'est aussi le script collé dans aaPanel → njambo_web → Git Manager → Scénario.
# Voir docs/deploiement-aapanel.md. Ne pas utiliser deploy-back.sh / PM2 sur ce serveur.
set -euo pipefail

# Le script fait `git reset --hard` sur son propre dépôt : on s'exécute depuis
# une copie temporaire pour que bash ne lise pas un fichier modifié en cours.
if [[ -z "${DEPLOY_AAPANEL_COPY:-}" && -f "$0" ]]; then
  tmp="$(mktemp)"
  cp "$0" "$tmp"
  DEPLOY_AAPANEL_COPY=1 exec bash "$tmp" "$@"
fi

APP_DIR="${APP_DIR:-/www/wwwroot/njambo}"
BRANCH="${1:-master}"
PANEL_PY=/www/server/panel/pyenv/bin/python
export PATH="/www/server/nodejs/v24.19.0/bin:$PATH"
export NEXT_TELEMETRY_DISABLED=1

cd "$APP_DIR"
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

# Redémarre un projet Node.js aaPanel (même code que le bouton « Redémarrer »).
restart_project() {
  (cd /www/server/panel && "$PANEL_PY" - "$1" <<'PY'
import os, sys
sys.path[:0] = ['/www/server/panel', 'class']
import public
from projectModel.nodejsModel import main
get = public.dict_obj()
get.project_name = sys.argv[1]
res = main().restart_project(get)
print(sys.argv[1], res)
sys.exit(0 if res.get('status') else 1)
PY
  )
}

wait_for() {
  for _ in $(seq 1 30); do
    if curl -fs -o /dev/null "$1"; then return 0; fi
    sleep 2
  done
  echo "✖ $1 ne répond pas" >&2
  return 1
}

PREVIOUS="$(git rev-parse --short HEAD)"
echo "▶ Mise à jour depuis origin/${BRANCH} (actuel : ${PREVIOUS})…"
git fetch -q origin "$BRANCH"
# Remet aussi les fichiers suivis modifiés sur le serveur (ex. package-lock.json
# supprimé par l'installation automatique d'aaPanel). Les .env, non suivis, restent.
git reset -q --hard "origin/${BRANCH}"
echo "▶ Nouveau commit : $(git rev-parse --short HEAD)"

echo "▶ Dépendances…"
npm ci --no-audit --no-fund --loglevel=error
npm run install:server --silent

echo "▶ Build du back…"
npm run build:server --silent

echo "▶ Build du front (dans .next-build, le site en ligne continue de tourner)…"
rm -rf .next-build
NEXT_DIST_DIR=.next-build npm run build --silent
git checkout -q -- tsconfig.json   # Next y ajoute les types de .next-build

chown -R www:www "$APP_DIR"

echo "▶ Redémarrage du back…"
restart_project njambo_server
wait_for http://127.0.0.1:8081/healthz

echo "▶ Bascule et redémarrage du front…"
rm -rf .next-old
[[ -d .next ]] && mv .next .next-old
mv .next-build .next
restart_project njambo_web
wait_for http://127.0.0.1:3020/
rm -rf .next-old

echo "✔ Déployé : $(git rev-parse --short HEAD) (avant : ${PREVIOUS})"

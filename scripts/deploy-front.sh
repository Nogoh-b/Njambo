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

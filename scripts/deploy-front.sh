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

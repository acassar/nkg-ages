#!/usr/bin/env bash
# Lance chaque vérification sans s'arrêter à la première erreur.
# Écrit un log par étape dans ci-out/ et un résumé dans ci-out/status.txt.
set -u
mkdir -p ci-out
: > ci-out/status.txt
failed=0

run() {
  local name="$1"
  shift
  echo "::group::$name"
  "$@" > "ci-out/$name.log" 2>&1
  local code=$?
  cat "ci-out/$name.log"
  echo "::endgroup::"
  echo "$name $code" >> ci-out/status.txt
  if [ "$code" -ne 0 ]; then failed=1; fi
}

run format pnpm format:check
run lint pnpm lint
run typecheck pnpm typecheck
run archi pnpm archi
run test pnpm test
run build pnpm build
run bench-engine pnpm bench
run e2e pnpm e2e
# Mesure de la carte : informative en CI (rendu logiciel, sans GPU).
run bench-map pnpm bench:map

cat ci-out/status.txt
exit $failed

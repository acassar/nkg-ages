# nkg-ages : règles de travail

- Langue : tout en français (code commenté, interface, commits, PR).
- Architecture : lire `docs/architecture.md`. Ne jamais faire agir l'interface ou le rendu
  directement sur le moteur : passer par une commande (`src/engine/commands.ts`) et une vue.
- Contenu (biomes, ères, ressources…) : en données dans `src/engine/content/`, pas en code.
- Aléatoire : uniquement par `createRng` (graine). Pas de `Math.random` dans le moteur.
- Tests : chaque système a ses tests ; un bug corrigé ajoute le scénario qui l'aurait attrapé.
  Utiliser fast-check pour les invariants (monde, brouillard, territoire).
- Roadmap : chaque PR met à jour `roadmap.json` (états + journal) puis `pnpm roadmap`.
- Avant de pousser : `bash ci/checks.sh` (ou au moins format, lint, typecheck, archi, test).

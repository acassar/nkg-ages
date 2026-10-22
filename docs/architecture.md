# Architecture

Principe : **un élément graphique ne modifie jamais le jeu.** Il envoie une commande au client de
jeu et affiche les vues que celui-ci lui renvoie. Seul le moteur applique les règles.

```
 commandes ↓                                                  ↑ vues
 ┌───────────────────────────────────────────────────────────────────┐
 │ ui/        Vue : panneaux, saisie. Aucune règle de jeu.           │
 │ render/    MapRenderer (WebGL2) : dessine des vues.               │
 ├───────────────────────────────────────────────────────────────────┤
 │ client/    GameClient : send(commande), subscribe(vue)            │
 ├───────────────────────────────────────────────────────────────────┤
 │ host/      Worker, horloge temps réel, publication des vues       │
 │ views/     Sélecteurs purs : état → modèles de vue                │
 ├───────────────────────────────────────────────────────────────────┤
 │ engine/    TypeScript pur : état, systèmes, contenu en données    │
 └───────────────────────────────────────────────────────────────────┘
```

## Règles (vérifiées par `pnpm archi` et par un test)

- `engine/` n'importe rien hors de lui-même : ni Vue, ni DOM, ni les autres couches.
- `views/` ne dépend que du moteur. `views/types.ts` est le contrat public des vues.
- `host/` et `client/` ignorent l'interface et le rendu.
- `render/` n'importe que `views/types.ts` : jamais le moteur, l'hôte ni le client.
- `ui/` passe par `client/` (et `views/types.ts`) : jamais le moteur, l'hôte ni les sélecteurs.
- Pas de dépendance circulaire.

## Choix

- **Commandes sérialisables** (`engine/commands.ts`) : les mêmes servent à l'interface, aux tests,
  aux futurs robots d'équilibrage et aux sauvegardes rejouables.
- **Déterminisme** : tout l'aléatoire passe par `core/random.ts` (graine). Même graine et mêmes
  commandes donnent la même partie, ce que vérifient les tests de scénario.
- **Monde continu, calcul sur grille** : le moteur raisonne sur une grille invisible
  (512 × 256 par défaut) ; le rendu la déforme et la lisse au pixel pour un monde organique.
- **Mises à jour partielles** : le moteur note les zones modifiées (brouillard, territoire),
  l'hôte n'envoie que ces rectangles, le rendu ne met à jour que ces morceaux de texture.
- **Rendu sans bibliothèque** : un seul shader WebGL2 dessine relief, côtes, courbes de niveau,
  brouillard et frontières. Le contrat `MapRenderer` permet d'en changer (PixiJS, etc.).
- **Dépendances injectées** : le temps (`host/scheduler.ts`) est injecté, l'hôte se teste sans
  attendre ; le client en mémoire remplace le Worker dans les tests.

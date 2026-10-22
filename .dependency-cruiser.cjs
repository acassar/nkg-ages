/**
 * Frontières de l'architecture (voir docs/architecture.md).
 * Chaque couche ne connaît que celle du dessous ; une violation fait échouer la CI.
 */
module.exports = {
  forbidden: [
    {
      name: 'moteur-pur',
      comment:
        'Le moteur est du TypeScript pur : il ne connaît ni les autres couches, ni Vue, ni le DOM.',
      severity: 'error',
      from: { path: '^src/engine' },
      to: { pathNot: '^src/engine' },
    },
    {
      name: 'vues-sur-moteur',
      comment: 'Les sélecteurs de vue ne dépendent que du moteur.',
      severity: 'error',
      from: { path: '^src/views' },
      to: { pathNot: '^src/(views|engine)' },
    },
    {
      name: 'hote-sans-interface',
      comment: "L'hôte fait tourner le moteur ; il ignore l'interface et le rendu.",
      severity: 'error',
      from: { path: '^src/host' },
      to: { path: '^src/(ui|render|client)|node_modules/(vue|pinia)' },
    },
    {
      name: 'client-sans-interface',
      comment: "Le client de jeu ignore l'interface et le rendu.",
      severity: 'error',
      from: { path: '^src/client' },
      to: { path: '^src/(ui|render)|node_modules/(vue|pinia)' },
    },
    {
      name: 'rendu-sans-moteur',
      comment: 'Le rendu dessine des vues ; il ne touche jamais le moteur ni l’hôte.',
      severity: 'error',
      from: { path: '^src/render' },
      to: { path: '^src/(engine|host|ui|client)|^src/views/(?!types)|node_modules/(vue|pinia)' },
    },
    {
      name: 'interface-sans-moteur',
      comment:
        "L'interface passe par le client de jeu : jamais d'import du moteur, de l'hôte ni des sélecteurs.",
      severity: 'error',
      from: { path: '^src/ui' },
      to: { path: '^src/(engine|host)|^src/views/(?!types)' },
    },
    {
      name: 'pas-de-cycle',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { extensions: ['.ts', '.vue', '.js'] },
  },
}

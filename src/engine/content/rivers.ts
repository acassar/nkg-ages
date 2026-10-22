/** Fleuves : données pures. */
export const RIVER_RULES = {
  /** Pluie reçue par une cellule sèche et par une cellule très humide (unités de débit). */
  rainDry: 0.2,
  rainWet: 1.6,
  /** Débit à partir duquel l'eau forme un fleuve visible. */
  threshold: 90,
  /** Débit (en multiples du seuil) d'un fleuve à pleine largeur. */
  fullFlow: 40,
  /** Nourriture en plus sur une cellule de fleuve (berges fertiles, pêche). */
  food: 0.35,
  /** Coût de déplacement en plus pour traverser ou longer un fleuve (gué). */
  crossCost: 1.5,
} as const

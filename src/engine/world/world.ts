/** Monde généré : champs continus échantillonnés sur une grille fine. */
export interface World {
  seed: string
  width: number
  height: number
  /** Altitude par cellule, dans [-1, 1] ; négatif = eau. */
  elevation: Float32Array
  /** Humidité dans [0, 1]. */
  moisture: Float32Array
  /** Température dans [0, 1]. */
  temperature: Float32Array
  /** Identifiant de biome par cellule (voir content/biomes). */
  biome: Uint8Array
}

export function cellIndex(world: Pick<World, 'width'>, x: number, y: number): number {
  return y * world.width + x
}

export function inBounds(world: Pick<World, 'width' | 'height'>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < world.width && y < world.height
}

/** Biome sous un point continu (coordonnées en cellules). */
export function biomeAt(world: World, x: number, y: number): number | undefined {
  const cx = Math.floor(x)
  const cy = Math.floor(y)
  if (!inBounds(world, cx, cy)) return undefined
  return world.biome[cellIndex(world, cx, cy)]
}

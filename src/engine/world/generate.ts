import { Biome, type BiomeId } from '../content/biomes'
import { createRng } from '../core/random'
import { createNoise2D, fbm } from './noise'
import { traceRivers } from './rivers'
import type { World } from './world'

export interface WorldOptions {
  seed: string
  width?: number
  height?: number
  /** Part des terres émergées, entre 0 et 1. */
  landRatio?: number
}

export const DEFAULT_WORLD_WIDTH = 512
export const DEFAULT_WORLD_HEIGHT = 256
export const DEFAULT_LAND_RATIO = 0.38

/**
 * Génère un monde organique : continents par bruit déformé, climat par latitude,
 * altitude et humidité, puis biomes. Déterministe pour une graine donnée.
 */
export function generateWorld(options: WorldOptions): World {
  const width = options.width ?? DEFAULT_WORLD_WIDTH
  const height = options.height ?? DEFAULT_WORLD_HEIGHT
  const landRatio = options.landRatio ?? DEFAULT_LAND_RATIO
  const rng = createRng(`monde:${options.seed}`)
  const relief = createNoise2D(rng.fork('relief'))
  const warp = createNoise2D(rng.fork('deformation'))
  const humid = createNoise2D(rng.fork('humidite'))
  const heat = createNoise2D(rng.fork('chaleur'))

  const size = width * height
  const raw = new Float32Array(size)
  // Échelle : un continent fait environ un tiers de la largeur.
  const scale = 3.2 / width
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x * scale
      const ny = y * scale
      const wx = nx + 0.6 * fbm(warp, nx + 11.3, ny - 7.1, 3)
      const wy = ny + 0.6 * fbm(warp, nx - 3.7, ny + 5.9, 3)
      let e = fbm(relief, wx, wy, 6)
      // Les bords du monde plongent dans l'océan.
      const dx = Math.min(x, width - 1 - x) / (width * 0.12)
      const dy = Math.min(y, height - 1 - y) / (height * 0.12)
      const edge = Math.min(1, dx, dy)
      e = e * 0.85 + 0.15 - (1 - edge) * (1 - edge) * 1.2
      raw[y * width + x] = e
    }
  }

  const seaLevel = quantile(raw, 1 - landRatio)
  let maxAbove = 1e-6
  let maxBelow = 1e-6
  for (let i = 0; i < size; i++) {
    const d = raw[i]! - seaLevel
    if (d > maxAbove) maxAbove = d
    if (-d > maxBelow) maxBelow = -d
  }
  const elevation = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    const d = raw[i]! - seaLevel
    // Terres : on garde une courbe douce pour avoir plus de plaines que de sommets.
    elevation[i] = d >= 0 ? Math.pow(d / maxAbove, 1.35) : d / maxBelow
  }

  const moisture = new Float32Array(size)
  const temperature = new Float32Array(size)
  const biome = new Uint8Array(size)
  const mscale = 4.5 / width
  for (let y = 0; y < height; y++) {
    const latitude = Math.abs((y + 0.5) / height - 0.5) * 2
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const e = elevation[i]!
      const m = clamp01(0.5 + 0.55 * fbm(humid, x * mscale, y * mscale, 4))
      const t = clamp01(
        1.05 -
          latitude * 1.05 -
          Math.max(0, e) * 0.55 +
          0.12 * fbm(heat, x * mscale, y * mscale, 3),
      )
      moisture[i] = m
      temperature[i] = t
      biome[i] = classify(e, m, t)
    }
  }

  const river = traceRivers(width, height, elevation, moisture, biome)
  return { seed: options.seed, width, height, elevation, moisture, temperature, biome, river }
}

export function classify(elevation: number, moisture: number, temperature: number): BiomeId {
  if (elevation < -0.12) return Biome.DeepOcean
  if (elevation < 0) return Biome.Ocean
  if (temperature < 0.12) return Biome.Ice
  if (elevation > 0.6) return Biome.Mountain
  if (temperature < 0.28) return Biome.Tundra
  if (elevation > 0.36) return Biome.Hills
  if (moisture < 0.32 && temperature > 0.5) return Biome.Desert
  if (moisture > 0.62 && temperature > 0.72) return Biome.Jungle
  if (moisture > 0.52) return Biome.Forest
  return Biome.Plain
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Quantile approché par échantillonnage régulier (rapide et déterministe). */
function quantile(values: Float32Array, q: number): number {
  const step = Math.max(1, Math.floor(values.length / 20000))
  const sample: number[] = []
  for (let i = 0; i < values.length; i += step) sample.push(values[i]!)
  sample.sort((a, b) => a - b)
  return sample[Math.min(sample.length - 1, Math.floor(q * sample.length))]!
}

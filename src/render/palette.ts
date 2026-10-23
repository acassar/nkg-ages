import { BIOME_IDS, type RankLetter } from '@/views/types'

/** Palette « carte d'explorateur » : encres et lavis d'aquarelle. Couleurs RVB 0..1. */
export type Rgb = readonly [number, number, number]

const hex = (value: string): Rgb => {
  const n = parseInt(value.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export const BIOME_COLORS: Readonly<Record<number, Rgb>> = {
  [BIOME_IDS.DeepOcean]: hex('#7d9ea0'),
  [BIOME_IDS.Ocean]: hex('#a9c3bb'),
  [BIOME_IDS.Plain]: hex('#cfc98f'),
  [BIOME_IDS.Forest]: hex('#93a86c'),
  [BIOME_IDS.Jungle]: hex('#6f9460'),
  [BIOME_IDS.Hills]: hex('#bfa874'),
  [BIOME_IDS.Mountain]: hex('#a39482'),
  [BIOME_IDS.Desert]: hex('#e2cd94'),
  [BIOME_IDS.Tundra]: hex('#c4c2a8'),
  [BIOME_IDS.Ice]: hex('#efede4'),
}

export const PAPER = hex('#eee2c4')
export const INK = hex('#3a2c1e')
export const PLAYER_INK = hex('#8c2f1c')
/** Encre des peuples voisins : un bleu d'ardoise, bien distinct du rouge du joueur. */
export const RIVAL_INK = hex('#2f4a6b')

/**
 * Couleurs des rangs de rareté, sur l'échelle que les joueurs connaissent déjà :
 * gris, vert, bleu, violet, orange, or. Assez saturées pour se distinguer d'un coup d'œil.
 */
export const RANK_COLORS: Readonly<Record<RankLetter, Rgb>> = {
  E: hex('#8c8a82'),
  D: hex('#4e8a3a'),
  C: hex('#2f6fae'),
  B: hex('#7a45b0'),
  A: hex('#d06a1c'),
  S: hex('#e3b31b'),
}

/** Luminance relative (WCAG) d'une couleur. */
export function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Encre lisible sur un fond : le papier sur un fond sombre, l'encre sur un fond clair. */
export function inkOn(background: Rgb): Rgb {
  const contrast = (a: Rgb) => {
    const [hi, lo] = [luminance(a), luminance(background)].sort((x, y) => y - x)
    return (hi! + 0.05) / (lo! + 0.05)
  }
  return contrast(PAPER) >= contrast(INK) ? PAPER : INK
}

export function cssColor(rgb: Rgb, alpha = 1): string {
  const [r, g, b] = rgb.map((c) => Math.round(c * 255))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Palette à plat pour le shader (10 biomes × 3 composantes). */
export function paletteArray(): Float32Array {
  const out = new Float32Array(10 * 3)
  for (let i = 0; i < 10; i++) out.set(BIOME_COLORS[i] ?? PAPER, i * 3)
  return out
}

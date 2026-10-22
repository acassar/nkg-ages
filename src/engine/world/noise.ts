import type { Rng } from '../core/random'

/** Bruit simplex 2D (S. Gustavson), à permutation tirée d'une graine. */
export type Noise2D = (x: number, y: number) => number

const F2 = 0.5 * (Math.sqrt(3) - 1)
const G2 = (3 - Math.sqrt(3)) / 6
const GRADIENTS = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

export function createNoise2D(rng: Rng): Noise2D {
  const base = new Uint8Array(256)
  for (let i = 0; i < 256; i++) base[i] = i
  for (let i = 255; i > 0; i--) {
    const j = rng.int(0, i)
    const tmp = base[i]!
    base[i] = base[j]!
    base[j] = tmp
  }
  const perm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255]!

  const corner = (gi: number, x: number, y: number): number => {
    const t = 0.5 - x * x - y * y
    if (t < 0) return 0
    const g = GRADIENTS[gi & 7]!
    const t2 = t * t
    return t2 * t2 * (g[0] * x + g[1] * y)
  }

  return (xin, yin) => {
    const s = (xin + yin) * F2
    const i = Math.floor(xin + s)
    const j = Math.floor(yin + s)
    const t = (i + j) * G2
    const x0 = xin - (i - t)
    const y0 = yin - (j - t)
    const i1 = x0 > y0 ? 1 : 0
    const j1 = x0 > y0 ? 0 : 1
    const x1 = x0 - i1 + G2
    const y1 = y0 - j1 + G2
    const x2 = x0 - 1 + 2 * G2
    const y2 = y0 - 1 + 2 * G2
    const ii = i & 255
    const jj = j & 255
    const n0 = corner(perm[ii + perm[jj]!]!, x0, y0)
    const n1 = corner(perm[ii + i1 + perm[jj + j1]!]!, x1, y1)
    const n2 = corner(perm[ii + 1 + perm[jj + 1]!]!, x2, y2)
    // Ramène à peu près dans [-1, 1].
    return 70 * (n0 + n1 + n2)
  }
}

/** Somme d'octaves de bruit (fBm), dans [-1, 1] environ. */
export function fbm(noise: Noise2D, x: number, y: number, octaves: number, gain = 0.5): number {
  let amplitude = 1
  let frequency = 1
  let sum = 0
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += amplitude * noise(x * frequency, y * frequency)
    norm += amplitude
    amplitude *= gain
    frequency *= 2
  }
  return sum / norm
}

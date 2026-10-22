import { isWater } from '../content/biomes'
import { RIVER_RULES } from '../content/rivers'

const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/**
 * Trace les fleuves d'un monde. Inondation par priorité depuis la mer : chaque terre reçoit
 * pour exutoire la cellule d'où l'eau l'a atteinte, si bien que toute terre s'écoule jusqu'à
 * la mer, cuvettes comprises. On cumule ensuite la pluie de l'amont vers l'aval ; un fleuve
 * coule là où le débit dépasse le seuil. Voisinage à 4 : le tracé reste continu.
 *
 * Renvoie la force de chaque cellule : 0 sans fleuve, sinon 1..255 selon le débit.
 */
export function traceRivers(
  width: number,
  height: number,
  elevation: Float32Array,
  moisture: Float32Array,
  biome: Uint8Array,
  rules = RIVER_RULES,
): Uint8Array {
  const size = width * height
  const downstream = new Int32Array(size).fill(-1)
  const order = new Int32Array(size)
  let ordered = 0
  const done = new Uint8Array(size)
  const heap = new MinHeap(size)
  for (let i = 0; i < size; i++) {
    const x = i % width
    const y = (i - x) / width
    const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1
    if (isWater(biome[i]!) || edge) {
      done[i] = 1
      heap.push(i, isWater(biome[i]!) ? -Infinity : elevation[i]!)
    }
  }
  // Du plus bas au plus haut : l'ordre de sortie va de l'aval vers l'amont.
  while (heap.size > 0) {
    const [i, level] = heap.pop()
    if (!isWater(biome[i]!)) order[ordered++] = i
    const x = i % width
    const y = (i - x) / width
    for (const [dx, dy] of STEPS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const n = ny * width + nx
      if (done[n]) continue
      done[n] = 1
      downstream[n] = i
      // Une cuvette se remplit jusqu'au niveau de son déversoir.
      heap.push(n, Math.max(level, elevation[n]!))
    }
  }

  const flow = new Float32Array(size)
  for (let k = 0; k < ordered; k++) {
    const i = order[k]!
    flow[i] = rules.rainDry + (rules.rainWet - rules.rainDry) * moisture[i]!
  }
  for (let k = ordered - 1; k >= 0; k--) {
    const i = order[k]!
    const d = downstream[i]!
    if (d >= 0 && !isWater(biome[d]!)) flow[d] = flow[d]! + flow[i]!
  }

  const river = new Uint8Array(size)
  const span = Math.log(rules.fullFlow)
  for (let i = 0; i < size; i++) {
    if (isWater(biome[i]!) || flow[i]! < rules.threshold) continue
    const strength = Math.min(1, Math.log(flow[i]! / rules.threshold) / span)
    river[i] = 1 + Math.round(strength * 254)
  }
  return river
}

/** Tas binaire de cellules, rangées par niveau croissant (à égalité : ordre d'entrée). */
class MinHeap {
  private readonly ids: Int32Array
  private readonly keys: Float64Array
  private readonly seq: Float64Array
  private count = 0
  private next = 0

  constructor(capacity: number) {
    this.ids = new Int32Array(capacity)
    this.keys = new Float64Array(capacity)
    this.seq = new Float64Array(capacity)
  }

  get size(): number {
    return this.count
  }

  push(id: number, key: number): void {
    let k = this.count++
    this.ids[k] = id
    this.keys[k] = key
    this.seq[k] = this.next++
    while (k > 0) {
      const parent = (k - 1) >> 1
      if (!this.less(k, parent)) break
      this.swap(k, parent)
      k = parent
    }
  }

  pop(): [number, number] {
    const top: [number, number] = [this.ids[0]!, this.keys[0]!]
    this.count--
    if (this.count > 0) {
      this.ids[0] = this.ids[this.count]!
      this.keys[0] = this.keys[this.count]!
      this.seq[0] = this.seq[this.count]!
      let k = 0
      for (;;) {
        const l = 2 * k + 1
        const r = l + 1
        let m = k
        if (l < this.count && this.less(l, m)) m = l
        if (r < this.count && this.less(r, m)) m = r
        if (m === k) break
        this.swap(k, m)
        k = m
      }
    }
    return top
  }

  private less(a: number, b: number): boolean {
    const ka = this.keys[a]!
    const kb = this.keys[b]!
    return ka < kb || (ka === kb && this.seq[a]! < this.seq[b]!)
  }

  private swap(a: number, b: number): void {
    ;[this.ids[a], this.ids[b]] = [this.ids[b]!, this.ids[a]!]
    ;[this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!]
    ;[this.seq[a], this.seq[b]] = [this.seq[b]!, this.seq[a]!]
  }
}

import type { GridPatch } from '@/views/types'

/** Conversion des grilles de vue en octets de texture (0..255). */

/** Brouillard : 0 inconnu, 1 déjà vu, 2 visible → 0, 128, 255. */
export function fogToTexels(patch: GridPatch): Uint8Array {
  const out = new Uint8Array(patch.data.length)
  for (let i = 0; i < out.length; i++) {
    const v = patch.data[i]!
    out[i] = v === 2 ? 255 : v === 1 ? 128 : 0
  }
  return out
}

/**
 * Fleuves : 0 hors fleuve, de 150 (filet) à 255 (grand fleuve) dessus. Filtrée en linéaire,
 * la texture dessine un trait continu dont la largeur suit le débit.
 */
export function riverTexels(river: Uint8Array): Uint8Array {
  const out = new Uint8Array(river.length)
  for (let i = 0; i < out.length; i++) {
    const v = river[i]!
    out[i] = v === 0 ? 0 : 150 + Math.round((v / 255) * 105)
  }
  return out
}

/** Territoire : 255 où le propriétaire est `owner`. */
/** Terres de tous les peuples voisins (propriétaires au-delà du joueur), en un seul masque. */
export function rivalMask(patch: GridPatch, player: number): Uint8Array {
  const out = new Uint8Array(patch.data.length)
  for (let i = 0; i < out.length; i++) out[i] = patch.data[i]! > player ? 255 : 0
  return out
}

export function ownerMask(patch: GridPatch, owner: number): Uint8Array {
  const out = new Uint8Array(patch.data.length)
  for (let i = 0; i < out.length; i++) out[i] = patch.data[i] === owner ? 255 : 0
  return out
}

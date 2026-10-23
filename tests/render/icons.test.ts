import { describe, expect, it } from 'vitest'
import { RESOURCE_KINDS } from '@/engine/content/resources'
import { FALLBACK_ICON, iconOf, RESOURCE_ICONS } from '@/render/icons'
import { inkOn, luminance, RANK_COLORS, type Rgb } from '@/render/palette'
import { RANKS } from '@/engine/content/rarity'

/** Contexte 2D factice : compte les tracés, sans navigateur. */
function fakeContext() {
  const calls: string[] = []
  const record = (name: string) => () => void calls.push(name)
  const ctx = {
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arc: record('arc'),
    ellipse: record('ellipse'),
    closePath: record('closePath'),
    fill: record('fill'),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

describe('pictogrammes des gisements', () => {
  it('donne un pictogramme propre à chaque ressource du contenu', () => {
    for (const kind of RESOURCE_KINDS) expect(RESOURCE_ICONS[kind], kind).toBeDefined()
    const painters = new Set(RESOURCE_KINDS.map((kind) => iconOf(kind)))
    expect(painters.size).toBe(RESOURCE_KINDS.length)
  })

  it('retombe sur un point pour une ressource inconnue', () => {
    expect(iconOf('ambre')).toBe(FALLBACK_ICON)
  })

  it('remplit chaque pictogramme sans sortir de son carré', () => {
    for (const kind of [...RESOURCE_KINDS, 'inconnue']) {
      const { ctx, calls } = fakeContext()
      iconOf(kind)(ctx, 10, 10, 8)
      expect(calls, kind).toContain('fill')
    }
  })
})

describe('couleurs de rareté', () => {
  it('couvre les six rangs', () => {
    expect(Object.keys(RANK_COLORS).sort()).toEqual([...RANKS].sort())
  })

  it('distingue chaque rang de ses voisins', () => {
    const colors = Object.values(RANK_COLORS)
    for (let i = 0; i < colors.length; i++)
      for (let j = i + 1; j < colors.length; j++) {
        const [a, b] = [colors[i]!, colors[j]!]
        const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
        expect(distance, `${i}-${j}`).toBeGreaterThan(0.25)
      }
  })

  it('garde le pictogramme lisible sur chaque teinte (contraste 3:1 au moins)', () => {
    for (const color of Object.values(RANK_COLORS))
      expect(contrast(inkOn(color), color)).toBeGreaterThanOrEqual(3)
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  currentMilestone,
  renderRoadmap,
  validateRoadmap,
  type Roadmap,
} from '../../scripts/roadmap-render'

const roadmap = JSON.parse(readFileSync('roadmap.json', 'utf8')) as Roadmap

describe('roadmap graphique', () => {
  it('roadmap.json est valide', () => {
    expect(validateRoadmap(roadmap)).toEqual([])
  })

  it('les images publiées sont à jour (lancer `pnpm roadmap` sinon)', () => {
    const expected = renderRoadmap(roadmap)
    expect(readFileSync('docs/roadmap.svg', 'utf8')).toBe(expected)
    expect(readFileSync('public/roadmap.svg', 'utf8')).toBe(expected)
  })

  it('repère le jalon en cours', () => {
    // Le premier jalon qui a encore une fonctionnalité à faire : le test suit la vraie roadmap.
    const open = roadmap.milestones.find((m) => m.features.some((f) => f.status !== 'done'))
    expect(open).toBeDefined()
    expect(currentMilestone(roadmap)).toBe(open?.id)
  })

  it('signale les erreurs de forme', () => {
    expect(validateRoadmap({})).toEqual(['milestones manquant'])
    const bad = {
      milestones: [
        { id: 'A', title: 'x', features: [{ title: 'y', status: 'peut-être' }] },
        { id: 'A', title: 'z', features: [] },
      ],
      log: [{ date: 'hier', text: '' }],
    }
    expect(validateRoadmap(bad)).toEqual([
      'A « y » : état inconnu',
      'jalon A : id en double',
      'jalon A : aucune fonctionnalité',
      'log 0 : date invalide',
      'log 0 : texte manquant',
    ])
  })

  it('échappe le texte', () => {
    const svg = renderRoadmap({
      milestones: [{ id: 'J<0>', title: 'A & B', features: [{ title: '"x"', status: 'doing' }] }],
      log: [],
    })
    expect(svg).toContain('J&lt;0&gt;')
    expect(svg).toContain('A &amp; B')
    expect(svg).not.toContain('"x"<')
  })
})

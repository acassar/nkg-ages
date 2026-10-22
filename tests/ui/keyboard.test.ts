import { describe, expect, it } from 'vitest'
import { intentOf } from '@/ui/keyboard'

describe('raccourcis clavier', () => {
  it('Espace met en pause', () => expect(intentOf('Space')).toEqual({ kind: 'togglePause' }))
  it.each([1, 2, 3, 4, 5])('la touche %i règle la vitesse', (n) => {
    expect(intentOf(`Digit${n}`)).toEqual({ kind: 'speed', speed: n })
    expect(intentOf(`Numpad${n}`)).toEqual({ kind: 'speed', speed: n })
  })
  it('ZQSD (touches physiques WASD) et flèches déplacent la carte', () => {
    expect(intentOf('KeyW')).toEqual({ kind: 'pan', dx: 0, dy: -1 })
    expect(intentOf('KeyA')).toEqual({ kind: 'pan', dx: -1, dy: 0 })
    expect(intentOf('ArrowRight')).toEqual({ kind: 'pan', dx: 1, dy: 0 })
  })
  it('ignore les autres touches', () => {
    expect(intentOf('Digit6')).toBeNull()
    expect(intentOf('KeyX')).toBeNull()
  })
})

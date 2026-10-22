import { describe, expect, it } from 'vitest'
import { depositAt, describeDeposit } from '@/ui/deposits'
import type { DepositView } from '@/views/types'

const camera = { cx: 10, cy: 10, zoom: 10, viewWidth: 200, viewHeight: 200 }
const deposit = (patch: Partial<DepositView>): DepositView => ({
  id: 1,
  kind: 'baies',
  name: 'Baies',
  category: 'food',
  x: 10.5,
  y: 10.5,
  rank: 'B',
  held: true,
  yield: 6.6,
  ...patch,
})

describe('infobulle des gisements', () => {
  it('désigne le gisement le plus proche du pointeur, s’il est assez près', () => {
    const a = deposit({ id: 1 })
    const b = deposit({ id: 2, x: 11, y: 10.5 })
    // (10.5, 10.5) est à l'écran en (105, 105) ; (11, 10.5) en (110, 105).
    expect(depositAt([a, b], camera, 104, 105)?.id).toBe(1)
    expect(depositAt([a, b], camera, 109, 105)?.id).toBe(2)
    expect(depositAt([a, b], camera, 150, 150)).toBeNull()
    expect(depositAt([], camera, 105, 105)).toBeNull()
  })

  it('décrit nature, rang, rendement et exploitation', () => {
    expect(describeDeposit(deposit({}))).toBe(
      'Baies · rang B · 6,6 rations/mois · exploité par la tribu',
    )
    expect(
      describeDeposit(
        deposit({ name: 'Silex', category: 'material', rank: 'S', yield: 2.25, held: false }),
      ),
    ).toBe('Silex · rang S · 2,3 unités/mois · hors du territoire')
  })
})

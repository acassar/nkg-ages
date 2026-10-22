import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  centerOn,
  clampCamera,
  MAX_ZOOM,
  minZoom,
  pan,
  screenToWorld,
  worldToScreen,
  zoomAt,
  type Camera,
} from '@/render/camera'

const world = { width: 512, height: 256 }
const cam: Camera = { cx: 256, cy: 128, zoom: 4, viewWidth: 1200, viewHeight: 800 }

describe('caméra', () => {
  it('convertit écran et monde dans les deux sens', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1200, noNaN: true }),
        fc.double({ min: 0, max: 800, noNaN: true }),
        (sx, sy) => {
          const w = screenToWorld(cam, sx, sy)
          const s = worldToScreen(cam, w.x, w.y)
          expect(s.x).toBeCloseTo(sx, 6)
          expect(s.y).toBeCloseTo(sy, 6)
        },
      ),
    )
  })

  it('garde fixe le point sous le curseur en zoomant', () => {
    const before = screenToWorld(cam, 300, 200)
    const zoomed = zoomAt(cam, world, 300, 200, 1.5)
    const after = screenToWorld(zoomed, 300, 200)
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
  })

  it('borne le zoom', () => {
    expect(zoomAt(cam, world, 0, 0, 1000).zoom).toBe(MAX_ZOOM)
    expect(zoomAt(cam, world, 0, 0, 0.0001).zoom).toBeCloseTo(minZoom(cam, world))
  })

  it('reste dans le monde', () => {
    const far = pan(cam, world, 1e6, -1e6)
    expect(far.cx).toBe(0)
    expect(far.cy).toBe(world.height)
    expect(clampCamera({ ...cam, cx: -5, cy: 999 }, world)).toMatchObject({ cx: 0, cy: 256 })
  })

  it('glisser déplace la carte dans le sens de la souris', () => {
    const moved = pan(cam, world, 40, 0)
    expect(moved.cx).toBeCloseTo(cam.cx - 10)
  })

  it('se centre sur un point', () => {
    expect(centerOn(cam, world, 10, 20)).toMatchObject({ cx: 10, cy: 20 })
  })
})

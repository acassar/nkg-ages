import { worldToScreen, type Camera } from './camera'
import type { OverlayState } from './MapRenderer'
import { cssColor, INK, PAPER, PLAYER_INK } from './palette'

/** Pions et campements, dessinés à l'encre sur un calque 2D au-dessus du terrain. */
export class OverlayPainter {
  private readonly ctx: CanvasRenderingContext2D
  private pixelRatio = 1

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D indisponible')
    this.ctx = ctx
  }

  resize(cssWidth: number, cssHeight: number, pixelRatio: number): void {
    this.pixelRatio = pixelRatio
    this.canvas.width = Math.max(1, Math.round(cssWidth * pixelRatio))
    this.canvas.height = Math.max(1, Math.round(cssHeight * pixelRatio))
  }

  paint(camera: Camera, state: OverlayState): void {
    const { ctx } = this
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0)
    ctx.clearRect(0, 0, camera.viewWidth, camera.viewHeight)
    const ink = cssColor(INK)
    const red = cssColor(PLAYER_INK)
    const paper = cssColor(PAPER)

    for (const camp of state.camps) {
      const p = worldToScreen(camera, camp.x, camp.y)
      const s = 9
      ctx.beginPath()
      ctx.moveTo(p.x, p.y - s)
      ctx.lineTo(p.x + s, p.y + s * 0.7)
      ctx.lineTo(p.x - s, p.y + s * 0.7)
      ctx.closePath()
      ctx.fillStyle = paper
      ctx.fill()
      ctx.lineWidth = 1.6
      ctx.strokeStyle = camp.mine ? red : ink
      ctx.stroke()
    }

    for (const unit of state.units) {
      const p = worldToScreen(camera, unit.x, unit.y)
      const selected = state.selected.has(unit.id)
      if (unit.target && selected) {
        const t = worldToScreen(camera, unit.target.x, unit.target.y)
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = cssColor(INK, 0.7)
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(t.x, t.y)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.arc(t.x, t.y, 3, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
      ctx.fillStyle = paper
      ctx.fill()
      ctx.lineWidth = selected ? 2.4 : 1.4
      ctx.strokeStyle = selected ? red : ink
      ctx.stroke()
      // Petit fanion : l'éclaireur.
      ctx.beginPath()
      ctx.moveTo(p.x, p.y - 6)
      ctx.lineTo(p.x, p.y - 15)
      ctx.lineTo(p.x + 7, p.y - 12)
      ctx.lineTo(p.x, p.y - 9)
      ctx.strokeStyle = ink
      ctx.lineWidth = 1.2
      ctx.stroke()
    }
  }
}

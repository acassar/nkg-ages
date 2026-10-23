import { worldToScreen, type Camera } from './camera'
import type { OverlayState } from './MapRenderer'
import { cssColor, INK, PAPER, PLAYER_INK, RANK_COLORS, RIVAL_INK } from './palette'

/** En deçà de ce zoom (pixels par cellule), les gisements encombreraient la carte. */
const DEPOSIT_MIN_ZOOM = 2.5

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
    const rival = cssColor(RIVAL_INK)

    if (camera.zoom >= DEPOSIT_MIN_ZOOM) this.paintDeposits(camera, state, red)

    this.paintHerds(camera, state)

    for (const camp of state.camps) {
      const p = worldToScreen(camera, camp.x, camp.y)
      ctx.beginPath()
      if (camp.village) {
        // Village : une maison (toit sur un carré), plus grande qu'une tente ; cité : plus encore.
        const s = camp.city ? 14 : 10
        ctx.moveTo(p.x, p.y - s * 1.1)
        ctx.lineTo(p.x + s, p.y - s * 0.2)
        ctx.lineTo(p.x + s * 0.75, p.y - s * 0.2)
        ctx.lineTo(p.x + s * 0.75, p.y + s * 0.8)
        ctx.lineTo(p.x - s * 0.75, p.y + s * 0.8)
        ctx.lineTo(p.x - s * 0.75, p.y - s * 0.2)
        ctx.lineTo(p.x - s, p.y - s * 0.2)
      } else {
        const s = 9
        ctx.moveTo(p.x, p.y - s)
        ctx.lineTo(p.x + s, p.y + s * 0.7)
        ctx.lineTo(p.x - s, p.y + s * 0.7)
      }
      ctx.closePath()
      ctx.fillStyle = paper
      ctx.fill()
      ctx.lineWidth = 1.6
      ctx.strokeStyle = camp.mine ? red : rival
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
        for (const point of unit.path) {
          const q = worldToScreen(camera, point.x, point.y)
          ctx.lineTo(q.x, q.y)
        }
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
      ctx.beginPath()
      if (unit.kind === 'chasseur') {
        // Une lance en travers : le chasseur.
        ctx.moveTo(p.x - 5, p.y + 9)
        ctx.lineTo(p.x + 8, p.y - 14)
        ctx.moveTo(p.x + 8, p.y - 14)
        ctx.lineTo(p.x + 4, p.y - 12)
        ctx.moveTo(p.x + 8, p.y - 14)
        ctx.lineTo(p.x + 8, p.y - 9.5)
      } else {
        // Petit fanion : l'éclaireur.
        ctx.moveTo(p.x, p.y - 6)
        ctx.lineTo(p.x, p.y - 15)
        ctx.lineTo(p.x + 7, p.y - 12)
        ctx.lineTo(p.x, p.y - 9)
      }
      ctx.strokeStyle = ink
      ctx.lineWidth = 1.2
      ctx.stroke()
    }
  }

  /** Troupeaux : quelques traces de bêtes à l'encre brune, et leur nombre. */
  private paintHerds(camera: Camera, state: OverlayState): void {
    const { ctx } = this
    ctx.font = 'bold 11px Georgia, serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const brown = cssColor(INK, 0.85)
    for (const herd of state.herds) {
      const p = worldToScreen(camera, herd.x, herd.y)
      if (p.x < -20 || p.y < -20 || p.x > camera.viewWidth + 20 || p.y > camera.viewHeight + 20)
        continue
      const shown = Math.min(herd.size, 4)
      for (let i = 0; i < shown; i++) {
        const ox = ((i % 2) - 0.5) * 7
        const oy = (Math.floor(i / 2) - 0.5) * 6
        ctx.beginPath()
        ctx.ellipse(p.x + ox, p.y + oy, 3.2, 2, 0, 0, Math.PI * 2)
        ctx.fillStyle = brown
        ctx.fill()
      }
      ctx.fillStyle = brown
      ctx.fillText(String(herd.size), p.x + 9, p.y)
    }
  }

  /** Gisements : rond pour la nourriture, losange pour un matériau, lettre du rang. */
  private paintDeposits(camera: Camera, state: OverlayState, red: string): void {
    const { ctx } = this
    const r = Math.min(7, Math.max(4, camera.zoom * 0.9))
    ctx.font = `bold ${Math.round(r * 1.25)}px Georgia, serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const d of state.deposits) {
      const p = worldToScreen(camera, d.x, d.y)
      if (p.x < -r || p.y < -r || p.x > camera.viewWidth + r || p.y > camera.viewHeight + r)
        continue
      ctx.beginPath()
      if (d.category === 'food') ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      else {
        ctx.moveTo(p.x, p.y - r * 1.2)
        ctx.lineTo(p.x + r * 1.2, p.y)
        ctx.lineTo(p.x, p.y + r * 1.2)
        ctx.lineTo(p.x - r * 1.2, p.y)
        ctx.closePath()
      }
      ctx.fillStyle = cssColor(RANK_COLORS[d.rank], 0.9)
      ctx.fill()
      ctx.lineWidth = d.held ? 2 : 1
      ctx.strokeStyle = d.held ? red : cssColor(INK, 0.8)
      ctx.stroke()
      ctx.fillStyle = cssColor(PAPER)
      ctx.fillText(d.rank, p.x, p.y + 0.5)
    }
  }
}

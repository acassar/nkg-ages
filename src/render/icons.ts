/**
 * Pictogrammes des gisements, tracés à l'encre dans un carré de demi-côté `s` centré sur (x, y).
 * Un pictogramme par ressource : la forme dit ce que c'est, la couleur du fond dit la rareté.
 */
export type IconPainter = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number) => void

/** Trois baies et une feuille. */
const baies: IconPainter = (ctx, x, y, s) => {
  const r = s * 0.32
  ctx.beginPath()
  for (const [dx, dy] of [
    [-0.38, 0.28],
    [0.38, 0.28],
    [0, -0.2],
  ] as const) {
    ctx.moveTo(x + dx * s + r, y + dy * s)
    ctx.arc(x + dx * s, y + dy * s, r, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(x + s * 0.45, y - s * 0.6, s * 0.32, s * 0.14, -0.6, 0, Math.PI * 2)
  ctx.fill()
}

/** Un poisson : corps en amande, queue en V. */
const poisson: IconPainter = (ctx, x, y, s) => {
  ctx.beginPath()
  ctx.ellipse(x - s * 0.15, y, s * 0.6, s * 0.34, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x + s * 0.35, y)
  ctx.lineTo(x + s * 0.85, y - s * 0.38)
  ctx.lineTo(x + s * 0.85, y + s * 0.38)
  ctx.closePath()
  ctx.fill()
}

/** Un éclat de silex taillé : pointe anguleuse. */
const silex: IconPainter = (ctx, x, y, s) => {
  ctx.beginPath()
  ctx.moveTo(x, y - s * 0.85)
  ctx.lineTo(x + s * 0.48, y - s * 0.1)
  ctx.lineTo(x + s * 0.28, y + s * 0.75)
  ctx.lineTo(x - s * 0.3, y + s * 0.7)
  ctx.lineTo(x - s * 0.5, y - s * 0.05)
  ctx.closePath()
  ctx.fill()
}

/** Une pépite de cuivre : bloc trapu à six pans. */
const cuivre: IconPainter = (ctx, x, y, s) => {
  ctx.beginPath()
  ctx.moveTo(x - s * 0.65, y + s * 0.15)
  ctx.lineTo(x - s * 0.3, y - s * 0.55)
  ctx.lineTo(x + s * 0.4, y - s * 0.5)
  ctx.lineTo(x + s * 0.7, y + s * 0.1)
  ctx.lineTo(x + s * 0.3, y + s * 0.6)
  ctx.lineTo(x - s * 0.4, y + s * 0.55)
  ctx.closePath()
  ctx.fill()
}

/** Un lingot d'étain : trapèze couché. */
const etain: IconPainter = (ctx, x, y, s) => {
  ctx.beginPath()
  ctx.moveTo(x - s * 0.45, y - s * 0.35)
  ctx.lineTo(x + s * 0.45, y - s * 0.35)
  ctx.lineTo(x + s * 0.75, y + s * 0.4)
  ctx.lineTo(x - s * 0.75, y + s * 0.4)
  ctx.closePath()
  ctx.fill()
}

/** Ressource sans pictogramme : un simple point, pour ne jamais rien perdre de vue. */
export const FALLBACK_ICON: IconPainter = (ctx, x, y, s) => {
  ctx.beginPath()
  ctx.arc(x, y, s * 0.35, 0, Math.PI * 2)
  ctx.fill()
}

/** Pictogrammes par identifiant de ressource (`DepositView.kind`). */
export const RESOURCE_ICONS: Readonly<Record<string, IconPainter>> = {
  baies,
  poisson,
  silex,
  cuivre,
  etain,
}

export function iconOf(kind: string): IconPainter {
  return RESOURCE_ICONS[kind] ?? FALLBACK_ICON
}

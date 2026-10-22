/**
 * Rendu SVG de la roadmap, au style « carte d'explorateur ».
 * Fonction pure : la même roadmap donne toujours le même fichier.
 */
export type Status = 'todo' | 'doing' | 'done'

export interface Roadmap {
  milestones: {
    id: string
    title: string
    features: { title: string; status: Status; pr?: string }[]
  }[]
  log: { date: string; text: string }[]
}

const STATUSES: readonly Status[] = ['todo', 'doing', 'done']

/** Vérifie la forme de roadmap.json ; renvoie la liste des problèmes. */
export function validateRoadmap(data: unknown): string[] {
  const problems: string[] = []
  const r = data as Partial<Roadmap>
  if (!Array.isArray(r?.milestones) || r.milestones.length === 0) return ['milestones manquant']
  const ids = new Set<string>()
  r.milestones.forEach((m, i) => {
    if (!m.id || !m.title) problems.push(`jalon ${i} : id ou titre manquant`)
    if (ids.has(m.id)) problems.push(`jalon ${m.id} : id en double`)
    ids.add(m.id)
    if (!Array.isArray(m.features) || m.features.length === 0)
      problems.push(`jalon ${m.id} : aucune fonctionnalité`)
    m.features?.forEach((f, j) => {
      if (!f.title) problems.push(`jalon ${m.id}, fonctionnalité ${j} : titre manquant`)
      if (!STATUSES.includes(f.status)) problems.push(`${m.id} « ${f.title} » : état inconnu`)
    })
  })
  if (!Array.isArray(r.log)) problems.push('log manquant')
  r.log?.forEach((e, i) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) problems.push(`log ${i} : date invalide`)
    if (!e.text) problems.push(`log ${i} : texte manquant`)
  })
  return problems
}

/** Jalon en cours : le premier qui n'est pas entièrement fait. */
export function currentMilestone(roadmap: Roadmap): string | null {
  return roadmap.milestones.find((m) => m.features.some((f) => f.status !== 'done'))?.id ?? null
}

const C = {
  paper: '#eee2c4',
  paperEdge: '#c9b283',
  ink: '#3a2c1e',
  soft: '#6b5843',
  red: '#8c2f1c',
  wash: '#e6d6b0',
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const WIDTH = 960
const PAD = 24
const GAP = 16
const COLS = 3
const CARD_W = (WIDTH - 2 * PAD - (COLS - 1) * GAP) / COLS
const LINE = 21

function marker(status: Status, x: number, y: number): string {
  if (status === 'done') return `<circle cx="${x}" cy="${y}" r="5" fill="${C.ink}"/>`
  if (status === 'doing')
    return `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="${C.red}" stroke-width="1.5"/><path d="M${x} ${y - 5}a5 5 0 0 1 0 10z" fill="${C.red}"/>`
  return `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="${C.soft}" stroke-width="1.3"/>`
}

export function renderRoadmap(roadmap: Roadmap): string {
  const current = currentMilestone(roadmap)
  const parts: string[] = []
  let y = PAD
  parts.push(
    `<text x="${PAD}" y="${y + 26}" font-size="28" fill="${C.ink}">nkg-ages · roadmap</text>`,
  )
  const done = roadmap.milestones.flatMap((m) => m.features).filter((f) => f.status === 'done')
  const total = roadmap.milestones.flatMap((m) => m.features).length
  parts.push(
    `<text x="${WIDTH - PAD}" y="${y + 24}" font-size="15" text-anchor="end" fill="${C.soft}">${done.length} / ${total} fonctionnalités livrées${current ? ` · en cours : ${escape(current)}` : ''}</text>`,
  )
  y += 48

  for (let row = 0; row * COLS < roadmap.milestones.length; row++) {
    const items = roadmap.milestones.slice(row * COLS, row * COLS + COLS)
    const rows = Math.max(...items.map((m) => m.features.length))
    const h = 48 + rows * LINE + 10
    items.forEach((m, i) => {
      const x = PAD + i * (CARD_W + GAP)
      const isCurrent = m.id === current
      const complete = m.features.every((f) => f.status === 'done')
      const stroke = isCurrent ? C.red : C.ink
      parts.push(
        `<g><rect x="${x}" y="${y}" width="${CARD_W}" height="${h}" rx="6" fill="${complete ? C.wash : C.paper}" stroke="${stroke}" stroke-width="${isCurrent ? 2.2 : 1.2}"/>`,
        `<text x="${x + 16}" y="${y + 30}" font-size="19" fill="${C.ink}"><tspan fill="${isCurrent ? C.red : C.soft}">${escape(m.id)}</tspan> · ${escape(m.title)}</text>`,
      )
      m.features.forEach((f, j) => {
        const fy = y + 54 + j * LINE
        const color = f.status === 'todo' ? C.soft : C.ink
        parts.push(
          marker(f.status, x + 22, fy - 4),
          `<text x="${x + 36}" y="${fy}" font-size="14" fill="${color}">${escape(f.title)}</text>`,
        )
      })
      parts.push('</g>')
    })
    y += h + GAP
  }

  const log = [...roadmap.log].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
  if (log.length > 0) {
    y += 6
    parts.push(
      `<text x="${PAD}" y="${y + 14}" font-size="13" letter-spacing="1.5" fill="${C.soft}">JOURNAL</text>`,
    )
    y += 24
    for (const entry of log) {
      parts.push(
        `<text x="${PAD}" y="${y + 14}" font-size="14" fill="${C.ink}"><tspan fill="${C.soft}">${escape(entry.date)}</tspan>  ${escape(entry.text)}</text>`,
      )
      y += LINE
    }
  }
  y += PAD - 4

  const legend = [
    marker('done', WIDTH - PAD - 236, y - 18),
    `<text x="${WIDTH - PAD - 226}" y="${y - 14}" font-size="12" fill="${C.soft}">fait</text>`,
    marker('doing', WIDTH - PAD - 176, y - 18),
    `<text x="${WIDTH - PAD - 166}" y="${y - 14}" font-size="12" fill="${C.soft}">en cours</text>`,
    marker('todo', WIDTH - PAD - 96, y - 18),
    `<text x="${WIDTH - PAD - 86}" y="${y - 14}" font-size="12" fill="${C.soft}">à faire</text>`,
  ]
  const height = y + 8
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" font-family="Georgia, 'Iowan Old Style', serif" role="img" aria-label="Roadmap de nkg-ages">`,
    `<rect width="${WIDTH}" height="${height}" rx="10" fill="${C.paper}" stroke="${C.paperEdge}"/>`,
    ...parts,
    ...legend,
    '</svg>',
    '',
  ].join('\n')
}

import {
  BAND_RULES,
  bandAbundance,
  bandsOf,
  campEfficiency,
  cannotStart,
  foodCapacity,
  INVENTION_KINDS,
  PLAYER,
  RELATION_RULES,
  seasonOf,
  type GameState,
} from '@/engine'
import type { AlertView } from './types'

/** Seuils des alertes : réglages d'affichage, pas des règles de jeu. */
export const ALERT_RULES = {
  /** En deçà de tant de mois de vivres (à ce rythme), la réserve inquiète. */
  lowFoodMonths: 3,
  /** Mois d'hiver que la réserve doit couvrir quand l'automne finit. */
  winterMonths: 3,
  /** Rations gâtées en un mois au-delà desquelles on prévient. */
  spoiledWorth: 5,
} as const

/**
 * Ce qui demande l'attention du joueur maintenant, du plus grave au plus anodin.
 * Chaque système ajoute les siennes ici ; l'interface n'en connaît que la forme.
 */
export function alertsOf(state: GameState): AlertView[] {
  const alerts: AlertView[] = []
  const { tribe } = state
  const home = state.camps.find((c) => c.owner === PLAYER) ?? null
  const at = (p: { x: number; y: number } | null) => (p ? { x: p.x, y: p.y } : null)

  if (tribe.starvingMonths > 0)
    alerts.push({
      id: 'famine',
      level: 'danger',
      text: 'Famine : la tribu perd des siens chaque mois',
      target: at(home),
    })
  else {
    const balance =
      tribe.lastProduction + tribe.lastCrops - tribe.lastConsumption - tribe.lastSpoiled
    const months = balance < 0 ? tribe.food / -balance : Infinity
    if (months < ALERT_RULES.lowFoodMonths)
      alerts.push({
        id: 'vivres',
        level: 'danger',
        text: `Vivres pour ${Math.max(0, Math.floor(months))} mois à ce rythme`,
        target: at(home),
      })
  }

  for (const people of state.peoples) {
    if (!people.met || people.tribe.population <= 0) continue
    if (people.relation >= RELATION_RULES.raidBelow) continue
    alerts.push({
      id: `raids-${people.owner}`,
      level: 'danger',
      text: `${people.name} : relation hostile, des raids menacent vos réserves`,
      target: at(state.camps.find((c) => c.owner === people.owner) ?? null),
    })
  }

  // L'automne finit : la réserve doit tenir l'hiver, où la cueillette s'effondre.
  const month = state.clock.tick % 12
  if (seasonOf(month) === 'automne' && seasonOf((month + 2) % 12) === 'hiver') {
    const need = tribe.lastConsumption * ALERT_RULES.winterMonths
    if (tribe.food < need)
      alerts.push({
        id: 'hiver',
        level: 'warning',
        text: 'L’hiver approche et les réserves sont maigres',
        target: at(home),
      })
  }

  const idle = !state.inventions.current
  const possible = INVENTION_KINDS.some(
    (k) => cannotStart(state.inventions, k, tribe.materials) === null,
  )
  if (idle && possible)
    alerts.push({
      id: 'recherche',
      level: 'warning',
      text: 'Aucune invention en cours',
      target: null,
    })

  if (tribe.food >= foodCapacity(state))
    alerts.push({
      id: 'reserves-pleines',
      level: 'info',
      text: 'Réserves pleines : les chasseurs se reposent',
      target: at(home),
    })
  else if (tribe.lastSpoiled >= ALERT_RULES.spoiledWorth)
    alerts.push({
      id: 'gaspillage',
      level: 'info',
      text: `${Math.round(tribe.lastSpoiled)} rations gâtées le mois dernier`,
      target: null,
    })

  // Les bandes : trop grandes, elles cueillent mal ; sur des terres épuisées, elles doivent partir.
  const bands = bandsOf(state)
  for (const band of bands) {
    const name = bands.length > 1 ? `Bande de ${band.members ?? 0}` : 'La bande'
    const efficiency = campEfficiency(band)
    if (efficiency < 1)
      alerts.push({
        id: `bande-grande-${band.id}`,
        level: 'warning',
        text: `${name} trop grande : efficacité −${Math.round((1 - efficiency) * 100)} %, scindez-la`,
        target: at(band),
      })
    if (!band.target && bandAbundance(state, band) < BAND_RULES.exhausted)
      alerts.push({
        id: `bande-epuisee-${band.id}`,
        level: 'warning',
        text: band.roaming
          ? `${name} : terres épuisées, aucun meilleur site connu alentour`
          : `${name} : terres épuisées ici, déplacez-la`,
        target: at(band),
      })
  }

  return alerts
}

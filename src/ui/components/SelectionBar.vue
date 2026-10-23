<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game'

const game = useGameStore()

/** Unités choisies, dans l'ordre de la vue. */
const units = computed(() => game.view?.units.filter((u) => game.selected.has(u.id)) ?? [])
const exploring = computed(() => units.value.length > 0 && units.value.every((u) => u.exploring))

/** « Éclaireur », « 2 chasseurs », « Éclaireur et chasseur »… */
const who = computed(() => {
  const counts = new Map<string, number>()
  for (const u of units.value) counts.set(u.name, (counts.get(u.name) ?? 0) + 1)
  const parts = [...counts].map(([name, n]) =>
    n > 1 ? `${n} ${name.toLowerCase()}s` : name.toLowerCase(),
  )
  const text = parts.join(' et ')
  return text.charAt(0).toUpperCase() + text.slice(1)
})

const camp = computed(
  () => game.view?.camps.find((c) => c.mine && c.id === game.selectedCamp) ?? null,
)
const campName = computed(() => {
  const c = camp.value
  const name = c?.city ? 'Cité' : c?.village ? 'Village' : 'Bande'
  return c?.members !== null && c?.members !== undefined ? `${name} de ${c.members}` : name
})
/** « efficacité 85 % · terres en baisse » : ce qui pèse sur la cueillette de la bande. */
const bandState = computed(() => {
  const band = camp.value?.band
  if (!band) return null
  const parts = [`terres ${band.land}`]
  if (band.efficiency < 1) parts.unshift(`efficacité ${Math.round(band.efficiency * 100)} %`)
  if (band.target) parts.push('en marche')
  return parts.join(' · ')
})
const upgradeLabel = computed(() =>
  camp.value?.upgrade?.to === 'city' ? 'Faire une cité' : 'Faire un village',
)

function upgrade() {
  const c = camp.value
  if (!c?.upgrade) return
  if (c.upgrade.to === 'village') void game.buildVillage(c.id)
  else void game.buildCity(c.id)
}
</script>

<template>
  <div v-if="game.view && camp" class="selection parchment" data-testid="camp-selection">
    <span class="who">{{ campName }}</span>
    <span
      v-if="bandState"
      class="why"
      data-testid="band-state"
      :class="{ alarm: camp.band!.efficiency < 1 || camp.band!.land === 'épuisées' }"
      :title="`Au-delà de ${camp.band!.comfortSize} personnes, une bande cueille moins bien`"
      >{{ bandState }}</span
    >
    <template v-if="camp.band">
      <button
        class="ink-button"
        data-testid="band-split"
        :disabled="camp.band.splitBlocked !== null"
        :title="camp.band.splitBlocked ?? 'La moitié des gens part former une autre bande'"
        @click="game.splitBand(camp.id)"
      >
        Scinder
      </button>
      <button
        class="ink-button"
        data-testid="band-roaming"
        :class="{ on: camp.band.roaming }"
        :aria-pressed="camp.band.roaming"
        title="Migrer seule vers des terres plus riches quand les siennes s'épuisent (clic droit : l'envoyer vous-même)"
        @click="game.setRoaming(camp.id, !camp.band.roaming)"
      >
        Migrer seule
      </button>
    </template>
    <button
      v-if="camp.upgrade"
      class="ink-button"
      data-testid="camp-upgrade"
      :disabled="camp.upgrade.blocked !== null"
      :title="camp.upgrade.blocked ?? `${upgradeLabel} (${camp.upgrade.cost})`"
      @click="upgrade()"
    >
      {{ upgradeLabel }}
    </button>
    <button
      class="ink-button"
      data-testid="camp-hunter"
      :disabled="game.view.tribe.recruitBlocked !== null"
      :title="
        game.view.tribe.recruitBlocked ??
        `Former un chasseur ici (${game.view.tribe.recruitCost} rations)`
      "
      @click="game.recruitHunter(camp.id)"
    >
      Chasseur
    </button>
    <button
      class="ink-button"
      data-testid="camp-scout"
      :disabled="game.view.tribe.scoutBlocked !== null"
      :title="
        game.view.tribe.scoutBlocked ??
        `Former un éclaireur ici (${game.view.tribe.scoutCost} rations)`
      "
      @click="game.recruitScout(camp.id)"
    >
      Éclaireur
    </button>
    <span v-if="camp.upgrade?.blocked" class="why" data-testid="camp-why">{{
      camp.upgrade.blocked
    }}</span>
  </div>
  <div
    v-else-if="game.view && units.length > 0"
    class="selection parchment"
    data-testid="selection"
  >
    <span class="who">{{ who }}</span>
    <button
      class="ink-button"
      data-testid="explore"
      :class="{ on: exploring }"
      :aria-pressed="exploring"
      title="Explorer seul : aller vers l’inconnu le plus proche, encore et encore (E)"
      @click="game.exploreSelected()"
    >
      Explorer
    </button>
  </div>
</template>

<style scoped>
.selection {
  position: absolute;
  right: 12px;
  bottom: 52px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 13px;
  max-width: calc(100% - 24px);
}
.who {
  font-family: var(--serif);
  font-size: 15px;
}
.why {
  color: var(--ink-soft);
}
.why.alarm {
  color: var(--ink-red);
}
.ink-button {
  font-size: 13px;
  padding: 1px 8px;
}
.ink-button.on {
  background: var(--ink);
  color: var(--paper);
}
.ink-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
@media (max-width: 560px) {
  .selection {
    bottom: auto;
    top: 124px;
    right: 8px;
    flex-wrap: wrap;
    max-width: 220px;
  }
}
</style>

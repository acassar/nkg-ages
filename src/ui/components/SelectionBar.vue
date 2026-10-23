<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game'

const game = useGameStore()

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
    <span v-if="camp.upgrade?.blocked" class="why" data-testid="camp-why">{{
      camp.upgrade.blocked
    }}</span>
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

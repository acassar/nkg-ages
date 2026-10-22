<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game'

const game = useGameStore()

/** L'éclaireur choisi, s'il y en a un : c'est lui qui fonde les campements. */
const scout = computed(
  () => game.view?.units.find((u) => game.selected.has(u.id) && u.foundCamp) ?? null,
)
const blocked = computed(() => scout.value?.foundCamp?.blocked ?? null)
</script>

<template>
  <div v-if="game.view && scout" class="selection parchment" data-testid="selection">
    <span class="who">{{ scout.name }}</span>
    <button
      class="ink-button"
      data-testid="found-camp"
      :disabled="blocked !== null"
      :title="blocked ?? 'Fonder un campement ici (F)'"
      @click="game.foundCamp()"
    >
      Fonder un campement
    </button>
    <span class="why">{{
      blocked ?? `Campements ${game.view.tribe.camps} / ${game.view.tribe.maxCamps}`
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
.ink-button {
  font-size: 13px;
  padding: 1px 8px;
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

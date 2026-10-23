<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { cssColor, inkOn, RANK_COLORS } from '@/render'
import { useGameStore } from '../stores/game'
import AlertsPanel from './AlertsPanel.vue'
import GoalsPanel from './GoalsPanel.vue'
import HintBox from './HintBox.vue'
import InventionsPanel from './InventionsPanel.vue'
import MapView from './MapView.vue'
import OutcomeDialog from './OutcomeDialog.vue'
import PeoplesPanel from './PeoplesPanel.vue'
import SelectionBar from './SelectionBar.vue'
import TopBar from './TopBar.vue'

const game = useGameStore()

// L'onglet passe en arrière-plan (ou se ferme) : on range la partie sans attendre le prochain tour.
function onHidden() {
  if (document.visibilityState === 'hidden') void game.saveNow()
}
onMounted(() => document.addEventListener('visibilitychange', onHidden))
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onHidden))

defineProps<{ benchmark?: boolean }>()

/** Légende des rangs de rareté, aux couleurs des pastilles de la carte. */
const ranks = (['E', 'D', 'C', 'B', 'A', 'S'] as const).map((rank) => ({
  rank,
  background: cssColor(RANK_COLORS[rank]),
  color: cssColor(inkOn(RANK_COLORS[rank])),
}))
</script>

<template>
  <div class="game">
    <MapView :benchmark="benchmark" />
    <TopBar />
    <InventionsPanel />
    <SelectionBar />
    <div class="side">
      <GoalsPanel />
      <AlertsPanel />
      <PeoplesPanel />
    </div>
    <HintBox />
    <p v-if="game.error" class="notice parchment" role="alert" data-testid="notice">
      {{ game.error }}
      <button class="close" aria-label="Fermer" @click="game.dismissError()">×</button>
    </p>
    <p class="hint parchment">
      Clic : choisir (Maj : ajouter) · clic droit : envoyer · F : fonder un campement · glisser ou
      ZQSD : carte · molette : zoom · Espace : pause · 1 à 5 : vitesse ·
      <span class="legend" data-testid="rarity-legend" title="Rareté des gisements, de E à S"
        >rareté
        <span
          v-for="r in ranks"
          :key="r.rank"
          class="rank"
          :style="{ background: r.background, color: r.color }"
          >{{ r.rank }}</span
        ></span
      >
    </p>
    <OutcomeDialog />
  </div>
</template>

<style scoped>
.game {
  position: relative;
  height: 100%;
  overflow: hidden;
}
/* Colonne de droite : objectif, alertes, peuples, empilés sans se chevaucher. */
.side {
  position: absolute;
  top: 84px;
  right: 12px;
  bottom: 110px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  pointer-events: none;
}
.side > * {
  pointer-events: auto;
  flex-shrink: 0;
}
.notice {
  position: absolute;
  top: 72px;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  padding: 8px 36px 8px 14px;
  border-color: var(--ink-red);
  color: var(--ink-red);
  border-radius: 3px;
  max-width: calc(100% - 32px);
}
.close {
  position: absolute;
  top: 2px;
  right: 6px;
  border: 0;
  background: none;
  font-size: 18px;
  cursor: pointer;
  color: inherit;
}
.hint {
  position: absolute;
  left: 12px;
  bottom: 12px;
  margin: 0;
  padding: 6px 10px;
  font-size: 13px;
  color: var(--ink-soft);
  border-radius: 3px;
  max-width: calc(100% - 24px);
}
.legend {
  white-space: nowrap;
}
.rank {
  display: inline-block;
  min-width: 15px;
  margin-left: 2px;
  text-align: center;
  font-weight: bold;
  border-radius: 2px;
}
</style>

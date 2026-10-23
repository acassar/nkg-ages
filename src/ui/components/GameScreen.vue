<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useGameStore } from '../stores/game'
import GoalsPanel from './GoalsPanel.vue'
import InventionsPanel from './InventionsPanel.vue'
import MapView from './MapView.vue'
import OutcomeDialog from './OutcomeDialog.vue'
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
</script>

<template>
  <div class="game">
    <MapView :benchmark="benchmark" />
    <TopBar />
    <InventionsPanel />
    <SelectionBar />
    <GoalsPanel />
    <p v-if="game.error" class="notice parchment" role="alert" data-testid="notice">
      {{ game.error }}
      <button class="close" aria-label="Fermer" @click="game.dismissError()">×</button>
    </p>
    <p class="hint parchment">
      Clic : choisir une unité (Maj : en ajouter) · clic droit : l'envoyer · les chasseurs chassent
      seuls les bêtes en vue · F : l’éclaireur fonde un campement · glisser ou ZQSD : déplacer la
      carte · molette : zoom · Espace : pause · 1 à 5 : vitesse
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
</style>

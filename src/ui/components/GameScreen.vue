<script setup lang="ts">
import MapView from './MapView.vue'
import TopBar from './TopBar.vue'

defineProps<{ benchmark?: boolean }>()
</script>

<template>
  <div class="game">
    <MapView :benchmark="benchmark" />
    <TopBar />
    <p class="hint parchment">
      Clic : choisir l'éclaireur · clic droit : l'envoyer · glisser ou ZQSD : déplacer la carte ·
      molette : zoom · Espace : pause · 1 à 5 : vitesse
    </p>
  </div>
</template>

<style scoped>
.game {
  position: relative;
  height: 100%;
  overflow: hidden;
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

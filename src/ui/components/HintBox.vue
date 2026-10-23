<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/game'

const game = useGameStore()
/** Le joueur peut taire les conseils pour la partie en cours. */
const hidden = ref(false)
</script>

<template>
  <aside
    v-if="game.view?.hint && !hidden"
    class="hint parchment"
    data-testid="hint"
    aria-live="polite"
  >
    <span class="label">Conseil</span>
    <span class="text">{{ game.view.hint }}</span>
    <button
      type="button"
      class="close"
      title="Ne plus afficher les conseils"
      data-testid="hint-close"
      @click="hidden = true"
    >
      ×
    </button>
  </aside>
</template>

<style scoped>
.hint {
  position: absolute;
  left: 12px;
  bottom: 52px;
  max-width: min(360px, calc(100% - 24px));
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 13px;
}
.label {
  font-family: var(--serif);
  font-style: italic;
  color: var(--ink-red);
}
.text {
  flex: 1;
}
.close {
  border: 0;
  background: none;
  font: inherit;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  color: var(--ink-soft);
}
@media (max-width: 560px) {
  .hint {
    bottom: 64px;
  }
}
</style>

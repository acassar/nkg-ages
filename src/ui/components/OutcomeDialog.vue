<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '../stores/game'

const game = useGameStore()
/** Une victoire se referme pour continuer la partie ; une défaite reste. */
const dismissed = ref(false)
const outcome = computed(() => game.view?.outcome ?? null)

function keepPlaying() {
  dismissed.value = true
  void game.setPaused(false)
}
</script>

<template>
  <div v-if="outcome && !(outcome.type === 'victory' && dismissed)" class="backdrop">
    <section
      class="dialog parchment"
      role="dialog"
      aria-modal="true"
      :aria-label="outcome.type === 'victory' ? 'Victoire' : 'Défaite'"
      data-testid="outcome"
    >
      <h2>{{ outcome.type === 'victory' ? 'Victoire' : 'Défaite' }}</h2>
      <p v-if="outcome.type === 'victory'">
        En {{ outcome.dateLabel }}, la tribu a réuni ce qu'il faut pour quitter le
        {{ game.view?.eraName.toLowerCase() }}.
      </p>
      <p v-else>En {{ outcome.dateLabel }}, le dernier membre de la tribu s'est éteint.</p>
      <p class="score">
        Score <b>{{ outcome.score }}</b>
      </p>
      <div class="actions">
        <button
          v-if="outcome.type === 'victory'"
          class="ink-button"
          data-testid="keep-playing"
          @click="keepPlaying"
        >
          Continuer
        </button>
        <button class="ink-button" @click="game.quit()">Menu</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.backdrop {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(40, 30, 20, 0.35);
  padding: 16px;
}
.dialog {
  max-width: 420px;
  padding: 18px 22px;
  border-radius: 4px;
  text-align: center;
}
h2 {
  margin: 0 0 8px;
  font-family: var(--serif);
  font-weight: normal;
  font-size: 28px;
}
.score b {
  font-family: var(--serif);
  font-size: 22px;
  font-weight: normal;
}
.actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}
</style>

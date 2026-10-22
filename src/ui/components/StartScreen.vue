<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/game'

const game = useGameStore()
const seed = ref(randomSeed())
const randomStart = ref(true)

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8)
}

function start() {
  void game.newGame({ seed: seed.value.trim() || randomSeed(), randomStart: randomStart.value })
}
</script>

<template>
  <main class="start">
    <form class="card parchment" @submit.prevent="start">
      <h1>nkg-ages</h1>
      <p class="tagline">De la première tribu aux âges à venir.</p>
      <label class="field">
        <span>Graine du monde</span>
        <span class="seed-row">
          <input v-model="seed" name="seed" maxlength="32" autocomplete="off" />
          <button type="button" class="ink-button" @click="seed = randomSeed()">Autre</button>
        </span>
      </label>
      <label class="check">
        <input v-model="randomStart" type="checkbox" name="randomStart" />
        <span>Placement aléatoire dans le monde</span>
      </label>
      <button type="submit" class="ink-button primary" :disabled="game.loading">
        {{ game.loading ? 'Le monde se dessine…' : 'Nouvelle partie' }}
      </button>
      <p v-if="game.error" class="error" role="alert">{{ game.error }}</p>
    </form>
  </main>
</template>

<style scoped>
.start {
  height: 100%;
  display: grid;
  place-items: center;
  padding: 16px;
}
.card {
  width: min(420px, 100%);
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
h1 {
  margin: 0;
  font-family: var(--serif);
  font-size: 42px;
  font-weight: 400;
  letter-spacing: 0.02em;
}
.tagline {
  margin: -10px 0 4px;
  color: var(--ink-soft);
  font-style: italic;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.seed-row {
  display: flex;
  gap: 8px;
}
input[name='seed'] {
  flex: 1;
  min-width: 0;
  background: rgba(255, 252, 240, 0.6);
  border: 1px solid var(--ink-soft);
  border-radius: 3px;
  padding: 6px 8px;
  font: inherit;
  color: var(--ink);
}
.check {
  display: flex;
  gap: 8px;
  align-items: center;
}
.error {
  color: var(--ink-red);
  margin: 0;
}
</style>

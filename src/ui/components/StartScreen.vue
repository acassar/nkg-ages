<script setup lang="ts">
import { ref } from 'vue'
import { GAME_SETUP, WORLD_SIZES, type WorldSize } from '@/client'
import { useGameStore } from '../stores/game'

const game = useGameStore()
const seed = ref(randomSeed())
const randomStart = ref(true)
const size = ref<WorldSize>(GAME_SETUP.defaultSize)
const peoples = ref<number>(GAME_SETUP.defaultPeoples)
const rareEvents = ref(true)
const sizes = Object.entries(WORLD_SIZES) as [WorldSize, (typeof WORLD_SIZES)[WorldSize]][]
const peopleChoices = Array.from(
  { length: GAME_SETUP.maxPeoples - GAME_SETUP.minPeoples + 1 },
  (_, i) => GAME_SETUP.minPeoples + i,
)

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8)
}

function start() {
  const { width, height } = WORLD_SIZES[size.value]
  void game.newGame({
    seed: seed.value.trim() || randomSeed(),
    randomStart: randomStart.value,
    width,
    height,
    peoples: Number(peoples.value),
    rareEvents: rareEvents.value,
  })
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
      <div class="options">
        <label class="field">
          <span>Taille du monde</span>
          <select v-model="size" name="size">
            <option v-for="[id, s] in sizes" :key="id" :value="id">
              {{ s.name }} ({{ s.width }} × {{ s.height }})
            </option>
          </select>
        </label>
        <label class="field">
          <span>Peuples voisins</span>
          <select v-model.number="peoples" name="peoples">
            <option v-for="n in peopleChoices" :key="n" :value="n">
              {{ n === 0 ? 'Aucun' : n }}
            </option>
          </select>
        </label>
      </div>
      <label class="check">
        <input v-model="rareEvents" type="checkbox" name="rareEvents" />
        <span>Événements rares (abondance, tempêtes, filons…)</span>
      </label>
      <button type="submit" class="ink-button primary" :disabled="game.loading">
        {{ game.loading ? 'Le monde se dessine…' : 'Nouvelle partie' }}
      </button>
      <button
        v-if="game.savedGame"
        type="button"
        class="ink-button resume"
        data-testid="resume"
        :disabled="game.loading"
        @click="game.resume()"
      >
        Reprendre la partie « {{ game.savedGame.seed }} » · {{ game.savedGame.dateLabel }}
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
.options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
select {
  background: rgba(255, 252, 240, 0.6);
  border: 1px solid var(--ink-soft);
  border-radius: 3px;
  padding: 6px 8px;
  font: inherit;
  color: var(--ink);
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
.resume {
  overflow-wrap: anywhere;
}
.error {
  color: var(--ink-red);
  margin: 0;
}
</style>

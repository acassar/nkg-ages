<script setup lang="ts">
import { onMounted } from 'vue'
import GameScreen from './components/GameScreen.vue'
import StartScreen from './components/StartScreen.vue'
import { useGameStore } from './stores/game'

const game = useGameStore()
const benchmark = new URLSearchParams(location.search).has('bench')

onMounted(async () => {
  if (!benchmark) return
  // Mesure : monde fixe, vue entière, temps à vitesse 5.
  await game.newGame({ seed: 'banc-essai', randomStart: false })
  await game.setSpeed(5)
  await game.setPaused(false)
})
</script>

<template>
  <GameScreen v-if="game.world" :benchmark="benchmark" />
  <StartScreen v-else />
</template>

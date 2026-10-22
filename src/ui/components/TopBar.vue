<script setup lang="ts">
import { SPEED_VALUES } from '@/client'
import { useGameStore } from '../stores/game'

const game = useGameStore()
</script>

<template>
  <header v-if="game.view" class="topbar parchment">
    <div class="date">
      <span class="era">{{ game.view.eraName }}</span>
      <span class="day" data-testid="date">{{ game.view.dateLabel }}</span>
    </div>
    <div class="speeds" role="group" aria-label="Vitesse du temps">
      <button
        class="ink-button"
        :class="{ on: game.view.paused }"
        :aria-pressed="game.view.paused"
        data-testid="pause"
        title="Pause (Espace)"
        @click="game.togglePause()"
      >
        {{ game.view.paused ? '▶' : '❚❚' }}
      </button>
      <button
        v-for="speed in SPEED_VALUES"
        :key="speed"
        class="ink-button speed"
        :class="{ on: game.view.speed === speed }"
        :aria-pressed="game.view.speed === speed"
        :data-testid="`speed-${speed}`"
        :title="`Vitesse ${speed} (touche ${speed})`"
        @click="game.setSpeed(speed)"
      >
        {{ speed }}
      </button>
    </div>
    <button class="ink-button quit" @click="game.quit()">Menu</button>
  </header>
</template>

<style scoped>
.topbar {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 6px 12px;
  border-radius: 4px;
  max-width: calc(100% - 32px);
}
.date {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
  min-width: 170px;
}
.era {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-soft);
}
.day {
  font-family: var(--serif);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}
.speeds {
  display: flex;
  gap: 4px;
}
.speeds .ink-button {
  padding: 2px 9px;
  min-width: 34px;
}
.ink-button.on {
  background: var(--ink);
  color: var(--paper);
}
@media (max-width: 560px) {
  .date {
    min-width: 0;
  }
  .quit {
    display: none;
  }
}
</style>

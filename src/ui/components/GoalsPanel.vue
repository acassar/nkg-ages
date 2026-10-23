<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game'

const game = useGameStore()
const achievements = computed(() => game.view?.achievements ?? [])
const won = computed(() => achievements.value.filter((a) => a.done).length)
/** Liste des succès pour l'infobulle : gagnés cochés, les autres avec leur condition. */
const list = computed(() =>
  achievements.value.map((a) => `${a.done ? '✓' : '·'} ${a.name} : ${a.description}`).join('\n'),
)
</script>

<template>
  <aside v-if="game.view" class="goals parchment" data-testid="goals">
    <div class="head">
      <span class="title">Objectif de l'ère</span>
      <span class="score" title="Score de la partie"
        >Score <b data-testid="score">{{ game.view.score }}</b></span
      >
    </div>
    <ul>
      <li v-for="g in game.view.goal" :key="g.label" :class="{ done: g.done }">
        <span>{{ g.label }}</span>
        <span class="count">{{ Math.min(g.have, g.need) }} / {{ g.need }}</span>
      </li>
    </ul>
    <div class="achievements" :title="list">
      Succès <b data-testid="achievements">{{ won }}</b> / {{ achievements.length }}
    </div>
  </aside>
</template>

<style scoped>
.goals {
  width: 200px;
  padding: 6px 10px 8px;
  border-radius: 4px;
  font-size: 13px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.title {
  font-family: var(--serif);
  font-size: 15px;
}
.score {
  color: var(--ink-soft);
}
.score b {
  font-family: var(--serif);
  font-weight: normal;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
ul {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
}
li {
  display: flex;
  justify-content: space-between;
  font-variant-numeric: tabular-nums;
}
.achievements {
  margin-top: 4px;
  color: var(--ink-soft);
  cursor: help;
}
.achievements b {
  font-weight: normal;
  color: var(--ink);
}
li.done {
  color: var(--ink-soft);
  text-decoration: line-through;
}
@media (max-width: 560px) {
  .goals {
    display: none;
  }
}
</style>

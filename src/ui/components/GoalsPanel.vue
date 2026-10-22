<script setup lang="ts">
import { useGameStore } from '../stores/game'

const game = useGameStore()
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
  </aside>
</template>

<style scoped>
.goals {
  position: absolute;
  top: 84px;
  right: 12px;
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

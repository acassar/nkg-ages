<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/game'

const game = useGameStore()
/** Repliable, surtout pour les petits écrans. */
const open = ref(true)
</script>

<template>
  <aside v-if="game.view" class="inventions parchment" data-testid="inventions">
    <button class="title" :aria-expanded="open" @click="open = !open">
      Inventions <span aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
    </button>
    <ul v-if="open">
      <li
        v-for="inv in game.view.inventions"
        :key="inv.kind"
        :data-testid="`invention-${inv.kind}`"
      >
        <div class="head">
          <span class="name">{{ inv.name }}</span>
          <span v-if="inv.rank" class="rank" :class="`rank-${inv.rank}`">{{ inv.rank }}</span>
        </div>
        <p class="what">{{ inv.stat ?? inv.description }}</p>
        <div
          v-if="inv.progress !== null"
          class="progress"
          :title="`${inv.monthsLeft} mois restants`"
        >
          <span :style="{ width: `${Math.round(inv.progress * 100)}%` }" />
        </div>
        <button
          v-else-if="inv.rank !== 'S'"
          class="ink-button"
          :disabled="inv.blocked !== null"
          :title="inv.blocked ?? undefined"
          @click="game.invent(inv.kind)"
        >
          {{ inv.rank ? 'Réinventer' : 'Inventer' }}
          <span v-if="inv.cost.length" class="cost">({{ inv.cost.join(', ') }})</span>
        </button>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.inventions {
  position: absolute;
  top: 84px;
  left: 12px;
  width: 230px;
  padding: 6px 10px 8px;
  border-radius: 4px;
  font-size: 13px;
}
.title {
  border: 0;
  background: none;
  padding: 0;
  font-family: var(--serif);
  font-size: 16px;
  color: var(--ink);
  cursor: pointer;
}
ul {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.name {
  font-family: var(--serif);
  font-size: 15px;
}
.rank {
  font-family: var(--serif);
  font-weight: bold;
  padding: 0 6px;
  border-radius: 3px;
  color: var(--paper);
}
.rank-E {
  background: #8a8170;
}
.rank-D {
  background: #5f7d4c;
}
.rank-C {
  background: #3e6e8e;
}
.rank-B {
  background: #6b4b8f;
}
.rank-A {
  background: #b8622a;
}
.rank-S {
  background: #c9a227;
}
.what {
  margin: 2px 0 4px;
  color: var(--ink-soft);
}
.progress {
  height: 6px;
  border: 1px solid var(--ink-soft);
  border-radius: 3px;
  overflow: hidden;
}
.progress span {
  display: block;
  height: 100%;
  background: var(--ink);
}
.ink-button {
  font-size: 13px;
  padding: 1px 8px;
}
.ink-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.cost {
  color: var(--ink-soft);
}
@media (max-width: 560px) {
  .inventions {
    top: auto;
    bottom: 64px;
    width: 200px;
  }
}
</style>

<script setup lang="ts">
import { useGameStore } from '../stores/game'

const game = useGameStore()
</script>

<template>
  <aside
    v-if="game.view && game.view.peoples.length > 0"
    class="peoples parchment"
    data-testid="peoples"
  >
    <span class="title">Peuples voisins</span>
    <ul>
      <li v-for="p in game.view.peoples" :key="p.id" :data-testid="`people-${p.id}`">
        <div class="row">
          <span class="name">{{ p.name }}</span>
          <span class="soft" title="Population, à peu près">≈ {{ p.population }}</span>
        </div>
        <div class="row">
          <span class="mood" :class="{ bad: p.relation < 0, good: p.relation >= 20 }"
            >{{ p.mood }} ({{ p.relation > 0 ? '+' : '' }}{{ p.relation }})</span
          >
          <span class="actions">
            <button
              class="ink-button"
              data-testid="gift"
              :disabled="p.giftBlocked !== null"
              :title="p.giftBlocked ?? `Offrir ${p.giftCost}`"
              @click="game.gift(p.id)"
            >
              Présent
            </button>
            <button
              class="ink-button"
              data-testid="trade"
              :disabled="p.tradeBlocked !== null"
              :title="p.tradeBlocked ?? `Échanger ${p.trade}`"
              @click="game.trade(p.id)"
            >
              Échange
            </button>
          </span>
        </div>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.peoples {
  position: absolute;
  top: 190px;
  right: 12px;
  width: 200px;
  padding: 6px 10px 8px;
  border-radius: 4px;
  font-size: 13px;
}
.title {
  font-family: var(--serif);
  font-size: 15px;
}
ul {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}
.soft {
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}
.mood.bad {
  color: var(--ink-red);
}
.mood.good {
  color: var(--ink);
  font-weight: 600;
}
.actions {
  display: flex;
  gap: 4px;
}
.actions button {
  font-size: 12px;
  padding: 1px 6px;
}
@media (max-width: 560px) {
  .peoples {
    display: none;
  }
}
</style>

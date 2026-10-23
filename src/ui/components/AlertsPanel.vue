<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AlertView } from '@/views/types'
import { useGameStore } from '../stores/game'

const game = useGameStore()
const alerts = computed(() => game.view?.alerts ?? [])
const urgent = computed(() => alerts.value.filter((a) => a.level === 'danger').length)

// Replié ou non : une préférence de ce navigateur, sans importance pour la partie.
const KEY = 'nkg-ages.alertes-repliees'
function readFolded(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
const folded = ref(readFolded())
watch(folded, (value) => {
  try {
    localStorage.setItem(KEY, value ? '1' : '0')
  } catch {
    // Stockage indisponible (navigation privée) : la préférence ne dure que la session.
  }
})

function show(alert: AlertView) {
  if (alert.target) game.focusOn(alert.target.x, alert.target.y)
}
</script>

<template>
  <aside v-if="game.view" class="alerts parchment" data-testid="alerts">
    <button
      class="head"
      :aria-expanded="!folded"
      data-testid="alerts-toggle"
      @click="folded = !folded"
    >
      <span class="title">Alertes</span>
      <span
        class="count"
        :class="{ urgent: urgent > 0 }"
        data-testid="alerts-count"
        :title="urgent > 0 ? `${urgent} urgente(s)` : undefined"
        >{{ alerts.length }}</span
      >
      <span class="fold" aria-hidden="true">{{ folded ? '▸' : '▾' }}</span>
    </button>
    <ul v-if="!folded">
      <li v-if="alerts.length === 0" class="calm">Rien à signaler</li>
      <li
        v-for="a in alerts"
        :key="a.id"
        :class="[a.level, { link: a.target }]"
        :data-testid="`alert-${a.id}`"
        :title="a.target ? 'Montrer sur la carte' : undefined"
        @click="show(a)"
      >
        {{ a.text }}
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.alerts {
  width: 200px;
  padding: 6px 10px 8px;
  border-radius: 4px;
  font-size: 13px;
}
.head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.title {
  font-family: var(--serif);
  font-size: 15px;
}
.count {
  min-width: 18px;
  padding: 0 4px;
  border-radius: 8px;
  text-align: center;
  background: var(--ink-soft);
  color: var(--paper);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.count.urgent {
  background: var(--ink-red);
}
.fold {
  margin-left: auto;
  color: var(--ink-soft);
}
ul {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
li {
  padding-left: 8px;
  border-left: 3px solid var(--ink-soft);
  line-height: 1.3;
}
li.danger {
  border-color: var(--ink-red);
  color: var(--ink-red);
}
li.warning {
  border-color: #b8862a;
}
li.info {
  color: var(--ink-soft);
}
li.link {
  cursor: pointer;
}
li.link:hover {
  text-decoration: underline;
}
.calm {
  border: 0;
  padding: 0;
  color: var(--ink-soft);
}
</style>

<script setup lang="ts">
import { SPEED_VALUES } from '@/client'
import { useGameStore } from '../stores/game'

const game = useGameStore()

const signed = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})
</script>

<template>
  <header v-if="game.view" class="topbar parchment">
    <div class="date">
      <span class="era">{{ game.view.eraName }}</span>
      <span class="day" data-testid="date">{{ game.view.dateLabel }}</span>
      <span
        class="season"
        :class="game.view.season.kind"
        data-testid="season"
        :title="`Cueillette ce mois-ci : ${game.view.season.gather} % de la moyenne de l'année`"
        >{{ game.view.season.name }} · {{ game.view.season.gather }} %</span
      >
    </div>
    <div class="tribe" :class="{ starving: game.view.tribe.starving }">
      <span title="Population de la tribu">
        <span class="label">Tribu</span>
        <b data-testid="population">{{ game.view.tribe.population }}</b>
      </span>
      <span
        :title="
          game.view.tribe.spoiled > 0
            ? `Réserve de nourriture : ${game.view.tribe.spoiled} rations gâtées le mois dernier`
            : 'Réserve de nourriture (une ration nourrit une personne un mois)'
        "
      >
        <span class="label">Vivres</span>
        <b data-testid="food">{{ game.view.tribe.food }}</b>
        <span class="soft">/ {{ game.view.tribe.foodCapacity }}</span>
        <span class="balance" data-testid="food-balance"
          >{{ signed.format(game.view.tribe.foodBalance) }}/mois</span
        >
      </span>
      <span
        :title="
          game.view.tribe.huntersResting
            ? 'Réserve pleine : les chasseurs se reposent'
            : 'Chasseurs des bandes : ils chassent seuls autour du camp et le défendent'
        "
      >
        <span class="label">Chasseurs</span>
        <b data-testid="hunters">{{ game.view.tribe.hunters }}</b>
        <span v-if="game.view.tribe.huntersResting" class="balance" data-testid="hunters-resting"
          >au repos</span
        >
      </span>
      <span
        v-if="game.view.tribe.villages > 0 || game.view.tribe.maxVillages > 0"
        :title="
          game.view.tribe.crops > 0
            ? `Villages : moisson de ${game.view.tribe.crops} rations ce mois-ci`
            : 'Villages tenus / que la tribu peut tenir (champs moissonnés d’août à octobre)'
        "
      >
        <span class="label">Villages</span>
        <b data-testid="villages">{{ game.view.tribe.villages }}</b>
        <span class="soft">/ {{ game.view.tribe.maxVillages }}</span>
        <button
          class="ink-button recruit"
          data-testid="build-village"
          :disabled="game.view.tribe.villageBlocked !== null"
          :title="
            game.view.tribe.villageBlocked ??
            `Faire d’un campement un village (${game.view.tribe.villageCost} rations)`
          "
          @click="game.buildVillage()"
        >
          +
        </button>
      </span>
      <span
        v-if="game.view.tribe.cities > 0 || game.view.tribe.maxCities > 0"
        title="Cités tenues / que la tribu peut tenir (portée, réserves et savoir en plus)"
      >
        <span class="label">Cités</span>
        <b data-testid="cities">{{ game.view.tribe.cities }}</b>
        <span class="soft">/ {{ game.view.tribe.maxCities }}</span>
        <button
          class="ink-button recruit"
          data-testid="build-city"
          :disabled="game.view.tribe.cityBlocked !== null"
          :title="
            game.view.tribe.cityBlocked ??
            `Faire d’un village une cité (${game.view.tribe.cityCost})`
          "
          @click="game.buildCity()"
        >
          +
        </button>
      </span>
      <span v-for="m in game.view.tribe.materials" :key="m.kind" :title="`${m.name} en réserve`">
        <span class="label">{{ m.name }}</span>
        <b :data-testid="`material-${m.kind}`">{{ m.amount }}</b>
      </span>
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
  white-space: nowrap;
  font-family: var(--serif);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}
.season {
  font-size: 12px;
  color: var(--ink-soft);
  white-space: nowrap;
}
.season.hiver {
  color: var(--ink-red);
}
.tribe {
  display: flex;
  gap: 14px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.tribe .label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
  margin-right: 4px;
}
.tribe b {
  font-family: var(--serif);
  font-size: 18px;
  font-weight: normal;
}
.tribe .soft,
.tribe .balance {
  color: var(--ink-soft);
  font-size: 13px;
  margin-left: 3px;
}
.tribe.starving b,
.tribe.starving .balance {
  color: var(--ink-red);
}
.recruit {
  margin-left: 5px;
  padding: 0 6px;
  line-height: 1.2;
}
.recruit:disabled {
  opacity: 0.4;
  cursor: default;
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
  .topbar {
    flex-wrap: wrap;
    justify-content: center;
    row-gap: 4px;
    width: max-content;
  }
  .tribe {
    order: 3;
    flex-basis: 100%;
    justify-content: center;
  }
  .tribe .soft {
    display: none;
  }
}
</style>

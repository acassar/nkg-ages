<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  centerOn,
  minZoom,
  pan,
  screenToWorld,
  worldToScreen,
  zoomAt,
  WebGlMapRenderer,
  type Camera,
  type MapRenderer,
} from '@/render'
import { depositAt, describeDeposit, describeWonder } from '../deposits'
import { intentOf } from '../keyboard'
import { useGameStore } from '../stores/game'
import { BIOME_IDS, type GameView } from '@/views/types'

const props = defineProps<{ benchmark?: boolean }>()
const game = useGameStore()
const host = ref<HTMLDivElement>()
const terrain = ref<HTMLCanvasElement>()
const overlay = ref<HTMLCanvasElement>()
const failure = ref<string | null>(null)
const benchLabel = ref('')

let renderer: MapRenderer | null = null
let camera: Camera = { cx: 0, cy: 0, zoom: 4, viewWidth: 1, viewHeight: 1 }
let dirty = true
let frame = 0
let lastFrame = 0
const held = new Set<string>()
const cleanups: (() => void)[] = []
const PAN_SPEED = 600 // pixels par seconde

const worldSize = () => game.world ?? { width: 1, height: 1 }

function resize() {
  const el = host.value
  if (!el || !renderer) return
  const rect = el.getBoundingClientRect()
  camera = { ...camera, viewWidth: rect.width, viewHeight: rect.height }
  renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1)
  dirty = true
}

function loop(now: number) {
  frame = requestAnimationFrame(loop)
  const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0
  lastFrame = now
  let dx = 0
  let dy = 0
  for (const code of held) {
    const intent = intentOf(code)
    if (intent?.kind === 'pan') {
      dx += intent.dx
      dy += intent.dy
    }
  }
  if (dx || dy) {
    camera = pan(camera, worldSize(), -dx * PAN_SPEED * dt, -dy * PAN_SPEED * dt)
    dirty = true
  }
  if ((dirty || props.benchmark) && renderer && game.view) {
    const t0 = performance.now()
    renderer.render(camera, {
      deposits: game.view.deposits,
      wonders: game.view.wonders,
      herds: game.view.herds,
      units: game.view.units,
      camps: game.view.camps,
      selected: game.selected,
      selectedCamp: game.selectedCamp,
    })
    benchSample(performance.now() - t0, now)
    dirty = false
  }
}

// Mesure de performance (mode ?bench) : intervalles entre images et coût du rendu.
const bench = { intervals: [] as number[], renderMs: [] as number[], last: 0 }
function benchSample(renderMs: number, now: number) {
  if (!props.benchmark) return
  if (bench.last) bench.intervals.push(now - bench.last)
  bench.last = now
  bench.renderMs.push(renderMs)
  ;(window as unknown as { __nkgBench: typeof bench }).__nkgBench = bench
  const recent = bench.intervals.slice(-60)
  if (recent.length > 0 && bench.intervals.length % 15 === 0) {
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length
    benchLabel.value = `${Math.round(1000 / mean)} images/s · rendu ${renderMs.toFixed(2)} ms`
  }
}

function onKey(event: KeyboardEvent, down: boolean) {
  if (event.target instanceof HTMLInputElement) return
  const intent = intentOf(event.code)
  if (!intent) return
  event.preventDefault()
  if (intent.kind === 'pan') {
    if (down) held.add(event.code)
    else held.delete(event.code)
    return
  }
  if (!down || event.repeat) return
  if (intent.kind === 'togglePause') void game.togglePause()
  if (intent.kind === 'speed') void game.setSpeed(intent.speed)
  if (intent.kind === 'explore') void game.exploreSelected()
}

// Souris : glisser pour déplacer la carte, molette pour zoomer,
// clic gauche pour choisir une unité ou un campement, clic droit pour envoyer les unités.
let drag: { x: number; y: number; moved: boolean } | null = null

function local(event: MouseEvent) {
  const rect = host.value!.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  const p = local(event)
  drag = { x: p.x, y: p.y, moved: false }
  host.value?.setPointerCapture(event.pointerId)
}

/** Infobulle du gisement survolé. */
const hover = ref<{ x: number; y: number; text: string } | null>(null)

function updateHover(p: { x: number; y: number }) {
  const w = game.view && depositAt(game.view.wonders, camera, p.x, p.y)
  const d = game.view && depositAt(game.view.deposits, camera, p.x, p.y)
  const text = w ? describeWonder(w) : d ? describeDeposit(d) : null
  hover.value = text ? { x: p.x, y: p.y, text } : null
}

function onPointerMove(event: PointerEvent) {
  const p = local(event)
  updateCursor(p)
  if (!drag) return updateHover(p)
  hover.value = null
  const dx = p.x - drag.x
  const dy = p.y - drag.y
  if (!drag.moved && Math.hypot(dx, dy) < 4) return
  drag.moved = true
  cursor.value = 'grabbing'
  camera = pan(camera, worldSize(), dx, dy)
  drag.x = p.x
  drag.y = p.y
  dirty = true
}

function onPointerUp(event: PointerEvent) {
  if (!drag) return
  const wasDrag = drag.moved
  drag = null
  if (wasDrag || !game.view) return
  const p = local(event)
  const hit = unitAt(p)
  // Maj + clic ajoute ou retire l'unité de la sélection.
  if (event.shiftKey && hit) game.toggleSelected(hit.id)
  else pickNext(p)
  updateCursor(p)
  dirty = true
}

/**
 * Choisit ce qui est sous le pointeur. Unités et campement se superposent souvent (les recrues
 * paraissent au camp) : un nouveau clic au même endroit passe au suivant.
 */
function pickNext(p: { x: number; y: number }) {
  const units = (game.view?.units ?? []).filter((u) => {
    const s = worldToScreen(camera, u.x, u.y)
    return Math.hypot(s.x - p.x, s.y - p.y) < 12
  })
  const camp = campAt(p)
  const choices = [
    ...units.map((u) => () => game.select([u.id])),
    ...(camp ? [() => game.selectCamp(camp.id)] : []),
  ]
  if (choices.length === 0) return game.select([])
  const current =
    camp && game.selectedCamp === camp.id
      ? units.length
      : units.findIndex((u) => game.selected.size === 1 && game.selected.has(u.id))
  choices[(current + 1) % choices.length]!()
}

/** Unité du joueur sous le pointeur, s'il y en a une. */
function unitAt(p: { x: number; y: number }) {
  return game.view?.units.find((u) => {
    const s = worldToScreen(camera, u.x, u.y)
    return Math.hypot(s.x - p.x, s.y - p.y) < 12
  })
}

/** Campement du joueur sous le pointeur (les unités, posées dessus, passent d'abord). */
function campAt(p: { x: number; y: number }) {
  return game.view?.camps.find((c) => {
    if (!c.mine) return false
    const s = worldToScreen(camera, c.x, c.y)
    return Math.hypot(s.x - p.x, s.y - p.y) < (c.city ? 16 : 12)
  })
}

/**
 * Curseur selon ce qu'un clic ferait : flèche au repos, main sur ce qu'on peut choisir,
 * viseur quand des unités ou une bande attendent une destination, interdit sur l'eau connue.
 */
const cursor = ref<'default' | 'pointer' | 'crosshair' | 'not-allowed' | 'grabbing'>('default')

function updateCursor(p: { x: number; y: number }) {
  if (drag?.moved) cursor.value = 'grabbing'
  else if (unitAt(p) || campAt(p)) cursor.value = 'pointer'
  else if (game.selected.size > 0 || selectedBandId() !== null)
    cursor.value = onWater(p) ? 'not-allowed' : 'crosshair'
  else cursor.value = 'default'
}

/** La bande choisie (elle attend une destination comme une unité), ou null. */
function selectedBandId(): number | null {
  const camp = game.view?.camps.find((c) => c.id === game.selectedCamp)
  return camp?.band ? camp.id : null
}

/** Le pointeur est-il sur de l'eau déjà découverte (où l'on ne peut envoyer personne) ? */
function onWater(p: { x: number; y: number }): boolean {
  const world = game.world
  if (!world) return false
  const w = screenToWorld(camera, p.x, p.y)
  const x = Math.floor(w.x)
  const y = Math.floor(w.y)
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return true
  const i = y * world.width + x
  const water = world.biome[i] === BIOME_IDS.Ocean || world.biome[i] === BIOME_IDS.DeepOcean
  return water && fogCells !== null && fogCells[i] !== 0
}

/** Ce que le joueur connaît de la carte (0 : inconnu), tenu à jour depuis les vues. */
let fogCells: Uint8Array | null = null

function applyFog(patch: GameView['fog']) {
  const world = game.world
  if (!world || !patch) return
  if (!fogCells || fogCells.length !== world.width * world.height)
    fogCells = new Uint8Array(world.width * world.height)
  for (let row = 0; row < patch.h; row++)
    fogCells.set(
      patch.data.subarray(row * patch.w, (row + 1) * patch.w),
      (patch.y + row) * world.width + patch.x,
    )
}

function onContextMenu(event: MouseEvent) {
  event.preventDefault()
  const p = local(event)
  const w = screenToWorld(camera, p.x, p.y)
  void game.moveSelectedTo(w.x, w.y)
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  const p = local(event)
  camera = zoomAt(camera, worldSize(), p.x, p.y, Math.exp(-event.deltaY * 0.0015))
  dirty = true
}

// Une alerte cliquée centre la carte sur son lieu, sans changer le zoom.
watch(
  () => game.focus,
  (target) => {
    if (!target) return
    camera = centerOn(camera, worldSize(), target.x, target.y)
    dirty = true
  },
)

onMounted(() => {
  try {
    renderer = new WebGlMapRenderer(terrain.value!, overlay.value!, { revealAll: props.benchmark })
  } catch (e) {
    failure.value = e instanceof Error ? e.message : String(e)
    return
  }
  if (game.world) renderer.setWorld(game.world)
  if (game.view) renderer.applyView(game.view)
  applyFog(game.view?.fog ?? null)
  resize()
  const camp = game.view?.camps.find((c) => c.mine)
  camera = props.benchmark
    ? {
        ...camera,
        zoom: minZoom(camera, worldSize()),
        cx: worldSize().width / 2,
        cy: worldSize().height / 2,
      }
    : centerOn({ ...camera, zoom: 6 }, worldSize(), camp?.x ?? 0, camp?.y ?? 0)
  cleanups.push(
    game.onView((view) => {
      renderer?.applyView(view)
      applyFog(view.fog)
      dirty = true
    }),
  )
  const keydown = (e: KeyboardEvent) => onKey(e, true)
  const keyup = (e: KeyboardEvent) => onKey(e, false)
  const blur = () => held.clear()
  window.addEventListener('keydown', keydown)
  window.addEventListener('keyup', keyup)
  window.addEventListener('blur', blur)
  window.addEventListener('resize', resize)
  cleanups.push(() => {
    window.removeEventListener('keydown', keydown)
    window.removeEventListener('keyup', keyup)
    window.removeEventListener('blur', blur)
    window.removeEventListener('resize', resize)
  })
  frame = requestAnimationFrame(loop)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  for (const cleanup of cleanups) cleanup()
  renderer?.dispose()
})
</script>

<template>
  <div
    ref="host"
    class="map"
    data-testid="map"
    :style="{ cursor }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @contextmenu="onContextMenu"
    @wheel="onWheel"
  >
    <canvas ref="terrain" class="layer" />
    <canvas ref="overlay" class="layer" />
    <p
      v-if="hover"
      class="tooltip parchment"
      data-testid="tooltip"
      :style="{ left: `${hover.x + 14}px`, top: `${hover.y + 14}px` }"
    >
      {{ hover.text }}
    </p>
    <p v-if="benchmark && benchLabel" class="bench parchment" data-testid="bench">
      {{ benchLabel }}
    </p>
    <p v-if="failure" class="failure parchment" role="alert">
      La carte ne peut pas s'afficher : {{ failure }}. Vérifiez que l'accélération matérielle est
      activée dans le navigateur.
    </p>
  </div>
</template>

<style scoped>
.map {
  position: absolute;
  inset: 0;
  overflow: hidden;
  touch-action: none;
}
.layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.bench {
  position: absolute;
  right: 12px;
  bottom: 12px;
  margin: 0;
  padding: 6px 10px;
  font-variant-numeric: tabular-nums;
}
.tooltip {
  position: absolute;
  margin: 0;
  padding: 4px 8px;
  font-size: 13px;
  pointer-events: none;
  white-space: nowrap;
}
.failure {
  position: absolute;
  inset: auto 16px 16px;
  padding: 12px 16px;
}
</style>

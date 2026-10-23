import type { Speed } from '@/client'

/** Raccourcis clavier, sans effet de bord : on traduit une touche en intention. */
export type KeyIntent =
  | { kind: 'togglePause' }
  | { kind: 'speed'; speed: Speed }
  | { kind: 'pan'; dx: number; dy: number }
  | { kind: 'explore' }

const PAN: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
}

/** `code` est la touche physique : ZQSD en AZERTY = WASD en QWERTY. */
export function intentOf(code: string): KeyIntent | null {
  if (code === 'Space') return { kind: 'togglePause' }
  if (code === 'KeyE') return { kind: 'explore' }
  const digit = /^(?:Digit|Numpad)([1-5])$/.exec(code)
  if (digit) return { kind: 'speed', speed: Number(digit[1]) as Speed }
  const pan = PAN[code]
  if (pan) return { kind: 'pan', dx: pan[0], dy: pan[1] }
  return null
}

import { describe, expect, it } from 'vitest'
import { ManualScheduler, realScheduler } from '@/host/scheduler'

describe('ordonnanceurs', () => {
  it('le vrai appelle à intervalle régulier puis s’arrête', async () => {
    let calls = 0
    const stop = realScheduler.every(5, () => calls++)
    await new Promise((r) => setTimeout(r, 40))
    stop()
    const after = calls
    await new Promise((r) => setTimeout(r, 20))
    expect(after).toBeGreaterThan(1)
    expect(calls).toBe(after)
    expect(realScheduler.now()).toBeGreaterThan(0)
  })

  it('le manuel n’avance que sur demande, dans l’ordre', () => {
    const s = new ManualScheduler()
    const log: string[] = []
    s.every(10, () => log.push(`a${s.now()}`))
    const stop = s.every(15, () => log.push(`b${s.now()}`))
    s.advance(30)
    expect(log).toEqual(['a10', 'b15', 'a20', 'a30', 'b30'])
    stop()
    s.advance(15)
    expect(log.at(-1)).toBe('a40')
    expect(s.now()).toBe(45)
  })
})

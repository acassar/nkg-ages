/** Accès au temps réel, injecté pour pouvoir tester l'hôte sans attendre. */
export interface Scheduler {
  now(): number
  every(ms: number, callback: () => void): () => void
}

export const realScheduler: Scheduler = {
  now: () => performance.now(),
  every(ms, callback) {
    const id = setInterval(callback, ms)
    return () => clearInterval(id)
  },
}

/** Horloge manuelle pour les tests : le temps n'avance que sur demande. */
export class ManualScheduler implements Scheduler {
  private time = 0
  private readonly timers = new Set<{ ms: number; next: number; callback: () => void }>()

  now(): number {
    return this.time
  }

  every(ms: number, callback: () => void): () => void {
    const timer = { ms, next: this.time + ms, callback }
    this.timers.add(timer)
    return () => this.timers.delete(timer)
  }

  advance(ms: number): void {
    const end = this.time + ms
    for (;;) {
      let due: { ms: number; next: number; callback: () => void } | null = null
      for (const t of this.timers) if (t.next <= end && (!due || t.next < due.next)) due = t
      if (!due) break
      this.time = due.next
      due.next += due.ms
      due.callback()
    }
    this.time = end
  }
}

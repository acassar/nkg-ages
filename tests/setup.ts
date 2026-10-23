import { afterEach } from 'vitest'

/**
 * Rend la main à la boucle d'événements entre deux tests. Vitest enchaîne les tests d'un
 * fichier sans jamais lui laisser un tour : un fichier de longs tests synchrones (sous la
 * couverture, sur une machine de CI lente) la bloque plus d'une minute, et le worker croit
 * que le processus principal ne répond plus (« Timeout calling "onTaskUpdate" »).
 */
afterEach(() => new Promise<void>((resolve) => setImmediate(resolve)))

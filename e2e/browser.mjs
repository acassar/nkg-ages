import { chromium } from 'playwright'
import { existsSync } from 'node:fs'

/**
 * Lance Chromium. En local (conteneur), on réutilise le navigateur préinstallé ;
 * en CI, celui installé par `playwright install`.
 * Sans GPU, WebGL passe par SwiftShader (rendu logiciel) : les mesures sont alors pessimistes.
 */
export async function launch() {
  const local = '/opt/pw-browsers/chromium'
  return chromium.launch({
    executablePath: existsSync(local) ? local : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
}

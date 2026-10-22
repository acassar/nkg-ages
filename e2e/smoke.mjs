/**
 * Test de fumée sur le build : lancer une partie, régler le temps, envoyer l'éclaireur.
 * En bureau puis en téléphone. Usage : pnpm build && pnpm e2e
 */
import assert from 'node:assert/strict'
import { launch } from './browser.mjs'
import { serveBuild } from './serve.mjs'

const { url, close } = await serveBuild()
const browser = await launch()
let failed = false

async function scenario(name, viewport, run) {
  const page = await browser.newPage({ viewport })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on(
    'console',
    (m) => m.type() === 'error' && !m.text().includes('fonts.g') && errors.push(m.text()),
  )
  try {
    await run(page)
    assert.deepEqual(errors, [], 'erreurs dans la page')
    console.log(`ok   ${name}`)
  } catch (e) {
    failed = true
    console.log(`FAIL ${name}\n     ${e.message}`)
    await page.screenshot({ path: `ci-out/e2e-${name}.png` }).catch(() => {})
  } finally {
    await page.close()
  }
}

const date = (page) => page.locator('[data-testid=date]').textContent()

async function startGame(page) {
  await page.goto(url)
  await page.fill('input[name=seed]', 'fumee')
  await page.click('button[type=submit]')
  await page.waitForSelector('[data-testid=date]')
}

await scenario('partie', { width: 1280, height: 720 }, async (page) => {
  await startGame(page)
  assert.match(await date(page), /janvier 12 000 av\. J\.-C\./)
  assert.equal(await page.locator('[data-testid=population]').textContent(), '12')
  assert.equal(await page.locator('.failure').count(), 0, 'la carte WebGL doit s’afficher')

  // Le temps est en pause au départ.
  await page.waitForTimeout(500)
  assert.match(await date(page), /janvier 12 000/)

  // Vitesse 5 au clavier, Espace pour lancer.
  await page.keyboard.press('Digit5')
  await page.keyboard.press('Space')
  await page.waitForFunction(
    () => !document.querySelector('[data-testid=date]')?.textContent?.includes('12 000'),
  )
  assert.equal(await page.locator('[data-testid=speed-5]').getAttribute('aria-pressed'), 'true')

  // Espace remet en pause : la date se fige.
  await page.keyboard.press('Space')
  await page.waitForTimeout(200)
  const frozen = await date(page)
  await page.waitForTimeout(600)
  assert.equal(await date(page), frozen)

  // L'éclaireur est choisi au départ ; un clic droit l'envoie.
  const map = page.locator('[data-testid=map]')
  const box = await map.boundingBox()
  await page.mouse.click(box.x + box.width / 2 + 60, box.y + box.height / 2, { button: 'right' })
  await page.click('[data-testid=speed-3]')
  await page.click('[data-testid=pause]')
  await page.waitForTimeout(1500)

  // Molette et glisser ne cassent rien.
  await page.mouse.move(box.x + 300, box.y + 300)
  await page.mouse.wheel(0, 400)
  await page.mouse.down()
  await page.mouse.move(box.x + 380, box.y + 340, { steps: 5 })
  await page.mouse.up()
  await page.screenshot({ path: 'ci-out/e2e-partie.png' })
})

await scenario('telephone', { width: 390, height: 844 }, async (page) => {
  await startGame(page)
  const bar = await page.locator('.topbar').boundingBox()
  assert.ok(bar.x >= 0 && bar.x + bar.width <= 390, 'la barre du haut tient dans l’écran')
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth)
  assert.ok(scroll <= 390, 'pas de défilement horizontal')
  await page.screenshot({ path: 'ci-out/e2e-telephone.png' })
})

await browser.close()
await close()
process.exit(failed ? 1 : 0)

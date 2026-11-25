// E2E: temi colore — selezione, applicazione ai token, persistenza e modalità chiara/scura. Modalità demo.
// Uso: npm run build && npx vite preview --port 4173 &  poi  node e2e/palettes.cjs [cartella-screenshot]
const { chromium } = require('playwright')
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FAIL', msg); if (!c) process.exitCode = 1 }
const IDS = [['Notte viola', 'notte'], ['Caffè bordeaux', 'bordeaux'], ['Foresta', 'foresta'], ['Rubino e blu', 'rubino'], ['Oceano', 'oceano'], ['Pesca e rosa', 'pesca']]
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'it-IT', colorScheme: 'dark' })
  await ctx.addInitScript(() => { localStorage.setItem('trainer:gate', 'skip'); localStorage.setItem('trainer:tutorial_completed', 'true'); localStorage.setItem('trainer:role', 'coach') })
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)))
  await p.goto('http://localhost:4173/'); await p.waitForSelector('text=Oggi')
  const tok = (n) => p.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), n)
  const base = await tok('--bg')
  await p.getByRole('button', { name: 'Impostazioni', exact: true }).first().click()
  await p.waitForTimeout(800)
  const look = p.getByRole('button', { name: /Aspetto/ })
  if ((await look.getAttribute('aria-expanded')) === 'false') await look.click()
  const seen = new Set([base])
  for (const [label, id] of IDS) {
    await p.getByRole('button', { name: label, exact: true }).click(); await p.waitForTimeout(250)
    ok((await p.evaluate(() => document.documentElement.dataset.palette)) === id, `«${label}» → data-palette=${id}`)
    const bg = await tok('--bg'); ok(!seen.has(bg), `${id}: sfondo scuro proprio (${bg})`); seen.add(bg)
    if (process.argv[2]) { await p.screenshot({ path: `${process.argv[2]}/pal-${id}-dark.png` }) }
  }
  // chiaro
  await p.getByRole('button', { name: 'Modalità chiara', exact: true }).click(); await p.waitForTimeout(250)
  const lightBg = await tok('--bg')
  ok(lightBg !== base && /^\d+ \d+ \d+$/.test(lightBg) && +lightBg.split(' ')[0] > 200, `modalità chiara con palette pesca: sfondo chiaro (${lightBg})`)
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] + '/pal-pesca-light.png' })
  // persistenza
  await p.reload(); await p.waitForSelector('text=Oggi')
  ok((await p.evaluate(() => document.documentElement.dataset.palette)) === 'pesca' && (await tok('--bg')) === lightBg, 'dopo il ricaricamento palette e modo restano')
  // ritorno al classico
  await p.getByRole('button', { name: 'Impostazioni', exact: true }).first().click()
  await p.waitForTimeout(800)
  const look2 = p.getByRole('button', { name: /Aspetto/ }); if ((await look2.getAttribute('aria-expanded')) === 'false') await look2.click()
  await p.locator('button', { hasText: /^Classico$/ }).click(); await p.waitForTimeout(250)
  ok((await p.evaluate(() => document.documentElement.dataset.palette)) === undefined, '«Classico» toglie la palette')
  ok(errs.length === 0, 'nessun errore in console ' + errs.join(' | '))
  await b.close()
})().catch((e) => { console.error('ERRORE', e); process.exit(1) })

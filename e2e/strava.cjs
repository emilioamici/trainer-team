// E2E: link all'attività Strava nel feedback — modalità demo. Nessuna chiamata a Strava.
// Uso: npm run build && npx vite preview --port 4173 &  poi  node e2e/strava.cjs [cartella-screenshot]
const { chromium } = require('playwright')
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FAIL', msg); if (!c) process.exitCode = 1 }
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'it-IT', colorScheme: 'dark' })
  await ctx.addInitScript(() => { localStorage.setItem('trainer:gate', 'skip'); localStorage.setItem('trainer:tutorial_completed', 'true'); localStorage.setItem('trainer:role', 'athlete') })
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)))
  await p.goto('http://localhost:4173/'); await p.waitForSelector('text=Oggi')
  await p.getByRole('button', { name: 'Completa & inserisci feedback' }).first().click(); await p.waitForTimeout(600)
  const f = p.getByPlaceholder('https://www.strava.com/activities/…')
  ok(await f.count() === 1, 'il feedback ha il campo «Attività Strava»')
  await f.fill('https://evil.example/activities/1')
  await p.getByRole('button', { name: 'Salva', exact: true }).click()
  ok(await p.getByText('Il link non sembra di Strava').count() === 1, 'link non Strava: errore e non si salva')
  await f.fill('Che corsa! https://www.strava.com/activities/12345678901?x=1. Ciao')
  await p.getByRole('button', { name: 'Salva', exact: true }).click(); await p.waitForTimeout(700)
  const a = p.getByRole('link', { name: 'Apri l’attività su Strava' })
  ok(await a.count() === 1, 'dopo il salvataggio compare «Apri l’attività su Strava»')
  ok((await a.getAttribute('href')) === 'https://www.strava.com/activities/12345678901?x=1' && (await a.getAttribute('target')) === '_blank' && /noopener/.test(await a.getAttribute('rel')), 'il link è quello pulito, in una nuova scheda, con noopener')
  if (process.argv[2]) { await a.scrollIntoViewIfNeeded(); await p.screenshot({ path: process.argv[2] + '/strava.png' }) }
  // il coach lo vede nel dettaglio
  ok(errs.length === 0, 'nessun errore in console ' + errs.join(' | '))
  await b.close()
})().catch((e) => { console.error('ERRORE', e); process.exit(1) })

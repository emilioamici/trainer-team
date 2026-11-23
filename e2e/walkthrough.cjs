// E2E del tour guidato (modalità demo, nessun account): ogni passo deve evidenziare un elemento reale.
// Uso: npm run build && npx vite preview --port 4173 &  poi  node e2e/walkthrough.cjs [cartella-screenshot]
const { chromium } = require('playwright')
const BASE = 'http://localhost:4173/'
const SHOTS = process.argv[2]
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FAIL', msg); if (!c) process.exitCode = 1 }

async function run(browser, role, viewport, scheme) {
  const ctx = await browser.newContext({ viewport, locale: 'it-IT', colorScheme: scheme })
  await ctx.addInitScript((role) => {
    localStorage.setItem('trainer:gate', 'skip'); localStorage.setItem('trainer:tutorial_completed', 'true'); localStorage.setItem('trainer:role', role)
  }, role)
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(String(e)))
  await p.goto(BASE); await p.waitForSelector('text=Oggi')
  const tag = `${role}-${viewport.width}-${scheme}`
  await p.getByRole('button', { name: 'Impostazioni', exact: true }).first().click()
  await p.getByRole('button', { name: 'Avvia', exact: true }).click()
  const dlg = p.getByRole('dialog', { name: 'Tour guidato' })
  await dlg.waitFor()
  const seen = []
  for (let n = 0; n < 20; n++) {
    await p.waitForTimeout(700)
    const counter = await dlg.locator('p.label').first().innerText()
    const title = await dlg.locator('h3').innerText()
    const spot = await p.evaluate(() => { const r = document.querySelector('.ring-2.ring-brand.absolute'); if (!r) return null; const b = r.getBoundingClientRect(); return { w: b.width, h: b.height, t: b.top, l: b.left } })
    const card = await p.evaluate(() => { const c = [...document.querySelectorAll('[role=dialog] .card')].pop(); const b = c.getBoundingClientRect(); return { t: b.top, l: b.left, r: b.right, b: b.bottom } })
    const vw = viewport.width, vh = viewport.height
    seen.push({ counter, title, spotlight: !!spot })
    ok(card.l >= 0 && card.r <= vw && card.t >= 0 && card.b <= vh, `${tag} · ${counter} «${title}»: suggerimento dentro lo schermo${spot ? ' + elemento evidenziato' : ' (al centro, senza elemento)'}`)
    if (SHOTS && [0, 1, 4, 5].includes(n)) await p.screenshot({ path: `${SHOTS}/tour-${tag}-${n}.png` })
    const label = await dlg.getByRole('button', { name: /^(Avanti|Fine)$/ }).innerText()
    if (/Fine/.test(label)) { await dlg.getByRole('button', { name: /Fine/ }).click(); break }
    await dlg.getByRole('button', { name: /Avanti/ }).click()
  }
  await dlg.waitFor({ state: 'detached' })
  ok(seen.length >= 8, `${tag}: tour completato in ${seen.length} passi`)
  ok(seen.filter((s) => s.spotlight).length >= seen.length - 2, `${tag}: quasi tutti i passi evidenziano un elemento (${seen.filter((s) => s.spotlight).length}/${seen.length})`)
  ok(await p.evaluate(() => localStorage.getItem('trainer:walkthrough_done')) === '1', `${tag}: completamento ricordato`)
  ok(errs.length === 0, `${tag}: nessun errore in console ${errs.join(' | ')}`)
  // Escape chiude
  await p.getByRole('button', { name: 'Impostazioni', exact: true }).first().click(); await p.getByRole('button', { name: 'Avvia', exact: true }).click()
  await dlg.waitFor(); await p.keyboard.press('Escape'); await dlg.waitFor({ state: 'detached' })
  ok(true, `${tag}: Esc chiude il tour`)
  await ctx.close()
  return seen
}

;(async () => {
  const b = await chromium.launch()
  for (const role of ['coach', 'athlete']) {
    await run(b, role, { width: 390, height: 844 }, 'light')
    await run(b, role, { width: 390, height: 844 }, 'dark')
  }
  await run(b, 'coach', { width: 1280, height: 800 }, 'light')
  await b.close()
})().catch((e) => { console.error('ERRORE', e); process.exit(1) })

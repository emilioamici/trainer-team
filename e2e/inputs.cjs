// E2E: su touch (iPhone) nessun campo di testo sotto i 16px, altrimenti iOS ingrandisce la pagina al tocco.
// Uso: npm run build && npx vite preview --port 4173 &  poi  node e2e/inputs.cjs
const { chromium, devices } = require('playwright')
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FAIL', msg); if (!c) process.exitCode = 1 }
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'it-IT', colorScheme: 'dark' })
  await ctx.addInitScript(() => { localStorage.setItem('trainer:gate', 'skip'); localStorage.setItem('trainer:tutorial_completed', 'true'); localStorage.setItem('trainer:role', 'coach') })
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)))
  await p.goto('http://localhost:4173/'); await p.waitForSelector('text=Oggi')
  const small = () => p.evaluate(() => [...document.querySelectorAll('input, textarea, select')]
    .filter((el) => !['checkbox', 'radio', 'range', 'file', 'color', 'hidden'].includes(el.type) && el.offsetParent !== null)
    .map((el) => ({ n: el.getAttribute('aria-label') || el.placeholder || el.type || el.tagName, fs: parseFloat(getComputedStyle(el).fontSize) }))
    .filter((x) => x.fs < 16))
  const check = async (what) => { const s = await small(); ok(s.length === 0, `${what}: nessun campo sotto 16px ${JSON.stringify(s)}`) }
  const nav = (n) => p.getByRole('navigation').getByRole('button', { name: n, exact: true }).click()
  // Atleti: scheda di condivisione/invito
  await nav('Atleti'); await p.waitForSelector('h1:has-text("Atleti")'); await p.waitForTimeout(500)
  await p.locator('article[data-tour="team-card"]').first().getByRole('button', { name: 'Impostazioni' }).click(); await p.waitForTimeout(900)
  await check('scheda atleta')
  const sh = p.getByRole('button', { name: /Condividi|Invita|invito/i }).first()
  if (await sh.count()) { await sh.click().catch(() => {}); await p.waitForTimeout(600); await check('invito atleta') }
  await p.keyboard.press('Escape'); await p.waitForTimeout(500)
  // Gruppi: nuovo gruppo
  await nav('Gruppi'); await p.waitForSelector('h1:has-text("Gruppi")'); await p.waitForTimeout(400)
  await p.getByRole('button', { name: 'Aggiungi', exact: true }).first().click(); await p.waitForTimeout(800); await check('nuovo gruppo')
  await p.keyboard.press('Escape'); await p.waitForTimeout(500)
  // Piano: editor allenamento e import
  await nav('Piano'); await p.waitForSelector('[aria-label="Nuovo allenamento"]')
  await p.getByRole('button', { name: 'Nuovo allenamento' }).click(); await p.waitForTimeout(800); await check('editor allenamento')
  await p.keyboard.press('Escape'); await p.waitForTimeout(500)
  await p.getByRole('button', { name: 'Importa / Esporta' }).click(); await p.getByRole('tab', { name: 'Importa' }).click(); await p.waitForTimeout(500); await check('importa')
  await p.keyboard.press('Escape'); await p.waitForTimeout(500)
  // campi con utility di testo piccolo (come l'email dell'invito): vincono comunque i 16px
  await p.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<input id="t1" class="input !py-1.5 !text-xs" type="email"><textarea id="t2" class="input !text-xs"></textarea><input id="t3" class="input font-mono text-[11px]"><select id="t4" class="input text-xs"><option>a</option></select>') })
  const fs = await p.evaluate(() => ['t1', 't2', 't3', 't4'].map((i) => parseFloat(getComputedStyle(document.getElementById(i)).fontSize)))
  ok(fs.every((x) => x >= 16), `campi con !text-xs / text-[11px] / select: ${fs.join(', ')} px`)
  await p.evaluate(() => ['t1', 't2', 't3', 't4'].forEach((i) => document.getElementById(i).remove()))
  // Impostazioni
  await p.getByRole('button', { name: 'Impostazioni', exact: true }).first().click(); await p.waitForTimeout(900); await check('impostazioni')
  ok(errs.length === 0, 'nessun errore in console ' + errs.join(' | '))
  await b.close()
})().catch((e) => { console.error('ERRORE', e); process.exit(1) })

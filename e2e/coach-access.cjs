// E2E: solo gli account indicati in VITE_COACH_EMAILS possono usare il ruolo Coach; la schermata di accesso segue il ruolo scelto.
// Serve una build fatta con:  VITE_COACH_EMAILS=coach@example.com npm run build  e  npx vite preview --port 4173 &
// Uso: node e2e/coach-access.cjs
const { chromium } = require('playwright')
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FAIL', msg); if (!c) process.exitCode = 1 }
const page = async (b, email, role) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'it-IT', colorScheme: 'dark' })
  await ctx.addInitScript(([r]) => {
    localStorage.setItem('trainer:gate', 'skip'); localStorage.setItem('trainer:tutorial_completed', 'true'); localStorage.setItem('trainer:role', r)
    sessionStorage.setItem('trainer:token', JSON.stringify({ token: 'tok', exp: Date.now() + 3600_000 }))
  }, [role])
  await ctx.route('https://www.googleapis.com/**', (r) => r.request().url().includes('/about') ? r.fulfill({ json: { user: { emailAddress: email, displayName: 'Prova' } } }) : r.fulfill({ status: 404, json: {} }))
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)))
  await p.goto('http://localhost:4173/'); await p.waitForSelector('text=Oggi'); await p.waitForTimeout(1200)
  return { ctx, p, errs }
}
const tabs = (p) => p.getByRole('navigation').getByRole('button').allInnerTexts().then((a) => a.map((x) => x.trim()).join('|'))
;(async () => {
  const b = await chromium.launch()
  // schermata di accesso: mascotte e testo
  const g = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'it-IT', colorScheme: 'dark' })
  const gp = await g.newPage(); await gp.goto('http://localhost:4173/'); await gp.waitForSelector('[aria-label="Accesso"]')
  const mascot = () => gp.locator('[aria-label="Accesso"] img[src*="mascot"]').first().getAttribute('src')
  ok(await gp.getByText('Sono il Coach').count() === 1 && await gp.getByText('Sono un coach').count() === 0, 'accesso: la scelta si chiama «Sono il Coach»')
  await gp.getByText('Sono un atleta').click(); await gp.waitForTimeout(300)
  ok(/mascot-atleta-bust/.test(await mascot()), 'accesso: con «atleta» la mascotte in alto è quella sorridente')
  await gp.getByText('Sono il Coach').click(); await gp.waitForTimeout(300)
  ok(/mascot-coach-bust/.test(await mascot()), 'accesso: con «coach» la mascotte in alto è quella con cappello e occhiali')
  ok(await gp.locator('[aria-label="Accesso"] img[src*="mascot"]').count() === 1, 'accesso: una sola mascotte')
  await g.close()
  // account non abilitato: da coach a atleta
  const A = await page(b, 'altro@example.com', 'coach')
  ok((await tabs(A.p)) === 'Oggi|Piano|Progressi', 'account non abilitato: il ruolo coach torna atleta (barra Oggi · Piano · Progressi)')
  await A.p.getByRole('button', { name: 'Impostazioni', exact: true }).first().click(); await A.p.waitForTimeout(900)
  ok(await A.p.getByRole('tab', { name: 'Coach' }).count() === 0 && await A.p.getByRole('tab', { name: 'Atleta' }).count() === 1, 'account non abilitato: in Impostazioni non c’è la scelta Coach')
  ok(A.errs.length === 0, 'nessun errore ' + A.errs.join('|')); await A.ctx.close()
  // account abilitato (maiuscole diverse): resta coach
  const C = await page(b, 'Coach@Example.com', 'coach')
  ok((await tabs(C.p)) === 'Oggi|Piano|Gruppi|Atleti', 'account abilitato: resta coach')
  await C.p.getByRole('button', { name: 'Impostazioni', exact: true }).first().click(); await C.p.waitForTimeout(900)
  ok(await C.p.getByRole('tab', { name: 'Coach' }).count() === 1, 'account abilitato: in Impostazioni c’è la scelta Coach')
  ok(C.errs.length === 0, 'nessun errore ' + C.errs.join('|')); await C.ctx.close()
  await b.close()
})().catch((e) => { console.error('ERRORE', e); process.exit(1) })

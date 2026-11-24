// E2E: schede del coach (Gruppi e Atleti al posto di Team) e Progressi dell'atleta — modalità demo, nessun account.
// Uso: npm run build && npx vite preview --port 4173 &  poi  node e2e/tabs.cjs [cartella-screenshot]
const { chromium } = require('playwright')
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FAIL', msg); if (!c) process.exitCode = 1 }
const mk = async (b, role, w = 390, h = 844) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'it-IT', colorScheme: 'dark' })
  await ctx.addInitScript((role) => { localStorage.setItem('trainer:gate', 'skip'); localStorage.setItem('trainer:tutorial_completed', 'true'); localStorage.setItem('trainer:role', role) }, role)
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)))
  await p.goto('http://localhost:4173/'); await p.waitForSelector('text=Oggi')
  return { ctx, p, errs }
}
;(async () => {
  const b = await chromium.launch()
  // ---- coach ----
  const C = await mk(b, 'coach'); const p = C.p
  const nav = () => p.getByRole('navigation').getByRole('button')
  ok((await nav().allInnerTexts()).map((x) => x.trim()).join('|') === 'Oggi|Piano|Gruppi|Atleti', 'coach: la barra ha Oggi · Piano · Gruppi · Atleti (niente più Team)')
  await p.getByRole('navigation').getByRole('button', { name: 'Gruppi', exact: true }).click(); await p.waitForSelector('h1:has-text("Gruppi")')
  const gTitles = await p.locator('article h2').allInnerTexts()
  ok(gTitles.length >= 1 && gTitles.every((x) => /Agonistica|Gruppo|U16|SAT|Under/i.test(x)), `scheda Gruppi: solo gruppi (${gTitles.join(' / ')})`)
  ok(await p.getByRole('tab', { name: /Tutti|Individual Athlete \(/ }).count() === 0, 'niente più filtro Tutti/Gruppi/Atleti dentro la pagina')
  await p.getByRole('button', { name: 'Aggiungi', exact: true }).first().click()
  ok(await p.getByRole('dialog', { name: /Nuovo gruppo scuola tennis/ }).count() === 1, 'da Gruppi «Aggiungi» propone un nuovo gruppo')
  await p.keyboard.press('Escape'); await p.waitForTimeout(500)
  await p.getByRole('navigation').getByRole('button', { name: 'Atleti', exact: true }).click(); await p.waitForSelector('h1:has-text("Atleti")')
  const aTitles = await p.locator('article h2').allInnerTexts()
  ok(aTitles.length >= 1 && aTitles.every((x) => !/Agonistica U16|Gruppo A/i.test(x)), `scheda Atleti: solo atleti individuali (${aTitles.join(' / ')})`)
  await p.getByRole('button', { name: 'Aggiungi', exact: true }).first().click()
  ok(await p.getByRole('dialog', { name: /Nuovo Individual Athlete/ }).count() === 1, 'da Atleti «Aggiungi» propone un nuovo atleta individuale')
  await p.keyboard.press('Escape'); await p.waitForTimeout(500)
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] + '/tabs-coach.png' })
  ok(C.errs.length === 0, 'coach: nessun errore in console ' + C.errs.join(' | '))
  // cambiando ruolo la scheda si adegua senza schermate vuote
  await p.getByRole('button', { name: 'Impostazioni', exact: true }).first().click()
  await p.getByRole('tab', { name: 'Atleta' }).click(); await p.keyboard.press('Escape'); await p.waitForTimeout(600)
  ok((await nav().allInnerTexts()).map((x) => x.trim()).join('|') === 'Oggi|Piano|Progressi' && await p.getByRole('heading', { level: 1, name: 'Progressi' }).count() === 1, 'cambiando ruolo in Atleta: barra Oggi · Piano · Progressi e pagina Progressi')
  await C.ctx.close()
  // ---- atleta ----
  const A = await mk(b, 'athlete'); const a = A.p
  ok((await a.getByRole('navigation').getByRole('button').allInnerTexts()).map((x) => x.trim()).join('|') === 'Oggi|Piano|Progressi', 'atleta: la barra resta Oggi · Piano · Progressi')
  // desktop: barra laterale con 4 voci
  const D = await mk(b, 'coach', 1280, 800)
  ok(await D.p.getByRole('navigation').getByRole('button', { name: 'Gruppi', exact: true }).isVisible() && await D.p.getByRole('navigation').getByRole('button', { name: 'Atleti', exact: true }).isVisible(), 'desktop: Gruppi e Atleti nella barra laterale')
  await b.close()
})().catch((e) => { console.error('ERRORE', e); process.exit(1) })

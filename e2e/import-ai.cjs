// E2E: schermata «Importa piano» — prompt per l'AI copiabile e importabile con la risposta (anche dentro un blocco ```), campo data allineato.
// Uso: npm run build && npx vite preview --port 4173 &  poi  node e2e/import-ai.cjs [cartella-screenshot]
const { chromium } = require('playwright')
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FAIL', msg); if (!c) process.exitCode = 1 }
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'it-IT', colorScheme: 'dark', permissions: ['clipboard-read', 'clipboard-write'] })
  await ctx.addInitScript(() => { localStorage.setItem('trainer:gate', 'skip'); localStorage.setItem('trainer:tutorial_completed', 'true'); localStorage.setItem('trainer:role', 'coach') })
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)))
  await p.goto('http://localhost:4173/'); await p.waitForSelector('text=Oggi')
  await p.getByRole('navigation').getByRole('button', { name: 'Team', exact: true }).click()
  await p.getByRole('button', { name: 'Importa / Esporta' }).click()
  await p.getByRole('tab', { name: 'Importa' }).click()
  const fold = p.getByRole('button', { name: /Hai già un piano in un file/ })
  ok((await fold.getAttribute('aria-expanded')) === 'false', 'la sezione del prompt è collassata di default')
  const order = await p.evaluate(() => { const f = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Hai già un piano in un file')); const c = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Scegli un file JSON')); return f && c ? (f.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : false })
  ok(order, 'la sezione sta sopra «Scegli un file JSON»')
  await fold.click()
  await p.getByRole('button', { name: 'Copia il prompt per l’AI' }).click()
  const clip = await p.evaluate(() => navigator.clipboard.readText())
  ok(clip.includes('trainer-team-plan') && clip.includes('- run_quality:') && clip.includes('- hyrox:') && /"athlete": "[^"]+"/.test(clip), 'il prompt copiato contiene formato, discipline e nome atleta')
  // l'esempio dentro il prompt è JSON valido
  const jsonStart = clip.indexOf('{\n  "format"'); const ex = clip.slice(jsonStart, clip.indexOf('\n}\n', jsonStart) + 2)
  let parsed = null; try { parsed = JSON.parse(ex) } catch { /* sotto */ }
  ok(parsed && parsed.sessions.length === 2, 'l’esempio dentro il prompt è un JSON valido')
  // risposta tipica di un'AI: dentro un blocco di codice, con testo attorno
  const reply = 'Ecco il piano convertito:\n```json\n' + JSON.stringify({ format: 'trainer-team-plan', version: 1, athlete: 'X', sessions: [{ date: '2026-12-01', title: 'Corsa facile', discipline: 'recovery', blocks: [{ phase: 'main', title: '8 km', distance: '8 km' }] }, { date: '2026-12-03', title: 'Forza', discipline: 'strength' }] }) + '\n```\nSpero sia utile!'
  await p.getByRole('textbox', { name: '…oppure incolla il JSON' }).fill(reply)
  await p.getByRole('button', { name: 'Importa nel piano' }).click()
  await p.waitForSelector('text=Importate 2 sessioni')
  ok(true, 'la risposta dell’AI (con ``` e testo attorno) si importa: 2 sessioni')
  // allineamento del campo data: dentro il contenitore, non oltre
  await p.getByRole('button', { name: 'Importa / Esporta' }).click(); await p.getByRole('tab', { name: 'Importa' }).click()
  const geo = await p.evaluate(() => { const d = document.querySelector('input[type=date]'); const r = d.getBoundingClientRect(); const ta = document.querySelector('textarea:not([readonly])').getBoundingClientRect(); return { dl: r.left, dr: r.right, tl: ta.left, tr: ta.right, vw: innerWidth } })
  ok(Math.abs(geo.dl - geo.tl) < 1.5 && Math.abs(geo.dr - geo.tr) < 1.5 && geo.dr <= geo.vw, `il campo data è allineato alla textarea (${Math.round(geo.dl)}–${Math.round(geo.dr)} vs ${Math.round(geo.tl)}–${Math.round(geo.tr)})`)
  if (process.argv[2]) { await p.getByRole('button', { name: /Hai già un piano in un file/ }).scrollIntoViewIfNeeded(); await p.screenshot({ path: process.argv[2] + '/import-ai.png' }) }
  ok(errs.length === 0, 'nessun errore in console ' + errs.join(' | '))
  await b.close()
})().catch((e) => { console.error('ERRORE', e); process.exit(1) })

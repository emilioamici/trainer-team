// E2E: «Converti un file con l'AI» — Worker e Gemini simulati con page.route (nessun account, nessuna chiave).
// Uso: npm run build && npx vite preview --port 4173 &  poi  node e2e/ai-import.cjs [cartella-screenshot]
const { chromium } = require('playwright')
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FAIL', msg); if (!c) process.exitCode = 1 }
const W = 'https://worker.test'
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'it-IT', colorScheme: 'dark' })
  await ctx.addInitScript(() => {
    localStorage.setItem('trainer:gate', 'skip'); localStorage.setItem('trainer:tutorial_completed', 'true'); localStorage.setItem('trainer:role', 'coach')
    localStorage.setItem('trainer:cfg:pushUrl', 'https://worker.test')
    sessionStorage.setItem('trainer:token', JSON.stringify({ token: 'tok-fake', exp: Date.now() + 3600_000 }))
  })
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
  let sent = null; let mode = 'ok'
  await ctx.route(W + '/**', async (r) => {
    const req = r.request(); const u = new URL(req.url())
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors })
    if (u.pathname === '/health') return r.fulfill({ json: { ok: true, auth: true, push: false, bridge: false, ai: true }, headers: cors })
    if (u.pathname === '/ai/import') {
      sent = { auth: req.headers()['authorization'], body: JSON.parse(req.postData() || '{}') }
      if (mode === 'limit') return r.fulfill({ status: 429, json: { error: 'Hai usato tutte le 10 importazioni AI di questo mese' }, headers: cors })
      const plan = { format: 'trainer-team-plan', version: 1, athlete: 'X', sessions: [{ date: '2026-12-01', title: 'Corsa da AI', discipline: 'run_easy', blocks: [{ phase: 'main', title: 'Corsa', duration: "40'" }] }] }
      return r.fulfill({ json: { text: '```json\n' + JSON.stringify(plan) + '\n```', used: 1, limit: 10, remaining: 9 }, headers: cors })
    }
    return r.fulfill({ status: 404, json: {}, headers: cors })
  })
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)))
  await p.goto('http://localhost:4173/'); await p.waitForSelector('text=Oggi')
  await p.getByRole('navigation').getByRole('button', { name: 'Gruppi', exact: true }).click()
  await p.getByRole('button', { name: 'Importa / Esporta' }).click(); await p.getByRole('tab', { name: 'Importa' }).click()
  const fold = p.getByRole('button', { name: /Hai già un piano in un file/ })
  if ((await fold.getAttribute('aria-expanded')) === 'false') await fold.click()
  const btn = p.getByRole('button', { name: 'Converti un file con l’AI' })
  ok(await btn.count() === 1, 'con il Worker che ha l’AI attiva compare «Converti un file con l’AI»')
  // file non supportato
  const chooser = p.waitForEvent('filechooser'); await btn.click(); await (await chooser).setFiles({ name: 'scheda.xlsx', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('x') })
  await p.waitForSelector('text=Formato non supportato')
  ok(sent === null, 'Excel: rifiutato dall’app, niente viene inviato')
  // PDF
  const c2 = p.waitForEvent('filechooser'); await btn.click(); await (await c2).setFiles({ name: 'scheda.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 prova') })
  await p.waitForSelector('text=Importazioni AI rimaste questo mese: 9 su 10')
  ok(sent && sent.auth === 'Bearer tok-fake' && sent.body.mimeType === 'application/pdf' && Buffer.from(sent.body.data, 'base64').toString().startsWith('%PDF') && sent.body.prompt.includes('trainer-team-plan'), 'inviati file in base64, tipo, prompt e token dell’utente')
  const ta = await p.getByRole('textbox', { name: '…oppure incolla il JSON' }).inputValue()
  ok(ta.startsWith('{') && ta.includes('Corsa da AI') && !ta.includes('```'), 'il JSON (senza ```) compare nella casella per il controllo')
  if (process.argv[2]) { await btn.scrollIntoViewIfNeeded(); await p.screenshot({ path: process.argv[2] + '/ai-import.png' }) }
  await p.getByRole('button', { name: 'Importa nel piano' }).click()
  await p.waitForSelector('text=Importate 1 sessioni')
  ok(true, 'il risultato si importa come un normale JSON')
  // limite mensile
  mode = 'limit'
  await p.getByRole('button', { name: 'Importa / Esporta' }).click(); await p.getByRole('tab', { name: 'Importa' }).click()
  if ((await p.getByRole('button', { name: /Hai già un piano in un file/ }).getAttribute('aria-expanded')) === 'false') await p.getByRole('button', { name: /Hai già un piano in un file/ }).click()
  const c3 = p.waitForEvent('filechooser'); await p.getByRole('button', { name: 'Converti un file con l’AI' }).click(); await (await c3).setFiles({ name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') })
  await p.waitForSelector('text=Hai usato tutte le 10 importazioni AI')
  ok(true, 'oltre il tetto mensile l’app mostra il messaggio del Worker')
  ok(errs.length === 0, 'nessun errore in console ' + errs.join(' | '))
  await b.close()
})().catch((e) => { console.error('ERRORE', e); process.exit(1) })

// E2E del lato client del Worker (accesso persistente + notifiche in coda), Worker/Google/Drive SIMULATI.
// (base: stesso mock di drive-flow.cjs) Uso: come drive-flow.cjs.
// E2E del flusso coach → invito → atleta → feedback con Google/Drive/Picker SIMULATI (nessun account reale).
// Uso: npm run build && npx vite preview --port 4173 &  poi  node e2e/drive-flow.cjs   (richiede il modulo 'playwright' e Chromium).
const { chromium } = require('playwright')
const BASE = 'http://localhost:4173/'
const log = []; const workerCalls = []; let gisHits = 0
const files = new Map() // id -> {name, content, version, owner, props, shares:Set, granted:Set}
let n = 0
const emailOf = (req) => (req.headers()['authorization'] || '').replace('Bearer tok-', '')
const metaOf = (f, user) => ({ id: f.id, name: f.name, version: String(f.version), modifiedTime: new Date().toISOString(), ownedByMe: f.owner === user, capabilities: { canEdit: true } })
const canSee = (f, u) => f.owner === u || f.granted.has(u)

async function setup(browser, email, who) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'it-IT' })
  await ctx.addInitScript((email) => {
    localStorage.setItem('trainer:cfg:clientId', 'cid.apps.googleusercontent.com')
    localStorage.setItem('trainer:cfg:apiKey', 'key'); localStorage.setItem('trainer:cfg:appId', '123')
    localStorage.setItem('trainer:demo', '0'); localStorage.setItem('trainer:tutorial_completed', 'true'); localStorage.setItem('trainer:cfg:pushUrl', 'https://worker.test')
    window.__email = email
  }, email)
  await ctx.route('https://accounts.google.com/gsi/client', (r) => { gisHits++; return r.fulfill({ contentType: 'text/javascript', body: `
    window.google = { accounts: { oauth2: { initTokenClient: (c) => ({ requestAccessToken: () => setTimeout(() => c.callback({ access_token: 'tok-' + window.__email, expires_in: 3600 }), 10) }), revoke: () => {} } } }` }) })
  await ctx.route('https://apis.google.com/js/api.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `window.gapi = { load: (n, o) => o.callback() }; window.google = window.google || {}; window.google.picker = { ViewId: { DOCS: 1 }, DocsView: class { setFileIds(id) { this.id = id; return this } }, PickerBuilder: class {
        addView(v) { this.v = v; return this } setOAuthToken(t) { this.t = t; return this } setDeveloperKey() { return this } setAppId() { return this }
        setCallback(cb) { this.cb = cb; return this }
        build() { const s = this; return { setVisible: async () => { await fetch('https://www.googleapis.com/__grant?id=' + s.v.id, { headers: { Authorization: 'Bearer ' + s.t } }); s.cb({ action: 'picked', docs: [{ id: s.v.id }] }) } } } } }` }))
  await ctx.route('https://www.googleapis.com/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const user = emailOf(req)
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
    const json = (o, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(o) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const p = u.pathname
    if (p === '/__grant') { files.get(u.searchParams.get('id')).granted.add(user); return json({}) }
    if (p === '/drive/v3/about') return json({ user: { emailAddress: user, displayName: user } })
    if (p === '/upload/drive/v3/files' && req.method() === 'POST') {
      const body = req.postData(); const parts = body.split(/--tt\w+/).filter((x) => x.includes('Content-Type'))
      const meta = JSON.parse(parts[0].split('\r\n\r\n')[1].trim()); const content = parts[1].split('\r\n\r\n')[1].replace(/\r\n$/, '')
      const id = 'file' + String(++n).padStart(12, '0')
      const f = { id, name: meta.name, content, version: 1, owner: user, props: meta.appProperties, granted: new Set(), shares: [] }
      files.set(id, f); return json(metaOf(f, user))
    }
    const m = p.match(/\/files\/([^/]+?)(\/permissions)?$/)
    if (p === '/drive/v3/files') {
      const list = [...files.values()].filter((f) => f.owner === user && f.props?.trainerteam === 'registry')
      return json({ files: list.map((f) => metaOf(f, user)) })
    }
    if (m) {
      const f = files.get(m[1])
      if (!f || !canSee(f, user)) return json({ error: { message: 'File not found' } }, 404)
      if (m[2]) { f.shares.push(JSON.parse(req.postData())); f.granted.add(JSON.parse(req.postData()).emailAddress); return json({}) } // condiviso ≠ accesso con drive.file: serve il Picker
      if (req.method() === 'PATCH') { f.content = req.postData(); f.version++; log.push('drive-update:' + f.id); return json(metaOf(f, user)) }
      if (u.searchParams.get('alt') === 'media') return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: f.content })
      return json(metaOf(f, user))
    }
    return json({ error: { message: 'unhandled ' + p } }, 500)
  })
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
  await ctx.route('https://worker.test/**', async (route) => {
    const req = route.request(); const u = new URL(req.url())
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const j = (o) => route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(o) })
    if (u.pathname === '/health') return j({ ok: true, auth: true, push: true })
    if (u.pathname === '/auth/start') return route.fulfill({ status: 302, headers: { location: 'http://localhost:4173/#trainer_session=sess-' + who } })
    const entry = { path: u.pathname, auth: req.headers()['authorization'], body: req.postData() ? JSON.parse(req.postData()) : null, who }
    workerCalls.push(entry)
    if (u.pathname === '/auth/refresh') return j({ access_token: 'tok-' + email, expires_in: 3600, email })
    if (u.pathname === '/notify') { log.push('notify:' + entry.body.fileId + ':' + entry.body.title + ':' + entry.body.body); return j({ sent: 1, failed: 0, removed: 0 }) }
    return j({ ok: true })
  })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errs.push(m.text()) })
  return { ctx, page, errs }
}
const nav = (p, name) => p.getByRole('navigation').getByRole('button', { name, exact: true }).click()
const openSettings = (p) => p.getByRole('button', { name: 'Impostazioni', exact: true }).first().click()
const syncNow = async (p) => { await p.getByRole('button', { name: 'Sincronizza', exact: true }).click(); await p.waitForTimeout(1500) }
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FAIL', msg); if (!c) process.exitCode = 1 }
const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`


const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const b = await chromium.launch()
  const C = await setup(b, 'coach@x.it', 'coach'); const cp = C.page
  await cp.goto(BASE); await cp.waitForSelector('text=Oggi')
  await cp.getByRole('button', { name: /Sono un coach/ }).click()
  await cp.getByRole('button', { name: 'Continua con Google' }).click()
  await cp.waitForSelector('text=Collegato a Google come coach@x.it', { timeout: 10000 })
  ok(true, 'login via Worker: ritorno con sessione e account riconosciuto')
  ok(gisHits === 0, 'nessun popup/script di Google Identity Services usato')
  ok(workerCalls.some((c) => c.path === '/auth/refresh' && c.auth === 'Bearer sess-coach'), 'token ottenuto dal Worker con la sessione (non dal browser)')
  ok(await cp.evaluate(() => localStorage.getItem('trainer:session')) === 'sess-coach' && !(await cp.evaluate(() => location.hash)), 'sessione salvata e tolta dalla barra degli indirizzi')

  // rinnovo senza popup dopo la scadenza del token
  await cp.evaluate(() => sessionStorage.clear()); await cp.reload(); await cp.waitForSelector('text=Oggi'); await sleep(1500)
  await openSettings(cp)
  ok(await cp.getByText('Accesso persistente attivo').count() > 0 || (await cp.getByRole('button', { name: /Sincronizzazione e account/ }).click(), await cp.getByText('Accesso persistente attivo').count() > 0), 'dopo scadenza token: riaccesso silenzioso, "Accesso persistente attivo"')
  ok(gisHits === 0, 'ancora nessun popup')
  await cp.keyboard.press('Escape')

  // coach crea atleta, invita, aggiunge un allenamento
  await nav(cp, 'Atleti'); await cp.getByRole('button', { name: 'Aggiungi', exact: true }).first().click()
  await cp.getByRole('tab', { name: 'Individual Athlete', exact: true }).click()
  await cp.getByLabel('Nome atleta').fill('Luca Rossi'); await cp.getByLabel('Email Google dell’atleta (facoltativa per invito)').fill('atleta@x.it')
  await cp.getByRole('button', { name: 'Crea atleta' }).click()
  await nav(cp, 'Atleti'); await cp.getByRole('button', { name: 'Impostazioni', exact: true }).nth(1).click() // scheda dell'atleta (la creazione apre il suo piano)
  await cp.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value.startsWith('file0000')), null, { timeout: 8000 })
  const f = [...files.values()].find((x) => x.props?.trainerteam === 'athlete' && x.name.includes('luca'))
  await cp.keyboard.press('Escape')
  await cp.getByRole('button', { name: /Vedi piano/ }).first().click(); await cp.waitForSelector('text=Piano')
  await cp.getByRole('button', { name: 'Nuovo allenamento' }).click()
  await cp.getByLabel('Titolo').fill('Test 10 km'); await cp.getByRole('button', { name: 'Salva', exact: true }).click()
  await sleep(4500)
  const n1 = log.filter((x) => x.startsWith('notify:'))
  ok(n1.length === 1 && n1[0] === `notify:${f.id}:Piano aggiornato:Il coach ha modificato «Test 10 km»`, 'coach: avviso "Piano aggiornato" inviato al Worker per il file giusto')
  ok(log.lastIndexOf('drive-update:' + f.id) < log.findIndex((x) => x.startsWith('notify:')), 'l’avviso parte DOPO l’invio dei dati a Drive')

  // atleta: login, collega, completa
  const A = await setup(b, 'atleta@x.it', 'atleta'); const ap = A.page
  await ap.goto(BASE); await ap.waitForSelector('text=Oggi')
  await ap.getByRole('button', { name: /Sono un atleta/ }).click(); await ap.getByRole('button', { name: 'Continua con Google' }).click()
  await ap.waitForSelector('text=Collegato a Google come atleta@x.it', { timeout: 10000 })
  await openSettings(ap); await ap.getByRole('button', { name: /Collegati a un Coach/ }).click()
  await ap.getByLabel('Link d’invito o codice').fill(f.id); await ap.getByRole('button', { name: 'Collega', exact: true }).click(); await ap.waitForSelector('text=Collegato!')
  await ap.keyboard.press('Escape'); await nav(ap, 'Oggi'); await ap.waitForSelector('text=Test 10 km')
  await ap.getByRole('button', { name: 'Completa & inserisci feedback' }).click()
  await ap.getByRole('button', { name: '8', exact: true }).click(); await ap.getByRole('button', { name: 'Salva', exact: true }).click()
  await sleep(4500)
  const n2 = log.filter((x) => x.startsWith('notify:') && x.includes('Luca Rossi'))
  ok(n2.length === 1 && n2[0].endsWith('Completato: Test 10 km · RPE 8'), 'atleta: avviso "Completato · RPE 8" con il nome dell’atleta')

  // offline: la modifica resta in coda e l'avviso parte alla riconnessione
  await A.ctx.setOffline(true)
  await ap.getByRole('button', { name: 'Modifica feedback' }).click(); await ap.getByRole('tab', { name: 'Parziale' }).click(); await ap.getByRole('button', { name: 'Salva', exact: true }).click()
  await sleep(3500)
  ok(log.filter((x) => x.includes('Parziale')).length === 0, 'offline: nessun avviso finché i dati non sono su Drive')
  await A.ctx.setOffline(false); await ap.evaluate(() => window.dispatchEvent(new Event('online'))); await sleep(5000)
  ok(log.filter((x) => x.includes('Parziale: Test 10 km')).length === 1, 'alla riconnessione: dati su Drive, poi avviso (una volta sola)')

  // scollega: logout sul Worker e sessione cancellata
  await openSettings(cp); const h = cp.getByRole('button', { name: /Sincronizzazione e account/ }); if ((await h.getAttribute('aria-expanded')) === 'false') await h.click()
  await cp.getByRole('button', { name: 'Scollega account' }).click(); await sleep(800)
  ok(workerCalls.some((c) => c.path === '/auth/logout' && c.who === 'coach') && !(await cp.evaluate(() => localStorage.getItem('trainer:session'))), 'scollega: logout sul Worker e sessione rimossa')
  console.log('errori console coach:', C.errs, ' atleta:', A.errs)
  await b.close()
})().catch((e) => { console.error('ERRORE', e); process.exit(1) })

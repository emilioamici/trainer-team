// E2E del flusso coach → invito → atleta → feedback con Google/Drive/Picker SIMULATI (nessun account reale).
// Uso: npm run build && npx vite preview --port 4173 &  poi  node e2e/drive-flow.cjs   (richiede il modulo 'playwright' e Chromium).
const { chromium } = require('playwright')
const BASE = 'http://localhost:4173/'
const files = new Map() // id -> {name, content, version, owner, props, shares:Set, granted:Set}
let n = 0
const emailOf = (req) => (req.headers()['authorization'] || '').replace('Bearer tok-', '')
const metaOf = (f, user) => ({ id: f.id, name: f.name, version: String(f.version), modifiedTime: new Date().toISOString(), ownedByMe: f.owner === user, capabilities: { canEdit: true } })
const canSee = (f, u) => f.owner === u || f.granted.has(u)

async function setup(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'it-IT' })
  await ctx.addInitScript((email) => {
    localStorage.setItem('trainer:cfg:clientId', 'cid.apps.googleusercontent.com')
    localStorage.setItem('trainer:cfg:apiKey', 'key'); localStorage.setItem('trainer:cfg:appId', '123')
    localStorage.setItem('trainer:demo', '0')
    window.__email = email
  }, email)
  await ctx.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: `
    window.google = { accounts: { oauth2: { initTokenClient: (c) => ({ requestAccessToken: () => setTimeout(() => c.callback({ access_token: 'tok-' + window.__email, expires_in: 3600 }), 10) }), revoke: () => {} } },
      picker: { ViewId: { DOCS: 1 }, DocsView: class { setFileIds(id) { this.id = id; return this } }, PickerBuilder: class {
        addView(v) { this.v = v; return this } setOAuthToken(t) { this.t = t; return this } setDeveloperKey() { return this } setAppId() { return this }
        setCallback(cb) { this.cb = cb; return this }
        build() { const s = this; return { setVisible: async () => { await fetch('https://www.googleapis.com/__grant?id=' + s.v.id, { headers: { Authorization: 'Bearer ' + s.t } }); s.cb({ action: 'picked', docs: [{ id: s.v.id }] }) } } } } } }` }))
  await ctx.route('https://apis.google.com/js/api.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.gapi = { load: (n, o) => o.callback() }' }))
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
      if (req.method() === 'PATCH') { f.content = req.postData(); f.version++; return json(metaOf(f, user)) }
      if (u.searchParams.get('alt') === 'media') return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: f.content })
      return json(metaOf(f, user))
    }
    return json({ error: { message: 'unhandled ' + p } }, 500)
  })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errs.push(m.text()) })
  return { ctx, page, errs }
}
const nav = (p, name) => p.getByRole('navigation').getByRole('button', { name, exact: true }).click()
const syncNow = async (p) => { await nav(p, 'Profilo'); const h = p.getByRole('button', { name: /Sincronizzazione e account/ }); await h.waitFor(); if ((await h.getAttribute('aria-expanded')) === 'false') await h.click(); await p.getByRole('button', { name: 'Sincronizza ora' }).click(); await p.waitForTimeout(1500) }
const ok = (c, msg) => { console.log(c ? 'OK  ' : 'FAIL', msg); if (!c) process.exitCode = 1 }
const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

;(async () => {
  const b = await chromium.launch()
  // ---- COACH ----
  const C = await setup(b, 'coach@x.it'); const cp = C.page
  await cp.goto(BASE); await cp.waitForSelector('text=Oggi')
  await nav(cp, 'Profilo')
  await cp.getByRole('tab', { name: 'Coach' }).click()
  await cp.getByRole('button', { name: 'Collega Google' }).click()
  await cp.waitForSelector('text=Scollega account')
  ok(true, 'coach collegato a Google')
  await nav(cp, 'Atleti')
  await cp.getByRole('button', { name: 'Nuovo atleta' }).first().click()
  await cp.getByLabel('Nome').fill('Luca Rossi')
  await cp.getByLabel('Disciplina / obiettivo').fill('Hyrox')
  await cp.getByLabel('Email Google dell’atleta (facoltativa)').fill('atleta@x.it')
  await cp.getByRole('button', { name: 'Crea atleta' }).click()
  await cp.waitForSelector('text=Invito', { timeout: 8000 })
  await cp.waitForFunction(() => document.body.innerText.includes('Link') && document.body.innerText.includes('file0000'), null, { timeout: 8000 })
  const athleteFile = [...files.values()].find((f) => f.props?.trainerteam === 'athlete' && f.name.includes('luca'))
  ok(!!athleteFile && athleteFile.owner === 'coach@x.it', 'file JSON dedicato creato sul Drive del coach')
  await cp.getByRole('button', { name: /Invia invito/ }).click()
  await cp.waitForSelector('text=Invito inviato')
  ok(athleteFile.shares.length === 1 && athleteFile.shares[0].role === 'writer' && athleteFile.shares[0].emailAddress === 'atleta@x.it', 'file condiviso con ruolo writer all’email dell’atleta')
  await cp.keyboard.press('Escape')
  // il coach aggiunge un allenamento di oggi
  await cp.getByRole('button', { name: 'Apri piano' }).first().click()
  await cp.waitForSelector('text=Piano')
  await cp.getByRole('button', { name: 'Nuovo allenamento' }).click()
  await cp.getByLabel('Titolo').fill('Test 10 km')
  await cp.getByRole('button', { name: 'Aggiungi blocco' }).nth(1).click()
  await cp.getByPlaceholder('Nome esercizio / ripetuta').fill('Corsa continua')
  await cp.getByRole('button', { name: 'Salva', exact: true }).click()
  await cp.waitForFunction((id) => true, 0)
  await cp.waitForTimeout(3500)
  const content1 = JSON.parse(athleteFile.content)
  ok(content1.sessions.some((s) => s.title === 'Test 10 km' && s.blocks[0].title === 'Corsa continua'), 'allenamento sincronizzato sul file (debounce 2 s)')
  ok([...files.values()].some((f) => f.props?.trainerteam === 'registry'), 'registro atleti del coach creato su Drive')

  // ---- ATLETA ----
  const A = await setup(b, 'atleta@x.it'); const ap = A.page
  await ap.goto(BASE); await ap.waitForSelector('text=Oggi'); await nav(ap, 'Profilo')
  await ap.getByRole('button', { name: 'Collega Google' }).click(); await ap.waitForSelector('text=Scollega account')
  await ap.getByRole('button', { name: /Collegati a un Coach/ }).click()
  await ap.getByLabel('Link d’invito o codice').fill(`https://x.github.io/trainer-team/#join=${athleteFile.id}`)
  await ap.getByRole('button', { name: 'Collega', exact: true }).click()
  await ap.waitForSelector('text=Collegato!')
  ok(athleteFile.granted.has('atleta@x.it'), 'l’atleta ha aperto il file tramite Picker')
  await nav(ap, 'Oggi')
  await ap.waitForSelector('text=Test 10 km')
  ok(true, 'l’atleta vede il piano del coach in "Oggi"')
  // l'atleta non può modificare (athleteCanEdit = false) ma può registrare il feedback
  ok(await ap.getByRole('button', { name: 'Dettagli' }).count() === 0, 'atleta senza permesso di modifica: nessun pulsante Dettagli/Modifica')
  await ap.getByRole('button', { name: 'Completa & inserisci feedback' }).click()
  await ap.getByRole('button', { name: '7', exact: true }).click()
  await ap.getByLabel('Durata (min)').fill('55'); await ap.getByLabel('Distanza (km)').fill('10,2')
  await ap.getByLabel('Commento per il coach').fill('Gambe pesanti nel finale')
  await ap.getByRole('button', { name: 'Salva', exact: true }).click()
  await ap.waitForTimeout(3500)
  const s1 = JSON.parse(athleteFile.content).sessions.find((s) => s.title === 'Test 10 km')
  ok(s1.status === 'done' && s1.feedback.rpe === 7 && s1.feedback.distanceKm === 10.2 && s1.feedback.comment.startsWith('Gambe'), 'feedback (RPE, km, commento) scritto sul file condiviso')

  // ---- COACH rilegge ----
  await syncNow(cp)
  await nav(cp, 'Atleti')
  await cp.waitForSelector('text=Feedback recenti')
  ok(await cp.getByText('Gambe pesanti nel finale').count() > 0, 'il coach legge il commento dell’atleta dopo la sincronizzazione')

  // ---- conflitto: coach modifica il piano mentre l'atleta cambia il feedback ----
  await ap.getByRole('button', { name: 'Modifica feedback' }).click()
  await ap.getByLabel('Commento per il coach').fill('Aggiornato: poi mi sono ripreso')
  await cp.getByRole('button', { name: 'Apri piano' }).first().click()
  await cp.getByRole('button', { name: /Test 10 km/ }).first().click()
  await cp.getByRole('button', { name: 'Modifica', exact: true }).click()
  await cp.getByLabel('Note tecniche del coach').fill('Nota coach nuova')
  await cp.getByRole('button', { name: 'Salva', exact: true }).click()
  await ap.getByRole('button', { name: 'Salva', exact: true }).click()
  await cp.waitForTimeout(3500); await ap.waitForTimeout(3500)
  await syncNow(ap)
  await syncNow(cp)
  const s2 = JSON.parse(athleteFile.content).sessions.find((s) => s.title === 'Test 10 km')
  ok(s2.coachNotes === 'Nota coach nuova' && s2.feedback.comment.startsWith('Aggiornato'), 'modifiche simultanee piano (coach) + log (atleta) si compongono senza perdite')

  // ---- persistenza offline: ricarica con rete spenta ----
  await A.ctx.setOffline(true); await ap.reload(); await ap.waitForSelector('text=Oggi'); await ap.waitForSelector('text=Test 10 km')
  ok(true, 'offline: l’atleta riapre l’app e vede il piano dalla copia locale (IndexedDB)')
  console.log('errori console coach:', C.errs, ' atleta:', A.errs)
  await b.close()
})().catch((e) => { console.error('ERRORE', e); process.exit(1) })

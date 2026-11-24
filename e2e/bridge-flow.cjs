// E2E del ponte del Worker: l'atleta entra con il solo CODICE (senza email condivisa e con chiave API del Picker non valida),
// legge e scrive il piano dal ponte, riceve gli inviti da solo. Worker/Google/Drive SIMULATI.
// Il Drive simulato rispetta drive.file: un file condiviso NON è accessibile direttamente dall'altro account.
// (base: stesso mock di drive-flow.cjs) Uso: come drive-flow.cjs.
// E2E del flusso coach → invito → atleta → feedback con Google/Drive/Picker SIMULATI (nessun account reale).
// Uso: npm run build && npx vite preview --port 4173 &  poi  node e2e/drive-flow.cjs   (richiede il modulo 'playwright' e Chromium).
const { chromium } = require('playwright')
const BASE = 'http://localhost:4173/'
const log = []; const workerCalls = []; let gisHits = 0; let pickerOpened = 0; const houses = new Set(); const inv = new Map()
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
    localStorage.setItem('trainer:demo', '0'); localStorage.setItem('trainer:tutorial_completed', 'true'); localStorage.setItem('trainer:cfg:pushUrl', 'https://worker.test'); localStorage.setItem('trainer:cfg:apiKey', 'CHIAVE-NON-VALIDA')
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
    if (p === '/__grant') { pickerOpened++; files.get(u.searchParams.get('id')).granted.add(user); return json({}) }
    if (p === '/drive/v3/about') return json({ user: { emailAddress: user, displayName: user } })
    if (p === '/upload/drive/v3/files' && req.method() === 'POST') {
      const body = req.postData(); const parts = body.split(/--tt\w+/).filter((x) => x.includes('Content-Type'))
      const meta = JSON.parse(parts[0].split('\r\n\r\n')[1].trim()); const content = parts[1].split('\r\n\r\n')[1].replace(/\r\n$/, '')
      const id = 'file' + String(++n).padStart(12, '0')
      const f = { id, name: meta.name, content, version: 1, owner: user, props: meta.appProperties, granted: new Set(), shared: new Set(), shares: [] }
      files.set(id, f); return json(metaOf(f, user))
    }
    const m = p.match(/\/files\/([^/]+?)(\/permissions)?$/)
    if (p === '/drive/v3/files') {
      const list = [...files.values()].filter((f) => f.owner === user && f.props?.trainerteam === 'registry')
      return json({ files: list.map((f) => metaOf(f, user)) })
    }
    const mp = p.match(/\/files\/([^/]+)\/permissions\/([^/]+)$/)
    if (mp && req.method() === 'DELETE') { const f = files.get(mp[1]); if (!f || f.owner !== user) return json({ error: { message: 'no' } }, 404); f.shared.delete(decodeURIComponent(mp[2]).replace('perm-', '')); f.granted.delete(decodeURIComponent(mp[2]).replace('perm-', '')); log.push('unshare:' + mp[2]); return route.fulfill({ status: 204, headers: cors }) }
    if (m) {
      const f = files.get(m[1])
      if (!f || !canSee(f, user)) return json({ error: { message: 'File not found' } }, 404)
      if (m[2] && req.method() === 'GET') return json({ permissions: [{ id: 'perm-owner', emailAddress: f.owner, role: 'owner' }, ...[...f.shared].map((e) => ({ id: 'perm-' + e, emailAddress: e, role: 'writer' }))] })
      if (m[2]) { f.shares.push(JSON.parse(req.postData())); f.shared.add(JSON.parse(req.postData()).emailAddress); return json({}) } // condiviso ≠ accesso con drive.file: serve il Picker
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
    const me = emailOf(req)
    const jerr = (status, error) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify({ error }) })
    if (u.pathname === '/health') return j({ ok: true, auth: true, push: true, bridge: true })
    if (u.pathname === '/auth/start') return route.fulfill({ status: 302, headers: { location: 'http://localhost:4173/#trainer_session=sess-' + who } })
    const entry = { path: u.pathname, auth: req.headers()['authorization'], body: req.postData() ? JSON.parse(req.postData()) : null, who }
    workerCalls.push(entry)
    const body = entry.body || {}; const f = body.fileId ? files.get(body.fileId) : null
    const member = (f) => f && (f.owner === me || f.shared.has(me))
    if (u.pathname === '/house/register') { if (!f || f.owner !== me) return jerr(403, 'Solo il proprietario'); houses.add(f.id); for (const e of f.shared) inv.set(e, [...new Set([...(inv.get(e) || []), f.id])]); return j({ ok: true }) }
    if (u.pathname === '/house/unregister') { if (!f || f.owner !== me) return jerr(403, 'Solo il proprietario'); houses.delete(f.id); log.push('unregister'); return j({ ok: true }) }
    if (u.pathname === '/house/join') { if (!f || !houses.has(f.id)) return jerr(404, 'Codice non valido o piano non collegato'); const joined = !member(f); f.shared.add(me); inv.set(me, [...new Set([...(inv.get(me) || []), f.id])]); log.push('join:' + me); return j({ ok: true, joined, name: f.name }) }
    if (u.pathname === '/house/mine') return j({ houses: (inv.get(me) || []).map((id) => files.get(id)).filter((x) => houses.has(x.id) && member(x)).map((x) => ({ id: x.id, name: x.name, modifiedTime: 'now' })) })
    if (u.pathname === '/db/meta' || u.pathname === '/db/read' || u.pathname === '/db/write') {
      if (!houses.has(body.fileId)) return jerr(404, 'Piano non collegato al ponte')
      if (!member(f)) return jerr(403, 'Il file non è condiviso con questo account')
      const meta = { id: f.id, name: f.name, version: String(f.version), modifiedTime: 'now' }
      if (u.pathname === '/db/meta') return j({ meta, canEdit: true })
      if (u.pathname === '/db/read') return j({ meta, canEdit: true, db: JSON.parse(f.content) })
      if (body.expectedVersion !== String(f.version)) return jerr(409, 'Versione cambiata')
      f.content = JSON.stringify(body.db); f.version++; log.push('bridge-write:' + me)
      return j({ meta: { ...meta, version: String(f.version) }, canEdit: true })
    }
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
  // ---- COACH: crea un atleta SENZA email ----
  const C = await setup(b, 'coach@x.it', 'coach'); const cp = C.page
  await cp.goto(BASE); await cp.waitForSelector('text=Oggi')
  await cp.getByRole('button', { name: /Sono un coach/ }).click(); await cp.getByRole('button', { name: 'Continua con Google' }).click()
  await cp.waitForSelector('text=Collegato a Google come coach@x.it', { timeout: 10000 })
  await nav(cp, 'Atleti'); await cp.getByRole('button', { name: 'Aggiungi', exact: true }).first().click()
  await cp.getByRole('tab', { name: 'Individual Athlete', exact: true }).click()
  await cp.getByLabel('Nome atleta').fill('Luca Rossi')
  await cp.getByRole('button', { name: 'Crea atleta' }).click()
  await nav(cp, 'Atleti'); await cp.getByRole('button', { name: 'Impostazioni', exact: true }).nth(1).click()
  await cp.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value.startsWith('file0000')), null, { timeout: 8000 })
  const f = [...files.values()].find((x) => x.props?.trainerteam === 'athlete' && x.name.includes('luca'))
  ok(await cp.getByText('Il codice basta').count() > 0, 'coach: la scheda dice che il codice basta (ponte attivo)')
  await sleep(1500)
  ok(houses.has(f.id), 'il piano dell’atleta è registrato sul ponte dal coach')
  await cp.keyboard.press('Escape')
  await cp.getByRole('button', { name: /Vedi piano/ }).first().click(); await cp.waitForSelector('text=Piano')
  await cp.getByRole('button', { name: 'Nuovo allenamento' }).click(); await cp.getByLabel('Titolo').fill('Test 10 km'); await cp.getByRole('button', { name: 'Salva', exact: true }).click()
  await sleep(3500)

  // ---- ATLETA: solo il codice, chiave API del Picker NON valida ----
  const A = await setup(b, 'atleta@x.it', 'atleta'); const ap = A.page
  await ap.goto(BASE); await ap.waitForSelector('text=Oggi')
  await ap.getByRole('button', { name: /Sono un atleta/ }).click(); await ap.getByRole('button', { name: 'Continua con Google' }).click()
  await ap.getByRole('dialog', { name: 'Accesso' }).waitFor({ state: 'detached' })
  ok(!f.shared.has('atleta@x.it'), 'prima: il file NON è condiviso con l’atleta (nessuna email inserita)')
  await openSettings(ap); await ap.getByRole('button', { name: /Collegati a un Coach/ }).click()
  await ap.getByLabel('Link d’invito o codice').fill(f.id)
  await ap.getByRole('button', { name: 'Collega', exact: true }).click()
  await ap.waitForSelector('text=Collegato!', { timeout: 10000 })
  ok(pickerOpened === 0, 'il Picker non viene mai aperto: la chiave API non valida non serve più')
  ok(f.shared.has('atleta@x.it') && log.includes('join:atleta@x.it'), 'il Worker ha condiviso il file con l’account dell’atleta (condivisione su Drive = autorizzazione)')
  await ap.keyboard.press('Escape'); await nav(ap, 'Oggi'); await ap.waitForSelector('text=Test 10 km')
  ok(true, 'l’atleta vede il piano del coach (letto dal ponte)')

  // ---- ordine dei piani: dopo il collegamento il piano del coach è il PRINCIPALE; si può riordinare dalle impostazioni ----
  const tabs = () => ap.getByRole('tablist', { name: 'Piano attivo' }).getByRole('tab')
  ok((await tabs().first().innerText()).includes('Luca Rossi') && (await tabs().first().getAttribute('aria-selected')) === 'true', 'dopo il collegamento il piano del coach è il primo ed è quello attivo (non il mio)')
  await openSettings(ap); await ap.getByRole('button', { name: /Ordine dei piani/ }).click()
  await ap.getByRole('button', { name: 'Sposta su: Il mio piano' }).click(); await ap.keyboard.press('Escape')
  await ap.reload(); await ap.waitForSelector('text=Oggi'); await sleep(800)
  ok((await tabs().first().innerText()).includes('Il mio piano') && (await tabs().first().getAttribute('aria-selected')) === 'true', 'dopo il riordino e il riavvio il piano principale è il mio (l’ordine resta salvato)')
  await openSettings(ap); { const h = ap.getByRole('button', { name: /Ordine dei piani/ }); if ((await h.getAttribute('aria-expanded')) === 'false') await h.click() } // lo stato aperto si ricorda
  await ap.getByRole('button', { name: 'Sposta su: Luca Rossi' }).click(); await ap.keyboard.press('Escape')
  await ap.reload(); await ap.waitForSelector('text=Oggi'); await ap.waitForSelector('text=Test 10 km')

  // feedback dell'atleta: scritto dal ponte
  await ap.getByRole('button', { name: 'Completa & inserisci feedback' }).click()
  await ap.getByRole('button', { name: '7', exact: true }).click(); await ap.getByLabel('Commento per il coach').fill('Via ponte')
  await ap.getByRole('button', { name: 'Salva', exact: true }).click(); await sleep(4500)
  const saved = JSON.parse(f.content).sessions.find((s) => s.title === 'Test 10 km')
  ok(log.includes('bridge-write:atleta@x.it') && saved.status === 'done' && saved.feedback.comment === 'Via ponte', 'feedback scritto sul file dall’atleta passando dal ponte')
  await syncNow(cp); await nav(cp, 'Atleti'); await cp.waitForSelector('text=Ultimi feedback')
  ok(await cp.getByText('Via ponte').count() > 0, 'il coach legge il feedback dell’atleta')

  // conflitto: il coach modifica mentre l'atleta ha una versione vecchia → 409 gestito con merge, nessuna perdita
  await cp.getByRole('button', { name: /Vedi piano/ }).first().click()
  await cp.getByRole('button', { name: /Test 10 km/ }).first().click(); await cp.getByRole('button', { name: 'Modifica', exact: true }).click()
  await cp.getByLabel('Note tecniche del coach').fill('Nota del coach'); await cp.getByRole('button', { name: 'Salva', exact: true }).click(); await sleep(3500)
  await ap.getByRole('button', { name: 'Modifica feedback' }).click(); await ap.getByLabel('Commento per il coach').fill('Via ponte 2'); await ap.getByRole('button', { name: 'Salva', exact: true }).click()
  await sleep(7000)
  const s2 = JSON.parse(f.content).sessions.find((s) => s.title === 'Test 10 km')
  ok(s2.coachNotes === 'Nota del coach' && s2.feedback.comment === 'Via ponte 2', 'scritture concorrenti dal ponte: 409 gestito con rilettura e merge, nessuna perdita')

  // ---- atleta di un GRUPPO: niente presenze né componenti, solo gli allenamenti ----
  { const doc = JSON.parse(f.content); const later = new Date(Date.now() + 120000).toISOString()
    doc.athlete = { ...doc.athlete, targetKind: 'group', members: ['Anna', 'Bruno'], updatedAt: later }
    const sess = doc.sessions.find((x) => x.title === 'Test 10 km'); sess.attendance = ['Anna']; sess.planUpdatedAt = later; sess.updatedAt = later
    f.content = JSON.stringify(doc); f.version++ }
  await syncNow(ap); await nav(ap, 'Oggi'); await ap.waitForSelector('text=Test 10 km')
  ok(await ap.getByText(/presenti/i).count() === 0 && await ap.getByText('Anna').count() === 0, 'atleta di un gruppo: nessuna presenza né componente in "Oggi"')
  await nav(ap, 'Piano'); await ap.waitForSelector('text=Test 10 km')
  ok(await ap.getByText('Anna').count() === 0 && await ap.getByText('1/2').count() === 0, 'atleta di un gruppo: nessun conteggio presenze nel piano')
  await syncNow(cp); await nav(cp, 'Piano'); await cp.waitForSelector('text=Test 10 km')
  ok(await cp.getByText('1/2').count() > 0, 'il coach continua a vedere i conteggi delle presenze')
  // si torna a un atleta singolo per le prove successive
  { const doc = JSON.parse(f.content); const later = new Date(Date.now() + 240000).toISOString(); doc.athlete = { ...doc.athlete, targetKind: 'individual', members: [], updatedAt: later }; f.content = JSON.stringify(doc); f.version++ }
  await syncNow(cp); await syncNow(ap)

  // ---- atleta singolo già condiviso: niente codice, «Annulla condivisione» ----
  await nav(cp, 'Atleti'); await cp.locator('article', { hasText: 'Luca Rossi' }).getByRole('button', { name: 'Impostazioni', exact: true }).click()
  await cp.getByRole('button', { name: 'Annulla condivisione' }).first().waitFor()
  ok(await cp.evaluate(() => ![...document.querySelectorAll('input')].some((i) => i.value.startsWith('file0000'))), 'atleta singolo già condiviso: il codice non è mostrato')
  ok(await cp.getByText('Condiviso con atleta@x.it').count() > 0, 'viene mostrato con chi è condiviso')
  if (process.env.SHOT) await cp.screenshot({ path: process.env.SHOT + '/shared.png' })
  await cp.getByRole('button', { name: 'Annulla condivisione' }).first().click()
  await cp.getByRole('button', { name: 'Annulla condivisione' }).last().click()
  await cp.getByRole('button', { name: 'Riattiva il codice' }).waitFor({ timeout: 8000 })
  if (process.env.SHOT) await cp.screenshot({ path: process.env.SHOT + '/closed.png' })
  ok(!f.shared.has('atleta@x.it') && !houses.has(f.id), 'condivisione tolta su Drive e file scollegato dal ponte (il vecchio codice non rientra)')
  await sleep(2500)
  ok(!houses.has(f.id), 'dopo la sincronizzazione il coach non lo ri-registra da solo')
  await syncNow(ap); await sleep(1500)
  await cp.getByRole('button', { name: 'Riattiva il codice' }).click(); await sleep(1500)
  ok(houses.has(f.id), '«Riattiva il codice» registra di nuovo il piano sul ponte')
  await cp.keyboard.press('Escape')

  // ---- SECONDO ATLETA: il coach inserisce la sua email → inviti automatici, senza codice ----
  await cp.getByRole('button', { name: 'Impostazioni', exact: true }).first().click()
  await cp.keyboard.press('Escape')
  await nav(cp, 'Atleti'); await cp.getByRole('button', { name: 'Aggiungi', exact: true }).first().click()
  await cp.getByRole('tab', { name: 'Individual Athlete', exact: true }).click()
  await cp.getByLabel('Nome atleta').fill('Anna Verdi'); await cp.getByLabel('Email Google dell’atleta (facoltativa per invito)').fill('anna@x.it')
  await cp.getByRole('button', { name: 'Crea atleta' }).click()
  await nav(cp, 'Atleti')
  await cp.locator('article', { hasText: 'Anna Verdi' }).getByRole('button', { name: 'Impostazioni', exact: true }).click()
  await cp.waitForFunction(() => [...document.querySelectorAll('input')].filter((i) => i.value.startsWith('file0000')).length > 0, null, { timeout: 8000 })
  await cp.getByRole('button', { name: 'Invia', exact: true }).click(); await cp.waitForSelector('text=Invito inviato')
  await cp.keyboard.press('Escape'); await sleep(1500)
  const g = [...files.values()].find((x) => x.props?.trainerteam === 'athlete' && x.name.includes('anna'))
  ok(houses.has(g.id) && g.shared.has('anna@x.it'), 'invito con email: file condiviso e piano registrato sul ponte')
  const N = await setup(b, 'anna@x.it', 'anna'); const np = N.page
  await np.goto(BASE); await np.waitForSelector('text=Oggi')
  await np.getByRole('button', { name: /Sono un atleta/ }).click(); await np.getByRole('button', { name: 'Continua con Google' }).click()
  await np.waitForSelector('text=Collegato al piano di Anna Verdi', { timeout: 15000 })
  ok(pickerOpened === 0, 'invito trovato da solo dopo l’accesso e collegato automaticamente (nessun codice, nessun Picker)')
  console.log('errori console coach:', C.errs, ' atleta:', A.errs, ' anna:', N.errs)
  await b.close()
})().catch((e) => { console.error('ERRORE', e); process.exit(1) })

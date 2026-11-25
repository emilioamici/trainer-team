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
  ok(errs.length === 0, 'nessun errore in console ' + errs.join(' | '))
  await ctx.close()

  // ---- con il server Strava (simulato): si sceglie dall'elenco, niente incolla ----
  const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'it-IT', colorScheme: 'dark' })
  await c2.addInitScript(() => {
    localStorage.setItem('trainer:gate', 'skip'); localStorage.setItem('trainer:tutorial_completed', 'true'); localStorage.setItem('trainer:role', 'athlete')
    localStorage.setItem('trainer:cfg:pushUrl', 'https://worker.test')
    sessionStorage.setItem('trainer:token', JSON.stringify({ token: 'tok-fake', exp: Date.now() + 3600_000 }))
  })
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
  let connected = true; let asked = null; let connectCalled = null
  await c2.route('https://worker.test/**', async (r) => {
    const req = r.request(); const u = new URL(req.url())
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors })
    if (u.pathname === '/health') return r.fulfill({ json: { ok: true, auth: true, push: false, bridge: false, ai: false, strava: true }, headers: cors })
    if (u.pathname === '/strava/status') return r.fulfill({ json: { connected, full: false }, headers: cors })
    if (u.pathname === '/strava/activities') { asked = JSON.parse(req.postData() || '{}'); return r.fulfill({ json: { activities: [{ id: 777, name: 'Corsa del mattino', sport: 'Run', date: '2026-11-25T07:30:00' }, { id: 778, name: 'Giro in bici', sport: 'Ride', date: '2026-11-25T17:00:00' }] }, headers: cors }) }
    if (u.pathname === '/strava/disconnect') { connected = false; return r.fulfill({ json: { ok: true }, headers: cors }) }
    if (u.pathname === '/strava/connect') { connectCalled = JSON.parse(req.postData() || '{}'); return r.fulfill({ json: { url: 'https://www.strava.com/oauth/authorize?state=x' }, headers: cors }) }
    return r.fulfill({ status: 404, json: {}, headers: cors })
  })
  await c2.route('https://www.strava.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Strava</h1>' }))
  const q = await c2.newPage(); q.on('pageerror', (e) => errs.push(String(e)))
  await q.goto('http://localhost:4173/'); await q.waitForSelector('text=Oggi')
  await q.getByRole('button', { name: 'Completa & inserisci feedback' }).first().click(); await q.waitForTimeout(700)
  ok(await q.getByPlaceholder('https://www.strava.com/activities/…').count() === 0, 'con Strava attivo non si deve incollare nessun link')
  await q.getByRole('button', { name: 'Scegli un’attività Strava' }).click(); await q.waitForSelector('text=Corsa del mattino')
  ok(asked && asked.after && asked.before && asked.before > asked.after, 'l’elenco chiede le attività intorno alla data dell’allenamento')
  ok(await q.getByText('Giro in bici').count() === 1, 'elenco: nome e sport delle attività')
  await q.getByText('Corsa del mattino').click(); await q.waitForTimeout(500)
  ok(await q.getByRole('link', { name: /Corsa del mattino/ }).count() === 1, 'l’attività scelta compare nel feedback')
  await q.getByRole('button', { name: 'Salva', exact: true }).click(); await q.waitForTimeout(700)
  const l = q.getByRole('link', { name: 'Apri l’attività su Strava' })
  ok((await l.getAttribute('href')) === 'https://www.strava.com/activities/777', 'salvato solo il link all’attività scelta')
  if (process.argv[2]) { await q.screenshot({ path: process.argv[2] + '/strava-picked.png' }) }
  // impostazioni: scollega, poi collega
  await q.getByRole('button', { name: 'Impostazioni', exact: true }).first().click(); await q.waitForTimeout(800)
  const acc = q.getByRole('button', { name: /^Strava/ }).first()
  if ((await acc.getAttribute('aria-expanded')) === 'false') await acc.click()
  await q.getByRole('button', { name: 'Scollega Strava' }).click()
  await q.getByRole('button', { name: 'Collega Strava' }).waitFor()
  ok(true, 'impostazioni: scollega Strava → compare «Collega Strava»')
  await q.getByRole('button', { name: 'Collega Strava' }).click(); await q.waitForURL('https://www.strava.com/**')
  ok(connectCalled && /localhost:4173/.test(connectCalled.return), 'collega: si va al consenso di Strava con l’indirizzo di ritorno dell’app')
  // ritorno dal consenso
  await q.goto('http://localhost:4173/#strava=ok'); await q.waitForSelector('text=Strava collegato!')
  ok(!(await q.url()).includes('strava='), 'al ritorno il frammento #strava=ok viene tolto dall’indirizzo')
  ok(errs.length === 0, 'nessun errore in console ' + errs.join(' | '))
  await b.close()
})().catch((e) => { console.error('ERRORE', e); process.exit(1) })

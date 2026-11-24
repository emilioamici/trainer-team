import { bridgeReady, canAccessFile, dbMeta, dbRead, dbWrite, houseJoin, houseMine, houseRegister, houseUnregister } from './bridge'
import { emailOf, exchangeCode, refreshAccess, revoke, SCOPE, verifyBearer } from './google'
import { HttpError, allowedOrigins, json, randomId, seal, unseal, type Env } from './util'
import { isPushHost, sendPush, type PushPayload, type PushSub } from './webpush'

const DAY = 86_400
const SESSION_TTL = 180 * DAY
const RENEW_AFTER_MS = 30 * DAY * 1000
const MAX_DEVICES = 5
const MAX_FILES = 40
const MAX_RECIPIENTS = 20
const MAX_BODY = 8 * 1024

interface Device { endpoint: string; p256dh: string; auth: string; fileIds: string[]; updatedAt: number }
interface SubRecord { devices: Device[] }
interface Session { refresh: string; email: string; renewedAt: number }

const authReady = (env: Env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_KEY)
const pushReady = (env: Env) => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT)

const corsHeaders = (env: Env, req: Request): Record<string, string> => {
  const o = req.headers.get('origin')
  if (o && allowedOrigins(env).has(o)) return { 'access-control-allow-origin': o, vary: 'Origin', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-max-age': '86400' }
  return {}
}

const readJson = async <T>(req: Request): Promise<T> => {
  const text = await req.text()
  if (text.length > MAX_BODY) throw new HttpError(413, 'Richiesta troppo grande')
  try { return JSON.parse(text) as T } catch { throw new HttpError(400, 'JSON non valido') }
}

const validReturn = (env: Env, ret: string | null): URL => {
  try {
    const u = new URL(ret || '')
    if (allowedOrigins(env).has(u.origin)) { u.hash = ''; return u }
  } catch { /* sotto */ }
  throw new HttpError(400, 'Indirizzo di ritorno non autorizzato')
}

// ================= accesso persistente (OAuth "broker") =================
async function authStart(env: Env, url: URL): Promise<Response> {
  if (!authReady(env)) throw new HttpError(503, 'Accesso persistente non configurato')
  const ret = validReturn(env, url.searchParams.get('return'))
  const state = randomId(24)
  await env.KV.put(`st:${state}`, JSON.stringify({ ret: ret.toString() }), { expirationTtl: 600 })
  const g = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  g.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: `${url.origin}/auth/callback`, response_type: 'code', scope: SCOPE,
    access_type: 'offline', prompt: 'consent', state, include_granted_scopes: 'false',
    ...(url.searchParams.get('hint') ? { login_hint: url.searchParams.get('hint')! } : {}),
  }).toString()
  return Response.redirect(g.toString(), 302)
}

async function authCallback(env: Env, url: URL): Promise<Response> {
  const state = url.searchParams.get('state') || ''
  const raw = await env.KV.get(`st:${state}`)
  if (!raw) throw new HttpError(400, 'Richiesta scaduta: riprova dall’app')
  await env.KV.delete(`st:${state}`)
  const ret = new URL((JSON.parse(raw) as { ret: string }).ret)
  const back = (frag: string) => { ret.hash = frag; return Response.redirect(ret.toString(), 302) }
  const code = url.searchParams.get('code')
  if (url.searchParams.get('error') || !code) return back('trainer_error=denied')
  const tok = await exchangeCode(env, code, `${url.origin}/auth/callback`)
  if (!tok.ok || !tok.access_token || !tok.refresh_token) return back('trainer_error=exchange')
  const email = await emailOf(tok.access_token)
  const id = randomId(32)
  await env.KV.put(`sess:${id}`, await seal(env, { refresh: tok.refresh_token, email, renewedAt: Date.now() } satisfies Session), { expirationTtl: SESSION_TTL })
  return back(`trainer_session=${id}`) // all'app arriva solo l'identificativo casuale: il token di rinnovo non esce dal Worker
}

const sessionId = (req: Request) => {
  const id = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!/^[\w-]{20,80}$/.test(id)) throw new HttpError(401, 'Sessione non valida')
  return id
}

async function authRefresh(env: Env, req: Request, cors: Record<string, string>): Promise<Response> {
  const id = sessionId(req)
  const raw = await env.KV.get(`sess:${id}`)
  if (!raw) throw new HttpError(401, 'invalid_grant')
  const s = await unseal<Session>(env, raw)
  const r = await refreshAccess(env, s.refresh)
  if (!r.ok || !r.access_token) {
    if (r.error === 'invalid_grant') { await env.KV.delete(`sess:${id}`); throw new HttpError(401, 'invalid_grant') }
    throw new HttpError(502, 'Google non risponde')
  }
  if (Date.now() - s.renewedAt > RENEW_AFTER_MS) await env.KV.put(`sess:${id}`, await seal(env, { ...s, renewedAt: Date.now() }), { expirationTtl: SESSION_TTL })
  return json({ access_token: r.access_token, expires_in: r.expires_in ?? 3600, email: s.email }, 200, cors)
}

async function authLogout(env: Env, req: Request, cors: Record<string, string>): Promise<Response> {
  const id = sessionId(req)
  const raw = await env.KV.get(`sess:${id}`)
  if (raw) { try { await revoke((await unseal<Session>(env, raw)).refresh) } catch { /* ignora */ } await env.KV.delete(`sess:${id}`) }
  return json({ ok: true }, 200, cors)
}

// ================= notifiche push =================
const getSubs = async (env: Env, email: string): Promise<SubRecord> => {
  const raw = await env.KV.get(`sub:${email}`)
  return raw ? (JSON.parse(raw) as SubRecord) : { devices: [] }
}
const putSubs = (env: Env, email: string, rec: SubRecord) => env.KV.put(`sub:${email}`, JSON.stringify(rec), { expirationTtl: SESSION_TTL })

async function subscribe(env: Env, req: Request, cors: Record<string, string>): Promise<Response> {
  if (!pushReady(env)) throw new HttpError(503, 'Push non configurato')
  const me = await verifyBearer(env, req)
  const body = await readJson<{ subscription?: PushSub; fileIds?: string[] }>(req)
  const sub = body.subscription
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth || !isPushHost(sub.endpoint)) throw new HttpError(400, 'Iscrizione non valida')
  const wanted = [...new Set((body.fileIds ?? []).filter((x) => typeof x === 'string'))].slice(0, MAX_FILES)
  const rec = await getSubs(env, me.email)
  let dev = rec.devices.find((d) => d.endpoint === sub.endpoint)
  if (!dev) {
    dev = { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, fileIds: [], updatedAt: Date.now() }
    rec.devices = [...rec.devices, dev].slice(-MAX_DEVICES)
  }
  dev.p256dh = sub.keys.p256dh; dev.auth = sub.keys.auth; dev.updatedAt = Date.now()
  // l'accesso si verifica (con il token dell'utente) solo per i file nuovi di questo dispositivo
  const fresh = wanted.filter((f) => !dev!.fileIds.includes(f))
  const ok = await Promise.all(fresh.map((f) => canAccessFile(env, me, f)))
  const verified = new Set([...dev.fileIds.filter((f) => wanted.includes(f)), ...fresh.filter((_, i) => ok[i])])
  dev.fileIds = [...verified]
  for (const f of fresh.filter((_, i) => ok[i])) {
    const raw = await env.KV.get(`fid:${f}`)
    const list: string[] = raw ? JSON.parse(raw) : []
    if (!list.includes(me.email)) await env.KV.put(`fid:${f}`, JSON.stringify([...list, me.email].slice(-50)), { expirationTtl: SESSION_TTL })
  }
  await putSubs(env, me.email, rec)
  return json({ ok: true, devices: rec.devices.length, files: dev.fileIds.length }, 200, cors)
}

async function unsubscribe(env: Env, req: Request, cors: Record<string, string>): Promise<Response> {
  const me = await verifyBearer(env, req)
  const { endpoint } = await readJson<{ endpoint?: string }>(req)
  const rec = await getSubs(env, me.email)
  rec.devices = rec.devices.filter((d) => d.endpoint !== endpoint)
  await putSubs(env, me.email, rec)
  return json({ ok: true }, 200, cors)
}

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.slice(0, n) : '')

async function deliver(env: Env, targets: { email: string; filter?: string }[], payload: PushPayload) {
  const out = { sent: 0, failed: 0, removed: 0, codes: [] as number[] }
  for (const t of targets.slice(0, MAX_RECIPIENTS)) {
    const rec = await getSubs(env, t.email)
    const keep: Device[] = []
    for (const d of rec.devices) {
      if (t.filter && !d.fileIds.includes(t.filter)) { keep.push(d); continue }
      let status = 0
      try { status = await sendPush(env, { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload) } catch { status = 0 }
      if (status >= 200 && status < 300) { out.sent++; keep.push(d) }
      else if (status === 404 || status === 410) out.removed++
      else { out.failed++; out.codes.push(status); keep.push(d) }
    }
    if (keep.length !== rec.devices.length) await putSubs(env, t.email, { devices: keep })
  }
  return out
}

/** Notifica a chi condivide il file (esclusi i dispositivi di chi invia). Chi invia deve avere accesso al file. */
async function notify(env: Env, req: Request, cors: Record<string, string>): Promise<Response> {
  if (!pushReady(env)) throw new HttpError(503, 'Push non configurato')
  const me = await verifyBearer(env, req)
  const b = await readJson<{ fileId?: string; title?: string; body?: string; tag?: string; url?: string }>(req)
  const fileId = clip(b.fileId, 100)
  if (!(await canAccessFile(env, me, fileId))) throw new HttpError(403, 'Nessun accesso al file')
  const raw = await env.KV.get(`fid:${fileId}`)
  const emails = ((raw ? JSON.parse(raw) : []) as string[]).filter((e) => e !== me.email)
  const url = b.url && allowedOrigins(env).has(new URL(b.url).origin) ? b.url : undefined
  const res = await deliver(env, emails.map((email) => ({ email, filter: fileId })), { title: clip(b.title, 120) || 'Trainer Team', body: clip(b.body, 240), tag: clip(b.tag, 80) || undefined, url })
  return json(res, 200, cors)
}

/** Prova di invio: notifica ai dispositivi di chi la chiede. */
async function selfTest(env: Env, req: Request, cors: Record<string, string>): Promise<Response> {
  if (!pushReady(env)) throw new HttpError(503, 'Push non configurato')
  const me = await verifyBearer(env, req)
  const b = await readJson<{ title?: string; body?: string; url?: string }>(req)
  const url = b.url && allowedOrigins(env).has(new URL(b.url).origin) ? b.url : undefined
  return json(await deliver(env, [{ email: me.email }], { title: clip(b.title, 120) || 'Trainer Team', body: clip(b.body, 240), tag: 'test', url }), 200, cors)
}

// ================= router =================
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const cors = corsHeaders(env, req)
    try {
      if (req.method === 'OPTIONS') return new Response(null, { status: cors['access-control-allow-origin'] ? 204 : 403, headers: cors })
      if (url.pathname === '/health') return json({ ok: true, auth: authReady(env), push: pushReady(env), bridge: bridgeReady(env) }, 200, cors)
      // navigazione del browser: l'origine non c'è, l'indirizzo di ritorno viene validato
      if (req.method === 'GET' && url.pathname === '/auth/start') return await authStart(env, url)
      if (req.method === 'GET' && url.pathname === '/auth/callback') return await authCallback(env, url)
      // dal browser: solo dalle origini autorizzate
      if (req.method === 'POST') {
        if (!cors['access-control-allow-origin']) throw new HttpError(403, 'Origine non autorizzata')
        switch (url.pathname) {
          case '/auth/refresh': return await authRefresh(env, req, cors)
          case '/auth/logout': return await authLogout(env, req, cors)
          case '/subscribe': return await subscribe(env, req, cors)
          case '/unsubscribe': return await unsubscribe(env, req, cors)
          case '/notify': return await notify(env, req, cors)
          case '/test': return await selfTest(env, req, cors)
          case '/house/register': return await houseRegister(env, req, cors)
          case '/house/unregister': return await houseUnregister(env, req, cors)
          case '/house/join': return await houseJoin(env, req, cors)
          case '/house/mine': return await houseMine(env, req, cors)
          case '/db/meta': return await dbMeta(env, req, cors)
          case '/db/read': return await dbRead(env, req, cors)
          case '/db/write': return await dbWrite(env, req, cors)
        }
      }
      throw new HttpError(404, 'Non trovato')
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, cors)
      return json({ error: 'Errore interno' }, 500, cors)
    }
  },
}


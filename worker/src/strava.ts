import { verifyBearer } from './google'
import { HttpError, allowedOrigins, json, randomId, seal, unseal, type Env } from './util'

/**
 * Collegamento a Strava (facoltativo). Il Worker conserva il token Strava cifrato e legge solo l'ELENCO delle attività
 * dell'atleta stesso per farle scegliere nel feedback: all'app e a Drive arriva solo l'ID dell'attività (il link).
 * Nessuna statistica viene salvata o mostrata ad altri (contratto API di Strava). Tetto di atleti collegati: STRAVA_MAX_ATHLETES.
 */
const API = 'https://www.strava.com/api/v3'
const SCOPE = 'activity:read'
const DEFAULT_MAX = 10
const STATE_TTL = 600

interface StravaTokens { access: string; refresh: string; exp: number; athleteId: number; at: number }

export const stravaReady = (env: Env) => !!(env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET && env.SESSION_KEY)
const maxAthletes = (env: Env) => { const n = parseInt(env.STRAVA_MAX_ATHLETES ?? '', 10); return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MAX }

const USERS = 'strava:users'
const getUsers = async (env: Env): Promise<string[]> => { try { return JSON.parse((await env.KV.get(USERS)) ?? '[]') as string[] } catch { return [] } }
const putUsers = (env: Env, u: string[]) => env.KV.put(USERS, JSON.stringify(u))
const key = (email: string) => `strava:${email}`

const validReturn = (env: Env, ret: unknown): URL => {
  try {
    const u = new URL(String(ret || ''))
    if (allowedOrigins(env).has(u.origin)) { u.hash = ''; return u }
  } catch { /* sotto */ }
  throw new HttpError(400, 'Indirizzo di ritorno non autorizzato')
}

const tokenCall = async (env: Env, params: Record<string, string>) => {
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID!, client_secret: env.STRAVA_CLIENT_SECRET!, ...params }),
  })
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_at?: number; athlete?: { id?: number } }
  return { ok: r.ok, ...j }
}

const load = async (env: Env, email: string): Promise<StravaTokens | null> => {
  const raw = await env.KV.get(key(email))
  if (!raw) return null
  try { return await unseal<StravaTokens>(env, raw) } catch { return null }
}
const save = async (env: Env, email: string, t: StravaTokens) => { await env.KV.put(key(email), await seal(env, t)) }

/** Token di accesso valido (rinnovato se scade tra meno di 2 minuti). */
const access = async (env: Env, email: string): Promise<string> => {
  const t = await load(env, email)
  if (!t) throw new HttpError(404, 'Strava non collegato')
  if (t.exp * 1000 - Date.now() > 120_000) return t.access
  const r = await tokenCall(env, { grant_type: 'refresh_token', refresh_token: t.refresh })
  if (!r.ok || !r.access_token) throw new HttpError(401, 'Collegamento Strava scaduto: ricollega l’account')
  await save(env, email, { ...t, access: r.access_token, refresh: r.refresh_token ?? t.refresh, exp: r.expires_at ?? Math.floor(Date.now() / 1000) + 3600 })
  return r.access_token
}

const body = async (req: Request) => { try { return (JSON.parse(await req.text()) ?? {}) as Record<string, unknown> } catch { return {} } }

/** L'app chiede l'indirizzo di consenso di Strava (serve il token Google per sapere chi è). */
export async function stravaConnect(env: Env, req: Request, cors: Record<string, string>, origin: string): Promise<Response> {
  if (!stravaReady(env)) throw new HttpError(503, 'Strava non configurato')
  const me = await verifyBearer(env, req)
  const ret = validReturn(env, (await body(req)).return)
  const users = await getUsers(env)
  if (!users.includes(me.email) && users.length >= maxAthletes(env)) throw new HttpError(409, `Raggiunto il limite di ${maxAthletes(env)} atleti collegati a Strava`)
  const state = randomId(24)
  await env.KV.put(`stst:${state}`, JSON.stringify({ email: me.email, ret: ret.toString() }), { expirationTtl: STATE_TTL })
  const u = new URL('https://www.strava.com/oauth/authorize')
  u.search = new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID!, redirect_uri: `${origin}/strava/callback`, response_type: 'code', approval_prompt: 'auto', scope: SCOPE, state }).toString()
  return json({ url: u.toString() }, 200, cors)
}

/** Ritorno da Strava (navigazione del browser): scambia il codice, salva il token cifrato, torna all'app. */
export async function stravaCallback(env: Env, url: URL): Promise<Response> {
  const state = url.searchParams.get('state') || ''
  const raw = await env.KV.get(`stst:${state}`)
  if (!raw) throw new HttpError(400, 'Richiesta scaduta: riprova dall’app')
  await env.KV.delete(`stst:${state}`)
  const { email, ret } = JSON.parse(raw) as { email: string; ret: string }
  const back = (frag: string) => { const r = new URL(ret); r.hash = frag; return Response.redirect(r.toString(), 302) }
  const code = url.searchParams.get('code')
  const scope = url.searchParams.get('scope') || ''
  if (url.searchParams.get('error') || !code) return back('strava=denied')
  if (!scope.split(',').includes(SCOPE) && !scope.split(',').includes('activity:read_all')) return back('strava=scope')
  const users = await getUsers(env)
  if (!users.includes(email) && users.length >= maxAthletes(env)) return back('strava=full')
  const r = await tokenCall(env, { grant_type: 'authorization_code', code })
  if (!r.ok || !r.access_token || !r.refresh_token) return back('strava=error')
  await save(env, email, { access: r.access_token, refresh: r.refresh_token, exp: r.expires_at ?? Math.floor(Date.now() / 1000) + 3600, athleteId: r.athlete?.id ?? 0, at: Date.now() })
  if (!users.includes(email)) await putUsers(env, [...users, email])
  return back('strava=ok')
}

export async function stravaStatus(env: Env, req: Request, cors: Record<string, string>): Promise<Response> {
  if (!stravaReady(env)) throw new HttpError(503, 'Strava non configurato')
  const me = await verifyBearer(env, req)
  const [t, users] = await Promise.all([load(env, me.email), getUsers(env)])
  return json({ connected: !!t, full: !t && users.length >= maxAthletes(env) }, 200, cors)
}

/** Elenco minimo delle attività DELL'atleta che chiede (id, nome, sport, data): serve solo a sceglierne una. Nessuna statistica. */
export async function stravaActivities(env: Env, req: Request, cors: Record<string, string>): Promise<Response> {
  if (!stravaReady(env)) throw new HttpError(503, 'Strava non configurato')
  const me = await verifyBearer(env, req)
  const b = await body(req)
  const tok = await access(env, me.email)
  const q = new URLSearchParams({ per_page: '30' })
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null)
  const after = num(b.after); const before = num(b.before)
  if (after) q.set('after', String(after))
  if (before) q.set('before', String(before))
  const r = await fetch(`${API}/athlete/activities?${q}`, { headers: { Authorization: `Bearer ${tok}` } })
  if (r.status === 401) throw new HttpError(401, 'Collegamento Strava scaduto: ricollega l’account')
  if (r.status === 429) throw new HttpError(429, 'Strava ha raggiunto il limite di richieste: riprova tra qualche minuto')
  if (!r.ok) throw new HttpError(502, 'Strava non risponde')
  const list = (await r.json().catch(() => [])) as { id?: number; name?: string; sport_type?: string; type?: string; start_date_local?: string }[]
  const activities = (Array.isArray(list) ? list : [])
    .filter((a) => typeof a.id === 'number')
    .map((a) => ({ id: a.id as number, name: String(a.name ?? '').slice(0, 120), sport: String(a.sport_type ?? a.type ?? '').slice(0, 40), date: String(a.start_date_local ?? '').slice(0, 19) }))
  return json({ activities }, 200, cors)
}

export async function stravaDisconnect(env: Env, req: Request, cors: Record<string, string>): Promise<Response> {
  if (!stravaReady(env)) throw new HttpError(503, 'Strava non configurato')
  const me = await verifyBearer(env, req)
  const t = await load(env, me.email)
  if (t) {
    await fetch('https://www.strava.com/oauth/deauthorize', { method: 'POST', headers: { Authorization: `Bearer ${t.access}` } }).catch(() => undefined)
    await env.KV.delete(key(me.email))
  }
  await putUsers(env, (await getUsers(env)).filter((e) => e !== me.email))
  return json({ ok: true }, 200, cors)
}

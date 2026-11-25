import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from './index'

const ORIGIN = 'https://app.github.io'
const CLIENT = 'cid.apps.googleusercontent.com'
class FakeKV {
  m = new Map<string, string>()
  async get(k: string) { return this.m.get(k) ?? null }
  async put(k: string, v: string) { this.m.set(k, v) }
  async delete(k: string) { this.m.delete(k) }
}
const mkEnv = (extra: Record<string, string> = {}) => ({
  KV: new FakeKV(), GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: 's', SESSION_KEY: randomBytes(32).toString('base64url'),
  ALLOWED_ORIGINS: ORIGIN, STRAVA_CLIENT_ID: '777', STRAVA_CLIENT_SECRET: 'strava-secret', ...extra,
}) as never as Parameters<typeof worker.fetch>[1] & { KV: FakeKV }

let calls: { url: string; auth?: string; body?: string }[]
let tokenResult: { ok: boolean; expires_in?: number }
let activitiesStatus: number
let n = 0

beforeEach(() => {
  calls = []; tokenResult = { ok: true }; activitiesStatus = 200; n = 0
  vi.stubGlobal('fetch', async (input: string | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url
    const h = init?.headers as Record<string, string> | undefined
    const auth = h?.Authorization?.replace('Bearer ', '')
    calls.push({ url, auth, body: init?.body ? String(init.body) : undefined })
    if (url.startsWith('https://oauth2.googleapis.com/tokeninfo')) return Response.json({ aud: CLIENT, scope: 'https://www.googleapis.com/auth/drive.file', expires_in: '3000' })
    if (url.startsWith('https://www.googleapis.com/drive/v3/about')) return Response.json({ user: { emailAddress: (auth ?? '').replace('tok-', '') + '@x.it' } })
    if (url === 'https://www.strava.com/oauth/token') {
      if (!tokenResult.ok) return Response.json({}, { status: 400 })
      n++
      const exp = Math.floor(Date.now() / 1000) + (tokenResult.expires_in ?? 21600)
      return Response.json({ access_token: `SA${n}`, refresh_token: `SR${n}`, expires_at: exp, athlete: { id: 4242 } })
    }
    if (url.startsWith('https://www.strava.com/api/v3/athlete/activities')) {
      return Response.json([{ id: 111, name: 'Corsa del mattino', sport_type: 'Run', start_date_local: '2026-03-02T07:30:00Z', distance: 10000, average_heartrate: 150, map: { summary_polyline: 'xx' } }, { name: 'senza id' }], { status: activitiesStatus })
    }
    if (url === 'https://www.strava.com/oauth/deauthorize') return Response.json({})
    throw new Error('fetch non previsto: ' + url)
  })
})
afterEach(() => vi.unstubAllGlobals())

const post = (env: ReturnType<typeof mkEnv>, path: string, body: unknown = {}, token = 'tok-atleta') =>
  worker.fetch(new Request('https://w.dev' + path, { method: 'POST', headers: { origin: ORIGIN, authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env)
const RET = ORIGIN + '/trainer-team/'

/** Percorso completo: connect → ritorno da Strava. Restituisce il frammento con cui si torna all'app. */
const connect = async (env: ReturnType<typeof mkEnv>, token = 'tok-atleta', scope = 'read,activity:read') => {
  const r = await post(env, '/strava/connect', { return: RET }, token)
  if (r.status !== 200) return { status: r.status, frag: '' }
  const u = new URL(((await r.json()) as { url: string }).url)
  const cb = await worker.fetch(new Request(`https://w.dev/strava/callback?code=C&scope=${scope}&state=${u.searchParams.get('state')}`), env)
  return { status: cb.status, frag: new URL(cb.headers.get('location')!).hash, authUrl: u }
}

describe('Strava', () => {
  it('health segnala se è configurato', async () => {
    expect(await (await worker.fetch(new Request('https://w.dev/health'), mkEnv())).json()).toMatchObject({ strava: true })
    expect(await (await worker.fetch(new Request('https://w.dev/health'), mkEnv({ STRAVA_CLIENT_SECRET: '' }))).json()).toMatchObject({ strava: false })
  })
  it('collegamento: URL di consenso con solo activity:read, token salvato cifrato, ritorno all’app', async () => {
    const env = mkEnv()
    const c = await connect(env)
    expect(c.authUrl!.origin + c.authUrl!.pathname).toBe('https://www.strava.com/oauth/authorize')
    expect(c.authUrl!.searchParams.get('scope')).toBe('activity:read')
    expect(c.authUrl!.searchParams.get('redirect_uri')).toBe('https://w.dev/strava/callback')
    expect(c.frag).toBe('#strava=ok')
    const stored = env.KV.m.get('strava:atleta@x.it')!
    expect(stored).toBeTruthy()
    expect(stored).not.toContain('SA1'); expect(stored).not.toContain('SR1') // cifrato a riposo
    expect(JSON.parse(env.KV.m.get('strava:users')!)).toEqual(['atleta@x.it'])
    expect(await (await post(env, '/strava/status')).json()).toMatchObject({ connected: true })
  })
  it('elenco: solo id, nome, sport e data (nessuna statistica) e voci senza id scartate', async () => {
    const env = mkEnv(); await connect(env)
    const r = await post(env, '/strava/activities', { after: 1772000000, before: 1772200000 })
    expect(await r.json()).toEqual({ activities: [{ id: 111, name: 'Corsa del mattino', sport: 'Run', date: '2026-03-02T07:30:00' }] })
    const u = calls.find((x) => x.url.includes('athlete/activities'))!
    expect(u.auth).toBe('SA1'); expect(u.url).toContain('after=1772000000'); expect(u.url).toContain('before=1772200000'); expect(u.url).toContain('per_page=30')
  })
  it('token scaduto → rinnovato con il refresh token prima della richiesta', async () => {
    const env = mkEnv(); tokenResult = { ok: true, expires_in: 10 }
    await connect(env)
    await post(env, '/strava/activities', {})
    expect(calls.filter((x) => x.url === 'https://www.strava.com/oauth/token').length).toBe(2)
    expect(calls.find((x) => x.url.includes('athlete/activities'))!.auth).toBe('SA2')
    expect(calls.filter((x) => x.url === 'https://www.strava.com/oauth/token')[1].body).toContain('refresh_token=SR1')
  })
  it('tetto di atleti: l’11° viene rifiutato, chi è già collegato può ricollegarsi', async () => {
    const env = mkEnv({ STRAVA_MAX_ATHLETES: '2' })
    expect((await connect(env, 'tok-a')).frag).toBe('#strava=ok')
    expect((await connect(env, 'tok-b')).frag).toBe('#strava=ok')
    expect((await connect(env, 'tok-c')).status).toBe(409)
    expect(await (await post(env, '/strava/status', {}, 'tok-c')).json()).toMatchObject({ connected: false, full: true })
    expect((await connect(env, 'tok-a')).frag).toBe('#strava=ok')
  })
  it('scollegare toglie il token, libera il posto e revoca su Strava', async () => {
    const env = mkEnv({ STRAVA_MAX_ATHLETES: '1' })
    await connect(env, 'tok-a')
    await post(env, '/strava/disconnect', {}, 'tok-a')
    expect(env.KV.m.has('strava:a@x.it')).toBe(false)
    expect(JSON.parse(env.KV.m.get('strava:users')!)).toEqual([])
    expect(calls.some((x) => x.url === 'https://www.strava.com/oauth/deauthorize' && x.auth === 'SA1')).toBe(true)
    expect((await connect(env, 'tok-b')).frag).toBe('#strava=ok')
    expect((await post(env, '/strava/activities', {}, 'tok-a')).status).toBe(404)
  })
  it('rifiuti: consenso negato, permesso mancante, indirizzo di ritorno estraneo, stato scaduto, senza configurazione', async () => {
    const env = mkEnv()
    const r = await post(env, '/strava/connect', { return: 'https://evil.example/' })
    expect(r.status).toBe(400)
    const s = await post(env, '/strava/connect', { return: RET }); const st = new URL(((await s.json()) as { url: string }).url).searchParams.get('state')
    const d = await worker.fetch(new Request(`https://w.dev/strava/callback?error=access_denied&state=${st}`), env)
    expect(new URL(d.headers.get('location')!).hash).toBe('#strava=denied')
    expect((await connect(env, 'tok-x', 'read')).frag).toBe('#strava=scope')
    expect((await worker.fetch(new Request('https://w.dev/strava/callback?code=C&state=inesistente'), env)).status).toBe(400)
    expect((await post(mkEnv({ STRAVA_CLIENT_SECRET: '' }), '/strava/connect', { return: RET })).status).toBe(503)
    tokenResult = { ok: false }
    expect((await connect(mkEnv(), 'tok-y')).frag).toBe('#strava=error')
  })
  it('errori di Strava sull’elenco: 429 e 401 si traducono, senza collegamento 404', async () => {
    const env = mkEnv(); await connect(env)
    activitiesStatus = 429
    expect((await post(env, '/strava/activities', {})).status).toBe(429)
    activitiesStatus = 401
    expect((await post(env, '/strava/activities', {})).status).toBe(401)
    expect((await post(env, '/strava/activities', {}, 'tok-nuovo')).status).toBe(404)
  })
  it('origine non autorizzata e token mancante', async () => {
    const env = mkEnv()
    expect((await worker.fetch(new Request('https://w.dev/strava/status', { method: 'POST', headers: { origin: 'https://evil.example', authorization: 'Bearer tok-a' }, body: '{}' }), env)).status).toBe(403)
    expect((await worker.fetch(new Request('https://w.dev/strava/status', { method: 'POST', headers: { origin: ORIGIN }, body: '{}' }), env)).status).toBe(401)
  })
})

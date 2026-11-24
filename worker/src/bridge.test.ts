import { randomBytes, webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from './index'
import { seal } from './util'

const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url')
const ORIGIN = 'https://app.github.io'
const CLIENT = 'cid.apps.googleusercontent.com'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const FILE = 'file000000000001'

class FakeKV {
  m = new Map<string, string>()
  async get(k: string) { return this.m.get(k) ?? null }
  async put(k: string, v: string) { this.m.set(k, v) }
  async delete(k: string) { this.m.delete(k) }
}
type Env = Parameters<typeof worker.fetch>[1] & { KV: FakeKV }
const makeEnv = async () => {
  const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
  return {
    KV: new FakeKV(), GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: 'sec', SESSION_KEY: b64u(randomBytes(32)), ALLOWED_ORIGINS: ORIGIN,
    VAPID_PUBLIC_KEY: b64u(Buffer.from(await webcrypto.subtle.exportKey('raw', kp.publicKey))), VAPID_PRIVATE_KEY: (await webcrypto.subtle.exportKey('jwk', kp.privateKey)).d!, VAPID_SUBJECT: 'mailto:t@example.com',
  } as never as Env
}

// ---- Drive simulato: i file hanno proprietario e condivisioni; con drive.file l'accesso diretto è solo del proprietario ----
interface DFile { name: string; content: string; version: number; owner: string; perms: { id: string; emailAddress: string; role: string }[] }
let files: Record<string, DFile>
let revoked: boolean
const emailOf = (t: string) => t.replace('tok-', '') + '@x.it'
const permId = () => 'p' + Math.random().toString(36).slice(2, 8)
const plan = (n = 0) => JSON.stringify({ schemaVersion: 1, athlete: { id: 'a1', name: 'Luca' }, sessions: Array.from({ length: n }, (_, i) => ({ id: 's' + i })) })

beforeEach(() => {
  revoked = false
  files = { [FILE]: { name: 'training-plan-luca.json', content: plan(1), version: 1, owner: 'coach@x.it', perms: [{ id: 'po', emailAddress: 'coach@x.it', role: 'owner' }] } }
  vi.stubGlobal('fetch', async (input: string | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.url)
    const auth = ((init?.headers as Record<string, string> | undefined)?.Authorization ?? (init?.headers as Record<string, string> | undefined)?.authorization ?? '').replace('Bearer ', '')
    const me = emailOf(auth)
    const method = init?.method ?? 'GET'
    if (url.pathname === '/tokeninfo') { const t = url.searchParams.get('access_token')!; return t.startsWith('tok-') ? Response.json({ aud: t.includes('foreign') ? 'altra' : CLIENT, scope: SCOPE }) : new Response('{}', { status: 400 }) }
    if (url.pathname === '/token') {
      if (revoked) return Response.json({ error: 'invalid_grant' }, { status: 400 })
      return Response.json({ access_token: 'tok-coach', expires_in: 3599 })
    }
    if (url.pathname === '/drive/v3/about') return Response.json({ user: { emailAddress: me } })
    const m = url.pathname.match(/\/files\/([^/]+)(\/permissions)?$/)
    if (m) {
      const f = files[m[1]]
      const visible = !!f && (f.owner === me) // drive.file: solo chi ha creato il file lo vede da solo
      if (!f || !visible) return new Response('{}', { status: 404 })
      if (m[2]) {
        if (method === 'POST') { const b = JSON.parse(String(init?.body)); f.perms.push({ id: permId(), emailAddress: b.emailAddress, role: b.role }); return Response.json({ id: 'x' }) }
        return Response.json({ permissions: f.perms })
      }
      if (url.pathname.startsWith('/upload') && method === 'PATCH') { f.content = String(init?.body); f.version++; return Response.json({ id: m[1], name: f.name, version: String(f.version), modifiedTime: 'now' }) }
      if (url.searchParams.get('alt') === 'media') return new Response(f.content, { headers: { 'content-type': 'application/json' } })
      const fields = url.searchParams.get('fields') ?? ''
      if (fields === 'ownedByMe') return Response.json({ ownedByMe: f.owner === me })
      return Response.json({ id: m[1], name: f.name, version: String(f.version), modifiedTime: 'now' })
    }
    throw new Error('fetch non previsto: ' + url)
  })
})
afterEach(() => vi.unstubAllGlobals())

const call = (env: Env, path: string, o: { token?: string; body?: unknown } = {}) =>
  worker.fetch(new Request('https://w.example.workers.dev' + path, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', ...(o.token ? { authorization: 'Bearer ' + o.token } : {}) }, body: JSON.stringify(o.body ?? {}) }), env)

const coachSession = async (env: Env) => { const id = b64u(randomBytes(32)); await env.KV.put(`sess:${id}`, await seal(env, { refresh: 'REFRESH-1', email: 'coach@x.it', renewedAt: Date.now() })); return id }
const registered = async (env: Env) => { const session = await coachSession(env); const r = await call(env, '/house/register', { token: 'tok-coach', body: { fileId: FILE, session } }); expect(r.status).toBe(200) }

describe('ponte: registrazione', () => {
  it('solo il proprietario del file, con la sua sessione, può collegarlo', async () => {
    const env = await makeEnv(); const session = await coachSession(env)
    expect((await call(env, '/house/register', { token: 'tok-atleta', body: { fileId: FILE, session } })).status).toBe(403) // non proprietario
    const other = b64u(randomBytes(32)); await env.KV.put(`sess:${other}`, await seal(env, { refresh: 'R', email: 'altro@x.it', renewedAt: 0 }))
    expect((await call(env, '/house/register', { token: 'tok-coach', body: { fileId: FILE, session: other } })).status).toBe(403) // sessione di un altro
    const ok = await call(env, '/house/register', { token: 'tok-coach', body: { fileId: FILE, session } })
    expect(await ok.json()).toMatchObject({ ok: true, members: 1 })
    expect(env.KV.m.get(`house:${FILE}`)).not.toContain('REFRESH-1') // cifrato a riposo
  })
  it('token emesso per un’altra app → rifiutato', async () => {
    const env = await makeEnv()
    expect((await call(env, '/house/register', { token: 'tok-foreign', body: { fileId: FILE, session: 'x'.repeat(40) } })).status).toBe(401)
  })
})

describe('ponte: unirsi con il codice', () => {
  it('chi presenta il codice viene aggiunto come scrittore e poi legge e scrive', async () => {
    const env = await makeEnv(); await registered(env)
    expect((await call(env, '/db/read', { token: 'tok-atleta', body: { fileId: FILE } })).status).toBe(403) // prima: non condiviso
    const j = await call(env, '/house/join', { token: 'tok-atleta', body: { fileId: FILE } })
    expect(await j.json()).toMatchObject({ ok: true, joined: true, name: 'training-plan-luca.json' })
    expect(files[FILE].perms.some((p) => p.emailAddress === 'atleta@x.it' && p.role === 'writer')).toBe(true)
    const rd = await (await call(env, '/db/read', { token: 'tok-atleta', body: { fileId: FILE } })).json() as { meta: { version: string }; canEdit: boolean; db: { sessions: unknown[] } }
    expect(rd.canEdit).toBe(true); expect(rd.db.sessions).toHaveLength(1)
    const w = await call(env, '/db/write', { token: 'tok-atleta', body: { fileId: FILE, expectedVersion: rd.meta.version, db: JSON.parse(plan(3)) } })
    expect(w.status).toBe(200)
    expect(JSON.parse(files[FILE].content).sessions).toHaveLength(3)
  })
  it('ripetere l’unione non crea condivisioni doppie', async () => {
    const env = await makeEnv(); await registered(env)
    await call(env, '/house/join', { token: 'tok-atleta', body: { fileId: FILE } })
    const again = await (await call(env, '/house/join', { token: 'tok-atleta', body: { fileId: FILE } })).json()
    expect(again).toMatchObject({ joined: false }); expect(files[FILE].perms.filter((p) => p.emailAddress === 'atleta@x.it')).toHaveLength(1)
  })
  it('codice sconosciuto o piano non collegato → 404; formato non valido → 400', async () => {
    const env = await makeEnv()
    expect((await call(env, '/house/join', { token: 'tok-atleta', body: { fileId: FILE } })).status).toBe(404)
    expect((await call(env, '/house/join', { token: 'tok-atleta', body: { fileId: 'x' } })).status).toBe(400)
  })
  it('tetto alle condivisioni create con il codice', async () => {
    const env = await makeEnv(); await registered(env)
    for (let i = 0; i < 19; i++) files[FILE].perms.push({ id: 'p' + i, emailAddress: `u${i}@x.it`, role: 'writer' })
    expect((await call(env, '/house/join', { token: 'tok-atleta', body: { fileId: FILE } })).status).toBe(403)
  })
})

describe('ponte: la condivisione su Drive è l’unica autorizzazione', () => {
  it('se si toglie l’atleta da Drive, l’accesso si chiude subito', async () => {
    const env = await makeEnv(); await registered(env)
    await call(env, '/house/join', { token: 'tok-atleta', body: { fileId: FILE } })
    files[FILE].perms = files[FILE].perms.filter((p) => p.emailAddress !== 'atleta@x.it')
    expect((await call(env, '/db/meta', { token: 'tok-atleta', body: { fileId: FILE } })).status).toBe(403)
  })
  it('un lettore non può scrivere', async () => {
    const env = await makeEnv(); await registered(env)
    files[FILE].perms.push({ id: 'pl', emailAddress: 'lettore@x.it', role: 'reader' })
    const meta = await (await call(env, '/db/meta', { token: 'tok-lettore', body: { fileId: FILE } })).json() as { meta: { version: string }; canEdit: boolean }
    expect(meta.canEdit).toBe(false)
    expect((await call(env, '/db/write', { token: 'tok-lettore', body: { fileId: FILE, expectedVersion: meta.meta.version, db: JSON.parse(plan()) } })).status).toBe(403)
  })
  it('scrittura con versione vecchia → 409; contenuto non valido → 400', async () => {
    const env = await makeEnv(); await registered(env)
    await call(env, '/house/join', { token: 'tok-atleta', body: { fileId: FILE } })
    expect((await call(env, '/db/write', { token: 'tok-atleta', body: { fileId: FILE, expectedVersion: '0', db: JSON.parse(plan()) } })).status).toBe(409)
    expect((await call(env, '/db/write', { token: 'tok-atleta', body: { fileId: FILE, expectedVersion: '1', db: { x: 1 } } })).status).toBe(400)
    expect(files[FILE].version).toBe(1)
  })
  it('se Google revoca l’accesso del coach, il collegamento si cancella (410)', async () => {
    const env = await makeEnv(); await registered(env)
    revoked = true
    expect((await call(env, '/db/read', { token: 'tok-atleta', body: { fileId: FILE } })).status).toBe(410)
    expect(env.KV.m.has(`house:${FILE}`)).toBe(false)
  })
})

describe('ponte: inviti e notifiche', () => {
  it('/house/mine elenca i piani condivisi con l’account', async () => {
    const env = await makeEnv(); await registered(env)
    files[FILE].perms.push({ id: 'pa', emailAddress: 'atleta@x.it', role: 'writer' })
    await registered(env) // il coach riapre l'app: l'invito dell'atleta viene indicizzato
    const h = await (await call(env, '/house/mine', { token: 'tok-atleta' })).json() as { houses: { id: string; name: string }[] }
    expect(h.houses).toEqual([expect.objectContaining({ id: FILE, name: 'training-plan-luca.json' })])
    expect(((await (await call(env, '/house/mine', { token: 'tok-estraneo' })).json()) as { houses: unknown[] }).houses).toEqual([])
  })
  it('un atleta che passa dal ponte può iscriversi alle notifiche del piano', async () => {
    const env = await makeEnv(); await registered(env)
    await call(env, '/house/join', { token: 'tok-atleta', body: { fileId: FILE } })
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/a1', keys: { p256dh: b64u(Buffer.concat([Buffer.from([4]), randomBytes(64)])), auth: b64u(randomBytes(16)) } }
    const r = await (await call(env, '/subscribe', { token: 'tok-atleta', body: { subscription: sub, fileIds: [FILE] } })).json()
    expect(r).toMatchObject({ ok: true, files: 1 })
    const stranger = await (await call(env, '/subscribe', { token: 'tok-estraneo', body: { subscription: { ...sub, endpoint: sub.endpoint + 'z' }, fileIds: [FILE] } })).json()
    expect(stranger).toMatchObject({ files: 0 })
  })
})

describe('ponte: annullare la condivisione', () => {
  it('il proprietario scollega il file: il codice non funziona più e l’accesso dal ponte si chiude', async () => {
    const env = await makeEnv(); await registered(env)
    await call(env, '/house/join', { token: 'tok-atleta', body: { fileId: FILE } })
    expect((await call(env, '/house/unregister', { token: 'tok-atleta', body: { fileId: FILE } })).status).toBe(403) // non proprietario
    expect((await call(env, '/house/unregister', { token: 'tok-coach', body: { fileId: FILE } })).status).toBe(200)
    expect(env.KV.m.has(`house:${FILE}`)).toBe(false)
    expect((await call(env, '/house/join', { token: 'tok-estraneo', body: { fileId: FILE } })).status).toBe(404) // il codice non entra più
    expect((await call(env, '/db/read', { token: 'tok-atleta', body: { fileId: FILE } })).status).toBe(404)
  })
})

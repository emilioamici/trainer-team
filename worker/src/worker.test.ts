import { createDecipheriv, createECDH, createPublicKey, createVerify, hkdfSync, randomBytes, webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from './index'
import { encryptPayload, vapidAuth } from './webpush'

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

const makeEnv = async () => {
  const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
  const pub = b64u(Buffer.from(await webcrypto.subtle.exportKey('raw', kp.publicKey)))
  const d = (await webcrypto.subtle.exportKey('jwk', kp.privateKey)).d!
  return {
    KV: new FakeKV(), GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: 'sec', SESSION_KEY: b64u(randomBytes(32)),
    VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: d, VAPID_SUBJECT: 'mailto:test@example.com', ALLOWED_ORIGINS: ORIGIN,
  } as never as Parameters<typeof worker.fetch>[1] & { KV: FakeKV; VAPID_PUBLIC_KEY: string }
}

/** Il "browser" del destinatario: chiavi p256dh/auth e decifratura indipendente (node:crypto) secondo RFC 8291. */
const makeReceiver = () => {
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys()
  const auth = randomBytes(16)
  const pub = ecdh.getPublicKey()
  const sub = { endpoint: '', keys: { p256dh: b64u(pub), auth: b64u(auth) } }
  const decrypt = (body: Uint8Array) => {
    const b = Buffer.from(body)
    const salt = b.subarray(0, 16); const idlen = b[20]; const asPub = b.subarray(21, 21 + idlen); const ct = b.subarray(21 + idlen)
    const secret = ecdh.computeSecret(asPub)
    const ikm = Buffer.from(hkdfSync('sha256', secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), pub, asPub]), 32))
    const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
    const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))
    const dec = createDecipheriv('aes-128-gcm', cek, nonce); dec.setAuthTag(ct.subarray(ct.length - 16))
    const pt = Buffer.concat([dec.update(ct.subarray(0, ct.length - 16)), dec.final()])
    expect(pt[pt.length - 1]).toBe(2)
    return JSON.parse(pt.subarray(0, pt.length - 1).toString())
  }
  return { sub, decrypt }
}

// ---- Google e servizi push simulati ----
let access: Record<string, Set<string>> // fileId -> email con accesso
let pushed: { url: string; headers: Headers; body: Uint8Array }[]
let pushStatus: Record<string, number>
const emailOfToken = (t: string) => t.replace('tok-', '') + '@x.it'
let refreshError = false

beforeEach(() => {
  access = { [FILE]: new Set(['coach@x.it', 'atleta@x.it']) }
  pushed = []; pushStatus = {}; refreshError = false
  vi.stubGlobal('fetch', async (input: string | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization?.replace('Bearer ', '') ?? ''
    if (url.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
      const tok = new URL(url).searchParams.get('access_token')!
      return tok.startsWith('tok-') ? Response.json({ aud: tok.includes('foreign') ? 'altra-app' : CLIENT, scope: SCOPE, expires_in: '3000' }) : new Response('{}', { status: 400 })
    }
    if (url.startsWith('https://www.googleapis.com/drive/v3/about')) return Response.json({ user: { emailAddress: emailOfToken(auth) } })
    if (url.startsWith('https://www.googleapis.com/drive/v3/files/')) {
      const id = url.split('/files/')[1].split('?')[0]
      return access[id]?.has(emailOfToken(auth)) ? Response.json({ id }) : new Response('{}', { status: 404 })
    }
    if (url === 'https://oauth2.googleapis.com/token') {
      const p = new URLSearchParams(String(init?.body))
      if (p.get('grant_type') === 'authorization_code') return Response.json({ access_token: 'tok-coach', refresh_token: 'REFRESH-SECRET-1', expires_in: 3599 })
      if (refreshError) return Response.json({ error: 'invalid_grant' }, { status: 400 })
      return Response.json({ access_token: 'tok-coach', expires_in: 3599 })
    }
    if (url.startsWith('https://oauth2.googleapis.com/revoke')) return new Response('{}')
    if (url.startsWith('https://fcm.googleapis.com/')) {
      pushed.push({ url, headers: new Headers(init?.headers), body: init?.body as Uint8Array })
      return new Response(null, { status: pushStatus[url] ?? 201 })
    }
    throw new Error('fetch non previsto: ' + url)
  })
})
afterEach(() => vi.unstubAllGlobals())

const call = (env: Awaited<ReturnType<typeof makeEnv>>, path: string, o: { method?: string; token?: string; body?: unknown; origin?: string | null } = {}) =>
  worker.fetch(new Request('https://w.example.workers.dev' + path, {
    method: o.method ?? 'POST',
    headers: { ...(o.origin === null ? {} : { origin: o.origin ?? ORIGIN }), ...(o.token ? { authorization: 'Bearer ' + o.token } : {}), 'content-type': 'application/json' },
    body: o.method === 'GET' ? undefined : JSON.stringify(o.body ?? {}),
  }), env)

describe('web push', () => {
  it('il messaggio si decifra con un ricevente indipendente (RFC 8291)', async () => {
    const r = makeReceiver()
    const body = await encryptPayload(r.sub, new TextEncoder().encode(JSON.stringify({ title: 'Ciao', body: 'àèì ✓' })))
    expect(r.decrypt(body)).toEqual({ title: 'Ciao', body: 'àèì ✓' })
  })
  it('l’intestazione VAPID ha una firma ES256 valida', async () => {
    const env = await makeEnv()
    const h = await vapidAuth(env, 'https://fcm.googleapis.com/fcm/send/abc')
    const jwt = /t=([\w.-]+),/.exec(h)![1]
    const [head, claims, sig] = jwt.split('.')
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toMatchObject({ aud: 'https://fcm.googleapis.com', sub: 'mailto:test@example.com' })
    const pub = Buffer.from(env.VAPID_PUBLIC_KEY, 'base64url')
    const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: 'jwk' })
    const v = createVerify('SHA256').update(`${head}.${claims}`)
    expect(v.verify({ key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'))).toBe(true)
    expect(h).toContain(`k=${env.VAPID_PUBLIC_KEY}`)
  })
})

describe('health e CORS', () => {
  it('dichiara cosa è configurato', async () => {
    const env = await makeEnv()
    expect(await (await call(env, '/health', { method: 'GET' })).json()).toEqual({ ok: true, auth: true, push: true })
    const bare = { ...env, GOOGLE_CLIENT_SECRET: undefined, VAPID_PRIVATE_KEY: undefined } as typeof env
    expect(await (await call(bare, '/health', { method: 'GET' })).json()).toEqual({ ok: true, auth: false, push: false })
  })
  it('le POST dal browser solo da origini autorizzate', async () => {
    const env = await makeEnv()
    expect((await call(env, '/notify', { token: 'tok-coach', origin: 'https://evil.example' })).status).toBe(403)
    expect((await call(env, '/notify', { token: 'tok-coach', origin: null })).status).toBe(403)
    const ok = await call(env, '/test', { token: 'tok-coach' })
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN)
  })
})

describe('accesso persistente', () => {
  const login = async (env: Awaited<ReturnType<typeof makeEnv>>) => {
    const start = await call(env, `/auth/start?return=${encodeURIComponent(ORIGIN + '/trainer-team/')}&hint=coach@x.it`, { method: 'GET', origin: null })
    expect(start.status).toBe(302)
    const g = new URL(start.headers.get('location')!)
    expect(g.searchParams.get('access_type')).toBe('offline'); expect(g.searchParams.get('scope')).toBe(SCOPE)
    expect(g.searchParams.get('redirect_uri')).toBe('https://w.example.workers.dev/auth/callback')
    const cb = await call(env, `/auth/callback?code=abc&state=${g.searchParams.get('state')}`, { method: 'GET', origin: null })
    expect(cb.status).toBe(302)
    const loc = new URL(cb.headers.get('location')!)
    expect(loc.origin + loc.pathname).toBe(ORIGIN + '/trainer-team/')
    return /trainer_session=([\w-]+)/.exec(loc.hash)![1]
  }
  it('start → callback → refresh: all’app arriva solo un id di sessione', async () => {
    const env = await makeEnv()
    const id = await login(env)
    const stored = [...env.KV.m.entries()].filter(([k]) => k.startsWith('sess:'))
    expect(stored).toHaveLength(1)
    expect(stored[0][1]).not.toContain('REFRESH-SECRET-1') // cifrato a riposo
    const r = await call(env, '/auth/refresh', { token: id })
    expect(await r.json()).toMatchObject({ access_token: 'tok-coach', email: 'coach@x.it' })
  })
  it('l’indirizzo di ritorno deve essere autorizzato; lo state si usa una volta sola', async () => {
    const env = await makeEnv()
    expect((await call(env, '/auth/start?return=https://evil.example/', { method: 'GET', origin: null })).status).toBe(400)
    const start = await call(env, `/auth/start?return=${encodeURIComponent(ORIGIN + '/')}`, { method: 'GET', origin: null })
    const state = new URL(start.headers.get('location')!).searchParams.get('state')
    expect((await call(env, `/auth/callback?code=a&state=${state}`, { method: 'GET', origin: null })).status).toBe(302)
    expect((await call(env, `/auth/callback?code=a&state=${state}`, { method: 'GET', origin: null })).status).toBe(400)
  })
  it('sessione sconosciuta o revocata → 401 e cancellazione', async () => {
    const env = await makeEnv()
    expect((await call(env, '/auth/refresh', { token: 'x'.repeat(43) })).status).toBe(401)
    const id = await login(env)
    refreshError = true
    expect((await call(env, '/auth/refresh', { token: id })).status).toBe(401)
    expect([...env.KV.m.keys()].some((k) => k.startsWith('sess:'))).toBe(false)
  })
  it('logout cancella la sessione', async () => {
    const env = await makeEnv()
    const id = await login(env)
    expect((await call(env, '/auth/logout', { token: id })).status).toBe(200)
    expect((await call(env, '/auth/refresh', { token: id })).status).toBe(401)
  })
})

describe('notifiche', () => {
  const subscribe = async (env: Awaited<ReturnType<typeof makeEnv>>, who: string, n: string, files: string[]) => {
    const r = makeReceiver(); r.sub.endpoint = `https://fcm.googleapis.com/fcm/send/${n}`
    const res = await call(env, '/subscribe', { token: `tok-${who}`, body: { subscription: r.sub, fileIds: files } })
    return { r, res }
  }
  it('chi scrive notifica gli altri iscritti al file, non sé stesso', async () => {
    const env = await makeEnv()
    const coach = await subscribe(env, 'coach', 'c1', [FILE])
    const atleta = await subscribe(env, 'atleta', 'a1', [FILE])
    expect(await coach.res.json()).toMatchObject({ ok: true, files: 1 })
    const res = await call(env, '/notify', { token: 'tok-atleta', body: { fileId: FILE, title: 'Luca', body: 'Completato: Test 10 km · RPE 7', tag: 's1', url: ORIGIN + '/trainer-team/' } })
    expect(await res.json()).toMatchObject({ sent: 1, failed: 0, removed: 0 })
    expect(pushed).toHaveLength(1)
    expect(pushed[0].url).toContain('/c1')
    expect(pushed[0].headers.get('content-encoding')).toBe('aes128gcm')
    expect(pushed[0].headers.get('authorization')).toMatch(/^vapid t=/)
    expect(coach.r.decrypt(pushed[0].body)).toMatchObject({ title: 'Luca', body: 'Completato: Test 10 km · RPE 7', tag: 's1' })
    void atleta
  })
  it('chi invia deve avere accesso al file', async () => {
    const env = await makeEnv()
    await subscribe(env, 'coach', 'c1', [FILE])
    expect((await call(env, '/notify', { token: 'tok-intruso', body: { fileId: FILE, title: 'x', body: 'y' } })).status).toBe(403)
    expect(pushed).toHaveLength(0)
  })
  it('non si può iscrivere un dispositivo a un file senza accesso', async () => {
    const env = await makeEnv()
    const { res } = await subscribe(env, 'intruso', 'i1', [FILE])
    expect(await res.json()).toMatchObject({ files: 0 })
    await subscribe(env, 'coach', 'c1', [FILE])
    await call(env, '/notify', { token: 'tok-coach', body: { fileId: FILE, title: 'x', body: 'y' } })
    expect(pushed).toHaveLength(0) // l'intruso non riceve nulla e il coach non riceve da sé
  })
  it('token emesso per un’altra app o endpoint non push → rifiutati', async () => {
    const env = await makeEnv()
    expect((await call(env, '/subscribe', { token: 'tok-foreign', body: {} })).status).toBe(401)
    const r = makeReceiver(); r.sub.endpoint = 'https://evil.example/hook'
    expect((await call(env, '/subscribe', { token: 'tok-coach', body: { subscription: r.sub, fileIds: [] } })).status).toBe(400)
  })
  it('iscrizione scaduta (410) → il dispositivo viene rimosso', async () => {
    const env = await makeEnv()
    await subscribe(env, 'coach', 'c1', [FILE])
    pushStatus['https://fcm.googleapis.com/fcm/send/c1'] = 410
    const res = await call(env, '/notify', { token: 'tok-atleta', body: { fileId: FILE, title: 'x', body: 'y' } })
    expect(await res.json()).toMatchObject({ sent: 0, removed: 1 })
    expect(JSON.parse(env.KV.m.get('sub:coach@x.it')!).devices).toHaveLength(0)
  })
  it('prova di invio: arriva ai dispositivi di chi la chiede', async () => {
    const env = await makeEnv()
    const me = await subscribe(env, 'coach', 'c1', [])
    const res = await call(env, '/test', { token: 'tok-coach', body: { title: 'Prova', body: 'ok' } })
    expect(await res.json()).toMatchObject({ sent: 1 })
    expect(me.r.decrypt(pushed[0].body)).toMatchObject({ title: 'Prova' })
  })
  it('unsubscribe toglie il dispositivo', async () => {
    const env = await makeEnv()
    await subscribe(env, 'coach', 'c1', [FILE])
    await call(env, '/unsubscribe', { token: 'tok-coach', body: { endpoint: 'https://fcm.googleapis.com/fcm/send/c1' } })
    const res = await call(env, '/notify', { token: 'tok-atleta', body: { fileId: FILE, title: 'x', body: 'y' } })
    expect(await res.json()).toMatchObject({ sent: 0 })
  })
})

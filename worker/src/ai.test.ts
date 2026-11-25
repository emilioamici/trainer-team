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
  ALLOWED_ORIGINS: ORIGIN, GEMINI_API_KEY: 'gk', ...extra,
}) as never as Parameters<typeof worker.fetch>[1] & { KV: FakeKV }

let gemini: { status: number; body: unknown }
let geminiCalls: { url: string; key: string; body: { contents: { parts: unknown[] }[]; generationConfig: unknown } }[]

beforeEach(() => {
  gemini = { status: 200, body: { candidates: [{ content: { parts: [{ text: '{"format":"trainer-team-plan","sessions":[]}' }] } }] } }
  geminiCalls = []
  vi.stubGlobal('fetch', async (input: string | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization?.replace('Bearer ', '') ?? ''
    if (url.startsWith('https://oauth2.googleapis.com/tokeninfo')) return Response.json({ aud: CLIENT, scope: 'https://www.googleapis.com/auth/drive.file', expires_in: '3000' })
    if (url.startsWith('https://www.googleapis.com/drive/v3/about')) return Response.json({ user: { emailAddress: auth.replace('tok-', '') + '@x.it' } })
    if (url.startsWith('https://generativelanguage.googleapis.com/')) {
      geminiCalls.push({ url, key: (init?.headers as Record<string, string>)['x-goog-api-key'], body: JSON.parse(String(init?.body)) })
      return Response.json(gemini.body, { status: gemini.status })
    }
    throw new Error('fetch non previsto: ' + url)
  })
})
afterEach(() => vi.unstubAllGlobals())

const PROMPT = 'Converti il piano in JSON per FM Training, rispondi solo con JSON.'
const ai = (env: ReturnType<typeof mkEnv>, body: unknown, token = 'tok-coach', path = '/ai/import') =>
  worker.fetch(new Request('https://w.dev' + path, { method: 'POST', headers: { origin: ORIGIN, authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env)
const good = { mimeType: 'application/pdf', data: Buffer.from('%PDF-1.4 test').toString('base64'), prompt: PROMPT }

describe('importazione con AI', () => {
  it('health segnala se è attiva', async () => {
    const on = await worker.fetch(new Request('https://w.dev/health'), mkEnv())
    expect(await on.json()).toMatchObject({ ai: true })
    const off = await worker.fetch(new Request('https://w.dev/health'), mkEnv({ GEMINI_API_KEY: '' }))
    expect(await off.json()).toMatchObject({ ai: false })
  })
  it('inoltra file e prompt a Gemini con la chiave del Worker e risponde con il JSON', async () => {
    const env = mkEnv()
    const r = await ai(env, good)
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ text: expect.stringContaining('trainer-team-plan'), used: 1, limit: 10, remaining: 9 })
    expect(geminiCalls[0].key).toBe('gk')
    expect(geminiCalls[0].url).toContain('gemini-2.5-flash')
    expect(geminiCalls[0].body.generationConfig).toMatchObject({ responseMimeType: 'application/json' })
    expect(JSON.stringify(geminiCalls[0].body)).toContain('"mime_type":"application/pdf"')
  })
  it('tetto mensile per account: oltre il limite 429 e Gemini non viene chiamato', async () => {
    const env = mkEnv({ AI_MONTHLY_LIMIT: '2' })
    expect((await ai(env, good)).status).toBe(200)
    expect((await ai(env, good)).status).toBe(200)
    expect((await ai(env, good)).status).toBe(429)
    expect(geminiCalls).toHaveLength(2)
    expect((await ai(env, good, 'tok-altro')).status).toBe(200) // altro account: contatore proprio
  })
  it('tetto globale mensile', async () => {
    const env = mkEnv({ AI_GLOBAL_LIMIT: '1' })
    expect((await ai(env, good)).status).toBe(200)
    expect((await ai(env, good, 'tok-altro')).status).toBe(429)
  })
  it('se Gemini fallisce la richiesta non conta', async () => {
    const env = mkEnv({ AI_MONTHLY_LIMIT: '1' })
    gemini = { status: 500, body: {} }
    expect((await ai(env, good)).status).toBe(502)
    gemini = { status: 429, body: {} }
    expect((await ai(env, good)).status).toBe(429)
    gemini = { status: 200, body: { candidates: [] } }
    expect((await ai(env, good)).status).toBe(502)
    gemini = { status: 200, body: { candidates: [{ content: { parts: [{ text: '{}' }] } }] } }
    expect((await ai(env, good)).status).toBe(200) // il contatore non era stato consumato
  })
  it('elenco account consentiti', async () => {
    const env = mkEnv({ AI_ALLOWED_EMAILS: 'coach@x.it' })
    expect((await ai(env, good, 'tok-atleta')).status).toBe(403)
    expect((await ai(env, good, 'tok-coach')).status).toBe(200)
  })
  it('rifiuta formati, file e prompt non validi; senza chiave 503; senza token 401', async () => {
    const env = mkEnv()
    expect((await ai(env, { ...good, mimeType: 'application/vnd.ms-excel' })).status).toBe(415)
    expect((await ai(env, { ...good, data: '' })).status).toBe(413)
    expect((await ai(env, { ...good, data: '%%%' })).status).toBe(413)
    expect((await ai(env, { ...good, prompt: 'x' })).status).toBe(400)
    expect((await ai(mkEnv({ GEMINI_API_KEY: '' }), good)).status).toBe(503)
    const r = await worker.fetch(new Request('https://w.dev/ai/import', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{}' }), env)
    expect(r.status).toBe(401)
    expect(geminiCalls).toHaveLength(0)
  })
  it('origine non autorizzata → 403; /ai/status mostra l’uso', async () => {
    const env = mkEnv()
    const r = await worker.fetch(new Request('https://w.dev/ai/import', { method: 'POST', headers: { origin: 'https://evil.example', authorization: 'Bearer tok-coach' }, body: JSON.stringify(good) }), env)
    expect(r.status).toBe(403)
    await ai(env, good)
    expect(await (await ai(env, {}, 'tok-coach', '/ai/status')).json()).toMatchObject({ allowed: true, used: 1, limit: 10, remaining: 9 })
  })
})

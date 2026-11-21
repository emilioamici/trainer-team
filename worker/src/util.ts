export interface Env {
  KV: KVNamespace
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET?: string // secret
  SESSION_KEY?: string // secret: 32 byte base64url, cifra i token di rinnovo a riposo
  VAPID_PUBLIC_KEY?: string // base64url, 65 byte (punto non compresso)
  VAPID_PRIVATE_KEY?: string // secret: base64url, 32 byte
  VAPID_SUBJECT?: string // "mailto:…" o "https://…" (richiesto dai servizi push)
  ALLOWED_ORIGINS: string // origini dell'app, separate da virgola (schema+dominio, senza percorso)
}

const te = new TextEncoder()
export const utf8 = (s: string) => te.encode(s)

export const b64u = {
  enc(b: ArrayBuffer | Uint8Array): string {
    const u = b instanceof Uint8Array ? b : new Uint8Array(b)
    let s = ''
    for (const x of u) s += String.fromCharCode(x)
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  },
  dec(s: string): Uint8Array {
    const p = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
    const bin = atob(p)
    const u = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
    return u
  },
}

export const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

export const randomId = (bytes = 32) => b64u.enc(crypto.getRandomValues(new Uint8Array(bytes)))

export const allowedOrigins = (env: Env) => new Set(env.ALLOWED_ORIGINS.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean))

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } })

// ---- cifratura a riposo (AES-GCM) ----
const aesKey = (env: Env) => {
  if (!env.SESSION_KEY) throw new HttpError(503, 'SESSION_KEY mancante')
  return crypto.subtle.importKey('raw', b64u.dec(env.SESSION_KEY), 'AES-GCM', false, ['encrypt', 'decrypt'])
}
export const seal = async (env: Env, obj: unknown): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), utf8(JSON.stringify(obj))))
  return b64u.enc(concat(iv, ct))
}
export const unseal = async <T>(env: Env, s: string): Promise<T> => {
  const raw = b64u.dec(s)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await aesKey(env), raw.slice(12))
  return JSON.parse(new TextDecoder().decode(pt)) as T
}

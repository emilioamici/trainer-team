import { HttpError, type Env } from './util'

export const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export interface Verified { email: string; token: string }
const cache = new Map<string, { v: Verified; exp: number }>()

/** Il server non si fida del client: ogni richiesta porta un token Google, verificato qui (emesso per questa app + email dell'account). */
export const verifyBearer = async (env: Env, req: Request): Promise<Verified> => {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new HttpError(401, 'Token mancante')
  const hit = cache.get(token)
  if (hit && hit.exp > Date.now()) return hit.v
  const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`)
  if (!info.ok) throw new HttpError(401, 'Token non valido')
  const ti = (await info.json()) as { aud?: string; azp?: string; scope?: string; expires_in?: string | number }
  if ((ti.aud ?? ti.azp) !== env.GOOGLE_CLIENT_ID) throw new HttpError(401, 'Token emesso per un’altra app')
  if (!(ti.scope || '').split(' ').includes(SCOPE)) throw new HttpError(401, 'Scope mancante')
  const email = await emailOf(token)
  const v = { email, token }
  cache.set(token, { v, exp: Date.now() + 60_000 })
  if (cache.size > 200) cache.clear()
  return v
}

export const emailOf = async (token: string): Promise<string> => {
  const r = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new HttpError(401, 'Impossibile leggere l’account')
  const j = (await r.json()) as { user?: { emailAddress?: string } }
  const email = (j.user?.emailAddress || '').toLowerCase()
  if (!email) throw new HttpError(401, 'Account senza email')
  return email
}

/** L'account ha accesso al file (letto con il SUO token)? */
export const hasFileAccess = async (token: string, fileId: string): Promise<boolean> => {
  if (!/^[\w-]{10,}$/.test(fileId)) return false
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id`, { headers: { Authorization: `Bearer ${token}` } })
  return r.ok
}

const tokenCall = async (env: Env, params: Record<string, string>) => {
  if (!env.GOOGLE_CLIENT_SECRET) throw new HttpError(503, 'GOOGLE_CLIENT_SECRET mancante')
  const r = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...params }),
  })
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string }
  return { ok: r.ok, status: r.status, ...j }
}
export const exchangeCode = (env: Env, code: string, redirectUri: string) => tokenCall(env, { grant_type: 'authorization_code', code, redirect_uri: redirectUri })
export const refreshAccess = (env: Env, refreshToken: string) => tokenCall(env, { grant_type: 'refresh_token', refresh_token: refreshToken })
export const revoke = (refreshToken: string) => fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: 'POST' }).catch(() => undefined)

/** Client del Worker Cloudflare (facoltativo): accesso persistente (OAuth "broker") e notifiche push. */
const cfg = (k: string) => { try { return localStorage.getItem('trainer:cfg:' + k) || '' } catch { return '' } }
const SESSION_KEY = 'trainer:session'

export const workerUrl = () => (import.meta.env.VITE_PUSH_URL || cfg('pushUrl')).trim().replace(/\/+$/, '')
export const vapidKey = () => (import.meta.env.VITE_VAPID_PUBLIC_KEY || cfg('vapidKey')).trim()
export const workerFromBuild = () => !!import.meta.env.VITE_PUSH_URL
export const saveWorkerCfg = (k: 'pushUrl' | 'vapidKey', v: string) => { try { v ? localStorage.setItem('trainer:cfg:' + k, v.trim()) : localStorage.removeItem('trainer:cfg:' + k) } catch { /* ignora */ } }

export class WorkerError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export interface Health { ok: boolean; auth: boolean; push: boolean; bridge?: boolean }
let healthP: Promise<Health | null> | null = null
/** Funzioni del server attive? (feature detection: un Worker vecchio o assente non rompe nulla) */
export const health = (): Promise<Health | null> => {
  if (!workerUrl()) return Promise.resolve(null)
  healthP ??= fetch(`${workerUrl()}/health`).then((r) => (r.ok ? (r.json() as Promise<Health>) : null)).catch(() => { healthP = null; return null })
  return healthP
}
export const resetHealth = () => { healthP = null }

// ---------- sessione persistente (identificativo casuale, il token di rinnovo resta nel Worker) ----------
export const getSession = (): string | null => { try { return localStorage.getItem(SESSION_KEY) } catch { return null } }
export const setSession = (id: string) => { try { localStorage.setItem(SESSION_KEY, id) } catch { /* ignora */ } }
export const clearSession = () => { try { localStorage.removeItem(SESSION_KEY) } catch { /* ignora */ } }

/** Al ritorno dal Worker l'indirizzo contiene #trainer_session=<id>: lo si salva e lo si toglie dalla barra. */
export const captureSession = (): 'ok' | 'error' | null => {
  const m = /[#&]trainer_session=([\w-]+)/.exec(location.hash)
  const err = /[#&]trainer_error=(\w+)/.exec(location.hash)
  if (!m && !err) return null
  if (m) setSession(m[1])
  try { history.replaceState(null, '', location.pathname + location.search) } catch { /* ignora */ }
  return m ? 'ok' : 'error'
}

export const startLogin = (hint?: string | null) => {
  const ret = location.origin + import.meta.env.BASE_URL
  location.href = `${workerUrl()}/auth/start?return=${encodeURIComponent(ret)}${hint ? `&hint=${encodeURIComponent(hint)}` : ''}`
}

const post = async <T>(path: string, bearer: string, body: unknown = {}): Promise<T> => {
  let res: Response
  try { res = await fetch(workerUrl() + path, { method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
  catch { throw new WorkerError(0, 'Rete non raggiungibile') }
  const j = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new WorkerError(res.status, j.error || res.statusText)
  return j
}

export interface Refreshed { token: string; exp: number; email: string }
/** Token d'accesso fresco (1 ora) dalla sessione. 401 = sessione revocata/scaduta. */
export const refreshSession = async (): Promise<Refreshed> => {
  const id = getSession()
  if (!id) throw new WorkerError(401, 'Nessuna sessione')
  const r = await post<{ access_token: string; expires_in: number; email: string }>('/auth/refresh', id)
  return { token: r.access_token, exp: Date.now() + r.expires_in * 1000, email: r.email }
}
export const logoutSession = async () => {
  const id = getSession()
  clearSession()
  if (id && workerUrl()) await post('/auth/logout', id).catch(() => undefined)
}

// ---------- push (token Google dell'utente) ----------
export const workerPost = post

/**
 * Layer Google Drive (API v3) + Google Identity Services, tutto lato client.
 * Scope: solo `drive.file` → l'app vede soltanto i file che crea o che l'utente apre con il Google Picker.
 * Un file JSON per atleta; il registro del coach è un file a parte.
 */
import { t } from '../i18n'
import { clearSession, getSession, health, refreshSession, startLogin, workerPost, WorkerError } from './workerService'

export const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const TOKEN_KEY = 'trainer:token'
const CONNECTED_KEY = 'trainer:googleAccount'

// ---------- configurazione: le variabili della build hanno la precedenza su quelle salvate nel dispositivo ----------
const stored = (k: string) => { try { return localStorage.getItem('trainer:cfg:' + k) || '' } catch { return '' } }
export const config = {
  clientId: () => import.meta.env.VITE_GOOGLE_CLIENT_ID || stored('clientId'),
  apiKey: () => (import.meta.env.VITE_GOOGLE_API_KEY || stored('apiKey')).trim(),
  appId: () => (import.meta.env.VITE_GOOGLE_APP_ID || stored('appId')).trim(),
  fromBuild: () => !!import.meta.env.VITE_GOOGLE_CLIENT_ID,
  save: (k: 'clientId' | 'apiKey' | 'appId', v: string) => { try { v ? localStorage.setItem('trainer:cfg:' + k, v.trim()) : localStorage.removeItem('trainer:cfg:' + k) } catch { /* ignora */ } },
}
export const pickerAvailable = () => !!config.apiKey() && !!config.appId()

export class DriveError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

// ---------- caricamento script ----------
const scripts = new Map<string, Promise<void>>()
const loadScript = (src: string) => {
  let p = scripts.get(src)
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement('script')
      el.src = src; el.async = true
      el.onload = () => resolve()
      el.onerror = () => { scripts.delete(src); reject(new DriveError(0, t('Impossibile caricare i servizi Google (sei offline?).'))) }
      document.head.appendChild(el)
    })
    scripts.set(src, p)
  }
  return p
}

// ---------- autenticazione (GIS, token da 1 ora) ----------
interface StoredToken { token: string; exp: number }
const readToken = (): StoredToken | null => {
  try { const v = sessionStorage.getItem(TOKEN_KEY); return v ? (JSON.parse(v) as StoredToken) : null } catch { return null }
}
/** Token valido (con almeno 60 s di margine) oppure null. */
export const getToken = (): string | null => {
  const t = readToken()
  return t && t.exp - Date.now() > 60_000 ? t.token : null
}
export const tokenSecondsLeft = () => { const t = readToken(); return t ? Math.round((t.exp - Date.now()) / 1000) : 0 }
export const rememberedAccount = (): string | null => { try { return localStorage.getItem(CONNECTED_KEY) } catch { return null } }

const storeToken = (token: string, exp: number) => {
  try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp } satisfies StoredToken)) } catch { /* ignora */ }
}

/**
 * Ordine: 1) sessione persistente del Worker (rinnovo senza popup, anche in background);
 * 2) con il Worker attivo e `interactive` → pagina di consenso di Google (si torna all'app con la sessione);
 * 3) senza Worker → popup di Google Identity Services (token da 1 ora).
 */
export const signIn = async (interactive: boolean): Promise<string> => {
  if (getSession()) {
    try { const r = await refreshSession(); storeToken(r.token, r.exp); try { localStorage.setItem(CONNECTED_KEY, r.email) } catch { /* ignora */ } return r.token }
    catch (e) {
      if (e instanceof WorkerError && e.status === 0) throw new DriveError(0, t('Rete non raggiungibile'))
      if (e instanceof WorkerError && e.status >= 500) throw new DriveError(0, t('Rete non raggiungibile'))
      clearSession() // revocata da Google o scaduta: serve un nuovo accesso
    }
  }
  if (interactive && (await health())?.auth) {
    startLogin(rememberedAccount())
    return new Promise<string>(() => undefined) // la pagina sta per cambiare
  }
  const clientId = config.clientId()
  if (!clientId) throw new DriveError(0, t('Manca il Google Client ID (Profilo → Sincronizzazione).'))
  await loadScript('https://accounts.google.com/gsi/client')
  return new Promise<string>((resolve, reject) => {
    const hint = rememberedAccount() || undefined
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: SCOPE, hint,
      callback: (r: { access_token?: string; expires_in?: number; error?: string }) => {
        if (!r.access_token) return reject(new DriveError(401, r.error || t('Accesso negato')))
        storeToken(r.access_token, Date.now() + (r.expires_in ?? 3600) * 1000)
        resolve(r.access_token)
      },
      error_callback: (e: { type?: string; message?: string }) => reject(new DriveError(401, e?.message || e?.type || t('Accesso annullato'))),
    })
    client.requestAccessToken({ prompt: interactive ? (hint ? '' : 'consent') : 'none' })
  })
}

export const signOut = () => {
  const stored = readToken()
  try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(CONNECTED_KEY) } catch { /* ignora */ }
  if (stored && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(stored.token, () => undefined)
}

// ---------- chiamate REST ----------
const authHeader = (): Record<string, string> => {
  const tok = getToken()
  if (!tok) throw new DriveError(401, t('Non sei collegato a Google.'))
  return { Authorization: `Bearer ${tok}` }
}

const call = async (url: string, init: RequestInit = {}): Promise<Response> => {
  let res: Response
  try {
    res = await fetch(url, { ...init, headers: { ...authHeader(), ...(init.headers as Record<string, string> | undefined) } })
  } catch (e) {
    if (e instanceof DriveError) throw e
    throw new DriveError(0, t('Rete non raggiungibile'))
  }
  if (!res.ok) {
    let msg = res.statusText
    try { msg = (await res.json())?.error?.message || msg } catch { /* ignora */ }
    throw new DriveError(res.status, msg)
  }
  return res
}

export interface About { email: string; name: string }
export const getAbout = async (): Promise<About> => {
  const j = await (await call(`${API}/about?fields=user(emailAddress,displayName)`)).json()
  const email = String(j.user?.emailAddress || '').toLowerCase()
  try { localStorage.setItem(CONNECTED_KEY, email) } catch { /* ignora */ }
  return { email, name: String(j.user?.displayName || '') }
}

export interface FileMeta { id: string; name: string; version: string; modifiedTime: string; ownedByMe: boolean; canEdit: boolean }
const META_FIELDS = 'id,name,version,modifiedTime,ownedByMe,capabilities(canEdit)'
const toMeta = (j: { id: string; name: string; version?: string; modifiedTime?: string; ownedByMe?: boolean; capabilities?: { canEdit?: boolean } }): FileMeta => ({
  id: j.id, name: j.name, version: String(j.version ?? ''), modifiedTime: j.modifiedTime ?? '', ownedByMe: j.ownedByMe !== false, canEdit: j.capabilities?.canEdit !== false,
})

// ---------- piani aperti dal ponte del Worker (invitati senza accesso diretto al file con drive.file) ----------
const BRIDGED_KEY = 'trainer:bridged'
const bridgedIds = (): string[] => { try { return JSON.parse(localStorage.getItem(BRIDGED_KEY) ?? '[]') as string[] } catch { return [] } }
export const isBridged = (fileId: string) => bridgedIds().includes(fileId)
export const setBridged = (fileId: string, on: boolean) => {
  try { const rest = bridgedIds().filter((x) => x !== fileId); localStorage.setItem(BRIDGED_KEY, JSON.stringify(on ? [...rest, fileId] : rest)) } catch { /* ignora */ }
}
/** Ultima versione del file letta dal ponte: la scrittura la richiede ("scrivi solo se non è cambiato nel frattempo"). */
const bridgeVersions = new Map<string, string>()
interface BridgeMeta { id: string; name: string; version: string; modifiedTime: string }
const bridgeCall = async <T>(path: string, body: unknown): Promise<T> => {
  const token = getToken()
  if (!token) throw new DriveError(401, t('Non sei collegato a Google.'))
  try { return await workerPost<T>(path, token, body) }
  catch (e) { if (e instanceof WorkerError) throw new DriveError(e.status, e.message); throw e }
}
const bridgeFileMeta = (m: BridgeMeta, canEdit: boolean): FileMeta => ({ id: m.id, name: m.name, version: String(m.version), modifiedTime: m.modifiedTime, ownedByMe: false, canEdit })

export const getMeta = async (fileId: string): Promise<FileMeta> => {
  if (isBridged(fileId)) {
    const j = await bridgeCall<{ meta: BridgeMeta; canEdit: boolean }>('/db/meta', { fileId })
    bridgeVersions.set(fileId, String(j.meta.version))
    return bridgeFileMeta(j.meta, j.canEdit)
  }
  return toMeta(await (await call(`${API}/files/${encodeURIComponent(fileId)}?fields=${META_FIELDS}`)).json())
}

export const download = async (fileId: string): Promise<unknown> => {
  if (isBridged(fileId)) {
    const j = await bridgeCall<{ meta: BridgeMeta; db: unknown }>('/db/read', { fileId })
    bridgeVersions.set(fileId, String(j.meta.version))
    return j.db
  }
  return (await call(`${API}/files/${encodeURIComponent(fileId)}?alt=media`)).json()
}

const multipart = (metadata: unknown, content: string) => {
  const boundary = 'tt' + Math.random().toString(36).slice(2)
  return {
    type: `multipart/related; boundary=${boundary}`,
    body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`,
  }
}

export const createFile = async (name: string, json: unknown, kind: 'athlete' | 'registry'): Promise<FileMeta> => {
  const { type, body } = multipart({ name, mimeType: 'application/json', appProperties: { trainerteam: kind }, writersCanShare: false }, JSON.stringify(json))
  const res = await call(`${UPLOAD}/files?uploadType=multipart&fields=${META_FIELDS}`, { method: 'POST', headers: { 'Content-Type': type }, body })
  return toMeta(await res.json())
}

export const updateFile = async (fileId: string, json: unknown): Promise<FileMeta> => {
  if (isBridged(fileId)) {
    const expectedVersion = bridgeVersions.get(fileId)
    if (!expectedVersion) throw new DriveError(409, 'Versione sconosciuta') // prima si rilegge
    const j = await bridgeCall<{ meta: BridgeMeta; canEdit: boolean }>('/db/write', { fileId, db: json, expectedVersion })
    bridgeVersions.set(fileId, String(j.meta.version))
    return bridgeFileMeta(j.meta, true)
  }
  const res = await call(`${UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=${META_FIELDS}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(json),
  })
  return toMeta(await res.json())
}

/** Ritrova (tra i file creati da questa app) quello del registro del coach. */
export const findRegistryFile = async (): Promise<FileMeta | null> => {
  const q = encodeURIComponent("appProperties has { key='trainerteam' and value='registry' } and trashed=false")
  const j = await (await call(`${API}/files?q=${q}&orderBy=modifiedTime desc&pageSize=1&fields=files(${META_FIELDS})`)).json()
  return j.files?.[0] ? toMeta(j.files[0]) : null
}

/** Condivide il file con l'atleta (ruolo "writer") e gli manda l'email di Drive con il messaggio dell'invito. */
export const shareFile = async (fileId: string, email: string, message: string): Promise<void> => {
  await call(`${API}/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=true&emailMessage=${encodeURIComponent(message)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'user', role: 'writer', emailAddress: email }),
  })
}

export const trashFile = async (fileId: string): Promise<void> => {
  await call(`${API}/files/${encodeURIComponent(fileId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) })
}

// ---------- Google Picker: dà all'app l'accesso a un file condiviso da altri (necessario con drive.file) ----------
export const pickSharedFile = async (fileId?: string): Promise<string | null> => {
  if (!pickerAvailable()) throw new DriveError(0, t('Per aprire un file condiviso servono VITE_GOOGLE_API_KEY e VITE_GOOGLE_APP_ID (vedi README).'))
  const token = getToken()
  if (!token) throw new DriveError(401, t('Non sei collegato a Google.'))
  await loadScript('https://apis.google.com/js/api.js')
  await new Promise<void>((resolve) => window.gapi.load('picker', { callback: () => resolve() }))
  const g = window.google
  return new Promise<string | null>((resolve) => {
    const view = new g.picker.DocsView(g.picker.ViewId.DOCS)
    if (fileId) view.setFileIds(fileId)
    const picker = new g.picker.PickerBuilder()
      .addView(view).setOAuthToken(token).setDeveloperKey(config.apiKey()).setAppId(config.appId())
      .setCallback((d: { action: string; docs?: { id: string }[] }) => {
        if (d.action === 'picked') resolve(d.docs?.[0]?.id ?? null)
        else if (d.action === 'cancel') resolve(null)
      })
      .build()
    picker.setVisible(true)
  })
}

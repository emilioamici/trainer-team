import { hasFileAccess, refreshAccess, verifyBearer, type Verified } from './google'
import { HttpError, json, seal, unseal, type Env } from './util'

/**
 * Ponte verso i file dei piani su Drive per chi non ha accesso diretto al file.
 *
 * Con il permesso ristretto `drive.file` un file creato dal coach si apre, da un altro account, solo scegliendolo con il
 * Google Picker (serve una chiave API valida e su iPhone spesso non funziona). Qui il file lo legge e lo scrive il Worker
 * con l'accesso di chi l'ha creato (il coach, che lo "registra" con la sua sessione persistente), ma solo per gli account che
 * compaiono tra le condivisioni del file su Drive: la condivisione resta l'unica fonte dell'autorizzazione e si ricontrolla
 * a ogni chiamata (togliere l'atleta da Drive chiude l'accesso). Il contenuto del piano passa dal Worker ma non viene salvato.
 *
 * Unirsi con il CODICE: il codice è l'ID del file. Chi lo presenta con un accesso Google valido viene aggiunto dal Worker
 * (con l'accesso del coach) tra gli scrittori del file; da lì in poi vale la condivisione su Drive come per ogni invitato.
 */

const MAX_HOUSES_PER_USER = 20
const MAX_MEMBERS = 20 // tetto alle condivisioni create tramite codice
const BIG_BODY = 6_000_000
const hkey = (fileId: string) => `house:${fileId}`
const ikey = (email: string) => `inv:${email.toLowerCase()}`
const FIELDS = 'id,name,version,modifiedTime'
const WRITE_ROLES = new Set(['owner', 'organizer', 'fileOrganizer', 'writer'])

interface House { rt: string; email: string }
interface Perm { id?: string; emailAddress?: string; role: string }
interface Session { refresh: string; email: string }

export const validFileId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{10,100}$/.test(v)
export const bridgeReady = (env: Env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_KEY)

const loadHouse = async (env: Env, fileId: string): Promise<House | null> => {
  const v = await env.KV.get(hkey(fileId))
  return v ? unseal<House>(env, v) : null
}

/** Token d'accesso di chi ha registrato il piano. Se Google ha revocato il suo accesso il collegamento si cancella. */
const houseToken = async (env: Env, fileId: string, house: House): Promise<string> => {
  const r = await refreshAccess(env, house.rt)
  if (!r.ok || !r.access_token) {
    if (r.error === 'invalid_grant') { await env.KV.delete(hkey(fileId)); throw new HttpError(410, 'Il piano non è più collegato: il coach deve riaprire l’app.') }
    throw new HttpError(502, 'Google non risponde')
  }
  return r.access_token
}

const driveJson = async <T>(token: string, url: string, init: RequestInit = {}): Promise<{ status: number; body: T }> => {
  const r = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` } })
  return { status: r.status, body: (await r.json().catch(() => ({}))) as T }
}

const permissionsOf = async (token: string, fileId: string): Promise<Perm[]> => {
  const r = await driveJson<{ permissions?: Perm[] }>(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?fields=permissions(id,emailAddress,role)&supportsAllDrives=true`)
  if (r.status !== 200) throw new HttpError(502, 'Google non risponde')
  return r.body.permissions ?? []
}

const addInvite = async (env: Env, email: string, fileId: string) => {
  const k = ikey(email)
  let list: string[] = []
  try { list = JSON.parse((await env.KV.get(k)) ?? '[]') as string[] } catch { list = [] }
  if (!list.includes(fileId)) await env.KV.put(k, JSON.stringify([fileId, ...list].slice(0, MAX_HOUSES_PER_USER)), { expirationTtl: 180 * 86_400 })
}

/** L'account compare tra le condivisioni del file (il piano deve essere registrato sul ponte)? Usato anche da iscrizioni e avvisi push. */
export const bridgeMember = async (env: Env, email: string, fileId: string): Promise<boolean> => {
  if (!bridgeReady(env) || !validFileId(fileId)) return false
  const house = await loadHouse(env, fileId)
  if (!house) return false
  const perms = await permissionsOf(await houseToken(env, fileId, house), fileId)
  return perms.some((p) => p.emailAddress?.toLowerCase() === email.toLowerCase())
}

/** Accesso diretto al file oppure condivisione via ponte. */
export const canAccessFile = async (env: Env, me: Verified, fileId: string): Promise<boolean> => (await hasFileAccess(me.token, fileId)) || (await bridgeMember(env, me.email, fileId))

const readBig = async (req: Request): Promise<Record<string, unknown>> => {
  const text = await req.text()
  if (text.length > BIG_BODY) throw new HttpError(413, 'Piano troppo grande')
  try { const o = JSON.parse(text); if (o && typeof o === 'object') return o as Record<string, unknown> } catch { /* sotto */ }
  throw new HttpError(400, 'Richiesta non valida')
}

/** Chi chiama deve comparire tra le condivisioni; per scrivere serve un ruolo di modifica. */
const authorize = async (env: Env, req: Request, fileId: unknown, write: boolean): Promise<{ me: Verified; token: string; canEdit: boolean; id: string }> => {
  if (!bridgeReady(env)) throw new HttpError(503, 'Il ponte non è configurato sul server')
  if (!validFileId(fileId)) throw new HttpError(400, 'File non valido')
  const me = await verifyBearer(env, req)
  const house = await loadHouse(env, fileId)
  if (!house) throw new HttpError(404, 'Piano non collegato al ponte: il coach deve riaprire l’app con l’accesso persistente.')
  const token = await houseToken(env, fileId, house)
  const mine = (await permissionsOf(token, fileId)).find((p) => p.emailAddress?.toLowerCase() === me.email)
  if (!mine) throw new HttpError(403, 'Il file non è condiviso con questo account')
  const canEdit = WRITE_ROLES.has(mine.role)
  if (write && !canEdit) throw new HttpError(403, 'Serve il permesso di modifica sul file')
  return { me, token, canEdit, id: fileId }
}

const getMeta = async (token: string, id: string) => {
  const r = await driveJson<{ id: string; name: string; version: string; modifiedTime: string }>(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=${FIELDS}&supportsAllDrives=true`)
  if (r.status === 404) throw new HttpError(404, 'File non trovato')
  if (r.status !== 200) throw new HttpError(502, 'Google non risponde')
  return r.body
}

const looksLikePlan = (db: unknown): boolean => {
  const o = db as { athlete?: unknown; sessions?: unknown; schemaVersion?: unknown } | null
  return !!o && typeof o === 'object' && !!o.athlete && typeof o.athlete === 'object' && Array.isArray(o.sessions) && typeof o.schemaVersion === 'number'
}

// ================= endpoint =================

/** POST /house/register {fileId, session}: il PROPRIETARIO del file affida al Worker il collegamento (con la sua sessione persistente). */
export async function houseRegister(env: Env, req: Request, cors: Record<string, string>): Promise<Response> {
  if (!bridgeReady(env)) throw new HttpError(503, 'Il ponte non è configurato sul server')
  const body = (await readBig(req)) as { fileId?: unknown; session?: unknown }
  if (!validFileId(body.fileId)) throw new HttpError(400, 'File non valido')
  if (typeof body.session !== 'string' || !/^[\w-]{20,80}$/.test(body.session)) throw new HttpError(400, 'Sessione non valida')
  const me = await verifyBearer(env, req)
  const own = await driveJson<{ ownedByMe?: boolean }>(me.token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(body.fileId)}?fields=ownedByMe&supportsAllDrives=true`)
  if (own.status !== 200 || own.body.ownedByMe !== true) throw new HttpError(403, 'Solo chi ha creato il file può collegarlo al ponte')
  const stored = await env.KV.get(`sess:${body.session}`)
  const sess = stored ? await unseal<Session>(env, stored) : null
  if (!sess || sess.email.toLowerCase() !== me.email) throw new HttpError(403, 'La sessione non corrisponde all’account')
  const house: House = { rt: sess.refresh, email: me.email }
  const existing = await loadHouse(env, body.fileId)
  if (!existing || existing.rt !== house.rt) await env.KV.put(hkey(body.fileId), await seal(env, house))
  const perms = await permissionsOf(await houseToken(env, body.fileId, house), body.fileId)
  for (const p of perms) if (p.emailAddress) await addInvite(env, p.emailAddress, body.fileId)
  return json({ ok: true, members: perms.length }, 200, cors)
}

/** POST /house/join {fileId}: chi presenta il codice (ID del file) viene aggiunto tra gli scrittori del file dal Worker. */
export async function houseJoin(env: Env, req: Request, cors: Record<string, string>): Promise<Response> {
  if (!bridgeReady(env)) throw new HttpError(503, 'Il ponte non è configurato sul server')
  const body = (await readBig(req)) as { fileId?: unknown }
  if (!validFileId(body.fileId)) throw new HttpError(400, 'File non valido')
  const me = await verifyBearer(env, req)
  const house = await loadHouse(env, body.fileId)
  if (!house) throw new HttpError(404, 'Codice non valido o piano non ancora collegato: il coach deve riaprire l’app con l’accesso persistente.')
  const token = await houseToken(env, body.fileId, house)
  const perms = await permissionsOf(token, body.fileId)
  let joined = false
  if (!perms.some((p) => p.emailAddress?.toLowerCase() === me.email)) {
    if (perms.length >= MAX_MEMBERS) throw new HttpError(403, 'Troppi account con accesso a questo piano')
    const r = await driveJson<unknown>(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(body.fileId)}/permissions?sendNotificationEmail=false&supportsAllDrives=true`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'user', role: 'writer', emailAddress: me.email }),
    })
    if (r.status >= 300) throw new HttpError(502, 'Non riesco a condividere il piano con questo account')
    joined = true
  }
  await addInvite(env, me.email, body.fileId)
  const meta = await getMeta(token, body.fileId)
  return json({ ok: true, joined, name: meta.name }, 200, cors)
}

/** POST /house/mine: i piani condivisi con questo account e collegati al ponte (inviti da mostrare senza codice). */
export async function houseMine(env: Env, req: Request, cors: Record<string, string>): Promise<Response> {
  if (!bridgeReady(env)) return json({ houses: [] }, 200, cors)
  const me = await verifyBearer(env, req)
  let ids: string[] = []
  try { ids = JSON.parse((await env.KV.get(ikey(me.email))) ?? '[]') as string[] } catch { ids = [] }
  const houses: { id: string; name: string; modifiedTime: string }[] = []
  const keep: string[] = []
  for (const id of ids.slice(0, MAX_HOUSES_PER_USER)) {
    const house = await loadHouse(env, id)
    if (!house) continue
    try {
      const token = await houseToken(env, id, house)
      if (!(await permissionsOf(token, id)).some((p) => p.emailAddress?.toLowerCase() === me.email)) continue
      const m = await getMeta(token, id)
      houses.push({ id, name: m.name, modifiedTime: m.modifiedTime }); keep.push(id)
    } catch { keep.push(id) /* errore passeggero: si riprova */ }
  }
  if (keep.length !== ids.length) await (keep.length ? env.KV.put(ikey(me.email), JSON.stringify(keep), { expirationTtl: 180 * 86_400 }) : env.KV.delete(ikey(me.email)))
  return json({ houses }, 200, cors)
}

/** POST /db/meta {fileId} → {meta, canEdit} */
export async function dbMeta(env: Env, req: Request, cors: Record<string, string>): Promise<Response> {
  const body = (await readBig(req)) as { fileId?: unknown }
  const a = await authorize(env, req, body.fileId, false)
  return json({ meta: await getMeta(a.token, a.id), canEdit: a.canEdit }, 200, cors)
}

/** POST /db/read {fileId} → {meta, canEdit, db} (prima i metadati: una scrittura nel frattempo farà scattare il conflitto) */
export async function dbRead(env: Env, req: Request, cors: Record<string, string>): Promise<Response> {
  const body = (await readBig(req)) as { fileId?: unknown }
  const a = await authorize(env, req, body.fileId, false)
  const meta = await getMeta(a.token, a.id)
  const r = await driveJson<unknown>(a.token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(a.id)}?alt=media&supportsAllDrives=true`)
  if (r.status !== 200) throw new HttpError(r.status === 404 ? 404 : 502, 'Impossibile leggere il piano')
  return json({ meta, canEdit: a.canEdit, db: r.body }, 200, cors)
}

/** POST /db/write {fileId, db, expectedVersion}: scrive solo se la versione coincide (altrimenti 409 e l'app rilegge e fa il merge). */
export async function dbWrite(env: Env, req: Request, cors: Record<string, string>): Promise<Response> {
  const body = (await readBig(req)) as { fileId?: unknown; db?: unknown; expectedVersion?: unknown }
  if (!looksLikePlan(body.db)) throw new HttpError(400, 'Piano non valido')
  if (typeof body.expectedVersion !== 'string') throw new HttpError(400, 'Versione mancante')
  const a = await authorize(env, req, body.fileId, true)
  const current = await getMeta(a.token, a.id)
  if (current.version !== body.expectedVersion) throw new HttpError(409, 'Versione cambiata')
  const r = await driveJson<{ id: string; name: string; version: string; modifiedTime: string }>(a.token,
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(a.id)}?uploadType=media&fields=${FIELDS}&supportsAllDrives=true`,
    { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body.db) })
  if (r.status !== 200) throw new HttpError(502, 'Impossibile scrivere il piano')
  return json({ meta: r.body, canEdit: true }, 200, cors)
}

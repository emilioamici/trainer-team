import { t } from '../i18n'
import { idbDel, idbGet, idbSet } from '../lib/idb'
import {
  emptyRegistry, mergeDb, mergeRegistry, newAthlete, newDb, parseDb, parseRegistry, removeEntry, sameContent, updateAthlete, upsertEntry,
} from '../lib/db'
import { inviteLink, parseInviteCode } from '../lib/invite'
import { slug, uid } from '../lib/ids'
import { nowISO } from '../lib/dates'
import { sampleDb } from '../lib/sample'
import * as drive from '../services/googleDriveService'
import type { CoachRegistry, RegistryEntry, Source, SyncStatus, TrainingPlanDatabase, UserRole } from '../types'

export const SYNC_EVERY_MS = 120_000
export const DEBOUNCE_MS = 2_000

interface RT {
  db: TrainingPlanDatabase | null
  status: SyncStatus
  lastSync: string | null
  error: string | null
  rev: string | null // versione di Drive a cui corrisponde la copia locale
  dirty: boolean
  reconciled: boolean // false = prima di inviare si rilegge Drive (una copia persa non sovrascrive mai Drive)
  seq: number
  canEdit: boolean
}
interface Linked { id: string; fileId: string; name: string }
export interface Toast { id: number; msg: string; kind: 'ok' | 'err' | 'info' }
export type AuthState = 'out' | 'in' | 'expired'

const LS = {
  get: (k: string) => { try { return localStorage.getItem('trainer:' + k) } catch { return null } },
  set: (k: string, v: string | null) => { try { v === null ? localStorage.removeItem('trainer:' + k) : localStorage.setItem('trainer:' + k, v) } catch { /* ignora */ } },
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export class Engine {
  version = 0
  private listeners = new Set<() => void>()
  private rt = new Map<string, RT>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private locks = new Map<string, Promise<void>>()
  private started = false
  private interval: ReturnType<typeof setInterval> | null = null

  role: UserRole = (LS.get('role') as UserRole) === 'coach' ? 'coach' : 'athlete'
  private storedActive: string | null = LS.get('active')
  demoEnabled = LS.get('demo') !== '0'
  profileName = LS.get('profileName') || ''
  private personalFileId: string | null = LS.get('personalFileId')
  private registryFileId: string | null = LS.get('registryFileId')
  private linked: Linked[] = (() => { try { return JSON.parse(LS.get('linked') || '[]') as Linked[] } catch { return [] } })()
  registry: CoachRegistry = emptyRegistry()
  private registryDirty = false
  private registryRev: string | null = null
  private registryReconciled = false
  account: drive.About | null = null
  authState: AuthState = drive.getToken() ? 'in' : drive.rememberedAccount() ? 'expired' : 'out'
  ready = false
  online = typeof navigator === 'undefined' ? true : navigator.onLine
  toast: Toast | null = null
  cacheOk = true

  // ---------- osservabilità ----------
  subscribe = (cb: () => void) => { this.listeners.add(cb); return () => { this.listeners.delete(cb) } }
  getVersion = () => this.version
  private emit() { this.version++; this.listeners.forEach((l) => l()) }
  notify(msg: string, kind: Toast['kind'] = 'ok') { this.toast = { id: Date.now() + Math.random(), msg, kind }; this.emit() }

  // ---------- avvio ----------
  async start() {
    if (this.started) return
    this.started = true
    const reg = await idbGet<CoachRegistry>('registry')
    if (reg) this.registry = parseRegistry(reg)
    if (this.registryFileId) { const r = await idbGet<{ rev: string }>('registry-meta'); this.registryRev = r?.rev ?? null }
    await Promise.all(this.allSources().map((s) => this.ensureLoaded(s)))
    this.ready = true
    this.emit()
    window.addEventListener('online', () => { this.online = true; this.emit(); void this.syncAll() })
    window.addEventListener('offline', () => { this.online = false; this.emit() })
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void this.syncAll() })
    this.interval = setInterval(() => void this.syncAll(), SYNC_EVERY_MS)
    void this.syncAll()
  }
  stop() { if (this.interval) clearInterval(this.interval); this.timers.forEach(clearTimeout) }

  // ---------- elenco dei piani ----------
  private personal = (): Source => ({ id: 'personal', kind: 'personal', fileId: this.personalFileId, name: t('Il mio piano') })
  private demos = (): Source[] => this.demoEnabled
    ? ([1, 2] as const).map((n) => ({ id: `demo:${n}`, kind: 'demo' as const, fileId: null, name: this.rt.get(`demo:${n}`)?.db?.athlete.name ?? `Demo ${n}` }))
    : []
  private athletes = (): Source[] => this.registry.athletes.map((e) => ({ id: 'athlete:' + e.athleteId, kind: 'coach-athlete' as const, fileId: e.fileId, name: e.name }))
  private linkedSources = (): Source[] => this.linked.map((l) => ({ id: l.id, kind: 'linked' as const, fileId: l.fileId, name: this.rt.get(l.id)?.db?.athlete.name || l.name }))
  allSources = (): Source[] => [this.personal(), ...this.athletes(), ...this.linkedSources(), ...this.demos()]
  /** Piani visibili con il ruolo corrente. */
  sources = (): Source[] =>
    this.role === 'coach'
      ? [...this.athletes(), ...this.demos().slice(0, 2), this.personal()]
      : [this.personal(), ...this.linkedSources(), ...this.demos().slice(0, 1)]
  active = (): Source | null => {
    const list = this.sources()
    return list.find((s) => s.id === this.storedActive) ?? (this.demoEnabled && this.role === 'athlete' ? list.find((s) => s.kind === 'demo') : undefined) ?? list[0] ?? null
  }
  activeDb = () => { const a = this.active(); return a ? this.dbOf(a.id) : null }
  dbOf = (id: string) => this.rt.get(id)?.db ?? null
  statusOf = (id: string) => {
    const r = this.rt.get(id)
    return { status: (r?.status ?? 'local') as SyncStatus, lastSync: r?.lastSync ?? null, error: r?.error ?? null, dirty: !!r?.dirty }
  }
  canEditPlan = (s: Source | null) => {
    if (!s) return false
    if (s.kind !== 'linked') return true
    const r = this.rt.get(s.id)
    return !!r?.db?.athlete.athleteCanEdit && r.canEdit
  }
  canLog = (s: Source | null) => !!s && (s.kind !== 'linked' || this.rt.get(s.id)?.canEdit !== false)
  isAuthed = () => this.authState === 'in'
  by = () => this.account?.email || this.role

  setActive(id: string) { this.storedActive = id; LS.set('active', id); this.emit() }
  setRole(r: UserRole) { this.role = r; LS.set('role', r); this.emit(); void this.syncAll() }
  setDemo(on: boolean) {
    this.demoEnabled = on; LS.set('demo', on ? '1' : '0')
    if (!on) { void idbDel('db:demo:1'); void idbDel('db:demo:2'); this.rt.delete('demo:1'); this.rt.delete('demo:2') }
    else void Promise.all(this.demos().map((s) => this.ensureLoaded(s)).concat()).then(() => this.emit())
    this.emit()
  }
  setProfileName(name: string) {
    this.profileName = name; LS.set('profileName', name)
    this.mutate('personal', (db) => updateAthlete(db, { name: name || t('Io') }, this.by()))
    if (this.registry.coachName !== name) { this.registry = { ...this.registry, coachName: name, updatedAt: nowISO() }; this.touchRegistry() }
  }

  // ---------- caricamento / persistenza locale ----------
  private ensureRT(id: string): RT {
    let r = this.rt.get(id)
    if (!r) { r = { db: null, status: 'local', lastSync: null, error: null, rev: null, dirty: false, reconciled: false, seq: 0, canEdit: true }; this.rt.set(id, r) }
    return r
  }
  private async ensureLoaded(s: Source) {
    const r = this.ensureRT(s.id)
    if (r.db) return
    const cached = await idbGet<{ db: TrainingPlanDatabase; rev: string | null; dirty: boolean }>('db:' + s.id)
    if (cached) {
      try { r.db = parseDb(cached.db); r.rev = cached.rev; r.dirty = !!cached.dirty; r.reconciled = false; r.status = s.fileId ? (r.dirty ? 'pending' : 'synced') : 'local'; return } catch { /* copia danneggiata: si ricrea */ }
    }
    if (s.kind === 'demo') r.db = sampleDb(s.id === 'demo:2' ? 2 : 1)
    else if (s.kind === 'personal') r.db = newDb(newAthlete(this.profileName || t('Io')), this.by())
    else if (s.kind === 'coach-athlete') {
      const e = this.registry.athletes.find((x) => 'athlete:' + x.athleteId === s.id)
      if (e) { const a = newAthlete(e.name, e.focus, e.email, this.profileName || null); a.id = e.athleteId; r.db = newDb(a, this.by()) }
    }
    if (r.db) { r.dirty = s.kind !== 'demo'; await this.persist(s.id) }
  }
  private async persist(id: string) {
    const r = this.rt.get(id)
    if (!r?.db) return
    const ok = await idbSet('db:' + id, { db: r.db, rev: r.rev, dirty: r.dirty })
    if (ok !== this.cacheOk) { this.cacheOk = ok; this.emit() }
  }
  private async persistRegistry() {
    await idbSet('registry', this.registry)
    await idbSet('registry-meta', { rev: this.registryRev })
  }

  // ---------- modifiche ----------
  mutate(id: string, fn: (db: TrainingPlanDatabase) => TrainingPlanDatabase) {
    const r = this.rt.get(id)
    if (!r?.db) return
    r.db = fn(r.db)
    r.seq++
    const s = this.allSources().find((x) => x.id === id)
    if (s && s.kind !== 'demo') { r.dirty = true; r.status = this.online ? 'pending' : 'offline'; this.schedule(id) }
    void this.persist(id)
    // il nome/profilo dell'atleta si rispecchia nel registro del coach
    if (s?.kind === 'coach-athlete') {
      const e = this.registry.athletes.find((x) => 'athlete:' + x.athleteId === id)
      if (e && (e.name !== r.db.athlete.name || e.focus !== r.db.athlete.focus)) {
        this.registry = upsertEntry(this.registry, { ...e, name: r.db.athlete.name, focus: r.db.athlete.focus }); this.touchRegistry(false)
      }
    }
    this.emit()
  }
  private schedule(id: string) {
    const old = this.timers.get(id)
    if (old) clearTimeout(old)
    this.timers.set(id, setTimeout(() => void this.syncSource(id), DEBOUNCE_MS))
  }
  private touchRegistry(emit = true) {
    this.registryDirty = true
    void this.persistRegistry()
    if (emit) this.emit()
    const old = this.timers.get('registry')
    if (old) clearTimeout(old)
    this.timers.set('registry', setTimeout(() => void this.syncRegistry(), DEBOUNCE_MS))
  }

  // ---------- account Google ----------
  /** Token valido, tentando un rinnovo silenzioso se serve. */
  private async ensureToken(): Promise<boolean> {
    if (drive.getToken()) { this.setAuth('in'); return true }
    if (!drive.rememberedAccount() || !drive.config.clientId()) { this.setAuth('out'); return false }
    try { await drive.signIn(false); this.setAuth('in'); return true } catch { this.setAuth('expired'); return false }
  }
  private setAuth(s: AuthState) { if (this.authState !== s) { this.authState = s; this.emit() } }

  async connect() {
    try {
      await drive.signIn(true)
      this.account = await drive.getAbout()
      this.setAuth('in')
      this.notify(t('Collegato a Google come {email}', { email: this.account.email }))
      await this.syncAll()
    } catch (e) { this.notify(errMsg(e), 'err') }
  }
  async loadAccount() {
    if (this.account || !drive.getToken()) return
    try { this.account = await drive.getAbout(); this.emit() } catch { /* ignora */ }
  }
  disconnect() {
    drive.signOut()
    this.account = null; this.authState = 'out'
    this.rt.forEach((r) => { if (r.status !== 'local') r.status = r.dirty ? 'pending' : 'local' })
    this.emit()
  }

  // ---------- sincronizzazione ----------
  async syncAll() {
    if (!this.started) return
    await this.syncRegistry()
    await Promise.all(this.allSources().filter((s) => s.kind !== 'demo').map((s) => this.syncSource(s.id)))
  }

  syncSource(id: string): Promise<void> {
    const prev = this.locks.get(id) ?? Promise.resolve()
    const next = prev.then(() => this.doSync(id)).catch(() => undefined)
    this.locks.set(id, next)
    return next
  }

  private fileNameFor(s: Source) {
    return s.kind === 'personal' ? 'training-plan-personal.json' : `training-plan-${slug(s.name)}-${s.id.split(':')[1]?.slice(-4) || 'x'}.json`
  }

  private async doSync(id: string) {
    const s = this.allSources().find((x) => x.id === id)
    const r = this.rt.get(id)
    if (!s || !r?.db || s.kind === 'demo') return
    // piani del coach/personali senza file e senza Google → restano locali
    if (!navigator.onLine) { this.online = false; r.status = 'offline'; this.emit(); return }
    this.online = true
    if (!(await this.ensureToken())) { r.status = this.authState === 'out' && !s.fileId ? 'local' : 'auth'; this.emit(); return }
    r.status = 'syncing'; this.emit()
    try {
      if (!s.fileId) {
        if (s.kind === 'linked') return
        // il piano personale vuoto resta locale: il file su Drive nasce quando c'è qualcosa da salvare
        if (s.kind === 'personal' && r.db.sessions.length === 0) { r.status = 'local'; this.emit(); return }
        const meta = await drive.createFile(this.fileNameFor(s), r.db, 'athlete')
        this.setFileId(s, meta.id)
        r.rev = meta.version; r.dirty = false; r.reconciled = true; r.canEdit = true
      } else {
        const meta = await drive.getMeta(s.fileId)
        r.canEdit = meta.canEdit
        let needPush = r.dirty
        if (!r.reconciled || meta.version !== r.rev) {
          const remote = parseDb(await drive.download(s.fileId))
          const local = r.db // letto dopo l'attesa: nessuna modifica va persa
          const merged = mergeDb(local, remote)
          if (!sameContent(merged, local)) { r.db = merged; r.seq++ }
          needPush = !sameContent(merged, remote)
          r.reconciled = true; r.rev = meta.version
        }
        if (needPush && meta.canEdit) {
          const seq = r.seq
          const m = await drive.updateFile(s.fileId, r.db)
          r.rev = m.version
          r.dirty = r.seq !== seq
          if (r.dirty) this.schedule(id)
        } else if (needPush) { r.error = t('Sola lettura: non puoi modificare questo piano.') }
        else r.dirty = false
      }
      r.status = r.dirty ? 'pending' : 'synced'; r.lastSync = nowISO(); if (r.status === 'synced') r.error = null
    } catch (e) {
      const st = e instanceof drive.DriveError ? e.status : 0
      if (st === 401) { this.setAuth('expired'); r.status = 'auth' }
      else if (st === 0) r.status = 'offline'
      else {
        r.status = 'error'
        r.error = st === 404 ? t('Non hai più accesso a questo piano (404).') : st === 403 ? t('Serve il permesso di modifica sul file (403).') : errMsg(e)
      }
    }
    await this.persist(id)
    this.emit()
  }

  /** Il file di un piano è stato creato: lo ricordiamo dove serve. */
  private setFileId(s: Source, fileId: string) {
    if (s.kind === 'personal') { this.personalFileId = fileId; LS.set('personalFileId', fileId) }
    else if (s.kind === 'coach-athlete') {
      const e = this.registry.athletes.find((x) => 'athlete:' + x.athleteId === s.id)
      if (e) { this.registry = upsertEntry(this.registry, { ...e, fileId }); this.touchRegistry(false) }
    }
  }

  async syncRegistry() {
    if (this.role !== 'coach' && !this.registry.athletes.length) return
    if (!navigator.onLine || !(await this.ensureToken())) return
    try {
      if (!this.registryFileId) {
        const found = await drive.findRegistryFile()
        if (found) { this.registryFileId = found.id; LS.set('registryFileId', found.id); this.registryReconciled = false }
        else if (this.registry.athletes.length) {
          const meta = await drive.createFile('training-plan-registry.json', this.registry, 'registry')
          this.registryFileId = meta.id; LS.set('registryFileId', meta.id); this.registryRev = meta.version; this.registryDirty = false; this.registryReconciled = true
          await this.persistRegistry(); return
        } else return
      }
      const meta = await drive.getMeta(this.registryFileId)
      let push = this.registryDirty
      if (!this.registryReconciled || meta.version !== this.registryRev) {
        const remote = parseRegistry(await drive.download(this.registryFileId))
        const merged = mergeRegistry(this.registry, remote)
        const changed = !sameContent(merged, this.registry)
        this.registry = merged
        push = !sameContent(merged, remote)
        this.registryReconciled = true; this.registryRev = meta.version
        if (changed) await Promise.all(this.athletes().map((a) => this.ensureLoaded(a)))
      }
      if (push) { const m = await drive.updateFile(this.registryFileId, this.registry); this.registryRev = m.version; this.registryDirty = false }
      await this.persistRegistry()
      this.emit()
    } catch (e) {
      if (e instanceof drive.DriveError && e.status === 401) this.setAuth('expired')
    }
  }

  // ---------- coach: atleti e inviti ----------
  async addAthlete(input: { name: string; focus: string; email: string }): Promise<Source> {
    const a = newAthlete(input.name.trim(), input.focus.trim(), input.email.trim().toLowerCase() || null, this.profileName || null)
    const entry: RegistryEntry = { athleteId: a.id, name: a.name, focus: a.focus, email: a.email, fileId: null, addedAt: nowISO(), invitedAt: null, updatedAt: nowISO() }
    this.registry = upsertEntry(this.registry, entry)
    const src: Source = { id: 'athlete:' + a.id, kind: 'coach-athlete', fileId: null, name: a.name }
    const r = this.ensureRT(src.id)
    r.db = newDb(a, this.by()); r.dirty = true; r.status = 'local'
    await this.persist(src.id)
    this.touchRegistry(false)
    this.setActive(src.id)
    void this.syncSource(src.id)
    return src
  }

  removeAthlete(id: string) {
    this.registry = removeEntry(this.registry, id)
    this.rt.delete('athlete:' + id); void idbDel('db:athlete:' + id)
    if (this.storedActive === 'athlete:' + id) { this.storedActive = null; LS.set('active', null) }
    this.touchRegistry()
  }

  /** Condivisione del file (ruolo scrittore) + email di Drive; restituisce link e codice da copiare. */
  async inviteAthlete(athleteId: string): Promise<{ link: string; code: string; emailed: boolean }> {
    const sid = 'athlete:' + athleteId
    let entry = this.registry.athletes.find((x) => x.athleteId === athleteId)
    if (!entry) throw new Error(t('Atleta non trovato'))
    if (!entry.fileId) {
      if (!(await this.ensureToken())) throw new Error(t('Collega prima Google (Profilo → Sincronizzazione) per generare l’invito.'))
      await this.syncSource(sid)
      entry = this.registry.athletes.find((x) => x.athleteId === athleteId)
    }
    if (!entry?.fileId) throw new Error(t('Non riesco a creare il file su Drive.'))
    const link = inviteLink(entry.fileId)
    let emailed = false
    if (entry.email) {
      const msg = t('Il tuo coach ti ha condiviso il piano di allenamento. Apri Trainer Team, scegli "Collegati a un Coach" e incolla questo link: {link} — oppure il codice: {code}', { link, code: entry.fileId })
      await drive.shareFile(entry.fileId, entry.email, msg)
      emailed = true
    }
    this.registry = upsertEntry(this.registry, { ...entry, invitedAt: nowISO() })
    this.touchRegistry()
    return { link, code: entry.fileId, emailed }
  }
  inviteInfo = (athleteId: string) => {
    const e = this.registry.athletes.find((x) => x.athleteId === athleteId)
    return e?.fileId ? { link: inviteLink(e.fileId), code: e.fileId } : null
  }

  // ---------- atleta: collegarsi al piano di un coach ----------
  async linkCoach(input: string): Promise<void> {
    const fileId = parseInviteCode(input)
    if (!fileId) throw new Error(t('Codice o link non valido'))
    const existing = this.linked.find((l) => l.fileId === fileId)
    if (existing) { this.role = 'athlete'; LS.set('role', 'athlete'); this.setActive(existing.id); return }
    if (!(await this.ensureToken())) throw new Error(t('Collega prima Google (Profilo → Sincronizzazione).'))
    let meta: drive.FileMeta
    try { meta = await drive.getMeta(fileId) } catch (e) {
      if (e instanceof drive.DriveError && (e.status === 404 || e.status === 403)) {
        // con drive.file un file condiviso da altri si apre solo scegliendolo con il Picker
        const picked = await drive.pickSharedFile(fileId)
        if (!picked) throw new Error(t('Operazione annullata'))
        try { meta = await drive.getMeta(picked) } catch { throw new Error(t('Controlla il codice e che il coach ti abbia invitato con questo account Google.')) }
      } else throw e
    }
    const db = parseDb(await drive.download(meta.id))
    const id = 'linked:' + meta.id
    this.linked = [...this.linked, { id, fileId: meta.id, name: db.athlete.name }]
    LS.set('linked', JSON.stringify(this.linked))
    const r = this.ensureRT(id)
    r.db = db; r.rev = meta.version; r.reconciled = true; r.dirty = false; r.status = 'synced'; r.lastSync = nowISO(); r.canEdit = meta.canEdit
    await this.persist(id)
    this.role = 'athlete'; LS.set('role', 'athlete')
    this.setActive(id)
  }
  unlinkCoach(id: string) {
    this.linked = this.linked.filter((l) => l.id !== id)
    LS.set('linked', JSON.stringify(this.linked))
    this.rt.delete(id); void idbDel('db:' + id)
    if (this.storedActive === id) { this.storedActive = null; LS.set('active', null) }
    this.emit()
  }

  // ---------- backup ----------
  /** Sostituisce/unisce il contenuto del piano con un db letto da un backup. */
  async importDb(id: string, raw: unknown, mode: 'merge' | 'replace') {
    const incoming = parseDb(raw)
    const r = this.rt.get(id)
    if (!r?.db) return
    const cur = r.db
    const next = mode === 'merge' ? mergeDb(cur, incoming) : { ...incoming, athlete: cur.athlete, meta: { ...cur.meta, updatedAt: nowISO(), revision: cur.meta.revision + 1 }, deleted: { ...cur.deleted, ...incoming.deleted } }
    this.mutate(id, () => next)
  }
  async resetDemo() {
    await idbDel('db:demo:1'); await idbDel('db:demo:2')
    this.rt.delete('demo:1'); this.rt.delete('demo:2')
    await Promise.all(this.demos().map((s) => this.ensureLoaded(s)))
    this.emit()
  }

  newId = uid
}

export const engine = new Engine()

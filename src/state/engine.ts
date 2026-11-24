import { t } from '../i18n'
import { idbDel, idbGet, idbSet } from '../lib/idb'
import {
  emptyRegistry, mergeDb, placeholderDb, mergeRegistry, newAthlete, newDb, parseDb, parseRegistry, removeEntry, sameContent, updateAthlete, upsertEntry,
} from '../lib/db'
import { clearPendingJoin, inviteLink, parseInviteCode, pendingJoin, setPendingJoin } from '../lib/invite'
import { slug, uid } from '../lib/ids'
import { nowISO } from '../lib/dates'
import { addNotification } from '../lib/notifications'
import { diffNotifications } from '../lib/notifyDiff'
import { sampleDb } from '../lib/sample'
import * as drive from '../services/googleDriveService'
import * as push from '../services/pushService'
import * as bridge from '../services/bridgeService'
import { captureSession, getSession, health, logoutSession, workerUrl, WorkerError, type Health } from '../services/workerService'
import type { CoachRegistry, RegistryEntry, ScheduleSlot, SessionStatus, Source, SyncStatus, TargetKind, TrainingPlanDatabase, UserRole, WorkoutSession } from '../types'

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
/** Notifica in coda: parte dopo che i dati sono stati inviati a Drive. */
interface Notice { tag: string; source: string; title: string; body: string; at: number }
export type PlanEvent = { type: 'plan'; title?: string } | { type: 'log'; session: WorkoutSession; status: SessionStatus }

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
  authState: AuthState = drive.getToken() ? 'in' : drive.rememberedAccount() || getSession() ? 'expired' : 'out'
  /** Esito del ritorno dalla pagina di consenso del Worker (letto prima che l'indirizzo venga ripulito). */
  private sessionReturn = typeof location !== 'undefined' ? captureSession() : null
  workerHealth: Health | null = null
  private pushQ: Notice[] = []
  private tokenP: Promise<boolean> | null = null
  ready = false
  /** false finché non si sa se c'è già un accesso valido (evita il lampo della schermata di accesso). */
  authChecked = false
  private gateDismissed = false
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
    this.pushQ = (await idbGet<Notice[]>('pushq')) ?? []
    this.ready = true
    this.emit()
    void health().then((h) => { this.workerHealth = h; this.emit() })
    window.addEventListener('online', () => { this.online = true; this.emit(); void this.syncAll() })
    window.addEventListener('offline', () => { this.online = false; this.emit() })
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void this.syncAll() })
    this.interval = setInterval(() => void this.syncAll(), SYNC_EVERY_MS)
    this.renewTimer = setInterval(() => void this.renewIfNeeded(), 60_000)
    if (this.sessionReturn === 'error') this.notify(t('Accesso a Google non riuscito.'), 'err')
    if (await this.ensureToken()) {
      await this.loadAccount()
      if (this.sessionReturn === 'ok' && this.account) this.notify(t('Collegato a Google come {email}', { email: this.account.email }))
      this.finishOnboarding()
      void this.autoJoinPending()
    }
    this.authChecked = true
    this.emit()
    void this.syncAll()
  }
  private renewTimer: ReturnType<typeof setInterval> | null = null
  /** Con la sessione persistente il token si rinnova da solo, anche in background, prima che scada. */
  private async renewIfNeeded() {
    if (getSession() && drive.tokenSecondsLeft() < 600 && navigator.onLine) await this.ensureToken(true)
  }
  stop() { if (this.interval) clearInterval(this.interval); if (this.renewTimer) clearInterval(this.renewTimer); this.timers.forEach(clearTimeout) }

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
    else if (s.kind === 'personal') r.db = placeholderDb(newAthlete(this.profileName || t('Io')), this.by())
    else if (s.kind === 'coach-athlete') {
      const e = this.registry.athletes.find((x) => 'athlete:' + x.athleteId === s.id)
      if (e) {
        const a = newAthlete(e.name, e.focus, e.email, this.profileName || null, e.targetKind ?? 'individual', e.members ?? [], e.schedule ?? '', e.color, e.icon, e.scheduleSlots)
        a.id = e.athleteId
        r.db = placeholderDb(a, this.by()) // il contenuto vero è su Drive: non deve mai sovrascriverlo
      }
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
      if (
        e &&
        (e.name !== r.db.athlete.name ||
          e.focus !== r.db.athlete.focus ||
          e.targetKind !== r.db.athlete.targetKind ||
          e.schedule !== r.db.athlete.schedule ||
          e.color !== r.db.athlete.color ||
          e.icon !== r.db.athlete.icon ||
          JSON.stringify(e.scheduleSlots) !== JSON.stringify(r.db.athlete.scheduleSlots) ||
          JSON.stringify(e.members) !== JSON.stringify(r.db.athlete.members))
      ) {
        this.registry = upsertEntry(this.registry, {
          ...e,
          name: r.db.athlete.name,
          focus: r.db.athlete.focus,
          targetKind: r.db.athlete.targetKind,
          schedule: r.db.athlete.schedule,
          color: r.db.athlete.color,
          icon: r.db.athlete.icon,
          scheduleSlots: r.db.athlete.scheduleSlots,
          members: r.db.athlete.members,
        })
        this.touchRegistry(false)
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
  /** Token valido, rinnovandolo (sessione del Worker o rinnovo silenzioso di Google) se serve. Le chiamate parallele condividono lo stesso rinnovo. */
  private ensureToken(force = false): Promise<boolean> {
    if (!force && drive.getToken()) { this.setAuth('in'); return Promise.resolve(true) }
    if (this.tokenP) return this.tokenP
    this.tokenP = (async () => {
      const session = !!getSession()
      if (!session && (!drive.rememberedAccount() || !drive.config.clientId())) { this.setAuth('out'); return false }
      try { await drive.signIn(false); this.setAuth('in'); return true }
      catch (e) {
        if (e instanceof drive.DriveError && e.status === 0 && session) return !!drive.getToken() // Worker irraggiungibile: nessuna schermata di accesso, si resta sui dati locali
        this.setAuth('expired'); return false
      }
    })().finally(() => { this.tokenP = null })
    return this.tokenP
  }
  private setAuth(s: AuthState) { if (this.authState !== s) { this.authState = s; this.emit() } }

  async connect() {
    try {
      await drive.signIn(true)
      this.account = await drive.getAbout()
      this.setAuth('in')
      this.notify(t('Collegato a Google come {email}', { email: this.account.email }))
      this.finishOnboarding()
      void this.autoJoinPending()
      await this.syncAll()
    } catch (e) { this.notify(errMsg(e), 'err') }
  }

  // ---------- schermata di accesso ----------
  /** 'login' = primo accesso, 'relogin' = sessione scaduta; null = nessuna schermata. Chi ha scelto la demo non la vede. */
  gateMode = (): 'login' | 'relogin' | null => {
    if (!this.authChecked || LS.get('gate') === 'skip') return null
    if (this.authState === 'out') return 'login'
    if (this.authState === 'expired' && this.online && !this.gateDismissed) return 'relogin'
    return null
  }
  /** Prova senza account: l'app resta locale (dati demo) finché non si collega Google dal Profilo. */
  skipGate() { LS.set('gate', 'skip'); this.emit() }
  dismissRelogin() { this.gateDismissed = true; this.emit() }
  /** Accesso dalla schermata iniziale: ruolo scelto, eventuale codice d'invito da usare dopo l'accesso. */
  async beginLogin(role: UserRole, inviteCode?: string) {
    this.role = role; LS.set('role', role)
    const code = inviteCode ? parseInviteCode(inviteCode) : null
    if (code) setPendingJoin(code)
    if (LS.get('gate') !== 'skip' && !LS.get('onboarded')) LS.set('onboard', '1')
    this.emit()
    await this.connect()
  }
  /** Al primo accesso riuscito: via i dati demo, si parte dal piano personale (atleta). */
  private finishOnboarding() {
    if (LS.get('onboard') !== '1') return
    LS.set('onboard', null); LS.set('onboarded', '1'); LS.set('gate', null)
    this.demoEnabled = false; LS.set('demo', '0')
    void idbDel('db:demo:1'); void idbDel('db:demo:2'); this.rt.delete('demo:1'); this.rt.delete('demo:2')
    this.storedActive = this.role === 'athlete' ? 'personal' : null; LS.set('active', this.storedActive)
    this.emit()
  }
  async loadAccount() {
    if (this.account || !drive.getToken()) return
    try { this.account = await drive.getAbout(); this.emit() } catch { /* ignora */ }
  }
  async disconnect() {
    const tok = drive.getToken()
    if (push.pushWanted()) await push.disablePush(tok).catch(() => undefined)
    await logoutSession()
    drive.signOut()
    this.account = null; this.authState = 'out'
    this.rt.forEach((r) => { if (r.status !== 'local') r.status = r.dirty ? 'pending' : 'local' })
    this.emit()
  }
  hasPersistentLogin = () => !!getSession()

  // ---------- sincronizzazione ----------
  async syncAll() {
    if (!this.started) return
    await this.syncRegistry()
    await Promise.all(this.allSources().filter((s) => s.kind !== 'demo').map((s) => this.syncSource(s.id)))
    void this.syncPush()
    void this.registerHouses()
    void this.checkInvites()
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
        // il coach non è obbligato ad avere un piano personale: per lui il file nasce quando c'è qualcosa; l'atleta lo ha subito dopo l'accesso
        if (s.kind === 'personal' && this.role === 'coach' && r.db.sessions.length === 0) { r.status = 'local'; this.emit(); return }
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
          if (!sameContent(merged, local)) {
            // avvisi in-app per ciò che ha cambiato un altro utente (non alla prima sincronizzazione di questo dispositivo)
            if (r.rev !== null) for (const n of diffNotifications(local, merged, s.kind, s.id)) addNotification(n)
            r.db = merged; r.seq++
          }
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
      if (!r.dirty) void this.flushNotices(id) // tutto ciò che è locale è su Drive: ora si può avvisare gli altri
    } catch (e) {
      const st = e instanceof drive.DriveError ? e.status : 0
      if (st === 409) { r.reconciled = false; r.status = 'pending'; this.schedule(id) } // il file è cambiato nel frattempo (scrittura dal ponte): si rilegge, si unisce e si riprova
      else if (st === 401) { this.setAuth('expired'); r.status = 'auth' }
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
  async addAthlete(input: {
    name: string
    focus: string
    email: string
    targetKind?: TargetKind
    members?: string[]
    schedule?: string
    color?: string
    icon?: string
    scheduleSlots?: ScheduleSlot[]
  }): Promise<Source> {
    const kind = input.targetKind ?? 'individual'
    const a = newAthlete(
      input.name.trim(),
      input.focus.trim(),
      input.email.trim().toLowerCase() || null,
      this.profileName || null,
      kind,
      input.members ?? [],
      input.schedule?.trim() ?? '',
      input.color,
      input.icon,
      input.scheduleSlots
    )
    const entry: RegistryEntry = {
      athleteId: a.id,
      name: a.name,
      focus: a.focus,
      email: a.email,
      fileId: null,
      addedAt: nowISO(),
      invitedAt: null,
      updatedAt: nowISO(),
      targetKind: kind,
      members: a.members,
      schedule: a.schedule,
      color: a.color,
      icon: a.icon,
      scheduleSlots: a.scheduleSlots,
    }
    this.registry = upsertEntry(this.registry, entry)
    const src: Source = { id: 'athlete:' + a.id, kind: 'coach-athlete', fileId: null, name: a.name }
    const r = this.ensureRT(src.id)
    r.db = newDb(a, this.by())
    r.dirty = true
    r.status = 'local'
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
  async inviteAthlete(athleteId: string): Promise<{ link: string; code: string; emailed: boolean; bridge: boolean }> {
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
    // il piano si registra sul ponte DOPO la condivisione (così l'atleta invitato risulta tra gli inviti); il codice funziona
    // anche senza email, se il ponte è attivo (serve l'accesso persistente del coach)
    await this.registerHouses(true, entry.fileId)
    const bridged = !!getSession() && !!LS.get(`houseReg:${entry.fileId}`)
    this.registry = upsertEntry(this.registry, { ...entry, invitedAt: nowISO() })
    this.touchRegistry()
    return { link, code: entry.fileId, emailed, bridge: bridged }
  }
  inviteInfo = (athleteId: string) => {
    const e = this.registry.athletes.find((x) => x.athleteId === athleteId)
    return e?.fileId ? { link: inviteLink(e.fileId), code: e.fileId } : null
  }

  // ---------- atleta: collegarsi al piano di un coach ----------
  /**
   * Collegamento al piano di un coach. Ordine: 1) accesso diretto al file; 2) ponte del Worker (nessun Picker, nessuna chiave API:
   * il file viene condiviso con questo account dal Worker, con l'accesso del coach); 3) Google Picker (serve una chiave API valida).
   * `picker: false` salta il passo 3 (per i tentativi automatici, che non hanno un tocco dell'utente).
   */
  async linkCoach(input: string, opts: { picker?: boolean } = {}): Promise<void> {
    const fileId = parseInviteCode(input)
    if (!fileId) throw new Error(t('Codice o link non valido'))
    const existing = this.linked.find((l) => l.fileId === fileId)
    if (existing) { this.role = 'athlete'; LS.set('role', 'athlete'); clearPendingJoin(); this.setActive(existing.id); return }
    if (!(await this.ensureToken())) throw new Error(t('Collega prima Google (Profilo → Sincronizzazione).'))
    const noAccess = (e: unknown) => e instanceof drive.DriveError && (e.status === 404 || e.status === 403)
    let meta: drive.FileMeta | null = null
    let why = ''
    // 1) accesso diretto
    try { meta = await drive.getMeta(fileId) } catch (e) { if (!noAccess(e)) throw e }
    // 2) ponte del Worker
    if (!meta && (await bridge.bridgeAvailable())) {
      try {
        await bridge.joinHouse(fileId, drive.getToken()!)
        drive.setBridged(fileId, true)
        meta = await drive.getMeta(fileId)
      } catch (e) {
        drive.setBridged(fileId, false)
        if (e instanceof WorkerError && e.status === 0) throw new Error(t('Nessuna connessione: riprova.'))
        if (e instanceof WorkerError && e.status === 404) why = t('Il piano non è ancora collegato al server: il coach deve riaprire l’app con l’accesso persistente e riprovare.')
        else if (e instanceof WorkerError && e.status === 403) why = e.message
        else if (e instanceof WorkerError || e instanceof drive.DriveError) why = e.message
        else throw e
      }
    }
    // 3) Google Picker
    if (!meta && opts.picker !== false && drive.pickerAvailable()) {
      const picked = await drive.pickSharedFile(fileId)
      if (!picked) throw new Error(t('Operazione annullata. Se il selettore mostrava «API key invalid», controlla la chiave API (vedi README).'))
      try { meta = await drive.getMeta(picked) } catch { throw new Error(t('Controlla il codice e che il coach ti abbia invitato con questo account Google.')) }
    }
    if (!meta) {
      throw new Error(why || (drive.pickerAvailable()
        ? t('Non riesco ad aprire il piano: controlla il codice e che il coach ti abbia invitato con questo account Google.')
        : t('Non riesco ad aprire il piano. Il coach deve inserire la tua email Google nell’invito (o servono il server e le chiavi del Picker: vedi README).')))
    }
    const db = parseDb(await drive.download(meta.id))
    const id = 'linked:' + meta.id
    this.linked = [...this.linked, { id, fileId: meta.id, name: db.athlete.name }]
    LS.set('linked', JSON.stringify(this.linked))
    const r = this.ensureRT(id)
    r.db = db; r.rev = meta.version; r.reconciled = true; r.dirty = false; r.status = 'synced'; r.lastSync = nowISO(); r.canEdit = meta.canEdit
    await this.persist(id)
    this.role = 'athlete'; LS.set('role', 'athlete')
    clearPendingJoin() // collegato: il codice non serve più (altrimenti Impostazioni si riaprirebbe a ogni avvio)
    this.invites = this.invites.filter((h) => h.id !== meta!.id)
    this.setActive(id)
    void this.syncPush()
  }

  // ---------- inviti ricevuti e ponte ----------
  /** Piani a cui questo account è stato invitato dal coach e non ancora collegati (da mostrare in Impostazioni). */
  invites: bridge.BridgeHouse[] = []
  private lastInviteCheck = 0
  inviteName = (h: bridge.BridgeHouse) => bridge.prettyPlanName(h.name)

  /** Atleta: cerca gli inviti sul ponte. Un solo invito e nessun piano collegato → collegamento automatico; altrimenti un avviso. */
  async checkInvites(force = false) {
    if (this.role !== 'athlete' || !workerUrl()) return
    if (!force && Date.now() - this.lastInviteCheck < 10 * 60_000) return
    const tok = drive.getToken()
    if (!tok || !(await bridge.bridgeAvailable())) return
    this.lastInviteCheck = Date.now()
    const houses = (await bridge.myHouses(tok)).filter((h) => !this.linked.some((l) => l.fileId === h.id))
    const changed = JSON.stringify(houses.map((h) => h.id)) !== JSON.stringify(this.invites.map((h) => h.id))
    this.invites = houses
    if (houses.length === 1 && this.linked.length === 0) {
      try { await this.linkCoach(houses[0].id, { picker: false }); this.notify(t('Collegato al piano di {name}', { name: bridge.prettyPlanName(houses[0].name) })); return } catch { /* resta tra gli inviti */ }
    }
    let seen: string[] = []
    try { seen = JSON.parse(LS.get('seenInvites') || '[]') as string[] } catch { seen = [] }
    const fresh = houses.filter((h) => !seen.includes(h.id))
    if (fresh.length) {
      LS.set('seenInvites', JSON.stringify([...seen, ...fresh.map((h) => h.id)].slice(-50)))
      for (const h of fresh) addNotification({ title: t('Invito dal tuo coach'), body: t('«{name}» ti ha invitato: apri Impostazioni → Collegati a un Coach.', { name: bridge.prettyPlanName(h.name) }), kind: 'info' })
    }
    if (changed) this.emit()
  }

  /** Coach: registra sul ponte i file dei suoi atleti (serve l'accesso persistente), così l'atleta entra con il codice o con l'email. Ripete ogni 3 giorni. */
  async registerHouses(force = false, only?: string) {
    const tok = drive.getToken()
    if (!getSession() || !tok || !workerUrl() || !this.registry.athletes.length || !(await bridge.bridgeAvailable())) return
    for (const e of this.registry.athletes) {
      if (!e.fileId || (only && e.fileId !== only)) continue
      const key = `houseReg:${e.fileId}`
      const last = Number(LS.get(key)) || 0
      if (!force && Date.now() - last < 3 * 86_400_000) continue
      if (await bridge.registerHouse(e.fileId, tok)) LS.set(key, String(Date.now()))
    }
  }
  /** Il ponte è utilizzabile da questo coach (server con ponte + accesso persistente)? Serve a far funzionare il codice senza email. */
  bridgeReady = () => !!this.workerHealth?.bridge && !!getSession()

  /** Dopo l'accesso: se c'era un codice d'invito in attesa, si prova a collegarsi da soli (senza Picker: non c'è un tocco dell'utente). */
  async autoJoinPending() {
    const code = pendingJoin()
    if (!code || this.role !== 'athlete') return
    const id = parseInviteCode(code)
    if (id && this.linked.some((l) => l.fileId === id)) { clearPendingJoin(); return }
    try { await this.linkCoach(code, { picker: false }); this.notify(t('Collegato con successo al piano del coach!')) }
    catch (e) { this.notify(errMsg(e), 'err') } // il codice resta salvato: si può riprovare da Impostazioni
  }

  unlinkCoach(id: string) {
    this.linked = this.linked.filter((l) => l.id !== id)
    LS.set('linked', JSON.stringify(this.linked))
    this.rt.delete(id); void idbDel('db:' + id)
    if (this.storedActive === id) { this.storedActive = null; LS.set('active', null) }
    this.emit()
  }

  // ---------- notifiche push ----------
  pushFileIds = () => this.allSources().filter((s) => (s.kind === 'coach-athlete' || s.kind === 'linked') && s.fileId).map((s) => s.fileId as string)

  /** Mette in coda un avviso per chi condivide il piano; parte dopo l'invio dei dati a Drive (anche se la modifica era offline). */
  announce(sourceId: string, ev: PlanEvent) {
    const s = this.allSources().find((x) => x.id === sourceId)
    const db = this.dbOf(sourceId)
    if (!s || !db || !workerUrl() || (s.kind !== 'coach-athlete' && s.kind !== 'linked')) return
    let n: Omit<Notice, 'at' | 'source'>
    if (ev.type === 'log') {
      if (s.kind !== 'linked') return
      const sess = ev.session
      const label = ev.status === 'done' ? t('Completato: {title}', { title: sess.title }) : ev.status === 'partial' ? t('Parziale: {title}', { title: sess.title }) : t('Saltato: {title}', { title: sess.title })
      const rpe = sess.feedback?.rpe
      n = { tag: `log:${sess.id}`, title: db.athlete.name, body: rpe && ev.status !== 'skipped' ? `${label} · RPE ${rpe}` : label }
    } else if (s.kind === 'coach-athlete') {
      n = { tag: `plan:${s.id}:${ev.title ?? 'bulk'}`, title: t('Piano aggiornato'), body: ev.title ? t('Il coach ha modificato «{title}»', { title: ev.title }) : t('Il coach ha aggiornato il piano di allenamento') }
    } else {
      n = { tag: `plan:${s.id}:${ev.title ?? 'bulk'}`, title: t('Piano modificato'), body: ev.title ? t('{name} ha modificato «{title}»', { name: db.athlete.name, title: ev.title }) : t('{name} ha aggiornato il piano', { name: db.athlete.name }) }
    }
    const now = Date.now()
    this.pushQ = [...this.pushQ.filter((x) => x.tag !== n.tag && now - x.at < 86_400_000), { ...n, source: sourceId, at: now }].slice(-100)
    void idbSet('pushq', this.pushQ)
  }

  private async flushNotices(sourceId: string) {
    const mine = this.pushQ.filter((n) => n.source === sourceId)
    const s = this.allSources().find((x) => x.id === sourceId)
    if (!mine.length || !s?.fileId || !drive.getToken()) return
    const done = new Set<string>()
    for (const n of mine) {
      try { await push.sendNotify(drive.getToken()!, { fileId: s.fileId, title: n.title, body: n.body, tag: n.tag }); done.add(n.tag) }
      catch (e) { if (e instanceof Error && 'status' in e && (e as { status: number }).status >= 400 && (e as { status: number }).status < 500) done.add(n.tag) } // rifiutata: inutile riprovare; errori di rete: si riprova al ciclo dopo
    }
    if (done.size) { this.pushQ = this.pushQ.filter((n) => !(n.source === sourceId && done.has(n.tag))); await idbSet('pushq', this.pushQ) }
  }

  pushOn = () => push.pushWanted() && push.permission() === 'granted'
  async setPush(on: boolean): Promise<string | null> {
    try {
      if (!(await this.ensureToken())) return t('Collega prima Google.')
      const tok = drive.getToken()!
      if (on) await push.enablePush(tok, this.pushFileIds())
      else await push.disablePush(tok)
      this.emit()
      return null
    } catch (e) { this.emit(); return e instanceof Error ? e.message : String(e) }
  }
  async testPush(): Promise<string> {
    if (!(await this.ensureToken())) return t('Collega prima Google.')
    return push.testPush(drive.getToken()!)
  }
  private async syncPush() {
    const tok = drive.getToken()
    if (tok && workerUrl()) await push.syncPushFiles(tok, this.pushFileIds()).catch(() => undefined)
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

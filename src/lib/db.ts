import type {
  AthleteProfile, CoachRegistry, DbMeta, RegistryEntry, ScheduleSlot, SessionStatus, TargetKind, TrainingPlanDatabase,
  UserRole, WorkoutBlock, WorkoutFeedback, WorkoutSession,
} from '../types'
import { T } from '../i18n'
import { uid } from './ids'
import { nowISO } from './dates'

export const SCHEMA_VERSION = 1
export const REGISTRY_VERSION = 1

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
const opt = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export const PHASES_LIST = ['warmup', 'main', 'cooldown'] as const
export const DISCIPLINES_LIST = [
  'strength', 'power_plyo', 'agility_footwork', 'tennis_conditioning', 'mobility_prehab', 'ergo', 'recovery', 'other',
  'run_quality', 'run_long', 'hyrox',
] as const
const STATUSES: SessionStatus[] = ['planned', 'done', 'partial', 'skipped']
const FEELS = ['great', 'good', 'ok', 'tired', 'bad']

// ---------- creazione ----------
export const newAthlete = (
  name: string,
  focus = '',
  email: string | null = null,
  coachName: string | null = null,
  targetKind: TargetKind = 'individual',
  members: string[] = [],
  schedule = '',
  color?: string,
  icon?: string,
  scheduleSlots?: ScheduleSlot[]
): AthleteProfile => ({
  id: uid('a-'),
  name,
  focus,
  email,
  athleteCanEdit: false,
  coachName,
  updatedAt: nowISO(),
  targetKind,
  members: members.length ? members : undefined,
  schedule: schedule.trim() || undefined,
  color: color?.trim() || undefined,
  icon: icon?.trim() || undefined,
  scheduleSlots: scheduleSlots && scheduleSlots.length ? scheduleSlots : undefined,
})

export const newDb = (athlete: AthleteProfile, by = ''): TrainingPlanDatabase => {
  const now = nowISO()
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { dbId: uid('db-'), createdAt: now, updatedAt: now, updatedBy: by, revision: 0 },
    athlete,
    sessions: [],
    deleted: {},
  }
}

/**
 * Copia vuota di un piano che esiste già altrove (altro dispositivo, file su Drive): datata al 2000, così nel merge
 * vince sempre il contenuto remoto e non lo si sovrascrive con un profilo vuoto (colore, icona, orari, allievi…).
 */
export const EPOCH = '2000-01-01T00:00:00.000Z'
export const placeholderDb = (athlete: AthleteProfile, by = ''): TrainingPlanDatabase => {
  const db = newDb({ ...athlete, updatedAt: EPOCH }, by)
  return { ...db, meta: { ...db.meta, createdAt: EPOCH, updatedAt: EPOCH } }
}

// ---------- normalizzazione ----------
export const parseBlock = (raw: unknown): WorkoutBlock | null => {
  if (!isObj(raw)) return null
  const phase = (PHASES_LIST as readonly string[]).includes(raw.phase as string) ? (raw.phase as WorkoutBlock['phase']) : 'main'
  return {
    id: str(raw.id) || uid('b-'),
    phase,
    title: str(raw.title),
    sets: opt(raw.sets), reps: opt(raw.reps), distance: opt(raw.distance), duration: opt(raw.duration),
    pace: opt(raw.pace), zone: opt(raw.zone), load: opt(raw.load), rest: opt(raw.rest), notes: opt(raw.notes),
    equipment: opt(raw.equipment),
  }
}

export const parseFeedback = (raw: unknown): WorkoutFeedback | null => {
  if (!isObj(raw)) return null
  const rpe = num(raw.rpe)
  return {
    durationMin: num(raw.durationMin), distanceKm: num(raw.distanceKm), avgPace: opt(raw.avgPace),
    rpe: rpe === undefined ? undefined : Math.min(10, Math.max(1, Math.round(rpe))),
    feel: FEELS.includes(raw.feel as string) ? (raw.feel as WorkoutFeedback['feel']) : undefined,
    comment: opt(raw.comment),
    loggedAt: str(raw.loggedAt) || nowISO(),
  }
}

export const parseSession = (raw: unknown): WorkoutSession | null => {
  if (!isObj(raw) || !/^\d{4}-\d{2}-\d{2}$/.test(str(raw.date))) return null
  const base = str(raw.updatedAt) || nowISO()
  const blocks = Array.isArray(raw.blocks) ? raw.blocks.map(parseBlock).filter((b): b is WorkoutBlock => !!b) : []
  const attendance = Array.isArray(raw.attendance) ? raw.attendance.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : undefined
  return {
    id: str(raw.id) || uid('s-'),
    date: str(raw.date),
    title: str(raw.title, 'Allenamento'),
    discipline: (DISCIPLINES_LIST as readonly string[]).includes(raw.discipline as string) ? (raw.discipline as WorkoutSession['discipline']) : 'strength',
    blocks,
    coachNotes: str(raw.coachNotes),
    createdBy: raw.createdBy === 'athlete' ? 'athlete' : 'coach',
    planUpdatedAt: str(raw.planUpdatedAt) || base,
    status: STATUSES.includes(raw.status as SessionStatus) ? (raw.status as SessionStatus) : 'planned',
    feedback: parseFeedback(raw.feedback),
    logUpdatedAt: str(raw.logUpdatedAt) || base,
    updatedAt: base,
    ...(attendance && attendance.length > 0 ? { attendance } : {}),
  }
}

const parseDeleted = (raw: unknown): Record<string, string> => {
  const out: Record<string, string> = {}
  if (isObj(raw)) for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v
  return out
}

export const parseScheduleSlot = (raw: unknown): ScheduleSlot | null => {
  if (!isObj(raw)) return null
  const day = str(raw.day)
  if (!day) return null
  return {
    id: str(raw.id) || uid('slot-'),
    day,
    startTime: str(raw.startTime),
    endTime: str(raw.endTime),
  }
}

export const parseAthlete = (raw: unknown): AthleteProfile => {
  const r = isObj(raw) ? raw : {}
  const members = Array.isArray(r.members) ? r.members.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : undefined
  const rawSlots = Array.isArray(r.scheduleSlots)
    ? r.scheduleSlots.map(parseScheduleSlot).filter((s): s is ScheduleSlot => !!s)
    : undefined
  return {
    id: str(r.id) || uid('a-'),
    name: str(r.name, 'Atleta'),
    focus: str(r.focus),
    email: typeof r.email === 'string' && r.email ? r.email.toLowerCase() : null,
    athleteCanEdit: r.athleteCanEdit === true,
    coachName: typeof r.coachName === 'string' && r.coachName ? r.coachName : null,
    updatedAt: str(r.updatedAt) || nowISO(),
    targetKind: r.targetKind === 'group' ? 'group' : 'individual',
    ...(members && members.length > 0 ? { members } : {}),
    schedule: opt(r.schedule),
    color: opt(r.color),
    icon: opt(r.icon),
    ...(rawSlots && rawSlots.length > 0 ? { scheduleSlots: rawSlots } : {}),
  }
}

/** Legge un file JSON di Drive: valori mancanti → predefiniti; file più recenti dell'app → errore. */
export const parseDb = (raw: unknown): TrainingPlanDatabase => {
  if (!isObj(raw)) throw new Error(T('File non valido'))
  const v = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1
  if (v > SCHEMA_VERSION) throw new Error(T('Il file è stato creato da una versione più recente dell’app: aggiorna l’app.'))
  const m = isObj(raw.meta) ? raw.meta : {}
  const now = nowISO()
  const meta: DbMeta = {
    dbId: str(m.dbId) || uid('db-'), createdAt: str(m.createdAt) || now, updatedAt: str(m.updatedAt) || now,
    updatedBy: str(m.updatedBy), revision: num(m.revision) ?? 0,
  }
  const sessions = (Array.isArray(raw.sessions) ? raw.sessions : []).map(parseSession).filter((s): s is WorkoutSession => !!s)
  return { schemaVersion: SCHEMA_VERSION, meta, athlete: parseAthlete(raw.athlete), sessions, deleted: parseDeleted(raw.deleted) }
}

export const parseRegistry = (raw: unknown): CoachRegistry => {
  const r = isObj(raw) ? raw : {}
  const athletes: RegistryEntry[] = (Array.isArray(r.athletes) ? r.athletes : []).flatMap((a): RegistryEntry[] => {
    if (!isObj(a) || !str(a.athleteId)) return []
    const members = Array.isArray(a.members) ? a.members.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : undefined
    const rawSlots = Array.isArray(a.scheduleSlots)
      ? a.scheduleSlots.map(parseScheduleSlot).filter((s): s is ScheduleSlot => !!s)
      : undefined
    return [{
      athleteId: str(a.athleteId), name: str(a.name, 'Atleta'), focus: str(a.focus),
      email: typeof a.email === 'string' && a.email ? a.email.toLowerCase() : null,
      fileId: typeof a.fileId === 'string' && a.fileId ? a.fileId : null,
      addedAt: str(a.addedAt) || nowISO(), invitedAt: typeof a.invitedAt === 'string' ? a.invitedAt : null,
      updatedAt: str(a.updatedAt) || nowISO(),
      targetKind: a.targetKind === 'group' ? 'group' : 'individual',
      ...(members && members.length > 0 ? { members } : {}),
      schedule: opt(a.schedule),
      color: opt(a.color),
      icon: opt(a.icon),
      ...(rawSlots && rawSlots.length > 0 ? { scheduleSlots: rawSlots } : {}),
    }]
  })
  return { schemaVersion: REGISTRY_VERSION, coachName: str(r.coachName), athletes, deleted: parseDeleted(r.deleted), updatedAt: str(r.updatedAt) || nowISO() }
}

// ---------- unione (merge) ----------
const newerOrEqual = (a: string, b: string) => a >= b

export const mergeSession = (a: WorkoutSession, b: WorkoutSession): WorkoutSession => {
  const plan = newerOrEqual(a.planUpdatedAt, b.planUpdatedAt) ? a : b
  const log = newerOrEqual(a.logUpdatedAt, b.logUpdatedAt) ? a : b
  return {
    ...plan,
    status: log.status, feedback: log.feedback, logUpdatedAt: log.logUpdatedAt,
    attendance: newerOrEqual(a.planUpdatedAt, b.planUpdatedAt) ? (a.attendance ?? b.attendance) : (b.attendance ?? a.attendance),
    updatedAt: a.updatedAt > b.updatedAt ? a.updatedAt : b.updatedAt,
  }
}

function mergeById<T extends { updatedAt: string }>(a: T[], b: T[], key: (x: T) => string, merge: (x: T, y: T) => T): T[] {
  const map = new Map<string, T>()
  for (const x of a) map.set(key(x), x)
  for (const y of b) {
    const x = map.get(key(y))
    map.set(key(y), x ? merge(x, y) : y)
  }
  return [...map.values()]
}

const mergeDeleted = (a: Record<string, string>, b: Record<string, string>) => {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) if (!out[k] || v > out[k]) out[k] = v
  return out
}

/** Unisce due copie dello stesso piano: per record, "vince il più recente"; le cancellazioni sono lapidi. Non cancella mai per assenza. */
export const mergeDb = (local: TrainingPlanDatabase, remote: TrainingPlanDatabase): TrainingPlanDatabase => {
  const deleted = mergeDeleted(local.deleted, remote.deleted)
  const sessions = mergeById(local.sessions, remote.sessions, (s) => s.id, mergeSession).filter((s) => !deleted[s.id] || s.updatedAt > deleted[s.id])
  for (const s of sessions) if (deleted[s.id] && s.updatedAt > deleted[s.id]) delete deleted[s.id]
  const metaNew = local.meta.updatedAt >= remote.meta.updatedAt ? local.meta : remote.meta
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { ...metaNew, revision: Math.max(local.meta.revision, remote.meta.revision) },
    athlete: local.athlete.updatedAt >= remote.athlete.updatedAt ? local.athlete : remote.athlete,
    sessions: sessions.sort((x, y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id)),
    deleted,
  }
}

export const mergeRegistry = (local: CoachRegistry, remote: CoachRegistry): CoachRegistry => {
  const deleted = mergeDeleted(local.deleted, remote.deleted)
  const athletes = mergeById(local.athletes, remote.athletes, (x) => x.athleteId, (x, y) => (x.updatedAt >= y.updatedAt ? x : y))
    .filter((x) => !deleted[x.athleteId] || x.updatedAt > deleted[x.athleteId])
  return {
    schemaVersion: REGISTRY_VERSION,
    coachName: local.updatedAt >= remote.updatedAt ? local.coachName : remote.coachName,
    athletes, deleted, updatedAt: local.updatedAt > remote.updatedAt ? local.updatedAt : remote.updatedAt,
  }
}

/** Due copie equivalenti (dopo il merge) → non serve inviare. */
export const sameContent = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// ---------- mutazioni pure Db → Db ----------
const touch = (db: TrainingPlanDatabase, by: string): TrainingPlanDatabase['meta'] => ({ ...db.meta, updatedAt: nowISO(), updatedBy: by, revision: db.meta.revision + 1 })

export const upsertSession = (db: TrainingPlanDatabase, s: WorkoutSession, by: string): TrainingPlanDatabase => {
  const now = nowISO()
  const next = { ...s, planUpdatedAt: now, updatedAt: now }
  const deleted = { ...db.deleted }
  delete deleted[s.id]
  const exists = db.sessions.some((x) => x.id === s.id)
  const sessions = exists ? db.sessions.map((x) => (x.id === s.id ? next : x)) : [...db.sessions, next]
  return { ...db, meta: touch(db, by), sessions, deleted }
}

export const removeSession = (db: TrainingPlanDatabase, id: string, by: string): TrainingPlanDatabase => ({
  ...db, meta: touch(db, by), sessions: db.sessions.filter((s) => s.id !== id), deleted: { ...db.deleted, [id]: nowISO() },
})

export const setLog = (db: TrainingPlanDatabase, id: string, status: SessionStatus, feedback: WorkoutFeedback | null, by: string): TrainingPlanDatabase => {
  const now = nowISO()
  return {
    ...db, meta: touch(db, by),
    sessions: db.sessions.map((s) => (s.id === id ? { ...s, status, feedback: feedback ? { ...feedback, loggedAt: now } : null, logUpdatedAt: now, updatedAt: now } : s)),
  }
}

export const setAttendance = (db: TrainingPlanDatabase, id: string, attendance: string[], by: string): TrainingPlanDatabase => {
  const now = nowISO()
  return {
    ...db, meta: touch(db, by),
    sessions: db.sessions.map((s) => (s.id === id ? { ...s, attendance, planUpdatedAt: now, updatedAt: now } : s)),
  }
}

export const updateAthlete = (db: TrainingPlanDatabase, patch: Partial<AthleteProfile>, by: string): TrainingPlanDatabase => ({
  ...db, meta: touch(db, by), athlete: { ...db.athlete, ...patch, updatedAt: nowISO() },
})

export const addSessions = (db: TrainingPlanDatabase, list: WorkoutSession[], by: string): TrainingPlanDatabase => {
  let out = db
  for (const s of list) out = upsertSession(out, s, by)
  return out
}

export const blankSession = (date: string, createdBy: UserRole): WorkoutSession => {
  const now = nowISO()
  return {
    id: uid('s-'), date, title: '', discipline: 'strength', blocks: [], coachNotes: '', createdBy,
    planUpdatedAt: now, status: 'planned', feedback: null, logUpdatedAt: now, updatedAt: now,
  }
}

export const duplicateSession = (s: WorkoutSession, date: string): WorkoutSession => {
  const now = nowISO()
  return {
    ...s, id: uid('s-'), date, status: 'planned', feedback: null,
    blocks: s.blocks.map((b) => ({ ...b, id: uid('b-') })), planUpdatedAt: now, logUpdatedAt: now, updatedAt: now,
  }
}

// ---------- registro del coach ----------
export const upsertEntry = (r: CoachRegistry, e: RegistryEntry): CoachRegistry => {
  const entry = { ...e, updatedAt: nowISO() }
  const deleted = { ...r.deleted }
  delete deleted[e.athleteId]
  const exists = r.athletes.some((x) => x.athleteId === e.athleteId)
  return { ...r, athletes: exists ? r.athletes.map((x) => (x.athleteId === e.athleteId ? entry : x)) : [...r.athletes, entry], deleted, updatedAt: nowISO() }
}
export const removeEntry = (r: CoachRegistry, id: string): CoachRegistry => ({
  ...r, athletes: r.athletes.filter((x) => x.athleteId !== id), deleted: { ...r.deleted, [id]: nowISO() }, updatedAt: nowISO(),
})
export const emptyRegistry = (): CoachRegistry => ({ schemaVersion: REGISTRY_VERSION, coachName: '', athletes: [], deleted: {}, updatedAt: nowISO() })

// ---------- statistiche ----------
export const sessionsOn = (db: TrainingPlanDatabase, date: string) => db.sessions.filter((s) => s.date === date)
export const inRange = (db: TrainingPlanDatabase, from: string, to: string) => db.sessions.filter((s) => s.date >= from && s.date <= to)

export interface PeriodStats { planned: number; done: number; partial: number; skipped: number; minutes: number; km: number; avgRpe: number | null }

export const periodStats = (sessions: WorkoutSession[]): PeriodStats => {
  const st: PeriodStats = { planned: sessions.length, done: 0, partial: 0, skipped: 0, minutes: 0, km: 0, avgRpe: null }
  let rpeSum = 0, rpeN = 0
  for (const s of sessions) {
    if (s.status === 'done') st.done++
    else if (s.status === 'partial') st.partial++
    else if (s.status === 'skipped') st.skipped++
    if (s.status === 'done' || s.status === 'partial') {
      st.minutes += s.feedback?.durationMin ?? 0
      st.km += s.feedback?.distanceKm ?? 0
      if (s.feedback?.rpe) { rpeSum += s.feedback.rpe; rpeN++ }
    }
  }
  st.avgRpe = rpeN ? rpeSum / rpeN : null
  return st
}

export const lastCompleted = (db: TrainingPlanDatabase): WorkoutSession | null =>
  db.sessions.filter((s) => s.status === 'done' || s.status === 'partial').sort((a, b) => b.date.localeCompare(a.date))[0] ?? null

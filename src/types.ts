export type UserRole = 'athlete' | 'coach'

export type Discipline = 'run_quality' | 'run_long' | 'hyrox' | 'strength' | 'ergo' | 'other' | 'recovery'
export type Phase = 'warmup' | 'main' | 'cooldown'
export type SessionStatus = 'planned' | 'done' | 'partial' | 'skipped'
export type Feel = 'great' | 'good' | 'ok' | 'tired' | 'bad'

/** Un blocco dell'allenamento: tutti i campi di dettaglio sono facoltativi e testuali (flessibili). */
export interface WorkoutBlock {
  id: string
  phase: Phase
  title: string
  sets?: string // serie
  reps?: string // ripetizioni
  distance?: string // es. "1 km", "400 m"
  duration?: string // es. "20'"
  pace?: string // es. "4:50 /km"
  zone?: string // es. "Z2"
  load?: string // es. "24 kg", "180 W"
  rest?: string // es. "90''"
  notes?: string
}

export interface WorkoutFeedback {
  durationMin?: number
  distanceKm?: number
  avgPace?: string
  rpe?: number // 1-10
  feel?: Feel
  comment?: string
  loggedAt: string
}

export interface WorkoutSession {
  id: string
  date: string // YYYY-MM-DD (data locale)
  title: string
  discipline: Discipline
  blocks: WorkoutBlock[]
  coachNotes: string
  createdBy: UserRole
  // parte "piano" (coach/autore) e parte "log" (atleta) hanno marche temporali separate:
  // se coach e atleta lavorano insieme sulla stessa sessione non si perdono a vicenda.
  planUpdatedAt: string
  status: SessionStatus
  feedback: WorkoutFeedback | null
  logUpdatedAt: string
  updatedAt: string
}

export interface AthleteProfile {
  id: string
  name: string
  focus: string // disciplina/obiettivo, es. "Hyrox · Mezza maratona"
  email: string | null
  athleteCanEdit: boolean // l'atleta può creare/modificare allenamenti nel file del coach
  coachName: string | null
  updatedAt: string
}

export interface DbMeta {
  dbId: string
  createdAt: string
  updatedAt: string
  updatedBy: string
  revision: number
}

export interface TrainingPlanDatabase {
  schemaVersion: number
  meta: DbMeta
  athlete: AthleteProfile
  sessions: WorkoutSession[]
  deleted: Record<string, string> // lapidi: id → data di eliminazione
}

export interface RegistryEntry {
  athleteId: string
  name: string
  focus: string
  email: string | null
  fileId: string | null // null = solo locale (Google non collegato)
  addedAt: string
  invitedAt: string | null
  updatedAt: string
}

export interface CoachRegistry {
  schemaVersion: number
  coachName: string
  athletes: RegistryEntry[]
  deleted: Record<string, string>
  updatedAt: string
}

export type SourceKind = 'personal' | 'coach-athlete' | 'linked' | 'demo'

/** Un "piano" attivo: un file JSON (su Drive o solo locale). */
export interface Source {
  id: string // chiave della cache locale
  kind: SourceKind
  fileId: string | null
  name: string
}

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'pending' | 'offline' | 'auth' | 'error'

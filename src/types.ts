export type UserRole = 'athlete' | 'coach'

export type TargetKind = 'individual' | 'group'

export type Discipline =
  | 'strength'
  | 'power_plyo'
  | 'agility_footwork'
  | 'tennis_conditioning'
  | 'mobility_prehab'
  | 'ergo'
  | 'recovery'
  | 'other'
  | 'run_quality'
  | 'run_long'
  | 'hyrox'

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
  load?: string // es. "Manubri 12 kg", "Bilanciere 40 kg", "Trap Bar 65 kg"
  rest?: string // es. "90''"
  notes?: string
  equipment?: string // attrezzo principale consigliato
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
  // Registro presenze per gruppi scuola tennis:
  attendance?: string[]
}

export interface ScheduleSlot {
  id: string
  day: string // es. "Lunedì", "Martedì", oppure data "YYYY-MM-DD"
  startTime: string // "15:30"
  endTime: string // "17:00"
}

export interface AthleteProfile {
  id: string
  name: string
  focus: string // disciplina/obiettivo, es. "Agonistica U16" o "Pro ATP"
  email: string | null
  athleteCanEdit: boolean // l'atleta può creare/modificare allenamenti nel file del coach
  coachName: string | null
  updatedAt: string
  targetKind?: TargetKind // 'individual' (professionista) o 'group' (gruppo scuola tennis)
  members?: string[] // componenti del gruppo scuola tennis
  schedule?: string // giorni e orari in palestra (es. "Lun - Mer - Ven 15:30 - 17:00")
  color?: string // id colore tema (es. 'blue', 'yellow', 'emerald', ecc.)
  icon?: string // id icona (es. 'users', 'trophy', 'flame', ecc.)
  scheduleSlots?: ScheduleSlot[] // slot strutturati giorno/orario
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
  /** condivisione annullata dal coach (atleta singolo): il codice non è attivo finché non si invita di nuovo */
  shareClosed?: boolean
  athleteId: string
  name: string
  focus: string
  email: string | null
  fileId: string | null // null = solo locale (Google non collegato)
  addedAt: string
  invitedAt: string | null
  updatedAt: string
  targetKind?: TargetKind
  members?: string[]
  schedule?: string
  color?: string
  icon?: string
  scheduleSlots?: ScheduleSlot[]
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

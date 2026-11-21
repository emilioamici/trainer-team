import { useCallback, useState, type ReactNode } from 'react'
import { t } from '../i18n'
import { blankSession, duplicateSession, removeSession, setLog, upsertSession } from '../lib/db'
import { addDays } from '../lib/dates'
import type { Source, TrainingPlanDatabase, UserRole, WorkoutSession } from '../types'
import { useEngine } from '../state/store'
import { FeedbackSheet, WorkoutDetail, WorkoutEditor } from './Workout'

/** Gestisce dettaglio / editor / feedback di una sessione del piano attivo. */
export function useWorkoutSheets(src: Source | null, db: TrainingPlanDatabase | null, canEdit: boolean, canLog: boolean): {
  node: ReactNode; openDetail: (s: WorkoutSession) => void; openNew: (date: string) => void; openFeedback: (s: WorkoutSession) => void
} {
  const e = useEngine()
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editing, setEditing] = useState<WorkoutSession | null>(null)
  const [fbId, setFbId] = useState<string | null>(null)
  const by: UserRole = src?.kind === 'linked' ? 'athlete' : e.role

  const live = (id: string | null) => (id && db ? db.sessions.find((s) => s.id === id) ?? null : null)
  const detail = live(detailId)
  const fb = live(fbId)
  const suggestions = [...new Set((db?.sessions ?? []).map((s) => s.title).filter(Boolean))]

  const openNew = useCallback((date: string) => setEditing(blankSession(date, by)), [by])

  return {
    openDetail: (s) => setDetailId(s.id),
    openNew,
    openFeedback: (s) => setFbId(s.id),
    node: (
      <>
        <WorkoutDetail s={detail} onClose={() => setDetailId(null)} canEdit={canEdit} canLog={canLog}
          onEdit={(s) => { setDetailId(null); setEditing(s) }}
          onFeedback={(s) => { setDetailId(null); setFbId(s.id) }}
          onDuplicate={(s) => { if (src) { e.mutate(src.id, (d) => upsertSession(d, duplicateSession(s, addDays(s.date, 7)), e.by())); e.announce(src.id, { type: 'plan', title: s.title }); e.notify(t('Duplicato alla settimana successiva')) } setDetailId(null) }}
          onDelete={(s) => { if (src) { e.mutate(src.id, (d) => removeSession(d, s.id, e.by())); e.announce(src.id, { type: 'plan' }) } setDetailId(null) }} />
        <WorkoutEditor open={!!editing} initial={editing} onClose={() => setEditing(null)} suggestions={suggestions}
          onSave={(s) => { if (src) { e.mutate(src.id, (d) => upsertSession(d, s, e.by())); e.announce(src.id, { type: 'plan', title: s.title }); e.notify(t('Allenamento salvato')) } }} />
        <FeedbackSheet s={fb} onClose={() => setFbId(null)}
          onSave={(status, f) => { if (src && fb) { e.mutate(src.id, (d) => setLog(d, fb.id, status, f, e.by())); e.announce(src.id, { type: 'log', session: { ...fb, feedback: f }, status }); e.notify(t('Feedback salvato: il coach lo vedrà alla prossima sincronizzazione')) } }} />
      </>
    ),
  }
}

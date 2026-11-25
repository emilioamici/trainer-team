import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { t } from '../i18n'
import { blankSession, duplicateSession, removeSession, setAttendance, setLog, upsertSession } from '../lib/db'
import { addDays } from '../lib/dates'
import type { Source, TrainingPlanDatabase, UserRole, WorkoutSession } from '../types'
import { useEngine } from '../state/store'
import { visibleMembers } from './common'
import { FeedbackSheet, WorkoutDetail, WorkoutEditor } from './Workout'
import { QuickTimer, WorkoutTimer } from './WorkoutTimer'
import { buildSteps } from '../lib/timer'

/** Gestisce dettaglio / editor / feedback di una sessione del piano attivo. */
export function useWorkoutSheets(src: Source | null, db: TrainingPlanDatabase | null, canEdit: boolean, canLog: boolean): {
  node: ReactNode; openDetail: (s: WorkoutSession) => void; openNew: (date: string) => void; openFeedback: (s: WorkoutSession) => void
  openTimer: (s: WorkoutSession, blockIds?: string[]) => void; openQuickTimer: () => void
} {
  const e = useEngine()
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editing, setEditing] = useState<WorkoutSession | null>(null)
  const [fbId, setFbId] = useState<string | null>(null)
  const [timerId, setTimerId] = useState<string | null>(null)
  const [timerBlocks, setTimerBlocks] = useState<string[] | null>(null) // null = tutto l'allenamento
  const [quick, setQuick] = useState(false)
  const [fbMin, setFbMin] = useState<number | undefined>(undefined)
  const by: UserRole = src?.kind === 'linked' ? 'athlete' : e.role

  const live = (id: string | null) => (id && db ? db.sessions.find((s) => s.id === id) ?? null : null)
  const detail = live(detailId)
  const fb = live(fbId)
  const timerS = live(timerId)
  const timerSteps = useMemo(() => (timerS ? buildSteps(timerBlocks ? timerS.blocks.filter((b) => timerBlocks.includes(b.id)) : timerS.blocks) : []), [timerS?.id, timerS?.blocks, timerBlocks]) // eslint-disable-line react-hooks/exhaustive-deps
  const suggestions = [...new Set((db?.sessions ?? []).map((s) => s.title).filter(Boolean))]
  const groupMembers = visibleMembers(src, db)

  const openNew = useCallback((date: string) => setEditing(blankSession(date, by)), [by])

  return {
    openDetail: (s) => setDetailId(s.id),
    openNew,
    openFeedback: (s) => { setFbMin(undefined); setFbId(s.id) },
    openTimer: (s, ids) => { setTimerBlocks(ids ?? null); setTimerId(s.id) },
    openQuickTimer: () => setQuick(true),
    node: (
      <>
        <WorkoutDetail
          s={detail}
          onClose={() => setDetailId(null)}
          canEdit={canEdit}
          canLog={canLog}
          groupMembers={groupMembers}
          onAttendanceChange={(attendance) => {
            if (src && detail) {
              e.mutate(src.id, (d) => setAttendance(d, detail.id, attendance, e.by()))
            }
          }}
          onEdit={(s) => { setDetailId(null); setEditing(s) }}
          onFeedback={(s) => { setDetailId(null); setFbMin(undefined); setFbId(s.id) }}
          onStartTimer={canLog || canEdit ? (s, ids) => { setDetailId(null); setTimerBlocks(ids ?? null); setTimerId(s.id) } : undefined}
          onDuplicate={(s) => { if (src) { e.mutate(src.id, (d) => upsertSession(d, duplicateSession(s, addDays(s.date, 7)), e.by())); e.announce(src.id, { type: 'plan', title: s.title }); e.notify(t('Duplicato alla settimana successiva')) } setDetailId(null) }}
          onDelete={(s) => { if (src) { e.mutate(src.id, (d) => removeSession(d, s.id, e.by())); e.announce(src.id, { type: 'plan' }) } setDetailId(null) }}
        />
        <WorkoutEditor
          open={!!editing}
          initial={editing}
          onClose={() => setEditing(null)}
          suggestions={suggestions}
          groupMembers={groupMembers}
          onSave={(s) => { if (src) { e.mutate(src.id, (d) => upsertSession(d, s, e.by())); e.announce(src.id, { type: 'plan', title: s.title }); e.notify(t('Allenamento salvato')) } }}
        />
        <FeedbackSheet s={fb} defaultDurationMin={fbMin} onClose={() => setFbId(null)}
          onSave={(status, f) => { if (src && fb) { e.mutate(src.id, (d) => setLog(d, fb.id, status, f, e.by())); e.announce(src.id, { type: 'log', session: { ...fb, feedback: f }, status }); e.notify(t('Feedback salvato: il coach lo vedrà alla prossima sincronizzazione')) } }} />
        <WorkoutTimer
          open={!!timerS}
          title={timerBlocks && timerS ? timerS.blocks.filter((b) => timerBlocks.includes(b.id)).map((b) => b.title).filter(Boolean).join(' + ') || t('Timer') : timerS?.title || t('Allenamento')}
          steps={timerSteps}
          onClose={() => setTimerId(null)}
          onFinish={canLog && timerS && !timerBlocks ? (min) => { setTimerId(null); setFbMin(min); setFbId(timerS.id) } : undefined}
        />
        <QuickTimer open={quick} onClose={() => setQuick(false)} />
      </>
    ),
  }
}

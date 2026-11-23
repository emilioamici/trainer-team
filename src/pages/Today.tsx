import { CalendarOff, Check, Plus } from 'lucide-react'
import { t } from '../i18n'
import { SourcePicker, useActive } from '../components/common'
import { AttendanceBox, BlockList, FeedbackSummary } from '../components/Workout'
import { useWorkoutSheets } from '../components/WorkoutSheets'
import { Badge, EmptyState, PageHeader } from '../components/ui'
import { DISCIPLINES, STATUS_BADGE, STATUS_LABEL } from '../lib/disciplines'
import { addDays, fmtDay, fmtLong, todayISO, weekDays, weekStart } from '../lib/dates'
import { setAttendance } from '../lib/db'
import type { WorkoutSession } from '../types'

export default function Today({ onGoPlan }: { onGoPlan: (date?: string) => void }) {
  const { e, src, db, canEdit, canLog, role } = useActive()
  const sheets = useWorkoutSheets(src, db, canEdit, canLog)
  const today = todayISO()
  if (!src || !db) return <PageHeader title={t('Oggi')} />

  const list = db.sessions.filter((s) => s.date === today)
  const upcoming = db.sessions.filter((s) => s.date > today && s.status === 'planned').sort((a, b) => a.date.localeCompare(b.date))[0]
  const week = weekDays(weekStart(today))
  const isCoachView = role === 'coach' && src.kind !== 'personal'
  const groupMembers = db.athlete.members ?? []

  const Card = ({ s }: { s: WorkoutSession }) => {
    const d = DISCIPLINES[s.discipline]
    const Icon = d.icon
    const body = (
      <article className="card space-y-4 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Badge className={d.badge}><Icon size={12} />{t(d.label)}</Badge>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight">{s.title || t('Senza titolo')}</h2>
          </div>
          {s.status !== 'planned' && <Badge className={STATUS_BADGE[s.status]}>{t(STATUS_LABEL[s.status])}</Badge>}
        </div>
        {groupMembers.length > 0 && (
          <AttendanceBox
            members={groupMembers}
            attendance={s.attendance ?? []}
            canEdit={canEdit}
            onChange={(attendance) => {
              e.mutate(src.id, (d) => setAttendance(d, s.id, attendance, e.by()))
            }}
          />
        )}
        {s.coachNotes && <p className="rounded-2xl bg-brand/10 p-3 text-sm"><span className="font-semibold text-brand">{t('Note del coach')}: </span>{s.coachNotes}</p>}
        <BlockList blocks={s.blocks} />
        <FeedbackSummary fb={s.feedback} status={s.status} />
        <div className="flex gap-2">
          {canLog && <button className={`btn flex-1 !py-3 ${s.status === 'planned' ? 'btn-primary' : 'btn-soft'}`} onClick={() => sheets.openFeedback(s)}><Check size={18} />{s.status === 'planned' ? t('Completa & inserisci feedback') : t('Modifica feedback')}</button>}
          {canEdit && <button className="btn btn-soft" onClick={() => sheets.openDetail(s)}>{t('Dettagli')}</button>}
        </div>
      </article>
    )
    return body
  }

  return (
    <div>
      <PageHeader title={t('Oggi')} sub={isCoachView ? `${db.athlete.name} · ${fmtLong(today)}` : fmtLong(today)} />
      <SourcePicker />

      <div className="space-y-3">
        {list.length ? list.map((s) => <Card key={s.id} s={s} />) : (
          <EmptyState icon={CalendarOff} title={t('Nessun allenamento oggi')} text={upcoming ? t('Prossimo: {title} · {date}', { title: upcoming.title, date: fmtDay(upcoming.date) }) : t('Il piano non ha altre sessioni in programma.')}
            action={canEdit && <button className="btn btn-primary" onClick={() => sheets.openNew(today)}><Plus size={16} />{t('Aggiungi allenamento')}</button>} />
        )}
        {!list.length && upcoming && (
          <button className="card w-full p-3 text-left active:scale-[0.99]" onClick={() => sheets.openDetail(upcoming)}>
            <span className="label">{t('In arrivo')}</span>
            <span className="font-semibold">{upcoming.title}</span>
          </button>
        )}

        <section className="card p-4">
          <h3 className="mb-3 font-bold">{t('Questa settimana')}</h3>
          <div className="grid grid-cols-7 gap-1.5">
            {week.map((d) => {
              const ss = db.sessions.filter((s) => s.date === d)
              const done = ss.length > 0 && ss.every((s) => s.status !== 'planned')
              return (
                <button key={d} onClick={() => onGoPlan(d)} className={`flex flex-col items-center gap-1 rounded-2xl py-2 text-xs transition-transform active:scale-90 ${d === today ? 'bg-brand/10 font-bold text-brand' : 'text-muted'}`} aria-label={fmtLong(d)}>
                  <span className="uppercase">{fmtDay(d, { weekday: 'narrow' })}</span>
                  <span className="text-sm font-semibold text-ink">{Number(d.slice(8))}</span>
                  <span className="flex h-3 items-center gap-0.5">
                    {ss.slice(0, 3).map((s) => <span key={s.id} className={`h-2 w-2 rounded-full ${done ? 'bg-inc' : DISCIPLINES[s.discipline].dot}`} />)}
                  </span>
                </button>
              )
            })}
          </div>
          <button className="btn btn-soft mt-3 w-full" onClick={() => onGoPlan(addDays(today, 0))}>{t('Apri il piano')}</button>
        </section>
      </div>
      {sheets.node}
    </div>
  )
}

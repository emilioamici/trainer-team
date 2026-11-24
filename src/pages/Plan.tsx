import { useState } from 'react'
import { ArrowUpDown, CalendarDays, ChevronLeft, ChevronRight, Copy, Plus } from 'lucide-react'
import { m } from 'framer-motion'
import { t } from '../i18n'
import { SourcePicker, useActive } from '../components/common'
import { ImportExportSheet } from '../components/ImportExport'
import { WorkoutRow } from '../components/Workout'
import { useWorkoutSheets } from '../components/WorkoutSheets'
import { EmptyState, Fixed, PageHeader, Segmented } from '../components/ui'
import { DISCIPLINES } from '../lib/disciplines'
import { addDays, addMonths, fmtDay, fmtMonth, fmtWeekRange, monthGrid, monthStart, todayISO, weekDays, weekStart } from '../lib/dates'
import { duplicateSession, upsertSession } from '../lib/db'

export default function Plan({ initialDate }: { initialDate: string | null }) {
  const { e, src, db, canEdit, canLog, members } = useActive()
  const sheets = useWorkoutSheets(src, db, canEdit, canLog)
  const today = todayISO()
  const [view, setView] = useState<'week' | 'month'>('week')
  const [cursor, setCursor] = useState(initialDate ?? today)
  const [ie, setIe] = useState(false)
  if (!src || !db) return <PageHeader title={t('Piano')} />

  const start = weekStart(cursor)
  const days = weekDays(start)
  const weekSessions = db.sessions.filter((s) => s.date >= start && s.date <= addDays(start, 6))
  const doneCount = weekSessions.filter((s) => s.status === 'done' || s.status === 'partial').length

  const move = (dir: -1 | 1) => setCursor(view === 'week' ? addDays(cursor, 7 * dir) : addMonths(cursor, dir))
  const copyPrev = () => {
    const prev = db.sessions.filter((s) => s.date >= addDays(start, -7) && s.date <= addDays(start, -1))
    if (!prev.length) { e.notify(t('La settimana precedente è vuota'), 'info'); return }
    e.mutate(src.id, (d) => prev.reduce((acc, s) => upsertSession(acc, duplicateSession(s, addDays(s.date, 7)), e.by()), d))
    e.announce(src.id, { type: 'plan' })
    e.notify(t('Copiate {n} sessioni dalla settimana precedente', { n: prev.length }))
  }

  return (
    <div>
      <PageHeader title={t('Piano')} sub={view === 'week' ? fmtWeekRange(start) : fmtMonth(cursor)}
        action={<button className="icon-btn" onClick={() => setIe(true)} aria-label={t('Importa / Esporta')}><ArrowUpDown size={18} /></button>} />
      <SourcePicker />

      <div className="mb-3 space-y-3">
        <div data-tour="plan-view"><Segmented id="plan-view" value={view} onChange={setView} options={[{ value: 'week', label: t('Settimana') }, { value: 'month', label: t('Mese') }]} /></div>
        <div className="flex items-center gap-2">
          <button className="icon-btn" onClick={() => move(-1)} aria-label={t('Precedente')}><ChevronLeft size={18} /></button>
          <button className="btn btn-soft flex-1" onClick={() => setCursor(today)}>{t('Oggi')}</button>
          <button className="icon-btn" onClick={() => move(1)} aria-label={t('Successiva')}><ChevronRight size={18} /></button>
        </div>
      </div>

      {view === 'week' ? (
        <div className="space-y-3">
          <>
            <div className="card flex items-center justify-between p-4">
              <div>
                <p className="label !mb-0">{t('Settimana')}</p>
                <p className="text-2xl font-extrabold">{doneCount}<span className="text-base font-semibold text-muted"> / {weekSessions.length} {t('completati')}</span></p>
              </div>
              {canEdit && <button data-tour="plan-copy" className="btn btn-soft" onClick={copyPrev}><Copy size={16} />{t('Copia sett. precedente')}</button>}
            </div>
          </>
          {days.map((d) => {
            const ss = db.sessions.filter((s) => s.date === d)
            return (
              <section key={d}>
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <h3 className={`text-sm font-bold capitalize ${d === today ? 'text-brand' : ''}`}>{fmtDay(d)}{d === today && ` · ${t('oggi')}`}</h3>
                  {canEdit && <button className="icon-btn !min-h-8 !min-w-8 !p-1.5" onClick={() => sheets.openNew(d)} aria-label={t('Aggiungi allenamento')}><Plus size={16} /></button>}
                </div>
                {ss.length ? <div className="space-y-2">{ss.map((s) => <WorkoutRow key={s.id} s={s} groupMembers={members} onClick={() => sheets.openDetail(s)} />)}</div>
                  : <p className="px-1 text-xs text-muted">{t('Riposo')}</p>}
              </section>
            )
          })}
          {!weekSessions.length && <EmptyState icon={CalendarDays} title={t('Settimana libera')} text={canEdit ? t('Aggiungi un allenamento o importa un piano JSON.') : t('Il tuo coach non ha ancora programmato questa settimana.')} />}
        </div>
      ) : (
        <div className="card p-3">
          <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold uppercase text-muted">
            {weekDays(weekStart(today)).map((d) => <span key={d}>{fmtDay(d, { weekday: 'short' })}</span>)}
          </div>
          <m.div key={monthStart(cursor)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-7 gap-1">
            {monthGrid(cursor).map((d) => {
              const ss = db.sessions.filter((s) => s.date === d)
              const inMonth = d.slice(0, 7) === cursor.slice(0, 7)
              return (
                <button key={d} onClick={() => { setCursor(d); setView('week') }} aria-label={fmtDay(d)}
                  className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl text-sm font-semibold transition-transform active:scale-90 ${d === today ? 'bg-brand/10 text-brand' : inMonth ? '' : 'text-muted/60'}`}>
                  {Number(d.slice(8))}
                  <span className="flex h-2 gap-0.5">{ss.slice(0, 3).map((s) => <span key={s.id} className={`h-1.5 w-1.5 rounded-full ${DISCIPLINES[s.discipline].dot}`} />)}</span>
                </button>
              )
            })}
          </m.div>
        </div>
      )}

      {canEdit && (
        <Fixed><m.button data-tour="plan-add" whileTap={{ scale: 0.9 }} onClick={() => sheets.openNew(cursor.slice(0, 7) === today.slice(0, 7) && view === 'month' ? today : view === 'week' ? (weekDays(start).includes(today) ? today : start) : cursor)}
          className="fixed right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-onbrand md:right-10" style={{ bottom: 'calc(5.75rem + env(safe-area-inset-bottom))', boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.35), 0 8px 20px -8px rgb(var(--brand) / 0.7)' }} aria-label={t('Nuovo allenamento')}>
          <Plus size={26} />
        </m.button></Fixed>
      )}
      <ImportExportSheet open={ie} onClose={() => setIe(false)} src={src} db={db} week={start} canEdit={canEdit} />
      {sheets.node}
    </div>
  )
}

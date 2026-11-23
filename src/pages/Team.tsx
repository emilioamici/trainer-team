import { useState } from 'react'
import { ArrowUpDown, ChartNoAxesColumn, ChevronRight, MessageSquare, Plus, Settings2, Users } from 'lucide-react'
import { t } from '../i18n'
import { ManageAthleteSheet, NewAthleteSheet } from '../components/AthleteSheets'
import { ImportExportSheet } from '../components/ImportExport'
import { SourcePicker, SyncBadge, useActive } from '../components/common'
import { WorkoutRow } from '../components/Workout'
import { useWorkoutSheets } from '../components/WorkoutSheets'
import { Badge, EmptyState, PageHeader, Segmented } from '../components/ui'
import { FEELS } from '../lib/disciplines'
import { addDays, fmtDay, todayISO, weekStart } from '../lib/dates'
import { lastCompleted, periodStats } from '../lib/db'
import { useEngine } from '../state/store'
import type { TrainingPlanDatabase, WorkoutSession } from '../types'

export default function Team({ onOpenPlan }: { onOpenPlan: (date?: string) => void }) {
  const e = useEngine()
  return e.role === 'coach' ? <CoachView onOpenPlan={onOpenPlan} /> : <Progress />
}

// ================= Coach =================
function CoachView({ onOpenPlan }: { onOpenPlan: (date?: string) => void }) {
  const e = useEngine()
  const [newOpen, setNewOpen] = useState(false)
  const [manage, setManage] = useState<string | null>(null)
  const [ieSourceId, setIeSourceId] = useState<string | null>(null)
  const today = todayISO()
  const mon = weekStart(today)
  const list = e.sources().filter((s) => s.kind === 'coach-athlete' || s.kind === 'demo')

  const feedbacks = list.flatMap((s) => {
    const db = e.dbOf(s.id)
    return (db?.sessions ?? []).filter((x) => x.feedback && (x.feedback.comment || x.feedback.rpe)).map((x) => ({ s, x }))
  }).sort((a, b) => (b.x.feedback!.loggedAt).localeCompare(a.x.feedback!.loggedAt)).slice(0, 6)

  return (
    <div>
      <PageHeader
        title={t('I miei atleti')}
        sub={t('{n} atleti', { n: list.length })}
        action={
          <div className="flex items-center gap-2">
            <button
              className="icon-btn"
              onClick={() => setIeSourceId(list[0]?.id ?? 'personal')}
              aria-label={t('Importa / Esporta')}
            >
              <ArrowUpDown size={18} />
            </button>
            <button className="btn btn-primary" onClick={() => setNewOpen(true)}>
              <Plus size={16} />
              {t('Nuovo atleta')}
            </button>
          </div>
        }
      />
      <div className="space-y-3">
        {list.length === 0 && <EmptyState icon={Users} title={t('Nessun atleta')} text={t('Crea il primo atleta: avrà un file dedicato sul tuo Drive.')} />}
        {list.map((s) => {
          const db = e.dbOf(s.id)
          if (!db) return null
          const ws = db.sessions.filter((x) => x.date >= mon && x.date <= addDays(mon, 6))
          const st = periodStats(ws)
          const last = lastCompleted(db)
          const pct = ws.length ? Math.round(((st.done + st.partial) / ws.length) * 100) : 0
          const card = (
            <article className="card space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold">{db.athlete.name}{s.kind === 'demo' && <span className="ml-2 text-xs font-semibold text-muted">{t('demo')}</span>}</h2>
                  <p className="truncate text-sm text-muted">{db.athlete.focus || t('Nessun obiettivo indicato')}</p>
                </div>
                <button className="icon-btn" onClick={() => setManage(s.id)} aria-label={t('Gestisci atleta')}><Settings2 size={18} /></button>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs"><span className="font-semibold">{t('Questa settimana')}</span><span className="text-muted">{st.done + st.partial}/{ws.length}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-inc" style={{ width: `${pct}%` }} /></div>
              </div>
              <p className="text-xs text-muted">{last ? t('Ultimo completato: {title} · {date}', { title: last.title, date: fmtDay(last.date) }) : t('Nessun allenamento completato')}</p>
              <div className="flex items-center justify-between gap-2">
                {s.kind === 'demo' ? <Badge className="bg-line/60 text-muted">{t('Solo locale')}</Badge> : <SyncBadge status={e.statusOf(s.id).status} />}
                <div className="flex items-center gap-2">
                  <button
                    className="icon-btn !min-h-9 !min-w-9"
                    onClick={() => setIeSourceId(s.id)}
                    aria-label={t('Importa / Esporta piano')}
                    title={t('Importa / Esporta piano')}
                  >
                    <ArrowUpDown size={16} />
                  </button>
                  <button className="btn btn-soft" onClick={() => { e.setActive(s.id); onOpenPlan(today) }}>
                    {t('Apri piano')}<ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </article>
          )
          return <div key={s.id}>{card}</div>
        })}

        {feedbacks.length > 0 && (
          <section className="card p-4">
            <h3 className="mb-3 font-bold">{t('Feedback recenti')}</h3>
            <ul className="space-y-3">
              {feedbacks.map(({ s, x }) => {
                const db = e.dbOf(s.id)!
                const feel = FEELS.find((f) => f.id === x.feedback?.feel)
                return (
                  <li key={x.id}>
                    <button className="w-full text-left" onClick={() => { e.setActive(s.id); onOpenPlan(x.date) }}>
                      <p className="flex items-center justify-between text-sm"><span className="font-semibold">{db.athlete.name} · {x.title}</span><span className="text-xs text-muted">{fmtDay(x.date)}</span></p>
                      <p className="text-xs text-muted">{[x.feedback?.rpe ? `RPE ${x.feedback.rpe}` : '', feel ? feel.emoji : '', x.feedback?.durationMin ? `${x.feedback.durationMin}'` : ''].filter(Boolean).join(' · ')}</p>
                      {x.feedback?.comment && <p className="mt-0.5 flex gap-1.5 text-sm"><MessageSquare size={14} className="mt-0.5 shrink-0 text-muted" />{x.feedback.comment}</p>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
      <NewAthleteSheet open={newOpen} onClose={() => setNewOpen(false)} onCreated={(id) => setManage(id)} />
      <ManageAthleteSheet
        sourceId={manage}
        onClose={() => setManage(null)}
        onOpenImportExport={(sid) => {
          setManage(null)
          setIeSourceId(sid)
        }}
      />
      <ImportExportSheet
        open={!!ieSourceId}
        onClose={() => setIeSourceId(null)}
        initialAthleteSourceId={ieSourceId}
      />
    </div>
  )
}

// ================= Atleta: progressi =================
function BarChart({ data, label, unit, max: fixedMax }: { data: { v: number; label: string }[]; label: string; unit: string; max?: number }) {
  const max = fixedMax ?? Math.max(1, ...data.map((d) => d.v))
  const W = 300, H = 90, gap = 6
  const bw = data.length ? (W - gap * (data.length - 1)) / data.length : W
  return (
    <figure>
      <svg viewBox={`0 -14 ${W} ${H + 30}`} className="w-full" role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${Math.round(d.v * 10) / 10}${unit}`).join(', ')}`}>
        {data.map((d, i) => {
          const h = Math.max(2, (d.v / max) * H)
          return (
            <g key={i}>
              <rect x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={Math.min(6, bw / 2)} className="fill-brand" />
              {d.v > 0 && <text x={i * (bw + gap) + bw / 2} y={H - h - 3} textAnchor="middle" className="fill-ink" fontSize="9" fontWeight="600">{Math.round(d.v * 10) / 10}</text>}
              <text x={i * (bw + gap) + bw / 2} y={H + 12} textAnchor="middle" className="fill-muted" fontSize="9">{d.label}</text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

const sessionsLogged = (db: TrainingPlanDatabase) => db.sessions.filter((s) => s.status === 'done' || s.status === 'partial')

function Progress() {
  const { src, db, canEdit, canLog } = useActive()
  const sheets = useWorkoutSheets(src, db, canEdit, canLog)
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  if (!src || !db) return <PageHeader title={t('Progressi')} />
  const today = todayISO()
  const from = period === 'week' ? weekStart(today) : today.slice(0, 7) + '-01'
  const to = period === 'week' ? addDays(from, 6) : today.slice(0, 7) + '-31'
  const st = periodStats(db.sessions.filter((s) => s.date >= from && s.date <= to))
  const logged = sessionsLogged(db).sort((a, b) => a.date.localeCompare(b.date))
  const rpe = logged.filter((s) => s.feedback?.rpe).slice(-12).map((s) => ({ v: s.feedback!.rpe!, label: String(Number(s.date.slice(8))) }))
  const mon = weekStart(today)
  const weeks = Array.from({ length: 6 }, (_, i) => addDays(mon, (i - 5) * 7)).map((w) => ({
    v: periodStats(db.sessions.filter((s) => s.date >= w && s.date <= addDays(w, 6))).minutes / 60, label: fmtDay(w, { day: 'numeric', month: 'numeric' }),
  }))
  const history = [...logged].reverse().slice(0, 15)
  const Stat = ({ v, l }: { v: string; l: string }) => <div className="rounded-2xl bg-bg p-3"><p className="text-2xl font-extrabold">{v}</p><p className="text-xs text-muted">{l}</p></div>

  return (
    <div>
      <PageHeader title={t('Progressi')} sub={db.athlete.name} />
      <SourcePicker />
      <div className="space-y-3">
        <>
          <div className="card space-y-3 p-4">
            <Segmented id="period" value={period} onChange={setPeriod} options={[{ value: 'week', label: t('Settimana') }, { value: 'month', label: t('Mese') }]} />
            <div className="grid grid-cols-2 gap-2">
              <Stat v={`${st.done + st.partial}/${st.planned}`} l={t('Sessioni completate')} />
              <Stat v={`${Math.round((st.minutes / 60) * 10) / 10} h`} l={t('Volume')} />
              <Stat v={`${Math.round(st.km * 10) / 10} km`} l={t('Distanza registrata')} />
              <Stat v={st.avgRpe ? (Math.round(st.avgRpe * 10) / 10).toString() : '–'} l={t('RPE medio')} />
            </div>
          </div>
        </>
        <section className="card p-4"><h3 className="mb-2 font-bold">{t('Ore a settimana (ultime 6)')}</h3><BarChart data={weeks} label={t('Ore a settimana')} unit=" h" /></section>
        <section className="card p-4">
          <h3 className="mb-2 font-bold">{t('Trend RPE')}</h3>
          {rpe.length ? <BarChart data={rpe} label={t('Trend RPE')} unit="" max={10} /> : <p className="text-sm text-muted">{t('Completa qualche allenamento con il feedback per vedere il trend.')}</p>}
        </section>
        <section>
          <h3 className="mb-2 px-1 font-bold">{t('Storico allenamenti')}</h3>
          {history.length ? <div className="space-y-2">{history.map((s: WorkoutSession) => <div key={s.id}><p className="px-1 text-xs text-muted">{fmtDay(s.date)}</p><WorkoutRow s={s} onClick={() => sheets.openDetail(s)} /></div>)}</div>
            : <EmptyState icon={ChartNoAxesColumn} title={t('Ancora nessun allenamento completato')} text={t('Quando segni una sessione come completata la trovi qui.')} />}
        </section>
      </div>
      {sheets.node}
    </div>
  )
}

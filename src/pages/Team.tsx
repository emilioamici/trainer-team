import { useState } from 'react'
import {
  ArrowUpDown,
  ChartNoAxesColumn,
  ChevronRight,
  MessageSquare,
  Plus,
  Settings2,
  Share2,
  User,
  Users,
} from 'lucide-react'
import { t } from '../i18n'
import { ManageAthleteSheet, NewAthleteSheet } from '../components/AthleteSheets'
import { GroupDetailSheet, MemberHistorySheet } from '../components/GroupHistorySheets'
import { ImportExportSheet } from '../components/ImportExport'
import { SourcePicker, SyncBadge, useActive } from '../components/common'
import { WorkoutDetail, WorkoutRow } from '../components/Workout'
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
  const [filter, setFilter] = useState<'all' | 'groups' | 'pros'>('all')
  const [selectedGroupDb, setSelectedGroupDb] = useState<TrainingPlanDatabase | null>(null)
  const [selectedMemberName, setSelectedMemberName] = useState<string | null>(null)
  const [viewSession, setViewSession] = useState<WorkoutSession | null>(null)
  const today = todayISO()
  const mon = weekStart(today)
  const list = e.sources().filter((s) => s.kind === 'coach-athlete' || s.kind === 'demo')

  const isGroup = (db: TrainingPlanDatabase) =>
    db.athlete.targetKind === 'group' || (db.athlete.members && db.athlete.members.length > 0)

  const groups = list.filter((s) => {
    const db = e.dbOf(s.id)
    return db ? isGroup(db) : false
  })
  const pros = list.filter((s) => {
    const db = e.dbOf(s.id)
    return db ? !isGroup(db) : false
  })

  const filteredList = filter === 'groups' ? groups : filter === 'pros' ? pros : list

  const feedbacks = list
    .flatMap((s) => {
      const db = e.dbOf(s.id)
      return (db?.sessions ?? [])
        .filter((x) => x.feedback && (x.feedback.comment || x.feedback.rpe))
        .map((x) => ({ s, x }))
    })
    .sort((a, b) => b.x.feedback!.loggedAt.localeCompare(a.x.feedback!.loggedAt))
    .slice(0, 6)

  return (
    <div>
      <PageHeader
        title={t('Team')}
        sub={t('{g} gruppi · {a} atleti individuali', { g: groups.length, a: pros.length })}
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
              {t('Aggiungi')}
            </button>
          </div>
        }
      />
      <div className="space-y-3">
        <Segmented
          id="team-filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('Tutti ({n})', { n: list.length }) },
            { value: 'groups', label: t('Gruppi ({n})', { n: groups.length }) },
            { value: 'pros', label: t('Individual Athlete ({n})', { n: pros.length }) },
          ]}
        />

        {filteredList.length === 0 && (
          <EmptyState
            icon={Users}
            title={t('Nessun gruppo o atleta')}
            text={t('Aggiungi un gruppo della scuola tennis o un atleta individuale.')}
          />
        )}
        {filteredList.map((s) => {
          const db = e.dbOf(s.id)
          if (!db) return null
          const isGrp = isGroup(db)
          const ws = db.sessions.filter((x) => x.date >= mon && x.date <= addDays(mon, 6))
          const st = periodStats(ws)
          const last = lastCompleted(db)
          const pct = ws.length ? Math.round(((st.done + st.partial) / ws.length) * 100) : 0
          const card = (
            <article className="card space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge className={isGrp ? 'bg-brand/10 text-brand font-bold' : 'bg-warn/15 text-warn font-bold'}>
                      {isGrp ? <Users size={12} /> : <User size={12} />}
                      {isGrp ? t('Gruppo ({n})', { n: db.athlete.members?.length ?? 0 }) : t('Individual Athlete')}
                    </Badge>
                    {db.athlete.schedule && <span className="truncate text-xs text-muted">{db.athlete.schedule}</span>}
                  </div>
                  <h2
                    className={`mt-1 truncate text-lg font-bold ${
                      isGrp ? 'cursor-pointer hover:text-brand transition-colors' : ''
                    }`}
                    onClick={() => {
                      if (isGrp) setSelectedGroupDb(db)
                    }}
                  >
                    {db.athlete.name}
                    {s.kind === 'demo' && <span className="ml-2 text-xs font-semibold text-muted">{t('demo')}</span>}
                  </h2>
                  <p className="truncate text-sm text-muted">{db.athlete.focus || t('Nessun obiettivo indicato')}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button className="icon-btn" onClick={() => setManage(s.id)} aria-label={t('Codice invito')}>
                    <Share2 size={17} />
                  </button>
                  <button className="icon-btn" onClick={() => setManage(s.id)} aria-label={t('Gestisci')}>
                    <Settings2 size={18} />
                  </button>
                </div>
              </div>

              {isGrp && (
                <div className="space-y-2 rounded-2xl border border-line/60 bg-bg/50 p-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-muted">
                      {t('Allievi del gruppo ({n})', { n: (db.athlete.members ?? []).length })}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedGroupDb(db)}
                      className="font-bold text-brand hover:underline flex items-center gap-0.5"
                    >
                      {t('Apri gruppo')} <ChevronRight size={13} />
                    </button>
                  </div>
                  {db.athlete.members && db.athlete.members.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {db.athlete.members.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setSelectedGroupDb(db)
                            setSelectedMemberName(m)
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink transition hover:border-brand/50 hover:bg-surface/90 hover:text-brand active:scale-95 shadow-sm"
                          title={t('Tocca per vedere lo storico di {name}', { name: m })}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-semibold">{t('Questa settimana')}</span>
                  <span className="text-muted">
                    {st.done + st.partial}/{ws.length}
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-line"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand via-blue-500 to-warn transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-2 text-xs">
                <div className="flex items-center gap-1.5 text-muted">
                  <SyncBadge status={e.statusOf(s.id).status} />
                  {last && <span>· {t('Ultimo: {date}', { date: fmtDay(last.date) })}</span>}
                </div>
                <button
                  className="inline-flex items-center gap-1 font-semibold text-brand"
                  onClick={() => {
                    e.setActive(s.id)
                    onOpenPlan()
                  }}
                >
                  {t('Vedi piano')} <ChevronRight size={14} />
                </button>
              </div>
            </article>
          )
          return <div key={s.id}>{card}</div>
        })}

        {feedbacks.length > 0 && (
          <section className="mt-6 space-y-2">
            <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-muted">
              {t('Ultimi feedback')}
            </h3>
            <div className="space-y-2">
              {feedbacks.map(({ s, x }) => {
                const f = x.feedback!
                const feel = FEELS.find((item) => item.id === f.feel)
                return (
                  <div key={x.id} className="card flex items-start gap-3 p-3 text-sm">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                      <MessageSquare size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate font-bold">{s.name}</p>
                        <span className="text-[11px] text-muted">{fmtDay(x.date)}</span>
                      </div>
                      <p className="text-xs text-muted">{x.title}</p>
                      {f.comment && <p className="mt-1 text-xs italic">«{f.comment}»</p>}
                      <div className="mt-1 flex flex-wrap gap-2 text-xs font-semibold">
                        {f.rpe && <span className="text-brand">RPE {f.rpe}/10</span>}
                        {feel && <span>{feel.emoji} {t(feel.label)}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>

      <NewAthleteSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(id) => {
          e.setActive(id)
          onOpenPlan()
        }}
      />
      <ManageAthleteSheet
        sourceId={manage}
        onClose={() => setManage(null)}
        onOpenImportExport={(id) => setIeSourceId(id)}
      />
      <ImportExportSheet
        open={!!ieSourceId}
        initialAthleteSourceId={ieSourceId ?? undefined}
        onClose={() => setIeSourceId(null)}
      />
      <GroupDetailSheet
        open={!!selectedGroupDb && !selectedMemberName}
        onClose={() => setSelectedGroupDb(null)}
        db={selectedGroupDb}
        onSelectMember={(m) => setSelectedMemberName(m)}
        onOpenManage={() => {
          if (!selectedGroupDb) return
          const src = list.find((s) => e.dbOf(s.id)?.meta.dbId === selectedGroupDb.meta.dbId)
          if (src) setManage(src.id)
        }}
        onOpenPlan={() => {
          if (!selectedGroupDb) return
          const src = list.find((s) => e.dbOf(s.id)?.meta.dbId === selectedGroupDb.meta.dbId)
          if (src) {
            e.setActive(src.id)
            onOpenPlan()
          }
        }}
      />
      <MemberHistorySheet
        open={!!selectedMemberName}
        onClose={() => setSelectedMemberName(null)}
        memberName={selectedMemberName}
        db={selectedGroupDb}
        onOpenSession={(sess) => setViewSession(sess)}
      />
      <WorkoutDetail
        s={viewSession}
        onClose={() => setViewSession(null)}
        canEdit={false}
        canLog={false}
        onEdit={() => {}}
        onFeedback={() => {}}
        onDuplicate={() => {}}
        onDelete={() => {}}
        groupMembers={selectedGroupDb?.athlete.members ?? []}
      />
    </div>
  )
}

// ================= Athlete (Progressi) =================
const BarChart = ({
  data,
  label,
  unit = '',
  max: userMax,
}: {
  data: { v: number; label: string }[]
  label: string
  unit?: string
  max?: number
}) => {
  const max = userMax ?? Math.max(...data.map((d) => d.v), 1)
  return (
    <div className="space-y-2">
      <div className="flex h-32 items-end gap-2 pt-2">
        {data.map((d, i) => {
          const h = Math.round((d.v / max) * 100)
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-muted">
                {d.v ? `${d.v}${unit}` : ''}
              </span>
              <div className="flex h-20 w-full items-end justify-center rounded-lg bg-line/40">
                <div
                  className="w-full rounded-lg bg-gradient-to-t from-brand to-sky-400 transition-all shadow-sm"
                  style={{ height: `${Math.max(h, 4)}%` }}
                  title={`${d.label}: ${d.v}${unit}`}
                />
              </div>
              <span className="truncate text-[10px] text-muted">{d.label}</span>
            </div>
          )
        })}
      </div>
      <p className="text-right text-[10px] text-muted">{label}</p>
    </div>
  )
}

const sessionsLogged = (db: TrainingPlanDatabase) =>
  db.sessions.filter((s) => s.status === 'done' || s.status === 'partial')

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
  const rpe = logged
    .filter((s) => s.feedback?.rpe)
    .slice(-12)
    .map((s) => ({ v: s.feedback!.rpe!, label: String(Number(s.date.slice(8))) }))
  const mon = weekStart(today)
  const weeks = Array.from({ length: 6 }, (_, i) => addDays(mon, (i - 5) * 7)).map((w) => ({
    v:
      periodStats(db.sessions.filter((s) => s.date >= w && s.date <= addDays(w, 6))).minutes /
      60,
    label: fmtDay(w, { day: 'numeric', month: 'numeric' }),
  }))
  const history = [...logged].reverse().slice(0, 15)
  const Stat = ({ v, l }: { v: string; l: string }) => (
    <div className="rounded-2xl bg-bg p-3">
      <p className="text-2xl font-extrabold">{v}</p>
      <p className="text-xs text-muted">{l}</p>
    </div>
  )

  return (
    <div>
      <PageHeader title={t('Progressi')} sub={db.athlete.name} />
      <SourcePicker />
      <div className="space-y-3">
        <div className="card space-y-3 p-4">
          <Segmented
            id="period"
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'week', label: t('Settimana') },
              { value: 'month', label: t('Mese') },
            ]}
          />
          <div className="grid grid-cols-2 gap-2">
            <Stat v={`${st.done + st.partial}/${st.planned}`} l={t('Sessioni completate')} />
            <Stat v={`${Math.round((st.minutes / 60) * 10) / 10} h`} l={t('Volume')} />
            <Stat v={`${Math.round(st.km * 10) / 10} km`} l={t('Distanza registrata')} />
            <Stat
              v={st.avgRpe ? (Math.round(st.avgRpe * 10) / 10).toString() : '–'}
              l={t('RPE medio')}
            />
          </div>
        </div>
        <section className="card p-4">
          <h3 className="mb-2 font-bold">{t('Ore a settimana (ultime 6)')}</h3>
          <BarChart data={weeks} label={t('Ore a settimana')} unit=" h" />
        </section>
        <section className="card p-4">
          <h3 className="mb-2 font-bold">{t('Trend RPE')}</h3>
          {rpe.length ? (
            <BarChart data={rpe} label={t('Trend RPE')} unit="" max={10} />
          ) : (
            <p className="text-sm text-muted">
              {t('Completa qualche allenamento con il feedback per vedere il trend.')}
            </p>
          )}
        </section>
        <section>
          <h3 className="mb-2 px-1 font-bold">{t('Storico allenamenti')}</h3>
          {history.length ? (
            <div className="space-y-2">
              {history.map((s: WorkoutSession) => (
                <div key={s.id}>
                  <p className="px-1 text-xs text-muted">{fmtDay(s.date)}</p>
                  <WorkoutRow
                    s={s}
                    groupMembers={db.athlete.members ?? []}
                    onClick={() => sheets.openDetail(s)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ChartNoAxesColumn}
              title={t('Ancora nessun allenamento completato')}
              text={t('Quando segni una sessione come completata la trovi qui.')}
            />
          )}
        </section>
      </div>
      {sheets.node}
    </div>
  )
}

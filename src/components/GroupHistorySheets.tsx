import { useState } from 'react'
import {
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Dumbbell,
  Eye,
  Settings2,
  Users,
  X,
} from 'lucide-react'
import { t } from '../i18n'
import { fmtDay } from '../lib/dates'
import { DISCIPLINES, PHASES } from '../lib/disciplines'
import type { TrainingPlanDatabase, WorkoutBlock, WorkoutSession } from '../types'
import { Badge, Sheet } from './ui'
import { getGroupColor, getGroupIcon } from '../lib/branding'

export interface MemberAttendanceStats {
  name: string
  attendedCount: number
  totalSessions: number
  rate: number
  lastDate: string | null
}

export function computeGroupStats(
  members: string[],
  sessions: WorkoutSession[]
): {
  memberStats: MemberAttendanceStats[]
  totalGroupSessions: number
  avgRate: number
} {
  const conducted = sessions.filter((s) => s.status !== 'skipped')
  const total = conducted.length

  const memberStats: MemberAttendanceStats[] = members.map((name) => {
    const attended = conducted.filter((s) => s.attendance?.includes(name))
    const attendedCount = attended.length
    const rate = total > 0 ? Math.round((attendedCount / total) * 100) : 0
    const sorted = [...attended].sort((a, b) => b.date.localeCompare(a.date))
    const lastDate = sorted[0]?.date ?? null

    return {
      name,
      attendedCount,
      totalSessions: total,
      rate,
      lastDate,
    }
  })

  const sumRates = memberStats.reduce((acc, m) => acc + m.rate, 0)
  const avgRate = members.length > 0 ? Math.round(sumRates / members.length) : 0

  return { memberStats, totalGroupSessions: total, avgRate }
}

/** Foglio elenco componenti del gruppo con presenze */
export function GroupDetailSheet({
  open,
  onClose,
  db,
  onSelectMember,
  onOpenManage,
  onOpenPlan,
}: {
  open: boolean
  onClose: () => void
  db: TrainingPlanDatabase | null
  onSelectMember: (memberName: string) => void
  onOpenManage?: () => void
  onOpenPlan?: () => void
}) {
  if (!db) return null

  const members = db.athlete.members ?? []
  const sessions = db.sessions ?? []
  const { memberStats, totalGroupSessions, avgRate } = computeGroupStats(members, sessions)
  const groupColor = getGroupColor(db.athlete.color, true)
  const GroupIconComp = getGroupIcon(db.athlete.icon, true)

  return (
    <Sheet open={open} onClose={onClose} title={db.athlete.name}>
      <div className="space-y-4 pb-4">
        {/* Intestazione gruppo */}
        <div className="rounded-2xl border border-line bg-surface p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Badge className={`font-bold ${groupColor.bg} ${groupColor.text}`}>
              <GroupIconComp size={12} />
              {t('Gruppo Scuola Tennis')}
            </Badge>
            {db.athlete.schedule && (
              <span className="text-xs text-muted flex items-center gap-1">
                <Clock size={11} />
                {db.athlete.schedule}
              </span>
            )}
          </div>
          {db.athlete.focus && (
            <p className="text-xs text-muted">
              <span className="font-semibold text-ink">{t('Obiettivo')}: </span>
              {db.athlete.focus}
            </p>
          )}

          {/* Statistiche rapide del gruppo */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-line/60 text-center">
            <div className="rounded-xl bg-bg p-2">
              <p className="text-lg font-extrabold text-ink">{members.length}</p>
              <p className="text-[10px] text-muted">{t('Allievi')}</p>
            </div>
            <div className="rounded-xl bg-bg p-2">
              <p className="text-lg font-extrabold text-brand">{totalGroupSessions}</p>
              <p className="text-[10px] text-muted">{t('Allenamenti')}</p>
            </div>
            <div className="rounded-xl bg-bg p-2">
              <p className="text-lg font-extrabold text-inc">{avgRate}%</p>
              <p className="text-[10px] text-muted">{t('Presenza media')}</p>
            </div>
          </div>
        </div>

        {/* Elenco componenti */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
              {t('Componenti del gruppo ({n})', { n: members.length })}
            </h3>
            <span className="text-[11px] text-muted">
              {t('Tocca un allievo per lo storico')}
            </span>
          </div>

          {members.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
              <Users size={24} className="mx-auto mb-2 opacity-50" />
              <p>{t('Nessun allievo in questo gruppo.')}</p>
              <button
                type="button"
                className="btn btn-soft !text-xs mt-3"
                onClick={() => {
                  onClose()
                  onOpenManage?.()
                }}
              >
                {t('Aggiungi allievi')}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {memberStats.map((m) => (
                <button
                  key={m.name}
                  type="button"
                  onClick={() => onSelectMember(m.name)}
                  className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3 text-left transition hover:border-brand/50 hover:bg-surface/90 active:scale-[0.99] shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand/15 to-warn/20 text-sm font-bold text-brand ring-1 ring-brand/20">
                      {m.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-ink truncate group-hover:text-brand transition-colors">
                        {m.name}
                      </p>
                      <p className="text-xs text-muted flex items-center gap-1.5 pt-0.5">
                        <span className="font-semibold text-ink">
                          {m.attendedCount}/{m.totalSessions} {t('presenze')}
                        </span>
                        <span>·</span>
                        <span className="text-[11px]">
                          {m.lastDate
                            ? t('Ultima: {date}', { date: fmtDay(m.lastDate) })
                            : t('Nessuna presenza')}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      className={`text-xs font-bold ${
                        m.rate >= 80
                          ? 'bg-inc/15 text-inc'
                          : m.rate >= 50
                            ? 'bg-warn/15 text-warn'
                            : 'bg-line text-muted'
                      }`}
                    >
                      {m.rate}%
                    </Badge>
                    <ChevronRight size={16} className="text-muted group-hover:text-brand transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Azioni del gruppo */}
        <div className="flex gap-2 pt-2 border-t border-line/60">
          {onOpenPlan && (
            <button
              type="button"
              className="btn btn-primary flex-1 !text-xs !py-2.5"
              onClick={() => {
                onClose()
                onOpenPlan()
              }}
            >
              <Calendar size={14} />
              {t('Vedi piano allenamenti')}
            </button>
          )}
          {onOpenManage && (
            <button
              type="button"
              className="btn btn-soft !text-xs !py-2.5 !px-3.5"
              onClick={() => {
                onClose()
                onOpenManage()
              }}
              aria-label={t('Gestisci')}
            >
              <Settings2 size={15} />
              {t('Gestisci')}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  )
}

/** Foglio storico dettagliato presenze ed esercizi svolti da un allievo */
export function MemberHistorySheet({
  open,
  onClose,
  memberName,
  db,
  onOpenSession,
}: {
  open: boolean
  onClose: () => void
  memberName: string | null
  db: TrainingPlanDatabase | null
  onOpenSession?: (session: WorkoutSession) => void
}) {
  const [filter, setFilter] = useState<'attended' | 'all'>('attended')
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)

  if (!db || !memberName) return null

  const allSessions = (db.sessions ?? [])
    .filter((s) => s.status !== 'skipped')
    .sort((a, b) => b.date.localeCompare(a.date))

  const attendedSessions = allSessions.filter((s) => s.attendance?.includes(memberName))
  const displayedSessions = filter === 'attended' ? attendedSessions : allSessions
  const rate =
    allSessions.length > 0
      ? Math.round((attendedSessions.length / allSessions.length) * 100)
      : 0

  const toggleExpand = (id: string) => {
    setExpandedSessionId((prev) => (prev === id ? null : id))
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${memberName} · ${t('Storico presenze')}`}
    >
      <div className="space-y-4 pb-4">
        {/* Statistiche dell'allievo */}
        <div className="rounded-2xl border border-line bg-surface p-3.5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand via-blue-600 to-indigo-600 text-base font-extrabold text-white shadow-md shadow-brand/20">
              {memberName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-extrabold text-ink truncate">{memberName}</h2>
              <p className="text-xs text-muted truncate">{db.athlete.name}</p>
            </div>
            <Badge
              className={`font-bold ${
                rate >= 80 ? 'bg-inc/15 text-inc' : rate >= 50 ? 'bg-warn/15 text-warn' : 'bg-line text-muted'
              }`}
            >
              {rate}% {t('presenze')}
            </Badge>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-line/60 text-center">
            <div className="rounded-xl bg-bg p-2">
              <p className="text-base font-extrabold text-inc">{attendedSessions.length}</p>
              <p className="text-[10px] text-muted">{t('Presente')}</p>
            </div>
            <div className="rounded-xl bg-bg p-2">
              <p className="text-base font-extrabold text-muted">
                {allSessions.length - attendedSessions.length}
              </p>
              <p className="text-[10px] text-muted">{t('Assenze')}</p>
            </div>
            <div className="rounded-xl bg-bg p-2">
              <p className="text-base font-extrabold text-brand">{allSessions.length}</p>
              <p className="text-[10px] text-muted">{t('Sessioni totali')}</p>
            </div>
          </div>
        </div>

        {/* Filtro tra solo presenti e tutti */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">
            {t('Allenamenti')}
          </span>
          <div className="flex rounded-full border border-line bg-surface p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setFilter('attended')}
              className={`rounded-full px-2.5 py-1 transition ${
                filter === 'attended'
                  ? 'bg-brand text-onbrand shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {t('Presente ({n})', { n: attendedSessions.length })}
            </button>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-full px-2.5 py-1 transition ${
                filter === 'all'
                  ? 'bg-brand text-onbrand shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {t('Tutti ({n})', { n: allSessions.length })}
            </button>
          </div>
        </div>

        {/* Elenco sessioni con blocchi ed esercizi svolti */}
        {displayedSessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
            <Calendar size={24} className="mx-auto mb-2 opacity-50" />
            <p>{t('Nessun allenamento registrato per questo filtro.')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayedSessions.map((s) => {
              const isPresent = s.attendance?.includes(memberName)
              const d = DISCIPLINES[s.discipline]
              const Icon = d?.icon ?? Dumbbell
              const expanded = expandedSessionId === s.id

              return (
                <div
                  key={s.id}
                  className={`rounded-2xl border p-3.5 transition-all space-y-2.5 ${
                    isPresent
                      ? 'border-line/80 bg-surface shadow-sm'
                      : 'border-line/50 bg-surface/50 opacity-75'
                  }`}
                >
                  {/* Riga superiore sessione */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge
                          className={`text-[10px] font-bold ${
                            isPresent ? 'bg-inc/15 text-inc' : 'bg-line text-muted'
                          }`}
                        >
                          {isPresent ? <Check size={11} strokeWidth={2.4} /> : <X size={11} />}
                          {isPresent ? t('Presente') : t('Assente')}
                        </Badge>
                        <span className="text-xs font-semibold text-muted">
                          {fmtDay(s.date)}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-ink mt-1 truncate">{s.title}</h4>
                      {d && (
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <Badge className={`${d.badge} text-[10px]`}>
                            <Icon size={10} />
                            {t(d.label)}
                          </Badge>
                          <span className="text-[11px] text-muted">
                            {s.blocks.length} {t('esercizi')}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleExpand(s.id)}
                        className="btn btn-soft !py-1 !px-2.5 !text-xs whitespace-nowrap"
                      >
                        {expanded ? t('Comprimi') : t('Esercizi')}
                      </button>
                      {onOpenSession && (
                        <button
                          type="button"
                          onClick={() => onOpenSession(s)}
                          className="icon-btn !min-w-8 !min-h-8 !p-1.5 text-muted hover:text-brand"
                          aria-label={t('Dettagli allenamento')}
                        >
                          <Eye size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Cosa si era fatto a quell'allenamento (esercizi e carichi) */}
                  {expanded && (
                    <div className="space-y-2 pt-2 border-t border-line/60">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                        {t('Programma svolto ({n} esercizi):', { n: s.blocks.length })}
                      </p>

                      {s.coachNotes && (
                        <p className="rounded-xl bg-brand/10 p-2.5 text-xs text-ink">
                          <span className="font-semibold text-brand">
                            {t('Note del coach')}:{' '}
                          </span>
                          {s.coachNotes}
                        </p>
                      )}

                      <div className="space-y-1.5">
                        {s.blocks.map((b, idx) => (
                          <BlockRow key={b.id || idx} b={b} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Sheet>
  )
}

/** Singola riga esercizio con carichi, serie, rep e note */
function BlockRow({ b }: { b: WorkoutBlock }) {
  const phase = PHASES[b.phase]

  return (
    <div className="rounded-xl border border-line/60 bg-bg/80 p-2 text-xs space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-bold text-ink truncate">{b.title}</span>
        <span className="text-[10px] font-semibold text-muted uppercase">
          {phase ? t(phase) : ''}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        {b.sets && b.reps && (
          <span className="font-semibold text-ink">
            {b.sets} × {b.reps}
          </span>
        )}
        {b.load && (
          <Badge className="bg-warn/15 text-warn font-semibold text-[10px] !py-0.5 !px-1.5">
            {b.load}
          </Badge>
        )}
        {b.equipment && (
          <span className="text-muted/80">({b.equipment})</span>
        )}
        {b.rest && <span>· rec. {b.rest}</span>}
      </div>

      {b.notes && (
        <p className="text-[11px] text-muted italic pt-0.5 whitespace-pre-wrap">«{b.notes}»</p>
      )}
    </div>
  )
}

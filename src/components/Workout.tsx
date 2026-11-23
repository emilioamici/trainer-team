import { useMemo, useState } from 'react'
import { Check, CirclePlus, Copy, Dumbbell, MessageSquare, Pencil, Trash2, Users, X } from 'lucide-react'
import { t, T } from '../i18n'
import { DISCIPLINES, DISCIPLINE_ORDER, FEELS, PHASES, PHASE_ORDER, STATUS_BADGE, STATUS_LABEL } from '../lib/disciplines'
import { fmtLong } from '../lib/dates'
import { parseNum } from '../lib/files'
import { uid } from '../lib/ids'
import { EXERCISE_CATEGORIES, searchExercises, type ExerciseCategory, type ExerciseItem } from '../lib/exercises'
import type { SessionStatus, WorkoutBlock, WorkoutFeedback, WorkoutSession } from '../types'
import { Badge, Confirm, Field, Segmented, Sheet } from './ui'

// ---------- visualizzazione ----------
const detailPills = (b: WorkoutBlock): string[] => {
  const out: string[] = []
  if (b.sets && b.reps) out.push(`${b.sets} × ${b.reps}`)
  else if (b.sets) out.push(t('{n} serie', { n: b.sets }))
  else if (b.reps) out.push(t('{n} rip.', { n: b.reps }))
  if (b.load) out.push(b.load)
  if (b.rest) out.push(t('Rec {v}', { v: b.rest }))
  for (const v of [b.duration, b.distance, b.pace, b.zone]) if (v) out.push(v)
  return out
}

export function BlockList({ blocks }: { blocks: WorkoutBlock[] }) {
  return (
    <div className="space-y-3">
      {PHASE_ORDER.map((ph) => {
        const list = blocks.filter((b) => b.phase === ph)
        if (!list.length) return null
        return (
          <div key={ph}>
            <p className="label">{t(PHASES[ph])}</p>
            <ul className="space-y-2">
              {list.map((b) => (
                <li key={b.id} className="rounded-2xl bg-bg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{b.title || t('Senza titolo')}</p>
                    {b.equipment && (
                      <span className="shrink-0 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
                        {b.equipment}
                      </span>
                    )}
                  </div>
                  {detailPills(b).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {detailPills(b).map((p, i) => (
                        <span key={i} className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-semibold">
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                  {b.notes && <p className="mt-1.5 text-xs text-muted">{b.notes}</p>}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

export function FeedbackSummary({ fb, status }: { fb: WorkoutFeedback | null; status: SessionStatus }) {
  if (status === 'planned') return null
  const feel = FEELS.find((f) => f.id === fb?.feel)
  const bits = [
    fb?.durationMin ? `${fb.durationMin}'` : '',
    fb?.distanceKm ? `${fb.distanceKm} km` : '',
    fb?.avgPace ? `${fb.avgPace} /km` : '',
    fb?.rpe ? `RPE ${fb.rpe}/10` : '',
  ].filter(Boolean)
  return (
    <div className="rounded-2xl bg-inc/10 p-3 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <Badge className={STATUS_BADGE[status]}>{t(STATUS_LABEL[status])}</Badge>
        {feel && (
          <span title={t(feel.label)}>
            {feel.emoji} <span className="text-xs text-muted">{t(feel.label)}</span>
          </span>
        )}
      </p>
      {bits.length > 0 && <p className="mt-1.5 text-muted">{bits.join(' · ')}</p>}
      {fb?.comment && (
        <p className="mt-1.5 flex gap-1.5">
          <MessageSquare size={14} className="mt-0.5 shrink-0 text-muted" />
          {fb.comment}
        </p>
      )}
    </div>
  )
}

// ---------- Registro presenze per gruppi scuola tennis ----------
export function AttendanceBox({
  members,
  attendance,
  onChange,
  canEdit,
}: {
  members: string[]
  attendance: string[]
  onChange?: (att: string[]) => void
  canEdit?: boolean
}) {
  if (!members || members.length === 0) return null
  const presentSet = new Set(attendance)
  const count = members.filter((m) => presentSet.has(m)).length

  const toggle = (m: string) => {
    if (!onChange || !canEdit) return
    const next = presentSet.has(m) ? attendance.filter((x) => x !== m) : [...attendance, m]
    onChange(next)
  }

  const markAll = () => {
    if (!onChange || !canEdit) return
    onChange([...members])
  }

  const resetAll = () => {
    if (!onChange || !canEdit) return
    onChange([])
  }

  return (
    <div className="space-y-2 rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-bold">
          <Users size={16} className="text-brand" />
          <span>{t('Registro presenze')}</span>
          <Badge className="ml-1 bg-brand/10 font-semibold text-brand">
            {count}/{members.length} {t('presenti')}
          </Badge>
        </div>
        {canEdit && onChange && (
          <div className="flex items-center gap-1">
            <button type="button" className="btn btn-soft !px-2 !py-0.5 !text-xs" onClick={markAll}>
              {t('Tutti')}
            </button>
            <button type="button" className="btn btn-soft !px-2 !py-0.5 !text-xs" onClick={resetAll}>
              {t('Azzera')}
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {members.map((m) => {
          const isPresent = presentSet.has(m)
          return (
            <button
              key={m}
              type="button"
              disabled={!canEdit || !onChange}
              onClick={() => toggle(m)}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors ${
                isPresent
                  ? 'border border-brand/40 bg-brand/15 font-semibold text-brand'
                  : 'border border-line bg-bg text-muted'
              }`}
            >
              {isPresent ? <Check size={12} className="text-brand" /> : <X size={12} className="text-muted/60" />}
              <span>{m}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function WorkoutRow({
  s,
  onClick,
  groupMembers,
}: {
  s: WorkoutSession
  onClick: () => void
  groupMembers?: string[]
}) {
  const d = DISCIPLINES[s.discipline]
  const Icon = d.icon
  const hasMembers = groupMembers && groupMembers.length > 0
  const presentCount = s.attendance ? s.attendance.length : 0

  return (
    <button onClick={onClick} className="card flex w-full items-center gap-3 p-3 text-left transition-transform active:scale-[0.98]">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${d.badge}`}>
        <Icon size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{s.title || t('Senza titolo')}</span>
        <span className="flex items-center gap-2 truncate text-xs text-muted">
          <span>{t(d.label)}</span>
          {hasMembers && (
            <span className="inline-flex items-center gap-1 font-semibold text-ink">
              <Users size={12} className="text-muted" />
              {presentCount}/{groupMembers.length}
            </span>
          )}
        </span>
      </span>
      {s.status !== 'planned' && (
        <Badge className={STATUS_BADGE[s.status]}>
          {s.status === 'done' ? <Check size={12} /> : s.status === 'skipped' ? <X size={12} /> : null}
          {t(STATUS_LABEL[s.status])}
        </Badge>
      )}
    </button>
  )
}

// ---------- dettaglio ----------
interface DetailProps {
  s: WorkoutSession | null
  onClose: () => void
  canEdit: boolean
  canLog: boolean
  onEdit: (s: WorkoutSession) => void
  onFeedback: (s: WorkoutSession) => void
  onDuplicate: (s: WorkoutSession) => void
  onDelete: (s: WorkoutSession) => void
  groupMembers?: string[]
  onAttendanceChange?: (attendance: string[]) => void
}

export function WorkoutDetail({
  s,
  onClose,
  canEdit,
  canLog,
  onEdit,
  onFeedback,
  onDuplicate,
  onDelete,
  groupMembers,
  onAttendanceChange,
}: DetailProps) {
  const [ask, setAsk] = useState(false)
  const d = s ? DISCIPLINES[s.discipline] : null
  const Icon = d?.icon

  return (
    <>
      <Sheet
        open={!!s}
        onClose={onClose}
        title={s?.title || t('Allenamento')}
        footer={
          s &&
          canLog && (
            <button className="btn btn-primary w-full !py-3" onClick={() => onFeedback(s)}>
              <Check size={18} />
              {s.status === 'planned' ? t('Completa & inserisci feedback') : t('Modifica feedback')}
            </button>
          )
        }
      >
        {s && d && Icon && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={d.badge}>
                <Icon size={12} />
                {t(d.label)}
              </Badge>
              <span className="text-xs text-muted">{fmtLong(s.date)}</span>
            </div>

            {groupMembers && groupMembers.length > 0 && (
              <AttendanceBox
                members={groupMembers}
                attendance={s.attendance ?? []}
                onChange={onAttendanceChange}
                canEdit={canEdit}
              />
            )}

            {s.coachNotes && (
              <p className="rounded-2xl bg-brand/10 p-3 text-sm">
                <span className="font-semibold text-brand">{t('Note del coach')}: </span>
                {s.coachNotes}
              </p>
            )}

            {s.blocks.length ? (
              <BlockList blocks={s.blocks} />
            ) : (
              <p className="text-sm text-muted">{t('Nessun blocco: aggiungili con Modifica.')}</p>
            )}

            <FeedbackSummary fb={s.feedback} status={s.status} />

            {canEdit && (
              <div className="flex gap-2">
                <button className="btn btn-soft flex-1" onClick={() => onEdit(s)}>
                  <Pencil size={16} />
                  {t('Modifica')}
                </button>
                <button className="btn btn-soft flex-1" onClick={() => onDuplicate(s)}>
                  <Copy size={16} />
                  {t('Duplica')}
                </button>
                <button className="btn btn-danger" onClick={() => setAsk(true)} aria-label={t('Elimina')}>
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </Sheet>
      <Confirm
        open={ask}
        title={t('Eliminare l’allenamento?')}
        text={t('L’allenamento sparirà dal piano e dai dispositivi collegati.')}
        confirmLabel={t('Elimina')}
        onConfirm={() => s && onDelete(s)}
        onClose={() => setAsk(false)}
      />
    </>
  )
}

// ---------- Selettore esercizi da catalogo FIT ----------
export function ExercisePickerSheet({
  open,
  onClose,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  onSelect: (item: ExerciseItem) => void
}) {
  const [cat, setCat] = useState<ExerciseCategory | 'all'>('all')
  const [q, setQ] = useState('')

  const list = searchExercises(q, cat)

  return (
    <Sheet open={open} onClose={onClose} title={t('Libreria esercizi FIT')}>
      <div className="space-y-3 pb-3">
        <input
          className="input"
          placeholder={t('Cerca esercizio (es. Squat, Palla medica, Scaletta...)')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            className={`chip whitespace-nowrap ${cat === 'all' ? 'chip-on' : ''}`}
            onClick={() => setCat('all')}
          >
            {t('Tutti')}
          </button>
          {EXERCISE_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chip whitespace-nowrap ${cat === c.id ? 'chip-on' : ''}`}
              onClick={() => setCat(c.id)}
            >
              {t(c.label)}
            </button>
          ))}
        </div>
        <ul className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {list.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="card flex w-full flex-col items-start gap-1 p-3 text-left transition-transform active:scale-[0.99] hover:border-brand/50"
                onClick={() => {
                  onSelect(item)
                  onClose()
                }}
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <span className="text-sm font-semibold">{item.name}</span>
                  <Badge className="shrink-0 border border-line bg-surface text-[11px] font-medium">
                    {item.equipment}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted">
                  {item.defaultSets && item.defaultReps && (
                    <span>
                      {item.defaultSets} × {item.defaultReps}
                    </span>
                  )}
                  {item.suggestedLoad && <span className="font-medium text-ink">{item.suggestedLoad}</span>}
                  {item.defaultRest && <span>Rec {item.defaultRest}</span>}
                </div>
                {item.notes && <p className="line-clamp-1 text-[11px] italic text-muted">{item.notes}</p>}
              </button>
            </li>
          ))}
          {!list.length && <p className="p-4 text-center text-sm text-muted">{t('Nessun esercizio trovato.')}</p>}
        </ul>
      </div>
    </Sheet>
  )
}

// ---------- editor ----------
const BLOCK_FIELDS: { key: keyof WorkoutBlock; label: string; ph: string }[] = [
  { key: 'sets', label: T('Serie'), ph: '4' },
  { key: 'reps', label: T('Ripetizioni'), ph: '6' },
  { key: 'load', label: T('Carico / Impostazioni'), ph: T('es. Manubri da 12 kg, Bilanciere 40 kg') },
  { key: 'rest', label: T('Recupero'), ph: "90''" },
  { key: 'duration', label: T('Durata'), ph: "20'" },
  { key: 'distance', label: T('Distanza'), ph: '800 m' },
  { key: 'pace', label: T('Passo target'), ph: '4:50 /km' },
  { key: 'zone', label: T('Zona cardio'), ph: 'Z2' },
]

interface EditorProps {
  open: boolean
  initial: WorkoutSession | null
  onClose: () => void
  onSave: (s: WorkoutSession) => void
  suggestions: string[]
  groupMembers?: string[]
}

export function WorkoutEditor({ open, initial, onClose, onSave, suggestions, groupMembers }: EditorProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial && initial.title ? t('Modifica allenamento') : t('Nuovo allenamento')}
    >
      {open && initial && (
        <EditorForm
          key={initial.id}
          initial={initial}
          onSave={onSave}
          onClose={onClose}
          suggestions={suggestions}
          groupMembers={groupMembers}
        />
      )}
    </Sheet>
  )
}

function EditorForm({
  initial,
  onSave,
  onClose,
  suggestions,
  groupMembers,
}: {
  initial: WorkoutSession
  onSave: (s: WorkoutSession) => void
  onClose: () => void
  suggestions: string[]
  groupMembers?: string[]
}) {
  const [s, setS] = useState<WorkoutSession>(initial)
  const [showSug, setShowSug] = useState(false)
  const [pickerPhase, setPickerPhase] = useState<WorkoutBlock['phase'] | null>(null)

  const sug = useMemo(() => {
    const q = s.title.trim().toLowerCase()
    return suggestions.filter((x) => x.toLowerCase().includes(q) && x.toLowerCase() !== q).slice(0, 5)
  }, [s.title, suggestions])

  const patchBlock = (id: string, p: Partial<WorkoutBlock>) =>
    setS({ ...s, blocks: s.blocks.map((b) => (b.id === id ? { ...b, ...p } : b)) })

  const addBlock = (phase: WorkoutBlock['phase']) =>
    setS({ ...s, blocks: [...s.blocks, { id: uid('b-'), phase, title: '' }] })

  const addFromLibrary = (phase: WorkoutBlock['phase'], item: ExerciseItem) => {
    setS({
      ...s,
      blocks: [
        ...s.blocks,
        {
          id: uid('b-'),
          phase,
          title: item.name,
          sets: item.defaultSets,
          reps: item.defaultReps,
          rest: item.defaultRest,
          load: item.suggestedLoad,
          notes: item.notes,
          equipment: item.equipment,
        },
      ],
    })
  }

  const valid = s.title.trim().length > 0

  return (
    <div className="space-y-4 pb-2">
      <div className="relative">
        <Field label={t('Titolo')}>
          <input
            className="input"
            value={s.title}
            placeholder={t('es. Forza funzionale & Core')}
            onChange={(e) => setS({ ...s, title: e.target.value })}
            onFocus={() => setShowSug(true)}
            onBlur={() => setTimeout(() => setShowSug(false), 250)}
          />
        </Field>
        {showSug && sug.length > 0 && (
          <ul className="card absolute inset-x-0 top-full z-10 mt-1 overflow-hidden">
            {sug.map((x) => (
              <li key={x}>
                <button
                  type="button"
                  className="w-full px-3.5 py-2.5 text-left text-sm active:bg-line/40"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    setS({ ...s, title: x })
                    setShowSug(false)
                  }}
                >
                  {x}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Field label={t('Data')}>
        <input
          type="date"
          className="input"
          value={s.date}
          onChange={(e) => e.target.value && setS({ ...s, date: e.target.value })}
        />
      </Field>

      <div>
        <span className="label">{t('Disciplina')}</span>
        <div className="flex flex-wrap gap-2">
          {DISCIPLINE_ORDER.map((k) => {
            const Icon = DISCIPLINES[k].icon
            return (
              <button
                key={k}
                type="button"
                className={`chip ${s.discipline === k ? 'chip-on' : ''}`}
                onClick={() => setS({ ...s, discipline: k })}
              >
                <Icon size={14} />
                {t(DISCIPLINES[k].label)}
              </button>
            )
          })}
        </div>
      </div>

      {groupMembers && groupMembers.length > 0 && (
        <AttendanceBox
          members={groupMembers}
          attendance={s.attendance ?? []}
          onChange={(att) => setS({ ...s, attendance: att })}
          canEdit={true}
        />
      )}

      {PHASE_ORDER.map((ph) => (
        <div key={ph} className="space-y-2">
          <p className="label">{t(PHASES[ph])}</p>
          {s.blocks
            .filter((b) => b.phase === ph)
            .map((b) => (
              <div key={b.id} className="space-y-2 rounded-2xl border border-line bg-surface p-3">
                <div className="flex items-center gap-2">
                  <input
                    className="input font-medium"
                    value={b.title}
                    placeholder={t('Nome esercizio')}
                    aria-label={t('Nome esercizio')}
                    onChange={(e) => patchBlock(b.id, { title: e.target.value })}
                  />
                  <button
                    type="button"
                    className="icon-btn !text-exp"
                    aria-label={t('Rimuovi blocco')}
                    onClick={() => setS({ ...s, blocks: s.blocks.filter((x) => x.id !== b.id) })}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {BLOCK_FIELDS.map((f) => (
                    <label key={f.key} className="block">
                      <span className="text-[11px] font-semibold text-muted">{t(f.label)}</span>
                      <input
                        className="input !py-2"
                        value={(b[f.key] as string | undefined) ?? ''}
                        placeholder={t(f.ph)}
                        onChange={(e) => patchBlock(b.id, { [f.key]: e.target.value })}
                      />
                    </label>
                  ))}
                </div>
                <input
                  className="input !py-2"
                  value={b.notes ?? ''}
                  placeholder={t('Note tecniche esercizio')}
                  aria-label={t('Note tecniche esercizio')}
                  onChange={(e) => patchBlock(b.id, { notes: e.target.value })}
                />
              </div>
            ))}
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary flex-1 !py-2.5 !text-xs"
              onClick={() => setPickerPhase(ph)}
            >
              <Dumbbell size={15} />
              {t('Scegli da libreria esercizi')}
            </button>
            <button
              type="button"
              className="btn btn-soft flex-1 !py-2.5 !text-xs"
              onClick={() => addBlock(ph)}
            >
              <CirclePlus size={15} />
              {t('Esercizio personalizzato')}
            </button>
          </div>
        </div>
      ))}

      <Field label={t('Note tecniche del coach')}>
        <textarea
          className="input min-h-20"
          value={s.coachNotes}
          placeholder={t('Obiettivi della sessione, raccomandazioni per il gruppo o per l’atleta…')}
          onChange={(e) => setS({ ...s, coachNotes: e.target.value })}
        />
      </Field>

      <div className="flex gap-2 pt-1">
        <button type="button" className="btn btn-soft flex-1" onClick={onClose}>
          {t('Annulla')}
        </button>
        <button
          type="button"
          className="btn btn-primary flex-1"
          disabled={!valid}
          onClick={() => {
            onSave({
              ...s,
              title: s.title.trim(),
              blocks: s.blocks.filter((b) => b.title.trim() || b.notes || b.distance || b.duration || b.load),
            })
            onClose()
          }}
        >
          {t('Salva')}
        </button>
      </div>

      <ExercisePickerSheet
        open={pickerPhase !== null}
        onClose={() => setPickerPhase(null)}
        onSelect={(item) => {
          if (pickerPhase) addFromLibrary(pickerPhase, item)
        }}
      />
    </div>
  )
}

// ---------- feedback post-allenamento ----------
export function FeedbackSheet({
  s,
  onClose,
  onSave,
}: {
  s: WorkoutSession | null
  onClose: () => void
  onSave: (status: SessionStatus, fb: WorkoutFeedback | null) => void
}) {
  return (
    <Sheet open={!!s} onClose={onClose} title={t('Com’è andata?')}>
      {s && <FeedbackForm key={s.id} s={s} onSave={onSave} onClose={onClose} />}
    </Sheet>
  )
}

function FeedbackForm({
  s,
  onSave,
  onClose,
}: {
  s: WorkoutSession
  onSave: (status: SessionStatus, fb: WorkoutFeedback | null) => void
  onClose: () => void
}) {
  const fb = s.feedback
  const [status, setStatus] = useState<SessionStatus>(s.status === 'planned' ? 'done' : s.status)
  const [dur, setDur] = useState(fb?.durationMin?.toString() ?? '')
  const [rpe, setRpe] = useState<number | undefined>(fb?.rpe)
  const [feel, setFeel] = useState(fb?.feel)
  const [comment, setComment] = useState(fb?.comment ?? '')
  const skipped = status === 'skipped'

  const save = () => {
    onSave(status, {
      durationMin: skipped ? undefined : parseNum(dur),
      distanceKm: fb?.distanceKm,
      avgPace: fb?.avgPace,
      rpe: skipped ? undefined : rpe,
      feel,
      comment: comment.trim() || undefined,
      loggedAt: '',
    })
    onClose()
  }

  return (
    <div className="space-y-4 pb-2">
      <Segmented
        id="fb-status"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'done', label: t('Completato') },
          { value: 'partial', label: t('Parziale') },
          { value: 'skipped', label: t('Saltato') },
        ]}
      />
      {!skipped && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('Durata (min)')}>
              <input className="input" inputMode="decimal" value={dur} onChange={(e) => setDur(e.target.value)} />
            </Field>
            <div>
              <span className="label">{t('Sforzo (RPE 1-10)')}</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="input font-bold"
                  placeholder="1-10"
                  value={rpe ?? ''}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    setRpe(Number.isFinite(v) ? Math.min(10, Math.max(1, v)) : undefined)
                  }}
                />
              </div>
            </div>
          </div>
          <div>
            <span className="label">{t('Sforzo percepito (RPE)')}</span>
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={rpe === n}
                  onClick={() => setRpe(rpe === n ? undefined : n)}
                  className={`chip justify-center !px-0 ${rpe === n ? 'chip-on' : ''}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <div>
        <span className="label">{t('Sensazioni')}</span>
        <div className="flex flex-wrap gap-2">
          {FEELS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={feel === f.id}
              onClick={() => setFeel(feel === f.id ? undefined : f.id)}
              className={`chip ${feel === f.id ? 'chip-on' : ''}`}
            >
              <span aria-hidden>{f.emoji}</span>
              {t(f.label)}
            </button>
          ))}
        </div>
      </div>
      <Field label={t('Commento per il coach')}>
        <textarea
          className="input min-h-20"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t('Come ti sei sentito, carichi usati, affaticamento, dettagli utili…')}
        />
      </Field>
      <div className="flex gap-2">
        <button type="button" className="btn btn-soft flex-1" onClick={onClose}>
          {t('Annulla')}
        </button>
        <button type="button" className="btn btn-primary flex-1" onClick={save}>
          {t('Salva')}
        </button>
      </div>
    </div>
  )
}

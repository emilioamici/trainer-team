import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  Copy,
  Mail,
  Plus,
  Share2,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react'
import { t } from '../i18n'
import { copyText } from '../lib/files'
import { slug, uid } from '../lib/ids'
import { updateAthlete } from '../lib/db'
import { useEngine } from '../state/store'
import type { ScheduleSlot, TargetKind } from '../types'
import { Badge, Confirm, Field, Notice, Segmented, Sheet, Toggle } from './ui'
import {
  GROUP_COLORS,
  GROUP_ICONS,
  WEEK_DAYS,
  WEEK_DAYS_SHORT,
  findScheduleConflicts,
  formatSchedule,
  getGroupColor,
  getGroupIcon,
  parseScheduleToSlots,
  sortScheduleSlots,
} from '../lib/branding'

const DEFAULT_POOL = [
  'Matteo B.',
  'Sofia V.',
  'Leonardo T.',
  'Edoardo F.',
  'Giulia R.',
  'Federico M.',
  'Alice B.',
  'Marco P.',
]

// ---------- Selettore colore e icona ----------
export function ColorIconPicker({
  color,
  icon,
  onColorChange,
  onIconChange,
  isGroup = true,
}: {
  color: string
  icon: string
  onColorChange: (c: string) => void
  onIconChange: (i: string) => void
  isGroup?: boolean
}) {
  const currentColor = getGroupColor(color, isGroup)
  const CurrentIcon = getGroupIcon(icon, isGroup)

  return (
    <div className="space-y-2.5 rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-muted">
          {isGroup ? t('Icona e Colore del gruppo') : t('Icona e Colore dell’atleta')}
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`flex h-7 w-7 items-center justify-center rounded-xl border ${currentColor.bg} ${currentColor.border}`}>
            <CurrentIcon size={16} className={currentColor.text} />
          </span>
          <span className="text-xs font-semibold text-ink">{currentColor.name}</span>
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-[11px] font-semibold text-muted">{t('Colore tema:')}</span>
        <div className="flex flex-wrap items-center gap-2.5 py-1">
          {GROUP_COLORS.map((c) => {
            const active = color === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onColorChange(c.id)}
                title={c.name}
                className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all active:scale-90 ${
                  active
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-surface shadow-sm scale-105'
                    : 'opacity-85 hover:opacity-100 hover:scale-105'
                }`}
                style={{ backgroundColor: c.hex }}
              >
                {active && <Check size={13} className="text-white drop-shadow-sm" strokeWidth={3} />}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-[11px] font-semibold text-muted">{t('Icona:')}</span>
        <div className="flex flex-wrap items-center gap-2 py-1">
          {GROUP_ICONS.map((i) => {
            const IconComp = i.icon
            const active = icon === i.id
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => onIconChange(i.id)}
                title={i.label}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-all active:scale-90 ${
                  active
                    ? 'border-brand bg-brand text-onbrand shadow-sm scale-105'
                    : 'border-line bg-bg text-muted hover:border-brand/40 hover:text-ink hover:scale-105'
                }`}
              >
                <IconComp size={16} />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------- Selettore giorni e orari con alert conflitti ----------
export function ScheduleSlotEditor({
  slots,
  onChange,
  otherGroups,
  currentId,
}: {
  slots: ScheduleSlot[]
  onChange: (slots: ScheduleSlot[]) => void
  otherGroups: Array<{ id: string; name: string; scheduleSlots?: ScheduleSlot[]; schedule?: string }>
  currentId?: string
}) {
  const conflicts = useMemo(
    () => findScheduleConflicts(slots, otherGroups, currentId),
    [slots, otherGroups, currentId]
  )

  const toggleDay = (day: string) => {
    const exists = slots.some((s) => s.day === day)
    if (exists) {
      onChange(slots.filter((s) => s.day !== day))
    } else {
      onChange(
        sortScheduleSlots([
          ...slots,
          {
            id: uid('slot-'),
            day,
            startTime: '15:30',
            endTime: '17:00',
          },
        ])
      )
    }
  }

  const updateSlot = (id: string, patch: Partial<ScheduleSlot>) => {
    onChange(slots.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const removeSlot = (id: string) => {
    onChange(slots.filter((s) => s.id !== id))
  }

  const sortedSlots = useMemo(() => sortScheduleSlots(slots), [slots])

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-muted">
          {t('Giorni e orari in palestra')}
        </span>
      </div>

      {/* Selezione rapida giorni della settimana */}
      <div className="flex flex-wrap gap-1.5">
        {WEEK_DAYS.map((day) => {
          const active = slots.some((s) => s.day === day)
          const short = WEEK_DAYS_SHORT[day] || day
          return (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              className={`chip whitespace-nowrap !py-1.5 !px-3 !text-xs ${
                active ? 'chip-on' : ''
              }`}
            >
              {short}
            </button>
          )
        })}
      </div>

      {/* Righe con selettore orario (time picker) per ciascun giorno */}
      {sortedSlots.length > 0 ? (
        <div className="space-y-2 pt-1">
          {sortedSlots.map((slot) => (
            <div
              key={slot.id}
              className="flex items-center gap-2 rounded-xl border border-line bg-bg p-2 text-xs"
            >
              <span className="w-24 shrink-0 font-bold text-ink truncate">{slot.day}</span>
              <div className="flex flex-1 items-center gap-1 min-w-0">
                <input
                  type="time"
                  className="input !py-1 !px-2 text-xs font-semibold min-w-0 flex-1 text-center"
                  value={slot.startTime}
                  onChange={(e) => updateSlot(slot.id, { startTime: e.target.value })}
                  aria-label={t('Ora inizio')}
                />
                <span className="text-muted font-bold">–</span>
                <input
                  type="time"
                  className="input !py-1 !px-2 text-xs font-semibold min-w-0 flex-1 text-center"
                  value={slot.endTime}
                  onChange={(e) => updateSlot(slot.id, { endTime: e.target.value })}
                  aria-label={t('Ora fine')}
                />
              </div>
              <button
                type="button"
                className="icon-btn !text-exp shrink-0 !min-h-7 !min-w-7 !p-1"
                onClick={() => removeSlot(slot.id)}
                aria-label={t('Rimuovi fascia oraria')}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">
          {t('Seleziona uno o più giorni per definire gli orari della sessione in palestra.')}
        </p>
      )}

      {/* Banner giallo di allerta conflitti se il giorno/orario è già occupato per un'altra sezione */}
      {conflicts.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {conflicts.map((c, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 p-2.5 text-xs font-semibold text-amber-800 dark:text-amber-300"
            >
              <AlertTriangle size={16} className="shrink-0 text-amber-500" />
              <span>
                {t('Attenzione: {day} ({time}) è già occupato per il gruppo "{group}"', {
                  day: c.slot.day,
                  time: `${c.slot.startTime} - ${c.slot.endTime}`,
                  group: c.conflictingGroupName,
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- Gestore componenti del gruppo con filtro e aggiunta in alto ----------
export function GroupMembersSelector({
  selectedMembers,
  onChange,
  allAthletesPool,
}: {
  selectedMembers: string[]
  onChange: (members: string[]) => void
  allAthletesPool: string[]
}) {
  const [filter, setFilter] = useState('')
  const [customAthletes, setCustomAthletes] = useState<string[]>([])

  const fullPool = useMemo(() => {
    return Array.from(
      new Set([...allAthletesPool, ...customAthletes, ...selectedMembers])
    ).filter(Boolean)
  }, [allAthletesPool, customAthletes, selectedMembers])

  const q = filter.trim().toLowerCase()
  const filtered = fullPool.filter((name) => !q || name.toLowerCase().includes(q))

  const toggle = (name: string) => {
    onChange(
      selectedMembers.includes(name)
        ? selectedMembers.filter((x) => x !== name)
        : [...selectedMembers, name]
    )
  }

  const handleAdd = () => {
    const v = filter.trim()
    if (!v) return
    if (!customAthletes.includes(v)) {
      setCustomAthletes((prev) => [...prev, v])
    }
    if (!selectedMembers.includes(v)) {
      onChange([...selectedMembers, v])
    }
    setFilter('')
  }

  return (
    <div className="space-y-2.5 rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">
          {t('Componenti del gruppo ({n} selezionati)', { n: selectedMembers.length })}
        </span>
      </div>

      {/* Box di ricerca / aggiunta atleta posizionato in alto sopra alla lista */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            className="input !py-2 !pr-8 text-xs"
            placeholder={t('Cerca allievo o scrivi un nuovo nome...')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAdd()
              }
            }}
          />
          {filter && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-ink"
              onClick={() => setFilter('')}
              aria-label={t('Cancella')}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary !px-3.5 !py-2 !text-xs shrink-0"
          disabled={!filter.trim()}
          onClick={handleAdd}
        >
          <Plus size={14} />
          {t('Aggiungi')}
        </button>
      </div>

      {/* Elenco atleti con spunta/selezione rapida */}
      <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto pt-1">
        {filtered.map((athleteName) => {
          const active = selectedMembers.includes(athleteName)
          return (
            <button
              key={athleteName}
              type="button"
              onClick={() => toggle(athleteName)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
                active
                  ? 'bg-brand text-onbrand shadow-sm'
                  : 'border border-line bg-bg text-ink hover:border-brand/40'
              }`}
            >
              {active ? <Check size={13} strokeWidth={2.4} /> : <Plus size={13} />}
              {athleteName}
            </button>
          )
        })}
        {!filtered.length && (
          <div className="w-full py-2 text-center text-xs text-muted">
            {t('Nessun allievo trovato.')}{' '}
            <span
              className="font-semibold text-brand cursor-pointer underline"
              onClick={handleAdd}
            >
              {t('Aggiungi "{name}" alla lista', { name: filter.trim() })}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Creazione nuovo atleta / gruppo ----------
export function NewAthleteSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (sourceId: string) => void
}) {
  const e = useEngine()
  const [kind, setKind] = useState<TargetKind>('group')
  const [name, setName] = useState('')
  const [focus, setFocus] = useState('')
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [color, setColor] = useState('blue')
  const [icon, setIcon] = useState('users')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  const isGroup = kind === 'group'
  const valid =
    name.trim().length > 0 &&
    (isGroup || !email.trim() || /^\S+@\S+\.\S+$/.test(email.trim()))

  // Pool di atleti conosciuti dalla scuola tennis
  const allAthletesPool = useMemo(
    () =>
      Array.from(
        new Set([
          ...DEFAULT_POOL,
          ...e.registry.athletes.map((a) => a.name),
          ...e.sources().flatMap((s) => e.dbOf(s.id)?.athlete.members ?? []),
        ])
      ).filter(Boolean),
    [e]
  )

  // Altri gruppi per il rilevamento conflitti orari
  const otherGroups = useMemo(() => {
    return e
      .sources()
      .map((s) => {
        const d = e.dbOf(s.id)
        if (!d) return null
        return {
          id: s.id,
          name: d.athlete.name,
          scheduleSlots: d.athlete.scheduleSlots,
          schedule: d.athlete.schedule,
          targetKind: d.athlete.targetKind,
        }
      })
      .filter((g): g is NonNullable<typeof g> => !!g && g.targetKind === 'group')
  }, [e])

  const handleKindChange = (k: TargetKind) => {
    setKind(k)
    if (k === 'group') {
      setColor('blue')
      setIcon('users')
    } else {
      setColor('yellow')
      setIcon('trophy')
    }
  }

  const go = async () => {
    setBusy(true)
    const members = isGroup ? selectedMembers : []
    const scheduleStr = formatSchedule(slots)

    const s = await e.addAthlete({
      name,
      focus: focus.trim() || (isGroup ? t('Scuola Tennis') : t('Individual Athlete')),
      email: isGroup ? '' : email,
      targetKind: kind,
      members,
      schedule: scheduleStr,
      color,
      icon,
      scheduleSlots: slots,
    })
    setBusy(false)
    setName('')
    setFocus('')
    setSlots([])
    setColor('blue')
    setIcon('users')
    setSelectedMembers([])
    setEmail('')
    onClose()
    onCreated(s.id)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isGroup ? t('Nuovo gruppo scuola tennis') : t('Nuovo Individual Athlete')}
      footer={
        <button className="btn btn-primary w-full !py-3" disabled={!valid || busy} onClick={go}>
          {isGroup ? t('Crea gruppo') : t('Crea atleta')}
        </button>
      }
    >
      <div className="space-y-3 pb-2">
        <Segmented
          id="target-kind"
          value={kind}
          onChange={handleKindChange}
          options={[
            { value: 'group', label: t('Gruppo Scuola Tennis') },
            { value: 'individual', label: t('Individual Athlete') },
          ]}
        />

        {isGroup ? (
          <>
            <Field label={t('Nome del gruppo')}>
              <input
                className="input"
                placeholder={t('es. Agonistica U16 - Gruppo A')}
                value={name}
                onChange={(ev) => setName(ev.target.value)}
                autoFocus
              />
            </Field>

            {/* Goal spostato direttamente sotto al Nome del gruppo */}
            <Field label={t('Obiettivo / Programma atletico')}>
              <input
                className="input"
                placeholder={t('es. Forza funzionale, footwork e prevenzione')}
                value={focus}
                onChange={(ev) => setFocus(ev.target.value)}
              />
            </Field>

            {/* Selezione giorni e orari con time picker e alert conflitti */}
            <ScheduleSlotEditor
              slots={slots}
              onChange={setSlots}
              otherGroups={otherGroups}
            />

            {/* Icona e colore del gruppo */}
            <ColorIconPicker
              color={color}
              icon={icon}
              onColorChange={setColor}
              onIconChange={setIcon}
              isGroup={true}
            />

            {/* Componenti del gruppo con filtro e inserimento in alto */}
            <GroupMembersSelector
              selectedMembers={selectedMembers}
              onChange={setSelectedMembers}
              allAthletesPool={allAthletesPool}
            />

            <p className="text-xs text-muted">
              {t(
                'Per questo gruppo potrai registrare le presenze sessione per sessione direttamente sul campo o in palestra.'
              )}
            </p>
          </>
        ) : (
          <>
            <Field label={t('Nome atleta')}>
              <input
                className="input"
                placeholder={t('es. Lorenzo Sarti (ATP)')}
                value={name}
                onChange={(ev) => setName(ev.target.value)}
                autoFocus
              />
            </Field>

            <Field label={t('Categoria / Obiettivo')}>
              <input
                className="input"
                placeholder={t('es. Individual Athlete ATP · Potenza & Prevenzione')}
                value={focus}
                onChange={(ev) => setFocus(ev.target.value)}
              />
            </Field>

            <ColorIconPicker
              color={color}
              icon={icon}
              onColorChange={setColor}
              onIconChange={setIcon}
              isGroup={false}
            />

            <Field label={t('Email Google dell’atleta (facoltativa per invito)')}>
              <input
                className="input"
                type="email"
                placeholder="atleta@gmail.com"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                autoCapitalize="none"
              />
            </Field>
            <p className="text-xs text-muted">
              {t(
                'L’atleta potrà collegarsi con il proprio account Google, consultare gli esercizi e i carichi assegnati (es. manubri 12kg) e registrare i feedback.'
              )}
            </p>
          </>
        )}
      </div>
    </Sheet>
  )
}

// ---------- Gestione / Modifica atleta o gruppo esistente ----------
export function ManageAthleteSheet({
  sourceId,
  onClose,
  onOpenImportExport,
}: {
  sourceId: string | null
  onClose: () => void
  onOpenImportExport?: (sourceId: string) => void
}) {
  const e = useEngine()
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const src = sourceId ? e.sources().find((s) => s.id === sourceId) : null
  const db = sourceId ? e.dbOf(sourceId) : null
  const real = src?.kind === 'coach-athlete'
  const athleteId = src?.id.replace('athlete:', '') ?? ''
  const info = real ? e.inviteInfo(athleteId) : null
  const entry = real ? e.registry.athletes.find((x) => x.athleteId === athleteId) : null
  useEffect(() => { if (entry?.fileId) void e.registerHouses(false, entry.fileId) }, [entry?.fileId]) // eslint-disable-line react-hooks/exhaustive-deps

  const isGroup =
    db?.athlete.targetKind === 'group' || (db?.athlete.members && db.athlete.members.length > 0)
  const members = db?.athlete.members ?? []

  const currentSlots: ScheduleSlot[] = useMemo(() => {
    if (!db) return []
    if (db.athlete.scheduleSlots && db.athlete.scheduleSlots.length > 0) {
      return db.athlete.scheduleSlots
    }
    return parseScheduleToSlots(db.athlete.schedule)
  }, [db])

  // Pool di atleti della scuola tennis
  const allAthletesPool = useMemo(
    () =>
      Array.from(
        new Set([
          ...DEFAULT_POOL,
          ...e.registry.athletes.map((a) => a.name),
          ...e.sources().flatMap((s) => e.dbOf(s.id)?.athlete.members ?? []),
        ])
      ).filter(Boolean),
    [e]
  )

  // Altri gruppi per rilevare conflitti orari
  const otherGroups = useMemo(() => {
    return e
      .sources()
      .map((s) => {
        const d = e.dbOf(s.id)
        if (!d) return null
        return {
          id: s.id,
          name: d.athlete.name,
          scheduleSlots: d.athlete.scheduleSlots,
          schedule: d.athlete.schedule,
          targetKind: d.athlete.targetKind,
        }
      })
      .filter((g): g is NonNullable<typeof g> => !!g && g.targetKind === 'group')
  }, [e])

  const patch = (p: Parameters<typeof updateAthlete>[1]) =>
    src && e.mutate(src.id, (d) => updateAthlete(d, p, e.by()))

  const handleSlotsChange = (nextSlots: ScheduleSlot[]) => {
    patch({
      scheduleSlots: nextSlots,
      schedule: formatSchedule(nextSlots),
    })
  }

  const inviteCode =
    info?.code || (real ? athleteId : `DEMO-${slug(db?.athlete.name ?? 'atleta')}`)
  const inviteUrl = info?.link || `${location.origin}${location.pathname}#join=${inviteCode}`

  const inviteByEmail = async () => {
    const targetEmail = emailInput.trim() || db?.athlete.email || ''
    if (!targetEmail) return
    setBusy(true)
    setErr('')
    try {
      if (targetEmail !== db?.athlete.email) {
        patch({ email: targetEmail.toLowerCase() })
      }
      const r = await e.inviteAthlete(athleteId)
      e.notify(
        r.emailed
          ? t('Invito inviato: il file è stato condiviso con l’atleta')
          : t('Invito pronto: copia il link o il codice')
      )
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x))
    }
    setBusy(false)
  }

  const copy = async (s: string) =>
    e.notify((await copyText(s)) ? t('Copiato') : t('Copia non riuscita'), 'info')

  const share = (link: string) => {
    if (navigator.share) {
      void navigator
        .share({ title: 'Trainer Team', text: t('Ecco il tuo piano di allenamento'), url: link })
        .catch(() => undefined)
    } else {
      void copy(link)
    }
  }

  return (
    <>
      <Sheet open={!!src && !!db} onClose={onClose} title={db?.athlete.name ?? ''}>
        {src && db && (
          <div className="space-y-4 pb-2">
            <div className="flex items-center gap-2">
              <Badge className={isGroup ? 'bg-brand/10 text-brand font-bold' : 'bg-warn/15 text-warn font-bold'}>
                {isGroup ? <Users size={12} /> : <User size={12} />}
                {isGroup ? t('Gruppo Scuola Tennis') : t('Individual Athlete')}
              </Badge>
              {db.athlete.schedule && <span className="text-xs text-muted">{db.athlete.schedule}</span>}
            </div>

            <Field label={isGroup ? t('Nome gruppo') : t('Nome atleta')}>
              <input
                className="input"
                value={db.athlete.name}
                onChange={(ev) => patch({ name: ev.target.value })}
              />
            </Field>

            {/* Goal spostato subito sotto il nome */}
            <Field label={t('Obiettivo / Programma atletico')}>
              <input
                className="input"
                value={db.athlete.focus}
                onChange={(ev) => patch({ focus: ev.target.value })}
              />
            </Field>

            {/* Giorni e orari in palestra per i gruppi con datepicker e time picker */}
            {isGroup && (
              <ScheduleSlotEditor
                slots={currentSlots}
                onChange={handleSlotsChange}
                otherGroups={otherGroups}
                currentId={src.id}
              />
            )}

            {/* Icona e colore personalizzato */}
            <ColorIconPicker
              color={db.athlete.color ?? (isGroup ? 'blue' : 'yellow')}
              icon={db.athlete.icon ?? (isGroup ? 'users' : 'trophy')}
              onColorChange={(c) => patch({ color: c })}
              onIconChange={(i) => patch({ icon: i })}
              isGroup={isGroup}
            />

            {/* Componenti del gruppo con filtro e aggiunta in alto */}
            {isGroup && (
              <GroupMembersSelector
                selectedMembers={members}
                onChange={(m) => patch({ members: m })}
                allAthletesPool={allAthletesPool}
              />
            )}

            {/* Condivisione codice invito (come in clean-duo, meal-duo e money-duo) */}
            <div className="space-y-3 rounded-2xl border border-line bg-surface p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Share2 size={16} className="text-brand" />
                  <span className="text-sm font-bold">
                    {isGroup ? t('Codice invito gruppo') : t('Codice invito per l’atleta')}
                  </span>
                </div>
                {entry?.invitedAt && (
                  <Badge className="bg-inc/15 text-[10px] font-bold text-inc">
                    <Check size={10} />
                    {t('Invitato')}
                  </Badge>
                )}
              </div>

              <div>
                <label className="label !mt-0 !text-[11px]">{t('Codice invito')}</label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    className="input flex-1 select-all font-mono !py-1.5 !text-xs"
                    value={inviteCode}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    type="button"
                    className="btn btn-soft !px-3 !py-1.5"
                    aria-label={t('Copia codice')}
                    onClick={async () => {
                      const ok = await copyText(inviteCode)
                      if (ok) {
                        setCopiedCode(true)
                        setTimeout(() => setCopiedCode(false), 1500)
                        e.notify(t('Codice copiato negli appunti'))
                      }
                    }}
                  >
                    {copiedCode ? <Check size={15} className="text-inc" /> : <Copy size={15} />}
                  </button>
                </div>
                <p className="mt-1 px-1 text-xs text-muted">
                  {t(
                    'Il codice da dare all’atleta: dopo l’accesso lo incolla in «Collegati a un Coach».'
                  )}
                </p>
                {real && (e.bridgeReady()
                  ? <p className="mt-1 px-1 text-xs text-inc">{t('Il codice basta: il file viene condiviso in automatico con l’account Google di chi lo inserisce. Chi ha il codice può entrare: non pubblicarlo.')}</p>
                  : <Notice kind="warn">{t('Il solo codice non basta: serve il server (Worker) con il ponte e il tuo accesso persistente. Altrimenti inserisci l’email Google dell’atleta qui sotto e tocca «Invia».')}</Notice>)}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-soft flex-1 !py-2 !text-xs"
                  onClick={async () => {
                    const ok = await copyText(inviteUrl)
                    if (ok) {
                      setCopiedLink(true)
                      setTimeout(() => setCopiedLink(false), 1500)
                      e.notify(t('Link invito copiato'))
                    }
                  }}
                >
                  {copiedLink ? <Check size={14} className="text-inc" /> : <Copy size={14} />}
                  {t('Copia link')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary flex-1 !py-2 !text-xs"
                  onClick={() => share(inviteUrl)}
                >
                  <Share2 size={14} />
                  {t('Condividi')}
                </button>
              </div>

              {real && (
                <div className="space-y-2 border-t border-line/60 pt-2.5">
                  <label className="label !mt-0 !text-[11px]">
                    {t('Invia invito via email (Google Drive)')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      className="input flex-1 !py-1.5 !text-xs"
                      type="email"
                      placeholder={t('Email Google dell’atleta')}
                      defaultValue={db.athlete.email ?? ''}
                      onChange={(ev) => setEmailInput(ev.target.value.trim().toLowerCase())}
                    />
                    <button
                      type="button"
                      className="btn btn-soft whitespace-nowrap !px-3 !py-1.5 !text-xs"
                      disabled={busy || !e.isAuthed()}
                      onClick={inviteByEmail}
                    >
                      <Mail size={14} />
                      {t('Invia')}
                    </button>
                  </div>
                  {!e.isAuthed() ? (
                    <p className="text-xs text-warn">
                      {t('Collega prima Google nelle Impostazioni per inviare inviti automatici via Drive.')}
                    </p>
                  ) : (
                    <p className="text-xs text-muted">
                      {t('L’invito via email condivide direttamente il file su Google Drive dell’atleta.')}
                    </p>
                  )}
                </div>
              )}
            </div>

            {!isGroup && (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-bg p-3">
                <div>
                  <p className="font-semibold">{t('L’atleta può modificare gli allenamenti')}</p>
                  <p className="text-xs text-muted">
                    {t('Se spento, l’atleta vede il piano e registra i completamenti e i feedback.')}
                  </p>
                </div>
                <Toggle
                  checked={db.athlete.athleteCanEdit}
                  onChange={(v) => patch({ athleteCanEdit: v })}
                  label={t('L’atleta può modificare gli allenamenti')}
                />
              </div>
            )}

            <div className="space-y-2">
              <p className="label">{t('Piano di allenamento (JSON)')}</p>
              <button
                className="btn btn-soft w-full"
                onClick={() => {
                  onOpenImportExport?.(src.id)
                  onClose()
                }}
              >
                <ArrowUpDown size={16} />
                {t('Importa / Esporta piano')}
              </button>
            </div>

            {real && (
              <div className="space-y-2 pt-2">
                {err && <Notice kind="exp">{err}</Notice>}
                <button className="btn btn-danger w-full" onClick={() => setAsk(true)}>
                  <Trash2 size={16} />
                  {isGroup ? t('Rimuovi gruppo') : t('Rimuovi atleta')}
                </button>
              </div>
            )}
            {!real && (
              <Notice kind="trf">{t('Esempio dimostrativo: serve solo per provare l’app.')}</Notice>
            )}
          </div>
        )}
      </Sheet>
      <Confirm
        open={ask}
        title={isGroup ? t('Rimuovere il gruppo?') : t('Rimuovere l’atleta?')}
        text={t(
          'L’elemento sparirà dalla tua lista. Il file su Drive non viene cancellato: puoi toglierne l’accesso da Drive.'
        )}
        confirmLabel={t('Rimuovi')}
        onConfirm={() => {
          e.removeAthlete(athleteId)
          onClose()
        }}
        onClose={() => setAsk(false)}
      />
    </>
  )
}

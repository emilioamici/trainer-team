import { useState } from 'react'
import {
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
import { slug } from '../lib/ids'
import { updateAthlete } from '../lib/db'
import { useEngine } from '../state/store'
import type { TargetKind } from '../types'
import { Badge, Confirm, Field, Notice, Segmented, Sheet, Toggle } from './ui'

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
  const [schedule, setSchedule] = useState('')
  const [focus, setFocus] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [customMemberInput, setCustomMemberInput] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  const isGroup = kind === 'group'
  const valid =
    name.trim().length > 0 &&
    (isGroup || !email.trim() || /^\S+@\S+\.\S+$/.test(email.trim()))

  // Pool of known athletes from defaults, registry, and existing groups
  const knownAthletes = Array.from(
    new Set([
      ...DEFAULT_POOL,
      ...e.registry.athletes.map((a) => a.name),
      ...e.sources().flatMap((s) => e.dbOf(s.id)?.athlete.members ?? []),
    ])
  ).filter(Boolean)

  const toggleMember = (m: string) => {
    setSelectedMembers((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    )
  }

  const addCustomMember = () => {
    const v = customMemberInput.trim()
    if (!v) return
    if (!selectedMembers.includes(v)) {
      setSelectedMembers((prev) => [...prev, v])
    }
    setCustomMemberInput('')
  }

  const go = async () => {
    setBusy(true)
    const members = isGroup ? selectedMembers : []

    const s = await e.addAthlete({
      name,
      focus: focus.trim() || (isGroup ? t('Scuola Tennis') : t('Individual Athlete')),
      email: isGroup ? '' : email,
      targetKind: kind,
      members,
      schedule,
    })
    setBusy(false)
    setName('')
    setSchedule('')
    setFocus('')
    setSelectedMembers([])
    setCustomMemberInput('')
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
          onChange={setKind}
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
            <Field label={t('Giorni e orari in palestra')}>
              <input
                className="input"
                placeholder={t('es. Lun - Mer - Ven 16:30 - 18:00')}
                value={schedule}
                onChange={(ev) => setSchedule(ev.target.value)}
              />
            </Field>
            <Field label={t('Obiettivo / Programma atletico')}>
              <input
                className="input"
                placeholder={t('es. Forza, footwork e prevenzione spalla')}
                value={focus}
                onChange={(ev) => setFocus(ev.target.value)}
              />
            </Field>

            <div className="space-y-2 rounded-2xl border border-line bg-surface p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {t('Componenti del gruppo ({n} selezionati)', { n: selectedMembers.length })}
                </span>
              </div>
              <p className="text-xs text-muted">
                {t('Seleziona gli atleti dalla lista per aggiungerli a questo gruppo:')}
              </p>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pt-1">
                {knownAthletes.map((athleteName) => {
                  const active = selectedMembers.includes(athleteName)
                  return (
                    <button
                      key={athleteName}
                      type="button"
                      onClick={() => toggleMember(athleteName)}
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
              </div>
              <div className="flex items-center gap-2 border-t border-line/60 pt-2">
                <input
                  className="input flex-1 !py-1.5 text-xs"
                  placeholder={t('Nuovo atleta...')}
                  value={customMemberInput}
                  onChange={(e) => setCustomMemberInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addCustomMember()
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-soft !px-3 !py-1.5 !text-xs"
                  onClick={addCustomMember}
                >
                  <Plus size={14} />
                  {t('Aggiungi')}
                </button>
              </div>
            </div>

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

/** Gestione di un atleta o gruppo del coach: profilo, componenti, orari, invito Drive, eliminazione. */
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
  const [newMember, setNewMember] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const src = sourceId ? e.sources().find((s) => s.id === sourceId) : null
  const db = sourceId ? e.dbOf(sourceId) : null
  const real = src?.kind === 'coach-athlete'
  const athleteId = src?.id.replace('athlete:', '') ?? ''
  const info = real ? e.inviteInfo(athleteId) : null
  const entry = real ? e.registry.athletes.find((x) => x.athleteId === athleteId) : null

  const isGroup =
    db?.athlete.targetKind === 'group' || (db?.athlete.members && db.athlete.members.length > 0)
  const members = db?.athlete.members ?? []

  // Known athletes from defaults, registry, and existing groups
  const knownAthletes = Array.from(
    new Set([
      ...DEFAULT_POOL,
      ...e.registry.athletes.map((a) => a.name),
      ...e.sources().flatMap((s) => e.dbOf(s.id)?.athlete.members ?? []),
    ])
  ).filter(Boolean)

  const availableToAdd = knownAthletes.filter((a) => !members.includes(a))

  const patch = (p: Parameters<typeof updateAthlete>[1]) =>
    src && e.mutate(src.id, (d) => updateAthlete(d, p, e.by()))

  const addMember = () => {
    const val = newMember.trim()
    if (!val || members.includes(val)) return
    patch({ members: [...members, val] })
    setNewMember('')
  }

  const removeMember = (m: string) => {
    patch({ members: members.filter((x) => x !== m) })
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

            {isGroup && (
              <Field label={t('Giorni e orari in palestra')}>
                <input
                  className="input"
                  placeholder={t('es. Lun - Mer - Ven 16:30 - 18:00')}
                  value={db.athlete.schedule ?? ''}
                  onChange={(ev) => patch({ schedule: ev.target.value })}
                />
              </Field>
            )}

            <Field label={t('Obiettivo / Programma atletico')}>
              <input
                className="input"
                value={db.athlete.focus}
                onChange={(ev) => patch({ focus: ev.target.value })}
              />
            </Field>

            {isGroup && (
              <div className="space-y-3 rounded-2xl border border-line bg-surface p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {t('Componenti del gruppo ({n})', { n: members.length })}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {members.map((m) => (
                    <span
                      key={m}
                      className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/10 px-2.5 py-1 text-xs font-bold text-brand"
                    >
                      {m}
                      <button
                        type="button"
                        onClick={() => removeMember(m)}
                        className="ml-0.5 text-muted hover:text-exp"
                        aria-label={t('Rimuovi {name}', { name: m })}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  {!members.length && (
                    <p className="text-xs text-muted">{t('Nessun componente aggiunto al gruppo.')}</p>
                  )}
                </div>

                {availableToAdd.length > 0 && (
                  <div className="space-y-1.5 border-t border-line/60 pt-2">
                    <p className="text-xs font-semibold text-muted">
                      {t('Aggiungi dalla lista della scuola tennis:')}
                    </p>
                    <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                      {availableToAdd.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => patch({ members: [...members, name] })}
                          className="inline-flex items-center gap-1 rounded-full border border-line bg-bg px-2.5 py-1 text-xs font-medium text-ink transition hover:border-brand/40 active:scale-95"
                        >
                          <Plus size={12} />
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 border-t border-line/60 pt-2">
                  <input
                    className="input flex-1 !py-1.5 text-xs"
                    placeholder={t('Nuovo atleta...')}
                    value={newMember}
                    onChange={(e) => setNewMember(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addMember()
                      }
                    }}
                  />
                  <button type="button" className="btn btn-soft !px-3 !py-1.5 !text-xs" onClick={addMember}>
                    <Plus size={14} />
                    {t('Aggiungi')}
                  </button>
                </div>
              </div>
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

import { useState } from 'react'
import { ArrowUpDown, Copy, Mail, Plus, Share2, Trash2, User, Users, X } from 'lucide-react'
import { t } from '../i18n'
import { copyText } from '../lib/files'
import { updateAthlete } from '../lib/db'
import { useEngine } from '../state/store'
import type { TargetKind } from '../types'
import { Badge, Confirm, Field, Notice, Segmented, Sheet, Toggle } from './ui'

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
  const [membersText, setMembersText] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  const isGroup = kind === 'group'
  const valid =
    name.trim().length > 0 &&
    (isGroup || !email.trim() || /^\S+@\S+\.\S+$/.test(email.trim()))

  const go = async () => {
    setBusy(true)
    const members = isGroup
      ? membersText
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : []

    const s = await e.addAthlete({
      name,
      focus: focus.trim() || (isGroup ? t('Scuola Tennis') : t('Atleta Pro')),
      email: isGroup ? '' : email,
      targetKind: kind,
      members,
      schedule,
    })
    setBusy(false)
    setName('')
    setSchedule('')
    setFocus('')
    setMembersText('')
    setEmail('')
    onClose()
    onCreated(s.id)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isGroup ? t('Nuovo gruppo scuola tennis') : t('Nuovo atleta individuale / pro')}
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
            { value: 'individual', label: t('Atleta Individuale / Pro') },
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
            <Field label={t('Componenti del gruppo (separati da virgola o a capo)')}>
              <textarea
                className="input min-h-20 text-sm"
                placeholder={t('es. Matteo B., Sofia V., Leonardo T., Edoardo F.')}
                value={membersText}
                onChange={(ev) => setMembersText(ev.target.value)}
              />
            </Field>
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
                placeholder={t('es. Professionista ATP · Potenza & Prevenzione')}
                value={focus}
                onChange={(ev) => setFocus(ev.target.value)}
              />
            </Field>
            <Field label={t('Email Google dell’atleta (facoltativa)')}>
              <input
                className="input"
                type="email"
                inputMode="email"
                placeholder="atleta@gmail.com"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
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
  const src = sourceId ? e.allSources().find((s) => s.id === sourceId) ?? null : null
  const db = src ? e.dbOf(src.id) : null
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ask, setAsk] = useState(false)
  const [newMember, setNewMember] = useState('')
  const real = src?.kind === 'coach-athlete'
  const athleteId = src?.id.replace('athlete:', '') ?? ''
  const info = real ? e.inviteInfo(athleteId) : null
  const entry = real ? e.registry.athletes.find((x) => x.athleteId === athleteId) : null

  const isGroup = db?.athlete.targetKind === 'group' || (db?.athlete.members && db.athlete.members.length > 0)
  const members = db?.athlete.members ?? []

  const patch = (p: Parameters<typeof updateAthlete>[1]) => src && e.mutate(src.id, (d) => updateAthlete(d, p, e.by()))

  const addMember = () => {
    const val = newMember.trim()
    if (!val || members.includes(val)) return
    patch({ members: [...members, val] })
    setNewMember('')
  }

  const removeMember = (m: string) => {
    patch({ members: members.filter((x) => x !== m) })
  }

  const invite = async () => {
    setBusy(true)
    setErr('')
    try {
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
                {isGroup ? t('Gruppo Scuola Tennis') : t('Atleta Individuale / Pro')}
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
              <div className="space-y-2 rounded-2xl border border-line bg-surface p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {t('Componenti del gruppo ({n})', { n: members.length })}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {members.map((m) => (
                    <span
                      key={m}
                      className="inline-flex items-center gap-1 rounded-full border border-line bg-bg px-2.5 py-1 text-xs font-medium"
                    >
                      {m}
                      <button
                        type="button"
                        onClick={() => removeMember(m)}
                        className="text-muted hover:text-exp"
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
                <div className="flex items-center gap-2 pt-2">
                  <input
                    className="input !py-1.5 text-xs"
                    placeholder={t('Aggiungi componente...')}
                    value={newMember}
                    onChange={(e) => setNewMember(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addMember()
                      }
                    }}
                  />
                  <button type="button" className="btn btn-soft !py-1.5 !px-3 !text-xs" onClick={addMember}>
                    <Plus size={14} />
                    {t('Aggiungi')}
                  </button>
                </div>
              </div>
            )}

            {!isGroup && real && (
              <Field label={t('Email Google dell’atleta')}>
                <input
                  className="input"
                  type="email"
                  value={db.athlete.email ?? ''}
                  onChange={(ev) => patch({ email: ev.target.value.trim().toLowerCase() || null })}
                />
              </Field>
            )}

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

            {real ? (
              <div className="space-y-2">
                <p className="label">{isGroup ? t('Condivisione Drive gruppo') : t('Invito atleta')}</p>
                {info ? (
                  <>
                    <div className="space-y-1 rounded-2xl bg-bg p-3 text-xs">
                      <p className="font-semibold">{t('Link')}</p>
                      <p className="break-all text-muted">{info.link}</p>
                      <p className="pt-1 font-semibold">{t('Codice')}</p>
                      <p className="break-all text-muted">{info.code}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button className="btn btn-soft" onClick={() => copy(info.link)}>
                        <Copy size={15} />
                        {t('Link')}
                      </button>
                      <button className="btn btn-soft" onClick={() => copy(info.code)}>
                        <Copy size={15} />
                        {t('Codice')}
                      </button>
                      <button className="btn btn-soft" onClick={() => share(info.link)}>
                        <Share2 size={15} />
                        {t('Invia')}
                      </button>
                    </div>
                  </>
                ) : (
                  <Notice kind="warn">
                    {e.isAuthed()
                      ? t('Il file su Drive non è ancora stato creato.')
                      : t(
                          'Collega Google (Profilo → Sincronizzazione) per creare il file su Drive e generare l’invito.'
                        )}
                  </Notice>
                )}
                {!isGroup && (
                  <button className="btn btn-primary w-full" disabled={busy || !e.isAuthed()} onClick={invite}>
                    <Mail size={16} />
                    {db.athlete.email
                      ? entry?.invitedAt
                        ? t('Reinvia invito (condivisione Drive)')
                        : t('Invia invito (condivisione Drive)')
                      : t('Genera link e codice')}
                  </button>
                )}
                {err && <Notice kind="exp">{err}</Notice>}
                <button className="btn btn-danger w-full" onClick={() => setAsk(true)}>
                  <Trash2 size={16} />
                  {isGroup ? t('Rimuovi gruppo') : t('Rimuovi atleta')}
                </button>
              </div>
            ) : (
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

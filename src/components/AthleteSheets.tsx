import { useState } from 'react'
import { Copy, Mail, Share2, Trash2 } from 'lucide-react'
import { t } from '../i18n'
import { copyText } from '../lib/files'
import { updateAthlete } from '../lib/db'
import { useEngine } from '../state/store'
import { Confirm, Field, Notice, Sheet, Toggle } from './ui'

export function NewAthleteSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (sourceId: string) => void }) {
  const e = useEngine()
  const [name, setName] = useState('')
  const [focus, setFocus] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const valid = name.trim().length > 0 && (!email.trim() || /^\S+@\S+\.\S+$/.test(email.trim()))
  const go = async () => {
    setBusy(true)
    const s = await e.addAthlete({ name, focus, email })
    setBusy(false); setName(''); setFocus(''); setEmail(''); onClose(); onCreated(s.id)
  }
  return (
    <Sheet open={open} onClose={onClose} title={t('Nuovo atleta')}
      footer={<button className="btn btn-primary w-full !py-3" disabled={!valid || busy} onClick={go}>{t('Crea atleta')}</button>}>
      <div className="space-y-3 pb-2">
        <Field label={t('Nome')}><input className="input" value={name} onChange={(ev) => setName(ev.target.value)} autoFocus /></Field>
        <Field label={t('Disciplina / obiettivo')}><input className="input" value={focus} placeholder={t('es. Hyrox · Mezza maratona')} onChange={(ev) => setFocus(ev.target.value)} /></Field>
        <Field label={t('Email Google dell’atleta (facoltativa)')}><input className="input" type="email" inputMode="email" value={email} onChange={(ev) => setEmail(ev.target.value)} /></Field>
        <p className="text-xs text-muted">{t('Verrà creato un file dedicato sul tuo Drive: i dati di ogni atleta restano separati. L’invito si genera nel passo successivo.')}</p>
      </div>
    </Sheet>
  )
}

/** Gestione di un atleta del coach: profilo, permessi, invito Drive, eliminazione. */
export function ManageAthleteSheet({ sourceId, onClose }: { sourceId: string | null; onClose: () => void }) {
  const e = useEngine()
  const src = sourceId ? e.allSources().find((s) => s.id === sourceId) ?? null : null
  const db = src ? e.dbOf(src.id) : null
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ask, setAsk] = useState(false)
  const real = src?.kind === 'coach-athlete'
  const athleteId = src?.id.replace('athlete:', '') ?? ''
  const info = real ? e.inviteInfo(athleteId) : null
  const entry = real ? e.registry.athletes.find((x) => x.athleteId === athleteId) : null

  const patch = (p: Parameters<typeof updateAthlete>[1]) => src && e.mutate(src.id, (d) => updateAthlete(d, p, e.by()))
  const invite = async () => {
    setBusy(true); setErr('')
    try {
      const r = await e.inviteAthlete(athleteId)
      e.notify(r.emailed ? t('Invito inviato: il file è stato condiviso con l’atleta') : t('Invito pronto: copia il link o il codice'))
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)) }
    setBusy(false)
  }
  const copy = async (s: string) => e.notify((await copyText(s)) ? t('Copiato') : t('Copia non riuscita'), 'info')
  const share = (link: string) => { if (navigator.share) void navigator.share({ title: 'Trainer Team', text: t('Ecco il tuo piano di allenamento'), url: link }).catch(() => undefined); else void copy(link) }

  return (
    <>
      <Sheet open={!!src && !!db} onClose={onClose} title={db?.athlete.name ?? ''}>
        {src && db && (
          <div className="space-y-4 pb-2">
            <Field label={t('Nome')}><input className="input" value={db.athlete.name} onChange={(ev) => patch({ name: ev.target.value })} /></Field>
            <Field label={t('Disciplina / obiettivo')}><input className="input" value={db.athlete.focus} onChange={(ev) => patch({ focus: ev.target.value })} /></Field>
            {real && <Field label={t('Email Google dell’atleta')}><input className="input" type="email" value={db.athlete.email ?? ''} onChange={(ev) => patch({ email: ev.target.value.trim().toLowerCase() || null })} /></Field>}
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-bg p-3">
              <div><p className="font-semibold">{t('L’atleta può modificare gli allenamenti')}</p><p className="text-xs text-muted">{t('Se spento, l’atleta vede il piano e registra i completamenti e i feedback.')}</p></div>
              <Toggle checked={db.athlete.athleteCanEdit} onChange={(v) => patch({ athleteCanEdit: v })} label={t('L’atleta può modificare gli allenamenti')} />
            </div>

            {real ? (
              <div className="space-y-2">
                <p className="label">{t('Invito')}</p>
                {info ? (
                  <>
                    <div className="space-y-1 rounded-2xl bg-bg p-3 text-xs"><p className="font-semibold">{t('Link')}</p><p className="break-all text-muted">{info.link}</p><p className="pt-1 font-semibold">{t('Codice')}</p><p className="break-all text-muted">{info.code}</p></div>
                    <div className="grid grid-cols-3 gap-2">
                      <button className="btn btn-soft" onClick={() => copy(info.link)}><Copy size={15} />{t('Link')}</button>
                      <button className="btn btn-soft" onClick={() => copy(info.code)}><Copy size={15} />{t('Codice')}</button>
                      <button className="btn btn-soft" onClick={() => share(info.link)}><Share2 size={15} />{t('Invia')}</button>
                    </div>
                  </>
                ) : <Notice kind="warn">{e.isAuthed() ? t('Il file su Drive non è ancora stato creato.') : t('Collega Google (Profilo → Sincronizzazione) per creare il file su Drive e generare l’invito.')}</Notice>}
                <button className="btn btn-primary w-full" disabled={busy || !e.isAuthed()} onClick={invite}>
                  <Mail size={16} />{db.athlete.email ? (entry?.invitedAt ? t('Reinvia invito (condivisione Drive)') : t('Invia invito (condivisione Drive)')) : t('Genera link e codice')}
                </button>
                {err && <Notice kind="exp">{err}</Notice>}
                <p className="text-xs text-muted">{t('Invitare = condividere il file dell’atleta su Drive con permesso di modifica; l’atleta deve usare lo stesso account Google.')}</p>
                <button className="btn btn-danger w-full" onClick={() => setAsk(true)}><Trash2 size={16} />{t('Rimuovi atleta')}</button>
              </div>
            ) : <Notice kind="trf">{t('Atleta dimostrativo: serve solo per provare l’app.')}</Notice>}
          </div>
        )}
      </Sheet>
      <Confirm open={ask} title={t('Rimuovere l’atleta?')} text={t('L’atleta sparisce dalla tua lista. Il file su Drive non viene cancellato: puoi toglierne l’accesso da Drive.')} confirmLabel={t('Rimuovi')} onConfirm={() => { e.removeAthlete(athleteId); onClose() }} onClose={() => setAsk(false)} />
    </>
  )
}

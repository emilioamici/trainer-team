import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Loader2, Unlink, X } from 'lucide-react'
import { t } from '../i18n'
import { addDays } from '../lib/dates'
import { getToken } from '../services/googleDriveService'
import { WorkerError } from '../services/workerService'
import { connectStrava, stravaActivities, stravaAvailable, stravaDisconnect, stravaStatus, stravaUrlOf, type StravaActivity } from '../services/stravaService'
import { Notice, Sheet } from './ui'

export type StravaState = 'loading' | 'unavailable' | 'nologin' | 'disconnected' | 'full' | 'connected'

/** Stato del collegamento: il server lo supporta? l'utente è entrato con Google? ha collegato Strava? */
export function useStrava() {
  const [state, setState] = useState<StravaState>('loading')
  const refresh = useCallback(async () => {
    if (!(await stravaAvailable())) return setState('unavailable')
    const token = getToken()
    if (!token) return setState('nologin')
    try {
      const s = await stravaStatus(token)
      setState(s.connected ? 'connected' : s.full ? 'full' : 'disconnected')
    } catch { setState('disconnected') }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  return { state, refresh }
}

const errText = (x: unknown) => (x instanceof WorkerError ? x.message : x instanceof Error ? x.message : String(x))

/** Impostazioni → Strava. */
export function StravaSettings({ onNotify }: { onNotify: (m: string, kind?: 'ok' | 'err') => void }) {
  const { state, refresh } = useStrava()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const run = async (fn: (tok: string) => Promise<unknown>) => {
    const tok = getToken()
    if (!tok) return setErr(t('Accedi con Google per collegare Strava.'))
    setBusy(true); setErr('')
    try { await fn(tok) } catch (x) { setErr(errText(x)) }
    setBusy(false)
  }
  return (
    <div className="space-y-3">
      {state === 'unavailable' && <Notice kind="warn">{t('Il collegamento a Strava richiede il server (Worker) con le chiavi Strava: vedi worker/README.md.')}</Notice>}
      {state === 'nologin' && <Notice kind="warn">{t('Accedi con Google per collegare Strava.')}</Notice>}
      {state === 'full' && <Notice kind="warn">{t('Troppi atleti collegati a Strava: riprova più avanti.')}</Notice>}
      {(state === 'disconnected' || state === 'full') && (
        <button className="btn btn-primary w-full" disabled={busy || state === 'full'} onClick={() => run((tok) => connectStrava(tok))}>
          {busy && <Loader2 size={16} className="animate-spin" />}{t('Collega Strava')}
        </button>
      )}
      {state === 'connected' && (
        <>
          <p className="rounded-2xl bg-inc/10 p-3 text-sm font-semibold">{t('Strava collegato')}</p>
          <button className="btn btn-soft w-full" disabled={busy} onClick={() => run(async (tok) => { await stravaDisconnect(tok); await refresh(); onNotify(t('Strava scollegato')) })}>
            <Unlink size={16} />{t('Scollega Strava')}
          </button>
        </>
      )}
      {err && <Notice kind="exp">{err}</Notice>}
      <p className="text-xs text-muted">
        {t('Strava serve solo a scegliere, nel feedback di un allenamento, quale tua attività collegare. Nell’app resta soltanto il link: nessuna statistica viene salvata né mostrata al coach. Il coach la apre su Strava, secondo i permessi di Strava.')}
      </p>
      <p className="text-[11px] text-muted">Powered by Strava</p>
    </div>
  )
}

const fmtWhen = (iso: string) => {
  const d = new Date(iso.replace('Z', ''))
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function Picker({ open, onClose, date, onPick }: { open: boolean; onClose: () => void; date: string; onPick: (a: StravaActivity) => void }) {
  const [items, setItems] = useState<StravaActivity[] | null>(null)
  const [all, setAll] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!open) return
    const tok = getToken()
    if (!tok) { setErr(t('Accedi con Google per collegare Strava.')); return }
    setItems(null); setErr('')
    stravaActivities(tok, all ? undefined : { from: addDays(date, -1), to: addDays(date, 1) })
      .then(setItems).catch((x) => setErr(errText(x)))
  }, [open, all, date])
  return (
    <Sheet open={open} onClose={onClose} title={t('Le tue attività Strava')} zIndex={70}>
      <div className="space-y-2 pb-2">
        {err && <Notice kind="exp">{err}</Notice>}
        {!err && items === null && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 size={16} className="animate-spin" />{t('Carico le attività…')}</p>}
        {items?.length === 0 && <p className="text-sm text-muted">{all ? t('Nessuna attività recente trovata.') : t('Nessuna attività nei giorni intorno all’allenamento.')}</p>}
        {items?.map((a) => (
          <button key={a.id} type="button" className="card w-full p-3 text-left active:scale-[0.99]" onClick={() => onPick(a)}>
            <span className="block font-semibold">{a.name || t('Attività')}</span>
            <span className="text-xs text-muted">{[a.sport, fmtWhen(a.date)].filter(Boolean).join(' · ')}</span>
          </button>
        ))}
        {!all && !err && items !== null && (
          <button type="button" className="btn btn-soft w-full" onClick={() => setAll(true)}>{t('Mostra le ultime attività')}</button>
        )}
        <p className="pt-1 text-[11px] text-muted">Powered by Strava</p>
      </div>
    </Sheet>
  )
}

/** Campo del feedback: sceglie un’attività dal profilo Strava e ne conserva solo il link. */
export function StravaField({ date, url, onChange }: { date: string; url: string; onChange: (url: string) => void }) {
  const { state } = useStrava()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  if (state === 'loading' || state === 'unavailable') return null
  return (
    <div>
      <span className="label">{t('Attività Strava (facoltativo)')}</span>
      {url ? (
        <div className="flex items-center gap-2 rounded-2xl bg-inc/10 p-3 text-sm">
          <a href={url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-1.5 font-semibold">
            <ExternalLink size={14} className="shrink-0" /><span className="truncate">{name || t('Attività collegata')}</span>
          </a>
          <button type="button" className="icon-btn !min-h-8 !min-w-8" aria-label={t('Rimuovi il collegamento a Strava')} onClick={() => { onChange(''); setName('') }}><X size={16} /></button>
        </div>
      ) : state === 'connected' ? (
        <button type="button" className="btn btn-soft w-full" onClick={() => setOpen(true)}>{t('Scegli un’attività Strava')}</button>
      ) : (
        <button type="button" className="btn btn-soft w-full" onClick={async () => {
          const tok = getToken()
          if (!tok) return setErr(t('Accedi con Google per collegare Strava.'))
          try { await connectStrava(tok) } catch (x) { setErr(errText(x)) }
        }} disabled={state === 'full'}>{t('Collega Strava')}</button>
      )}
      {err && <p className="mt-1 text-xs font-semibold text-exp">{err}</p>}
      <Picker open={open} onClose={() => setOpen(false)} date={date} onPick={(a) => { onChange(stravaUrlOf(a.id)); setName(a.name); setOpen(false) }} />
    </div>
  )
}

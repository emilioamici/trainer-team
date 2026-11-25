import { useState } from 'react'
import { LogIn, FlaskConical } from 'lucide-react'
import { t } from '../i18n'
import { config } from '../services/googleDriveService'
import { useEngine } from '../state/store'
import type { UserRole } from '../types'
import { Mascot } from './Mascot'
import { Background, Field, Notice, OptionRow } from './ui'

const asset = (p: string) => `${import.meta.env.BASE_URL}${p}`

/** Schermata iniziale di accesso (primo avvio) e di riaccesso (sessione scaduta). Copre l'app, che resta montata sotto. */
export function Gate({ mode, onLoggedIn }: { mode: 'login' | 'relogin'; onLoggedIn: () => void }) {
  const e = useEngine()
  const [role, setRole] = useState<UserRole>(e.role)
  const [code, setCode] = useState('')
  const [withCode, setWithCode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [cid, setCid] = useState('')
  const configured = !!config.clientId()

  const go = async () => {
    setBusy(true)
    if (mode === 'relogin') await e.connect()
    else await e.beginLogin(role, withCode ? code : undefined)
    setBusy(false)
    onLoggedIn()
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-bg" role="dialog" aria-label={t('Accesso')}>
      <Background />
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]">
        <div className="mx-auto mb-6 flex flex-col items-center gap-3 text-center" role="img" aria-label="FM Training">
          <div className="flex items-end justify-center gap-1">
            <Mascot who="atleta" className="h-44 drop-shadow-lg" />
            <Mascot who="coach" className="h-44 drop-shadow-lg" />
          </div>
          <span className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2B2E35] text-sm font-black tracking-tight text-white ring-1 ring-white/15">FM</span>
            <span className="text-2xl font-black tracking-tight text-ink">Training</span>
          </span>
        </div>

        <div className="glass-strong space-y-4 rounded-[2rem] p-5">
          {mode === 'relogin' ? (
            <>
              <h1 className="text-2xl font-extrabold tracking-tight">{t('Sessione scaduta')}</h1>
              <p className="text-sm text-muted">{t('Accedi di nuovo per continuare a sincronizzare. I dati sul dispositivo sono al sicuro.')}</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold tracking-tight">{t('Benvenuto')}</h1>
              <p className="text-sm text-muted">{t('Accedi con Google per salvare i piani di allenamento sul tuo Drive e sincronizzarli tra i dispositivi.')}</p>
              <div className="space-y-2">
                <OptionRow selected={role === 'athlete'} onClick={() => setRole('athlete')}>
                  <span className="flex items-center gap-3"><Mascot who="atleta" kind="bust" className="h-10 w-10 shrink-0 rounded-full bg-brand/10 object-cover object-top" /><span><span className="block font-semibold">{t('Sono un atleta')}</span><span className="block text-xs text-muted">{t('Segui il tuo piano e registra gli allenamenti')}</span></span></span>
                </OptionRow>
                <OptionRow selected={role === 'coach'} onClick={() => setRole('coach')}>
                  <span className="flex items-center gap-3"><Mascot who="coach" kind="bust" className="h-10 w-10 shrink-0 rounded-full bg-brand/10 object-cover object-top" /><span><span className="block font-semibold">{t('Sono un coach')}</span><span className="block text-xs text-muted">{t('Gestisci gli atleti e programma i loro allenamenti')}</span></span></span>
                </OptionRow>
              </div>
              {role === 'athlete' && (
                <div>
                  {withCode ? (
                    <Field label={t('Link d’invito o codice')}>
                      <input className="input" value={code} onChange={(ev) => setCode(ev.target.value)} placeholder="https://…#join=…" autoCapitalize="none" autoCorrect="off" />
                      <span className="mt-1 block text-xs text-muted">{t('Accedi con lo stesso account Google a cui il coach ha inviato l’invito: dopo l’accesso ti collego al suo piano.')}</span>
                    </Field>
                  ) : (
                    <button className="text-sm font-semibold text-brand underline" onClick={() => setWithCode(true)}>{t('Ho un codice di invito dal mio coach')}</button>
                  )}
                </div>
              )}
            </>
          )}

          {!configured && (
            <div className="space-y-2">
              <Notice kind="warn">{t('Questa versione dell’app non ha il Client ID di Google: controlla la variabile VITE_GOOGLE_CLIENT_ID del repository e rilancia il deploy (vedi README). Per provare, puoi incollarlo qui.')}</Notice>
              <input className="input" value={cid} onChange={(ev) => setCid(ev.target.value)} placeholder="1234-abc.apps.googleusercontent.com" autoCapitalize="none" aria-label="Google Client ID" />
              <button className="btn btn-soft w-full" disabled={!cid.trim()} onClick={() => { config.save('clientId', cid); location.reload() }}>{t('Salva Client ID')}</button>
            </div>
          )}

          <button className="btn btn-primary w-full !py-3" disabled={busy || !configured} onClick={go}>
            <LogIn size={18} />{mode === 'relogin' ? t('Riaccedi con Google') : t('Continua con Google')}
          </button>
          {mode === 'relogin'
            ? <button className="btn btn-ghost w-full" onClick={() => e.dismissRelogin()}>{t('Continua offline')}</button>
            : <button className="btn btn-soft w-full" onClick={() => e.skipGate()}><FlaskConical size={16} />{t('Prova senza account (dati demo)')}</button>}
        </div>

        <p className="mt-5 text-center text-xs text-muted">
          {t('L’app vede solo i file che crea o che apri tu (permesso "drive.file").')} <a className="font-semibold text-brand underline" href={asset('privacy.html')}>{t('Privacy')}</a>
        </p>
      </div>
    </div>
  )
}

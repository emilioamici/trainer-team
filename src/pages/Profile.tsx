import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Bell, BookOpen, Cloud, Compass, Database, Link2, ListOrdered, Palette, RefreshCw, UserRound, Users } from 'lucide-react'
import { t, lang, getLangPref, setLangPref, type LangPref, useLangPref } from '../i18n'
import { Mascot } from '../components/Mascot'
import { kindIcon, SyncBadge, useActive } from '../components/common'
import { Accordion, Badge, Field, Notice, PageHeader, Segmented, Sheet, Toggle } from '../components/ui'
import { applyTheme, getTheme, type ThemePref } from '../lib/theme'
import { DEFAULT_COLORS, getPalette, PALETTES, paletteColors, type PaletteId } from '../lib/palette'
import { clearPendingJoin, pendingJoin } from '../lib/invite'
import { downloadJSON, readFileText } from '../lib/files'
import { slug } from '../lib/ids'
import { updateAthlete } from '../lib/db'
import { fmtDay } from '../lib/dates'
import { config, pickerAvailable } from '../services/googleDriveService'
import { isIos, isStandalone, pushSupported } from '../services/pushService'
import { saveWorkerCfg, vapidKey, workerUrl } from '../services/workerService'
import type { UserRole } from '../types'

export function SettingsContent({ onOpenTutorial, onOpenTour }: { onOpenTutorial?: () => void; onOpenTour?: () => void }) {
  const { e, src, db } = useActive()
  useLangPref()
  const [theme, setTheme] = useState<ThemePref>(getTheme)
  const [palette, setPalette] = useState<PaletteId>(getPalette)
  const [name, setName] = useState(e.profileName)
  const [code, setCode] = useState(() => pendingJoin() ?? '')
  const [linking, setLinking] = useState(false)
  const [linkErr, setLinkErr] = useState('')
  const [cid, setCid] = useState(config.clientId())
  const [api, setApi] = useState(config.apiKey())
  const [app, setApp] = useState(config.appId())
  const [wurl, setWurl] = useState(workerUrl())
  const [vapid, setVapid] = useState(vapidKey())
  const [pushMsg, setPushMsg] = useState('')
  const [pushBusy, setPushBusy] = useState(false)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [importMsg, setImportMsg] = useState('')
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => { void e.checkInvites(true) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const st = src ? e.statusOf(src.id) : null
  const personal = e.dbOf('personal')
  const linked = e.sources().filter((s) => s.kind === 'linked')

  const pickTheme = (p: ThemePref) => {
    setTheme(p)
    applyTheme(p, palette)
  }
  const pickPalette = (id: PaletteId) => {
    setPalette(id)
    applyTheme(theme, id)
  }
  const doLink = async () => {
    setLinking(true)
    setLinkErr('')
    try {
      await e.linkCoach(code)
      clearPendingJoin()
      setCode('')
      e.notify(t('Collegato! Ora vedi il piano del tuo coach.'))
    } catch (x) {
      setLinkErr(x instanceof Error ? x.message : String(x))
    }
    setLinking(false)
  }
  const doImport = async (f: File) => {
    if (!src) return
    try {
      await e.importDb(src.id, JSON.parse(await readFileText(f)), mode)
      setImportMsg(t('Backup importato.'))
    } catch (x) {
      setImportMsg(x instanceof Error ? x.message : t('File non valido'))
    }
  }

  const pc = paletteColors(palette)
  const themeOpt: { id: ThemePref; label: string; bg: string }[] = [
    { id: 'auto', label: t('Automatico'), bg: `linear-gradient(135deg, ${pc.light} 50%, ${pc.dark} 50%)` },
    { id: 'light', label: t('Modalità chiara'), bg: pc.light },
    { id: 'dark', label: t('Modalità scura'), bg: pc.dark },
  ]
  const paletteOpt = [
    { id: 'default' as PaletteId, label: t('Classico'), swatch: ['#1D64EC', DEFAULT_COLORS.dark, DEFAULT_COLORS.light] },
    ...PALETTES.map((p) => ({ id: p.id as PaletteId, label: lang() === 'en' ? p.en : p.it, swatch: p.swatch })),
  ]

  return (
    <div className="space-y-3 pb-4">
      <div className="rounded-2xl border border-line bg-surface/80 p-3 text-sm">
        <p className="font-bold text-ink">{e.profileName || (e.role === 'coach' ? t('Coach') : t('Atleta'))}</p>
        <p className="text-xs text-muted">{e.account?.email ?? t('Non collegato a Google')}</p>
      </div>

      {onOpenTutorial && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/90 p-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand/15 text-brand">
              <BookOpen size={17} />
            </span>
            <div>
              <p className="text-sm font-bold text-ink">{t('Tutorial iniziale')}</p>
              <p className="text-xs text-muted">{t('Rivedi la guida introduttiva per coach o atleti')}</p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-soft !py-1.5 !px-3 !text-xs font-bold"
            onClick={onOpenTutorial}
          >
            {t('Apri')}
          </button>
        </div>
      )}

      {onOpenTour && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/90 p-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand/15 text-brand">
              <Compass size={17} />
            </span>
            <div>
              <p className="text-sm font-bold text-ink">{t('Tour guidato')}</p>
              <p className="text-xs text-muted">{t('Ti accompagno tra le funzioni dell’app, schermata per schermata')}</p>
            </div>
          </div>
          <button type="button" className="btn btn-soft !py-1.5 !px-3 !text-xs font-bold" onClick={onOpenTour}>
            {t('Avvia')}
          </button>
        </div>
      )}

      <Accordion id="role" icon={<Users size={22} />} title={t('Ruolo')} summary={e.role === 'coach' ? t('Coach') : t('Atleta')} defaultOpen>
        <Segmented id="role" value={e.role} onChange={(r: UserRole) => e.setRole(r)} options={[{ value: 'athlete', label: t('Atleta') }, { value: 'coach', label: t('Coach') }]} />
        <div className="flex items-center gap-3">
        <Mascot kind="bust" fade className="h-24 shrink-0" />
        <p className="text-xs text-muted">
          {e.role === 'coach'
            ? t('Come coach gestisci gli atleti: ognuno ha un file dedicato sul tuo Drive. Puoi allenare anche te stesso dal tab "Piano" scegliendo "Il mio piano".')
            : t('Come atleta vedi il tuo piano, completi gli allenamenti e lasci feedback. Puoi avere un piano personale e uno o più piani collegati a un coach.')}
        </p>
        </div>
      </Accordion>

      <Accordion id="look" icon={<Palette size={22} />} title={t('Aspetto')} summary={`${paletteOpt.find((o) => o.id === palette)?.label} · ${themeOpt.find((o) => o.id === theme)?.label} · ${{ auto: t('Lingua automatica'), it: 'Italiano', en: 'English' }[getLangPref()]}`}>
        <div className="grid grid-cols-3 gap-2">
          {themeOpt.map((o) => (
            <button key={o.id} onClick={() => pickTheme(o.id)} aria-pressed={theme === o.id} className={`rounded-2xl border p-2 text-center text-xs font-semibold ${theme === o.id ? 'border-brand bg-brand/10' : 'border-line'}`}>
              <span className="mb-1.5 block h-12 rounded-xl border border-line/60" style={{ background: o.bg }} />
              {o.label}
            </button>
          ))}
        </div>
        <Field label={t('Colori')}>
          <div className="grid grid-cols-2 gap-2">
            {paletteOpt.map((o) => (
              <button key={o.id} onClick={() => pickPalette(o.id)} aria-pressed={palette === o.id} className={`rounded-2xl border p-2 text-left text-xs font-semibold ${palette === o.id ? 'border-brand bg-brand/10' : 'border-line'}`}>
                <span className="mb-1.5 flex h-7 overflow-hidden rounded-lg border border-line/60">
                  {o.swatch.map((c, i) => <span key={i} className="flex-1" style={{ background: c }} />)}
                </span>
                {o.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t('Lingua')}>
          <Segmented id="lang" value={getLangPref()} onChange={(v: LangPref) => setLangPref(v)} options={[{ value: 'auto', label: t('Auto') }, { value: 'it', label: 'Italiano' }, { value: 'en', label: 'English' }]} />
        </Field>
        <p className="text-xs text-muted">{t('Tema e lingua valgono solo per questo dispositivo.')}</p>
      </Accordion>

      <Accordion id="me" icon={<UserRound size={22} />} title={t('Il mio profilo')} summary={e.profileName || t('Nome non impostato')}>
        <Field label={t('Il tuo nome')}><input className="input" value={name} onChange={(ev) => setName(ev.target.value)} onBlur={() => name !== e.profileName && e.setProfileName(name.trim())} /></Field>
        {personal && <Field label={t('Disciplina / obiettivo del tuo piano personale')}><input className="input" defaultValue={personal.athlete.focus} placeholder={t('es. Preparazione Atletica Tennis')} onBlur={(ev) => ev.target.value !== personal.athlete.focus && e.mutate('personal', (d) => updateAthlete(d, { focus: ev.target.value.trim() }, e.by()))} /></Field>}
        <p className="text-xs text-muted">{t('Salvato nel profilo del piano e sincronizzato sui tuoi dispositivi.')}</p>
      </Accordion>

      {e.sources().length > 1 && (
        <Accordion id="order" icon={<ListOrdered size={22} />} title={t('Ordine dei piani')} summary={t('Principale: {name}', { name: e.sources()[0].name })}>
          <p className="text-xs text-muted">{t('Il primo è il piano principale: è quello che si apre all’avvio dell’app. Usa le frecce per cambiare l’ordine.')}</p>
          <ul className="space-y-2">
            {e.sources().map((s, i, all) => {
              const Icon = kindIcon(s)
              return (
                <li key={s.id} className="flex items-center gap-2 rounded-2xl bg-bg p-2.5">
                  <Icon size={16} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.kind === 'demo' ? `${s.name} · ${t('demo')}` : s.name}</span>
                  {i === 0 && <Badge className="bg-brand/10 text-brand">{t('Principale')}</Badge>}
                  <button type="button" className="icon-btn !min-h-9 !min-w-9 !p-1.5 disabled:opacity-35" disabled={i === 0} onClick={() => e.movePlan(s.id, -1)} aria-label={t('Sposta su: {name}', { name: s.name })}><ArrowUp size={16} /></button>
                  <button type="button" className="icon-btn !min-h-9 !min-w-9 !p-1.5 disabled:opacity-35" disabled={i === all.length - 1} onClick={() => e.movePlan(s.id, 1)} aria-label={t('Sposta giù: {name}', { name: s.name })}><ArrowDown size={16} /></button>
                </li>
              )
            })}
          </ul>
        </Accordion>
      )}

      <Accordion id="sync" icon={<Cloud size={22} />} title={t('Sincronizzazione e account')} summary={e.account?.email ?? (e.authState === 'expired' ? t('Sessione scaduta') : t('Non collegato'))} defaultOpen={!e.isAuthed()}>
        {!config.fromBuild() && (
          <div className="space-y-2">
            <Field label="Google Client ID"><input className="input" value={cid} onChange={(ev) => setCid(ev.target.value)} onBlur={() => config.save('clientId', cid)} placeholder="1234-abc.apps.googleusercontent.com" autoCapitalize="none" /></Field>
            <details className="text-sm"><summary className="cursor-pointer py-1 font-semibold text-brand">{t('Opzioni avanzate (Picker, server)')}</summary>
              <div className="mt-2 space-y-2">
                <Field label={t('Indirizzo del Worker')}><input className="input" value={wurl} onChange={(ev) => setWurl(ev.target.value)} onBlur={() => { saveWorkerCfg('pushUrl', wurl); location.reload() }} placeholder="https://trainer-team.xxx.workers.dev" autoCapitalize="none" /></Field>
                <Field label={t('Chiave VAPID pubblica')}><input className="input" value={vapid} onChange={(ev) => setVapid(ev.target.value)} onBlur={() => saveWorkerCfg('vapidKey', vapid)} autoCapitalize="none" /></Field>
                <Field label="API key"><input className="input" value={api} onChange={(ev) => setApi(ev.target.value)} onBlur={() => config.save('apiKey', api)} autoCapitalize="none" /></Field>
                <Field label="App ID (project number)"><input className="input" value={app} onChange={(ev) => setApp(ev.target.value)} onBlur={() => config.save('appId', app)} inputMode="numeric" /></Field>
              </div>
            </details>
          </div>
        )}
        {!config.clientId() && <Notice kind="warn">{t('Inserisci il Client ID OAuth di Google Cloud per attivare la sincronizzazione (vedi README). Senza, l’app funziona solo su questo dispositivo.')}</Notice>}
        <div className="flex flex-wrap gap-2">
          {e.isAuthed()
            ? <button className="btn btn-danger flex-1" onClick={() => void e.disconnect()}>{t('Scollega account')}</button>
            : <button className="btn btn-primary flex-1" disabled={!config.clientId()} onClick={() => e.connect()}>{e.authState === 'expired' ? t('Riconnetti Google') : t('Collega Google')}</button>}
          <button className="btn btn-soft flex-1" onClick={() => void e.syncAll()}><RefreshCw size={16} />{t('Sincronizza ora')}</button>
        </div>
        {src && st && (
          <div className="space-y-1.5 rounded-2xl bg-bg p-3 text-sm">
            <p className="font-semibold">{src.name}</p>
            <SyncBadge status={st.status} />
            {st.lastSync && <p className="text-xs text-muted">{t('Ultima sincronizzazione: {date}', { date: `${fmtDay(st.lastSync.slice(0, 10))} ${new Date(st.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` })}</p>}
            {st.error && <p className="text-xs text-exp">{st.error}</p>}
          </div>
        )}
        {!e.cacheOk && <Notice kind="warn">{t('Non riesco a salvare la copia locale: le modifiche restano solo in memoria finché non sono sincronizzate.')}</Notice>}
        <p className="text-xs text-muted">{e.hasPersistentLogin() ? t('Accesso persistente attivo: il token si rinnova da solo, senza popup.') : e.workerHealth?.auth ? t('Accesso persistente disponibile: al prossimo accesso resti collegato.') : t('Senza server l’accesso va rinnovato ogni ora (di solito in automatico).')}</p>
        <p className="text-xs text-muted">{t('L’app vede soltanto i file che crea o che apri con il Picker (permesso "drive.file"). Si sincronizza ogni 2 minuti e dopo ogni modifica; offline lavora sulla copia locale.')}</p>
      </Accordion>

      <Accordion id="push" icon={<Bell size={22} />} title={t('Notifiche')} summary={e.pushOn() ? t('Attive su questo dispositivo') : t('Disattivate')}>
        {!workerUrl() || e.workerHealth?.push === false ? (
          <Notice kind="warn">{t('Le notifiche richiedono il server (Worker) con le chiavi VAPID: vedi worker/README.md.')}</Notice>
        ) : !pushSupported() ? (
          <Notice kind="warn">{isIos() && !isStandalone() ? t('Su iPhone servono iOS 16.4+ e l’app aggiunta alla schermata Home (Condividi → Aggiungi alla schermata Home).') : t('Questo browser non supporta le notifiche push.')}</Notice>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-bg p-3">
              <div><p className="font-semibold">{t('Attiva notifiche')}</p><p className="text-xs text-muted">{t('Il coach ti avvisa dei cambi di piano; l’atleta avvisa il coach dei completamenti.')}</p></div>
              <Toggle checked={e.pushOn()} label={t('Attiva notifiche')} onChange={async (v) => { setPushBusy(true); const err = await e.setPush(v); setPushMsg(err ?? ''); setPushBusy(false) }} />
            </div>
            {e.pushOn() && <button className="btn btn-soft w-full" disabled={pushBusy} onClick={async () => { setPushBusy(true); setPushMsg(await e.testPush()); setPushBusy(false) }}>{t('Invia una notifica di prova')}</button>}
            {pushMsg && <Notice kind="trf">{pushMsg}</Notice>}
            {isIos() && !isStandalone() && <Notice kind="warn">{t('Su iPhone le notifiche funzionano solo con l’app aggiunta alla schermata Home.')}</Notice>}
            <p className="text-xs text-muted">{t('Il contenuto delle notifiche passa dal server in forma cifrata e non viene conservato. Vale per questo dispositivo.')}</p>
          </>
        )}
      </Accordion>

      <Accordion id="link" icon={<Link2 size={22} />} title={t('Collegati a un Coach')} summary={e.invites.length ? t('{n} inviti ricevuti', { n: e.invites.length }) : linked.length ? linked.map((l) => l.name).join(', ') : t('Nessun piano collegato')} defaultOpen={!!pendingJoin() || e.invites.length > 0}>
        {e.invites.map((h) => (
          <div key={h.id} className="flex items-center justify-between gap-2 rounded-2xl border border-brand/30 bg-brand/10 p-3">
            <span className="min-w-0"><span className="block text-xs font-semibold text-muted">{t('Invito dal coach')}</span><span className="block truncate text-sm font-bold">{e.inviteName(h)}</span></span>
            <button className="btn btn-primary !py-1.5" disabled={linking} onClick={async () => { setLinking(true); setLinkErr(''); try { await e.linkCoach(h.id); e.notify(t('Collegato! Ora vedi il piano del tuo coach.')) } catch (x) { setLinkErr(x instanceof Error ? x.message : String(x)) } setLinking(false) }}>{t('Collega')}</button>
          </div>
        ))}
        <Field label={t('Link d’invito o codice')}><input className="input" value={code} onChange={(ev) => setCode(ev.target.value)} placeholder="https://…#join=…" autoCapitalize="none" autoCorrect="off" /></Field>
        {pendingJoin() && <Notice kind="trf">{t('Invito rilevato dal link: tocca "Collega" (serve essere collegati a Google con l’account invitato).')}</Notice>}
        {!e.workerHealth?.bridge && !pickerAvailable() && <Notice kind="warn">{t('Senza il server (Worker) il coach deve condividere il file con la tua email Google; in alternativa servono API key e App ID del Google Picker (vedi README).')}</Notice>}
        {e.workerHealth?.bridge && <p className="text-xs text-muted">{t('Basta il codice: il coach lo ha già collegato al server e il file viene condiviso in automatico con il tuo account Google.')}</p>}
        {linkErr && <Notice kind="exp">{linkErr}</Notice>}
        <button className="btn btn-primary w-full" disabled={!code.trim() || linking} onClick={doLink}>{linking ? t('Collego…') : t('Collega')}</button>
        {linked.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-2 rounded-2xl bg-bg p-3">
            <span className="min-w-0 truncate text-sm font-semibold">{l.name}</span>
            <button className="btn btn-danger !py-1.5" onClick={() => e.unlinkCoach(l.id)}>{t('Scollega')}</button>
          </div>
        ))}
      </Accordion>

      <Accordion id="data" icon={<Database size={22} />} title={t('Backup e dati')} summary={t('Esporta, importa, dati demo')}>
        {src && db && (
          <>
            <p className="text-sm">{t('Piano attivo: {name}', { name: db.athlete.name })}</p>
            <button className="btn btn-soft w-full" onClick={() => downloadJSON(`trainer-backup-${slug(db.athlete.name)}.json`, db)}>{t('Esporta backup completo (JSON)')}</button>
            <Segmented id="imp" value={mode} onChange={setMode} options={[{ value: 'merge', label: t('Unisci') }, { value: 'replace', label: t('Sostituisci') }]} />
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void doImport(f); ev.target.value = '' }} />
            <button className="btn btn-soft w-full" onClick={() => file.current?.click()}>{t('Importa backup (JSON)')}</button>
            {importMsg && <Notice kind="trf">{importMsg}</Notice>}
            <p className="text-xs text-muted">{t('Il backup contiene i dati dell’atleta: non metterlo in un repository pubblico.')}</p>
          </>
        )}
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-bg p-3">
          <span className="text-sm font-semibold">{t('Mostra i dati demo')}</span>
          <Toggle checked={e.demoEnabled} onChange={(v) => e.setDemo(v)} label={t('Mostra i dati demo')} />
        </div>
        {e.demoEnabled && <button className="btn btn-soft w-full" onClick={() => void e.resetDemo().then(() => e.notify(t('Dati demo ripristinati')))}>{t('Ripristina dati demo')}</button>}
      </Accordion>

      <p className="px-2 pt-2 text-center text-xs text-muted">
        {t('I dati stanno nel tuo Google Drive e su questo dispositivo; il server facoltativo non li conserva.')}{' '}
        <a className="font-semibold text-brand underline" href={`${import.meta.env.BASE_URL}privacy.html`}>
          {t('Privacy')}
        </a>
      </p>
    </div>
  )
}

export function SettingsSheet({
  open,
  onClose,
  onOpenTutorial,
  onOpenTour,
}: {
  open: boolean
  onClose: () => void
  onOpenTutorial?: () => void
  onOpenTour?: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title={t('Impostazioni')}>
      <SettingsContent onOpenTutorial={onOpenTutorial} onOpenTour={onOpenTour} />
    </Sheet>
  )
}

export default function Profile({ onOpenTutorial }: { onOpenTutorial?: () => void }) {
  const { e } = useActive()
  useLangPref()
  return (
    <div>
      <PageHeader title={t('Impostazioni')} sub={e.account?.email ?? t('Non collegato a Google')} />
      <SettingsContent onOpenTutorial={onOpenTutorial} />
    </div>
  )
}

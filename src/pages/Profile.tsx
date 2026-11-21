import { useRef, useState } from 'react'
import { Cloud, Database, Link2, Palette, RefreshCw, UserRound, Users } from 'lucide-react'
import { t, getLangPref, setLangPref, type LangPref, useLangPref } from '../i18n'
import { SyncBadge, useActive } from '../components/common'
import { Accordion, Field, MascotPeek, Notice, PageHeader, Segmented, Toggle, catSrc } from '../components/ui'
import { applyTheme, getTheme, THEME_COLOR, type ThemePref } from '../lib/theme'
import { clearPendingJoin, pendingJoin } from '../lib/invite'
import { downloadJSON, readFileText } from '../lib/files'
import { slug } from '../lib/ids'
import { updateAthlete } from '../lib/db'
import { fmtDay } from '../lib/dates'
import { config, pickerAvailable } from '../services/googleDriveService'
import type { UserRole } from '../types'

export default function Profile() {
  const { e, src, db } = useActive()
  useLangPref()
  const [theme, setTheme] = useState<ThemePref>(getTheme)
  const [name, setName] = useState(e.profileName)
  const [code, setCode] = useState(() => pendingJoin() ?? '')
  const [linking, setLinking] = useState(false)
  const [linkErr, setLinkErr] = useState('')
  const [cid, setCid] = useState(config.clientId())
  const [api, setApi] = useState(config.apiKey())
  const [app, setApp] = useState(config.appId())
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [importMsg, setImportMsg] = useState('')
  const file = useRef<HTMLInputElement>(null)

  const st = src ? e.statusOf(src.id) : null
  const personal = e.dbOf('personal')
  const linked = e.sources().filter((s) => s.kind === 'linked')

  const pickTheme = (p: ThemePref) => { setTheme(p); applyTheme(p) }
  const doLink = async () => {
    setLinking(true); setLinkErr('')
    try { await e.linkCoach(code); clearPendingJoin(); setCode(''); e.notify(t('Collegato! Ora vedi il piano del tuo coach.')) }
    catch (x) { setLinkErr(x instanceof Error ? x.message : String(x)) }
    setLinking(false)
  }
  const doImport = async (f: File) => {
    if (!src) return
    try { await e.importDb(src.id, JSON.parse(await readFileText(f)), mode); setImportMsg(t('Backup importato.')) }
    catch (x) { setImportMsg(x instanceof Error ? x.message : t('File non valido')) }
  }

  const themeOpt: { id: ThemePref; label: string; cat: 'mochi' | 'zenitsu' | 'pair'; bg: string }[] = [
    { id: 'auto', label: t('Automatico'), cat: 'pair', bg: `linear-gradient(135deg, ${THEME_COLOR.light} 50%, ${THEME_COLOR.dark} 50%)` },
    { id: 'light', label: t('Modalità Mochi'), cat: 'mochi', bg: THEME_COLOR.light },
    { id: 'dark', label: t('Modalità Zenitsu'), cat: 'zenitsu', bg: THEME_COLOR.dark },
  ]

  return (
    <div>
      <PageHeader title={t('Profilo')} sub={e.account?.email ?? t('Non collegato a Google')} />
      <div className="space-y-3">
        <MascotPeek kind="pair" side="right">
          <Accordion id="role" icon={<Users size={22} />} title={t('Ruolo')} summary={e.role === 'coach' ? t('Coach') : t('Atleta')} defaultOpen>
            <Segmented id="role" value={e.role} onChange={(r: UserRole) => e.setRole(r)} options={[{ value: 'athlete', label: t('Atleta') }, { value: 'coach', label: t('Coach') }]} />
            <p className="text-xs text-muted">{e.role === 'coach' ? t('Come coach gestisci gli atleti: ognuno ha un file dedicato sul tuo Drive. Puoi allenare anche te stesso dal tab "Piano" scegliendo "Il mio piano".') : t('Come atleta vedi il tuo piano, completi gli allenamenti e lasci feedback. Puoi avere un piano personale e uno o più piani collegati a un coach.')}</p>
          </Accordion>
        </MascotPeek>

        <Accordion id="look" icon={<Palette size={22} />} title={t('Aspetto')} summary={`${themeOpt.find((o) => o.id === theme)?.label} · ${{ auto: t('Lingua automatica'), it: 'Italiano', en: 'English' }[getLangPref()]}`}>
          <div className="grid grid-cols-3 gap-2">
            {themeOpt.map((o) => (
              <button key={o.id} onClick={() => pickTheme(o.id)} aria-pressed={theme === o.id} className={`rounded-2xl border p-2 text-center text-xs font-semibold ${theme === o.id ? 'border-brand bg-brand/10' : 'border-line'}`}>
                <span className="mb-1.5 flex h-16 items-end justify-center overflow-hidden rounded-xl border border-line/60" style={{ background: o.bg }}>
                  <img src={catSrc(o.cat)} alt="" draggable={false} className="h-14 w-auto select-none" />
                </span>
                {o.label}
              </button>
            ))}
          </div>
          <Field label={t('Lingua')}>
            <Segmented id="lang" value={getLangPref()} onChange={(v: LangPref) => setLangPref(v)} options={[{ value: 'auto', label: t('Auto') }, { value: 'it', label: 'Italiano' }, { value: 'en', label: 'English' }]} />
          </Field>
          <p className="text-xs text-muted">{t('Tema e lingua valgono solo per questo dispositivo.')}</p>
        </Accordion>

        <Accordion id="me" icon={<UserRound size={22} />} title={t('Il mio profilo')} summary={e.profileName || t('Nome non impostato')}>
          <Field label={t('Il tuo nome')}><input className="input" value={name} onChange={(ev) => setName(ev.target.value)} onBlur={() => name !== e.profileName && e.setProfileName(name.trim())} /></Field>
          {personal && <Field label={t('Disciplina / obiettivo del tuo piano personale')}><input className="input" defaultValue={personal.athlete.focus} placeholder={t('es. Hyrox · Mezza maratona')} onBlur={(ev) => ev.target.value !== personal.athlete.focus && e.mutate('personal', (d) => updateAthlete(d, { focus: ev.target.value.trim() }, e.by()))} /></Field>}
          <p className="text-xs text-muted">{t('Salvato nel profilo del piano e sincronizzato sui tuoi dispositivi.')}</p>
        </Accordion>

        <Accordion id="sync" icon={<Cloud size={22} />} title={t('Sincronizzazione e account')} summary={e.account?.email ?? (e.authState === 'expired' ? t('Sessione scaduta') : t('Non collegato'))} defaultOpen={!e.isAuthed()}>
          {!config.fromBuild() && (
            <div className="space-y-2">
              <Field label="Google Client ID"><input className="input" value={cid} onChange={(ev) => setCid(ev.target.value)} onBlur={() => config.save('clientId', cid)} placeholder="1234-abc.apps.googleusercontent.com" autoCapitalize="none" /></Field>
              <details className="text-sm"><summary className="cursor-pointer py-1 font-semibold text-brand">{t('Opzioni avanzate (Picker)')}</summary>
                <div className="mt-2 space-y-2">
                  <Field label="API key"><input className="input" value={api} onChange={(ev) => setApi(ev.target.value)} onBlur={() => config.save('apiKey', api)} autoCapitalize="none" /></Field>
                  <Field label="App ID (project number)"><input className="input" value={app} onChange={(ev) => setApp(ev.target.value)} onBlur={() => config.save('appId', app)} inputMode="numeric" /></Field>
                </div>
              </details>
            </div>
          )}
          {!config.clientId() && <Notice kind="warn">{t('Inserisci il Client ID OAuth di Google Cloud per attivare la sincronizzazione (vedi README). Senza, l’app funziona solo su questo dispositivo.')}</Notice>}
          <div className="flex flex-wrap gap-2">
            {e.isAuthed()
              ? <button className="btn btn-danger flex-1" onClick={() => e.disconnect()}>{t('Scollega account')}</button>
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
          <p className="text-xs text-muted">{t('L’app vede soltanto i file che crea o che apri con il Picker (permesso "drive.file"). Si sincronizza ogni 2 minuti e dopo ogni modifica; offline lavora sulla copia locale.')}</p>
        </Accordion>

        <Accordion id="link" icon={<Link2 size={22} />} title={t('Collegati a un Coach')} summary={linked.length ? linked.map((l) => l.name).join(', ') : t('Nessun piano collegato')} defaultOpen={!!pendingJoin()}>
          <Field label={t('Link d’invito o codice')}><input className="input" value={code} onChange={(ev) => setCode(ev.target.value)} placeholder="https://…#join=…" autoCapitalize="none" autoCorrect="off" /></Field>
          {pendingJoin() && <Notice kind="trf">{t('Invito rilevato dal link: tocca "Collega" (serve essere collegati a Google con l’account invitato).')}</Notice>}
          {!pickerAvailable() && <Notice kind="warn">{t('Per aprire il file condiviso dal coach servono API key e App ID del Google Picker (vedi README).')}</Notice>}
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

        <p className="px-2 pb-4 text-center text-xs text-muted">{t('Nessun server nostro: i dati stanno nel tuo Google Drive e su questo dispositivo.')} <a className="font-semibold text-brand underline" href={`${import.meta.env.BASE_URL}privacy.html`}>{t('Privacy')}</a></p>
      </div>
    </div>
  )
}

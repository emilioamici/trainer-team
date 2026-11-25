import { useEffect, useRef, useState } from 'react'
import { Copy, Download, FileUp, Loader2, Sparkles, Wand2 } from 'lucide-react'
import { lang, t } from '../i18n'
import { buildImportPrompt } from '../lib/aiPrompt'
import { copyText, downloadJSON, readFileText } from '../lib/files'
import { addDays, todayISO, weekStart } from '../lib/dates'
import { addSessions } from '../lib/db'
import {
  cloneSessionsWithNewIds,
  exportAllAthletes,
  exportPlan,
  isMultiAthletePlan,
  parseMultiAthletePlan,
  parsePlanFile,
  templatePlan,
} from '../lib/planIO'
import { slug } from '../lib/ids'
import { aiAvailable, convertWithAi } from '../services/aiService'
import { getToken } from '../services/googleDriveService'
import { WorkerError } from '../services/workerService'
import { useEngine } from '../state/store'
import type { Source, TrainingPlanDatabase } from '../types'
import { Field, Fold, Notice, Segmented, Sheet } from './ui'

export function ImportExportSheet({
  open,
  onClose,
  src: initialSrc,
  db: initialDb,
  week,
  canEdit: initialCanEdit,
  initialAthleteSourceId,
}: {
  open: boolean
  onClose: () => void
  src?: Source | null
  db?: TrainingPlanDatabase | null
  week?: string
  canEdit?: boolean
  initialAthleteSourceId?: string | null
}) {
  const e = useEngine()
  const today = todayISO()
  const defaultWeek = week ?? weekStart(today)
  const allSources = e.sources()
  const coachAthleteSources = allSources.filter((s) => s.kind === 'coach-athlete' || s.kind === 'demo')

  const [tab, setTab] = useState<'export' | 'import'>('export')
  const [selectedSourceId, setSelectedSourceId] = useState<string>(
    initialAthleteSourceId ?? initialSrc?.id ?? e.active()?.id ?? allSources[0]?.id ?? 'personal',
  )
  const [importScope, setImportScope] = useState<'selected' | 'all'>('selected')
  const [text, setText] = useState('')
  const [start, setStart] = useState(defaultWeek)
  const [err, setErr] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const aiFile = useRef<HTMLInputElement>(null)
  const [aiOn, setAiOn] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiLeft, setAiLeft] = useState<string>('')
  useEffect(() => { if (open && e.role === 'coach') void aiAvailable().then(setAiOn) }, [open, e.role])

  const runAi = async (f: File) => {
    setErr('')
    const token = getToken()
    if (!token) { setErr(t('Accedi con Google per usare l’AI.')); return }
    setAiBusy(true)
    try {
      const r = await convertWithAi(f, buildImportPrompt({ lang: lang(), athleteName: currentDb?.athlete.name, today: todayISO() }), token)
      setText(r.text)
      setAiLeft(t('Importazioni AI rimaste questo mese: {n} su {tot}', { n: r.remaining, tot: r.limit }))
      e.notify(t('Fatto: controlla il JSON qui sotto, poi premi «Importa nel piano»'))
    } catch (x) {
      setErr(x instanceof WorkerError ? x.message : x instanceof Error ? x.message : String(x))
    } finally { setAiBusy(false) }
  }

  useEffect(() => {
    if (open) {
      setErr('')
      setText('')
      setStart(week ?? weekStart(todayISO()))
      if (initialAthleteSourceId) {
        setSelectedSourceId(initialAthleteSourceId)
      } else if (initialSrc?.id) {
        setSelectedSourceId(initialSrc.id)
      } else if (e.active()?.id) {
        setSelectedSourceId(e.active()!.id)
      }
    }
  }, [open, initialAthleteSourceId, initialSrc?.id, week, e])

  const currentSrc = allSources.find((s) => s.id === selectedSourceId) ?? e.active() ?? initialSrc ?? null
  const currentDb = currentSrc ? e.dbOf(currentSrc.id) : (initialDb ?? null)
  const canEdit = currentSrc ? e.canEditPlan(currentSrc) : (initialCanEdit ?? true)
  const base = `trainer-${slug(currentDb?.athlete.name ?? 'piano')}`
  const exportWeek = week ?? weekStart(today)

  const isMulti = isMultiAthletePlan(text)
  const multiInfo = isMulti
    ? (() => {
        try {
          return parseMultiAthletePlan(text, weekStart(start), 'coach')
        } catch {
          return null
        }
      })()
    : null

  const doExportAll = () => {
    const athletesData = coachAthleteSources
      .map((s) => ({ source: s, db: e.dbOf(s.id)! }))
      .filter((x) => !!x.db)
    downloadJSON('trainer-team-tutti-gli-atleti.json', exportAllAthletes(athletesData))
  }

  const doImport = () => {
    setErr('')
    try {
      const monday = weekStart(start)
      const byRole = e.role === 'coach' && currentSrc?.kind !== 'linked' ? 'coach' : 'athlete'

      if (isMulti) {
        const parsedMulti = parseMultiAthletePlan(text, monday, byRole)
        if (!parsedMulti.athletes.length) {
          setErr(t('Nessuna sessione valida trovata nel file.'))
          return
        }

        let totalSessions = 0
        let matchedCount = 0

        for (const item of parsedMulti.athletes) {
          if (!item.sessions.length) continue
          const match = coachAthleteSources.find((s) => {
            const db = e.dbOf(s.id)
            if (!db) return false
            if (item.athleteId && (db.athlete.id === item.athleteId || s.id === 'athlete:' + item.athleteId)) return true
            return db.athlete.name.trim().toLowerCase() === item.athleteName.trim().toLowerCase()
          })

          if (match) {
            e.mutate(match.id, (d) => addSessions(d, item.sessions, e.by()))
            e.announce(match.id, { type: 'plan' })
            totalSessions += item.sessions.length
            matchedCount++
          }
        }

        if (matchedCount > 0) {
          e.notify(t('Importate {n} sessioni per {k} atleti', { n: totalSessions, k: matchedCount }))
          setText('')
          onClose()
          return
        }

        if (currentSrc && parsedMulti.athletes[0]?.sessions.length) {
          const first = parsedMulti.athletes[0]
          e.mutate(currentSrc.id, (d) => addSessions(d, first.sessions, e.by()))
          e.announce(currentSrc.id, { type: 'plan' })
          e.notify(
            t('Nessun atleta corrispondente trovato: importate {n} sessioni in {name}', {
              n: first.sessions.length,
              name: currentSrc.name,
            }),
          )
          setText('')
          onClose()
          return
        }

        setErr(t('Nessuna sessione valida trovata nel file.'))
        return
      }

      const r = parsePlanFile(text, monday, byRole)
      if (!r.sessions.length) {
        setErr(t('Nessuna sessione valida trovata nel file.'))
        return
      }

      if (e.role === 'coach' && importScope === 'all' && coachAthleteSources.length > 0) {
        for (const s of coachAthleteSources) {
          const sessions = cloneSessionsWithNewIds(r.sessions)
          e.mutate(s.id, (d) => addSessions(d, sessions, e.by()))
          e.announce(s.id, { type: 'plan' })
        }
        e.notify(t('Importate {n} sessioni per {k} atleti', { n: r.sessions.length, k: coachAthleteSources.length }))
        setText('')
        onClose()
        return
      }

      if (!currentSrc) {
        setErr(t('Nessun piano selezionato.'))
        return
      }

      e.mutate(currentSrc.id, (d) => addSessions(d, r.sessions, e.by()))
      e.announce(currentSrc.id, { type: 'plan' })
      e.notify(
        r.skipped
          ? t('Importate {n} sessioni ({k} ignorate)', { n: r.sessions.length, k: r.skipped })
          : t('Importate {n} sessioni', { n: r.sessions.length }),
      )
      setText('')
      onClose()
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x))
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('Importa / Esporta')}>
      <div className="space-y-4 pb-2">
        {e.role === 'coach' && allSources.length > 1 && (
          <Field label={t('Atleta')}>
            <select
              className="input font-semibold"
              value={selectedSourceId}
              onChange={(ev) => setSelectedSourceId(ev.target.value)}
            >
              {allSources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.kind === 'demo' ? `(${t('demo')})` : s.kind === 'personal' ? `(${t('Il mio piano')})` : ''}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Segmented
          id="ie"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'export', label: t('Esporta') },
            { value: 'import', label: t('Importa') },
          ]}
        />

        {tab === 'export' ? (
          <div className="space-y-2">
            {currentDb && (
              <>
                <button
                  className="btn btn-soft w-full"
                  onClick={() =>
                    downloadJSON(
                      `${base}-settimana-${exportWeek}.json`,
                      exportPlan(currentDb, { from: exportWeek, to: addDays(exportWeek, 6) }),
                    )
                  }
                >
                  <Download size={16} />
                  {t('Questa settimana')}
                </button>
                <button className="btn btn-soft w-full" onClick={() => downloadJSON(`${base}-piano.json`, exportPlan(currentDb))}>
                  <Download size={16} />
                  {t('Tutto il piano')}
                </button>
                <button
                  className="btn btn-soft w-full"
                  onClick={() => downloadJSON(`${base}-piano-con-feedback.json`, exportPlan(currentDb, { withLog: true }))}
                >
                  <Download size={16} />
                  {t('Tutto il piano, con feedback')}
                </button>
              </>
            )}

            {e.role === 'coach' && coachAthleteSources.length > 0 && (
              <div className="space-y-2 border-t border-line/60 pt-2">
                <p className="label">{t('Tutti gli atleti')}</p>
                <button className="btn btn-soft w-full" onClick={doExportAll}>
                  <Download size={16} />
                  {t('Esporta tutti gli atleti ({n} atleti)', { n: coachAthleteSources.length })}
                </button>
              </div>
            )}

            <button className="btn btn-soft w-full" onClick={() => downloadJSON('trainer-modello-piano.json', templatePlan())}>
              <Download size={16} />
              {t('Scarica il modello (settimana tipo)')}
            </button>
            <p className="text-xs text-muted">
              {t('Il file contiene gli allenamenti: condividilo solo con chi vuoi e non metterlo in un repository pubblico.')}
            </p>
          </div>
        ) : !canEdit ? (
          <Notice kind="warn">{t('Il tuo coach non ti ha abilitato a modificare il piano.')}</Notice>
        ) : (
          <div className="space-y-3">
            {e.role === 'coach' && coachAthleteSources.length > 0 && !isMulti && (
              <Field label={t('Destinazione')}>
                <Segmented
                  id="import-scope"
                  value={importScope}
                  onChange={(v) => setImportScope(v as 'selected' | 'all')}
                  options={[
                    { value: 'selected', label: t('Solo {name}', { name: currentDb?.athlete.name ?? t('Atleta') }) },
                    { value: 'all', label: t('Tutti gli atleti ({n})', { n: coachAthleteSources.length }) },
                  ]}
                />
              </Field>
            )}

            {/* Prompt per qualsiasi AI: da un file con un piano già fatto al JSON importabile */}
            <Fold id="import-ai" icon={<Sparkles size={18} />} title={t('Hai già un piano in un file? Fallo convertire da un’AI')} summary={t('Copia un prompt da incollare nella tua AI')}>
              {aiOn && (
                <div className="space-y-2 rounded-2xl bg-brand/10 p-3">
                  <input ref={aiFile} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.txt,.csv,.md,.html,image/*,application/pdf"
                    onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ''; if (f) void runAi(f) }} />
                  <button type="button" className="btn btn-primary w-full" disabled={aiBusy} onClick={() => aiFile.current?.click()}>
                    {aiBusy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                    {aiBusy ? t('Sto leggendo il file…') : t('Converti un file con l’AI')}
                  </button>
                  <p className="text-xs text-muted">
                    {t('Scegli un PDF, una foto o un CSV: il file viene letto da Gemini (Google) e il risultato compare qui sotto per un controllo. Per Word o Excel esporta prima in PDF. Massimo 5 MB e poche importazioni al mese.')}
                  </p>
                  {aiLeft && <p className="text-xs font-semibold">{aiLeft}</p>}
                </div>
              )}
              <p className="text-xs text-muted">
                {t('Hai un piano in un PDF, Excel, Word, foto o altro file? 1) Copia il prompt. 2) Incollalo nella tua AI (ChatGPT, Claude, Gemini…) e allega il file. 3) Copia il JSON che ti risponde e incollalo qui sotto.')}
              </p>
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={async () => {
                  const ok = await copyText(buildImportPrompt({ lang: lang(), athleteName: currentDb?.athlete.name, today: todayISO() }))
                  e.notify(ok ? t('Prompt copiato: incollalo nella tua AI e allega il file') : t('Copia non riuscita'), ok ? 'ok' : 'err')
                }}
              >
                <Copy size={16} />
                {t('Copia il prompt per l’AI')}
              </button>
              <details className="text-xs">
                <summary className="cursor-pointer py-1 font-semibold text-brand">{t('Mostra il prompt')}</summary>
                <textarea
                  readOnly
                  className="input mt-2 min-h-40 font-mono text-[11px]"
                  aria-label={t('Prompt per l’AI')}
                  value={buildImportPrompt({ lang: lang(), athleteName: currentDb?.athlete.name, today: todayISO() })}
                  onFocus={(ev) => ev.currentTarget.select()}
                />
              </details>
              <p className="text-xs text-muted">{t('L’AI vede il contenuto del file: se contiene dati personali, usa un servizio di cui ti fidi.')}</p>
            </Fold>

            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (ev) => {
                const f = ev.target.files?.[0]
                if (f) setText(await readFileText(f))
                ev.target.value = ''
              }}
            />
            <button className="btn btn-soft w-full" onClick={() => file.current?.click()}>
              <FileUp size={16} />
              {t('Scegli un file JSON')}
            </button>
            <Field label={t('…oppure incolla il JSON')}>
              <textarea className="input min-h-28 font-mono text-xs" value={text} onChange={(ev) => setText(ev.target.value)} />
            </Field>

            {multiInfo && multiInfo.athletes.length > 0 && (
              <Notice kind="trf">
                {t('File multi-atleta rilevato: {n} atleti ({names})', {
                  n: multiInfo.athletes.length,
                  names: multiInfo.athletes.map((a) => a.athleteName).join(', '),
                })}
              </Notice>
            )}

            <Field label={t('Lunedì della settimana di partenza')}>
              <input type="date" className="input" value={start} onChange={(ev) => ev.target.value && setStart(ev.target.value)} />
            </Field>
            <p className="text-xs text-muted">
              {t(
                'Le sessioni con "day" (1-7) partono da questa settimana; quelle con "date" restano alla loro data. Le sessioni vengono aggiunte al piano esistente.',
              )}
            </p>
            {err && <Notice kind="exp">{err}</Notice>}
            <button className="btn btn-primary w-full" disabled={!text.trim()} onClick={doImport}>
              {t('Importa nel piano')}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  )
}

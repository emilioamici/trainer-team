import { useRef, useState } from 'react'
import { Download, FileUp } from 'lucide-react'
import { t } from '../i18n'
import { downloadJSON, readFileText } from '../lib/files'
import { addDays, weekStart } from '../lib/dates'
import { addSessions } from '../lib/db'
import { exportPlan, parsePlanFile, templatePlan } from '../lib/planIO'
import { slug } from '../lib/ids'
import { useEngine } from '../state/store'
import type { Source, TrainingPlanDatabase } from '../types'
import { Field, Notice, Segmented, Sheet } from './ui'

export function ImportExportSheet({ open, onClose, src, db, week, canEdit }: { open: boolean; onClose: () => void; src: Source; db: TrainingPlanDatabase; week: string; canEdit: boolean }) {
  const e = useEngine()
  const [tab, setTab] = useState<'export' | 'import'>('export')
  const [text, setText] = useState('')
  const [start, setStart] = useState(week)
  const [err, setErr] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const base = `trainer-${slug(db.athlete.name)}`

  const doImport = () => {
    setErr('')
    try {
      const r = parsePlanFile(text, weekStart(start), e.role === 'coach' && src.kind !== 'linked' ? 'coach' : 'athlete')
      if (!r.sessions.length) { setErr(t('Nessuna sessione valida trovata nel file.')); return }
      e.mutate(src.id, (d) => addSessions(d, r.sessions, e.by()))
      e.notify(r.skipped ? t('Importate {n} sessioni ({k} ignorate)', { n: r.sessions.length, k: r.skipped }) : t('Importate {n} sessioni', { n: r.sessions.length }))
      setText(''); onClose()
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)) }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('Importa / Esporta')}>
      <div className="space-y-4 pb-2">
        <Segmented id="ie" value={tab} onChange={setTab} options={[{ value: 'export', label: t('Esporta') }, { value: 'import', label: t('Importa') }]} />
        {tab === 'export' ? (
          <div className="space-y-2">
            <button className="btn btn-soft w-full" onClick={() => downloadJSON(`${base}-settimana-${week}.json`, exportPlan(db, { from: week, to: addDays(week, 6) }))}><Download size={16} />{t('Questa settimana')}</button>
            <button className="btn btn-soft w-full" onClick={() => downloadJSON(`${base}-piano.json`, exportPlan(db))}><Download size={16} />{t('Tutto il piano')}</button>
            <button className="btn btn-soft w-full" onClick={() => downloadJSON(`${base}-piano-con-feedback.json`, exportPlan(db, { withLog: true }))}><Download size={16} />{t('Tutto il piano, con feedback')}</button>
            <button className="btn btn-soft w-full" onClick={() => downloadJSON('trainer-modello-piano.json', templatePlan())}><Download size={16} />{t('Scarica il modello (settimana tipo)')}</button>
            <p className="text-xs text-muted">{t('Il file contiene gli allenamenti: condividilo solo con chi vuoi e non metterlo in un repository pubblico.')}</p>
          </div>
        ) : !canEdit ? (
          <Notice kind="warn">{t('Il tuo coach non ti ha abilitato a modificare il piano.')}</Notice>
        ) : (
          <div className="space-y-3">
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={async (ev) => { const f = ev.target.files?.[0]; if (f) setText(await readFileText(f)); ev.target.value = '' }} />
            <button className="btn btn-soft w-full" onClick={() => file.current?.click()}><FileUp size={16} />{t('Scegli un file JSON')}</button>
            <Field label={t('…oppure incolla il JSON')}><textarea className="input min-h-28 font-mono text-xs" value={text} onChange={(ev) => setText(ev.target.value)} /></Field>
            <Field label={t('Lunedì della settimana di partenza')}><input type="date" className="input" value={start} onChange={(ev) => ev.target.value && setStart(ev.target.value)} /></Field>
            <p className="text-xs text-muted">{t('Le sessioni con "day" (1-7) partono da questa settimana; quelle con "date" restano alla loro data. Le sessioni vengono aggiunte al piano esistente.')}</p>
            {err && <Notice kind="exp">{err}</Notice>}
            <button className="btn btn-primary w-full" disabled={!text.trim()} onClick={doImport}>{t('Importa nel piano')}</button>
          </div>
        )}
      </div>
    </Sheet>
  )
}

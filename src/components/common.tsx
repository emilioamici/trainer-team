import { Cloud, CloudOff, FlaskConical, Link2, Loader2, TriangleAlert, User, Users, CircleAlert, Check } from 'lucide-react'
import { t, T } from '../i18n'
import { useEngine } from '../state/store'
import type { Source, SyncStatus } from '../types'
import { Badge } from './ui'

const STATUS: Record<SyncStatus, { label: string; cls: string; icon: typeof Cloud }> = {
  local: { label: T('Solo su questo dispositivo'), cls: 'bg-line/60 text-muted', icon: CloudOff },
  syncing: { label: T('Sincronizzo…'), cls: 'bg-trf/15 text-trf', icon: Loader2 },
  synced: { label: T('Sincronizzato'), cls: 'bg-inc/15 text-inc', icon: Check },
  pending: { label: T('Modifiche da inviare'), cls: 'bg-warn/15 text-warn', icon: Cloud },
  offline: { label: T('Offline'), cls: 'bg-line/60 text-muted', icon: CloudOff },
  auth: { label: T('Accedi di nuovo'), cls: 'bg-warn/15 text-warn', icon: TriangleAlert },
  error: { label: T('Errore di sincronizzazione'), cls: 'bg-exp/15 text-exp', icon: CircleAlert },
}

export function SyncBadge({ status }: { status: SyncStatus }) {
  const s = STATUS[status]
  const Icon = s.icon
  return <Badge className={s.cls}><Icon size={12} className={status === 'syncing' ? 'animate-spin' : ''} />{t(s.label)}</Badge>
}

export const kindIcon = (s: Source) => (s.kind === 'demo' ? FlaskConical : s.kind === 'linked' ? Link2 : s.kind === 'coach-athlete' ? Users : User)

/** Selettore rapido del piano attivo (profilo dell'atleta nel ruolo coach; piano personale/del coach nel ruolo atleta). */
export function SourcePicker() {
  const e = useEngine()
  const list = e.sources()
  const active = e.active()
  if (list.length < 2) return null
  return (
    <div data-tour="source-picker" className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label={t('Piano attivo')}>
      {list.map((s) => {
        const Icon = kindIcon(s)
        return (
          <button key={s.id} role="tab" aria-selected={active?.id === s.id} onClick={() => e.setActive(s.id)} className={`chip ${active?.id === s.id ? 'chip-on' : ''}`}>
            <Icon size={14} />{s.kind === 'demo' ? `${s.name} · ${t('demo')}` : s.name}
          </button>
        )
      })}
    </div>
  )
}

/** Piano attivo + permessi, per le pagine che lavorano su un solo piano. */
export function useActive() {
  const e = useEngine()
  const src = e.active()
  const db = src ? e.dbOf(src.id) : null
  return { e, src, db, canEdit: e.canEditPlan(src), canLog: e.canLog(src), role: e.role }
}

import { t } from '../i18n'
import type { SourceKind, TrainingPlanDatabase, WorkoutSession } from '../types'
import type { AppNotification } from './notifications'

type Notice = Omit<AppNotification, 'id' | 'at' | 'read'>
const MAX_SINGLE = 3 // oltre, un solo avviso riepilogativo

const labelOf = (s: WorkoutSession) => {
  const base = s.status === 'done' ? t('Completato: {title}', { title: s.title }) : s.status === 'partial' ? t('Parziale: {title}', { title: s.title }) : t('Saltato: {title}', { title: s.title })
  return s.feedback?.rpe && s.status !== 'skipped' ? `${base} · RPE ${s.feedback.rpe}` : base
}

/**
 * Confronta la copia locale (prima del merge) con il risultato del merge: ciò che differisce arriva da un altro utente.
 * Mai avvisi per le proprie modifiche. Coach → feedback degli atleti; atleta → modifiche del coach al piano.
 */
export const diffNotifications = (prev: TrainingPlanDatabase, next: TrainingPlanDatabase, kind: SourceKind, sourceId: string): Notice[] => {
  const before = new Map(prev.sessions.map((s) => [s.id, s]))
  if (kind === 'coach-athlete') {
    const logged = next.sessions.filter((s) => {
      const p = before.get(s.id)
      return s.status !== 'planned' && !!p && (p.logUpdatedAt < s.logUpdatedAt) && (p.status !== s.status || JSON.stringify(p.feedback) !== JSON.stringify(s.feedback))
    })
    if (!logged.length) return []
    if (logged.length > MAX_SINGLE) return [{ title: next.athlete.name, body: t('{n} allenamenti aggiornati', { n: logged.length }), kind: 'feedback', targetId: sourceId }]
    return logged.map((s) => ({ title: next.athlete.name, body: labelOf(s), kind: 'feedback' as const, targetId: sourceId }))
  }
  if (kind === 'linked') {
    const changed = next.sessions.filter((s) => { const p = before.get(s.id); return !p || p.planUpdatedAt < s.planUpdatedAt })
    if (!changed.length) return []
    if (changed.length > MAX_SINGLE) return [{ title: t('Piano aggiornato'), body: t('Il coach ha aggiornato {n} allenamenti', { n: changed.length }), kind: 'workout', targetId: sourceId }]
    return changed.map((s) => ({ title: t('Piano aggiornato'), body: t('Il coach ha modificato «{title}»', { title: s.title }), kind: 'workout' as const, targetId: sourceId }))
  }
  return []
}

import { t } from '../i18n'
import type { UserRole } from '../types'

export type TourTab = 'today' | 'plan' | 'team'

export interface TourStep {
  id: string
  /** valore di data-tour dell'elemento da evidenziare; senza → suggerimento al centro */
  target?: string
  /** scheda da aprire prima di cercare l'elemento */
  tab?: TourTab
  /** se l'elemento non c'è (es. un solo piano → niente selettore) il passo si salta */
  optional?: boolean
  title: string
  body: string
}

const KEY = 'trainer:walkthrough_done'
const mem = new Map<string, string>()
export const isWalkthroughDone = (): boolean => {
  try { return localStorage.getItem(KEY) === '1' } catch { return mem.get(KEY) === '1' }
}
export const markWalkthroughDone = () => { try { localStorage.setItem(KEY, '1') } catch { mem.set(KEY, '1') } }
export const resetWalkthrough = () => { try { localStorage.removeItem(KEY) } catch { mem.delete(KEY) } }

/** Passi del tour. Le stringhe si traducono al momento della chiamata, quindi seguono la lingua scelta. */
export const stepsFor = (role: UserRole): TourStep[] => {
  const common = {
    nav: { id: 'nav', target: 'nav', tab: 'today' as const, title: t('Le sezioni dell’app'), body: role === 'coach'
      ? t('Oggi mostra l’allenamento del giorno, Piano il calendario e Team i tuoi gruppi e atleti.')
      : t('Oggi mostra l’allenamento del giorno, Piano il calendario e Progressi le tue statistiche.') },
    sync: { id: 'sync', target: 'sync', tab: 'today' as const, title: t('Sincronizzazione'), body: t('Mostra lo stato di Google Drive. Toccalo per sincronizzare subito: avviene anche da sola ogni 2 minuti e funziona anche offline.') },
    bell: { id: 'bell', target: 'notifications', tab: 'today' as const, title: t('Notifiche'), body: role === 'coach'
      ? t('Qui trovi gli avvisi, per esempio il feedback appena lasciato da un atleta.')
      : t('Qui trovi gli avvisi, per esempio quando il coach cambia il tuo piano.') },
  }
  if (role === 'coach') {
    return [
      common.nav,
      { id: 'team-add', target: 'team-add', tab: 'team', title: t('Aggiungi gruppi e atleti'), body: t('Crea un gruppo della scuola tennis o un atleta individuale. Ognuno ha un file dedicato sul tuo Drive, così i dati restano separati.') },
      { id: 'team-card', target: 'team-card', tab: 'team', title: t('La scheda di un atleta'), body: t('Vedi i progressi della settimana e lo stato della sincronizzazione. «Vedi piano» apre il suo calendario; l’icona a destra apre impostazioni e invito (codice o link da dare all’atleta).') },
      { id: 'team-import', target: 'team-import', tab: 'team', title: t('Importa ed esporta'), body: t('Carica un piano in formato JSON o esporta quello di un atleta, anche per riusarlo con altri.') },
      { id: 'source', target: 'source-picker', tab: 'plan', optional: true, title: t('Scegli di chi è il piano'), body: t('Con questi pulsanti passi da un gruppo o atleta all’altro, oppure al tuo piano personale.') },
      { id: 'plan-view', target: 'plan-view', tab: 'plan', title: t('Settimana e mese'), body: t('Cambia vista e scorri i periodi. Tocca un allenamento per vedere i dettagli, modificarlo, duplicarlo o eliminarlo.') },
      { id: 'plan-add', target: 'plan-add', tab: 'plan', title: t('Programma un allenamento'), body: t('Il pulsante + crea un allenamento: titolo, disciplina, orario e blocchi di riscaldamento, lavoro centrale e defaticamento.') },
      { id: 'plan-copy', target: 'plan-copy', tab: 'plan', title: t('Copia la settimana precedente'), body: t('Duplica in un tocco la settimana scorsa: comodo per i cicli che si ripetono.') },
      { id: 'today', target: 'today-card', tab: 'today', title: t('L’allenamento di oggi'), body: t('Vedi cosa è in programma oggi per l’atleta selezionato. Quando lo completa, trovi qui RPE, sensazioni e commento.') },
      common.sync, common.bell,
      { id: 'settings', target: 'settings', tab: 'today', title: t('Impostazioni'), body: t('Account Google, tema, lingua, notifiche push, ruolo e backup. Da qui rivedi anche il tutorial iniziale e questo tour.') },
    ]
  }
  return [
    common.nav,
    { id: 'today', target: 'today-card', tab: 'today', title: t('L’allenamento di oggi'), body: t('Qui trovi i blocchi dell’allenamento, le note del coach e le indicazioni su carichi e recuperi.') },
    { id: 'feedback', target: 'today-feedback', tab: 'today', title: t('Completa e lascia il feedback'), body: t('Segna l’allenamento come completato, parziale o saltato, indica lo sforzo (RPE) e le sensazioni e scrivi un commento: il coach lo vede alla prossima sincronizzazione.') },
    { id: 'week', target: 'today-week', tab: 'today', title: t('La tua settimana'), body: t('Un colpo d’occhio sui giorni con allenamenti. Toccane uno per aprirlo nel piano.') },
    { id: 'source', target: 'source-picker', tab: 'plan', optional: true, title: t('Più piani'), body: t('Se hai un piano personale e uno o più piani del tuo coach, li scegli da qui.') },
    { id: 'plan-view', target: 'plan-view', tab: 'plan', title: t('Settimana e mese'), body: t('Scorri il calendario e tocca un allenamento per vederne i dettagli.') },
    { id: 'progress', target: 'progress-stats', tab: 'team', title: t('I tuoi progressi'), body: t('Sessioni completate, ore, tasso di completamento e RPE medio, con grafici e storico.') },
    common.sync, common.bell,
    { id: 'settings', target: 'settings', tab: 'today', title: t('Impostazioni'), body: t('Account Google, tema, lingua e notifiche. Qui trovi anche «Collegati a un Coach»: incolla il codice o il link d’invito per vedere il suo piano. Da qui rivedi il tutorial e questo tour.') },
  ]
}

// ---------- posizionamento del suggerimento (funzione pura, testata) ----------
export interface Box { top: number; left: number; width: number; height: number }
export interface Placement { top: number; left: number; where: 'below' | 'above' | 'center' }

/** Sotto l'elemento se c'è spazio, altrimenti sopra; se nessuno dei due basta, al centro. Sempre dentro i margini dello schermo. */
export const placeTooltip = (target: Box | null, card: { w: number; h: number }, vp: { w: number; h: number }, opts: { gap?: number; margin?: number; bottomInset?: number } = {}): Placement => {
  const gap = opts.gap ?? 14, margin = opts.margin ?? 16, bottomInset = opts.bottomInset ?? 0
  const clampLeft = (x: number) => Math.min(Math.max(x, margin), Math.max(margin, vp.w - card.w - margin))
  const center: Placement = { top: Math.max(margin, (vp.h - card.h) / 2), left: clampLeft((vp.w - card.w) / 2), where: 'center' }
  if (!target) return center
  const left = clampLeft(target.left + target.width / 2 - card.w / 2)
  const below = target.top + target.height + gap
  if (below + card.h <= vp.h - margin - bottomInset) return { top: below, left, where: 'below' }
  const above = target.top - gap - card.h
  if (above >= margin) return { top: above, left, where: 'above' }
  return center
}

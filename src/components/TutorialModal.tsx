import { useEffect, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCheck,
  CheckCircle2,
  Dumbbell,
  Flame,
  Key,
  Share2,
  Sparkles,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import { t } from '../i18n'
import { parseInviteCode, pendingJoin, setPendingJoin } from '../lib/invite'
import { useEngine } from '../state/store'
import type { UserRole } from '../types'

export const TUTORIAL_STORAGE_KEY = 'trainer:tutorial_completed'

const memStorage = new Map<string, string>()

export function isTutorialCompleted(): boolean {
  try {
    if (typeof localStorage !== 'undefined' && localStorage?.getItem) {
      return localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true'
    }
  } catch {
    // Fallback in-memory
  }
  return memStorage.get(TUTORIAL_STORAGE_KEY) === 'true'
}

export function markTutorialCompleted(): void {
  try {
    if (typeof localStorage !== 'undefined' && localStorage?.setItem) {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true')
      return
    }
  } catch {
    // Fallback in-memory
  }
  memStorage.set(TUTORIAL_STORAGE_KEY, 'true')
}

export function resetTutorialCompleted(): void {
  try {
    if (typeof localStorage !== 'undefined' && localStorage?.removeItem) {
      localStorage.removeItem(TUTORIAL_STORAGE_KEY)
      return
    }
  } catch {
    // Fallback in-memory
  }
  memStorage.delete(TUTORIAL_STORAGE_KEY)
}

interface TutorialStep {
  id: string
  title: string
  subtitle: string
  badge: string
  icon: typeof Dumbbell
  color: string
  content: React.ReactNode
}

export function TutorialModal({
  open,
  onClose,
  initialRole,
}: {
  open: boolean
  onClose: () => void
  initialRole?: UserRole
}) {
  const e = useEngine()
  const [role, setRole] = useState<UserRole>(() => initialRole ?? e.role ?? 'coach')
  const [step, setStep] = useState(0)

  // Stato per l'inserimento del codice d'invito dell'atleta
  const [inviteInput, setInviteInput] = useState(() => pendingJoin() ?? '')
  const [codeLinked, setCodeLinked] = useState(() => !!pendingJoin())
  const [codeError, setCodeError] = useState<string | null>(null)
  const [isLinking, setIsLinking] = useState(false)

  // Quando si apre o cambia initialRole, sincronizza il ruolo
  useEffect(() => {
    if (open) {
      if (initialRole) setRole(initialRole)
      setStep(0)
      const pj = pendingJoin()
      if (pj) {
        setInviteInput(pj)
        setCodeLinked(true)
      }
    }
  }, [open, initialRole])

  // Se l'utente cambia ruolo con i chip in alto, azzera lo step
  const handleRoleChange = (newRole: UserRole) => {
    setRole(newRole)
    setStep(0)
    setCodeError(null)
  }

  const handleFinish = () => {
    markTutorialCompleted()
    onClose()
  }

  const handleValidateCode = async () => {
    setCodeError(null)
    const raw = inviteInput.trim()
    if (!raw) {
      setCodeError(t('Inserisci un codice o un link d’invito valido'))
      return
    }
    const cleanCode = parseInviteCode(raw)
    if (!cleanCode) {
      setCodeError(t('Formato codice non valido. Usa il link o il codice fornito dal coach.'))
      return
    }

    setPendingJoin(cleanCode)
    setCodeLinked(true)

    // Se l'utente è già autenticato con Google, prova a collegare subito il piano
    if (e.account) {
      setIsLinking(true)
      try {
        await e.linkCoach(cleanCode)
        e.notify(t('Collegato con successo al piano del coach!'), 'ok')
      } catch (err) {
        // Se serve Google Picker o approvazione, il codice rimane comunque salvato in pendingJoin
        console.warn('Link automatico differito:', err)
      } finally {
        setIsLinking(false)
      }
    }
  }

  // Definizione dei passi per il Coach
  const coachSteps: TutorialStep[] = [
    {
      id: 'coach-welcome',
      title: t('Benvenuto Coach su Trainer Team'),
      subtitle: t('La preparazione atletica per il tennis moderno'),
      badge: t('Panoramica'),
      icon: Trophy,
      color: 'from-amber-500 to-yellow-400',
      content: (
        <div className="space-y-3 text-sm text-ink/90">
          <p>
            {t(
              'Trainer Team è l’applicazione progettata per preparatori atletici e maestri di tennis FIT: gestisci i gruppi della scuola tennis, gli atleti agonisti individuali e le tabelle di lavoro con facilità.'
            )}
          </p>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div className="rounded-xl border border-line bg-surface/60 p-3">
              <span className="mb-1 block font-bold text-brand">{t('Gruppi Scuola Tennis')}</span>
              <span className="text-xs text-muted">
                {t('Agonistica, Under, SAT e atleti con calendario palestra dedicato.')}
              </span>
            </div>
            <div className="rounded-xl border border-line bg-surface/60 p-3">
              <span className="mb-1 block font-bold text-warn">{t('Libreria Esercizi FIT')}</span>
              <span className="text-xs text-muted">
                {t('Forza, mobilità, agilità e condizionamento per il tennis.')}
              </span>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'coach-team',
      title: t('Gestione Gruppi e Sezioni (Tab Team)'),
      subtitle: t('Organizza i tuoi allievi e pianifica gli orari'),
      badge: t('Sezione Team'),
      icon: Users,
      color: 'from-blue-600 to-cyan-500',
      content: (
        <div className="space-y-3 text-sm text-ink/90">
          <p>
            {t(
              'Dalla tab "Team" puoi creare nuove sezioni di allenamento o schede per atleti individuali.'
            )}
          </p>
          <ul className="space-y-2 text-xs">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 shrink-0 text-brand" size={15} />
              <span>
                <b>{t('Orari palestra anti-conflitto:')}</b>{' '}
                {t(
                  'Imposta i giorni della settimana e le fasce orarie; se un orario è già occupato da un altro gruppo, riceverai un alert immediato.'
                )}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 shrink-0 text-brand" size={15} />
              <span>
                <b>{t('Colori e icone personalizzate:')}</b>{' '}
                {t('Identifica visivamente ogni gruppo con un’icona e un colore dedicato.')}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 shrink-0 text-brand" size={15} />
              <span>
                <b>{t('Filtro allievi integrato:')}</b>{' '}
                {t('Cerca velocemente i ragazzi o aggiungine di nuovi direttamente dalla lista.')}
              </span>
            </li>
          </ul>
        </div>
      ),
    },
    {
      id: 'coach-invite',
      title: t('Condivisione Codice Invito Atleta'),
      subtitle: t('Collega i tuoi allievi alla scheda'),
      badge: t('Condivisione'),
      icon: Share2,
      color: 'from-emerald-500 to-teal-400',
      content: (
        <div className="space-y-3 text-sm text-ink/90">
          <p>
            {t(
              'Ogni gruppo o atleta dispone di un codice invito univoco e di un link diretto per la sincronizzazione.'
            )}
          </p>
          <div className="rounded-xl border border-line bg-surface/60 p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-ink">
              <Key size={15} className="text-brand" />
              <span>{t('Come invitare i ragazzi:')}</span>
            </div>
            <ol className="list-decimal pl-4 space-y-1.5 text-xs text-muted">
              <li>{t('Tocca l’ingranaggio (Impostazioni) sulla scheda del gruppo o atleta in Team.')}</li>
              <li>{t('Copia il codice d’invito o tocca "Condividi" per inviare il link.')}</li>
              <li>
                {t(
                  'L’atleta inserirà il codice al primo avvio dell’app per vedere subito il suo programma.'
                )}
              </li>
            </ol>
          </div>
        </div>
      ),
    },
    {
      id: 'coach-plan',
      title: t('Pianificazione Allenamenti (Tab Piano)'),
      subtitle: t('Costruisci tabelle con carichi e note tecniche'),
      badge: t('Sezione Piano'),
      icon: Calendar,
      color: 'from-purple-600 to-indigo-500',
      content: (
        <div className="space-y-3 text-sm text-ink/90">
          <p>
            {t(
              'Nel "Piano" puoi calendarizzare i workout per il giorno corrente e per le settimane successive.'
            )}
          </p>
          <ul className="space-y-2 text-xs">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 shrink-0 text-brand" size={15} />
              <span>
                <b>{t('Discipline tennis:')}</b>{' '}
                {t('Forza, potenza & pliometria, agilità, mobilità e condizionamento a circuito.')}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 shrink-0 text-brand" size={15} />
              <span>
                <b>{t('Parametri completi:')}</b>{' '}
                {t('Serie, ripetizioni, carichi consigliati e recuperi specifici.')}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 shrink-0 text-brand" size={15} />
              <span>
                <b>{t('Note tecniche:')}</b>{' '}
                {t('Inserisci indicazioni posturali e focus specifici visibili all’atleta.')}
              </span>
            </li>
          </ul>
        </div>
      ),
    },
    {
      id: 'coach-today',
      title: t('Sul Campo: Presenze e Feedback (Tab Oggi)'),
      subtitle: t('Rileva presenze e ascolta le sensazioni degli allievi'),
      badge: t('Sezione Oggi'),
      icon: CheckCheck,
      color: 'from-rose-500 to-pink-500',
      content: (
        <div className="space-y-3 text-sm text-ink/90">
          <p>
            {t(
              'Durante la sessione in palestra o sul campo, la schermata "Oggi" ti offre tutto a portata di mano:'
            )}
          </p>
          <div className="space-y-2 pt-1 text-xs">
            <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface/50 p-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand font-bold">
                ✓
              </span>
              <span>
                <b>{t('Registro Presenze:')}</b>{' '}
                {t('Spunta i presenti con un semplice tocco direttamente dal tuo telefono.')}
              </span>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface/50 p-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-warn/15 text-warn font-bold">
                ★
              </span>
              <span>
                <b>{t('Feedback degli allievi:')}</b>{' '}
                {t('Visualizza le sensazioni di fatica (RPE) e i commenti inviati a fine seduta.')}
              </span>
            </div>
          </div>
        </div>
      ),
    },
  ]

  // Definizione dei passi per l'Atleta
  const athleteSteps: TutorialStep[] = [
    {
      id: 'athlete-code',
      title: t('Primo Accesso: Inserisci il Codice Invito'),
      subtitle: t('Il tuo preparatore atletico ti ha inviato un codice'),
      badge: t('Passo 1 di 5'),
      icon: Key,
      color: 'from-brand to-blue-500',
      content: (
        <div className="space-y-3 text-sm text-ink/90">
          <p className="text-xs text-muted">
            {t(
              'Incolla qui sotto il codice o il link di invito inviato dal tuo coach per collegare la tua scheda di allenamento.'
            )}
          </p>

          <div className="space-y-2 pt-1">
            <div className="relative">
              <input
                className="input !pr-10 font-mono text-xs"
                placeholder={t('es. https://...#join=... oppure codice')}
                value={inviteInput}
                onChange={(e) => {
                  setInviteInput(e.target.value)
                  setCodeLinked(false)
                  setCodeError(null)
                }}
              />
              {codeLinked && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-inc">
                  <CheckCircle2 size={18} />
                </span>
              )}
            </div>

            {codeError && (
              <p className="text-xs font-semibold text-exp">{codeError}</p>
            )}

            {codeLinked ? (
              <div className="flex items-center gap-2 rounded-xl border border-inc/30 bg-inc/15 p-2.5 text-xs font-semibold text-inc">
                <Check size={16} />
                <span>{t('Codice registrato! Sei pronto per il tuo programma.')}</span>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-primary w-full !py-2 !text-xs font-bold"
                disabled={!inviteInput.trim() || isLinking}
                onClick={handleValidateCode}
              >
                {isLinking ? t('Verifica in corso…') : t('Conferma codice invito')}
              </button>
            )}

            {!codeLinked && (
              <p className="pt-1 text-center text-[11px] text-muted">
                {t('Non hai ancora il codice?')} (
                <button
                  type="button"
                  className="font-semibold text-brand underline"
                  onClick={() => {
                    setCodeLinked(true)
                  }}
                >
                  {t('Continua e provalo dopo')}
                </button>
                )
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'athlete-today',
      title: t('Il tuo Workout del Giorno (Tab Oggi)'),
      subtitle: t('Tutto il programma sul tuo smartphone'),
      badge: t('Passo 2 di 5'),
      icon: Dumbbell,
      color: 'from-blue-600 to-indigo-500',
      content: (
        <div className="space-y-3 text-sm text-ink/90">
          <p>
            {t(
              'Ogni giorno di allenamento troverai la tua scheda pronta nella schermata "Oggi":'
            )}
          </p>
          <ul className="space-y-2 text-xs">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 shrink-0 text-brand" size={15} />
              <span>
                <b>{t('Fasi della sessione:')}</b>{' '}
                {t('Riscaldamento specifico, blocchi di forza/potenza e defaticamento finale.')}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 shrink-0 text-brand" size={15} />
              <span>
                <b>{t('Attrezzatura indicata:')}</b>{' '}
                {t('Manubri, bilanciere, kettlebell, elastici o corpo libero per ogni esercizio.')}
              </span>
            </li>
          </ul>
        </div>
      ),
    },
    {
      id: 'athlete-exercises',
      title: t('Esecuzione, Carichi e Note del Coach'),
      subtitle: t('Precisione e prevenzione infortuni'),
      badge: t('Passo 3 di 5'),
      icon: Sparkles,
      color: 'from-amber-500 to-orange-400',
      content: (
        <div className="space-y-3 text-sm text-ink/90">
          <p>
            {t(
              'Ogni esercizio riporta i parametri scelti dal tuo coach per massimizzare la performance nel tennis:'
            )}
          </p>
          <div className="rounded-xl border border-line bg-surface/60 p-3 space-y-1.5 text-xs">
            <div className="flex justify-between font-semibold">
              <span className="text-brand">{t('Serie × Ripetizioni')}</span>
              <span className="text-muted">es. 4 × 6</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span className="text-brand">{t('Carico consigliato')}</span>
              <span className="text-muted">es. Manubri da 14 kg</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span className="text-brand">{t('Recupero')}</span>
              <span className="text-muted">es. 90 secondi</span>
            </div>
            <p className="pt-1 italic text-muted">
              {t('Note del coach: "Focus su stabilità caviglia e spinta decisa dal pavimento".')}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'athlete-feedback',
      title: t('Invia il tuo Feedback a Fine Seduta'),
      subtitle: t('Comunica con il tuo coach dopo l’allenamento'),
      badge: t('Passo 4 di 5'),
      icon: Flame,
      color: 'from-rose-500 to-amber-500',
      content: (
        <div className="space-y-3 text-sm text-ink/90">
          <p>
            {t(
              'A fine workout premi "Completa & inserisci feedback" per aggiornare il tuo coach su come è andata:'
            )}
          </p>
          <ul className="space-y-2 text-xs">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 shrink-0 text-brand" size={15} />
              <span>
                <b>{t('Sensazione di fatica (RPE):')}</b>{' '}
                {t('Scegli tra Ottimo, Normale, Duro, Molto duro o Spompato.')}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 shrink-0 text-brand" size={15} />
              <span>
                <b>{t('Note personali:')}</b>{' '}
                {t('Scrivi se hai avvertito un affaticamento muscolare o se il carico era ottimale.')}
              </span>
            </li>
          </ul>
        </div>
      ),
    },
    {
      id: 'athlete-progress',
      title: t('Presenze e Storico Stagionale'),
      subtitle: t('La tua costanza porta ai risultati'),
      badge: t('Passo 5 di 5'),
      icon: CheckCircle2,
      color: 'from-emerald-500 to-cyan-500',
      content: (
        <div className="space-y-3 text-sm text-ink/90">
          <p>
            {t(
              'Consulta la percentuale di allenamenti completati e le presenze registrate dal coach.'
            )}
          </p>
          <div className="rounded-xl border border-line bg-surface/50 p-3 text-xs text-muted">
            {t(
              'Con Trainer Team rimani sempre allineato con il tuo preparatore atletico per dare il massimo nei tornei e in campo.'
            )}
          </div>
        </div>
      ),
    },
  ]

  const currentSteps = role === 'coach' ? coachSteps : athleteSteps
  const currentStep = currentSteps[step] || currentSteps[0]
  const IconComponent = currentStep.icon

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-ink/50 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={t('Tutorial introduttivo')}
    >
      <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl">
        {/* Intestazione con selettore ruolo */}
        <div className="flex items-center justify-between border-b border-line/60 bg-surface/90 px-5 py-3.5">
          <div className="flex items-center gap-1.5 rounded-full border border-line bg-bg p-0.5 text-xs font-semibold">
            <button
              type="button"
              className={`rounded-full px-3 py-1 transition ${
                role === 'coach'
                  ? 'bg-brand text-onbrand shadow-sm font-bold'
                  : 'text-muted hover:text-ink'
              }`}
              onClick={() => handleRoleChange('coach')}
            >
              {t('Coach')}
            </button>
            <button
              type="button"
              className={`rounded-full px-3 py-1 transition ${
                role === 'athlete'
                  ? 'bg-brand text-onbrand shadow-sm font-bold'
                  : 'text-muted hover:text-ink'
              }`}
              onClick={() => handleRoleChange('athlete')}
            >
              {t('Atleta')}
            </button>
          </div>

          <button
            type="button"
            className="icon-btn !p-1 text-muted hover:text-ink"
            onClick={handleFinish}
            aria-label={t('Chiudi')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo del passo corrente con transizione animata */}
        <div className="p-5 overflow-y-auto max-h-[70vh]">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={`${role}-${currentStep.id}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${currentStep.color} text-white shadow-md`}
                >
                  <IconComponent size={24} strokeWidth={2.2} />
                </span>
                <div>
                  <span className="inline-block rounded-full bg-brand/10 px-2.5 py-0.5 text-[11px] font-bold text-brand">
                    {currentStep.badge}
                  </span>
                  <h3 className="text-lg font-bold leading-tight text-ink pt-0.5">
                    {currentStep.title}
                  </h3>
                  <p className="text-xs text-muted">{currentStep.subtitle}</p>
                </div>
              </div>

              <div className="pt-2">{currentStep.content}</div>
            </m.div>
          </AnimatePresence>
        </div>

        {/* Barra di navigazione in basso con indicatori e pulsanti */}
        <div className="flex items-center justify-between border-t border-line/60 bg-surface/90 px-5 py-3.5">
          {/* Indicatori a pallini */}
          <div className="flex items-center gap-1.5">
            {currentSteps.map((_, i) => (
              <span
                key={i}
                className={`h-2 rounded-full transition-all ${
                  i === step
                    ? 'w-6 bg-brand'
                    : 'w-2 bg-line'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 ? (
              <button
                type="button"
                className="btn btn-soft !py-1.5 !px-3 !text-xs font-semibold"
                onClick={() => setStep((s) => s - 1)}
              >
                <ArrowLeft size={14} />
                {t('Indietro')}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost !py-1.5 !px-3 !text-xs text-muted"
                onClick={handleFinish}
              >
                {t('Salta')}
              </button>
            )}

            {step < currentSteps.length - 1 ? (
              <button
                type="button"
                className="btn btn-primary !py-1.5 !px-3 !text-xs font-bold"
                onClick={() => setStep((s) => s + 1)}
              >
                {t('Avanti')}
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary !py-1.5 !px-4 !text-xs font-bold"
                onClick={handleFinish}
              >
                {t('Inizia')}
                <Check size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

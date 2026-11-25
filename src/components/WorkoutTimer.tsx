import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Pause, Play, Plus, Volume2, VolumeX, X } from 'lucide-react'
import { t } from '../i18n'
import { Fixed, Sheet } from './ui'
import { Mascot } from './Mascot'
import { fmtClock, intervalSteps, totalSeconds, type TimerStep } from '../lib/timer'

const SOUND_KEY = 'trainer:timerSound'
const loadSound = () => {
  try { return localStorage.getItem(SOUND_KEY) !== '0' } catch { return true }
}

interface Props {
  open: boolean
  title: string
  steps: TimerStep[]
  onClose: () => void
  /** chiamato dal tasto finale: minuti effettivi di allenamento */
  onFinish?: (minutes: number) => void
}

/** Player a schermo intero: guida serie, recuperi e superset. Il tempo è calcolato su orologio reale (non perde colpi in background). */
export function WorkoutTimer({ open, title, steps, onClose, onFinish }: Props) {
  const [started, setStarted] = useState(false)
  const [idx, setIdx] = useState(0)
  const [remaining, setRemaining] = useState(0) // ms
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0) // ms
  const [sound, setSound] = useState(loadSound)
  const done = started && idx >= steps.length

  const ctx = useRef<AudioContext | null>(null)
  const last = useRef(0)
  const lastBeep = useRef<number | null>(null)
  const soundRef = useRef(sound)
  soundRef.current = sound

  const beep = useCallback((freq: number, ms: number) => {
    if (!soundRef.current) return
    try {
      const c = ctx.current
      if (!c) return
      const o = c.createOscillator()
      const g = c.createGain()
      o.frequency.value = freq
      g.gain.value = 0.25
      o.connect(g).connect(c.destination)
      o.start()
      o.stop(c.currentTime + ms / 1000)
    } catch { /* audio non disponibile */ }
    try { navigator.vibrate?.(ms > 300 ? [200, 80, 200] : 60) } catch { /* ignore */ }
  }, [])

  const goTo = useCallback((i: number) => {
    setIdx(i)
    lastBeep.current = null
    const s = steps[i]
    setRemaining((s?.seconds ?? 0) * 1000)
    last.current = Date.now()
  }, [steps])

  // reset all'apertura
  useEffect(() => {
    if (!open) return
    setStarted(false); setIdx(0); setPaused(false); setElapsed(0)
    setRemaining((steps[0]?.seconds ?? 0) * 1000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const start = () => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (AC && !ctx.current) ctx.current = new AC()
      void ctx.current?.resume()
    } catch { /* ignore */ }
    setStarted(true)
    goTo(0)
    beep(660, 120)
  }

  // tick
  useEffect(() => {
    if (!open || !started || paused || done) return
    last.current = Date.now()
    const h = setInterval(() => {
      const now = Date.now()
      const dt = now - last.current
      last.current = now
      setElapsed((x) => x + dt)
      const s = steps[idx]
      if (!s?.seconds) return
      setRemaining((r) => {
        const n = r - dt
        const sec = Math.ceil(n / 1000)
        if (n > 0 && sec <= 3 && lastBeep.current !== sec) { lastBeep.current = sec; beep(880, 100) }
        if (n <= 0) {
          setTimeout(() => { beep(1040, 450); goTo(idx + 1) }, 0)
          return 0
        }
        return n
      })
    }, 200)
    return () => clearInterval(h)
  }, [open, started, paused, done, idx, steps, beep, goTo])

  // schermo acceso
  useEffect(() => {
    if (!open || !started || done) return
    let lock: WakeLockSentinel | null = null
    const get = async () => {
      try { lock = (await navigator.wakeLock?.request('screen')) ?? null } catch { /* non supportato */ }
    }
    void get()
    const vis = () => { if (document.visibilityState === 'visible') void get() }
    document.addEventListener('visibilitychange', vis)
    return () => { document.removeEventListener('visibilitychange', vis); void lock?.release().catch(() => {}) }
  }, [open, started, done])

  const toggleSound = () => {
    const v = !sound
    setSound(v)
    try { localStorage.setItem(SOUND_KEY, v ? '1' : '0') } catch { /* ignore */ }
  }

  const total = useMemo(() => totalSeconds(steps), [steps])
  if (!open) return null
  const s = steps[idx]
  const next = steps[idx + 1]
  const kindLabel = s?.kind === 'rest' ? t('Recupero') : s?.kind === 'work' ? t('Lavoro') : t('Esercizio')
  const accent = s?.kind === 'rest' ? 'text-inc' : 'text-brand'
  const mins = Math.max(1, Math.round(elapsed / 60000))

  return (
    <Fixed>
      <div role="dialog" aria-label={t('Timer allenamento')} className="fixed inset-0 z-[70] flex flex-col bg-bg px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <button className="icon-btn" aria-label={t('Chiudi timer')} onClick={onClose}><X size={20} /></button>
          <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold">{title}</p>
          <button className="icon-btn" aria-label={sound ? t('Disattiva suoni') : t('Attiva suoni')} onClick={toggleSound}>
            {sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
        </div>

        {!started ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <Mascot kind="bust" fade className="h-36" />
            <h2 className="text-2xl font-extrabold">{title}</h2>
            <p className="text-sm text-muted">
              {t('{n} passaggi', { n: steps.length })}{total ? ` · ~${Math.ceil(total / 60)} min ${t('di tempo programmato')}` : ''}
            </p>
            <p className="max-w-xs text-xs text-muted">{t('Lo schermo resta acceso durante il timer. Su iPhone i suoni funzionano solo con l’app aperta.')}</p>
            <button className="btn btn-primary !px-10 !py-3.5 text-lg" onClick={start} disabled={!steps.length}>
              <Play size={20} />{t('Inizia')}
            </button>
          </div>
        ) : done ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <Mascot className="h-52 drop-shadow-lg" />
            <h2 className="text-2xl font-extrabold">{t('Allenamento finito!')}</h2>
            <p className="text-sm text-muted">{t('Tempo totale: {time}', { time: fmtClock(elapsed / 1000) })}</p>
            {onFinish && (
              <button className="btn btn-primary w-full max-w-xs !py-3" onClick={() => onFinish(mins)}>
                <Check size={18} />{t('Completa & inserisci feedback')}
              </button>
            )}
            <button className="btn btn-soft w-full max-w-xs" onClick={onClose}>{t('Chiudi')}</button>
          </div>
        ) : (
          <>
            <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
              <div className="h-full bg-brand transition-all" style={{ width: `${(idx / steps.length) * 100}%` }} />
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <p className={`text-sm font-bold uppercase tracking-widest ${accent}`}>
                {s.superset && s.kind !== 'rest' ? `${t('Superset')} · ` : ''}{kindLabel}
              </p>
              <h2 className="px-2 text-3xl font-extrabold leading-tight" data-testid="timer-label">{s.label}</h2>
              {s.sets ? <p className="text-sm text-muted">{t('Serie {n} di {tot}', { n: s.set ?? 1, tot: s.sets })}</p> : null}
              {s.detail && <p className="text-base font-semibold">{s.detail}</p>}
              {s.seconds ? (
                <p className={`font-mono text-7xl font-extrabold tabular-nums ${accent}`} data-testid="timer-clock" aria-live="off">
                  {fmtClock(remaining / 1000)}
                </p>
              ) : (
                <button className="btn btn-primary !px-10 !py-4 text-xl" onClick={() => goTo(idx + 1)}>
                  <Check size={22} />{t('Fatto')}
                </button>
              )}
              {s.kind === 'rest' && (
                <button className="btn btn-soft !py-2 !text-xs" onClick={() => setRemaining((r) => r + 15000)}>
                  <Plus size={14} />{t('15 secondi')}
                </button>
              )}
            </div>
            <p className="mb-3 truncate text-center text-xs text-muted">
              {next ? `${t('Poi')}: ${next.kind === 'rest' ? t('Recupero') : next.label}${next.seconds ? ` · ${fmtClock(next.seconds)}` : ''}` : t('Ultimo passaggio')}
              {' · '}{fmtClock(elapsed / 1000)}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button className="btn btn-soft !p-4" aria-label={t('Indietro')} disabled={idx === 0} onClick={() => goTo(idx - 1)}><ChevronLeft size={22} /></button>
              <button className="btn btn-primary !p-5" aria-label={paused ? t('Riprendi') : t('Pausa')} onClick={() => setPaused((p) => !p)}>
                {paused ? <Play size={26} /> : <Pause size={26} />}
              </button>
              <button className="btn btn-soft !p-4" aria-label={t('Salta')} onClick={() => goTo(idx + 1)}><ChevronRight size={22} /></button>
            </div>
          </>
        )}
      </div>
    </Fixed>
  )
}

const PRESET = [20, 30, 45, 60, 90, 120]
const sLabel = (n: number) => (n >= 60 && n % 60 === 0 ? `${n / 60}'` : `${n}''`)

/** Timer rapido a intervalli (lavoro / recupero / giri), indipendente da un allenamento. */
export function QuickTimer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [work, setWork] = useState(30)
  const [rest, setRest] = useState(30)
  const [rounds, setRounds] = useState(5)
  const [run, setRun] = useState(false)
  const steps = useMemo(() => intervalSteps(work, rest, rounds).map((x) => ({ ...x, label: x.kind === 'rest' ? t('Recupero') : t('Lavoro') })), [work, rest, rounds])

  const Chips = ({ value, onChange, allowZero }: { value: number; onChange: (n: number) => void; allowZero?: boolean }) => (
    <div className="flex flex-wrap gap-2">
      {(allowZero ? [0, ...PRESET] : PRESET).map((n) => (
        <button key={n} type="button" className={`btn !px-3 !py-1.5 !text-xs ${value === n ? 'btn-primary' : 'btn-soft'}`} aria-pressed={value === n} onClick={() => onChange(n)}>
          {n === 0 ? t('Nessuno') : sLabel(n)}
        </button>
      ))}
    </div>
  )

  return (
    <>
      <Sheet open={open && !run} onClose={onClose} title={t('Timer rapido')}>
        <div className="space-y-4">
          <div><p className="label">{t('Lavoro')}</p><Chips value={work} onChange={setWork} /></div>
          <div><p className="label">{t('Recupero')}</p><Chips value={rest} onChange={setRest} allowZero /></div>
          <div>
            <p className="label">{t('Giri')}</p>
            <div className="flex items-center gap-3">
              <button type="button" className="btn btn-soft !p-2.5" aria-label={t('Meno giri')} onClick={() => setRounds((r) => Math.max(1, r - 1))}>−</button>
              <span className="w-8 text-center text-lg font-bold" data-testid="quick-rounds">{rounds}</span>
              <button type="button" className="btn btn-soft !p-2.5" aria-label={t('Più giri')} onClick={() => setRounds((r) => Math.min(50, r + 1))}>+</button>
            </div>
          </div>
          <button className="btn btn-primary w-full !py-3" onClick={() => setRun(true)}><Play size={18} />{t('Avvia')}</button>
        </div>
      </Sheet>
      <WorkoutTimer open={open && run} title={t('Timer rapido')} steps={steps} onClose={() => { setRun(false); onClose() }} />
    </>
  )
}

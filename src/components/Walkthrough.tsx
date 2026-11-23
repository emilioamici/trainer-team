import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { t } from '../i18n'
import { markWalkthroughDone, placeTooltip, stepsFor, type Box, type TourTab } from '../lib/walkthrough'
import type { UserRole } from '../types'

const PAD = 6 // aria attorno all'elemento evidenziato
const find = (target?: string): HTMLElement | null => (target ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`) : null)
const visible = (el: HTMLElement | null) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }

/** Tour guidato: evidenzia gli elementi reali dell'app, cambiando scheda quando serve. */
export function Walkthrough({ open, role, tab, onTab, onClose }: { open: boolean; role: UserRole; tab: TourTab; onTab: (t: TourTab) => void; onClose: () => void }) {
  const steps = stepsFor(role)
  const [i, setI] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const [dir, setDir] = useState<1 | -1>(1)
  const [pos, setPos] = useState({ top: 16, left: 16 })
  const cardRef = useRef<HTMLDivElement>(null)
  const next = useRef<HTMLButtonElement>(null)
  const tabRef = useRef(tab)
  tabRef.current = tab
  const step = steps[Math.min(i, steps.length - 1)]

  const finish = useCallback(() => { markWalkthroughDone(); onClose() }, [onClose])
  const go = useCallback((n: number) => { setDir(n > i ? 1 : -1); setI(Math.max(0, Math.min(steps.length - 1, n))) }, [i, steps.length])

  useEffect(() => { if (open) { setI(0); setBox(null) } }, [open, role])

  // trova l'elemento (aprendo la scheda giusta) e ne segue la posizione
  useEffect(() => {
    if (!open) return
    let dead = false
    let timer: ReturnType<typeof setInterval> | undefined
    const measure = (el: HTMLElement) => {
      const r = el.getBoundingClientRect()
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    const run = async () => {
      if (step.tab && tabRef.current !== step.tab) onTab(step.tab)
      let el: HTMLElement | null = null
      for (let k = 0; k < 40 && !dead; k++) { // fino a ~2 s: il cambio scheda è animato
        el = find(step.target)
        if (!step.target || visible(el)) break
        await new Promise((r) => setTimeout(r, 50))
      }
      if (dead) return
      if (step.target && !visible(el)) {
        if (step.optional) { if (dir === 1 && i < steps.length - 1) setI(i + 1); else if (i > 0) setI(i - 1); else setBox(null); return }
        setBox(null); return // senza elemento: suggerimento al centro
      }
      if (!el) { setBox(null); return }
      const r = el.getBoundingClientRect()
      if (r.top < 70 || r.bottom > window.innerHeight - 110) {
        el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
        await new Promise((res) => setTimeout(res, 60))
      }
      if (dead) return
      measure(el)
      const again = () => { const e2 = find(step.target); if (e2 && visible(e2)) measure(e2) }
      timer = setInterval(again, 250)
      window.addEventListener('resize', again); window.addEventListener('scroll', again, true)
      cleanup = () => { window.removeEventListener('resize', again); window.removeEventListener('scroll', again, true) }
    }
    let cleanup: () => void = () => undefined
    void run()
    return () => { dead = true; if (timer) clearInterval(timer); cleanup() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i, role])

  // posizione del suggerimento dopo aver misurato la sua altezza
  useLayoutEffect(() => {
    if (!open) return
    const c = cardRef.current
    const w = c?.offsetWidth ?? 340, h = c?.offsetHeight ?? 200
    const p = placeTooltip(box ? { top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 } : null, { w, h }, { w: window.innerWidth, h: window.innerHeight })
    setPos({ top: p.top, left: p.left })
  }, [open, box, i])

  useEffect(() => { if (open) next.current?.focus() }, [open, i])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight') (i < steps.length - 1 ? go(i + 1) : finish())
      else if (e.key === 'ArrowLeft' && i > 0) go(i - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, i, steps.length, go, finish])

  if (!open) return null
  const last = i >= steps.length - 1
  // in un portal: il filtro dell'animazione di pagina creerebbe un contesto per gli elementi fixed
  return createPortal(
    <div className="fixed inset-0 z-[75]" role="dialog" aria-modal="true" aria-label={t('Tour guidato')}>
      <div className="absolute inset-0" />{/* intercetta i tocchi: durante il tour l'app sotto non reagisce */}
      {box ? (
        <div aria-hidden className="pointer-events-none absolute rounded-2xl ring-2 ring-brand transition-all duration-300 motion-reduce:transition-none"
          style={{ top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2, boxShadow: '0 0 0 9999px rgb(var(--scrim))' }} />
      ) : <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'rgb(var(--scrim))' }} />}

      <div ref={cardRef} className="card absolute w-[min(22rem,calc(100vw-2rem))] space-y-3 p-4 transition-[top,left] duration-300 motion-reduce:transition-none" style={{ top: pos.top, left: pos.left }} aria-live="polite">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="label !mb-0.5">{t('Passo {n} di {total}', { n: i + 1, total: steps.length })}</p>
            <h3 className="text-lg font-extrabold leading-tight">{step.title}</h3>
          </div>
          <button type="button" className="icon-btn !p-1.5" onClick={finish} aria-label={t('Chiudi il tour')}><X size={16} /></button>
        </div>
        <p className="text-sm text-muted">{step.body}</p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1" aria-hidden>
            {steps.map((_, k) => <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-4 bg-brand' : 'w-1.5 bg-line'}`} />)}
          </div>
          <div className="flex items-center gap-2">
            {i > 0 && <button type="button" className="btn btn-soft !px-3 !py-1.5 !text-xs" onClick={() => go(i - 1)}><ArrowLeft size={14} />{t('Indietro')}</button>}
            <button ref={next} type="button" className="btn btn-primary !px-3.5 !py-1.5 !text-xs" onClick={() => (last ? finish() : go(i + 1))}>
              {last ? <>{t('Fine')}<Check size={14} /></> : <>{t('Avanti')}<ArrowRight size={14} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

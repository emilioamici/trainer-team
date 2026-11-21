import { useEffect, useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, animate, m, useMotionValue } from 'framer-motion'
import { Check, ChevronDown, X } from 'lucide-react'
import { t } from '../i18n'
import { useEngine } from '../state/store'

const asset = (p: string) => `${import.meta.env.BASE_URL}${p}`

// ---------- sfondo vivo ----------
export function Background() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-24 -top-24 h-96 w-96 animate-float1 rounded-full blur-3xl" style={{ background: 'rgb(var(--blob-a))' }} />
      <div className="absolute -right-32 top-1/4 h-[28rem] w-[28rem] animate-float2 rounded-full blur-3xl" style={{ background: 'rgb(var(--blob-b))' }} />
      <div className="absolute -bottom-32 left-1/4 h-[30rem] w-[30rem] animate-float3 rounded-full blur-3xl" style={{ background: 'rgb(var(--blob-c))' }} />
    </div>
  )
}

// ---------- mascotte ----------
export type CatKind = 'mochi' | 'zenitsu' | 'pair'
export const catSrc = (k: CatKind) => asset(`cats/${k === 'pair' ? 'pair' : k}.png`)

/** Il gattino fa capolino da dietro il bordo alto della card (contenuto pieno, mai vetro). */
export function MascotPeek({ kind, side = 'right', children }: { kind: CatKind; side?: 'left' | 'right'; children: ReactNode }) {
  return (
    <div className="relative pt-11">
      <img src={catSrc(kind)} alt="" draggable={false} className={`pointer-events-none absolute top-0 h-16 w-auto select-none ${side === 'right' ? 'right-6' : 'left-6'}`} />
      <div className="relative">{children}</div>
    </div>
  )
}

export function EmptyState({ kind = 'mochi', title, text, action }: { kind?: CatKind; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-5 py-8 text-center">
      <img src={catSrc(kind)} alt="" draggable={false} className="pointer-events-none mb-3 h-20 w-auto select-none" />
      <p className="font-bold">{title}</p>
      {text && <p className="mt-1 text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ---------- foglio (bottom sheet) ----------
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const dragY = useMotionValue(0)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const drag = { startY: 0, startT: 0, active: false }
  const down = (e: React.PointerEvent) => { drag.active = true; drag.startY = e.clientY; drag.startT = e.timeStamp; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }
  const move = (e: React.PointerEvent) => { if (drag.active) dragY.set(Math.max(0, e.clientY - drag.startY)) }
  const up = (e: React.PointerEvent) => {
    if (!drag.active) return
    drag.active = false
    const dy = e.clientY - drag.startY
    const v = dy / Math.max(1, e.timeStamp - drag.startT)
    if (dy > 120 || v > 0.6) onClose()
    else animate(dragY, 0, { type: 'spring', stiffness: 380, damping: 38 })
  }
  useEffect(() => { if (open) dragY.set(0) }, [open, dragY])

  // in un portal: il filtro dell'animazione di pagina creerebbe un contesto per gli elementi fixed
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={title}>
          <m.div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <m.div className="relative w-full max-w-lg" initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}>
            <m.div style={{ y: dragY }} className="glass-strong flex max-h-[92dvh] w-full flex-col rounded-t-[2rem] md:rounded-[2rem]">
              <div className="flex touch-none justify-center pb-1 pt-2.5" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
                <div className="h-1.5 w-10 rounded-full bg-muted/50" />
              </div>
              <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-1">
                <h2 className="text-xl font-bold">{title}</h2>
                <button className="icon-btn" onClick={onClose} aria-label={t('Chiudi')}><X size={18} /></button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
              {footer && <div className="pb-safe border-t border-line/60 px-5 pb-4 pt-3">{footer}</div>}
            </m.div>
          </m.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export function Confirm({ open, title, text, confirmLabel, onConfirm, onClose }: { open: boolean; title: string; text?: string; confirmLabel: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}
      footer={<div className="flex gap-2"><button className="btn btn-soft flex-1" onClick={onClose}>{t('Annulla')}</button><button className="btn btn-danger flex-1" onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button></div>}>
      {text && <p className="text-sm text-muted">{text}</p>}
    </Sheet>
  )
}

// ---------- accordion ----------
const accKey = (id: string) => `trainer:acc:${id}`
export function Accordion({ id, icon, title, summary, children, defaultOpen = false }: { id: string; icon: ReactNode; title: string; summary?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(() => { try { const v = localStorage.getItem(accKey(id)); return v === null ? defaultOpen : v === '1' } catch { return defaultOpen } })
  const toggle = () => { setOpen(!open); try { localStorage.setItem(accKey(id), open ? '0' : '1') } catch { /* ignora */ } }
  const cid = useId()
  return (
    <section className="card overflow-hidden">
      <button className="flex w-full items-center gap-3 p-4 text-left active:bg-line/30" onClick={toggle} aria-expanded={open} aria-controls={cid}>
        <span className="text-brand">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{title}</span>
          {!open && summary && <span className="block truncate text-xs text-muted">{summary}</span>}
        </span>
        <ChevronDown size={20} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div id={cid} className="space-y-3 border-t border-line/60 p-4">{children}</div>}
    </section>
  )
}

// ---------- controlli ----------
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-line'}`}>
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}

export function Segmented<V extends string>({ value, options, onChange }: { id?: string; value: V; options: { value: V; label: string }[]; onChange: (v: V) => void }) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value))
  // indicatore con sola transizione CSS: un layoutId dentro una pagina che esce (AnimatePresence) ne bloccava l'uscita
  return (
    <div className="rounded-full border border-line bg-line/40 p-1" role="tablist">
      <div className="relative flex">
        <span aria-hidden className="absolute inset-y-0 left-0 rounded-full bg-surface shadow-sm transition-transform duration-300 ease-[cubic-bezier(.3,1.3,.5,1)]" style={{ width: `${100 / options.length}%`, transform: `translateX(${idx * 100}%)` }} />
        {options.map((o) => (
          <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)} className={`relative z-10 flex-1 rounded-full px-3 py-1.5 text-sm font-semibold ${value === o.value ? 'text-ink' : 'text-muted'}`}>{o.label}</button>
        ))}
      </div>
    </div>
  )
}

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block"><span className="label">{label}</span>{children}</label>
)

export const Badge = ({ className, children }: { className: string; children: ReactNode }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${className}`}>{children}</span>
)

export const Notice = ({ kind, children }: { kind: 'exp' | 'inc' | 'warn' | 'trf'; children: ReactNode }) => {
  const c = { exp: 'bg-exp/15 text-exp', inc: 'bg-inc/15 text-inc', warn: 'bg-warn/15 text-warn', trf: 'bg-trf/15 text-trf' }[kind]
  return <p className={`rounded-xl p-3 text-sm ${c}`}>{children}</p>
}

export const OptionRow = ({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) => (
  <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-transform active:scale-[0.98] ${selected ? 'border-brand bg-brand/10' : 'border-line bg-surface'}`}>
    <div className="min-w-0 flex-1">{children}</div>
    {selected && <Check size={18} className="text-brand" />}
  </button>
)

// ---------- avvisi (toast) ----------
export function ToastHost() {
  const e = useEngine()
  const [shown, setShown] = useState<typeof e.toast>(null)
  useEffect(() => {
    if (!e.toast) return
    setShown(e.toast)
    const id = setTimeout(() => setShown(null), 4000)
    return () => clearTimeout(id)
  }, [e.toast])
  const color = shown?.kind === 'err' ? 'text-exp' : shown?.kind === 'info' ? 'text-trf' : 'text-inc'
  return (
    <div className="pointer-events-none fixed inset-x-4 top-0 z-[70] flex justify-center pt-safe">
      <AnimatePresence>
        {shown && (
          <m.div key={shown.id} role="status" initial={{ opacity: 0, y: -20, scale: 0.95 }} animate={{ opacity: 1, y: 12, scale: 1 }} exit={{ opacity: 0, y: -20 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className={`glass pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-sm font-semibold ${color}`}>{shown.msg}</m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Elemento fisso rispetto alla finestra (es. il FAB), fuori dalla pagina animata. */
export const Fixed = ({ children }: { children: ReactNode }) => createPortal(children, document.body)

export const PageHeader = ({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) => (
  <header className="flex items-start justify-between gap-3 pb-4 pt-safe">
    <div className="min-w-0 pt-4">
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      {sub && <p className="mt-0.5 truncate text-sm text-muted">{sub}</p>}
    </div>
    {action && <div className="shrink-0 pt-4">{action}</div>}
  </header>
)

import { m } from 'framer-motion'
import { CalendarCheck, CalendarDays, ChartNoAxesColumn, User, Users } from 'lucide-react'
import { t } from '../i18n'
import type { UserRole } from '../types'

/** 'team' = Progressi dell'atleta; 'groups' e 'athletes' = le due schede del coach */
export type Tab = 'today' | 'plan' | 'team' | 'groups' | 'athletes'

export function BottomNav({ tab, onChange, role }: { tab: Tab; onChange: (t: Tab) => void; role: UserRole }) {
  const items: { id: Tab; label: string; icon: typeof CalendarCheck }[] = [
    { id: 'today', label: t('Oggi'), icon: CalendarCheck },
    { id: 'plan', label: t('Piano'), icon: CalendarDays },
    ...(role === 'coach'
      ? [
          { id: 'groups' as Tab, label: t('Gruppi'), icon: Users },
          { id: 'athletes' as Tab, label: t('Atleti'), icon: User },
        ]
      : [{ id: 'team' as Tab, label: t('Progressi'), icon: ChartNoAxesColumn }]),
  ]
  return (
    <nav
      data-tour="nav"
      aria-label={t('Navigazione')}
      className={`glass fixed inset-x-4 bottom-4 z-40 grid ${items.length === 4 ? 'grid-cols-4' : 'grid-cols-3'} !rounded-full p-1.5 md:inset-x-auto md:bottom-auto md:left-6 md:top-6 md:w-56 md:grid-cols-1 md:!rounded-[28px] md:p-2`}
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map((it) => {
        const on = tab === it.id
        const Icon = it.icon
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            aria-current={on ? 'page' : undefined}
            className={`relative flex flex-col items-center gap-0.5 rounded-full px-2 py-2 transition-transform active:scale-90 md:flex-row md:gap-3 md:px-4 md:py-3 ${
              on ? 'text-brand' : 'text-muted'
            }`}
          >
            {on && (
              <m.span
                layoutId="nav-drop"
                className="glass-active absolute inset-0 rounded-full"
                transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.9 }}
              />
            )}
            <Icon size={22} strokeWidth={on ? 2.6 : 2.1} className="relative" />
            <span className="relative text-[10px] font-semibold md:text-sm">{it.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

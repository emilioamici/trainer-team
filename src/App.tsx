import { useEffect, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { BottomNav, type Tab } from './components/BottomNav'
import { Background, ToastHost } from './components/ui'
import { useLangPref } from './i18n'
import { captureJoinFromUrl } from './lib/invite'
import Plan from './pages/Plan'
import Profile from './pages/Profile'
import Team from './pages/Team'
import Today from './pages/Today'
import { useEngine } from './state/store'

export default function App() {
  const e = useEngine()
  const lang = useLangPref()
  const [tab, setTab] = useState<Tab>(() => (captureJoinFromUrl() ? 'profile' : 'today'))
  const [planDate, setPlanDate] = useState<string | null>(null)

  useEffect(() => { window.scrollTo(0, 0) }, [tab])

  const goPlan = (date?: string) => { setPlanDate(date ?? null); setTab('plan') }

  return (
    <>
      <Background />
      <ToastHost />
      {!e.ready ? (
        <div className="flex h-full items-center justify-center text-sm text-muted">…</div>
      ) : (
        <div key={lang} className="mx-auto min-h-full max-w-md px-4 pb-32 md:ml-72 md:max-w-2xl md:pb-12 md:pl-0 lg:mx-auto lg:pl-0">
          <AnimatePresence mode="wait" initial={false}>
            <m.main key={tab} initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -6, filter: 'blur(6px)' }} transition={{ duration: 0.18 }}>
              {tab === 'today' && <Today onGoPlan={goPlan} />}
              {tab === 'plan' && <Plan initialDate={planDate} />}
              {tab === 'team' && <Team onOpenPlan={goPlan} />}
              {tab === 'profile' && <Profile />}
            </m.main>
          </AnimatePresence>
        </div>
      )}
      <BottomNav tab={tab} onChange={(t) => { setPlanDate(null); setTab(t) }} role={e.role} />
    </>
  )
}

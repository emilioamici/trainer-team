import { useEffect, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { BottomNav, type Tab } from './components/BottomNav'
import { Background, Logo, ToastHost } from './components/ui'
import { NotificationCenter, TopHeader } from './components/HeaderControls'
import { SettingsSheet } from './pages/Profile'
import { useLangPref } from './i18n'
import { Gate } from './components/Gate'
import { captureJoinFromUrl, pendingJoin } from './lib/invite'
import Plan from './pages/Plan'
import Team from './pages/Team'
import Today from './pages/Today'
import { useEngine } from './state/store'

export default function App() {
  const e = useEngine()
  const lang = useLangPref()
  const [tab, setTab] = useState<Tab>('today')
  const [planDate, setPlanDate] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(() => !!captureJoinFromUrl())
  const [notifOpen, setNotifOpen] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  const gate = e.gateMode()
  const goPlan = (date?: string) => {
    setPlanDate(date ?? null)
    setTab('plan')
  }

  return (
    <>
      <Background />
      <ToastHost />
      {gate && <Gate mode={gate} onLoggedIn={() => { if (pendingJoin()) setSettingsOpen(true) }} />}
      {!e.ready ? (
        <div className="flex h-full items-center justify-center text-sm text-muted">…</div>
      ) : (
        <div key={lang} className="mx-auto min-h-full max-w-md px-4 pb-32 md:ml-72 md:max-w-2xl md:pb-12 md:pl-0 lg:mx-auto lg:pl-0">
          <div className="flex items-center justify-between gap-3 pb-1 pt-4">
            <Logo />
            <TopHeader
              onOpenNotifications={() => setNotifOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <m.main
              key={tab}
              initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6, filter: 'blur(6px)' }}
              transition={{ duration: 0.18 }}
            >
              {tab === 'today' && <Today onGoPlan={goPlan} />}
              {tab === 'plan' && <Plan initialDate={planDate} />}
              {tab === 'team' && <Team onOpenPlan={goPlan} />}
            </m.main>
          </AnimatePresence>
        </div>
      )}
      <BottomNav tab={tab} onChange={(t) => { setPlanDate(null); setTab(t) }} role={e.role} />
      <NotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}

import { useState } from 'react'
import {
  Bell,
  BellRing,
  Check,
  CheckCheck,
  Cloud,
  CloudOff,
  Dumbbell,
  Loader2,
  RefreshCw,
  Settings,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { t } from '../i18n'
import { timeAgo } from '../lib/dates'
import { useNotifications, type AppNotification } from '../lib/notifications'
import { useActive } from './common'
import { Sheet } from './ui'

export function SyncPill() {
  const { e, src } = useActive()
  const st = src ? e.statusOf(src.id) : null
  const [spinning, setSpinning] = useState(false)

  const isSyncing = st?.status === 'syncing' || spinning
  const isAuthErr = st?.status === 'auth' || e.authState === 'expired'
  const isOffline = st?.status === 'offline'

  const handleClick = async () => {
    if (isAuthErr) {
      e.connect()
      return
    }
    setSpinning(true)
    try {
      await e.syncAll()
    } finally {
      setTimeout(() => setSpinning(false), 600)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={t('Sincronizza')}
      className={`group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
        isAuthErr
          ? 'border-warn/40 bg-warn/10 text-warn'
          : isOffline
            ? 'border-line/60 bg-bg text-muted'
            : 'border-line/50 bg-bg/80 text-ink hover:border-brand/40 hover:bg-bg'
      }`}
    >
      {isSyncing ? (
        <Loader2 size={13} className="animate-spin text-brand" />
      ) : isAuthErr ? (
        <TriangleAlert size={13} className="text-warn" />
      ) : isOffline ? (
        <CloudOff size={13} className="text-muted" />
      ) : (
        <Cloud size={13} className="text-brand" />
      )}
      <span className="text-[11px] font-bold">
        {isSyncing
          ? t('Sync…')
          : isAuthErr
            ? t('Riconnetti')
            : isOffline
              ? t('Offline')
              : t('Sync now')}
      </span>
      <RefreshCw
        size={11}
        className={`opacity-60 transition group-hover:opacity-100 ${isSyncing ? 'animate-spin' : ''}`}
      />
    </button>
  )
}

export function NotificationBell({ onClick }: { onClick: () => void }) {
  const { unread } = useNotifications()

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        aria-label={unread ? t('Notifiche ({n} non lette)', { n: unread }) : t('Notifiche')}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-line/50 bg-bg/80 text-muted transition hover:border-brand/40 hover:bg-bg hover:text-ink active:scale-95"
      >
        <Bell size={16} />
      </button>
      {unread > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-exp px-1 text-[10px] font-bold leading-none text-onbrand ring-2 ring-surface"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </span>
  )
}

export function SettingsButton({ onClick }: { onClick: () => void }) {
  const { e } = useActive()
  const initial = (e.profileName || (e.role === 'coach' ? 'Coach' : 'Atleta')).charAt(0).toUpperCase()

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('Impostazioni')}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-brand/30 bg-gradient-to-br from-brand/15 via-surface to-warn/15 text-xs font-bold text-brand shadow-sm transition hover:border-brand hover:scale-105 active:scale-95"
    >
      {initial || <Settings size={15} />}
    </button>
  )
}

export function TopHeader({
  onOpenNotifications,
  onOpenSettings,
}: {
  onOpenNotifications: () => void
  onOpenSettings: () => void
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-line/60 bg-surface/90 p-1 shadow-sm backdrop-blur-md">
      <SyncPill />
      <NotificationBell onClick={onOpenNotifications} />
      <SettingsButton onClick={onOpenSettings} />
    </div>
  )
}

function NotifIcon({ kind }: { kind: AppNotification['kind'] }) {
  switch (kind) {
    case 'feedback':
      return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-inc/15 text-inc">
          <CheckCheck size={18} />
        </span>
      )
    case 'attendance':
      return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warn/15 text-warn">
          <Users size={18} />
        </span>
      )
    case 'workout':
      return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Dumbbell size={18} />
        </span>
      )
    default:
      return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-line text-muted">
          <BellRing size={18} />
        </span>
      )
  }
}

export function NotificationCenter({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { notifications, unread, markRead, markAllRead, clearNotifications } = useNotifications()

  return (
    <Sheet open={open} onClose={onClose} title={t('Centro Notifiche')}>
      {notifications.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-line/50 text-muted">
            <Bell size={24} />
          </span>
          <p className="font-semibold text-ink">{t('Nessuna notifica')}</p>
          <p className="mx-auto mt-1 max-w-xs text-xs">
            {t(
              'Qui riceverai gli aggiornamenti su feedback degli atleti, presenze dei gruppi e sincronizzazione.'
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-3 pb-2">
          <ul className="-mx-2 divide-y divide-line/50">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-line/30"
                  onClick={() => markRead(n.id)}
                >
                  <NotifIcon kind={n.kind} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.read ? 'font-medium text-ink' : 'font-bold text-ink'}`}>
                      {n.title}
                    </span>
                    <span className="block text-xs text-muted">{n.body}</span>
                    <span className="mt-0.5 block text-[11px] text-muted">{timeAgo(n.at)}</span>
                  </span>
                  {!n.read && (
                    <span
                      className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-brand"
                      aria-label={t('Non letta')}
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2 pt-2">
            <button
              type="button"
              className="btn btn-soft flex-1 !text-xs"
              disabled={unread === 0}
              onClick={markAllRead}
            >
              <Check size={14} />
              {t('Segna tutte come lette')}
            </button>
            <button
              type="button"
              className="btn btn-soft !text-xs text-muted"
              onClick={clearNotifications}
            >
              {t('Svuota')}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

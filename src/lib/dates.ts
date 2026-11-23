import { locale } from '../i18n'

const p2 = (n: number) => String(n).padStart(2, '0')

export const toISODate = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
export const fromISODate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
export const todayISO = () => toISODate(new Date())
export const addDays = (iso: string, n: number) => {
  const d = fromISODate(iso)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}
/** Lunedì della settimana che contiene `iso`. */
export const weekStart = (iso: string) => {
  const d = fromISODate(iso)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return toISODate(d)
}
export const weekDays = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i))
export const monthStart = (iso: string) => iso.slice(0, 7) + '-01'
export const addMonths = (iso: string, n: number) => {
  const d = fromISODate(monthStart(iso))
  d.setMonth(d.getMonth() + n)
  return toISODate(d)
}
/** Giorni (con lunedì in testa) mostrati dalla griglia del mese, a settimane intere. */
export const monthGrid = (iso: string) => {
  const first = monthStart(iso)
  const start = weekStart(first)
  const next = addMonths(first, 1)
  const out: string[] = []
  for (let d = start; d < next || out.length % 7 !== 0; d = addDays(d, 1)) out.push(d)
  return out
}
export const diffDays = (a: string, b: string) => Math.round((fromISODate(a).getTime() - fromISODate(b).getTime()) / 86400000)

export const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Intl.DateTimeFormat(locale(), opts).format(fromISODate(iso))
export const fmtLong = (iso: string) => fmtDay(iso, { weekday: 'long', day: 'numeric', month: 'long' })
export const fmtMonth = (iso: string) => fmtDay(iso, { month: 'long', year: 'numeric' })
export const fmtWeekRange = (start: string) => `${fmtDay(start, { day: 'numeric', month: 'short' })} – ${fmtDay(addDays(start, 6), { day: 'numeric', month: 'short' })}`
export const fmtWeekdayShort = (iso: string) => fmtDay(iso, { weekday: 'short' })
export const nowISO = () => new Date().toISOString()

export const timeAgo = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime()
  if (diffMs < 0 || diffMs < 60_000) return 'adesso'
  const min = Math.floor(diffMs / 60_000)
  if (min < 60) return `${min}m fa`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours}h fa`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ieri'
  return fmtDay(iso.slice(0, 10))
}

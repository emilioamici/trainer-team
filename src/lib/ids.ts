export const uid = (prefix = '') => {
  const c = (globalThis as { crypto?: Crypto }).crypto
  const r = c?.randomUUID ? c.randomUUID().replace(/-/g, '').slice(0, 14) : Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  return prefix + r
}
export const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'atleta'

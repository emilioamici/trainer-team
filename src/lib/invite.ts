/** Estrae l'ID del file Drive da un codice, da un link d'invito (#join=…) o da un link di Drive. */
export const parseInviteCode = (input: string): string | null => {
  const s = input.trim()
  if (!s) return null
  const m = s.match(/[#?&]join=([\w-]{10,})/) || s.match(/\/d\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/)
  if (m) return m[1]
  return /^[\w-]{10,}$/.test(s) ? s : null
}

export const inviteLink = (fileId: string) => `${location.origin}${import.meta.env.BASE_URL}#join=${fileId}`

const JOIN_KEY = 'trainer:pendingJoin'
/** Se l'indirizzo contiene #join=<codice> lo ricorda (sopravvive al giro su Google) e lo toglie dalla barra. */
export const captureJoinFromUrl = (): string | null => {
  try {
    const code = parseInviteCode(location.hash.startsWith('#join=') ? location.hash : '')
    if (code) {
      localStorage.setItem(JOIN_KEY, code)
      history.replaceState(null, '', location.pathname + location.search)
    }
    return localStorage.getItem(JOIN_KEY)
  } catch { return null }
}
export const clearPendingJoin = () => { try { localStorage.removeItem(JOIN_KEY) } catch { /* ignora */ } }
export const setPendingJoin = (code: string) => { try { localStorage.setItem(JOIN_KEY, code) } catch { /* ignora */ } }
export const pendingJoin = () => { try { return localStorage.getItem(JOIN_KEY) } catch { return null } }

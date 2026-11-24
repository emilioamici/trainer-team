/**
 * Ordine dei piani disponibili (preferenza del dispositivo). Il primo è il piano PRINCIPALE: quello che si apre all'avvio.
 * `order` contiene gli id scelti dall'utente; i piani nuovi non ancora presenti vanno in coda, nel loro ordine predefinito.
 */
export const orderSources = <T extends { id: string }>(list: T[], order: string[]): T[] => {
  const pos = new Map(order.map((id, i) => [id, i]))
  const known = list.filter((s) => pos.has(s.id)).sort((a, b) => pos.get(a.id)! - pos.get(b.id)!)
  return [...known, ...list.filter((s) => !pos.has(s.id))]
}

/** Sposta `id` di una posizione (-1 = verso l'alto, 1 = verso il basso) senza uscire dai limiti. */
export const moveInOrder = (ids: string[], id: string, dir: -1 | 1): string[] => {
  const i = ids.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= ids.length) return ids
  const out = [...ids]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/** `id` diventa il piano principale (primo); gli altri mantengono l'ordine. */
export const withMainFirst = (ids: string[], id: string): string[] => [id, ...ids.filter((x) => x !== id)]

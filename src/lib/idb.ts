// Copia locale in IndexedDB (su iPhone localStorage si riempie): chiave → valore JSON.
const DB_NAME = 'trainer-team'
const STORE = 'kv'

let dbp: Promise<IDBDatabase> | null = null
const open = () => {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbp
}

const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await open()
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const idbGet = async <T>(key: string): Promise<T | undefined> => {
  try { return await run<T | undefined>('readonly', (s) => s.get(key)) } catch { return undefined }
}
export const idbSet = async (key: string, value: unknown): Promise<boolean> => {
  try { await run('readwrite', (s) => s.put(value, key)); return true } catch { return false }
}
export const idbDel = async (key: string): Promise<void> => {
  try { await run('readwrite', (s) => s.delete(key)) } catch { /* ignora */ }
}

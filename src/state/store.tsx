import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { engine, type Engine } from './engine'

const Ctx = createContext<Engine>(engine)

export function StoreProvider({ children }: { children: ReactNode }) {
  useEffect(() => { void engine.start(); void engine.loadAccount(); return () => engine.stop() }, [])
  return <Ctx.Provider value={engine}>{children}</Ctx.Provider>
}

/** Rende il componente reattivo ai cambiamenti del motore; i dati si leggono dai getter dell'engine. */
export function useEngine(): Engine {
  const e = useContext(Ctx)
  useSyncExternalStore(e.subscribe, e.getVersion)
  return e
}

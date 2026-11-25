import { useEngine } from '../state/store'

export type MascotWho = 'atleta' | 'coach'

/** Le due mascotte di FM Training. `auto` sceglie in base al ruolo (coach = cappellino e occhiali, atleta = sorridente). */
export function Mascot({
  who = 'auto',
  kind = 'full',
  className = '',
  fade = false,
  alt = '',
}: {
  who?: MascotWho | 'auto'
  kind?: 'full' | 'bust'
  className?: string
  /** solo mezzobusto: sfuma il taglio in basso */
  fade?: boolean
  alt?: string
}) {
  const e = useEngine()
  const w: MascotWho = who === 'auto' ? (e.role === 'coach' ? 'coach' : 'atleta') : who
  return (
    <img
      src={`${import.meta.env.BASE_URL}brand/mascot-${w}${kind === 'bust' ? '-bust' : ''}.webp`}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      draggable={false}
      loading="lazy"
      decoding="async"
      className={`select-none object-contain ${className}`}
      style={fade && kind === 'bust' ? { WebkitMaskImage: 'linear-gradient(to bottom, #000 72%, transparent)', maskImage: 'linear-gradient(to bottom, #000 72%, transparent)' } : undefined}
    />
  )
}

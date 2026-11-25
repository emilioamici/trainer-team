// Genera i temi colore dell'app a partire dalle palette di riferimento.
// Uso: node scripts/gen-palettes.mjs   →  scrive src/palettes.css e src/lib/palettes.data.ts
// Ogni palette ha una variante chiara e una scura; i token mancanti (testo secondario, bordi, vetro…) si ricavano e si
// correggono per mantenere un contrasto leggibile. Colori di stato (verde/rosso/blu/giallo) restano quelli standard.
import { writeFileSync } from 'node:fs'

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const hex = (c) => '#' + c.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('')
const mix = (a, b, t) => hex(rgb(a).map((x, i) => x + (rgb(b)[i] - x) * t)) // t=0 → a, t=1 → b
const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const tok = (h) => rgb(h).join(' ')
/** Avvicina `c` a `toward` finché il contrasto con `on` raggiunge `min`. */
const ensure = (c, on, toward, min) => { let x = c; for (let i = 0; i < 20 && contrast(x, on) < min; i++) x = mix(x, toward, 0.12); return x }

// colori letti dalle immagini (quelli segnati ~ erano poco leggibili e sono stimati)
const PALETTES = [
  { id: 'notte', it: 'Notte viola', en: 'Violet night', src: ['#0E1B48', '#C18DB4', '#E2CAD8', '#87A7D0', '#27425D', '#0E1F2F'],
    dark: { bg: '#0E1F2F', surface: '#1A3148', ink: '#E2CAD8', brand: '#C18DB4' }, light: { bg: '#EFE3EB', surface: '#FAF5F8', ink: '#0E1B48', brand: '#5B4B86' } },
  { id: 'bordeaux', it: 'Caffè bordeaux', en: 'Coffee burgundy', src: ['#561C24', '#6D2932', '#C7B7A3', '#E8D8C4'],
    dark: { bg: '#2B0E13', surface: '#4A1A22', ink: '#E8D8C4', brand: '#C7B7A3' }, light: { bg: '#F1E7DA', surface: '#FBF7F1', ink: '#3B1218', brand: '#6D2932' } },
  { id: 'foresta', it: 'Foresta', en: 'Forest', src: ['#0F2A1D', '#375534', '#6B9071', '#AEC3B0', '#E3EED4'],
    dark: { bg: '#0B1F15', surface: '#173626', ink: '#E3EED4', brand: '#6B9071' }, light: { bg: '#E6EFDA', surface: '#F6F9F0', ink: '#0F2A1D', brand: '#375534' } },
  { id: 'rubino', it: 'Rubino e blu', en: 'Ruby and blue', src: ['#1B2234~', '#5196CE', '#FE8492', '#A42527', '#45141B', '#150B12~'],
    dark: { bg: '#150B12', surface: '#2B1219', ink: '#FBE6E9', brand: '#FE8492' }, light: { bg: '#F7E9EB', surface: '#FFF8F8', ink: '#2A0C12', brand: '#A42527' } },
  { id: 'oceano', it: 'Oceano', en: 'Ocean', src: ['#021024', '#052659', '#3A5F8C~', '#5483B3~', '#7DA0CA', '#C1E8FF'],
    dark: { bg: '#021024', surface: '#0A2147', ink: '#C1E8FF', brand: '#5483B3' }, light: { bg: '#E3F3FD', surface: '#F5FBFF', ink: '#021024', brand: '#052659' } },
  { id: 'pesca', it: 'Pesca e rosa', en: 'Peach and rose', src: ['#FEA38E', '#F9E4D8~', '#FBA2A8', '#E3D5CE~', '#F3B5AD'],
    dark: { bg: '#2A1816', surface: '#3C2320', ink: '#FBE9E3', brand: '#FEA38E' }, light: { bg: '#F5E6DE', surface: '#FCF6F2', ink: '#4A2420', brand: '#C0533F' } },
  { id: 'jtp', it: 'Junior Tennis Perugia', en: 'Junior Tennis Perugia', logo: 'brand/jtp-logo.png', src: ['#383586', '#F7E940', '#FFFFFF'], accent: '#F7E940',
    dark: { bg: '#12103A', surface: '#201D5C', ink: '#F4F2FF', brand: '#F7E940' }, light: { bg: '#ECEBF8', surface: '#FFFFFF', ink: '#1B1952', brand: '#383586' } },
]

const STATUS = {
  light: { inc: '#109554', exp: '#E11D48', trf: '#0284C7', warn: '#D98200' },
  dark: { inc: '#34D399', exp: '#FB7185', trf: '#60A5FA', warn: '#FACC15' },
}
const warnings = []

const block = (id, mode, p, accent) => {
  p = { ...p, accent }
  const dark = mode === 'dark'
  const { bg, surface, ink } = p
  let muted = mix(ink, bg, dark ? 0.38 : 0.4)
  muted = ensure(muted, surface, ink, 4.5)
  const line = mix(bg, ink, dark ? 0.14 : 0.13)
  let brand = p.brand
  if (contrast(brand, bg) < 3) { brand = mix(brand, ink, 0.25); warnings.push(`${id}/${mode}: brand ravvicinato allo sfondo, corretto`) }
  const onb = contrast('#FFFFFF', brand) >= 4.5 ? '#FFFFFF' : contrast('#14110F', brand) >= 4.5 ? '#14110F' : (warnings.push(`${id}/${mode}: contrasto del tasto principale basso`), '#FFFFFF')
  const st = STATUS[mode]
  const blobs = [brand, p.accent ?? mix(brand, ink, 0.5), mix(brand, bg, 0.3)]
  const rgba = (h, a) => `${tok(h)} / ${a}`
  return [
    `--bg: ${tok(bg)}; --surface: ${tok(surface)}; --ink: ${tok(ink)}; --muted: ${tok(muted)}; --line: ${tok(line)};`,
    `--brand: ${tok(brand)}; --onbrand: ${tok(onb)};`,
    `--inc: ${tok(st.inc)}; --exp: ${tok(st.exp)}; --trf: ${tok(st.trf)}; --warn: ${tok(st.warn)};`,
    `--glass: ${rgba(surface, dark ? 0.8 : 0.82)}; --glass-strong: ${rgba(surface, 0.94)};`,
    dark
      ? `--glass-edge: 255 255 255 / 0.18; --glass-edge-soft: 255 255 255 / 0.07; --glass-shade: 0 0 0 / 0.45; --scrim: 0 0 0 / 0.62;`
      : `--glass-edge: 255 255 255 / 0.85; --glass-edge-soft: 255 255 255 / 0.45; --glass-shade: ${rgba(brand, 0.1)}; --scrim: ${rgba(ink, 0.6)};`,
    `--blob-a: ${rgba(blobs[0], dark ? 0.24 : 0.16)}; --blob-b: ${rgba(blobs[1], dark ? 0.18 : 0.2)}; --blob-c: ${rgba(blobs[2], dark ? 0.22 : 0.14)};`,
  ].join('\n    ')
}

let css = '/* Generato da scripts/gen-palettes.mjs — non modificare a mano. */\n'
const data = []
for (const P of PALETTES) {
  const sel = `:root[data-palette='${P.id}']`
  css += `\n/* ${P.it} */\n${sel} {\n    ${block(P.id, 'light', P.light, P.accent)}\n  }\n`
  css += `@media (prefers-color-scheme: dark) {\n  ${sel}:not([data-theme='light']) {\n    ${block(P.id, 'dark', P.dark, P.accent)}\n  }\n}\n`
  css += `${sel}[data-theme='dark'] {\n    ${block(P.id, 'dark', P.dark, P.accent)}\n  }\n`
  data.push({ id: P.id, it: P.it, en: P.en, ...(P.logo ? { logo: P.logo } : {}), light: P.light.bg, dark: P.dark.bg, swatch: P.src.map((s) => s.replace('~', '')) })
}
writeFileSync('src/palettes.css', css)
writeFileSync(
  'src/lib/palettes.data.ts',
  `// Generato da scripts/gen-palettes.mjs — non modificare a mano.\nexport interface PaletteInfo { id: string; it: string; en: string; logo?: string; light: string; dark: string; swatch: string[] }\nexport const PALETTES: PaletteInfo[] = ${JSON.stringify(data, null, 2)}\n`,
)
console.log(warnings.length ? warnings.join('\n') : 'Contrasti ok')

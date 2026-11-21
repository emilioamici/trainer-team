export const downloadJSON = (name: string, data: unknown) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
export const readFileText = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(f)
})
export const parseNum = (s: string): number | undefined => {
  const n = parseFloat(s.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}
export const copyText = async (s: string) => {
  try { await navigator.clipboard.writeText(s); return true } catch { return false }
}

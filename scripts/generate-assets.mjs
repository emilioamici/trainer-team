import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[i] = c >>> 0
}

function crc32(b) {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

export function encodePNG(width, height, rgbaBuffer) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // 8 bit
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  const scanlines = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4)
    scanlines[rowOffset] = 0 // Filter 0
    rgbaBuffer.copy(scanlines, rowOffset + 1, y * width * 4, (y + 1) * width * 4)
  }

  const idat = chunk('IDAT', zlib.deflateSync(scanlines, { level: 9 }))
  return Buffer.concat([sig, chunk('IHDR', ihdr), idat, chunk('IEND', Buffer.alloc(0))])
}

function sdBox(px, py, bx, by, r = 0) {
  const qx = Math.abs(px) - (bx - r)
  const qy = Math.abs(py) - (by - r)
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - r
}

function sdDumbbell(x, y, scale = 1) {
  const sx = x / scale
  const sy = y / scale
  const SQRT2 = Math.SQRT2
  const u = (sx + sy) / SQRT2
  const v = (-sx + sy) / SQRT2
  const au = Math.abs(u)

  // Central handle bar
  const bar = sdBox(u, v, 0.46, 0.048, 0.045)
  // Inner collars
  const collar = sdBox(au - 0.20, v, 0.02, 0.09, 0.015)
  // Large main plate
  const plate1 = sdBox(au - 0.28, v, 0.038, 0.26, 0.04)
  // Smaller outer plate
  const plate2 = sdBox(au - 0.38, v, 0.038, 0.19, 0.035)

  return Math.min(bar, collar, plate1, plate2) * scale
}

function renderImage(width, height, options = {}) {
  const {
    bg = 'transparent', // 'transparent' | 'squircle' | 'full'
    bgRadius = 0.22,
    dumbbellScale = 0.65,
    fgColor = [255, 255, 255],
    bgColor = [32, 34, 38], // #202226
  } = options

  const buf = Buffer.alloc(width * height * 4)
  const samples = 3 // 3x3 supersampling
  const step = 1 / samples
  const minDim = Math.min(width, height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let totalR = 0, totalG = 0, totalB = 0, totalA = 0

      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = (x + (sx + 0.5) * step - width / 2) / (minDim / 2)
          const py = (y + (sy + 0.5) * step - height / 2) / (minDim / 2)

          let sampleA = 0
          let sampleR = 0
          let sampleG = 0
          let sampleB = 0

          // Background check
          if (bg === 'full') {
            sampleA = 1
            sampleR = bgColor[0]
            sampleG = bgColor[1]
            sampleB = bgColor[2]
          } else if (bg === 'squircle') {
            const dSquare = sdBox(px, py, 0.94, 0.94, bgRadius * 2)
            if (dSquare <= 0) {
              sampleA = 1
              sampleR = bgColor[0]
              sampleG = bgColor[1]
              sampleB = bgColor[2]
            }
          }

          // Dumbbell shape check
          const dDumbbell = sdDumbbell(px, py, dumbbellScale)
          if (dDumbbell <= 0) {
            sampleA = 1
            sampleR = fgColor[0]
            sampleG = fgColor[1]
            sampleB = fgColor[2]
          }

          totalR += sampleR
          totalG += sampleG
          totalB += sampleB
          totalA += sampleA
        }
      }

      const count = samples * samples
      const finalR = Math.round(totalR / count)
      const finalG = Math.round(totalG / count)
      const finalB = Math.round(totalB / count)
      const finalA = Math.round((totalA / count) * 255)

      const idx = (y * width + x) * 4
      buf[idx] = finalR
      buf[idx + 1] = finalG
      buf[idx + 2] = finalB
      buf[idx + 3] = finalA
    }
  }

  return encodePNG(width, height, buf)
}

// Generate all target files
const targets = [
  { path: 'public/icons/favicon-32.png', width: 32, height: 32, opts: { bg: 'squircle', bgRadius: 0.28, dumbbellScale: 0.68 } },
  { path: 'public/icons/favicon-64.png', width: 64, height: 64, opts: { bg: 'squircle', bgRadius: 0.25, dumbbellScale: 0.68 } },
  { path: 'public/icons/apple-touch-icon.png', width: 180, height: 180, opts: { bg: 'squircle', bgRadius: 0.24, dumbbellScale: 0.65 } },
  { path: 'public/icons/icon-192.png', width: 192, height: 192, opts: { bg: 'squircle', bgRadius: 0.22, dumbbellScale: 0.65 } },
  { path: 'public/icons/icon-512.png', width: 512, height: 512, opts: { bg: 'squircle', bgRadius: 0.22, dumbbellScale: 0.65 } },
  { path: 'public/icons/icon-maskable-512.png', width: 512, height: 512, opts: { bg: 'full', dumbbellScale: 0.52 } }, // 52% to respect safe zone
  { path: 'public/brand/logo-mark.png', width: 512, height: 512, opts: { bg: 'transparent', dumbbellScale: 0.85 } },
  { path: 'public/brand/logo-full.png', width: 1024, height: 512, opts: { bg: 'transparent', dumbbellScale: 0.75 } },
]

for (const t of targets) {
  const fullPath = path.resolve(t.path)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  const png = renderImage(t.width, t.height, t.opts)
  fs.writeFileSync(fullPath, png)
  console.log('Generated', t.path, `(${t.width}x${t.height}, ${png.length} bytes)`)
}

// Also generate SVG favicon
const svgFavicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect width="32" height="32" rx="8" fill="#202226"/>
  <g transform="translate(16,16) rotate(45) scale(0.7) translate(-12,-12)" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14.4 14.4 9.6 9.6"/>
    <path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/>
    <path d="m21.5 21.5-1.4-1.4"/>
    <path d="M3.9 3.9 2.5 2.5"/>
    <path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/>
  </g>
</svg>`

fs.writeFileSync(path.resolve('public/icons/favicon.svg'), svgFavicon.trim())
console.log('Generated public/icons/favicon.svg')

// Generates public/icons/icon-192.png and icon-512.png — a pastel donut chart mark —
// with no image dependencies: pixels are computed directly and written as PNG chunks.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const SEGMENTS = [
  { until: 0.32, color: [0xbf, 0xe8, 0xd4] }, // mint
  { until: 0.52, color: [0xfb, 0xe7, 0xa1] }, // butter
  { until: 0.68, color: [0xf6, 0xc6, 0xc6] }, // blush
  { until: 0.86, color: [0xcd, 0xc7, 0xf2] }, // lilac
  { until: 1.0, color: [0xbf, 0xdc, 0xf4] },  // sky
]
const BG = [0x5f, 0x57, 0xc7] // indigo field so the mark reads at small sizes

function pixel(x, y, size) {
  const c = size / 2
  const dx = (x - c) / c
  const dy = (y - c) / c
  const r = Math.sqrt(dx * dx + dy * dy)
  if (r < 0.72 && r > 0.34) {
    let angle = Math.atan2(dy, dx) / (2 * Math.PI) + 0.25 // start at 12 o'clock
    if (angle < 0) angle += 1
    const gap = 0.012
    for (const seg of SEGMENTS) {
      if (angle < seg.until) {
        const prev = SEGMENTS[SEGMENTS.indexOf(seg) - 1]?.until ?? 0
        if (angle - prev < gap || seg.until - angle < gap) return BG
        return seg.color
      }
    }
  }
  return BG
}

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 2  // color type RGB
  const raw = Buffer.alloc(size * (size * 3 + 1))
  let off = 0
  for (let y = 0; y < size; y++) {
    raw[off++] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y, size)
      raw[off++] = r; raw[off++] = g; raw[off++] = b
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(join(root, 'public', 'icons'), { recursive: true })
for (const size of [192, 512]) {
  writeFileSync(join(root, 'public', 'icons', `icon-${size}.png`), png(size))
  console.log(`icon-${size}.png written`)
}

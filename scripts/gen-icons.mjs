// Generates public/icons/icon.svg, icon-192.png, and icon-512.png — a pixel-art
// money bag on a black field — with no image dependencies: pixels come from the
// GRID below and are written directly as PNG chunks / SVG rects.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Transcribed from the reference pixel art, one grid cell per source "pixel":
// tuft (rows 0-3, dark-shaded right lobe), orange tie with black end caps
// (row 4), shadow band under the tie (row 5), oval body 13 cells wide with a
// black outline ring, dark-green crescent along the inner bottom-right, and a
// 5x9 dollar sign with a continuous center bar. 16x16 cells; 192 and 512 are
// both exact multiples so the pixels stay crisp.
// . background  G green  D dark green (shade)  O orange tie  o dark orange  K black outline/$
const GRID = [
  '.....KKKK.......',
  '....KGGGDK......',
  '....KGGDDK......',
  '.....KGDK.......',
  '....KOOOooK.....',
  '....KGDDDGK.....',
  '...KGGGGKGGK....',
  '..KGGGGKKKKGK...',
  '.KGGGGKGKGGGDK..',
  '.KGGGGKGKGGGDK..',
  '.KGGGGGKKKGGDK..',
  '.KGGGGGGKGKGDK..',
  '..KGGGGGKGKDK...',
  '...KGGKKKKDK....',
  '....KDDDKDK.....',
  '.....KKKKK......',
]

const PALETTE = {
  '.': [0x00, 0x00, 0x00], // black background
  K: [0x00, 0x00, 0x00],   // dollar sign / outline on the bag
  G: [0x5b, 0xb9, 0x44],   // bag green
  D: [0x3d, 0x8a, 0x2e],   // shaded green
  O: [0xf0, 0x91, 0x3a],   // tie orange
  o: [0xd9, 0x70, 0x1f],   // shaded orange
}

function pixel(x, y, size) {
  const cell = size / GRID.length
  return PALETTE[GRID[Math.floor(y / cell)][Math.floor(x / cell)]]
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

function svg() {
  const hex = ([r, g, b]) => `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
  const rects = []
  for (let y = 0; y < GRID.length; y++) {
    for (let x = 0; x < GRID[y].length; x++) {
      const ch = GRID[y][x]
      if (ch === '.' || ch === 'K') continue // black cells are covered by the field
      rects.push(`  <rect x="${x}" y="${y}" width="1" height="1" fill="${hex(PALETTE[ch])}"/>`)
    }
  }
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">',
    '  <rect width="16" height="16" rx="3" fill="#000000"/>',
    ...rects,
    '</svg>',
    '',
  ].join('\n')
}

mkdirSync(join(root, 'public', 'icons'), { recursive: true })
writeFileSync(join(root, 'public', 'icons', 'icon.svg'), svg())
console.log('icon.svg written')
for (const size of [192, 512]) {
  writeFileSync(join(root, 'public', 'icons', `icon-${size}.png`), png(size))
  console.log(`icon-${size}.png written`)
}

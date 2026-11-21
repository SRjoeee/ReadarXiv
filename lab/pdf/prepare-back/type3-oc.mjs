// lab/pdf/prepare-back/type3-oc.mjs: poppler's two backends on a Type 3 glyph under optional content (stage 1a's finding 1,
// "poppler hides figure texts written inside forms only in part", to its root). Three one-page files, made here, each drawing
// the one glyph of a Type 3 font twice, at x 10 and x 60, one of the two inside `/OC /oc1 BDC … EMC` with oc1 OFF by default:
//   hidden-first: the hidden one first, its procedure `d1` (a glyph a renderer may cache: uncoloured, its box given);
//   visible-first: the visible one first, `d1`;
//   hidden-first-d0: the hidden one first, `d0` (a coloured glyph: not cached).
// Right is the visible glyph drawn and the hidden one not. Splash (pdftoppm) caches a d1 glyph's raster by font, matrix and
// code whatever the content's visibility: the glyph first drawn hidden is cached empty and the visible one after it is lost
// (hidden-first), the glyph first drawn visible is cached and drawn again where it should be hidden (visible-first); d0 is
// right. Cairo (pdftocairo) is right on all three. Which is why the poppler proof of a kind OFF (prove.mjs) renders by Cairo:
// matplotlib's figures set their text in Type 3 fonts with d1 procedures, and their glyphs recur across a figure.
//   node lab/pdf/prepare-back/type3-oc.mjs <scratch dir>   (exit 1 when Cairo is not right on all three)
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'

const dir = process.argv[2]
if (!dir) throw new Error('usage: type3-oc.mjs <scratch dir>')
mkdirSync(dir, { recursive: true })

function pdf(content, d0) {
  const proc = `${d0 ? '1000 0 d0' : '1000 0 0 0 800 800 d1'} 100 0 600 800 re f`
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [6 0 R] /D << /BaseState /ON /OFF [6 0 R] /Order [] >> >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 120 40] /Resources << /Font << /T3 5 0 R >> /Properties << /oc1 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type3 /FontBBox [0 0 800 800] /FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << /H 7 0 R >> /Encoding << /Type /Encoding /Differences [72 /H] >> /FirstChar 72 /LastChar 72 /Widths [1000] /Resources << >> >>',
    '<< /Type /OCG /Name (oc1) >>',
    `<< /Length ${proc.length} >>\nstream\n${proc}\nendstream`,
  ]
  let out = '%PDF-1.5\n'
  const at = []
  objs.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const x = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`
  return out
}
const hidden = x => `/OC /oc1 BDC BT /T3 20 Tf ${x} 10 Td (H) Tj ET EMC`, shown = x => `BT /T3 20 Tf ${x} 10 Td (H) Tj ET`
const cases = {
  'hidden-first': { text: `${hidden(10)} ${shown(60)}`, d0: false, want: [0, 1] },
  'visible-first': { text: `${shown(10)} ${hidden(60)}`, d0: false, want: [1, 0] },
  'hidden-first-d0': { text: `${hidden(10)} ${shown(60)}`, d0: true, want: [0, 1] },
}

/** an 8-bit gray PNG (pdftocairo -gray) or PGM (pdftoppm -gray): its dark pixels left of x 50 and right of x 55 */
function darkOf(file) {
  const b = readFileSync(file)
  let w, h, rows
  if (b[0] === 0x50) {
    const head = b.toString('latin1', 0, 64).split(/\s+/)
    w = Number(head[1])
    h = Number(head[2])
    const start = b.length - w * h
    rows = Array.from({ length: h }, (_, y) => b.subarray(start + y * w, start + (y + 1) * w))
  } else {
    let i = 8, type = 0
    const idat = []
    while (i < b.length) {
      const n = b.readUInt32BE(i), t = b.toString('latin1', i + 4, i + 8)
      if (t === 'IHDR') { w = b.readUInt32BE(i + 8); h = b.readUInt32BE(i + 12); type = b[i + 17] }
      if (t === 'IDAT') idat.push(b.subarray(i + 8, i + 8 + n))
      i += 12 + n
    }
    const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[type], raw = inflateSync(Buffer.concat(idat))
    rows = []
    let prev = new Uint8Array(w * bpp)
    for (let y = 0, p = 0; y < h; y++) {
      const f = raw[p++], line = Uint8Array.from(raw.subarray(p, p + w * bpp))
      p += w * bpp
      for (let x = 0; x < line.length; x++) {
        const a = x >= bpp ? line[x - bpp] : 0, up = prev[x], c = x >= bpp ? prev[x - bpp] : 0
        if (f === 1) line[x] += a
        else if (f === 2) line[x] += up
        else if (f === 3) line[x] += (a + up) >> 1
        else if (f === 4) { const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c); line[x] += pa <= pb && pa <= pc ? a : pb <= pc ? up : c }
      }
      rows.push(bpp === 1 ? line : line.filter((_, x) => x % bpp === 0))
      prev = line
    }
  }
  let left = 0, right = 0
  for (const r of rows) for (let x = 0; x < w; x++) if (r[x] < 128) { if (x < 50) left++; else if (x > 55) right++ }
  return [left, right]
}

let wrong = 0
for (const [name, c] of Object.entries(cases)) {
  const f = join(dir, `${name}.pdf`)
  writeFileSync(f, pdf(c.text, c.d0))
  const got = {}
  for (const [by, cmd, args] of [['splash', 'pdftoppm', ['-r', '72', '-gray']], ['cairo', 'pdftocairo', ['-r', '72', '-gray', '-png']]]) {
    const prefix = join(dir, `${name}-${by}`)
    const r = spawnSync(cmd, [...args, f, prefix], { encoding: 'latin1' })
    if (r.status !== 0) throw new Error(`${cmd}: ${r.stderr}`)
    const out = readdirSync(dir).find(x => x.startsWith(`${name}-${by}-`) && /\.(pgm|png)$/.test(x))
    const [left, right] = darkOf(join(dir, out))
    const drawn = [left > 0 ? 1 : 0, right > 0 ? 1 : 0]
    got[by] = { left, right, ok: drawn[0] === c.want[0] && drawn[1] === c.want[1] }
  }
  if (!got.cairo.ok) wrong++
  console.log(JSON.stringify({ case: name, want: c.want, splash: got.splash, cairo: got.cairo }))
}
process.exit(wrong ? 1 : 0)

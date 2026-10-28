// lab/pdf/spikes/figure-gate.mjs
// The figures' text gate (docs/route/orphan-text.md stage 5, the content class `figures`): our final pass wrapped as the maker
// child wraps it (layout/wrap.mjs wrapFinal over the paper's source units), its figure units (layout/figure-text.mjs) counted by
// what became of each (drawn, crowded, a font of no Unicode, a form shared or written again, a page past its bounds), and every
// page that holds a drawn one rendered by PDF.js in Node at SCALE, the pixel tier of the per-unit erasure for the figures' groups:
//   G1   every group shown is the page wrapped without the figures' groups (wrapFinal `figures: false`): 0 pixels apart, the
//        figures' wrap (their forms written again among it) changing no pixel; how far either stands from our unwrapped page (the
//        split shows' antialiasing, the ocg gate's G1 allowance) is reported beside it (`G1u`);
//   G3f  every drawn figure's group hidden changes pixels inside the drawn figures' bands alone (an antialiased edge, PAD px,
//        apart): no other ink hidden;
//   D    every drawn figure's band loses ink once its group is hidden: none of its original's ink left under a translation
//        (no double ink);
//   O    every drawn figure's band is then one colour (in 16 levels a channel, an edge's pixel in from each side): no stroke, fill
//        edge or other glyph inside the box its translation is drawn in, which no translation could then cover (no overlap with
//        the figure's lines).
// Each is counted and its failures listed by paper, page and unit; `--check` exits 1 on any. Reads the gate pack's fixtures
// (`--pack`, <dir>/<id>-zh/base.pdf and base.json, the marking's texts) or bases given (`--bases`, <dir>/<id>/base.pdf and
// base.json: figure-final.mjs's), each paper's source (`--sources`, <dir>/<id>/source.gz). One JSON line a paper, counts only.
//   pnpm exec tsx lab/pdf/spikes/figure-gate.mjs (--pack=<dir> | --bases=<dir>) --sources=<dir> [--check] <id>…
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { wrapFinal } from '../../../src/pdf-reader/engine/layout/wrap.mjs'
import { openPaper } from '../../../src/pdf-reader/engine/pipeline/live.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/source/tar.mjs'

const argOf = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const PACK = argOf('pack'), BASES = argOf('bases'), SOURCES = argOf('sources'), CHECK = process.argv.includes('--check')
const IDS = process.argv.slice(2).filter(a => !a.startsWith('--'))
if ((!PACK && !BASES) || !IDS.length) { console.error('usage: figure-gate.mjs (--pack=<dir> | --bases=<dir>) --sources=<dir> [--check] <id>…'); process.exit(2) }
const PDFJS = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
const OPTIONS = { cMapUrl: join(PDFJS, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(PDFJS, 'standard_fonts/'), verbosity: 0, useSystemFonts: false, isEvalSupported: false, isImageDecoderSupported: false }
const deflate = b => new Uint8Array(deflateSync(b, { level: 6 })), inflate = (b, l) => new Uint8Array(inflateSync(b, { maxOutputLength: l + 1 }))
const SCALE = 2, PAD = 2

/** a document's pages rendered at SCALE, the groups `off` names hidden */
async function renderer(bytes) {
  const task = getDocument({ ...OPTIONS, data: bytes.slice() })
  const doc = await task.promise
  const cfg = await doc.getOptionalContentConfig({ intent: 'display' }).catch(() => null)
  const ids = new Map()
  for (const [id, g] of cfg ?? []) if (typeof g?.name === 'string' && g.name.startsWith('axt:')) ids.set(g.name.slice(4), id)
  return {
    async render(p, off = new Set()) {
      const page = await doc.getPage(p), vp = page.getViewport({ scale: SCALE })
      const { canvas, context } = doc.canvasFactory.create(Math.ceil(vp.width), Math.ceil(vp.height))
      if (cfg) for (const [g, id] of ids) cfg.setVisibility(id, !off.has(g))
      await page.render({ canvasContext: context, viewport: vp, canvas, ...(cfg ? { optionalContentConfigPromise: Promise.resolve(cfg) } : {}) }).promise
      const img = { data: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height }
      page.cleanup()
      return img
    },
    close: () => task.destroy(),
  }
}
/** a unit's band box at SCALE, device pixels, y down */
function bandOf(u, h) {
  const nx = -u.uy, ny = u.ux, lo = u.descent * u.size, hi = u.ascent * u.size
  const pts = [[0, lo], [u.length, lo], [0, hi], [u.length, hi]].map(([s, t]) => [(u.x + u.ux * s + nx * t) * SCALE, h - (u.y + u.uy * s + ny * t) * SCALE])
  return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]
}

let failed = false
for (const id of IDS) {
  const dir = PACK ? join(PACK, `${id}-zh`) : join(BASES, id)
  const base = join(dir, 'base.pdf')
  if (!existsSync(base)) { console.log(JSON.stringify({ id, missing: base })); failed = true; continue }
  const record = existsSync(join(dir, 'base.json')) ? JSON.parse(readFileSync(join(dir, 'base.json'), 'utf8')) : null
  const texts = record?.texts ?? null, inkless = record?.inkless ?? null
  const src = SOURCES ? join(SOURCES, id, 'source.gz') : null
  const units = src && existsSync(src) ? openPaper((await unpackSource(new Uint8Array(readFileSync(src)))).files).units : null
  const final = new Uint8Array(readFileSync(base))
  const t0 = performance.now()
  const wrapOptions = { PL, getDocument, documentOptions: { ...OPTIONS }, OPS, units, ...(units ? {} : { follows: null }), deflate, inflate }
  const marked = units ? texts : null, none = units ? inkless : null
  const r = await wrapFinal(final, { ...wrapOptions, texts: marked, inkless: none })
  const ms = Math.round(performance.now() - t0)
  if (r.refused) { console.log(JSON.stringify({ id, refused: r.refused, why: r.why })); failed = true; continue }
  const drawn = r.figures.units
  const byPage = new Map()
  for (const u of drawn) (byPage.get(u.page) ?? byPage.set(u.page, []).get(u.page)).push(u)
  const fails = { G1: [], G3f: [], D: [], O: [] }
  const bare = await wrapFinal(final, { ...wrapOptions, texts: marked, inkless: none, figures: false })
  if (bare.refused) { console.log(JSON.stringify({ id, refused: `without figures: ${bare.refused}`, why: bare.why })); failed = true; continue }
  let G1u = 0, splitPx = 0
  const A = await renderer(r.bytes), U = await renderer(bare.bytes), F = await renderer(final)
  try {
    for (const [p, list] of [...byPage].sort((a, b) => a[0] - b[0])) {
      const on = await A.render(p), plain = await U.render(p), raw = await F.render(p)
      let apart = 0, most = 0
      for (let i = 0; i < on.data.length; i += 4) {
        if (on.data[i] !== plain.data[i] || on.data[i + 1] !== plain.data[i + 1] || on.data[i + 2] !== plain.data[i + 2]) {
          apart++
          most = Math.max(most, Math.abs(on.data[i] - plain.data[i]), Math.abs(on.data[i + 1] - plain.data[i + 1]), Math.abs(on.data[i + 2] - plain.data[i + 2]))
        }
        if (on.data[i] !== raw.data[i] || on.data[i + 1] !== raw.data[i + 1] || on.data[i + 2] !== raw.data[i + 2]) G1u++
      }
      // (a show two groups share is split as the remover split one, its codes kept: its glyphs' antialiasing may move by a level or
      // two, the ocg gate's G1 allowance, E4 variant (a), Δ 16 at most; past it, or past 0.01 % of the page, a failure)
      if (apart) splitPx += apart
      if (apart && (most > 16 || apart > 1e-4 * on.width * on.height)) fails.G1.push(`p${p}: ${apart} px, Δ ${most}`)
      const off = await A.render(p, new Set(list.map(u => u.group)))
      const w = on.width, bands = list.map(u => bandOf(u, on.height))
      const lost = new Uint32Array(list.length)
      let outside = 0
      for (let i = 0, px = 0; i < on.data.length; i += 4, px++) {
        if (on.data[i] === off.data[i] && on.data[i + 1] === off.data[i + 1] && on.data[i + 2] === off.data[i + 2]) continue
        const x = px % w, y = Math.floor(px / w)
        let any = false
        bands.forEach((b, k) => { if (x >= b[0] - PAD && x < b[2] + PAD && y >= b[1] - PAD && y < b[3] + PAD) { any = true; if (x >= b[0] && x < b[2] && y >= b[1] && y < b[3]) lost[k]++ } })
        if (!any) outside++
      }
      if (outside) fails.G3f.push(`p${p}: ${outside} px outside the figures' bands`)
      list.forEach((u, k) => {
        if (!lost[k]) fails.D.push(`p${p} ${u.group} ${JSON.stringify(u.text)}`)
        // (the band itself, in the unit's own frame, a pixel in from each edge: a turned label's box is no page box)
        const b = bands[k], colours = new Set(), h = on.height, inset = 1 / SCALE
        for (let y = Math.floor(b[1]); y <= Math.ceil(b[3]); y++) for (let x = Math.floor(b[0]); x <= Math.ceil(b[2]); x++) {
          if (x < 0 || y < 0 || x >= w || y >= h) continue
          const px = (x + 0.5) / SCALE - u.x, py = (h - y - 0.5) / SCALE - u.y
          const sAlong = px * u.ux + py * u.uy, tAcross = -px * u.uy + py * u.ux
          if (sAlong < inset || sAlong > u.length - inset || tAcross < u.descent * u.size + inset || tAcross > u.ascent * u.size - inset) continue
          const o = 4 * (y * w + x)
          colours.add(`${off.data[o] >> 4},${off.data[o + 1] >> 4},${off.data[o + 2] >> 4}`)
        }
        if (colours.size > 1) fails.O.push(`p${p} ${u.group} ${JSON.stringify(u.text)} ${colours.size} colours`)
      })
    }
  } finally { await A.close(); await U.close(); await F.close() }
  const s = r.figures.stats
  console.log(JSON.stringify({ id, ms, pages: byPage.size, units: s.units, drawn: s.drawn, crowded: s.crowded, unicode: s.unicode, shared: s.shared, page: s.page, bounds: s.bounds, forms: s.forms, letters: s.letters, ledgerFigures: r.ledger.classes.figures ?? null, groups: r.stats.groups, G1u, G1split: splitPx, G1: fails.G1.length, G3f: fails.G3f.length, D: fails.D.length, O: fails.O.length }))
  for (const [k, list] of Object.entries(fails)) for (const f of list.slice(0, 10)) console.log(`  ${k} ${f}`)
  if (CHECK && Object.values(fails).some(l => l.length)) failed = true
}
process.exit(failed ? 1 : 0)

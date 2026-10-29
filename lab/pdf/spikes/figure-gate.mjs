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
//        the figure's lines);
//   R    every drawn figure's room (its band before its box's start and after its end, figure-text.mjs roomsOf: the free line a
//        longer translation may take) is then one colour too, so measured: a translation in its room touches no other ink.
// Each is counted and its failures listed by paper, page and unit; `--check` exits 1 on any. Beside them, each paper's sets
// (figure-text.mjs setsOf: the units of one column or one baseline, `sets` of two or more, the units in them, those whose anchor
// their column changed) and the fit rule over the drawn units, label by label as BUNDLE 10 drew them (each its own box, no room)
// against set by set (figure-fit.mjs fitFigureSet, rooms taken): the labels drawn, those at their full size, the sets of two or
// more drawn whose sizes differ, the sets whose size changed; on BUNDLE 10's side a translation mixing CJK with a Latin letter or
// a digit is not drawn (its one CJK face, served with no Latin, refused it). Its translations a MODEL (zh: a CJK em for every
// MODEL_LETTERS of a label's letters, two at least, its digits kept, 0.55 em each), or with `--mt=<file>` Microsoft's (a JSON of label → translation;
// `--mt-fetch` asks for the labels it lacks, as the fixture maker does: mt.mjs translateUnits over translateTexts, two requests at
// a time, and writes the file), their widths by kind of character (a CJK character or a full-width sign an em, a space 0.3, any
// other 0.55). Reads the gate pack's fixtures
// (`--pack`, <dir>/<id>-zh/base.pdf and base.json, the marking's texts) or bases given (`--bases`, <dir>/<id>/base.pdf and
// base.json: figure-final.mjs's), each paper's source (`--sources`, <dir>/<id>/source.gz). One JSON line a paper, counts only.
//   pnpm exec tsx lab/pdf/spikes/figure-gate.mjs (--pack=<dir> | --bases=<dir>) --sources=<dir> [--check] [--mt=<file> [--mt-fetch]] <id>…
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { fitFigureSet, sameAsSource } from '../../../src/pdf-reader/engine/layer-proto/figure-fit.mjs'
import { wrapFinal } from '../../../src/pdf-reader/engine/layout/wrap.mjs'
import { openPaper } from '../../../src/pdf-reader/engine/pipeline/live.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/source/tar.mjs'

const argOf = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const PACK = argOf('pack'), BASES = argOf('bases'), SOURCES = argOf('sources'), CHECK = process.argv.includes('--check')
const MT = argOf('mt'), MT_FETCH = process.argv.includes('--mt-fetch')
const IDS = process.argv.slice(2).filter(a => !a.startsWith('--'))
if ((!PACK && !BASES) || !IDS.length) { console.error('usage: figure-gate.mjs (--pack=<dir> | --bases=<dir>) --sources=<dir> [--check] <id>…'); process.exit(2) }
const PDFJS = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
const OPTIONS = { cMapUrl: join(PDFJS, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(PDFJS, 'standard_fonts/'), verbosity: 0, useSystemFonts: false, isEvalSupported: false, isImageDecoderSupported: false }
const deflate = b => new Uint8Array(deflateSync(b, { level: 6 })), inflate = (b, l) => new Uint8Array(inflateSync(b, { maxOutputLength: l + 1 }))
const SCALE = 2, PAD = 2
/** the fit rule's last floor, zh's (the layout rules' Hans floorMin, the layer's P.floorMin) */
const FLOOR = JSON.parse(readFileSync(new URL('../../../src/pdf-reader/engine/rules/layout-rules.json', import.meta.url), 'utf8')).scripts.Hans.floorMin
/** the model's zh translation of a label: a CJK character for every MODEL_LETTERS of its letters (two at least), its digits kept */
const MODEL_LETTERS = 2.7
const modelWidth = text => Math.max(2, Math.round((text.match(/\p{L}/gu) ?? []).length / MODEL_LETTERS)) + 0.55 * (text.match(/\p{N}/gu) ?? []).length
const WIDE = /[\u2e80-\u9fff\uac00-\ud7af\u3000-\u30ff\uf900-\ufaff\uff00-\uffef]/u
const textWidth = t => [...t].reduce((w, ch) => w + (WIDE.test(ch) ? 1 : /\s/u.test(ch) ? 0.3 : 0.55), 0)
const mtCache = MT && existsSync(MT) ? JSON.parse(readFileSync(MT, 'utf8')) : {}
/** one request to Microsoft's endpoint as the fixture maker makes it (layer-fixtures.mjs `microsoft`: mt.mjs translateMicrosoft's
 *  request, its User-Agent, each answer `{ text, by }`) */
async function microsoft(texts, to) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`https://edge.microsoft.com/translate/translatetext?${new URLSearchParams({ from: '', to: to === 'zh' ? 'zh-Hans' : to, isEnterpriseClient: 'false' })}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'ReadarXiv/0.1 (+https://readarxiv.org; research)' }, body: JSON.stringify(texts) })
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`)
      return (await res.json()).map(item => (typeof item?.translations?.[0]?.text === 'string' ? { text: item.translations[0].text, by: 'microsoft' } : null))
    } catch (e) { if (attempt === 3) throw e; await new Promise(r => setTimeout(r, 1500 * (attempt + 1))) }
  }
}
/** the labels' translations Microsoft gives, as the fixture maker asks for them (mt.mjs translateUnits over translateTexts, two
 *  requests at a time, markers), into the cache */
async function fetchMt(texts) {
  const want = [...new Set(texts)].filter(t => !Object.hasOwn(mtCache, t))
  if (!want.length) return
  const { translateTexts, translateUnits, shown } = await import('../../../src/pdf-reader/engine/translate/mt.mjs')
  const latin1 = t => { let o = ''; for (const b of new TextEncoder().encode(t)) o += String.fromCharCode(b); return o }
  const units = want.map(t => ({ kind: 'inkfigures', pieces: [{ t: 'text', s: latin1(t) }] }))
  const { results } = await translateUnits(units, ts => translateTexts(ts, 'zh', { parallel: 2, send: microsoft }), 'markers')
  units.forEach((u, i) => { const r = results.get(u); mtCache[want[i]] = r?.state === 'whole' ? r.pieces.map(p => (p.t === 'text' ? shown(p) : ' ')).join('').replace(/\s+/gu, ' ').trim() : null })
  writeFileSync(MT, `${JSON.stringify(mtCache, null, 1)}\n`)
}
/**
 * The fit rule over a paper's drawn units (wrapFinal's figures.units), BUNDLE 10's (each label alone in its box) against this
 * one's (set by set, rooms taken), given each label's translation width at size 1 (`widthOf`, null where nothing is drawn: a
 * translation that says its source again): the labels drawn and at full size on each side, the sets of two or more drawn units
 * whose sizes differ, and those whose size changed
 */
function fitCounts(units, widthOf, mixedOf) {
  const items = units.map(u => ({ u, width1: widthOf(u), mixed: mixedOf(u) })).filter(x => x.width1 !== null)
  // (BUNDLE 10's layer drew a translation in one face, a CJK one where it held a CJK character, whose served slices hold no Latin
  // letter or digit: one that mixed them was refused, `served`)
  const old = new Map(items.map(x => [x, x.mixed ? null : fitFigureSet([{ f: { ...x.u, before: 0, after: 0 }, width1: x.width1 }], FLOOR)[0]]))
  const bySet = new Map()
  for (const x of items) (bySet.get(`${x.u.page}:${x.u.set}`) ?? bySet.set(`${x.u.page}:${x.u.set}`, []).get(`${x.u.page}:${x.u.set}`)).push(x)
  const now = new Map()
  for (const list of bySet.values()) fitFigureSet(list.map(x => ({ f: x.u, width1: x.width1 })), FLOOR).forEach((fit, i) => now.set(list[i], fit))
  const drawn = m => [...m.values()].filter(Boolean).length
  const sizeOf = (m, x) => (m.get(x) ? m.get(x).size / x.u.size : null)
  let sets = 0, mixedOld = 0, mixedNew = 0, resized = 0
  for (const list of bySet.values()) {
    if (list.length < 2) continue
    sets++
    const spread = m => { const k = list.map(x => sizeOf(m, x)).filter(v => v !== null); return k.length > 1 && Math.max(...k) - Math.min(...k) > 0.005 }
    if (spread(old)) mixedOld++
    if (spread(now)) mixedNew++
    if (list.some(x => { const a = sizeOf(old, x), b = sizeOf(now, x); return (a === null) !== (b === null) || (a !== null && Math.abs(a - b) > 0.005) })) resized++
  }
  const atFull = m => items.filter(x => { const k = sizeOf(m, x); return k !== null && k > 0.995 }).length
  return { labels: items.length, drawnOld: drawn(old), drawnNew: drawn(now), fullOld: atFull(old), fullNew: atFull(now), sets, mixedOld, mixedNew, resized }
}

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
  const fails = { G1: [], G3f: [], D: [], O: [], R: [] }
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
        // (its room, the band before its start and after its end, the same way: one colour once the figures are hidden)
        const room = new Set()
        const lo = -(u.before ?? 0), hi = u.length + (u.after ?? 0), rb = bandOf({ ...u, x: u.x + u.ux * lo, y: u.y + u.uy * lo, length: hi - lo }, h)
        if (hi - lo > u.length) for (let y = Math.floor(rb[1]); y <= Math.ceil(rb[3]); y++) for (let x = Math.floor(rb[0]); x <= Math.ceil(rb[2]); x++) {
          if (x < 0 || y < 0 || x >= w || y >= h) continue
          const px = (x + 0.5) / SCALE - u.x, py = (h - y - 0.5) / SCALE - u.y
          const sAlong = px * u.ux + py * u.uy, tAcross = -px * u.uy + py * u.ux
          if (sAlong < lo + inset || sAlong > hi - inset || (sAlong > 0 && sAlong < u.length) || tAcross < u.descent * u.size + inset || tAcross > u.ascent * u.size - inset) continue
          const o = 4 * (y * w + x)
          room.add(`${off.data[o] >> 4},${off.data[o + 1] >> 4},${off.data[o + 2] >> 4}`)
        }
        if (room.size > 1) fails.R.push(`p${p} ${u.group} ${JSON.stringify(u.text)} ${room.size} colours in its room`)
      })
    }
  } finally { await A.close(); await U.close(); await F.close() }
  const s = r.figures.stats
  // (the fit rule's counts: the model's translations, and Microsoft's where asked)
  const model = fitCounts(drawn, u => modelWidth(u.text), u => /\p{N}/u.test(u.text))
  if (MT && MT_FETCH) await fetchMt(drawn.map(u => u.text))
  const mt = MT ? fitCounts(drawn, u => { const t = mtCache[u.text]; return typeof t === 'string' && t && !sameAsSource(t, u.text) ? textWidth(t) : null }, u => WIDE.test(mtCache[u.text] ?? '') && /[A-Za-z0-9]/.test(mtCache[u.text] ?? '')) : null
  const roomed = drawn.filter(u => (u.before ?? 0) + (u.after ?? 0) > 0).length
  console.log(JSON.stringify({ id, ms, pages: byPage.size, units: s.units, drawn: s.drawn, crowded: s.crowded, unicode: s.unicode, shared: s.shared, page: s.page, bounds: s.bounds, forms: s.forms, letters: s.letters, sets: s.sets, grouped: s.grouped, aligned: s.aligned, roomed, ledgerFigures: r.ledger.classes.figures ?? null, groups: r.stats.groups, G1u, G1split: splitPx, G1: fails.G1.length, G3f: fails.G3f.length, D: fails.D.length, O: fails.O.length, R: fails.R.length, model, ...(mt ? { mt } : {}) }))
  for (const [k, list] of Object.entries(fails)) for (const f of list.slice(0, 10)) console.log(`  ${k} ${f}`)
  if (CHECK && Object.values(fails).some(l => l.length)) failed = true
}
process.exit(failed ? 1 : 0)

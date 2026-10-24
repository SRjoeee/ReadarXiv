// The PDF layer's small capitals and capitals of the text's, laid and drawn in Chromium, Firefox and WebKit (docs/PDF-READER.md
// §18.1, the small capitals). The layer draws small capitals itself where a face has none of its own: each lowercase letter as the
// face's capital at the share of the size the page sets them at, in <tspan>s by runs of one case, measured on the canvas as they
// are drawn, no font-variant and no browser's synthesis. So in every browser a run's glyphs are drawn as wide as the layout measured
// them (each <tspan>'s glyphs, the copy's space after them aside, by getSubStringLength, against runEdge: that space is followed by
// no glyph, the next run drawn at its own place, and its kerning with the glyph before it is one Chromium's canvas sets none of and
// its SVG does), and the layout is the same in all three: the same lines, each item at the same place. (WebKit's
// getComputedTextLength, getBBox and getStartPositionOfChar give a run's advances unkerned, though it draws them kerned, as its
// canvas measures them and its getSubStringLength gives them: the ink of "AVAVAVAV" at 100 px is 480 px wide in WebKit, 481 in
// Chromium and Firefox, the unkerned advances 533.) Each browser's own
// synthesis of the same words is printed beside it, for the record: what the layer no longer leaves to the browser (Chromium's at
// 0.7 of the size, Firefox's at 0.8, WebKit's SVG and canvas two widths of their own).
// No network, no extension: a server of its own on 127.0.0.1 serves the engine's modules as they are and the faces; the faces are
// a stand-in (PDF.js's Liberation Sans, which this tree's node_modules holds) for every face the units ask, or, with
// AXT_FONTS=<a folder of the role table's files> (a gate pack's data/fonts), the role table's own.
//
// Usage: pnpm e2e:small-caps        (first time: npx playwright install chromium firefox webkit)
// Environment: AXT_BROWSERS=chromium,firefox,webkit (the default; a browser that does not launch fails the run unless
// AXT_BROWSERS names it out), AXT_FONTS as above.
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, firefox, webkit } from 'playwright'
import { FACES } from '../../src/pdf-reader/engine/rules/font-roles.mjs'
import { BUILTIN_RULES, resolveRules } from '../../src/pdf-reader/engine/rules/layout.mjs'

const ENGINE = fileURLToPath(new URL('../../src/pdf-reader/engine/', import.meta.url))
const STAND_IN = fileURLToPath(new URL('../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf', import.meta.url))
const FONTS = process.env.AXT_FONTS ? resolve(process.env.AXT_FONTS) : null
const BROWSERS = (process.env.AXT_BROWSERS ?? 'chromium,firefox,webkit').split(',').map(s => s.trim()).filter(Boolean)
const LAUNCH = { chromium, firefox, webkit }
/** CSS pixels per PDF unit, as a reader at 150 % draws the layer */
const SCALE = 2
/** a drawn run's width against its measured one, CSS pixels: a fiftieth of a pixel, and Firefox's rounding of each glyph's advance
 *  to its 1/60 px unit; a laid item's place across browsers, PDF units */
const drawnTol = glyphs => 0.02 + glyphs / 60
const PLACE_TOL = 0.01

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`)
}

/** a face file by its id: the role table's own where AXT_FONTS holds it, else the stand-in */
const faceFile = id => {
  const own = FONTS && FACES[id] ? join(FONTS, FACES[id].file) : null
  return own && existsSync(own) ? own : STAND_IN
}
const PAGE = `<!doctype html><meta charset="utf-8"><title>small capitals</title>
<style>body{margin:0}.tl{position:absolute;left:0;top:0;overflow:visible;font-synthesis:none}.tl text{white-space:pre;fill:#141414}</style>
<script type="module">
import * as L2 from '/engine/layer-proto/layer2.mjs'
import * as F from '/engine/layer-proto/fonts.mjs'
import { FACES } from '/engine/rules/font-roles.mjs'
const SVG = 'http://www.w3.org/2000/svg'
const loaded = new Set()
/** the faces a unit's tokens ask, each FontFace once, loaded before any of them is measured (the engine's own order, run.mjs) */
async function load(tokens) {
  for (const { face } of F.runsOfTokens(tokens)) {
    for (const id of face.ids ?? []) {
      const f = FACES[id] ?? null
      if (loaded.has(id) || !f) continue
      loaded.add(id)
      const ff = new FontFace(f.family, 'url(/face/' + id + ')', { weight: String(f.weight), style: f.style })
      await ff.load()
      document.fonts.add(ff)
    }
  }
  await document.fonts.ready
}
window.lay = async ({ to, P, unit, resolved, base, width, synth }) => {
  F.setRoleFaces(to, 'times', null)
  const res = Object.assign(new Map(resolved.renderings ?? []), resolved.fields)
  const designs = { serif: 'times', sans: 'helvetica', mono: 'courier' }
  await load(L2.tokensOf2(unit, res, to, base, designs, P, null, () => 0))
  const tokens = L2.tokensOf2(unit, res, to, base, designs, P, null)
  const block = { page: 1, rects: [[1, 0, 98, width, 106], [1, 0, 86, width, 94], [1, 0, 74, width, 82]], x0: 0, x1: width, B: [100, 88, 76], exact: [true, true, true], sizes: [10, 10, 10], pitch0: 12, free: 0, indent: 0, after: 0, centred: false }
  const L = L2.layoutUnit2(tokens, [block], 10, P)
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('class', 'tl')
  svg.setAttribute('width', String(width * ${SCALE} + 40))
  svg.setAttribute('height', '300')
  svg.innerHTML = L2.svgOfUnit(L, 1, (x, y) => [x * ${SCALE}, (120 - y) * ${SCALE}], ${SCALE}, 0)
  document.body.replaceChildren(svg)
  const spans = [...svg.querySelectorAll('tspan')]
  const runs = L.lines.flatMap(line => L2.lineRuns(line, L).filter(r => r.crop === undefined).map(run => ({ run, line })))
  // (each run's glyphs as drawn: its <tspan> again beside it, the copy's space after them left out, which moves no glyph)
  const drawn = runs.map(({ run, line }, i) => {
    const n = run.text.replace(/\\s+$/, '').length
    const model = (L2.runEdge(run, n, line, L) - L2.runEdge(run, 0, line, L)) * ${SCALE}
    let width = null
    if (spans[i] && n) {
      const glyphs = spans[i].cloneNode(false)
      glyphs.textContent = run.text.slice(0, n)
      spans[i].after(glyphs)
      width = glyphs.getSubStringLength(0, n)
      glyphs.remove()
    }
    return { text: run.text, sc: run.sc ?? 1, glyphs: n, model, width, worst: width === null ? (n ? Number.POSITIVE_INFINITY : 0) : Math.abs(width - model) }
  })
  const lines = L.lines.map(l => l.items.map(it => ({ s: it.t.space ? ' ' : (it.t.s ?? ''), x: it.x, w: it.w, sc: it.t.sc ?? 1 })))
  // (the browser's own synthesis of the same words, for the record: its <tspan> in the face asked small capitals, and the canvas)
  let synthesis = null
  if (synth) {
    const face = F.faceOf({ ...base, caps: true }, 'latin', to)
    const t = document.createElementNS(SVG, 'text')
    t.innerHTML = '<tspan style="font-family:' + face.family.replace(/"/g, "'") + ';font-weight:' + face.weight + ';font-variant:small-caps;font-synthesis-small-caps:auto" font-size="' + 10 * ${SCALE} + '">' + synth + '</tspan>'
    svg.append(t)
    const ctx = new OffscreenCanvas(8, 8).getContext('2d')
    ctx.font = F.fontString(face, 10 * ${SCALE})
    const ours = L2.tokensOf2({ kind: 'heading', src: '', pieces: [{ t: 'text', s: synth, tr: true }] }, res, to, { ...base, caps: true }, designs, P, null)
    synthesis = { svg: t.firstChild.getComputedTextLength(), canvas: ctx.measureText(synth).width, ours: ours.reduce((a, x) => a + x.w100, 0) * 10 * ${SCALE} / 100 }
  }
  return { lines, drawn, synthesis, markup: svg.innerHTML.length }
}
window.ready = true
</script>`

const types = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json' }
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (path === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE); return }
  if (path.startsWith('/engine/')) {
    const file = normalize(join(ENGINE, path.slice('/engine/'.length)))
    const ext = file.slice(file.lastIndexOf('.'))
    if (file.startsWith(ENGINE.endsWith(sep) ? ENGINE : ENGINE + sep) && types[ext] && existsSync(file)) { res.writeHead(200, { 'content-type': types[ext] }); res.end(readFileSync(file)); return }
  }
  if (path.startsWith('/face/')) {
    const id = path.slice('/face/'.length)
    if (FACES[id]) { res.writeHead(200, { 'content-type': 'font/otf' }); res.end(readFileSync(faceFile(id))); return }
  }
  res.writeHead(404); res.end('not found')
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const ORIGIN = `http://127.0.0.1:${server.address().port}`

const params = to => ({ ...resolveRules(BUILTIN_RULES, to).params, autospace: 0, compressMax: -1, hyphen: 0 })
const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times' }
const text = s => ({ t: 'text', s, tr: true })
const odebrain = [...'ODEBRAIN'].map((ch, k) => ({ ch, size: k < 4 ? 9.963 : 7.97 }))
/** the units laid in each browser: ICLR's appendix heading in Spanish and German (2602.23285 p15), its method's name the page's own
 *  characters; a paragraph's \textsc run (2608.07584); a German heading whose ß expands; a REVTeX all-capitals heading; Russian */
const CASES = [
  { name: 'ICLR heading, es', to: 'es', width: 300, base: { ...BASE, caps: true }, unit: { kind: 'heading', src: '', pieces: [text('A.1 Discusión: perspectivas clave sobre '), { t: 'ph', src: '\\ours', k: 1 }] }, resolved: { fields: { orig: { size: 9.963 }, capsRatio: 0.8 }, renderings: [[1, { mode: 'orig-text', text: 'ODEBRAIN', gap: { chars: odebrain } }]] }, synth: 'Discusión: perspectivas clave' },
  { name: 'ICLR heading, de', to: 'de', width: 300, base: { ...BASE, caps: true }, unit: { kind: 'heading', src: '', pieces: [text('A.2 Dynamische spektrale Graphstruktur und Größe')] }, resolved: { fields: { orig: { size: 9.963 }, capsRatio: 0.8 } }, synth: 'Dynamische spektrale Graphstruktur' },
  { name: 'a \\textsc run in a paragraph, es', to: 'es', width: 160, base: BASE, unit: { kind: 'para', src: '', pieces: [text('Véase '), { t: 'open', id: 1, src: '\\textsc{' }, text('ComplexityWorld'), { t: 'close', id: 1, src: '}' }, text(' para los detalles del entorno y de sus tareas.')] }, resolved: { fields: { orig: { size: 9.963 }, capsRatio: 0.8 } } },
  { name: 'REVTeX all-capitals heading, es', to: 'es', width: 300, base: { ...BASE, upper: true }, unit: { kind: 'heading', src: '', pieces: [text('Trabajos relacionados y Straße')] }, resolved: { fields: { orig: { size: 9.963 } } } },
  { name: 'ICLR heading, ru', to: 'ru', width: 300, base: { ...BASE, caps: true }, unit: { kind: 'heading', src: '', pieces: [text('Обсуждение: ключевые идеи')] }, resolved: { fields: { orig: { size: 9.963 }, capsRatio: 0.8 } }, synth: 'Обсуждение: ключевые идеи' },
]

const byBrowser = new Map()
for (const name of BROWSERS) {
  let browser
  try { browser = await LAUNCH[name].launch({ headless: true }) } catch (e) {
    check(`${name} launches`, false, String(e?.message ?? e).split('\n')[0])
    continue
  }
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e?.message ?? e)))
  await page.goto(`${ORIGIN}/`)
  await page.waitForFunction(() => window.ready === true, null, { timeout: 30_000 })
  const out = []
  for (const c of CASES) {
    const r = await page.evaluate(arg => window.lay(arg), { to: c.to, P: params(c.to), unit: c.unit, resolved: c.resolved, base: c.base, width: c.width, synth: c.synth ?? null })
    out.push(r)
    const over = r.drawn.filter(d => d.worst > drawnTol(d.glyphs))
    if (process.env.AXT_DEBUG) for (const d of r.drawn) console.log(`    ${JSON.stringify(d.text)} sc ${d.sc} measured ${d.model.toFixed(3)} drawn ${d.width?.toFixed(3)}`)
    check(`${name}: ${c.name}, each run's glyphs drawn as wide as they were measured`, over.length === 0, `${r.drawn.length} runs (${r.drawn.filter(d => d.sc !== 1).length} of small capitals), the widest difference ${Math.max(...r.drawn.map(d => d.worst)).toFixed(4)} px${over.length ? `; over: ${over.map(d => JSON.stringify(d.text)).join(', ')}` : ''}`)
    if (r.synthesis) console.log(`  ${name} synthesizes "${c.synth}": its SVG ${r.synthesis.svg.toFixed(2)} px, its canvas ${r.synthesis.canvas.toFixed(2)} px; the layer's own small capitals ${r.synthesis.ours.toFixed(2)} px`)
  }
  check(`${name}: no page error`, errors.length === 0, errors.join(' | ') || 'none')
  byBrowser.set(name, out)
  await browser.close()
}

// the same layout in every browser that ran: the same lines, each item's text and place
const names = [...byBrowser.keys()]
if (names.length > 1) {
  const [first, ...rest] = names
  CASES.forEach((c, i) => {
    const a = byBrowser.get(first)[i].lines
    for (const other of rest) {
      const b = byBrowser.get(other)[i].lines
      let worst = 0, same = a.length === b.length
      for (let l = 0; same && l < a.length; l++) {
        same = a[l].length === b[l].length
        for (let k = 0; same && k < a[l].length; k++) {
          same = a[l][k].s === b[l][k].s && a[l][k].sc === b[l][k].sc
          worst = Math.max(worst, Math.abs(a[l][k].x - b[l][k].x), Math.abs(a[l][k].w - b[l][k].w))
        }
      }
      check(`${c.name}: ${first} and ${other} lay it alike`, same && worst <= PLACE_TOL, `${a.length} line${a.length === 1 ? '' : 's'}, ${same ? 'the same items' : 'other items'}, places within ${worst.toFixed(5)} PDF units`)
    }
  })
}
server.close()
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed (${names.join(', ') || 'no browser'}${FONTS ? `, the role table's faces from ${FONTS}` : ', the stand-in face'})`)
process.exit(failed.length || names.length < BROWSERS.length ? 1 : 0)

// lab/typeset/parity/today/entry.mjs: today's side of the parity check, the page render.mjs bundles (esbuild) and drives in
// Chromium. Today's door (`openLayer`, the engine at AXT_TODAY) opened over a paper version's server-made layer as the
// website's reader opens it (baseline/tools/reader-entry.mjs: the bundle's index, the composed document, the parts, the
// target, the web's own face sources over the static index the reader carries, the served hyphenation, the left parts by
// ref, OPS), the pair's door rows taken whole, then each page drawn as the reading view draws a laid page
// (view/layer-side.mjs drawingOf): the door's copy of the composed page (render A, the groups of the units drawn there
// hidden, its crops and pastes) at the place's resolution, the door's SVG over it in the copy's frame, the page's links
// (view/links.mjs linkLayer), in `.axt-layer` under the engine's own sheet (view/engine.css) and its text-rendering decision
// (view/text-rendering.mjs applyLayerText). arXiv's own page drawn beside it by PDF.js (the original). What is read back is
// what was drawn: each character of the SVG where the browser placed it, in the face, weight, style and size it was set in.
// Two choices are not the product's, both the baseline's (NOTES.md §4): `fillsMs: Infinity` and `records: true`.
// Both pages stand in a page box as PDF.js's page view sizes one (its viewer's page div, which today's place is): the page's
// size at the scale floored to whole CSS px, the canvas that box at the device ratio, drawn at the page's exact scale from its
// top-left corner and cut at the box (pdf_viewer.mjs PDFPageView draw: floorToDivide, outputScale). A canvas shown in a box of
// a fraction of a CSS px is resampled by the compositor to the whole px it snaps the box to (1587 device px shown in 1588:
// +0.063 %), which no reader's page view is.
import * as pdfjs from 'pdfjs-dist'
import INDEX from '@web/fonts/static/index.json'
import { faceSourcesOf, groupsAt, tableUrlsOf } from '@web/layer/faces.ts'
import { indexOf, readHead, readPart, readUnitsChunk } from '@today/layer-proto/format.mjs'
import { openLayer, PDF_OPTIONS } from '@today/layer-proto/reader.mjs'
import { pagesOf } from '@today/layout/delta-wire.mjs'
import { linkLayer } from '@today/view/links.mjs'
import { createShapes, layerShapes } from '@today/view/shapes.mjs'
import { unitOf } from '@today/layer-proto/rows.mjs'
import { plainTranslated } from '@today/translate/mt.mjs'
import { applyLayerText } from '@today/view/text-rendering.mjs'
import { linesOfSvg } from '../measure-dom.mjs'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs'
const ASSETS = { cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/' }
/** the door's scale (reader.mjs SCALE): its SVG's user units a PDF unit, its audit's device pixels a PDF unit (dpr 1) */
const DOOR = 2.5
/** the highlight's pad beside a run, CSS px (view/lighting.mjs PAD): its paint's, a point's share of it at the page's scale */
const PAD = 3
const bytes = async (url) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return new Uint8Array(await r.arrayBuffer())
}
const obj = (ref) => bytes(`/obj/${ref.sha256}`)
const concat = (a, b) => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}
let layer = null,
  doc = null,
  orig = null,
  target = null,
  head = null,
  /** today's highlight shapes of the two panes, made as the reading view makes them (view/layer-side.mjs catchUp); the rows
   *  by unit (its sentences' offsets, row[4]); the units each page drawn lights (its laid words' spans) */
  hlLeft = null,
  hlRight = null,
  hlRows = null,
  hlLit = null,
  hlIndex = null
const faceSources = faceSourcesOf(INDEX, groupsAt(tableUrlsOf(INDEX)))
const stage = () => document.getElementById('stage')
/** a page view's box at a viewport: its CSS px, whole (PDF.js floors them to a multiple of its pixel fraction's denominator, 1
 *  at an integral device ratio), and its canvas's pixels (that box at the ratio) */
const boxOf = (vp, dpr) => {
  if (!Number.isInteger(dpr)) throw new Error(`the parity's page box is PDF.js's at an integral device ratio, not ${dpr}`)
  const css = [Math.floor(vp.width), Math.floor(vp.height)]
  return { css, px: [css[0] * dpr, css[1] * dpr] }
}


/** each drawn anchor's target (its href) and box as drawn ([href, left, top, right, bottom], CSS px): an annotation layer's
 *  anchor by its section, which PDF.js sizes (verdict.mjs linksOf) */
function anchorBoxes(as) {
  return [...as].map((a) => {
    const sec = a.parentElement?.tagName === 'SECTION' && a.parentElement.parentElement?.classList.contains('annotationLayer') ? a.parentElement : a
    const r = sec.getBoundingClientRect()
    return [a.getAttribute('href') ?? '', r.left, r.top, r.right, r.bottom]
  })
}

window.today = {
  async open(desc) {
    window.__baseRuns = []
    target = desc.target
    const chunks = []
    for (const ref of desc.units) chunks.push(await readUnitsChunk(await obj(ref), { ref, before: chunks.at(-1) ?? null }))
    head = await readHead(await obj(desc.head), { ref: desc.head })
    const index = indexOf(head, chunks)
    const parts = []
    for (const ref of desc.parts) parts.push(await readPart(await obj(ref), { ref, index, chain: parts.at(-1)?.chain ?? null }))
    // (the composed document: over a delta, arXiv's PDF the head's `orig` names and then the delta; else the head's base)
    const delta = head.base.source === 'ours' && head.base.kind === 'delta'
    const composed = delta
      ? concat(await bytes(`/obj/${head.orig.sha256}`), await bytes(`/obj/${head.base.sha256}`))
      : await bytes(`/obj/${head.base.sha256}`)
    doc = await pdfjs.getDocument({ data: composed, ...ASSETS, ...PDF_OPTIONS, disableAutoFetch: true }).promise
    orig = await pdfjs.getDocument({ data: await bytes(desc.original), ...ASSETS }).promise
    layer = await openLayer({
      index,
      doc,
      parts,
      target,
      faceSources,
      hyphUrl: (lang) => `/hyph/${lang}.json`,
      OPS: pdfjs.OPS,
      fillsMs: Number.POSITIVE_INFINITY,
      // (the reader's toggles: the defaults, or each switch render.mjs is asked to turn on)
      ...(desc.classes ? { classes: desc.classes } : {}),
      leftPart: (_page, ref) => obj(ref),
      onRetired: () => {},
    })
    // (the highlight's shapes as the reading view makes them: the left's of the parts and each page's left part, the right's of
    // each laid page's words: view/layer-side.mjs catchUp, leftFor, rLay)
    hlLeft = createShapes({ kindOf: (id) => index.kinds[id] ?? undefined, warn: () => {} })
    hlRight = layerShapes(hlLeft)
    hlLeft.addParts(parts)
    hlLit = new Map()
    hlIndex = index
    const rows = await (await fetch(desc.rows)).json()
    hlRows = new Map(rows.filter((r) => Array.isArray(r) && Number.isInteger(r[0])).map((r) => [r[0], r]))
    layer.take(rows)
    layer.end()
    layer.endParts()
    return { pages: head.paper.pages, numPages: doc.numPages, orig: orig.numPages, delta }
  },
  /** arXiv's page n drawn by PDF.js at `scale` CSS px a point (dpr device px each), its link annotations (those PDF.js draws a
   *  border round apart: a width above 0 and a colour) and its glyphs' runs (runsOf) */
  async original(n, scale) {
    const p = await orig.getPage(n)
    const vp = p.getViewport({ scale })
    const dpr = window.devicePixelRatio
    const box = boxOf(vp, dpr)
    const canvas = document.createElement('canvas')
    canvas.width = box.px[0]
    canvas.height = box.px[1]
    Object.assign(canvas.style, { width: `${box.css[0]}px`, height: `${box.css[1]}px`, display: 'block' })
    canvas.className = 'axt-original'
    await p.render({ canvas, canvasContext: canvas.getContext('2d', { alpha: false }), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise
    const anns = (await p.getAnnotations()).filter((a) => a.subtype === 'Link' && (a.url || a.dest || a.action))
    const bordered = anns.filter((a) => a.borderStyle?.width > 0 && a.borderColor).length
    // (each annotation's target and rectangle, PDF units, in the order PDF.js lists them (TeX's), flagged A's: the links counted
    // per target per drawn line, verdict.mjs linksOf)
    const linkBoxes = anns.map((a) => [a.url ?? (a.dest !== undefined ? `#${JSON.stringify(a.dest)}` : `action:${JSON.stringify(a.action)}`), ...a.rect, 1])
    const { runs, fonts } = await runsOf(p)
    stage().replaceChildren(canvas)
    p.cleanup()
    return { view: [...p.view], links: anns.length, bordered, linkBoxes, size: box.css, runs, fonts }
  },
  /** page n laid by the door and drawn as the reading view draws it, at `scale` CSS px a point; what was drawn read back */
  async page(n, scale) {
    const p = await doc.getPage(n)
    const view = [...p.view]
    const vp = p.getViewport({ scale })
    let laid
    try {
      laid = await layer.pageOf(n, { lang: target })
    } catch (e) {
      stage().replaceChildren()
      return { page: n, committed: false, view, error: String(e?.message ?? e).slice(0, 300) }
    }
    // (a page the layer draws nothing of its own on shows arXiv's page: layer-side commit's shownOriginal)
    if (laid.hides === 0) {
      await window.today.original(n, scale)
      return { page: n, committed: true, shownOriginal: true, view, hides: 0, units: [], figures: [], names: [], crops: [], recs: [], links: 0, linksDrawn: 0, lit: [], litBoxes: {}, original: laid.words.original }
    }
    const dpr = window.devicePixelRatio
    const k = scale * dpr
    // (the copy of the place's box at the ratio, pixel for pixel: layer-side.mjs copyAt, `round(box × r)`, box the place's)
    const box = boxOf(vp, dpr)
    const width = Math.max(1, Math.round(box.css[0] * dpr)),
      height = Math.max(1, Math.round(box.css[1] * dpr))
    // (a delta's replaced page keeps the original's /Annots: the layer draws its own links, so the copy draws none: layer-side copyAt)
    const replaced = head.base.kind === 'delta' && pagesOf(head.base.replaced ?? []).includes(n)
    const canvas = await layer.copyOf(n, { k, width, height, context: { alpha: false }, ...(replaced ? { annotationMode: pdfjs.AnnotationMode.DISABLE } : {}) })
    // (the reading view's drawingOf: the copy, the SVG in the copy's frame, the links over them)
    laid.svg.setAttribute('viewBox', `0 0 ${laid.w} ${laid.h}`)
    laid.svg.setAttribute('preserveAspectRatio', 'none')
    laid.svg.setAttribute('aria-hidden', 'true')
    canvas.className = 'axt-layer-copy'
    const wrap = document.createElement('div')
    wrap.className = 'axt-layer'
    wrap.style.setProperty('--axt-frame-w', `calc(var(--total-scale-factor) * ${vp.width / scale}px)`)
    wrap.style.setProperty('--axt-frame-h', `calc(var(--total-scale-factor) * ${vp.height / scale}px)`)
    const links = linkLayer(laid.links, { viewport: vp, open: () => {}, follow: () => {}, words: null })
    wrap.append(canvas, laid.svg, ...(links ? [links] : []))
    const place = document.createElement('div')
    place.className = 'axt-place'
    Object.assign(place.style, { position: 'relative', width: `${box.css[0]}px`, height: `${box.css[1]}px` })
    place.style.setProperty('--total-scale-factor', String(scale))
    place.append(wrap)
    stage().replaceChildren(place)
    applyLayerText(laid.svg)
    await document.fonts.ready
    // (what the page drew, read back: each unit's lines (g[data-u]) from its characters' places, in PDF units, y up)
    const run = window.__baseRuns.at(-1)
    // (each crop: its unit, where it is drawn, its piece (a label's: 'label'), its source on A and the page of it)
    const crops = (run?.audit ?? [])
      .filter((a) => a.what === 'crop' && a.page === n && a.dst)
      .map((a) => [a.unit, view[0] + a.dst[0] / DOOR, view[3] - a.dst[3] / DOOR, view[0] + a.dst[2] / DOOR, view[3] - a.dst[1] / DOOR, a.k === undefined ? 'label' : String(a.k), ...(a.src ?? [null, null, null, null]), a.srcPage ?? n])
    const k2 = laid.w / (view[2] - view[0])
    const units = linesOfSvg(laid.svg, 'data-u', view, k2, crops)
    // (the figure texts and babel names it drew, groups of their own: g[data-f], g[data-n])
    const figures = linesOfSvg(laid.svg, 'data-f', view, k2)
    const names = linesOfSvg(laid.svg, 'data-n', view, k2)
    const recs = (run?.stats ?? []).filter((r) => (r.pages ?? []).includes(n)).map((r) => ({ id: r.id, s: r.s ?? null, lead: r.lead ?? null }))
    const spans = laid.words.spans.filter(([, ranges]) => ranges.some((v, i) => i % 2 === 1 && v > 0)).map(([id]) => id)
    // (the page told to the highlight's shapes, as the reading view tells them a page it draws: its left part, its laid words;
    // its sentence boxes read once every page is drawn, litBoxes)
    if (!hlLeft.has(n)) hlLeft.addPage(await layer.leftPageOf(n))
    hlRight.lay(n, laid.words)
    hlLit.set(n, spans)
    return {
      page: n,
      committed: true,
      view,
      // (a delta's replaced page: the copy is our compile's page, not arXiv's, so its ink is not arXiv's in place)
      ...(replaced ? { replaced: true } : {}),
      hides: laid.hides ?? null,
      units,
      figures,
      names,
      crops,
      recs,
      links: laid.links.length,
      linksDrawn: links ? links.querySelectorAll('a').length : 0,
      bordersDrawn: links ? links.querySelectorAll('a[data-axt-border]').length : 0,
      // (each anchor's target and box as drawn, CSS px: verdict.mjs linksOf)
      linkBoxes: links ? anchorBoxes(links.querySelectorAll('a')) : [],
      lit: spans,
      original: laid.words.original,
    }
  },
  /**
   * The sentence boxes of each unit page n lights, on both panes, once the pages are drawn (each unit's every page told, as a
   * reading session tells them): { [id]: { right, left } }, each a list of [x0, y0, x1, y1] in PDF units, y up, the right's on
   * our page, the left's on arXiv's. Where the unit lights by sentence (view/lighting.mjs startsOf: its starts on both panes,
   * as many, each pane's shapes holding its words by them; made as view/layer-side.mjs startsFor makes them), every sentence's
   * rectangles (shapes.sentence), else its runs' blocks (shapes.block: lit whole); as the reader paints them at `scale` CSS px a
   * point (lighting.mjs paint: padded PAD beside, the rows' half leading above and below their own); where by sentence, also
   * `rightBy` and `leftBy`, the same boxes sentence by sentence (an entry a sentence, empty where it has none on the page)
   */
  async litBoxes(n, scale) {
    const out = {}
    for (const id of hlLit?.get(n) ?? []) {
      // (its left parts, every page of it: its starts are made once all have come, shapes.mjs starts)
      for (const p of hlLeft.layout.pagesOf.get(id) ?? []) if (!hlLeft.has(p)) hlLeft.addPage(await layer.leftPageOf(p))
      const row = hlRows.get(id),
        u = row?.[4] ? unitOf(hlIndex, row) : null
      const ls = u?.pieces ? hlLeft.starts(id, u.src, row[4].src) : null
      const rs = u?.pieces ? hlRight.starts(id, plainTranslated(u.pieces), row[4].tr, ls) : null
      const by = !!ls && !!rs && ls.length === rs.length && hlLeft.shapes.fits(id, ls, true) === true && hlRight.shapes.fits(id, rs, true) === true
      const boxesOf = (side, starts) =>
        side.shapes
          .runs(id)
          .filter((r) => r.page === n)
          .flatMap((r) => (by ? Array.from({ length: starts.length + 1 }, (_, s) => side.shapes.sentence(r, starts, s, PAD / scale)).flat() : [side.shapes.block(r, PAD / scale)]))
          .map((b) => [b.x0, b.y0, b.x1, b.y1])
      // (and where it lights by sentence, each sentence's own on each pane, in order: the granularity's, sentences.mjs)
      const perSentence = (side, starts) =>
        Array.from({ length: starts.length + 1 }, (_, s) =>
          side.shapes
            .runs(id)
            .filter((r) => r.page === n)
            .flatMap((r) => side.shapes.sentence(r, starts, s, PAD / scale))
            .map((b) => [b.x0, b.y0, b.x1, b.y1]),
        )
      out[id] = { right: boxesOf(hlRight, rs), left: boxesOf(hlLeft, ls), by, ...(by ? { rightBy: perSentence(hlRight, rs), leftBy: perSentence(hlLeft, ls) } : {}) }
    }
    return out
  },
  /** the drawing's translated text alone (its copy and links hidden), or the whole of it again */
  textOnly(on) {
    document.documentElement.toggleAttribute('data-parity-text', on)
    return true
  },
  /** the drawing without its text (its copy, the original's ink it keeps and its crops alone), or the whole of it again */
  copyOnly(on) {
    document.documentElement.toggleAttribute('data-parity-copy', on)
    return true
  },
  dispose() {
    hlRight?.dispose()
    hlLeft = hlRight = hlRows = hlLit = hlIndex = null
    layer?.dispose()
    layer = null
    // (the composed document is the layer's to let go; arXiv's own is ours)
    void orig?.loadingTask?.destroy()
    doc = orig = null
  },
}
window.todayReady = true

/**
 * The glyphs of a page of arXiv's PDF as PDF.js's text content gives them, in runs of one font, size and baseline: each
 * [x0, y0, x1, y1, base, size, font, text, turned] in PDF units (y up), its box the run's advance along its direction from 0.2
 * of its size under its baseline to 0.8 over, turned with it; `font` an index into `fonts`, the PDF's own font names (the
 * subset tag included, as A names them). What the original's style, size and scripts are read from, apart from any part
 */
async function runsOf(p) {
  const tc = await p.getTextContent()
  const fonts = []
  const at = new Map()
  const runs = []
  const r2 = (v) => Math.round(v * 100) / 100
  for (const it of tc.items) {
    if (!it.str || !/\S/.test(it.str) || !it.transform) continue
    const [a, b, c, d, e, f] = it.transform
    const size = Math.hypot(c, d),
      len = Math.hypot(a, b)
    if (!size || !len) continue
    const ux = a / len,
      uy = b / len
    let fi = at.get(it.fontName)
    if (fi === undefined) {
      let name = ''
      try {
        if (p.commonObjs.has(it.fontName)) name = p.commonObjs.get(it.fontName)?.name ?? ''
      } catch {}
      fi = fonts.length
      fonts.push(name)
      at.set(it.fontName, fi)
    }
    const w = it.width ?? 0
    const pts = [0, w].flatMap((s) => [-0.2 * size, 0.8 * size].map((t) => [e + s * ux - t * uy, f + s * uy + t * ux]))
    const xs = pts.map((q) => q[0]),
      ys = pts.map((q) => q[1])
    const turned = Math.abs(uy) > 1e-3 || ux < 0 ? 1 : 0
    runs.push([r2(Math.min(...xs)), r2(Math.min(...ys)), r2(Math.max(...xs)), r2(Math.max(...ys)), r2(f), r2(size), fi, it.str, turned])
  }
  return { runs, fonts }
}

// src/pdf-reader/engine/layer-proto/reader.mjs
// The reader's door (the layer-only plan of 2026-10-08, §7, A2's E4). On 2026-10-08 the instant layer became the only
// reading view, for the web reader and the extension alike; both take every engine value they use from this module, and
// both draw a paper through openLayer: the one place v0's host is written (run.mjs openProto's options: the geometry,
// the hybrid's choices, the add-on, the labels, the scale), so that neither reader decides how a page is drawn and both
// draw it as the layer gate measured it. The rest is what a host needs around it: the bundle and its bounded reader, the
// rows, the layout file's and the add-on manifest's readers, the role table's faces and the face to ask for first, and
// the translation loop the extension runs itself. It reaches none of the server's modules (live.mjs, the remover, the
// layout maker and its marks) and no node: specifier: a test walks its imports.
import { groupOf } from '../groups.mjs'
import { rolesFor } from '../font-roles.mjs'
import { indexLayout } from '../layout/file.mjs'
import { OPEN_FAMILY } from './fonts.mjs'
import { sourceUnitsOf, toTranslate, unitOf } from './rows.mjs'
import { openProto } from './run.mjs'
import { rulesFor } from './target-rules.mjs'

export { PDF_OPTIONS } from './run.mjs'
export { BUNDLE, BUNDLE_CAP, BUNDLE_VALUES, BundleRefusal, bundleKey, CTAG, readBundle, VTAG } from './bundle.mjs'
export { batchesOf, layerRows, rowOf, runRows, toTranslate, unitOf } from './rows.mjs'
export { ADDON_CAP, ADDON_MANIFEST_CAP, ADDON_MANIFEST_VALUES, parseAddonManifest } from '../layout/addon-manifest.mjs'
export { indexLayout, LAYOUT, LAYOUT_CAP, LAYOUT_VALUES, LayoutRefusal, parseLayout } from '../layout/file.mjs'
export { trPiecesOf } from '../layer/pieces.mjs'
export { FACES } from '../font-roles.mjs'
export { translateUnits } from '../mt.mjs'

/** the hybrid's choices, the layer gate's (--proto-tex=lines): each unit the layout file locates whole drawn by the file's
 *  lines, label and placeholders, the units only the file holds drawn too (but table cells), no symbol drawn as text
 *  asked to be found, each line's erase extent v0's own */
const HYBRID = Object.freeze({ use: 'lines', texOnly: true, symbols: 'text', extents: 'v0' })
/** v0's resolution, one on every device: 2.5 CSS px a PDF unit at a device pixel ratio of 1, the gate's 2.5 device pixels a
 *  unit (a view draws the page at its own, copyOf) */
const SCALE = 2.5
/** which floats take the target's names (L7): figures and tables alike, whatever the paper's own final would do */
const CAPTIONS = Object.freeze({ figure: 'target', table: 'target' })

/** what a value is, for a refusal: its type, never its text */
const kindOf = v => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v)

/**
 * The face a host asks for first, at the open, before the paper's English family is known: the target's CJK body face,
 * light where its rules say so beside the family v0 opens with (OPEN_FAMILY), else null. It is the face openLayer's run
 * warms at its open, asked through the rules rather than the role table, so that no host decides a face.
 */
export function firstFaceOf(target) {
  const { cjkFaces } = rulesFor(target)
  return cjkFaces ? rolesFor(target, OPEN_FAMILY, cjkFaces).cjk.body : null
}

/** each left-side unit's rectangles by page, [id, x0, y0, x1, y1] each (unitAt's) */
function shapesOf(units) {
  const by = new Map()
  for (const [id, , rects] of units) for (const [page, a, b, c, d] of rects) {
    const list = by.get(page) ?? by.set(page, []).get(page)
    list.push([id, Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)])
  }
  return by
}

/**
 * The layer of one paper and target, as either reader shows it: v0 opened over the composed document `doc` (arXiv's PDF
 * followed by the bundle's add-on, opened once by PDF.js with PDF_OPTIONS; arXiv's PDF alone where the bundle has no
 * add-on) with the bundle's `left` as its geometry, its layout file as the hybrid's (none where the maker refused), its
 * add-on's manifest as the text removal's (the old way where there is none), the units to come the target's
 * (toTranslate), each table cell's group from the bundle's cells, the target's caption names on every float (L7), the
 * host's served faces (`faceSources`) and hyphenation patterns (`hyphUrl`), at scale 2.5 and a device pixel ratio of 1,
 * no copy kept at v0's own resolution: one set of choices on every device. Each choice made for the target is the
 * rules' (target-rules.mjs), none a host's. Its rows are taken as they come.
 *
 *   take(rows)           each row as v0's unit (rows.mjs unitOf), into the run: the pages newly complete. A row that is no
 *                        unit of the bundle's is skipped and counted (stats().dropped)
 *   end()                no more rows: every page is complete with what it holds
 *   pageOf(page, { lang })  the page done (every page up to it drawn and laid, those done let go: as the gate asks for
 *                        them), as the run set it: its SVG element itself at the run's scale, its lang the one given, and
 *                        its size in CSS px
 *   copyOf(page, source, k)  the done page's copy at a view's resolution: a canvas of `source`'s size, `source` (the page
 *                        as PDF.js drew it at k device pixels a unit) under v0's drawing scaled to k
 *   unitAt(page, x, y)   the unit of the left whose shape holds the point (PDF units of the page as the left holds them:
 *                        the identity map), the smallest where several do; null where none
 *   stats()              the units the layer awaits, those drawn, the pages laid, the slowest task and each page's time,
 *                        the rows dropped, and the rules it was opened with
 *   dispose()            the run let go: every sheet it inserted removed, every page's canvases released, and nothing
 *                        answered after (but stats and unitAt). What the page's runs share stays: the FontFaces added to
 *                        document.fonts (the browser keeps what they loaded) and the sheet of the faces' classes the SVG
 *                        text names (layer2.mjs faceClass: each face's class made once a page, for every run)
 */
export async function openLayer({ bundle, doc, target, faceSources, hyphUrl } = {}) {
  if (bundle === null || typeof bundle !== 'object' || !Array.isArray(bundle.units) || bundle.left === null || typeof bundle.left !== 'object') throw new TypeError(`bundle: a read bundle (readBundle's), not ${kindOf(bundle)}`)
  if (doc === null || typeof doc !== 'object' || typeof doc.getPage !== 'function' || !Number.isSafeInteger(doc.numPages)) throw new TypeError(`doc: a PDF.js document, not ${kindOf(doc)}`)
  if (typeof target !== 'string') throw new TypeError(`target: a language tag, not ${kindOf(target)}`)
  if (typeof faceSources !== 'function') throw new TypeError(`faceSources: a function, not ${kindOf(faceSources)}`)
  if (typeof hyphUrl !== 'function') throw new TypeError(`hyphUrl: a function, not ${kindOf(hyphUrl)}`)
  const rules = rulesFor(target)
  const expect = toTranslate(bundle, target)
  // (each cell's group as the bundle's cells give it: a group is read once its own cells' rows are in)
  const groups = new Map()
  sourceUnitsOf(bundle).forEach((u, id) => { const g = u ? groupOf(u) : null; if (g) groups.set(id, g) })
  const run = await openProto({
    doc,
    geometry: { schema: 1, kinds: bundle.left.kinds, left: { pages: bundle.left.pages, units: bundle.left.units } },
    units: [], expect, groups, target,
    pages: Number.POSITIVE_INFINITY, scale: SCALE, dpr: 1, copy: false,
    tex: bundle.layout ? { ...HYBRID, index: indexLayout(bundle.layout), pieces: new Map() } : null,
    removal: bundle.addon ? { mode: 'draw', doc, manifest: bundle.addon.manifest } : null,
    labels: { names: rules.labels, captions: CAPTIONS },
    faceSources, hyphUrl,
  })
  let dropped = 0, disposed = false, shapes = null
  const live = () => { if (disposed) throw new Error('openLayer: the layer was let go (dispose)') }
  const pageIn = page => { if (!Number.isSafeInteger(page) || page < 1 || page > run.N) throw new RangeError(`page: 1 to ${run.N}, not ${typeof page === 'number' ? page : kindOf(page)}`) }
  /** the page done, and every page up to it done let go: the order the gate asks for pages in, a page let go before the
   *  units of the next are laid (v0 draws no crop from a page let go) */
  const done = async page => {
    live()
    pageIn(page)
    await run.until(page)
    live()
    for (let q = 1; q <= page; q++) if (!run.rows[q - 1].released) run.release(q)
  }
  return {
    take(rows) {
      if (disposed) return { complete: [] }
      const got = new Map()
      for (const row of rows) {
        const u = unitOf(bundle, row)
        if (u) got.set(row[0], u)
        else dropped++
      }
      return run.take(got)
    },
    end() { if (!disposed) run.end() },
    async pageOf(page, { lang } = {}) {
      if (typeof lang !== 'string') throw new TypeError(`lang: a language tag, not ${kindOf(lang)}`)
      await done(page)
      const r = run.rows[page - 1]
      r.svg.setAttribute('lang', lang)
      return { svg: r.svg, w: r.w, h: r.h }
    },
    async copyOf(page, source, k) {
      if (!(typeof k === 'number' && Number.isFinite(k) && k > 0)) throw new RangeError(`k: device pixels a PDF unit, not ${typeof k === 'number' ? k : kindOf(k)}`)
      const w = source?.width, h = source?.height
      if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1) throw new TypeError(`source: a page drawn on a canvas, not ${kindOf(source)}`)
      await done(page)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      await run.drawCopy(page, canvas.getContext('2d'), source, k)
      return canvas
    },
    unitAt(page, x, y) {
      if (!Number.isSafeInteger(page) || !Number.isFinite(x) || !Number.isFinite(y)) return null
      shapes ??= shapesOf(bundle.left.units)
      let best = null, area = Number.POSITIVE_INFINITY
      for (const [id, x0, y0, x1, y1] of shapes.get(page) ?? []) {
        if (x < x0 || x > x1 || y < y0 || y > y1) continue
        const a = (x1 - x0) * (y1 - y0)
        if (a < area || (a === area && id < best)) { best = id; area = a }
      }
      return best
    },
    stats() {
      // (the pages laid: each page's step ends once its units are laid, pageMs, page after page)
      let laidTo = 0
      while (laidTo < run.N && run.pageMs[laidTo + 1] !== undefined) laidTo++
      const pages = [], pageMs = {}
      for (let p = 1; p <= run.N; p++) {
        if (run.doneAt(p) <= laidTo) pages.push(p)
        if (run.pageMs[p] !== undefined) pageMs[p] = run.pageMs[p]
      }
      let slowestTaskMs = 0
      for (const ms of run.ms.values()) if (ms > slowestTaskMs) slowestTaskMs = ms
      return { units: expect.length, drawn: run.stats.length, pages, slowestTaskMs, pageMs, dropped, rules: { schema: run.rules.schema, version: run.rules.version } }
    },
    dispose() {
      if (disposed) return
      disposed = true
      run.dispose()
    },
  }
}

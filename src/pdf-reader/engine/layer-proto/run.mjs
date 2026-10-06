// src/pdf-reader/engine/layer-proto/run.mjs
// Ported from the private prototype (readarxiv-web, exp/instant-layer at 9e56fca, web/prototypes/instant-layer/main.js),
// 2026-10-06, as the instant layer's v0: the parts of the prototype's page that drive a paper's pages. Our own code, so
// no licence applies; the provenance is kept so that every number the prototype was approved on traces back to it.
//
// What a page of v0 is, as main.js made it at the approved URL's defaults (v=2, batch=8, delay=0, scale=1.25, ph=auto,
// restoring on, no page-even): each page of the original drawn by PDF.js on a canvas (`left`), a copy of it (`right`) on
// which each unit's lines are erased and its crops of math drawn (layer2.mjs unitOps and drawOps, with what the erasing
// covers and no painted unit accounts for put back), and an SVG over the copy holding each unit's translation as text
// (svgOfUnit). The units are the made output's: their rectangles on the original (the geometry's left side, schema 1:
// the anchors' lines) and their translations (the units file).
//
// What changed from main.js, and why:
// - main.js streamed the units a batch at a time while its pages were still being drawn, each unit laid and painted
//   once all its pages were; the order in which units were laid (which teaches the paper's citations and macros to the
//   next, citeMap) and painted (what the restore counts as accounted) was the race between the two. Here the order is
//   the one main.js's promises give when every page after the first is drawn after the last batch has been released
//   (layGroups): the order the parity run of 2026-10-06 recorded on 8 of the 10 outputs it measured, and a
//   deterministic one. In it a unit is laid when its last page is drawn, so the pages are drawn one at a time and each
//   page's units laid and painted as it is (until), and a page no unit will paint again may be let go (release): the
//   prototype held every page's canvases, which a paper of 147 pages does not fit.
// - main.js showed its copy, a canvas at 1.25 CSS px a unit, scaled: at any other zoom everything not set as SVG text (a
//   table, a figure, a kept line, a formula's crop) was that canvas's pixels, a low-resolution screenshot. Here the
//   drawing is kept as data (each page's operations, unitOps'), and a view draws the page at its own resolution
//   (drawCopy): PDF.js's own rendering at the view's device pixels, the operations scaled to it, its crops and restores
//   cut from that rendering; v0's own canvases at its own resolution are the analysis's (the ink maps) and the gate's
//   (`copy`), never what a view shows.
// - The page's DOM (its rows, the banner, the status line), the timings and long tasks, the scorer's extras (score=1)
//   and the compiled final drawn beside (compare) are the host's or the measurement's, and are left out. The checker's
//   audit of every erase and crop (main.js check=1) is always kept: it is what a gate measures the drawing by.
// - The prototype's host is the caller's: the PDF.js document (opened with PDF_OPTIONS, the prototype's), where the
//   faces and the hyphenation patterns are served (fontUrl, hyphUrl).
// - The faces are the role table's (faces: 'roles', the default since the maintainer's ruling of 2026-10-06; fonts.mjs
//   setRoleFaces): each page's fonts' faces loaded before its characters are measured in them, the target's CJK faces and
//   the paper's designs' at the first page, the paper's family read from its first page's fonts as the engine reads a
//   layout file's (font-roles.mjs familyOfFonts). faces: 'prototype' draws in the prototype's own system faces and Latin
//   Modern, as the approved prototype did (its floor's numbers).
import { checkAll } from './check.mjs'
import { familyOfFonts } from '../font-roles.mjs'
import { classifyFont, faceOf, loadRoleFaces, loadWebFaces, styleKey, setRoleFaces } from './fonts.mjs'
import { loadHyphenation } from './hyph.mjs'
import { blocksOf, median, norm, wordsOf } from './layer1.mjs'
import * as L2 from './layer2.mjs'
import { locatedWhole, texParts, texRects } from './tex.mjs'

/** the prototype's getDocument options beside the host's asset URLs (main.js ASSETS): its canvases on the GPU, the whole
 *  file read at once */
export const PDF_OPTIONS = { cMapPacked: true, enableHWA: true, disableStream: true }
/** the fit's parameters a host may set (main.js read them from the query), and the page-even pass's units */
export const PARAM_KEYS = ['leadBase', 'leadFloor', 'trackMin', 'compressMax', 'borrow', 'borrowGap', 'floor', 'step', 'grid', 'cjkJust', 'spaceMax', 'autospace', 'spaceMin', 'hyphen', 'even', 'order', 'further', 'floorMin', 'trackStart', 'leadRel', 'fillSize']
/** the page's body units that the even pass sets alike (a unit on two pages keeps its own fit) */
const EVEN_KINDS = new Set(['para', 'abstract', 'list', 'item'])
/** the SVG's own rules (the prototype's index.html): its text set as laid, in the layer's ink */
const SVG_RULES = ['.tl{position:absolute;left:0;top:0;overflow:visible}', '.tl text{white-space:pre;fill:#141414}']
const r1 = x => Math.round(x * 100) / 100
const yieldNow = () => (globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise(ok => setTimeout(ok, 0)))

/**
 * The order main.js lays its units in when every page after the first is drawn after its last batch is released: the
 * units in batches of `batch` in reading order (`placed`, sorted by stream); a unit waits on each of its pages in turn,
 * and a page already drawn (the first) costs a turn of the microtask queue. Returns the ids by the page whose drawing
 * lays them, in that order: [page, ids] for page 1 (the batches' own turns) and each later page.
 */
export function layGroups(placed, batch = 8) {
  const groups = [], waiting = new Map(), micro = []
  let drawn = 1, cur = []
  const step = (p, at) => {
    if (at >= p.pages.length) { cur.push(p.id); return }
    const pg = p.pages[at]
    if (pg <= drawn) micro.push([p, at + 1])
    else { if (!waiting.has(pg)) waiting.set(pg, []); waiting.get(pg).push([p, at + 1]) }
  }
  const drain = () => { while (micro.length) step(...micro.shift()) }
  for (let b = 0; b < placed.length; b += batch) {
    for (const p of placed.slice(b, b + batch)) step(p, 0)
    drain()
  }
  groups.push([1, cur])
  const last = Math.max(1, ...placed.flatMap(p => p.pages))
  for (let pg = 2; pg <= last; pg++) {
    drawn = pg
    cur = []
    micro.push(...(waiting.get(pg) ?? []))
    waiting.delete(pg)
    drain()
    groups.push([pg, cur])
  }
  return groups
}
/** layGroups' ids in their order */
export const layOrder = (placed, batch = 8) => layGroups(placed, batch).flatMap(([, ids]) => ids)

/**
 * v0 over a paper's first `pages` pages. `doc`: the original opened by PDF.js (with PDF_OPTIONS); `geometry`: the made
 * output's geometry (schema 1); `units`: its units file's units (each { kind, src, pieces, state }); `target`: the
 * language. Options as main.js's query: `scale` (CSS px a PDF unit), `dpr`, `params` (layer2.mjs defaultParams'
 * overrides), `batch`, `phMode` ('auto' or 'source'), `restoring`, `order` (ids whose order a page's units are laid in,
 * in place of layGroups': a recorded run's). `faces`: 'roles' (the role table's) or 'prototype' (the prototype's own).
 * `faceUrl(file)`, `fontUrl(file)`, `hyphUrl(lang)`: where the host serves the role table's faces (by file name), the
 * prototype's Latin Modern (by name) and TeX's patterns. Nothing is drawn until `until(p)` is awaited.
 * `tex` (the hybrid, tex.mjs): the layout file (`index`, layout/file.mjs indexLayout's), the units file's pieces by unit
 * (`pieces`), and how its geometry is taken (`use`: 'ph', each placeholder's ink alone; 'lines', the unit's lines,
 * label too, its blocks v0's rule's over them; `extents`: 'v0' or 'tex', with 'lines'; `texOnly`: with 'lines', the units the file locates whole
 * that v0's geometry does not hold, but table cells; `symbols`: 'strict' or 'text', locatedWhole's). Each unit the file
 * locates whole takes them; every other unit is v0's own. Null: v0 alone.
 * `copy`: whether each page's copy is kept at v0's own resolution (`right`), the plane the checker and the gate measure;
 * a view draws the page at its own (drawCopy) and needs none.
 */
export async function openProto({ doc, geometry, units: all, target: to, pages = 999, scale = 1.25, dpr = 1, params = {}, batch = 8, phMode = 'auto', restoring = true, order: orderIn = null, faces = 'roles', faceUrl = file => `/fonts/${encodeURIComponent(file)}`, fontUrl, hyphUrl = lang => `/hyph/${lang}.json`, tex = null, copy = true }) {
  const P = L2.defaultParams(to)
  for (const k of PARAM_KEYS) if (params[k] !== undefined) P[k] = params[k]
  // iteration 2's hyphenation, fetched at once (local, small)
  const hyphP = Promise.all([...new Set(['en', to === 'de' ? 'de' : null, to === 'ru' ? 'ru' : null].filter(Boolean))].map(async l => L2.setHyphenData(l, await loadHyphenation(l, hyphUrl(l)))))
  // the target's likely faces loaded meanwhile (Times-like until the paper's own designs are known), and Latin Modern at
  // once: the page's characters are measured in their own designs
  const roles = faces === 'roles'
  // (the role table's faces: the paper's family is known from its first page; until then its Latin faces, which no
  // family changes)
  setRoleFaces(roles ? to : null, 'times')
  const warmP = roles ? null : L2.warmFaces(to, { serif: 'times' }, yieldNow)
  const lmP = roles ? null : loadWebFaces(['cm', 'cmss', 'cmtt'], fontUrl)
  // the role table's faces of a style in each weight and slant (a translation's run of the design may be bold where the
  // original's is not), and of the CJK runs
  const STYLES = [[false, false], [true, false], [false, true], [true, true]]
  const roleIdsOf = (st, cls) => STYLES.flatMap(([bold, italic]) => faceOf({ ...st, fam: st.fam === 'math' ? 'serif' : st.fam, bold, italic }, cls, to).ids)
  const N = Math.min(doc.numPages, pages)

  const rows = []
  for (let i = 1; i <= N; i++) {
    const view = geometry.left.pages[i - 1] ?? [0, 0, 612, 792]
    const w = (view[2] - view[0]) * scale, h = (view[3] - view[1]) * scale
    const left = document.createElement('canvas'), right = copy ? document.createElement('canvas') : null
    for (const c of [left, right]) if (c) { c.style.width = `${w}px`; c.style.height = `${h}px` }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'tl')
    svg.setAttribute('width', String(w))
    svg.setAttribute('height', String(h))
    svg.setAttribute('xml:space', 'preserve')
    // (ops: the page's drawing as data, every painted unit's in turn: kept when the page's canvases are let go)
    rows.push({ page: i, left, right, svg, w, h, base: false, ops: [] })
  }
  const sheet = document.head.appendChild(document.createElement('style'))
  for (const rule of SVG_RULES) sheet.sheet.insertRule(rule, sheet.sheet.cssRules.length)

  const fontClass = new Map()
  const fontOfPage = (page, styles) => name => {
    let c = fontClass.get(name)
    if (!c) {
      let obj = null
      try { obj = page.commonObjs.get(name) } catch {}
      c = classifyFont(obj?.name ?? '', styles?.[name]?.fontFamily)
      fontClass.set(name, c)
    }
    return c
  }
  const chars2 = [], inks = [], views = [], pageBottom = []
  const fontTally = new Map()

  const placed = [], skipped = []
  const inGeometry = new Set(geometry.left.units.map(u => u[0]))
  all.forEach((u, id) => {
    if ((u.state === 'whole' || u.state === 'partial') && u.pieces && !inGeometry.has(id)) skipped.push({ id, kind: u.kind, why: 'unanchored', chars: trCharsOf(u) })
  })
  // the hybrid: whether the layout file locates each unit whole, and so which source its geometry is (sources: each
  // unit's, with why a unit is v0's)
  const sources = { tex: [], v0: [], why: {} }
  const judge = (id, u) => {
    if (!tex) return null
    const lu = tex.index.unit(id)
    const w = locatedWhole(lu, u, tex.pieces.get(id), { symbols: tex.symbols ?? 'text' })
    return w.ok ? { lu, kOf: w.kOf } : { why: w.why }
  }
  const placeOf = (id, stream, rects, u, t) => {
    const onPages = rects.filter(r => r[0] <= N)
    if (!onPages.length) return null
    // (cut: the unit goes on past the pages shown. It is laid over all its lines, those past the pages shown too, and
    // drawn on the pages shown: laid over the lines shown alone, all of its translation was set into them, shrunk to the
    // floor and the rest clipped, though the reader shows its next page as any other (1810.04805's unit 164 on page 12 of
    // 12 shown, 200 characters clipped in each alphabet). Its pages are the pages shown: it is laid when they are drawn)
    return { id, stream, rects, unit: u, blocks: blocksOf(onPages, geometry.left.pages), pages: [...new Set(onPages.map(r => r[0]))], cut: onPages.length < rects.length, tex: t }
  }
  /** a unit the file locates whole, placed by its lines in the file (texRects: the rectangles its exact baselines are by) */
  const placeByFile = (id, stream, u, w) => { const lines = texRects(w.lu); return placeOf(id, stream, lines.rects, u, { ...w, lines }) }
  for (const [id, stream, rects] of geometry.left.units) {
    const u = all[id]
    if (!u?.pieces || (u.state !== 'whole' && u.state !== 'partial')) continue
    if (u.kind === 'author') { skipped.push({ id, kind: u.kind, why: 'author', chars: trCharsOf(u), pages: [...new Set(rects.map(r => r[0]))] }); continue }
    const w = judge(id, u)
    let p = null
    if (w?.lu && tex.use === 'lines') {
      // the file's lines, frames and label in place of the anchors' rectangles (v0's where the file's lie past the
      // pages shown and the anchors' do not)
      p = placeByFile(id, stream, u, w)
      if (!p && (p = placeOf(id, stream, rects, u, null))) w.why = 'pages'
    } else p = placeOf(id, stream, rects, u, w?.lu ? w : null)
    if (!p) continue
    placed.push(p)
    if (tex) {
      if (p.tex) sources.tex.push(id)
      else { sources.v0.push(id); sources.why[w.why] = (sources.why[w.why] ?? 0) + 1 }
    }
  }
  // (texOnly: the units v0's geometry does not hold that the file locates whole, at their place in the text's stream
  // after the unit before them; table cells are not among them)
  if (tex?.texOnly && tex.use === 'lines') {
    const streamOf = new Map(geometry.left.units.map(([id, stream]) => [id, stream]))
    for (const id of tex.index.file.units.map(r => r[0])) {
      const u = all[id]
      if (inGeometry.has(id) || !u?.pieces || (u.state !== 'whole' && u.state !== 'partial') || u.kind === 'author' || u.kind === 'cell') continue
      const w = judge(id, u)
      if (!w.lu) { sources.why[`unanchored, ${w.why}`] = (sources.why[`unanchored, ${w.why}`] ?? 0) + 1; continue }
      let before = -1
      for (const [gid, s] of streamOf) if (gid < id && s > before) before = s
      const p = placeByFile(id, before + 0.5, u, w)
      if (!p) continue
      placed.push(p)
      sources.tex.push(id)
      sources.texOnly = (sources.texOnly ?? 0) + 1
      const at = skipped.findIndex(s => s.id === id)
      if (at >= 0) skipped.splice(at, 1)
    }
  }
  placed.sort((a, b) => a.stream - b.stream)
  // the lowest unit line of each page: no unit borrows below it (the page's text area)
  for (const [, , rects] of geometry.left.units) for (const r of rects) pageBottom[r[0]] = Math.min(pageBottom[r[0]] ?? Infinity, r[2] + 0.24 * (r[4] - r[2]))
  const expected = Array.from({ length: N + 1 }, () => 0)
  for (const p of placed) for (const pg of p.pages) expected[pg]++
  const stats = []
  const citeMap = new Map()
  const audit = []
  let designs = { serif: 'times', sans: 'helvetica', mono: 'courier' }

  const pxOf = i => {
    const vw = views[i - 1]
    return (x, y) => { const [vx, vy] = vw.convertToViewportPoint(x, y); return [vx * dpr, vy * dpr] }
  }
  const cssOf = i => {
    const vw = views[i - 1]
    return (x, y) => vw.convertToViewportPoint(x, y)
  }
  const inkOf = pg => {
    if (!inks[pg] && rows[pg - 1]?.base) inks[pg] = L2.inkMapOf(rows[pg - 1].left)
    return inks[pg]
  }
  // each page's characters that a painted unit accounts for (its text, its placeholders drawn elsewhere), and its items
  const accounted = [], keptOf = [], pageItems = []
  const restoreOf = (p, pg) => {
    if (!restoring || !p.prep?.cat) return null
    if (!accounted[pg]) accounted[pg] = new Set()
    const acc = accounted[pg]
    // what any unit keeps stays, whatever another unit says of it (a formula's glyph two units' lines both hold)
    if (!keptOf[pg]) keptOf[pg] = { keys: new Set(), hulls: [] }
    const kept = keptOf[pg]
    const px = pxOf(pg)
    const lines = new Map()
    for (const [key, cat] of p.prep.cat) {
      if (!key.startsWith(`${pg}|`)) continue
      if (cat === 'acc') acc.add(key)
      if (cat === 'keep') kept.keys.add(key)
    }
    for (const c of p.prep.uc ?? []) {
      if (c.page !== pg || c.sep || c.space || !/\S/.test(c.ch) || p.prep.cat.get(L2.charKey(c)) !== 'keep') continue
      const k = c.rect.join()
      if (!lines.has(k)) lines.set(k, [])
      lines.get(k).push(c)
    }
    inkOf(pg)
    for (const cs of lines.values()) {
      // grown over its ink as a crop is (a big bracket's or a radical's hanging part)
      const hull = { crop: [Math.min(...cs.map(c => c.x0)) - 0.5, Math.min(...cs.map(c => (c.ybEff ?? c.yb) - 0.35 * c.size)), Math.max(...cs.map(c => c.x1)) + 0.5, Math.max(...cs.map(c => c.yb + 0.9 * c.size))], gap: { chars: cs } }
      L2.growCrop(hull, inks[pg], px, scale * dpr, p.local?.[pg - 1] ?? chars2[pg - 1])
      const [ax, ay] = px(hull.crop[0], hull.crop[3]), [bx, by] = px(hull.crop[2], hull.crop[1])
      kept.hulls.push([Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)])
    }
    pageItems[pg] ??= L2.pageItemsOf(chars2[pg - 1] ?? [], pg, pxOf(pg), inks[pg])
    return { items: pageItems[pg].items, cover: pageItems[pg].cover, ink: inks[pg], accounted: acc, kept }
  }
  const paint = (p, pg) => {
    const r = rows[pg - 1]
    const ro = restoreOf(p, pg)
    // the unit's drawing as data, and on v0's own copy where it is kept: from the pages drawn now, as v0 drew it
    const ops = L2.unitOps(p.layout, p.blocks, pg, { px: pxOf(pg), k: scale * dpr, hasSource: j => !!rows[j - 1]?.base, pxOf, extents: p.layout.extents, audit, id: p.id, restore: ro })
    for (const o of ops) r.ops.push(o)
    if (r.right) L2.drawOps(r.right.getContext('2d'), ops, 1, j => (rows[j - 1]?.base ? rows[j - 1].left : null))
    r.svg.insertAdjacentHTML('beforeend', L2.svgOfUnit(p.layout, pg, cssOf(pg), scale, p.id))
  }

  // the columns of each page, as its paragraphs' lines span them: a line centred in its column (a caption under its
  // figure, a title over the text) is set centred, whatever the page's own middle
  const cols = []
  for (const [id, , rects] of geometry.left.units) if (geometry.kinds[id] === 'para') for (const r of rects) (cols[r[0]] ??= []).push([r[1], r[3]])
  const centredInColumn = b => {
    const rs = b.rects, list = cols[b.page] ?? []
    const mid = (b.x0 + b.x1) / 2
    const own = list.filter(([a, z]) => a <= mid && z >= mid)
    if (own.length < 3) return false
    const cx0 = Math.min(...own.map(c => c[0])), cx1 = Math.max(...own.map(c => c[1])), cmid = (cx0 + cx1) / 2
    const centres = rs.map(r => (r[1] + r[3]) / 2)
    return centres.every(c => Math.abs(c - cmid) < 2.5) && rs.every(r => r[3] - r[1] < 0.92 * (cx1 - cx0)) && rs[0][1] > cx0 + 4
  }
  // every unit's rectangles by page, for growing a unit's lines over what no other unit holds (with the file's lines of
  // the units the hybrid draws that v0's geometry does not hold)
  const rectsByPage = new Map()
  for (const [id, , rects] of geometry.left.units) for (const r of rects) { if (!rectsByPage.has(r[0])) rectsByPage.set(r[0], []); rectsByPage.get(r[0]).push([id, r]) }
  for (const p of placed) if (!inGeometry.has(p.id)) for (const r of p.rects) { if (!rectsByPage.has(r[0])) rectsByPage.set(r[0], []); rectsByPage.get(r[0]).push([p.id, r]) }
  const textArea = pg => { const rs = (rectsByPage.get(pg) ?? []).map(([, r]) => r); return [Math.min(...rs.map(r => r[1])), Math.max(...rs.map(r => r[3]))] }
  const columnOf = b => {
    const mid = (b.x0 + b.x1) / 2
    const own = (cols[b.page] ?? []).filter(([a, z]) => a <= mid && z >= mid)
    return own.length >= 3 ? [Math.min(...own.map(c => c[0])), Math.max(...own.map(c => c[1]))] : textArea(b.page)
  }
  // a single line may run on to its column's edge or the next glyph on its baseline (a heading is as wide as its
  // column, not as its English words); a centred one as far to either side
  const widen = b => {
    if (b.rects.length !== 1) return
    const r = b.rects[0], yb = b.B[0], size = b.sizes[0]
    const [cx0, cx1] = columnOf(b)
    const line = (chars2[b.page - 1] ?? []).filter(c => Math.abs(c.yb - yb) < 0.4 * size && /\S/.test(c.ch))
    const right = Math.min(cx1, ...line.filter(c => c.x0 > r[3] + 6).map(c => c.x0 - 0.5 * size))
    const left = Math.max(cx0, ...line.filter(c => c.x1 < r[1] - 1).map(c => c.x1 + 0.5 * size))
    if (b.centred) {
      const mid = (r[1] + r[3]) / 2, half = Math.min(right - mid, mid - left)
      if (half > (r[3] - r[1]) / 2) { b.x0 = mid - half; b.x1 = mid + half }
    } else if (right > b.x1) b.x1 = right
  }
  // the free space below a block, down to the first ink in its column or the page's lowest unit line
  const freeFor = (b, s) => {
    const map = inkOf(b.page)
    if (!map || pageBottom[b.page] === undefined) return 0
    const last = b.B.at(-1)
    const yStart = last - 0.3 * s, yLimit = pageBottom[b.page] - 0.3 * s
    if (yLimit >= yStart) return 0
    const dist = L2.freeBelow(map, pxOf(b.page), scale * dpr, b.x0 + 1, b.x1 - 1, yStart, yLimit)
    const pitch = b.pitch0 ?? 1.2 * s
    const lowest = dist >= yStart - yLimit - 0.01 ? pageBottom[b.page] : yStart - dist + P.borrowGap * pitch + 0.3 * s
    return Math.max(0, last - lowest)
  }

  // ---- no clipping (step 3): v0's fit drew what fitted at its last state and dropped the rest (2,314 characters on the
  // gate's 29 outputs). A unit that does not fit there is given more room where the page has it, and else stays the
  // original's, whole: nothing of it is drawn in part.
  /**
   * How far a single line's slot may run on to one side (`dir` -1 or 1) of `from`, on its band of the original page, over
   * paper only: up to the first ink that is not the unit's own (`own`, its lines' erase extents: erased with it), read on
   * the page's ink map, never past `limit`. Before another line's text (a neighbouring cell, whose translation may run on
   * towards it too) to half the paper between them; before any other ink (a rule, a figure) to a quarter of an em clear of
   * it. Returns the edge.
   */
  const paperTo = (b, dir, from, limit, own) => {
    const map = inkOf(b.page)
    if (!map) return from
    const px = pxOf(b.page), f = map.factor, z = b.sizes[0], B = b.B[0]
    const top = B + 0.8 * z, bottom = B - 0.25 * z
    const [, r0] = px(from, top), [, r1] = px(from, bottom)
    const ra = Math.max(0, Math.floor(Math.min(r0, r1) / f)), rb = Math.min(map.h - 1, Math.floor(Math.max(r0, r1) / f))
    const ownAt = x => own.some(e => x >= e[0] - 0.3 && x <= e[2] + 0.3 && e[1] < top && e[3] > bottom)
    const step = f / (scale * dpr)
    let x = from
    for (; dir > 0 ? x < limit : x > limit; x += dir * step) {
      const [cx] = px(x + dir * step / 2, B)
      const c = Math.floor(cx / f)
      if (c < 0 || c >= map.w) break
      if (ownAt(x + dir * step / 2)) continue
      let inked = false
      for (let r = ra; r <= rb && !inked; r++) if (map.ink[r * map.w + c]) inked = true
      if (!inked) continue
      // the ink a character of the page stands on is text, any other ink a rule's or a figure's
      const text = (chars2[b.page - 1] ?? []).some(ch => /\S/.test(ch.ch) && ch.x1 >= x - step && ch.x0 <= x + 2 * step && ch.yb - 0.25 * ch.size < top && ch.yb + 0.8 * ch.size > bottom)
      return text ? from + (x - from) / 2 : x - dir * 0.25 * z
    }
    return dir > 0 ? Math.min(x, limit) : Math.max(x, limit)
  }
  /** a unit's single-line blocks widened over the paper beside them (paperTo), within the page's text area; a centred one
   *  as far to either side. Returns the widened blocks, or null where none grew */
  const widenOverPaper = p => {
    let grew = false
    const out = p.blocks.map(b => {
      if (b.rects.length !== 1 || b.page > N) return b
      const own = [...(p.prep.extents ?? new Map())].filter(([r]) => r[0] === b.page).flatMap(([, e]) => (Array.isArray(e[0]) ? e : [e]))
      const [ax, az] = textArea(b.page)
      const right = paperTo(b, 1, b.x1, az, own), left = paperTo(b, -1, b.x0, ax, own)
      let x0 = b.x0, x1 = b.x1
      if (b.centred) { const half = Math.min(right - b.x1, b.x0 - left); if (half > 0.1) { x0 -= half; x1 += half } }
      else if (right > b.x1 + 0.1) x1 = right
      if (x1 - x0 <= b.x1 - b.x0 + 0.1) return b
      grew = true
      return { ...b, x0, x1, widened: true }
    })
    return grew ? out : null
  }
  /**
   * The fit's further steps for a unit its states leave clipped (P.further, in order): 'widen', its single lines widened
   * over the paper beside them (widenOverPaper), the fit run again in them; 'flow', the text run past a display where the
   * slots after it are too few (layoutUnit2's P.flowPast: out of the translation's order, but all of it shown, as v0's
   * own last pass already ran text on past a display); 'shrink', the size's steps on below the fit's floor, to
   * P.floorMin. Returns the first layout that sets every token, with the blocks it was laid in, or null.
   */
  const fitFurther = (p, tokens, s) => {
    for (const step of P.further ?? []) {
      if (step === 'widen') {
        const wide = widenOverPaper(p)
        if (!wide) continue
        const l = L2.layoutUnit2(tokens, wide, s, p.P, to)
        if (!l.clipped) return { layout: { ...l, knob: 'widen' }, blocks: wide }
      } else if (step === 'shrink' && P.floorMin < P.floor - 1e-9) {
        const l = L2.layoutUnit2(tokens, p.blocks, s, { ...p.P, floor: P.floorMin }, to)
        if (!l.clipped) return { layout: { ...l, knob: 'below-floor' }, blocks: p.blocks }
      } else if (step === 'flow') {
        const l = L2.layoutUnit2(tokens, p.blocks, s, { ...p.P, flowPast: true }, to)
        if (!l.clipped) return { layout: { ...l, knob: 'flow' }, blocks: p.blocks }
      }
    }
    return null
  }

  /**
   * The CJK runs' tracking a fit starts from (step 3): the em a syllable's advance loses to its face's size correction
   * (the role table's Source Han Serif K is drawn at 0.959 of the size, its Hangul a twenty-fifth shorter a syllable than
   * the faces the prototype was approved in), given back, so that a line of the translation is as long as at the
   * original's size; 0 where the face is drawn at its size (Chinese, Japanese, the prototype's own faces).
   */
  const cjkAdvance = () => {
    if (!P.cjk) return 0
    const c = faceOf({ fam: 'serif', bold: false, italic: false, caps: false, design: designs.serif }, 'cjk', to).size ?? 1
    return c < 1 ? Math.round((1 - c) * 1000) / 1000 : 0
  }
  const layout2 = p => {
    const t0 = performance.now()
    // the unit's lines grown over words the anchors left out beside them, then its first line's edge snapped back to
    // its first word's start
    const others = []
    for (const [pg, list] of rectsByPage) others[pg] = list.filter(([id]) => id !== p.id).map(([, r]) => r)
    // a line another unit's rectangle mostly covers is that unit's (the anchors carried a mark to the wrong column:
    // 1512.03385 page 3, a paragraph's last lines laid over the next column's): left out, the unit keeping one at least
    const overlap = (a, b) => Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])) * Math.max(0, Math.min(a[4], b[4]) - Math.max(a[2], b[2]))
    const claimed = r => (others[r[0]] ?? []).some(o => overlap(r, o) > 0.5 * (r[3] - r[1]) * (r[4] - r[2]))
    // (the file's lines are the unit's own, whole, and its first line starts at the unit's own mark: none of the
    // anchors' repairs of which lines are the unit's or where it starts; but a line's extent across is its words', as the
    // anchors' is (the maker's rows are the text layer's word tokens'), and is grown as v0 grows them, over a formula's
    // tail and a justified line's last glyphs: 1512.03385 page 10's "(mAP @" and "IoU =", whose "@" and "=" were put back
    // under the translation)
    const fileLines = !!p.tex?.lines
    const kept = fileLines ? p.rects : p.rects.filter(r => !claimed(r))
    p.dropped = kept.length && kept.length < p.rects.length ? p.rects.length - kept.length : 0
    // (its pages stay as they were counted: a page it no longer holds lines on is painted with nothing)
    if (p.dropped) p.rects = kept
    // iteration 3: the unit's own part of each of its pages (its rectangles' box, 20 pt above and below, 60 pt to
    // either side), one pass over the page, for every search below (each scanned the whole page, rectangle by rectangle)
    const local = [], windows = []
    for (const pg of p.pages) {
      const rs = p.rects.filter(r => r[0] === pg)
      const x0 = Math.min(...rs.map(r => r[1])) - 60, x1 = Math.max(...rs.map(r => r[3])) + 60, y0 = Math.min(...rs.map(r => r[2])) - 20, y1 = Math.max(...rs.map(r => r[4])) + 20
      windows[pg - 1] = [x0, x1, y0, y1]
      local[pg - 1] = (chars2[pg - 1] ?? []).filter(c => c.x1 >= x0 && c.x0 <= x1 && c.yb >= y0 && c.yb <= y1)
    }
    p.local = local
    // iteration 3: a block's far-in first line from its block's edge, and lines over what stands beside them, before the
    // unit is aligned (what they then hold is the unit's)
    if (!fileLines) L2.extendFirstLines(p.rects, geometry.left.pages, others)
    // (the words its source begins with before its first line over the page's whole width on its lines' bands, step 3:
    // they may stand further from it than the unit's own part of its page reaches, 60 pt, 1706.03762's "Work performed
    // while at Google" before "Research.")
    const bands = []
    for (const pg of p.pages) {
      const rs = p.rects.filter(r => r[0] === pg)
      const y0 = Math.min(...rs.map(r => r[2])) - 20, y1 = Math.max(...rs.map(r => r[4])) + 20
      bands[pg - 1] = (chars2[pg - 1] ?? []).filter(c => c.yb >= y0 && c.yb <= y1)
    }
    p.grown = L2.extendRects2(p.rects, local, others, p.unit.src, wordsOf, norm, geometry.left.pages, bands)
    // (and the unit's part of its page again where its lines grew past it: what they grew over is the unit's to read and
    // to account for, or its characters there were put back under the translation)
    if (p.grown) for (const pg of p.pages) {
      const rs = p.rects.filter(r => r[0] === pg), [x0, x1, y0, y1] = windows[pg - 1]
      const gx0 = Math.min(x0, ...rs.map(r => r[1])), gx1 = Math.max(x1, ...rs.map(r => r[3]))
      if (gx0 < x0 || gx1 > x1) local[pg - 1] = (chars2[pg - 1] ?? []).filter(c => c.x1 >= gx0 && c.x0 <= gx1 && c.yb >= y0 && c.yb <= y1)
    }
    const inkBefore = fileLines ? undefined : L2.snapFirstRect2(p.rects, local)
    // the hybrid: a unit the file locates whole read with the file's parts
    const parts = p.tex ? texParts(p.tex.lu, p.tex.kOf, { use: tex.use, lines: p.tex.lines, extents: tex.extents ?? 'v0' }) : null
    const prep = L2.prepareUnit(p.unit, p.rects, local, phMode === 'source' ? null : citeMap, null, parts)
    // iteration 3: each crop over the ink it touches (its page's ink map)
    for (const r of prep.values()) {
      if (r?.mode !== 'crop') continue
      L2.growCrop(r, inkOf(r.page), pxOf(r.page), scale * dpr, local[r.page - 1] ?? chars2[r.page - 1])
    }
    const t1 = performance.now()
    const orig = prep.orig
    const s = orig?.size ?? median(p.rects.map(r => r[4] - r[2])) / 0.894
    const base = orig && orig.st.fam !== 'math' ? { ...orig.st } : { fam: 'serif', bold: p.unit.kind === 'heading', italic: false, caps: false, design: designs.serif }
    const keep = prep.keep?.length ? new Set(prep.keep) : null
    p.blocks = L2.blocks2(p.rects, geometry.left.pages, keep, prep.lineInfo, prep.regionOf, prep.referenced)
    for (const b of p.blocks) if (!b.centred && centredInColumn(b)) b.centred = true
    if (p.unit.kind !== 'cell') for (const b of p.blocks) widen(b)
    // a label the first line starts with stays the original's: the line starts after it. A file's first line starts at
    // the unit's own mark, and so where the original's text does: after a label the file sets apart, at the line's own
    // start; after one it holds (a footnote's mark), where its first word is, never before the label's end (v0's quarter
    // of an em after it set a footnote's text 1.7 pt right of the original's)
    if (prep.label && p.blocks[0]) {
      const b = p.blocks[0]
      if (!fileLines) b.indent = Math.max(b.indent, prep.label.x1 + 0.25 * s - b.x0)
      else if (prep.label.x1 > p.rects[0][1] + 0.1) b.indent = Math.max(b.indent, (prep.firstX0 !== undefined && prep.firstX0 > prep.label.x1 ? prep.firstX0 : prep.label.x1 + 0.25 * s) - b.x0)
    }
    if (P.borrow && p.unit.kind !== 'cell') for (const b of p.blocks) b.freeOf = () => freeFor(b, s)
    const t2 = performance.now()
    const tokens = L2.tokensOf2(p.unit, prep, to, base, designs, P)
    const t3 = performance.now()
    // (the unit's leading relative to the original's own pitch, step 3: leadOf)
    p.tokens = tokens
    p.prep = prep
    p.s = s
    p.P = { ...P, leadBase: L2.leadOf(p.blocks, s, P), trackStart: P.trackStart ?? cjkAdvance() }
    // (fillBySize, P.fillSize, off by default: where the leading rule gave up a step (0.05) or more of the script's
    // leading on a loose original, the paragraph is filled by its text's size instead, up to P.fillSize × the
    // original's; a solid-set original keeps the script's leading, and its units are never grown)
    if (P.fillSize > 1 && p.P.leadBase <= P.leadBase - 0.05 + 1e-9) p.P.growTo = P.fillSize
    p.layout = L2.layoutUnit2(tokens, p.blocks, s, p.P, to)
    // (step 3: never drawn in part: given more room where the page has it, else left the original's, whole)
    if (p.layout.clipped) {
      const further = fitFurther(p, tokens, s)
      if (further) { p.layout = further.layout; p.blocks = further.blocks }
      else { p.refused = true; return }
    }
    const t4 = performance.now()
    p.layout.extents = new Map([...prep.extents].map(([r, e]) => [r.join(), e]))
    if (p.blocks[0] && (prep.label || prep.firstX0 !== undefined || inkBefore !== undefined)) {
      const r0 = p.blocks[0].rects[0], ext = p.layout.extents.get(r0.join()) ?? r0.slice(1)
      // (an extent of several boxes, the file's: its first)
      const multi = Array.isArray(ext[0]), e = multi ? ext[0] : ext
      if (e) {
        let x0 = prep.firstX0 !== undefined ? Math.min(e[0], prep.firstX0 - 0.2) : e[0]
        // from right after the ink before it (a label), but never more than 2 pt before the line's own first word
        if (inkBefore !== undefined) x0 = Math.min(x0, Math.max(inkBefore + 0.5, (prep.firstX0 ?? e[0]) - 2))
        if (prep.label) x0 = Math.max(x0, prep.label.x1 + 0.6)
        p.layout.extents.set(r0.join(), multi ? [[x0, e[1], e[2], e[3]], ...ext.slice(1)] : [x0, e[1], e[2], e[3]])
      }
    }
    const lines = p.layout.lines.map(l => {
      const b = p.blocks[l.block]
      return [l.page, r1(l.baseline), l.target !== null ? r1(b.B[l.target]) : null, l.target !== null ? b.exact[l.target] : false, l.mode, r1(Math.max(0, l.used - l.cap - (l.items.at(-1)?.t.punct === 'close' ? 0.5 * p.layout.f : 0))), r1(l.x0), r1(l.x0 + l.used)]
    })
    const drawnTok = new Set(p.layout.lines.flatMap(l => l.items.map(it => it.t)))
    const tr = tokens.filter(t => t.s && !t.ph && !t.sup)
    record(p, { ...(tex ? { source: p.tex ? 'tex' : 'v0' } : {}), grown: p.grown, dropped: p.dropped, s, f: p.layout.f, fitScale: p.layout.scale, knob: p.layout.knob, clipped: p.layout.clipped, lostChars: p.layout.lostChars, chars: p.layout.chars, lead: p.layout.state.lead, track: p.layout.state.track || p.layout.state.trackLatin, compress: p.layout.state.compress, borrow: p.layout.state.borrow, free: r1(Math.max(0, ...p.blocks.map(b => b.free))), tried: p.layout.tried, lines, orig, drawnRuns: L2.drawnRuns(tokens), drawnBase: styleKey(tokens.base), trChars: tr.reduce((a, t) => a + [...t.s].length, 0), trDrawn: p.layout.lines.reduce((a, l) => a + l.items.reduce((b, it) => b + (it.t.s && !it.t.ph && !it.t.sup ? [...it.t.s].length - (it.t.hyphenated ? 1 : 0) : 0), 0), 0), modes: modesOf(prep), unused: drawnTok.size, ms: [r1(t1 - t0), r1(t2 - t1), r1(t3 - t2), r1(t4 - t3)], tokens: tokens.length })
  }
  function record(p, x) {
    const match = x.orig !== undefined ? L2.styleMatch(x.orig, x.drawnRuns, x.drawnBase) : undefined
    // the record is the unit's at once: the page's even pass may run in the same task and update it
    p.rec = { id: p.id, kind: p.unit.kind, v: 2, pages: p.pages, cut: p.cut, ...x, sizeRatio: x.s ? r1(x.f / x.s) : undefined, s: x.s ? r1(x.s) : undefined, f: x.f ? r1(x.f) : undefined, orig: x.orig ? { key: x.orig.key, size: r1(x.orig.size), runs: x.orig.runs.length } : x.orig, match, drawnRuns: undefined, drawnBase: x.drawnBase }
    stats.push(p.rec)
  }

  // even=1: a page's body units laid out first, then all set at the smallest size any of them needs, then painted; a
  // unit on two pages is set by its first page's pass and counts as fixed on the next; even=2 sets the leading alike as
  // well (the smallest any body unit of the page took)
  const laid = Array.from({ length: N + 1 }, () => [])
  const evenPass = pg => {
    const body = laid[pg].filter(p => EVEN_KINDS.has(p.unit.kind) && !p.refused)
    const target = Math.min(1, ...body.map(p => p.layout.scale))
    const leadTo = P.even >= 2 ? Math.min(P.leadBase, ...body.map(p => p.layout.state.lead)) : P.leadBase
    for (const p of body) {
      if (p.pages[0] !== pg) continue
      if (p.layout.scale <= target + 1e-9 && p.layout.state.lead <= leadTo + 1e-9) continue
      const keep = { extents: p.layout.extents, rec: p.rec }
      const PU = p.P ?? P
      p.layout = L2.layoutUnit2(p.tokens, p.blocks, p.s, { ...PU, maxScale: target, leadBase: Math.min(PU.leadBase, leadTo) }, to)
      p.layout.extents = keep.extents
      if (p.rec) Object.assign(p.rec, { f: r1(p.layout.f), sizeRatio: r1(p.layout.f / p.s), fitScale: p.layout.scale, knob: p.layout.knob, lead: p.layout.state.lead, lines: p.layout.lines.map(l => [l.page, r1(l.baseline), l.target !== null ? r1(p.blocks[l.block].B[l.target]) : null, l.target !== null ? p.blocks[l.block].exact[l.target] : false, l.mode, 0]) })
    }
  }
  const ms = new Map()
  const arrive = p => {
    const t0 = performance.now()
    layout2(p)
    // (a unit no step fits is the original's: neither erased nor drawn, nor checked)
    if (p.refused) skipped.push({ id: p.id, kind: p.unit.kind, why: 'unfit', chars: trCharsOf(p.unit), pages: p.pages })
    if (P.even) {
      for (const pg of p.pages) {
        laid[pg].push(p)
        if (laid[pg].length === expected[pg]) {
          evenPass(pg)
          for (const u of laid[pg]) if (!u.refused) paint(u, pg)
        }
      }
    } else if (!p.refused) for (const pg of p.pages) paint(p, pg)
    ms.set(p.id, performance.now() - t0)
  }

  // a page drawn: its characters read, its copy made and its ink mapped; the paper's designs from the first
  const drawPage = async i => {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale })
    views[i - 1] = viewport
    const r = rows[i - 1]
    r.left.width = Math.floor(viewport.width * dpr)
    r.left.height = Math.floor(viewport.height * dpr)
    if (r.right) { r.right.width = r.left.width; r.right.height = r.left.height }
    r.view = page.view
    const textP = page.getTextContent()
    await page.render({ canvas: r.left, canvasContext: r.left.getContext('2d'), viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise
    const tc = await textP
    if (i === 1 && lmP) await lmP
    const fontOf = fontOfPage(page, tc.styles)
    // the role table's faces of the page's fonts, before its characters are measured in them
    if (roles) await loadRoleFaces([...new Set(tc.items.map(it => it.fontName))].map(fontOf).filter(st => st?.known).flatMap(st => roleIdsOf(st, 'latin')), faceUrl)
    chars2[i - 1] = L2.pageChars2(tc, fontOf)
    for (const c of chars2[i - 1]) if (c.st.fam !== 'math') { const key = `${c.st.fam}:${c.st.design}`; fontTally.set(key, (fontTally.get(key) ?? 0) + 1) }
    r.right?.getContext('2d').drawImage(r.left, 0, 0)
    r.base = true
    if (P.borrow) inkOf(i)
    if (i === 1) {
      // the paper's designs from its first page: the serif with most characters, and its sans and mono
      const pick = fam => [...fontTally].filter(([k]) => k.startsWith(`${fam}:`)).sort((a, b) => b[1] - a[1])[0]?.[0].split(':')[1]
      const serif = pick('serif') ?? 'times'
      designs = { serif, sans: pick('sans') ?? (serif === 'cm' ? 'cmss' : 'helvetica'), mono: pick('mono') ?? (serif === 'cm' ? 'cmtt' : 'courier') }
      if (roles) {
        // the paper's family from the first page's fonts, weighted by their characters; then the target's CJK faces and
        // the designs' Latin faces, and each measured once
        const weight = new Map()
        for (const c of chars2[0]) if (c.st?.name) weight.set(c.st.name, (weight.get(c.st.name) ?? 0) + 1)
        setRoleFaces(to, familyOfFonts([...weight.keys()], [...weight.values()]))
        const st = fam => ({ fam, design: designs[fam], caps: false })
        await loadRoleFaces([...roleIdsOf(st('serif'), 'cjk'), ...roleIdsOf(st('serif'), 'latin'), ...roleIdsOf(st('sans'), 'latin'), ...roleIdsOf(st('mono'), 'latin')], faceUrl)
        await hyphP
        await L2.warmFaces(to, designs, yieldNow)
      } else {
        await loadWebFaces([designs.serif, designs.sans, designs.mono], fontUrl)
        await hyphP
        await warmP
      }
    }
  }

  // each page's units, in the order of the page whose drawing lays them (a recorded order, where given, within it), and
  // the page after whose units a page is done: the last that lays a unit with lines on it
  const byId = new Map(placed.map(p => [p.id, p]))
  const rank = orderIn ? new Map(orderIn.map((id, i) => [id, i])) : null
  const groups = new Map(layGroups(placed, batch).map(([pg, ids]) => [pg, rank ? ids.slice().sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity)) : ids]))
  const groupOf = new Map()
  for (const [pg, ids] of groups) for (const id of ids) groupOf.set(id, pg)
  const doneAt = Array.from({ length: N + 1 }, (_, pg) => pg)
  for (const p of placed) for (const pg of p.pages) doneAt[pg] = Math.max(doneAt[pg], groupOf.get(p.id) ?? pg)
  const order = [], pageMs = []
  let drawnTo = 0, busy = Promise.resolve()
  const colsOf = pg => {
    // the page's columns: its paragraphs' lines' left and right edges, clustered
    const list = (cols[pg] ?? []).slice().sort((a, b) => a[0] - b[0])
    const out = []
    for (const [a, z] of list) {
      const c = out.find(c => a < c[1] - 20 && z > c[0] + 20)
      if (c) { c[0] = Math.min(c[0], a); c[1] = Math.max(c[1], z) }
      else out.push([a, z])
    }
    return out
  }
  const cellRects = pg => geometry.left.units.filter(([id]) => geometry.kinds[id] === 'cell').flatMap(([, , rs]) => rs.filter(r => r[0] === pg))
  const toPdf = (pg, x, y) => views[pg - 1].convertToPdfPoint(x / dpr, y / dpr)
  // a page as PDF.js draws it at k device pixels a PDF unit: drawCopy's source of another page's crop
  const renderAt = async (pg, k) => {
    const page = await doc.getPage(pg)
    const viewport = page.getViewport({ scale: k })
    const c = document.createElement('canvas')
    c.width = Math.ceil(viewport.width)
    c.height = Math.ceil(viewport.height)
    await page.render({ canvas: c, canvasContext: c.getContext('2d'), viewport }).promise
    return c
  }
  const needsCopy = () => { if (!copy) throw new Error("v0's checker reads its copy at its own resolution: open with copy: true") }

  return {
    N, P, rows, placed, skipped, stats, audit, order, ms, pageMs, chars: chars2, views, sources,
    get designs() { return designs },
    /** the page after whose units page `pg` is done */
    doneAt: pg => doneAt[pg],
    /** every page up to the one that finishes page `p` drawn, and the units each lays laid and painted */
    until(p) {
      busy = busy.then(async () => {
        const to = Math.min(N, doneAt[Math.min(p, N)] ?? p)
        while (drawnTo < to) {
          const t0 = performance.now()
          drawnTo++
          await drawPage(drawnTo)
          for (const id of groups.get(drawnTo) ?? []) { order.push(id); arrive(byId.get(id)) }
          pageMs[drawnTo] = performance.now() - t0
        }
      })
      return busy
    },
    /**
     * Page `pg`'s copy at a view's own resolution, `k` device pixels a PDF unit (its CSS px a unit × its device pixel
     * ratio × its zoom), once its units are painted (until): onto `ctx`, a canvas of the page at k, the page as PDF.js
     * drew it at k (`source`, left untouched), then the page's drawing (its units' operations in the order v0 painted
     * them) scaled to k, its restores and crops cut from `source` and, for a crop of another page, from that page drawn
     * by PDF.js at k here. At any k and as often as the zoom changes, a page let go too: nothing of v0's own canvases is
     * drawn, so that a table, a figure, a kept line and a crop are as sharp as the original at every zoom.
     */
    async drawCopy(pg, ctx, source, k) {
      const r = rows[pg - 1]
      const others = new Map()
      for (const o of r.ops) if (o.op === 'crop' && o.page !== pg && !others.has(o.page)) others.set(o.page, await renderAt(o.page, k))
      ctx.drawImage(source, 0, 0)
      L2.drawOps(ctx, r.ops, k / (scale * dpr), j => (j === pg ? source : (others.get(j) ?? null)))
      for (const c of others.values()) { c.width = 0; c.height = 0 }
    },
    /** a done page's canvases let go (its SVG and its drawing's operations stay): no unit paints it again */
    release(pg) {
      const r = rows[pg - 1]
      if (!r || drawnTo < doneAt[pg]) return
      for (const c of [r.left, r.right]) if (c) { c.width = 0; c.height = 0 }
      r.base = false
      r.released = true
    },
    /** the prototype's completeness checker on one done page (main.js check=1's, its pixels of that page alone, its
     *  placeholders of the units with lines on it) */
    checkPage(pg) {
      needsCopy()
      const here = placed.filter(p => p.pages.includes(pg) && !p.refused)
      const only = rows.map((r, i) => (i === pg - 1 ? r : { ...r, base: false }))
      return checkAll({ N, placed: here, rows: only, pxOf, toPdf, chars2, audit, cols: colsOf, cellRects })
    },
    /** the prototype's completeness checker over every page still held (main.js check=1's window.__result.check) */
    check() {
      needsCopy()
      return checkAll({ N, placed: placed.filter(p => !p.refused), rows, pxOf, toPdf, chars2, audit, cols: colsOf, cellRects })
    },
  }
}

function modesOf(resolved) {
  const modes = {}
  for (const r of resolved.values()) modes[r.mode] = (modes[r.mode] ?? 0) + 1
  return modes
}
function trCharsOf(u) {
  return u.pieces.reduce((a, p) => a + (p.t === 'text' ? [...p.s.replace(/\s+/g, '')].length : 0), 0)
}

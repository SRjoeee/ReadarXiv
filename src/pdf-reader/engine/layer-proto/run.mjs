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
// - main.js was given every unit at once. Here the units may also arrive as a live run translates them (expect, take,
//   end), and each page is laid exactly as one open over all of them lays it, once every unit it reads has come; a unit
//   is laid a task at a time, a yield between two units' lays, so that no long task holds a page's units.
// - The page's DOM (its rows, the banner, the status line), the timings and long tasks, the scorer's extras (score=1)
//   and the compiled final drawn beside (compare) are the host's or the measurement's, and are left out. The checker's
//   audit of every erase and crop (main.js check=1) is always kept: it is what a gate measures the drawing by.
// - The prototype's host is the caller's: the PDF.js document (opened with PDF_OPTIONS, the prototype's), where the
//   faces and the hyphenation patterns are served (fontUrl, hyphUrl).
// - The faces are the role table's (faces: 'roles', the default since the maintainer's ruling of 2026-10-06; fonts.mjs
//   setRoleFaces), and only they: files we serve, in slices (`faceSources`) or whole (`faceUrl`), never a face the
//   reader's device holds. Each page's characters are measured in their fonts' faces only once the slices that hold them
//   are loaded, and so is each unit's, from the faces its tokens are set in; a unit with a character in no served slice
//   of those faces (and their fallbacks) is left the original's (`served`), as is one whose slice failed to load (`face`).
//   The paper's family is read from its first page's fonts as the engine reads a layout file's (font-roles.mjs
//   familyOfFonts). faces: 'prototype' draws in the prototype's own system faces and Latin Modern, as the approved
//   prototype did (its floor's numbers).
import { checkAll } from './check.mjs'
import { familyOfFonts } from '../font-roles.mjs'
import { bodyFaceId, classifyFont, faceOf, fontString, loadWebFaces, OPEN_FAMILY, roleFaceSet, runsOfTokens, styleKey, setRoleFaces } from './fonts.mjs'
import { loadHyphenation } from './hyph.mjs'
import { blocksOf, median, norm, wordsOf } from './layer1.mjs'
import * as L2 from './layer2.mjs'
import { fileSwap, protection } from './removal.mjs'
import { locatedWhole, texParts, texRects } from './tex.mjs'
import { trPiecesOf } from '../layer/pieces.mjs'
import { BUILTIN_RULES, resolveRules, RULES_SCHEMA } from '../rules/layout.mjs'

/** the prototype's getDocument options beside the host's asset URLs (main.js ASSETS): its canvases on the GPU, the whole
 *  file read at once */
export const PDF_OPTIONS = { cMapPacked: true, enableHWA: true, disableStream: true }
/** the page's body units that the even pass sets alike (a unit on two pages keeps its own fit) */
const EVEN_KINDS = new Set(['para', 'abstract', 'list', 'item'])
/** the SVG's own rules (the prototype's index.html): its text set as laid, in the layer's ink, in the faces it was
 *  measured in and no style made up of a face that has none (a bold or an oblique the family lacks stays regular) */
const SVG_RULES = ['.tl{position:absolute;left:0;top:0;overflow:visible;font-synthesis:none}', '.tl text{white-space:pre;fill:#141414}']
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
 * A unit's layout made final: a CJK cell's lines moved into their bands between the rules over and under them
 * (layer2.mjs cellBands, clearLines) at the size it is drawn at. Every step that lays a unit anew (its fit, the page's
 * even pass, adaptiveFill's) ends here, before the unit is recorded or painted.
 */
export function settleLayout(p) {
  if (p.clear) L2.clearLines(p.layout.lines ?? [], p.clear.bands, p.s * (p.layout.scale ?? 1))
}

/**
 * adaptiveFill (P.adaptiveFill: { band, track, size }; D since 2026-10-07, generalised by D6's F6b on 2026-10-08; null for
 * B): the units that begin on a page (`units`, each laid already: tokens, blocks, s, P, layout), each spread over its
 * original's frame, the page's lines kept to one rhythm. A unit is filled at the state its fit set it at, its leading
 * apart: its fill leading is the loosest, from its fitted leading up to P.fillLead em of the size it is drawn at (null: the
 * original's own pitch), at which that state still sets it whole, so that its text reaches its frame's foot. The page's
 * target is the median of its body units' fill leadings (of all its units' where it has no body unit; a unit of one line
 * has no leading to tell, and tells only where no unit has more), held within `band` of `running`, the target of the last
 * page before it whose body units told it
 * (null: none), so that a page's rhythm moves from the last page's by no more than the band. Each unit takes its fill
 * leading, but never more than `band` over the target, so that neighbouring paragraphs keep one line spacing. A CJK unit
 * the band or its fill leading's top stops short of its fill then takes tracking, up to `track` em; and where every body
 * unit of the page is still short with all of it, the page's body units take one size, the largest up to `size` x the
 * original's at which every one of them is still set whole: one size a page, never a unit's own (D grew each unit apart,
 * and a page mixed 1.0 and 1.1). A unit its fitted state does not set again (the text run past a display) keeps its own
 * fit. Each unit filled is laid anew in place (p.P, p.layout, its extents kept), then `onFilled(p, target)`. Returns the
 * page's target and whether its body units told it (`body`), or null where no unit has a fill leading.
 */
export function fillPage(units, P, running = null, onFilled = () => {}) {
  const { band, track, size } = P.adaptiveFill
  const r3 = x => Math.round(x * 1000) / 1000
  const at = (p, st) => { const l = L2.layoutAt(p.tokens, p.blocks, p.s, p.P, st); return l.clipped ? null : l }
  /** the loosest leading P.fillLead allows a unit at the size it is set at, × its original's pitch */
  const topOf = p => {
    if (P.fillLead === null) return 1
    const pitches = p.blocks.map(b => b.pitch0).filter(v => v > 0).sort((a, b) => a - b)
    const p0 = pitches.length ? pitches[pitches.length >> 1] : 1.2 * p.s
    return r3((P.fillLead * p.s * p.layout.state.scale) / p0)
  }
  // (a looser leading holds no more lines than a closer one: the loosest that sets the unit is found by halving, a few
  // layouts a unit where trying each hundredth from the top took up to forty)
  const fillLeadOf = p => {
    const st = p.layout.state
    if (!at(p, st)) return null
    const lo = st.lead, hi = p.fillTop, L = k => Math.min(hi, r3(lo + k * 0.01))
    let ok = 0, no = Math.round((hi - lo) / 0.01) + 1
    while (no - ok > 1) { const k = (ok + no) >> 1; if (at(p, { ...st, lead: L(k) })) ok = k; else no = k }
    return ok ? L(ok) : lo
  }
  for (const p of units) if (p.fillLead === undefined) { p.fillTop = topOf(p); p.fillLead = fillLeadOf(p) }
  const withLead = units.filter(p => p.fillLead !== null)
  const telling = withLead.filter(p => p.layout.lines.length >= 2)
  const body = telling.filter(p => EVEN_KINDS.has(p.unit.kind))
  const leads = (body.length ? body : telling.length ? telling : withLead).map(p => p.fillLead)
  if (!leads.length) return null
  const own = median(leads)
  const target = r3(running === null ? own : Math.min(running + band, Math.max(running - band, own)))
  const filled = []
  for (const p of units) {
    if (p.fillLead === null) continue
    let st = { ...p.layout.state, lead: Math.min(p.fillLead, r3(target + band)) }
    let l = at(p, st)
    if (!l) continue
    // short of its fill at the band's edge or at its fill leading's top: tracking, the most that still sets it, then the
    // page's size
    const short = p.fillLead > target + band + 1e-9 || p.fillLead >= p.fillTop - 1e-9
    let full = !short
    if (short && P.cjk) {
      let t = 0
      for (let k = Math.round(track / 0.01); k >= 1; k--) {
        const st2 = { ...st, track: r3(st.track + k * 0.01) }
        const l2 = at(p, st2)
        if (l2) { st = st2; l = l2; t = k * 0.01; break }
      }
      full = t < track - 1e-9
    }
    filled.push({ p, st, l, full })
  }
  // the page's one size: every body unit's, where none is full yet
  const grown = filled.filter(f => EVEN_KINDS.has(f.p.unit.kind))
  if (size > 1 && grown.length && grown.every(f => !f.full)) {
    for (let k = Math.round((size - 1) / P.step); k >= 1; k--) {
      const scale = r3(1 + k * P.step)
      const ls = grown.map(f => at(f.p, { ...f.st, scale, knob: 'grow' }))
      if (ls.every(Boolean)) { grown.forEach((f, i) => { f.st = { ...f.st, scale, knob: 'grow' }; f.l = ls[i] }); break }
    }
  }
  for (const { p, st, l } of filled) {
    const keep = p.layout.extents
    p.P = { ...p.P, leadBase: st.lead }
    // (its fit's knob kept, a step past its states among them (widen, below-floor), but the page's size grown)
    if (st.knob !== 'grow') l.knob = p.layout.knob
    p.layout = l
    p.layout.extents = keep
    // (laid anew: its clearance at its new size, before it is recorded or painted; the pass put a cleared CJK cell's
    // first line back on the original's baseline, over its rule, 2026-10-07)
    settleLayout(p)
    onFilled(p, target)
  }
  return { target, body: body.length > 0 }
}

/**
 * What laying a paper's pages reads of its units' rows, by page: the index into the units v0 may place, in the stream's
 * order (`K`: each with `lists`, the pages each of its sources would draw it on, and `reach`, every page their lines are
 * on), up to which every unit must be in and decided. `lay[g]`, to lay the units page g's drawing lays: layGroups'
 * groups up to g (every unit that may be on a page up to g, and so every one before it in the stream, whose batches
 * they are), the page passes' counts of the units on each, and the units only the file holds (`fileOnly`) on the pages
 * their lines read others on (rectsByPage). `done[p]`, to know the page after whose units page p is done (doneAt: the
 * units on p and, with a page pass (`passes`), on each one's first page). `complete[p]`, both, up to the latest page p
 * may be done after.
 */
function needsOf(K, N, passes, fileOnly) {
  const lp = new Array(N + 1).fill(-1), dp = new Array(N + 1).fill(-1), far = Array.from({ length: N + 1 }, (_, p) => p)
  const fileOn = new Map(), on = Array.from({ length: N + 1 }, () => [])
  K.forEach((c, i) => { if (fileOnly(c) && c.lists.length) for (const x of c.reach) fileOn.set(x, i) })
  K.forEach((c, i) => {
    if (!c.lists.length) return
    const pages = [...new Set(c.lists.flat())], last = Math.max(...pages)
    lp[Math.min(...pages)] = i
    let dep = -1
    for (const x of c.reach) dep = Math.max(dep, fileOn.get(x) ?? -1)
    // (its lay reads the file's units on its lines' pages: wanted from the first page whose drawing may lay it)
    const soonest = Math.min(...c.lists.map(l => Math.max(...l)))
    dp[soonest] = Math.max(dp[soonest], dep)
    for (const x of pages) { far[x] = Math.max(far[x], last); on[x].push(c) }
  })
  for (let g = 1; g <= N; g++) { lp[g] = Math.max(lp[g], lp[g - 1]); dp[g] = Math.max(dp[g], dp[g - 1]) }
  const lay = lp.map((v, g) => Math.max(v, dp[g]))
  // doneAt's first part, a page's units' last pages, is at most far; a page pass adds the first page's doneAt, final
  // where it is before the page, its first part where after
  const done = lp.slice(), bound = far.slice()
  if (passes) for (let p = 1; p <= N; p++) {
    done[p] = Math.max(done[p], done[p - 1])
    for (const c of on[p]) for (const l of c.lists) {
      const f = l[0]
      if (f > p) { done[p] = Math.max(done[p], lp[f]); bound[p] = Math.max(bound[p], far[f]) }
      else if (f < p) bound[p] = Math.max(bound[p], bound[f])
    }
  }
  return { lay, done, complete: done.map((d, p) => Math.max(d, lay[Math.min(bound[p], N)])) }
}

/**
 * v0 over a paper's first `pages` pages. `doc`: the original opened by PDF.js (with PDF_OPTIONS); `geometry`: the made
 * output's geometry (schema 1); `units`: its units file's units (each { kind, src, pieces, state }); `target`: the
 * language; `expect`: the ids of the units the run will report that are still to come (take, end), `units` then sparse
 * (a hole a unit not yet arrived), each page laid once every unit it reads has come; null (today's call): every unit is
 * in `units`. `groups`: each unit's table group, known at open (the paper's bundle, groups.mjs groupOf), so that a
 * group is read once its own cells' rows are in; null: once every row is. Options as main.js's query: `scale` (CSS px a
 * PDF unit), `dpr`, `batch`, `phMode` ('auto' or 'source'),
 * `restoring`, `order` (ids whose order a page's units are laid in, in place of layGroups': a recorded run's). `faces`:
 * 'roles' (the role table's) or 'prototype' (the prototype's own).
 * `faceSources(id)`: a promise of the slices the host serves of a role table face, each { url, ranges } (its file on the
 * host's origin and its code points as [start, end] pairs), null where the face is not served, rejected where the host
 * could not say; a face is asked the first time a unit needs it and awaited before the unit is laid. Each slice is one
 * FontFace; a unit whose text has a character in no served slice of its runs' faces and their fallbacks is left the
 * original's, skipped with the why `served`, and one whose slice does not load, `face`. Absent: each face is its whole file at
 * `faceUrl(file)`, covering the face's COVERAGE. The target's body face's first slice is fetched at the open.
 * `faceUrl(file)`, `fontUrl(file)`, `hyphUrl(lang)`: where the host serves the role table's faces (by file name), the
 * prototype's Latin Modern (by name) and TeX's patterns. Nothing is drawn until `until(p)` is awaited.
 * `tex` (the hybrid, tex.mjs): the layout file (`index`, layout/file.mjs indexLayout's), the units file's pieces by unit
 * (`pieces`), and how its geometry is taken (`use`: 'ph', each placeholder's ink alone; 'lines', the unit's lines,
 * label too, its blocks v0's rule's over them; `extents`: 'v0' or 'tex', with 'lines'; `texOnly`: with 'lines', the units the file locates whole
 * that v0's geometry does not hold, but table cells; `symbols`: 'strict' or 'text', locatedWhole's). Each unit the file
 * locates whole takes them; every other unit is v0's own. Null: v0 alone.
 * `copy`: whether each page's copy is kept at v0's own resolution (`right`), the plane the checker and the gate measure;
 * a view draws the page at its own (drawCopy) and needs none.
 * `removal` (the text-removed PDF, removal.mjs and layout/remove.mjs): { mode: 'draw', doc, manifest } (and PDF.js's OPS,
 * which no drawing reads: the gate's instrument reads a page's ink with it):
 * `doc` is arXiv's PDF with the paper's add-on appended (its page sets at the manifest's places), one a paper whatever the
 * target, made from the layout file alone; it may be the `doc` v0 is given, the one document a reader opens (arXiv's own
 * pages the manifest's count). On a page the manifest says is removed, a unit the file locates whole is drawn over the
 * file's own rectangles (removal.mjs fileSwap: its lines' erase rectangles, its inline placeholders' segments, a label it
 * draws in the target's name, less what its reading keeps), filled with paper, or the removed page swapped in where the
 * manifest's `dirty` boxes say kept ink lies under them; its crops are cut from the original through their placeholders'
 * segments (layer2.mjs removalOps). No ink is read and no pixel. A unit v0 reads on its own (the file's miss) is drawn
 * the old way, erased and put back, as on a page the add-on did not remove. Null: v0's own drawing.
 * `labels`: { captions }, which of the two floats, figures and tables, the final names in the target's language (the
 * record's `captions`, live.mjs captionsOf): a float's label is drawn in the target's name for it, which the layout rules
 * give (`rules`), where the final's is (layer2.mjs labelInTarget), else kept as the original's ink. A table's group (each
 * record unit's `group`) is drawn whole or not at all.
 * `rules`: the layout rule set (rules/layout.mjs RuleSet) every choice made for the target is read from, resolved once at
 * the open and fixed for the run: the fit's parameters (leading, tracking, floor, adaptive fill and the rest), how a line
 * breaks, the hyphenation patterns and their minimums, the CJK family, the names of a float. Absent: BUILTIN_RULES. A
 * host passes the set it loaded (readRules); there is no per-field override.
 */
export async function openProto({ doc, geometry, units: given, expect = null, groups: tableGroups = null, target: to, pages = 999, scale = 1.25, dpr = 1, batch = 8, phMode = 'auto', restoring = true, order: orderIn = null, faces = 'roles', faceSources = null, faceUrl = file => `/fonts/${encodeURIComponent(file)}`, fontUrl, hyphUrl = lang => `/hyph/${lang}.json`, tex = null, copy = true, removal = null, labels = null, rules = BUILTIN_RULES }) {
  if (expect !== null && (!Array.isArray(expect) || !expect.every(id => Number.isSafeInteger(id) && id >= 0))) throw new TypeError(`expect: ids of units or null, not ${kindOf(expect)}`)
  if (tableGroups !== null && !(tableGroups instanceof Map)) throw new TypeError(`groups: a Map of ids to groups or null, not ${kindOf(tableGroups)}`)
  if (faceSources !== null && typeof faceSources !== 'function') throw new TypeError(`faceSources: a function or null, not ${kindOf(faceSources)}`)
  // every choice made for the target, in one call: the layout rules' (rules/layout.mjs resolveRules), the built-in set's or
  // the host's: the fit's parameters, the hyphenation patterns, the CJK family, the float labels' names
  const R = resolveRules(rules, to)
  const P = R.params
  // iteration 2's hyphenation, fetched at once (local, small)
  const hyphP = Promise.all(R.patterns.map(async l => L2.setHyphenData(l, await loadHyphenation(l, hyphUrl(l)))))
  // the target's likely faces loaded meanwhile (Times-like until the paper's own designs are known), and Latin Modern at
  // once: the page's characters are measured in their own designs
  const roles = faces === 'roles'
  // (the role table's faces: the paper's family is known from its first page; until then its Latin faces, which no
  // family changes)
  setRoleFaces(roles ? to : null, OPEN_FAMILY, R.cjkFaces)
  const warmP = roles ? null : L2.warmFaces(to, P.cjk, { serif: 'times' }, yieldNow)
  const lmP = roles ? null : loadWebFaces(['cm', 'cmss', 'cmtt'], fontUrl)
  // the role table's faces as the host serves them, each asked when a page or a unit first needs it and loaded for the
  // text it is measured and drawn with; the target's body face's first slice is fetched now, to overlap the host's other
  // fetches
  const FS = roles ? roleFaceSet({ faceSources, faceUrl }) : null
  FS?.warm(bodyFaceId())
  // (arXiv's own pages: `doc` may be the paper with its add-on appended, one document a reader opens, whose sets follow
  // them: the manifest's count)
  const N = Math.min(removal?.manifest?.pages ?? doc.numPages, doc.numPages, pages)

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

  // the geometry's units with v0's own copy of their line rectangles: v0 grows and moves a unit's lines as it lays it,
  // and every other unit reads them as grown (its others), so the copy is shared by all of v0's reading; the geometry
  // given stays as it was (a second run over it draws as the first: the text removal's plan run and its drawing)
  const GU = geometry.left.units.map(([id, stream, rects]) => [id, stream, rects.map(r => r.slice())])
  const placed = [], skipped = []
  const inGeometry = new Set(GU.map(u => u[0]))
  // the units as they have come (take), by id: none for one not yet arrived, or never to come; and the ids still
  // awaited (expect's, but those given at once)
  const U = new Map()
  given.forEach((u, id) => U.set(id, u))
  const awaited = new Set(expect ?? [])
  const pending = new Set([...awaited].filter(id => U.get(id) === undefined))
  // each unit's table group as the paper's own bundle gives it (groups.mjs groupOf), where the host knows it: a group is
  // then read once its own cells' rows are in, not every row
  const membersOf = new Map()
  if (tableGroups) for (const [id, g] of tableGroups) (membersOf.get(g) ?? membersOf.set(g, []).get(g)).push(id)
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
  const translated = u => !!u?.pieces && (u.state === 'whole' || u.state === 'partial')
  const unanchoredOf = (id, u) => ({ id, kind: u.kind, why: 'unanchored', chars: trCharsOf(u) })
  // every unit v0 may place, in the order layGroups takes them (the text's stream): the geometry's, and, with texOnly,
  // the units the file locates whole that v0's geometry does not hold, at their place in the stream after the unit
  // before them, table cells among them (a cell's lines are TeX's, and the text removal takes its glyphs alone, never
  // its table's rules). `cands` in the order the hybrid reports its sources in, K in the stream's
  const cands = GU.map(([id, stream, rects]) => ({ id, stream, rects }))
  if (tex?.texOnly && tex.use === 'lines') {
    const streamOf = new Map(GU.map(([id, stream]) => [id, stream]))
    for (const id of tex.index.file.units.map(r => r[0])) {
      if (inGeometry.has(id)) continue
      let before = -1
      for (const [gid, s] of streamOf) if (gid < id && s > before) before = s
      cands.push({ id, stream: before + 0.5, rects: null })
    }
  }
  const K = cands.slice().sort((a, b) => a.stream - b.stream)
  const candOf = new Map(K.map(c => [c.id, c]))
  // the pages each of a unit's sources would draw it on (which source is its row's to decide) and every page their
  // lines are on: what laying a page waits for (needsOf)
  const shownOf = rects => [...new Set(rects.filter(r => r[0] <= N).map(r => r[0]))]
  for (const c of K) {
    const lu = tex?.use === 'lines' ? tex.index.unit(c.id) : null
    const from = [c.rects, lu ? texRects(lu).rects : null].filter(Boolean)
    c.lists = from.map(shownOf).filter(l => l.length)
    c.reach = new Set(from.flatMap(rs => rs.map(r => r[0])))
  }
  /** whether a translated row holds what v0 reads of a unit, of the types it reads them as: its kind and source, and
   *  pieces, each a text with its string or a placeholder, an open, a close or a nested footnote with its source's */
  const shapely = u => typeof u.kind === 'string' && typeof u.src === 'string' && Array.isArray(u.pieces) && u.pieces.every(q => q !== null && typeof q === 'object' && (q.t === 'text' ? typeof q.s === 'string' : q.t === 'ph' || q.t === 'open' ? typeof q.src === 'string' : (q.t === 'close' || q.t === 'nested') && (q.src === undefined || typeof q.src === 'string')))
  /** why a translated row is no unit of this paper's, though it parses (the web's rows: parseAnswersDelta), or null: not a
   *  unit's shape; its kind not the one the layout file or the geometry gives its id; its table group not the one the
   *  open was given (`groups`); a piece's k not one of its source's pieces (the layout file's count). Its unit is left
   *  the original's, the rest of the paper drawn as ever; a cell's group is the original's with it (a translated cell
   *  that cannot be drawn: readGroup) */
  const refusalOf = (id, u) => {
    if (!shapely(u)) return "row: not a unit's shape"
    const lu = tex ? tex.index.unit(id) : null, kind = geometry.kinds?.[id]
    if ((lu && u.kind !== lu.kind) || (kind !== undefined && u.kind !== kind)) return 'row: another kind'
    if (tableGroups && (u.group ?? null) !== (tableGroups.get(id) ?? null)) return 'row: another group'
    if (lu && u.pieces.some(q => q.t !== 'text' && q.k !== undefined && !(Number.isInteger(q.k) && q.k >= 0 && q.k < lu.pieces))) return "row: a k not its source's"
    return null
  }
  const refusedOf = (id, u, why) => ({ id, kind: u.kind, why, chars: shapely(u) ? trCharsOf(u) : 0 })
  /**
   * What v0 makes of a unit once its row is in, before its table's group is read: placed (with the pages it is drawn
   * on and which source its geometry is), or not, and why it is left (`skip`); the hybrid's why a unit placed is v0's
   * (`why`), or the file's why it does not locate one only it holds (`missed`)
   */
  const decide = (c, u) => {
    if (!translated(u)) return { p: null }
    const no = refusalOf(c.id, u)
    if (no) return { p: null, skip: refusedOf(c.id, u, no) }
    if (c.rects) {
      if (u.kind === 'author') return { p: null, skip: { id: c.id, kind: u.kind, why: 'author', chars: trCharsOf(u), pages: [...new Set(c.rects.map(r => r[0]))] } }
      const w = judge(c.id, u)
      let p = null
      if (w?.lu && tex.use === 'lines') {
        // the file's lines, frames and label in place of the anchors' rectangles (v0's where the file's lie past the
        // pages shown and the anchors' do not)
        p = placeByFile(c.id, c.stream, u, w)
        if (!p && (p = placeOf(c.id, c.stream, c.rects, u, null))) w.why = 'pages'
      } else p = placeOf(c.id, c.stream, c.rects, u, w?.lu ? w : null)
      return { p, why: p && tex && !p.tex ? w.why : null }
    }
    // (the file's alone: a unit it does not locate whole is left unanchored, as v0's geometry does not hold it)
    if (u.kind === 'author') return { p: null, skip: unanchoredOf(c.id, u) }
    const w = judge(c.id, u)
    if (!w.lu) return { p: null, skip: unanchoredOf(c.id, u), missed: `unanchored, ${w.why}` }
    const p = placeByFile(c.id, c.stream, u, w)
    return { p, skip: p ? null : unanchoredOf(c.id, u) }
  }
  // (each decision kept with the row it was made of: a row taken again before it is fixed is decided again)
  const decisions = new Map()
  const decisionOf = c => {
    const u = U.get(c.id)
    let e = decisions.get(c.id)
    if (!e || e.row !== u) decisions.set(c.id, (e = { row: u, d: decide(c, u) }))
    return e.d
  }
  // a table's consistency group drawn whole or not at all (the table-groups brief, 2026-10-07): the record translates
  // or keeps each group whole (its cells' `group`, cache.mjs unitsOf), and a translated cell that cannot be drawn here —
  // no lines for it, none on the pages shown, a row refused (refusalOf) — keeps every cell of its group the original's.
  // A group's cells may be anywhere in the paper: it is read once its own cells' rows are in where the open is given each
  // unit's group (`groups`), else once every row is (or end()), every row fixed then; the rows it reads are fixed from
  // then on. Given each unit's group, a group's cells are the units given it whose rows are translated, whatever group
  // a row names, and one given it and expected whose row never came (end()) keeps the group the original's as well: it
  // was to be translated with the rest (ruling P28); one not expected (kept as a name: rows.mjs toTranslate) never has a
  // row, and is the original's in a group drawn
  const groupCells = new Map(), split = new Set(), read = new Set()
  let frozenAll = false
  /** group g read from the rows of `ids` (its own cells: the units the open gave it, else the rows naming it) */
  const readGroup = (g, ids) => {
    read.add(g)
    for (const id of ids) fixed.add(id)
    const cells = ids.filter(id => translated(U.get(id)))
    if (!cells.length) return
    groupCells.set(g, cells)
    if ((tableGroups && ids.some(id => awaited.has(id) && U.get(id) === undefined)) || cells.some(id => !(candOf.has(id) && decisionOf(candOf.get(id)).p))) split.add(g)
  }
  const freezeAll = () => {
    if (frozenAll) return
    frozenAll = true
    if (tableGroups) { for (const [g, ids] of membersOf) if (!read.has(g)) readGroup(g, ids); return }
    const unread = new Map()
    U.forEach((u, id) => { if (u?.group && translated(u) && !read.has(u.group)) (unread.get(u.group) ?? unread.set(u.group, []).get(u.group)).push(id) })
    for (const [g, ids] of unread) readGroup(g, ids)
  }
  // the lowest unit line of each page: no unit borrows below it (the page's text area)
  for (const [, , rects] of GU) for (const r of rects) pageBottom[r[0]] = Math.min(pageBottom[r[0]] ?? Infinity, r[2] + 0.24 * (r[4] - r[2]))
  const expected = Array.from({ length: N + 1 }, () => 0)
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
  // ---- the text-removed PDF (one add-on a paper, made from the layout file: removal.mjs pagePlan). Nothing of the page's
  // ink is read here: a unit's swap is the layout file's own rectangles (its lines' erase, its placeholders' segments,
  // its label), filled with paper where the manifest says nothing kept lies under them, else the removed page swapped in
  const RM = removal ? {
    mode: removal.mode, manifest: removal.manifest ?? null, removed: [], others: [],
    stats: { pages: 0, refused: 0, units: 0, tex: 0, v0: 0, fills: 0, swaps: 0, swapPages: 0, extra: 0, byPage: {}, ms: { render: 0, rects: 0 } },
  } : null
  /** whether page j's text is removed in the add-on (draw mode) */
  const removedPage = j => RM?.mode === 'draw' && !!RM.manifest?.page?.[j]?.ok
  /** page j's page in a set of the add-on: where its manifest entry names it (a compact add-on, which holds the pages it
   *  removes alone), else at the set's fixed place */
  const setPage = (name, j) => RM?.manifest?.page?.[j]?.at?.[name] ?? (RM?.manifest?.sets?.[name] ?? 0) + j
  /** the kept ink under the paper's units' rectangles on page j, by the manifest (x0, y0, x1, y1 each): where a fill would
   *  take it, the removed page is swapped in instead */
  const dirtyOf = j => { const d = RM.manifest.page[j]?.dirty ?? []; const out = []; for (let q = 0; q + 3 < d.length; q += 4) out.push([d[q], d[q + 1], d[q + 2], d[q + 3]]); return out }
  /** what a unit's fill on a page keeps clear of (removal.mjs protection): every other unit's rectangles until it is
   *  drawn there, then those it keeps */
  const guard = RM && tex ? protection(tex.index) : null
  /**
   * A unit's drawing over the text-removed PDF on page pg, from the layout file's rectangles (removal.mjs fileSwap): the
   * rectangles (v0's device pixels) the removed page is swapped into where kept ink lies under them, those filled with
   * paper elsewhere, its crops' clips (its placeholders' segments), and the characters its reading accounts for that the
   * file gives it no rectangle for (erased over their boxes)
   */
  const swapOf = (p, pg) => {
    const t = performance.now()
    const sw = fileSwap({ page: pg, lu: p.tex.lu, kOf: p.tex.kOf, lines: p.tex.lines, prep: p.prep, others: guard.others(pg, p.id), dirty: dirtyOf(pg) })
    // (drawn there from now: what it replaces no longer kept clear of, what it keeps still)
    guard.accept(p.id, pg, sw.kept)
    const px = pxOf(pg)
    const dev = b => { const [ax, ay] = px(b[0], b[3]), [bx, by] = px(b[2], b[1]); return [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)] }
    const clips = new Map([...sw.clips].map(([k, c]) => [k, { rects: c.rects.map(dev), own: c.own.map(dev) }]))
    RM.stats.ms.rects += performance.now() - t
    RM.stats.fills += sw.fill.length
    RM.stats.swaps += sw.swap.length
    RM.stats.extra += sw.extra.length
    return { rects: sw.swap.map(dev), erase: [...sw.fill, ...sw.extra].map(dev), clips, lines: sw.lines }
  }
  const sourceOn = (j, plane) => {
    const r = rows[j - 1]
    if (!r?.base) return null
    return plane === 'R' ? RM?.removed[j] ?? null : r.left
  }
  const paint = (p, pg) => {
    const tOps = performance.now()
    const r = rows[pg - 1]
    // (what the unit accounts for is counted whichever way it is drawn: a unit drawn the old way after it puts back only
    // what no painted unit accounts for)
    const ro = restoreOf(p, pg)
    let ops = null
    // the text-removed PDF, on a page the add-on removed: a unit the layout file locates whole is drawn over the file's own
    // rectangles (filled with paper, or the removed page swapped in where kept ink lies under them), its crops cut from
    // the original through its placeholders' segments; a unit v0 reads on its own (the file's miss) is drawn the old way,
    // erased and put back. No output needs a plan of its own: the add-on is the paper's
    if (RM?.mode === 'draw' && removedPage(pg)) {
      const here = (RM.stats.byPage[pg] ??= { units: 0, tex: 0, v0: 0 })
      RM.stats.units++
      here.units++
      if (p.tex && p.prep) {
        const sw = swapOf(p, pg)
        ops = L2.removalOps(p.layout, pg, { px: pxOf(pg), k: scale * dpr, hasSource: j => !!rows[j - 1]?.base, pxOf, rects: sw.rects, erase: sw.erase, clips: sw.clips, lines: sw.lines, removed: removedPage, audit, id: p.id })
        RM.stats.tex++
        here.tex++
      } else { RM.stats.v0++; here.v0++ }
    }
    // else the unit's drawing as data, and on v0's own copy where it is kept: from the pages drawn now, as v0 drew it
    if (!ops) ops = L2.unitOps(p.layout, p.blocks, pg, { px: pxOf(pg), k: scale * dpr, hasSource: j => !!rows[j - 1]?.base, pxOf, extents: p.layout.extents, audit, id: p.id, restore: ro })
    for (const o of ops) r.ops.push(o)
    const tCompose = performance.now()
    if (r.right) L2.drawOps(r.right.getContext('2d'), ops, 1, sourceOn)
    const tSvg = performance.now()
    r.svg.insertAdjacentHTML('beforeend', L2.svgOfUnit(p.layout, pg, cssOf(pg), scale, p.id))
    const T = timesOf(pg)
    T.ops += tCompose - tOps
    T.compose += tSvg - tCompose
    T.svg += performance.now() - tSvg
  }

  // the columns of each page, as its paragraphs' lines span them: a line centred in its column (a caption under its
  // figure, a title over the text) is set centred, whatever the page's own middle
  const cols = []
  for (const [id, , rects] of GU) if (geometry.kinds[id] === 'para') for (const r of rects) (cols[r[0]] ??= []).push([r[1], r[3]])
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
  // the units the hybrid draws that v0's geometry does not hold, as each is placed)
  const rectsByPage = new Map()
  const addRects = (id, rects) => { for (const r of rects) { if (!rectsByPage.has(r[0])) rectsByPage.set(r[0], []); rectsByPage.get(r[0]).push([id, r]) } }
  for (const [id, , rects] of GU) addRects(id, rects)
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
  /** a CJK table cell's bands between the rules near its lines (layer2.mjs cellBands: the manifest's rules), or null; a
   *  script no taller than Latin is not held, nor a paragraph, whose lines stand by a rule only by chance */
  const clearanceOf = (p, s) => (P.cjk && p.unit.kind === 'cell' ? L2.cellBands(p.blocks, pg => RM?.manifest?.page?.[pg]?.rules, s, P) : null)
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
   * How far a single line's slot may run on to one side (`dir` -1 or 1) of `from`, on its band of the original page (its
   * core, the x-height, for ink), over paper only: up to the first ink that is not the unit's own (`own`, its lines' erase extents: erased with it), read on
   * the page's ink map, never past `limit`. Before another line's text (a neighbouring cell, whose translation may run on
   * towards it too) to half the paper between them; before any other ink (a rule, a figure) to a quarter of an em clear of
   * it. Returns the edge.
   */
  const paperTo = (b, dir, from, limit, own) => {
    const map = inkOf(b.page)
    if (!map) return from
    const px = pxOf(b.page), f = map.factor, z = b.sizes[0], B = b.B[0]
    const top = B + 0.8 * z, bottom = B - 0.25 * z
    // (the ink looked for is on the line's core, its x-height: a table's rule above or below the line, which the map
    // holds (inkMapOf, averaged), runs along it and stands beside nothing; a column rule or a neighbour's text crosses it)
    const [, r0] = px(from, B + 0.55 * z), [, r1] = px(from, B + 0.1 * z)
    const ra = Math.max(0, Math.floor(Math.min(r0, r1) / f)), rb = Math.min(map.h - 1, Math.floor(Math.max(r0, r1) / f))
    const step = f / (scale * dpr)
    // (its own ink, a map cell around: the map holds a cell any of whose pixels is inked, so a glyph's ink reaches up to a
    // cell past its outline's box, which the file's rectangles are)
    const ownAt = x => own.some(e => x >= e[0] - 0.3 - step && x <= e[2] + 0.3 + step && e[1] < top && e[3] > bottom)
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
  /** what a unit's drawing takes away on page j, where its own ink may be run over: over the text-removed PDF, the layout
   *  file's rectangles a unit it locates whole replaces (its lines' erase rectangles, its inline placeholders'
   *  segments), all that it removes; drawn the old way, its lines' erase extents. A rule beside its text that an erase
   *  extent reaches (a table's column rule) stays on the removed page, and a slot run over it is drawn over it */
  const ownInk = (p, j) => {
    if (p.tex && removedPage(j)) {
      const lu = p.tex.lu, out = []
      for (let l = 0; l < lu.erase.length; l++) { const e = lu.erase[l]; if (!e || lu.lines[8 * l] !== j) continue; for (let o = 0; o + 3 < e.length; o += 4) out.push([e[o], e[o + 1], e[o + 2], e[o + 3]]) }
      for (const row of lu.ph.values()) { if (row.kind === 'display') continue; for (let o = 0; o + 5 < row.segs.length; o += 6) if (row.segs[o] === j) out.push([row.segs[o + 1], row.segs[o + 5], row.segs[o + 3], row.segs[o + 4]]) }
      return out
    }
    return [...(p.prep.extents ?? new Map())].filter(([r]) => r[0] === j).flatMap(([, e]) => (Array.isArray(e[0]) ? e : [e]))
  }
  /** a unit's single-line blocks widened over the paper beside them (paperTo), within the page's text area; a centred one
   *  as far to either side. Returns the widened blocks, or null where none grew */
  const widenOverPaper = p => {
    let grew = false
    const out = p.blocks.map(b => {
      if (b.rects.length !== 1 || b.page > N) return b
      const own = ownInk(p, b.page)
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
   * P.floorMin. Returns the first layout that sets every token, with the blocks it was laid in (widened: with their
   * bands between the rules, `clear`, and the parameters they hold it to, `P`), or null.
   */
  const fitFurther = (p, tokens, s) => {
    for (const step of P.further ?? []) {
      if (step === 'widen') {
        const wide = widenOverPaper(p)
        if (!wide) continue
        // (its bands again, over its widened lines: a rule over the part a line is widened onto holds it too)
        const clear = clearanceOf({ ...p, blocks: wide }, s)
        const { capScale: _, ...rest } = p.P
        const PW = clear && clear.cap < 1 ? { ...rest, capScale: clear.cap } : rest
        const l = L2.layoutUnit2(tokens, wide, s, PW)
        if (!l.clipped) return { layout: { ...l, knob: 'widen' }, blocks: wide, P: PW, clear }
      } else if (step === 'shrink' && P.floorMin < P.floor - 1e-9) {
        const l = L2.layoutUnit2(tokens, p.blocks, s, { ...p.P, floor: P.floorMin })
        if (!l.clipped) return { layout: { ...l, knob: 'below-floor' }, blocks: p.blocks }
      } else if (step === 'flow') {
        const l = L2.layoutUnit2(tokens, p.blocks, s, { ...p.P, flowPast: true })
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
  /** a laid unit's lines as its record holds them: page, baseline, target baseline, exact, mode, overflow, x0, x1 */
  const recLinesOf = p => p.layout.lines.map(l => {
    const b = p.blocks[l.block]
    return [l.page, r1(l.baseline), l.target !== null ? r1(b.B[l.target]) : null, l.target !== null ? b.exact[l.target] : false, l.mode, r1(Math.max(0, l.used - l.cap - (l.items.at(-1)?.t.punct === 'close' ? 0.5 * p.layout.f : 0))), r1(l.x0), r1(l.x0 + l.used)]
  })
  // (the time the font waits of the unit in hand took, so that its timings are its own work's: lap())
  let fontWait = 0
  const lap = () => performance.now() - fontWait
  const layout2 = async p => {
    const t0 = lap()
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
    // a float's label in the target's name where the final names it so (labelInTarget): its ink erased and accounted as
    // the unit's text, and set as the line's start, in its own style, before the translation
    const relabel = labels ? L2.labelInTarget(prep.label, R.labels, labels.captions, to) : null
    if (relabel) {
      prep.label = { ...prep.label, drawn: relabel }
      for (const c of prep.label.chars) prep.cat?.set(L2.charKey(c), 'acc')
      // (a file's first line starts at the unit's own mark, after the label the class set before it: the line the label
      // is now part of starts where the label does)
      const r0 = p.rects[0], lx0 = Math.min(...prep.label.chars.map(c => c.x0))
      if (r0 && Number.isFinite(lx0) && lx0 < r0[1] - 0.5 && prep.label.chars.every(c => c.page === r0[0])) p.rects[0] = [r0[0], lx0, r0[2], r0[3], r0[4]]
    }
    // iteration 3: each crop over the ink it touches (its page's ink map)
    for (const r of prep.values()) {
      if (r?.mode !== 'crop') continue
      L2.growCrop(r, inkOf(r.page), pxOf(r.page), scale * dpr, local[r.page - 1] ?? chars2[r.page - 1])
    }
    const t1 = lap()
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
    if (prep.label && !prep.label.drawn && p.blocks[0]) {
      const b = p.blocks[0]
      if (!fileLines) b.indent = Math.max(b.indent, prep.label.x1 + 0.25 * s - b.x0)
      else if (prep.label.x1 > p.rects[0][1] + 0.1) b.indent = Math.max(b.indent, (prep.firstX0 !== undefined && prep.firstX0 > prep.label.x1 ? prep.firstX0 : prep.label.x1 + 0.25 * s) - b.x0)
    }
    if (P.borrow && p.unit.kind !== 'cell') for (const b of p.blocks) b.freeOf = () => freeFor(b, s)
    const t2 = lap()
    // (the label's own style: a class's bold or italic label)
    const lead = prep.label?.drawn ? { text: prep.label.drawn, st: (st => (st && st.fam !== 'math' ? { bold: !!st.bold, italic: !!st.italic } : {}))(prep.label.chars[0]?.st) } : null
    // the faces the unit's runs are set in, served and loaded before a width is taken in any of them (one taken before its
    // slice is there would stay in the cache): the tokens read once with no measure, their faces and texts checked; a
    // unit with a character no served slice holds, or a slice that does not load, stays the original's
    if (FS) {
      const tFonts = performance.now()
      const no = await FS.check(runsOfTokens(L2.tokensOf2(p.unit, prep, to, base, designs, P, lead, () => 0)))
      fontWait += performance.now() - tFonts
      // (let go while its faces loaded: nothing more of it, not even its measures, in roles a newer layer may have set)
      if (disposed) return
      if (no) { p.refused = true; p.why = no.why; p.missing = no.missing; return }
    }
    const tokens = L2.tokensOf2(p.unit, prep, to, base, designs, P, lead)
    const t3 = lap()
    // (the unit's leading relative to the original's own pitch, step 3: leadOf)
    p.tokens = tokens
    p.prep = prep
    p.s = s
    p.P = { ...P, leadBase: L2.leadOf(p.blocks, s, P), trackStart: P.trackStart ?? cjkAdvance() }
    // (no larger than its lines' room between the rules over and under them leaves its script's em box: clearanceOf)
    p.clear = clearanceOf(p, s)
    if (p.clear && p.clear.cap < 1) p.P.capScale = p.clear.cap
    // (fillBySize, P.fillSize, off by default: where the leading rule gave up a step (0.05) or more of the script's
    // leading on a loose original, the paragraph is filled by its text's size instead, up to P.fillSize × the
    // original's; a solid-set original keeps the script's leading, and its units are never grown)
    if (P.fillSize > 1 && p.P.leadBase <= P.leadBase - 0.05 + 1e-9) p.P.growTo = P.fillSize
    // (adaptiveFill: every unit is laid at its leading relative to the original's own pitch, the script's own on a solid-set
    // original, and filled by its page's pass, fillPass. D filled a loose original's units alone (S3-12, against a band of
    // leading page by page moving the pages' pitches apart); D6's F6b fills every original's, its page's target held within
    // the band of the last page's)
    if (P.adaptiveFill) {
      p.fillable = true
      p.P.leadBase = L2.leadOf(p.blocks, s, { ...P, leadRel: true })
      p.P.growTo = 0
    }
    p.layout = L2.layoutUnit2(tokens, p.blocks, s, p.P)
    // (step 3: never drawn in part: given more room where the page has it, else left the original's, whole)
    if (p.layout.clipped) {
      const further = fitFurther(p, tokens, s)
      if (further) { p.layout = further.layout; p.blocks = further.blocks; if (further.P) { p.P = further.P; p.clear = further.clear } }
      else { p.refused = true; return }
    }
    settleLayout(p)
    const t4 = lap()
    p.layout.extents = new Map([...prep.extents].map(([r, e]) => [r.join(), e]))
    if (p.blocks[0] && (prep.label || prep.firstX0 !== undefined || inkBefore !== undefined)) {
      const r0 = p.blocks[0].rects[0], ext = p.layout.extents.get(r0.join()) ?? r0.slice(1)
      // (an extent of several boxes, the file's: its first)
      const multi = Array.isArray(ext[0]), e = multi ? ext[0] : ext
      if (e) {
        let x0 = prep.firstX0 !== undefined ? Math.min(e[0], prep.firstX0 - 0.2) : e[0]
        // from right after the ink before it (a label), but never more than 2 pt before the line's own first word
        if (inkBefore !== undefined) x0 = Math.min(x0, Math.max(inkBefore + 0.5, (prep.firstX0 ?? e[0]) - 2))
        // (a label set in the target's name is the line's: erased from its first glyph)
        if (prep.label?.drawn) x0 = Math.min(x0, ...prep.label.chars.map(c => c.x0 - 0.2))
        else if (prep.label) x0 = Math.max(x0, prep.label.x1 + 0.6)
        p.layout.extents.set(r0.join(), multi ? [[x0, e[1], e[2], e[3]], ...ext.slice(1)] : [x0, e[1], e[2], e[3]])
      }
    }
    const lines = recLinesOf(p)
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
      p.layout = L2.layoutUnit2(p.tokens, p.blocks, p.s, { ...PU, maxScale: target, leadBase: Math.min(PU.leadBase, leadTo) })
      p.layout.extents = keep.extents
      settleLayout(p)
      if (p.rec) Object.assign(p.rec, { f: r1(p.layout.f), sizeRatio: r1(p.layout.f / p.s), fitScale: p.layout.scale, knob: p.layout.knob, lead: p.layout.state.lead, lines: recLinesOf(p) })
    }
  }
  // adaptiveFill's pass over a page's units that begin on it (fillPage), each filled unit's record updated; the paper's
  // running target, the last target a page's body units told, in the order the pages' passes run (the units' laying
  // order, the same whether the rows come at once or in parts: no page waits for a later one)
  let running = null
  const fillPass = pg => {
    const r = fillPage(laid[pg].filter(p => p.fillable && !p.refused && p.pages[0] === pg), P, running, (p, target) => {
      const l = p.layout
      if (p.rec) Object.assign(p.rec, { f: r1(l.f), sizeRatio: r1(l.f / p.s), fitScale: l.scale, knob: l.knob === 'none' ? 'fill' : l.knob, lead: l.state.lead, track: l.state.track, lines: recLinesOf(p), fill: { target, lead: p.fillLead } })
    })
    if (r?.body) running = r.target
  }
  const ms = new Map()
  // A table group's cells laid, then painted all together or not at all (the table-groups brief): a cell is painted
  // only once every cell of its group is laid, and none is where one could be set only clipped (its fit past its floor)
  // — a cell that cannot be drawn whole cannot be drawn —, or where the group's cells lie on more than one page (the
  // first page's would be painted before the last's are laid). A group not painted is the original's, its records gone
  const groupLaid = new Map()
  const withhold = (p, why) => {
    const at = placed.indexOf(p)
    if (at >= 0) placed.splice(at, 1)
    const r = stats.indexOf(p.rec)
    if (r >= 0) stats.splice(r, 1)
    skipped.push({ id: p.id, kind: p.unit.kind, why: `group: ${why}`, chars: trCharsOf(p.unit), pages: p.pages })
  }
  const settleGroup = g => {
    const laidCells = groupLaid.get(g)
    if (!laidCells || laidCells.done || laidCells.list.length < groupCells.get(g).length) return
    laidCells.done = true
    const pages = new Set(laidCells.list.flatMap(p => p.pages))
    // (and over the text-removed PDF, a cell on a page the remover refused: it could only be erased)
    const why = pages.size > 1 ? 'on two pages' : laidCells.list.some(p => p.refused || p.layout.clipped) ? 'a cell unfit' : RM?.mode === 'draw' && [...pages].some(pg => !removedPage(pg)) ? 'its page not removed' : null
    if (why) { for (const p of laidCells.list) withhold(p, why); return }
    for (const p of laidCells.list) for (const pg of p.pages) paint(p, pg)
  }
  const arrive = async p => {
    fontWait = 0
    const t0 = performance.now()
    await layout2(p)
    // (let go while it was laid: neither recorded, nor painted, nor counted)
    if (disposed) return
    // (the faces it waited for apart from its laying: no task of v0's)
    timesOf(p.pages[0]).lay += performance.now() - t0 - fontWait
    timesOf(p.pages[0]).fonts += fontWait
    // (a unit no step fits is the original's: neither erased nor drawn, nor checked; nor one whose characters no served
    // slice holds (`served`) or whose slice did not load (`face`))
    if (p.refused) skipped.push({ id: p.id, kind: p.unit.kind, why: p.why ?? 'unfit', ...(p.missing ? { missing: p.missing } : {}), chars: trCharsOf(p.unit), pages: p.pages })
    const g = p.unit.group && groupCells.has(p.unit.group) ? p.unit.group : null
    if (g) (groupLaid.get(g) ?? groupLaid.set(g, { list: [], done: false }).get(g)).list.push(p)
    if (P.even || P.adaptiveFill) {
      // (a page's pass sets the units that begin on it, which are then painted on each of their pages: a unit is never
      // painted from two layouts; a table's cells with their group, once it is laid whole)
      for (const pg of p.pages) {
        laid[pg].push(p)
        if (laid[pg].length === expected[pg]) {
          if (P.even) evenPass(pg)
          if (P.adaptiveFill) fillPass(pg)
          for (const u of laid[pg]) if (!u.refused && u.pages[0] === pg && (!u.unit.group || !groupCells.has(u.unit.group))) for (const q of u.pages) paint(u, q)
          for (const gg of new Set(laid[pg].map(u => u.unit.group).filter(x => x && groupCells.has(x)))) settleGroup(gg)
        }
      }
    } else if (g) settleGroup(g)
    else if (!p.refused) for (const pg of p.pages) paint(p, pg)
    ms.set(p.id, performance.now() - t0 - fontWait)
  }

  // a page drawn: its characters read, its copy made and its ink mapped; the paper's designs from the first
  // each page's costs, ms (the gate's --perf): its original drawn (render), its text read (text), the removal's reading of
  // its ink and its plan (ink), its removed page drawn for v0's copy (rp); its units laid (lay: a unit's on its first
  // page, less the faces it waited for, fonts) and painted, their operations made (ops: the erase and its put-back, or
  // the swap's rectangles), drawn on the copy (compose) and set as SVG (svg)
  const pageTimes = []
  const timesOf = pg => (pageTimes[pg] ??= { render: 0, text: 0, ink: 0, rp: 0, lay: 0, fonts: 0, ops: 0, compose: 0, svg: 0 })
  const drawPage = async i => {
    const tPage = performance.now()
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
    const tRendered = performance.now()
    timesOf(i).render += tRendered - tPage
    const tc = await textP
    if (i === 1 && lmP) await lmP
    const fontOf = fontOfPage(page, tc.styles)
    // the slices of the role table's faces that hold the page's characters, before they are measured in them (layer2.mjs
    // wDesign measures a character in its font's design, as upright or slanted as the font is)
    if (FS) {
      const byFace = new Map()
      for (const it of tc.items) {
        const st = it.str ? fontOf(it.fontName) : null
        if (!st?.known) continue
        const face = faceOf({ ...st, fam: st.fam === 'math' ? 'serif' : st.fam }, 'latin', 'en'), key = fontString(face, 100)
        const e = byFace.get(key) ?? byFace.set(key, { face, text: '' }).get(key)
        e.text += it.str
      }
      await Promise.all([...byFace.values()].map(e => FS.ready(e.face, e.text)))
    }
    chars2[i - 1] = L2.pageChars2(tc, fontOf)
    timesOf(i).text += performance.now() - tRendered
    for (const c of chars2[i - 1]) if (c.st.fam !== 'math') { const key = `${c.st.fam}:${c.st.design}`; fontTally.set(key, (fontTally.get(key) ?? 0) + 1) }
    r.right?.getContext('2d').drawImage(r.left, 0, 0)
    r.base = true
    if (RM) {
      if (removedPage(i)) {
        RM.stats.pages++
        // its removed page, where v0 keeps a copy of its own (the gate's) and the manifest has kept ink under a unit's
        // rectangles there: a view draws it at its own resolution, drawCopy, and only where a swap asks for it
        if (copy && RM.manifest.page[i]?.dirty?.length) {
          const t = performance.now()
          const pg = await removal.doc.getPage(setPage('R', i))
          const c = document.createElement('canvas')
          c.width = r.left.width
          c.height = r.left.height
          await pg.render({ canvas: c, canvasContext: c.getContext('2d'), viewport: pg.getViewport({ scale }), transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise
          RM.removed[i] = c
          RM.stats.swapPages++
          RM.stats.ms.render += performance.now() - t
          timesOf(i).rp += performance.now() - t
        }
      } else if (RM.mode === 'draw') RM.stats.refused++
    }
    if (P.borrow) inkOf(i)
    // (let go while the page was drawn: the roles and faces every run shares are a newer layer's to set)
    if (disposed) return
    if (i === 1) {
      // the paper's designs from its first page: the serif with most characters, and its sans and mono
      const pick = fam => [...fontTally].filter(([k]) => k.startsWith(`${fam}:`)).sort((a, b) => b[1] - a[1])[0]?.[0].split(':')[1]
      const serif = pick('serif') ?? 'times'
      designs = { serif, sans: pick('sans') ?? (serif === 'cm' ? 'cmss' : 'helvetica'), mono: pick('mono') ?? (serif === 'cm' ? 'cmtt' : 'courier') }
      if (roles) {
        // the paper's family from the first page's fonts, weighted by their characters; then the target's likely faces,
        // each measured once
        const weight = new Map()
        for (const c of chars2[0]) if (c.st?.name) weight.set(c.st.name, (weight.get(c.st.name) ?? 0) + 1)
        setRoleFaces(to, familyOfFonts([...weight.keys()], [...weight.values()]), R.cjkFaces)
        await hyphP
        if (disposed) return
        await L2.warmFaces(to, P.cjk, designs, yieldNow, (face, text) => FS.ready(face, text))
      } else {
        await loadWebFaces([designs.serif, designs.sans, designs.mono], fontUrl)
        await hyphP
        await warmP
      }
    }
  }

  // ---- the units as they arrive (take, end). A page is laid as one open over every unit lays it: the units its drawing
  // lays are layGroups' (each a batch's place in the stream, which counts the units placed before it), its page passes
  // wait for every unit placed on it, and its units read the file's own units' lines on their pages. So a page is laid
  // once every unit up to the last of those in the stream (`K`) is in and decided (needsOf), and the units are placed
  // in the stream's order as each prefix is (`frontier`): an order fixed before the rows are read would not be the one
  // open's (a unit not translated, an author, a cell whose group is withheld, the file's lines in place of the geometry's
  // decide which units are placed, and so the batches). A unit's row is fixed once it is placed (a row taken for it
  // later is late), and every row once a table's group is read
  const need = needsOf(K, N, !!(P.even || P.adaptiveFill), c => !c.rects)
  /** the units placed, in the stream's order, as layGroups and doneAt read them (`placed` is the same less each table
   *  group withheld as its cells are laid), and by id */
  const laidOut = [], byId = new Map()
  const fixed = new Set(), late = new Set(), deferred = []
  let frontier = 0, ended = false
  /** whether the unit's row decides what it is: in, and a table cell's group readable (every row in) where it is placed */
  const settleable = c => {
    if (!c.lists.length || frozenAll) return true
    if (pending.has(c.id)) return false
    const u = U.get(c.id)
    if (!u?.group || !translated(u) || !pending.size || read.has(u.group)) return true
    // (a cell placed waits for its group: its own cells' rows where the open was given them, else every row)
    if (tableGroups && (membersOf.get(u.group) ?? []).every(id => !pending.has(id))) return true
    return !decisionOf(c).p
  }
  /** the next unit in the stream placed, or not and why */
  const consume = c => {
    frontier++
    // (drawn on no page shown: it places nothing, and why it is left is read at the end)
    if (!c.lists.length) { deferred.push(c); return }
    fixed.add(c.id)
    const u = U.get(c.id), d = decisionOf(c)
    if (d.skip) skipped.push(d.skip)
    let p = d.p
    if (p && u.group) {
      if (!tableGroups) freezeAll()
      else if (!read.has(u.group)) readGroup(u.group, membersOf.get(u.group) ?? [])
      if (split.has(u.group)) { skipped.push({ id: p.id, kind: u.kind, why: 'group: a cell not drawn', chars: trCharsOf(u), pages: p.pages }); p = null }
    }
    if (!p) return
    laidOut.push(p)
    placed.push(p)
    byId.set(p.id, p)
    for (const pg of p.pages) expected[pg]++
    if (!c.rects) addRects(p.id, p.rects)
  }
  // each page's units, in the order of the page whose drawing lays them (a recorded order, where given, within it), and
  // the page after whose units a page is done: the last that lays a unit with lines on it; over the units placed so far
  // (their pages', where need says so)
  const rank = orderIn ? new Map(orderIn.map((id, i) => [id, i])) : null
  let groups = new Map(), doneAt = Array.from({ length: N + 1 }, (_, pg) => pg), plannedTo = 0
  const plan = () => {
    plannedTo = frontier
    groups = new Map(layGroups(laidOut, batch).map(([pg, ids]) => [pg, rank ? ids.slice().sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity)) : ids]))
    const groupOf = new Map()
    for (const [pg, ids] of groups) for (const id of ids) groupOf.set(id, pg)
    doneAt = Array.from({ length: N + 1 }, (_, pg) => pg)
    for (const p of laidOut) for (const pg of p.pages) doneAt[pg] = Math.max(doneAt[pg], groupOf.get(p.id) ?? pg)
    // (with a page pass, P.even or P.adaptiveFill: a page is done once the first page of each unit on it is, whose pass
    // sets that unit)
    if (P.even || P.adaptiveFill) for (let pg = 1; pg <= N; pg++) for (const p of laidOut) if (p.pages.includes(pg)) doneAt[pg] = Math.max(doneAt[pg], doneAt[p.pages[0]])
  }
  /** page pg's doneAt once the units it reads are placed and planned, else Infinity */
  const doneAtOf = pg => (pg >= 1 && pg <= N && plannedTo <= need.done[pg] ? Infinity : doneAt[pg])
  // (until's: waiting for a take or end(); one waiter, until's own chain)
  let wake = null
  /** whether the run was let go (dispose): nothing is drawn or laid after it */
  let disposed = false
  const changed = () => { const w = wake; wake = null; w?.() }
  /** the units of the stream up to K[idx] placed, as their rows come */
  const settle = async idx => {
    while (!disposed && frontier <= idx && frontier < K.length) {
      // (planned before waiting: doneAt never reads a placement it has not planned)
      if (!settleable(K[frontier])) { if (plannedTo < frontier) plan(); await new Promise(ok => { wake = ok }); continue }
      consume(K[frontier])
    }
    if (plannedTo < frontier) plan()
  }
  /** every unit placed with what is in, and why each one left is left: the units no page shows, and those v0 neither
   *  holds nor the file alone locates */
  const settleAll = () => {
    pending.clear()
    freezeAll()
    while (frontier < K.length) consume(K[frontier])
    for (const c of deferred.splice(0)) { fixed.add(c.id); const d = decisionOf(c); if (d.skip) skipped.push(d.skip) }
    U.forEach((u, id) => { if (!translated(u) || candOf.has(id)) return; const no = refusalOf(id, u); skipped.push(no ? refusedOf(id, u, no) : unanchoredOf(id, u)) })
    plan()
  }
  /** how far into the stream every unit's row decides what it is */
  const extent = () => { let j = frontier; while (j < K.length && settleable(K[j])) j++; return j }
  const isComplete = (pg, at = extent()) => ended || at > need.complete[Math.min(Math.max(pg, 0), N)]
  const told = new Uint8Array(N + 1)
  // (today's call, every unit given: placed at once, as the one open places them)
  if (!pending.size) settleAll()
  const order = [], pageMs = []
  let drawnTo = 0, busy = Promise.resolve()
  /** the next page drawn, then the units its drawing lays laid once they have come, a yield before each (no task lays
   *  two; the page's passes run with the unit that completes it) */
  const layNext = async () => {
    const pg = drawnTo + 1
    const t0 = performance.now()
    await drawPage(pg)
    const t1 = performance.now()
    await settle(need.lay[pg])
    const waited = performance.now() - t1
    // (let go during the yield before a unit, as a host's dispose usually is: that unit is not laid either)
    for (const id of groups.get(pg) ?? []) { if (disposed) return; await yieldNow(); if (disposed) return; order.push(id); await arrive(byId.get(id)) }
    if (disposed) return
    drawnTo = pg
    pageMs[pg] = performance.now() - t0 - waited
  }
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
  const cellRects = pg => GU.filter(([id]) => geometry.kinds[id] === 'cell').flatMap(([, , rs]) => rs.filter(r => r[0] === pg))
  const toPdf = (pg, x, y) => views[pg - 1].convertToPdfPoint(x / dpr, y / dpr)
  // a page as PDF.js draws it at k device pixels a PDF unit: drawCopy's source of another page's crop
  const renderAt = async (pg, k, plane = 'O') => {
    const page = plane === 'O' ? await doc.getPage(pg) : await removal.doc.getPage(setPage(plane, pg))
    const viewport = page.getViewport({ scale: k })
    const c = document.createElement('canvas')
    c.width = Math.ceil(viewport.width)
    c.height = Math.ceil(viewport.height)
    await page.render({ canvas: c, canvasContext: c.getContext('2d'), viewport }).promise
    return c
  }
  const needsCopy = () => { if (!copy) throw new Error("v0's checker reads its copy at its own resolution: open with copy: true") }
  /** every page's canvases let go, drawn or not, and the removed pages' (dispose) */
  const letGo = () => {
    for (const r of rows) {
      for (const c of [r.left, r.right]) if (c) { c.width = 0; c.height = 0 }
      r.base = false
      r.released = true
    }
    if (RM) { for (const c of RM.removed) if (c) { c.width = 0; c.height = 0 }; RM.removed = []; RM.others = [] }
  }

  return {
    N, P, rows, placed, skipped, stats, audit, order, ms, pageMs, pageTimes, chars: chars2, views,
    /** the layout rule set the run was opened with (rules/layout.mjs): its schema and version */
    rules: { schema: RULES_SCHEMA, version: R.version },
    get designs() { return designs },
    /** the hybrid's: each placed unit's source, in the order of the geometry's units then the file's alone, and why the
     *  units placed by v0's geometry are (and those only the file holds it does not locate whole) */
    get sources() {
      const out = { tex: [], v0: [], why: {} }
      if (!tex) return out
      let only = 0
      for (const c of cands) {
        const d = fixed.has(c.id) ? decisions.get(c.id)?.d : null
        if (!d) continue
        const why = c.rects ? d.why : d.missed
        if (why) out.why[why] = (out.why[why] ?? 0) + 1
        if (!c.rects && d.p) only++
        if (byId.has(c.id)) (byId.get(c.id).tex ? out.tex : out.v0).push(c.id)
      }
      if (only) out.texOnly = only
      return out
    },
    /** the page after whose units page `pg` is done (Infinity until the units it reads have come) */
    doneAt: doneAtOf,
    /** every page up to the one that finishes page `p` drawn, and the units each lays laid and painted, a unit a task:
     *  page after page, each once the units it lays have come, up to p, then on to the page that finishes it (doneAt,
     *  once the units on it have come) */
    until(p) {
      busy = busy.then(async () => {
        const q = Math.min(p, N)
        while (!disposed && drawnTo < q) await layNext()
        await settle(need.done[q] ?? -1)
        const to = Math.min(N, doneAt[q] ?? p)
        while (!disposed && drawnTo < to) await layNext()
      })
      return busy
    },
    /**
     * Units as they arrive (rows: id → its row, the units record's): each awaited unit's row, which wins over one taken
     * before it until the unit is placed; a translated row's pieces' k read into the hybrid's pieces (trPiecesOf: the
     * units file's TrPiece). A row that can no longer change the drawing is late (late()); one no unit of this paper's
     * is left the original's (refusalOf). Returns the pages newly complete: those not reported complete before.
     */
    take(rows) {
      const list = [...rows]
      for (const [id, row] of list) if (!Number.isSafeInteger(id) || id < 0 || row === null || typeof row !== 'object') throw new TypeError(`take: a row is [id, unit], not [${kindOf(id)}, ${kindOf(row)}]`)
      for (const [id, row] of list) {
        if (ended || frozenAll || fixed.has(id) || !awaited.has(id)) { late.add(id); continue }
        U.set(id, row)
        pending.delete(id)
        // (the hybrid's pieces, as the units file holds them: a translated unit's alone)
        if (tex) { const tr = translated(row) ? trPiecesOf(row.pieces, q => q.k) : null; if (tr) tex.pieces.set(id, tr); else tex.pieces.delete(id) }
      }
      changed()
      const at = extent(), complete = []
      for (let pg = 1; pg <= N; pg++) if (!told[pg] && isComplete(pg, at)) { told[pg] = 1; complete.push(pg) }
      return { complete }
    },
    /** no more units: every unit placed with what is in, every page complete */
    end() {
      if (ended) return
      ended = true
      settleAll()
      changed()
    },
    /** whether every unit page `pg`'s laying reads has come (or end()): until(pg) then waits for no take. It turns false
     *  again only where a table cell's row is taken again before its group is read */
    complete: pg => isComplete(pg),
    /** the ids of every row taken that could no longer change the drawing, and changed nothing: its unit placed already
     *  (its page may not be laid yet), its rows fixed by a table group read, taken after end(), or never expected. Not a
     *  page to draw again: no laid page ever changes */
    late: () => [...late],
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
      // every page and plane the drawing cuts from but this page's own original (`source`): the removed page a swap takes
      // from, and the other pages a crop takes from
      const others = new Map()
      const need = (j, plane) => { const key = `${plane}${j}`; if (!(plane === 'O' && j === pg) && !others.has(key)) others.set(key, [j, plane]) }
      for (const o of r.ops) { if (o.op === 'swap') need(o.page, 'R'); else if (o.op === 'crop') need(o.page, o.plane ?? 'O') }
      for (const [key, [j, plane]] of others) others.set(key, await renderAt(j, k, plane))
      ctx.drawImage(source, 0, 0)
      L2.drawOps(ctx, r.ops, k / (scale * dpr), (j, plane = 'O') => (j === pg && plane === 'O' ? source : (others.get(`${plane}${j}`) ?? null)))
      for (const c of others.values()) { c.width = 0; c.height = 0 }
    },
    /** a done page's canvases let go (its SVG and its drawing's operations stay): no unit paints it again */
    release(pg) {
      const r = rows[pg - 1]
      if (!r || drawnTo < doneAtOf(pg)) return
      for (const c of [r.left, r.right, RM?.removed[pg]]) if (c) { c.width = 0; c.height = 0 }
      if (RM) for (const k of ['removed', 'others']) RM[k][pg] = undefined
      r.base = false
      r.released = true
    },
    /** the run let go: its sheet removed, every page's canvases released (a page under way when it is called, once it ends),
     *  nothing drawn or laid after; an until under way resolves. Its SVGs and its drawing's operations stay with whoever
     *  holds them */
    dispose() {
      if (disposed) return
      disposed = true
      sheet.remove()
      letGo()
      changed()
      busy.then(letGo, letGo)
    },
    /** how the removal went: pages removed and refused, units drawn by it (tex) and the old way (v0), the rectangles filled
     *  and swapped, the pages a swap draws the removed page for */
    removalStats: () => RM?.stats ?? null,
    /** a done page's removed page at v0's own resolution (draw mode, until released), for a check */
    removedCanvas: pg => RM?.removed[pg] ?? null,
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
/** what a value is, for a refusal: its type, never its text */
const kindOf = v => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v)
function trCharsOf(u) {
  return u.pieces.reduce((a, p) => a + (p.t === 'text' ? [...p.s.replace(/\s+/g, '')].length : 0), 0)
}

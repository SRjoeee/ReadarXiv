// src/pdf-reader/engine/layer-proto/reader.mjs
// The reader's door (the layer-only plan of 2026-10-08, §7, A2's E4; BUNDLE 4's parts, the door design of 2026-10-15). On
// 2026-10-08 the instant layer became the only reading view, for the web reader and the extension alike; both take every
// engine value they use from this module, and both draw a paper through openLayer: the one place v0's host is written
// (run.mjs openProto's options: the geometry, the hybrid's choices, the add-on, the labels, the scale), so that neither
// reader decides how a page is drawn and both draw it as the layer gate measured it. The rest is what a host needs around
// it: the bundle and its bounded reader, the rows, the layout file's and the add-on manifest's readers, the role table's
// faces and the face to ask for first, and the translation loop the extension runs itself. It reaches none of the server's
// modules (live.mjs, the remover, the layout maker and its marks) and no node: specifier: a test walks its imports.
import { groupOf } from '../translate/groups.mjs'
import { rolesFor } from '../rules/font-roles.mjs'
import { indexLayout } from '../layout/file.mjs'
import { BundleRefusal } from './bundle.mjs'
import { layoutFacade } from './facade.mjs'
import { OPEN_FAMILY } from './fonts.mjs'
import { readLeftPart } from './format.mjs'
import { sourceUnitsOf, toTranslate, unitOf } from './rows.mjs'
import { openProto } from './run.mjs'
import { BUILTIN_RULES, resolveRules } from '../rules/layout.mjs'

export { PDF_OPTIONS } from './run.mjs'
export { BUNDLE, BUNDLE_CAP, BUNDLE_VALUES, BundleRefusal, bundleKey, CTAG, readBundle, VTAG } from './bundle.mjs'
export { batchesOf, layerRows, rowOf, runRows, toTranslate, unitOf } from './rows.mjs'
export { ADDON_CAP, ADDON_MANIFEST_CAP, ADDON_MANIFEST_VALUES, parseAddonManifest } from '../layout/addon-manifest.mjs'
export { indexLayout, LAYOUT, LAYOUT_CAP, LAYOUT_VALUES, LayoutRefusal, parseLayout } from '../layout/file.mjs'
export { trPiecesOf } from '../layer/pieces.mjs'
export { FACES } from '../rules/font-roles.mjs'
export { translateUnits } from '../translate/mt.mjs'

/** the hybrid's choices, the layer gate's (--proto-tex=lines): each unit the layout file locates whole drawn by the file's
 *  lines, label and placeholders, the units only the file holds drawn too (but table cells), no symbol drawn as text
 *  asked to be found, each line's erase extent v0's own */
const HYBRID = Object.freeze({ use: 'lines', texOnly: true, symbols: 'text', extents: 'v0' })
/** v0's resolution, one on every device: 2.5 CSS px a PDF unit at a device pixel ratio of 1, the gate's 2.5 device pixels a
 *  unit (a view draws the page at its own, copyOf) */
const SCALE = 2.5
/** which floats take the target's names (L7): figures and tables alike, whatever the paper's own final would do */
const CAPTIONS = Object.freeze({ figure: 'target', table: 'target' })
/** a page's states as the door tells them: waiting (none told), laying, ready, failed */
const WAITING = 0, LAYING = 1, READY = 2, FAILED = 3
/** how many newer asks a page told laying waits behind at most before it is laid first */
const OVERTAKEN = 1
const STATES = Object.freeze(['waiting', 'laying', 'ready', 'failed'])

/** what a value is, for a refusal: its type, never its text */
const kindOf = v => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v)
const abortError = () => Object.assign(new Error('the ask was aborted'), { name: 'AbortError' })
const isDocument = d => d !== null && typeof d === 'object' && typeof d.getPage === 'function' && Number.isSafeInteger(d.numPages)
/** a rule set a host passes (rules/layout.mjs RuleSet, as readRules reads it): an object holding the schema's scripts and
 *  languages, or a TypeError like the door's other arguments */
function checkRules(rules) {
  const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)
  if (!isObject(rules) || !isObject(rules.scripts) || !isObject(rules.languages)) throw new TypeError(`rules: a rule set (readRules's), not ${isObject(rules) ? 'an object that holds none' : kindOf(rules)}`)
  return rules
}
/** the layer open in this realm, from its open to its dispose: v0's faces are the page's (fonts.mjs setRoleFaces holds one
 *  target's and one family's roles for every run), so that a second layer open at once would set the first's faces */
let opened = null

/**
 * The face a host asks for first, at the open, before the paper's English family is known: the target's CJK body face,
 * light where the layout rules say so beside the family v0 opens with (OPEN_FAMILY), else null. It is the face
 * openLayer's run warms at its open, asked through the rules (the set a host passes to openLayer, the built-in one if
 * none) rather than the role table, so that no host decides a face.
 */
export function firstFaceOf(target, rules = BUILTIN_RULES) {
  const { cjkFaces } = resolveRules(checkRules(rules), target)
  return cjkFaces ? rolesFor(target, OPEN_FAMILY, cjkFaces).cjk.body : null
}

/** a left-side unit's rectangles added to a page's shapes, [id, x0, y0, x1, y1] each (unitAt's) */
function addShapes(by, units) {
  for (const [id, , rects] of units) for (const [page, a, b, c, d] of rects) {
    const list = by.get(page) ?? by.set(page, []).get(page)
    list.push([id, Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)])
  }
}

/**
 * The layer of one paper and target, as either reader shows it: v0 opened over the composed document `doc` (arXiv's PDF
 * followed by the paper's removed pages, opened once by PDF.js with PDF_OPTIONS), its left as its geometry, its layout file
 * as the hybrid's (none where the maker refused, or the bundle or a part dropped it: every rendering is still proven, by
 * nothing then, so that a unit with a placeholder other than TeX's own nothing, a space or a text symbol stays the original's;
 * run.mjs openProto's `proof`), its add-on's manifest as the text removal's, the units to come the target's (toTranslate), each table
 * cell's group from the cells, the target's caption names on every float (L7), the host's served faces (`faceSources`) and
 * hyphenation patterns (`hyphUrl`), at scale 2.5 and a device pixel ratio of 1, no copy kept at v0's own resolution: one set
 * of choices on every device. Each choice made for the target is the layout rules' (`rules`; the built-in set where none),
 * none a host's own. One layer is open a page (a realm) at a time: v0's faces are the page's.
 *
 * Two opens. BUNDLE 4 (`index`: indexOf's, the head and every unit; `parts`: those told at the open, in order, over the
 * document through the last one's tail; `leftPart(page, ref)`: the host's transport for the left parts; `onRetired(doc)`:
 * a document the layer no longer reads, the host's to destroy): the parts come over time (addPart, endParts), and a page is
 * `waiting` until the parts covering it and its closure are in and the rows it reads are taken (or ended), `laying` once
 * asked or in an asked page's way, `ready` once laid, `failed` where it cannot be. BUNDLE 3 (`bundle`, readBundle's) until
 * the pin move: the same layer over the whole paper, every page covered, no part to come.
 *
 *   take(rows), end()    the rows as v0's units (rows.mjs unitOf); a row that is no unit of the paper's is skipped and counted
 *   addPart(part, { doc })  the next part (readPart's), with the composed document through its tail where it has one
 *   endParts()           no more parts: every page no part covers fails
 *   pageState(page), onPage(listener)  each page's state, and each change told once: laying, then ready or failed
 *   pageOf(page, { lang, signal })  the page laid, a new LaidPage each call (its SVG made anew of the page's kept markup, lang
 *                        set; words a copy of the page's word table, links empty until the engine's 3a); it waits for what the page needs, and
 *                        rejects where the page fails, the layer is let go or the signal aborts
 *   leftPageOf(page, { signal })  the page's left part, fetched once through leftPart and read, once a part covers it
 *   copyOf(page, source, k)  a ready page's copy at a view's resolution, over `source` (the page as PDF.js drew it at k)
 *   unitAt(page, x, y)   the unit of the left whose shape holds the point (PDF units), the smallest; null where none
 *   stats(), dispose()   what it has done; the run let go, every ask rejected, its documents told to onRetired once read by
 *                        nothing. After dispose pageOf, leftPageOf, copyOf and pageState throw; stats and unitAt answer
 */
export async function openLayer(o = {}) {
  const { bundle, index, doc, parts, target, faceSources, hyphUrl, leftPart, onRetired, rules = BUILTIN_RULES } = o ?? {}
  const four = bundle === undefined
  if (four) {
    if (index === null || typeof index !== 'object' || index.kind !== 'index' || !Array.isArray(index.units) || !index.head) throw new TypeError(`index: a layer index (indexOf's), not ${kindOf(index)}`)
    if (index.light === true) throw new TypeError('index: a light index holds no unit bodies, which the layer needs (indexOf of chunks read with their bodies)')
    if (parts !== undefined && !Array.isArray(parts)) throw new TypeError(`parts: the parts read so far, not ${kindOf(parts)}`)
    if (typeof leftPart !== 'function') throw new TypeError(`leftPart: the host's transport for the left parts, not ${kindOf(leftPart)}`)
    if (typeof onRetired !== 'function') throw new TypeError(`onRetired: a function, not ${kindOf(onRetired)}`)
  } else {
    if (bundle === null || typeof bundle !== 'object' || !Array.isArray(bundle.units) || bundle.left === null || typeof bundle.left !== 'object') throw new TypeError(`bundle: a read bundle (readBundle's), not ${kindOf(bundle)}`)
    if (index !== undefined) throw new TypeError('index and bundle: one paper, not two')
    if (onRetired !== undefined && typeof onRetired !== 'function') throw new TypeError(`onRetired: a function, not ${kindOf(onRetired)}`)
  }
  if (!isDocument(doc)) throw new TypeError(`doc: a PDF.js document, not ${kindOf(doc)}`)
  if (typeof target !== 'string') throw new TypeError(`target: a language tag, not ${kindOf(target)}`)
  if (typeof faceSources !== 'function') throw new TypeError(`faceSources: a function, not ${kindOf(faceSources)}`)
  if (typeof hyphUrl !== 'function') throw new TypeError(`hyphUrl: a function, not ${kindOf(hyphUrl)}`)
  checkRules(rules)
  // (the parts told at the open stand as a chain, over a document through the last one's tail, before anything is opened)
  if (four) {
    let ch = { through: 0, last: null, r: 0 }
    const told = new Set()
    for (const part of parts ?? []) {
      if (part?.sha256 !== undefined && told.has(part.sha256)) continue
      checkPart(part, index, ch)
      told.add(part.sha256)
      ch = { through: part.pages[1], last: part.sha256, r: part.chain.r }
    }
    const N = index.head.paper.pages
    if (doc.numPages !== N + ch.r) throw new BundleRefusal(`the document has ${doc.numPages} pages, not ${N + ch.r}`, { kind: 'part', path: 'doc' })
  }
  if (opened) throw new Error('openLayer: one open layer a page; dispose the open one first')
  // (taken before the open's first await: two opens at once are refused alike)
  const token = {}
  opened = token
  try { return await openOne({ four, bundle, index, doc, parts: parts ?? [], target, faceSources, hyphUrl, leftPart, onRetired, rules }, token) } catch (e) { if (opened === token) opened = null; throw e }
}

/** a part told to the door, against the index and the chain so far (`ch`: through, last): a ReadPart of the index's head that
 *  follows the last part; a TypeError for what is no part, a BundleRefusal for one that does not follow, nothing changed */
function checkPart(part, index, ch) {
  if (part === null || typeof part !== 'object' || part.kind !== 'part' || part.chain === null || typeof part.chain !== 'object' || !Array.isArray(part.pages)) throw new TypeError(`part: a part readPart read, not ${kindOf(part)}`)
  if (part.head !== index.sha256) throw new BundleRefusal('not a part of the index\'s head', { kind: 'part', path: 'head' })
  if (part.pages[0] !== ch.through + 1) throw new BundleRefusal(`not beginning at page ${ch.through + 1}`, { kind: 'part', path: 'pages' })
  if (part.prev !== ch.last) throw new BundleRefusal('not following the digest of the last part', { kind: 'part', path: 'prev' })
}

async function openOne({ four, bundle, index, doc, parts, target, faceSources, hyphUrl, leftPart, onRetired, rules }, token) {
  const source = four ? index : bundle
  const expect = toTranslate(source, target)
  // (each cell's group as the units' cells give it: a group is read once its own cells' rows are in)
  const groups = new Map()
  sourceUnitsOf(source).forEach((u, id) => { const g = u ? groupOf(u) : null; if (g) groups.set(id, g) })
  const facade = four ? layoutFacade(index.head) : null
  // (dead: the error a run could not go on from, which leaves the layer terminal)
  let run = null, disposed = false, dropped = 0, told = null, dead = null
  // the door's state: each page's asks, the listeners, the left's shapes, streams and refs, the left pages fetched or awaited,
  // the chain told
  const asks = new Map(), listeners = new Set(), shapes = new Map()
  const streamOf = new Map(), leftRefs = new Map(), leftCache = new Map(), leftWaiters = new Map()
  const chain = { through: 0, last: null, r: 0 }, toldParts = new Set()
  let goneNow = () => {}
  const gone = new Promise((_, no) => { goneNow = no })
  gone.catch(() => {})
  const letGoError = () => new Error('openLayer: the layer was let go (dispose)')
  // (proof: a unit read with no layout file (none for the paper, or a part's `layout: null`) is still under the proof, which
  // nothing then proves but TeX's own nothing, a space and a text symbol, so no unproven crop or source text is drawn)
  // (the memory contract, the 1b design §3: each page's analysis state let go once it is laid and read by nothing more, each
  // unit's once it is painted; the units' records and the audit, the gate's, not kept: their counts alone)
  const common = { units: [], expect, groups, target, scale: SCALE, dpr: 1, copy: false, free: true, records: false, proof: true, labels: { captions: CAPTIONS }, rules, faceSources, hyphUrl, onStep: () => evaluate() }
  run = await openProto(four
    ? {
        ...common, parts: true, doc, pages: index.head.paper.pages, onRetired,
        geometry: { schema: 1, kinds: index.kinds.map(k => k ?? ''), left: { pages: [], units: [] } },
        tex: { ...HYBRID, index: facade.index, pieces: new Map() },
        removal: { mode: 'draw', doc, manifest: { schema: 1, removal: index.head.versions.removal, pages: index.head.paper.pages, sets: {}, page: {} } },
      }
    : {
        ...common, doc, pages: Number.POSITIVE_INFINITY, onRetired: onRetired ?? null,
        geometry: { schema: 1, kinds: bundle.left.kinds, left: { pages: bundle.left.pages, units: bundle.left.units } },
        tex: bundle.layout ? { ...HYBRID, index: indexLayout(bundle.layout), pieces: new Map() } : null,
        removal: bundle.addon ? { mode: 'draw', doc, manifest: bundle.addon.manifest } : null,
      })
  const N = run.N
  told = new Uint8Array(N + 1)
  if (!four) { addShapes(shapes, bundle.left.units); chain.through = N }

  const live = () => { if (disposed) throw letGoError() }
  const pageIn = page => { if (!Number.isSafeInteger(page) || page < 1 || page > N) throw new RangeError(`page: 1 to ${N}, not ${typeof page === 'number' ? page : kindOf(page)}`) }
  /** a ready page as a host keeps it: a new element made of the page's kept markup (run.svgOf: no layout, face, ink or PDF.js
   *  call), its lang set; its word table, a copy of the page's kept record (run.wordsOf: no array is the run's, the host may
   *  transfer or free them; an empty table for a page with none painted); links new empty data until the engine's 3a (their
   *  shape is fixed now). The run holds no element of a page: a host drops a far page's and asks again */
  const fresh = (page, lang) => {
    const r = run.rows[page - 1]
    const svg = run.svgOf(page)
    svg.setAttribute('lang', lang)
    return { svg, w: r.w, h: r.h, words: run.wordsOf(page), links: [] }
  }
  const off = a => { if (a.signal && a.onAbort) a.signal.removeEventListener('abort', a.onAbort) }

  // ---- readiness: one pass over the pages, after each event (the door design §3), and the drive: one target at a time, laid
  // by its closure alone (run.layFor; the 1b-D design §2.2)
  /** each live ask's turn (the newest last), and the pages told laying in the order they were (the oldest first), each with
   *  how many asks taken after it it waits behind */
  let seq = 0
  const askedAt = new Map(), committed = new Map()
  /** what the drive lays next, and why: (1) the newest live ask whose closure has all it needs (its parts and rows in), (2) a
   *  page told laying and not ready yet, the oldest first (a state never goes back: a page told laying is laid before the
   *  drive is idle), (3) the newest live ask whose closure waits for a part or a row: the work it can do meanwhile (page 1,
   *  its covered pages, its rows in), the run waiting inside. A newer ask overtakes at the next unit or page, but a page told
   *  laying waits behind one newer ask at most (OVERTAKEN): while one does, no newer ask is taken, so that a reader who keeps
   *  scrolling never starves a page whose host's stall clock runs from `laying` */
  const pick = () => {
    const held = [...committed].some(([q, c]) => told[q] === LAYING && c.behind >= OVERTAKEN)
    let newest = null, ready = null
    for (const [q, at] of askedAt) {
      if (told[q] >= READY) continue
      if (newest === null || at > askedAt.get(newest)) newest = q
      // (a page not taken yet waits while a page told laying has waited enough)
      if ((ready === null || at > askedAt.get(ready)) && (told[q] === LAYING || !held) && run.inputs(q)) ready = q
    }
    if (ready !== null) return { page: ready, take: told[ready] === WAITING }
    for (const q of committed.keys()) if (told[q] === LAYING) return { page: q, take: false }
    return newest === null ? null : { page: newest, take: false }
  }
  /** the drive's page, and a page taken (told laying, with every page its closure makes ready that has all it needs too, in
   *  page order) when the drive turns to it with its inputs in: not at its ask, so that an ask a newer one overtakes before the
   *  drive reaches it commits nothing (pageof-contract §7); every page told laying before it now waits behind it */
  let current = null
  const take = p => {
    if (told[p] !== WAITING) return
    for (const [q, c] of committed) if (told[q] === LAYING) c.behind++
    for (const q of run.closure(p).ready) {
      if (told[q] !== WAITING || (q !== p && !run.inputs(q))) continue
      told[q] = LAYING
      committed.set(q, { at: seq++, behind: 0 })
      for (const l of [...listeners]) { try { l(q, 'laying') } catch { /* a listener's own error */ } }
    }
  }
  let evaluating = false, again = false
  const step = () => {
    const changes = []
    for (let p = 1; p <= N; p++) {
      if (told[p] >= READY) continue
      if (run.failed(p)) { told[p] = FAILED; committed.delete(p); changes.push([p, 'failed']); continue }
      if (run.ready(p)) {
        if (told[p] === WAITING) changes.push([p, 'laying'])
        told[p] = READY
        committed.delete(p)
        changes.push([p, 'ready'])
      }
    }
    for (const [p, state] of changes) {
      if (state === 'laying') continue
      const list = asks.get(p)
      if (!list) continue
      asks.delete(p)
      askedAt.delete(p)
      for (const a of list) {
        off(a)
        if (state === 'ready') a.resolve(fresh(p, a.lang))
        else a.reject(new Error(`page ${p} failed: ${run.through < p ? 'no part covers it' : 'its page could not be drawn'}`))
      }
    }
    // (told once the state has changed: a call a listener makes runs after, and a listener that throws stops no other)
    for (const [p, state] of changes) for (const l of [...listeners]) { try { l(p, state) } catch { /* a listener's own error */ } }
  }
  /** a run that cannot go on (a memory error, or any other the drive meets): the layer is done. Every page not ready is told
   *  failed, once; every ask and wait for a left page rejects with the error, as every later one does at once */
  const die = e => {
    if (dead || disposed) return
    dead = e
    for (const [, list] of asks) for (const a of list) { off(a); a.reject(e) }
    asks.clear()
    askedAt.clear()
    committed.clear()
    for (const [, list] of leftWaiters) for (const w of list) w.no(e)
    leftWaiters.clear()
    goneNow(e)
    const changes = []
    for (let p = 1; p <= N; p++) if (told[p] < READY) { told[p] = FAILED; changes.push(p) }
    for (const p of changes) for (const l of [...listeners]) { try { l(p, 'failed') } catch { /* a listener's own error */ } }
  }
  const evaluate = () => {
    if (disposed || !told || dead) return
    if (evaluating) { again = true; return }
    evaluating = true
    try {
      do {
        again = false
        step()
        // (the drive's page taken where it is the drive's already, or the drive is idle and turns to it now)
        const t = pick()
        if (t?.take && (current === null || current === t.page)) take(t.page)
      } while (again && !disposed)
    } finally { evaluating = false }
    // (a drive waiting in another page's closure looks again at what it lays)
    if (driving && pick()?.page !== current) run.poke()
    drive()
  }
  // ---- the drive: one target at a time, its closure laid until it is ready, failed or overtaken (`still`)
  let driving = false
  const drive = () => {
    if (driving || disposed || !pick()) return
    driving = true
    void (async () => {
      try {
        for (let t = pick(); t && !disposed; t = pick()) {
          if (t.take) take(t.page)
          current = t.page
          await run.layFor(t.page, () => !disposed && pick()?.page === t.page)
          current = null
          if (disposed) return
          evaluate()
        }
      } catch (e) { die(e) } finally { driving = false; current = null }
    })()
  }

  // ---- the left
  /** the page's left part, fetched once (a fetch that fails is not kept) and read against the streams told */
  const fetchLeft = page => {
    let p = leftCache.get(page)
    if (p) return p
    const ref = leftRefs.get(page)
    p = (async () => {
      const bytes = await Promise.race([leftPart(page, ref), gone])
      if (disposed) throw letGoError()
      return readLeftPart(bytes, { ref, streamOf: id => streamOf.get(id) })
    })()
    leftCache.set(page, p)
    p.catch(() => { if (leftCache.get(page) === p) leftCache.delete(page) })
    return p
  }
  /** an ask of a promise that its signal may end (the promise itself goes on for the others) */
  const withSignal = (p, signal) => (!signal ? p : new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(v => { signal.removeEventListener('abort', onAbort); resolve(v) }, e => { signal.removeEventListener('abort', onAbort); reject(e) })
  }))

  // ---- the parts
  const tell = part => {
    facade.add(part)
    run.grow(part)
    for (const [id, stream] of part.left) streamOf.set(id, stream)
    addShapes(shapes, part.left)
    for (const ref of part.leftParts) leftRefs.set(ref.page, ref)
    chain.through = part.pages[1]
    chain.last = part.sha256
    chain.r = part.chain.r
    toldParts.add(part.sha256)
    for (const [page, list] of [...leftWaiters]) if (page <= chain.through) { leftWaiters.delete(page); for (const w of list) w.go() }
  }
  for (const part of parts) if (!toldParts.has(part.sha256)) tell(part)

  return {
    take(rows) {
      if (disposed) return { complete: [] }
      const got = new Map()
      for (const row of rows) {
        const u = unitOf(source, row)
        if (u) got.set(row[0], u)
        else dropped++
      }
      const out = run.take(got)
      evaluate()
      return out
    },
    end() { if (!disposed) { run.end(); evaluate() } },
    addPart(part, o = {}) {
      if (disposed || dead) return
      if (part !== null && typeof part === 'object' && toldParts.has(part.sha256)) return
      if (run.partsEnded) throw new BundleRefusal('the parts have ended', { kind: 'part', path: '' })
      checkPart(part, index, chain)
      const doc = o?.doc
      if (part.addon?.tail) {
        if (!isDocument(doc)) throw new TypeError(`doc: a part with a tail needs the composed document through it, not ${kindOf(doc)}`)
        if (doc.numPages !== N + part.chain.r) throw new BundleRefusal(`the document has ${doc.numPages} pages, not ${N + part.chain.r}`, { kind: 'part', path: 'doc' })
      } else if (doc !== undefined) throw new TypeError('doc: a document with a part that has no tail')
      tell(part)
      if (part.addon?.tail) run.swap(doc)
      evaluate()
    },
    endParts() {
      if (disposed || dead || run.partsEnded) return
      run.endParts()
      for (const [page, list] of [...leftWaiters]) if (page > chain.through) { leftWaiters.delete(page); for (const w of list) w.no(new Error(`page ${page} is covered by no part`)) }
      evaluate()
    },
    pageState(page) {
      live()
      pageIn(page)
      return STATES[told[page]]
    },
    rowsFor(page) {
      live()
      pageIn(page)
      return told[page] >= READY ? [] : run.rowsFor(page)
    },
    onPage(listener) {
      if (typeof listener !== 'function') throw new TypeError(`listener: a function, not ${kindOf(listener)}`)
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    pageOf(page, { lang, signal } = {}) {
      live()
      pageIn(page)
      if (typeof lang !== 'string') throw new TypeError(`lang: a language tag, not ${kindOf(lang)}`)
      if (signal?.aborted) return Promise.reject(abortError())
      if (dead && told[page] !== READY) return Promise.reject(dead)
      if (told[page] === FAILED) return Promise.reject(new Error(`page ${page} failed`))
      // (answered in a microtask: a dispose or an abort in between rejects it, as they reject every pending ask)
      if (told[page] === READY) return Promise.resolve().then(() => { live(); if (signal?.aborted) throw abortError(); return fresh(page, lang) })
      return new Promise((resolve, reject) => {
        const a = { resolve, reject, lang, signal, onAbort: null }
        if (signal) {
          a.onAbort = () => {
            const list = asks.get(page)
            if (!list?.delete(a)) return
            // (no asker left: the page leaves the targets, unless it was told laying already)
            if (!list.size) { asks.delete(page); askedAt.delete(page) }
            reject(abortError())
            evaluate()
            run.poke()
          }
          signal.addEventListener('abort', a.onAbort, { once: true })
        }
        ;(asks.get(page) ?? asks.set(page, new Set()).get(page)).add(a)
        // (the page's turn: its newest ask's)
        askedAt.set(page, seq++)
        evaluate()
      })
    },
    leftPageOf(page, { signal } = {}) {
      live()
      pageIn(page)
      if (signal?.aborted) return Promise.reject(abortError())
      if (dead) return Promise.reject(dead)
      if (!four) return Promise.reject(new Error('leftPageOf: a bundle 3 layer has no left parts'))
      if (page <= chain.through) return withSignal(fetchLeft(page), signal)
      if (run.partsEnded) return Promise.reject(new Error(`page ${page} is covered by no part`))
      // (wait for the part that covers it; once no asker is left, nothing is fetched)
      return new Promise((resolve, reject) => {
        const w = {
          go: () => { off(w); withSignal(fetchLeft(page), signal).then(resolve, reject) },
          no: e => { off(w); reject(e) },
          signal, onAbort: null,
        }
        if (signal) {
          w.onAbort = () => {
            const list = leftWaiters.get(page)
            const at = list ? list.indexOf(w) : -1
            if (at < 0) return
            list.splice(at, 1)
            if (!list.length) leftWaiters.delete(page)
            reject(abortError())
          }
          signal.addEventListener('abort', w.onAbort, { once: true })
        }
        ;(leftWaiters.get(page) ?? leftWaiters.set(page, []).get(page)).push(w)
      })
    },
    copyOf(page, source, k) {
      live()
      pageIn(page)
      if (!(typeof k === 'number' && Number.isFinite(k) && k > 0)) return Promise.reject(new RangeError(`k: device pixels a PDF unit, not ${typeof k === 'number' ? k : kindOf(k)}`))
      const w = source?.width, h = source?.height
      if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1) return Promise.reject(new TypeError(`source: a page drawn on a canvas, not ${kindOf(source)}`))
      if (told[page] !== READY) return Promise.reject(new Error(`copyOf: page ${page} is not laid (${STATES[told[page]]})`))
      return (async () => {
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        await run.drawCopy(page, canvas.getContext('2d'), source, k)
        // (let go while it was drawn: no canvas after dispose, as no page)
        if (disposed) { canvas.width = 0; canvas.height = 0 }
        live()
        return canvas
      })()
    },
    unitAt(page, x, y) {
      if (!Number.isSafeInteger(page) || page > chain.through || !Number.isFinite(x) || !Number.isFinite(y)) return null
      let best = null, area = Number.POSITIVE_INFINITY
      for (const [id, x0, y0, x1, y1] of shapes.get(page) ?? []) {
        if (x < x0 || x > x1 || y < y0 || y > y1) continue
        const a = (x1 - x0) * (y1 - y0)
        if (a < area || (a === area && id < best)) { best = id; area = a }
      }
      return best
    },
    stats() {
      const pages = [], pageMs = {}
      for (let p = 1; p <= N; p++) {
        if (told[p] === READY) pages.push(p)
        if (run.pageMs[p] !== undefined) pageMs[p] = run.pageMs[p]
      }
      let slowestTaskMs = 0
      for (const ms of run.ms.values()) if (ms > slowestTaskMs) slowestTaskMs = ms
      return { units: expect.length, drawn: run.drawn, pages, slowestTaskMs, pageMs, dropped, rules: { schema: run.rules.schema, version: run.rules.version }, parts: { through: chain.through, told: toldParts.size } }
    },
    dispose() {
      if (disposed) return
      disposed = true
      const e = letGoError()
      for (const [, list] of asks) for (const a of list) { off(a); a.reject(e) }
      asks.clear()
      askedAt.clear()
      committed.clear()
      for (const [, list] of leftWaiters) for (const w of list) w.no(e)
      leftWaiters.clear()
      goneNow(e)
      listeners.clear()
      run.dispose()
      if (opened === token) opened = null
    },
  }
}

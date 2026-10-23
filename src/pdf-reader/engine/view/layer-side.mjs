// The layer's side of the reading view (the shared reader view's contract §1.2, §2.2–§2.7, §3; docs/PDF-READER.md §11.8): the
// one sink of a paper's layer. The host tells it what it hears (refs, rows, ends) and gives it a transport and two openers; the
// side fetches and reads through its feed (feed.mjs), binds the base, waits for the original, opens the composed document and
// the engine's door over it, adds each later part in page order,
// takes the rows, ends the parts. A fork of the chain, or a later attempt (again), opens the door again: one open layer a page.
//
// What the right pane shows, page by page, is the best version there is (§2.3): a place shows its pre-layer content (the
// original's page view, else the skeleton: places.mjs) until the door has laid its page and the place is near the view; then
// the layer's copy and SVG, committed in one task, in place, the place's size and the pane's scroll unchanged (places.mjs
// swap). A laid page leaving the view lets go its SVG and its copy (retired: an empty element holds the place, so that no
// page view is made of it again); a page the door makes ready while it is far is retired at once, so that coming near it is
// asked and committed with no original drawn first. A page that fails, or that is asked, told `laying` and not laid within
// PAGE_MS, shows the original (a stall warns once a side and is asked again on the next scroll; a failure on a zoom or on
// coming near again); a late `ready` is taken. A page still `waiting` (for its part, its closure or its rows) is never a stall.
//
// A page's copy is always drawn from the composed document (our wrapped base, whole or as a delta): render A, the page with the
// groups of the units drawn there hidden (docs/route/ocg-erasure.md §4), never taken from the left's canvas or the place's (the
// original's page view). A page whose parts all record no layout (a part the engine's check refused)
// is not asked of the door and not swapped in: its place keeps the original's page, since what TeX's positions do not draw is
// shown as arXiv's PDF, not as our base page in other line breaks beside it.
//
// The highlight's data (§2.7): the left's shapes made page by page from the parts' rectangles and, on the first want of a page
// from either pane (trap 2: nothing fetched before), its left part; the right's the left's mirrored where its place shows the
// original and its own over the laid page's words where it shows the layer, with copies of the left's tokens for the units it
// shows as the original's (shapes.mjs layerShapes: trap 1). Sentences where both panes have a unit's starts. The contents
// (contents.mjs) and the heading read are told on the view's channel. Lifted, for the drawing over the places, from the web's
// web/src/layer/side.ts (drawOver: the copy's source and resolution, the stall, the copies let go) and, for the document's
// open and the open again, from its visit.ts.
import { layerDraws } from '../layer-proto/format.mjs'
import { pagesOf } from '../layout/delta-wire.mjs'
import { openLayer as theDoor, PDF_OPTIONS } from '../layer-proto/reader.mjs'
import { visibilityOf } from '../layer-proto/visibility.mjs'
import { unitOf } from '../layer-proto/rows.mjs'
import { plainTranslated } from '../translate/mt.mjs'
import { createContents } from './contents.mjs'
import { createFeed } from './feed.mjs'
import { figureRegions } from './figures.mjs'
import { pathsOf, wantsFloats } from './floats.mjs'
import { internalsOf } from './reader-view.mjs'
import { bySentence } from './highlight.mjs'
import { createShapes, layerShapes } from './shapes.mjs'

/** how long a page asked for, once told `laying`, may take to be laid before its place shows the original (the web's D5-R7d) */
export const PAGE_MS = 30_000
/** the most pixels a copy is drawn at (iOS's canvas cap; PDF.js's own canvases are capped so too) */
export const COPY_PIXELS = 2 ** 24
/** how long after a zoom's last step the copies are drawn again: PDF.js draws its own pages 400 ms after it */
export const RECOPY_MS = 600
/** the longest a laid page's copy waits for the left's page to be drawn before it is put in place (layer-side commit): the two
 *  panes paint within one frame of each other, the left first, unless the left is slower than this */
export const LEFT_WAIT_MS = 1500
/** how long after a left part's fetch or read fails it is asked again, on a want of its page: a failure may be the network's,
 *  or the part's own, which asking on every pointer frame would only repeat */
export const LEFT_RETRY_MS = 10_000
/** the most other pages a wanted page's running units bring their left parts from (spreadFrom), the nearest first: a unit over
 *  many pages would otherwise fetch every one at once. On the 54 papers of the sweep a page brought at most 3 (2026-10-19) */
export const SPREAD_MAX = 8
/** the pages whose left parts page p's running units (`ids`) bring: of the others of each unit's pages (`pagesOf`), each once,
 *  the `max` nearest p, nearest first, those not in yet (`isIn`): the same pages however many have come */
export function spreadPages(p, ids, pagesOf, isIn, max = SPREAD_MAX) {
  const out = new Set()
  for (const id of ids) for (const q of pagesOf(id) ?? []) if (q !== p) out.add(q)
  return [...out].sort((a, b) => Math.abs(a - p) - Math.abs(b - p) || a - b).slice(0, max).filter(q => !isIn(q))
}
/** the pages wanted last whose geometry is kept beside the near ones (§3.2) */
const WANTED_KEPT = 20
/** the commits the probe keeps */
const RING = 32
const isAbort = e => e?.name === 'AbortError'
/** an error tagged with the side's code for why there is no layer (a BundleRefusal's own `why` is its message) */
const coded = (e, code) => { const out = e instanceof Error ? e : new Error(String(e ?? code)); out.axtCode ??= code; return out }
const release = c => { if (c) { c.width = 0; c.height = 0; c.remove() } }
const isPrefix = (a, b) => a.length <= b.length && a.every((p, i) => p.sha256 === b[i].sha256)

/** whether a layout part has lines on page `n` (its `lines`: per unit, rows of 8 numbers, the first the page) */
const linesOn = (layout, n) => (layout.lines ?? []).some(([, rows]) => { for (let i = 0; i < rows.length; i += 8) if (rows[i] === n) return true; return false })

/** whether page `n` is laid by no layout: some part owns the page (by its `pages`) and no part that holds it has a layout. A part
 *  holds a page by its pages, and also by its reach (`reach`: the last page its views and its layout run to) where its layout has
 *  lines there: a unit that runs on from a page of one part onto the next page is drawn there by the first part's layout, whose pages
 *  end before it, so such a part makes the page a laid one whatever the part that owns it records (a part whose views reach a page
 *  its layout draws nothing on does not; nor does the part that owns it, where its layout has no lines there: a page whose words
 *  are not arXiv's page's lays no unit, and shows arXiv's page). `layout` null: the engine's check refused the part, or its producer recorded none. A page
 *  no part owns yet (its part not told) is not this, the door waits for it: a part that only reaches it does not make it the
 *  original's, since the part that owns it may come with a layout. The parts are in page order, so every part that can reach a page
 *  is read before the one that owns it */
export function noLayoutPage(parts, n) {
  let owned = false
  for (const p of parts) {
    if (n < p.pages[0] || n > Math.max(p.pages[1], p.reach ?? 0)) continue
    const own = n <= p.pages[1]
    if (p.layout !== null && linesOn(p.layout, n)) return false
    if (own) owned = true
  }
  return owned
}

/** the operator list PDF.js drew a page by, where its drawing is whole (the floats' inputs); null else */
function drawnList(pdfPage) {
  for (const st of pdfPage?._intentStates?.values?.() ?? []) if (st.displayReadyCapability && st.operatorList?.lastChunk) return st.operatorList
  return null
}

/** the layer side of `view`; `o` its options (LayerSideOptions; `openLayer`, the door, the tests') */
export function createLayerSide(view, o) {
  const V = internalsOf(view)
  const open = o.openLayer ?? theDoor
  const clock = V.clock
  const ac = new AbortController()
  let disposed = false
  const detach = V.attach({ dispose: () => side.dispose() })
  const warned = new Set()
  const warn = (what, e) => { if (warned.has(what)) return; warned.add(what); console.warn(`[reader] the layer's ${what}:`, e?.message ?? e) }

  // ---------------------------------------------------------------- the door and its documents
  /** 'idle' (nothing read yet), 'opening', 'open', 'refused' */
  let state = 'idle', why = null
  let index = null, bound = null, door = null, doorParts = [], gen = 0, offPage = null
  /** whether the layer is drawn over our own compile (the head's base says `ours`: the layer route, design §3.2; the engine's
   *  layerDraws, format.mjs): the composed document's pages are then OUR base's, whose lines are not arXiv's page's, so a page's copy comes
   *  from the composed document alone and a page laid by no layout is the original's page */
  const oursBase = () => layerDraws(index?.head?.base)
  /** whether page `n` is one the composed document draws as ours: a base held whole is ours on every page; a base held as a delta over
   *  arXiv's PDF (`kind` 'delta') is ours on its replaced pages (`base.replaced`, ranges) alone and the original's own bytes on every
   *  other (its annotations then the original's own, drawn in the copy) */
  let replacedOf = null, replacedPages = null
  const replacedPage = n => {
    const b = index?.head?.base
    if (b?.kind !== 'delta') return true
    if (replacedOf !== b) { replacedOf = b; replacedPages = new Set(pagesOf(b.replaced ?? [])) }
    return replacedPages.has(n)
  }
  /** whether page `n` stays the original's page: the layer is over our base and the parts that hold the page have no layout (a
   *  page the door would lay with nothing drawn and nothing erased: our base page, in other line breaks, beside arXiv's) */
  const originalPageOf = n => oursBase() && noLayoutPage(feed.state().parts, n)
  let partsEnded = false, reopenWanted = false
  /** the part the open door refused (its later parts not added to it) */
  let stuck = null
  /** the composed documents opened: each its task, its document once open, the holders that read it (the side's own hold on
   *  the latest, each door that was given it), and whether its task is destroyed (once) */
  const entries = new Set(), byDoc = new Map()
  let latest = null
  function destroy(entry) {
    if (entry.gone) return
    entry.gone = true
    entries.delete(entry)
    if (entry.doc) byDoc.delete(entry.doc)
    void Promise.resolve().then(() => entry.task.destroy?.()).catch(() => {})
  }
  function letGo(entry, holder) {
    if (!entry || entry.gone) return
    entry.holders.delete(holder)
    if (!entry.holders.size) destroy(entry)
  }
  /** the composed document: the latest again where it is open; else opened, the side's hold moved to it, and its one configuration
   *  of optional content read at once (visibility.mjs: every render of it passes that one) */
  async function composedFor() {
    if (latest && !latest.gone) return latest.doc
    // (the opener's first argument was a tail of removed pages: there are none, the composed document is the base alone)
    const task = o.composed(null, Object.freeze({ ...V.assets, ...PDF_OPTIONS, disableAutoFetch: true }))
    if (!task?.promise) throw new Error('the composed opener gave no loading task')
    const entry = { task, doc: null, holders: new Set(['side']), gone: false }
    entries.add(entry)
    counts.composed++
    let doc
    try { doc = await task.promise } catch (e) { destroy(entry); throw e }
    if (disposed || entry.gone) { destroy(entry); throw new Error('the layer side is disposed') }
    entry.doc = doc
    byDoc.set(doc, entry)
    void visibilityOf(doc).ready
    const was = latest
    latest = entry
    letGo(was, 'side')
    return doc
  }
  const held = (doc, holder) => byDoc.get(doc)?.holders.add(holder)
  const retired = (doc, holder) => letGo(byDoc.get(doc), holder)

  function refuse(w, e) {
    if (disposed || state === 'refused') return
    state = 'refused'
    why = w
    warn(`open (${w})`, e ?? new Error(w))
    const was = door
    door = null
    offPage?.()
    try { was?.dispose() } catch { /* the door's own */ }
    for (const n of pages.keys()) { abortAsk(n); unlay(n) }
    // nothing more is read: the feed's fetches and the left parts' let go, the latest composed document with them (the
    // door told retired lets go its own), the right's shapes the original's again, as its places are
    feed.dispose()
    leftAc.abort()
    letGo(latest, 'side')
    if (right) { right.reset(); startsFor([...rows.keys()]) }
    emitLayer()
  }

  // ---------------------------------------------------------------- the feed and the order of things (§2.2)
  const feed = createFeed({ fetchObject: o.fetchObject, changed: () => { void pump() }, warn: (what, e) => warn(what, e) })
  let pumping = false, pumpAgain = false
  async function pump() {
    if (pumping) { pumpAgain = true; return }
    pumping = true
    try {
      do { pumpAgain = false; await step() } while (pumpAgain && !disposed)
    } catch (e) {
      if (!disposed && !isAbort(e)) refuse(e?.axtCode ?? 'open', e)
    } finally { pumping = false }
  }
  async function step() {
    if (disposed || state === 'refused') return
    const f = feed.state()
    if (f.refused) return refuse(f.refused)
    if (!f.index) return
    if (!index) indexed(f.index)
    // the original open before the first open: the places are its pages, and the extension's base check reads its bytes or
    // its end (the web's is bound by its route). Once a door is open, a dropped original stops nothing: the door reads the
    // composed document
    if (!V.left.doc() && !counts.opens) return
    if (bound === null) {
      state = 'opening'
      emitLayer()
      bound = await Promise.resolve().then(() => o.bind(index.head.base)).then(v => v === true, () => false)
      if (disposed) return
      if (!bound) return refuse('base')
    }
    shapeParts(f.parts)
    const parts = f.parts
    // a fork; or parts past the end the door was told (a later build's): the door opened again over every part
    const outgrown = partsEnded && parts.length > doorParts.length
    if (!door || reopenWanted || !isPrefix(doorParts, parts) || outgrown) {
      if (door && !reopenWanted) counts.forks++
      await reopen(parts)
      if (!door) return
    }
    for (let i = doorParts.length; i < parts.length && door && !stuck; i++) {
      const part = parts[i]
      try {
        door.addPart(part)
      } catch (e) {
        if (e?.axtCode) throw e
        // the door refuses the part: the chain stops at the part before it on this door, its later pages the original's
        stuck = part.sha256
        warn('part', e)
        break
      }
      doorParts = parts.slice(0, i + 1)
      counts.added++
    }
    if (f.ended && door && !partsEnded && !stuck && doorParts.length === parts.length) { partsEnded = true; door.endParts() }
  }
  /** the door opened (again): the one open disposed first, its pages kept as drawn until the new door's are ready (DR7); the
   *  rows held taken, or after a fork every row so far (a later attempt's, again(), carries none) */
  async function reopen(parts) {
    const my = ++gen
    reopenWanted = false
    const was = door
    door = null
    doorParts = []
    partsEnded = false
    stuck = null
    rowsTold = false
    offPage?.()
    offPage = null
    if (was) { try { was.dispose() } catch (e) { warn('dispose', e) } }
    leftAc.abort()
    leftAc = new AbortController()
    for (const p of leftAsked) if (!left?.has(p)) leftAsked.delete(p)
    // (a fetch this aborts is asked again: the pages wanted spread again on their next want)
    spread.clear()
    for (const n of pages.keys()) { abortAsk(n); const P = pages.get(n); if (P.content && !P.content.wrap) unlay(n); P.failed = false; P.stalled = false }
    rearm.clear()
    ready = 0
    failed = 0
    right?.reset()
    shapesChanged()
    state = 'opening'
    emitLayer()
    const doc = await composedFor().catch(e => { throw coded(e, 'composed') })
    if (disposed || my !== gen) return
    const me = {}
    let layer
    try {
      layer = await open({
        index, doc, parts, target: o.target, faceSources: o.faceSources, hyphUrl: o.hyphUrl, ...(o.rules ? { rules: o.rules } : {}), OPS: V.lib?.OPS ?? null,
        // (the left parts' fetches go with the door's generation: a reopen, a refusal or the dispose aborts them)
        leftPart: (_page, ref) => o.fetchObject(ref, leftAc.signal),
        onRetired: d => retired(d, me),
      })
    } catch (e) { throw coded(e, 'open') }
    if (disposed || my !== gen) { layer.dispose(); return }
    door = layer
    doorParts = parts
    held(doc, me)
    counts.opens++
    offPage = door.onPage((p, s) => told(my, p, s))
    // (after a fork every row so far: the units are the head's, the same; again() has let them go)
    if (rows.size) { try { door.take([...rows.values()]) } catch (e) { warn('rows', e) } }
    if (rowsEnded) { rowsTold = true; door.end() }
    state = 'open'
    emitLayer()
    for (const p of wantsBefore) want(p)
    wantsBefore.clear()
    for (let n = 1; n <= V.places.count(); n++) if (V.places.near(n)) askSoon(n)
  }

  // ---------------------------------------------------------------- the rows
  /** the rows of the attempt, latest per unit (held until the door opens, and for the contents and the starts); whether they
   *  have ended, and whether the door was told */
  const rows = new Map()
  let rowsEnded = false, rowsTold = false

  // ---------------------------------------------------------------- the pages (§2.3)
  /** each page's record, scalars and the elements of a near laid page only: its ask (and its clock), what its place shows of
   *  the layer (`content`: its wrapper — the copy, the SVG and the page's links —, SVG, copy and k, the door's generation it was
   *  drawn from; or `wrap` null for an empty element, retired), whether it failed or stalled, a copy under way */
  const pages = new Map()
  const rec = n => { let P = pages.get(n); if (!P) { P = { ask: null, clock: 0, content: null, failed: false, stalled: false, copying: false, again: false }; pages.set(n, P) } return P }
  let ready = 0, failed = 0, stalls = 0
  const rearm = new Set()
  const counts = { asked: 0, commits: 0, retired: 0, copies: 0, composed: 0, opens: 0, added: 0, leftParts: 0, forks: 0 }
  const ring = []
  const empty = () => { const e = document.createElement('div'); e.className = 'axt-layer axt-layer-retired'; return e }

  function told(my, n, s) {
    if (disposed || my !== gen) return
    const P = rec(n)
    if (s === 'laying') { if (P.ask) clockOn(n); return }
    clockOff(n)
    if (s === 'ready') {
      // (a page the door lays that stays the original\'s, a part with no layout, is not a page the layer laid)
      if (!originalPageOf(n)) ready++
      // a page made ready far from the view: nothing of the original drawn there again, its layer asked on coming near
      if (!V.places.near(n) && !P.ask) retire(n)
    } else {
      failed++
      P.failed = true
      shownOriginal(n)
    }
    emitLayer(true)
  }
  function clockOn(n) {
    const P = rec(n), my = gen
    if (P.clock) return
    P.clock = clock.later(() => { P.clock = 0; stalled(n, my) }, PAGE_MS)
  }
  function clockOff(n) { const P = pages.get(n); if (P?.clock) { clock.clear(P.clock); P.clock = 0 } }
  function abortAsk(n) { const P = pages.get(n); if (!P) return; clockOff(n); P.ask?.abort(); P.ask = null }
  /** a page asked, told `laying` and not laid within PAGE_MS: its place the original's, one warning a side, asked again on
   *  the next scroll; its late answer still taken */
  function stalled(n, my) {
    if (disposed || my !== gen) return
    const P = rec(n)
    if (P.content?.wrap && P.content.gen === gen) return
    P.stalled = true
    stalls++
    rearm.add(n)
    warn('wait', new Error(`page ${n} was not laid within ${PAGE_MS} ms: its place shows the original's page`))
    shownOriginal(n)
  }
  /** a page whose layer is not coming now: its place back to its pre-layer content where it holds the layer's */
  function shownOriginal(n) {
    const P = rec(n)
    if (P.content && (P.content.gen !== gen || !P.content.wrap)) unlay(n)
    // the right's shapes there the original's again, as its place is
    if (right?.hide(n)) startsFor([...rows.keys()])
  }
  /** what the place shows of the layer let go, the place back to its pre-layer content */
  function unlay(n) {
    const P = pages.get(n)
    if (!P?.content) return
    release(P.content.copy)
    P.content = null
    V.places.restore(n)
  }
  /** the laid pages far from the view kept for the focus inside them (a link, or the place a jump gave it to): retiring one
   *  would take the focused element out of the document, and the focus with it to the document's body. Each is retired once
   *  the focus has left it, if it is far still */
  const keptForFocus = new Set()
  const holdsFocus = n => { const div = V.places.page(n), at = document.activeElement; return !!div && !!at && at !== document.body && div.contains(at) }
  /** a page far from the view let go as the near handler lets it go: retired where this door laid it, else back to its own
   *  content; held instead while it holds the focus */
  function farGone(n) {
    const c = pages.get(n)?.content
    if (!c?.wrap) return
    if (holdsFocus(n)) { keptForFocus.add(n); return }
    if (c.gen === gen) retire(n); else unlay(n)
  }
  // The focus's move read a task later, never in a microtask: on a native Tab Chromium clears the focus, tells focusout and
  // runs its microtasks before the focus arrives at the next element, so a microtask's look sees <body> and would let go
  // the very page the focus is moving to. A focusout whose related target is inside a held page asks nothing
  let focusCheck = 0
  const focusMoved = () => {
    if (focusCheck || disposed) return
    focusCheck = clock.later(() => {
      focusCheck = 0
      if (disposed) return
      for (const n of [...keptForFocus]) {
        if (holdsFocus(n)) continue
        keptForFocus.delete(n)
        if (!V.places.near(n)) farGone(n)
      }
    }, 0)
  }
  document.addEventListener('focusin', () => { if (keptForFocus.size) focusMoved() }, { capture: true, signal: ac.signal })
  document.addEventListener('focusout', e => {
    if (!keptForFocus.size) return
    const to = e.relatedTarget
    if (to instanceof Node && [...keptForFocus].some(n => V.places.page(n)?.contains(to))) return
    focusMoved()
  }, { capture: true, signal: ac.signal })
  /** a laid page far from the view: its SVG and copy let go, an empty element in its place (no page view made of it); one
   *  that holds the focus is kept until the focus leaves it (keptForFocus) */
  function retire(n) {
    const P = rec(n)
    for (const ac of P.copyAcs ?? []) ac.abort()
    if (P.content && !P.content.wrap) return
    if (holdsFocus(n)) { keptForFocus.add(n); return }
    keptForFocus.delete(n)
    const was = P.content
    P.content = { wrap: null, svg: null, copy: null, k: 0, gen }
    if (V.places.swap(n, empty(), { blank: true })) counts.retired++
    else P.content = null
    release(was?.copy)
  }
  /** the near pages to ask, asked together once the places told have all been heard: the farthest from the page in the
   *  middle of the view first and that page last, the door laying the newest ask first (D1), so that the page the reader is
   *  looking at is laid first; the door takes the others in the order asked, so at an equal distance the page ahead is
   *  asked first, and laid next. Asked in page order, a jump to page 20 laid 21, then 19, then 20 */
  const toAsk = new Set()
  let askQueued = false
  function askSoon(n) {
    toAsk.add(n)
    if (askQueued) return
    askQueued = true
    queueMicrotask(() => {
      askQueued = false
      if (disposed) { toAsk.clear(); return }
      const c = V.centre(), far = n => (c ? Math.abs(n - c) : -n)
      const order = [...toAsk].sort((a, b) => far(b) - far(a) || b - a)
      toAsk.clear()
      for (const p of order) ask(p)
    })
  }
  /** a near page asked of the door (once a door), unless it shows this door's layer */
  function ask(n) {
    const P = rec(n)
    if (!door || disposed || !V.places.near(n)) return
    if (P.content?.wrap && P.content.gen === gen) return
    // a page of parts with no layout is not asked: the original's page, as the owner decided (what TeX's positions do not draw is
    // arXiv's PDF)
    if (originalPageOf(n)) { shownOriginal(n); return }
    if (P.ask) return
    const my = gen, a = new AbortController()
    P.ask = a
    counts.asked++
    let st
    try { st = door.pageState(n) } catch { P.ask = null; return }
    if (st === 'laying') clockOn(n)
    door.pageOf(n, { lang: o.target, signal: a.signal }).then(laid => {
      if (P.ask === a) P.ask = null
      clockOff(n)
      if (disposed || my !== gen) return
      P.stalled = false
      rearm.delete(n)
      if (!V.places.near(n)) { retire(n); return }
      void commit(n, laid, my)
    }, e => {
      if (P.ask === a) P.ask = null
      if (disposed || my !== gen || isAbort(e)) return
      clockOff(n)
      P.failed = true
      warn('page', e)
      shownOriginal(n)
    })
  }

  // ---------------------------------------------------------------- the copy and the commit
  /** the place's k: device pixels a PDF unit at the pane's scale, within COPY_PIXELS */
  function kOf(n) {
    const vp = V.places.view(n)?.viewport
    if (!vp?.scale) return null
    const w = vp.width / vp.scale, h = vp.height / vp.scale, k = vp.scale * V.dpr()
    return w * h * k * k > COPY_PIXELS ? Math.sqrt(COPY_PIXELS / (w * h)) : k
  }
  /** the page's copy at the place's k, drawn by `d` (the door asked, which a later open does not replace here) from the composed
   *  document: render A (the page with the groups of the units drawn there hidden) and its crops and pastes, as PDF.js draws a page
   *  view: from its top-left corner on a canvas of the place's box at k's resolution (its CSS px times the pixel ratio, where k is not
   *  held to COPY_PIXELS), the rest of the page cropped, so that it maps pixel for pixel onto the place; on the context PDF.js draws
   *  the left's page views on (opaque, read back by the CPU unless the host opens its documents with enableHWA). A delta's replaced
   *  page keeps the original's /Annots, ~91 % of whose link rectangles are ours: the layer draws its own links from the layout, so
   *  the original's annotations are not drawn into the copy */
  async function copyAt(d, n, k, my) {
    const vp = V.places.view(n)?.viewport, box = V.places.box(n)
    if (!vp?.scale || !box) throw new Error(`page ${n} has no viewport to draw its copy at`)
    const r = k / vp.scale
    const annotationMode = index?.head?.base?.kind === 'delta' && replacedPage(n) ? V.lib?.AnnotationMode?.DISABLE : undefined
    // (aborted where the page leaves the view before its copy is drawn: retire; its queued renders not drawn)
    const P = rec(n), ac = new AbortController()
    ;(P.copyAcs ??= new Set()).add(ac)
    const canvas = await d.copyOf(n, { k, width: Math.max(1, Math.round(box.width * r)), height: Math.max(1, Math.round(box.height * r)), context: { alpha: false, willReadFrequently: !V.assets?.enableHWA }, annotationMode, signal: ac.signal }).finally(() => P.copyAcs.delete(ac))
    if (disposed || my !== gen) { release(canvas); return null }
    counts.copies++
    return { canvas, k }
  }
  /** resolves once page n of the left is drawn where it is being drawn (at once where it is not: drawn already, or not asked of the
   *  left at all; else in the task the left's page is told drawn in, or after LEFT_WAIT_MS) */
  function leftDrawn(n) {
    if (!V.left.drawing?.(n)) return Promise.resolve()
    return new Promise(done => {
      let off = () => {}
      const timer = clock.later(() => { off(); done() }, LEFT_WAIT_MS)
      off = V.onPageDrawn((side, page) => { if (side === 'left' && page === n) { clock.clear(timer); off(); done() } })
    })
  }
  /** a laid page in its place: its copy, then the copy and the SVG put in one task */
  async function commit(n, laid, my) {
    const P = rec(n), k = kOf(n), d = door
    if (k === null || !d) return
    // (the page asked before its parts were all told, laid with nothing to draw: the original's page stays)
    if (originalPageOf(n)) { shownOriginal(n); return }
    let got
    try { got = await copyAt(d, n, k, my) } catch (e) {
      if (disposed || my !== gen || e?.name === 'AbortError') return
      // the page shows the original (an earlier door's drawing let go); asked again on the next scroll or a zoom
      warn('copy', e)
      P.failed = true
      rearm.add(n)
      shownOriginal(n)
      return
    }
    if (!got) return
    // (the left first, or in the same frame: a copy ready while the left's page is being drawn waits for it, at most LEFT_WAIT_MS,
    // and is put in place in the same task as the left's page is told drawn, so that the two panes paint within one frame)
    await leftDrawn(n)
    if (disposed || my !== gen) { release(got.canvas); return }
    if (!V.places.near(n) || P.content?.gen === my && P.content.wrap) { release(got.canvas); if (!V.places.near(n)) retire(n); return }
    laid.svg.setAttribute('viewBox', `0 0 ${laid.w} ${laid.h}`)
    laid.svg.setAttribute('preserveAspectRatio', 'none')
    got.canvas.className = 'axt-layer-copy'
    got.canvas.setAttribute('aria-hidden', 'true')
    const wrap = document.createElement('div')
    wrap.className = 'axt-layer'
    // the SVG and the links in the copy's frame (engine.css): the page's size at the pane's scale from its top-left corner,
    // --total-scale-factor times its size in PDF units (which a zoom's steps change by CSS alone), not the place's box, which
    // PDF.js floors to whole CSS px as it does the copy's source
    const vp = V.places.view(n)?.viewport
    if (vp?.scale) {
      const unit = vp.scale * (vp.userUnit || 1)
      wrap.style.setProperty('--axt-frame-w', `calc(var(--total-scale-factor) * ${vp.width / unit}px)`)
      wrap.style.setProperty('--axt-frame-h', `calc(var(--total-scale-factor) * ${vp.height / unit}px)`)
    }
    // its links over the drawing, in the place's coordinates: one element, sized by shares of the page, which no zoom moves
    const links = V.links(n, laid.links)
    wrap.append(got.canvas, laid.svg, ...(links ? [links] : []))
    const was = P.content
    if (!V.places.swap(n, wrap)) { release(got.canvas); return }
    release(was?.copy)
    P.content = { wrap, svg: laid.svg, copy: got.canvas, k: got.k, gen: my }
    P.failed = false
    counts.commits++
    ring.push(`${n}@${Math.round(clock.now())}`)
    if (ring.length > RING) ring.shift()
    // the right's shapes of the page: its words (the units the layer shows as the original's from the left's tokens)
    // (both: the words given, and the page shown again where an earlier fallback hid it)
    const given = right?.lay(n, laid.words), shown = right?.show(n)
    if (given || shown) startsFor([...laid.words.spans.map(s => s[0]), ...laid.words.original])
  }
  /** a laid page's copy drawn again at the place's new k (a zoom). A copy is kept while it is at the k a copy drawn now would be
   *  at, whatever the zoom has done since */
  async function recopy(n) {
    const P = pages.get(n), k = kOf(n)
    if (!P?.content?.wrap || P.content.gen !== gen || !door || k === null || !V.places.near(n)) return
    if (P.content.k === k) return
    if (P.copying) { P.again = true; return }
    P.copying = true
    const my = gen
    try {
      const got = await copyAt(door, n, k, my)
      if (!got) return
      const c = P.content
      if (!c?.wrap || c.gen !== my) { release(got.canvas); return }
      got.canvas.className = 'axt-layer-copy'
      got.canvas.setAttribute('aria-hidden', 'true')
      c.wrap.replaceChild(got.canvas, c.copy)
      release(c.copy)
      c.copy = got.canvas
      c.k = got.k
    } catch (e) { if (!disposed && e?.name !== 'AbortError') warn('copy', e) } finally {
      P.copying = false
      if (P.again) { P.again = false; void recopy(n) }
    }
  }

  // ---------------------------------------------------------------- the view's events
  let recopyTimer = 0
  const offs = [
    V.onNear((n, on) => {
      if (disposed) return
      if (on) {
        // a page whose layer failed or was let go asked again on coming near
        rec(n).failed = false
        askSoon(n)
      } else {
        toAsk.delete(n)
        abortAsk(n)
        rearm.delete(n)
        // a page this door laid is retired; a drawing kept from an earlier door goes, the place back to its own content; either
        // held while it holds the focus (farGone)
        farGone(n)
      }
      windowed()
    }),
    V.onScale(() => {
      clock.clear(recopyTimer)
      recopyTimer = clock.later(() => {
        recopyTimer = 0
        for (let n = 1; n <= V.places.count(); n++) {
          if (!V.places.near(n)) continue
          const P = pages.get(n)
          if (P?.content?.wrap) void recopy(n)
          // a page that failed asked again on a zoom
          else if (P?.failed) { P.failed = false; ask(n) }
        }
      }, RECOPY_MS)
    }),
    V.onPageDrawn((s, n, error) => {
      if (s !== 'left' || disposed) return
      floatsFor(n, error)
    }),
    V.onScrolled(() => {
      if (disposed) return
      // the pages given up at PAGE_MS asked again, where they are near
      if (rearm.size) { const again = [...rearm]; rearm.clear(); for (const n of again) { abortAsk(n); askSoon(n) } }
      headingSoon()
    }),
    V.onOriginal(s => {
      if (disposed || s !== 'opened') return
      // the places laid out again for another page count let their content go
      for (const [n, P] of pages) if (P.content && !V.places.page(n)?.contains(P.content.wrap ?? null) && P.content.wrap) { release(P.content.copy); P.content = null }
      if (contents) void contents.outline(V.left.doc()).then(m => { if (m) outlineSoon() }, () => {})
      void pump()
    }),
    V.onWant((_s, p) => want(p)),
  ]

  // ---------------------------------------------------------------- the highlight's data (§2.7)
  let left = null, right = null, shapedParts = []
  let leftAc = new AbortController()
  const leftAsked = new Set(), wantsBefore = new Set(), floatsAsked = new Set()
  /** the pages wanted, and those whose running units' other pages' left parts are all in (spreadFrom) */
  const wantedOnce = new Set(), spread = new Set()
  /** when each page's left part last failed */
  const leftFailed = new Map()
  const leftStarts = new Map(), rightStarts = new Map()
  /** the last pages wanted, most recent last; the pages whose geometry is kept (near and wanted) */
  const wanted = []
  let kept = new Set(), lastWant = 0
  function shapesChanged() {
    if (!left) return
    V.setShapes('left', left.shapes, leftStarts)
    V.setShapes('right', right.shapes, rightStarts)
  }
  /** the parts read, told to the shapes and the contents (a fork: both made again from the new chain) */
  function shapeParts(parts) {
    if (!left) return
    if (!isPrefix(shapedParts, parts)) {
      right.dispose()
      left = createShapes({ kindOf: id => index.kinds[id] ?? undefined, warn })
      right = layerShapes(left)
      contents = createContents(index)
      contents.take([...rows.values()])
      // the original's outline gives the new contents the pages of the headings no part locates
      const doc = V.left.doc()
      if (doc) { const c = contents; void c.outline(doc).then(m => { if (m && contents === c) outlineSoon() }, () => {}) }
      shapedParts = []
      leftStarts.clear(); rightStarts.clear()
      // (the chain's left parts may be others now: a page's failure is no longer a reason to wait)
      leftAsked.clear(); floatsAsked.clear(); leftFailed.clear(); spread.clear()
      outlineSoon()
    }
    const more = parts.slice(shapedParts.length)
    if (!more.length) return
    left.addParts(more)
    shapedParts = parts
    if (contents.addParts(more)) outlineSoon()
    shapesChanged()
  }
  /** a want of page p (the pointer over it, either pane): its left part fetched once, on the first, and once it is in the
   *  other pages' of its running units (spreadFrom) */
  function want(p) {
    if (disposed || !left || !Number.isInteger(p)) return
    if (p !== lastWant) {
      lastWant = p
      const i = wanted.indexOf(p)
      if (i >= 0) wanted.splice(i, 1)
      wanted.push(p)
      if (wanted.length > WANTED_KEPT) wanted.shift()
      windowed()
    }
    wantedOnce.add(p)
    leftOf(p, true)
    spreadFrom(p)
  }
  /**
   * The left parts of the other pages of page p's running units, once p's own is in: a unit's sentences wait for every page
   * it is on (shapes.mjs tokensIn), so a paragraph over a page break lit whole on its first page until the pointer had been
   * over the next. Only from a page wanted (a page fetched so spreads no further: a paper's paragraphs run on page after
   * page), at most SPREAD_MAX pages, and in the task that follows its left part's: a unit over a break costs one more left
   * part, the page beside it
   */
  function spreadFrom(p) {
    if (spread.has(p) || !door || !left?.has(p)) return
    const L = left.layout, ids = (L.unitsOn[p] ?? []).filter(id => bySentence(index.kinds[id] ?? undefined))
    const qs = spreadPages(p, ids, id => L.pagesOf.get(id), q => left.has(q))
    // (done once every page it brings is in; until then each want asks again for those not asked or past a failure's wait)
    if (!qs.length) spread.add(p)
    for (const q of qs) leftOf(q, false)
  }
  /** page p's left part fetched once (again on a later want once a failure's wait has passed), added in a task of its own;
   *  `wanted`: the pointer's, kept for the door where none is open yet */
  function leftOf(p, wanted) {
    if (leftAsked.has(p)) return
    // a part that failed: asked again once its wait has passed
    if (clock.now() - (leftFailed.get(p) ?? -Infinity) < LEFT_RETRY_MS) return
    if (!door) { if (wanted) wantsBefore.add(p); return }
    leftAsked.add(p)
    const my = gen, L0 = left
    door.leftPageOf(p, { signal: leftAc.signal }).then(lp => {
      if (disposed) return
      // (the shapes made again for a fork meanwhile: a left part of the chain let go is not theirs; asked again on a want)
      if (left !== L0) { leftAsked.delete(p); return }
      leftFailed.delete(p)
      // in a task of its own: the page's part of the layout, its sentences and the panes' shapes
      clock.later(() => {
        if (disposed || left !== L0) return
        counts.leftParts++
        if (left.addPage(lp)) {
          startsFor(lp.spans.map(s => s[0]))
          floatsFor(p, null)
        }
        if (wantedOnce.has(p)) spreadFrom(p)
      }, 0)
    }, e => {
      if (disposed || isAbort(e) || my !== gen) { if (my !== gen) leftAsked.delete(p); return }
      left?.refuse(p, e)
      // the door keeps no failed fetch: asked again on a later want, once LEFT_RETRY_MS has passed
      leftAsked.delete(p)
      leftFailed.set(p, clock.now())
    })
  }
  /** the geometry kept for the near pages and the last pages wanted; the rest let go (made again on their next use) */
  function windowed() {
    if (!left) return
    const now = new Set(wanted)
    for (let n = 1; n <= V.places.count(); n++) if (V.places.near(n)) now.add(n)
    for (const p of kept) if (!now.has(p)) { left.forget(p); right.forget(p); floatsAsked.delete(p) }
    kept = now
  }
  /** a page's floats from what PDF.js drew the left's page by, once a layout, where a caption is on it */
  function floatsFor(n, error) {
    if (!left || floatsAsked.has(n) || !wantsFloats(left.layout, n)) return
    const pg = V.left.pdfPage(n), OPS = V.lib?.OPS
    if (!pg || !OPS) return
    floatsAsked.add(n)
    const list = error ? null : drawnList(pg)
    const L0 = left
    Promise.resolve(list ?? pg.getOperatorList?.({ annotationMode: V.lib.AnnotationMode?.ENABLE_FORMS }))
      .then(ops => {
        if (disposed || left !== L0 || !ops) return
        left.floats(n, figureRegions(ops, OPS), pathsOf(ops, OPS))
        shapesChanged()
      })
      .catch(() => floatsAsked.delete(n))
  }
  /** the units' starts on both panes, made again for those ids: where both have them, a unit lights by sentence */
  function startsFor(ids) {
    if (!left) return
    for (const id of new Set(ids)) {
      const row = rows.get(id), u = row?.[4] ? unitOf(index, row) : null
      const ls = u?.pieces ? left.starts(id, u.src, row[4].src) : null
      const rs = u?.pieces ? right.starts(id, plainTranslated(u.pieces), row[4].tr, ls) : null
      if (ls) leftStarts.set(id, ls); else leftStarts.delete(id)
      if (rs) rightStarts.set(id, rs); else rightStarts.delete(id)
    }
    shapesChanged()
  }

  // ---------------------------------------------------------------- the contents (§2.6) and the layer's events
  let contents = null, outlineFrame = 0, headingFrame = 0, headingTold, layerFrame = 0
  function indexed(i) {
    index = i
    left = createShapes({ kindOf: id => index.kinds[id] ?? undefined, warn })
    right = layerShapes(left)
    contents = createContents(index)
    contents.take([...rows.values()])
    startsFor([...rows.keys()])
    V.setUnits({ unitAt: (p, x, y) => door?.unitAt(p, x, y) ?? null, firstRect: id => contents?.firstRect(id) ?? null, pageOf: id => contents?.pageOf(id) ?? null })
    outlineSoon()
    const doc = V.left.doc()
    if (doc) void contents.outline(doc).then(m => { if (m) outlineSoon() }, () => {})
  }
  function outlineSoon() {
    if (outlineFrame || disposed || !contents) return
    outlineFrame = clock.frame(() => { outlineFrame = 0; if (!disposed && contents) { V.emit({ type: 'outline', entries: contents.entries() }); headingSoon() } })
  }
  function headingSoon() {
    if (headingFrame || disposed || !contents) return
    headingFrame = clock.frame(() => {
      headingFrame = 0
      if (disposed || !contents) return
      const at = V.reading(), id = at ? contents.headingAt(at.page, at.y) : null
      if (id === headingTold) return
      headingTold = id
      V.emit({ type: 'heading', id })
    })
  }
  const total = () => index?.head.paper.pages ?? 0
  let layerTold = ''
  function emitLayer(soon = false) {
    if (disposed || state === 'idle') return
    const tell = () => {
      const key = `${state}|${why}|${ready}|${total()}`
      if (key === layerTold) return
      layerTold = key
      V.emit({ type: 'layer', state, ...(why ? { why } : {}), laid: ready, total: total() })
    }
    if (!soon) { clock.cancel(layerFrame); layerFrame = 0; tell(); return }
    if (!layerFrame) layerFrame = clock.frame(() => { layerFrame = 0; if (!disposed) tell() })
  }

  const side = {
    tell(refs) { if (!disposed && state !== 'refused') feed.tell(refs ?? {}) },
    index: async () => { const i = await feed.index(); return disposed || state === 'refused' ? null : i },
    take(given) {
      if (disposed || !given?.length) return
      for (const r of given) if (Array.isArray(r) && Number.isInteger(r[0])) rows.set(r[0], r)
      if (door) { try { door.take(given) } catch (e) { warn('rows', e) } }
      if (contents?.take(given)) outlineSoon()
      if (left) startsFor(given.filter(r => r?.[4]).map(r => r[0]))
    },
    end() {
      if (disposed) return
      rowsEnded = true
      if (door && !rowsTold) { rowsTold = true; door.end() }
    },
    again() {
      if (disposed || state === 'refused') return
      rows.clear()
      rowsEnded = false
      leftStarts.clear(); rightStarts.clear()
      shapesChanged()
      // the contents' titles are the attempt's rows': the source's until its rows come
      if (contents?.clearTexts()) outlineSoon()
      reopenWanted = true
      void pump()
    },
    /** the ids of the units whose rows the open door's page still waits for (its closure's, Need(page)): a host translating
     *  as it shows translates them first; [] with no door, a page out of the paper or one ready */
    rowsFor(page) {
      if (disposed || !door) return []
      try { return door.rowsFor(page) } catch { return [] }
    },
    coverage() {
      return { laid: ready, total: total(), late: 0, failed, stalled: stalls, skipped: {}, parts: door?.stats().parts ?? { through: 0, told: 0 } }
    },
    probe() {
      let laidNow = 0, retiredNow = 0, asking = 0
      for (const P of pages.values()) { if (P.content?.wrap) laidNow++; else if (P.content) retiredNow++; if (P.ask) asking++ }
      return {
        state, why, gen, index: !!index, bound: bound === true, parts: doorParts.length, read: feed.state().parts.length, ended: partsEnded,
        rows: rows.size, rowsEnded, ready, failed, stalled: stalls, laid: laidNow, retired: retiredNow, asking,
        composed: counts.composed, docs: entries.size, opens: counts.opens, forks: counts.forks, asked: counts.asked, commits: counts.commits, copies: counts.copies, retirements: counts.retired,
        leftParts: counts.leftParts, leftAsked: leftAsked.size, kept: kept.size, commitsRing: ring.join(' '),
        shapesLaid: right ? Array.from({ length: V.places.count() }, (_, i) => right.laid(i + 1)).filter(Boolean).length : 0,
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      detach()
      feed.dispose()
      ac.abort()
      leftAc.abort()
      for (const off of offs) off()
      offPage?.()
      const was = door
      door = null
      try { was?.dispose() } catch { /* the door's own */ }
      clock.clear(recopyTimer)
      clock.cancel(outlineFrame); clock.cancel(headingFrame); clock.cancel(layerFrame)
      for (const n of pages.keys()) { abortAsk(n); unlay(n) }
      pages.clear()
      V.setShapes('left', null)
      V.setShapes('right', null)
      V.setUnits(null)
      right?.dispose()
      // every composed task let go: the side's hold, then any a door has not told retired by now (a read of it in flight)
      letGo(latest, 'side')
      for (const entry of [...entries]) destroy(entry)
    },
  }
  return side
}

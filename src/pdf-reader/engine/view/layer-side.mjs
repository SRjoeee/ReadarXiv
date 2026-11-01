// The layer's side of the reading view (the shared reader view's contract §1.2, §2.2–§2.7, §3; docs/PDF-READER.md §11.8): the
// one sink of a paper's layer. The host tells it what it hears (refs, rows, ends) and gives it a transport and two openers; the
// side fetches and reads through its feed (feed.mjs), binds the base, waits for the original, opens the composed document and
// the engine's door over it, adds each later part in page order,
// takes the rows, ends the parts. A fork of the chain, or a later attempt (again), opens the door again: one open layer a page.
// Another target (retarget) is a later attempt in another language over the same layer and the same composed document: the left,
// both documents and what PDF.js keeps of their pages stay; each laid page keeps its drawing until the new target's commits, or the
// new target's page fails, or the host says its rows will not come (dropOthers): then the original's page.
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
import { faceWarmer, familyOfParts, firstPageUnits, pagesOfParts } from '../layer-proto/warm.mjs'
import { unitOf } from '../layer-proto/rows.mjs'
import { plainTranslated } from '../translate/mt.mjs'
import { createContents } from './contents.mjs'
import { createFeed } from './feed.mjs'
import { figureRegions } from './figures.mjs'
import { pathsOf, wantsFloats } from './floats.mjs'
import { internalsOf } from './reader-view.mjs'
import { bySentence } from './highlight.mjs'
import { createShapes, layerShapes } from './shapes.mjs'
import { applyLayerText } from './text-rendering.mjs'
import { classesOn, unitShown } from '../rules/content-classes.mjs'

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
/** how long a laid page's text layer may wait for the main thread to be idle before it is built anyway (ms): it is built after
 *  the page's commit, never on its path (docs/PDF-READER.md §11.11) */
export const TEXT_IDLE_MS = 500
/** the most device pixels of laid pages' drawings the side keeps off the view on any device (docs/PDF-READER.md §11.8, "No flash
 *  coming back"): a laid page that leaves the near area keeps its drawing (its copy, its SVG and its links, detached from the
 *  place), put back in place in one task as it comes near again, so that a page already laid never shows the original or an empty
 *  place first; past the device's budget (keepBudget) the page farthest from the view is let go first. 2^25 pixels, 128 MiB at the
 *  4 bytes a pixel a copy costs: an A4 page at 120 % on a 2x screen is 1905 x 2694 pixels, 19.6 MiB of the GPU process's memory
 *  as Chromium 153 on Metal holds it (an ImageBitmap of it no less; 2026-10-24), so six and a half such pages, nine at 100 %, twelve
 *  at the reader's fit (87 %): two thirds of what the left pane's PDF.js may hold of its own (ten page views drawn) at that zoom */
export const KEEP_PIXELS = 2 ** 25
/** the share of a device's memory its kept drawings may take: 1/64, 64 MiB on a phone of 4 GB (some ten pages of its screen at the
 *  fit), 128 MiB (KEEP_PIXELS) on a computer of 8 GB, the most navigator.deviceMemory tells */
export const KEEP_SHARE = 1 / 64
/** the memory a device is taken to have where its browser does not say (navigator.deviceMemory: Chromium's alone), GB: a phone's
 *  of today, so that no device is given more than it may hold */
export const KEEP_MEMORY_GB = 4
/** the most on iOS and iPadOS, whose WebKit tells no memory (no deviceMemory) and kills a tab past its process's limit: 2^23
 *  pixels, 32 MiB. Until Safari 17, WebKit also refused a canvas once all of a page's canvases held past a cap of its own (about
 *  200 MB on an iPhone SE, 256 MB on iOS 12 devices, 384 MB reported: WebKit bug 195325); WebKit PR 14375 (265628@main,
 *  2023-06-29) removed that cap, leaving canvases to the process's limit. 32 MiB kept, beside the near pages' copies (an
 *  iPhone at 3x holds some 7 MB a page at the fit), stays under a third of the lowest cap reported, on the reader's floor
 *  (Safari 17) and below it */
export const IOS_KEEP_PIXELS = 2 ** 23
/**
 * The device pixels of drawings the side keeps off the view on this device: KEEP_SHARE of its memory (`deviceMemory`, GB, where the
 * browser tells it, else KEEP_MEMORY_GB) at 4 bytes a pixel, never fewer than two of its screens' pixels (`screenPixels`: its width
 * and height at its pixel ratio, so that a page left a screen behind is always kept), never more than KEEP_PIXELS, nor than
 * IOS_KEEP_PIXELS on iOS or iPadOS (`ios`)
 */
export function keepBudget({ deviceMemory, screenPixels, ios = false } = {}) {
  const gb = Number.isFinite(deviceMemory) && deviceMemory > 0 ? deviceMemory : KEEP_MEMORY_GB
  const byMemory = Math.floor((gb * 2 ** 30 * KEEP_SHARE) / 4)
  const floor = Number.isFinite(screenPixels) && screenPixels > 0 ? 2 * screenPixels : 0
  return Math.min(ios ? IOS_KEEP_PIXELS : KEEP_PIXELS, Math.max(byMemory, floor))
}
/** whether the browser runs on iOS or iPadOS (an iPad says it is a Mac, with a touch screen): its WebKit, whatever its name */
export const onIos = (nav = globalThis.navigator) => !!nav && (/\biP(?:hone|ad|od)\b/.test(nav.userAgent ?? '') || (/\bMacintosh\b/.test(nav.userAgent ?? '') && (nav.maxTouchPoints ?? 0) > 1))
/** how many pages past the near ones the side lays ahead, the way the reader moves, the next first, while the reader scrolls as at
 *  rest (the prefetch extended to the layer: the pages' rows, faces, layout and copy made before the reader reaches them, kept as
 *  drawings off the view; docs/PDF-READER.md §11.8, "The pages ahead") */
export const AHEAD_PAGES = 2
/** the translating card's padding, CSS pixels at the reader's 100 % (engine.css --axt-tr-pad-x and -pad-y, where the sheet gives
 *  none: Glint's, the owner's of 2026-11-01) */
export const PAD_X = 4
export const PAD_Y = 2
/** the pages wanted last whose geometry is kept beside the near ones (§3.2) */
const WANTED_KEPT = 20
/** the commits the probe keeps */
const RING = 32
const isAbort = e => e?.name === 'AbortError'
/** an error tagged with the side's code for why there is no layer (a BundleRefusal's own `why` is its message) */
const coded = (e, code) => { const out = e instanceof Error ? e : new Error(String(e ?? code)); out.axtCode ??= code; return out }
const release = c => { if (c) { c.width = 0; c.height = 0; c.remove() } }
/** what a place showed of the layer let go: its copy's pixels, and its text layer from PDF.js's registry of its selection listener */
const dropContent = c => { release(c?.copy); try { c?.text?.cancel() } catch { /* PDF.js's own */ } if (c) c.text = null }
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
  /** the host's bounds where it gives them: the pixels of the drawings kept off the view (else this device's: keepBudget), the
   *  pages laid ahead */
  const keepPixels = Number.isFinite(o.keepPixels) ? Math.max(0, o.keepPixels) : keepBudget({
    deviceMemory: globalThis.navigator?.deviceMemory,
    screenPixels: (globalThis.screen?.width ?? 0) * (globalThis.screen?.height ?? 0) * (globalThis.devicePixelRatio || 1) ** 2,
    ios: onIos(),
  })
  const aheadPages = Number.isSafeInteger(o.ahead) ? Math.max(0, o.ahead) : AHEAD_PAGES
  const clock = V.clock
  const ac = new AbortController()
  let disposed = false
  /** whether this document's layer text rendering is decided (text-rendering.mjs applyLayerText, at a commit) */
  let textDecided = false
  const detach = V.attach({ dispose: () => side.dispose() })
  const warned = new Set()
  const warn = (what, e) => { if (warned.has(what)) return; warned.add(what); console.warn(`[reader] the layer's ${what}:`, e?.message ?? e) }

  // ---------------------------------------------------------------- the door and its documents
  /** 'idle' (nothing read yet), 'opening', 'open', 'refused' */
  let state = 'idle', why = null
  let index = null, bound = null, door = null, doorParts = [], gen = 0, offPage = null
  /** the language the side lays (retarget sets another), and the one the open door lays */
  let target = o.target, doorTarget = null
  /** the reader's toggles the door lays by (rules/content-classes.mjs; setClasses sets others): a class they do not show is the
   *  original's (docs/route/orphan-text.md §8); null, the defaults */
  let classes = o.classes ?? null
  /** whether the host has said this target's rows will not come (dropOthers): another target's pages are the original's from then */
  let dropped = false
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
    // (no layer for the visit: nothing for the places ahead to wait for)
    V.places.letAheadGo?.()
    unmarkAll()
    warn(`open (${w})`, e ?? new Error(w))
    const was = door
    door = null
    offPage?.()
    try { was?.dispose() } catch { /* the door's own */ }
    stopAhead()
    dropDrawings()
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
    // (the drawings kept off the view are the door before's: the new door's pages are laid again as they come near)
    stopAhead()
    aheadNothing.clear()
    dropDrawings()
    leftAc.abort()
    leftAc = new AbortController()
    // (a copy under way is the door's before: its page is copied again by this one, and its renders hold the document's queue)
    for (const P of pages.values()) for (const c of P.copyAcs ?? []) c.abort()
    for (const p of leftAsked) if (!left?.has(p)) leftAsked.delete(p)
    // (a fetch this aborts is asked again: the pages wanted spread again on their next want)
    spread.clear()
    for (const n of pages.keys()) { abortAsk(n); const P = pages.get(n); if (P.content && !P.content.wrap) unlay(n); P.failed = false; P.stalled = false }
    rearm.clear()
    ready = 0
    failed = 0
    ruled.clear()
    right?.reset()
    // (a page kept drawn by the door before shows what the shapes no longer hold: nothing of it lit or hit until this door's page
    // commits there, or the original's is shown)
    for (const [n, P] of pages) if (P.content?.wrap) right?.mute(n, true)
    shapesChanged()
    state = 'opening'
    emitLayer()
    // (an open overtaken meanwhile, a later target's or a fork's, is let go whatever it came to: its failure is not the side's)
    const doc = await composedFor().catch(e => { if (disposed || my !== gen) return null; throw coded(e, 'composed') })
    if (disposed || my !== gen) return
    const me = {}
    let layer
    try {
      layer = await open({
        index, doc, parts, target, faceSources: o.faceSources, hyphUrl: o.hyphUrl, ...(o.rules ? { rules: o.rules } : {}), ...(classes ? { classes } : {}), OPS: V.lib?.OPS ?? null,
        // (the left parts' fetches go with the door's generation: a reopen, a refusal or the dispose aborts them)
        leftPart: (_page, ref) => o.fetchObject(ref, leftAc.signal),
        onRetired: d => retired(d, me),
      })
    } catch (e) { if (disposed || my !== gen) return; throw coded(e, 'open') }
    if (disposed || my !== gen) { layer.dispose(); return }
    door = layer
    doorParts = parts
    doorTarget = target
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
    aheadSoon()
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
  /** the pages asked near the view that this door shows as arXiv's by the rule (originalPageOf: no part that holds the page lays a
   *  line on it), never asked of the door: settled, as a laid page is, so that a host waiting for the layer's first page where the
   *  translation shows waits for none of them (its `layer` events' `original`). Not laid: `ready` counts none of them */
  const ruled = new Set()
  const rearm = new Set()
  /** the near pages answered and being put in place (commit): the pages ahead wait for them */
  let committing = 0
  const counts = { asked: 0, commits: 0, retired: 0, copies: 0, composed: 0, opens: 0, added: 0, leftParts: 0, forks: 0, restored: 0, dropped: 0, ahead: 0, aheadKept: 0, texts: 0 }
  /** each text layer built: its page, its items, its spans and the main thread's time to build it (ms), the last RING */
  const textRing = []
  const ring = []
  const empty = () => { const e = document.createElement('div'); e.className = 'axt-layer axt-layer-retired'; return e }
  /** the drawings of laid pages kept off the view (keepPixels), by page: each the content its place held (its wrapper, SVG, copy,
   *  k, door generation and target), and its copy's pixels */
  const drawings = new Map()
  let drawnPixels = 0
  const pixelsOf = c => (c?.copy ? c.copy.width * c.copy.height : 0)
  /** a laid page's content kept off the view; past keepPixels the drawing farthest from the view let go first (the page in the
   *  middle of the view, else the page just kept), the one kept longest first between two as far */
  function keepDrawing(n, c) {
    dropDrawing(n)
    const px = pixelsOf(c)
    if (!px || px > keepPixels) { dropContent(c); return }
    drawings.set(n, { c, px })
    drawnPixels += px
    const at = V.centre() || n
    while (drawnPixels > keepPixels) {
      let far = null, most = -1
      for (const m of drawings.keys()) { const d = Math.abs(m - at); if (d > most) { far = m; most = d } }
      const d = drawings.get(far)
      drawings.delete(far)
      drawnPixels -= d.px
      dropContent(d.c)
      counts.dropped++
    }
  }
  /** page n's kept drawing taken out of the keep (its copy not released: the caller's), or null */
  function takeDrawing(n) {
    const d = drawings.get(n)
    if (!d) return null
    drawings.delete(n)
    drawnPixels -= d.px
    return d.c
  }
  /** page n's kept drawing let go, its copy and its text layer released */
  function dropDrawing(n) { const c = takeDrawing(n); if (c) dropContent(c) }
  /** every kept drawing `drop` names let go (all by default): a door before's, another target's, the side's end */
  function dropDrawings(drop = () => true) { for (const [n, d] of [...drawings]) if (drop(d.c)) { dropDrawing(n); counts.dropped++ } }
  /** page n's kept drawing put back in its place as it comes near, in one task (no original, no empty place first), where it is
   *  this door's in this target; its copy drawn again at the place's k where a zoom has changed it since. Whether it was */
  function bringBack(n) {
    const c = takeDrawing(n)
    if (!c) return false
    const P = rec(n)
    if (disposed || !door || c.gen !== gen || c.target !== doorTarget || (P.content?.wrap && P.content !== c) || !V.places.swap(n, c.wrap)) { dropContent(c); return false }
    unmark(n)
    P.content = c
    P.failed = false
    P.stalled = false
    rearm.delete(n)
    counts.restored++
    ring.push(`${n}@${Math.round(clock.now())}`)
    if (ring.length > RING) ring.shift()
    // (the right's shapes there the layer's again: its words were made when it was laid, and are kept with the page's shapes)
    const unmuted = right?.mute(n, false), shown = right?.show(n)
    if (unmuted && !shown) shapesChanged()
    if (shown) startsFor([...rows.keys()])
    if (c.k !== kOf(n)) void recopy(n)
    return true
  }

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
  /** a near page shown as arXiv's by the rule (originalPageOf), told the host once a door: settled (`original`), never laid */
  function ruledOriginal(n) {
    shownOriginal(n)
    if (ruled.has(n)) return
    ruled.add(n)
    emitLayer(true)
  }
  /** a page whose layer is not coming now: its place back to its pre-layer content where it holds the layer's */
  function shownOriginal(n) {
    // (a near page settled as the original's: by the rule, a failure, a stall, nothing of its own to draw: the places ahead wait
    // for it no more)
    if (V.places.near(n)) V.places.letAheadGo?.()
    // (a page that failed, or that ended with nothing of the layer to draw, is the original's: no paragraph of it is coming, and
    // no mark comes back to it this attempt, whatever rows another page takes; again() lets it be marked once more)
    unmark(n)
    const P = rec(n)
    P.originalShown = true
    if (P.content && (P.content.gen !== gen || !P.content.wrap)) unlay(n)
    // the right's shapes there the original's again, as its place is
    if (right?.hide(n)) startsFor([...rows.keys()])
  }
  /** a page of an earlier door let go (dropOthers): its place and the right's shapes there the original's; whether the shapes changed */
  function dropPage(n) {
    unlay(n)
    return !!right?.hide(n)
  }
  /** what the place shows of the layer let go, the place back to its pre-layer content */
  function unlay(n) {
    const P = pages.get(n)
    if (!P?.content) return
    dropContent(P.content)
    P.content = null
    V.places.restore(n)
    // (the original's page there: the mirror's geometry is its own)
    if (right?.mute(n, false)) shapesChanged()
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
        // (kept for the focus by dropOthers: another target's layer, the original's page once the focus has left it)
        else if (dropped && pages.get(n)?.content && (pages.get(n).content.target !== target || pages.get(n).content.gen !== gen) && dropPage(n)) startsFor([...rows.keys()])
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
    P.content = { wrap: null, svg: null, copy: null, k: 0, gen, target: doorTarget, text: null }
    if (V.places.swap(n, empty(), { blank: true })) counts.retired++
    else P.content = null
    // (this door's drawing in this target kept off the view, to be put back as the page comes near again: KEEP_PIXELS)
    if (was?.wrap && was.gen === gen && was.target === doorTarget && P.content) keepDrawing(n, was)
    else dropContent(was)
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
    if (originalPageOf(n)) { ruledOriginal(n); return }
    if (P.ask) return
    const my = gen, a = new AbortController(), d = door
    P.ask = a
    counts.asked++
    // (a page of the view asked: the pages ahead give the door, the main thread and the line up to it, and are laid again once the
    // view's pages are in place)
    stopAhead()
    let st
    try { st = d.pageState(n) } catch { P.ask = null; return }
    if (st === 'laying') clockOn(n)
    d.pageOf(n, { lang: doorTarget, signal: a.signal }).then(laid => {
      if (P.ask === a) P.ask = null
      clockOff(n)
      if (disposed || my !== gen) return
      P.stalled = false
      rearm.delete(n)
      if (!V.places.near(n)) { retire(n); aheadSoon(); return }
      // (the door lays no other page until this one is in place, door.hold: the copy's frames are not shared with the next page's
      // reading and lay, so that the page the reader waits on is shown first; the pages ahead wait for it too)
      committing++
      d.hold(commit(n, laid, my).catch(e => warn('commit', e)).finally(() => { committing--; aheadSoon() }))
    }, e => {
      if (P.ask === a) P.ask = null
      if (disposed || my !== gen || isAbort(e)) return
      clockOff(n)
      P.failed = true
      warn('page', e)
      shownOriginal(n)
      aheadSoon()
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
  async function copyAt(d, n, k, my, owner = null) {
    const vp = V.places.view(n)?.viewport, box = V.places.box(n)
    if (!vp?.scale || !box) throw new Error(`page ${n} has no viewport to draw its copy at`)
    const r = k / vp.scale
    const annotationMode = index?.head?.base?.kind === 'delta' && replacedPage(n) ? V.lib?.AnnotationMode?.DISABLE : undefined
    // (aborted where the page leaves the view before its copy is drawn: retire; its queued renders not drawn; and, a copy of the
    // pages ahead, `owner`'s abort: stopAhead lets that copy go and no other of the page's)
    const P = rec(n), ac = new AbortController()
    if (owner) { if (owner.aborted) ac.abort(owner.reason); else owner.addEventListener('abort', () => ac.abort(owner.reason), { once: true }) }
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
    // (the page asked before its parts were all told, laid with nothing to draw: the original's page stays; and a page the layer draws
    // nothing of its own on, no unit translated there (its rows none, lost or not come by the end): arXiv's page stays, never our
    // base page in its place)
    if (originalPageOf(n)) { ruledOriginal(n); return }
    if (laid.hides === 0) { shownOriginal(n); return }
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
    if (V.places.near(n)) await leftDrawn(n)
    if (disposed || my !== gen || (P.content?.gen === my && P.content.wrap)) { release(got.canvas); return }
    const content = drawingOf(n, laid, got, my)
    // (a page that went far while its copy was drawn: its drawing kept off the view, the place holding nothing until it comes near)
    if (!V.places.near(n)) { keepFar(n, content, laid); return }
    putInPlace(n, content, laid)
  }
  /** a laid page's drawing put in its place, in one task: its page view destroyed first, the place's size and the pane's scroll
   *  unchanged (places.mjs swap); what the place held of the layer before let go */
  function putInPlace(n, content, laid) {
    const P = rec(n), was = P.content
    if (!V.places.swap(n, content.wrap)) { dropContent(content); return }
    unmark(n)
    if (was !== content) dropContent(was)
    dropDrawing(n)
    P.content = content
    P.failed = false
    // (the layer's text rendering, decided once a document from the first laid page whose words tell, before it is painted:
    // `auto` where the browser lays them out alike under geometricPrecision and under it, text-rendering.mjs; until then, and
    // where they differ, engine.css's geometricPrecision)
    if (!textDecided) textDecided = applyLayerText(content.svg) !== null
    // its text layer, once the main thread is idle: never on the commit's path
    textSoon(n, content, door)
    counts.commits++
    // (the layer's first page in place: the places ahead draw the original's pages now)
    V.places.letAheadGo?.()
    ring.push(`${n}@${Math.round(clock.now())}`)
    if (ring.length > RING) ring.shift()
    shapesOf(n, laid)
    // (the view's pages laid: the pages ahead once it rests; the first one shown, the other near pages' faces)
    aheadSoon()
    if (counts.commits === 1) warmSoon()
  }
  /** a laid page's drawing, made of its copy and the door's page (its SVG and links), not in its place yet: its wrapper (the copy,
   *  the SVG and the links in the copy's frame), and what the side keeps of it */
  function drawingOf(n, laid, got, my) {
    laid.svg.setAttribute('viewBox', `0 0 ${laid.w} ${laid.h}`)
    laid.svg.setAttribute('preserveAspectRatio', 'none')
    // (its text is drawn, not read: the page's text layer, built after the commit, is what a selection, a copy, a search and a
    // screen reader take, one copy of every piece of text; engine.css takes the SVG's text out of selection)
    laid.svg.setAttribute('aria-hidden', 'true')
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
    return { wrap, svg: laid.svg, copy: got.canvas, k: got.k, gen: my, target: doorTarget, text: null }
  }
  /** the right's shapes of a laid page: its words (the units the layer shows as the original's from the left's tokens); both the
   *  words given, and the page shown again where an earlier fallback hid it */
  function shapesOf(n, laid) {
    const unmuted = right?.mute(n, false)
    const given = right?.lay(n, laid.words), shown = right?.show(n)
    if (unmuted && !given && !shown) shapesChanged()
    if (given || shown) startsFor([...laid.words.spans.map(s => s[0]), ...laid.words.original])
  }
  /** a laid page's drawing made while its place is far (its copy drawn after it left, or laid ahead): kept off the view, its place
   *  holding an empty element (retired) until it comes near and the drawing is put back (bringBack); its shapes laid already */
  function keepFar(n, content, laid) {
    retire(n)
    const P = rec(n)
    if (P.content?.wrap || holdsFocus(n)) { dropContent(content); return }
    keepDrawing(n, content)
    // (its text layer built while it is kept, so that it comes back with it: a page laid ahead is read as soon as it is near)
    if (drawings.get(n)?.c === content) textSoon(n, content, door)
    shapesOf(n, laid)
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

  // ---------------------------------------------------------------- the text layer (docs/PDF-READER.md §11.11)
  /** the idle callbacks asked for, cancelled at dispose */
  const idles = new Set()
  /** `cb` once the main thread is idle (within TEXT_IDLE_MS), or in a task where the browser tells no idleness (the tests') */
  const idle = cb => {
    if (typeof requestIdleCallback !== 'function') { clock.later(cb, 0); return }
    const id = requestIdleCallback(() => { idles.delete(id); if (!disposed) cb() }, { timeout: TEXT_IDLE_MS })
    idles.add(id)
  }
  /** content `c` of page n (laid by door `d`) given its text layer at idle: the door's data for the page, built by PDF.js's own
   *  builder over the place (the view's `text`), put between the SVG and the links, its translated spans in the target `c` was
   *  laid in. Built whether `c` is in its place or kept off the view (a drawing kept or laid ahead, KEEP_PIXELS: the layer comes
   *  back with it); nothing where `c` is neither by then (retired, let go), or the door or the builder has none. Released with
   *  the content (dropContent) */
  function textSoon(n, c, d) {
    if (typeof V.text !== 'function' || typeof d?.textOf !== 'function') return
    idle(async () => {
      const shows = () => !disposed && door === d && !!c.wrap && (pages.get(n)?.content === c || drawings.get(n)?.c === c)
      if (!shows()) return
      // (none built in a pane a zoom's or a pinch's steps are scaling, places.mjs: asked again TEXT_IDLE_MS on, until they are
      // drawn; a drawing kept off the view is in no pane, and is built)
      if (c.wrap.closest('[data-axt-scaling]')) { clock.later(() => { if (!disposed) textSoon(n, c, d) }, TEXT_IDLE_MS); return }
      let data
      try { data = await d.textOf(n) } catch (e) { if (shows()) warn('text', e); return }
      if (!shows()) return
      const t0 = clock.now()
      let built
      try { built = await V.text(n, data, c.target ?? target) } catch (e) { if (shows()) warn('text', e); return }
      if (!built) return
      if (!shows() || c.text) { try { built.cancel() } catch { /* PDF.js's own */ } return }
      c.wrap.insertBefore(built.div, c.wrap.querySelector(':scope > .axt-links'))
      c.text = built
      counts.texts++
      textRing.push(`${n}:${data.items.length}/${built.div.childElementCount}@${Math.round((clock.now() - t0) * 10) / 10}`)
      if (textRing.length > RING) textRing.shift()
    })
  }

  // ---------------------------------------------------------------- the faces, in one wave (warm.mjs; §11.8)
  /** the target's warmer (made again for another target), what it was asked for (by target, family and unit; by target, family
   *  and page for a page's names and fonts; page 1's likely faces), and what each page of the parts read so far sets
   *  (warm.mjs pagesOfParts, read again as more parts are read) */
  let warmer = null, warmerOf = null, warmQueued = false
  const warmedUnits = new Set()
  /** the waves' stop: aborted as the side ends or another target is shown, so that no slice more of a wave is begun for what is
   *  no longer read (those loading settle; a slice is the reader's for any later paper) */
  let warmAc = new AbortController()
  let pagesRead = null, pagesReadOf = null
  const pagesNow = () => {
    const parts = feed.state().parts
    if (pagesReadOf !== parts || !pagesRead) { pagesReadOf = parts; pagesRead = pagesOfParts(parts) }
    return pagesRead
  }
  /** whether the reader's toggles, as they are now, show a unit's kind translated (rules/content-classes.mjs unitShown, as
   *  markPage and the door read them): a unit of a kind they hide is never drawn, so no wave asks its faces (the author block's
   *  places with the names toggle off, its default; a bibliography's entries), and one shown later is asked then */
  const shownNow = () => { const on = classesOn(classes); return kind => unitShown(kind ?? '', on) }
  /** a row's translated text (its strings; a placeholder's piece is the source's, drawn as it is) */
  const textOf = row => (Array.isArray(row?.[1]) ? row[1].filter(x => typeof x === 'string').join('') : '')
  /** the faces of what v0 will draw of pages `qs` asked of the host at once, page by page in that order (each page's wave
   *  awaited before the next's), as soon as the index, their rows and the parts that locate them are in, whether or not a door
   *  is open: v0's checks then find them loaded or loading (warm.mjs). A unit asked once in a target and a family is not asked
   *  again, nor are a page's names and fonts once its part is read */
  /** the target's warmer, made again for another target */
  const warmerNow = () => {
    if (!warmer || warmerOf !== target) {
      warmer = faceWarmer({ faceSources: o.faceSources, target, ...(o.rules ? { rules: o.rules } : {}) })
      warmerOf = target
    }
    return warmer
  }
  async function warmPages(qs, stop = null) {
    if (disposed || state === 'refused' || !index || !rows.size) return
    warmerNow()
    const parts = feed.state().parts, family = familyOfParts(parts), pages = pagesNow(), shown = shownNow()
    // (the side's stop, and the caller's where it gives one: the pages ahead's, which a page of the view asked aborts)
    let signal = warmAc.signal, unhook = () => {}
    if (stop) {
      const both = new AbortController(), off = () => both.abort()
      for (const s of [warmAc.signal, stop]) { if (s.aborted) both.abort(); else s.addEventListener('abort', off, { once: true }) }
      unhook = () => { warmAc.signal.removeEventListener('abort', off); stop.removeEventListener('abort', off) }
      signal = both.signal
    }
    try {
      for (const q of qs) {
        if (signal.aborted) return
        const pg = pages.get(q)
        if (!pg) continue
        const units = [], added = []
        const mark = key => { warmedUnits.add(key); added.push(key) }
        for (const [id, st] of pg.units) {
          const key = `${target}|${family}|${id}`, row = rows.get(id)
          if (warmedUnits.has(key) || !row || !shown(index.kinds[id])) continue
          mark(key)
          const text = textOf(row)
          if (text) units.push({ kind: index.kinds[id] ?? null, text, st })
        }
        const pageKey = `${target}|${family}|page ${q}`, likelyKey = `${target}|${family}|likely`
        // (a page's names and fonts asked once its own part is read: one only a unit running on to it reaches has more to come)
        const extras = !warmedUnits.has(pageKey)
        if (pg.covered) mark(pageKey)
        // (v0 warms its likely faces on page 1, in the serif design most of page 1's characters are set in)
        const likely = q === 1 && !warmedUnits.has(likelyKey) ? (mark(likelyKey), pg.serif ?? (family === 'other' ? 'times' : family)) : null
        if (units.length || extras || likely) await warmer.warm({ units, names: extras ? pg.names : [], fonts: extras ? pg.fonts : [], likely }, family, { signal })
        if (disposed) return
        // (a wave stopped before its end asks its page's faces again next time: its slices not begun are still to load)
        if (signal.aborted) { for (const key of added) warmedUnits.delete(key); return }
      }
    } finally { unhook() }
  }
  /** the warm-ups in turn, so that a page's wave waits for the one asked before it, whoever asked it */
  let warmChain = Promise.resolve()
  /** the rows a host read before any part (warmEarly), and those taken while no part is read (take): their texts by id, for the
   *  first page's early wave alone */
  const earlyTexts = new Map()
  /** whether the first page's units are still unknown: no part read, and the parts' end not told (a catalog tells it with its
   *  parts, which come at once: a cached translation's first page has its own wave at once, and no estimate is asked beside it) */
  const beforeParts = () => { const f = feed.state(); return !f.parts.length && !f.end }
  /** the texts of rows `given` kept for the early wave; whether any is new */
  function keepEarly(given) {
    let added = false
    for (const r of given ?? []) {
      if (!Array.isArray(r) || !Number.isSafeInteger(r[0])) continue
      const text = textOf(r)
      if (text && earlyTexts.get(r[0]) !== text) { earlyTexts.set(r[0], text); added = true }
    }
    return added
  }
  let earlyQueued = false
  /** before any part is read (a first open: the rows come while the box lays the paper out, its head and parts at the end), the
   *  CJK characters of the first page's units as firstPageUnits estimates them (the units' kinds read before the head: the feed's
   *  kinds), in the target's CJK face whatever the family (warm.mjs `cjkOnly`), so that its slices come during the box's run; once
   *  a part is read the page's own wave asks what it draws. In turn with the other waves (warmChain), once a task */
  function warmEarlySoon() {
    if (earlyQueued || disposed) return
    earlyQueued = true
    queueMicrotask(() => {
      earlyQueued = false
      warmChain = warmChain.then(async () => {
        if (disposed || state === 'refused' || !beforeParts() || !earlyTexts.size) return
        const kinds = await feed.kinds()
        if (!kinds || disposed || state === 'refused' || !beforeParts()) return
        const units = firstPageUnits(kinds, earlyTexts, { shown: shownNow() })
        if (units.length) await warmerNow().warm({ units }, 'other', { signal: warmAc.signal, cjkOnly: true })
      }).catch(e => warn('faces', e))
    })
  }
  /** the near pages warmed (warmPages), the page in the middle of the view first (before the places are laid out, no original open
   *  yet, page 1, where a paper opens), and the others only once a page has been put in place: until the first page is shown, its
   *  own wave alone shares the line with what that page waits for besides (the composed document's bytes, its delta), and no other
   *  page's (2602.23285v2 in Chinese, pages 1 and 2 together: 3.3 MB of slices beside the delta's 478 KB). Once a task */
  function warmSoon() {
    markSoon()
    if (warmQueued || disposed) return
    warmQueued = true
    queueMicrotask(() => {
      warmQueued = false
      const count = V.places.count()
      const near = []
      for (let n = 1; n <= count; n++) if (V.places.near(n)) near.push(n)
      const c = V.centre() || near[0] || 1
      near.sort((a, b) => Math.abs(a - c) - Math.abs(b - c) || a - b)
      const qs = !count ? [1] : counts.commits ? near : near.slice(0, 1)
      warmChain = warmChain.then(() => warmPages(qs)).catch(e => warn('faces', e))
    })
  }

  // ---------------------------------------------------------------- translating (the indicator; §11.8)
  /** each near page's indicator, by page: one element over the place (a child of the place itself, so that no swap of what the
   *  place shows takes it), holding one mark a paragraph */
  const marks = new Map()
  let markQueued = false, marksOff = false
  /** the indicators made again at the next microtask, for every near page */
  function markSoon() {
    if (markQueued || disposed) return
    markQueued = true
    queueMicrotask(() => {
      markQueued = false
      for (const n of [...marks.keys()]) if (!V.places.near(n)) unmark(n)
      for (let n = 1; n <= V.places.count(); n++) if (V.places.near(n)) markPage(n)
    })
  }
  /** each indicator's start on the document's timeline, ms, by page: every pass of its marks starts there (alignPasses) */
  const passStarts = new Map()
  /** whether the light can pass: a size container's units, which the light's picture is sized and placed in (the readers' floors
   *  before Firefox 110 and Safari 16 lack them); else the marks are still (engine.css --axt-tr-still) */
  function moves() {
    const C = globalThis.CSS
    return typeof C?.supports === 'function' && C.supports('width', '1cqh')
  }
  /**
   * One light for the page: each mark's pass (engine.css axt-tr-pass, a CSS animation of the mark's ::before, run by the
   * compositor) set to start when its page's indicator did, so that a mark put in with a later batch of rows shows its share of
   * the same light rather than a pass of its own. Where the browser gives no animations to read, each pass starts as its mark is
   * styled
   */
  function alignPasses(n, el) {
    const t0 = passStarts.get(n)
    if (typeof t0 !== 'number' || typeof el.getAnimations !== 'function') return
    try {
      for (const a of el.getAnimations({ subtree: true })) if (a.animationName === 'axt-tr-pass' && a.startTime !== t0) a.startTime = t0
    } catch { /* the browser's own: the passes left as they started */ }
  }
  function unmark(n) { const el = marks.get(n); if (el) { el.remove(); marks.delete(n); passStarts.delete(n) } }
  function unmarkAll() { for (const n of [...marks.keys()]) unmark(n) }
  /**
   * Page n's indicator: over each paragraph the parts read so far locate on it (its rectangles there, the union of them),
   * while the page is not laid and can still be (the layer open or opening, the page not failed): none for a unit whose class
   * the reader's toggles hide (never drawn: the author block, its names and places, and a bibliography's entries by default,
   * rules/content-classes.mjs), nor for one whose rows have ended with no row of it (it stays the original's). Its box in shares
   * of the page's view, so that no zoom moves it
   */
  function markPage(n) {
    const P = pages.get(n)
    // (none on a page that stays the original's: its parts hold no layout to lay, originalPageOf; nor once the host has said this
    // attempt's rows will not come, dropOthers, until another attempt begins)
    if (disposed || marksOff || state === 'refused' || P?.content?.wrap || P?.failed || P?.originalShown || originalPageOf(n)) return unmark(n)
    const place = V.places.page(n)
    const units = [], view = [], shownOn = classesOn(classes)
    for (const part of feed.state().parts) {
      // (a part's views run through its reach, the last page its layout runs to: a paragraph that crosses into a page no part
      // owns yet is located there all the same)
      if (Array.isArray(part.pages) && n >= part.pages[0] && n <= Math.max(part.pages[1], part.reach ?? 0) && part.views?.length >= 4 * (n - part.pages[0] + 1)) view.splice(0, 4, ...part.views.slice(4 * (n - part.pages[0]), 4 * (n - part.pages[0]) + 4))
      for (const [id, , rects] of part.left ?? []) {
        const on = (rects ?? []).filter(r => r[0] === n)
        if (!on.length || !unitShown(index?.kinds[id] ?? '', shownOn) || (rowsEnded && !rows.has(id))) continue
        units.push({ id, on })
      }
    }
    if (!place || !units.length || view.length !== 4 || !(view[2] > view[0]) || !(view[3] > view[1])) return unmark(n)
    const [x0, y0, x1, y1] = view, w = x1 - x0, h = y1 - y0
    // (none on a page the original shows turned, by its /Rotate or its view's: the parts' rectangles are in the page's own frame,
    // which a turned view shows otherwise; its view's rotation as PDF.js holds it, as the links read it)
    if (((V.places.view(n)?.viewport?.rotation ?? 0) % 360 + 360) % 360 !== 0) return unmark(n)
    const cq = (v, axis) => `${(100 * v).toFixed(3)}cq${axis}`
    let el = marks.get(n)
    if (!el) {
      el = document.createElement('div')
      el.className = moves() ? 'axt-translating' : 'axt-translating axt-translating-still'
      el.setAttribute('aria-hidden', 'true')
      marks.set(n, el)
      const t0 = globalThis.document?.timeline?.currentTime
      if (typeof t0 === 'number') passStarts.set(n, t0)
    }
    if (el.parentNode !== place) place.append(el)
    // (the card's padding and corner are CSS pixels at the reader's 100 %, the sheet's --axt-tr-pad-x, -pad-y and -radius, scaled
    // with the page: a CSS pixel at 100 % is 3/4 of a point, PDF.js's own, so a page w points wide is 4w/3 of them, and one of
    // them is 100/(4w/3) cqw of the page's overlay, --axt-tr-u)
    el.style.setProperty('--axt-tr-u', `${(100 / ((4 * w) / 3)).toFixed(5)}cqw`)
    const css = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null
    const px = v => { const x = Number.parseFloat(css?.getPropertyValue(v) ?? ''); return Number.isFinite(x) && x >= 0 ? x : null }
    const padX = (px('--axt-tr-pad-x') ?? PAD_X) * 0.75, padY = (px('--axt-tr-pad-y') ?? PAD_Y) * 0.75
    const boxes = units.map(({ id, on }) => ({ id, ax: Math.min(...on.map(r => r[1])), ay: Math.min(...on.map(r => r[2])), bx: Math.max(...on.map(r => r[3])), by: Math.max(...on.map(r => r[4])) }))
    // (each paragraph's card kept from one call to the next where it stays, its style changed in place: a card put in again would
    // begin its delay and its fade again, and rows come in batches)
    const had = new Map([...el.children].map(c => [c.dataset.axtU, c]))
    const want = new Set()
    boxes.forEach((b, i) => {
      // (never two cards over each other: each side's padding at most half the gap to the nearest mark beside it, above or below
      // where their columns meet, left or right where their lines do)
      let pX = padX, pY = padY
      boxes.forEach((o, j) => {
        if (j === i) return
        if (b.ax < o.bx && o.ax < b.bx) pY = Math.min(pY, Math.max(0, Math.max(o.ay - b.by, b.ay - o.by) / 2))
        if (b.ay < o.by && o.ay < b.by) pX = Math.min(pX, Math.max(0, Math.max(o.ax - b.bx, b.ax - o.bx) / 2))
      })
      // (its box and its padding in the page's shares, as container units of the page's overlay: the card's geometry and the
      // light's offset are the sheet's, engine.css)
      const style = `--axt-tr-x:${cq((b.ax - x0) / w, 'w')};--axt-tr-y:${cq((y1 - b.by) / h, 'h')};--axt-tr-w:${cq((b.bx - b.ax) / w, 'w')};--axt-tr-h:${cq((b.by - b.ay) / h, 'h')};--axt-tr-px:${cq(pX / w, 'w')};--axt-tr-py:${cq(pY / h, 'h')}`
      const key = String(b.id)
      want.add(key)
      let m = had.get(key)
      if (!m) {
        m = document.createElement('i')
        m.className = 'axt-translating-mark'
        m.dataset.axtU = key
        el.append(m)
      }
      if (m.getAttribute('style') !== style) m.setAttribute('style', style)
    })
    for (const [key, c] of had) if (!want.has(key)) c.remove()
    alignPasses(n, el)
  }

  // ---------------------------------------------------------------- the pages ahead (the prefetch, on the layer; §11.8)
  /** the pages ahead's run (its stop), the pages it is laying, and the pages it laid this door that draw nothing of the layer or
   *  failed (not laid ahead again each time the window moves: one that failed is asked again as it comes near) */
  let aheadAc = null, aheadOn = []
  const aheadNothing = new Set()
  /** the way the reader moves through the paper: 1 down, -1 up; and the near places' first and last when it was last read */
  let aheadDir = 1, nearLo = 0, nearHi = 0, nearQueued = false
  /** the near places' first and last page (the places near are a run of pages about the view: an IntersectionObserver's, no
   *  layout read); [0, 0] with none */
  function nearSpan() {
    let lo = 0, hi = 0
    for (let n = 1, count = V.places.count(); n <= count; n++) if (V.places.near(n)) { if (!lo) lo = n; hi = n }
    return [lo, hi]
  }
  /** the pages ahead now: the AHEAD_PAGES places past the near ones the way the reader moves, the nearest first */
  function aheadWindow() {
    const [lo, hi] = nearSpan(), count = V.places.count(), out = []
    if (!lo) return out
    for (let k = 1; k <= aheadPages; k++) { const m = aheadDir > 0 ? hi + k : lo - k; if (m >= 1 && m <= count) out.push(m) }
    return out
  }
  /** the near places moved (onNear, read once a task): the way the reader moves told by them, the last edge of the near run that
   *  moved past where it was (a run that shares no page with the one before is a jump, read on forward); a run under way whose page
   *  is no longer ahead, or that lays the other way, given up; the pages ahead asked for */
  function nearMoved() {
    if (nearQueued || disposed) return
    nearQueued = true
    queueMicrotask(() => {
      nearQueued = false
      if (disposed) return
      const [lo, hi] = nearSpan()
      if (!lo) return
      const dir = !nearLo || lo > nearHi || hi < nearLo ? 1 : hi > nearHi ? 1 : lo < nearLo ? -1 : aheadDir
      nearLo = lo
      nearHi = hi
      const turned = dir !== aheadDir
      aheadDir = dir
      if (aheadAc && (turned || aheadOn.some(q => !V.places.near(q) && !aheadWindow().includes(q)))) stopAhead()
      aheadSoon()
    })
  }
  /** whether the view's own pages hold the door: a near page asked of it, or one answered and being put in place */
  const viewBusy = () => committing > 0 || [...pages.values()].some(P => P.ask)
  /** whether pages may be laid ahead now: this attempt's rows ended (a host that translates as it shows is asked for nothing it has
   *  not translated), the door open, the document visible, the host's bound above 0 */
  const aheadOk = () => !disposed && !!door && state === 'open' && rowsEnded && aheadPages > 0 && globalThis.document?.visibilityState !== 'hidden'
  /** the pages ahead laid (layAhead), where no run of them is under way and the view's own pages hold nothing */
  function aheadSoon() {
    if (aheadAc || !aheadOk() || viewBusy()) return
    void layAhead().catch(e => warn('ahead', e))
  }
  /** the pages ahead given up: their wait, their faces' wave, their ask and their copy under way */
  function stopAhead() {
    // (the pages ahead's own asks, wave and copy let go, which aheadAc's signal reaches; a copy of the same page that a commit
    // began, the page come near meanwhile, is the commit's and goes on)
    aheadAc?.abort()
    aheadAc = null
    aheadOn = []
  }
  /** resolves in a turn of the main thread at background priority (scheduler.postTask's `background`: run once nothing of a higher
   *  priority waits; a task where the browser has no scheduler, the tests'), or rejects with an AbortError once `signal` aborts.
   *  Not an idle callback: Chromium gives a page no idle period while the reader scrolls (requestIdleCallback did not fire in
   *  the 6 s of a steady scroll, 2026-11-01, 1706.03762v7), the very time the pages ahead are for */
  function backgroundTurn(signal) {
    return new Promise((ok, no) => {
      const gone = () => no(Object.assign(new Error('the pages ahead were given up'), { name: 'AbortError' }))
      if (signal.aborted) { gone(); return }
      let timer = 0
      const S = globalThis.scheduler
      const stop = () => { clock.clear(timer); gone() }
      const done = () => { signal.removeEventListener('abort', stop); ok() }
      signal.addEventListener('abort', stop, { once: true })
      if (typeof S?.postTask === 'function') S.postTask(done, { priority: 'background', signal }).catch(() => {})
      else timer = clock.later(done, 0)
    })
  }
  /**
   * The AHEAD_PAGES pages past the near ones, the way the reader moves (nearMoved), while the reader scrolls as at rest: each laid
   * by the door and drawn at its place's k, kept as a drawing off the view (keepPixels) and put back as it comes near (bringBack),
   * so that a page comes into view translated. Background work: the window begun in a turn of the main thread at background
   * priority (backgroundTurn), and only while no page of the view is asked of the door or being put in place; its pages' faces
   * asked in one wave and the pages asked of the door at once (the nearest laid first), each copy drawn in a background turn; a page of the view asked gives the run up at
   * once (ask: stopAhead), its wave, its asks and its copy with it, and it begins again once the view's pages are in place. The
   * window read again once its pages are laid, so a reader who moves on moves it. Only with the right pane shown (V.centre) and the
   * document visible. A page near by the time it is laid is committed as any near page
   */
  async function layAhead() {
    if (aheadAc || !aheadOk() || viewBusy()) return
    const ac = (aheadAc = new AbortController()), my = gen, d = door
    const live = () => !ac.signal.aborted && !disposed && my === gen && aheadOk()
    try {
      for (;;) {
        await backgroundTurn(ac.signal)
        if (!live() || viewBusy() || !V.centre()) return
        const ms = aheadWindow().filter(q => {
          const P = rec(q)
          return !V.places.near(q) && !drawings.has(q) && !P.content?.wrap && !P.failed && !aheadNothing.has(q) && !originalPageOf(q)
        })
        if (!ms.length) return
        aheadOn = ms
        // (the window's faces in one wave, the nearest page's first, and its pages asked of the door at once, the nearest last: the
        // door lays the newest ask first and one page at a time, so the line and the door work on the window while the main
        // thread lays each in turn; v0's checks find the wave's slices loaded or loading)
        void (warmChain = warmChain.then(() => warmPages(ms, ac.signal)).catch(e => warn('faces', e)))
        const asks = new Map([...ms].reverse().map(m => [m, d.pageOf(m, { lang: doorTarget, signal: ac.signal })]))
        for (const a of asks.values()) a.catch(() => {})
        counts.ahead += ms.length
        for (const m of ms) {
          const P = rec(m)
          let laid
          try { laid = await asks.get(m) } catch (e) { if (isAbort(e) || !live()) return; aheadNothing.add(m); continue }
          if (!live()) return
          // (come near while it was laid: committed as any near page is)
          if (V.places.near(m)) { await commit(m, laid, my); continue }
          if (originalPageOf(m) || laid.hides === 0) { aheadNothing.add(m); continue }
          await backgroundTurn(ac.signal)
          if (!live()) return
          const k = kOf(m)
          if (k === null) { aheadNothing.add(m); continue }
          let got
          try { got = await copyAt(d, m, k, my, ac.signal) } catch (e) { if (isAbort(e) || !live()) return; aheadNothing.add(m); continue }
          if (!got) return
          if (!live()) { release(got.canvas); return }
          if (V.places.near(m)) { if (!(P.content?.gen === my && P.content.wrap)) putInPlace(m, drawingOf(m, laid, got, my), laid); else release(got.canvas); continue }
          keepFar(m, drawingOf(m, laid, got, my), laid)
          if (drawings.has(m)) counts.aheadKept++
        }
      }
    } catch {
      // (given up: its wait for a turn aborted)
    } finally {
      // (whatever ended it, nothing of the run is left asked: an ask it did not await, ended by a hidden document or another
      // door, is let go, and so is what its wave has not begun)
      ac.abort()
      if (aheadAc === ac) { aheadAc = null; aheadOn = [] }
    }
  }

  // ---------------------------------------------------------------- the view's events
  let recopyTimer = 0
  const offs = [
    V.onNear((n, on) => {
      if (disposed) return
      if (on) {
        // a page laid before put back as it was, in this task; else (a page whose layer failed or was let go too) asked again
        if (!bringBack(n)) {
          rec(n).failed = false
          askSoon(n)
        }
        warmSoon()
      } else {
        toAsk.delete(n)
        abortAsk(n)
        rearm.delete(n)
        // a page this door laid is retired; a drawing kept from an earlier door goes, the place back to its own content; either
        // held while it holds the focus (farGone)
        farGone(n)
      }
      windowed()
      // (the window ahead moves with the near places, the way the reader moves)
      nearMoved()
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
      // the places laid out again for another page count let their content go, and the drawings kept off the view with them
      for (const [n, P] of pages) if (P.content && !V.places.page(n)?.contains(P.content.wrap ?? null) && P.content.wrap) { dropContent(P.content); P.content = null }
      dropDrawings()
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
      // (the pages kept drawn by a door before keep their shapes muted: the new shapes describe none of them either)
      for (const [n, P] of pages) if (P.content?.wrap && P.content.gen !== gen) right.mute(n, true)
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
    warmSoon()
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
    warmSoon()
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
      const key = `${state}|${why}|${ready}|${total()}|${ruled.size}`
      if (key === layerTold) return
      layerTold = key
      V.emit({ type: 'layer', state, ...(why ? { why } : {}), laid: ready, total: total(), ...(ruled.size ? { original: ruled.size } : {}) })
    }
    if (!soon) { clock.cancel(layerFrame); layerFrame = 0; tell(); return }
    if (!layerFrame) layerFrame = clock.frame(() => { layerFrame = 0; if (!disposed) tell() })
  }

  const side = {
    tell(refs) {
      if (disposed || state === 'refused') return
      feed.tell(refs ?? {})
      // (units told after rows read early: their kinds now to be had, the early wave asked again)
      if (refs?.units?.length && earlyTexts.size && beforeParts()) warmEarlySoon()
    },
    index: async () => { const i = await feed.index(); return disposed || state === 'refused' ? null : i },
    take(given) {
      if (disposed || !given?.length) return
      for (const r of given) if (Array.isArray(r) && Number.isInteger(r[0])) rows.set(r[0], r)
      // (taken while no part is read, a first open's head told before its first part: the early wave's too)
      if (state !== 'refused' && beforeParts() && keepEarly(given)) warmEarlySoon()
      if (door) { try { door.take(given) } catch (e) { warn('rows', e) } }
      if (contents?.take(given)) outlineSoon()
      if (left) startsFor(given.filter(r => r?.[4]).map(r => r[0]))
      warmSoon()
    },
    end() {
      if (disposed) return
      rowsEnded = true
      if (door && !rowsTold) { rowsTold = true; door.end() }
      aheadSoon()
      // (a paragraph with no row now is the original's: its mark goes)
      markSoon()
    },
    /**
     * The layer in another language (`to`, a target of the rules'), in place: the door laying the target before is let go at once
     * (its generation past, so nothing it lays or copies is put in place, and no page is asked of it in the new language), then
     * the open again as again() does, over the same composed document (composedFor: the latest, read already). The rows are the
     * new target's, taken as they come; a laid page shows the target before until the new one's commits (DR7), fails (the
     * original's page), or the host lets it go (dropOthers)
     */
    retarget(to) {
      if (disposed || state === 'refused' || typeof to !== 'string' || !to || to === target) return
      target = to
      // (the target before's waves begin no slice more)
      warmAc.abort()
      warmAc = new AbortController()
      dropped = false
      gen++
      offPage?.()
      offPage = null
      const was = door
      door = null
      doorParts = []
      try { was?.dispose() } catch (e) { warn('dispose', e) }
      for (const n of pages.keys()) { abortAsk(n); for (const c of pages.get(n).copyAcs ?? []) c.abort() }
      side.again()
    },
    /** the reader's toggles changed (docs/route/orphan-text.md §8): the door opened again over the same documents and parts, the rows
     *  so far given it again, as after a fork; each laid page keeps its drawing until the new door's commits (a class it no longer
     *  shows is then the original's), nothing fetched and nothing translated. The same toggles again change nothing */
    setClasses(next) {
      if (disposed || state === 'refused') return
      const same = (a, b) => JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b ?? {}).sort())
      if (same(next, classes)) return
      classes = next ?? null
      // (the translating indicator reads them too: a class no longer shown loses its marks, one turned on gains them)
      markSoon()
      warmAc.abort()
      warmAc = new AbortController()
      gen++
      offPage?.()
      offPage = null
      const was = door
      door = null
      doorParts = []
      try { was?.dispose() } catch (e) { warn('dispose', e) }
      for (const n of pages.keys()) { abortAsk(n); for (const c of pages.get(n).copyAcs ?? []) c.abort() }
      reopenWanted = true
      void pump()
    },
    /** every page that still shows a drawing of a door before (another target's, or this one's before it was opened again) back to
     *  the original's page: the host's word that this target's rows will not come (its service failed, or it stopped short) */
    dropOthers() {
      if (disposed) return
      dropped = true
      // (this attempt's rows will not come: no page says it is being translated until another attempt begins, again)
      marksOff = true
      unmarkAll()
      dropDrawings(c => c.target !== target || c.gen !== gen)
      let hid = false
      for (const [n, P] of pages) {
        if (!P.content || (P.content.target === target && P.content.gen === gen)) continue
        // (a page holding the focus is kept until the focus leaves it, as a far page is: unlaid, it would take the focus with it)
        if (holdsFocus(n)) { keptForFocus.add(n); continue }
        if (dropPage(n)) hid = true
      }
      if (hid) startsFor([...rows.keys()])
    },
    /** rows the host read before any part, for the first page's early wave of faces alone (warmEarlySoon): not taken, nothing
     *  laid of them; nothing once a part is read. Rows of another target are dropped with it (retarget, again) */
    warmEarly(given) {
      if (disposed || state === 'refused' || !beforeParts()) return
      if (keepEarly(given)) warmEarlySoon()
    },
    again() {
      if (disposed || state === 'refused') return
      marksOff = false
      for (const P of pages.values()) P.originalShown = false
      rows.clear()
      earlyTexts.clear()
      rowsEnded = false
      stopAhead()
      leftStarts.clear(); rightStarts.clear()
      shapesChanged()
      // the contents' titles are the attempt's rows': the source's until its rows come
      if (contents?.clearTexts()) outlineSoon()
      reopenWanted = true
      void pump()
      markSoon()
    },
    /** the ids of the units whose rows the open door's page still waits for (its closure's, Need(page)): a host translating
     *  as it shows translates them first; [] with no door, a page out of the paper or one ready */
    rowsFor(page) {
      if (disposed || !door) return []
      try { return door.rowsFor(page) } catch { return [] }
    },
    coverage() {
      return { laid: ready, original: ruled.size, total: total(), late: 0, failed, stalled: stalls, skipped: {}, parts: door?.stats().parts ?? { through: 0, told: 0 } }
    },
    probe() {
      let laidNow = 0, retiredNow = 0, asking = 0
      for (const P of pages.values()) { if (P.content?.wrap) laidNow++; else if (P.content) retiredNow++; if (P.ask) asking++ }
      return {
        state, why, gen, target, index: !!index, bound: bound === true, parts: doorParts.length, read: feed.state().parts.length, ended: partsEnded,
        rows: rows.size, rowsEnded, ready, failed, stalled: stalls, laid: laidNow, retired: retiredNow, asking,
        composed: counts.composed, docs: entries.size, opens: counts.opens, forks: counts.forks, asked: counts.asked, commits: counts.commits, copies: counts.copies, retirements: counts.retired,
        leftParts: counts.leftParts, leftAsked: leftAsked.size, kept: kept.size, commitsRing: ring.join(' '), texts: counts.texts, textsRing: textRing.join(' '),
        drawings: drawings.size, drawnPixels, restored: counts.restored, dropped: counts.dropped, ahead: counts.ahead, aheadKept: counts.aheadKept,
        shapesLaid: right ? Array.from({ length: V.places.count() }, (_, i) => right.laid(i + 1)).filter(Boolean).length : 0,
        muted: right ? right.muted().join(' ') : '',
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      // (the side let go: no first page of it for the places ahead to wait for)
      V.places.letAheadGo?.()
      detach()
      feed.dispose()
      ac.abort()
      warmAc.abort()
      unmarkAll()
      leftAc.abort()
      for (const off of offs) off()
      offPage?.()
      const was = door
      door = null
      try { was?.dispose() } catch { /* the door's own */ }
      clock.clear(recopyTimer)
      clock.cancel(outlineFrame); clock.cancel(headingFrame); clock.cancel(layerFrame)
      for (const id of idles) cancelIdleCallback(id)
      idles.clear()
      stopAhead()
      dropDrawings()
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

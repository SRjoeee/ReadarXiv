// The layer's side of the reading view (the shared reader view's contract §1.2, §2.2–§2.7, §3; docs/PDF-READER.md §11.8): the
// one sink of a paper's layer. The host tells it what it hears (refs, rows, ends) and gives it a transport and two openers; the
// side fetches and reads through its feed (feed.mjs), binds the base, waits for the original, opens the composed document and
// the engine's door over it, adds each later part in page order (a part with a tail over the composed document through it),
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
// The highlight's data (§2.7): the left's shapes made page by page from the parts' rectangles and, on the first want of a page
// from either pane (trap 2: nothing fetched before), its left part; the right's the left's mirrored where its place shows the
// original and its own over the laid page's words where it shows the layer, with copies of the left's tokens for the units it
// shows as the original's (shapes.mjs layerShapes: trap 1). Sentences where both panes have a unit's starts. The contents
// (contents.mjs) and the heading read are told on the view's channel. Lifted, for the drawing over the places, from the web's
// web/src/layer/side.ts (drawOver: the copy's source and resolution, the stall, the copies let go) and, for the document's
// open and the open again, from its visit.ts.
import { openLayer as theDoor, PDF_OPTIONS } from '../layer-proto/reader.mjs'
import { unitOf } from '../layer-proto/rows.mjs'
import { plainTranslated } from '../translate/mt.mjs'
import { createContents } from './contents.mjs'
import { createFeed } from './feed.mjs'
import { figureRegions } from './figures.mjs'
import { pathsOf, wantsFloats } from './floats.mjs'
import { internalsOf } from './reader-view.mjs'
import { createShapes, layerShapes } from './shapes.mjs'

/** how long a page asked for, once told `laying`, may take to be laid before its place shows the original (the web's D5-R7d) */
export const PAGE_MS = 30_000
/** the most pixels a copy is drawn at (iOS's canvas cap; PDF.js's own canvases are capped so too) */
export const COPY_PIXELS = 2 ** 24
/** how much a source's k may differ from the place's for the copy to be drawn from it */
const K_SLACK = 0.02
/** how long after a zoom's last step the copies are drawn again: PDF.js draws its own pages 400 ms after it */
export const RECOPY_MS = 600
/** the pages wanted last whose geometry is kept beside the near ones (§3.2) */
const WANTED_KEPT = 20
/** the commits the probe keeps */
const RING = 32
const isAbort = e => e?.name === 'AbortError'
const release = c => { if (c) { c.width = 0; c.height = 0; c.remove() } }
const isPrefix = (a, b) => a.length <= b.length && a.every((p, i) => p.sha256 === b[i].sha256)

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
  let index = null, bound = null, door = null, doorParts = [], gen = 0, token = null, offPage = null
  let partsEnded = false, reopenWanted = false
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
  /** the composed document through the last tail of `parts`: the latest again where it is that one; else opened, the side's
   *  hold moved to it */
  async function composedFor(parts) {
    const withTail = parts.filter(p => p.addon?.tail)
    const key = withTail.at(-1)?.sha256 ?? null
    if (latest && !latest.gone && latest.key === key) return latest.doc
    let tail = null
    if (withTail.length) {
      tail = new Uint8Array(withTail.reduce((n, p) => n + p.addon.tail.length, 0))
      let at = 0
      for (const p of withTail) { tail.set(p.addon.tail, at); at += p.addon.tail.length }
    }
    const task = o.composed(tail, Object.freeze({ ...V.assets, ...PDF_OPTIONS, disableAutoFetch: true }))
    if (!task?.promise) throw new Error('the composed opener gave no loading task')
    const entry = { task, doc: null, key, holders: new Set(['side']), gone: false }
    entries.add(entry)
    counts.composed++
    let doc
    try { doc = await task.promise } catch (e) { destroy(entry); throw e }
    if (disposed || entry.gone) { destroy(entry); throw new Error('the layer side is disposed') }
    entry.doc = doc
    byDoc.set(doc, entry)
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
      if (!disposed && !isAbort(e)) refuse(e?.why ?? 'open', e)
    } finally { pumping = false }
  }
  async function step() {
    if (disposed || state === 'refused') return
    const f = feed.state()
    if (f.refused) return refuse(f.refused)
    if (!f.index) return
    if (!index) indexed(f.index)
    // the original open first: the extension's base check digests the bytes it holds (the web's is bound by its route)
    if (!V.left.doc()) return
    if (bound === null) {
      state = 'opening'
      emitLayer()
      bound = await Promise.resolve().then(() => o.bind(index.head.base)).then(v => v === true, () => false)
      if (disposed) return
      if (!bound) return refuse('base')
    }
    shapeParts(f.parts)
    const parts = f.parts
    if (!door || reopenWanted || !isPrefix(doorParts, parts)) {
      if (door && !reopenWanted) counts.forks++
      await reopen(parts)
      if (!door) return
    }
    for (let i = doorParts.length; i < parts.length && door; i++) {
      const part = parts[i], my = gen
      if (part.addon?.tail) {
        const doc = await composedFor(parts.slice(0, i + 1)).catch(e => { throw Object.assign(e ?? new Error('composed'), { why: 'composed' }) })
        if (disposed || my !== gen || !door) return
        door.addPart(part, { doc })
        held(doc, token)
      } else door.addPart(part)
      doorParts = parts.slice(0, i + 1)
      counts.added++
    }
    if (f.ended && door && !partsEnded && doorParts.length === parts.length) { partsEnded = true; door.endParts() }
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
    rowsTold = false
    offPage?.()
    offPage = null
    if (was) { try { was.dispose() } catch (e) { warn('dispose', e) } }
    leftAc.abort()
    leftAc = new AbortController()
    for (const p of leftAsked) if (!left?.has(p)) leftAsked.delete(p)
    for (const n of pages.keys()) { abortAsk(n); const P = pages.get(n); if (P.content && !P.content.wrap) unlay(n); P.failed = false; P.stalled = false }
    rearm.clear()
    ready = 0
    failed = 0
    right?.reset()
    shapesChanged()
    state = 'opening'
    emitLayer()
    const doc = await composedFor(parts).catch(e => { throw Object.assign(e ?? new Error('composed'), { why: 'composed' }) })
    if (disposed || my !== gen) return
    const me = {}
    let layer
    try {
      layer = await open({
        index, doc, parts, target: o.target, faceSources: o.faceSources, hyphUrl: o.hyphUrl, ...(o.rules ? { rules: o.rules } : {}),
        leftPart: (_page, ref) => o.fetchObject(ref, ac.signal),
        onRetired: d => retired(d, me),
      })
    } catch (e) { throw Object.assign(e ?? new Error('open'), { why: 'open' }) }
    if (disposed || my !== gen) { layer.dispose(); return }
    door = layer
    token = me
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
    for (let n = 1; n <= V.places.count(); n++) if (V.places.near(n)) ask(n)
  }

  // ---------------------------------------------------------------- the rows
  /** the rows of the attempt, latest per unit (held until the door opens, and for the contents and the starts); whether they
   *  have ended, and whether the door was told */
  const rows = new Map()
  let rowsEnded = false, rowsTold = false

  // ---------------------------------------------------------------- the pages (§2.3)
  /** each page's record, scalars and the elements of a near laid page only: its ask (and its clock), what its place shows of
   *  the layer (`content`: its wrapper, SVG, copy and k, the door's generation it was drawn from; or `wrap` null for an empty
   *  element, retired), whether it failed or stalled, a copy under way */
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
      ready++
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
    if (P.content?.gen === gen) return
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
  }
  /** what the place shows of the layer let go, the place back to its pre-layer content */
  function unlay(n) {
    const P = pages.get(n)
    if (!P?.content) return
    release(P.content.copy)
    P.content = null
    V.places.restore(n)
  }
  /** a laid page far from the view: its SVG and copy let go, an empty element in its place (no page view made of it) */
  function retire(n) {
    const P = rec(n)
    if (P.content && !P.content.wrap) return
    const was = P.content
    P.content = { wrap: null, svg: null, copy: null, k: 0, gen }
    if (V.places.swap(n, empty())) counts.retired++
    else P.content = null
    release(was?.copy)
  }
  /** a near page asked of the door (once a door), unless it shows this door's layer */
  function ask(n) {
    const P = rec(n)
    if (!door || disposed || !V.places.near(n)) return
    if (P.content?.wrap && P.content.gen === gen) return
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
  /** the page as PDF.js drew it at about k: the left's canvas, else the place's own page view's, else the page drawn here from
   *  the latest composed document (its pages 1 to N are the original's) */
  async function sourceOf(n, k, fromDoc = false) {
    const vp = V.places.view(n)?.viewport
    const w = vp.width / vp.scale
    if (!fromDoc) {
      for (const [from, c] of [['left', V.left.canvas(n)], ['place', V.places.canvas(n)]]) {
        if (!c?.width || !c.height) continue
        const kc = c.width / w
        if (Math.abs(kc - k) / k <= K_SLACK) return { canvas: c, k: kc, from }
      }
    }
    const page = await latest.doc.getPage(n)
    const viewport = page.getViewport({ scale: k })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    try {
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise
    } catch (e) { release(canvas); page.cleanup?.(); throw e }
    return { canvas, k, from: 'doc', page }
  }
  /** the page's copy at the place's k, drawn by `d` (the door asked, which a later open does not replace here) from the page's
   *  source; again from the document where the source was let go meanwhile */
  async function copyAt(d, n, k, my) {
    let src = await sourceOf(n, k)
    try {
      let canvas = await d.copyOf(n, src.canvas, src.k)
      if (src.from !== 'doc' && !src.canvas.width) {
        release(canvas)
        src = await sourceOf(n, k, true)
        canvas = await d.copyOf(n, src.canvas, src.k)
      }
      if (disposed || my !== gen) { release(canvas); return null }
      counts.copies++
      return { canvas, k: src.k }
    } finally { if (src.from === 'doc') { release(src.canvas); src.page?.cleanup?.() } }
  }
  /** a laid page in its place: its copy, then the copy and the SVG put in one task */
  async function commit(n, laid, my) {
    const P = rec(n), k = kOf(n), d = door
    if (k === null || !d) return
    let got
    try { got = await copyAt(d, n, k, my) } catch (e) { if (!disposed && my === gen) warn('copy', e); return }
    if (!got) return
    if (!V.places.near(n) || P.content?.gen === my && P.content.wrap) { release(got.canvas); if (!V.places.near(n)) retire(n); return }
    laid.svg.setAttribute('viewBox', `0 0 ${laid.w} ${laid.h}`)
    laid.svg.setAttribute('preserveAspectRatio', 'none')
    got.canvas.className = 'axt-layer-copy'
    got.canvas.setAttribute('aria-hidden', 'true')
    const wrap = document.createElement('div')
    wrap.className = 'axt-layer'
    wrap.append(got.canvas, laid.svg)
    const was = P.content
    if (!V.places.swap(n, wrap)) { release(got.canvas); return }
    release(was?.copy)
    P.content = { wrap, svg: laid.svg, copy: got.canvas, k: got.k, gen: my }
    P.failed = false
    counts.commits++
    ring.push(`${n}@${Math.round(clock.now())}`)
    if (ring.length > RING) ring.shift()
    // the right's shapes of the page: its words (the units the layer shows as the original's from the left's tokens)
    if (right?.lay(n, laid.words)) startsFor([...laid.words.spans.map(s => s[0]), ...laid.words.original])
  }
  /** a laid page's copy drawn again at the place's new k (a zoom): from the left's canvas once PDF.js drew it at that k */
  async function recopy(n) {
    const P = pages.get(n), k = kOf(n)
    if (!P?.content?.wrap || P.content.gen !== gen || !door || k === null || !V.places.near(n)) return
    if (Math.abs(P.content.k - k) / k <= K_SLACK) return
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
    } catch (e) { if (!disposed) warn('copy', e) } finally {
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
        ask(n)
      } else {
        abortAsk(n)
        rearm.delete(n)
        if (pages.get(n)?.content?.wrap) retire(n)
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
      if (pages.get(n)?.content?.wrap) void recopy(n)
      floatsFor(n, error)
    }),
    V.onScrolled(() => {
      if (disposed) return
      // the pages given up at PAGE_MS asked again, where they are near
      if (rearm.size) { const again = [...rearm]; rearm.clear(); for (const n of again) { abortAsk(n); ask(n) } }
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
      shapedParts = []
      leftStarts.clear(); rightStarts.clear()
      leftAsked.clear(); floatsAsked.clear()
      outlineSoon()
    }
    const more = parts.slice(shapedParts.length)
    if (!more.length) return
    left.addParts(more)
    shapedParts = parts
    if (contents.addParts(more)) outlineSoon()
    shapesChanged()
  }
  /** a want of page p (the pointer over it, either pane): its left part fetched once, on the first */
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
    if (leftAsked.has(p)) return
    if (!door) { wantsBefore.add(p); return }
    leftAsked.add(p)
    const my = gen, L0 = left
    door.leftPageOf(p, { signal: leftAc.signal }).then(lp => {
      if (disposed) return
      // (the shapes made again for a fork meanwhile: a left part of the chain let go is not theirs; asked again on a want)
      if (left !== L0) { leftAsked.delete(p); return }
      // in a task of its own: the page's part of the layout, its sentences and the panes' shapes
      clock.later(() => {
        if (disposed || left !== L0) return
        counts.leftParts++
        if (left.addPage(lp)) {
          startsFor(lp.spans.map(s => s[0]))
          floatsFor(p, null)
        }
      }, 0)
    }, e => {
      if (disposed || isAbort(e) || my !== gen) { if (my !== gen) leftAsked.delete(p); return }
      left?.refuse(p, e)
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
      reopenWanted = true
      void pump()
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

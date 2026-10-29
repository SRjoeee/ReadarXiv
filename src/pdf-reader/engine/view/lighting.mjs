// The highlight's paint and what the pointer lights (docs/PDF-READER.md §17), over one seam: a pane is read through its
// Shapes alone (reader-view.d.mts) — its runs, a run's block and a sentence's shape, what a point lights — in its own
// pages' coordinates. The left's shapes are made of its layout, the right's its own over its own token copies (the shared
// reader view's contract §2.7: no run object of the left reaches the right, since what was drawn is kept by run). A pane
// with no shapes yet lights nothing; the pointer over a page of it is a want of that page, which the layer side answers
// with the page's geometry, and then the pointer is looked at again.
//
// What a unit paints: a block per run (one page and one column of it), padded PAD beside; where its sentences are known on
// both panes and hold its words there, the sentence under the pointer instead (one outline per run). The look is the band's
// (engine.css .axt-hl). Each element is laid at its page's viewport scale and follows a zoom or a pinch by transform
// (overlay.mjs pinned); the page's highlight layer is kept through PDF.js's redraws by the view (keepOverlays).
import { pinned } from './overlay.mjs'
import { shapePath } from './highlight.mjs'

/** the pad beside a block, in CSS pixels */
const PAD = 3
/** a block's and a shape's corners, in CSS pixels (engine.css .axt-hl) */
const RADIUS = 3
/** how many drawn elements are kept to be put back when the same is lit again at the same scale */
const DRAWN_KEPT = 512

const same = (a, b) => a === b || (!!a && !!b && a.id === b.id && a.s === b.s)

/** whether a unit's sentences hold its words on a pane by `starts` (its shapes' fits), kept by the starts' array; false
 *  on a pane with no shapes; undefined where that is not to be told without working a page out (not in a frame) */
function fitOn(side, id, starts, fitted, now) {
  let f = fitted.get(starts)
  if (f === undefined && side.shapes) {
    f = side.shapes.fits(id, starts, now)
    if (f !== undefined) fitted.set(starts, f)
  }
  return side.shapes ? f : false
}

/**
 * The paint of the two panes (`o.sides`: each the view's pane object, which the lighting keeps its own fields on), through
 * `o.layerOf(side, page)` (a page's highlight layer, made on first use), `o.box(side, rect)` (a rectangle of PDF units in
 * its page's CSS pixels), `o.scaleOf(side, page)` (its viewport's scale), `o.pointAt(side, x, y)` (a point of the screen
 * on a pane's pages), `o.on()` (the highlight on), `o.want(side, page)`, `o.again()` (the pointer looked at again),
 * `o.later(cb)` and `o.clear(id)` (a task of its own, and its end)
 */
export function createLighting(o) {
  const [left, right] = o.sides
  const other = side => (side === left ? right : left)
  for (const side of o.sides) Object.assign(side, { shapes: null, starts: null, lit: [], shows: null })
  /** what is lit: { id, s }, a unit's sentence s, or the whole unit where s is -1; null for nothing */
  let lit = null
  /** the elements each run's sentences (and its block, -1) were drawn as, by the run, kept to be put back when lit again at
   *  the same scale and by the same starts: a sweep lights the same few again and again */
  let drawnFor = new WeakMap(), drawnKept = 0
  const fitted = new WeakMap()
  const fitsWanted = new Set()
  let fitTimer = 0

  /** a unit's starts on `side` where it lights by sentence: the starts on both panes, as many on each, and each pane's
   *  shapes holding its words by them; null where it lights whole; a fit still to be worked out is asked for in a task of
   *  its own, and the unit lights whole meanwhile (null) */
  function startsOf(side, id) {
    const o2 = other(side), mine = side.starts?.get(id), theirs = o2.starts?.get(id)
    if (!mine || !theirs || mine.length !== theirs.length) return null
    const a = fitOn(side, id, mine, fitted, false), b = fitOn(o2, id, theirs, fitted, false)
    if (a === undefined || b === undefined) { wantFit(id); return null }
    return a && b ? mine : null
  }
  function wantFit(id) {
    if (fitsWanted.has(id)) return
    fitsWanted.add(id)
    if (fitsWanted.size > 1) return
    fitTimer = o.later(() => {
      fitTimer = 0
      for (const u of fitsWanted) for (const s of o.sides) { const st = s.starts?.get(u); if (st) fitOn(s, u, st, fitted, true) }
      const again = lit != null && fitsWanted.has(lit.id)
      fitsWanted.clear()
      if (again) for (const s of o.sides) paint(s)
      o.again()
    })
  }

  /** what is lit, painted on a pane: written only, every number from its shapes and its pages' viewports. A unit alone, never its
   *  float (the owner, 2026-10-30: a caption lights by sentence, a table cell by cell, a picture nothing; floats.mjs floatHitOf) */
  function paint(side) {
    const starts = lit != null && lit.s >= 0 && side.shapes ? startsOf(side, lit.id) : null
    // a sentence lit whose fit is on its way keeps what is drawn for it, and is drawn anew when it lands
    if (lit != null && lit.s >= 0 && !starts && fitsWanted.has(lit.id) && same(side.shows, lit)) return
    for (const el of side.lit) el.remove()
    side.lit = []
    side.shows = null
    if (lit == null || !side.shapes) return
    if (lit.s >= 0 && !starts) return
    side.shows = lit
    for (const run of side.shapes.runs(lit.id)) {
      const layer = o.layerOf(side, run.page)
      if (!layer) continue
      const s = o.scaleOf(side, run.page)
      const kept = drawnFor.get(run)?.get(starts ? lit.s : -1)
      if (kept && kept.scale === s && kept.starts === starts) { layer.append(kept.el); side.lit.push(kept.el); continue }
      const boxes = (starts ? side.shapes.sentence(run, starts, lit.s, PAD / s) : [side.shapes.block(run, PAD / s)]).map(r => o.box(side, r))
      if (!boxes.length) continue
      let el
      const X0 = Math.min(...boxes.map(b => b.left)), Y0 = Math.min(...boxes.map(b => b.top))
      const local = boxes.map(b => ({ x0: b.left - X0, x1: b.left + b.width - X0, y0: b.top - Y0, y1: b.top + b.height - Y0 }))
      const box = { left: X0, top: Y0, width: Math.max(...local.map(b => b.x1)), height: Math.max(...local.map(b => b.y1)) }
      if (boxes.length === 1) { el = document.createElement('div'); el.className = 'axt-hl' } else {
        el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        el.setAttribute('class', 'axt-hl axt-hl-shape')
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        path.setAttribute('d', shapePath(local, RADIUS))
        el.append(path)
      }
      // scaled with the page while a pinch lasts (overlay.mjs pinned)
      Object.assign(el.style, pinned(box, s))
      layer.append(el)
      side.lit.push(el)
      ;(drawnFor.get(run) ?? drawnFor.set(run, new Map()).get(run)).set(starts ? lit.s : -1, { scale: s, starts, el })
      if (++drawnKept > DRAWN_KEPT) { drawnFor = new WeakMap(); drawnKept = 0 }
    }
  }
  function light(target) {
    if (!o.on()) target = null
    if (same(target, lit)) return
    lit = target
    for (const s of o.sides) paint(s)
  }

  return {
    light,
    lit: () => lit,
    paint,
    /** what the pointer lights at a point of the screen on a pane (the pointer's find): a want of the page it is over, then
     *  the unit whose painted shape holds it, by its shapes; null over nothing, or on a pane with no shapes */
    find(side, x, y) {
      if (!o.on()) return null
      const at = o.pointAt(side, x, y)
      if (!at) return null
      o.want(side, at.page)
      if (!side.shapes) return null
      const hit = side.shapes.hit(at.page, at.x, at.y, PAD / at.scale, id => startsOf(side, id))
      if (!hit) return null
      if (fitsWanted.has(hit.id)) return lit?.id === hit.id ? lit : null
      return { id: hit.id, s: hit.s ?? -1 }
    },
    /** a pane's shapes and its sentence starts (null: none): what is lit painted again on both panes (whether a unit lights
     *  by sentence is read of both), and what a resting pointer is over looked at again */
    setShapes(side, shapes, starts = null) {
      side.shapes = shapes
      side.starts = starts
      drawnFor = new WeakMap(); drawnKept = 0
      for (const s of o.sides) paint(s)
      o.again()
    },
    dispose() {
      o.clear(fitTimer)
      lit = null
      for (const s of o.sides) { for (const el of s.lit) el.remove(); s.lit = []; s.shows = null; s.shapes = null; s.starts = null }
    },
  }
}

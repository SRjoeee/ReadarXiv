// Synchronised scrolling. Two parts:
//  - the map between two different layouts, with no DOM: the units both sides are read by, a coordinate through them that
//    does not depend on either layout, and a map between the two sides' scroll positions, whose slope over the reader's view
//    is the speed the "matched" mode moves the other side at (exp-freeze-2026-10-07:experiments/pdf-bilingual/REPORT.md,
//    sixteenth addendum). The extension's compiled-copy session reads it; it stays exported until that session is parked;
//  - the identity follower (createFollower, at the end): the reading view's, where both panes hold the original's pages at
//    its sizes and zoom (docs/PDF-READER.md §11.7), so that the other pane moves by the reader's own steps and is levelled
//    at rest by the same point of the same page. No map is needed.
//
// The coordinate λ: the chain's k-th unit covers [k, k + 1), and on each side its i-th of n lines covers
// [k + i/n, k + (i + 1)/n). A side's position at λ is a height in its scroll coordinates, and the line at a height is a λ:
// the two sides meet in λ, whatever their layouts.

/**
 * The units the two sides are read by, in the order both read them: of `units` ([{ id, L, R }] in source order, each
 * side { stream, lines }), the heaviest run whose stream index — the text layer's reading order — rises on both sides,
 * weighed by lines. A unit found out of order on one side would fold the map back; ordered by height instead, the two
 * columns of a page interleave and most units drop out (72 of 132 kept on 2608.04322, measured)
 */
export function flowChain(units) {
  const n = units.length, best = new Array(n), prev = new Array(n).fill(-1)
  let tail = -1
  for (let a = 0; a < n; a++) {
    const w = units[a].L.lines.length + units[a].R.lines.length
    best[a] = w
    for (let b = 0; b < a; b++) {
      if (units[b].L.stream < units[a].L.stream && units[b].R.stream < units[a].R.stream && best[b] + w > best[a]) { best[a] = best[b] + w; prev[a] = b }
    }
    if (tail < 0 || best[a] > best[tail]) tail = a
  }
  const out = []
  for (let a = tail; a >= 0; a = prev[a]) out.unshift(units[a])
  return out
}

/** one side's lines of the chain in λ order: { lam0, lam1, top, bot, band, page, k } */
export function lineTable(chain, side) {
  const out = []
  chain.forEach((u, k) => {
    const lines = u[side].lines, n = lines.length
    lines.forEach((l, i) => out.push({ ...l, lam0: k + i / n, lam1: k + (i + 1) / n, k }))
  })
  return out
}

/** the line of a table that holds λ (the last one when λ is past the end), by bisection */
function lineIndex(table, lam) {
  let lo = 0, hi = table.length - 1
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (table[mid].lam0 <= lam) lo = mid; else hi = mid - 1 }
  return lo
}
/** a side's height at λ: down its line in proportion */
export function posAt(table, lam) {
  if (!table.length) return 0
  const l = table[lineIndex(table, lam)], f = Math.min(1, Math.max(0, (lam - l.lam0) / (l.lam1 - l.lam0)))
  return l.top + f * (l.bot - l.top)
}
/**
 * Knots (pairs of heights, left and right) of the map between the two sides: at every line boundary of either side —
 * within a unit, a line's end on one side meets the same λ on the other — where both sides' lines run across the page;
 * where either side sets the text in two columns no map keeps every paragraph level (reading order is not scroll order
 * there), and one knot per page of the left side stands for its lines: their mean height against the mean height of
 * their λ on the right. Kept only where both heights rise, between the two documents' ends
 */
export function knots(chain, L, R, { endL, endR }) {
  const raw = []
  const isDouble = k => chain[k].L.lines.some(l => l.band !== 'full') || chain[k].R.lines.some(l => l.band !== 'full')
  // a side's height just before λ (the end of the line that ends there) and just after it (the line that starts there)
  const before = (t, lam) => { const i = lineIndex(t, lam); return t[i].lam0 === lam && i > 0 ? t[i - 1].bot : posAt(t, lam) }
  const after = (t, lam) => posAt(t, lam)
  for (let k = 0; k < chain.length; k++) {
    if (isDouble(k)) {
      // a run of two-column units: one knot per left page, its ends tied to the units around it
      let e = k
      while (e + 1 < chain.length && isDouble(e + 1)) e++
      raw.push([after(L, k), after(R, k)])
      const byPage = new Map()
      for (const l of L) if (l.k >= k && l.k <= e) (byPage.get(l.page) ?? byPage.set(l.page, []).get(l.page)).push(l)
      for (const ls of byPage.values()) {
        const mean = f => ls.reduce((s, l) => s + f(l), 0) / ls.length
        raw.push([mean(l => (l.top + l.bot) / 2), mean(l => posAt(R, (l.lam0 + l.lam1) / 2))])
      }
      raw.push([before(L, e + 1), before(R, e + 1)])
      k = e
      continue
    }
    const cuts = new Set([k, k + 1])
    for (const t of [L, R]) for (const l of t) if (l.k === k && l.lam0 > k) cuts.add(l.lam0)
    for (const lam of [...cuts].sort((a, b) => a - b)) {
      if (lam > k) raw.push([before(L, lam), before(R, lam)])
      if (lam < k + 1) raw.push([after(L, lam), after(R, lam)])
    }
  }
  return rising(raw, endL, endR)
}

/**
 * The most knots that rise on both sides, between the two documents' ends: sorted by the left height, the longest run
 * rising on the right too. Taken greedily in reading order, one knot set too low on the right had dropped every knot
 * after it that stood higher (A followed at 2,910 px of the right's 7,273 on 2608.02163)
 */
function rising(raw, endL, endR) {
  const pts = raw.filter(p => p[0] > 0.5 && p[1] > 0.5 && p[0] < endL - 0.5 && p[1] < endR - 0.5)
  // by the left height, and at one left height the higher right first, so that one height gives at most one knot
  pts.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const tails = [], prev = new Array(pts.length).fill(-1)
  for (let i = 0; i < pts.length; i++) {
    let lo = 0, hi = tails.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (pts[tails[mid]][1] < pts[i][1] - 0.5) lo = mid + 1; else hi = mid }
    if (lo > 0) prev[i] = tails[lo - 1]
    tails[lo] = i
  }
  const out = []
  for (let i = tails.at(-1) ?? -1; i >= 0; i = prev[i]) out.unshift(pts[i])
  // two knots within half a pixel on the left would make the curve all but vertical there
  const kept = [[0, 0]]
  for (const p of out) if (p[0] > kept.at(-1)[0] + 0.5) kept.push(p)
  kept.push([endL, endR])
  return kept
}

/**
 * A map through knots, both ways, as a monotone C¹ curve (Steffen's tangents: no overshoot, so a slope taken over a view
 * is never negative). { ltr(y), rtl(y) }
 */
export function makeMap(pts) {
  const mono = (xs, ys) => {
    const n = xs.length, h = [], s = [], m = new Array(n).fill(0)
    for (let i = 0; i + 1 < n; i++) { h.push(xs[i + 1] - xs[i]); s.push((ys[i + 1] - ys[i]) / h[i]) }
    for (let i = 1; i + 1 < n; i++) {
      const p = (s[i - 1] * h[i] + s[i] * h[i - 1]) / (h[i - 1] + h[i])
      m[i] = (Math.sign(s[i - 1]) + Math.sign(s[i])) * Math.min(Math.abs(s[i - 1]), Math.abs(s[i]), 0.5 * Math.abs(p))
    }
    if (n > 1) { m[0] = s[0]; m[n - 1] = s[n - 2] }
    return x => {
      if (n < 2) return ys[0] ?? x
      let lo = 0, hi = n - 1
      if (x <= xs[0]) return ys[0] + (x - xs[0]) * s[0]
      if (x >= xs[hi]) return ys[hi] + (x - xs[hi]) * s[n - 2]
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid }
      const t = (x - xs[lo]) / h[lo], t2 = t * t, t3 = t2 * t
      return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h[lo] * m[lo] + (-2 * t3 + 3 * t2) * ys[hi] + (t3 - t2) * h[lo] * m[hi]
    }
  }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  return { ltr: mono(xs, ys), rtl: mono(ys, xs) }
}

// ---------------------------------------------------------------- the identity follower
// The reader drives one pane — the one last touched by a wheel, a touch, a key or a press — and the other follows it as one
// sheet: while the reader scrolls, by the reader's own steps; once the scroll has ended (a trackpad's glide included) and
// 150 ms have passed, it glides so that the point at the top of the driver's view stands at the same height on both
// (top alignment at rest: exp-freeze-2026-10-07:experiments/pdf-bilingual/REPORT.md, sixteenth and seventeenth addenda).
// The other pane's scroll events never drive back.
//
// A follower set by script each frame moves on the main thread a frame late, and misses frames whenever PDF.js draws the
// pages coming into view. Where the browser has ScrollTimeline the follower's page stack is moved on the compositor
// instead: while the reader scrolls, by a transform a ScrollTimeline on the driver runs (its keyframes the follower's
// position for every position of the driver); at rest, by a glide on the spring's curve. Its scrollTop stays where it was
// meanwhile, and takes the position shown, in one task, whenever something is to read it (bake). The follower is bound
// ahead, at rest and when the pointer comes over a pane, so that it keeps up from a scroll's first frame.
//
// The fixes the web's reader found, as plain behaviour: the scroll's end where no scrollend comes (a timer after the last
// step); a finger held on the pane is no rest; a rest an input called off is armed again once the input ends; a glide under
// way is baked on input; a click's level calls off the rest and the timer's end; the pair levelled once a zoom settles.

/** a critically damped spring's way from 0 to 1 over its time, k from 0 to 1: no overshoot, no bounce */
const springAt = k => { const y = t => 1 - (1 + 6.6 * t) * Math.exp(-6.6 * t); return y(Math.min(1, Math.max(0, k))) / y(1) }
/** the same curve as a CSS easing, for the glide the compositor runs */
const SPRING = `linear(${Array.from({ length: 41 }, (_, i) => +springAt(i / 40).toFixed(4)).join(', ')})`
/** how long after the scroll's end the pair is levelled (ms) */
const REST_MS = 150
/** the wait without a step that ends a scroll should no scrollend come: 400 ms where the browser has scrollend, which one
 *  scroll may still not send, 150 ms where it has none */
const SCROLL_END_MS = { native: 400, timer: 150 }

/**
 * The follower of a pair of panes (`o.panes.left`, `o.panes.right`: each its scroller `container`, the `stack` its pages
 * are in, `redraw()` its pages drawn where they now show, `lend(shift)` PDF.js told the pane shows `shift()` px below its
 * scrollTop, null to stop). `o.active()`: the pair scrolls together now (the sync on and available, both panes shown);
 * `o.target(from)`: where the other pane stands level with `from` (a scroll position), or null; `o.clock` the host's;
 * `o.timer`: no scrollend comes; `o.compositor`: a ScrollTimeline constructor, or null; `o.reduced()`: reduced motion;
 * `o.laidOut(el)`: the next moment `el` is laid out; `o.window`/`o.signal`: where an input's end is heard, and the
 * signal that ends every listener. The view hands it every input and scroll of the panes
 */
export function createFollower(o) {
  const { left, right } = o.panes
  const other = p => (p === left ? right : left)
  const clock = o.clock
  const endMs = o.timer ? SCROLL_END_MS.timer : SCROLL_END_MS.native
  let driver = null, step = 0, touching = false, zoomRest = 0, zoomGen = 0, stopped = false
  /** `pos`: the follower's position, fractional (scrollTop rounds to device pixels, and steps of one size must not drift
   *  by it); `lastD`: the driver's position last seen, null to read afresh; `rest`: the wait after the scroll's end;
   *  `spring`: the glide by script under way; `moving`: the driver scrolling, from its first step to its scroll's end;
   *  `levelled`: when a click last levelled the pair; `fallback`: the scroll's end where no scrollend comes */
  const follow = { pos: null, lastD: null, rest: 0, spring: 0, moving: false, levelled: 0, fallback: 0 }
  /** the follower's motion on the compositor: `anim` the transform, `kind` 'scroll' (bound to `from`, the driver) or
   *  'glide', `side` the follower, `shift()` how far the transform shows it below its scrollTop */
  const glass = { anim: null, kind: null, side: null, from: null, shift: null }
  /** a pane's scroll position set by the view itself: its scroll event is not the reader's */
  const placed = new WeakMap()
  const onCompositor = () => !!o.compositor && o.active()
  const glideMs = d => (o.reduced() ? 0 : Math.min(450, 250 + 0.25 * Math.abs(d)))
  const clearRest = () => { clock.clear(follow.rest); follow.rest = 0 }
  const clearFallback = () => { clock.clear(follow.fallback); follow.fallback = 0 }

  function put(container, top) {
    container.scrollTop = top
    placed.set(container, container.scrollTop)
  }
  /** the positions to go on from: the driver's as it is, the follower's as it is */
  function rebase() {
    if (!driver) return
    follow.lastD = driver.container.scrollTop
    follow.pos = other(driver).container.scrollTop
  }
  function stopSpring() { if (follow.spring) clock.cancel(follow.spring); follow.spring = 0 }
  /** a critically damped spring to a position by script: 250–450 ms as the distance asks; one step with reduced motion */
  function springTo(tc, target) {
    stopSpring()
    const x0 = tc.scrollTop, d = target - x0, T = glideMs(d), t0 = clock.now()
    const tick = () => {
      const k = T ? (clock.now() - t0) / T : 1
      if (k >= 1) { put(tc, target); follow.spring = 0; rebase(); return }
      put(tc, x0 + d * springAt(k))
      follow.spring = clock.frame(tick)
    }
    follow.spring = clock.frame(tick)
  }
  /** the motion under way taken off (its animation, and the container lent to PDF.js), and what it was */
  function unbind() {
    const g = { ...glass }
    g.anim.cancel()
    g.side.lend(null)
    Object.assign(glass, { anim: null, kind: null, side: null, from: null, shift: null })
    return g
  }
  /** the motion under way ended where it stands: the transform's shift into the follower's scrollTop, the transform gone */
  function bake() {
    if (!glass.anim) return
    const c = glass.side.container, pos = c.scrollTop + glass.shift(), g = unbind()
    put(c, pos)
    if (g.kind === 'scroll') follow.lastD = g.from.container.scrollTop
    follow.pos = pos
    g.side.redraw()
  }
  /** the motion under way given up, the follower left at its scrollTop */
  function drop() { if (glass.anim) unbind().side.redraw() }
  /** the follower bound to the driver's scroll: for every position of the driver, the follower's — where it stands, plus
   *  the driver's steps since the positions it goes on from, within the follower's ends — as keyframes of a ScrollTimeline
   *  on the driver, linear between */
  function arm() {
    if (!onCompositor() || !driver || glass.anim) return
    const d = driver, f = other(d), dc = d.container, tc = f.container
    const Dmax = dc.scrollHeight - dc.clientHeight, Fmax = tc.scrollHeight - tc.clientHeight, F0 = tc.scrollTop
    if (Dmax < 1 || !dc.clientHeight || !tc.clientHeight) return
    if (follow.lastD == null || follow.pos == null) rebase()
    const Db = follow.lastD, Fb = follow.pos, clamp = v => Math.min(Fmax, Math.max(0, v))
    // the same steps: straight, but for where the follower meets one of its ends
    let pts = [0, Db - Fb, Db + Fmax - Fb, Dmax].filter(D => D >= 0 && D <= Dmax).sort((a, b) => a - b).map(D => [D, clamp(Fb + D - Db)])
    pts = pts.filter((p, i) => i === 0 || p[0] > pts[i - 1][0])
    if (pts[0][0] > 0) pts.unshift([0, pts[0][1]])
    if (pts.at(-1)[0] < Dmax) pts.push([Dmax, pts.at(-1)[1]])
    const shift = (at = dc.scrollTop) => {
      const D = Math.min(Dmax, Math.max(0, at))
      let lo = 0, hi = pts.length - 1
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid][0] <= D) lo = mid; else hi = mid }
      const [a, b] = [pts[lo], pts[hi]], t = b[0] === a[0] ? 0 : (D - a[0]) / (b[0] - a[0])
      return a[1] + Math.min(1, Math.max(0, t)) * (b[1] - a[1]) - F0
    }
    const anim = f.stack.animate(pts.map(([D, F]) => ({ offset: D / Dmax, transform: `translateY(${F0 - F}px)` })), { timeline: new o.compositor({ source: dc, axis: 'block' }), fill: 'both' })
    Object.assign(glass, { anim, kind: 'scroll', side: f, from: d, shift })
    f.lend(shift)
  }
  /** the glide at rest on the compositor: the follower's stack moved to `target` on the spring's curve, then baked, and
   *  bound to the driver again */
  function glideOn(pane, target) {
    const tc = pane.container, d = target - tc.scrollTop, T = glideMs(d)
    if (!T) { put(tc, target); rebase(); arm(); return }
    const anim = pane.stack.animate([{ transform: 'translateY(0px)' }, { transform: `translateY(${-d}px)` }], { duration: T, easing: SPRING, fill: 'both' })
    Object.assign(glass, { anim, kind: 'glide', side: pane, from: null, shift: () => d * springAt((anim.currentTime ?? 0) / T) })
    pane.lend(glass.shift)
    const tick = () => { if (glass.anim !== anim) return; pane.redraw(); clock.frame(tick) }
    clock.frame(tick)
    anim.onfinish = () => { if (glass.anim !== anim) return; bake(); rebase(); arm() }
  }
  /** a pane's position as the screen shows it: its scrollTop, and the transform's shift while it follows on the compositor */
  const shownAt = pane => pane.container.scrollTop + (glass.side === pane ? glass.shift() : 0)
  /** where `to` stands level with `from` at rest: either end of `from`'s document takes it to the same end; else
   *  `o.target`; null where that is not known */
  function levelTarget(from) {
    const to = other(from), dc = from.container, tc = to.container, D = dc.scrollTop, most = tc.scrollHeight - tc.clientHeight
    if (D <= 1) return 0
    if (D >= dc.scrollHeight - dc.clientHeight - 1) return most
    const t = o.target(from)
    return t == null ? null : Math.min(most, Math.max(0, t))
  }
  /** the scroll ended on the driver: the other pane glides so that the point at the top of the driver's view stands at
   *  the same height on both */
  function alignTop(side) {
    if (!o.active() || side !== driver) return
    bake()
    const to = other(side), tc = to.container, target = levelTarget(side)
    if (target == null || Math.abs(target - tc.scrollTop) < 1) { rebase(); arm(); return }
    if (onCompositor()) glideOn(to, target)
    else springTo(tc, target)
  }
  /** one frame of the follower by script while the driver scrolls: moved by the driver's step; a glide under way stops,
   *  and the follower goes on from where it stands. On the compositor the transform moves it, and PDF.js is asked to draw
   *  the pages it now shows */
  function followFrame(side) {
    if (onCompositor()) {
      // a rest's glide still under way as the driver moves again ends where it stands, and the follower is bound to the
      // driver from there: left to finish, it held the follower off the driver for its whole length
      if (glass.kind === 'glide') { bake(); rebase() }
      if (!glass.anim) arm()
      other(side).redraw()
      return
    }
    const tc = other(side).container, D = side.container.scrollTop
    if (follow.spring) { stopSpring(); follow.pos = tc.scrollTop }
    if (follow.lastD == null || follow.pos == null) { follow.lastD = D; follow.pos = tc.scrollTop; return }
    const by = D - follow.lastD
    follow.lastD = D
    follow.pos = Math.min(tc.scrollHeight - tc.clientHeight, Math.max(0, follow.pos + by))
    put(tc, follow.pos)
  }
  /** a pane becomes the driver: what moves ends where it stands, and the other goes on from where it stands */
  function take(side) {
    if (driver === side) return
    bake(); driver = side; stopSpring(); clearRest(); rebase()
  }
  /** the scroll's end on a pane: the pair levelled REST_MS on. Not an end with no step of the reader's since the last, or
   *  since a click levelled the pair; never while a finger is down */
  function scrollEnded(side) {
    if (side !== driver || touching || !follow.moving) return
    clearFallback()
    follow.moving = false
    clearRest()
    follow.rest = clock.later(() => { follow.rest = 0; alignTop(side) }, REST_MS)
  }
  /** a rest an input called off, armed again once the input ends without a scroll: at once for a wheel or a key, at the
   *  release of a finger or a button. `until`: the events that end the input, heard on the window in its capture phase */
  function restAfter(side, until) {
    const t0 = clock.now()
    const again = () => {
      if (stopped || driver !== side || follow.moving || follow.rest || follow.levelled > t0) return
      follow.rest = clock.later(() => { follow.rest = 0; alignTop(side) }, REST_MS)
    }
    if (!until) return again()
    const ended = new AbortController()
    // ended with the view, and gone with the input: a press made during each rest would otherwise leave one for the view's life
    o.signal.addEventListener('abort', () => ended.abort(), { once: true, signal: ended.signal })
    for (const type of until) o.window.addEventListener(type, () => { ended.abort(); clock.later(again, 0) }, { capture: true, once: true, passive: true, signal: ended.signal })
  }

  return {
    /** an input on a pane (a wheel, a touch, a key, a press): it is the driver; a rest still to come is called off and
     *  armed again once the input ends without a scroll; a glide or a spring under way ends where it stands */
    input(side, type) {
      take(side)
      // read after take: an input on the other pane makes that one the driver, and take calls the old driver's rest off for
      // good. Armed again for the new driver, a wheel at its document's end would send the other to its own end
      const calledOff = follow.rest !== 0
      clearRest()
      if (glass.kind === 'glide') bake()
      if (follow.spring) { stopSpring(); rebase() }
      arm()
      if (calledOff) restAfter(side, type === 'touchstart' ? ['touchend', 'touchcancel'] : type === 'pointerdown' ? ['pointerup', 'pointercancel'] : null)
    },
    /** the pointer over a pane: on the compositor the follower is bound ahead, but not while a scroll, its rest or its
     *  glide is under way on the other pane, which the pointer passing over would cut off */
    hover(side) {
      if (onCompositor() && driver !== side && !follow.moving && !follow.rest && glass.kind !== 'glide') { take(side); arm() }
    },
    /** a pane's scroll event: false where it is a put of the view's own */
    scrolled(side) {
      const mine = placed.get(side.container)
      if (mine != null) { placed.delete(side.container); if (Math.abs(mine - side.container.scrollTop) < 1) return false }
      // the follower scrolled by something else (a link, PDF.js, the find bar): it stands where that put it, and goes on
      // from there; on the compositor its transform is given up, and it is bound again
      if (driver && side !== driver) {
        if (glass.side === side) { drop(); rebase(); arm() } else rebase()
        return true
      }
      if (!o.active() || side !== driver) return true
      // the rest's wait begun again with the event, since the scroll's end comes in the same frame as its last step; and
      // the scroll's end should no scrollend come
      clearRest(); follow.moving = true
      clearFallback(); follow.fallback = clock.later(() => scrollEnded(side), endMs)
      if (!step) step = clock.frame(() => { step = 0; followFrame(side) })
      return true
    },
    /** a pane's scrollend */
    ended(side) { scrollEnded(side) },
    /** the fingers on the surface (a touch event's): the wait starts again as the last of them lifts */
    touches(fingers) {
      touching = fingers > 0
      const side = driver
      if (!touching && side && follow.moving) { clearFallback(); follow.fallback = clock.later(() => scrollEnded(side), endMs) }
    },
    /** `to` (the other pane of `from`) scrolled so that its position `there` shows at height `y` of `from`'s view, `from`
     *  taking up what `to` cannot scroll at either end: a click's level. A rest still to come is called off, as is the
     *  scroll's end its last step armed, and a motion under way ends first. The reading line's share of the view, after */
    level(from, y, there) {
      const to = other(from), fc = from.container, tc = to.container
      const dy = tc.getBoundingClientRect().top - fc.getBoundingClientRect().top
      clearRest(); follow.levelled = clock.now()
      clearFallback(); follow.moving = false
      bake(); stopSpring()
      const want = there + dy - y
      put(tc, want)
      const short = tc.scrollTop - want
      if (Math.abs(short) > 0.5) put(fc, fc.scrollTop + short)
      rebase(); arm()
      return (there - tc.scrollTop + dy) / Math.max(1, fc.clientHeight)
    },
    /** the pair levelled once a zoom settles: its last step, REST_MS more, both stacks laid out at the new scale, then by
     *  the driver as at a rest, or by the left where neither has been read. Not while a scroll or its rest is under way */
    zoomed() {
      const mine = ++zoomGen
      clock.clear(zoomRest)
      zoomRest = clock.later(async () => {
        zoomRest = 0
        await Promise.all([o.laidOut(left.stack), o.laidOut(right.stack)])
        if (stopped || mine !== zoomGen || !o.active() || follow.moving || follow.rest) return
        if (driver) return alignTop(driver)
        bake()
        const top = levelTarget(left)
        if (top == null || Math.abs(top - right.container.scrollTop) < 1) return
        if (onCompositor()) glideOn(right, top)
        else springTo(right.container, top)
      }, REST_MS)
    },
    /** a zoom's step is about to change both panes' layouts and put each where it keeps the zoom's point: what moves ends
     *  where it stands (the panes are read as they show), the scroll's end and its rest are called off, the driver's
     *  position is read afresh, and the pane the zoom is over, where there is one, is the driver. Nothing is bound or
     *  levelled until the zoom settles (zoomed): the step's puts are the view's own, and a rest's glide between two steps
     *  had moved the other pane one way while the next step moved it back */
    zooming(side) {
      if (side) take(side)
      bake(); stopSpring(); clearRest(); clearFallback()
      follow.moving = false
      follow.lastD = null
    },
    take(side) { take(side); arm() },
    put,
    bake,
    /** a layout changed: what moves ends where it stands, and the driver's position is read afresh */
    invalidate() { bake(); follow.lastD = null },
    /** the sync turned on or off, or made available: nothing under way, the follower bound again where it runs */
    reset() { bake(); stopSpring(); clearRest(); clearFallback(); follow.moving = false; rebase(); arm() },
    /** how far a pane's pages show below its scrollTop now (the compositor's shift), for the pointer */
    shift(pane) { return glass.side === pane ? (glass.kind === 'scroll' ? glass.shift(glass.from.container.scrollTop) : glass.shift()) : 0 },
    shownAt,
    /** how far the other pane stands from level with `side` (px; positive: above it), or null */
    levelError(side) { const t = levelTarget(side); return t == null ? null : t - shownAt(other(side)) },
    driver: () => driver,
    motion: () => glass.kind ?? (follow.spring ? 'spring' : null),
    compositing: () => onCompositor(),
    /** everything under way let go, for good */
    stop() {
      stopped = true
      if (glass.anim) unbind()
      stopSpring(); clearRest(); clearFallback(); clock.clear(zoomRest); clock.cancel(step); step = 0
      driver = null
    },
  }
}

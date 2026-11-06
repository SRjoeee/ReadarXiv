// The highlight (design §4.5 "Highlight"; docs/PDF-READER.md §17): both panes light the same per-sentence boxes of the same unit,
// from `Page.lit` (on the left from A, on the right as drawn), with `{id, s}` the only lit state: a member's ord and its sentence,
// -1 for the whole member. What is painted is what is hit: a point lights the sentence whose box holds it, on the pane it is over,
// read from the same boxes the bands are drawn from, the smaller unit winning where two overlap; a miss keeps what is lit 120 ms
// (the HTML page's grace). A page that is not laid lights from A on both panes (the right mirrors the left). The pointer lights,
// nothing else does: a click holds nothing.
//
// Carried from today's lighting (src/pdf-reader/engine/view/lighting.mjs, highlight.mjs shapePath, overlay.mjs pinned at
// baf2083e0): one outline a shape (3 px corners), padded 3 px beside and half the page's leading above and below; each shape in
// CSS pixels of the page as it was drawn, scaled with the page about its origin (`scale: calc(var(--total-scale-factor) / s0)`),
// so that a zoom's steps and a pinch move it on the compositor with no layout and no script (§10.1: percent positioning cost the
// page's layout every frame); the left's layer put back in the same task where PDF.js's redraw removes it (§10.2). One look and
// one paint a frame, the pointer read before anything is written; a scroll under a still pointer lights what comes under it; what
// is lit drawn again by what replaces it, the resting pointer asked again. Nothing is computed while the switch is off; a page
// another generation still shows is muted (nothing of it lit or hit on the right).
import type { Panes, Side } from '../panes/panes.ts'
import type { Clock } from '../stack/clock.ts'
import type { Composer } from './composer.ts'
import type { Box, Page } from './page.ts'

/** the pad beside a band, CSS px, its corners, and how long a point that lights nothing keeps what is lit */
export const PAD = 3
export const RADIUS = 3
export const MISS_HOLD = 120

export interface Lit {
  id: number
  s: number
}
export interface Highlight {
  readonly lit: Lit | null
  readonly on: boolean
  light(t: Lit | null): void
  /** what a point of the screen over `side` lights, or null */
  at(side: Side, x: number, y: number): Lit | null
  setOn(on: boolean): void
  /** the shapes each pane shows (the probe's) */
  bands(): Record<Side, number>
  /** the looks made, and their script's time (ms), the probe's */
  costs(): { looks: number; ms: number[] }
  dispose(): void
}

/** a member's boxes on a pane: per sentence, from the Page (the right's as drawn where its page is committed) */
function boxesOf(page: Page, ord: number, side: Side, committed: boolean): Box[][] {
  const m = page.members.find((x) => x.ord === ord)
  if (!m) return []
  const per = side === 'right' && committed ? m.lit.right : m.lit.left
  // (its kept ink, a block of its own, the same on both panes: lit with the member)
  const own = m.lit.own.flatMap(([, b]) => b)
  return own.length ? [...per, own] : per
}
const areaOf = (bs: Box[][]) => bs.flat().reduce((a, b) => a + Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]), 0)

const leads = new WeakMap<Page, Map<string, number>>()
/** the half of a page's leading on a pane, PDF units: half the lower quartile of the gaps between a member's consecutive rows
 *  (the space between a kind's lines on that page), once a Page */
function halfLeading(page: Page, side: Side, committed: boolean): number {
  const key = `${side}:${committed}`
  const known = leads.get(page)?.get(key)
  if (known !== undefined) return known
  const v = leadOf(page, side, committed)
  const m = leads.get(page) ?? new Map<string, number>()
  m.set(key, v)
  leads.set(page, m)
  return v
}
function leadOf(page: Page, side: Side, committed: boolean): number {
  const gaps: number[] = []
  for (const m of page.members)
    for (const rows of side === 'right' && committed ? m.lit.right : m.lit.left) {
      const ys = [...rows].sort((a, b) => b[3] - a[3])
      for (let i = 1; i < ys.length; i++) {
        const g = (ys[i - 1] as Box)[1] - (ys[i] as Box)[3]
        if (g >= 0 && g < 2 * ((ys[i] as Box)[3] - (ys[i] as Box)[1])) gaps.push(g)
      }
    }
  if (!gaps.length) return 0
  gaps.sort((a, b) => a - b)
  return (gaps[Math.floor((gaps.length - 1) / 4)] as number) / 2
}

/**
 * One outline of a shape's rectangles stacked from the top (CSS pixels, y down): an SVG path, every corner rounded to `radius`
 * (or half its shorter side), the inner ones too; rectangles that do not meet across by more than two radii are outlines of their
 * own in the one path (a sentence's first row right of its last). highlight.mjs shapePath, carried
 */
export function shapePath(rects: { x0: number; x1: number; y0: number; y1: number }[], radius: number): string {
  let d = ''
  for (let a = 0, b = 1; b <= rects.length; b++) {
    const p = rects[b - 1],
      q = rects[b]
    if (p && q && Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0) > 2 * radius) continue
    d += outline(rects, a, b, radius)
    a = b
  }
  return d
}
function outline(rects: { x0: number; x1: number; y0: number; y1: number }[], a: number, b: number, radius: number) {
  const cx: number[] = [],
    cy: number[] = []
  const push = (x: number, y: number) => {
    const n = cx.length
    if (n && Math.abs(x - (cx[n - 1] as number)) < 0.01 && Math.abs(y - (cy[n - 1] as number)) < 0.01) return
    cx.push(x)
    cy.push(y)
  }
  const r = (i: number) => rects[i] as { x0: number; x1: number; y0: number; y1: number }
  push(r(a).x0, r(a).y0)
  push(r(a).x1, r(a).y0)
  for (let i = a; i < b; i++) {
    push(r(i).x1, r(i).y1)
    if (i + 1 < b) push(r(i + 1).x1, r(i).y1)
  }
  push(r(b - 1).x0, r(b - 1).y1)
  for (let i = b - 1; i > a; i--) {
    push(r(i).x0, r(i).y0)
    push(r(i - 1).x0, r(i).y0)
  }
  let n = cx.length
  if (
    n > 1 &&
    Math.abs((cx[0] as number) - (cx[n - 1] as number)) < 0.01 &&
    Math.abs((cy[0] as number) - (cy[n - 1] as number)) < 0.01
  )
    n--
  // (the corners that turn: a point on the line through its neighbours is none)
  const keep: number[] = []
  for (let i = 0; i < n; i++) {
    const p = (i - 1 + n) % n,
      q = (i + 1) % n
    const X = (k: number) => cx[k] as number,
      Y = (k: number) => cy[k] as number
    if (Math.abs((X(i) - X(p)) * (Y(q) - Y(i)) - (Y(i) - Y(p)) * (X(q) - X(i))) > 0.001) keep.push(i)
  }
  const f = (v: number) => Math.round(v * 100) / 100
  let d = ''
  keep.forEach((i, k) => {
    const A = keep[(k - 1 + keep.length) % keep.length] as number,
      B = keep[(k + 1) % keep.length] as number
    const X = (j: number) => cx[j] as number,
      Y = (j: number) => cy[j] as number
    const ax = X(A) - X(i),
      ay = Y(A) - Y(i),
      bx = X(B) - X(i),
      by = Y(B) - Y(i)
    const la = Math.hypot(ax, ay),
      lb = Math.hypot(bx, by),
      rr = Math.min(radius, la / 2, lb / 2)
    d += `${k ? 'L' : 'M'}${f(X(i) + (ax * rr) / la)} ${f(Y(i) + (ay * rr) / la)}Q${f(X(i))} ${f(Y(i))} ${f(X(i) + (bx * rr) / lb)} ${f(Y(i) + (by * rr) / lb)}`
  })
  return `${d}Z`
}

export function createHighlight(o: { panes: Panes; composer: Composer; clock: Clock; on: boolean }): Highlight {
  const { panes, composer, clock } = o
  let lit: Lit | null = null,
    on = o.on,
    missTimer = 0,
    frame = 0,
    disposed = false
  const ac = new AbortController()
  const costs: number[] = []
  let looks = 0
  /** each pane's layers, by page; the left's pages watched for PDF.js's redraw taking a layer (§10.2) */
  const layers: Record<Side, Map<number, HTMLElement>> = { left: new Map(), right: new Map() }
  const watch = new MutationObserver((records) => {
    for (const r of records)
      for (const node of r.removedNodes)
        if (node instanceof HTMLElement && node.classList.contains('axt-hl-layer') && !node.dataset.axtGone) {
          const page = r.target as HTMLElement
          if (!node.isConnected) page.append(node)
        }
  })
  const watched = new WeakSet<HTMLElement>()
  const layerOf = (side: Side, n: number): HTMLElement | null => {
    const page = panes.pageElement(side, n)
    if (!page) return null
    let l = layers[side].get(n)
    if (!l || l.parentElement !== page) {
      l = page.querySelector<HTMLElement>(':scope > .axt-hl-layer') ?? document.createElement('div')
      l.className = 'axt-hl-layer'
      page.append(l)
      layers[side].set(n, l)
      if (side === 'left' && !watched.has(page)) {
        watched.add(page)
        watch.observe(page, { childList: true })
      }
    }
    return l
  }
  /** every page a lit member has boxes on: the pages laid now that hold it */
  const pagesOf = (ord: number): number[] => {
    const out: number[] = []
    for (let n = 1; n <= panes.right.pages; n++) if (composer.page(n)?.members.some((m) => m.ord === ord)) out.push(n)
    return out
  }
  /** the rows of a shape in the page's CSS px at its scale now: padded beside and by half the leading above and below */
  function rowsOf(side: Side, n: number, boxes: Box[], lead: number) {
    const out: { x0: number; x1: number; y0: number; y1: number }[] = []
    for (const b of [...boxes].sort((p, q) => q[3] - p[3])) {
      const r = panes.boxOf(side, n, [b[0], b[1] - lead, b[2], b[3] + lead])
      if (!r) continue
      out.push({ x0: r.left - PAD, x1: r.left + r.width + PAD, y0: r.top, y1: r.top + r.height })
    }
    // (rows that overlap made to meet: one outline)
    for (let i = 1; i < out.length; i++) {
      const p = out[i - 1] as (typeof out)[number],
        q = out[i] as (typeof out)[number]
      if (q.y0 < p.y1) {
        const mid = (q.y0 + p.y1) / 2
        p.y1 = mid
        q.y0 = mid
      }
    }
    return out
  }
  function paint() {
    for (const side of ['left', 'right'] as const) for (const l of layers[side].values()) l.replaceChildren()
    if (!lit || !on) return
    for (const n of pagesOf(lit.id)) {
      const page = composer.page(n) as Page
      const committed = !!composer.laid(n) && !composer.muted(n)
      for (const side of ['left', 'right'] as const) {
        // (a page another generation still shows: nothing of it lit on the right until the new one commits)
        if (side === 'right' && composer.muted(n)) continue
        const per = boxesOf(page, lit.id, side, committed)
        const shapes = lit.s >= 0 && lit.s < per.length ? [per[lit.s] as Box[]] : per
        const layer = layerOf(side, n)
        const vp = panes.boxOf(side, n, [0, 0, 1, 1])
        if (!layer || !vp) continue
        const s0 = panes.scale
        const lead = halfLeading(page, side, committed)
        for (const boxes of shapes) {
          const rows = rowsOf(side, n, boxes, lead)
          if (!rows.length) continue
          const X0 = Math.min(...rows.map((r) => r.x0)),
            Y0 = Math.min(...rows.map((r) => r.y0))
          const local = rows.map((r) => ({ x0: r.x0 - X0, x1: r.x1 - X0, y0: r.y0 - Y0, y1: r.y1 - Y0 }))
          const w = Math.max(...local.map((r) => r.x1)),
            h = Math.max(...local.map((r) => r.y1))
          let el: HTMLElement | SVGSVGElement
          if (rows.length === 1) {
            el = document.createElement('div')
            el.className = 'axt-hl'
          } else {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
            el.setAttribute('class', 'axt-hl axt-hl-shape')
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
            path.setAttribute('d', shapePath(local, RADIUS))
            el.append(path)
          }
          // (its pixels at the scale it was drawn at, scaled with the page about the page's origin: a zoom's steps and a pinch
          // move it on the compositor, overlay.mjs pinned)
          Object.assign((el as HTMLElement).style, {
            left: `${X0}px`,
            top: `${Y0}px`,
            width: `${w}px`,
            height: `${h}px`,
            transformOrigin: `${-X0}px ${-Y0}px`,
            scale: `calc(var(--total-scale-factor) / ${s0 * (96 / 72)})`,
          })
          layer.append(el)
        }
      }
    }
  }
  function at(side: Side, x: number, y: number): Lit | null {
    const el = document.elementFromPoint(x, y)?.closest?.('.page') as HTMLElement | null
    const n = Number(el?.dataset.pageNumber)
    if (!el || !n || panes.pageElement(side, n) !== el) return null
    if (side === 'right' && composer.muted(n)) return null
    const page = composer.page(n)
    const r = el.getBoundingClientRect()
    // (the page's own scale, the follower's transform and a pinch included: the box as it shows)
    const box1 = panes.boxOf(side, n, [0, 0, 1, 1])
    if (!page || !box1) return null
    const k = r.width / Math.max(1, el.offsetWidth)
    const px = (x - r.left - el.clientLeft * k) / k,
      py = (y - r.top - el.clientTop * k) / k
    const committed = !!composer.laid(n)
    const lead = halfLeading(page, side, committed)
    // (what is painted is what is hit: the same rows; the smaller unit winning where two overlap, a heading run into its paragraph)
    let best: Lit | null = null,
      least = Number.POSITIVE_INFINITY
    for (const m of page.members) {
      const per = boxesOf(page, m.ord, side, committed)
      for (let s = 0; s < per.length; s++)
        for (const q of rowsOf(side, n, per[s] as Box[], lead)) {
          if (px < q.x0 || px > q.x1 || py < q.y0 || py > q.y1) continue
          const area = areaOf(per)
          if (area < least) {
            least = area
            best = { id: m.ord, s: per.length > 1 && m.lit.left.length > 1 ? s : -1 }
          }
        }
    }
    return best
  }
  const same = (a: Lit | null, b: Lit | null) => a === b || (!!a && !!b && a.id === b.id && a.s === b.s)
  function light(t: Lit | null) {
    clock.clear(missTimer)
    missTimer = 0
    if (!on) t = null
    if (same(t, lit)) return
    lit = t
    paint()
  }
  // the pointer: one look a frame, read before anything is written; a miss held MISS_HOLD
  let last: { side: Side; x: number; y: number } | null = null
  const look = () => {
    frame = 0
    if (!last || !on || disposed) return
    const t0 = performance.now()
    const t = at(last.side, last.x, last.y)
    if (t) light(t)
    else if (lit && !missTimer) missTimer = clock.later(() => light(null), MISS_HOLD)
    looks++
    costs.push(performance.now() - t0)
    if (costs.length > 256) costs.shift()
  }
  const lookSoon = () => {
    if (!frame && last && on) frame = clock.frame(look)
  }
  for (const side of ['left', 'right'] as const) {
    const c = panes.containerOf(side)
    c.addEventListener(
      'mousemove',
      (e) => {
        last = { side, x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY }
        lookSoon()
      },
      { signal: ac.signal },
    )
    c.addEventListener(
      'mouseleave',
      () => {
        last = null
        if (lit && !missTimer) missTimer = clock.later(() => light(null), MISS_HOLD)
      },
      { signal: ac.signal },
    )
    // (a scroll under a still pointer lights what comes under it)
    c.addEventListener('scroll', lookSoon, { passive: true, signal: ac.signal })
  }
  // (drawn again at a new scale, and where a page's own redraw took its layer; what is lit drawn again by what replaces it, and
  // the resting pointer asked again)
  const offs = [
    panes.on('scale', () => paint()),
    panes.on('drawn', () => (lit ? paint() : undefined)),
    composer.on('laid', () => {
      if (lit) paint()
      lookSoon()
    }),
    panes.right.on('shown', () => lookSoon()),
  ]
  return {
    get lit() {
      return lit
    },
    get on() {
      return on
    },
    light,
    at,
    setOn(next) {
      if (on === next) return
      on = next
      if (!on) {
        clock.cancel(frame)
        frame = 0
        light(null)
      } else lookSoon()
    },
    bands: () => ({
      left: [...layers.left.values()].reduce((a, l) => a + l.childElementCount, 0),
      right: [...layers.right.values()].reduce((a, l) => a + l.childElementCount, 0),
    }),
    costs: () => ({ looks, ms: costs.slice() }),
    dispose() {
      if (disposed) return
      disposed = true
      ac.abort()
      watch.disconnect()
      for (const f of offs) f()
      clock.clear(missTimer)
      clock.cancel(frame)
      for (const side of ['left', 'right'] as const)
        for (const l of layers[side].values()) {
          l.dataset.axtGone = ''
          l.remove()
        }
    },
  }
}

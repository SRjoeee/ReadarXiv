// The highlight (design §4.5 "Highlight"; docs/PDF-READER.md §17): both panes light the same per-sentence boxes of the same unit,
// from `Page.lit` (on the left from A, on the right as drawn), with `{id, s}` the only lit state: a member's ord and its sentence,
// -1 for the whole member. What is painted is what is hit: a point lights the sentence whose box holds it, on the pane it is over,
// read from the same boxes the bands are drawn from; a miss keeps what is lit 120 ms (the HTML page's grace). A page that is not
// laid lights from A on both panes. The bands are the HTML page's (the reader sheet's .axt-hl: a wash multiplied into the page by
// its layer), padded beside, each page's in a layer of its own over the page; laid at the page's scale and drawn again when it
// changes. Nothing is computed while the switch is off.
import type { Panes, Side } from '../panes/panes.ts'
import type { Clock } from '../stack/clock.ts'
import type { Composer } from './composer.ts'
import type { Box, Page } from './page.ts'

/** the pad beside a band, CSS px, and how long a point that lights nothing keeps what is lit */
export const PAD = 3
export const MISS_HOLD = 120

export interface Lit {
  id: number
  s: number
}
export interface Highlight {
  readonly lit: Lit | null
  light(t: Lit | null): void
  /** what a point of the screen over `side` lights, or null */
  at(side: Side, x: number, y: number): Lit | null
  setOn(on: boolean): void
  /** the bands each pane shows (the probe's) */
  bands(): Record<Side, number>
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

export function createHighlight(o: { panes: Panes; composer: Composer; clock: Clock; on: boolean }): Highlight {
  const { panes, composer, clock } = o
  let lit: Lit | null = null,
    on = o.on,
    missTimer = 0,
    frame = 0,
    disposed = false
  const ac = new AbortController()
  /** each pane's layers, by page */
  const layers: Record<Side, Map<number, HTMLElement>> = { left: new Map(), right: new Map() }
  const layerOf = (side: Side, n: number): HTMLElement | null => {
    const page = panes.pageElement(side, n)
    if (!page) return null
    let l = layers[side].get(n)
    if (!l || l.parentElement !== page) {
      l = page.querySelector<HTMLElement>(':scope > .axt-hl-layer') ?? document.createElement('div')
      l.className = 'axt-hl-layer'
      page.append(l)
      layers[side].set(n, l)
    }
    return l
  }
  /** every page a lit member has boxes on: the pages laid now that hold it */
  const pagesOf = (ord: number): number[] => {
    const out: number[] = []
    for (let n = 1; n <= panes.right.pages; n++) if (composer.page(n)?.members.some((m) => m.ord === ord)) out.push(n)
    return out
  }
  function paint() {
    for (const side of ['left', 'right'] as const) for (const l of layers[side].values()) l.replaceChildren()
    if (!lit || !on) return
    for (const n of pagesOf(lit.id)) {
      const page = composer.page(n) as Page
      const committed = !!composer.laid(n)
      for (const side of ['left', 'right'] as const) {
        const per = boxesOf(page, lit.id, side, committed)
        const shown = lit.s >= 0 && lit.s < per.length ? [per[lit.s] as Box[]] : per
        const layer = layerOf(side, n)
        if (!layer) continue
        for (const boxes of shown)
          for (const b of boxes) {
            const r = panes.boxOf(side, n, b)
            if (!r) continue
            const d = document.createElement('div')
            d.className = 'axt-hl'
            Object.assign(d.style, {
              left: `${r.left - PAD}px`,
              top: `${r.top}px`,
              width: `${r.width + 2 * PAD}px`,
              height: `${r.height}px`,
            })
            layer.append(d)
          }
      }
    }
  }
  function at(side: Side, x: number, y: number): Lit | null {
    const el = document.elementFromPoint(x, y)?.closest?.('.page') as HTMLElement | null
    const n = Number(el?.dataset.pageNumber)
    if (!el || !n || panes.pageElement(side, n) !== el) return null
    const page = composer.page(n)
    const r = el.getBoundingClientRect()
    // (the page's own scale, the follower's transform and a pinch included: the box as it shows)
    const box1 = panes.boxOf(side, n, [0, 0, 1, 1])
    if (!page || !box1) return null
    const k = r.width / Math.max(1, el.offsetWidth)
    const px = (x - r.left - el.clientLeft * k) / k,
      py = (y - r.top - el.clientTop * k) / k
    const committed = !!composer.laid(n)
    for (const m of page.members) {
      const per = boxesOf(page, m.ord, side, committed)
      for (let s = 0; s < per.length; s++)
        for (const b of per[s] as Box[]) {
          const q = panes.boxOf(side, n, b)
          if (q && px >= q.left - PAD && px <= q.left + q.width + PAD && py >= q.top && py <= q.top + q.height)
            return { id: m.ord, s: per.length > 1 && m.lit.left.length > 1 ? s : -1 }
        }
    }
    return null
  }
  const same = (a: Lit | null, b: Lit | null) => a === b || (!!a && !!b && a.id === b.id && a.s === b.s)
  function light(t: Lit | null) {
    clock.clear(missTimer)
    missTimer = 0
    if (same(t, lit)) return
    lit = t
    paint()
  }
  // the pointer: one look a frame, a miss held MISS_HOLD
  let last: { side: Side; x: number; y: number } | null = null
  const look = () => {
    frame = 0
    if (!last || !on) return
    const t = at(last.side, last.x, last.y)
    if (t) light(t)
    else if (lit && !missTimer) missTimer = clock.later(() => light(null), MISS_HOLD)
  }
  for (const side of ['left', 'right'] as const) {
    const c = panes.containerOf(side)
    c.addEventListener(
      'mousemove',
      (e) => {
        last = { side, x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY }
        if (!frame) frame = clock.frame(look)
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
  }
  // (drawn again at a new scale, and where a page's own redraw took its layer)
  const offs = [
    panes.on('scale', () => paint()),
    panes.on('drawn', () => (lit ? paint() : undefined)),
    composer.on('laid', () => (lit ? paint() : undefined)),
  ]
  return {
    get lit() {
      return lit
    },
    light,
    at,
    setOn(next) {
      on = next
      if (!on) light(null)
    },
    bands: () => ({
      left: [...layers.left.values()].reduce((a, l) => a + l.childElementCount, 0),
      right: [...layers.right.values()].reduce((a, l) => a + l.childElementCount, 0),
    }),
    dispose() {
      if (disposed) return
      disposed = true
      ac.abort()
      for (const f of offs) f()
      clock.clear(missTimer)
      clock.cancel(frame)
      for (const side of ['left', 'right'] as const) for (const l of layers[side].values()) l.remove()
    },
  }
}

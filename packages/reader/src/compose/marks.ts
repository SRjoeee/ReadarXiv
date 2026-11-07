// Translating (docs/PDF-READER.md §11.8, the owner's "Field" of 2026-10-25 in his "Glint" of 2026-11-01): while a near page is not
// laid, its slot shows the original's page and each paragraph the parts read so far locate on it carries a mark over its box,
// showing its own share of one diagonal light that crosses the whole page. Carried from today's layer side
// (src/pdf-reader/engine/view/layer-side.mjs markPage, alignPasses, padsOf at baf2083e0); the look is the reader's sheet's
// (styles.ts, every value a `--axt-tr-*` custom property).
//
// - The marks of a page stand in one element over it (`.axt-translating`, a size container: the light's picture and each mark's
//   place are in its container units), hidden from assistive technology and under the pointer; each mark at its paragraph's box
//   in shares of the page, so that no zoom moves it.
// - Each side's padding is at most half the gap to the nearest mark beside it, so that no two marks meet.
// - Every mark's pass starts when its page's indicator did (its Web Animations startTime set in the frame after it came, before
//   it paints), so that a mark a later batch of rows brings shows its share of the same light.
// - Where the browser cannot size a container, the marks are still (`axt-translating-still`).
import type { Clock } from '../stack/clock.ts'

/** the card's padding, CSS pixels at the reader's 100 % (the sheet's --axt-tr-pad-x and -pad-y, where it gives none) */
export const PAD_X = 4
export const PAD_Y = 2

/** a paragraph's box on the page, PDF units [x0, y0, x1, y1] (y up), by its member's ord */
export interface MarkBox {
  id: string
  box: [number, number, number, number]
}

export interface Marks {
  /** page n's indicator over `slot`, one mark a box (none: its indicator goes); `view` the page's view box, `rotation` its
   *  view's; a page turned carries none (the boxes are in the page's own frame) */
  mark(n: number, slot: HTMLElement, view: readonly number[] | null, rotation: number, boxes: readonly MarkBox[]): void
  unmark(n: number): void
  unmarkAll(): void
  /** the pages that carry an indicator */
  pages(): number[]
  dispose(): void
}

/** whether the light can pass: a size container's units, which the light's picture is sized and placed in */
const moves = (): boolean => {
  const C = globalThis.CSS
  return typeof C?.supports === 'function' && C.supports('width', '1cqh')
}

export function createMarks(o: { root: HTMLElement; clock: Clock }): Marks {
  const marks = new Map<number, HTMLElement>()
  /** each indicator's start on the document's timeline, ms, by page: every pass of its marks starts there */
  const passStarts = new Map<number, number>()
  const toAlign = new Set<number>()
  let alignFrame = 0,
    disposed = false
  let pads: { x: number; y: number } | null = null
  /** the card's padding in points, as the sheet gives it on the reader's root (which no size container holds), read once */
  function padsOf() {
    if (pads) return pads
    const css = typeof getComputedStyle === 'function' ? getComputedStyle(o.root) : null
    const px = (v: string) => {
      const x = Number.parseFloat(css?.getPropertyValue(v) ?? '')
      return Number.isFinite(x) && x >= 0 ? x : null
    }
    const x = px('--axt-tr-pad-x'),
      y = px('--axt-tr-pad-y'),
      out = { x: (x ?? PAD_X) * 0.75, y: (y ?? PAD_Y) * 0.75 }
    if (x !== null && y !== null) pads = out
    return out
  }
  /** one light for the page: each mark's pass (the sheet's axt-tr-pass, run by the compositor) set to start when its page's
   *  indicator did */
  function alignPasses(n: number, el: HTMLElement) {
    const t0 = passStarts.get(n)
    if (typeof t0 !== 'number' || typeof el.getAnimations !== 'function') return
    try {
      for (const a of el.getAnimations({ subtree: true }))
        if ((a as CSSAnimation).animationName === 'axt-tr-pass' && a.startTime !== t0) a.startTime = t0
    } catch {
      /* the browser's own: the passes left as they started */
    }
  }
  function alignSoon(n: number) {
    toAlign.add(n)
    if (alignFrame || disposed) return
    alignFrame = o.clock.frame(() => {
      alignFrame = 0
      for (const p of toAlign) {
        const el = marks.get(p)
        if (el) alignPasses(p, el)
      }
      toAlign.clear()
    })
  }
  function unmark(n: number) {
    const el = marks.get(n)
    if (!el) return
    el.remove()
    marks.delete(n)
    passStarts.delete(n)
    toAlign.delete(n)
  }
  const cq = (v: number, axis: 'w' | 'h') => `${(100 * v).toFixed(3)}cq${axis}`
  return {
    mark(n, slot, view, rotation, boxes) {
      if (disposed) return
      if (!boxes.length || !view || view.length !== 4) return unmark(n)
      const [x0, y0, x1, y1] = view as [number, number, number, number]
      const w = x1 - x0,
        h = y1 - y0
      if (!(w > 0) || !(h > 0) || ((rotation % 360) + 360) % 360 !== 0) return unmark(n)
      let el = marks.get(n)
      if (!el) {
        el = document.createElement('div')
        el.className = moves() ? 'axt-translating' : 'axt-translating axt-translating-still'
        el.setAttribute('aria-hidden', 'true')
        marks.set(n, el)
        const t0 = globalThis.document?.timeline?.currentTime
        if (typeof t0 === 'number') passStarts.set(n, t0)
      }
      // (an indicator put in, or in again, restarts its marks' passes: set to the page's again)
      let added = el.parentNode !== slot
      if (added) slot.append(el)
      // (a CSS pixel at 100 % is 3/4 of a point, so a page w points wide is 4w/3 of them, one of them 100/(4w/3) cqw)
      el.style.setProperty('--axt-tr-u', `${(100 / ((4 * w) / 3)).toFixed(5)}cqw`)
      const { x: padX, y: padY } = padsOf()
      const bs = boxes.map(({ id, box }) => ({ id, ax: box[0], ay: box[1], bx: box[2], by: box[3] }))
      // (each paragraph's card kept from one call to the next where it stays: a card put in again would begin its delay and its
      // fade again, and rows come in batches)
      const had = new Map([...el.children].map((c) => [(c as HTMLElement).dataset.axtU, c as HTMLElement]))
      const want = new Set<string>()
      bs.forEach((b, i) => {
        let pX = padX,
          pY = padY
        bs.forEach((x, j) => {
          if (j === i) return
          if (b.ax < x.bx && x.ax < b.bx) pY = Math.min(pY, Math.max(0, Math.max(x.ay - b.by, b.ay - x.by) / 2))
          if (b.ay < x.by && x.ay < b.by) pX = Math.min(pX, Math.max(0, Math.max(x.ax - b.bx, b.ax - x.bx) / 2))
        })
        const style = `--axt-tr-x:${cq((b.ax - x0) / w, 'w')};--axt-tr-y:${cq((y1 - b.by) / h, 'h')};--axt-tr-w:${cq((b.bx - b.ax) / w, 'w')};--axt-tr-h:${cq((b.by - b.ay) / h, 'h')};--axt-tr-px:${cq(pX / w, 'w')};--axt-tr-py:${cq(pY / h, 'h')}`
        want.add(b.id)
        let m = had.get(b.id)
        if (!m) {
          m = document.createElement('i')
          m.className = 'axt-translating-mark'
          m.dataset.axtU = b.id
          el.append(m)
          added = true
        }
        if (m.getAttribute('style') !== style) m.setAttribute('style', style)
      })
      for (const [key, c] of had) if (!want.has(key as string)) c.remove()
      if (added) alignSoon(n)
    },
    unmark,
    unmarkAll() {
      for (const n of [...marks.keys()]) unmark(n)
    },
    pages: () => [...marks.keys()],
    dispose() {
      if (disposed) return
      disposed = true
      o.clock.cancel(alignFrame)
      for (const n of [...marks.keys()]) unmark(n)
    },
  }
}

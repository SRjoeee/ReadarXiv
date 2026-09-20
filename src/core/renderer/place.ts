// The reader's place, kept across a relayout of the whole page (DESIGN §10).
//
// Starting a translation, switching side / stack / only and restoring the original each lay the whole paper out
// anew: side mode narrows the column and every paragraph wraps again, translation only hides the originals, and the
// page's height moves by a third or more. The browser keeps the scroll offset in pixels, so the paragraph the reader
// was on left the screen by two to eight screens (measured, tests/e2e/probes/reading-position.mjs: 2 000–7 800 px on
// every one of the five actions). Chrome's own scroll anchoring does not help here — it stands down for a frame in
// which an ancestor of its anchor changed width or margins, and under translation only its anchor is hidden.
//
// So whoever is about to relayout the page on the reader's behalf says so first, once: `keep()` notes what is on the
// reader's line — the element the browser's own hit test finds there — and how far down it the line falls; the
// layout is clean at that moment, so the reads force nothing. A one-shot observer puts that point back where it
// stood after the browser's next layout, before it paints. No timer, no window of time, no layout forced: measured, the paragraph is never painted more than
// a pixel from its place. What comes after — translations arriving above the viewport — is Chrome's anchoring's, as
// before (§10). The aim is the paragraph, not the pixel: nobody knows which word the reader was on.
import { IMG_CLASS, T_CLASS } from '@/core/marks'
import { DOCUMENT_ROOT } from '@/core/rules/latexml'

export interface PlaceKeeper {
  /** Call **before** the writes of a relayout, while the layout is clean. Nothing at the top of the page; once armed, a second call before the layout adds nothing */
  keep(): void
}

export interface PlaceKeeperOptions {
  /** Test injection: be told once after the next layout of `root`, before it is painted; returns the way to stop. A `ResizeObserver`'s first notification when absent */
  afterLayout?: (root: Element, run: () => void) => () => void
  /** Test injection: the element at a point of the viewport; `document.elementFromPoint` when absent */
  elementAt?: (x: number, y: number) => Element | null
}

/** Where the reader's eyes are taken to be: a quarter of the way down the viewport — below any header the site pins to the top, in the part of the screen being read */
const LINE = 0.25
/** Closer than this the page is left alone: the aim is the paragraph */
const NEAR_PX = 4
/** Across the text: a quarter of the way into the article from its left edge — the originals' column under side, the text itself otherwise, clear of whatever floats at the window's edges */
const ACROSS = 0.25
/**
 * Between two paragraphs the hit test finds their container — a section thousands of pixels tall, no measure of
 * anything: content changing height far below the viewport would move "the same part of it" (Codex on #270). The line
 * is tried lower, by these offsets; where even half a screen down holds nothing the reader could be on, nothing is kept
 */
const GAP_OFFSETS_PX = [0, 16, 32, 64, 128, 256]
/** The reader scrolling by their own hand, which a correction must never undo */
const READER_SCROLLS = ['wheel', 'touchmove', 'keydown'] as const

export function createPlaceKeeper(doc: Document, blocks: ReadonlyArray<{ el: Element }>, options: PlaceKeeperOptions = {}): PlaceKeeper {
  const afterLayout = options.afterLayout ?? ((root: Element, run: () => void) => {
    // An observer's first notification comes after the next layout whether or not the size changed, which is the
    // moment wanted: the layout is fresh, so reading it forces nothing, and a scroll made here is in the same paint
    const observer = new ResizeObserver(() => run())
    observer.observe(root)
    return () => observer.disconnect()
  })
  let armed = false
  const blockEls = new Set(blocks.map(block => block.el))

  /**
   * What on the page stands for the element the hit test found. One of ours — a translation, a mirror, a copy, or an
   * image's overlay, whose labels take the pointer (Devin on #270) — is the next sibling of its original, which is the
   * page's own and outlives a restore; ours would be gone by the time the place is put back. Inside a translated
   * block the unit is the block: under translation only it is the block that hides, whole, with its translation beside it
   */
  const OURS = `.${T_CLASS}, .${IMG_CLASS}`
  const unitOf = (hit: Element): Element => {
    let at = hit
    for (let ours = at.closest(OURS); ours; ours = at.closest(OURS)) {
      if (!ours.previousElementSibling) break
      at = ours.previousElementSibling
    }
    for (let up: Element | null = at; up; up = up.parentElement) if (blockEls.has(up)) return up
    return at
  }

  /**
   * A unit's box on screen: its own, or that of ours beside it — under translation only a translated original is
   * hidden and its translation stands for it. When neither shows, the same is asked of its ancestors: translation
   * only hides a split figure **whole**, and what shows is the copy beside the figure, not anything beside the
   * caption inside it (Codex on #270). Null when nothing up to the article shows
   */
  const boxOf = (unit: Element): DOMRect | null => {
    for (let el: Element | null = unit; el && el !== doc.documentElement; el = el.parentElement) {
      const own = el.getBoundingClientRect()
      if (own.width > 0 || own.height > 0) return own
      const next = el.nextElementSibling
      const beside = next?.classList.contains(T_CLASS) ? next.getBoundingClientRect() : null
      if (beside && (beside.width > 0 || beside.height > 0)) return beside
    }
    return null
  }

  return {
    keep() {
      const view = doc.defaultView
      const root = doc.querySelector(DOCUMENT_ROOT)
      // At the top of the page there is no place to lose: the commonest start, a click right after opening the paper
      if (armed || !view || !root || view.scrollY <= 0) return
      if (!options.afterLayout && typeof ResizeObserver !== 'function') return
      const elementAt = options.elementAt ?? ((x: number, y: number) => doc.elementFromPoint(x, y))
      const column = root.getBoundingClientRect()
      const x = column.left + column.width * ACROSS
      // What is on the reader's line — a paragraph, a row of a formula, a figure; translated or not. Not the nearest
      // translation block: through an appendix of bare formulas that was a thousand pixels away, and the stretch
      // between it and the reader changes height from mode to mode (measured: 750 px off)
      let kept: Element | null = null
      let box: DOMRect | null = null
      let line = 0
      for (const lower of GAP_OFFSETS_PX) {
        line = view.innerHeight * LINE + lower
        const hit = elementAt(x, line)
        if (!hit || !root.contains(hit)) continue
        const unit = unitOf(hit)
        const its = boxOf(unit)
        if (!its) continue
        // Taller than the viewport is still the reader's place when it is one thing — a long paragraph, a tall image:
        // its parts keep their order. A container the line fell through is not: a section, a list, a figure's wrapper
        if (its.height > view.innerHeight && unit.childElementCount > 0 && !blockEls.has(unit)) continue
        kept = unit
        box = its
        break
      }
      if (!kept || !box) return
      const block = kept
      // The point kept is one of the unit's own: how far down it, and where on screen it stands now
      const part = box.height > 0 ? Math.min(1, Math.max(0, (line - box.top) / box.height)) : 0
      const was = box.top + part * box.height

      armed = true
      let readerScrolled = false
      const inputs = new AbortController()
      for (const type of READER_SCROLLS) view.addEventListener(type, () => { readerScrolled = true }, { signal: inputs.signal, passive: true, capture: true })
      let stop = (): void => undefined
      stop = afterLayout(root, () => {
        stop()
        inputs.abort()
        armed = false
        const now = readerScrolled ? null : boxOf(block)
        if (!now) return
        const off = now.top + part * now.height - was
        // `instant`: a page that asks for smooth scrolling would play the correction as a glide
        if (Math.abs(off) >= NEAR_PX) view.scrollTo({ top: view.scrollY + off, behavior: 'instant' })
      })
    },
  }
}

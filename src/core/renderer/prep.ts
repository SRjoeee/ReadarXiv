// The tidy after a translation arrives (DESIGN §7.2 / §10, issue #46): footnote placement, split figures, mirrors,
// table fitting, margin alignment.
//
// Every pass used to run all five steps over the whole document. Measured on 2312.17141: 31 passes in one session,
// 1.9 seconds in all, while one pass alone takes 34 ms — the cost is all repetition, in two places above all:
//   - `createMirrors` scanned 50 000 nodes with a bare `:has()` every pass, though an arriving translation changes
//     no mirror decision at all (the block marks are written when the session starts, §7.3): after the first pass
//     every scan was for nothing;
//   - `measureColumn` in `fitTables` reads the resolved `gridTemplateColumns`, which forces layout, and it was the
//     first read of geometry after three DOM-writing steps, so the whole page's forced layout was charged to it
//     (130–158 ms in a pass with writes upstream).
//
// Now: the pipeline hands over the blocks whose DOM it just touched per batch (`onRendered`), the coalescer
// collects them into a dirty set, and each pass tidies only the few containers those blocks sit in; the mirrors run
// once per session; the column width is read at the **start of a pass, before anything is written**, and only when
// marked stale — prep is a setTimeout task, and at its start the browser has just rendered, so the layout is clean.
//
// The five tidy steps always took `Document | Element`; here they are finally given a narrower root.
import { ID_ATTR } from '@/core/extractor'
import { DOCUMENT_ROOT } from '@/core/rules/latexml'
import { createCoalescer, type Coalescer } from '@/core/scheduler/coalesce'
import { applyMarginNotes, clearMarginNotes, planMarginNotes } from './margin-notes'
import { createMirrors } from './mirror'
import { localizeNotes } from './notes'
import { clearPairMargins, readPairMargins, writePairMargins, type PairMarginPlan } from './pair-margins'
import { dropStaleSplits, outermostFigure, setSplitDuplicatesHidden, splitFigures } from './split-figures'
import { fitTables, measureColumn, resetFitCache, watchFontLoads } from './table-fit'

export interface Prep {
  /** These blocks (or image targets, §15) just touched the DOM: schedule a pass tidying only their containers */
  touch(items: ReadonlyArray<{ el: Element }>): void
  /**
   * The mode in effect is side, or no longer is — told at every change of it, and when a session starts in it.
   * What side needs beyond the passes is the tidy layer's to know, not its caller's:
   *
   * - **Entering**: the column width is re-read and one full pass runs (coming back from stack / only, the alignment
   *   margins were cleared and have to be computed afresh), and the root's width is watched from here on — the
   *   column follows the window, and the zoom ratios with it. Only a width that really changed counts: scaling a
   *   table makes the watched root report a size change itself, and without that gate the two would oscillate.
   * - **Leaving**: the queued pass is withdrawn, the watch ends, and what the passes wrote **inline** is taken back —
   *   the alignment margins and the margin-note offsets serve the two columns only, and in the other modes the
   *   site's own margins and the floats' own heights are right. What a pass wrote as a `data-axt-*` mark needs no
   *   undoing: the style sheet reads those under side alone.
   * - **Either way** the split copies' duplicated media speak only where the original does not (§7.4b, issue #170):
   *   `aria-hidden` is an attribute, and no style sheet can switch it.
   */
  side(on: boolean): void
  /** A session starts or ends: the mirrors may run once more, the width cache is cleared, the column width is re-read, and the font subscription and the width watch are dropped — until the next touch, the next `side(true)` */
  reset(): void
}

export interface PrepOptions {
  isSide: () => boolean
  /** One line reported at the end of each pass (when something changed); e2e and manual testing rely on it */
  trace?: (line: string) => void
  /** Retry a failed block by id — the pipeline's `translate([block])`; the split copies' widgets call it (issue #170) */
  retry?: (blockId: string) => void
  /**
   * A full pass under side is about to relayout the page — mirrors by the hundred, tables scaled — and Chrome's own
   * scroll anchoring stands down for that frame (measured: 96 px in one pass, more with more tables above the reader).
   * Called at the start of such a pass, where the layout is still clean (renderer/place.ts)
   */
  keepPlace?: () => void
  /** Test injection: the column width */
  columnWidth?: (root: Element) => number
  /** Test injection: watch an element's width, returning the way to stop; a `ResizeObserver` when absent */
  watchWidth?: (root: Element, onWidth: (width: number) => void) => () => void
  delay?: number
  maxWait?: number
}

/**
 * The roots a dirty block needs tidied: its parent element (the pairs in the same container, the adjacent-sibling
 * margin pair included), the parent of each of its ancestor blocks (an inner footnote arriving before the outer block
 * must be able to fill the outer's copy), and the parent of the outermost figure it sits in (`splitFigures` scans
 * descendants only, so the root has to be one level above the figure). Roots contained in other roots are dropped —
 * the tidy steps are idempotent, and a repeat is only wasted work
 */
export function rootsOf(blocks: Iterable<Element>): Element[] {
  const roots = new Set<Element>()
  for (const el of blocks) {
    if (el.parentElement) roots.add(el.parentElement)
    for (let outer = el.parentElement?.closest(`[${ID_ATTR}]`); outer; outer = outer.parentElement?.closest(`[${ID_ATTR}]`)) {
      if (outer.parentElement) roots.add(outer.parentElement)
    }
    const fig = outermostFigure(el)
    if (fig?.parentElement) roots.add(fig.parentElement)
  }
  const list = Array.from(roots)
  return list.filter(r => !list.some(other => other !== r && other.contains(r)))
}

export function createPrep(doc: Document, options: PrepOptions): Prep {
  const columnWidth = options.columnWidth ?? measureColumn
  const watchWidth = options.watchWidth ?? ((root: Element, onWidth: (width: number) => void) => {
    if (typeof ResizeObserver !== 'function') return () => undefined
    const observer = new ResizeObserver(entries => onWidth(Math.round(entries[0]?.contentRect.width ?? 0)))
    observer.observe(root)
    return () => observer.disconnect()
  })
  /** The way to stop watching the root's width; null while it is not watched */
  let unwatchWidth: (() => void) | null = null
  let mirrorsDone = false
  let columnStale = true
  let column = 0

  const run = (scope: Element[] | null) => {
    const t0 = performance.now()
    // Before anything is read or written: the reader's place, across the one kind of pass that moves the whole page
    if (scope === null && options.isSide()) options.keepPlace?.()
    // The column width: read before anything is written. The layout is clean at this moment (the last frame has just
    // rendered), so no whole-page forced layout is paid for. Measured from the **translation root**, not <html>:
    // measureColumn finds the grid track through closest(DOCUMENT_ROOT), which from <html> finds nothing, and the
    // fallback parentElement is null — column width 0, and not a single table shrinks the whole pass (caught by e2e:
    // at 1440px 0 tables scaled, 3 over the column)
    if (options.isSide() && columnStale) {
      const root = doc.querySelector(DOCUMENT_ROOT) ?? doc.documentElement
      column = columnWidth(root)
      columnStale = false
    }
    const roots: Array<Document | Element> = scope === null ? [doc] : rootsOf(scope)
    // The margins are **read** first: nothing has been written yet and the styles are clean (the last frame has just
    // rendered; the translations the pipeline inserted were computed long ago). Read after nodes are inserted, the
    // invalidation of `:has()` makes this getComputedStyle pay for a whole-page recalculation
    let margins: PairMarginPlan[] = options.isSide() ? roots.map(r => readPairMargins(r)) : []
    // The margin-note stacking is read here too — **the whole paper at once** (how far one is pushed depends on every
    // note before it, §7.2) — and rides on the read above: the layout at this moment was computed by that line, and a
    // few more rectangles cost no further forced layout
    const noteLayout = options.isSide() ? planMarginNotes(doc) : null
    let notes = 0
    for (const r of roots) notes += localizeNotes(r)
    const t1 = performance.now()
    // Split copies whose signature expired are dropped first: outside side, the overlay went into the hidden original
    // (§15.2), and a full pass rebuilds them on returning to side; in side as well — once a figure's only translation
    // (the overlay) is taken away, needsSplit is false, splitFigures skips it, and the old copy would hang on (Codex on #89)
    let unsplit = 0
    for (const r of roots) unsplit += dropStaleSplits(r)
    if (!options.isSide()) return

    // Figures are split whole first, mirrors filled in after: a split figure takes no part in mirroring (the two would duplicate a copy)
    let split = 0
    for (const r of roots) split += splitFigures(r, { retry: options.retry })
    const t2 = performance.now()
    // The mirrors run once per session, and only once the block marks are written (or a block is cloned whole,
    // issue #67): the decision reads data-axt-id and .axt-t siblings only, which an arriving translation changes nowhere
    let made = 0
    if (scope === null && !mirrorsDone && doc.querySelector(`[${ID_ATTR}]`)) {
      made = createMirrors(doc)
      mirrorsDone = true
      // Mirrors are translation nodes too, subject to the site's adjacent-sibling rules the same way, so one more read after they are in — the only such pass in a session
      if (made) margins = [readPairMargins(doc)]
    } else if (mirrorsDone && unsplit > 0) {
      // A block that lost its copy and is due none — its overlay, all that paired it, is gone again — goes back to
      // what it was before the overlay: mirrored. The session's one pass is over, and with neither a copy nor a mirror
      // the block spans both columns (Codex on #282; a figure without a caption was as exposed as a loose graphic).
      // Among these roots alone, and the pass is idempotent: what is paired is left as it is
      for (const r of roots) made += createMirrors(r)
      if (made) margins = roots.map(r => readPairMargins(r))
    }
    const t3 = performance.now()
    let fitted = 0
    let scrolled = 0
    for (const r of roots) {
      const fit = fitTables(r, { columnWidth: () => column })
      fitted += fit.fitted
      scrolled += fit.scrolled
    }
    const t4 = performance.now()
    // The margins are **written** last: the read was done at the start of the pass
    let aligned = 0
    for (const plan of margins) aligned += writePairMargins(plan)
    const moved = noteLayout ? applyMarginNotes(noteLayout) : 0
    const t5 = performance.now()
    // If this pass touched the DOM, the margin-note plan above was computed from the positions before it: translations
    // make notes taller, table fitting and split figures move blocks up and down. Another pass is scheduled to
    // measure the new positions — a task of its own, reading from a clean layout and writing after, never reading
    // after writing within one pass (§10). Nothing touched, nothing scheduled: that pass's read costs one forced
    // layout, over a hundred milliseconds on the heaviest fixture
    if (notes || split || fitted || made || aligned) restack.schedule()

    // Every pass reports (the ones that did nothing included): the cumulative cost has to count the wasted passes too, and the e2e tidy-cost assertion relies on it
    options.trace?.(
      `side prep${scope === null ? ' (full)' : ` (${scope.length} blocks, ${roots.length} roots)`}: `
      + `+${split} figures split, +${made} mirrors, ${fitted} tables scaled, ${scrolled} scrollable, ${aligned} margins aligned, ${notes} notes localized, ${moved} notes stacked; `
      + `notes=${(t1 - t0).toFixed(1)} split=${(t2 - t1).toFixed(1)} mirrors=${(t3 - t2).toFixed(1)} tables=${(t4 - t3).toFixed(1)} margins=${(t5 - t4).toFixed(1)} total=${(t5 - t0).toFixed(1)}ms`,
    )
  }

  const coalescer: Coalescer<Element> = createCoalescer(run, { delay: options.delay ?? 150, maxWait: options.maxWait ?? 1000 })
  // Margin-note stacking: read every note's position over the whole paper, write each offset. Separate from the pass above because what it measures is that pass's written result
  const restack: Coalescer = createCoalescer(() => {
    if (!options.isSide()) return
    const moved = applyMarginNotes(planMarginNotes(doc))
    if (moved) options.trace?.(`margin notes: ${moved} stacked`)
  }, { delay: options.delay ?? 150, maxWait: options.maxWait ?? 1000 })
  // Fonts finished loading: natural widths changed (the cache is cleared by watchFontLoads); the column width is re-read
  // along the way, then one full tidy pass. **Subscribed from a session's first touch until the next reset**: a prep
  // lives as long as the page, and a listener of its own lifetime would go on scheduling whole-document passes on a
  // restored page, which is to hold nothing of ours
  let unwatchFonts: (() => void) | null = null
  const watchFonts = () => {
    unwatchFonts ??= watchFontLoads(doc, () => {
      columnStale = true
      coalescer.schedule()
    })
  }

  return {
    touch(items) {
      watchFonts()
      for (const item of items) coalescer.schedule(item.el)
    },
    side(on) {
      setSplitDuplicatesHidden(doc, on)
      if (!on) {
        unwatchWidth?.()
        unwatchWidth = null
        coalescer.cancel()
        restack.cancel()
        clearPairMargins(doc)
        clearMarginNotes(doc)
        return
      }
      const fullPass = () => {
        columnStale = true
        watchFonts()
        coalescer.schedule()
      }
      fullPass()
      if (unwatchWidth) return
      const root = doc.querySelector(DOCUMENT_ROOT)
      if (!root) return
      let lastWidth = 0
      unwatchWidth = watchWidth(root, width => {
        if (width === lastWidth) return
        lastWidth = width
        fullPass()
      })
    },
    reset() {
      coalescer.cancel()
      restack.cancel()
      unwatchFonts?.()
      unwatchFonts = null
      unwatchWidth?.()
      unwatchWidth = null
      mirrorsDone = false
      columnStale = true
      resetFitCache()
    },
  }
}

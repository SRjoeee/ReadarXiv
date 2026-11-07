// Translate what is seen (DESIGN §10): a target — a text block, an image — is handed to its run when it first comes
// within the preload distance of the viewport, and a target never scrolled to costs nothing. Two choices (the reader's
// `preload`): on demand, the viewport and 1 000 px around it; or the whole paper, every target handed over at the start.
//
// Where the targets are is read once, apart from the start's writes (`readViewport`; a geometry read after a write
// lays the whole paper out in the middle of the script): each target's anchor — the element whose place stands for it —
// and which anchors are within reach on the first screen. A target with no layout box (a footnote, collapsed in arXiv's
// page) is anchored to the target it sits in, and enters with it; one with no box and nothing around it is its own
// anchor, observed all the same, since it may get a box later. The first screen's targets are handed over at once, as
// one batch; every other anchor is watched by one IntersectionObserver and unobserved once its targets are handed over,
// the targets of one callback forming one batch.
//
// The visibility threshold is a ratio of the target's height, as the observer's is, and the first screen is judged by
// the same rule. A target taller than the root can never show the ratio asked for; it is judged by the most it can
// show, aligned down to the observer's grid of registered ratios, since the observer only calls back on a registered
// ratio and reports the ratio of that moment.
import type { Block } from '@/core/extractor'

export interface PreloadOptions {
  /** How far beyond the viewport, above and below, a target counts as in reach; `all` hands over every target at once */
  margin: number | 'all'
  /** The share of a target's height that must be in reach, 0 for any part of it */
  threshold: number
}

/** The grid of ratios registered with the observer above a threshold of 0 */
export const THRESHOLD_STEP = 0.05
const GRID_POINTS = Math.round(1 / THRESHOLD_STEP)
/** Rounding slack for ratios, which the browser reports as floating point */
const EPSILON = 1e-9

/** The ratios registered with the observer: 0 alone at a threshold of 0, else the grid from 0 to 1 and the threshold itself */
export function observerThresholds(threshold: number): number | number[] {
  if (threshold <= 0) return 0
  const grid = Array.from({ length: GRID_POINTS + 1 }, (_, i) => i * THRESHOLD_STEP)
  if (!grid.some(point => Math.abs(point - threshold) < EPSILON)) grid.push(threshold)
  return grid.sort((a, b) => a - b)
}

/** A ratio aligned down to the observer's grid */
export function quantizeThreshold(value: number): number {
  return Math.floor(value / THRESHOLD_STEP + EPSILON) * THRESHOLD_STEP
}

/** On demand: 1 000 px around the viewport, any part of a target */
export const DEFAULT_PRELOAD = { margin: 1000, threshold: 0 }

/** The reader's choice as the observer's numbers */
export const preloadOf = (choice: 'on-demand' | 'whole'): PreloadOptions =>
  choice === 'whole' ? { margin: 'all', threshold: 0 } : { ...DEFAULT_PRELOAD }

export interface LazyScheduler<T extends { el: Element } = Block> {
  /** Hand these targets over now, those still waiting, as one batch */
  trigger(targets: T[]): void
  /** These targets were taken by the run another way: never hand them over */
  claim(targets: T[]): void
  /** How many targets are still waiting to be handed over */
  waiting(): number
  /** Stop watching; nothing waits any more */
  disconnect(): void
}

export interface ViewportReading<T extends { el: Element } = Block> {
  /** Every anchor and its targets, in the targets' order */
  byAnchor: Map<Element, T[]>
  /** The anchors within reach when read, in order */
  seeded: Element[]
}

/** The ratio a target must show: the threshold, or for one taller than the root the most it can show, on the grid */
function required(threshold: number, height: number, rootHeight: number): number {
  if (threshold <= 0 || height <= 0) return threshold
  const most = rootHeight / height
  return most < threshold ? quantizeThreshold(most) : threshold
}

const hasBox = (r: DOMRect) => r.width > 0 || r.height > 0

/** Where the targets are: their anchors, and which anchors are within reach now */
export function readViewport<T extends { el: Element } = Block>(targets: readonly T[], preload: PreloadOptions): ViewportReading<T> {
  const byAnchor = new Map<Element, T[]>()
  const add = (anchor: Element, target: T) => {
    const group = byAnchor.get(anchor)
    if (group) group.push(target)
    else byAnchor.set(anchor, [target])
  }
  // The whole paper: no place matters, nothing is read
  if (preload.margin === 'all') {
    for (const target of targets) add(target.el, target)
    return { byAnchor, seeded: [...byAnchor.keys()] }
  }
  const margin = preload.margin
  const own = new Set(targets.map(target => target.el))
  const rects = new Map<Element, DOMRect>()
  const rectOf = (el: Element) => {
    const known = rects.get(el)
    if (known) return known
    const r = el.getBoundingClientRect()
    rects.set(el, r)
    return r
  }
  for (const target of targets) {
    let anchor: Element = target.el
    if (!hasBox(rectOf(target.el))) {
      for (let up = target.el.parentElement; up; up = up.parentElement) {
        if (own.has(up)) {
          anchor = up
          break
        }
      }
    }
    add(anchor, target)
  }
  const viewport = (globalThis as { innerHeight?: number }).innerHeight ?? 0
  const top = -margin
  const bottom = viewport + margin
  const seeded: Element[] = []
  for (const anchor of byAnchor.keys()) {
    const r = rectOf(anchor)
    if (!hasBox(r) || r.top > bottom || r.bottom < top) continue
    const shown = r.height > 0 ? (Math.min(r.bottom, bottom) - Math.max(r.top, top)) / r.height : 1
    if (shown + EPSILON >= required(preload.threshold, r.height, bottom - top)) seeded.push(anchor)
  }
  return { byAnchor, seeded }
}

/**
 * Watch the targets and hand each to `onEnter` as it comes within reach, once. Started from a `reading` it asks the
 * layout nothing; without one it reads the viewport itself. The targets within reach are handed over before it returns
 */
export function createLazyScheduler<T extends { el: Element } = Block>(
  targets: T[],
  options: PreloadOptions & { onEnter: (targets: T[]) => void; reading?: ViewportReading<T> },
): LazyScheduler<T> {
  const { onEnter, margin, threshold } = options
  const reading = options.reading ?? readViewport(targets, options)
  /** each anchor's targets still waiting */
  const waitingAt = new Map<Element, Set<T>>()
  const anchorOf = new Map<T, Element>()
  for (const [anchor, group] of reading.byAnchor) {
    waitingAt.set(anchor, new Set(group))
    for (const target of group) anchorOf.set(target, anchor)
  }
  let observer: IntersectionObserver | null = null

  /** Take the targets out of waiting; an anchor left with none is no longer watched. Returns those that were waiting */
  const take = (taken: Iterable<T>): T[] => {
    const out: T[] = []
    for (const target of taken) {
      const anchor = anchorOf.get(target)
      const group = anchor && waitingAt.get(anchor)
      if (!anchor || !group?.delete(target)) continue
      out.push(target)
      if (group.size === 0) {
        waitingAt.delete(anchor)
        observer?.unobserve(anchor)
      }
    }
    return out
  }
  const hand = (picked: T[]) => {
    if (picked.length > 0) onEnter(picked)
  }
  const atAnchors = (anchors: Element[]) => take(anchors.flatMap(anchor => [...(waitingAt.get(anchor) ?? [])]))

  if (margin === 'all') {
    hand(atAnchors([...waitingAt.keys()]))
  } else {
    hand(atAnchors(reading.seeded))
    const Observer = (globalThis as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver
    if (Observer && waitingAt.size > 0) {
      const rootHeightFallback = ((globalThis as { innerHeight?: number }).innerHeight ?? 0) + 2 * margin
      observer = new Observer(
        entries => {
          const entered: Element[] = []
          for (const entry of entries) {
            if (!entry.isIntersecting || !waitingAt.has(entry.target)) continue
            const need = required(threshold, entry.boundingClientRect.height, entry.rootBounds?.height ?? rootHeightFallback)
            if (entry.intersectionRatio + EPSILON >= need) entered.push(entry.target)
          }
          hand(atAnchors(entered))
        },
        { rootMargin: `${margin}px 0px`, threshold: observerThresholds(threshold) },
      )
      for (const anchor of waitingAt.keys()) observer.observe(anchor)
    }
  }

  return {
    trigger: picked => hand(take(picked)),
    claim: picked => void take(picked),
    waiting: () => {
      let n = 0
      for (const group of waitingAt.values()) n += group.size
      return n
    },
    disconnect() {
      observer?.disconnect()
      observer = null
      waitingAt.clear()
    },
  }
}

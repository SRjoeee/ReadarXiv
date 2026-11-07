// The skeleton a pending block shows while its translation is on the way (DESIGN §7.6, UI.md S-I-01): one to three faint
// bars, sized in em by the paper's own type and drawn by modes.css, breathing as a whole. What is drawn is estimated from
// the source's length and never measured: reading layout here would force a reflow in the middle of a render. The pulse
// is a Web Animation of opacity alone, which the compositor carries without relayout or repaint; at most
// MAX_ANIMATED_SKELETONS pulse at once and the rest stay still (a page of hundreds of blocks animating at once takes the
// main thread down), none pulse under prefers-reduced-motion, and every running pulse is cancelled before its node
// leaves the page — a running animation keeps a detached node alive in the renderer.
import { INLINE_ATTR } from './attrs'

export const SKELETON_CLASS = 'axt-skel'
export const SKELETON_LINE_CLASS = 'axt-skel-line'
/** How many skeletons pulse at once at most */
export const MAX_ANIMATED_SKELETONS = 60

/** Below this many characters of source one bar, below the next two, else three */
const TWO_LINES_FROM = 120
const THREE_LINES_FROM = 320
/** Each bar's width by the number of bars: the last one short, so the bars read as a paragraph's last line */
const WIDTHS: Record<number, readonly string[]> = { 1: ['62%'], 2: ['100%', '48%'], 3: ['100%', '100%', '55%'] }
/** A short heading's bar on its line (§7.3): a width in em, following the heading's font size */
const INLINE_WIDTH = '4.5em'

/** The pulse: full opacity to 45 % and back over 1.4 s, for as long as the skeleton is there */
const PULSE: Keyframe[] = [{ opacity: 1 }, { opacity: 0.45 }, { opacity: 1 }]
const PULSE_TIMING: KeyframeAnimationOptions = { duration: 1400, iterations: Number.POSITIVE_INFINITY, easing: 'ease-in-out' }

/** Each pulsing skeleton's animation, and how many there are */
const pulses = new WeakMap<HTMLElement, Animation>()
let pulsing = 0

/** The bars a source of `chars` characters is given */
export function skeletonLines(chars: number): number {
  return chars < TWO_LINES_FROM ? 1 : chars < THREE_LINES_FROM ? 2 : 3
}

/** How many skeletons pulse now */
export function activeSkeletonAnimations(): number {
  return pulsing
}

/** Stop a skeleton's pulse, freeing its place among those that pulse; a skeleton that does not pulse is left as it is */
export function cancelSkeletonAnimation(skeleton: HTMLElement): void {
  const pulse = pulses.get(skeleton)
  if (!pulse) return
  pulses.delete(skeleton)
  pulsing--
  pulse.cancel()
}

/** Cancel every pulse in a subtree, the root's own included: called before the subtree is removed */
export function cancelSkeletonsIn(root: Element): void {
  if (root.classList.contains(SKELETON_CLASS)) cancelSkeletonAnimation(root as HTMLElement)
  for (const skeleton of root.querySelectorAll<HTMLElement>(`.${SKELETON_CLASS}`)) cancelSkeletonAnimation(skeleton)
}

function pulse(skeleton: HTMLElement, ownerDoc: Document): void {
  if (pulsing >= MAX_ANIMATED_SKELETONS || typeof skeleton.animate !== 'function') return
  if (ownerDoc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  pulses.set(skeleton, skeleton.animate(PULSE, PULSE_TIMING))
  pulsing++
}

/**
 * A skeleton for a source of `chars` characters: a span, hidden from screen readers (the waiting state is the popup's
 * progress to tell, not each block's), holding its bars with each one's width written on it; `inline` is a short
 * heading's one bar on its line. It pulses at once if there is room
 */
export function createSkeleton(ownerDoc: Document, options: { chars?: number; inline?: boolean } = {}): HTMLElement {
  const skeleton = ownerDoc.createElement('span')
  skeleton.className = SKELETON_CLASS
  skeleton.setAttribute('aria-hidden', 'true')
  if (options.inline) skeleton.setAttribute(INLINE_ATTR, '')
  const widths = options.inline ? [INLINE_WIDTH] : WIDTHS[skeletonLines(options.chars ?? 0)]!
  for (const width of widths) {
    const line = ownerDoc.createElement('span')
    line.className = SKELETON_LINE_CLASS
    line.style.width = width
    skeleton.append(line)
  }
  pulse(skeleton, ownerDoc)
  return skeleton
}

/** A skeleton made for `host` and put at its end */
export function createSkeletonInside(host: HTMLElement, options: { chars?: number; inline?: boolean } = {}): HTMLElement {
  const skeleton = createSkeleton(host.ownerDocument, options)
  host.append(skeleton)
  return skeleton
}

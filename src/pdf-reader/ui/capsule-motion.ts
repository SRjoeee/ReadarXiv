// The capsule's motion (the reader's design, §6.6; the web's round 4, approved 2026-10-04): the engine that owns the
// words' cell and the box's width, so that the words move with the box as one motion. A change of words moves the
// width once, one way, from where it stands:
// - growing, the box leads: it opens at once (300 ms, the soft curve) while the old words stay; old and new cross-fade
//   once, at the later of 60 % of the way and the new words fitting, so that they never outrun the border and the box is
//   never empty;
// - shrinking, the words lead: they cross-fade at once (the new, shorter ones already fit) and the box closes with them
//   (250 ms on --ease-in-out, whose slow start keeps it behind the words);
// - the words cross-fade alike both ways, on --ease-out: the old 150 ms, 1 → 0, 4 px up, blurred to 2 px; the new 200 ms
//   from 4 px below, 2 px → 0; the blur masks the moment they overlap.
// A count changes in place (morph): a changed digit cross-fades, shown at most once per 300 ms, a burst landing on its
// latest; a digit gained opens a cell of its own with the box, the whole number cross-fading at 60 % of the way, never a
// lone 0. A change mid-way retargets from where things stand: the width from its current value, a fade from its current
// opacity; words not yet shown are dropped unseen. Under reduced motion nothing slides: the words cross-fade by opacity
// with their 2 px blur, at once, and the width snaps, growing at once and shrinking once the old words have gone.
//
// The box holds its icon (an `svg`), the cell (whose content is the engine's alone), anything absolute that takes no
// room (a screen reader's line), and at most one `.after` — what follows the words, a chip or a close — which reader.css
// pins to the box's end on one line, so that it travels with the end as the box opens and closes. A sentence too long
// for one line at the window's width wraps, balanced (`data-wrap`): the box's width is then its own, and only the words
// cross-fade. The engine measures layout widths, never drawn ones, so that the capsule's entrance (a 0.96 scale) does not
// count; it reads them once a change, and as the window or the fonts change
import { type CapsuleWords, keyOf, sameShape } from './capsule-words'

/** the choreography's times (ms) and the share of the way at which growing words may appear */
export const CHOREOGRAPHY = { grow: 300, shrink: 250, out: 150, in: 200, appearAt: 0.6, morph: 150, morphGap: 300 } as const
/** the growing box's curve: a soft ease-in-out, whose peak speed is 2.9 times its mean (it does not rush its middle) */
export const SOFT = [0.65, 0, 0.35, 1] as const
/** the closing box's (improve-animations' AUDIT.md: moving on screen) and the words' (entering and leaving) */
const IN_OUT = [0.77, 0, 0.175, 1] as const
const OUT = [0.23, 1, 0.32, 1] as const
type Bezier = readonly [number, number, number, number]
const css = (b: Bezier) => `cubic-bezier(${b.join(', ')})`

const bezier = (s: number, a: number, b: number) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s ** 2 * b + s ** 3
/** the s at which one coordinate of the curve reaches v (both are monotonic on [0, 1] for these curves) */
function solve(v: number, a: number, b: number): number {
  let lo = 0, hi = 1
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2
    if (bezier(m, a, b) < v) lo = m
    else hi = m
  }
  return (lo + hi) / 2
}

/** the fraction of a curve's duration at which its eased progress reaches p */
export function timeAt(p: number, [x1, y1, x2, y2]: Bezier = SOFT): number {
  return bezier(solve(p, y1, y2), x1, x2)
}
/** the eased progress of a curve at the fraction t of its duration */
const progressAt = (t: number, [x1, y1, x2, y2]: Bezier): number => (t <= 0 ? 0 : t >= 1 ? 1 : bezier(solve(t, x1, x2), y1, y2))

/** ms after a growth starts at which its words cross-fade: the later of 60 % of the way and every incoming part fitting (`ends`: where each ends) */
export function swapAt(from: number, to: number, ends: readonly number[]): number {
  const d = to - from
  if (!(d > 0.5)) return 0
  const fit = Math.max(CHOREOGRAPHY.appearAt, ...ends.map(end => (end - from) / d))
  return CHOREOGRAPHY.grow * timeAt(Math.min(1, fit))
}

export interface Motion {
  /** the capsule's words now; `incoming`: what follows them that has just come (held until the motion shows it);
   *  `outgoing`: what has just gone, given to the engine, which fades it out and removes it — one its owner has already
   *  removed (React) is drawn leaving as a picture of it, inert */
  change(words: CapsuleWords, incoming?: readonly HTMLElement[], outgoing?: readonly HTMLElement[]): void
  stop(): void
}

/** how a fading element looks: its opacity, how far below its place (px), its blur (px) */
interface Look { o: number; y: number; b: number }
const SHOWN: Look = { o: 1, y: 0, b: 0 }
const BELOW: Look = { o: 0, y: 4, b: 2 }
const ABOVE: Look = { o: 0, y: -4, b: 2 }
/** visible: ink over 2 % opaque (the probe's measure) */
const SEEN = 0.02
interface Fade { anim: Animation; from: Look; to: Look; ms: number; delay: number }
/** the count of the words drawn: shown, the one asked for, when the next may be shown, and its wait */
interface Count { shown: number; wanted: number; next: number; timer: number }

export function capsuleMotion(box: HTMLElement, cell: HTMLElement, o: { reduced?: () => boolean } = {}): Motion {
  const doc = box.ownerDocument, win = doc.defaultView as Window & typeof globalThis
  const reduced = o.reduced ?? (() => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const style = (el: Element) => win.getComputedStyle(el)
  const px = (v: string) => Number.parseFloat(v) || 0
  const now = () => win.performance.now()
  /** the words drawn, their element and their count */
  let live: { el: HTMLElement; words: CapsuleWords; count: Count | null } | null = null
  /** the box's width as the engine last set it, and its motion */
  let target = -1
  let width: Animation | null = null
  const fades = new Map<Element, Fade>()
  /** what the engine draws leaving and removes: the words that go, and pictures of what followed them */
  const ghosts = new Set<HTMLElement>()
  /** the look a picture starts leaving from: the one its original's fade had reached */
  const reached = new WeakMap<HTMLElement, Look>()
  /** what waits, inert, for its entrance to begin, and the timer that lifts it */
  const waiting = new Map<HTMLElement, number>()
  /** a wait called off by another fade: what follows decides whether it is inert (one leaving is) */
  function unwait(el: HTMLElement) {
    const timer = waiting.get(el)
    if (timer === undefined) return
    win.clearTimeout(timer)
    waiting.delete(el)
  }

  // ------------------------------------------------------------------ how things look and fade
  function lookOf(el: HTMLElement): Look {
    const f = fades.get(el)
    if (!f) return reached.get(el) ?? SHOWN
    // from the fade's own timing: a detached element has no computed style, and a pending one is at its start
    const t = (Number(f.anim.currentTime) || 0) - f.delay
    const p = progressAt(t / f.ms, OUT)
    return { o: f.from.o + (f.to.o - f.from.o) * p, y: f.from.y + (f.to.y - f.from.y) * p, b: f.from.b + (f.to.b - f.from.b) * p }
  }
  /** a fade from one look to another, after `delay`, on --ease-out; under reduced motion nothing slides */
  function fade(el: HTMLElement, from: Look, to: Look, ms: number, delay: number, fill: FillMode): Animation {
    fades.get(el)?.anim.cancel()
    unwait(el)
    const still = reduced()
    const frame = (l: Look) => (still ? { opacity: l.o, filter: `blur(${l.b}px)` } : { opacity: l.o, translate: `0 ${l.y}px`, filter: `blur(${l.b}px)` })
    const anim = el.animate([frame(from), frame(to)], { duration: ms, delay, easing: css(OUT), fill })
    fades.set(el, { anim, from, to, ms, delay })
    return anim
  }
  /**
   * Shown after `delay`: unseen until then, held below its place, blurred (the fade's first look, filled backwards), and
   * inert, so that no action in it can be focused, pressed or told while it cannot be seen. It is lifted
   * as the entrance begins: once the animation's start is fixed, at its delay from there. With no delay (shrinking,
   * reduced motion) nothing waits
   */
  function enter(el: HTMLElement, delay: number) {
    const anim = fade(el, BELOW, SHOWN, CHOREOGRAPHY.in, delay, 'backwards')
    anim.finished.then(() => { if (fades.get(el)?.anim === anim) fades.delete(el) }, () => {})
    if (!(delay > 0)) return
    el.inert = true
    waiting.set(el, -1)
    anim.ready.then(() => {
      if (fades.get(el)?.anim !== anim || !waiting.has(el)) return
      // rounded up: a timer truncates its delay to whole ms, and the wait must not end before the entrance begins
      const left = Math.max(0, Math.ceil(delay - (Number(anim.currentTime) || 0)))
      waiting.set(el, win.setTimeout(() => {
        waiting.delete(el)
        el.inert = false
      }, left))
    }, () => {})
  }
  function drop(el: HTMLElement) {
    fades.get(el)?.anim.cancel()
    fades.delete(el)
    unwait(el)
    ghosts.delete(el)
    el.remove()
  }
  /** leave from where it stands, out of the flow, after `delay`; one already fading out goes on; one not shown yet goes unseen */
  function leave(el: HTMLElement, delay: number) {
    const f = fades.get(el)
    if (el.dataset.state === 'out' && f && (Number(f.anim.currentTime) || 0) > f.delay) return
    const look = lookOf(el)
    if (look.o <= SEEN) return drop(el)
    if (el.dataset.state !== 'out') {
      // its width kept as it is drawn, so that a wrapped line keeps its lines once out of the flow
      el.style.width = `${px(style(el).width)}px`
      el.dataset.state = 'out'
      el.inert = true
      ghosts.add(el)
    }
    fade(el, look, ABOVE, CHOREOGRAPHY.out, delay, 'both').finished.then(() => drop(el), () => {})
  }
  /** what followed the words, its owner having removed it: a picture of it, leaving from the look its fade had reached */
  function adopt(el: HTMLElement): HTMLElement | null {
    if (el.isConnected) return el
    const look = lookOf(el)
    fades.get(el)?.anim.cancel()
    fades.delete(el)
    if (look.o <= SEEN) return null
    const ghost = el.cloneNode(true) as HTMLElement
    // no action, no target, no name of its own: it is only drawn
    for (const x of [ghost, ...ghost.querySelectorAll('*')]) for (const a of ['id', 'href', 'data-action', 'aria-labelledby', 'aria-describedby']) x.removeAttribute(a)
    ghost.setAttribute('aria-hidden', 'true')
    ghost.inert = true
    ghost.dataset.state = 'out'
    box.append(ghost)
    ghosts.add(ghost)
    reached.set(ghost, look)
    return ghost
  }

  // ------------------------------------------------------------------ the words, drawn
  function digit(d: string): HTMLElement {
    const dg = doc.createElement('span'), gh = doc.createElement('span'), v = doc.createElement('span')
    dg.className = 'dg'
    gh.className = 'gh'
    gh.textContent = '0'
    v.className = 'd'
    v.textContent = d
    dg.append(gh, v)
    return dg
  }
  function build(w: CapsuleWords): HTMLElement {
    const line = doc.createElement('span')
    line.className = 'line'
    if (w.prefix) line.append(w.prefix)
    if (w.count !== undefined) {
      const num = doc.createElement('span')
      num.className = 'num'
      for (const d of String(w.count)) num.append(digit(d))
      line.append(num)
    }
    if (w.part) {
      const part = doc.createElement('span')
      part.className = 'part'
      part.lang = w.part.lang
      part.dir = 'auto'
      part.textContent = w.part.text
      line.append(part)
    }
    if (w.suffix) line.append(w.suffix)
    return line
  }

  // ------------------------------------------------------------------ the box's width
  const after = () => box.querySelector<HTMLElement>(':scope > .after:not([data-state])')
  const wrapping = () => box.hasAttribute('data-wrap')
  /** the live words' width on one line, a digit's cell still opening at its full width and one closing at none */
  function lineWidth(): number {
    if (!live) return 0
    const el = live.el
    let w: number
    if (wrapping()) {
      // read on one line: wrapped, the line is as wide as the box lets it be
      el.style.whiteSpace = 'nowrap'
      w = px(style(el).width)
      el.style.whiteSpace = ''
    } else w = px(style(el).width)
    for (const dg of el.querySelectorAll<HTMLElement>('.dg[data-grow]')) w += Number(dg.dataset.grow) - px(style(dg).width)
    for (const dg of el.querySelectorAll<HTMLElement>('.dg[data-close]')) w -= px(style(dg).width)
    return w
  }
  /** the width the box needs for its words on one line: its paddings, its icon, the words, what follows them */
  function natural(): number {
    const s = style(box), parts: number[] = []
    for (const el of box.children) {
      if (el instanceof HTMLElement && el.dataset.state === 'out') continue
      const es = style(el)
      if (es.display === 'none' || ((es.position === 'absolute' || es.position === 'fixed') && !el.classList.contains('after'))) continue
      parts.push(el === cell ? lineWidth() : px(es.width))
    }
    return px(s.paddingInlineStart) + px(s.paddingInlineEnd) + parts.reduce((a, b) => a + b, 0) + px(s.columnGap) * Math.max(0, parts.length - 1)
  }
  /** the widest the box may be: its slot's width less its margin on each side (reader.css --capsule-margin) */
  function room(): number {
    const slot = box.parentElement
    if (!slot) return Number.POSITIVE_INFINITY
    const ss = style(slot), inner = slot.clientWidth - px(ss.paddingInlineStart) - px(ss.paddingInlineEnd)
    // not laid out (a test's document): no limit
    return inner > 0 ? inner - 2 * px(style(box).getPropertyValue('--capsule-margin')) : Number.POSITIVE_INFINITY
  }
  /**
   * The width as it stands now: at rest the one the engine set, exactly; mid-motion the drawn one. Not the computed width
   * at rest: serialized to three decimals it falls just under the layout's grid (167.531 for 167.53125 px), and a motion
   * started from it stepped back 1/64 px in its first frame (Chromium, the chip's arrival at 320 px)
   */
  const current = () => (width === null && target > 0 ? target : px(style(box).width))

  /** the width moved to `to`: opening, closing, at once, or (reduced motion, closing) once the old words have gone */
  function resize(from: number, to: number, how: 'grow' | 'shrink' | 'snap' | 'late') {
    width?.cancel()
    width = null
    // nothing laid out to measure (a box not drawn yet): its width left its own
    target = to > 0 ? to : -1
    box.style.width = to > 0 ? `${to}px` : ''
    if (!(to > 0 && from > 0)) {
      delete box.dataset.resizing
      return
    }
    if (how === 'grow' || how === 'shrink') {
      // the moving end fades into the capsule's ground while it travels (reader.css)
      box.dataset.resizing = how
      const anim = box.animate([{ width: `${from}px` }, { width: `${to}px` }], how === 'grow' ? { duration: CHOREOGRAPHY.grow, easing: css(SOFT) } : { duration: CHOREOGRAPHY.shrink, easing: css(IN_OUT) })
      width = anim
      anim.finished.then(() => { if (width === anim) { width = null; delete box.dataset.resizing } }, () => {})
      return
    }
    delete box.dataset.resizing
    if (how !== 'late') return
    const anim = box.animate([{ width: `${from}px` }, { width: `${from}px` }], { duration: 0, delay: CHOREOGRAPHY.out, fill: 'backwards' })
    width = anim
    anim.finished.then(() => { if (width === anim) width = null }, () => {})
  }
  function setWrap(on: boolean) {
    if (on === wrapping()) return
    width?.cancel()
    width = null
    delete box.dataset.resizing
    box.toggleAttribute('data-wrap', on)
    if (on) {
      target = -1
      box.style.width = ''
    }
  }

  /**
   * The change's choreography: the width moved once, the words that go and come cross-faded at its moment. With
   * something after the words, pinned to the box's end, the new words fit only once the box is open: they would stand
   * under it before
   */
  function settle(incoming: readonly HTMLElement[], outgoing: readonly HTMLElement[]) {
    const from = current(), to = natural()
    const still = reduced()
    if (to > room() + 0.5) {
      // too long for one line here: wrapped, balanced, the box's width its own; the words cross-fade at once
      setWrap(true)
      for (const el of outgoing) leave(el, 0)
      for (const el of incoming) enter(el, 0)
      return
    }
    const wrapped = wrapping()
    setWrap(false)
    const d = to - from
    const grow = d > 0.5 && !wrapped, shrink = d < -0.5 && !wrapped
    resize(from, to, wrapped ? 'snap' : still ? (shrink ? 'late' : 'snap') : grow ? 'grow' : shrink ? 'shrink' : 'snap')
    const need = after() ? to : to - px(style(box).paddingInlineEnd)
    const swap = grow && !still ? swapAt(from, to, incoming.length ? [need] : []) : 0
    for (const el of outgoing) leave(el, swap)
    for (const el of incoming) enter(el, swap)
  }
  /** the width read again (the window, the fonts, what follows the words): moved where it no longer holds its words */
  function refit() {
    if (!live) return
    const to = natural(), fits = to <= room() + 0.5
    if (!fits) return setWrap(true)
    if (wrapping()) {
      setWrap(false)
      return resize(to, to, 'snap')
    }
    if (Math.abs(to - target) > 0.5) settle([], [])
  }

  // ------------------------------------------------------------------ the count, in place
  /** a changed digit cross-fades where it stands, opacity alone, after `delay` */
  function roll(dg: HTMLElement, to: string, delay: number) {
    const old = dg.querySelector<HTMLElement>('.d:not([data-out])')
    for (const gone of dg.querySelectorAll('.d[data-out]')) gone.remove()
    const next = doc.createElement('span')
    next.className = 'd'
    next.textContent = to
    dg.append(next)
    const timing = { duration: CHOREOGRAPHY.morph, delay, easing: css(OUT) }
    if (old?.textContent) {
      old.setAttribute('data-out', '')
      const seen = style(old).opacity
      old.animate([{ opacity: seen === '' ? 1 : Number(seen) }, { opacity: 0 }], { ...timing, fill: 'both' }).finished.then(() => old.remove(), () => {})
    } else old?.remove()
    next.animate([{ opacity: 0 }, { opacity: 1 }], { ...timing, fill: 'backwards' })
  }
  /** the count drawn changed to `to`: its changed digits, a cell opened for each digit gained, closed for each lost */
  function morph(line: HTMLElement, from: number, to: number) {
    const num = line.querySelector<HTMLElement>('.num')
    if (!num) return
    const a = String(from), b = String(to), still = reduced()
    let resized = false
    for (let i = a.length; i < b.length; i++) {
      const dg = digit('')
      num.prepend(dg)
      resized = true
      if (still) continue
      const w = px(style(dg).width)
      dg.dataset.grow = String(w)
      dg.animate([{ width: '0px' }, { width: `${w}px` }], { duration: CHOREOGRAPHY.grow, easing: css(SOFT) }).finished.then(() => { delete dg.dataset.grow }, () => {})
    }
    for (let i = b.length; i < a.length; i++) {
      const dg = num.querySelector<HTMLElement>(':scope > .dg:not([data-close])')
      if (!dg) break
      resized = true
      dg.dataset.close = ''
      const v = dg.querySelector<HTMLElement>('.d:not([data-out])')
      if (still || !v) { dg.remove(); continue }
      v.setAttribute('data-out', '')
      v.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CHOREOGRAPHY.morph, easing: css(OUT), fill: 'forwards' })
      dg.animate([{ width: style(dg).width }, { width: '0px' }], { duration: CHOREOGRAPHY.shrink, easing: css(IN_OUT), fill: 'forwards' }).finished.then(() => dg.remove(), () => {})
    }
    const cells = [...num.querySelectorAll<HTMLElement>(':scope > .dg:not([data-close])')]
    // the number changes as one: with a digit gained, every changed digit waits until its new cell is 60 % open
    const wait = b.length > a.length && !still ? CHOREOGRAPHY.grow * timeAt(CHOREOGRAPHY.appearAt) : 0
    b.split('').forEach((d, i) => {
      const dg = cells[i]
      if (dg && dg.querySelector('.d:not([data-out])')?.textContent !== d) roll(dg, d, wait)
    })
    if (resized) settle([], [])
  }
  /** a burst lands on its latest: shown at once, then at most once per 300 ms */
  function flush() {
    const c = live?.count
    if (!live || !c) return
    c.timer = 0
    const wait = c.next - now()
    if (wait > 0) {
      c.timer = win.setTimeout(flush, wait)
      return
    }
    if (c.wanted === c.shown) return
    morph(live.el, c.shown, c.wanted)
    c.shown = c.wanted
    c.next = now() + CHOREOGRAPHY.morphGap
  }
  function count(n: number) {
    const c = live?.count
    if (!c) return
    c.wanted = n
    if (!c.timer) flush()
  }
  const stopCount = () => { if (live?.count?.timer) win.clearTimeout(live.count.timer) }

  // ------------------------------------------------------------------ the window and the fonts
  const slot = box.parentElement
  const watch = typeof win.ResizeObserver === 'function' && slot ? new win.ResizeObserver(() => refit()) : null
  if (slot) watch?.observe(slot)
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts
  fonts?.addEventListener?.('loadingdone', refit)

  return {
    change(w, incoming = [], outgoing = []) {
      const gone = outgoing.map(adopt).filter((el): el is HTMLElement => el !== null)
      if (!live) {
        // the capsule's first words: everything shown at once, its width at once
        live = { el: build(w), words: w, count: w.count === undefined ? null : { shown: w.count, wanted: w.count, next: 0, timer: 0 } }
        cell.append(live.el)
        for (const el of gone) drop(el)
        const to = natural()
        if (to > room() + 0.5) setWrap(true)
        else resize(to, to, 'snap')
        return
      }
      const same = keyOf(w) === keyOf(live.words)
      if (!same && sameShape(live.words, w) && lookOf(live.el).o > SEEN) {
        // the count alone, in place
        live.words = w
        count(w.count as number)
        if (incoming.length || gone.length) settle(incoming, gone)
        return
      }
      if (same) {
        if (incoming.length || gone.length) settle(incoming, gone)
        else refit()
        return
      }
      // other words: the ones in the cell go (those not shown yet unseen), the new ones wait for the box
      stopCount()
      const lines = [...cell.children] as HTMLElement[]
      live = { el: build(w), words: w, count: w.count === undefined ? null : { shown: w.count, wanted: w.count, next: 0, timer: 0 } }
      cell.append(live.el)
      settle([live.el, ...incoming], [...lines, ...gone])
    },
    stop() {
      stopCount()
      for (const el of [...waiting.keys()]) {
        unwait(el)
        el.inert = false
      }
      watch?.disconnect()
      fonts?.removeEventListener?.('loadingdone', refit)
      width?.cancel()
      width = null
      for (const [el, f] of fades) {
        f.anim.cancel()
        if (el instanceof HTMLElement) delete el.dataset.state
      }
      fades.clear()
      for (const el of ghosts) el.remove()
      ghosts.clear()
      cell.replaceChildren()
      live = null
      target = -1
      box.style.width = ''
      delete box.dataset.resizing
      box.removeAttribute('data-wrap')
    },
  }
}

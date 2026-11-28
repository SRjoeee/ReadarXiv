// A crop kept on screen (link previews' §3.6; the approved prototype's `keep`, its eighth pass for the zoom): a click or Enter on a
// figure's, a table's, a display's, a section's or a note's preview keeps it where it stands, the same cut at the same size (the
// owner's (e), judged on staging). Keeping is felt, not explained: it starts lifted and settles in the capsules' tempo, then
// looks like any preview. It moves by a drag anywhere on it (grabbed, lifted in the hand) and by the arrows while it has the
// focus (KEEP_STEP), through the one rule for where it may be (panel.ts placeKept). Its close is a round ×, shown on hover and
// on the keyboard's focus, never on the focus a drag leaves (the sheet's rule). Esc closes the topmost thing (the preview first:
// previews.ts), the focus back to the link it came from. One at a time: keeping another replaces it. To assistive technology a
// dialog named by its label, its × named to close it (UI.md S-R-32).
// Its own zoom (docs/PDF-READER.md §20.7): a zoom gesture on it (zoom-gesture.ts: Ctrl
// and the wheel, a trackpad's pinch in Chrome; WebKit's gesture events; two touch pointers) zooms its image about the pointer,
// never the browser's page, between the size it opened at and its most (panel.ts mostScale), the image always whole; the keys
// + and - by the panes' tenth, 0 back. While a gesture runs its drawing is scaled (a transform, on the compositor); settled, the
// crop is drawn again at that scale (the content's own `zoom.draw`: the left's arXiv drawing, the right's page through the
// stack's one read) and the drawing it replaces is let go. Its percentage (UI.md S-R-34, the chip) at the top-left, opposite
// the ×: `data-axt-chip` none | live (a zoom running: digits at full ink, no pointer events) | ghost (glass: for CHIP_AFTER_MS
// after a zoom, and while the size is not the opening one and the pointer or the keyboard's focus is on the panel) | awake (the
// pointer within WAKE_PX of it, or the keyboard on it: the ×'s own dress, pressable); a press returns it to the size it opened
// at in RESET_MS. Where it opened at its most a gesture does nothing and no chip shows.
import type { Clock } from '../stack/clock.ts'
import { isZoomWheel, readGestureZoom, zoomFactor } from '../zoom-gesture.ts'
import {
  CHIP_AFTER_MS,
  ease,
  INERT,
  KEEP_STEP,
  KEPT_STEP,
  mostScale,
  PANEL_PAD,
  placeKept,
  RESET_MS,
  SETTLE_MS,
  type Size,
  STEP_MS,
  softScale,
  WAKE_PX,
  zoomAbout,
} from './panel.ts'
import type { KeepHost, PreviewContent, PreviewWords } from './previews.ts'

export { KEEP_EDGE, KEEP_STEP, KEEP_TOP } from './panel.ts'

/** the capsules' tempo out, ms (the reader's §6.6: 160 ms; the element let go just after) */
const OUT_MS = 170

const SVG = 'http://www.w3.org/2000/svg'
/** lucide's X, 13 px in the ×'s 24 */
function xIcon(): SVGSVGElement {
  const s = document.createElementNS(SVG, 'svg')
  s.setAttribute('viewBox', '0 0 24 24')
  s.setAttribute('aria-hidden', 'true')
  for (const d of ['M18 6 6 18', 'm6 6 12 12']) {
    const p = document.createElementNS(SVG, 'path')
    p.setAttribute('d', d)
    s.append(p)
  }
  return s
}

/** a drawing let go: its canvases' pixels released at once, not when the collector comes */
function release(el: Element | null) {
  for (const c of el?.querySelectorAll('canvas') ?? []) {
    c.width = 0
    c.height = 0
  }
}
const pct = (s: number) => `${Math.round(s * 100)}%`

type Chip = 'none' | 'live' | 'ghost' | 'awake'
interface Zoom {
  z: NonNullable<PreviewContent['zoom']>
  /** the least (the size it opened at), the most, the scale now, the scale its crop is drawn at */
  s0: number
  max: number
  s: number
  drawn: number
  kv: HTMLElement
  crop: HTMLElement
  chip: HTMLButtonElement
  /** where it stands now (the window's px, before rounding) */
  left: number
  top: number
  zooming: boolean
  after: boolean
  hover: boolean
  near: boolean
  settleT: number
  chipT: number
  anim: number
  wheel: { f: number; x: number; y: number; frame: number }
  redraw: AbortController | null
}

export function createKeep(o: {
  clock: Clock
  words(): PreviewWords
  /** the window the one rule keeps it inside (the reader's: the window) */
  area?(): Size
  /** whether motion is reduced (the steps and the reset at once, the soft stop a plain stop) */
  reduced?(): boolean
}): KeepHost {
  const { clock } = o
  const area = o.area ?? (() => ({ width: window.innerWidth, height: window.innerHeight }))
  const reduced = o.reduced ?? (() => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  let kept: { el: HTMLElement; link: HTMLElement; off: AbortController; zoom: Zoom | null } | null = null

  /** its size now: its image's and its padding where it zooms, else as laid out */
  const sizeOf = (el: HTMLElement, zm: Zoom | null): Size => {
    if (!zm) return { width: el.offsetWidth, height: el.offsetHeight }
    const i = zm.z.size(zm.s)
    return { width: i.width + 2 * PANEL_PAD, height: i.height + 2 * PANEL_PAD }
  }
  /** the one rule applied to a place asked for */
  function put(el: HTMLElement, zm: Zoom | null, left: number, top: number) {
    const p = placeKept({ left, top, ...sizeOf(el, zm) }, area())
    el.style.left = `${Math.round(p.left)}px`
    el.style.top = `${Math.round(p.top)}px`
    if (zm) {
      zm.left = p.left
      zm.top = p.top
    }
  }
  const at = (el: HTMLElement) => ({
    left: Number.parseFloat(el.style.left) || el.offsetLeft,
    top: Number.parseFloat(el.style.top) || el.offsetTop,
  })

  // ---------------------------------------------------------------- the zoom
  const inert = (zm: Zoom) => zm.max <= zm.s0 * INERT
  const zoomed = (zm: Zoom) => Math.abs(zm.s / zm.s0 - 1) > INERT - 1
  function chipState(el: HTMLElement, zm: Zoom) {
    let kbd = false
    try {
      kbd = el.matches(':focus-visible') || zm.chip.matches(':focus-visible')
    } catch {
      /* a browser that cannot tell: none */
    }
    let s: Chip = 'none'
    if (zm.zooming) s = 'live'
    else if (zm.after || (zoomed(zm) && (zm.hover || kbd)))
      s = zm.near || (kbd && document.activeElement === zm.chip) ? 'awake' : 'ghost'
    if (el.dataset.axtChip !== s) el.dataset.axtChip = s
  }
  /** its image at scale `s2` about the window's point (x, y): the bitmap scaled, the place through the one rule */
  function apply(el: HTMLElement, zm: Zoom, s2: number, x: number, y: number) {
    const from = zm.z.size(zm.s),
      to = zm.z.size(s2)
    const p = zoomAbout({ left: zm.left, top: zm.top, pointer: { x, y }, from, to })
    zm.s = s2
    zm.kv.style.width = `${to.width}px`
    zm.kv.style.height = `${to.height}px`
    zm.crop.style.transform = Math.abs(s2 / zm.drawn - 1) < 1e-9 ? '' : `scale(${s2 / zm.drawn})`
    put(el, zm, p.left, p.top)
    const z = zoomed(zm)
    zm.chip.textContent = pct(s2)
    zm.chip.tabIndex = z ? 0 : -1
    if (z) zm.chip.removeAttribute('aria-hidden')
    else zm.chip.setAttribute('aria-hidden', 'true')
    if (!z && document.activeElement === zm.chip) el.focus({ preventScroll: true })
    chipState(el, zm)
  }
  /** the crop drawn again at the scale it settled at; the drawing it replaces let go. Where it cannot be drawn now it keeps the
   *  scaled drawing, and the next settle asks again (nothing remembered) */
  function redraw(zm: Zoom) {
    zm.redraw?.abort()
    zm.redraw = null
    const s = zm.s
    if (Math.abs(s / zm.drawn - 1) < 1e-9) return
    const ac = new AbortController()
    zm.redraw = ac
    zm.z.draw(s, ac.signal).then(
      (crop) => {
        if (ac.signal.aborted || kept?.zoom !== zm || zm.s !== s || !crop) {
          release(crop)
          return
        }
        zm.redraw = null
        const old = zm.crop
        zm.kv.replaceChildren(crop)
        zm.crop = crop
        zm.drawn = s
        release(old)
      },
      () => {},
    )
  }
  function begin(el: HTMLElement, zm: Zoom) {
    if (!zm.zooming) {
      clock.cancel(zm.anim)
      zm.anim = 0
      zm.redraw?.abort()
      zm.redraw = null
    }
    clock.clear(zm.settleT)
    clock.clear(zm.chipT)
    zm.zooming = true
    zm.after = false
    chipState(el, zm)
  }
  function end(el: HTMLElement, zm: Zoom) {
    zm.zooming = false
    zm.after = true
    chipState(el, zm)
    clock.clear(zm.chipT)
    zm.chipT = clock.later(() => {
      zm.after = false
      chipState(el, zm)
    }, CHIP_AFTER_MS)
    redraw(zm)
  }
  const soft = (zm: Zoom, f: number) => softScale({ s: zm.s, f, lo: zm.s0, hi: zm.max, reduced: reduced() })
  /** the script's motion to `target` in `ms` about `anchor()` (a point of the window), then drawn again */
  function animate(el: HTMLElement, zm: Zoom, target: number, ms: number, anchor: () => [number, number]) {
    clock.cancel(zm.anim)
    zm.anim = 0
    const from = zm.s
    const done = () => redraw(zm)
    if (Math.abs(target / from - 1) < 1e-9) return done()
    if (reduced() || !ms) {
      apply(el, zm, target, ...anchor())
      return done()
    }
    const t0 = clock.now()
    const tick = () => {
      if (kept?.zoom !== zm) return
      const p = Math.min(1, (clock.now() - t0) / ms)
      const s = p < 1 ? Math.exp(Math.log(from) + (Math.log(target) - Math.log(from)) * ease(p)) : target
      apply(el, zm, s, ...anchor())
      if (p < 1) zm.anim = clock.frame(tick)
      else {
        zm.anim = 0
        done()
      }
    }
    zm.anim = clock.frame(tick)
  }
  /** its image's box on the window: its centre (a key's step), its top-left corner (the chip's return shrinks towards it) */
  const centre = (zm: Zoom): [number, number] => {
    const i = zm.z.size(zm.s)
    return [zm.left + PANEL_PAD + i.width / 2, zm.top + PANEL_PAD + i.height / 2]
  }
  const corner = (zm: Zoom): [number, number] => [zm.left + PANEL_PAD, zm.top + PANEL_PAD]
  function step(el: HTMLElement, zm: Zoom, f: number) {
    if (inert(zm)) return
    const target = Math.min(zm.max, Math.max(zm.s0, zm.s * f))
    // (a key's step is a zoom too: the chip live through its motion, then its while)
    begin(el, zm)
    zm.after = false
    clock.clear(zm.settleT)
    zm.settleT = clock.later(() => {
      zm.zooming = false
      zm.after = true
      chipState(el, zm)
      clock.clear(zm.chipT)
      zm.chipT = clock.later(() => {
        zm.after = false
        chipState(el, zm)
      }, CHIP_AFTER_MS)
    }, STEP_MS + 20)
    animate(el, zm, target, reduced() ? 0 : STEP_MS, () => centre(zm))
  }
  function reset(el: HTMLElement, zm: Zoom) {
    clock.clear(zm.chipT)
    zm.after = false
    animate(el, zm, zm.s0, reduced() ? 0 : RESET_MS, () => corner(zm))
  }

  /** the zoom of a kept crop: its image in a box of its own size, the chip, the gestures, the keys */
  function zoomOf(el: HTMLElement, content: PreviewContent, signal: AbortSignal): Zoom | null {
    const z = content.zoom
    const crop = el.querySelector<HTMLElement>('.axt-pv-crop')
    if (!z || !crop) return null
    const kv = document.createElement('div')
    kv.className = 'axt-pv-kv'
    crop.replaceWith(kv)
    kv.append(crop)
    const i0 = z.size(z.scale)
    kv.style.width = `${i0.width}px`
    kv.style.height = `${i0.height}px`
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'axt-pv-chip'
    chip.setAttribute('aria-label', o.words().reset)
    chip.tabIndex = -1
    chip.setAttribute('aria-hidden', 'true')
    chip.textContent = pct(z.scale)
    const p = at(el)
    const zm: Zoom = {
      z,
      s0: z.scale,
      max: mostScale({ s0: z.scale, extent: z.extent, segs: z.segs, area: area() }),
      s: z.scale,
      drawn: z.scale,
      kv,
      crop,
      chip,
      left: p.left,
      top: p.top,
      zooming: false,
      after: false,
      hover: false,
      near: false,
      settleT: 0,
      chipT: 0,
      anim: 0,
      wheel: { f: 1, x: 0, y: 0, frame: 0 },
      redraw: null,
    }
    try {
      zm.hover = el.matches(':hover')
    } catch {
      /* none */
    }
    const opt = { signal }
    chip.addEventListener('click', () => reset(el, zm), opt)
    chip.addEventListener('focus', () => chipState(el, zm), opt)
    chip.addEventListener('blur', () => chipState(el, zm), opt)
    el.addEventListener('focusin', () => chipState(el, zm), opt)
    el.addEventListener('focusout', () => clock.frame(() => chipState(el, zm)), opt)
    const hover = (on: boolean) => (e: PointerEvent) => {
      if (e.pointerType === 'touch' || zm.hover === on) return
      zm.hover = on
      if (!on) zm.after = false
      chipState(el, zm)
    }
    el.addEventListener('pointerenter', hover(true), opt)
    el.addEventListener('pointermove', hover(true), opt)
    el.addEventListener('pointerleave', hover(false), opt)
    // (the pointer's approach to the chip: within WAKE_PX of its box)
    document.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType === 'touch' || kept?.zoom !== zm) return
        const r = chip.getBoundingClientRect()
        const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right),
          dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom)
        const near = Math.hypot(dx, dy) <= WAKE_PX
        if (near !== zm.near) {
          zm.near = near
          chipState(el, zm)
        }
      },
      { signal, passive: true },
    )
    // (a zoom wheel: one change a frame, its factors gathered; its end SETTLE_MS after its last event)
    el.addEventListener(
      'wheel',
      (e) => {
        if (!isZoomWheel(e)) return
        e.preventDefault()
        if (inert(zm)) return
        begin(el, zm)
        zm.settleT = clock.later(() => end(el, zm), SETTLE_MS)
        const w = zm.wheel
        w.f *= zoomFactor(e)
        w.x = e.clientX
        w.y = e.clientY
        w.frame ||= clock.frame(() => {
          w.frame = 0
          const f = w.f
          w.f = 1
          if (kept?.zoom === zm && Math.abs(f - 1) > 1e-4) apply(el, zm, soft(zm, f), w.x, w.y)
        })
      },
      { passive: false, signal },
    )
    readGestureZoom(
      el,
      {
        start: () => {
          if (!inert(zm)) begin(el, zm)
        },
        change: (f, x, y) => {
          if (!inert(zm)) apply(el, zm, soft(zm, f), x, y)
        },
        end: () => {
          if (!inert(zm)) end(el, zm)
        },
      },
      signal,
    )
    el.append(chip)
    return zm
  }

  function drop(back: boolean) {
    if (!kept) return
    const { el, link, off, zoom } = kept
    kept = null
    off.abort()
    if (zoom) stop(zoom)
    const hadFocus = el.contains(document.activeElement)
    el.setAttribute('data-axt-out', '')
    o.clock.later(() => {
      el.remove()
      release(el)
    }, OUT_MS)
    if (back && hadFocus && link.isConnected) link.focus({ preventScroll: true })
  }
  function stop(zm: Zoom) {
    clock.cancel(zm.anim)
    clock.cancel(zm.wheel.frame)
    clock.clear(zm.settleT)
    clock.clear(zm.chipT)
    zm.redraw?.abort()
  }
  return {
    keep(pv, content: PreviewContent, link, byKey) {
      drop(false)
      const off = new AbortController()
      const signal = off.signal
      // (the crop out of its keep button: kept, it is the panel's own content)
      const button = pv.querySelector('.axt-pv-keep')
      if (button) button.replaceWith(...button.childNodes)
      pv.classList.add('axt-pv-kept')
      pv.removeAttribute('data-axt-quiet')
      pv.removeAttribute('data-axt-at')
      pv.setAttribute('role', 'dialog')
      pv.setAttribute('aria-label', content.label)
      pv.tabIndex = 0
      pv.dataset.axtChip = 'none'
      const zoom = zoomOf(pv, content, signal)
      const x = document.createElement('button')
      x.type = 'button'
      x.className = 'axt-pv-x'
      x.setAttribute('aria-label', o.words().close(content.label))
      x.append(xIcon())
      x.addEventListener('click', () => drop(true), { signal })
      pv.append(x)
      kept = { el: pv, link, off, zoom }
      // (a drag anywhere on it but its controls: grabbed, lifted in the hand, through the one rule; touch: one finger moves it,
      // two zoom its image by their spread about their midpoint)
      let from: { x: number; y: number; left: number; top: number; id: number } | null = null
      const touches = new Map<number, { x: number; y: number }>()
      let spread = 0
      const twoOf = () => {
        const [a, b] = [...touches.values()] as [{ x: number; y: number }, { x: number; y: number }]
        return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      }
      const capture = (id: number) => {
        try {
          pv.setPointerCapture(id)
        } catch {
          /* a pointer the browser no longer tracks */
        }
      }
      pv.addEventListener(
        'pointerdown',
        (e) => {
          if ((e.target as Element).closest?.('.axt-pv-x, .axt-pv-chip')) return
          if (e.pointerType === 'touch') {
            touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
            if (touches.size === 2) {
              from = null
              pv.removeAttribute('data-axt-drag')
              capture(e.pointerId)
              spread = twoOf().d
              if (zoom && !inert(zoom)) begin(pv, zoom)
              return
            }
          }
          if (e.button !== 0) return
          const p = at(pv)
          from = { x: e.clientX, y: e.clientY, left: p.left, top: p.top, id: e.pointerId }
          capture(e.pointerId)
          pv.setAttribute('data-axt-drag', '')
        },
        { signal },
      )
      pv.addEventListener(
        'pointermove',
        (e) => {
          if (touches.has(e.pointerId)) {
            touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
            if (touches.size === 2) {
              const t = twoOf()
              if (zoom && spread > 0 && !inert(zoom)) apply(pv, zoom, soft(zoom, t.d / spread), t.x, t.y)
              spread = t.d
              return
            }
          }
          if (from && e.pointerId === from.id)
            put(pv, zoom, from.left + e.clientX - from.x, from.top + e.clientY - from.y)
        },
        { signal },
      )
      const endOf = (e: PointerEvent) => {
        if (touches.delete(e.pointerId) && touches.size === 1 && spread) {
          spread = 0
          if (zoom?.zooming) end(pv, zoom)
        }
        if (!from || e.pointerId === from.id) {
          from = null
          pv.removeAttribute('data-axt-drag')
        }
      }
      pv.addEventListener('pointerup', endOf, { signal })
      pv.addEventListener('pointercancel', endOf, { signal })
      pv.addEventListener('lostpointercapture', endOf, { signal })
      pv.addEventListener(
        'keydown',
        (e) => {
          // (+ and - step its image as the toolbar steps the panes; 0 returns it to the size it opened at)
          if (zoom && !e.metaKey && !e.ctrlKey && !e.altKey) {
            const f = e.key === '+' || e.key === '=' ? KEPT_STEP : e.key === '-' || e.key === '_' ? 1 / KEPT_STEP : 0
            if (f) {
              e.preventDefault()
              step(pv, zoom, f)
              return
            }
            if (e.key === '0') {
              e.preventDefault()
              reset(pv, zoom)
              return
            }
          }
          const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
          if (!d || e.target !== pv) return
          e.preventDefault()
          const p = at(pv)
          put(pv, zoom, p.left + d[0]! * KEEP_STEP, p.top + d[1]! * KEEP_STEP)
        },
        { signal },
      )
      if (byKey) pv.focus({ preventScroll: true })
    },
    esc() {
      if (!kept) return false
      drop(true)
      return true
    },
    dispose() {
      if (!kept) return
      const { el, off, zoom } = kept
      kept = null
      off.abort()
      if (zoom) stop(zoom)
      el.remove()
      release(el)
    },
  }
}

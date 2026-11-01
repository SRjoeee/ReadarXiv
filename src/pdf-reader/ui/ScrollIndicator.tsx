// A pane's scroll indicator (the reader's design, §6.5): the native scrollbar is off; on the pane's right edge a 14 px
// track and a 4 px thumb whose place follows the scroll on the compositor (a scroll-driven animation, reader.css) and
// whose length is set here, in the frame the pane's size or its pages' height changes — never on a scroll. Hidden at
// rest, and through a zoom until the reader next scrolls; the thumb drags, a press on the track turns a screen towards it,
// and a press makes its pane the leading side
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { ReaderController, Side } from '../controller'

/** the pane's scroller the engine shows now (it replaces the right one as translations come) */
const scrollerOf = (track: HTMLElement | null) => track?.parentElement?.querySelector<HTMLElement>('.viewerContainer:not(.axt-incoming)') ?? null

const DRAG_ENDS = ['pointerup', 'pointercancel', 'lostpointercapture'] as const

/** the thumb: the pane's visible share of the track, 32 px at least */
export const thumbSize = (track: number, client: number, scroll: number) => Math.min(track, Math.max(32, Math.round((track * client) / Math.max(scroll, 1))))

export const ScrollIndicator = forwardRef<HTMLDivElement, { controller: ReaderController; side: Side }>(function ScrollIndicator({ controller, side }, ref) {
  const track = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => track.current as HTMLDivElement)
  // The length in the frame the scroll's length changes, before that frame is painted: a ResizeObserver over the pane and
  // over the pages' stack in its scroller is told after the frame's layout, and what its callback sets is laid out again
  // before the paint. The thumb's place is the scroll timeline's share of the length left to it (reader.css @keyframes
  // thumb), in the same frame: set a frame later — as it was, from a React effect on the zoom's state and a frame after
  // that — every step of a pinch drew the thumb at the new share of the old length, then moved it once the length came,
  // so that it shook up and down through the gesture
  useEffect(() => {
    const t = track.current, c = scrollerOf(t), pane = t?.parentElement
    if (!t || !c || !pane) return
    const size = () => {
      const s = scrollerOf(t)
      if (!s) return
      t.hidden = s.scrollHeight <= s.clientHeight + 1
      t.style.setProperty('--track', `${t.clientHeight}px`)
      t.style.setProperty('--thumb', `${thumbSize(t.clientHeight, s.clientHeight, s.scrollHeight)}px`)
    }
    const observer = new ResizeObserver(size)
    observer.observe(pane)
    const stack = c.querySelector(':scope > .pdfViewer')
    if (stack) observer.observe(stack)
    return () => observer.disconnect()
  }, [])
  // Hidden through a zoom (the owner's decision of 2026-11-01, §6.5): from the zoom's first Ctrl or ⌘ wheel over the pages,
  // or its first change of scale, whatever asked it (a pinch, a key, the menu, a fit), at once and with no fade, until the
  // reader next scrolls. A scroll is the reader's when the reader's own input has come since the zoom's last change of scale:
  // a wheel without Ctrl or ⌘, a key other than the zoom's, a touch, a press anywhere (a link, the contents, the page pill).
  // The zoom's own scrolls come with none — each step's anchoring, a commit's, and the panes' level once it settles (sync.mjs
  // zoomed: 150 ms on, at a glide's end) — and leave it hidden. The reader's shows it again, from its first
  // frame, at its length and place (both are kept through the zoom); a press on it shows it too: its drag always works
  useEffect(() => {
    const t = track.current, pane = t?.parentElement
    if (!t || !pane) return
    let scale = controller.getState().scale, own = false
    const hide = () => { t.toggleAttribute('data-zoomed', true); own = false }
    const unsubscribe = controller.subscribe(() => {
      const now = controller.getState().scale
      if (now === scale) return
      scale = now
      hide()
    })
    const input = () => { own = true }
    const onWheel = (e: WheelEvent) => {
      if (!(e.target as Element | null)?.closest?.('.pane')) return
      if (e.ctrlKey || e.metaKey) hide()
      else input()
    }
    // (the zoom's keys, Ctrl or ⌘ with =, +, − or 0, are the zoom's; Ctrl or ⌘ with F, the browser's find, is the reader's)
    const onKey = (e: KeyboardEvent) => { if (!((e.ctrlKey || e.metaKey) && ['=', '+', '-', '0'].includes(e.key))) input() }
    const onScroll = () => { if (own) t.removeAttribute('data-zoomed') }
    const onPress = () => t.removeAttribute('data-zoomed')
    window.addEventListener('wheel', onWheel, { capture: true, passive: true })
    window.addEventListener('keydown', onKey, { capture: true, passive: true })
    window.addEventListener('pointerdown', input, { capture: true, passive: true })
    window.addEventListener('touchstart', input, { capture: true, passive: true })
    pane.addEventListener('scroll', onScroll, { capture: true, passive: true })
    t.addEventListener('pointerdown', onPress)
    return () => {
      unsubscribe()
      window.removeEventListener('wheel', onWheel, { capture: true })
      window.removeEventListener('keydown', onKey, { capture: true })
      window.removeEventListener('pointerdown', input, { capture: true })
      window.removeEventListener('touchstart', input, { capture: true })
      pane.removeEventListener('scroll', onScroll, { capture: true })
      t.removeEventListener('pointerdown', onPress)
    }
  }, [controller])
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = track.current, c = scrollerOf(t)
    if (!t || !c) return
    e.preventDefault()
    controller.lead(side)
    const thumb = t.querySelector('i')!
    if (e.target !== thumb) {
      const r = thumb.getBoundingClientRect()
      c.scrollBy({ top: (e.clientY < r.top ? -1 : 1) * c.clientHeight * 0.9, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      return
    }
    t.setPointerCapture(e.pointerId)
    t.toggleAttribute('data-drag', true)
    const y0 = e.clientY, top0 = c.scrollTop, per = (c.scrollHeight - c.clientHeight) / Math.max(1, t.clientHeight - thumb.offsetHeight)
    const move = (ev: PointerEvent) => { c.scrollTop = top0 + (ev.clientY - y0) * per }
    // the drag ends however the pointer goes: released, cancelled by the system, or its capture lost (a tab switch,
    // the pane hidden) — or the thumb would stay grabbed
    const up = () => {
      t.removeAttribute('data-drag')
      t.removeEventListener('pointermove', move)
      for (const type of DRAG_ENDS) t.removeEventListener(type, up)
    }
    t.addEventListener('pointermove', move)
    for (const type of DRAG_ENDS) t.addEventListener(type, up)
  }
  return (
    <div ref={track} className="chrome indicator" aria-hidden="true" onPointerDown={onDown}>
      <i />
    </div>
  )
})

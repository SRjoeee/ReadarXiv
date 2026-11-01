// A pane's scroll indicator (the reader's design, §6.5): the native scrollbar is off; on the pane's right edge a 14 px
// track and a 4 px thumb whose place follows the scroll on the compositor (a scroll-driven animation, reader.css) and
// whose length is set here, in the frame the pane's size or its pages' height changes — never on a scroll. Hidden at
// rest; the thumb drags, a press on the track turns a screen towards it, and a press makes its pane the leading side
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

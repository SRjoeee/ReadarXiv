// Pinch zoom (the reader's design, §6.8): a trackpad pinch arrives as a wheel event with Ctrl held; over the pages it
// zooms both sides together about the pointer — PDF.js scales them by CSS while the fingers move and draws them once,
// 400 ms after they stop. A trackpad's small deltas zoom continuously, a mouse notch a tenth. One call per frame. ⌘ and
// Ctrl with − and + zoom by a tenth; the browser's own zoom is taken only over the pages
import { type RefObject, useEffect } from 'react'
import type { ReaderController, Side } from '../controller'

export const wheelStep = (deltaY: number) => (Math.abs(deltaY) >= 40 ? Math.sign(deltaY) * 0.1 : deltaY * 0.01)

export function usePinch(controller: ReaderController, doc: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = doc.current
    if (!el) return
    let factor = 1, origin: [number, number] = [0, 0], side: Side = 'left', frame = 0
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const pane = (e.target as Element).closest<HTMLElement>('.pane')
      if (!pane) return
      e.preventDefault()
      factor *= Math.exp(-wheelStep(e.deltaY))
      origin = [e.clientX, e.clientY]
      side = pane.dataset.side as Side
      frame ||= requestAnimationFrame(() => {
        frame = 0
        const f = factor
        factor = 1
        if (Math.abs(f - 1) >= 0.005) controller.pinch(side, f, origin)
      })
    }
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      if (e.key === '=' || e.key === '+') { e.preventDefault(); controller.zoomBy(1.1) }
      else if (e.key === '-') { e.preventDefault(); controller.zoomBy(1 / 1.1) }
    }
    el.addEventListener('wheel', onWheel, { passive: false, capture: true })
    document.addEventListener('keydown', onKey)
    return () => { el.removeEventListener('wheel', onWheel, { capture: true }); document.removeEventListener('keydown', onKey); cancelAnimationFrame(frame) }
  }, [controller, doc])
}

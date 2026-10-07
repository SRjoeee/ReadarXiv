// What floats over a pane shows while it scrolls and a while after (the reader's design, §6.4, §6.5, §12): one passive
// listener per pane, on the pane itself and capturing (the engine replaces the right pane's scroller as translations
// come), which sets data-live and clears it after each element's delay. Nothing renders on a scroll
import { type RefObject, useEffect } from 'react'

export function useScrollShow(pane: RefObject<HTMLElement | null>, targets: [RefObject<HTMLElement | null>, number][]) {
  useEffect(() => {
    const el = pane.current
    if (!el) return
    const timers = new Map<HTMLElement, number>()
    const on = () => {
      for (const [ref, ms] of targets) {
        const t = ref.current
        if (!t) continue
        t.toggleAttribute('data-live', true)
        clearTimeout(timers.get(t))
        timers.set(t, window.setTimeout(() => t.removeAttribute('data-live'), ms))
      }
    }
    el.addEventListener('scroll', on, { capture: true, passive: true })
    return () => { el.removeEventListener('scroll', on, { capture: true }); for (const t of timers.values()) clearTimeout(t) }
  }, [pane, targets])
}

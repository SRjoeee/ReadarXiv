// Kept at this path for the website's reader (readarxiv-web, @vendor/pdf-reader/ui/StatusCapsule) until its cut-over; nothing in the extension imports it. See tests/contract/website-imports.test.ts.
// The status capsule's timing the website takes (the reader's design, §6.6): the narrow window's words leave by themselves
// after 5 s of being read, waiting while the pointer is over them or they hold the focus (the maintainer, 2026-10-01). The
// capsule itself is the reader package's (packages/reader/src/chrome/StatusCapsule.tsx)
import { type FocusEvent, type HTMLAttributes, useEffect, useRef } from 'react'

/** how long the narrow window's words are read before they leave (S-R-14; the maintainer, 2026-10-01) */
export const NARROW_MS = 5000

/**
 * A capsule that leaves by itself after `ms` of being read: the time stands while the pointer is over it or it holds the
 * focus, and the rest of it runs once neither does (the maintainer, 2026-10-01). `on` starts it afresh, the pointer and
 * the focus as if elsewhere — a capsule just drawn has had neither — and `leave` is called once the time is out. The
 * handlers go on the capsule; the website's capsule leaves the same way
 */
export function useTimedLeave(on: boolean, ms: number, leave: () => void): HTMLAttributes<HTMLElement> {
  const at = useRef({ on: false, left: ms, since: 0, timer: 0, pointer: false, focus: false })
  const go = () => {
    const s = at.current
    if (!s.on || s.timer || s.pointer || s.focus) return
    s.since = Date.now()
    s.timer = window.setTimeout(() => { s.timer = 0; s.on = false; leave() }, s.left)
  }
  const stand = () => {
    const s = at.current
    if (!s.timer) return
    clearTimeout(s.timer)
    s.timer = 0
    s.left -= Date.now() - s.since
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: started as `on` turns, its handlers reading the ref
  useEffect(() => {
    if (!on) return
    Object.assign(at.current, { on: true, left: ms, pointer: false, focus: false })
    go()
    return () => { stand(); at.current.on = false }
  }, [on, ms])
  return {
    onPointerEnter: () => { at.current.pointer = true; stand() },
    onPointerLeave: () => { at.current.pointer = false; go() },
    onFocus: () => { at.current.focus = true; stand() },
    // a focus moved within the capsule does not count as gone
    onBlur: (e: FocusEvent<HTMLElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
      at.current.focus = false
      go()
    },
  }
}

// The reader's state for React: the controller is an external store (the reader's design, §11.3). A component takes the
// part it shows, and renders again only when that part changes: a page turned in a pane renders its pill, not the page
// (the final review: every event rendered the whole interface, a pinch twice a frame)
import { useRef, useSyncExternalStore } from 'react'
import type { ReaderController, ReaderState } from '../controller'

export function useReader<T>(controller: ReaderController, select: (state: ReaderState) => T): T {
  const last = useRef<{ value: T } | null>(null)
  const snapshot = () => {
    const value = select(controller.getState())
    if (last.current && shallowEqual(last.current.value, value)) return last.current.value
    last.current = { value }
    return value
  }
  return useSyncExternalStore(controller.subscribe, snapshot)
}

/** the same value, or plain objects and arrays whose members are each the same */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b || Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a), kb = Object.keys(b)
  return ka.length === kb.length && ka.every(k => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

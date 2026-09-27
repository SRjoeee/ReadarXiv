// What the settings page's sections share: an undo row back in its row's place, a list's writes and the line a refused
// deletion leaves, a reveal's content kept while it folds away, a popover shut from a pick, an edited item written back
// into its list, a small segmented control's width
import { type CSSProperties, useEffect, useState } from 'react'

/** A list with the rows its deletions left, each at the place its row had (§6.2: the undo row stands where the row was) */
export function withUndo<T, G extends { index: number }>(items: readonly T[], gone: readonly G[]): ({ item: T } | { gone: G })[] {
  const out: ({ item: T } | { gone: G })[] = items.map(item => ({ item }))
  for (const g of [...gone].sort((a, b) => a.index - b.index)) out.splice(Math.min(g.index, out.length), 0, { gone: g })
  return out
}

/**
 * A list's writes (Task 65). A deletion storage refused leaves its item stored: its row stays and its undo row goes
 * (the caller drops it), and `failed` holds — the line at the list's foot, O.saveFailed — until the list's next write
 * lands. `remove` resolves whether storage holds the deletion, and never rejects: a refused write rejects, or, the
 * stored value unreadable, resolves with the configuration in effect (data.ts), which then still holds the item —
 * what `holds` looks for
 */
export function useListWrites<C>(patch: (fn: (latest: C) => C) => Promise<C>): ListWrites<C> {
  const [failed, setFailed] = useState(false)
  const write = (fn: (latest: C) => C): Promise<C> => patch(fn).then(stored => { setFailed(false); return stored })
  const remove = (fn: (latest: C) => C, holds: (stored: C) => boolean): Promise<boolean> =>
    patch(fn).then(stored => !holds(stored), () => false).then(done => { setFailed(!done); return done })
  return { failed, write, remove }
}

export interface ListWrites<C> {
  /** a deletion of the list's was refused, and no write of its has landed since */
  failed: boolean
  write(fn: (latest: C) => C): Promise<C>
  remove(fn: (latest: C) => C, holds: (stored: C) => boolean): Promise<boolean>
}

export const insertAt = <T,>(list: readonly T[], index: number, item: T): T[] => [...list.slice(0, index), item, ...list.slice(index)]

/** What was open, kept for the moment its reveal folds away (§8: closing is 180 ms), so that it folds with its content */
export function useLinger<T>(value: T | null, ms = 180): T | null {
  const [kept, setKept] = useState(value)
  useEffect(() => {
    if (value !== null) {
      setKept(value)
      return
    }
    const timer = setTimeout(() => setKept(null), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return value ?? kept
}

/** A popover shut, as a pick does */
export const shut = (id: string) => document.getElementById(id)?.hidePopover()

/**
 * A list with an edited item written into it — in place, or appended when it is no longer there (another tab deleted
 * it while its editor was open here): the reader's change is their later word on it (the old drawer's `withProfile`)
 */
export const withItem = <T extends { id: string }>(list: readonly T[], next: T): T[] =>
  list.some(x => x.id === next.id) ? list.map(x => (x.id === next.id ? next : x)) : [...list, next]

/** A small segmented control's agreed width (settings-2), read by `.o-seg` */
export const segmentWidth = (px: number) => ({ '--w': `${px}px` }) as CSSProperties

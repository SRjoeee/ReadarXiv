// What the settings page's sections share: an undo row back in its row's place, a list's writes and the line a refused
// deletion leaves, a row focused once it is drawn, a reveal's content kept while it folds away, a popover shut from a
// pick, an edited item written back into its list, a small segmented control's width
import { type CSSProperties, useEffect, useLayoutEffect, useState } from 'react'

/** A list with the rows its deletions left, each at the place its row had (§6.2: the undo row stands where the row was) */
export function withUndo<T, G extends { index: number }>(items: readonly T[], gone: readonly G[]): ({ item: T } | { gone: G })[] {
  const out: ({ item: T } | { gone: G })[] = items.map(item => ({ item }))
  for (const g of [...gone].sort((a, b) => a.index - b.index)) out.splice(Math.min(g.index, out.length), 0, { gone: g })
  return out
}

/**
 * A list's writes (Task 65). A write has landed only when `patch` resolves with the very value its own change produced,
 * which is what surface-config.ts returns and data.ts passes on: a refused write rejects, or, the stored value
 * unreadable, resolves with the configuration in effect — the defaults, whose lists may well lack the item (round 2,
 * item 1). Two kinds. `attempt` is every write the list answers itself — a choice, an edit, an addition, the styles'
 * Restore, a deletion, an undo —: it resolves whether the write landed and never rejects, and a refusal puts up
 * `failed`, the line at the list's foot (O.saveFailed), until a write of the list's lands (round 3, item 3; a choice's
 * or an edit's refusal went unsaid until Codex 4). A deletion refused leaves its item stored: its row stays and its undo
 * row goes (the caller drops it). `save` is one its caller answers — a form's save, which says so in the form —: it
 * rejects unless the write landed, and leaves the line to the list's own refusals (Task 107)
 */
export function useListWrites<C>(patch: (fn: (latest: C) => C) => Promise<C>): ListWrites<C> {
  const [failed, setFailed] = useState(false)
  /** whether the write landed */
  const send = (fn: (latest: C) => C): Promise<boolean> => {
    let next: C | undefined
    // a change that changes nothing (an undo of what another tab put back) is written as a copy: `latest` itself is
    // what a refusal answers with, and the answer could not tell the two apart
    const write = patch(latest => {
      const made = fn(latest)
      next = made === latest ? { ...made } : made
      return next
    })
    return write.then(stored => next !== undefined && stored === next, () => false)
  }
  const attempt = (fn: (latest: C) => C): Promise<boolean> => send(fn).then(done => { setFailed(!done); return done })
  // a save that lands takes the line away too; one refused leaves it as it was
  const save = (fn: (latest: C) => C): Promise<void> => send(fn).then(done => { if (!done) throw new Error('the write did not land'); setFailed(false) })
  return { failed, attempt, save }
}

export interface ListWrites<C> {
  /** a write the list answers itself was refused, and no write of its has landed since */
  failed: boolean
  /** whether the write landed; never rejects, and a refusal puts `failed` up */
  attempt(fn: (latest: C) => C): Promise<boolean>
  /** resolves once the write landed; rejects when it did not */
  save(fn: (latest: C) => C): Promise<void>
}

/**
 * A row focused once it is drawn: a list's write that lands brings a row back (an undo) or in (a service added), and the
 * row is drawn by the commit that renders the stored value — which a frame asked for as the write lands may come before,
 * leaving the focus on the page (Part 7's final review: the services list at 60 Hz and more at 120; the styles' and the
 * prompts' lists the same, more narrowly). `focus(id)` marks the row, and the layout effect of the commit that renders
 * the mark focuses it, before that commit is painted. That commit draws the row, or an earlier one did: the store
 * publishes the value before the write resolves (shared/surface-config.ts). The mark lives for that one draw: a row it
 * does not find — gone again, never stored — is not waited for, or it would take the focus whenever it appeared later,
 * wherever the reader was by then (item 23b). The three lists share it
 */
export function useFocusWhenDrawn(find: (id: string) => HTMLElement | null | undefined): (id: string) => void {
  const [pending, setPending] = useState<string | null>(null)
  useLayoutEffect(() => {
    if (pending === null) return
    find(pending)?.focus()
    setPending(null)
  })
  return setPending
}

/**
 * Whether the focus is in the undo row standing for the item `id` (UndoRow's `data-undo`): a refused deletion takes
 * that row away, and the focus it held goes to the item's own row, drawn beside it while the write was on its way
 * (round 2, item 2)
 */
export const undoHasFocus = (id: string): boolean => document.activeElement?.closest('[data-undo]')?.getAttribute('data-undo') === id

/**
 * Whether the focus is nowhere, on the body: an undo storage refused brings its undo row back, and the row takes the
 * focus then — the pressed one had it, and nothing took it since (round 3, item 3)
 */
export const focusLost = (): boolean => document.activeElement === null || document.activeElement === document.body

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

/** A small segmented control's agreed width (settings-2), read by `.o-seg` */
export const segmentWidth = (px: number) => ({ '--w': `${px}px` }) as CSSProperties

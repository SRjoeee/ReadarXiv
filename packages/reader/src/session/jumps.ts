// The jump stack (link previews, the way back; PDF-READER §11.9 "Followed", "The way back"): every jump inside the paper (a link
// from any of the three link sources, a page typed in the pill, a contents entry) is one entry, and every way back goes back
// one: the capsule, the browser's Back (where the host gives history), and the reader scrolling back to the place it left,
// which spends the entry silently so that a later Back never lands somewhere already left. Pure: the places and the lights are
// the reader's to read and to show; history is the host's (L2), through the HostHistory it gives, and the stack is the
// reader's alone where it gives none.
//
// An entry holds where it lands and what it lights when it is arrived at going forward (`place`, `light`: the target as the
// jump found it), and, once a jump leaves it, where it was left and what to light coming back to it (`left`). The address is
// never touched: an entry's place lives in its state alone (the design's Q7), so a reload keeps it (the reader reads the
// current entry at open: `current()`), and a host that rewrites its address keeps the state beside its own.

/** the pane a place is read on */
export type PlaceSide = 'left' | 'right'
/** a reading place: the page at the reading line of the side read and how far down it (panes.reading()'s), and that side: the
 *  pane a jump moved, which a way back returns (the other with it where the sync is on) */
export interface Place {
  page: number
  at: number
  side: PlaceSide
}
/** PDF units, y up: x0 y0 x1 y1 */
export type Rect = [number, number, number, number]
/** what is lit on arriving at a place by a traversal: a sentence or unit (the highlight's Lit), a box of a page on A (a target,
 *  or a link left whose sentence is unknown; `side`: on that pane alone, a box only that pane draws there), or nothing (a page
 *  typed) */
export type Light = { lit: { id: number; s: number } } | { page: number; box: Rect; side?: PlaceSide } | null
/** the reader's part of a history entry (under `history.state.axt`) */
export interface Entry {
  v: 1
  /** how many jumps lead to it from the reader's first entry (0) */
  n: number
  /** where it lands and what it lights going forward onto it */
  place: Place
  light: Light
  /** where a jump left it from and what to light coming back to it; none while no jump has left it */
  left?: { place: Place; light: Light }
}
/** history as a host gives it (L2, Q7): the address is never touched; the host's own state is kept beside the reader's */
export interface HostHistory {
  /** the current entry's reader state written (replaceState with the host's state and the address kept) */
  mark(entry: Entry): void
  /** a new entry after the current one, the address unchanged */
  push(entry: Entry): void
  /** one entry back */
  back(): void
  /** each traversal onto an entry, told with the reader's state it holds (null: none of the reader's, or another `v`) */
  listen(f: (entry: Entry | null) => void): () => void
  /** the current entry's reader state, read at open (a reload keeps a depth to go back to) */
  current(): Entry | null
}
/** a traversal told: where to go and what to light; `silent`, a spend's own traversal (nothing moves, nothing lights) */
export interface Traversal {
  go: Place
  light: Light
  silent: boolean
}
export interface Jumps {
  /** how many jumps can be gone back now: the capsule stands while it is above 0 */
  readonly depth: number
  /** the place the current entry was arrived from by its jump, and its light: what scrolling back to spends it (null at 0) */
  readonly left: { place: Place; light: Light } | null
  jump(from: { place: Place; light: Light }, to: { place: Place; light: Light }): void
  /** the capsule's press: one jump back */
  back(): void
  /** the view moved by the reader; `seen`: the place last left is in view again (its light's box, else its place within a
   *  quarter of the view). A jump whose place left came back into view after being out of it is spent silently */
  scrolled(seen: boolean): void
  /** where to go and what to light, at each traversal; `silent`: a spend's own traversal (nothing moves, nothing lights) */
  on(f: (e: Traversal) => void): () => void
  /** told at each change of `depth` */
  onDepth(f: (depth: number) => void): () => void
  dispose(): void
}

/** whether a value is an entry of this version (a state of another version, or a host's, reads as none) */
export function entryOf(v: unknown): Entry | null {
  if (!v || typeof v !== 'object') return null
  const e = v as Partial<Entry>
  const placeOk = (p: unknown): p is Place =>
    !!p &&
    typeof p === 'object' &&
    Number.isInteger((p as Place).page) &&
    (p as Place).page >= 1 &&
    Number.isFinite((p as Place).at) &&
    ((p as Place).side === 'left' || (p as Place).side === 'right')
  if (e.v !== 1 || !Number.isInteger(e.n) || (e.n as number) < 0 || !placeOk(e.place)) return null
  if (e.left !== undefined && !placeOk(e.left?.place)) return null
  return e as Entry
}

export function createJumps(o: { history?: HostHistory }): Jumps {
  const h = o.history ?? null
  /** the entries this reader knows, by n: what each lands on and was left from (a reload knows the current one alone; the
   *  others come back with their traversals' states) */
  const stack = new Map<number, Entry>()
  const at0 = h?.current() ?? null
  let cur = at0 ? at0.n : 0
  if (at0) stack.set(at0.n, at0)
  /** the current entry's place left was out of view since it was arrived at (a scroll back into view spends it) */
  let away = false
  /** a spend's back asked, its traversal not yet told */
  let spending = false
  const listeners = new Set<(e: Traversal) => void>()
  const depthListeners = new Set<(d: number) => void>()
  let told = cur
  const tellDepth = () => {
    if (told === cur) return
    told = cur
    for (const f of [...depthListeners]) f(cur)
  }
  const tell = (e: Traversal) => {
    for (const f of [...listeners]) f(e)
  }
  /** a traversal onto entry `e` (the host's, or the reader's own stack's) */
  const arrive = (e: Entry | null) => {
    const silent = spending
    spending = false
    away = false
    // (none of the reader's: an entry it never marked; nothing of its own to go to)
    if (!e) {
      cur = 0
      tellDepth()
      return
    }
    const known = stack.get(e.n)
    // (the state the traversal brings is the entry's as the browser keeps it: the newest)
    stack.set(e.n, e)
    const was = cur
    cur = e.n
    tellDepth()
    if (e.n === was) return
    if (silent) {
      tell({ go: (e.left ?? known?.left ?? e).place, light: null, silent: true })
      return
    }
    if (e.n < was) {
      const left = e.left ?? known?.left
      tell({ go: left?.place ?? e.place, light: left ? left.light : e.light, silent: false })
    } else tell({ go: e.place, light: e.light, silent: false })
  }
  const off = h?.listen(arrive) ?? null
  return {
    get depth() {
      return cur
    },
    get left() {
      return cur > 0 ? (stack.get(cur - 1)?.left ?? null) : null
    },
    jump(from, to) {
      const here: Entry = { ...(stack.get(cur) ?? { v: 1, n: cur, place: from.place, light: null }), left: from }
      stack.set(cur, here)
      // (a jump from a place gone back to: the entries after it are the browser's no more)
      for (const n of [...stack.keys()]) if (n > cur) stack.delete(n)
      const next: Entry = { v: 1, n: cur + 1, place: to.place, light: to.light }
      stack.set(next.n, next)
      h?.mark(here)
      h?.push(next)
      cur = next.n
      away = false
      spending = false
      tellDepth()
    },
    back() {
      if (cur <= 0) return
      if (h) h.back()
      else arrive(stack.get(cur - 1) ?? null)
    },
    scrolled(seen) {
      if (cur <= 0 || spending) return
      if (!seen) away = true
      else if (away) {
        spending = true
        if (h) h.back()
        else arrive(stack.get(cur - 1) ?? null)
      }
    },
    on(f) {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    onDepth(f) {
      depthListeners.add(f)
      return () => depthListeners.delete(f)
    },
    dispose() {
      off?.()
      listeners.clear()
      depthListeners.clear()
    },
  }
}

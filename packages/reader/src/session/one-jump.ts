// One jump for every jump inside the paper (link previews' track A; the design's §3.7, L3; PDF-READER §11.9 "Followed"): a link
// from any of the three link sources (the left's PDF.js links, the right's on a page not laid, the right's laid links), Enter
// on one, a page typed in the pill, a contents entry. Each moves the pane it was made on (the other following where the sync
// is on: open item 6, today's rule), lands with the band (the highlight's `land`), and is one entry of the jump stack (the
// capsule, the browser's Back where the host gives history, a scroll back spending it). The pill's arrows and a scroll are no
// jump; a link out of the paper goes out through the host, as before; a destination that resolves to nothing does nothing.
//
// What lights: arriving by a link, the target the head states for its destination (Head.targets, the engine's on its own
// evidence; the lead's ruling of 2026-11-28: a rule of the reader's own lit the entry under the one cited, staging's page 2 of a
// numbered list), the unit it names where it names one (a reference, a note, a heading: lit whole on both panes, the right as
// drawn), its box else (a float, a display); a destination it states none for, nothing (the room above the point shows the
// place); a contents entry, its heading's first rectangle; a page typed, nothing. Coming back, the
// sentence under the link left where the highlight lights one there, else the link's own box, never a whole paragraph (open
// item 7). A link whose destination the head states (Head.targets, the previews' table) lights that target's own box instead.
import type { Rect, Jumps, Light, Place, PlaceSide } from './jumps.ts'

/** CSS px left above a target gone to, wide and narrow [start, P5 app.js:457] */
export const ROOM_WIDE = 72
export const ROOM_NARROW = 56

/** where a link left from: its pane, its page and its box on that pane's page (PDF units: a PDF.js link's rectangle, a laid
 *  link's Page.links box) */
export interface Origin {
  side: PlaceSide
  page: number
  box: Rect
}
/** what a jump reads and moves of the panes */
export interface JumpPanes {
  /** a destination inside the paper (a name, or an explicit one) resolved on the original: its page and its explicit form */
  resolve(dest: string | unknown[]): Promise<{ page: number; dest: unknown[] } | null>
  /** the pane jumped from to the destination (the other following where the sync is on), `room` CSS px above its point */
  goTo(t: { page: number; dest: unknown[] }, o: { side: PlaceSide; keyboard: boolean; room: number }): void
  goToPage(side: PlaceSide, n: number): void
  goToRect(r: [number, number, number, number, number]): void
  /** the reading place now (null before the panes are laid out) */
  reading(): Place | null
  /** a place read before gone back to, on its pane (the other following where the sync is on) */
  goToPlace(p: Place): void
  /** whether a place, or its light's box, is in view */
  inView(p: Place, light: Light): boolean
  focusPage(side: PlaceSide, n: number): boolean
}
/** what a jump lights */
export interface JumpLights {
  /** the sentence (or unit, `s` -1) under a point of a page (PDF units on that pane's page; `x` null: any column), or the first
   *  null where none */
  litAt(side: PlaceSide, page: number, x: number | null, y: number): { id: number; s: number } | null
  land(l: NonNullable<Light>): void
}
export interface OneJump {
  readonly depth: number
  /** a link inside the paper followed (`origin` null: where it was is not known) */
  link(o: { side: PlaceSide; dest: string | unknown[]; keyboard: boolean; origin: Origin | null }): Promise<void>
  /** a page typed in the pill */
  page(side: PlaceSide, n: number): void
  /** the place a contents entry is gone from, read at its press (before its page's part is read) */
  begin(): Place | null
  /** a contents entry gone to: its heading's first rectangle, else its page; `ord`, the heading's member where the head locates
   *  it (lit whole on both panes; else its rectangle on A) */
  heading(
    from: Place | null,
    r: [number, number, number, number, number] | null,
    page: number | null,
    ord?: number | null,
  ): void
  /** the view moved: a scroll back to the place left spends the entry */
  scrolled(): void
  /** the capsule's press */
  back(): void
  dispose(): void
}

export function createOneJump(d: {
  panes: () => JumpPanes | null
  lights: () => JumpLights | null
  jumps: Jumps
  narrow: () => boolean
  /** the box the head states a destination lands on (link previews: Head.targets), lit on arrival in place of the unit at its
   *  point; none where the head states none */
  target?: (dest: string | unknown[]) => { kind: string; page: number; ord: number; box: Rect } | null
}): OneJump {
  const { jumps } = d
  /** the light of a link left: the sentence under its centre where one is known, else its own box on its pane */
  const leftLight = (o: Origin | null): Light => {
    if (!o) return null
    const cx = (o.box[0] + o.box[2]) / 2,
      cy = (o.box[1] + o.box[3]) / 2
    const lit = d.lights()?.litAt(o.side, o.page, cx, cy) ?? null
    return lit && lit.s >= 0 ? { lit } : { page: o.page, box: o.box, side: o.side }
  }
  /** a move made as a jump: the place left read first, the move, the place arrived at; one entry; the landing */
  const run = (from: { place: Place | null; light: Light }, move: () => Light | undefined) => {
    const light = move()
    if (light === undefined) return
    const p = d.panes()
    const to = p?.reading() ?? null
    if (!from.place || !to) return
    jumps.jump({ place: from.place, light: from.light }, { place: to, light })
    if (light) d.lights()?.land(light)
  }
  const off = jumps.on((e) => {
    if (e.silent) return
    d.panes()?.goToPlace(e.go)
    if (e.light) d.lights()?.land(e.light)
  })
  return {
    get depth() {
      return jumps.depth
    },
    async link(o) {
      const p = d.panes()
      if (!p) return
      const at = await p.resolve(o.dest).catch(() => null)
      if (!at) return
      const q = d.panes()
      if (!q) return
      run({ place: q.reading(), light: leftLight(o.origin) }, () => {
        q.goTo(at, { side: o.side, keyboard: o.keyboard, room: d.narrow() ? ROOM_NARROW : ROOM_WIDE })
        if (o.keyboard && o.side === 'right') q.focusPage('right', at.page)
        // (the target the head states: the unit it names (a reference, a note, a heading), else its box; none stated, nothing)
        const t = d.target?.(o.dest) ?? null
        if (!t || t.page !== at.page) return null
        return t.kind === 'reference' || t.kind === 'footnote' || t.kind === 'heading'
          ? { lit: { id: t.ord, s: -1 } }
          : { page: t.page, box: t.box }
      })
    },
    page(side, n) {
      const p = d.panes()
      if (!p) return
      run({ place: p.reading(), light: null }, () => {
        p.goToPage(side, n)
        return null
      })
    },
    begin: () => d.panes()?.reading() ?? null,
    heading(from, r, page, ord = null) {
      const p = d.panes()
      if (!p || (!r && !page)) return
      run({ place: from, light: null }, () => {
        if (r) {
          p.goToRect(r)
          // (its member whole where the head locates it: the right draws the translation of it elsewhere than A's rectangle)
          return ord !== null ? { lit: { id: ord, s: -1 } } : { page: r[0], box: [r[1], r[2], r[3], r[4]] }
        }
        p.goToPage(from?.side ?? 'right', page as number)
        return null
      })
    },
    scrolled() {
      if (jumps.depth <= 0) return
      const left = jumps.left
      const p = d.panes()
      if (!left || !p) return
      jumps.scrolled(p.inView(left.place, left.light))
    },
    back: () => jumps.back(),
    dispose() {
      off()
    },
  }
}

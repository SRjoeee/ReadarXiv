// What the reader paints a page from: `Page`, as interfaces/page design-a §1.2 decides it (DECISION: "L4 (reader shell)
// consumes Page only"). The typesetter (packages/typeset, lane L3) makes it; until its `layPage` is exported, the reader states
// the shape here, word for word, and takes the call that makes one as a dependency (`Lay`), so that lane L3's `layPage`
// replaces the fixtures' stand-in behind the same call. When typeset exports these types, this file imports them.
import type { LinkBorder, Part, Row } from '@readarxiv/format'

export type Box = [x0: number, y0: number, x1: number, y1: number]
export type Ink = [page: number, x0: number, y0: number, x1: number, y1: number, base: number]
export type FaceId = string

export type Item =
  /** a run of one face: from x, its characters at `dx` (per character) where given, `rise` over the baseline where raised; one
   *  set along `dir` (a figure text the original sets turned: a unit vector, the page's y up) stands on its line's baseline from
   *  (x0, y) along it, `x` (and `dx`) its place along it from x0, a raise across it */
  | {
      s: string
      x: number
      face: FaceId
      size: number
      fill?: number
      skew?: 1
      dx?: number[]
      rise?: number
      dir?: [ux: number, uy: number]
    }
  /** a crop: src's ink, its base on the line's, scaled k; `s` its copy text, `piece` its element (or 'label', 'counter'); `cut`
   *  its edges cut from its element's ink between two glyphs (1 its left, 2 its right: a URL broken), drawn with no margin;
   *  `ink` its own ink, its piece's boxes on its line as the part states them (src's page's PDF units), which it is cut by */
  | { s: string; x: number; src: Ink; k: number; piece: string; cut?: 1 | 2 | 3; ink?: Box[] }

export type Why =
  | 'unlocated'
  | 'unwrapped'
  | 'page'
  | 'none'
  | 'left'
  | 'refused'
  | 'unavailable'
  | 'unconfigured'
  | 'aborted'
  | 'waiting'
  | 'unfit'
  | 'face'
  | 'cells'
  | 'size'
  | 'pages'
  | 'name'
  | 'bound'
  | 'kind'
  | 'error'

export interface Laid {
  ord: number
  page: number
  state: 'laid' | Why
  /** this member's groups turned off on this page: 1 text, 2 elements, 4 label */
  off: number
  fit?: { size: number; lead: number; track: number; borrowed?: number }
  /** laid lines on this page, baseline first (a turned line, its items' `dir`: from its origin (x0, y), x1 − x0 its length
   *  along it) */
  lines: [y: number, x0: number, x1: number, items: Item[]][]
  /** per sentence (one entry: the member lights whole), on A (left) and as drawn (right); `own`: its kept ink; `dir` a member
   *  set along a direction (a turned figure text): its boxes in its run's frame, [s0, t0, s1, t1] along `dir` and across it
   *  (the page's point s·(ux, uy) + t·(−uy, ux)), lit turned with its text */
  lit: { left: Box[][]; right: Box[][]; own: [piece: string, boxes: Box[]][]; dir?: [ux: number, uy: number] }
}

export interface Page {
  page: number
  /** non-empty: not committed; every member is 'waiting', nothing off */
  wait: { rows: string[]; faces: [FaceId, string][] }
  /** every member with ink on `page`, in ord order */
  members: Laid[]
  /** the page's links as drawn: moved with their pieces, else at A's boxes; `owner` the ord of the member that holds one;
   *  `border` its own annotation's on A (Link.border), none where it has none */
  links: [box: Box, to: { url: string } | { dest: string }, owner?: number, border?: LinkBorder][]
  /** every piece's ink the part states on the pages the page's crops are cut from (each element's, label's and counter's box):
   *  what a crop's antialiased edge leaves behind */
  inks?: Ink[]
}

/** the rows a lay reads: a row by unit id, and whether no other row will come; `kept`, a unit the paper keeps as it is, whose
 *  row never comes (none waited for) */
export interface Rows {
  get(id: string): Row | undefined
  readonly done: boolean
  kept?(id: string): boolean
}

/** the call that lays a page (the typesetter's layPage with its rules and metrics bound) */
export type Lay = (part: Part, rows: Rows) => Page

/** whether a page commits: nothing it waits for */
export const committed = (p: Page): boolean => p.wait.rows.length === 0 && p.wait.faces.length === 0

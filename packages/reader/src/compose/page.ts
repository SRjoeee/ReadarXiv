// What the reader paints a page from: `Page`, which the reader consumes alone. The typesetter (packages/typeset, its
// `layPage`) makes it and exports no type of it, so the reader states the shape here, word for word, and takes the call
// that makes one as a dependency (`Lay`): the typesetter's `layPage` and the fixtures' stand-in behind the same call.
import type { LinkBorder, Part, Row } from '@readarxiv/format'

export type Box = [x0: number, y0: number, x1: number, y1: number]
export type Ink = [page: number, x0: number, y0: number, x1: number, y1: number, base: number]
export type FaceId = string

export type Item =
  /** a run of one face, drawn at `size` in `face` (the face at 100 px with its size correction, as Metrics measures it: a face
   *  of correction 0.959 at size 10 is drawn at 9.59): from x, its characters at `dx` (per character) where given, else each
   *  advance the face's and `track`, `rise` over the baseline where raised; one set along `dir` (a figure text the original sets
   *  turned: a unit vector, the page's y up) stands on its line's baseline from (x0, y) along it, `x` (and `dx`) its place along
   *  it from x0, a raise across it */
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
      /** the tracking after each of its characters, PDF units (a run of one x laid with tracking: its characters' advances
       *  the face's and this) */
      track?: number
    }
  /** a crop: src's ink, its base on the line's, scaled k; `s` its copy text, `piece` its element (or 'label', 'counter'); `cut`
   *  its edges cut from its element's ink between two glyphs (1 its left, 2 its right: a URL broken), drawn with no margin;
   *  `ink` its own ink, its piece's boxes on its line as the part states them (src's page's PDF units), which it is cut by;
   *  `dir` a crop of a line laid in a frame (a unit TeX set turned, Part.frames): its line stands from its origin along it, as
   *  a run's, and its src and ink are stated in the frame (the page turned back by `dir`, docs/PDF-READER.md §18.113) */
  | {
      s: string
      x: number
      src: Ink
      k: number
      piece: string
      cut?: 1 | 2 | 3
      ink?: Box[]
      dir?: [ux: number, uy: number]
    }

type Why =
  | 'unlocated'
  | 'unwrapped'
  | 'page'
  | 'none'
  | 'kept'
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
   *  (the page's point s·(ux, uy) + t·(−uy, ux)), lit turned with its text; `band` a figure text: lit on its lines' band alone
   *  (no pad beside, no half leading over and under) */
  lit: {
    left: Box[][]
    right: Box[][]
    own: [piece: string, boxes: Box[]][]
    dir?: [ux: number, uy: number]
    band?: true
  }
  /** the union of everything it draws on this page as the painter draws it (each run's ink box, each crop's placed box), PDF
   *  units; none where it is not laid or draws nothing here: what a preview of the right pane cuts round it */
  extent?: Box
}

export interface Page {
  page: number
  /** non-empty: not committed; every member is 'waiting', nothing off */
  wait: { rows: string[]; faces: [FaceId, string][] }
  /** every member with ink on `page`, in ord order */
  members: Laid[]
  /** the page's links as drawn: moved with their pieces, else at A's boxes; `owner` the ord of the member that holds one;
   *  `border` its own annotation's on A (Link.border), none where it has none; `piece` the element of the owner that holds it
   *  on A (Link.owner[1]: an element's id, '' its text), present wherever `owner` is */
  links: [box: Box, to: { url: string } | { dest: string }, owner?: number, border?: LinkBorder, piece?: string][]
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

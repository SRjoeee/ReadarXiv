// The seam between the prepare's front half and its back half (design §4.3, stage 1a): what a marked compile yields, the
// INSTRUMENT. B (our marked compile) is never shown: it is read for who owns each glyph and box, and its ownership is carried
// onto arXiv's page by align and locate. Whatever makes it (today's front end through its adapter, the rebuilt source reader
// later) gives exactly this; the back half reads nothing else of the source, the marks or the compile.
import type { Piece } from '@readarxiv/format'
import type { Doc } from './doc.ts'
import type { TexState } from './marks/statements.ts'

/** what a unit's ink is, of the unit's: its text (what a translation replaces), an element's (a piece that travels with the
 *  text, or stays: a display), its label (the class's mark before it), a babel name's own word */
export const ROLE = Object.freeze({ none: 0, text: 1, element: 2, label: 4, name: 8 })
export type Role = (typeof ROLE)[keyof typeof ROLE]

/** one document's owners, page by page: for each glyph (or box) the unit that owns it (its index in `units`, -1 none), the
 *  role, and for an element's the piece's id in the unit's content (-1 none) */
export interface Owners {
  unit: Int32Array
  role: Uint8Array
  piece: Int32Array
}

export interface InstrumentUnit {
  /** unitId(kind, content) */
  id: string
  kind: string
  content: Piece[]
  depth?: number
  /** the paper keeps it as it is: never translated */
  kept?: true
  /** its ink stays whatever the translation (a kept block): in no group */
  fixed?: true
  /** an ink unit drawn with another unit's row: that unit's index */
  echo?: number
  /** a table's cell: its table, row and column, and the columns and rows it spans, whether it is a header's */
  cell?: { table: number; row: number; col: number; span?: number; rows?: number; head?: true }
  /** TeX's alignment of it where TeX stated it (its end mark's \leftskip, \rightskip, \parfillskip) */
  align?: 'j' | 'l' | 'c' | 'r'
  /** a babel name's key (a unit of kind `name`: its occurrences are owned with ROLE.name) */
  name?: string
  /** a figure text's set (the units the reader fits at one size), its direction where it is not along x */
  figure?: { set: number; dir?: [number, number] }
  /** why the instrument gives it no ink of its own, where it gives none (the marks could not delimit it on B) */
  why?: string
  /** what its source says of each element (by piece id), which the part states as the element's class, copy text, a symbol's
   *  drawing and a footnote's mark (format's El: `kind`, `unknown`, `copy`, `sym`, `mark`), so that no rule of the typesetter
   *  reads a source */
  classes?: [piece: string, PieceClass][]
}
/** an element's class as its source reads it (today's layer2.mjs phClass2, texToText2 and the symbol's drawing) */
export interface PieceClass {
  cls: string
  unknown?: true
  copy?: string
  sym?: [text: string, up?: true]
  mark?: true
  /** a text piece: TeX sets its characters as written (a code or URL mark, a plain-text source: today's textPieceOf) */
  literal?: true
}

export interface Instrument {
  /** B's pages as read (read.ts: the wrap's options), which `glyphs` and `boxes` index */
  ink: Doc
  units: InstrumentUnit[]
  glyphs: Owners[]
  boxes: Owners[]
  /** the owners of each page's turned glyphs (DocPage.turned), where any is owned */
  turned?: Owners[]
  /** where each element of a source unit begins (`end` false) and ends in B's stream: its unit, its piece id, its B page
   *  (1-based) and the count of that page's glyphs shown before the point (the marked compile's points around a
   *  placeholder), where the marked compile has them. A forced break's, which sets no ink, says which line TeX ended at it */
  places?: { unit: number; piece: string; page: number; glyph: number; end: boolean }[]
  /** TeX's statements of the paper: \lineskip and \lineskiplimit; and, per B page, the glyph counts at which TeX ended a
   *  paragraph (its `qe<n>` points: a paragraph ends before that glyph), where the marked compile has them */
  tex: {
    lineskip?: [number, number]
    paragraphEnds?: number[][]
    /** TeX's state where a unit (piece null) or a placeholder (its content id) opens: its font, \baselineskip and measure
     *  (marks/statements.ts STATE_TEX) */
    states?: { unit: number; piece: string | null; state: TexState }[]
    /** where TeX ended a sentence inside a unit (SENTENCE_TEX): the glyphs before the point on its page; the next sentence
     *  begins at the next glyph */
    sentences?: { unit: number; page: number; glyph: number }[]
    /** the colour TeX was in after a colour piece (\textcolor's, \color's), as the driver names it (\current@color) */
    colours?: { unit: number; piece: string | null; colour: string }[]
  }
  /** what made it: the compiler, the TeX tree, the engine of the front half (part of the prepare's identity) */
  made: { compiler: string; tree: string; front: string }
}

/** the empty owners of a page of n glyphs */
export const ownersOf = (n: number): Owners => ({
  unit: new Int32Array(n).fill(-1),
  role: new Uint8Array(n),
  piece: new Int32Array(n).fill(-1),
})

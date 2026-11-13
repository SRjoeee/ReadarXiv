// The seam between the prepare's front half and its back half (design §4.3, stage 1a): what a marked compile yields, the
// INSTRUMENT. B (our marked compile) is never shown: it is read for who owns each glyph and box, and its ownership is carried
// onto arXiv's page by align and locate. Today's front end makes it through its adapter (src/pdf-reader/engine/pipeline/
// instrument.mjs); the back half reads nothing else of the source, the marks or the compile.
import type { Piece, Style } from '@readarxiv/format'
import type { Doc } from './doc.ts'
import type { Recovered } from './read.ts'

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
  /** kept for its text set wholly in a face of one pitch, or a figure's word inside such a line (Rule 1, PDF-READER §18.22):
   *  the lab's dump and parity tell the units this rule keeps by it; the bundle does not carry it */
  pitch?: true
  /** a figure text's elements kept as the original's ink (figure-lines.ts, PDF-READER §18.26): a run of one pitch (`pitch`, F0),
   *  a formula (`formula`, F1) or a stretch its decoration holds (`decoration`), by piece id: the lab's dump and parity tell them
   *  by it; the bundle does not carry it */
  keptEls?: [string, 'pitch' | 'formula' | 'decoration'][]
  /** a figure's line no word of which stands outside its formulas, kept whole (F1, figure-lines.ts): the lab's dump and parity tell
   *  it by it; the bundle does not carry it */
  formula?: true
  /** a figure text drawn twice over itself, kept as the original (F3's double rule, figure-lines.ts doubledOf): the lab's dump and
   *  parity tell it by it (the differential's (q)); the bundle does not carry it */
  double?: true
  /** a figure text the engine cannot draw as it was set, a script or an accent set apart from its base, kept as the original
   *  (F3's `script`, figure-lines.ts setApart): the lab's dump and parity tell it by it; the bundle does not carry it */
  script?: true
  /** a figure text or a table cell held whole as the original for a decorated word (PDF-READER §18.61, the owner's ruling of
   *  2026-11-12): `token`, one that holds the word, a figure text a word of which a decoration holds (figure-lines.ts, its element
   *  `cite`) or a cell holding a piece TeX set beside a decoration of its own with a letter in its text (the probe's `decorated`,
   *  pipeline/instrument.mjs decoratedCellsOf); `label`, a figure text of the same label or printed line as such a text, by the
   *  paragraph reading's pairing (figure-lines.ts figureLinesOf). `fixed`, never `kept`: its text could be translated and is
   *  held for its drawing alone. The lab's dump and parity tell it by it; the bundle does not carry it */
  decorated?: 'token' | 'label'
  /** a kept block of e-mail addresses and their separators alone (today/ink-units.mjs addressesAlone): the lab's dump and parity
   *  tell such a block by it (the coordinator's ruling of 2026-11-10); the bundle does not carry it */
  address?: true
  /** a kept block of any other text no unit owns (today/ink-units.mjs keptUnitsOf, rule 10: a code listing, a URL alone, a page
   *  number, a bibliography not cut into entries): the lab's dump tells it by it; the bundle does not carry it */
  block?: true
  /** a line of an algorithm float's body, kept as the original as code is (the front end's `pseudocode`, pipeline/instrument.mjs
   *  unitFactsOf; the owner's ruling of 2026-11-08): the lab's dump tells it by it; the bundle does not carry it (`kept` alone) */
  pseudocode?: true
  /** a table's cell or a figure's text that holds no ordinary word, kept as written (R1, PDF-READER §18.72: language.ts): the lab's
   *  dump tells it by it; the bundle does not carry it (`kept` alone) */
  words?: true
  /** a table's cell or a figure's text whose words are the paper's own names, kept as written (R2, PDF-READER §18.72:
   *  language.ts paperNamesOf): the lab's dump tells it by it; the bundle does not carry it (`kept` alone) */
  names?: true
  /** a figure text the figure reading keeps whole as crowded (a formula it would tear, a translation with no room beside other
   *  ink: figure-lines.ts, today/figure-text.mjs) and for no reason of its own besides (`double`, `script`): the lab's dump tells
   *  it by it; the bundle does not carry it (`unwrapped`, as a wrap failure is) */
  crowded?: true
  /** where each group the instrument wrote as its content opened (pipeline/instrument.mjs passThroughOf: a group that carries
   *  nothing), as offsets in the unit's projection (text pieces' characters, each element or nested unit one): the facts pass
   *  counts a paragraph TeX opened at one (`opensLost`), which must be none; the bundle does not carry it */
  passed?: number[]
  /** an ink unit drawn with another unit's row: that unit's index */
  echo?: number
  /** a table's cell: its table, row and column, and the columns and rows it spans, whether it is a header's */
  cell?: { table: number; row: number; col: number; span?: number; rows?: number; head?: true }
  /** a caption's float type, LaTeX's \@captype where its \caption runs (its float environment's, \captionof's): the part's
   *  Label.float */
  float?: string
  /** the paper's title, a unit of its front matter (the front end's) */
  title?: true
  front?: true
  /** the author block a note is tied to by its source (latex-front.mjs tieNotes: written inside an author command's argument,
   *  or on its own where the paper's bindings attach it to an author): its toggle the block's (format's Unit.of) */
  of?: 'author'
  /** an author command's argument a macro of the paper's or its class's stores to set elsewhere (the front end's `held`: ICML's
   *  \icmlaffiliation, set in the footnote \printAffiliationsAndNotice sets): no mark of its own, its ink an ink unit's
   *  (today/ink-units.mjs's stored rule); the bundle does not carry it */
  stored?: true
  /** TeX's alignment of it where TeX stated it (its end mark's \leftskip, \rightskip, \parfillskip); a cell's, its own
   *  paragraph's, else the class LaTeX built its column's template from (marks/channels.ts readAlign) */
  align?: 'j' | 'l' | 'c' | 'r'
  /** a babel name's key (a unit of kind `name`: its occurrences are owned with ROLE.name) */
  name?: string
  /** a figure text's set (the units the reader fits at one size), its direction where it is not along x; and what today's figure
   *  reading tells of where a translation of it may stand (layout/figure-text.mjs, S.figures' FitFigure): its first glyph's origin
   *  along its run (`x`, `y`), its box's length along it, its anchor, its room before and after its box, the depth under its
   *  baseline of the nearest stroke under its text (absent: none) */
  figure?: {
    set: number
    dir?: [number, number]
    x?: number
    y?: number
    length?: number
    anchor?: 'start' | 'centre' | 'end'
    before?: number
    after?: number
    under?: number
    /** a container's edge over its baseline (figure-lines.ts: a closed shape round all of it), PDF units up from it */
    over?: number
    /** a paragraph of two lines or more (F3, figure-lines.ts): laid as a body paragraph is, no line's free line its room; the
     *  evidence its lines are joined by, `strong` (TeX's hyphen, a justified line) or `container` (a closed path holds them alone):
     *  the lab's dump reads it (`para`); the bundle does not carry it */
    para?: 'strong' | 'container'
  }
  /** why the instrument gives it no ink of its own, where it gives none (the marks could not delimit it on B) */
  why?: string
  /** what its source says of each element (by piece id), which the part states as the element's class, copy text, a symbol's
   *  drawing and a footnote's mark (format's El: `kind`, `unknown`, `copy`, `sym`, `mark`), so that no rule of the typesetter
   *  reads a source */
  classes?: [piece: string, PieceClass][]
  /** what its source says of each group (by its open piece's id), which the part states as the span's facts (format's
   *  SpanAt: `cmd`, `colour`, `to`, `style`) */
  spans?: [piece: string, SpanClass][]
}
/** what a group's source says: the command its open begins with (its name and star), the fill TeX set its run in, a link
 *  group's target where the source names it (linkTargetOf); and, where its command names no style the tables know, the face
 *  TeX set its text in, read off its glyphs on B where it is not the face around it (marks/faces.ts) */
export interface SpanClass {
  cmd?: string
  colour?: number
  to?: { url: string } | { dest: string }
  style?: Style
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
  /** it sets a URL as url.sty's \url does, whatever its own command: a control sequence \urldef defined as one earlier in the
   *  unit, which the piece sets (ACM's `\urldef\tempurl\url{…}` then `\showDOI{\tempurl}`); its copy text and break points
   *  are its glyphs', as a \url's are */
  url?: true
  // what the other rules read of its source (the reading's own reads of `src`: tokensOf2's glue, style commands and links,
  // U.breaks' forced breaks, U.rename's notes, U.elements' macros):
  /** its glue as TeX sets it (today's glueOf): a length in the font's em or in PDF units, and whether a line may break at it */
  glue?: [length: number, unit: 'em' | 'bp', brk?: 1]
  /** the command its source begins with (its name and star); `bare`: its source is that command alone (a declaration) */
  cmd?: string
  bare?: true
  /** a forced break (today's FORCED_BREAK) */
  brk?: true
  /** a citation's note: its last optional argument as today's renameRefs reads it */
  note?: string
  /** an earlier piece of the unit whose source is the same: its id (the source's identity, by which a macro is learnt) */
  same?: string
  /** the fill TeX set its run in (a colour piece's: the marked compile's log, today's readColours) */
  colour?: number
  /** a nested unit's mark (a footnote set inside the unit), not a placeholder */
  nested?: true
  /** a tie (the source's `~`, pipeline/instrument.mjs isTie): TeX's interword glue no line breaks at */
  tie?: true
  /** a text macro's text as TeX sets it (the marking's probe), where its glyphs are the unit's text, no ink of its own */
  text?: string
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
   *  placeholder), where the marked compile has them. A forced break's, which sets no ink, says which line TeX ended at it.
   *  A paper's macro at a unit's head ends at the unit's start point (its own opening point before it); one after the unit's
   *  last text begins at the unit's end point and ends at the point after the group it stands in, which bounds what TeX set
   *  there. Both places of a piece stated, no glyph of B between them: TeX set none for it */
  places?: { unit: number; piece: string; page: number; glyph: number; end: boolean }[]
  /** the pieces TeX said set no ink (the probe's answers, where the marking gives them no point), those the marking never marks,
   *  their rendering never ink by its own reading (a text macro of today's marks.mjs classOf null: a .bbl's \newblock; the
   *  adapter's inklessPieces), and those TeX's points prove set nothing of their own: a piece with no point of its own whose two
   *  nearest points around it in its unit's source order (a piece's, the unit's start and end, else the stream's) hold no glyph
   *  and no painted box between them, nor text of the unit's (the adapter's boundedEmpty): their span stated empty, by
   *  unit index and piece id */
  empty?: { unit: number; piece: string }[]
  /** the pieces TeX set before their unit's start point, the ownership giving the unit's text nothing before it (the marking
   *  passes over a unit's head): whatever they set is no text of the unit's and is never erased with it, by unit index and
   *  piece id (the adapter's outsidePieces) */
  outside?: { unit: number; piece: string }[]
  /** TeX's statements of the paper: \lineskip and \lineskiplimit; and, per B page, the glyph counts at which TeX ended a
   *  paragraph (its `qe<n>` points: a paragraph ends before that glyph), where the marked compile has them */
  tex: {
    lineskip?: [number, number]
    paragraphEnds?: number[][]
    /** per B page, its text frame as TeX shipped it (marks/channels.ts framesOf, LAYOUT_TEX's AXT-BODY at each body's
     *  bracket): the text block's left and right edge (\textwidth from where TeX shipped the page's body) and its columns',
     *  each \columnwidth at both edges of the block on a page TeX set in two columns, else the block; null where TeX stated
     *  none (no body bracketed and stated there, a two-column page whose columns TeX did not give the width of) */
    frames?: (TexFrame | null)[]
    /** each unit's \baselineskip and \parskip, natural, in PDF units, where its paragraph ends (marks/channels.ts readSkips,
     *  LINES_TEX's AXT-LINES): TeX's normal paragraph separation there; a unit TeX set no paragraph for states none */
    skips?: { unit: number; baselineskip: number; parskip: number }[]
  }
  /** what PDF.js recovered from inside its worker while B was read (read.ts readPdf), where it did */
  recovered?: Recovered
  /** what made it: the compiler, the TeX tree, the engine of the front half (part of the prepare's identity) */
  made: { compiler: string; tree: string; front: string }
}

/** a page's text frame as TeX set it, in PDF units on its page: the text block and its columns (one: the block itself); and
 *  its bottom where TeX states it (\textheight's foot as LaTeX's \@outputpage ships it: no line of a column's text stands
 *  under it) */
export interface TexFrame {
  block: [number, number]
  columns: [number, number][]
  foot?: number
}

/** the empty owners of a page of n glyphs */
export const ownersOf = (n: number): Owners => ({
  unit: new Int32Array(n).fill(-1),
  role: new Uint8Array(n),
  piece: new Int32Array(n).fill(-1),
})

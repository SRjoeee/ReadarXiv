// The bundle's objects, FORMAT 1 (interfaces/page/design-a.md §1.1, decided in interfaces/page/DECISION.md): one zod schema
// per kind, the types inferred from them. Coordinates are arXiv's page (the original PDF's user space), PDF units, y up, pages
// 1-based, written on a 1/100 grid by the prepare. An object's reader ignores a field it does not know (zod strips it), so a
// new optional field does not raise FORMAT; FORMAT rises only when an old reader would misread.
import { z } from 'zod'

export const FORMAT = 1 as const
const format = z.literal(FORMAT)
const num = z.number()
const int = z.number().int()
const page = z.number().int().min(1)
const flag = z.literal(1)

/** a unit's id: the content hash of its kind and pieces (ids.ts unitId; the baseline's FORMAT.md §2) */
export const Id = z.string().regex(/^[0-9a-f]{64}$/)
/** an object's digest: the lowercase hexadecimal SHA-256 of its bytes */
export const Digest = z.string().regex(/^[0-9a-f]{64}$/)
export const Box = z.tuple([num, num, num, num])
/** A's ink and its baseline: page, x0, y0, x1, y1, base */
export const Ink = z.tuple([page, num, num, num, num, num])

/** why a placement stays the original's whatever the rows: not located on A, its page or its group not wrapped, its page refused */
export const PrepWhy = z.enum(['unlocated', 'unwrapped', 'page'])

// ---------------------------------------------------------------- what a translator reads
/** a unit's kind: an open string, today's documented set (FORMAT.md §2): para heading caption footnote cell abstract theorem
 *  figure author affiliation reference; name (babel's names); inkheads inkcontents inknotes inkorphan inknames inkreferences
 *  (text our compile set that no source unit owns); inkfigures (text inside a figure); named (a unit's form with the author
 *  block's names it holds sent as elements, Part.paper.named: no member's) */
export const Kind = z.string().regex(/^[a-z][a-z-]{0,31}$/)
/** an element's kind, as the source reader typed it: an open string (math display cite ref eqref footnote macro url code
 *  number other, today's; break, symbol; person, a block name in a `named` unit, its `src` the name's text) */
export const ElKind = z.string().regex(/^[a-z][a-z-]{0,31}$/)
/** a span's style: an open string (bold italic mono sc link colour other …) */
export const SpanKind = z.string().regex(/^[a-z][a-z-]{0,31}$/)

export type Piece =
  | { t: 'text'; s: string }
  | {
      t: 'el'
      id: string
      kind: string
      src: string
      keys?: string[] | undefined
      stop?: string | undefined
      silent?: 1 | undefined
      after?: string | undefined
      name?: string | undefined
      nameLang?: string | undefined
    }
  | {
      t: 'span'
      id: string
      style: string
      must?: 1 | undefined
      stop?: string | undefined
      open?: string | undefined
      close?: string | undefined
      content: Piece[]
    }
  | { t: 'unit'; id: string; unit: string; pre: string; post: string }

/**
 * A piece of a unit, in the source's order. A piece's id is local to its unit (its place in it), so equal units are equal
 * piece for piece. `el`: an element that travels with the text (a formula, a citation, …), its TeX source `src` for
 * identity only (`stop`, `silent` and `after` not in the id: each is read from `src`, or `stop` from the unit's run-in labels around it). `span`: a group of the source (`open` and `close` its TeX source, for identity), styled (its command's style, or where the command names none the face TeX set its text in, read off its glyphs, named for what it changes; `stop` read off them too, not in the id); a group the unit's edge cuts
 * (a cell's \\ inside a \shortstack) has no `open` (it began before the unit) or no `close` (it ends after it). A figure text's
 * run of glyphs in another face than its own is a group of no source, neither end, its style what the face changes (`bold`,
 * `medium`, `italic`, `upright`, a role) and its face the part's (SpanAt.style). `unit`: a unit
 * nested in this one (a footnote set inside a paragraph), by its id, with the source around it (`pre`, `post`)
 */
export const Piece: z.ZodType<Piece> = z.lazy(() =>
  z.discriminatedUnion('t', [
    z.object({ t: z.literal('text'), s: z.string() }),
    z.object({
      t: z.literal('el'),
      id: z.string(),
      kind: ElKind,
      src: z.string(),
      keys: z.array(z.string()).optional(),
      // the punctuation the element sets at its own end that is its sentence's (a display's `x = y.`; today's displayStop),
      // or a line end where it ends its sentence and sets none (a forced break a run-in label follows: marks/run-ins.ts): a
      // translator may write it after the element so that the sentence ends there
      stop: z.string().optional(),
      // the element sets nothing where it stands: no character and no space (today's mt.mjs isInkless, TeX's tables: a
      // declaration of a font, a size, a colour or a paragraph's shape, a key written to a file, a penalty, `\noindent`, `\-`,
      // a table's row rule; never a space, a break, a fill or a skip), so no translator needs it: a wire may send it on no
      // wire and put it back at its group's front or end
      silent: flag.optional(),
      // TeX sets it after the unit's text, no word of its sentences (backref's list of the pages that cite a bibliography
      // entry: backref.sty's parscan reads the entry to its paragraph's end, sets it, then \BR@backref sets the list, its
      // \newblock's glue before it), and the white space that stands for that gap: no translator is given it, and it comes back
      // after the translation, this white space before it
      after: z.string().optional(),
      // a reference's: the full name the paper gives the type of the item it refers to, as its marked compile states it (the
      // label's type, its anchor's, else cleveref's; the first of cleveref's, hyperref's and LaTeX's names for that type that
      // is plain words and no abbreviation: "Figure", "Equation", hyperref's "section"). Not
      // in the unit's id: it is read from `src` and the paper's TeX. A translator is sent it for a word tied to the reference
      // that abbreviates it ("Fig."), packages/translate names.ts; the unit and its original keep the word
      name: z.string().optional(),
      // the BCP 47 tag of the language the paper's names are set up for (babel's tag of its main language: `en`, `pt-BR`);
      // `und` where babel declares one but knows no tag of it; absent where none is declared (no babel). A translator is sent
      // the name only where this is the language it translates
      // from, or none is declared
      nameLang: z.string().optional(),
    }),
    z.object({
      t: z.literal('span'),
      id: z.string(),
      style: SpanKind,
      must: flag.optional(),
      // the punctuation TeX sets at the group's end that its source does not write (a paper's macro's own `{\bf #1.}`, read off
      // its glyphs: marks/faces.ts): a translator may write it at the group's end so that the sentence ends there
      stop: z.string().optional(),
      open: z.string().optional(),
      close: z.string().optional(),
      content: z.array(Piece),
    }),
    z.object({ t: z.literal('unit'), id: z.string(), unit: Id, pre: z.string(), post: z.string() }),
  ]),
)

/** a unit, each distinct one once: `depth` a heading's level, `sentences` it is cut into sentences, `kept` the paper keeps it
 *  as it is (never translated), `of` the block its source ties it to where that is not its kind's (toggleKind) */
export const Unit = z.object({
  id: Id,
  kind: Kind,
  content: z.array(Piece),
  depth: int.optional(),
  sentences: z.literal(true).optional(),
  kept: z.literal(true).optional(),
  // the kind of the block the paper's source ties it to, whose reading option it follows: `author`, a note the source writes
  // inside an author command's argument or attaches to an author (a \thanks in \author{…}, acmart's \authornote), which the
  // names option shows translated or leaves the original's with the block (the owner's ruling of 2026-11-13). An open string,
  // so that a reader of before reads a new value as none; not in the id, which stays its kind's and pieces'
  of: Kind.optional(),
})
/**
 * The kind a unit's or a member's reading option is decided by: the block its source ties it to (`of`), else its own kind. The
 * one reading of it: the reader's classes, its composer and its counts, the typesetter's `leave` and every gate that lays a page
 * call this, so that a note of the author block is left or shown with the block wherever a kind decides it
 */
export const toggleKind = (x: { readonly kind: string; readonly of?: string | undefined }): string => x.of ?? x.kind
export const Units = z.object({ format, units: z.array(Unit) })

// ---------------------------------------------------------------- what laying a page reads
/** TeX's font state, the fill read from A: role, size, bold, slant (1 italic, 2 slanted), faked small capitals' size share
 *  (an element's: its own glyphs set some, its text El.text in TeX's case, each small capital its lowercase letter), set in
 *  small capitals (a placement's: most of its letters that can tell are faked small capitals, today's vote; a face of real small
 *  capitals is its design's), upper case, fill 0xRRGGBB (a placement's: its text's outside the groups whose fill is another,
 *  SpanAt.colour, where it has such groups), the design where it is not the paper's */
export const Style = z.object({
  role: z.enum(['serif', 'sans', 'mono']),
  size: num,
  bold: flag.optional(),
  slant: z.union([z.literal(1), z.literal(2)]).optional(),
  sc: num.optional(),
  caps: flag.optional(),
  upper: flag.optional(),
  fill: int.optional(),
  design: z.string().optional(),
})

/** a line on A: page, column, x0, x1 (its ink), baseline, top, bottom (its fonts' boxes), m0, m1 (TeX's measure for it),
 *  flags (1 KEPT: its ink stays; 2 PINNED: shares its baseline with ink that stays; 4 SHORTSKIP; 8 RTL: its characters run right
 *  to left, its unit's paragraph direction (UAX #9 P2-P3); unknown bits ignored), and
 *  its size (the median of its main glyphs' sizes, the glyphs within 0.85 of its largest where they set a quarter of its
 *  characters: today's line size, MAKE:382-401, by which the typesetter draws the line's band; absent: the member's size) */
export const Line = z.tuple([page, int, num, num, num, num, num, num, num, int, num.optional()])
export const LINE_FLAG = Object.freeze({ KEPT: 1, PINNED: 2, SHORTSKIP: 4, RTL: 8 })

/** an element on A. `kind` the class it is drawn by (today's placeholder class, layer2.mjs placeholdersOf's phClassProven,
 *  stated so that no rule of the typesetter reads a source: cite, num, display, other, symbol, macro, umacro, space, zero),
 *  `unknown` a paper's own macro no table renders, `copy` its source's plain text (a crop's copy text, its drawing from the
 *  source where no ink is found; a URL's, its glyphs' text on A where it has one, El.text), `sym` a symbol's drawn text and
 *  whether it is drawn raised where the source reads as a symbol (phClass2's: the tokens' class; a formula of symbols alone is
 *  `other` with a `sym`), `mark` a footnote's mark (drawn raised whatever its rendering), `literal` a text piece (TeX sets its
 *  characters as written: a code or URL mark; no formula). One of no ink (`ink` []) of a class drawn from its ink (cite, num,
 *  other, display, macro, umacro) states which of three it is: `text` '' TeX set nothing for it; `keep` TeX set it outside the
 *  unit's text (before its start), whatever it set never erased with the unit; neither, its ink was not found, and the
 *  typesetter leaves the unit the original's */
export const El = z.object({
  kind: ElKind,
  unknown: flag.optional(),
  copy: z.string().optional(),
  sym: z.union([z.tuple([z.string()]), z.tuple([z.string(), flag])]).optional(),
  mark: flag.optional(),
  literal: flag.optional(),
  ink: z.array(Ink),
  keep: flag.optional(),
  text: z.string().optional(),
  // its text in runs of one fill (0xRRGGBB, -1 none told), where its glyphs hold more than one: each space the fill before it
  fills: z.array(z.tuple([z.string(), int])).optional(),
  style: Style.optional(),
  brackets: z.tuple([Ink, Ink]).optional(),
  leads: flag.optional(),
  after: z.string().optional(),
  ends: z.tuple([int, num]).optional(),
  opens: int.optional(),
  name: z.string().optional(),
  // what the typesetter's other rules read of its source, stated (the instrument's: format's El and SpanAt carry them so that
  // the part is the page's whole problem and no rule reads a source): its glue (a length in the font's em or in PDF units,
  // a line may break at it), the command its source begins with (its name and star) and whether the source is that command
  // alone (a declaration), a forced break, a citation's note, an earlier piece of its unit with the same source (by id), the
  // fill TeX set its run in (a colour piece's), and a nested unit's mark
  glue: z.union([z.tuple([num, z.enum(['em', 'bp'])]), z.tuple([num, z.enum(['em', 'bp']), flag])]).optional(),
  cmd: z.string().optional(),
  bare: flag.optional(),
  brk: flag.optional(),
  note: z.string().optional(),
  same: z.string().optional(),
  colour: int.optional(),
  nested: flag.optional(),
  // a tie, the source's `~`: TeX's \nobreakspace, \penalty10000 and its interword glue, a space no line breaks at (the
  // typesetter keeps the words on its two sides on one line; a typesetter of before reads it as any space element, breakable)
  tie: flag.optional(),
  // where a URL TeX set on one line may break, as its url package lets it: after a run of \UrlBreaks' and \UrlBigBreaks'
  // characters, each the x between two of its glyphs on its ink's line and how much of its copy text stands before it, in UTF-16
  // code units (as the text holds them: a space between two glyphs, a ligature's letters, an astral character's two): the unit
  // the typesetter slices `copy` in
  breaks: z.array(z.tuple([num, int])).optional(),
  // a member's trail (its id `~`, no piece's): the ink TeX set right after its last glyph, glued to it on its row, that no unit
  // owns (a class's marks after a name and its separator, a \thanks mark), which travels with its text: drawn as its crop after
  // the translation's end. A typesetter of before reads it as an element no piece names, never drawn: its unit's group, and
  // nothing moves where the unit is the original's
  trail: flag.optional(),
  // a trail's distance from its member's last glyph, PDF units, where TeX set it past a word's gap (an author's mark of no letter
  // after `\hspace` or `\,`, a postal code after a space between two places: docs/PDF-READER.md §18.59), laid before its crop at
  // the member's scale; absent, glued to it. A typesetter of before reads none, and glues it
  sep: num.optional(),
  // its unit's end mark: ink TeX pushed to the end of the unit's last line, after its text (amsthm's `\qed`: `\hfill\quad`
  // and the box; a class's or an author's mark after `\hfill`), its box's right edge at that line's measure end. It belongs to
  // the end of the unit's text, wherever a translation ends: laid at the end of the translation's last line, keeping its
  // distance to the measure's end as TeX set it, on a line of its own where that line's text does not end the keep-off
  // distance before it (docs/PDF-READER.md §18.52). Left where TeX set it, a translation a line longer stood it beside a line
  // in the middle of the paragraph, one a line shorter left it alone under the text. Stated on the element of no piece the
  // prepare claims after the unit's end point (its id `~$`, `trail` too: a typesetter of before draws it glued after the
  // translation's end rather than erasing it unseen with the unit's elements). On a piece's element (the author's `\qed`
  // written in the text) the typesetter sets it so where the translation ends with it; no prepare states that yet (a fill in
  // its setting is no fact the part holds). A typesetter of before reads none, and lays as before
  end: flag.optional(),
})
/** where a link goes: an address, or a destination in the paper (PDF.js's dest as JSON: a named one `"name"`) */
export const LinkTo = z.union([z.object({ url: z.string() }), z.object({ dest: z.string() })])
/** a group of the source on A: its style (a figure text's run's, read off its glyphs; a source group's whose command names no
 *  style the rules know, the face TeX set its text in, read off its glyphs on B: what the typesetter draws its translation
 *  in), the paragraph TeX opened at it; the command its open begins with (its name and
 *  star), the fill TeX set its run in (a colour piece's, read off the marked compile's log; any other group's, read off its
 *  text's glyphs on A where it is not the fill around it: a link's that hyperref colours); a link group's target where its source names it, as Link.to states an annotation's (an
 *  \href's address, TeX's escapes undone, a \url's text, each in the WHATWG URL parser's form; a \hyperlink's destination by
 *  its name): what the typesetter pairs the group's translation with its annotations by */
export const SpanAt = z.object({
  style: Style.optional(),
  opens: int.optional(),
  cmd: z.string().optional(),
  colour: int.optional(),
  to: LinkTo.optional(),
})
/** a member's label: its kind, its ink (on its own baseline: a raised mark's raised), its style and parts; `line` the index of
 *  its member's text line it stands on, by an element's rule (the line whose band its ink meets, the nearest by baseline: El.ink's
 *  base), absent where it stands on none (a part made before states none); `float` a caption's float type, LaTeX's \@captype
 *  where its \caption runs (`figure`, `table`, `algorithm`, `subfigure`, …: its float environment's, \captionof's), absent
 *  where the source tells none; `align` where it stands on none of its member's lines (IEEEtran's "TABLE I" on a line of
 *  its own above its caption), how TeX set that line against its measure, read as any line's alignment is (l flush left, c
 *  centred, r flush right): its relabel is laid on that line, at its place, so; absent on a member's line (a part made before
 *  states none); `unheld` how many of its glyphs a named label's parts leave out (a bracket before its name, a note it holds
 *  whole, a bar after its number): no reader draws it anew, absent where its parts hold every one (a part made before states
 *  none) */
export const Label = z.object({
  kind: z.enum(['float', 'head', 'number', 'mark']),
  ink: Ink,
  style: Style,
  name: z.tuple([z.string(), Ink]).optional(),
  num: z.tuple([z.string(), Ink]).optional(),
  punct: z.tuple([z.string(), Ink]).optional(),
  line: int.optional(),
  float: z
    .string()
    .regex(/^[a-z][a-z0-9]{0,31}$/)
    .optional(),
  align: z.enum(['l', 'c', 'r']).optional(),
  unheld: int.positive().optional(),
})
/** the room about a placement: below its last line, to the next ink under it, beside its lines (a level figure text's: the free
 *  line along its run today's figure reading gives it; a turned one's room is its run's, Placed.run), a cell's clear band; `under`
 *  a figure text's depth under its baseline of the nearest stroke under its text (S.figures: a translation that reaches it is
 *  crowded). `runs`: the room under each run of its text lines (to its last line on a page or in a column, over a kept row of
 *  its own, over another's ink TeX set between two of its lines), each [that line's index, the depth under its baseline of the
 *  next ink across the run (from its lines' own start to their column's end: a glyph's baseline, a box's top), the depth under
 *  it of TeX's text block bottom in its column there (the foot of the box TeX shipped the column's text in)], stated where TeX
 *  states that foot; `sep` TeX's normal paragraph separation where its paragraph ends, \baselineskip and \parskip, natural:
 *  what a translation may borrow under a run, never past that bottom nor nearer the next ink than `sep` (the owner's ruling of
 *  2026-11-08). A part made before 2026-11-08 may state the room under each run otherwise (`ends`, which nothing reads) */
export const Room = z.object({
  below: num,
  next: num.optional(),
  side: z.tuple([num, num]).optional(),
  band: z.tuple([num, num]).optional(),
  // (the side of `band` no rule stands on, where one stands on the other: 1 under, 2 over. The band states the cell's line's own
  // bottom or top there, as a part made before does, which a typesetter of before reads as a rule)
  bandOpen: z.union([z.literal(1), z.literal(2)]).optional(),
  // (a table cell's sides of `side` that stop at a painted box, its column's rule or a neighbour's fill, not at a glyph: 1 the
  // left, 2 the right. A cell widened past its own ink keeps a quarter of its size off a wall and goes half way to a glyph,
  // today's paperTo; a part made before states none, every side a glyph's)
  wall: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  // (a table cell's column's box: the left and right edge of what TeX set in its column of its tabular, every entry's, its unit
  // cells' and the entries no unit is (a number, a formula alone), stated where they line up as the column's class sets them
  // (an l column's on its left edge, an r column's on its right, a c column's on its middle, two entries at least); a spanning
  // cell's the union of the columns it spans, each stated. Absent where that is not established: a p, m, b or X column, a cell
  // of a \parbox or of no LaTeX template, a column a \multicolumn widened, one whose entries do not line up, one of one entry. A
  // single-line cell is laid in it, in its column's alignment, at the largest size not over the original's that fits it (the
  // owner's decision, docs/PDF-READER.md §18.13); a typesetter of before reads none and lays it in its own room)
  column: z.tuple([num, num]).optional(),
  under: num.optional(),
  // (a figure text's container's edge over its baseline, PDF units up from it: a closed shape round all of its glyphs, inside
  // which its translation is laid (the owner's reformulation of 2026-11-10); S.figures keeps a translation's band under it as it
  // keeps its depth over `under`. A typesetter of before reads none and lays the band as before)
  over: num.optional(),
  runs: z.array(z.tuple([int, num, num])).optional(),
  sep: num.optional(),
  // (the ink that stays beside its text lines: ink no member owns (a glyph no unit claims, a rule or an image no member's) on a
  // line's band within its text block, wholly before the line's start or after its end, each side's pieces as one box: [that
  // line's index, x0, y0, x1, y1]. TeX set it on the line and no translation replaces it: a translation's line laid over it,
  // borrowed or not, keeps off it. A unit's end mark (El.end: amsthm's QED box TeX pushed to its last line's end) is the
  // unit's, claimed and stated as its element, no stay; a part made before states it here)
  stays: z.array(z.tuple([int, num, num, num, num])).optional(),
})
/** a generated word (a babel name's key, Rules.words), its counter where it leads one */
export const Word = z.object({
  name: z.string(),
  counter: z.tuple([z.string(), Ink]).optional(),
  caps: flag.optional(),
})

/** one placement on A: a unit's, a babel name's, a figure text's (design-a §1.1) */
export const Placed = z.object({
  ord: int.min(0),
  kind: Kind,
  // its unit's Unit.of: what the lay's reading options read with its kind (toggleKind)
  of: Kind.optional(),
  text: z.union([Id, Word]),
  why: PrepWhy.optional(),
  join: z.union([z.tuple([num]), z.tuple([num, flag])]).optional(),
  bound: flag.optional(),
  // the pitch TeX set its lines at: its paragraph's \baselineskip where the marked compile states it (LINES_TEX's AXT-LINES as
  // the paragraph ends), which TeX's \lineskip rule widens under a line too tall for it and never narrows; else, 'lead' in
  // `read`, the pitch of its lines on A (their gaps' median, a gap that rule opened among them) or 1.2 of its size
  lead: num,
  style: Style,
  align: z.enum(['j', 'l', 'c', 'r']),
  lines: z.array(Line),
  els: z.array(z.tuple([z.string(), El])).optional(),
  spans: z.array(z.tuple([z.string(), SpanAt])).optional(),
  label: Label.optional(),
  tail: z.array(z.tuple([z.string(), Style])).optional(),
  room: Room,
  // where on A a sentence of its may begin: each word and each element of its source projection (an element at its ink's first
  // box, but a display and an element TeX set outside the unit's text; the text a row's `sentences.src` counts in:
  // text pieces joined, each element and nested unit one character, a group's edges none), in order, as [its offset there, the
  // index in `lines` of the line its first glyph stands on, that glyph's x0]; a word whose letters are not the page's in order
  // [offset, -1, 0]. Stated for a unit lit by sentence (Unit.sentences); a row's start is found at its sentence's first word
  // placed, its second or third where the first is not (docs/PDF-READER.md §17.2). Every word, not the shared cutter's starts:
  // 82 % of Microsoft's starts are among those (40,409 over the corpus's stored rows, 2026-11-08), under design-a's 90 %
  words: z.array(z.tuple([int, int, num])).optional(),
  fixed: int.optional(),
  // its own text, where a rule tells a translation by it: a babel name's on A, a figure text's and a table cell's as its source
  // writes them (its text pieces, an element a space): a translation that says nothing else came back as it went
  plain: z.string().optional(),
  // a figure text's direction where it is not along x (the page's y up), and, where it is so turned, its run: its first glyph's
  // origin, its box's length along `dir` and its room before and after its box along it (its lines are its box on the page,
  // which tells none of them). A field of its own, the fields a typesetter of before reads keeping their meaning: that one
  // leaves a turned figure text the original's or reads it as it did, and FORMAT stays (design-a §1.6, "a changed meaning")
  dir: z.tuple([num, num]).optional(),
  run: z.tuple([num, num, num, num, num]).optional(),
  // the paper's title, a unit of its front matter (the source's: what a section heading's rules leave aside)
  title: flag.optional(),
  front: flag.optional(),
  // a table cell's place in TeX's grid, as the source's tabular sets it: its row, its first column, the columns it spans
  // (\multicolumn), and 1 where it is a header's (the rows above the table's first full rule), else 0. The cells of one table
  // are its `cells` tie's; what a reader decides of them together (a header, a column) is read from these
  cell: z.tuple([int, int, int, z.union([z.literal(0), z.literal(1)])]).optional(),
  // the facts it carries as read on A by today's reader's rule, not stated by TeX (stage 1b states them): 'style' (TeX's font
  // state), 'lead' (\baselineskip), 'measure' (the lines' m0..m1), 'align' (where TeX did not tell), 'shortskip' (the flags), 'breaks' (a break's line read by its short end)
  read: z.array(z.string()).optional(),
})
export const Tie = z.discriminatedUnion('rule', [
  z.object({
    rule: z.literal('cells'),
    cells: z.array(z.array(int)),
    head: flag.optional(),
    spanning: z.array(int).optional(),
  }),
  z.object({ rule: z.literal('size'), ords: z.array(int) }),
])
/** a link annotation's border as PDF.js draws it on A (its annotation layer, the original's pane): its width (its /BS /W, else
 *  its /Border's third number, as PDF.js reads them: CSS px as it draws it), its colour 0xRRGGBB (its /C, PDF.js's borderColor),
 *  its style where it is not solid (/S /D or a /Border dash array, dashed; /S /U, underline; beveled and inset drawn solid, as
 *  today's reader draws them). Stated where the width is above 0 and the colour is one: an annotation with none draws none */
export const LinkBorder = z.union([z.tuple([num, int]), z.tuple([num, int, z.enum(['dashed', 'underline'])])])
/** one of A's link annotations: its rectangle, where it goes, the member and the piece that hold it (an element's id, '' its
 *  text), the characters of the glyphs under it (their glyph points', PDF.js's rule, in their order, white space aside: what
 *  today's link match finds among the characters a piece is drawn as; absent where it holds none), whether those of its text's
 *  are its label's (more than half of its glyphs: the label's group, which stays on where the label is not drawn anew), whether
 *  its owner's annotations of its target on its page hold, together, every glyph of its owner's text and elements there (by
 *  glyph point: a link round the member's whole text, a contents entry's), and its page where it is not the part's (an
 *  annotation of a member of the page on another of its pages, which a translation may draw on this one), and its border on A
 *  where it has one (LinkBorder: what the typesetter carries onto each link it draws of it, moved or not) */
export const Link = z.object({
  box: Box,
  to: LinkTo,
  owner: z.tuple([int, z.string()]).optional(),
  text: z.string().optional(),
  label: flag.optional(),
  whole: flag.optional(),
  page: page.optional(),
  border: LinkBorder.optional(),
})
/** the paper's fonts as A names them (base names, subset tag off), with the glyphs of located units set in each, most first:
 *  what the reader picks its served faces by (typeset-inputs A3, A4) */
export const Faces = z.object({ fonts: z.array(z.tuple([z.string(), int])) })
/** how a unit's row is cut into its stretches (docs/PDF-READER.md §19.15): `cuts` the ids of its pieces that set something (an
 *  element no tie, no glue, no forced break and not silent sets nothing of; a nested unit's mark), in order, each stretch the
 *  text before, between and after them; `spaces` the ids of its ties (an element that reads as a space); every other element of
 *  it reads as nothing; `lettered` the stretches that hold a letter in its source. A row is cut exactly where each cut comes
 *  back once, in order, no other element of the unit stands where it would end a stretch, and its stretches hold a letter
 *  exactly where the source's do (a translator that moved an element across a name has none) */
export const Split = z.tuple([Id, z.array(z.string()), z.array(z.string()), z.array(int)])
/** a person of the author block that the page's text names elsewhere: the block's unit whose row is the name's translation, its
 *  member kind there (the names toggle's: the name is drawn so where that kind is shown) and its stretch that is the name */
export const Person = z.tuple([Id, Kind, int])
/** a unit of the page that names a person of the block elsewhere (§19.15): the unit, the unit that is its form with the names
 *  sent as elements (kind `named`; '' none: each name is a whole stretch of the unit, resolved in its own row), and each name:
 *  in a variant, the element's id there, its person (an index into `persons`), its text's length in the unit's source
 *  projection and the element's offset in the variant's (Row.sentences.src counts in them: text pieces joined, each element one
 *  character, a group's edges none); else the unit's stretch (an index into its split's) and its person */
export const Named = z.tuple([
  Id,
  z.union([Id, z.literal('')]),
  z.array(z.union([z.tuple([z.string(), int, int, int]), z.tuple([int, int])])),
])
export const Part = z.object({
  format,
  page,
  paper: z.object({
    faces: Faces,
    lineskip: z.tuple([num, num]).optional(),
    names: z.array(z.tuple([z.string(), Id])).optional(),
    // (one person, one translation per paper: the owner's ruling of 2026-11-10, docs/PDF-READER.md §19.15. Where the names
    // toggle shows the block, a block name the page's text holds elsewhere is drawn with the block's translation of it)
    named: z.array(Named).optional(),
    persons: z.array(Person).optional(),
    splits: z.array(Split).optional(),
  }),
  flows: z.array(z.array(Placed)),
  ties: z.array(Tie).optional(),
  links: z.array(Link).optional(),
})

// ---------------------------------------------------------------- what opens a paper
/** the original (A): its length, its digest, and the digest of each CHUNK bytes of it, so that a reader checks every range
 *  it reads (interfaces/host/DECISION.md): `chunks` the base64url of the first 16 bytes of each chunk's SHA-256, joined */
export const ORIGINAL_CHUNK = 65536
export const Original = z.object({
  bytes: int.min(0),
  sha256: Digest,
  chunk: z.literal(ORIGINAL_CHUNK),
  chunks: z.string().regex(/^[A-Za-z0-9_-]*$/),
})
export const Head = z.object({
  format,
  paper: z.object({ id: z.string(), version: int.min(1), pages: int.min(1) }),
  made: z.string(),
  original: Original,
  addOn: z.object({ digest: Digest, bytes: int.min(0) }).nullable(),
  units: z.array(Digest),
  parts: z.array(Digest.nullable()),
  refused: z.array(z.tuple([page, PrepWhy])).optional(),
  outline: z.array(z.tuple([int, page, Id])).optional(),
  // what PDF.js recovered from inside its worker while the prepare read our final pass (B) and arXiv's PDF (A), each
  // [document, site, count, its first reason] (the engine's warnings.ts RECOVER_SITES): the page or the font read as PDF.js
  // answered it. None where nothing was (the corpus's every paper)
  recovered: z.array(z.tuple([z.enum(['A', 'B']), z.string().max(32), int.min(1), z.string().max(200)])).optional(),
})

// ---------------------------------------------------------------- a translation (packages/translate's Result, by unit id)
export type OutPiece =
  | { t: 'text'; s: string }
  | { t: 'el'; id: string }
  | { t: 'span'; id: string; content: OutPiece[] }
export const OutPiece: z.ZodType<OutPiece> = z.lazy(() =>
  z.discriminatedUnion('t', [
    z.object({ t: z.literal('text'), s: z.string() }),
    z.object({ t: z.literal('el'), id: z.string() }),
    z.object({ t: z.literal('span'), id: z.string(), content: z.array(OutPiece) }),
  ]),
)
export const Why = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('refused') }),
  z.object({ kind: z.literal('unavailable'), retryAfterMs: num.optional() }),
  z.object({ kind: z.literal('unconfigured'), code: z.string() }),
  z.object({ kind: z.literal('aborted') }),
])
export const Row = z.discriminatedUnion('ok', [
  z.object({
    id: Id,
    ok: z.literal(true),
    content: z.array(OutPiece),
    by: z.string(),
    sentences: z.object({ src: z.array(int), tr: z.array(int) }).optional(),
  }),
  z.object({ id: Id, ok: z.literal(false), why: Why }),
])

/** a paper's rows for one target, as the server stores and serves them (the Worker's rows file, the extension's store): each a
 *  translate package's Result, by unit id, in the units' reading order (the head's Units, first occurrence), each id once */
export const Rows = z
  .object({ format, rows: z.array(Row) })
  .refine((x) => new Set(x.rows.map((r) => r.id)).size === x.rows.length, { message: 'a unit id twice' })

export type Id = z.infer<typeof Id>
export type Box = z.infer<typeof Box>
export type Ink = z.infer<typeof Ink>
export type PrepWhy = z.infer<typeof PrepWhy>
export type Unit = z.infer<typeof Unit>
export type Units = z.infer<typeof Units>
export type Style = z.infer<typeof Style>
export type Line = z.infer<typeof Line>
export type El = z.infer<typeof El>
export type SpanAt = z.infer<typeof SpanAt>
export type Label = z.infer<typeof Label>
export type Room = z.infer<typeof Room>
export type Word = z.infer<typeof Word>
export type Placed = z.infer<typeof Placed>
export type Tie = z.infer<typeof Tie>
export type Link = z.infer<typeof Link>
export type LinkTo = z.infer<typeof LinkTo>
export type LinkBorder = z.infer<typeof LinkBorder>
export type Faces = z.infer<typeof Faces>
export type Split = z.infer<typeof Split>
export type Person = z.infer<typeof Person>
export type Named = z.infer<typeof Named>
export type Part = z.infer<typeof Part>
export type Original = z.infer<typeof Original>
export type Head = z.infer<typeof Head>
export type Why = z.infer<typeof Why>
/** what a reader is told of a unit that got no translation, by the kind its words are keyed on (packages/ui
 *  ProviderErrorKind, which holds these): a reply no translator gave back whole is an invalid response; a translator out of
 *  reach is the network, or a rate limit where it named a wait; a translator not set up is told by its code (the translate
 *  package's UnconfiguredCode), the key's where the endpoint refused it, a bad request where no model or no translator serves
 *  the target, else the missing key's, which the settings mend; an abort as it is. The one reading of `Why` for every host */
export type WhyKind = 'invalid-response' | 'rate-limit' | 'network' | 'no-key' | 'auth' | 'bad-request' | 'aborted'
export function kindOfWhy(why: Why): WhyKind {
  switch (why.kind) {
    case 'refused':
      return 'invalid-response'
    case 'unavailable':
      return why.retryAfterMs ? 'rate-limit' : 'network'
    case 'aborted':
      return 'aborted'
    case 'unconfigured':
      if (why.code === 'key-refused') return 'auth'
      if (why.code === 'no-model' || why.code === 'no-language') return 'bad-request'
      return 'no-key'
  }
}
export type Row = z.infer<typeof Row>
export type Rows = z.infer<typeof Rows>

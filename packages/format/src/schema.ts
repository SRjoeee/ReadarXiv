// The bundle's objects, FORMAT 1: one zod schema
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

/** a unit's id: the content hash of its kind and pieces (ids.ts unitId) */
export const Id = z.string().regex(/^[0-9a-f]{64}$/)
/** an object's digest: the lowercase hexadecimal SHA-256 of its bytes */
export const Digest = z.string().regex(/^[0-9a-f]{64}$/)
export const Box = z.tuple([num, num, num, num])
/** A's ink and its baseline: page, x0, y0, x1, y1, base */
export const Ink = z.tuple([page, num, num, num, num, num])

/** why a placement stays the original's whatever the rows: not located on A, its page or its group not wrapped, its page refused */
export const PrepWhy = z.enum(['unlocated', 'unwrapped', 'page'])

// ---------------------------------------------------------------- what a translator reads
/** a unit's kind: an open string, of this set: para heading caption footnote cell abstract theorem
 *  figure author affiliation reference; name (babel's names); inkheads inkcontents inknotes inkorphan inknames inkreferences
 *  (text our compile set that no source unit owns); inkfigures (text inside a figure); named (a unit's form with the author
 *  block's names it holds sent as elements, Part.paper.named: no member's) */
export const Kind = z.string().regex(/^[a-z][a-z-]{0,31}$/)
/** an element's kind, as the source reader typed it: an open string (math display cite ref eqref footnote macro url code
 *  number other; break, symbol; person, a block name in a `named` unit, its `src` the name's text) */
export const ElKind = z.string().regex(/^[a-z][a-z-]{0,31}$/)
/** a span's style: an open string (bold italic mono sc link colour other …) */
export const SpanKind = z.string().regex(/^[a-z][a-z-]{0,31}$/)

// The values the engine makes of each open string above, named: Kind, ElKind and SpanKind stay open (a reader takes a
// value it does not know: a part made by an engine before or after this one may hold another), and a list of the code that
// reads some of them is declared of these (`satisfies`), so that TypeScript holds every member to a value the code makes.
/** the unit kinds the engine makes (Kind): the source reader's (source/latex-front.ts: para, heading, caption, footnote, cell,
 *  abstract, theorem, figure, author, affiliation, reference), the ink units' (locate/ink-units.ts INK_KIND, locate/ink.ts's
 *  inkfigures), a babel name's (instrument/units.ts NAME_KIND) and the author block's named form (bundle/names.ts NAMED_KIND) */
export type KnownKind =
  | 'para'
  | 'heading'
  | 'caption'
  | 'footnote'
  | 'cell'
  | 'abstract'
  | 'theorem'
  | 'figure'
  | 'author'
  | 'affiliation'
  | 'reference'
  | 'inkheads'
  | 'inkcontents'
  | 'inknotes'
  | 'inkorphan'
  | 'inknames'
  | 'inkreferences'
  | 'inkfigures'
  | 'name'
  | 'named'
/** the element kinds the engine makes (ElKind, a unit's piece): instrument/instrument.ts elementKindOf's (a tie `space`, a
 *  forced break `break`, marks/marks.ts MARK_CLASSES', `other`), a figure text's (locate/figure-lines.ts: code, math, cite, ref,
 *  symbol), a block name's (bundle/names.ts PERSON_KIND), and a nested unit's mark as locate/geometry.ts reads it (`note-mark`) */
export type KnownElKind =
  | 'space'
  | 'break'
  | 'math'
  | 'display'
  | 'cite'
  | 'ref'
  | 'eqref'
  | 'code'
  | 'url'
  | 'footnote'
  | 'macro'
  | 'number'
  | 'other'
  | 'symbol'
  | 'person'
  | 'note-mark'
/** the classes the engine draws an element by (El.kind on A, ElKind: instrument/layer1.ts phClass's and instrument/instrument.ts
 *  phClass2's: a paper's own text macro `umacro`) */
export type KnownElClass = 'cite' | 'num' | 'display' | 'other' | 'symbol' | 'macro' | 'umacro' | 'space' | 'zero'
/** a face's change as the engine reads it of a paper's macro or a figure text's run (locate/facts.ts changeOf): its role, its
 *  weight and its slant where each differs from the face around it, joined by `-` */
type FaceRole = 'serif' | 'sans' | 'mono'
type FaceWeight = 'bold' | 'medium'
type FaceSlant = 'italic' | 'upright'
type FaceChange =
  | FaceRole
  | FaceWeight
  | FaceSlant
  | `${FaceRole}-${FaceWeight}`
  | `${FaceRole}-${FaceSlant}`
  | `${FaceWeight}-${FaceSlant}`
  | `${FaceRole}-${FaceWeight}-${FaceSlant}`
/** the span styles the engine makes (SpanKind): a group's command's (instrument/instrument.ts SPAN_STYLES, locate/ink.ts
 *  groupStyleOf: bold, italic, mono, sc, link, colour, underline; `other` for any other group) and a figure text's run's face
 *  change (locate/ink.ts, `colour` where none) */
export type KnownSpanKind = 'bold' | 'italic' | 'mono' | 'sc' | 'link' | 'colour' | 'underline' | 'other' | FaceChange

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
      newblock?: 1 | undefined
      after?: string | undefined
      name?: string | undefined
      nameLang?: string | undefined
      text?: string | undefined
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
 * identity only (`stop`, `silent`, `newblock`, `after` and `text` not in the id: each is read from `src`, from the unit's run-in labels around it, from the compile or from arXiv's page). `span`: a group of the source (`open` and `close` its TeX source, for identity), styled (its command's style, or where the command names none the face TeX set its text in, read off its glyphs, named for what it changes; `stop` read off them too, not in the id); a group the unit's edge cuts
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
      // the punctuation the element sets at its own end that is its sentence's (a display's `x = y.`): a translator may write
      // it after the element so that the sentence ends there; or a line end where it ends its sentence and sets none (a forced
      // break a run-in label follows: marks/run-ins.ts): the sentence ends before the break, which the translator is sent as
      // the next sentence's first thing
      stop: z.string().optional(),
      // the element sets nothing where it stands: no character and no space. By TeX's tables alone (instrument/mt.ts isInkless:
      // a declaration of a font, a size, a colour or a paragraph's shape, a key written to a file, a penalty, `\noindent`, `\-`,
      // a table's row rule); never a space, a tie, a forced break, glue, `\newblock`, TeX's alignment tab, nor an element that
      // stands for content set elsewhere (a display, a formula, a note, a citation). A paper's own command is never stated so: no
      // reading of TeX's has yet stated what it sets where it stands (PDF-READER §18.79). No translator needs such an element, so
      // a wire may send it on no wire and put it back at its group's front or end
      silent: flag.optional(),
      // LaTeX's `\newblock`, where a new block of a bibliography entry begins (BibTeX's styles write it between an entry's
      // authors, title and venue); a skip by its classes' definitions, never `silent`: an entry's parts are its blocks
      // (Unit.entry)
      newblock: flag.optional(),
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
      // a command's element (kind `macro`): the text TeX set for it where it stands, on its line's baseline at its text's size,
      // as arXiv's page shows it at every placement of its unit (`\hl{guitar}`'s "guitar", `\k{a}`'s "ą"); absent where TeX
      // raised or lowered it, set it at another size, or set nothing (a footnote's mark, `\textsuperscript{1}`, an empty
      // macro), and for an element of any other kind (a formula, a number, a reference). Not in the id: read on
      // arXiv's page. Letters glued to it that make one word with this text (UAX #29) are that word's, never a word of
      // their own (packages/translate words.ts)
      text: z.string().optional(),
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
 *  as it is (never translated), `entry` a bibliography entry, `of` the block its source ties it to where that is not its kind's
 *  (toggleKind) */
export const Unit = z.object({
  id: Id,
  kind: Kind,
  content: z.array(Piece),
  depth: int.optional(),
  sentences: z.literal(true).optional(),
  kept: z.literal(true).optional(),
  // the unit is a bibliography's entry (the source reader's `\bibitem`; its form with the author block's names, kind `named`,
  // states it too): its parts are its blocks, each begun by a `newblock` element, one part where it states none. Not in the id
  entry: z.literal(true).optional(),
  // the kind of the block the paper's source ties it to, whose reading option it follows: `author`, a note the source writes
  // inside an author command's argument or attaches to an author (a \thanks in \author{…}, acmart's \authornote), which the
  // names option shows translated or leaves the original's with the block (docs/PDF-READER.md §18.71). An open string,
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
 *  small capitals (a placement's: most of its letters that can tell are faked small capitals; a face of real small
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
 *  characters), by which the typesetter draws the line's band; absent: the member's size */
export const Line = z.tuple([page, int, num, num, num, num, num, num, num, int, num.optional()])
export const LINE_FLAG = Object.freeze({ KEPT: 1, PINNED: 2, SHORTSKIP: 4, RTL: 8 })

/** an element on A. `kind` the class it is drawn by (stated so that no rule of the typesetter reads a source: cite, num,
 *  display, other, symbol, macro, umacro, space, zero),
 *  `unknown` a paper's own macro no table renders, `copy` its source's plain text (a crop's copy text, its drawing from the
 *  source where no ink is found; a URL's, its glyphs' text on A where it has one, El.text), `sym` a symbol's drawn text and
 *  whether it is drawn raised where the source reads as a symbol (phClass2's: the tokens' class; a formula of symbols alone is
 *  `other` with a `sym`), `mark` a footnote's mark (drawn raised whatever its rendering), `literal` a text piece (TeX sets its
 *  characters as written: a code or URL mark; no formula). One of no ink (`ink` []) of a class drawn from its ink (cite, num,
 *  other, display, macro, umacro) states which of three it is: `text` '' TeX set nothing for it (or what it set stands in the ink
 *  of the run an author's first piece after its name holds, no point of TeX's between them: drawn there, once); `keep` TeX set it
 *  outside the unit's text (before its start), whatever it set never erased with the unit; neither, its ink was not found, and
 *  the typesetter leaves the unit the original's */
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
 *  its name): what the typesetter pairs the group's translation with its annotations by; `runin` a title its author set in the
 *  line at a paragraph's opening with no mark after it (`\noindent\textbf{Global Matching} We leverage …`: a group that opens a
 *  paragraph of its unit, sets a face, is followed in the source by white space, alone or beside horizontal spacing of the
 *  paper's own, and then by what begins a sentence, its text ending with no closing mark), the engine's reading of its unit's
 *  source (bundle/run-in.ts), the same on every member of the unit: the typesetter sets the target script's separation between
 *  two sentences after it where the translation holds no mark there, the paper's own space there counting toward it
 *  (docs/PDF-READER.md §18.85). Absent on any other group; a part made before states none, and its titles are
 *  laid as before */
export const SpanAt = z.object({
  style: Style.optional(),
  opens: int.optional(),
  cmd: z.string().optional(),
  colour: int.optional(),
  to: LinkTo.optional(),
  runin: flag.optional(),
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
 *  line along its run the figure reading gives it; a turned one's room is its run's, Placed.run), a cell's clear band; `under`
 *  a figure text's depth under its baseline of the nearest stroke under its text (S.figures: a translation that reaches it is
 *  crowded). `runs`: the room under each run of its text lines (to its last line on a page or in a column, over a kept row of
 *  its own, over another's ink TeX set between two of its lines), each [that line's index, the depth under its baseline of the
 *  next ink across the run (from its lines' own start to their column's end: a glyph's baseline, a box's top), the depth under
 *  it of TeX's text block bottom in its column there (the foot of the box TeX shipped the column's text in)], stated where TeX
 *  states that foot; `sep` TeX's normal paragraph separation where its paragraph ends, \baselineskip and \parskip, natural (a
 *  heading's, under its title set on lines of its own: its \@startsection after-skip and the \baselineskip and \parskip around
 *  it, natural, TeX's normal separation from its last baseline to the next paragraph's first): what a translation may borrow
 *  under a run, never past that bottom nor nearer the next ink than `sep` (docs/PDF-READER.md §18.11). A part made before
 *  PIPELINE 80 may state the room under each run otherwise (`ends`, which nothing reads) */
export const Room = z.object({
  below: num,
  next: num.optional(),
  side: z.tuple([num, num]).optional(),
  band: z.tuple([num, num]).optional(),
  // (the side of `band` no rule stands on, where one stands on the other: 1 under, 2 over. The band states the cell's line's own
  // bottom or top there, as a part made before does, which a typesetter of before reads as a rule)
  bandOpen: z.union([z.literal(1), z.literal(2)]).optional(),
  // (a table cell's sides of `side` that stop at a painted box, its column's rule or a neighbour's fill, not at a glyph: 1 the
  // left, 2 the right. A cell widened past its own ink keeps a quarter of its size off a wall and goes half way to a glyph;
  // a part made before states none, every side a glyph's)
  wall: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  // (a table cell's room in its column: its column's box (the left and right edge of what TeX set in its column of its tabular,
  // every entry's, its unit cells' and the entries no unit is (a number, a formula alone), stated where they line up as the
  // column's class sets them (an l column's on its left edge, an r column's on its right, a c column's on its middle, two
  // entries at least); a spanning cell's the union of the columns it spans, each stated) widened, on each side the cell's class
  // grows (l right, r left, c both by the smaller), by half the blank between the box and what stands next on the table's band
  // (the column's own share of TeX's blank between columns), never past the cell's own `side`. Absent where the box is not
  // established: a p, m, b or X column, a cell of a \parbox or of no LaTeX template, a column a \multicolumn widened, one whose
  // entries do not line up, one of one entry. A single-line cell is laid in it, in its column's alignment, at the largest size
  // not over the original's that fits it (docs/PDF-READER.md §18.13); a typesetter of before reads none and lays it in its own
  // room. A part made before PIPELINE 102 states the box itself)
  column: z.tuple([num, num]).optional(),
  under: num.optional(),
  // (a figure text's container's edge over its baseline, PDF units up from it: a closed shape round all of its glyphs, inside
  // which its translation is laid (docs/PDF-READER.md §18.26); S.figures keeps a translation's band under it as it
  // keeps its depth over `under`. A typesetter of before reads none and lays the band as before)
  over: num.optional(),
  runs: z.array(z.tuple([int, num, num])).optional(),
  sep: num.optional(),
  // (the separation TeX set under its last line, by its class: [the glue's name, TeX's own, its natural size, its shrink], PDF
  // units, the glue in force there as the marked compile states it. `parskip` a paragraph over a paragraph (the next one's
  // \parskip); `afterskip` under a heading (its \@startsection after-skip), `runin` after a heading set in the line (the
  // horizontal skip TeX sets after its title, the after-skip negated), `beforeskip` over a heading (its before-skip as TeX adds
  // it); under a float's last member its float's (`textfloatsep` over the text under a top float, `intextsep` round a float
  // set here, `floatsep` over the next float, `dbltextfloatsep` and `dblfloatsep` a float across both columns, `fpsep` and
  // `dblfpsep` between the floats of a float page), and over a float's first member from text above it (`intextsep`, or
  // `textfloatsep` over a bottom float); in a float, over its caption `abovecaptionskip`, under it `belowcaptionskip`; over the
  // footnotes `footins` (\skip\footins), between two `footnotesep` (TeX's strut at a note's top: no shrink). Absent where TeX's
  // class of the gap is not stated or not known: what follows is no unit's text, ink no unit owns stands between, the class makes
  // its headings without \@startsection, a part made before. Nothing reads it to lay a page yet (the display design's 2d, F40)
  gap: z
    .tuple([
      z.enum([
        'parskip',
        'afterskip',
        'runin',
        'beforeskip',
        'textfloatsep',
        'floatsep',
        'intextsep',
        'dbltextfloatsep',
        'dblfloatsep',
        'fpsep',
        'dblfpsep',
        'abovecaptionskip',
        'belowcaptionskip',
        'footins',
        'footnotesep',
      ]),
      num,
      num,
    ])
    .optional(),
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

/** one placement on A: a unit's, a babel name's, a figure text's */
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
  // a table cell of several lines set in a box of its cell (a \makecell's, a \shortstack's, a nested one-column tabular's): how
  // its lines stand in that box, read off A (their left edges, middles or right edges together; all three, the cell's class),
  // where `align` is the box's in its column (docs/PDF-READER.md §18.75). Absent, its lines stand by `align`; a typesetter of
  // before reads none and lays the cell's lines as it did, so FORMAT stays
  inner: z.enum(['l', 'c', 'r']).optional(),
  // a table cell of a column LaTeX built from m or b (array.sty's \@chnum 3 or 5, the marked compile's AXT-CELL): where TeX stands
  // its lines in its row, `m` the middle of its first and last baselines on the row's baseline (array.sty's \ar@align@mcell, the
  // cell's box lowered by half its height past the strut's), `b` its last line on it (a \vbox). Absent for c, l, r, p (a \vtop:
  // its first line on the row's, where the lay starts a cell's lines) and a cell no template of LaTeX's set. A field of its own,
  // not a fifth member of `cell`, whose tuple a reader of before refuses: that one strips it and lays the cell's lines from its
  // first line as it did, so FORMAT stays (docs/PDF-READER.md §18.92)
  stand: z.enum(['m', 'b']).optional(),
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
  // 82 % of Microsoft's starts are among them (40,409 in the corpus's stored rows, measured 2026-11-08), under the 90 % required
  words: z.array(z.tuple([int, int, num])).optional(),
  // the paragraphs TeX opened inside its text, each by its first word: [that word's offset in the source projection (an entry of
  // `words`, where Row.sentences.src counts), the index in `lines` of the line TeX opened it on (that entry's line)], ascending.
  // Every point whose first word is placed on that line, whatever else also states it (a group's open, SpanAt.opens; an element,
  // El.opens; a forced break, El.ends): a carrier a translator's reply can drop, the word one it cannot (docs/PDF-READER.md
  // §18.69). None after a display, nor where its line or the line before is held (KEPT). A part that states it states `words` in
  // every part that holds the member. Absent: no such point, a unit not lit by sentence, a part made before (FORMAT stays)
  paras: z.array(z.tuple([int, int])).optional(),
  // beside `paras`, point by point (the same length): the element of the unit each point's first word stands directly after in
  // the source projection, by its piece id (an element the translator is sent in its place, not `silent`, or a nested unit),
  // nothing but white space between its character and the word's offset, and no ink of it TeX set after the paragraph's end:
  // the element that ended the paragraph before (cas-sc's `\sep`, which is `\par`), which a reply returns in its place where it
  // returns the element; null where none does. Absent
  // where no point names one. A field of its own, not a third member of `paras`' tuples, which a reader of before refuses (a
  // tuple holds its length): that one strips it, reads the points as it did, and FORMAT stays (docs/PDF-READER.md §18.69)
  parasAfter: z.array(z.union([z.string(), z.null()])).optional(),
  fixed: int.optional(),
  // its own text, where a rule tells a translation by it: a babel name's on A, a figure text's and a table cell's as its source
  // writes them (its text pieces, an element a space): a translation that says nothing else came back as it went
  plain: z.string().optional(),
  // a figure text's direction where it is not along x (the page's y up), and, where it is so turned, its run: its first glyph's
  // origin, its box's length along `dir` and its room before and after its box along it (its lines are its box on the page,
  // which tells none of them). A field of its own, the fields a typesetter of before reads keeping their meaning: that one
  // leaves a turned figure text the original's or reads it as it did, and FORMAT stays (ARCHITECTURE.md §5: an optional field is free)
  dir: z.tuple([num, num]).optional(),
  run: z.tuple([num, num, num, num, num]).optional(),
  // the paper's title, a unit of its front matter (the source's: what a section heading's rules leave aside)
  title: flag.optional(),
  front: flag.optional(),
  // a table cell's place in TeX's grid, as the source's tabular sets it: its row, its first column, the columns it spans
  // (\multicolumn), and 1 where it is a header's (the rows above the table's first full rule), else 0. The cells of one table
  // are its `cells` tie's; what a reader decides of them together (a header, a column) is read from these
  cell: z.tuple([int, int, int, z.union([z.literal(0), z.literal(1)])]).optional(),
  // the facts it carries as read on A, not stated by TeX: 'style' (TeX's font
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
 *  its style where it is not solid (/S /D or a /Border dash array, dashed; /S /U, underline; beveled and inset drawn
 *  solid). Stated where the width is above 0 and the colour is one: an annotation with none draws none */
export const LinkBorder = z.union([z.tuple([num, int]), z.tuple([num, int, z.enum(['dashed', 'underline'])])])
/** one of A's link annotations: its rectangle, where it goes, the member and the piece that hold it (an element's id, '' its
 *  text), the characters of the glyphs under it (their glyph points', PDF.js's rule, in their order, white space aside: what
 *  the typesetter's link match finds among the characters a piece is drawn as; absent where it holds none), whether those
 *  of its text's are its label's (more than half of its glyphs: the label's group, which stays on where the label is not drawn anew), whether
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
    // (one person, one translation per paper: docs/PDF-READER.md §19.15. Where the names
    // toggle shows the block, a block name the page's text holds elsewhere is drawn with the block's translation of it)
    named: z.array(Named).optional(),
    persons: z.array(Person).optional(),
    splits: z.array(Split).optional(),
  }),
  flows: z.array(z.array(Placed)),
  ties: z.array(Tie).optional(),
  links: z.array(Link).optional(),
  // the units of the page whose text TeX set turned (a box set level and turned: \rotatebox, a sideways float), by turn: `dir`
  // the turn's direction on the page (the frame's x axis, a unit vector, the page's y up), and the frame's flows and ties, each
  // member stated in the frame, the page's coordinates turned back by `dir` about the page's origin ((x, y) of the page is
  // (ux x + uy y, -uy x + ux y) there), its lines' page the page's, and so its elements' ink and its label's (El.ink, Label.ink
  // and its parts): what is not text in the unit is the original's turned ink, cut as a crop and drawn moved along the turn. A
  // typesetter lays a frame as it lays a part's flows, and a reader draws it through its turn. A field of its own: a reader of
  // before strips it and leaves those units the original's,
  // their groups on, as it did when no part held them (FORMAT stays: ARCHITECTURE.md §5; docs/PDF-READER.md §18.112)
  frames: z
    .array(z.object({ dir: z.tuple([num, num]), flows: z.array(z.array(Placed)), ties: z.array(Tie).optional() }))
    .optional(),
})

// ---------------------------------------------------------------- what opens a paper
/** the original (A): its length, its digest, and the digest of each CHUNK bytes of it, so that a reader checks every range
 *  it reads: `chunks` the base64url of the first 16 bytes of each chunk's SHA-256, joined */
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
  // the prepare's marked compile left the optional classes of points out (the engine's POINT_CLASSES; docs/PDF-READER.md §19.7): a
  // marked request died where TeX said no error, and every one from it on was asked without them, so that the paragraph ends
  // and alignment those points state were read off the page. Absent: every class (the corpus's every paper but such a one)
  reduced: z.literal(true).optional(),
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
/** the statement a row answered: the digest of its unit as the translators were given it (packages/translate askedOf), which
 *  its id does not cover (an element's `name` or `text`, a group's `must` or `stop`, the unit's `entry`). A host keeps a stored
 *  row only for the statement it would send now. Absent on a row made before it (a reader of before strips it) */
const asked = Digest.optional()
export const Row = z.discriminatedUnion('ok', [
  z.object({
    id: Id,
    ok: z.literal(true),
    content: z.array(OutPiece),
    by: z.string(),
    sentences: z.object({ src: z.array(int), tr: z.array(int) }).optional(),
    asked,
  }),
  z.object({ id: Id, ok: z.literal(false), why: Why, asked }),
])

/** a paper's rows for one target, as the server stores and serves them (the Worker's rows file, the extension's store): each a
 *  translate package's Result, by unit id, naming the statement it answered (`asked`; the extension's store names it in the
 *  row's key), in the units' reading order (the head's Units, first occurrence), each id once */
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

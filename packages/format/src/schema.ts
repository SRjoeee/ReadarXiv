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
 *  (text our compile set that no source unit owns); inkfigures (text inside a figure) */
export const Kind = z.string().regex(/^[a-z][a-z-]{0,31}$/)
/** an element's kind, as the source reader typed it: an open string (math display cite ref eqref footnote macro url code
 *  number other, today's; break, symbol) */
export const ElKind = z.string().regex(/^[a-z][a-z-]{0,31}$/)
/** a span's style: an open string (bold italic mono sc link colour other …) */
export const SpanKind = z.string().regex(/^[a-z][a-z-]{0,31}$/)

export type Piece =
  | { t: 'text'; s: string }
  | { t: 'el'; id: string; kind: string; src: string; keys?: string[] | undefined; stop?: string | undefined }
  | {
      t: 'span'
      id: string
      style: string
      must?: 1 | undefined
      open?: string | undefined
      close?: string | undefined
      content: Piece[]
    }
  | { t: 'unit'; id: string; unit: string; pre: string; post: string }

/**
 * A piece of a unit, in the source's order. A piece's id is local to its unit (its place in it), so equal units are equal
 * piece for piece. `el`: an element that travels with the text (a formula, a citation, …), its TeX source `src` for
 * identity only (`stop` not in the id: it is part of `src`). `span`: a group of the source (`open` and `close` its TeX source, for identity), styled; a group the unit's edge cuts
 * (a cell's \\ inside a \shortstack) has no `open` (it began before the unit) or no `close` (it ends after it). `unit`: a unit
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
      // the punctuation the element sets at its own end that is its sentence's (a display's `x = y.`; today's displayStop):
      // a translator may write it after the element so that the sentence ends there
      stop: z.string().optional(),
    }),
    z.object({
      t: z.literal('span'),
      id: z.string(),
      style: SpanKind,
      must: flag.optional(),
      open: z.string().optional(),
      close: z.string().optional(),
      content: z.array(Piece),
    }),
    z.object({ t: z.literal('unit'), id: z.string(), unit: Id, pre: z.string(), post: z.string() }),
  ]),
)

/** a unit, each distinct one once: `depth` a heading's level, `sentences` it is cut into sentences, `kept` the paper keeps it
 *  as it is (never translated) */
export const Unit = z.object({
  id: Id,
  kind: Kind,
  content: z.array(Piece),
  depth: int.optional(),
  sentences: z.literal(true).optional(),
  kept: z.literal(true).optional(),
})
export const Units = z.object({ format, units: z.array(Unit) })

// ---------------------------------------------------------------- what laying a page reads
/** TeX's font state, the fill read from A: role, size, bold, slant (1 italic, 2 slanted), faked small capitals' size share,
 *  set in small capitals (a placement's: most of its letters that can tell are faked small capitals, today's vote; a face of
 *  real small capitals is its design's), upper case, fill 0xRRGGBB, the design where it is not the paper's */
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
 *  flags (1 KEPT: its ink stays; 2 PINNED: shares its baseline with ink that stays; 4 SHORTSKIP; unknown bits ignored), and
 *  its size (the median of its main glyphs' sizes, the glyphs within 0.85 of its largest where they set a quarter of its
 *  characters: today's line size, MAKE:382-401, by which the typesetter draws the line's band; absent: the member's size) */
export const Line = z.tuple([page, int, num, num, num, num, num, num, num, int, num.optional()])
export const LINE_FLAG = Object.freeze({ KEPT: 1, PINNED: 2, SHORTSKIP: 4 })

/** an element on A. `kind` the class it is drawn by (today's placeholder class, layer2.mjs placeholdersOf's phClassProven,
 *  stated so that no rule of the typesetter reads a source: cite, num, display, other, symbol, macro, umacro, space, zero),
 *  `unknown` a paper's own macro no table renders, `copy` its source's plain text (a crop's copy text, its drawing from the
 *  source where no ink is found; a URL's, its glyphs' text on A where it has one, El.text), `sym` a symbol's drawn text and
 *  whether it is drawn raised where the source reads as a symbol (phClass2's: the tokens' class; a formula of symbols alone is
 *  `other` with a `sym`), `mark` a footnote's mark (drawn raised whatever its rendering), `literal` a text piece (TeX sets its
 *  characters as written: a code or URL mark; no formula) */
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
  // where a URL TeX set on one line may break, as its url package lets it: after a run of \UrlBreaks' and \UrlBigBreaks'
  // characters, each the x between two of its glyphs on its ink's line and how much of its copy text stands before it, in UTF-16
  // code units (as the text holds them: a space between two glyphs, a ligature's letters, an astral character's two): the unit
  // the typesetter slices `copy` in
  breaks: z.array(z.tuple([num, int])).optional(),
})
/** where a link goes: an address, or a destination in the paper (PDF.js's dest as JSON: a named one `"name"`) */
export const LinkTo = z.union([z.object({ url: z.string() }), z.object({ dest: z.string() })])
/** a group of the source on A: its style, the paragraph TeX opened at it; the command its open begins with (its name and
 *  star), the fill TeX set its run in; a link group's target where its source names it, as Link.to states an annotation's (an
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
 *  base), absent where it stands on none (a part made before states none) */
export const Label = z.object({
  kind: z.enum(['float', 'head', 'number', 'mark']),
  ink: Ink,
  style: Style,
  name: z.tuple([z.string(), Ink]).optional(),
  num: z.tuple([z.string(), Ink]).optional(),
  punct: z.tuple([z.string(), Ink]).optional(),
  line: int.optional(),
})
/** the room about a placement: below its last line, to the next ink under it, beside its lines (a level figure text's: the free
 *  line along its run today's figure reading gives it; a turned one's room is its run's, Placed.run), a cell's clear band; `under`
 *  a figure text's depth under its baseline of the nearest stroke under its text (S.figures: a translation that reaches it is
 *  crowded); `ends` the room under each run of its text lines (a run's last line: the next line on another page or column, a
 *  kept row, under another's ink (a float set inside the paragraph), or none), each [that line's index, the free depth under it
 *  to the first ink across the run (its lines' own start to their column's end), its own kept rows and elements too, its page's
 *  lowest unit baseline (but a figure text's, an ink figure's and a name's)]: what a translation may borrow there, on each page
 *  it runs over (`below` is its last line's alone, which a part made before states) */
export const Room = z.object({
  below: num,
  next: num.optional(),
  side: z.tuple([num, num]).optional(),
  band: z.tuple([num, num]).optional(),
  // (the side of `band` no rule stands on, where one stands on the other: 1 under, 2 over. The band states the cell's line's own
  // bottom or top there, as a part made before does, which a typesetter of before reads as a rule)
  bandOpen: z.union([z.literal(1), z.literal(2)]).optional(),
  under: num.optional(),
  ends: z.array(z.tuple([int, num, num])).optional(),
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
  text: z.union([Id, Word]),
  why: PrepWhy.optional(),
  join: z.union([z.tuple([num]), z.tuple([num, flag])]).optional(),
  bound: flag.optional(),
  lead: num,
  style: Style,
  align: z.enum(['j', 'l', 'c', 'r']),
  lines: z.array(Line),
  els: z.array(z.tuple([z.string(), El])).optional(),
  spans: z.array(z.tuple([z.string(), SpanAt])).optional(),
  label: Label.optional(),
  tail: z.array(z.tuple([z.string(), Style])).optional(),
  room: Room,
  cuts: z.array(z.tuple([int, int, num])).optional(),
  fixed: int.optional(),
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
/** one of A's link annotations: its rectangle, where it goes, the member and the piece that hold it (an element's id, '' its
 *  text), the characters of the glyphs under it (their glyph points', PDF.js's rule, in their order, white space aside: what
 *  today's link match finds among the characters a piece is drawn as; absent where it holds none), and its page where it is not
 *  the part's (an annotation of a member of the page on another of its pages, which a translation may draw on this one) */
export const Link = z.object({
  box: Box,
  to: LinkTo,
  owner: z.tuple([int, z.string()]).optional(),
  text: z.string().optional(),
  page: page.optional(),
})
/** the paper's fonts as A names them (base names, subset tag off), with the glyphs of located units set in each, most first:
 *  what the reader picks its served faces by (typeset-inputs A3, A4) */
export const Faces = z.object({ fonts: z.array(z.tuple([z.string(), int])) })
export const Part = z.object({
  format,
  page,
  paper: z.object({
    faces: Faces,
    lineskip: z.tuple([num, num]).optional(),
    names: z.array(z.tuple([z.string(), Id])).optional(),
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
export type Faces = z.infer<typeof Faces>
export type Part = z.infer<typeof Part>
export type Original = z.infer<typeof Original>
export type Head = z.infer<typeof Head>
export type Why = z.infer<typeof Why>
export type Row = z.infer<typeof Row>
export type Rows = z.infer<typeof Rows>

// The layout file (prep/<mid>/layout-<sha256>.json, spec §4.2): arXiv's PDF as the layer lays over it, made by the layout
// maker from a paper and read by the container's service and the reader's main thread. It is untrusted, so it is refused
// within bounds before it is used: bytes, UTF-8, values and nesting counted before JSON.parse (json.mjs), then its shape
// and every bound with plain loops. A refusal is of the whole file, names its path, and describes a value by its type,
// never by its text. Coordinates are arXiv's PDF units, each page unrotated, y up as in PDF, pages 1-based: a rectangle is not
// empty, x0 < x1 and bottom < top. Every string is returned as it is; nothing here or downstream builds markup from one.
// Imports json.mjs and names.mjs alone: the reader loads it.
import { boundedJson, checkPages, checkViews, isInteger, isNumber, isObject, isVersionToken, LayoutRefusal } from './json.mjs'
import { NAME_KEYS } from './names.mjs'

export { LayoutRefusal } from './json.mjs'

/** the maker's version: raised with any change to what the layout maker writes under this schema; it enters a bundle's
 *  key (bundle.mjs VTAG) and the file as `layout`, which a reader reads for its shape alone: a file is refused by its
 *  `schema`, never by the maker that wrote it (the rules-as-data plan, §9.3), so a change of the schema's fields,
 *  bounds or meaning raises `schema` (and BUNDLE, which holds the file), not this.
 *  2: placeholders found by their own ink in the content stream, and the page text of citations and references;
 *  3: a text symbol the marking could not mark drawn as its character (PH_FLAG.TEXT), no row for a macro TeX said
 *  sets no ink, glyph boxes by their own ink, and the lines a unit's source does not write held (`held`); 4: babel's
 *  names located (`names`, the file's schema 2), and no unit's label holding one; 5: the paper's \lineskip and
 *  \lineskiplimit (`lineskip`, the file's schema 3); 6: a display that ends its column's body found past it, an inline
 *  formula first after a display found by its own opening mark (marks.mjs \axtpmm), a display group's later displays
 *  JOINED to its first, a LOST piece outside the unit's lines OUTSIDE (the file's schema 4), and an inline piece whose
 *  two marks stand on one line of the unit wholly on it; 7: a piece TeX broke over lines gives its unit the line it wraps onto, and a
 *  reference the matcher misses is placed by its link annotation (the file's schema is 4 still); 8: a unit's CENTRED as TeX
 *  set its paragraph where the marked original's log tells it (marks.mjs readAlign), else by arXiv's lines, a line across
 *  both columns on the middle of their centres and one line short of its column by an em; a found placeholder's fill
 *  (the file's schema 5); and each colour piece's fill as TeX set its run (`colours`, marks.mjs readColours: a key of the
 *  file's only where a unit has one); 9: a unit's own mark no line carried placed by the unit's words beside it, one of them
 *  at most a reference's other name (layout/tolerant.mjs: 2609.26457's "section B" for arXiv's "appendix B"), and a text
 *  piece the matcher missed found by its characters on the unit's lines (TeX broke it over two lines in one PDF alone); 10:
 *  no row and no mark for a placeholder that sets no ink (arg-roles.mjs textless: \label with cleveref's type,
 *  \bibliographystyle, soul's \sethlcolor, \-), and a babel name's marks after a \relax (marks.mjs NAMES_TEX), so that a
 *  class's \if over the name reads it and REVTeX's numbered appendices are set with their names marked (the file's schema
 *  is 5 still; the gate pack's 32 outputs' marks are 9's, each destination where it was); 11: a unit's lines at a page
 *  break read by its own words (pipeline/anchors.mjs: a paragraph and its footnote both going on over a page each keep the
 *  lines their matched words are on, and a formula's row of no word of the unit's is held between its lines, not the walk's
 *  end): over 57 papers 10 LOST rows found and none lost, 5 units' lines changed in 4 papers, the gate pack's 32 outputs
 *  unchanged (the file's schema is 5 still); 12 (layer route step 2): the file's coordinates are our base page's, the final
 *  pass of the marked original (its marks where the draft has them), no longer arXiv's PDF's: a placeholder's segments are its
 *  own glyphs and rules between its two marks, looked up on that page with no matching, and the carry is the line check alone
 *  (the file's schema is 5 still); 13: a placeholder after a control sequence TeX and the kernel define to set no ink and
 *  read nothing (rules/tex-kernel.mjs: `\@` in "Fig.\@ \ref{x}", `\indent`…) or after a LaTeX text symbol (`\S\ref{x}`) gets its
 *  marks, where the maker took the one before it for a macro that may look ahead and left it with none: over 177 sources
 *  19 papers' marked originals gain 359 opening marks, the other 158 and every unit are as they were (the
 *  file's schema is 5 still; the gate pack's seven papers are among those unchanged); 14: what stands beside a placeholder read
 *  from what the paper says rather than guessed (marks.mjs MARKS_SCHEMA 9): a call of the paper's own macro that reads nothing past
 *  its arguments (latex-front.mjs completeMacros, from its definitions) is asked about by the mark probe, last, and a call the
 *  probe asked about (or one of no arguments) gets the closing mark TeX answered moves nothing, before white space or
 *  punctuation, and leaves the piece after it, past white space, its marks; a macro glued to a word whose box TeX begins with glue, a kern, a penalty or a whatsit (readInkApart) is marked;
 *  the kernel's letters but the dotless \i and \j, and \slash, are text symbols; and a unit whose start mark stands at no word is bounded by the nearest
 *  upright word after it on its baseline in its column (make.mjs reachIn); and a unit's line probe goes past the white space
 *  that opens it, where its start mark goes, so that a space TeX skips after a control word or by \ignorespaces stays skipped
 *  (latex-front.mjs patch: paralist's inline `\item Which`, 2610.21098's page re-broken from page 1). Every marked original's
 *  bytes change where a unit opens with white space. Over the release-route sweep's 35 papers with unanchored rows, 37 of the
 *  217 rows (31 units) convert, 57 units in all are placed better and no other unit's layout changes; of their 34 base pages
 *  made again, 19 set every word where the paper's own compile in the same image does (pdftotext), the other 15 as the sweep's
 *  did or nearer. Of the gate pack's seven papers 2609.26457's marking gains 73 marks, and each base page sets every word as
 *  before or as the paper's own compile does (2307.16209 and 2608.16117 now as it) (the file's schema is 5 still); 15 (the release sweep's
 *  fallbacks, 2026-10-22): the layout compile writes a Latin-1 source as the paper's own bytes (live.mjs originalFiles
 *  `transcode`), sets no mark inside an argument TeX reads verbatim (marks.mjs VERBATIM_ARG), reads no class's fallback that a
 *  package the paper loads overrides as the command's definition (arg-roles.mjs overriddenFallback), and takes no marked original
 *  of more pages than arXiv's for the base page (paper.mjs markedOfPaper): over 183 local sources the marked original changes in
 *  2610.20581 and 2610.19860 alone, the gate pack's 32 outputs unchanged (the file's schema is 5 still; MARKS_SCHEMA 9 still);
 *  16: a unit is laid only where every page it is on is drawable, its words arXiv's page's (carry.mjs PAGE_SAME: 0.98 in
 *  order, NFKC and the known text-layer substitutes applied) and none of its lines on another page of arXiv's (make.mjs
 *  drawable), the others left the original's, in place of the share of the paper's and each part's lines (CARRY_MIN, gone)
 *  (the file's schema is 5 still); 17 (the marks' coverage, second round): the layout compile marks the front matter's units
 *  (an author block's names and places, a \\thanks, a \\date: a front unit not a heading nor one a macro only stores) as any unit, but one whose text another's
 *  equals (latex-front.mjs frontMarks); a page shipped with no column's body bracketed (revtex4-2's ltxgrid makes its columns
 *  without \\@makecol) has its text block bracketed at \\@outputpage (marks.mjs POINTS_TEX); a complete macro's probed call
 *  glued to the placeholder after it is asked about that follower (its `call` code) and gets its closing mark where TeX
 *  answered so; and a unit's own marks keep a letter's italic correction as a cell's do (\\emph{…} at a unit's end). Over
 *  the release-route sweep's 35 papers with unanchored rows, 68 of the 217 rows (43 units) convert, by the measured per-item
 *  counts (2610.21098's glued calls 32 rows, revtex4-2's body points 36); of their 34 base pages made again, 33 set every word
 *  as next's did and 2610.21924 eleven words nearer its own compile; the gate pack's seven base pages are next's, word for
 *  word, its 15 author units and 5 notes all marked (the file's schema is 5 still; MARKS_SCHEMA 9 still); 18: a start mark
 *  on a turned run reaches no word (make.mjs reachIn turnedAt): 2602.23285v2's sideways cell in a table set beside a
 *  paragraph reached the next cell's word, took the paragraph's line and left the paragraph unlaid, as no maker before 14
 *  did; and why each unit not laid is the original's, a code of UNLAID a unit (`unlaid`, a key held only where a unit is
 *  not laid, as `colours`: every file of before reads and writes back unchanged; a part holds those of the units it tells),
 *  so that no unit is left out of the file without its reason (the file's schema is 5 still); 19 (the pin's sweep, 2026-10-24):
 *  a start mark takes the nearest word it does not stand past (pipeline/anchors.mjs tokenAtMark), so that the word it carries
 *  from the marked original, read in one text item a line, is the word our wrapped base page, read in items cut at its groups,
 *  has there (24 units of 11 papers, a caption's or a paragraph's start after its label, were unplaced); a front matter
 *  unit's placeholder marks are robust (`\\protect` before each: a \\thanks's \\protected@xdef took them off) and a piece after
 *  `\\protect` is marked before the prefix (rules/tex-kernel.mjs PREFIX_WORDS), so that its ink is its own (5 notes' addresses
 *  were LOST); and the wrap's decoded streams are held as bytes of their own (layout/remove.mjs readAtMost: 2610.21924's maker
 *  died of its memory) (the file's schema is 5 still; MARKS_SCHEMA 9 still); 20 (the release sweep of 2026-10-24): a piece's
 *  ink read as the per-unit erasure reads it (stream.mjs ownedOf, both readings one): the text after a piece, where it runs to
 *  its unit's next mark, begins where the glyphs to that mark spell it whole, not where its first characters first stand in the
 *  piece's own ink (a display's \\text{for every} before "For", a URL's dots before the full stop: the display's or the URL's
 *  segments were cut short, the rest read as the unit's text), and a display that ends a footnote is found to its page's folio
 *  (it was LOST): the layout file's segments and the wrap's groups are one reading again; and (the units still English
 *  against production after it) a placeholder at a unit's head is found by the text TeX sets for it, as the probe now reads
 *  it (marks.mjs readInkTexts, MARKS_SCHEMA 10: ASCII's punctuation, "1,024"; inline code at the head asked about too,
 *  "max_tokens"; a formula's glyph spelled by no character one glyph, INK_ANY, $d'$), and a front heading (ICML's
 *  \\icmltitle) is marked as any heading in the layout compile, its title's ink its own (the file's schema is 5 still); 21
 *  (docs/route/orphan-text.md, stage 2): the ink units' rows, text no source unit owns laid from our own glyphs (layout/ink-units.mjs,
 *  pipeline/ink-pass.mjs), of the kinds UNIT_KINDS names after the source units'; and in the same unreleased 21 (the content
 *  class `figures`, stage 5) the layout compile sets a point inside each pgf picture's own box (marks.mjs POINTS_TEX, `zs` and
 *  `ze`), so that a TikZ or pgfplots picture's text is told apart in our final pass (layout/figure-text.mjs): nothing outside
 *  the picture's box moves, and no reader of the marks sees the points (ink.mjs keeps them apart, `pictures`) (the file's
 *  schema is 5 still); 22 (stage 4): a bibliography's entries units of their own, numbered after the source's other units
 *  (UNIT_KINDS `reference`, and `refnames` for an entry's names, latex-front.mjs bibliography and entriesLast), marked as the
 *  body's, and an entry's numbers placeholders of their own (PH_KINDS `number`, both marks: MARKS_SCHEMA 11). A maker of 21
 *  reads neither kind, so a file of 22 is another maker's: the gate pack is made again, each side of the rules gate on its own
 *  (the file's schema is 5 still); 23 (the release sweep of 2026-10-25, (c)): a label row is its unit's only where its ink is
 *  no other unit's, as the wrap owns it (layout/own.mjs): the closing punctuation a head sets after the unit before a start is
 *  that unit's line (make.mjs headTail, MR 5's rule: amsthm's ")." after a note that ends in a citation, which was the body's
 *  label row and was shown again from the original where it stood, 2610.18513v1 p35), and a label row that meets an ink unit's
 *  text goes (pipeline/ink-pass.mjs layoutWithInk: a label the wrap left in no group and an ink unit claimed, SIAM's "AMS
 *  subject classifications.", a theorem's head whose note is a citation, shown again under the ink unit's translation: 39
 *  rows of 22 papers, 0 after, 30 of the sweep's 32 rows of (c)); and an ink unit's runs in another weight, slant or colour
 *  than its own are groups of the commands that set them (layout/ink-units.mjs rule 9: the sweep's (d), its text drawn in one
 *  style); and in the same 23 (2609.20976v1) an opening point alone at its unit's end, no display, owns its lines up to TeX's
 *  skip before another block, in both readings (stream.mjs lineEnd: the last author's \\orcidlink had owned the affiliations
 *  and the e-mail below the names; at a bibliography's leading a wrapped \\Eprint keeps every line it held); and in the same 23
 *  (2610.19274v1) a word a hyphen cuts at a line's end is joined where PDF.js ends the line with an empty item after it, as on
 *  our wrapped page (pipeline/anchors.mjs tokenizeDocument: the line check read two words against arXiv's one and left the list
 *  of figures' pages undrawn). The rows of the units they reach change, so a file of 22 is another maker's: the stored layers are made again and
 *  the gate pack with them; and in the same unreleased 23 (the look-ahead pairs, 2609.20976v1's abstract English) a
 *  placeholder right after a paper's macro that may look ahead (\\xspace: 2609.20976's \\snr, `\\ac{SNR}\\xspace`, before
 *  `$\\geq 50$`), past white space alone or none, is marked where the mark probe's look-ahead section says its opening mark there
 *  moves nothing (marks.mjs aheadSamples, the pair asked as the paper sets it; MARKS_SCHEMA 12), and the macro closed where its
 *  closing mark does too: that placeholder was LOST with no mark, and the macro with it ('open, an unmarked piece follows'),
 *  its unit the original's; where no mark may stand there (\\footnote, before which \\xspace sets no space and would before a
 *  mark), the maker parts the two's ink to the next marked piece by the text TeX sets for the macro (stream.mjs ownedOf,
 *  marks.mjs followsOf `split`), the piece placed from its own ink (the gate pack's seven papers write no such pair: their
 *  layout files are 23's rows); 24 (the content classes' coverage, the references and the author names decoupled:
 *  PDF-READER §19.13): an author block's affiliations, institutions, addresses and e-mail line units of their
 *  own (UNIT_KINDS `affiliation`, latex-front.mjs frontBlock: the body's, always translated; its names `author` as before),
 *  every unit at the number it had, the rows cut apart after the source's other units and before the entries (entriesLast);
 *  and a bibliography's entry one unit, whole (`refnames` kept at its index, made no more): a maker or a reader of 23 reads no
 *  such kind, so a file of 24 is another maker's, and each side of the rules gate reads its own pack (the file's schema is 5
 *  still); 25 (the mark probe's answers past a sample TeX gives up on, and a .bbl's own definitions): each box of the probe
 *  ends at the group level it began at, the groups its sample left open closed (marks.mjs PROBE_UNWIND: 2010.11929v2's \\tikz,
 *  asked alone, opened a picture it never closed, in which pgf's \\selectfont selects \\nullfont, and every box after it set
 *  no character: its \\natexlab{a} and \\doi{…} read as setting no ink and given no row, 8 of its entries English, and a pair's
 *  boxes, all empty, read as a mark that moves nothing), a box TeX set a character in \\nullfont in no answer; and the probe
 *  sets a .bbl's definitions as its styles write them, its conditionals whole (live.mjs bblProvides: natbib's
 *  `\\expandafter\\ifx\\csname natexlab\\endcsname\\relax\\def\\natexlab#1{#1}\\fi`, 2608.25210v2's entries). The rows of the pieces
 *  they reach change, so a file of 24 is another maker's (the file's schema is 5 still; MARKS_SCHEMA 12 still) */
export const LAYOUT = '25'
/** the file's schema: 2 holds `names`; 3 `lineskip`; 4 PH_FLAG.JOINED and PH_FLAG.OUTSIDE; 5 a found placeholder's fill, its
 *  row's last number where its glyphs are not black (4 + 6 × n + 1: 0xRRGGBB, or MIXED_FILL), and `colours`, each colour
 *  piece's run's fill [unit, k, 0xRRGGBB], a key the file holds only where it has a row; and, of a maker of 18 on, `unlaid`,
 *  why each unit it does not lay is the original's [unit, code], a key held only where a unit is not laid */
export const LAYOUT_SCHEMA = 5
/** a placeholder's fill where no one colour holds more than half its glyphs (the row's last number, schema 5) */
export const MIXED_FILL = -1
/** a fill's largest value, 0xFFFFFF */
const FILL_MAX = 0xffffff
export const LAYOUT_CAP = 4 * 2 ** 20
export const LAYOUT_VALUES = 1_000_000
/** the deepest the file nests: its object, then lines, frames or erase (the arrays of entries), then an entry [id, rows],
 *  then its rows (a flat array of numbers): four brackets, and no other field of the schema reaches past three */
export const LAYOUT_DEPTH = 4
/** a unit's kinds, by index: the source units', then the ink units' (layout/ink-units.mjs INK_KIND: a new kind takes the next index,
 *  so that a file of before reads as it was) */
export const UNIT_KINDS = Object.freeze(['para', 'heading', 'caption', 'footnote', 'cell', 'abstract', 'theorem', 'figure', 'author', 'inkheads', 'inkcontents', 'inknotes', 'inkorphan', 'inknames', 'reference', 'refnames', 'affiliation'])
export const PH_KINDS = Object.freeze(['math', 'display', 'cite', 'ref', 'eqref', 'footnote', 'macro', 'url', 'code', 'other', 'number'])
export const LABEL_KINDS = Object.freeze(['number', 'item', 'caption', 'footnote'])
/** a unit's flags. TITLE: the paper's title; FRONT: its front matter; CENTRED: its lines set centred, as TeX set its
 *  paragraph where the marked original tells it (\centering, a center environment, a class's centred heading), else as
 *  arXiv's lines show it (make.mjs): what the layer sets the translation's lines by (run.mjs) */
export const UNIT_FLAG = Object.freeze({ TITLE: 1, FRONT: 2, CENTRED: 4 })
/** babel's names (names.mjs), whose occurrences the file locates (`names`) */
export { NAME_KEYS } from './names.mjs'
/** a name's flags. CENTRED: centred in its column, as a unit is (UNIT_FLAG.CENTRED); CAPITALS: its glyphs capitals where
 *  its macro's own text is not (a class's case change, which the target's name takes too); RUN_IN: the lead of a unit's
 *  first line, which TeX sets right after it on that line (IEEEtran's "Abstract—…", amsthm's "Proof. …"), its row naming
 *  the unit */
export const NAME_FLAG = Object.freeze({ CENTRED: 1, CAPITALS: 2, RUN_IN: 4 })
/** a placeholder's flags. EMPTY: its points hold nothing (it draws nothing); LOST: its own ink is not known (no
 *  segments). TEXT: a LaTeX text symbol (\%, \_) drawn as its one character, the file's pageText, where the unit's lines
 *  on arXiv's page show it (a macro's only, no segments: its ink is the line's, erased with it). JOINED: a display of a
 *  display group (displays with nothing visible between them) after its first, which TeX gives no point of its own (the
 *  paragraph TeX resumes after a display is empty, and a mark there would make it a line): its ink is in the group's
 *  first display's segments, which is found, and it has none (a display's alone, never with another flag). OUTSIDE, with
 *  LOST alone: a piece whose ink lies outside the unit's lines, set by TeX before the unit's start mark (one the marking
 *  passes over at its head) or, a display, after its end mark (one that ends the unit): no line of the unit holds it, so
 *  it is never erased, and the layer draws it as nothing, its ink the original's */
export const PH_FLAG = Object.freeze({ SOURCE_BRACKETS: 1, NUMBERED: 2, RAISED: 4, LOWERED: 8, EMPTY: 16, LOST: 32, TEXT: 64, JOINED: 128, OUTSIDE: 256 })

const KEYS = ['schema', 'layout', 'pdfjs', 'paper', 'left', 'views', 'fonts', 'units', 'lines', 'frames', 'erase', 'ph', 'labels', 'headings', 'pageText', 'held', 'names', 'lineskip']
/** the keys a file or a part holds only where it has a row: each colour piece's fill (`colours`), and why each unit the maker
 *  did not lay stays the original's (`unlaid`: not `refused`, which a part's `layout` holds where it has none, format.mjs
 *  isLayoutRefusal) */
const COLOURS = 'colours', UNLAID_KEY = 'unlaid'
const OPTIONAL = [COLOURS, UNLAID_KEY]
/** the keys `v` must hold: `keys`, and each optional key it holds */
const withOptional = (v, keys) => (isObject(v) ? [...keys, ...OPTIONAL.filter(k => Object.hasOwn(v, k))] : keys)
/** why the maker laid a unit not (layout/make.mjs: the file's `unlaid`, [id, code] by id rising; a unit laid has none, every
 *  unit not laid one), for a sweep and a reader to tell, never to draw by: `noAnchor` (no anchor on our base page: its text
 *  not found there, its own marks giving none), `unplacedMarks` (its own marks set, but not carried to our base page's
 *  words or bounding none there), `kind` (a kind the file lays none of, or more than PIECES_MAX pieces), `rects` (its anchor's
 *  tokens give no line, or other lines than its anchor's), `linesUnit` (more than LINES_UNIT lines), `dark` (a line on a
 *  page whose ink is not read whole), `noLine` (a line with no glyph of its own: none there, or no size), `lineTaken` (a line
 *  whose glyphs another unit laid before it took), `erase` (a line's erase past ERASE_MAX rectangles, merging covering what
 *  another keeps), `undrawn` (a line on a page not drawable: carry.mjs lineCheckOf), `fonts` (its faces past FONTS_MAX) */
export const UNLAID = Object.freeze(['noAnchor', 'unplacedMarks', 'kind', 'rects', 'linesUnit', 'dark', 'noLine', 'lineTaken', 'erase', 'undrawn', 'fonts'])
/** the placeholders the layer may draw as text in the page's face (Task 9's tokens), whose own text the file may hold */
export const PAGE_TEXT_KINDS = Object.freeze(['cite', 'ref', 'eqref'])
/** a page text's code units at most, and a file's in all */
export const TEXT_MAX = 256, PAGE_TEXT_ALL = 500_000
/** a page text: 1 to TEXT_MAX code units, and of white space only a space, as the text layer gives it: no control
 *  character (C0, DEL, C1), no bidi control, no line or paragraph separator, no byte order mark, no lone surrogate */
export function isPageText(s) {
  if (typeof s !== 'string' || s.length < 1 || s.length > TEXT_MAX) return false
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x061c || c === 0x200e || c === 0x200f || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0xfeff) return false
    if (c >= 0xd800 && c <= 0xdbff) { const d = s.charCodeAt(i + 1); if (!(d >= 0xdc00 && d <= 0xdfff)) return false; i++; continue }
    if (c >= 0xdc00 && c <= 0xdfff) return false
  }
  return true
}
const PAPER_KEYS = ['id', 'version', 'pages']
/** a new-style arXiv identifier (10 characters), or an old one: its archive, 2 to 16 letters (the longest, astro-ph,
 *  cond-mat or plasm-ph, has 8; the rest is margin), a subject class, a slash and 7 digits, so 27 characters at most. The
 *  version is the paper's own field, never a suffix of the id */
const PAPER_ID = /^(?:\d{4}\.\d{4,5}|[a-z-]{2,16}(?:\.[A-Z]{2})?\/\d{7})$/
export const isPaperId = id => typeof id === 'string' && PAPER_ID.test(id)
/** a paper's version at most */
export const VERSION_MAX = 1000
const PDFJS_MAX = 32, LEFT_MAX = 128, FONTS_MAX = 512, FONT_MAX = 128
const PIECES_MAX = 10000, DEPTH_MIN = -1, DEPTH_MAX = 5, DEPTH_NONE = 9
const LINES_UNIT = 2000, LINES_ALL = 200000, SIZE_MAX = 200
/** a file's or a part's units not laid at most (`unlaid`), as its lines in all */
export const UNLAID_ALL = LINES_ALL
const SHARE_MAX = 1000, ERASE_LINE = 16, SEGS_INLINE = 4, SEGS_DISPLAY = 64, LABELS_UNIT = 4, SRC_MAX = 4000
/** a file's names at most: a heading a babel name sets is a few a paper, a thesis's some tens */
export const NAMES_MAX = 10_000
const NAME_BITS = NAME_FLAG.CENTRED | NAME_FLAG.CAPITALS | NAME_FLAG.RUN_IN
/** a name's row: its values */
const NAME_ROW = 15
/** a skip at most: TeX's \maxdimen in PDF units, which \offinterlineskip sets \lineskiplimit to, as the file writes it
 *  (to a hundredth: 16322.79, over the exact 16322.7895 by the rounding), so that a value the marks file holds is read */
const SKIP_MAX = Math.round(((16384 * 72) / 72.27) * 100) / 100
/** a rectangle lies within its page's view by this, PDF units */
const SLACK = 1
const UNIT_BITS = UNIT_FLAG.TITLE | UNIT_FLAG.FRONT | UNIT_FLAG.CENTRED
const PH_BITS = 511
const HEADING = UNIT_KINDS.indexOf('heading'), DISPLAY = PH_KINDS.indexOf('display'), MACRO = PH_KINDS.indexOf('macro')
const PAGE_TEXT = new Set(PAGE_TEXT_KINDS.map(k => PH_KINDS.indexOf(k)))
const ID_MAX = Number.MAX_SAFE_INTEGER

// ---------------------------------------------------------------- refusals
/** what a value is, for a refusal: its type, never its text */
const kindOf = v => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v)
/** an untrusted name in a path: its first 20 code units */
const clip = s => (s.length > 20 ? `${s.slice(0, 20)}…` : s)
const refuse = (path, why) => new LayoutRefusal(path, why)
/** name[i][k], or name[i][sub][k] for an entry's rows: built only once a refusal is certain */
const at = (name, i, sub, k) => (sub < 0 ? `${name}[${i}][${k}]` : `${name}[${i}][${sub}][${k}]`)

/** an object with exactly `keys`; an extra key is named by its first 20 code units */
function exactKeys(v, keys, path) {
  if (!isObject(v)) throw refuse(path, `not an object (${kindOf(v)})`)
  const name = k => (path ? `${path}.${k}` : k)
  for (let i = 0; i < keys.length; i++) if (!Object.hasOwn(v, keys[i])) throw refuse(name(keys[i]), 'missing')
  const own = Object.keys(v)
  if (own.length !== keys.length) for (let i = 0; i < own.length; i++) if (!keys.includes(own[i])) throw refuse(name(clip(own[i])), 'not a key of the schema')
  return v
}

/** a string of lo to hi characters, each printable ASCII (0x20–0x7e) */
function printable(v, lo, hi) {
  if (typeof v !== 'string' || v.length < lo || v.length > hi) return false
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i)
    if (c < 0x20 || c > 0x7e) return false
  }
  return true
}

/** an array, or a refusal naming its type */
function array(v, path) {
  if (!Array.isArray(v)) throw refuse(path, `not an array (${kindOf(v)})`)
  return v
}

/** an entry [id, rows] of lines, frames or erase: the id above the last entry's and a unit of units, the rows `stride`
 *  numbers each, at least one row; gives the unit's index in units */
function entry(e, i, name, last, slot, stride) {
  if (!Array.isArray(e) || e.length !== 2) throw refuse(`${name}[${i}]`, `not [id, rows] (${kindOf(e)})`)
  const id = e[0]
  if (!isInteger(id, last + 1, ID_MAX)) throw refuse(`${name}[${i}][0]`, 'not an id above the last')
  const u = slot.get(id)
  if (u === undefined) throw refuse(`${name}[${i}][0]`, 'not a unit of units')
  const r = e[1]
  if (!Array.isArray(r) || r.length === 0 || r.length % stride !== 0) throw refuse(`${name}[${i}][1]`, `not rows of ${stride} numbers, at least one`)
  return u
}

/**
 * A page and a rectangle in r from o: the page at o, then x0, x1, baseline, top and bottom at their offsets from o. The
 * page one of `span` ({ lo, hi }: the pages `views` holds, from page lo); each coordinate a finite number within the page's view by SLACK; x0 < x1, bottom < top; with
 * `window`, the baseline from bottom − 1 to top + 1. Refused at the number that breaks it
 */
function checkBox(r, o, X0, X1, BASE, TOP, BOT, window, views, span, name, i, sub) {
  const page = r[o]
  if (!isInteger(page, span.lo, span.hi)) throw refuse(at(name, i, sub, o), `not a page ${span.lo} to ${span.hi}`)
  const v = 4 * (page - span.lo)
  const xlo = views[v] - SLACK, ylo = views[v + 1] - SLACK, xhi = views[v + 2] + SLACK, yhi = views[v + 3] + SLACK
  const x0 = r[o + X0], x1 = r[o + X1], base = r[o + BASE], top = r[o + TOP], bottom = r[o + BOT]
  if (!isNumber(x0) || x0 < xlo || x0 > xhi) throw refuse(at(name, i, sub, o + X0), `not a number within its page's view (${kindOf(x0)})`)
  if (!isNumber(x1) || x1 < xlo || x1 > xhi) throw refuse(at(name, i, sub, o + X1), `not a number within its page's view (${kindOf(x1)})`)
  if (x1 <= x0) throw refuse(at(name, i, sub, o + X1), 'not right of x0')
  if (!isNumber(top) || top < ylo || top > yhi) throw refuse(at(name, i, sub, o + TOP), `not a number within its page's view (${kindOf(top)})`)
  if (!isNumber(bottom) || bottom < ylo || bottom > yhi) throw refuse(at(name, i, sub, o + BOT), `not a number within its page's view (${kindOf(bottom)})`)
  if (bottom >= top) throw refuse(at(name, i, sub, o + BOT), 'not below top')
  if (!isNumber(base) || base < ylo || base > yhi) throw refuse(at(name, i, sub, o + BASE), `not a number within its page's view (${kindOf(base)})`)
  if (window && (base < bottom - 1 || base > top + 1)) throw refuse(at(name, i, sub, o + BASE), 'not within 1 of its bottom and top')
  return page
}

/** a zero written -0 as 0, so that the file written again reads the same (JSON.stringify writes -0 as 0) */
function zeroes(r) {
  for (let j = 0; j < r.length; j++) if (r[j] === 0) r[j] = 0
}

// ---------------------------------------------------------------- the parser
/** bytes, then UTF-8, then values and nesting counted, then JSON.parse, then every bound; throws LayoutRefusal.
 *  `sized` false: none of the bounds a part holds of its own (the file's bytes and values, LINES_ALL, PAGE_TEXT_ALL,
 *  NAMES_MAX, FONTS_MAX), for a file that is cut into parts, each checked against them (checkLayoutPart) */
export function parseLayout(bytes, { sized = true } = {}) {
  if (!(bytes instanceof Uint8Array)) throw refuse('', `not bytes (${kindOf(bytes)})`)
  const caps = sized ? { cap: LAYOUT_CAP, values: LAYOUT_VALUES } : { cap: Number.POSITIVE_INFINITY, values: Number.POSITIVE_INFINITY }
  return checkLayout(boundedJson(bytes, { ...caps, depth: LAYOUT_DEPTH }), { sized })
}

/** a file already parsed, within the bounds of what holds it (a layer bundle, layer-proto/bundle.mjs): every bound
 *  parseLayout checks past JSON.parse (`sized` as there). Returns the value itself, its -0s written 0; throws LayoutRefusal */
export function checkLayout(value, { sized = true } = {}) {
  // (its schema first: a file of another names other fields, and is refused for what it is)
  if (isObject(value) && Object.hasOwn(value, 'schema') && value.schema !== LAYOUT_SCHEMA) throw refuse('schema', `not ${LAYOUT_SCHEMA}`)
  const f = exactKeys(value, withOptional(value, KEYS), '')
  if (f.schema !== LAYOUT_SCHEMA) throw refuse('schema', `not ${LAYOUT_SCHEMA}`)
  if (!isVersionToken(f.layout)) throw refuse('layout', `not a version, 1 to 32 letters, digits or points (${kindOf(f.layout)})`)
  if (!printable(f.pdfjs, 1, PDFJS_MAX)) throw refuse('pdfjs', `not 1 to ${PDFJS_MAX} printable ASCII characters (${kindOf(f.pdfjs)})`)
  const paper = exactKeys(f.paper, PAPER_KEYS, 'paper')
  if (!isPaperId(paper.id)) throw refuse('paper.id', `not an arXiv identifier (${kindOf(paper.id)})`)
  if (!isInteger(paper.version, 1, VERSION_MAX)) throw refuse('paper.version', `not an integer 1 to ${VERSION_MAX}`)
  const pages = checkPages(paper.pages, 'paper.pages')
  if (!printable(f.left, 0, LEFT_MAX)) throw refuse('left', `not 0 to ${LEFT_MAX} printable ASCII characters (${kindOf(f.left)})`)
  const views = checkViews(f.views, pages, 'views')
  zeroes(views)

  checkRows(f, { views, lo: 1, hi: pages, sized })

  checkLineskip(f.lineskip, 'lineskip')
  return f
}

/** the paper's \lineskip and \lineskiplimit, PDF units, as TeX gave them (layout/marks.mjs readSkipProbe), or null where it
 *  gave none; each within TeX's \maxdimen. `path` names it in a refusal (the file's `lineskip`, a bundle 4 head's) */
export function checkLineskip(ls, path) {
  if (ls !== null) {
    if (!Array.isArray(ls) || ls.length !== 2) throw refuse(path, `not null or [lineskip, lineskiplimit] (${kindOf(ls)})`)
    for (let i = 0; i < 2; i++) if (!isNumber(ls[i]) || Math.abs(ls[i]) > SKIP_MAX) throw refuse(`${path}[${i}]`, `not a number within ${Math.round(SKIP_MAX)} (${kindOf(ls[i])})`)
  }
  return ls
}

/** the keys of a layout part (C1.4), in their order: the layout file's rows and tables, less what is paper-wide (`schema`,
 *  `layout`, `pdfjs`, `paper`, `lineskip`: the head's), the side key (`left`: parts are content-addressed) and the views
 *  (the part's own) */
export const PART_KEYS = Object.freeze(['fonts', 'units', 'lines', 'frames', 'erase', 'ph', 'labels', 'headings', 'pageText', 'held', 'names'])

/**
 * A layout part already parsed (a bundle 4 part holds one): the file's rows and tables of PART_KEYS, every bound
 * checkLayout checks of them (the bounds per part: LINES_ALL, PAGE_TEXT_ALL, NAMES_MAX, FONTS_MAX), with every page a row
 * names one of `lo` to `hi` and its box within that page's view. `views` are the views of pages lo to hi (stride 4, as
 * checkViews has them), `pages` the paper's, which hi may not pass. Returns the value itself, its -0s written 0; throws
 * LayoutRefusal
 */
export function checkLayoutPart(value, { pages, views, lo, hi }) {
  if (!isInteger(lo, 1, pages) || !isInteger(hi, lo, pages)) throw new RangeError(`not pages lo to hi of ${pages}`)
  if (!Array.isArray(views) || views.length !== 4 * (hi - lo + 1)) throw new RangeError(`not the ${4 * (hi - lo + 1)} numbers of the views of pages ${lo} to ${hi}`)
  const f = exactKeys(value, withOptional(value, PART_KEYS), '')
  return checkRows(f, { views, lo, hi })
}

/**
 * The rows and tables of a layout file or part, from `fonts` to `names`: the pages a row names are `lo` to `hi`, and
 * `views` those pages' views (stride 4, from page lo). Bounds are of what `f` holds, so a part's are per part; `sized`
 * false, none of the four of what `f` holds in all (a whole file cut into parts)
 */
function checkRows(f, { views, lo, hi, sized = true }) {
  const span = { lo, hi }
  const fonts = array(f.fonts, 'fonts')
  if (sized && fonts.length > FONTS_MAX) throw new LayoutRefusal('fonts', `more than ${FONTS_MAX} names`, 'rows')
  for (let i = 0; i < fonts.length; i++) if (!printable(fonts[i], 1, FONT_MAX)) throw refuse(`fonts[${i}]`, `not 1 to ${FONT_MAX} printable ASCII characters (${kindOf(fonts[i])})`)

  // units: by id, their index in units; each unit's kind, pieces and line rows by that index
  const units = array(f.units, 'units'), n = units.length
  const slot = new Map(), kindAt = new Uint8Array(n), piecesAt = new Uint16Array(n), rowsAt = new Array(n).fill(null)
  let last = -1
  for (let i = 0; i < n; i++) {
    const u = units[i]
    if (!Array.isArray(u) || u.length !== 5) throw refuse(`units[${i}]`, `not [id, kind, depth, flags, pieces] (${kindOf(u)})`)
    const id = u[0], kind = u[1], depth = u[2], flags = u[3], pieces = u[4]
    if (!isInteger(id, last + 1, ID_MAX)) throw refuse(`units[${i}][0]`, 'not an id above the last')
    if (!isInteger(kind, 0, UNIT_KINDS.length - 1)) throw refuse(`units[${i}][1]`, 'not a kind of UNIT_KINDS')
    if (!isInteger(depth, DEPTH_MIN, DEPTH_MAX) && depth !== DEPTH_NONE) throw refuse(`units[${i}][2]`, `not a depth ${DEPTH_MIN} to ${DEPTH_MAX}, or ${DEPTH_NONE}`)
    if (!isInteger(flags, 0, UNIT_BITS)) throw refuse(`units[${i}][3]`, 'not flags of UNIT_FLAG')
    if (!isInteger(pieces, 0, PIECES_MAX)) throw refuse(`units[${i}][4]`, `not a count 0 to ${PIECES_MAX}`)
    zeroes(u)
    last = u[0]
    slot.set(last, i)
    kindAt[i] = kind
    piecesAt[i] = pieces
  }

  const lines = array(f.lines, 'lines'), nFonts = fonts.length
  let total = 0
  last = -1
  for (let i = 0; i < lines.length; i++) {
    const e = lines[i], u = entry(e, i, 'lines', last, slot, 8), r = e[1]
    if (r.length > 8 * LINES_UNIT) throw refuse(`lines[${i}][1]`, `more than ${LINES_UNIT} lines`)
    total += r.length / 8
    if (sized && total > LINES_ALL) throw new LayoutRefusal('lines', `more than ${LINES_ALL} lines`, 'rows')
    for (let j = 0; j < r.length; j += 8) {
      checkBox(r, j, 1, 2, 3, 4, 5, true, views, span, 'lines', i, 1)
      const size = r[j + 6]
      if (!isNumber(size) || size <= 0 || size > SIZE_MAX) throw refuse(at('lines', i, 1, j + 6), `not a size above 0 to ${SIZE_MAX} (${kindOf(size)})`)
      if (!isInteger(r[j + 7], 0, nFonts - 1)) throw refuse(at('lines', i, 1, j + 7), 'not an index of fonts')
    }
    zeroes(r)
    if (e[0] === 0) e[0] = 0
    last = e[0]
    rowsAt[u] = r
  }

  // frames: page, column, first line, lines, share, below. They cover the unit's lines in order, each on its page
  const frames = array(f.frames, 'frames'), framed = new Uint8Array(n)
  last = -1
  for (let i = 0; i < frames.length; i++) {
    const e = frames[i], u = entry(e, i, 'frames', last, slot, 6), r = e[1], own = rowsAt[u]
    if (own === null) throw refuse(`frames[${i}][0]`, 'a unit without lines')
    const count = own.length / 8
    let next = 0, share = -1
    for (let j = 0; j < r.length; j += 6) {
      const page = r[j]
      if (!isInteger(page, lo, hi)) throw refuse(at('frames', i, 1, j), `not a page ${lo} to ${hi}`)
      const column = r[j + 1]
      if (column !== 0 && column !== 1 && column !== 2) throw refuse(at('frames', i, 1, j + 1), 'not a column 0, 1 or 2')
      if (r[j + 2] !== next) throw refuse(at('frames', i, 1, j + 2), j === 0 ? 'not 0' : "not the line after the last frame's")
      const k = r[j + 3]
      if (!isInteger(k, 1, count - next)) throw refuse(at('frames', i, 1, j + 3), "not 1 to the unit's lines left")
      for (let l = next; l < next + k; l++) if (own[8 * l] !== page) throw refuse(at('frames', i, 1, j), 'not the page of its lines')
      const s = r[j + 4]
      if (j === 0 ? s !== -1 : !isInteger(s, Math.max(share, 0), SHARE_MAX)) throw refuse(at('frames', i, 1, j + 4), j === 0 ? 'not -1 for the first frame' : `not a share from the last to ${SHARE_MAX}`)
      share = s
      const below = r[j + 5], v = 4 * (page - lo)
      if (!isNumber(below) || below < 0 || below > views[v + 3] - views[v + 1]) throw refuse(at('frames', i, 1, j + 5), `not 0 to its page's height (${kindOf(below)})`)
      next += k
    }
    if (next !== count) throw refuse(`frames[${i}][1]`, "not covering the unit's lines")
    zeroes(r)
    if (e[0] === 0) e[0] = 0
    last = e[0]
    framed[u] = 1
  }
  for (let u = 0; u < n; u++) if (rowsAt[u] !== null && framed[u] === 0) throw refuse('frames', `none for unit ${units[u][0]}, which has lines`)

  // erase: line, x0, y0, x1, y1, on the line's page
  const erase = array(f.erase, 'erase'), erasedLines = new Map()
  last = -1
  for (let i = 0; i < erase.length; i++) {
    const e = erase[i], u = entry(e, i, 'erase', last, slot, 5), r = e[1], own = rowsAt[u]
    if (own === null) throw refuse(`erase[${i}][0]`, 'a unit without lines')
    const count = own.length / 8, onLine = new Uint8Array(count)
    for (let j = 0; j < r.length; j += 5) {
      const line = r[j]
      if (!isInteger(line, 0, count - 1)) throw refuse(at('erase', i, 1, j), "not a line of the unit's")
      if (++onLine[line] > ERASE_LINE) throw refuse(at('erase', i, 1, j), `more than ${ERASE_LINE} rectangles on its line`)
      ;(erasedLines.get(u) ?? erasedLines.set(u, new Set()).get(u)).add(line)
      const v = 4 * (own[8 * line] - lo)
      const xlo = views[v] - SLACK, ylo = views[v + 1] - SLACK, xhi = views[v + 2] + SLACK, yhi = views[v + 3] + SLACK
      for (let c = 1; c <= 4; c++) {
        const x = r[j + c], lo = c % 2 === 1 ? xlo : ylo, hi = c % 2 === 1 ? xhi : yhi
        if (!isNumber(x) || x < lo || x > hi) throw refuse(at('erase', i, 1, j + c), `not a number within its line's view (${kindOf(x)})`)
        if (c >= 3 && x <= r[j + c - 2]) throw refuse(at('erase', i, 1, j + c), 'an empty rectangle')
      }
    }
    zeroes(r)
    if (e[0] === 0) e[0] = 0
    last = e[0]
  }

  // placeholders: unit, k, kind, flags, then per segment: page, x0, baseline, x1, top, bottom; then, where its glyphs are not
  // black, their fill (MIXED_FILL, or 0xRRGGBB): only a placeholder with segments has one
  const ph = array(f.ph, 'ph'), seen = new Set(), pageTexts = new Set(), symbols = new Set()
  for (let i = 0; i < ph.length; i++) {
    const r = ph[i]
    if (!Array.isArray(r) || r.length < 4 || (r.length - 4) % 6 > 1) throw refuse(`ph[${i}]`, `not 4 + 6 × n numbers, and a fill (${kindOf(r)})`)
    const fill = (r.length - 4) % 6 === 1
    if (fill && !(r.length > 4 + 6 && isInteger(r.at(-1), MIXED_FILL, FILL_MAX))) throw refuse(`ph[${i}][${r.length - 1}]`, `not a fill of a placeholder with segments: ${MIXED_FILL} or 0 to ${FILL_MAX}`)
    const u = slot.get(r[0])
    if (u === undefined) throw refuse(`ph[${i}][0]`, 'not a unit of units')
    const k = r[1]
    if (!isInteger(k, 0, piecesAt[u] - 1)) throw refuse(`ph[${i}][1]`, "not a piece below its unit's pieces")
    const key = u * (PIECES_MAX + 1) + k
    if (seen.has(key)) throw refuse(`ph[${i}][1]`, 'a piece twice in its unit')
    seen.add(key)
    const kind = r[2], flags = r[3]
    if (!isInteger(kind, 0, PH_KINDS.length - 1)) throw refuse(`ph[${i}][2]`, 'not a kind of PH_KINDS')
    if (!isInteger(flags, 0, PH_BITS)) throw refuse(`ph[${i}][3]`, 'not flags of PH_FLAG')
    const empty = (flags & PH_FLAG.EMPTY) !== 0, lost = (flags & PH_FLAG.LOST) !== 0, symbol = (flags & PH_FLAG.TEXT) !== 0, joined = (flags & PH_FLAG.JOINED) !== 0
    if (empty && lost) throw refuse(`ph[${i}][3]`, 'EMPTY and LOST together')
    if (joined && (flags !== PH_FLAG.JOINED || kind !== DISPLAY || r.length !== 4)) throw refuse(`ph[${i}]`, 'JOINED but on a display alone, with no other flag and no segments')
    if ((flags & PH_FLAG.OUTSIDE) !== 0 && flags !== (PH_FLAG.LOST | PH_FLAG.OUTSIDE)) throw refuse(`ph[${i}][3]`, 'OUTSIDE but not LOST alone')
    if (symbol && (empty || lost || kind !== MACRO || r.length !== 4)) throw refuse(`ph[${i}]`, 'TEXT but on a macro alone, with no segments')
    if ((flags & PH_FLAG.NUMBERED) !== 0 && kind !== DISPLAY) throw refuse(`ph[${i}][3]`, 'NUMBERED on a kind not display')
    const segs = Math.floor((r.length - 4) / 6), most = kind === DISPLAY ? SEGS_DISPLAY : SEGS_INLINE
    if (empty || lost || symbol || joined ? segs !== 0 : segs < 1 || segs > most) throw refuse(`ph[${i}]`, empty || lost || symbol || joined ? 'segments on an EMPTY, LOST, TEXT or JOINED placeholder' : `not 1 to ${most} segments`)
    for (let o = 4; o + 5 < r.length; o += 6) checkBox(r, o, 1, 3, 2, 4, 5, false, views, span, 'ph', i, -1)
    zeroes(r)
    if (!empty && !lost && !joined && PAGE_TEXT.has(kind)) pageTexts.add(key)
    if (symbol) { pageTexts.add(key); symbols.add(key) }
  }

  // labels: unit, kind, page, x0, baseline, x1, top, bottom, a rectangle as a line's
  const labels = array(f.labels, 'labels'), onUnit = new Uint8Array(n)
  for (let i = 0; i < labels.length; i++) {
    const r = labels[i]
    if (!Array.isArray(r) || r.length !== 8) throw refuse(`labels[${i}]`, `not [unit, kind, page, x0, baseline, x1, top, bottom] (${kindOf(r)})`)
    const u = slot.get(r[0])
    if (u === undefined) throw refuse(`labels[${i}][0]`, 'not a unit of units')
    if (++onUnit[u] > LABELS_UNIT) throw refuse(`labels[${i}][0]`, `more than ${LABELS_UNIT} labels on its unit`)
    if (!isInteger(r[1], 0, LABEL_KINDS.length - 1)) throw refuse(`labels[${i}][1]`, 'not a kind of LABEL_KINDS')
    checkBox(r, 2, 1, 3, 2, 4, 5, true, views, span, 'labels', i, -1)
    zeroes(r)
  }

  const headings = array(f.headings, 'headings'), named = new Uint8Array(n)
  for (let i = 0; i < headings.length; i++) {
    const e = headings[i]
    if (!Array.isArray(e) || e.length !== 2) throw refuse(`headings[${i}]`, `not [id, src] (${kindOf(e)})`)
    const u = slot.get(e[0])
    if (u === undefined) throw refuse(`headings[${i}][0]`, 'not a unit of units')
    if (kindAt[u] !== HEADING) throw refuse(`headings[${i}][0]`, 'not a heading unit')
    if (named[u] === 1) throw refuse(`headings[${i}][0]`, 'a heading twice')
    named[u] = 1
    const src = e[1]
    if (typeof src !== 'string' || src.length > SRC_MAX) throw refuse(`headings[${i}][1]`, `not a string of at most ${SRC_MAX} code units (${kindOf(src)})`)
    if (e[0] === 0) e[0] = 0
  }

  // page texts: unit, k, its own text; of a found placeholder of a page-text kind, rising by unit and k
  const texts = array(f.pageText, 'pageText')
  let lastKey = -1, all = 0
  for (let i = 0; i < texts.length; i++) {
    const e = texts[i]
    if (!Array.isArray(e) || e.length !== 3) throw refuse(`pageText[${i}]`, `not [id, k, text] (${kindOf(e)})`)
    const u = slot.get(e[0])
    if (u === undefined) throw refuse(`pageText[${i}][0]`, 'not a unit of units')
    if (u * (PIECES_MAX + 1) < Math.floor(lastKey / (PIECES_MAX + 1)) * (PIECES_MAX + 1)) throw refuse(`pageText[${i}][0]`, 'not a unit from the last on')
    const key = u * (PIECES_MAX + 1) + e[1]
    if (!isInteger(e[1], 0, PIECES_MAX) || !pageTexts.has(key)) throw refuse(`pageText[${i}][1]`, 'not a found placeholder of a page-text kind, nor a TEXT one')
    if (key <= lastKey) throw refuse(`pageText[${i}][1]`, 'not a piece above the last')
    lastKey = key
    const text = e[2]
    if (!isPageText(text)) throw refuse(`pageText[${i}][2]`, `not 1 to ${TEXT_MAX} code units of text (${kindOf(text)})`)
    all += text.length
    if (sized && all > PAGE_TEXT_ALL) throw new LayoutRefusal('pageText', `more than ${PAGE_TEXT_ALL} code units`, 'rows')
    if (e[0] === 0) e[0] = 0
    symbols.delete(key)
  }
  if (symbols.size) throw refuse('pageText', 'a TEXT placeholder with no text')

  // held: a unit's lines its source does not write (no slot, never erased), by index rising, never its first; none
  // erased
  const held = array(f.held, 'held')
  last = -1
  for (let i = 0; i < held.length; i++) {
    const e = held[i], u = entry(e, i, 'held', last, slot, 1), r = e[1], own = rowsAt[u]
    if (own === null) throw refuse(`held[${i}][0]`, 'a unit without lines')
    const count = own.length / 8
    let prev = 0
    for (let j = 0; j < r.length; j++) {
      if (!isInteger(r[j], prev + 1, count - 1)) throw refuse(at('held', i, 1, j), "not a line of the unit's after the last, nor its first")
      if (erasedLines.get(u)?.has(r[j])) throw refuse(at('held', i, 1, j), 'a line with an erase')
      prev = r[j]
    }
    if (e[0] === 0) e[0] = 0
    last = e[0]
  }

  // names: occurrence, key, page, x0, baseline, x1, top, bottom, size, font, flags, unit, glue, column x0, column x1; by
  // occurrence rising, at most NAMES_MAX, each a rectangle as a line's. unit: the unit a RUN_IN name leads (one of the
  // file's), else -1; glue: the original's space between its joint and the unit's text (0 where not RUN_IN); the column:
  // its TeX column's text edges on the page, the room a name has
  const names = array(f.names, 'names')
  if (sized && names.length > NAMES_MAX) throw new LayoutRefusal('names', `more than ${NAMES_MAX} names`, 'rows')
  last = -1
  for (let i = 0; i < names.length; i++) {
    const r = names[i]
    if (!Array.isArray(r) || r.length !== NAME_ROW) throw refuse(`names[${i}]`, `not [occurrence, key, page, x0, baseline, x1, top, bottom, size, font, flags, unit, glue, column x0, column x1] (${kindOf(r)})`)
    if (!isInteger(r[0], last + 1, ID_MAX)) throw refuse(`names[${i}][0]`, 'not an occurrence above the last')
    if (!isInteger(r[1], 0, NAME_KEYS.length - 1)) throw refuse(`names[${i}][1]`, 'not a key of NAME_KEYS')
    checkBox(r, 2, 1, 3, 2, 4, 5, true, views, span, 'names', i, -1)
    const size = r[8]
    if (!isNumber(size) || size <= 0 || size > SIZE_MAX) throw refuse(`names[${i}][8]`, `not a size above 0 to ${SIZE_MAX} (${kindOf(size)})`)
    if (!isInteger(r[9], 0, nFonts - 1)) throw refuse(`names[${i}][9]`, 'not an index of fonts')
    if (!isInteger(r[10], 0, NAME_BITS)) throw refuse(`names[${i}][10]`, 'not flags of NAME_FLAG')
    const runIn = (r[10] & NAME_FLAG.RUN_IN) !== 0, v = 4 * (r[2] - lo), width = views[v + 2] - views[v]
    if (runIn ? !(isInteger(r[11], 0, ID_MAX) && slot.has(r[11])) : r[11] !== -1) throw refuse(`names[${i}][11]`, runIn ? 'not a unit of the file' : 'not -1, the name leading no unit')
    if (!isNumber(r[12]) || r[12] < 0 || r[12] > width || (!runIn && r[12] !== 0)) throw refuse(`names[${i}][12]`, runIn ? 'not a glue 0 to the page\'s width' : 'not 0, the name leading no unit')
    if (!isNumber(r[13]) || !isNumber(r[14]) || r[13] < views[v] - 1 || r[14] > views[v + 2] + 1 || r[13] >= r[14]) throw refuse(`names[${i}][13]`, "not a column's edges on the page")
    zeroes(r)
    last = r[0]
  }

  // colours: unit, k, the fill TeX set the colour piece's run in (0xRRGGBB); rising by unit and k, a key held only with a row
  if (Object.hasOwn(f, COLOURS)) {
    const colours = array(f.colours, COLOURS)
    if (colours.length === 0) throw refuse(COLOURS, 'empty: a file holds the key only where it has a row')
    let lastKey = -1
    for (let i = 0; i < colours.length; i++) {
      const r = colours[i]
      if (!Array.isArray(r) || r.length !== 3) throw refuse(`colours[${i}]`, `not [unit, k, rgb] (${kindOf(r)})`)
      const u = slot.get(r[0])
      if (u === undefined) throw refuse(`colours[${i}][0]`, 'not a unit of units')
      if (!isInteger(r[1], 0, piecesAt[u] - 1)) throw refuse(`colours[${i}][1]`, "not a piece below its unit's pieces")
      const key = u * (PIECES_MAX + 1) + r[1]
      if (key <= lastKey) throw refuse(`colours[${i}][1]`, 'not a piece after the last')
      lastKey = key
      if (!isInteger(r[2], 0, FILL_MAX)) throw refuse(`colours[${i}][2]`, `not a fill 0 to ${FILL_MAX}`)
      zeroes(r)
    }
  }

  // unlaid: unit, code (UNLAID); by unit rising, none of them a unit of units, a key held only with a row
  if (Object.hasOwn(f, UNLAID_KEY)) {
    const unlaid = array(f.unlaid, UNLAID_KEY)
    if (unlaid.length === 0) throw refuse(UNLAID_KEY, 'empty: a file holds the key only where it has a row')
    if (sized && unlaid.length > UNLAID_ALL) throw new LayoutRefusal(UNLAID_KEY, `more than ${UNLAID_ALL} units`, 'rows')
    last = -1
    for (let i = 0; i < unlaid.length; i++) {
      const r = unlaid[i]
      if (!Array.isArray(r) || r.length !== 2) throw refuse(`unlaid[${i}]`, `not [unit, code] (${kindOf(r)})`)
      if (!isInteger(r[0], last + 1, ID_MAX)) throw refuse(`unlaid[${i}][0]`, 'not an id above the last')
      if (slot.has(r[0])) throw refuse(`unlaid[${i}][0]`, 'a unit of units: one the file lays')
      if (!UNLAID.includes(r[1])) throw refuse(`unlaid[${i}][1]`, `not a code of UNLAID (${typeof r[1] === 'string' ? clip(r[1]) : kindOf(r[1])})`)
      if (r[0] === 0) r[0] = 0
      last = r[0]
    }
  }
  return f
}

// ---------------------------------------------------------------- the writer
const r2 = v => Math.round(v * 100) / 100
/** rows of `stride` with the coordinates (offsets `exact` excepted) to a hundredth */
const rounded = (rows, stride, exact) => rows.map((v, j) => (exact.includes(j % stride) ? v : r2(v)))
const LINE_EXACT = [0, 7], FRAME_EXACT = [0, 1, 2, 3, 4], ERASE_EXACT = [0], LABEL_EXACT = [0, 1, 2], NAME_EXACT = [0, 1, 2, 9, 10, 11]

/** the rows and tables of a file or a part as written, from `fonts` to `names`: numbers to a hundredth */
function rowsOf(file) {
  const { fonts, units, lines, frames, erase, ph, labels, headings, pageText, held, names } = file
  return {
    fonts,
    units,
    lines: lines.map(([id, rows]) => [id, rounded(rows, 8, LINE_EXACT)]),
    frames: frames.map(([id, rows]) => [id, rounded(rows, 6, FRAME_EXACT)]),
    erase: erase.map(([id, rows]) => [id, rounded(rows, 5, ERASE_EXACT)]),
    // unit, k, kind and flags as they are; each segment's page too
    ph: ph.map(r => r.map((v, j) => (j < 4 || (j - 4) % 6 === 0 ? v : r2(v)))),
    labels: labels.map(r => rounded(r, 8, LABEL_EXACT)),
    headings,
    pageText,
    held,
    names: names.map(r => rounded(r, NAME_ROW, NAME_EXACT)),
    // (only where a unit has one: a file with no colour piece is the bytes it was)
    ...(file.colours?.length ? { colours: file.colours } : {}),
    // (only where a unit is not laid)
    ...(file.unlaid?.length ? { unlaid: file.unlaid } : {}),
  }
}

/** the file as written: keys in the schema's order, numbers to a hundredth, no white space */
export function encodeLayout(file) {
  const { schema, layout, pdfjs, paper, left, views, lineskip } = file
  return JSON.stringify({
    schema, layout, pdfjs,
    paper: { id: paper.id, version: paper.version, pages: paper.pages },
    left,
    views: views.map(r2),
    ...rowsOf(file),
    lineskip: lineskip === null ? null : lineskip.map(r2),
  })
}

/** a layout part as it is written, keys in PART_KEYS' order, numbers to a hundredth: the object (a writer checks it with
 *  checkLayoutPart before it stringifies it) */
export function layoutPartRows(part) {
  return rowsOf(part)
}

/** a layout part as written: encodeLayout's own encoders for the keys it keeps, no white space */
export function encodeLayoutPart(part) {
  return JSON.stringify(rowsOf(part))
}

/**
 * The parts' layouts as one: each key's rows by unit id (`ph` and `pageText` by unit and piece, `names` by occurrence;
 * `labels` by unit, a unit's own labels in the order given), and the fonts table anew, by the first appearance of a name in
 * the merged rows (the lines by unit id, then the names by occurrence) with every row's font index set to it: a part's table
 * is its own. The layout maker builds the whole file's table in that order, so parts cut from a file merge back to it. A
 * font in no row is left out. The parts are not changed
 */
export function mergeLayout(parts) {
  const out = { units: [], frames: [], erase: [], ph: [], labels: [], headings: [], pageText: [], held: [], colours: [], unlaid: [] }
  const lineList = [], nameList = []
  for (const p of parts) {
    for (const key of Object.keys(out)) for (const row of p[key] ?? []) out[key].push(row)
    for (const e of p.lines) lineList.push([e, p.fonts])
    for (const r of p.names) nameList.push([r, p.fonts])
  }
  const byId = (a, b) => a[0] - b[0]
  for (const key of ['units', 'frames', 'erase', 'headings', 'held', 'labels', 'unlaid']) out[key].sort(byId)
  out.ph.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  out.pageText.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  out.colours.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const fonts = [], index = new Map()
  const fontAt = (table, i) => {
    const name = table[i]
    let at = index.get(name)
    if (at === undefined) { at = fonts.length; index.set(name, at); fonts.push(name) }
    return at
  }
  lineList.sort((a, b) => a[0][0] - b[0][0])
  const lines = lineList.map(([[id, rows], table]) => {
    const out = rows.slice()
    for (let j = 7; j < out.length; j += 8) out[j] = fontAt(table, rows[j])
    return [id, out]
  })
  nameList.sort((a, b) => a[0][0] - b[0][0])
  const names = nameList.map(([r, table]) => {
    const out = r.slice()
    out[9] = fontAt(table, r[9])
    return out
  })
  return { fonts, units: out.units, lines, frames: out.frames, erase: out.erase, ph: out.ph, labels: out.labels, headings: out.headings, pageText: out.pageText, held: out.held, names, ...(out.colours.length ? { colours: out.colours } : {}), ...(out.unlaid.length ? { unlaid: out.unlaid } : {}) }
}

// ---------------------------------------------------------------- the index
const NONE = Object.freeze(new Float64Array(0))
const NO_UNITS = Object.freeze([])
const NO_HELD = Object.freeze([])
const NO_NAMES = Object.freeze([])
const NO_COLOURS = Object.freeze(new Map())

/** a parsed file's index, in one pass over each array; every typed array holds numbers copied from the file */
export function indexLayout(file) {
  const { units, lines, frames, erase, ph, labels, headings, views, fonts, pageText, held, names } = file
  const pages = file.paper.pages
  const byId = new Map()
  for (let i = 0; i < units.length; i++) {
    const [id, kind, depth, flags, pieces] = units[i]
    byId.set(id, {
      id, kind: UNIT_KINDS[kind], depth,
      title: (flags & UNIT_FLAG.TITLE) !== 0, front: (flags & UNIT_FLAG.FRONT) !== 0, centred: (flags & UNIT_FLAG.CENTRED) !== 0,
      pieces, lines: NONE, frames: NONE, erase: [], ph: new Map(), labels: NONE, heading: null, held: NO_HELD, colours: NO_COLOURS,
    })
  }
  for (let i = 0; i < lines.length; i++) {
    const unit = byId.get(lines[i][0]), rows = lines[i][1]
    unit.lines = Float64Array.from(rows)
    unit.erase = new Array(rows.length / 8).fill(NONE)
  }
  // a unit is listed once on a page however many frames it has there: ids rise, so its pushes to a page are adjacent
  const onPage = new Array(pages + 1).fill(NO_UNITS)
  for (let i = 0; i < frames.length; i++) {
    const id = frames[i][0], rows = frames[i][1]
    byId.get(id).frames = Float64Array.from(rows)
    for (let j = 0; j < rows.length; j += 6) {
      const p = rows[j]
      if (onPage[p] === NO_UNITS) onPage[p] = []
      const list = onPage[p]
      if (list[list.length - 1] !== id) list.push(id)
    }
  }
  for (let p = 1; p <= pages; p++) Object.freeze(onPage[p])
  for (let i = 0; i < erase.length; i++) {
    const unit = byId.get(erase[i][0]), rows = erase[i][1], perLine = []
    for (let j = 0; j < rows.length; j += 5) (perLine[rows[j]] ??= []).push(rows[j + 1], rows[j + 2], rows[j + 3], rows[j + 4])
    for (let l = 0; l < perLine.length; l++) if (perLine[l] !== undefined) unit.erase[l] = Float64Array.from(perLine[l])
  }
  const textOf = new Map()
  for (let i = 0; i < pageText.length; i++) textOf.set(`${pageText[i][0]}|${pageText[i][1]}`, pageText[i][2])
  for (let i = 0; i < ph.length; i++) {
    const r = ph[i], n = 6 * Math.floor((r.length - 4) / 6), segs = new Float64Array(n)
    for (let j = 0; j < n; j++) segs[j] = r[4 + j]
    // (`fill`: its glyphs' colour, 0xRRGGBB, MIXED_FILL, or null where they are black: what the layer draws its rendering in)
    byId.get(r[0]).ph.set(r[1], { kind: PH_KINDS[r[2]], flags: r[3], segs, text: textOf.get(`${r[0]}|${r[1]}`) ?? null, fill: 4 + n < r.length ? r[4 + n] : null })
  }
  const labelsOf = new Map()
  for (let i = 0; i < labels.length; i++) {
    const r = labels[i], id = r[0]
    let list = labelsOf.get(id)
    if (list === undefined) labelsOf.set(id, (list = []))
    for (let j = 1; j < 8; j++) list.push(r[j])
  }
  for (const [id, list] of labelsOf) byId.get(id).labels = Float64Array.from(list)
  for (let i = 0; i < headings.length; i++) byId.get(headings[i][0]).heading = headings[i][1]
  for (let i = 0; i < held.length; i++) byId.get(held[i][0]).held = Object.freeze([...held[i][1]])
  // (each colour piece's run's fill, by its piece index: what the layer draws the run in)
  for (const [id, k, rgb] of file.colours ?? []) { const unit = byId.get(id); if (unit.colours === NO_COLOURS) unit.colours = new Map(); unit.colours.set(k, rgb) }
  for (const unit of byId.values()) {
    Object.freeze(unit.erase)
    Object.freeze(unit)
  }
  // each page's names, in the file's order
  const namesOn = new Array(pages + 1).fill(NO_NAMES)
  for (let i = 0; i < names.length; i++) {
    const r = names[i], p = r[2]
    if (namesOn[p] === NO_NAMES) namesOn[p] = []
    namesOn[p].push(Object.freeze({ occurrence: r[0], key: NAME_KEYS[r[1]], page: p, x0: r[3], baseline: r[4], x1: r[5], top: r[6], bottom: r[7], size: r[8], font: r[9], centred: (r[10] & NAME_FLAG.CENTRED) !== 0, capitals: (r[10] & NAME_FLAG.CAPITALS) !== 0, unit: r[11], glue: r[12], cx0: r[13], cx1: r[14] }))
  }
  for (let p = 1; p <= pages; p++) Object.freeze(namesOn[p])
  const viewOf = new Array(pages + 1)
  for (let p = 1; p <= pages; p++) viewOf[p] = Object.freeze(views.slice(4 * (p - 1), 4 * p))
  return Object.freeze({
    file,
    unit: id => byId.get(id) ?? null,
    onPage: page => onPage[page] ?? NO_UNITS,
    names: page => namesOn[page] ?? NO_NAMES,
    view: page => {
      const v = Number.isInteger(page) ? viewOf[page] : undefined
      if (v === undefined) throw new RangeError('not a page of the file')
      return v
    },
    font: index => {
      if (!Number.isInteger(index) || index < 0 || index >= fonts.length) throw new RangeError('not a font of the file')
      return fonts[index]
    },
  })
}

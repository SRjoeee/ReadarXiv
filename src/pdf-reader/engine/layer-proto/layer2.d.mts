// layer2.mjs's types: the layer v0 itself, iterations 2 and 3 (ported from the prototype at 9e56fca). Its values are the
// prototype's own plain objects; what a host or a test reads of them is typed, the rest is left open.
import type { Audit } from './check.mjs'
import type { Face, FontClass, Style } from './fonts.mjs'
import type { Patterns } from './hyph.mjs'
import type { Block, Rect } from './layer1.mjs'

/** the fit's parameters and the breaking's: the layout rules' for a target (rules/layout.mjs resolveRules), the field names
 *  v0's own. `maxScale`, `capScale`, `growTo`, `flowPast`, `refuse`, `lineskip` and `_compress` are the run's own, set unit by unit */
export interface Params {
  cjk: boolean; leadBase: number; leadFloor: number; trackMin: number; compressMax: 0 | 1 | 2; borrow: 0 | 1; borrowGap: number
  floor: number; step: number; order: ('track' | 'borrow' | 'lead' | 'shrink')[]; cjkJust: number; spaceMax: number; autospace: number; spaceMin: number
  hyphen: 0 | 1; even: 0 | 1 | 2; maxScale?: number; _compress?: number
  /** the most the unit may be set at: its lines' room between the rules over and under them (cellBands) */
  capScale?: number
  /** step 3: the further steps for a unit the states leave clipped (run.mjs fitFurther), and the size the last goes down to */
  further: readonly ('widen' | 'flow' | 'shrink')[]; floorMin: number; refuse?: number; flowPast?: boolean
  /** the paper's \lineskip and \lineskiplimit, PDF units (the layout file's, TeX's): a line nearer the one before it than
   *  the limit is set the two's depth and height plus lineskip apart (breakLines); null: no line opens (the run's own) */
  lineskip?: readonly [number, number] | null
  /** a section heading (run.mjs): set in fewer lines than the original's, its lines stand on the original's last ones (laidOut) */
  lastLines?: boolean
  /** step 3: the CJK runs' tracking the fit's first state takes, in em; null: a face's size correction given back (run.mjs) */
  trackStart: number | null
  /** a run of a unit split by its displays (layoutRuns): the fit's first state takes its unit's tracking, the tightest its
   *  runs need (and its CJK punctuation's compression) */
  runTrack?: { track: number; trackLatin: number; compress: number }
  /** the leading relative to the original's pitch (leadOf; false: leadBase on any pitch); fillBySize's cap (run.mjs
   *  fillSize, off at 0) and the size a unit may grow to (growTo) */
  leadRel: boolean; fillSize: number; growTo?: number
  /** run.mjs's adaptiveFill (the page fill, D6's since 2026-10-08; null: B): every unit spread over its frame, the page's
   *  body units held to one leading and one size; and the loosest pitch it spreads to, in em of the size drawn (null: the
   *  original's own) */
  adaptiveFill: { band: number; track: number; size: number } | null; fillLead: number | null; fillLeadRel: number | null
  /** what the fill leaves over: at each unit's foot, or packed to the end of its run of paragraphs (run.mjs packPage) */
  leftover: 'foot' | 'pack'
  /** at the original's leading, a block's lines one pitch apart, its gaps TeX's \lineskip rule opened closed (slotsAt on the blocks' `E`) */
  evenPitch: boolean
  /** a unit TeX set flush left or flush right keeps that alignment (run.mjs sets its blocks' `flush`, placeItems reads it) */
  keepAlign: boolean
  /** breaking: lines break only at spaces, which quotes are CJK's, centred punctuation, the characters no line starts or
   *  ends with, and the hyphenation patterns of a Latin word */
  keepAll: boolean; cjkQuotes: boolean; centredPunct: boolean; noStart: string; noEnd: string; latinPatterns: 'en' | 'de'
  /** a table cell's room to a rule (PDF units) and the least share of the size it may be capped to between its rules */
  cellClear: number; cellCapMin: number
  /** the unit's edges (run.mjs edgesOf; layer2.mjs footFloorAt): whether its first line and its last share their baseline
   *  with no ink that stays (`head`, `foot`), and the original's room from its last baseline down to the next line of its
   *  column (`below`, PDF units; Infinity where nothing is under it), which the page fill keeps its last line a leading over;
   *  none (a table cell, a caller of its own): its lines as slotted */
  halfLead?: { head: boolean; foot: boolean; below: number } | null
  /** the shortest word hyphenated, and the fewest letters before and after a break, by language */
  hyphenation: { minWord: number; en: { left: number; right: number }; de: { left: number; right: number } }
}
/** a character of the original page: its box from its item (PDF units), its baseline and size, its item and place in it,
 *  its font's class */
/** a page character (pageChars2's); `nu`: no Unicode of the file's stands for its glyph (its text is no reading of it); its
 *  style's `fill`, its glyph's colour (0xRRGGBB) where the page's reading tells it (layout/fills.mjs), else none */
export interface Char { ch: string; x0: number; x1: number; yb: number; size: number; item: number; ix: number; k: number; st: FontClass & { fill?: number }; ybEff?: number; page?: number; rect?: number[]; sep?: boolean; space?: boolean; nu?: boolean }
/** a unit of the units file, as the layer reads it */
export interface Unit { kind: string; src: string; pieces: { t: string; s?: string; src?: string }[]; state?: string; title?: boolean; group?: string
  /** the unit's source pieces, where the rows made it (rows.mjs unitOf: not enumerable), that its measured style reads */
  readonly source?: readonly { t: string; s?: string; src?: string; k?: number }[] }
// ---- the per-unit reading (prepareUnit): the contract the rest of v0 reads
//
// A line's key is `page|x0,y0,x1,y1` of its rectangle (rectKey); a page character's is `page|item|k` (charKey). The
// rest of v0 reads a Prepared and nothing else of how it was made: blocks2 (lineInfo, keep, regionOf, referenced), the
// tokens (the resolutions, referenced), the drawing (extents), the restore (uc, cat), the gate's lost ink (uc, cat,
// lineInfo) and the checker (the resolutions, uc, gaps, keep, label, cat). Each field is filled by one part; the parts that
// read the page's geometry (lines, extents, label, renderings, crops) are the layout file's (UnitParts), the rest read the
// page's characters.

/** a run of the unit's page characters: a gap (what its source does not write: a placeholder's rendering, a label), or a
 *  placeholder's rendering as its source found it. `of`: the gap it was cut from; `box`: where its ink is, where its
 *  source knows it exactly (drawnAs places a crop by it) */
export interface Gap {
  text: string; chars: Char[]; of?: Gap; unbracketed?: boolean; norm?: string; taken?: boolean; box?: RenderingBox
  /** a later display of a display group, its rendering the group's lines kept where they stand (tex.mjs texParts): those lines' keys */
  held?: string[]
}
/** a rendering's ink as its source knows it: its extent across, the baseline of the line it sits on, its lines */
export interface RenderingBox { x0: number; x1: number; top?: number; bottom?: number; baseline: number; lines: number; segs?: ArrayLike<number> }   // segs: a layout file's segments (stride 6), a formula broken over lines cropped by them
/** a crop of one line of a formula's segments (cropPartsOfSegments): its page, its rectangle and baseline, the union as a segment */
export interface CropPart { page: number; crop: number[]; baseline: number; seg: RenderingBox & { top: number; bottom: number } }
/** a placeholder of the unit by its piece index `k` (placeholdersOf): its source, its class (phClassProven), whether it is a
 *  paper's own macro, a nested footnote's mark; a citation's keys */
export interface Placeholder { k: number; src: string; cls: string; unknown?: boolean; nested?: boolean; keys?: string[] }
/** the paper's citations as learnt in lay order (a key's number), an author-year key's text, a macro's rendering */
export type CiteMap = Map<string, string | undefined> & { text?: Map<string, string>; macros?: Map<string, string> }
/** a line's baseline and size: measured from its characters or given exactly (exact; by a layout file, file), else from its rectangle */
/** a line's measured baseline and size; a layout file's line (`file`) also says its place in the file, `j` its index and
 *  `frame` its page's column */
export interface LineInfo { baseline: number; size: number; top?: number; bottom?: number; exact: boolean; file?: boolean; j?: number; frame?: number }
/** a line's erase extent, before the drawing's padding: one box [x0, y0, x1, y1], or several */
export type Extent = number[] | number[][]
/** a placeholder's resolution: how it is drawn ('none', 'symbol', 'kept', 'crop', 'orig-text', 'cite-map', 'source'),
 *  with its placeholder (k, src, cls) and the rendering it took (gap) */
export interface Resolved { mode: string; text?: string; k?: number; src?: string; cls?: string; page?: number; crop?: number[]; baseline?: number; sup?: boolean; math?: boolean; gap?: Gap | null; region?: number; parts?: CropPart[]; part?: number; [more: string]: unknown }   // parts: a crop's, one a line of a formula TeX broke over lines (its first part's page, crop and baseline its own); part: a part's index, cropPartsOf's
/** prepareUnit's answer: each placeholder's resolution by its piece's index, with the unit's reading of the page */
export interface Prepared extends Map<number, Resolved> {
  /** where each later page of the unit begins in its source (pageStartsOf, E3c): by page, the plain source's UTF-16 offset */
  pageStarts?: Map<number, number>
  /** part 1, frames and lines: the unit's page characters line by line (each with its line, `rect`), a space between
   *  two items or two lines of one rectangle, a separator after each line */
  uc: Char[]
  /** part 1: each line's baseline and size, by its key (and by its key without x0) */
  lineInfo: Map<string, LineInfo>
  /** part 2, erase extents: each line's box (or boxes) to erase, by its rectangle */
  extents: Map<Rect, Extent>
  /** the alignment: the page characters that are the source's words */
  matchedKeys: Set<string>
  /** the alignment: the original's style (the majority of the source's words) */
  orig: { key: string; st: FontClass; size: number; runs: { key: string; n: number }[] } | null
  /** the alignment: the unit's base style and its colour pieces' colours measured on its matched glyphs (measuredStyle; `st`
   *  null where the unit carries no source pieces, its colour then told only where every glyph whose fill is told holds one) */
  measured?: { st: { bold: boolean; italic: boolean; caps: boolean; fam: string; design?: string } | null; fill: number | null; pieces: Map<number, number> } | null
  /** the alignment: the share of the size its faked small capitals are set at, of its capitals' (smallCapsOf's `ratio`, to the
   *  hundredth), where it has any: what the layer draws its own small capitals at (tokensOf2) */
  capsRatio?: number
  /** the alignment: where the first source word starts on the first line */
  firstX0?: number
  /** the lines kept as the original's, by key: the alignment's (no source word), part 4's displays, the finish's */
  keep?: string[]
  /** part 3, labels: a label the class sets before the unit's first line, kept as the original's */
  label?: { x1: number; text: string; chars: Char[] }
  /** part 4: the gaps as the renderings left them (the checker's and the categories') */
  gaps?: Gap[]
  /** the finish: each kept line's region (a run of kept lines), and the regions a kept placeholder holds */
  regionOf: Map<string, number>
  referenced: Set<number>
  /** a source's forced breaks (tex.mjs forcedBreaks): each break piece's index to the file's line TeX set after it and
   *  TeX's room between the two (null: that line opens another frame) */
  breaks?: Map<number, { next: number; room: number | null; pitch: number | null }> | null
  /** the finish: a forced break whose next line opens another frame, its region (no lines of its own) by the key of that
   *  line, which its pieces hold (their resolutions' `region`, with `brk`) */
  breakAt?: Map<string, number>
  /** the finish: a forced break inside a frame, its frame's pitch by the key of the line after it (its pieces hold TeX's
   *  room after it: their resolutions' `room`, with `brk`): the rows on both sides one block, its gap closed to the pitch */
  joinAt?: Map<string, number>
  /** the finish: what became of each of the unit's page characters, by its key */
  cat: Map<string, 'acc' | 'keep' | 'orphan' | 'undrawn'>
  /** the finish: the class's own marks after the unit's text, which its source does not write (a theorem's note's ")."),
   *  each with its character's style: drawn after the translation (tokensOf2) */
  tail?: { ch: string; st: Style | null }[] | null
  /** the finish: the lines a located display holds */
  displayLines?: Set<string>
  /** part 5: the piece index of a placeholder the file cannot draw (tex.mjs cropsOf: the unit is left the original's) */
  unproven?: number
  /** the file knows each placeholder's ink (its segments) over part 1's lines (the file's): a gap's piece none took is the
   *  unit's text */
  inkKnown?: boolean
  /** each placeholder's fill by a source that knows it (tex.mjs fillOf), by piece index: what its rendering's text is drawn
   *  in, 0xRRGGBB; MIXED_FILL or null, its run's colour */
  fillOf?: ((k: number) => number | null) | null
  /** each colour piece's run's fill by a source that knows it (tex.mjs colourOf), by piece index: what the run is drawn in,
   *  0xRRGGBB, over a placeholder's own fill; null, the colour around it */
  colourOf?: ((k: number) => number | null) | null
}
/** part 1 and part 2 as a source gives them */
export interface UnitLines {
  uc: Char[]; lineInfo: Map<string, LineInfo>; extents: Map<Rect, Extent>
  /** the lines (rectKey) the unit's source does not write, by the source's knowledge: kept as the original's */
  held?: string[]
}
/** what part 4 is given: the unit, its placeholders, its lines' characters, the gaps the labels left and the unit's
 *  citations */
export interface RenderingsContext {
  unit: Unit; phs: Placeholder[]; rects: readonly Rect[]; charsByPage: readonly (readonly Char[] | undefined)[]; citeMap: CiteMap | null
  gaps: Gap[]; uc: Char[]; out: Prepared
}
/** part 4's answer: the gaps as it leaves them, and each placeholder's rendering (called once a placeholder, in the
 *  unit's order, for those the rules look for: 'cite', 'num', 'other'), or none found */
export interface Renderings {
  gaps: Gap[]; gapFor(p: Placeholder, cls: 'cite' | 'num' | 'other' | 'space'): Gap | null | undefined
  /** how a placeholder is drawn where the source knows it without the page (a layout file's macro that sets no ink: none;
   *  its text symbol: the character), else null */
  fixed?(p: Placeholder): { mode: 'none' | 'source'; text: string; proof?: boolean } | null
  /** whether the source knows the ink of a placeholder the rules would draw as a space (a layout file's found row): it is
   *  then looked for (gapFor) and drawn as that ink */
  inked?(p: Placeholder): boolean
}
/** the parts of a unit the layout file gives (tex.mjs texParts): the layer reads a unit only from the file */
export interface UnitParts {
  /** part 1 (and part 2's default): the unit's lines and their characters */
  lines: (rects: readonly Rect[], charsByPage: readonly (readonly Char[] | undefined)[]) => UnitLines
  /** part 2: the erase extents, given the lines (the lines' own where absent) */
  extents?: (lines: UnitLines, rects: readonly Rect[]) => Map<Rect, Extent>
  /** part 3: sets out.label, returns the gaps without it */
  label: (out: Prepared, unit: Unit, rects: readonly Rect[], charsByPage: readonly (readonly Char[] | undefined)[], gaps: Gap[]) => Gap[]
  /** part 4: which ink each placeholder is, by the file's segments */
  renderings: (ctx: RenderingsContext) => Renderings
  /** part 5: a rendering page text cannot be is its segments' crops (mutates the crops); the k of a placeholder the file
   *  cannot draw, or -1 */
  crops: (out: Prepared) => number
  /** where the unit's forced breaks end its lines (the file's): each break piece's index to the line set after it, by its
   *  index in the file (LineInfo.j) */
  breaks: (unit: Unit) => Map<number, { next: number; room: number | null; pitch: number | null }>
  /** each placeholder's fill by the file's row, by piece index: 0xRRGGBB, MIXED_FILL (-1) or null */
  fillOf: (k: number) => number | null
  /** each colour piece's run's fill by the file (its `colours`), by piece index: 0xRRGGBB or null */
  colourOf: (k: number) => number | null
}
/** a token of a unit's translation */
export interface Token { s?: string; st?: Style; face?: Face; cls?: 'cjk' | 'latin'; w100: number; space?: boolean; crop?: Resolved; sup?: boolean; glue?: boolean; ph?: string; k?: number; hyphenated?: boolean; kern?: boolean; leadEnd?: boolean; kernW?: number; sc?: number; cont?: boolean; [more: string]: unknown }   // kern: a lead's last, its width the original's glue after it; leadEnd: a lead's last, no space after it; kernW: explicit glue after it (at 100 px), its item's `kern`; sc: a run of small capitals the layer draws, the share of the size it is drawn at (its `s` the capitals drawn); cont: a word's later run of one case
/** a laid line: its slot, and its items at their places */
/** a laid line: its slot's fields, its items, and `past`, how many of the unit's kept regions the text passed before its first item
 *  (breakLines: where the page's word table writes a region's kept lines) */
export interface Line { block: number; page: number; x0: number; x1: number; baseline: number; target: number | null; mode: string; used: number; cap: number; items: { t: Token; x: number; w: number; kern?: number }[]; past?: number; after?: number; seg?: { f: number; scale: number; state: Layout['state'] }; [more: string]: unknown }   // an item's w: its own width; kern: the explicit glue after it, an advance apart from w (0 once a line's end drops it)
/** layoutUnit2's answer */
/** a unit laid: its lines and the state that set them; `opened`, the lines TeX's rule opened (P.lineskip), `unopened` the
 *  lines it would have opened where it has no values (none read: they stay nearer the line before than nothing) */
export interface Layout { lines: Line[]; f: number; s: number; scale: number; state: { lead: number; scale: number; track: number; trackLatin?: number; compress: number; borrow: number; knob: string; box?: boolean; next?: number }; knob: string; clipped: boolean; lostChars: number; chars: number; tried: number; spilled: boolean; opened: number; unopened: number; extents?: Map<string, number[]> }
/** the original page's ink at a fraction of its canvas's resolution */
export interface InkMap { w: number; h: number; ink: Uint8Array; factor: number }
/** a unit's block with its lines' measured baselines */
export interface Block2 extends Block { measures?: Map<string, [number, number]> | null; B: number[]; exact: boolean[]; E?: number[]; sizes: number[]; pitch0: number | null; free: number; after?: number; flow?: number; through?: boolean; freeOf?: () => number; G?: number[]; start?: number; startY?: number; shortSkips?: readonly { x0: number; x1: number; top: number; bottom: number }[] }   // G: the grid, B with the gaps of its forced breaks closed (blocks2); start: the first line's start where a shared line sets it, startY its baseline where the line before it there stands off TeX's (run.mjs layout2); shortSkips: the unit's displays on the block's page that TeX set with its short skip (tex.mjs shortSkipsOf, slotsAt); E: the grid with each gap TeX's \lineskip rule opened closed to the pitch (blocks2, evenGridOf), where it has one, slotsAt's under P.evenPitch
type ToDev = (x: number, y: number) => [number, number]
/** of a line's size: a display whose top stands under its baseline nearer than this is in reach of its descent */
export declare const SHORT_SKIP: number
/** each block's displays TeX set with its short skip: those under a line of its own (`line`, lineInfo's `j`); mutates the blocks */
/** a block's lines as the original sets them: its distinct baselines (a line its rectangles cut in two is one) */
export declare function originalLines(b: { B: readonly number[] }): number
export declare function shortSkipsTo(blocks: Block2[], skips: readonly { page: number; x0: number; x1: number; top: number; bottom: number; line: number }[], lineInfo: ReadonlyMap<string, LineInfo> | null | undefined): void
/** of a line's size: how far before a display TeX's short skip asks the line over it to end (\predisplaysize) */
export declare const PREDISPLAY: number

/** a spacing accent TeX sets as a glyph of its own */
export declare const ACCENT: RegExp
/** a page's text content as characters, each with its font's class (`fontOf(fontName)`) */
/** the characters a font's ToUnicode map gives its glyphs (PDF.js's `toUnicode`, with fontExtraProperties), or null */
export declare function mappedOf(toUnicode: unknown): Set<string> | null
/** mappedOf of a font as PDF.js's commonObjs holds it; throws for a font (not Type3) exported with no `toUnicode` (a
 *  document not opened with PDF_OPTIONS); null for anything else with no map to read */
export declare function fontMappedOf(font: unknown): Set<string> | null
/** whether a page character's text is no reading of its glyph (pageChars2's `nu`) */
export declare function unmapped(ch: string, mapped: Set<string> | null | undefined): boolean
export declare function pageChars2(textContent: { items: unknown[] }, fontOf: (fontName: string) => FontClass, mapOf?: ((fontName: string) => Set<string> | null) | null, fills?: readonly (number | readonly number[] | null | undefined)[] | null): Char[]
/** the source's text by what sets its style: for each code point of the unit's plain source text, the attributes the pieces
 *  around it set (bits: weight 1, slant 2, small capitals 4, family 8, colour 16), the pieces that set its colour, outermost
 *  first, and the parity of the slant toggles around it (`flip`); null where the unit carries no source pieces or their text is
 *  not its `src` */
export declare function sourceScopes(unit: { src?: string; source?: readonly { t: string; s?: string; src?: string }[] }): { sets: number; chain: number[]; flip: number }[] | null
/** the unit's base style and its pieces' colours from its matched characters with their source scopes (E1); `small` and `lower`
 *  where the unit has faked small capitals (each glyph one, and its source letter lowercase: the glyphs that tell them) */
export declare function measuredStyle(chars: readonly { st: FontClass & { fill?: number }; sets: number; chain: readonly number[]; flip?: number; small?: boolean; lower?: boolean }[]): { st: { bold: boolean; italic: boolean; caps: boolean; fam: string; design?: string }; fill: number | null; pieces: Map<number, number> } | null
/** a faked small capital is set at most this share of the size of its unit's letters whose case TeX did not change */
export declare const SMALL_CAPS_SHARE: number
/** the share of the size the layer draws small capitals at where the unit's page tells none (0.8, NFSS's virtual faces') */
export declare const SMALL_CAPS_RATIO: number
/** whether the layer draws a run's small capitals itself: a run set in them in a face with none of its own */
export declare const selfCaps: (face: Pick<Face, 'caps' | 'id'> | null | undefined) => boolean
/** a target's capitals: its language's case mapping, the root's where it names no locale */
export declare function upperOf(to: string): (s: string) => string
/** `s` in runs of one case as the layer draws its small capitals: each its text as drawn, the share of the size it is drawn at
 *  (1, or `ratio`), its first character's UTF-16 offset in `s` and its length there; `smallAt`: a capital the page sets small */
export declare function caseRuns(s: string, ratio: number, upper: (s: string) => string, smallAt?: ((at: number) => boolean) | null): { s: string; k: number; at: number; n: number }[]
/** a rendering of the page's own characters: by each UTF-16 offset of `text`, whether its character is set at most SMALL_CAPS_SHARE
 *  of `size`; null where its characters do not give the text, or none is */
export declare function smallCapsAt(chars: readonly { ch: string; size: number }[] | null | undefined, text: string, size: number | undefined): ((at: number) => boolean) | null
/** a babel name's word as the layer draws it in `face`: its runs of one case where it draws the face's small capitals itself */
export declare function nameRuns(text: string, face: Face, to: string): { face: Face; runs: { s: string; k: number }[]; text: string }
/** a name's word in its runs by script, each in its face, each run's small capitals the layer's where its face has none */
export declare function nameScriptRuns(text: string, faceOf: (cls: 'cjk' | 'latin') => Face, to: string, quotes?: boolean): { face: Face; runs: { s: string; k: number; face: Face }[]; text: string }
/** nameRuns' (or nameScriptRuns') word's width at size 1 */
export declare const runsWidth: (drawn: { face: Face; runs: readonly { s: string; k: number; face?: Face }[] }) => number
/** the size a unit set in small capitals is drawn at in a CJK target, × its nominal size (the owner's, 2026-10-24: 1) */
export declare const CJK_CAPS_SIZE: number
/** the size a unit is laid at: the original's, its faked small capitals aside, × CJK_CAPS_SIZE in a CJK target where its base is
 *  set in small capitals; undefined where no glyph of it was read */
export declare function unitSizeOf(prep: Pick<Prepared, 'orig' | 'measured'> | null | undefined, P: { cjk?: boolean } | null | undefined, unit?: Pick<Unit, 'pieces'> | null): number | undefined
/** a face's small capitals as its CSS rule draws them: its own smcp's, '' for any other (none is ever synthesized) */
export declare function capsRule(face: Pick<Face, 'caps'> & { id?: string }): string
/** a rendering's text in runs of one fill (0xRRGGBB, or -1 untold); null where its characters do not give the text or tell no fill */
export declare function fillRunsOf(chars: readonly Pick<Char, 'ch' | 'st'>[] | null | undefined, text: string): { text: string; fill: number }[] | null
/** the kind a mark no line may start with is across scripts ("." and the ideographic full stop: 'stop'; ")" and a closing corner bracket: 'close'), else the mark itself */
export declare function markKind(ch: string): string
/** a text without the leading marks that stand for one of `held` (the original's marks after a kept placeholder, in order), each matched with one */
export declare function droppedHeld(s: string, held: readonly string[]): string
/** a placeholder's source as plain text, its environment, label and alignment marks left out */
export declare function texToText2(src: string): string
/** phClass with the paper's own macros told apart: { cls, unknown? } */
export declare function phClass2(src: string): { cls: string; unknown?: boolean }
/** whether a 'symbol' is a text symbol the file's crops exempt: one grapheme drawn, no `_`, `^`, `/` or `√(` */
export declare function textSymbol(src: string): boolean
/** phClass2 as the layer reads a unit's placeholders: a 'symbol' that is no text symbol is 'other' */
export declare function phClassProven(src: string): { cls: string; unknown?: boolean }
/** the unit's characters by its rectangles; `exact`: each rectangle's baseline and size, the layout file's */
export declare function charsOfUnit2(rects: readonly Rect[], charsByPage: readonly (readonly Char[] | undefined)[], extents: Map<Rect, number[]> | undefined, exact: ReadonlyMap<Rect, { baseline: number; size: number }>): Char[]
/** `first`: the unit's first line (default rects[0]; `rects` may be its lines on one page alone); the rects are the layout file's lines, a justified line grown over what is not math only up to its run's measure (E3d) */
export declare function extendRects2(rects: Rect[], charsByPage: readonly (readonly Char[] | undefined)[], others: readonly (readonly Rect[] | undefined)[], src: string, wordsOfFn: unknown, normFn: unknown, pageViews: readonly number[][], wordChars?: readonly (readonly Char[] | undefined)[], first?: Rect): number
/** a block's lines by the measure TeX set each to, where it changed within the paragraph (a wrapped figure, \parshape,
 *  \hangindent): each line's key to its measure's [x0, x1], or null where the block is one measure */
export declare function measuresOf(rects: readonly Rect[], keep?: ReadonlySet<string> | null): Map<string, [number, number]> | null
export declare function blocksOf2(rects: readonly Rect[], pageViews: readonly number[][], keep?: ReadonlySet<string> | null, regionOf?: ReadonlyMap<string, number> | null, referenced?: ReadonlySet<number> | null, breakAt?: ReadonlyMap<string, number> | null, joinAt?: ReadonlyMap<string, number> | null, centred?: boolean): (Block & { measures?: Map<string, [number, number]> | null })[]
export declare function gapsOf2(unitChars: readonly Char[], src: string, deny?: ReadonlySet<string> | null): { text: string; chars: Char[] }[]
/** the unit against its page, in the layout file's parts (the per-unit reading's contract above) */
/** a fill (0xRRGGBB) as the drawing writes it, `#rrggbb` */
export declare const hexOf: (rgb: number) => string
export declare function prepareUnit(unit: Unit, rects: readonly Rect[], charsByPage: readonly (readonly Char[] | undefined)[], citeMap: CiteMap | null, deny: ReadonlySet<string> | null, parts: UnitParts): Prepared
/** the unit's placeholders by piece index, classed by phClassProven */
export declare function placeholdersOf(unit: Unit): Placeholder[]
/** a unit's source pieces (rows.mjs unitOf's non-enumerable `source`), else its own pieces */
export declare const sourcePiecesOf: (unit: Unit & { source?: Unit['pieces'] }) => Unit['pieces']
/** part 3, the alignment's where the file has no label: the first gap's label, out.label set; the gaps without it. Whether
 *  the unit begins with text is its source's (sourcePiecesOf), never its translation's */
export declare function labelOf(out: Prepared, unit: Unit, rects: readonly Rect[], charsByPage: readonly (readonly Char[] | undefined)[], gaps: Gap[]): Gap[]
/** a citation's keys from its source */
export declare const citeKeys: (src: string) => string[]
/** a citation's rendering without the source's own brackets round it, and what it says learnt for the paper */
export declare function learnCite(p: Placeholder, g: Gap, citeMap: CiteMap | null): Gap
export declare function displayTouched(res: Prepared, uc: readonly Char[]): Set<string>
/** a crop grown over the ink it touches */
export declare function growCrop(r: { crop: number[]; [more: string]: unknown }, ink: InkMap | undefined, toDev: ToDev, k: number, pageChars?: readonly Char[]): void
/** whether growCrop grows a crop, and so reads its page's ink: a crop with a box, not one cut from a layout file's segment */
export declare const cropGrows: (r: { crop?: number[] | null; gap?: { box?: unknown } | null } | null | undefined) => boolean
export declare function nearIn(letters: string, hay: string, src?: string): boolean
/** a page character's key: page|item|k */
export declare const charKey: (c: { page?: number; item: number; k: number }) => string
/** wordChars: the page's characters the first line may grow over the words its source begins with (step 3) */
export declare function extendRects(rects: Rect[], charsByPage: readonly (readonly Char[] | undefined)[], others: readonly (readonly Rect[] | undefined)[], src: string, wordsOfFn: unknown, normFn: unknown, wordChars?: readonly (readonly Char[] | undefined)[], first?: Rect): number
/** a unit's translation as tokens; `.base` is its base style. `measure(s, face)`: a run's width at 100 px (the canvas's, cached,
 *  by default); a host reading the tokens' faces and texts before the faces are loaded passes a measure that takes none.
 *  `tagWords`: each token of a text piece also carries `at` and `end`, its range in the unit's plainTranslated(pieces) (words.mjs),
 *  and no other field changes */
/** what a unit's first line starts with before its own text: each part in its own style, then a space (`gap`
 *  undefined) or that many em of the unit's size after its last character, no place to break (0: none) */
export interface Lead { parts: { text: string; st: Partial<Style> }[]; gap?: number }
/** `text` with the ranges `cuts` ([from, to), rising) left out, and its transformMap less the same characters; null where there is nothing to cut */
export declare function cutOut(text: string, cuts: readonly (readonly [number, number])[], map: { from: number[]; span: number[] } | null): { text: string; map: { from: number[]; span: number[] } | null } | null
export declare function tokensOf2(unit: Unit, resolved: Prepared, to: string, baseIn: Style, designs: { serif: string; sans: string; mono: string }, P: Params, lead?: Lead | null, measure?: (s: string, face: Face) => number, tagWords?: boolean): Token[] & { base: Style }
/** a float's label as the final sets it in the target: the target's name (capitals where the original's are), a space,
 *  the original's number and punctuation; null where the final keeps the paper's name or the name is the original's */
export declare function labelInTarget(label: { text?: string; chars?: { ch: string }[] } | null | undefined, names: { figure: string; table: string } | null | undefined, captions: { figure?: string; table?: string } | null | undefined, to: string): string | null
/** a babel name as the layer sets it in the target, wherever TeX identified the heading: the target's word for its key
 *  (capitals where the original's are); null where the target has none, or where the word is the original's */
export declare function nameInTarget(name: { key: string; capitals: boolean }, own: string | null | undefined, labels: Readonly<Record<string, string>> | null | undefined, to: string): string | null
/** a babel name's size and whether it is set in faked small capitals, read off its characters as a unit's are: its faked small
 *  capitals aside where the class changed its case (`capitals`), the file's size where none of them tells one */
export declare function nameStyleOf(chars: readonly { ch: string; size: number; st?: { fam?: string } | null }[] | null | undefined, name: { size: number; capitals: boolean }): { size: number; small: boolean }
/** a label's characters as its text, a space where two stand a fifth of their size apart */
export declare function spacedText(chars: readonly Pick<Char, 'ch' | 'x0' | 'x1' | 'size'>[]): string
/** a theorem-like head's label as the target names it (its name in translator's word, its number and punctuation the original's),
 *  the parts it is drawn in, each in its own style, and whether it ends in an opening bracket; null where it is no such head */
/** a structural name's row (a unit of kind `name`) as [its English, the target's word for it]; null for another unit, or a
 *  row of no translation or an empty one (PDF-READER §19.14) */
export declare function nameOfRow(u: { kind?: string; src?: string; state?: string; pieces?: readonly { t: string; s?: string }[] } | null | undefined): [english: string, word: string] | null
export declare function headLabelInTarget(chars: readonly Char[], to: string, names?: ReadonlyMap<string, string> | null): { text: string; parts: { text: string; st: { bold: boolean; italic: boolean; color?: string } }[]; open: boolean } | null
/** the placeholders whose text cleveref and \autoref generate */
export declare const GENERATED_REF: RegExp
/** each `orig-text` rendering of a generated reference, or of a citation's note, in the target's names: its `rename` set */
export declare function renameRefs(prep: Prepared, to: string, labels: Readonly<Record<string, string>> | null | undefined, names?: ReadonlyMap<string, string> | null): void
/** a rendering's runs with its replacements made, each inside one run; null where one crosses two */
export declare function renameRuns<R extends { text: string }>(runs: readonly R[], rename: readonly [number, number, string][]): R[] | null
/** a text's width at size 1 in a face */
export declare const widthOf: (s: string, face: Face) => number
/** a babel name drawn in the target's word, as SVG markup (a <g data-n="occurrence">) */
export declare function svgOfName(o: { occurrence: number; text: string; x: number; baseline: number; size: number; face: Face; color?: string | null; runs?: readonly { s: string; k: number }[] | null }, toPx: (x: number, y: number) => number[], scale: number): string
/** a figure's translation in its runs by script, each in its face: its CJK characters (cjkClassRe of `quotes`) in `faceOf('cjk')`, every other in `faceOf('latin')` */
export declare function figureRuns(text: string, faceOf: (cls: 'cjk' | 'latin') => Face, quotes: boolean): { s: string; face: Face }[]
/** figureRuns' width at size 1 (PDF units per unit of size) */
export declare function figureRunsWidth(runs: readonly { s: string; face: Face }[]): number
/** a figure's text drawn as SVG: its runs one after the other on its baseline from `x`, `y`, turned by `angle` */
export declare function svgOfFigure(o: { group: string; runs: readonly { s: string; face: Face }[]; x: number; y: number; angle: number; size: number; color?: string | null }, toPx: (x: number, y: number) => number[], scale: number): string
/** a bitmap figure's label as SVG: its patches (the ground's colour over each line) and its text (each line it fills), apart */
export declare function svgOfOcr(o: { id: number; place: import('./ocr-rows.mjs').OcrPlace; laid: readonly import('./ocr-fit.mjs').OcrLineLaid[]; face: Face; size: number }, toPx: (x: number, y: number) => number[], scale: number): { patches: string; text: string }
/** a character style's colour as a run takes it: its fill where told (black: `color` undefined), nothing where not */
export declare function colourOfStyle(st: { fill?: number } | null | undefined): { color?: string }
/** a character style's font class, its fill aside (the class itself where no fill was set on it) */
export declare function fontOfStyle<T>(st: T): T
/** a run's style from its characters (the first not a formula's), its colour too; its design `serif` where none is told */
export declare function styleOfChars(cs: readonly Pick<Char, 'st'>[], serif: string): { fam: string; bold: boolean; italic: boolean; caps: boolean; design: string; color?: string }
/** the target's likely faces measured once each, a task apart, the CJK ones too where `cjk` (the run's P.cjk); `ready(face, text)`
 *  is awaited before each measure (a face served in slices has the slice of the text by then) */
export declare function warmFaces(to: string, cjk: boolean, designs: { serif: string }, yieldNow: () => Promise<unknown>, ready?: (face: Face, text: string) => Promise<unknown>): Promise<void>
export declare function blocks2(rects: readonly Rect[], pageViews: readonly number[][], keep: ReadonlySet<string> | null, lineInfo: Prepared['lineInfo'], regionOf?: ReadonlyMap<string, number> | null, referenced?: ReadonlySet<number> | null, lineskip?: readonly [skip: number, limit: number] | null, breakAt?: ReadonlyMap<string, number> | null, joinAt?: ReadonlyMap<string, number> | null, centred?: boolean): Block2[]
export declare function inkMapOf(canvas: HTMLCanvasElement | OffscreenCanvas, factor?: number): InkMap
export declare function freeBelow(map: InkMap | undefined, toDev: ToDev, k: number, x0: number, x1: number, yStart: number, yLimit: number): number
export declare const setHyphenData: (lang: string, data: Patterns | true | null) => Map<string, Patterns | true | null>
/** whether a rendering's own characters hold one raised over its main glyphs' baseline (a superscript, a raised letter) */
export declare function scriptedOf(chars: readonly Char[]): boolean
/** a crop from a layout file's segment (its piece's own ink): the box, a fraction of a point around, on its line's
 *  baseline */
export declare function cropOfBox(box: { x0: number; x1: number; top: number; bottom: number; baseline: number }): { crop: number[]; baseline: number }
/** a placeholder's ink as crops, one a line of TeX's: its row's segments (stride 6) that meet across on one page, in TeX's order; null where it has none */
export declare function cropPartsOfSegments(segs: ArrayLike<number> | null | undefined): CropPart[] | null
/** a crop resolution's own fields from its parts: the first's page, rectangle and baseline, and the parts where there are more than one */
export declare function cropFields(parts: CropPart[]): { mode: 'crop'; page: number; crop: number[]; baseline: number; parts?: CropPart[] }
/** where each later page of a unit begins in its source (E3c): the plain source's UTF-16 offset of the first source word the alignment takes there, by page */
export declare function pageStartsOf(uc: readonly Char[], O: readonly { start: number }[], S: readonly { start: number }[], pair: ArrayLike<number>, src: string): Map<number, number>
/** the translation's cut at each later page's start: the token the page's text begins with */
export declare function pageCutsOf(tokens: readonly Token[], unit: { src?: string; pieces?: readonly unknown[]; sentences?: { src: number[]; tr: number[] } | null }, starts: ReadonlyMap<number, number> | null | undefined, P: { noStart?: string; noEnd?: string }): { page: number; at: number }[]
/** a unit laid with its page cuts: as without them, and once more with them at that layout's state where it sets a cut's token on an earlier page, kept where it fits there */
export declare function layoutCut(tokens: Token[] & { base?: unknown }, cuts: readonly { page: number; at: number }[], blocks: readonly Block2[], s: number, P: Params): { layout: Layout; tokens: Token[] & { base?: unknown } }
/** the tokens with a page-break token before each cut's token */
export declare function withPageBreaks(tokens: Token[] & { base?: unknown }, cuts: readonly { page: number; at: number }[]): Token[] & { base?: unknown }
/** a crop resolution as its readers take it, one a part: itself, or each part as a crop of its own (its index `part`, the copy text on the first alone) */
export declare function cropPartsOf(r: Resolved): Resolved[]
/** whether a placeholder is a formula, drawn only as crops of its ink: v0's 'other' that is no text piece */
export declare function formulaOf(p: { cls?: string; src?: string }): boolean
/** a crop's baseline with no segment (v0's): its glyphs' at its line's text size, else its line's measured baseline, else
 *  its largest glyphs' */
export declare function cropBaselineOf(real: readonly Char[], lineInfo: Prepared['lineInfo'] | null, main: readonly Char[]): number
/** a solid-set original's pitch, × its size (TeX's \baselineskip: 1.2 at 10 and 12 pt, 1.24 at 11) */
export declare const SOLID: number
/** the unit's leading relative to the original's own pitch: leadBase of a solid line, never closer than the original's */
export declare function leadOf(blocks: readonly Pick<Block2, 'pitch0'>[], s: number, P: Pick<Params, 'leadBase'>): number
export declare function layoutUnit2(tokens: readonly Token[], blocks: readonly Block2[], s: number, P: Params): Layout
/** a unit's run between its kept regions (a display each): its blocks (those of one `after`, from the unit's block `bi0`) and
 *  its tokens; with layoutRuns, its parameters and its own layout */
export interface Run { after: number; idx: number[]; bi0: number; blocks: Block2[]; tokens: Token[]; P?: Params; layout?: Layout }
/** a unit's runs, or null where it is one run, a run with text has no slots of its own or a block no run's text, or the blocks
 *  are not in their regions' order */
export declare function runsOf(tokens: readonly Token[], blocks: readonly Block2[]): Run[] | null
/** a run's parameters: its first block's place in the unit (`blockBase`), the gap under the paragraph and a heading's last
 *  lines the last run's alone */
export declare function runParams(P: Params, run: Run, last: boolean): Params
/** a unit's runs laid each at its own state (the first of the fit's at which its own text fits its own slots, from the
 *  tightest tracking any of them needs: runTrack), joined as one layout (joinRuns); null where the unit is one run or a run
 *  does not fit alone */
export declare function layoutRuns(tokens: readonly Token[], blocks: readonly Block2[], s: number, P: Params, fit?: readonly Pick<Line, 'from' | 'page'>[] | null): { layout: Layout & { runs: number }; runs: (Run & { P: Params; layout: Layout })[] } | null
/** the runs' layouts as one: each line's block its place in the unit's blocks, and its run's size, scale and state (`seg`) */
export declare function joinRuns(runs: readonly { bi0: number; layout: Layout }[]): Layout & { runs: number }
/** a run's ink over (a) and under (d) its baseline at 100 px in its face (the measure that gives its width) */
export declare function ink100(s: string, face: Face): { a: number; d: number }
/** a laid line's extent over (a) and under (d) its baseline, PDF units: its text's ink and its crops' over their TeX
 *  baselines; `text`, its text's alone */
export declare function lineExtent(line: Pick<Line, 'items'>, f: number, scale: number): { a: number; d: number; text: { a: number; d: number } }
/** a unit laid at one state of the fit, with no search (the page fill's): clipped where the state does not set it whole */
export declare function layoutAt(tokens: readonly Token[], blocks: readonly Block2[], s: number, P: Params, st: Layout['state']): Layout
/** the distance TeX set between the original's line a formula's crop stands on (on its baseline, its rectangle holding the crop's
 *  centre) and the line after it (`below`) or before it, on the unit's grid; -Infinity where the blocks hold no such line */
export declare function texRoomOf(blocks: readonly (Pick<Block2, 'page' | 'B' | 'rects'> & { G?: readonly number[] })[] | null, r: { page: number; baseline: number; crop: readonly number[] }, below: boolean): number
/** a grid `G` with each gap TeX's \lineskip rule opened (`opened`, a gap's) closed to the pitch `p0`, every other gap the grid's;
 *  no line lower than the grid's own (blocks2's `E`) */
export declare function evenGridOf(G: readonly number[], opened: readonly boolean[], p0: number): number[]
/** the floor a page fill's state asks of a unit's last line (footFloorAt), or null where it asks none */
export declare function footFloorOf(blocks: readonly Block2[], st: Layout['state'], P: Params, s: number): number | null
/** a unit's shared row as its layout leaves it (need.mjs rowLeadOf's row): its page, baseline and band (an em), the block's span,
 *  where its text there ends and the baseline of the line that ends there (both null: none there); null where no block of the unit
 *  holds the row */
export interface Share { page: number; y: number; band: number; x0: number; x1: number; end: number | null; at: number | null }
export declare function shareOf(layout: Pick<Layout, 'lines'>, blocks: readonly Block2[], row: { page: number; baseline: number; size: number }): Share | null
/** whether a layout's lines keep a shared row as the fit left it (no text there further right; none where the fit set none; its
 *  line there on the fit's baseline) */
export declare function keepsShare(share: Share | null | undefined, lines: readonly Line[]): boolean
/** whether `lines` set no token on a later page than the fit's lines (`fit`) set it (the page fill's guard) */
export declare function keepsPages(fit: readonly Pick<Line, 'from' | 'page'>[], lines: readonly Pick<Line, 'from' | 'page'>[]): boolean
/** a box in v0's device pixels on the page: [x, y, w, h] */
export type DevBox = [number, number, number, number]
/** one of the layer's drawing operations over render A (hideOps'): where a unit's hidden ink lies (nothing drawn), a plane of the
 *  page put back in rectangles, a crop of a page's plane darkened in */
export type DrawOp =
  | { op: 'hidden'; rects: DevBox[] }
  | { op: 'paste'; page: number; plane: Plane; unit?: number | null; rects: DevBox[] }
  | { op: 'crop'; page: number; src: DevBox; dst: DevBox; plane: Plane; clip?: DevBox[] }
/** which render of a page an operation cuts from: B every unit's text and label hidden (a crop's source), C every group shown */
export type Plane = 'B' | 'C'
/** a canvas a drawing operation cuts from: the page as PDF.js drew it */
export type DrawSource = CanvasImageSource
/** a unit's drawing on a page of our wrapped document: its hidden rectangles, its pastes from B and C, its crops (PDF boxes in,
 *  device pixels out) */
export declare function hideOps(L: Layout, page: number, o: { px: ToDev; k: number; hasSource: (page: number) => boolean; pxOf: (page: number) => ToDev; hidden?: number[][]; fromB?: number[][]; fromC?: number[][]; clips?: Map<number, { rects: number[][]; own: number[][] }> | null; audit?: Audit[] | null; id?: number | null }): DrawOp[]
/** the operations drawn over render A at `z` times v0's resolution, cut from each page's planes as PDF.js drew them there */
/** the part of each plane the operations cut from, by `${plane}${page}`: [x, y, w, h], whole device pixels at z times v0's resolution */
export declare function opsSources(ops: readonly DrawOp[], z: number): Map<string, [number, number, number, number]>
export declare function drawOps(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, ops: readonly DrawOp[], z: number, sourceOf: (page: number, plane: Plane) => DrawSource | { canvas: DrawSource; x: number; y: number } | null | undefined): void
/** the unit's lines on one page as SVG markup (a <g data-u="id">) */
export declare function svgOfUnit(L: Layout, page: number, toPx: (x: number, y: number) => number[], scale: number, id: number): string
/** a <tspan> of a laid line's text as svgOfUnit draws it: its face, whether it is a run of single CJK characters each at its
 *  own place (`chars`), a superscript's, its colour, text, the PDF x of its start (of each character, `chars`), its tracking,
 *  each item drawn in it as [its index in the line, the UTF-16 offset of its text in the run's], and the share of the size small
 *  capitals the layer draws are set at (`sc`) */
export interface LineRun { face: Face; chars: boolean; sup: boolean; color?: string; text: string; xs: number[]; track?: number; items: [number, number][]; sc?: number; crop?: undefined }
/** a laid line as svgOfUnit draws it, in order: its runs and its crops (`crop`: the item's index) */
export declare function lineRuns(line: Line, L: Layout): (LineRun | { crop: number })[]
/** the PDF x of a run's edge before its UTF-16 offset `at`, as the browser lays it out (the run's start, the measure of the text
 *  before it in its face at the size drawn, its tracking); `measure`: a run's width at 100 px (w100's) */
export declare function runEdge(run: LineRun, at: number, line: Line, L: Layout, measure?: (s: string, face: Face) => number): number
/** an open piece whose text is a link's: \href, \hyperref, \hyperlink */
export declare const LINK_OPEN: RegExp
/** the unit's lines on a page that stay the original's, with the baseline and size its reading gave each (the page's word table) */
/** a line the unit keeps as the original's on a page, for the page's word table: its rectangle, baseline and size; a referenced
 *  region's `region` and its first placeholder piece `k`, else the first block after it in the unit's rectangles (`block`) */
export interface KeptLine { x0: number; x1: number; baseline: number; size: number; top: number; bottom: number; region?: number; k?: number; block?: number }
export declare function keptLines(rects: readonly number[][], prep: { keep?: readonly string[]; lineInfo?: ReadonlyMap<string, { baseline: number; size: number }>; regionOf?: ReadonlyMap<string, number>; referenced?: ReadonlySet<number> } | null | undefined, page: number, blocks?: readonly { rects?: readonly number[][] }[] | null): KeptLine[]
export declare function drawnRuns(tokens: readonly Token[]): { key: string; n: number }[]
export declare function styleMatch(orig: Prepared['orig'] | undefined, drawn: readonly { key: string; n: number }[], drawnBase?: string): { match: number; total: number; base?: boolean; ob?: string; db?: string }
/** a line's band between the rules over and under it: its original baseline, and how low and high its em box may reach */
export interface CellBand { B: number; lo: number; hi: number }
/** a table cell's room between the rules over and under its lines: the largest size its em boxes fit at, and each line's band by block */
export declare function cellBands(blocks: readonly { page: number; B: readonly number[]; rects: readonly (readonly number[])[] }[], rulesOf: (page: number) => readonly number[] | undefined, s: number, P: Pick<Params, 'cellClear' | 'cellCapMin'>): { cap: number; bands: Map<number, CellBand[]> } | null
/** each laid line on one of the original's lines moved into that line's band at the size it is drawn at */
export declare function clearLines(lines: { block: number; baseline: number }[], bands: Map<number, CellBand[]>, f: number): void
/** the characters a target's rules set in its CJK face: the CJK blocks, and with `quotes` (the rules' cjkQuotes) the curly quotes,
 *  dashes, ellipsis and middle dot too */
export declare const cjkClassRe: (quotes: boolean) => RegExp

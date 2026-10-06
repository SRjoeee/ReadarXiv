// tokens.mjs's types: a unit's translation as the tokens the line breaker places
import type { FaceId, RoleSet } from '../font-roles.mjs'
import type { LayerRules } from '../layer-rules.mjs'
import type { LayoutIndex, LayoutUnit } from '../layout/file.mjs'
import type { Hyphenator } from './hyphen.mjs'
import type { TrPiece } from './pieces.mjs'

/** a text's width at 100 px in a face (canvas measureText, in that face once it has loaded; the web's) */
export type Measure = (text: string, face: FaceId, caps: boolean) => number
/** the original page's text inside a rectangle (PDF.js's text content), or null: for a placeholder drawn as page text */
export type TextIn = (page: number, x0: number, bottom: number, x1: number, top: number) => string | null

export interface Token {
  kind: 'text' | 'space' | 'ph' | 'break' | 'block'
  s?: string                     // text: its characters as drawn (a ligature as its one character, a hyphenated piece with its hyphen)
  script?: 'cjk' | 'latin'
  face?: FaceId; caps?: boolean
  /** its width in ems, so that at a size f (PDF units) it is `w * f` for every kind of token: a text, a space or page text
   *  as Measure gives it (at 100 px) over 100, a crop its segments' width over the unit's own size; 0 for a break and a
   *  block. Tracking, letter spacing and compression are the line breaker's, on top */
  w: number
  glue?: boolean                 // no break before it (a space: no break at it, kinsoku across a space)
  punct?: 'open' | 'close'       // a full-width mark (compressible)
  asp?: boolean                  // CJK–Latin autospace before it
  hyph?: string                  // the language a word may hyphenate in
  word?: boolean                 // an alphabetic word of running text (five letters or more; no URL, nothing in a typewriter face): cut by characters, it draws a hyphen
  ph?: number                    // a placeholder's k; with `mode`
  mode?: 'crop' | 'page-text' | 'text' | 'kept'
  raised?: boolean
  colour: number                 // a colour's index + 1 in LAYER_COLOURS, 0 for none
  at: number; len: number        // its offsets in trText(pieces)
}

/** a page text's width over its segments' width that may be the placeholder's own: 0.85 to 1.15 (the citations' own text
 *  lies at 0.94-1.07 on the layer lab's 29 fixtures) */
export declare const PAGE_TEXT_MIN: number
export declare const PAGE_TEXT_MAX: number
/** a face's size correction (Face.size; 1 for a face with none): a run is measured, and drawn, at the line's size × it */
export declare function faceSize(face: FaceId | undefined): number
/** what a placeholder's own text is measured with: `width(text)` in ems, at the unit's `size` (PDF units) */
export interface OwnTextIn { textIn?: TextIn; width: (text: string) => number; size: number }
/**
 * A placeholder's own text: its row's `text` (the layout's: its own glyphs' text, Task 6b) where it has one, else the page's
 * text inside its segments (`textIn`) joined by spaces; null where neither reads, or where what reads is not within
 * PAGE_TEXT_MIN to PAGE_TEXT_MAX of its segments' width, or, read by textIn, would still be with a period, comma, semicolon,
 * colon, ! or ? at either end taken off (a text item that ran on to the sentence's period)
 */
export declare function ownText(row: { segs: Float64Array; text?: string }, o: OwnTextIn): string | null
/** the page text a placeholder is drawn as (ownText, its own brackets dropped where the translation's pieces beside it
 *  bracket it and the source's do not), or null */
export declare function pageTextOf(row: { flags: number; segs: Float64Array; text?: string }, before: TrPiece | undefined, after: TrPiece | undefined, o: OwnTextIn): string | null

/** every character that may not begin a line, and every one that may not end it: the kinsoku sets */
export declare const NO_START: string
export declare const NO_END: string
/** the full-width marks compression takes half of, closing and opening */
export declare const COMPRESS_CLOSE: string
export declare const COMPRESS_OPEN: string
/** a word's letters: its text with the marks before and after it taken off, as `{ lead, core }`, or null for a text that is
 *  no word of five letters or more (the hyphenator is asked for `core`, whose offsets add `lead`) */
export declare function hyphenCore(text: string): { lead: number; core: string } | null

/**
 * A unit's translation as tokens, or null where it cannot be drawn: a placeholder the layout lost (a LOST row), a character
 * no face holds, a unit with no lines. A citation or reference (not raised) is page text where pageTextOf gives it one, else
 * a crop of its ink: the reader's textIn, which may give whole text items, is never trusted unmeasured.
 *
 * A `[1, k]` with no `ph` row draws nothing: the layout maker writes a row for every visible placeholder, found or LOST, so
 * a piece with none is an invisible one. `classOf` is a defence against a maker that did not: given, it names the class of
 * a source piece (marks.mjs's classes), and where it says a class that has ink (math, cite, ref, eqref, code, url,
 * footnote) for a `k` with no row the result is null, the unit staying the original's, never "invisible". A `k` that has a
 * row is read from the row whatever `classOf` says.
 */
export declare function tokensOf(pieces: readonly TrPiece[], o: {
  unit: LayoutUnit; file: LayoutIndex; target: string; rules: LayerRules; roles: RoleSet; measure: Measure; hyphen: Hyphenator | null
  textIn?: TextIn; classOf?: (k: number) => string | null
}): Token[] | null
/** the classes whose rendering may bring its own brackets where no text of it reads: a citation */
export declare const BRACKETED: ReadonlySet<string>
/** brackets by kind, half and full width alike: round and square */
export declare const OPENS: ReadonlyMap<string, 'round' | 'square'>
export declare const CLOSES: ReadonlyMap<string, 'round' | 'square'>
/** where each bracket of the translation's text pieces closes or is closed, by `${piece index}:${index in it}`: its
 *  partner's key, null for one the translation leaves unmatched */
export declare function bracketPairs(pieces: readonly TrPiece[]): Map<string, string | null>
/** the first (end false) or last (end true) character of text piece i that is not white space, with its key; null where
 *  piece i is no text or has none */
export declare function beside(pieces: readonly TrPiece[], i: number, end: boolean): { ch: string; key: string } | null
/**
 * The translation's brackets that echo a citation's own, by key: unmatched, right before (after) a citation whose own text
 * (ownText, measured by `o`) begins (ends) with a bracket of that kind or reads nowhere, the source not bracketing it
 * (SOURCE_BRACKETS). The tokens keep each for its offset in trText and draw nothing for it; the net does not take it as
 * doubled
 */
export declare function echoesOf(pieces: readonly TrPiece[], unit: { ph: ReadonlyMap<number, { kind: string; flags: number; segs: Float64Array; text?: string }> } | null | undefined, o: OwnTextIn): Set<string>

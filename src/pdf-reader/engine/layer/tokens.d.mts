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
  mode?: 'crop' | 'page-text' | 'kept'
  raised?: boolean
  colour: number                 // a colour's index + 1 in LAYER_COLOURS, 0 for none
  at: number; len: number        // its offsets in trText(pieces)
}

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
 * no face holds, a unit with no lines.
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

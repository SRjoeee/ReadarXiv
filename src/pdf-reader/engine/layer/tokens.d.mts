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
  /** at 100 px, as Measure gives it; for a crop, its width in PDF units at size 1 (its segments' width over the
   *  unit's size), so that at a size f it is `w * f`; 0 for a break and a block */
  w: number
  glue?: boolean                 // no break before it (a space: no break at it, kinsoku across a space)
  punct?: 'open' | 'close'       // a full-width mark (compressible)
  asp?: boolean                  // CJK–Latin autospace before it
  hyph?: string                  // the language a word may hyphenate in
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
 * A unit's translation as tokens, or null where it cannot be drawn: a k with no visible rendering it needs, a character
 * no face holds, a unit with no lines. `classOf` names the class of a source piece the layout has no row for (marks.mjs's
 * classes): where it says a class that has ink, the unit is not drawn; without it, such a piece is an invisible one
 */
export declare function tokensOf(pieces: readonly TrPiece[], o: {
  unit: LayoutUnit; file: LayoutIndex; target: string; rules: LayerRules; roles: RoleSet; measure: Measure; hyphen: Hyphenator | null
  textIn?: TextIn; classOf?: (k: number) => string | null
}): Token[] | null

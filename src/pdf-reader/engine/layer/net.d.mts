// net.mjs's types: the instant layer's completeness net
import type { RoleSet } from '../font-roles.mjs'
import type { LayoutUnit } from '../layout/file.mjs'
import type { LayerInput, LaidUnit, Tr, Unfit } from './fit.mjs'
import type { TrPiece } from './pieces.mjs'

/** the most pieces a translated unit may have: 20,000 */
export declare const PIECES_MAX: number
/**
 * A unit's pieces as an answer gives them, as fresh TrPiece; refused (null, never a throw) unless every one is a TrPiece of
 * the right arity, every k an integer below the unit's pieces and unique, every style an integer within STYLE's flags and
 * the colour table, groups' opens and closes nested as the source's (a SWITCH needs no close), text pieces strings of at
 * most 16,000 code units with no control character but \n (C0, DEL, C1 and the bidirectional controls are refused; the
 * no-break space is text), at most PIECES_MAX pieces
 */
export declare function checkPieces(pieces: unknown, unit: LayoutUnit): TrPiece[] | null
/**
 * Why a laid unit may not be drawn, or null: 'lost' (a placeholder of the unit is LOST), 'missing' or 'twice' (a visible
 * placeholder not drawn exactly once by k; a crop on a page its segments are not on counts for none), 'overlap' (two
 * placeholders' segments share more than half the smaller), 'erase' (an erase rectangle meets a display's segment or a
 * label on its page by more than 0.5 pt), 'glyph' (a drawn character its face has not), 'brackets' (a bracket doubled)
 */
export declare function netOf(input: LayerInput, laid: LaidUnit, tr: Tr): Unfit['why'] | null
/** the net's checks that need no laying, which layUnit runs first: a LOST row in the unit */
export declare function lostIn(unit: LayoutUnit): boolean
/** a text piece holding a character no face of the role set holds (where tokensOf gave none: 'glyph', not 'tokens') */
export declare function heldByNone(pieces: readonly TrPiece[], roles: RoleSet): boolean

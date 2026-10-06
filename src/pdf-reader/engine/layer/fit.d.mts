// fit.mjs's types: a unit's translation set into the original's frames
import type { FaceId, RoleSet } from '../font-roles.mjs'
import type { LayerRules } from '../layer-rules.mjs'
import type { LayoutIndex } from '../layout/file.mjs'
import type { Hyphenator } from './hyphen.mjs'
import type { TrPiece } from './pieces.mjs'
import type { Measure, TextIn } from './tokens.mjs'

/** what the fit is given beside a unit's translation. `measure` is a face's width at 100 px; a face the role table gives a
 *  size correction (Face.size, below 1 for Source Han Serif K) is measured, and drawn, at the line's size × that */
export interface LayerInput { file: LayoutIndex; target: string; rules: LayerRules; roles: RoleSet; measure: Measure; hyphen: Hyphenator | null; textIn?: TextIn }
/** a unit's translation: its pieces and its sentence starts in trText (mt.mjs sentencesOf's `tr`), or null (lit whole) */
export interface Tr { pieces: readonly TrPiece[]; sentences: readonly number[] | null }
/**
 * A state of the fit. `scale`: × the original's size; `lead`: × the original's pitch (alphabets' lines also × scale);
 * `track`: CJK tracking and `letter`: alphabets' letter spacing, em per character (≤ 0); `compress`: full-width punctuation
 * compressed (breakLines'); `borrow`: PDF units of the space below the last frame its lines may take; `knob`: what this
 * state moved last ('even': where page-even started it)
 */
export interface FitState { scale: number; lead: number; track: number; letter: number; compress: 0 | 1 | 2; borrow: number; knob: 'none' | 'even' | 'track' | 'borrow' | 'lead' | 'shrink' }
/**
 * What a line draws, in reading order, each from `x` (PDF units; a mark compression shifted drawn back over its blank half)
 * with its width `w`. Every item is set at the line's size × its face's Face.size, and its `w` is exactly:
 * - 'text': its text's width there, plus the line's letterSpacing after every character (its spaces too), plus the line's
 *   wordSpacing more after every space. A text item is one of:
 *   - a CJK character where the target breaks between characters (zh, ja), or any CJK character the tracking moves (each
 *     at its own place, so its tracking is in `x` and `w`, not in letterSpacing);
 *   - a run of words in one face, caps and colour with the spaces between them: Latin words, and Korean's Hangul words
 *     while the tracking is none. A line justified between its characters (CJK) has a run a word, with no spaces in it;
 * - 'page-text': placeholder `ph` drawn as the page's own text `text`, in `face`: its width there, plus the line's
 *   letterSpacing after every character (its spaces too), and no word spacing;
 * - 'crop': placeholder `ph` drawn as the original's ink of its segments, scaled by the state's scale; `raised` is 1 for a
 *   raised mark (a superscript citation or footnote call), whose lift is its own ink's, else 0.
 * A placeholder is one item, never two. `from` and `to` are its offsets in trText: a space between two items is where
 * one's `to` falls short of the next's `from`, which the drawing writes for copying and finding. `colour`: LAYER_COLOURS'
 * index + 1, 0 for none
 */
export interface LaidItem {
  kind: 'text' | 'crop' | 'page-text'; x: number; w: number; text?: string; face?: FaceId; caps?: boolean; ph?: number; colour: number; raised: number; from: number; to: number
  /** 1 where a space of the translation follows it on its line (a space the breaker placed), which the drawing writes for
   *  copying and finding; absent elsewhere, also where trText has a space for a group's piece the translation has none at */
  space?: 1
}
/**
 * A line on its page and frame (the frame's index in the unit), its slot's left and right, its baseline (y up, PDF units)
 * and the size it is set at. `mode`: as placeLines left it. `letterSpacing`: PDF units after each character of its text
 * and page-text items (the state's letter spacing × the size: the alphabets'; 0 in a CJK target, whose tracking is in its
 * characters' places); `wordSpacing`: what each space of a text item takes beyond its own width and the letter spacing, as
 * SVG's word-spacing (the justification's extra per space, less letterSpacing). `from`, `to`: its items' offsets in trText
 */
export interface LaidLine { page: number; frame: number; x0: number; x1: number; baseline: number; size: number; mode: 'just' | 'last' | 'centred' | 'ragged'; items: LaidItem[]; wordSpacing: number; letterSpacing: number; from: number; to: number }
/**
 * A unit laid whole: its state, the size it is set at (PDF units: the original's size × scale), its lines in reading
 * order (each frame's in turn), each cut of a split unit as an offset in trText (the start of frame 1's part, frame 2's, …;
 * none for one frame), and how each placeholder the translation holds is drawn, by k
 */
export interface LaidUnit { id: number; fit: true; state: FitState; size: number; lines: LaidLine[]; cuts: number[]; drawn: ReadonlyMap<number, 'crop' | 'page-text' | 'kept'> }
/** a unit that stays the original's, and why: 'located' (no such unit, or no lines or frames), 'tokens' (not drawable, or
 *  nothing to draw), 'floor' (no state of the fit places every token); the rest are the net's (net.mjs): 'pieces' (refused by
 *  checkPieces), 'lost', 'glyph' (a character no face of the role set holds, or one its face has not), 'missing', 'twice',
 *  'overlap', 'erase', 'brackets' */
export interface Unfit { id: number; fit: false; why: 'located' | 'tokens' | 'floor' | 'pieces' | 'missing' | 'twice' | 'lost' | 'overlap' | 'erase' | 'glyph' | 'brackets' }
export type Laid = LaidUnit | Unfit
/** the fit's states in order, from the most natural (spec §4.5's order: tracking, the space below, leading, size): `below`
 *  and `pitch` are the last frame's (PDF units), `maxScale` page-even's start (the leading always starts at leadBase) */
export declare function statesOf(rules: LayerRules, o: { below: number; pitch: number; maxScale?: number }): Generator<FitState>
/** a unit laid into its frames, or why it stays the original's: its pieces checked first (checkPieces), the unit located,
 *  a LOST row refused, its tokens made, then laid at the first state that fits, which the completeness net (netOf) passes or
 *  refuses. No LaidUnit it returns is one the net refuses */
export declare function layUnit(input: LayerInput, id: number, tr: Tr, o?: { maxScale?: number }): Laid
/** a face's size correction (Face.size; 1 for a face with none): a run is measured, and drawn, at the line's size × it
 *  (tokens.mjs's, re-exported for the drawing) */
export declare function faceSize(face: FaceId | undefined): number
/** a split part's sentence start is taken within this share of the translation's length from its frame's share: 0.2 */
export declare const SPLIT_NEAR: number

// draw.mjs's types: what the web draws for a laid unit, as data
import type { FaceId } from '../font-roles.mjs'
import type { LayerInput, LaidUnit } from './fit.mjs'

/** what the web draws for a unit on a page, in PDF units (y up): the erase, the crops, the text */
export interface UnitDraw {
  id: number; page: number
  /** x0, y0, x1, y1 (stride 4): the layout's own erase for the unit's lines on the page, nothing else */
  erase: number[]
  /**
   * per crop segment: k, srcX0, srcBottom, srcX1, srcTop, dstX, dstBaseline, srcBaseline, scale (stride 9). The original
   * page's pixels inside the source rectangle, drawn at `scale` (the unit's) from dstX, a source height y at
   * dstBaseline + (y − srcBaseline) × scale. srcBaseline is the segment's line's in the original, so a raised mark keeps
   * its lift × the scale; a placeholder of several segments has them side by side, in order
   */
  crops: number[]
  lines: DrawLine[]
}
export interface DrawLine { baseline: number; runs: DrawRun[] }
/**
 * A run of text, set from `x` on its line's baseline (+ `shift`, the role's baseline shift: 0, the role table holds none).
 * `x`: one value for a run of Latin or Hangul words, a CJK word or a page text, whose characters follow on with the
 * letter and word spacing; one a UTF-16 code unit for a run that places each character (CJK characters, tracked Hangul,
 * every one in the BMP), its spacing 0. `size`: the line's × its face's Face.size, applied here once (no `size-adjust` in
 * `@font-face`). `colour`: LAYER_COLOURS' index + 1, 0 for none. A space at its end, or within a run that places each
 * character, stands for the gap in trText after an item, written for copying and finding. `from`, `to`: its first item's
 * start and its last item's end in trText
 */
export interface DrawRun { x: number[]; text: string; face: FaceId; caps: boolean; size: number; letterSpacing: number; wordSpacing: number; colour: number; shift: number; from: number; to: number }
export declare function drawUnit(input: LayerInput, laid: LaidUnit, page: number): UnitDraw
/** the laid boxes covering trText offsets [from, to): one a line (a sentence's shape), from where its first offset there is
 *  drawn to where its last ends (within a run of words by its share of the run's width), the line's em box high
 *  (0.75 of its size above its baseline, 0.25 below) */
export declare function spansOf(laid: LaidUnit, from: number, to: number): { page: number; x0: number; y0: number; x1: number; y1: number }[]
/** the laid unit and offset under a point of a page, the smallest line box that holds it (its slot widened to its items,
 *  its em box high); null on none */
export declare function unitAt(laid: Iterable<LaidUnit>, page: number, x: number, y: number): { id: number; offset: number } | null

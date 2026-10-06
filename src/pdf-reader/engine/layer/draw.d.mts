// draw.mjs's types: what the web draws for a laid unit, as data
import type { FaceId } from '../font-roles.mjs'
import type { LayerInput, LaidUnit } from './fit.mjs'

/** PDF units each of the layout's erase rectangles grows by, within its line's own ink band (0.3 em below its baseline,
 *  0.85 above) */
export declare const ERASE_PAD: 0.6
/** of a line's size, below and above its baseline: the band its glyphs' ink takes, which no other unit's erase enters */
export declare const INK_BAND: Readonly<{ below: 0.25; above: 0.8 }>
/** how the copy lays crops on what is under them: darkened in, each channel the darker of the two */
export declare const CROP_BLEND: 'darken'

/** what the web draws for a unit on a page, in PDF units (y up): the erase, the crops, the text */
export interface UnitDraw {
  id: number; page: number
  /**
   * x0, y0, x1, y1 (stride 4), for the unit's lines on the page and nothing else: the layout's own erase rectangles, each
   * grown by ERASE_PAD within its line's own band and kept off the ink band of every other unit's line (a line beside it on
   * its baseline takes only the pad); the pad given up where it would meet a kept rendering (a display, a label)
   */
  erase: number[]
  /** with the text-removed PDF, on a page it removed: the unit's removed glyphs' and rules' boxes (x0, y0, x1, y1, stride
   *  4), over which the reader puts the removed page's pixels in (swap.mjs swapMasks); `erase` is then empty */
  swap: number[]
  /** the page the crops are cut from: the original ('O'), or the text-removed PDF's page of the placeholders alone ('P') */
  cropsFrom: 'O' | 'P'
  /**
   * per crop segment: k, srcX0, srcBottom, srcX1, srcTop, dstX, dstBaseline, srcBaseline, scale (stride 9). The original
   * page's pixels inside the source rectangle, drawn at `scale` (the unit's) from dstX, a source height y at
   * dstBaseline + (y − srcBaseline) × scale. srcBaseline is the segment's line's in the original, so a raised mark keeps
   * its lift × the scale; a placeholder of several segments has them side by side, in order
   */
  crops: number[]
  /** how the copy lays the crops on what is under them (CROP_BLEND): darkened in, never pasted, so that a crop's own paper
   *  covers nothing under its box */
  blend: 'darken'
  lines: DrawLine[]
}
export interface DrawLine { baseline: number; runs: DrawRun[] }
/**
 * A run of text, set from `x` on its line's baseline (+ `shift`, the role's baseline shift: 0, the role table holds none).
 * `x`: one value for a run of Latin or Hangul words, a CJK word or a page text, whose characters follow on with the
 * letter and word spacing; one a UTF-16 code unit for a run that places each character (CJK characters, tracked Hangul,
 * every one in the BMP), its spacing 0. `size`: the line's × its face's Face.size, applied here once (no `size-adjust` in
 * `@font-face`). `colour`: LAYER_COLOURS' index + 1, 0 for none. A space at its end, or within a run that places each
 * character, is the translation's space after an item (LaidItem.space), written for copying and finding; after a crop it is
 * a run of its own, one space at the crop's right edge. None stands where trText has a space for a group's piece only. The
 * web keeps them (white-space: pre). `from`, `to`: its first item's start and its last item's end in trText
 */
export interface DrawRun { x: number[]; text: string; face: FaceId; caps: boolean; size: number; letterSpacing: number; wordSpacing: number; colour: number; shift: number; from: number; to: number }
/** the text-removed PDF's manifest entry for a page (layout/remove.mjs): whether it is removed, each unit's removed boxes */
export interface RemovedPage { ok: boolean; units?: Record<number, ArrayLike<number>> }
export declare function drawUnit(input: LayerInput, laid: LaidUnit, page: number, removed?: RemovedPage | null): UnitDraw
/** the laid boxes covering trText offsets [from, to): one a line (a sentence's shape), from where its first offset there is
 *  drawn to where its last ends (within a run of words by its share of the run's width), the line's em box high
 *  (0.75 of its size above its baseline, 0.25 below) */
export declare function spansOf(laid: LaidUnit, from: number, to: number): { page: number; x0: number; y0: number; x1: number; y1: number }[]
/** the laid unit and offset under a point of a page, the smallest line box that holds it (its slot widened to its items,
 *  its em box high); null on none */
export declare function unitAt(laid: Iterable<LaidUnit>, page: number, x: number, y: number): { id: number; offset: number } | null

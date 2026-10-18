// breaks.mjs's types: tokens into lines in the original's slots
import type { LayerRules } from '../rules/layer-rules.mjs'
import type { Hyphenator } from './hyphen.mjs'
import type { Measure, Token } from './tokens.mjs'

/** a space may shrink to this share of its width */
export declare const SPACE_MIN: number
/** em a CJK gap may grow by when justifying */
export declare const CJK_JUST_MAX: number

/** a line's place: its frame, page, left and right, baseline, and whether it is centred. `after` is how many of the unit's
 *  displays (its `block` tokens) lie above the line: a line below the first display has 1, and what follows that display in
 *  the translation goes to the first line whose `after` is at least 1 */
export interface Slot { frame: number; page: number; x0: number; x1: number; baseline: number; centred: boolean; after: number }

/**
 * `lines`: each as laid, never empty, in reading order. `items`: its tokens in order, each `w` its width at the size (with
 * tracking and compression), `asp` the gap before it (CJK–Latin autospace, 0 at a line's start), `shift` where compression
 * moves its glyph (an opening mark drawn back over its blank half), and `x` where it is drawn: the slot's left edge, the
 * gaps and widths before it, and its shift. `mode`: how the line is to be set: 'just' (justified, once placeLines has done
 * it), 'last' (the unit's last line, or one a break or a display ends), 'centred', or 'ragged' (to be justified, but not
 * within the caps).
 * `rest`: the content tokens (text and placeholders) left over where the slots ran out, or where the text would run on below a
 * display it has not reached: 0 when every token is placed.
 * `overflow`: how far the widest line runs past its slot, in ems of the size (so `overflow * f` PDF units), 0 where every line
 * fits: a line fits when its items, spaces at SPACE_MIN of their width, are no wider than the slot. A lone item that is wider
 * (a formula, a word no character of which fits) is placed all the same and shows here, never in `rest`. A closing mark
 * hung at a line's end and an opening mark shifted back by half an em are counted by their advances, which already leave out
 * what stands outside the slot: neither is overflow. Where it is above 0 the text would be clipped, and the unit is unfit.
 * `tokens`: the tokens the lines hold, in order: the input, where the breaker cut a word (by characters, or at a hyphen) its
 * pieces in the word's place.
 */
export interface Broken {
  lines: { slot: Slot; items: { t: Token; w: number; x: number; shift: number; asp: number }[]; mode: 'just' | 'last' | 'centred' | 'ragged' }[]
  rest: number
  overflow: number
  tokens: Token[]
}

/**
 * Tokens into slots at size f (PDF units), greedily; tracking (CJK, em per character), letter spacing (Latin, em per
 * character) and compression as `state` gives them. Takes its tokens and slots as they are, never changing either.
 */
export declare function breakLines(tokens: readonly Token[], slots: readonly Slot[], f: number, state: { track: number; letter: number; compress: 0 | 1 | 2 }, o: { rules: LayerRules; target: string; measure: Measure; hyphen: Hyphenator | null }): Broken

/** each line's items placed: justified within the caps, else ragged; the unit's last line and a centred block's not */
export declare function placeLines(b: Broken, f: number, o: { rules: LayerRules; target: string }): void

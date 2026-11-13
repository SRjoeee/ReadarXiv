// The shapes the breaker and the fit read and make (today's: layer2.d.mts Block2, Slot, Layout, LaidLine), for the facades
// of the modules moved as JavaScript (breaker/*.types.ts, fit/*.types.ts, shared/*.types.ts). Today's intermediate
// shapes (design-b §1.4): the adapter from format's Part to them is layFlow's.
import type { FitMeasure } from '../breaker/measure.ts'
import type { Patterns } from '../breaker/hyph.ts'
import type { Token } from '../breaker/tokens.ts'
import type { DecorBlock } from '../unit/decor.ts'

/** a block as the walk reads it: U.blocks' and U.decor's, with what the row's start (F1) and the borrow room set on it */
export type FitBlock = DecorBlock & {
  /** where the first line starts on a shared row or after a name (S.rowStart, S.nameLed) */
  start?: number
  startY?: number
  onLead?: boolean
  /** a unit laid on from the unit before over the rows it left: the shared row's baseline and that unit's block */
  flowX?: { y: number; lead: FitBlock | null }
  opens?: true
  widened?: boolean
  /** where a label TeX hung beside the block's text is laid (lay/adapt.ts): its first line starts there; its text hangs at the
   *  drawn label's end and `hangGap`, the space TeX set after the label (PDF units at the original's size), every line of the
   *  block from that edge (B.slots, breakLines) */
  hang?: number
  hangGap?: number
  /** the ink that stays beside its lines (lay/adapt.ts, from Room.stays: a mark set after a space, a frame's rule), each piece's box
   *  and the side of the original's line it stood on: every slot whose line reaches it keeps off it (B.slots) */
  stays?: Stay[]
  /** where the block's last line ends a run of its lines (lay/adapt.ts, Room.runs): the depth under its last baseline of TeX's
   *  text block bottom and of the next ink's bound (TeX's separation over it), Room.runs' [2] and [1] - Room.sep, which the
   *  borrow past the bottom reads apart (§18.37, B.slots roomOf) */
  toFoot?: number
  toInk?: number
}
/** ink beside a unit's line that no translation replaces: its box, whether it stood after the line's end (else before its
 *  start), and how far off it TeX set that line (`gap`: from the line's end to it, or from it to the line's start) */
export type Stay = { right: boolean; x0: number; y0: number; x1: number; y1: number; gap: number }
/** a state of the fit (statesOf): its leading, tracking, compression, borrowing, scale and the knob that set it */
export type FitState = {
  lead: number
  track: number
  trackLatin: number
  compress: number
  borrow: number
  scale: number
  knob: string
  fitTrack?: number
  /** a state of the page fill's, whose last frame's slots stop at the gap's floor (B.slots footFloorAt): read as a flag; its
   *  writers set `1` (S.fill.page) and `true` (S.fill.leads) */
  box?: number | boolean
  /** by block, the leading of a frame before the unit's last (a page's, a column's), where the page fill set it looser than
   *  `lead`, which is the last frame's (S.fill.leads): each frame of a paragraph filled over its own block; none (a hole) for
   *  a block of the last frame, which takes `lead` */
  leads?: (number | undefined)[]
  /** how much lower the unit's first block stands than TeX set it, the room the gap over it lacks where the paragraph over it
   *  cannot end higher (S.fill.page headOf), in the page fill's states alone */
  head?: number
  /** a state that holds the frames' share (the cuts pageCutsOf marks `share` kept), the page fill's where that costs no frame a
   *  leading under its page's band (S.fill.page) */
  share?: number
  /** how far under TeX's text block bottom the state's last line may stand (§18.37, statesOf's state before each shrink step,
   *  PAST_FOOT); once it sets every token, the depth its lines took (layoutUnit2) */
  over?: number
}
/** the unit's parameters: the target's rules (resolveRules' params), U.params', and the call's measure and patterns */
export type FitParams = {
  cjk?: boolean
  order: readonly string[]
  leadBase: number
  leadFloor: number
  trackMin: number
  compressMax: number
  borrow: number | boolean
  floor: number
  step: number
  trackStart?: number
  capScale?: number
  /** TeX's \lineskip and \lineskiplimit (Part.paper.lineskip, lay/adapt.ts), a pair */
  lineskip?: readonly [skip: number, limit: number] | null
  halfLead?: { head: boolean; foot: boolean; below: number } | null
  lastLines?: boolean
  noStart?: string
  noEnd?: string
  hyphen?: boolean | number
  hyphenation?: Record<string, unknown>
  /** the target's spacing (ScriptRules, resolveRules' params): a space's least and most share of its width as a line shrinks
   *  and stretches it, a CJK gap's most stretch (em), the space set between CJK and Latin text (em), and whether the script
   *  breaks between words only (keepAll) */
  spaceMin: number
  spaceMax: number
  cjkJust: number
  autospace: number
  keepAll: boolean
  /** a run laid alone (fit/runs.ts runParams): its first block's place in the unit */
  blockBase?: number
  /** the state's compression, which laidOut (B.place) sets on the call's parameters before placeItems reads it */
  _compress?: number
  /** the measures of the call (fitMeasure over Metrics) */
  measure: FitMeasure
  /** each language's hyphenation patterns (hyphenationOf), the run's */
  patterns?: Readonly<Record<string, Patterns | null>>
  [more: string]: unknown
}
/** a laid item: its token, width, place and what the placing set on it */
export type LaidItem = { t: Token; w: number; x?: number; shift?: number; asp?: number; kern?: number; cut?: boolean }
/** a laid line (a slot filled): its block, page, extent, baseline, the original's line it stands on, its items */
export type LaidLine = {
  block: number
  page: number
  x0: number
  x1: number
  baseline: number
  target?: number | null
  centred?: boolean
  flush?: 'left' | 'right'
  items: LaidItem[]
  from: number
  mode?: string
  used?: number
  cap?: number
  ends?: boolean
  squeezed?: boolean
  opened?: number
  seg?: { f: number; scale: number; state: FitState }
  [more: string]: unknown
}
/** a unit laid out (laidOut): its lines, size, scale, state and what it set and lost */
export type Layout = {
  lines: LaidLine[]
  f: number
  s: number
  scale: number
  state: FitState
  knob: string
  clipped: boolean
  lostChars: number
  chars: number
  tried: number
  spilled: boolean
  opened: number
  unopened: number
  tokens?: Token[]
}
/** the tokens a layout was laid from (layoutCut: with the page breaks where it was cut) */
export type Tokens = Token[] & { base?: unknown }

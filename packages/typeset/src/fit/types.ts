// The shapes the breaker and the fit read and make (today's: layer2.d.mts Block2, Slot, Layout, LaidLine), for the facades
// of the modules moved as JavaScript (breaker/*.types.ts, fit/*.types.ts, shared/*.types.ts). Today's intermediate
// shapes (design-b §1.4): the adapter from format's Part to them is layFlow's.
import type { FitMeasure } from '../breaker/measure.ts'
import type { Patterns } from '../breaker/hyph.ts'
import type { Token } from '../breaker/tokens.ts'
import type { DecorBlock } from '../unit/decor.ts'

/** a block as the walk reads it: U.blocks' and U.decor's, with what the row's start (F1) set on it */
export type FitBlock = DecorBlock & {
  /** where the first line starts on a shared row or after a name (S.rowStart, S.nameLed) */
  start?: number
  startY?: number
  onLead?: boolean
  /** a unit laid on from the unit before over the rows it left: the shared row's baseline and that unit's block */
  flowX?: { y: number; lead: FitBlock | null }
  opens?: true
  widened?: boolean
}
/** a state of the fit (statesOf): its leading, tracking, compression, scale and the knob that set it */
export type FitState = {
  lead: number
  track: number
  trackLatin: number
  compress: number
  scale: number
  knob: string
  fitTrack?: number
  next?: number
  box?: number
}
/** the unit's parameters: the target's rules (resolveRules' params), U.params', and the call's measure and patterns */
export type FitParams = {
  cjk?: boolean
  order: readonly string[]
  leadBase: number
  leadFloor: number
  trackMin: number
  compressMax: number
  floor: number
  step: number
  trackStart?: number
  capScale?: number
  lineskip?: readonly number[] | null
  halfLead?: { head: boolean; foot: boolean; below: number } | null
  lastLines?: boolean
  noStart?: string
  noEnd?: string
  hyphen?: boolean | number
  hyphenation?: Record<string, unknown>
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

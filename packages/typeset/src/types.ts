// The typesetter's entry and its result, as decided (interfaces/page/DECISION.md: the objects and the entry are design A's,
// design-a.md §1.2; the inside and the ledger are design B's, design-b.md §1.5 to §1.7). Types only: the composition
// (layPage, layFlow) is built from the rules once each rule is proven against today's recorded outputs (the tap).
import type { Box, Id, Ink, Link, Part, Placed, Row } from '@readarxiv/format'

/** a target language's tag (BCP 47, as the rule set's `languages` names it) */
export type Lang = string
/** the scripts the rule set holds rules for (rules/layout-rules.json `scripts`) */
export type Script = 'Hans' | 'Hant' | 'Jpan' | 'Kore' | 'Latn' | 'Cyrl'

/**
 * A served face, as the host loads and measures it: today's canvas font string at 100 px (fonts.mjs fontString(face, 100):
 * `400 100px "axt-nimbus-roman", "axt-lm-math", "axt-shs-sc"`). The tap's recorded widths are keyed by it
 * (`metrics/<pair>.metrics.json.gz`), so a face is named by it; a canvas adapter sets the font at the asked size from it
 */
export type FaceId = string

/** the rows of one target: a row by unit id, and whether no other row will come (design-a §1.2) */
export interface Rows {
  get(id: Id): Row | undefined
  readonly done: boolean
}

/**
 * The host's served faces, the typesetter's only platform input (design-a §1.2). Inside one call it answers from the faces
 * loaded at the call's start. `advance` is the text's advance at `size` (PDF units at size `size`, as a canvas measures it
 * with its font at that many px); `ink` its ink over and under the baseline and how far right of its start its ink ends.
 * `ready`: the face is loaded and holds every character of `text`; 'never' where no slice of it holds one
 */
export interface Metrics {
  ready(face: FaceId, text: string): boolean | 'never'
  advance(face: FaceId, size: number, text: string): number
  ink(face: FaceId, size: number, text: string): [ascent: number, descent: number, right: number]
}

/** the reader's choices that change what is laid (design-a §1.2) */
export type Choices = {
  captions?: { figure: 'target' | 'original'; table: 'target' | 'original' }
  leave?: string[]
}

/** a language's hyphenation: its patterns as data (never fetched by the typesetter) and babel's minimums */
export type Hyphenation = {
  lang: string
  minWord: number
  left: number
  right: number
  /** the patterns, as rules/hyph.mjs hyphenationOf reads them; null where the language has none */
  patterns: unknown
}

/**
 * Everything typographic the typesetter reads, for one target: the rule set's fields (inventory §4.1) resolved for it
 * (rules/layout.mjs resolveRules), the approved rulings and the TeX facts it still applies (§4.2's classes R, T, I), the
 * reader's choices. Data, not a seam (design-a §4): tests pass edited values
 */
export type Rules = Readonly<{
  target: Lang
  script: Script
  fit: {
    order: readonly ('track' | 'borrow' | 'lead' | 'shrink')[]
    leadBase: number
    leadFloor: number
    trackMin: number
    compressMax: number
    borrow: number
    borrowGap: number
    floor: number
    floorMin: number
    step: number
    further: readonly ('widen' | 'shrink')[]
    cjkJust: number
    spaceMax: number
    spaceMin: number
    autospace: number
  }
  fill: {
    band: number
    track: number
    size: number
    lead: number | null
    leadRel: number | null
    kinds: readonly string[]
  }
  breaking: {
    keepAll: boolean
    cjkQuotes: boolean
    centredPunct: boolean
    noStart: string
    noEnd: string
    hyphen: boolean
    hyphenation: readonly Hyphenation[]
  }
  cells: { clear: number; capMin: number; namesShare: number }
  /** babel's names and the float labels in the target (A5) */
  words: Readonly<Record<string, string>>
  /** style × script → face, and the faces' size corrections (rules/font-roles.mjs), resolved for the paper's family */
  faces: FaceTable
  /** TeX facts the typesetter still applies (inventory §4.2, class T/I) */
  tex: { predisplay: number; copySpace: number }
  captions: NonNullable<Choices['captions']>
  leave: readonly string[]
}>

/** the faces the typesetter sets text in: by role, weight, slant and script class; with each face's size correction */
export type FaceTable = Readonly<{
  pick(style: { role: 'serif' | 'sans' | 'mono'; bold?: boolean; slant?: boolean; caps?: boolean }, cls: string): FaceId
  size(face: FaceId): number
}>

/** a shared decision handed to one member by layPage (design-a §1.2) */
export type Given = { lead?: number; track?: number; size?: number; leave?: Why }

/** why a member stays the original's: the prepare's, the rows', the typesetter's (design-a §1.2) */
export type Why =
  | 'unlocated'
  | 'unwrapped'
  | 'page'
  | 'none'
  | 'left'
  | 'refused'
  | 'unavailable'
  | 'unconfigured'
  | 'aborted'
  | 'waiting'
  | 'unfit'
  | 'face'
  | 'cells'
  | 'size'
  | 'pages'
  | 'name'
  | 'bound'
  | 'kind'
  | 'error'

/**
 * What a laid line holds: a run of one face, or a crop of an element's ink (its source ink `src` set with its base on the
 * line's baseline, scaled by `k`; `s` its copy text, `piece` its element, 'label' or 'counter')
 */
export type Item =
  | { s: string; x: number; face: FaceId; size: number; fill?: number; skew?: 1; dx?: number[] }
  | { s: string; x: number; src: Ink; k: number; piece: string }

/** one member on one page, as laid (design-a §1.2) */
export type Laid = {
  ord: number
  page: number
  state: 'laid' | Why
  /** this member's groups turned off on this page: 1 text, 2 elements, 4 label */
  off: number
  fit?: { size: number; lead: number; track: number; borrowed: number }
  /** its laid lines on this page, baseline first */
  lines: [y: number, x0: number, x1: number, items: Item[]][]
  /** per sentence, on A (left) and as drawn (right); `own`: its kept ink, the same boxes on both panes */
  lit: { left: Box[][]; right: Box[][]; own: [piece: string, boxes: Box[]][] }
}

/** a page, laid or waiting (design-a §1.2); `ledger` where the call asked for a trace (design-b §1.7) */
export type Page = {
  page: number
  /** non-empty: not committed; every member is 'waiting', nothing off */
  wait: { rows: Id[]; faces: [FaceId, string][] }
  members: Laid[]
  links: [box: Box, to: Link['to']][]
  ledger?: PageLedger
}

// ---------------------------------------------------------------- the ledger (design-b §1.7, the tap's slots)

/** a rule's home (design-b §1.1) */
export type Home = 'fact' | 'unit' | 'shared' | 'breaker' | 'fit' | 'emit'
/** a rule's id: a persisted vocabulary, the gate's ledgers kept in lab-data are read across versions */
export type RuleId = `F.${string}` | `U.${string}` | `S.${string}` | `B.${string}` | `X.${string}` | `D.${string}`
/** design-b's fixed order (§1.6): the step a rule is applied at */
export type Step =
  | 'L1'
  | 'L2'
  | 'L3'
  | 'L4'
  | 'L5'
  | 'L6'
  | 'L7'
  | 'L8'
  | 'L9'
  | 'L10'
  | 'L11'
  | `F${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | 'out'
/** a JSON value: what a slot holds (numbers as JSON prints them, non-finite as strings: the tap's rule) */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
/**
 * One rule applied to one member, in step order: the tap's slot (baseline/tap/TAP.md §3), so that the gate compares the
 * port's ledger with today's slot by slot and names the first rule whose value differs. `round`: the member's lay (today a
 * unit laid again is a round of its own; 0 for the slots before any lay)
 */
export type LedgerSlot = { step: Step; by: RuleId; round: number; value: Json }
/** what a rule returns into the ledger */
export type Decided<T> = { by: RuleId; value: T }
/** a page's ledger: each member's slots, each pass page's fill target, the table groups read */
export type PageLedger = {
  units: { ord: number; slots: LedgerSlot[] }[]
  passes: { page: number; target: Json }[]
  tables: Json[]
}
/** what the trace asks: the decisions (O(members)) or every state the walks and the fill tried too */
export type Trace = 'decisions' | 'full'

// ---------------------------------------------------------------- the entry

/** layPage: one page from its part, pure, called in every state (design-a §1.2); `trace` adds the ledger (design-b §1.6) */
export type LayPage = (part: Part, rows: Rows, rules: Rules, metrics: Metrics, o?: { trace?: Trace }) => Page
/** layFlow: one flow's members laid, given what layPage decided for them; exported for tests and the gate */
export type LayFlow = (
  flow: readonly Placed[],
  rows: Rows,
  given: readonly (Given | undefined)[],
  rules: Rules,
  metrics: Metrics,
  o?: { trace?: Trace },
) => { laid: Laid[]; ledger?: PageLedger['units'] }

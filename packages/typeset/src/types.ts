// The typesetter's entry and its result. Types only: the composition (layPage, layFlow) is in lay/.
import type { Box, Id, Ink, Link, PrepWhy, Row, Why as RowWhy } from '@readarxiv/format'
import type { ScriptRules } from './data/rules/types.ts'
import type { RefNames } from './unit/rename.ts'
import type { ParasStated } from './unit/breaks.ts'

/** a target language's tag (BCP 47, as the rule set's `languages` names it) */
export type Lang = string
/** the scripts the rule set holds rules for (rules/layout-rules.json `scripts`) */
export type Script = 'Hans' | 'Hant' | 'Jpan' | 'Kore' | 'Latn' | 'Cyrl'

/**
 * A served face, as the host loads and measures it: its canvas font string at 100 px (breaker/measure.ts
 * fontString(face, 100): `400 100px "axt-nimbus-roman", "axt-lm-math", "axt-shs-sc"`). The tap's recorded widths are keyed
 * by it (`metrics/<pair>.metrics.json.gz`), so a face is named by it; a canvas adapter sets the font at the asked size from it
 */
export type FaceId = string

/** the rows of one target: a row by unit id, and whether no other row will come; `kept`, a unit the paper
 *  keeps as it is (format's Unit.kept: never sent to a translator), whose row never comes: none waited for, read as no row
 *  (`none`) as once the rows have ended */
export interface Rows {
  get(id: Id): Row | undefined
  readonly done: boolean
  kept?(id: Id): boolean
}

/**
 * The host's served faces, the typesetter's only platform input. Inside one call it answers from the faces
 * loaded at the call's start. `advance` is the text's advance at `size` (PDF units at size `size`, as a canvas measures it
 * with its font at that many px); `ink` its ink over and under the baseline and how far right of its start its ink ends.
 * `ready`: the face is loaded and holds every character of `text`; 'never' where no slice of it holds one, or where a slice it
 * needs is lost (for now or for the visit: the host's failure, which it tells and mends). `holds`, where the host states it:
 * whether the served catalogue declares every character of `text` in a face of the string, whatever is loaded or lost (true
 * where a table it needs cannot be had: not known); a host that states none is read as holding every one
 */
export interface Metrics {
  ready(face: FaceId, text: string): boolean | 'never'
  advance(face: FaceId, size: number, text: string): number
  ink(face: FaceId, size: number, text: string): [ascent: number, descent: number, right: number]
  holds?(face: FaceId, text: string): boolean
}

/** the reader's choices that change what is laid */
export type Choices = {
  captions?: { figure: 'target' | 'original'; table: 'target' | 'original' }
  /** the unit kinds the reader shows untranslated (`Kind[]`: a toggle's kinds, e.g. the references' `reference`,
   *  `refnames`, `inkreferences`); layPage leaves a member the original's (`left`) whose toggleKind (format's: the block its
   *  source ties it to, Placed.of, else its kind) is one */
  leave?: string[]
  /** how far a unit's last line may stand under TeX's text block bottom, in points, where that keeps it from a step down its
   *  fit's sizes (docs/PDF-READER.md §18.37): none, the rule's (fit/walk.ts PAST_FOOT); 0, never (the switch) */
  pastFoot?: number
}

/**
 * Everything typographic the typesetter reads, for one target: the rule set's fields resolved for it
 * (`set`: resolveRules' params, by the names every rule reads them by), its labels and babel's names, the hyphenation
 * patterns the host handed in (never fetched by the typesetter), the reader's choices. Built by `rulesFor` (rules-for.ts)
 * from one data file a language (src/data/rules/). Data, not a seam: tests pass edited values
 */
export type Rules = Readonly<{
  target: Lang
  script: Script
  set: RuleParams
  /** the float labels and babel's names in the target (A5) */
  labels: Readonly<Record<string, string>>
  /** a theorem-like head's names in the target (translator's dictionaries, ctex's: the rule set's heads.ts, from
   *  rules/tex-names.json), English → the target's; empty where its packages name none, null for a target the file names not */
  heads: Readonly<Record<string, string>> | null
  /** the names TeX's cross-referencing packages generate (cleveref's, hyperref's: "Figure 3", a citation's note), prepared for
   *  the target (U.rename's RefNames: the rule set's refs.ts, from rules/tex-names.json; `target` null where it names none) */
  refs: RefNames
  /** the languages whose hyphenation patterns it reads: English's for every Latin word, the target's own Latin and Cyrillic */
  patterns: readonly string[]
  /** each of those languages' patterns, as the host loaded them (hyph.ts hyphenationOf); a language absent has none */
  hyph: Readonly<Record<string, unknown>>
  /** the CJK font group the target's text is set in */
  cjkFaces: { group: string } | null
  captions: NonNullable<Choices['captions']>
  leave: readonly string[]
}>
/** the rule set's fields as resolved for a target (rules/layout.mjs resolveRules' params): the script's, the language's over
 *  them, `cjk` from the script, babel's hyphenation minimums */
export type RuleParams = Readonly<
  Omit<ScriptRules, 'cjkFaces'> & {
    cjk: boolean
    hyphenation: Readonly<Record<string, unknown>>
    /** the reader's Choices.pastFoot where it gives one, else absent (the fit's PAST_FOOT) */
    pastFoot?: number
  }
>

/**
 * Why a member stays the original's (`Unlaid`: `packages/format`'s `Why` is a row's failure, what the translate chain
 * yields): the prepare's reasons (format's PrepWhy), the rows' reason kinds (format's Why['kind']), no row by the rows' end
 * (`none`), a unit the paper keeps as it is (`kept`: format's Unit.kept, never sent, its row never coming), the reader's
 * leave (`left`), and the typesetter's own
 */
export type Unlaid =
  | PrepWhy
  | RowWhy['kind']
  | 'none'
  | 'kept'
  | 'left'
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
  | {
      s: string
      x: number
      face: FaceId
      size: number
      fill?: number
      skew?: 1
      dx?: number[]
      /** a superscript's raise over the line's baseline, PDF units (a footnote's mark, a symbol drawn raised: 0.36 of the line's
       *  size); the page's drawing sets the run that much higher (unraised, it stood on the baseline) */
      rise?: number
      /** a run set along a direction (a figure text the original sets turned: Placed.dir, a unit vector, the page's y up): its
       *  line's baseline runs from (x0, y) along it, and `x` (and `dx`) is its place along it from x0 (x − x0 its distance from
       *  the line's start); drawn turned, its characters along it, a raise across it */
      dir?: [ux: number, uy: number]
      /** the tracking after each of its characters, PDF units (a run of one x laid with tracking, the fit's state's: its
       *  characters' advances the face's and this; display.ts lineRuns), drawn by the page's painter */
      track?: number
    }
  /** a crop; `cut` its edges cut from its element's ink between two glyphs (1 its left, 2 its right: a URL broken where TeX's
   *  url package breaks it), which the reader draws with no antialiased margin; `ink` its own ink, its piece's boxes on its
   *  line as the part states them (its page's PDF units; none where the part states none of its piece: lay/clips.ts), the
   *  reader's to cut it by; `of` the member whose label it is where another member's line draws it (a label no line opens with,
   *  carried to the end of the name before, lay/flow.ts): lit, cut and counted as that member's; `dir` a crop of a line laid in a
   *  frame (a unit TeX set turned, Part.frames): its line from its origin along it as a run's, its `src` and `ink` stated in the
   *  frame, which the reader turns onto the page (docs/PDF-READER.md §18.111) */
  | {
      s: string
      x: number
      src: Ink
      k: number
      piece: string
      cut?: 1 | 2 | 3
      ink?: Box[]
      of?: number
      dir?: [ux: number, uy: number]
    }

/** the fit's knobs a unit under its page's band may take in the fill (shared/fill-page.ts evenOf, docs/PDF-READER.md §18.57): its
 *  tracking, the room TeX left under its blocks, one step of its sizes; and at a column's foot the room past TeX's text block bottom
 *  (the borrow's own, §18.37). Here, where Laid states it, so that the page's fill imports it and no type cycle runs through it */
export type EvenKnob = 'track' | 'room' | 'size' | 'foot'
/** one member on one page, as laid */
export type Laid = {
  ord: number
  page: number
  state: 'laid' | Unlaid
  /** a member of one of its part's frames (Part.frames: a unit TeX set turned), laid in the frame and stated on the page through
   *  the frame's direction: its lines turned runs (their items' `dir`), its lit in the frame (`lit.dir`) */
  frame?: [ux: number, uy: number]
  /** this member's groups turned off on this page: 1 text, 2 elements, 4 label */
  off: number
  /** its fit's size, leading and tracking, and the lines its borrow knob let it lay under a block (99: all its room holds);
   *  `over` where a state of it let its lines past TeX's text block bottom (the fit's borrow, docs/PDF-READER.md §18.37; the
   *  page fill's foot step, §18.57): how far under that bottom its lowest line stands, points, to the hundredth up; none where
   *  no line of it stands there */
  fit?: { size: number; lead: number; track: number; borrowed: number; over?: number }
  /** a tight paragraph the page's fill evened (§18.57): `by` the fit's knobs it took that its final lines carry, in the order
   *  taken (none carried: not stated); `lines` its line count on this page at its fitted layout, before them */
  evened?: { by: EvenKnob[]; lines: number }
  /** a member of a size tie (one paragraph of TeX's the front end cut, a run-in head and its paragraph) laid at the tie's one size, the least its
   *  members need (docs/PDF-READER.md §18.64): that scale of its own size, and the member whose own need set it (`by`, itself
   *  where it is that member, which then states the size step among its `evened` knobs where its page's fill took it) */
  tie?: { scale: number; by: number }
  /** the paragraph points its part states by their first word (Placed.paras), where it states one: how many
   *  opened a block on the line TeX opened them on, how many flowed on for want of a sentence start of its row at the point's
   *  word, how many for want of its row's sentences (unit/breaks.ts paraPieces); where its part names the element a point
   *  stands after (Placed.parasAfter), also how many opened directly after their element and how many flowed on because the
   *  row does not return their element exactly once. A part that states none, none */
  paras?: ParasStated
  /** its laid lines on this page, baseline first (a turned line, its items' `dir`: from its origin (x0, y), x1 − x0 its length
   *  along it) */
  lines: [y: number, x0: number, x1: number, items: Item[]][]
  /** per sentence, on A (left) and as drawn (right); `own`: its kept ink, the same boxes on both panes; `dir` where the member is
   *  set along a direction (a figure text the original sets turned, Placed.dir): every box of it is in its run's frame, [s0, t0,
   *  s1, t1] along `dir` and across it (the page's point s·(ux, uy) + t·(−uy, ux)), lit turned with its text; `band` a figure
   *  text's (Placed kind 'figure'): lit on its own lines' band alone, no pad beside nor half the page's leading over and under
   *  (that leading is the page's body text's: a 4.67 pt label padded by it reached the label behind, docs/PDF-READER.md §17.9) */
  lit: {
    left: Box[][]
    right: Box[][]
    own: [piece: string, boxes: Box[]][]
    dir?: [ux: number, uy: number]
    band?: true
  }
}

/** a page, laid or waiting; `ledger` where the call asked for a trace */
export type Page = {
  page: number
  /** non-empty: not committed; every member is 'waiting', nothing off */
  wait: { rows: Id[]; faces: [FaceId, string][] }
  members: Laid[]
  /** the page's links as drawn: moved with their pieces, else at A's boxes; `owner` the ord of the member that holds one (Link's
   *  owner), so that a reader leaving that member the original's puts its links back at A's boxes; `border` its own
   *  annotation's on A (Link.border, moved or not), none where it has none */
  links: [box: Box, to: Link['to'], owner?: number, border?: Link['border']][]
  /** every piece's ink the part states (each element's, label's and counter's box) on the pages the page's crops are cut from:
   *  what a crop's antialiased edge must leave behind; none where it draws no crop (lay/clips.ts) */
  inks?: Ink[]
  ledger?: PageLedger
}

// ---------------------------------------------------------------- the ledger (the tap's slots)

/** a rule's home */
export type Home = 'fact' | 'unit' | 'shared' | 'breaker' | 'fit' | 'emit'
/** a rule's id: a persisted vocabulary, the gate's ledgers kept in lab-data are read across versions */
export type RuleId = `F.${string}` | `U.${string}` | `S.${string}` | `B.${string}` | `X.${string}` | `D.${string}`
/** the steps' fixed order: the step a rule is applied at */
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
 * One rule applied to one member, in step order: the tap's slot, so that the gate compares the
 * typesetter's ledger with the recorded one slot by slot and names the first rule whose value differs. `round`: the member's
 * lay (a unit laid again is a round of its own; 0 for the slots before any lay)
 */
export type LedgerSlot = { step: Step; by: RuleId; round: number; value: Json }
/** a page's ledger: each member's slots, each pass page's fill target, the table groups read */
type PageLedger = {
  units: { ord: number; slots: LedgerSlot[] }[]
  passes: { page: number; target: Json }[]
  tables: Json[]
}

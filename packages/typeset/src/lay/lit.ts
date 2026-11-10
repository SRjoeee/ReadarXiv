// Laid.lit (design-a §1.2; docs/PDF-READER.md §17): what each pane lights of a member on a page, per sentence, from the same
// boxes on both panes' terms. A member lights by sentence where its row carries its sentences (Row.sentences: where each
// sentence after the first begins in the unit's source projection and in its translation's, the translator's own cuts) and
// its part places its words on A (Placed.words, which the prepare states for a unit lit by sentence, Unit.sentences): each
// start found on both panes, one entry a sentence, numbered alike on every page the member is on (an entry empty on a page
// that holds none of that sentence). Else it lights whole, one entry a pane, both panes together (a unit never lights by
// sentence on one pane and whole on the other). Today's rule (anchors.mjs sentenceStarts, words.mjs, highlight.mjs):
// - on the left, A: a start at its sentence's first word the part places, its second or third where the first is not
//   (LATE), past that none; its lines' boxes (each line's ink across, its fonts' boxes up and down) cut at the starts' glyphs;
//   its label where it is drawn anew and the babel name it is led by widening its first sentence's row (today's unitRuns: a
//   label or a lead with no row of its own widens its unit's row);
// - on the right, as drawn: its laid lines' tokens (D.sentences' tokenBox), each in the sentence its start falls in (a text
//   token's place in the translation, one of no place of its own its neighbour's: words.mjs addUnitWords), the sentence's
//   start its first word's, from the opening brackets and quotes set against it; and the lines it keeps where they stand (a
//   held line: its ink stays), in the sentence they stand in on A;
// - an element, one piece on both panes, in one sentence on both (sentenceMap, the one place that decides it): the one its ink
//   begins in on A, wherever the translation sets it, its crop or its text as drawn and its ink on A lit with it, the row it
//   stands on widened over its ink (one TeX set past its line's text, an equation's number at the margin, stands in no line's
//   box). A translator counts a mark at a cut with either sentence: Microsoft set its cut past "P²-MOPD", which begins the
//   next sentence in the translation as in the source, and the left lit it from "P²-MOPD" on, the right with the sentence
//   before (2611.03953v2 p2, the owner's report of 2026-11-10); 425 elements of the corpus's laid pages over today's rows lit
//   with one sentence on one pane and another on the other (the sentence cover, packages/typeset/tests/replay/cover.ts);
// - `own`: its displays (D.groups' shown), each a block of its own by its piece, the same boxes on both panes: lit alone where the
//   pointer is over it, never with its member, whole or by sentence, and no row of its text (today's units.mjs displayBlockId:
//   one hover id a display; the owner's reports of 2026-11-09, a sentence lit over its display on 2602.23285v2 p15, a paragraph
//   lit over both of its on 2609.33403v1). The rest of the ink it keeps (a piece or a label kept where it stands, a character)
//   lights with its member, on both panes the row it stands on widened over it (today's unitRuns), else a row of its own: lit
//   by sentence, a kept piece with its sentence (an element no sentence of the translation places, the sentence it stands in on
//   A, as a held line), a label with the first, a kept character with the token beside it (words.mjs: the owner, 2026-10-30).
// A member not laid, and every member of a page that waits, lights from A on both panes: the right mirrors the left (by
// sentence where its row's starts are found on A), its displays apart as above. A figure text the original sets turned
// (Placed.dir, its run Placed.run) is lit whole, turned with its text: its boxes in its run's frame (Laid.lit's `dir`), on A its
// run's box, as drawn its line along it, never the level box its turned box stands in on the page
// (a label set at 30° stands in a level box about twice its height, over its neighbours': 336 of the 1,887 turned figure texts
// over the 87 corpus bundles).
import type { Box, Ink, Placed } from '@readarxiv/format'
import { plainTracker, shown, type TextPiece } from '../breaker/text.ts'
import { type GroupEl, groupsOff, type Shown } from '../emit/groups.ts'
import { lineBoxes, onDisplay, tokenBox } from '../emit/sentences.ts'
import type { Layout } from '../fit/types.ts'
import type { Laid } from '../types.ts'
import type { V0Piece } from '../unit/breaks.ts'

type Line = Placed['lines'][number]
type Lit = Laid['lit']
const KEPT = 1

/** a line's box on A: its ink across, its fonts' boxes up and down */
const boxOfLine = (l: Line): Box => [l[2], l[6], l[3], l[5]]
/** a line as ink: page, its box, its baseline */
export const inkOfLine = (l: Line): Ink => [l[0], l[2], l[6], l[3], l[5], l[4]]

/** `rows` with ink of the member's that has no row of its own: the row whose band holds its baseline widened over it, else a
 *  row of its own */
function widened(rows: Box[], ink: readonly Ink[], page: number): Box[] {
  const out = rows.map((b) => [...b] as Box)
  for (const k of ink) if (k[0] === page) widen(out, k)
  return out
}
/** how far apart across two extents stand (0 where they meet) */
const apartAcross = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, a0 - b1, b0 - a1)
/** one piece of ink into `rows`, in place: the row whose band holds its baseline widened over it (of two on one band, a run cut
 *  by another sentence's, the nearer across), else a row of its own */
function widen(rows: Box[], k: Ink) {
  let r: Box | undefined
  for (const b of rows)
    if (
      b[1] <= k[5] &&
      k[5] <= b[3] &&
      (!r || apartAcross(b[0], b[2], k[1], k[3]) < apartAcross(r[0], r[2], k[1], k[3]))
    )
      r = b
  if (!r) rows.push([k[1], k[2], k[3], k[4]])
  else {
    r[0] = Math.min(r[0], k[1])
    r[1] = Math.min(r[1], k[2])
    r[2] = Math.max(r[2], k[3])
    r[3] = Math.max(r[3], k[4])
  }
}
/** kept ink as ink on page `page` */
const inkOfShown = (x: Shown, page: number): Ink => [page, ...x.box, x.base]
/** the member's displays with ink on `page` (El kind 'display'), each a block of its own by its piece: Laid.lit's `own` */
function displaysOf(m: Placed, page: number): [string, Box[]][] {
  const out: [string, Box[]][] = []
  for (const [id, e] of m.els ?? []) {
    if (e.kind !== 'display') continue
    const boxes = e.ink.filter((s) => s[0] === page).map((s): Box => [s[1]!, s[2]!, s[3]!, s[4]!])
    if (boxes.length) out.push([id, boxes])
  }
  return out
}
/** a member's line on A that is a display's row (a KEPT line on one of its displays: its display's ink, no line of its text) */
const onItsDisplay = (l: Line, displays: readonly { box: Box }[]) =>
  !!(l[9] & KEPT) && onDisplay(displays, l[2], l[6], l[3], l[5])

/** the boxes on both panes alike (one entry each), none where it has none */
export const mirrored = (boxes: Box[]): Lit =>
  boxes.length ? { left: [boxes], right: [boxes], own: [] } : { left: [], right: [], own: [] }

type Dir = [ux: number, uy: number]
/** a page's point in the frame of a run along `dir` (Laid.lit's `dir`): its place along the run and across it, (−uy, ux) */
export const inFrame = ([ux, uy]: Dir, x: number, y: number): [s: number, t: number] => [
  x * ux + y * uy,
  y * ux - x * uy,
]

/** a box in a run's frame as the page's box it stands in (its corners' extent on the page) */
export function pageBoxOf([s0, t0, s1, t1]: Box, [ux, uy]: Dir): Box {
  const xs: number[] = [],
    ys: number[] = []
  for (const s of [s0, s1])
    for (const t of [t0, t1]) {
      xs.push(s * ux - t * uy)
      ys.push(s * uy + t * ux)
    }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/**
 * A turned figure text's box on A in its run's frame (Placed.dir, Placed.run): the box its line tells (its line: the extent on
 * the page of its run's box, turned), read back about its run's origin. Across the run, the band each edge of its line that
 * turns with it tells, weighed by how much it turns, the run taken from its origin over its length; along it, the same of the
 * edges that turn with it, over that band; the band read again over that run (a quarter turned, each extent its line's own; at
 * an angle between, the run's length where its line tells none apart). Null where the part states no run (a part made before:
 * its line, level, is all it tells) or the page is not its
 */
export function runBoxOfA(m: Placed, page: number): Box | null {
  const l = m.lines[0]
  if (!m.dir || !m.run || !l || l[0] !== page) return null
  const [ux, uy] = m.dir
  const [ox, oy, length] = m.run
  // (its run's box, s along it from its origin and t across, stands on the page over x: ox + s·ux − t·uy, y: oy + s·uy + t·ux;
  // an extent of x or y over the box is its s's extent times one component and its t's times the other)
  const [x0, x1, y0, y1] = [l[2] - ox, l[3] - ox, l[6] - oy, l[5] - oy]
  const lo = (a: number, b: number) => Math.min(a, b),
    hi = (a: number, b: number) => Math.max(a, b)
  /** one extent read back from the box's x and y extents, the other's given: [from, to] */
  const read = (other: [number, number], xk: number, xo: number, yk: number, yo: number): [number, number] | null => {
    let w = 0,
      a = 0,
      b = 0
    for (const [k, o, e0, e1] of [
      [xk, xo, x0, x1],
      [yk, yo, y0, y1],
    ] as const) {
      if (Math.abs(k) < 1e-6) continue
      const p = (e0 - lo(other[0] * o, other[1] * o)) / k,
        q = (e1 - hi(other[0] * o, other[1] * o)) / k
      a += lo(p, q) * Math.abs(k)
      b += hi(p, q) * Math.abs(k)
      w += Math.abs(k)
    }
    return w ? [a / w, b / w] : null
  }
  const band0 = read([0, length], -uy, ux, ux, uy)
  const run = band0 && read(band0, ux, -uy, uy, ux)
  const band = run && read(run, -uy, ux, ux, uy)
  if (!band || !run || !(band[1] > band[0]) || !(run[1] > run[0])) return null
  const [os, ot] = inFrame(m.dir, ox, oy)
  return [os + run[0], ot + band[0], os + run[1], ot + band[1]]
}

// ---------------------------------------------------------------- the sentences on each pane
/** a row's sentences: where each sentence after the first begins in the unit's source projection and in its translation's */
export type Sentences = { src: readonly number[]; tr: readonly number[] }
/** a place on A: the index of a line in Placed.lines, an x on it */
type At = [line: number, x: number]
/** how many words after a sentence's first its start may be found at (today's anchors.mjs LATE) */
const LATE = 2
const after = (a: At, b: At) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])

/**
 * Where each sentence after the first begins on A (today's anchors.mjs sentenceStarts): row start `o` at the first of the
 * part's words (Placed.words) at or after it that the part places, among its sentence's first three (LATE) and before the
 * next start's; each after the one before and after the unit's own first word. Null where one is not found
 */
export function startsOnA(words: readonly (readonly [number, number, number])[], src: readonly number[]): At[] | null {
  const firstAt = (o: number) => {
    let lo = 0,
      hi = words.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (words[mid]![0] < o) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  const at = src.map(firstAt)
  const head = words.find((w) => w[1] >= 0)
  if (!head || !src.length) return null
  let prev: At = [head[1], head[2]]
  const out: At[] = []
  for (let j = 0; j < at.length; j++) {
    const end = Math.min(at[j]! + 1 + LATE, j + 1 < at.length ? at[j + 1]! : words.length)
    let w: readonly [number, number, number] | undefined
    for (let i = at[j]!; i < end && !w; i++) if (words[i]![1] >= 0) w = words[i]
    if (!w) return null
    const p: At = [w[1], w[2]]
    if (!after(p, prev)) return null
    out.push(p)
    prev = p
  }
  return out
}

/** the sentence (0 the first) that line `j` of A stands in from its start `x0`: the starts at or before it */
const sentenceAtLine = (starts: readonly At[], j: number, x0: number) =>
  starts.filter((a) => a[0] < j || (a[0] === j && a[1] <= x0)).length

/** whether a member's line on A is a display's row: a KEPT line over the ink of one of its displays */
function displayRowOf(m: Placed): (l: Line) => boolean {
  const ink = (m.els ?? []).filter(([, e]) => e.kind === 'display').flatMap(([, e]) => e.ink)
  return (l) =>
    !!(l[9] & KEPT) &&
    onDisplay(
      ink.filter((k) => k[0] === l[0]).map((k) => ({ box: [k[1]!, k[2]!, k[3]!, k[4]!] as Box })),
      l[2],
      l[6],
      l[3],
      l[5],
    )
}

/**
 * Which sentence each piece of a member is in, decided once for both panes (the owner's rules of 2026-10-30: both panes light
 * the same thing; a sentence lights all its pieces, text, elements, labels): the unit cut at its row's starts, half-open, each
 * piece in the sentence its start falls in. On A a piece's start is where it begins on the page (`startsA`: a line of A from a
 * start to the next); in the translation a token's first character's place (`startsT`); an element, one piece in both texts,
 * the sentence its ink begins in on A (null for one with no ink there, a display, a block of its own: its place in the
 * translation decides); a label the first
 */
type SentenceMap = {
  n: number
  ofPlace(place: number): number
  ofElement(id: string): number | null
}
function sentenceMap(m: Placed, startsA: readonly At[], startsT: readonly number[]): SentenceMap {
  const displayRow = displayRowOf(m)
  const text = (l: Line) => !displayRow(l)
  const els = new Map(m.els ?? [])
  return {
    n: startsA.length + 1,
    ofPlace: (place) => startsT.filter((p) => p <= place).length,
    ofElement(id) {
      const e = els.get(id)
      const k = e?.ink[0]
      if (!e || !k || e.kind === 'display') return null
      const s = standsInOnA(m, k[0], text, startsA, k)
      return s >= 0 ? s : null
    },
  }
}
/** each element's ink on A on `page` (its displays' aside) widening its sentence's row on A (`rows`, by sentence), in place */
function elementsOnA(m: Placed, page: number, map: SentenceMap, rows: Box[][]) {
  for (const [id, e] of m.els ?? []) {
    const s = e.kind === 'display' ? null : map.ofElement(id)
    if (s === null) continue
    for (const k of e.ink) if (k[0] === page) widen(rows[s]!, k)
  }
}

/**
 * A member's lines on A on `page` cut into its sentences at `starts` (each line by its index in Placed.lines): sentence s from
 * its start (the unit's beginning for the first) to the next one's, the lines between whole; `extra` (a label drawn anew, the
 * name it is led by) widening the first one's row
 */
function cutOnA(m: Placed, page: number, keep: (l: Line) => boolean, starts: readonly At[], extra: readonly Ink[]) {
  const out: Box[][] = Array.from({ length: starts.length + 1 }, () => [])
  m.lines.forEach((l, j) => {
    if (l[0] !== page || !keep(l)) return
    const [x0, y0, x1, y1] = boxOfLine(l)
    for (let s = 0; s <= starts.length; s++) {
      const from = starts[s - 1],
        to = starts[s]
      if ((from && from[0] > j) || (to && to[0] < j)) continue
      const lo = from && from[0] === j ? Math.max(x0, from[1]) : x0
      const hi = to && to[0] === j ? Math.min(x1, to[1]) : x1
      if (hi > lo) out[s]!.push([lo, y0, hi, y1])
    }
  })
  out[0] = widened(out[0]!, extra, page)
  return out
}

/**
 * Each place a row's pieces take in the translation's plain text (words.mjs pieceOffsets: every piece that is no text a
 * space, white space one, trimmed: the text the tokens' `at` count in, breaker/tokens.ts), and each offset of the
 * translation's projection there (Row.sentences.tr counts in it: text pieces as the row writes them, each element one
 * character, a group's edges none). Null where a text's shown form cannot be read back character by character
 */
function placesOf(
  pieces: readonly V0Piece[],
): { piece: number[]; at(o: number): number; text: string; offset: number[] } | null {
  const tracker = plainTracker()
  const piece: number[] = []
  // (each element's offset in the translation's projection)
  const offset: number[] = []
  // (each stretch of the projection: its first offset, its plain offsets by character)
  const runs: { from: number; to: number[] }[] = []
  let text = ''
  for (const [k, p] of pieces.entries()) {
    if (p.t !== 'text') {
      tracker.gap()
      piece[k] = tracker.space()
      if (p.t === 'ph' || p.t === 'nested') {
        offset[k] = text.length
        runs.push({ from: text.length, to: [piece[k]!] })
        text += OBJ
      }
      continue
    }
    const sh = shown(p as TextPiece)
    const back = shownIndex(p as TextPiece, sh)
    if (!back) return null
    const at = tracker.text(sh)
    const i = sh.search(/\S/)
    piece[k] = i >= 0 ? at[i]! : tracker.next()
    runs.push({ from: text.length, to: back.map((c) => at[c] ?? tracker.next()) })
    text += p.s
  }
  return {
    piece,
    text,
    offset,
    at(o) {
      for (let r = runs.length - 1; r >= 0; r--) {
        const run = runs[r]!
        if (o >= run.from) return run.to[Math.min(o - run.from, run.to.length - 1)] ?? -1
      }
      return -1
    },
  }
}
const OBJ = '\ufffc'
/** each character of a text piece's string by the index of the character of its shown form it becomes (breaker/text.ts
 *  shown: a translation's TeX escapes undone, each one character); null where they do not read back so */
function shownIndex(p: TextPiece, sh: string): number[] | null {
  if (sh === p.s) return Array.from({ length: p.s.length }, (_, i) => i)
  if (!p.tr) return null
  const out: number[] = []
  let built = ''
  const re = /\\(?:(textbackslash|textasciitilde|textasciicircum)\{\}|([#$%&_{}]))/g
  let last = 0
  for (const m of p.s.matchAll(re)) {
    for (let i = last; i < m.index; i++) out.push(built.length + (i - last))
    built += p.s.slice(last, m.index)
    for (let i = 0; i < m[0].length; i++) out.push(built.length)
    built += m[1] ? ' ' : m[2]!
    last = m.index + m[0].length
  }
  for (let i = last; i < p.s.length; i++) out.push(built.length + (i - last))
  built += p.s.slice(last)
  return built === sh ? out : null
}

/** a token of a laid line on the page, its box, its place in the translation (-1 none of its own), the element it draws (its
 *  id: a crop of its ink or its text) and whether it is a label's crop */
type Placed_ = { line: number; box: Box; place: number; el?: string; label?: true }
/** the member's laid tokens on `page`, in its text's order, each with a place: its own (a text token's `at`), its piece's (an
 *  element drawn as a crop or as text), else the token's before it, else after it (words.mjs addUnitWords) */
function tokensOn(
  L: Layout,
  page: number,
  pieceAt: readonly number[],
  elOf: (k: number) => string | undefined,
): Placed_[] {
  const out: Placed_[] = []
  L.lines.forEach((line, j) => {
    if (line.page !== page) return
    for (const it of line.items) {
      const t = it.t as { space?: boolean; at?: number; k?: number; crop?: { k?: number | null } }
      if (t.space) continue
      const b = tokenBox(it, line, L)
      if (!b) continue
      const k = t.crop ? t.crop.k : t.k
      const place = t.at ?? (Number.isInteger(k) ? (pieceAt[k as number] ?? -1) : -1)
      const el = t.at === undefined && Number.isInteger(k) ? elOf(k as number) : undefined
      // (a crop of no piece: its label's, emit/display.ts)
      const label = !!t.crop && !Number.isInteger(t.crop.k)
      out.push({
        line: j,
        box: [b.l, b.bottom, b.r, b.top],
        place,
        ...(el ? { el } : {}),
        ...(label ? { label: true as const } : {}),
      })
    }
  })
  for (let n = 1; n < out.length; n++) if (out[n]!.place < 0) out[n]!.place = out[n - 1]!.place
  for (let n = out.length - 2; n >= 0; n--) if (out[n]!.place < 0) out[n]!.place = out[n + 1]!.place
  return out
}

/**
 * Where each sentence after the first begins in the translation's plain text: its start in the row (Row.sentences.tr) at its
 * first word or element (a letter, a digit or an element at or after it, before the next start) and the opening marks set
 * against it, as the source's is found on A at its first word or element (Placed.words). An element its translation begins a
 * sentence with is that sentence's (2611.03953v2 p5: "Three details of Equation (6) matter." came back with the reference first, "(6)" then "three details
 * matter", the row's start at the reference; moved on to the first letter, it lit with the sentence before, the owner's report
 * of 2026-11-10). Null where one has none
 */
function startsInPlain(places: NonNullable<ReturnType<typeof placesOf>>, tr: readonly number[]): number[] | null {
  const out: number[] = []
  let floor = 0
  for (let j = 0; j < tr.length; j++) {
    const end = j + 1 < tr.length ? tr[j + 1]! : places.text.length
    let o = tr[j]!
    while (o < end && places.text[o] !== OBJ && !/[\p{L}\p{N}]/u.test(places.text[o]!)) o++
    if (o >= end) return null
    // (from the opening brackets and quotes set against its first word, Unicode's Ps and Pi: "(Vier" begins its sentence at
    // its bracket, as a word is placed on A, engine words.ts; a token is in the sentence its start falls in)
    while (o > floor && /[\p{Ps}\p{Pi}]/u.test(places.text[o - 1]!)) o--
    floor = o + 1
    const p = places.at(o)
    if (p < 0 || (out.length && p <= out.at(-1)!)) return null
    out.push(p)
  }
  return out
}

/**
 * The boxes of the laid tokens, one a run of a sentence's tokens on a line: across them, up and down, each running on to the
 * next run's start on the line (the space after a full stop is the sentence's before it, as today's shapes tile a row: a
 * pointer over it lights that sentence), the line's last one to its last token's end. A sentence's tokens on a line are one run
 * but where an element of another stands among them (one its translation set inside it): a run each side of it
 */
function rowsBySentence(tokens: readonly (Placed_ & { s: number })[], n: number): Box[][] {
  const out: Box[][] = Array.from({ length: n }, () => [])
  const byLine = new Map<number, Box[]>()
  let run: { s: number; line: number; box: Box } | null = null
  for (const t of tokens) {
    if (run && run.s === t.s && run.line === t.line) {
      const b = run.box
      b[0] = Math.min(b[0], t.box[0])
      b[1] = Math.min(b[1], t.box[1])
      b[2] = Math.max(b[2], t.box[2])
      b[3] = Math.max(b[3], t.box[3])
      continue
    }
    run = { s: t.s, line: t.line, box: [...t.box] }
    out[t.s]!.push(run.box)
    byLine.set(t.line, [...(byLine.get(t.line) ?? []), run.box])
  }
  // (a line's runs in the text's order, left to right: each ends where the next begins)
  for (const boxes of byLine.values()) for (let k = 0; k + 1 < boxes.length; k++) boxes[k]![2] = boxes[k + 1]![0]
  return out
}

/** the sentence of the token beside a box on its band (words.mjs placeBeside: a kept character at its neighbour's place) */
function besideOf(tokens: readonly (Placed_ & { s: number })[], [x0, y0, x1, y1]: Box): number {
  const x = (x0 + x1) / 2,
    y = (y0 + y1) / 2
  let best = -1,
    far = Number.POSITIVE_INFINITY
  for (const t of tokens) {
    if (y < t.box[1] || y > t.box[3]) continue
    const d = x < t.box[0] ? t.box[0] - x : x > t.box[2] ? x - t.box[2] : 0
    if (d < far) {
      far = d
      best = t.s
    }
  }
  return best
}

/** a member lit from A on both panes (not laid, or waiting): its lines on the page, its label with the line it stands on, by
 *  sentence where its row's starts (`src`, Row.sentences) are found on A (today's mirror: a unit shown as the original's lights
 *  by the left's starts on both panes); a turned figure text its run's box, turned with it */
export function litOfA(m: Placed, page: number, src?: readonly number[]): Lit {
  const run = runBoxOfA(m, page)
  if (run) return { ...mirrored([run]), dir: m.dir! }
  const label = m.label ? [m.label.ink] : []
  // (its displays a block of its own each, their rows none of its text's)
  const own = displaysOf(m, page)
  const displays = own.flatMap(([, boxes]) => boxes.map((box) => ({ box })))
  const keep = (l: Line) => !onItsDisplay(l, displays)
  const row = m.words ? (src?.length ? startsOnA(m.words, src) : []) : null
  // (with its forced breaks' starts, each where no start of the row's stands at its line's start)
  const starts = row && [...row, ...breaksOnA(m).map((b) => b.a)].sort((x, y) => x[0] - y[0] || x[1] - y[1])
  const unique = starts?.filter((a, i) => !i || after(a, starts[i - 1]!))
  if (unique?.length) {
    const per = cutOnA(m, page, keep, unique, label)
    elementsOnA(m, page, sentenceMap(m, unique, []), per)
    return { left: per, right: per, own }
  }
  const lines = m.lines.filter((l) => l[0] === page && keep(l)).map(boxOfLine)
  const text = [widened(lines, label, page)]
  elementsOnA(m, page, sentenceMap(m, [], []), text)
  return text[0]!.length ? { left: text, right: text, own } : { left: [], right: [], own }
}

/**
 * A laid member's boxes on page `page`. `L` its layout; `off` its groups turned off on the page as the entry decides them (its
 * elements: 2, the ink it keeps shown follows it; a label drawn anew: 4); `kept` its elements kept where they stand by its
 * reading (U.elements' kept, in place); `lead` the name it is led by, drawn anew with it; `by` its row's sentences and the
 * pieces its reading laid (rowPieces), where its row has sentences
 */
export function litLaid(
  m: Placed,
  page: number,
  L: Layout | undefined,
  o: {
    off: number
    kept: ReadonlySet<string>
    lead: Placed | null
    by?: { sentences?: Sentences | undefined; pieces: readonly V0Piece[] } | undefined
  },
): Lit {
  const els: GroupEl[] = (m.els ?? []).map(([id, e]) => ({
    k: Number(id),
    display: e.kind === 'display',
    ink: e.ink,
    kept: !!e.keep || o.kept.has(id),
  }))
  const relabelled = !!(o.off & 4)
  const { shown } = groupsOff({
    page,
    ord: m.ord,
    els,
    label: m.label ? { ink: [m.label.ink], drawn: relabelled } : null,
    fixed: m.fixed ?? 0,
    // (the elements' group as the entry decides it: one the translation omits is drawn nowhere else, its ink stays and lights,
    // #626's review)
    elementsOff: !!(o.off & 2),
  })
  const displays = shown.filter((s) => s.kind === 'display')
  // (a KEPT line is a display's row, its display's block, or a held line: its ink stays, on both panes in its unit's shape)
  const keep = (l: Line) => !onItsDisplay(l, displays)
  const mine = m.lines.filter((l) => l[0] === page && keep(l))
  const extra = [
    ...(relabelled && m.label ? [m.label.ink] : []),
    ...(o.lead?.lines[0] ? [inkOfLine(o.lead.lines[0])] : []),
  ]
  const by = L && o.by ? bySentence(m, page, L, o.by, keep, extra, shown) : null
  if (by) return by
  const held = mine.filter((l) => l[9] & KEPT).map(boxOfLine)
  // (the ink it keeps but its displays, on the row it stands on: a piece, a label, a character)
  const kept = shown.filter((x) => x.kind !== 'display').map((x) => inkOfShown(x, page))
  const left = [widened(mine.map(boxOfLine), [...extra, ...kept], page)]
  // (every element's ink on A, whether drawn elsewhere or kept: one TeX set past its line's text stands in no line's box)
  elementsOnA(m, page, sentenceMap(m, [], []), left)
  const right = widened([...(L ? lineBoxes(L, page) : []), ...held], kept, page)
  const own = ownOf(displays)
  return left[0]!.length || right.length ? { left, right: [right], own } : { left: [], right: [], own }
}

/** its displays the page keeps, each a block of its own by its piece (Laid.lit's `own`) */
function ownOf(displays: readonly Shown[]): [string, Box[]][] {
  const own = new Map<string, Box[]>()
  for (const x of displays) if (x.kind === 'display') own.set(String(x.k), [...(own.get(String(x.k)) ?? []), x.box])
  return [...own]
}

/** the starts on A of the sentences after each forced break of a member (El.brk, the line it ends El.ends: TeX ended the line by
 *  command, and what follows is a block of its own on the page): the next line's start, a KEPT row passed; none after its
 *  last line or before its first word */
function breaksOnA(m: Placed): { id: string; a: At }[] {
  const head = m.words?.find((w) => w[1] >= 0)
  const out: { id: string; a: At }[] = []
  for (const [id, e] of m.els ?? []) {
    if (!e.brk || !e.ends) continue
    let j = e.ends[0] + 1
    while (j < m.lines.length && m.lines[j]![9] & KEPT) j++
    if (j >= m.lines.length) continue
    const a: At = [j, m.lines[j]![2]]
    if (!head || after(a, [head[1], head[2]])) out.push({ id, a })
  }
  return out
}

/**
 * The translator's starts (on A and in the translation's plain text, in order) with each forced break's put among them: on A
 * at the next line's start, in the translation at the first word after the same element. One is put where it falls between
 * its neighbours on both panes; a start of the translator's at the same word, or one the other way round, keeps the
 * translator's (1810.04805v2 p8: "… as BERT_BASE:" \\ "No NSP: …", one sentence of Microsoft's across the break)
 */
function withBreaks(
  m: Placed,
  pieces: readonly V0Piece[],
  places: NonNullable<ReturnType<typeof placesOf>>,
  starts: { a: At; p: number }[],
): { a: At; p: number }[] {
  const out = [...starts]
  for (const { id, a } of breaksOnA(m)) {
    const k = pieces.findIndex((x) => (x.t === 'ph' || x.t === 'nested') && x.k === Number(id))
    if (k < 0) continue
    let o = places.offset[k]! + 1
    while (o < places.text.length && !/[\p{L}\p{N}]/u.test(places.text[o]!)) o++
    const p = o < places.text.length ? places.at(o) : -1
    if (p < 0 || out.some((x) => x.p === p)) continue
    const i = out.findIndex((x) => x.p > p)
    const at = i < 0 ? out.length : i
    const before = out[at - 1],
      next = out[at]
    if ((!before || after(a, before.a)) && (!next || after(next.a, a))) out.splice(at, 0, { a, p })
  }
  return out
}

/**
 * A laid member lit by sentence on page `page`, or null where it lights whole: a start not found on A (startsOnA), a start of
 * the translation's with no token of its in the layout on any page (the right finds none), a translation's text whose places
 * cannot be read, or no start at all (the translator's and its forced breaks'). Decided from the whole member (its words on
 * every page, its layout's every line), so every page of it decides alike
 */
function bySentence(
  m: Placed,
  page: number,
  L: Layout,
  by: { sentences?: Sentences | undefined; pieces: readonly V0Piece[] },
  keep: (l: Line) => boolean,
  extra: readonly Ink[],
  shown: readonly Shown[],
): Lit | null {
  const src = by.sentences?.src ?? [],
    tr = by.sentences?.tr ?? []
  if (!m.words || src.length !== tr.length) return null
  const rowA = src.length ? startsOnA(m.words, src) : []
  const places = rowA && placesOf(by.pieces)
  const rowP = places && (tr.length ? startsInPlain(places, tr) : [])
  if (!rowA || !places || !rowP) return null
  const merged = withBreaks(
    m,
    by.pieces,
    places,
    rowA.map((a, j) => ({ a, p: rowP[j]! })),
  )
  if (!merged.length) return null
  const starts = merged.map((x) => x.a)
  const map = sentenceMap(
    m,
    starts,
    merged.map((x) => x.p),
  )
  const n = map.n
  // (every sentence's first word drawn: a text token of it in the layout, on any of its pages)
  const found = new Set<number>()
  for (const line of L.lines)
    for (const it of line.items) {
      const t = it.t as { at?: number }
      if (t.at !== undefined) found.add(map.ofPlace(t.at))
    }
  for (let s = 0; s < n; s++) if (!found.has(s)) return null
  const left = cutOnA(m, page, keep, starts, extra)
  elementsOnA(m, page, map, left)
  const elOf = (k: number) => {
    const p = by.pieces[k]
    return p && (p.t === 'ph' || p.t === 'nested') && p.k !== undefined ? String(p.k) : undefined
  }
  // (each token in the sentence its start falls in: a text token's place, an element's own sentence on A, a label's the first)
  const tokens = tokensOn(L, page, places.piece, elOf).map((t) => ({
    ...t,
    s: t.label ? 0 : ((t.el !== undefined ? map.ofElement(t.el) : null) ?? map.ofPlace(t.place)),
  }))
  const right = rowsBySentence(tokens, n)
  // (a held line: its ink stays where it stands, in the sentence it stands in on A)
  m.lines.forEach((l, j) => {
    if (l[0] === page && keep(l) && l[9] & KEPT) right[sentenceAtLine(starts, j, l[2])]!.push(boxOfLine(l))
  })
  // (the ink it keeps but its displays: on both panes with its sentence, the row it stands on widened over it)
  for (const x of shown) {
    if (x.kind === 'display') continue
    const s = x.kind === 'label' ? 0 : x.kind === 'piece' ? (map.ofElement(String(x.k)) ?? -1) : besideOf(tokens, x.box)
    const k = inkOfShown(x, page)
    const at = s >= 0 ? s : Math.max(0, standsInOnA(m, page, keep, starts, k))
    widen(left[at]!, k)
    widen(right[at]!, k)
  }
  return { left, right, own: ownOf(shown) }
}

/** the sentence a piece of ink stands in on A: that of its member's line on the page it stands on (TeX's measure for the line,
 *  its column, or its own ink holding it across: a caption's last line, centred, states a measure narrower than its ink; then the band holding its baseline, else the nearest by baseline; then, of lines on one
 *  baseline, the one whose ink is nearest across), at its start, as a held line's; -1 where the page holds no line of it. By
 *  band alone, an element of a paragraph that runs on in the next column stood on the first column's line on its baseline
 *  (2611.03953v2 p7), and one past a held line's ink on the held line (2610.21377v1 p39) */
function standsInOnA(m: Placed, page: number, keep: (l: Line) => boolean, starts: readonly At[], k: Ink): number {
  let best = -1,
    far: [number, number, number] | null = null
  const mid = (k[1] + k[3]) / 2
  m.lines.forEach((l, j) => {
    if (l[0] !== page || !keep(l)) return
    const d: [number, number, number] = [
      Math.min(l[2], l[7]) <= mid && mid <= Math.max(l[3], l[8]) ? 0 : 1,
      l[6] <= k[5] && k[5] <= l[5] ? 0 : Math.abs(l[4] - k[5]),
      apartAcross(l[2], l[3], mid, mid),
    ]
    if (!far || d[0] < far[0] || (d[0] === far[0] && (d[1] < far[1] || (d[1] === far[1] && d[2] < far[2])))) {
      far = d
      best = j
    }
  })
  return best < 0 ? -1 : sentenceAtLine(starts, best, k[1])
}

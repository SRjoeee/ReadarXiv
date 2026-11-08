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
// - on the right, as drawn: its laid lines' tokens (D.sentences' tokenBox), each token's sentence its place in the translation
//   (a text token's, an element's at its piece's, one of neither its neighbour's: words.mjs addUnitWords), the start the token
//   of the sentence's first word; and the lines it keeps where they stand (a held line: its ink stays), in the sentence they
//   stand in on A;
// - `own`: its own ink the page keeps (D.groups' shown: a display, its rows, a block of its own; a piece or a label kept where it
//   stands), the same boxes on both panes. Lit by sentence, a kept piece lights with its sentence, a label with the first, a
//   kept character with the token beside it (words.mjs: the owner, 2026-10-30), a display alone (a block of its own).
// A member not laid, and every member of a page that waits, lights from A on both panes: the right mirrors the left (by
// sentence where its row's starts are found on A). A figure text the original sets turned (Placed.dir, its run Placed.run) is
// lit whole, turned with its text: its boxes in its run's frame
// (Laid.lit's `dir`), on A its run's box, as drawn its line along it, never the level box its turned box stands in on the page
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
  for (const k of ink) {
    if (k[0] !== page) continue
    const r = out.find((b) => b[1] <= k[5] && k[5] <= b[3])
    if (!r) out.push([k[1], k[2], k[3], k[4]])
    else {
      r[0] = Math.min(r[0], k[1])
      r[1] = Math.min(r[1], k[2])
      r[2] = Math.max(r[2], k[3])
      r[3] = Math.max(r[3], k[4])
    }
  }
  return out
}

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

/** a token of a laid line on the page, its box, its place in the translation (-1 none of its own) and its end there */
type Placed_ = { line: number; box: Box; place: number; end: number }
/** the member's laid tokens on `page`, in its text's order, each with a place: its own (a text token's `at`), its piece's (an
 *  element drawn as a crop or as text), else the token's before it, else after it (words.mjs addUnitWords) */
function tokensOn(L: Layout, page: number, pieceAt: readonly number[]): Placed_[] {
  const out: Placed_[] = []
  L.lines.forEach((line, j) => {
    if (line.page !== page) return
    for (const it of line.items) {
      const t = it.t as { space?: boolean; at?: number; end?: number; k?: number; crop?: { k?: number | null } }
      if (t.space) continue
      const b = tokenBox(it, line, L)
      if (!b) continue
      const k = t.crop ? t.crop.k : t.k
      const place = t.at ?? (Number.isInteger(k) ? (pieceAt[k as number] ?? -1) : -1)
      out.push({ line: j, box: [b.l, b.bottom, b.r, b.top], place, end: t.at !== undefined ? (t.end ?? t.at + 1) : -1 })
    }
  })
  for (let n = 1; n < out.length; n++) if (out[n]!.place < 0) out[n]!.place = out[n - 1]!.place
  for (let n = out.length - 2; n >= 0; n--) if (out[n]!.place < 0) out[n]!.place = out[n + 1]!.place
  for (const t of out) if (t.end < 0) t.end = t.place + 1
  return out
}

/**
 * Where each sentence after the first begins in the translation's plain text: its start in the row (Row.sentences.tr) at its
 * first word (a letter or a digit at or after it, before the next start), as the source's is found at its first word (today's
 * mt.mjs sentencesOf: a sentence starts at its first word). Null where one has none
 */
function startsInPlain(places: NonNullable<ReturnType<typeof placesOf>>, tr: readonly number[]): number[] | null {
  const out: number[] = []
  for (let j = 0; j < tr.length; j++) {
    const end = j + 1 < tr.length ? tr[j + 1]! : places.text.length
    let o = tr[j]!
    while (o < end && !/[\p{L}\p{N}]/u.test(places.text[o]!)) o++
    if (o >= end) return null
    const p = places.at(o)
    if (p < 0 || (out.length && p <= out.at(-1)!)) return null
    out.push(p)
  }
  return out
}
/** the sentence of a token whose text runs from its place to `end` in the translation's plain text: the starts it reaches,
 *  so that the token carrying a sentence's first word begins it, an opening bracket set against the word with it (today's
 *  words.mjs: a token's sentence is its word's) */
const sentenceOf = (starts: readonly number[], end: number) => starts.filter((p) => p < end).length

/**
 * The boxes of the laid tokens, one a line a sentence: its tokens on the line across, up and down, each running on to the
 * next sentence's start on the line (the space after a full stop is the sentence's before it, as today's shapes tile a row:
 * a pointer over it lights that sentence), the line's last one to its last token's end
 */
function rowsBySentence(tokens: readonly (Placed_ & { s: number })[], n: number): Box[][] {
  const out: Box[][] = Array.from({ length: n }, () => [])
  const at = new Map<string, Box>()
  const byLine = new Map<number, Box[]>()
  for (const t of tokens) {
    const key = `${t.s}:${t.line}`
    const b = at.get(key)
    if (!b) {
      const nb: Box = [...t.box]
      at.set(key, nb)
      out[t.s]!.push(nb)
      byLine.set(t.line, [...(byLine.get(t.line) ?? []), nb])
    } else {
      b[0] = Math.min(b[0], t.box[0])
      b[1] = Math.min(b[1], t.box[1])
      b[2] = Math.max(b[2], t.box[2])
      b[3] = Math.max(b[3], t.box[3])
    }
  }
  // (a line's sentences in the text's order, left to right: each ends where the next begins)
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
  const row = m.words ? (src?.length ? startsOnA(m.words, src) : []) : null
  // (with its forced breaks' starts, each where no start of the row's stands at its line's start)
  const starts = row && [...row, ...breaksOnA(m).map((b) => b.a)].sort((x, y) => x[0] - y[0] || x[1] - y[1])
  const unique = starts?.filter((a, i) => !i || after(a, starts[i - 1]!))
  if (unique?.length) {
    const per = cutOnA(m, page, () => true, unique, label)
    return { left: per, right: per, own: [] }
  }
  const lines = m.lines.filter((l) => l[0] === page).map(boxOfLine)
  return mirrored(widened(lines, label, page))
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
  const keep = (l: Line) => !(l[9] & KEPT && onDisplay(displays, l[2], l[6], l[3], l[5]))
  const mine = m.lines.filter((l) => l[0] === page && keep(l))
  const extra = [
    ...(relabelled && m.label ? [m.label.ink] : []),
    ...(o.lead?.lines[0] ? [inkOfLine(o.lead.lines[0])] : []),
  ]
  const by = L && o.by ? bySentence(m, page, L, o.by, keep, extra, shown) : null
  if (by) return by
  const held = mine.filter((l) => l[9] & KEPT).map(boxOfLine)
  const left = widened(mine.map(boxOfLine), extra, page)
  const right = [...(L ? lineBoxes(L, page) : []), ...held]
  const own = new Map<string, Box[]>()
  for (const s of shown) {
    const key = s.kind === 'display' || s.kind === 'piece' ? String(s.k) : s.kind
    own.set(key, [...(own.get(key) ?? []), s.box])
  }
  return left.length || right.length
    ? { left: [left], right: [right], own: [...own] }
    : { left: [], right: [], own: [...own] }
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
  const starts = merged.map((x) => x.a),
    plain = merged.map((x) => x.p)
  const n = merged.length + 1
  // (every sentence's first word drawn: a text token of it in the layout, on any of its pages)
  const found = new Set<number>()
  for (const line of L.lines)
    for (const it of line.items) {
      const t = it.t as { at?: number; end?: number }
      if (t.at !== undefined) found.add(sentenceOf(plain, t.end ?? t.at + 1))
    }
  for (let s = 0; s < n; s++) if (!found.has(s)) return null
  const left = cutOnA(m, page, keep, starts, extra)
  const tokens = tokensOn(L, page, places.piece).map((t) => ({ ...t, s: sentenceOf(plain, t.end) }))
  const right = rowsBySentence(tokens, n)
  // (a held line: its ink stays where it stands, in the sentence it stands in on A)
  m.lines.forEach((l, j) => {
    if (l[0] === page && keep(l) && l[9] & KEPT) right[sentenceAtLine(starts, j, l[2])]!.push(boxOfLine(l))
  })
  const own = new Map<string, Box[]>()
  const both = (s: number, b: Box) => {
    left[s]!.push(b)
    right[s]!.push(b)
  }
  for (const x of shown) {
    if (x.kind === 'display') {
      own.set(String(x.k), [...(own.get(String(x.k)) ?? []), x.box])
      continue
    }
    const s =
      x.kind === 'label'
        ? 0
        : x.kind === 'piece'
          ? (() => {
              const k = by.pieces.findIndex((p) => (p.t === 'ph' || p.t === 'nested') && p.k === x.k)
              return k >= 0 ? sentenceOf(plain, places.piece[k]! + 1) : -1
            })()
          : besideOf(tokens, x.box)
    if (s >= 0) both(s, x.box)
    else {
      const key = x.kind === 'piece' ? String(x.k) : x.kind
      own.set(key, [...(own.get(key) ?? []), x.box])
    }
  }
  return { left, right, own: [...own] }
}

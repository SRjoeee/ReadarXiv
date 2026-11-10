// D.sentences (design-b §1.6 E1; design-a §1.2 Laid.lit, G8, G11): a laid member's tokens on a page in the order of its text, each
// with its box and its place in the translation, from which both panes light a sentence (the row's sentences: its starts in
// that text). Ported from engine 065c1d973 words.mjs addUnitWords L212-267 (with pushBox, onDisplay, addDisplayWords L272-296),
// tokenBand L159-169, and layer2.mjs keptLines L4718-4747 (the original's lines a member keeps in place, set in its text's
// order). The table's columns are float32, as today's: a box is compared as today's reads it. Grouping the tokens into each
// sentence's runs and blocks is the reader's highlight (today's view/highlight.mjs, lane L4's), which reads this table.
import type { LaidLine, Layout } from '../fit/types.ts'
import { type Rect, rectKey } from '../util.ts'
import type { Shown } from './groups.ts'

/** a Times-like face's ascent and descent in em, and a CJK face's em box (words.mjs ASC, DESC, CJK_ASC, CJK_DESC) */
const ASC = 0.75,
  DESC = -0.22,
  CJK_ASC = 0.88,
  CJK_DESC = -0.12

/** a text token as its band reads it */
type BandToken = { sup?: boolean; cls?: string; face?: { size?: number } }
/**
 * A text token's band on a line whose baseline is `by` (words.mjs tokenBand): the baseline it is drawn on (a superscript's
 * raised), the size drawn, and the ascent and descent of a Times-like face, or of a CJK face's em box, over and under it
 */
export function tokenBand(t: BandToken, L: { f: number }, by: number) {
  const h = L.f * (t.sup ? 0.62 : 1) * (t.face?.size ?? 1),
    y = t.sup ? by + 0.36 * L.f : by
  const cjk = t.cls === 'cjk'
  return { y, h, top: y + (cjk ? CJK_ASC : ASC) * h, bottom: y + (cjk ? CJK_DESC : DESC) * h }
}

/** the page's table of tokens, one column a field (words.mjs newWords): float32 boxes, a token's word and its place */
export type Words = {
  n: number
  l: number[]
  r: number[]
  y: number[]
  h: number[]
  top: number[]
  bottom: number[]
  word: number[]
  at: number[]
  /** each member's run of the table: [id, [from, count]] (empty where it has no token on the page) */
  spans: [number, [number, number] | []][]
}
export const newWords = (): Words => ({
  n: 0,
  l: [],
  r: [],
  y: [],
  h: [],
  top: [],
  bottom: [],
  word: [],
  at: [],
  spans: [],
})
const f32 = Math.fround
function push(
  W: Words,
  l: number,
  r: number,
  y: number,
  h: number,
  top: number,
  bottom: number,
  word: number,
  at: number,
) {
  W.l.push(f32(l))
  W.r.push(f32(r))
  W.y.push(f32(y))
  W.h.push(f32(h))
  W.top.push(f32(top))
  W.bottom.push(f32(bottom))
  W.word.push(word | 0)
  W.at.push(at | 0)
  W.n++
}

/** an original's line a member keeps in place (keptLines): its box, its baseline and size, the file's own box, where it goes */
export type KeptLine = {
  x0: number
  x1: number
  baseline: number
  size: number
  top: number
  bottom: number
  fileTop?: number
  fileBottom?: number
  region?: number
  k?: number
  block?: number
}
export type KeptInput = {
  /** the member's rectangles ([page, x0, bottom, x1, top]) */
  rects: readonly Rect[]
  /** the rectangles it keeps as the original's, by key (U.elements' keep) */
  keep: readonly string[]
  /** each resolution kept in place with its region (U.breaks'), by piece */
  kept: readonly { k: number; region?: number }[]
  referenced: ReadonlySet<number> | null
  regionOf: ReadonlyMap<string, number> | null
  lineInfo: ReadonlyMap<
    string,
    { baseline?: number; size?: number; top?: number; bottom?: number; file?: boolean }
  > | null
  blocks?: readonly { rects?: readonly Rect[] }[] | null
}

/** the original's lines a member keeps on `page`, each where its text passes it (L2:4718 keptLines) */
export function keptLines(i: KeptInput, page: number): KeptLine[] {
  const keep = i.keep.length ? new Set(i.keep) : null
  if (!keep) return []
  const firstK = new Map<number, number>()
  for (const r of i.kept) {
    if (r.region === undefined || !i.referenced?.has(r.region)) continue
    const was = firstK.get(r.region)
    if (was === undefined || r.k < was) firstK.set(r.region, r.k)
  }
  let starts: number[] | null = null
  if (i.blocks?.length) {
    const index = new Map(i.rects.map((r, n) => [rectKey(r), n]))
    starts = i.blocks.map((b) => (b.rects?.length ? index.get(rectKey(b.rects[0]!)) : undefined) ?? -1)
  }
  const out: KeptLine[] = []
  i.rects.forEach((r, n) => {
    if (r[0] !== page || !keep.has(rectKey(r))) return
    const info = i.lineInfo?.get(rectKey(r))
    const line: KeptLine = {
      x0: r[1],
      x1: r[3],
      baseline: info?.baseline ?? r[2],
      size: info?.size ?? r[4] - r[2],
      top: r[4],
      bottom: r[2],
    }
    if (info?.file && Number.isFinite(info.top) && Number.isFinite(info.bottom))
      Object.assign(line, { fileTop: info.top, fileBottom: info.bottom })
    const g = i.regionOf?.get(rectKey(r))
    if (g !== undefined && firstK.has(g)) Object.assign(line, { region: g, k: firstK.get(g) })
    else if (starts) {
      const b = starts.findIndex((s) => s > n)
      line.block = b < 0 ? i.blocks!.length : b
    }
    out.push(line)
  })
  return out
}

type Box = readonly [number, number, number, number] | readonly number[]
/** whether a line [x0, y0, x1, y1] is a display's: its band meets one of its segments by more than half its height (onDisplay) */
export function onDisplay(displays: readonly { box: Box }[], x0: number, y0: number, x1: number, y1: number) {
  const h = y1 - y0
  return displays.some(
    ({ box: [a0, b0, a1, b1] }) =>
      Math.min(x1, a1!) > Math.max(x0, a0!) && Math.min(y1, b1!) - Math.max(y0, b0!) > 0.5 * h,
  )
}
/** a box of ink the page keeps as a token: across its box, on its baseline, `at` its place (pushBox) */
function pushBox(W: Words, { box: [x0, y0, x1, y1], base }: { box: Box; base?: number }, at: number) {
  push(W, x0!, x1!, Number.isFinite(base) ? base! : y0!, y1! - y0!, y1!, y0!, -1, at)
}
/** each display a span of its own, its segments its tokens (addDisplayWords) */
function addDisplayWords(
  W: Words,
  displays: readonly Extract<Shown, { kind: 'display' }>[],
  placeOf: (k: number) => number,
) {
  const byId = new Map<number | null, Extract<Shown, { kind: 'display' }>[]>()
  for (const d of displays) {
    const list = byId.get(d.id) ?? []
    byId.set(d.id, list)
    list.push(d)
  }
  for (const [did, ds] of byId) {
    const from = W.n
    for (const d of ds) pushBox(W, d, placeOf(d.k))
    W.spans.push([did as number, [from, W.n - from]])
  }
}

type WordToken = BandToken & {
  s?: string
  space?: boolean
  crop?: { crop: readonly number[]; baseline: number; k?: number | null }
  kern?: boolean
  kernEm?: number
  at?: number
  end?: number
  k?: number
}
/**
 * A laid token's box on its line, as the page's table holds it (addUnitWords): a crop's drawn box (its ink scaled by the line's
 * scale, its top where the crop's top stands over its baseline), a text token's slot across (less its kern) and its band
 * (tokenBand); null for a space or a token of no text
 */
export function tokenBox(
  it: LaidLine['items'][number],
  line: LaidLine,
  L: Layout,
): { l: number; r: number; y: number; h: number; top: number; bottom: number } | null {
  const t = it.t as WordToken
  if (t.space) return null
  const by = line.baseline
  const LL = (line.seg as { f: number; scale: number } | undefined) ?? L
  const l = it.x! - (it.shift ?? 0)
  if (t.crop) {
    const c = t.crop.crop,
      h = (c[3]! - c[1]!) * LL.scale,
      top = by + (c[3]! - t.crop.baseline) * LL.scale
    return { l, r: l + it.w, y: by, h, top, bottom: top - h }
  }
  if (typeof t.s !== 'string') return null
  const { y, h, top, bottom } = tokenBand(t, LL, by)
  return { l, r: l + it.w - (t.kern ? (t.kernEm ?? 0) * LL.f : 0), y, h, top, bottom }
}

/** each of a laid member's lines on `page` as one box over its tokens' boxes ([x0, bottom, x1, top], tokenBox): what the right
 *  pane lights of it whole (design-a's Laid.lit); a line of no token none */
export function lineBoxes(L: Layout, page: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = []
  for (const line of L.lines) {
    if (line.page !== page) continue
    let x0 = Number.POSITIVE_INFINITY,
      y0 = Number.POSITIVE_INFINITY,
      x1 = Number.NEGATIVE_INFINITY,
      y1 = Number.NEGATIVE_INFINITY
    for (const it of line.items) {
      const b = tokenBox(it, line, L)
      if (!b) continue
      x0 = Math.min(x0, b.l)
      x1 = Math.max(x1, b.r)
      y0 = Math.min(y0, b.bottom)
      y1 = Math.max(y1, b.top)
    }
    if (x0 < x1 && y0 < y1) out.push([x0, y0, x1, y1])
  }
  return out
}

/**
 * D.sentences: the member's tokens on page `page` appended to the page's table, in the order of its text (words.mjs
 * addUnitWords): its kept lines before the line its text passes them at; each line's text tokens on their slots and bands, each
 * crop its drawn box; its label first, its kept pieces at their pieces' places, a kept character at its neighbour's; each
 * display a span of its own. `wordOf(at, end)`: a token's word in the translation; `pieceAt[k]`: piece k's place in it;
 * `drawnCrop(crop)`: whether a crop is drawn; `shown`: D.groups' own ink the page keeps
 */
export function addUnitWords(
  W: Words,
  L: Layout,
  page: number,
  id: number,
  wordOf: ((at: number, end: number | undefined) => number) | null,
  kept: KeptLine[] = [],
  drawnCrop: (crop: unknown) => boolean = () => true,
  pieceAt: ArrayLike<number> | null = null,
  shown: readonly Shown[] = [],
): void {
  const first = W.n
  const lines = L.lines.filter((line) => line.page === page)
  const placeOf = (k: number | null | undefined) =>
    pieceAt && Number.isInteger(k) && k! >= 0 && k! < pieceAt.length ? pieceAt[k!]! : -1
  const displays = shown.filter(
    (s): s is Extract<Shown, { kind: 'display' }> => s.kind === 'display' && s.id !== null && s.id !== undefined,
  )
  if (displays.length)
    kept = kept.filter((k) => !onDisplay(displays, k.x0, k.fileBottom ?? k.bottom, k.x1, k.fileTop ?? k.top))
  for (const s of shown) if (s.kind === 'label') pushBox(W, s, 0)
  const before = kept.map((k) => {
    const j =
      k.region !== undefined
        ? lines.findIndex(
            (line) => ((line.past as number | undefined) ?? (line.after as number | undefined) ?? 0) > k.region!,
          )
        : k.block !== undefined
          ? lines.findIndex((line) => (line.block ?? 0) >= k.block!)
          : -1
    return j < 0 ? lines.length : j
  })
  const keptBefore = (j: number) => {
    kept.forEach((k, q) => {
      if (before[q] === j) push(W, k.x0, k.x1, k.baseline, k.size, k.top, k.bottom, -1, placeOf(k.k))
    })
  }
  lines.forEach((line: LaidLine, j) => {
    keptBefore(j)
    for (const it of line.items) {
      const t = it.t as WordToken
      if (t.space || (t.crop && !drawnCrop(t.crop))) continue
      const b = tokenBox(it, line, L)
      if (!b) continue
      if (t.crop) push(W, b.l, b.r, b.y, b.h, b.top, b.bottom, -1, placeOf(t.crop.k))
      else
        push(
          W,
          b.l,
          b.r,
          b.y,
          b.h,
          b.top,
          b.bottom,
          t.at === undefined || !wordOf ? -1 : wordOf(t.at, t.end),
          t.at ?? placeOf(t.k),
        )
    }
  })
  keptBefore(lines.length)
  const placeBeside = ([x0, y0, x1, y1]: Box) => {
    const x = (x0! + x1!) / 2,
      y = (y0! + y1!) / 2
    let best = -1,
      far = Number.POSITIVE_INFINITY
    for (let n = first; n < W.n; n++) {
      if (W.at[n]! < 0 || y < W.bottom[n]! || y > W.top[n]!) continue
      const d = x < W.l[n]! ? W.l[n]! - x : x > W.r[n]! ? x - W.r[n]! : 0
      if (d < far) {
        far = d
        best = W.at[n]!
      }
    }
    return best
  }
  const meetsDisplay = ([x0, y0, x1, y1]: Box) =>
    displays.some(
      ({ box: [a0, b0, a1, b1] }) => Math.min(x1!, a1) > Math.max(x0!, a0) && Math.min(y1!, b1) > Math.max(y0!, b0),
    )
  for (const s of shown)
    if (s.kind === 'piece') pushBox(W, s, placeOf(s.k))
    else if (s.kind === 'char' && !meetsDisplay(s.box)) pushBox(W, s, placeBeside(s.box))
  for (let n = first + 1; n < W.n; n++) if (W.at[n]! < 0) W.at[n] = W.at[n - 1]!
  for (let n = W.n - 2; n >= first; n--) if (W.at[n]! < 0) W.at[n] = W.at[n + 1]!
  W.spans.push([id, W.n > first ? [first, W.n - first] : []])
  addDisplayWords(W, displays, placeOf)
}

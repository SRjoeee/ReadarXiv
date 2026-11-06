// D.text (design-b §1.6 E1, T37, G14, A28; design-a §1.4 "Hiding and text by the same groups"): the text layer of a laid page,
// A's text content with the items under a group that is off replaced by the member's laid items, so that selection, find and a
// screen reader meet one copy of the text (I8). Ported from engine 065c1d973 textlayer.mjs: segsOfUnit L108-148 (a member's
// laid lines as text segments), nameSeg L152-155, and textLayerOf L241-421 with interleave, mergeRuns, mergeLines (its crops'
// moved items, the anchors, the kept items inside a member's block, the reading order, the breaks, the merges). One change of
// input, the design's: which of A's items a member's drawing replaces is told by the marked content the add-on names each
// group's ink with (`groupOf`, design-a §1.4), not found by testing each character against the page's paste and hide
// operations (today's eraserOf, planes B and C: no counterpart). An item stands in one group; it is still cut at the edges of
// the sources of this page's crops, so that a crop takes the characters under its source alone.
import { CJK } from '../breaker/script.ts'
import { COPY_SPACE_EM } from './display.ts'
import { tokenBand } from './sentences.ts'
import type { LaidLine, Layout } from '../fit/types.ts'

/** the most items a page's layer holds (textlayer.mjs TEXT_ITEMS_MAX) */
export const TEXT_ITEMS_MAX = 2000
/** a compact item's fields: x, baseline, width, size, ascent, flags (textlayer.mjs F) */
const F = 6
const EOL = 1,
  RTL = 2
const BLANK_END = /\s$/u,
  BLANK_START = /^\s/u
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** a page's items as itemsOf compacts them: their texts and, F a item, x, baseline, width, size, ascent, flags */
export type Compact = { n: number; str: readonly string[]; num: ArrayLike<number> }
/** a text segment of a member's line, or a crop's: its source page and rectangle, its drawn box, its copy text */
export type TextSeg =
  | { str: string; x: number; y: number; w: number; h: number; base: number; size: number; lx0?: number; lx1?: number }
  | { crop: { page: number; src: number[]; dst: number[]; text: string }; space: boolean }

type SegToken = {
  s?: string
  space?: boolean
  sup?: boolean
  cls?: string
  hyphenated?: boolean
  face?: { size?: number }
  crop?: { page: number; crop: readonly number[]; baseline: number; text?: unknown }
}

/**
 * The drawn lines of a member's layout on page `page` as text-layer segments, in reading order (textlayer.mjs segsOfUnit): each
 * line split where a crop stands (a segment of its own), where the script changes and where a superscript begins or ends; a
 * text segment's string as a copy reads it, its box from its first token's left to its last token's right edge across their
 * bands, its baseline and size, the line's slot. `drawnCrop(crop)`: whether a crop is drawn
 */
export function segsOfUnit(
  L: Layout | null | undefined,
  page: number,
  drawnCrop: (crop: unknown) => boolean = () => true,
) {
  const out: TextSeg[] = []
  type Open = {
    str: string
    x0: number
    x1: number
    top: number
    bottom: number
    base: number
    size: number
    cls: string | undefined
    sup: boolean
    lx0: number
    lx1: number
  }
  const done = (s: Open): TextSeg => ({
    str: s.str,
    x: s.x0,
    y: s.bottom,
    w: Math.max(0, s.x1 - s.x0),
    h: Math.max(0, s.top - s.bottom),
    base: s.base,
    size: s.size || s.top - s.bottom,
    lx0: s.lx0,
    lx1: s.lx1,
  })
  for (const line of (L?.lines ?? []) as LaidLine[]) {
    if (line.page !== page) continue
    const LL = (line.seg as { f: number; scale: number } | undefined) ?? L!
    const items = line.items
    let seg: Open | null = null
    const flush = () => {
      if (seg && /\S/u.test(seg.str)) out.push(done(seg))
      seg = null
    }
    items.forEach((it, n) => {
      const t = it.t as SegToken
      if (t.crop) {
        flush()
        if (!drawnCrop(t.crop)) return
        const c = t.crop.crop,
          b = t.crop.baseline,
          sc = LL.scale
        out.push({
          crop: {
            page: t.crop.page,
            src: [c[0]!, c[1]!, c[2]!, c[3]!],
            dst: [it.x!, line.baseline + (c[1]! - b) * sc, it.x! + it.w, line.baseline + (c[3]! - b) * sc],
            text: typeof t.crop.text === 'string' ? t.crop.text : '',
          },
          space: false,
        })
        return
      }
      if (t.space) {
        const last = out.at(-1)
        if (seg) (seg as Open).str += ' '
        else if (last && 'crop' in last) last.space = true
        return
      }
      if (typeof t.s !== 'string' || !t.s) return
      const open = seg as Open | null
      if (open && (open.cls !== t.cls || open.sup !== !!t.sup)) flush()
      const band = tokenBand(t, LL, line.baseline)
      if (!seg)
        seg = {
          str: '',
          x0: it.x!,
          x1: it.x! + it.w,
          top: band.top,
          bottom: band.bottom,
          base: band.y,
          size: 0,
          cls: t.cls,
          sup: !!t.sup,
          lx0: line.x0,
          lx1: line.x1,
        }
      const s = seg as Open
      s.str += t.s
      s.x1 = Math.max(s.x1, it.x! + it.w)
      s.top = Math.max(s.top, band.top)
      s.bottom = Math.min(s.bottom, band.bottom)
      s.size = Math.max(s.size, band.h)
      if (n === items.length - 1 && t.cls === 'latin' && !t.hyphenated) s.str += ' '
      else if (n < items.length - 1 && t.cls !== 'cjk' && ((it as { kern?: number }).kern ?? 0) >= COPY_SPACE_EM * LL.f)
        s.str += ' '
    })
    flush()
  }
  return out
}

/** a babel name drawn in the target's word as a segment: its text from `x` over its drawn width `w`, on its baseline at
 *  `size`, its band a Times-like face's or a CJK face's em box (textlayer.mjs nameSeg) */
export function nameSeg(text: string, x: number, w: number, base: number, size: number): TextSeg {
  const cjk = CJK.test(text),
    top = base + (cjk ? 0.88 : 0.75) * size,
    bottom = base + (cjk ? -0.12 : -0.22) * size
  return { str: text, x, y: bottom, w, h: top - bottom, base, size }
}

/** an item of the layer: its text, its box (x, y its left and bottom), its baseline, the size it is drawn at, where it comes
 *  from, the member that drew it, whether a copy breaks the line after it */
export type TextItem = {
  str: string
  x: number
  y: number
  w: number
  h: number
  base: number
  dir: 'ltr' | 'rtl'
  fontSize: number
  from: 'kept' | 'moved' | 'translated'
  unit?: number
  eol?: true
}
/** a drawn thing of the page in painting order: its key, the member it is (none for a name), its segments, the groups whose
 *  ink its drawing replaces (D.groups' off, as names) */
export type Drawn = { key: string; unit?: number; segs: readonly TextSeg[]; groups: readonly string[] }

function itemOut(P: Compact, i: number, from: TextItem['from'], unit?: number): TextItem {
  const o = i * F,
    x = P.num[o]!,
    base = P.num[o + 1]!,
    w = P.num[o + 2]!,
    size = P.num[o + 3]!,
    asc = P.num[o + 4]!,
    flags = P.num[o + 5]!
  const out: TextItem = {
    str: P.str[i]!,
    x,
    y: base - (1 - asc) * size,
    w,
    h: size,
    base,
    dir: flags & RTL ? 'rtl' : 'ltr',
    fontSize: size,
    from,
  }
  if (unit !== undefined) out.unit = unit
  if (flags & EOL) out.eol = true
  return out
}
const centreOf = (P: Compact, i: number, along = 0.5): [number, number] => {
  const o = i * F
  return [P.num[o]! + along * P.num[o + 2]!, P.num[o + 1]! + (P.num[o + 4]! - 0.5) * P.num[o + 3]!]
}
type Cut = { str: string[]; num: number[]; n?: number }
function pushPiece(out: Cut, P: Compact, i: number, a: number, b: number, n: number, cs: string[]) {
  const o = i * F,
    share = P.num[o + 2]! / n
  out.str.push(a === 0 && b === n ? P.str[i]! : cs.slice(a, b).join(''))
  out.num.push(
    P.num[o]! + a * share,
    P.num[o + 1]!,
    (b - a) * share,
    P.num[o + 3]!,
    P.num[o + 4]!,
    P.num[o + 5]! & (b === n ? EOL | RTL : RTL),
  )
  if (typeof out.n === 'number') out.n++
}
const inBox = (x: number, y: number, b: readonly number[]) => x >= b[0]! && x <= b[2]! && y >= b[1]! && y <= b[3]!
function relocated(it: TextItem, crop: { src: number[]; dst: number[] }): TextItem {
  const [s0, s1, s2, s3] = crop.src as [number, number, number, number],
    [d0, d1, d2, d3] = crop.dst as [number, number, number, number]
  const sx = s2 > s0 ? (d2 - d0) / (s2 - s0) : 1,
    sy = s3 > s1 ? (d3 - d1) / (s3 - s1) : 1
  return {
    ...it,
    x: d0 + (it.x - s0) * sx,
    y: d1 + (it.y - s1) * sy,
    w: it.w * sx,
    h: it.h * sy,
    base: d1 + (it.base - s1) * sy,
    fontSize: it.fontSize * sy,
  }
}
const sameLine = (a: TextItem, b: TextItem) =>
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) >= 0.5 * Math.min(a.h, b.h)

/**
 * D.text: the text layer of a laid page (textlayer.mjs textLayerOf, its items by group): `page` { n, items: A's items
 * compacted (itemsOf), view, groupOf(i): the group (`axt:<ord>.<page>.<t|e|l>`) item i's ink stands in, or null }; `drawn`:
 * each drawn thing in painting order; `o.sourceOf(page)`: another page's compact items, for a crop cut from it. Each item in
 * PDF units of the page, in reading order
 */
export function textLayer(
  page: { n: number; items: Compact; view: readonly number[]; groupOf: (i: number) => string | null },
  drawn: readonly Drawn[],
  o: { sourceOf?: (page: number) => Compact | null } = {},
) {
  const P = page.items,
    view = page.view,
    self = page.n
  const things = drawn.filter((d) => d && Array.isArray(d.segs))
  const stats = { kept: 0, moved: 0, translated: 0, dropped: 0, merged: 0 }
  // (each group off and the drawn thing whose drawing replaces its ink)
  const ownerOfGroup = new Map<string, string>()
  for (const d of things) for (const g of d.groups) if (!ownerOfGroup.has(g)) ownerOfGroup.set(g, d.key)
  const cut: Cut = { str: [], num: [] },
    owner: (string | null)[] = [],
    erasedOf: boolean[] = []
  const ownSrc: number[][] = []
  for (const d of things) for (const sg of d.segs) if ('crop' in sg && sg.crop.page === self) ownSrc.push(sg.crop.src)
  for (let i = 0; i < P.n; i++) {
    const g = page.groupOf(i)
    const by = g !== null ? (ownerOfGroup.get(g) ?? null) : null
    const cs = [...P.str[i]!],
      n = cs.length
    if (by === null) {
      // (an item in no group off: kept whole)
      cut.str.push(P.str[i]!)
      for (let f = 0; f < F; f++) cut.num.push(P.num[i * F + f]!)
      erasedOf.push(false)
      owner.push(null)
      continue
    }
    const under = cs.map((_, k) => {
      const [cx, cy] = centreOf(P, i, n > 1 ? (k + 0.5) / n : 0.5)
      return ownSrc.findIndex((b) => inBox(cx, cy, b))
    })
    for (let a = 0; a < n; ) {
      let b = a + 1
      while (b < n && under[b] === under[a]) b++
      pushPiece(cut, P, i, a, b, n, cs)
      erasedOf.push(true)
      owner.push(by)
      a = b
    }
  }
  const C: Compact = { n: cut.str.length, str: cut.str, num: cut.num },
    N = C.n
  // ---- the crops: each erased item of this page under a crop's source moved to it once; a crop cut from another page takes
  // that page's items under its source
  const claimed = new Uint8Array(N),
    byCrop = new Map<TextSeg, TextItem[]>()
  const other = new Map<number, Compact | null>()
  for (const d of things)
    for (const s of d.segs) {
      if (!('crop' in s)) continue
      const c = s.crop,
        list: TextItem[] = []
      if (c.page === self) {
        for (let i = 0; i < N; i++) {
          if (!erasedOf[i] || claimed[i]) continue
          const [cx, cy] = centreOf(C, i)
          if (inBox(cx, cy, c.src)) {
            claimed[i] = 1
            list.push(relocated(itemOut(C, i, 'moved', d.unit), c))
          }
        }
      } else {
        let Q = other.get(c.page)
        if (Q === undefined) {
          Q = o.sourceOf?.(c.page) ?? null
          other.set(c.page, Q)
        }
        for (let i = 0; Q && i < Q.n; i++) {
          const cs = [...Q.str[i]!],
            n = cs.length
          for (let a = 0; a < n; a++) {
            const [cx, cy] = centreOf(Q, i, n > 1 ? (a + 0.5) / n : 0.5)
            if (!inBox(cx, cy, c.src)) continue
            let b = a + 1
            while (b < n && inBox(...centreOf(Q, i, (b + 0.5) / n), c.src)) b++
            const piece: Cut = { n: 0, str: [], num: [] }
            pushPiece(piece, Q, i, a, b, n, cs)
            list.push(relocated(itemOut({ n: piece.n!, str: piece.str, num: piece.num }, 0, 'moved', d.unit), c))
            a = b
          }
        }
      }
      if (!list.length && /\S/u.test(c.text)) {
        const [d0, d1, d2, d3] = c.dst as [number, number, number, number],
          h = d3 - d1
        list.push({
          str: c.text,
          x: d0,
          y: d1,
          w: d2 - d0,
          h,
          base: d1 + 0.2 * h,
          dir: 'ltr',
          fontSize: h,
          from: 'moved',
          ...(d.unit !== undefined ? { unit: d.unit } : {}),
        })
      }
      for (const it of list) delete it.eol
      if (s.space && list.length) list.at(-1)!.str += ' '
      byCrop.set(s, list)
    }
  // ---- each drawn thing's anchor: the first item it erased, in the stream's order
  const anchor = new Map<string, number>()
  for (let i = 0; i < N; i++) if (erasedOf[i] && owner[i] !== null && !anchor.has(owner[i]!)) anchor.set(owner[i]!, i)
  // ---- the kept items: each inside a drawn thing's block where the stream sets it between two items that thing erased
  const keys = new Set(things.map((d) => d.key))
  const prevOwner: (string | null)[] = new Array(N).fill(null),
    nextOwner: (string | null)[] = new Array(N).fill(null)
  for (let i = 0, last: string | null = null; i < N; i++) {
    prevOwner[i] = last
    if (erasedOf[i] && owner[i] !== null) last = owner[i]!
  }
  for (let i = N - 1, next: string | null = null; i >= 0; i--) {
    nextOwner[i] = next
    if (erasedOf[i] && owner[i] !== null) next = owner[i]!
  }
  const extents = new WeakMap<TextItem, [number, number]>()
  const across = (it: TextItem) => extents.get(it) ?? [it.x, it.x + it.w]
  const after = (a: TextItem, b: TextItem) => {
    if (sameLine(a, b)) return b.x >= a.x - 0.25 * Math.min(a.h, b.h)
    const [a0, a1] = across(a),
      [b0, b1] = across(b)
    return b.y + b.h / 2 < a.y + a.h / 2 && b0 < a1 && a0 < b1
  }
  type Entry = { key: number | undefined; items: TextItem[]; block: boolean }
  const inner = new Map<string, TextItem[]>(),
    top: Entry[] = []
  for (let i = 0; i < N; i++) {
    if (erasedOf[i]) {
      if (!claimed[i]) stats.dropped++
      continue
    }
    stats.kept++
    const it = itemOut(C, i, 'kept')
    const u = prevOwner[i]!
    if (u !== null && u === nextOwner[i] && keys.has(u)) {
      const list = inner.get(u) ?? []
      inner.set(u, list)
      list.push(it)
    } else top.push({ key: i, items: [it], block: false })
  }
  const interleave = (seq: TextItem[], mine: TextItem[]) => {
    const before: TextItem[][] = seq.map(() => [])
    const end: TextItem[] = []
    for (const it of mine) {
      const at = seq.findIndex((e) => after(it, e))
      ;(at < 0 ? end : before[at]!).push(it)
    }
    const out: TextItem[] = []
    seq.forEach((e, k) => {
      out.push(...before[k]!, e)
    })
    out.push(...end)
    return out
  }
  // ---- each drawn thing's block: its segments in order, a crop's moved items at its place, its inner kept items
  const unanchored: Entry[] = []
  for (const d of things) {
    const seq: TextItem[] = []
    for (const s of d.segs) {
      if ('crop' in s) {
        const list = byCrop.get(s) ?? []
        stats.moved += list.length
        seq.push(...list)
        continue
      }
      if (!s.str || !(s.w > 0) || !(s.h > 0)) continue
      const out: TextItem = {
        str: s.str,
        x: s.x,
        y: s.y,
        w: s.w,
        h: s.h,
        base: s.base,
        dir: 'ltr',
        fontSize: s.size,
        from: 'translated',
        ...(d.unit !== undefined ? { unit: d.unit } : {}),
      }
      if (finite(s.lx0) && finite(s.lx1)) extents.set(out, [Math.min(s.lx0, s.x), Math.max(s.lx1, s.x + s.w)])
      seq.push(out)
      stats.translated++
    }
    const mine = inner.get(d.key) ?? []
    const items = mine.length ? interleave(seq, mine) : seq
    if (!items.length) continue
    const block: Entry = { key: anchor.get(d.key), items, block: d.unit !== undefined }
    if (block.key === undefined) unanchored.push(block)
    else top.push(block)
  }
  top.sort((a, b) => a.key! - b.key!)
  for (const b of unanchored) {
    const at = top.findIndex((e) => after(b.items[0]!, e.items[0]!))
    top.splice(at < 0 ? top.length : at, 0, b)
  }
  // ---- flattened, the breaks between entries made
  let items: TextItem[] = []
  for (const e of top) {
    const first = items.length
    for (const it of e.items) items.push(it)
    if (e.block && items.length > first) items.at(-1)!.eol = true
  }
  for (let k = 1; k < items.length; k++) {
    const a = items[k - 1]!,
      b = items[k]!
    if (a.eol || (a.from === b.from && (a.from !== 'translated' || a.unit === b.unit))) continue
    if (!sameLine(a, b)) a.eol = true
    else if (
      b.x - (a.x + a.w) > 0.15 * Math.min(a.fontSize, b.fontSize) &&
      !BLANK_END.test(a.str) &&
      !BLANK_START.test(b.str)
    )
      a.str += ' '
  }
  const n0 = items.length
  items = mergeRuns(items)
  if (items.length > TEXT_ITEMS_MAX) items = mergeLines(items)
  stats.merged = n0 - items.length
  if (items.length > TEXT_ITEMS_MAX) items.length = TEXT_ITEMS_MAX
  return { items, page: { w: view[2]! - view[0]!, h: view[3]! - view[1]! }, stats }
}

/** the page's own items that abut on one baseline at one size merged into one (textlayer.mjs mergeRuns) */
function mergeRuns(items: TextItem[]): TextItem[] {
  const out: TextItem[] = []
  for (const it of items) {
    const a = out.at(-1)
    const s = a ? Math.min(a.fontSize, it.fontSize) : 0
    if (
      a &&
      !a.eol &&
      a.from === it.from &&
      a.from !== 'translated' &&
      a.unit === it.unit &&
      a.dir === it.dir &&
      Math.abs(a.base - it.base) <= 0.1 * s &&
      Math.abs(a.fontSize - it.fontSize) <= 0.05 * Math.max(a.fontSize, it.fontSize)
    ) {
      const gap = it.x - (a.x + a.w)
      if (gap >= -0.1 * s && gap < 0.25 * s) {
        const y0 = Math.min(a.y, it.y),
          y1 = Math.max(a.y + a.h, it.y + it.h)
        Object.assign(a, { str: a.str + it.str, w: Math.max(a.x + a.w, it.x + it.w) - a.x, y: y0, h: y1 - y0 })
        if (it.eol) a.eol = true
        continue
      }
    }
    out.push(it)
  }
  return out
}

/** neighbouring items of one kind on one line merged into one, a page past TEXT_ITEMS_MAX (textlayer.mjs mergeLines) */
function mergeLines(items: TextItem[]): TextItem[] {
  const out: TextItem[] = []
  for (const it of items) {
    const a = out.at(-1)
    if (
      a &&
      !a.eol &&
      a.from === it.from &&
      a.unit === it.unit &&
      a.dir === it.dir &&
      sameLine(a, it) &&
      it.x >= a.x + a.w - 0.2 * a.fontSize &&
      it.x - (a.x + a.w) < 1.5 * a.fontSize
    ) {
      const gap = it.x - (a.x + a.w) > 0.15 * a.fontSize && !BLANK_END.test(a.str) && !BLANK_START.test(it.str)
      const y0 = Math.min(a.y, it.y),
        y1 = Math.max(a.y + a.h, it.y + it.h)
      Object.assign(a, {
        str: a.str + (gap ? ' ' : '') + it.str,
        w: it.x + it.w - a.x,
        y: y0,
        h: y1 - y0,
        fontSize: Math.max(a.fontSize, it.fontSize),
      })
      if (it.eol) a.eol = true
      continue
    }
    out.push({ ...it })
  }
  return out
}

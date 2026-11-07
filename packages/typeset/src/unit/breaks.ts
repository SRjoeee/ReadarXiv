// U.breaks (design-b §1.5): where the unit's forced breaks and the paragraphs TeX set of a group end its lines, paired with
// the row in the translation's order (T19, T20), and the maps the blocks and the tokens read of them, with the kept lines in
// runs (T21's inputs: C12, C14-C18). Ported from engine 065c1d973: forcedBreaks TEX:120-199, paragraphBreaks TEX:222-255, their
// merge and the measure of a line TEX:515-531 (texParts' `breaks`), finishUnit's maps L2:1484-1525, break-room.mjs.
//
// Its inputs, and the field each comes from once lane L1 states it (until then the tap's recorded values):
// - `lu`: today's layout unit: its lines (stride 8), frames (stride 6), held lines, its elements' rows (kind, flags, segments)
//   ← Placed.lines (col, KEPT), Placed.els (El.ink, El.keep; LOST, EMPTY, JOINED, OUTSIDE as the prepare's states)
// - `cls2`: each row piece's class (phClass2) ← El.kind (typed at the source)
// - `pieceLines`: the lines each source piece's words stand on (the alignment's) ← El.opens / SpanAt.opens (TeX's paragraph
//   points); `source`: the source's pieces, which the row shares its open pieces with
// - `fileLines`, `held`: the unit's lines as rectangles with their row, and the held ones ← Placed.lines
// - `rects`, `lineInfo`, `keep`: the unit's lines as laid, their rows, the lines it keeps ← Placed.lines, Line flag KEPT
// - `kept`: the lines each element kept where it stands holds (U.elements' resolutions kept, their renderings' lines)
//   ← El.ink's lines; `resolved`: the row pieces U.elements resolved
// - `lineskip` ← Part.paper.lineskip
// The SHORT test (a line ending half an em short of its frame's measure) is a guard of the re-derivation: TeX states the line
// a forced break ends (El.ends), which makes it void once stated.
import { blocksOf2, measureOf } from './blocks.ts'
import { type Rect, rectKey } from '../util.ts'

/** a placeholder row of the layout file (file.d.mts LayoutPh): its kind, flags (PH_FLAG) and segments (stride 6: page, x0,
 *  baseline, x1, top, bottom) */
export type LayoutPh = { kind: string; flags: number; segs: readonly number[] }
/** the layout file's unit as the breaks read it (file.d.mts LayoutUnit) */
export type LayoutUnit = {
  lines: readonly number[]
  frames: readonly number[]
  held?: readonly number[] | null
  ph: ReadonlyMap<number, LayoutPh>
  centred?: boolean | null
  flush?: string | null
}
/** a piece of a row as today's unit holds it (rows.mjs unitOf: the translation's pieces in its order, `k` the source's) */
export type V0Piece =
  | { t: 'text'; s: string; k?: number }
  | { t: 'ph'; src: string; k?: number }
  | { t: 'open'; src?: string; id?: unknown; k?: number }
  | { t: 'close'; src?: string; id?: unknown; k?: number }
  | { t: 'nested'; src?: string; k?: number }
/** where a break ends a line: the file's line after it, TeX's room after it in pitches and its frame's pitch (null where the
 *  next line opens another frame), and whether it is a group's paragraph */
export type Break = { next: number; room: number | null; pitch: number | null; paragraph?: true }

/** layout/file.mjs:272 PH_FLAG */
export const PH_FLAG = Object.freeze({ EMPTY: 16, LOST: 32, TEXT: 64, JOINED: 128, OUTSIDE: 256 })
/** v0's placeholder classes that draw ink of their own (TEX:18) */
const VISIBLE = new Set(['cite', 'num', 'other', 'macro', 'umacro', 'display', 'symbol'])
/** LaTeX's forced line breaks (TEX:84) */
export const FORCED_BREAK = /^\\\\\*?(?:\[[^\]]*\])?$|^\\newline$/
/** a line ends short of its frame's measure by more than this share of its size (TEX:87) */
const SHORT = 0.5

// ---- break-room.mjs: TeX's room after a forced break
/** a frame's pitch: the median of its own lines' gaps, the mean of the two middles (break-room.mjs:8 pitchOf) */
export function pitchOf(gaps: readonly number[]): number | null {
  const g = gaps.filter((v) => v > 0).sort((a, b) => a - b)
  return g.length ? (g[(g.length - 1) >> 1]! + g[g.length >> 1]!) / 2 : null
}
/** two lines' distance with no break: the pitch, or TeX's \lineskip rule's for a tall next line (break-room.mjs:16) */
export function naturalOf(pitch: number, depth: number, height: number, lineskip: readonly number[] | null): number {
  return lineskip && pitch - depth - height < lineskip[1]! ? Math.max(pitch, depth + height + lineskip[0]!) : pitch
}
/** the room a break left, in pitches, to a thousandth, never below 0 (break-room.mjs:23 roomOf) */
export function roomOf(gap: number, pitch: number, natural: number): number {
  return Math.max(0, Math.round(((gap - natural) / pitch) * 1000) / 1000)
}

/** a display's segments as [page, baseline, top, bottom] (TEX:147, 233) */
function displaysOf(lu: LayoutUnit): [number, number, number, number][] {
  const out: [number, number, number, number][] = []
  for (const row of lu.ph.values())
    if (row.kind === 'display' && !(row.flags & (PH_FLAG.LOST | PH_FLAG.EMPTY)))
      for (let s = 0; s + 5 < row.segs.length; s += 6)
        out.push([row.segs[s]!, row.segs[s + 2]!, row.segs[s + 4]!, row.segs[s + 5]!])
  return out
}

/** where each forced break of the row ends a line of the file (TEX:120 forcedBreaks) */
export function forcedBreaks(
  lu: LayoutUnit | null,
  pieces: readonly V0Piece[],
  cls2: readonly (string | null)[],
  kOf: readonly number[] | null = null,
  lineskip: readonly number[] | null = null,
): Map<number, Break> {
  const out = new Map<number, Break>()
  if (!lu) return out
  type Group = { members: number[]; before: string | null; after: string | null }
  const groups: Group[] = []
  let group: Group | null = null,
    before: string | null = null
  for (const [i, p] of pieces.entries()) {
    if (p.t === 'ph' && FORCED_BREAK.test(p.src ?? '')) {
      if (!group) {
        group = { members: [], before, after: null }
        groups.push(group)
      }
      group.members.push(i)
      continue
    }
    const cls = p.t === 'nested' ? 'num' : p.t === 'ph' ? cls2[i] : null
    if (!(p.t === 'text' ? /\S/.test(p.s ?? '') : !!cls && VISIBLE.has(cls))) continue
    const kind = cls === 'display' ? 'display' : 'text'
    if (group) {
      group.after = kind
      group = null
    }
    before = kind
  }
  const breaks = groups.filter((g) => g.before === 'text' && g.after === 'text')
  if (!breaks.length) return out
  const L = lu.lines,
    F = lu.frames,
    held = new Set(lu.held ?? []),
    n = L.length / 8
  const columns = new Map<number, number>()
  for (let f = 0; f < F.length; f += 6) {
    const c = columns.get(F[f]!)
    if (c !== undefined && c !== F[f + 1]) return out
    columns.set(F[f]!, F[f + 1]!)
  }
  const displays = displaysOf(lu)
  const cands: number[] = []
  for (let f = 0; f < F.length; f += 6) {
    const first = F[f + 2]!,
      count = F[f + 3]!
    let right = -Infinity
    for (let j = first; j < first + count; j++) if (!held.has(j)) right = Math.max(right, L[8 * j + 2]!)
    for (let j = first; j < first + count; j++) {
      if (held.has(j) || j + 1 >= n || held.has(j + 1) || !(L[8 * j + 2]! < right - SHORT * L[8 * j + 6]!)) continue
      const page = L[8 * j]!,
        hi = L[8 * j + 3]!,
        lo = L[8 * (j + 1) + 3]!
      if (L[8 * (j + 1)] === page && displays.some(([pg, base]) => pg === page && base < hi && base > lo)) continue
      if (
        displays.some(
          ([pg, , top, bottom]) => pg === page && Math.min(top, L[8 * j + 4]!) > Math.max(bottom, L[8 * j + 5]!),
        )
      )
        continue
      cands.push(j)
    }
  }
  if (cands.length !== breaks.length) return out
  if (kOf) {
    const lineOf = (page: number, base: number) => {
      let best = -1
      for (let j = 0; j < n; j++)
        if (L[8 * j] === page && (best < 0 || Math.abs(L[8 * j + 3]! - base) < Math.abs(L[8 * best + 3]! - base)))
          best = j
      return best
    }
    let side = 0
    for (const [i, p] of pieces.entries()) {
      while (side < breaks.length && breaks[side]!.members[0]! < i) side++
      if (p.t !== 'ph' && p.t !== 'nested') continue
      const row = kOf[i]! >= 0 ? lu.ph.get(kOf[i]!) : null
      if (!row || row.flags & (PH_FLAG.LOST | PH_FLAG.EMPTY | PH_FLAG.JOINED | PH_FLAG.OUTSIDE)) continue
      for (let s = 0; s + 5 < row.segs.length; s += 6) {
        const j = lineOf(row.segs[s]!, row.segs[s + 2]!)
        if (j < 0 || (side > 0 && j <= cands[side - 1]!) || (side < breaks.length && j > cands[side]!)) return out
      }
    }
  }
  const frameOf = new Int32Array(n).fill(-1)
  for (let f = 0; f < F.length; f += 6) for (let j = F[f + 2]!; j < F[f + 2]! + F[f + 3]!; j++) frameOf[j] = f
  const brk = new Set(cands),
    gaps = new Map<number, number[]>()
  for (let j = 0; j + 1 < n; j++) {
    if (brk.has(j) || held.has(j) || held.has(j + 1) || frameOf[j]! < 0 || frameOf[j] !== frameOf[j + 1]) continue
    const g = gaps.get(frameOf[j]!) ?? []
    gaps.set(frameOf[j]!, g)
    g.push(L[8 * j + 3]! - L[8 * (j + 1) + 3]!)
  }
  breaks.forEach((g, b) => {
    const j = cands[b]!,
      f = frameOf[j]!
    const pitch = f === frameOf[j + 1] ? pitchOf(gaps.get(f) ?? []) : null
    const room =
      pitch === null
        ? null
        : roomOf(
            L[8 * j + 3]! - L[8 * (j + 1) + 3]!,
            pitch,
            naturalOf(pitch, L[8 * j + 3]! - L[8 * j + 5]!, L[8 * (j + 1) + 4]! - L[8 * (j + 1) + 3]!, lineskip),
          )
    for (const i of g.members) out.set(i, { next: j + 1, room, pitch })
  })
  return out
}

/** where TeX set a group of the source as a paragraph of its own, the row holding its open piece between texts (TEX:222) */
export function paragraphBreaks(
  lu: LayoutUnit | null,
  pieces: readonly V0Piece[],
  source: readonly V0Piece[] | null,
  pieceLines: ReadonlyMap<number, readonly [number, number]> | null,
  forced: ReadonlyMap<number, Break> | null = null,
  measureOfLine: ((j: number) => [number, number] | null) | null = null,
): Map<number, Break> {
  const out = new Map<number, Break>()
  if (!lu || !source || !pieceLines?.size || lu.centred !== false || lu.flush) return out
  const L = lu.lines,
    F = lu.frames,
    held = new Set(lu.held ?? []),
    n = L.length / 8
  const frameOf = new Int32Array(n).fill(-1),
    right = new Map<number, number>()
  for (let f = 0; f < F.length; f += 6)
    for (let j = F[f + 2]!; j < F[f + 2]! + F[f + 3]!; j++) {
      frameOf[j] = f
      if (!held.has(j)) right.set(f, Math.max(right.get(f) ?? -Infinity, L[8 * j + 2]!))
    }
  const displays = displaysOf(lu)
  const forcedNext = new Set([...(forced?.values() ?? [])].map((b) => b.next))
  const located = [...pieceLines].filter(([k]) => source[k]?.t === 'text').sort((a, b) => a[0] - b[0])
  for (let q = 0; q + 1 < located.length; q++) {
    const [ka, [, j]] = located[q]!,
      [kb, [lo]] = located[q + 1]!
    if (lo !== j + 1 || j + 1 >= n || held.has(j) || held.has(j + 1) || forcedNext.has(j + 1) || frameOf[j]! < 0)
      continue
    if (!(L[8 * j + 2]! < (measureOfLine?.(j)?.[1] ?? right.get(frameOf[j]!)!) - SHORT * L[8 * j + 6]!)) continue
    const page = L[8 * j]!,
      hi = L[8 * j + 3]!,
      low = L[8 * (j + 1) + 3]!
    if (L[8 * (j + 1)] === page && displays.some(([pg, base]) => pg === page && base < hi && base > low)) continue
    if (
      displays.some(
        ([pg, , top, bottom]) => pg === page && Math.min(top, L[8 * j + 4]!) > Math.max(bottom, L[8 * j + 5]!),
      )
    )
      continue
    const between = source.slice(ka + 1, kb)
    if (between.some((p) => p.t === 'ph' && FORCED_BREAK.test(p.src ?? ''))) continue
    const g = ka + 1 + between.findIndex((p) => p.t === 'open')
    if (g <= ka) continue
    const open = source[g]! as Extract<V0Piece, { t: 'open' }>,
      closes = source.findIndex((p, k) => k > kb && p.t === 'close' && p.id === open.id)
    if (open.id === undefined || closes < 0) continue
    // (where the row holds it between texts of its own: the row shares the source's open piece, rows.mjs unitOf)
    const i = pieces.indexOf(open),
      said = (p: V0Piece) => p.t === 'text' && /\S/.test(p.s ?? '')
    if (i > 0 && !out.has(i) && pieces.slice(0, i).some(said) && pieces.slice(i + 1).some(said))
      out.set(i, { next: j + 1, room: null, pitch: null, paragraph: true })
  }
  return out
}

/** each of the file's lines' measure as the door lays it, by its row: measureOf over blocksOf2's blocks on the unit's lines
 *  (TEX:518-526 measureOfLine) */
export function measuresOfLines(fileLines: { rects: readonly Rect[]; j: readonly number[] }, held: readonly string[]) {
  let measures: Map<number, [number, number]> | null = null
  return (j: number): [number, number] | null => {
    if (!measures) {
      measures = new Map()
      const jOf = new Map(fileLines.rects.map((r, k) => [rectKey(r), fileLines.j[k]!]))
      const bs = blocksOf2({
        rects: fileLines.rects,
        pageViews: [],
        keep: new Set(held),
        lineInfo: new Map(),
        centred: false,
      })
      for (const b of bs)
        b.rects.forEach((r, k) => {
          const at = jOf.get(rectKey(r))
          if (at !== undefined) measures!.set(at, measureOf(b, null, k))
        })
    }
    return measures.get(j) ?? null
  }
}

export type BreaksInput = {
  lu: LayoutUnit | null
  pieces: readonly V0Piece[]
  cls2: readonly (string | null)[]
  kOf: readonly number[] | null
  lineskip: readonly number[] | null
  source: readonly V0Piece[] | null
  pieceLines: ReadonlyMap<number, readonly [number, number]> | null
  fileLines: { rects: readonly Rect[]; j: readonly number[] }
  held: readonly string[]
  rects: readonly Rect[]
  lineInfo: ReadonlyMap<string, { j?: number }>
  keep: readonly string[]
  kept: ReadonlyMap<number, readonly string[]>
  resolved: ReadonlySet<number>
}

/** what U.breaks says: the breaks by row piece, the kept lines in runs (regions), the maps the blocks read (breakAt, joinAt,
 *  paraAt), the regions the text passes (referenced), a group's open piece's region (openBreaks), and each resolved piece's
 *  break or region */
export type Breaks = {
  breaks: Map<number, Break>
  regionOf: Map<string, number>
  breakAt: Map<string, number>
  joinAt: Map<string, number>
  paraAt: Set<string> | null
  referenced: Set<number>
  openBreaks: Map<number, number> | null
  marks: Map<number, { region?: number; brk?: true; room?: number; brkAt?: number }>
}

/** U.breaks: the row's forced breaks and paragraphs paired with TeX's lines, and finishUnit's maps over them (L2:1484-1525) */
export function breaks(i: BreaksInput): Breaks {
  const out = forcedBreaks(i.lu, i.pieces, i.cls2, i.kOf, i.lineskip)
  const measure = measuresOfLines(i.fileLines, i.held)
  for (const [k, b] of paragraphBreaks(i.lu, i.pieces, i.source, i.pieceLines, out, measure))
    if (!out.has(k)) out.set(k, b)
  const keepSet = new Set(i.keep)
  const regionOf = new Map<string, number>(),
    breakAt = new Map<string, number>(),
    joinAt = new Map<string, number>()
  const breakNext = new Set<number>(),
    joinNext = new Map<number, number | null>(),
    breakOf = new Map<number, number>(),
    joined = new Set<number>(),
    paraNext = new Set<number>()
  for (const { next, room, pitch, paragraph } of out.values()) {
    if (room === null) breakNext.add(next)
    else joinNext.set(next, pitch)
    if (paragraph) paraNext.add(next)
  }
  let paraAt: Set<string> | null = null
  let region = -1,
    inRun = false
  for (const r of i.rects) {
    const k = rectKey(r)
    const j = breakNext.size || joinNext.size ? i.lineInfo.get(k)?.j : undefined
    if (j !== undefined && breakNext.has(j) && !keepSet.has(k) && !breakOf.has(j)) {
      region++
      inRun = false
      breakAt.set(k, region)
      breakOf.set(j, region)
      if (paraNext.has(j)) {
        paraAt ??= new Set()
        paraAt.add(k)
      }
    }
    if (j !== undefined && joinNext.has(j) && !keepSet.has(k) && !joined.has(j)) {
      joinAt.set(k, joinNext.get(j)!)
      joined.add(j)
    }
    if (keepSet.has(k)) {
      if (!inRun) region++
      inRun = true
      regionOf.set(k, region)
    } else inRun = false
  }
  const referenced = new Set<number>()
  const marks = new Map<number, { region?: number; brk?: true; room?: number; brkAt?: number }>()
  const mark = (k: number) => marks.get(k) ?? marks.set(k, {}).get(k)!
  for (const [k, lines] of i.kept) {
    const regs = lines.map((key) => regionOf.get(key)).filter((g) => g !== undefined)
    if (regs.length) {
      const g = Math.max(...regs)
      mark(k).region = g
      referenced.add(g)
    }
  }
  let openBreaks: Map<number, number> | null = null
  for (const [k, { next, room }] of out) {
    if (!i.resolved.has(k)) {
      const g = room === null && i.pieces[k]?.t === 'open' ? breakOf.get(next) : undefined
      if (g !== undefined) {
        openBreaks ??= new Map()
        openBreaks.set(k, g)
        referenced.add(g)
      }
      continue
    }
    if (room !== null) {
      if (joined.has(next)) Object.assign(mark(k), { brk: true, room, brkAt: next })
      continue
    }
    const g = breakOf.get(next)
    if (g === undefined) continue
    Object.assign(mark(k), { region: g, brk: true })
    referenced.add(g)
  }
  return { breaks: out, regionOf, breakAt, joinAt, paraAt, referenced, openBreaks, marks }
}

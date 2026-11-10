// align(inkB, inkA): every glyph of B (our marked compile, the instrument) paired with its glyph on A (arXiv's PDF), where it
// has one, by aligning the two documents' glyph sequences (design §4.1, the rules of the transfer; spike S1's align.mjs, its
// results in spike-s1/notes.md §3–§7). And every rule and image of B with A's at its place in stream order between the same
// neighbouring glyphs (S1d, spike-s1c/notes.md §5).
//
// - A glyph's key (a) is its font's base name (a subset's tag off) with its character code; key (b) its Unicode, tried for a
//   stretch where (a) leaves glyphs unmatched there; the key that matches more wins, (a) on a tie.
// - A page whose key sequence equals its partner's (the page of its number) maps by index. Each maximal run of pages that do
//   not (a stretch) is aligned whole, B's pages of the run against A's: its stream lines first (consecutive glyphs within
//   half a size of the line's first glyph's baseline, keyed by their keys), then glyph by glyph in the gaps between matched
//   lines (Myers' LCS).
// - Then block moves, each only where its partner is unique: a stream line none of whose glyphs matched, paired with A's one
//   unmatched line of its keys within the reach (its own page number, then the pages beside it, then anywhere), where each
//   side has exactly one such line there; a run of unmatched B glyphs between two matched ones whose partners bracket only
//   unmatched A glyphs, the two runs by LCS; a run of unmatched B glyphs of one owner (where the caller gives B's owners)
//   found exactly once among A's unmatched glyphs.
// - The glyphs B prints in place of an included figure (a draft frame and its file name, between its points g<n>a and
//   g<n>b) belong to no sequence: those between the points that are not the figure's own (a figure's own glyphs are shown in
//   its form XObject: the final pass's included figure keeps its text, the draft's frame prints its name as page text).
// - Every difference between two matched glyphs is a hunk, classed: `hyphen` (both sides spell the same once line-end hyphens
//   are taken out and compatibility forms decomposed: the one difference that counts as equal), `aonly`, `bonly`, `font`
//   (the same text by another font or code), `char`. A glyph wholly outside its page's view is `offpage`.
// - A box of B (a path or an image) in the slot between its glyphs k-1 and k, j-th there, pairs with the j-th box of the slot
//   between those glyphs' partners on one A page, where that slot holds as many boxes of compatible kinds (a path with a path,
//   an image with an image, and B's path with A's image: the rule Ghostscript writes as an inline image mask).
//
// No threshold decides a match: `work` bounds the steps of each LCS (a resource bound; a stretch past it is left unmatched
// and said so).
import type { Doc } from '../doc.ts'
import { isImage, isPath } from '../doc.ts'
import { lcs } from './myers.ts'

export const HUNK = Object.freeze({ none: 0, hyphen: 1, aonly: 2, bonly: 3, font: 4, char: 5 })
export type HunkClass = keyof typeof HUNK
const HUNK_NAMES = Object.keys(HUNK) as HunkClass[]
/** how a B glyph was paired: by its page's identity, by a stretch's alignment, by a block move */
export const HOW = Object.freeze({ none: 0, identical: 1, diffed: 2, moved: 3 })

export interface Mapping {
  /** each document's pages' first glyph index (pages + 1 values): a glyph's global index is its page's offset plus its own */
  offB: Int32Array
  offA: Int32Array
  /** B's glyph (global) -> A's (global), -1 for none; and back */
  bToA: Int32Array
  aToB: Int32Array
  how: Uint8Array
  /** B glyphs out of every sequence (inside a draft frame) */
  skipB: Uint8Array
  /** each glyph's hunk class (HUNK) where it is unmatched, and whether it lies wholly off its page */
  hunkB: Uint8Array
  hunkA: Uint8Array
  offpageB: Uint8Array
  offpageA: Uint8Array
  /** per B page, each box's partner on A: its A page (1-based, 0 none) and its index there */
  boxPage: Int32Array[]
  boxIndex: Int32Array[]
  /** per B page, each turned glyph's partner on A: its A page (1-based, 0 none) and its index among that page's turned */
  turnedPage: Int32Array[]
  turnedIndex: Int32Array[]
  /** per B page: identical to its partner */
  identical: boolean[]
  stretches: { pages: [number, number]; b: number; a: number; mode: 'code' | 'uni' | null; stopped: boolean }[]
  moves: { by: string; len: number; pb: number; pa: number }[]
  steps: number
}

export interface AlignOptions {
  /** B's owner of each glyph (global index; -1 none), which delimits the runs of the last block move */
  owners?: Int32Array | undefined
  /** the steps one LCS may take */
  work?: number | undefined
}

const HYPHENS = new Set(['-', '‐', '­', '‑'])
const FRAME_START = /^g(\d+)a$/
const FRAME_END = /^g(\d+)b$/

interface Flat {
  /** global glyph index of each sequence position */
  at: Int32Array
  page: Int32Array
  x0: Float64Array
  x1: Float64Array
  y: Float64Array
  size: Float64Array
  u: string[]
  /** each page's first sequence position */
  off: Int32Array
}

function flatOf(doc: Doc, skip: Uint8Array | null): { flat: Flat; offGlobal: Int32Array } {
  const offGlobal = new Int32Array(doc.pages.length + 1)
  let n = 0
  for (let p = 0; p < doc.pages.length; p++) {
    offGlobal[p] = n
    n += doc.pages[p]?.glyphs.length ?? 0
  }
  offGlobal[doc.pages.length] = n
  let m = 0
  for (let i = 0; i < n; i++) if (!skip?.[i]) m++
  const f: Flat = {
    at: new Int32Array(m),
    page: new Int32Array(m),
    x0: new Float64Array(m),
    x1: new Float64Array(m),
    y: new Float64Array(m),
    size: new Float64Array(m),
    u: new Array(m),
    off: new Int32Array(doc.pages.length + 1),
  }
  let q = 0
  for (let p = 0; p < doc.pages.length; p++) {
    f.off[p] = q
    const gs = doc.pages[p]?.glyphs ?? []
    const base = offGlobal[p] as number
    for (let j = 0; j < gs.length; j++) {
      if (skip?.[base + j]) continue
      const g = gs[j]!
      f.at[q] = base + j
      f.page[q] = p + 1
      f.x0[q] = g.x0
      f.x1[q] = g.x1
      f.y[q] = g.y
      f.size[q] = g.size
      f.u[q] = g.u
      q++
    }
  }
  f.off[doc.pages.length] = q
  return { flat: f, offGlobal }
}

/** B's glyphs inside a draft frame: from a page's g<n>a point to its g<n>b, the included figure's own (in its form) aside */
function framedOf(doc: Doc, offGlobal: Int32Array): Uint8Array {
  const skip = new Uint8Array(offGlobal[doc.pages.length] as number)
  doc.pages.forEach((pg, p) => {
    const open = new Map<string, number>()
    for (const pt of pg.points) {
      const a = FRAME_START.exec(pt.name)
      const b = FRAME_END.exec(pt.name)
      if (a) open.set(a[1] as string, pt.glyph)
      else if (b && open.has(b[1] as string)) {
        const from = open.get(b[1] as string) as number
        for (let j = from; j < pt.glyph; j++) if (!pg.glyphs[j]?.form) skip[(offGlobal[p] as number) + j] = 1
        open.delete(b[1] as string)
      }
    }
  })
  return skip
}

export function align(inkB: Doc, inkA: Doc, o: AlignOptions = {}): Mapping {
  const WORK = o.work ?? 4e8
  const pre = flatOf(inkB, null)
  const skipB = framedOf(inkB, pre.offGlobal)
  const { flat: FB, offGlobal: offB } = flatOf(inkB, skipB)
  const { flat: FA, offGlobal: offA } = flatOf(inkA, null)
  const NB = FB.at.length
  const NA = FA.at.length
  const glyphB = (q: number) => {
    const g = FB.at[q] as number
    const p = (FB.page[q] as number) - 1
    return inkB.pages[p]!.glyphs[g - (offB[p] as number)]!
  }
  const glyphA = (q: number) => {
    const g = FA.at[q] as number
    const p = (FA.page[q] as number) - 1
    return inkA.pages[p]!.glyphs[g - (offA[p] as number)]!
  }
  // keys
  const intern = new Map<string, number>()
  const kid = (k: string) => {
    let v = intern.get(k)
    if (v === undefined) {
      v = intern.size
      intern.set(k, v)
    }
    return v
  }
  const keysOf = (n: number, at: (q: number) => { base: string; code: number; u: string }, mode: 'code' | 'uni') => {
    const out = new Int32Array(n)
    for (let q = 0; q < n; q++) {
      const g = at(q)
      out[q] = kid(mode === 'uni' ? `u|${g.u}` : `c|${g.base}|${g.code < 0 ? `u${g.u}` : g.code}`)
    }
    return out
  }
  const KB = { code: keysOf(NB, glyphB, 'code'), uni: keysOf(NB, glyphB, 'uni') }
  const KA = { code: keysOf(NA, glyphA, 'code'), uni: keysOf(NA, glyphA, 'uni') }
  const owner = (q: number) => (o.owners ? (o.owners[FB.at[q] as number] as number) : -1)

  // ---- page identity, stretches
  const mB = new Int32Array(NB).fill(-1)
  const mA = new Int32Array(NA).fill(-1)
  const how = new Uint8Array(NB)
  const P = Math.max(inkA.pages.length, inkB.pages.length)
  const identical: boolean[] = []
  for (let p = 1; p <= P; p++) {
    const a0 = p <= inkA.pages.length ? (FA.off[p - 1] as number) : NA
    const a1 = p <= inkA.pages.length ? (FA.off[p] as number) : NA
    const b0 = p <= inkB.pages.length ? (FB.off[p - 1] as number) : NB
    const b1 = p <= inkB.pages.length ? (FB.off[p] as number) : NB
    let same = p <= inkA.pages.length && p <= inkB.pages.length && a1 - a0 === b1 - b0
    if (same)
      for (let i = 0; i < a1 - a0; i++)
        if (KA.code[a0 + i] !== KB.code[b0 + i]) {
          same = false
          break
        }
    identical.push(same)
    if (same)
      for (let i = 0; i < a1 - a0; i++) {
        mB[b0 + i] = a0 + i
        mA[a0 + i] = b0 + i
        how[b0 + i] = HOW.identical
      }
  }
  const stretchPages: [number, number][] = []
  for (let p = 1; p <= P; p++) {
    if (identical[p - 1]) continue
    const last = stretchPages.at(-1)
    if (last && last[1] === p - 1) last[1] = p
    else stretchPages.push([p, p])
  }
  let steps = 0
  // a stream line: consecutive glyphs of one page, each within half a size of the first one's baseline
  const runsOf = (F: Flat, lo: number, hi: number): [number, number][] => {
    const out: [number, number][] = []
    if (lo >= hi) return out
    let s = lo
    for (let i = lo + 1; i <= hi; i++) {
      if (
        i === hi ||
        F.page[i] !== F.page[s] ||
        Math.abs((F.y[i] as number) - (F.y[s] as number)) >= 0.5 * Math.max(F.size[i] as number, F.size[s] as number)
      ) {
        out.push([s, i])
        s = i
      }
    }
    return out
  }
  const lineIds = new Map<string, number>()
  const lineId = (K: Int32Array, s: number, e: number) => {
    const k = Array.prototype.join.call(K.subarray(s, e), ',')
    let v = lineIds.get(k)
    if (v === undefined) {
      v = lineIds.size
      lineIds.set(k, v)
    }
    return v
  }
  function alignStretch(KBm: Int32Array, KAm: Int32Array, b0: number, b1: number, a0: number, a1: number) {
    const LB = runsOf(FB, b0, b1)
    const LA = runsOf(FA, a0, a1)
    const hB = Int32Array.from(LB, ([s, e]) => lineId(KBm, s, e))
    const hA = Int32Array.from(LA, ([s, e]) => lineId(KAm, s, e))
    const L = lcs(hB, hA, WORK)
    let n = L.steps
    if (L.stopped) return { pairs: [] as number[], steps: n, stopped: true }
    const pairs: number[] = []
    let pb = b0
    let pa = a0
    let stopped = false
    const gap = (bs: number, be: number, as: number, ae: number) => {
      if (be <= bs || ae <= as) return
      const r = lcs(KBm.subarray(bs, be), KAm.subarray(as, ae), WORK)
      n += r.steps
      if (r.stopped) {
        stopped = true
        return
      }
      for (let q = 0; q < r.pairs.length; q += 2)
        pairs.push(bs + (r.pairs[q] as number), as + (r.pairs[q + 1] as number))
    }
    for (let q = 0; q < L.pairs.length; q += 2) {
      const [bs, be] = LB[L.pairs[q] as number]!
      const [as, ae] = LA[L.pairs[q + 1] as number]!
      gap(pb, bs, pa, as)
      for (let i = 0; i < be - bs; i++) pairs.push(bs + i, as + i)
      pb = be
      pa = ae
    }
    gap(pb, b1, pa, a1)
    return { pairs, steps: n, stopped }
  }
  const stretches: Mapping['stretches'] = []
  for (const [p0, p1] of stretchPages) {
    const b0 = FB.off[Math.min(p0, inkB.pages.length + 1) - 1] ?? NB
    const b1 = FB.off[Math.min(p1, inkB.pages.length)] ?? NB
    const a0 = FA.off[Math.min(p0, inkA.pages.length + 1) - 1] ?? NA
    const a1 = FA.off[Math.min(p1, inkA.pages.length)] ?? NA
    const tries: { mode: 'code' | 'uni'; r: ReturnType<typeof alignStretch> }[] = []
    for (const mode of ['code', 'uni'] as const) {
      const r = alignStretch(KB[mode], KA[mode], b0, b1, a0, a1)
      steps += r.steps
      tries.push({ mode, r })
      if (mode === 'code' && !r.stopped && r.pairs.length / 2 === b1 - b0 && r.pairs.length / 2 === a1 - a0) break
    }
    const best = tries.filter((t) => !t.r.stopped).sort((x, y) => y.r.pairs.length - x.r.pairs.length)[0] ?? null
    stretches.push({ pages: [p0, p1], b: b1 - b0, a: a1 - a0, mode: best?.mode ?? null, stopped: !best })
    if (!best) continue
    const pr = best.r.pairs
    for (let q = 0; q < pr.length; q += 2) {
      const bi = pr[q] as number
      const ai = pr[q + 1] as number
      mB[bi] = ai
      mA[ai] = bi
      how[bi] = HOW.diffed
    }
  }

  // ---- hunks: between consecutive matched glyphs (B's order, which is A's within an LCS), the unmatched of both sides
  const lineEnd = (F: Flat, i: number) => {
    if (i + 1 >= F.at.length || F.page[i + 1] !== F.page[i]) return true
    return (
      Math.abs((F.y[i + 1] as number) - (F.y[i] as number)) >
        0.5 * Math.max(F.size[i + 1] as number, F.size[i] as number) || (F.x0[i + 1] as number) < (F.x0[i] as number)
    )
  }
  const spell = (F: Flat, lo: number, hi: number, dropHyphens: boolean) => {
    let s = ''
    for (let i = lo; i < hi; i++) {
      const u = F.u[i] as string
      if (dropHyphens && HYPHENS.has(u) && lineEnd(F, i)) continue
      s += u
    }
    return s.normalize('NFKD').replace(/\s+/g, '')
  }
  const hunkB = new Uint8Array(NB)
  const hunkA = new Uint8Array(NA)
  {
    let pb = -1
    let pa = -1
    const flush = (b0: number, b1: number, a0: number, a1: number) => {
      if (b1 <= b0 && a1 <= a0) return
      const hb = spell(FB, b0, b1, true)
      const ha = spell(FA, a0, a1, true)
      const cls: HunkClass =
        hb === ha
          ? 'hyphen'
          : b1 <= b0
            ? 'aonly'
            : a1 <= a0
              ? 'bonly'
              : spell(FB, b0, b1, false) === spell(FA, a0, a1, false)
                ? 'font'
                : 'char'
      for (let i = b0; i < b1; i++) hunkB[i] = HUNK[cls]
      for (let i = a0; i < a1; i++) hunkA[i] = HUNK[cls]
    }
    for (let i = 0; i < NB; i++) {
      const a = mB[i] as number
      if (a < 0) continue
      if (a > pa) {
        flush(pb + 1, i, pa + 1, a)
        pb = i
        pa = a
      } else {
        flush(pb + 1, i, pa + 1, pa + 1)
        pb = i
      }
    }
    flush(pb + 1, NB, pa + 1, NA)
  }

  // ---- block moves
  const moves: Mapping['moves'] = []
  for (const reach of [0, 1, Number.POSITIVE_INFINITY])
    for (const mode of ['code', 'uni'] as const) {
      const unmatched = (F: Flat, m: Int32Array) =>
        runsOf(F, 0, F.at.length).filter(([s, e]) => {
          for (let i = s; i < e; i++) if ((m[i] as number) >= 0) return false
          return true
        })
      const lb = unmatched(FB, mB)
      const la = unmatched(FA, mA)
      const byA = new Map<number, [number, number][]>()
      const byB = new Map<number, [number, number][]>()
      for (const [s, e] of la) {
        const k = lineId(KA[mode], s, e)
        const l = byA.get(k)
        if (l) l.push([s, e])
        else byA.set(k, [[s, e]])
      }
      for (const [s, e] of lb) {
        const k = lineId(KB[mode], s, e)
        const l = byB.get(k)
        if (l) l.push([s, e])
        else byB.set(k, [[s, e]])
      }
      for (const [k, bl] of byB) {
        const al = byA.get(k)
        if (!al) continue
        for (const [s, e] of bl) {
          const p = FB.page[s] as number
          const near = al.filter(([as]) => Math.abs((FA.page[as] as number) - p) <= reach && (mA[as] as number) < 0)
          const rivals = bl.filter(([t]) => (mB[t] as number) < 0 && Math.abs((FB.page[t] as number) - p) <= reach)
          if (near.length !== 1 || rivals.length !== 1) continue
          const as = near[0]![0]
          if (
            bl.filter(
              ([t]) => (mB[t] as number) < 0 && Math.abs((FB.page[t] as number) - (FA.page[as] as number)) <= reach,
            ).length !== 1
          )
            continue
          for (let q = 0; q < e - s; q++) {
            mB[s + q] = as + q
            mA[as + q] = s + q
            how[s + q] = HOW.moved
          }
          moves.push({ by: `line-${mode}-${reach}`, len: e - s, pb: p, pa: FA.page[as] as number })
        }
      }
    }
  for (const mode of ['code', 'uni'] as const) {
    for (let i = 1; i < NB; ) {
      if ((mB[i] as number) >= 0) {
        i++
        continue
      }
      let j = i
      while (j < NB && (mB[j] as number) < 0) j++
      if (j >= NB || (mB[i - 1] as number) < 0) {
        i = j
        continue
      }
      const pa = mB[i - 1] as number
      const na = mB[j] as number
      let free = pa < na
      for (let a = pa + 1; free && a < na; a++) if ((mA[a] as number) >= 0) free = false
      if (free && na - pa > 1) {
        const r = lcs(KB[mode].subarray(i, j), KA[mode].subarray(pa + 1, na), WORK)
        steps += r.steps
        for (let q = 0; q < r.pairs.length; q += 2) {
          const bi = i + (r.pairs[q] as number)
          const ai = pa + 1 + (r.pairs[q + 1] as number)
          mB[bi] = ai
          mA[ai] = bi
          how[bi] = HOW.moved
        }
        if (r.pairs.length)
          moves.push({
            by: `gap-${mode}`,
            len: r.pairs.length / 2,
            pb: FB.page[i] as number,
            pa: FA.page[pa + 1] as number,
          })
      }
      i = j
    }
  }
  if (o.owners) {
    // (the runs of one owner, longest first, each matched where its key string occurs exactly once among A's unmatched)
    const enc = (k: number) => String.fromCharCode(k % 0xfffe)
    let pool = ''
    const poolAt: number[] = []
    for (let i = 0; i < NA; i++) {
      if ((mA[i] as number) >= 0) {
        if (pool.length && pool[pool.length - 1] !== '￿') {
          pool += '￿'
          poolAt.push(-1)
        }
        continue
      }
      pool += enc(KA.code[i] as number)
      poolAt.push(i)
    }
    const used = new Uint8Array(NA)
    const runs: [number, number][] = []
    for (let i = 0; i < NB; ) {
      if ((mB[i] as number) >= 0 || hunkB[i] === HUNK.hyphen || owner(i) < 0) {
        i++
        continue
      }
      let j = i + 1
      while (j < NB && (mB[j] as number) < 0 && owner(j) === owner(i) && hunkB[j] !== HUNK.hyphen) j++
      runs.push([i, j])
      i = j
    }
    runs.sort((x, y) => y[1] - y[0] - (x[1] - x[0]) || x[0] - y[0])
    for (const [i, j] of runs) {
      let s = ''
      for (let q = i; q < j; q++) s += enc(KB.code[q] as number)
      const at: number[] = []
      for (let k = pool.indexOf(s); k >= 0; k = pool.indexOf(s, k + 1)) {
        if (!at.some((x) => k < x + s.length)) at.push(k)
        if (at.length > 1) break
      }
      if (at.length !== 1) continue
      const k = at[0] as number
      let free = true
      for (let q = 0; q < s.length && free; q++) if (used[poolAt[k + q] as number]) free = false
      if (!free) continue
      for (let q = 0; q < s.length; q++) {
        const ai = poolAt[k + q] as number
        used[ai] = 1
        mB[i + q] = ai
        mA[ai] = i + q
        how[i + q] = HOW.moved
      }
      moves.push({ by: 'run', len: j - i, pb: FB.page[i] as number, pa: FA.page[poolAt[k] as number] as number })
    }
  }

  // ---- back to global indices
  const nB = offB[inkB.pages.length] as number
  const nA = offA[inkA.pages.length] as number
  const bToA = new Int32Array(nB).fill(-1)
  const aToB = new Int32Array(nA).fill(-1)
  const howG = new Uint8Array(nB)
  const hunkBG = new Uint8Array(nB)
  for (let q = 0; q < NB; q++) {
    const g = FB.at[q] as number
    howG[g] = how[q] as number
    hunkBG[g] = hunkB[q] as number
    const a = mB[q] as number
    if (a >= 0) {
      bToA[g] = FA.at[a] as number
      aToB[FA.at[a] as number] = g
    }
  }
  const offpageOf = (doc: Doc, off: Int32Array, n: number) => {
    const out = new Uint8Array(n)
    doc.pages.forEach((pg, p) => {
      const [vx0, vy0, vx1, vy1] = pg.view
      pg.glyphs.forEach((g, j) => {
        if (g.x1 <= vx0 || g.x0 >= vx1 || g.top <= vy0 || g.bottom >= vy1) out[(off[p] as number) + j] = 1
      })
    })
    return out
  }

  // ---- boxes: by their slot between the same neighbouring glyphs
  const boxPage: Int32Array[] = []
  const boxIndex: Int32Array[] = []
  const pageOfA = (g: number) => {
    let lo = 0
    let hi = inkA.pages.length
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1
      if ((offA[m] as number) <= g) lo = m
      else hi = m
    }
    return lo
  }
  const claimed = inkA.pages.map((pg) => new Uint8Array(pg.kinds.length))
  inkB.pages.forEach((b, p) => {
    const bp = new Int32Array(b.kinds.length)
    const bi = new Int32Array(b.kinds.length).fill(-1)
    boxPage.push(bp)
    boxIndex.push(bi)
    const n = b.glyphs.length
    let k = 0
    for (let x = 0; x < b.kinds.length; x++) {
      const kind = b.kinds[x] as number
      if (!isPath(kind) && !isImage(kind)) continue
      while (k < n && (b.boxAt[k] as number) <= x) k++
      const prev = k > 0 ? (bToA[(offB[p] as number) + k - 1] as number) : null
      const next = k < n ? (bToA[(offB[p] as number) + k] as number) : null
      if ((prev !== null && prev < 0) || (next !== null && next < 0)) continue
      const pp = prev !== null ? pageOfA(prev) : null
      const pn = next !== null ? pageOfA(next) : null
      if (pp !== null && pn !== null && (pp !== pn || (next as number) <= (prev as number))) continue
      const ap = pp ?? pn
      if (ap === null) continue
      const pa = inkA.pages[ap]!
      const la = prev !== null ? prev - (offA[ap] as number) : -1
      const lb = next !== null ? next - (offA[ap] as number) : pa.glyphs.length
      const SA0 = la < 0 ? 0 : (pa.boxAt[la] as number)
      const SA1 = lb >= pa.glyphs.length ? pa.kinds.length : (pa.boxAt[lb] as number)
      const SB0 = k === 0 ? 0 : (b.boxAt[k - 1] as number)
      const SB1 = k >= n ? b.kinds.length : (b.boxAt[k] as number)
      if (SA1 - SA0 !== SB1 - SB0) continue
      let same = true
      for (let q = 0; q < SB1 - SB0 && same; q++) {
        const kb = b.kinds[SB0 + q] as number
        const ka = pa.kinds[SA0 + q] as number
        const ok =
          (isPath(kb) && isPath(ka)) || (isImage(kb) && isImage(ka)) || (isPath(kb) && isImage(ka)) || kb === ka
        if (!ok) same = false
      }
      if (!same) continue
      const y = SA0 + (x - SB0)
      if (claimed[ap]![y]) continue
      claimed[ap]![y] = 1
      bp[x] = ap + 1
      bi[x] = y
    }
  })

  // ---- turned glyphs, as boxes are: by their slot between the same level glyphs, with the same keys in it
  const turnedPage: Int32Array[] = []
  const turnedIndex: Int32Array[] = []
  const tclaimed = inkA.pages.map((pg) => new Uint8Array(pg.turned?.length ?? 0))
  const tkey = (t: { u: string; base: string }) => `${t.base}|${t.u}`
  inkB.pages.forEach((b, p) => {
    const T = b.turned ?? []
    const tp = new Int32Array(T.length)
    const ti = new Int32Array(T.length).fill(-1)
    turnedPage.push(tp)
    turnedIndex.push(ti)
    const n = b.glyphs.length
    for (let s0 = 0; s0 < T.length; ) {
      const k = T[s0]!.at
      let s1 = s0
      while (s1 < T.length && T[s1]!.at === k) s1++
      const slot = T.slice(s0, s1)
      const prev = k > 0 ? (bToA[(offB[p] as number) + k - 1] as number) : null
      const next = k < n ? (bToA[(offB[p] as number) + k] as number) : null
      s0 = s1
      if ((prev !== null && prev < 0) || (next !== null && next < 0)) continue
      const pp = prev !== null ? pageOfA(prev) : null
      const pn = next !== null ? pageOfA(next) : null
      if (pp !== null && pn !== null && (pp !== pn || (next as number) <= (prev as number))) continue
      const ap = pp ?? pn ?? (inkB.pages.length === inkA.pages.length ? p : null)
      if (ap === null) continue
      const pa = inkA.pages[ap]!
      const la = prev !== null ? prev - (offA[ap] as number) : -1
      const lb = next !== null ? next - (offA[ap] as number) : pa.glyphs.length
      const TA = pa.turned ?? []
      const cand: number[] = []
      TA.forEach((t, j) => {
        if (t.at >= la + 1 && t.at <= lb) cand.push(j)
      })
      if (cand.length !== slot.length || cand.some((j, q) => tkey(TA[j]!) !== tkey(slot[q]!) || tclaimed[ap]![j]))
        continue
      cand.forEach((j, q) => {
        tclaimed[ap]![j] = 1
        tp[s1 - slot.length + q] = ap + 1
        ti[s1 - slot.length + q] = j
      })
    }
  })

  const hunkAG = new Uint8Array(nA)
  for (let q = 0; q < NA; q++) hunkAG[FA.at[q] as number] = hunkA[q] as number
  return {
    offB,
    offA,
    bToA,
    aToB,
    how: howG,
    skipB,
    hunkB: hunkBG,
    hunkA: hunkAG,
    offpageB: offpageOf(inkB, offB, nB),
    offpageA: offpageOf(inkA, offA, nA),
    boxPage,
    boxIndex,
    turnedPage,
    turnedIndex,
    identical: identical.slice(0, inkB.pages.length),
    stretches,
    moves,
    steps,
  }
}

export const hunkName = (code: number): HunkClass => HUNK_NAMES[code] ?? 'none'

/** the pages of A our compile sets, by A's page: true where one of its glyphs, level or turned, has a partner on B. A page none of
 *  whose glyphs has one is a page our compile never makes (2610.20030v1's pages 9 to 12, a second top-level file of its source
 *  that arXiv compiles and joins to the first, our compile the first's alone): a fact of the mapping, never a share of glyphs */
export function setPagesOf(m: Mapping): boolean[] {
  const n = m.offA.length - 1
  const out = new Array<boolean>(n).fill(false)
  for (let i = 0; i < n; i++)
    for (let a = m.offA[i] as number; a < (m.offA[i + 1] as number); a++)
      if ((m.aToB[a] as number) >= 0) {
        out[i] = true
        break
      }
  for (const tp of m.turnedPage) for (const ap of tp) if (ap > 0) out[ap - 1] = true
  return out
}

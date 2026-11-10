// A figure's texts as its printed lines tell them (the owner's ruling of 2026-11-10, PDF-READER §18.23): the runs today's figure
// reading cuts (figure-text.mjs figureUnitsOf, its atoms, read as they are) gathered into the lines they stand on, a line that
// holds a run set in a face of one pitch and words of another one figure text whose runs of one pitch are its elements (F0:
// "Project Page:" and its address, a title and its path), a line whose every word stands between glyphs of one pitch kept whole
// (code: Rule 1's inside-a-line, read on the line); and each crowded text's ink (roomOf's `met`) judged by its relation to the
// text, the owner's reformulation of the no-touch rule: its own, a decoration of a stretch of its glyphs (a frame, a fill, a rule;
// a doubled copy), a container round all of it, or unrelated ink, never covered. Pure arithmetic over a page's glyphs and boxes;
// every measure the figure reading's, in its size: RUN_DY, RUN_GAP, SPACE_GAP, DRAW_BAND.
import {
  DRAW_BAND,
  RUN_DY,
  RUN_GAP,
  SPACE_GAP,
  type TodayFigures,
  type TodayMet,
  type TodayPage,
} from './today/today.types.ts'

/** a glyph as the figure reading reads one (pageInk's, a page of today's makers) */
interface G {
  u: string
  font: string
  size: number
  x0: number
  x1: number
  y: number
  top: number
  bottom: number
  ix0?: number
  ix1?: number
  form?: boolean
  fid?: number
  pid?: number
  blank?: boolean
  unseen?: boolean
}

/** a figure text this reading makes or judges anew */
export interface FigureText {
  /** its runs (figureUnitsOf's units by k), in their line's order: the first its figure group's */
  ks: number[]
  page: number
  /** its pieces in its line's order: text (its glyphs on its page, by index) or an element (`els`' index) */
  order: ({ t: 'text'; glyphs: number[] } | { t: 'el'; i: number })[]
  /** its elements: `code` (a run of one pitch), `cite` (a stretch a decoration holds, a letter in it), `ref` (one with none); each
   *  its glyphs and its boxes (a decoration's, a ground's) on its page */
  els: { kind: 'code' | 'cite' | 'ref'; glyphs: number[]; boxes: number[] }[]
  /** glyphs no run held that it takes (a comma between two addresses, a digit): its text's */
  claimed: number[]
  /** a doubled copy of its glyphs (a glyph of one of its characters over one of them): hidden with its text */
  copies: number[]
  /** boxes decorating the whole of it (a rule under all of it): hidden with its text */
  textBoxes: number[]
  /** why its ink stays: crowded (unrelated ink its band meets), code (a line of code, kept whole), or null */
  why: 'crowded' | 'code' | null
  /** a closed shape round all of it: its room's edges over and under its baseline (PDF units up and down from it) */
  container: { over: number; under: number } | null
  /** the depth under its baseline of the stroke under its text (roomOf's `under`) */
  under: number | null
}

const WORD = /\p{L}{2}/u
const LETTER = /\p{L}/u
const bare = (name: string) => String(name ?? '').replace(/^[A-Z]{6}\+/, '')
const real = (g: G | undefined): g is G => !!g && !g.blank && !g.unseen && /\S/u.test(g.u ?? '')
/** the band a translation is drawn in, DRAW_BAND's em: two of it is a line with its leading at most (a ground one line tall) */
const BAND_EM = DRAW_BAND[1] - DRAW_BAND[0]

/** a printed line: its runs and the glyphs no run holds on it, in its order along x */
interface Line {
  ks: number[]
  gs: number[]
  free: Set<number>
  y: number
  size: number
  x0: number
  x1: number
  fig: string
}

/**
 * The figure texts of a document's pages that its printed lines make anew (F0's lines, the lines of code) or whose crowding the
 * relation reading judges otherwise than today's reading: each with its runs (`ks`); a run of no such text stays as today's
 * reading made it. `owned(p, g)`: whether a glyph is a unit's or a block's (no figure's text). `fixed`: the faces the document
 * sets at one pitch where Rule 1 keeps such text (none: no line is read for F0)
 */
export function figureLinesOf(
  pages: readonly TodayPage[],
  fig: TodayFigures,
  owned: (p: number, g: number) => boolean,
  fixed: ReadonlySet<string> | null,
): FigureText[] {
  const out: FigureText[] = []
  const pitch = (g: G) => !!fixed && fixed.has(bare(g.font))
  pages.forEach((pg, pi) => {
    const p = pi + 1
    const glyphs = (pg.glyphs ?? []) as G[]
    const boxes = (pg.boxes ?? []) as number[]
    const map = fig.glyphs[pi]
    if (!map?.size) return
    // ---- the page's level runs, each its glyphs (in their order along x), its baseline, size, extent and figure
    const runOf = new Map<number, number[]>()
    for (const [g, k] of map) (runOf.get(k) ?? runOf.set(k, []).get(k)!).push(g)
    const figOf = (g: G) => `${g.form ? 'f' : 'p'}${g.fid ?? 0}:${g.pid ?? 0}`
    const lines: Line[] = []
    for (const [k, gs0] of runOf) {
      const u = fig.units[k]!
      if (Math.abs((u.ux ?? 1) - 1) > 1e-6 || Math.abs(u.uy ?? 0) > 1e-6) continue
      const gs = gs0.filter((g) => real(glyphs[g])).sort((a, b) => glyphs[a]!.x0 - glyphs[b]!.x0)
      if (!gs.length) continue
      lines.push(lineOf([k], gs, new Set(), glyphs, figOf(glyphs[gs[0]!]!)))
    }
    if (!lines.length) return
    // (a run's extent with its ground's: a box holding its end glyph's band, a line tall at most; a chip's fill)
    const groundOf = (l: Line): { x0: number; x1: number; ids: Set<number> } => {
      let x0 = l.x0,
        x1 = l.x1
      const ids = new Set<number>()
      const ends = [glyphs[l.gs[0]!]!, glyphs[l.gs.at(-1)!]!]
      for (let b = 0; b + 3 < boxes.length; b += 4) {
        const bx0 = Math.min(boxes[b]!, boxes[b + 2]!),
          bx1 = Math.max(boxes[b]!, boxes[b + 2]!)
        const by0 = Math.min(boxes[b + 1]!, boxes[b + 3]!),
          by1 = Math.max(boxes[b + 1]!, boxes[b + 3]!)
        if (by1 - by0 <= 0 || by1 - by0 > 2 * BAND_EM * l.size) continue
        for (const g of ends)
          if (bx0 <= g.x0 && bx1 >= g.x1 && by0 <= g.bottom && by1 >= g.top) {
            x0 = Math.min(x0, bx0)
            x1 = Math.max(x1, bx1)
            ids.add(b / 4)
          }
      }
      return { x0, x1, ids }
    }
    // ---- lines: runs of one figure on one baseline, consecutive within the run gap (a run's ground's edges counting where the
    // other stands on none: two boxed labels are two), and the glyphs no run holds on the line nearest them within it
    const free: number[] = []
    for (let g = 0; g < glyphs.length; g++) {
      const x = glyphs[g]!
      if (map.has(g) || owned(p, g) || !real(x) || !(x.form || (x.pid ?? 0) > 0)) continue
      free.push(g)
    }
    for (let again = true; again; ) {
      again = false
      lines.sort((a, b) => b.y - a.y || a.x0 - b.x0)
      for (let i = 0; i < lines.length && !again; i++)
        for (let j = i + 1; j < lines.length && !again; j++) {
          const a = lines[i]!,
            b = lines[j]!
          const size = Math.max(a.size, b.size)
          if (a.fig !== b.fig || Math.abs(a.y - b.y) > RUN_DY * size) continue
          let gap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)
          if (gap > RUN_GAP * size) {
            const ga = groundOf(a),
              gb = groundOf(b)
            if (ga.ids.size && gb.ids.size && ![...ga.ids].some((x) => gb.ids.has(x))) continue
            gap = Math.max(ga.x0, gb.x0) - Math.min(ga.x1, gb.x1)
          }
          if (gap > RUN_GAP * size) continue
          lines[i] = lineOf([...a.ks, ...b.ks], [...a.gs, ...b.gs], new Set([...a.free, ...b.free]), glyphs, a.fig)
          lines.splice(j, 1)
          again = true
        }
      for (let q = free.length - 1; q >= 0; q--) {
        const g = glyphs[free[q]!]!
        let best: Line | null = null
        for (const l of lines) {
          if (l.fig !== figOf(g) || Math.abs(g.y - l.y) > 0.5 * Math.max(g.size, l.size)) continue
          if (g.x0 > l.x1 + RUN_GAP * l.size || g.x1 < l.x0 - RUN_GAP * l.size) continue
          if (!best || Math.abs(g.y - l.y) < Math.abs(g.y - best.y)) best = l
        }
        if (!best) continue
        const at = lines.indexOf(best)
        lines[at] = lineOf(best.ks, [...best.gs, free[q]!], new Set([...best.free, free[q]!]), glyphs, best.fig)
        free.splice(q, 1)
        again = true
      }
    }
    // ---- each line read: its glyphs' roles, F (a face of one pitch) or T, in its order; its text F0's or code's
    for (const l of lines) {
      const ft = readLine(l, glyphs, pitch)
      const items = l.ks.flatMap((k) => fig.met.get(k)?.items ?? [])
      const crowded = l.ks.some((k) => fig.units[k]!.why === 'crowded')
      const under = l.ks.reduce<number | null>((u, k) => {
        const x = fig.met.get(k)?.under ?? fig.units[k]!.under ?? null
        return x === null ? u : u === null ? x : Math.min(u, x)
      }, null)
      if (ft) {
        ft.page = p
        ft.under = under
        if (crowded) judge(ft, items, glyphs)
        out.push(ft)
        continue
      }
      // (a run alone, as today's reading made it, judged anew where it was crowded)
      if (!crowded) continue
      for (const k of l.ks) {
        const m = fig.met.get(k)
        if (!m) continue
        const gs = runOf.get(k)!.filter((g) => real(glyphs[g]))
        const one: FigureText = {
          ks: [k],
          page: p,
          order: [{ t: 'text', glyphs: [...gs].sort((a, b) => glyphs[a]!.x0 - glyphs[b]!.x0) }],
          els: [],
          claimed: [],
          copies: [],
          textBoxes: [],
          why: null,
          container: null,
          under: m.under,
        }
        judge(one, m.items, glyphs)
        if (one.why !== 'crowded' || one.els.length) out.push(one)
      }
    }
  })
  return out
}

function lineOf(ks: number[], gs0: number[], free: Set<number>, glyphs: readonly G[], fig: string): Line {
  const gs = [...new Set(gs0)].sort((a, b) => glyphs[a]!.x0 - glyphs[b]!.x0 || a - b)
  // (its size the size most of its run glyphs stand at; its baseline theirs)
  const n = new Map<number, number>()
  for (const g of gs) if (!free.has(g)) n.set(glyphs[g]!.size, (n.get(glyphs[g]!.size) ?? 0) + 1)
  const size = [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? glyphs[gs[0]!]!.size
  const main = gs.filter((g) => !free.has(g) && Math.abs(glyphs[g]!.size - size) <= 0.01 * size)
  const ys = main.map((g) => glyphs[g]!.y).sort((a, b) => a - b)
  return {
    ks,
    gs,
    free,
    y: ys[ys.length >> 1] ?? glyphs[gs[0]!]!.y,
    size,
    x0: Math.min(...gs.map((g) => glyphs[g]!.x0)),
    x1: Math.max(...gs.map((g) => glyphs[g]!.x1)),
    fig,
  }
}

/**
 * A line's figure text where it is one of F0's or a line of code, else null. Its glyphs' roles in its order: F (a face of one
 * pitch) or T; a stretch of T that spells a word is the line's text; one standing between F glyphs right before and right after
 * it, every one of them, makes the line code, kept whole (Rule 1's inside-a-line: 2411.13093v4 p19's Georgia word inside a
 * Consolas line); else each stretch of F an element `code`. The glyphs no run holds before its first run's (an icon TeX set
 * before the first word) are none of it, as today's reading leaves them
 */
function readLine(l: Line, glyphs: readonly G[], pitch: (g: G) => boolean): FigureText | null {
  if (l.ks.length < 2 && !l.free.size) {
    // (one run alone: F0 has nothing to join)
    return null
  }
  // (the glyphs no run holds before its first run's: the text's where each abuts the glyph after it, no word space between (an
  // opening bracket, a code line's opening quote); from one standing a word space apart back, an icon TeX set before the first
  // word, none of it)
  let first = l.gs.findIndex((g) => !l.free.has(g))
  while (first > 0) {
    const a = glyphs[l.gs[first - 1]!]!,
      b = glyphs[l.gs[first]!]!
    if (b.x0 - a.x1 >= SPACE_GAP * Math.min(a.size, b.size)) break
    first--
  }
  const gs = l.gs.slice(first)
  const role = gs.map((g) => (pitch(glyphs[g]!) ? 'F' : 'T'))
  if (!role.includes('F')) return null
  const stretches: { r: string; gs: number[] }[] = []
  gs.forEach((g, i) => {
    const s = stretches.at(-1)
    if (s && s.r === role[i]) s.gs.push(g)
    else stretches.push({ r: role[i]!, gs: [g] })
  })
  const words = stretches.filter((s) => s.r === 'T' && WORD.test(textOf(s.gs, glyphs).normalize('NFKC')))
  if (!words.length) return null
  const code = words.every((s) => {
    const i = stretches.indexOf(s)
    return stretches[i - 1]?.r === 'F' && stretches[i + 1]?.r === 'F'
  })
  // (outside a line of code, a stretch of one pitch with no letter or digit, a mark alone ("behavior." its period set in the
  // face of one pitch), is the text's, no element, the stretches beside it one)
  const pieces: typeof stretches = []
  for (const st of stretches) {
    const r = !code && st.r === 'F' && !st.gs.some((g) => /[\p{L}\p{N}]/u.test(glyphs[g]!.u)) ? 'T' : st.r
    const last = pieces.at(-1)
    if (last && last.r === r) last.gs.push(...st.gs)
    else pieces.push({ r, gs: [...st.gs] })
  }
  if (!code && !pieces.some((st) => st.r === 'F')) return null
  const ft: FigureText = {
    ks: [...l.ks],
    page: 0,
    order: [],
    els: [],
    claimed: gs.filter((g) => l.free.has(g)),
    copies: [],
    textBoxes: [],
    why: code ? 'code' : null,
    container: null,
    under: null,
  }
  if (code) {
    ft.order.push({ t: 'text', glyphs: gs })
    return ft
  }
  for (const s of pieces) {
    if (s.r === 'T') ft.order.push({ t: 'text', glyphs: s.gs })
    else {
      ft.els.push({ kind: 'code', glyphs: s.gs, boxes: [] })
      ft.order.push({ t: 'el', i: ft.els.length - 1 })
    }
  }
  return ft
}

/** a stretch's text: its glyphs' Unicode (NFKC), a space where two stand SPACE_GAP of their size apart */
export function textOf(gs: readonly number[], glyphs: readonly G[]): string {
  let s = ''
  let end: number | null = null
  for (const j of gs) {
    const x = glyphs[j]!
    if (end !== null && x.x0 - end >= SPACE_GAP * x.size && !s.endsWith(' ')) s += ' '
    s += (x.u ?? '').normalize('NFKC')
    end = x.x1
  }
  return s.replace(/\s+/gu, ' ').trim()
}

/**
 * A crowded figure text's met ink judged by its relation to the text (the owner's reformulation of 2026-11-10): own (its glyphs,
 * a rule inside one of its elements' extent: a fraction's bar, a chip's rule), a decoration (a shape holding the ink centres of a
 * contiguous stretch of its glyphs and of no other glyph: a frame round a citation, a chip's fill; a rule of horizontal segments
 * alone under or through such a stretch; a doubled copy, a glyph of the same character over one of its own within half its size
 * across), a container (a closed shape, every segment's end met by another, holding every glyph of it, their ink strictly
 * inside), or unrelated ink, never covered: `crowded`. A decoration of a stretch is that stretch's element, carrying it (a
 * framed citation an element, never translated); of all of it, hidden with its text; a copy hidden with its text
 */
function judge(ft: FigureText, items: readonly TodayMet[], glyphs: readonly G[]): void {
  const textGs = ft.order.flatMap((o) => (o.t === 'text' ? o.glyphs : ft.els[o.i]!.glyphs))
  const own = new Set(textGs)
  const at = new Map(textGs.map((g, i) => [g, i]))
  let unrelated = false
  for (const it of items) {
    if ('g' in it) {
      if (own.has(it.g)) continue
      const x = glyphs[it.g]!
      const twin = textGs.some((j) => {
        const y = glyphs[j]!
        return (
          y.u === x.u &&
          (y.ix1 ?? y.x1) > (x.ix0 ?? x.x0) &&
          (y.ix0 ?? y.x0) < (x.ix1 ?? x.x1) &&
          Math.abs(y.y - x.y) <= 0.5 * y.size
        )
      })
      if (twin) ft.copies.push(it.g)
      else unrelated = true
      continue
    }
    const [x0, y0, x1, y1] = [
      Math.min(it.box[0]!, it.box[2]!),
      Math.min(it.box[1]!, it.box[3]!),
      Math.max(it.box[0]!, it.box[2]!),
      Math.max(it.box[1]!, it.box[3]!),
    ]
    const hw = it.shape?.hw ?? 0
    // (a rule inside an element's extent: the element's)
    const el = ft.els.find((e) => {
      const ex0 = Math.min(...e.glyphs.map((g) => glyphs[g]!.x0)),
        ex1 = Math.max(...e.glyphs.map((g) => glyphs[g]!.x1))
      return x0 >= ex0 - hw && x1 <= ex1 + hw
    })
    if (el) {
      el.boxes.push(it.b)
      continue
    }
    // (the glyphs whose ink centre it holds: its own and any other)
    const held: number[] = []
    let others = false
    for (let j = 0; j < glyphs.length; j++) {
      const g = glyphs[j]!
      if (!real(g)) continue
      const cx = ((g.ix0 ?? g.x0) + (g.ix1 ?? g.x1)) / 2,
        cy = (g.top + g.bottom) / 2
      if (cx > x0 && cx < x1 && cy > y0 && cy < y1) {
        if (own.has(j)) held.push(j)
        else others = true
      }
    }
    const idx = held.map((g) => at.get(g)!).sort((a, b) => a - b)
    const contiguous = idx.length > 0 && idx.at(-1)! - idx[0]! + 1 === idx.length
    // (a decoration holds whole words: its stretch's ink inside it, and the stretch from a word's start to a word's end, a word
    // space or a mark that is no letter or digit beside it, its line's end; never a letter of a word, a plot's marker over it)
    if (
      held.length &&
      !others &&
      contiguous &&
      held.length < own.size &&
      held.every((j) => inside(glyphs[j]!, x0, y0, x1, y1)) &&
      wordBounded(textGs, idx, glyphs)
    ) {
      decorate(
        ft,
        idx.map((i) => textGs[i]!),
        it.b,
        glyphs,
      )
      continue
    }
    if (
      held.length === own.size &&
      !others &&
      closed(it.shape) &&
      textGs.every((j) => inside(glyphs[j]!, x0, y0, x1, y1))
    ) {
      ft.container = roomIn(it.shape!, textGs, glyphs)
      continue
    }
    // (a rule of horizontal segments alone, its extent inside a stretch of its glyphs': an underline, a strike)
    if (it.shape?.stroke && !it.shape.fill && flat(it.shape)) {
      const over = textGs.filter((j) => glyphs[j]!.x1 > x0 + hw && glyphs[j]!.x0 < x1 - hw)
      const span = over.map((g) => at.get(g)!).sort((a, b) => a - b)
      const starts = over.some((j) => glyphs[j]!.x0 <= x0 + hw),
        ends = over.some((j) => glyphs[j]!.x1 >= x1 - hw)
      if (
        span.length >= 2 &&
        starts &&
        ends &&
        span.at(-1)! - span[0]! + 1 === span.length &&
        wordBounded(textGs, span, glyphs)
      ) {
        if (span.length === own.size) ft.textBoxes.push(it.b)
        else
          decorate(
            ft,
            span.map((i) => textGs[i]!),
            it.b,
            glyphs,
          )
        continue
      }
    }
    unrelated = true
  }
  ft.why = unrelated ? 'crowded' : ft.why === 'crowded' ? null : ft.why
}

/** whether a stretch of a text's glyphs (`idx`, contiguous places in `gs`, its line order) is words whole: it holds a letter or
 *  a digit, and the glyph before it and the glyph after it stand a word space apart from it (SPACE_GAP of their size) or are no
 *  letter or digit, or are none */
function wordBounded(gs: readonly number[], idx: readonly number[], glyphs: readonly G[]): boolean {
  const word = /[\p{L}\p{N}]/u
  const side = (a: number | undefined, b: number | undefined, after: boolean) => {
    if (a === undefined || b === undefined) return true
    const x = glyphs[a]!,
      y = glyphs[b]!
    const [l, r] = after ? [y, x] : [x, y]
    return r.x0 - l.x1 >= SPACE_GAP * Math.min(l.size, r.size) || !word.test(x.u)
  }
  return (
    idx.some((i) => word.test(glyphs[gs[i]!]!.u)) &&
    side(gs[idx[0]! - 1], gs[idx[0]!], false) &&
    side(gs[idx.at(-1)! + 1], gs[idx.at(-1)!], true)
  )
}

/** a stretch of a figure text's glyphs its decoration holds: its element, the decoration its box (an element it is inside or
 *  that is inside it, a code run's, takes the box; else the stretch of its text becomes an element of its own) */
function decorate(ft: FigureText, stretch: number[], b: number, glyphs: readonly G[]): void {
  const s = new Set(stretch)
  const hit = ft.els.find((e) => e.glyphs.every((g) => s.has(g)) || stretch.every((g) => e.glyphs.includes(g)))
  if (hit) {
    hit.boxes.push(b)
    return
  }
  // (cut out of the text pieces it lies in: an element of its own, `cite` where it holds a letter, `ref` where it holds none)
  const kind = stretch.some((g) => LETTER.test(glyphs[g]!.u)) ? 'cite' : 'ref'
  const order: FigureText['order'] = []
  const i = ft.els.length
  ft.els.push({ kind, glyphs: [...stretch], boxes: [b] })
  let placed = false
  for (const o of ft.order) {
    if (o.t === 'el') {
      order.push(o)
      continue
    }
    let cur: number[] = []
    for (const g of o.glyphs) {
      if (s.has(g)) {
        if (cur.length) order.push({ t: 'text', glyphs: cur })
        cur = []
        if (!placed) order.push({ t: 'el', i })
        placed = true
      } else cur.push(g)
    }
    if (cur.length) order.push({ t: 'text', glyphs: cur })
  }
  ft.order = order
}

/** whether a path's segments close: every segment's end met by another's (to the hundredth of a unit) */
function closed(shape: { segs: ArrayLike<number> } | null): boolean {
  if (!shape || shape.segs.length < 12) return false
  const deg = new Map<string, number>()
  for (let i = 0; i + 3 < shape.segs.length; i += 4)
    for (const [x, y] of [
      [shape.segs[i]!, shape.segs[i + 1]!] as const,
      [shape.segs[i + 2]!, shape.segs[i + 3]!] as const,
    ]) {
      const k = `${Math.round(x * 100)}|${Math.round(y * 100)}`
      deg.set(k, (deg.get(k) ?? 0) + 1)
    }
  return [...deg.values()].every((d) => d % 2 === 0)
}
const flat = (shape: { segs: ArrayLike<number> }) => {
  for (let i = 0; i + 3 < shape.segs.length; i += 4)
    if (Math.abs(shape.segs[i + 1]! - shape.segs[i + 3]!) > 1e-3) return false
  return shape.segs.length >= 4
}
const inside = (g: G, x0: number, y0: number, x1: number, y1: number) =>
  (g.ix0 ?? g.x0) > x0 && (g.ix1 ?? g.x1) < x1 && g.bottom > y0 && g.top < y1

/**
 * A container's room about a text: the nearest of its edges over its baseline and under it across the text's extent, each
 * segment read where it stands over that extent (a rectangle's top and bottom; a diamond's slanted sides at the extent's ends),
 * its half line width in: up and down from the baseline, PDF units
 */
function roomIn(
  shape: { segs: ArrayLike<number>; hw: number; stroke: boolean },
  gs: readonly number[],
  glyphs: readonly G[],
) {
  const x0 = Math.min(...gs.map((g) => glyphs[g]!.x0)),
    x1 = Math.max(...gs.map((g) => glyphs[g]!.x1))
  const ys = gs.map((g) => glyphs[g]!.y).sort((a, b) => a - b)
  const base = ys[ys.length >> 1]!
  const w = shape.stroke ? shape.hw : 0
  let over = Infinity,
    under = Infinity
  const S = shape.segs
  for (let i = 0; i + 3 < S.length; i += 4) {
    const [ax, ay, bx, by] = [S[i]!, S[i + 1]!, S[i + 2]!, S[i + 3]!]
    const lo = Math.max(Math.min(ax, bx), x0),
      hi = Math.min(Math.max(ax, bx), x1)
    if (lo > hi) continue
    for (const x of [lo, hi]) {
      const y = Math.abs(bx - ax) < 1e-9 ? Math.max(ay, by) : ay + ((x - ax) * (by - ay)) / (bx - ax)
      const ylo = Math.abs(bx - ax) < 1e-9 ? Math.min(ay, by) : y
      if (y > base) over = Math.min(over, y - w - base)
      if (ylo < base) under = Math.min(under, base - (ylo + w))
    }
  }
  return { over: Number.isFinite(over) ? over : 0, under: Number.isFinite(under) ? under : 0 }
}

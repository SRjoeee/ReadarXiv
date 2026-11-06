// The instrument from the plan (contract stage 1c-2, item 3): the marked compile's outputs — its points in B's content
// streams, its log's channels — joined to the units through the plan (markSource's), never by running the marking again or
// reading our own TeX: a point's name is looked up in the plan, which says which unit and which piece it brackets.
//
// The ownership rules are today's (layout/own.mjs MR 1-6), the ones the marks state: a unit's text from its start point to its
// end point in the start's region (a column's body or not, a depth of floats: the bracket points), across pages inside the
// bodies; an element's from its opening point to its closing one, or to the next point in its region where it has none; a
// label, the glyphs on the start's line between the unit before and the start; the closing punctuation set right after the
// end point on its line; a babel name's between its two points; the thin rules TeX painted on the text's own lines. Not here:
// what no source unit owns (today's ink units, kept blocks and figure texts: the ledger's and figure-text.mjs's readings of
// the rest, which the design gives to `locate`), and own.mjs's follows (the marking's rebuilt reading of an opening alone).
//
// TRANSITION: `Instrument`, `Owners`, `ROLE` are copied from lane L1's packages/engine/src/instrument.ts (branch
// rebuild/prepare); at the merge this module imports them from there and the copies go.
import type { SourceDoc } from '../source/read.ts'
import { unitId } from '../source/id.ts'
import type { Piece } from '../source/types.ts'
import { classOf, symbolText } from './classes.ts'
import type { Plan, PlanMark } from './mark.ts'

// ---------------------------------------------------------------- L1's seam (copied: see the header)
export const ROLE = Object.freeze({ none: 0, text: 1, element: 2, label: 4, name: 8 })
export interface Owners {
  unit: Int32Array
  role: Uint8Array
  piece: Int32Array
}
export interface InstrumentUnit {
  id: string
  kind: string
  content: Piece[]
  depth?: number
  kept?: true
  fixed?: true
  echo?: number
  cell?: { table: number; row: number; col: number; span?: number; rows?: number; head?: true }
  align?: 'j' | 'l' | 'c' | 'r'
  name?: string
  figure?: { set: number; dir?: [number, number] }
  why?: string
}
export interface Instrument<Doc = unknown> {
  ink: Doc
  units: InstrumentUnit[]
  glyphs: Owners[]
  boxes: Owners[]
  turned?: Owners[]
  tex: { lineskip?: [number, number]; paragraphEnds?: number[][] }
  made: { compiler: string; tree: string; front: string }
}
export const ownersOf = (n: number): Owners => ({
  unit: new Int32Array(n).fill(-1),
  role: new Uint8Array(n),
  piece: new Int32Array(n).fill(-1),
})

// ---------------------------------------------------------------- B's pages as pageInk reads them
export interface PageGlyph {
  u?: string
  x0: number
  x1: number
  y: number
  size: number
}
export interface PagePoint {
  name: string
  /** the glyphs and the boxes shown before it on its page */
  glyph: number
  box: number
}
export interface PageRead {
  glyphs: readonly PageGlyph[]
  /** four numbers a box: x0, y0, x1, y1 */
  boxes: ArrayLike<number>
  points: readonly PagePoint[]
  paraEnds?: readonly { glyph: number }[]
}

const BRACKET = /^([bf])([se])\d+$/
/** each glyph's, box's and point's region: a column's body or not, a depth of floats (stream.mjs regionsOf) */
function regionsOf(pg: PageRead): { glyph: Int32Array; box: Int32Array; at: Int32Array } {
  const nBoxes = Math.floor(pg.boxes.length / 4)
  const glyph = new Int32Array(pg.glyphs.length)
  const box = new Int32Array(nBoxes)
  const at = new Int32Array(pg.points.length)
  const code = (body: boolean, depth: number) => depth * 2 + (body ? 1 : 0)
  let body = false
  let depth = 0
  const apply = (name: string) => {
    const m = BRACKET.exec(name)
    if (!m) return
    if (m[1] === 'b') body = m[2] === 's'
    else depth = m[2] === 's' ? depth + 1 : Math.max(0, depth - 1)
  }
  for (let q = 0, g = 0; g <= pg.glyphs.length; g++) {
    while (q < pg.points.length && (pg.points[q] as PagePoint).glyph <= g) {
      apply((pg.points[q] as PagePoint).name)
      at[q] = code(body, depth)
      q++
    }
    if (g < pg.glyphs.length) glyph[g] = code(body, depth)
  }
  body = false
  depth = 0
  for (let q = 0, b = 0; b < nBoxes; b++) {
    while (q < pg.points.length && (pg.points[q] as PagePoint).box <= b) apply((pg.points[q++] as PagePoint).name)
    box[b] = code(body, depth)
  }
  return { glyph, box, at }
}

// ---------------------------------------------------------------- the log's channels (marks.mjs readAlign, readSkipProbe)
/** the code of a paragraph's skips (marks.mjs alignCode): both sides stretching and \parfillskip none past them, centred;
 *  \rightskip alone flush left; \leftskip alone flush right; neither justified */
const alignCode = (lo: number, ls: number, ro: number, rs: number, po: number, ps: number): 'j' | 'l' | 'c' | 'r' => {
  const L = lo > 0 || ls > 0
  const R = ro > 0 || rs > 0
  const F = po > 0 || ps > 0
  if (L && R) return !F || po < Math.min(lo, ro) ? 'c' : 'j'
  return L ? 'r' : R ? 'l' : 'j'
}
/** each unit's alignment as its end mark states it (AXT-ALIGN, its 79-column wrap joined): none for one set in an \hbox, nor
 *  for one TeX set in two alignments (marks.mjs readAlign) */
export function readAlign(log: string): Map<number, 'j' | 'l' | 'c' | 'r'> {
  const last = new Map<number, 'j' | 'l' | 'c' | 'r' | null>()
  const told = new Map<number, 'j' | 'l' | 'c' | 'r' | false>()
  const text = log.replace(/^(AXT-ALIGN .{69})\n/gm, '$1')
  for (const m of text.matchAll(
    /^AXT-ALIGN h?(\d{1,9}) ([phv]) ([0-4]) (-?[\d.]+)pt ([0-4]) (-?[\d.]+)pt ([0-4]) (-?[\d.]+)pt$/gm,
  )) {
    const v = [m[3], m[4], m[5], m[6], m[7], m[8]].map(Number) as [number, number, number, number, number, number]
    if (!v.every(Number.isFinite)) continue
    const id = Number(m[1])
    const code = m[2] === 'h' ? null : alignCode(...v)
    last.set(id, code)
    if (code !== null) told.set(id, told.has(id) && told.get(id) !== code ? false : code)
  }
  const out = new Map<number, 'j' | 'l' | 'c' | 'r'>()
  for (const [id, c] of [...last].sort((a, b) => a[0] - b[0])) {
    const t = told.get(id)
    if (c !== null && t !== false) out.set(id, c)
  }
  return out
}
const TEX_PT = /^(-?\d+(?:\.\d+)?)pt$/
const BP_PER_PT = 72 / 72.27
/** the paper's \lineskip and \lineskiplimit in PDF units from the probe's row (marks.mjs readSkipProbe) */
export function readLineskip(log: string): [number, number] | null {
  const rows = [...log.matchAll(/^LAYOUT-PROBE (\d+) ([a-z][a-z0-9-]*)((?: [^ \n]+)*) *$/gm)]
    .map((m) => ({ schema: Number(m[1]), tag: m[2], fields: (m[3] as string).trim().split(' ').filter(Boolean) }))
    .filter((r) => r.schema === 1 && r.tag === 'lineskip')
  if (rows.length !== 1 || rows[0]?.fields.length !== 2) return null
  const pt = rows[0].fields.map((f) => Number(TEX_PT.exec(f)?.[1] ?? Number.NaN))
  return pt.every((x) => Number.isFinite(x) && Math.abs(x) <= 16384)
    ? (pt.map((x) => x * BP_PER_PT) as [number, number])
    : null
}

// ---------------------------------------------------------------- the text after a piece (marks.mjs followsOf's `want`)
/** source text as TeX's ligatures and LaTeX's quotes set it, white space and ties none (marks.mjs asSet) */
const asSet = (s: string) =>
  s
    .replace(/---/g, '\u2014')
    .replace(/--/g, '\u2013')
    .replace(/``/g, '\u201c')
    .replace(/''/g, '\u201d')
    .replace(/`/g, '\u2018')
    .replace(/'/g, '\u2019')
    .replace(/[~\s]/g, '')
/** a glyph's text as the stream reads it (stream.mjs charOf) */
const charOf = (u: string) =>
  u
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s|\p{Variation_Selector}/gu, '')
const WANT = 8
/** what TeX sets after piece k of a unit, up to its next visible piece, as its first WANT letters (followsOf's `want`): a
 *  text's text, a symbol's character before any text, nothing for a piece of no class or a macro TeX said sets no ink */
function wantAfter(
  pieces: readonly SourceDoc['units'][number]['pieces'][number][],
  k: number,
  inkless: ReadonlySet<string>,
  marked: (q: number) => boolean,
): string {
  let after = ''
  for (let q = k + 1; q < pieces.length; q++) {
    const p = pieces[q] as (typeof pieces)[number]
    const c = classOf(p)
    if (!c) {
      if (p.t === 'text') after += p.s
      continue
    }
    if (c !== 'macro') break
    if (p.t === 'ph' && inkless.has(p.src)) continue
    const sym = p.t === 'ph' ? symbolText(p.src) : null
    if (sym !== null && asSet(sym) === sym && !marked(q) && !/\S/.test(after)) {
      after += sym
      continue
    }
    break
  }
  return asSet(after).normalize('NFKC').toLowerCase().replace(/\s/g, '').slice(0, WANT)
}

// ---------------------------------------------------------------- ownership
const TAIL_PUNCT = /^[.,;:!?)\]]$/
const NAME_START = /^n(\d+)\.([a-z]{1,16})\.s$/
const NAME_END = /^n(\d+)\.([a-z]{1,16})\.e$/
interface At {
  page: number
  q: number
  point: PagePoint
}
const before = (a: At, b: At) => a.page < b.page || (a.page === b.page && a.point.glyph <= b.point.glyph)

/**
 * The instrument of a marked compile: `pages` B's pages as pageInk read them (the reading `ink` is of, handed through), `plan`
 * and `doc` what markSource wrote and what it wrote it from, `log` the marked compile's last pass's log
 */
export function instrumentFromPlan<Doc>({
  ink,
  pages,
  plan,
  doc,
  log = '',
  made,
  inkless = [],
}: {
  ink: Doc
  /** the macros TeX said set no ink (the probe's answer, as markSource took it) */
  inkless?: readonly string[]
  pages: readonly PageRead[]
  plan: Plan
  doc: SourceDoc
  log?: string
  made: { compiler: string; tree: string }
}): Instrument<Doc> {
  const noInk = new Set(inkless)
  const byName = new Map<string, PlanMark>()
  for (const m of plan.marks) byName.set(m.name, m)
  // (every point of a mark the plan names, in document order)
  const seen = new Map<string, At[]>()
  pages.forEach((pg, page) => {
    pg.points.forEach((point, q) => {
      if (!byName.has(point.name) && !NAME_START.test(point.name) && !NAME_END.test(point.name)) return
      const list = seen.get(point.name) ?? (seen.set(point.name, []).get(point.name) as At[])
      list.push({ page, q, point })
    })
  })
  const regions = pages.map(regionsOf)
  const glyphs = pages.map((pg) => ownersOf(pg.glyphs.length))
  const boxes = pages.map((pg) => ownersOf(Math.floor(pg.boxes.length / 4)))
  const units: InstrumentUnit[] = doc.units.map((u) => ({
    id: u.id,
    kind: u.kind,
    content: u.content,
    ...(u.depth !== undefined ? { depth: u.depth } : {}),
  }))
  const align = readAlign(log)
  align.forEach((code, i) => {
    if (units[i]) (units[i] as InstrumentUnit).align = code
  })
  /** a unit's own marks: start and end names by kind */
  const startOf = new Map<number, string>()
  const endOf = new Map<number, string>()
  for (const m of plan.marks) {
    if (m.kind === 'start' || m.kind === 'cell-start' || m.kind === 'heading-start') startOf.set(m.unit, m.name)
    if (m.kind === 'end' || m.kind === 'cell-end' || m.kind === 'heading-end') endOf.set(m.unit, m.name)
  }
  const set = (O: Owners, j: number, unit: number, role: number, piece = -1) => {
    O.unit[j] = unit
    O.role[j] = role
    O.piece[j] = piece
  }
  /** glyphs [from, to) of a page in a region (all regions where `region` is null) */
  const range = (page: number, from: number, to: number, region: number | null, f: (j: number) => void) => {
    const R = regions[page]?.glyph as Int32Array
    for (let j = Math.max(0, from); j < to; j++) if (region === null || R[j] === region) f(j)
  }
  const boxRange = (page: number, from: number, to: number, region: number | null, f: (j: number) => void) => {
    const R = regions[page]?.box as Int32Array
    for (let j = Math.max(0, from); j < to; j++) if (region === null || R[j] === region) f(j)
  }
  // ---- the units' text, the longest ranges first so that a unit inside another's range keeps its own
  const spans: { unit: number; s: At | null; e: At; length: number }[] = []
  for (const [unit, endName] of endOf) {
    const ends = seen.get(endName) ?? []
    const starts = seen.get(startOf.get(unit) ?? '') ?? []
    const s = starts[0] ?? null
    const e = s ? ends.find((x) => before(s, x)) : ends[0]
    if (!e) {
      if (units[unit]) (units[unit] as InstrumentUnit).why = 'marks'
      continue
    }
    const length = s ? (e.page - s.page) * 1e6 + e.point.glyph - s.point.glyph : 0
    spans.push({ unit, s, e, length })
  }
  for (const u of units) if (!endOf.has(units.indexOf(u)) && !u.why) u.why = 'unmarked'
  spans.sort((a, b) => b.length - a.length)
  for (const { unit, s, e } of spans) {
    if (!s) {
      // (an end mark alone, a title TeX sets in vertical mode: from the point before it on its page, its glyphs alone)
      const pg = pages[e.page] as PageRead
      const from = e.q > 0 ? (pg.points[e.q - 1] as PagePoint).glyph : 0
      range(e.page, from, e.point.glyph, null, (j) => set(glyphs[e.page] as Owners, j, unit, ROLE.text))
      continue
    }
    const region = regions[s.page]?.at[s.q] as number
    for (let page = s.page; page <= e.page; page++) {
      const pg = pages[page] as PageRead
      const from = page === s.page ? s.point.glyph : 0
      const to = page === e.page ? e.point.glyph : pg.glyphs.length
      // (across pages only inside the bodies: a region outside one is the start page's alone)
      if (page !== s.page && region % 2 === 0) break
      range(page, from, to, region, (j) => set(glyphs[page] as Owners, j, unit, ROLE.text))
      const bFrom = page === s.page ? s.point.box : 0
      const bTo = page === e.page ? e.point.box : Math.floor(pg.boxes.length / 4)
      boxRange(page, bFrom, bTo, region, (j) => set(boxes[page] as Owners, j, unit, ROLE.text))
    }
    // (the closing punctuation TeX sets right after the end point, on its line, abutting: the unit's text)
    const pg = pages[e.page] as PageRead
    const last = pg.glyphs[e.point.glyph - 1]
    for (let j = e.point.glyph; j < pg.glyphs.length && last; j++) {
      const g = pg.glyphs[j] as PageGlyph
      const prev = pg.glyphs[j - 1] as PageGlyph
      if (
        !TAIL_PUNCT.test(g.u ?? '') ||
        Math.abs(g.y - last.y) > 0.5 * Math.max(g.size, last.size) ||
        g.x0 - prev.x1 > 0.2 * g.size
      )
        break
      if (((glyphs[e.page] as Owners).unit[j] as number) >= 0) break
      set(glyphs[e.page] as Owners, j, unit, ROLE.text)
    }
  }
  // ---- the elements: opening to closing point, or to the next point in its region
  for (const m of plan.marks) {
    if (m.kind !== 'open') continue
    const close = m.name.replace(/a$/, 'b')
    for (const a of seen.get(m.name) ?? []) {
      const pg = pages[a.page] as PageRead
      const region = regions[a.page]?.at[a.q] as number
      const b = (seen.get(close) ?? []).find((x) => x.page === a.page && x.point.glyph >= a.point.glyph)
      let to = b?.point.glyph
      let bTo = b?.point.box
      if (to === undefined) {
        // (an opening alone: to where the text TeX sets after the piece begins, before the next point of its region)
        const next = pg.points.find((x, q) => q > a.q && regions[a.page]?.at[q] === region)
        to = next?.glyph ?? pg.glyphs.length
        bTo = next?.box ?? Math.floor(pg.boxes.length / 4)
        const u = doc.units[m.unit]
        const want = u ? wantAfter(u.pieces, m.piece, noInk, (q) => byName.has(`p${m.unit}.${q}a`)) : ''
        if (want) {
          const R = regions[a.page]?.glyph as Int32Array
          for (let j = a.point.glyph; j < to; j++) {
            if (R[j] !== region) continue
            let s = ''
            for (let g = j; g < to && s.length < want.length; g++) {
              if (R[g] !== region) continue
              const G = pg.glyphs[g] as PageGlyph
              // (a hyphen TeX set at a line's end is no letter of the text: the next glyph stands on another line)
              const N = pg.glyphs[g + 1]
              if (g > j && /^[-‐]$/.test(G.u ?? '') && N && Math.abs(N.y - G.y) > 0.5 * Math.max(N.size, G.size))
                continue
              s += charOf(G.u ?? '')
            }
            if (s.startsWith(want)) {
              to = j
              break
            }
          }
        }
      }
      // (a text symbol sets its character and nothing else: where its reading begins with it, those glyphs are its unit's text and
      // nothing past them is its ink: own.mjs settingOf)
      const piece = doc.units[m.unit]?.pieces[m.piece]
      const sym = piece?.t === 'ph' ? symbolText(piece.src) : null
      if (sym !== null) {
        const want = charOf(sym)
        let spelled = ''
        for (let g = a.point.glyph; g < to && spelled.length < want.length; g++)
          spelled += charOf((pg.glyphs[g] as PageGlyph).u ?? '')
        if (want && spelled.startsWith(want)) continue
      }
      range(a.page, a.point.glyph, to, region, (j) => set(glyphs[a.page] as Owners, j, m.unit, ROLE.element, m.piece))
      boxRange(a.page, a.point.box, bTo ?? a.point.box, region, (j) =>
        set(boxes[a.page] as Owners, j, m.unit, ROLE.element, m.piece),
      )
    }
  }
  /** the piece of ink at a unit's head that the marking passed over (no mark of its own), before its first text: -1 none */
  const headPiece = (unit: number): number => {
    const ps = doc.units[unit]?.pieces ?? []
    for (let k = 0; k < ps.length; k++) {
      const p = ps[k] as (typeof ps)[number]
      if (p.t === 'text') {
        if (/\S/.test(p.s)) return -1
        continue
      }
      if (p.t !== 'ph' || !classOf(p)) continue
      return byName.has(`p${unit}.${k}a`) ? -1 : k
    }
    return -1
  }
  // ---- the labels: on the start's line, between the last end point before it and the start (none for a cell)
  for (const { unit, s } of spans) {
    if (!s || doc.units[unit]?.kind === 'cell') continue
    const pg = pages[s.page] as PageRead
    const first = pg.glyphs[s.point.glyph]
    if (!first) continue
    let from = 0
    for (let q = s.q - 1; q >= 0; q--) {
      const m = byName.get((pg.points[q] as PagePoint).name)
      if (m && (m.kind === 'end' || m.kind === 'cell-end' || m.kind === 'heading-end')) {
        from = (pg.points[q] as PagePoint).glyph
        break
      }
    }
    const O = glyphs[s.page] as Owners
    const run: number[] = []
    for (let j = s.point.glyph - 1; j >= from; j--) {
      const g = pg.glyphs[j] as PageGlyph
      if (Math.abs(g.y - first.y) > 0.5 * Math.max(g.size, first.size)) break
      if ((O.unit[j] as number) >= 0) continue
      run.unshift(j)
    }
    // (a unit whose head is a piece of ink the marking passed over, before its first text (a heading's `\sys{} Framework`):
    // that piece's ink stands between the label and the start, after the label's first word space; it is the piece's)
    const head = headPiece(unit)
    let cut = run.length
    if (head >= 0)
      for (let r = 1; r < run.length; r++) {
        const a = pg.glyphs[run[r - 1] as number] as PageGlyph
        const b = pg.glyphs[run[r] as number] as PageGlyph
        if (b.x0 - a.x1 > 0.2 * Math.max(a.size, b.size)) {
          cut = r
          break
        }
      }
    run.forEach((j, r) => {
      if (r < cut) set(O, j, unit, ROLE.label)
      else set(O, j, unit, ROLE.element, head)
    })
  }
  // ---- babel's names: one unit a key, its occurrences its own
  const keyUnit = new Map<string, number>()
  pages.forEach((pg, page) => {
    pg.points.forEach((pt, q) => {
      const m = NAME_START.exec(pt.name)
      if (!m) return
      const end = pg.points.find((x, r) => r > q && x.name === `n${m[1]}.${m[2]}.e`)
      if (!end) return
      const key = m[2] as string
      if (!keyUnit.has(key)) {
        keyUnit.set(key, units.length)
        const content: Piece[] = [{ t: 'text', s: key }]
        units.push({ id: unitId('name', content), kind: 'name', content, name: key, kept: true })
      }
      const unit = keyUnit.get(key) as number
      range(page, pt.glyph, end.glyph, null, (j) => set(glyphs[page] as Owners, j, unit, ROLE.name))
    })
  })
  const lineskip = readLineskip(log)
  return {
    ink,
    units,
    glyphs,
    boxes,
    tex: {
      ...(lineskip ? { lineskip } : {}),
      paragraphEnds: pages.map((pg) => (pg.paraEnds ?? []).map((x) => x.glyph)),
    },
    made: { compiler: made.compiler, tree: made.tree, front: 'marks' },
  }
}

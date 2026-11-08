// The marked compile's log channels and what they state with B's points: each unit's alignment (AXT-ALIGN), the paper's
// \lineskip (the probe's row), each page's text frame (AXT-BODY at each body's opening point). Read by the front half's adapter
// (src/pdf-reader/engine/pipeline/instrument.mjs, through the package's entry). Of the instrument's types alone.
import type { TexFrame } from '../instrument.ts'

/** the code of a paragraph's skips (marks.mjs alignCode): both sides stretching and \parfillskip none past them, centred;
 *  \rightskip alone flush left; \leftskip alone flush right; neither justified */
const alignCode = (lo: number, ls: number, ro: number, rs: number, po: number, ps: number): 'j' | 'l' | 'c' | 'r' => {
  const L = lo > 0 || ls > 0
  const R = ro > 0 || rs > 0
  const F = po > 0 || ps > 0
  if (L && R) return !F || po < Math.min(lo, ro) ? 'c' : 'j'
  return L ? 'r' : R ? 'l' : 'j'
}
/**
 * Each unit's alignment as its end mark states it (AXT-ALIGN, its 79-column wrap joined, in the order TeX set the paragraphs):
 * none for one TeX set last in an \hbox (marks.mjs readAlign: a caption set as a paragraph and then in a box). A unit TeX set
 * as paragraphs of two alignments has its first's: the unit is its first occurrence (own.mjs MR 3, the marks' and the
 * instrument's ownership; pdfTeX keeps a destination set twice at its first), the text a template sets again after it its
 * copy, never its own (2608.25210v2's title and authors, centred by \maketitle and set again ragged right in VLDB's "PVLDB
 * Reference Format"; 2610.22065v1's title in ACM's reference format, justified; an author's name in an e-mail footnote): an
 * alignment TeX stated is never dropped for a copy's, the full line its title fills read off A as justified
 */
export function readAlign(log: string): Map<number, 'j' | 'l' | 'c' | 'r'> {
  const last = new Map<number, 'j' | 'l' | 'c' | 'r' | null>()
  const told = new Map<number, 'j' | 'l' | 'c' | 'r'>()
  const text = log.replace(/^(AXT-ALIGN .{69})\n/gm, '$1')
  for (const m of text.matchAll(
    /^AXT-ALIGN h?(\d{1,9}) ([phv]) ([0-4]) (-?[\d.]+)pt ([0-4]) (-?[\d.]+)pt ([0-4]) (-?[\d.]+)pt$/gm,
  )) {
    const v = [m[3], m[4], m[5], m[6], m[7], m[8]].map(Number) as [number, number, number, number, number, number]
    if (!v.every(Number.isFinite)) continue
    const id = Number(m[1])
    const code = m[2] === 'h' ? null : alignCode(...v)
    last.set(id, code)
    if (code !== null && !told.has(id)) told.set(id, code)
  }
  const out = new Map<number, 'j' | 'l' | 'c' | 'r'>()
  for (const [id, c] of [...last].sort((a, b) => a[0] - b[0])) {
    const t = told.get(id)
    if (c !== null && t !== undefined) out.set(id, t)
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

/** a TeX scaled point in PDF units (65,536 sp a TeX point) */
const BP_PER_SP = BP_PER_PT / 65536
/** a body TeX shipped as it states it (AXT-BODY): which column it is (1 the left, 2 the right; 0 a one-column page's body or a
 *  text block shipped whole), the column's and the text block's widths and its box's left edge on its page, in PDF units */
export type TexBody = { side: 0 | 1 | 2; column: number; text: number; x: number }
/**
 * Each bracketed body's statement (marks.mjs LAYOUT_TEX's `AXT-BODY <n> <side> <\columnwidth> <\textwidth> <x>`, written at
 * the shipout beside the body's opening point `bs<n>`), by its serial: the first (a box shipped twice states it twice, the
 * same). A line not of the form is passed over: a compile made before the statement, or an engine with no saved position
 * (its x empty), states none
 */
export function readBodies(log: string): Map<number, TexBody> {
  const out = new Map<number, TexBody>()
  for (const m of log.matchAll(/^AXT-BODY (\d{1,9}) ([012]) (\d+(?:\.\d+)?)pt (\d+(?:\.\d+)?)pt (-?\d{1,12}) *$/gm)) {
    const n = Number(m[1])
    if (out.has(n)) continue
    const [column, text, x] = [Number(m[3]) * BP_PER_PT, Number(m[4]) * BP_PER_PT, Number(m[5]) * BP_PER_SP]
    if (!(column > 0 && text > 0 && column <= text + 0.5 && Number.isFinite(x))) continue
    out.set(n, { side: Number(m[2]) as 0 | 1 | 2, column, text, x })
  }
  return out
}
/** a body's opening point (POINTS_TEX's `bs<n>`) and a page's column mark (MARK_DEF's `c<columns>-<page>`, a point beside its
 *  destination) */
const BODY_POINT = /^bs(\d+)$/
const COLUMNS_POINT = /^c([12])-\d+$/
/**
 * Each page's text frame as TeX shipped it (Instrument.tex.frames), from the bodies whose opening points stand on it and their
 * statements (readBodies): the text block from where TeX shipped a body (a left column's or a whole body's box at its left
 * edge, a right column's at \textwidth less \columnwidth past it) to \textwidth after; its columns, on a page TeX set in two
 * (a body that is a column of two, or the page's column mark where its class ships its text block whole: revtex's ltxgrid),
 * each \columnwidth at both edges of the block (LaTeX's \@outputdblcol), else the block. Null for a page no stated body stands
 * on, and for one of two columns whose width TeX gave as the block's (multicol's columns, set inside one body: unstated)
 */
export function framesOf(pages: readonly { points: readonly { name: string }[] }[], log: string): (TexFrame | null)[] {
  const bodies = readBodies(log)
  const r2 = (v: number) => Math.round(v * 100) / 100
  return pages.map((pg) => {
    let body: TexBody | undefined
    let two = false
    for (const pt of pg.points) {
      const c = COLUMNS_POINT.exec(pt.name)
      if (c) two = c[1] === '2'
      const b = BODY_POINT.exec(pt.name)
      const s = b ? bodies.get(Number(b[1])) : undefined
      if (s && (!body || (body.side === 2 && s.side !== 2))) body = s
    }
    if (!body) return null
    const x0 = body.side === 2 ? body.x - (body.text - body.column) : body.x
    const block: [number, number] = [r2(x0), r2(x0 + body.text)]
    if (body.side === 0 && !two) return { block, columns: [block] }
    if (body.text - body.column < 1) return null
    return {
      block,
      columns: [
        [r2(x0), r2(x0 + body.column)],
        [r2(x0 + body.text - body.column), r2(x0 + body.text)],
      ],
    }
  })
}

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
/** LaTeX's column classes (\@chnum: c, l, r, m, p, b) as the alignment they set a cell's line by; m, p and b's lines are a
 *  paragraph's */
const CELL_CLASS: readonly ('c' | 'l' | 'r' | undefined)[] = ['c', 'l', 'r']
/**
 * Each unit's alignment as its end mark states it (AXT-ALIGN, its 79-column wrap joined, in the order TeX set the paragraphs):
 * none for one TeX set last in an \hbox (marks.mjs readAlign: a caption set as a paragraph and then in a box). A unit TeX set
 * as paragraphs of two alignments has its first's: the unit is its first occurrence (own.mjs MR 3, the marks' and the
 * instrument's ownership; pdfTeX keeps a destination set twice at its first), the text a template sets again after it its
 * copy, never its own (2608.25210v2's title and authors, centred by \maketitle and set again ragged right in VLDB's "PVLDB
 * Reference Format"; 2610.22065v1's title in ACM's reference format, justified; an author's name in an e-mail footnote): an
 * alignment TeX stated is never dropped for a copy's, the full line its title fills read off A as justified.
 * A table cell's (its end mark `t<i>e`) is its own paragraph's where TeX set it one (a p, m or b column, X, a \parbox, tblr's
 * cells), else the class LaTeX built the cell's column template from (AXT-CELL <i> <class>, written at the template's end:
 * LaTeX's \@chnum, its reading of the column's letter after \newcolumntype and *{n}{…}, \multicolumn's own spec where the cell
 * is one): c centred, l flush left, r flush right (TeX's \hfil on the side or sides the slack goes); m, p and b none, their
 * lines a paragraph's. The cell's first (tabularx sets its table once for each trial width, the same). A cell no template of
 * LaTeX's set (a plain \halign) states nothing. A unit that is no cell's but its cell's one unit, set in its line (an author
 * block's name or place in the tabular \maketitle sets it in: its AXT-ALIGN `h`, an \hbox's, which tells nothing), states its
 * cell's class the same way (marks.mjs LAYOUT_TEX)
 */
export function readAlign(log: string): Map<number, 'j' | 'l' | 'c' | 'r'> {
  const last = new Map<number, 'j' | 'l' | 'c' | 'r' | null>()
  const told = new Map<number, 'j' | 'l' | 'c' | 'r'>()
  const text = log.replace(/^(AXT-ALIGN .{69})\n/gm, '$1')
  for (const m of text.matchAll(
    /^AXT-ALIGN [ht]?(\d{1,9}) ([phv]) ([0-4]) (-?[\d.]+)pt ([0-4]) (-?[\d.]+)pt ([0-4]) (-?[\d.]+)pt$/gm,
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
  // (a cell's class, where its own paragraph tells nothing)
  const classed = new Set<number>()
  for (const m of text.matchAll(/^AXT-CELL (\d{1,9}) ([0-5]) *$/gm)) {
    const id = Number(m[1])
    if (classed.has(id)) continue
    classed.add(id)
    const code = CELL_CLASS[Number(m[2])]
    if (code && !out.has(id)) out.set(id, code)
  }
  return new Map([...out].sort((a, b) => a[0] - b[0]))
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
 *  text block shipped whole), the column's and the text block's widths and its box's left edge on its page, in PDF units; and,
 *  where TeX states it, the depth of the text block's bottom under the page's top edge (\textheight's foot as \@outputpage
 *  ships it) */
export type TexBody = { side: 0 | 1 | 2; column: number; text: number; x: number; foot?: number }
/**
 * Each bracketed body's statement (marks.mjs LAYOUT_TEX's `AXT-BODY <n> <side> <\columnwidth> <\textwidth> <x> <depth>`,
 * written at the shipout beside the body's opening point `bs<n>`), by its serial: the first (a box shipped twice states it
 * twice, the same). A line not of the form is passed over: a compile made before the statement, or an engine with no saved
 * position (its x empty), states none; one made before the depth states no foot
 */
export function readBodies(log: string): Map<number, TexBody> {
  const out = new Map<number, TexBody>()
  for (const m of log.matchAll(
    /^AXT-BODY (\d{1,9}) ([012]) (\d+(?:\.\d+)?)pt (\d+(?:\.\d+)?)pt (-?\d{1,12})(?: (\d+(?:\.\d+)?)pt)? *$/gm,
  )) {
    const n = Number(m[1])
    if (out.has(n)) continue
    const [column, text, x] = [Number(m[3]) * BP_PER_PT, Number(m[4]) * BP_PER_PT, Number(m[5]) * BP_PER_SP]
    if (!(column > 0 && text > 0 && column <= text + 0.5 && Number.isFinite(x))) continue
    const foot = m[6] !== undefined ? Number(m[6]) * BP_PER_PT : undefined
    out.set(n, {
      side: Number(m[2]) as 0 | 1 | 2,
      column,
      text,
      x,
      ...(foot !== undefined && foot > 0 ? { foot } : {}),
    })
  }
  return out
}
/**
 * Each unit's \baselineskip and \parskip, natural, where its paragraph ends (LINES_TEX's `AXT-LINES <unit> <\prevgraf>
 * <\baselineskip> <size> <\parskip>`, the last TeX pass's), in PDF units, by unit index: TeX's normal paragraph separation
 * there, their sum, which the next ink under a borrowed line keeps (the owner's ruling of 2026-11-08). A unit TeX set no
 * paragraph for (a caption measured in a box alone, a heading, the front matter's) states none; nor does a compile made
 * before \parskip was stated
 */
export function readSkips(log: string): Map<number, [number, number]> {
  const out = new Map<number, [number, number]>()
  const glue =
    '(-?\\d+(?:\\.\\d+)?)pt(?: plus -?\\d+(?:\\.\\d+)?(?:pt|fil{1,3}))?(?: minus -?\\d+(?:\\.\\d+)?(?:pt|fil{1,3}))?'
  const re = new RegExp(`^AXT-LINES (\\d{1,9}) \\d+ ${glue} \\d+(?:\\.\\d+)? ${glue} *$`, 'gm')
  // (a statement longer than the log's 79 columns wrapped: joined)
  for (const m of log.replace(/^(AXT-LINES .{69})\n/gm, '$1').matchAll(re)) {
    const [bs, ps] = [Number(m[2]) * BP_PER_PT, Number(m[3]) * BP_PER_PT]
    if (Number.isFinite(bs) && Number.isFinite(ps) && bs > 0) out.set(Number(m[1]), [bs, ps])
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
export function framesOf(
  pages: readonly { points: readonly { name: string }[]; view?: readonly number[] }[],
  log: string,
): (TexFrame | null)[] {
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
    // (the text block's bottom on its page: the page's top edge less its stated depth, every column's)
    const top = pg.view?.[3]
    const foot = top !== undefined && body.foot !== undefined ? { foot: r2(top - body.foot) } : {}
    if (body.side === 0 && !two) return { block, columns: [block], ...foot }
    if (body.text - body.column < 1) return null
    return {
      block,
      columns: [
        [r2(x0), r2(x0 + body.column)],
        [r2(x0 + body.text - body.column), r2(x0 + body.text)],
      ],
      ...foot,
    }
  })
}

/** a reference's item type and the full name the paper gives it (readRefNames) */
export type RefName = { type: string; name?: string }
/** a name as a reference's full name: plain words (a letter first, then letters, marks, an apostrophe or a hyphen, words apart
 *  by one space), at most 40 characters, no full stop: a name that holds one is an abbreviation ("Fig.", cleveref's default),
 *  and one that holds a command or a brace is no plain name (`\scshape Table`) */
const FULL_NAME = /^\p{L}[\p{L}\p{M}'’-]*(?: [\p{L}\p{M}'’-]+)*$/u
/** a macro's meaning as TeX writes it (`\meaning`): its body after `macro:->`, a definition of no parameter alone */
const MEANING = /^(?:\\(?:long|protected|outer) )*macro:->(.*)$/
/** a babel name macro as the layout compile's own wrapper leaves it (marks.mjs NAMES_TEX: `\relax\axtnma{<key>}<its text>
 *  \axtnmb{<key>}`, \meaning's spacing): the text it wraps */
const NAME_WRAP = /^\\relax \\axtnma \{[a-z]{1,16}\}(.*)\\axtnmb \{[a-z]{1,16}\}$/
const UTF8 = new TextDecoder('utf-8')
/** a name TeX wrote, as text: its ^^ notation (a byte TeX would not print) read, and its bytes (the log is read byte for byte,
 *  one character a byte) read as UTF-8 where they are bytes */
function textOf(written: string): string {
  const s = written.replace(/\^\^([0-9a-f]{2})/g, (_, h: string) => String.fromCharCode(Number.parseInt(h, 16)))
  const codes = Array.from(s, (c) => c.charCodeAt(0))
  if (!codes.some((c) => c > 0x7f) || codes.some((c) => c > 0xff)) return s
  return UTF8.decode(Uint8Array.from(codes))
}
/**
 * Each reference's item type and the full name the paper gives it, by the reference's place in the list the marked compile was
 * given (marks.mjs refsTex: `AXT-REF <i> <type>`, then `AXT-REFNAME <i> <slot> <\meaning>` for each of cleveref's capitalised
 * and own names, hyperref's \<type>autorefname and LaTeX's \<type>name that is defined, in that order, written once the last
 * page is out). The type is the label's anchor's (hyperref's, and LaTeX's own since 2023: `figure.caption.12`'s `figure`, as
 * hyperref's own \autoref reads it), else cleveref's where it wrote one; the name the first of those that is a full name
 * (FULL_NAME), a babel name macro read through the layout compile's own wrapper (NAME_WRAP). A label TeX knew no type for
 * states nothing; a type none of whose names is a full one (RevTeX's `section*` anchors), no name
 */
export function readRefNames(log: string): Map<number, RefName> {
  const out = new Map<number, RefName>()
  // (a statement longer than the log's 79 columns wrapped: joined)
  const text = log.replace(/^(AXT-REFNAME .{67})\n/gm, '$1')
  for (const m of text.matchAll(/^AXT-REF (\d{1,6}) (\S{1,64}) *$/gm)) {
    const i = Number(m[1])
    if (!out.has(i)) out.set(i, { type: m[2] as string })
  }
  for (const m of text.matchAll(/^AXT-REFNAME (\d{1,6}) [Ccan] (.*)$/gm)) {
    const ref = out.get(Number(m[1]))
    if (!ref || ref.name !== undefined) continue
    const meaning = MEANING.exec((m[2] as string).trimEnd())?.[1]
    const body = meaning === undefined ? undefined : (NAME_WRAP.exec(meaning)?.[1] ?? meaning)
    const name = body === undefined ? '' : textOf(body).trim()
    if (name.length <= 40 && FULL_NAME.test(name)) ref.name = name
  }
  return new Map([...out].sort((a, b) => a[0] - b[0]))
}

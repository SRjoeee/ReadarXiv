// A piece first in the paragraph TeX resumes after a display (2601.06943v2 p5: a `\[ … \]`, then an `\autoref` on the next line).
// LAYOUT_TEX's \axtpma sets no point on the empty list TeX resumes the paragraph with after a display (marks.ts \axt@pmc: a mark
// there would keep the empty paragraph between two displays a line, and would end the \ignorespaces amsmath's \] began before a
// macro that sets nothing); a display has no closing mark (\axtpm sets none there either). So the reference after the display
// had no opening point, its closing point alone, and the display's opening point alone found as its next mark that closing point,
// no mark of its unit's next ones: the marking says an unmarked visible piece follows it (followsOf `blocked`), and the stream's
// reading owns it nothing ('open, an unmarked piece follows'). Both pieces' ink was then read as the unit's text, the locate
// counted more letters in it than its source writes (place.ts `text past its source`), and the whole paragraph stayed the
// original's, its row answered and never drawn. An inline formula there has had its opening mark set on that empty list since the
// LOST survey (\axtpmm: its math node follows the mark at once, so no line is made and no space is skipped); a piece of a class
// whose commands always set ink is the same case. The marked compile's stream as B ships it is written here (each glyph 5 pt wide
// at 10 pt), in content of our own.
import { describe, expect, it } from 'vitest'
import { type Glyph, packGlyphs } from '../src/ink.ts'
import { followsOf, layoutMarking, MARK_CLASSES } from '../src/marks/marks.ts'
import { OWNED, OWNED_HOW, ownedOf, STREAM_COLUMNS, type StreamPage } from '../src/own/stream.ts'
import type { SourceUnit } from '../src/source/latex-front.ts'

type Item = string | { at: string }
/** a page from items in stream order: a string is glyphs on the current line (a space 3 pt, `\n` the next line 12 pt down),
 *  `{ at }` a point */
function pageOf(items: readonly Item[]): StreamPage {
  const glyphs: Glyph[] = [],
    points: { name: string; glyph: number; box: number }[] = [],
    boxAt: number[] = []
  let x = 72,
    y = 700
  for (const it of items) {
    if (typeof it === 'string') {
      for (const u of it) {
        if (u === ' ') x += 3
        else if (u === '\n') {
          x = 72
          y -= 12
        } else {
          glyphs.push({
            u,
            x0: x,
            x1: x + 5,
            y,
            top: y + 7,
            bottom: y - 2,
            size: 10,
            font: 'F',
            ix0: x,
            ix1: x + 5,
          } as Glyph)
          boxAt.push(0)
          x += 5
        }
      }
    } else points.push({ name: it.at, glyph: glyphs.length, box: 0 })
  }
  return {
    glyphs: packGlyphs(glyphs, { columns: STREAM_COLUMNS }),
    boxes: [],
    points,
    boxAt: Int32Array.from(boxAt),
    view: [0, 0, 612, 792],
  } as StreamPage
}
const unit = (kind: string, pieces: SourceUnit<null>['pieces']): SourceUnit<null> => ({
  file: null,
  kind,
  start: 0,
  end: 0,
  pieces,
})
/** unit 1: text, a display, the line end after it, a reference first in the paragraph TeX resumes, the text after it */
const PARA = unit('para', [
  { t: 'text', s: 'We define ' },
  { t: 'ph', src: '\\[ a = b \\]' },
  { t: 'text', s: '\n' },
  { t: 'ph', src: '\\autoref{f}' },
  { t: 'text', s: '(b) shows it.' },
])
const UNITS = [unit('para', []), PARA]
/** the column's body as B ships the paragraph: its start, its first line, the display's opening point and its row, then the
 *  paragraph's next line, where the reference's ink "Figure 3" begins it; `open` the reference's opening point there */
const STREAM = (open: boolean): Item[] => [
  { at: 'bs1' },
  { at: '1s' },
  'We define',
  { at: 'p1.1a' },
  '\na = b\n',
  ...(open ? [{ at: 'p1.3a' }] : []),
  'Figure 3',
  { at: 'p1.3b' },
  '(b) shows it.',
  { at: '1e' },
  { at: 'be1' },
]
/** what each piece owns, as the marking and the stream read it: its glyphs, or its how, or null for no entry */
function owned(items: readonly Item[]): Record<string, string | null> {
  const page = pageOf(items)
  const follows = followsOf(UNITS as never, new Set(page.points.map((p) => p.name)))
  const out = ownedOf([page], { follows, erasure: true })
  const of = (name: string) => {
    const e = out.get(name)
    if (!e) return null
    return e.how < OWNED ? e.glyphs.map(([, g]) => page.glyphs.u[g]).join('') : (OWNED_HOW[e.how] as string)
  }
  return { display: of('p1.1a'), reference: of('p1.3a') }
}

describe('a piece first in the paragraph TeX resumes after a display: the reading of the stream', () => {
  it('with no opening point for the piece, the display owns nothing and the piece is no entry (the paragraph LOST)', () => {
    const page = pageOf(STREAM(false))
    expect(followsOf(UNITS as never, new Set(page.points.map((p) => p.name)))('p1.1a')).toMatchObject({
      display: true,
      want: '',
      ends: ['p1.3a', '1e', 't1e', 'h1e'],
      blocked: true,
      through: null,
    })
    expect(owned(STREAM(false))).toEqual({ display: 'open, an unmarked piece follows', reference: null })
  })

  it("with the piece's opening point set where TeX resumes the paragraph, the display owns its row and the piece its ink", () => {
    expect(owned(STREAM(true))).toEqual({ display: 'a=b', reference: 'Figure3' })
  })
})

describe('a piece first in the paragraph TeX resumes after a display: its opening mark', () => {
  const opening = (u: SourceUnit<null>, k: number) =>
    (
      layoutMarking([u] as unknown as SourceUnit[], MARK_CLASSES, { lines: false }).units[0]!.pieces as {
        t: string
        src?: string
      }[]
    )
      .map((p) => (p.t === 'ph' ? (p.src ?? '') : ''))
      .find((s) => new RegExp(`\\{[pn]0\\.${k}a\\}$`).test(s))
  const after = (src: string) =>
    unit('para', [
      { t: 'text', s: 'We define ' },
      { t: 'ph', src: '\\[ a = b \\]' },
      { t: 'text', s: '\n' },
      { t: 'ph', src },
      { t: 'text', s: ' shows it.' },
    ])
  const command = (src: string) => opening(after(src), 3)?.replace(/\{.*$/, '')

  it('a piece sure to set something there: the opening mark TeX sets on that empty list (\\axtpmm, as an inline formula)', () => {
    // (a citation's label, a reference that prints a name or a page, an equation's reference, a footnote's call: marks.ts
    // OPENS_ON_EMPTY, each form's native case in lab/pdf/spikes/layout-marks-cases.mjs)
    const sure = ['\\autoref{f}', '\\cref{f}', '\\Cref{f}', '\\pageref{f}', '\\eqref{e}', '\\cite{k}', '\\citep{k}']
    sure.push('\\citet{k}', '\\parencite{k}', '\\footnotemark')
    expect(sure.map((src) => [src, command(src)])).toEqual(sure.map((src) => [src, '\\axtpmm']))
  })

  it("a display after a display, a paper's macro and the forms that may set nothing keep \\axtpma's gobble", () => {
    // (two displays in a row: a mark between them would keep the empty paragraph TeX drops a line; a paper's macro may set
    // nothing, `\\delete{…}`, and a mark would end the \\ignorespaces amsmath's \\] began before the line end after it; \\ref,
    // \\nameref and \\autoref* print the label's stored text alone, none where TeX stored none; \\citeauthor one field of an
    // entry; code and a URL an argument a paper's own command may set nothing for)
    const gobble = ['\\[ c = d \\]', '\\delete{x}', '\\ref{f}', '\\nameref{f}', '\\autoref*{f}', '\\citeauthor{k}']
    gobble.push('\\texttt{x}', '\\url{https://example.org}')
    expect(gobble.map((src) => [src, command(src)])).toEqual(gobble.map((src) => [src, '\\axtpma']))
  })

  it('a reference after text keeps \\axtpma, and an inline formula after a display keeps \\axtpmm', () => {
    const u = unit('para', [
      { t: 'text', s: 'see ' },
      { t: 'ph', src: '\\autoref{f}' },
      { t: 'text', s: ' and ' },
      { t: 'ph', src: '\\[ a = b \\]' },
      { t: 'text', s: '\n' },
      { t: 'ph', src: '$x$' },
      { t: 'text', s: ' holds.' },
    ])
    expect([opening(u, 1), opening(u, 5)]).toEqual(['\\axtpma{p0.1a}', '\\axtpmm{p0.5a}'])
  })
})

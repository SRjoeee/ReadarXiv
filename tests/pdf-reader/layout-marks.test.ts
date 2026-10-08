import { createHash } from 'node:crypto'
import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SourceUnit } from '@/pdf-reader/engine/source/latex-front.mjs'
import type { UnitLines } from '@/pdf-reader/engine/pipeline/tex-errors.mjs'
import { patch } from '@/pdf-reader/engine/source/latex-front.mjs'
import { LayoutRefusal } from '@/pdf-reader/engine/layout/json.mjs'
import type { LayoutMarks } from '@/pdf-reader/engine/layout/marks.mjs'
import { classOf, DISPLAY, encodeLayoutMarks, INVISIBLE, LAYOUT_CLASSES, LAYOUT_TEX, layoutMarking, layoutMarksOf, MARK_CLASSES, MARK_NAME, MARKS_CAP, MARKS_VALUES, OWNED_ALL, parseLayoutMarks, POINTS_TEX, askedCommands, FOLLOWERS, GLYPHS_PIECE, inkSamples, inkSection, markProbeTex, PROBE_SCHEMA, readInkProbe, readInkTexts, headEnd, symbolText, TEXT_SYMBOLS, probeRow, probeSamples, probeTex, readMarkProbe, readProbe, switchedOf } from '@/pdf-reader/engine/layout/marks.mjs'
import { openPaper, originalFiles, probeFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { OWNED, OWNED_HOW } from '@/pdf-reader/engine/layout/stream.mjs'
import { marksOf } from '@/pdf-reader/engine/pipeline/typeset/places.mjs'

// The layout marks as text: which placeholder gets which mark, the units' own marks, the TeX that goes with them, the
// marks file and its bounds. What the TeX does under TeX — that no line moves, that nothing written to a file changes —
// is checked natively by lab/pdf/spikes/layout-marks-cases.mjs

type Piece = { t: string; s?: string; src?: string; id?: number; unit?: unknown; pre?: string; post?: string }
const text = (s: string): Piece => ({ t: 'text', s })
const ph = (src: string): Piece => ({ t: 'ph', src })
const unit = (kind: string, pieces: Piece[], more: Partial<SourceUnit> = {}): SourceUnit => ({ kind, file: 'main.tex', start: 0, end: 0, pieces, ...more }) as SourceUnit
/** the i-th of a list, which the test knows is there */
const nth = <T>(xs: readonly T[], i: number): T => { const x = xs[i]; if (x === undefined) throw new Error(`no item ${i}`); return x }
const srcs = (u: SourceUnit | undefined) => ((u?.pieces ?? []) as Piece[]).map(p => (p.t === 'text' ? p.t : p.t === 'ph' ? `ph ${p.src}` : p.t))

afterEach(() => { vi.restoreAllMocks() })

describe('the classes', () => {
  it('subequations is a display, as every display environment of the corpus', () => {
    for (const env of ['subequations', 'equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'multline', 'multline*', 'flalign', 'alignat', 'eqnarray', 'eqnarray*', 'displaymath', 'dmath', 'IEEEeqnarray'])
      expect(classOf({ t: 'ph', src: `\\begin{${env}}a\\end{${env}}` })).toBe('display')
  })
  it('classOf: each class by its source', () => {
    const cases: [string, string | null][] = [
      ['$x$', 'math'], ['\\(x\\)', 'math'], ['\\ensuremath{x}', 'math'],
      ['\\[x\\]', 'display'], ['$$x$$', 'display'], ['\\begin{equation}x\\end{equation}', 'display'], ['\\begin {align*}a&b\\end{align*}', 'display'],
      ['\\begin{gather}x\\end{gather}', 'display'], ['\\begin{IEEEeqnarray}{c}x\\end{IEEEeqnarray}', 'display'],
      ['\\cite{a}', 'cite'], ['\\citep[p.~3]{a}', 'cite'], ['\\citet{a}', 'cite'], ['\\citeauthor{a}', 'cite'], ['\\Cite{a}', 'cite'], ['\\Citet{a}', 'cite'],
      ['\\parencite{a}', 'cite'], ['\\textcite{a}', 'cite'], ['\\autocite{a}', 'cite'],
      ['\\ref{a}', 'ref'], ['\\autoref{a}', 'ref'], ['\\cref{a}', 'ref'], ['\\Cref{a}', 'ref'], ['\\pageref{a}', 'ref'], ['\\nameref{a}', 'ref'],
      ['\\eqref{a}', 'eqref'],
      ['\\texttt{x}', 'code'], ['\\verb|x|', 'code'], ['\\verb*+x+', 'code'], ['\\lstinline|x|', 'code'],
      ['\\url{https://x.org}', 'url'], ['\\href{https://x.org}{x}', 'url'],
      ['\\footnotemark', 'footnote'], ['\\footnotemark[2]', 'footnote'],
      ['\\bert', 'macro'], ['\\bert{}', 'macro'], ['\\includegraphics[width=1em]{x}', 'macro'], ['\\refstepcounter{x}', 'macro'], ['\\citex@y', 'macro'],
      // the role table's (arg-roles.mjs textless): commands that set no letters, so no ink — a table's rule is the page's
      // own drawing, a strut nothing (1706.03762's Table 2: nine cells refused as LOST); one that prints its argument stays
      ['\\specialrule{1pt}{-1pt}{0pt}', null], ['\\addlinespace[2pt]', null], ['\\setlength{\\tabcolsep}{3pt}', null], ['\\fontsize{7.6pt}{1em}', null], ['\\cmidrule(lr){2-5}', null],
      ['\\centerline{x}', 'macro'], ['\\noalign{\\hbox{Group A}}', 'macro'], ['\\romannumeral 3', 'macro'],
      // but \\rule, which a box holds: TeX is asked (the ink section), a strut sets no ink and a bar in a line does
      ['\\rule{1em}{1pt}', 'macro'], ['\\rule{0pt}{2.2ex}', 'macro'],
    ]
    for (const [src, cls] of cases) expect(classOf({ t: 'ph', src }), src).toBe(cls)
    expect(classOf({ t: 'nested', unit: unit('footnote', []) } as Piece & { t: string })).toBe('footnote')
    for (const src of ['~', '\\,', '\\ ', '\\\n', '\\\t', '\\quad', '\\hspace{1em}', '\\hspace*{1em}', '\\label{x}', '\\index{x}', '\\bfseries', '\\color{red}', '\\\\', '\\\\[2pt]', '\\newline', '\\nobreak', '\\-', '\\/', '\\xspace', '\\small', '\\footnotesize']) {
      expect(classOf({ t: 'ph', src }), src).toBeNull()
      expect(INVISIBLE.test(src), src).toBe(true)
    }
    for (const p of [text('word'), { t: 'open', id: 1, src: '{' }, { t: 'close', id: 1, src: '}' }]) expect(classOf(p)).toBeNull()
    // a character the scanner keeps as structure, no ink of its own: an alignment's tab in a table it did not read as
    // one (aastex's deluxetable), a stray brace, a parameter, a script mark outside math
    for (const src of ['&', '#', '^', '_', '{', '}']) expect(classOf({ t: 'ph', src }), src).toBeNull()
    // an address kept as it is, ink of its own
    expect(classOf({ t: 'ph', src: 'jatin@us.ibm.com' })).toBe('macro')
    // a control word of the list followed by letters is another command
    expect(INVISIBLE.test('\\labelwidth')).toBe(false)
    expect(DISPLAY.test('\\begin{equationx}')).toBe(false)
    expect(MARK_CLASSES).toEqual(['math', 'display', 'cite', 'ref', 'eqref', 'code', 'url', 'footnote', 'macro'])
    expect(LAYOUT_CLASSES).toEqual(MARK_CLASSES)
  })
})

describe('layoutMarking', () => {
  const PARA = [text('A '), ph('$x$'), text(' and '), ph('\\bert'), text(' B '), ph('~'), ph('\\cite{c}'), text('.')]
  it('layoutMarking: two marks around a placeholder, one before a macro, none for the invisible', () => {
    const units = [unit('para', PARA.map(p => ({ ...p })))]
    const before = structuredClone(units)
    const { units: marked } = layoutMarking(units, MARK_CLASSES, { lines: false })
    expect(srcs(marked[0])).toEqual(['text', 'ph \\axtpma{p0.1a}', 'ph $x$', 'ph \\axtpm{p0.1b}', 'text', 'ph \\axtpma{p0.3a}', 'ph \\bert', 'text', 'ph ~', 'ph \\axtpma{p0.6a}', 'ph \\cite{c}', 'ph \\axtpm{p0.6b}', 'text'])
    expect(units).toEqual(before)
    expect(marked[0]).not.toBe(units[0])
  })
  it('a class switched off is not marked', () => {
    const units = [unit('para', PARA)]
    const noCite = layoutMarking(units, MARK_CLASSES.filter(c => c !== 'cite'), { lines: false }).units[0]
    expect(srcs(noCite).some(s => s.includes('p0.6'))).toBe(false)
    expect(srcs(noCite)).toContain('ph \\axtpma{p0.1a}')
    const noMacro = layoutMarking(units, MARK_CLASSES.filter(c => c !== 'macro'), { lines: false }).units[0]
    expect(srcs(noMacro)).not.toContain('ph \\axtpma{p0.3a}')
    expect(srcs(noMacro)).toContain('ph \\axtpma{p0.6a}')
    expect(srcs(layoutMarking(units, [], { lines: false }).units[0])).toEqual(srcs(units[0]))
  })
  it('a footnote call is marked n, and its own unit keeps MARK_DEF\'s marks', () => {
    const note = unit('footnote', [text('The note with '), ph('$y$'), text('.')], { nested: true } as Partial<SourceUnit>)
    const para = unit('para', [text('Text'), { t: 'nested', pre: '\\footnote{', unit: note, post: '}' }, text(' and '), ph('\\footnotemark'), text(' more.')])
    const units = [note, para]
    const { units: marked, mark } = layoutMarking(units, MARK_CLASSES, { lines: true })
    // the opening mark only: fnpct's \\footnote, and a note's \\@ifnextchar, look at what follows the call
    expect(srcs(marked[1])).toEqual(['text', 'ph \\axtpma{n1.1a}', 'nested', 'text', 'ph \\axtpma{n1.3a}', 'ph \\footnotemark', 'text'])
    // the call points at the note's own copy, marked as a unit of its own
    const call = nth(nth(marked, 1).pieces as Piece[], 2)
    expect(call.unit).toBe(marked[0])
    expect(srcs(marked[0])).toEqual(['text', 'ph \\axtpma{p0.1a}', 'ph $y$', 'ph \\axtpm{p0.1b}', 'text'])
    expect(mark(note)).toEqual({ start: '\\leavevmode\\axtmark{0s}', end: '\\axtend{0e}', before: '\\axtlines{0}' })
    expect(mark(nth(marked, 0))).toEqual(mark(note))
    expect(nth(para.pieces as Piece[], 1).unit).toBe(note)
  })
  it('cells and headings get their own unit marks', () => {
    const units = [
      unit('cell', [text('Cell')]), unit('heading', [text('Method')]), unit('heading', [text('Front')], { front: true } as Partial<SourceUnit>),
      unit('figure', [text('Axis')]), unit('para', [text('Prose.')]), unit('heading', [text('A title')], { title: true } as Partial<SourceUnit>),
    ]
    for (const lines of [false, true]) {
      const { units: marked, mark } = layoutMarking(units, MARK_CLASSES, { lines })
      expect(mark(nth(units, 0))).toEqual({ start: '\\leavevmode\\axtmark{t0s}', end: '\\axtend{t0e}' })
      expect(mark(nth(units, 1))).toEqual({ start: '\\axthmark{h1s}', end: '\\axthmark{h1e}' })
      expect(mark(nth(units, 2))).toBeNull()
      expect(mark(nth(units, 3))).toBeNull()
      expect(mark(nth(units, 4))).toEqual({ start: '\\leavevmode\\axtmark{4s}', end: '\\axtend{4e}', ...(lines ? { before: '\\axtlines{4}' } : {}) })
      expect(mark(nth(units, 5))).toEqual({ start: '\\axthmark{h5s}', end: '\\axthmark{h5e}' })
      units.forEach((u, i) => { expect(mark(nth(marked, i))).toEqual(mark(u)) })
    }
  })
  it('marks no placeholder a unit passes over before its start mark, and none in a unit with no mark', () => {
    // patch passes over the commands at a unit's head; an opening mark there would start a table's row before \\cline
    // or a paper's \\multicolumn (TeX: "Misplaced \\noalign", "Misplaced \\omit"). An inline formula or citation that
    // opens the unit has the start mark before it, and its opening mark waits for that one, next to it
    const units = [
      unit('cell', [ph('\\cline{1-2}'), text('\nFirst '), ph('$x$')]),
      unit('cell', [ph('\\mc{2}{x}'), text(' cell')]),
      unit('para', [ph('\\noindent'), ph('\\para{Head}'), text(' Then '), ph('\\cite{a}')]),
      unit('para', [ph('$x$'), text(' is a variable.')]),
      unit('para', [ph('\\bert'), text('\'s model.')]),
      unit('figure', [text('Axis '), ph('$t$')]),
      unit('para', [{ t: 'nested', pre: '\\footnote{', unit: unit('footnote', [text('n')]), post: '}' }, text(' after '), ph('$z$')]),
    ]
    const { units: marked, mark } = layoutMarking(units, MARK_CLASSES, { lines: false })
    expect(srcs(marked[0])).toEqual(['ph \\cline{1-2}', 'text', 'ph \\axtpma{p0.2a}', 'ph $x$', 'ph \\axtpm{p0.2b}'])
    expect(srcs(marked[1])).toEqual(['ph \\mc{2}{x}', 'text'])
    expect(srcs(marked[2])).toEqual(['ph \\noindent', 'ph \\para{Head}', 'text', 'ph \\axtpma{p2.3a}', 'ph \\cite{a}', 'ph \\axtpm{p2.3b}'])
    expect(srcs(marked[3])).toEqual(['ph \\axtpma{p3.0a}', 'ph $x$', 'ph \\axtpm{p3.0b}', 'text'])
    expect(srcs(marked[4])).toEqual(['ph \\axtpma{p4.0a}', 'ph \\bert', 'text'])
    expect(srcs(marked[5])).toEqual(srcs(units[5]))
    expect(srcs(marked[6])).toEqual(['nested', 'text', 'ph \\axtpma{p6.2a}', 'ph $z$', 'ph \\axtpm{p6.2b}'])
    // as patch writes them: each opening mark at or after its unit's start mark, or right before it
    const project = { main: 'main.tex', units: marked, files: new Map([['main.tex', '']]) }
    for (const [i, u] of marked.entries()) {
      const out = new TextDecoder().decode(patch({ ...project, units: [u], files: new Map([['main.tex', 'x'.repeat(10)]]) } as never, new Map(), { mark: v => mark(v) }).get('main.tex'))
      const start = mark(nth(units, i))?.start
      if (!start) continue
      const at = out.indexOf(start)
      const opening = [...out.matchAll(/\\axtpma\{[^}]*\}/g)]
      for (const o of opening) expect(o.index >= at || o.index + o[0].length === at, `${i}: ${out}`).toBe(true)
    }
  })
  it('marks nothing a prefix command applies to: \\protect\\eqref keeps its \\protect', () => {
    // a mark between them would take the \\protect, and be written as itself to a file (2608.23586's list of figures)
    const { units: marked } = layoutMarking([unit('para', [text('A (Eq.~'), ph('\\protect'), ph('\\eqref{e}'), text(') and '), ph('\\noexpand'), text(' '), ph('$x$'), text(' then '), ph('$y$')])], MARK_CLASSES, { lines: false })
    // (\\noexpand itself is a paper's macro to the classes, marked before it as any)
    expect(srcs(marked[0])).toEqual(['text', 'ph \\protect', 'ph \\eqref{e}', 'text', 'ph \\axtpma{p0.4a}', 'ph \\noexpand', 'text', 'ph $x$', 'text', 'ph \\axtpma{p0.8a}', 'ph $y$', 'ph \\axtpm{p0.8b}'])
  })
  it('marks no macro inside a word', () => {
    // a letter command or an accent glued to the word's letters (Giessenbachstra\\ss e, 2608.15334): a mark there would
    // part the word, its hyphenation and its kerns; a citation, a formula, a reference begin with no letter of the word
    const { units: marked } = layoutMarking([unit('para', [text('In Giessenbachstra'), ph('\\ss'), text(' e, the '), ph('\\foo{x}'), text('ing and'), ph('\\cite{a}'), text(' then '), ph('\\foo{y}'), text(' end')])], MARK_CLASSES, { lines: false })
    expect(srcs(marked[0])).toEqual(['text', 'ph \\ss', 'text', 'ph \\axtpma{p0.3a}', 'ph \\foo{x}', 'text', 'ph \\axtpma{p0.5a}', 'ph \\cite{a}', 'ph \\axtpm{p0.5b}', 'text', 'ph \\axtpma{p0.7a}', 'ph \\foo{y}', 'text'])
  })
  it('a paper\'s macro and a footnote\'s call get the opening mark only, and the piece right after them none', () => {
    // a macro looks past its argument (\\xspace, \\@ifnextchar[, \\@esphack's \\ignorespaces after \\todo, \\nocite,
    // \\marginpar), and fnpct's \\footnote for the punctuation after it: a mark there, or the next piece's opening mark, is
    // what it would see. A source that ends in a control symbol gets the opening mark only too; LaTeX's \\) reads nothing
    const note = { t: 'nested' as const, pre: '\\footnote{', unit: unit('footnote', [text('x')]), post: '}' }
    const { units: marked } = layoutMarking([unit('para', [text('A '), ph('\\code{X}'), text(' is '), ph('\\code{a}'), note, text(' and '), ph('\\opt{b}'), text(' '), ph('$x$'), text(' then '), note, ph('\\cite{c}'), text(', '), ph('$y$\\%'), text(' or '), ph('\\(z\\)'), text('.')])], MARK_CLASSES, { lines: false })
    expect(srcs(marked[0])).toEqual(['text', 'ph \\axtpma{p0.1a}', 'ph \\code{X}', 'text', 'ph \\axtpma{p0.3a}', 'ph \\code{a}', 'nested', 'text', 'ph \\axtpma{p0.6a}', 'ph \\opt{b}', 'text', 'ph $x$', 'text', 'ph \\axtpma{n0.10a}', 'nested', 'ph \\cite{c}', 'text', 'ph \\axtpma{p0.13a}', 'ph $y$\\%', 'text', 'ph \\axtpma{p0.15a}', 'ph \\(z\\)', 'ph \\axtpm{p0.15b}', 'text'])
  })
  it('after a forced break, which may begin a table\'s row, passes over the commands before the next word', () => {
    // aastex's deluxetable: rows the scanner does not read as cells, \\ between them, \enddata after the last
    const rows = unit('para', [text('Polarization '), ph('&'), text(' Right '), ph('\\\\'), text('\n'), ph('$\\theta$'), text(' (peak) '), ph('&'), text(' x '), ph('\\\\'), text('\n'), ph('\\cline{1-2}'), text(' Wave '), ph('\\cite{a}'), ph('\\\\'), text('\n'), ph('\\enddata')])
    const { units: marked } = layoutMarking([rows], MARK_CLASSES, { lines: false })
    expect(srcs(marked[0])).toEqual(['text', 'ph &', 'text', 'ph \\\\', 'text', 'ph \\axtpma{p0.5a}', 'ph $\\theta$', 'ph \\axtpm{p0.5b}', 'text', 'ph &', 'text', 'ph \\\\', 'text', 'ph \\cline{1-2}', 'text', 'ph \\axtpma{p0.13a}', 'ph \\cite{a}', 'ph \\axtpm{p0.13b}', 'ph \\\\', 'text', 'ph \\enddata'])
  })
  it('after a cell\'s tab the same: tabularray\'s \\SetCell must open its cell', () => {
    // a tblr table read as one paragraph (2608.03994): \\SetCell[c=4]{c} after an opening mark spanned no columns
    const row = unit('para', [ph('\\textbf{Model}'), ph('&'), text(' '), ph('\\SetCell[c=4]{c}'), text(' Slopes '), ph('&'), text(' '), ph('$x$'), ph('\\\\')])
    const { units: marked } = layoutMarking([row], MARK_CLASSES, { lines: false })
    expect(srcs(marked[0])).toEqual(['ph \\textbf{Model}', 'ph &', 'text', 'ph \\SetCell[c=4]{c}', 'text', 'ph &', 'text', 'ph \\axtpma{p0.7a}', 'ph $x$', 'ph \\axtpm{p0.7b}', 'ph \\\\'])
  })
  it('the closing mark is left out after a control word, whose spaces TeX skips', () => {
    const { units: marked } = layoutMarking([unit('para', [text('A '), ph('\\footnotemark'), text(' and '), ph('\\bert{}'), text(' B '), ph('\\foo{x}\\bar'), text(' C')])], MARK_CLASSES, { lines: false })
    expect(srcs(marked[0])).toEqual(['text', 'ph \\axtpma{n0.1a}', 'ph \\footnotemark', 'text', 'ph \\axtpma{p0.3a}', 'ph \\bert{}', 'text', 'ph \\axtpma{p0.5a}', 'ph \\foo{x}\\bar', 'text'])
    // nor after an environment, whose \\end skips the spaces after it, a mark the first thing it would not skip
    const env = layoutMarking([unit('para', [text('A '), ph('\\begin{subequations}x\\label{y}\\end{subequations}'), text(' B '), ph('\\begin{equation}a\\end {equation}'), text(' C')])], MARK_CLASSES, { lines: false }).units[0]
    expect(srcs(env)).toEqual(['text', 'ph \\axtpma{p0.1a}', 'ph \\begin{subequations}x\\label{y}\\end{subequations}', 'text', 'ph \\axtpma{p0.3a}', 'ph \\begin{equation}a\\end {equation}', 'text'])
    // nor after a number or a dimension, which takes the space after it as its end (2608.30640's \\looseness=-1: a
    // register's assignment, which the role table proves sets no letters, so no mark at all; a paper's own one keeps
    // its opening mark)
    const num = layoutMarking([unit('para', [text('A.\n'), ph('\\looseness=-1'), text(' While '), ph('\\myskip=3pt plus 1pt'), text(' B '), ph('\\ref{x2}'), text(' C')])], MARK_CLASSES, { lines: false }).units[0]
    expect(srcs(num)).toEqual(['text', 'ph \\looseness=-1', 'text', 'ph \\axtpma{p0.3a}', 'ph \\myskip=3pt plus 1pt', 'text', 'ph \\axtpma{p0.5a}', 'ph \\ref{x2}', 'ph \\axtpm{p0.5b}', 'text'])
    // nor after one that ends a line: the mark would stand on the next, and a blank line after it would end no paragraph
    const atEnd = layoutMarking([unit('para', [text('A '), ph('\\cite{x}\n'), text('\n'), ph('$y$')])], MARK_CLASSES, { lines: false }).units[0]
    expect(srcs(atEnd)).toEqual(['text', 'ph \\axtpma{p0.1a}', 'ph \\cite{x}\n', 'text', 'ph \\axtpma{p0.3a}', 'ph $y$', 'ph \\axtpm{p0.3b}'])
  })
})

// three sources: typeset-tex.test.ts's, one with a table and a footnote, one with a heading and displays
const SOURCES = {
  plain: '\\documentclass{article}\\begin{document}\n\\section{Method}\nThe first paragraph of prose.\n\nThe second paragraph of prose.\n\\begin{figure}\\caption{A caption.}\\end{figure}\n\\end{document}\n',
  table: '\\documentclass{article}\n\\begin{document}\nA paragraph with a note\\footnote{The note\'s own text, with $y$.} and a citation \\cite{k} and Fig.~\\ref{t}.\n\n\\begin{table}\\centering\n\\begin{tabular}{lc}\n\\hline\nName & Value $x$ \\\\\n\\cline{1-2}\nFirst cell & \\texttt{code} \\\\\n\\end{tabular}\n\\caption{The table\'s caption.}\\label{t}\n\\end{table}\n\\end{document}\n',
  display: '\\documentclass{article}\n\\newcommand\\bert{BERT}\n\\begin{document}\n\\section{The $x$ model}\nWe set \\bert{} as\n\\[ a = b \\]\nfor every $n$, see \\eqref{e} and \\url{https://x.org}.\n\\begin{equation}\\label{e} c = d \\end{equation}\n\\end{document}\n',
}
/** originalFiles' main.tex at 3cb5a733 (the pin), SHA-256, recorded before the layout option was added */
const PIN: Record<string, { plain: string; lines: string }> = {
  plain: { plain: '0b6fe69122e06d17b3d9716a34dbaa1d87ac0596b0b70fee4dfbed6f5f696a2e', lines: 'aee572dd44df82135abf35dc3ca68ec21e03054cafbcd779481f3c7e0ca7a63a' },
  table: { plain: '3d2f67c0fe4d6b2bd8adcea768bbb2b018b02d5b9650c73427612dc86ee2bdfe', lines: 'e452222e5da1e031c444ea7e740776946437ce3dc96657864cf9095d1a6ecc44' },
  display: { plain: 'f521d7df749a560de860e34b2df4b428e48cb91d6e9e0e9d09ba9d25a2c1390d', lines: '1087c8399dd09aa4db2eb65c622b2c067e4e26803f52ebdf83a7393eef14e7df' },
}
const paperOf = (src: string) => openPaper(new Map([['main.tex', new TextEncoder().encode(src)]]))
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const decode = (files: Map<string, Uint8Array>) => new TextDecoder().decode(files.get('main.tex'))

describe('originalFiles with the layout marks', () => {
  it('originalFiles without layout is the pin\'s bytes', () => {
    for (const [name, src] of Object.entries(SOURCES)) {
      for (const lines of [false, true]) {
        for (const options of [{ lines }, { lines, layout: null }, { lines, spans: {} }]) {
          const files = originalFiles(paperOf(src), options)
          expect([...files.keys()]).toEqual(['main.tex'])
          expect(sha(files.get('main.tex') as Uint8Array), `${name} ${JSON.stringify(options)}`).toBe(PIN[name]?.[lines ? 'lines' : 'plain'])
        }
      }
    }
  })
  it('the layout marks taken out again give originalFiles\' bytes', () => {
    for (const [name, src] of Object.entries(SOURCES)) {
      for (const lines of [false, true]) {
        const marked = decode(originalFiles(paperOf(src), { lines, layout: MARK_CLASSES }))
        expect(marked.indexOf(LAYOUT_TEX), name).toBeGreaterThan(0)
        const out = marked.replace(LAYOUT_TEX, '').replace(/\\axtpma\{[^}]*\}|\\axtpm\{[^}]*\}|\\axthmark\{[^}]*\}|\\leavevmode\\axtmark\{t\d+s\}|\\axtend\{t\d+e\}/g, '')
        expect(out, name).toBe(decode(originalFiles(paperOf(src), { lines })))
      }
    }
    // not vacuously: the sources hold every kind of mark
    const all = Object.values(SOURCES).map(src => decode(originalFiles(paperOf(src), { lines: true, layout: MARK_CLASSES }))).join('\n')
    for (const m of ['\\axtpma{p', '\\axtpm{p', '\\axtpma{n', '\\axthmark{h', '\\leavevmode\\axtmark{t', '\\axtend{t']) expect(all).toContain(m)
    expect(all).not.toContain('\\axtpm{n')
  })
  it('puts LAYOUT_TEX after MARK_DEF, on the line the TeX after it begins: the paper\'s lines keep their numbers', () => {
    const p = paperOf(SOURCES.table)
    const v0 = decode(originalFiles(p, { lines: true })), v1 = decode(originalFiles(p, { lines: true, layout: MARK_CLASSES }))
    expect(v1.split('\n').length).toBe(v0.split('\n').length)
    expect(v1.indexOf(LAYOUT_TEX)).toBeGreaterThan(v1.indexOf('\\protected\\def\\axtmark#1{\\axt@colseen\\axt@dest{#1}}'))
    expect(v1.indexOf(LAYOUT_TEX)).toBeLessThan(v1.indexOf('\\documentclass'))
    // the table's \\cline keeps nothing before it; the cells after it are marked as cells
    expect(v1).toContain('\\cline{1-2}\n\\leavevmode\\axtmark{t')
    expect(v1).toContain('\\axtpma{n1.1a}\\footnote{')
    expect(v1).toContain('\\axtpma{p1.3a}\\cite{k}\\axtpm{p1.3b}')
    // spans are the paper's own units
    const spans: { lines?: () => UnitLines<SourceUnit>[] } = {}
    originalFiles(p, { lines: true, layout: MARK_CLASSES, spans })
    const found = spans.lines?.() ?? []
    expect(found.length).toBeGreaterThan(0)
    for (const s of found) expect(p.units).toContain(s.unit)
  })
  it('a class list empty gives the cells\' and headings\' marks and the TeX, and no placeholder\'s', () => {
    const v1 = decode(originalFiles(paperOf(SOURCES.display), { lines: false, layout: [] }))
    expect(v1).toContain(LAYOUT_TEX)
    const body = v1.slice(v1.indexOf('\\begin{document}'))
    expect(body).toContain('\\axthmark{h')
    expect(body).not.toContain('\\axtpma{')
  })
})

describe('the paper\'s own switch: TeX asked what a mark does before what follows', () => {
  const paperIn = (body: string, pre = '') => openPaper(new Map([['main.tex', new TextEncoder().encode(`\\documentclass{article}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`)]]))
  it('probeSamples: each command of a citation, a reference or a footnote\'s call once, a call with a note of its own words; none TeX could not set in a box', () => {
    const p = paperIn('A claim \\cite{a,b}. More \\cite{c} and \\citep[p.~3]{d}, see \\ref{x} and \\url{http://x.org/\\%7e}, \\url{http://y.org}. Note\\footnote[2]{The note.} and $x$ and \\bert{} here.')
    expect(probeSamples(p.units)).toEqual([
      { command: '\\cite', src: '\\cite{a,b}', call: false }, { command: '\\citep', src: '\\citep[p.~3]{d}', call: false }, { command: '\\ref', src: '\\ref{x}', call: false },
      { command: '\\url', src: '\\url{http://y.org}', call: false }, { command: '\\footnote', src: '\\footnote[2]{A note.}', call: true },
    ])
  })
  it('markProbeTex: for each sample and follower the four boxes after a word, ended at a space; a call before a second one; one line a sample, its count of errors started again', () => {
    const tex = markProbeTex([{ src: '\\cite{a}', call: false }, { src: '\\footnote{A note.}', call: true }])
    expect(tex.match(/\\typeout\{LAYOUT-PROBE 1 punct \d+ \\axt@qo\}/g)).toEqual(['\\typeout{LAYOUT-PROBE 1 punct 0 \\axt@qo}', '\\typeout{LAYOUT-PROBE 1 punct 1 \\axt@qo}'])
    // one document of sections, each a group of its own
    expect(tex.startsWith('\\makeatletter\\begingroup')).toBe(true)
    expect(probeTex(['A', 'B'])).toBe('\\makeatletterA\nB\\makeatother\n')
    for (const f of ['.', ',', ';', ':', '!', '?']) {
      expect(tex).toContain(`\\hbox{way \\cite{a}${f} \\unskip`)
      expect(tex).toContain(`\\hbox{way \\cite{a}{}${f} \\unskip`)
      expect(tex).toContain(`\\hbox{way \\axtpma{q0a}\\cite{a}\\axtpm{q0b}${f} \\unskip`)
      expect(tex).toContain(`\\hbox{way \\axtpma{q0a}\\cite{a}${f} \\unskip`)
    }
    expect(tex).toContain('\\hbox{way \\cite{a} x \\unskip')
    expect(tex).toContain('\\hbox{way \\footnote{A note.}\\axtpma{q1c}\\footnote{A note.} \\unskip')
    expect(tex.match(/\\noindent\\par/g)).toHaveLength(2)
    // every box set into a register voided first, from the same state (the footnote counter as it was, biblatex's
    // trackers reset), saying at its last statement whether it closed where it was meant to
    const boxes = (tex.match(/\\hbox\{way /g) ?? []).length
    expect(boxes).toBe(2 * 7 * 4 + 2)
    expect((tex.match(/\\global\\setbox\\axt@qbox\\box\\voidb@x\\gdef\\axt@qn\{\}\\axt@qreset\\setbox\\axt@qbox\\hbox\{way /g) ?? []).length).toBe(boxes)
    expect((tex.match(/\\xdef\\axt@qn\{\\the\\lastnodetype\\ifinner\\ifhmode\/in\\fi\\fi\}/g) ?? []).length).toBe(boxes)
    // a row before each box, for the errors TeX logs in it
    expect(tex.match(/\\typeout\{LAYOUT-PROBE 1 punct-at \d+ \d+ [a-e]\}/g)).toHaveLength(boxes)
    expect(tex).toContain('\\global\\c@footnote=\\axt@qfn')
    expect(tex).toContain('\\ifdefined\\citereset\\citereset\\fi')
    // it writes nothing to a file and no line the run takes for a reading
    expect(tex).not.toMatch(/\\write|\\immediate|AXT-/)
    expect(FOLLOWERS).toEqual(['.', ',', ';', ':', '!', '?', 'word', 'call'])
  })
  it('readProbe: the rows of every section, tagged, with their schema; readMarkProbe takes its own and no other', () => {
    expect(probeRow('punct', 3, '\\axt@qo')).toBe(`\\typeout{LAYOUT-PROBE ${PROBE_SCHEMA} punct 3 \\axt@qo}`)
    const log = 'LAYOUT-PROBE 1 punct 0 00000000\nLAYOUT-PROBE 1 role 4 display\nother line\nLAYOUT-PROBE 2 punct 1 22222222\nLAYOUT-PROBE 1 punct 1 22222200\nLAYOUT-PROBE 1 punct 2 2200000\nLAYOUT-PROBE 1 punct 7 22222222\nLAYOUT-PROBE 1 punct 0\n'
    expect(readProbe(log).map(r => [r.schema, r.tag, r.fields.join(' ')])).toEqual([[1, 'punct', '0 00000000'], [1, 'role', '4 display'], [2, 'punct', '1 22222222'], [1, 'punct', '1 22222200'], [1, 'punct', '2 2200000'], [1, 'punct', '7 22222222'], [1, 'punct', '0']])
    const samples = [{ command: '\\cite' }, { command: '\\autocite' }, { command: '\\footnote' }]
    // another schema's row, a section of another tag, a code cut short, a sample the probe has not: no answer
    expect(readMarkProbe(log, samples)).toEqual({ '\\cite': '00000000', '\\autocite': '22222200' })
    // an error TeX logged in a box answers nothing: in the box as the paper sets it, no answer (x); with the opening
    // mark, no mark (2); with both marks alone, no closing mark (1, REVTeX's citeautoscript); one before any row is no
    // box's
    const errs = ['! Early.', 'LAYOUT-PROBE 1 punct-at 0 4 a', '! Missing \\endcsname inserted.', 'l.12 ...', 'LAYOUT-PROBE 1 punct-at 0 5 c', './main.tex:12: Extra }, or forgotten $.', 'LAYOUT-PROBE 1 punct-at 0 5 d', 'LAYOUT-PROBE 1 punct-at 0 6 c', '! Argument of \\super@cite@swap has an extra }.', 'LAYOUT-PROBE 1 punct-at 0 6 d', 'LAYOUT-PROBE 1 punct-at 0 2 d', '! Undefined.', 'LAYOUT-PROBE 1 punct 0 00000000'].join('\n')
    expect(readMarkProbe(errs, samples)).toEqual({ '\\cite': '0020x110' })
    expect(switchedOf({ '\\cite': '00000000', '\\autocite': '22222200', '\\footnote': '00000002' })).toEqual(['\\autocite'])
  })
  it('probeFiles with `marks`: the marks\' TeX first and the probe after the width probe; without it the bytes as before', () => {
    const p = paperIn('A claim \\cite{a}. Note\\footnote{The note.}.', '\\usepackage{cite}')
    const text = (m: Map<string, Uint8Array>) => new TextDecoder().decode(m.get('main.tex'))
    expect(text(probeFiles(p, { marks: false }))).toBe(text(probeFiles(p)))
    expect(text(probeFiles(p))).not.toContain('LAYOUT-PROBE')
    const on = text(probeFiles(p, { width: true, marks: true }))
    expect(on.indexOf(LAYOUT_TEX)).toBeGreaterThan(0)
    expect(on.indexOf(LAYOUT_TEX)).toBeLessThan(on.indexOf('\\documentclass'))
    expect(on.indexOf('LAYOUT-PROBE 1 punct 0')).toBeGreaterThan(on.indexOf('AXT-WIDTH'))
    expect(on.indexOf('LAYOUT-PROBE 1 punct 1')).toBeLessThan(on.indexOf('\\end{document}'))
  })
  it('layoutMarking with `switches`: no mark (2), the opening mark alone (1) or both (0), by the command and what follows it', () => {
    const units = [unit('para', [text('A '), ph('\\cite{c}'), text('. C '), ph('\\cite{d}'), text(' and '), ph('\\cite{e}'), text('? '), ph('\\citet{f}'), text(', '), ph('\\ref{r}'), text('.')])]
    const switches = { '\\cite': '22220010', '\\citet': '00000000', '\\ref': '00000000' }
    expect(srcs(layoutMarking(units, MARK_CLASSES, { lines: false, switches }).units[0])).toEqual([
      'text', 'ph \\cite{c}', 'text', 'ph \\axtpma{p0.3a}', 'ph \\cite{d}', 'text', 'ph \\axtpma{p0.5a}', 'ph \\cite{e}', 'ph \\axtpm{p0.5b}', 'text',
      'ph \\axtpma{p0.7a}', 'ph \\citet{f}', 'ph \\axtpm{p0.7b}', 'text', 'ph \\axtpma{p0.9a}', 'ph \\ref{r}', 'ph \\axtpm{p0.9b}', 'text',
    ])
    // the probe not run: the marks as before; run, a command it did not answer (\ref here) or answered x gets none
    expect(srcs(layoutMarking(units, MARK_CLASSES, { lines: false, switches: null }).units[0])).toEqual(srcs(layoutMarking(units, MARK_CLASSES, { lines: false }).units[0]))
    expect(srcs(layoutMarking(units, MARK_CLASSES, { lines: false, switches: { '\\cite': '22220010', '\\citet': '00000000' } }).units[0]).slice(-3)).toEqual(['text', 'ph \\ref{r}', 'text'])
    expect(srcs(layoutMarking(units, MARK_CLASSES, { lines: false, switches: { ...switches, '\\citet': 'xxxxxxxx' } }).units[0])).toContain('ph \\citet{f}')
    expect(srcs(layoutMarking(units, MARK_CLASSES, { lines: false, switches: { ...switches, '\\citet': 'xxxxxxxx' } }).units[0])).not.toContain('ph \\axtpma{p0.7a}')
  })
  it('a footnote\'s call TeX answered for: both marks where they change nothing, none before what fnpct moves; two calls in a row each marked where a mark between them changes nothing', () => {
    const note = (s: string) => unit('footnote', [text(s)], { nested: true } as Partial<SourceUnit>)
    const a = note('One note.'), b = note('Two note.'), c = note('Three note.')
    const call = (n: SourceUnit) => ({ t: 'nested', pre: '\\footnote{', unit: n, post: '}' })
    const units = [a, b, c, unit('para', [text('A'), call(a), call(b), text(' and'), call(c), text('. D')])]
    const marked = (switches: Record<string, string> | null) => srcs(layoutMarking(units, MARK_CLASSES, { lines: false, switches }).units[3])
    // the probe not run: C1, the opening mark alone, and nothing on the second call of two
    expect(marked(null)).toEqual(['text', 'ph \\axtpma{n3.1a}', 'nested', 'nested', 'text', 'ph \\axtpma{n3.4a}', 'nested', 'text'])
    // fnpct: a call before a full stop gets none; a mark between two calls changes nothing
    expect(marked({ '\\footnote': '22000000' })).toEqual(['text', 'ph \\axtpma{n3.1a}', 'nested', 'ph \\axtpm{n3.1b}', 'ph \\axtpma{n3.2a}', 'nested', 'ph \\axtpm{n3.2b}', 'text', 'nested', 'text'])
    // footmisc's [multiple]: a mark between two calls changes them
    expect(marked({ '\\footnote': '00000002' })).toEqual(['text', 'ph \\axtpma{n3.1a}', 'nested', 'nested', 'text', 'ph \\axtpma{n3.4a}', 'nested', 'ph \\axtpm{n3.4b}', 'text'])
  })
  it('a footnote whose note makes no unit (fewer than two letters) is a call, marked as one', () => {
    const p = paperIn('One\\footnote{A}\\footnote{B} and more.')
    const pieces = p.units[0]?.pieces as Piece[]
    expect(pieces.filter(x => x.t === 'ph').map(x => classOf(x))).toEqual(['footnote', 'footnote'])
    expect(srcs(layoutMarking(p.units, MARK_CLASSES, { lines: false }).units[0])).toContain('ph \\axtpma{n0.1a}')
  })
  it('originalFiles passes `switches` on; without `layout` it changes no byte', () => {
    const p = paperOf('\\documentclass{article}\n\\begin{document}\nA claim \\cite{k}. And \\cite{j} again, see \\ref{t}.\n\\end{document}\n')
    const v1 = decode(originalFiles(p, { lines: true, layout: MARK_CLASSES, switches: { '\\cite': '22220000', '\\ref': '00000000' } }))
    expect(v1).toContain('A claim \\cite{k}. And \\axtpma{p0.3a}\\cite{j}\\axtpm{p0.3b} again')
    expect(decode(originalFiles(p, { lines: true, layout: MARK_CLASSES, switches: null }))).toBe(decode(originalFiles(p, { lines: true, layout: MARK_CLASSES })))
    expect([...askedCommands(p.units)]).toEqual(['\\cite', '\\ref'])
    const t = paperOf(SOURCES.table)
    for (const lines of [false, true]) expect(sha(originalFiles(t, { lines, switches: { '\\cite': '22222222' } }).get('main.tex') as Uint8Array)).toBe(PIN.table?.[lines ? 'lines' : 'plain'])
  })
})

describe('what a paper\'s macro sets: TeX asked (the ink section), and LaTeX\'s text symbols', () => {
  const paperIn = (body: string, pre = '') => openPaper(new Map([['main.tex', new TextEncoder().encode(`\\documentclass{article}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`)]]))
  it('inkSamples: each macro\'s source once, in order, that a box can hold; no text symbol, no comment or parameter, no environment', () => {
    const p = paperIn('A \\rule{0pt}{2ex} b \\fontsize{7pt}{1em}\\selectfont c \\rule{0pt}{2ex} d 3.57\\% e \\bert{} f \\verb|x| g \\hspace{1pt} h.')
    const got = inkSamples(p.units)
    expect(got).toContain('\\rule{0pt}{2ex}')
    expect(got.filter(s => s === '\\rule{0pt}{2ex}')).toHaveLength(1)
    expect(got.indexOf('\\rule{0pt}{2ex}')).toBeLessThan(got.indexOf('\\bert{}') === -1 ? Infinity : got.indexOf('\\bert{}'))
    expect(got).not.toContain('\\%')
    expect(got.some(s => /\\verb/.test(s))).toBe(false)
  })
  it('inkSection: each sample in a voided box, shown in full in the log between its rows, its error count started again', () => {
    const tex = inkSection(['\\rule{0pt}{2ex}', '\\bert{}'])
    expect(tex.match(/\\typeout\{LAYOUT-PROBE 1 ink-(?:at|end) \d\}/g)).toEqual(['\\typeout{LAYOUT-PROBE 1 ink-at 0}', '\\typeout{LAYOUT-PROBE 1 ink-end 0}', '\\typeout{LAYOUT-PROBE 1 ink-at 1}', '\\typeout{LAYOUT-PROBE 1 ink-end 1}'])
    expect(tex).toContain('\\global\\setbox\\axt@ibox\\box\\voidb@x\\setbox\\axt@ibox\\hbox{\\rule{0pt}{2ex}}')
    expect(tex).toContain('\\showboxbreadth=100000 \\showboxdepth=100000 \\tracingonline=0 \\showbox\\axt@ibox')
    expect(tex.match(/\\noindent\\par/g)).toHaveLength(2)
    expect(tex).not.toMatch(/\\write|\\immediate|AXT-/)
    // after the punctuation section, in the same document
    const doc = markProbeTex([{ src: '\\cite{a}', call: false }], ['\\bert{}'])
    expect(doc.indexOf('punct 0')).toBeLessThan(doc.indexOf('ink-at 0'))
    expect(markProbeTex([{ src: '\\cite{a}', call: false }])).not.toContain('ink-at')
  })
  it('readInkProbe: a box TeX listed with no character and no rule both wide and high sets no ink; an error or a cut listing is no answer', () => {
    // TeX Live 2025's pdfTeX log of the section, as it writes it (\showbox under \tracingonline=0)
    const log = [
      'LAYOUT-PROBE 1 ink-at 0', '> \\box54=', '\\hbox(6.81989+0.11491)x8.32996', '.\\OT1/ptm/m/n/10 %', '', '! OK.', '\\axt@ink ...', 'l.7 \\axt@ink{0}{\\%}', '', 'LAYOUT-PROBE 1 ink-end 0',
      'LAYOUT-PROBE 1 ink-at 1', '> \\box54=', '\\hbox(8.99997+0.0)x0.0', '.\\hbox(8.99997+0.0)x0.0', '..\\rule(8.99997+0.0)x0.0', '', '! OK.', 'l.8 x', 'LAYOUT-PROBE 1 ink-end 1',
      'LAYOUT-PROBE 1 ink-at 2', '> \\box54=', '\\hbox(0.0+0.0)x0.0', '', './main.tex:9: OK.', 'LAYOUT-PROBE 1 ink-end 2',
      'LAYOUT-PROBE 1 ink-at 3', '> \\box54=', '\\hbox(0.4+0.0)x3.6', '.\\kern 0.59998', '.\\vbox(0.4+0.0)x3.00003', '..\\rule(0.4+0.0)x3.00003', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 3',
      'LAYOUT-PROBE 1 ink-at 4', '> \\box54=', '\\hbox(0.0+0.0)x0.0', '.\\pdfcolorstack 0 push {1 0 0 rg 1 0 0 RG}', '.\\glue 3.33 plus 1.66', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 4',
      'LAYOUT-PROBE 1 ink-at 5', '! Misplaced \\noalign.', '> \\box54=', '\\hbox(0.0+0.0)x0.0', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 5',
      'LAYOUT-PROBE 1 ink-at 6', '> \\box54=', '\\hbox(0.0+0.0)x0.0', '.\\pdfliteral{0 0 m 10 10 l S}', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 6',
      'LAYOUT-PROBE 1 ink-at 7', '> \\box54=', '\\hbox(0.0+0.0)x0.0', '.\\glue(\\spaceskip) 3.33 plus 1.66 minus 1.11 and a line cut sh', 'ort by TeX', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 7',
      'LAYOUT-PROBE 1 ink-at 8', '> \\box54=', '\\hbox(0.0+0.0)x0.0',
    ].join('\n')
    const samples = ['\\%', '\\rule{0pt}{2.0ex}', '\\fontsize{7.6pt}{1em}', '\\_', '\\color{red}', '\\specialrule{1pt}{-1pt}{0pt}', '\\tikzmark', '\\long', '\\cut']
    expect(readInkProbe(log, samples)).toEqual(['\\rule{0pt}{2.0ex}', '\\fontsize{7.6pt}{1em}', '\\color{red}'])
    expect(readInkProbe('', samples)).toEqual([])
  })
  it('readInkTexts: a box of letters and digits of text fonts alone, at any depth, is its text; anything else no answer', () => {
    // 1810.04805's own listings (TeX Live 2026's pdfTeX): \newcommand\bert{BERT\xspace}, and \bertbase's subscript in
    // small capitals inside math
    const log = [
      'LAYOUT-PROBE 1 ink-at 0', '> \\box75=', '\\hbox(7.31458+0.0)x27.33098', '.\\OT1/ptm/m/n/10.95 B', '.\\OT1/ptm/m/n/10.95 E', '.\\OT1/ptm/m/n/10.95 R', '.\\kern-0.657', '.\\OT1/ptm/m/n/10.95 T', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 0',
      'LAYOUT-PROBE 1 ink-at 1', '> \\box75=', '\\hbox(7.31458+1.76027)x49.59885', '.\\OT1/ptm/m/n/10.95 B', '.\\OT1/ptm/m/n/10.95 E', '.\\OT1/ptm/m/n/10.95 R', '.\\kern-0.657', '.\\OT1/ptm/m/n/10.95 T', '.\\mathon', '.\\hbox(5.43198+0.09995)x22.26787, shifted 1.66032', '..\\OT1/ptm/m/sc/8 B', '..\\kern-0.27998', '..\\OT1/ptm/m/sc/8 A', '..\\OT1/ptm/m/sc/8 S', '..\\OT1/ptm/m/sc/8 E', '.\\mathoff', '', './main.tex:9: OK.', 'LAYOUT-PROBE 1 ink-end 1',
      // a ligature, a space
      'LAYOUT-PROBE 1 ink-at 2', '> \\box75=', '\\hbox(6.9+0.0)x40.0', '.\\T1/cmr/m/n/10 ^^\\ (ligature ffi)', '.\\T1/cmr/m/n/10 x', '.\\glue 3.33 plus 1.66', '.\\T1/cmr/m/n/10 2', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 2',
      // a math italic letter, a symbol, a rule, an error, nothing at all, a cut listing
      'LAYOUT-PROBE 1 ink-at 3', '> \\box75=', '\\hbox(4.3+0.0)x5.7', '.\\mathon', '.\\OML/cmm/m/it/10 x', '.\\mathoff', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 3',
      'LAYOUT-PROBE 1 ink-at 4', '> \\box75=', '\\hbox(6.8+0.1)x8.3', '.\\OT1/ptm/m/n/10 %', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 4',
      'LAYOUT-PROBE 1 ink-at 5', '> \\box75=', '\\hbox(6.8+0.0)x10.0', '.\\OT1/ptm/m/n/10 A', '.\\rule(0.4+0.0)x3.0', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 5',
      'LAYOUT-PROBE 1 ink-at 6', '! Undefined control sequence.', '> \\box75=', '\\hbox(6.8+0.0)x5.0', '.\\OT1/ptm/m/n/10 A', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 6',
      'LAYOUT-PROBE 1 ink-at 7', '> \\box75=', '\\hbox(0.0+0.0)x0.0', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 7',
      'LAYOUT-PROBE 1 ink-at 8', '> \\box75=', '\\hbox(6.8+0.0)x5.0', '.\\OT1/ptm/m/n/10 A',
    ].join('\n')
    const samples = ['\\bert', '\\bertbase', '\\office', '\\x', '\\pct', '\\boxed', '\\broken', '\\nothing', '\\cut']
    expect(readInkTexts(log, samples)).toEqual([['\\bert', 'BERT'], ['\\bertbase', 'BERTBASE'], ['\\office', 'ffix2']])
    expect(readInkTexts('', samples)).toEqual([])
    // 65 letters: past INK_TEXT_MAX, no answer
    const long = ['LAYOUT-PROBE 1 ink-at 0', '> \\box75=', '\\hbox(6.8+0.0)x325.0', ...Array.from({ length: 65 }, () => '.\\OT1/ptm/m/n/10 A'), '', '! OK.', 'LAYOUT-PROBE 1 ink-end 0'].join('\n')
    expect(readInkTexts(long, ['\\long'])).toEqual([])
  })
  it('headEnd: a unit\'s head before its start mark, as patch places it', () => {
    const ph = (src: string) => ({ t: 'ph', src }), text = (s: string) => ({ t: 'text', s })
    // a macro and a space before the first word: passed over; one glued to its word: the mark before it
    expect(headEnd([ph('\\bert'), text(' is simple')])).toBe(1)
    expect(headEnd([ph('\\bert'), text("'s model")])).toBe(0)
    expect(headEnd([ph('\\specialrule{1pt}{-1pt}{0pt}'), text('\n'), ph('\\rule{0pt}{2ex}'), text('Transformer')])).toBe(3)
    expect(headEnd([ph('$x$'), text(' is')])).toBe(0)
  })
  it('symbolText: LaTeX\'s text symbols, each its one character, alone or before an empty group', () => {
    expect(symbolText('\\%')).toBe('%')
    expect(symbolText('\\_')).toBe('_')
    expect(symbolText('\\dots{}')).toBe('\u2026')
    expect(symbolText('\\S')).toBe('\u00a7')
    for (const src of ['\\%x', '\\bert', '\\bert{}', '%', '\\{a\\}', undefined]) expect(symbolText(src)).toBeNull()
    for (const ch of Object.values(TEXT_SYMBOLS)) expect([...ch]).toHaveLength(1)
  })
  it('layoutMarking: a macro TeX said sets no ink gets no mark, where it would have had one; the rest as before', () => {
    const p = paperIn('Words \\fontsize{7pt}{1em} more and \\bert{} here, and so on.')
    const opens = (inkless: string[] | null) => layoutMarking(p.units, MARK_CLASSES, { lines: false, inkless }).units.flatMap(u => srcs(u)).filter(s => /^ph \\axtpma/.test(s))
    expect(opens(null).length).toBeGreaterThan(0)
    const marked = (inkless: string[] | null) => opens(inkless).length
    // (the paper's own macro TeX said sets no ink; \\fontsize the role table proves sets no letters gets none either way)
    expect(marked(['\\bert{}'])).toBe(marked(null) - 1)
    expect(marked(['\\fontsize{7pt}{1em}'])).toBe(marked(null))
    expect(marked([])).toBe(marked(null))
  })
  it('probeFiles with the marks asks about the paper\'s macros after its citations', () => {
    const p = paperIn('A claim \\cite{a} and \\rule{0pt}{2ex} here.')
    const text = new TextDecoder().decode(probeFiles(p, { marks: true }).get('main.tex'))
    expect(text).toContain('LAYOUT-PROBE 1 ink-at 0')
    expect(text).toContain('\\hbox{\\rule{0pt}{2ex}}')
  })
})

describe('LAYOUT_TEX', () => {
  it('LAYOUT_TEX holds the gate and the vanishing writes', () => {
    expect(LAYOUT_TEX).toContain('\\AddToHook{cmd/@starttoc/before}{\\global\\axt@offtrue}')
    expect(LAYOUT_TEX).toContain('\\AddToHook{cmd/@starttoc/after}{\\global\\axt@offfalse}')
    expect(LAYOUT_TEX).toContain('\\AddToHook{cmd/@outputpage/before}{\\axt@offtrue}')
    expect(LAYOUT_TEX).toContain('\\pdfstringdefDisableCommands')
    // and nameref's titles: stripped where nameref sanitizes them, whoever set them (titlesec's \\@currentlabelname)
    expect(LAYOUT_TEX).toContain('\\AddToHook{package/nameref/after}{\\ifdefined\\NR@sanitize@labelname')
    for (const name of ['axtpma', 'axtpm', 'axthmark']) expect(LAYOUT_TEX).toContain(`\\def\\${name}{\\ifx\\protect\\@typeset@protect`)
    // MARK_DEF's own mark gated too
    expect(LAYOUT_TEX).toMatch(/\\protected\\def\\axtmark#1\{[^}]*\\ifaxt@off/)
    for (const word of ['\\message', '\\typeout', 'AXT-', '\\wlog', '\\newcount', '\\newdimen', '\\newskip']) expect(LAYOUT_TEX).not.toContain(word)
    // one line, no comment: the paper's lines keep their numbers in the log
    expect(LAYOUT_TEX).not.toContain('\n')
    expect(LAYOUT_TEX).not.toContain('%')
  })
  it('LAYOUT_TEX sets a point beside each destination, around each column\'s body and around each float\'s box', () => {
    // a rendering intent named after the destination, in each engine's literal; none in DVI
    expect(POINTS_TEX).toContain('\\ifdefined\\XeTeXrevision\\def\\axt@point#1{\\special{pdf:code /axt-#1 ri}}')
    expect(POINTS_TEX).toContain('\\ifdefined\\pdfextension\\def\\axt@point#1{\\pdfextension literal direct{/axt-#1 ri}}')
    expect(POINTS_TEX).toContain('\\ifdefined\\pdfliteral\\def\\axt@point#1{\\ifnum\\pdfoutput>0 \\pdfliteral direct{/axt-#1 ri}\\fi}')
    expect(POINTS_TEX).toContain('\\let\\axt@destonly\\axt@dest\\def\\axt@dest#1{\\axt@destonly{#1}\\axt@point{#1}}')
    // the column's body repacked to its own height and depth, a point first and last; a float's box, a point first and last
    // the opening point with a \penalty10000 after it: a whatsit before the body's first glue makes it a place to break,
    // and \vsplit (balance.sty's last page) then takes an empty column (2608.06007); the closing one after the body's last
    // box, its glue, kerns and penalties taken off and put back after it, each where TeX had it: LaTeX's
    // \@outputbox@removebskip reads the body's \lastskip (2608.24503), and no place to break is made or lost
    expect(POINTS_TEX).toContain('\\AddToHook{cmd/@makecol/before}{\\ifvoid\\@cclv\\else\\axt@bump\\begingroup\\boxmaxdepth\\dp\\@cclv\\global\\setbox\\@cclv\\vbox to\\ht\\@cclv{\\axt@point{bs\\axt@bn}\\penalty\\@M\\unvbox\\@cclv\\let\\axt@vback\\@empty\\axt@vtake\\axt@point{be\\axt@bn}\\axt@vback}\\endgroup\\fi}')
    expect(POINTS_TEX).toContain('\\def\\axt@vtake{\\ifcase\\numexpr\\lastnodetype-10\\relax\\or\\expandafter\\axt@vtg\\or\\expandafter\\axt@vtk\\or\\expandafter\\axt@vtp\\fi}')
    // a float's points around its finished box (\@endfloatbox closes it): at its start a point would give its first
    // paragraph a \parskip (2608.01890's figures)
    expect(POINTS_TEX).toContain('\\def\\@endfloatbox{\\axt@efb\\ifvoid\\@currbox\\else\\axt@bump\\begingroup\\boxmaxdepth\\dp\\@currbox\\global\\setbox\\@currbox\\vbox to\\ht\\@currbox{\\axt@point{fs\\axt@bn}\\unvbox\\@currbox\\axt@point{fe\\axt@bn}}\\endgroup\\fi}')
    expect(POINTS_TEX).not.toContain('@floatboxreset')
    // after the destination's own definition, inside LAYOUT_TEX; its count a macro, no register; one line
    expect(LAYOUT_TEX.indexOf(POINTS_TEX)).toBeGreaterThan(LAYOUT_TEX.indexOf('\\def\\axt@dest#1'))
    expect(LAYOUT_TEX.endsWith(`${POINTS_TEX}\\makeatother`)).toBe(true)
    for (const word of ['\\newcount', '\\newbox', '\\newdimen', '\\typeout', '\n', '%']) expect(POINTS_TEX).not.toContain(word)
  })
})

describe('the mark names', () => {
  it('MARK_NAME takes each grammar and nothing else', () => {
    for (const name of ['12s', '0e', 'c2-7', 'c1-1', 't4e', 'h0s', 'p3.14a', 'n3.2b', 'g9t', 'g1a']) expect(MARK_NAME.test(name), name).toBe(true)
    for (const name of ['12x', 'c3-1', 'p3a', 'axt-12s', '12s ', 'h3', 't4a', 'p3.14', 'g9s', 'P3.1A', '']) expect(MARK_NAME.test(name), name).toBe(false)
  })
})

// a PDF.js document as layoutMarksOf and marksOf read it: its pages, their views and text, its destinations
type Dest = [{ num: number; gen: number }, { name: string }, number | null, number | null, null]
function fakeDocument(pages: { view: number[]; items?: unknown[] }[], dests: [string, number, number | null, number | null][]) {
  return {
    numPages: pages.length,
    getPage: async (n: number) => ({ view: nth(pages, n - 1).view, getTextContent: async () => ({ items: nth(pages, n - 1).items ?? [], styles: {} }) }),
    getDestinations: async () => new Map<string, Dest>(dests.map(([name, page, x, y]) => [name, [{ num: 100 + page, gen: 0 }, { name: 'XYZ' }, x, y, null]])),
    getPageIndex: async (ref: { num: number }) => ref.num - 101,
  }
}
const item = (str: string, x: number, y: number, size = 10) => ({ str, transform: [size, 0, 0, size, x, y], width: str.length * size * 0.5, height: size, fontName: 'f1', hasEOL: false })
/** a page's operator list in stream order: a run of glyphs at its place (each 5 pt wide at 10 pt), a point (`/axt-<name> ri`),
 *  a rule */
type Shown = [s: string, x: number, y: number, size?: number] | { at: string } | { rule: number[] } | { glyphs: string[]; x: number; y: number; size?: number; step?: number }
const FONT = { name: 'ABCDEF+CMR10', fontMatrix: [0.001, 0, 0, 0.001, 0, 0], ascent: 0.75, descent: -0.25, isType3Font: false, vertical: false }
function opsOf(shown: Shown[]) {
  const ops: [number, unknown[]][] = []
  for (const s of shown) {
    if (Array.isArray(s)) {
      const [str, x, y, size = 10] = s
      ops.push([OPS.beginText, []], [OPS.setFont, ['f1', size]], [OPS.setTextMatrix, [[1, 0, 0, 1, x, y]]], [OPS.showText, [[...str].map(c => (c === ' ' ? -500 : { unicode: c, width: 500, isSpace: false, fontChar: c, vmetric: null }))]], [OPS.endText, []])
    } else if ('glyphs' in s) {
      // each glyph a Unicode string of its own (a ligature's, or many distinct ones), `step` its advance in thousandths
      const step = s.step ?? 500
      ops.push([OPS.beginText, []], [OPS.setFont, ['f1', s.size ?? 10]], [OPS.setTextMatrix, [[1, 0, 0, 1, s.x, s.y]]], [OPS.showText, [s.glyphs.map(u => ({ unicode: u, width: step, isSpace: false, fontChar: u, vmetric: null }))]], [OPS.endText, []])
    } else if ('at' in s) ops.push([OPS.setRenderingIntent, [{ name: `axt-${s.at}` }]])
    else ops.push([OPS.constructPath, [OPS.fill, [Float32Array.from([0])], Float32Array.from(s.rule)]])
  }
  return { fnArray: ops.map(o => o[0]), argsArray: ops.map(o => o[1]) }
}
/** fakeDocument's, with each page's operator list */
function streamDocument(pages: { view: number[]; items?: unknown[]; shown: Shown[] }[], dests: [string, number, number | null, number | null][]) {
  const doc = fakeDocument(pages, dests)
  return { ...doc, getPage: async (n: number) => ({ ...(await doc.getPage(n)), rotate: 0, commonObjs: { get: () => FONT }, getOperatorList: async () => opsOf(nth(pages, n - 1).shown) }) }
}

describe('reading the marked original', () => {
  it('marksOf reads none of the layout marks', async () => {
    const doc = fakeDocument([{ view: [0, 0, 612, 792] }], [['axt-12s', 1, 72, 700], ['axt-12e', 1, 300, 650], ['axt-c2-1', 1, 0, 0], ['axt-t4s', 1, 80, 500], ['axt-h0s', 1, 72, 720], ['axt-p3.14a', 1, 100, 700], ['axt-n3.2b', 1, 120, 700], ['axt-g9t', 1, 300, 400]])
    const m = await marksOf(doc)
    expect([...m.marks.keys()].sort()).toEqual(['12e', '12s'])
    expect(m.columns).toEqual([2])
  })
  it('layoutMarksOf drops a name set twice', async () => {
    const doc = fakeDocument(
      [{ view: [0, 0, 612, 792], items: [item('The model', 72, 700), item('x', 140, 700)] }, { view: [0, 0, 612, 792], items: [item('the end', 72, 720)] }],
      [['axt-0s', 1, 72, 700], ['axt-0e', 1, 150.123, 700], ['axt-h3s', 2, 72, 720], ['axt-p0.1a', 1, 100, 700], ['axt-c1-1', 1, 0, 0], ['axt-c2-2', 2, 0, 0], ['other', 1, 1, 1], ['axt-zz', 1, 1, 1], ['axt-g1t', 2, 300, 400]],
    )
    // the warning as TeX writes it in the log, cut at 79 characters
    const warning = 'pdfTeX warning (dest): destination with the same identifier (name{axt-h3s}) has been already used, duplicate ignored'
    const log = `This is pdfTeX\n${warning.slice(0, 79)}\n${warning.slice(79)}\nAXT-LINES 3 5 12.0pt 10\nAXT-LINES 0 2 12.0pt 10\n`
    const m = await layoutMarksOf(doc, log, { engine: 'pdflatex' })
    expect(m.dropped).toEqual(['h3s'])
    expect(m.marks.map(x => x[0])).not.toContain('h3s')
    expect(m.marks).toContainEqual(['0e', 1, 150.12, 700])
    expect(m.marks.map(x => x[0]).sort()).toEqual(['0e', '0s', 'c1-1', 'c2-2', 'g1t', 'p0.1a'])
    expect(m.columns).toEqual([1, 2])
    expect(m.lines).toEqual([[0, 2], [3, 5]])
    expect(m.views).toEqual([0, 0, 612, 792, 0, 0, 612, 792])
    expect(m.pages).toBe(2)
    expect(m.engine).toBe('pdflatex')
    expect(m.words).toEqual(['the', 'model', 'x', 'end'])
    expect(m.tokens.length).toBe(6 * 5)
    expect(m.tokens.slice(0, 6)).toEqual([1, 72, 700, 15, 10, 0])
    expect(m.tokens.slice(24, 30)).toEqual([2, 92, 720, 15, 10, 3])
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(m)))).toEqual(m)
  })
  it('layoutMarksOf writes the rest of a word cut by a hyphen as word -1 after it, and none after a word left out', async () => {
    const eol = (str: string, x: number, y: number) => ({ ...item(str, x, y), hasEOL: true })
    const long = 'x'.repeat(201)
    const doc = fakeDocument([{ view: [0, 0, 612, 792], items: [item('text generation', 72, 700), eol('mod-', 160, 700), item('els.', 72, 688), eol(`${long}-`, 72, 676), item('tail', 72, 664)] }], [])
    const m = await layoutMarksOf(doc, '', { engine: 'pdflatex' })
    expect(m.words).toEqual(['text', 'generation', 'models'])
    // models, then its rest at the next line's start; the 201-letter word and its rest left out
    expect(m.tokens.slice(12, 24)).toEqual([1, 160, 700, 15, 10, 2, 1, 72, 688, 15, 10, -1])
    expect(m.tokens.length).toBe(6 * 4)
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(m)))).toEqual(m)
  })
  it('layoutMarksOf records the classes and the paper\'s switch the marked original was made with', async () => {
    const doc = fakeDocument([{ view: [0, 0, 612, 792], items: [item('kept', 72, 700)] }], [['axt-0s', 1, 72, 700]])
    // no probe run: null, which the maker re-marks as LAYOUT_TEX sets every mark; a probe that answered nothing is {},
    // which the maker re-marks with no mark for an asked command (Task 2's m4): the two kept apart through the file
    const plain = await layoutMarksOf(doc, '', { engine: 'pdflatex' })
    expect(plain.marking).toEqual({ classes: [...LAYOUT_CLASSES], switches: null, inkless: null, texts: null })
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(plain))).marking.switches).toBeNull()
    const none = await layoutMarksOf(doc, '', { engine: 'pdflatex', switches: {} })
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(none))).marking.switches).toEqual({})
    const m = await layoutMarksOf(doc, '', { engine: 'pdflatex', classes: ['math', 'cite'], switches: { '\\cite': '22220000', '\\ref': 'x0000000' } })
    expect(m.marking).toEqual({ classes: ['math', 'cite'], switches: { '\\cite': '22220000', '\\ref': 'x0000000' }, inkless: null, texts: null })
    // the probe's texts, as readInkTexts gives them, written flat (the file nests no deeper)
    const said = await layoutMarksOf(doc, '', { engine: 'pdflatex', texts: [['\\bert', 'BERT'], ['\\ours', 'OURS']] })
    expect(said.marking.texts).toEqual(['\\bert', 'BERT', '\\ours', 'OURS'])
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(said))).marking.texts).toEqual(['\\bert', 'BERT', '\\ours', 'OURS'])
    await expect(layoutMarksOf(doc, '', { engine: 'pdflatex', texts: [['\\bert', 'BE RT']] })).rejects.toThrow(LayoutRefusal)
    const none2 = await layoutMarksOf(doc, '', { engine: 'pdflatex', inkless: ['\\rule{0pt}{2ex}'] })
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(none2))).marking.inkless).toEqual(['\\rule{0pt}{2ex}'])
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(m))).marking).toEqual(m.marking)
    await expect(layoutMarksOf(doc, '', { engine: 'pdflatex', switches: { '\\cite': '2222000y' } })).rejects.toThrow(LayoutRefusal)
    await expect(layoutMarksOf(doc, '', { engine: 'pdflatex', classes: ['math', 'tikz' as 'math'] })).rejects.toThrow(LayoutRefusal)
    await expect(layoutMarksOf(doc, '', { engine: 'pdflatex', switches: { '\\cite': '2222' } })).rejects.toThrow(LayoutRefusal)
    // no operator list read without the units and PDF.js's operator codes: no piece owns anything
    expect(m.owned).toEqual([])
    expect(m.chars).toEqual([])
  })
  it('layoutMarksOf writes past its caps as not owned, and nothing its own parser refuses (the 6b review\'s I3 and Minor 1)', async () => {
    // pieces of $x$ each between its points; their glyphs given as runs of many glyphs
    const pieceOf = (n: number) => unit('para', Array.from({ length: n }, (_, k) => [text(k ? ' and ' : 'see '), ph('$x$')]).flat())
    const parse = async (units: SourceUnit[], shown: Shown[], dests: [string, number, number, number][], view = [0, 0, 612, 792]) => {
      const doc = streamDocument([{ view, items: [item('see', 72, 700)], shown }], dests.map(([n, ...r]) => [`axt-${n}`, ...r]))
      const m = await layoutMarksOf(doc, '', { engine: 'pdflatex', units, OPS })
      return { m, back: parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(m))) }
    }
    // a piece of GLYPHS_PIECE + 1 glyphs: not owned, how so
    {
      const glyphs = Array.from({ length: GLYPHS_PIECE + 1 }, () => 'x')
      const { back } = await parse([pieceOf(1)], [{ at: '0s' }, { at: 'p0.1a' }, { glyphs, x: 72, y: 700, step: 1 }, { at: 'p0.1b' }, { at: '0e' }], [['0s', 1, 72, 700], ['p0.1a', 1, 72, 700], ['p0.1b', 1, 300, 700], ['0e', 1, 300, 700]])
      expect(back.owned).toEqual([['p0.1a', OWNED_HOW.indexOf('more glyphs than a piece may own')]])
    }
    // 65,537 distinct characters over four pieces: the 65,536th place is '', which every one past it is written as
    {
      const per = 16_385, shown: Shown[] = [{ at: '0s' }], dests: [string, number, number, number][] = [['0s', 1, 72, 700]]
      for (let q = 0; q < 4; q++) {
        const k = 2 * q + 1, glyphs = Array.from({ length: per }, (_, i) => { const n = q * per + i; return String.fromCharCode(0x4e00 + (n % 20000)) + String.fromCharCode(0x4e00 + Math.floor(n / 20000)) })
        shown.push({ at: `p0.${k}a` }, { glyphs, x: 72, y: 700 - 10 * q, step: 1 }, { at: `p0.${k}b` })
        dests.push([`p0.${k}a`, 1, 72, 700 - 10 * q], [`p0.${k}b`, 1, 300, 700 - 10 * q])
      }
      shown.push({ at: '0e' }); dests.push(['0e', 1, 300, 670])
      const { m, back } = await parse([pieceOf(4)], shown, dests)
      expect(m.chars).toHaveLength(65_536)
      expect(m.chars.at(-1)).toBe('')
      expect(back.chars).toHaveLength(65_536)
    }
  }, 60_000)
  it('layoutMarksOf: past OWNED_ALL a paper\'s pieces are not owned, and past MARKS_CAP its last owned pieces are cut, never the file refused', async () => {
    // 14 pieces, in name order (p0.1a, p0.11a, …) 12 of 20,000 glyphs and one of 9,999: 249,999 owned; the last, 20,000
    // more, past OWNED_ALL
    const n = 14, per = 20_000, past = OWNED_HOW.indexOf('past the glyphs a paper may own')
    const units = [unit('para', Array.from({ length: n }, (_, k) => [text(k ? ' and ' : 'see '), ph('$x$')]).flat())]
    const run = async (big: boolean) => {
      const shown: Shown[] = [{ at: '0s' }], dests: [string, number, number, number][] = [['0s', 1, big ? 10_000 : 72, big ? 13_000 : 700]]
      for (let q = 0; q < n; q++) {
        const k = 2 * q + 1, y = big ? 13_000.11 - 300 * q : 700 - 12 * q, count = q === n - 2 ? 9_999 : per
        // at coordinates of five digits on a page of 14,000 pt, each glyph a character of its own kind (an index of five
        // digits into `chars`): some 8.6 MB, past MARKS_CAP; else 4 MB of one character, within it
        const glyphs = Array.from({ length: count }, (_, i) => { if (!big) return 'x'; const c = 10_000 + ((q * per + i) % 55_000); return String.fromCharCode(0x4e00 + (c % 20000)) + String.fromCharCode(0x4e00 + Math.floor(c / 20000)) })
        shown.push({ at: `p0.${k}a` }, { glyphs, x: big ? 10_000.11 : 72, y, size: big ? 199.99 : 10, step: big ? 1 : 0.01 }, { at: `p0.${k}b` })
        dests.push([`p0.${k}a`, 1, big ? 10_000 : 72, y], [`p0.${k}b`, 1, big ? 13_000 : 80, y])
      }
      shown.push({ at: '0e' }); dests.push(['0e', 1, big ? 13_000 : 80, big ? 9_000 : 500])
      const view = big ? [0, 0, 14_000, 14_000] : [0, 0, 612, 792]
      const doc = streamDocument([{ view, items: [item('see', dests[0]![2], dests[0]![3])], shown }], dests.map(([nm, ...r]) => [`axt-${nm}`, ...r]))
      const m = await layoutMarksOf(doc, '', { engine: 'pdflatex', units, OPS })
      const written = encodeLayoutMarks(m)
      expect(new TextEncoder().encode(written).length).toBeLessThanOrEqual(MARKS_CAP)
      return parseLayoutMarks(new TextEncoder().encode(written))
    }
    // within the cap: the last piece alone past OWNED_ALL
    const small = await run(false)
    expect(small.owned.at(-1)).toEqual(['p0.9a', past])
    expect(small.owned.filter(e => e.length === 2).length).toBe(1)
    // past the cap: owned pieces from the last cut to fit the file, never the file refused
    const large = await run(true)
    expect(large.owned.at(-1)).toEqual(['p0.9a', past])
    expect(large.owned.filter(e => e.length === 2 && e[1] === past).length).toBeGreaterThan(1)
    expect(large.owned.some(e => e.length > 2)).toBe(true)
  }, 120_000)
  it('layoutMarksOf reads the marked compile\'s operator lists: each piece\'s own glyphs and rules by its points, and how', async () => {
    const units = [unit('para', [text('see '), ph('$x^2$'), text(' and '), ph('$\\frac{1}{d}$'), text(' by '), ph('\\bert'), text(' models. '), ph('\\[a=b\\]')]), unit('para', [text('Next words')])]
    const shown: Shown[] = [
      ['see', 72, 700], { at: '0s' }, { at: 'p0.1a' }, ['x', 92, 700], ['2', 97, 703.5, 7], { at: 'p0.1b' }, ['and', 106, 700],
      { at: 'p0.3a' }, ['1', 130, 705], { rule: [130, 702, 135, 702.4] }, ['d', 130, 695], { at: 'p0.3b' }, ['by', 140, 700],
      { at: 'p0.5a' }, ['BERT', 155, 700], ['models.', 178, 700], { at: 'p0.7a' }, ['a=b', 150, 680], { at: '0e' }, { at: '1s' }, ['Next', 72, 660],
    ]
    const dests: [string, number, number, number][] = [['0s', 1, 72, 700], ['p0.1a', 1, 87, 700], ['p0.1b', 1, 100.5, 700], ['p0.3a', 1, 121, 700], ['p0.3b', 1, 135, 700], ['p0.5a', 1, 150, 700], ['p0.7a', 1, 213, 700], ['0e', 1, 213, 700], ['1s', 1, 72, 660]]
    const doc = streamDocument([{ view: [0, 0, 612, 792], items: [item('see', 72, 700)], shown }], dests.map(([n, ...r]) => [`axt-${n}`, ...r]))
    const m = await layoutMarksOf(doc, '', { engine: 'pdflatex', units, OPS })
    const of = (name: string) => m.owned.find(e => e[0] === name)
    // each glyph its page, origin, baseline, size and character; each rule its page and box
    expect(m.chars).toEqual(['x', '2', '1', 'd', 'B', 'E', 'R', 'T', 'a', '=', 'b'])
    expect(of('p0.1a')).toEqual(['p0.1a', OWNED_HOW.indexOf('closed'), 2, 1, 92, 700, 10, 0, 1, 97, 703.5, 7, 1])
    expect(of('p0.3a')).toEqual(['p0.3a', OWNED_HOW.indexOf('closed'), 2, 1, 130, 705, 10, 2, 1, 130, 695, 10, 3, 1, 130, 702, 135, 702.4])
    // an opening mark alone: to where the text after it begins, a display to its unit's end mark
    expect(of('p0.5a')).toEqual(['p0.5a', OWNED_HOW.indexOf('open, to the text after it'), 4, 1, 155, 700, 10, 4, 1, 160, 700, 10, 5, 1, 165, 700, 10, 6, 1, 170, 700, 10, 7])
    expect(of('p0.7a')?.slice(0, 3)).toEqual(['p0.7a', OWNED_HOW.indexOf("open, to its unit's next mark"), 3])
    expect(m.owned.map(e => e[0])).toEqual(['p0.1a', 'p0.3a', 'p0.5a', 'p0.7a'])
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(m)))).toEqual(m)
    // the units' marks file the same but for the new fields: no stream read, nothing owned
    const plain = await layoutMarksOf(doc, '', { engine: 'pdflatex' })
    expect({ ...plain, owned: m.owned, chars: m.chars }).toEqual(m)
  })
  it('layoutMarksOf owns no ink off its page: the piece is written as not owned, and the file parses', async () => {
    const units = [unit('para', [text('see '), ph('$x$'), text(' and '), ph('$y$'), text(' end')])]
    const shown: Shown[] = [['see', 72, 700], { at: '0s' }, { at: 'p0.1a' }, ['x', 5000, 700], { at: 'p0.1b' }, ['and', 106, 700], { at: 'p0.3a' }, ['y', 130, 700, 300], { at: 'p0.3b' }, ['end', 140, 700], { at: '0e' }]
    const dests: [string, number, number, number][] = [['0s', 1, 72, 700], ['p0.1a', 1, 87, 700], ['p0.1b', 1, 100.5, 700], ['p0.3a', 1, 121, 700], ['p0.3b', 1, 135, 700], ['0e', 1, 160, 700]]
    const doc = streamDocument([{ view: [0, 0, 612, 792], items: [item('see', 72, 700)], shown }], dests.map(([n, ...r]) => [`axt-${n}`, ...r]))
    const m = await layoutMarksOf(doc, '', { engine: 'pdflatex', units, OPS })
    // a glyph past the page's view, a glyph past the size a glyph may have
    expect(m.owned).toEqual([['p0.1a', OWNED_HOW.indexOf('ink out of bounds')], ['p0.3a', OWNED_HOW.indexOf('ink out of bounds')]])
    expect(OWNED_HOW.indexOf('ink out of bounds')).toBeGreaterThanOrEqual(OWNED)
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(m)))).toEqual(m)
  })
  it('layoutMarksOf leaves out a mark or a word off its page, and refuses an engine it does not know', async () => {
    const doc = fakeDocument([{ view: [0, 0, 612, 792], items: [item('kept', 72, 700), item('off', 5000, 700), item('x'.repeat(201), 72, 650)] }], [['axt-0s', 1, 72, 700], ['axt-1s', 1, 9000, 700], ['axt-2s', 1, null, null]])
    const m = await layoutMarksOf(doc, '', { engine: 'xelatex' })
    expect(m.marks).toEqual([['0s', 1, 72, 700]])
    expect(m.words).toEqual(['kept'])
    await expect(layoutMarksOf(doc, '', { engine: 'context' })).rejects.toThrow(LayoutRefusal)
  })
  it('reads the duplicate warnings of LuaTeX and dvipdfmx too', async () => {
    const doc = fakeDocument([{ view: [0, 0, 612, 792] }], [['axt-h1s', 1, 72, 700], ['axt-h2s', 1, 72, 650], ['axt-t3s', 1, 72, 600]])
    const log = 'warning  (pdf backend): ignoring duplicate destination with the name \'axt-h1s\'\nxdvipdfmx:warning: Object @axt-t3s already defined.\n'
    const m = await layoutMarksOf(doc, log, { engine: 'lualatex' })
    expect(m.dropped.sort()).toEqual(['h1s', 't3s'])
    expect(m.marks.map(x => x[0])).toEqual(['h2s'])
  })
})

/** a made-up marks file of two pages, every field used */
const valid = (): LayoutMarks => ({
  schema: 3, engine: 'pdflatex', marking: { classes: [...MARK_CLASSES], switches: { '\\cite': '22220000', '\\footnote': '00000012' }, inkless: ['\\rule{0pt}{2ex}', '\\fontsize{7.6pt}{1em}'], texts: ['\\bert', 'BERT'] }, pages: 2,
  views: [0, 0, 612, 792, 0, 0, 612, 792],
  columns: [1, 2],
  marks: [['0s', 1, 72, 700], ['0e', 1, 300.5, 650.25], ['c1-1', 1, 0, 0], ['c2-2', 2, 0, 0], ['p0.3a', 1, 100, 700], ['p0.3b', 1, 120.75, 700], ['h1s', 2, 72, 720], ['t2s', 2, 80, 500], ['n0.5a', 1, 200, 680], ['g1t', 2, 300, 400]],
  dropped: ['h4s'],
  lines: [[0, 3], [2, 1], [7, 12]],
  words: ['the', 'model', 'x'],
  tokens: [1, 72, 700, 15.5, 10, 0, 1, 90, 700, 25, 10, 1, 2, 72, 720, 6, 12, 2],
  chars: ['x', '2', '\u2211', ''],
  // p0.3: x and its raised 2, and a rule; n0.5: one glyph of a blank Unicode; p2.1: out of order
  owned: [['n0.5a', 1, 1, 1, 200, 680, 7, 3], ['p0.3a', 0, 2, 1, 100, 700, 10, 0, 1, 105, 703.5, 7, 1, 1, 100, 702, 110, 702.4], ['p2.1a', OWNED_HOW.indexOf('marks out of order')]],
})
const bytes = (v: unknown) => new TextEncoder().encode(typeof v === 'string' ? v : JSON.stringify(v))
const refusal = (b: Uint8Array) => { try { parseLayoutMarks(b); return null } catch (e) { if (!(e instanceof LayoutRefusal)) throw e; return e.path } }

describe('the marks file', () => {
  it('parseLayoutMarks refuses a file nested deeper than its 3 levels before JSON.parse, and quickly', () => {
    // 999,000 arrays inside each other: 1.91 MiB of 999,000 values, inside both caps, which JSON.parse built in 70 ms
    const deep = bytes(`${'['.repeat(999_000)}${']'.repeat(999_000)}`)
    expect(deep.length).toBeLessThan(MARKS_CAP)
    const parse = vi.spyOn(JSON, 'parse')
    const t = performance.now()
    let why = ''
    try { parseLayoutMarks(deep) } catch (e) { if (!(e instanceof LayoutRefusal)) throw e; why = e.message }
    const ms = performance.now() - t
    expect(parse).not.toHaveBeenCalled()
    parse.mockRestore()
    expect(why).toBe('nested more than 3 deep')
    expect(ms).toBeLessThan(50)
  })
  it('encodeLayoutMarks and parseLayoutMarks round-trip', () => {
    const m = valid()
    expect(parseLayoutMarks(bytes(encodeLayoutMarks(m)))).toEqual(m)
    expect(Object.keys(JSON.parse(encodeLayoutMarks(m)))).toEqual(['schema', 'engine', 'marking', 'pages', 'views', 'columns', 'marks', 'dropped', 'lines', 'words', 'tokens', 'chars', 'owned'])
  })
  it('parseLayoutMarks refuses past its bounds', () => {
    const big = new Uint8Array(MARKS_CAP + 1).fill(0x20)
    expect(refusal(big)).toBe('')
    const parse = vi.spyOn(JSON, 'parse')
    expect(refusal(bytes(`[${'0,'.repeat(MARKS_VALUES - 1)}0]`))).toBe('')
    expect(parse).not.toHaveBeenCalled()
    parse.mockRestore()
    expect(refusal(new Uint8Array([0x7b, 0xc3, 0x28, 0x7d]))).toBe('')
    const rows: [string, (m: LayoutMarks & Record<string, unknown>) => void, string][] = [
      ['schema 1, a file before the stream', m => { m.schema = 1 as 3 }, 'schema'],
      ['schema 2, a file before the inkless macros', m => { m.schema = 2 as 3 }, 'schema'],
      ['engine context', m => { m.engine = 'context' }, 'engine'],
      ['marking not an object', m => { (m as Record<string, unknown>).marking = ['math'] }, 'marking'],
      ['marking with a key of no schema', m => { (m.marking as Record<string, unknown>).extra = [] }, 'marking.extra'],
      ['a class of no MARK_CLASSES', m => { (m.marking.classes as string[])[0] = 'tikz' }, 'marking.classes[0]'],
      ['a class twice', m => { (m.marking.classes as string[])[1] = 'math' }, 'marking.classes[1]'],
      ['the switch an array', m => { (m.marking as Record<string, unknown>).switches = ['\\cite'] }, 'marking.switches'],
      ['a switch of no command', m => { (m.marking.switches as Record<string, string>).cite = '00000000' }, 'marking.switches.cite'],
      ['a switch of 7 codes', m => { (m.marking.switches as Record<string, string>)['\\cite'] = '2222000' }, 'marking.switches.\\\\cite'],
      ['a switch of a code 3', m => { (m.marking.switches as Record<string, string>)['\\cite'] = '22223000' }, 'marking.switches.\\\\cite'],
      ['a switch of 17 commands', m => { for (let i = 0; i < 17; i++) (m.marking.switches as Record<string, string>)[`\\c${'i'.repeat(i + 1)}te`] = '00000000' }, 'marking.switches'],
      ['no inkless key', m => { delete (m.marking as Partial<LayoutMarks['marking']>).inkless }, 'marking.inkless'],
      ['the inkless an object', m => { (m.marking as Record<string, unknown>).inkless = {} }, 'marking.inkless'],
      ['an inkless source twice', m => { (m.marking.inkless as string[])[1] = '\\rule{0pt}{2ex}' }, 'marking.inkless[1]'],
      ['an inkless source empty', m => { (m.marking.inkless as string[])[0] = '' }, 'marking.inkless[0]'],
      ['an inkless source of 201 code units', m => { (m.marking.inkless as string[])[0] = `\\x${'y'.repeat(199)}` }, 'marking.inkless[0]'],
      ['65 inkless sources', m => { m.marking.inkless = Array.from({ length: 65 }, (_, i) => `\\m${'i'.repeat(i + 1)}`) }, 'marking.inkless'],
      ['no texts key', m => { delete (m.marking as Partial<LayoutMarks['marking']>).texts }, 'marking.texts'],
      ['texts of an odd length', m => { (m.marking.texts as string[]).push('\\x') }, 'marking.texts'],
      ['texts in pairs, a level deeper than the file has', m => { (m.marking as Record<string, unknown>).texts = [['\\bert', 'BERT']] }, ''],
      ['a text source twice', m => { m.marking.texts = ['\\bert', 'BERT', '\\bert', 'B'] }, 'marking.texts[2]'],
      ['a text of a space', m => { m.marking.texts = ['\\bert', 'BE RT'] }, 'marking.texts[1]'],
      ['a text of 65 letters', m => { m.marking.texts = ['\\bert', 'B'.repeat(65)] }, 'marking.texts[1]'],
      ['65 texts', m => { m.marking.texts = Array.from({ length: 65 }, (_, i) => [`\\m${'i'.repeat(i + 1)}`, 'A']).flat() }, 'marking.texts'],
      ['chars not an array', m => { (m as Record<string, unknown>).chars = 'x2' }, 'chars'],
      ['a char of 33 code units', m => { m.chars[0] = 'x'.repeat(33) }, 'chars[0]'],
      ['a char that is a number', m => { (m.chars as unknown[])[1] = 2 }, 'chars[1]'],
      ['65,537 chars', m => { m.chars = Array.from({ length: 65_537 }, (_, i) => String(i)) }, 'chars'],
      ['a piece of 2,001 rules', m => { const e = nth(m.owned, 1); e.length = 3 + 5 * (e[2] as number); for (let r = 0; r < 2001; r++) e.push(1, 100, 702, 110, 702.4) }, 'owned[1]'],
      ['owned not an array', m => { (m as Record<string, unknown>).owned = {} }, 'owned'],
      ['an owned entry of one field', m => { (m.owned[2] as unknown[]).pop() }, 'owned[2]'],
      ['an owned name of no opening mark', m => { nth(m.owned, 1)[0] = 'p0.3b' }, 'owned[1][0]'],
      ['owned names not rising', m => { nth(m.owned, 2)[0] = 'n0.5a' }, 'owned[2][0]'],
      ['a how of no OWNED_HOW', m => { nth(m.owned, 2)[1] = OWNED_HOW.length }, 'owned[2][1]'],
      ['a piece not owned with glyphs', m => { (m.owned[2] as unknown[]).push(0) }, 'owned[2]'],
      ['an owned piece of no glyph count', m => { (m.owned[1] as unknown[]).length = 2 }, 'owned[1]'],
      ['a glyph count past its rows', m => { nth(m.owned, 1)[2] = 4 }, 'owned[1]'],
      ['a rule of four numbers', m => { (m.owned[1] as unknown[]).pop() }, 'owned[1]'],
      ['a glyph on page 3', m => { nth(m.owned, 1)[3] = 3 }, 'owned[1][3]'],
      ['a glyph 2 pt left of its view', m => { nth(m.owned, 1)[4] = -2 }, 'owned[1][4]'],
      ['a glyph of size 0', m => { nth(m.owned, 1)[6] = 0 }, 'owned[1][6]'],
      ['a glyph of size 201', m => { nth(m.owned, 1)[6] = 201 }, 'owned[1][6]'],
      ['a glyph of a char past chars', m => { nth(m.owned, 1)[7] = 4 }, 'owned[1][7]'],
      ['a rule right of its right edge', m => { nth(m.owned, 1)[14] = 111 }, 'owned[1][16]'],
      ['a rule off its page', m => { nth(m.owned, 1)[17] = 800 }, 'owned[1][17]'],
      ['pages 0', m => { m.pages = 0 }, 'pages'],
      ['pages 10,001', m => { m.pages = 10001 }, 'pages'],
      ['a missing key', m => { delete (m as Partial<LayoutMarks>).dropped }, 'dropped'],
      ['a key of no schema', m => { m.extra = 1 }, 'extra'],
      ['views of 4 × pages − 1 numbers', m => { m.views.pop() }, 'views'],
      ['a view with x0 = x1', m => { m.views[2] = 0 }, 'views[2]'],
      ['a coordinate 14,401', m => { m.views[2] = 14401 }, 'views[2]'],
      ['columns one short', m => { m.columns.pop() }, 'columns'],
      ['a column of 3', m => { m.columns[1] = 3 }, 'columns[1]'],
      ['a mark name p3a', m => { nth(m.marks, 4)[0] = 'p3a' }, 'marks[4][0]'],
      ['a mark of three fields', m => { (m.marks[1] as unknown[]).pop() }, 'marks[1]'],
      ['a mark on page pages + 1', m => { nth(m.marks, 6)[1] = 3 }, 'marks[6][1]'],
      ['a mark 2 pt outside its view', m => { nth(m.marks, 1)[2] = 614 }, 'marks[1][2]'],
      ['a mark 2 pt below its view', m => { nth(m.marks, 1)[3] = -2 }, 'marks[1][3]'],
      ['a name twice', m => { nth(m.marks, 5)[0] = '0e' }, 'marks[5][0]'],
      ['a dropped name no mark takes', m => { m.dropped[0] = 'axt-h4s' }, 'dropped[0]'],
      ['lines not rising', m => { nth(m.lines, 2)[0] = 2 }, 'lines[2][0]'],
      ['a line count of 2,001', m => { nth(m.lines, 0)[1] = 2001 }, 'lines[0][1]'],
      ['an empty word', m => { m.words[1] = '' }, 'words[1]'],
      ['a word of 201 code units', m => { m.words[1] = 'x'.repeat(201) }, 'words[1]'],
      ['tokens of stride 5', m => { m.tokens.pop() }, 'tokens'],
      ['a token on page 3', m => { m.tokens[6] = 3 }, 'tokens[6]'],
      ['a token 2 pt left of its view', m => { m.tokens[1] = -2 }, 'tokens[1]'],
      ['a token 2,001 high', m => { m.tokens[4] = 2001 }, 'tokens[4]'],
      ['a negative width', m => { m.tokens[3] = -1 }, 'tokens[3]'],
      ['a word index past words', m => { m.tokens[5] = 3 }, 'tokens[5]'],
      // -1: the rest of the word before, given in parts; never the first token's, nor another negative
      ['the first token a rest', m => { m.tokens[5] = -1 }, 'tokens[5]'],
      ['a word index of -2', m => { m.tokens[11] = -2 }, 'tokens[11]'],
      ['a string where a number goes', m => { (m.marks[0] as unknown[])[2] = '72' }, 'marks[0][2]'],
      ['an array where a number goes, a level deeper than the file has', m => { (m.marks[0] as unknown[])[2] = [72] }, ''],
    ]
    for (const [name, change, path] of rows) {
      const m = valid() as LayoutMarks & Record<string, unknown>
      change(m)
      expect(refusal(bytes(m)), name).toBe(path)
    }
    // a later token the rest of the word before
    const rest = valid()
    rest.tokens[11] = -1
    expect(refusal(bytes(rest))).toBeNull()
    // a number written 1e400 is Infinity once parsed
    expect(refusal(bytes(JSON.stringify(valid()).replace('"0s",1,72,700', '"0s",1,1e400,700')))).toBe('marks[0][2]')
    expect(refusal(bytes(JSON.stringify(valid()).replace('[0,0,612,792,0,0,612,792]', '[0,0,612,1e400,0,0,612,792]')))).toBe('views[3]')
    // not an object at all
    expect(refusal(bytes('[]'))).toBe('')
    // a key of no schema, 100,000 code units long, is told by its first 20
    const long = { ...valid(), [`k${'y'.repeat(100_000)}`]: 1 }
    expect(refusal(bytes(long))).toBe(`k${'y'.repeat(19)}`)
    // a piece of 20,001 glyphs, and a paper of more than OWNED_ALL owned glyphs and rules
    const piece = valid()
    piece.owned[1] = ['p0.3a', 0, 20_001, ...Array.from({ length: 20_001 }, () => [1, 100, 700, 10, 0]).flat()]
    expect(refusal(bytes(piece))).toBe('owned[1][2]')
    const paper = valid()
    paper.owned = Array.from({ length: Math.ceil(OWNED_ALL / 10_000) + 1 }, (_, i) => [`p${String(i).padStart(3, '0')}.1a`, 0, 10_000, ...Array.from({ length: 10_000 }, () => [1, 100, 700, 10, 0]).flat()])
    expect(refusal(bytes(paper))).toBe('owned')
    // within every bound: 300,000 words
    const many = valid()
    many.words = Array.from({ length: 300_000 }, (_, i) => `w${i}`)
    expect(refusal(bytes(many))).toBeNull()
    many.words.push('one more')
    expect(refusal(bytes(many))).toBe('words')
  })
})

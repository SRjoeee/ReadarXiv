import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SourceUnit } from '@/pdf-reader/engine/latex-front.mjs'
import type { UnitLines } from '@/pdf-reader/engine/tex-errors.mjs'
import { patch } from '@/pdf-reader/engine/latex-front.mjs'
import { LayoutRefusal } from '@/pdf-reader/engine/layout/json.mjs'
import type { LayoutMarks } from '@/pdf-reader/engine/layout/marks.mjs'
import { classOf, DISPLAY, encodeLayoutMarks, INVISIBLE, LAYOUT_CLASSES, LAYOUT_TEX, layoutMarking, layoutMarksOf, MARK_CLASSES, MARK_NAME, MARKS_CAP, MARKS_VALUES, parseLayoutMarks, FOLLOWERS, markProbeTex, PROBE_SCHEMA, probeRow, probeSamples, probeTex, readMarkProbe, readProbe, switchedOf } from '@/pdf-reader/engine/layout/marks.mjs'
import { openPaper, originalFiles, probeFiles } from '@/pdf-reader/engine/live.mjs'
import { marksOf } from '@/pdf-reader/engine/typeset/places.mjs'

// The layout marks as text: which placeholder gets which mark, the units' own marks, the TeX that goes with them, the
// marks file and its bounds. What the TeX does under TeX — that no line moves, that nothing written to a file changes —
// is checked natively by experiments/pdf-bilingual/spikes/layout-marks-cases.mjs

type Piece = { t: string; s?: string; src?: string; id?: number; unit?: unknown; pre?: string; post?: string }
const text = (s: string): Piece => ({ t: 'text', s })
const ph = (src: string): Piece => ({ t: 'ph', src })
const unit = (kind: string, pieces: Piece[], more: Partial<SourceUnit> = {}): SourceUnit => ({ kind, file: 'main.tex', start: 0, end: 0, pieces, ...more }) as SourceUnit
/** the i-th of a list, which the test knows is there */
const nth = <T>(xs: readonly T[], i: number): T => { const x = xs[i]; if (x === undefined) throw new Error(`no item ${i}`); return x }
const srcs = (u: SourceUnit | undefined) => ((u?.pieces ?? []) as Piece[]).map(p => (p.t === 'text' ? p.t : p.t === 'ph' ? `ph ${p.src}` : p.t))

afterEach(() => { vi.restoreAllMocks() })

describe('the classes', () => {
  it('classOf: each class by its source', () => {
    const cases: [string, string][] = [
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
      ['\\bert', 'macro'], ['\\bert{}', 'macro'], ['\\rule{1em}{1pt}', 'macro'], ['\\includegraphics[width=1em]{x}', 'macro'], ['\\refstepcounter{x}', 'macro'], ['\\citex@y', 'macro'],
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
    // nor after a number or a dimension, which takes the space after it as its end (2608.30640's \\looseness=-1)
    const num = layoutMarking([unit('para', [text('A.\n'), ph('\\looseness=-1'), text(' While '), ph('\\parskip=3pt plus 1pt'), text(' B '), ph('\\ref{x2}'), text(' C')])], MARK_CLASSES, { lines: false }).units[0]
    expect(srcs(num)).toEqual(['text', 'ph \\axtpma{p0.1a}', 'ph \\looseness=-1', 'text', 'ph \\axtpma{p0.3a}', 'ph \\parskip=3pt plus 1pt', 'text', 'ph \\axtpma{p0.5a}', 'ph \\ref{x2}', 'ph \\axtpm{p0.5b}', 'text'])
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
    // every box from the same state: the footnote counter as it was, biblatex's trackers reset
    expect(tex.match(/\\setbox\\axt@qbox/g)?.length).toBe((tex.match(/\\axt@qreset\\setbox\\axt@qbox/g) ?? []).length)
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
    const switches = { '\\cite': '22220010', '\\citet': '00000000' }
    expect(srcs(layoutMarking(units, MARK_CLASSES, { lines: false, switches }).units[0])).toEqual([
      'text', 'ph \\cite{c}', 'text', 'ph \\axtpma{p0.3a}', 'ph \\cite{d}', 'text', 'ph \\axtpma{p0.5a}', 'ph \\cite{e}', 'ph \\axtpm{p0.5b}', 'text',
      'ph \\axtpma{p0.7a}', 'ph \\citet{f}', 'ph \\axtpm{p0.7b}', 'text', 'ph \\axtpma{p0.9a}', 'ph \\ref{r}', 'ph \\axtpm{p0.9b}', 'text',
    ])
    // no answer: the marks as before
    expect(srcs(layoutMarking(units, MARK_CLASSES, { lines: false, switches: {} }).units[0])).toEqual(srcs(layoutMarking(units, MARK_CLASSES, { lines: false }).units[0]))
  })
  it('a footnote\'s call TeX answered for: both marks where they change nothing, none before what fnpct moves; two calls in a row each marked where a mark between them changes nothing', () => {
    const note = (s: string) => unit('footnote', [text(s)], { nested: true } as Partial<SourceUnit>)
    const a = note('One note.'), b = note('Two note.'), c = note('Three note.')
    const call = (n: SourceUnit) => ({ t: 'nested', pre: '\\footnote{', unit: n, post: '}' })
    const units = [a, b, c, unit('para', [text('A'), call(a), call(b), text(' and'), call(c), text('. D')])]
    const marked = (switches: Record<string, string>) => srcs(layoutMarking(units, MARK_CLASSES, { lines: false, switches }).units[3])
    // without an answer: C1, the opening mark alone, and nothing on the second call of two
    expect(marked({})).toEqual(['text', 'ph \\axtpma{n3.1a}', 'nested', 'nested', 'text', 'ph \\axtpma{n3.4a}', 'nested', 'text'])
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
    const v1 = decode(originalFiles(p, { lines: true, layout: MARK_CLASSES, switches: { '\\cite': '22220000' } }))
    expect(v1).toContain('A claim \\cite{k}. And \\axtpma{p0.3a}\\cite{j}\\axtpm{p0.3b} again')
    expect(decode(originalFiles(p, { lines: true, layout: MARK_CLASSES, switches: {} }))).toBe(decode(originalFiles(p, { lines: true, layout: MARK_CLASSES })))
    const t = paperOf(SOURCES.table)
    for (const lines of [false, true]) expect(sha(originalFiles(t, { lines, switches: { '\\cite': '22222222' } }).get('main.tex') as Uint8Array)).toBe(PIN.table?.[lines ? 'lines' : 'plain'])
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
  schema: 1, engine: 'pdflatex', pages: 2,
  views: [0, 0, 612, 792, 0, 0, 612, 792],
  columns: [1, 2],
  marks: [['0s', 1, 72, 700], ['0e', 1, 300.5, 650.25], ['c1-1', 1, 0, 0], ['c2-2', 2, 0, 0], ['p0.3a', 1, 100, 700], ['p0.3b', 1, 120.75, 700], ['h1s', 2, 72, 720], ['t2s', 2, 80, 500], ['n0.5a', 1, 200, 680], ['g1t', 2, 300, 400]],
  dropped: ['h4s'],
  lines: [[0, 3], [2, 1], [7, 12]],
  words: ['the', 'model', 'x'],
  tokens: [1, 72, 700, 15.5, 10, 0, 1, 90, 700, 25, 10, 1, 2, 72, 720, 6, 12, 2],
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
    expect(Object.keys(JSON.parse(encodeLayoutMarks(m)))).toEqual(['schema', 'engine', 'pages', 'views', 'columns', 'marks', 'dropped', 'lines', 'words', 'tokens'])
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
      ['schema 2', m => { m.schema = 2 as 1 }, 'schema'],
      ['engine context', m => { m.engine = 'context' }, 'engine'],
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
      ['a string where a number goes', m => { (m.marks[0] as unknown[])[2] = '72' }, 'marks[0][2]'],
      ['an array where a number goes, a level deeper than the file has', m => { (m.marks[0] as unknown[])[2] = [72] }, ''],
    ]
    for (const [name, change, path] of rows) {
      const m = valid() as LayoutMarks & Record<string, unknown>
      change(m)
      expect(refusal(bytes(m)), name).toBe(path)
    }
    // a number written 1e400 is Infinity once parsed
    expect(refusal(bytes(JSON.stringify(valid()).replace('"0s",1,72,700', '"0s",1,1e400,700')))).toBe('marks[0][2]')
    expect(refusal(bytes(JSON.stringify(valid()).replace('[0,0,612,792,0,0,612,792]', '[0,0,612,1e400,0,0,612,792]')))).toBe('views[3]')
    // not an object at all
    expect(refusal(bytes('[]'))).toBe('')
    // a key of no schema, 100,000 code units long, is told by its first 20
    const long = { ...valid(), [`k${'y'.repeat(100_000)}`]: 1 }
    expect(refusal(bytes(long))).toBe(`k${'y'.repeat(19)}`)
    // within every bound: 300,000 words
    const many = valid()
    many.words = Array.from({ length: 300_000 }, (_, i) => `w${i}`)
    expect(refusal(bytes(many))).toBeNull()
    many.words.push('one more')
    expect(refusal(bytes(many))).toBe('words')
  })
})

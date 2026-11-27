import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SourceUnit } from '../../packages/engine/src/source/latex-front.ts'
import type { UnitLines } from '../../packages/engine/src/compile/tex-errors.ts'
import { patch, type PhPiece, startOf, type TextPiece } from '../../packages/engine/src/source/latex-front.ts'
import { classOf, type CommandSample, colourPieceOf, readColours, INVISIBLE, LAYOUT_CLASSES, LAYOUT_TEX, layoutMarking, literalNames, MARK_CLASSES, MARK_NAME, NAME_MACROS, nameSection, NAMES_TEX, POINTS_TEX, UNMARK_CS, FOLLOWERS, INK_ANY, inkSamples, inkSection, leadSamples, markProbeTex, readInkProbe, readInkTexts, readNameProbe, readSkipProbe, skipSection, headEnd, probeRow, probeSamples, readMarkProbe, readProbe, probeTex, NAME_MARK_FILE, withoutNameMarks, refKeysOf, refsTex } from '../../packages/engine/src/marks/marks.ts'
import { DISPLAY } from '../../packages/engine/src/instrument/mt.ts'
import { NAME_ENGLISH } from '../../packages/engine/src/marks/names.ts'
import { symbolText, TEXT_SYMBOLS } from '../../packages/engine/src/source/text-symbols.ts'
import { NAME_KEYS } from '../../packages/engine/src/marks/names.ts'
import { openPaper, originalFiles, probeFiles } from '../../packages/engine/src/compile/live.ts'

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
    // an identifier the front end keeps (latex-front.mjs keepIdentifiers): no command, TeX sets its characters as written, a code
    // mark; an address with an underscore stays an address's
    for (const src of ['llm\\_equal\\_human', '[sentence\\_1]', '\\{root\\_question\\}', 'CallbackBase.host\\_label(result)', 'run\\textunderscore id'])
      expect(classOf({ t: 'ph', src }), src).toBe('code')
    for (const src of ['first\\_last@x.org', '\\_', '\\code{a\\_b}', 'conv1'])
      expect(classOf({ t: 'ph', src }), src).not.toBe('code')
    // a bibliography entry's number (latex-front.mjs keepNumbers): text of a digit and no letter, which reads nothing after it
    for (const src of ['1994.', '157--166,', '5(2):157--166', '(2017)', '10.1145/3786335.3813167']) expect(classOf({ t: 'ph', src }), src).toBe('number')
    for (const src of ['1994a', '\\natexlab{a}', '2$^{nd}$', '{2017}', '12~']) expect(classOf({ t: 'ph', src }), src).not.toBe('number')
    // a control word of the list followed by letters is another command
    expect(INVISIBLE.test('\\labelwidth')).toBe(false)
    expect(DISPLAY.test('\\begin{equationx}')).toBe(false)
    expect(MARK_CLASSES).toEqual(['math', 'display', 'cite', 'ref', 'eqref', 'code', 'url', 'footnote', 'macro', 'number'])
    expect(LAYOUT_CLASSES).toEqual(MARK_CLASSES)
  })
})

describe('layoutMarking', () => {
  const PARA = [text('A '), ph('$x$'), text(' and '), ph('\\bert'), text(' B '), ph('~'), ph('\\cite{c}'), text('.')]
  it('layoutMarking: two marks around a placeholder, one before a macro, none for the invisible', () => {
    const units = [unit('para', PARA.map(p => ({ ...p })))]
    const before = structuredClone(units)
    const { units: marked } = layoutMarking(units, MARK_CLASSES, { lines: false })
    expect(srcs(marked[0])).toEqual(['text', 'ph \\axtpmm{p0.1a}', 'ph $x$', 'ph \\axtpm{p0.1b}', 'text', 'ph \\axtpma{p0.3a}', 'ph \\bert', 'text', 'ph ~', 'ph \\axtpma{p0.6a}', 'ph \\cite{c}', 'ph \\axtpm{p0.6b}', 'text'])
    expect(units).toEqual(before)
    expect(marked[0]).not.toBe(units[0])
  })
  it("an inline formula's opening mark is \\axtpmm, set on the empty list; first after a display the carrier's \\axtpmd where TeX's display probe said it opens none (marks.ts carrySamples); a display's \\axtpma", () => {
    const u = unit('para', [text('the '), ph('\\[a=b\\]'), text('\n'), ph('$x$'), text(' and '), ph('\\(y\\)'), text(' or '), ph('\\ensuremath{z}'), text(' then '), ph('\\cite{k}')])
    const marked = layoutMarking([u], MARK_CLASSES, { lines: false, quiet: ['$x$'] }).units[0]
    expect(srcs(marked).filter(s => /axtpm[amd]/.test(s))).toEqual(['ph \\axtpma{p0.1a}', 'ph \\axtpmd{p0.3a}', 'ph \\axtpmm{p0.5a}', 'ph \\axtpmm{p0.7a}', 'ph \\axtpma{p0.9a}'])
    // (no answer of the probe: the formula's own \\axtpmm)
    expect(srcs(layoutMarking([u], MARK_CLASSES, { lines: false }).units[0]).filter(s => /axtpm[amd]/.test(s))[1]).toBe('ph \\axtpmm{p0.3a}')
    // LAYOUT_TEX's \\axt@pmm: \\axt@pma with no test of the empty list
    expect(LAYOUT_TEX).toContain('\\protected\\def\\axt@pmm{\\ifaxt@off\\expandafter\\@gobble\\else\\expandafter\\axt@pmn\\fi}')
    expect(LAYOUT_TEX).toContain('\\def\\axt@pmn{\\ifhmode\\expandafter\\axt@pmd\\else\\expandafter\\axt@pmv\\fi}')
    expect(LAYOUT_TEX).toContain('\\def\\axt@pmc{\\ifnum\\lastnodetype=-1 \\expandafter\\@gobble\\else\\expandafter\\axt@pmd\\fi}')
  })
  it('a class switched off is not marked', () => {
    const units = [unit('para', PARA)]
    const noCite = layoutMarking(units, MARK_CLASSES.filter(c => c !== 'cite'), { lines: false }).units[0]
    expect(srcs(noCite).some(s => s.includes('p0.6'))).toBe(false)
    expect(srcs(noCite)).toContain('ph \\axtpmm{p0.1a}')
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
    expect(srcs(marked[0])).toEqual(['text', 'ph \\axtpmm{p0.1a}', 'ph $y$', 'ph \\axtpm{p0.1b}', 'text'])
    expect(mark(note)).toEqual({ start: '\\leavevmode\\axtmark{0s}', end: '\\axtend{0e}', before: '\\axtlines{0}' })
    expect(mark(nth(marked, 0))).toEqual(mark(note))
    expect(nth(para.pieces as Piece[], 1).unit).toBe(note)
  })
  it('cells and headings get their own unit marks, a front heading too (ICML\'s \\icmltitle: 2610.22195v1 p1u0 had none)', () => {
    const units = [
      unit('cell', [text('Cell')]), unit('heading', [text('Method')]), unit('heading', [text('Front')], { front: true } as Partial<SourceUnit>),
      unit('figure', [text('Axis')]), unit('para', [text('Prose.')]), unit('heading', [text('A title')], { title: true } as Partial<SourceUnit>),
    ]
    for (const lines of [false, true]) {
      const { units: marked, mark } = layoutMarking(units, MARK_CLASSES, { lines })
      expect(mark(nth(units, 0))).toEqual({ start: '\\leavevmode\\axtmark{t0s}', end: '\\axtend{t0e}' })
      expect(mark(nth(units, 1))).toEqual({ start: '\\axthmark{h1s}', end: '\\axthmark{h1e}' })
      // (a class's command whose text it hands elsewhere too: the heading's marks set nothing in a running head, a PDF string or
      // a file, and none in a box TeX never ships — the gate, LAYOUT_TEX)
      expect(mark(nth(units, 2))).toEqual({ start: '\\axthmark{h2s}', end: '\\axthmark{h2e}' })
      expect(mark(nth(units, 3))).toBeNull()
      expect(mark(nth(units, 4))).toEqual({ start: '\\leavevmode\\axtmark{4s}', end: '\\axtend{4e}', ...(lines ? { before: '\\axtlines{4}' } : {}) })
      expect(mark(nth(units, 5))).toEqual({ start: '\\axthmark{h5s}', end: '\\axthmark{h5e}' })
      units.forEach((u, i) => { expect(mark(nth(marked, i))).toEqual(mark(u)) })
    }
  })
  it('marks ICML\'s \\icmltitle in the layout compile, in the argument the style sets as its title, measures in a box and hands to its running head and the PDF\'s title (2610.22195v1 p1u0)', () => {
    const enc = (s: string) => new TextEncoder().encode(s), dec = (b: Uint8Array | undefined) => new TextDecoder('latin1').decode(b)
    const tex = '\\documentclass{article}\n\\usepackage{icml2026}\n\\begin{document}\n\\twocolumn[\n\\icmltitle{HTN-Orchestrate: A Hierarchical Framework}\n\\icmlauthor{Jane Doe}{x}\n]\nBody words.\n\\end{document}\n'
    const sty = '\\long\\def\\icmltitle#1{\\ifx\\undefined\\@icmltitlerunning\\gdef\\@icmltitlerunning{#1}\\fi\\hypersetup{pdftitle={#1}}\\global\\setbox\\titrun=\\vbox{\\small\\bf\\@icmltitlerunning}{\\center\\toptitlebar{\\Large\\bf #1}\\bottomtitlebar}}\n\\newcommand{\\icmlauthor}[2]{\\mbox{#1}}\n'
    const p = openPaper(new Map([['main.tex', enc(tex)], ['icml2026.sty', enc(sty)]]))
    expect(p.units[0]).toMatchObject({ kind: 'heading', title: true, front: true })
    expect(dec(originalFiles(p, { lines: true, layout: LAYOUT_CLASSES }).get('main.tex'))).toContain('\\icmltitle{\\axthmark{h0s}HTN-Orchestrate: A Hierarchical Framework\\axthmark{h0e}}')
    // (the translation's own marks none: markUnits leaves a front unit out, and the style sets the translated title where it likes)
    expect(dec(originalFiles(p, { lines: true }).get('main.tex'))).toContain('\\icmltitle{HTN-Orchestrate: A Hierarchical Framework}')
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
    expect(srcs(marked[0])).toEqual(['ph \\cline{1-2}', 'text', 'ph \\axtpmm{p0.2a}', 'ph $x$', 'ph \\axtpm{p0.2b}'])
    expect(srcs(marked[1])).toEqual(['ph \\mc{2}{x}', 'text'])
    // (a paper's macro at the head, passed over, has its head point: \\axthpk, which no table row reaches)
    expect(srcs(marked[2])).toEqual(['ph \\noindent', 'ph \\axthpk{p2.1a}', 'ph \\para{Head}', 'text', 'ph \\axtpma{p2.3a}', 'ph \\cite{a}', 'ph \\axtpm{p2.3b}'])
    expect(srcs(marked[3])).toEqual(['ph \\axtpmm{p3.0a}', 'ph $x$', 'ph \\axtpm{p3.0b}', 'text'])
    expect(srcs(marked[4])).toEqual(['ph \\axtpma{p4.0a}', 'ph \\bert', 'text'])
    expect(srcs(marked[5])).toEqual(srcs(units[5]))
    expect(srcs(marked[6])).toEqual(['nested', 'text', 'ph \\axtpmm{p6.2a}', 'ph $z$', 'ph \\axtpm{p6.2b}'])
    // as patch writes them: each opening mark at or after its unit's start mark, or right before it
    const project = { main: 'main.tex', units: marked, files: new Map([['main.tex', '']]) }
    for (const [i, u] of marked.entries()) {
      const out = new TextDecoder().decode(patch({ ...project, units: [u], files: new Map([['main.tex', 'x'.repeat(10)]]) } as never, new Map(), { mark: v => mark(v) }).get('main.tex'))
      const start = mark(nth(units, i))?.start
      if (!start) continue
      const at = out.indexOf(start)
      const opening = [...out.matchAll(/\\axtpm[am]\{[^}]*\}/g)]
      for (const o of opening) expect(o.index >= at || o.index + o[0].length === at, `${i}: ${out}`).toBe(true)
    }
  })
  it('states a paper\'s macro\'s span where it has no mark of its own: at a unit\'s head \\axthpk, after its last text \\axttg', () => {
    // (1810.04805v2's `\\bert is conceptually simple`: \\bert at the head, passed over, its ink before the start mark; its
    // opening point \\axthpk, the start mark its closing one. 2610.19159v1's `Tool Output\\trajectoryMark{}}`: glued to the
    // word before, after the end mark; \\axttg, a point after the group it stands in. None in a cell, where a mark before the
    // head would stand before \\multicolumn's \\omit, none for a macro TeX said sets no ink, none past a prefix)
    const units = [
      unit('para', [ph('\\bert'), text(' is conceptually simple.')]),
      unit('para', [text('Tool Output'), ph('\\trajectoryMark{}')]),
      unit('cell', [ph('\\mc{2}{x}'), text(' cell')]),
      unit('para', [ph('\\none'), text(' word and'), ph('\\none')]),
      unit('heading', [ph('\\sys'), text(' Showcases')]),
      // (none between two of the paper's pieces where the first may read the second: a .bbl's `\\urldef\\tempurl\\url{…}`, whose
      // \\urldef defines the next token, 2608.25210v2; a head macro after `\\pagestyle{…}`)
      unit('reference', [text('Title. Volume'), ph('\\showISSN{1}'), ph('\\urldef'), ph('\\tempurl')]),
      unit('para', [ph('\\pagestyle{x}'), text('\n'), ph('\\bert'), text(' is.')]),
    ]
    const { units: marked, mark } = layoutMarking(units, MARK_CLASSES, { lines: false, inkless: ['\\none'] })
    expect(srcs(marked[0])).toEqual(['ph \\axthpk{p0.0a}', 'ph \\bert', 'text'])
    expect(srcs(marked[1])).toEqual(['text', 'ph \\axttg{p1.1g}', 'ph \\trajectoryMark{}'])
    expect(srcs(marked[2])).toEqual(['ph \\mc{2}{x}', 'text'])
    expect(srcs(marked[3])).toEqual(srcs(units[3]))
    expect(srcs(marked[4])).toEqual(['ph \\axthpk{p4.0a}', 'ph \\sys', 'text'])
    expect(srcs(marked[5])).toEqual(['text', 'ph \\axttg{p5.1g}', 'ph \\showISSN{1}', 'ph \\urldef', 'ph \\tempurl'])
    expect(srcs(marked[6])).toEqual(['ph \\axthpk{p6.0a}', 'ph \\pagestyle{x}', 'text', 'ph \\bert', 'text'])
    // (as patch writes them: the head's point before the start mark, the trailing one after the end mark)
    const write = (u: SourceUnit) => new TextDecoder().decode(patch({ main: 'main.tex', units: [u], files: new Map([['main.tex', 'x'.repeat(10)]]) } as never, new Map(), { mark: v => mark(v) }).get('main.tex'))
    expect(write(nth(marked, 0))).toContain('\\axthpk{p0.0a}\\bert \\leavevmode\\axtmark{0s}is')
    expect(write(nth(marked, 1))).toContain('Tool Output\\axtend{1e}\\axttg{p1.1g}\\trajectoryMark{}')
  })
  it('marks nothing between a prefix and the command it applies to: \\protect\\eqref is marked as one, before its \\protect', () => {
    // a mark between them would take the \\protect, and be written as itself to a file (2608.23586's list of figures); before
    // the pair it is the pair's (rules/tex-kernel.mjs PREFIX_WORDS)
    const { units: marked } = layoutMarking([unit('para', [text('A (Eq.~'), ph('\\protect'), ph('\\eqref{e}'), text(') and '), ph('\\noexpand'), text(' '), ph('$x$'), text(' then '), ph('$y$')])], MARK_CLASSES, { lines: false })
    // (\\noexpand itself is a paper's macro to the classes, marked before it as any)
    expect(srcs(marked[0])).toEqual(['text', 'ph \\axtpma{p0.2a}', 'ph \\protect', 'ph \\eqref{e}', 'ph \\axtpm{p0.2b}', 'text', 'ph \\axtpma{p0.4a}', 'ph \\noexpand', 'text', 'ph $x$', 'text', 'ph \\axtpmm{p0.8a}', 'ph $y$', 'ph \\axtpm{p0.8b}'])
  })
  it('marks no macro inside a word behind a prefix either: Giessenbachstra\\protect\\ss e', () => {
    // (the word before the prefix is the macro's neighbour: \\protect is transparent, and the guard looks past it as the marks do)
    const { units: marked } = layoutMarking([unit('para', [text('In Giessenbachstra'), ph('\\protect'), ph('\\ss'), text(' e, the end')])], MARK_CLASSES, { lines: false })
    expect(srcs(marked[0])).toEqual(['text', 'ph \\protect', 'ph \\ss', 'text'])
  })
  it('marks no macro inside a word', () => {
    // a letter command or an accent glued to the word's letters (Giessenbachstra\\ss e, 2608.15334): a mark there would
    // part the word, its hyphenation and its kerns; a citation, a formula, a reference begin with no letter of the word
    const { units: marked } = layoutMarking([unit('para', [text('In Giessenbachstra'), ph('\\ss'), text(' e, the '), ph('\\foo{x}'), text('ing and'), ph('\\cite{a}'), text(' then '), ph('\\foo{y}'), text(' end')])], MARK_CLASSES, { lines: false })
    expect(srcs(marked[0])).toEqual(['text', 'ph \\ss', 'text', 'ph \\axtpma{p0.3a}', 'ph \\foo{x}', 'text', 'ph \\axtpma{p0.5a}', 'ph \\cite{a}', 'ph \\axtpm{p0.5b}', 'text', 'ph \\axtpma{p0.7a}', 'ph \\foo{y}', 'text'])
  })
  it('marks a superscript or a box glued to a word, whose opening mark sets itself in a box (BOXY), but not past a prefix', () => {
    // (an author's affiliations, 2610.21924v1 u1: `Ruiya Zhou\\textsuperscript{1} \\quad`; TeX hyphenates no word a box or a
    // formula follows, and LAYOUT_TEX's \\axt@boxy boxes the mark before \\textsuperscript and \\mbox as before a formula. Behind
    // \\protect, \\axt@boxy would see the prefix: no mark, as for any macro glued to a word)
    const { units: marked } = layoutMarking([unit('para', [text('Ruiya Zhou'), ph('\\textsuperscript{1}'), text(' and Li Wei'), ph('\\mbox{$^2$}'), text(', Ann'), ph('\\protect'), ph('\\textsuperscript{3}'), text(' end')])], MARK_CLASSES, { lines: false })
    expect(srcs(marked[0])).toEqual(['text', 'ph \\axtpma{p0.1a}', 'ph \\textsuperscript{1}', 'text', 'ph \\axtpma{p0.3a}', 'ph \\mbox{$^2$}', 'text', 'ph \\protect', 'ph \\textsuperscript{3}', 'text'])
  })
  it('a paper\'s macro and a footnote\'s call get the opening mark only, and the piece right after them none', () => {
    // a macro looks past its argument (\\xspace, \\@ifnextchar[, \\@esphack's \\ignorespaces after \\todo, \\nocite,
    // \\marginpar), and fnpct's \\footnote for the punctuation after it: a mark there, or the next piece's opening mark, is
    // what it would see. A source that ends in a control symbol gets the opening mark only too; LaTeX's \\) reads nothing
    const note = { t: 'nested' as const, pre: '\\footnote{', unit: unit('footnote', [text('x')]), post: '}' }
    const { units: marked } = layoutMarking([unit('para', [text('A '), ph('\\code{X}'), text(' is '), ph('\\code{a}'), note, text(' and '), ph('\\opt{b}'), text(' '), ph('$x$'), text(' then '), note, ph('\\cite{c}'), text(', '), ph('$y$\\%'), text(' or '), ph('\\(z\\)'), text('.')])], MARK_CLASSES, { lines: false })
    expect(srcs(marked[0])).toEqual(['text', 'ph \\axtpma{p0.1a}', 'ph \\code{X}', 'text', 'ph \\axtpma{p0.3a}', 'ph \\code{a}', 'nested', 'text', 'ph \\axtpma{p0.6a}', 'ph \\opt{b}', 'text', 'ph $x$', 'text', 'ph \\axtpma{n0.10a}', 'nested', 'ph \\cite{c}', 'text', 'ph \\axtpmm{p0.13a}', 'ph $y$\\%', 'text', 'ph \\axtpmm{p0.15a}', 'ph \\(z\\)', 'ph \\axtpm{p0.15b}', 'text'])
  })
  it('after a forced break, which may begin a table\'s row, passes over the commands before the next word', () => {
    // aastex's deluxetable: rows the scanner does not read as cells, \\ between them, \enddata after the last
    const rows = unit('para', [text('Polarization '), ph('&'), text(' Right '), ph('\\\\'), text('\n'), ph('$\\theta$'), text(' (peak) '), ph('&'), text(' x '), ph('\\\\'), text('\n'), ph('\\cline{1-2}'), text(' Wave '), ph('\\cite{a}'), ph('\\\\'), text('\n'), ph('\\enddata')])
    const { units: marked } = layoutMarking([rows], MARK_CLASSES, { lines: false })
    // (the piece passed over after the last row's `\\` has its opening point before the break, at the end of the row's last cell,
    // where nothing of the row's start is: \enddata's; \cline, a kernel command of no class, none)
    expect(srcs(marked[0])).toEqual(['text', 'ph &', 'text', 'ph \\\\', 'text', 'ph \\axtpmm{p0.5a}', 'ph $\\theta$', 'ph \\axtpm{p0.5b}', 'text', 'ph &', 'text', 'ph \\\\', 'text', 'ph \\cline{1-2}', 'text', 'ph \\axtpma{p0.13a}', 'ph \\cite{a}', 'ph \\axtpm{p0.13b}', 'ph \\axtpma{p0.16a}', 'ph \\\\', 'text', 'ph \\enddata'])
  })
  it('gives a placeholder after a forced break its opening point before the break, where nothing stands between the break and it', () => {
    // (a placeholder the marking passes over after `\\` (passedOver: a table's row may begin there, read as prose) had no point
    // at all: 2608.25210v2 u143's algorithm lines. Its opening point goes before the break, set as \axtpma sets one, so that the
    // break's look-ahead, a row's first token, TeX's discarding at the new line's start and the vertical mode after a centred
    // line's `\\` are the original's)
    const after = unit('para', [text('Reference Format:'), ph('\\\\'), text('\n'), ph('\\names'), text(' and the title.')])
    expect(srcs(layoutMarking([after], MARK_CLASSES, { lines: false }).units[0])).toEqual(['text', 'ph \\axtpma{p0.3a}', 'ph \\\\', 'text', 'ph \\names', 'text'])
    // (a placeholder the marking gives its opening point after the break today, glued to the word after it, keeps it there)
    const glued = unit('para', [text('Reference Format:'), ph('\\\\'), text('\n'), ph('\\vldbauthors'), text('. ')])
    expect(srcs(layoutMarking([glued], MARK_CLASSES, { lines: false }).units[0])).toEqual(['text', 'ph \\\\', 'text', 'ph \\axtpma{p0.3a}', 'ph \\vldbauthors', 'text'])
    // (a run of breaks: before its first)
    const run = unit('para', [text('Line one'), ph('\\\\'), text('\n'), ph('\\\\[4pt]'), text('\n'), ph('\\foo'), text(' two')])
    expect(srcs(layoutMarking([run], MARK_CLASSES, { lines: false }).units[0])).toEqual(['text', 'ph \\axtpma{p0.5a}', 'ph \\\\', 'text', 'ph \\\\[4pt]', 'text', 'ph \\foo', 'text'])
    // (nothing before the break in the unit, its head: none, as today; nor after an alignment's tab, where it would stand before
    // the tab)
    const head = unit('para', [ph('\\\\'), text('\n'), ph('\\foo'), text(' two')])
    // (\\axthpk's, the head's paper macro's point, as today)
    expect(srcs(layoutMarking([head], MARK_CLASSES, { lines: false }).units[0])).toEqual(['ph \\\\', 'text', 'ph \\axthpk{p0.2a}', 'ph \\foo', 'text'])
    const tab = unit('para', [text('a '), ph('&'), text(' '), ph('\\foo'), text(' b')])
    expect(srcs(layoutMarking([tab], MARK_CLASSES, { lines: false }).units[0])).toEqual(['text', 'ph &', 'text', 'ph \\foo', 'text'])
  })
  it('after a cell\'s tab the same: tabularray\'s \\SetCell must open its cell', () => {
    // a tblr table read as one paragraph (2608.03994): \\SetCell[c=4]{c} after an opening mark spanned no columns
    const row = unit('para', [ph('\\textbf{Model}'), ph('&'), text(' '), ph('\\SetCell[c=4]{c}'), text(' Slopes '), ph('&'), text(' '), ph('$x$'), ph('\\\\')])
    const { units: marked } = layoutMarking([row], MARK_CLASSES, { lines: false })
    expect(srcs(marked[0])).toEqual(['ph \\textbf{Model}', 'ph &', 'text', 'ph \\SetCell[c=4]{c}', 'text', 'ph &', 'text', 'ph \\axtpmm{p0.7a}', 'ph $x$', 'ph \\axtpm{p0.7b}', 'ph \\\\'])
  })
  it('an identifier gets both marks, a code mark’s, whatever follows it: a forced break, another element (2608.25210v2 p3, 2610.22195v1)', () => {
    // (as a paper's macro it had its opening mark alone, its end told by the text after it: a forced break or another element
    // after it told none, its glyphs were read as the unit's text and the unit was left unlocated, "text past its source". It
    // reads nothing after it; one that ends in a text symbol, `\}`, after which TeX skips no space, keeps its closing mark too)
    const { units: marked } = layoutMarking([unit('para', [text('A\n'), ph('\\{root\\_question\\}'), ph('\\\\[4pt]'), text('\n'), ph('llm\\_equal\\_human'), text(': Are '), ph('[sentence\\_1]'), ph('$x$')])], MARK_CLASSES, { lines: false })
    // (its opening mark \axthpk's: in vertical mode, where a box's paragraph opens with it (2608.25210v2 p3's \mypython box,
    // \small\ttfamily then `llm\_equal\_human`), \axtpma waits for the next mark, its closing one, and the element was empty;
    // \axthpk begins the paragraph before a character as TeX would, and sets its point there)
    expect(srcs(marked[0])).toEqual(['text', 'ph \\axthpk{p0.1a}', 'ph \\{root\\_question\\}', 'ph \\axtpm{p0.1b}', 'ph \\\\[4pt]', 'text', 'ph \\axthpk{p0.4a}', 'ph llm\\_equal\\_human', 'ph \\axtpm{p0.4b}', 'text', 'ph \\axthpk{p0.6a}', 'ph [sentence\\_1]', 'ph \\axtpm{p0.6b}', 'ph \\axtpmm{p0.7a}', 'ph $x$', 'ph \\axtpm{p0.7b}'])
  })
  it('an identifier opening a unit is its first word: the unit\'s start mark before it, no head passed over past it', () => {
    expect(startOf([ph('\\noindent'), ph('llm\\_equal\\_human'), text(': Are')] as never)).toEqual([1, -1])
    expect(headEnd([ph('\\noindent'), ph('llm\\_equal\\_human'), text(': Are')] as never, 0)).toBe(1)
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
    expect(srcs(atEnd)).toEqual(['text', 'ph \\axtpma{p0.1a}', 'ph \\cite{x}\n', 'text', 'ph \\axtpmm{p0.3a}', 'ph $y$', 'ph \\axtpm{p0.3b}'])
  })
})

// three sources: typeset-tex.test.ts's, one with a table and a footnote, one with a heading and displays
const SOURCES = {
  plain: '\\documentclass{article}\\begin{document}\n\\section{Method}\nThe first paragraph of prose.\n\nThe second paragraph of prose.\n\\begin{figure}\\caption{A caption.}\\end{figure}\n\\end{document}\n',
  table: '\\documentclass{article}\n\\begin{document}\nA paragraph with a note\\footnote{The note\'s own text, with $y$.} and a citation \\cite{k} and Fig.~\\ref{t}.\n\n\\begin{table}\\centering\n\\begin{tabular}{lc}\n\\hline\nName & Value $x$ \\\\\n\\cline{1-2}\nFirst cell & \\texttt{code} \\\\\n\\end{tabular}\n\\caption{The table\'s caption.}\\label{t}\n\\end{table}\n\\end{document}\n',
  display: '\\documentclass{article}\n\\newcommand\\bert{BERT}\n\\begin{document}\n\\section{The $x$ model}\nWe set \\bert{} as\n\\[ a = b \\]\nfor every $n$, see \\eqref{e} and \\url{https://x.org}.\n\\begin{equation}\\label{e} c = d \\end{equation}\n\\end{document}\n',
}
/** originalFiles' main.tex at 3cb5a733 (the pin), SHA-256, recorded before the layout option was added; with the line probes
 *  (`lines`), LINES_TEX's as it states each paragraph's \parskip too (the borrowing ruling of 2026-11-08) */
const PIN: Record<string, { plain: string; lines: string }> = {
  plain: { plain: '0b6fe69122e06d17b3d9716a34dbaa1d87ac0596b0b70fee4dfbed6f5f696a2e', lines: '4e4fd26b8effb203ad1d83110e1a3b54da39bd8a346091ece3acf98ed15fa03a' },
  table: { plain: '3d2f67c0fe4d6b2bd8adcea768bbb2b018b02d5b9650c73427612dc86ee2bdfe', lines: '9ed40c4269744cbeb22cdf89922b176f2c0412b0f11303d0f78356662bf4f686' },
  display: { plain: 'f521d7df749a560de860e34b2df4b428e48cb91d6e9e0e9d09ba9d25a2c1390d', lines: '908d0b0776ae045c42080edb85ad94f779e9eb23e7c6f2304f99a85c877e6a68' },
}
const paperOf = (src: string) => openPaper(new Map([['main.tex', new TextEncoder().encode(src)]]))
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const decode = (files: Map<string, Uint8Array>) => new TextDecoder().decode(files.get('main.tex'))

describe("IEEEtran's proof name, \\IEEEproofname, wrapped as babel's \\proofname where the paper calls IEEEproof", () => {
  // (2610.21504v1 p4: IEEEtran's \IEEEproof sets "Proof:" through \IEEEproofname, the class's own name for a proof, which the
  // names' wrapper did not know (NAME_MACROS: babel's \proofname): the name was read as the paragraph's number label and stayed
  // English on both panes, where ieeecolor's `\def\proof{… Proof: }` is a literal the wrapper knows, drawn in the target)
  const enc = (s: string) => new TextEncoder().encode(s), dec = (b: Uint8Array | undefined) => new TextDecoder('latin1').decode(b)
  const paper = (body: string) => openPaper(new Map([['main.tex', enc(`\\documentclass[conference]{IEEEtran}\n\\begin{document}\n${body}\n\\end{document}\n`)]]))
  const WRAP = '\\axt@nmwrap{proof}{IEEEproofname}'
  it('wraps it in the layout compile and the probe of a paper that calls IEEEproof, on the head\'s own line', () => {
    const p = paper('Words before.\n\\begin{IEEEproof}\nSince the costs are positive, it holds.\n\\end{IEEEproof}')
    const main = dec(originalFiles(p, { lines: true, layout: LAYOUT_CLASSES }).get('main.tex'))
    expect(main).toContain(WRAP)
    // (no line of the paper moves: the wrap stands on LAYOUT_TEX's line, as NAMES_OFF does)
    const plain = dec(originalFiles(p, { lines: true, layout: LAYOUT_CLASSES, names: false }).get('main.tex'))
    expect(plain).not.toContain(WRAP)
    expect(main.split('\n').length).toBe(plain.split('\n').length)
    expect(dec(probeFiles(p, { marks: true }).get('main.tex'))).toContain(WRAP)
  })
  it("leaves a paper that does not call it as before: one that only names it in a comment, or none", () => {
    for (const body of ['Words.', 'Words.\n% \\begin{IEEEproof} kept for later\nMore words.']) {
      expect(dec(originalFiles(paper(body), { lines: true, layout: LAYOUT_CLASSES }).get('main.tex'))).not.toContain(WRAP)
      expect(dec(probeFiles(paper(body), { marks: true }).get('main.tex'))).not.toContain(WRAP)
    }
  })
})

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
        // (and what the layout compile asks TeX about the paper's references at its end, on the same line: refsTex)
        const refs = refsTex(refKeysOf(paperOf(src).units))
        const out = marked.replace(LAYOUT_TEX, '').replace(refs, '').replace(/\\axtpm[am]\{[^}]*\}|\\axtpm\{[^}]*\}|\\axthmark\{[^}]*\}|\\leavevmode\\axtmark\{t\d+s\}|\\axtend\{t\d+e\}/g, '')
        // (the layout compile's line probe past the spaces a \\begin skips, `pastBegin`, which the live path's original leaves as
        // it was: the pin)
        expect(out, name).toBe(decode(originalFiles(paperOf(src), { lines, pastBegin: true })))
      }
    }
    // not vacuously: the sources hold every kind of mark
    const all = Object.values(SOURCES).map(src => decode(originalFiles(paperOf(src), { lines: true, layout: MARK_CLASSES }))).join('\n')
    for (const m of ['\\axtpma{p', '\\axtpmm{p', '\\axtpm{p', '\\axtpma{n', '\\axthmark{h', '\\leavevmode\\axtmark{t', '\\axtend{t', '\\def\\axt@rfall{']) expect(all).toContain(m)
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
    const tex = markProbeTex([{ src: '\\cite{a}', call: false } as CommandSample, { src: '\\footnote{A note.}', call: true } as CommandSample])
    expect(tex.match(/\\typeout\{LAYOUT-PROBE 1 punct \d+ \\axt@qo\}/g)).toEqual(['\\typeout{LAYOUT-PROBE 1 punct 0 \\axt@qo}', '\\typeout{LAYOUT-PROBE 1 punct 1 \\axt@qo}'])
    // one document of sections, each a group of its own, after the definition of what closes the groups a sample left open
    expect(tex).toMatch(/^\\makeatletter\\gdef\\axt@unwind\{[^\n]*?\\axt@unwound\}\\begingroup/)
    expect(probeTex(['A', 'B'])).toBe('\\makeatletterA\nB\\makeatother\n')
    for (const f of ['.', ',', ';', ':', '!', '?']) {
      expect(tex).toContain(`\\hbox{way \\cite{a}${f} \\unskip`)
      expect(tex).toContain(`\\hbox{way \\cite{a}{}${f} \\unskip`)
      expect(tex).toContain(`\\hbox{way \\axtpma{q0a}\\cite{a}\\axtpm{q0b}${f} \\unskip`)
      expect(tex).toContain(`\\hbox{way \\axtpma{q0a}\\cite{a}${f} \\unskip`)
      // (and where the command looks at the mark, the pair with a word after it, as set and with its closing mark after the mark)
      expect(tex).toContain(`\\hbox{way \\cite{a}${f} x \\unskip`)
      expect(tex).toContain(`\\hbox{way \\axtpma{q0a}\\cite{a}${f}\\axtpm{q0b} x \\unskip`)
    }
    expect(tex).toContain('\\hbox{way \\cite{a} x \\unskip')
    expect(tex).toContain('\\hbox{way \\footnote{A note.}\\axtpma{q1c}\\footnote{A note.} \\unskip')
    expect(tex.match(/\\noindent\\par/g)).toHaveLength(2)
    // every box set into a register voided first, from the same state (the footnote counter as it was, biblatex's
    // trackers reset), saying at its last statement whether it closed where it was meant to
    const boxes = (tex.match(/\\hbox\{way /g) ?? []).length
    expect(boxes).toBe(2 * 7 * 4 + 2 * 6 * 2 + 2)
    expect((tex.match(/\\global\\setbox\\axt@qbox\\box\\voidb@x\\gdef\\axt@qn\{\}\\axt@qreset\\xdef\\axt@level\{\\the\\currentgrouplevel\}\\setbox\\axt@qbox\\hbox\{way /g) ?? []).length).toBe(boxes)
    expect((tex.match(/\\xdef\\axt@qn\{\\the\\lastnodetype\\ifinner\\ifhmode\/in\\fi\\fi\}/g) ?? []).length).toBe(boxes)
    // a row before each box, for the errors TeX logs in it
    expect(tex.match(/\\typeout\{LAYOUT-PROBE 1 punct-at \d+ \d+ [a-emp]\}/g)).toHaveLength(boxes)
    expect(tex).toContain('\\global\\c@footnote=\\axt@qfn')
    expect(tex).toContain('\\ifdefined\\citereset\\citereset\\fi')
    // it writes nothing to a file and no line the run takes for a reading
    expect(tex).not.toMatch(/\\write|\\immediate|AXT-/)
    expect(FOLLOWERS).toEqual(['.', ',', ';', ':', '!', '?', 'word', 'call'])
  })
  it('probeFiles with `marks`: the marks\' TeX first and the probe after \\begin{document}; without it the bytes as before', () => {
    const p = paperIn('A claim \\cite{a}. Note\\footnote{The note.}.', '\\usepackage{cite}')
    const text = (m: Map<string, Uint8Array>) => new TextDecoder().decode(m.get('main.tex'))
    expect(text(probeFiles(p, { marks: false }))).toBe(text(probeFiles(p)))
    expect(text(probeFiles(p))).not.toContain('LAYOUT-PROBE')
    const on = text(probeFiles(p, { marks: true }))
    expect(on.indexOf(LAYOUT_TEX)).toBeGreaterThan(0)
    expect(on.indexOf(LAYOUT_TEX)).toBeLessThan(on.indexOf('\\documentclass'))
    expect(on.indexOf('LAYOUT-PROBE 1 punct 0')).toBeGreaterThan(on.lastIndexOf('\\begin{document}'))
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
  // (held here since lane c1-rewrites: the probe's rows and the switch through the moved marks alone, without today's reading,
  // layout/marks.mjs switchedOf and askedCommands, which the cut-over deletes)
  it('readProbe: the rows of every section, tagged; a line of another marker is no row; readMarkProbe takes its own and no other (the moved marks\' probe rows)', () => {
    expect(probeRow('punct', 3, '\\axt@qo')).toBe('\\typeout{LAYOUT-PROBE 1 punct 3 \\axt@qo}')
    const log = 'LAYOUT-PROBE 1 punct 0 00000000\nLAYOUT-PROBE 1 role 4 display\nother line\nLAYOUT-PROBE 2 punct 1 22222222\nLAYOUT-PROBE 1 punct 1 22222200\nLAYOUT-PROBE 1 punct 2 2200000\nLAYOUT-PROBE 1 punct 7 22222222\nLAYOUT-PROBE 1 punct 0\n'
    expect(readProbe(log).map(r => [r.tag, r.fields.join(' ')])).toEqual([['punct', '0 00000000'], ['role', '4 display'], ['punct', '1 22222200'], ['punct', '2 2200000'], ['punct', '7 22222222'], ['punct', '0']])
    const samples = [{ command: '\\cite' }, { command: '\\autocite' }, { command: '\\footnote' }] as CommandSample[]
    // a line of another marker, a section of another tag, a code cut short, a sample the probe has not: no answer
    expect(readMarkProbe(log, samples)).toEqual({ '\\cite': '00000000', '\\autocite': '22222200' })
    // an error TeX logged in a box answers nothing: in the box as the paper sets it, no answer (x); with the opening
    // mark, no mark (2); with both marks alone, no closing mark (1, REVTeX's citeautoscript); one before any row is no
    // box's
    const errs = ['! Early.', 'LAYOUT-PROBE 1 punct-at 0 4 a', '! Missing \\endcsname inserted.', 'l.12 ...', 'LAYOUT-PROBE 1 punct-at 0 5 c', './main.tex:12: Extra }, or forgotten $.', 'LAYOUT-PROBE 1 punct-at 0 5 d', 'LAYOUT-PROBE 1 punct-at 0 6 c', '! Argument of \\super@cite@swap has an extra }.', 'LAYOUT-PROBE 1 punct-at 0 6 d', 'LAYOUT-PROBE 1 punct-at 0 2 d', '! Undefined.', 'LAYOUT-PROBE 1 punct 0 00000000'].join('\n')
    expect(readMarkProbe(errs, samples)).toEqual({ '\\cite': '0020x110' })
  })
  it('originalFiles passes `switches` on; without `layout` it changes no byte (the moved compile\'s marked files)', () => {
    const p = paperOf('\\documentclass{article}\n\\begin{document}\nA claim \\cite{k}. And \\cite{j} again, see \\ref{t}.\n\\end{document}\n')
    const v1 = decode(originalFiles(p, { lines: true, layout: MARK_CLASSES, switches: { '\\cite': '22220000', '\\ref': '00000000' } }))
    expect(v1).toContain('A claim \\cite{k}. And \\axtpma{p0.3a}\\cite{j}\\axtpm{p0.3b} again')
    expect(decode(originalFiles(p, { lines: true, layout: MARK_CLASSES, switches: null }))).toBe(decode(originalFiles(p, { lines: true, layout: MARK_CLASSES })))
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
    expect(tex).toContain('\\global\\setbox\\axt@ibox\\box\\voidb@x\\xdef\\axt@level{\\the\\currentgrouplevel}\\setbox\\axt@ibox\\hbox{\\rule{0pt}{2ex}}\\axt@unwind')
    expect(tex).toContain('\\showboxbreadth=100000 \\showboxdepth=100000 \\tracingonline=0 \\showbox\\axt@ibox')
    expect(tex.match(/\\noindent\\par/g)).toHaveLength(2)
    expect(tex).not.toMatch(/\\write|\\immediate|AXT-/)
    // after the punctuation section, in the same document
    const doc = markProbeTex([{ src: '\\cite{a}', call: false } as CommandSample], ['\\bert{}'])
    expect(doc.indexOf('punct 0')).toBeLessThan(doc.indexOf('ink-at 0'))
    expect(markProbeTex([{ src: '\\cite{a}', call: false } as CommandSample])).not.toContain('ink-at')
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
  it('readInkTexts: a box of characters a text spells, at any depth, is its text; anything else no answer', () => {
    // 1810.04805's own listings (TeX Live 2026's pdfTeX): \newcommand\bert{BERT\xspace}, and \bertbase's subscript in
    // small capitals inside math
    const log = [
      'LAYOUT-PROBE 1 ink-at 0', '> \\box75=', '\\hbox(7.31458+0.0)x27.33098', '.\\OT1/ptm/m/n/10.95 B', '.\\OT1/ptm/m/n/10.95 E', '.\\OT1/ptm/m/n/10.95 R', '.\\kern-0.657', '.\\OT1/ptm/m/n/10.95 T', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 0',
      'LAYOUT-PROBE 1 ink-at 1', '> \\box75=', '\\hbox(7.31458+1.76027)x49.59885', '.\\OT1/ptm/m/n/10.95 B', '.\\OT1/ptm/m/n/10.95 E', '.\\OT1/ptm/m/n/10.95 R', '.\\kern-0.657', '.\\OT1/ptm/m/n/10.95 T', '.\\mathon', '.\\hbox(5.43198+0.09995)x22.26787, shifted 1.66032', '..\\OT1/ptm/m/sc/8 B', '..\\kern-0.27998', '..\\OT1/ptm/m/sc/8 A', '..\\OT1/ptm/m/sc/8 S', '..\\OT1/ptm/m/sc/8 E', '.\\mathoff', '', './main.tex:9: OK.', 'LAYOUT-PROBE 1 ink-end 1',
      // a ligature, a space
      'LAYOUT-PROBE 1 ink-at 2', '> \\box75=', '\\hbox(6.9+0.0)x40.0', '.\\T1/cmr/m/n/10 ^^\\ (ligature ffi)', '.\\T1/cmr/m/n/10 x', '.\\glue 3.33 plus 1.66', '.\\T1/cmr/m/n/10 2', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 2',
      // a math italic letter (OML's letters are ASCII's), a per cent sign (one of ASCII's punctuation every text font sets as it),
      // a rule, an error, nothing at all, a cut listing
      'LAYOUT-PROBE 1 ink-at 3', '> \\box75=', '\\hbox(4.3+0.0)x5.7', '.\\mathon', '.\\OML/cmm/m/it/10 x', '.\\mathoff', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 3',
      'LAYOUT-PROBE 1 ink-at 4', '> \\box75=', '\\hbox(6.8+0.1)x8.3', '.\\OT1/ptm/m/n/10 %', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 4',
      'LAYOUT-PROBE 1 ink-at 5', '> \\box75=', '\\hbox(6.8+0.0)x10.0', '.\\OT1/ptm/m/n/10 A', '.\\rule(0.4+0.0)x3.0', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 5',
      'LAYOUT-PROBE 1 ink-at 6', '! Undefined control sequence.', '> \\box75=', '\\hbox(6.8+0.0)x5.0', '.\\OT1/ptm/m/n/10 A', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 6',
      'LAYOUT-PROBE 1 ink-at 7', '> \\box75=', '\\hbox(0.0+0.0)x0.0', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 7',
      'LAYOUT-PROBE 1 ink-at 8', '> \\box75=', '\\hbox(6.8+0.0)x5.0', '.\\OT1/ptm/m/n/10 A',
    ].join('\n')
    const samples = ['\\bert', '\\bertbase', '\\office', '\\x', '\\pct', '\\boxed', '\\broken', '\\nothing', '\\cut']
    expect(readInkTexts(log, samples)).toEqual([['\\bert', 'BERT'], ['\\bertbase', 'BERTBASE'], ['\\office', 'ffix2'], ['\\x', 'x'], ['\\pct', '%']])
    expect(readInkTexts('', samples)).toEqual([])
    // 65 letters: past INK_TEXT_MAX, no answer
    const long = ['LAYOUT-PROBE 1 ink-at 0', '> \\box75=', '\\hbox(6.8+0.0)x325.0', ...Array.from({ length: 65 }, () => '.\\OT1/ptm/m/n/10 A'), '', '! OK.', 'LAYOUT-PROBE 1 ink-end 0'].join('\n')
    expect(readInkTexts(long, ['\\long'])).toEqual([])
  })
  it('readInkTexts: what TeX sets for a cell\'s lead, as it sets it — a number\'s groups, \\texttt\'s characters, a formula\'s glyphs (MARKS_SCHEMA 10)', () => {
    // TeX Live 2025's pdfTeX listings of the leads 2610.21098v1 p13 and 2610.21176v1 p13 left English: \\CompletionTokenCap{} =
    // 1{,}024 in Times; a cell's \\texttt{max\\_tokens} in T1's Courier (its underscore a character); \\dprime{} = $d'$, a math
    // italic d and cmsy's prime raised
    const listing = (i: number, ...nodes: string[]) => [`LAYOUT-PROBE 1 ink-at ${i}`, '> \\box60=', '\\hbox(7.4+1.6)x24.6', ...nodes, '', '! OK.', `LAYOUT-PROBE 1 ink-end ${i}`]
    const t1 = (font: string, s: string) => [...s].map(c => `.\\T1/${font}/m/n/10.95 ${c}`)
    const log = [
      ...listing(0, ...t1('ptm', '1,024')),
      ...listing(1, ...t1('pcr', 'max_tokens')),
      ...listing(2, '.\\mathon', '.\\OML/cmm/m/it/10 d', '.\\hbox(3.8889+0.0)x2.80556, shifted -3.62892', '..\\OMS/cmsy/m/n/7 0', '.\\mathoff'),
      // $1{,}024$: its digits the text font's, its comma math italic's (TeX prints it `;`): one glyph whatever its text
      ...listing(3, '.\\mathon', '.\\OT1/cmr/m/n/10 1', '.\\OML/cmm/m/it/10 ;', '.\\OT1/cmr/m/n/10 0', '.\\OT1/cmr/m/n/10 2', '.\\OT1/cmr/m/n/10 4', '.\\mathoff'),
      // OT1's \\_ is a rule, and its character 0x5F a dot accent: no answer
      ...listing(4, '.\\OT1/cmtt/m/n/10 m', '.\\kern0.6', '.\\vbox(0.4+0.0)x3.0', '..\\rule(0.4+0.0)x3.0', '.\\OT1/cmtt/m/n/10 t'),
      ...listing(5, '.\\OT1/cmr/m/n/10 a', '.\\OT1/cmr/m/n/10 _'),
      // a formula's glyphs alone ($\\checkmark$), a \\ref the probe cannot resolve ("??": no aux), a dingbat outside a formula
      ...listing(6, '.\\hbox(6.9+0.0)x8.3', '..\\mathon', '..\\U/msa/m/n/10 X', '..\\mathoff'),
      ...listing(7, ...t1('ptm', 'Figure'), '.\\glue 2.7 plus 1.4', '.\\T1/ptm/b/n/10.95 ?', '.\\T1/ptm/b/n/10.95 ?'),
      ...listing(8, '.\\U/pzd/m/n/10 3'),
      // a formula TeX's listing never closes is no answer either
      ...listing(9, '.\\mathon', '.\\OML/cmm/m/it/10 d'),
    ].join('\n')
    const samples = ['\\CompletionTokenCap{}', '\\texttt{max\\_tokens}', '\\dprime{}', '\\cap{}', '\\texttt{m\\_t}', '\\dot', '\\checkmark', '\\figref{a}', '\\cmark', '\\open']
    expect(readInkTexts(log, samples)).toEqual([['\\CompletionTokenCap{}', '1,024'], ['\\texttt{max\\_tokens}', 'max_tokens'], ['\\dprime{}', `d${INK_ANY}`], ['\\cap{}', `1${INK_ANY}024`]])
  })
  it("readInkTexts: XeTeX's listing, a word of a font of its own one node, is the word's characters (2611.03178v1's \\system{})", () => {
    // TeX Live 2025's XeTeX listings: \\newcommand{\\system}{\\textsc{CoworkOS}} in XCharter's small capitals through fontspec,
    // one native word and the kerns after it; a word of two faces, two nodes; a word with a character of no text encoding's ASCII
    // (XeTeX prints it as it is), and one of a math face, no answer
    const listing = (i: number, ...nodes: string[]) => [`LAYOUT-PROBE 1 ink-at ${i}`, '> \\box104=', '\\hbox(7.224+0.16798)x52.164', ...nodes, '', '! OK.', `LAYOUT-PROBE 1 ink-end ${i}`]
    const log = [
      ...listing(0, '.\\TU/XCharter(0)/m/sc/10.5 CoworkOS', '.\\kern 0.0', '.\\kern -0.0002', '.\\kern 0.0002'),
      ...listing(1, '.\\TU/lmr/b/n/10 GPT', '.\\TU/lmr/m/n/10 -4o', '.\\glue 3.33 plus 1.66 minus 1.11', '.\\TU/lmr/m/n/10 mini'),
      ...listing(2, '.\\TU/lmr/m/n/10 Ab', '.\\TU/lmr/m/n/10 café'),
      ...listing(3, '.\\mathon', '.\\TU/latinmodern-math.otf(1)/m/n/10 ab', '.\\mathoff'),
    ].join('\n')
    expect(readInkTexts(log, ['\\system{}', '\\gpt', '\\cafe', '\\ab'])).toEqual([['\\system{}', 'CoworkOS'], ['\\gpt', 'GPT-4omini']])
  })
  it('leadSamples: the placeholders at a unit\'s head the ink section does not ask about — inline code, a macro past INK_BUDGET —, asked last', () => {
    const paper = paperIn('\\begin{tabular}{ll}\nCap parameter & \\texttt{max\\_tokens} on Chat routes \\\\\nBudget & \\EpisodeTokenBudget{} tokens \\\\\n\\end{tabular}\n\nWe set \\texttt{inline} in prose.', '\\newcommand{\\EpisodeTokenBudget}{128{,}000}')
    const ink = inkSamples(paper.units), leads = leadSamples(paper.units, ink)
    // (the macro is among the paper's macros already; the code that leads a cell is a lead, the code inside prose none)
    expect(ink).toEqual(['\\EpisodeTokenBudget{}'])
    expect(leads).toEqual(['\\texttt{max\\_tokens}'])
    // past the 64 macros of before, a macro that leads a unit is asked as any other, no lead
    const many = paperIn(`${Array.from({ length: 64 }, (_, i) => `Text \\m${'i'.repeat(i + 1)}{} here.`).join('\n\n')}\n\n\\lead{} opens this paragraph.`, `${Array.from({ length: 64 }, (_, i) => `\\newcommand{\\m${'i'.repeat(i + 1)}}{A}`).join('\n')}\n\\newcommand{\\lead}{B}`)
    expect(inkSamples(many.units)).toHaveLength(65)
    expect(inkSamples(many.units)).toContain('\\lead{}')
    expect(leadSamples(many.units)).toEqual([])
    // asked after every other section, numbered on from the macros; with no lead, the document the probe had
    const samples = [{ src: '\\cite{a}', call: false } as CommandSample]
    const doc = markProbeTex(samples, ink, leads)
    expect(doc.indexOf('ink-at 1')).toBeGreaterThan(doc.indexOf('skip'))
    expect(doc).toContain('\\hbox{\\texttt{max\\_tokens}}')
    expect(markProbeTex(samples, ink, [])).toBe(markProbeTex(samples, ink))
    expect(inkSection(['\\x'], 3)).toContain('LAYOUT-PROBE 1 ink-at 3')
  })
  it('headEnd: a unit\'s head before its start mark, as patch places it', () => {
    const ph = (src: string): PhPiece => ({ t: 'ph', src }), text = (s: string): TextPiece => ({ t: 'text', s })
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
    // robust in every expansion (themselves, unexpanded, where LaTeX does not typeset), and taken out of LaTeX's writes
    for (const name of ['axtpma', 'axtpm', 'axthmark']) expect(LAYOUT_TEX).toContain(`\\else\\noexpand\\${name}\\fi}`)
    expect(LAYOUT_TEX).toContain('\\let\\axthmark\\@gobble')
    expect(LAYOUT_TEX).toContain('\\let\\protected@write\\axt@pwa')
    // MARK_DEF's own mark gated too
    expect(LAYOUT_TEX).toMatch(/\\protected\\def\\axtmark#1\{[^}]*\\ifaxt@off/)
    for (const word of ['\\typeout', '\\wlog', '\\newcount', '\\newdimen', '\\newskip']) expect(LAYOUT_TEX).not.toContain(word)
    // five messages alone, a unit's alignment once its paragraph ended or at its end mark (AXT-ALIGN, layout-align.test.ts), a
    // cell's column class at its template's end (AXT-CELL, the engine's readAlign), for a cell's own unit and for each unit on the
    // cell's line, and a colour piece's fill (AXT-COLOUR, readColours), and one write to the log at the shipout, each bracketed
    // body's frame (AXT-BODY, readBodies): each a line of its own, which no reader of the log but theirs reads, and nothing
    // typeset changes
    expect(LAYOUT_TEX.match(/\\message/g)).toHaveLength(5)
    // (and two to the aux at once, what the displays POINTS_TEX states were, read back by the next pass)
    expect(LAYOUT_TEX.match(/\\write/g)).toHaveLength(3)
    expect(LAYOUT_TEX.match(/\\immediate\\write\\@auxout/g)).toHaveLength(2)
    expect(LAYOUT_TEX).toContain('\\write-1{AXT-BODY ')
    expect(LAYOUT_TEX.match(/AXT-[A-Z]+/g)).toEqual(['AXT-ALIGN', 'AXT-ALIGN', 'AXT-CELL', 'AXT-CELL', 'AXT-COLOUR', 'AXT-BODY'])
    // one line, no comment: the paper's lines keep their numbers in the log
    expect(LAYOUT_TEX).not.toContain('\n')
    expect(LAYOUT_TEX).not.toContain('%')
  })
  // \axt@unmark: the regex takes a mark and its argument out of a title's copy, and a prefilter keeps it from running on a
  // list that holds none of the five (unmark-finding: 4.36 s of the thesis's layout compile, a miss costing 3 ms a run)
  it('withoutNameMarks: a babel name\'s marks and their arguments out, every other mark kept (it can have an effect where the paper reads its file back)', () => {
    for (const m of ['\\axtnma{abstract}', '\\axtnmb {abstract}', '\\protect \\axtnma {contentsname}', '\\protect\\axtnmb{contentsname}'])
      expect(withoutNameMarks(`a${m}b`), m).toBe('ab')
    expect(withoutNameMarks('\\protect \\axtnma {abstract}Abstract\\protect \\axtnmb {abstract} here\n')).toBe('Abstract here\n')
    // the unit, piece and heading marks stay: a file the paper writes and reads back is another file with them in it
    for (const m of ['\\axtmark{12s}', '\\axtend{12e}', '\\axtpma{p1.2a}', '\\axtpm {p1.2b}', '\\axthmark{h3s}']) expect(withoutNameMarks(`a${m}b`), m).toBe(`a${m}b`)
    expect(withoutNameMarks('\\axtnma{x}{keep}\\axtnmarker{x}')).toBe('{keep}\\axtnmarker{x}')
    // and only in the aux and the lists \@starttoc reads
    for (const f of ['main.aux', 'main.toc', 'main.lof', 'main.lot', 'main.loa', 'sub/chap.aux']) expect(NAME_MARK_FILE.test(f), f).toBe(true)
    for (const f of ['main.xmpdata', 'comment.cut', 'main.tex', 'main.abs', 'main.bbl', 'main.out', 'main.log']) expect(NAME_MARK_FILE.test(f), f).toBe(false)
  })

  it('\\axt@unmark: the regex is the one that never reaches across a group, built from UNMARK_CS', () => {
    expect(UNMARK_CS).toEqual(['axtpma', 'axtpmm', 'axtpm', 'axthpk', 'axttg', 'axthmark', 'axtnma', 'axtnmb'])
    expect(new Set(UNMARK_CS).size).toBe(UNMARK_CS.length)
    // `\c[^BE]` tests the next item only and `*` repeats it: any run of tokens but a brace, so a match ends at its own argument
    expect(LAYOUT_TEX).toContain('\\regex_const:Nn\\c__axt_marks_regex{\\c{axtpma|axtpmm|axtpm|axthpk|axttg|axthmark|axtnma|axtnmb}\\cB.\\c[^BE].*\\cE.}')
    expect(LAYOUT_TEX).toContain('\\cB.\\c[^BE].*\\cE.}')
    expect(LAYOUT_TEX).not.toContain('.*?')
    expect(LAYOUT_TEX.split('\\regex_const:Nn\\c__axt_marks_regex').length).toBe(2)
    expect(LAYOUT_TEX.split('\\cs_new_protected:Npn\\axt@unmark#1').length).toBe(2)
  })
  it('\\axt@unmark: the prefilter looks for the names the regex takes, each once, and the regex runs only on a hit', () => {
    const alternation = /\\c\{([^{}]*)\}\\cB\./.exec(LAYOUT_TEX)?.[1]?.split('|')
    const prefilter = [...LAYOUT_TEX.matchAll(/\\str_if_in:NnT#1\{\\([A-Za-z@]+)\}\{\\bool_gset_true:N\\g__axt_unmark_bool\}/g)].map(m => m[1])
    expect(alternation).toEqual([...UNMARK_CS])
    expect(prefilter).toEqual([...UNMARK_CS])
    // a list the memory holds is set to what the regex made of it; else the escape character is the backslash while the
    // names are looked for, in a group the regex runs outside of (its assignment stays where \axt@unmark was called), and
    // the regex runs only if the flag was set, its list and result kept in the memory
    const def = LAYOUT_TEX.slice(LAYOUT_TEX.indexOf('\\cs_new_protected:Npn\\axt@unmark#1'), LAYOUT_TEX.indexOf('\\ExplSyntaxOff', LAYOUT_TEX.indexOf('\\cs_new_protected:Npn\\axt@unmark#1')))
    expect(def.startsWith('\\cs_new_protected:Npn\\axt@unmark#1{\\tl_if_eq:NNTF#1\\g__axt_unmark_in_tl{\\tl_set_eq:NN#1\\g__axt_unmark_out_tl}{\\group_begin:\\int_set:Nn\\tex_escapechar:D{92}\\bool_gset_false:N\\g__axt_unmark_bool')).toBe(true)
    expect(def.endsWith('\\group_end:\\bool_if:NT\\g__axt_unmark_bool{\\tl_gset_eq:NN\\g__axt_unmark_in_tl#1\\regex_replace_all:NnN\\c__axt_marks_regex{}#1\\tl_gset_eq:NN\\g__axt_unmark_out_tl#1}}}')).toBe(true)
    expect(def.split('\\regex_replace_all').length).toBe(2)
    // every name is a mark LAYOUT_TEX or the names define, and the three the placeholders and headings carry are the ones the text holds
    for (const name of UNMARK_CS) expect(`${LAYOUT_TEX}`, name).toContain(`\\def\\${name}{`)
    const text = Object.values(SOURCES).map(src => decode(originalFiles(paperOf(src), { lines: true, layout: MARK_CLASSES })).replace(LAYOUT_TEX, '')).join('\n')
    const used = new Set([...text.matchAll(/\\(axt(?:pma|pm|hmark|nma|nmb))\{/g)].map(m => m[1]))
    expect([...used].sort()).toEqual(['axthmark', 'axtpm', 'axtpma'])
    for (const name of used) expect(UNMARK_CS, name).toContain(name)
  })
  it('\\axt@unmark: no mark name has a brace in it, so a match cannot end early or run on', () => {
    // MARK_NAME takes no brace anywhere in a name, whatever the name would be
    for (const name of ['12s', 'c2-7', 'h0s', 'p3.14a', 'g9t', 'n1.ref.s']) {
      expect(MARK_NAME.test(name), name).toBe(true)
      for (const at of [0, 1, name.length - 1, name.length]) for (const brace of ['{', '}']) expect(MARK_NAME.test(name.slice(0, at) + brace + name.slice(at)), `${name} + ${brace} at ${at}`).toBe(false)
    }
    // the name of every mark argument the marked originals hold, and every babel key
    const text = Object.values(SOURCES).map(src => decode(originalFiles(paperOf(src), { lines: true, layout: MARK_CLASSES })).replace(LAYOUT_TEX, '')).join('\n')
    const args = [...text.matchAll(/\\axt(?:pma|pm|hmark)\{([^}]*)\}/g)].map(m => m[1] as string)
    expect(args.length).toBeGreaterThan(10)
    for (const arg of args) expect(MARK_NAME.test(arg), arg).toBe(true)
    for (const key of NAME_KEYS) expect(key, key).toMatch(/^[a-z]{1,16}$/)
  })
  it('LAYOUT_TEX sets a point where TeX begins a front matter environment, the author block\'s end (2610.20967v1)', () => {
    // (`fm<n>`: armed at the environment's before hook from \begin{document} on, set at the start of the next paragraph TeX
    // begins, never a node of the main vertical list, from which TeX takes nothing back and whose \lastskip \addvspace reads
    // (1706.03762v7: "You can't use \unpenalty in vertical mode"); disarmed where \maketitle runs first: an abstract a class keeps
    // for its title block)
    for (const env of ['abstract', 'keywords', 'IEEEkeywords'])
      expect(POINTS_TEX).toContain(`\\AddToHook{env/${env}/before}{\\axt@fmarm}`)
    expect(POINTS_TEX).toContain('\\def\\axt@fmarm{\\ifhmode\\axt@fmpt\\else\\global\\axt@fmwaittrue\\fi}')
    expect(POINTS_TEX).toContain('\\AddToHook{cmd/maketitle/before}{\\global\\axt@fmwaitfalse}')
    expect(POINTS_TEX).toContain('\\AddToHook{para/begin}{\\ifaxt@fmwait\\global\\axt@fmwaitfalse\\axt@fmpt\\fi}')
    expect(POINTS_TEX).not.toContain('\\axt@point{fm\\axt@fm}\\axt@vback')
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
    expect(POINTS_TEX).toContain('\\AddToHook{cmd/@makecol/before}{\\ifvoid\\@cclv\\else\\axt@bump\\begingroup\\boxmaxdepth\\dp\\@cclv\\global\\setbox\\@cclv\\vbox to\\ht\\@cclv{\\axt@point{bs\\axt@bn}\\axt@body{\\if@twocolumn\\if@firstcolumn1\\else2\\fi\\else0\\fi}\\penalty\\@M\\unvbox\\@cclv\\let\\axt@vback\\@empty\\axt@vtake\\axt@point{be\\axt@bn}\\axt@vback}\\endgroup\\global\\axt@bodiedtrue\\fi}')
    // a page shipped with no column's body bracketed (a class whose output routine makes its columns without \@makecol:
    // revtex4-2's ltxgrid): its text block, \@outputbox at \@outputpage, bracketed as the body is, a vertical box or a
    // horizontal one (two columns side by side); the flag cleared at each page
    expect(POINTS_TEX).toContain('\\AddToHook{cmd/@outputpage/before}{\\ifaxt@bodied\\else\\ifvoid\\@outputbox\\else\\axt@bump\\begingroup\\ifvbox\\@outputbox\\boxmaxdepth\\dp\\@outputbox\\global\\setbox\\@outputbox\\vbox to\\ht\\@outputbox{\\axt@point{bs\\axt@bn}\\axt@body{0}\\penalty\\@M\\unvbox\\@outputbox\\let\\axt@vback\\@empty\\axt@vtake\\axt@point{be\\axt@bn}\\axt@vback}\\else\\global\\setbox\\@outputbox\\hbox to\\wd\\@outputbox{\\axt@point{bs\\axt@bn}\\axt@body{0}\\unhbox\\@outputbox\\axt@point{be\\axt@bn}}\\fi\\endgroup\\fi\\fi\\global\\axt@bodiedfalse}')
    // and beside each body's opening point, before its \penalty10000, the body's statement (AXT-BODY: which column it is, its
    // \columnwidth and \textwidth, where TeX shipped its box's left edge): a saved position and a \write delayed to the
    // shipout, to the log alone, in every engine's primitives (zref-savepos's), none where an engine has none
    expect(POINTS_TEX).toContain('\\ifdefined\\pdflastxpos\\def\\axt@savepos{\\pdfsavepos}\\def\\axt@lastx{\\the\\pdflastxpos}\\else\\ifdefined\\lastxpos\\def\\axt@savepos{\\savepos}\\def\\axt@lastx{\\the\\lastxpos}\\else\\let\\axt@savepos\\relax\\let\\axt@lastx\\@empty\\fi\\fi')
    // (and the depth of the text block's bottom under the page's top edge, as LaTeX's \@outputpage ships it: TeX's text block
    // bottom, the borrowing ruling's foot, 2026-11-08; a dimension, the same in every engine)
    expect(POINTS_TEX).toContain('\\def\\axt@body#1{\\axt@savepos\\edef\\axt@bw{\\noexpand\\write-1{AXT-BODY \\axt@bn\\space#1 \\the\\columnwidth\\space\\the\\textwidth\\space\\noexpand\\axt@lastx\\space\\the\\dimexpr1in+\\voffset+\\topmargin+\\headheight+\\headsep+\\textheight\\relax}}\\axt@bw}')
    expect(POINTS_TEX.indexOf('\\def\\axt@body#1')).toBeLessThan(POINTS_TEX.indexOf('cmd/@makecol/before'))
    expect(POINTS_TEX).toContain('\\def\\axt@vtake{\\ifcase\\numexpr\\lastnodetype-10\\relax\\or\\expandafter\\axt@vtg\\or\\expandafter\\axt@vtk\\or\\expandafter\\axt@vtp\\fi}')
    // a float's points around its finished box (\@endfloatbox closes it): at its start a point would give its first
    // paragraph a \parskip (2608.01890's figures)
    expect(POINTS_TEX).toContain('\\def\\@endfloatbox{\\axt@efb\\ifvoid\\@currbox\\else\\axt@bump\\begingroup\\boxmaxdepth\\dp\\@currbox\\global\\setbox\\@currbox\\vbox to\\ht\\@currbox{\\axt@point{fs\\axt@bn}\\axt@fnpt\\unvbox\\@currbox\\axt@point{fe\\axt@bn}}\\endgroup\\fi}')
    // (and beside its opening point, inside its box, `fn<n>` where its type has no counter: no \caption can number it, so it is
    // no figure, table or algorithm — NeurIPS's noticebox; \@captype is the float's own there)
    expect(POINTS_TEX).toContain('\\def\\axt@fnpt{\\ifdefined\\@captype\\ifcsname c@\\@captype\\endcsname\\else\\axt@point{fn\\axt@bn}\\fi\\fi}')
    expect(POINTS_TEX).not.toContain('@floatboxreset')
    // after the destination's own definition, inside LAYOUT_TEX; its count a macro, no register; one line
    expect(LAYOUT_TEX.indexOf(POINTS_TEX)).toBeGreaterThan(LAYOUT_TEX.indexOf('\\def\\axt@dest#1'))
    expect(LAYOUT_TEX.endsWith(`${POINTS_TEX}\\makeatother`)).toBe(true)
    for (const word of ['\\newcount', '\\newbox', '\\newdimen', '\\typeout', '\n', '%']) expect(POINTS_TEX).not.toContain(word)
  })

  it('LAYOUT_TEX sets a point before a caption\'s label where TeX sets it: each caption maker hands its original the label with it', () => {
    // (the label is \fnum@<type>, an argument of every caption maker: LaTeX's and every class's \@makecaption #1, longtable's
    // \LT@makecaption #2, float.sty's styles #1, algorithm2e's \algocf@captiontext #1. Each, once the document begins, passes the
    // original its label with `\axt@kf` before it: nothing assigned or expanded before the original runs, the label's own tokens
    // and parameters as they were)
    const at = POINTS_TEX.indexOf('\\AddToHook{begindocument/end}{\\ifdefined\\@makecaption')
    expect(at).toBeGreaterThan(0)
    const hook = POINTS_TEX.slice(at)
    expect(POINTS_TEX).toContain('\\long\\def\\axt@kmcw#1#2{\\axt@kmc{\\axt@kf#1}{#2}}')
    expect(hook).toContain('\\ifdefined\\@makecaption\\let\\axt@kmc\\@makecaption\\let\\@makecaption\\axt@kmcw\\fi')
    expect(hook).toContain('\\let\\axt@klt\\LT@makecaption\\long\\def\\LT@makecaption#1#2#3{\\axt@klt#1{\\axt@kf#2}{#3}}')
    expect(hook).toContain('\\let\\axt@kfp\\floatc@plain\\long\\def\\floatc@plain#1#2{\\axt@kfp{\\axt@kf#1}{#2}}')
    expect(hook).toContain('\\let\\axt@kfr\\floatc@ruled\\long\\def\\floatc@ruled#1#2{\\axt@kfr{\\axt@kf#1}{#2}}')
    expect(hook).toContain('\\let\\axt@kac\\algocf@captiontext\\long\\def\\algocf@captiontext#1#2{\\axt@kac{\\axt@kf#1}{#2}}')
    expect(hook).toContain('\\let\\axt@kcc\\caption@@make\\long\\def\\caption@@make#1#2{\\axt@kcc{\\axt@kf#1}{#2}}')
    // (a class that sets its caption maker inside its float's environment, after the document began: Elsevier's cas-common sets
    // \@makecaption to its figure's or its table's own at the environment's start, 2610.21084v1's 21 captions. Each float, as
    // it begins (\@xfloat, every float's and every class's way in, its arguments passed on untouched), hands that maker its label
    // the same way, in the float's own group: an assignment, no node, nothing where the maker is already a wrapper)
    expect(POINTS_TEX).toContain('\\long\\def\\axt@kmfw#1#2{\\axt@kmf{\\axt@kf#1}{#2}}')
    expect(POINTS_TEX).toContain('\\def\\axt@kmfr{\\ifdefined\\@makecaption\\ifx\\@makecaption\\axt@kmcw\\else\\ifx\\@makecaption\\axt@kmfw\\else\\let\\axt@kmf\\@makecaption\\let\\@makecaption\\axt@kmfw\\fi\\fi\\fi}')
    expect(hook).toContain('\\ifdefined\\@xfloat\\let\\axt@kxf\\@xfloat\\def\\@xfloat{\\axt@kmfr\\axt@kxf}\\fi')
    expect(POINTS_TEX.slice(POINTS_TEX.indexOf('\\def\\axt@kmfr'))).not.toMatch(/^[^}]*axt@point/)
    // (typeset only: nothing in a moving argument or a file; never while the gate is off; in vertical mode, at the paragraph
    // the label begins, once)
    expect(POINTS_TEX).toContain('\\def\\axt@kf{\\ifx\\protect\\@typeset@protect\\axt@ka\\fi}')
    expect(POINTS_TEX).toContain('\\protected\\def\\axt@ka{\\ifaxt@off\\else\\ifhmode\\axt@kpt\\else\\ifvmode\\ifdefined\\AddToHookNext\\ifaxt@kwait\\else\\global\\axt@kwaittrue\\AddToHookNext{para/begin}{\\axt@klate}\\fi\\fi\\fi\\fi\\fi}')
    expect(POINTS_TEX).toContain('\\def\\axt@kpt{\\xdef\\axt@kn{\\the\\numexpr\\axt@kn+1\\relax}\\axt@point{ka\\axt@kn}}')
  })
})

describe('the displays (POINTS_TEX): every display TeX sets stated, wherever it stands', () => {
  // (2608.08481v1 p7: displays (7) and (8) in REVTeX's widetext, no source unit's, were cut into ink units and their text-face parts
  // translated. TeX enters display math for each, an equation's, an align's, \\[ \\]'s or $$'s alike: the start is set from
  // there, by TeX's own state, never by an environment's name; the end where the source ends the display, $$ aside)
  it('opens each display with a point at its math list’s start and closes it inside its formula, at its environment’s end or \\]', () => {
    expect(POINTS_TEX).toContain('\\fi\\gdef\\axt@dpcl{}\\xdef\\axt@dpn{\\the\\numexpr\\axt@dpn+1}')
    expect(POINTS_TEX).toContain('\\xdef\\axt@dpcl{\\axt@dpn}\\xdef\\axt@dpce{\\@currenvir}\\axt@dpend')
    // (no node after its box: whatever TeX sets there is in the page's list, where a column's \lastbox reads it. REVTeX's
    // balance takes each column's last box to leave its depth out, revtex4.cls's \setbox\z@\lastbox: a point after a display
    // at a column's foot moved the columns above 2608.08481v1 p7's widetext by up to 2.55 pt. Its end is set in the formula's
    // own list, the last thing before its number, by its environment's end, which TeX reads while the display is open: a hook
    // on the environment it began in, added the first time a display begins there, and \]. A display with neither, `$$ $$`,
    // gets no end, and no region)
    expect(POINTS_TEX).not.toContain('\\vadjust')
    expect(POINTS_TEX).toContain('\\def\\axt@dpend{\\ifcsname axt@dph@\\@currenvir\\endcsname\\else\\expandafter\\global\\expandafter\\let\\csname axt@dph@\\@currenvir\\endcsname\\@empty\\ifdefined\\AddToHook\\edef\\axt@dpx{\\noexpand\\AddToHook{env/\\@currenvir/end}}\\axt@dpx{\\axt@dpclose}\\fi\\fi}')
    // (in math, inner too: amsmath's split in an equation sets the rest of the equation in a cell its end closes; and only in the
    // environment the display began in)
    expect(POINTS_TEX).toContain('\\def\\axt@dpclose{\\ifx\\axt@dpcl\\@empty\\else\\ifmmode\\edef\\axt@dpz{\\@currenvir}\\ifx\\axt@dpz\\axt@dpce\\axt@point{dpe\\axt@dpcl}\\gdef\\axt@dpcl{}\\fi\\fi\\fi}')
    expect(POINTS_TEX).toContain('\\let\\axt@@rbrack\\]\\protected\\def\\]{\\axt@dpclose\\axt@@rbrack}')
    // (appended to \everydisplay once the document began, after every package's own)
    expect(POINTS_TEX).toContain('\\everydisplay\\expandafter{\\the\\everydisplay\\axt@dpopen}')
    expect(POINTS_TEX).toContain('\\AddToHook{begindocument/end}{\\axt@dpgo}')
  })
  it('sets no node in a display TeX sets as an alignment, which must open with its \\halign: points between its rows instead', () => {
    // (TeX refuses an \\halign in a display whose list holds anything, "Improper \\halign inside $$'s": a display's kind is known
    // from the pass before, by its number, its environment and its line (the aux), and none is set where it is not known)
    expect(POINTS_TEX).toContain('\\protected\\def\\halign{\\ifmmode\\ifinner\\else\\axt@dphal\\fi\\fi')
    expect(POINTS_TEX).toContain('\\immediate\\write\\@auxout{\\string\\axt@dpaligned{\\axt@dpn}}')
    expect(POINTS_TEX).toContain('\\immediate\\write\\@auxout{\\string\\axt@dpseen{\\axt@dpn}{\\axt@dpk}}')
    expect(POINTS_TEX).toContain('\\ifcsname axt@dpa@\\axt@dpn\\endcsname\\else\\ifcsname axt@dps@\\axt@dpn\\endcsname')
    // (each of its rows closed after its \\cr, by \\everycr's \\noalign, its first point after the preamble's; nothing before
    // the \\noalign that TeX would read as a row's start)
    expect(POINTS_TEX).toContain('\\def\\axt@dpcr{\\ifnum\\axt@dplv<\\z@\\noalign{\\xdef\\axt@dplv{\\the\\numexpr\\currentgrouplevel-1}\\axt@dpat{dps\\axt@dpm}}\\else\\ifnum\\currentgrouplevel=\\numexpr\\axt@dplv\\relax\\noalign{\\axt@dpat{dpe\\axt@dpm}}\\fi\\fi}')
    // (a point between rows is in the page's list, and makes the glue after it a place to break: amsmath's rows end with a
    // \\noalign of \\interdisplaylinepenalty, 10000, and the glue under it follows a penalty; a point after that penalty let TeX
    // break 2010.11929v2's align over pages 3 and 4. So each point is set by what ends the list: after a penalty, a glue or
    // nothing, the point and a \\penalty10000, so the glue after it still follows a penalty; after a row's box, the point and the
    // row's depth given back under it, a kern of minus the depth and an empty box that deep, so that a column ending there ends
    // with a box of the row's depth, as \\lastbox reads it; after a kern, none, which a glue after makes a place to break; after
    // anything else (a whatsit, a mark), the point alone)
    expect(POINTS_TEX).toContain('\\def\\axt@dpat#1{\\edef\\axt@dpt{\\ifcase\\numexpr\\lastnodetype+1\\relax p\\or w\\or b\\or b\\or w\\or w\\or w\\or w\\or w\\or w\\or w\\or w\\or p\\or k\\or p\\or b\\else w\\fi}\\if k\\axt@dpt\\else\\axt@point{#1}\\if p\\axt@dpt\\penalty\\@M\\fi\\if b\\axt@dpt\\axt@dpdp\\fi\\fi}')
    expect(POINTS_TEX).toContain('\\def\\axt@dpdp{\\dimen@\\prevdepth\\ifdim\\dimen@>-\\@m\\p@\\kern-\\dimen@\\nointerlineskip\\setbox\\z@\\hbox{}\\dp\\z@\\dimen@\\box\\z@\\fi}')
  })
  it('states the text a display sets in text mode, bracketed inside the box each text command makes, and the math it opens again', () => {
    // (the coordinator's ruling of 2026-11-09: words TeX sets in text mode inside a display are text, translated as before;
    // 2610.22299v1's display (1), a sentence in \text, and 2608.25210v2 p10's labels under a brace. TeX's text mode inside math
    // is an \hbox. \everyhbox, which every \hbox passes, was tried first and is unsafe: amsmath sets boxes in math of its own
    // (\resetMathstrut@ after a font change, \boldsymbol's \endgroup), \setbox'd and never placed, and a point after one fell
    // between a nucleus and its script (2608.16117v1's \boldsymbol{\mathcal{J}}^{trans} moved 0.26 pt); \leaders read the point
    // for its glue (2610.21377v1's \xrightarrow). So the text is bracketed inside the box, `dts<n>` first and `dte<n>` last, by
    // the commands that make a text box in math: amstext's \textdef@ (\text, and \textrm, \textbf… through \nfss@text), \mbox
    // (core LaTeX's \nfss@text), \fbox (\boxed). Math opened again in a restricted list of a display's (such a box, an
    // alignment's cell, a box in a \vcenter: \everymath) gets `dms<n>` first in it and `dme<n>` after it in that list, so that
    // rows a box takes again keep their math's points; a glyph's mode is its innermost point's. Math in a \vbox's paragraph gets
    // none (a point after it would be a paragraph's). A display not known from the pass before as no alignment states no text
    // in its own list. Every point in a math list or a restricted list)
    expect(POINTS_TEX).not.toContain('\\everyhbox')
    expect(POINTS_TEX).toContain('\\newif\\ifaxt@dxm\\newif\\ifaxt@dxr\\newif\\ifaxt@dxw\\gdef\\axt@dxn{0}\\gdef\\axt@dxst{}')
    expect(POINTS_TEX).toContain('\\protected\\def\\axt@dxa{\\ifaxt@dxm\\xdef\\axt@dxn{\\the\\numexpr\\axt@dxn+1}\\axt@point{dts\\axt@dxn}\\edef\\axt@dxcl{\\noexpand\\axt@point{dte\\axt@dxn}}\\axt@dxmfalse\\axt@dxrtrue\\else\\let\\axt@dxcl\\relax\\fi}\\protected\\def\\axt@dxz{\\axt@dxcl}')
    expect(POINTS_TEX).toContain('\\def\\axt@dxma{\\ifaxt@dxr\\xdef\\axt@dxn{\\the\\numexpr\\axt@dxn+1}\\axt@point{dms\\axt@dxn}\\xdef\\axt@dxst{dme\\axt@dxn,\\axt@dxst}\\aftergroup\\axt@dxpop\\axt@dxmtrue\\axt@dxrfalse\\axt@dxwfalse\\else\\ifaxt@dxw\\axt@dxmtrue\\axt@dxwfalse\\fi\\fi}')
    // (the math's end after its group, by a stack: a local definition is gone once the group ends)
    expect(POINTS_TEX).toContain('\\def\\axt@dxpop{\\ifx\\axt@dxst\\@empty\\else\\expandafter\\axt@dxpop@\\axt@dxst\\@nil\\fi}\\def\\axt@dxpop@#1,#2\\@nil{\\gdef\\axt@dxst{#2}\\axt@point{#1}}')
    expect(POINTS_TEX).toContain('\\def\\axt@dxvb{\\ifaxt@dxm\\axt@dxwtrue\\fi\\ifaxt@dxr\\axt@dxwtrue\\fi\\axt@dxmfalse\\axt@dxrfalse}')
    // (the three text commands wrapped once the document began, each command's own definition kept; inside \\axt@dpgo's body,
    // so their parameters doubled; as robust as each was, the points \\protected: a moving argument (a \\subsection's,
    // 2608.04322v1) writes them as they are, and a fragile \\fbox there fails as it failed)
    expect(POINTS_TEX).toContain('\\ifdefined\\textdef@\\let\\axt@@textdef\\textdef@\\def\\textdef@##1##2##3{\\axt@@textdef{##1}{##2}{\\axt@dxa##3\\axt@dxz}}\\fi')
    expect(POINTS_TEX).toContain('\\let\\axt@@mbox\\mbox\\long\\def\\mbox##1{\\axt@@mbox{\\axt@dxa##1\\axt@dxz}}')
    expect(POINTS_TEX).toContain('\\let\\axt@@fbox\\fbox\\long\\def\\fbox##1{\\axt@@fbox{\\axt@dxa##1\\axt@dxz}}')
    // (a display's own math only where its start is set, a display alignment's cells, an alignment's in a \vbox; never under
    // the gate)
    expect(POINTS_TEX).toContain('\\def\\axt@dpopen{\\ifaxt@off\\else\\axt@dxmfalse\\axt@dxrfalse\\axt@dxwfalse\\fi\\gdef\\axt@dpcl{}')
    expect(POINTS_TEX).toContain('\\axt@point{dps\\axt@dpn}\\axt@dxmtrue\\xdef\\axt@dpcl{\\axt@dpn}')
    expect(POINTS_TEX).toContain('\\ifaxt@off\\else\\axt@dxrtrue\\xdef\\axt@dpm{\\axt@dpn}')
    expect(POINTS_TEX).toContain('\\protected\\def\\halign{\\ifmmode\\ifinner\\else\\axt@dphal\\fi\\fi\\ifaxt@dxw\\axt@dxrtrue\\fi\\axt@@halign}')
    expect(POINTS_TEX).toContain('\\everymath\\expandafter{\\the\\everymath\\axt@dxma}\\everyvbox\\expandafter{\\the\\everyvbox\\axt@dxvb}')
  })
})

describe('the mark names', () => {
  it('MARK_NAME takes each grammar and nothing else', () => {
    for (const name of ['12s', '0e', 'c2-7', 'c1-1', 't4e', 'h0s', 'p3.14a', 'n3.2b', 'g9t', 'g1a', 'n1.ref.s', 'n12.listfigure.e']) expect(MARK_NAME.test(name), name).toBe(true)
    for (const name of ['12x', 'c3-1', 'p3a', 'axt-12s', '12s ', 'h3', 't4a', 'p3.14', 'g9s', 'P3.1A', '', 'n1.Ref.s', 'n1.ref.a', 'n.ref.s', 'n1.ref', 'n1.ref.s.e']) expect(MARK_NAME.test(name), name).toBe(false)
  })
})

describe("babel's names (D1a)", () => {
  it('NAMES_TEX wraps each key\'s macro, writes its marks through, and LAYOUT_TEX holds it before the points', () => {
    expect(Object.keys(NAME_MACROS)).toEqual([...NAME_KEYS])
    expect(Object.keys(NAME_ENGLISH)).toEqual([...NAME_KEYS])
    for (const k of NAME_KEYS) expect(NAMES_TEX).toContain(`\\axt@nmwrap{${k}}{${NAME_MACROS[k]}}`)
    // written through: \protect\axtnma where \protect is not \@typeset@protect, never gobbled
    expect(NAMES_TEX).toContain('\\def\\axtnma{\\ifx\\protect\\@typeset@protect\\expandafter\\axt@nma\\else\\protect\\axtnma\\fi}')
    expect(NAMES_TEX).toContain('\\def\\axtnmb{\\ifx\\protect\\@typeset@protect\\expandafter\\axt@nmb\\else\\protect\\axtnmb\\fi}')
    // gated, hmode only, glue put back (\axt@set), the start waiting for a paragraph from vertical mode
    expect(NAMES_TEX).toMatch(/\\protected\\def\\axt@nma#1\{\\ifaxt@off\\else/)
    // (each held: a name a class runs into the paragraph is set as it starts, and leaves the opening point waiting there for
    // the unit's own start mark, LAYOUT_TEX's \axt@hold)
    expect(NAMES_TEX).toContain('\\relax\\axt@holdtrue\\axt@put{n\\axt@nmn.#1.s}\\axt@holdfalse')
    expect(NAMES_TEX).toContain('\\axt@holdtrue\\axt@set{n\\axt@nmn.#1.e}\\axt@holdfalse')
    expect(NAMES_TEX).toContain('\\AddToHookNext{para/begin}{\\axt@nmlate}')
    // at \begin{document} and after babel's switches; the names kept off a float's label
    expect(NAMES_TEX).toContain('\\AddToHook{begindocument/end}{\\global\\axt@nmontrue\\axt@nmall}')
    expect(NAMES_TEX).toContain('\\AddBabelHook{axtnames}{afterextras}{\\axt@nmall}')
    expect(NAMES_TEX).toContain('\\ifdefined\\@captype')
    // a blank name is left as it is: a class may test it for emptiness (REVTeX's jcp style, an empty \refname)
    expect(NAMES_TEX).toContain('{!\\tl_if_blank_p:o{#1}}')
    // a case change keeps their keys; a PDF string gobbles them
    expect(LAYOUT_TEX).toContain('\\axt@hm\\axtcolour\\axt@colour\\axtnma\\axtnmb\\axt@nma\\axt@nmb}')
    expect(LAYOUT_TEX).toContain('\\let\\axtnma\\@gobble\\let\\axtnmb\\@gobble')
    expect(LAYOUT_TEX.indexOf(NAMES_TEX)).toBeGreaterThan(0)
    expect(LAYOUT_TEX.indexOf(NAMES_TEX)).toBeLessThan(LAYOUT_TEX.indexOf(POINTS_TEX))
    // no register, nothing logged, one line
    for (const word of ['\\newcount', '\\newdimen', '\\newskip', '\\typeout', '\\message', '\n', '%']) expect(NAMES_TEX).not.toContain(word)
  })

  it('literalNames wraps a name a style writes literally in the construct its macro names, and nothing else', () => {
    // nips_2017.sty's, cvpr.sty's and naaclhlt2019.sty's forms
    const nips = String.raw`\renewenvironment{abstract}{\vskip .075in\centerline{\large\bf Abstract}\vspace{0.5ex}\begin{quote}}{\par\end{quote}\vskip 1ex}`
    expect(literalNames(nips)).toBe(String.raw`\renewenvironment{abstract}{\vskip .075in\centerline{\large\bf \axtnma{abstract}Abstract\axtnmb{abstract}}\vspace{0.5ex}\begin{quote}}{\par\end{quote}\vskip 1ex}`)
    expect(literalNames(String.raw`\def\abstract{\centerline{\large\bf Abstract}\vspace*{12pt}\it}`)).toBe(String.raw`\def\abstract{\centerline{\large\bf \axtnma{abstract}Abstract\axtnmb{abstract}}\vspace*{12pt}\it}`)
    expect(literalNames(String.raw`\def\thebibliography#1{\section*{References\@mkboth{References}{References}}\list{}{}}`)).toBe(String.raw`\def\thebibliography#1{\section*{\axtnma{ref}References\axtnmb{ref}\@mkboth{\axtnma{ref}References\axtnmb{ref}}{\axtnma{ref}References\axtnmb{ref}}}\list{}{}}`)
    // \renewcommand's forms, a name over two lines, a report's Bibliography
    const two = String.raw`\renewcommand{\listoffigures}[1][x]{\chapter*{List of
 Figures}}`
    expect(literalNames(two)).toBe(String.raw`\renewcommand{\listoffigures}[1][x]{\chapter*{\axtnma{listfigure}List of
 Figures\axtnmb{listfigure}}}`)
    expect(literalNames(String.raw`\renewenvironment{thebibliography}[1]{\chapter*{Bibliography}}{}`)).toBe(String.raw`\renewenvironment{thebibliography}[1]{\chapter*{\axtnma{bib}Bibliography\axtnmb{bib}}}{}`)
    // not in a label, a reference, a message, a \csname, nor a word of which it is a part, nor in another case
    const kept = [
      String.raw`\renewcommand\tableofcontents{\label{Contents}\PackageWarning{x}{Contents here}\csname Contents\endcsname\section*{Contentsx CONTENTS contents}}`,
      String.raw`\renewcommand\tableofcontents{\hypertarget{Contents}{}\typeout{Contents}}`,
    ]
    for (const t of kept) expect(literalNames(t), t).toBe(t)
    // outside the construct's definition, or in another construct's: as it is
    for (const t of [String.raw`\def\other{Abstract}`, String.raw`\newcommand{\Abstract}{Abstract}`, 'Abstract', String.raw`\section*{References}`, String.raw`\def\abstract{References}`]) expect(literalNames(t), t).toBe(t)
    // what it adds is the marks alone: taken out, the style is as it was
    const all = [nips, String.raw`\def\thebibliography#1{\section*{References\@mkboth{References}{References}}\list{}{}}`].join('\n')
    expect(literalNames(all).replace(/\\axtnm[ab]\{[a-z]+\}/g, '')).toBe(all)
  })

  it('originalFiles with the layout marks wraps a style\'s literal names, every file of the package; without, the bytes as before', () => {
    const style = String.raw`\ProvidesPackage{lit}\renewenvironment{abstract}{\centerline{\bf Abstract}}{}`
    const p = openPaper(new Map([['main.tex', new TextEncoder().encode(String.raw`\documentclass{article}\usepackage{lit}\renewcommand\tableofcontents{\section*{Contents}}
\begin{document}
\begin{abstract}We show a model.\end{abstract}
\section*{Contents}
\end{document}
`)], ['lit.sty', new TextEncoder().encode(style)]]))
    const v1 = originalFiles(p, { lines: true, layout: MARK_CLASSES })
    expect(decode(new Map([['main.tex', v1.get('lit.sty') as Uint8Array]]))).toBe(String.raw`\ProvidesPackage{lit}\renewenvironment{abstract}{\centerline{\bf \axtnma{abstract}Abstract\axtnmb{abstract}}}{}`)
    const main = decode(v1)
    // the main file's preamble, never its body (a heading the paper writes is its own)
    expect(main).toContain(String.raw`\renewcommand\tableofcontents{\section*{\axtnma{contents}Contents\axtnmb{contents}}}`)
    expect(main.slice(main.indexOf('\\begin{document}'))).not.toContain('\\axtnma')
    expect([...originalFiles(p, { lines: true }).keys()]).toEqual(['main.tex'])
  })

  it('the name section asks, for each key wrapped, whether its own text holds a lowercase letter; readNameProbe reads its rows', () => {
    const tex = nameSection()
    for (const k of NAME_KEYS) expect(tex).toContain(`\\ifcsname axt@nmt@${k}\\endcsname`)
    expect(tex).toContain(probeRow('name', 'ref', 1))
    expect(markProbeTex([], [])).toContain(tex)
    const log = ['LAYOUT-PROBE 1 name abstract 1', 'LAYOUT-PROBE 1 name ref 0', 'LAYOUT-PROBE 1 name chapter 1', 'LAYOUT-PROBE 2 name bib 1', 'LAYOUT-PROBE 1 name contents 2', 'LAYOUT-PROBE 1 name index'].join('\n')
    expect(readNameProbe(log)).toEqual({ abstract: 1, ref: 0 })
    expect(readNameProbe('')).toEqual({})
  })

  it("the skip section writes the paper's \\lineskip and \\lineskiplimit as TeX does; readSkipProbe reads them in PDF units", () => {
    // (TeX eats the space after \relax: the second field's \space parts the two)
    expect(skipSection()).toBe('\\typeout{LAYOUT-PROBE 1 lineskip \\the\\dimexpr\\lineskip\\relax \\space\\the\\lineskiplimit}')
    expect(markProbeTex([], [])).toContain(skipSection())
    const bp = 72 / 72.27
    expect(readSkipProbe('LAYOUT-PROBE 1 lineskip 1.0pt 0.0pt')).toEqual([bp, 0])
    expect(readSkipProbe('x\nLAYOUT-PROBE 1 lineskip 2.5pt -1.0pt\ny')).toEqual([2.5 * bp, -bp])
    // none, two, a row of another schema or shape, a unit TeX does not write, past \maxdimen: none
    for (const log of ['', 'LAYOUT-PROBE 1 lineskip 1.0pt 0.0pt\nLAYOUT-PROBE 1 lineskip 1.0pt 0.0pt', 'LAYOUT-PROBE 2 lineskip 1.0pt 0.0pt', 'LAYOUT-PROBE 1 lineskip 1.0pt', 'LAYOUT-PROBE 1 lineskip 1.0pt0.0pt', 'LAYOUT-PROBE 1 lineskip 1.0bp 0.0pt', 'LAYOUT-PROBE 1 lineskip 1.0pt 99999.0pt'])
      expect(readSkipProbe(log), log).toBeNull()
    // (\offinterlineskip's \maxdimen is a limit TeX writes)
    expect(readSkipProbe('LAYOUT-PROBE 1 lineskip 0.0pt 16383.99998pt')).toEqual([0, 16383.99998 * bp])
  })
})

describe("backref's list after an entry (latex-front.mjs BACKREF_LIST): its marks LAYOUT_TEX's, around the list where TeX sets it", () => {
  const entry = (pieces: Piece[]) => unit('reference', pieces)
  it('the marking writes the name of its marks in its place, nothing of its own source, and no mark around it: whatever stands before it', () => {
    for (const before of [text('Layer normalization, 2016.'), ph('\\url{https://a.org}'), ph('\\cite{a}'), ph('\\doi{10.1/x}')]) {
      const u = entry([text('Ba and Kiros. '), before, ph('\\axtbackref')])
      const marked = layoutMarking([u], MARK_CLASSES, { lines: false, switches: { '\\cite': '22222222', '\\url': '22222222' } }).units[0]?.pieces as Piece[]
      expect(marked.at(-1), JSON.stringify(before)).toEqual({ t: 'ph', src: '\\axtbrname{p0.2}' })
      expect(marked.some(p => p.t === 'ph' && /axtbackref|p0\.2[ab]/.test(p.src ?? '')), JSON.stringify(before)).toBe(false)
    }
    // (a unit of no mark of its own, or the paper's macros unmarked: nothing at all)
    expect(srcs(layoutMarking([entry([text('Ba and Kiros.'), ph('\\axtbackref')])], MARK_CLASSES.filter(c => c !== 'macro'), { lines: false }).units[0])).toEqual(['text'])
  })
  it('is no sample of the probe\'s: TeX is never asked what a command of no source sets', () => {
    const units = [entry([text('Ba and Kiros. '), ph('\\natexlab{a}'), text(' more words'), ph('\\axtbackref')])]
    expect(inkSamples(units)).toEqual(['\\natexlab{a}'])
    expect(leadSamples(units)).toEqual([])
    expect(probeSamples(units).map(s => s.src)).not.toContain('\\axtbackref')
  })
  it('LAYOUT_TEX wraps both of backref\'s printers where the document begins, each handing its arguments on as it read them, and lets the name go after the list', () => {
    expect(LAYOUT_TEX).toContain('\\gdef\\axt@brname{}\\protected\\def\\axtbrname#1{\\gdef\\axt@brname{#1}}')
    expect(LAYOUT_TEX).toContain('\\long\\def\\axt@brAltW#1#2#3#4{\\axt@bra\\axt@brAlt{#1}{#2}{#3}{#4}\\axt@brb}\\long\\def\\axt@brOneW#1{\\axt@bra\\axt@brOne#1\\axt@brb}')
    expect(LAYOUT_TEX).toContain('\\AddToHook{begindocument/end}{\\ifdefined\\BR@backref\\ifdefined\\backrefalt\\ifx\\backrefalt\\BR@BackrefAltUnused\\else')
    expect(LAYOUT_TEX).toContain('\\global\\let\\axt@brname\\@empty')
  })
})

describe("each colour piece's fill, as TeX set its run in the marked original (PR-C)", () => {
  const unit = (pieces: unknown[]) => ({ kind: 'para', pieces }) as unknown as SourceUnit
  const text = (s: string) => ({ t: 'text', s }), ph = (src: string) => ({ t: 'ph', src })
  const open = (src: string, id = 1) => ({ t: 'open', id, src }), close = (src: string, id = 1) => ({ t: 'close', id, src })
  it('the marking writes the colour right inside a \\textcolor group and right after a \\color switch, and nowhere else', () => {
    const u = unit([text('a '), open('\\textcolor{blue!60!black}{'), text('b'), close('}'), text(' c '), ph('\\color[HTML]{245B60}'), text(' d '), open('\\colorbox{blue!5}{', 2), text('e'), close('}', 2), ph('\\color')])
    const marked = layoutMarking([u], MARK_CLASSES, { lines: false }).units[0]?.pieces as { t: string; src?: string; s?: string }[]
    expect(marked.map(p => p.src ?? p.s)).toEqual(['a ', '\\textcolor{blue!60!black}{', '\\axtcolour{c0.1}', 'b', '}', ' c ', '\\color[HTML]{245B60}', '\\axtcolour{c0.5}', ' d ', '\\colorbox{blue!5}{', 'e', '}', '\\color'])
    expect([open('\\textcolor[rgb]{0,0,1}{'), ph('\\color{red}'), ph('\\color{red} x'), open('\\textcolor{red}'), open('\\colorbox{red}{')].map(colourPieceOf)).toEqual([true, true, false, false, false])
  })
  it("LAYOUT_TEX writes it through \\message alone, gated as the marks are, and never into a file or a PDF string", () => {
    expect(LAYOUT_TEX).toContain('\\protected\\def\\axt@colour#1{\\ifaxt@off\\else\\ifdefined\\current@color\\message{^^JAXT-COLOUR #1 \\current@color^^J}\\fi\\fi\\ignorespaces}')
    expect(LAYOUT_TEX).toContain('\\def\\axtcolour{\\ifx\\protect\\@typeset@protect\\expandafter\\axt@lc\\expandafter\\axt@colour\\else\\noexpand\\axtcolour\\fi}')
    expect(LAYOUT_TEX).toContain('\\let\\axtcolour\\@gobble')
  })
  it('reads each piece\'s fill from the log, joins a line TeX wrapped, and gives none to a piece set in two colours or of no form', () => {
    const wrapped = 'AXT-COLOUR c9.2 0.12345 0.23456 0.34567 0.45678 k 0.12345 0.23456 0.34567 0.45678 K'
    const log = ['x', 'AXT-COLOUR c2.4 0 0 1 rg 0 0 1 RG', '', 'AXT-COLOUR c0.1 0.65 0 0 rg 0.65 0 0 RG', 'AXT-COLOUR c0.1 0.65 0 0 rg 0.65 0 0 RG',
      'AXT-COLOUR c3.1 1 0 0 rg 1 0 0 RG', 'AXT-COLOUR c3.1 0 0 1 rg 0 0 1 RG', 'AXT-COLOUR c4.1 Red', wrapped.slice(0, 79), wrapped.slice(79), 'AXT-COLOUR c5.0 0 g 0 G'].join('\n')
    const out = readColours(log)
    expect(out.map(([i, k]) => [i, k])).toEqual([[0, 1], [2, 4], [5, 0], [9, 2]])
    expect(out.find(e => e[0] === 0)?.[2]).toBe(0xa60000)
    expect(out.find(e => e[0] === 2)?.[2]).toBe(0x0000ff)
    expect(out.find(e => e[0] === 5)?.[2]).toBe(0)
  })
  it('a piece set in two colours has none, however many times and in whatever order (#407: A, B, B; A, A, B; B, A, A)', () => {
    const A = '1 0 0 rg 1 0 0 RG', B = '0 0 1 rg 0 0 1 RG'
    for (const order of [[A, B, B], [A, A, B], [B, A, A], [A, 'Red', A], ['Red', A, A]]) {
      expect(readColours(order.map(c => `AXT-COLOUR c1.2 ${c}`).join('\n')), order.join(' / ')).toEqual([])
    }
    expect(readColours([A, A, A].map(c => `AXT-COLOUR c1.2 ${c}`).join('\n'))).toEqual([[1, 2, 0xff0000]])
  })
})

describe('an opening point that waits in vertical mode is set with its unit, not with a run-in heading or name (PR-C)', () => {
  it("the heading's and the names' marks hold it; every other mark sets it beside its own", () => {
    expect(LAYOUT_TEX).toContain('\\newif\\ifaxt@hold')
    expect(LAYOUT_TEX).toContain('\\def\\axt@mark#1{\\axt@colseen\\ifaxt@off\\else\\axt@dest{#1}\\ifaxt@hold\\else\\ifx\\axt@pend\\@empty\\else\\axt@dest{\\axt@pend}\\global\\let\\axt@pend\\@empty\\fi\\fi\\fi}')
    expect(LAYOUT_TEX).toContain('\\protected\\def\\axt@hm#1{\\ifaxt@off\\else\\axt@align{#1}\\ifhmode\\relax\\axt@holdtrue\\axt@put{#1}\\axt@holdfalse\\fi\\fi}')
    // (the unit's start mark and a placeholder's own still set it; every mark in horizontal mode keeps a letter's italic
    // correction, a unit's as a cell's)
    expect(LAYOUT_TEX).toContain('\\protected\\def\\axtmark#1{\\ifaxt@off\\axt@colseen\\else\\axt@align{#1}\\ifhmode\\axt@put{#1}\\else\\axt@mark{#1}\\fi\\fi}')
    expect((LAYOUT_TEX.match(/\\axt@holdtrue/g) ?? []).length).toBe(3)
  })
})

describe("a unit's start mark before the marks that open its head piece (2610.21085v1 u44)", () => {
  const enc = (s: string) => new TextEncoder().encode(s), dec = (b: Uint8Array | undefined) => new TextDecoder('latin1').decode(b)
  const marked = (body: string) => dec(originalFiles(openPaper(new Map([['main.tex', enc(`\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`)]])), { lines: true, layout: LAYOUT_CLASSES }).get('main.tex'))
  it("after a run-in heading that holds a formula: the head formula's point is set in horizontal mode, at the unit's start", () => {
    const tex = marked('\\paragraph{What $V$ is, and what it is defined on.}\n$V(q)$ is not a fixed label space, and $p_e$ is a frequency.\n')
    // (before: \axtpmm{p1.0a}\leavevmode\axtmark{1s}, the opening mark waiting in vertical mode until the heading's
    // \axtpmm{p0.1a}, which \everypar sets first, set it there)
    expect(tex).toContain('\\paragraph{\\axthmark{h0s}What \\axtpmm{p0.1a}$V$\\axtpm{p0.1b} is, and what it is defined on.\\axthmark{h0e}}')
    expect(tex).toContain('\\axtlines{1}\\leavevmode\\axtmark{1s}\\axtpmm{p1.0a}$V(q)$\\axtpm{p1.0b} is not')
    expect(tex).not.toMatch(/\\axtpm[am]\{p1\.0a\}\\leavevmode/)
  })
  it('a citation first, a macro glued to the word after it, a heading formula first: the same order; a mark inside the unit as before', () => {
    const tex = marked('\\newcommand{\\bert}{BERT}\n\\section{$\\kappa$-concave sets}\n\\cite{k} shows it.\n\n\\bert\'s gain, and \\cite{k} again.\n')
    expect(tex).toContain('\\section{\\axthmark{h0s}\\axtpmm{p0.0a}$\\kappa$\\axtpm{p0.0b}-concave sets\\axthmark{h0e}}')
    expect(tex).toMatch(/\\leavevmode\\axtmark\{1s\}\\axtpma\{p1\.0a\}\\cite\{k\}/)
    expect(tex).toMatch(/\\leavevmode\\axtmark\{2s\}\\axtpma\{p2\.0a\}\\bert's/)
    expect(tex).toContain('and \\axtpma{p2.2a}\\cite{k}\\axtpm{p2.2b} again.')
  })
  it("the layout marking flags its opening marks, and nothing else, as opening the piece after them", () => {
    const u = { kind: 'para', pieces: [{ t: 'ph', src: '$x$' }, { t: 'text', s: ' and ' }, { t: 'ph', src: '\\cite{k}' }, { t: 'text', s: '.' }] } as unknown as SourceUnit
    const { units: [c] } = layoutMarking([u], LAYOUT_CLASSES, { lines: false })
    const opens = ((c?.pieces ?? []) as { t: string; src?: string; opens?: boolean }[]).filter(p => p.opens).map(p => p.src)
    expect(opens).toEqual(['\\axtpmm{p0.0a}', '\\axtpma{p0.2a}'])
  })
})

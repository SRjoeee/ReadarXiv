// The ink probe asked where the document uses a macro (the compile move's F15, PDF-READER §18.80), at its interfaces, on content
// of our own (no TeX runs; lab/pdf/spikes/ask-cases.mjs holds the TeX): the asks' answers read from a pass's log in the ink
// section's form (marks.ts readInkProbe, readInkAnswered, useAnswersOf), a sample used in a paragraph listed in a vertical box
// and never inkless where it parts that paragraph; merged into the marking's inkless (mergeUses); where the asks stand (live.ts
// askPlan: each sample right before its first use in running text, none in a heading, a caption, an algorithm's body or a
// sample whose groups do not close) and the marked files that carry them (originalFiles `asks`: each before its piece's marks,
// ASK_TEX in the head, no line moved). The loop's pass 1 that carries them: marked-loop.test.ts.
import { describe, expect, it } from 'vitest'
import { askPlan, openPaper, originalFiles } from '../src/compile/live.ts'
import {
  ASK_TEX,
  askable,
  inkSamples,
  LAYOUT_CLASSES,
  mergeUses,
  readInkAnswered,
  readInkProbe,
  readAskTexts,
  readInkTexts,
  useAnswersOf,
  withoutAsks,
} from '../src/marks/marks.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array | undefined) => new TextDecoder().decode(b)
/** one sample's listing as an ask writes it, its box's line given, and what TeX writes before the listing */
const listing = (i: number, box: string, nodes: string[], before: string[] = []) =>
  [
    `LAYOUT-PROBE 1 ink-at ${i}`,
    ...before,
    '> \\box74=',
    box,
    ...nodes,
    '',
    '! OK.',
    `LAYOUT-PROBE 1 ink-end ${i}`,
  ].join('\n')
const NONE = '\\hbox(0.0+0.0)x0.0'
const INKED = ['.\\T1/cmr/m/n/10 ,', '.\\glue 3.33 plus 1.66 minus 1.11']

describe('the asks’ answers, read from the pass’s log', () => {
  const log = [
    listing(0, NONE, []),
    listing(1, '\\hbox(4.3+0.0)x5.8', INKED),
    listing(2, NONE, [], ['! Undefined control sequence.']),
    // (a sample TeX passed over where it stands, between an alignment's rows: no rows at all)
  ].join('\n')
  const asked = ['\\nada', '\\kw', '\\undef', '\\myrule']
  it('answers a listing given whole with no error, inkless or not; one with an error or none is no answer', () => {
    expect(readInkAnswered(log, asked)).toEqual(['\\nada', '\\kw'])
    expect(useAnswersOf(log, asked)).toEqual({ inkless: ['\\nada'], inked: ['\\kw'], texts: [['\\kw', ',']] })
  })
  it('reads the text an ask sets only where TeX states every glyph as itself: no rule, ligature, formula or other font', () => {
    // (the coordinator's ruling on the third cause, 2026-11-16: elsarticle's `\sep` in its keywords sets `\unskip, `, its comma
    // a text font's character and its space's glue, ","; a macro whose listing holds a rule, a ligature's slot, a formula or a
    // symbol font's character states no text, whatever else it sets)
    const log = [
      listing(0, '\\hbox(4.3+0.0)x5.8', INKED),
      listing(1, '\\hbox(4.3+0.0)x9.0', ['.\\T1/cmr/m/n/10 a', '.\\rule(0.4+0.0)x5.0']),
      listing(2, '\\hbox(6.9+0.0)x5.6', ['.\\T1/cmr/m/n/10 ^^\\ (ligature fi)']),
      listing(3, '\\hbox(4.3+0.0)x5.0', ['.\\mathon', '.\\OML/cmm/m/it/10 x', '.\\mathoff']),
      listing(4, '\\hbox(4.3+0.0)x5.0', ['.\\OMS/cmsy/m/n/10 ^^C']),
      listing(5, '\\hbox(6.9+0.0)x20.0', [
        '.\\OT1/cmr/m/n/10 B',
        '.\\OT1/cmr/m/n/10 E',
        '.\\kern0.5',
        '.\\OT1/cmr/m/n/10 R',
      ]),
      // (an ask set in a paragraph of its own, its vertical box: 2610.20848v1's `\sep` in its keywords as pass 1 lists it; a
      // LuaTeX paragraph node first in its line)
      listing(6, '\\vbox(1.01+1.40999)x522.0', [
        '.\\hbox(1.01+1.40999)x522.0, glue set 258.5fil',
        '..\\localpar',
        '..\\hbox(0.0+0.0)x0.0',
        '..\\T1/ntxtlf/m/n/10 ,',
        '..\\glue 2.5 plus 2.49995 minus 0.80005',
        '..\\hbox(0.0+0.0)x0.0',
        '..\\penalty 10000',
        '..\\glue(\\parfillskip) 0.0 plus 1.0fil',
        '..\\glue(\\rightskip) 0.0 plus 1.0fil',
      ]),
    ].join('\n')
    const asked = ['\\sep', '\\ruled', '\\fi{}', '\\x{}', '\\dagger{}', '\\ber{}', '\\esep']
    expect(readAskTexts(log, asked)).toEqual([
      ['\\sep', ','],
      ['\\ber{}', 'BER'],
      ['\\esep', ','],
    ])
    // (the probe's reading as before: a paragraph's box is no answer of its)
    expect(readInkTexts(log, asked).map(([x]) => x)).not.toContain('\\esep')
  })
  it('reads a sample set in a paragraph from its vertical box: inkless where no node at any depth sets ink, whatever lines it holds', () => {
    const LINE = '.\\hbox(6.9+1.9)x345.0, glue set 300.0fil'
    const EMPTY = '..\\hbox(0.0+0.0)x0.0'
    const ENDS = ['..\\penalty 10000', '..\\glue(\\parfillskip) 0.0 plus 1.0fil', '..\\glue(\\rightskip) 0.0']
    const BOX = '\\vbox(6.9+1.9)x345.0'
    const log = [
      // (\\nada{} in a paragraph: its one line, the two empty boxes the ask sets around it)
      listing(0, BOX, [LINE, EMPTY, EMPTY, ...ENDS]),
      // (\\par there: the line it ends, then the paragraph the document goes on with, the ask's own box in it)
      listing(1, '\\vbox(18.9+0.0)x345.0', [
        LINE,
        EMPTY,
        ...ENDS,
        '.\\glue(\\baselineskip) 12.0',
        LINE,
        EMPTY,
        ...ENDS,
      ]),
      // (\\\\ there: two lines)
      listing(2, '\\vbox(18.9+0.0)x345.0', [
        LINE,
        EMPTY,
        '..\\glue 0.0 plus 1.0fil',
        '..\\penalty -10000',
        '.\\glue(\\baselineskip) 12.0',
        LINE,
        EMPTY,
        ...ENDS,
      ]),
      // (\\vspace there: its glue after the line, which the line's \\vadjust put there)
      listing(3, BOX, [LINE, EMPTY, EMPTY, ...ENDS, '.\\glue 10.0']),
      // (a box of no ink a \\vadjust of the line put after it, a mark that left the line: none of them ink)
      listing(4, BOX, [LINE, EMPTY, EMPTY, ...ENDS, '.\\mark{x}', '.\\hbox(5.0+0.0)x10.0']),
      // (an \\item a paper's macro makes, in a paragraph: the line it ends, then the paragraph the document goes on with, where
      // LaTeX sets the item's label through \\everypar: ink)
      listing(8, '\\vbox(20.0+2.5)x345.0', [
        LINE,
        EMPTY,
        ...ENDS,
        '.\\penalty -51',
        '.\\glue 4.0 plus 2.0 minus 1.0',
        '.\\hbox(7.5+2.5)x345.0, glue set 345.0fil',
        '..\\hbox(7.5+2.5)x0.0',
        '...\\hbox(7.5+2.5)x20.00003, glue set 20.00003fil',
        '....\\OT1/cmr/m/n/10 (',
        '....\\OT1/cmr/m/n/10 B',
        '....\\OT1/cmr/m/n/10 )',
        EMPTY,
        ...ENDS,
      ]),
      // (a paragraph's end and a rule set after it: the rule's ink)
      listing(9, '\\vbox(12.0+0.0)x345.0', [
        LINE,
        EMPTY,
        ...ENDS,
        '.\\glue(\\baselineskip) 11.6',
        '.\\hbox(0.4+0.0)x345.0',
        '..\\hbox(0.4+0.0)x345.0',
        '...\\rule(0.4+0.0)x345.0',
        EMPTY,
        ...ENDS,
      ]),
      // (between paragraphs, \\par: nothing at all)
      listing(5, '\\vbox(0.0+0.0)x0.0', []),
      // (between paragraphs, hyperref's \\phantomsection: its destination and a penalty, no line, no material)
      listing(7, '\\vbox(0.0+0.0)x0.0', ['.\\pdfdest name{section*.27} xyz', '.\\penalty 10000']),
      // (LuaTeX's line: its paragraph's node first, as TeX Live 2023's and 2025's LuaLaTeX list it)
      listing(6, '\\vbox(0.0+0.0)x345.0, direction TLT', [
        '.\\hbox(0.0+0.0)x345.0, glue set 345.0fil, direction TLT',
        '..\\localpar',
        '...\\localinterlinepenalty=0',
        '...\\localbrokenpenalty=0',
        '...\\localleftbox=null',
        '...\\localrightbox=null',
        '..\\hbox(0.0+0.0)x0.0, direction TLT',
        '..\\hbox(0.0+0.0)x0.0, direction TLT',
        ...ENDS,
      ]),
    ].join('\n')
    const asked = [
      '\\nada{}',
      '\\mypar{}',
      '\\mycr{}',
      '\\vsp{}',
      '\\mk{}',
      '\\mypar',
      '\\lua{}',
      '\\phantomsection',
      '\\myitem{(B)}',
      '\\parrule{}',
    ]
    expect(useAnswersOf(log, asked)).toEqual({
      inkless: ['\\nada{}', '\\mypar{}', '\\mycr{}', '\\vsp{}', '\\mk{}', '\\mypar', '\\phantomsection', '\\lua{}'],
      inked: ['\\myitem{(B)}', '\\parrule{}'],
      texts: [['\\myitem{(B)}', '(B)']],
    })
    // (in a horizontal box, the probe's, LuaTeX's paragraph node read as before: not known)
    const probe = listing(0, NONE, ['.\\vbox(0.0+0.0)x10.0', '..\\hbox(0.0+0.0)x10.0', '...\\localpar'])
    expect(useAnswersOf(probe, ['\\pb{}']).inkless).toEqual([])
  })
  it("reads the marks' own nodes in an ask's box as no ink (a point, a destination), as they stand in the loop's first pass; the probe's reading as before", () => {
    const LINE = '.\\hbox(0.0+0.0)x345.0, glue set 335.0fil'
    const ENDS = ['..\\penalty 10000', '..\\glue(\\parfillskip) 0.0 plus 1.0fil', '..\\glue(\\rightskip) 0.0']
    // (a macro that begins a paragraph between paragraphs: its indent box holds the paragraph's point, pdfTeX's and LuaTeX's
    // literal, XeTeX's special; a destination of ours beside it, XeTeX's and dvipdfmx's special)
    const begun = (i: number, point: string) =>
      listing(i, '\\vbox(0.0+0.0)x345.0', [
        LINE,
        '..\\hbox(0.0+0.0)x10.0',
        `...${point}`,
        '...\\hbox(0.0+0.0)x10.0',
        ...ENDS,
      ])
    const log = [
      begun(0, '\\pdfliteral direct{/axt-q269 ri}'),
      begun(1, '\\special{pdf:code /axt-q3 ri}'),
      begun(2, '\\special{pdf:dest (axt-1s) [@thispage /XYZ @xpos @ypos null]}'),
      // (a literal of the paper's own: not known)
      begun(3, '\\pdfliteral direct{0 0 1 rg}'),
    ].join('\n')
    const asked = ['\\a{}', '\\b{}', '\\c{}', '\\d{}']
    expect(useAnswersOf(log, asked)).toEqual({ inkless: ['\\a{}', '\\b{}', '\\c{}'], inked: ['\\d{}'] })
    expect(readInkProbe(log, asked)).toEqual([])
  })
  it("reads a node's line TeX's log broke at its 79 columns as that node: a long write sets no ink, a long special or a glyph beside it does", () => {
    /** a node's line as the log holds it: broken at max_print_line's 79 columns, the rest on the lines below, no dots */
    const wrap = (line: string) => line.match(/.{1,79}/g)!
    // (a label's write as the loop's first pass lists it, its token list cut by TeX at max_print_line-10 and `\ETC.}` after)
    const write =
      '.\\write1{\\newlabel{our-own-key}{{1}{\\thepage }{The words of a heading of ours}{section.1}{}\\ETC.}'
    const special = '.\\special{ps: a string of words of our own that runs on past the columns of the log}'
    const PARA = [
      '.\\penalty 10000',
      '.\\glue(\\parskip) 0.0',
      '.\\hbox(0.0+0.0)x345.0, glue set 345.0fil',
      '..\\penalty 10000',
      '..\\glue(\\parfillskip) 0.0 plus 1.0fil',
      '..\\glue(\\rightskip) 0.0',
    ]
    expect(wrap(write).length).toBe(2)
    const log = [
      listing(0, NONE, wrap(write)),
      // (a sample used in a paragraph: its vertical box, the paragraph the document goes on with)
      listing(1, '\\vbox(0.0+0.0)x345.0', [...wrap(write), ...PARA]),
      // (a special may draw: not known, wrapped or not)
      listing(2, NONE, wrap(special)),
      listing(3, '\\hbox(4.3+0.0)x5.8', [...wrap(write), '.\\T1/cmr/m/n/10 x']),
      // (a node's line of the 79 columns TeX did not break: the next line, a node of its own, is read as one)
      listing(4, NONE, [`.\\write1{${'w'.repeat(69)}}`, '.\\T1/cmr/m/n/10 x']),
    ].join('\n')
    expect(`.\\write1{${'w'.repeat(69)}}`.length).toBe(79)
    const asked = ['\\label{one}', '\\label{two}', '\\ourspecial', '\\ourmark', '\\ourwrite']
    expect(readInkProbe(log, asked)).toEqual(['\\label{one}', '\\label{two}'])
    expect(useAnswersOf(log, asked)).toMatchObject({
      inkless: ['\\label{one}', '\\label{two}'],
      inked: ['\\ourspecial', '\\ourmark', '\\ourwrite'],
    })
  })
  it('gives no answer for a sample that took the token after it as its argument: it read past its own source', () => {
    // (the row ASK_TEX writes before the listing where the token after the sample was never reached)
    const eaten = (i: number) => listing(i, NONE, [], [`LAYOUT-PROBE 1 ink-eaten ${i}`])
    const log = [listing(0, NONE, []), eaten(1), listing(2, '\\hbox(4.3+0.0)x5.8', INKED)].join('\n')
    expect(useAnswersOf(log, ['\\nada{}', '\\urldef', '\\kw'])).toEqual({
      inkless: ['\\nada{}'],
      inked: ['\\kw'],
      texts: [['\\kw', ',']],
    })
  })
  it('takes each answered source’s answer over the probe’s, the probe’s where the use gave none', () => {
    const probe = ['\\kw', '\\tnote{b}', '\\undef']
    expect(mergeUses(probe, { inkless: ['\\nada'], inked: ['\\kw', '\\tnote{b}'] })).toEqual(['\\undef', '\\nada'])
    expect(mergeUses(probe, null)).toEqual(probe)
  })
  it('asks no sample whose own groups do not close in it', () => {
    expect(askable('\\nada{}')).toBe(true)
    expect(askable('\\begingroup')).toBe(false)
    expect(askable('\\endgroup{}')).toBe(false)
    expect(askable('\\bgroup x\\egroup')).toBe(true)
    // (nor one whose conditionals do not close in it: copied into a branch TeX skips, its \\fi would end that conditional)
    expect(askable('\\fi')).toBe(false)
    expect(askable('\\ifgeer')).toBe(false)
    expect(askable('\\else x')).toBe(false)
    expect(askable('\\ifx\\a\\b y\\else z\\fi')).toBe(true)
  })
})

const doc = String.raw`\documentclass{article}
\newcommand\kw{}
\newcommand\nada{}
\newcommand\capt{}
\begin{document}
\section{A title \nada}
Words \kw{} and \nada{} here, \begingroup\small a group\endgroup{} then.
\input{more}
\begin{figure}\caption{A caption \capt}\end{figure}
\bibliographystyle{plain}
\bibliography{refs}
\end{document}
`
const MORE = 'More \\kw{} words and \\capt{} there.\n'
const paperOf = () =>
  openPaper(
    new Map([
      ['main.tex', enc(doc)],
      ['more.tex', enc(MORE)],
      ['refs.bib', enc('@misc{a,title={x}}\n')],
    ]),
  )

const files = (paper: ReturnType<typeof paperOf>, asks: ReturnType<typeof askPlan> | null = null) =>
  originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES, statements: true, asks })

describe('where the asks stand (askPlan), and the marked files that carry them (originalFiles `asks`)', () => {
  it('asks each sample right before its first use in running text, none in a heading’s title or a caption, nor a group’s own edge', () => {
    const paper = paperOf()
    const plan = askPlan(paper.project, inkSamples(paper.units))
    expect(plan.asked).toEqual(['\\kw{}', '\\nada{}', '\\capt{}'])
    const f = files(paper, plan)
    const main = dec(f.get('main.tex')),
      more = dec(f.get('more.tex'))
    // (before the piece and the point that opens it, so that no mark is parted from its piece)
    expect(main).toMatch(/Words \\axtask\{0\}\{\\kw\{\}\}\\axtpma\{p\d+\.\d+a\}\\kw\{\}/)
    expect(main).toMatch(/\\axtask\{1\}\{\\nada\{\}\}\\axtpma\{p\d+\.\d+a\}\\nada\{\}/)
    expect(main.split('\n').find((l) => l.startsWith('\\section'))).not.toContain('axtask')
    expect(main.split('\n').find((l) => l.startsWith('\\begin{figure}'))).not.toContain('axtask')
    expect(main).not.toMatch(/axtask\{\d+\}\{\\(?:begingroup|endgroup)/)
    // (a sample's first use in another file asked there; its later uses not)
    expect(more).toMatch(/\\axtask\{2\}\{\\capt\{\}\}\\axtpma\{p\d+\.\d+a\}\\capt\{\}/)
    expect(main.match(/\\axtask\{\d/g)).toHaveLength(2)
  })
  it('writes ASK_TEX in the head, before the paper’s first byte: every line of the paper where it was, the bytes as without where none is asked', () => {
    const paper = paperOf()
    const plan = askPlan(paper.project, inkSamples(paper.units))
    const asked = files(paper, plan),
      plain = files(paper)
    const main = dec(asked.get('main.tex'))
    expect(ASK_TEX).not.toContain('\n')
    expect(main.slice(0, main.indexOf('\\documentclass{article}'))).toContain(ASK_TEX)
    expect(main.split('\n').length).toBe(dec(plain.get('main.tex')).split('\n').length)
    // (with the asks taken out, the marked files as without them)
    const strip = (t: string) =>
      t
        .split(ASK_TEX)
        .join('')
        .replace(/\\axtask\{\d+\}\{\\(?:kw|nada|capt)\{\}\}/g, '')
    for (const [path, b] of plain) expect(strip(dec(asked.get(path))), path).toBe(dec(b))
    for (const asks of [null, { at: new Map(), asked: [] }])
      expect([...files(paper, asks)].map(([p, b]) => [p, dec(b)])).toEqual([...plain].map(([p, b]) => [p, dec(b)]))
  })
  it('asks no sample whose source spans lines: its copy in the ask would move every line after it', () => {
    const p = openPaper(
      new Map([
        [
          'main.tex',
          enc(
            '\\documentclass{article}\n\\newcommand\\two[1]{}\n\\newcommand\\kw{}\n\\begin{document}\nA \\two{b\nc} d \\kw{} e.\n\\end{document}\n',
          ),
        ],
      ]),
    )
    const samples = inkSamples(p.units)
    expect(samples.some((s) => s.includes('\n'))).toBe(true)
    const plan = askPlan(p.project, samples)
    expect(plan.asked).toEqual(['\\kw{}'])
    const main = (asks: ReturnType<typeof askPlan> | null) => dec(files(p, asks).get('main.tex'))
    expect(main(plan).split('\n').length).toBe(main(null).split('\n').length)
  })
  it('asks no use right after a piece that may read it as its argument: a later use is asked', () => {
    const p = openPaper(
      new Map([
        [
          'main.tex',
          enc(
            '\\documentclass{article}\n\\newcommand\\kw{}\n\\begin{document}\nA \\urldef\\kw{} b.\n\nC \\kw{} d.\n\\end{document}\n',
          ),
        ],
      ]),
    )
    const plan = askPlan(p.project, ['\\kw{}'])
    expect(plan.asked).toEqual(['\\kw{}'])
    const main = dec(files(p, plan).get('main.tex'))
    expect(main).not.toMatch(/urldef[^\n]*axtask/)
    expect(main).toMatch(/C \\axtask\{0\}\{\\kw\{\}\}\\axtpma\{p\d+\.\d+a\}\\kw\{\} d\./)
  })
})

describe("an ask's wrapper a class wrote into a file, taken out of the files pass 1 hands on (withoutAsks)", () => {
  // (a class that writes a macro's argument as it stands copies the ask with the piece after it; TeX's \\write prints each
  // control word with one space after it)
  it('takes the wrapper by its grammar and its sample’s tokens: what the source had in its place, nothing', () => {
    const aux = '\\emailauthor{ada@example.org}{Ada Quill\\axtask {0}{\\corref {cor1}}\\corref {cor1}}\n'
    expect(withoutAsks(aux, ['\\corref{cor1}'])).toEqual({
      text: '\\emailauthor{ada@example.org}{Ada Quill\\corref {cor1}}\n',
      taken: 1,
      left: 0,
    })
    // (a copy of the source as written: no space after the control word)
    expect(withoutAsks('a\\axtask{1}{\\kw{}}\\kw{} b', ['\\nada{}', '\\kw{}']).text).toBe('a\\kw{} b')
    // (a sample's own groups, and braces a control symbol takes)
    expect(withoutAsks('\\axtask {0}{\\textbf {a{b}c}\\{}x', ['\\textbf{a{b}c}\\{']).text).toBe('x')
  })
  it('leaves what the grammar does not read: another index, another sample, another control word, an escaped backslash', () => {
    for (const [text, asked] of [
      ['\\axtask {2}{\\kw {}}', ['\\kw{}']],
      ['\\axtask {0}{\\kw {x}}', ['\\kw{}']],
      ['\\axtask {00}{\\kw {}}', ['\\kw{}']],
      ['\\axtasks {0}{\\kw {}}', ['\\kw{}']],
      ['\\\\axtask {0}{\\kw {}}', ['\\kw{}']],
      ['\\axtask {0}{\\kw {}', ['\\kw{}']],
    ] as [string, string[]][])
      expect(withoutAsks(text, asked)).toEqual({ text, taken: 0, left: 1 })
  })
})

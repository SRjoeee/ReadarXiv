import { describe, expect, it } from 'vitest'
import { keptFor, openPaper, translationFiles } from '@/pdf-reader/engine/live.mjs'
import { authorsTranslated, namedFonts, strategiesFor } from '@/pdf-reader/engine/scripts.mjs'

// How a translation is typeset around its text: the leading of translated units and the hyphenation of the English left

type Piece = { t: string; s?: string; tr?: boolean }
type Unit = { kind: string; pieces: Piece[] }
const META = { compiler: 'pdflatex', main: 'main.tex' }
/** the first strategy strategiesFor offers, the one tried first */
function first(meta: { compiler?: string }, lang: string) {
  const [strategy] = strategiesFor(meta, lang)
  if (!strategy) throw new Error(`no strategy for ${lang}`)
  return strategy
}
const SOURCE = '\\documentclass{article}\\begin{document}\n\\section{Method}\nThe first paragraph of prose.\n\nThe second paragraph of prose.\n\\end{document}\n'

/** the main file as typeset with the paragraphs `pick` chooses translated (their words replaced by a mark of their own) */
function typeset(lang: string, pick: (paragraphs: number[]) => number[]) {
  const p = openPaper(new Map([['main.tex', new TextEncoder().encode(SOURCE)]]))
  const units = p.units as Unit[]
  const paragraphs = units.flatMap((u, i) => (u.kind === 'para' ? [i] : []))
  const chosen = new Set(pick(paragraphs))
  const translated = new Map(units.flatMap((u, i) => (chosen.has(i) ? [[u, u.pieces.map(x => (x.t === 'text' ? { ...x, tr: true, s: `<T${i}>` } : x))]] : [])))
  const strategy = first({ ...META, ...p.meta }, lang)
  const files = translationFiles(p, translated as Map<(typeof p.units)[number], unknown[]>, { strategy, fonts: null, draft: false, aux: null, bbl: null })
  return { paragraphs, tex: new TextDecoder().decode(files.get('main.tex')) }
}

describe('strategies: CJK leading as a factor for translated units, English hyphenation kept', () => {
  it('Chinese: 1.3 × the paper\'s spacing, given to the units, and no \\linespread for the whole document', () => {
    const xe = first(META, 'zh')
    expect(xe.leading).toBe(1.3)
    expect(xe.pre(null)).not.toContain('linespread')
  })

  it('CJK targets keep the English hyphenation for the Latin text left; an alphabet takes its own', () => {
    for (const lang of ['zh', 'zh-TW', 'ja', 'ko']) expect(first(META, lang).pre(null)).toContain('hyphenrules=english')
    expect(first(META, 'de').pre(null)).not.toContain('hyphenrules')
  })

  it('XeLaTeX sets each face in an encoding it has: \\fontfamily switches between TU and T1 (2608.06007)', () => {
    const pre = first(META, 'zh').pre(null)
    expect(pre).toContain('\\csname fontfamily \\endcsname#1{\\axt@fontfamily{#1}\\axt@famenc}')
    expect(pre).toContain('\\renewcommand\\encodingdefault{TU}')
  })

  it('CJKutf8 closes its environment after the floats held to the end are set (2608.25210)', () => {
    const [, cjkutf8] = strategiesFor(META, 'zh')
    expect(cjkutf8?.pre(null)).toContain('\\AtEndDocument{\\clearpage\\end{CJK}}')
  })

  it('every strategy that loads fontspec leaves the paper\'s math as it is (2608.24503, amsart\'s abstract)', () => {
    for (const lang of ['zh', 'ja', 'ko']) expect(first(META, lang).pre(null)).toMatch(/^\\PassOptionsToPackage\{no-math\}\{fontspec\}\n\\usepackage\{xeCJK\}/)
    const [xe] = strategiesFor(META, 'ru')
    expect(xe?.pre(null)).toMatch(/^\\PassOptionsToPackage\{no-math\}\{fontspec\}\n\\usepackage\{fontspec\}/)
  })

  it('Japanese and Korean at the paper\'s own spacing carry no factor', () => {
    expect(first(META, 'ja').leading).toBeUndefined()
    expect(first(META, 'ko').leading).toBeUndefined()
  })
})

describe('translationFiles: the leading goes to translated units alone', () => {
  it('a translated paragraph gets \\axtlead before its start mark; one left in English and the heading do not', () => {
    const { paragraphs, tex } = typeset('zh', ps => ps.slice(0, 1))
    const [done = -1, left = -1] = paragraphs
    expect(tex).toContain(`\\axtlead{${done}}\\leavevmode\\axtmark{${done}s}`)
    expect(tex).not.toContain(`\\axtlead{${left}}`)
    expect(tex).toContain('\\section{Method}')
    expect(tex).toContain('\\protected\\def\\axtlead#1{')
    expect(tex).toContain('1.3\\baselineskip')
  })

  it('a paragraph opening on a run-in label gets its leading before the label\'s group, not inside it (2608.06007)', () => {
    const p = openPaper(new Map([['main.tex', new TextEncoder().encode('\\documentclass{article}\\begin{document}\n\\textbf{Label.} The prose after it.\n\\end{document}\n')]]))
    const units = p.units as Unit[]
    const translated = new Map(units.map(u => [u, u.pieces.map(x => (x.t === 'text' ? { ...x, tr: true, s: '<T>' } : x))]))
    const tex = new TextDecoder().decode(translationFiles(p, translated as never, { strategy: first(META, 'zh'), fonts: null, draft: false }).get('main.tex'))
    expect(tex).toMatch(/\\axtlead\{0\}\\textbf\{/)
  })

  it('a strategy with no factor adds neither the macro nor a call', () => {
    const { tex } = typeset('ja', ps => ps)
    expect(tex).not.toContain('axtlead')
  })
})

describe('the author block, by the target\'s script', () => {
  it('the CJK scripts, set by XeLaTeX, write the names their own way; Russian (pdfLaTeX) and the Latin script keep them', () => {
    expect(['zh', 'zh-TW', 'ja', 'ko'].map(authorsTranslated)).toEqual([true, true, true, true])
    expect(['ru', 'de', 'fr', 'vi'].map(authorsTranslated)).toEqual([false, false, false, false])
    const p = openPaper(new Map([['main.tex', new TextEncoder().encode('\\documentclass{article}\\author{Alice Smith}\\begin{document}\\maketitle\nThe prose of the paper.\n\\end{document}\n')]]))
    const author = (p.units as Unit[]).find(u => u.kind === 'author')
    expect(author && keptFor(p, 'zh').has(author as never)).toBe(false)
    expect(author && keptFor(p, 'de').has(author as never)).toBe(true)
  })
})

describe('a strategy that cannot take the author block sets it as the paper has it (2608.12096 under CJKutf8)', () => {
  it('CJKutf8 leaves the names in the source; XeLaTeX sets them translated, in \\axtwide should they not fit their box', () => {
    const p = openPaper(new Map([['main.tex', new TextEncoder().encode('\\documentclass{article}\\author{Alice Smith}\\begin{document}\\maketitle\nThe prose of the paper.\n\\end{document}\n')]]))
    const translated = new Map((p.units as Unit[]).map(u => [u, u.pieces.map(x => (x.t === 'text' ? { ...x, tr: true, s: '<T>' } : x))]))
    const [xe, cjkutf8] = strategiesFor(META, 'zh')
    const main = (strategy: typeof xe) => new TextDecoder().decode(translationFiles(p, translated as never, { strategy: strategy!, fonts: null, draft: false }).get('main.tex'))
    expect(main(xe)).toContain('\\author{\\axtwide{<T>}}')
    expect(main(cjkutf8)).toContain('\\author{Alice Smith}')
  })
})

describe('the last compile\'s references, given to the next', () => {
  it('go where TeX reads them, the project\'s root, whatever folder the main file is in (2608.12333\'s latex/arxiv.tex)', () => {
    // TeX runs in the project's root (BusyTeX: FS.chdir(project_dir); latexmk likewise) and reads <stem>.aux and
    // <stem>.bbl there; beside a main file in a folder, a one-pass compile set every reference as ?? and no bibliography
    const p = openPaper(new Map([['latex/arxiv.tex', new TextEncoder().encode(SOURCE)]]))
    expect(p.meta.main).toBe('latex/arxiv.tex')
    const files = translationFiles(p, new Map(), { strategy: first({ ...META, ...p.meta }, 'de'), fonts: null, draft: true, aux: '\\relax\n', bbl: '\\begin{thebibliography}{1}\\end{thebibliography}\n' })
    expect(['arxiv.aux', 'arxiv.bbl'].filter(f => files.has(f))).toEqual(['arxiv.aux', 'arxiv.bbl'])
    expect([...files.keys()].filter(f => /\.(aux|bbl)$/.test(f))).toEqual(['arxiv.aux', 'arxiv.bbl'])
  })
  it('a draft\'s contents lists, which only a pass\'s end writes from the aux: each list its \\@writefile lines\' text, beside the aux, a line cut short left out; the final\'s passes write their own (the F2 re-review\'s N2)', () => {
    // a one-pass draft reads its \tableofcontents from <stem>.toc, its \listoffigures from .lof, backref's back
    // references from .brf, each written at a pass's end from that pass's \@writefile lines; given the aux alone,
    // every list was set empty
    const p = openPaper(new Map([['latex/arxiv.tex', new TextEncoder().encode(SOURCE)]]))
    const aux = [
      '\\relax',
      '\\@writefile{toc}{\\contentsline {section}{\\numberline {1}Method}{1}{section.1}\\protected@file@percent }',
      '\\@writefile{lof}{\\addvspace {10\\p@ }}',
      '\\@writefile{toc}{\\contentsline {section}{\\numberline {2}Results}{3}{section.2}\\protected@file@percent }',
      '\\@writefile{lot}{\\contentsline {table}{\\numberline {1}{\\ignorespaces A caption TeX',
      '\\@writefile{brf}{\\backcite{a}{{1}{1}{section.1}}}',
      '\\newlabel{s}{{1}{1}}',
    ].join('\n')
    const files = (draft: boolean) => translationFiles(p, new Map(), { strategy: first({ ...META, ...p.meta }, 'de'), fonts: null, draft, aux })
    const text = (f: Map<string, Uint8Array>, path: string) => (f.has(path) ? new TextDecoder().decode(f.get(path)) : null)
    const draft = files(true)
    expect(text(draft, 'arxiv.toc')).toBe('\\contentsline {section}{\\numberline {1}Method}{1}{section.1}\\protected@file@percent \n\\contentsline {section}{\\numberline {2}Results}{3}{section.2}\\protected@file@percent \n')
    expect([text(draft, 'arxiv.lof'), text(draft, 'arxiv.brf'), text(draft, 'arxiv.lot')]).toEqual(['\\addvspace {10\\p@ }\n', '\\backcite{a}{{1}{1}{section.1}}\n', null])
    expect([...files(false).keys()].filter(f => f.startsWith('arxiv.'))).toEqual(['arxiv.aux'])
  })
  it('come from the paper itself only when it brings <stem>.bbl where TeX reads it, the root (the re-review of 2026-10-02, N3)', () => {
    const bbl = new TextEncoder().encode('\\begin{thebibliography}{1}\\end{thebibliography}\n')
    const brings = (at: string) => openPaper(new Map([['latex/arxiv.tex', new TextEncoder().encode(SOURCE)], [at, bbl]])).meta.bbl
    expect(brings('arxiv.bbl')).toBe(true)
    expect(brings('latex/arxiv.bbl')).toBe(false)
  })
})

describe('a font a paper\'s style loads by name, under a strategy that sets another encoding (1512.03385 into ru: "3.4. —åàºŁçàöŁÿ")', () => {
  const CVPR = '\\font\\cvprtenhv  = phvb at 8pt % *** IF THIS FAILS, SEE cvpr.sty ***\n\\font\\elvbf  = ptmb scaled 1100\n%\\font\\elvbf  = ptmb7t scaled 1100\n'
  // selected by the document's own switches, which apply NFSS's series and shape rules, and the font it lands on taken
  const FIXED = '\\begingroup\\fontencoding{\\encodingdefault}\\fontfamily{\\rmdefault}\\fontsize{11}{11}\\bfseries\\upshape\\selectfont\\global\\expandafter\\let\\expandafter\\elvbf\\the\\font\\endgroup'
  it('reads the text faces fontname\'s scheme names, at their size, and passes over the others', () => {
    expect(namedFonts([CVPR])).toEqual([{ cs: 'cvprtenhv', role: 'sf', bold: true, shape: 'up', size: 8 }, { cs: 'elvbf', role: 'rm', bold: true, shape: 'up', size: 11 }])
    expect(namedFonts(['\\font\\tenit=cmti10 \\font\\big=cmr10 scaled\\magstep2 \\font\\mono=pcrr7t at 9pt'])).toEqual([
      { cs: 'tenit', role: 'rm', bold: false, shape: 'it', size: 10 },
      { cs: 'big', role: 'rm', bold: false, shape: 'up', size: 14.4 },
      { cs: 'mono', role: 'tt', bold: false, shape: 'up', size: 9 },
    ])
    // in a text encoding only: not TS1's symbols nor a math encoding's (the review of fix/tex-path-errors, M4)
    expect(namedFonts(['\\font\\tc=ptmr8c \\font\\mi=ptmri7m \\font\\sy=ptmr7y \\font\\ot=ptmb7t at 9pt']).map(f => f.cs)).toEqual(['ot'])
    // where TeX reads it as the file is read: not in a macro's body, nor in a conditional the file opens at its top (aastex631's
    // \iftwelvepoint, acl.sty's \ifacl@linenumbers: M5); a macro of the name that takes its branches (etoolbox's \iftoggle,
    // wacv.sty's) is no conditional, nor are \newif's and \let's names
    expect(namedFonts(['\\newif\\iftwelvepoint\n\\def\\x{\\font\\inbody=ptmb}\n\\iftwelvepoint \\font\\foo=cmr12 \\else \\font\\foo=cmr10\\fi\n\\iftoggle{final}{\\relax}{}\n\\let\\ifq\\iftrue\n\\font\\elvbf = ptmb scaled 1100\n']).map(f => f.cs)).toEqual(['elvbf'])
    // a symbol font, another script's, a size TeX computes, a font TeX names at the time
    expect(namedFonts(['\\font\\astro@font=astrosym at 7pt \\font\\cyr=wncyr10 \\font\\bighelv=phvr at #1 \\font\\@IEEEPARstartfont\\fontname\\font\\space at 3pt'])).toEqual([])
  })
  it('declares them again in the document\'s encoding where the strategy sets another than the paper\'s: T1 and T2A under pdfLaTeX, TU under XeLaTeX', () => {
    const [xe, own] = strategiesFor(META, 'ru')
    const named = namedFonts([CVPR])
    const t2a = own?.pre({ rm: 'ptm', sf: 'phv', tt: 'pcr' }, named) ?? ''
    expect(t2a.indexOf(FIXED)).toBeGreaterThan(t2a.indexOf('\\__axt_substitute:nnnn {T2A} {ptm}'))
    expect(t2a.indexOf(FIXED)).toBeLessThan(t2a.indexOf('\\babelprovide'))
    const tu = xe?.pre({ rm: 'ptm', sf: 'phv', tt: 'pcr' }, named) ?? ''
    expect(tu.indexOf(FIXED)).toBeGreaterThan(tu.indexOf('\\setmonofont'))
    // the paper's own encoding: its fonts as they are
    // not the default names as NFSS's values: no font definition declares the shape up, and CM's sans under T2A has bx
    // and no b (the review of fix/tex-path-errors, I1: NAACL's bold ruler on a CM paper came out medium)
    for (const pre of [t2a, tu]) expect(pre).not.toMatch(/\\DeclareFixedFont|\\updefault|\{\\bfdefault\}/)
    expect(t2a).toContain('\\fontfamily{\\sfdefault}\\fontsize{8}{8}\\bfseries\\upshape\\selectfont\\global\\expandafter\\let\\expandafter\\cvprtenhv\\the\\font')
    // a Latin target's T1: declared again for a paper in OT1 (or of no probe: LaTeX's default), not for one already in T1
    expect(first(META, 'de').pre({ rm: 'ptm', enc: 'OT1' }, named)).toContain(FIXED)
    expect(first(META, 'de').pre({ rm: 'ptm', enc: 'T1' }, named)).not.toContain('\\the\\font')
    expect(strategiesFor(META, 'zh').map(s => s.pre(null, named)).join('')).not.toContain('\\the\\font')
  })
  it('from the paper\'s own files, a style beside the main file\'s', () => {
    const files = new Map([['main.tex', '\\documentclass{article}\\usepackage{cvpr}\\begin{document}\nThe first paragraph of prose.\n\\end{document}\n'], ['cvpr.sty', CVPR]].map(([k, v]) => [k as string, new TextEncoder().encode(v as string)]))
    const p = openPaper(files)
    const main = (lang: string) => new TextDecoder().decode(translationFiles(p, new Map(), { strategy: first({ ...META, ...p.meta }, lang), fonts: null, draft: false, aux: null, bbl: null }).get('main.tex'))
    expect(main('ru')).toContain(FIXED)
    expect(main('fr')).toContain(FIXED)
    expect(main('zh')).not.toContain('\\let\\expandafter\\elvbf')
  })
  it('from every file TeX may read, as TeX finds it: a preamble\'s \\input, a package by its path, a file a style \\inputs (the re-review, N1)', () => {
    const FONT = '\\font\\elvbf  = ptmb scaled 1100\n'
    const ru = (files: Record<string, string>) => {
      const p = openPaper(new Map(Object.entries(files).map(([k, v]) => [k, new TextEncoder().encode(v)])))
      return new TextDecoder().decode(translationFiles(p, new Map(), { strategy: first({ ...META, ...p.meta }, 'ru'), fonts: null, draft: false, aux: null, bbl: null }).get('main.tex'))
    }
    const main = (preamble: string) => `\\documentclass{article}${preamble}\\begin{document}\nThe first paragraph of prose.\n\\end{document}\n`
    const read: [string, Record<string, string>][] = [
      ['\\input{fonts}', { 'main.tex': main('\\input{fonts}'), 'fonts.tex': FONT }],
      ['\\input{fonts.tex}', { 'main.tex': main('\\input{fonts.tex}'), 'fonts.tex': FONT }],
      ['\\input fonts', { 'main.tex': main('\\input fonts\n'), 'fonts.tex': FONT }],
      ['\\usepackage{sty/cvpr}', { 'main.tex': main('\\usepackage{sty/cvpr}'), 'sty/cvpr.sty': FONT }],
      ['\\usepackage{./cvpr}', { 'main.tex': main('\\usepackage{./cvpr}'), 'cvpr.sty': FONT }],
      ['a style\'s \\input{fontsdef}', { 'main.tex': main('\\usepackage{outer}'), 'outer.sty': '\\input{fontsdef}\n', 'fontsdef.tex': FONT }],
      ['a style\'s \\input{sub/fonts}', { 'main.tex': main('\\usepackage{cvpr}'), 'cvpr.sty': '\\input{sub/fonts}\n', 'sub/fonts.tex': FONT }],
      ['an \\input in a macro TeX runs', { 'main.tex': main('\\newcommand\\setupfonts{\\input{fonts}}\\setupfonts'), 'fonts.tex': FONT }],
      ['a name TeX makes, \\input{\\jobname-fonts}: any file', { 'main.tex': main('\\input{\\jobname-fonts}'), 'main-fonts.tex': FONT }],
    ]
    for (const [how, files] of read) expect(ru(files), how).toContain(FIXED)
    // a file no load names, and one named in a comment alone, TeX does not read
    expect(ru({ 'main.tex': main('% \\usepackage{cvpr}\n'), 'cvpr.sty': FONT, 'stray.tex': FONT })).not.toContain('\\let\\expandafter\\elvbf')
  })
  it('from the files TeX reads alone: a style loaded by one the paper loads, not one it never loads (M5)', () => {
    const files = new Map([
      ['main.tex', '\\documentclass{article}\\usepackage{outer}\\begin{document}\nThe first paragraph of prose.\n\\end{document}\n'],
      ['outer.sty', '\\RequirePackage{inner}\n'],
      ['inner.sty', '\\font\\elvbf  = ptmb scaled 1100\n'],
      ['unused.sty', '\\font\\stray = phvb at 8pt\n'],
    ].map(([k, v]) => [k as string, new TextEncoder().encode(v as string)]))
    const p = openPaper(files)
    const tex = new TextDecoder().decode(translationFiles(p, new Map(), { strategy: first({ ...META, ...p.meta }, 'ru'), fonts: null, draft: false, aux: null, bbl: null }).get('main.tex'))
    expect(tex).toContain(FIXED)
    expect(tex).not.toContain('\\stray')
  })
})

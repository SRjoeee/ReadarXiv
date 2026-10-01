import { describe, expect, it } from 'vitest'
import { keptFor, openPaper, translationFiles } from '@/pdf-reader/engine/live.mjs'
import { authorsTranslated, strategiesFor } from '@/pdf-reader/engine/scripts.mjs'

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
    const [, xe] = strategiesFor(META, 'ru')
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
})

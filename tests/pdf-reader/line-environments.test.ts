import { describe, expect, it } from 'vitest'
import { inMemory, loadProject, patch } from '@/pdf-reader/engine/latex-front.mjs'
import { openPaper, originalFiles, translationFiles } from '@/pdf-reader/engine/live.mjs'
import { strategiesFor } from '@/pdf-reader/engine/scripts.mjs'
import { typesetting } from '@/pdf-reader/engine/typeset/tex.mjs'
import { DESIGN } from '@/pdf-reader/engine/typeset/type.mjs'

// Environments TeX reads line by line until a line holding their \end — verbatim's kind and comment.sty's — and what
// the reader writes into a paper's lines around them. comment.sty ends its environment only at a line that is
// `\end{comment}` and nothing more: the line probe written after it, on its line, kept 2608.16117's comment open to the
// end of its file, and its marked original failed (`\end{comment}\axtlines{14}`). verbatim.sty and fancyvrb drop what
// follows their \end on its line, comment.sty what follows its \begin. Under TeX the cases are compiled natively by
// experiments/pdf-bilingual/spikes/line-env-cases.mjs; here, what goes where

type Piece = { t: string; s?: string; tr?: boolean }
type Unit = { kind: string; pieces: Piece[]; front?: boolean }
const enc = (s: string) => new TextEncoder().encode(s)
const PREAMBLE = [
  '\\documentclass{article}',
  '\\usepackage{comment}\\usepackage{fancyvrb}\\usepackage{listings}',
  '\\excludecomment{hidden}',
  '\\specialcomment{boxed}{\\begingroup\\itshape}{\\endgroup}',
  '\\lstnewenvironment{code}{}{}',
  '\\DefineVerbatimEnvironment{MyVerbatim}{Verbatim}{}',
].join('\n')
const BODY = [
  'A paragraph before the comment.',
  '\\begin{comment}',
  'Hidden words.',
  '\\end{comment}',
  'The paragraph after the comment.',
  '',
  '\\begin{verbatim}',
  'x = 1',
  '\\end{verbatim}',
  '   The paragraph after verbatim, indented.',
  '',
  '\\begin{verbatim*}',
  'y = 2',
  '\\end{verbatim*}',
  'The paragraph after a starred verbatim.',
  '',
  '\\begin{lstlisting}',
  'z = 3',
  '\\end{lstlisting}',
  '\\textbf{Label.} The paragraph after a listing, begun bold.',
  '',
  '\\begin{Verbatim}',
  'w = 4',
  '\\end{Verbatim}',
  'The paragraph after fancyvrb.',
  '',
  '\\begin{hidden}',
  'Excluded words.',
  '\\end{hidden}',
  'The paragraph after an excluded comment of the paper\'s own.',
  '',
  '\\begin{boxed}',
  'The paragraph inside a special comment.',
  '\\end{boxed}',
  '',
  '\\begin{code}',
  'v = 5',
  '\\end{code}',
  'The paragraph after a listing environment of the paper\'s own.',
  '',
  '\\begin{MyVerbatim}',
  'u = 6',
  '\\end{MyVerbatim}',
  'The paragraph after a verbatim environment of the paper\'s own.',
  '',
  '\\begin{figure}\\caption{A caption.}\\end{figure}',
  'The paragraph after a figure.',
].join('\n')
const SOURCE = `${PREAMBLE}\n\\begin{document}\n${BODY}\n\\end{document}\n`
/** the environments TeX reads by lines, in the source above */
const LINE_ENVS = ['comment', 'verbatim', 'verbatim\\*', 'lstlisting', 'Verbatim', 'hidden', 'boxed', 'code', 'MyVerbatim']
const paper = (source = SOURCE) => openPaper(new Map([['main.tex', enc(source)]]))
const text = (files: Map<string, Uint8Array>) => new TextDecoder().decode(files.get('main.tex'))
/** every unit translated, its words a mark of its own: its leading and trailing space pieces of their own, as a whole
 *  translation comes back (mt.mjs rehydrate), or `runs`, in the piece, as one translated run by run does */
const translate = (units: Unit[], runs = false) => new Map(units.map((u, i) => [u, u.pieces.flatMap((x, k): Piece[] => {
  if (x.t !== 'text' || !/\S/.test(x.s ?? '')) return [x]
  const lead = k === 0 ? (x.s ?? '').match(/^\s*/)?.[0] ?? '' : '', trail = k === u.pieces.length - 1 ? (x.s ?? '').match(/\s*$/)?.[0] ?? '' : ''
  return runs ? [{ ...x, tr: true, s: `${lead}<T${i}>${trail}` }] : [...(lead ? [{ t: 'text', s: lead }] : []), { ...x, tr: true, s: `<T${i}>` }, ...(trail ? [{ t: 'text', s: trail }] : [])]
})]))
/** the lines that hold a line-read environment's \begin or \end with anything after it */
const crowded = (tex: string) => tex.split('\n').filter(line => LINE_ENVS.some(e => new RegExp(`\\\\(?:begin|end)\\{${e}\\}\\s*\\S`).test(line)))
const indexOf = (p: ReturnType<typeof paper>, words: string) => (p.units as Unit[]).findIndex(u => u.pieces.some(x => x.t === 'text' && x.s?.includes(words)))
/** a typesetting plan for the first strategy of Chinese: every unit's leading and size, as the rule writes them */
const planned = (p: ReturnType<typeof paper>) => {
  const [xe] = strategiesFor({ compiler: 'pdflatex' }, 'zh')
  if (!xe) throw new Error('no strategy')
  const all = new Map(p.units.map((_, i) => [i, 1.1]))
  return { xe, typeset: typesetting(p.units, { design: DESIGN.Hans, strategy: xe.name, type: { lead: 1.35, track: 0, scale: 1 }, leads: all, sizes: new Map(all), floatsAt: new Map(), tableMin: 0.85 }) }
}

describe('nothing of the reader\'s on a line an environment read by lines must have to itself', () => {
  it('the marked original with its line probes: each probe past the line end after the environment, before the unit\'s first word (2608.16117)', () => {
    const p = paper(), tex = text(originalFiles(p, { lines: true }))
    expect(crowded(tex)).toEqual([])
    const after = indexOf(p, 'after the comment')
    expect(tex).toContain(`\\end{comment}\n\\axtlines{${after}}\\leavevmode\\axtmark{${after}s}The paragraph after the comment.`)
    // after the line end's own spaces too: a probe before them would be followed by a space TeX reads where it read none
    const indented = indexOf(p, 'after verbatim, indented')
    expect(tex).toContain(`\\end{verbatim}\n   \\axtlines{${indented}}\\leavevmode\\axtmark{${indented}s}The paragraph after verbatim, indented.`)
    // outside the group a run-in label opens, as everywhere
    const bold = indexOf(p, 'begun bold')
    expect(tex).toContain(`\\end{lstlisting}\n\\axtlines{${bold}}\\textbf{`)
    // inside a special comment, which TeX sets from the lines it writes out: on the line after its \\begin
    const inside = indexOf(p, 'inside a special comment')
    expect(tex).toContain(`\\begin{boxed}\n\\axtlines{${inside}}\\leavevmode\\axtmark{${inside}s}The paragraph inside`)
  })

  it('every marked unit keeps its probe', () => {
    const p = paper(), tex = text(originalFiles(p, { lines: true }))
    const marked = (p.units as Unit[]).map((u, i) => [u, i] as const).filter(([u]) => u.kind === 'para')
    expect(marked.length).toBeGreaterThan(8)
    for (const [, i] of marked) expect(tex).toContain(`\\axtlines{${i}}`)
  })

  it('an environment whose end TeX reads as a command keeps the probe where its unit begins, as before', () => {
    const p = paper(), tex = text(originalFiles(p, { lines: true }))
    expect(tex).toContain(`\\end{figure}\\axtlines{${indexOf(p, 'after a figure')}}\n`)
  })

  it('the translation as the rule sets it — its previews and measures, and the final — and as a strategy\'s leading sets it', () => {
    const p = paper(), translated = translate(p.units as Unit[]), { xe, typeset } = planned(p)
    const after = indexOf(p, 'after the comment')
    const draft = text(translationFiles(p, translated as never, { strategy: xe, fonts: null, draft: true, aux: null, bbl: null, typeset }))
    expect(crowded(draft)).toEqual([])
    expect(draft).toContain(`\\end{comment}\n\\axtlines{${after}}\\axtsize{${after}}\\axtlead{${after}}\\leavevmode\\axtmark{${after}s}<T${after}>`)
    const final = text(translationFiles(p, translated as never, { strategy: xe, fonts: null, draft: false, aux: null, bbl: null, typeset: typeset.final }))
    expect(crowded(final)).toEqual([])
    expect(final).toContain(`\\end{comment}\n\\axtsize{${after}}\\axtlead{${after}}`)
    const today = text(translationFiles(p, translated as never, { strategy: xe, fonts: null, draft: false, aux: null, bbl: null }))
    expect(crowded(today)).toEqual([])
    expect(today).toContain(`\\end{comment}\n\\axtlead{${after}}\\leavevmode\\axtmark{${after}s}<T${after}>`)
    const byRuns = text(translationFiles(p, translate(p.units as Unit[], true) as never, { strategy: xe, fonts: null, draft: false, aux: null, bbl: null }))
    expect(crowded(byRuns)).toEqual([])
    expect(byRuns).toContain(`\\end{comment}\n\\axtlead{${after}}\\leavevmode\\axtmark{${after}s}<T${after}>`)
  })

  it('a unit in another file, after an environment of the paper\'s own defined in a class it ships', () => {
    const p = openPaper(new Map([
      ['main.tex', enc('\\documentclass{paperclass}\n\\begin{document}\n\\input{sections/a}\n\\end{document}\n')],
      ['paperclass.cls', enc('\\LoadClass{article}\n\\RequirePackage{comment}\n\\excludecomment{CCSXML}\n')],
      ['sections/a.tex', enc('\\begin{CCSXML}\n<ccs2012/>\n\\end{CCSXML}\nThe paragraph after the class\'s comment.\n')],
    ]))
    const tex = new TextDecoder().decode(originalFiles(p, { lines: true }).get('sections/a.tex'))
    const after = indexOf(p, 'after the class')
    expect(tex).toContain(`\\end{CCSXML}\n\\axtlines{${after}}\\leavevmode`)
  })

  it('an environment of the paper\'s own whose name ends in a star', () => {
    const p = paper(`${PREAMBLE}\n\\DefineVerbatimEnvironment{Code*}{Verbatim}{}\n\\begin{document}\n\\begin{Code*}\nt = 7\n\\end{Code*}\nThe paragraph after a starred environment of the paper's own.\n\\end{document}\n`)
    const i = indexOf(p, 'after a starred environment')
    expect(text(originalFiles(p, { lines: true }))).toContain(`\\end{Code*}\n\\axtlines{${i}}\\leavevmode\\axtmark{${i}s}The paragraph after a starred`)
  })

  it('acmart\'s acknowledgements, a comment.sty environment of a class a paper need not ship: the probe on the line after its \\begin', () => {
    const p = openPaper(new Map([['main.tex', enc('\\documentclass{acmart}\n\\begin{document}\nA paragraph.\n\n\\begin{acks}\nWe thank the reviewers.\n\\end{acks}\n\\end{document}\n')]]))
    const i = indexOf(p, 'We thank')
    expect(text(originalFiles(p, { lines: true }))).toContain(`\\begin{acks}\n\\axtlines{${i}}\\leavevmode\\axtmark{${i}s}We thank`)
  })

  it('a unit whose own words share the line after the environment\'s end — the paper\'s choice — is marked where it begins, as before', () => {
    const p = paper(`${PREAMBLE}\n\\begin{document}\n\\begin{verbatim}\nx\n\\end{verbatim} Words on the same line.\n\\end{document}\n`)
    const i = indexOf(p, 'Words on the same line')
    expect(text(originalFiles(p, { lines: true }))).toContain(`\\end{verbatim}\\axtlines{${i}} \\leavevmode\\axtmark{${i}s}Words`)
  })
})

describe('a table holding an environment read by lines is not fitted', () => {
  const withTables = (tex: string) => loadProject(inMemory(new Map([['main.tex', enc(tex)]])), 'main.tex', { tables: true })
  const fitted = (body: string) => {
    const p = withTables(`${PREAMBLE}\n\\begin{document}\n${body}\n\\end{document}\n`), units = p.units as Unit[]
    return new TextDecoder().decode(patch(p, translate(units) as Map<(typeof p.units)[number], unknown[]>).get('main.tex')).includes('\\axtfit{')
  }
  it('\\axtfit takes the table as an argument, read before TeX could read the environment\'s lines: a comment, the paper\'s own, a verbatim kind', () => {
    expect(fitted('\\begin{tabular}{l}\nA cell \\\\\n\\end{tabular}')).toBe(true)
    expect(fitted('\\begin{tabular}{l}\nA cell \\\\\n\\begin{comment}\nA row hidden \\\\\n\\end{comment}\n\\end{tabular}')).toBe(false)
    expect(fitted('\\begin{tabular}{l}\nA cell \\\\\n\\begin{hidden}\nA row hidden \\\\\n\\end{hidden}\n\\end{tabular}')).toBe(false)
    expect(fitted('\\begin{tabular}{l}\nA cell \\\\\n\\begin{Verbatim}\nx\n\\end{Verbatim}\n\\end{tabular}')).toBe(false)
    expect(fitted('\\DefineVerbatimEnvironment{Code*}{Verbatim}{}\n\\begin{tabular}{l}\nA cell \\\\\n\\begin{Code*}\nx\n\\end{Code*}\n\\end{tabular}')).toBe(false)
  })
  it('what stands in a TeX comment TeX never reads: the table stays fitted', () => {
    expect(fitted('\\begin{tabular}{l}\nA cell \\\\ % \\begin{comment} was here once\n\\end{tabular}')).toBe(true)
    expect(fitted('\\begin{tabular}{l}\nA cell \\\\% \\begin{verbatim}\n\\end{tabular}')).toBe(true)
    expect(fitted('\\begin{tabular}{l}\nA cell % \\verb|x| was here once\n\\end{tabular}')).toBe(true)
    expect(fitted('\\begin{tabular}{l}\nA cell of 5\\% \\begin{comment}\nA row hidden \\\\\n\\end{comment}\n\\end{tabular}')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { lastTexLog, MARK_DEF } from '@/pdf-reader/engine/latex-front.mjs'
import { openPaper, originalFiles, probeFiles, translationFiles } from '@/pdf-reader/engine/live.mjs'
import { readSizeProbe, readWidthProbe } from '@/pdf-reader/engine/typeset/density.mjs'
import { strategiesFor } from '@/pdf-reader/engine/scripts.mjs'
import { FLOAT_TEX, LINES_TEX, readForced, readLines, SIZE_TEX, typesetting } from '@/pdf-reader/engine/typeset/tex.mjs'
import { DESIGN, designFor } from '@/pdf-reader/engine/typeset/type.mjs'

// What the typesetting rule writes into a compile and reads back from its log. The macros' behaviour under TeX is checked
// natively by experiments/pdf-bilingual/spikes/typeset-check.mjs; here, what goes where

type Piece = { t: string; s?: string; tr?: boolean }
type Unit = { kind: string; pieces: Piece[]; front?: boolean }
const SOURCE = '\\documentclass{article}\\begin{document}\n\\section{Method}\nThe first paragraph of prose.\n\nThe second paragraph of prose.\n\\begin{figure}\\caption{A caption.}\\end{figure}\n\\end{document}\n'
const paper = () => openPaper(new Map([['main.tex', new TextEncoder().encode(SOURCE)]]))
const text = (files: Map<string, Uint8Array>) => new TextDecoder().decode(files.get('main.tex'))
/** every unit but the ones `skip` names translated, its words a mark of its own */
const translate = (units: Unit[], skip = new Set<number>()) => new Map(units.flatMap((u, i) => (skip.has(i) ? [] : [[u, u.pieces.map(x => (x.t === 'text' ? { ...x, tr: true, s: `<T${i}>` } : x))]])))
/** the first strategy strategiesFor offers, the one tried first */
function first(lang: string) {
  const [strategy] = strategiesFor({ compiler: 'pdflatex' }, lang)
  if (!strategy) throw new Error(`no strategy for ${lang}`)
  return strategy
}
const kindsOf = (units: Unit[]) => units.map((u, i) => [u.kind, i] as const)

describe('the log the rule reads', () => {
  it('reads each unit\'s lines, leading and size', () => {
    const lines = readLines('x\nAXT-LINES 3 5 13.6pt 10.95\nAXT-LINES 7 1 12.0pt\n')
    expect(lines.get(3)).toEqual({ lines: 5, bs: 13.6, size: 10.95 })
    expect(lines.get(7)).toEqual({ lines: 1, bs: 12 })
    expect(readLines(null).size).toBe(0)
  })
  it('takes the unit after each forced break, the next one whose lines the log gives', () => {
    expect([...readForced('AXT-LINES 1 2 12pt\nAXT-FORCED\nAXT-FORCED\nAXT-LINES 4 2 12pt\nAXT-LINES 5 2 12pt\nAXT-FORCED\n')]).toEqual([4])
    expect(readForced('').size).toBe(0)
  })
  it('reports a column made at a forced break, and lines through \\message (\\typeout reads \\prevgraf as 0)', () => {
    expect(LINES_TEX).toContain('\\ifnum\\outputpenalty=-\\@M\\message{^^JAXT-FORCED^^J}')
    expect(LINES_TEX).toContain('\\message{^^JAXT-LINES #1')
  })
  it('reads the last TeX pass of the browser compiler\'s joined log, not its earlier passes or the terminal\'s echo', () => {
    // one step as BusyTeX's pipeline writes it (poc-site/tex.js): the step's log, then the terminal's output, which
    // repeats every \message — a forced break at one pass's end read before the next pass's first unit invents a break
    const step = (cmd: string, log: string, echo = log) => [`$ ${cmd}`, 'EXITCODE: 0', '', 'TEXMFLOG:', '', '==', 'MISSFONTLOG:', '', '==', 'LOG:', log, '==', 'STDOUT:', echo, '==', 'STDERR:', '', '======'].join('\n')
    const pass = (bs: string) => `AXT-WIDTH 1071.0pt 12 241.0pt\nAXT-SIZE 0.9 900.0pt 1000.0pt\nAXT-LINES 1 2 ${bs}pt 10\nAXT-LINES 2 3 ${bs}pt 10\nAXT-FORCED\n`
    const joined = [step('pdflatex x.tex', pass('11.0')), step('bibtex x', ''), step('pdflatex x.tex', pass('12.0'), `noise\n${pass('12.0')}`), step('xdvipdfmx x.xdv', 'AXT-LINES 9 9 99pt')].join('\n\n')
    expect([...readLines(joined)]).toEqual([...readLines(pass('12.0'))])
    expect([...readForced(joined)]).toEqual([])
    expect(readWidthProbe(joined)).toEqual(readWidthProbe(pass('12.0')))
    expect(readSizeProbe(joined)).toEqual(readSizeProbe(pass('12.0')))
    expect(lastTexLog(joined)).toBe(pass('12.0'))
    expect(lastTexLog(pass('12.0'))).toBe(pass('12.0'))
  })
  it('restores a unit\'s size from a snapshot, the leading before it noted for the unit\'s own', () => {
    expect(SIZE_TEX).toContain('\\let\\axt@szset\\@empty')
    expect(SIZE_TEX).toContain('\\edef\\axt@leadbefore{\\the\\baselineskip}')
  })
})

describe('a typeset plan in the compile', () => {
  const p = paper(), units = p.units as Unit[]
  const para = units.findIndex(u => u.kind === 'para'), caption = units.findIndex(u => u.kind === 'caption'), heading = units.findIndex(u => u.kind === 'heading')
  /** a plan solved for the first strategy of a CJK target (xeCJK) or of an alphabet's (the paper's own engine) */
  const plan = (cjk: boolean, extra: Partial<Parameters<typeof typesetting>[1]> = {}) => typesetting(p.units, {
    design: cjk ? DESIGN.Hans : DESIGN.Latn, strategy: first(cjk ? 'zh' : 'de').name, type: cjk ? { lead: 1.35, track: 0.02, scale: 0.97 } : { lead: 1.02, size: 0.95 },
    leads: new Map([[para, 1.1]]), sizes: new Map(), floatsAt: new Map(), tableMin: 0.85, ...extra,
  })

  it('has the units found that the cases rely on', () => {
    expect(kindsOf(units).map(([k]) => k)).toEqual(expect.arrayContaining(['heading', 'para', 'caption']))
  })
  it('defines each unit\'s leading, size and float page, the line probes always, sizes and floats only when used', () => {
    const bare = plan(false).head
    expect(bare).toContain(LINES_TEX)
    expect(bare).not.toContain(SIZE_TEX)
    expect(bare).not.toContain(FLOAT_TEX)
    expect(bare).toContain(`\\expandafter\\def\\csname axtlead@${para}\\endcsname{1.1000}`)
    expect(bare).toContain('\\axtfitheighttrue')
    const full = plan(true, { sizes: new Map([[para, 0.95]]), floatsAt: new Map([[caption, { page: 2, col: 1 }]]) }).head
    expect(full).toContain(SIZE_TEX)
    expect(full).toContain(FLOAT_TEX)
    expect(full).toContain(`axtsize@${para}\\endcsname{0.9500}`)
    expect(full).toContain(`axt@fp@${caption}\\endcsname{2 1}`)
  })
  it('sets a CJK type on the face and the glue, and an alphabet\'s leading alone (its size on the units)', () => {
    const base = first('zh')
    const zh = plan(true).strategy(base)
    expect(zh.leading).toBe(1.35)
    expect(zh.pre(null)).toContain('Scale=0.9700,')
    expect(zh.pre(null)).toContain('CJKglue={\\hskip 0.0200em')
    const de = plan(false).strategy(first('de'))
    expect(de.leading).toBe(1.02)
    expect(de.pre(null)).toBe(first('de').pre(null))
  })
  it('sets a CJK type under the pdfLaTeX fallback, CJKutf8, as its design has it: the leading, and a size on the units', () => {
    const [, cjkutf8] = strategiesFor({ compiler: 'pdflatex' }, 'zh')
    const design = cjkutf8 && designFor('Hans', cjkutf8)
    if (!cjkutf8 || !design) throw new Error('no fallback strategy')
    const typeset = typesetting(p.units, { design, strategy: cjkutf8.name, type: { lead: 1.35, size: 0.96, h: 0.96 }, leads: new Map([[para, 1.1]]), sizes: new Map([[para, 0.96]]), floatsAt: new Map(), tableMin: 0.85 })
    const fallback = typeset.strategy(cjkutf8)
    expect(fallback.leading).toBe(1.35)
    expect(fallback.pre(null)).toBe(cjkutf8.pre(null))
    expect(text(translationFiles(p, translate(units) as never, { strategy: cjkutf8, fonts: null, draft: false, aux: null, bbl: null, typeset }))).toContain(`\\axtsize{${para}}`)
  })
  it('sets only the strategy it was solved for; another is set as today, and the refusal noted', () => {
    const [xe, cjkutf8] = strategiesFor({ compiler: 'pdflatex' }, 'zh')
    if (!xe || !cjkutf8) throw new Error('no strategies')
    expect(plan(true).strategy(xe).leading).toBe(1.35)
    expect(plan(true).strategy(cjkutf8)).toBe(cjkutf8)
    const notes: unknown[][] = [], translated = translate(units)
    const refused = text(translationFiles(p, translated as never, { strategy: cjkutf8, fonts: null, draft: false, aux: null, bbl: null, typeset: plan(true), note: (...a: unknown[]) => notes.push(a) }))
    expect(refused).toBe(text(translationFiles(p, translated as never, { strategy: cjkutf8, fonts: null, draft: false, aux: null, bbl: null })))
    expect(notes).toEqual([['typeset refused', { plan: xe.name, strategy: cjkutf8.name }]])
  })
  it('marks only translated units: their float, line probe, size and leading, in that order', () => {
    const typeset = plan(false, { sizes: new Map([[para, 0.95], [heading, 0.95]]), floatsAt: new Map([[caption, { page: 1, col: 0 }]]) })
    const translated = translate(units)
    const tex = text(translationFiles(p, translated as never, { strategy: first('de'), fonts: null, draft: false, aux: null, bbl: null, typeset }))
    expect(tex).toContain(`\\axtlines{${para}}\\axtsize{${para}}\\axtlead{${para}}`)
    expect(tex).toContain(`\\axtfloatat{${caption}}\\axtlines{${caption}}`)
    expect(tex).toContain(`\\axtsizein{${heading}}`)
    expect(tex.indexOf('\\axtfitheighttrue')).toBeLessThan(tex.indexOf('\\documentclass'))
    const untranslated = text(translationFiles(p, translate(units, new Set([para])) as never, { strategy: first('de'), fonts: null, draft: false, aux: null, bbl: null, typeset }))
    expect(untranslated).not.toContain(`\\axtlines{${para}}`)
    // the reader's final: the same but the line probes, which nothing reads there (the F2 review's M7)
    const final = text(translationFiles(p, translated as never, { strategy: first('de'), fonts: null, draft: false, aux: null, bbl: null, typeset: typeset.final }))
    expect(final).toContain(`\\axtfloatat{${caption}}`)
    expect([final.includes(`\\axtsize{${para}}\\axtlead{${para}}`), final.includes('\\axtlines{'), final.includes('AXT-LINES')]).toEqual([true, false, false])
  })
})

describe('the probes the rule needs', () => {
  it('marks every page with the columns its units were set in, whichever way the class sets them', () => {
    // the most columns at any mark since the last page went out, or as this one goes out
    expect(MARK_DEF).toContain('\\protected\\def\\axtmark#1{\\axt@colseen\\axt@dest{#1}}')
    expect(MARK_DEF).toContain('\\AddToHook{shipout/background}{\\axt@colseen\\put(0,0){\\axt@dest{c\\axt@colmax-')
    for (const flag of ['\\pagegrid@col', '\\col@number', '\\if@twocolumn']) expect(MARK_DEF).toContain(flag)
    expect(text(originalFiles(paper()))).toContain(MARK_DEF)
  })
  it('adds the width and size probes to the font probe when asked', () => {
    expect(text(probeFiles(paper()))).not.toContain('AXT-WIDTH')
    expect(text(probeFiles(paper(), { width: true }))).toContain('AXT-WIDTH')
    expect(text(probeFiles(paper(), { width: true }))).toContain('AXT-SIZE')
  })
  it('gives the original a line probe before every unit mark when asked', () => {
    const p = paper(), para = (p.units as Unit[]).findIndex(u => u.kind === 'para')
    expect(text(originalFiles(p))).not.toContain('\\axtlines')
    const lined = text(originalFiles(p, { lines: true }))
    expect(lined).toContain(LINES_TEX)
    expect(lined).toContain(`\\axtlines{${para}}`)
  })
})

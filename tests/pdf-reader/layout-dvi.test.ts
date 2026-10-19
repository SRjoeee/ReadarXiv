import { describe, expect, it } from 'vitest'
import { DVI_MARK_DEF, MARK_DEF, dviEngine } from '@/pdf-reader/engine/source/latex-front.mjs'
import { DVI_LAYOUT_TEX, DVI_POINTS_TEX, LAYOUT_CLASSES, LAYOUT_TEX, POINTS_TEX } from '@/pdf-reader/engine/layout/marks.mjs'
import { openPaper, originalFiles, probeFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { markedOfPaper } from '@/pdf-reader/engine/layout/paper.mjs'
import type { Compiled, CompileRequest } from '@/pdf-reader/engine/pipeline/live.mjs'
import type { SourceUnit } from '@/pdf-reader/engine/source/latex-front.mjs'
import type { UnitLines } from '@/pdf-reader/engine/pipeline/tex-errors.mjs'

// A paper arXiv compiles with `latex` (its 00README's compiler: pdfTeX in DVI mode, \pdfoutput 0, the DVI made a PDF by
// dvipdfmx here): the marks as xdvipdfmx's specials, a `pdf:dest` and a `pdf:code` point, after the marks' own TeX, so that a
// DVI compile carries them; every other engine's files byte for byte as before. What the TeX does under TeX is checked
// natively (lab/pdf/spikes/layout-marks-cases.mjs, ONLY=dvi)

const SRC = String.raw`\documentclass{article}
\usepackage{cite}
\begin{document}
\section{Intro}
A claim \cite{a} with $x$ and a note\footnote{The note.}.

More words of a second paragraph.
\begin{thebibliography}{9}\bibitem{a} A. Author. A title. 2020.\end{thebibliography}
\end{document}
`
const readme = (compiler: string) => JSON.stringify({ sources: [{ usage: 'toplevel', filename: 'main.tex' }], spec_version: 1, process: { compiler } })
const paperOf = (compiler: string | null) => openPaper(new Map([['main.tex', new TextEncoder().encode(SRC)], ...(compiler ? [['00README.json', new TextEncoder().encode(readme(compiler))] as [string, Uint8Array]] : [])]))
const main = (m: Map<string, Uint8Array>) => new TextDecoder('latin1').decode(m.get('main.tex'))
/** every file of a compile's overrides, by path, as text */
const texts = (m: Map<string, Uint8Array>) => [...m].map(([p, b]) => [p, new TextDecoder('latin1').decode(b)])
/** a latex paper's files with the DVI marks taken out */
const withoutDvi = (s: string) => s.split(DVI_MARK_DEF).join('').split(DVI_LAYOUT_TEX).join('')
const SWITCHES = { '\\cite': '00000000', '\\footnote': '00000000' }
const layoutOf = (p: ReturnType<typeof paperOf>) => originalFiles(p, { lines: true, layout: LAYOUT_CLASSES, switches: SWITCHES, inkless: [] })

describe('the DVI marks', () => {
  it('the engine of arXiv\'s `latex` compiler, its long form read as it', () => {
    expect(dviEngine('latex')).toBe(true)
    for (const e of ['pdflatex', 'xelatex', 'lualatex', 'tex', null, undefined]) expect(dviEngine(e)).toBe(false)
    expect(paperOf('latex').meta.compiler).toBe('latex')
    // arXiv's 00README: "compiler: latex is actually shorthand for compiler: latex+dvips_ps2pdf"
    expect(paperOf('latex+dvips_ps2pdf').meta.compiler).toBe('latex')
    expect(paperOf('pdflatex').meta.compiler).toBe('pdflatex')
  })

  it('MARK_DEF\'s destination as xdvipdfmx\'s special where pdfTeX writes no PDF, every destination kept; LAYOUT_TEX\'s and its points too', () => {
    expect(DVI_MARK_DEF).toContain('\\def\\axt@dvidest#1{\\special{pdf:dest (axt-#1) [@thispage /XYZ @xpos @ypos null]}}')
    // MARK_DEF's XeTeX destination, the same special
    expect(MARK_DEF).toContain('\\special{pdf:dest (axt-#1) [@thispage /XYZ @xpos @ypos null]}')
    expect(DVI_MARK_DEF).toContain('\\let\\axt@pdfdest\\axt@dest\\def\\axt@dest#1{\\ifnum\\pdfoutput>0 \\axt@pdfdest{#1}\\else\\axt@dvidest{#1}\\fi}')
    // dvipdfmx drops a destination nothing refers to, unless told at the first page (MARK_DEF's XeTeX config)
    expect(DVI_MARK_DEF).toContain('\\AddToHook{shipout/firstpage}{\\ifnum\\pdfoutput>0 \\else\\special{dvipdfmx:config C 0x0010}\\fi}')
    expect(MARK_DEF).toContain('\\special{dvipdfmx:config C 0x0010}')
    // LAYOUT_TEX's destination (its FitR under pdfTeX) and its points (POINTS_TEX's), each the special where no PDF is written
    expect(DVI_LAYOUT_TEX).toContain('\\let\\axt@pdfdo\\axt@destonly\\def\\axt@destonly#1{\\ifnum\\pdfoutput>0 \\axt@pdfdo{#1}\\else\\axt@dvidest{#1}\\fi}')
    expect(DVI_POINTS_TEX).toBe('\\let\\axt@pdfpoint\\axt@point\\def\\axt@point#1{\\ifnum\\pdfoutput>0 \\axt@pdfpoint{#1}\\else\\special{pdf:code /axt-#1 ri}\\fi}')
    expect(DVI_LAYOUT_TEX).toContain(DVI_POINTS_TEX)
    // POINTS_TEX's XeTeX point, the same code
    expect(POINTS_TEX).toContain('\\special{pdf:code /axt-#1 ri}')
    expect(LAYOUT_TEX).toContain('\\let\\axt@destonly\\axt@dest\\def\\axt@dest#1{\\axt@destonly{#1}\\axt@point{#1}}')
    // one line each, no comment: no line of the paper moves
    for (const s of [DVI_MARK_DEF, DVI_LAYOUT_TEX]) { expect(s).not.toMatch(/[\n%]/); expect(s.startsWith('\\makeatletter') && s.endsWith('\\makeatother')).toBe(true) }
  })

  it('a latex paper\'s files: the DVI marks after the marks\' own TeX, in the probe, the marked original and the unmarked one with lines', () => {
    const p = paperOf('latex')
    const probe = main(probeFiles(p, { marks: true })), marked = main(layoutOf(p)), lined = main(originalFiles(p, { lines: true }))
    for (const t of [probe, marked]) {
      expect(t.indexOf(MARK_DEF + DVI_MARK_DEF + LAYOUT_TEX + DVI_LAYOUT_TEX)).toBeGreaterThanOrEqual(0)
      expect(t.indexOf(DVI_LAYOUT_TEX)).toBeLessThan(t.indexOf('\\documentclass'))
    }
    expect(lined).toContain(MARK_DEF + DVI_MARK_DEF)
    expect(lined).not.toContain(DVI_LAYOUT_TEX)
    // the name marks off: NAMES_OFF on the same line, after them
    const off = main(originalFiles(p, { lines: true, layout: LAYOUT_CLASSES, switches: SWITCHES, inkless: [], names: false }))
    expect(off).toContain(`${LAYOUT_TEX}${DVI_LAYOUT_TEX}\\makeatletter\\let\\axt@nmall\\relax\\makeatother`)
    // nothing where no mark is: the plain probe, the original as at 3cb5a733's head
    expect(main(probeFiles(p))).not.toContain('pdf:code')
    expect(main(probeFiles(p, { width: true }))).not.toContain(DVI_MARK_DEF)
  })

  it('every other engine\'s files as before: a latex paper\'s, the DVI marks taken out, are a pdflatex paper\'s byte for byte', () => {
    const dvi = paperOf('latex')
    for (const compiler of ['pdflatex', 'xelatex', 'lualatex', null]) {
      const p = paperOf(compiler)
      for (const t of texts(probeFiles(p, { marks: true }))) expect(t[1]).not.toContain(DVI_MARK_DEF)
      for (const t of texts(layoutOf(p))) { expect(t[1]).not.toContain(DVI_MARK_DEF); expect(t[1]).not.toContain(DVI_LAYOUT_TEX) }
      for (const t of texts(originalFiles(p, { lines: true }))) expect(t[1]).not.toContain(DVI_MARK_DEF)
    }
    // (the README is the only other file; the main file as the pdflatex paper's once the DVI marks are out)
    const plain = paperOf('pdflatex')
    expect(withoutDvi(main(probeFiles(dvi, { marks: true })))).toBe(main(probeFiles(plain, { marks: true })))
    expect(withoutDvi(main(layoutOf(dvi)))).toBe(main(layoutOf(plain)))
    expect(withoutDvi(main(originalFiles(dvi, { lines: true })))).toBe(main(originalFiles(plain, { lines: true })))
    expect(main(originalFiles(dvi))).toContain(DVI_MARK_DEF)
    expect(withoutDvi(main(originalFiles(dvi)))).toBe(main(originalFiles(plain)))
  })

  it('every unit on the lines it stood on: the DVI marks add no line', () => {
    const at = (p: ReturnType<typeof paperOf>) => {
      const spans: { lines?: () => UnitLines<SourceUnit>[] } = {}
      originalFiles(p, { lines: true, layout: LAYOUT_CLASSES, switches: SWITCHES, inkless: [], spans })
      return (spans.lines?.() ?? []).map(x => [x.file, x.first, x.last])
    }
    const dvi = at(paperOf('latex'))
    expect(dvi.length).toBeGreaterThan(2)
    expect(dvi).toEqual(at(paperOf('pdflatex')))
  })

  it('markedOfPaper asks the host for `latex`, the probe and the marked original with the DVI marks', async () => {
    const p = paperOf('latex'), asked: CompileRequest[] = []
    const compile = async (req: CompileRequest): Promise<Compiled> => { asked.push(req); return { ok: false, log: '' } }
    await markedOfPaper(p, { compile })
    expect(asked.length).toBeGreaterThan(0)
    for (const r of asked) expect(r.engine).toBe('latex')
    expect(main(asked[0]?.overrides ?? new Map())).toContain(DVI_LAYOUT_TEX)
    // a host that runs no latex: refused before any compile, as before
    const none: CompileRequest[] = []
    const r = await markedOfPaper(p, { compile: async req => { none.push(req); return { ok: false, log: '' } }, engines: ['pdflatex', 'xelatex', 'lualatex'] })
    expect(r).toMatchObject({ refused: 'engine' })
    expect(none.length).toBe(0)
  })
})

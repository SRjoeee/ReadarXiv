import { describe, expect, it } from 'vitest'
import { lastTexLog, MARK_DEF } from '@/pdf-reader/engine/source/latex-front.mjs'
import { openPaper, originalFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { LINES_TEX, readLines } from '@/pdf-reader/engine/pipeline/typeset/tex.mjs'

// What the marked original's line probes write into a compile and what is read back from its log (the layout marks read
// each unit's lines: layout/marks.mjs). The typesetting rule's TeX that was tested here went with the compiled translation
// (2026-11-04, the rules audit's F4)

type Unit = { kind: string }
const SOURCE = '\\documentclass{article}\\begin{document}\n\\section{Method}\nThe first paragraph of prose.\n\nThe second paragraph of prose.\n\\begin{figure}\\caption{A caption.}\\end{figure}\n\\end{document}\n'
const paper = () => openPaper(new Map([['main.tex', new TextEncoder().encode(SOURCE)]]))
const text = (files: Map<string, Uint8Array>) => new TextDecoder().decode(files.get('main.tex'))

describe('the log the line probes write', () => {
  it('reads each unit\'s lines, leading and size', () => {
    const lines = readLines('x\nAXT-LINES 3 5 13.6pt 10.95\nAXT-LINES 7 1 12.0pt\n')
    expect(lines.get(3)).toEqual({ lines: 5, bs: 13.6, size: 10.95 })
    expect(lines.get(7)).toEqual({ lines: 1, bs: 12 })
    expect(readLines(null).size).toBe(0)
  })
  it('reports lines through \\message (\\typeout reads \\prevgraf as 0)', () => {
    expect(LINES_TEX).toContain('\\message{^^JAXT-LINES #1')
  })
  it('reads the last TeX pass of the browser compiler\'s joined log, not its earlier passes or the terminal\'s echo', () => {
    // one step as BusyTeX's pipeline writes it (parked/tex-page/poc-site/tex.js): the step's log, then the terminal's output, which
    // repeats every \message
    const step = (cmd: string, log: string, echo = log) => [`$ ${cmd}`, 'EXITCODE: 0', '', 'TEXMFLOG:', '', '==', 'MISSFONTLOG:', '', '==', 'LOG:', log, '==', 'STDOUT:', echo, '==', 'STDERR:', '', '======'].join('\n')
    const pass = (bs: string) => `AXT-LINES 1 2 ${bs}pt 10\nAXT-LINES 2 3 ${bs}pt 10\n`
    const joined = [step('pdflatex x.tex', pass('11.0')), step('bibtex x', ''), step('pdflatex x.tex', pass('12.0'), `noise\n${pass('12.0')}`), step('xdvipdfmx x.xdv', 'AXT-LINES 9 9 99pt')].join('\n\n')
    expect([...readLines(joined)]).toEqual([...readLines(pass('12.0'))])
    expect(lastTexLog(joined)).toBe(pass('12.0'))
    expect(lastTexLog(pass('12.0'))).toBe(pass('12.0'))
  })
})

describe('the marks and probes of the original', () => {
  it('marks every page with the columns its units were set in, whichever way the class sets them', () => {
    // the most columns at any mark since the last page went out, or as this one goes out
    expect(MARK_DEF).toContain('\\protected\\def\\axtmark#1{\\axt@colseen\\axt@dest{#1}}')
    expect(MARK_DEF).toContain('\\AddToHook{shipout/background}{\\axt@colseen\\put(0,0){\\axt@dest{c\\axt@colmax-')
    for (const flag of ['\\pagegrid@col', '\\col@number', '\\if@twocolumn']) expect(MARK_DEF).toContain(flag)
    expect(text(originalFiles(paper()))).toContain(MARK_DEF)
  })
  it('gives the original a line probe before every unit mark when asked', () => {
    const p = paper(), para = (p.units as Unit[]).findIndex(u => u.kind === 'para')
    expect(text(originalFiles(p))).not.toContain('\\axtlines')
    const lined = text(originalFiles(p, { lines: true }))
    expect(lined).toContain(LINES_TEX)
    expect(lined).toContain(`\\axtlines{${para}}`)
  })
})

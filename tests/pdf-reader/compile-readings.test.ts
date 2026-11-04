import { describe, expect, it } from 'vitest'
import { citationLines, openPaper, originalFiles, ranThrough, stoppedShort } from '@/pdf-reader/engine/pipeline/live.mjs'

// The readings of a compile the prepare takes (live.mjs): whether its last pass stopped short or ran through, an aux's citation
// lines, and where each unit stands in the files a compile is given. Kept from live-sequence.test.ts, whose run of the compiled
// translation went with it (2026-11-04, the rules audit's F4)

const sourceOf = (paras: number) => `\\documentclass{article}\\begin{document}\n${Array.from({ length: paras }, (_, k) => `Paragraph ${k} of the paper, ${'with words that run on for a line or two of prose '.repeat(4)}and an end.\n`).join('\n')}\\end{document}\n`
const paper = (paras = 12) => openPaper(new Map([['main.tex', new TextEncoder().encode(sourceOf(paras))]]))

describe('a compile that stopped short of the document\'s end', () => {
  const STOP = 'Runaway argument?\n! File ended while scanning use of \\next.\n<inserted text> \n                \\par \n)\n! Emergency stop.\n<*> main.tex\n            \n*** (job aborted, no legal \\end found)\n\nOutput written on main.xdv (2 pages, 88144 bytes).\n'

  it('is read off the last TeX pass: an emergency stop, a fatal error, the capacity exceeded, a hundred errors; not an error TeX went past', () => {
    const end = 'Output written on main.pdf (12 pages, 412345 bytes).\nTranscript written on main.log.\n'
    // 2608.16117's Chinese final before the fix, its comment never ended: XeTeX wrote the pages before the stop
    expect(stoppedShort(`Excluding 'comment' comment.)\n${STOP}`)).toBe(true)
    expect(stoppedShort('! LaTeX Error: File `missing.sty\' not found.\n! Emergency stop.\n<read *> \n*** (cannot \\read from terminal in nonstop modes)\n!  ==> Fatal error occurred, no output PDF file produced!\n')).toBe(true)
    expect(stoppedShort('! TeX capacity exceeded, sorry [main memory size=5000000].\n!  ==> Fatal error occurred, no output PDF file produced!\n')).toBe(true)
    expect(stoppedShort(`! Undefined control sequence.\n(That makes 100 errors; please try again.)\n${end}`)).toBe(true)
    expect(stoppedShort(`! Undefined control sequence.\nl.12 \\foo\n${end}`)).toBe(false)
    expect([stoppedShort(''), stoppedShort(null), stoppedShort(undefined)]).toEqual([false, false, false])
    // the browser's compiler joins its steps' logs (latex-front.mjs lastTexLog): the last TeX pass decides
    const step = (cmd: string, log: string) => `$ ${cmd}\nEXITCODE: 0\n\nLOG:\n${log}\n==\nSTDOUT:\n${log}\n==\nSTDERR:\n\n======`
    expect(stoppedShort([step('xelatex main.tex', STOP), step('xelatex main.tex', end)].join('\n\n'))).toBe(false)
    expect(stoppedShort([step('xelatex main.tex', end), step('xelatex main.tex', STOP), step('xdvipdfmx main.xdv', '')].join('\n\n'))).toBe(true)
  })

  it('ran through, the one predicate of a compile\'s success: TeX ran, its last pass neither stopped short nor short of AXT-END', () => {
    const end = 'Output written on main.pdf (12 pages, 412345 bytes).\nAXT-END\n'
    const pdf = new Uint8Array([1])
    expect(ranThrough({ ok: true, pdf, log: `! Undefined control sequence.\nl.12 \\foo\n${end}` })).toBe(true)
    // (a draft gives no PDF and ran through all the same: the PDF is the caller's to ask for)
    expect(ranThrough({ ok: true, pdf: null, log: end })).toBe(true)
    // 2610.20713 on TL2025: a hundred errors, the PDF of the 7 pages of 15 set before them, no AXT-END
    expect(ranThrough({ ok: true, pdf, log: '! Extra alignment tab has been changed to \\cr.\n(That makes 100 errors; please try again.) \nOutput written on main.xdv (7 pages, 540996 bytes).\n' })).toBe(false)
    expect(ranThrough({ ok: true, pdf, log: `${STOP}AXT-END\n` })).toBe(false)
    // a pass halted at an error: no fatal line, no AXT-END
    expect(ranThrough({ ok: true, pdf, log: '! Missing $ inserted.\nOutput written on main.xdv (2 pages, 88144 bytes).\n' })).toBe(false)
    expect(ranThrough({ ok: false, pdf: null, log: end })).toBe(false)
    expect([ranThrough(null), ranThrough(undefined)]).toEqual([false, false])
  })
})

describe('citationLines: every line of an aux for a key it cites, in its order', () => {
  it("apacite's second line, harvard's, backref's; not \\citation, not a label, not a list's line, not a line cut short", () => {
    const aux = ['\\relax', '\\citation{smith,jones}', '\\bibcite{smith}{\\citeauthoryear{Smith}{Smith}{{\\APACyear{2001}}}}', '\\APACbibcite{smith}{\\citeauthoryear{Smith}{Smith}{{\\APACyear{2001}}}}', '\\harvardcite{jones}{Jones}{Jones}{1999}', '\\backcite{smith}{{1}{1}{section.1}}', '\\newlabel{sec:a}{{1}{1}}', '\\newlabel{smith}{{2}{3}}', '\\@writefile{toc}{x}', '\\bibcite{cut}{{1}'].join('\n')
    expect(citationLines(aux).split('\n')).toEqual(aux.split('\n').slice(2, 6))
  })
  it('\\nocite{*}: the keys \\bibcite names', () => {
    expect(citationLines('\\citation{*}\n\\bibcite{a}{1}\n\\APACbibcite{a}{1}\n')).toBe('\\bibcite{a}{1}\n\\APACbibcite{a}{1}')
  })
  it("biblatex's lines name a refsection first, and are none; an aux with no citation, nothing", () => {
    expect(citationLines('\\abx@aux@cite{0}{a}\n\\abx@aux@segm{0}{0}{a}\n')).toBe('')
    expect(citationLines(null)).toBe('')
  })
})

describe('the original\'s files and where its units stand in them', () => {
  it("the original's files are the same bytes with its units' lines asked for and without; each unit found on its own lines", () => {
    const p = paper(), spans: NonNullable<NonNullable<Parameters<typeof originalFiles>[1]>['spans']> = {}
    const plain = originalFiles(p, { lines: true }), withSpans = originalFiles(p, { lines: true, spans })
    expect([...withSpans].map(([f, b]) => [f, new TextDecoder('latin1').decode(b)])).toEqual([...plain].map(([f, b]) => [f, new TextDecoder('latin1').decode(b)]))
    const lines = new TextDecoder('latin1').decode(withSpans.get('main.tex')).split('\n'), found = spans.lines?.() ?? []
    expect(found.map(x => x.unit)).toEqual(p.units)
    for (const [i, x] of found.entries()) expect(lines.slice(x.first - 1, x.last).join('\n')).toContain(`Paragraph ${i} of`)
  })
})

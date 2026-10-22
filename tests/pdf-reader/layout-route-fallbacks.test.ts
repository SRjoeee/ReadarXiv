import { describe, expect, it } from 'vitest'
import { LAYOUT_CLASSES } from '@/pdf-reader/engine/layout/marks.mjs'
import { markedOfPaper } from '@/pdf-reader/engine/layout/paper.mjs'
import { type Compiled, type CompileRequest, openPaper, originalFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { latin1Bytes } from '@/pdf-reader/engine/source/latex-front.mjs'

// The whole-paper fallbacks of the layer route's release sweep (2026-10-22), each by its general rule: a Latin-1 source's
// marked original keeps the paper's own bytes (2610.20581)

const enc = (s: string) => new TextEncoder().encode(s)
/** a file's bytes past ASCII, in order */
const high = (b: Uint8Array | undefined) => [...(b ?? [])].filter(x => x >= 0x80)
const PROBE: Compiled = { ok: true, log: ['This is pdfTeX', 'LAYOUT-PROBE 1 lineskip 1.0pt 0.0pt', ''].join('\n') }
function compiler(answers: Compiled[]) {
  const asked: CompileRequest[] = []
  return { asked, compile: async (req: CompileRequest): Promise<Compiled> => { asked.push(req); return answers[asked.length - 1] ?? { ok: false, error: 'not asked for' } } }
}

describe('a Latin-1 source (2610.20581): the layout compile\'s files are the paper\'s own bytes', () => {
  // an é and a no-break space as Latin-1 bytes, under the paper's own \usepackage[latin1]{inputenc}
  const SOURCE = '\\documentclass{article}\n\\usepackage[latin1]{inputenc}\n\\begin{document}\nMat\xe9matiques with $a\xa0b$ here.\n\nAnother paragraph of words.\n\\end{document}\n'
  const paper = () => openPaper(new Map([['main.tex', latin1Bytes(SOURCE)]]))

  it('is the marked original\'s, its inputenc the paper\'s; the live path\'s original is UTF-8 as before', () => {
    const p = paper()
    expect(p.project.transcode.has('main.tex')).toBe(true)
    const marked = originalFiles(p, { lines: true, layout: LAYOUT_CLASSES }).get('main.tex')
    expect(high(marked)).toEqual([0xe9, 0xa0])
    expect(new TextDecoder('latin1').decode(marked)).toContain('\\usepackage[latin1]{inputenc}')
    // (asked for, the layout's files transcoded as the live path's)
    expect(high(originalFiles(p, { lines: true, layout: LAYOUT_CLASSES, transcode: true }).get('main.tex'))).toEqual([0xc3, 0xa9, 0xc2, 0xa0])
    for (const lines of [false, true]) expect(high(originalFiles(p, { lines }).get('main.tex'))).toEqual([0xc3, 0xa9, 0xc2, 0xa0])
    expect(high(originalFiles(p, { lines: true, transcode: false }).get('main.tex'))).toEqual([0xe9, 0xa0])
  })

  it('is CM\'s unmarked drafts\' too, so that the aux they write is the marked passes\'', async () => {
    const files = new Map([['main.aux', enc('\\relax \n')]])
    const c = compiler([PROBE, { ok: true, pdf: null, log: 'AXT-END\n', files }, { ok: true, pdf: enc('%PDF-1.7 marked'), log: 'AXT-END\n', files }])
    const made = await markedOfPaper(paper(), { final: false, compile: c.compile, converge: true })
    expect(made).toMatchObject({ cm: { drafts: 1, marked: 1, settled: true } })
    expect(c.asked.map(r => r.draft)).toEqual([undefined, true, false])
    for (const r of c.asked.slice(1)) expect(high(r.overrides.get('main.tex'))).toEqual([0xe9, 0xa0])
  })

  it('changes no byte of a source that is not transcoded', () => {
    const p = openPaper(new Map([['main.tex', enc('\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\begin{document}\nMathématiques here.\n\\end{document}\n')]]))
    expect(p.project.transcode.size).toBe(0)
    for (const layout of [null, LAYOUT_CLASSES]) expect(originalFiles(p, { lines: true, layout, transcode: false })).toEqual(originalFiles(p, { lines: true, layout, transcode: true }))
  })
})

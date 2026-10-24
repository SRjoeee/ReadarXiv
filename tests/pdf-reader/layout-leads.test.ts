// @vitest-environment node
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { encodeLayoutMarks, INK_ANY, layoutMarksOf, parseLayoutMarks, readInkTexts } from '@/pdf-reader/engine/layout/marks.mjs'
import { DOCUMENT_OPTIONS, markedSample, pixelsApart, renderPage, wrapped } from './helpers/ocg-pdfs'

// The cells left English against production after the release sweep of 2026-10-24 (2610.21098v1 p13, 2610.21176v1 p13): a cell
// whose lead TeX sets before its start mark, where no mark goes, is owned by the text TeX sets for that lead — the probe's own
// listing read (marks.mjs readInkTexts), written into the marks file and read back from it, and the wrap given the file's texts
// as the maker child gives them (layout/wrap.mjs wrapFinal): never a Map made by hand (CodeRabbit on #456, the debt of #299)

const run = (x: number, y: number, font: string, size: number, text: string) => `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm [${text}] TJ ET\n`
const only = (text: string) => (_: string, p: number) => (p === 2 ? text : _)
const ok = <T extends object>(r: T): Exclude<T, { refused: string }> => { if ('refused' in r) { const x = r as unknown as { refused: string; why: string }; throw new Error(`${x.refused}: ${x.why}`) } return r as Exclude<T, { refused: string }> }
/** the ink section's listing of sample i (TeX Live 2025's pdfTeX, as 2610.21098v1's and 2610.21176v1's probes wrote it) */
const listing = (i: number, nodes: string[]) => [`LAYOUT-PROBE 1 ink-at ${i}`, '> \\box60=', '\\hbox(7.4+1.6)x24.6', ...nodes, '', '! OK.', `LAYOUT-PROBE 1 ink-end ${i}`].join('\n')
/** the probe's texts of `samples` from `log`, as a marked compile's marks file holds them, written and read back */
async function textsThroughTheFile(bytes: Uint8Array, log: string, samples: string[], units: unknown[]) {
  const task = getDocument({ ...DOCUMENT_OPTIONS, data: bytes.slice() } as never)
  try {
    const marks = await layoutMarksOf((await task.promise) as never, '', { engine: 'pdflatex', texts: readInkTexts(log, samples), units, OPS } as never)
    return parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(marks))).marking.texts
  } finally { await task.destroy() }
}
const cell = (pieces: unknown[]) => ({ kind: 'cell', pieces })

describe('a cell\'s lead owned by the text TeX sets for it, from the probe through the marks file to the wrap (MARKS_SCHEMA 10)', () => {
  // "Completion cap | \\CompletionTokenCap{} tokens per request": the macro sets 1{,}024 between the cell before's end mark and
  // this cell's start mark (2610.21098v1 p13u136; u142 and u144 the same)
  const units = [cell([{ t: 'text', s: 'Completion cap' }]), cell([{ t: 'ph', src: '\\CompletionTokenCap{}' }, { t: 'text', s: ' tokens per request' }])]
  const row = (lead: boolean) => `/axt-t0s ri ${run(72, 700, 'F32', 10.9091, '(Completion cap)')}/axt-t0e ri ${lead ? `${run(160, 700, 'F32', 10.9091, '(1,024)')}/axt-t1s ri ${run(191, 700, 'F32', 10.9091, '(tokens per request)')}/axt-t1e ri` : ''}\n`
  it('reads "1,024", the number\'s comma with its digits, and hides it with its cell: the page as if the cell were never set', async () => {
    const log = listing(0, ['.\\T1/ptm/m/n/10.95 1', '.\\T1/ptm/m/n/10.95 ,', '.\\T1/ptm/m/n/10.95 0', '.\\T1/ptm/m/n/10.95 2', '.\\T1/ptm/m/n/10.95 4'])
    const { bytes } = await markedSample({ pages: [2], edit: only(row(true)) })
    const texts = await textsThroughTheFile(bytes, log, ['\\CompletionTokenCap{}'], units)
    expect(texts).toEqual(['\\CompletionTokenCap{}', '1,024'])
    const r = ok(await wrapped(bytes, { units, texts }))
    expect(r.unhidden).toEqual([])
    const want = (await markedSample({ pages: [2], edit: only(row(false)) })).bytes
    expect(pixelsApart(await renderPage(r.bytes, 2, { off: n => n.startsWith('axt:u1') }), await renderPage(want, 2))).toBe(0)
    // (the file read with no texts, as before the probe answered: the cell the original's, its lead ink in no group)
    expect(ok(await wrapped(bytes, { units, texts: null })).unhidden).toEqual([[1, 'marks']])
  })
  it('reads $d\'$, a math italic d and a symbol font\'s glyph, the second one glyph whatever its text (2610.21176v1 p13u88)', async () => {
    // "Prop. 1 | \\dprime{} tracks the gap": \\newcommand{\\dprime}{$d'$}, cmmi's d and cmsy's prime raised as a superscript
    const log = listing(0, ['.\\mathon', '.\\OML/cmm/m/it/10 d', '.\\hbox(3.8889+0.0)x2.80556, shifted -3.62892', '..\\OMS/cmsy/m/n/7 0', '.\\mathoff'])
    const lead = [cell([{ t: 'text', s: 'Prop. 1' }]), cell([{ t: 'ph', src: '\\dprime{}' }, { t: 'text', s: ' tracks the gap' }])]
    const prime = (on: boolean) => `/axt-t0s ri ${run(72, 700, 'F32', 10.9091, '(Prop. 1)')}/axt-t0e ri ${on ? `${run(160, 700, 'F35', 10.9091, '(d)')}${run(165.7, 704, 'F74', 7.9701, '(0)')}/axt-t1s ri ${run(171, 700, 'F32', 10.9091, '(tracks the gap)')}/axt-t1e ri` : ''}\n`
    const { bytes } = await markedSample({ pages: [2], edit: only(prime(true)) })
    const texts = await textsThroughTheFile(bytes, log, ['\\dprime{}'], lead)
    expect(texts).toEqual(['\\dprime{}', `d${INK_ANY}`])
    const r = ok(await wrapped(bytes, { units: lead, texts }))
    expect(r.unhidden).toEqual([])
    const want = (await markedSample({ pages: [2], edit: only(prime(false)) })).bytes
    expect(pixelsApart(await renderPage(r.bytes, 2, { off: n => n.startsWith('axt:u1') }), await renderPage(want, 2))).toBe(0)
  })
})

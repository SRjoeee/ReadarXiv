// @vitest-environment node
// What the back half holds (packages/engine prepareBack, lane mem-back): once located, B's ink and A's documents are let go,
// read by nothing after locate, and the bundle's objects are the same whether they are or kept (`keep`, the lab's proofs).
import { createHash } from 'node:crypto'
import * as PL from '@cantoo/pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { type Instrument, ownersOf, type PdfJs, prepareBack, readPdf, ROLE, type Tally, unitId } from '@readarxiv/engine'
import { deflate, DOCUMENT_OPTIONS, inflate } from './helpers/ocg-pdfs'

const LINES = ['The first line of a unit', 'and its second line', 'Another unit stands here']
/** a page of Helvetica lines, one show each */
async function pdfOf(lines: string[]): Promise<Uint8Array> {
  const doc = await PL.PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(PL.StandardFonts.Helvetica)
  page.node.setFontDictionary(PL.PDFName.of('F1'), font.ref)
  const content = lines.map((l, i) => `BT /F1 10 Tf 72 ${700 - 14 * i} Td (${l}) Tj ET`).join('\n')
  page.node.set(PL.PDFName.of('Contents'), doc.context.register(doc.context.stream(content)))
  return doc.save({ useObjectStreams: false })
}
const pdfjs = { getDocument, OPS } as unknown as PdfJs
/** B is A read as the box reads our final pass; its first two shows a paragraph's, its third another's */
async function instrumentOf(bytes: Uint8Array): Promise<Instrument> {
  const B = (await readPdf(pdfjs, bytes, { options: DOCUMENT_OPTIONS, turned: true })).doc
  const text = (s: string) => [{ t: 'text' as const, s }]
  const units = [text(`${LINES[0]} ${LINES[1]}`), text(LINES[2]!)].map((content) => ({ id: unitId('para', content), kind: 'para', content }))
  return {
    ink: B,
    units,
    glyphs: B.pages.map((pg) => {
      const O = ownersOf(pg.glyphs.length)
      pg.glyphs.forEach((g, j) => {
        O.unit[j] = g.n < 2 ? 0 : 1
        O.role[j] = ROLE.text
      })
      return O
    }),
    boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
    tex: {},
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
}
/** B's ink behind a guard that throws at any read once `locate` has ended (prepareBack reads `now` after each step) */
function guarded(ins: Instrument): { ins: Instrument; located: () => void } {
  let after = false
  const guard = <T extends object>(o: T, what: string): T =>
    new Proxy(o, {
      get(t, p, r) {
        if (after) throw new Error(`${what}.${String(p)} read after locate`)
        const v = Reflect.get(t, p, r)
        return v && typeof v === 'object' && (p === 'pages' || /^\d+$/.test(String(p))) ? guard(v as object, `${what}.${String(p)}`) : v
      },
    })
  return { ins: { ...ins, ink: guard(ins.ink, 'ink') }, located: () => (after = true) }
}
async function run(ins: Instrument, bytes: Uint8Array, keep: boolean, located = () => {}) {
  let calls = 0
  const now = () => {
    if (++calls === 4) located()
    return calls
  }
  const digests: string[] = []
  let tally: Tally | null = null
  for await (const x of prepareBack(ins, bytes, { pdfjs, pdfOptions: DOCUMENT_OPTIONS, PL, deflate, inflate, paper: { id: '2611.00001', version: 1 }, made: 'test', now, keep })) {
    if (x.kind === 'tally') tally = x
    else digests.push(`${x.kind}:${createHash('sha256').update(x.bytes).digest('hex')}`)
  }
  return { digests, tally: tally as Tally }
}

describe('prepareBack lets go what it has read once located', () => {
  it('reads B\'s ink in no step after locate, and lets it go: the same objects as kept', async () => {
    const bytes = await pdfOf(LINES)
    const kept = guarded(await instrumentOf(bytes))
    const a = await run(kept.ins, bytes, true, kept.located)
    expect(a.digests.length).toBeGreaterThan(2)
    expect(a.tally.pagesA?.length).toBe(1)
    const let_ = await instrumentOf(bytes)
    const b = await run(let_, bytes, false)
    expect(b.digests).toEqual(a.digests)
    expect(let_.ink.pages).toEqual([])
    expect(b.tally.pagesA).toBeUndefined()
    expect(b.tally.located.located).toBe(a.tally.located.located)
  })
})

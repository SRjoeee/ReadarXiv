// @vitest-environment node
// A paragraph in a frame the page paints as one path round it stays inside the frame, from the PDF's paint to the laid page
// (docs/PDF-READER.md §18.111). The fixture (tests/fixtures/pdf/framed/, ours, CC0; made by scripts/make-tex-fixture.mjs) is a
// page whose paragraph of four lines stands in a tcolorbox (one closed path in the frame's colour, one in the paper's over it, as
// 2601.06943v2's abstract stands), blank paper and a paragraph well under it. The back half runs here over the compiles the front
// half made of it, the instrument over our final pass and prepareBack over the stand-in for arXiv's PDF, and the part it writes
// for the page is laid with a translation longer than the original: without the frame the next ink under the paragraph is the
// text 3 cm under it, the borrow takes a line of that blank paper, and the line is drawn across the frame's border (the tests of
// framed-room.test.ts state the room on pages made by hand, the frames given; here the prepare reads them off the PDF).
import * as PL from '@cantoo/pdf-lib'
import { readFileSync } from 'node:fs'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { type Part, type Placed, read, type Row } from '@readarxiv/format'
import { type PdfJs, prepareBack, type Tally } from '@readarxiv/engine'
import { classesOf, instrumentOf } from '../../packages/engine/src/instrument/instrument.ts'
import { openPaper } from '../../packages/engine/src/compile/live.ts'
import { layPage } from '../../packages/typeset/src/lay/entry.ts'
import { rulesFor } from '../../packages/typeset/src/rules-for.ts'
import type { Metrics, Rows } from '../../packages/typeset/src/types.ts'
import { deflate, DOCUMENT_OPTIONS, inflate } from './helpers/ocg-pdfs'

const DIR = new URL('../fixtures/pdf/framed/', import.meta.url)
const bytes = (f: string) => new Uint8Array(readFileSync(new URL(f, DIR)))
const pdfjs = { getDocument, OPS } as unknown as PdfJs
type Box = [number, number, number, number]

let part: Part
/** the frame's two fills on A's page: the outer path (the frame's colour), the inner (the paper's) */
let outer: Box
let inner: Box

beforeAll(async () => {
  const source = new Map([['framed.tex', bytes('framed.tex')]])
  const made = JSON.parse(readFileSync(new URL('made.json', DIR), 'utf8')) as { options: Record<string, unknown>; log: string }
  const paper = openPaper(source) as never
  const { instrument } = await instrumentOf({
    paper,
    finalPdf: bytes('final.pdf'),
    options: made.options,
    log: made.log,
    pdfjs,
    documentOptions: DOCUMENT_OPTIONS,
    made: { compiler: 'pdflatex', tree: '2025', front: 'today' },
  })
  let tally: Tally | null = null
  const parts: Part[] = []
  for await (const x of prepareBack(instrument, bytes('arxiv.pdf'), {
    pdfjs,
    pdfOptions: DOCUMENT_OPTIONS,
    PL: PL as never,
    deflate,
    inflate,
    paper: { id: '2600.00003', version: 1 },
    made: 'test',
    classesOf: classesOf as never,
    keep: true,
  })) {
    if (x.kind === 'tally') tally = x
    if (x.kind === 'part') parts.push(read('part', x.bytes) as Part)
  }
  part = parts.find((p) => p.page === 1) as Part
  // (A's painted paths a paragraph wide and a few lines high: the frame's two fills, the larger the outer)
  const A = (tally as Tally).pagesA![0]!.page as unknown as { boxes: number[]; kinds: number[] }
  const fills = A.kinds
    .flatMap((k, b): Box[] => {
      const r = A.boxes.slice(4 * b, 4 * b + 4) as Box
      return k >= 0 && r[2] - r[0] > 200 && r[3] - r[1] > 20 && r[3] - r[1] < 120 ? [r] : []
    })
    .sort((a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]))
  ;[outer, inner] = fills as [Box, Box]
}, 60_000)

const metrics = (): Metrics => ({
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
})
/** the members of the page whose text lines stand inside `r` */
const inside = (r: Box) =>
  part.flows.flat().filter((m: Placed) => m.lines.length && m.lines.every((l) => l[2] >= r[0] && l[3] <= r[2] && l[6] >= r[1] && l[5] <= r[3]))
/** rows for a member: our own text, longer than its original by half */
const rowsFor = (m: Placed): Rows => {
  const s =
    'Die Vermesser gingen zuerst das Nordufer ab, markierten jede Biegung mit einem bemalten Pfahl und notierten an jeder Furt die Tiefe des Wassers. Am Ende des Monats hatten sie den Fluss von der Mühle bis zur alten Steinbrücke kartiert, und die Karte hing an der Wand des Gasthauses, wo jeder sie sehen konnte, auch die Fährleute.'
  const row: Row = { id: m.text as string, ok: true, by: 'test', content: [{ t: 'text', s }] }
  return { get: (k) => (k === row.id ? row : undefined), done: true }
}

describe('a paragraph in a frame painted as one path round it, from the PDF to the laid page', () => {
  it('reads the frame off the page: its two fills, and the paragraph alone inside it', () => {
    expect(outer[0]).toBeLessThan(inner[0])
    expect(outer[1]).toBeLessThan(inner[1])
    const [m, ...rest] = inside(inner)
    expect(rest).toEqual([])
    expect(m!.kind).toBe('para')
    expect(m!.lines.length).toBe(4)
  })
  it('states the frame’s border as the next ink under the paragraph’s run: the room under it ends at the border', () => {
    const m = inside(inner)[0]!
    const last = m.lines.at(-1)!
    const run = m.room.runs?.find((e) => e[0] === m.lines.length - 1)
    expect(run, 'a run ending at its last line').toBeDefined()
    // (the next ink's depth under the last baseline: the inner fill's bottom edge, the border's top, not the paragraph 3 cm under)
    expect(run![1]).toBeCloseTo(last[4] - inner[1], 0)
  })
  it('lays a translation longer than the original inside the frame: no line on or past its border', () => {
    const m = inside(inner)[0]!
    const laid = layPage(part, rowsFor(m), rulesFor('de'), metrics()).members.find((x) => x.ord === m.ord)!
    expect(laid.state).toBe('laid')
    const size = laid.fit!.size
    for (const [y, x0, x1] of laid.lines) {
      expect(y - 0.2 * size, `a line at ${y} over the border's top, ${inner[1]}`).toBeGreaterThan(inner[1])
      expect(x0).toBeGreaterThanOrEqual(inner[0])
      expect(x1).toBeLessThanOrEqual(inner[2])
    }
  })
})

// @vitest-environment node
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { composedDiff } from '../../lab/pdf/spikes/layer-gate/links.mjs'
import { annotsOf, freezeLinks, pointsOf } from '@/pdf-reader/engine/layer-proto/links.mjs'

// The links of the CC0 sample paper (tests/fixtures/pdf/sample-1: hyperref with colorlinks, \cite, \ref, \eqref, a footnote, an \href),
// read by the pinned PDF.js (the 3a design §5, risk 5 and risk 1): our final pass followed by the wrap's section (tests/fixtures/pdf/ocg/,
// the composed document the reader opens over a base of ours) gives each of its pages the annotations of the final pass alone (the
// engine reads the composed document's: the wrap must leave them as they were); and the kinds the engine keeps of them are locked in
// a golden (no text of the paper in it), so that a PDF.js bump or a change of what a reader carries shows as a difference here.
// WRITE_GOLDEN=1 records it again

const OCG = join(process.cwd(), 'tests/fixtures/pdf/ocg')
const GOLDEN = join(process.cwd(), 'tests/pdf-reader/golden/sample-links.json')
const base = new Uint8Array(readFileSync(join(OCG, 'sample-1-final.pdf')))
const composed = new Uint8Array(readFileSync(join(OCG, 'sample-1-wrapped.pdf')))

async function read(data: Uint8Array) {
  const task = getDocument({ data: data.slice(), verbosity: 0 })
  try {
    const doc = await task.promise
    const out: { raw: unknown[]; items: unknown[] }[] = []
    for (let p = 1; p <= 4; p++) {
      const page = await doc.getPage(p)
      out.push({ raw: await page.getAnnotations(), items: (await page.getTextContent()).items })
    }
    return { pages: doc.numPages, out }
  } finally { await task.destroy() }
}

describe('the sample paper\'s links', () => {
  it('are the same in the composed document (the final pass followed by the wrap\'s section) as in the final pass alone, rect, destination, url, border, colour, overlaid text and quads', async () => {
    const alone = await read(base), both = await read(composed)
    expect(alone.pages).toBe(4)
    expect(both.pages).toBeGreaterThanOrEqual(4)
    expect(alone.out.every(p => p.raw.length > 0)).toBe(true)
    expect(composedDiff(alone.out.map(p => p.raw), both.out.map(p => p.raw))).toEqual([])
  })

  it('are kept as the golden records them: their kinds, how many glyph points each has, and the records left in place with no operation', async () => {
    const { out } = await read(composed)
    const kinds = out.map(({ raw, items }) => {
      const { list, total, unsupported } = annotsOf(raw, pointsOf(items))
      const f = freezeLinks({ list, q: 1, ops: [], devOf: (x, y) => [x, y], units: [], sources: true })
      return {
        total, unsupported,
        // (one line a link: its rank, kind, the prefix of its destination or the scheme of its url, its glyph points, its border, its boxes)
        links: list.map(a => (a.unsupported ? `${a.i} unsupported` : `${a.i} ${a.url !== undefined ? 'url' : typeof a.dest === 'string' ? 'dest:name' : 'dest:array'} ${a.url !== undefined ? new URL(a.url).protocol : (a.dest as string).split('.')[0]} glyphs=${a.g.ch.length} border=${a.border ? `${a.border.width}/${a.border.style}` : 'none'} boxes=${a.boxes.length}`)),
        // (with no operation and no owner nothing is dropped and all stay in place, in PDF order: rank, moved, boxes, tier, annotation)
        records: f.records.map((r, k) => `${r.order} moved=${r.moved} boxes=${r.boxes.length / 4} ${f.sources![k]!.tier} from=${f.sources![k]!.annots[0]![1]}`),
      }
    })
    if (process.env.WRITE_GOLDEN === '1') { writeFileSync(GOLDEN, `${JSON.stringify(kinds, null, 1)}\n`); return }
    expect(kinds).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')))
    // (a paper with hyperref colorlinks: names for the destinations, one external link, none unsupported)
    expect(kinds.reduce((n, p) => n + p.total, 0)).toBeGreaterThan(15)
    expect(kinds.flatMap(p => p.links).filter(l => l.includes(' url ')).length).toBe(1)
    expect(kinds.reduce((n, p) => n + p.unsupported, 0)).toBe(0)
  })
})

// @vitest-environment node
import * as PL from '@cantoo/pdf-lib'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { constants as Z, deflateSync, inflateRawSync, inflateSync } from 'node:zlib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { removerOf } from '@/pdf-reader/engine/layout/remove.mjs'
import { startxrefOf } from '@/pdf-reader/engine/layout/tail.mjs'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { layerOfPaper } from '@/pdf-reader/engine/pipeline/page-pass.mjs'
import { PDFJS } from '@/pdf-reader/engine/pipeline/versions.mjs'
import { unpackSource } from '@/pdf-reader/engine/source/tar.mjs'
import { LAB } from './helpers/lab-data'

// Text set at an angle, on the real papers (AXT_LAB, helpers/lab-data.ts: `data/corpus/<id>/arxiv.pdf` and `source.gz`; a paper
// the lab does not hold is skipped): the page pass, the marks refused (the left by the units' text alone), makes every part, and a
// caption printed up the page is lit up the page, word by word, inside the page. 1406.1078v3 sets its last two figures on
// landscape pages (/Rotate 90; its captions' transform [0, 10.91, -10.91, 0, …]): read along x, a caption ran 645 units past its
// page's right edge and the part writer refused it. 2608.18626 sets a figure sideways on a page that is not rotated.

const PDFJS_DIR = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
const open = (bytes: Uint8Array) => getDocument({ data: bytes.slice(), verbosity: 0, cMapUrl: join(PDFJS_DIR, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(PDFJS_DIR, 'standard_fonts/'), useSystemFonts: false })
const deflate = (b: Uint8Array) => new Uint8Array(deflateSync(b))
const inflate = (b: Uint8Array, limit: number) => {
  const o = { finishFlush: Z.Z_SYNC_FLUSH, maxOutputLength: limit + 1 }
  try { return new Uint8Array(inflateSync(b, o)) } catch (e) { if ((e as { code?: string })?.code === 'ERR_BUFFER_TOO_LARGE') throw e; return new Uint8Array(inflateRawSync(b.subarray(2), o)) }
}
type Rect = [page: number, x0: number, y0: number, x1: number, y1: number]

/** the papers: the corpus folder, the version, the caption unit set up its page, the page, and the band across it its lines stand in */
const PAPERS: [dir: string, version: number, unit: number, page: number, band: [number, number]][] = [
  ['1406.1078', 3, 191, 14, [530, 560]],
  ['2608.18626', 1, 50, 5, [505, 545]],
]

describe.skipIf(!LAB)('the real papers: a caption printed up its page is lit where it is printed', () => {
  for (const [dir, version, unit, page, band] of PAPERS) {
    const root = join(LAB ?? '', 'data/corpus', dir)
    it.skipIf(!existsSync(join(root, 'arxiv.pdf')))(`${dir}v${version}: every part made, the caption's rectangles up page ${page}, each inside it`, async () => {
      const source = await unpackSource(new Uint8Array(readFileSync(join(root, 'source.gz'))))
      if (!('files' in source)) throw new Error('the source is a PDF')
      const paper = openPaper(source.files)
      const bytes = new Uint8Array(readFileSync(join(root, 'arxiv.pdf')))
      const base = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), xref: startxrefOf(bytes) as number }
      const t = open(bytes), doc = await t.promise, remover = removerOf({ bytes, PL, inflate, deflate })
      const views: number[][] = []
      for (let p = 1; p <= doc.numPages; p++) views.push((await doc.getPage(p)).view)
      const left = new Map<number, Rect[]>(), dec = new TextDecoder()
      const r = await layerOfPaper({
        paper: { id: dir, version }, source: paper as never, marks: { refused: 'marks' } as never, arxiv: { doc }, OPS, pdfjs: PDFJS, base, image: '1', remove: ({ plans }) => remover.remove(plans),
        onHead: () => {}, onLeft: () => {},
        onPart: p => { for (const [id, , rects] of (JSON.parse(dec.decode(p.bytes)) as { left?: [number, number, Rect[]][] }).left ?? []) left.set(id, rects) },
      })
      await t.destroy()
      expect((r as { through: number }).through).toBe(views.length)
      for (const rects of left.values()) for (const [p, x0, y0, x1, y1] of rects) {
        const v = views[p - 1]!
        expect(x0).toBeGreaterThanOrEqual(v[0]! - 1); expect(x1).toBeLessThanOrEqual(v[2]! + 1)
        expect(y0).toBeGreaterThanOrEqual(v[1]! - 1); expect(y1).toBeLessThanOrEqual(v[3]! + 1)
      }
      // the caption: its words' boxes on its page, in its lines' band across, rising up the page within each line
      const rects = (left.get(unit) ?? []).filter(q => q[0] === page)
      expect(rects.length).toBeGreaterThan(10)
      for (const [, x0, y0, x1, y1] of rects) { expect(x0).toBeGreaterThanOrEqual(band[0]); expect(x1).toBeLessThanOrEqual(band[1]); expect(y1).toBeGreaterThan(y0) }
      expect(Math.max(...rects.map(q => q[4])) - Math.min(...rects.map(q => q[2]))).toBeGreaterThan(300)
    }, 300_000)
  }
})

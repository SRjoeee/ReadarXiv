// @vitest-environment node
import * as PL from '@cantoo/pdf-lib'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { constants as Z, deflateSync, inflateRawSync, inflateSync } from 'node:zlib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import type { Written } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { inkSamples, LAYOUT_CLASSES, probeSamples, readInkProbe, readInkTexts, readMarked, readMarkProbe, readNameProbe, readSkipProbe } from '@/pdf-reader/engine/layout/marks.mjs'
import { removerOf } from '@/pdf-reader/engine/layout/remove.mjs'
import { startxrefOf } from '@/pdf-reader/engine/layout/tail.mjs'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { layerOfPaper } from '@/pdf-reader/engine/pipeline/page-pass.mjs'
import { PDFJS } from '@/pdf-reader/engine/pipeline/versions.mjs'
import { lastTexLog } from '@/pdf-reader/engine/source/latex-front.mjs'
import { unpackSource } from '@/pdf-reader/engine/source/tar.mjs'
import { LAB } from './helpers/lab-data'

// The page pass on the real papers (AXT_LAB, helpers/lab-data.ts: each paper's source, its marked compile and probe, arXiv's
// PDF): made a page at a time under the oracle (a whole run's frame and columns' edges, captured) it tells every object the
// production pass tells, byte for byte, with the chained add-on over an in-process remover, and it cuts a part before the
// last page is read. The production pass is cutBundle's of the whole as next's engine makes it (the stage's own harness,
// six papers, verdicts off and on); 1810.04805's marked compile is not in the lab

const PDFJS_DIR = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
const open = (bytes: Uint8Array) => getDocument({ data: bytes.slice(), verbosity: 0, cMapUrl: join(PDFJS_DIR, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(PDFJS_DIR, 'standard_fonts/'), useSystemFonts: false })
const deflate = (b: Uint8Array) => new Uint8Array(deflateSync(b))
const inflate = (b: Uint8Array, limit: number) => {
  const o = { finishFlush: Z.Z_SYNC_FLUSH, maxOutputLength: limit + 1 }
  try { return new Uint8Array(inflateSync(b, o)) } catch (e) { if ((e as { code?: string })?.code === 'ERR_BUFFER_TOO_LARGE') throw e; return new Uint8Array(inflateRawSync(b.subarray(2), o)) }
}

describe.skipIf(!LAB)('the real papers: the page pass made a page at a time (the oracle) tells what production tells', () => {
  for (const name of ['1512.03385v1', '1706.03762v7', '2307.16209v1', '2608.04322v1']) {
    it(name, async () => {
      const root = join(LAB as string, 'data/layout', name), key = readFileSync(join(root, 'marks.key'), 'utf8').trim()
      const source = await unpackSource(new Uint8Array(readFileSync(join(root, 'source.gz'))))
      if (!('files' in source)) throw new Error('the source is a PDF')
      const paper = openPaper(source.files)
      // the probe's log, the latest the lab keeps, and the marked compile the marks were read from
      const probes = readdirSync(join(root, 'compiles')).filter(f => /^probe-.*\.log$/.test(f)).sort((a, b) => statSync(join(root, 'compiles', b)).mtimeMs - statSync(join(root, 'compiles', a)).mtimeMs)
      const plog = lastTexLog(readFileSync(join(root, 'compiles', probes[0] as string), 'latin1')), ink = inkSamples(paper.units)
      const probe = { switches: readMarkProbe(plog, probeSamples(paper.units)), inkless: readInkProbe(plog, ink), texts: readInkTexts(plog, ink), names: readNameProbe(plog), lineskip: readSkipProbe(plog) }
      const t1 = open(new Uint8Array(readFileSync(join(root, 'compiles', `${key}.pdf`))))
      const marks = await readMarked(await t1.promise, lastTexLog(readFileSync(join(root, 'compiles', `${key}.log`), 'latin1')), { engine: paper.meta.compiler, classes: LAYOUT_CLASSES, ...probe, units: paper.units, OPS } as never)
      await t1.destroy()
      const bytes = new Uint8Array(readFileSync(join(root, 'arxiv.pdf')))
      const base = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), xref: startxrefOf(bytes) as number }
      const id = name.replace(/v\d+$/, ''), version = Number(name.slice(id.length + 1))
      const pass = async (o: Record<string, unknown>) => {
        const t = open(bytes), doc = await t.promise, remover = removerOf({ bytes, PL, inflate, deflate })
        const told: string[] = []
        const r = await layerOfPaper({
          paper: { id, version }, source: paper as never, marks, arxiv: { doc }, OPS, pdfjs: PDFJS, base, image: '1', remove: ({ plans }) => remover.remove(plans), ...o,
          onHead: (h, units) => { told.push(...units.map(u => u.sha256), h.sha256) },
          onLeft: l => { told.push((l as Written).sha256) }, onPart: p => { told.push((p as Written).sha256) },
        })
        await t.destroy()
        return { told, r }
      }
      const capture: Record<string, unknown> = {}
      const want = await pass({ capture })
      const got = await pass({ oracle: capture })
      expect(got.told).toEqual(want.told)
      const closed = (got.r as { stats: { closed: [number, number, number][] } }).stats.closed
      expect(closed[0]![2]).toBeLessThan((got.r as { through: number }).through)
    }, 300_000)
  }
})

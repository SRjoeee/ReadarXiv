// @vitest-environment node
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import type { Written } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { LAYOUT_CLASSES, probeSamples, readInkAnswers, readMarked, readMarkProbe, readNameProbe, readSkipProbe } from '@/pdf-reader/engine/layout/marks.mjs'
import { startxrefOf } from '@/pdf-reader/engine/layout/tail.mjs'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { layerOfPaper } from '@/pdf-reader/engine/pipeline/page-pass.mjs'
import { PDFJS } from '@/pdf-reader/engine/pipeline/versions.mjs'
import { lastTexLog } from '@/pdf-reader/engine/source/latex-front.mjs'
import { unpackSource } from '@/pdf-reader/engine/source/tar.mjs'
import { LAB } from './helpers/lab-data'

// The page pass on the real papers (AXT_LAB, helpers/lab-data.ts: each paper's source, its marked compile and probe, arXiv's
// PDF): production's pass (the page stream under the default rules, rules 1, 3 and 4, none given), the marks given and the
// marked original read by the pass a page at a time, tells every object the whole path under the same rules (`whole: true`)
// tells, byte for byte, with the chained add-on over an in-process remover, and cuts a part before the last page is read; made
// under the oracle (a whole run's frame and columns' edges, captured) it tells the same too. The whole path's equality with
// next's engine under the whole run's rules is the stage's own harness's (six papers, verdicts off and on); 1810.04805's marked
// compile is not in the lab

const PDFJS_DIR = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
const open = (bytes: Uint8Array) => getDocument({ data: bytes.slice(), verbosity: 0, cMapUrl: join(PDFJS_DIR, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(PDFJS_DIR, 'standard_fonts/'), useSystemFonts: false })

describe.skipIf(!LAB)('the real papers: production\'s page stream, the marks given or read here, tells what the whole path tells; so does the oracle', () => {
  for (const name of ['1512.03385v1', '1706.03762v7', '2307.16209v1', '2608.04322v1']) {
    it(name, async () => {
      const root = join(LAB as string, 'data/layout', name), key = readFileSync(join(root, 'marks.key'), 'utf8').trim()
      const source = await unpackSource(new Uint8Array(readFileSync(join(root, 'source.gz'))))
      if (!('files' in source)) throw new Error('the source is a PDF')
      const paper = openPaper(source.files)
      // the probe's log, the latest the lab keeps, and the marked compile the marks were read from
      const probes = readdirSync(join(root, 'compiles')).filter(f => /^probe-.*\.log$/.test(f)).sort((a, b) => statSync(join(root, 'compiles', b)).mtimeMs - statSync(join(root, 'compiles', a)).mtimeMs)
      const plog = lastTexLog(readFileSync(join(root, 'compiles', probes[0] as string), 'latin1')), ink = readInkAnswers(plog, paper.units)
      const probe = { switches: readMarkProbe(plog, probeSamples(paper.units)), inkless: ink.inkless, texts: ink.texts, names: readNameProbe(plog), lineskip: readSkipProbe(plog) }
      const markedBytes = new Uint8Array(readFileSync(join(root, 'compiles', `${key}.pdf`))), log = lastTexLog(readFileSync(join(root, 'compiles', `${key}.log`), 'latin1'))
      const options = { engine: paper.meta.compiler, classes: LAYOUT_CLASSES, ...probe }
      const t1 = open(markedBytes)
      const marks = await readMarked(await t1.promise, log, { ...options, units: paper.units, OPS } as never)
      await t1.destroy()
      const bytes = new Uint8Array(readFileSync(join(root, 'arxiv.pdf')))
      const base = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), xref: startxrefOf(bytes) as number }
      const id = name.replace(/v\d+$/, ''), version = Number(name.slice(id.length + 1))
      const pass = async (o: Record<string, unknown>, readHere = false) => {
        const t = open(bytes), doc = await t.promise
        // (the marked original read by the pass itself, a page at a time beside arXiv's in the stream)
        const m = readHere ? open(markedBytes) : null
        const told: string[] = []
        const r = await layerOfPaper({
          paper: { id, version }, source: paper as never, arxiv: { doc }, OPS, pdfjs: PDFJS, base, image: '1', ...o,
          ...((m ? { marks: null, marked: { doc: await m.promise, log, options } } : { marks }) as Record<string, unknown>),
          onHead: (h, units) => { told.push(...units.map(u => u.sha256), h.sha256) },
          onLeft: l => { told.push((l as Written).sha256) }, onPart: p => { told.push((p as Written).sha256) },
        })
        await t.destroy()
        await m?.destroy()
        return { told, r }
      }
      const closedOf = (r: unknown) => (r as { stats: { closed: [number, number, number][] } }).stats.closed
      // production's, the marks given and the marked original read here, against the whole path under the same rules
      const whole = await pass({ whole: true })
      for (const readHere of [false, true]) {
        const got = await pass({}, readHere)
        expect(got.told, readHere ? 'the marked stream' : 'the stream').toEqual(whole.told)
        expect(closedOf(got.r)[0]![2]).toBeLessThan((got.r as { through: number }).through)
      }
      // and under the oracle, the whole run's predicates captured
      const capture: Record<string, unknown> = {}
      const want = await pass({ capture })
      const got = await pass({ oracle: capture })
      expect(got.told).toEqual(want.told)
      expect(want.told).toEqual(whole.told)
      expect(closedOf(got.r)[0]![2]).toBeLessThan((got.r as { through: number }).through)
    }, 300_000)
  }
})

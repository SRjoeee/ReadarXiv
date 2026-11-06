// lab/marks/back.mjs: the back half of the prepare (packages/engine prepareBack: align, locate, wrap, bundle) over the
// instrument a run of lab/marks/front.mjs stored, one paper: the units located on arXiv's page A (lane L1's count, stage 1a's
// gate, for the front half's options), and the back half's time by step. The instrument is made from the store as front.mjs
// makes it (readPdf of the stored draft, readSource of the source and the made files with the stored definitions,
// instrumentFromPlan with the stored answers). Writes <out>/<id>.json: located, unlocated by cause, each source unit's id and
// whether it is located, the steps' ms. Not shipped.
//   node --max-old-space-size=6144 --import tsx lab/marks/back.mjs --id=<id> --dir=<paper dir> --run=<front run dir>
//        --store=<dir> --out=<dir>
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { constants as Z, deflateSync, inflateRawSync, inflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import { prepareBack, readPdf } from '@readarxiv/engine'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { decodeStored } from '../../packages/engine/src/compile/cache.ts'
import { instrumentFromPlan } from '../../packages/engine/src/marks/instrument.ts'
import { readDefinitions } from '../../packages/engine/src/source/definitions.ts'
import { readSource } from '../../packages/engine/src/source/read.ts'
import { unpackSource } from '../../src/pdf-reader/engine/source/tar.mjs'
import { answersOf } from './answers-of.mjs'

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const id = arg('id'), DIR = arg('dir'), RUN = arg('run'), STORE = arg('store'), OUT = arg('out')
mkdirSync(OUT, { recursive: true })
const ROOT = new URL('../../', import.meta.url).pathname
const { LITE } = await import(pathToFileURL(join(ROOT, 'lab/pdf/spikes/lite-pdfjs.mjs')).href)
globalThis.OffscreenCanvas ??= class { getContext() { return { measureText: () => ({ width: 0 }), font: '' } } }
const NM = join(ROOT, 'node_modules/pdfjs-dist/')
const docOpts = { cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/`, verbosity: 0, useSystemFonts: false }
const r = JSON.parse(readFileSync(join(RUN, `${id}.json`), 'utf8'))
if (r.why || !r.cache?.key) { writeFileSync(join(OUT, `${id}.json`), JSON.stringify({ id, refused: r.why ?? 'not run' })); process.exit(0) }
const t0 = performance.now()
const stored = decodeStored(new Uint8Array(readFileSync(join(STORE, `${r.cache.key}.axti`))), r.cache.key)
const { files: source } = await unpackSource(new Uint8Array(readFileSync(join(DIR, 'source.gz'))))
const tree = new Map(source)
for (const [p, b] of stored.made) tree.set(p, b)
const doc = readSource({ main: stored.plan.main, files: tree }, readDefinitions(stored.definitions))
const read = await readPdf({ getDocument, OPS }, stored.pdf, { options: { ...docOpts, ...LITE }, turned: true })
const pages = read.pages.map(({ raw, page }) => (raw ? { glyphs: raw.glyphs, boxes: raw.boxes, paths: raw.paths ?? [], boxAt: raw.boxAt ?? [], points: raw.points.map(x => (/[A-Z]/.test(x.name) ? { ...x, name: x.name.toLowerCase() } : x)), paras: raw.paras ?? [], paraEnds: raw.paraEnds ?? [], view: [...page.view] } : { glyphs: [], boxes: [], paths: [], boxAt: [], points: [], paras: [], paraEnds: [], view: [...page.view] }))
const a = stored.answers?.first ? { inkless: stored.answers.first.inkless, texts: new Map(stored.answers.first.texts), lineskip: stored.answers.first.lineskip } : answersOf(stored.answers)
const ins = instrumentFromPlan({ ink: read.doc, pages, plan: stored.plan, doc, log: stored.log, made: { compiler: r.compiler, tree: String(r.year) }, inkless: a.inkless ?? [], texts: a.texts ?? null, lineskip: a.lineskip ?? null })
const tIns = performance.now()
const arxivBytes = new Uint8Array(readFileSync(join(DIR, 'arxiv.pdf')))
const sha = b => createHash('sha256').update(b).digest('hex')
const deflate = b => new Uint8Array(deflateSync(b))
const inflate = (b, limit) => { const o = { finishFlush: Z.Z_SYNC_FLUSH, maxOutputLength: limit + 1 }; try { return new Uint8Array(inflateSync(b, o)) } catch (e) { if (e?.code === 'ERR_BUFFER_TOO_LARGE') throw e; return new Uint8Array(inflateRawSync(b.subarray(2), o)) } }
const m = /^(.+)v(\d+)$/.exec(id)
let tally = null
for await (const x of prepareBack(ins, arxivBytes, { pdfjs: { getDocument, OPS }, pdfOptions: { ...docOpts, ...LITE }, PL, deflate, inflate, paper: { id: m[1], version: Number(m[2]) }, made: sha(Buffer.from(`${r.cache.key}${sha(arxivBytes)}`)), now: () => performance.now() }))
  if (x.kind === 'tally') tally = x
const tBack = performance.now()
// (each source unit of the instrument: whether a member of it is located on A)
const SOURCE = new Set('para heading caption footnote cell abstract theorem figure author affiliation reference'.split(' '))
const located = new Map()
for (const mem of tally?.locatedAll.members ?? []) {
  if (mem.unit < 0 || mem.name !== undefined) continue
  const u = ins.units[mem.unit]
  if (!SOURCE.has(u.kind)) continue
  located.set(u.id, (located.get(u.id) ?? false) || mem.located)
}
const out = { id, stats: tally?.located ?? null, wrap: tally?.wrap ?? null, units: [...located].map(([uid, ok]) => [uid.slice(0, 16), ok ? 1 : 0]), ms: { instrument: Math.round(tIns - t0), back: Math.round(tBack - tIns), ...Object.fromEntries(Object.entries(tally?.ms ?? {}).map(([k, v]) => [k, Math.round(v)])) } }
writeFileSync(join(OUT, `${id}.json`), `${JSON.stringify(out)}\n`)
console.log(id, JSON.stringify({ located: out.stats?.located, unlocated: out.stats?.unlocated, ms: out.ms }))
process.exit(0)

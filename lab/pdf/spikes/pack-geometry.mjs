// lab/pdf/spikes/pack-geometry.mjs
// A paper's left geometry (the gate's geometry file: { schema, pdfjs, kinds, left: { pages, units } }) made by the engine from the
// paper's source, arXiv's PDF and, where given, the compile cache of layer-fixtures.mjs (the marked compiles, read again for the unit
// marks): for a paper the prototype's geometry (layer-gate/ref.mjs PROTO_GEOMETRY) does not hold. On 2608.16117 it reproduces the
// prototype's file unit for unit (121 of 121).
//   node lab/pdf/spikes/pack-geometry.mjs <source.gz> <arxiv.pdf> <out.json> [<compiles folder of the paper>]
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { getDocument, OPS, version as PDFJS_V } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { COMPILE_IDENTITY } from './compile-image.mjs'
import { LITE } from './lite-pdfjs.mjs'
import { openPaper } from '../../../src/pdf-reader/engine/pipeline/live.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/source/tar.mjs'
import { readArxivText } from '../../../src/pdf-reader/engine/layout/arxiv.mjs'
import { createHash } from 'node:crypto'
import { layoutMarksOfPaper } from '../../../src/pdf-reader/engine/layout/paper.mjs'
import { anchorUnits, boundsFromMarks, floatMatches, orderOf } from '../../../src/pdf-reader/engine/pipeline/anchors.mjs'
import { leftSideOf } from '../../../src/pdf-reader/engine/pipeline/left-side.mjs'
import { displayEdges, unitText } from '../../../src/pdf-reader/engine/translate/mt.mjs'
const [sourceGz, pdf, out, compiles] = process.argv.slice(2)
const NM = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
const paper = openPaper((await unpackSource(new Uint8Array(readFileSync(sourceGz)))).files)
const task = getDocument({ data: new Uint8Array(readFileSync(pdf)), ...LITE, verbosity: 0, cMapUrl: join(NM, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(NM, 'standard_fonts/'), useSystemFonts: false })
const doc = await task.promise
const text = await readArxivText(doc)
const FLOATING = new Set(['caption', 'footnote', 'cell', 'figure'])
const texts = paper.units.map((u, i) => ({ id: i, ...unitText(u.pieces), ...displayEdges(u) }))
const floating = id => FLOATING.has(paper.units[id]?.kind ?? '')
const floatMatch = floatMatches(text.tokens, texts, floating)
let bounds
if (compiles) {
  // the marks as layer-fixtures makes them, each compile read from the cache it filled (the key is its)
  const { files: source } = await unpackSource(new Uint8Array(readFileSync(sourceGz)))
  const keyOf = marked => { const h = createHash('sha256').update(COMPILE_IDENTITY); for (const [p, b] of [...source, ...marked].sort((a, b) => (a[0] < b[0] ? -1 : 1))) h.update(p).update(b); return h.digest('hex').slice(0, 16) }
  const compile = async req => {
    const probe = !req.rerun, name = `${probe ? 'probe-' : ''}${keyOf(req.overrides)}`
    const f = join(compiles, `${name}.pdf`), pdf = existsSync(f) ? new Uint8Array(readFileSync(f)) : null
    return { ok: !!pdf?.length, pdf, log: readFileSync(join(compiles, `${name}.log`), 'latin1') }
  }
  const made = await layoutMarksOfPaper(paper, { compile, open: async bytes => { const t = getDocument({ data: bytes, ...LITE, verbosity: 0, cMapUrl: join(NM, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(NM, 'standard_fonts/'), useSystemFonts: false }); return { doc: await t.promise, close: () => t.destroy() } }, OPS })
  if (!made.unitMarks) throw new Error('no unit marks: ' + JSON.stringify(made.refused))
  bounds = boundsFromMarks(text.tokens, made.unitMarks)
}
// (in the order TeX sets the units, as the page pass anchors them: anchors.mjs orderOf)
const order = orderOf(paper.texOrder, texts.length)
const anchors = anchorUnits(text.tokens, order ? order.map(i => texts[i]) : texts, { ...(bounds ? { bounds } : {}), floating, floatMatch })
const side = leftSideOf({ doc: text.tokens, views: text.views, anchors, edges: text.edges })
writeFileSync(out, `${JSON.stringify({ schema: 1, pdfjs: PDFJS_V, kinds: paper.units.map(u => u.kind), left: { pages: side.pages, units: side.units } })}\n`)
console.log(out, paper.units.length, 'units', side.units.length, 'located')
await task.destroy()

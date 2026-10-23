// lab/pdf/spikes/bundle-check.mjs
// The layer bundle on the five papers (the layer-only plan §3; A2's E7, its proof "writeBundle then readBundle is the
// identity on the five papers" and its record "the sizes of §3.5"). For each paper, its bundle made from the parts the
// prepare will have, each from this machine's data:
//   - the units: openPaper over the paper's source (data/layout/<id>/source.gz), as bundleUnitsOf gives them;
//   - the layout: the made fixtures' (out/layer-gate/fixtures/41795914c3c84238/<id>-zh/layout.json);
//   - the left: the p10 cut's geometry (out/layer-gate/cut-p10/geometry/<id>-<target>-geometry.json, schema 1), its
//     kinds and its left side (the thesis's is under its de name);
//   - the base: arXiv's PDF's bytes and SHA-256, and our copy's address (the page the layer is drawn over is wrapped by
//     optional content, docs/PDF-READER.md §19.9: the bundle carries no add-on, only each page's cell rules, none here).
// Checked: readBundle(writeBundle(parts)) gives every part back (bytes and string alike, no unit dropped, the layout
// written as its file is), and the same parts give the same bytes. And the units of every paper of the corpus
// (data/corpus/*/source.gz), openPaper's through bundleUnitsOf, in a bundle of their own (no layout) read back: none dropped.
// Recorded (records/layer-bundle.md, sizes alone, no paper text): each part's bytes raw and gzipped (level 9), the
// bundle's raw, gzipped and brotli (quality 11), its values, and readBundle's time (the median of 5, a reading). Exits 1
// where a paper's identity fails or a corpus paper's unit is dropped.
//   pnpm exec tsx lab/pdf/spikes/bundle-check.mjs [--no-record]
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const ROOT = new URL('..', import.meta.url).pathname, REPO = new URL('../../..', import.meta.url).pathname
const ENGINE = join(REPO, 'src/pdf-reader/engine')
const { BUNDLE, bundleKey, bundleUnitsOf, readBundle, writeBundle, BUNDLE_VALUES } = await import(join(ENGINE, 'layer-proto/bundle.mjs'))
const { REMOVAL } = await import(join(ENGINE, 'pipeline/versions.mjs'))
const { encodeLayout, parseLayout } = await import(join(ENGINE, 'layout/file.mjs'))
const { countValues } = await import(join(ENGINE, 'layout/json.mjs'))
const { openPaper } = await import(join(ENGINE, 'pipeline/live.mjs'))
const { unpackSource } = await import(join(ENGINE, 'source/tar.mjs'))

const PAPERS = [['1512.03385v1', 'zh'], ['1706.03762v7', 'zh'], ['1810.04805v2', 'zh'], ['2307.16209v1', 'de'], ['2608.04322v1', 'zh']]
const FIXTURES = join(ROOT, 'out/layer-gate/fixtures/41795914c3c84238'), GEOMETRY = join(ROOT, 'out/layer-gate/cut-p10/geometry')
const CORPUS = join(ROOT, 'data/corpus')
/** the compiler image's name the web's prepare names (container/image.json) */
const IMAGE = '1'
const RECORD = !process.argv.includes('--no-record')

const sha256 = b => createHash('sha256').update(b).digest('hex')
const utf8 = s => new TextEncoder().encode(s)
const gz = b => gzipSync(b, { level: 9 }).length
const br = b => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: b.length } }).length
const kb = n => (n / 1024).toFixed(1)
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
const n0 = v => v.toLocaleString('en-US')
const median = xs => { const s = [...xs].sort((a, b) => a - b); return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 }

let failed = 0, broken = 0
const rows = []
for (const [name, target] of PAPERS) {
  const id = name.replace(/v\d+$/, ''), version = Number(name.slice(id.length + 1))
  const problems = []
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(ROOT, 'data/layout', name, 'source.gz'))))
  const paper = openPaper(files)
  const layoutText = readFileSync(join(FIXTURES, `${name}-zh`, 'layout.json'), 'utf8')
  const layout = parseLayout(utf8(layoutText))
  const geometry = JSON.parse(readFileSync(join(GEOMETRY, `${name}-${target}-geometry.json`), 'utf8'))
  if (geometry.schema !== 1) throw new Error(`${name}: the cut's geometry is not schema 1`)
  const arxiv = new Uint8Array(readFileSync(join(FIXTURES, `${name}-zh`, 'arxiv.pdf')))
  const parts = {
    paper: { id, version, pages: layout.paper.pages },
    base: { bytes: arxiv.length, sha256: sha256(arxiv), url: `/api/v1/original/${id.replace('/', '_')}v${version}` },
    image: IMAGE,
    units: bundleUnitsOf(paper),
    left: { kinds: geometry.kinds, pages: geometry.left.pages, units: geometry.left.units },
    layout,
    rules: null,
  }

  const bytes = writeBundle(parts), text = new TextDecoder().decode(bytes)
  if (!same(writeBundle(parts), bytes)) problems.push('the same parts gave other bytes')
  for (const [form, json] of [['bytes', bytes], ['string', text]]) {
    const r = readBundle(json)
    const J = JSON.stringify
    if (r.dropped.length) problems.push(`${form}: units dropped ${r.dropped.join(', ')}`)
    for (const k of ['paper', 'base', 'units', 'left', 'layout']) if (J(r[k]) !== J(parts[k])) problems.push(`${form}: ${k} not as given`)
    if (J(r.versions) !== J({ bundle: BUNDLE, pipeline: r.versions.pipeline, layout: layout.layout, removal: REMOVAL, pdfjs: layout.pdfjs, image: IMAGE })) problems.push(`${form}: versions ${J(r.versions)}`)
    if (encodeLayout(r.layout) !== layoutText) problems.push(`${form}: the layout not its file's text`)
    if (r.rules !== null) problems.push(`${form}: rules not as given`)
  }
  const times = []
  for (let i = 0; i < 5; i++) { const t = performance.now(); readBundle(bytes); times.push(performance.now() - t) }
  if (problems.length) { failed++; broken++ }
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${name}: ${paper.units.length} units, ${layout.paper.pages} pages, ${bytes.length} bytes, key ${bundleKey(id, version)}${problems.length ? `\n  ${problems.join('\n  ')}` : ''}`)
  const J = JSON.stringify, part = s => { const b = utf8(s); return [b.length, gz(b)] }
  rows.push({
    name, pages: layout.paper.pages, units: paper.units.length,
    unitsSize: part(J(parts.units)), layoutSize: part(layoutText), leftSize: part(J(parts.left)),
    raw: bytes.length, gzip: gz(bytes), brotli: br(bytes), values: countValues(text, BUNDLE_VALUES), readMs: median(times),
  })
}

// every corpus paper's units, in a bundle of their own, read back: a unit the reader drops is one the writer wrote
const corpus = { papers: 0, units: 0, unread: [], dropped: [] }
for (const folder of readdirSync(CORPUS).sort()) {
  const source = join(CORPUS, folder, 'source.gz')
  if (!existsSync(source)) continue
  const [, id, v] = /^(.+?)(?:v(\d+))?$/.exec(folder)
  const version = Number(v ?? 1)
  let units
  try { units = bundleUnitsOf(openPaper((await unpackSource(new Uint8Array(readFileSync(source)))).files)) } catch (e) { corpus.unread.push(`${folder} (${String(e?.message ?? e).slice(0, 60)})`); continue }
  const bytes = writeBundle({
    paper: { id, version, pages: 1 }, base: { bytes: 1, sha256: '0'.repeat(64), url: `/api/v1/original/${id.replace('/', '_')}v${version}` }, image: IMAGE,
    units, left: { kinds: units.map(u => u[0]), pages: [[0, 0, 612, 792]], units: [] }, layout: null, rules: null,
  })
  const r = readBundle(bytes)
  corpus.papers++
  corpus.units += units.length
  for (const i of r.dropped) corpus.dropped.push(`${folder} #${i}`)
}
console.log(`${corpus.dropped.length ? 'FAIL' : 'ok  '} the corpus: ${corpus.papers} papers, ${n0(corpus.units)} units read back, ${corpus.dropped.length} dropped${corpus.dropped.length ? ` (${corpus.dropped.join(', ')})` : ''}${corpus.unread.length ? `; ${corpus.unread.length} not opened: ${corpus.unread.join('; ')}` : ''}`)
if (corpus.dropped.length) failed++

if (RECORD) {
  const commit = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const n = v => v.toLocaleString('en-US')
  const L = [
    '# The layer bundle\'s sizes',
    '',
    `Written by \`spikes/bundle-check.mjs\` with the engine at \`${commit.slice(0, 8)}\` on ${new Date().toLocaleDateString('en-CA')}: each paper's bundle made by \`writeBundle\` from its units (\`openPaper\`, \`bundleUnitsOf\`), the made fixtures' layout (\`41795914c3c84238\`), the p10 cut's left (REMOVAL ${REMOVAL}: no add-on, the page wrapped by optional content), and read back by \`readBundle\` as it was written (the identity held on ${PAPERS.length - broken} of ${PAPERS.length}). A record, not an assertion (the layer-only plan §3.5's measure, again with the engine's own writer). KB are 1,024 bytes, as §3.5's; gzip at level 9, brotli at quality 11; a part's size is its JSON text as the bundle holds it; values as \`countValues\` counts them before \`JSON.parse\`; the read is \`readBundle\` of the bytes in Node, the median of 5.`,
    '',
    '| Paper | Pages | Units | units KB raw / gz | layout | left | **bundle raw** | **gzip** | **brotli** | values | read ms |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.name} | ${r.pages} | ${r.units} | ${kb(r.unitsSize[0])} / ${kb(r.unitsSize[1])} | ${kb(r.layoutSize[0])} / ${kb(r.layoutSize[1])} | ${kb(r.leftSize[0])} / ${kb(r.leftSize[1])} | ${n(Number(kb(r.raw)))} | ${kb(r.gzip)} | **${kb(r.brotli)}** | ${n(r.values)} | ${r.readMs.toFixed(1)} |`),
    '',
    `Every corpus paper's units (\`data/corpus/*/source.gz\`, ${corpus.papers} papers, ${n0(corpus.units)} units), in a bundle of their own, read back: ${corpus.dropped.length} dropped${corpus.unread.length ? ` (${corpus.unread.length} papers not opened)` : ''}.`,
    '',
  ]
  writeFileSync(join(ROOT, 'records/layer-bundle.md'), L.join('\n'))
  console.log('wrote records/layer-bundle.md')
}
process.exit(failed ? 1 : 0)

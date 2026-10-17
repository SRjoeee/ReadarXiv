// The lite worker (src/pdf-reader/engine/layout/pdf-lite.mjs) against the stock one on real PDFs: for every page of each PDF, the
// operator list's digest and the ink read from it (layout/ink.mjs pageInk: what the layout maker, the marks read and the add-on's
// plans consume), from a document opened without its images' pixels and from one opened as ever, must be the same; and the add-on's
// plans (layout/addon.mjs pagePlansOf) over a layout file, the same. Prints the ArrayBuffers and RSS after each side; exits 1 where anything differs.
//   pnpm exec tsx lab/pdf/spikes/lite-check.mjs [<id>v<n> … | <pdf> …] [--layouts=<gate pack's fixtures dir>]
//        [--gc] (node --expose-gc for --gc)
// One side at a time, in a process of its own (a heavy PDF's stock side holds GBs): --side=stock|lite --digests=<file> writes that side's
// digests; --compare=<stock file>,<lite file> compares two such files. Each side prints the peak ArrayBuffers and RSS it reached
// (sampled every 10 ms, no forced gc) when --side is given.
// Papers by id read <AXT_DATA, else lab/pdf/data>/layout/<id>/arxiv.pdf and every compile in its compiles/*.pdf; a path ending
// in .pdf is read alone. --layouts: <dir>/<id>-zh/layout.json is the layout file the plans are made over. Data outside git, read only.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { pagePlansOf } from '../../../src/pdf-reader/engine/layout/addon.mjs'
import { indexLayout, parseLayout } from '../../../src/pdf-reader/engine/layout/file.mjs'
import { pageInk, unreadOf } from '../../../src/pdf-reader/engine/layout/ink.mjs'
import { LITE_ALWAYS } from './lite-pdfjs.mjs'

const root = new URL('..', import.meta.url).pathname
const DATA = process.env.AXT_DATA ?? join(root, 'data')
const NM = new URL('../../../node_modules/pdfjs-dist/', import.meta.url).pathname
const argOf = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const PAPERS = ['1512.03385v1', '1706.03762v7', '1810.04805v2', '2307.16209v1', '2608.04322v1']
const given = process.argv.slice(2).filter(a => !a.startsWith('--'))
const targets = given.length ? given : PAPERS
const LAYOUTS = argOf('layouts')
const GC = process.argv.includes('--gc') && typeof globalThis.gc === 'function'
const open = (bytes, lite) => getDocument({ data: bytes.slice(), ...(lite ? LITE_ALWAYS : {}), verbosity: 0, cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/` })
const mem = async () => { if (GC) { globalThis.gc(); await new Promise(r => setTimeout(r, 300)); globalThis.gc() } else await new Promise(r => setTimeout(r, 300)); const m = process.memoryUsage(); return `arrayBuffers ${(m.arrayBuffers / 2 ** 20).toFixed(0)} MiB, rss ${(m.rss / 2 ** 20).toFixed(0)} MiB` }
const digest = x => createHash('sha256').update(x).digest('hex').slice(0, 16)
/** an object id of the document (a counter per document) written alike in both readings */
const plain = s => s.replace(/_d\d+_/g, '_dN_')

/** every page's operator-list digest and ink digest of one PDF, from a document opened lite or as ever */
async function pass(bytes, lite) {
  const task = open(bytes, lite), doc = await task.promise
  const ops = [], inks = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const list = await page.getOperatorList()
    ops.push(digest(plain(JSON.stringify([Array.from(list.fnArray), list.argsArray]))))
    const ink = pageInk(OPS, list, page.commonObjs, { rotate: page.rotate, indices: true })
    // (a page not read whole is digested as its reason alone, never a prefix of its ink: ink.mjs unreadOf)
    const why = unreadOf(ink)
    inks.push(why ? `unread:${why}` : digest(JSON.stringify(ink, (_, v) => (ArrayBuffer.isView(v) ? Array.from(v) : v))))
    page.cleanup()
  }
  await task.destroy()
  return { ops, inks }
}

const SIDE = argOf('side'), DIGESTS = argOf('digests'), COMPARE = argOf('compare')
const usage = why => { console.error(`${why}\nusage: lite-check.mjs [<id>|<pdf> …] [--layouts=<dir>] | <ids/pdfs> --side=stock|lite [--digests=<file>] | --compare=<stock file>,<lite file>`); process.exit(2) }
// the side is exactly stock or lite, before anything is read (a typo would run the stock path and label it with the typo)
if (SIDE !== null && SIDE !== 'stock' && SIDE !== 'lite') usage(`--side=${SIDE}: not --side=stock|lite`)
if (COMPARE) {
  const files = COMPARE.split(',')
  if (files.length !== 2) usage('--compare takes two files: <stock file>,<lite file>')
  const [a, b] = files.map(f => JSON.parse(readFileSync(f, 'utf8')))
  if (a.side !== 'stock' || b.side !== 'lite') usage(`--compare: the first file must record the stock side and the second the lite one (they record ${JSON.stringify(a.side ?? null)} and ${JSON.stringify(b.side ?? null)})`)
  const same = JSON.stringify(a.pdfs) === JSON.stringify(b.pdfs)
  console.log(`${same ? 'ok  ' : 'FAIL'} ${Object.keys(a.pdfs).length} PDFs, ${Object.values(a.pdfs).reduce((n, p) => n + p.ops.length, 0)} pages: operator lists and ink ${same ? 'the same' : 'DIFFER'}; peaks stock ${JSON.stringify(a.peak)} lite ${JSON.stringify(b.peak)}`)
  process.exit(same ? 0 : 1)
}
/** the PDFs a target stands for: a path ending in .pdf as it is; an id, its arXiv PDF and every compile cached beside it (one function
 *  for both modes, so that a digest record is keyed by the same paths whichever mode wrote it); an id with no PDF stands for none */
function pdfsOf(t) {
  if (t.endsWith('.pdf')) return [t]
  const dir = join(DATA, 'layout', t)
  const compiles = existsSync(join(dir, 'compiles')) ? readdirSync(join(dir, 'compiles')).filter(f => f.endsWith('.pdf')).sort().map(f => join(dir, 'compiles', f)) : []
  return existsSync(join(dir, 'arxiv.pdf')) ? [join(dir, 'arxiv.pdf'), ...compiles] : (console.log(`skip ${t}: no ${join(dir, 'arxiv.pdf')}`), [])
}
let failed = 0
const report = (ok, text) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`) }
if (SIDE !== null) {
  const peak = { arrayBuffers: 0, rss: 0 }
  const timer = setInterval(() => { const m = process.memoryUsage(); peak.arrayBuffers = Math.max(peak.arrayBuffers, Math.round(m.arrayBuffers / 2 ** 20)); peak.rss = Math.max(peak.rss, Math.round(m.rss / 2 ** 20)) }, 10)
  const pdfs = {}
  for (const file of targets.flatMap(pdfsOf)) {
    const bytes = new Uint8Array(readFileSync(file))
    if (!bytes.length) { console.log(`skip ${file}: empty`); continue }
    pdfs[file] = await pass(bytes, SIDE === 'lite')
    console.log(`${SIDE}: ${file} read, ${pdfs[file].ops.length} pages`)
  }
  await new Promise(r => setTimeout(r, 3000))
  clearInterval(timer)
  console.log(`${SIDE}: peak ${JSON.stringify(peak)}; ${await mem()}`)
  if (DIGESTS) { const { writeFileSync } = await import('node:fs'); writeFileSync(DIGESTS, JSON.stringify({ side: SIDE, pdfs, peak })) }
  process.exit(0)
}
for (const t of targets) {
  const dir = join(DATA, 'layout', t)
  const files = pdfsOf(t)
  for (const file of files) {
    const bytes = new Uint8Array(readFileSync(file))
    if (!bytes.length) { console.log(`skip ${file}: empty`); continue }
    const stock = await pass(bytes, false), stockMem = await mem()
    const lite = await pass(bytes, true), liteMem = await mem()
    const same = JSON.stringify(stock) === JSON.stringify(lite)
    report(same, `${t} ${file.slice(file.lastIndexOf('/') + 1)}: ${stock.ops.length} pages, operator lists and ink ${same ? 'the same' : 'DIFFER'}; after stock ${stockMem}; after lite ${liteMem}`)
  }
  if (LAYOUTS && !t.endsWith('.pdf')) {
    const layoutFile = join(LAYOUTS, `${t}-zh`, 'layout.json')
    if (existsSync(layoutFile)) {
      const index = indexLayout(parseLayout(new Uint8Array(readFileSync(layoutFile))))
      const bytes = new Uint8Array(readFileSync(join(dir, 'arxiv.pdf')))
      const plans = []
      for (const lite of [false, true]) {
        const task = open(bytes, lite)
        const { plans: made } = await pagePlansOf({ doc: await task.promise, OPS, index })
        plans.push(JSON.stringify([...made]))
        await task.destroy()
      }
      report(plans[0] === plans[1], `${t}: the add-on's plans over the layout file (${plans[0].length} B) ${plans[0] === plans[1] ? 'byte for byte' : 'DIFFER'}`)
    } else console.log(`skip ${t}: no ${layoutFile}`)
  }
}
process.exitCode = failed ? 1 : 0

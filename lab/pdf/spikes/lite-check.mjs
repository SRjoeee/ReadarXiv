// The lite worker (src/pdf-reader/engine/layout/pdf-lite.mjs) against the stock one on real PDFs: for every page of each PDF, the
// operator list's digest and the ink read from it (layout/ink.mjs pageInk: what the layout maker, the marks read and the add-on's
// plans consume), from a document opened without its images' pixels and from one opened as ever, must be the same; and the add-on's
// plans (layout/addon.mjs pagePlansOf) over a layout file, the same. Prints the ArrayBuffers and RSS after each side; exits 1 where anything differs.
//   pnpm exec tsx lab/pdf/spikes/lite-check.mjs [<id>v<n> … | <pdf> …] [--layouts=<gate pack's fixtures dir>]
//        [--gc] (node --expose-gc for --gc)
// Papers by id read <AXT_DATA, else lab/pdf/data>/layout/<id>/arxiv.pdf and every compile in its compiles/*.pdf; a path ending
// in .pdf is read alone. --layouts: <dir>/<id>-zh/layout.json is the layout file the plans are made over. Data outside git, read only.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { pagePlansOf } from '../../../src/pdf-reader/engine/layout/addon.mjs'
import { indexLayout, parseLayout } from '../../../src/pdf-reader/engine/layout/file.mjs'
import { pageInk } from '../../../src/pdf-reader/engine/layout/ink.mjs'
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
    inks.push(digest(JSON.stringify(ink, (_, v) => (ArrayBuffer.isView(v) ? Array.from(v) : v))))
    page.cleanup()
  }
  await task.destroy()
  return { ops, inks }
}

let failed = 0
const report = (ok, text) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`) }
for (const t of targets) {
  const dir = join(DATA, 'layout', t)
  const files = t.endsWith('.pdf') ? [t] : [join(dir, 'arxiv.pdf'), ...(existsSync(join(dir, 'compiles')) ? readdirSync(join(dir, 'compiles')).filter(f => f.endsWith('.pdf')).sort().map(f => join(dir, 'compiles', f)) : [])]
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

// lab/pdf/spikes/ledger.mjs
// The content-class ledger's lab gate (docs/route/orphan-text.md, stage 1): our final pass wrapped as the maker child wraps it
// (layout/wrap.mjs wrapFinal, the paper's source units), and its ledger (layout/ledger.mjs): each paper's letters by class, the
// share its units own, and the sweep's invariant (o), its orphan lines (layout/ledger.mjs orphanRows). It reads the gate pack's
// fixtures (`--pack`, lab/pdf/data/fixtures by default: <id>-zh/base.pdf, our final pass, and base.json, the marking's texts),
// each paper's source (`--sources`, lab/pdf/data/corpus/<id>/source.gz: its units), and bases given whole (`--pair=<id>=<base.pdf>`,
// whose source is not read: every unit's class then `body`). It writes one JSON line a paper (counts only), and with `--rows`
// the orphan rows after it (a paper's text: never into a record). `--check=<n>` exits 1 where any paper's orphan letters pass n.
//   pnpm exec tsx lab/pdf/spikes/ledger.mjs [--pack=<dir>] [--sources=<dir>] [--pair=<id>=<base.pdf>] [--rows] [--check=<n>] <id>…
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, inflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { orphanRows } from '../../../src/pdf-reader/engine/layout/ledger.mjs'
import { liteWorkerSource, NO_IMAGE_PIXELS } from '../../../src/pdf-reader/engine/layout/pdf-lite.mjs'
import { wrapFinal } from '../../../src/pdf-reader/engine/layout/wrap.mjs'
import { openPaper } from '../../../src/pdf-reader/engine/pipeline/live.mjs'
import { CLASS_IDS, CLASSES } from '../../../src/pdf-reader/engine/rules/content-classes.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/source/tar.mjs'

const LAB = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argOf = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const PACK = argOf('pack') ?? join(LAB, 'data/fixtures'), SOURCES = argOf('sources') ?? join(LAB, 'data/corpus')
const ROWS = process.argv.includes('--rows'), CHECK = argOf('check') === null ? null : Number(argOf('check'))
const PAIRS = new Map(process.argv.filter(a => a.startsWith('--pair=')).map(a => { const [id, base] = a.slice(7).split('='); return [id, base] }))
const IDS = process.argv.slice(2).filter(a => !a.startsWith('--'))
if (!IDS.length) { console.error('usage: ledger.mjs [options] <id>…'); process.exit(2) }
const PDFJS = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
// (the box's PDF.js: its worker lite, no image's pixels decoded, as the container reads our pass)
globalThis.pdfjsWorker = await import(`data:text/javascript;base64,${Buffer.from(liteWorkerSource(readFileSync(join(PDFJS, 'legacy/build/pdf.worker.mjs'), 'utf8'), { version: JSON.parse(readFileSync(join(PDFJS, 'package.json'), 'utf8')).version })).toString('base64')}`)
const OPTIONS = { cMapUrl: join(PDFJS, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(PDFJS, 'standard_fonts/'), verbosity: 0, useSystemFonts: false, maxImageSize: NO_IMAGE_PIXELS }
const deflate = b => deflateSync(b, { level: 6 }), inflate = (b, l) => inflateSync(b, { maxOutputLength: l + 1 })
/** the marking's texts a fixture's base page was marked with (base.json's `texts`), else null */
const textsOf = base => { const f = join(dirname(base), 'base.json'); const t = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8'))?.texts : null; return Array.isArray(t) ? t : null }
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0)

let failed = false
for (const id of IDS) {
  const base = PAIRS.get(id) ?? join(PACK, `${id}-zh/base.pdf`)
  const src = join(SOURCES, id, 'source.gz')
  const units = !PAIRS.has(id) && existsSync(src) ? openPaper((await unpackSource(new Uint8Array(readFileSync(src)))).files).units : null
  const t0 = performance.now()
  const r = await wrapFinal(new Uint8Array(readFileSync(base)), { PL, getDocument, documentOptions: OPTIONS, OPS, units, ...(units ? {} : { follows: null }), texts: PAIRS.has(id) ? null : textsOf(base), deflate, inflate, keepOwned: true })
  const ms = Math.round(performance.now() - t0)
  if (r.refused) { console.log(JSON.stringify({ id, refused: r.refused, why: r.why })); failed = true; continue }
  const { ledger } = r, letters = ledger.letters
  const owned = CLASS_IDS.filter(c => CLASSES[c].state === 'built').reduce((n, c) => n + (ledger.classes[c]?.[1] ?? 0), 0)
  const share = Object.fromEntries(CLASS_IDS.filter(c => ledger.classes[c]?.[1]).map(c => [c, pct(ledger.classes[c][1], letters)]))
  console.log(JSON.stringify({ id, units: units ? units.length : null, letters, builtShare: pct(owned, letters), orphanLetters: ledger.orphanLetters, orphanShare: pct(ledger.orphanLetters, letters), share, ms }))
  if (ROWS) for (const row of orphanRows(r.ledgerWhole, { paper: id })) console.log(JSON.stringify(row))
  if (CHECK !== null && ledger.orphanLetters > CHECK) failed = true
}
process.exit(failed ? 1 : 0)

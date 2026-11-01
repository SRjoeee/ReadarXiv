// lab/pdf/spikes/ledger.mjs
// The content-class ledger's lab gate (docs/route/orphan-text.md, stage 1): our final pass wrapped as the maker child wraps it
// (layout/wrap.mjs wrapFinal, the paper's source units), and its ledger (layout/ledger.mjs): each paper's letters by class, the
// share its units own, and the sweep's invariant (o), its orphan lines (layout/ledger.mjs orphanRows). It reads the gate pack's
// fixtures (`--pack`, lab/pdf/data/fixtures by default: <id>-zh/base.pdf, our final pass, and base.json, the marking's texts),
// each paper's source (`--sources`, lab/pdf/data/corpus/<id>/source.gz: its units), and bases given whole (`--pair=<id>=<base.pdf>`,
// whose source is not read: every unit's class then `body`). It writes one JSON line a paper (counts only), and with `--rows`
// the orphan rows after it (a paper's text: never into a record). `--check=<n>` exits 1 where any paper's orphan letters pass n.
// `--ink` prints each ink unit after it (its kind, echo, page, lines and text: a paper's text again, never recorded).
//   pnpm exec tsx lab/pdf/spikes/ledger.mjs [--pack=<dir>] [--sources=<dir>] [--pair=<id>=<base.pdf>] [--rows] [--ink] [--check=<n>] <id>…
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, inflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import { FeatureTest, getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { orphanRows } from '../../../src/pdf-reader/engine/layout/ledger.mjs'
import { float32Outlines, liteWorkerSource, NO_IMAGE_PIXELS } from '../../../src/pdf-reader/engine/layout/pdf-lite.mjs'
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
// (the box's PDF.js: its worker lite, no image's pixels decoded, its glyph outlines in Float32, as the container reads our pass)
const worker = await import(`data:text/javascript;base64,${Buffer.from(liteWorkerSource(readFileSync(join(PDFJS, 'legacy/build/pdf.worker.mjs'), 'utf8'), { version: JSON.parse(readFileSync(join(PDFJS, 'package.json'), 'utf8')).version })).toString('base64')}`)
float32Outlines({ FeatureTest }, worker)
globalThis.pdfjsWorker = worker
const OPTIONS = { cMapUrl: join(PDFJS, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(PDFJS, 'standard_fonts/'), verbosity: 0, useSystemFonts: false, maxImageSize: NO_IMAGE_PIXELS }
const deflate = b => deflateSync(b, { level: 6 }), inflate = (b, l) => inflateSync(b, { maxOutputLength: l + 1 })
/** the marking's texts a fixture's base page was marked with (base.json's `texts`), else null */
const inklessOf = base => { const f = join(dirname(base), 'base.json'); const t = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8'))?.inkless : null; return Array.isArray(t) ? t : null }
const textsOf = base => { const f = join(dirname(base), 'base.json'); const t = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8'))?.texts : null; return Array.isArray(t) ? t : null }
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0)

let failed = false
for (const id of IDS) {
  const base = PAIRS.get(id) ?? join(PACK, `${id}-zh/base.pdf`)
  const src = join(SOURCES, id, 'source.gz')
  const opened = !PAIRS.has(id) && existsSync(src) ? openPaper((await unpackSource(new Uint8Array(readFileSync(src)))).files) : null, units = opened?.units ?? null
  const t0 = performance.now()
  const r = await wrapFinal(new Uint8Array(readFileSync(base)), { PL, getDocument, documentOptions: OPTIONS, OPS, units, ...(units ? {} : { follows: null }), texts: PAIRS.has(id) ? null : textsOf(base), inkless: PAIRS.has(id) ? null : inklessOf(base), names: opened?.theoremNames ?? null, deflate, inflate, keepOwned: true })
  const ms = Math.round(performance.now() - t0)
  if (r.refused) { console.log(JSON.stringify({ id, refused: r.refused, why: r.why })); failed = true; continue }
  const { ledger } = r, letters = ledger.letters
  // (the letters in classes whose path is built: classified ink, not drawn ink — a unit the wrap leaves the original's, its
  // `unhidden`, is counted in its class all the same)
  // (the summary's classes flat, [class, glyphs, letters, …]: ledger.mjs ledgerSummary)
  const lettersOf = new Map()
  for (let j = 0; j < ledger.classes.length; j += 3) lettersOf.set(ledger.classes[j], ledger.classes[j + 2])
  const owned = CLASS_IDS.filter(c => CLASSES[c].state === 'built').reduce((n, c) => n + (lettersOf.get(c) ?? 0), 0)
  const share = Object.fromEntries(CLASS_IDS.filter(c => lettersOf.get(c)).map(c => [c, pct(lettersOf.get(c), letters)]))
  // the ink units (layout/ink-units.mjs): how many of each kind, how many echo a source unit's row
  const inkKinds = {}
  for (const u of r.ink.units) inkKinds[u.kind] = (inkKinds[u.kind] ?? 0) + 1
  const ink = { units: r.ink.units.length, kinds: inkKinds, echo: r.ink.units.filter(u => u.echo !== null).length }
  console.log(JSON.stringify({ id, units: units ? units.length : null, letters, builtShare: pct(owned, letters), orphanLetters: ledger.orphanLetters, orphanShare: pct(ledger.orphanLetters, letters), share, ink, ms }))
  if (process.argv.includes('--ink')) for (const u of r.ink.units) console.log(JSON.stringify({ ink: u.id, kind: u.kind, echo: u.echo, page: u.rows.lines[0], lines: u.rows.lines.length / 8, text: u.pieces.map(p => (p.t === 'text' ? p.s : p.t === 'ph' ? '⟦·⟧' : '')).join('').slice(0, 100) }))
  if (ROWS) for (const row of orphanRows(r.ledgerWhole, { paper: id })) console.log(JSON.stringify(row))
  if (CHECK !== null && ledger.orphanLetters > CHECK) failed = true
}
process.exit(failed ? 1 : 0)

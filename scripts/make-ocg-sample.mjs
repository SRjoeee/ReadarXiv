// The per-unit erasure's sample (tests/fixtures/pdf/ocg/; design docs/route/ocg-erasure.md §2–§3): sample-1's four pages with
// points written in (tests/pdf-reader/helpers/ocg-pdfs.ts markedSample: every three text-showing operators of a text object a
// unit) and wrapped by the engine (layout/wrap.mjs wrapFinal), for the reader's side to be built against the file's real form:
// `sample-1-wrapped.pdf` (our pass and the wrap section: groups `axt:u<id>`, all ON) and `sample-1-wrapped.json` (wrapFinal's
// head fields: stats, unhidden, labelKept, and the bytes' digest and startxref). CC0, as sample-1 is.
//   pnpm exec tsx scripts/make-ocg-sample.mjs           # writes them
//   pnpm exec tsx scripts/make-ocg-sample.mjs --check   # exits 1 where they differ
import { readFileSync, writeFileSync } from 'node:fs'
import { markedSample, wrapped } from '../tests/pdf-reader/helpers/ocg-pdfs.ts'

const dir = new URL('../tests/fixtures/pdf/ocg/', import.meta.url)
const { bytes } = await markedSample()
const r = await wrapped(bytes)
if ('refused' in r) throw new Error(`${r.refused}: ${r.why}`)
const head = `${JSON.stringify({ bytes: r.bytes.length, sha256: r.sha256, xref: r.xref, stats: r.stats, unhidden: r.unhidden, labelKept: r.labelKept }, null, 1)}\n`
if (process.argv.includes('--check')) {
  const same = readFileSync(new URL('sample-1-wrapped.json', dir), 'utf8') === head && Buffer.compare(readFileSync(new URL('sample-1-wrapped.pdf', dir)), Buffer.from(r.bytes)) === 0
  console.log(same ? 'the same' : 'they differ')
  process.exit(same ? 0 : 1)
}
writeFileSync(new URL('sample-1-wrapped.pdf', dir), r.bytes)
writeFileSync(new URL('sample-1-wrapped.json', dir), head)
console.log(head)

// The per-unit erasure's sample (tests/fixtures/pdf/ocg/; docs/PDF-READER.md §19.9): sample-1's own marked compile, wrapped by
// the engine, for the reader's side and its e2e to be built against the file's real form. CC0, as sample-1 is.
//   - `sample-1-final.pdf`: our final pass of sample-1's marked compile, the base page the layer is laid over (made by
//     `pnpm exec tsx scripts/make-sample-bundle.mjs --out=<scratch> --final=tests/fixtures/pdf/ocg/sample-1-final.pdf`, native
//     TeX Live in Docker, no network; remade with the bundle);
//   - `sample-1-wrapped.pdf`: it wrapped (layout/wrap.mjs wrapFinal, the sample's source units: its unit ids the bundle's), our
//     pass and the wrap section (groups `axt:u<id>`, `axt:u<id>.p`, `axt:u<id>.l`, `axt:n<occ>`, all ON);
//   - `sample-1-wrapped.json`: wrapFinal's head fields (bytes, sha256, xref, stats, unhidden, labelKept) and its figure units
//     (`figures`: the TikZ figure's text, each drawn unit with its group and place, and the counts; the page pass's `ours.wrap.figures`).
//   pnpm exec tsx scripts/make-ocg-sample.mjs           # writes the wrapped pair
//   pnpm exec tsx scripts/make-ocg-sample.mjs --check   # exits 1 where they differ
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { openPaper } from '../src/pdf-reader/engine/pipeline/live.mjs'
import { wrapped } from '../tests/pdf-reader/helpers/ocg-pdfs.ts'

const dir = new URL('../tests/fixtures/pdf/ocg/', import.meta.url), sample = new URL('../tests/fixtures/pdf/sample-1/', import.meta.url)

/** the engine's wrap of the committed final pass, as this script writes it: the wrapped PDF's bytes and the head's JSON */
export async function sampleWrap() {
  const paper = openPaper(new Map(['main.tex', 'refs.bib', 'main.bbl'].map(f => [f, new Uint8Array(readFileSync(new URL(f, sample)))]))), units = paper.units
  const r = await wrapped(new Uint8Array(readFileSync(new URL('sample-1-final.pdf', dir))), { units, follows: undefined, names: paper.theoremNames })
  if ('refused' in r) throw new Error(`${r.refused}: ${r.why}`)
  const head = `${JSON.stringify({ bytes: r.bytes.length, sha256: r.sha256, xref: r.xref, stats: r.stats, unhidden: r.unhidden, labelKept: r.labelKept, figures: r.figures }, null, 1)}\n`
  return { bytes: r.bytes, head }
}

/** whether the committed wrapped pair is the engine's wrap of the committed final pass now (`--check`; a test runs it, so that
 *  a change of the marks or of the wrap cannot leave the pair stale silently: the website's own test compares its Worker's wrap
 *  with this pair) */
export async function sampleWrapSame() {
  const { bytes, head } = await sampleWrap()
  return readFileSync(new URL('sample-1-wrapped.json', dir), 'utf8') === head && Buffer.compare(readFileSync(new URL('sample-1-wrapped.pdf', dir)), Buffer.from(bytes)) === 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--check')) {
    const same = await sampleWrapSame()
    console.log(same ? 'the same' : 'they differ')
    process.exit(same ? 0 : 1)
  }
  const { bytes, head } = await sampleWrap()
  writeFileSync(new URL('sample-1-wrapped.pdf', dir), bytes)
  writeFileSync(new URL('sample-1-wrapped.json', dir), head)
  console.log(head)
}

// lab/pdf/prepare-back/restate.mjs: a stage 1a run's dumps with the baseline's units it does not make stated again (stated.mjs),
// with no compile and no prepare: each dump's own units kept as they are, the statements run.mjs's --baseline wrote dropped and
// made again (with the trails and labels its bundles' parts carry), numbered after the dump's own units as run.mjs numbers them, its counts
// made again. For a change to how the statement reads (an acceptance ruling) measured on a run already made; the differential
// then reads <out>. With --papers=<tsv> (a corpus list: each paper's id and the folder of its arxiv.pdf) arXiv's glyphs are read
// as the back half reads A (readArxiv), for the causes that read a line's glyphs ((f'), stated.mjs); without, those are not stated.
//   node --import tsx lab/pdf/prepare-back/restate.mjs <baseline prepare dir> <run dir> <out dir> [--papers=<tsv>]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { statedOf, trailsOf } from './stated.mjs'

const args = process.argv.slice(2)
const [BASELINE, RUN, OUT] = args.filter((a) => !a.startsWith('--'))
const PAPERS = args.find((a) => a.startsWith('--papers='))?.slice('--papers='.length)
if (!BASELINE || !RUN || !OUT) {
  console.error('restate.mjs <baseline prepare dir> <run dir> <out dir> [--papers=<tsv>]')
  process.exit(2)
}
// (arXiv's PDF of each paper, and A's glyphs on each page as the back half reads them: readArxiv, run.mjs's)
const pdfOf = new Map(
  (PAPERS ? readFileSync(PAPERS, 'utf8') : '')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'))
    .map(([id, dir]) => [id, join(dir, 'arxiv.pdf')]),
)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const read = PAPERS
  ? await (async () => {
      const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const { readArxiv } = await import(pathToFileURL(join(ROOT, 'packages/engine/src/prepare.ts')).href)
      const { LITE } = await import(pathToFileURL(join(ROOT, 'lab/pdf/spikes/lite-pdfjs.mjs')).href)
      const NM = join(ROOT, 'node_modules/pdfjs-dist/')
      const docOpts = { cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/`, verbosity: 0, useSystemFonts: false }
      return async (f) => {
        const r = await readArxiv({ getDocument, OPS }, new Uint8Array(readFileSync(f)), { ...docOpts, ...LITE })
        return r.pages.map((p) => p.page.glyphs)
      }
    })()
  : null
mkdirSync(join(OUT, 'prepare'), { recursive: true })
let papers = 0,
  stated = 0
for (const f of readdirSync(join(RUN, 'prepare')).filter((f) => f.endsWith('.prepare.json')).sort()) {
  const dump = JSON.parse(readFileSync(join(RUN, 'prepare', f), 'utf8'))
  const units = dump.units.filter((u) => !u.replaced)
  if (existsSync(join(BASELINE, f))) {
    const base = JSON.parse(readFileSync(join(BASELINE, f), 'utf8')).units
    // (the trails the run's parts' members carry, as locate's members carried them to run.mjs)
    const dir = join(RUN, 'bundles', f.slice(0, -'.prepare.json'.length))
    const members = existsSync(dir)
      ? readdirSync(dir)
          .filter((p) => p.endsWith('.part'))
          .flatMap((p) => JSON.parse(readFileSync(join(dir, p), 'utf8')).flows.flat())
      : []
    const els = members.flatMap((m) => m.els ?? [])
    // (the number each unit's label states (Label.num), by its ord in the dump: located/<id>.json's dumpOrds join the two)
    const located = join(RUN, 'located', `${f.slice(0, -'.prepare.json'.length)}.json`)
    const num = new Map(members.filter((m) => m.label?.num).map((m) => [m.ord, m.label.num[0]]))
    const labels = new Map(
      (existsSync(located) ? JSON.parse(readFileSync(located, 'utf8')).dumpOrds : []).map(([o, m]) => [o, num.get(m)]).filter(([, n]) => n),
    )
    let ord = units.reduce((m, u) => Math.max(m, u.ord + 1), 0)
    const pdf = pdfOf.get(f.slice(0, -'.prepare.json'.length))
    const pages = read && pdf && existsSync(pdf) ? await read(pdf) : null
    const glyphs = (p) => pages?.[p - 1] ?? null
    for (const { u, why, cause, holder } of statedOf(base, units, { trails: trailsOf(els), labels, glyphs, displays: dump.displays ?? [] })) {
      units.push({ id: u.id, ord: ord++, kind: u.kind, text: u.text, pieces: u.pieces, state: 'unlaid', why, replaced: true, stated: { ord: u.ord, cause, ...(holder ? { holder } : {}) } })
      stated++
    }
  }
  const counts = { ...dump.counts, units: units.length, drawn: 0, laid: 0, unlaid: 0, byKind: {} }
  for (const u of units) {
    counts[u.state]++
    const k = (counts.byKind[u.kind] ??= { drawn: 0, laid: 0, unlaid: 0 })
    k[u.state]++
  }
  writeFileSync(join(OUT, 'prepare', f), `${JSON.stringify({ ...dump, counts, units })}\n`)
  papers++
}
console.log(JSON.stringify({ papers, stated }))

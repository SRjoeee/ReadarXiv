// The highlight's gate (plans/2026-10-01-pdf-highlight.md, B1; B2–B5 run it after each of their tasks). On the ten papers
// of the highlight's investigation (report-A: arXiv's PDF on the left, our Chinese typesetting on the right), each side
// anchored as the reader anchors it (session.mjs anchorSide, today's front end's hints), the geometry the reader paints
// and hit-tests by (src/pdf-reader/engine/highlight.mjs), measured per side and per kind of unit:
//  - lit: units painted on the side (one run at least) and on both sides — and anchored ones that are not (must be 0)
//  - holes: points on a 1.5-unit grid inside every painted block where the hit test lights nothing (must be 0); where it
//    lights another unit painted over it, smaller (a heading run into its paragraph), counted apart
//  - runs: a unit's blocks (one per run) and its pages-and-columns; where a page and column holds more than one of its
//    runs, another unit's line cut them (a float set inside a paragraph), listed to be looked at; the units with a
//    display so cut
//  - cost: the side's layout when it is anchored (layoutOf), every page's geometry as it is first drawn (pageGeometry),
//    median of ROUNDS
// Counts only, no paper text. Pad beside a block: 3 CSS px at 100 % (2.25 PDF units). The browser's half — the pointer,
// the paint, their costs against another build — is highlight-gate-browser.mjs.
// The data (papers may not be redistributed; research/pdf-bilingual/data/runs/highlight-ten, linked from
// data/runs/highlight-ten): per paper arXiv's PDF (data/corpus/<id>/arxiv.pdf), the run's `original-marked.pdf`,
// `final.pdf` and `final-texts.json` (spikes/live-node.mjs, Microsoft → Chinese), and `pieces/<id>.json`, the pieces
// the translation was typeset from (for the placeholders' places in its headings).
//   pnpm exec tsx experiments/pdf-bilingual/spikes/highlight-gate.mjs [id …]   → out/highlight-gate.json
//   RUNS=<dir> another set of runs; ROUNDS=<n> the cost's repeats (default 7)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { anchorUnits, boundsFromMarks, markWords, tokenizeDocument } from '../../../src/pdf-reader/engine/anchors.mjs'
import { blockOf, hitOf, layoutOf, pageGeometry, runsOf } from '../../../src/pdf-reader/engine/highlight.mjs'
import { openPaper } from '../../../src/pdf-reader/engine/live.mjs'
import { displayEdges, unitText } from '../../../src/pdf-reader/engine/mt.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'

const root = new URL('..', import.meta.url).pathname
const RUNS = process.env.RUNS ?? join(root, 'data/runs/highlight-ten')
const ROUNDS = Number(process.env.ROUNDS ?? 7)
const TEN = ['2608.02163', '2608.02785', '2608.02991', '2608.03063', '2608.06701', '2608.07683', '2608.08350', '2608.09746', '2608.12502', '2608.29181']
const ids = process.argv.slice(2).length ? process.argv.slice(2) : TEN
/** the units TeX sets away from where the source has them (session.mjs FLOATING) */
const FLOATING = new Set(['caption', 'footnote', 'cell', 'figure'])
const PAD = 3 / (96 / 72), STEP = 1.5

async function loadPdf(file) {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0, cMapUrl: `${root}node_modules/pdfjs-dist/cmaps/`, cMapPacked: true, standardFontDataUrl: `${root}node_modules/pdfjs-dist/standard_fonts/` })
  const pdf = await task.promise
  const pages = [], views = []
  for (let p = 1; p <= pdf.numPages; p++) { const pg = await pdf.getPage(p), tc = await pg.getTextContent(); pages.push({ page: p, items: tc.items, styles: tc.styles }); views.push(pg.view) }
  const marks = new Map()
  for (const [name, d] of await pdf.getDestinations()) if (/^axt-\d+[se]$/.test(name) && d) marks.set(name.slice(4), { page: (await pdf.getPageIndex(d[0])) + 1, x: d[2], y: d[3] })
  await task.destroy()
  return { pages, views, marks }
}

const DISPLAY = /^\\begin\s*\{(equation|align|alignat|gather|multline|flalign|eqnarray|displaymath|dmath|IEEEeqnarray|subequations)\*?\}|^\\\[|^\$\$/
/** a unit's kind as report-A counted them: headings by depth, captions by float, paragraphs with a display apart */
function kindOf(paper, u) {
  if (u.kind === 'heading') return u.title ? 'title' : ({ 1: 'section', 2: 'subsection', 3: 'subsubsection' })[u.depth] ?? 'run-in head'
  if (u.kind === 'caption') return 'caption'
  const display = u.pieces.some(p => p.t === 'ph' && DISPLAY.test(p.src.trim())) || typeof u.lead === 'string' || typeof u.trail === 'string'
  if (u.kind === 'para') {
    const pre = (paper.project.files.get(u.file) ?? '').slice(Math.max(0, u.start - 80), u.start)
    return /\\item(\s*\[[^\]]*\])?\s*$/.test(pre) ? 'list item' : display ? 'paragraph with a display' : 'paragraph'
  }
  if (u.kind === 'theorem') return display ? 'theorem with a display' : 'theorem-like body'
  return u.kind === 'figure' ? 'TikZ text' : u.kind
}

const median = xs => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] ?? null }
const tally = {}, cost = {}, cuts = []
const count = (key, field, n = 1) => { const t = (tally[key] ??= { n: 0, anchoredL: 0, anchoredR: 0, litL: 0, litR: 0, both: 0, unlitAnchored: 0, points: 0, holes: 0, smaller: 0, runs: 0, pageCols: 0, cut: 0, fragmentedDisplays: 0 }); t[field] += n }

for (const id of ids) {
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(root, 'data/corpus', id, 'source.gz'))))
  const paper = openPaper(files), units = paper.units
  const kind = new Map(units.map((u, i) => [i, u.kind])), floating = x => FLOATING.has(kind.get(x))
  const pf = join(RUNS, 'pieces', `${id}.json`), typeset = existsSync(pf) ? JSON.parse(readFileSync(pf, 'utf8')) : {}
  const src = units.map((u, i) => ({ id: i, ...unitText(u.pieces), ...displayEdges(u) }))
  const texts = JSON.parse(readFileSync(join(RUNS, id, 'final-texts.json'), 'utf8')).map(t => ({ ...(typeset[t.id] ? unitText(typeset[t.id]) : paper.kept.has(units[t.id]) ? unitText(units[t.id].pieces) : t), id: t.id, ...displayEdges(units[t.id]) }))
  const OM = await loadPdf(join(RUNS, id, 'original-marked.pdf'))
  const sides = {}
  for (const [S, file, T] of [['L', join(root, 'data/corpus', id, 'arxiv.pdf'), src], ['R', join(RUNS, id, 'final.pdf'), texts]]) {
    const pdf = await loadPdf(file), doc = tokenizeDocument(pdf.pages)
    const marks = S === 'L' ? markWords(tokenizeDocument(OM.pages), OM.marks) : pdf.marks
    const anchors = anchorUnits(doc, T, { bounds: boundsFromMarks(doc, marks), floating })
    const kinds = id => kind.get(id)
    // the cost: the layout at anchoring, then every page's geometry as each is first drawn
    const layoutMs = [], pagesMs = [], pageMax = []
    for (let r = 0; r < ROUNDS; r++) {
      const t0 = performance.now(), L = layoutOf(doc, pdf.views, anchors, kinds), t1 = performance.now()
      let max = 0
      for (let p = 1; p <= pdf.views.length; p++) { const a = performance.now(); pageGeometry(L, p); max = Math.max(max, performance.now() - a) }
      layoutMs.push(t1 - t0); pagesMs.push(performance.now() - t1); pageMax.push(max)
    }
    cost[`${id} ${S}`] = { pages: pdf.views.length, tokens: doc.length, layoutMs: +median(layoutMs).toFixed(2), allPagesMs: +median(pagesMs).toFixed(2), perPageMs: +(median(pagesMs) / pdf.views.length).toFixed(3), pageMaxMs: +median(pageMax).toFixed(2) }
    sides[S] = { anchors, layout: layoutOf(doc, pdf.views, anchors, kinds) }
  }
  units.forEach((u, i) => {
    const k = kindOf(paper, u)
    count(k, 'n')
    let lit = 0
    for (const S of ['L', 'R']) {
      const { anchors, layout } = sides[S], runs = runsOf(layout, i)
      if (anchors.get(i)) count(k, `anchored${S}`)
      if (runs.length) { count(k, `lit${S}`); lit++ } else if (anchors.get(i)) count(k, 'unlitAnchored')
      // holes: every point of every painted block
      for (const run of runs) {
        const b = blockOf(run, PAD)
        for (let x = b.x0 + STEP / 2; x < b.x1; x += STEP) for (let y = b.y0 + STEP / 2; y < b.y1; y += STEP) {
          const hit = hitOf(layout, run.page, x, y, PAD)
          count(k, 'points')
          if (!hit) count(k, 'holes')
          else if (hit.id !== i) count(k, 'smaller')
        }
      }
      // runs per page and column
      const per = new Map()
      for (const run of runs) per.set(`${run.page}${run.col}`, (per.get(`${run.page}${run.col}`) ?? 0) + 1)
      count(k, 'runs', runs.length)
      count(k, 'pageCols', per.size)
      for (const [pc, n] of per) if (n > 1) { count(k, 'cut'); cuts.push(`${id}#${i} ${S} p${pc} ×${n}`) }
      if (/display/.test(k) && [...per.values()].some(n => n > 1)) count(k, 'fragmentedDisplays')
    }
    if (lit === 2) count(k, 'both')
  })
  console.error(id, 'done')
}

const cols = ['n', 'anchoredL', 'litL', 'anchoredR', 'litR', 'both', 'unlitAnchored', 'holes', 'smaller', 'points', 'runs', 'pageCols', 'cut', 'fragmentedDisplays']
console.log(['kind'.padEnd(26), ...cols].join('\t'))
const sum = Object.fromEntries(cols.map(c => [c, 0]))
for (const [k, t] of Object.entries(tally).sort()) { console.log([k.padEnd(26), ...cols.map(c => t[c])].join('\t')); for (const c of cols) sum[c] += t[c] }
console.log(['all'.padEnd(26), ...cols.map(c => sum[c])].join('\t'))
console.log('\nruns cut by another unit\'s line (page, column, blocks):', cuts.length, cuts.slice(0, 12).join('; '))
console.log('\ncost, ms (median of', ROUNDS, 'rounds): layout at anchoring; every page\'s geometry; per page; the slowest page')
for (const [k, c] of Object.entries(cost)) console.log(k.padEnd(14), `${c.pages} pp, ${c.tokens} tokens`, `layout ${c.layoutMs}`, `pages ${c.allPagesMs}`, `per page ${c.perPageMs}`, `max ${c.pageMaxMs}`)
const failed = sum.holes > 0 || sum.unlitAnchored > 0
mkdirSync(join(root, 'out'), { recursive: true })
writeFileSync(join(root, 'out/highlight-gate.json'), JSON.stringify({ ids, tally, cost, cuts }, null, 1))
console.log(failed ? '\nFAIL: holes, or anchored units not lit' : '\nok: no hole, every anchored unit lit')
process.exitCode = failed ? 1 : 0

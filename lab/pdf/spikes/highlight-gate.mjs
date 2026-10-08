// The highlight's gate (plans/2026-10-01-pdf-highlight.md, B1; B2–B5 run it after each of their tasks). On the ten papers
// of the highlight's investigation (report-A: arXiv's PDF on the left, our Chinese typesetting on the right), each side
// anchored as the reader anchors it (session.mjs anchorSide, today's front end's hints), the geometry the reader paints
// and hit-tests by (src/pdf-reader/engine/view/highlight.mjs), measured per side and per kind of unit:
//  - anchored and lit: units located on the side, units painted there (one run at least), and on both sides
//  - holes: points on a 1.5-unit grid inside every painted block where the hit test lights nothing; where it lights
//    another unit painted over it, smaller (a heading run into its paragraph), counted apart
//  - ink holes: each unit's words, at their ink's centre (inkEdges, the glyphs' height), that are in none of the unit's
//    blocks — a word of the unit that lights nothing, or its neighbour; but for words past every column's text edge
//    by more than the overhang (an overfull line in the margin or the gutter), which the clamp leaves out by design,
//    counted apart (pastEdge)
//  - unreachable: a unit painted on a page where no point of the grid lights it (smaller units over all of it)
//  - runs: a unit's blocks (one per run) and its pages-and-columns; where a page and column holds more than one of its
//    runs, a line cut them (a float set inside a paragraph, a full-width display), listed; the units with a display so
//    cut (fragmented displays); one unit's blocks overlapping on a page (the wash doubled)
//  - every block's extent, per paper and side, as one digest (to a hundredth of a unit)
//  - what the geometry takes beyond the anchors, per paper and side (pageGeometry): the units whose head it takes, by
//    kind (a heading's number, a theorem's head); the words it fills in; the cells whose ink reaches more than 3 em
//    past a word's box (the marks' carry); and the runs whose pad overlaps another unit's block by over half a unit
//    (the leading's pads)
//  - cost: the side's layout when it is anchored (layoutOf), every page's geometry as it is first drawn (pageGeometry),
//    median of ROUNDS
// It fails (exit 1) on: an anchored unit not lit; a hole; an ink hole; an unreachable unit; a fragmented display; one
// unit's blocks overlapping; a cut not in the baseline; more words past the edge than the baseline's; against the
// baseline (highlight-gate.baseline.json, per paper, side and kind), fewer units anchored or lit, and any change in
// what the geometry takes (heads, fills, cells' ink, pads' overlaps: a change meant is recorded again), and any block's
// extent moved (the same); and when
// PDF.js's character maps or standard fonts are not beside its module, which left a side's text half read and the
// gate printing ok (the review of B1: anchors on the right 1 906 → 538).
// Each was made to fail once (B1's first round of review, a copy of the tree each): a baseline count raised by one
// (lit 52 against 53); CMAPS=/nowhere (stops before reading), and CMAPS at a directory holding the one map looked for
// (the translation's anchors fall below the baseline); the block's glyph extent dropped (8 ink holes); hitOf without
// the pad (368 641 holes); a unit in 50 left out of its page's geometry (82 anchored, not lit); interrupted() always
// true (781 fragmented displays, 1 020 units' blocks overlapping, cuts not in the baseline); each run given twice
// (3 791 overlapping); the baseline's words past the edge lowered by one. Broken the re-review's nine ways (before B2,
// a copy of the tree each), it fails on seven: smaller-wins inverted (176 unreachable), the marks' carry unlimited
// (18 cells' ink past 3 em), the head dropped, the fill dropped (heads, fills against the baseline), the median
// leading and the vertical pads doubled (pads' overlaps; and 9 units' blocks overlapping), floats clamped (an ink
// hole, 13 words past the edge). The old column rule and the widetext cut dropped change nothing it measures on the
// ten papers (no widetext there, no run of a two-column page the old rule makes otherwise);
// tests/pdf-reader/highlight.test.ts fails on both.
// Sentences (B3: plans/2026-10-01-pdf-highlight.md), from each run's sentences (spikes/highlight-sentences.mjs:
// Microsoft's sentence lengths for the very wires the reader sends, cut as mt.mjs sentencesOf cuts them), each side's
// starts found as the reader finds them (anchors.mjs sentenceStarts) and a unit lit by sentence where both found all
// of its (running text only). The files are first made again by the reader's own path (sentences-path.mjs: the
// Microsoft answers kept, out/highlight/B3/ms-cache-zh-<auto|en>.json, through the extension's Microsoft provider, the
// service's check, engine.mjs and mt.mjs translateUnits, no request made), and any unit whose sentences differ fails
// the gate: a change to that path meant is recorded by making the files again (highlight-sentences.mjs,
// MAX_REQUESTS=0). Per paper:
//  - units with sentences, more than one, and found on the left, on the right, on both (aligned)
//  - holes inside sentence shapes: points on the grid inside each sentence's shape (highlight.mjs sentenceOf) where the
//    hit test (hitOf with the sentences) lights nothing, or another sentence of the unit; a smaller unit is counted apart
//  - words outside their unit's sentences: a word of a unit lit by sentence whose ink's centre none of its shapes holds;
//    and the head before its first word (a theorem's, a list's label: no unit's word) outside its first sentence
//  - rows two sentences share: the one's end and the next's start, no gap and no overlap between them; and the
//    boundaries that pass through a word's ink as inkEdges estimates it — the estimate the boundaries are placed by,
//    so a check of the geometry against itself, which cannot see the estimate's own error (the review of B3, minor 7);
//    what the page shows is the browser gate's canvas measure, against round 1's 3 of 72 boundaries
//  - the pieces of a sentence that goes on over a column or a page break: the one before the break reaching its unit's
//    text edge on the right there (the furthest the unit's lines reach in the column, inside the column's text edge),
//    the one after it on the left; short of it where another unit's word stands between them, counted apart
//  - the left's starts by its text alone, no marks (B3c: arXiv's PDF before our marked original's marks come), against
//    those found with the marks: units both found, by one alone, the starts on the marks' token and line; and on the
//    ground truth, arXiv's PDF by its text alone (AXtext) beside it with the marks (AX)
//  - with the floats made (highlight-gate-floats.mjs), each sentence's rows over a float's painted shape (a figure's
//    outline, a table's wash), and the points of them where the pointer finds the float: painted as the sentence, lit as
//    the float (a row past its ink keeps from under a float, highlight.mjs reachAt)
//  - the starts' cost on each side (findSentences: every unit's, as the reader does with the layout)
// and on investigator B's ground truth (report-B §2(c, d): data/runs/highlight-gt, the four papers compiled with a
// named destination at every sentence's start, O2 and T2, and without, O1 and T1), each start found on O1, T1 and
// arXiv's PDF (anchored by O1's marks carried, as the reader does) against the mark for the same sentence — on our
// compiles where the two have the same words, the mark's word in the marked compile; on arXiv's PDF the mark carried
// where its word is there — on the same line or not.
// Fails besides on: a hole inside a sentence's shape, or another sentence lit there; a word outside its unit's
// sentences but past the column's edge, a head outside its first sentence; a gap or an overlap between two sentences on
// a row; a piece short of its unit's text edge over a break; a point of a sentence the pointer finds a float at; a start
// by the text alone off the marks' line; a
// sentence file not what the reader's path makes; against
// the baseline, fewer units aligned per paper, more boundaries through ink, and fewer starts on the
// ground truth's line. Each made to fail once (B3, in the tree, put back
// after): the head left out of the first sentence (486 heads outside), the boundary at the next word's start instead of
// the middle of the space (3 498 gaps), a sentence's last row taken across the run (1.8 M holes, 4 M points lighting
// another sentence, 2 097 overlaps), each start taken at its sentence's last word (the ground truth's lines 23 of 167 on
// 2608.02785, 2 of 138 on 2608.04322; and 14 holes, a defect it found: 9d449c59), the rows' order rule dropped (616
// holes, 452 another sentence), the words' fit dropped (15 words outside). In B3's first round of review (I1): the
// sentence that began in a run before or goes on into a run after taken as beginning or ending in the run (28 pieces
// short of the edge on 2608.02785 and 2608.29181). The blocks' digest (B3's review, minor 1): the overhang 6.5 units for 6
// (2608.02785 both sides, 2608.12502's right: moved). The sentences against the floats (B3's follow-up): a float winning
// over every block (100 points of 2608.06701 #227's second sentence, a word on a table's caption line, lit as the
// table; on the ten papers no row past its ink comes under a float, so the guard itself is held by
// tests/pdf-reader/floats.test.ts).
// WRITE_BASELINE=1 records the run as the baseline (counts only).
// Counts only, no paper text. Pad beside a block: 3 CSS px at 100 % (2.25 PDF units). The browser's half — the pointer,
// the paint, their costs against another build — is highlight-gate-browser.mjs.
// The data (papers may not be redistributed; research/pdf-bilingual/data/runs/highlight-ten, linked from
// data/runs/highlight-ten): per paper arXiv's PDF (data/corpus/<id>/arxiv.pdf), the run's `original-marked.pdf`,
// `final.pdf` and `final-texts.json` (spikes/live-node.mjs, Microsoft → Chinese), and `pieces/<id>.json`, the pieces
// the translation was typeset from (for the placeholders' places in its headings); `sentences/<id>.json`, the units'
// sentences (spikes/highlight-sentences.mjs). 2608.08350's pieces name its footnotes' file as the package holds it
// (sections/NTK.tex, not ./sections/NTK.tex) since loadProject does (a55998d9): renamed 2026-10-02, and the same as the
// pieces made again by investigator A's retranslate.mjs from Microsoft's answers, today's (224 of its 332 units) and
// those kept (220); for the others today's answers are not the run's. The ground truth (research/pdf-bilingual/data/runs/highlight-gt, linked
// from data/runs/highlight-gt): per paper investigator B's four compiles, its units with its starts (b-units.json), the
// translation's texts, and `sentences/<id>.json` (highlight-sentences.mjs with FROM=en, from B's Microsoft answers).
// Both are read in the cutting they were made with (highlight-runs.mjs: every unit by its source span), whatever the
// tree cuts now: a run unit the tree cuts otherwise is judged absent and the baseline's counts of its kind allow for it,
// and a unit whose wire has no Microsoft answer kept (the wire changed since) is left out of the sentence files' check;
// both are counted in the report. Since the typesetting rule's merge (2026-10-02): 2608.03063's two cells and a
// paragraph cut otherwise, 127 units' wires unanswered on the ten runs and 84 on the ground truth (spaces beside a
// digit, paper macros' arguments as prose), and the baseline recorded again for the units the rule cut anew —
// 2608.03063's (cells 55 → 53 on the left, a cell's head, its blocks, a paragraph aligned by sentence) and 2608.29181's
// address footnote (its e-mail now a placeholder: aligned 112 → 111).
//   pnpm exec tsx lab/pdf/spikes/highlight-gate.mjs [id …]   → out/highlight-gate.json
//   RUNS=<dir> another set of runs; GT=<dir> another ground truth; ROUNDS=<n> the cost's repeats (default 7)
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { floatsOfPaper, floatsVerdict } from './highlight-gate-floats.mjs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { anchorUnits, boundsFromMarks, markWords, sentenceStarts, tokenizeDocument } from '../../../src/pdf-reader/engine/pipeline/anchors.mjs'
import { floatHitOf, floatShapes } from '../../../src/pdf-reader/engine/view/floats.mjs'
import { blockOf, hitOf, layoutOf, pageGeometry, runsOf, sentenceOf, sentencesFit } from '../../../src/pdf-reader/engine/view/highlight.mjs'
import { displayEdges, plainTranslated, serialize, unitText } from '../../../src/pdf-reader/engine/translate/mt.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/source/tar.mjs'
import { runPaper, samePieces } from './highlight-runs.mjs'
import { sentencesThroughEngine } from './sentences-path.mjs'

const root = new URL('..', import.meta.url).pathname
const RUNS = process.env.RUNS ?? join(root, 'data/runs/highlight-ten')
const ROUNDS = Number(process.env.ROUNDS ?? 7)
const TEN = ['2608.02163', '2608.02785', '2608.02991', '2608.03063', '2608.06701', '2608.07683', '2608.08350', '2608.09746', '2608.12502', '2608.29181']
const ids = process.argv.slice(2).length ? process.argv.slice(2) : TEN
/** the units TeX sets away from where the source has them (session.mjs FLOATING) */
const FLOATING = new Set(['caption', 'footnote', 'cell', 'figure'])
const PAD = 3 / (96 / 72), STEP = 1.5, OVERHANG = 6 // highlight.mjs OVERHANG
/** the kinds lit whole, whatever sentences they have (highlight.mjs NOT_RUNNING) */
const WHOLE = new Set(['caption', 'heading', 'cell', 'figure'])
const GT = process.env.GT ?? join(root, 'data/runs/highlight-gt')
const GT_IDS = ['2608.02785', '2608.04322', '2608.02163', '2608.02459']
const BASELINE = new URL('highlight-gate.baseline.json', import.meta.url).pathname
// PDF.js's character maps and fonts, from the module imported above: without them a CJK PDF's text is half read
const PDFJS = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
const CMAPS = process.env.CMAPS ?? join(PDFJS, 'cmaps/'), FONTS = join(PDFJS, 'standard_fonts/')
for (const file of [join(CMAPS, 'UniGB-UCS2-H.bcmap'), join(FONTS, 'FoxitFixed.pfb')]) if (!existsSync(file)) { console.log(`FAIL: no ${file} — PDF.js would read the text without it`); process.exit(1) }

async function loadPdf(file, sentenceMarks) {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0, cMapUrl: CMAPS, cMapPacked: true, standardFontDataUrl: FONTS })
  const pdf = await task.promise
  const pages = [], views = []
  for (let p = 1; p <= pdf.numPages; p++) { const pg = await pdf.getPage(p), tc = await pg.getTextContent(); pages.push({ page: p, items: tc.items, styles: tc.styles }); views.push(pg.view) }
  const marks = new Map(), sentences = new Map()
  for (const [name, d] of await pdf.getDestinations()) {
    if (!d) continue
    if (/^axt-\d+[se]$/.test(name)) marks.set(name.slice(4), { page: (await pdf.getPageIndex(d[0])) + 1, x: d[2], y: d[3] })
    // the ground truth's sentence marks, axt-<unit>.<j>b where its sentence j begins (report-B's compiles)
    else if (sentenceMarks && /^axt-\d+\.\d+b$/.test(name)) sentences.set(name.slice(4, -1), { page: (await pdf.getPageIndex(d[0])) + 1, x: d[2], y: d[3] })
  }
  await task.destroy()
  return { pages, views, marks, sentences }
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
const tally = {}, cost = {}, cuts = [], inkHoles = [], overlaps = [], pastEdge = [], unreachable = []
/** per paper: the sentences' counts (B3); the holes and words outside listed */
const sentences = {}, sentenceHoles = [], wordsOutside = [], inkCuts = [], goesOnShort = [], floatTaken = []
/** per paper: the left's starts by its text alone against the marks' (B3c) */
const textOnly = {}
/** the sentence files against the reader's path from the Microsoft answers kept (sentences-path.mjs): per set of runs
 *  and paper, the units in the file, those the path gives, and those that differ (either has it and the other not, or
 *  not the same) */
const remade = {}
const answersOf = from => {
  const f = join(root, `out/highlight/B3/ms-cache-zh-${from}.json`)
  return existsSync(f) ? new Map(Object.entries(JSON.parse(readFileSync(f, 'utf8')))) : null
}
const ANSWERS = { auto: answersOf('auto'), en: answersOf('en') }
async function remake(set, runs, from, id, paper, sents) {
  const pf = join(runs, 'pieces', `${id}.json`), typeset = existsSync(pf) ? JSON.parse(readFileSync(pf, 'utf8')) : {}
  const finals = new Map(JSON.parse(readFileSync(join(runs, id, 'final-texts.json'), 'utf8')).map(t => [t.id, t.text]))
  // the very translation the run typeset (its pieces where they are kept, else its final text): as the file was made
  const keep = (i, pieces) => (typeset[i] ? samePieces(pieces, typeset[i]) : finals.get(i) === plainTranslated(pieces))
  const r = ((remade[set] ??= {})[id] = { file: Object.keys(sents).length, path: 0, differ: 0, first: [], unanswered: 0 })
  if (!ANSWERS[from]) { r.differ = r.file; r.first.push(`no Microsoft answers kept (ms-cache-zh-${from}.json)`); return }
  const sent = paper.units.flatMap((u, i) => (paper.kept.has(u) || !u.pieces.length ? [] : [{ u, i }]))
  // a unit whose wire, as the reader sends it now, has no answer kept: the wire changed since the answers were kept (the
  // typesetting rule's spaces beside a digit, 2026-10-02: 142 units of the twelve papers), and the path cannot be run
  // on it without asking the service again. Not judged, and counted (`unanswered`); the run's sentences stand for it
  const unanswered = new Set(sent.filter(({ u }) => !ANSWERS[from].has(serialize(u).wire)).map(({ i }) => String(i)))
  // and a unit the tree now cuts otherwise (highlight-runs.mjs), sent as no text at all
  for (const i of paper.cut) unanswered.add(String(i))
  r.unanswered = unanswered.size
  const got = await sentencesThroughEngine({ units: sent, cache: ANSWERS[from], keep })
  r.path = Object.keys(got).length
  for (const k of new Set([...Object.keys(got), ...Object.keys(sents)])) if (!unanswered.has(k) && JSON.stringify(got[k]) !== JSON.stringify(sents[k])) { r.differ++; if (r.first.length < 5) r.first.push(`#${k}`) }
}
/** per paper and side: what the geometry took beyond the anchors, held to the baseline exactly */
const taken = {}
/** per paper, side and kind: units anchored and lit, for the baseline */
const counts = {}
/** per paper and kind: the runs' units the tree now cuts otherwise (highlight-runs.mjs), judged absent: the baseline's
 *  counts of their kind allow for them */
const cutAway = {}
const count = (key, field, n = 1) => { const t = (tally[key] ??= { n: 0, anchoredL: 0, anchoredR: 0, litL: 0, litR: 0, both: 0, unlitAnchored: 0, points: 0, holes: 0, smaller: 0, inkPoints: 0, inkHoles: 0, pastEdge: 0, unreachable: 0, runs: 0, pageCols: 0, cut: 0, fragmentedDisplays: 0, overlapping: 0 }); t[field] += n }
const inside = (b, x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1

for (const id of ids) {
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(root, 'data/corpus', id, 'source.gz'))))
  // the units as the runs cut them (highlight-runs.mjs); those the tree now cuts otherwise, judged absent, counted apart
  const paper = runPaper(id, files), units = paper.units
  for (const i of paper.cut) { const k = kindOf(paper, units[i]); ((cutAway[id] ??= {})[k] = (cutAway[id][k] ?? 0) + 1) }
  const kind = new Map(units.map((u, i) => [i, u.kind])), floating = x => FLOATING.has(kind.get(x))
  const pf = join(RUNS, 'pieces', `${id}.json`), typeset = existsSync(pf) ? JSON.parse(readFileSync(pf, 'utf8')) : {}
  const src = units.map((u, i) => ({ id: i, ...unitText(u.pieces), ...displayEdges(u) }))
  const texts = JSON.parse(readFileSync(join(RUNS, id, 'final-texts.json'), 'utf8')).map(t => ({ ...(typeset[t.id] ? unitText(typeset[t.id]) : paper.kept.has(units[t.id]) ? unitText(units[t.id].pieces) : t), id: t.id, ...displayEdges(units[t.id]) }))
  const OM = await loadPdf(join(RUNS, id, 'original-marked.pdf'))
  const sf = join(RUNS, 'sentences', `${id}.json`), sents = existsSync(sf) ? JSON.parse(readFileSync(sf, 'utf8')) : {}
  await remake('ten', RUNS, 'auto', id, paper, sents)
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
    // each unit's sentences' starts on the side, as findSentences finds them with the layout
    const textOf = new Map(T.map(t => [t.id, t.text])), startsMs = []
    let starts
    for (let r = 0; r < ROUNDS; r++) {
      const t0 = performance.now()
      starts = new Map()
      for (const [i, s] of Object.entries(sents)) { const st = sentenceStarts(anchors.get(+i), textOf.get(+i) ?? '', S === 'L' ? s.src : s.tr); if (st) starts.set(+i, st) }
      startsMs.push(performance.now() - t0)
    }
    cost[`${id} ${S}`] = { pages: pdf.views.length, tokens: doc.length, layoutMs: +median(layoutMs).toFixed(2), allPagesMs: +median(pagesMs).toFixed(2), perPageMs: +(median(pagesMs) / pdf.views.length).toFixed(3), pageMaxMs: +median(pageMax).toFixed(2), startsMs: +median(startsMs).toFixed(2) }
    sides[S] = { anchors, doc, layout: layoutOf(doc, pdf.views, anchors, kinds), starts }
  }
  // the left's starts by its text alone (B3c: arXiv's PDF before our marked original's marks are carried to it) against
  // those found with the marks: units both found, the starts on the marks' token and line, units found by one alone
  {
    const { doc } = sides.L, plain = anchorUnits(doc, src, { bounds: new Map(), floating }), textOf = new Map(src.map(t => [t.id, t.text]))
    const r = (textOnly[id] = { units: 0, both: 0, onlyText: 0, onlyMarks: 0, starts: 0, sameToken: 0, sameLine: 0 })
    for (const [i, s] of Object.entries(sents)) {
      if (!s.src.length || WHOLE.has(kind.get(+i))) continue
      r.units++
      const X = sentenceStarts(plain.get(+i), textOf.get(+i) ?? '', s.src), M = sides.L.starts.get(+i)
      if (X && M) { r.both++; X.forEach((k, j) => { r.starts++; if (k === M[j]) r.sameToken++; if (doc[k].page === doc[M[j]].page && Math.abs(doc[k].y - doc[M[j]].y) < Math.min(doc[k].h, doc[M[j]].h) * 0.5) r.sameLine++ }) } else if (X) r.onlyText++
      else if (M) r.onlyMarks++
    }
  }
  // a unit is lit by sentence where both sides found every start and its shapes hold its words on both (sentencesFit),
  // and it is running text
  const both = new Map()
  let unfit = 0
  for (const [i, a] of sides.L.starts) {
    const b = sides.R.starts.get(i)
    if (!b || a.length !== b.length || WHOLE.has(kind.get(i))) continue
    if (sentencesFit(sides.L.layout, i, a) && sentencesFit(sides.R.layout, i, b)) both.set(i, a.length); else { unfit++; if (process.env.UNFIT) console.error(`unfit ${id}#${i} L ${sentencesFit(sides.L.layout, i, a)} R ${sentencesFit(sides.R.layout, i, b)}`) }
  }
  const running = Object.entries(sents).filter(([i]) => !WHOLE.has(kind.get(+i)))
  const sc = (sentences[id] = { units: running.length, multi: running.filter(([, s]) => s.src.length).length, foundL: running.filter(([i]) => sides.L.starts.has(+i)).length, foundR: running.filter(([i]) => sides.R.starts.has(+i)).length, unfit, aligned: both.size, alignedMulti: [...both.values()].filter(n => n > 0).length, sentences: [...both.values()].reduce((a, n) => a + n + 1, 0), points: 0, holes: 0, otherSentence: 0, smaller: 0, words: 0, wordsOutside: 0, heads: 0, headsOutside: 0, shapes: 0, sharedRows: 0, gaps: 0, overlaps: 0, throughInk: 0, goesOn: 0, goesOnShort: 0, goesOnBeside: 0, underFloat: 0, takenByFloat: 0 })
  units.forEach((u, i) => {
    const k = kindOf(paper, u)
    count(k, 'n')
    let lit = 0
    for (const S of ['L', 'R']) {
      const { anchors, doc, layout } = sides[S], runs = runsOf(layout, i)
      const c = (((counts[id] ??= {})[S] ??= {})[k] ??= { anchored: 0, lit: 0 })
      if (anchors.get(i)) { count(k, `anchored${S}`); c.anchored++ }
      if (runs.length) { count(k, `lit${S}`); c.lit++; lit++ } else if (anchors.get(i)) count(k, 'unlitAnchored')
      // ink holes: each of the unit's words at its ink's centre, in one of its blocks on its page
      const blocks = runs.map(run => blockOf(run, PAD)), { tok } = layout
      let holed = 0
      for (const t of anchors.get(i)?.tokens ?? []) {
        const page = doc[t].page, x = (tok.l[t] + tok.r[t]) / 2, y = (tok.top[t] + tok.bottom[t]) / 2
        count(k, 'inkPoints')
        if (blocks.some(b => b.page === page && inside(b, x, y))) continue
        if (Object.values(layout.page[page].cols).every(e => x < e.x0 - OVERHANG || x > e.x1 + OVERHANG)) { count(k, 'pastEdge'); pastEdge.push(`${id}#${i} ${S}`) }
        else { count(k, 'inkHoles'); holed++ }
      }
      if (holed) inkHoles.push(`${id}#${i} ${S} ×${holed}`)
      // one unit's blocks overlapping on a page
      if (blocks.some((a, j) => blocks.some((b, m) => m > j && a.page === b.page && Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.01 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.01))) { count(k, 'overlapping'); overlaps.push(`${id}#${i} ${S}`) }
      // holes: every point of every painted block; and each page the unit is painted on has a point that lights it
      const reached = new Set()
      for (const run of runs) {
        const b = blockOf(run, PAD)
        for (let x = b.x0 + STEP / 2; x < b.x1; x += STEP) for (let y = b.y0 + STEP / 2; y < b.y1; y += STEP) {
          const hit = hitOf(layout, run.page, x, y, PAD)
          count(k, 'points')
          if (!hit) count(k, 'holes')
          else if (hit.id !== i) count(k, 'smaller')
          else reached.add(run.page)
        }
      }
      for (const p of new Set(runs.map(r => r.page))) if (!reached.has(p)) { count(k, 'unreachable'); unreachable.push(`${id}#${i} ${S} p${p}`) }
      // a cell whose ink reaches more than 3 em past a word's box: the marks' carry over its row's other cells
      if (u.kind === 'cell' && (anchors.get(i)?.tokens ?? []).some(t => (tok.r[t] - doc[t].x - doc[t].w) / doc[t].h > 3)) (((taken[id] ??= {})[S] ??= {}).cells3em = (taken[id][S].cells3em ?? 0) + 1)
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
  // sentences: holes inside their shapes, words outside them, the rows two share, the pieces that go on over a break
  for (const S of ['L', 'R']) {
    const { anchors, doc, layout, starts } = sides[S], startsOf = i => (both.has(i) ? starts.get(i) : null), { tok } = layout
    // each token's unit, the first that has it (pageGeometry's owner)
    const ownerOf = new Map()
    for (const [u, a] of anchors) for (const t of a?.tokens ?? []) if (!ownerOf.has(t)) ownerOf.set(t, u)
    for (const [i, n] of both) {
      const st = starts.get(i), runs = runsOf(layout, i), shapes = []
      // a sentence's pieces in more than one of its unit's runs (over a column or a page break): the piece before the
      // break reaches the unit's text edge on the right, the piece after it on the left — the furthest its lines reach
      // in that column, inside its text edge —, but where another unit's word stands between it and the edge on its row
      const reach = {}
      for (const q of anchors.get(i).rects) {
        const cols = layout.page[q.page].cols, c = ['L', 'R', 'F'].find(c => cols[c] && q.x0 >= cols[c].x0 - OVERHANG && q.x1 <= cols[c].x1 + OVERHANG) ?? 'F', e = cols[c]
        const m = (reach[c] ??= { x0: Infinity, x1: -Infinity })
        m.x0 = Math.min(m.x0, Math.max(q.x0, e.x0)); m.x1 = Math.max(m.x1, Math.min(q.x1, e.x1))
      }
      const pieces = runs.map(run => Array.from({ length: n + 1 }, (_, s) => sentenceOf(layout, run, st, s, PAD)))
      runs.forEach((run, ri) => {
        const e = layout.page[run.page].cols[run.col] ?? layout.page[run.page].cols.F, m = reach[run.col] ?? e
        for (let s = 0; s <= n; s++) {
          const rs = pieces[ri][s]
          if (!rs.length) continue
          for (const [r, edge, dir] of [[rs.at(-1), Math.min(e.x1, m.x1), 1], [rs[0], Math.max(e.x0, m.x0), -1]]) {
            if (!(dir > 0 ? pieces.slice(ri + 1) : pieces.slice(0, ri)).some(x => x[s].length)) continue
            sc.goesOn++
            const end = dir > 0 ? r.x1 - PAD : r.x0 + PAD
            if (dir > 0 ? end > edge - 0.5 : end < edge + 0.5) continue
            const beside = run.toks.length && doc.some((w, t) => w.page === run.page && w.y > r.y0 && w.y < r.y1 && ownerOf.has(t) && ownerOf.get(t) !== i && (dir > 0 ? tok.r[t] > end && tok.l[t] < edge + PAD : tok.l[t] < end && tok.r[t] > edge - PAD))
            if (beside) { sc.goesOnBeside++; continue }
            sc.goesOnShort++
            if (goesOnShort.length < 30) goesOnShort.push(`${id}#${i}.${s} ${S} p${run.page} ${dir > 0 ? 'ends' : 'begins'} at ${(dir > 0 ? r.x1 : r.x0).toFixed(1)}, the edge ${edge.toFixed(1)}`)
          }
        }
      })
      for (let s = 0; s <= n; s++) for (const run of runs) {
        const rects = sentenceOf(layout, run, st, s, PAD)
        if (!rects.length) continue
        sc.shapes++
        // the head before the unit's first word (a theorem's, a list's label) in its first sentence
        if (s === 0 && run.head !== null) { sc.heads++; if (rects[0].x0 > run.head) sc.headsOutside++ }
        shapes.push(...rects)
        for (const r of rects) for (let x = r.x0 + STEP / 2; x < r.x1; x += STEP) for (let y = r.y0 + STEP / 2; y < r.y1; y += STEP) {
          const hit = hitOf(layout, run.page, x, y, PAD, startsOf)
          sc.points++
          if (!hit) { sc.holes++; if (sentenceHoles.length < 30) sentenceHoles.push(`${id}#${i}.${s} ${S} p${run.page} ${x.toFixed(1)},${y.toFixed(1)}`) }
          else if (hit.id === i && hit.s !== s) sc.otherSentence++
          else if (hit.id !== i) sc.smaller++
        }
        // the row it shares with the next sentence: its end the next one's start, and whether that passes through a word
        const next = s < n ? sentenceOf(layout, run, st, s + 1, PAD) : []
        const a = rects.at(-1), b = next[0]
        if (b && Math.abs(a.y0 - b.y0) < 0.01 && Math.abs(a.y1 - b.y1) < 0.01) {
          sc.sharedRows++
          if (b.x0 - a.x1 > 0.01) sc.gaps++
          if (a.x1 - b.x0 > 0.01) sc.overlaps++
          for (let k = 0; k < run.toks.length; k++) { const t = run.toks[k], y = doc[t].y; if (y > b.y0 && y < b.y1 && tok.l[t] < a.x1 - 0.1 && tok.r[t] > a.x1 + 0.1) { sc.throughInk++; inkCuts.push(`${id}#${i}.${s}|${s + 1} ${S} p${run.page} through ${doc[t].t || '(rest of a word)'} ${tok.l[t].toFixed(1)}–${tok.r[t].toFixed(1)} at ${a.x1.toFixed(1)}`); break } }
        }
      }
      // every word of the unit in one of its sentences' shapes, but past the column's edge (the clamp's)
      for (const t of anchors.get(i).tokens) {
        const page = doc[t].page, x = (tok.l[t] + tok.r[t]) / 2, y = (tok.top[t] + tok.bottom[t]) / 2
        sc.words++
        if (shapes.some(r => r.page === page && inside(r, x, y))) continue
        if (Object.values(layout.page[page].cols).every(e => x < e.x0 - OVERHANG || x > e.x1 + OVERHANG)) continue
        sc.wordsOutside++
        if (wordsOutside.length < 30) wordsOutside.push(`${id}#${i} ${S} p${page}`)
      }
    }
  }
  // what the geometry took beyond the anchors, page by page: heads by kind, words filled in; the pads' overlaps
  for (const S of ['L', 'R']) {
    const { layout } = sides[S], t = ((taken[id] ??= {})[S] ??= {})
    t.cells3em ??= 0; t.heads = {}; t.filled = 0; t.padOverlaps = 0
    // every block's extent, to a hundredth of a unit, as one digest: what moves a block moves it (the review of B3: the
    // ink's widths moved 36 runs' blocks by up to 4.3 units, which the counts did not see)
    const digest = createHash('sha256')
    let nBlocks = 0
    for (let p = 1; p < layout.page.length; p++) {
      const g = pageGeometry(layout, p), blocks = g.runs.map(r => blockOf(r, PAD))
      g.runs.forEach((r, a) => { const b = blocks[a]; nBlocks++; digest.update(`${p} ${r.id} ${b.x0.toFixed(2)} ${b.x1.toFixed(2)} ${b.y0.toFixed(2)} ${b.y1.toFixed(2)}\n`) })
      for (const h of g.heads) { const kk = kindOf(paper, units[h]); t.heads[kk] = (t.heads[kk] ?? 0) + 1 }
      t.filled += g.filled
      g.runs.forEach((r, a) => {
        let worst = 0
        g.runs.forEach((q, b) => {
          if (q.id === r.id) return
          const A = blocks[a], B = blocks[b]
          if (A.x1 <= B.x0 || B.x1 <= A.x0) return
          const o = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0)
          if (o > 0 && o < Math.min(A.y1 - A.y0, B.y1 - B.y0) / 2) worst = Math.max(worst, o)
        })
        if (worst > 0.5) t.padOverlaps++
      })
    }
    t.blocks = { n: nBlocks, digest: digest.digest('hex').slice(0, 16) }
  }
  // the floats (B4: tables, algorithms and figures lit whole), on the sides as anchored (highlight-gate-floats.mjs)
  await floatsOfPaper({ id, paper, units, kind, sides, files: { L: join(root, 'data/corpus', id, 'arxiv.pdf'), R: join(RUNS, id, 'final.pdf') }, rounds: ROUNDS, pad: PAD, step: STEP, cmaps: CMAPS, fonts: FONTS })
  // the sentences against the floats, now made (B3's follow-up): a sentence's shape over a float's painted one, and the
  // points of it where the pointer finds the float — painted as the sentence, lit as the float
  const area = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
  for (const S of ['L', 'R']) {
    const { layout, starts } = sides[S], startsOf = i => (both.has(i) ? starts.get(i) : null)
    for (const [i, n] of both) for (const run of runsOf(layout, i)) {
      const shapes = (layout.floats?.get(run.page) ?? []).flatMap(f => floatShapes(layout, f, PAD))
      if (!shapes.length) continue
      for (let s = 0; s <= n; s++) for (const r of sentenceOf(layout, run, starts.get(i), s, PAD)) {
        if (!shapes.some(f => area(r, f) > 0.25)) continue
        sc.underFloat++
        let taken = 0
        for (let x = r.x0 + STEP / 2; x < r.x1; x += STEP) for (let y = r.y0 + STEP / 2; y < r.y1; y += STEP) { const h = floatHitOf(layout, run.page, x, y, PAD, hitOf(layout, run.page, x, y, PAD, startsOf)); if (h?.float && h.id !== i) taken++ }
        if (taken) { sc.takenByFloat += taken; if (floatTaken.length < 20) floatTaken.push(`${id}#${i}.${s} ${S} p${run.page} ×${taken}`) }
      }
    }
  }
  console.error(id, 'done')
}

// ---------------------------------------------------------------- the ground truth (report-B §2(c, d))
/** investigator B's tokenizer, which its starts were counted in (before A1: a Latin run took the CJK characters after it
 *  in; the compatibility range ran on from U+8C48) */
const oldTokens = s => [...s.normalize('NFKC').toLowerCase().matchAll(/[\u3400-\u9fff\u8c48-\ufaff\u3040-\u30ff\uac00-\ud7af]|[\p{L}\p{N}]+/gu)].length
/** the token a start mark stands before (anchors.mjs tokenAtMark's rule for a start mark) */
const pagesOf = new WeakMap()
function tokenAt(doc, mk) {
  let byPage = pagesOf.get(doc)
  if (!byPage) { byPage = new Map(); doc.forEach((t, k) => (byPage.get(t.page) ?? byPage.set(t.page, []).get(t.page)).push(k)); pagesOf.set(doc, byPage) }
  let best = null
  for (const k of byPage.get(mk.page) ?? []) {
    const t = doc[k]
    if (Math.abs(t.y - mk.y) > t.h * 0.4) continue
    const d = mk.x < t.x ? t.x - mk.x : mk.x > t.x + t.w ? mk.x - t.x - t.w : 0
    if (d < 8 && (!best || d < best.d)) best = { k, d }
  }
  return best?.k ?? null
}
const lineOf = (a, b) => a.page === b.page && Math.abs(a.y - b.y) < Math.min(a.h, b.h) * 0.5
/** per paper and side (O: our original, T: our translation, AX: arXiv's PDF): starts found, with a mark for their
 *  sentence, on the mark's line */
const truth = {}
async function groundTruth() {
  for (const id of GT_IDS) {
    const dir = join(GT, id)
    if (!existsSync(join(dir, 'O2.pdf'))) { truth[id] = null; continue }
    const { files } = await unpackSource(new Uint8Array(readFileSync(join(root, 'data/corpus', id, 'source.gz'))))
    const paper = runPaper(id, files), units = paper.units
    const kind = new Map(units.map((u, i) => [i, u.kind])), floating = x => FLOATING.has(kind.get(x))
    const src = units.map((u, i) => ({ id: i, ...unitText(u.pieces), ...displayEdges(u) }))
    const tgt = JSON.parse(readFileSync(join(dir, 'final-texts.json'), 'utf8')).map(t => ({ ...t, ...displayEdges(units[t.id]) }))
    const sents = JSON.parse(readFileSync(join(GT, 'sentences', `${id}.json`), 'utf8'))
    await remake('ground truth', GT, 'en', id, paper, sents)
    const b = new Map(JSON.parse(readFileSync(join(dir, 'b-units.json'), 'utf8')).map(u => [u.i, u]))
    const [O1, O2, T1, T2, AX] = await Promise.all([loadPdf(join(dir, 'O1.pdf')), loadPdf(join(dir, 'O2.pdf'), true), loadPdf(join(dir, 'T1.pdf')), loadPdf(join(dir, 'T2.pdf'), true), loadPdf(join(root, 'data/corpus', id, 'arxiv.pdf'))])
    const docs = Object.fromEntries(Object.entries({ O1, O2, T1, T2, AX }).map(([k, v]) => [k, tokenizeDocument(v.pages)]))
    // arXiv's PDF by our original's marks carried, as the reader anchors it; its truth, the sentence marks carried alike
    const carried = markWords(docs.O1, O1.marks)
    const carriedTruth = markWords(docs.O2, new Map([...O2.sentences].map(([k, v]) => [`${k}s`, v])))
    const out = (truth[id] = {}), foundOn = {}
    for (const [S, doc, marks, texts, on, truthDoc, truthMarks] of [['O', docs.O1, O1.marks, src, 'src', docs.O2, O2.sentences], ['T', docs.T1, T1.marks, tgt, 'tr', docs.T2, T2.sentences], ['AX', docs.AX, carried, src, 'src', docs.AX, null], ['AXtext', docs.AX, new Map(), src, 'src', docs.AX, null]]) {
      const anchors = anchorUnits(doc, texts, { bounds: boundsFromMarks(doc, marks), floating })
      const textOf = new Map(texts.map(t => [t.id, t.text])), r = (out[S] = { starts: 0, found: 0, withTruth: 0, sameLine: 0 })
      // on our compiles the marked and unmarked documents have the same words where the marks moved none (originals:
      // all; translations: most), and a start is compared by its word's place in the marked one
      const same = truthDoc !== doc && truthDoc.length === doc.length
      for (const [i, s] of Object.entries(sents)) {
        const offs = s[on], bu = b.get(+i), bs = bu?.[S === 'T' ? 'tgtStarts' : 'srcStarts']
        if (!offs.length || !bs?.length || WHOLE.has(kind.get(+i))) continue
        r.starts += offs.length
        const st = sentenceStarts(anchors.get(+i), textOf.get(+i) ?? '', offs)
        if (!st) continue
        ;(foundOn[S] ??= new Set()).add(+i)
        offs.forEach((o, j) => {
          r.found++
          // the mark of the same sentence: B's start counted in B's tokens where this one's first word is
          const jb = bs.indexOf(oldTokens(textOf.get(+i).slice(0, o)))
          if (jb < 0) return
          const name = `${i}.${jb + 1}`
          let m = null
          if (truthMarks) { const mk = truthMarks.get(name); if (mk) m = tokenAt(truthDoc, mk) } else {
            const mk = carriedTruth.get(`${name}s`)
            if (mk) { const k = tokenAt(doc, mk); if (k != null && mk.t != null && doc[k].t === mk.t) m = k }
          }
          if (m == null) return
          r.withTruth++
          const x = same ? truthDoc[st[j]] : doc[st[j]]
          if (lineOf(x, truthDoc[m])) r.sameLine++
        })
      }
    }
    // the reader's pair, arXiv's PDF and our translation: units of more than one sentence found on both
    const multi = Object.entries(sents).filter(([i, s]) => s.src.length && b.get(+i)?.srcStarts?.length && !WHOLE.has(kind.get(+i))).map(([i]) => +i)
    out.pair = { multi: multi.length, both: multi.filter(i => foundOn.AX?.has(i) && foundOn.T?.has(i)).length }
    console.error(id, 'ground truth done')
  }
}
if (existsSync(GT)) await groundTruth()

const cols = ['n', 'anchoredL', 'litL', 'anchoredR', 'litR', 'both', 'unlitAnchored', 'holes', 'smaller', 'points', 'unreachable', 'inkHoles', 'pastEdge', 'inkPoints', 'runs', 'pageCols', 'cut', 'fragmentedDisplays', 'overlapping']
console.log(['kind'.padEnd(26), ...cols].join('\t'))
const sum = Object.fromEntries(cols.map(c => [c, 0]))
for (const [k, t] of Object.entries(tally).sort()) { console.log([k.padEnd(26), ...cols.map(c => t[c])].join('\t')); for (const c of cols) sum[c] += t[c] }
console.log(['all'.padEnd(26), ...cols.map(c => sum[c])].join('\t'))
console.log('\nruns cut by a line (page, column, blocks):', cuts.length, cuts.slice(0, 12).join('; '))
console.log('units with ink holes:', inkHoles.length, inkHoles.slice(0, 12).join('; '))
console.log('units whose blocks overlap on a page:', overlaps.length, overlaps.slice(0, 12).join('; '))
console.log('words past the column\'s edge + the overhang:', pastEdge.length, pastEdge.slice(0, 12).join('; '))
console.log('units painted where nothing lights them:', unreachable.length, unreachable.slice(0, 12).join('; '))
const takenSum = side => { const o = { heads: {}, filled: 0, cells3em: 0, padOverlaps: 0 }; for (const t of Object.values(taken)) { const x = t[side]; if (!x) continue; for (const [kk, n] of Object.entries(x.heads)) o.heads[kk] = (o.heads[kk] ?? 0) + n; o.filled += x.filled; o.cells3em += x.cells3em; o.padOverlaps += x.padOverlaps } return o }
console.log('what the geometry took beyond the anchors, left:', JSON.stringify(takenSum('L')), 'right:', JSON.stringify(takenSum('R')))
console.log('\ncost, ms (median of', ROUNDS, 'rounds): layout at anchoring; every page\'s geometry; per page; the slowest page; every unit\'s sentences\' starts')
for (const [k, c] of Object.entries(cost)) console.log(k.padEnd(14), `${c.pages} pp, ${c.tokens} tokens`, `layout ${c.layoutMs}`, `pages ${c.allPagesMs}`, `per page ${c.perPageMs}`, `max ${c.pageMaxMs}`, `starts ${c.startsMs}`)
const SC = ['units', 'multi', 'foundL', 'foundR', 'unfit', 'aligned', 'alignedMulti', 'sentences', 'points', 'holes', 'otherSentence', 'smaller', 'words', 'wordsOutside', 'heads', 'headsOutside', 'shapes', 'sharedRows', 'gaps', 'overlaps', 'throughInk', 'goesOn', 'goesOnShort', 'goesOnBeside', 'underFloat', 'takenByFloat']
console.log('\nsentences (running text with the engine\'s sentences): units, more than one; starts found on the left, the right; found on both but shapes that do not hold their words (lit whole); aligned (both), of more than one; sentences; grid points inside their shapes, holes, another sentence of the unit, a smaller unit; words, outside their sentences; heads before a unit\'s first word, outside its first sentence; shapes; rows two sentences share, gaps, overlaps, boundaries through a word\'s estimated ink (the geometry against itself); pieces of a sentence that goes on over a column or a page break, short of the unit\'s text edge there, beside another unit\'s word; sentence rows over a float\'s shape, points of them the pointer finds the float at')
console.log(['paper'.padEnd(12), ...SC].join('\t'))
const ssum = Object.fromEntries(SC.map(c => [c, 0]))
for (const [id, s] of Object.entries(sentences)) { console.log([id.padEnd(12), ...SC.map(c => s[c])].join('\t')); for (const c of SC) ssum[c] += s[c] }
console.log(['all'.padEnd(12), ...SC.map(c => ssum[c])].join('\t'))
if (sentenceHoles.length) console.log('holes inside sentences:', sentenceHoles.slice(0, 12).join('; '))
if (wordsOutside.length) console.log('words outside their sentences:', wordsOutside.slice(0, 12).join('; '))
if (inkCuts.length) console.log('boundaries through a word\'s estimated ink (inkEdges, the geometry against itself; the page\'s is the browser gate\'s):', inkCuts.join('; '))
if (goesOnShort.length) console.log('pieces short of the edge over a break:', goesOnShort.join('; '))
if (floatTaken.length) console.log('sentences lit as a float where painted:', floatTaken.join('; '))
console.log('\nthe left\'s starts by its text alone (B3c), against those with the marks: units of more than one sentence; both found; by the text alone; by the marks alone; starts both found, on the marks\' token, on their line')
for (const [id, r] of Object.entries(textOnly)) console.log(id.padEnd(12), r.units, r.both, r.onlyText, r.onlyMarks, r.starts, r.sameToken, r.sameLine)
console.log('\nthe ground truth (report-B\'s compiles): starts after the first of units of more than one sentence; found; with a mark for their sentence; on its line (AXtext: arXiv\'s PDF by its text alone)')
for (const [id, t] of Object.entries(truth)) if (t) for (const [S, r] of Object.entries(t)) if (S !== 'pair') console.log(id.padEnd(12), S.padEnd(3), r.starts, r.found, r.withTruth, r.sameLine, `${((100 * r.sameLine) / Math.max(1, r.withTruth)).toFixed(1)} %`)
console.log('\nthe sentence files against the reader\'s path from the Microsoft answers kept (units in the file; the path\'s; differing):')
for (const [set, ps] of Object.entries(remade)) console.log(set.padEnd(13), Object.entries(ps).map(([id, r]) => `${id} ${r.file}/${r.path}/${r.differ}${r.unanswered ? `, ${r.unanswered} not judged (no answer kept for their wire)` : ''}${r.first.length ? ` (${r.first.join(', ')})` : ''}`).join('; '))
if (Object.keys(cutAway).length) console.log('the runs\' units the tree now cuts otherwise, judged absent (highlight-runs.mjs):', Object.entries(cutAway).map(([id, ks]) => `${id} ${Object.entries(ks).map(([k, n]) => `${n} ${k}`).join(', ')}`).join('; '))
console.log('units of more than one sentence (with a mark), their starts all found on arXiv\'s PDF and on our translation:', Object.entries(truth).filter(([, t]) => t).map(([id, t]) => `${id} ${t.pair.both}/${t.pair.multi}`).join(', '))
// the gate: what must be none, and against the baseline what may not fall (or, for cuts, grow)
const failures = []
for (const c of ['unlitAnchored', 'holes', 'inkHoles', 'unreachable', 'fragmentedDisplays', 'overlapping']) if (sum[c] > 0) failures.push(`${c} ${sum[c]}`)
for (const c of ['holes', 'otherSentence', 'wordsOutside', 'headsOutside', 'gaps', 'overlaps', 'goesOnShort', 'takenByFloat']) if (ssum[c] > 0) failures.push(`sentences: ${c} ${ssum[c]}`)
if (!Object.keys(truth).length) failures.push(`no ground truth at ${GT}`)
for (const [id, r] of Object.entries(textOnly)) if (r.sameLine < r.starts) failures.push(`${id}: ${r.starts - r.sameLine} of the left's starts by its text alone off the marks' line`)
for (const [set, ps] of Object.entries(remade)) for (const [id, r] of Object.entries(ps)) if (r.differ) failures.push(`${set} ${id}: ${r.differ} units' sentences not what the reader's path makes from the answers kept${r.first.length ? ` (${r.first.join(', ')})` : ''}`)
if (process.env.WRITE_BASELINE) {
  if (ids.length !== TEN.length || RUNS !== join(root, 'data/runs/highlight-ten')) failures.push('a baseline is recorded on the ten papers\' runs only')
  const sentencesBase = Object.fromEntries(Object.entries(sentences).map(([id, s]) => [id, { aligned: s.aligned, alignedMulti: s.alignedMulti, throughInk: s.throughInk }]))
  const truthBase = Object.fromEntries(Object.entries(truth).map(([id, t]) => [id, t && Object.fromEntries(Object.entries(t).filter(([S]) => S !== 'pair').map(([S, r]) => [S, { withTruth: r.withTruth, sameLine: r.sameLine }]))]))
  if (!failures.length) writeFileSync(BASELINE, `${JSON.stringify({ note: 'highlight-gate.mjs: per paper, side and kind, units anchored and lit; the runs cut by a line; the words past the column edge; per paper and side, what the geometry took beyond the anchors; per paper, the units aligned by sentence and the boundaries through a word\'s estimated ink; on the ground truth, per paper and side, the starts with a mark and those on its line. Counts only', counts, cuts, pastEdge: sum.pastEdge, taken, sentences: sentencesBase, truth: truthBase }, null, 1)}\n`)
  console.log(failures.length ? '\nno baseline written: the run fails' : `\nbaseline written: ${BASELINE}`)
} else if (!existsSync(BASELINE)) failures.push('no baseline (WRITE_BASELINE=1 records one)')
else {
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'))
  for (const id of ids) for (const S of ['L', 'R']) for (const [k, b] of Object.entries(base.counts[id]?.[S] ?? {})) {
    const c = counts[id]?.[S]?.[k] ?? { anchored: 0, lit: 0 }
    for (const f of ['anchored', 'lit']) if (c[f] + (cutAway[id]?.[k] ?? 0) < b[f]) failures.push(`${id} ${S} ${k}: ${f} ${c[f]}, the baseline ${b[f]}`)
  }
  const known = new Set(base.cuts)
  for (const c of cuts) if (!known.has(c)) failures.push(`a cut not in the baseline: ${c}`)
  if (sum.pastEdge > base.pastEdge) failures.push(`words past the column's edge ${sum.pastEdge}, the baseline ${base.pastEdge}`)
  // what the geometry takes beyond the anchors moves only when meant (and is recorded again then)
  for (const id of ids) for (const S of ['L', 'R']) {
    const now = taken[id]?.[S], was = base.taken?.[id]?.[S]
    if (!was) { failures.push(`${id} ${S}: no baseline of what the geometry takes`); continue }
    for (const f of ['filled', 'cells3em', 'padOverlaps']) if (now[f] !== was[f]) failures.push(`${id} ${S} ${f} ${now[f]}, the baseline ${was[f]}`)
    if (now.blocks.digest !== was.blocks?.digest) failures.push(`${id} ${S}: the blocks' extents moved (${now.blocks.n} blocks, the baseline ${was.blocks?.n ?? 'none'})`)
    for (const kk of new Set([...Object.keys(now.heads), ...Object.keys(was.heads)])) if ((now.heads[kk] ?? 0) !== (was.heads[kk] ?? 0)) failures.push(`${id} ${S} heads of ${kk} ${now.heads[kk] ?? 0}, the baseline ${was.heads[kk] ?? 0}`)
  }
  // sentences: no fewer units aligned, no more boundaries through a word; on the ground truth no fewer starts on its line
  for (const id of ids) {
    const now = sentences[id], was = base.sentences?.[id]
    if (!was) { failures.push(`${id}: no baseline of its sentences`); continue }
    for (const f of ['aligned', 'alignedMulti']) if (now[f] < was[f]) failures.push(`${id} sentences ${f} ${now[f]}, the baseline ${was[f]}`)
    if (now.throughInk > was.throughInk) failures.push(`${id} sentences' boundaries through a word ${now.throughInk}, the baseline ${was.throughInk}`)
  }
  for (const [id, t] of Object.entries(base.truth ?? {})) for (const [S, b] of Object.entries(t ?? {})) {
    const r = truth[id]?.[S]
    if (!r || r.sameLine < b.sameLine) failures.push(`${id} ${S} starts on the ground truth's line ${r?.sameLine ?? 'none'}, the baseline ${b.sameLine}`)
  }
}
mkdirSync(join(root, 'out'), { recursive: true })
writeFileSync(join(root, 'out/highlight-gate.json'), JSON.stringify({ ids, tally, cost, cuts, inkHoles, overlaps, unreachable, counts, taken, sentences, truth, textOnly }, null, 1))
console.log(failures.length ? `\nFAIL: ${failures.slice(0, 20).join('; ')}${failures.length > 20 ? ` (and ${failures.length - 20} more)` : ''}` : '\nok: every anchored unit lit and reachable, no hole, no ink hole, no fragmented display, no unit\'s blocks overlapping, the baseline met')
process.exitCode = failures.length ? 1 : 0
// the floats' report and verdict, held to their own baseline (highlight-gate-floats.mjs)
if (floatsVerdict({ ids, write: !!process.env.WRITE_BASELINE, ten: ids.length === TEN.length && RUNS === join(root, 'data/runs/highlight-ten') })) process.exitCode = 1

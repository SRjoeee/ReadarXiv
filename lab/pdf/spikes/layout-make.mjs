// lab/pdf/spikes/layout-make.mjs
// The layout maker on one paper (or several), end to end as the prepare will run it (Plan 8b, Tasks 6 and 6b): the
// paper's own switch (TeX's answers to the mark probe, set in the font probe's compile: live.mjs probeFiles `marks`),
// its layout compile — its marked original with the layout marks of every class on and that switch (live.mjs
// originalFiles with `layout`), compiled natively as the container compiles (latexmk in Docker's texlive/texlive:latest,
// --network none, 2 CPUs, 3 GB, 600 s, the date pinned), cached by its files' hash —, its marks file (marks.mjs
// layoutMarksOf, each piece's own ink from the compile's operator lists), and the layout file made from it and arXiv's PDF
// (layout/make.mjs makeLayout); then the stats, beside the bars the layout research set for the four papers it measured
// (records/layout-maker.md), the named cases of the reviews, and each citation's and reference's page text against arXiv's
// characters inside its segments. Exits 1 where a bar is not met, or nothing was made.
//   pnpm exec tsx lab/pdf/spikes/layout-make.mjs [<id>v<n> …]   (the four researched papers by default)
// Data (outside git): <AXT_DATA, else lab/pdf/data>/layout/<id>v<n>/source.gz and arxiv.pdf, fetched
// once from arXiv where absent, with the project's User-Agent and nothing else; the compile in build/, the marks file in
// marks.json, the layout file in layout.json beside them. Stops below 10 GiB free on the data's disk.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { gzipSync } from 'node:zlib'
import { getDocument, OPS, version } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { keptFor, openPaper, originalFiles, probeFiles } from '../../../src/pdf-reader/engine/live.mjs'
import { classOf, LAYOUT_CLASSES, encodeLayoutMarks, inkSamples, layoutMarksOf, parseLayoutMarks, probeSamples, readInkProbe, readInkTexts, readMarkProbe } from '../../../src/pdf-reader/engine/layout/marks.mjs'
import { encodeLayout, PH_FLAG } from '../../../src/pdf-reader/engine/layout/file.mjs'
import { pageInk } from '../../../src/pdf-reader/engine/layout/ink.mjs'
import { makeLayout } from '../../../src/pdf-reader/engine/layout/make.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'

const run = promisify(execFile)
const root = new URL('..', import.meta.url).pathname
const DATA = process.env.AXT_DATA ?? join(root, 'data')
const UA = 'ReadarXiv/0.1 (+https://readarxiv.org; research)'
const FREE_MIN = 10 * 2 ** 30
const NM = new URL('../../../node_modules/pdfjs-dist/', import.meta.url).pathname
const open = bytes => getDocument({ data: bytes, verbosity: 0, cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/`, useSystemFonts: false })
/** the layout research's bars (2026-10-06), by paper: cells and footnotes located, heading labels found */
const BARS = {
  '1512.03385v1': { cells: 0.95, headings: 13 },
  '1706.03762v7': { footnotes: 0.8, headings: 22 },
  '2307.16209v1': { footnotes: 0.8, headings: 45 },
  '2608.04322v1': { cells: 0.95, headings: 20 },
}
/** first baselines within a hundredth of TeX's start marks: the marks file holds hundredths (the controller's ruling of
 *  2026-10-06 on the brief's 0.003 pt, which a file of hundredths cannot show) */
const LINES_MIN = 0.975, PH_MIN = 0.98, BASELINE = 0.01, BASELINES_MIN = 0.98
/** the reviews' named cases (task-6-rereview-1 and -2, the stream spike), each to be found: its own ink whole */
const NAMED = {
  '1706.03762v7': ['34.9', '33.3', '31.8'],
  '2307.16209v1': ['151.39', '162.13', '240.46', '245.21', '248.17', '319.7', '429.18', '210.43', '210.33', '379.33'],
  '2608.04322v1': ['39.3'],
}
/** every compile's date, pinned as the corpus check pins it */
const EPOCH = 1791244800
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)} %` : '-')
const free = dir => { const s = statfsSync(dir); return s.bavail * s.bsize }

/** a paper's source and arXiv's PDF, from arXiv where they are not on this machine yet */
async function fetched(id, dir) {
  mkdirSync(dir, { recursive: true })
  for (const [file, url] of [['source.gz', `https://arxiv.org/e-print/${id}`], ['arxiv.pdf', `https://arxiv.org/pdf/${id}`]]) {
    const path = join(dir, file)
    if (existsSync(path)) continue
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
    writeFileSync(path, new Uint8Array(await res.arrayBuffer()))
  }
}

let failed = 0
const check = (paper, name, ok, detail) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${paper} ${name}: ${detail}`) }

for (const id of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BARS)) {
  const m = /^(.+)v(\d+)$/.exec(id)
  if (!m) throw new Error(`${id}: not an id with its version`)
  const dir = join(DATA, 'layout', id)
  mkdirSync(dir, { recursive: true })
  if (free(dir) < FREE_MIN) throw new Error(`less than 10 GiB free on ${dir}`)
  let marksMs = null
  await fetched(id, dir)
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(dir, 'source.gz'))))
  const paper = openPaper(files)
  const main = paper.project.main, stem = main.split('/').pop().replace(/\.[^.]+$/, '')
  // the paper's own switch, as the run sets it: the mark probe in the font probe's compile, one pass, cached by its files
  const docker = (dir, cmd) => run('docker', ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', '-e', 'FORCE_SOURCE_DATE=1', '-e', `SOURCE_DATE_EPOCH=${EPOCH}`, '-v', `${dir}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '600', ...cmd], { maxBuffer: 1 << 26 }).catch(() => null)
  const keyOf = over => {
    const hash = createHash('sha256').update(String(EPOCH))
    const all = new Map(files)
    for (const [p, b] of over) all.set(p, b)
    for (const [p, b] of [...all].sort((a, b) => (a[0] < b[0] ? -1 : 1))) hash.update(p).update(b)
    return hash.digest('hex').slice(0, 16)
  }
  const samples = probeSamples(paper.units), probe = probeFiles(paper, { marks: true }), probeLog = join(dir, `probe-${keyOf(probe)}.log`)
  if (!existsSync(probeLog)) {
    const pdir = join(dir, 'probe')
    rmSync(pdir, { recursive: true, force: true })
    for (const [p, b] of [...files, ...probe]) { const f = join(pdir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
    await docker(pdir, [{ xelatex: 'xelatex', lualatex: 'lualatex' }[paper.meta.compiler] ?? 'pdflatex', '-interaction=nonstopmode', main])
    writeFileSync(probeLog, existsSync(join(pdir, `${stem}.log`)) ? readFileSync(join(pdir, `${stem}.log`), 'latin1') : '', 'latin1')
    rmSync(pdir, { recursive: true, force: true })
  }
  const switches = readMarkProbe(readFileSync(probeLog, 'latin1'), samples), inkless = readInkProbe(readFileSync(probeLog, 'latin1'), inkSamples(paper.units))
  const shown = readInkTexts(readFileSync(probeLog, 'latin1'), inkSamples(paper.units))
  // the layout compile, cached by what it compiles
  const build = join(dir, 'build'), marksFile = join(dir, 'marks.json'), stamp = join(dir, 'marks.key')
  const cached = key => {
    if (!existsSync(marksFile) || !existsSync(stamp) || readFileSync(stamp, 'utf8') !== key) return false
    try { parseLayoutMarks(new Uint8Array(readFileSync(marksFile))); return true } catch { return false }
  }
  let compileMs = null
  const marked = originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES, switches, inkless })
  const key = keyOf(marked)
  if (!cached(key)) {
    rmSync(build, { recursive: true, force: true })
    for (const [p, b] of [...files, ...marked]) { const f = join(build, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
    const t0 = Date.now()
    await docker(build, ['latexmk', { xelatex: '-xelatex', lualatex: '-lualatex' }[paper.meta.compiler] ?? '-pdf', ...(paper.meta.bbl ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-f', main])
    compileMs = Date.now() - t0
    const pdf = join(build, `${stem}.pdf`)
    if (existsSync(pdf)) {
      const log = readFileSync(join(build, `${stem}.log`), 'latin1')
      const task = open(new Uint8Array(readFileSync(pdf)))
      const t1 = performance.now()
      const made = await layoutMarksOf(await task.promise, log, { engine: paper.meta.compiler, classes: LAYOUT_CLASSES, switches, inkless, texts: shown, units: paper.units, OPS })
      marksMs = performance.now() - t1
      await task.destroy()
      writeFileSync(marksFile, encodeLayoutMarks(made))
      writeFileSync(stamp, key)
    }
    rmSync(build, { recursive: true, force: true })
  }
  if (!existsSync(marksFile)) { check(id, 'compile', false, 'no PDF'); continue }
  const marks = parseLayoutMarks(new Uint8Array(readFileSync(marksFile)))
  const task = open(new Uint8Array(readFileSync(join(dir, 'arxiv.pdf'))))
  const arxiv = await task.promise
  const t0 = performance.now()
  const out = await makeLayout({ units: paper.units, marks, arxiv, OPS, paper: { id: m[1], version: Number(m[2]) }, left: '', pdfjs: version })
  const wall = performance.now() - t0
  await task.destroy()
  const { stats } = out
  if (!('file' in out)) { check(id, 'made', false, `refused: ${out.refused} ${JSON.stringify(stats.refusal ?? stats.lines)}`); continue }
  const text = encodeLayout(out.file)
  writeFileSync(join(dir, 'layout.json'), text)
  const S = stats
  // the bars
  const L = S.lines
  check(id, 'lines carried', L.carried >= LINES_MIN * L.total, `${L.carried}/${L.total} ${pct(L.carried, L.total)}`)
  const four = ['math', 'cite', 'ref', 'code'].map(k => S.ph.byKind[k] ?? [0, 0]), found = four.reduce((a, [f]) => a + f, 0), marked4 = four.reduce((a, [, n]) => a + n, 0)
  check(id, 'placeholders found (math, cite, ref, code)', found >= PH_MIN * marked4, `${found}/${marked4} ${pct(found, marked4)}`)
  const bar = BARS[id] ?? {}
  const kind = k => S.units.byKind[k] ?? [0, 0]
  if (bar.cells) { const [a, b] = kind('cell'); check(id, 'cells located', a >= bar.cells * b, `${a}/${b} ${pct(a, b)}`) }
  if (bar.footnotes) { const [a, b] = kind('footnote'); check(id, 'footnotes located', a >= bar.footnotes * b, `${a}/${b} ${pct(a, b)}`) }
  if (bar.headings) { const [a, b] = S.labels.heading ?? [0, 0]; check(id, 'heading labels', a >= bar.headings, `${a}/${b} (bar ${bar.headings})`) }
  // the brief's 0.003 pt printed beside the bar
  const firsts = S.baselines.first, close = firsts.filter(d => d <= BASELINE + 1e-9).length, fine = firsts.filter(d => d <= 0.003 + 1e-9).length
  check(id, `first baselines within ${BASELINE} pt of TeX's start marks`, close >= BASELINES_MIN * firsts.length, `${close}/${firsts.length} ${pct(close, firsts.length)}; within 0.003 pt ${fine}/${firsts.length} ${pct(fine, firsts.length)}`)
  // displays: none written EMPTY (the layer draws nothing for one, and a display with ink lost from the page is the
  // completeness the layer must keep); found of those marked printed beside it
  const displays = out.file.ph.filter(r => r[2] === 1), dEmpty = displays.filter(r => r[3] & 16).length, dLost = displays.filter(r => r[3] & 32).length
  check(id, 'displays: none EMPTY', dEmpty === 0, `found ${displays.length - dEmpty - dLost}/${displays.length}, EMPTY ${dEmpty}, LOST ${dLost}`)
  // every placeholder: found or LOST, EMPTY only where the source draws nothing — a paper's macro may (\bert defined
  // empty), every other kind sets ink; and no placeholder takes a glyph of the unit's own words (running text)
  const MACRO = 6, empties = out.file.ph.filter(r => r[3] & 16)
  const inked = empties.filter(r => r[2] !== MACRO)
  check(id, 'placeholders: none EMPTY of a kind that sets ink', inked.length === 0, `EMPTY ${empties.length} (${empties.filter(r => r[2] === MACRO).map(r => JSON.stringify(String(paper.units[r[0]].pieces[r[1]].src).slice(0, 30))).join(' ') || 'none'})${inked.length ? `; of kinds that set ink: ${inked.map(r => `${r[0]}.${r[1]}`).join(' ')}` : ''}`)
  check(id, 'running-text glyphs taken by a placeholder', S.ph.textTaken === 0, `${S.ph.textTaken}`)
  // the own ink's bars (Task 6b): every owned glyph and rule of a found piece matched, no arXiv glyph matched by two
  check(id, "owned glyphs of found pieces not matched on arXiv's page", S.ph.unmatched === 0, `${S.ph.unmatched} of ${S.ph.owned}`)
  check(id, 'arXiv glyphs matched by two found pieces', S.ph.twice === 0, `${S.ph.twice}`)
  // the reviews' named cases, each found (its own ink whole: found is every owned glyph matched)
  const rowOf = new Map(out.file.ph.map(r => [`${r[0]}.${r[1]}`, r]))
  for (const n of NAMED[id] ?? []) {
    const r = rowOf.get(n)
    check(id, `named case ${n} found, its own ink whole`, !!r && !(r[3] & (PH_FLAG.LOST | PH_FLAG.EMPTY)), r ? `flags ${r[3]}` : 'no row (its unit not located)')
  }
  // every visible piece of a located unit has its row (found, LOST or EMPTY): the layer reads a missing row as a piece
  // that draws nothing
  const rowed = new Set(out.file.ph.map(r => `${r[0]}.${r[1]}`))
  const missing = out.file.units.flatMap(([u]) => paper.units[u].pieces.map((p, k) => (classOf(p) && !rowed.has(`${u}.${k}`) ? `${u}.${k}` : null)).filter(Boolean))
  check(id, 'visible pieces with no row', missing.length === 0, `${missing.length} of ${rowed.size + missing.length}${missing.length ? ` (${missing.slice(0, 5).join(' ')})` : ''}`)
  // each page text against arXiv's characters inside its segments: the glyphs the canvas places there (by their middle),
  // and the text layer's (each item's characters by an even share of its width, as the reader's textIn reads them)
  const texts = new Map(out.file.pageText.map(([u, k, t]) => [`${u}.${k}`, t]))
  const pt = { texts: texts.size, ink: 0, inkSpaces: 0, layer: 0, layerChars: 0, layerRun: 0, misses: [] }
  if (texts.size) {
    const t2 = open(new Uint8Array(readFileSync(join(dir, 'arxiv.pdf')))), doc2 = await t2.promise, inks = new Map(), layers = new Map()
    const inkOf = async p => { if (!inks.has(p)) { const pg = await doc2.getPage(p); inks.set(p, pageInk(OPS, await pg.getOperatorList(), pg.commonObjs, { rotate: pg.rotate }).glyphs); layers.set(p, (await pg.getTextContent()).items) } return inks.get(p) }
    const norm = x => x.replace(/\s+/g, ' ').trim(), bare = x => x.replace(/\s+/g, '')
    for (const r of out.file.ph) {
      const t = texts.get(`${r[0]}.${r[1]}`)
      if (!t) continue
      const fromInk = [], fromLayer = [], items = []
      for (let o = 4; o < r.length; o += 6) {
        const [page, x0, , x1, top, bottom] = r.slice(o, o + 6), gs = await inkOf(page)
        const inside = (x, y) => x >= x0 - 0.01 && x <= x1 + 0.01 && y >= bottom - 0.01 && y <= top + 0.01
        const here = gs.filter(g => inside((g.x0 + g.x1) / 2, (g.top + g.bottom) / 2)).sort((a, b) => a.x0 - b.x0)
        let s1 = '', last = null
        for (const g of here) { if (last && g.x0 - last.x1 > 0.102 * Math.max(g.size, last.size)) s1 += ' '; s1 += g.u; last = g }
        fromInk.push(s1)
        let s2 = ''
        for (const it of layers.get(page)) {
          const n = it.str.length, w = it.width / Math.max(1, n), y = it.transform[5], h = Math.hypot(it.transform[2], it.transform[3]) || it.height
          for (let c = 0; c < n; c++) if (inside(it.transform[4] + (c + 0.5) * w, y + 0.3 * h)) s2 += it.str[c]
          // the items the segment meets, whole
          if (n && it.transform[4] < x1 && it.transform[4] + it.width > x0 && y + 0.3 * h >= bottom && y + 0.3 * h <= top) items.push(it.str)
        }
        fromLayer.push(s2)
      }
      const a = norm(fromInk.join(' ')), b = norm(fromLayer.join(' '))
      if (a === t) pt.ink++
      if (bare(a) === bare(t)) pt.inkSpaces++
      if (b === t) pt.layer++
      if (bare(b) === bare(t)) pt.layerChars++
      // the text a run of the characters of the text layer's items its segments meet
      if (bare(items.join('')).includes(bare(t))) pt.layerRun++
      if (bare(a) !== bare(t) || bare(b) !== bare(t)) pt.misses.push([`${r[0]}.${r[1]}`, t, a, b])
    }
    await t2.destroy()
  }
  check(id, "page texts: arXiv's glyphs inside each segment spell each (white space aside)", pt.inkSpaces === pt.texts, `${pt.inkSpaces}/${pt.texts}${pt.misses.length ? `; e.g. ${JSON.stringify(pt.misses.slice(0, 3))}` : ''}`)
  check(id, "page texts: each a run of the characters of arXiv's text layer items its segments meet", pt.layerRun === pt.texts, `${pt.layerRun}/${pt.texts}`)
  console.log(`page texts ${id}: ${pt.texts}; arXiv's glyphs inside the segments: ${pt.ink} the same, ${pt.inkSpaces} the same white space aside; its text layer's characters inside them (even share): ${pt.layer} the same, ${pt.layerChars} white space aside; a run of the items' characters: ${pt.layerRun}${pt.misses.length ? `; differing: ${JSON.stringify(pt.misses.slice(0, 8))}` : ''}`)
  // what was made, and what it cost
  const kept = keptFor(paper, 'zh'), cells = paper.units.map((u, i) => [u, i]).filter(([u]) => u.kind === 'cell' && !kept.has(u))
  const placedIds = new Set(out.file.units.map(u => u[0]))
  console.log(JSON.stringify({
    id, engine: paper.meta.compiler, compileMs, marksMs: marksMs === null ? null : Math.round(marksMs), marksBytes: readFileSync(marksFile).length, owned: marks.owned.length, ownedGlyphs: marks.owned.reduce((n, e) => n + (e.length > 2 ? e[2] : 0), 0), marking: marks.marking, pages: out.file.paper.pages,
    lines: S.lines, units: S.units, translatedCells: [cells.filter(([, i]) => placedIds.has(i)).length, cells.length],
    ph: S.ph, match: S.match, labels: S.labels, frames: S.frames, capped: S.capped, timedOut: S.timedOut, over: S.over,
    lastBaselines: `${S.baselines.last.filter(d => d <= BASELINE + 1e-9).length}/${S.baselines.last.length} within ${BASELINE}`,
    bytes: { ...S.bytes, gzip9: gzipSync(text, { level: 9 }).length }, ms: Object.fromEntries(Object.entries(S.ms).map(([k, v]) => [k, Math.round(v)])), wallMs: Math.round(wall),
    fonts: out.file.fonts.length,
  }))
}
process.exitCode = failed ? 1 : 0

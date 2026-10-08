// lab/pdf/spikes/layout-marks-gate.mjs
// The layout marks' quality on the corpus (Plan 8b, Task 2; spec §5). The layout marks have a compile of their own (the
// layout compile, v1), which feeds only the layout file; the readings and the final come from a compile with none. A
// line the marks move costs that paper's layout lines alone: their marks are where the layout compile set them, not
// where arXiv's PDF — the readings compile's twin — has the text. So for each paper of the corpus:
//   - v0, the marked original as the run makes it today (live.mjs originalFiles with its line probes), its destinations
//     set as v1 sets its own — the zero-size FitR of layout/marks.mjs LAYOUT_TEX — so that a unit mark compares with
//     a unit mark; v1, the same with the layout marks (LAYOUT_CLASSES, and the paper's own switch: TeX's answers to the
//     mark probe, below) — each compiled natively as spikes/gt-orig.mjs
//     compiles: latexmk, Docker texlive/texlive:latest, --network none, 2 CPUs, 3 GB, 300 s (but -file-line-error: the
//     logs are read as the run reads them), the date pinned. A compile is kept by what it was given (the TeX image, the engine, every
//     file), as what it gave (its text items, readings, marks, the files it wrote, errors, time); its PDF is deleted;
//   - the measure: the text items of v0 not at the same page and place to 0.01 pt in v1, strict (every PDF.js item) and
//     joined (abutting items as one run: how a line is cut into items is no place of a glyph, and the joined figure must
//     not hide what the strict one shows, so both are given); v0's lines (the layout maker's, Task 5) and the lines
//     lost, strict and joined (a line with an item moved); MARK_DEF's unit marks (each unit's start and end) not at the
//     same page and place in v1, the caption gate's apart (v1 sets a caption's marks at its float, v0 first where its
//     list of figures is); per class, the lines carried (a line not lost with a mark of the class on it) and, where any
//     line is lost and --bisect is given, the lines lost (v1 with the class alone against v1 with none, which sets the
//     units' own marks: headings', cells', MARK_DEF's — those against v0);
//   - TeX's own page boxes of every paper (\tracingoutput, a third and fourth compile) with the marks' own nodes taken
//     out (their destinations and points, the points around the column bodies and the floats), every difference counted: a line TeX set otherwise, mapped to the page's line by the marks set in it, is lost
//     and not carried; where items moved, the same boxes are a PDF-only offset;
//   - a verdict: failing where a line is lost (strict, joined or by TeX) and not every loss has an accepted cause
//     (layout-marks-compare.mjs verdictOf: items moved with TeX's boxes the same, a PDF-only offset; or every line TeX
//     set otherwise a heading's lost kern, by its evidence: causesOf), or where v1 does not compile; accepted where every
//     loss has one; with no line lost, switched (TeX's answers took marks off: the paper's own switch) or clean; passed
//     over where v0 does not compile. A class whose marks lose more of a paper's lines than they carry is to be switched
//     off for it (`switchOff`), and fails;
//   - the check against records/layout-marks.json (unless --no-check): a paper worse than its recorded row (its verdict,
//     its lines lost, its unit marks moved) fails the run.
// The paper's own switch is TeX's answer to the mark probe (layout/marks.mjs markProbeTex), set in the font probe's
// compile (probeFiles `marks`), as the run would set it. The rows go to records/layout-marks.json (ids, counts, page
// numbers, class and command names: no paper's content) with --write; the details, to <data>/runs/layout-marks-gate/.
// Exit 1 where a paper fails, a class is to be switched off, or a paper regressed. AXT_COMPILES=<n> runs n compiles at
// once at most (4, or 2 above a load of 16, by default).
//   CORPUS_ROOT=<the directory holding data/corpus and out/corpus-meta.json> [AXT_DATA=<data folder for the results>] \
//   pnpm exec tsx lab/pdf/spikes/layout-marks-gate.mjs [--papers=id,…] [--classes=a,b] [--bisect] [--write]
//     --classes    v1 with these classes only
//     --no-switch  v1 without the papers' own switches: what the switch keeps from moving
//     --plant=<pt> the gate's own test: a kern of that many points after v1's first closing mark, which must fail
//     --no-check   no check against the record
//     --write      the rows as the record (not for a variant)
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { loadavg } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { gunzipSync, gzipSync } from 'node:zlib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { latin1, latin1Bytes, MARK_DEF } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { askedCommands, encodeLayoutMarks, inkSamples, LAYOUT_CLASSES, LAYOUT_TEX, layoutMarksOf, MARK_CLASSES, parseLayoutMarks, probeSamples, readInkProbe, readInkTexts, readMarkProbe, switchedOf } from '../../../src/pdf-reader/engine/layout/marks.mjs'
import { openPaper, originalFiles, probeFiles, readingsOf } from '../../../src/pdf-reader/engine/live.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'
import { marksOf } from '../../../src/pdf-reader/engine/typeset/places.mjs'
import { attribute, boxDiff, causesOf, classOfMark, compareReadings, fileStates, joinRuns, lineAt, linesOf, lostLines, pageBoxes, regressions, strictMoves, switchOffOf, traced, verdictOf, withFitr } from './layout-marks-compare.mjs'

const run = promisify(execFile)
const here = new URL('..', import.meta.url).pathname
const CORPUS_ROOT = process.env.CORPUS_ROOT ?? here
const DATA = process.env.AXT_DATA ?? join(CORPUS_ROOT, 'data')
const OUT = join(DATA, 'runs', 'layout-marks-gate'), CACHE = join(OUT, 'cache'), WORK = join(OUT, 'work')
const RECORD = join(here, 'records/layout-marks.json')
const args = process.argv.slice(2), arg = name => args.find(a => a.startsWith(`--${name}=`))?.split('=')[1]
const BISECT = args.includes('--bisect'), NO_SWITCH = args.includes('--no-switch'), WRITE = args.includes('--write'), CHECK = !args.includes('--no-check')
/** the gate's own test: a kern (or with --plant-kind=glue, a glue) of this many points after v1's first closing mark,
 *  or after the mark --plant-at names (h84e), which the check must fail. Written so that a \write drops it, as the
 *  marks are */
const PLANT = arg('plant'), PLANT_AT = arg('plant-at'), PLANT_KIND = arg('plant-kind') ?? 'kern'
const CLASSES = arg('classes') !== undefined ? arg('classes').split(',').filter(Boolean) : [...LAYOUT_CLASSES]
for (const c of CLASSES) if (!MARK_CLASSES.includes(c)) throw new Error(`--classes: no class ${c}`)
const VARIANT = [arg('classes') !== undefined && `classes-${CLASSES.join('+')}`, NO_SWITCH && 'no-switch', PLANT && `plant-${PLANT}${PLANT_KIND === 'kern' ? '' : `-${PLANT_KIND}`}${PLANT_AT ? `-${PLANT_AT}` : ''}`].filter(Boolean).join('-')
if (WRITE && VARIANT) throw new Error('--write: a variant is never the record')
const meta = JSON.parse(readFileSync(join(CORPUS_ROOT, 'out/corpus-meta.json'), 'utf8'))
const ids = arg('papers')?.split(',').filter(Boolean) ?? meta.map(m => m.id)
for (const id of ids) if (!existsSync(join(CORPUS_ROOT, 'data/corpus', id, 'source.gz'))) throw new Error(`no source for ${id}`)
const image = (await run('docker', ['image', 'inspect', 'texlive/texlive:latest', '--format', '{{.Id}}'])).stdout.trim()
/** what a compile keeps of itself: raised when what is kept changes, so that a kept compile is read again */
const FORMAT = 4
/** the code that reads a compile (its text items, readings, marks and marks file), hashed into every compile's key: a
 *  change to it reads every compile again, not a stale result (the review, M4) */
const READERS = createHash('sha256')
for (const f of ['live.mjs', 'typeset/places.mjs', 'typeset/tex.mjs', 'layout/marks.mjs', 'layout/json.mjs', 'layout/ink.mjs', 'layout/stream.mjs', 'anchors.mjs', 'latex-front.mjs']) READERS.update(readFileSync(new URL(`../../../src/pdf-reader/engine/${f}`, import.meta.url)))
const READ_HASH = READERS.digest('hex').slice(0, 16)
/** every compile's date, pinned (pdfTeX's SOURCE_DATE_EPOCH with FORCE_SOURCE_DATE): a paper's \today is the same in v0
 *  and v1 whenever each was compiled (2608.20159's title page moved a day across midnight UTC) */
const EPOCH = 1791244800

// ---------------------------------------------------------------- compiles: four at a time, two above a load of 16
let active = 0
const limit = () => Number(process.env.AXT_COMPILES) || (loadavg()[0] > 16 ? 2 : 4)
async function slot() { while (active >= limit()) await new Promise(r => setTimeout(r, 2000)); active++ }
/** TeX's page boxes in the log, whole: each node on its line (no line cut at 79 characters) */
const TRACE = '\\tracingoutput=1 \\tracingonline=0 \\showboxbreadth=2147483647 \\showboxdepth=2147483647 '
const sha = b => createHash('sha256').update(b).digest('hex')
const pack = v => gzipSync(Buffer.from(JSON.stringify(v)))
const unpack = f => JSON.parse(gunzipSync(readFileSync(f)).toString())
/** the box displays of a log: every page shipped out, to the blank line after it */
const boxesOf = log => { const out = [], lines = log.split('\n'); for (let i = 0; i < lines.length; i++) if (/^Completed box being shipped out \[/.test(lines[i])) { const at = i; while (i < lines.length && lines[i] !== '') i++; out.push(...lines.slice(at, i), '') } return out.join('\n') }

/**
 * A compile of `files` (path → bytes, the paper's and the run's), kept by what it was given: what it gave, its PDF read
 * and deleted — its text items per page ([str, x, y, w, h], non-blank), its readings (readingsOf, the marks as entries),
 * the files it wrote (by SHA-256), its errors, its time; for v1, its layout marks ([name, page, x, y]) and its marks
 * file's size and the names it dropped; with `trace`, the box displays of its log (kept, gzipped). `probe`: one pass,
 * its log kept
 */
async function compile(id, files, { main, engine, bbl, kind, marking = {} }) {
  // the trace's lines whole for pdfTeX alone: BibTeX reads max_print_line too, and with it at a million writes no
  // bibliography (2608.30640's trace was 30 pages, its compile 34)
  const pdftex = kind === 'trace' ? [`-pdflatex=env max_print_line=1000000 ${engine} %O %S`] : []
  const cmd = kind === 'probe' ? [engine, '-interaction=nonstopmode', main] : ['latexmk', { xelatex: '-xelatex', lualatex: '-lualatex' }[engine] ?? '-pdf', ...pdftex, ...(bbl ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-f', main]
  const hash = createHash('sha256').update(JSON.stringify([FORMAT, READ_HASH, image, id, main, engine, !!bbl, kind, cmd, EPOCH]))
  for (const [p, b] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) hash.update(p).update(b)
  const key = join(CACHE, hash.digest('hex').slice(0, 32))
  if (existsSync(`${key}.json.gz`)) return unpack(`${key}.json.gz`)
  await slot()
  const dir = join(WORK, key.split('/').pop())
  try {
    rmSync(dir, { recursive: true, force: true })
    for (const [p, b] of files) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
    const t0 = Date.now()
    await run('docker', ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', '-e', 'FORCE_SOURCE_DATE=1', '-e', `SOURCE_DATE_EPOCH=${EPOCH}`, '-v', `${dir}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '300', ...cmd], { maxBuffer: 1 << 28 }).catch(() => null)
    const ms = Date.now() - t0
    const stem = main.split('/').pop().replace(/\.[^./]+$/, ''), at = ext => join(dir, `${stem}.${ext}`)
    const text = ext => (existsSync(at(ext)) ? readFileSync(at(ext), 'latin1') : null)
    const log = text('log') ?? ''
    if (!log) return { ok: false, ms, why: 'no log' }
    const whole = existsSync(at('pdf')) && statSync(at('pdf')).size > 0 && readFileSync(at('pdf')).subarray(-1024).includes('%%EOF')
    const out = { ok: whole, ms, errors: log.match(/^! .*/gm) ?? [] }
    if (kind === 'probe') out.log = log
    else if (kind === 'trace') {
      out.pages = (log.match(/^Completed box being shipped out \[/gm) ?? []).length
      if (whole) { const task = getDocument({ data: new Uint8Array(readFileSync(at('pdf'))), verbosity: 0 }); try { out.pdfPages = (await task.promise).numPages } finally { await task.destroy() } }
      writeFileSync(`${key}.boxes.gz`, gzipSync(Buffer.from(boxesOf(log), 'latin1')))
      writeFileSync(`${key}.log.gz`, gzipSync(Buffer.from(log, 'latin1')))
      out.boxes = `${key}.boxes.gz`
    }
    else if (whole) {
      const aux = text('aux'), bblText = text('bbl')
      out.files = Object.fromEntries(['aux', 'toc', 'lof', 'lot', 'out'].map(ext => { const t = text(ext); return [ext, t === null ? null : sha(Buffer.from(t, 'latin1'))] }))
      const task = getDocument({ data: new Uint8Array(readFileSync(at('pdf'))), verbosity: 0 })
      try {
        const pdf = await task.promise, items = []
        for (let n = 1; n <= pdf.numPages; n++) {
          const pg = await pdf.getPage(n)
          items.push((await pg.getTextContent()).items.filter(i => i.str).map(i => [i.str, i.transform[4], i.transform[5], i.width, i.height]))
          pg.cleanup()
        }
        out.items = items
        const r = readingsOf({ log, aux, bbl: bblText }, await marksOf(pdf))
        out.readings = { ...r, marks: { ...r.marks, marks: [...r.marks.marks] } }
        if (kind === 'v1') {
          const m = await layoutMarksOf(pdf, log, { engine, ...marking }), enc = encodeLayoutMarks(m)
          parseLayoutMarks(new TextEncoder().encode(enc))
          out.marks = m.marks
          // the pieces with an opening point, and those that own their ink by it (layout/stream.mjs)
          out.marksFile = { kb: Math.round(enc.length / 1024), dropped: m.dropped.length, marks: m.marks.length, owned: m.owned.filter(e => e.length > 2).length, points: m.owned.length }
        }
      } finally { await task.destroy() }
    }
    writeFileSync(`${key}.json.gz`, pack(out))
    return out
  } finally { rmSync(dir, { recursive: true, force: true }); active-- }
}

// ---------------------------------------------------------------- the measure
/** a compile's text items per page: every one (`all`, the spaces PDF.js gives as items of their own among them, which
 *  joined runs are joined across), and those with ink (the strict measure's, and the lines') */
const allOf = c => c.items.map(p => p.map(([str, x, y, w, h]) => ({ str, x, y, w, h })))
const itemsOf = c => allOf(c).map(p => p.filter(i => /\S/.test(i.str)))
const readingsIn = c => ({ ...c.readings, marks: { ...c.readings.marks, marks: new Map(c.readings.marks.marks) } })
/** v1's errors v0 has not, each line of the log counted */
const newErrors = (e0, e1) => { const left = [...e0]; return e1.filter(e => { const k = left.indexOf(e); if (k < 0) return true; left.splice(k, 1); return false }) }
/** the lines of `ref` that `test` loses (layout-marks-compare.mjs lostLines), the lines of `ref`'s pages */
const lost = (ref, test, lines) => lostLines(itemsOf(ref), test.ok ? itemsOf(test) : [], allOf(ref), test.ok ? allOf(test) : [], lines)

async function paperRow(id) {
  const { files: sources } = await unpackSource(new Uint8Array(readFileSync(join(CORPUS_ROOT, 'data/corpus', id, 'source.gz'))))
  const paper = openPaper(sources), { meta: m, project, units } = paper
  const opts = kind => ({ main: project.main, engine: m.compiler, bbl: m.bbl, kind })
  const withSources = over => { const all = new Map(sources); for (const [p, b] of over) all.set(p, b); return all }
  // the paper's own switch, as the run would set it: TeX's answers to the mark probe, set in the font probe's compile
  const samples = probeSamples(units)
  const probe = await compile(id, withSources(probeFiles(paper, { marks: true })), opts('probe'))
  const answered = readMarkProbe(probe.log ?? '', samples)
  // --no-switch: the probe not asked (switches null), every mark as LAYOUT_TEX sets it; and the paper's macros TeX said
  // set no ink, which get no mark (readInkProbe)
  const switches = NO_SWITCH ? null : answered
  const inkless = NO_SWITCH ? null : readInkProbe(probe.log ?? '', inkSamples(units))
  const texts = NO_SWITCH ? null : readInkTexts(probe.log ?? '', inkSamples(units))
  const v1Of = classes => {
    const files = originalFiles(paper, { lines: true, layout: classes, switches, inkless })
    if (PLANT) for (const p of [project.main, ...[...files.keys()].filter(f => f !== project.main).sort()]) {
      const t = latin1(files.get(p)), at = PLANT_AT ? t.search(new RegExp(`\\\\axt[a-z]*\\{${PLANT_AT.replace(/\./g, '\\.')}\\}`)) : t.search(/\\axtpm\{p\d+\.\d+b\}/)
      if (at < 0) continue
      const end = t.indexOf('}', at) + 1, what = PLANT_KIND === 'glue' ? `\\hskip${PLANT}pt\\relax` : `\\kern${PLANT}pt\\relax`
      files.set(p, latin1Bytes(`${t.slice(0, end)}\\expandafter\\ifx\\csname @typeset@protect\\endcsname\\protect${what}\\fi${t.slice(end)}`))
      break
    }
    return withSources(files)
  }
  const v0Files = originalFiles(paper, { lines: true })
  v0Files.set(project.main, latin1Bytes(withFitr(latin1(v0Files.get(project.main)), MARK_DEF, LAYOUT_TEX)))
  const f0 = withSources(v0Files), f1 = v1Of(CLASSES)
  const [c0, c1] = await Promise.all([compile(id, f0, opts('v0')), compile(id, f1, { ...opts('v1'), marking: { classes: CLASSES, switches, inkless, texts, units, OPS } })])
  const row = { id, v0: c0.ok ? 'ok' : 'failed' }
  if (!c0.ok) return { row: { ...row, verdict: verdictOf(row) }, detail: { why: c0.why ?? c0.errors?.slice(0, 3) } }
  row.v1 = c1.ok ? 'ok' : 'failed'
  // the switch as applied (none under --no-switch): the commands TeX's answers take marks off, and the probe's own
  // figures — its samples, those it answered, its compile's time
  if (switchedOf(switches).length) row.switched = switchedOf(switches)
  // the asked commands TeX gave no answer for: none of their placeholders is marked (the re-review's m4)
  const unanswered = switches ? [...askedCommands(units)].filter(c => !switches[c]).sort() : []
  if (unanswered.length) row.unanswered = unanswered
  row.probe = { samples: samples.length, answered: Object.keys(answered).length, ...(inkless?.length ? { inkless: inkless.length } : {}), ms: probe.ms }
  row.ms = [c0.ms, c1.ms]
  if (!c1.ok) return { row: { ...row, verdict: verdictOf(row) }, detail: { why: c1.why ?? c1.errors?.slice(0, 3) } }
  const a = itemsOf(c0), b = itemsOf(c1), lines = a.map(linesOf)
  const strict = strictMoves(a, b), joined = strictMoves(allOf(c0).map(joinRuns), allOf(c1).map(joinRuns))
  const lostNow = lost(c0, c1, lines)
  const cmp = compareReadings(readingsIn(c0), readingsIn(c1), units)
  const r0 = new Map(c0.readings.marks.marks), r1 = new Map(c1.readings.marks.marks), gate = new Set(cmp.captions.map(([u]) => u))
  const unitMoved = [...new Set([...r0.keys(), ...r1.keys()])].filter(n => /^\d+[se]$/.test(n) && !gate.has(Number(n.slice(0, -1)))).filter(n => { const x = r0.get(n), y = r1.get(n); return !x || !y || x.page !== y.page || Math.abs(x.x - y.x) > 0.01 || Math.abs(x.y - y.y) > 0.01 })
  // each class's marks by the line they stand on
  const byClass = {}
  for (const [name, page, x, y] of c1.marks ?? []) {
    const cls = classOfMark(name, units), l = cls && lines[page - 1] ? lineAt(lines[page - 1].lines, x, y) : -1
    if (l < 0) continue
    ;(byClass[cls] ??= new Set()).add(`${page}:${l}`)
  }
  Object.assign(row, {
    pages: [a.length, b.length], items: a.reduce((n, p) => n + p.length, 0), moved: { strict: strict.moved.length, joined: joined.moved.length },
    lines: lines.reduce((n, p) => n + p.lines.length, 0), lost: { strict: lostNow.strict.size, joined: lostNow.joined.size },
    unitMarksMoved: unitMoved.length, captions: cmp.captions, readings: cmp.readings, files: fileStates(c0.files, c1.files ?? {}), errors: newErrors(c0.errors, c1.errors ?? []).length,
    marksFile: c1.marksFile,
  })
  const detail = { switches: answered, moved: strict.moved.slice(0, 12), extra: strict.extra.slice(0, 12), joined: joined.moved.slice(0, 12), lost: [...lostNow.strict].slice(0, 40), unitMoved: unitMoved.slice(0, 20).map(n => [n, units[Number(n.slice(0, -1))]?.kind ?? null, r0.get(n) ?? null, r1.get(n) ?? null]), parts: cmp.parts, newErrors: newErrors(c0.errors, c1.errors ?? []).slice(0, 5) }
  // TeX's boxes, the marks' own nodes out, on every paper: a line TeX set otherwise inside one item that kept its place
  // and width (a justified line PDF.js gives whole, its glue making up a kern lost in it) moves no item, and the
  // layout maker reads its words off that item; where items moved, the same boxes are a PDF-only offset
  const trace = files => { const t = new Map(files); t.set(project.main, Buffer.concat([Buffer.from(TRACE), Buffer.from(t.get(project.main))])); return t }
  const [t0, t1] = await Promise.all([compile(id, trace(f0), opts('trace')), compile(id, trace(f1), opts('trace'))])
  // judged only where the trace compiles are the documents compiled: as many pages, each shipped out in the log
  row.traced = traced(t0, t1, a.length, b.length)
  // the lines TeX set otherwise, as lines of the page: where the marks set in each stand (v1's marks file)
  const texLost = new Set(), at1 = new Map((c1.marks ?? []).map(([n, page, x, y]) => [n, [page, x, y]]))
  if (row.traced) {
    const diff = boxDiff(pageBoxes(gunzipSync(readFileSync(t0.boxes)).toString('latin1')), pageBoxes(gunzipSync(readFileSync(t1.boxes)).toString('latin1')))
    row.lost.tex = new Set(diff.map(d => `${d.page}:${d.line}`)).size
    for (const d of diff) for (const n of d.inLine.length ? d.inLine : [d.near]) { const q = at1.get(n), l = q && lines[q[0] - 1] ? lineAt(lines[q[0] - 1].lines, q[1], q[2]) : -1; if (l >= 0) texLost.add(`${q[0]}:${l}`) }
    if (lostNow.strict.size || diff.length) row.cause = diff.length ? 'tex' : 'pdf-only'
    const causes = [...causesOf(diff).values()]
    if (causes.length) row.causes = { accepted: causes.filter(c => c !== 'unexplained').length, unexplained: causes.filter(c => c === 'unexplained').length }
    const seen = new Map()
    for (const d of diff) { const k = `${d.page}|${d.near}`; if (!seen.has(k)) seen.set(k, { page: d.page, near: d.near, what: attribute(d.near, units) }) }
    if (diff.length) row.boxes = [...seen.values()]
    // the lines TeX set otherwise by the class of the mark nearest each difference (a heading's, a cell's, a class's)
    const byWhat = new Map()
    for (const d of diff) { const c = classOfMark(d.near, units) ?? 'none'; (byWhat.get(c) ?? byWhat.set(c, new Set()).get(c)).add(`${d.page}:${d.line}`) }
    row.classes = {}
    for (const [c, set] of byWhat) row.classes[c] = { texLost: set.size }
    detail.boxes = diff.slice(0, 40)
    detail.traces = [t0.boxes, t1.boxes]
  }
  // every line lost, in items or in TeX's boxes, as lines of the page: TeX counts the lines it set otherwise, the items a
  // line moved down by a change above it too, so neither count holds the other
  row.lost.all = new Set([...lostNow.strict, ...lostNow.joined, ...texLost]).size
  // each class's marks by the line they stand on, and the lines carried: those lost neither in items nor in TeX's boxes
  const carriedOf = set => [...set].filter(k => !lostNow.strict.has(k) && !texLost.has(k)).length
  const tex = row.classes ?? {}
  row.classes = {}
  for (const [c, set] of Object.entries(byClass)) row.classes[c] = { lines: set.size, carried: carriedOf(set) }
  for (const [c, x] of Object.entries(tex)) row.classes[c] = { lines: 0, carried: 0, ...row.classes[c], ...x }
  if (lostNow.strict.size || row.lost.tex) {
    // which marks lose the lines: the units' own (every v1 sets them: v1 with no class against v0), and each class alone
    // against v1 with none
    if (BISECT) {
      const none = await compile(id, v1Of([]), opts('v1'))
      row.own = { lost: lost(c0, none, lines).strict.size }
      for (const c of CLASSES) {
        const ci = await compile(id, v1Of([c]), opts('v1'))
        const l = none.ok ? lost(none, ci, itemsOf(none).map(linesOf)) : lost(c0, ci, lines)
        if (l.strict.size) (row.classes[c] ??= { lines: 0, carried: 0 }).lost = l.strict.size
      }
    }
  }
  // a class whose marks lose more lines than they carry: to be switched off for the paper
  const off = switchOffOf(row.classes, MARK_CLASSES)
  if (off.length) row.switchOff = off
  row.verdict = verdictOf(row)
  return { row, detail }
}

// ---------------------------------------------------------------- the corpus
for (const d of [join(OUT, 'rows'), CACHE, WORK]) mkdirSync(d, { recursive: true })
const started = Date.now(), rows = []
let next = 0
await Promise.all(Array.from({ length: 2 }, async () => {
  while (next < ids.length) {
    const id = ids[next++]
    const t = Date.now()
    const { row, detail } = await paperRow(id).catch(e => ({ row: { id, v0: 'ok', v1: 'failed', verdict: 'failing', error: String(e?.message ?? e).slice(0, 200) }, detail: { stack: String(e?.stack ?? e).slice(0, 1000) } }))
    rows.push(row)
    writeFileSync(join(OUT, 'rows', `${id}${VARIANT ? `-${VARIANT}` : ''}.json`), JSON.stringify({ row, detail }, null, 1))
    const lostBy = Object.entries(row.classes ?? {}).filter(([, x]) => x.lost || x.texLost).map(([c, x]) => `${c} ${x.lost ?? 0}/${x.texLost ?? 0}`).join(', ')
    const say = row.v0 === 'failed' ? 'v0 failed: passed over' : row.v1 !== 'ok' ? `FAILED ${row.error ?? 'v1 did not compile'}` : `${row.verdict}${row.switched ? ` (${row.switched})` : ''}${row.unanswered ? ` unanswered ${row.unanswered}` : ''} pages ${row.pages.join('/')} lines ${row.lines} lost ${row.lost.strict}/${row.lost.joined}/${row.lost.tex ?? '-'} (all ${row.lost.all ?? '-'}) items moved ${row.moved.strict}/${row.moved.joined} unit marks moved ${row.unitMarksMoved}${row.captions.length ? ` captions ${row.captions.length}` : ''} readings ${row.readings} files ${Object.entries(row.files).filter(([, s]) => s === 'differs').map(([k]) => k).join(',') || 'same'}${row.causes ? ` causes ${row.causes.accepted} accepted, ${row.causes.unexplained} unexplained` : ''}${row.cause ? ` cause ${row.cause}${row.boxes?.length ? `: ${row.boxes.slice(0, 6).map(x => `p${x.page} ${x.near ?? '-'} (${x.what})`).join('; ')}${row.boxes.length > 6 ? ` …${row.boxes.length}` : ''}` : ''}` : ''}${row.own ? ` own ${row.own.lost}` : ''}${lostBy ? ` by class ${lostBy}` : ''}${row.switchOff ? ` SWITCH OFF ${row.switchOff}` : ''}`
    console.log(`[${rows.length}/${ids.length}] ${id} ${Math.round((Date.now() - t) / 1000)} s ${say}`)
  }
}))

const order = new Map(ids.map((id, i) => [id, i]))
rows.sort((x, y) => order.get(x.id) - order.get(y.id))
const countsOf = rs => {
  const of = v => rs.filter(r => r.verdict === v).length, sum = f => rs.reduce((n, r) => n + (f(r) ?? 0), 0)
  return {
    papers: rs.length, clean: of('clean'), accepted: of('accepted'), switched: of('switched'), failing: of('failing'), passedOver: of('passed over'), unanswered: rs.filter(r => r.unanswered).length,
    lines: sum(r => r.lines), lost: { strict: sum(r => r.lost?.strict), joined: sum(r => r.lost?.joined), tex: sum(r => r.lost?.tex), all: sum(r => r.lost?.all) }, untraced: rs.filter(r => r.v1 === 'ok' && !r.traced).map(r => r.id), moved: { strict: sum(r => r.moved?.strict), joined: sum(r => r.moved?.joined) },
    unitMarksMoved: sum(r => r.unitMarksMoved), captionPapers: rs.filter(r => r.captions?.length).length, switchOff: rs.filter(r => r.switchOff).map(r => r.id),
  }
}
const ratio = rows.filter(r => r.ms?.[0] > 0 && r.v1 === 'ok').map(r => r.ms[1] / r.ms[0] - 1).sort((x, y) => x - y)
const median = ratio.length ? (ratio[(ratio.length - 1) >> 1] + ratio[ratio.length >> 1]) / 2 : null
console.log(JSON.stringify({ ...countsOf(rows), compileTime: ratio.length ? { median: Math.round(1000 * median) / 10, max: Math.round(1000 * ratio.at(-1)) / 10 } : null, wall: Math.round((Date.now() - started) / 1000) }))
// the check against the record: a paper worse than its recorded row fails the run (the review, I1)
const record = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, 'utf8')) : { rows: [] }
const worse = CHECK ? regressions(rows, record.rows) : []
for (const w of worse) console.log(`REGRESSION ${w}`)
if (WRITE) {
  const was = record
  const byId = new Map(was.rows.map(r => [r.id, r]))
  for (const r of rows) byId.set(r.id, r)
  const all = [...byId.values()].sort((x, y) => (order.get(x.id) ?? 1e9) - (order.get(y.id) ?? 1e9) || (x.id < y.id ? -1 : 1))
  const rec = { written: new Date().toLocaleDateString('sv-SE'), image, classes: CLASSES, tolerance: { item: 0.01 }, counts: countsOf(all), rows: all }
  writeFileSync(RECORD, `${JSON.stringify(rec, null, 1)}\n`)
  console.log(`record: ${RECORD}`)
}
const failing = rows.filter(r => r.verdict === 'failing' || r.switchOff)
for (const r of failing) console.log(`FAIL ${r.id}: ${r.verdict}${r.switchOff ? `, switch off ${r.switchOff}` : ''}`)
process.exit(failing.length || worse.length ? 1 : 0)

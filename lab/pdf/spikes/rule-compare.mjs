// lab/pdf/spikes/rule-compare.mjs
// The page stream's rule changes against today's rules (E2b stage 2, part 1), for the engine lane's gates: for each paper and
// each rule set, the files a rule changes, made from one reading of the paper's inputs, and what changes against today's, unit
// by unit. The rule sets:
//   off      today's: the frame of the located units' words (anchors.mjs pageFrame), the columns of their lines (pageColumns)
//   frame    rule 1: the frame of arXiv's tokens alone (anchors.mjs frameOfTokens), for the maker's anchors and the left's
//   columns  rule 4: the columns of arXiv's tokens alone (view/highlight.mjs columnsOfTokens), for the left side's far push
//   both     rules 1 and 4
// Rule 1 moves the layout file (the maker's anchors), the left (anchorUnits over arXiv's tokens under the unit marks) and so the
// left side; rule 4 moves the left side alone (its tokens' far push): the maker reads no columns.
//   pnpm exec tsx lab/pdf/spikes/rule-compare.mjs [--papers=<id>v<n>,…] [--rules=off,frame,columns,both] [--out=<dir>]
//       [--of=<fixtures folder>] [--engine=<worktree>]
// --papers: the papers (default: every folder of <data>/layout that holds source.gz and arxiv.pdf). --rules: the rule sets
// (default all four; off is always made, the baseline). --of: a fixtures folder (the gate pack's fixtures/, or a layer-fixtures
// folder: <id>v<n>-<target>/ holding layout.json and its other files): each of its outputs of a paper made here is written
// again under each rule set, its layout.json this run's and its other files linked, so that the layer gate runs on it
// (layer-gate.mjs --fixtures=<out>/<rule>/fixtures, its model and pixel tiers; the gate's baseline is this run's off, made from
// the same compiles). --engine: another worktree's engine (its src/pdf-reader/engine), which must have both rules.
// Inputs (outside git, read only; no TeX and no network): <AXT_DATA, else lab/pdf/data>/layout/<id>v<n>/source.gz and
// arxiv.pdf; the compiles kept by what they compile, as layer-fixtures.mjs keeps them (<COMPILES>/<id>v<n>/<key>.pdf and .log,
// else <data>/layout/<id>v<n>/compiles/): the mark probe's and the marked original's, which the engine's own layoutMarksOfPaper
// asks for. A compile not kept fails the paper (layer-fixtures.mjs makes it), and the run goes on to the next.
// Outputs, in <out, else lab/pdf/out/rule-compare>/:
//   <rule>/<paper>/layout.json   the layout file (refusal.json in its place where the maker refuses), its stats in stats.json
//   <rule>/<paper>/left.json     the left: [[id, anchor | null] …], each { rects, coverage, tokens, bounded, pairs? }
//   <rule>/<paper>/side.json     the left side: leftSideOf's { units, pages: every page's left part }
//   <rule>/fixtures/<fx>/        with --of, as above
//   diff/<paper>-<rule>.json     against off, by unit: the units whose left rectangles moved, whose maker rows moved (lines,
//                                frames, erase, ph, labels, held), whose placeholders found or LOST changed; the pages of each;
//                                the left side's pages and far-pushed tokens that changed
//   summary.json                 the table below, as rows
// On stdout, a row per paper and rule set: units and pages whose left moved; units and pages whose maker rows moved;
// placeholders found and LOST, units located, lines carried (each `off -> rule` where it moved); left-side pages and far-pushed
// tokens that changed. Exits 1 where a paper could not be made.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getDocument, OPS, version as PDFJS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { LITE } from './lite-pdfjs.mjs'

const root = new URL('..', import.meta.url).pathname
const REPO = resolve(root, '../..')
const argOf = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const ENGINE = resolve(argOf('engine') ?? REPO)
const engine = path => import(pathToFileURL(join(ENGINE, 'src/pdf-reader/engine', path)).href)
const { anchorUnits, boundsFromMarks, floatMatches, frameOfTokens, pageFrame } = await engine('pipeline/anchors.mjs')
const { columnsOfTokens } = await engine('view/highlight.mjs')
if (typeof frameOfTokens !== 'function' || typeof columnsOfTokens !== 'function') throw new Error(`${ENGINE}: its engine has no frameOfTokens or columnsOfTokens`)
const { leftSideOf } = await engine('pipeline/left-side.mjs')
const { readArxivText } = await engine('layout/arxiv.mjs')
const { makeLayout } = await engine('layout/make.mjs')
const { encodeLayout, parseLayout, PH_FLAG } = await engine('layout/file.mjs')
const { layoutMarksOfPaper } = await engine('layout/paper.mjs')
const { openPaper } = await engine('pipeline/live.mjs')
const { unpackSource } = await engine('source/tar.mjs')
const { displayEdges, unitText } = await engine('translate/mt.mjs')

const DATA = resolve(process.env.AXT_DATA ?? join(root, 'data'))
const COMPILES = process.env.COMPILES ? resolve(process.env.COMPILES) : null
const OUT = resolve(argOf('out') ?? join(root, 'out/rule-compare'))
const OF = argOf('of') ? resolve(argOf('of')) : null
const RULES = { off: { frame: false, columns: false }, frame: { frame: true, columns: false }, columns: { frame: false, columns: true }, both: { frame: true, columns: true } }
const asked = (argOf('rules') ?? Object.keys(RULES).join(',')).split(',').filter(Boolean)
for (const r of asked) if (!RULES[r]) throw new Error(`--rules: ${r} is none of ${Object.keys(RULES).join(', ')}`)
const rules = ['off', ...asked.filter(r => r !== 'off')]
const papers = (argOf('papers') ?? '').split(',').filter(Boolean)
const layoutDir = join(DATA, 'layout')
if (!papers.length && existsSync(layoutDir)) for (const d of readdirSync(layoutDir).sort()) if (/v\d+$/.test(d) && existsSync(join(layoutDir, d, 'source.gz')) && existsSync(join(layoutDir, d, 'arxiv.pdf'))) papers.push(d)
if (!papers.length) throw new Error(`no paper: give --papers, or put <id>v<n>/source.gz and arxiv.pdf in ${layoutDir}`)
/** the units kinds TeX sets away from their source: no neighbour to be searched between (the maker's and the web's) */
const FLOATING = new Set(['caption', 'footnote', 'cell', 'figure'])
const NM = new URL('../../../node_modules/pdfjs-dist/', import.meta.url).pathname
const open = bytes => getDocument({ data: bytes, ...LITE, verbosity: 0, cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/`, useSystemFonts: false })
const plain = v => JSON.stringify(v, (_, x) => (x instanceof Map ? [...x] : ArrayBuffer.isView(x) ? Array.from(x) : x))
const write = (file, text) => { mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, text) }

/** a paper's marks from its kept compiles alone: the engine asks for the probe and the marked original by their files, and a
 *  compile is looked up by its key (layer-fixtures.mjs's: the source's and the overrides' files, sorted, hashed) */
async function marksOf(id, paper, source) {
  const dir = COMPILES ? join(COMPILES, id) : join(layoutDir, id, 'compiles')
  const keyOf = marked => {
    const hash = createHash('sha256')
    for (const [p, b] of [...source, ...marked].sort((a, b) => (a[0] < b[0] ? -1 : 1))) hash.update(p).update(b)
    return hash.digest('hex').slice(0, 16)
  }
  let missing = null
  const compile = async req => {
    const name = `${req.rerun ? '' : 'probe-'}${keyOf(req.overrides)}`, log = join(dir, `${name}.log`), pdf = join(dir, `${name}.pdf`)
    if (!existsSync(log)) { missing = join(dir, name); return { ok: false, error: 'not kept' } }
    const bytes = existsSync(pdf) ? new Uint8Array(readFileSync(pdf)) : null
    return { ok: !!bytes?.length, pdf: bytes, log: readFileSync(log, 'latin1') }
  }
  const made = await layoutMarksOfPaper(paper, {
    compile,
    open: async bytes => {
      const task = open(bytes)
      try { return { doc: await task.promise, close: () => task.destroy() } } catch (e) { await task.destroy().catch(() => {}); throw e }
    },
    OPS,
  })
  if (missing) throw new Error(`a compile not kept: ${missing} (layer-fixtures.mjs makes it)`)
  if (!('marks' in made)) throw new Error(`the marks were refused: ${made.refused}`)
  return made
}

/** a layout file's rows by unit: what the maker wrote for each unit, and its placeholders found and LOST */
function byUnit(text) {
  const out = new Map()
  if (!text) return out
  const file = parseLayout(new TextEncoder().encode(text))
  const of = id => out.get(id) ?? out.set(id, { unit: null, lines: null, frames: null, erase: null, ph: [], labels: [], held: null, pages: new Set() }).get(id)
  for (const u of file.units) of(u[0]).unit = u
  for (const [id, rows] of file.lines) { const e = of(id); e.lines = rows; for (let i = 0; i < rows.length; i += 8) e.pages.add(rows[i]) }
  for (const [id, rows] of file.frames) of(id).frames = rows
  for (const [id, rows] of file.erase) of(id).erase = rows
  for (const row of file.ph) of(row[0]).ph.push(row)
  for (const row of file.labels) of(row[0]).labels.push(row)
  for (const [id, lines] of file.held) of(id).held = lines
  for (const e of out.values()) { e.found = e.ph.filter(r => !(r[3] & PH_FLAG.LOST)).length; e.lost = e.ph.filter(r => r[3] & PH_FLAG.LOST).length }
  return out
}
const rowsOf = e => (e ? plain([e.unit, e.lines, e.frames, e.erase, e.ph, e.labels, e.held]) : null)
/** the far-pushed ink across of a left part's tokens (field r, its wire's differences summed) */
const inkOf = part => { if (!part) return []; const d = part.tokens.r, out = new Array(d.length); for (let k = 0, v = 0; k < d.length; k++) { v += d[k]; out[k] = v } return out }

const table = []
let failed = 0
for (const id of papers) {
  const t0 = performance.now()
  try {
    const dir = join(layoutDir, id)
    const unpacked = await unpackSource(new Uint8Array(readFileSync(join(dir, 'source.gz'))))
    if (!('files' in unpacked)) throw new Error('the source is a PDF')
    const paper = openPaper(unpacked.files)
    const made = await marksOf(id, paper, unpacked.files)
    const texts = paper.units.map((u, i) => ({ id: i, ...unitText(u.pieces), ...displayEdges(u) }))
    const floating = i => FLOATING.has(paper.units[i]?.kind ?? '')
    const m = /^(.+)v(\d+)$/.exec(id)
    const task = open(new Uint8Array(readFileSync(join(dir, 'arxiv.pdf'))))
    const runs = new Map()
    try {
      const arxiv = await task.promise
      // step T, once: arXiv's text, the floats' matches, and the two rules' tables
      const text = await readArxivText(arxiv)
      const doc = text.tokens
      const floatMatch = floatMatches(doc, texts, floating)
      const F = frameOfTokens(doc)
      const tokenColumns = views => columnsOfTokens(doc, views)
      const bounds = made.unitMarks ? boundsFromMarks(doc, made.unitMarks) : undefined
      const byFrame = new Map()
      for (const rule of rules) {
        const { frame, columns } = RULES[rule]
        // the maker and the left read the frame alone: made once a frame
        if (!byFrame.has(frame)) {
          const rule1 = frame ? () => F : pageFrame
          const out = await makeLayout({ units: paper.units, marks: made.marks, arxiv, OPS, paper: { id: m[1], version: Number(m[2]) }, left: '', pdfjs: PDFJS, text, floatMatch, frame: rule1 })
          const left = anchorUnits(doc, texts, { bounds, floating, floatMatch, frame: rule1 })
          byFrame.set(frame, { layout: 'file' in out ? encodeLayout(out.file) : null, refused: 'file' in out ? null : out.refused, stats: out.stats, left })
        }
        const f = byFrame.get(frame)
        const side = leftSideOf({ doc, views: text.views, anchors: f.left, edges: text.edges, ...(columns ? { columns: tokenColumns } : {}) })
        const pages = []
        for (let p = 1; p <= text.pages; p++) pages.push(side.leftPages(p))
        const at = join(OUT, rule, id)
        if (f.layout) write(join(at, 'layout.json'), f.layout)
        else write(join(at, 'refusal.json'), JSON.stringify({ refused: f.refused }))
        write(join(at, 'stats.json'), JSON.stringify(f.stats))
        write(join(at, 'left.json'), plain([...f.left]))
        write(join(at, 'side.json'), plain({ units: side.units, pages }))
        runs.set(rule, { ...f, pages, units: byUnit(f.layout) })
        if (OF && existsSync(OF) && f.layout) for (const fx of readdirSync(OF).filter(fx => fx.startsWith(`${id}-`)).sort()) {
          const to = join(OUT, rule, 'fixtures', fx)
          mkdirSync(to, { recursive: true })
          writeFileSync(join(to, 'layout.json'), f.layout)
          for (const file of readdirSync(join(OF, fx))) if (file !== 'layout.json' && !existsSync(join(to, file))) symlinkSync(join(OF, fx, file), join(to, file))
        }
      }
    } finally { await task.destroy() }
    // against off, unit by unit
    const base = runs.get('off')
    const packSame = OF && base.layout ? readdirSync(OF).filter(fx => fx.startsWith(`${id}-`)).map(fx => readFileSync(join(OF, fx, 'layout.json'), 'utf8') === base.layout) : []
    for (const rule of rules) {
      const r = runs.get(rule)
      const leftMoved = [], leftPages = new Set()
      for (const [uid, a] of r.left) {
        const b = base.left.get(uid)
        if (plain(a?.rects ?? null) === plain(b?.rects ?? null)) continue
        leftMoved.push(uid)
        for (const x of [...(a?.rects ?? []), ...(b?.rects ?? [])]) leftPages.add(x.page)
      }
      const makerMoved = [], makerPages = new Set(), phFound = [], phLost = []
      for (const uid of new Set([...r.units.keys(), ...base.units.keys()])) {
        const a = r.units.get(uid), b = base.units.get(uid)
        if (rowsOf(a) === rowsOf(b)) continue
        makerMoved.push(uid)
        for (const p of [...(a?.pages ?? []), ...(b?.pages ?? [])]) makerPages.add(p)
        if ((a?.found ?? 0) !== (b?.found ?? 0)) phFound.push([uid, b?.found ?? 0, a?.found ?? 0])
        if ((a?.lost ?? 0) !== (b?.lost ?? 0)) phLost.push([uid, b?.lost ?? 0, a?.lost ?? 0])
      }
      const sidePages = [], pushed = []
      r.pages.forEach((part, i) => {
        const was = base.pages[i]
        if (plain(part) === plain(was)) return
        sidePages.push(i + 1)
        const a = inkOf(part), b = inkOf(was)
        if (a.length !== b.length) return
        for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) pushed.push([i + 1, k])
      })
      const s = r.stats, s0 = base.stats
      const moved = (x, y) => (x === y ? `${x}` : `${y} -> ${x}`)
      const row = {
        paper: id, rule,
        layout: r.layout ? 'file' : `refused ${r.refused}`, ...(rule === 'off' && OF ? { pack: packSame.length ? (packSame.every(Boolean) ? 'same' : 'differs') : 'none' } : {}),
        left: { units: leftMoved.length, pages: leftPages.size, of: [...r.left.values()].filter(Boolean).length },
        maker: { units: makerMoved.length, pages: makerPages.size, located: moved(s.units.located, s0.units.located) },
        ph: { found: moved(s.ph.found, s0.ph.found), lost: moved(s.ph.lost, s0.ph.lost), unitsFound: phFound.length, unitsLost: phLost.length },
        carried: moved(s.lines.carried, s0.lines.carried),
        side: { pages: sidePages.length, pushed: pushed.length, of: r.pages.length },
      }
      table.push(row)
      write(join(OUT, 'diff', `${id}-${rule}.json`), JSON.stringify({ ...row, leftMoved, leftPages: [...leftPages].sort((x, y) => x - y), makerMoved, makerPages: [...makerPages].sort((x, y) => x - y), phFound, phLost, sidePages, pushed }))
      console.log(`${id} ${rule.padEnd(7)} left ${row.left.units}u/${row.left.pages}p  maker ${row.maker.units}u/${row.maker.pages}p located ${row.maker.located}  ph found ${row.ph.found} (${phFound.length}u) LOST ${row.ph.lost} (${phLost.length}u)  carried ${row.carried}  side ${row.side.pages}p/${row.side.pushed} pushed${row.pack ? `  pack ${row.pack}` : ''}`)
    }
    console.log(`${id}: ${((performance.now() - t0) / 1000).toFixed(1)} s`)
  } catch (e) {
    failed++
    console.log(`FAIL ${id}: ${e?.stack ?? e}`)
  }
}
write(join(OUT, 'summary.json'), JSON.stringify({ engine: ENGINE, rules, rows: table }, null, 1))
console.log(`written: ${OUT}`)
process.exit(failed ? 1 : 0)

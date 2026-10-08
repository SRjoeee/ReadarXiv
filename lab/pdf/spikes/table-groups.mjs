// lab/pdf/spikes/table-groups.mjs
// The table groups' decision (src/pdf-reader/engine/translate/groups.mjs) over translations already made, nothing sent: the 29
// layer-lab fixtures' records (data/layer-fixtures/<id>v<n>-<target>/record.json, each of its paper's source in
// data/layout/<id>v<n>/source.gz) and a corpus sample — the corpus's papers whose table cells Microsoft has answered
// in earlier runs on this machine (data/runs/geometry-lock/<id>/microsoft.json, the units by index; out/highlight/
// papers/<id>/units.json, by source text; out/highlight/B*/ms-cache-*.json, Microsoft's answers by wire text), a paper
// counted where its answers cover half its cells to translate, and in it only the groups every cell of which has one.
//
// It prints, and writes to out/table-groups/measure.json:
//   - each column's share of cells that came back as they went (a name kept before asking counting as one), over the
//     fixtures and the sample apart: the histogram, and how many columns each threshold from 0.3 to 0.7 keeps — what
//     NAMES_SHARE is chosen by —, with the columns between 0.3 and 0.7 listed;
//   - per fixture and table, the cells whose state the decision changes (translated → kept), with --threshold=<share>
//     in place of NAMES_SHARE to see another;
//   - with --show=<fixture>:<table>,…, a table's cells before and after, in their grid's order.
// --captions: what names each fixture's floats, as the pipeline reads it from a compile of the translation
// (live.mjs CAPTIONS_PROBE, captionsOf): the fixture's translation set by its final's strategy, one pass natively in
// Docker (texlive/texlive:latest, no network), in out/table-groups/work/, deleted after; then each float label of arXiv's
// PDF ("Table 2:") looked for in the final the fixture holds (final.pdf, by pdftotext: PDF.js reads no text from the
// finals' CJK faces), named as the probe says — the target's name from the layout rules' labels (rules/layout-rules.json) where `target`, the
// original's where `source` —, with the original's number and punctuation. Written to out/table-groups/captions.json.
// --write=<dir> writes each fixture again as the pipeline now records it — record.json from the decided results through
// cache.mjs unitsOf, with every cell's group, and the captions where --captions read them —, beside links to the
// fixture's other files; and units.json, the translation as the layer takes it, where the engine has the layer's
// pieces (layer/pieces.mjs): the layer gate's --fixtures folder. Every file it writes is outside the repository's
// tracked files (out/ is git-ignored).
// --of=<folder> decides another folder's fixtures (a new cut's, made by spikes/layer-fixtures.mjs with --engine), their
// sources read by the engine given (--engine), and links to that folder's files.
//   pnpm exec tsx lab/pdf/spikes/table-groups.mjs [--threshold=<share>] [--show=…] [--captions] [--write=<dir>] [--engine=<worktree>] [--of=<folder>]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = new URL('..', import.meta.url).pathname
const REPO = resolve(root, '../..')
const argOf = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const ENGINE = resolve(argOf('engine') ?? REPO)
const engine = path => import(pathToFileURL(join(ENGINE, 'src/pdf-reader/engine', path)).href)
const { sourceHash, unitsOf, seedFrom } = await engine('pipeline/cache.mjs')
const { captionsOf, openPaper, translationFiles } = await engine('pipeline/live.mjs')
const { strategiesFor } = await engine('pipeline/scripts.mjs')
const { BUILTIN_RULES, resolveRules } = await engine('rules/layout.mjs')
const { unpackSource } = await engine('source/tar.mjs')
const { plainSource, plainTranslated, rehydrate, serialize, texEscape } = await engine('translate/mt.mjs')
const G = await engine('translate/groups.mjs')
const pieces = existsSync(join(ENGINE, 'src/pdf-reader/engine/layer/pieces.mjs')) ? await engine('layer/pieces.mjs') : null
const DATA = process.env.AXT_DATA ?? join(root, 'data')
/** the fixtures whose records are decided: the gate's fixed ones, or --of=<folder> (a cut's made fixtures, whose
 *  records are of that cut: spikes/layer-fixtures.mjs into another folder) */
const FIXTURES = argOf('of') ? resolve(argOf('of')) : join(DATA, 'layer-fixtures')
const OUT = join(root, 'out/table-groups')
const THRESHOLD = argOf('threshold') === null ? G.NAMES_SHARE : Number(argOf('threshold'))
const SHOW = new Set((argOf('show') ?? '').split(',').filter(Boolean))
const WRITE = argOf('write') ? resolve(argOf('write')) : null

const sourceOf = async file => openPaper((await unpackSource(new Uint8Array(readFileSync(file)))).files)
/** the decision at a threshold: groups.mjs's, its share compared again where --threshold names another */
const decide = (units, answer, kept) => {
  const d = G.decideGroups(units, answer, kept)
  if (THRESHOLD === G.NAMES_SHARE) return d
  const keep = new Set(), groups = new Map()
  for (const [g, x] of d.groups) {
    const decision = x.decision === 'names' || x.decision === 'translate' ? (!g.endsWith(':h') && x.same >= THRESHOLD * x.cells ? 'names' : 'translate') : x.decision
    groups.set(g, { ...x, decision })
    if (decision === 'names' || decision === 'untranslatable') for (const u of x.units) if (!kept.has(u)) keep.add(u)
  }
  return { keep, wait: d.wait, groups }
}
/** each data column's share of cells that came back as they went, and of those sent alone */
const sharesOf = (name, d, answer, kept) => {
  const out = []
  for (const [g, x] of d.groups) {
    if (g.endsWith(':h') || (x.decision !== 'names' && x.decision !== 'translate')) continue
    const sent = x.units.filter(u => !kept.has(u))
    const echoed = sent.filter(u => G.unchanged(plainSource(u), plainTranslated(answer(u).pieces)))
    out.push({ name, group: g, cells: x.cells, same: x.same, share: x.same / x.cells, sent: sent.length, echoed: echoed.length, sample: x.units.slice(0, 6).map(u => plainSource(u).slice(0, 24)) })
  }
  return out
}
const shown = (u, state, ps) => (state === 'whole' || state === 'partial' ? plainTranslated(ps) : plainSource(u))

// ---- the fixtures
const fixtures = []
const papers = new Map()
for (const name of readdirSync(FIXTURES).filter(n => /v\d+-[A-Za-z-]+$/.test(n) && existsSync(join(FIXTURES, n, 'record.json'))).sort()) {
  const [, id] = /^(.+v\d+)-([A-Za-z-]+)$/.exec(name)
  if (!papers.has(id)) { const paper = await sourceOf(join(DATA, 'layout', id, 'source.gz')); papers.set(id, { paper, hashes: await Promise.all(paper.units.map(sourceHash)) }) }
  const { paper, hashes } = papers.get(id)
  const record = JSON.parse(readFileSync(join(FIXTURES, name, 'record.json'), 'utf8'))
  if (record.units.length !== hashes.length || record.units.some((u, i) => u.hash !== hashes[i])) { console.log(`SKIP ${name}: the record is of another cut of the units`); continue }
  const units = paper.units
  const kept = new Set(units.filter((u, i) => record.units[i].state === 'kept'))
  const answer = u => { const r = record.units[units.indexOf(u)]; return r.state === 'kept' ? undefined : { state: r.state, pieces: r.pieces } }
  const d = decide(units, answer, kept)
  fixtures.push({ name, id, paper, record, kept, answer, d, hashes })
}

// ---- the corpus sample: Microsoft's answers this machine holds for the corpus's tables
const caches = ['out/highlight/B/ms-cache-zh.json', 'out/highlight/B3/ms-cache-zh-auto.json', 'out/highlight/B3/ms-cache-zh-en.json'].map(f => join(root, f)).filter(existsSync).map(f => JSON.parse(readFileSync(f, 'utf8')))
const byWire = wire => { for (const c of caches) { const a = c[wire]; if (a) return typeof a === 'string' ? a : a.text } return null }
const sample = []
const corpusIds = new Set([...(existsSync(join(DATA, 'runs/geometry-lock')) ? readdirSync(join(DATA, 'runs/geometry-lock')) : []), ...(existsSync(join(root, 'out/highlight/papers')) ? readdirSync(join(root, 'out/highlight/papers')) : [])])
for (const id of [...corpusIds].sort()) {
  const src = join(DATA, 'corpus', id, 'source.gz')
  if (!existsSync(src) || fixtures.some(f => f.id.replace(/v\d+$/, '') === id)) continue
  let paper
  try { paper = await sourceOf(src) } catch { continue }
  const units = paper.units, cells = units.filter(u => u.kind === 'cell' && u.cell && !paper.kept.has(u))
  if (!cells.length) continue
  const got = new Map()
  const ms = join(DATA, 'runs/geometry-lock', id, 'microsoft.json')
  if (existsSync(ms)) {
    // by index, where the run's untranslated pieces are the unit's own (the same cut)
    for (const r of JSON.parse(readFileSync(ms, 'utf8'))) {
      const u = units[r.id]
      if (u?.kind !== 'cell' || !r.pieces) continue
      const own = u.pieces.filter(p => p.t !== 'text').map(p => JSON.stringify(p)), theirs = r.pieces.filter(p => p.t !== 'text').map(p => JSON.stringify(p))
      if (own.join() === theirs.join()) got.set(u, r.pieces)
    }
  }
  const hl = join(root, 'out/highlight/papers', id, 'units.json')
  if (existsSync(hl)) {
    const bySrc = new Map(JSON.parse(readFileSync(hl, 'utf8')).filter(r => r.kind === 'cell' && r.tr).map(r => [r.src, r.tr]))
    for (const u of cells) if (!got.has(u) && bySrc.has(plainSource(u)) && !u.pieces.some(p => p.t !== 'text')) got.set(u, [{ t: 'text', tr: true, s: texEscape(bySrc.get(plainSource(u))) }])
  }
  for (const u of cells) {
    if (got.has(u)) continue
    const ser = serialize(u), text = byWire(ser.wire)
    if (text == null) continue
    const back = rehydrate(text, ser)
    if (!back.error) got.set(u, back.pieces)
  }
  // (a group with a cell unanswered waits, and is not measured: only the groups whose every cell has an answer count)
  if (got.size < 0.5 * cells.length) { console.log(`sample: ${id} left out, ${got.size} of its ${cells.length} cells answered`); continue }
  const answer = u => (got.has(u) ? { state: 'whole', pieces: got.get(u) } : undefined)
  const d = decide(units, answer, paper.kept)
  sample.push({ name: `${id}-zh`, paper, kept: paper.kept, answer, d, answered: got.size, cells: cells.length })
}

// ---- the threshold
const fixtureShares = fixtures.flatMap(f => sharesOf(f.name, f.d, f.answer, f.kept))
const sampleShares = sample.flatMap(f => sharesOf(f.name, f.d, f.answer, f.kept))
const hist = xs => { const h = Array(11).fill(0); for (const x of xs) h[Math.min(10, Math.floor(x.share * 10 + 1e-9))]++; return h }
const sweep = xs => Object.fromEntries([0.3, 0.4, 0.5, 0.6, 0.7].map(t => [t, xs.filter(x => x.same >= t * x.cells).length]))
console.log(`\n# the columns' shares of cells come back as they went (data columns of decided groups)`)
for (const [what, xs] of [['fixtures', fixtureShares], ['corpus sample', sampleShares]]) {
  console.log(`${what}: ${xs.length} columns; by tenths [0, .1) … [.9, 1), 1: ${hist(xs).join(' ')}; kept at a threshold of ${JSON.stringify(sweep(xs))}`)
  const near = xs.filter(x => x.share >= 0.3 && x.share <= 0.7)
  for (const x of near) console.log(`   ${x.share.toFixed(2)} ${x.name} ${x.group} (${x.same}/${x.cells}; of those sent ${x.echoed}/${x.sent}): ${x.sample.join(' | ')}`)
}
console.log(`sample: ${sample.map(s => `${s.name} (${s.answered}/${s.cells} cells answered)`).join(', ')}`)

// ---- the cells whose state changes, per fixture and table
console.log(`\n# the cells the decision changes, at ${THRESHOLD} (translated → kept: a column of names, or a group a cell of which the translator could not take)`)
const changes = []
for (const f of fixtures) {
  const byTable = new Map()
  for (const u of f.d.keep) { const t = u.cell.table; byTable.set(t, (byTable.get(t) ?? 0) + 1) }
  const waiting = [...f.d.groups.values()].filter(x => x.decision === 'waiting').length
  const decisions = {}
  for (const x of f.d.groups.values()) decisions[x.decision] = (decisions[x.decision] ?? 0) + 1
  changes.push({ name: f.name, changed: f.d.keep.size, byTable: Object.fromEntries(byTable), decisions, waiting })
  console.log(`${f.name}: ${f.d.keep.size} cells${byTable.size ? ` (${[...byTable].map(([t, n]) => `table ${t}: ${n}`).join(', ')})` : ''}; groups ${JSON.stringify(decisions)}`)
}
console.log(`total: ${changes.reduce((a, c) => a + c.changed, 0)} cells in ${changes.filter(c => c.changed).length} of ${changes.length} fixtures`)

// ---- tables before and after
for (const want of SHOW) {
  const [name, t] = want.split(':')
  const f = fixtures.find(x => x.name === name)
  if (!f) { console.log(`--show: no fixture ${name}`); continue }
  const units = f.paper.units
  const cells = units.map((u, i) => [u, i]).filter(([u]) => u.cell?.table === Number(t)).sort(([a], [b]) => a.cell.row - b.cell.row || a.cell.col - b.cell.col)
  console.log(`\n# ${name}, table ${t}: unit, group, decision, before → after`)
  for (const [u, i] of cells) {
    const r = f.record.units[i], g = G.groupOf(u), x = f.d.groups.get(g)
    const after = f.d.keep.has(u) || r.state === 'kept' ? 'kept' : r.state
    console.log(`  ${i} ${g} ${x?.decision}: ${JSON.stringify(shown(u, r.state, r.pieces))} [${r.state}] → ${JSON.stringify(shown(u, after, r.pieces))} [${after}]`)
  }
}

// ---- what names the floats: the pipeline's probe, against the finals
const captions = new Map()
if (process.argv.includes('--captions')) {
  console.log('\n# what names the floats: the probe of a compile of the translation, and the labels of the final the fixture holds')
  const work = join(OUT, 'work')
  const text = file => execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', maxBuffer: 1 << 26 })
  const quote = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // a float's label where a line or a column of it starts: its name, its number, its punctuation
  const labelsIn = (t, names) => [...t.matchAll(new RegExp(`(?:^|\\s{2,})(${names.map(quote).join('|')})[ \\t]*([0-9]+|[IVXL]+)[ \\t]*([.:\\uff1a\\uff0e])`, 'gmu'))].map(m => ({ name: m[1], n: m[2], sep: m[3] }))
  const ORIGINAL = ['Figure', 'Fig.', 'FIGURE', 'FIG.', 'Table', 'TABLE']
  let failed = 0
  for (const f of fixtures) {
    const meta = JSON.parse(readFileSync(join(FIXTURES, f.name, 'final.json'), 'utf8'))
    const target = /-([A-Za-z-]+)$/.exec(f.name)[1]
    const strategy = strategiesFor(f.paper.meta, target).find(x => x.name === meta.strategy)
    if (!strategy) { console.log(`FAIL ${f.name}: no strategy ${meta.strategy}`); failed++; continue }
    const dir = join(work, f.name)
    rmSync(dir, { recursive: true, force: true })
    const files = translationFiles(f.paper, new Map(), { strategy, fonts: { rm: 'cmr', sf: 'cmss', tt: 'cmtt', body: 'cmr' }, draft: true })
    for (const [p, b] of [...f.paper.fsys.list().map(p => [p, f.paper.fsys.read(p)]), ...files]) { const file = join(dir, p); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, b) }
    const main = f.paper.project.main
    // (Docker's file sharing takes the folder by its real path: out/ may be a link to another tree's)
    execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${realpathSync(dir)}:/work`, '-w', '/work', 'texlive/texlive:latest', 'sh', '-c', `timeout 300 ${strategy.engine} -interaction=nonstopmode ${main} >/dev/null 2>&1; true`])
    const logFile = join(dir, main.replace(/\.tex$/, '.log').split('/').pop())
    const said = existsSync(logFile) ? captionsOf(readFileSync(logFile, 'latin1')) : null
    rmSync(dir, { recursive: true, force: true })
    captions.set(f.name, said)
    const c = resolveRules(BUILTIN_RULES, target).labels
    const orig = labelsIn(text(join(FIXTURES, f.name, 'arxiv.pdf')), ORIGINAL)
    const kindOf = l => (/^t/i.test(l.name) ? 'table' : 'figure')
    const want = orig.map(l => ({ ...l, name: said?.[kindOf(l)] === 'target' ? c[kindOf(l)] : l.name }))
    const got = labelsIn(text(join(FIXTURES, f.name, 'final.pdf')), [...new Set([c.figure, c.table, ...ORIGINAL])])
    const key = l => `${l.name} ${l.n}${l.sep}`
    const finals = new Set(got.map(key)), missing = want.filter(l => !finals.has(key(l)))
    // a float whose label the final prints otherwise, under another name or punctuation: one not found as expected,
    // found so (a body's "Fig. 4." at a column's start is the prose's, beside the caption's label found as expected)
    const kindGot = l => (l.name === c.table || /^t/i.test(l.name) ? 'table' : 'figure')
    const other = got.filter(l => !want.some(w => key(w) === key(l)) && missing.some(m => m.n === l.n && kindOf(orig[want.indexOf(m)]) === kindGot(l)))
    const ok = !!said && !other.length
    if (!ok) failed++
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${f.name}: the probe says figure ${said?.figure}, table ${said?.table}; ${new Set(orig.map(key)).size} labels in the original, ${new Set(want.map(key)).size - new Set(missing.map(key)).size} found so in the final${missing.length ? ` (not found by pdftotext: ${[...new Set(missing.map(key))].join(', ')})` : ''}${other.length ? `; printed otherwise: ${[...new Set(other.map(key))].join(', ')}` : ''}; e.g. ${[...new Set(got.map(key))].slice(0, 3).join(' | ')}`)
  }
  console.log(`captions: ${fixtures.length - failed} of ${fixtures.length} fixtures as their finals print them`)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'captions.json'), JSON.stringify(Object.fromEntries(captions), null, 1))
}

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'measure.json'), JSON.stringify({ threshold: THRESHOLD, fixtures: fixtureShares, sample: sampleShares, changes, samplePapers: sample.map(s => ({ name: s.name, answered: s.answered, cells: s.cells })) }, null, 1))

// ---- the fixtures as the pipeline now records them
if (WRITE) {
  for (const f of fixtures) {
    const dir = join(WRITE, f.name)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const units = f.paper.units
    // the record's results as runLive would leave them: a group kept whole kept, with its translation; one waiting set
    // in the source (its translation the next run's)
    const results = new Map()
    f.record.units.forEach((r, i) => {
      if (r.state === 'kept' && !r.pieces) return
      const { kind: _k, src: _s, hash: _h, title: _t, depth: _d, lead: _l, trail: _tr, inner: _in, tr: _x, group: _g, ...res } = r
      if (f.d.keep.has(units[i])) { const { sentences: _, inSource: __, ...rest } = res; results.set(i, { ...rest, state: 'kept' }) }
      else results.set(i, f.d.wait.has(units[i]) ? { ...res, inSource: true } : res)
    })
    const said = captions.get(f.name) ?? (existsSync(join(OUT, 'captions.json')) ? JSON.parse(readFileSync(join(OUT, 'captions.json'), 'utf8'))[f.name] : null)
    const record = { ...(said ? { captions: said } : {}), units: unitsOf(units, f.kept, f.hashes, results) }
    writeFileSync(join(dir, 'record.json'), JSON.stringify(record))
    if (pieces) {
      // the translation as the layer takes it (spikes/layer-fixtures.mjs layerUnits): a unit kept is not the layer's
      const { seed } = await seedFrom(record, units)
      const layerUnits = [], unread = []
      for (const [i, s] of [...seed].sort((a, b) => a[0] - b[0])) {
        if (s.state === 'kept' || record.units[i].state === 'kept') continue
        const ps = pieces.trPiecesOf(s.pieces, pieces.kOfSource(units[i].pieces))
        if (!ps) { unread.push(i); continue }
        const tr = s.sentences?.tr
        layerUnits.push({ id: i, pieces: ps, sentences: Array.isArray(tr) ? [...tr] : null, state: s.state, by: s.by ?? null, ...(record.units[i].group ? { group: record.units[i].group } : {}) })
      }
      const had = JSON.parse(readFileSync(join(FIXTURES, f.name, 'units.json'), 'utf8'))
      const states = {}
      for (const u of record.units) states[u.state] = (states[u.state] ?? 0) + 1
      writeFileSync(join(dir, 'units.json'), JSON.stringify({ ...had, made: new Date().toISOString(), groups: 'table groups decided (spikes/table-groups.mjs)', ...(said ? { captions: said } : {}), states, unread, units: layerUnits }))
    }
    for (const file of readdirSync(join(FIXTURES, f.name))) if (!existsSync(join(dir, file))) symlinkSync(join(FIXTURES, f.name, file), join(dir, file))
  }
  console.log(`\nwritten: ${fixtures.length} fixtures in ${WRITE}${pieces ? '' : ' (no units.json: the engine has no layer/pieces.mjs)'}`)
}

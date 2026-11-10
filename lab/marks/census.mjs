// lab/marks/census.mjs <out> [--census=<file>] [--write]: the marks' equivalence gate judged against its census, the classes
// of difference its owners read and accepted (lab/marks/census.json: each class's count, its count on each paper, three
// examples, and a note where the class's name does not say all of its cause). <out> is a gate's output, one <id>.json a paper
// (lab/marks/replay.mjs, gate.mjs). Exit 0 where the totals and every class on every paper are the census's; 1 otherwise,
// with each difference named: a class the census does not hold, a count that moved, a paper that moved. The compiles'
// counts and times are no part of it. --write: the census made from <out>, carrying the notes of the classes it keeps (after
// the owner has read every difference the check named). Not shipped.
import { fileURLToPath } from 'node:url'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const OUT = process.argv.slice(2).find(a => !a.startsWith('--'))
if (!OUT) {
  console.error('usage: node lab/marks/census.mjs <out> [--census=<file>] [--write]')
  process.exit(2)
}
const FILE = arg('census') ?? fileURLToPath(new URL('census.json', import.meta.url))

/** the run's totals and classes, every paper's count of each */
function runOf(dir) {
  const totals = { papers: 0, noB: [], pages: { today: 0, same: 0 }, glyphs: { compared: 0, same: 0 }, boxes: { compared: 0, same: 0 }, perfect: 0 }
  const classes = new Map()
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'summary.json').sort()) {
    const r = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    if (r.why) { totals.noB.push(`${r.id}: ${r.why}`); continue }
    totals.papers++
    for (const k of ['pages', 'glyphs', 'boxes']) for (const s of Object.keys(totals[k])) totals[k][s] += r[k][s]
    if (r.glyphs.same === r.glyphs.compared && r.boxes.same === r.boxes.compared && r.pages.same === r.pages.today) totals.perfect++
    for (const [cls, v] of Object.entries(r.classes ?? {})) {
      const c = classes.get(cls) ?? classes.set(cls, { cls, n: 0, papers: {}, byPaper: [] }).get(cls)
      c.n += v.n
      c.papers[r.id] = v.n
      c.byPaper.push({ id: r.id, n: v.n, ex: v.ex })
    }
  }
  // (three examples a class, one a paper in turn, the papers by their count)
  for (const c of classes.values()) {
    const by = c.byPaper.sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1))
    c.ex = []
    for (let i = 0; c.ex.length < 3 && by.some(p => p.ex.length > i); i++) for (const p of by) if (p.ex[i] && c.ex.length < 3) c.ex.push({ id: p.id, ...p.ex[i] })
    delete c.byPaper
  }
  return { totals, classes: [...classes.values()].sort((a, b) => b.n - a.n || (a.cls < b.cls ? -1 : 1)) }
}

const run = runOf(OUT)
const old = (() => {
  try {
    return JSON.parse(readFileSync(FILE, 'utf8'))
  } catch {
    return null
  }
})()
if (process.argv.includes('--write')) {
  const notes = new Map((old?.classes ?? []).filter(c => c.note).map(c => [c.cls, c.note]))
  const census = { of: old?.of ?? null, judged: old?.judged ?? [], totals: run.totals, classes: run.classes.map(c => (notes.has(c.cls) ? { ...c, note: notes.get(c.cls) } : c)) }
  writeFileSync(FILE, `${JSON.stringify(census, null, 1)}\n`)
  console.log(`census written: ${FILE}, ${census.classes.length} classes`)
  process.exit(0)
}
if (!old) {
  console.error(`no census at ${FILE}`)
  process.exit(2)
}

const diffs = []
for (const [k, v] of Object.entries(old.totals)) if (JSON.stringify(v) !== JSON.stringify(run.totals[k])) diffs.push(`totals.${k}: census ${JSON.stringify(v)}, run ${JSON.stringify(run.totals[k])}`)
const mine = new Map(run.classes.map(c => [c.cls, c]))
const theirs = new Map(old.classes.map(c => [c.cls, c]))
const papersOf = p => Object.entries(p).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n}`).join(', ')
for (const [cls, c] of theirs) {
  const m = mine.get(cls)
  if (!m) { diffs.push(`gone: ${c.n} × ${cls} (census: ${papersOf(c.papers)})`); continue }
  const moved = [...new Set([...Object.keys(c.papers), ...Object.keys(m.papers)])].filter(id => c.papers[id] !== m.papers[id]).sort()
  if (m.n !== c.n || moved.length) diffs.push(`moved: ${cls}: census ${c.n}, run ${m.n}; ${moved.map(id => `${id} ${c.papers[id] ?? 0} -> ${m.papers[id] ?? 0}`).join(', ')}`)
}
for (const [cls, m] of mine) if (!theirs.has(cls)) diffs.push(`new: ${m.n} × ${cls} (${papersOf(m.papers)}; e.g. ${JSON.stringify(m.ex[0])})`)
const t = run.totals
const line = `${t.papers} papers, glyphs ${t.glyphs.same} of ${t.glyphs.compared} alike, boxes ${t.boxes.same} of ${t.boxes.compared}, ${run.classes.length} classes`
if (diffs.length) {
  console.log(`census: FAIL: ${line}; ${diffs.length} differences from the census (${FILE}):`)
  for (const d of diffs) console.log(`  ${d}`)
  process.exit(1)
}
console.log(`census: PASS: ${line}, every class on every paper as the census`)

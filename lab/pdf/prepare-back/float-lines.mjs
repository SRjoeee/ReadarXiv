// lab/pdf/prepare-back/float-lines.mjs: the float lines of a stage 1a run (corpus.sh's <out>), beside its orphan letters. A float
// line is a line TeX set inside a counted float that no unit owns, which the ledger reads as its float's text by its depth alone
// (packages/engine/src/locate/ledger.ts, PDF-READER §18.45): counted, not gated, so that a miss is seen. Each paper's count
// and its letters, by why no unit owns it as far as the ledger knows (`code` an algorithm's float or a code region, `cells` a cell
// table's text no cell owns, `nocells` a table read with no cell, `other`), and its orphan letters (the letters no unit owns once
// the ink units own theirs: invariant (o)'s, which v2's stage 1a stated nowhere before); the total; and, against a baseline of
// counts (--baseline), each paper whose counts moved and the total's move. Reads <out>/located/<id>.json (`stats.made.ledger`,
// `floatLines`); --lines prints each listed line (a paper's words: on the terminal, never into a record). --write=<file> writes
// the run's counts as a baseline: counts and kinds only, never a line's text.
//   node lab/pdf/prepare-back/float-lines.mjs <out> [--baseline=<counts.json>] [--write=<counts.json>] [--label=<what the run is>] [--lines]
// Exit 0 (a report, not a gate), 2 where the run holds no located file or a paper's ledger counts are missing (a run of before).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const argOf = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const OUT = process.argv.slice(2).find(a => !a.startsWith('--'))
if (!OUT) { console.error('usage: float-lines.mjs <out> [--baseline=<counts.json>] [--write=<counts.json>] [--label=<label>] [--lines]'); process.exit(2) }
const WHY = ['code', 'cells', 'nocells', 'other']
const dir = join(OUT, 'located')
const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')).sort() : []
if (!files.length) { console.error(`no located files in ${dir}`); process.exit(2) }

const papers = {}, missing = []
for (const f of files) {
  const id = f.slice(0, -5), L = JSON.parse(readFileSync(join(dir, f), 'utf8'))
  const c = L.stats?.made?.ledger
  if (L.refused || !L.stats) continue
  if (!c) { missing.push(id); continue }
  papers[id] = { lines: c.floatLines, letters: c.floatLetters, why: Object.fromEntries(WHY.map(w => [w, c.floatWhy?.[w] ?? 0])), orphanLetters: c.orphanLetters }
  if (process.argv.includes('--lines')) for (const l of L.floatLines ?? []) console.log(JSON.stringify({ id, ...l }))
}
if (missing.length) { console.error(`no ledger counts (a run of before the float lines): ${missing.join(' ')}`); process.exit(2) }

const totalOf = ps => {
  const t = { papers: 0, lines: 0, letters: 0, why: Object.fromEntries(WHY.map(w => [w, 0])), orphanPapers: 0, orphanLetters: 0 }
  for (const p of Object.values(ps)) {
    if (p.lines) t.papers++
    t.lines += p.lines; t.letters += p.letters
    for (const w of WHY) t.why[w] += p.why[w]
    if (p.orphanLetters) t.orphanPapers++
    t.orphanLetters += p.orphanLetters
  }
  return t
}
const total = totalOf(papers)
const row = (id, p) => `${id.padEnd(14)} ${String(p.lines).padStart(5)} ${String(p.letters).padStart(7)} ${WHY.map(w => String(p.why[w]).padStart(7)).join(' ')} ${String(p.orphanLetters).padStart(8)}`
console.log(`float lines of ${OUT} (${Object.keys(papers).length} papers)`)
console.log(`${'paper'.padEnd(14)} ${'lines'.padStart(5)} ${'letters'.padStart(7)} ${WHY.map(w => w.padStart(7)).join(' ')} ${'orphans'.padStart(8)}`)
for (const [id, p] of Object.entries(papers)) if (p.lines || p.orphanLetters) console.log(row(id, p))
console.log(row('total', total))
console.log(`float lines ${total.lines} in ${total.papers} papers (${total.letters} letters; ${WHY.map(w => `${w} ${total.why[w]}`).join(', ')}); orphan letters ${total.orphanLetters} in ${total.orphanPapers} papers`)

const BASE = argOf('baseline')
if (BASE) {
  const base = JSON.parse(readFileSync(BASE, 'utf8')), bp = base.papers ?? {}
  const zero = { lines: 0, letters: 0, why: Object.fromEntries(WHY.map(w => [w, 0])), orphanLetters: 0 }
  const moved = []
  for (const id of [...new Set([...Object.keys(bp), ...Object.keys(papers)])].sort()) {
    const a = bp[id] ?? zero, b = papers[id] ?? zero
    if (!(id in papers)) continue
    const d = [`lines ${a.lines} -> ${b.lines}`, ...WHY.filter(w => a.why[w] !== b.why[w]).map(w => `${w} ${a.why[w]} -> ${b.why[w]}`)]
    if (a.lines !== b.lines || WHY.some(w => a.why[w] !== b.why[w]) || a.orphanLetters !== b.orphanLetters) moved.push(`  ${id}: ${d.join(', ')}${a.orphanLetters !== b.orphanLetters ? `, orphan letters ${a.orphanLetters} -> ${b.orphanLetters}` : ''}`)
  }
  // (the baseline's total over the papers this run holds: a run of a few papers is compared with them alone)
  const t0 = totalOf(Object.fromEntries(Object.entries(bp).filter(([id]) => id in papers)))
  console.log(`against ${BASE} (${base.label ?? 'no label'}): float lines ${t0.lines} -> ${total.lines} (${total.lines - t0.lines >= 0 ? '+' : ''}${total.lines - t0.lines}), papers ${t0.papers} -> ${total.papers}; ${WHY.map(w => `${w} ${t0.why[w]} -> ${total.why[w]}`).join(', ')}; orphan letters ${t0.orphanLetters} -> ${total.orphanLetters}`)
  console.log(moved.length ? `moved (${moved.length} papers):\n${moved.join('\n')}` : 'moved: none')
}
const WRITE = argOf('write')
if (WRITE) {
  // (a paper a line)
  const head = JSON.stringify({ format: 'float-lines 1', label: argOf('label') ?? OUT, why: WHY, total })
  const rows = Object.entries(papers).map(([id, p]) => `  ${JSON.stringify(id)}: ${JSON.stringify(p)}`)
  writeFileSync(WRITE, `${head.slice(0, -1)},\n "papers": {\n${rows.join(',\n')}\n }\n}\n`)
  console.log(`wrote ${WRITE}`)
}
process.exit(0)

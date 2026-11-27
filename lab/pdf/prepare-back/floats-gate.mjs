// lab/pdf/prepare-back/floats-gate.mjs <out> [--json=<file>]: the link targets' gate over a corpus run (run.mjs's located dumps,
// <out>/located/<id>.json, each its `linkTargets`: link-targets.mjs). Not shipped.
// The gate (docs/PDF-READER.md §20.5, the lead's rulings of 2026-11-27 and 2026-11-28): no box a head's target states wrong, 0
// over the corpus, of any kind. A stated box is wrong where the bundle's own parts read it so (link-targets.mjs `wrong`,
// boxesWrongOf: its own ink outside it, its own ink untold, another member's ink in it; a heading's window holds its section by
// design), or, a float's, where the engine counts another's glyph inside it, ink none of its own crossing its edge or ink of its
// own members outside it (locate/floats.ts `foreign`, `cut`, `outside`). A boxed float no target states is counted apart, never
// judged. And no stated landing wrong (a landing the engine's own evidence contradicts is never stated): a page anchor, one
// another member's left edge at its point contradicts, one whose name's claim is another kind, one whose name claims nothing and
// no edge confirms. Exit 1 on any, or where no paper states a record. The share of the figures and tables of a bracket that got
// a box is reported by type with the cause of each miss, never gated; so are the landings by proof (proved by the edge, by
// their name's kind alone), the refusals by kind and cause (the evidence's, and a box's that cannot hold its member whole), the
// destinations landed nowhere, the targets' size and the phases' time.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const quantile = (xs, q) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}

/** the gate over each paper's record ([id, linkTargets, ms?]) */
export function gateOf(records) {
  const byType = {}
  const wrongRows = []
  const dests = { papers: 0, keys: 0, resolved: 0, nowhere: 0, landed: {}, named: {} }
  const disagree = []
  const edge = []
  const landingWrong = []
  const proof = {}
  const refusedBy = {}
  const sizes = []
  let boxedUnstated = 0
  const wrongBy = {}
  for (const [id, r] of records) {
    for (const f of r.floats) {
      const t = (byType[f.type ?? '(none)'] ??= { bracketed: 0, boxed: 0, causes: {} })
      if (f.serial >= 0) t.bracketed++
      if (f.box) t.boxed++
      else t.causes[f.cause] = (t.causes[f.cause] ?? 0) + 1
      // (a boxed float no target states: counted apart, never judged)
      if (f.box && !f.stated) boxedUnstated++
      else if (f.box && (f.foreign > 0 || f.cut > 0 || f.outside > 0)) wrongRows.push({ id, serial: f.serial, page: f.page, kind: 'float', why: 'engine counts', foreign: f.foreign, cut: f.cut, outside: f.outside })
    }
    for (const w of r.wrong ?? []) wrongRows.push({ id, ...w })
    if (r.dests?.keys !== undefined) {
      dests.papers++
      dests.keys += r.dests.keys
      dests.resolved += r.dests.resolved
      dests.nowhere += r.dests.nowhere
      for (const [k, n] of Object.entries(r.dests.landed ?? {})) dests.landed[k] = (dests.landed[k] ?? 0) + n
      for (const [k, n] of Object.entries(r.dests.named ?? {})) {
        const d = (dests.named[k] ??= { keys: 0, landed: 0 })
        d.keys += n.keys
        d.landed += n.landed
      }
    }
    for (const d of r.disagree ?? []) disagree.push([id, ...d])
    for (const d of r.edge ?? []) edge.push([id, ...d])
    // (every stated landing the evidence contradicts or does not prove: wrong, the gate's other half)
    for (const [why, rows] of [['page', r.pages], ['edge', r.edge], ['name', r.disagree], ['unproven', r.unproven]])
      for (const x of rows ?? []) landingWrong.push({ id, why, dest: x[0], kind: x[1] })
    for (const [k, p] of Object.entries(r.proof ?? {})) {
      const t = (proof[k] ??= { proved: 0, kindOnly: 0, wrong: 0 })
      for (const f of ['proved', 'kindOnly', 'wrong']) t[f] += p[f]
    }
    for (const [k, c] of Object.entries(r.dests?.refused ?? {})) {
      const t = (refusedBy[k] ??= {})
      for (const [cause, n] of Object.entries(c)) t[cause] = (t[cause] ?? 0) + n
    }
    if (r.bytes?.targetsGzip !== undefined) sizes.push(r.bytes)
  }
  for (const w of wrongRows) {
    const k = (wrongBy[w.kind ?? 'float'] ??= {})
    k[w.why] = (k[w.why] ?? 0) + 1
  }
  const share = (t) => (byType[t]?.bracketed ? byType[t].boxed / byType[t].bracketed : null)
  return {
    // (and some paper states a record: a run whose dumps hold none, made before the targets, checks nothing)
    pass: wrongRows.length === 0 && landingWrong.length === 0 && records.length > 0,
    wrong: wrongRows.length,
    wrongBy,
    wrongRows,
    boxedUnstated,
    landingsWrong: landingWrong.length,
    landingWrong,
    proof,
    refused: refusedBy,
    byType,
    shares: { figure: share('figure'), table: share('table') },
    dests,
    disagree,
    edge,
    bytes: {
      papers: sizes.length,
      targetsGzip: { p50: quantile(sizes.map((b) => b.targetsGzip), 0.5), p95: quantile(sizes.map((b) => b.targetsGzip), 0.95), max: Math.max(0, ...sizes.map((b) => b.targetsGzip)) },
      targetsRaw: { p50: quantile(sizes.map((b) => b.targets), 0.5), p95: quantile(sizes.map((b) => b.targets), 0.95), max: Math.max(0, ...sizes.map((b) => b.targets)) },
      headGzipAdded: { p50: quantile(sizes.map((b) => b.head - b.headBare), 0.5), p95: quantile(sizes.map((b) => b.head - b.headBare), 0.95), max: Math.max(0, ...sizes.map((b) => b.head - b.headBare)) },
    },
  }
}

if (process.argv[1] === import.meta.filename) {
  const out = process.argv[2]
  if (!out) {
    console.error('floats-gate.mjs <out> [--json=<file>]')
    process.exit(2)
  }
  const dir = join(out, 'located')
  const records = []
  const ms = { dests: [], floats: [], targets: [] }
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const d = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    if (!d.linkTargets) continue
    records.push([d.id, d.linkTargets])
    if (d.ms?.dests !== undefined) ms.dests.push(d.ms.dests)
    if (d.linkMs) {
      ms.floats.push(d.linkMs.floats)
      ms.targets.push(d.linkMs.targets)
    }
  }
  const g = gateOf(records)
  const time = Object.fromEntries(Object.entries(ms).map(([k, v]) => [k, { p50: quantile(v, 0.5), p95: quantile(v, 0.95), max: Math.max(0, ...v) }]))
  const json = process.argv.find((a) => a.startsWith('--json='))?.slice(7)
  if (json) writeFileSync(json, `${JSON.stringify({ papers: records.length, ...g, ms: time }, null, 1)}\n`)
  console.log(JSON.stringify({ papers: records.length, pass: g.pass, wrong: g.wrong, wrongBy: g.wrongBy, boxedUnstated: g.boxedUnstated, shares: g.shares, byType: g.byType, dests: { ...g.dests, named: undefined }, disagree: g.disagree.length, landingsWrong: g.landingsWrong, proof: g.proof, refused: g.refused, edge: g.edge.length, bytes: g.bytes, ms: time }))
  for (const w of [...g.wrongRows, ...g.landingWrong].slice(0, 20)) console.log('WRONG', JSON.stringify(w))
  process.exit(g.pass ? 0 : 1)
}

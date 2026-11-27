// lab/pdf/prepare-back/floats-gate.mjs <out> [--json=<file>]: the link targets' gate over a corpus run (run.mjs's located dumps,
// <out>/located/<id>.json, each its `linkTargets`: link-targets.mjs). Not shipped.
// The gate (docs/PDF-READER.md §20.3, the lead's ruling of 2026-11-27): no boxed float wrong, 0 over the corpus. A boxed float is
// wrong where the engine counts another's glyph inside its box, ink none of its own crossing its edge or ink of its own members
// outside it (locate/floats.ts `foreign`, `cut`, `outside`), or where the bundle's own parts show a member of its own with ink
// outside the box or another member's text meeting it (link-targets.mjs `wrong`). Exit 1 on any. The share of the figures and
// tables of a bracket that got a box is reported by type with the cause of each miss, never gated; so are the destinations
// (landed by kind, nowhere, each landing whose kind its hyperref name does not say), the targets' size and the phases' time.
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
  const sizes = []
  for (const [id, r] of records) {
    for (const f of r.floats) {
      const t = (byType[f.type ?? '(none)'] ??= { bracketed: 0, boxed: 0, causes: {} })
      if (f.serial >= 0) t.bracketed++
      if (f.box) t.boxed++
      else t.causes[f.cause] = (t.causes[f.cause] ?? 0) + 1
      if (f.box && (f.foreign > 0 || f.cut > 0 || f.outside > 0)) wrongRows.push({ id, serial: f.serial, page: f.page, why: 'engine counts', foreign: f.foreign, cut: f.cut, outside: f.outside })
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
    if (r.bytes?.targetsGzip !== undefined) sizes.push(r.bytes)
  }
  const share = (t) => (byType[t]?.bracketed ? byType[t].boxed / byType[t].bracketed : null)
  return {
    pass: wrongRows.length === 0,
    wrong: wrongRows.length,
    wrongRows,
    byType,
    shares: { figure: share('figure'), table: share('table') },
    dests,
    disagree,
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
  console.log(JSON.stringify({ papers: records.length, pass: g.pass, wrong: g.wrong, shares: g.shares, byType: g.byType, dests: { ...g.dests, named: undefined }, disagree: g.disagree.length, bytes: g.bytes, ms: time }))
  for (const w of g.wrongRows.slice(0, 20)) console.log('WRONG', JSON.stringify(w))
  process.exit(g.pass ? 0 : 1)
}

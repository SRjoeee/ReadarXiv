// Open measurement 3 of interfaces/translate/DECISION.md: whether one re-ask helps Microsoft or only costs calls (the LLM
// probe's re-ask fixed 48 of 57; Microsoft's free endpoint may answer a text the same way twice). The store keeps only
// accepted replies, so the measure needs a trace: every request and reply of a chain run with Microsoft's `reask: 1`,
// written by `traced(fetch, sink)` around the Worker's fetch on staging (one JSON line per request: its wires and the
// endpoint's items). From the trace and the paper's units this script counts the units refused on their first answer,
// those a re-ask fixed, and what the re-asks cost. With no trace it runs on a scripted endpoint (no network): one that
// answers the same twice, and one that answers right the second time, so the counting itself is shown.
// Run: npx tsx lab/translate/measure/reask.ts [--bundle <dir> --trace <trace.jsonl>]
import { readFileSync } from 'node:fs'
import { accept, chainOf, type Fetch, type FetchInit, microsoft, type Result, type UnitIn } from '../../../packages/translate/src/index.ts'
import { paperOf } from './bundle.ts'

export type TraceLine = { wires: string[]; items: unknown }
/** a fetch that writes each Microsoft request's wires and the endpoint's items to `sink` (for staging) */
export function traced(fetch: Fetch, sink: (line: TraceLine) => void): Fetch {
  return async (url, init) => {
    const reply = await fetch(url, init)
    const body = await reply.text()
    try {
      sink({ wires: JSON.parse(init.body) as string[], items: JSON.parse(body) })
    } catch {
      // a reply that is not JSON is the chain's to judge
    }
    return { ok: reply.ok, status: reply.status, headers: reply.headers, text: async () => body }
  }
}

/** the counts of a trace over a paper's units */
export function countReasks(units: readonly UnitIn[], trace: readonly TraceLine[]) {
  const t = microsoft({ fetch: async () => Promise.reject(new Error('no network')) })
  const byWire = new Map<string, UnitIn>()
  for (const u of units) byWire.set(t.write(u, 'zh-Hans'), u)
  const answers = new Map<string, { raw: string; alone: boolean }[]>()
  for (const line of trace) {
    if (!Array.isArray(line.items)) continue
    line.wires.forEach((w, i) => {
      const tr = (line.items as { translations?: { text?: string }[] }[])[i]?.translations?.[0]
      if (typeof tr?.text !== 'string') return
      const list = answers.get(w) ?? []
      list.push({ raw: JSON.stringify({ text: tr.text }), alone: line.wires.length === 1 })
      answers.set(w, list)
    })
  }
  let asked = 0
  let refusedFirst = 0
  let reasked = 0
  let fixed = 0
  let sameAgain = 0
  let extraChars = 0
  for (const [w, list] of answers) {
    const u = byWire.get(w)
    if (!u || !list.length) continue
    asked++
    const ok = (raw: string) => {
      const r = t.read(u, raw)
      return !!r && accept(u, r.content).ok
    }
    const [first, again] = list as [{ raw: string }, { raw: string; alone: boolean } | undefined]
    if (ok(first.raw)) continue
    refusedFirst++
    if (!again?.alone) continue
    reasked++
    extraChars += w.length
    if (again.raw === first.raw) sameAgain++
    if (ok(again.raw)) fixed++
  }
  return { asked, refusedFirst, reasked, fixedByReask: fixed, answeredTheSameAgain: sameAgain, reaskCalls: reasked, reaskChars: extraChars }
}

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
if (arg('trace')) {
  const paper = paperOf(arg('bundle'))
  const trace = readFileSync(arg('trace') as string, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as TraceLine)
  console.log(JSON.stringify(countReasks(paper.units, trace), null, 1))
} else {
  // the scripted endpoint: every unit's first answer loses its first marker; the second is either the same or whole
  const units = paperOf(undefined, 60).units
  for (const second of ['the same', 'whole'] as const) {
    const trace: TraceLine[] = []
    const seen = new Set<string>()
    const endpoint: Fetch = async (_url: string, init: FetchInit) => {
      const texts = JSON.parse(init.body) as string[]
      const items = texts.map(w => {
        const again = seen.has(w)
        seen.add(w)
        const text = again && second === 'whole' ? w : w.replace(/@[a-z]+#/, '')
        return { translations: [{ text }] }
      })
      const body = JSON.stringify(items)
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => body }
    }
    const t = microsoft({ fetch: traced(endpoint, line => trace.push(line)), limits: { reask: 1 } })
    const rs: Result[] = []
    for await (const r of chainOf().translate(units, 'zh-Hans', { translators: [t] })) rs.push(r)
    console.log(JSON.stringify({ scripted: `the second answer ${second}`, ...countReasks(units, trace) }))
  }
}

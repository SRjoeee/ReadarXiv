// Open measurement 1 of interfaces/translate/DECISION.md: the cost of reading a whole paper's stored replies again (design
// A's first doubt: raw replies are the only cache, judged again on every use). A paper's units are translated once to fill
// a store (from a dump of a real store where given: JSONL of [key, raw], e.g. staging's), then again with every reply in
// the store: the second pass must send nothing, and its time is the cost asked about (keys, the store read, every read and
// acceptance). Run: npx tsx lab/translate/measure/reread.ts [--bundle <dir>] [--store <dump.jsonl>] [--runs 5]
import { readFileSync } from 'node:fs'
import { chainOf, type Fetch, type FetchInit, microsoft, type Result } from '../../../packages/translate/src/index.ts'
import { memoryStore } from '../../../packages/translate/src/testing/index.ts'
import { paperOf } from './bundle.ts'

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const paper = paperOf(arg('bundle'))
const runs = Number(arg('runs') ?? 5)
// the endpoint answering each text with itself and its sentence lengths (no network)
let sends = 0
const echo: Fetch = async (_url: string, init: FetchInit) => {
  sends++
  const texts = JSON.parse(init.body) as string[]
  const body = JSON.stringify(texts.map(text => ({ translations: [{ text, sentLen: { srcSentLen: [text.length], transSentLen: [text.length] } }] })))
  return { ok: true, status: 200, headers: { get: () => null }, text: async () => body }
}
const t = microsoft({ fetch: echo })
const store = memoryStore()
const dump = arg('store')
if (dump) for (const l of readFileSync(dump, 'utf8').split('\n').filter(Boolean)) store.entries.set(...(JSON.parse(l) as [string, string]))
const drain = async (it: AsyncIterable<Result>) => {
  let ok = 0
  for await (const r of it) if (r.ok) ok++
  return ok
}
const t0 = performance.now()
const filled = await drain(chainOf({ store }).translate(paper.units, 'zh-Hans', { translators: [t] }))
const fillMs = performance.now() - t0
const times: number[] = []
let sentAgain = 0
for (let i = 0; i < runs; i++) {
  const before = sends
  const a = performance.now()
  await drain(chainOf({ store }).translate(paper.units, 'zh-Hans', { translators: [t] }))
  times.push(performance.now() - a)
  sentAgain += sends - before
}
times.sort((a, b) => a - b)
const median = times[times.length >> 1] as number
console.log(JSON.stringify({ units: paper.units.length, filledOk: filled, storeEntries: store.entries.size, fillMs: Math.round(fillMs), rereadMs: { median: Math.round(median), min: Math.round(times[0] as number), runs }, perUnitMs: +(median / paper.units.length).toFixed(3), sendsOnReread: sentAgain, storeReadsPerCall: store.reads.length / (runs + 1) }, null, 1))
console.log(median > 1000 ? 'over the decision\'s 1 s: add a result cache keyed by (unit content, chain identity) behind the same entry point (design-a §6)' : 'under the decision\'s 1 s')

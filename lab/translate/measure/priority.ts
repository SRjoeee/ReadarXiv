// Open measurement 2 of interfaces/translate/DECISION.md: the latest call first (the chain's one rule of priority) against
// today's rank (layer-proto/rows.mjs runRows: batches of 2,500 then 12,000 plain characters, each the units nearest the
// reading place when it is cut, one batch at a time), on a slow fake translator (an LLM's profile, design-a §1.5: about
// 1.3 s to a first answer, longer with size). The reader opens at page 1 and asks for every unit; at `--scroll` seconds it
// jumps to page `--to` and asks for that page's units (the latest call); the time from the jump to that page's last unit
// is what is compared. Everything runs on a fake clock: the numbers are the simulation's, not a wall clock's.
// Run: npx tsx lab/translate/measure/priority.ts [--bundle <dir>] [--scroll 6] [--to <page>] [--ms 1300] [--perChar 2]
import { chainOf, type Result, type UnitIn } from '../../../packages/translate/src/index.ts'
import { fakeClock, fakeTranslator } from '../../../packages/translate/src/testing/index.ts'
import { paperOf } from './bundle.ts'

const arg = (name: string, d: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] as string) : d
}
const paper = paperOf(process.argv.includes('--bundle') ? arg('bundle', '') : undefined)
const scrollMs = Number(arg('scroll', '6')) * 1000
const to = Number(arg('to', String(Math.max(2, Math.floor(paper.pages / 2)))))
const baseMs = Number(arg('ms', '1300'))
const perChar = Number(arg('perChar', '2'))
const units = paper.units.filter(u => paper.pageOf.has(u.id))
const pageOf = (u: UnitIn) => paper.pageOf.get(u.id) ?? 1
const view = new Set(units.filter(u => pageOf(u) === to).map(u => u.id))
const plain = (u: UnitIn) => JSON.stringify(u.content).length

function slow(clock: ReturnType<typeof fakeClock>) {
  return fakeTranslator({ identity: 'slow:0', clock, limits: { chars: 4_000, units: 50, inFlight: 3, callMs: 600_000 }, script: ({ wires }) => ({ delayMs: baseMs + perChar * wires.reduce((n, w) => n + w.length, 0) }) })
}
const settleTimes = async (it: AsyncIterable<Result>, clock: ReturnType<typeof fakeClock>, at: Map<string, number>) => {
  for await (const r of it) if (!at.has(r.id)) at.set(r.id, clock.now())
}

/** the chain's rule: every unit asked at the open, the page's at the jump */
async function latestFirst() {
  const clock = fakeClock()
  const t = slow(clock)
  const chain = chainOf({ clock })
  const at = new Map<string, number>()
  const all = settleTimes(chain.translate(units, 'zh-Hans', { translators: [t] }), clock, at)
  const never = { aborted: false, addEventListener() {}, removeEventListener() {} }
  await clock.sleep(scrollMs, never)
  const jump = settleTimes(chain.translate(units.filter(u => view.has(u.id)), 'zh-Hans', { translators: [t] }), clock, at)
  await Promise.all([all, jump])
  return { at, calls: t.calls.length }
}

/** today's rank: one batch at a time, cut by distance from the reading place as it is when the batch is cut */
async function rank() {
  const clock = fakeClock()
  const t = slow(clock)
  const chain = chainOf({ clock })
  const at = new Map<string, number>()
  const left = new Set(units)
  let first = true
  while (left.size) {
    const place = clock.now() >= scrollMs ? to : 1
    const order = [...left].sort((a, b) => Math.abs(pageOf(a) - place) - Math.abs(pageOf(b) - place))
    const max = first ? 2_500 : 12_000
    first = false
    const batch: UnitIn[] = []
    let chars = 0
    for (const u of order) {
      if (batch.length && chars + plain(u) > max) break
      batch.push(u)
      chars += plain(u)
    }
    for (const u of batch) left.delete(u)
    await settleTimes(chain.translate(batch, 'zh-Hans', { translators: [t] }), clock, at)
  }
  return { at, calls: t.calls.length }
}

const report = (name: string, r: { at: Map<string, number>; calls: number }) => {
  const viewTimes = [...view].map(id => (r.at.get(id) ?? Number.NaN) - scrollMs)
  const all = Math.max(...[...r.at.values()])
  return { rule: name, viewUnits: view.size, firstOfViewAfterJumpMs: Math.max(0, Math.min(...viewTimes)), lastOfViewAfterJumpMs: Math.max(...viewTimes), wholePaperMs: all, requests: r.calls }
}
const a = report('latest call first', await latestFirst())
const b = report("today's rank", await rank())
console.log(JSON.stringify({ units: units.length, pages: paper.pages, jumpTo: to, scrollMs, translator: { baseMs, perChar, chars: 4_000, inFlight: 3 }, results: [a, b] }, null, 1))
console.log(a.lastOfViewAfterJumpMs <= b.lastOfViewAfterJumpMs ? 'the latest call first serves the view no later than today\'s rank' : 'today\'s rank serves the view sooner: add one option (first: true), not a rank function (design-a §6)')

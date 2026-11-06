// Stage 4b, deliverable 3: the HTML fixtures' blocks (html-blocks.lab.ts's dump) through Microsoft's live endpoint, one
// run each, at today's pace (2,000-character requests of at most 100 texts, 8 in flight), under the project's
// User-Agent and nothing else:
//   today:   the markers wire the page sends today, read back as the page reads it today (the protector's `validate`
//            against the request's own placeholders, which is what `rehydrate` and the cache gate judge);
//   package: the same block as the shim's unit (protector/units.ts), written by the package's Microsoft adapter (its
//            marker economy: side-by-side elements one marker), read back by it and judged by the chain's `accept`.
// Counted: the placeholders that come back (each source element whose marker stands once in the reply), the blocks
// accepted, and the blocks refused (today: resent alone, then cut into runs, by the page; on the chain: to the next
// translator). A refusal or a rate limit of the endpoint stops the run (no retry loop).
// Each row keeps the wire sent and the reply (since 2026-11-07's checks: the first run kept counts only).
// Run: npx tsx lab/translate/live-html.ts <blocks.jsonl> <out.json> today|package
import { readFileSync, writeFileSync } from 'node:fs'
import { accept, type Fetch, type UnitIn } from '../../packages/translate/src/index.ts'
import { microsoft } from '../../packages/translate/src/adapters/microsoft.ts'
import { planMarkers } from '../../packages/translate/src/wire/markers.ts'
import { expectationsFromText, validate } from '../../src/core/protector/validate.ts'
import { tokenize } from '../../src/core/protector/tokens.ts'
import { unitOfWire } from '../../src/core/protector/units.ts'

const UA = 'ReadarXiv/0.1 (+https://readarxiv.org; research)'
const ENDPOINT = 'https://edge.microsoft.com/translate/translatetext'
const [input, output, which] = process.argv.slice(2)
if (!input || !output || (which !== 'today' && which !== 'package')) throw new Error('usage: live-html.ts <blocks.jsonl> <out.json> today|package')
type Block = { paper: string; id: string; unit: string; markers: string; kindsM: Record<string, string> }
// (AXT_ONLY: a file of `paper|id` lines, the blocks to send alone, for a run that reads some blocks' replies again)
const only = process.env.AXT_ONLY ? new Set(readFileSync(process.env.AXT_ONLY, 'utf8').split('\n').filter(Boolean)) : null
const blocks = readFileSync(input, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as Block).filter(b => !only || only.has(`${b.paper}|${b.id}`))

let stopped: string | null = null
let requests = 0
/** one POST, as the endpoint is asked by both: the texts as a JSON array, the target zh-Hans */
const post: Fetch = async (url, init) => {
  if (stopped) throw new Error(`stopped: ${stopped}`)
  requests++
  // a dry run (AXT_DRY=1): the endpoint echoes each text, nothing leaves the machine
  if (process.env.AXT_DRY === '1') return new Response(JSON.stringify((JSON.parse(init.body) as string[]).map(text => ({ translations: [{ text }] }))), { status: 200 })
  const r = await fetch(url, { method: init.method, headers: { ...init.headers, 'User-Agent': UA }, body: init.body, signal: init.signal as AbortSignal })
  if (r.status === 429 || r.status === 403 || r.status >= 500) stopped = `HTTP ${r.status} at request ${requests}`
  return r
}

/** the work in requests of at most 2,000 characters and 100 texts, 8 at once */
async function paced<T>(items: T[], size: (t: T) => number, send: (batch: T[]) => Promise<void>) {
  const batches: T[][] = []
  let cur: T[] = []
  let n = 0
  for (const it of items) {
    if (cur.length && (n + size(it) > 2_000 || cur.length >= 100)) {
      batches.push(cur)
      cur = []
      n = 0
    }
    cur.push(it)
    n += size(it)
  }
  if (cur.length) batches.push(cur)
  let next = 0
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < batches.length && !stopped) await send(batches[next++] as T[])
  }))
}

const count = (re: RegExp, s: string) => (s.match(re) ?? []).length
const out: { id: string; paper: string; elements: number; back: number; accepted: boolean; refused: boolean; error?: string; wire?: string; reply?: string }[] = []
const t0 = Date.now()

if (which === 'today') {
  await paced(blocks, b => b.markers.length, async batch => {
    try {
      const r = await post(`${ENDPOINT}?from=en&to=zh-Hans&isEnterpriseClient=false`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(batch.map(b => b.markers)), signal: new AbortController().signal })
      const items = r.ok ? ((await r.json()) as { translations?: { text?: string }[] }[]) : null
      batch.forEach((b, i) => {
        const reply = items?.[i]?.translations?.[0]?.text
        const ids = tokenize(b.markers, 'markers').flatMap(t => (t.kind === 'void' ? [t.id] : []))
        if (typeof reply !== 'string') return void out.push({ id: b.id, paper: b.paper, elements: ids.length, back: 0, accepted: false, refused: false, error: r.ok ? 'no item' : `HTTP ${r.status}` })
        const got = tokenize(reply, 'markers').flatMap(t => (t.kind === 'void' ? [t.id] : []))
        const back = ids.filter(id => got.filter(g => g === id).length === 1).length
        const ok = validate(reply, expectationsFromText(b.markers, 'markers')).ok
        out.push({ id: b.id, paper: b.paper, elements: ids.length, back, accepted: ok, refused: !ok, wire: b.markers, reply })
      })
    } catch (e) {
      for (const b of batch) out.push({ id: b.id, paper: b.paper, elements: count(/@[a-z]+#/g, b.markers), back: 0, accepted: false, refused: false, error: String(e) })
    }
  })
} else {
  const ms = microsoft({ fetch: post })
  const units = blocks.map(b => ({ b, unit: unitOfWire(b.id, b.markers, 'markers', { elementOf: n => ({ kind: b.kindsM[String(n)] ?? 'other' }), sentences: true }).unit as UnitIn }))
  await paced(units, u => ms.write(u.unit, 'zh-Hans').length, async batch => {
    const raws = new Map<number, string>()
    let error: string | undefined
    try {
      for await (const [i, raw] of ms.send(batch.map(u => ms.write(u.unit, 'zh-Hans')), { target: 'zh-Hans' }, new AbortController().signal)) raws.set(i, raw)
    } catch (e) {
      error = String((e as Error).message ?? e)
    }
    batch.forEach(({ b, unit }, i) => {
      const elements = count(/@[a-z]+#/g, b.markers)
      const raw = raws.get(i)
      if (raw === undefined) return void out.push({ id: b.id, paper: b.paper, elements, back: 0, accepted: false, refused: false, error: error ?? 'no item' })
      const plan = planMarkers(unit)
      const text = (JSON.parse(raw) as { text: string }).text
      // each of the plan's markers once in the reply: the elements it stands for came back
      let back = 0
      plan.slots.forEach((slot, k) => {
        const marker = `@${toAlpha(k + 1)}#`
        if (text.split(marker).length - 1 !== 1) return
        if (slot.t === 'void') back += slot.out.filter(p => p.t === 'el').length + slot.out.filter(p => p.t === 'span').length
      })
      const read = ms.read(unit, raw)
      const ok = !!read && accept(unit, read.content).ok
      out.push({ id: b.id, paper: b.paper, elements, back: Math.min(back, elements), accepted: ok, refused: !ok, wire: ms.write(unit, 'zh-Hans'), reply: text })
    })
  })
}

function toAlpha(id: number): string {
  let n = id
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(97 + r) + s
    n = (n - 1 - r) / 26
  }
  return s
}

const sum = (f: (r: (typeof out)[number]) => number) => out.reduce((n, r) => n + f(r), 0)
const totals = {
  which,
  blocks: blocks.length,
  answered: out.filter(r => !r.error).length,
  requests,
  seconds: Math.round((Date.now() - t0) / 1000),
  elements: sum(r => (r.error ? 0 : r.elements)),
  back: sum(r => r.back),
  accepted: out.filter(r => r.accepted).length,
  refused: out.filter(r => r.refused).length,
  errors: out.filter(r => r.error).length,
  stopped,
}
writeFileSync(output, JSON.stringify({ totals, rows: out }, null, 1))
console.log(JSON.stringify(totals))

// Stage 4b, check 1's offline part: what a reader would see on the HTML page from the package's tolerant reading of
// Microsoft's known slips (translation dossier §16: a `#` doubled, `@d# #`, a `#` dropped before the next character, a `#`
// displaced into brackets), applied one marker at a time to an echo of every fixture block's markers wire, read by the
// package's adapter, accepted by the chain's rule, written back by the shim and rehydrated. Counted by slip and by whether
// the block's own text holds a `#` (the reading's hashFree): what comes back accepted, and of that, what shows a marker
// character the source does not have, an element out of its order, or text lost. Run: AXT_SLIPS=<out.txt> pnpm exec vitest
// run -c lab/translate/live.config.ts lab/translate/slips.lab.ts, with AXT_SLIP_FILE=<paper.html> for one paper a process
import { appendFileSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { accept, microsoft } from '@readarxiv/translate'
import { afterAll, expect, it } from 'vitest'
import { extract } from '@/core/extractor'
import { unitOfSegment } from '@/core/pipeline/units'
import { rehydrate, serialize } from '@/core/protector'
import { wireOfContent } from '@/core/protector/units'

const DIR = join(import.meta.dirname, '../../tests/fixtures/arxiv')
const SLIPS: Record<string, (m: string) => string> = {
  'doubled #': m => `${m}#`,
  '# space #': m => `${m} #`,
  '# dropped': m => m.slice(0, -1),
  '# displaced into brackets': m => `${m.slice(0, -1)}(#)`,
}
const none = async () => {
  throw new Error('no network')
}

const ms = microsoft({ fetch: none })
const tally = new Map<string, { tried: number; accepted: number; stray: number; order: number; lost: number; examples: string[] }>()
const visible = (frag: DocumentFragment) => {
  const div = document.createElement('div')
  div.append(frag)
  return div
}
for (const f of readdirSync(DIR).filter(x => x.endsWith('.html') && (!process.env.AXT_SLIP_FILE || x === process.env.AXT_SLIP_FILE)).sort()) {
  it(f, () => {
    const doc = new DOMParser().parseFromString(readFileSync(join(DIR, f), 'utf8'), 'text/html')
    for (const b of extract(doc)) {
      const targets = b.kind === 'text' ? [b.el] : b.cells.flatMap(c => (c.numeric ? [] : [c.el]))
      for (const target of targets) {
        const p = serialize(target, 'markers')
        const from = unitOfSegment({ id: 'b', text: p.text, block: b, protected: p } as never, 'markers')
        const wire = ms.write(from.unit, 'zh-Hans')
        const markers = [...wire.matchAll(/@[a-z]+#/g)]
        if (!markers.length) continue
        const original = visible(rehydrate(p.text, p, doc))
        const want = (original.textContent ?? '').replace(/\s+/g, ' ')
        const wantOrder = [...original.querySelectorAll('*')].map(e => e.tagName).join(',')
        const hashes = !p.text.replace(/@@|@[a-z]+#/g, '').includes('#')
        // the slip on the marker before a word (the case the slips were met in): the first marker followed by a letter
        const target0 = markers.find(m => /^\s*\p{L}/u.test(wire.slice((m.index ?? 0) + m[0].length))) ?? markers[0]
        for (const [name, slip] of Object.entries(SLIPS)) {
          const at = target0?.index ?? 0
          const m = target0?.[0] ?? ''
          const reply = wire.slice(0, at) + slip(m) + wire.slice(at + m.length)
          const key = `${name} | the block's text ${hashes ? 'holds no #' : 'holds a # of its own'}`
          const t = tally.get(key) ?? { tried: 0, accepted: 0, stray: 0, order: 0, lost: 0, examples: [] }
          tally.set(key, t)
          t.tried++
          const read = ms.read(from.unit, JSON.stringify({ text: reply }))
          if (!read || !accept(from.unit, read.content).ok) continue
          t.accepted++
          const got = visible(rehydrate(wireOfContent(read.content, from).wire, p, doc))
          const text = (got.textContent ?? '').replace(/\s+/g, ' ')
          const stray = (text.match(/[#@]/g) ?? []).length > (want.match(/[#@]/g) ?? []).length
          const order = [...got.querySelectorAll('*')].map(e => e.tagName).join(',') !== wantOrder
          const lost = text.replace(/[\s#@()]/g, '').length < want.replace(/[\s#@()]/g, '').length
          if (stray) t.stray++
          if (order) t.order++
          if (lost) t.lost++
          if ((stray || order || lost) && t.examples.length < 3) t.examples.push(`${f} ${target.id}: reply ${JSON.stringify(reply.slice(Math.max(0, at - 30), at + 40))} → ${JSON.stringify(text.slice(0, 120))}`)
        }
      }
    }
  })
}
afterAll(() => {
  const lines = [...tally].map(([k, t]) => `${k}: ${t.tried} tried, ${t.accepted} accepted; of those ${t.stray} show a stray # or @, ${t.order} an element out of order, ${t.lost} text lost${t.examples.length ? `\n    ${t.examples.join('\n    ')}` : ''}`)
  // (one paper a process, AXT_SLIP_FILE, its tally appended as JSON to AXT_SLIPS; aggregated by the caller)
  appendFileSync(process.env.AXT_SLIPS as string, `${JSON.stringify(Object.fromEntries(tally))}\n`)
  console.log(lines.join('\n'))
  expect(tally.size).toBeGreaterThan(0)
})

// The HTML fixtures' blocks as the page sends them (stage 4b, deliverable 3): every text block and every non-numeric cell
// of tests/fixtures/arxiv, serialised in both wires, with each placeholder's element kind and the block's unit, written
// to AXT_BLOCKS (JSONL) for the live run (live-html.ts). Also, offline: today's sentence cuts of the tags wire
// (pipeline/cuts.ts, the DOM's SplitContext) against the package's (the tags adapter's, from the shim's element kinds),
// in wire offsets, counted. Run: AXT_BLOCKS=<file> pnpm exec vitest run -c lab/translate/live.config.ts
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { google } from '@readarxiv/translate'
import { expect, it } from 'vitest'
import { extract } from '@/core/extractor'
import { cutsOf } from '@/core/pipeline/cuts'
import { unitOfSegment } from '@/core/pipeline/units'
import { serialize } from '@/core/protector'
import { elementKindOf } from '@/core/rules/latexml'

const DIR = join(import.meta.dirname, '../../tests/fixtures/arxiv')
const OUT = process.env.AXT_BLOCKS as string

it('dumps the fixtures blocks and counts the sentence cuts', () => {
  expect(OUT).toBeTruthy()
  const lines: string[] = []
  let units = 0, sameCuts = 0, differ = 0, examples: string[] = []
  const g = google({ fetch: async () => { throw new Error('no network') } })
  for (const f of readdirSync(DIR).filter(x => x.endsWith('.html')).sort()) {
    const doc = new DOMParser().parseFromString(readFileSync(join(DIR, f), 'utf8'), 'text/html')
    for (const b of extract(doc)) {
      const targets = b.kind === 'text' ? [{ el: b.el, id: b.id }] : b.cells.flatMap((c, i) => (c.numeric ? [] : [{ el: c.el, id: `${b.id}#c${i}` }]))
      for (const t of targets) {
        const m = serialize(t.el, 'markers')
        const tg = serialize(t.el, 'tags')
        const kinds = (p: typeof m) => Object.fromEntries([...p.slots].map(([n, node]) => [n, elementKindOf(node)]))
        lines.push(JSON.stringify({ paper: f.replace('.html', ''), id: t.id, unit: b.unit, markers: m.text, tags: tg.text, kindsM: kinds(m), kindsT: kinds(tg) }))
        // the cuts, on the tags wire: today's (wire offsets) and the package's (its projection cuts, through the shim's table)
        const segment = { id: t.id, text: tg.text, block: b, protected: tg }
        const today = cutsOf(segment as never, 'tags')
        const wu = unitOfSegment(segment as never, 'tags')
        if (today === undefined || wu.whole) continue
        units++
        const plan = g.write(wu.unit, 'zh-Hans')
        // the package's cuts are where its boundary markers stand in its own wire; read back as the projection offsets
        const read = g.read(wu.unit, plan.replace(/<x id="(\d+)"\/>/g, (all, n) => all))
        const mine = read?.sentences?.src.map(c => wu.wireAt[c] as number) ?? []
        const norm = (xs: readonly number[]) => xs.map(x => tg.text.slice(0, x).replace(/\s+/g, '').length).join(',')
        if (norm(today) === norm(mine)) sameCuts++
        else {
          differ++
          examples.push(`${f} ${t.id}: today [${norm(today)}] package [${norm(mine)}] — ${tg.text.slice(0, 120)}`)
        }
      }
    }
  }
  writeFileSync(OUT, `${lines.join('\n')}\n`)
  writeFileSync(`${OUT}.cuts.txt`, [`units cut on the tags wire: ${units}; the same cuts: ${sameCuts}; different: ${differ}`, ...examples].join('\n'))
  console.log(`${lines.length} blocks written; cuts: ${sameCuts} the same of ${units}, ${differ} different`)
})

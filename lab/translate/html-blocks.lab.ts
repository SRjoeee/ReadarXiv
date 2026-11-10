// The HTML fixtures' blocks as the page sends them (stage 4b, deliverable 3): every text block and every non-numeric cell
// of tests/fixtures/arxiv, serialised in both wires, with each placeholder's element kind, the block's unit, and the unit
// the page's mapping makes of its markers wire now (`unitM`: core/pipeline/units.ts, what the chain is sent), written to
// AXT_BLOCKS (JSONL) for the live run (live-html.ts). AXT_ONLY (a file of `paper|id` lines) dumps those blocks alone.
// (The comparison of the tags wire's sentence cuts that this file made at first, against the deleted pipeline/cuts.ts, is
// cuts.lab.ts.) Run: AXT_BLOCKS=<file> pnpm exec vitest run -c lab/translate/live.config.ts lab/translate/html-blocks.lab.ts
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { extract } from '@/core/extractor'
import { unitOfSegment } from '@/core/pipeline/units'
import { serialize } from '@/core/protector'
import { elementKindOf } from '@/core/rules/latexml'

const DIR = join(import.meta.dirname, '../../tests/fixtures/arxiv')
const OUT = process.env.AXT_BLOCKS as string
const only = process.env.AXT_ONLY ? new Set(readFileSync(process.env.AXT_ONLY, 'utf8').split('\n').filter(Boolean)) : null

it('dumps the fixtures blocks', () => {
  expect(OUT).toBeTruthy()
  const lines: string[] = []
  for (const f of readdirSync(DIR).filter(x => x.endsWith('.html')).sort()) {
    const paper = f.replace('.html', '')
    const doc = new DOMParser().parseFromString(readFileSync(join(DIR, f), 'utf8'), 'text/html')
    for (const b of extract(doc)) {
      const targets = b.kind === 'text' ? [{ el: b.el, id: b.id }] : b.cells.flatMap((c, i) => (c.numeric ? [] : [{ el: c.el, id: `${b.id}#c${i}` }]))
      for (const t of targets) {
        if (only && !only.has(`${paper}|${t.id}`)) continue
        const m = serialize(t.el, 'markers')
        const tg = serialize(t.el, 'tags')
        const kinds = (p: typeof m) => Object.fromEntries([...p.slots].map(([n, node]) => [n, elementKindOf(node)]))
        const unitM = unitOfSegment({ id: t.id, text: m.text, block: b, protected: m } as never, 'markers').unit
        lines.push(JSON.stringify({ paper, id: t.id, unit: b.unit, markers: m.text, tags: tg.text, kindsM: kinds(m), kindsT: kinds(tg), unitM }))
      }
    }
  }
  writeFileSync(OUT, `${lines.join('\n')}\n`)
  console.log(`${lines.length} blocks written`)
})

// Stage 4b, check 3: the HTML fixtures' units whose tags-wire sentence cuts differ, today's (pipeline/cuts.ts at
// 1d804a770: core/sentences sentenceCuts over the wire, each slot read as its visible text, a footnote's mark as an
// annotation) against the package's (the tags codec's cuts over the unit's projection, each element read by its kind:
// formula `x`, reference `1`, footnote mark an annotation, anything else a word), each cut that one side has and the other
// not, with what stands before it: the element (its kind, its visible text) or the text. One paper a process
// (AXT_CUT_FILE), each difference appended as JSON to AXT_CUTS. Run: pnpm exec vitest run -c lab/translate/live.config.ts
// lab/translate/cuts.lab.ts
import { appendFileSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { google } from '@readarxiv/translate'
import { it } from 'vitest'
import { extract } from '@/core/extractor'
import { unitOfSegment } from '@/core/pipeline/units'
import { serialize, tokenize } from '@/core/protector'
import { ANNOTATION_SELECTOR, elementKindOf } from '@/core/rules/latexml'
import { sentenceCuts, visibleTextOf } from '@/core/sentences'

const DIR = join(import.meta.dirname, '../../tests/fixtures/arxiv')
const g = google({ fetch: async () => { throw new Error('no network') } })
const WHOLE_ONLY = new Set(['bibblock', 'bibitem'])

for (const f of readdirSync(DIR).filter(x => x.endsWith('.html') && (!process.env.AXT_CUT_FILE || x === process.env.AXT_CUT_FILE)).sort()) {
  it(f, () => {
    const doc = new DOMParser().parseFromString(readFileSync(join(DIR, f), 'utf8'), 'text/html')
    for (const b of extract(doc)) {
      if (b.kind === 'text' && WHOLE_ONLY.has(b.unit)) continue
      const targets = b.kind === 'text' ? [{ el: b.el, id: b.id }] : b.cells.flatMap((c, i) => (c.numeric ? [] : [{ el: c.el, id: `${b.id}#c${i}` }]))
      for (const t of targets) {
        const p = serialize(t.el, 'tags')
        const slots = p.slots
        // today's, as pipeline/cuts.ts made them
        const today = sentenceCuts(p.text, 'tags', {
          isAnnotation: id => { const n = slots.get(id); return n?.nodeType === 1 && (n as Element).matches(ANNOTATION_SELECTOR) },
          textOf: id => { const n = slots.get(id); return n ? visibleTextOf(n) : undefined },
        })
        const wu = unitOfSegment({ id: t.id, text: p.text, block: b, protected: p } as never, 'tags')
        const read = g.read(wu.unit, g.write(wu.unit, 'zh-Hans'))
        const mine = read?.sentences?.src.map(c => wu.wireAt[c] as number) ?? []
        const norm = (x: number) => p.text.slice(0, x).replace(/\s+/g, '').length
        const a = new Set(today.map(norm))
        const m = new Set(mine.map(norm))
        if ([...a].every(x => m.has(x)) && [...m].every(x => a.has(x))) continue
        // what stands before a wire offset: the last token before it
        const before = (x: number) => {
          const toks = tokenize(p.text.slice(0, x), 'tags').filter(k => k.kind !== 'text' || /\S/.test(k.text))
          const last = toks.at(-1)
          if (last?.kind === 'void') { const n = slots.get(last.id); return { el: elementKindOf(n), cls: (n as Element | undefined)?.className?.toString().slice(0, 40) ?? '', text: n ? visibleTextOf(n).slice(-24) : '' } }
          if (last?.kind === 'text') return { text: last.text.trimEnd().slice(-24) }
          return { tag: last?.kind ?? 'none' }
        }
        const only = (xs: number[], other: Set<number>) => xs.filter(x => !other.has(norm(x))).map(x => ({ before: before(x), after: p.text.slice(x, x + 30) }))
        appendFileSync(process.env.AXT_CUTS as string, `${JSON.stringify({ paper: f, id: t.id, unit: b.unit, todayOnly: only(today, m), packageOnly: only(mine, a), wire: p.text.slice(0, 160) })}\n`)
      }
    }
  })
}

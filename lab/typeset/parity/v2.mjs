// lab/typeset/parity/v2.mjs --out=<dir> <pair>…: v2's side of the parity check, the typesetter's half. For each pair, every
// page of the paper's part laid by design-a's entry (`layPage`, packages/typeset/src/lay/entry.ts) over the pair's door rows
// (the rows today's reader laid: packages/typeset/tests/replay/rows.ts), as lab/typeset/checkpoint/laid.mjs `--entry` lays the
// checkpoint's pages (gate-l1.ts's gateL1Pair with the reading from the part and the layered metrics; items-hook.mjs hands
// each page over), on whole pages: `<dir>/<pair>.json` holds each page's `Page` whole (its members and its links), the
// join of each part member to today's unit (today's ord, by content id and rank: the baseline's rule), and the facts of the
// part's members the measures read (kind, the TeX-stated alignment, the lines on A, the style, the text's id). Lab-data
// only: the pages hold licensed papers' text. Heavy: run through heavy-slot.sh test.
import { mkdirSync, writeFileSync } from 'node:fs'
import { register } from 'node:module'
import { join } from 'node:path'

register('../checkpoint/items-hook.mjs', import.meta.url)
register('./hook.mjs', import.meta.url)
const { gateL1Pair } = await import('../../../packages/typeset/tests/replay/gate-l1.ts')
const { readGz, TAP } = await import('../../../packages/typeset/tests/replay/tap.ts')
const { l1Paper } = await import('../../../packages/typeset/tests/replay/l1.ts')
const { paperOf } = await import('../../../packages/typeset/tests/replay/today.ts')
const { tableMetrics } = await import('../../../packages/typeset/src/metrics/table.ts')
const { layered, servedMetrics } = await import('../served-metrics.mjs')
const { leftKinds } = await import('../../../packages/reader/src/compose/classes.ts')
// (the reader's default toggles, today's door's too: references and the author block shown as the original's)
globalThis.__parityChoices = { leave: leftKinds(null) }

const args = process.argv.slice(2)
const OUT = args.find((a) => a.startsWith('--out='))?.slice(6)
if (!OUT) throw new Error('v2.mjs: --out=<dir> is required')
const pairs = args.filter((a) => !a.startsWith('--'))
mkdirSync(OUT, { recursive: true })
const served = servedMetrics()
const metricsOf = (pair) => layered(tableMetrics(readGz(join(TAP, 'metrics', `${pair}.metrics.json.gz`))), served)

for (const pair of pairs) {
  const t0 = performance.now()
  const today = {}
  globalThis.__ckMem = (p, todayOrd, ord, labelDrawn) => {
    if (p === pair) today[ord] = { today: todayOrd, labelDrawn }
  }
  const pages = {}
  globalThis.__ckPage = (p, pg, page) => {
    if (p === pair) pages[pg] = { members: page.members.filter((m) => m.page === pg), links: page.links, wait: page.wait }
  }
  const got = gateL1Pair(pair, { metricsOf, reading: 'part', entry: true })
  globalThis.__ckMem = undefined
  globalThis.__ckPage = undefined
  // (the part's facts of every member with a line on a page, by page: what the measures read of the original)
  const bundle = l1Paper(paperOf(pair))
  const facts = {}
  for (const [pg, part] of bundle?.parts ?? []) {
    const list = []
    for (const flow of part.flows)
      for (const m of flow) {
        if (!m.lines.some((l) => l[0] === pg)) continue
        list.push({
          ord: m.ord,
          kind: m.kind,
          text: typeof m.text === 'string' ? m.text : null,
          align: m.align,
          style: m.style,
          lines: m.lines,
          ...(m.label ? { label: m.label } : {}),
        })
      }
    facts[pg] = { members: list, links: part.links?.length ?? 0 }
  }
  const out = { pair, paper: paperOf(pair), pages, today, facts, threw: got.threw, laidPages: Object.keys(pages).length }
  writeFileSync(join(OUT, `${pair}.json`), `${JSON.stringify(out)}\n`)
  const laid = Object.values(pages).reduce((n, p) => n + p.members.filter((m) => m.state === 'laid').length, 0)
  console.log(`${pair}: ${Object.keys(pages).length} pages, ${laid} members laid, ${(performance.now() - t0).toFixed(0)} ms`)
}

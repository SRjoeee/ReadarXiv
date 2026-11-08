// lab/typeset/parity/v2.mjs --out=<dir> <pair>…: v2's side of the parity check, the typesetter's half. For each pair, every
// page of the paper's part laid by the reader's own lay (packages/reader/src/compose/typeset.ts `typesetLay`: design-a's
// `layPage` under the rules, toggles and options the reader passes, its toggles the defaults) over the pair's door rows (the
// rows today's reader laid: packages/typeset/tests/replay/rows.ts) and the layered metrics, the served hyphenation patterns
// read as the reader's served.ts reads them; driven page by page by gate-l1.ts's gateL1Pair as lab/typeset/checkpoint/laid.mjs
// `--entry` drives the checkpoint's (the reading from the part; hook.mjs puts the reader's lay in place of its entry call,
// items-hook.mjs hands each page over), on whole pages: `<dir>/<pair>.json` holds each page's `Page` whole (its members and
// its links), the join of each part member to today's unit (today's ord, by content id and rank: the baseline's rule), and
// the facts of the part's members the measures read (kind, the TeX-stated alignment, the lines on A, the style, the text's
// id) and the page's size ties. Lab-data only: the pages hold licensed papers' text. Heavy: run through heavy-slot.sh test.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
const { typesetLay } = await import('../../../packages/reader/src/compose/typeset.ts')
const { hyphenationOf } = await import('../../../packages/typeset/src/index.ts')
const { hyphFileOf } = await import('./inputs.mjs')

const args = process.argv.slice(2)
const OUT = args.find((a) => a.startsWith('--out='))?.slice(6)
if (!OUT) throw new Error('v2.mjs: --out=<dir> is required')
const pairs = args.filter((a) => !a.startsWith('--'))
mkdirSync(OUT, { recursive: true })
const served = servedMetrics()
const metricsOf = (pair) => layered(tableMetrics(readGz(join(TAP, 'metrics', `${pair}.metrics.json.gz`))), served)
/** a language's patterns as the reader's served.ts reads GET /hyph/<lang>.json: hyphenationOf over its patterns and exceptions;
 *  null where none is served (that language hyphenates nothing) */
const patternsOf = (lang) => {
  const f = /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(lang) ? hyphFileOf(lang) : null
  if (!f) return null
  const v = JSON.parse(readFileSync(f, 'utf8'))
  if (!Array.isArray(v.patterns)) throw new Error(`the patterns of ${lang} are of another shape`)
  return hyphenationOf({ patterns: v.patterns.filter((x) => typeof x === 'string'), exceptions: Array.isArray(v.exceptions) ? v.exceptions.filter((x) => typeof x === 'string') : [] })
}
const hyph = new Map()
const patterns = (lang) => {
  if (!hyph.has(lang)) hyph.set(lang, patternsOf(lang))
  return hyph.get(lang)
}

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
  // (the reader's lay of the pair, as openReader binds it once the head is read: its target the pair's, as render.mjs opens
  // the reader on it, its toggles none (the defaults), its metrics the layered ones, its patterns the served ones)
  const target = /-([a-z]{2,3})$/.exec(pair)?.[1]
  if (!target) throw new Error(`v2.mjs: ${pair} names no target`)
  const metrics = metricsOf(pair)
  globalThis.__parityLay = await typesetLay({
    served: {
      metrics,
      hyph: async (langs) => Object.fromEntries(langs.map((l) => [l, patterns(l)])),
      hyphNow: (lang) => patterns(lang),
    },
    target: () => target,
    classes: () => null,
  })
  const got = gateL1Pair(pair, { metricsOf, reading: 'part', entry: true })
  globalThis.__ckMem = undefined
  globalThis.__ckPage = undefined
  globalThis.__parityLay = undefined
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
    // (and the page's size ties, each the part ords of one paragraph's members laid at one scale)
    const ties = (part.ties ?? []).filter((t) => t.rule === 'size').map((t) => t.ords)
    facts[pg] = { members: list, links: part.links?.length ?? 0, ties }
  }
  const out = { pair, paper: paperOf(pair), pages, today, facts, threw: got.threw, laidPages: Object.keys(pages).length }
  writeFileSync(join(OUT, `${pair}.json`), `${JSON.stringify(out)}\n`)
  const laid = Object.values(pages).reduce((n, p) => n + p.members.filter((m) => m.state === 'laid').length, 0)
  console.log(`${pair}: ${Object.keys(pages).length} pages, ${laid} members laid, ${(performance.now() - t0).toFixed(0)} ms`)
}

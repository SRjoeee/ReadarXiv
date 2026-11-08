// lab/typeset/checkpoint/laid.mjs --out=<file> <pair>:<page>[,<page>…] …: the runner's lay of those pages as the reader's `Page`
// would hold it, for real.mjs `--from=laid` (the reader composing the typesetter's own display list, not the dump made into
// Pages by the harness's converter, which knows a line's text and extent only). gate-l1.ts's gateL1Pair as gate-l1.mjs runs it
// for the checkpoint's dumps (the reading from the part, the layered metrics), items-hook.mjs handing each member over. Each
// laid member: its part's ord, its fit, its display lines with their items in design-a's Item (a run's face named by its weight
// and slant, `w400`, `w700i`; a run's `rise` and `track`, which design-a's Item does not carry, dropped as the reader would
// drop them, and counted), and its groups off as layPage turns them off (packages/typeset/src/lay/entry.ts groupsOn: its text;
// its elements where a crop of an element is cut from the page; its label where its reading draws it anew or a label crop is
// drawn, on every page of the member here, the runner's member not stating where its label stands; `--entry`: the entry's own).
// Heavy: run through heavy-slot.sh test.
import { writeFileSync } from 'node:fs'
import { register } from 'node:module'
import { join } from 'node:path'

register('./items-hook.mjs', import.meta.url)
const { gateL1Pair } = await import('../../../packages/typeset/tests/replay/gate-l1.ts')
const { readGz, TAP } = await import('../../../packages/typeset/tests/replay/tap.ts')
const { tableMetrics } = await import('../../../packages/typeset/src/metrics/table.ts')
const { layered, servedMetrics } = await import('../served-metrics.mjs')

const args = process.argv.slice(2)
const OUT = args.find((a) => a.startsWith('--out='))?.slice(6)
const ENTRY = args.includes('--entry')
const asks = args.filter((a) => !a.startsWith('--')).map((a) => {
  const [pair, pages] = a.split(':')
  return { pair, pages: new Set(pages.split(',').map(Number)) }
})
const served = servedMetrics()
const metricsOf = (pair) => layered(tableMetrics(readGz(join(TAP, 'metrics', `${pair}.metrics.json.gz`))), served)
const faceId = (face) => `w${/\b([1-9]00)\b/.exec(face)?.[1] ?? '400'}${/^italic|^oblique/.test(face) ? 'i' : ''}`
const out = {}
for (const { pair, pages } of asks) {
  const partOrd = new Map(),
    drawn = new Map()
  globalThis.__ckMem = (p, today, ord, labelDrawn) => {
    if (p !== pair) return
    partOrd.set(today, ord)
    drawn.set(today, labelDrawn !== null)
  }
  const dropped = { rise: 0, track: 0 }
  const laid = {}
  globalThis.__ckLaid = (p, pg, pm) => {
    if (p !== pair || !pages.has(pg) || pm.state !== 'laid') return
    let crop = false,
      labelCrop = false
    const lines = pm.lines.map(([y, x0, x1, items]) => [
      y,
      x0,
      x1,
      items.map((it) => {
        if ('src' in it) {
          if (it.piece === 'label') labelCrop = true
          else if (it.piece !== 'counter' && it.src[0] === pg) crop = true
          return { s: it.s, x: it.x, src: it.src, k: it.k, piece: it.piece }
        }
        if (it.rise) dropped.rise++
        if (it.track) dropped.track++
        return {
          s: it.s,
          x: it.x,
          face: faceId(it.face),
          size: it.size,
          ...(it.fill !== undefined ? { fill: it.fill } : {}),
          ...(it.skew ? { skew: 1 } : {}),
          ...(it.dx ? { dx: it.dx } : {}),
        }
      }),
    ])
    const ord = partOrd.get(pm.ord)
    if (ord === undefined) return
    ;(laid[pg] ??= []).push({
      ord,
      today: pm.ord,
      page: pg,
      state: 'laid',
      off: 1 | (crop ? 2 : 0) | (drawn.get(pm.ord) || labelCrop ? 4 : 0),
      ...(pm.fit ? { fit: pm.fit } : {}),
      lines,
      lit: { left: [], right: [], own: [] },
    })
  }
  // (--entry: the entry's own Page, design-a's, as the reader receives it: its members by the part's ord, their groups off by
  // layPage's rule, their runs' raises kept; and its links (`links`), read by entry-reader.mjs)
  const entryPages = {}
  const entryLinks = {}
  globalThis.__ckPage = (p, pg, page) => {
    if (p !== pair || !pages.has(pg)) return
    entryPages[pg] = page.members.filter((m) => m.page === pg)
    entryLinks[pg] = page.links
  }
  gateL1Pair(pair, { metricsOf, reading: 'part', ...(ENTRY ? { entry: true } : {}) })
  out[pair] = { pages: ENTRY ? entryPages : laid, ...(ENTRY ? { links: entryLinks } : {}), dropped }
  console.log(`${pair}: ${Object.entries(laid).map(([p, ms]) => `p${p} ${ms.length} laid`).join(', ')}; dropped rise ${dropped.rise}, track ${dropped.track}`)
}
writeFileSync(OUT, `${JSON.stringify(out)}\n`)

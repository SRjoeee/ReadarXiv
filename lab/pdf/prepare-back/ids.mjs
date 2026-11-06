// lab/pdf/prepare-back/ids.mjs <prepare dumps dir>: every unit of the baseline's prepare dumps (FORMAT.md §3, their pieces the flat
// list of §2) given its id again by @readarxiv/format's unitId (the engine's re-export) over the pieces made a Piece tree again (an open a span to its
// close, a close with no open a span of nothing but its close, an open with no close a span to the unit's end): the ids
// against the dumps', which the baseline computed by FORMAT.md's rule (baseline/tools/unit-id.mjs). Not shipped.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unitId } from '@readarxiv/engine'

const [DIR] = process.argv.slice(2)
const treeOf = flat => {
  const root = []
  const stack = [{ content: root }]
  for (const p of flat) {
    const top = stack.at(-1).content
    if (p.kind === 'text') top.push({ t: 'text', s: p.s })
    else if (p.kind === 'ph') top.push({ t: 'el', id: String(p.k), kind: 'other', src: p.src })
    else if (p.kind === 'nested') top.push({ t: 'unit', id: String(p.k), unit: p.unit, pre: p.pre, post: p.post })
    else if (p.kind === 'open') { const span = { t: 'span', id: String(p.k), style: 'group', open: p.src, content: [] }; top.push(span); stack.push(span) }
    else if (p.kind === 'close') { if (stack.length > 1) stack.pop().close = p.src; else top.push({ t: 'span', id: String(p.k), style: 'group', close: p.src, content: [] }) }
  }
  return root
}
let units = 0, same = 0, depth = 0
const differ = []
for (const f of readdirSync(DIR).filter(x => x.endsWith('.prepare.json')).sort()) {
  for (const u of JSON.parse(readFileSync(join(DIR, f), 'utf8')).units) {
    units++
    let d = 0, m = 0
    for (const p of u.pieces) { if (p.kind === 'open') m = Math.max(m, ++d); else if (p.kind === 'close' && d > 0) d-- }
    depth = Math.max(depth, m)
    if (unitId(u.kind, treeOf(u.pieces)) === u.id) same++
    else if (differ.length < 5) differ.push([f, u.ord, u.kind])
  }
}
console.log(JSON.stringify({ dumps: readdirSync(DIR).filter(x => x.endsWith('.prepare.json')).length, units, same, deepest: depth, differ }))

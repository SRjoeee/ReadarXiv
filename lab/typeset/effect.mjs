// lab/typeset/effect.mjs <dumps> <dumps with today's value> [--name=<correction>]: a named correction's effect (the
// coordinator's ruling: a correction is not accepted by its input count alone). Two runs of gate-l1.mjs on the parts, the
// second with today's value of the correction's input substituted in every member (--subst=…), everything else the part's;
// each unit whose laid result differs between the two, classed by how: laid in one run only (left the original's), its lines
// broken elsewhere (another count, or the same count and another text a line), its size, its lead, else its lines moved (the
// largest move of an end or a baseline). Three examples a class, each as a crop's coordinates: pair, page, ord, kind and the
// box its lines cover in either run [x0, y0, x1, y1] (y up, PDF units of arXiv's page), with the first difference.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const [A, B] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const name = process.argv.find((a) => a.startsWith('--name='))?.slice(7) ?? 'the correction'
const read = (d, f) => JSON.parse(readFileSync(join(d, 'reader', f), 'utf8'))
const classes = new Map(),
  examples = new Map()
let units = 0,
  pairs = 0
const add = (k, ex) => {
  classes.set(k, (classes.get(k) ?? 0) + 1)
  if ((examples.get(k)?.length ?? 0) < 3) (examples.get(k) ?? examples.set(k, []).get(k)).push(ex)
}
/** the box a unit's lines cover on a page, its size's band about each baseline (the laid text's) */
const boxOf = (u, page) => {
  const ls = u.lines.filter((l) => l.page === page)
  if (!ls.length) return null
  const s = u.size ?? 10
  return [
    Math.min(...ls.map((l) => l.x0)),
    Math.min(...ls.map((l) => l.baseline - 0.25 * s)),
    Math.max(...ls.map((l) => l.x1)),
    Math.max(...ls.map((l) => l.baseline + 0.75 * s)),
  ].map((v) => Math.round(v * 100) / 100)
}
const union = (a, b) => (!a ? b : !b ? a : [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])])
for (const f of readdirSync(join(A, 'reader')).sort()) {
  pairs++
  const a = read(A, f),
    b = read(B, f)
  const pair = f.replace(/\.reader\.json$/, '')
  const mine = new Map(a.units.map((u) => [u.ord, u])),
    theirs = new Map(b.units.map((u) => [u.ord, u]))
  for (const ord of new Set([...mine.keys(), ...theirs.keys()])) {
    units++
    const x = mine.get(ord),
      y = theirs.get(ord)
    const u = x ?? y
    const page = u.lines[0]?.page ?? 0
    const ex = (d) => `${pair} p${page} ord ${ord} ${u.kind} [${union(x && boxOf(x, page), y && boxOf(y, page))}]: ${d}`
    if (!x || !y) {
      add(x ? `left the original’s with today’s value` : `laid only with today’s value`, ex(x ? 'laid with the part’s' : 'laid with today’s'))
      continue
    }
    if (x.lines.length !== y.lines.length) {
      add('lines broken elsewhere: another count', ex(`${x.lines.length} lines against ${y.lines.length}`))
      continue
    }
    const j = x.lines.findIndex((l, k) => l.text !== y.lines[k].text)
    if (j >= 0) {
      add('lines broken elsewhere: the same count', ex(`line ${j}: ${JSON.stringify(x.lines[j].text.slice(-12))} against ${JSON.stringify(y.lines[j].text.slice(-12))}`))
      continue
    }
    if (Math.abs((x.size ?? 0) - (y.size ?? 0)) > 0.01) {
      add('size', ex(`${x.size} against ${y.size}`))
      continue
    }
    if (Math.abs((x.leading ?? 0) - (y.leading ?? 0)) > 0.001) {
      add('lead', ex(`${x.leading} against ${y.leading}`))
      continue
    }
    let far = 0,
      at = ''
    x.lines.forEach((l, k) => {
      const m = y.lines[k]
      for (const key of ['x0', 'x1', 'baseline']) {
        const d = Math.abs(l[key] - m[key])
        if (d > far) {
          far = d
          at = `line ${k} ${key} ${l[key]} against ${m[key]}`
        }
      }
    })
    const el = JSON.stringify(x.elements ?? []) !== JSON.stringify(y.elements ?? [])
    if (far > 0.01) add(far <= 0.1 ? 'lines moved at most 0.1 pt' : far <= 1 ? 'lines moved at most 1 pt' : 'lines moved more than 1 pt', ex(at))
    else if (el) add('elements moved', ex('an element’s place'))
  }
}
const changed = [...classes.values()].reduce((s, n) => s + n, 0)
console.log(`${name}: ${pairs} pairs, ${units} units; ${changed} laid otherwise with today’s value`)
for (const [k, n] of [...classes].sort((p, q) => q[1] - p[1])) {
  console.log(`  ${n} ${k}`)
  for (const e of examples.get(k)) console.log(`      ${e}`)
}

// lab/typeset/served-check.mjs [<pair>…]: the served measurer (served-metrics.mjs) against the reader's own measures, the
// tap's metrics tables (baseline/tap/metrics/<pair>.metrics.json.gz: every first measure of a (canvas font, text) of today's
// run, at 100 px). For each table entry the measurer's width and ink against the recorded ones: equal within 1/1000 px at
// 100 px (a hundred-thousandth of the size; the residue of Chrome's float32 sums of advances), off, or not measurable (a
// character no served face holds, which Chrome sets in a system font). Prints the counts, by family, and the first examples
// of each class. Run from the worktree's root: node --import tsx lab/typeset/served-check.mjs
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readGz, TAP } from '../../packages/typeset/tests/replay/tap.ts'
import { servedMetrics } from './served-metrics.mjs'

const named = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const pairs = named.length ? named : readdirSync(join(TAP, 'metrics')).map((f) => f.replace(/\.metrics\.json\.gz$/, '')).sort()
const M = servedMetrics()
const count = { widths: 0, equal: 0, off: 0, unserved: 0, inkEqual: 0, inkOff: 0, rights: 0, rightEqual: 0 }
const byFamily = new Map()
const examples = new Map()
const seen = new Set()
const note = (cls, x) => {
  const l = examples.get(cls) ?? examples.set(cls, []).get(cls)
  if (l.length < 4) l.push(x)
}
const fam = (font) => /"([^"]+)"/.exec(font)?.[1] ?? font
let worst = 0
for (const pair of pairs) {
  const T = readGz(join(TAP, 'metrics', `${pair}.metrics.json.gz`))
  for (const [font, text, w, a, d] of T.widths) {
    const k = `${font}\u0000${text}`
    if (seen.has(k)) continue
    seen.add(k)
    count.widths++
    const f = byFamily.get(fam(font)) ?? byFamily.set(fam(font), { n: 0, equal: 0, off: 0, unserved: 0 }).get(fam(font))
    f.n++
    let m
    try {
      m = M.advance(font, 100, text)
    } catch (e) {
      if (e?.name !== 'Unserved') throw e
      count.unserved++
      f.unserved++
      note('unserved', `${font} ${JSON.stringify(text)}`)
      continue
    }
    if (Math.abs(m - w) <= 1e-3) {
      count.equal++
      f.equal++
      worst = Math.max(worst, Math.abs(m - w))
    } else {
      count.off++
      f.off++
      note(`off ${fam(font)}`, `${font} ${JSON.stringify(text)}: ${w} against ${m}`)
    }
    const [ia, id] = M.ink(font, 100, text)
    if (Math.abs(ia - a) <= 1e-2 && Math.abs(id - d) <= 1e-2) count.inkEqual++
    else {
      count.inkOff++
      note('ink off', `${font} ${JSON.stringify(text)}: ${a},${d} against ${ia},${id}`)
    }
  }
  for (const [font, text, r] of T.rights ?? []) {
    if (r === null) continue
    count.rights++
    try {
      if (Math.abs(M.ink(font, 100, text)[2] - r) <= 1e-2) count.rightEqual++
      else note('right off', `${font} ${JSON.stringify(text)}: ${r} against ${M.ink(font, 100, text)[2]}`)
    } catch {}
  }
}
console.log(JSON.stringify({ pairs: pairs.length, ...count, worstEqual: worst }))
for (const [k, v] of [...byFamily].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${k}: ${JSON.stringify(v)}`)
for (const [k, v] of examples) console.log(`${k}:\n    ${v.join('\n    ')}`)

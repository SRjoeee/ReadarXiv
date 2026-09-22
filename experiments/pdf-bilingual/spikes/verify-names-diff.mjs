// The A/B of verify-figure-names.mjs compared: per paper, the labels the rule now leaves as they are (drawn before
// with the translation shown here, not drawn after), labels drawn after and not before (should be none), and labels
// on both sides whose translation differs (the engine's own variation; should be few).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const root = new URL('..', import.meta.url).pathname
// several runs of one build: per figure the run that drew the most labels, since a figure read while its SVG was
// still loading draws only part of them (a race of the extension's own, seen in one run of the baseline)
const load = (...labels) => {
  const runs = labels.map(l => new Map(JSON.parse(readFileSync(join(root, `out/verify-names-${l}.json`), 'utf8')).map(p => [p.id, p])))
  const out = new Map()
  for (const [id, first] of runs[0]) {
    const all = runs.map(r => r.get(id)).filter(p => p && !p.error)
    if (!all.length) { out.set(id, first); continue }
    const figures = all[0].figures.map((f, k) => all.map(p => p.figures[k]).filter(Boolean).reduce((a, b) => (b.labels.length > a.labels.length ? b : a)))
    out.set(id, { ...all[0], names: all.map(p => p.names).filter(Boolean), figures })
  }
  return out
}
const [B, A] = (process.env.RUNS ?? 'before,before2|after1').split('|').map(x => x.split(','))
const before = load(...B), after = load(...A)
for (const [id, p] of after) if (p.names?.length) console.log('trace', id, p.names.join(' / '))
const count = xs => { const m = new Map(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return m }
let kept = 0, added = 0, differ = 0, same = 0
const keptAll = new Map()
for (const [id, b] of before) {
  const a = after.get(id)
  if (!a || b.error || a.error) { console.log(id, 'missing', b.error ?? a?.error ?? ''); continue }
  const figs = new Map(a.figures.map(f => [f.id, f]))
  const keptHere = [], addedHere = [], differHere = []
  for (const fb of b.figures) {
    const fa = figs.get(fb.id) ?? { labels: [] }
    const was = new Map(fb.labels.map(l => [l.source, l.text])), now = new Map(fa.labels.map(l => [l.source, l.text]))
    for (const [s, t] of was) { if (!now.has(s)) keptHere.push([s, t]); else if (now.get(s) !== t) differHere.push([s, t, now.get(s)]); else same++ }
    for (const [s, t] of now) if (!was.has(s)) addedHere.push([s, t])
  }
  kept += keptHere.length; added += addedHere.length; differ += differHere.length
  console.log(`== ${id}: kept ${keptHere.length}, added ${addedHere.length}, differ ${differHere.length}`)
  for (const [s, t] of keptHere) { keptAll.set(s, t); }
  console.log('  kept:', [...count(keptHere.map(([s, t]) => `${s} (was ${t})`))].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(' | '))
  if (addedHere.length) console.log('  added:', addedHere.map(([s, t]) => `${s} → ${t}`).join(' | '))
  if (differHere.length) console.log('  differ:', differHere.map(([s, t, u]) => `${s}: ${t} / ${u}`).join(' | '))
}
console.log({ kept, added, differ, same, distinctKept: keptAll.size })

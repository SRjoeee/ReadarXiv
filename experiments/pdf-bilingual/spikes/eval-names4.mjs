// The indexed name rule (poc-reader/names.mjs) against the rule it would replace (isName with capitals the prose writes
// in lower case taken as words, eval-names3.mjs), on the same boxes and the same hand verdicts: per language, the boxes
// each keeps that the engine changed — saves (names) and spoils (words) — and the boxes the two disagree on.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { nameEvidence, isName } from '../poc-reader/names.mjs'
import { capsCommon, WORDS } from './eval-names3.mjs'
const root = new URL('..', import.meta.url).pathname
const papers = new Map(JSON.parse(readFileSync(join(root, 'out/eval-labels.json'), 'utf8')).map(p => [p.id, p.prose]))
const evidence = new Map([...papers].map(([id, prose]) => [id, nameEvidence(prose)]))
const norm = s => (s ?? '').replace(/\s+/g, '').replace(/[，,。.、：:;；（）()「」]/g, '').toLowerCase()
const same = (a, b) => norm(a) === norm(b)
const onlyNew = new Map(), onlyOld = new Map()
for (const L of ['zh', 'ja', 'de']) {
  const rows = JSON.parse(readFileSync(join(root, `out/eval-join2-${L}.json`), 'utf8')).rows['10-dedupe']
  const t0 = performance.now()
  const flagged = rows.filter(r => isName(r.text, evidence.get(r.id)))
  const ms = performance.now() - t0
  const changed = flagged.filter(r => !same(r.alone, r.text))
  const saves = changed.filter(r => !WORDS.has(r.text)), spoils = changed.filter(r => WORDS.has(r.text))
  console.log(`${L}: kept ${flagged.length}, changed ${changed.length}: saves ${saves.length}, spoils ${spoils.length} (${ms.toFixed(1)} ms for ${rows.length} boxes)`)
  for (const r of rows) {
    const a = isName(r.text, evidence.get(r.id)), b = capsCommon(r.text, papers.get(r.id))
    if (a && !b) onlyNew.set(r.text, { ...(onlyNew.get(r.text) ?? {}), [L]: r.alone })
    if (b && !a) onlyOld.set(r.text, { ...(onlyOld.get(r.text) ?? {}), [L]: r.alone })
  }
}
console.log('--- kept only by the indexed rule'); for (const [t, v] of onlyNew) console.log(' ', JSON.stringify(t), JSON.stringify(v))
console.log('--- kept only by the old rule'); for (const [t, v] of onlyOld) console.log(' ', JSON.stringify(t), JSON.stringify(v))

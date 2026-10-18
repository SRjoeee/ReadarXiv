// lab/pdf/spikes/pack-recut.mjs
// A pack output's translation carried to another cut of its paper's units (a front-end change such as F3's texorpdfstring): the units
// whose source is the old record's keep their entry as it was (table groups and all; hash, or the same source with its pairs
// renumbered, cache.mjs seedFrom), the others are sent to Microsoft with the project's User-Agent, two requests at a time, and
// recorded as the pipeline records them; units.json is the layer's pieces of the new record. Without --send nothing is sent and the
// texts that would be are printed. The references and the geometry follow with spikes/layer-cut.mjs, the layout file with
// layer-fixtures.mjs --engine.
//   tsx lab/pdf/spikes/pack-recut.mjs <source.gz> <old fixture folder (record.json, units.json)> <out folder> [--send]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { openPaper, keptFor, PIPELINE_VERSION } from '../../../src/pdf-reader/engine/pipeline/live.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/source/tar.mjs'
import { seedFrom, sourceHash, unitsOf } from '../../../src/pdf-reader/engine/pipeline/cache.mjs'
import { kOfSource, trPiecesOf } from '../../../src/pdf-reader/engine/layer/pieces.mjs'
import { LAYOUT } from '../../../src/pdf-reader/engine/layout/file.mjs'
import { MICROSOFT_LANG, plainSource, translateTexts, translateUnits } from '../../../src/pdf-reader/engine/translate/mt.mjs'
import { execFileSync } from 'node:child_process'
const [src, oldDir, outDir] = process.argv.slice(2), SEND = process.argv.includes('--send'), target = 'zh'
const UA = 'ReadarXiv/0.1 (+https://readarxiv.org; research)'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const sent = []
async function microsoft(texts, to) {
  sent.push(...texts)
  if (!SEND) return texts.map(() => null)
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`https://edge.microsoft.com/translate/translatetext?${new URLSearchParams({ from: '', to: MICROSOFT_LANG[to] ?? to, isEnterpriseClient: 'false' })}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify(texts) })
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      return json.map(item => {
        const t = item?.translations?.[0]
        if (typeof t?.text !== 'string') return null
        const s = t.sentLen
        return { text: t.text, by: 'microsoft', ...(Array.isArray(s?.srcSentLen) && Array.isArray(s?.transSentLen) ? { alignment: { source: s.srcSentLen, target: s.transSentLen } } : {}) }
      })
    } catch (e) { if (attempt === 3) throw e; await sleep(1500 * (attempt + 1)) }
  }
}
const paper = openPaper((await unpackSource(new Uint8Array(readFileSync(src)))).files)
const hashes = await Promise.all(paper.units.map(sourceHash))
const oldRecord = JSON.parse(readFileSync(join(oldDir, 'record.json'), 'utf8')), oldUnits = JSON.parse(readFileSync(join(oldDir, 'units.json'), 'utf8'))
const kept = keptFor(paper, target)
const { seed } = await seedFrom(oldRecord, paper.units)
const byHash = new Map(oldRecord.units.map(u => [u.hash, u]))
const used = new Set(), entries = new Array(paper.units.length).fill(null), todoIdx = []
// the unseen units: those no old entry (by hash, or by source with its pairs renumbered) answers, and not kept
for (let i = 0; i < paper.units.length; i++) {
  const h = hashes[i], o = byHash.get(h)
  if (o) { entries[i] = { ...o }; used.add(o); continue }
  if (seed.has(i)) continue
  if (!kept.has(paper.units[i])) todoIdx.push(i)
}
// the renumbered: the old entry of the same source, in document order, whose translation seedFrom renumbered
const bySrc = new Map()
for (const o of oldRecord.units) if (!used.has(o) && typeof o.src === 'string') (bySrc.get(o.src) ?? bySrc.set(o.src, []).get(o.src)).push(o)
for (let i = 0; i < paper.units.length; i++) {
  if (entries[i] || !seed.has(i)) continue
  const list = bySrc.get(plainSource(paper.units[i])) ?? []
  const o = list.find(x => !used.has(x))
  if (!o) throw new Error(`unit ${i}: seeded but no old entry of its source`)
  used.add(o)
  entries[i] = { ...o, hash: hashes[i], pieces: seed.get(i).pieces }
}
console.log('units', paper.units.length, 'old entries kept as they were', entries.filter(Boolean).length, 'todo', todoIdx.length, 'kept (no entry yet)', paper.units.filter((u, i) => !entries[i] && kept.has(u)).length)
const todo = todoIdx.map(i => paper.units[i])
const t0 = Date.now()
const r = await translateUnits(todo, texts => translateTexts(texts, target, { parallel: 2, send: microsoft }), 'markers')
console.log('texts sent:', sent.length, JSON.stringify(sent.map(t => t.length)))
if (!SEND) { for (const t of sent) console.log(JSON.stringify(t).slice(0, 300)); process.exit(0) }
const results = new Map(seed)
paper.units.forEach((u, i) => { const x = r.results.get(u); if (x) results.set(i, { ...x, tried: 'microsoft' }) })
const fresh = JSON.parse(JSON.stringify(unitsOf(paper.units, kept, hashes, results)))
for (const i of todoIdx) entries[i] = fresh[i]
for (let i = 0; i < entries.length; i++) if (!entries[i]) entries[i] = fresh[i]   // kept units with no old entry
const diffs = []
for (let i = 0; i < entries.length; i++) if (!isDeepStrictEqual(JSON.parse(JSON.stringify(entries[i])), fresh[i]) && !todoIdx.includes(i)) diffs.push(i)
console.log('carried entries that differ from a fresh seed (groups and the like, kept as they were):', diffs.length)
const record = { ...oldRecord, units: entries }
const { seed: seed2 } = await seedFrom({ units: record.units }, paper.units)
const units = []
for (const [i, s] of [...seed2].sort((a, b) => a[0] - b[0])) {
  const pieces = trPiecesOf(s.pieces, kOfSource(paper.units[i].pieces))
  if (!pieces) continue
  const tr = s.sentences?.tr
  const group = record.units[i].group
  units.push({ id: i, pieces, sentences: Array.isArray(tr) ? [...tr] : null, state: s.state, by: s.by ?? null, ...(group ? { group } : {}) })
}
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const states = {}
for (const e of units) states[e.state] = (states[e.state] ?? 0) + 1
const out = { ...oldUnits, engine: head, pipeline: PIPELINE_VERSION, layout: LAYOUT, made: new Date().toISOString(), states, from: { carried: paper.units.length - todoIdx.length, sent: todoIdx.length, endpoint: 'edge.microsoft.com/translate/translatetext', how: r.how, ms: Date.now() - t0 }, units }
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'record.json'), JSON.stringify(record))
writeFileSync(join(outDir, 'units.json'), JSON.stringify(out))
console.log('written', outDir, 'units.json entries', units.length, 'states', JSON.stringify(states), 'how', JSON.stringify(r.how))

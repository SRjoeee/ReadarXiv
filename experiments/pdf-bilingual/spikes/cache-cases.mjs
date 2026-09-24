// The reader's side of its cache of compiled translations (REPORT, eighteenth addendum), without a browser: the seed a
// translation made again starts from, the units a record keeps, when a run writes, and runLive over a fake compiler —
// a preview held while a unit has no translation, and nothing compiled when nothing changed. Exits non-zero on a failure.
// Build lib/axt first: node spikes/build-shared.mjs
import assert from 'node:assert/strict'
import { decideWrite, knownMarks, seedFrom, sourceHash, unitsOf } from '../poc-reader/cache.mjs'
import { openPaper, runLive } from '../poc-reader/live.mjs'
import { translateUnits } from '../poc-reader/mt.mjs'

const tex = paras => new Map([['main.tex', new TextEncoder().encode(`\\documentclass{article}\n\\begin{document}\n${paras.join('\n\n')}\n\\end{document}\n`)]])
const PARAS = ['The first paragraph of the paper says something here.', 'The second paragraph of the paper says more.']
/** a compiler that sets anything and counts its calls; a final is one with rerun */
function compiler() {
  const calls = []
  return { calls, compile: async req => { calls.push(req); return { ok: true, pdf: new Uint8Array([1, 2, 3]), log: '', ms: 1 } } }
}
const echo = by => async texts => texts.map(text => ({ text, by }))
/** a seed as a run by `translate` leaves it: its results' pieces (a source's own pieces carry no translation marks) */
async function seedOf(paper, translate, by) {
  const { results } = await translateUnits(paper.units, translate, 'markers')
  return new Map(paper.units.map((u, i) => [i, { pieces: results.get(u).pieces, by, tried: by, state: 'whole' }]))
}
const cases = []

cases.push(['a seed is matched by the source, whatever the index; a unit changed has none', async () => {
  // the middle and last paragraphs move down one place; the first is changed, and one is new. A unit's pieces keep the
  // white space at its ends, so the ones matched stay between the same neighbours' kind of breaks
  const a = openPaper(tex(['The opening paragraph as it was.', PARAS[0], PARAS[1]])).units
  const b = openPaper(tex(['The opening paragraph, changed.', 'A paragraph new here.', PARAS[0], PARAS[1]])).units
  const hashes = await Promise.all(a.map(sourceHash))
  const record = { units: a.map((u, i) => ({ kind: u.kind, src: '', hash: hashes[i], pieces: u.pieces, by: 'A', tried: 'A', state: 'whole' })) }
  const { seed } = await seedFrom(record, b)
  assert.deepEqual([...seed.keys()], [2, 3])
}])
cases.push(['the units a record keeps: kept names, a result, a seed kept with the new try', async () => {
  const paper = openPaper(tex(PARAS)), us = paper.units
  const hashes = await Promise.all(us.map(sourceHash))
  const results = new Map([[0, { pieces: us[0].pieces, state: 'whole', by: 'B', tried: 'B' }], [1, { pieces: us[1].pieces, state: 'none', by: 'A', tried: 'B' }]])
  const out = unitsOf(us, new Set(), hashes, results)
  assert.deepEqual(out.map(u => [u.state, u.by, u.tried]), [['whole', 'B', 'B'], ['none', 'A', 'B']])
  assert.ok(out[0].tr && out[0].src)
}])
cases.push(['when a run writes: a settled final in full, provenance alone, or nothing', () => {
  const units = [{ hash: 'h', state: 'whole', by: 'B', tried: 'B' }]
  assert.equal(decideWrite({ result: { settled: true, changed: true }, cached: null, units }), 'full')
  assert.equal(decideWrite({ result: { settled: false, changed: true }, cached: null, units }), null)
  assert.equal(decideWrite({ result: { settled: false, changed: false }, cached: { units: [{ hash: 'h', state: 'whole', by: 'B', tried: 'A' }] }, units }), 'provenance')
  assert.equal(decideWrite({ result: { settled: false, changed: false }, cached: { units }, units }), null)
}])
cases.push(['a copy\'s marks are known only when it has some, on the same pipeline (final review)', () => {
  // a copy whose marked original failed has none: the run compiles the original again rather than go on without
  assert.equal(knownMarks({ marks: [] }, true), null)
  assert.equal(knownMarks({ marks: [['1s', {}]] }, false), null)
  assert.equal(knownMarks({ marks: [['1s', {}]] }, true)?.size, 1)
  assert.equal(knownMarks(undefined, true), null)
}])
cases.push(['a seeded run with nothing changed and the pipeline current compiles nothing', async () => {
  const paper = openPaper(tex(PARAS)), c = compiler()
  const seed = await seedOf(paper, echo('B'), 'B')
  const r = await runLive(paper, { lang: 'zh', compile: c.compile, translate: echo('B'), format: 'markers', seed, marks: new Map(), identity: 'B', pipelineCurrent: true })
  assert.equal(r.changed, false)
  assert.equal(c.calls.filter(q => q.rerun).length, 0)
}])
cases.push(['with the pipeline changed, the final is compiled even so', async () => {
  const paper = openPaper(tex(PARAS)), c = compiler()
  const seed = await seedOf(paper, echo('B'), 'B')
  const r = await runLive(paper, { lang: 'zh', compile: c.compile, translate: echo('B'), format: 'markers', seed, marks: new Map(), identity: 'B', pipelineCurrent: false })
  assert.equal(r.settled, true)
  assert.ok(c.calls.some(q => q.rerun))
}])
cases.push(['a seeded preview waits until every unit has a translation', async () => {
  const paper = openPaper(tex(PARAS)), c = compiler(), shown = []
  // unit 1 has no seed, and the engine cannot take it: no preview may show it in the source
  const seed = new Map([[0, { pieces: paper.units[0].pieces, by: 'A', tried: 'A', state: 'whole' }]])
  const translate = async texts => texts.map(text => (text.includes('second') ? null : { text, by: 'B' }))
  await runLive(paper, { lang: 'zh', compile: c.compile, translate, format: 'markers', seed, marks: new Map(), identity: 'B', pipelineCurrent: true, onUpdate: u => shown.push(u.final) })
  assert.deepEqual(shown.filter(f => !f), [])
}])

let failed = 0
for (const [name, run] of cases) {
  try { await run(); console.log('ok  ', name) } catch (e) { failed++; console.log('FAIL', name, '—', e.message.split('\n')[0]) }
}
process.exitCode = failed ? 1 : 0

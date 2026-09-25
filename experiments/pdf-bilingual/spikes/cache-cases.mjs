// The reader's side of its cache of compiled translations (REPORT, eighteenth addendum), without a browser: the seed a
// translation made again starts from, the units a record keeps, when a run writes, and runLive over a fake compiler —
// a preview held while a unit has no translation, and nothing compiled when nothing changed. Exits non-zero on a failure.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/cache-cases.mjs   (from the repository root: the engine imports the extension's source by @/)
import assert from 'node:assert/strict'
import { decideWrite, knownMarks, seedFrom, sourceHash, unitsOf } from '../../../src/pdf-reader/engine/cache.mjs'
import { compilerKeeper, openPaper, runLive } from '../../../src/pdf-reader/engine/live.mjs'
import { translateUnits } from '../../../src/pdf-reader/engine/mt.mjs'

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
  assert.equal(decideWrite({ result: { settled: true, changed: true }, cached: null, units, shown: true }), 'full')
  // a final that settled but could not be put on screen: its right side's marks would be the old document's (Devin on #298)
  assert.equal(decideWrite({ result: { settled: true, changed: true }, cached: null, units, shown: false }), null)
  assert.equal(decideWrite({ result: { settled: false, changed: true }, cached: null, units }), null)
  assert.equal(decideWrite({ result: { settled: false, changed: false }, cached: { units: [{ hash: 'h', state: 'whole', by: 'B', tried: 'A' }] }, units }), 'provenance')
  assert.equal(decideWrite({ result: { settled: false, changed: false }, cached: { units }, units }), null)
}])
cases.push(['repeated paragraphs: a change to any one\'s provenance is written (Devin on #298)', () => {
  // two units of one source, as table cells often are: the first was lost, the second came back; now both are whole
  const cached = { units: [{ hash: 'h', state: 'lost', tried: 'B' }, { hash: 'h', state: 'whole', by: 'B', tried: 'B' }] }
  const units = [{ hash: 'h', state: 'whole', by: 'B', tried: 'B' }, { hash: 'h', state: 'whole', by: 'B', tried: 'B' }]
  assert.equal(decideWrite({ result: { settled: false, changed: false }, cached, units }), 'provenance')
}])
cases.push(['repeated paragraphs: the seed is the best translation of their source, whole before partial', async () => {
  const us = openPaper(tex(PARAS)).units
  const h = await sourceHash(us[0])
  const whole = [{ t: 'text', s: 'whole', tr: true }], partial = [{ t: 'text', s: 'partial', tr: true }]
  const record = { units: [{ hash: h, pieces: whole, by: 'A', tried: 'A', state: 'whole' }, { hash: h, pieces: partial, by: 'B', tried: 'B', state: 'partial' }] }
  const { seed } = await seedFrom(record, [us[0]])
  assert.deepEqual([seed.get(0).pieces, seed.get(0).state], [whole, 'whole'])
}])
cases.push(['a copy without marks: a run that changes nothing compiles the marked original, and the marks are written (Devin on #298)', async () => {
  const paper = openPaper(tex(PARAS)), c = compiler(), got = []
  const seed = await seedOf(paper, echo('B'), 'B')
  const r = await runLive(paper, { lang: 'zh', compile: c.compile, translate: echo('B'), format: 'markers', seed, marks: null, identity: 'B', pipelineCurrent: true, onOriginal: o => got.push(o) })
  assert.equal(r.changed, false)
  assert.equal(got.length, 1, 'the marked original is compiled')
  const units = [{ hash: 'h', state: 'whole', by: 'B', tried: 'B' }]
  assert.equal(decideWrite({ result: r, cached: { units, marks: [] }, units, marks: [['1s', {}]] }), 'provenance')
  assert.equal(decideWrite({ result: r, cached: { units, marks: [['1s', {}]] }, units, marks: [['1s', {}]] }), null)
}])
cases.push(['a seeded run compiles a preview only for a batch that changed what is typeset (Devin on #298)', async () => {
  // three long paragraphs, one batch each; the engine changes the first alone, and gives the others back as seeded
  const long = n => `Paragraph ${n} ${'words of the paper that go on. '.repeat(230)}`
  const paper = openPaper(tex([long(1), long(2), long(3)])), c = compiler(), events = []
  const seed = await seedOf(paper, echo('B'), 'B')
  const translate = async texts => texts.map(text => ({ text: text.includes('Paragraph 1') ? text.replace('Paragraph', 'Absatz') : text, by: 'B' }))
  await runLive(paper, { lang: 'zh', compile: c.compile, translate, format: 'markers', seed, marks: new Map(), identity: 'B', pipelineCurrent: true, note: e => events.push(e) })
  assert.equal(events.filter(e => e === 'translated').length, 3, 'one batch per paragraph')
  assert.equal(events.filter(e => e === 'preview').length, 1)
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

cases.push(['a failure of the service stops the run: the batches after it are not sent (§10.3)', async () => {
  const long = n => `Paragraph ${n} ${'words of the paper that go on. '.repeat(230)}`
  const paper = openPaper(tex([long(1), long(2), long(3)])), c = compiler(), events = []
  let calls = 0
  // the first batch comes back; the second fails as a network down does (engine.mjs: partial, lost)
  const translate = async texts => {
    calls++
    if (calls === 1) return texts.map(text => ({ text, by: 'B' }))
    throw Object.assign(new Error('network'), { kind: 'network', partial: texts.map(() => null), lost: new Set(texts.keys()) })
  }
  const r = await runLive(paper, { lang: 'zh', compile: c.compile, translate, format: 'markers', marks: new Map(), identity: 'B', note: (e, d) => events.push([e, d]) })
  assert.equal(calls, 2, 'the third batch is not sent')
  assert.equal(r.stopped, 'network')
  assert.equal(r.missing, 2)
  assert.deepEqual(events.filter(([e]) => e === 'stopped').map(([, d]) => d), [{ kind: 'network', untried: 1 }])
  assert.ok(c.calls.some(q => q.rerun), 'what there is is compiled')
}])
cases.push(['nothing translated when the service fails: nothing is compiled, and the run says why', async () => {
  const paper = openPaper(tex(PARAS)), c = compiler()
  const translate = async texts => { throw Object.assign(new Error('network'), { kind: 'network', partial: texts.map(() => null), lost: new Set(texts.keys()) }) }
  const r = await runLive(paper, { lang: 'zh', compile: c.compile, translate, format: 'markers', marks: null, identity: 'B' })
  assert.equal(r.stopped, 'network')
  assert.equal(r.translated, 0)
  assert.equal(r.missing, paper.units.length - paper.kept.size)
  assert.equal(c.calls.filter(q => q.rerun).length, 0, 'no final, no marked original')
}])
cases.push(['a key refused midway stops the run as a failure of the service does, and the run resolves', async () => {
  const long = n => `Paragraph ${n} ${'words of the paper that go on. '.repeat(230)}`
  const paper = openPaper(tex([long(1), long(2), long(3)])), c = compiler()
  let calls = 0
  const translate = async texts => { if (++calls === 1) return texts.map(text => ({ text, by: 'B' })); throw Object.assign(new Error('invalid api key'), { kind: 'auth' }) }
  const r = await runLive(paper, { lang: 'zh', compile: c.compile, translate, format: 'markers', marks: new Map(), identity: 'B' })
  assert.equal(r.stopped, 'auth')
  assert.equal(calls, 2)
  assert.equal(r.missing, 2)
}])
cases.push(['a seeded paragraph whose new try failed keeps its old translation, and is not missing', async () => {
  const paper = openPaper(tex(PARAS)), c = compiler()
  const seed = await seedOf(paper, echo('A'), 'A')
  const translate = async texts => { throw Object.assign(new Error('network'), { kind: 'network', partial: texts.map(() => null), lost: new Set(texts.keys()) }) }
  const r = await runLive(paper, { lang: 'zh', compile: c.compile, translate, format: 'markers', seed, marks: new Map(), identity: 'B', pipelineCurrent: true })
  assert.equal(r.stopped, 'network')
  assert.equal(r.missing, 0)
  assert.ok([...r.results.values()].every(x => x.pieces && x.state === 'lost'))
}])

/** a compiler whose calls answer as `answers` says, one by one (then as compiler() does): a timeout is the TeX page's reply to BusyTeX giving up */
function slow(...answers) {
  const c = compiler(), base = c.compile
  return { calls: c.calls, compile: async req => { const a = answers.shift(); if (a === 'timeout') { c.calls.push(req); return { ok: false, error: 'Error: Compilation timeout', log: '', ms: 180000 } } return base(req) } }
}
cases.push(['a preview that did not answer keeps the strategy: the machine was slow, not the strategy wrong', async () => {
  const paper = openPaper(tex(PARAS)), events = []
  // the fonts probe answers, then the first preview times out
  const c = slow('ok', 'timeout')
  const r = await runLive(paper, { lang: 'zh', compile: c.compile, translate: echo('B'), format: 'markers', marks: new Map(), identity: 'B', note: e => events.push(e) })
  assert.ok(c.calls.filter(q => !q.rerun).length >= 2, `a preview was asked: ${c.calls.map(q => (q.rerun ? 'final' : 'draft')).join(' ')}`)
  assert.equal(events.filter(e => e === 'next strategy').length, 0)
  assert.equal(r.settled, true)
}])
cases.push(['a final that did not answer is tried again with the same strategy, once', async () => {
  const paper = openPaper(tex(PARAS)), events = []
  const c = slow('ok', 'ok', 'timeout')
  const r = await runLive(paper, { lang: 'zh', compile: c.compile, translate: echo('B'), format: 'markers', marks: new Map(), identity: 'B', note: (e, d) => events.push([e, d?.strategy]) })
  assert.equal(events.filter(([e]) => e === 'next strategy').length, 0)
  assert.equal(events.filter(([e]) => e === 'final again').length, 1)
  assert.equal(new Set(events.filter(([e]) => e === 'final' || e === 'final again').map(([, s]) => s)).size, 1)
  assert.equal(r.settled, true)
}])
cases.push(['a final that twice did not answer ends the run with what is shown, and writes nothing', async () => {
  const paper = openPaper(tex(PARAS)), events = []
  const c = slow('ok', 'ok', 'timeout', 'timeout')
  const r = await runLive(paper, { lang: 'zh', compile: c.compile, translate: echo('B'), format: 'markers', marks: new Map(), identity: 'B', note: e => events.push(e) })
  assert.equal(events.filter(e => e === 'next strategy').length, 0)
  assert.equal(r.settled, false)
  assert.equal(c.calls.filter(q => q.rerun).length, 2)
  // a slow machine says nothing of the paper: not remembered as one that cannot be typeset
  assert.equal(r.exhausted, false)
}])
/** a compiler that sets the fonts probe and, if `own`, the paper's own source (the marked original: a rerun of a
 *  draft); every compile of the translation stops at a TeX error */
function refusing(own) {
  let n = 0
  const isOriginal = req => req.rerun && new TextDecoder('latin1').decode(req.overrides.get(req.main)).includes('{draft}{graphicx}')
  return async req => (++n === 1 || (own && isOriginal(req)) ? { ok: true, pdf: new Uint8Array([1]), log: '', ms: 1 } : { ok: false, error: 'exit 1', log: `! LaTeX Error: ${req.engine} cannot set this.`, ms: 1 })
}
cases.push(['a paper no strategy sets is told apart: every strategy tried, nothing shown, its own source set (the maintainer, 2026-09-26)', async () => {
  const paper = openPaper(tex(PARAS)), events = []
  const r = await runLive(paper, { lang: 'zh', compile: refusing(true), translate: echo('B'), format: 'markers', marks: null, identity: 'B', note: e => events.push(e) })
  assert.ok(events.includes('next strategy'), 'the chain was walked')
  assert.deepEqual([r.previews, r.settled, r.exhausted, r.originalOk], [0, false, true, true])
}])
cases.push(['every compile failing, the paper\'s own included, says nothing of the paper: the compiler or its files may be down (Codex)', async () => {
  const paper = openPaper(tex(PARAS))
  const r = await runLive(paper, { lang: 'zh', compile: refusing(false), translate: echo('B'), format: 'markers', marks: null, identity: 'B' })
  assert.deepEqual([r.exhausted, r.originalOk], [true, false])
}])

/** a compiler as BusyTeX's worker is: a compile that timed out goes on, and its output answers the next compile */
function stuckAfterTimeout(opened) {
  let owed = null, n = 0
  const inst = { id: opened.length, closed: false, compile: async req => {
    n++
    if (owed) { const out = owed; owed = null; return out }
    if (n === 1 && inst.id === 0) { owed = { ok: true, pdf: new TextEncoder().encode(`output of ${req.name}`), log: '', ms: 1 }; return { ok: false, error: 'Error: Compilation timeout', log: '', ms: 180000 } }
    return { ok: true, pdf: new TextEncoder().encode(`output of ${req.name}`), log: '', ms: 1 }
  }, close: () => { inst.closed = true } }
  opened.push(inst)
  return inst
}
cases.push(['a compile that timed out throws its compiler away: the next compile is its own, from a fresh one (Part 4\'s final review)', async () => {
  const opened = []
  const keeper = compilerKeeper(async () => stuckAfterTimeout(opened))
  const first = await keeper.compile({ name: 'preview' })
  assert.match(first.error, /Compilation timeout/)
  const next = await keeper.compile({ name: 'final' })
  assert.equal(new TextDecoder().decode(next.pdf), 'output of final')
  assert.deepEqual(opened.map(c => c.closed), [true, false])
}])
cases.push(['a compiler that does not open is opened again at the next compile', async () => {
  let tries = 0
  const keeper = compilerKeeper(async () => { if (++tries === 1) throw Object.assign(new Error('no page'), { event: 'no compiler' }); return { compile: async () => ({ ok: true, pdf: new Uint8Array([1]), log: '', ms: 1 }), close: () => {} } })
  await assert.rejects(keeper.ready(), /no page/)
  await keeper.ready()
  assert.equal((await keeper.compile({})).ok, true)
}])

let failed = 0
for (const [name, run] of cases) {
  try { await run(); console.log('ok  ', name) } catch (e) { failed++; console.log('FAIL', name, '—', e.message.split('\n')[0]) }
}
process.exitCode = failed ? 1 : 0

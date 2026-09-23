// What translateUnits (mt.mjs) sends when the engine fails, and what each unit became, with the identity that made it:
// a text the engine could not take is sent again in runs, the text pieces between its placeholders; texts lost to a
// failure of the service (a network down, a rate limit already retried) are not, since each piece would only fail again
// (Codex on #296). A unit is whole, partial, none or lost, and by the identity that answered it, MIXED when two did
// (REPORT, eighteenth addendum). Exits non-zero on a failure. Build lib/axt first: node spikes/build-shared.mjs
import assert from 'node:assert/strict'
import { translateUnits } from '../poc-reader/mt.mjs'
import { MIXED } from '../poc-reader/lib/axt/wire.mjs'

/** a unit of two text pieces around a formula */
const unit = n => ({ pieces: [{ t: 'text', s: `first part ${n} ` }, { t: 'math', s: '$x$' }, { t: 'text', s: ` second part ${n}` }] })
/** an engine: each call's texts → `answer(texts, call)`, every call kept */
function engine(answer) {
  const calls = []
  return { calls, send: async texts => { calls.push(texts); return answer(texts, calls.length) } }
}
const echo = by => texts => texts.map(text => ({ text, by }))
/**
 * An error shaped as engine.mjs's EngineError, which translateUnits reads by its fields: engine.mjs itself is not
 * imported, since lib/axt/extension.mjs runs the settings' storage when it loads and cannot load in Node
 */
class EngineError extends Error {
  constructor(kind, message, { partial, lost } = {}) { super(message); this.name = 'EngineError'; this.kind = kind; if (partial) Object.assign(this, { partial, lost }) }
}
const lostAll = texts => { throw new EngineError('network', 'offline', { partial: texts.map(() => null), lost: new Set(texts.map((_, i) => i)) }) }
const cases = []

cases.push(['a whole answer: whole, by the identity that answered', async () => {
  const u = unit(1)
  const { results } = await translateUnits([u], engine(echo('B')).send, 'markers')
  assert.deepEqual([results.get(u).state, results.get(u).by], ['whole', 'B'])
}])
cases.push(['texts lost to the service are lost, and not sent again in runs', async () => {
  const e = engine(lostAll), us = [unit(1), unit(2)]
  const { results, how } = await translateUnits(us, e.send, 'markers')
  assert.equal(e.calls.length, 1)
  assert.deepEqual(us.map(u => results.get(u).state), ['lost', 'lost'])
  assert.equal(how.error, 'network')
}])
cases.push(['a text the engine could not take goes by runs: whole when every run is back', async () => {
  const e = engine((texts, call) => (call === 1 ? texts.map(() => null) : echo('B')(texts))), u = unit(1)
  const { results } = await translateUnits([u], e.send, 'markers')
  assert.equal(e.calls.length, 2)
  assert.deepEqual([results.get(u).state, results.get(u).by], ['whole', 'B'])
}])
cases.push(['runs some of which are back: partial', async () => {
  const e = engine((texts, call) => (call === 1 ? texts.map(() => null) : texts.map((text, i) => (i === 0 ? { text, by: 'B' } : null)))), u = unit(1)
  const { results } = await translateUnits([u], e.send, 'markers')
  assert.equal(results.get(u).state, 'partial')
}])
cases.push(['runs answered by two engines: by MIXED', async () => {
  const e = engine((texts, call) => (call === 1 ? texts.map(() => null) : texts.map((text, i) => ({ text, by: i === 0 ? 'A' : 'B' })))), u = unit(1)
  const { results } = await translateUnits([u], e.send, 'markers')
  assert.deepEqual([results.get(u).state, results.get(u).by], ['whole', MIXED])
}])
cases.push(['no run back, and none lost: none', async () => {
  const e = engine(texts => texts.map(() => null)), u = unit(1)
  const { results } = await translateUnits([u], e.send, 'markers')
  assert.equal(results.get(u).state, 'none')
}])
cases.push(['what came back with a failure is kept', async () => {
  const e = engine(texts => { throw new EngineError('rate-limit', 'slow down', { partial: texts.map((text, i) => (i === 0 ? { text, by: 'B' } : null)), lost: new Set(texts.map((_, i) => i).slice(1)) }) })
  const us = [unit(1), unit(2)]
  const { results } = await translateUnits(us, e.send, 'markers')
  assert.deepEqual(us.map(u => results.get(u).state), ['whole', 'lost'])
}])
cases.push(['an engine refusing for good still stops the translation', async () => {
  const e = engine(() => { throw new EngineError('auth', 'key refused') })
  await assert.rejects(translateUnits([unit(1)], e.send, 'markers'), { kind: 'auth' })
}])

let failed = 0
for (const [name, run] of cases) {
  try { await run(); console.log('ok  ', name) } catch (e) { failed++; console.log('FAIL', name, '—', e.message.split('\n')[0]) }
}
process.exitCode = failed ? 1 : 0

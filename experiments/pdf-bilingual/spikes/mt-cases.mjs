// What translateUnits (mt.mjs) sends when the engine fails: a text the engine could not take is sent again in runs,
// the text pieces between its placeholders; texts lost to a failure of the service (a network down, a rate limit
// already retried) are not, since each piece would only fail again (Codex on #296). Exits non-zero on a failure.
// Build lib/axt first: node spikes/build-shared.mjs
import assert from 'node:assert/strict'
import { EngineError } from '../poc-reader/engine.mjs'
import { translateUnits } from '../poc-reader/mt.mjs'

/** a unit of two text pieces around a formula */
const unit = n => ({ pieces: [{ t: 'text', s: `first part ${n} ` }, { t: 'math', s: '$x$' }, { t: 'text', s: ` second part ${n}` }] })
/** an engine: each call's texts → `answer(texts, call)`, every call kept */
function engine(answer) {
  const calls = []
  return { calls, send: async texts => { calls.push(texts); return answer(texts, calls.length) } }
}
const lostAll = texts => { throw new EngineError('network', 'offline', { partial: texts.map(() => null), lost: new Set(texts.map((_, i) => i)) }) }
const cases = []

cases.push(['texts lost to the service are not sent again in runs', async () => {
  const e = engine(lostAll)
  const { translated, how } = await translateUnits([unit(1), unit(2), unit(3)], e.send, 'markers')
  assert.equal(e.calls.length, 1)
  assert.equal(translated.size, 0)
  assert.equal(how.lost, 3)
  assert.equal(how.error, 'network')
}])
cases.push(['what came back with the failure is kept', async () => {
  const e = engine(texts => { throw new EngineError('rate-limit', 'slow down', { partial: texts.map((t, i) => (i === 0 ? t.replace('first', 'erste') : null)), lost: new Set(texts.map((_, i) => i).slice(1)) }) })
  const { translated, how } = await translateUnits([unit(1), unit(2)], e.send, 'markers')
  assert.equal(e.calls.length, 1)
  assert.equal(translated.size, 1)
  assert.deepEqual([how.whole, how.lost], [1, 1])
}])
cases.push(['a text the engine could not take goes by runs', async () => {
  const e = engine((texts, call) => (call === 1 ? texts.map(() => null) : texts.map(t => `[${t}]`)))
  const { translated, how } = await translateUnits([unit(1)], e.send, 'markers')
  assert.equal(e.calls.length, 2)
  assert.equal(e.calls[1].length, 2)
  assert.equal(translated.size, 1)
  assert.equal(how.runs, 1)
}])
cases.push(['runs lost to the service leave the unit counted as lost', async () => {
  const e = engine((texts, call) => (call === 1 ? texts.map(() => null) : lostAll(texts)))
  const { how } = await translateUnits([unit(1)], e.send, 'markers')
  assert.equal(e.calls.length, 2)
  assert.deepEqual([how.runs, how.lost, how.untranslated], [0, 1, 0])
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

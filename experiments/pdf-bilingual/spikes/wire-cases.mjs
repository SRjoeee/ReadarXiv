// The tag spellings an engine's answer may use, read as the background reads them before it caches a translation
// (src/core/protector/tokens.ts): a unit's placeholders put back (mt.mjs rehydrateTags) and a figure's block cut into
// its lines (figures.mjs splitBlock). Exits non-zero on a failure. Build lib/axt first: node spikes/build-shared.mjs
import assert from 'node:assert/strict'
import { splitBlock } from '../poc-reader/figures.mjs'
import { rehydrateTags } from '../poc-reader/mt.mjs'

const unit = { slots: [{ void: { t: 'ph', src: '$x$' } }], lead: '', trail: '' }
const texts = pieces => pieces.map(p => (p.t === 'text' ? p.s : `[${p.src}]`)).join('')
const cases = []
for (const tag of ['<x id="1"/>', '<x id="1"></x>', '<x id="1"></x >', "<x id='1' />", '<x id=1></x>']) {
  cases.push([`a unit's placeholder spelt ${tag}`, () => assert.equal(texts(rehydrateTags(`before ${tag} after`, unit).pieces ?? []), 'before [$x$] after')])
  cases.push([`a figure's block cut at ${tag}`, () => assert.deepEqual(splitBlock(`first ${tag} second`, 2, 'tags'), ['first', 'second'])])
}
cases.push(['an open tag with no close is text, as the background has it', () => assert.equal(rehydrateTags('before <x id="1"> after', unit).error, 'lost placeholder')])
cases.push(["a pair's tag in a figure's block sends it box by box", () => assert.equal(splitBlock('first <t id="1">second</t>', 2, 'tags'), null)])

let failed = 0
for (const [name, run] of cases) {
  try { run(); console.log('ok  ', name) } catch (e) { failed++; console.log('FAIL', name, '—', e.message.split('\n')[0]) }
}
process.exitCode = failed ? 1 : 0
